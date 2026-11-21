// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBackgroundPanel } from "../../StudioBackgroundPanel";
import { createStudioUiPreferencesRepository } from "../../studio-ui-preferences-sqlite";
import {
  analyzeCutContextForBackdrop,
  AUTO_BG_THEME_CATALOG,
  circleIntersectsEllipse,
  circleIntersectsRect,
  composeAutoBgCrowdScene,
  CROWD_STYLE_VARIANTS,
  DEPTH_TIER_PROFILES,
  expandRect,
  generateDepthSortedCrowdLayer,
  generateMatchingWebtoonBackdropSvg,
  oklchToSrgbRgba,
  rectsIntersect,
  type AutoBgThemeId,
  type CutRect,
} from "../auto-bg-crowd-engine";
import { StudioAutoBgCrowdDrawerPanel } from "../StudioAutoBgCrowdDrawerPanel";

import { useI18n } from "@/shared/lib/i18n";

const INITIAL_LANG = useI18n.getState().lang;

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: INITIAL_LANG });
});

function createMemoryUiPrefs() {
  const store = new Map<string, string>();
  const repo = createStudioUiPreferencesRepository({
    get: async (k) => store.get(k) ?? null,
    set: async (k, v) => {
      store.set(k, v);
    },
    delete: async (k) => {
      store.delete(k);
    },
  });
  return async () => repo;
}

