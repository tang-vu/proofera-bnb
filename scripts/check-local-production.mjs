const publicMode = process.argv.includes("--public");
const marketplaceOrigin = publicMode ? "https://proofera.tangvu.dev" : "http://127.0.0.1:3030";
const agentOrigins = publicMode
  ? [
      ["lp-range", "https://proofera-lp.tangvu.dev"],
      ["grid-trading", "https://proofera-grid.tangvu.dev"],
      ["yield-optimisation", "https://proofera-yield.tangvu.dev"],
      ["health-factor", "https://proofera-health.tangvu.dev"]
    ]
  : [
      ["lp-range", "http://127.0.0.1:9101"],
      ["grid-trading", "http://127.0.0.1:9102"],
      ["yield-optimisation", "http://127.0.0.1:9103"],
      ["health-factor", "http://127.0.0.1:9104"]
    ];

const probes = [
  {
    name: "marketplace",
    url: `${marketplaceOrigin}/api/health`,
    validate: (body) => body?.service === "proofera-marketplace" && body?.status === "ok"
  },
  ...agentOrigins.map(([name, origin]) => ({
    name,
    url: `${origin}/ping`,
    validate: (body) => body?.status === "HEALTHY" && body?.executionEnabled === false
  })),
  ...(publicMode
    ? agentOrigins.map(([name, origin]) => ({
        name: `${name}-card`,
        url: `${origin}/.well-known/agent-card.json`,
        validate: (body) =>
          body?.url === `${origin}/` &&
          body?.protocolVersion === "0.3.0" &&
          body?.skills?.length > 0
      }))
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
    const body = contentType.toLowerCase().includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok || !probe.validate(body)) {
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
