/**
 * StudioBg3dCharacterCompositePanel.tsx
 *
 * 6종 고밀도 웹툰 3D 배경 세트(밀도 기본/풍성/극강) + 1~3명 3D 캐릭터(VRM 브리지/휴머노이드 아바타)
 * 실시간 합성 스테이지 패널.
 * - 자동 바닥 접지(Y=0) & 가구 스냅(서기 / 의자 착석 / 난간 기대기)
 * - 7종 배경 분위기 ↔ 캐릭터 MToon 셰이딩 자동 동기화
 * - 웹툰 2인·3인 연출 카메라 프리셋 5종
 * - 원클릭 통합 합성 3패스 캡처(선화·음영·깊이) 및 원고 컷 굽기
 */

import { Camera, Layers, Sparkles, UserMinus, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  captureCompositeStagePasses,
  createCharacterCompositeStage,
  DEFAULT_COMPOSITE_CHARACTER_CAST,
  MAX_COMPOSITE_STAGE_CHARACTERS,
  MIN_COMPOSITE_STAGE_CHARACTERS,
  WEBTOON_STAGE_CAMERA_PRESETS,
  type CharacterCompositeStageSession,
  type CompositeCharacterProfile,
  type CompositeCharacterSourceKind,
  type CompositeStageCaptureBundle,
  type WebtoonStageCameraPresetId,
} from "./studio-bg3d-character-composite-engine";
import {
  STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS,
  type StudioBg3dWebtoonAtmospherePresetId,
} from "./studio-bg3d-lighting-studio";
import type { BakedManuscriptCutLayer } from "./studio-bg3d-live-ink-bake-bridge";
import {
  RICH_SCENE_DENSITY_OPTIONS,
  RICH_WEBTOON_SCENE_PRESETS,
  type RichSceneDensityTier,
  type RichWebtoonScenePresetId,
  type StageFurnitureAnchorKind,
} from "./studio-bg3d-rich-scene-presets";

export interface StudioBg3dCharacterCompositePanelProps {
  readonly disabled?: boolean;
  readonly targetDocumentId?: string | null;
  readonly targetCutIndex?: number;
  readonly activeAtmosphereId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly onCompositeReady?: (session: CharacterCompositeStageSession) => void;
  readonly onCaptureBaked?: (bundle: CompositeStageCaptureBundle) => void;
  readonly onBakeToManuscriptCut?: (layer: BakedManuscriptCutLayer) => void;
  readonly onStatusMessage?: (messageKo: string) => void;
}

const STANCE_OPTIONS: readonly { readonly id: StageFurnitureAnchorKind; readonly labelKo: string }[] = Object.freeze([
  { id: "standing", labelKo: "서기" },
  { id: "seated", labelKo: "의자 착석" },
  { id: "leaning", labelKo: "난간 기대기" },
]);

