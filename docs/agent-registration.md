# ProofEra agent registration runbook

Updated: 2026-08-17. This record prepares four BSC testnet ERC-8004 registrations. It is not registration or transaction evidence.

## Current BNB Agent Studio boundary

The installed official toolchain is `bnbagent-studio 0.0.5` (`bag 0.0.5`) with native npm `@aws/agentcore 0.27.0`. Studio 0.0.5 scaffolds a Python single-agent seller that exposes one of A2A or MCP. ProofEra's existing TypeScript analyzers expose both protocols and are durably self-hosted, but `bag scan` correctly reports them as non-Studio/deploy-ready projects. Their manifests therefore use current Studio's singular `protocol = "A2A"` only for ERC-8004 discovery metadata while retaining `protocols = ["A2A", "MCP"]` as the truthful runtime surface.

Do not claim that these analyzers were deployed by AgentCore. Their public A2A endpoints can be registered independently; deployment provenance and on-chain identity are separate facts.

## Dedicated registration wallets

| Category               | Public endpoint                       | Registration wallet                          |
| ---------------------- | ------------------------------------- | -------------------------------------------- |
| LP Range               | `https://proofera-lp.tangvu.dev/`     | `0xAd03eF7e21c35FD1446c153f6eE5e6165F696990` |
| Grid Trading           | `https://proofera-grid.tangvu.dev/`   | `0xFBfFa9BA36d578AFF2d05EDe840Fc7088e70ADB8` |
| Yield Optimisation     | `https://proofera-yield.tangvu.dev/`  | `0x62Af37A6FD89374684C00e2402FD96143f96ee85` |
| Health-Factor Guardian | `https://proofera-health.tangvu.dev/` | `0x708cb7F2b974d94005E762A140c469F1125e0cB4` |

Each encrypted Web3 Secret Storage file is under its agent workspace's ignored `.studio/wallets` directory, outside `app/agent`. Its independent random password is stored only as a current-user DPAPI blob outside the repository. Neither location is a KMS, portable backup, mainnet wallet, user-capital wallet, Altana signer, or browser passkey.

A retained read-only preparation at finalized block `125517740` made 42 calls across the BNB Chain seed RPC and PublicNode. Both providers agreed on the block hash, registry runtime, `0.1 gwei` gas price, zero balance, zero nonce, zero registry `balanceOf`, and the initial registration gas estimate for every wallet. The artifact includes each exact first-step calldata and the current public Agent Card response, including all five advertised skill IDs across four agents. It does **not** prove funding, signing, registration, or a receipt.

Studio 0.0.5's self-paid registration path blocks below `0.002 tBNB` because SDK `0.4.2` performs `register(string,(string,bytes)[])` and then `setAgentURI(uint256,string)`. The second calldata and estimate cannot be known exactly until the first confirmed receipt supplies `agentId`; the preparation keeps them null instead of inventing them. The bounded proposal is `0.003 tBNB` per wallet (`0.012 tBNB` total), with at most two registration transactions per wallet, `1,000,000` gas per transaction, and `0.2 gwei` gas-price cap. This is a review boundary, not approval. Use the official faucet or a separately approved bounded testnet funding transaction, then re-observe balance and current registration state before signing. The residual balance of ProofEra's older PTA deployment wallet is not authority to fund these accounts.

## Registration gate

For each agent, in order:

1. Public `/ping` and `/.well-known/agent-card.json` must pass and the card URL must equal the manifest endpoint.
2. Two independent BSC testnet reads must confirm the wallet is not already registered and has enough gas.
3. Review the generated name, description, A2A endpoint, protocol version `0.3.0`, chain ID `97`, registry address, estimated gas, and wallet address.
4. Load the DPAPI-protected password into `WALLET_PASSWORD` only for the isolated `bag erc8004 register` process; never print or persist the plaintext.
5. Treat a timeout or partial registration as unknown/pending. Resolve the wallet and transaction before any retry.
6. Retain transaction hashes, agent IDs, final on-chain metadata, explorer links, observed blocks, and exact source commit in `evidence/`. Only then may the marketplace mark the corresponding identity registered.

Mainnet registration remains separately approval-gated.

Reproduce the create-only preflight from a reviewed clean base commit:

```powershell
node scripts/prepare-agent-registration-manifest.mjs --prepare-exact-registration-manifest --source-base-commit <40-hex-commit>
```

The current retained preparation is `evidence/erc8004/preparations/125517740-four-agent-registration-preparation.json`. The earlier block-`125510593` and block-`125490457` artifacts remain immutable historical evidence.

## Receipt evidence capture

After—and only after—all eight registration/URI-update transactions have confirmed, run the create-only read-side collector from a clean, published release that contains a freshly generated preparation. Git must prove the preparation's clean `sourceBaseCommit` is an ancestor of that release, and the preparation bytes must match `HEAD`. The command order is part of the evidence contract:

```powershell
$releaseCommit = (git rev-parse HEAD).Trim()
$preparation = "evidence/erc8004/preparations/<finalized-block>-four-agent-registration-preparation.json"
corepack pnpm capture:erc8004:registration $releaseCommit `
  --preparation $preparation `
  --lp-range-register <0x64-hex> --lp-range-uri-update <0x64-hex> `
  --grid-trading-register <0x64-hex> --grid-trading-uri-update <0x64-hex> `
  --yield-optimisation-register <0x64-hex> --yield-optimisation-uri-update <0x64-hex> `
  --health-factor-register <0x64-hex> --health-factor-uri-update <0x64-hex>
```

The collector performs no signing or transaction submission. It requires two providers to agree on all eight transactions and receipts, derives each `agentId` only from the registry's unique ERC-721 mint event, decodes the exact `setAgentURI` call, and re-reads `ownerOf`, `tokenURI`, and wallet `balanceOf` at one shared finalized block. Initial registration calldata must equal the committed preparation byte-for-byte. Its gas-cost field is only `gasUsed × effectiveGasPrice`; it does not infer who paid or sponsored gas.

Even a valid output proves only BSC-testnet identity ownership and final URI at the observed block. It keeps marketplace eligibility, hiring, execution authority, endpoint performance, and strategy performance false until their separate evidence exists. A pending/unknown receipt, provider disagreement, duplicate hash/agent ID, unexpected mint, URI drift, or non-finalized transaction fails closed and produces no manifest.
