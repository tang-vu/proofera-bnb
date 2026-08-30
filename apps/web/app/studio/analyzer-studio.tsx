"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  testnetAnalyzerCatalog,
  type TestnetAnalyzerCategory,
  type TestnetAnalyzerPreset
} from "../../lib/testnet-analyzer-catalog";
import styles from "./studio.module.css";

const HISTORY_KEY = "proofera.testnet-analyzer-history.v1";
const MAXIMUM_HISTORY_ITEMS = 12;

const resultRecordSchema = z.record(z.string(), z.unknown());
const successResponseSchema = z.strictObject({
  status: z.enum(["completed", "rejected"]),
  runId: z.string().min(1).max(120),
  category: z.enum([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ]),
  agent: z.strictObject({
    label: z.string(),
    agentId: z.string(),
    endpoint: z.string().url(),
    skill: z.string(),
    expectedMethodologyVersion: z.string()
  }),
  observedAtUtc: z.string().datetime(),
  latencyMilliseconds: z.number().int().nonnegative(),
  trust: z.literal("caller_supplied_unverified"),
  result: resultRecordSchema,
  boundary: z.strictObject({
    chainId: z.literal(97),
    environment: z.literal("bsc-testnet"),
    executionEnabled: z.literal(false),
    walletAccessed: z.literal(false),
    transactionSubmitted: z.literal(false),
    serverPersistence: z.literal(false)
  })
});
const errorResponseSchema = z.looseObject({
  status: z.literal("blocked"),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(240)
});
const historyEntrySchema = z.strictObject({
  runId: z.string().min(1).max(120),
  category: z.enum([
    "lp-rebalancing",
    "grid-trading",
    "yield-optimisation",
    "health-factor-monitoring"
  ]),
  observedAtUtc: z.string().datetime(),
  decision: z.string().min(1).max(100),
  methodologyVersion: z.string().min(1).max(100),
  inputSha256: z.string().regex(/^0x[0-9a-f]{64}$/u),
  latencyMilliseconds: z.number().int().nonnegative()
});
const historySchema = z.array(historyEntrySchema).max(MAXIMUM_HISTORY_ITEMS);
const violationSchema = z.looseObject({
  code: z.string().optional(),
  message: z.string().min(1)
});

type AnalyzerResponse = z.infer<typeof successResponseSchema>;
type HistoryEntry = z.infer<typeof historyEntrySchema>;

function recordText(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringList(record: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
}

function violationList(record: Readonly<Record<string, unknown>>): readonly string[] {
  const value = record.constraintViolations ?? record.issues;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim().length > 0) return [entry];
    const candidate = violationSchema.safeParse(entry);
    if (!candidate.success) return [];
    const code = candidate.data.code?.replaceAll("_", " ");
    return [code === undefined ? candidate.data.message : `${code}: ${candidate.data.message}`];
  });
}

function loadHistory(): readonly HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw === null) return [];
    const parsed = historySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function storeHistory(entries: readonly HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // History is optional; analysis remains usable when storage is unavailable.
  }
}

