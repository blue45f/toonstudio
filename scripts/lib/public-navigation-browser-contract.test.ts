import { describe, expect, it } from "vitest";

import { assertPublicMobileNavigationSnapshot, assertPublicTaskNavigationSnapshot } from "./public-navigation-browser-contract.mjs";

const origin = "https://www.toonstudio.cloud";
const sample = () => ({
  links: [
    { href: "/home", label: "스튜디오", current: null as string | null },
    { href: "/studio", label: "작품", current: null as string | null },
    { href: "/team", label: "팀", current: null as string | null },
    { href: "/hub", label: "둘러보기", current: "page" as string | null },
  ], title: "소재 찾기", parentHref: "/hub", returnHref: "/home",
});

const mobileSample = (current: string | null = null) => ({
  links: ["/studio", "/discover", "/market", "/my", "/sitemap"].map((href) => ({
    href, current: href === current ? "page" : null,
  })),
});

describe("모바일의 다섯 정본 목적지 계약", () => {
  it.each([["/community", null], ["/market", "/market"], ["/research/assets", "/market"], ["/showcase", "/discover"], ["/sitemap/create", "/sitemap"]])(
    "%s의 현재 목적지와 순서를 보존한다", (route, current) => {
      expect(() => assertPublicMobileNavigationSnapshot(mobileSample(current), route, origin)).not.toThrow();
    },
  );
  it.each(["old-four", "duplicate", "wrong-order", "external", "wrong-current"])("%s 회귀를 통과시키지 않는다", (kind) => {
    const snapshot = mobileSample();
    if (kind === "old-four") snapshot.links.pop();
    if (kind === "duplicate") snapshot.links[4] = snapshot.links[0]!;
    if (kind === "wrong-order") snapshot.links.reverse();
    if (kind === "external") snapshot.links[0]!.href = "https://other.invalid/studio";
    if (kind === "wrong-current") snapshot.links[0]!.current = "page";
    expect(() => assertPublicMobileNavigationSnapshot(snapshot, "/community", origin)).toThrow();
  });
});

describe("public task navigation remains an exact contract", () => {
  it.each([["/market", "소재 찾기"], ["/showcase", "창작 작품"], ["/discover", "작품 찾기"]])(
    "accepts the declared explore destination %s", (route, title) => {
      expect(() => assertPublicTaskNavigationSnapshot({ ...sample(), title }, route, origin)).not.toThrow();
    },
  );
  it("keeps support breadcrumb and no false current primary destination", () => {
    const snapshot = sample(); snapshot.links[3]!.current = null;
    expect(() => assertPublicTaskNavigationSnapshot({ ...snapshot, title: "도움말", parentHref: "/home" }, "/help", origin)).not.toThrow();
  });
  it("retains same-origin contextual workspace links", () => {
    const snapshot = sample(); snapshot.links[0]!.href = "/home?project=author-a";
    snapshot.returnHref = "/home?project=author-a";
    expect(() => assertPublicTaskNavigationSnapshot(snapshot, "/market", origin)).not.toThrow();
  });
  it.each(["missing", "duplicate", "wrong-order", "external", "wrong-label", "wrong-active"]) (
    "rejects %s primary navigation instead of a generic container pass", (kind) => {
      const snapshot = sample();
      if (kind === "missing") snapshot.links.pop();
      if (kind === "duplicate") snapshot.links.push(snapshot.links[0]!);
      if (kind === "wrong-order") snapshot.links.reverse();
      if (kind === "external") snapshot.links[0]!.href = "https://other.invalid/home";
      if (kind === "wrong-label") snapshot.links[1]!.label = "Not works";
      if (kind === "wrong-active") snapshot.links[0]!.current = "page";
      expect(() => assertPublicTaskNavigationSnapshot(snapshot, "/market", origin)).toThrow();
    },
  );
  it.each(["wrong-title", "wrong-parent", "missing-return", "external-return", "undeclared-route"]) (
    "rejects %s page context", (kind) => {
      const snapshot = sample();
      if (kind === "wrong-title") snapshot.title = "도움말";
      if (kind === "wrong-parent") snapshot.parentHref = "/studio";
      if (kind === "missing-return") snapshot.returnHref = "";
      if (kind === "external-return") snapshot.returnHref = "https://other.invalid/home";
      expect(() => assertPublicTaskNavigationSnapshot(snapshot, kind === "undeclared-route" ? "/support" : "/market", origin + "/market")).toThrow();
    },
  );
});
