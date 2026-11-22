// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creatorRoleDefinition } from "@/shared/lib/creator-role-contract";

import { SpaceRoleGuide } from "../virtual-space/SpaceRoleGuide";
import { studioVirtualSpaceRolePreset } from "../virtual-space/studio-virtual-space-role-preset";
import type { SpaceRolePreset } from "../virtual-space/use-space-role-preset";
import {
  applyArtistAutonomyPreset,
  autoFillHyperAutomationInput,
  getSpectrumProfile,
  rerunSinglePipelineStage,
  restoreAutoFillSnapshot,
  runHyperAutomationPipeline,
  setStageAutonomyPercent,
  switchRunAutomationSpectrum,
  toggleStageManualLock,
  updateMasterLayer,
  updateRunCharacterDna,
  updateRunLightball,
  validateRequiredMinimalInput,
} from "./automation-spectrum-pipeline-engine";
import {
  CHARACTER_DNA_ANGLES,
  CHARACTER_DNA_EXPRESSIONS,
  computeLightballShading,
} from "./character-dna-lightball-engine";
import {
  AUTOMATION_SPECTRUM_PROFILES,
  BUILT_IN_ARTIST_PRESETS,
  DEFAULT_STAGE_AUTONOMY_BY_MODE,
  MASTER_LAYER_ORDER,
  MAX_CUT_COUNT,
  MIN_CUT_COUNT,
  createArtistAutonomyPreset,
  loadSavedArtistAutonomyPresets,
  saveArtistAutonomyPresets,
} from "./hyper-automation-catalog";
import { StudioHyperAutomationOsPanel } from "./StudioHyperAutomationOsPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function makeRolePreset(): SpaceRolePreset {
  return {
    attempted: true,
    userId: "demo-art",
    activeRole: "reviewer",
    definition: creatorRoleDefinition("reviewer"),
    customRoleLabel: null,
    preset: studioVirtualSpaceRolePreset("reviewer", false),
  };
}

describe("하이퍼 오토메이션 OS — 최소 입력 및 AI 문맥 자동 채움 엔진", () => {
  it("필수 입력 1개(ideaLine)가 비어 있으면 검증 오류를 반환한다", () => {
    const result = validateRequiredMinimalInput({ ideaLine: "   " });
    expect(result.valid).toBe(false);
    expect(result.requiredFieldCount).toBe(1);
    expect(result.errorCode).toBe("IDEA_LINE_REQUIRED");
    expect(result.message).toContain("아이디어");
  });

  it("아이디어 한 줄(필수 1개)만 입력하고 선택 항목을 모두 비워도 검증을 통과한다", () => {
    const result = validateRequiredMinimalInput({ ideaLine: "비를 멈추는 시계공의 마지막 하루" });
    expect(result.valid).toBe(true);
    expect(result.requiredFieldCount).toBe(1);
    expect(result.errorCode).toBeNull();
  });

  it("SF 사이버펑크 문맥 한 줄에서 7개 선택 필드를 전부 자동 채우고 출처 배지를 기록한다", () => {
    const filled = autoFillHyperAutomationInput({
      ideaLine: "2099년 네온 서울 옥상에서 기억을 잃은 AI 해커가 깨어난다",
    });
    expect(filled.resolved.genre).toBe("sf-cyberpunk");
    expect(filled.resolved.cutCount).toBeGreaterThanOrEqual(MIN_CUT_COUNT);
    expect(filled.resolved.cutCount).toBeLessThanOrEqual(MAX_CUT_COUNT);
    expect(filled.autoFilledFields).toHaveLength(7);
    expect(filled.userProvidedFields).toHaveLength(0);
    expect(filled.autoFilledFields.every((item) => item.source === "ai-autofill")).toBe(true);
    expect(filled.undoSnapshot).toEqual({
      ideaLine: "2099년 네온 서울 옥상에서 기억을 잃은 AI 해커가 깨어난다",
    });
  });

  it("로맨스·느와르·사극·일상 키워드 문맥을 각각의 장르와 화풍으로 정확히 추론한다", () => {
    expect(autoFillHyperAutomationInput({ ideaLine: "계약결혼 첫사랑 캠퍼스 재회" }).resolved.genre).toBe("romance-drama");
    expect(autoFillHyperAutomationInput({ ideaLine: "밀실 살인 사건을 쫓는 탐정" }).resolved.genre).toBe("thriller-noir");
    expect(autoFillHyperAutomationInput({ ideaLine: "조선 궁궐 화산파 검객의 비급" }).resolved.genre).toBe("historical-fusion");
    expect(autoFillHyperAutomationInput({ ideaLine: "골목 카페 고양이와 빵 굽는 일상" }).resolved.genre).toBe("slice-of-life");
  });

  it("사용자가 직접 입력한 선택 항목은 덮어쓰지 않고 컷 수·캐릭터 수 범위를 안전하게 보정한다", () => {
    const filled = autoFillHyperAutomationInput({
      ideaLine: "던전 보스를 잡은 검사의 회귀",
      genre: "thriller-noir",
      cutCount: 120,
      characterCount: 0,
      targetPlatform: "tapas",
    });
    expect(filled.resolved.genre).toBe("thriller-noir");
    expect(filled.resolved.cutCount).toBe(MAX_CUT_COUNT);
    expect(filled.resolved.characterCount).toBe(1);
    expect(filled.resolved.targetPlatform).toBe("tapas");
    expect(filled.userProvidedFields).toEqual(["genre", "characterCount", "cutCount", "targetPlatform"]);
    expect(filled.autoFilledFields).toHaveLength(3);
  });

  it("자동 채움 스냅샷 되돌리기가 직전 사용자 입력을 무손실 복구한다", () => {
    const original = { ideaLine: "네온 도시의 마지막 기록자", cutCount: 16 };
    const filled = autoFillHyperAutomationInput(original);
    const restored = restoreAutoFillSnapshot(filled.undoSnapshot);
    expect(restored).toEqual(original);
    expect(restored.genre).toBeUndefined();
  });
});

