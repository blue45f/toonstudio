import { Aperture, Layers, ShieldCheck, Sparkles, SunMedium } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  CUT_LIGHTING_PRESETS,
  CUT_LIGHTING_PRESET_IDS,
  DEFAULT_ARTIST_LINE_PRESETS,
  DEFAULT_SHARED_3D_CLASSROOM_SCENE,
  applyNonDestructiveCutPostProcessOverride,
  build3dSixPassStyleSync,
  clearCutPostProcessOverride,
  createEmptyCutPostProcessOverrideStore,
  extractArtistLineLayerProfile,
  resolveEffectiveCut3dRenderState,
  type CutLightingPresetId,
  type CutPostProcessOverrideStore,
} from "./artist-style-6pass-sync";

export interface ProAtelier3dSixPassSyncSectionProps {
  readonly syncStrength: number;
  readonly onApplyMasterStrokePx?: (strokeWidthPx: number) => void;
}

const DEMO_TARGET_CUTS = [
  { cutId: "ep01-cut-013-assist-a", cutLabel: "1화 13컷 · 교실 실내 컷" },
  { cutId: "ep01-cut-014-assist-b", cutLabel: "1화 14컷 · 창가 석양 전환 컷" },
  { cutId: "ep01-cut-015-outsource-c", cutLabel: "1화 15컷 · 원본 3D 공유 컷" },
] as const;

const FOCAL_LENGTH_PRESETS_MM = [24, 35, 50, 85, 135] as const;

/**
 * 축 27 · 3D→2D 작가 그림체 1클릭 동기화 & 컷 전용 비파괴 포스트-프로세스 오버라이드 섹션 (#131–#135).
 */
