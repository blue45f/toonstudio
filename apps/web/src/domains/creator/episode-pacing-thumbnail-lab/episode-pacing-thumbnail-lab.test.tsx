// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BALLOON_MAX_CHARS,
  CUT_BALLOON_WARNING_MIN,
  DEFAULT_THUMBNAIL_CANDIDATE_A,
  DEFAULT_THUMBNAIL_CANDIDATE_B,
  HEURISTIC_DATA_SOURCE_KIND,
  MIN_THUMBNAIL_TITLE_PX,
  StudioEpisodePacingThumbnailPanel,
  THUMBNAIL_PLATFORM_IDS,
  THUMBNAIL_PLATFORM_SPECS,
  analyzeEpisodeHookAndDensity,
  applySplitSuggestionToCuts,
  buildLabDiagnosticReportMarkdown,
  compareThumbnailCandidates,
  computeContrastMetrics,
  countDialogueChars,
  evaluateThumbnailOnPlatform,
  getEpisodeHookPreset,
  getThumbnailPlatformSpec,
  oklchToRelativeLuminance,
  suggestBalloonTextSplit,
  type EpisodeCutInput,
  type ThumbnailCandidateInput,
} from "./index";

afterEach(cleanup);

function makeCut(overrides: Partial<EpisodeCutInput> & { readonly id: string }): EpisodeCutInput {
  return {
    id: overrides.id,
    labelKo: overrides.labelKo ?? `컷 ${overrides.id}`,
    labelEn: overrides.labelEn ?? `Cut ${overrides.id}`,
    role: overrides.role ?? "dialogue",
    emotion: overrides.emotion ?? "curious",
    actionShift: overrides.actionShift ?? "clear",
    tensionLevel: overrides.tensionLevel ?? 64,
    endingHookKind: overrides.endingHookKind,
    balloons: overrides.balloons ?? [{ id: `${overrides.id}-b1`, speaker: "주인공", kind: "speech", text: "짧은 대사입니다." }],
  };
}

