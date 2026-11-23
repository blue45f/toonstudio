// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { AutoQaContinuityPanel } from "./AutoQaContinuityPanel";
import {
  DEFAULT_DIALOGUE_LINES,
  DEFAULT_PRODUCTION_BIBLE_RULES,
  applyBatchBibleTermFixes,
  auditDialogueAgainstBible,
  classifyKoreanSentenceRegister,
  type DialogueLineInput,
  type ProductionBibleQaRules,
} from "./bible-term-register-checker";
import {
  DEFAULT_SCENE_COLOR_BASELINE,
  DEFAULT_SCENE_CUT_SAMPLES,
  auditSceneColorScriptConsistency,
  circularHueDiffDegrees,
  computeOklchDistanceBreakdown,
  formatOklchCss,
  oklchDeltaE,
  restoreAllDriftedSlotsToBaseline,
  restoreCutSlotToBaseline,
  type CutSlotColorSample,
  type OklchColor,
} from "./color-script-diff-engine";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("color-script-diff-engine: OKLCH ΔE 계산·채색 이탈 감사·기준색 복원", () => {
  it("동일 색상은 ΔE=0이고, 0°/360° 경계 원형 색조 각도차와 무채색 안정성을 정확히 계산한다", () => {
    const crimson: OklchColor = { l: 0.54, c: 0.21, h: 26 };
    expect(oklchDeltaE(crimson, crimson)).toBe(0);

    // 355° ↔ 5° 원형 최단 각도는 350°가 아니라 10°
    expect(circularHueDiffDegrees(355, 5)).toBe(10);
    expect(circularHueDiffDegrees(5, 355)).toBe(10);
    expect(circularHueDiffDegrees(20, 200)).toBe(180);

    const wrapA: OklchColor = { l: 0.6, c: 0.18, h: 355 };
    const wrapB: OklchColor = { l: 0.6, c: 0.18, h: 5 };
    const plainA: OklchColor = { l: 0.6, c: 0.18, h: 10 };
    const plainB: OklchColor = { l: 0.6, c: 0.18, h: 20 };
    expect(oklchDeltaE(wrapA, wrapB)).toBeCloseTo(oklchDeltaE(plainA, plainB), 4);

    // 무채색(C=0)에서는 hue 회전만으로 ΔE가 증가하지 않아야 한다
    const grayA: OklchColor = { l: 0.5, c: 0, h: 10 };
    const grayB: OklchColor = { l: 0.5, c: 0, h: 220 };
    expect(oklchDeltaE(grayA, grayB)).toBe(0);

    // 빨간 넥타이 → 파란 넥타이 대폭 이탈의 ΔE = sqrt(ΔL² + ΔC² + ΔH²) 일치 검증
    const blueTie: OklchColor = { l: 0.51, c: 0.185, h: 256 };
    const breakdown = computeOklchDistanceBreakdown(crimson, blueTie);
    const recomputed = Math.sqrt(
      breakdown.deltaL ** 2 + breakdown.deltaC ** 2 + breakdown.deltaH ** 2,
    );
    expect(breakdown.deltaE).toBeCloseTo(recomputed, 3);
    expect(breakdown.hueDiffDeg).toBe(130);
    expect(breakdown.deltaE).toBeGreaterThan(0.3);
    expect(formatOklchCss(crimson)).toBe("oklch(0.54 0.21 26)");
  });

  it("조명 예외(lightingOverride) 컷은 면제하고, 예외 없는 3컷 빨간 넥타이→4컷 파란 넥타이 이탈을 적발한다", () => {
    const report = auditSceneColorScriptConsistency(
      DEFAULT_SCENE_COLOR_BASELINE,
      DEFAULT_SCENE_CUT_SAMPLES,
    );

    expect(report.totalSamples).toBe(DEFAULT_SCENE_CUT_SAMPLES.length);
    expect(report.matchedCount).toBe(3);
    expect(report.lightingExemptCount).toBe(1);
    expect(report.driftCount).toBe(3);
    expect(report.criticalCount).toBe(3);

    // 마력 각성 황금빛 눈동자(lightingOverride 있음)는 예외 승인되어 finding에 포함되지 않는다
    const magicEntry = report.entries.find((e) => e.sampleId === "cut-03-chaerin-eyes-magic");
    expect(magicEntry?.status).toBe("lighting-exempt");
    expect(report.findings.some((f) => f.sampleId === "cut-03-chaerin-eyes-magic")).toBe(false);

    // 4컷 파란 넥타이는 color-drift 경고로 적발
    const tieDrift = report.findings.find((f) => f.sampleId === "cut-04-jinwoo-tie-drift");
    expect(tieDrift).toBeDefined();
    expect(tieDrift?.code).toBe("color-drift");
    expect(tieDrift?.severity).toBe("critical");
    expect(tieDrift?.cutNumber).toBe(4);
    expect(tieDrift?.slot).toBe("accessory");
    expect(tieDrift?.deltaE).toBeGreaterThan(tieDrift?.threshold ?? 0);
  });

  it("1클릭 restoreCutSlotToBaseline 및 일괄 복원은 원본 불변성과 조명 예외 컷 보존을 지킨다", () => {
    const originalCopy = structuredClone(DEFAULT_SCENE_CUT_SAMPLES);

    // 단건 복원 (sampleId 기준)
    const afterSingle = restoreCutSlotToBaseline(
      DEFAULT_SCENE_COLOR_BASELINE,
      DEFAULT_SCENE_CUT_SAMPLES,
      "cut-04-jinwoo-tie-drift",
    );
    expect(DEFAULT_SCENE_CUT_SAMPLES).toEqual(originalCopy);

    const singleReport = auditSceneColorScriptConsistency(DEFAULT_SCENE_COLOR_BASELINE, afterSingle);
    expect(singleReport.driftCount).toBe(2);
    const restoredTie = singleReport.entries.find((e) => e.sampleId === "cut-04-jinwoo-tie-drift");
    expect(restoredTie?.status).toBe("matched");
    expect(restoredTie?.breakdown?.deltaE).toBe(0);

    // 객체 키(cutNumber + characterId + slot) 기준 복원도 지원
    const afterTargetObj = restoreCutSlotToBaseline(DEFAULT_SCENE_COLOR_BASELINE, afterSingle, {
      cutNumber: 4,
      characterId: "chaerin",
      slot: "eyes",
    });
    expect(
      auditSceneColorScriptConsistency(DEFAULT_SCENE_COLOR_BASELINE, afterTargetObj).driftCount,
    ).toBe(1);

    // 일괄 복원: 모든 채색 이탈을 0건으로 만들되 lightingOverride 컷 색상은 그대로 유지
    const batch = restoreAllDriftedSlotsToBaseline(
      DEFAULT_SCENE_COLOR_BASELINE,
      DEFAULT_SCENE_CUT_SAMPLES,
    );
    expect(batch.restoredCount).toBe(3);
    const batchReport = auditSceneColorScriptConsistency(DEFAULT_SCENE_COLOR_BASELINE, batch.samples);
    expect(batchReport.driftCount).toBe(0);
    expect(batchReport.consistencyScore).toBe(100);
    expect(batchReport.lightingExemptCount).toBe(1);
    const magicSample = batch.samples.find((s) => s.sampleId === "cut-03-chaerin-eyes-magic");
    expect(magicSample?.sampledColor).toEqual({ l: 0.84, c: 0.19, h: 98 });
  });

  it("조명 예외에 allowedDeltaE 상한이 있으면 상한 초과 시 다시 color-drift로 적발한다", () => {
    const samples: readonly CutSlotColorSample[] = [
      {
        sampleId: "capped-override",
        cutNumber: 6,
        characterId: "jinwoo",
        slot: "accessory",
        sampledColor: { l: 0.51, c: 0.185, h: 256 },
        lightingOverride: {
          kind: "sunset",
          reasonKo: "노을 반사광 (소폭 허용)",
          reasonEn: "Sunset warm bounce (small cap)",
          allowedDeltaE: 0.18,
        },
      },
    ];
    const report = auditSceneColorScriptConsistency(DEFAULT_SCENE_COLOR_BASELINE, samples);
    expect(report.driftCount).toBe(1);
    expect(report.findings[0]?.code).toBe("color-drift");
  });
});

