// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioVirtualExperienceArtPreview } from "../virtual-space/StudioVirtualExperienceArtPreview";
import {
  ATELIER_GENRE_THEMES,
  DEFAULT_IP_VALUATION_INPUT,
  InteractiveManualEngine,
  MANUAL_RECIPES,
  StudioSpectacleThemeEngine,
  clampCurtainPosition,
  computeOklchContrastRatio,
  evaluateWebtoonIpValuation,
  formatKrwMan,
  formatOklch,
  searchManualRecipes,
  type AtelierGenreThemeId,
} from "./interactive-manual-and-ip-valuation-engine";
import { StudioManualSpectaclePanel } from "./StudioManualSpectaclePanel";

afterEach(() => {
  cleanup();
});

describe("1. 3분 인터랙티브 실습 매뉴얼 엔진 (InteractiveManualEngine)", () => {
  it("초기 상태는 1단계 대기, 진척률 0%, 남은 180초, 배지 없음으로 시작한다", () => {
    const engine = new InteractiveManualEngine();
    const snap = engine.getSnapshot();
    expect(snap.currentStepId).toBe("step-1-draw-stroke");
    expect(snap.completedStepIds).toEqual([]);
    expect(snap.progressPercent).toBe(0);
    expect(snap.estimatedRemainingSec).toBe(180);
    expect(snap.badge).toBeNull();
    expect(snap.celebrationTriggered).toBe(false);
  });

  it("너무 짧은 획이나 단일 좌표는 stroke-too-short로 거절하고 진척률을 올리지 않는다", () => {
    const engine = new InteractiveManualEngine();
    const single = engine.recordCanvasStroke([{ x: 40, y: 40 }]);
    expect(single.ok).toBe(false);
    expect(single.reason).toBe("stroke-too-short");
    expect(single.snapshot.progressPercent).toBe(0);

    const tiny = engine.recordCanvasStroke([
      { x: 40, y: 40 },
      { x: 42, y: 41 },
    ]);
    expect(tiny.ok).toBe(false);
    expect(tiny.reason).toBe("stroke-too-short");
  });

  it("1단계 1획 긋기 미완료 상태에서는 2단계 원탭 자동 채색을 차단한다", () => {
    const engine = new InteractiveManualEngine();
    const result = engine.applyOneTapColor("ice-cyan");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("prerequisite-step-1-required");
    expect(result.snapshot.autoColorApplied).toBe(false);
  });

  it("1단계 선화 1획 긋기 성공 시 진척률 33%, 남은 120초로 갱신되고 2단계로 전이한다", () => {
    const engine = new InteractiveManualEngine();
    const result = engine.recordCanvasStroke([
      { x: 20, y: 120 },
      { x: 90, y: 60 },
      { x: 160, y: 110 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.snapshot.completedStepIds).toEqual(["step-1-draw-stroke"]);
    expect(result.snapshot.currentStepId).toBe("step-2-one-tap-color");
    expect(result.snapshot.progressPercent).toBe(33);
    expect(result.snapshot.estimatedRemainingSec).toBe(120);
    expect(result.snapshot.strokes).toHaveLength(1);
    expect(result.snapshot.strokes[0]?.pathLengthPx).toBeGreaterThan(80);
  });

  it("2단계 원탭 채색 미완료 상태에서는 3단계 말풍선 배치를 차단한다", () => {
    const engine = new InteractiveManualEngine();
    engine.recordCanvasStroke([
      { x: 10, y: 10 },
      { x: 80, y: 90 },
    ]);
    const blocked = engine.placeSpeechBubble("안녕!");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("prerequisite-step-2-required");
    expect(blocked.snapshot.speechBubble).toBeNull();
  });

  it("2단계 원탭 자동 채색 적용 시 진척률 67%, 선택 톤 반영, 3단계로 전이한다", () => {
    const engine = new InteractiveManualEngine();
    engine.recordCanvasStroke([
      { x: 20, y: 100 },
      { x: 120, y: 80 },
    ]);
    const colored = engine.applyOneTapColor("ice-cyan");
    expect(colored.ok).toBe(true);
    expect(colored.snapshot.autoColorApplied).toBe(true);
    expect(colored.snapshot.selectedColorToneId).toBe("ice-cyan");
    expect(colored.snapshot.currentStepId).toBe("step-3-speech-bubble");
    expect(colored.snapshot.progressPercent).toBe(67);
    expect(colored.snapshot.estimatedRemainingSec).toBe(60);
  });

  it("빈 대사 또는 공백 대사는 empty-dialogue로 거부한다", () => {
    const engine = new InteractiveManualEngine();
    engine.recordCanvasStroke([
      { x: 20, y: 100 },
      { x: 120, y: 80 },
    ]);
    engine.applyOneTapColor();
    const empty = engine.placeSpeechBubble("    ");
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe("empty-dialogue");
    expect(empty.snapshot.badge).toBeNull();
  });

  it("3단계 말풍선 대사 배치 완료 시 100% 완주, 완료 배지 발급, 성취 맥박을 트리거한다", () => {
    const engine = new InteractiveManualEngine();
    engine.recordCanvasStroke([
      { x: 30, y: 140 },
      { x: 150, y: 60 },
    ]);
    engine.applyOneTapColor("hanji-coral");
    const done = engine.placeSpeechBubble("드디어 첫 컷 완성!", { x: 210, y: 52 });
    expect(done.ok).toBe(true);
    expect(done.snapshot.currentStepId).toBeNull();
    expect(done.snapshot.progressPercent).toBe(100);
    expect(done.snapshot.estimatedRemainingSec).toBe(0);
    expect(done.snapshot.speechBubble?.text).toBe("드디어 첫 컷 완성!");
    expect(done.snapshot.badge?.id).toBe("studio-3min-first-clear");
    expect(done.snapshot.badge?.completedStepCount).toBe(3);
    expect(done.snapshot.celebrationTriggered).toBe(true);
  });

  it("reset() 호출 시 모든 실습 상태와 배지가 0% 초기 상태로 되돌아간다", () => {
    const engine = new InteractiveManualEngine();
    engine.recordCanvasStroke([
      { x: 30, y: 140 },
      { x: 150, y: 60 },
    ]);
    engine.applyOneTapColor();
    engine.placeSpeechBubble("완주");
    const resetResult = engine.reset();
    expect(resetResult.ok).toBe(true);
    expect(resetResult.snapshot.progressPercent).toBe(0);
    expect(resetResult.snapshot.strokes).toHaveLength(0);
    expect(resetResult.snapshot.autoColorApplied).toBe(false);
    expect(resetResult.snapshot.speechBubble).toBeNull();
    expect(resetResult.snapshot.badge).toBeNull();
  });
});

describe("2. 문맥별 15초 숏폼 레시피 & 단축키 검색 (searchManualRecipes)", () => {
  it("빈 검색어는 전체 숏폼 레시피 목록을 반환하며 모두 3단계·단축키를 갖춘다", () => {
    const all = searchManualRecipes("");
    expect(all).toHaveLength(MANUAL_RECIPES.length);
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all.every((entry) => entry.recipe.steps.length === 3 && entry.recipe.shortcut.length > 0)).toBe(true);
  });

  it("단축키 정확 일치 검색(B, Ctrl+Z, ctrl+alt+g)은 해당 레시피를 1위로 반환한다", () => {
    const bHit = searchManualRecipes("b");
    expect(bHit[0]?.recipe.id).toBe("recipe-ink-stroke");
    expect(bHit[0]?.matchedBy).toBe("shortcut");

    const undoHit = searchManualRecipes("Ctrl+Z");
    expect(undoHit[0]?.recipe.id).toBe("recipe-undo-redo");
    expect(undoHit[0]?.matchedBy).toBe("shortcut");

    const clipHit = searchManualRecipes("ctrl+alt+g");
    expect(clipHit[0]?.recipe.id).toBe("recipe-clipping-shadow");
  });

  it("한글 기능·작업 키워드로 관련 15초 레시피를 정확히 찾는다", () => {
    const bubble = searchManualRecipes("말풍선");
    expect(bubble[0]?.recipe.id).toBe("recipe-speech-bubble");

    const color = searchManualRecipes("원탭 채색");
    expect(color.some((item) => item.recipe.id === "recipe-one-tap-color")).toBe(true);

    const bg3d = searchManualRecipes("3D 투시");
    expect(bg3d[0]?.recipe.id).toBe("recipe-3d-stage-curtain");
  });

  it("문맥 필터를 지정하면 해당 문맥의 레시피만 반환한다", () => {
    const letteringOnly = searchManualRecipes("", "lettering");
    expect(letteringOnly.length).toBeGreaterThanOrEqual(2);
    expect(letteringOnly.every((item) => item.recipe.context === "lettering")).toBe(true);
  });

  it("일치하는 항목이 없는 검색어에는 빈 배열을 안전하게 반환한다", () => {
    expect(searchManualRecipes("존재하지않는기능xyz999")).toEqual([]);
  });
});

describe("3. Anti-Slop OKLCH 4대 장르 아틀리에 무드 & 드래그 커튼 & 성취 맥박", () => {
  const themeEngine = new StudioSpectacleThemeEngine();

  it("4대 웹툰 장르 아틀리에 무드 테마 ID와 OKLCH 직렬화 계약을 충족한다", () => {
    const expectedIds: readonly AtelierGenreThemeId[] = [
      "rofan-cream-gold",
      "hunter-slate-cyan",
      "academy-mint-coral",
      "murim-hanji-ink",
    ];
    expect(ATELIER_GENRE_THEMES.map((t) => t.id)).toEqual(expectedIds);
    for (const theme of ATELIER_GENRE_THEMES) {
      expect(formatOklch(theme.tokens.bg).startsWith("oklch(")).toBe(true);
      expect(formatOklch(theme.tokens.accent).startsWith("oklch(")).toBe(true);
    }
  });

  it("전 4대 장르 테마의 본문·보조·악센트·버튼 텍스트 실측 대비비가 모두 WCAG AA(>= 4.5:1)를 충족한다", () => {
    for (const theme of themeEngine.listThemes()) {
      expect(theme.contrast.passesWcagAa).toBe(true);
      expect(theme.contrast.primaryTextRatio).toBeGreaterThanOrEqual(4.5);
      expect(theme.contrast.secondaryTextRatio).toBeGreaterThanOrEqual(4.5);
      expect(theme.contrast.accentOnSurfaceRatio).toBeGreaterThanOrEqual(4.5);
      expect(theme.contrast.accentButtonTextRatio).toBeGreaterThanOrEqual(4.5);
      // 독립 OKLCH 대비 계산기와 일치 검증
      const directBgInk = computeOklchContrastRatio(theme.tokens.inkPrimary, theme.tokens.bg);
      expect(directBgInk).toBeGreaterThanOrEqual(7);
    }
  });

  it("clampCurtainPosition은 음수·초과·비정상 수를 0~100 범위로 안전 클램프한다", () => {
    expect(clampCurtainPosition(-42)).toBe(0);
    expect(clampCurtainPosition(145)).toBe(100);
    expect(clampCurtainPosition(Number.NaN)).toBe(50);
    expect(clampCurtainPosition(Number.POSITIVE_INFINITY)).toBe(50);
    expect(clampCurtainPosition(37.46)).toBe(37.5);
  });

  it("buildCurtainComparison은 커튼 비율 구간별 설명과 rough+polished=100 불변식을 유지한다", () => {
    const low = themeEngine.buildCurtainComparison(15, "hunter-slate-cyan");
    expect(low.positionPercent).toBe(15);
    expect(low.roughPercent + low.polishedPercent).toBe(100);
    expect(low.activeStageLabel).toContain("3D·풀컬러");

    const mid = themeEngine.buildCurtainComparison(50, "rofan-cream-gold");
    expect(mid.activeStageLabel).toContain("실시간 비교");

    const high = themeEngine.buildCurtainComparison(88, "murim-hanji-ink");
    expect(high.activeStageLabel).toContain("러프 콘티");
  });

  it("성취 맥박은 일반 환경에서 1.5초(1500ms) 프리즘 맥박, reduced-motion 시 정적 배지로 감쇠한다", () => {
    const idle = themeEngine.resolveAchievementPulse({
      triggered: false,
      prefersReducedMotion: false,
      themeId: "rofan-cream-gold",
    });
    expect(idle.mode).toBe("idle");
    expect(idle.durationMs).toBe(0);

    const animated = themeEngine.resolveAchievementPulse({
      triggered: true,
      prefersReducedMotion: false,
      themeId: "academy-mint-coral",
    });
    expect(animated.mode).toBe("prism-pulse");
    expect(animated.durationMs).toBe(1500);
    expect(animated.prismRings).toBe(3);
    expect(animated.sparkleNodes).toBe(8);
    expect(animated.prismGradientCss).toContain("oklch(");

    const reduced = themeEngine.resolveAchievementPulse({
      triggered: true,
      prefersReducedMotion: true,
      themeId: "academy-mint-coral",
    });
    expect(reduced.mode).toBe("static-badge");
    expect(reduced.durationMs).toBe(0);
    expect(reduced.reducedMotionSafe).toBe(true);
    expect(reduced.prismRings).toBe(0);
    expect(reduced.sparkleNodes).toBe(0);
  });

  it("toCssVariables는 원시 HEX 없이 11개 OKLCH CSS 커스텀 프로퍼티를 반환한다", () => {
    const vars = themeEngine.toCssVariables("hunter-slate-cyan");
    const entries = Object.entries(vars);
    expect(entries).toHaveLength(11);
    for (const [key, value] of entries) {
      expect(key.startsWith("--ims-")).toBe(true);
      expect(value.startsWith("oklch(")).toBe(true);
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}/u);
    }
  });
});