async function inputDigest(value: string): Promise<`0x${string}`> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )}`;
}

function terminalDecision(response: AnalyzerResponse): string {
  return (
    recordText(response.result, "decision") ??
    recordText(response.result, "error") ??
    (response.status === "rejected" ? "input_rejected" : "unknown")
  );
}

function methodology(response: AnalyzerResponse): string {
  return (
    recordText(response.result, "methodologyVersion") ?? response.agent.expectedMethodologyVersion
  );
}

function ResultPanel({ response }: Readonly<{ response: AnalyzerResponse }>) {
  const decision = terminalDecision(response);
  const rationale = stringList(response.result, "rationale");
  const limitations = stringList(response.result, "limitations");
  const violations = violationList(response.result);
  return (
    <section className={styles.resultPanel} aria-labelledby="studio-result-heading">
      <div className={styles.resultTopline}>
        <div>
          <span className="panel-overline">TERMINAL ANALYZER OUTPUT</span>
          <h2 id="studio-result-heading">{decision.replaceAll("_", " ")}</h2>
        </div>
        <span
          className={
            response.status === "completed"
              ? "state-badge state-available"
              : "state-badge state-caution"
          }
        >
          {response.status === "completed" ? "Analysis complete" : "Input rejected"}
        </span>
      </div>
      <dl className={styles.resultFacts}>
        <div>
          <dt>Method</dt>
          <dd>{methodology(response)}</dd>
        </div>
        <div>
          <dt>Agent identity</dt>
          <dd>ERC-8004 #{response.agent.agentId}</dd>
        </div>
        <div>
          <dt>Round trip</dt>
          <dd>{response.latencyMilliseconds} ms</dd>
        </div>
        <div>
          <dt>Trust state</dt>
          <dd>Caller-supplied, unverified</dd>
        </div>
      </dl>
      {violations.length > 0 ? (
        <div className={styles.findingBlock}>
          <strong>Constraint findings</strong>
          <ul>
            {violations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {rationale.length > 0 ? (
        <div className={styles.findingBlock}>
          <strong>Rationale</strong>
          <ul>
            {rationale.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {limitations.length > 0 ? (
        <div className={styles.findingBlock}>
          <strong>Limitations</strong>
          <ul>
            {limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className={styles.rawDetails}>
        <summary>Inspect complete bounded response</summary>
        <pre>{JSON.stringify(response.result, null, 2)}</pre>
      </details>
      <div className={styles.boundaryStrip}>
        <span>Chain 97</span>
        <span>Read-only</span>
        <span>No wallet</span>
        <span>No transaction</span>
        <span>Device-local history</span>
      </div>
    </section>
  );
}

export function AnalyzerStudio({
  presets,
  initialCategory
}: Readonly<{
  presets: readonly TestnetAnalyzerPreset[];
  initialCategory: TestnetAnalyzerCategory;
}>) {
  const presetByCategory = useMemo(
    () => new Map(presets.map((preset) => [preset.category, preset])),
    [presets]
  );
  const [category, setCategory] = useState(initialCategory);
  const initialPreset = presetByCategory.get(initialCategory);
  if (initialPreset === undefined) throw new TypeError("Initial analyzer preset is missing.");
  const [input, setInput] = useState(initialPreset.inputJson);
  const [runState, setRunState] = useState<"idle" | "running" | "terminal">("idle");
  const [response, setResponse] = useState<AnalyzerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistory(loadHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const preset = presetByCategory.get(category);
  if (preset === undefined) throw new TypeError("Selected analyzer preset is missing.");
  const analyzer = testnetAnalyzerCatalog.find((entry) => entry.category === category);
  if (analyzer === undefined) throw new TypeError("Selected analyzer is missing.");

  function selectCategory(nextCategory: TestnetAnalyzerCategory): void {
    const nextPreset = presetByCategory.get(nextCategory);
    if (nextPreset === undefined) return;
    setCategory(nextCategory);
    setInput(nextPreset.inputJson);
    setRunState("idle");
    setResponse(null);
    setError(null);
  }

  function selectCategoryByKeyboard(index: number): void {
    const nextAnalyzer = testnetAnalyzerCatalog[index];
    if (nextAnalyzer === undefined) return;
    selectCategory(nextAnalyzer.category);
    window.requestAnimationFrame(() => {
      document.getElementById(`studio-tab-${nextAnalyzer.category}`)?.focus();
    });
  }

  async function runAnalysis(): Promise<void> {
    setError(null);
    setResponse(null);
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      setError("Input is not valid JSON. Correct it before contacting the analyzer.");
      return;
    }
    if (parsedInput === null || typeof parsedInput !== "object" || Array.isArray(parsedInput)) {
      setError("Input must be one JSON object.");
      return;
    }

    setRunState("running");
    try {
      const digest = await inputDigest(input);
      const apiResponse = await fetch("/api/analyzer-run", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ category, input: parsedInput }),
        cache: "no-store"
      });
      const unparsedResponse: unknown = await apiResponse.json();
      const parsedResponse = successResponseSchema.safeParse(unparsedResponse);
      if (!apiResponse.ok || !parsedResponse.success) {
        const blocked = errorResponseSchema.safeParse(unparsedResponse);
        setError(
          blocked.success
            ? `${blocked.data.code.replaceAll("_", " ")}: ${blocked.data.message}`
            : "The analyzer response could not be established. No result was recorded."
        );
        setRunState("terminal");
        return;
      }

      setResponse(parsedResponse.data);
      const nextEntry: HistoryEntry = {
        runId: parsedResponse.data.runId,
        category: parsedResponse.data.category,
        observedAtUtc: parsedResponse.data.observedAtUtc,
        decision: terminalDecision(parsedResponse.data),
        methodologyVersion: methodology(parsedResponse.data),
        inputSha256: digest,
        latencyMilliseconds: parsedResponse.data.latencyMilliseconds
      };
      const nextHistory = [
        nextEntry,
        ...history.filter(({ runId }) => runId !== nextEntry.runId)
      ].slice(0, MAXIMUM_HISTORY_ITEMS);
      setHistory(nextHistory);
      storeHistory(nextHistory);
      setRunState("terminal");
    } catch {
      setError("The bounded analyzer request failed. No result was recorded; retry is a new run.");
      setRunState("terminal");
    }
  }

  function clearHistory(): void {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      // The in-memory list is still cleared when browser storage is unavailable.
    }
  }

  return (
    <>
      <section className={styles.workspace} aria-labelledby="studio-workspace-heading">
        <div className={styles.agentRail} role="tablist" aria-label="Testnet analyzers">
          {testnetAnalyzerCatalog.map((entry, index) => (
            <button
              aria-controls="studio-analyzer-panel"
              aria-selected={entry.category === category}
              className={entry.category === category ? styles.activeAgent : undefined}
              id={`studio-tab-${entry.category}`}
              key={entry.category}
              onClick={() => selectCategory(entry.category)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  selectCategoryByKeyboard((index + 1) % testnetAnalyzerCatalog.length);
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  selectCategoryByKeyboard(
                    (index - 1 + testnetAnalyzerCatalog.length) % testnetAnalyzerCatalog.length
                  );
                } else if (event.key === "Home") {
                  event.preventDefault();
                  selectCategoryByKeyboard(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  selectCategoryByKeyboard(testnetAnalyzerCatalog.length - 1);
                }
              }}
              role="tab"
              tabIndex={entry.category === category ? 0 : -1}
              type="button"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{entry.shortLabel}</strong>
              <small>#{entry.agentId}</small>
            </button>
          ))}
        </div>

        <div className={styles.consoleGrid}>
          <section
            aria-labelledby={`studio-tab-${category}`}
            className={styles.inputPanel}
            id="studio-analyzer-panel"
            role="tabpanel"
            tabIndex={0}
          >
            <div className={styles.panelHeading}>
              <div>
                <span className="panel-overline">CALLER-SUPPLIED INPUT</span>
                <h2 id="studio-workspace-heading">{analyzer.label}</h2>
              </div>
              <span className={styles.liveEndpoint}>
                <span aria-hidden="true" /> Public A2A
              </span>
            </div>

            <div className={styles.presetNotice}>
              <div>
                <span
                  className={
                    preset.sourceState === "retained_testnet_replay"
                      ? "state-badge state-available"
                      : "state-badge state-caution"
                  }
                >
                  {preset.sourceState === "retained_testnet_replay"
                    ? "Retained testnet replay"
                    : "Synthetic scenario"}
                </span>
                <strong>{preset.title}</strong>
              </div>
              <p>{preset.description}</p>
              <code title={preset.sourceSha256}>{preset.sourceSha256}</code>
            </div>

            <label className={styles.editorLabel} htmlFor="analyzer-input">
              Analyzer input JSON
              <span>{input.length.toLocaleString("en-US")} characters</span>
            </label>
            <textarea
              aria-describedby="analyzer-input-boundary"
              className={styles.editor}
              id="analyzer-input"
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              value={input}
            />
            <p className={styles.editorBoundary} id="analyzer-input-boundary">
              Edit or replace the preset with your own source-bound input. ProofEra rejects mainnet,
              secret-bearing fields, mismatched skills, oversized bodies, and write-enabled output.
            </p>
            <div className={styles.runBar}>
              <button
                className="button button-primary button-arrow"
                disabled={runState === "running"}
                onClick={() => void runAnalysis()}
                type="button"
              >
                {runState === "running" ? "Running bounded analysis…" : "Run public analyzer"}
              </button>
              <div>
                <span>{analyzer.skill}</span>
                <small>Chain 97 · no signature · no transaction</small>
              </div>
            </div>
          </section>

          <aside className={styles.telemetry} aria-label="Analyzer boundary">
            <span className="eyebrow">LIVE PRODUCT BOUNDARY</span>
            <h2>One request. One inspectable result.</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Validate</strong>
                  <p>Exact category, skill, chain and body bounds.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Relay</strong>
                  <p>One fixed HTTPS endpoint; no caller URL or redirect.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Verify</strong>
                  <p>Agent must return chain 97 and execution disabled.</p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Retain locally</strong>
                  <p>Only a run summary and input digest stay on this device.</p>
                </div>
              </li>
            </ol>
            <div className={styles.endpointCard}>
              <span>Fixed endpoint</span>
              <code>{analyzer.endpoint}</code>
              <span>Expected method</span>
              <code>{analyzer.methodologyVersion}</code>
            </div>
          </aside>
        </div>
      </section>

      {runState === "running" ? (
        <section className={styles.runningPanel} aria-live="polite" role="status">
          <span className={styles.orbit} aria-hidden="true">
            <span />
          </span>
          <div>
            <span className="panel-overline">BOUNDED RUN IN PROGRESS</span>
            <h2>Waiting for {analyzer.shortLabel} analysis</h2>
            <p>No success is shown until a valid terminal A2A envelope returns.</p>
          </div>
        </section>
      ) : null}
      {error === null ? null : (
        <section className={styles.errorPanel} aria-live="assertive" role="alert">
          <span className="state-badge state-caution">No result recorded</span>
          <h2>The run failed closed.</h2>
          <p>{error}</p>
        </section>
      )}
      {response === null ? null : <ResultPanel response={response} />}

      <section className={styles.historyPanel} aria-labelledby="studio-history-heading">
        <div className={styles.historyHeading}>
          <div>
            <span className="eyebrow">DEVICE-LOCAL RUN HISTORY</span>
            <h2 id="studio-history-heading">Your last bounded analyses</h2>
          </div>
          <button disabled={history.length === 0} onClick={clearHistory} type="button">
            Clear local history
          </button>
        </div>
        {history.length === 0 ? (
          <div className={styles.emptyHistory}>
            <span>00</span>
            <p>No analysis has completed on this device. Missing history is not task evidence.</p>
          </div>
        ) : (
          <div className={styles.historyList}>
            {history.map((entry) => {
              const item = testnetAnalyzerCatalog.find(
                (candidate) => candidate.category === entry.category
              );
              return (
                <article key={entry.runId}>
                  <div>
                    <span className="state-badge state-available">Terminal</span>
                    <strong>{entry.decision.replaceAll("_", " ")}</strong>
                    <small>{item?.shortLabel ?? entry.category}</small>
                  </div>
                  <dl>
                    <div>
                      <dt>Observed</dt>
                      <dd>{new Date(entry.observedAtUtc).toLocaleString("en-GB")}</dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>{entry.latencyMilliseconds} ms</dd>
                    </div>
                    <div>
                      <dt>Input digest</dt>
                      <dd title={entry.inputSha256}>{entry.inputSha256.slice(0, 14)}…</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