describe("bible-term-register-checker: 고유명사·호칭·화법 대조 및 1클릭 일괄 치환", () => {
  it("고유명사 오타·호칭 오류·반말/존댓말/하오체 위반을 정확한 문자 오프셋과 함께 탐지한다", () => {
    const report = auditDialogueAgainstBible(
      DEFAULT_DIALOGUE_LINES,
      DEFAULT_PRODUCTION_BIBLE_RULES,
    );

    expect(report.totalLines).toBe(5);
    expect(report.cleanLineCount).toBe(2);
    expect(report.termMismatchCount).toBe(4);
    expect(report.addressMismatchCount).toBe(3);
    expect(report.registerViolationCount).toBe(3);
    expect(report.autoFixableCount).toBe(7);

    // 1컷: 채린아(호칭), 알카디아(고유명사), 성검 에테르노(고유명사), 발견했어(반말 vs 존댓말)
    const cut1Findings = report.findings.filter((f) => f.lineId === "line-cut-01");
    expect(cut1Findings.map((f) => f.kind)).toEqual([
      "address-mismatch",
      "term-mismatch",
      "term-mismatch",
      "register-violation",
    ]);

    const line1Text = DEFAULT_DIALOGUE_LINES[0]?.text ?? "";
    for (const f of cut1Findings) {
      expect(line1Text.slice(f.startIndex, f.endIndex)).toBe(f.matchedText);
    }

    // 2컷: 유채린→서진우(반말 규칙)에 '보고하세요'(존댓말) 위반
    const cut2Reg = report.findings.find(
      (f) => f.lineId === "line-cut-02" && f.kind === "register-violation",
    );
    expect(cut2Reg?.expectedRegister).toBe("banmal");
    expect(cut2Reg?.detectedRegister).toBe("jondaetmal");
    expect(cut2Reg?.matchedText).toBe("보고하세요");

    // 5컷: 카엘 대공→서진우(하오체 규칙)에 '돼'(반말) 위반
    const cut5Reg = report.findings.find(
      (f) => f.lineId === "line-cut-05" && f.kind === "register-violation",
    );
    expect(cut5Reg?.expectedRegister).toBe("haoche");
    expect(cut5Reg?.detectedRegister).toBe("banmal");
  });

  it("정본 내부 부분문자열·1글자 금지호칭 경계('너' vs '너무')·단독 '네' 응답·복문 혼용을 정확히 처리한다", () => {
    const customRules: ProductionBibleQaRules = {
      bibleId: "edge-case-bible",
      titleKo: "경계 테스트 설정집",
      titleEn: "Edge-case Bible",
      terms: [
        {
          id: "t-arcadia",
          category: "place",
          canonTerm: "아르카디아",
          aliases: ["아르카디"],
        },
      ],
      pairRules: [
        {
          id: "p-polite",
          speaker: "민수",
          listener: "지연",
          expectedRegister: "jondaetmal",
          canonAddressTitle: "팀장님",
          forbiddenAddressTitles: ["너"],
        },
      ],
    };

    const lines: readonly DialogueLineInput[] = [
      // '아르카디아' 안의 '아르카디' 오탐 방지 + '너무' 안의 '너' 오탐 방지 + 단독 '네!' 반말 오탐 방지
      {
        id: "ok-line",
        cutNumber: 1,
        speaker: "민수",
        listener: "지연",
        text: "네! 팀장님, 아르카디아는 너무 넓어요.",
      },
      // 한 말풍선 내 존댓말 + 반말 혼용 및 실제 '너는' 호칭 오류 동시 탐지
      {
        id: "mixed-line",
        cutNumber: 2,
        speaker: "민수",
        listener: "지연",
        text: "너는 여기 있어요. 빨리 챙겨!",
      },
      // 의도된 말투 예외(registerExceptionReason) 부여 시 화법 위반 면제
      {
        id: "exempt-register-line",
        cutNumber: 3,
        speaker: "민수",
        listener: "지연",
        text: "팀장님, 지금 당장 도망쳐!",
        registerExceptionReason: "긴박한 혼잣말/위장 연출",
      },
    ];

    const report = auditDialogueAgainstBible(lines, customRules);
    expect(report.findings.filter((f) => f.lineId === "ok-line")).toHaveLength(0);

    const mixed = report.findings.filter((f) => f.lineId === "mixed-line");
    expect(mixed.map((f) => `${f.kind}:${f.matchedText}`)).toEqual([
      "address-mismatch:너",
      "register-violation:챙겨",
    ]);

    expect(report.findings.filter((f) => f.lineId === "exempt-register-line")).toHaveLength(0);

    // 한국어 종결어미 단위 분류 검증
    expect(classifyKoreanSentenceRegister("지금 갑니다.").register).toBe("jondaetmal");
    expect(classifyKoreanSentenceRegister("괜찮죠?").register).toBe("jondaetmal");
    expect(classifyKoreanSentenceRegister("정말이냐?").register).toBe("banmal");
    expect(classifyKoreanSentenceRegister("알았지?").register).toBe("banmal");
    expect(classifyKoreanSentenceRegister("내 뜻이 아니오.").register).toBe("haoche");
    expect(classifyKoreanSentenceRegister("네!").register).toBeNull();
  });

  it("applyBatchBibleTermFixes로 고유명사·호칭 오류를 1클릭 일괄 치환하고 치환 이력을 반환한다", () => {
    const before = auditDialogueAgainstBible(
      DEFAULT_DIALOGUE_LINES,
      DEFAULT_PRODUCTION_BIBLE_RULES,
    );
    const fixed = applyBatchBibleTermFixes(DEFAULT_DIALOGUE_LINES, before.findings);

    expect(fixed.appliedCount).toBe(7);
    expect(fixed.touchedLineCount).toBe(3);
    expect(fixed.skippedCount).toBe(3); // register-violation 3건은 대사 훼손 없이 유지
    expect(fixed.appliedFixes.map((item) => `${item.before}→${item.after}`)).toEqual([
      "채린아→선배님",
      "알카디아→아르카디아",
      "성검 에테르노→성검 에테르나",
      "진우 님→진우야",
      "창월 기사단→청월 기사단",
      "자네→그대",
      "마도서 크로니컬→마도서 크로니클",
    ]);

    expect(fixed.lines[0]?.text).toBe(
      "선배님, 아르카디아 중앙 광장에서 성검 에테르나를 발견했어!",
    );
    expect(fixed.lines[1]?.text).toBe("진우야, 청월 기사단 쪽에 먼저 보고하세요.");
    expect(fixed.lines[4]?.text).toBe("그대, 마도서 크로니클은 절대 넘기면 안 돼.");

    // 재감사 시 고유명사·호칭 오류는 0건, 말투 위반 3건만 남는다
    const after = auditDialogueAgainstBible(fixed.lines, DEFAULT_PRODUCTION_BIBLE_RULES);
    expect(after.termMismatchCount).toBe(0);
    expect(after.addressMismatchCount).toBe(0);
    expect(after.autoFixableCount).toBe(0);
    expect(after.registerViolationCount).toBe(3);
  });
});

