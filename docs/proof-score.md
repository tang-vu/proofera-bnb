# Proof Score methodology

Version: `1.1.0-draft`
Implemented in: `packages/domain/src/proof-score.ts`
Purpose: measure how much current, attributable evidence supports an agent. It does not predict returns.

## Meaning and comparison boundary

Proof Score is a 0-100 evidence-weighted score. A high value means fresh evidence supports identity, operational reliability, category outcomes, track record, and feedback. It does not mean an agent is safe, profitable, or suitable for a user.

The category label alone changes no points. Only `categoryOutcome`, `downsideControl`, and `costEfficiency` use category-bound methods, raw metrics, bounds, and directions. A category/method mismatch is invalid input. Common identity and operational components use the same rules across categories.

Scores should be ranked within a category for performance comparisons. An 80 for a yield agent is not evidence that its economics equal an 80 for a grid agent.

## Component weights

| Component                 | Points | Role                                                                    |
| ------------------------- | -----: | ----------------------------------------------------------------------- |
| Identity                  |     15 | Registry identity and current owner, agent-wallet, and endpoint control |
| Reliability               |     25 | Successful executions, measured uptime, and task completion             |
| Risk-adjusted performance |     25 | Category outcome, downside control, and known-cost efficiency           |
| Freshness                 |     15 | Market, execution, and permission evidence freshness                    |
| Track record              |     10 | Observation duration and execution volume                               |
| User feedback             |     10 | Verified feedback and rater quality                                     |

Weights sum to 100. Missing evidence is not renormalized and contributes zero.

## Signal weights and expiration

The freshness ceiling is when decay begins, not a provider update promise. The hard cutoff is measured from `observedAt`; evidence at or beyond it contributes zero score and zero confidence.

| Component                 | Signal               | Local weight | Freshness ceiling | Hard cutoff |     Full sample |
| ------------------------- | -------------------- | -----------: | ----------------: | ----------: | --------------: |
| Identity                  | Registry identity    |          35% |              24 h | 7 days (7x) |             n/a |
| Identity                  | Owner control        |          35% |              24 h | 7 days (7x) |             n/a |
| Identity                  | Endpoint control     |          30% |              24 h | 7 days (7x) |             n/a |
| Reliability               | Execution success    |          50% |              24 h | 7 days (7x) |   20 executions |
| Reliability               | Uptime               |          30% |               1 h |    4 h (4x) |       24 probes |
| Reliability               | Task completion      |          20% |              24 h | 7 days (7x) |        10 tasks |
| Risk-adjusted performance | Category outcome     |          40% |              24 h | 7 days (7x) | 30 observations |
| Risk-adjusted performance | Downside control     |          35% |              24 h | 7 days (7x) | 30 observations |
| Risk-adjusted performance | Cost efficiency      |          25% |              24 h | 7 days (7x) | 10 observations |
| Freshness                 | Market evidence      |          45% |            10 min | 30 min (3x) |             n/a |
| Freshness                 | Execution evidence   |          35% |               1 h |    4 h (4x) |             n/a |
| Freshness                 | Permission evidence  |          20% |               1 h |    4 h (4x) |             n/a |
| Track record              | Observation duration |          40% |              24 h | 7 days (7x) |             n/a |
| Track record              | Execution volume     |          60% |              24 h | 7 days (7x) |   30 executions |
| User feedback             | Verified feedback    |          65% |              24 h | 7 days (7x) |      10 reviews |
| User feedback             | Rater quality        |          35% |              24 h | 7 days (7x) |        5 raters |

The 3x cutoff is reserved for fast-changing market snapshots, 4x for hourly operational state, and 7x for daily recomputed identity, performance, history, and feedback aggregates. No multiplier exceeds seven. These cutoffs age the computed snapshot, not the underlying historical window.

## Required provenance

Every available signal must include:

- `evidenceId`: a stable identifier for a raw evidence record or manifest in ProofEra's evidence store;
- `methodId` and semantic `methodVersion`;
- `sourceKind` from the closed schema;
- normalized `value` in `[0, 1]`;
- `observedAt` and an explicit nullable `sampleSize`.

Unknown and unavailable signals carry null value, time, sample, provenance, and normalization. All objects are strict; unknown fields are rejected.

Non-performance signals must use these fixed methods:

| Signal                        | Method                                               | Source kind                |
| ----------------------------- | ---------------------------------------------------- | -------------------------- |
| Registry identity             | `proofera.identity.erc8004-registration@1.0.0`       | `erc8004_registry_record`  |
| Owner control                 | `proofera.identity.owner-control@1.0.0`              | `onchain_control_state`    |
| Endpoint control              | `proofera.identity.endpoint-control-challenge@1.0.0` | `control_challenge`        |
| Execution success             | `proofera.reliability.execution-success@1.0.0`       | `transaction_set`          |
| Uptime                        | `proofera.reliability.uptime-probes@1.0.0`           | `probe_series`             |
| Task completion               | `proofera.reliability.task-completion@1.0.0`         | `task_receipt_set`         |
| Market evidence freshness     | `proofera.freshness.protocol-market-snapshot@1.0.0`  | `protocol_snapshot`        |
| Execution evidence freshness  | `proofera.freshness.execution-receipts@1.0.0`        | `transaction_set`          |
| Permission evidence freshness | `proofera.freshness.permission-state@1.0.0`          | `onchain_permission_state` |
| Observation duration          | `proofera.track-record.observation-window@1.0.0`     | `observation_window`       |
| Execution volume              | `proofera.track-record.execution-volume@1.0.0`       | `transaction_set`          |
| Verified feedback             | `proofera.feedback.verified-feedback@1.0.0`          | `verified_feedback_set`    |
| Rater quality                 | `proofera.feedback.rater-quality@1.0.0`              | `rater_evidence_set`       |