describe("analyzeCutContextForBackdrop · 컷 컨텍스트 분석기", () => {
  const themePromptCases: readonly [string, AutoBgThemeId][] = [
    ["노을 지는 서울 홍대 거리에서 주인공이 걷는다", "seoul-street"],
    ["오후 햇살 감성 카페 창가에서 커피를 마신다", "cozy-cafe"],
    ["로판 황궁 대연회장에서 왈츠가 시작되는 밤", "rofan-ballroom"],
    ["방과 후 학원 복도 창가에서 고백하는 장면", "school-hallway"],
    ["한강 야경 대교 아래 강변 산책로를 걷는다", "han-river-night"],
    ["무협 강호 객잔에서 등롱 아래 협객이 대치한다", "wuxia-inn"],
    ["비 오는 밤 골목길에서 우산을 쓰고 추격한다", "rainy-alley"],
    ["콘서트 광장 무대 앞에서 응원봉이 물결친다", "concert-plaza"],
  ];

  it.each(themePromptCases)(
    "장면 설명 '%s'에서 테마 '%s'를 정확히 추론한다",
    (scenePrompt, expectedTheme) => {
      const analysis = analyzeCutContextForBackdrop({ scenePrompt, canvasWidth: 720, canvasHeight: 1080 });
      expect(analysis.recommendedTheme).toBe(expectedTheme);
      expect(analysis.palette.skyTop).toMatch(/^oklch\(/u);
      expect(analysis.palette.inkLine).toMatch(/^oklch\(/u);
      expect(analysis.reasoningKo).toContain("눈높이");
    },
  );

  it("주인공 바운딩박스 시선 높이에 따라 소실점 Y를 잠그고 카메라 앵글 보정을 반영한다", () => {
    const highHero: CutRect = { x: 240, y: 120, width: 220, height: 640 };
    const lowHero: CutRect = { x: 240, y: 420, width: 220, height: 560 };

    const eyeHigh = analyzeCutContextForBackdrop({ protagonistBox: highHero, canvasWidth: 720, canvasHeight: 1080 });
    const eyeLow = analyzeCutContextForBackdrop({ protagonistBox: lowHero, canvasWidth: 720, canvasHeight: 1080 });
    const lowAngle = analyzeCutContextForBackdrop({
      protagonistBox: highHero,
      cameraAngle: "low-angle",
      canvasWidth: 720,
      canvasHeight: 1080,
    });

    expect(eyeLow.vanishingPointY).toBeGreaterThan(eyeHigh.vanishingPointY);
    expect(lowAngle.vanishingPointY).toBeGreaterThan(eyeHigh.vanishingPointY);
    expect(eyeHigh.vanishingPointY).toBeCloseTo(highHero.y + highHero.height * 0.16, -1);
  });

  it("시간대·색온도·군중 밀도 키워드를 한국어 프롬프트에서 자동 추론한다", () => {
    const emptyDawn = analyzeCutContextForBackdrop({
      scenePrompt: "새벽 안개 속 아무도 없는 텅 빈 서울 거리",
    });
    expect(emptyDawn.recommendedTimeOfDay).toBe("dawn");
    expect(emptyDawn.recommendedCrowdDensity).toBe("none");
    expect(emptyDawn.recommendedCrowdCount).toBe(0);

    const bustlingNight = analyzeCutContextForBackdrop({
      scenePrompt: "밤하늘 아래 수많은 인파가 북적이는 콘서트 광장",
    });
    expect(bustlingNight.recommendedTimeOfDay).toBe("night");
    expect(bustlingNight.recommendedCrowdDensity).toBe("bustling");
    expect(bustlingNight.recommendedCrowdCount).toBeGreaterThanOrEqual(16);
    expect(bustlingNight.colorTemperatureKelvin).toBeGreaterThan(emptyDawn.colorTemperatureKelvin);
  });
});

describe("generateMatchingWebtoonBackdropSvg · 8종 투시 배경 정합성", () => {
  it.each(AUTO_BG_THEME_CATALOG.map((spec) => spec.id))(
    "테마 '%s'의 1점·2점 투시 배경이 소실점 지평선에 정확히 수렴하고 OKLCH만 사용한다",
    (themeId) => {
      const vpX = 360;
      const vpY = 412;
      const onePt = generateMatchingWebtoonBackdropSvg({
        width: 720,
        height: 1080,
        theme: themeId,
        timeOfDay: "sunset",
        perspectiveMode: "1-point",
        vanishingPointX: vpX,
        vanishingPointY: vpY,
        showPerspectiveGuides: true,
      });

      expect(onePt.svg).toContain("<svg");
      expect(onePt.svg).toContain('id="backdrop-architecture"');
      expect(onePt.svg).toContain('id="backdrop-lighting-shadows"');
      expect(onePt.svg).toContain('id="perspective-guides"');
      expect(onePt.svg).toContain("oklch(");
      expect(onePt.svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(onePt.guideLines.length).toBeGreaterThanOrEqual(4);

      for (const ray of onePt.guideLines) {
        expect(ray.x1).toBeCloseTo(onePt.vanishingPoint.x, 3);
        expect(ray.y1).toBeCloseTo(onePt.vanishingPoint.y, 3);
      }

      const twoPt = generateMatchingWebtoonBackdropSvg({
        width: 720,
        height: 1080,
        theme: themeId,
        timeOfDay: "night",
        perspectiveMode: "2-point",
        vanishingPointX: 250,
        vanishingPointY: vpY,
        secondaryVanishingPointX: 676,
        showPerspectiveGuides: false,
      });

      expect(twoPt.secondaryVanishingPoint).not.toBeNull();
      expect(twoPt.secondaryVanishingPoint?.y).toBe(twoPt.vanishingPoint.y);
      expect(twoPt.svg).not.toContain('id="perspective-guides"');
      for (const ray of twoPt.guideLines) {
        const expectedVp =
          ray.vpIndex === 2 && twoPt.secondaryVanishingPoint
            ? twoPt.secondaryVanishingPoint
            : twoPt.vanishingPoint;
        expect(ray.x1).toBeCloseTo(expectedVp.x, 3);
        expect(ray.y1).toBeCloseTo(expectedVp.y, 3);
      }
    },
  );
});

describe("generateDepthSortedCrowdLayer · Safe Halo·말풍선 0충돌 및 3단 깊이 감쇠 수학 증명", () => {
  it("20개 시드와 복수 말풍선 배치에서 주인공 Safe Halo 및 말풍선 충돌이 수학적으로 0건이다", () => {
    const protagonistBox: CutRect = { x: 255, y: 260, width: 210, height: 680 };
    const speechBubbles: readonly CutRect[] = [
      { x: 480, y: 60, width: 200, height: 145 },
      { x: 36, y: 90, width: 170, height: 120 },
    ];
    const expandedBubbles = speechBubbles.map((b) => expandRect(b, 8, 8));

    let totalPlacedAcrossSeeds = 0;
    for (let seed = 101; seed <= 120; seed += 1) {
      const result = generateDepthSortedCrowdLayer({
        width: 720,
        height: 1080,
        vanishingPointX: 360,
        vanishingPointY: 380,
        theme: "seoul-street",
        timeOfDay: "sunset",
        density: "bustling",
        protagonistBox,
        safeHaloPaddingPx: 28,
        speechBubbles,
        seed,
        includeRgbaLayer: false,
      });

      totalPlacedAcrossSeeds += result.members.length;
      expect(result.collisionAudit.protagonistSafeHaloCollisions).toBe(0);
      expect(result.collisionAudit.speechBubbleCollisions).toBe(0);
      expect(result.collisionAudit.sameTierOverlaps).toBe(0);

      for (const member of result.members) {
        expect(rectsIntersect(member.bounds, result.safeHalo.rect)).toBe(false);
        expect(circleIntersectsRect(member.headCircle, result.safeHalo.rect)).toBe(false);
        expect(circleIntersectsEllipse(member.headCircle, result.safeHalo.faceEllipse)).toBe(false);

        for (const bubble of expandedBubbles) {
          expect(rectsIntersect(member.bounds, bubble)).toBe(false);
          expect(circleIntersectsRect(member.headCircle, bubble)).toBe(false);
        }
      }

      // 같은 깊이 층 비겹침 + 전 층 머리 비겹침 독립 검증
      for (let i = 0; i < result.members.length; i += 1) {
        for (let j = i + 1; j < result.members.length; j += 1) {
          const a = result.members[i];
          const b = result.members[j];
          const dx = a.headCircle.cx - b.headCircle.cx;
          const dy = a.headCircle.cy - b.headCircle.cy;
          const minHead = a.headCircle.r + b.headCircle.r;
          expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minHead * minHead);
          if (a.tier === b.tier) {
            expect(rectsIntersect(a.bounds, b.bounds)).toBe(false);
          }
        }
      }
    }

    expect(totalPlacedAcrossSeeds).toBeGreaterThan(80);
  });

  it("모든 군중 눈높이가 배경 소실점 지평선(vanishingPointY)에 잠긴다", () => {
    const vpY = 430;
    const result = generateDepthSortedCrowdLayer({
      width: 800,
      height: 1080,
      vanishingPointX: 400,
      vanishingPointY: vpY,
      theme: "school-hallway",
      timeOfDay: "day",
      density: "bustling",
      protagonistBox: { x: 300, y: 290, width: 200, height: 680 },
      seed: 777,
      includeRgbaLayer: false,
    });

    expect(result.members.length).toBeGreaterThanOrEqual(4);
    for (const member of result.members) {
      expect(Math.abs(member.eyeY - vpY)).toBeLessThanOrEqual(member.height * 0.06);
    }
  });

  it("전경(흐림)/중경(0.65× 선두께)/원경(0.35× 톤 실루엣) 3단 깊이 감쇠와 화가 순서를 준수한다", () => {
    const baseStroke = 2.0;
    const result = generateDepthSortedCrowdLayer({
      width: 960,
      height: 1080,
      vanishingPointX: 480,
      vanishingPointY: 410,
      theme: "rofan-ballroom",
      timeOfDay: "night",
      density: "bustling",
      baseStrokeWidth: baseStroke,
      protagonistBox: { x: 380, y: 280, width: 200, height: 680 },
      seed: 901,
      includeRgbaLayer: false,
    });

    expect(DEPTH_TIER_PROFILES.background.strokeMultiplier).toBe(0.35);
    expect(DEPTH_TIER_PROFILES.midground.strokeMultiplier).toBe(0.65);
    expect(DEPTH_TIER_PROFILES.foreground.strokeMultiplier).toBe(1.0);
    expect(DEPTH_TIER_PROFILES.foreground.blurPx).toBeGreaterThan(0);

    expect(result.tierSummary.background.strokeWidth).toBeCloseTo(baseStroke * 0.35, 3);
    expect(result.tierSummary.midground.strokeWidth).toBeCloseTo(baseStroke * 0.65, 3);
    expect(result.tierSummary.foreground.strokeWidth).toBeCloseTo(baseStroke * 1.0, 3);
    expect(result.svg).toContain('id="crowd-fg-blur"');
    expect(result.svg).toContain("feGaussianBlur");
    expect(result.svg).toContain('data-stroke-multiplier="0.35"');
    expect(result.svg).toContain('data-stroke-multiplier="0.65"');

    // 화가 순서: background(0) <= midground(1) <= foreground(2)
    const rank = { background: 0, midground: 1, foreground: 2 } as const;
    for (let i = 1; i < result.members.length; i += 1) {
      expect(rank[result.members[i].tier]).toBeGreaterThanOrEqual(rank[result.members[i - 1].tier]);
    }
  });

  it("12종 포즈·실루엣·의상 스타일 변주가 모두 유효한 SVG 마크업으로 생성된다", () => {
    expect(CROWD_STYLE_VARIANTS).toHaveLength(12);
    const allIds = CROWD_STYLE_VARIANTS.map((v) => v.id);
    const result = generateDepthSortedCrowdLayer({
      width: 1440,
      height: 1080,
      vanishingPointX: 720,
      vanishingPointY: 420,
      theme: "concert-plaza",
      timeOfDay: "night",
      density: "bustling",
      targetCount: 24,
      protagonistBox: { x: 640, y: 310, width: 160, height: 620 },
      safeHaloPaddingPx: 16,
      forceStylePool: allIds,
      seed: 31415,
      includeRgbaLayer: false,
    });

    const renderedStyles = new Set(result.members.map((m) => m.styleId));
    expect(renderedStyles.size).toBe(12);
    for (const styleId of allIds) {
      expect(result.svg).toContain(`data-crowd-style="${styleId}"`);
    }
  });

  it("RGBA 픽셀 레이어와 OKLCH→sRGB 변환이 유효한 픽셀 버퍼를 생성한다", () => {
    const dark = oklchToSrgbRgba({ l: 0.2, c: 0.04, h: 250 });
    const light = oklchToSrgbRgba({ l: 0.9, c: 0.04, h: 80 });
    expect(light[0]).toBeGreaterThan(dark[0]);
    expect(dark[3]).toBe(255);

    const result = generateDepthSortedCrowdLayer({
      width: 720,
      height: 1080,
      vanishingPointX: 360,
      vanishingPointY: 400,
      theme: "rainy-alley",
      timeOfDay: "rain",
      density: "medium",
      protagonistBox: { x: 260, y: 260, width: 200, height: 640 },
      seed: 55,
      includeRgbaLayer: true,
      rgbaMaxDimension: 180,
    });

    expect(result.rgbaLayer).not.toBeNull();
    expect(result.rgbaLayer?.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.rgbaLayer?.data.length).toBe(
      (result.rgbaLayer?.width ?? 0) * (result.rgbaLayer?.height ?? 0) * 4,
    );
    expect(result.rgbaLayer?.nonTransparentPixelCount).toBeGreaterThan(0);

    const emptyCrowd = generateDepthSortedCrowdLayer({
      width: 720,
      height: 1080,
      vanishingPointX: 360,
      vanishingPointY: 400,
      theme: "cozy-cafe",
      timeOfDay: "day",
      density: "none",
      protagonistBox: { x: 260, y: 260, width: 200, height: 640 },
      includeRgbaLayer: true,
      rgbaMaxDimension: 120,
    });
    expect(emptyCrowd.members).toHaveLength(0);
    expect(emptyCrowd.rgbaLayer?.nonTransparentPixelCount).toBe(0);
  });

  it("composeAutoBgCrowdScene은 미리보기 가이드와 깨끗한 삽입용 SVG를 분리한다", () => {
    const composed = composeAutoBgCrowdScene({
      width: 720,
      height: 1080,
      theme: "wuxia-inn",
      timeOfDay: "night",
      perspectiveMode: "2-point",
      vanishingPointX: 310,
      vanishingPointY: 410,
      density: "medium",
      protagonistBox: { x: 240, y: 260, width: 220, height: 640 },
      showPreviewGuides: true,
    });

    expect(composed.previewSvg).toContain('id="preview-safe-halo-guide"');
    expect(composed.previewSvg).toContain('id="perspective-guides"');
    expect(composed.exportSvg).not.toContain('id="preview-safe-halo-guide"');
    expect(composed.exportSvg).not.toContain('id="perspective-guides"');
    expect(composed.backgroundApplyPayload.kind).toBe("svg");
  });
});

describe("StudioAutoBgCrowdDrawerPanel · 초보자 쉬운 한국어 UX·접근성·지연 마운트", () => {
  it("필수 입력 1개, AI 추천 버튼, 실시간 SVG 미리보기, 접힌 <details>로 렌더링된다", () => {
    render(
      <StudioAutoBgCrowdDrawerPanel
        canvasW={720}
        canvasH={1080}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("어떤 장면인가요? (한 줄만 적어 주세요)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI 추천으로 자동 채우기" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /실시간 미리보기/u })).toBeTruthy();
    expect(screen.getByText(/주인공·말풍선 충돌 0건/u)).toBeTruthy();

    const detailsEl = document.querySelector("details");
    expect(detailsEl).not.toBeNull();
    expect(detailsEl?.open).toBe(false);
  });

  it("장면 한 줄 입력 후 'AI 추천으로 자동 채우기'를 누르면 테마와 미리보기가 즉시 갱신된다", () => {
    render(
      <StudioAutoBgCrowdDrawerPanel
        canvasW={720}
        canvasH={1080}
        onApply={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("어떤 장면인가요? (한 줄만 적어 주세요)");
    fireEvent.change(input, {
      target: { value: "로판 황궁 대연회장에서 왈츠가 시작되는 밤" },
    });
    fireEvent.click(screen.getByRole("button", { name: "AI 추천으로 자동 채우기" }));

    expect(screen.getByRole("img", { name: /로판 대연회장/u })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("자동으로 채웠어요");
  });

  it("원클릭 추천 프리셋 클릭과 '배경·군중 레이어 바로 삽입'이 onApply를 정확히 호출한다", () => {
    const onApply = vi.fn();
    render(
      <StudioAutoBgCrowdDrawerPanel
        canvasW={720}
        canvasH={1080}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤 골목" }));
    expect(screen.getByRole("img", { name: /비 오는 골목/u })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "배경·군중 레이어 바로 삽입" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const payload = onApply.mock.calls[0]?.[0];
    expect(payload?.kind).toBe("svg");
    expect(payload?.presetId).toContain("auto-bg-crowd:rainy-alley:rain");
    expect(payload?.svg).toContain("<svg");
    expect(payload?.svg).not.toContain('id="preview-safe-halo-guide"');

    fireEvent.click(screen.getByRole("button", { name: "배경만 따로 삽입" }));
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply.mock.calls[1]?.[0]?.presetId).toContain("auto-bg-only:rainy-alley");
  });

  it("<details> 세부 설정에서 8종 테마·시간대·투시·밀도·눈높이·Safe Halo를 조절할 수 있다", () => {
    render(
      <StudioAutoBgCrowdDrawerPanel
        canvasW={720}
        canvasH={1080}
        onApply={vi.fn()}
      />,
    );

    const summary = screen.getByText(/세부 설정/u);
    fireEvent.click(summary);

    fireEvent.click(screen.getByRole("button", { name: "무협 객잔" }));
    fireEvent.click(screen.getByRole("button", { name: "새벽" }));
    fireEvent.click(screen.getByRole("button", { name: "2점 투시" }));
    fireEvent.click(screen.getByRole("button", { name: "군중 없음" }));

    const horizonSlider = screen.getByLabelText(/주인공 눈높이/u);
    fireEvent.change(horizonSlider, { target: { value: "52" } });

    expect(screen.getByRole("img", { name: /무협 객잔 새벽 투시 배경과 군중 0명/u })).toBeTruthy();
    expect(screen.getByText(/눈높이 52% · 2점 투시/u)).toBeTruthy();
  });

  it("OKLCH 시맨틱 토큰·접근성·모션·안티슬롭 코드 규칙을 100% 준수한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/auto-bg-crowd");
    const drawerSrc = readFileSync(resolve(dir, "StudioAutoBgCrowdDrawerPanel.tsx"), "utf8");
    const engineSrc = readFileSync(resolve(dir, "auto-bg-crowd-engine.ts"), "utf8");
    const palettesSrc = readFileSync(resolve(dir, "auto-bg-crowd-palettes.ts"), "utf8");
    const backdropSrc = readFileSync(resolve(dir, "auto-bg-crowd-backdrop-svg.ts"), "utf8");
    const crowdSrc = readFileSync(resolve(dir, "auto-bg-crowd-crowd-layer.ts"), "utf8");

    for (const src of [drawerSrc, engineSrc, palettesSrc, backdropSrc, crowdSrc]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\bany\b/u);
      expect(src).not.toContain("transition-all");
      expect(src).not.toMatch(/\banimate-(?:bounce|pulse|ping|spin)\b/u);
    }

    expect(drawerSrc).toContain("min-h-11");
    expect(drawerSrc).toContain("tabular-nums");
    expect(drawerSrc).toContain("[word-break:keep-all]");
    expect(drawerSrc).toContain("motion-reduce:transition-none");
  });

  it("StudioBackgroundPanel의 접이식 진입점을 클릭하면 지연 마운트 후 레이어를 삽입한다", async () => {
    const onApply = vi.fn();
    render(
      <StudioBackgroundPanel
        canvasW={720}
        canvasH={1080}
        currentBg="oklch(0.96 0.01 80)"
        onApply={onApply}
        acquireUiPreferences={createMemoryUiPrefs()}
      />,
    );

    const toggle = screen.getByRole("button", { name: /어울리는 배경·군중 자동 그리기/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "배경·군중 레이어 바로 삽입" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const insertBtn = await screen.findByRole("button", { name: "배경·군중 레이어 바로 삽입" });
    fireEvent.click(insertBtn);

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(onApply.mock.calls[0]?.[0]?.kind).toBe("svg");
  });
});
