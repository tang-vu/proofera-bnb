"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const primaryNavigationItems = [
  { href: "/marketplace", key: "marketplace", label: "Marketplace", secondary: false },
  { href: "/studio", key: "studio", label: "Studio", secondary: false },
  { href: "/proof", key: "proof", label: "Proof room", secondary: false },
  { href: "/session-control", key: "session", label: "Session control", secondary: true },
  { href: "/mission-control", key: "mission", label: "Mission Control", secondary: true }
] as const;

export type PrimaryNavigationKey = (typeof primaryNavigationItems)[number]["key"];

const marketplaceRoutePrefixes = ["/agents/", "/configure/", "/reference-analyzers/"] as const;

const marketplaceRoutes = new Set([
  "/compare",
  "/lp-activate",
  "/marketplace",
  "/pancake-position",
  "/venus-health",
  "/yield-sources"
]);

export function primaryNavigationKey(pathname: string): PrimaryNavigationKey | null {
  if (
    marketplaceRoutes.has(pathname) ||
    marketplaceRoutePrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return "marketplace";
  }
  if (pathname === "/proof") return "proof";
  if (pathname === "/studio") return "studio";
  if (pathname === "/session-control" || pathname === "/operator-ceremony") return "session";
  if (pathname === "/mission-control") return "mission";
  return null;
}

export function SiteHeader() {
  const pathname = usePathname();
  const activeKey = primaryNavigationKey(pathname);

  return (
    <nav aria-label="Primary navigation" className="shell nav" data-site-header="persistent">
      <Link aria-label="ProofEra home" className="wordmark" href="/">
        <span aria-hidden="true" className="mark">
          P
        </span>
        ProofEra
      </Link>
      <div className="nav-links">
        {primaryNavigationItems.map((item) => (
          <Link
            aria-current={activeKey === item.key ? "page" : undefined}
            className={[
              activeKey === item.key ? "nav-current" : "",
              item.secondary === true ? "nav-secondary" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
        <span className="network-pill">BSC testnet 97</span>
      </div>
    </nav>
  );
}