An 8004scan response may transport an ERC-8004 registry record, which can be retained as raw evidence. An 8004scan registry, reputation, or aggregate score is never a Proof Score input. The strict registry method accepts derived registration fields only, and the schema has no upstream-score field.

## Category-bound performance normalization

Each available performance signal must disclose its exact category, method ID/version, raw metric ID/value/unit, fixed lower and upper bounds, and direction. The normalized value is recomputed and must match the supplied value:

```text
ratio = clamp((raw - lower) / (upper - lower), 0, 1)
value = ratio                         when higher_is_better
value = 1 - ratio                     when lower_is_better
```

All category methods below are version `1.0.0`.

| Category                 | Signal   | Method ID                                                | Raw metric                    |              Bounds | Direction |
| ------------------------ | -------- | -------------------------------------------------------- | ----------------------------- | ------------------: | --------- |
| LP rebalancing           | Outcome  | `proofera.lp.category-outcome.net-vs-baseline`           | `netPerformanceVsBaselineBps` |     -1000..1000 bps | higher    |
| LP rebalancing           | Downside | `proofera.lp.downside-control.max-drawdown`              | `maxDrawdownBps`              |         0..2000 bps | lower     |
| LP rebalancing           | Cost     | `proofera.lp.cost-efficiency.all-in-cost`                | `allInCostBps`                |          0..500 bps | lower     |
| Grid trading             | Outcome  | `proofera.grid.category-outcome.realized-net-pnl`        | `realizedNetPnlBps`           |     -2000..2000 bps | higher    |
| Grid trading             | Downside | `proofera.grid.downside-control.max-drawdown`            | `maxDrawdownBps`              |         0..3000 bps | lower     |
| Grid trading             | Cost     | `proofera.grid.cost-efficiency.turnover-cost`            | `turnoverCostBps`             |          0..600 bps | lower     |
| Yield optimisation       | Outcome  | `proofera.yield.category-outcome.net-apy-spread`         | `netApySpreadBps`             |       -500..500 bps | higher    |
| Yield optimisation       | Downside | `proofera.yield.downside-control.liquidity-haircut`      | `worstLiquidityHaircutBps`    |         0..2000 bps | lower     |
| Yield optimisation       | Cost     | `proofera.yield.cost-efficiency.annualized-drag`         | `annualizedCostDragBps`       |          0..300 bps | lower     |
| Health-factor monitoring | Outcome  | `proofera.health.category-outcome.policy-adherence`      | `policyAdherencePpm`          |    0..1,000,000 ppm | higher    |
| Health-factor monitoring | Downside | `proofera.health.downside-control.minimum-health-factor` | `minimumHealthFactorMilli`    | 1000..2000 milli-HF | higher    |
| Health-factor monitoring | Cost     | `proofera.health.cost-efficiency.intervention-cost`      | `medianInterventionCostBps`   |          0..100 bps | lower     |

Bounds are fixed scoring reference ranges, not forecasts, promises, or universal definitions of good performance. Raw metric adapters must use matching assets, observation windows, known fees, gas, slippage, and risk-matched baselines. Until those inputs exist, the signal remains unknown rather than receiving a neutral default.

## Calculation

For each usable signal:

```text
quality = freshness_factor * sample_factor
adjusted_signal = local_weight * normalized_value * quality
```

Freshness factor is monotonic:

- `1.0` from age zero through the freshness ceiling;
- linear from `1.0` to `0.5` between one and two ceilings;
- linear from `0.5` to `0` between two ceilings and the signal cutoff;
- `0` at and beyond the cutoff;
- `0` for any timestamp later than the explicit `asOf` time.

`asOf` must be assigned by the scoring service, stored with the result, and reused for deterministic reproduction.

Sample factor for threshold `m`:

```text
1                 when n >= m
sqrt(n / m)       when 0 <= n < m
0.5               when sample size is null
```

Unknown, unavailable, future, and expired evidence contributes zero. Component contribution is the component point weight multiplied by its locally weighted adjusted signals. The final score is rounded to one decimal.

## Confidence

Confidence uses the same weighted calculation without normalized value:

```text
signal confidence = local_weight * quality
overall confidence = sum(component_points * component_confidence) / 100
```

- high: `>= 0.80`
- medium: `>= 0.60` and `< 0.80`
- low: `< 0.60`

This is evidence completeness/freshness, not a statistical confidence interval. Warnings distinguish missing, unavailable, stale, expired, future-dated, missing-sample, low-sample, and overall low-confidence states.

## Golden vectors and change control

With every non-performance signal at 1.0 and fresh/full-sample, the four category vectors are:

| Category                 | Outcome raw |   Downside raw | Cost raw | Risk component | Total |
| ------------------------ | ----------: | -------------: | -------: | -------------: | ----: |
| LP rebalancing           |     500 bps |        500 bps |  100 bps |      19.1 / 25 |  94.1 |
| Grid trading             |       0 bps |        750 bps |  300 bps |      14.7 / 25 |  89.7 |
| Yield optimisation       |     250 bps |        500 bps |  150 bps |      17.2 / 25 |  92.2 |
| Health-factor monitoring | 900,000 ppm | 1,500 milli-HF |   20 bps |      18.4 / 25 |  93.4 |

Tests also prove cross-category method swaps are rejected; missing, stale, and expired evidence are monotonic; any future timestamp gets zero; aggregate 8004scan scores have no accepted method; low samples reduce credit; and all nested inputs are strict.

Formula, weight, cutoff, bound, or method changes require a Proof Score version bump, updated golden vectors, this methodology update, and a migration note. Stored historical scores retain their original version.
