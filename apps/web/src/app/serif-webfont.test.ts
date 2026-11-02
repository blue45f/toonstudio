// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  SERIF_WEBFONT_CSS2_URL,
  SERIF_WEBFONT_LINK_ID,
  ensureSerifWebFontForRoute,
} from "./serif-webfont";

function injectedHrefs(): string[] {
  return [...document.head.querySelectorAll(`link#${SERIF_WEBFONT_LINK_ID}`)].map(
    (link) => (link as HTMLLinkElement).getAttribute("href") ?? "",
  );
}

describe("ensureSerifWebFontForRoute", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it.each(["/studio", "/studio/", "/studio/tools-companion"])(
    "%s 에서는 주입하지 않는다 — 스튜디오는 자체 idle 프리로드가 명조를 담당한다",
    (pathname) => {
      ensureSerifWebFontForRoute(pathname, document);
      expect(injectedHrefs()).toEqual([]);
    },
  );

  it.each(["/", "/explore", "/fortune", "/reviews", "/design", "/production/projects/example/review"])(
    "%s 에서는 명조 스타일시트를 주입한다",
    (pathname) => {
      ensureSerifWebFontForRoute(pathname, document);
      expect(injectedHrefs()).toEqual([SERIF_WEBFONT_CSS2_URL]);
    },
  );

  it("반복 호출해도 <link> 는 하나만 남는다(멱등)", () => {
    ensureSerifWebFontForRoute("/", document);
    ensureSerifWebFontForRoute("/explore", document);
    ensureSerifWebFontForRoute("/", document);
    expect(injectedHrefs()).toHaveLength(1);
  });

  it("같은 명조 400·700의 분할 CSS만 로컬에서 지연 로드한다", () => {
    expect(SERIF_WEBFONT_CSS2_URL).toBe("/fonts/nanum-myeongjo/v31/nanum-myeongjo.css");
    const css = readFileSync(join(process.cwd(), "apps/web/public", SERIF_WEBFONT_CSS2_URL), "utf8");
    const faces = [...css.matchAll(/@font-face\s*\{([^{}]+)\}/gu)].map((match) => match[1]!);
    expect(faces).toHaveLength(184);
    expect(new Set(faces.map((face) => face.match(/font-weight:\s*(\d+)\s*;/u)?.[1])))
      .toEqual(new Set(["400", "700"]));
    for (const face of faces) {
      expect(face).toContain("font-family: 'Nanum Myeongjo';");
      expect(face).toContain("font-display: swap;");
      expect(face).toContain("unicode-range:");
      expect(face).toMatch(/src:\s*url\(\/fonts\/nanum-myeongjo\/v31\//u);
    }
    expect(css).not.toMatch(/https?:\/\//u);
  });
});