describe("하이퍼 오토메이션 OS — 9단계 파이프라인 · 스펙트럼 · 공정별 다이얼 · 수동 보호", () => {
  it("필수 입력 1개만으로 1~9단계 End-to-End 파이프라인을 순서대로 완주한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "던전 균열을 닫는 마지막 각성 헌터" },
      mode: "hyper-auto-99",
    });
    expect(run.stages.map((stage) => stage.id)).toEqual([
      "story-plot",
      "director-storyboard",
      "rough-cleanup",
      "scene-3d-blocking",
      "one-tap-coloring",
      "lighting-harmonizer",
      "nlp-vfx-lettering",
      "platform-preflight",
      "layered-master-output",
    ]);
    expect(run.stages.map((stage) => stage.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(run.cuts.length).toBe(run.resolvedInput.cutCount);
    expect(run.losslessLayerSeparation).toBe(true);
    expect(run.manualControlOpen).toBe(true);
  });

  it("필수 입력이 비어 있을 때 파이프라인 실행은 예외로 차단한다", () => {
    expect(() =>
      runHyperAutomationPipeline({
        input: { ideaLine: "" },
        mode: "hyper-auto-99",
      }),
    ).toThrow(/아이디어/u);
  });

  it("3단 자동화 스펙트럼(0%·50%·99%) 전환 시 기존 수동 잠금과 레이어 편집을 유지한다", () => {
    expect(AUTOMATION_SPECTRUM_PROFILES.map((item) => item.percent)).toEqual([0, 50, 99]);
    expect(getSpectrumProfile("manual-pro-0").percent).toBe(0);
    expect(getSpectrumProfile("assist-50").percent).toBe(50);
    expect(getSpectrumProfile("hyper-auto-99").percent).toBe(99);

    let run = runHyperAutomationPipeline({
      input: { ideaLine: "시간을 되감는 지하철 기관사" },
      mode: "hyper-auto-99",
    });
    run = toggleStageManualLock(run, "rough-cleanup");
    run = updateMasterLayer(run, "02_LINE_VECTOR", { opacity: 75 });
    const switched = switchRunAutomationSpectrum(run, "manual-pro-0");

    expect(switched.mode).toBe("manual-pro-0");
    expect(switched.automationPercent).toBe(0);
    expect(switched.protectedStageIds).toContain("rough-cleanup");
    expect(switched.masterLayers.find((layer) => layer.id === "02_LINE_VECTOR")?.opacity).toBe(75);
  });

  it("수동 프로 0% 모드는 핵심 작화 단계를 기본 잠금하고 전 공정 AI 비중을 0%로 연다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "수동 프로 원고 테스트" },
      mode: "manual-pro-0",
    });
    expect(run.automationPercent).toBe(0);
    expect(run.stages.every((stage) => stage.autonomyPercent === 0)).toBe(true);
    expect(run.stages.find((stage) => stage.id === "rough-cleanup")?.manualLocked).toBe(true);
    expect(run.masterLayers).toHaveLength(6);
  });

  it("프로 어시스트 50% 모드는 스토리 30%·선화 0%·채색·명암 85%·배경 95% 공정 비중을 기본 제공한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "50% 프로 어시스트 협업 회차" },
      mode: "assist-50",
    });
    expect(run.automationPercent).toBe(50);
    expect(run.stageAutonomy["story-plot"]).toBe(30);
    expect(run.stageAutonomy["rough-cleanup"]).toBe(0);
    expect(run.stageAutonomy["one-tap-coloring"]).toBe(85);
    expect(run.stageAutonomy["lighting-harmonizer"]).toBe(85);
    expect(run.stageAutonomy["scene-3d-blocking"]).toBe(95);
  });

  it("9단계별 autonomyPercent(0~99) 커스텀 다이얼이 범위를 보정하고 평균 비중을 실시간 재계산한다", () => {
    let run = runHyperAutomationPipeline({
      input: { ideaLine: "공정별 커스텀 다이얼 테스트" },
      mode: "hyper-auto-99",
    });
    run = setStageAutonomyPercent(run, "story-plot", 30);
    run = setStageAutonomyPercent(run, "rough-cleanup", -10);
    run = setStageAutonomyPercent(run, "one-tap-coloring", 85);
    run = setStageAutonomyPercent(run, "scene-3d-blocking", 150);

    expect(run.stageAutonomy["story-plot"]).toBe(30);
    expect(run.stageAutonomy["rough-cleanup"]).toBe(0);
    expect(run.stageAutonomy["one-tap-coloring"]).toBe(85);
    expect(run.stageAutonomy["scene-3d-blocking"]).toBe(99);
    expect(run.automationPercent).toBeLessThan(99);
    expect(run.stages.find((stage) => stage.id === "rough-cleanup")?.summary).toContain("0%");
  });

  it("작가 공정 비중 프리셋을 생성·저장·재로드하고 파이프라인에 일괄 적용한다", () => {
    const customMap = {
      ...DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"],
      "story-plot": 25,
      "rough-cleanup": 0,
      "one-tap-coloring": 90,
    };
    const preset = createArtistAutonomyPreset("내 마감 조합", customMap, 1);
    saveArtistAutonomyPresets([...BUILT_IN_ARTIST_PRESETS, preset]);
    const loaded = loadSavedArtistAutonomyPresets();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe("내 마감 조합");
    expect(loaded[0]?.stageAutonomy["story-plot"]).toBe(25);
    expect(loaded[0]?.stageAutonomy["rough-cleanup"]).toBe(0);

    const run = runHyperAutomationPipeline({
      input: { ideaLine: "프리셋 적용 검증" },
      mode: "hyper-auto-99",
    });
    const applied = applyArtistAutonomyPreset(run, preset.stageAutonomy);
    expect(applied.stageAutonomy["one-tap-coloring"]).toBe(90);
    expect(applied.automationPercent).toBe(preset.averagePercent);
  });

  it("프리셋 저장은 닫힌 공정 비중만 기록하고 추가 원고 필드를 제외한다", () => {
    const preset = createArtistAutonomyPreset("원고와 분리한 설정", DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"]);
    const withDocument = { ...preset, document: { pages: ["원고 본문"] },
      stageAutonomy: { ...preset.stageAutonomy, manuscript: "원고" }, averagePercent: 1234 };
    expect(saveArtistAutonomyPresets([withDocument])).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("toonstudio.hyper-auto.artist-autonomy-presets.v1") ?? "null")).toEqual([preset]);
    expect(loadSavedArtistAutonomyPresets()).toEqual([preset]);
  });

  it.each(["{broken", '{"version":2}', '[{"name":"읽을 수 없는 기존 설정"}]'])(
    "읽을 수 없는 기존 프리셋 %s를 새 설정으로 덮지 않는다", (original) => {
      const key = "toonstudio.hyper-auto.artist-autonomy-presets.v1";
      window.localStorage.setItem(key, original);
      expect(loadSavedArtistAutonomyPresets()).toEqual([]);
      expect(saveArtistAutonomyPresets([createArtistAutonomyPreset("새 설정", DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"])])).toBe(false);
      expect(window.localStorage.getItem(key)).toBe(original);
    },
  );

  it.each(["throw", "ignore"])("프리셋 쓰기 %s 실패는 기존 값과 다른 원고 키를 보존한다", (mode) => {
    const key = "toonstudio.hyper-auto.artist-autonomy-presets.v1";
    const existing = createArtistAutonomyPreset("기존 설정", DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"]);
    window.localStorage.setItem(key, JSON.stringify([existing]));
    window.localStorage.setItem("studio-project-document", "기존 원고");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      if (mode === "throw") throw new DOMException("quota", "QuotaExceededError");
    });
    expect(saveArtistAutonomyPresets([existing, { ...existing, id: "new", name: "새 설정" }])).toBe(false);
    expect(window.localStorage.getItem(key)).toBe(JSON.stringify([existing]));
    expect(window.localStorage.getItem("studio-project-document")).toBe("기존 원고");
  });

  it.each([
    { label: "중첩 원고 leaf", patch: { stageAutonomy: { "story-plot": { pages: ["legacy"] } } } },
    { label: "배열 leaf", patch: { stageAutonomy: { "story-plot": [42] } } },
    { label: "문자열 leaf", patch: { stageAutonomy: { "story-plot": "42" } } },
    { label: "boolean leaf", patch: { stageAutonomy: { "story-plot": true } } },
    { label: "null leaf", patch: { stageAutonomy: { "story-plot": null } } },
    { label: "객체 builtIn", patch: { builtIn: { pages: ["legacy"] } } },
    { label: "문자열 builtIn", patch: { builtIn: "false" } },
    { label: "null builtIn", patch: { builtIn: null } },
    { label: "객체 averagePercent", patch: { averagePercent: { pages: ["legacy"] } } },
    { label: "문자열 averagePercent", patch: { averagePercent: "50" } },
    { label: "null averagePercent", patch: { averagePercent: null } },
  ])("저장된 프리셋의 $label 값은 쓰기 없이 원문을 보존한다", ({ patch }) => {
    const key = "toonstudio.hyper-auto.artist-autonomy-presets.v1";
    const preset = createArtistAutonomyPreset("기존 사본", DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"]);
    const original = JSON.stringify([{ ...preset, ...patch }], null, 2);
    window.localStorage.setItem(key, original);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const restored = loadSavedArtistAutonomyPresets();
    const saved = saveArtistAutonomyPresets([createArtistAutonomyPreset("새 설정", preset.stageAutonomy)]);
    expect.soft(write).not.toHaveBeenCalled();
    expect.soft(window.localStorage.getItem(key)).toBe(original);
    expect.soft(saved).toBe(false);
    expect(restored).toEqual([]);
  });

  it.each([false, true])("숫자 clamp와 빠진 공정의 기본값은 메타데이터 존재=%s에서도 호환된다", (metadata) => {
    const key = "toonstudio.hyper-auto.artist-autonomy-presets.v1";
    window.localStorage.setItem(key, JSON.stringify([{ id: "legacy-numeric", name: "구형 숫자 설정",
      stageAutonomy: { "story-plot": -2.9, "rough-cleanup": 150, "one-tap-coloring": 26.6 },
      ...(metadata ? { builtIn: false, averagePercent: 1234 } : {}) }]));
    const restored = loadSavedArtistAutonomyPresets();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.stageAutonomy).toEqual({ ...DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"],
      "story-plot": 0, "rough-cleanup": 99, "one-tap-coloring": 27 });
    expect(restored[0]?.averagePercent).not.toBe(1234);
    expect(saveArtistAutonomyPresets(restored)).toBe(true);
    expect(loadSavedArtistAutonomyPresets()).toEqual(restored);
  });

  it("manualLocked: true 단계는 전체 파이프라인을 재실행해도 원본 내용과 버전이 100% 보호된다", () => {
    const first = runHyperAutomationPipeline({
      input: { ideaLine: "잠금 보호 검증 에피소드" },
      mode: "hyper-auto-99",
      variationSeed: 1,
    });
    const locked = toggleStageManualLock(toggleStageManualLock(first, "story-plot"), "director-storyboard");
    const lockedStoryBefore = locked.stages.find((stage) => stage.id === "story-plot");
    const lockedStoryboardBefore = locked.stages.find((stage) => stage.id === "director-storyboard");

    const rerun = runHyperAutomationPipeline({
      input: { ideaLine: "완전히 바뀐 두 번째 아이디어", cutCount: 8 },
      mode: "hyper-auto-99",
      previousRun: locked,
      variationSeed: 2,
    });

    expect(rerun.protectedStageIds).toEqual(["story-plot", "director-storyboard"]);
    expect(rerun.stages.find((stage) => stage.id === "story-plot")).toEqual(lockedStoryBefore);
    expect(rerun.stages.find((stage) => stage.id === "director-storyboard")).toEqual(lockedStoryboardBefore);
    expect(rerun.episodeTitle).toBe(first.episodeTitle);
    expect(rerun.cuts).toBe(first.cuts);
    expect(rerun.stages.find((stage) => stage.id === "lighting-harmonizer")?.generationCount).toBe(2);
  });

  it("단독 재실행도 manualLocked: true 단계는 덮어쓰기를 거부하고 해제된 단계만 v2로 갱신한다", () => {
    const initial = runHyperAutomationPipeline({
      input: { ideaLine: "단독 재실행 테스트" },
      mode: "hyper-auto-99",
    });
    const locked = toggleStageManualLock(initial, "one-tap-coloring");
    const blocked = rerunSinglePipelineStage(locked, "one-tap-coloring");
    expect(blocked.skippedBecauseLocked).toBe(true);
    expect(blocked.run.stages.find((stage) => stage.id === "one-tap-coloring")?.generationCount).toBe(1);

    const updated = rerunSinglePipelineStage(locked, "lighting-harmonizer");
    expect(updated.skippedBecauseLocked).toBe(false);
    expect(updated.run.stages.find((stage) => stage.id === "lighting-harmonizer")?.generationCount).toBe(2);
    expect(updated.run.stages.find((stage) => stage.id === "story-plot")?.generationCount).toBe(1);
  });

  it("6대 플랫폼 규격 검수와 OKLCH 팔레트 락이 원시 HEX 없이 생성된다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "네온 도시의 추적자" },
      mode: "hyper-auto-99",
    });
    expect(run.platformChecks.map((item) => item.platform)).toEqual([
      "naver-webtoon",
      "kakao-page",
      "lezhin",
      "webtoon-global",
      "piccoma",
      "tapas",
    ]);
    expect(run.paletteSwatches.every((swatch) => swatch.value.startsWith("oklch("))).toBe(true);
    expect(run.paletteSwatches.every((swatch) => !swatch.value.includes("#"))).toBe(true);
  });
});

