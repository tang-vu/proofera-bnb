import {
  PROOFERA_SERVICE_NAME,
  publicBuildIdentifier,
  RUNTIME_STATUS_SCHEMA_VERSION
} from "../../../lib/runtime-readiness";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-ProofEra-Service": PROOFERA_SERVICE_NAME
} as const;

/** Liveness only. Configuration and judge-journey readiness live at /api/readiness. */
export function createHealthResponse(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Response {
  return Response.json(
    {
      build: publicBuildIdentifier(environment),
      schemaVersion: RUNTIME_STATUS_SCHEMA_VERSION,
      service: PROOFERA_SERVICE_NAME,
      status: "ok"
    },
    { headers: responseHeaders }
  );
}

export function GET(): Response {
  return createHealthResponse();
}
