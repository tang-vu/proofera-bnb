import "server-only";

import type { AltanaLpDurableReservationDependency } from "./altana-lp-handoff";

declare const verifiedAltanaLpDurableReservationDependencyBrand: unique symbol;

export type VerifiedAltanaLpDurableReservationDependency = AltanaLpDurableReservationDependency &
  Readonly<{
    [verifiedAltanaLpDurableReservationDependencyBrand]: true;
  }>;

const VERIFIED_DURABLE_RESERVATION_DEPENDENCIES = new WeakSet<object>();

/**
 * Internal mint used only by the verified PostgreSQL pool composition. This
 * module is deliberately absent from package exports.
 */
export function registerVerifiedAltanaLpDurableReservationDependency(
  dependency: AltanaLpDurableReservationDependency
): VerifiedAltanaLpDurableReservationDependency {
  VERIFIED_DURABLE_RESERVATION_DEPENDENCIES.add(dependency);
  return dependency as VerifiedAltanaLpDurableReservationDependency;
}

/** Checks capability provenance without reading attacker-controlled fields. */
export function isVerifiedAltanaLpDurableReservationDependency(
  input: unknown
): input is VerifiedAltanaLpDurableReservationDependency {
  if ((typeof input !== "object" && typeof input !== "function") || input === null) {
    return false;
  }
  try {
    return VERIFIED_DURABLE_RESERVATION_DEPENDENCIES.has(input);
  } catch {
    return false;
  }
}
