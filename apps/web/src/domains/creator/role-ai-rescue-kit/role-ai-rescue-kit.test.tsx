// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  episodeScope,
  type EpisodeCollaboration,
  type EpisodeReleasePlan,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

import {
  ATMOSPHERE_OKLCH_CATALOG,
  OUTFIT_SET_CATALOG,
  RESCUE_ENGINE_COST_KRW,
  applyBatchRedressAndRelight,
  createSampleSixtyCutManuscript,
  fillEmptyScenePropsAndSigns,
  generateBridgeCutProposal,
  runAnatomyAndFoldRescue,
  scanManuscriptFlawsAndAutoFix,
  syncExpressionFromDialogueEdit,
  type AnatomyRescueTarget,
  type AtmospherePresetId,
  type OutfitSetId,
  type SceneGenreEra,
  type SceneZoneId,
} from "./chore-rescue-ai-engine";
import {
  SEVEN_ROLE_PROFILES,
  calculateStudioTeamWeeklySavings,
  executeRoleAutopilot,
  toggleRoleStepManualLock,
  type WebtoonProductionRoleId,
} from "./seven-role-autopilot-engine";
import { StudioRoleAiRescuePanel } from "./StudioRoleAiRescuePanel";

import { ProductionStageDeadlinePlan } from "../production-hub/ProductionStageDeadlinePlan";

afterEach(() => {
  cleanup();
});

function createDeadlineFixtureAggregate(): ProductionProjectAggregate {
  const futureReleaseIso = new Date(Date.now() + 21 * 86_400_000).toISOString();
  const ep: EpisodeCollaboration = {
    episodeId: "ep-10",
    state: "final-art-production",
    plannedReleaseAt: futureReleaseIso,
    storyLockApproved: true,
    thumbnailLockApproved: true,
    jointProofApproved: false,
    creditPreflightPassed: false,
    publicationPreflightPassed: false,
  } as EpisodeCollaboration;

  const task: ProductionTask = {
    id: "task-1",
    projectId: "proj-rescue",
    scope: episodeScope("proj-rescue", "ep-10"),
    processKey: "lineart",
    title: "10화 선화",
    status: "ready",
    assignmentIds: ["artist-1"],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: { optimistic: 8, likely: 12, pessimistic: 18 },
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
  } as ProductionTask;

  const plan: EpisodeReleasePlan = {
    id: "rp-10",
    projectId: "proj-rescue",
    episodeId: "ep-10",
    platformKey: "webtoon",
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    scheduledAt: futureReleaseIso,
    status: "scheduled",
    title: "10화 게시 예약",
    description: "",
    thumbnailRevisionRef: null,
    sourceSubmissionIds: [],
    requiredCheckKeys: [],
    passedCheckKeys: [],
    blockers: [],
    warnings: [],
    externalReleaseId: null,
    externalUrl: null,
    revision: 1,
    updatedAt: new Date().toISOString(),
  } as EpisodeReleasePlan;

  return {
    projectId: "proj-rescue",
    episodes: [ep],
    tasks: [task],
    releasePlans: [plan],
  } as unknown as ProductionProjectAggregate;
}

