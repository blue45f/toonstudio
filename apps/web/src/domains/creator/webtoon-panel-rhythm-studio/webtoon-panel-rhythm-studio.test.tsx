// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SCROLL_SPEED_PX_PER_SEC,
  PANEL_RHYTHM_TEMPLATES,
  PANEL_RHYTHM_TEMPLATE_IDS,
  StudioWebtoonPanelRhythmPanel,
  WEBTOON_PLATFORM_IDS,
  WEBTOON_PLATFORM_PRESETS,
  analyzeScrollRhythm,
  autoBalanceGutters,
  buildRhythmStripSvg,
  exportPanelRhythmJson,
  getPanelRhythmTemplateSpec,
  getTensionOklch,
  getWebtoonPlatformSpec,
  instantiateTemplatePanels,
  type PanelBeatInput,
} from "./index";

afterEach(cleanup);

function makeSamplePanel(overrides: Partial<PanelBeatInput> & { readonly id: string }): PanelBeatInput {
  return {
    id: overrides.id,
    labelKo: overrides.labelKo ?? `테스트 컷 ${overrides.id}`,
    labelEn: overrides.labelEn ?? `Test Panel ${overrides.id}`,
    role: overrides.role ?? "dialogue",
    heightPx: overrides.heightPx ?? 500,
    gutterAfterPx: overrides.gutterAfterPx ?? 240,
    dialogueCharCount: overrides.dialogueCharCount ?? 20,
    shape: overrides.shape ?? "standard",
    visualDensity: overrides.visualDensity ?? "medium",
  };
}

describe("1. 플랫폼 규격 3종 및 8대 한국 상업 웹툰 연출 리듬 템플릿", () => {
  it("3종 플랫폼 규격(naver-800, kakao-690, global-1080)이 정확한 폭과 표준 여백 밴드를 제공한다", () => {
    expect(WEBTOON_PLATFORM_IDS).toEqual(["naver-800", "kakao-690", "global-1080"]);
    expect(WEBTOON_PLATFORM_PRESETS).toHaveLength(3);

    const naver = getWebtoonPlatformSpec("naver-800");
    expect(naver.widthPx).toBe(800);
    expect(naver.recommendedGutterMinPx).toBe(160);
    expect(naver.recommendedGutterMaxPx).toBe(420);

    const kakao = getWebtoonPlatformSpec("kakao-690");
    expect(kakao.widthPx).toBe(690);
    expect(kakao.recommendedGutterMaxPx).toBeLessThan(naver.recommendedGutterMaxPx);

    const globalHd = getWebtoonPlatformSpec("global-1080");
    expect(globalHd.widthPx).toBe(1080);
    expect(globalHd.recommendedGutterMinPx).toBeGreaterThan(naver.recommendedGutterMinPx);
  });

  it("8대 한국 상업 웹툰 세로 연출 리듬 템플릿이 모두 등록되어 있고 단조로움 경고 0건으로 설계된다", () => {
    expect(PANEL_RHYTHM_TEMPLATE_IDS).toEqual([
      "action-3beat-impact",
      "romance-silence-longscroll",
      "thriller-blackout-reveal",
      "slice-4cut-comedy",
      "flashback-sepia-overlap",
      "cliffhanger-ending-drop",
      "dialogue-zigzag-banter",
      "panorama-wide-breather",
    ]);
    expect(PANEL_RHYTHM_TEMPLATES).toHaveLength(8);

    for (const id of PANEL_RHYTHM_TEMPLATE_IDS) {
      const spec = getPanelRhythmTemplateSpec(id);
      expect(spec.id).toBe(id);
      expect(spec.defaultPanels.length).toBeGreaterThanOrEqual(4);
      const analysis = analyzeScrollRhythm({
        panels: spec.defaultPanels,
        platformId: "naver-800",
        scrollSpeedPxPerSec: spec.recommendedScrollSpeedPxPerSec,
        templateId: id,
      });
      expect(analysis.summary.monotoneGutterRunCount).toBe(0);
      expect(analysis.summary.rhythmHealthScore).toBeGreaterThanOrEqual(75);
    }
  });

  it("instantiateTemplatePanels가 플랫폼 폭 비율(690 / 800 / 1080)에 맞춰 컷 높이와 여백을 비례 스케일링한다", () => {
    const kakaoPanels = instantiateTemplatePanels("action-3beat-impact", "kakao-690");
    const naverPanels = instantiateTemplatePanels("action-3beat-impact", "naver-800");
    const globalPanels = instantiateTemplatePanels("action-3beat-impact", "global-1080");

    expect(kakaoPanels).toHaveLength(naverPanels.length);
    expect(globalPanels).toHaveLength(naverPanels.length);

    const kakaoSum = kakaoPanels.reduce((acc, p) => acc + p.heightPx + p.gutterAfterPx, 0);
    const naverSum = naverPanels.reduce((acc, p) => acc + p.heightPx + p.gutterAfterPx, 0);
    const globalSum = globalPanels.reduce((acc, p) => acc + p.heightPx + p.gutterAfterPx, 0);

    expect(kakaoSum).toBeLessThan(naverSum);
    expect(globalSum).toBeGreaterThan(naverSum);
  });
});

