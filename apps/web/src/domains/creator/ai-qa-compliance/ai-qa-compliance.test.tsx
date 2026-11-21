// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioAiQaCompliancePanel } from "./StudioAiQaCompliancePanel";
import {
  SAMPLE_COMPLIANCE_CUTS,
  SAMPLE_CONTINUITY_CUTS,
  SAMPLE_DIALOGUE_BALLOONS,
  SAMPLE_SPEECH_CONTRACTS,
  applyComplianceRemediationPatch,
  auditEyeLineAndPropContinuity,
  auditKoreanGrammarAndSpeechRegister,
  detectKoreanSpeechRegister,
  scanRegionalComplianceAndBrands,
  type ComplianceCutInput,
  type ContinuityCutInput,
} from "./webtoon-ai-qa-continuity-engine";
import {
  SAMPLE_EPISODE_ASSET_USAGES,
  SAMPLE_MULTILINGUAL_BALLOONS,
  applyPixelArtifactCleanup,
  auditMultilingualBalloonOverflow,
  createSampleWebtoonPixelGrid,
  parseVoiceQaFeedbackToPin,
  replaceBlockedAssetWithSafeAlternative,
  scanPixelArtifactsAndCleanup,
  transitionVoicePinApproval,
  verifyCommercialRightsGate,
} from "./webtoon-pixel-license-voice-qa-engine";

import { useI18n } from "@/shared/lib/i18n";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("1. 국가별(KR/JP/SEA/US)·연령등급 심의 & 실제 상표권 로고 자동 스캐너", () => {
  it("01. KR 12세 이용가에서 흡연·실제 상표권 로고(스타벅스·GS25·참이슬)를 차단 탐지하고 패러디 대체안을 제시한다", () => {
    const report = scanRegionalComplianceAndBrands({
      region: "KR",
      targetRating: "12+",
      cuts: SAMPLE_COMPLIANCE_CUTS,
    });
    expect(report.verdict).toBe("BLOCKED");
    expect(report.trademarkCount).toBeGreaterThanOrEqual(3);
    expect(report.findings.some((f) => f.category === "smoking" && f.severity === "block")).toBe(true);
    const starbucks = report.findings.find((f) => f.matchedToken === "스타벅스");
    expect(starbucks?.remediationType).toBe("brand-parody-replace");
    expect(starbucks?.suggestedReplacementText).toContain("별빛카페");
  });

  it("02. JP(픽코마) 심의에서 19세 고수위 노출에 백광(screen) 모자이크 가림 레이어를 제안한다", () => {
    const jpCuts: readonly ComplianceCutInput[] = [
      {
        cutId: "jp-c1",
        cutNumber: 2,
        sceneSummary: "욕실 전신 노출 장면",
        dialogueText: "잠깐만요.",
        visualTags: ["전신 노출"],
        detectedTextInArt: [],
      },
    ];
    const report = scanRegionalComplianceAndBrands({ region: "JP", targetRating: "19+", cuts: jpCuts });
    const exp = report.findings.find((f) => f.category === "exposure");
    expect(exp).toBeTruthy();
    expect(exp?.overlayLayerSpec.blendMode).toBe("screen");
    expect(exp?.remediationLabelKo).toContain("픽코마");
  });

  it("03. SEA(동남아) 심의는 한국 15세에서 허용되는 음주·부분 노출을 보수적으로 BLOCKED 판정한다", () => {
    const cuts: readonly ComplianceCutInput[] = [
      {
        cutId: "sea-c1",
        cutNumber: 5,
        sceneSummary: "해변에서 맥주캔과 수영복 클로즈업",
        dialogueText: "시원하다.",
        visualTags: ["맥주캔", "수영복 클로즈업"],
        detectedTextInArt: [],
      },
    ];
    const kr15 = scanRegionalComplianceAndBrands({ region: "KR", targetRating: "15+", cuts });
    const sea15 = scanRegionalComplianceAndBrands({ region: "SEA", targetRating: "15+", cuts });
    expect(kr15.blockingCount).toBe(0);
    expect(sea15.verdict).toBe("BLOCKED");
    expect(sea15.blockingCount).toBeGreaterThanOrEqual(2);
  });

  it("04. US(WEBTOON Global) 심의는 자해 묘사를 등급 무관 차단하고 트리거 경고 카드 조치를 제시한다", () => {
    const cuts: readonly ComplianceCutInput[] = [
      {
        cutId: "us-c1",
        cutNumber: 18,
        sceneSummary: "어두운 방 자해 암시 연출",
        dialogueText: "더는 못 버티겠어.",
        visualTags: ["자해"],
        detectedTextInArt: ["Nike"],
      },
    ];
    const report = scanRegionalComplianceAndBrands({ region: "US", targetRating: "19+", cuts });
    expect(report.verdict).toBe("BLOCKED");
    const selfHarm = report.findings.find((f) => f.category === "self-harm");
    expect(selfHarm?.remediationType).toBe("trigger-warning-card");
    expect(report.findings.some((f) => f.category === "trademark-brand")).toBe(true);
  });

  it("05. 1클릭 모자이크·상표 대체 레이어를 일괄 적용하면 잔여 차단 0건 및 PASS로 전이된다", () => {
    const report = scanRegionalComplianceAndBrands({
      region: "KR",
      targetRating: "12+",
      cuts: SAMPLE_COMPLIANCE_CUTS,
    });
    const patched = applyComplianceRemediationPatch(
      report,
      report.findings.map((f) => f.id),
    );
    expect(patched.remainingBlockingCount).toBe(0);
    expect(patched.remainingWarningCount).toBe(0);
    expect(patched.updatedVerdict).toBe("PASS");
    expect(patched.generatedLayers).toHaveLength(report.findings.length);
  });
});