describe("4. IP 디지털 자산 시장 가치 시뮬레이터 (evaluateWebtoonIpValuation)", () => {
  it("기본 입력에서 추정치 명시와 보수 <= 기본 <= 낙관 불변식을 충족한다", () => {
    const report = evaluateWebtoonIpValuation(DEFAULT_IP_VALUATION_INPUT);
    expect(report.isEstimate).toBe(true);
    expect(report.estimateNotice).toContain("추정치");
    expect(report.conservativeKrwMan).toBeGreaterThan(0);
    expect(report.conservativeKrwMan).toBeLessThanOrEqual(report.baseKrwMan);
    expect(report.baseKrwMan).toBeLessThanOrEqual(report.optimisticKrwMan);
  });

  it("음수·NaN·극단치 입력에서도 안전 클램프와 보수 <= 기본 <= 낙관 불변식을 유지한다", () => {
    const low = evaluateWebtoonIpValuation({
      episodeCount: -10,
      completionRatePercent: Number.NaN,
      paidConversionRatePercent: -3,
      globalLanguageCount: 0,
      secondaryExpansions: [],
    });
    expect(low.sanitizedInput.episodeCount).toBe(1);
    expect(low.sanitizedInput.globalLanguageCount).toBe(1);
    expect(low.conservativeKrwMan).toBeGreaterThan(0);
    expect(low.conservativeKrwMan).toBeLessThanOrEqual(low.baseKrwMan);
    expect(low.baseKrwMan).toBeLessThanOrEqual(low.optimisticKrwMan);

    const high = evaluateWebtoonIpValuation({
      episodeCount: 9999,
      completionRatePercent: 180,
      paidConversionRatePercent: 95,
      globalLanguageCount: 40,
      secondaryExpansions: ["print-book", "print-book", "web-drama", "web-novel", "merchandise"],
    });
    expect(high.sanitizedInput.episodeCount).toBe(500);
    expect(high.sanitizedInput.completionRatePercent).toBe(100);
    expect(high.sanitizedInput.paidConversionRatePercent).toBe(40);
    expect(high.sanitizedInput.globalLanguageCount).toBe(12);
    expect(high.sanitizedInput.secondaryExpansions).toHaveLength(4);
    expect(high.conservativeKrwMan).toBeLessThanOrEqual(high.baseKrwMan);
    expect(high.baseKrwMan).toBeLessThanOrEqual(high.optimisticKrwMan);
  });

  it("연재 회차·완독률·유료 전환율·글로벌 언어 수가 늘면 기본 추정 IP 가치가 단조 증가한다", () => {
    const base = evaluateWebtoonIpValuation(DEFAULT_IP_VALUATION_INPUT).baseKrwMan;
    const moreEp = evaluateWebtoonIpValuation({ ...DEFAULT_IP_VALUATION_INPUT, episodeCount: 90 }).baseKrwMan;
    const moreComp = evaluateWebtoonIpValuation({ ...DEFAULT_IP_VALUATION_INPUT, completionRatePercent: 92 }).baseKrwMan;
    const morePaid = evaluateWebtoonIpValuation({ ...DEFAULT_IP_VALUATION_INPUT, paidConversionRatePercent: 14 }).baseKrwMan;
    const moreLang = evaluateWebtoonIpValuation({ ...DEFAULT_IP_VALUATION_INPUT, globalLanguageCount: 6 }).baseKrwMan;

    expect(moreEp).toBeGreaterThan(base);
    expect(moreComp).toBeGreaterThan(base);
    expect(morePaid).toBeGreaterThan(base);
    expect(moreLang).toBeGreaterThan(base);
  });

  it("2차 IP 확장(단행본·웹소설·웹드라마·굿즈) 가중치가 공식 배수에 정확히 합산된다", () => {
    const none = evaluateWebtoonIpValuation({
      ...DEFAULT_IP_VALUATION_INPUT,
      secondaryExpansions: [],
    });
    const allFour = evaluateWebtoonIpValuation({
      ...DEFAULT_IP_VALUATION_INPUT,
      secondaryExpansions: ["print-book", "web-novel", "web-drama", "merchandise"],
    });
    expect(none.formula.secondaryExpansionMultiplier).toBe(1);
    expect(allFour.formula.secondaryExpansionMultiplier).toBeCloseTo(2.08, 3);
    expect(allFour.baseKrwMan).toBeGreaterThan(none.baseKrwMan * 2);
  });

  it("가치 상승 레버 Top 3를 상승폭 내림차순으로 산출한다", () => {
    const report = evaluateWebtoonIpValuation(DEFAULT_IP_VALUATION_INPUT);
    expect(report.topLevers).toHaveLength(3);
    expect(report.topLevers[0].deltaBaseKrwMan).toBeGreaterThanOrEqual(report.topLevers[1].deltaBaseKrwMan);
    expect(report.topLevers[1].deltaBaseKrwMan).toBeGreaterThanOrEqual(report.topLevers[2].deltaBaseKrwMan);
    expect(report.topLevers[0].deltaBaseKrwMan).toBeGreaterThan(0);
    // 기본 입력에 미선택된 웹드라마(+48%)가 최상위권 상승 레버에 포함되어야 한다
    expect(report.topLevers.some((lever) => lever.id === "lever-expansion-web-drama")).toBe(true);
  });

  it("formatKrwMan은 만 원 단위를 자연스러운 억/만 원 한글 표기로 변환한다", () => {
    expect(formatKrwMan(8920)).toBe("8,920만 원");
    expect(formatKrwMan(10000)).toBe("1억 원");
    expect(formatKrwMan(12450)).toBe("1억 2,450만 원");
  });
});

