import "server-only";

import { lstat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  altanaTestActionPublicStateSchema,
  type AltanaTestActionPublicState
} from "@proofera/integrations";

const MAX_PUBLIC_STATE_BYTES = 32_768;

export type AltanaWorkerPublicStateResult =
  | { readonly availability: "available"; readonly state: AltanaTestActionPublicState }
  | {
      readonly availability: "unavailable";
      readonly reason: "runtime_not_configured" | "worker_not_started" | "invalid_public_state";
    };

export async function readAltanaWorkerPublicState(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<AltanaWorkerPublicStateResult> {
  const localAppData = environment.LOCALAPPDATA?.trim();
  if (localAppData === undefined || localAppData.length === 0) {
    return { availability: "unavailable", reason: "runtime_not_configured" };
  }
  const base = resolve(localAppData);
  const directory = resolve(base, "ProofEra", "altana-test-action-v1");
  if (!directory.startsWith(`${base}${sep}`)) {
    return { availability: "unavailable", reason: "runtime_not_configured" };
  }
  const path = resolve(directory, "public-state.json");
  try {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 2 ||
      stat.size > MAX_PUBLIC_STATE_BYTES
    ) {
      return { availability: "unavailable", reason: "invalid_public_state" };
    }
    const state = altanaTestActionPublicStateSchema.safeParse(
      JSON.parse(await readFile(path, "utf8")) as unknown
    );
    return state.success
      ? { availability: "available", state: state.data }
      : { availability: "unavailable", reason: "invalid_public_state" };
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
      ? { availability: "unavailable", reason: "worker_not_started" }
      : { availability: "unavailable", reason: "invalid_public_state" };
  }
}
