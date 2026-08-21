import type { NextConfig } from "next";

const production = process.env.NODE_ENV === "production";
// Exact chain-97 browser endpoints pinned by @altananetwork/sdk 0.7.0 and reviewed in
// evidence/altana/preparations/125493138-bsc-testnet-readiness.json. Do not broaden this list.
const altanaBscTestnetConnectSources = [
  "https://testnet-relay.altana.network",
  "https://bsc-testnet-rpc.publicnode.com"
] as const;
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src 'self' ${altanaBscTestnetConnectSources.join(" ")}${production ? "" : " ws: wss:"}`,
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }
] as const;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
  },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@altananetwork/sdk"],
  transpilePackages: ["@proofera/domain", "@proofera/integrations"],
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;