export function ProAtelier3dSixPassSyncSection({
  syncStrength,
  onApplyMasterStrokePx,
}: ProAtelier3dSixPassSyncSectionProps) {
  const baseId = useId();
  const [presetId, setPresetId] = useState<string>(DEFAULT_ARTIST_LINE_PRESETS[0]!.id);
  const [lightingPresetId, setLightingPresetId] =
    useState<CutLightingPresetId>("indoor-fluorescent");
  const [focalLengthMm, setFocalLengthMm] = useState<number>(85);
  const [apertureFStop, setApertureFStop] = useState<number>(2.4);
  const [selectedCutId, setSelectedCutId] = useState<string>(DEMO_TARGET_CUTS[1].cutId);
  const [overrideStore, setOverrideStore] = useState<CutPostProcessOverrideStore>(() =>
    createEmptyCutPostProcessOverrideStore(DEFAULT_SHARED_3D_CLASSROOM_SCENE.sceneId),
  );
  const [appliedCount, setAppliedCount] = useState<number>(0);

  const selectedLinePreset = useMemo(
    () =>
      DEFAULT_ARTIST_LINE_PRESETS.find((item) => item.id === presetId) ??
      DEFAULT_ARTIST_LINE_PRESETS[0]!,
    [presetId],
  );

  const extractedProfile = useMemo(
    () => extractArtistLineLayerProfile(selectedLinePreset.sample),
    [selectedLinePreset],
  );

  const sixPassPlan = useMemo(
    () =>
      build3dSixPassStyleSync({
        profile: extractedProfile,
        lightingPresetId,
        depthBlurInput: {
          focalLengthMm,
          apertureFStop,
          subjectDistanceM: 2.4,
          backgroundDistanceM: 9.5,
        },
        syncStrength,
      }),
    [apertureFStop, extractedProfile, focalLengthMm, lightingPresetId, syncStrength],
  );

  const selectedCutMeta =
    DEMO_TARGET_CUTS.find((cut) => cut.cutId === selectedCutId) ?? DEMO_TARGET_CUTS[0];

  const cutRenderStates = useMemo(
    () =>
      DEMO_TARGET_CUTS.map((cut) => ({
        ...cut,
        state: resolveEffectiveCut3dRenderState(
          DEFAULT_SHARED_3D_CLASSROOM_SCENE,
          overrideStore,
          cut.cutId,
        ),
      })),
    [overrideStore],
  );

  const handleOneClickApplyOverride = () => {
    const outcome = applyNonDestructiveCutPostProcessOverride({
      sharedScene: DEFAULT_SHARED_3D_CLASSROOM_SCENE,
      store: overrideStore,
      cutId: selectedCutMeta.cutId,
      cutLabel: selectedCutMeta.cutLabel,
      sixPassPlan,
    });
    setOverrideStore(outcome.store);
    setAppliedCount((prev) => prev + 1);
    onApplyMasterStrokePx?.(extractedProfile.averageStrokeWidthPx);
  };

  const handleClearOverride = () => {
    setOverrideStore((prev) => clearCutPostProcessOverride(prev, selectedCutMeta.cutId));
  };

  const lutPreviewMid = sixPassPlan.pass6PaperPostDof.colorTemperatureLut17[8];

  return (
    <section
      className="pas-card"
      data-testid="pas-3d-sixpass-sync-section"
      aria-label="3D에서 2D 작가 그림체 1클릭 6패스 동기화 및 컷 전용 비파괴 오버라이드"
    >
      <div className="pas-cut-head">
        <div>
          <h3 className="pas-card-title">
            <Sparkles size={16} aria-hidden="true" />
            3D→2D 작가 그림체 1클릭 6패스 동기화 · 컷 비파괴 오버라이드
          </h3>
          <p className="pas-card-desc">
            캐릭터 선화 1장에서 주 선색·평균 선폭·종이 입자량을 로컬 추출해 3D 6패스 선화 틴트·두께·색온도 LUT·배경 심도 블러를 맞추고, 조명 전환은 공유 3D 원본 재질 대신 컷 오버라이드 레이어에만 기록합니다.
          </p>
        </div>
        <span
          className="pas-badge"
          data-tone="good"
          data-testid="pas-shared-scene-hash-badge"
        >
          <ShieldCheck size={13} aria-hidden="true" />
          공유 3D 원본 재질 무결성 {DEFAULT_SHARED_3D_CLASSROOM_SCENE.materialsIntegrityHash}
        </span>
      </div>

      <div className="pas-workbench-split">
        <div className="pas-stage-box">
          <div className="pas-field">
            <label htmlFor={`${baseId}-line-preset`}>캐릭터 선화 기준 레이어 선택</label>
            <select
              id={`${baseId}-line-preset`}
              data-testid="pas-6pass-line-preset-select"
              className="pas-select"
              value={presetId}
              onChange={(event) => setPresetId(event.currentTarget.value)}
            >
              {DEFAULT_ARTIST_LINE_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.labelKo}
                </option>
              ))}
            </select>
          </div>

          <div className="pas-metrics-grid">
            <div className="pas-metric-box">
              <span className="pas-metric-label">추출 주 선색 (OKLCH)</span>
              <strong className="pas-metric-value pas-num" data-testid="pas-6pass-line-color">
                {extractedProfile.dominantLineCssOklch}
              </strong>
            </div>
            <div className="pas-metric-box">
              <span className="pas-metric-label">추출 평균 선폭</span>
              <strong className="pas-metric-value pas-num" data-testid="pas-6pass-stroke-width">
                {extractedProfile.averageStrokeWidthPx.toFixed(2)}px
              </strong>
            </div>
            <div className="pas-metric-box">
              <span className="pas-metric-label">종이 입자량 (0~1)</span>
              <strong className="pas-metric-value pas-num" data-testid="pas-6pass-paper-grain">
                {Math.round(extractedProfile.paperGrainAmount * 100)}%
              </strong>
            </div>
            <div className="pas-metric-box">
              <span className="pas-metric-label">초점 심도 블러</span>
              <strong className="pas-metric-value pas-num" data-testid="pas-6pass-depth-blur">
                가우시안 {sixPassPlan.pass6PaperPostDof.depthBlur.gaussianRadiusPx}px · 보케{" "}
                {sixPassPlan.pass6PaperPostDof.depthBlur.bokehDiskRadiusPx}px
              </strong>
            </div>
          </div>

          <div className="pas-control-row" role="group" aria-label="카메라 초점거리 선택">
            <span className="pas-metric-label">
              <Aperture size={13} aria-hidden="true" /> 초점거리
            </span>
            {FOCAL_LENGTH_PRESETS_MM.map((mm) => (
              <button
                key={mm}
                type="button"
                className="pas-chip-btn pas-num"
                aria-pressed={focalLengthMm === mm}
                data-testid={`pas-6pass-focal-${mm}`}
                onClick={() => setFocalLengthMm(mm)}
              >
                {mm}mm
              </button>
            ))}
          </div>

          <div className="pas-field">
            <label htmlFor={`${baseId}-aperture`}>
              조리개 F-stop:{" "}
              <strong className="pas-num">
                f/{apertureFStop.toFixed(1)} ({sixPassPlan.pass6PaperPostDof.depthBlur.blurPresetKo})
              </strong>
            </label>
            <input
              id={`${baseId}-aperture`}
              type="range"
              min={1.4}
              max={11}
              step={0.2}
              value={apertureFStop}
              onChange={(event) => setApertureFStop(Number(event.currentTarget.value))}
              className="pas-range"
            />
          </div>
        </div>

        <div className="pas-stage-box">
          <div className="pas-field">
            <label htmlFor={`${baseId}-target-cut`}>오버라이드 기록 대상 컷</label>
            <select
              id={`${baseId}-target-cut`}
              data-testid="pas-6pass-target-cut-select"
              className="pas-select"
              value={selectedCutId}
              onChange={(event) => setSelectedCutId(event.currentTarget.value)}
            >
              {DEMO_TARGET_CUTS.map((cut) => (
                <option key={cut.cutId} value={cut.cutId}>
                  {cut.cutLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="pas-control-row" role="group" aria-label="컷 전용 조명 프리셋">
            <span className="pas-metric-label">
              <SunMedium size={13} aria-hidden="true" /> 컷 조명
            </span>
            {CUT_LIGHTING_PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="pas-chip-btn"
                aria-pressed={lightingPresetId === id}
                data-testid={`pas-6pass-lighting-${id}`}
                onClick={() => setLightingPresetId(id)}
              >
                {CUT_LIGHTING_PRESETS[id].labelKo}
              </button>
            ))}
          </div>

          <p className="pas-card-desc pas-num">
            6패스 요약: 외곽선 {sixPassPlan.pass1SilhouetteOutline.strokeWidthPx}px · 내부선{" "}
            {sixPassPlan.pass2CreaseInterior.strokeWidthPx}px · 17노드 LUT 중간 게인(R{" "}
            {lutPreviewMid?.rGain ?? 1} / G {lutPreviewMid?.gGain ?? 1} / B {lutPreviewMid?.bGain ?? 1})
          </p>

          <div className="pas-control-row">
            <button
              type="button"
              data-variant="primary"
              data-testid="pas-6pass-apply-override-btn"
              className="pas-btn"
              onClick={handleOneClickApplyOverride}
            >
              <Layers size={15} aria-hidden="true" />
              1클릭 6패스 동기화 · 컷 오버라이드 기록
            </button>
            <button
              type="button"
              data-testid="pas-6pass-clear-override-btn"
              className="pas-btn"
              onClick={handleClearOverride}
            >
              이 컷 오버라이드 해제
            </button>
          </div>

          <p className="pas-metric-label pas-num" data-testid="pas-6pass-override-summary">
            비파괴 기록 횟수 {appliedCount}회 · 공유 3D 재질 변경 0건 · 활성 컷 오버라이드{" "}
            {Object.keys(overrideStore.overridesByCutId).length}개
          </p>
        </div>
      </div>

      <div className="pas-cut-grid" data-testid="pas-6pass-cut-overrides-grid">
        {cutRenderStates.map(({ cutId, cutLabel, state }) => (
          <article key={cutId} className="pas-cut-card" data-testid={`pas-6pass-cut-state-${cutId}`}>
            <div className="pas-cut-head">
              <strong className="pas-card-title">{cutLabel}</strong>
              <span
                className="pas-badge"
                data-tone={state.activeOverride ? "good" : "warn"}
              >
                {state.activeOverride
                  ? `컷 오버라이드 v${state.activeOverride.revision}`
                  : "공유 3D 원본 유지"}
              </span>
            </div>
            <p className="pas-card-desc pas-num">
              조명: {state.effectiveLightingLabelKo} · 블러 {state.effectiveGaussianBlurPx}px · 원본 재질 해시{" "}
              {state.materialsIntegrityHash}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