describe("1. 초반 3컷 훅 밀도 · 대사 벽 감지 · 분할 제안 · 클리프행어 휴리스틱 엔진", () => {
  it("모든 분석 결과에 실측 로그가 아닌 dataSourceKind='heuristic-estimate'와 안내 문구를 명시한다", () => {
    const preset = getEpisodeHookPreset("tight-action-hook");
    const result = analyzeEpisodeHookAndDensity({ episodeTitle: preset.episodeTitle, cuts: preset.cuts });
    expect(result.dataSourceKind).toBe(HEURISTIC_DATA_SOURCE_KIND);
    expect(result.dataSourceKind).toBe("heuristic-estimate");
    expect(result.heuristicDisclaimerKo).toContain("규칙 기반 휴리스틱");
    expect(result.heuristicDisclaimerEn).toContain("rule-based heuristic");
  });

  it("말풍선 1개당 정확히 42자는 통과하고 43자(42자 초과)부터 대사 벽 경고와 분할 제안을 생성한다", () => {
    const exact42 = "가".repeat(BALLOON_MAX_CHARS);
    const over43 = "나".repeat(BALLOON_MAX_CHARS + 1);

    const okAnalysis = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "c1", emotion: "curious", actionShift: "subtle", balloons: [{ id: "b1", speaker: "A", kind: "speech", text: exact42 }] }),
        makeCut({ id: "c2", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "c3", emotion: "shock", actionShift: "impact", role: "cliffhanger", tensionLevel: 90, endingHookKind: "reveal" }),
      ],
    });
    expect(okAnalysis.summary.overlongBalloonCount).toBe(0);
    expect(okAnalysis.warnings.some((w) => w.code === "dialogue-wall-balloon-length")).toBe(false);

    const badAnalysis = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "c1", emotion: "curious", actionShift: "subtle", balloons: [{ id: "b1", speaker: "A", kind: "speech", text: over43 }] }),
        makeCut({ id: "c2", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "c3", emotion: "shock", actionShift: "impact", role: "cliffhanger", tensionLevel: 90, endingHookKind: "reveal" }),
      ],
    });
    expect(badAnalysis.summary.overlongBalloonCount).toBe(1);
    expect(badAnalysis.warnings.some((w) => w.code === "dialogue-wall-balloon-length")).toBe(true);
    expect(badAnalysis.splitSuggestions.some((s) => s.reason === "balloon-over-42-chars")).toBe(true);
    const firstSuggestion = badAnalysis.splitSuggestions[0];
    expect(firstSuggestion?.suggestedChunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of firstSuggestion?.suggestedChunks ?? []) {
      expect(countDialogueChars(chunk).charCount).toBeLessThanOrEqual(BALLOON_MAX_CHARS);
    }
  });

  it("컷당 말풍선 3개는 정상이고 4개 이상일 때 대사 벽 경고와 반응 컷 분할 제안을 생성한다", () => {
    const threeBalloons = [1, 2, 3].map((n) => ({ id: `b${n}`, speaker: "인물", kind: "speech" as const, text: `짧은 대사 ${n}` }));
    const fourBalloons = [1, 2, 3, 4].map((n) => ({ id: `b${n}`, speaker: "인물", kind: "speech" as const, text: `짧은 대사 ${n}` }));

    const ok = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "c1", emotion: "curious", actionShift: "subtle", balloons: threeBalloons }),
        makeCut({ id: "c2", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "c3", emotion: "shock", actionShift: "impact", role: "cliffhanger", tensionLevel: 88, endingHookKind: "reveal" }),
      ],
    });
    expect(ok.summary.overcrowdedCutCount).toBe(0);

    const bad = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "c1", emotion: "curious", actionShift: "subtle", balloons: fourBalloons }),
        makeCut({ id: "c2", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "c3", emotion: "shock", actionShift: "impact", role: "cliffhanger", tensionLevel: 88, endingHookKind: "reveal" }),
      ],
    });
    expect(bad.summary.overcrowdedCutCount).toBe(1);
    expect(bad.cuts[0]?.balloonCount).toBe(CUT_BALLOON_WARNING_MIN);
    expect(bad.cuts[0]?.hasDialogueWall).toBe(true);
    expect(bad.warnings.some((w) => w.code === "dialogue-wall-balloon-count")).toBe(true);
    expect(bad.splitSuggestions.some((s) => s.reason === "cut-over-4-balloons" && s.recommendedCutSplitIndex === 2)).toBe(true);
  });

  it("suggestBalloonTextSplit이 문장 경계와 공백 없는 연속 한글 모두 42자 이하 청크로 결정론적 분할한다", () => {
    const multiSentence = "첫 번째 문장은 지금 금고에서 벌어진 이상 징후를 설명합니다. 두 번째 문장은 열쇠가 사라진 이유를 묻습니다! 세 번째 문장은 당장 도망쳐야 한다는 경고입니다.";
    const splitA = suggestBalloonTextSplit(multiSentence, BALLOON_MAX_CHARS);
    const splitB = suggestBalloonTextSplit(multiSentence, BALLOON_MAX_CHARS);
    expect(splitA).toEqual(splitB);
    expect(splitA.length).toBeGreaterThanOrEqual(2);
    for (const chunk of splitA) expect(countDialogueChars(chunk).charCount).toBeLessThanOrEqual(BALLOON_MAX_CHARS);

    const noSpace = "가나다라마바사아자차카타파하".repeat(5);
    const splitNoSpace = suggestBalloonTextSplit(noSpace, BALLOON_MAX_CHARS);
    expect(splitNoSpace.length).toBeGreaterThanOrEqual(2);
    expect(splitNoSpace.join("")).toBe(noSpace);
  });

  it("applySplitSuggestionToCuts가 42자 초과 말풍선과 4개 과밀 컷의 대사 벽 경고를 실제 해소한다", () => {
    const preset = getEpisodeHookPreset("overloaded-opening");
    const initial = analyzeEpisodeHookAndDensity({ cuts: preset.cuts });
    expect(initial.summary.dialogueWallCutCount).toBe(2);

    let nextCuts = preset.cuts;
    for (let step = 0; step < 4; step += 1) {
      const current = analyzeEpisodeHookAndDensity({ cuts: nextCuts });
      const suggestion = current.splitSuggestions[0];
      if (!suggestion) break;
      nextCuts = applySplitSuggestionToCuts(nextCuts, suggestion);
    }
    const resolved = analyzeEpisodeHookAndDensity({ cuts: nextCuts });
    expect(resolved.summary.dialogueWallCutCount).toBe(0);
    expect(resolved.summary.overlongBalloonCount).toBe(0);
    expect(resolved.summary.overcrowdedCutCount).toBe(0);
  });

  it("오프닝 3컷 내 감정·행동 변화가 모두 없으면 opening-hook-stagnant 치명 경고를 발생시킨다", () => {
    const stagnantCuts: EpisodeCutInput[] = [
      makeCut({ id: "s1", emotion: "neutral", actionShift: "none", tensionLevel: 30 }),
      makeCut({ id: "s2", emotion: "neutral", actionShift: "none", tensionLevel: 32 }),
      makeCut({ id: "s3", emotion: "neutral", actionShift: "none", tensionLevel: 34 }),
      makeCut({ id: "s4", emotion: "shock", actionShift: "impact", role: "cliffhanger", tensionLevel: 90, endingHookKind: "reveal" }),
    ];
    const analysis = analyzeEpisodeHookAndDensity({ cuts: stagnantCuts });
    expect(analysis.openingThreeCuts.hasEmotionChange).toBe(false);
    expect(analysis.openingThreeCuts.hasActionChange).toBe(false);
    expect(analysis.warnings.some((w) => w.code === "opening-hook-stagnant" && w.severity === "critical")).toBe(true);
    expect(analysis.openingThreeCuts.openingDropOffRiskScore).toBeGreaterThanOrEqual(50);
  });

  it("오프닝 3컷에서 감정만 평탄하거나 행동만 정적인 경우 각각의 세부 경고를 구분 탐지한다", () => {
    const flatEmotion = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "e1", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "e2", emotion: "tense", actionShift: "clear" }),
        makeCut({ id: "e3", emotion: "tense", actionShift: "impact" }),
      ],
    });
    expect(flatEmotion.warnings.some((w) => w.code === "opening-flat-emotion")).toBe(true);
    expect(flatEmotion.warnings.some((w) => w.code === "opening-static-action")).toBe(false);

    const staticAction = analyzeEpisodeHookAndDensity({
      cuts: [
        makeCut({ id: "a1", emotion: "curious", actionShift: "none" }),
        makeCut({ id: "a2", emotion: "tense", actionShift: "none" }),
        makeCut({ id: "a3", emotion: "shock", actionShift: "none" }),
      ],
    });
    expect(staticAction.warnings.some((w) => w.code === "opening-static-action")).toBe(true);
    expect(staticAction.warnings.some((w) => w.code === "opening-flat-emotion")).toBe(false);
  });

  it("초반 3컷 안에 대사 벽이 있으면 opening-dialogue-wall 치명 경고가 함께 발생한다", () => {
    const preset = getEpisodeHookPreset("overloaded-opening");
    const analysis = analyzeEpisodeHookAndDensity({ cuts: preset.cuts });
    expect(analysis.openingThreeCuts.openingDialogueWallCount).toBe(2);
    expect(analysis.warnings.some((w) => w.code === "opening-dialogue-wall" && w.severity === "critical")).toBe(true);
  });

  it("클리프행어 말미 긴장도가 약하면 weak 판정과 경고를, 반전 고긴장 엔딩은 strong 판정을 반환한다", () => {
    const weakEnding = analyzeEpisodeHookAndDensity({ cuts: getEpisodeHookPreset("overloaded-opening").cuts });
    expect(weakEnding.cliffhanger.verdict).toBe("weak");
    expect(weakEnding.warnings.some((w) => w.code === "weak-cliffhanger-ending")).toBe(true);

    const strongEnding = analyzeEpisodeHookAndDensity({ cuts: getEpisodeHookPreset("tight-action-hook").cuts });
    expect(strongEnding.cliffhanger.verdict).toBe("strong");
    expect(strongEnding.cliffhanger.cliffhangerTensionScore).toBeGreaterThanOrEqual(80);
    expect(strongEnding.warnings).toHaveLength(0);
  });

  it("빈 컷 배열·2컷 미만·극단적 긴장도 입력에서도 NaN이나 예외 없이 안전하게 동작한다", () => {
    const empty = analyzeEpisodeHookAndDensity({ cuts: [] });
    expect(empty.summary.cutCount).toBe(0);
    expect(empty.summary.overallPacingScore).toBe(0);
    expect(empty.cliffhanger.closingCutIndex).toBe(-1);

    const short = analyzeEpisodeHookAndDensity({
      cuts: [makeCut({ id: "x1", tensionLevel: -40 }), makeCut({ id: "x2", tensionLevel: 240 })],
    });
    expect(short.cuts[0]?.tensionLevel).toBe(0);
    expect(short.cuts[1]?.tensionLevel).toBe(100);
    expect(short.warnings.some((w) => w.code === "insufficient-opening-cuts")).toBe(true);
  });
});