describe("2. 한국어 맞춤법 + 캐릭터 말투(존댓말/반말) 일관성 교정기", () => {
  it("06. 대표 한국어 맞춤법(몇일/되요/갈께/어의없) 및 띄어쓰기(할수없) 오류를 정확히 검출·교정한다", () => {
    const report = auditKoreanGrammarAndSpeechRegister(SAMPLE_SPEECH_CONTRACTS, SAMPLE_DIALOGUE_BALLOONS);
    expect(report.spellingIssues.length).toBeGreaterThanOrEqual(5);
    expect(report.correctedTextByBalloonId["b-01"]).toContain("며칠");
    expect(report.correctedTextByBalloonId["b-01"]).toContain("돼요");
    expect(report.correctedTextByBalloonId["b-03"]).toContain("어이없");
    expect(report.correctedTextByBalloonId["b-03"]).toContain("할 수 없");
  });

  it("07. 존댓말 계약(부하→상사)에 반말이 섞이면 위반으로 검출하고 자연스러운 존댓말로 교정한다", () => {
    const report = auditKoreanGrammarAndSpeechRegister(SAMPLE_SPEECH_CONTRACTS, SAMPLE_DIALOGUE_BALLOONS);
    const violation = report.registerViolations.find((v) => v.balloonId === "b-02");
    expect(violation).toBeTruthy();
    expect(violation?.expectedRegister).toBe("honorific");
    expect(violation?.detectedRegister).toBe("casual");
    expect(report.correctedTextByBalloonId["b-02"]).toBe("알았어, 지금 바로 갈게요!");
  });

  it("08. 반말 계약(소꿉친구)에 존댓말이 섞이면 위반으로 검출하고 반말로 교정한다", () => {
    const report = auditKoreanGrammarAndSpeechRegister(SAMPLE_SPEECH_CONTRACTS, SAMPLE_DIALOGUE_BALLOONS);
    const violation = report.registerViolations.find((v) => v.balloonId === "b-03");
    expect(violation).toBeTruthy();
    expect(violation?.expectedRegister).toBe("casual");
    expect(violation?.detectedRegister).toBe("honorific");
    expect(report.correctedTextByBalloonId["b-03"]).toMatch(/가\.$/u);
  });

  it("09. 독백(isMonologue)과 짧은 중립 감탄사는 말투 위반 오탐에서 제외된다", () => {
    expect(detectKoreanSpeechRegister("앗!")).toBe("neutral");
    expect(detectKoreanSpeechRegister("잠깐…")).toBe("neutral");
    const report = auditKoreanGrammarAndSpeechRegister(SAMPLE_SPEECH_CONTRACTS, [
      { balloonId: "mono-1", cutNumber: 1, speakerId: "char-seoyeon", listenerId: "char-chief", text: "큰일 났네.", isMonologue: true },
      { balloonId: "excl-1", cutNumber: 2, speakerId: "char-seoyeon", listenerId: "char-chief", text: "앗!" },
    ]);
    expect(report.registerViolations).toHaveLength(0);
    expect(report.consistencyScore).toBe(100);
  });
});