describe("6대 작가 노가다 박멸 AI 보정 엔진 (₩0 · 결정론)", () => {
  it("01. 손(hands) 1초 부분 보정은 선폭 락을 유지하고 수동 편집 레이어 3장을 분리한다", () => {
    const result = runAnatomyAndFoldRescue({
      cutId: "cut-05",
      maskRegion: { x: 100, y: 120, width: 220, height: 200 },
      targetType: "hands",
      styleLock: { strokeWidthPx: 2.4, taperRatio: 0.7, inkStyle: "g-pen", preserveOriginalUnderlay: true },
    });

    expect(result.applied).toBe(true);
    expect(result.validationError).toBeNull();
    expect(result.costKrw).toBe(RESCUE_ENGINE_COST_KRW);
    expect(result.estimatedTimeMs).toBeLessThanOrEqual(950);
    expect(result.outputStrokeWidthPx).toBe(2.4);
    expect(result.strokeLockMatched).toBe(true);
    expect(result.vectorControlPoints).toHaveLength(6);
    expect(result.separatedLayers).toHaveLength(3);
    expect(result.separatedLayers[0].locked).toBe(true);
    expect(result.separatedLayers[1].editable).toBe(true);
    expect(result.separatedLayers[2].editable).toBe(true);
    expect(result.anatomyChecks.some((line) => line.includes("5지"))).toBe(true);
  });

  it("02. 손·프릴·무기·자동차 4대 대상의 모든 벡터 제어점이 마스크 영역 안에 생성된다", () => {
    const mask = { x: 50, y: 80, width: 300, height: 240 };
    const targets: readonly AnatomyRescueTarget[] = ["hands", "frills", "weapon", "vehicle"];

    for (const targetType of targets) {
      const result = runAnatomyAndFoldRescue({
        cutId: `cut-${targetType}`,
        maskRegion: mask,
        targetType,
        styleLock: { strokeWidthPx: 1.8, taperRatio: 0.65, inkStyle: "clean-digital", preserveOriginalUnderlay: true },
      });
      expect(result.applied).toBe(true);
      expect(result.vectorControlPoints.length).toBeGreaterThanOrEqual(4);
      for (const pt of result.vectorControlPoints) {
        expect(pt.x).toBeGreaterThanOrEqual(mask.x);
        expect(pt.x).toBeLessThanOrEqual(mask.x + mask.width);
        expect(pt.y).toBeGreaterThanOrEqual(mask.y);
        expect(pt.y).toBeLessThanOrEqual(mask.y + mask.height);
      }
    }
  });

  it("03. 부분 보정은 동일 입력에 대해 완전히 결정론적이며 비정상 마스크는 안전하게 거부한다", () => {
    const validInput = {
      cutId: "cut-det",
      maskRegion: { x: 20, y: 30, width: 140, height: 160 },
      targetType: "weapon" as const,
      styleLock: { strokeWidthPx: 2.0, taperRatio: 0.8, inkStyle: "brush-ink" as const, preserveOriginalUnderlay: true },
    };
    const first = runAnatomyAndFoldRescue(validInput);
    const second = runAnatomyAndFoldRescue(validInput);
    expect(first).toEqual(second);

    const invalid = runAnatomyAndFoldRescue({
      ...validInput,
      maskRegion: { x: 20, y: 30, width: 0, height: -10 },
    });
    expect(invalid.applied).toBe(false);
    expect(invalid.validationError).toContain("0보다 큰");
    expect(invalid.separatedLayers).toHaveLength(0);
  });

  it("04. 원본 언더레이 잠금 해제 옵션을 주면 원본 레이어도 편집 가능 상태로 반환된다", () => {
    const result = runAnatomyAndFoldRescue({
      cutId: "cut-unlock",
      maskRegion: { x: 10, y: 10, width: 120, height: 120 },
      targetType: "frills",
      styleLock: { strokeWidthPx: 1.6, taperRatio: 0.5, inkStyle: "pencil-rough", preserveOriginalUnderlay: false },
      detailLevel: "print",
    });
    expect(result.applied).toBe(true);
    expect(result.separatedLayers[0].locked).toBe(false);
    expect(result.separatedLayers[0].editable).toBe(true);
  });

  it("05. 구도·감정 낙차와 시선 반전이 큰 컷 사이에서는 연결 컷 2장을 자동 제안한다", () => {
    const result = generateBridgeCutProposal({
      prevCut: {
        cutNumber: 12,
        cameraAngle: "establishing",
        emotion: "calm",
        actionSummary: "골목 입구에 멈춰 서서 주위를 살핌",
        gazeDirection: "left",
        beatDurationSec: 2.1,
      },
      nextCut: {
        cutNumber: 13,
        cameraAngle: "extreme-closeup",
        emotion: "shocked",
        actionSummary: "등 뒤 그림자에 눈동자가 크게 흔들림",
        gazeDirection: "right",
        beatDurationSec: 1.0,
      },
      readingPacing: "dramatic-pause",
    });

    expect(result.costKrw).toBe(0);
    expect(result.deltaAnalysis.gazeBreakDetected).toBe(true);
    expect(result.deltaAnalysis.cameraJumpScore).toBeGreaterThanOrEqual(80);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].suggestedCutLabel).toBe("12-A");
    expect(result.proposals[1].suggestedCutLabel).toBe("12-B");
    expect(result.proposals[0].breathGapPx).toBeGreaterThanOrEqual(500);
  });

  it("06. 구도 낙차가 완만하고 액션 템포인 경우 연결 컷 1장만 간결히 제안한다", () => {
    const result = generateBridgeCutProposal({
      prevCut: {
        cutNumber: 30,
        cameraAngle: "medium-shot",
        emotion: "calm",
        actionSummary: "검 손잡이를 잡음",
        gazeDirection: "center",
        beatDurationSec: 1.0,
      },
      nextCut: {
        cutNumber: 31,
        cameraAngle: "closeup",
        emotion: "smirk",
        actionSummary: "검을 살짝 뽑아 올림",
        gazeDirection: "center",
        beatDurationSec: 0.9,
      },
      readingPacing: "fast-action",
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].breathGapPx).toBe(180);
    expect(result.deltaAnalysis.gazeBreakDetected).toBe(false);
  });

  it("07. 제안된 연결 컷은 모두 수동 편집 가능 플래그와 분리 콘티 레이어 ID를 가진다", () => {
    const result = generateBridgeCutProposal({
      prevCut: {
        cutNumber: 7,
        cameraAngle: "full-shot",
        emotion: "joy",
        actionSummary: "문을 열고 들어섬",
        gazeDirection: "right",
        beatDurationSec: 1.5,
      },
      nextCut: {
        cutNumber: 8,
        cameraAngle: "closeup",
        emotion: "angry",
        actionSummary: "서류를 책상에 내려침",
        gazeDirection: "left",
        beatDurationSec: 1.2,
      },
    });
    expect(result.manualEditable).toBe(true);
    for (const card of result.proposals) {
      expect(card.separatedDraftLayerId).toContain("storyboard-layer");
      expect(card.estimatedReadSec).toBeGreaterThan(0);
    }
  });

  it("08. 4대 의상 세트와 4대 날씨/시간대는 원시 HEX 없이 순수 OKLCH 광원·그림자 델타를 산출한다", () => {
    const outfits = Object.keys(OUTFIT_SET_CATALOG) as OutfitSetId[];
    const atmospheres = Object.keys(ATMOSPHERE_OKLCH_CATALOG) as AtmospherePresetId[];

    for (const targetOutfit of outfits) {
      for (const targetAtmosphere of atmospheres) {
        const res = applyBatchRedressAndRelight({
          cuts: [{ cutId: "c1", cutNumber: 1, characterIds: ["hero"], currentOutfit: "summer-uniform", currentAtmosphere: "day" }],
          targetOutfit,
          targetAtmosphere,
        });
        expect(res.costKrw).toBe(0);
        expect(res.atmosphereSpec.keyLightOklch).toMatch(/^oklch\(/u);
        expect(res.atmosphereSpec.shadowTintOklch).toMatch(/^oklch\(/u);
        expect(res.atmosphereSpec.rimLightOklch).toMatch(/^oklch\(/u);
        for (const color of res.outfitSpec.paletteOklch) {
          expect(color).toMatch(/^oklch\(/u);
          expect(color).not.toMatch(/#[0-9a-f]{3,8}/iu);
        }
      }
    }
  });

  it("09. 일괄 의상·날씨 전환은 수동 잠금 컷을 기본 보호하고 해제 시 전체 컷에 분리 레이어 3장을 적용한다", () => {
    const cuts = [
      { cutId: "c1", cutNumber: 1, characterIds: ["서윤"], currentOutfit: "summer-uniform" as const, currentAtmosphere: "day" as const },
      { cutId: "c2", cutNumber: 2, characterIds: ["서윤"], currentOutfit: "summer-uniform" as const, currentAtmosphere: "day" as const, manualLocked: true },
      { cutId: "c3", cutNumber: 3, characterIds: ["도현"], currentOutfit: "summer-uniform" as const, currentAtmosphere: "day" as const },
    ];

    const protectedRun = applyBatchRedressAndRelight({
      cuts,
      targetOutfit: "rofan-gown",
      targetAtmosphere: "sunset",
      preserveManualLockedCuts: true,
    });
    expect(protectedRun.updatedCount).toBe(2);
    expect(protectedRun.skippedLockedCount).toBe(1);
    expect(protectedRun.cutResults[1].status).toBe("skipped-locked");
    expect(protectedRun.cutResults[1].appliedOutfit).toBe("summer-uniform");
    expect(protectedRun.cutResults[0].separatedLayers).toHaveLength(3);

    const overwriteRun = applyBatchRedressAndRelight({
      cuts,
      targetOutfit: "hunter-armor",
      targetAtmosphere: "snowy-dawn",
      preserveManualLockedCuts: false,
    });
    expect(overwriteRun.updatedCount).toBe(3);
    expect(overwriteRun.skippedLockedCount).toBe(0);
  });

  it("10. 대사 수정 연동 표정 싱크는 주요 감정을 정확히 판독하고 얼굴 전체 재작화를 절대 수행하지 않는다", () => {
    const cases: readonly { readonly text: string; readonly expected: string }[] = [
      { text: "당장 꺼져! 용서 못 해!!", expected: "angry" },
      { text: "설마 거짓말이지?! 말도 안 돼!", expected: "shocked" },
      { text: "정말 미안해... 결국 혼자 떠나게 됐네", expected: "sad" },
      { text: "부끄럽게 자꾸 보지 마, 바보야///", expected: "shy" },
      { text: "흥, 역시 예상대로 가소롭군", expected: "smirk" },
      { text: "정말 고마워, 드디어 해냈어! 최고야", expected: "joy" },
      { text: "내일 오전 열 시에 서류 확인하겠습니다.", expected: "calm" },
    ];

    for (const testCase of cases) {
      const res = syncExpressionFromDialogueEdit({
        cutId: "cut-expr",
        characterName: "서윤",
        previousDialogue: "기존 대사",
        editedDialogue: testCase.text,
      });
      expect(res.detectedEmotion).toBe(testCase.expected);
      expect(res.redrawFullFace).toBe(false);
    }
  });

  it("11. 표정 1초 싱크는 정확히 4개 표정 레이어(eyebrows/eyes/mouth/blush)만 동기화하고 ₩0·1초 이내 완료된다", () => {
    const res = syncExpressionFromDialogueEdit({
      cutId: "cut-31",
      characterName: "도현",
      previousDialogue: "괜찮아.",
      editedDialogue: "괜찮아.",
    });
    expect(res.costKrw).toBe(0);
    expect(res.dialogueChanged).toBe(false);
    expect(res.redrawFullFace).toBe(false);
    expect(res.modifiedLayerKeys).toEqual(["eyebrows", "eyes", "mouth", "blush"]);
    expect(res.estimatedSyncMs).toBeLessThan(500);
    expect(res.layers.blush.tintOklch).toMatch(/^oklch\(/u);
  });

  it("12. 4대 시대·장르와 4대 빈 공간 모두 오타 0건·좌우반전 0건 한글 간판과 맞춤 소품을 생성한다", () => {
    const eras: readonly SceneGenreEra[] = ["rofan", "seoul-modern", "murim", "academy"];
    const zones: readonly SceneZoneId[] = ["empty-desk", "cafe-table", "street-signboard", "corridor-wall"];

    for (const genreEra of eras) {
      for (const sceneZone of zones) {
        const res = fillEmptyScenePropsAndSigns({ sceneZone, genreEra });
        expect(res.costKrw).toBe(0);
        expect(res.zeroTypoGuaranteed).toBe(true);
        expect(res.zeroMirroredGuaranteed).toBe(true);
        expect(res.props.length).toBeGreaterThanOrEqual(3);
        expect(res.hangulSigns.length).toBeGreaterThanOrEqual(2);
        for (const sign of res.hangulSigns) {
          expect(sign.mirrored).toBe(false);
          expect(sign.typoCount).toBe(0);
          expect(sign.validatedHangulOnly).toBe(true);
        }
      }
    }
  });

  it("13. 배경 소품 채우기는 밀도 옵션(minimal/standard/rich)과 투시점 수, 분리 레이어 2장을 반영한다", () => {
    const minimal = fillEmptyScenePropsAndSigns({ sceneZone: "cafe-table", genreEra: "rofan", density: "minimal", cameraPerspectivePoints: 1 });
    const rich = fillEmptyScenePropsAndSigns({ sceneZone: "cafe-table", genreEra: "rofan", density: "rich", cameraPerspectivePoints: 3 });

    expect(minimal.props).toHaveLength(3);
    expect(rich.props).toHaveLength(5);
    expect(rich.props[0].perspectivePoints).toBe(3);
    expect(rich.separatedLayers).toHaveLength(2);
    expect(rich.separatedLayers.every((layer) => layer.editable)).toBe(true);
  });

  it("14. 60컷 옥에 티 헌터는 5대 결함 유형(소품 누락·반전 텍스트·흰 틈·말풍선 꼬리·손가락 이상)을 모두 탐지한다", () => {
    const sixtyCuts = createSampleSixtyCutManuscript();
    expect(sixtyCuts).toHaveLength(60);

    const preview = scanManuscriptFlawsAndAutoFix({ cuts: sixtyCuts, autoFixMode: "preview-only" });
    expect(preview.costKrw).toBe(0);
    expect(preview.totalScannedCuts).toBe(60);
    expect(preview.countsByCategory["missing-accessory"]).toBeGreaterThanOrEqual(1);
    expect(preview.countsByCategory["mirrored-text"]).toBeGreaterThanOrEqual(1);
    expect(preview.countsByCategory["unfilled-white-gap"]).toBeGreaterThanOrEqual(1);
    expect(preview.countsByCategory["mismatched-balloon-tail"]).toBeGreaterThanOrEqual(1);
    expect(preview.countsByCategory["abnormal-finger-count"]).toBeGreaterThanOrEqual(1);
    expect(preview.autoFixedCount).toBe(0);
    expect(preview.remainingFlawCount).toBe(preview.totalFlawsFound);
    expect(preview.releaseReadinessScore).toBeLessThan(100);
  });

  it("15. 60컷 옥에 티 헌터 1클릭 일괄 수정(apply-all)은 모든 결함을 해결하고 준비도 100점을 달성한다", () => {
    const fixed = scanManuscriptFlawsAndAutoFix({
      cuts: createSampleSixtyCutManuscript(),
      autoFixMode: "apply-all",
    });

    expect(fixed.totalFlawsFound).toBeGreaterThan(0);
    expect(fixed.autoFixedCount).toBe(fixed.totalFlawsFound);
    expect(fixed.remainingFlawCount).toBe(0);
    expect(fixed.releaseReadinessScore).toBe(100);
    expect(fixed.findings.every((item) => item.fixed)).toBe(true);
  });

  it("16. 결함이 없는 원고 스캔 시 탐지 건수 0건·연재 준비도 100점을 반환한다", () => {
    const clean = scanManuscriptFlawsAndAutoFix({
      cuts: [
        {
          cutNumber: 1,
          expectedAccessories: ["안경"],
          renderedAccessories: ["안경"],
          signTexts: [{ text: "청풍 객잔", mirrored: false }],
          unfilledWhiteGapCount: 0,
          balloonTails: [{ balloonId: "b1", assignedSpeaker: "서윤", tailTargetSpeaker: "서윤" }],
          detectedHandFingerCounts: [5, 5],
        },
      ],
    });
    expect(clean.totalFlawsFound).toBe(0);
    expect(clean.releaseReadinessScore).toBe(100);
    expect(clean.costKrw).toBe(0);
  });
});

describe("웹툰 제작 7대 직군별 특화 AI 자동화 엔진", () => {
  it("17. 7대 직군 전부 ₩0 비용으로 원클릭 실행되며 양수 주간 절감 시간을 산출한다", () => {
    expect(SEVEN_ROLE_PROFILES).toHaveLength(7);
    const roleIds: readonly WebtoonProductionRoleId[] = [
      "writer",
      "storyboard",
      "lineart",
      "bg3d",
      "coloring",
      "lettering",
      "pd-ad",
    ];
    for (const roleId of roleIds) {
      const result = executeRoleAutopilot({ roleId, episodeCutCount: 64 });
      expect(result.costKrw).toBe(0);
      expect(result.estimatedWeeklySavedHours).toBeGreaterThan(0);
      expect(result.executedStepCount).toBe(result.stepResults.length);
      expect(result.lockedStepCount).toBe(0);
    }
  });

  it("18. 글작가(writer) 자동화는 60~70컷 호흡 분배·충돌 0건·엔딩 훅 3안을 생성한다", () => {
    const result = executeRoleAutopilot({ roleId: "writer", episodeCutCount: 66 });
    expect(result.metrics.endingHookOptions).toHaveLength(3);
    expect(result.stepResults[0].outputDetailKo).toContain("66컷 호흡 분배");
    expect(result.stepResults[1].outputDetailKo).toContain("충돌 0건");
  });

  it("19. 콘티(storyboard) 자동화는 Z/S 시선 동선·6구도 카메라 분포·브리지 컷 제안을 포함한다", () => {
    const result = executeRoleAutopilot({ roleId: "storyboard", episodeCutCount: 64 });
    expect(result.metrics.sixCameraDistribution).toHaveLength(6);
    expect(result.stepResults[0].outputDetailKo).toContain("Z/S 시선");
    expect(result.stepResults[2].outputDetailKo).toContain("브리지 컷");
  });

  it("20. 선화(lineart)·배경3D(bg3d)·채색(coloring) 자동화는 6대 보정 엔진 결과를 통합해 반환한다", () => {
    const lineart = executeRoleAutopilot({ roleId: "lineart" });
    const bg3d = executeRoleAutopilot({ roleId: "bg3d" });
    const coloring = executeRoleAutopilot({ roleId: "coloring" });

    expect(lineart.stepResults[1].outputDetailKo).toContain("손·프릴·무기·차 1초 부분 보정");
    expect(bg3d.stepResults[1].outputDetailKo).toContain("오타·반전 0건 한글 간판");
    expect(bg3d.stepResults[2].outputDetailKo).toContain("OKLCH");
    expect(coloring.stepResults[2].outputDetailKo).toContain("얼굴 재작화 없음");
  });

  it("21. 식자/번역(lettering) 자동화는 7개국어 현지화와 일본 세로쓰기(타테가키) 검증 통과를 산출한다", () => {
    const result = executeRoleAutopilot({ roleId: "lettering" });
    expect(result.metrics.localizedLanguages).toHaveLength(7);
    expect(result.metrics.japaneseVerticalReady).toBe(true);
    expect(result.stepResults[2].outputDetailKo).toContain("타테가키");
  });

  it("22. PD/AD 자동화는 60컷 스캔·6대 플랫폼 규격·10분 이내 대타 매칭·화당 BEP 원가를 산출한다", () => {
    const result = executeRoleAutopilot({ roleId: "pd-ad", episodeCutCount: 64 });
    expect(result.metrics.platformSpecChecks).toHaveLength(6);
    expect(result.metrics.platformSpecChecks?.every((spec) => spec.statusKo === "통과")).toBe(true);
    expect(result.metrics.substituteMatchMinutes).toBeLessThanOrEqual(10);
    expect(result.metrics.bepPerEpisodeKrw).toBeGreaterThan(2_000_000);
    expect(result.metrics.bepPaidUnlockCount).toBeGreaterThan(10_000);
  });

  it("23. 수동 오버라이드 잠금된 단계는 자동 실행에서 건너뛰고 주간 절감 시간에서 투명하게 제외된다", () => {
    const locks = toggleRoleStepManualLock([], "lineart-anatomy-rescue");
    expect(locks).toEqual(["lineart-anatomy-rescue"]);

    const unlockedRun = executeRoleAutopilot({ roleId: "lineart", episodeCutCount: 64 });
    const lockedRun = executeRoleAutopilot({ roleId: "lineart", episodeCutCount: 64, lockedStepIds: locks });

    expect(lockedRun.lockedStepCount).toBe(1);
    expect(lockedRun.executedStepCount).toBe(unlockedRun.executedStepCount - 1);
    expect(lockedRun.estimatedWeeklySavedHours).toBeLessThan(unlockedRun.estimatedWeeklySavedHours);
    const lockedStep = lockedRun.stepResults.find((step) => step.stepId === "lineart-anatomy-rescue");
    expect(lockedStep?.status).toBe("locked-manual");
    expect(lockedStep?.savedHoursPerWeek).toBe(0);
    expect(lockedStep?.manualOverridePreserved).toBe(true);

    expect(toggleRoleStepManualLock(locks, "lineart-anatomy-rescue")).toEqual([]);
  });

  it("24. 회차 컷 수 증가에 따라 주간 절감 시간이 단조 증가하고 극단값은 안전 범위로 클램프된다", () => {
    const shortEp = executeRoleAutopilot({ roleId: "coloring", episodeCutCount: 40 });
    const stdEp = executeRoleAutopilot({ roleId: "coloring", episodeCutCount: 64 });
    const longEp = executeRoleAutopilot({ roleId: "coloring", episodeCutCount: 96 });
    const clampedHigh = executeRoleAutopilot({ roleId: "coloring", episodeCutCount: 999 });

    expect(shortEp.estimatedWeeklySavedHours).toBeLessThan(stdEp.estimatedWeeklySavedHours);
    expect(stdEp.estimatedWeeklySavedHours).toBeLessThan(longEp.estimatedWeeklySavedHours);
    expect(clampedHigh.episodeCutCount).toBe(120);
  });

  it("25. 7대 직군 전체 팀 주간·월간 절감 시간과 잠금 건수를 정확히 합산한다", () => {
    const allRuns = SEVEN_ROLE_PROFILES.map((profile) =>
      executeRoleAutopilot({
        roleId: profile.roleId,
        episodeCutCount: 64,
        lockedStepIds: profile.roleId === "writer" ? ["writer-ending-hooks"] : [],
      }),
    );
    const summary = calculateStudioTeamWeeklySavings(allRuns);
    expect(summary.costKrw).toBe(0);
    expect(summary.activeRoleCount).toBe(7);
    expect(summary.totalLockedStepCount).toBe(1);
    expect(summary.totalWeeklySavedHours).toBeGreaterThan(40);
    expect(summary.totalMonthlySavedHours).toBeGreaterThan(summary.totalWeeklySavedHours * 4);
  });
});

describe("StudioRoleAiRescuePanel UI & ProductionStageDeadlinePlan 지연 마운트", () => {
  it("26. 패널 초기 렌더링 시 ₩0 배지, 7대 직군 칩, 합산 주간 절감 시간 배지가 표시된다", () => {
    render(<StudioRoleAiRescuePanel />);
    expect(screen.getByTestId("studio-role-ai-rescue-panel")).toBeTruthy();
    expect(screen.getByText(/100% 무과금 ₩0/)).toBeTruthy();
    expect(screen.getByTestId("team-weekly-savings-badge").textContent).toContain("7직군 합산 주");
    for (const profile of SEVEN_ROLE_PROFILES) {
      expect(screen.getByTestId(`role-chip-${profile.roleId}`)).toBeTruthy();
    }
  });

  it("27. 글작가·식자/번역·PD/AD 칩을 전환하면 직군별 특화 결과 카드가 즉시 갱신된다", () => {
    render(<StudioRoleAiRescuePanel />);

    fireEvent.click(screen.getByTestId("role-chip-writer"));
    expect(screen.getByText("엔딩 훅 3안 비교")).toBeTruthy();

    fireEvent.click(screen.getByTestId("role-chip-lettering"));
    expect(screen.getByText(/일본 세로쓰기\(타테가키\) 검증 통과/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("role-chip-pd-ad"));
    expect(screen.getByTestId("pd-ad-platform-card").textContent).toContain("6대 플랫폼 규격 · 10분 대타 매칭(7분)");
    expect(screen.getByText(/네이버웹툰 690px/)).toBeTruthy();
  });

  it("28. 직군 단계의 수동 오버라이드 잠금 토글 클릭 시 수동 잠금 유지 상태로 전환되고 절감 시간이 재계산된다", () => {
    render(<StudioRoleAiRescuePanel />);
    const hoursBefore = screen.getByTestId("active-role-saved-hours").textContent ?? "";

    fireEvent.click(screen.getByTestId("lock-toggle-lineart-anatomy-rescue"));
    expect(screen.getByTestId("role-step-lineart-anatomy-rescue").textContent).toContain("수동 잠금 유지");
    const hoursAfter = screen.getByTestId("active-role-saved-hours").textContent ?? "";
    expect(hoursAfter).not.toBe(hoursBefore);
    expect(screen.getByTestId("team-lock-summary-badge").textContent).toContain("잠금 1건");
  });

  it("29. 6대 보정 도구 탭 1~3(손·프릴·무기·차, 연결 컷, 의상·날씨 일괄)이 원클릭 실행된다", () => {
    render(<StudioRoleAiRescuePanel />);

    fireEvent.click(screen.getByRole("button", { name: "자동차·차륜 투시" }));
    fireEvent.click(screen.getByTestId("run-anatomy-rescue-btn"));
    expect(screen.getByTestId("anatomy-rescue-result").textContent).toContain("자동차·차륜 투시");

    fireEvent.click(screen.getByTestId("rescue-tab-bridge"));
    fireEvent.click(screen.getByTestId("run-bridge-proposal-btn"));
    expect(screen.getByTestId("bridge-proposal-result").textContent).toContain("24-A");

    fireEvent.click(screen.getByTestId("rescue-tab-redress"));
    fireEvent.click(screen.getByTestId("run-batch-redress-btn"));
    expect(screen.getByTestId("batch-redress-result").textContent).toContain("수동 잠금 보호 1컷");
  });

  it("30. 대사→표정 1초 싱크 탭에서 분노 대사를 입력하고 동기화하면 얼굴 재작화 없이 4개 레이어가 갱신된다", () => {
    render(<StudioRoleAiRescuePanel />);

    fireEvent.click(screen.getByTestId("rescue-tab-expression"));
    fireEvent.change(screen.getByTestId("dialogue-sync-input"), {
      target: { value: "당장 꺼져! 다시는 내 앞에 나타나지 마!!" },
    });
    fireEvent.click(screen.getByTestId("run-expression-sync-btn"));

    const resultText = screen.getByTestId("expression-sync-result").textContent ?? "";
    expect(resultText).toContain("얼굴 재작화 없음 · 4개 레이어만 동기화");
    expect(resultText).toContain("분노·격앙");
  });

  it("31. 소품·한글 간판 채우기 검증 후 60컷 옥에 티 헌터에서 1클릭 일괄 수정 시 연재 준비도 100점이 된다", () => {
    render(<StudioRoleAiRescuePanel />);

    fireEvent.click(screen.getByTestId("rescue-tab-props"));
    fireEvent.click(screen.getByTestId("run-scene-fill-btn"));
    expect(screen.getByTestId("scene-fill-result").textContent).toContain("한글 간판 오타 0건 · 좌우반전 0건");

    fireEvent.click(screen.getByTestId("rescue-tab-flaws"));
    expect(screen.getByTestId("flaw-readiness-badge").textContent).not.toContain("남은 결함 0건");

    fireEvent.click(screen.getByTestId("autofix-all-flaws-btn"));
    expect(screen.getByTestId("flaw-readiness-badge").textContent).toContain("연재 준비도 100점 · 남은 결함 0건");
  });

  it("32. ProductionStageDeadlinePlan은 접이식 disclosure 열기 전에는 패널을 지연 미로드하고 열면 마운트한다", async () => {
    const fixture = createDeadlineFixtureAggregate();
    render(
      <MemoryRouter>
        <ProductionStageDeadlinePlan aggregate={fixture} episodeId="ep-10" />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-role-ai-rescue-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-role-ai-rescue-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-role-ai-rescue-panel")).toBeTruthy();
    });
  });
});
