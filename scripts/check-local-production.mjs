const publicMode = process.argv.includes("--public");
const expectedBuildArgument = process.argv.find((argument) =>
  argument.startsWith("--expected-build=")
);
const expectedBuild = expectedBuildArgument?.slice("--expected-build=".length);

if (expectedBuild !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(expectedBuild)) {
  process.stderr.write("expected build identifier is invalid\n");
  process.exit(2);
}

const marketplaceOrigin = publicMode ? "https://proofera.tangvu.dev" : "http://127.0.0.1:3030";
const agentOrigins = publicMode
  ? [
      [
        "lp-range",
        "https://proofera-lp.tangvu.dev",
        ["analyze_lp_range", "audit_altana_permission_bundle"]
      ],
      ["grid-trading", "https://proofera-grid.tangvu.dev", ["analyze_grid_trading"]],
      ["yield-optimisation", "https://proofera-yield.tangvu.dev", ["analyze_yield_opportunities"]],
      ["health-factor", "https://proofera-health.tangvu.dev", ["analyze_venus_health_factor"]]
    ]
  : [
      ["lp-range", "http://127.0.0.1:9101", []],
      ["grid-trading", "http://127.0.0.1:9102", []],
      ["yield-optimisation", "http://127.0.0.1:9103", []],
      ["health-factor", "http://127.0.0.1:9104", []]
    ];

const probes = [
  {
    name: "marketplace",
    url: `${marketplaceOrigin}/api/health`,
    validate: (body) =>
      body?.service === "proofera-marketplace" &&
      body?.status === "ok" &&
      (expectedBuild === undefined || body?.build === expectedBuild)
  },
  ...agentOrigins.map(([name, origin]) => ({
    name,
    url: `${origin}/ping`,
    validate: (body) => body?.status === "HEALTHY" && body?.executionEnabled === false
  })),
  ...(publicMode
    ? agentOrigins.map(([name, origin, expectedSkills]) => ({
        name: `${name}-card`,
        url: `${origin}/.well-known/agent-card.json`,
        validate: (body) =>
          body?.url === `${origin}/` &&
          body?.protocolVersion === "0.3.0" &&
          Array.isArray(body?.skills) &&
          body.skills.every((skill) => skill !== null && typeof skill === "object") &&
          JSON.stringify(body.skills.map((skill) => skill.id)) === JSON.stringify(expectedSkills)
      }))
    : []),
  ...(publicMode && expectedBuild !== undefined
    ? [
        {
          name: "marketplace-proof-room",
          url: `${marketplaceOrigin}/proof`,
          responseKind: "text",
          validate: (body) =>
            typeof body === "string" &&
            body.includes(expectedBuild) &&
            body.includes("No — gates remain open") &&
            body.includes("audit_altana_permission_bundle")
        },
        {
          name: "marketplace-readiness",
          url: `${marketplaceOrigin}/api/readiness`,
          expectedStatus: 503,
          validate: (body) =>
            body?.build === expectedBuild &&
            body?.schemaVersion === "2" &&
            body?.status === "not_ready" &&
            body?.readyForAnalysisActivation === true &&
            body?.readyForCapitalActivation === false &&
            body?.readyForActivation === false &&
            body?.readyForJudging === false &&
            body?.capabilities?.activation === "analysis_only" &&
            body?.capabilities?.analysisActivation === "implemented" &&
            body?.capabilities?.capitalExecution === "unavailable"
        }
      ]
    : [])
];

const failures = [];

for (const probe of probes) {
  try {
    const response = await fetch(probe.url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000)
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body =
      probe.responseKind === "text"
        ? await response.text()
        : contentType.toLowerCase().includes("application/json")
          ? await response.json()
          : null;
    const statusAccepted =
      probe.expectedStatus === undefined ? response.ok : response.status === probe.expectedStatus;
    if (!statusAccepted || !probe.validate(body)) {
      failures.push(`${probe.name}: unexpected HTTP response`);
      continue;
    }
    process.stdout.write(`${probe.name}: ready\n`);
  } catch {
    failures.push(`${probe.name}: unavailable`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
