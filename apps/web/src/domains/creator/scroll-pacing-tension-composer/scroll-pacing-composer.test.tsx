// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_DIALOGUE_CHARS,
  MAX_GUTTER_PX,
  MAX_PANEL_HEIGHT_PX,
  MIN_GUTTER_PX,
  SCROLL_PACING_PRESETS,
  SHOT_SCALE_OPTIONS,
  StudioScrollPacingComposerPanel,
  TENSION_GUTTER_EXPANSION_MAX_PX,
  TENSION_GUTTER_EXPANSION_MIN_PX,
  applyScrollPacingProposal,
  auditScrollTensionCurve,
  createScrollPacingSession,
  exportScrollPacingJson,
  exportScrollPacingMarkdown,
  getScrollPacingPreset,
  getShotScaleMeta,
  previewScrollPacingProposal,
  proposeScrollPacingAdjustmentsTop3,
  revertAllPacingAdjustments,
  revertLastPacingAdjustment,
  selectScrollPacingCut,
  updateCutPacingMetrics,
  type ScrollPacingCut,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function makeCut(
  cutNumber: number,
  overrides: Partial<ScrollPacingCut> = {},
): ScrollPacingCut {
  return {
    cutId: `cut-${String(cutNumber).padStart(2, "0")}`,
    cutNumber,
    sceneLabelKo: `테스트 장면 ${cutNumber}`,
    sceneLabelEn: `Test Scene ${cutNumber}`,
    beatRole: "build",
    gutterPx: 140,
    panelHeightPx: 600,
    shotScale: "medium",
    dialogueChars: 20,
    tensionScore: 55,
    ...overrides,
  };
}