describe("2. 3종 플랫폼 썸네일 크롭 · 눈/얼굴 잘림 · 배지 충돌 · 타이틀 최소 높이 · WCAG/APCA A/B 비교기", () => {
  it("3종 플랫폼 규격(202×120, 160×160, 390×220)과 최소 타이틀 높이(10px)가 정확히 정의된다", () => {
    expect(THUMBNAIL_PLATFORM_IDS).toEqual(["naver-list-202x120", "kakao-square-160x160", "global-banner-390x220"]);
    expect(THUMBNAIL_PLATFORM_SPECS).toHaveLength(3);
    expect(getThumbnailPlatformSpec("naver-list-202x120")).toMatchObject({ widthPx: 202, heightPx: 120, minTitlePx: MIN_THUMBNAIL_TITLE_PX });
    expect(getThumbnailPlatformSpec("kakao-square-160x160")).toMatchObject({ widthPx: 160, heightPx: 160, minTitlePx: MIN_THUMBNAIL_TITLE_PX });
    expect(getThumbnailPlatformSpec("global-banner-390x220")).toMatchObject({ widthPx: 390, heightPx: 220, minTitlePx: MIN_THUMBNAIL_TITLE_PX });
  });

  it("OKLCH 상대 휘도 및 WCAG 2.1 · APCA Lc 대비 근사가 물리적으로 일관되며 스크림 적용 시 대비가 상승한다", () => {
    const darkY = oklchToRelativeLuminance({ l: 0.15, c: 0.02, h: 250 });
    const lightY = oklchToRelativeLuminance({ l: 0.96, c: 0.01, h: 90 });
    expect(darkY).toBeLessThan(0.05);
    expect(lightY).toBeGreaterThan(0.85);

    const lowNoScrim = computeContrastMetrics({ l: 0.72, c: 0.03, h: 230 }, { l: 0.83, c: 0.02, h: 80 }, { l: 0.65, c: 0.02, h: 220 }, false);
    const lowWithScrim = computeContrastMetrics({ l: 0.72, c: 0.03, h: 230 }, { l: 0.83, c: 0.02, h: 80 }, { l: 0.65, c: 0.02, h: 220 }, true);
    expect(lowNoScrim.grade).toBe("fail");
    expect(lowWithScrim.wcagContrastRatio).toBeGreaterThan(lowNoScrim.wcagContrastRatio);
    expect(lowWithScrim.apcaAbsLc).toBeGreaterThan(lowNoScrim.apcaAbsLc);
  });

  it("인물 눈·얼굴 영역이 크롭 밖으로 밀려나면 eyeClipped·faceClipped와 크롭 처방을 정확히 보고한다", () => {
    const clippedCandidate: ThumbnailCandidateInput = {
      ...DEFAULT_THUMBNAIL_CANDIDATE_B,
      id: "A",
      focalX: 0.15,
      focalY: 0.85,
      zoom: 1.6,
      faceBox: { x: 0.72, y: 0.06, width: 0.22, height: 0.32 },
    };
    const audit = evaluateThumbnailOnPlatform(clippedCandidate, "kakao-square-160x160", []);
    expect(audit.eyeClipped).toBe(true);
    expect(audit.faceClipped).toBe(true);
    expect(audit.eyeVisibleRatio).toBeLessThan(0.5);
    expect(audit.prescriptions.some((p) => p.category === "eye-crop")).toBe(true);
  });

  it("좌상단 UP 및 우상단 휴재·19 배지가 인물 눈·얼굴·타이틀 영역과 겹치면 위치별 충돌을 탐지한다", () => {
    const audit = evaluateThumbnailOnPlatform(DEFAULT_THUMBNAIL_CANDIDATE_A, "naver-list-202x120", ["UP", "휴재", "19"]);
    expect(audit.badgeCollisions.length).toBeGreaterThanOrEqual(2);
    expect(audit.badgeCollisions.some((c) => c.corner === "top-left" && c.badge === "UP" && c.target === "title")).toBe(true);
    expect(audit.badgeCollisions.some((c) => c.corner === "top-right" && (c.badge === "19" || c.badge === "휴재"))).toBe(true);
    expect(audit.prescriptions.some((p) => p.category === "badge-collision")).toBe(true);
  });

  it("축소 타이틀 폰트가 10px 미만이면 titleMeetsMinHeight=false와 권장 원본 폰트 크기 처방을 생성한다", () => {
    const tinyTitle: ThumbnailCandidateInput = { ...DEFAULT_THUMBNAIL_CANDIDATE_B, sourceTitleFontPx: 42 };
    const naverAudit = evaluateThumbnailOnPlatform(tinyTitle, "naver-list-202x120", ["UP"]);
    expect(naverAudit.scaledTitleFontPx).toBeLessThan(MIN_THUMBNAIL_TITLE_PX);
    expect(naverAudit.titleMeetsMinHeight).toBe(false);
    expect(naverAudit.prescriptions.some((p) => p.category === "title-size" && p.messageKo.includes("px 이상"))).toBe(true);
  });

  it("안전영역 중앙 구도·고대비·충분한 타이틀 폰트(후보 B)는 3종 플랫폼 모두 처방 0건으로 통과한다", () => {
    for (const pid of THUMBNAIL_PLATFORM_IDS) {
      const audit = evaluateThumbnailOnPlatform(DEFAULT_THUMBNAIL_CANDIDATE_B, pid, ["UP", "휴재", "19"]);
      expect(audit.eyeClipped).toBe(false);
      expect(audit.faceClipped).toBe(false);
      expect(audit.titleMeetsMinHeight).toBe(true);
      expect(audit.badgeCollisions).toHaveLength(0);
      expect(audit.contrast.grade).toBe("excellent");
      expect(audit.prescriptions).toHaveLength(0);
      expect(audit.totalScore).toBeGreaterThanOrEqual(92);
    }
  });

  it("compareThumbnailCandidates가 A vs B 승자(B 우세), heuristic-estimate 표기, 후보별 처방을 도출한다", () => {
    const result = compareThumbnailCandidates({
      candidateA: DEFAULT_THUMBNAIL_CANDIDATE_A,
      candidateB: DEFAULT_THUMBNAIL_CANDIDATE_B,
      activeBadges: ["UP", "휴재", "19"],
    });
    expect(result.dataSourceKind).toBe("heuristic-estimate");
    expect(result.platforms).toHaveLength(3);
    expect(result.winner).toBe("B");
    expect(result.aggregateScoreB).toBeGreaterThan(result.aggregateScoreA);
    expect(result.prescriptionsA.length).toBeGreaterThan(0);
    expect(result.prescriptionsB).toHaveLength(0);
    expect(result.winnerSummaryKo).toContain("후보 B");
  });

  it("동일 후보 비교 시 동점(tie)을 반환하고, A를 개선하면 A가 역전 승자가 된다", () => {
    const tie = compareThumbnailCandidates({
      candidateA: { ...DEFAULT_THUMBNAIL_CANDIDATE_B, id: "A" },
      candidateB: DEFAULT_THUMBNAIL_CANDIDATE_B,
    });
    expect(tie.winner).toBe("tie");
    expect(tie.scoreDelta).toBe(0);

    const aWins = compareThumbnailCandidates({
      candidateA: { ...DEFAULT_THUMBNAIL_CANDIDATE_B, id: "A" },
      candidateB: { ...DEFAULT_THUMBNAIL_CANDIDATE_A, id: "B" },
    });
    expect(aWins.winner).toBe("A");
    expect(aWins.aggregateScoreA).toBeGreaterThan(aWins.aggregateScoreB);
  });

  it("buildLabDiagnosticReportMarkdown이 한·영 리포트에 heuristic-estimate와 3종 플랫폼 비교 결과를 포함한다", () => {
    const pacing = analyzeEpisodeHookAndDensity({ cuts: getEpisodeHookPreset("overloaded-opening").cuts });
    const thumb = compareThumbnailCandidates({ candidateA: DEFAULT_THUMBNAIL_CANDIDATE_A, candidateB: DEFAULT_THUMBNAIL_CANDIDATE_B });

    const koReport = buildLabDiagnosticReportMarkdown(pacing, thumb, "ko");
    expect(koReport).toContain("heuristic-estimate");
    expect(koReport).toContain("네이버 목록 202×120");
    expect(koReport).toContain("카카오 정방형 160×160");
    expect(koReport).toContain("글로벌 배너 390×220");

    const enReport = buildLabDiagnosticReportMarkdown(pacing, thumb, "en");
    expect(enReport).toContain("Opening 3 Cuts");
    expect(enReport).toContain("Global Banner 390×220");
  });
});

