# BNB Agent Studio local readiness record

Date checked: **2026-08-11 UTC**
Classification: **development evidence — not onchain evidence**

## Scope

This record captures non-secret local readiness for `agents/lpRangeAgent`. It does **not** prove a wallet, Altana authority, ERC-8004 registration, deployment, live endpoint, transaction, or financial result.

## Toolchain

- CLI command: `pnpm dlx @bnbagent/studio-cli@0.0.8 --version`
- Observed CLI version: `0.0.8`
- Scaffold target: self-hosted, BSC testnet, A2A+MCP, ERC-8183, Altana wallet mode, local development storage, no auto-top-up, no onboarding.
- Generated runtime dependencies: Studio runtime `0.0.8`, BNB Agent SDK `0.5.0`, Altana SDK `0.5.1`.
- ProofEra marketplace Altana adapter version: `0.7.0`; compatibility is intentionally unresolved until the authority-handoff spike passes.

## Doctor result

Command run from the generated workspace:

```text
bag doctor --project-root app/agent
```

Passed checks:

- project configuration parse;
- runtime entrypoint;
- BSC-testnet reachability;
- ERC-8183 pricing configuration;
- local storage configuration;
- repository agent-instruction trigger.

Expected incomplete checks:

- wallet address and Altana session were absent;
- wallet password, OpenAI key and maximum price were absent;
- Bun, AWS and deployment preparation were not configured;
- local storage was correctly identified as development-only.

No warning was suppressed. No wallet/session secret file was read or copied into this record. The generated TypeScript production build passed independently; dependency installation reported no known production vulnerability at the time checked.

## Reproduction

From `agents/lpRangeAgent` with Node 22+ and Corepack:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm --dir app/agent build
pnpm dlx @bnbagent/studio-cli@0.0.8 doctor --project-root app/agent
corepack pnpm --dir app/agent audit --prod
```

The doctor command is expected to remain incomplete until a deliberately created testnet wallet/session and runtime secret configuration exist. Those are external evidence actions, not routine development setup.
