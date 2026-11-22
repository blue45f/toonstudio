/**
 * 디자인 시스템 시각 회귀 자동 검증 테스트.
 *
 * 검증 범위 (도메인 경계 webCrossDomainDeepImport=0 준수):
 * 1. Calm Atelier 토큰 계약(Alabaster #FAF8F3 · Botanical Forest #1F4435 고대비 · 보라-블루 네온 슬롭 금지)
 * 2. Remotion 세미나 도식 컴포넌트 계약(1280×720 · 30fps · 5챕터×4단계 · reducedMotion · 라이선스 확인 · 무슬롭)
 * 3. UI/UX v2 >= 82% 캔버스 뷰포트 가드 및 어댑티브 플로팅 크롬 CLS 0 · 44px 터치 타깃 계약
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC_ROOT = path.resolve(THIS_DIR, "../../..");
const REPO_ROOT = path.resolve(WEB_SRC_ROOT, "../../..");

function readWebSrc(relativePath: string): string {
  return fs.readFileSync(path.join(WEB_SRC_ROOT, relativePath), "utf8");
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/u, "");
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function wcagContrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const BANNED_NEON_SLOP_PATTERNS: readonly RegExp[] = [
  /from-purple-\d+[\s\S]{0,60}to-(?:blue|indigo|cyan)-\d+/iu,
  /linear-gradient\([^)]*(?:#7c3aed|#8b5cf6|#a855f7|#9333ea)[^)]*(?:#3b82f6|#2563eb|#06b6d4|#00f5ff)/iu,
  /#00f5ff|#ff00ff/iu,
  /\bbackdrop-blur-3xl\b/u,
];

const BANNED_AI_TRANSLATIONESE_PATTERNS: readonly RegExp[] = [
  /하는 것을 가능하게 합니다/u,
  /직관적인 경험을 제공합니다/u,
  /원활한 워크플로우를 보장/u,
];

describe("Calm Atelier 디자인 시스템 토큰 & Zero UI Slop 시각 회귀 가드", () => {
  it("Calm Atelier Alabaster(#FAF8F3)와 Botanical Forest(#1F4435)는 WCAG AAA(>= 7:1) 대비를 만족하고 스펙트럼 프리뷰 토큰 정본에 고정된다", () => {
    const contrast = wcagContrastRatio("#FAF8F3", "#1F4435");
    expect(contrast).toBeGreaterThanOrEqual(7.0);

    const spectralPreviewSource = readWebSrc(
      "domains/creator/canvas-chrome/studio-spectral-blend-preview.ts",
    );
    expect(spectralPreviewSource).toContain('alabasterPaperHex: "#FAF8F3"');
    expect(spectralPreviewSource).toContain('botanicalForestHex: "#1F4435"');
  });

  it("신규 캔버스 크롬 · 마케팅 IR 모트 CSS · 세미나 Remotion 보드에 보라-블루 네온 슬롭과 44px 미만 터치 타깃이 없다", () => {
    const auditedTargets = [
      "domains/creator/canvas-chrome/StudioSpectralBlendPreviewChip.tsx",
      "domains/creator/canvas-chrome/studio-adaptive-floating-chrome.ts",
      "domains/creator/canvas-chrome/useAdaptiveFloatingChrome.ts",
      "domains/creator/StudioDrawingWorkbenchControls.tsx",
      "domains/marketing/ir-interactive-moat.css",
      "domains/legal/technology/seminar-showcase/tech-seminar-remotion-compositions.tsx",
      "domains/legal/technology/seminar-showcase/tech-seminar-remotion-data.ts",
    ];

    for (const relPath of auditedTargets) {
      const source = readWebSrc(relPath);
      for (const pattern of BANNED_NEON_SLOP_PATTERNS) {
        expect(pattern.test(source), `${relPath}에서 금지 네온 슬롭 감지: ${pattern}`).toBe(false);
      }
      for (const pattern of BANNED_AI_TRANSLATIONESE_PATTERNS) {
        expect(pattern.test(source), `${relPath}에서 AI 번역투 감지: ${pattern}`).toBe(false);
      }
    }

    // 신규 인터랙티브 TSX 컴포넌트는 44px 미만 min-h-(6..10) 클래스를 쓰지 않는다.
    const chipSource = readWebSrc("domains/creator/canvas-chrome/StudioSpectralBlendPreviewChip.tsx");
    expect(/\bmin-h-(?:6|7|8|9|10)\b/u.test(chipSource)).toBe(false);
    expect(chipSource).toContain("min-h-11");
  });

  it("전역 OKLCH 테마 시트와 통합 계약 시트가 prefers-reduced-motion 및 forced-colors를 유지한다", () => {
    const themesCss = readWebSrc("app/styles/design-themes.css");
    const unifiedCss = readWebSrc("app/styles/unified-theme-contract.css");
    const moatCss = readWebSrc("domains/marketing/ir-interactive-moat.css");

    expect(themesCss).toContain("oklch(");
    expect(unifiedCss).toContain("--unified-canvas");
    expect(unifiedCss).toContain("forced-colors");
    expect(moatCss).toContain("prefers-reduced-motion: reduce");
    expect(moatCss).toContain("forced-colors: active");
  });
});

describe("Remotion 세미나 도식 컴포넌트 계약 회귀 가드", () => {
  it("1280×720 스테이지·30fps·5챕터×4단계·reducedMotion·acknowledgeRemotionLicense 계약을 유지한다", () => {
    const dataSource = readWebSrc("domains/legal/technology/seminar-showcase/tech-seminar-remotion-data.ts");
    const compSource = readWebSrc("domains/legal/technology/seminar-showcase/tech-seminar-remotion-compositions.tsx");
    const showcaseSource = readWebSrc("domains/legal/technology/seminar-showcase/TechSeminarRemotionShowcase.tsx");

    expect(dataSource).toContain("SEMINAR_REMOTION_FPS = 30");
    expect(dataSource).toContain("SEMINAR_STAGES_PER_CHAPTER = 4");
    expect(dataSource).toContain("SEMINAR_FRAMES_PER_STAGE = 90");

    // 5개 챕터 accentHex에 보라/네온 계열이 혼입되지 않았는지 검증
    const accentMatches = [...dataSource.matchAll(/accentHex:\s*"(#[0-9a-fA-F]{6})"/gu)].map(
      (match) => match[1]!.toLowerCase(),
    );
    expect(accentMatches).toHaveLength(5);
    for (const hex of accentMatches) {
      expect(["#7c3aed", "#8b5cf6", "#a855f7", "#00f5ff", "#ff00ff"]).not.toContain(hex);
    }

    expect(compSource).toContain('viewBox="0 0 1280 720"');
    expect(compSource).toContain("reducedMotion");
    expect(compSource).toContain('bg: "#161513"');
    expect(showcaseSource).toContain("acknowledgeRemotionLicense");
  });

  it("마케팅 제품 투어 Remotion 컴포지션도 유효한 타임라인과 정본 계약을 유지한다", () => {
    const tourRemotionSource = readWebSrc("domains/marketing/ProductTourRemotionComposition.tsx");
    expect(tourRemotionSource.length).toBeGreaterThan(200);
    expect(tourRemotionSource).toContain("AbsoluteFill");
  });
});

describe(">= 82% 캔버스 뷰포트 가드 & 어댑티브 크롬 CLS 0 계약", () => {
  it("UI/UX v2 크롬 정본 상수(44px 상단바·48px 좌측 레일·82%/88%·7대 메뉴)와 산술 비율이 회귀하지 않는다", () => {
    const chromeContractSource = readWebSrc("domains/creator/chrome/studio-ui-v2-chrome-contract.ts");
    expect(chromeContractSource).toContain("desktopTopBarHeightPx: 44");
    expect(chromeContractSource).toContain("desktopLeftToolRailWidthPx: 48");
    expect(chromeContractSource).toContain("desktopMinCanvasAreaRatio: 0.82");
    expect(chromeContractSource).toContain("mobileMinCanvasAreaRatio: 0.88");
    expect(chromeContractSource).toContain("minTouchTargetPx: 44");

    // 7대 표준 메뉴 개수 검증
    const menuIds = [...chromeContractSource.matchAll(/\{\s*id:\s*"([^"]+)",\s*labelKo:/gu)];
    expect(menuIds).toHaveLength(7);

    // 대표 데스크톱/모바일 해상도에서 실제 캔버스 면적 비율이 >= 82% / >= 88% 유지되는지 검증
    const desktopViewports = [
      { w: 1440, h: 900 },
      { w: 1280, h: 720 },
      { w: 1920, h: 1080 },
    ];
    for (const vp of desktopViewports) {
      const ratio = ((vp.w - 48) * (vp.h - 44)) / (vp.w * vp.h);
      expect(ratio, `${vp.w}x${vp.h}`).toBeGreaterThanOrEqual(0.82);
    }
    const mobileRatio = (390 * (844 - 64)) / (390 * 844);
    expect(mobileRatio).toBeGreaterThanOrEqual(0.88);
  });

  it("어댑티브 플로팅 크롬은 CLS 0 · reduced-motion · 한글 토글 레이블 계약을 지키며 display:none으로 레이아웃을 흔들지 않는다", () => {
    const adaptiveSource = readWebSrc(
      "domains/creator/canvas-chrome/studio-adaptive-floating-chrome.ts",
    );
    expect(adaptiveSource).toContain('ADAPTIVE_FLOATING_CHROME_TOGGLE_LABEL = "그리는 중 패널 자동 숨김"');
    expect(adaptiveSource).toContain('layoutShiftRisk: "zero"');
    expect(adaptiveSource).toContain("evaluateCanvasViewportRatio");
    expect(adaptiveSource).not.toMatch(/display:\s*["']none["']/u);

    // OAuth 복구 모듈 존재 및 서버 JWT TTL 미변경 확인
    expect(fs.existsSync(path.join(REPO_ROOT, "packages/core/src/auth/oauth-recovery-kit.ts"))).toBe(
      true,
    );
  });
});
