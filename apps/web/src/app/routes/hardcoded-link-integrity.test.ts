import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appRoutes } from "./groups/app-routes";

/**
 * 하드코딩된 내부 링크가 등록되지 않은 라우트(404 catch-all)로 가는 것을 막는 가드.
 *
 * 소스 전체에서 링크 맥락(to=/href= 속성, href:/to: 객체 키, navigate()/redirect() 호출)의
 * 루트 상대 경로 리터럴을 수집해 등록 라우트 표와 대조한다. API 경로처럼 링크가 아닌
 * 경로는 맥락으로 구분해 수집하지 않으므로, 여기에 걸리는 것은 전부 실제 내비게이션이다.
 */

// 링크가 아니라 public 정적 파일로 직접 서빙되는 목적지 (다운로드·독립 PWA 진입점).
const STATIC_FILE_TARGETS = new Set(["/creator-essentials/LICENSE.txt", "/offline-draw/"]);

/** 라우트 세그먼트에는 파일 확장자가 없으므로, 마지막 세그먼트에 "."가 있으면 정적 파일이다. */
function isStaticFileTarget(head: string): boolean {
  const lastSegment = head.split("/").filter(Boolean).at(-1) ?? "";
  return lastSegment.includes(".");
}

interface LinkLiteral {
  /** 쿼리·해시를 제거한 정적 부분. 템플릿이면 ${ 앞부분까지. */
  readonly head: string;
  /** 템플릿이거나 문자열 연결("/x/" + id)처럼 뒤에 동적 부분이 붙는 형태인지. */
  readonly dynamic: boolean;
}

