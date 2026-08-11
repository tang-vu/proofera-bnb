import {
  evaluateRuntimeReadiness,
  PROOFERA_SERVICE_NAME,
  type RuntimeReadinessReasonCode
} from "../../../lib/runtime-readiness";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-ProofEra-Service": PROOFERA_SERVICE_NAME
} as const;

type ReadinessLogger = (
  record: Readonly<{ event: string; reasonCode: RuntimeReadinessReasonCode }>
) => void;

export function createReadinessResponse(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  log: ReadinessLogger = (record) => console.error(JSON.stringify(record))
): Response {
  const evaluation = evaluateRuntimeReadiness(environment);
  log({ event: "runtime_readiness_not_ready", reasonCode: evaluation.reasonCode });
  return Response.json(evaluation.body, {
    headers: responseHeaders,
    status: evaluation.status
  });
}

export function GET(): Response {
  return createReadinessResponse();
}
