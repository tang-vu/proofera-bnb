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

A read-only PublicNode observation on 2026-08-17 found all four balances at exactly zero. Studio 0.0.5's self-paid registration path blocks below `0.002 tBNB` because registration can require two transactions. Use the official faucet or a separately approved bounded testnet funding transaction, then re-observe balance and current registration state before signing. The residual balance of ProofEra's older PTA deployment wallet is not authority to fund these accounts.

## Registration gate

For each agent, in order:

1. Public `/ping` and `/.well-known/agent-card.json` must pass and the card URL must equal the manifest endpoint.
2. Two independent BSC testnet reads must confirm the wallet is not already registered and has enough gas.
3. Review the generated name, description, A2A endpoint, protocol version `0.3.0`, chain ID `97`, registry address, estimated gas, and wallet address.
4. Load the DPAPI-protected password into `WALLET_PASSWORD` only for the isolated `bag erc8004 register` process; never print or persist the plaintext.
5. Treat a timeout or partial registration as unknown/pending. Resolve the wallet and transaction before any retry.
6. Retain transaction hashes, agent IDs, final on-chain metadata, explorer links, observed blocks, and exact source commit in `evidence/`. Only then may the marketplace mark the corresponding identity registered.

Mainnet registration remains separately approval-gated.
