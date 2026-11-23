// @vitest-environment jsdom
/**
 * Wave 7 트랙 2 전수 감사 테스트:
 * - 8개 뷰포트(220px 워치·320px·430px·768px·1024px·1440px·2560px·폴더블) HUD 쌍 겹침 면적 0px² 검증
 * - 320px~3440px 및 폴더블 힌지(`foldSegmentX`) 팝오버 안전 앵커 검증
 * - 44종 컬러 스프라이트 실제 WebP 파일 존재 + UI 컴포넌트 렌더링/폴백 검증
 * - 전 기능 100% 도달성(드로잉·3D·VRM·식자·AI·레이어·출고·비교/테크) 검증
 * - 고대비(`forced-colors`/`data-studio-high-contrast`)·`keep-all`·`tabular-nums`·44px 터치 타깃·원시색 0건·직접 저장소 호출 0건 검증
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_PRO_DRAW_PREFS } from "../studio-pro-draw-prefs";
import { StudioCreationModeLauncher } from "../StudioCreationModeLauncher";
import { StudioUnifiedBrushPicker } from "../StudioUnifiedBrushPicker";
import { StudioRadialQuickWheel } from "../studio-cuttoon-editor/StudioRadialQuickWheel";
import { StudioAdaptiveModeChromeBar } from "./StudioAdaptiveModeChromeBar";
import { StudioVibrantToolArtwork } from "./StudioVibrantToolArtwork";
import {
  STANDARD_HUD_AUDIT_VIEWPORTS,
  STUDIO_FEATURE_REACHABILITY_REGISTRY,
  STUDIO_READABILITY_AND_CONTRAST_CONTRACT,
  STUDIO_Z_LAYERS,
  auditHudReadabilityAndContrastContract,
  auditHudRectPairwiseOverlaps,
  auditStudioFeatureReachability,
  computeRectIntersectionArea,
  isStrictAscendingZLayerLadder,
  resolveCollisionFreeHudRects,
  resolveResponsiveHudSpacing,
  resolveSafePopoverAnchor,
  type HudBoxInput,
} from "./studio-hud-collision-guard";
import {
  STUDIO_VIBRANT_ALL_44_SPRITE_IDS,
  getVibrantSpriteSrc,
  resolveVibrantSpriteForAdaptiveTool,
  resolveVibrantSpriteForBrush,
  resolveVibrantSpriteForCreationMode,
  resolveVibrantSpriteForQuickAction,
  resolveVibrantSpriteForRailTool,
} from "./studio-vibrant-sprite-catalog";

const REPO_ROOT = process.cwd();
const SPRITES_PUBLIC_DIR = path.resolve(
  REPO_ROOT,
  "apps/web/public/assets/studio/vibrant-sprites",
);

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.resolve(REPO_ROOT, relativePath), "utf8");
}

function buildCongestedStudioHudBoxes(widthPx: number, heightPx: number): readonly HudBoxInput[] {
  const halfX = Math.round(widthPx / 2);
  return [
    { id: "top-context-bar", priority: 100, rect: { x: 0, y: 0, width: Math.min(widthPx, 640), height: 44 }, minWidthPx: 140, minHeightPx: 44 },
    { id: "left-tool-rail", priority: 95, rect: { x: 0, y: 20, width: 52, height: Math.min(heightPx - 40, 420) }, minWidthPx: 48, minHeightPx: 120 },
    { id: "adaptive-mode-bar", priority: 90, rect: { x: 16, y: 12, width: 320, height: 52 }, collapsible: true, minWidthPx: 120, minHeightPx: 44 },
    { id: "brush-preset-dock", priority: 80, rect: { x: halfX - 110, y: heightPx - 80, width: 220, height: 64 }, collapsible: true, minWidthPx: 120, minHeightPx: 44 },
    { id: "right-inspector-hud", priority: 75, rect: { x: Math.max(0, widthPx - 260), y: 24, width: 252, height: 260 }, collapsible: true, minWidthPx: 120, minHeightPx: 120 },
    { id: "ai-compass-floating", priority: 60, rect: { x: halfX - 40, y: 30, width: 180, height: 56 }, collapsible: true, minWidthPx: 96, minHeightPx: 44 },
    { id: "zoom-status-hud", priority: 50, rect: { x: halfX - 60, y: heightPx - 64, width: 160, height: 44 }, collapsible: true, minWidthPx: 96, minHeightPx: 44 },
  ];
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 7 트랙 2 · 겹침 0% HUD 충돌 회피 & Z-Index 사다리", () => {
  it("단일 Z-Index 사다리(STUDIO_Z_LAYERS)는 엄격 단조 증가하며 CSS 변수와 일치한다", () => {
    expect(isStrictAscendingZLayerLadder()).toBe(true);
    expect(STUDIO_Z_LAYERS.canvas).toBe(0);
    expect(STUDIO_Z_LAYERS.toolRail).toBeLessThan(STUDIO_Z_LAYERS.adaptiveModeBar);
    expect(STUDIO_Z_LAYERS.adaptiveModeBar).toBeLessThan(STUDIO_Z_LAYERS.creationModePalette);
    expect(STUDIO_Z_LAYERS.creationModePalette).toBeLessThan(STUDIO_Z_LAYERS.railMoreDialog);
    expect(STUDIO_Z_LAYERS.railMoreDialog).toBeLessThan(STUDIO_Z_LAYERS.radialQuickWheel);
    expect(STUDIO_Z_LAYERS.radialQuickWheel).toBeLessThan(STUDIO_Z_LAYERS.modalDialog);

    const css = readWorkspaceFile("apps/web/src/domains/creator/canvas-chrome/studio-vibrant-chrome.css");
    expect(css).toContain(`--studio-z-adaptive-mode-bar: ${STUDIO_Z_LAYERS.adaptiveModeBar};`);
    expect(css).toContain(`--studio-z-creation-palette: ${STUDIO_Z_LAYERS.creationModePalette};`);
    expect(css).toContain(`--studio-z-rail-more: ${STUDIO_Z_LAYERS.railMoreDialog};`);
    expect(css).toContain(`--studio-z-radial-wheel: ${STUDIO_Z_LAYERS.radialQuickWheel};`);
  });

  it("8개 표준 뷰포트(220px 워치·320px·430px·768px·1024px·1440px·2560px·폴더블)에서 모든 HUD 박스 쌍 겹침 면적이 0px²다", () => {
    expect(STANDARD_HUD_AUDIT_VIEWPORTS).toHaveLength(8);

    for (const viewport of STANDARD_HUD_AUDIT_VIEWPORTS) {
      const boxes = buildCongestedStudioHudBoxes(viewport.widthPx, viewport.heightPx);
      const layout = resolveCollisionFreeHudRects(boxes, viewport);

      expect(layout.zeroOverlapGuaranteed, `${viewport.label} 겹침 검출`).toBe(true);
      expect(layout.totalOverlapAreaPx2, `${viewport.label} 총 겹침 면적`).toBe(0);

      const recheck = auditHudRectPairwiseOverlaps(layout.visibleRects);
      expect(recheck.passed).toBe(true);
      expect(recheck.collidingPairs).toEqual([]);
      expect(layout.visibleRects.length).toBeGreaterThanOrEqual(1);

      for (const item of layout.visibleRects) {
        expect(item.rect.x).toBeGreaterThanOrEqual(0);
        expect(item.rect.y).toBeGreaterThanOrEqual(0);
        expect(item.rect.x + item.rect.width).toBeLessThanOrEqual(viewport.widthPx);
        expect(item.rect.y + item.rect.height).toBeLessThanOrEqual(viewport.heightPx);
        if (layout.foldHingeBand) {
          const crossesHinge =
            item.rect.x < layout.foldHingeBand.right
            && item.rect.x + item.rect.width > layout.foldHingeBand.left;
          expect(crossesHinge, `${viewport.label} ${item.id} 힌지 가로지름`).toBe(false);
        }
      }
    }
  });

  it("resolveSafePopoverAnchor가 220px~3440px 및 폴더블 힌지(foldSegmentX)에서 클리핑·힌지 가로지름 없이 안전 배치한다", () => {
    const viewports = [
      ...STANDARD_HUD_AUDIT_VIEWPORTS,
      { label: "3440px 슈퍼 울트라와이드", widthPx: 3440, heightPx: 1440, foldSegmentX: null },
    ];

    for (const viewport of viewports) {
      const triggerRect = {
        x: viewport.foldSegmentX ? viewport.foldSegmentX - 58 : 12,
        y: 64,
        width: 48,
        height: 48,
      };
      const anchored = resolveSafePopoverAnchor({
        triggerRect,
        popoverSize: { width: 320, height: 280 },
        viewport,
        preferredSide: "right",
        zLayer: "creationModePalette",
      });

      expect(anchored.left).toBeGreaterThanOrEqual(0);
      expect(anchored.top).toBeGreaterThanOrEqual(0);
      expect(anchored.left + anchored.width).toBeLessThanOrEqual(viewport.widthPx);
      expect(anchored.top + anchored.height).toBeLessThanOrEqual(viewport.heightPx);
      expect(anchored.zIndex).toBe(STUDIO_Z_LAYERS.creationModePalette);

      if (viewport.foldSegmentX) {
        const hingeHalf = (viewport.foldHingeWidthPx ?? 24) / 2;
        const hingeRect = {
          x: viewport.foldSegmentX - hingeHalf,
          y: 0,
          width: hingeHalf * 2,
          height: viewport.heightPx,
        };
        const popRect = { x: anchored.left, y: anchored.top, width: anchored.width, height: anchored.height };
        expect(computeRectIntersectionArea(popRect, hingeRect)).toBe(0);
        expect(anchored.avoidedFoldHinge).toBe(true);
      }
    }
  });

  it("동적 반응형 스페이싱이 220px 워치~3440px 전 구간에서 최소 44px 터치 타깃을 유지한다", () => {
    const widths = [220, 320, 430, 768, 1024, 1440, 2560, 3440];
    for (const w of widths) {
      const spec = resolveResponsiveHudSpacing(w);
      expect(spec.minTouchTargetPx).toBe(44);
      expect(spec.gapPx).toBeGreaterThanOrEqual(4);
      expect(spec.spriteSizePx).toBeGreaterThanOrEqual(18);
    }
  });
});

describe("Wave 7 트랙 2 · 44종 컬러 스프라이트 실존 & 전 기능 100% 도달성", () => {
  it("44종 컬러 스프라이트 WebP 파일이 모두 public/assets/studio/vibrant-sprites/에 실존한다", () => {
    expect(STUDIO_VIBRANT_ALL_44_SPRITE_IDS).toHaveLength(44);
    for (const spriteId of STUDIO_VIBRANT_ALL_44_SPRITE_IDS) {
      const filePath = path.join(SPRITES_PUBLIC_DIR, `${spriteId}.webp`);
      expect(existsSync(filePath), `누락된 스프라이트: ${spriteId}.webp`).toBe(true);
      expect(statSync(filePath).size).toBeGreaterThan(500);
      expect(getVibrantSpriteSrc(spriteId)).toBe(`/assets/studio/vibrant-sprites/${spriteId}.webp`);
    }
  });

  it("전 기능 100% 도달성 레지스트리가 8대 핵심 영역(드로잉·3D·VRM·식자·AI·레이어·출고·비교/테크)을 빠짐없이 커버한다", () => {
    const fullAudit = auditStudioFeatureReachability();
    expect(fullAudit.passed).toBe(true);
    expect(fullAudit.reachabilityRatio).toBe(1);
    expect(fullAudit.missingFeatureIds).toEqual([]);
    expect(fullAudit.coveredDomains).toEqual(
      expect.arrayContaining(["drawing", "bg3d", "vrm", "lettering", "ai", "layers", "export", "compare-tech"]),
    );

    // 축소형(워치/초소형 모바일) 표면 조합에서도 fallbackSurface로 100% 도달 가능해야 한다.
    const compactSurfaces = new Set([
      "adaptive-mode-bar",
      "creation-mode-launcher",
      "overflow-all-tools",
      "top-context-bar",
    ] as const);
    const compactAudit = auditStudioFeatureReachability(compactSurfaces);
    expect(compactAudit.passed).toBe(true);
    expect(compactAudit.reachabilityRatio).toBe(1);

    for (const entry of STUDIO_FEATURE_REACHABILITY_REGISTRY) {
      expect(entry.minTouchTargetPx).toBeGreaterThanOrEqual(44);
      expect(entry.keyboardReachable).toBe(true);
      expect(existsSync(path.join(SPRITES_PUBLIC_DIR, `${entry.spriteId}.webp`))).toBe(true);
    }
  });

  it("도구·브러시·적응형 모드·방사형 휠·제작 모드 리졸버가 모두 유효한 스프라이트를 반환한다", () => {
    expect(resolveVibrantSpriteForRailTool("pen").spriteId).toBe("tool-gpen");
    expect(resolveVibrantSpriteForRailTool("bg3d").spriteId).toBe("tool-bg3d");
    expect(resolveVibrantSpriteForRailTool("vrm3d").spriteId).toBe("tool-vrm");
    expect(resolveVibrantSpriteForBrush("watercolor").spriteId).toBe("brush-watercolor");
    expect(resolveVibrantSpriteForBrush("heart-stamp").spriteId).toBe("brush-fx-ribbon");
    expect(resolveVibrantSpriteForAdaptiveTool("g-pen", "lineart").spriteId).toBe("tool-gpen");
    expect(resolveVibrantSpriteForQuickAction("colordrop-fill").spriteId).toBe("tool-fill");
    expect(resolveVibrantSpriteForCreationMode("ai").spriteId).toBe("tool-ai-compass");
  });
});

describe("Wave 7 트랙 2 · 고대비 · keep-all · 44px 터치 타깃 · 컴포넌트 실제 렌더 검증", () => {
  it("studio-vibrant-chrome.css가 CSS Anchor Positioning·고대비·keep-all·tabular-nums·44px·원시색 0건 계약을 지킨다", () => {
    const css = readWorkspaceFile("apps/web/src/domains/creator/canvas-chrome/studio-vibrant-chrome.css");

    expect(css).toContain("@supports (anchor-name: --a)");
    expect(css).toContain("position-try-fallbacks:");
    expect(css).toContain("oklch(");
    expect(css).toContain("word-break: keep-all;");
    expect(css).toContain("font-variant-numeric: tabular-nums;");
    expect(css).toContain("min-height: 44px;");
    expect(css).toContain("min-width: 44px;");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain('[data-studio-high-contrast="true"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("150ms cubic-bezier(0.22, 1, 0.36, 1)");
    expect(css).toContain("scale(0.95)");
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/gu)).toBeNull();

    const readabilityPass = auditHudReadabilityAndContrastContract({
      touchTargetWidthPx: STUDIO_READABILITY_AND_CONTRAST_CONTRACT.minTouchTargetPx,
      touchTargetHeightPx: STUDIO_READABILITY_AND_CONTRAST_CONTRACT.minTouchTargetPx,
      normalTextContrastRatio: 5.2,
      highContrastTextRatio: 9.1,
      uiBorderContrastRatio: 3.6,
      fontSizePx: 12,
      wordBreak: "keep-all",
      usesTabularNums: true,
      supportsForcedColors: true,
      supportsReducedMotion: true,
    });
    expect(readabilityPass.passed).toBe(true);
    expect(readabilityPass.violations).toEqual([]);

    const readabilityFail = auditHudReadabilityAndContrastContract({
      touchTargetWidthPx: 32,
      touchTargetHeightPx: 32,
      normalTextContrastRatio: 3.1,
      highContrastTextRatio: 4.5,
      uiBorderContrastRatio: 2.0,
      fontSizePx: 10,
      wordBreak: "break-all",
      usesTabularNums: false,
      supportsForcedColors: false,
      supportsReducedMotion: false,
    });
    expect(readabilityFail.passed).toBe(false);
    expect(readabilityFail.violations.length).toBeGreaterThanOrEqual(8);
  });

  it("신규·수정 소스 파일에 localStorage/sessionStorage/indexedDB 직접 호출이 0건이다", () => {
    const ownedFiles = [
      "apps/web/src/domains/creator/canvas-chrome/studio-hud-collision-guard.ts",
      "apps/web/src/domains/creator/canvas-chrome/studio-vibrant-sprite-catalog.ts",
      "apps/web/src/domains/creator/canvas-chrome/StudioVibrantToolArtwork.tsx",
      "apps/web/src/domains/creator/canvas-chrome/StudioAdaptiveModeChromeBar.tsx",
      "apps/web/src/domains/creator/StudioLeftToolRail.tsx",
      "apps/web/src/domains/creator/StudioUnifiedBrushPicker.tsx",
      "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx",
      "apps/web/src/domains/creator/studio-cuttoon-editor/StudioRadialQuickWheel.tsx",
    ];
    for (const file of ownedFiles) {
      const codeOnly = readWorkspaceFile(file)
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^\s*\/\/.*$/gmu, "");
      expect(codeOnly, `${file} 직접 스토리지 호출 금지`).not.toMatch(
        /\b(?:localStorage|sessionStorage|indexedDB)\b/u,
      );
    }
  });

  it("StudioVibrantToolArtwork가 컬러 스프라이트를 렌더하고 이미지 오류 시 안전 폴백으로 전환한다", () => {
    render(
      createElement(StudioVibrantToolArtwork, {
        spriteId: "tool-gpen",
        accent: "ink",
        size: 24,
        active: true,
        decorative: false,
        ariaLabel: "G펜 아트워크",
        fallback: createElement("span", { "data-testid": "sprite-fallback" }, "폴백"),
      }),
    );

    const img = screen.getByRole("img", { name: "G펜 아트워크" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/assets/studio/vibrant-sprites/tool-gpen.webp");

    fireEvent.error(img);
    expect(screen.getByTestId("sprite-fallback").textContent).toBe("폴백");
  });

  it("업그레이드된 4개 스튜디오 크롬 컴포넌트가 컬러 스프라이트와 44px 터치/충돌 회피 속성을 실제 렌더한다", () => {
    const { container: adaptiveContainer } = render(
      createElement(StudioAdaptiveModeChromeBar, { viewportWidthPx: 1440, viewportHeightPx: 900 }),
    );
    expect(
      screen.getByTestId("studio-adaptive-mode-chrome-bar").getAttribute("data-hud-collision-free"),
    ).toBe("true");
    expect(
      adaptiveContainer.querySelectorAll('img[src^="/assets/studio/vibrant-sprites/"]').length,
    ).toBeGreaterThanOrEqual(10);

    render(createElement(StudioCreationModeLauncher, { onSelectMode: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: /만들기/u }));
    const palette = document.querySelector<HTMLElement>('[data-studio-creation-mode-palette="true"]');
    expect(palette?.getAttribute("data-hud-collision-free")).toBe("true");
    expect(palette?.querySelectorAll('img[src^="/assets/studio/vibrant-sprites/"]').length).toBeGreaterThanOrEqual(7);

    const { container: wheelContainer } = render(
      createElement(StudioRadialQuickWheel, {
        open: true,
        anchor: { x: 400, y: 400 },
        onSelectAction: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(
      wheelContainer.querySelector('[data-studio-radial-quick-wheel="true"]')?.getAttribute("data-hud-collision-free"),
    ).toBe("true");
    expect(
      wheelContainer.querySelectorAll('img[src^="/assets/studio/vibrant-sprites/"]').length,
    ).toBe(6);

    const { container: pickerContainer } = render(
      createElement(StudioUnifiedBrushPicker, {
        activeBrushId: "pen",
        brushOpacity: 0.8,
        color: "var(--color-accent)",
        proDrawPrefs: DEFAULT_STUDIO_PRO_DRAW_PREFS,
        stabilizer: 4,
        stabilizerMode: "adaptive",
        strokeWidth: 8,
        tipAngle: 0,
        tipRoundness: 1,
        onSelectBrush: vi.fn(),
        onToggleCatalog: vi.fn(),
        onToggleFavoriteBrush: vi.fn(),
      }),
    );
    expect(
      pickerContainer.querySelectorAll('img[src^="/assets/studio/vibrant-sprites/brush-"]').length,
    ).toBeGreaterThanOrEqual(8);
  });
});