const LINK_PATTERNS: readonly { readonly re: RegExp; readonly dynamic: boolean }[] = [
  // JSX 속성: to="/x" · href="/x" · to={"/x"}
  { re: /\b(?:to|href)\s*=\s*(?:\{\s*)?["'`](\/[^"'`$\s]*)["'`]/g, dynamic: false },
  // JSX 속성 템플릿: to={`/x/${id}`}
  { re: /\b(?:to|href)\s*=\s*\{\s*`(\/[^`]*)`/g, dynamic: true },
  // 객체 키: href: "/x" · to: "/x" (빈 상태 CTA, 레지스트리 목적지 등)
  { re: /\b(?:href|to)\s*:\s*["'`](\/[^"'`$\s]*)["'`]/g, dynamic: false },
  { re: /\b(?:href|to)\s*:\s*`(\/[^`]*)`/g, dynamic: true },
  // 명령형 이동: navigate("/x") · redirect("/x")
  { re: /\b(?:navigate|redirect)\(\s*["'`](\/[^"'`$\s]*)["'`]/g, dynamic: false },
  { re: /\b(?:navigate|redirect)\(\s*`(\/[^`]*)`/g, dynamic: true },
];

function toLinkLiteral(raw: string, template: boolean): LinkLiteral {
  let head = raw;
  let dynamic = template;
  const cut = head.search(/[?#]/);
  if (cut >= 0) head = head.slice(0, cut);
  if (template) {
    const dyn = head.indexOf("${");
    if (dyn >= 0) {
      head = head.slice(0, dyn);
      dynamic = true;
    } else {
      dynamic = false;
    }
  }
  // "/market/checkout/" + id 같은 문자열 연결은 정적 접두사로 취급한다.
  if (!dynamic && head.length > 1 && head.endsWith("/")) dynamic = true;
  if (head === "") head = "/";
  return { head, dynamic };
}

const registeredPatterns = appRoutes
  .map((route) => route.path)
  .filter((path) => path.startsWith("/"))
  .map((path) => path.split("/").filter(Boolean));

function segmentMatches(patternSegment: string, targetSegment: string): boolean {
  return patternSegment.startsWith(":") || patternSegment === targetSegment;
}

/** 동적 링크의 정적 접두사가 어떤 등록 라우트의 앞부분과 양립하는지. */
function prefixIsRoutable(head: string): boolean {
  // 마지막 "/" 앞까지의 완성된 세그먼트만으로 대조한다 (부분 세그먼트 오탐 방지).
  const complete = head.endsWith("/") ? head.slice(0, -1) : head.slice(0, head.lastIndexOf("/"));
  const segments = complete.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  return registeredPatterns.some((pattern) => {
    const splat = pattern.indexOf("*");
    const headPattern = splat >= 0 ? pattern.slice(0, splat) : pattern;
    if (splat < 0 && headPattern.length < segments.length) return false;
    // splat 패턴에서는 정적 접두사를 지난 세그먼트가 splat에 흡수된다.
    return segments.every(
      (segment, i) => i >= headPattern.length || segmentMatches(headPattern[i]!, segment),
    );
  });
}

const fullTargetCache = new Map<string, boolean>();

function fullTargetIsRoutable(head: string): boolean {
  const target = head.length > 1 && head.endsWith("/") ? head.slice(0, -1) : head;
  const cached = fullTargetCache.get(target);
  if (cached !== undefined) return cached;
  const matched = matchRoutes(appRoutes, target)?.at(-1)?.route;
  const ok = Boolean(matched?.id) && matched?.id !== "not-found";
  fullTargetCache.set(target, ok);
  return ok;
}

function collectLinkViolations(): string[] {
  const webSrcRoot = fileURLToPath(new URL("../../", import.meta.url));
  const violations: string[] = [];
  const visited = new Set<string>();

  const walk = (dir: string): void => {
    if (visited.has(dir)) return;
    visited.add(dir);
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === "__tests__") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(full))) continue;
      // 테스트와 그 픽스처는 실제 사용자 내비게이션이 아니므로 제외한다.
      if (/\.(?:test|spec)\.[jt]sx?$/u.test(name) || name.includes("-test-fixture.")) continue;

      const text = readFileSync(full, "utf8");
      const rel = relative(webSrcRoot, full);
      for (const { re, dynamic: template } of LINK_PATTERNS) {
        re.lastIndex = 0;
        for (const match of text.matchAll(re)) {
          const literal = toLinkLiteral(match[1]!, template);
          if (STATIC_FILE_TARGETS.has(literal.head)) continue;
          if (isStaticFileTarget(literal.head)) continue;
          // /api/ 아래는 클라이언트 라우트가 아니라 서버 API 표면(리다이렉트·다운로드)이다.
          if (literal.head === "/api" || literal.head.startsWith("/api/")) continue;
          const ok = literal.dynamic
            ? prefixIsRoutable(literal.head)
            : fullTargetIsRoutable(literal.head);
          if (!ok) {
            const line = text.slice(0, match.index).split("\n").length;
            violations.push(`${rel}:${line} -> ${literal.head}`);
          }
        }
      }
    }
  };

  walk(webSrcRoot);
  return violations;
}

describe("hardcoded link integrity", () => {
  // 소스 전수 walk는 부하가 큰 환경에서 기본 30초를 넘을 수 있어 명시적으로 늘린다.
  it("routes every hardcoded internal link at a registered route instead of the 404 catch-all", () => {
    expect(collectLinkViolations()).toEqual([]);
  }, 120_000);

  it("keeps the login CTAs on the canonical /auth/login route", () => {
    const versionShare = readFileSync(
      new URL("../../domains/creator/production-hub/VersionSharePage.tsx", import.meta.url),
      "utf8",
    );
    expect(versionShare).toContain('to="/auth/login"');
    expect(versionShare).not.toContain('to="/login"');

    const moderation = readFileSync(
      new URL("../../domains/promotion/PromotionModerationPage.tsx", import.meta.url),
      "utf8",
    );
    expect(moderation).toContain('href: "/auth/login"');
    expect(moderation).not.toContain('href: "/login"');
  });

  it("keeps sibling CTAs on registered routes", () => {
    const author = readFileSync(
      new URL("../../domains/catalog/AuthorPage.tsx", import.meta.url),
      "utf8",
    );
    expect(author).toContain('href: "/explore"');
    expect(author).not.toContain('"/browse"');

    const registry = readFileSync(
      new URL("../../domains/creator/studio-feature-surface-registry.ts", import.meta.url),
      "utf8",
    );
    expect(registry).toContain('href: "/market/manage"');
    expect(registry).not.toContain('"/market/seller"');

    const spotlight = readFileSync(
      new URL(
        "../../domains/creator-resources/material-discovery/MaterialHomeSpotlight.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(spotlight).toContain('href="/research/materials"');
    expect(spotlight).toContain('href="/research/materials#material-search"');
    expect(spotlight).not.toContain('href="/research/material-atlas');
  });

  it("registers the material atlas page at /research/materials", () => {
    const matched = matchRoutes(appRoutes, "/research/materials")?.at(-1)?.route;
    expect(matched?.id).toBe("resources-materials");
  });
});