describe("5. StudioManualSpectaclePanel UI 인터랙션 · CSS 계약 · 지연 마운트 통합 검증", () => {
  it("4대 장르 아틀리에 무드 버튼 클릭 시 패널 테마와 실측 대비 배지가 즉시 갱신된다", () => {
    render(<StudioManualSpectaclePanel />);
    const panel = screen.getByTestId("studio-manual-spectacle-panel");
    expect(panel.getAttribute("data-atelier-theme")).toBe("rofan-cream-gold");

    fireEvent.click(screen.getByTestId("ims-theme-hunter-slate-cyan"));
    expect(panel.getAttribute("data-atelier-theme")).toBe("hunter-slate-cyan");
    expect(screen.getByTestId("ims-theme-contrast-badge").textContent).toContain("헌터 딥슬레이트·시안");
    expect(screen.getByTestId("ims-theme-contrast-badge").textContent).toContain("AA 통과");

    fireEvent.click(screen.getByTestId("ims-theme-murim-hanji-ink"));
    expect(panel.getAttribute("data-atelier-theme")).toBe("murim-hanji-ink");
  });

  it("비포/애프터 커튼 슬라이더와 프리셋 조작 시 클립 비율과 단계 설명이 실시간 변경된다", () => {
    render(<StudioManualSpectaclePanel />);
    const slider = screen.getByTestId("ims-curtain-slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "82" } });
    expect(screen.getByTestId("ims-curtain-percent-value").textContent).toBe("82%");
    expect(screen.getByTestId("ims-curtain-stage-summary").textContent).toContain("러프 콘티");
    expect(screen.getByTestId("ims-curtain-before-layer").style.clipPath).toBe("inset(0 18% 0 0)");

    fireEvent.click(screen.getByRole("button", { name: "풀컬러 중심 (15%)" }));
    expect(screen.getByTestId("ims-curtain-percent-value").textContent).toBe("15%");
    expect(screen.getByTestId("ims-curtain-stage-summary").textContent).toContain("3D·풀컬러");
  });

  it("3분 인터랙티브 실습 3단계를 순서대로 완주하면 완료 배지와 1.5초 맥박이 켜지고, 모션 감쇠 토글 시 정적 배지로 감쇠한다", () => {
    render(<StudioManualSpectaclePanel />);
    expect(screen.getByTestId("ims-manual-progress").textContent).toContain("0%");
    expect(screen.queryByTestId("ims-completion-badge")).toBeNull();

    // 1단계: 1획 긋기
    fireEvent.click(screen.getByTestId("ims-step1-stroke-btn"));
    expect(screen.getByTestId("ims-manual-progress").textContent).toContain("33%");
    expect(screen.getByTestId("ims-step-step-1-draw-stroke").getAttribute("data-status")).toBe("done");

    // 2단계: 원탭 자동 채색
    fireEvent.click(screen.getByTestId("ims-step2-color-btn"));
    expect(screen.getByTestId("ims-manual-progress").textContent).toContain("67%");
    expect(screen.getByTestId("ims-step-step-2-one-tap-color").getAttribute("data-status")).toBe("done");

    // 3단계: 말풍선 대사 배치
    fireEvent.change(screen.getByTestId("ims-dialogue-input"), {
      target: { value: "3분 실습 완료!" },
    });
    fireEvent.click(screen.getByTestId("ims-step3-bubble-btn"));
    expect(screen.getByTestId("ims-manual-progress").textContent).toContain("100%");
    expect(screen.getByTestId("ims-canvas-speech-bubble").textContent).toContain("3분 실습 완료!");

    const badge = screen.getByTestId("ims-completion-badge");
    expect(badge.getAttribute("data-pulse-mode")).toBe("prism-pulse");
    expect(badge.getAttribute("data-pulse-duration-ms")).toBe("1500");

    // 모션 감쇠 토글 -> 정적 배지 안전 감쇠
    fireEvent.click(screen.getByTestId("ims-reduced-motion-toggle"));
    expect(badge.getAttribute("data-pulse-mode")).toBe("static-badge");
    expect(badge.getAttribute("data-pulse-duration-ms")).toBe("0");

    // 초기화 복원
    fireEvent.click(screen.getByTestId("ims-manual-reset-btn"));
    expect(screen.getByTestId("ims-manual-progress").textContent).toContain("0%");
    expect(screen.queryByTestId("ims-completion-badge")).toBeNull();
  });

  it("15초 숏폼 레시피 검색어와 문맥 필터로 단축키·가이드를 즉시 찾을 수 있다", () => {
    render(<StudioManualSpectaclePanel />);
    const searchInput = screen.getByTestId("ims-recipe-search");
    fireEvent.change(searchInput, { target: { value: "Ctrl+Z" } });
    expect(screen.getByTestId("ims-recipe-recipe-undo-redo")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("ims-recipe-ctx-lettering"));
    expect(screen.getByTestId("ims-recipe-recipe-speech-bubble")).toBeTruthy();
    expect(screen.getByTestId("ims-recipe-count").textContent).toBe("2건");
  });

  it("IP 가치 시뮬레이터 슬라이더와 2차 확장(웹드라마) 토글 시 추정 가치와 레버 Top 3가 실시간 갱신된다", () => {
    render(<StudioManualSpectaclePanel />);
    const beforeBase = screen.getByTestId("ims-val-base").textContent;
    expect(screen.getByTestId("ims-ip-formula-note").textContent).toContain("추정치");
    expect(screen.getByTestId("ims-ip-top-levers").querySelectorAll("li")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("ims-expansion-web-drama"));
    fireEvent.change(screen.getByTestId("ims-ip-episodes"), { target: { value: "100" } });
    const afterBase = screen.getByTestId("ims-val-base").textContent;
    expect(afterBase).not.toBe(beforeBase);
  });

  it("CSS 파일이 원시 HEX·transition-all 없이 OKLCH·44px 터치 타겟·reduced-motion을 준수한다", () => {
    const cssPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/interactive-manual-spectacle/interactive-manual-spectacle.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toContain("transition-all");
    expect(css).toContain("oklch(");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("StudioVirtualExperienceArtPreview의 접이식 패널은 닫혀 있을 때 미마운트, 열었을 때만 lazyRetry로 마운트하며 SVG 중첩 모드(x/y 지정)에서는 생략한다", async () => {
    // 1) SVG 중첩 모드(x/y 지정)에서는 순수 SVG만 반환
    const nested = render(
      <svg>
        <StudioVirtualExperienceArtPreview kind="furniture" artStyle="ink" frame={0} x={-20} y={-20} width={40} height={40} />
      </svg>,
    );
    expect(nested.queryByTestId("studio-manual-spectacle-disclosure")).toBeNull();
    nested.unmount();

    // 2) 일반 미리보기 모드에서는 접이식 패널 제공 및 열 때 lazyRetry 마운트
    render(<StudioVirtualExperienceArtPreview kind="landmarks" artStyle="ink" frame={0} />);
    const disclosure = screen.getByTestId("studio-manual-spectacle-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-manual-spectacle-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-manual-spectacle-panel")).toBeTruthy();
    });
  });
});
