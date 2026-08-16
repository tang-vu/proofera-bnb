# ProofEra submission draft

Updated: 2026-08-17. Status: copy in progress; the marketplace and four read-only analyzer endpoints are public and one Pancake public-position benefit capture is retained, while BSC registration, Altana/Pancake execution, TermiX paired evidence, activation, and final release evidence remain incomplete.

## Core copy

**ProofEra — Hire agents by proof, not promises.**

ProofEra is being built as the risk-aware marketplace where users discover, verify, compare, hire, control and revoke autonomous DeFi agents on BNB Smart Chain. ERC-8004 proves an agent identity exists; ProofEra's target decision layer adds source-linked category outcomes, downside/costs, freshness, transparent confidence, plain-language authority and an immediate verifiable revoke path.

Users begin with a financial job—protect a Venus loan, manage Pancake concentrated liquidity, seek sustainable yield or run a bounded grid—not protocol jargon. ProofEra never replaces missing live evidence with fabricated performance. Unknown and stale data reduce confidence and activation remains locked until an agent's capability, execution policy and revoke path are independently verified.

## Why it can become the Agent Studio marketplace

- Ingests third-party ERC-8004 identities without mistaking self-description for proof.
- Locally renders one explicitly non-live Reference Analyzer dossier for each required category, with per-metric implemented/not-run versus absent-calculator truth. LP has a separate bounded configuration surface; Grid, Yield, and Health have strict configuration-only mandate routes. Equal live Passports, permission controls, activation, and receipts are still implementation/deployment work.
- Includes four exact-pinned, hardened, non-executing self-hosted A2A/MCP reference analyzers: LP Range (17 tests), Grid Trading (24), Yield Optimisation (33), and Health-Factor Guardian (42). All four expose public HTTPS health and Agent Card endpoints, but none is ERC-8004-registered, execution-enabled, or eligible for a live marketplace claim. Studio 0.0.5 does not classify the TypeScript runtimes as AgentCore-deployable, and ProofEra does not claim otherwise.
- Uses typed adapter boundaries, exact versions and evidence manifests that can survive undisclosed Phase 2 requirements.
- Treats permission inspection, status reconciliation and revoke as core marketplace features.

## Partner-track story

**PancakeSwap:** the current slice performs exact-block position reads and deterministic, non-executing LP analysis. A create-only mainnet capture at block `116342186` preserved 12 raw RPC exchanges and the public A2A request/response for third-party USDT/WBNB fee-500 position `7152618`. The position was in range but one tick above its lower bound; the agent returned `insufficient_evidence` because projected fees, gas and slippage were absent. This demonstrates bounded decision value, not ownership, performance, hiring, execution or a receipt. A separate bounded review rejected all 14 inspected testnet WBNB pools rather than promoting unsafe mocks. Canonical WBNB has exact source/creation/runtime/control proof, and the isolated fixed PTA fallback is finalized on chain 97 with exact runtime, supply and single-mint evidence. A later two-provider snapshot at finalized block `124767685` found no PTA/WBNB pool at fee tiers `100`, `500`, `2500`, or `10000`; all five retained token/core runtime hashes matched, and a bounded public-result transcript is replayed offline. The fee-500 CREATE2 result `0x30b07e82d7181a53Ae2EA98Cd08b6733Ffd831aE` is a conditional candidate, not a pool. Factory owner/LM controls remain mutable. The offline initializer scenario uses the arbitrary test ratio `1 PTA = 0.000001 WBNB`, not a market/peg/oracle/valuation claim. No ProofEra-controlled pool, liquidity, position or Pancake transaction receipt is evidenced. Initialization and a later LP mint—including the unapproved proposal capped at `1,000 PTA` plus `0.001 WBNB`—require separate explicit approvals. The submission claim will add a bounded direct V3 LP operation only after an eligible pool, a controlled position, scoped authority, a real Pancake testnet receipt and a manual baseline net of gas, protocol fees, slippage and estimated IL exist.

**Altana:** strict local boundaries now cover context-schema-v3 complete intent/quote binding, selector-scoped write-target attestation, public-descriptor grant intent, exact call rows, token caps, expiry, authority verification, lifecycle display and revoke semantics. The handoff requires an exact atomic `consumeOrRead` receipt. Its reservation ledger passes 10 real PostgreSQL 17.9 cases. The separate canonical one-shot grant-claim ledger passes 68 focused and 18 real PostgreSQL 17 cases; its migration and semantic-contract SHA-256 values are recorded in the [deployment runbook](./deployment.md#postgresql-grant-claim-gate). Both ledgers are now deployed on an isolated host-local staging boundary and pass the canonical direct-login readiness ceremony. No authenticated worker, worker-held live signer, authority, passkey ceremony, grant, execute/revoke transaction, Keystore record or explorer receipt exists. An ambiguous SDK grant is never blind-retried.

**TermiX:** the strict harness and exactly three digest-bound preregistrations exist for LP trading, permission security, and Venus health. Fixed Venus agent and manual lanes now share the request digest and timed core. The agent lane preserves the raw A2A response and remains unreachable until ERC-8004 registration plus a verified hire receipt pass the outer gate; the manual lane records positive operator-active segments and only fixed read-only BSC-testnet RPC exchanges, while leaving its no-agent declaration for independent review. Final task bindings and invocation transcripts remain `UNBOUND`, both methods are `NOT RUN`, and publication is false. The final evidence must contain three frozen, reproducible agent-versus-manual runs measuring wall/active time, cost and predeclared output quality.

## Submission evidence — incomplete

| Item                          | Value                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| Public marketplace URL        | `https://proofera.tangvu.dev`; activation not ready          |
| Source commit                 | NOT FROZEN                                                   |
| Four public agent endpoints   | DEPLOYED READ-ONLY; NOT BSC-REGISTERED                       |
| ERC-8004 agent IDs/addresses  | NOT REGISTERED                                               |
| Altana account/key links      | NOT CREATED                                                  |
| Grant/execute/revoke receipts | NOT EXECUTED                                                 |
| Pancake benefit run           | READ-ONLY PUBLIC POSITION CAPTURED; EXECUTION NOT RUN        |
| TermiX three-task report      | NOT RUN                                                      |
| Demo video                    | NOT RECORDED                                                 |
| CI/public smoke evidence      | LOCAL GATES AND PUBLIC SMOKE PASS; HOSTED CI BILLING-BLOCKED |
| PTA fixture deployment        | FINALIZED CHAIN 97; NOT POOL/LP EVIDENCE                     |
| PTA/WBNB pool readiness       | READ-ONLY SNAPSHOT; NO POOL OR WRITE                         |

## Required final validation

Before submission, cross-check every sentence against a live URL, receipt, raw run or explicitly cited methodology. Remove any feature whose judged path is incomplete rather than describing planned work in the present tense. Verify public uptime through 2026-09-23 UTC, mobile/keyboard accessibility, final hostname passkey recovery, agent health, explorer links and exact environment labels.
