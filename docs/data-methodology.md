# Data and metric methodology

Updated: 2026-08-12
Status: milestone-1 methodology; category expansions remain versioned work.

## Evidence envelope

Every displayed metric is an evidence object, never a bare number. It contains:

- `value`: typed value or explicit null;
- `availability`: available, unknown, or unavailable;
- `unit`: one exact schema value: `none`, `ratio`, `percent`, `usd`, `base_units`, `seconds`, `timestamp`, or `count`;
- source label/kind and a typed locator: bounded HTTP(S), IPFS, chain+contract, chain+transaction, or a bounded external identifier;
- `observedAt`: when the source says the fact was true;
- `ingestedAt`: when ProofEra received it;
- methodology identifier and human-readable method;
- environment: BSC mainnet, BSC testnet, simulation, or fixture;
- freshness state and policy.

Available evidence requires a value, source, and observation time. `unknown` means no trustworthy observation is known and records a reason. `unavailable` means an identified expected source was attempted and failed; it retains `attemptedAt`, a bounded provider/error code and an optional nested last-good observation. Both have a null current value. Provider failure is unavailable, not zero. Test fixtures cannot enter strict production adapters.

The four local Reference Analyzer dossiers apply the same rule to calculator coverage. A field may say `implemented_not_run` only when the named analyzer actually computes that field and can name its exact method version. A field whose business definition exists but whose calculator does not is `definition_documented_calculator_absent` with `methodologyVersion: null`. Analyzer-wide documentation is never copied onto every metric. This prevents an explicit `null` output, a caller-supplied value, or an adjacent calculation from being presented as implemented performance code.

The current implemented-but-not-run set is intentionally narrow: LP `current_range_state`; Grid `configured_range`; Yield `net_apy` and `gas_impact`; Health `current_health_factor`, `minimum_health_factor`, and `alert_latency`. Every other field in those four eight-metric dossiers has a documented business definition but no calculator. No dossier contains an observed result, and no analyzer-wide version is attached to an absent calculation.

Configuration is also not evidence. The three non-LP mandate routes retain submitted capital/gas/repay amounts as canonical `uint256` strings, prices and health factors as bounded decimal strings, percentage limits as basis-point integers, and BSC network as an explicit chain 56/97 choice. Lista mandates are restricted to chain 56 because no official Lista testnet source is configured. A valid form means only that the submitted bounds are structurally well formed: it does not establish market data, token decimals, protocol contracts, identity, suitability, permissions, authority, a quote, a receipt, or readiness. The configuration handlers perform no source, application-environment, or wallet access and keep all readiness flags false.

## Provenance hierarchy

ProofEra distinguishes these claims rather than collapsing them into “verified”:

1. **Identity registration:** ERC-8004 registry event/state.
2. **Current control:** registry owner, authoritative `agentWallet`, and endpoint-domain proof where available.
3. **Service health:** recent endpoint response under a bounded timeout.
4. **Permission state:** onchain Altana Keystore validity plus the frozen ProofEra policy snapshot.
5. **Execution:** transaction receipt, decoded calls/events, success/revert, block/time, and known cost.
6. **Outcome:** derived only from identified protocol state and execution history with a declared formula.
7. **Feedback:** onchain/offchain feedback plus reviewer identity/quality and Sybil caveats.

An identity alone never establishes steps 3–7.

## Time, freshness, and outages

- Timestamps use UTC ISO 8601. Onchain observations retain block number/hash and block timestamp.
- API response time is ingestion time, not source observation time unless the source explicitly defines it so.
- Market/quote data is normally stale after 10 minutes; activation quotes use a much shorter explicit `validUntil`.
- Permission and execution-state reads are normally stale after one hour in discovery views and are re-read immediately before any signature.
- Daily aggregate performance is stale after 24 hours.
- A provider outage may serve the last valid value only when its original observation time and a prominent stale warning remain visible. No live request may silently switch to a fixture.

These are ProofEra display policies, not provider SLAs. Each adapter can set a stricter ceiling.

## Number handling

- Onchain amounts are stored as integer base-unit strings or `bigint` in memory.
- Token decimals are read from the contract and checked against the curated token record; symbols do not imply decimals.
- Display rounding happens last and never mutates stored raw values.
- Ratios use an explicitly named numerator, denominator, and window.
- Provider-specific numeric zero that means “not available” (notably possible in price APIs) is normalized to unknown unless another source proves a real zero.
- USD conversions preserve price source and time. They are not mixed across observation times without a warning.

## Common agent metrics

- **Execution count:** distinct confirmed strategy actions in the declared window; retries/replacements are linked rather than double-counted.
- **Success rate:** confirmed successful executions divided by finalized attempted executions. Pending/unknown is reported separately, not counted as failure until resolved.
- **Uptime:** successful scheduled endpoint checks divided by eligible checks in the displayed window, with check cadence and locations disclosed.
- **Fees:** agent fee schedule separated from protocol fee, gas, slippage, and other known costs.
- **Last activity:** latest independently observed endpoint or onchain action, labeled by type.
- **Track-record duration:** time between first and last qualifying observations, not identity registration age alone.