describe("AutoQaContinuityPanel: 2개 서브탭·실시간 탐지·1클릭 복원/치환·KO/EN·토큰 위생", () => {
  it("props 없이 기본 마운트되어 탭 1에서 채색 이탈 복원·조명 예외 토글·전체 복원이 동작한다", () => {
    const onCutChange = vi.fn();
    render(<AutoQaContinuityPanel onCutSamplesChange={onCutChange} />);

    expect(screen.getByTestId("auto-qa-continuity-panel")).toBeTruthy();
    expect(screen.getByTestId("panel-color-script")).toBeTruthy();
    expect(screen.getByTestId("color-drift-count").textContent).toBe("3");

    // 단건 1클릭 기준색 복원
    fireEvent.click(screen.getByTestId("restore-slot-cut-04-jinwoo-tie-drift"));
    expect(screen.getByTestId("color-drift-count").textContent).toBe("2");
    expect(screen.getByTestId("color-entry-cut-04-jinwoo-tie-drift").getAttribute("data-status")).toBe("matched");
    expect(onCutChange).toHaveBeenCalledTimes(1);

    // 조명 예외 처리 토글
    fireEvent.click(screen.getByTestId("exempt-slot-cut-04-chaerin-eyes-drift"));
    expect(screen.getByTestId("color-drift-count").textContent).toBe("1");
    expect(screen.getByTestId("color-entry-cut-04-chaerin-eyes-drift").getAttribute("data-status")).toBe("lighting-exempt");

    // 잔여 이탈 전체 1클릭 복원
    fireEvent.click(screen.getByTestId("restore-all-drifts-btn"));
    expect(screen.getByTestId("color-drift-count").textContent).toBe("0");
    expect(screen.getByTestId("color-consistency-score").textContent).toBe("100%");
  });

  it("탭 2에서 실시간 대사 밑줄 오류 탐지와 1클릭 일괄 정본 치환이 동작한다", () => {
    const onLinesChange = vi.fn();
    render(<AutoQaContinuityPanel onDialogueLinesChange={onLinesChange} />);

    fireEvent.click(screen.getByTestId("tab-bible-qa"));
    expect(screen.getByTestId("panel-bible-qa")).toBeTruthy();
    expect(screen.getByTestId("bible-term-count").textContent).toBe("4");
    expect(screen.getByTestId("bible-address-count").textContent).toBe("3");
    expect(screen.getByTestId("bible-register-count").textContent).toBe("3");

    // 1컷 프리뷰에 실시간 밑줄 마크가 4개 표시된다
    const preview1 = screen.getByTestId("dialogue-preview-line-cut-01");
    const marksBefore = preview1.querySelectorAll("mark[data-finding-kind]");
    expect(marksBefore).toHaveLength(4);

    // 정상 대사(3컷)에 오타를 직접 입력하면 실시간으로 오류 카운트가 올라간다
    const input3 = screen.getByTestId("dialogue-input-line-cut-03");
    fireEvent.change(input3, {
      target: { value: "선배님, 알카디아 기록실에서 마도서 크로니클을 확인했습니다." },
    });
    expect(screen.getByTestId("bible-term-count").textContent).toBe("5");
    expect(
      within(screen.getByTestId("dialogue-preview-line-cut-03")).getByText("알카디아"),
    ).toBeTruthy();

    // 1클릭 일괄 치환 실행 -> 고유명사/호칭 오류 0건 + 치환 이력 상태 표시
    fireEvent.click(screen.getByTestId("batch-bible-fix-btn"));
    expect(screen.getByTestId("bible-term-count").textContent).toBe("0");
    expect(screen.getByTestId("bible-address-count").textContent).toBe("0");
    expect(screen.getByTestId("bible-register-count").textContent).toBe("3");
    expect(screen.getByTestId("bible-fix-status").textContent).toContain("치환");
    expect(onLinesChange).toHaveBeenCalled();
  });

  it("영어 로케일(en) 전환 시 영어 라벨과 버튼이 정상 출력된다", () => {
    useI18n.setState({ lang: "en" });
    render(<AutoQaContinuityPanel />);

    expect(screen.getByTestId("tab-color-script").textContent).toContain("Color Script Diff Audit");
    expect(screen.getByTestId("tab-bible-qa").textContent).toContain("Bible Term & Register Audit");

    fireEvent.click(screen.getByTestId("tab-bible-qa"));
    expect(screen.getByTestId("batch-bible-fix-btn").textContent).toContain("Batch Replace");
  });

  it("AutoQaContinuityPanel.tsx 소스에 원시 hex/rgb/hsl·transition-all이 0건이고 500줄 이하를 준수한다", () => {
    const panelPath = path.resolve(
      process.cwd(),
      "apps/web/src/domains/creator/auto-qa-continuity/AutoQaContinuityPanel.tsx",
    );
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
  });
});