describe("2. 물리적 독자 스크롤 리듬 계산기 · 긴장도 곡선 · 단조로움 진단 · 자동 보정", () => {
  it("독자 스크롤 속도·컷 높이·여백·대사 글자 수로부터 체류 시간과 침묵 호흡을 정확히 계산한다", () => {
    const panels = [
      makeSamplePanel({ id: "p1", heightPx: 420, gutterAfterPx: 210, dialogueCharCount: 0, role: "silence", visualDensity: "medium" }),
      makeSamplePanel({ id: "p2", heightPx: 840, gutterAfterPx: 420, dialogueCharCount: 28, role: "dialogue", visualDensity: "medium" }),
    ];
    const analysis = analyzeScrollRhythm({
      panels,
      platformId: "naver-800",
      scrollSpeedPxPerSec: 420,
      readingCharsPerSec: 14,
    });

    const p1 = analysis.panels[0]!;
    const p2 = analysis.panels[1]!;

    expect(p1.scrollTransitSec).toBe(1);
    expect(p1.dialogueReadSec).toBe(0);
    expect(p1.silenceBreathSec).toBe(0.5);
    expect(p1.topY).toBe(0);
    expect(p1.bottomY).toBe(420);
    expect(p1.gutterEndY).toBe(630);

    expect(p2.scrollTransitSec).toBe(2);
    expect(p2.dialogueReadSec).toBe(2.24);
    expect(p2.silenceBreathSec).toBe(1);
    expect(p2.topY).toBe(630);
    expect(p2.bottomY).toBe(1470);
    expect(analysis.summary.totalHeightPx).toBe(1890);
    expect(p2.dwellTimeSec).toBeGreaterThan(p1.dwellTimeSec);
  });

  it("스크롤 속도를 높이면 총 침묵 호흡과 스크롤 통과 시간이 단조 감소한다", () => {
    const panels = instantiateTemplatePanels("romance-silence-longscroll", "naver-800");
    const slow = analyzeScrollRhythm({ panels, platformId: "naver-800", scrollSpeedPxPerSec: 260 });
    const standard = analyzeScrollRhythm({ panels, platformId: "naver-800", scrollSpeedPxPerSec: DEFAULT_SCROLL_SPEED_PX_PER_SEC });
    const fast = analyzeScrollRhythm({ panels, platformId: "naver-800", scrollSpeedPxPerSec: 700 });

    expect(slow.summary.totalSilenceSec).toBeGreaterThan(standard.summary.totalSilenceSec);
    expect(standard.summary.totalSilenceSec).toBeGreaterThan(fast.summary.totalSilenceSec);
    expect(slow.summary.totalExperienceSec).toBeGreaterThan(fast.summary.totalExperienceSec);
  });

  it("긴장도 곡선(0~100)은 긴 침묵 직후 클리프행어·반전 컷에서 파노라마 환기 컷보다 높은 정점을 형성한다", () => {
    const panels = instantiateTemplatePanels("cliffhanger-ending-drop", "naver-800");
    const analysis = analyzeScrollRhythm({ panels, platformId: "naver-800", scrollSpeedPxPerSec: 410 });

    expect(analysis.tensionCurve).toHaveLength(panels.length);
    for (const score of analysis.tensionCurve) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(analysis.summary.peakTensionPanelIndex).toBe(panels.length - 1);
    expect(analysis.summary.peakTension).toBeGreaterThanOrEqual(85);
    expect(analysis.summary.cliffhangerReadinessScore).toBeGreaterThanOrEqual(75);
  });

  it("동일·유사 여백이 3연속 반복되면 monotone-gutter-streak 경고와 영향 컷 인덱스를 정확히 보고한다", () => {
    const monotonePanels = [
      makeSamplePanel({ id: "m1", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "m2", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "m3", gutterAfterPx: 250 }),
      makeSamplePanel({ id: "m4", gutterAfterPx: 410 }),
    ];

    const analysis = analyzeScrollRhythm({ panels: monotonePanels, platformId: "naver-800" });
    const warning = analysis.warnings.find((w) => w.code === "monotone-gutter-streak");

    expect(warning).toBeDefined();
    expect(warning?.affectedIndices).toEqual([0, 1, 2]);
    expect(analysis.summary.monotoneGutterRunCount).toBe(1);
    expect(analysis.panels[0]?.inMonotoneStreak).toBe(true);
    expect(analysis.panels[2]?.inMonotoneStreak).toBe(true);
    expect(analysis.panels[3]?.inMonotoneStreak).toBe(false);
  });

  it("과도하게 좁은 여백·과도한 공백·대사 과밀·평탄 곡선·약한 클리프행어 직전 호흡 경고를 모두 탐지한다", () => {
    const problemPanels: PanelBeatInput[] = [
      makeSamplePanel({ id: "e1", heightPx: 320, gutterAfterPx: 60, dialogueCharCount: 95, role: "dialogue" }),
      makeSamplePanel({ id: "e2", heightPx: 500, gutterAfterPx: 880, dialogueCharCount: 15, role: "dialogue" }),
      makeSamplePanel({ id: "e3", heightPx: 460, gutterAfterPx: 140, dialogueCharCount: 10, role: "dialogue" }),
      makeSamplePanel({ id: "e4", heightPx: 500, gutterAfterPx: 220, dialogueCharCount: 10, role: "cliffhanger" }),
    ];

    const analysis = analyzeScrollRhythm({ panels: problemPanels, platformId: "naver-800", scrollSpeedPxPerSec: 420 });
    const codes = new Set(analysis.warnings.map((w) => w.code));

    expect(codes.has("gutter-too-narrow")).toBe(true);
    expect(codes.has("gutter-excessive-void")).toBe(true);
    expect(codes.has("dialogue-overcrowded")).toBe(true);
    expect(codes.has("weak-cliffhanger-drop")).toBe(true);
  });

  it("평탄한 긴장도 시퀀스(진폭 18 미만)에서 flat-tension-curve 안내 경고를 발생시킨다", () => {
    const flatPanels = [
      makeSamplePanel({ id: "f1", role: "dialogue", gutterAfterPx: 180, dialogueCharCount: 18 }),
      makeSamplePanel({ id: "f2", role: "dialogue", gutterAfterPx: 280, dialogueCharCount: 20 }),
      makeSamplePanel({ id: "f3", role: "dialogue", gutterAfterPx: 190, dialogueCharCount: 22 }),
      makeSamplePanel({ id: "f4", role: "dialogue", gutterAfterPx: 300, dialogueCharCount: 18 }),
    ];
    const analysis = analyzeScrollRhythm({ panels: flatPanels, platformId: "naver-800" });

    expect(analysis.summary.tensionDynamicRange).toBeLessThan(18);
    expect(analysis.warnings.some((w) => w.code === "flat-tension-curve")).toBe(true);
  });

  it("autoBalanceGutters가 4연속 동일 여백 단조로움을 완전히 해소하고 리듬 점수를 개선한다", () => {
    const monotonePanels = [
      makeSamplePanel({ id: "b1", role: "establishing", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "b2", role: "action", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "b3", role: "closeup", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "b4", role: "silence", gutterAfterPx: 240 }),
      makeSamplePanel({ id: "b5", role: "cliffhanger", gutterAfterPx: 240 }),
    ];

    const result = autoBalanceGutters(monotonePanels, "naver-800", 420);

    expect(result.beforeAnalysis.summary.monotoneGutterRunCount).toBe(1);
    expect(result.afterAnalysis.summary.monotoneGutterRunCount).toBe(0);
    expect(result.adjustments.length).toBeGreaterThan(0);
    expect(result.afterAnalysis.summary.rhythmHealthScore).toBeGreaterThan(
      result.beforeAnalysis.summary.rhythmHealthScore,
    );
    // 클리프행어 직전 여백(4번 컷 하단)이 충분한 침묵 호흡을 확보했는지 확인
    expect(result.afterAnalysis.panels[3]!.silenceBreathSec).toBeGreaterThanOrEqual(0.6);
  });

  it("autoBalanceGutters는 동일 입력에 대해 완전히 결정론적으로 동일한 보정 결과를 반환한다", () => {
    const input = [
      makeSamplePanel({ id: "d1", gutterAfterPx: 200 }),
      makeSamplePanel({ id: "d2", gutterAfterPx: 200 }),
      makeSamplePanel({ id: "d3", gutterAfterPx: 200 }),
      makeSamplePanel({ id: "d4", gutterAfterPx: 80 }),
    ];
    const first = autoBalanceGutters(input, "kakao-690", 460);
    const second = autoBalanceGutters(input, "kakao-690", 460);

    expect(first.panels).toEqual(second.panels);
    expect(first.adjustments).toEqual(second.adjustments);
  });

  it("빈 배열·극단적 스크롤 속도 입력에서도 NaN이나 예외 없이 안전하게 동작한다", () => {
    const empty = analyzeScrollRhythm({ panels: [], platformId: "naver-800", scrollSpeedPxPerSec: -50 });
    expect(empty.summary.panelCount).toBe(0);
    expect(empty.summary.totalHeightPx).toBe(0);
    expect(empty.summary.totalExperienceSec).toBe(0);
    expect(empty.scrollSpeedPxPerSec).toBe(160);

    const balancedEmpty = autoBalanceGutters([], "naver-800");
    expect(balancedEmpty.panels).toEqual([]);
    expect(balancedEmpty.adjustments).toEqual([]);
  });
});