## LP rebalancing

All comparisons use the same pool, initial inventory/value convention, block/time interval, and price source.

- **In-range time:** time-weighted fraction of sampled/decoded interval where current pool tick lies inside `[tickLower, tickUpper)`.
- **Fee APR:** observed fees attributable to the position, annualized from the stated window and denominator. Forecast APR is labeled forecast and kept separate.
- **Estimated impermanent loss:** position value versus a hold baseline at the same terminal prices, excluding fees, with formula/version disclosed. “Estimated” remains in the label unless all required inventory/history is directly reconstructed.
- **Rebalance frequency:** confirmed range-reset actions per day/week and raw count/window.
- **Gas drag:** gas cost converted with contemporaneous native-token price divided by starting/reference capital.
- **Net performance:** terminal position value + realized fees/rewards − initial reference value − gas − known slippage − agent/protocol costs. Forecast and realized values never mix.
- **Manual baseline:** predeclared fixed range or a human-produced range plan frozen before replay. The agent cannot choose the benchmark after seeing outcomes.

Milestone-1 activation requires a real onchain pool/tick/liquidity read, exact V3 position-manager function scopes, cap/expiry/slippage/deadline, simulation, then an explicit user confirmation.

### LP activation amount methodology

`pancakeswap-v3-sdk-3.10.1-router-compatible-v2` reproduces the exact published SDK 3.10.1 `Position.fromAmounts(..., useFullPrecision: false)`, rounded mint amounts, counterfactual slippage-price bounds, and the second router-compatible liquidity pass used by `mintAmountsWithSlippage`. It uses integer Q64.96/`bigint` arithmetic only and validates the half-open current-tick interval. Capital ceilings, rounded calldata desired maxima, capital not submitted, and slippage minima are separate fields; none is described as realized consumption. M1 rejects zero or `uint128`-overflowing liquidity and also rejects any mismatch between preliminary liquidity and liquidity recomputed from the rounded calldata maxima. Contract source links are pinned to Pancake repository commit `986847948755cba528324d41be19480731c36c2a`; exact npm artifact integrities are retained for `@pancakeswap/v3-sdk@3.10.1`, `@pancakeswap/sdk@5.9.1`, and `@pancakeswap/swap-sdk-core@1.6.0`.

The pure calculator always reports caller-supplied inputs, no chain binding, and `executionReady: false`. A quote may enter a trusted activation context only when ProofEra itself recomputes it from a fresh block-pinned pool snapshot and binds the exact chain, pool, token order, fee/tick spacing, reviewed runtime identities, token decimals, target ticks, capital limits, observation block/time, and validity window. Context schema 3 copies every execution-relevant intent field into a server binding. Its v3 context and quote IDs authenticate that complete intent and quote payload with server-held CSPRNG nonces; the resolver recomputes both IDs, compares the exact intent, and rejects a changed range, duration, execution cap, minimum, or any other retained-ID mutation. The nonces never enter the browser payload.

The chain-97 first-LP preparer is a narrower execution-preparation layer, not a replacement for that generic context. It admits only the fixed PTA/WBNB fee-500 empty pool, two exact official RPCs, the reviewed runtime/proxy identities, full-range aligned ticks, `1,000 PTA`, `0.001` native BNB, and zero slippage. It encodes a direct exact PTA approval followed by direct payable `mint`; equal minima/maxima make any changed token consumption revert and avoid a successful native-dust outcome. Both calls are simulated independently on each RPC, with the mint simulation using an ephemeral PTA allowance state override whose storage slot is source/code-hash bound. The override changes no chain state. The retained rehearsal used a 120-second scope and is expired. Fresh execution scopes expire after 300 seconds and still carry no signing/broadcast authority; only an exact same-process short TTY code derived from the complete scope/runtime/OS-nonce binding can create the separately bounded in-memory authority. Neither kind of scope can establish a receipt, NFT, liquidity or benefit.

The reviewed-deployment input is also content-addressed: `reviewId` is derived from the canonical complete manifest containing source/review metadata, fee/tick spacing, token decimals and every reviewed runtime-code identity. A changed field invalidates the content address. This is an integrity binding for supplied review data, not evidence that source, proxy implementation/admin state, token behavior, or release approval has been independently established. No release-approved write manifest is recorded yet.

The Altana LP handoff rebuilds the policy from raw inputs and requires a server-only atomic `consumeOrRead` receipt that exactly binds context ID, quote ID, user, policy hash, write-target binding, consumption time and expiry before it can return a public bootstrap request. The concrete PostgreSQL implementation consumes context and quote IDs in an append-only schema; its exact migration/catalog/ACL proof and 10 real-17.9 cases pass, but no deployed database or live authority exists. The product activation cap is 100 bps even though the reusable math primitive validates the SDK's wider 0-10,000 bps domain. The context expires within 120 seconds and its quote window within 60 seconds. It is deterministic liquidity/minimum math, not a price forecast, gas estimate, full transaction simulation, realized output, or promise that a transaction will succeed.