describe("3. 180도 시선 법칙 & 소품·좌우 연속성 검사기", () => {
  it("10. 대화 리버스샷에서 180도 시선 축 위반(같은 방향 응시)과 소품 오른손→왼손 급변을 탐지한다", () => {
    const report = auditEyeLineAndPropContinuity(SAMPLE_CONTINUITY_CUTS);
    expect(report.verdict).toBe("BLOCKED");
    expect(report.eyelineIssues.some((e) => e.cutNumber === 11 && e.kind === "AXIS_180_VIOLATION")).toBe(true);
    expect(
      report.propIssues.some(
        (p) => p.cutNumber === 12 && p.previousHand === "right" && p.currentHand === "left",
      ),
    ).toBe(true);
  });

  it("11. 같은 컷 투샷에서 두 인물이 서로 등을 지거나 같은 방향을 보면 투샷 시선 불일치를 경고한다", () => {
    const cuts: readonly ContinuityCutInput[] = [
      {
        cutId: "two-1",
        cutNumber: 1,
        sceneId: "sc-cafe",
        characters: [
          { characterId: "a", characterName: "지훈", screenXNorm: 0.2, gazeDirection: "left", talkingToCharacterId: "b" },
          { characterId: "b", characterName: "유진", screenXNorm: 0.8, gazeDirection: "left", talkingToCharacterId: "a" },
        ],
      },
    ];
    const report = auditEyeLineAndPropContinuity(cuts);
    expect(report.eyelineIssues).toHaveLength(1);
    expect(report.eyelineIssues[0]?.kind).toBe("EYELINE_MISALIGNED_SAME_CUT");
  });

  it("12. 투샷 간 좌우 인물 배치가 180도 넘어가 반전되면 AXIS_180_VIOLATION으로 차단한다", () => {
    const cuts: readonly ContinuityCutInput[] = [
      {
        cutId: "c1",
        cutNumber: 1,
        sceneId: "sc-hall",
        characters: [
          { characterId: "a", characterName: "서연", screenXNorm: 0.2, gazeDirection: "right", talkingToCharacterId: "b" },
          { characterId: "b", characterName: "도윤", screenXNorm: 0.8, gazeDirection: "left", talkingToCharacterId: "a" },
        ],
      },
      {
        cutId: "c2",
        cutNumber: 2,
        sceneId: "sc-hall",
        characters: [
          { characterId: "b", characterName: "도윤", screenXNorm: 0.2, gazeDirection: "right", talkingToCharacterId: "a" },
          { characterId: "a", characterName: "서연", screenXNorm: 0.8, gazeDirection: "left", talkingToCharacterId: "b" },
        ],
      },
    ];
    const report = auditEyeLineAndPropContinuity(cuts);
    expect(report.eyelineIssues.some((i) => i.kind === "AXIS_180_VIOLATION" && i.cutNumber === 2)).toBe(true);
  });

  it("13. cameraAxisResetDeclared 또는 씬 변경·transferActionDeclared 명시 시 오탐 없이 PASS한다", () => {
    const cuts: readonly ContinuityCutInput[] = [
      {
        cutId: "ok-1",
        cutNumber: 1,
        sceneId: "sc-1",
        characters: [
          {
            characterId: "a",
            characterName: "서연",
            screenXNorm: 0.25,
            gazeDirection: "right",
            talkingToCharacterId: "b",
            props: [{ propId: "cup", propName: "머그컵", hand: "right" }],
          },
          { characterId: "b", characterName: "도윤", screenXNorm: 0.75, gazeDirection: "left", talkingToCharacterId: "a" },
        ],
      },
      {
        cutId: "ok-2",
        cutNumber: 2,
        sceneId: "sc-1",
        cameraAxisResetDeclared: true,
        characters: [
          {
            characterId: "b",
            characterName: "도윤",
            screenXNorm: 0.25,
            gazeDirection: "right",
            talkingToCharacterId: "a",
          },
          {
            characterId: "a",
            characterName: "서연",
            screenXNorm: 0.75,
            gazeDirection: "left",
            talkingToCharacterId: "b",
            props: [{ propId: "cup", propName: "머그컵", hand: "left", transferActionDeclared: true }],
          },
        ],
      },
    ];
    const report = auditEyeLineAndPropContinuity(cuts);
    expect(report.verdict).toBe("PASS");
    expect(report.eyelineIssues).toHaveLength(0);
    expect(report.propIssues).toHaveLength(0);
  });
});

