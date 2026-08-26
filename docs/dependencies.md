# Dependencies and license boundary

Updated: 2026-08-26. The exact dependency graph is pinned by the root and isolated workspace
lockfiles. This document is a human-readable inventory, not legal advice, a complete SBOM, or proof
that every distribution obligation has been discharged.

## Marketplace runtime

| Dependency        | Pinned version | Declared license | Purpose                                                       |
| ----------------- | -------------- | ---------------- | ------------------------------------------------------------- |
| Next.js           | 16.3.0         | MIT              | server-rendered marketplace and API routes                    |
| React / React DOM | 19.2.8         | MIT              | user interface                                                |
| Zod               | 4.4.3          | MIT              | runtime validation                                            |
| viem              | 2.55.13        | MIT              | typed EVM encoding and public-chain primitives                |
| Altana SDK        | 0.7.0          | GPL-3.0-or-later | WebAuthn wallet, scoped session grant, relay call, and revoke |
| lucide-react      | 1.31.0         | ISC              | icons                                                         |
| tldts             | 7.4.9          | MIT              | pinned public-suffix / RP-ID validation                       |
| server-only       | 0.0.1          | MIT              | server-boundary marker                                        |

The MIT file at the repository root covers ProofEra-authored source. Third-party packages retain
their own licenses. In particular, the Altana SDK declares GPL-3.0-or-later; any distributed web
bundle or source offer must be reviewed for and comply with the applicable GPL obligations. The
repository does not claim that the existence of this inventory alone completes that review.

## Isolated workspaces

Each reference agent and test contract has its own exact package manifest or lockfile. The analyzer
runtimes use exact-pinned A2A/MCP/HTTP/schema dependencies; the contract packages use exact-pinned
compiler and OpenZeppelin inputs. Those package manifests are authoritative for workspace-specific
versions.

## Audit commands

Run dependency checks without printing package-manager configuration or environment variables:

    corepack pnpm install --frozen-lockfile
    corepack pnpm audit --prod --audit-level high

Agent- and contract-specific audit commands remain documented beside their workspaces. A passing
local audit is not a hosted CI result, legal review, or runtime-vulnerability guarantee.

The root production audit returned “No known vulnerabilities found” on 2026-08-26. The pnpm license
inventory command currently stops with ERR_PNPM_MISSING_PACKAGE_INDEX_FILE for the pinned Altana SDK
even after a frozen install. The table above was therefore checked against installed direct-package
manifests; a complete generated transitive SBOM/license artifact remains open.
