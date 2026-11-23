// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { AutoQaLayoutSpecPanel } from "./AutoQaLayoutSpecPanel";
import {
  DEFAULT_BLOCKED_GATE_INPUT,
  DEFAULT_MULTILINGUAL_LETTERING_ENTRIES,
  auditMultilingualLetteringOverflow,
  buildClearedGateInput,
  evaluateZeroDefectPlatformGate,
  normalizeJapaneseVerticalPunctuation,
  type MultilingualLetteringEntry,
  type ZeroDefectPlatformGateInput,
} from "./i18n-lettering-and-platform-gate";
import {
  DEFAULT_MOBILE_QA_CUTS,
  DEFAULT_SMART_SLICE_DEMO,
  WEBTOON_PLATFORM_SPECS,
  WEBTOON_PLATFORM_SPEC_LIST,
  auditMobileReadabilityAndOcclusion,
  buildRemediatedMobileQaCuts,
  computeSmartSafeSlices,
  type MobileQaCut,
  type ProtectedBox,
  type WebtoonPlatformId,
} from "./smart-safe-slice-and-mobile-qa";

describe("auto-qa-layout-spec: 스마트 안전 분할·모바일 360px·다국어 식자·0-Defect 출고 게이트", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  it("4대 웹툰 플랫폼 규격 프리셋과 고정 분할 사고 검출 → 스마트 안전 분할 0건 스냅을 검증한다", () => {
    expect(WEBTOON_PLATFORM_SPECS.naver).toMatchObject({ widthPx: 690, maxSliceHeightPx: 20_000, maxFileSizeMb: 2 });
    expect(WEBTOON_PLATFORM_SPECS.kakao).toMatchObject({ widthPx: 720, maxSliceHeightPx: 16_000, maxFileSizeMb: 2 });
    expect(WEBTOON_PLATFORM_SPECS["webtoon-global"]).toMatchObject({ widthPx: 800, maxSliceHeightPx: 1_280, maxFileSizeMb: 2 });
    expect(WEBTOON_PLATFORM_SPECS.piccoma).toMatchObject({ widthPx: 720, maxSliceHeightPx: 10_000, maxFileSizeMb: 2 });

    const platformIds: readonly WebtoonPlatformId[] = WEBTOON_PLATFORM_SPEC_LIST.map((p) => p.id);
    for (const platformId of platformIds) {
      const result = computeSmartSafeSlices(
        DEFAULT_SMART_SLICE_DEMO.canvasHeight,
        platformId,
        DEFAULT_SMART_SLICE_DEMO.protectedBoxes,
      );
      expect(result.naiveAccidentCount, `${platformId} 고정 분할은 보호 영역 절단 사고를 검출해야 한다`).toBeGreaterThan(0);
      expect(result.safeAccidentCount, `${platformId} 스마트 안전 분할은 절단 사고 0건이어야 한다`).toBe(0);
      expect(result.preventedAccidentCount).toBe(result.naiveAccidentCount);
      expect(result.safeSliceYs.length).toBeGreaterThan(0);

      for (let i = 1; i < result.safeSliceYs.length; i += 1) {
        expect(result.safeSliceYs[i]).toBeGreaterThan(result.safeSliceYs[i - 1]);
      }
      for (const seg of result.segments) {
        expect(seg.withinPlatformMaxHeight).toBe(true);
        expect(seg.heightPx).toBeLessThanOrEqual(result.maxSliceHeightPx);
      }
    }

    // 말풍선·얼굴·SFX 3종 모두 고정 분할선(1280, 2560, 3840)을 가로지를 때 사고 검출 → 스마트 스냅 0건
    const targetedBoxes: readonly ProtectedBox[] = [
      { id: "b1", kind: "balloon", x: 60, y: 1_220, width: 240, height: 140 },
      { id: "f1", kind: "face", x: 200, y: 2_500, width: 180, height: 150 },
      { id: "s1", kind: "sfx", x: 100, y: 3_790, width: 300, height: 140 },
    ];
    const globalResult = computeSmartSafeSlices(5_000, "webtoon-global", targetedBoxes);
    expect(globalResult.naiveAccidentCount).toBe(3);
    expect(globalResult.naiveAccidents.map((a) => a.kind)).toEqual(["balloon", "face", "sfx"]);
    expect(globalResult.safeAccidentCount).toBe(0);

    // 엣지 케이스 방어: 짧은 캔버스 · 빈 보호 박스 · 0 높이
    expect(computeSmartSafeSlices(800, "naver", targetedBoxes).safeSliceYs).toEqual([]);
    expect(computeSmartSafeSlices(0, "naver", targetedBoxes).segments).toEqual([]);
    expect(computeSmartSafeSlices(-500, "kakao", []).safeAccidentCount).toBe(0);
  });

  it("모바일 360px/390px 축소 시 소형 폰트(<11px)·글벽(3+)·얼굴 가림(>12%) 경계값 및 해소를 검증한다", () => {
    const audit360 = auditMobileReadabilityAndOcclusion(DEFAULT_MOBILE_QA_CUTS, 360);
    expect(audit360.passed).toBe(false);
    expect(audit360.countsByCode["micro-font"]).toBe(1);
    expect(audit360.countsByCode["text-wall"]).toBe(1);
    expect(audit360.countsByCode["face-occlusion"]).toBe(2);

    // 360px vs 390px 경계값 테스트: 720px 원고 21px 폰트 → 360px에서 10.5px(경고), 390px에서 11.38px(통과)
    // 얼굴 100x100(면적 10,000)에 12x100(12% 정확) 겹침은 통과, 13x100(13%) 겹침은 경고
    const boundaryCut: readonly MobileQaCut[] = [
      {
        id: "cut-boundary",
        cutNumber: 1,
        canvasWidthPx: 720,
        canvasHeightPx: 1_800,
        balloons: [
          { id: "b-edge", x: 0, y: 100, width: 112, height: 100, fontSizePx: 21 },
          { id: "b-safe", x: 400, y: 1_500, width: 120, height: 100, fontSizePx: 24 },
        ],
        sfxBoxes: [
          { id: "sfx-over", x: 500, y: 200, width: 113, height: 100 },
        ],
        faceBoxes: [
          { id: "face-12pct", x: 100, y: 100, width: 100, height: 100 }, // 교차 12x100 = 12.0% -> 허용
          { id: "face-13pct", x: 600, y: 200, width: 100, height: 100 }, // 교차 13x100 = 13.0% -> 경고
        ],
      },
    ];

    const at360 = auditMobileReadabilityAndOcclusion(boundaryCut, 360);
    expect(at360.countsByCode["micro-font"]).toBe(1);
    expect(at360.countsByCode["text-wall"]).toBe(0);
    expect(at360.countsByCode["face-occlusion"]).toBe(1);

    const at390 = auditMobileReadabilityAndOcclusion(boundaryCut, 390);
    expect(at390.countsByCode["micro-font"]).toBe(0);
    expect(at390.countsByCode["face-occlusion"]).toBe(1);

    // 자동 보정 컷 적용 시 0건 통과
    const fixedCuts = buildRemediatedMobileQaCuts(DEFAULT_MOBILE_QA_CUTS, 360);
    const fixedAudit = auditMobileReadabilityAndOcclusion(fixedCuts, 360);
    expect(fixedAudit.passed).toBe(true);
    expect(fixedAudit.issues).toHaveLength(0);
  });

  it("다국어(EN/JA/ID/ES/TH) 오버플로우·일본어 세로쓰기 구두점(「」…—)·SFX 배경 복원 누락을 검증한다", () => {
    const demoAudit = auditMultilingualLetteringOverflow(DEFAULT_MULTILINGUAL_LETTERING_ENTRIES);
    expect(demoAudit.passed).toBe(false);
    expect(demoAudit.countsByCode.overflow).toBeGreaterThanOrEqual(2); // EN, ID 팽창 오버플로우
    expect(demoAudit.countsByCode["vertical-punct"]).toBe(1); // JA ASCII 따옴표/점/대시
    expect(demoAudit.countsByCode["sfx-inpaint-missing"]).toBe(1); // TH SFX inpaintReady=false
    expect(demoAudit.countsByLang.ES).toBe(0); // ES 정상 항목

    // 일본어 세로쓰기: 단독 … / 단독 — / vert 미적용 검출 및 표준 교정 후 통과 검증
    const jaCases: readonly MultilingualLetteringEntry[] = [
      {
        id: "ja-odd",
        cutNumber: 2,
        kind: "balloon",
        sourceKo: "잠깐… 정말—?",
        targetLang: "JA",
        translatedText: "「待って…本当—？」",
        balloonWidthPx: 180,
        balloonHeightPx: 260,
        fontSizePx: 20,
        isVertical: true,
      },
      {
        id: "ja-unrotated",
        cutNumber: 3,
        kind: "balloon",
        sourceKo: "알았어……",
        targetLang: "JA",
        translatedText: "「わかった……！」",
        balloonWidthPx: 180,
        balloonHeightPx: 260,
        fontSizePx: 20,
        isVertical: true,
        verticalGlyphRotationApplied: false,
      },
      {
        id: "ja-clean",
        cutNumber: 4,
        kind: "balloon",
        sourceKo: "잠깐…… 정말——?",
        targetLang: "JA",
        translatedText: "「待って……本当——？」",
        balloonWidthPx: 180,
        balloonHeightPx: 260,
        fontSizePx: 20,
        isVertical: true,
        verticalGlyphRotationApplied: true,
      },
    ];

    const jaAudit = auditMultilingualLetteringOverflow(jaCases);
    expect(jaAudit.countsByCode["vertical-punct"]).toBe(2);
    expect(jaAudit.issues.map((i) => i.entryId)).toEqual(["ja-odd", "ja-unrotated"]);

    // 정규화 함수 적용 후 JA 구두점 오류 0건
    const normalizedText = normalizeJapaneseVerticalPunctuation("\"待って...本当—？\"");
    expect(normalizedText).toBe("「待って……本当——？」");
    const afterFix = auditMultilingualLetteringOverflow([
      { ...jaCases[0], translatedText: normalizedText, verticalGlyphRotationApplied: true },
      { id: "sfx-ok", cutNumber: 5, kind: "sfx", sourceKo: "쾅!", targetLang: "TH", translatedText: "ตูม!", balloonWidthPx: 220, balloonHeightPx: 120, fontSizePx: 20, inpaintReady: true },
    ]);
    expect(afterFix.passed).toBe(true);
    expect(afterFix.issues).toHaveLength(0);
  });

  it("0-Defect 플랫폼 출고 게이트의 차단 → 부분 해소 → 완전 승인(100점) 전이를 검증한다", () => {
    const hostileInput: ZeroDefectPlatformGateInput = {
      ...DEFAULT_BLOCKED_GATE_INPUT,
      textSamples: ["오늘 스타벅스 앞에서 만날래?", "컷 수정 TODO"],
    };

    const blocked = evaluateZeroDefectPlatformGate(hostileInput);
    expect(blocked.readyToShip).toBe(false);
    expect(blocked.score).toBe(0);
    expect(blocked.blockingFailureCount).toBe(7);
    expect(blocked.unauthorizedAssets).toHaveLength(1);
    expect(blocked.matchedRestrictedKeywords).toEqual(expect.arrayContaining(["스타벅스", "TODO"]));

    // 부분 해소: 규격·용량·sRGB만 맞추면 점수는 상승하지만 아직 잠금 상태
    const partial = evaluateZeroDefectPlatformGate({
      ...hostileInput,
      exportWidthPx: 690,
      maxSliceFileSizeMb: 1.5,
      colorSpace: "sRGB",
    });
    expect(partial.readyToShip).toBe(false);
    expect(partial.score).toBe(40);
    expect(partial.blockingFailureCount).toBe(4);

    // 전 항목 해소: 4개 플랫폼 모두 100점 출고 승인
    for (const spec of WEBTOON_PLATFORM_SPEC_LIST) {
      const cleared = evaluateZeroDefectPlatformGate(buildClearedGateInput(spec.id));
      expect(cleared.readyToShip).toBe(true);
      expect(cleared.score).toBe(100);
      expect(cleared.blockingFailureCount).toBe(0);
    }

    // 비치명 경고는 점수를 소폭 감점하되 치명 차단 사유가 없으면 출고 승인은 유지
    const withMinorWarning = evaluateZeroDefectPlatformGate({
      ...buildClearedGateInput("kakao"),
      warningCount: 2,
    });
    expect(withMinorWarning.readyToShip).toBe(true);
    expect(withMinorWarning.score).toBe(96);
  });

  it("AutoQaLayoutSpecPanel 3개 서브탭 상호작용, EN 모드 및 원시 색상/transition-all 0건을 검증한다", () => {
    const { container, unmount } = render(<AutoQaLayoutSpecPanel />);

    // 1번 탭: 플랫폼 전환 + 고정 절단 사고 > 0 vs 스마트 안전 분할 0건 + 모바일 가독성 보정
    expect(screen.getByTestId("tab-slice-mobile").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("naive-accident-count").textContent).toContain("2건");
    expect(screen.getByTestId("safe-accident-count").textContent).toContain("0건");

    fireEvent.click(screen.getByTestId("platform-btn-webtoon-global"));
    expect(screen.getByTestId("platform-btn-webtoon-global").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("safe-accident-count").textContent).toContain("0건");

    fireEvent.click(screen.getByTestId("viewport-btn-390"));
    expect(screen.getByTestId("viewport-btn-390").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("mobile-fix-btn"));
    expect(screen.getByTestId("mobile-audit-pass")).toBeTruthy();

    // 2번 탭: 다국어 번역 식자 감사 (필터 + 일괄 보정)
    fireEvent.click(screen.getByTestId("tab-i18n-lettering"));
    expect(screen.getByTestId("lettering-count-overflow").textContent).toContain("2");
    expect(screen.getByTestId("lettering-count-vertical-punct").textContent).toContain("1");
    expect(screen.getByTestId("lettering-count-sfx-inpaint-missing").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("lang-filter-JA"));
    expect(screen.getByTestId("lettering-issues-list").textContent).toContain("JA");

    fireEvent.click(screen.getByTestId("lang-filter-ALL"));
    fireEvent.click(screen.getByTestId("lettering-fix-all-btn"));
    expect(screen.getByTestId("lettering-audit-pass")).toBeTruthy();

    // 3번 탭: 0-Defect 출고 게이트 (차단 → 부분 보정 → 전 항목 해소 잠금 해제)
    fireEvent.click(screen.getByTestId("tab-zero-defect-gate"));
    expect(screen.getByTestId("gate-status-badge").textContent).toContain("출고 잠금");
    fireEvent.click(screen.getByTestId("gate-fix-spec-btn"));
    expect(screen.getByTestId("gate-score").textContent).toContain("40");
    fireEvent.click(screen.getByTestId("gate-clear-all-btn"));
    expect(screen.getByTestId("gate-status-badge").textContent).toContain("0-Defect 출고 승인");
    expect(screen.getByTestId("gate-score").textContent).toContain("100");

    // 렌더링 DOM 원시 색상 및 transition-all 0건 검증
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
    expect(rawColorRegex.test(container.innerHTML)).toBe(false);
    expect(container.innerHTML.includes("transition-all")).toBe(false);

    unmount();

    // EN 모드 3개 탭 전체 한글 0자 + 원시 색상 0건 검증
    useI18n.setState({ lang: "en" });
    const enRender = render(<AutoQaLayoutSpecPanel />);
    const hangulRegex = /[가-힣]/;

    expect(screen.getByText("Zero-Rejection Layout, i18n & Release Gate")).toBeTruthy();
    expect(hangulRegex.test(enRender.container.textContent ?? "")).toBe(false);
    expect(rawColorRegex.test(enRender.container.innerHTML)).toBe(false);

    fireEvent.click(screen.getByTestId("tab-i18n-lettering"));
    expect(screen.getByTestId("lettering-count-overflow").textContent).toContain("Balloon Overflow");
    expect(hangulRegex.test(enRender.container.textContent ?? "")).toBe(false);

    fireEvent.click(screen.getByTestId("tab-zero-defect-gate"));
    expect(screen.getByTestId("gate-status-badge").textContent).toContain("Release Locked");
    expect(hangulRegex.test(enRender.container.textContent ?? "")).toBe(false);

    // 소스 파일 자체 원시 hex/rgb/hsl 및 transition-all 0건 + 500줄 이내 정적 검증
    const panelSource = readFileSync(
      resolve(process.cwd(), "apps/web/src/domains/creator/auto-qa-layout-spec/AutoQaLayoutSpecPanel.tsx"),
      "utf8",
    );
    expect(rawColorRegex.test(panelSource)).toBe(false);
    expect(panelSource.includes("transition-all")).toBe(false);
    expect(panelSource.split("\n").length).toBeLessThanOrEqual(500);
  });
});
