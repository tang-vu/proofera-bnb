import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname
}));

import { primaryNavigationItems, primaryNavigationKey, SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("keeps one ordered primary navigation contract on every route", () => {
    expect(primaryNavigationItems.map(({ href, label }) => [href, label])).toEqual([
      ["/marketplace", "Marketplace"],
      ["/studio", "Studio"],
      ["/proof", "Proof room"],
      ["/session-control", "Session control"],
      ["/mission-control", "Mission Control"]
    ]);

    const baselineLinks = renderToStaticMarkup(<SiteHeader />).match(/href="[^"]+"/gu);
    for (const pathname of [
      "/marketplace",
      "/studio",
      "/proof",
      "/session-control",
      "/mission-control"
    ]) {
      navigation.pathname = pathname;
      expect(renderToStaticMarkup(<SiteHeader />).match(/href="[^"]+"/gu)).toEqual(baselineLinks);
    }
  });

  it.each([
    ["/", null],
    ["/marketplace", "marketplace"],
    ["/agents/97/1825", "marketplace"],
    ["/configure/lp-rebalancing", "marketplace"],
    ["/reference-analyzers/grid-trading", "marketplace"],
    ["/pancake-position", "marketplace"],
    ["/studio", "studio"],
    ["/proof", "proof"],
    ["/session-control", "session"],
    ["/operator-ceremony", "session"],
    ["/mission-control", "mission"]
  ])("maps %s to the stable %s navigation state", (pathname, expected) => {
    expect(primaryNavigationKey(pathname)).toBe(expected);
  });

  it("changes only aria-current for the active route", () => {
    navigation.pathname = "/proof";
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain('data-site-header="persistent"');
    expect(html).toMatch(/<a(?=[^>]*href="\/proof")(?=[^>]*aria-current="page")[^>]*>/u);
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
  });
});
