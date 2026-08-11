import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ProofEra — Hire agents by proof",
    template: "%s — ProofEra"
  },
  description:
    "Discover, verify, compare, control, and revoke autonomous DeFi agents on BNB Smart Chain."
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d0c"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