describe("4. 채색 빈틈 · 선 밖 넘침 · 지우개 잔여물 픽셀 헌터", () => {
  it("14. 선화 마스크와 RGBA 격자에서 채색 빈틈·선 밖 넘침·고립 잔여물을 좌표 핀으로 정확히 분류한다", () => {
    const grid = createSampleWebtoonPixelGrid();
    const report = scanPixelArtifactsAndCleanup(grid);
    expect(report.verdict).toBe("NEEDS_CLEANUP");
    expect(report.unfilledGapCount).toBe(1);
    expect(report.colorBleedCount).toBe(1);
    expect(report.eraserDustCount).toBe(1);
    expect(report.totalAffectedPixels).toBe(9);
    const gap = report.artifacts.find((a) => a.kind === "unfilled-gap");
    expect(gap?.pinX).toBeGreaterThanOrEqual(8);
    expect(gap?.suggestedFillRgba).toEqual([232, 198, 174, 255]);
  });

  it("15. 1클릭 일괄 클린업 결과(cleanedRgba)를 재스캔하면 결함 0건 CLEAN이 된다", () => {
    const grid = createSampleWebtoonPixelGrid();
    const first = scanPixelArtifactsAndCleanup(grid);
    const after = scanPixelArtifactsAndCleanup({ ...grid, colorRgba: first.cleanedRgba });
    expect(after.verdict).toBe("CLEAN");
    expect(after.artifacts).toHaveLength(0);
    expect(after.totalAffectedPixels).toBe(0);
  });

  it("16. 특정 핀 ID만 선택 클린업하면 나머지 아티팩트는 보존된다", () => {
    const grid = createSampleWebtoonPixelGrid();
    const first = scanPixelArtifactsAndCleanup(grid);
    const dustPin = first.artifacts.find((a) => a.kind === "eraser-dust");
    expect(dustPin).toBeTruthy();
    const partialRgba = applyPixelArtifactCleanup(grid.colorRgba, first.artifacts, dustPin ? [dustPin.id] : []);
    const partialReport = scanPixelArtifactsAndCleanup({ ...grid, colorRgba: partialRgba });
    expect(partialReport.eraserDustCount).toBe(0);
    expect(partialReport.unfilledGapCount).toBe(1);
    expect(partialReport.colorBleedCount).toBe(1);
  });
});

describe("5. 7개국어 번역 말풍선 넘침 & 줄바꿈 자동 교정", () => {
  it("17. 7개국어(ko/en/ja/vi/th/id/es) 전부를 감사하고 언어별 안전 줄간격과 폰트 축소안을 산출한다", () => {
    const report = auditMultilingualBalloonOverflow(SAMPLE_MULTILINGUAL_BALLOONS);
    expect(report.totalBalloons).toBe(7);
    const locales = new Set(report.items.map((item) => item.locale));
    expect([...locales].sort()).toEqual(["en", "es", "id", "ja", "ko", "th", "vi"]);
    const thai = report.items.find((i) => i.locale === "th");
    expect(thai?.recommendedLineHeight).toBeGreaterThanOrEqual(1.55);
  });

  it("18. 영어·인도네시아어·스페인어 장문 번역 넘침을 단어 중간 절단 없이 폰트 축소로 자동 교정한다", () => {
    const report = auditMultilingualBalloonOverflow([
      {
        balloonId: "en-long",
        cutNumber: 4,
        locale: "en",
        text: "Extraordinary determination cannot be stopped right here!",
        boxWidthPx: 140,
        boxHeightPx: 96,
        fontSizePx: 17,
        shape: "oval",
      },
    ]);
    const item = report.items[0];
    expect(item?.status).toBe("AUTO_FIXED");
    expect(item?.recommendedFontSizePx).toBeLessThan(17);
    expect(item?.overflowAfterPx).toBe(0);
    expect(item?.correctedLines.join(" ")).toContain("Extraordinary");
  });

  it("19. 일본어 행두 금칙 문자(、。！？)가 새 줄 첫 글자로 떨어지지 않도록 줄바꿈을 보정한다", () => {
    const report = auditMultilingualBalloonOverflow([
      {
        balloonId: "ja-kinsoku",
        cutNumber: 5,
        locale: "ja",
        text: "絶対に諦めない。今ここで決着をつける！",
        boxWidthPx: 112,
        boxHeightPx: 120,
        fontSizePx: 15,
        shape: "rect",
      },
    ]);
    const lines = report.items[0]?.correctedLines ?? [];
    for (const line of lines) {
      expect(/^[、。！？）」』]/u.test(line)).toBe(false);
    }
  });

  it("20. 최소 가독 폰트(10px)로도 넘치는 극소 말풍선은 EXPAND_BALLOON과 권장 박스 크기를 반환한다", () => {
    const report = auditMultilingualBalloonOverflow([
      {
        balloonId: "tiny-es",
        cutNumber: 6,
        locale: "es",
        text: "¡Jamás te entregaré este documento secreto bajo ninguna circunstancia ni amenaza!",
        boxWidthPx: 84,
        boxHeightPx: 44,
        fontSizePx: 15,
        minReadableFontSizePx: 11,
        shape: "oval",
      },
    ]);
    const item = report.items[0];
    expect(item?.status).toBe("EXPAND_BALLOON");
    expect(item?.recommendedBoxHeightPx).toBeGreaterThan(44);
  });
});