describe("3. 순수 시맨틱 SVG 세로 비트 스트립 & JSON 레이아웃 내보내기", () => {
  it("buildRhythmStripSvg가 순수 currentColor·OKLCH만 사용하고 원시 hex/rgb/hsl을 0건 유지한다", () => {
    const panels = instantiateTemplatePanels("thriller-blackout-reveal", "naver-800");
    const analysis = analyzeScrollRhythm({
      panels,
      platformId: "naver-800",
      templateId: "thriller-blackout-reveal",
    });
    const svg = buildRhythmStripSvg(analysis, { showTensionRail: true, showGutterDimensions: true });

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u);
    expect(svg).toContain('data-platform="naver-800"');
    expect(svg).toContain('data-template="thriller-blackout-reveal"');
    expect(svg).toContain('data-role="tension-rail"');
    expect(svg).toContain("currentColor");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(svg).not.toMatch(/\brgba?\s*\(/iu);
    expect(svg).not.toMatch(/\bhsla?\s*\(/iu);
  });

  it("buildRhythmStripSvg가 특수 문자 라벨을 XML 이스케이프하고 모든 컷 ID를 포함한다", () => {
    const panels = [
      makeSamplePanel({ id: "esc-1", labelKo: "A & B <충격> \"대사\"", shape: "slanted" }),
      makeSamplePanel({ id: "esc-2", labelKo: "반전' 컷", shape: "wide-bleed" }),
    ];
    const analysis = analyzeScrollRhythm({ panels, platformId: "global-1080" });
    const svg = buildRhythmStripSvg(analysis);

    expect(svg).toContain("A &amp; B &lt;충격&gt; &quot;대사&quot;");
    expect(svg).toContain("반전&apos; 컷");
    expect(svg).toContain('data-panel-id="esc-1"');
    expect(svg).toContain('data-panel-id="esc-2"');
  });

  it("getTensionOklch가 0~100 모든 긴장도 구간에서 유효한 OKLCH 색상을 반환한다", () => {
    for (const score of [10, 45, 58, 72, 95]) {
      const color = getTensionOklch(score);
      expect(color).toMatch(/^oklch\(/u);
    }
  });

  it("exportPanelRhythmJson이 스키마 버전·플랫폼·시뮬레이션 추정 근거·좌표·경고를 포함한 유효 JSON을 반환한다", () => {
    const panels = instantiateTemplatePanels("panorama-wide-breather", "global-1080");
    const analysis = analyzeScrollRhythm({
      panels,
      platformId: "global-1080",
      scrollSpeedPxPerSec: 480,
      templateId: "panorama-wide-breather",
    });
    const raw = exportPanelRhythmJson(analysis);
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      platform: { id: string; widthPx: number };
      templateId: string;
      simulationParams: { scrollSpeedPxPerSec: number; basis: string };
      summary: { panelCount: number; totalHeightPx: number };
      panels: { id: string; topY: number; bottomY: number }[];
    };

    expect(parsed.schemaVersion).toBe("toonstudio.panel-rhythm.v1");
    expect(parsed.platform.id).toBe("global-1080");
    expect(parsed.platform.widthPx).toBe(1080);
    expect(parsed.templateId).toBe("panorama-wide-breather");
    expect(parsed.simulationParams.scrollSpeedPxPerSec).toBe(480);
    expect(parsed.simulationParams.basis).toBe("estimated-reader-scroll-physics");
    expect(parsed.summary.panelCount).toBe(panels.length);
    expect(parsed.panels[0]?.topY).toBe(0);
  });
});

describe("4. StudioWebtoonPanelRhythmPanel UI · 상호작용 · 접근성 · 코드 위생 감사", () => {
  it("props 없이 단독 렌더링되며 추정 배지·긴장도 곡선·세로 컷 스트립 프리뷰를 표시한다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);

    expect(screen.getByTestId("studio-webtoon-panel-rhythm-panel")).toBeTruthy();
    expect(screen.getByTestId("rhythm-estimate-badge").textContent).toContain("추정");
    expect(screen.getByTestId("rhythm-tension-curve-svg")).toBeTruthy();

    const strip = screen.getByTestId("rhythm-strip-preview-svg");
    expect(strip.getAttribute("data-platform")).toBe("naver-800");
    expect(strip.getAttribute("data-template")).toBe("action-3beat-impact");
    expect(Number(strip.getAttribute("data-panel-count"))).toBe(5);
  });

  it("3종 플랫폼 규격 버튼 클릭 시 규격과 총 세로 길이가 즉시 스케일링된다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);

    const naverHeight = Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-total-height-px"));

    fireEvent.click(screen.getByTestId("rhythm-platform-kakao-690"));
    expect(screen.getByTestId("rhythm-platform-kakao-690").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-platform")).toBe("kakao-690");
    const kakaoHeight = Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-total-height-px"));
    expect(kakaoHeight).toBeLessThan(naverHeight);

    fireEvent.click(screen.getByTestId("rhythm-platform-global-1080"));
    expect(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-platform")).toBe("global-1080");
    const globalHeight = Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-total-height-px"));
    expect(globalHeight).toBeGreaterThan(naverHeight);
  });

  it("8종 연출 리듬 템플릿 카드를 모두 클릭해 즉시 전환할 수 있다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);

    for (const templateId of PANEL_RHYTHM_TEMPLATE_IDS) {
      const btn = screen.getByTestId(`rhythm-template-${templateId}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-template")).toBe(templateId);
    }
  });

  it("스크롤 속도 슬라이더와 빠른 속도 프리셋 조작 시 체류·호흡 시간이 즉시 갱신된다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);

    fireEvent.click(screen.getByTestId("rhythm-speed-preset-careful"));
    expect(screen.getByTestId("rhythm-speed-readout").textContent).toBe("280 px/s");
    const slowTime = parseFloat(screen.getByTestId("rhythm-total-time").textContent ?? "0");

    fireEvent.change(screen.getByTestId("rhythm-speed-slider"), { target: { value: "760" } });
    expect(screen.getByTestId("rhythm-speed-readout").textContent).toBe("760 px/s");
    const fastTime = parseFloat(screen.getByTestId("rhythm-total-time").textContent ?? "0");
    expect(fastTime).toBeLessThan(slowTime);
  });

  it("컷별 높이·여백·대사 슬라이더로 3연속 동일 여백을 만들면 단조로움 경고가 뜨고 자동 보정 버튼이 해소한다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);

    fireEvent.change(screen.getByTestId("panel-gutter-0"), { target: { value: "240" } });
    fireEvent.change(screen.getByTestId("panel-gutter-1"), { target: { value: "240" } });
    fireEvent.change(screen.getByTestId("panel-gutter-2"), { target: { value: "240" } });
    fireEvent.change(screen.getByTestId("panel-height-0"), { target: { value: "760" } });
    fireEvent.change(screen.getByTestId("panel-dialogue-0"), { target: { value: "40" } });

    expect(screen.getByTestId("rhythm-warning-monotone-gutter-streak")).toBeTruthy();

    fireEvent.click(screen.getByTestId("rhythm-auto-balance-btn"));
    expect(screen.queryByTestId("rhythm-warning-monotone-gutter-streak")).toBeNull();
    expect(screen.getByTestId("rhythm-balance-summary")).toBeTruthy();
  });

  it("컷 추가·삭제 및 템플릿 초기화 버튼이 시퀀스 길이를 정확히 관리한다", () => {
    render(<StudioWebtoonPanelRhythmPanel />);
    const initialCount = Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-panel-count"));

    fireEvent.click(screen.getByTestId("rhythm-add-panel-btn"));
    expect(Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-panel-count"))).toBe(
      initialCount + 1,
    );

    fireEvent.click(screen.getByTestId(`panel-remove-${initialCount}`));
    expect(Number(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-panel-count"))).toBe(
      initialCount,
    );

    fireEvent.click(screen.getByTestId("rhythm-reset-btn"));
    expect(screen.getByTestId("rhythm-status-banner").textContent).toContain("복원");
  });

  it("JSON·SVG 복사 버튼과 미리보기 탭 전환이 콜백과 코드 블록을 정상 동작시킨다", () => {
    const onAnalysisChange = vi.fn();
    const onExportJson = vi.fn();
    const onExportSvg = vi.fn();

    render(
      <StudioWebtoonPanelRhythmPanel
        onAnalysisChange={onAnalysisChange}
        onExportJson={onExportJson}
        onExportSvg={onExportSvg}
      />,
    );

    expect(onAnalysisChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("rhythm-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.panel-rhythm.v1");
    expect(screen.getByTestId("rhythm-export-preview").textContent).toContain('"schemaVersion"');

    fireEvent.click(screen.getByTestId("rhythm-copy-svg-btn"));
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("<svg xmlns=");
    expect(screen.getByTestId("rhythm-export-preview").textContent).toContain("<svg xmlns=");

    fireEvent.click(screen.getByTestId("rhythm-preview-tab-hidden"));
    expect(screen.queryByTestId("rhythm-export-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')과 초기 플랫폼·템플릿 props를 정확히 반영한다", () => {
    render(
      <StudioWebtoonPanelRhythmPanel
        locale="en"
        initialPlatform="global-1080"
        initialTemplate="cliffhanger-ending-drop"
      />,
    );

    expect(screen.getByTestId("rhythm-estimate-badge").textContent).toContain("Estimated");
    expect(screen.getByTestId("rhythm-copy-json-btn").textContent).toContain("Copy JSON");
    const strip = screen.getByTestId("rhythm-strip-preview-svg");
    expect(strip.getAttribute("data-platform")).toBe("global-1080");
    expect(strip.getAttribute("data-template")).toBe("cliffhanger-ending-drop");
  });

  it("코드 위생 자가 검증(4개 파일 800줄 이하 · 원시 색/transition-all/= {}/Storage/private Map store/BigInt 리터럴 0건)", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "panel-rhythm-engine.ts",
      "StudioWebtoonPanelRhythmPanel.tsx",
      "index.ts",
      "webtoon-panel-rhythm-studio.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "webtoon-panel-rhythm-studio.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioWebtoonPanelRhythmPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
