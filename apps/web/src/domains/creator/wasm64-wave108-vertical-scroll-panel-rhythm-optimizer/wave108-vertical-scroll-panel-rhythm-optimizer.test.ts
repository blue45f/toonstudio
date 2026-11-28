import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOBILE_VIEWPORT_PROFILES,
  MOBILE_VIEWPORT_SPECS,
  auditVerticalScrollPacingRhythm,
  buildManualVerticalScrollLayout,
  computeScaledViewportHeightPx,
  computeSetupCenteredViewportBounds,
  countDialogueChars,
  optimizeVerticalScrollPanelLayout,
  renderVerticalScrollRhythmSvg,
  selectGutterGradientStyle,
  summarizeVerticalPacingAuditKo,
  type ManualVerticalScrollCutInput,
  type MobileViewportProfile,
  type VerticalScrollCutInput,
} from "./index";

function makeDramaticEpisodeCuts(): readonly VerticalScrollCutInput[] {
  return [
    {
      cutId: "cut-01",
      title: "복도 대화 시작",
      beatKind: "dialogue-volley",
      dialogueText: "오늘 밤 열 시까지 옥상에서 기다릴게.",
      moodTone: "neutral",
      intensity: 0.4,
    },
    {
      cutId: "cut-02",
      title: "되묻는 시선",
      beatKind: "dialogue-volley",
      dialogueText: "혼자 가면 위험하다는 걸 알면서도?",
      moodTone: "neutral",
      intensity: 0.5,
    },
    {
      cutId: "cut-03",
      title: "추격 질주",
      beatKind: "action-rush",
      dialogueText: "거기 서!",
      moodTone: "neutral",
      intensity: 0.85,
    },
    {
      cutId: "cut-04",
      title: "문 앞 정적",
      beatKind: "suspense-hold",
      dialogueText: "문 너머에서 숨소리가 멈췄다.",
      moodTone: "dark",
      intensity: 0.8,
    },
    {
      cutId: "cut-05",
      title: "배신자의 얼굴 공개",
      beatKind: "twist-reveal",
      dialogueText: "그동안 날 찾던 게 너였구나.",
      moodTone: "dark",
      intensity: 0.95,
    },
    {
      cutId: "cut-06",
      title: "비 내리는 여운",
      beatKind: "quiet-aftermath",
      dialogueText: "아무도 먼저 말을 꺼내지 못했다.",
      moodTone: "memory",
      intensity: 0.45,
    },
    {
      cutId: "cut-07",
      title: "절단신공 엔딩",
      beatKind: "cliffhanger-end",
      dialogueText: "다음 화, 사라진 열쇠의 주인이 드러난다.",
      moodTone: "dark",
      intensity: 0.9,
    },
  ];
}