describe("하이퍼 오토메이션 OS — 캐릭터 DNA(8각도·12표정) · 3D 라이트볼 · 6계층 수동 레이어", () => {
  it("캐릭터 DNA는 8각도·12표정(96셀 턴어라운드)을 고정하고 각도·표정·락 전환을 추적한다", () => {
    expect(CHARACTER_DNA_ANGLES).toHaveLength(8);
    expect(CHARACTER_DNA_EXPRESSIONS).toHaveLength(12);

    const run = runHyperAutomationPipeline({
      input: { ideaLine: "네온 서울의 각성 검사" },
      mode: "hyper-auto-99",
    });
    expect(run.characterDna.dnaCode).toMatch(/^DNA-[A-Z]{2}-[A-Z0-9]{5}$/u);
    expect(run.characterDna.totalTurnaroundCells).toBe(96);
    expect(run.characterDna.consistencyLock).toBe(true);

    const updated = updateRunCharacterDna(run, {
      selectedAngleId: "back-180",
      selectedExpressionId: "awakened",
      consistencyLock: false,
    });
    expect(updated.characterDna.selectedAngleId).toBe("back-180");
    expect(updated.characterDna.selectedExpressionId).toBe("awakened");
    expect(updated.characterDna.consistencyLock).toBe(false);
  });

  it("3D 라이트볼(방위각·고도각)이 단위 광원 벡터·그림자 배율·역광 림 라이트를 실시간 계산한다", () => {
    const front = computeLightballShading({ azimuthDeg: 0, elevationDeg: 45, keyIntensity: 80 });
    const backlight = computeLightballShading({ azimuthDeg: 180, elevationDeg: 15, keyIntensity: 90 });

    const norm = Math.hypot(front.lightVector.x, front.lightVector.y, front.lightVector.z);
    expect(norm).toBeCloseTo(1, 2);
    expect(front.shadowDirectionDeg).toBe(180);
    expect(backlight.rimLightPercent).toBeGreaterThan(front.rimLightPercent);
    expect(backlight.shadowLengthRatio).toBeGreaterThan(front.shadowLengthRatio);
    expect(backlight.lightingMoodLabel).toContain("역광");
    expect(backlight.keyColorOklch.startsWith("oklch(")).toBe(true);
  });

  it("updateRunLightball은 6단계 광원 요약과 04_SHADE_LIGHT 레이어를 실시간 동기화하되 잠금 레이어는 보호한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "실시간 3D 라이트볼 동기화" },
      mode: "hyper-auto-99",
    });
    const lit = updateRunLightball(run, { azimuthDeg: 210, elevationDeg: 22, keyIntensity: 92 });
    expect(lit.lightball.azimuthDeg).toBe(210);
    expect(lit.lightball.elevationDeg).toBe(22);
    expect(lit.stages.find((stage) => stage.id === "lighting-harmonizer")?.summary).toContain("210°");
    expect(lit.masterLayers.find((layer) => layer.id === "04_SHADE_LIGHT")?.roleDescription).toContain("210°");

    const lockedLayer = updateMasterLayer(lit, "04_SHADE_LIGHT", { manualLocked: true });
    const descBefore = lockedLayer.masterLayers.find((layer) => layer.id === "04_SHADE_LIGHT")?.roleDescription;
    const relit = updateRunLightball(lockedLayer, { azimuthDeg: 45, elevationDeg: 70 });
    expect(relit.masterLayers.find((layer) => layer.id === "04_SHADE_LIGHT")?.roleDescription).toBe(descBefore);
  });

  it("항상 6개 표준 분리 레이어(01_BG_3D~06_SPEECH_SFX)를 OKLCH 토큰과 요소 수와 함께 출력한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "6계층 레이어 검증" },
      mode: "hyper-auto-99",
    });
    expect(run.masterLayers.map((layer) => layer.id)).toEqual(MASTER_LAYER_ORDER);
    expect(run.masterLayers.every((layer) => layer.elementCount > 0)).toBe(true);
    expect(run.masterLayers.every((layer) => layer.colorTokenOklch.startsWith("oklch("))).toBe(true);
  });

  it("updateMasterLayer는 개별 레이어의 가시성·잠금·불투명도·블렌드 모드를 독립 수정한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "레이어 수동 정밀 편집" },
      mode: "hyper-auto-99",
    });
    const updated = updateMasterLayer(run, "04_SHADE_LIGHT", {
      visible: false,
      manualLocked: true,
      opacity: 145,
      blendMode: "overlay",
      manualNotes: "역광 림 라이트 강조",
    });
    const target = updated.masterLayers.find((layer) => layer.id === "04_SHADE_LIGHT");
    expect(target?.visible).toBe(false);
    expect(target?.manualLocked).toBe(true);
    expect(target?.opacity).toBe(100);
    expect(target?.blendMode).toBe("overlay");
    expect(target?.editCount).toBe(1);
    expect(updated.masterLayers.find((layer) => layer.id === "01_BG_3D")?.editCount).toBe(0);
  });

  it("수동 수정·잠금 레이어 및 9단계 전체 잠금은 파이프라인 재자동화 뒤에도 무손실 보존된다", () => {
    const first = runHyperAutomationPipeline({
      input: { ideaLine: "레이어 보존 불변식 검증" },
      mode: "hyper-auto-99",
    });
    const edited = updateMasterLayer(first, "06_SPEECH_SFX", {
      opacity: 64,
      manualLocked: true,
      manualNotes: "손글씨 식자 최종본",
    });
    const rerun = runHyperAutomationPipeline({
      input: { ideaLine: "레이어 보존 불변식 검증" },
      mode: "hyper-auto-99",
      previousRun: edited,
      variationSeed: 3,
    });
    expect(rerun.masterLayers.find((layer) => layer.id === "06_SPEECH_SFX")?.opacity).toBe(64);
    expect(rerun.masterLayers.find((layer) => layer.id === "06_SPEECH_SFX")?.manualLocked).toBe(true);

    const lockedMaster = toggleStageManualLock(rerun, "layered-master-output");
    const rerunLocked = runHyperAutomationPipeline({
      input: { ideaLine: "레이어 보존 불변식 검증", cutCount: 40 },
      mode: "hyper-auto-99",
      previousRun: lockedMaster,
    });
    expect(rerunLocked.masterLayers).toBe(lockedMaster.masterLayers);
  });
});

