import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { i18nDict } from "@/shared/lib/i18n";

import { appRoutes as registeredRoutes } from "./groups/app-routes";
import { appRoutes } from "./route-manifest";

describe("route manifest", () => {
  it("covers the canonical navigation surface with forty or more entries", () => {
    expect(appRoutes.length).toBeGreaterThanOrEqual(40);
  });

  it("keeps every manifest path unique", () => {
    const paths = appRoutes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("labels every entry with a key that exists in both locale dictionaries", () => {
    for (const route of appRoutes) {
      expect(i18nDict.ko[route.label], route.path).toBeTruthy();
      expect(i18nDict.en[route.label], route.path).toBeTruthy();
    }
  });

  it("exposes the pricing route for the upcoming navigation links", () => {
    // 거버넌스 선언(S1-8)이 붙어 전체 객체 동등 비교는 쓸 수 없다 — 핵심 필드만 고정한다.
    expect(appRoutes.find((route) => route.path === "/pricing")).toMatchObject({
      path: "/pricing",
      label: "route.pricing",
    });
  });

  it("points every entry at a registered route instead of the 404 catch-all", () => {
    for (const { path } of appRoutes) {
      const matched = matchRoutes(registeredRoutes, path)?.at(-1)?.route;
      expect(matched?.id, path).toBeTruthy();
      expect(matched?.id, path).not.toBe("not-found");
    }
  });
});
