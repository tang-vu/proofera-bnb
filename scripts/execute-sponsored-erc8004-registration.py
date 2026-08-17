"""Execute one explicitly approved, gas-sponsored BSC testnet registration.

This operator-only runner deliberately handles one agent at a time. It binds the
first call byte-for-byte to a committed ProofEra preparation and emits only
public transaction state. The wallet password must be supplied in
``WALLET_PASSWORD`` by an isolated parent process.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from bnbagent import AgentEndpoint, ERC8004Agent, EVMWalletProvider
from bnbagent.core.contract_mixin import min_gas_price_wei


EXPECTED_CHAIN_ID = 97
EXPECTED_NETWORK = "bsc-testnet"
EXPECTED_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
MAX_GAS_LIMIT = 1_000_000
MAX_GAS_PRICE_WEI = 200_000_000
SDK_GAS_BUFFER_NUMERATOR = 12
SDK_GAS_BUFFER_DENOMINATOR = 10
EXPECTED_BUILT_WITH = "https://github.com/bnb-chain/bnbagent-sdk#v0.4.2"


def emit(event: str, **fields: Any) -> None:
    print(json.dumps({"event": event, **fields}, separators=(",", ":")), flush=True)


def fail(message: str) -> None:
    raise RuntimeError(message)


def buffered_gas(estimate: int) -> int:
    # Match SDK 0.4.2's int(estimate * 1.2) without floating point.
    return estimate * SDK_GAS_BUFFER_NUMERATOR // SDK_GAS_BUFFER_DENOMINATOR


def require_gas_bounds(web3: Any, function: Any, sender: str, step: str) -> None:
    observed_gas_price = int(web3.eth.gas_price)
    sdk_gas_price = max(
        int(observed_gas_price * 1.2),
        int(min_gas_price_wei(EXPECTED_CHAIN_ID)),
    )
    if sdk_gas_price > MAX_GAS_PRICE_WEI:
        fail(f"{step}: SDK gas price {sdk_gas_price} exceeds approved cap")

    estimate = int(function.estimate_gas({"from": sender, "value": 0}))
    gas_limit = buffered_gas(estimate)
    if gas_limit > MAX_GAS_LIMIT:
        fail(f"{step}: SDK gas limit {gas_limit} exceeds approved cap")

    emit(
        "preflight",
        step=step,
        observedGasPriceWei=str(observed_gas_price),
        sdkGasPriceWei=str(sdk_gas_price),
        gasEstimate=str(estimate),
        sdkGasLimit=str(gas_limit),
    )


def normalized_hash(value: Any) -> str:
    if hasattr(value, "hex"):
        result = value.hex()
    else:
        result = str(value)
    return result if result.startswith("0x") else f"0x{result}"


def receipt_status(receipt: Any) -> int:
    if receipt is None:
        fail("confirmed receipt is missing")
    status = receipt.get("status") if hasattr(receipt, "get") else receipt.status
    return int(status)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute-approved", action="store_true")
    parser.add_argument("--preparation", required=True, type=Path)
    parser.add_argument("--agent-key", required=True)
    parser.add_argument("--wallets-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.execute_approved:
        fail("missing explicit --execute-approved gate")

    password = os.environ.get("WALLET_PASSWORD")
    if not password:
        fail("WALLET_PASSWORD is required")

    preparation = json.loads(args.preparation.read_text(encoding="utf-8"))
    network = preparation.get("network", {})
    if network.get("chainId") != EXPECTED_CHAIN_ID:
        fail("preparation chain ID is not approved BSC testnet")
    if str(network.get("registry", "")).lower() != EXPECTED_REGISTRY.lower():
        fail("preparation registry differs from approved registry")

    matches = [agent for agent in preparation.get("agents", []) if agent.get("key") == args.agent_key]
    if len(matches) != 1:
        fail("agent key must identify exactly one prepared agent")
    prepared = matches[0]
    expected_wallet = prepared["wallet"]
    initial = prepared["initialRegistration"]
    initial_uri = initial["agentUri"]
    decoded = initial["decodedAgentUri"]

    wallet = EVMWalletProvider(
        password=password,
        address=expected_wallet,
        wallets_dir=args.wallets_dir,
    )
    if wallet.address.lower() != expected_wallet.lower():
        fail("decrypted wallet does not match prepared address")

    sdk = ERC8004Agent(wallet_provider=wallet, network=EXPECTED_NETWORK)
    if int(sdk.web3.eth.chain_id) != EXPECTED_CHAIN_ID:
        fail("SDK RPC returned the wrong chain ID")
    if sdk.contract.contract_address.lower() != EXPECTED_REGISTRY.lower():
        fail("SDK selected the wrong registry")
    if sdk.contract.paymaster is None:
        fail("SDK paymaster is unavailable; refusing self-paid fallback")

    metadata = [{"key": "built_with", "value": EXPECTED_BUILT_WITH}]
    metadata_bytes = [
        {"metadataKey": item["key"], "metadataValue": item["value"].encode("utf-8")}
        for item in metadata
    ]
    register_function = sdk.contract.contract.functions.register(initial_uri, metadata_bytes)
    actual_calldata = register_function._encode_transaction_data()
    expected_calldata = initial["transaction"]["calldata"]
    if actual_calldata.lower() != expected_calldata.lower():
        fail("SDK register calldata differs from committed preparation")

    owned_before = int(sdk.contract.contract.functions.balanceOf(wallet.address).call())
    nonce_before = int(sdk.web3.eth.get_transaction_count(wallet.address, "pending"))
    if owned_before != 0 or nonce_before != 0:
        fail(f"unexpected pre-state: owned={owned_before}, pending nonce={nonce_before}")

    require_gas_bounds(sdk.web3, register_function, wallet.address, "register")
    emit(
        "ready",
        agentKey=args.agent_key,
        wallet=wallet.address,
        chainId=EXPECTED_CHAIN_ID,
        registry=EXPECTED_REGISTRY,
        paymaster=sdk.contract.paymaster.paymaster_url,
    )

    register_result = sdk.contract.register_agent(agent_uri=initial_uri, metadata=None)
    register_hash = normalized_hash(register_result["transactionHash"])
    agent_id = register_result.get("agentId")
    if receipt_status(register_result.get("receipt")) != 1 or agent_id is None:
        fail("register transaction did not produce a successful receipt and agent ID")
    emit(
        "confirmed",
        step="register",
        agentKey=args.agent_key,
        transactionHash=register_hash,
        agentId=str(agent_id),
    )

    endpoints = [
        AgentEndpoint(
            name=service["name"],
            endpoint=service["endpoint"],
            version=service.get("version"),
        )
        for service in decoded["services"]
    ]
    final_uri = sdk.generate_agent_uri(
        name=decoded["name"],
        description=decoded["description"],
        image=decoded.get("image"),
        endpoints=endpoints,
        agent_id=int(agent_id),
        supported_trust=decoded.get("supportedTrust") or decoded.get("supportedTrusts"),
    )
    set_uri_function = sdk.contract.contract.functions.setAgentURI(int(agent_id), final_uri)
    require_gas_bounds(sdk.web3, set_uri_function, wallet.address, "setAgentURI")

    uri_result = sdk.contract.set_agent_uri(int(agent_id), final_uri)
    uri_hash = normalized_hash(uri_result["transactionHash"])
    if receipt_status(uri_result.get("receipt")) != 1:
        fail("setAgentURI transaction did not produce a successful receipt")
    emit(
        "confirmed",
        step="setAgentURI",
        agentKey=args.agent_key,
        transactionHash=uri_hash,
        agentId=str(agent_id),
    )
    emit(
        "complete",
        agentKey=args.agent_key,
        registerTransactionHash=register_hash,
        uriUpdateTransactionHash=uri_hash,
        agentId=str(agent_id),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("stopped", errorType=type(error).__name__, message=str(error))
        sys.exit(1)