## Grid trading

- **Realized PnL:** proceeds minus cost basis for closed fills, net of protocol/agent/gas/slippage costs.
- **Win rate:** profitable closed grid cycles divided by closed cycles, always paired with count and observation window.
- **Maximum drawdown:** largest peak-to-trough decline of the declared marked equity series.
- **Turnover:** gross traded notional in the observation window.
- **Range/fills:** declared grid bounds/levels and confirmed onchain fills; cancelled/expired/pending orders are distinct.
- Backtests and simulations are never displayed as live trading records.

## Yield optimisation

- **Base APY:** non-incentive rate under the protocol's published/current state and compounding convention.
- **Reward APY:** incentives separately valued with source/time and liquidity caveats.
- **Net APY:** base + reward less known agent/protocol costs and amortized estimated gas over the stated horizon. It is forecast unless derived from realized cash flows.
- **TVL and available liquidity:** separate metrics; TVL does not imply an immediate exit is possible.
- **Protocol exposure:** direct and material underlying protocol/token/bridge/oracle dependencies.
- **Withdrawal constraints:** queues, cooldowns, unbonding, caps, paused actions, and liquidity limits. Lista slisBNB's documented seven-day native unbonding is an example.
- **Route history:** confirmed movements with prior/new route, trigger, costs, and receipt.
- **Lista source boundary:** the first adapter follows the current official SDK's BSC-mainnet vault-list request and preserves APY, emissions, deposits, deposits-USD, utilization and fee as exact source-reported decimal strings. The API does not document APY scale, fee meaning, item timestamps, withdrawable liquidity, withdrawal constraints or realized performance, so each remains explicitly unknown and no net APY is computed.
- **Reference analyzer boundary:** the local Yield Optimisation agent does not fetch or attest source content. It requires source coverage for APY, liquidity, withdrawals, economics, exposure and route history; exact onchain block relations or HTTPS publisher/content digests; typed cost asset/decimals/provenance; and explicit APY scale. Its simple-net method subtracts annual fee plus exactly annualized gas, route fee, slippage and withdrawal costs over the declared capital/horizon only when denomination conversion and rational representation are exact. It never treats absent base/reward values as zero, never ranks by headline APY, exposes realized performance as unknown, and marks every result ineligible for marketplace publication, activation and execution until independent ingestion verifies it.

## Health-factor monitoring

- **Health factor:** liquidation-threshold-adjusted collateral value divided by debt value. Inputs list collateral, debt, oracle price/validity, liquidation thresholds, and e-mode/user-specific settings.
- Venus `getAccountLiquidity`/shortfall is cross-checked but not mislabeled as the ratio itself.
- The initial block-pinned adapter therefore publishes only raw excess-liquidity/shortfall signals and an explicit `not_computed` ratio boundary. It never derives a ratio from the aggregate difference alone.
- **Reference Guardian calculation:** the local Health-Factor Guardian accepts caller-supplied per-market evidence only when every source binds the chain-specific official Venus Core Comptroller, exact account, vToken/market relation, block number/hash/timestamp, closed read method, and one declared USD quote-value unit/scale. It applies the documented Venus-style per-market integer truncation before aggregating liquidation-threshold-adjusted collateral, uses exact rational arithmetic for adjusted collateral/debt, detects uint256 aggregate overflow, and rejects cross-block, post-current, unit/scale, account, market or source drift. Zero debt is `not_applicable`, never infinity.
- **Minimum health factor:** minimum observed ratio at the declared sampling/event cadence and window.
- A minimum is unavailable unless the complete declared observation window and one-to-one alert coverage are present; missing samples cannot become a favorable minimum.
- **Alert latency:** time between the first qualifying source observation and alert dispatch/receipt; chain/provider latency is recorded separately when possible.
- **Intervention policy:** threshold, hysteresis, permitted action, maximum amount, slippage/deadline, cooldown, failure behavior, and expiry.
- **Execution history:** alert-only, recommended, attempted, confirmed, failed, and revoked actions remain distinct.
- “Liquidation prevented” is claimed only with a defensible counterfactual and is otherwise labeled simulation.

- The analyzer does not fetch or attest source content. `sourceContentsVerified`, `freshnessAttestedByAgent`, `marketplaceEligible`, `activationEligible`, and `executionEnabled` remain false; execution receipts/statuses are caller claims until independently joined to chain evidence.

## Primary sources selected

- ERC-8004 identity/reputation: direct BSC reads and 8004scan API, with raw shape preserved.
- PancakeSwap: official onchain pools/routers/position manager and official developer SDK/subgraph sources.
- Venus: official API plus Comptroller/Lens onchain reads.
- Lista: official Moolah API/SDK for mainnet reads; no testnet write assumption.
- Altana: direct Keystore reads, official SDK result, Altana explorer, and BscScan action receipts.

Unknown rate limits, undocumented freshness guarantees, and provider-specific transformations remain explicitly unknown in adapter metadata.
