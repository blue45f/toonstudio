import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  RESEARCH_SOURCE_PROVIDERS,
  RESEARCH_SOURCE_ROUTE_PROVIDERS,
  researchSourceIdentity,
  researchSourceIdentityForRoute,
} from "./research-source-identity";
import { RESOURCE_SOURCES } from "./sources";

import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";

import type { ResourceProvider } from "@/shared/lib/creator-resources";

// 정체성 키트의 완전성 기준은 전체 제공처(RESOURCE_LABELS 정본)다 —
// 검색 템플릿 21곳만이 아니라 팩·도서 제공처까지 같은 표를 쓴다.
const ALL_PROVIDERS = Object.keys(RESOURCE_LABELS) as ResourceProvider[];
const IDENTITY_CSS = readFileSync(new URL("./research-source-identity.css", import.meta.url), "utf8");

describe("리서치 소스 정체성 키트", () => {
  it("전체 제공처에 정체성이 있다", () => {
    expect([...RESEARCH_SOURCE_PROVIDERS].sort()).toEqual([...ALL_PROVIDERS].sort());
    for (const provider of ALL_PROVIDERS) {
      const identity = researchSourceIdentity(provider);
      expect(identity.provider).toBe(provider);
      // 이름은 카드 배지와 같은 정본 라벨의 이름 부분을 쓴다.
      expect(identity.name).toBe(RESOURCE_LABELS[provider].split(" · ")[0]);
      expect(identity.name.length).toBeGreaterThan(0);
      // 한 줄 정체성 — 줄바꿈 없이 한 문장으로 읽힌다.
      expect(identity.tagline).not.toContain("\n");
      expect(identity.tagline.length).toBeGreaterThanOrEqual(10);
      expect(identity.tagline.length).toBeLessThanOrEqual(80);
      expect(identity.glyph.length).toBeGreaterThanOrEqual(1);
      expect(identity.glyph.length).toBeLessThanOrEqual(2);
    }
  });

  it("대표 비주얼은 실재하는 기존 브랜드 일러스트만 쓰고, 소스끼리 겹치지 않는다", () => {
    const usedArt = new Map<string, string>();
    for (const provider of ALL_PROVIDERS) {
      const { art } = researchSourceIdentity(provider);
      if (!art) continue;
      expect(usedArt.has(art), `${provider}의 아트 ${art}가 ${usedArt.get(art)}와 겹친다`).toBe(false);
      usedArt.set(art, provider);
      const artPath = fileURLToPath(new URL(`../../../public/brand/illustrated-20260928/${art}.webp`, import.meta.url));
      expect(existsSync(artPath), `${provider}의 대표 비주얼 ${art}.webp 파일이 없다`).toBe(true);
    }
  });

  it("제공처마다 CSS 액센트 토큰이 있고 색상(hue)이 서로 겹치지 않는다", () => {
    const hues = new Map<number, string>();
    for (const provider of ALL_PROVIDERS) {
      const block = new RegExp(`\\.research-source--${provider}\\s*\\{([^}]*)\\}`, "u").exec(IDENTITY_CSS);
      expect(block, `${provider}의 액센트 토큰 블록이 CSS에 없다`).toBeTruthy();
      const accent = /--source-accent:\s*oklch\([\d.]+ [\d.]+ ([\d.]+)\)/u.exec(block?.[1] ?? "");
      const deep = /--source-accent-deep:\s*oklch\([\d.]+ [\d.]+ ([\d.]+)\)/u.exec(block?.[1] ?? "");
      expect(accent, `${provider}의 --source-accent가 oklch 토큰이 아니다`).toBeTruthy();
      expect(deep, `${provider}의 --source-accent-deep가 oklch 토큰이 아니다`).toBeTruthy();
      const hue = Number(accent?.[1]);
      expect(hues.has(hue), `${provider}의 hue ${hue}가 ${hues.get(hue)}와 겹친다`).toBe(false);
      hues.set(hue, provider);
      // 표지 그라디언트의 짙은 쪽도 같은 색상이어야 정체성이 유지된다.
      expect(Number(deep?.[1])).toBe(hue);
    }
  });

  it("경로 바인딩은 출처 디렉터리가 실제로 쓰는 기능 경로와만 이어진다", () => {
    const usedRoutes = new Set(RESOURCE_SOURCES.map((source) => source.productRoute).filter(Boolean));
    for (const [route, provider] of Object.entries(RESEARCH_SOURCE_ROUTE_PROVIDERS)) {
      // 바인딩 키는 디렉터리 행이 실제로 가진 productRoute여야 한다(낡은 바인딩 방지).
      expect(usedRoutes.has(route), `${route}를 productRoute로 가진 디렉터리 행이 없다`).toBe(true);
      expect(researchSourceIdentityForRoute(route)?.provider).toBe(provider);
    }
    // 경로가 없거나 바인딩되지 않은 행은 정체성을 확정하지 않는다.
    expect(researchSourceIdentityForRoute(undefined)).toBeNull();
    expect(researchSourceIdentityForRoute("/research")).toBeNull();
  });
});
