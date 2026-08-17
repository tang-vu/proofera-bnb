"""Fund one approved ProofEra ERC-8004 wallet on BSC testnet.

The operator supplies the encrypted source keystore password through an
isolated environment variable. A public, secret-free recovery journal is
created before broadcast and is never overwritten.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from eth_account import Account
from web3 import HTTPProvider, Web3


CHAIN_ID = 97
RPC_ENDPOINT = "https://data-seed-prebsc-2-s2.binance.org:8545"
SOURCE = "0x997cD959798F7c925076eaeFF5855C5C2c1e5A49"
KEYSTORE_NAME = "UTC--2026-08-12T09-45-30.464Z--997cd959798f7c925076eaeff5855c5c2c1e5a49.keystore.json"
FUNDING_WEI = 3_000_000_000_000_000
GAS_LIMIT = 21_000
MAX_GAS_PRICE_WEI = 200_000_000
TARGETS = {
    "lp-range": "0xAd03eF7e21c35FD1446c153f6eE5e6165F696990",
    "grid-trading": "0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8",
    "yield-optimisation": "0x62Af37A6FD89374684C00e2402FD96143f96ee85",
    "health-factor": "0x708cb7F2b974d94005E762A140c469F1125e0cB4",
}


def emit(event: str, **fields: Any) -> None:
    print(json.dumps({"event": event, **fields}, separators=(",", ":")), flush=True)


def fail(message: str) -> None:
    raise RuntimeError(message)


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, separators=(",", ":"), sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute-approved", action="store_true")
    parser.add_argument("--agent-key", required=True, choices=tuple(TARGETS))
    parser.add_argument("--custody-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.execute_approved:
        fail("missing explicit --execute-approved gate")
    password = os.environ.get("DEPLOYER_KEYSTORE_PASSWORD")
    if not password:
        fail("DEPLOYER_KEYSTORE_PASSWORD is required")

    custody_dir = args.custody_dir.resolve(strict=True)
    expected_suffix = Path("ProofEra") / "wallets" / "bsc-testnet"
    if tuple(custody_dir.parts[-3:]) != tuple(expected_suffix.parts):
        fail("custody path is outside the pinned ProofEra BSC testnet location")
    keystore_path = custody_dir / KEYSTORE_NAME
    keystore = json.loads(keystore_path.read_text(encoding="utf-8"))
    private_key = bytearray(Account.decrypt(keystore, password))
    try:
        account = Account.from_key(private_key)
        if account.address.lower() != SOURCE.lower():
            fail("decrypted source does not match the approved funding wallet")

        web3 = Web3(HTTPProvider(RPC_ENDPOINT, request_kwargs={"timeout": 20}))
        if int(web3.eth.chain_id) != CHAIN_ID:
            fail("RPC returned the wrong chain ID")
        target = Web3.to_checksum_address(TARGETS[args.agent_key])
        if int(web3.eth.get_balance(target)) != 0:
            fail("target balance is nonzero; refusing duplicate or ambiguous funding")
        nonce_latest = int(web3.eth.get_transaction_count(account.address, "latest"))
        nonce_pending = int(web3.eth.get_transaction_count(account.address, "pending"))
        if nonce_latest != nonce_pending:
            fail("source has a pending transaction; refusing nonce ambiguity")
        observed_gas_price = int(web3.eth.gas_price)
        gas_price = int(observed_gas_price * 1.2)
        if gas_price > MAX_GAS_PRICE_WEI:
            fail("funding gas price exceeds the approved cap")
        required = FUNDING_WEI + GAS_LIMIT * gas_price
        if int(web3.eth.get_balance(account.address)) < required:
            fail("approved source balance is insufficient")

        transaction = {
            "chainId": CHAIN_ID,
            "nonce": nonce_latest,
            "to": target,
            "value": FUNDING_WEI,
            "gas": GAS_LIMIT,
            "gasPrice": gas_price,
            "data": b"",
        }
        signed = account.sign_transaction(transaction)
        transaction_hash = Web3.to_hex(signed.hash)
        local_app_data = os.environ.get("LOCALAPPDATA")
        if not local_app_data:
            fail("LOCALAPPDATA is unavailable")
        journal_dir = Path(local_app_data) / "ProofEra" / "erc8004-registration-journal"
        journal = journal_dir / f"fund-{args.agent_key}-{transaction_hash[2:]}.json"
        write_exclusive(
            journal,
            {
                "agentKey": args.agent_key,
                "chainId": CHAIN_ID,
                "from": account.address,
                "gasLimit": str(GAS_LIMIT),
                "gasPriceWei": str(gas_price),
                "nonce": str(nonce_latest),
                "status": "signed_before_broadcast",
                "to": target,
                "transactionHash": transaction_hash,
                "valueWei": str(FUNDING_WEI),
            },
        )
        emit(
            "signed",
            agentKey=args.agent_key,
            transactionHash=transaction_hash,
            nonce=str(nonce_latest),
            gasPriceWei=str(gas_price),
            journal=str(journal),
        )
        broadcast_hash = Web3.to_hex(web3.eth.send_raw_transaction(signed.raw_transaction))
        if broadcast_hash.lower() != transaction_hash.lower():
            fail("RPC returned a different funding transaction hash")
        receipt = web3.eth.wait_for_transaction_receipt(transaction_hash, timeout=180)
        if int(receipt.status) != 1:
            fail("funding receipt failed")
        confirmed = journal_dir / f"fund-{args.agent_key}-{transaction_hash[2:]}-confirmed.json"
        write_exclusive(
            confirmed,
            {
                "agentKey": args.agent_key,
                "blockNumber": str(receipt.blockNumber),
                "chainId": CHAIN_ID,
                "status": "confirmed",
                "transactionHash": transaction_hash,
            },
        )
        emit(
            "confirmed",
            agentKey=args.agent_key,
            transactionHash=transaction_hash,
            blockNumber=str(receipt.blockNumber),
        )
    finally:
        private_key[:] = b"\x00" * len(private_key)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("stopped", errorType=type(error).__name__, message=str(error))
        sys.exit(1)
