import { NextResponse } from "next/server";

import { readAltanaWorkerPublicState } from "../../../../lib/altana-worker-public-state.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAltanaWorkerPublicState(), {
    headers: { "cache-control": "no-store, max-age=0" }
  });
}