describe("3. StudioEpisodePacingThumbnailPanel UI · 2탭 상호작용 · 실시간 편집 · SVG 크롭 비교", () => {
  it("Props 없이 단독 렌더링되며 '규칙 기반 추정' 배지와 2개 진단 탭을 표시한다", () => {
    render(<StudioEpisodePacingThumbnailPanel />);
    expect(screen.getByTestId("studio-episode-pacing-thumbnail-panel")).toBeTruthy();
    expect(screen.getByTestId("lab-heuristic-badge").textContent).toContain("규칙 기반 추정");
    expect(screen.getByTestId("lab-tab-pacing-hook").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("lab-tab-thumbnail-ab").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("pacing-retention-curve-svg").getAttribute("data-data-source")).toBe("heuristic-estimate");
  });

  it("기본 초고의 대사 벽 경고와 분할 제안이 표시되고 '분할 제안 적용' 클릭 시 대사 벽이 감소한다", () => {
    render(<StudioEpisodePacingThumbnailPanel />);
    expect(screen.getByTestId("pacing-warning-dialogue-wall-balloon-length")).toBeTruthy();
    expect(screen.getByTestId("pacing-warning-dialogue-wall-balloon-count")).toBeTruthy();
    expect(screen.getByTestId("pacing-wall-count").textContent).toContain("2건");

    fireEvent.click(screen.getByTestId("apply-split-split-cut-1-b-1-1"));
    expect(screen.getByTestId("pacing-wall-count").textContent).toContain("1건");
    expect(screen.getByTestId("lab-status-banner").textContent).toContain("분할 제안");
  });

  it("권장 프리셋 전환 시 경고 0건이 되며 컷 추가·말풍선 추가·삭제가 실시간 반영된다", () => {
    render(<StudioEpisodePacingThumbnailPanel />);
    fireEvent.click(screen.getByTestId("pacing-preset-tight-action-hook"));
    expect(screen.getByTestId("pacing-wall-count").textContent).toContain("0건");
    expect(screen.queryByTestId("pacing-split-suggestions")).toBeNull();

    fireEvent.click(screen.getByTestId("pacing-add-cut-btn"));
    expect(screen.getByTestId("pacing-retention-curve-svg").getAttribute("data-cut-count")).toBe("5");

    fireEvent.click(screen.getByTestId("cut-add-balloon-0"));
    expect(screen.getByTestId("balloon-text-0-1")).toBeTruthy();

    fireEvent.click(screen.getByTestId("cut-remove-4"));
    expect(screen.getByTestId("pacing-retention-curve-svg").getAttribute("data-cut-count")).toBe("4");
  });

  it("말풍선 텍스트에 43자 초과 한글을 입력하면 글자 수 경보와 대사 벽 배지가 즉시 활성화된다", () => {
    render(<StudioEpisodePacingThumbnailPanel initialPreset="tight-action-hook" />);
    expect(screen.queryByTestId("cut-wall-badge-0")).toBeNull();

    fireEvent.change(screen.getByTestId("balloon-text-0-0"), {
      target: { value: "이 말풍선은 모바일 화면에서 독자가 한눈에 읽기 어렵도록 일부러 마흔세 글자를 넘겨 작성한 과밀 테스트 문장입니다." },
    });
    expect(screen.getByTestId("cut-wall-badge-0")).toBeTruthy();
    expect(screen.getByTestId("pacing-warning-dialogue-wall-balloon-length")).toBeTruthy();
  });

  it("컷 감정·행동·긴장도·말미 클리프행어 훅 조작 시 초반 3컷 점수와 클리프행어 점수가 갱신된다", () => {
    render(<StudioEpisodePacingThumbnailPanel />);
    const beforeOpening = parseInt(screen.getByTestId("pacing-opening-score").textContent ?? "0", 10);
    const beforeCliff = parseInt(screen.getByTestId("pacing-cliffhanger-score").textContent ?? "0", 10);

    fireEvent.change(screen.getByTestId("cut-emotion-1"), { target: { value: "tense" } });
    fireEvent.change(screen.getByTestId("cut-action-1"), { target: { value: "clear" } });
    fireEvent.change(screen.getByTestId("cut-emotion-2"), { target: { value: "shock" } });
    fireEvent.change(screen.getByTestId("cut-action-2"), { target: { value: "impact" } });
    fireEvent.change(screen.getByTestId("cut-tension-3"), { target: { value: "94" } });
    fireEvent.change(screen.getByTestId("closing-hook-select"), { target: { value: "reveal" } });

    const afterOpening = parseInt(screen.getByTestId("pacing-opening-score").textContent ?? "0", 10);
    const afterCliff = parseInt(screen.getByTestId("pacing-cliffhanger-score").textContent ?? "0", 10);
    expect(afterOpening).toBeGreaterThan(beforeOpening);
    expect(afterCliff).toBeGreaterThan(beforeCliff);
  });

  it("2번째 탭 전환 시 3종 플랫폼 전환과 후보 A/B 축소 SVG 프리뷰 크기가 즉시 갱신된다", () => {
    render(<StudioEpisodePacingThumbnailPanel />);
    fireEvent.click(screen.getByTestId("lab-tab-thumbnail-ab"));
    expect(screen.getByTestId("lab-panel-thumbnail-ab")).toBeTruthy();
    expect(screen.getByTestId("thumb-winner-banner").textContent).toContain("후보 B");

    expect(screen.getByTestId("thumb-preview-svg-A").getAttribute("viewBox")).toBe("0 0 202 120");
    fireEvent.click(screen.getByTestId("thumb-platform-kakao-square-160x160"));
    expect(screen.getByTestId("thumb-preview-svg-A").getAttribute("viewBox")).toBe("0 0 160 160");
    fireEvent.click(screen.getByTestId("thumb-platform-global-banner-390x220"));
    expect(screen.getByTestId("thumb-preview-svg-B").getAttribute("viewBox")).toBe("0 0 390 220");
  });

  it("배지 토글·오버레이 토글·후보 A 폰트/스크림/톤 조작 시 실시간 점수·배지 충돌·오버레이가 갱신된다", () => {
    render(<StudioEpisodePacingThumbnailPanel initialTab="thumbnail-ab" />);
    const initialScoreA = parseInt(screen.getByTestId("thumb-platform-score-A").textContent ?? "0", 10);
    expect(screen.getByTestId("thumb-overlay-group-A")).toBeTruthy();

    fireEvent.click(screen.getByTestId("thumb-overlay-toggle"));
    expect(screen.queryByTestId("thumb-overlay-group-A")).toBeNull();
    fireEvent.click(screen.getByTestId("thumb-overlay-toggle"));
    expect(screen.getByTestId("thumb-overlay-group-A")).toBeTruthy();

    fireEvent.change(screen.getByTestId("thumb-font-A"), { target: { value: "90" } });
    fireEvent.click(screen.getByTestId("thumb-scrim-toggle-A"));
    fireEvent.change(screen.getByTestId("thumb-tone-select-A"), { target: { value: "noir-ivory" } });
    fireEvent.click(screen.getByTestId("thumb-badge-toggle-UP"));

    const updatedScoreA = parseInt(screen.getByTestId("thumb-platform-score-A").textContent ?? "0", 10);
    expect(updatedScoreA).toBeGreaterThan(initialScoreA);

    fireEvent.click(screen.getByTestId("thumb-reset-btn"));
    expect(parseInt(screen.getByTestId("thumb-platform-score-A").textContent ?? "0", 10)).toBe(initialScoreA);
  });

  it("리포트 복사 버튼과 콜백, 영문 로케일(locale='en')이 정상 동작한다", () => {
    const onCopyReport = vi.fn();
    const onPacingAnalysisChange = vi.fn();
    const onThumbnailComparisonChange = vi.fn();

    render(
      <StudioEpisodePacingThumbnailPanel
        locale="en"
        onCopyReport={onCopyReport}
        onPacingAnalysisChange={onPacingAnalysisChange}
        onThumbnailComparisonChange={onThumbnailComparisonChange}
      />,
    );
    expect(screen.getByTestId("lab-heuristic-badge").textContent).toContain("Rule-Based Heuristic");
    expect(onPacingAnalysisChange).toHaveBeenCalled();
    expect(onThumbnailComparisonChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("lab-copy-report-btn"));
    expect(onCopyReport).toHaveBeenCalledTimes(1);
    expect(onCopyReport.mock.calls[0]?.[0]).toContain("heuristic-estimate");
    expect(screen.getByTestId("lab-report-preview").textContent).toContain("Opening 3 Cuts");
  });
});

describe("4. 코드 위생 · Calm Atelier 토큰 · 파일 크기 자가 검증", () => {
  it("4개 파일 존재, 각 800줄 이하, 금지 패턴 0건 및 필수 Calm Atelier 접근성 토큰을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "episode-pacing-thumbnail-engine.ts",
      "StudioEpisodePacingThumbnailPanel.tsx",
      "index.ts",
      "episode-pacing-thumbnail-lab.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect([...allFiles].sort()).toEqual(["OperationStatus.tsx", "StudioEpisodePacingThumbnailPanel.tsx", "ThumbnailControls.tsx", "episode-dialogue-contract.ts", "episode-pacing-thumbnail-engine.ts", "episode-pacing-thumbnail-lab.test.tsx", "index.ts", "pacing-boundaries.test.tsx", "thumbnail-input-contract.ts", "use-clipboard-output.ts", "use-example-notification.ts"]);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "episode-pacing-thumbnail-lab.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioEpisodePacingThumbnailPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("규칙 기반 추정");
      }
    }
  });
});