describe("6. 출판 전 폰트·3D·브러시 상업 라이선스 차단 게이트 (Fail-Closed)", () => {
  it("21. 비상업·만료·미확인 에셋이 1컷이라도 포함되면 BLOCKED 판정과 검증된 CC0/OFL 대체 소재를 반환한다", () => {
    const report = verifyCommercialRightsGate({
      episodeId: "ep-01",
      checkDateIso: "2026-11-22",
      usedAssets: SAMPLE_EPISODE_ASSET_USAGES,
    });
    expect(report.verdict).toBe("BLOCKED");
    expect(report.canPublish).toBe(false);
    expect(report.blockedCount).toBe(3);
    expect(report.blockedCutNumbers).toEqual([4, 7, 9, 14]);
    for (const violation of report.violations) {
      expect(violation.recommendedAlternatives.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("22. 상태가 commercial-verified라도 만료일이 기준일 이전이면 Fail-Closed로 차단한다", () => {
    const report = verifyCommercialRightsGate({
      episodeId: "ep-02",
      checkDateIso: "2026-11-22",
      usedAssets: [
        {
          assetId: "exp-1",
          assetName: "유료 3D 건물 팩",
          assetKind: "model-3d",
          licenseStatus: "commercial-verified",
          licenseProvider: "마켓 구독",
          usedInCuts: [12],
          expiresAtIso: "2026-10-01",
        },
      ],
    });
    expect(report.verdict).toBe("BLOCKED");
    expect(report.violations[0]?.failureReasonCode).toBe("LICENSE_EXPIRED");
  });

  it("23. 모든 차단 에셋을 추천 CC0/상업 무료 소재로 교체하면 출판 게이트가 PASS로 전환된다", () => {
    const initial = verifyCommercialRightsGate({
      episodeId: "ep-01",
      checkDateIso: "2026-11-22",
      usedAssets: SAMPLE_EPISODE_ASSET_USAGES,
    });
    let replaced = SAMPLE_EPISODE_ASSET_USAGES;
    for (const v of initial.violations) {
      const alt = v.recommendedAlternatives[0];
      if (alt) {
        replaced = replaceBlockedAssetWithSafeAlternative(replaced, v.assetId, alt.alternativeId);
      }
    }
    const finalReport = verifyCommercialRightsGate({
      episodeId: "ep-01",
      checkDateIso: "2026-11-22",
      usedAssets: replaced,
    });
    expect(finalReport.verdict).toBe("PASS");
    expect(finalReport.canPublish).toBe(true);
    expect(finalReport.blockedCount).toBe(0);
  });
});

describe("7. PD/AD 음성 피드백 → 컷 자동 핀 + 수정 전/후 와이프 비교 승인", () => {
  it("24. '14컷 주인공 눈빛 더 날카롭게'를 14컷·주인공·눈 부위 좌표 핀으로 정확히 파싱한다", () => {
    const pin = parseVoiceQaFeedbackToPin({
      transcript: "14컷 주인공 눈빛 더 날카롭게",
      speakerRole: "PD",
      ticketSeq: 1,
    });
    expect(pin.cutNumber).toBe(14);
    expect(pin.targetSubjectKo).toBe("주인공");
    expect(pin.targetRegion).toBe("eyes");
    expect(pin.regionLabelKo).toBe("눈·시선");
    expect(pin.pinXNorm).toBe(0.5);
    expect(pin.pinYNorm).toBe(0.28);
    expect(pin.priority).toBe("high");
    expect(pin.instructionKo).toBe("주인공 눈빛 더 날카롭게");
  });

  it("25. 회차 번호와 컷 번호가 함께 들어와도 컷 번호를 정확히 추출하고 긴급 심의 키워드를 urgent로 분류한다", () => {
    const pin = parseVoiceQaFeedbackToPin({
      transcript: "22화 19번째 컷 배경 간판 상표 모자이크 긴급 처리해 주세요",
      speakerRole: "AD",
      ticketSeq: 2,
    });
    expect(pin.cutNumber).toBe(19);
    expect(pin.targetRegion).toBe("background");
    expect(pin.priority).toBe("urgent");
  });

  it("26. 와이프 비교 슬라이더(0~100% 클램프)와 수정본 제출 → 재수정 → 최종 승인 이력이 정확히 전이된다", () => {
    const initial = parseVoiceQaFeedbackToPin({ transcript: "14컷 주인공 눈빛 더 날카롭게", speakerRole: "PD" });
    const wiped = transitionVoicePinApproval(initial, { type: "set-wipe", wipePositionPct: 140 });
    expect(wiped.wipePositionPct).toBe(100);

    const submitted = transitionVoicePinApproval(wiped, { type: "submit-fix", afterSummaryKo: "눈매 선화 보강 완료" });
    expect(submitted.status).toBe("in-review");

    const revised = transitionVoicePinApproval(submitted, { type: "request-revision", reviewerName: "김PD", noteKo: "하이라이트 축소" });
    expect(revised.status).toBe("revision-requested");

    const approved = transitionVoicePinApproval(revised, { type: "approve", reviewerName: "김PD" });
    expect(approved.status).toBe("approved");
    expect(approved.auditTrailKo.length).toBeGreaterThanOrEqual(4);
  });
});

describe("8. StudioAiQaCompliancePanel UI 인터랙션 & StudioPresenceRoster 지연 마운트", () => {
  it("27. 관제판 탭 1(심의·상표)에서 국가/등급 전환과 1클릭 일괄 가림 레이어 적용이 동작한다", () => {
    render(<StudioAiQaCompliancePanel episodeLabel="EP.07 시계탑" />);
    expect(screen.getByTestId("studio-ai-qa-compliance-panel")).toBeTruthy();
    expect(screen.getByTestId("qa-compliance-verdict").textContent).toBe("BLOCKED");

    fireEvent.click(screen.getByTestId("qa-region-SEA"));
    fireEvent.click(screen.getByTestId("qa-rating-15+"));
    expect(screen.getByTestId("qa-compliance-verdict").textContent).toBe("BLOCKED");

    fireEvent.click(screen.getByTestId("qa-compliance-apply-all-btn"));
    expect(screen.getByTestId("qa-compliance-verdict").textContent).toBe("PASS");
    expect(screen.getByTestId("qa-status-banner").textContent).toContain("일괄 적용");
  });

  it("28. 탭 2(맞춤법·말투)와 탭 3(시선·소품)에서 위반 목록과 교정 반영이 동작한다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-grammar"));
    expect(screen.getByTestId("qa-grammar-fixed-b-01").textContent).toContain("며칠");
    fireEvent.click(screen.getByTestId("qa-grammar-apply-all-btn"));
    expect(screen.getByTestId("qa-status-banner").textContent).toContain("맞춤법·말투 교정안");

    fireEvent.click(screen.getByTestId("qa-tab-continuity"));
    expect(screen.getByTestId("qa-continuity-verdict").textContent).toContain("BLOCKED");
    expect(screen.getByTestId("qa-eyeline-issues").textContent).toContain("11컷");
    expect(screen.getByTestId("qa-prop-issues").textContent).toContain("은빛 단검");
  });

  it("29. 탭 4(픽셀 헌터)에서 1클릭 일괄 클린업 후 결함 0건 CLEAN으로 전환된다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-pixel"));
    expect(screen.getByTestId("qa-pixel-verdict").textContent).toContain("탐지 3건");

    fireEvent.click(screen.getByTestId("qa-pixel-cleanup-btn"));
    expect(screen.getByTestId("qa-pixel-verdict").textContent).toContain("클린 완료 (0건)");
  });

  it("30. 탭 5(7개국어 말풍선)에서 언어별 필터링과 자동 교정 미리보기가 동작한다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-multilingual"));
    expect(screen.getByTestId("qa-multilingual-list").children.length).toBe(7);

    fireEvent.click(screen.getByTestId("qa-locale-es"));
    expect(screen.getByTestId("qa-multilingual-list").children.length).toBe(1);
    expect(screen.getByTestId("qa-multilingual-list").textContent).toContain("스페인어");
  });

  it("31. 탭 6(라이선스 게이트)에서 BLOCKED 차단 후 검증 CC0/상업 무료 일괄 교체로 PASS 전환된다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-rights"));
    expect(screen.getByTestId("qa-rights-verdict").textContent).toBe("BLOCKED");

    fireEvent.click(screen.getByTestId("qa-rights-swap-all-btn"));
    expect(screen.getByTestId("qa-rights-verdict").textContent).toBe("PASS");
  });

  it("32. 탭 7(음성 핀)에서 음성 문장 파싱·와이프 슬라이더 조절·수정본 제출 및 최종 승인이 동작한다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-voice"));

    fireEvent.change(screen.getByTestId("qa-voice-input"), {
      target: { value: "9컷 주인공 오른손 단검 각도 수정" },
    });
    fireEvent.click(screen.getByTestId("qa-voice-create-pin-btn"));
    expect(screen.getByTestId("qa-voice-ticket-list").textContent).toContain("9컷 · 손·소품");

    fireEvent.change(screen.getByTestId("qa-voice-wipe-slider"), { target: { value: "75" } });
    fireEvent.click(screen.getByTestId("qa-voice-submit-fix-btn"));
    expect(screen.getByTestId("qa-voice-active-status").textContent).toBe("in-review");

    fireEvent.click(screen.getByTestId("qa-voice-approve-btn"));
    expect(screen.getByTestId("qa-voice-active-status").textContent).toBe("approved");
  });

  it("33. 탭 6 개별 에셋 교체와 탭 7 재수정 요청·프리셋 칩 클릭이 UI 상태를 정확히 갱신한다", () => {
    render(<StudioAiQaCompliancePanel />);
    fireEvent.click(screen.getByTestId("qa-tab-rights"));
    expect(screen.getByTestId("qa-rights-violations").children.length).toBe(3);

    fireEvent.click(screen.getByTestId("qa-rights-swap-asset-font-nc"));
    expect(screen.getByTestId("qa-rights-violations").children.length).toBe(2);
    expect(screen.getByTestId("qa-rights-verdict").textContent).toBe("BLOCKED");

    fireEvent.click(screen.getByTestId("qa-tab-voice"));
    fireEvent.click(screen.getByTestId("qa-voice-revision-btn"));
    expect(screen.getByTestId("qa-voice-active-status").textContent).toBe("revision-requested");
  });

  it("34. StudioPresenceRoster 하단 접이식 패널이 정적 import 없이 lazyRetry + Suspense로만 지연 마운트된다", () => {
    const rosterSource = readFileSync(
      resolve(process.cwd(), "apps/web/src/domains/creator/virtual-space/StudioPresenceRoster.tsx"),
      "utf8",
    );
    expect(rosterSource).toContain('data-testid="studio-ai-qa-compliance-disclosure"');
    expect(rosterSource).toContain("7대 웹툰 AI 자동 검수 · 심의·말투·시선·픽셀·라이선스 게이트");
    expect(rosterSource).toMatch(/const StudioAiQaCompliancePanel = lazyRetry\(/u);
    expect(rosterSource).toContain('import("../ai-qa-compliance/StudioAiQaCompliancePanel")');
    expect(rosterSource).toContain("<Suspense");
    expect(rosterSource).toContain("qaPanelOpen ?");
    // Eager 번들 유입을 막기 위해 정적 import 구문이 없어야 한다
    expect(rosterSource).not.toMatch(/^import\s+.*ai-qa-compliance/mu);
  });
});