describe("StudioHyperAutomationOsPanel UI 및 SpaceRoleGuide 지연 마운트 통합", () => {
  it("기존 손상 프리셋의 중첩 원고는 UI 저장에서도 쓰기 없이 보존하고 실패 상태만 표시한다", () => {
    const key = "toonstudio.hyper-auto.artist-autonomy-presets.v1";
    const original = '[{"id":"legacy","name":"기존 사본","stageAutonomy":{"story-plot":{"pages":["legacy"]}}}]';
    window.localStorage.setItem(key, original);
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), { target: { value: "기존 사본 보호" } });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));
    fireEvent.change(screen.getByTestId("hyper-auto-preset-name-input"), { target: { value: "새 화면 설정" } });
    fireEvent.click(screen.getByTestId("hyper-auto-preset-save-button"));
    expect.soft(write).not.toHaveBeenCalled();
    expect.soft(window.localStorage.getItem(key)).toBe(original);
    expect(screen.getByTestId("hyper-auto-preset-bar").textContent).toContain("새 화면 설정");
    expect(screen.getByRole("status").textContent).toContain("화면을 닫으면 잃을 수");
    expect(screen.getByRole("status").textContent).not.toContain("저장했습니다");
  });
  it("브라우저 저장이 거부되면 현재 화면 프리셋은 유지하고 영구 저장 성공을 표시하지 않는다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), { target: { value: "저장 실패 설정 보존" } });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.change(screen.getByTestId("hyper-auto-preset-name-input"), { target: { value: "보존할 화면 설정" } });
    fireEvent.click(screen.getByTestId("hyper-auto-preset-save-button"));
    expect(screen.getByTestId("hyper-auto-preset-bar").textContent).toContain("보존할 화면 설정");
    expect(screen.getByRole("status").textContent).toContain("화면을 닫으면 잃을 수");
    expect(screen.getByRole("status").textContent).not.toContain("저장했습니다");
  });
  it("3단 자동화 스펙트럼 전환 시 라디오 상태와 실행 버튼 라벨이 즉시 반영된다", () => {
    render(<StudioHyperAutomationOsPanel />);
    const auto99 = screen.getByTestId("hyper-auto-mode-hyper-auto-99");
    const assist50 = screen.getByTestId("hyper-auto-mode-assist-50");
    const manual0 = screen.getByTestId("hyper-auto-mode-manual-pro-0");

    expect(auto99.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("hyper-auto-run-button").textContent).toContain("원클릭 99% 웹툰 생성");

    fireEvent.click(assist50);
    expect(assist50.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("hyper-auto-run-button").textContent).toContain("50% 프로 어시스트 실행");

    fireEvent.click(manual0);
    expect(manual0.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("hyper-auto-run-button").textContent).toContain("수동 프로 6계층 작업대 열기");
  });

  it("필수 입력 없이 실행하면 접근성 오류 경고를 표시하고 입력 시 해제한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));
    expect(screen.getByTestId("hyper-auto-error").getAttribute("role")).toBe("alert");

    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "옥상 정원의 비밀 도서관" },
    });
    expect(screen.queryByTestId("hyper-auto-error")).toBeNull();
  });

  it("AI 빈칸 자동 채움 후 출처 배지를 표시하고 1클릭 되돌리기로 복구한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "네온 미래 도시의 로봇 수사관" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-fill-button"));

    expect(screen.getByTestId("hyper-auto-filled-badges").textContent).toContain("SF 사이버펑크");
    expect((screen.getByTestId("hyper-auto-genre-select") as HTMLSelectElement).value).toBe("sf-cyberpunk");

    fireEvent.click(screen.getByTestId("hyper-auto-undo-fill-button"));
    expect(screen.queryByTestId("hyper-auto-filled-badges")).toBeNull();
    expect((screen.getByTestId("hyper-auto-genre-select") as HTMLSelectElement).value).toBe("");
  });

  it("아이디어 한 줄만으로 원클릭 99% 웹툰 생성 시 9단계 카드와 6계층 수동 레이어가 모두 렌더링된다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "비 오는 서울 옥상에서 각성한 마법 검사" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    expect(screen.getByTestId("hyper-auto-pipeline-grid")).toBeTruthy();
    expect(screen.getByTestId("hyper-auto-stage-story-plot")).toBeTruthy();
    expect(screen.getByTestId("hyper-auto-stage-layered-master-output")).toBeTruthy();
    expect(screen.getByTestId("hyper-auto-cut-preview")).toBeTruthy();
    for (const layerId of MASTER_LAYER_ORDER) {
      expect(screen.getByTestId(`hyper-auto-layer-${layerId}`)).toBeTruthy();
    }
  });

  it("공정별 0~99% 개별 다이얼을 조정하고 작가 커스텀 프리셋을 저장·적용한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "커스텀 공정 다이얼 UI 검증" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    fireEvent.change(screen.getByTestId("hyper-auto-dial-rough-cleanup"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("hyper-auto-dial-one-tap-coloring"), { target: { value: "85" } });
    expect(screen.getByTestId("hyper-auto-stage-rough-cleanup").textContent).toContain("수동 100%");

    fireEvent.change(screen.getByTestId("hyper-auto-preset-name-input"), {
      target: { value: "내 주간 마감 믹스" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-preset-save-button"));

    expect(screen.getByTestId("hyper-auto-preset-bar").textContent).toContain("내 주간 마감 믹스");
    fireEvent.click(screen.getByTestId("hyper-auto-preset-builtin-pro-line-manual"));
    expect((screen.getByTestId("hyper-auto-dial-story-plot") as HTMLInputElement).value).toBe("30");
    expect((screen.getByTestId("hyper-auto-dial-scene-3d-blocking") as HTMLInputElement).value).toBe("95");
  });

  it("캐릭터 DNA 8각도·12표정과 3D 라이트볼 방위각·고도각을 UI에서 실시간 제어한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "DNA와 라이트볼 실시간 UI 검증" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    fireEvent.click(screen.getByTestId("hyper-auto-dna-angle-back-180"));
    fireEvent.click(screen.getByTestId("hyper-auto-dna-expr-awakened"));
    expect(screen.getByTestId("hyper-auto-dna-summary").textContent).toContain("후면 180°");
    expect(screen.getByTestId("hyper-auto-dna-summary").textContent).toContain("각성·집중");

    fireEvent.change(screen.getByTestId("hyper-auto-lightball-azimuth"), { target: { value: "195" } });
    fireEvent.change(screen.getByTestId("hyper-auto-lightball-elevation"), { target: { value: "20" } });
    expect(screen.getByTestId("hyper-auto-stage-lighting-harmonizer").textContent).toContain("195°");
    expect(screen.getByTestId("hyper-auto-layer-04_SHADE_LIGHT").textContent).toContain("195°");
  });

  it("UI에서 수동 잠금 토글 및 단독 단계 재실행이 정확히 동작한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "잠금 보호 및 단독 재실행 UI 테스트" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    const lockBtn = screen.getByTestId("hyper-auto-lock-story-plot");
    const rerunBtn = screen.getByTestId("hyper-auto-rerun-story-plot") as HTMLButtonElement;
    fireEvent.click(lockBtn);
    expect(lockBtn.getAttribute("aria-pressed")).toBe("true");
    expect(rerunBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("hyper-auto-rerun-nlp-vfx-lettering"));
    expect(screen.getByTestId("hyper-auto-stage-nlp-vfx-lettering").textContent).toContain("v2");
    expect(screen.getByTestId("hyper-auto-stage-story-plot").getAttribute("data-locked")).toBe("true");
  });

  it("99% 자동 생성 직후에도 6계층 수동 레이어 편집기에서 가시성·잠금·블렌드·불투명도를 직접 제어한다", () => {
    render(<StudioHyperAutomationOsPanel />);
    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "6계층 레이어 수동 제어 UI 테스트" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    const visBtn = screen.getByTestId("hyper-auto-layer-vis-02_LINE_VECTOR");
    const lockBtn = screen.getByTestId("hyper-auto-layer-lock-02_LINE_VECTOR");
    const blendSelect = screen.getByTestId("hyper-auto-layer-blend-02_LINE_VECTOR") as HTMLSelectElement;
    const opacityInput = screen.getByTestId("hyper-auto-layer-opacity-02_LINE_VECTOR") as HTMLInputElement;

    fireEvent.click(visBtn);
    fireEvent.click(lockBtn);
    fireEvent.change(blendSelect, { target: { value: "multiply" } });
    fireEvent.change(opacityInput, { target: { value: "65" } });

    const layerRow = screen.getByTestId("hyper-auto-layer-02_LINE_VECTOR");
    expect(layerRow.getAttribute("data-visible")).toBe("false");
    expect(lockBtn.getAttribute("aria-pressed")).toBe("true");
    expect(blendSelect.value).toBe("multiply");
    expect(layerRow.textContent).toContain("불투명도 65%");
    expect(layerRow.textContent).toContain("수동 수정 4회");
  });

  it("SpaceRoleGuide는 접이식 패널을 열기 전까지 하이퍼 오토메이션 OS를 마운트하지 않고 열 때 지연 마운트한다", async () => {
    render(
      <MemoryRouter>
        <SpaceRoleGuide role={makeRolePreset()} aggregate={null} />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-hyper-automation-os-disclosure") as HTMLDetailsElement;
    expect(screen.queryByTestId("studio-hyper-automation-os-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-hyper-automation-os-panel")).toBeTruthy();
    });
  });
});