describe("Wave 108 — 세로 스크롤 웹툰 컷 리듬·여백 연출 & 반전 스포일러 차단 솔버", () => {
  it("모바일 3종 뷰포트(360×780, 390×844, 412×915)의 800px 캔버스 환산 높이를 정확히 계산한다", () => {
    expect(DEFAULT_MOBILE_VIEWPORT_PROFILES).toEqual([
      "mobile-360x780",
      "mobile-390x844",
      "mobile-412x915",
    ]);
    const h360 = computeScaledViewportHeightPx(800, "mobile-360x780");
    const h390 = computeScaledViewportHeightPx(800, "mobile-390x844");
    const h412 = computeScaledViewportHeightPx(800, "mobile-412x915");

    expect(h360).toBeCloseTo(1733.33, 1);
    expect(h390).toBeCloseTo(1731.28, 1);
    expect(h412).toBeCloseTo(1776.7, 1);
    expect(h412).toBeGreaterThan(h360);
    expect(h360).toBeGreaterThan(h390);
    expect(MOBILE_VIEWPORT_SPECS["mobile-412x915"].cssHeightPx).toBe(915);
  });

  it("캔버스 폭 변경(예: 1200px)에 비례해 모바일 뷰포트 환산 높이가 선형 확장된다", () => {
    const h800 = computeScaledViewportHeightPx(800, "mobile-412x915");
    const h1200 = computeScaledViewportHeightPx(1200, "mobile-412x915");
    expect(h1200 / h800).toBeCloseTo(1.5, 6);
  });

  it("twist-reveal 및 cliffhanger-end 컷에 대해 모바일 3종 뷰포트 전부에서 twistSpoilerLeakPx === 0을 보장한다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts(), {
      episodeId: "ep-108-twist",
      episodeTitle: "옥상의 배신자",
    });

    expect(layout.maxTwistSpoilerLeakPx).toBe(0);
    expect(layout.spoilerProtectedCutIndices).toEqual([4, 6]);

    const twistCut = layout.cuts[4];
    const cliffhangerCut = layout.cuts[6];
    expect(twistCut?.antiSpoiler.isIsolatedReveal).toBe(true);
    expect(twistCut?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(cliffhangerCut?.antiSpoiler.isIsolatedReveal).toBe(true);
    expect(cliffhangerCut?.antiSpoiler.twistSpoilerLeakPx).toBe(0);

    for (const profile of DEFAULT_MOBILE_VIEWPORT_PROFILES) {
      expect(twistCut?.antiSpoiler.viewportClearancesPx[profile]).toBeGreaterThanOrEqual(0);
      expect(cliffhangerCut?.antiSpoiler.viewportClearancesPx[profile]).toBeGreaterThanOrEqual(0);
    }

    const audit = auditVerticalScrollPacingRhythm(layout, DEFAULT_MOBILE_VIEWPORT_PROFILES);
    expect(audit.spoilerLeaks).toHaveLength(0);
    expect(audit.maxSpoilerLeakPx).toBe(0);
  });

  it("직전 셋업 컷의 중앙 정렬 뷰포트 하단보다 반전 컷 시작 Y가 항상 크거나 같음을 기하학적으로 증명한다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());
    for (const revealIndex of [4, 6]) {
      const setup = layout.cuts[revealIndex - 1];
      const reveal = layout.cuts[revealIndex];
      expect(setup).toBeDefined();
      expect(reveal).toBeDefined();
      if (!setup || !reveal) continue;

      for (const profile of DEFAULT_MOBILE_VIEWPORT_PROFILES) {
        const vh = computeScaledViewportHeightPx(layout.canvasWidthPx, profile);
        const bounds = computeSetupCenteredViewportBounds(setup.yPx, setup.heightPx, vh);
        expect(reveal.yPx).toBeGreaterThanOrEqual(bounds.viewportBottomYPx);
      }
    }
  });

  it("일반 비트라도 isolateFromPreviousViewport: true를 지정하면 반전과 동일하게 0px 격리를 보장한다", () => {
    const layout = optimizeVerticalScrollPanelLayout([
      { cutId: "c1", beatKind: "dialogue-volley", preferredHeightPx: 500 },
      { cutId: "c2", beatKind: "quiet-aftermath", isolateFromPreviousViewport: true },
    ]);

    const isolated = layout.cuts[1];
    expect(isolated?.antiSpoiler.isIsolatedReveal).toBe(true);
    expect(isolated?.antiSpoiler.twistSpoilerLeakPx).toBe(0);

    const audit = auditVerticalScrollPacingRhythm(layout);
    expect(audit.spoilerLeaks).toHaveLength(0);
    expect(audit.maxSpoilerLeakPx).toBe(0);
  });

  it("에피소드 최상단 첫 컷 직후(scrollTop=0 클램프 구간)에 반전이 와도 스포일러 노출 0px를 보장한다", () => {
    const layout = optimizeVerticalScrollPanelLayout(
      [
        { cutId: "open-setup", beatKind: "dialogue-volley", preferredHeightPx: 420 },
        { cutId: "early-twist", beatKind: "twist-reveal", moodTone: "dark" },
      ],
      { topMarginPx: 100 },
    );

    const openCut = layout.cuts[0];
    const twistCut = layout.cuts[1];
    expect(openCut).toBeDefined();
    expect(twistCut).toBeDefined();
    if (!openCut || !twistCut) return;

    const tallestVh = computeScaledViewportHeightPx(800, "mobile-412x915");
    expect(twistCut.yPx).toBeGreaterThanOrEqual(tallestVh);
    expect(twistCut.antiSpoiler.twistSpoilerLeakPx).toBe(0);

    const audit = auditVerticalScrollPacingRhythm(layout);
    expect(audit.spoilerLeaks).toHaveLength(0);
    expect(audit.maxSpoilerLeakPx).toBe(0);
  });

  it("직전 셋업 컷이 매우 짧을 때(340px)와 길 때(1500px) 모두 필요한 사전 여백을 해석적으로 산출한다", () => {
    const shortSetupLayout = optimizeVerticalScrollPanelLayout([
      { cutId: "s0", beatKind: "action-rush", preferredHeightPx: 1200 },
      { cutId: "s1", beatKind: "dialogue-volley", preferredHeightPx: 340 },
      { cutId: "s2", beatKind: "twist-reveal" },
    ]);
    const tallSetupLayout = optimizeVerticalScrollPanelLayout([
      { cutId: "t0", beatKind: "action-rush", preferredHeightPx: 1200 },
      { cutId: "t1", beatKind: "action-rush", preferredHeightPx: 1500 },
      { cutId: "t2", beatKind: "twist-reveal" },
    ]);

    const shortTwist = shortSetupLayout.cuts[2];
    const tallTwist = tallSetupLayout.cuts[2];
    expect(shortTwist?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(tallTwist?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(shortTwist?.gutterBeforePx ?? 0).toBeGreaterThan(tallTwist?.gutterBeforePx ?? 0);
  });

  it("반전 직전 여백이 40px뿐인 수동 배치에서 감사기가 정확한 스포일러 노출 픽셀을 잡아내고 솔버 적용 후 0건으로 해소된다", () => {
    const manualLeakyCuts: readonly ManualVerticalScrollCutInput[] = [
      { cutId: "m-1", beatKind: "dialogue-volley", heightPx: 900, gutterBeforePx: 140 },
      { cutId: "m-2", beatKind: "suspense-hold", heightPx: 600, gutterBeforePx: 160 },
      { cutId: "m-3", beatKind: "twist-reveal", heightPx: 1000, gutterBeforePx: 40, moodTone: "dark" },
    ];
    const leakyLayout = buildManualVerticalScrollLayout(manualLeakyCuts, {
      episodeId: "leaky-manual",
      episodeTitle: "스포일러 노출 초안",
    });

    const beforeAudit = auditVerticalScrollPacingRhythm(leakyLayout);
    expect(beforeAudit.spoilerLeaks.length).toBe(3);
    expect(beforeAudit.maxSpoilerLeakPx).toBeGreaterThan(500);

    const tallLeak = beforeAudit.spoilerLeaks.find((item) => item.viewport === "mobile-412x915");
    expect(tallLeak).toBeDefined();
    expect(tallLeak?.cutId).toBe("m-3");
    expect(tallLeak?.setupCutId).toBe("m-2");
    expect(tallLeak?.leakPx).toBeGreaterThan(500);
    expect(tallLeak?.requiredAdditionalGutterPx).toBeGreaterThan(500);
    expect(tallLeak?.severity).toBe("critical");

    const fixedLayout = optimizeVerticalScrollPanelLayout(manualLeakyCuts, {
      episodeId: "leaky-manual-fixed",
      episodeTitle: "스포일러 차단 완료본",
    });
    const afterAudit = auditVerticalScrollPacingRhythm(fixedLayout);
    expect(afterAudit.spoilerLeaks).toHaveLength(0);
    expect(afterAudit.maxSpoilerLeakPx).toBe(0);
    expect(afterAudit.pacingHealthScore).toBeGreaterThan(beforeAudit.pacingHealthScore);
  });

  it("antiSpoilerSafetyMarginPx가 0px일 때도 누수 0px이며, 60px로 늘리면 뷰포트 여유 클리어런스가 단조 증가한다", () => {
    const cuts: readonly VerticalScrollCutInput[] = [
      { cutId: "a", beatKind: "action-rush", preferredHeightPx: 1200 },
      { cutId: "b", beatKind: "dialogue-volley", preferredHeightPx: 500 },
      { cutId: "c", beatKind: "twist-reveal" },
    ];
    const tight = optimizeVerticalScrollPanelLayout(cuts, { antiSpoilerSafetyMarginPx: 0 });
    const wide = optimizeVerticalScrollPanelLayout(cuts, { antiSpoilerSafetyMarginPx: 60 });

    expect(tight.cuts[2]?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(wide.cuts[2]?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(wide.cuts[2]?.gutterBeforePx ?? 0).toBe((tight.cuts[2]?.gutterBeforePx ?? 0) + 60);
    expect(wide.cuts[2]?.antiSpoiler.viewportClearancesPx["mobile-412x915"] ?? 0).toBeGreaterThan(
      tight.cuts[2]?.antiSpoiler.viewportClearancesPx["mobile-412x915"] ?? 0,
    );
  });

  it("비트 템포 단조성: suspense-hold·twist-reveal 사전 여백이 action-rush·dialogue-volley보다 엄격히 크다", () => {
    const layout = optimizeVerticalScrollPanelLayout([
      { cutId: "base", beatKind: "dialogue-volley" },
      { cutId: "act", beatKind: "action-rush", intensity: 0.7 },
      { cutId: "dlg", beatKind: "dialogue-volley", intensity: 0.5 },
      { cutId: "sus", beatKind: "suspense-hold", intensity: 0.6 },
      { cutId: "tws", beatKind: "twist-reveal", intensity: 0.8 },
    ]);

    const actionGutter = layout.cuts[1]?.gutterBeforePx ?? 0;
    const dialogueGutter = layout.cuts[2]?.gutterBeforePx ?? 0;
    const suspenseGutter = layout.cuts[3]?.gutterBeforePx ?? 0;
    const twistGutter = layout.cuts[4]?.gutterBeforePx ?? 0;

    expect(actionGutter).toBeLessThan(dialogueGutter);
    expect(dialogueGutter).toBeLessThan(suspenseGutter);
    expect(suspenseGutter).toBeLessThan(twistGutter);
  });

  it("action-rush는 좁은 여백과 길쭉한 세로 컷 프레이밍을, quiet-aftermath는 넉넉한 호흡 여백을 생성한다", () => {
    const layout = optimizeVerticalScrollPanelLayout([
      { cutId: "d1", beatKind: "dialogue-volley", dialogueText: "준비됐어?" },
      { cutId: "a1", beatKind: "action-rush", intensity: 0.9 },
      { cutId: "q1", beatKind: "quiet-aftermath", intensity: 0.5 },
    ]);

    const dlg = layout.cuts[0];
    const act = layout.cuts[1];
    const quiet = layout.cuts[2];
    expect(act?.heightPx ?? 0).toBeGreaterThan(dlg?.heightPx ?? 0);
    expect(act?.gutterBeforePx ?? 0).toBeLessThan(80);
    expect(quiet?.gutterBeforePx ?? 0).toBeGreaterThanOrEqual(400);
  });

  it("어두운 분위기(dark) 씬은 fade-to-dark 또는 tension-black을, 회상(memory) 씬은 memory-soft-tint를 선택한다", () => {
    expect(selectGutterGradientStyle("suspense-hold", "dark", "neutral", 0.5)).toBe("fade-to-dark");
    expect(selectGutterGradientStyle("twist-reveal", "dark", "dark", 0.9)).toBe("tension-black");
    expect(selectGutterGradientStyle("cliffhanger-end", "dark", "neutral", 0.8)).toBe("tension-black");
    expect(selectGutterGradientStyle("quiet-aftermath", "memory", "neutral", 0.5)).toBe("memory-soft-tint");
    expect(selectGutterGradientStyle("dialogue-volley", "bright", "bright", 0.4)).toBe("clean-white");
    expect(
      selectGutterGradientStyle("dialogue-volley", "dark", "dark", 0.9, "clean-white"),
    ).toBe("clean-white");
  });

  it("최적화 배치에서 dark/memory/bright 장면별 여백 그라데이션이 일관되게 반영된다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());
    expect(layout.cuts[0]?.gutterGradientStyle).toBe("clean-white");
    expect(layout.cuts[3]?.gutterGradientStyle).toBe("tension-black");
    expect(layout.cuts[4]?.gutterGradientStyle).toBe("tension-black");
    expect(layout.cuts[5]?.gutterGradientStyle).toBe("memory-soft-tint");
    expect(layout.cuts[6]?.gutterGradientStyle).toBe("tension-black");
  });

  it("한 모바일 화면에 180자 이상 대사가 몰린 텍스트 벽을 정확히 검출한다(단일 과밀 컷 + 다중 밀집 컷)", () => {
    const singlePackedText =
      "지금 이 사건의 배후에는 십 년 전 사라진 연구 기록과 세 명의 증인이 얽혀 있으며, 우리가 어젯밤 지하 보관소에서 꺼낸 암호 장부의 마지막 장에는 당시 이사장이 직접 서명한 비밀 거래 조항과 자금 흐름표가 전부 기록되어 있다는 사실을 아무도 모르고 있었어. 게다가 오늘 자정 전까지 증거 원본을 안전 금고 밖으로 옮기지 못하면 남은 목격자들까지 전부 입을 다물게 될 거라고 경비실 통신망에서 긴급 경고가 내려왔으니 지금 즉시 출발해야 해.";
    expect(countDialogueChars(singlePackedText)).toBeGreaterThanOrEqual(180);

    const packedLayout = buildManualVerticalScrollLayout([
      { cutId: "wall-1", beatKind: "dialogue-volley", heightPx: 520, gutterBeforePx: 100, dialogueText: singlePackedText },
      { cutId: "wall-2", beatKind: "dialogue-volley", heightPx: 420, gutterBeforePx: 60, dialogueCharCount: 70 },
      { cutId: "wall-3", beatKind: "dialogue-volley", heightPx: 420, gutterBeforePx: 60, dialogueCharCount: 70 },
    ]);

    const audit = auditVerticalScrollPacingRhythm(packedLayout);
    expect(audit.dialogueTextWalls.length).toBeGreaterThanOrEqual(3);
    expect(audit.peakDialogueCharsPerViewport).toBeGreaterThanOrEqual(180);
    expect(audit.dialogueTextWalls[0]?.excessChars).toBeGreaterThan(60);
  });

  it("화면당 90자 이하로 적절히 분산된 대사 컷은 텍스트 벽 경고 없이 통과한다", () => {
    const cleanDialogue = buildManualVerticalScrollLayout([
      { cutId: "ok-1", beatKind: "dialogue-volley", heightPx: 720, gutterBeforePx: 140, dialogueCharCount: 36 },
      { cutId: "ok-2", beatKind: "dialogue-volley", heightPx: 780, gutterBeforePx: 180, dialogueCharCount: 40 },
      { cutId: "ok-3", beatKind: "suspense-hold", heightPx: 860, gutterBeforePx: 340, dialogueCharCount: 28 },
      { cutId: "ok-4", beatKind: "quiet-aftermath", heightPx: 840, gutterBeforePx: 380, dialogueCharCount: 32 },
    ]);

    const audit = auditVerticalScrollPacingRhythm(cleanDialogue);
    expect(audit.dialogueTextWalls).toHaveLength(0);
    expect(audit.peakDialogueCharsPerViewport).toBeLessThanOrEqual(95);
  });

  it("countDialogueChars는 공백·줄바꿈을 제외하고 한글 글자 수를 세며 명시적 글자 수 입력을 우선한다", () => {
    expect(countDialogueChars("안녕 하세요\n반갑습니다!")).toBe(11);
    expect(countDialogueChars("짧은 문장", 88)).toBe(88);
    expect(countDialogueChars(undefined, undefined)).toBe(0);
    expect(countDialogueChars("텍스트", -12)).toBe(0);
  });

  it("사용자 지정 maxCharsPerViewport 임계값(80자 vs 160자)에 따라 텍스트 벽 판정이 정확히 달라진다", () => {
    const layout = buildManualVerticalScrollLayout([
      { cutId: "d1", beatKind: "dialogue-volley", heightPx: 650, gutterBeforePx: 140, dialogueCharCount: 60 },
      { cutId: "d2", beatKind: "dialogue-volley", heightPx: 650, gutterBeforePx: 140, dialogueCharCount: 55 },
    ]);

    const strictAudit = auditVerticalScrollPacingRhythm(layout, { maxCharsPerViewport: 80 });
    const relaxedAudit = auditVerticalScrollPacingRhythm(layout, { maxCharsPerViewport: 160 });

    expect(strictAudit.dialogueTextWalls.length).toBeGreaterThan(0);
    expect(relaxedAudit.dialogueTextWalls).toHaveLength(0);
  });

  it("동일 높이(600px)·동일 여백(80px) 5연속 박스형 컷을 단조 반복 1개 구간(길이 5)으로 정확히 검출한다", () => {
    const boxyCuts: ManualVerticalScrollCutInput[] = [
      { cutId: "box-1", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 140 },
      { cutId: "box-2", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
      { cutId: "box-3", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
      { cutId: "box-4", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
      { cutId: "box-5", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
    ];
    const boxyLayout = buildManualVerticalScrollLayout(boxyCuts);
    const audit = auditVerticalScrollPacingRhythm(boxyLayout);

    expect(audit.monotonyRuns).toHaveLength(1);
    expect(audit.monotonyRuns[0]?.startCutIndex).toBe(0);
    expect(audit.monotonyRuns[0]?.endCutIndex).toBe(4);
    expect(audit.monotonyRuns[0]?.runLength).toBe(5);
    expect(audit.monotonyRuns[0]?.heightVarianceRatio).toBe(0);
    expect(audit.monotonyRuns[0]?.gutterVarianceRatio).toBe(0);
  });

  it("높이 편차 8% 이하·여백 편차 10% 이하의 미세 변형 4연속 컷도 단조 반복으로 잡아낸다", () => {
    const nearFlatLayout = buildManualVerticalScrollLayout([
      { cutId: "nf-1", beatKind: "dialogue-volley", heightPx: 590, gutterBeforePx: 140 },
      { cutId: "nf-2", beatKind: "dialogue-volley", heightPx: 610, gutterBeforePx: 82 },
      { cutId: "nf-3", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 78 },
      { cutId: "nf-4", beatKind: "dialogue-volley", heightPx: 620, gutterBeforePx: 84 },
    ]);

    const audit = auditVerticalScrollPacingRhythm(nearFlatLayout);
    expect(audit.monotonyRuns).toHaveLength(1);
    expect(audit.monotonyRuns[0]?.runLength).toBe(4);
    expect(audit.monotonyRuns[0]?.heightVarianceRatio).toBeLessThanOrEqual(0.08);
    expect(audit.monotonyRuns[0]?.gutterVarianceRatio).toBeLessThanOrEqual(0.1);
  });

  it("동일 컷 3연속은 단조 기준(4컷 미만)으로 오탐하지 않으며, 다양한 감정 비트 에피소드는 단조 0건이다", () => {
    const threeOnly = buildManualVerticalScrollLayout([
      { cutId: "t1", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 140 },
      { cutId: "t2", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
      { cutId: "t3", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 80 },
    ]);
    expect(auditVerticalScrollPacingRhythm(threeOnly).monotonyRuns).toHaveLength(0);

    const varied = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());
    expect(auditVerticalScrollPacingRhythm(varied).monotonyRuns).toHaveLength(0);
  });

  it("솔버의 단조 자동 분산(breakMonotonyAutomatically)은 6연속 동일 대사 컷에서도 단조 반복을 0건으로 해소한다", () => {
    const sixSameBeats: VerticalScrollCutInput[] = Array.from({ length: 6 }, (_, idx) => ({
      cutId: `rep-${idx + 1}`,
      beatKind: "dialogue-volley",
      preferredHeightPx: 600,
      dialogueCharCount: 24,
    }));

    const autoVaried = optimizeVerticalScrollPanelLayout(sixSameBeats, {
      breakMonotonyAutomatically: true,
    });
    const autoAudit = auditVerticalScrollPacingRhythm(autoVaried);
    expect(autoVaried.monotonyAdjustedCutIndices.length).toBeGreaterThan(0);
    expect(autoAudit.monotonyRuns).toHaveLength(0);

    const lockedUniform = optimizeVerticalScrollPanelLayout(sixSameBeats, {
      breakMonotonyAutomatically: false,
    });
    const lockedAudit = auditVerticalScrollPacingRhythm(lockedUniform);
    expect(lockedAudit.monotonyRuns.length).toBeGreaterThanOrEqual(1);
  });

  it("읽기 시간은 모델 기반 추정치(isEstimatedReadingTime: true)로 명시하고 컷·대사 증가에 따라 단조 증가한다", () => {
    const shortEp = optimizeVerticalScrollPanelLayout([
      { cutId: "s1", beatKind: "action-rush", dialogueCharCount: 10 },
    ]);
    const longEp = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());

    const shortAudit = auditVerticalScrollPacingRhythm(shortEp);
    const longAudit = auditVerticalScrollPacingRhythm(longEp);

    expect(shortAudit.isEstimatedReadingTime).toBe(true);
    expect(shortAudit.readingTimeBasis).toBe("model-derived-estimate");
    expect(longAudit.isEstimatedReadingTime).toBe(true);
    expect(longAudit.readingTimeBasis).toBe("model-derived-estimate");
    expect(shortAudit.estimatedReadDurationSec).toBeGreaterThan(0);
    expect(longAudit.estimatedReadDurationSec).toBeGreaterThan(shortAudit.estimatedReadDurationSec * 4);
  });

  it("리듬 건전성 점수(0..100)는 결함이 많은 수동 초안보다 최적화된 에피소드에서 확연히 높다", () => {
    const roughManual = buildManualVerticalScrollLayout([
      { cutId: "r1", beatKind: "dialogue-volley", heightPx: 500, gutterBeforePx: 140, dialogueCharCount: 95 },
      { cutId: "r2", beatKind: "dialogue-volley", heightPx: 500, gutterBeforePx: 70, dialogueCharCount: 95 },
      { cutId: "r3", beatKind: "dialogue-volley", heightPx: 500, gutterBeforePx: 70, dialogueCharCount: 95 },
      { cutId: "r4", beatKind: "dialogue-volley", heightPx: 500, gutterBeforePx: 70, dialogueCharCount: 95 },
      { cutId: "r5", beatKind: "twist-reveal", heightPx: 900, gutterBeforePx: 40, moodTone: "dark" },
    ]);
    const roughAudit = auditVerticalScrollPacingRhythm(roughManual);

    const polished = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());
    const polishedAudit = auditVerticalScrollPacingRhythm(polished);

    expect(roughAudit.pacingHealthScore).toBeGreaterThanOrEqual(0);
    expect(roughAudit.pacingHealthScore).toBeLessThan(65);
    expect(polishedAudit.pacingHealthScore).toBe(100);
    expect(polishedAudit.pacingHealthScore).toBeGreaterThan(roughAudit.pacingHealthScore);
  });

  it("동일 입력에 대해 솔버·감사기·SVG·한국어 요약이 매 실행마다 바이트 단위로 동일한 결정론 결과를 반환한다", () => {
    const input = makeDramaticEpisodeCuts();
    const layoutA = optimizeVerticalScrollPanelLayout(input, { episodeId: "det-1", episodeTitle: "결정론 검증" });
    const layoutB = optimizeVerticalScrollPanelLayout(input, { episodeId: "det-1", episodeTitle: "결정론 검증" });
    const auditA = auditVerticalScrollPacingRhythm(layoutA);
    const auditB = auditVerticalScrollPacingRhythm(layoutB);
    const svgA = renderVerticalScrollRhythmSvg(layoutA, auditA);
    const svgB = renderVerticalScrollRhythmSvg(layoutB, auditB);
    const briefA = summarizeVerticalPacingAuditKo(layoutA, auditA);
    const briefB = summarizeVerticalPacingAuditKo(layoutB, auditB);

    expect(layoutA).toEqual(layoutB);
    expect(auditA).toEqual(auditB);
    expect(svgA).toBe(svgB);
    expect(briefA).toBe(briefB);
  });

  it("빈 에피소드(0컷) 경계 사례에서 오류·NaN 없이 안전한 레이아웃, 감사, SVG, 한국어 요약을 반환한다", () => {
    const emptyLayout = optimizeVerticalScrollPanelLayout([], {
      episodeId: "empty-ep",
      episodeTitle: "빈 회차",
    });
    const emptyAudit = auditVerticalScrollPacingRhythm(emptyLayout);
    const svg = renderVerticalScrollRhythmSvg(emptyLayout, emptyAudit);
    const brief = summarizeVerticalPacingAuditKo(emptyLayout, emptyAudit);

    expect(emptyLayout.cuts).toHaveLength(0);
    expect(emptyLayout.maxTwistSpoilerLeakPx).toBe(0);
    expect(emptyAudit.spoilerLeaks).toHaveLength(0);
    expect(emptyAudit.dialogueTextWalls).toHaveLength(0);
    expect(emptyAudit.monotonyRuns).toHaveLength(0);
    expect(emptyAudit.estimatedReadDurationSec).toBe(0);
    expect(emptyAudit.isEstimatedReadingTime).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(brief).toContain("총 0컷");
  });

  it("단일 컷(1컷) 에피소드에서 첫 컷이 twist-reveal이어도 직전 셋업 컷이 없으므로 누수 0px로 처리한다", () => {
    const singleLayout = optimizeVerticalScrollPanelLayout([
      { cutId: "solo-twist", beatKind: "twist-reveal", moodTone: "dark", dialogueText: "충격적인 시작." },
    ]);
    const audit = auditVerticalScrollPacingRhythm(singleLayout);

    expect(singleLayout.cuts).toHaveLength(1);
    expect(singleLayout.cuts[0]?.antiSpoiler.isIsolatedReveal).toBe(false);
    expect(singleLayout.cuts[0]?.antiSpoiler.twistSpoilerLeakPx).toBe(0);
    expect(audit.spoilerLeaks).toHaveLength(0);
    expect(audit.monotonyRuns).toHaveLength(0);
    expect(audit.estimatedReadDurationSec).toBeGreaterThan(0);
  });

  it("NaN·Infinity·음수 등 비정상 수치 입력을 방어적으로 정규화해 모든 출력 좌표를 유한 값으로 유지한다", () => {
    const sanitized = optimizeVerticalScrollPanelLayout(
      [
        {
          cutId: "weird-1",
          beatKind: "dialogue-volley",
          preferredHeightPx: Number.NaN,
          intensity: Number.POSITIVE_INFINITY,
          dialogueCharCount: Number.NaN,
        },
        {
          cutId: "weird-2",
          beatKind: "twist-reveal",
          preferredHeightPx: -999,
          intensity: -5,
        },
      ],
      {
        canvasWidthPx: Number.NaN,
        topMarginPx: -50,
        bottomMarginPx: Number.POSITIVE_INFINITY,
      },
    );

    expect(Number.isFinite(sanitized.totalHeightPx)).toBe(true);
    for (const cut of sanitized.cuts) {
      expect(Number.isFinite(cut.yPx)).toBe(true);
      expect(Number.isFinite(cut.heightPx)).toBe(true);
      expect(Number.isFinite(cut.gutterBeforePx)).toBe(true);
    }
    const audit = auditVerticalScrollPacingRhythm(sanitized);
    expect(audit.spoilerLeaks).toHaveLength(0);
    const svg = renderVerticalScrollRhythmSvg(sanitized, audit);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("필름스트립 SVG는 OKLCH 색상만 사용하고 원시 hex/rgb/hsl 색상 문자열과 NaN/Infinity가 0건이다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts(), {
      episodeTitle: "색상 규율 검증 회차",
    });
    const audit = auditVerticalScrollPacingRhythm(layout);
    const svg = renderVerticalScrollRhythmSvg(layout, audit);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("SVG 출력이 제목과 컷 ID의 XML 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
    const layout = optimizeVerticalScrollPanelLayout(
      [
        { cutId: `cut-<1>&"a"`, title: "테스트 '컷'", beatKind: "dialogue-volley" },
        { cutId: "cut-<script>alert(1)</script>", beatKind: "twist-reveal", moodTone: "dark" },
      ],
      { episodeTitle: `제1화 <비밀> & "반전" '시작'` },
    );
    const audit = auditVerticalScrollPacingRhythm(layout);
    const svg = renderVerticalScrollRhythmSvg(layout, audit);

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;비밀&gt; &amp; &quot;반전&quot; &apos;시작&apos;");
    expect(svg).toContain("cut-&lt;1&gt;&amp;&quot;a&quot;");
  });

  it("SVG에 반전 셋업 모바일 뷰포트 오버레이, 다크 그라데이션 정의, 대사 밀도 스파크라인이 모두 포함된다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts());
    const audit = auditVerticalScrollPacingRhythm(layout);
    const svg = renderVerticalScrollRhythmSvg(layout, audit);

    expect(svg).toContain("wave108-gutter-fade-dark");
    expect(svg).toContain("반전 스포일러 차단 0px");
    expect(svg).toContain("412×915");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("대사 밀도 스파크라인");
  });

  it("한국어 편집자 QA 요약은 세로 길이·스포일러 0px·단조·대사 과밀·모델 추정 읽기 시간을 자연스러운 한국어로 보고한다", () => {
    const layout = optimizeVerticalScrollPanelLayout(makeDramaticEpisodeCuts(), {
      episodeId: "ep-108-qa",
      episodeTitle: "12화 옥상의 진실",
    });
    const audit = auditVerticalScrollPacingRhythm(layout);
    const summary = summarizeVerticalPacingAuditKo(layout, audit);

    expect(summary).toContain("[세로 스크롤 리듬 QA] 12화 옥상의 진실 (ep-108-qa)");
    expect(summary).toContain(`전체 세로 길이 ${Math.round(layout.totalHeightPx)}px`);
    expect(summary).toContain("노출 0px");
    expect(summary).toContain("단조 반복 감사: 0건");
    expect(summary).toContain("대사 밀도 감사: 통과");
    expect(summary).toContain("모델 추정치, 실측 독자 텔레메트리 아님");
    expect(summary).not.toContain("가능하게 합니다");
    expect(summary).not.toContain("제공합니다");
  });

  it("감사기 두 번째 인자로 특정 뷰포트 배열만 전달하면 해당 뷰포트만 감사한다", () => {
    const manualLeaky = buildManualVerticalScrollLayout([
      { cutId: "p1", beatKind: "dialogue-volley", heightPx: 600, gutterBeforePx: 140 },
      { cutId: "p2", beatKind: "twist-reveal", heightPx: 900, gutterBeforePx: 40 },
    ]);
    const singleViewport: readonly MobileViewportProfile[] = ["mobile-390x844"];
    const audit = auditVerticalScrollPacingRhythm(manualLeaky, singleViewport);

    expect(audit.auditedViewports).toEqual(["mobile-390x844"]);
    expect(audit.spoilerLeaks).toHaveLength(1);
    expect(audit.spoilerLeaks[0]?.viewport).toBe("mobile-390x844");
  });
});