describe("1. 4종 대표 회차 리듬 프리셋 계약", () => {
  it("4종 회차 프리셋(로맨스·액션·스릴러·일상 코미디)이 모두 12~24컷 대표 구간으로 정의되어 있다", () => {
    expect(SCROLL_PACING_PRESETS).toHaveLength(4);
    expect(SCROLL_PACING_PRESETS.map((p) => p.id)).toEqual([
      "romance-ep1",
      "action-ep12",
      "thriller-twist",
      "comedy-fourbeat",
    ]);
    for (const preset of SCROLL_PACING_PRESETS) {
      expect(preset.cuts.length).toBeGreaterThanOrEqual(12);
      expect(preset.cuts.length).toBeLessThanOrEqual(24);
    }
  });

  it("모든 프리셋의 컷 지표(여백·높이·샷·대사·긴장도)가 유효 경계 안에 있다", () => {
    const validScales = new Set(SHOT_SCALE_OPTIONS.map((opt) => opt.id));
    for (const preset of SCROLL_PACING_PRESETS) {
      preset.cuts.forEach((cut, idx) => {
        expect(cut.cutNumber).toBe(idx + 1);
        expect(cut.gutterPx).toBeGreaterThanOrEqual(MIN_GUTTER_PX);
        expect(cut.gutterPx).toBeLessThanOrEqual(MAX_GUTTER_PX);
        expect(cut.panelHeightPx).toBeGreaterThanOrEqual(320);
        expect(cut.panelHeightPx).toBeLessThanOrEqual(MAX_PANEL_HEIGHT_PX);
        expect(cut.dialogueChars).toBeGreaterThanOrEqual(0);
        expect(cut.dialogueChars).toBeLessThanOrEqual(MAX_DIALOGUE_CHARS);
        expect(cut.tensionScore).toBeGreaterThanOrEqual(0);
        expect(cut.tensionScore).toBeLessThanOrEqual(100);
        expect(validScales.has(cut.shotScale)).toBe(true);
      });
    }
  });

  it("프리셋 조회 및 샷 스케일 메타가 한글·영문 라벨을 정확히 반환한다", () => {
    const thriller = getScrollPacingPreset("thriller-twist");
    expect(thriller.titleKo).toContain("스릴러");
    expect(thriller.cuts.length).toBe(18);
    expect(getShotScaleMeta("extreme-close-up").shortKo).toBe("ECU");
    expect(getShotScaleMeta("close-up").labelKo).toBe("클로즈업");
  });

  it("4종 프리셋 모두 감사 엔진에서 1건 이상의 호흡 개선 포인트를 결정론적으로 탐지한다", () => {
    for (const preset of SCROLL_PACING_PRESETS) {
      const report1 = auditScrollTensionCurve(preset.cuts);
      const report2 = auditScrollTensionCurve(preset.cuts);
      expect(report1).toEqual(report2);
      expect(report1.issues.length).toBeGreaterThanOrEqual(2);
      expect(report1.climaxGutterShortfalls.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("2. 호흡 정체 & 이탈 구간 탐지 엔진 (auditScrollTensionCurve)", () => {
  it("빈 컷 배열 입력 시 예외 없이 0점·D등급·빈 경고 목록을 반환한다", () => {
    const report = auditScrollTensionCurve([]);
    expect(report.cutCount).toBe(0);
    expect(report.immersionScore).toBe(0);
    expect(report.grade).toBe("D");
    expect(report.issues).toHaveLength(0);
  });

  it("NaN·음수·극단값이 섞인 컷 데이터도 안전하게 클램핑해 유한한 진단 결과를 산출한다", () => {
    const dirtyCuts: ScrollPacingCut[] = [
      makeCut(1, { gutterPx: Number.NaN, panelHeightPx: -500, dialogueChars: 999, tensionScore: 150 }),
      makeCut(2, { gutterPx: 9999, panelHeightPx: Number.POSITIVE_INFINITY, dialogueChars: -20, tensionScore: -10 }),
    ];
    const report = auditScrollTensionCurve(dirtyCuts);
    expect(Number.isFinite(report.immersionScore)).toBe(true);
    expect(Number.isFinite(report.totalScrollHeightPx)).toBe(true);
    expect(report.totalScrollHeightPx).toBeGreaterThan(0);
  });

  it("연속 3컷 이상 긴장도·여백 변화가 평탄한 지루함 구간을 탐지하고 4컷 이상은 critical로 상향한다", () => {
    const flatCuts = [
      makeCut(1, { tensionScore: 40, gutterPx: 120 }),
      makeCut(2, { tensionScore: 42, gutterPx: 125 }),
      makeCut(3, { tensionScore: 41, gutterPx: 120 }),
      makeCut(4, { tensionScore: 43, gutterPx: 130 }),
      makeCut(5, { tensionScore: 78, gutterPx: 260 }),
    ];
    const report = auditScrollTensionCurve(flatCuts);
    expect(report.flatZones).toHaveLength(1);
    expect(report.flatZones[0].startCut).toBe(1);
    expect(report.flatZones[0].endCut).toBe(4);
    expect(report.flatZones[0].severity).toBe("critical");
    expect(report.issues.some((item) => item.code === "flat-pacing")).toBe(true);
  });

  it("과밀 대사 연타(연속 52자 이상)와 단일 초고밀도(78자 이상) 구간을 호흡 막힘으로 감지한다", () => {
    const denseCuts = [
      makeCut(1, { dialogueChars: 12, tensionScore: 40 }),
      makeCut(2, { dialogueChars: 58, tensionScore: 52 }),
      makeCut(3, { dialogueChars: 64, tensionScore: 66 }),
      makeCut(4, { dialogueChars: 14, tensionScore: 50 }),
      makeCut(5, { dialogueChars: 84, tensionScore: 72 }),
    ];
    const report = auditScrollTensionCurve(denseCuts);
    expect(report.denseDialogueZones).toHaveLength(2);
    expect(report.denseDialogueZones[0].cutNumbers).toEqual([2, 3]);
    expect(report.denseDialogueZones[1].cutNumbers).toEqual([5]);
    expect(report.denseDialogueZones[1].severity).toBe("critical");
  });

  it("클라이맥스 직전 여백이 권장치 미만이면 narrow-climax-gutter를 탐지하고 확장 후 해소한다", () => {
    const narrowCuts = [
      makeCut(1, { beatRole: "breather", tensionScore: 58, gutterPx: 150 }),
      makeCut(2, { beatRole: "climax", tensionScore: 93, gutterPx: 90 }),
    ];
    const before = auditScrollTensionCurve(narrowCuts);
    expect(before.climaxGutterShortfalls).toHaveLength(1);
    expect(before.climaxGutterShortfalls[0].recommendedGutterPx).toBe(320);
    expect(before.climaxGutterShortfalls[0].deficitPx).toBe(230);

    const expanded = [narrowCuts[0], { ...narrowCuts[1], gutterPx: 340 }];
    const after = auditScrollTensionCurve(expanded);
    expect(after.climaxGutterShortfalls).toHaveLength(0);
  });

  it("엔딩 클리프행어 강도(0~100)가 마지막 3컷 가속·긴 여백·짧은 대사·ECU 연출에 비례해 정확히 구분된다", () => {
    const strongEnding = [
      makeCut(1, { tensionScore: 74, gutterPx: 80, panelHeightPx: 480, dialogueChars: 18 }),
      makeCut(2, { tensionScore: 86, gutterPx: 65, panelHeightPx: 440, shotScale: "close-up", dialogueChars: 12 }),
      makeCut(3, { beatRole: "cliffhanger", tensionScore: 97, gutterPx: 340, panelHeightPx: 900, shotScale: "extreme-close-up", dialogueChars: 8 }),
    ];
    const weakEnding = [
      makeCut(1, { tensionScore: 68, gutterPx: 140, panelHeightPx: 640, dialogueChars: 40 }),
      makeCut(2, { tensionScore: 62, gutterPx: 145, panelHeightPx: 640, dialogueChars: 44 }),
      makeCut(3, { beatRole: "cliffhanger", tensionScore: 56, gutterPx: 110, panelHeightPx: 600, shotScale: "wide", dialogueChars: 64 }),
    ];
    const strongAudit = auditScrollTensionCurve(strongEnding);
    const weakAudit = auditScrollTensionCurve(weakEnding);
    expect(strongAudit.cliffhangerStrength).toBeGreaterThanOrEqual(88);
    expect(weakAudit.cliffhangerStrength).toBeLessThan(55);
    expect(weakAudit.issues.some((item) => item.code === "weak-cliffhanger")).toBe(true);
  });

  it("균형 잡힌 회차 시퀀스는 경고 0건 및 A/S 등급(85점 이상)을 기록한다", () => {
    const balancedCuts = [
      makeCut(1, { beatRole: "hook", tensionScore: 60, gutterPx: 100, dialogueChars: 14 }),
      makeCut(2, { beatRole: "setup", tensionScore: 42, gutterPx: 150, dialogueChars: 24 }),
      makeCut(3, { beatRole: "build", tensionScore: 68, gutterPx: 120, dialogueChars: 18 }),
      makeCut(4, { beatRole: "breather", tensionScore: 48, gutterPx: 180, dialogueChars: 6 }),
      makeCut(5, { beatRole: "climax", tensionScore: 94, gutterPx: 340, panelHeightPx: 920, shotScale: "extreme-close-up", dialogueChars: 12 }),
      makeCut(6, { beatRole: "build", tensionScore: 76, gutterPx: 80, panelHeightPx: 480, dialogueChars: 16 }),
      makeCut(7, { beatRole: "build", tensionScore: 86, gutterPx: 65, panelHeightPx: 440, shotScale: "close-up", dialogueChars: 12 }),
      makeCut(8, { beatRole: "cliffhanger", tensionScore: 96, gutterPx: 340, panelHeightPx: 920, shotScale: "extreme-close-up", dialogueChars: 8 }),
    ];
    const report = auditScrollTensionCurve(balancedCuts);
    expect(report.issues).toHaveLength(0);
    expect(report.immersionScore).toBeGreaterThanOrEqual(85);
    expect(["S", "A"]).toContain(report.grade);
  });

  it("컷별 누적 스크롤 좌표(scrollStartPx~scrollEndPx)와 총 세로 길이가 정확히 일치한다", () => {
    const preset = getScrollPacingPreset("romance-ep1");
    const report = auditScrollTensionCurve(preset.cuts);
    let expectedY = 0;
    report.cutDiagnostics.forEach((diag, idx) => {
      const cut = preset.cuts[idx];
      expect(diag.scrollStartPx).toBe(expectedY);
      expectedY += cut.gutterPx + cut.panelHeightPx;
      expect(diag.scrollEndPx).toBe(expectedY);
      expect(diag.estimatedReadSec).toBeGreaterThan(0);
    });
    expect(report.totalScrollHeightPx).toBe(expectedY);
  });
});

describe("3. 비파괴 Top-3 컷 호흡 연출 개선안 (proposeScrollPacingAdjustmentsTop3)", () => {
  it("항상 정확히 3종 전략을 순위 1~3으로 생성한다", () => {
    const proposals = proposeScrollPacingAdjustmentsTop3(getScrollPacingPreset("romance-ep1").cuts);
    expect(proposals).toHaveLength(3);
    expect(proposals.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(proposals.map((p) => p.strategyId)).toEqual([
      "tension-gutter-expansion",
      "closeup-impact-boost",
      "cliffhanger-surge",
    ]);
  });

  it("Top-3 제안 생성은 입력 cuts 배열과 내부 컷 객체를 절대 변형하지 않는다", () => {
    const original = getScrollPacingPreset("action-ep12").cuts.map((c) => ({ ...c }));
    const snapshot = JSON.stringify(original);
    proposeScrollPacingAdjustmentsTop3(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("(1) 긴장 여백 확장안은 클라이맥스 직전 여백을 +180~320px 확장하고 여백 부족 경고를 해소한다", () => {
    const cuts = getScrollPacingPreset("romance-ep1").cuts;
    const [p1] = proposeScrollPacingAdjustmentsTop3(cuts);
    const climaxPatch = p1.cutPatches.find((patch) => patch.cutNumber === 13);
    expect(climaxPatch).toBeDefined();
    expect(climaxPatch?.deltaGutterPx).toBeGreaterThanOrEqual(TENSION_GUTTER_EXPANSION_MIN_PX);
    expect(climaxPatch?.deltaGutterPx).toBeLessThanOrEqual(TENSION_GUTTER_EXPANSION_MAX_PX);
    expect(p1.projectedAudit.climaxGutterShortfalls).toHaveLength(0);
    expect(p1.scoreGain).toBeGreaterThan(0);
  });

  it("(2) 클로즈업·임팩트 컷 확대안은 핵심 컷 높이를 키우고 평탄 구간 변주 및 과밀 대사를 경감한다", () => {
    const cuts = getScrollPacingPreset("thriller-twist").cuts;
    const baseAudit = auditScrollTensionCurve(cuts);
    const [, p2] = proposeScrollPacingAdjustmentsTop3(cuts);
    const peakBefore = cuts[baseAudit.peakTensionCutNumber - 1];
    const peakAfter = p2.proposedCuts[baseAudit.peakTensionCutNumber - 1];
    expect(peakAfter.panelHeightPx).toBeGreaterThan(peakBefore.panelHeightPx);
    expect(["close-up", "extreme-close-up"]).toContain(peakAfter.shotScale);
    expect(p2.projectedAudit.denseDialogueZones.length).toBeLessThan(baseAudit.denseDialogueZones.length);
    expect(p2.projectedAudit.flatZones.length).toBeLessThan(baseAudit.flatZones.length);
    expect(p2.scoreGain).toBeGreaterThan(0);
  });

  it("(3) 엔딩 클리프행어 극대화안은 마지막 3컷 템포를 가속하고 클리프행어 강도를 크게 끌어올린다", () => {
    const cuts = getScrollPacingPreset("comedy-fourbeat").cuts;
    const baseAudit = auditScrollTensionCurve(cuts);
    const [, , p3] = proposeScrollPacingAdjustmentsTop3(cuts);
    const lastIdx = cuts.length - 1;
    expect(p3.proposedCuts[lastIdx - 1].gutterPx).toBeLessThanOrEqual(70);
    expect(p3.proposedCuts[lastIdx].gutterPx).toBeGreaterThanOrEqual(320);
    expect(p3.proposedCuts[lastIdx].shotScale).toBe("extreme-close-up");
    expect(p3.proposedCuts[lastIdx].dialogueChars).toBeLessThanOrEqual(12);
    expect(p3.projectedAudit.cliffhangerStrength).toBeGreaterThan(baseAudit.cliffhangerStrength + 15);
    expect(p3.cliffhangerGain).toBeGreaterThan(15);
  });

  it("4종 모든 프리셋에서 Top-3 개선안이 순차 적용 가능하며 몰입 리듬 점수를 상승시킨다", () => {
    for (const preset of SCROLL_PACING_PRESETS) {
      const base = auditScrollTensionCurve(preset.cuts);
      let working = preset.cuts;
      for (const idx of [0, 1, 2] as const) {
        const proposals = proposeScrollPacingAdjustmentsTop3(working);
        working = proposals[idx].proposedCuts;
      }
      const combined = auditScrollTensionCurve(working);
      expect(combined.immersionScore).toBeGreaterThan(base.immersionScore);
      expect(combined.cliffhangerStrength).toBeGreaterThanOrEqual(85);
    }
  });
});

describe("4. 비파괴 상태 머신 · 컷별 편집 · Markdown/JSON 내보내기", () => {
  it("세션 초기화 시 클라이맥스 여백 부족 등 핵심 문제 컷을 자동 선택하고 revision 0으로 시작한다", () => {
    const session = createScrollPacingSession("romance-ep1");
    expect(session.revision).toBe(0);
    expect(session.selectedCutNumber).toBe(13);
    expect(session.previewProposalId).toBeNull();
    expect(session.workingCuts).toEqual(session.baselineCuts);
  });

  it("미리보기 토글은 workingCuts를 변경하지 않으며 같은 id 재호출 시 미리보기를 해제한다", () => {
    const s0 = createScrollPacingSession("action-ep12");
    const [p1] = proposeScrollPacingAdjustmentsTop3(s0.workingCuts);
    const s1 = previewScrollPacingProposal(s0, p1.id);
    expect(s1.previewProposalId).toBe(p1.id);
    expect(s1.workingCuts).toEqual(s0.workingCuts);

    const s2 = previewScrollPacingProposal(s1, p1.id);
    expect(s2.previewProposalId).toBeNull();
  });

  it("제안 적용 후 직전 원복(revertLastPacingAdjustment)이 이전 컷 상태로 정확히 되돌린다", () => {
    const s0 = createScrollPacingSession("romance-ep1");
    const [p1] = proposeScrollPacingAdjustmentsTop3(s0.workingCuts);
    const s1 = applyScrollPacingProposal(s0, p1);
    expect(s1.revision).toBe(1);
    expect(s1.appliedStrategyIds).toContain("tension-gutter-expansion");
    expect(s1.workingCuts[12].gutterPx).toBeGreaterThan(s0.workingCuts[12].gutterPx);

    const s2 = revertLastPacingAdjustment(s1);
    expect(s2.revision).toBe(2);
    expect(s2.workingCuts).toEqual(s0.workingCuts);
    expect(s2.undoStack).toHaveLength(0);
  });

  it("다단계 수동 편집과 제안 적용 후 전체 원복(revertAllPacingAdjustments)이 baselineCuts로 복구한다", () => {
    let s = createScrollPacingSession("thriller-twist");
    s = selectScrollPacingCut(s, 5);
    s = updateCutPacingMetrics(s, 5, { gutterPx: 300, tensionScore: 82 });
    const [, p2] = proposeScrollPacingAdjustmentsTop3(s.workingCuts);
    s = applyScrollPacingProposal(s, p2);
    expect(s.revision).toBe(2);

    const reset = revertAllPacingAdjustments(s);
    expect(reset.workingCuts).toEqual(s.baselineCuts);
    expect(reset.appliedStrategyIds).toHaveLength(0);
    expect(reset.undoStack).toHaveLength(0);
    expect(reset.history[0].action).toBe("revert-all");
  });

  it("updateCutPacingMetrics는 범위 밖 입력을 클램핑하고 변화 없으면 동일 세션을 반환한다", () => {
    const s0 = createScrollPacingSession("comedy-fourbeat");
    const s1 = updateCutPacingMetrics(s0, 1, { gutterPx: 9999, tensionScore: -30, shotScale: "extreme-close-up" });
    expect(s1.workingCuts[0].gutterPx).toBe(MAX_GUTTER_PX);
    expect(s1.workingCuts[0].tensionScore).toBe(0);
    expect(s1.workingCuts[0].shotScale).toBe("extreme-close-up");

    const unchanged = updateCutPacingMetrics(s1, 1, { gutterPx: MAX_GUTTER_PX });
    expect(unchanged).toBe(s1);
  });

  it("Markdown 및 JSON 리듬 시트 내보내기가 스키마·컷 수·로케일을 정확히 출력한다", () => {
    const preset = getScrollPacingPreset("romance-ep1");
    const session = createScrollPacingSession("romance-ep1");
    const audit = auditScrollTensionCurve(session.workingCuts);

    const mdKo = exportScrollPacingMarkdown({ preset, cuts: session.workingCuts, audit, session, locale: "ko" });
    const mdEn = exportScrollPacingMarkdown({ preset, cuts: session.workingCuts, audit, session, locale: "en" });
    expect(mdKo).toContain("# 세로 스크롤 감정 곡선 · 컷 호흡 리듬 시트");
    expect(mdKo).toContain("| #16 |");
    expect(mdEn).toContain("# Scroll Pacing & Tension Sheet");

    const jsonStr = exportScrollPacingJson({ preset, cuts: session.workingCuts, audit, session });
    const parsed = JSON.parse(jsonStr) as { schema: string; cuts: unknown[]; summary: { cutCount: number } };
    expect(parsed.schema).toBe("toonstudio.scroll-pacing-tension-composer.v1");
    expect(parsed.cuts).toHaveLength(16);
    expect(parsed.summary.cutCount).toBe(16);
  });
});

describe("5. 스튜디오 패널 UI · SVG 감정 곡선 · 인터랙션 (StudioScrollPacingComposerPanel)", () => {
  it("props 없이 기본 마운트되어 감정 곡선 SVG와 미니 세로 원고 리듬 바를 렌더링한다", () => {
    render(<StudioScrollPacingComposerPanel />);
    expect(screen.getByTestId("studio-scroll-pacing-composer-panel")).toBeTruthy();
    const curveSvg = screen.getByTestId("scroll-tension-curve-svg");
    const stripSvg = screen.getByTestId("scroll-manuscript-strip-svg");
    expect(curveSvg.getAttribute("data-preset-id")).toBe("romance-ep1");
    expect(curveSvg.getAttribute("data-preview-active")).toBe("false");
    expect(stripSvg.getAttribute("data-cut-count")).toBe("16");
    expect(screen.getByTestId("svg-current-curve-line")).toBeTruthy();
    expect(screen.queryByTestId("svg-proposed-curve-line")).toBeNull();
  });

  it("4종 회차 프리셋 전환 시 컷 수와 감정 곡선 SVG가 즉시 갱신된다", () => {
    render(<StudioScrollPacingComposerPanel />);
    fireEvent.click(screen.getByTestId("preset-btn-action-ep12"));
    expect(screen.getByTestId("scroll-tension-curve-svg").getAttribute("data-preset-id")).toBe("action-ep12");
    expect(screen.getByTestId("scroll-manuscript-strip-svg").getAttribute("data-cut-count")).toBe("20");

    fireEvent.click(screen.getByTestId("preset-btn-comedy-fourbeat"));
    expect(screen.getByTestId("scroll-manuscript-strip-svg").getAttribute("data-cut-count")).toBe("14");
  });

  it("Top-3 제안 미리보기 토글 시 점선 제안 곡선 오버레이가 표시되고 재클릭 시 닫힌다", () => {
    render(<StudioScrollPacingComposerPanel />);
    const previewBtn = screen.getByTestId("proposal-preview-btn-1");
    fireEvent.click(previewBtn);
    expect(screen.getByTestId("scroll-tension-curve-svg").getAttribute("data-preview-active")).toBe("true");
    expect(screen.getByTestId("svg-proposed-curve-line")).toBeTruthy();
    expect(screen.getByTestId("pacing-mode-badge").textContent).toContain("미리보기");

    fireEvent.click(previewBtn);
    expect(screen.queryByTestId("svg-proposed-curve-line")).toBeNull();
  });

  it("제안 비파괴 적용 시 onApply 콜백을 호출하고 직전 원복·원본 복구 버튼이 동작한다", () => {
    const onApply = vi.fn();
    render(<StudioScrollPacingComposerPanel onApply={onApply} />);
    const initialScore = Number(screen.getByTestId("kpi-immersion-score").textContent?.match(/\d+/)?.[0] ?? "0");

    fireEvent.click(screen.getByTestId("proposal-apply-btn-1"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const nextScore = Number(screen.getByTestId("kpi-immersion-score").textContent?.match(/\d+/)?.[0] ?? "0");
    expect(nextScore).toBeGreaterThan(initialScore);
    expect(screen.getByTestId("pacing-revision-counter").textContent).toContain("r1");

    fireEvent.click(screen.getByTestId("revert-last-btn"));
    const revertedScore = Number(screen.getByTestId("kpi-immersion-score").textContent?.match(/\d+/)?.[0] ?? "0");
    expect(revertedScore).toBe(initialScore);

    fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    fireEvent.click(screen.getByTestId("revert-all-btn"));
    expect(screen.getByTestId("scroll-pacing-status").textContent).toContain("복구");
  });

  it("컷 선택 버튼·여백 슬라이더·긴장도 슬라이더·샷 스케일 버튼 조작이 즉시 반영된다", () => {
    render(<StudioScrollPacingComposerPanel />);
    fireEvent.click(screen.getByTestId("cut-select-btn-4"));
    expect(screen.getByTestId("selected-cut-heading").textContent).toContain("#4컷");

    fireEvent.change(screen.getByTestId("cut-gutter-slider"), { target: { value: "360" } });
    expect(screen.getByTestId("selected-cut-gutter-value").textContent).toBe("360px");

    fireEvent.change(screen.getByTestId("cut-tension-slider"), { target: { value: "88" } });
    expect(screen.getByTestId("selected-cut-tension-value").textContent).toBe("88 / 100");

    fireEvent.click(screen.getByTestId("shot-scale-btn-extreme-close-up"));
    expect(screen.getByTestId("shot-scale-btn-extreme-close-up").getAttribute("aria-pressed")).toBe("true");
  });

  it("Markdown 및 JSON 복사는 ACK 뒤 콜백을 호출하고 시트 미리보기를 유지한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const onExportJson = vi.fn();
    render(<StudioScrollPacingComposerPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("pacing-export-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-markdown-btn"));
    expect(screen.getByTestId("pacing-export-preview").getAttribute("data-format")).toBe("markdown");
    expect(screen.getByTestId("pacing-export-preview").textContent).toContain("# 세로 스크롤 감정 곡선");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByTestId("export-json-btn") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("export-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledWith(
      expect.stringContaining("toonstudio.scroll-pacing-tension-composer.v1"),
      expect.any(Object),
      expect.any(Object),
    ));
    expect(write).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pacing-export-preview").getAttribute("data-format")).toBe("json");

    fireEvent.click(screen.getByTestId("toggle-export-preview-btn"));
    expect(screen.queryByTestId("pacing-export-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')과 초기 프리셋(initialPresetId='thriller-twist')을 일관되게 렌더링한다", () => {
    render(<StudioScrollPacingComposerPanel locale="en" initialPresetId="thriller-twist" />);
    expect(screen.getByTestId("scroll-tension-curve-svg").getAttribute("data-preset-id")).toBe("thriller-twist");
    expect(screen.getByTestId("pacing-mode-badge").textContent).toContain("Non-Destructive");
    expect(screen.getByTestId("scroll-tension-curve-svg").textContent).toContain("TENSION CURVE");
  });
});

describe("6. 엄격 품질 · 탈-바이올렛 OKLCH · 하네스 위생 계약 자가 검증", () => {
  it("9개 소유 파일이 모두 800줄 이하이고 금지 패턴(원시 색·transition-all·= {}·스토리지·private Map store·BigInt·Sparkles·번역투)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "scroll-pacing-composer-engine.ts",
      "StudioScrollPacingComposerPanel.tsx",
      "index.ts",
      "scroll-pacing-composer.test.tsx",
      "pacing-boundaries.test.tsx",
      "pacing-input-contract.ts",
      "pacing-report-export.ts",
      "use-pacing-notification.ts",
      "use-pacing-copy.ts",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const actualFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(actualFiles.sort()).toEqual([...required].sort());

    for (const file of actualFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "scroll-pacing-composer.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioScrollPacingComposerPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 SVG 및 스타일의 모든 oklch() 색상이 바이올렛 휴(270~320도)를 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioScrollPacingComposerPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널 내 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioScrollPacingComposerPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(25);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});
