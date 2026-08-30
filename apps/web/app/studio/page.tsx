import type { Metadata } from "next";

import {
  testnetAnalyzerCategorySchema,
  type TestnetAnalyzerCategory
} from "../../lib/testnet-analyzer-catalog";
import { loadTestnetAnalyzerPresets } from "../../lib/testnet-analyzer-presets.server";
import { AnalyzerStudio } from "./analyzer-studio";
import styles from "./studio.module.css";

export const metadata: Metadata = {
  title: "Testnet analyzer studio",
  description:
    "Run ProofEra's four public BSC-testnet analyzers through one bounded, inspectable, read-only product workflow."
};

export const dynamic = "force-dynamic";

interface StudioPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function selectedCategory(value: string | string[] | undefined): TestnetAnalyzerCategory {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = testnetAnalyzerCategorySchema.safeParse(candidate);
  return parsed.success ? parsed.data : "lp-rebalancing";
}

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const query = await searchParams;
  const initialCategory = selectedCategory(query.agent);
  const presets = loadTestnetAnalyzerPresets();

  return (
    <main id="main-content" tabIndex={-1}>
      <header className={["shell", styles.hero].join(" ")}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">BSC TESTNET 97 · LIVE ANALYZER WORKSPACE</span>
          <p className="mono-kicker">FOUR AGENTS / ONE EVIDENCE BOUNDARY</p>
          <h1>Turn sourced DeFi inputs into decisions you can inspect.</h1>
          <p className="lede">
            Run every registered ProofEra analyzer from one product interface. Each request is
            pinned to a public agent endpoint, each response remains read-only, and every missing
            fact stays missing.
          </p>
          <div className={styles.heroSignals} aria-label="Studio guarantees">
            <span>
              <strong>4</strong> public analyzers
            </span>
            <span>
              <strong>97</strong> chain locked
            </span>
            <span>
              <strong>0</strong> wallet prompts
            </span>
          </div>
        </div>
        <aside className={styles.heroBoundary} aria-labelledby="studio-boundary-heading">
          <div className={styles.signalCore} aria-hidden="true">
            <span />
            <span />
            <span />
            <strong>P</strong>
          </div>
          <div>
            <span className="state-badge state-available">Read-only rail configured</span>
            <h2 id="studio-boundary-heading">Analysis is live. Execution stays separate.</h2>
            <p>
              This studio sends no transaction, accesses no wallet, creates no authority, and does
              not convert a scenario or replay into present-market evidence.
            </p>
          </div>
        </aside>
      </header>

      <div className={["shell", styles.flowRail].join(" ")} aria-label="Product workflow">
        <span>Choose agent</span>
        <i aria-hidden="true" />
        <span>Review source state</span>
        <i aria-hidden="true" />
        <span>Run bounded analysis</span>
        <i aria-hidden="true" />
        <span>Inspect result</span>
      </div>

      <div className="shell">
        <AnalyzerStudio initialCategory={initialCategory} presets={presets} />
      </div>
    </main>
  );
}
