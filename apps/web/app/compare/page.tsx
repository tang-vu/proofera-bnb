import type { Scan8004GetAgentResult } from "@proofera/integrations";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { parseComparisonSelection, type ComparisonSearchParams } from "../../lib/comparison-query";
import { loadRegistryAgent } from "../../lib/registry";

export const metadata: Metadata = { title: "Compare agents" };
export const dynamic = "force-dynamic";

interface ComparePageProps {
  readonly searchParams: Promise<ComparisonSearchParams>;
}

function cleanText(value: string | null | undefined, fallback: string, maximum = 100): string {
  if (value === null || value === undefined) return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return fallback;
  return cleaned.length > maximum ? `${cleaned.slice(0, maximum - 1)}…` : cleaned;
}

function shortAddress(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length < 12) return "Unknown";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function resultLabel(result: Scan8004GetAgentResult): string {
  if (result.status === "available") {
    return cleanText(result.agent.name, `Agent #${result.agent.token_id}`);
  }
  return result.status === "not_found" ? "Identity not found" : "Source unavailable";
}

function AvailableValue({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="comparison-value">{children}</span>;
}

function UnknownValue({ reason }: Readonly<{ reason: string }>) {
  return (
    <span className="comparison-unknown">
      <span className="state-badge state-unknown">Unknown</span>
      <span>{reason}</span>
    </span>
  );
}

function IdentityCell({
  result,
  field
}: Readonly<{
  result: Scan8004GetAgentResult;
  field: "source" | "owner" | "indexed" | "score" | "feedback" | "protocols";
}>) {
  if (result.status !== "available") {
    return (
      <span className="comparison-unknown">
        <span className="state-badge state-caution">
          {result.status === "not_found" ? "Not found" : "Unavailable"}
        </span>
        <span>{result.message}</span>
      </span>
    );
  }

  if (field === "source") {
    return (
      <AvailableValue>
        8004scan · {new Date(result.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </AvailableValue>
    );
  }
  if (field === "owner") {
    return <AvailableValue>{shortAddress(result.agent.owner_address)}</AvailableValue>;
  }
  if (field === "indexed") {
    return (
      <AvailableValue>
        {result.agent.created_at === null || result.agent.created_at === undefined
          ? "Unknown"
          : `${new Date(result.agent.created_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`}
      </AvailableValue>
    );
  }
  if (field === "score") {
    return <AvailableValue>{result.agent.total_score ?? "Unknown"}</AvailableValue>;
  }
  if (field === "feedback") {
    return <AvailableValue>{result.agent.total_feedbacks ?? "Unknown"}</AvailableValue>;
  }
  return (
    <AvailableValue>
      {result.agent.supported_protocols === null ||
      result.agent.supported_protocols === undefined ||
      result.agent.supported_protocols.length === 0
        ? "Not supplied"
        : cleanText(result.agent.supported_protocols.join(", "), "Not supplied", 220)}
    </AvailableValue>
  );
}

const unknownRows = [
  ["Category fitness", "No independent strategy classification."],
  ["Endpoint / uptime", "No verified probe series or observation window."],
  ["Executions / success", "No independently decoded BSC history."],
  ["Fees / all-in costs", "No reviewed, source-linked fee schedule."],
  ["Worst observed outcome", "No category outcome series or downside method."],
  ["Permission scope", "No reviewed call, spend, expiry, or revoke evidence."],
  ["Proof Score", "Insufficient validated ProofEra evidence."]
] as const;

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const selection = parseComparisonSelection(await searchParams);

  return (
    <main id="main-content" tabIndex={-1}>
      <header className="shell comparison-header">
        <span className="eyebrow">TRADE-OFFS BEFORE AUTHORITY</span>
        <h1>Compare the evidence, including what is missing.</h1>
        <p className="lede">
          Registry identity fields share one table. Category outcomes, downside, costs and
          permissions remain unknown until independently sourced; an upstream score never fills
          those gaps.
        </p>
      </header>

      {selection.status === "invalid" ? (
        <section className="shell comparison-selection-error" role="alert">
          <span className="state-badge state-caution">Selection required</span>
          <h2>Choose two to four agents.</h2>
          <p>
            {selection.reason === "too_many"
              ? "More than four identities were submitted."
              : selection.reason === "ambiguous_query"
                ? "Use either repeated agent parameters or repeated agents parameters, not both."
                : selection.reason === "invalid_identity"
                  ? "At least one identity used an unsupported chain or invalid token ID."
                  : "Fewer than two unique identities were selected."}
          </p>
          <Link className="button button-primary" href="/marketplace">
            Select marketplace agents
          </Link>
        </section>
      ) : (
        <ComparisonTable
          results={await Promise.all(
            selection.agents.map((agent) => loadRegistryAgent(agent.chainId, agent.tokenId))
          )}
        />
      )}
    </main>
  );
}

function ComparisonTable({ results }: Readonly<{ results: readonly Scan8004GetAgentResult[] }>) {
  return (
    <section className="shell comparison-section">
      <p className="comparison-scroll-cue" id="comparison-scroll-cue">
        On narrow screens, scroll horizontally to inspect every selected agent.
      </p>
      <div
        aria-describedby="comparison-scroll-cue"
        aria-labelledby="comparison-table-heading"
        className="comparison-table-scroll"
        role="region"
        tabIndex={0}
      >
        <table className="comparison-table">
          <caption id="comparison-table-heading">Identity and evidence comparison</caption>
          <thead>
            <tr>
              <th scope="col">Evidence</th>
              {results.map((result, index) => (
                <th key={`${result.sourceUrl}:${index}`} scope="col">
                  <span>{resultLabel(result)}</span>
                  <span className="state-badge state-caution">Activation locked</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Source / observed", "source"],
                ["Registry owner", "owner"],
                ["Indexed time", "indexed"],
                ["8004scan score · not Proof Score", "score"],
                ["Feedback sample", "feedback"],
                ["Self-declared protocols", "protocols"]
              ] as const
            ).map(([label, field]) => (
              <tr key={field}>
                <th scope="row">{label}</th>
                {results.map((result, index) => (
                  <td key={`${result.sourceUrl}:${field}:${index}`}>
                    <IdentityCell field={field} result={result} />
                  </td>
                ))}
              </tr>
            ))}
            {unknownRows.map(([label, reason]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {results.map((result, index) => (
                  <td key={`${result.sourceUrl}:${label}:${index}`}>
                    <UnknownValue reason={reason} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">Inspect</th>
              {results.map((result, index) => (
                <td key={`${result.sourceUrl}:inspect:${index}`}>
                  {result.status === "available" ? (
                    <Link
                      className="text-link"
                      href={`/agents/${result.agent.chain_id}/${result.agent.token_id}`}
                    >
                      Open Passport
                    </Link>
                  ) : (
                    <span className="locked-action">No Passport evidence</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <footer className="registry-footnote">
        <strong>No winner is selected:</strong> the compared records do not contain enough
        independent, category-specific evidence for suitability, ranking or capital authority.
      </footer>
    </section>
  );
}
