import { createHash } from "node:crypto";

/**
 * Stable JSON for hashes and equality checks. Numbers are limited to safe
 * integers; exact financial values belong in decimal-string minor units.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, new Set<object>());
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Hash supplied artifact/output bytes; the harness never fabricates content. */
export function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isCanonicalJsonText(value: string): boolean {
  try {
    return canonicalJson(JSON.parse(value) as unknown) === value;
  } catch {
    return false;
  }
}

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(
        "Canonical benchmark JSON accepts only safe integers; encode decimals as strings"
      );
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain cycles");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => encode(entry, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Canonical JSON cannot contain symbol-keyed values");
    }
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key], ancestors)}`);
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