export function StudioBg3dCharacterCompositePanel({
  disabled = false,
  targetDocumentId = "doc-active-manuscript",
  targetCutIndex = 0,
  activeAtmosphereId = null,
  onCompositeReady,
  onCaptureBaked,
  onBakeToManuscriptCut,
  onStatusMessage,
}: StudioBg3dCharacterCompositePanelProps) {
  const [presetId, setPresetId] = useState<RichWebtoonScenePresetId>("seoul-neon-alley");
  const [density, setDensity] = useState<RichSceneDensityTier>("rich");
  const [characters, setCharacters] = useState<readonly CompositeCharacterProfile[]>(() =>
    DEFAULT_COMPOSITE_CHARACTER_CAST.slice(0, 2),
  );
  const [localAtmosphereId, setLocalAtmosphereId] = useState<StudioBg3dWebtoonAtmospherePresetId>("night");
  const [cameraPresetId, setCameraPresetId] = useState<WebtoonStageCameraPresetId>("dialogue-ots");
  const [lastCapture, setLastCapture] = useState<CompositeStageCaptureBundle | null>(null);
  const [statusNote, setStatusNote] = useState<string>(
    "고밀도 웹툰 배경과 1~3명 캐릭터를 바닥 Y=0과 동일 광원으로 실시간 합성해요.",
  );

  const effectiveAtmosphereId = activeAtmosphereId ?? localAtmosphereId;
  const sessionRef = useRef<CharacterCompositeStageSession | null>(null);

  const stageSession = useMemo(
    () =>
      createCharacterCompositeStage({
        presetId,
        density,
        characters,
        atmosphereId: effectiveAtmosphereId,
        cameraPresetId,
      }),
    [presetId, density, characters, effectiveAtmosphereId, cameraPresetId],
  );

  useEffect(() => {
    const previous = sessionRef.current;
    sessionRef.current = stageSession;
    if (previous && previous !== stageSession) {
      try {
        previous.dispose();
      } finally {
        // 이전 Three.js 스테이지 리소스 해제 보장
      }
    }
    return () => {
      if (sessionRef.current === stageSession) {
        sessionRef.current = null;
        try {
          stageSession.dispose();
        } finally {
          // 언마운트 시 GPU 리소스 정리
        }
      }
    };
  }, [stageSession]);

  const emitStatus = (msg: string) => {
    setStatusNote(msg);
    onStatusMessage?.(msg);
  };

  const handleSelectPreset = (nextId: RichWebtoonScenePresetId) => {
    const meta = RICH_WEBTOON_SCENE_PRESETS.find((item) => item.id === nextId);
    setPresetId(nextId);
    if (meta && !activeAtmosphereId) {
      setLocalAtmosphereId(meta.recommendedAtmosphereId);
    }
    emitStatus(`“${meta?.labelKo ?? nextId}” 고밀도 배경 세트를 적용했어요.`);
  };

  const handleAddCharacter = () => {
    if (characters.length >= MAX_COMPOSITE_STAGE_CHARACTERS) return;
    const nextTemplate = DEFAULT_COMPOSITE_CHARACTER_CAST[characters.length];
    if (!nextTemplate) return;
    setCharacters((prev) => [...prev, nextTemplate]);
    emitStatus(`${nextTemplate.displayNameKo} 캐릭터를 스테이지에 추가했어요(${characters.length + 1}명).`);
  };

  const handleRemoveCharacter = (id: string) => {
    if (characters.length <= MIN_COMPOSITE_STAGE_CHARACTERS) return;
    setCharacters((prev) => prev.filter((item) => item.id !== id));
    emitStatus("선택한 캐릭터 슬롯을 스테이지에서 제외했어요.");
  };

  const handleUpdateCharacterStance = (id: string, stance: StageFurnitureAnchorKind) => {
    const matchingAnchor = stageSession.backgroundBuild.furnitureAnchors.find((a) => a.kind === stance) ?? null;
    setCharacters((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              stance,
              anchorId: matchingAnchor?.id ?? null,
              positionM: matchingAnchor ? matchingAnchor.positionM : item.positionM,
              facingYawRad: matchingAnchor ? matchingAnchor.facingYawRad : item.facingYawRad,
            }
          : item,
      ),
    );
    const stanceLabel = STANCE_OPTIONS.find((s) => s.id === stance)?.labelKo ?? stance;
    emitStatus(`캐릭터를 “${matchingAnchor?.labelKo ?? stanceLabel}”(바닥 Y=0.000m)에 스냅했어요.`);
  };

  const handleToggleSourceKind = (id: string) => {
    setCharacters((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextKind: CompositeCharacterSourceKind =
          item.sourceKind === "procedural-humanoid" ? "vrm-bridge" : "procedural-humanoid";
        return { ...item, sourceKind: nextKind };
      }),
    );
    emitStatus("캐릭터 소스(프로시저럴 휴머노이드 ↔ VRM 브리지)를 전환했어요.");
  };

  const handleSyncToScene = () => {
    onCompositeReady?.(stageSession);
    emitStatus(
      `“${stageSession.backgroundBuild.preset.labelKo}” + 캐릭터 ${stageSession.slots.length}명 합성을 장면에 반영했어요.`,
    );
  };

  const handleCaptureAndBake = () => {
    const bundle = captureCompositeStagePasses({
      session: stageSession,
      targetDocumentId: targetDocumentId?.trim() || "doc-active-manuscript",
      targetCutIndex,
      previewMode: "split-wipe",
      splitWipeRatio: 0.5,
    });
    setLastCapture(bundle);
    onCaptureBaked?.(bundle);
    onBakeToManuscriptCut?.(bundle.bakedLayer);
    emitStatus(
      `통합 3패스(선화·음영·깊이) 촬영 완료 · 컷 #${bundle.bakedLayer.targetCutIndex + 1}에 비파괴 레이어(소재 ${bundle.bakedLayer.rightsBomAssetIds.length}건)를 구웠어요.`,
    );
  };

  const syncParams = stageSession.lastSyncReceipt.parameters;
  const bgMetrics = stageSession.backgroundBuild.metrics;
  const bgLayers = stageSession.backgroundBuild.layerSummary;

  return (
    <section
      data-testid="studio-bg3d-character-composite-panel"
      aria-label="고밀도 3D 배경 및 캐릭터 실시간 합성 스테이지"
      className="space-y-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Layers size={15} className="shrink-0 text-accent" aria-hidden />
          <h4 className="font-semibold text-fg">고밀도 3D 배경 · 캐릭터 실시간 합성</h4>
        </div>
        <span
          data-testid="bg3d-rich-scene-manifold-badge"
          className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-good tabular-nums"
        >
          비다양체 {bgMetrics.nonManifoldEdgeCount} · 퇴화 {bgMetrics.degenerateTriangleCount} · Y={bgMetrics.boundsMin[1].toFixed(3)}m
        </span>
      </div>

      {/* 1. 6종 고밀도 웹툰 배경 세트 & 디테일 밀도 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-semibold text-fg">1. 고밀도 웹툰 배경 세트 (6종)</span>
          <div role="group" aria-label="배경 디테일 밀도" className="inline-flex items-center gap-1">
            {RICH_SCENE_DENSITY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                aria-pressed={density === option.id}
                data-testid={`bg3d-density-${option.id}`}
                onClick={() => {
                  setDensity(option.id);
                  emitStatus(`배경 디테일 밀도를 “${option.labelKo}”(입자 ${option.particleCount}개)으로 바꿨어요.`);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none"
              >
                {option.labelKo}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {RICH_WEBTOON_SCENE_PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                data-testid={`bg3d-rich-preset-${preset.id}`}
                onClick={() => handleSelectPreset(preset.id)}
                style={
                  active
                    ? {
                        backgroundColor: `color-mix(in oklch, ${preset.accentTokenVar} 16%, var(--color-card))`,
                      }
                    : undefined
                }
                className="flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:text-fg motion-reduce:transition-none"
              >
                <span className="text-xs font-semibold text-fg">{preset.labelKo}</span>
                <span className="text-[11px] text-fg-3">{preset.categoryKo}</span>
              </button>
            );
          })}
        </div>

        <p data-testid="bg3d-rich-scene-metrics" className="text-[11px] text-fg-3 tabular-nums">
          메시 {bgMetrics.meshCount}개 · 트라이앵글 {bgMetrics.totalTriangles}개 · 창틀/몰딩 {bgLayers.moldingMeshes} · 조명 {bgLayers.lightingMeshes} · 간판/액자 {bgLayers.signageFrameMeshes} · 식물 {bgLayers.foliageMeshes} · 난간 {bgLayers.railingMeshes} · 입자 {bgLayers.atmosphereParticles}
        </p>
      </div>

      {/* 2. 1~3명 캐릭터 배치 & 바닥 접지/가구 스냅 */}
      <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg tabular-nums">
            <Users size={14} className="shrink-0 text-accent" aria-hidden />
            2. 3D 캐릭터 합성 슬롯 ({characters.length}/{MAX_COMPOSITE_STAGE_CHARACTERS}명)
          </span>
          <button
            type="button"
            disabled={disabled || characters.length >= MAX_COMPOSITE_STAGE_CHARACTERS}
            data-testid="bg3d-composite-add-character"
            onClick={handleAddCharacter}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
          >
            <UserPlus size={14} aria-hidden />
            캐릭터 추가
          </button>
        </div>

        <div className="space-y-1.5">
          {stageSession.slots.map((slot) => (
            <div
              key={slot.profile.id}
              data-testid={`bg3d-composite-slot-${slot.profile.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-fg">{slot.profile.displayNameKo}</span>
                  <span className="text-[11px] text-fg-3 tabular-nums">{slot.profile.roleLabelKo}</span>
                  <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-good tabular-nums">
                    Y={slot.groundedMinY.toFixed(3)}m
                  </span>
                </div>
                <p className="text-[11px] text-fg-3 tabular-nums">
                  위치 ({slot.profile.positionM[0].toFixed(2)}, {slot.profile.positionM[2].toFixed(2)})m · {slot.profile.sourceKind === "vrm-bridge" ? "VRM 브리지 연결" : "프로시저럴 휴머노이드"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {STANCE_OPTIONS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={slot.profile.stance === st.id}
                    data-testid={`bg3d-stance-${slot.profile.id}-${st.id}`}
                    onClick={() => handleUpdateCharacterStance(slot.profile.id, st.id)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-card px-2 text-xs text-fg-2 transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none"
                  >
                    {st.labelKo}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-source-toggle-${slot.profile.id}`}
                  onClick={() => handleToggleSourceKind(slot.profile.id)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-card px-2 text-xs text-fg-2 transition-colors hover:border-accent motion-reduce:transition-none"
                >
                  {slot.profile.sourceKind === "vrm-bridge" ? "VRM" : "아바타"}
                </button>
                {characters.length > MIN_COMPOSITE_STAGE_CHARACTERS ? (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${slot.profile.displayNameKo} 제거`}
                    data-testid={`bg3d-remove-${slot.profile.id}`}
                    onClick={() => handleRemoveCharacter(slot.profile.id)}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-card px-2 text-xs text-bad transition-colors hover:border-bad motion-reduce:transition-none"
                  >
                    <UserMinus size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 배경 분위기 ↔ 캐릭터 MToon 셰이딩 자동 동기화 & 5종 연출 카메라 */}
      <details className="rounded-xl border border-line bg-card" open>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 py-2 font-semibold text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={14} className="shrink-0 text-accent" aria-hidden />
            3. MToon 조명 자동 동기화 · 5종 연출 카메라
          </span>
          <span data-testid="bg3d-mtoon-sync-summary" className="text-[11px] font-medium text-accent tabular-nums">
            {syncParams.labelKo} · {syncParams.colorTemperatureKelvin}K · 외곽선 {syncParams.outlineWidthPx.toFixed(1)}px
          </span>
        </summary>
        <div className="space-y-2.5 border-t border-line p-2.5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="배경·캐릭터 7종 분위기 동기화">
            {STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((mood) => (
              <button
                key={mood.id}
                type="button"
                disabled={disabled}
                aria-pressed={effectiveAtmosphereId === mood.id}
                data-testid={`bg3d-composite-mood-${mood.id}`}
                onClick={() => {
                  setLocalAtmosphereId(mood.id);
                  emitStatus(`배경·캐릭터 MToon 조명을 “${mood.labelKo}” 분위기로 자동 동기화했어요.`);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none"
              >
                {mood.labelKo}
              </button>
            ))}
          </div>

          <p data-testid="bg3d-mtoon-sync-detail" className="text-[11px] text-fg-3 tabular-nums">
            동기화 머티리얼 {stageSession.lastSyncReceipt.syncedMaterialCount}개 · 림 강도 {Math.round(syncParams.rimLiftFactor * 100)}% · 안개 {Math.round(syncParams.fogDensity * 100)}% · 접지 그림자 {Math.round(syncParams.contactShadowOpacity * 100)}%
          </p>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 font-semibold text-fg">
              <Camera size={14} className="shrink-0 text-accent" aria-hidden />
              웹툰 연출 카메라 (5종)
            </span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="웹툰 2인 3인 연출 카메라">
              {WEBTOON_STAGE_CAMERA_PRESETS.map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={cameraPresetId === cam.id}
                  data-testid={`bg3d-stage-camera-${cam.id}`}
                  onClick={() => {
                    setCameraPresetId(cam.id);
                    emitStatus(`“${cam.labelKo}” (${cam.focalLengthMm}mm) 연출 카메라 구도로 맞췄어요.`);
                  }}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none"
                >
                  {cam.labelKo} ({cam.focalLengthMm}mm)
                </button>
              ))}
            </div>
            <p data-testid="bg3d-stage-camera-readout" className="text-[11px] text-fg-3 tabular-nums">
              카메라 ({stageSession.activeCamera.position.join(", ")})m · FOV {stageSession.activeCamera.fovDegrees}° · 더치 {stageSession.activeCamera.dutchRollDeg}°
            </p>
          </div>
        </div>
      </details>

      {/* 4. 원클릭 합성 & 통합 3패스 캡처 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-composite-apply-btn"
          onClick={handleSyncToScene}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-card px-3.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
        >
          캐릭터 씬에 합성
        </button>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-composite-capture-bake-btn"
          onClick={handleCaptureAndBake}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-accent bg-accent px-3.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 motion-reduce:transition-none"
        >
          통합 패스 촬영 & 원고 컷 굽기
        </button>
      </div>

      {lastCapture ? (
        <div
          data-testid="bg3d-composite-capture-preview"
          className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-card p-2"
        >
          <figure className="space-y-1">
            <img src={lastCapture.snapshot.inkPassRef} alt="합본 선화 패스 미리보기" className="h-16 w-full rounded border border-line object-cover" />
            <figcaption className="text-center text-[11px] text-fg-2">합본 선화</figcaption>
          </figure>
          <figure className="space-y-1">
            <img src={lastCapture.snapshot.shadedPassRef} alt="합본 음영 패스 미리보기" className="h-16 w-full rounded border border-line object-cover" />
            <figcaption className="text-center text-[11px] text-fg-2">합본 음영</figcaption>
          </figure>
          <figure className="space-y-1">
            <img src={lastCapture.snapshot.depthPassRef ?? ""} alt="합본 깊이 패스 미리보기" className="h-16 w-full rounded border border-line object-cover" />
            <figcaption className="text-center text-[11px] text-fg-2">합본 깊이</figcaption>
          </figure>
        </div>
      ) : null}

      <p role="status" data-testid="bg3d-composite-status" className="text-xs text-fg-2">
        {statusNote}
      </p>
    </section>
  );
}
