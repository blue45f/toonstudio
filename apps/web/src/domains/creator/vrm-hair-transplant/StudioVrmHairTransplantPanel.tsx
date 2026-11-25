/**
 * 크로스 VRM 실물 아티스트 헤어 이식 · 두개골 정렬 · 본 웨이트 히트바 · MToon ΔE00 조화 패널.
 *
 * - props 없이 단독 렌더링 가능하며 내장 쇼케이스 VRM 5종의 실물 헤어 이식 계획을 실시간 계산한다.
 * - 라이브 `donorVrm` / `targetVrm`을 전달하면 원클릭으로 실제 3D 이식 및 원복(`dispose`)까지 수행한다.
 * - Calm Atelier 시맨틱 토큰 전용 · 원시 색 리터럴 0건 · Web Storage 0건 · KO/EN.
 */

import {
  CheckCircle2,
  Compass,
  GitBranch,
  Layers,
  Palette,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { formatOklchCss, type OklchColor } from "../vrm-auto-shader-transfer/color-science-oklch";

import {
  DONOR_HAIR_CATALOG,
  TARGET_HEAD_PROPORTION_PRESETS,
  type HairHarmonyGrade,
  type HairTransplantDonorId,
  type TargetHeadProportionId,
  type VrmHairTransplantManifest,
  type VrmHairTransplantResultHandle,
  type VrmTransplantActorLike,
} from "./types";
import {
  buildHairTransplantManifest,
  getDonorHairCatalogEntry,
  transplantVrmHair,
} from "./vrm-hair-transplant-engine";

export interface StudioVrmHairTransplantPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialDonorId?: HairTransplantDonorId;
  readonly initialTargetProportionId?: TargetHeadProportionId;
  readonly donorVrm?: VrmTransplantActorLike | null;
  readonly targetVrm?: VrmTransplantActorLike | null;
  readonly onPlanCalculated?: (manifest: VrmHairTransplantManifest) => void;
  /** 연결된 VRM의 실제 이식이 성공한 경우에만 계획 설정을 전달한다. */
  readonly onApplyTransplant?: (manifest: VrmHairTransplantManifest) => void;
  readonly onLiveHandleChange?: (handle: VrmHairTransplantResultHandle | null) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_GHOST = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:text-fg ${FOCUS_RING} [word-break:keep-all]`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

function formatOklchCompact(color: OklchColor): string {
  return `L ${color.l.toFixed(2)} · C ${color.c.toFixed(3)} · H ${color.h.toFixed(0)}°`;
}

function formatSignedMm(mm: number): string {
  const sign = mm > 0 ? "+" : "";
  return `${sign}${mm.toFixed(1)} mm`;
}

function gradeBadgeClass(grade: HairHarmonyGrade): string {
  if (grade === "harmonized") return "border-good/40 bg-good-soft text-good";
  if (grade === "acceptable") return "border-warn/40 bg-warning-soft text-warn";
  return "border-bad/40 bg-bad-soft text-bad";
}

function gradeLabel(grade: HairHarmonyGrade, isEn: boolean): string {
  if (grade === "harmonized") return isEn ? "MToon Harmonized" : "MToon 조화 완료";
  if (grade === "acceptable") return isEn ? "Acceptable Tone" : "허용 색차";
  return isEn ? "Needs Tuning" : "톤 보정 권장";
}

/** 크로스 VRM 실물 아티스트 헤어 이식 및 본 웨이트 재매핑 단독 스튜디오 패널. */
export function StudioVrmHairTransplantPanel({
  locale,
  className = "",
  initialDonorId = "lumi-long-straight",
  initialTargetProportionId = "korean-webtoon-72",
  donorVrm = null,
  targetVrm = null,
  onPlanCalculated,
  onApplyTransplant,
  onLiveHandleChange,
}: StudioVrmHairTransplantPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [donorId, setDonorId] = useState<HairTransplantDonorId>(initialDonorId);
  const [targetProportionId, setTargetProportionId] =
    useState<TargetHeadProportionId>(initialTargetProportionId);
  const [offsetYMm, setOffsetYMm] = useState<number>(0);
  const [offsetZMm, setOffsetZMm] = useState<number>(0);
  const [scalePct, setScalePct] = useState<number>(100);
  const [scalpPinPct, setScalpPinPct] = useState<number>(18);
  const [tipSwayPct, setTipSwayPct] = useState<number>(90);
  const [harmonyPct, setHarmonyPct] = useState<number>(82);
  const [replaceOriginalHair, setReplaceOriginalHair] = useState<boolean>(true);
  const [enableOutlineMesh, setEnableOutlineMesh] = useState<boolean>(true);
  const [plannedManifest, setPlannedManifest] = useState<VrmHairTransplantManifest | null>(null);
  const [appliedManifest, setAppliedManifest] = useState<VrmHairTransplantManifest | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const hasLiveVrms = donorVrm !== null && targetVrm !== null;
  const liveTransplantActive = appliedManifest !== null;
  const completedManifest = appliedManifest ?? plannedManifest;

  const liveHandleRef = useRef<VrmHairTransplantResultHandle | null>(null);

  useEffect(() => {
    return () => {
      if (liveHandleRef.current && !liveHandleRef.current.isDisposed()) {
        liveHandleRef.current.dispose();
        liveHandleRef.current = null;
      }
    };
  }, []);

  const activeDonor = useMemo(() => getDonorHairCatalogEntry(donorId), [donorId]);

  const manifest = useMemo<VrmHairTransplantManifest>(() => {
    const scaleFactor = scalePct / 100;
    return buildHairTransplantManifest(donorId, targetProportionId, {
      manualOffsetMm: [0, offsetYMm, offsetZMm],
      manualScaleMultiplier: [scaleFactor, scaleFactor, scaleFactor],
      boneWeight: {
        scalpPinRadiusRatio: scalpPinPct / 100,
        maxTipSwayWeight: tipSwayPct / 100,
      },
      colorHarmony: {
        harmonyStrength: harmonyPct / 100,
        enableOutlineMesh,
      },
      replaceOriginalHair,
    });
  }, [
    donorId,
    enableOutlineMesh,
    harmonyPct,
    offsetYMm,
    offsetZMm,
    replaceOriginalHair,
    scalePct,
    scalpPinPct,
    targetProportionId,
    tipSwayPct,
  ]);

  const releaseLiveTransplant = useCallback(() => {
    const handle = liveHandleRef.current;
    liveHandleRef.current = null;
    if (handle) {
      if (!handle.isDisposed()) handle.dispose();
      onLiveHandleChange?.(null);
    }
    setAppliedManifest(null);
  }, [onLiveHandleChange]);

  const handleApplyTransplant = useCallback(() => {
    setLiveError(null);
    setPlannedManifest(null);
    releaseLiveTransplant();
    if (donorVrm && targetVrm) {
      try {
        const scaleFactor = scalePct / 100;
        const handle = transplantVrmHair(donorVrm, targetVrm, {
          replaceOriginalHair,
          manualOffsetMm: [0, offsetYMm, offsetZMm],
          manualScaleMultiplier: [scaleFactor, scaleFactor, scaleFactor],
          boneWeight: {
            scalpPinRadiusRatio: scalpPinPct / 100,
            maxTipSwayWeight: tipSwayPct / 100,
          },
          colorHarmony: {
            harmonyStrength: harmonyPct / 100,
            enableOutlineMesh,
          },
        });
        liveHandleRef.current = handle;
        onLiveHandleChange?.(handle);
      } catch (err) {
        setLiveError(
          err instanceof Error
            ? err.message
            : isEn
              ? "Transplant failed."
              : "이식 실행에 실패했습니다.",
        );
        return;
      }
      setAppliedManifest(manifest);
      onApplyTransplant?.(manifest);
    } else {
      setPlannedManifest(manifest);
      onPlanCalculated?.(manifest);
    }
  }, [
    donorVrm,
    enableOutlineMesh,
    harmonyPct,
    isEn,
    manifest,
    offsetYMm,
    offsetZMm,
    onApplyTransplant,
    onLiveHandleChange,
    onPlanCalculated,
    releaseLiveTransplant,
    replaceOriginalHair,
    scalePct,
    scalpPinPct,
    targetVrm,
    tipSwayPct,
  ]);

  const handleRollback = useCallback(() => {
    setLiveError(null);
    setPlannedManifest(null);
    releaseLiveTransplant();
  }, [releaseLiveTransplant]);

  const handleResetTuning = useCallback(() => {
    setOffsetYMm(0);
    setOffsetZMm(0);
    setScalePct(100);
    setScalpPinPct(18);
    setTipSwayPct(90);
    setHarmonyPct(82);
  }, []);

  const offsetYId = `${uid}-offset-y`;
  const offsetZId = `${uid}-offset-z`;
  const scaleId = `${uid}-scale`;
  const scalpPinId = `${uid}-scalp-pin`;
  const tipSwayId = `${uid}-tip-sway`;
  const harmonyId = `${uid}-harmony`;

  const precisionPass = manifest.alignment.maxLandmarkErrorMm < 0.5;
  const yawDeg = Math.round((manifest.alignment.yawCompensationRad * 180) / Math.PI);

  return (
    <section
      data-testid="vrm-hair-transplant-panel"
      aria-label={pick("크로스 VRM 실물 헤어 이식 엔진", "Cross-VRM Artist Hair Transplant Engine")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Scissors className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("크로스 VRM 실물 헤어 이식 · 본 웨이트 재매핑", "Cross-VRM Hair Transplant · Bone Re-Binding")}
            </h2>
            <span
              data-testid="vrm-hair-fit-precision-badge"
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                precisionPass
                  ? "border-good/40 bg-good-soft text-good"
                  : "border-warn/40 bg-warning-soft text-warn"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(
                `두개골 잔차 ${manifest.alignment.maxLandmarkErrorMm.toFixed(2)} mm`,
                `Skull Fit ${manifest.alignment.maxLandmarkErrorMm.toFixed(2)} mm`,
              )}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              hasLiveVrms ? "연결된 도너·타깃 VRM에 헤어 메시 정렬, 본 웨이트 재매핑, MToon 색조 보정을 적용합니다. 아래 프리셋은 계획 계산용입니다." : "내장 도너·타깃 프리셋으로 헤어 정렬·본 웨이트·색조 보정 계획을 계산합니다. 3D 씬에는 반영하지 않습니다.",
              hasLiveVrms ? "Applies hair alignment, skin weights, and MToon color tuning to the connected VRMs. Presets below are for planning." : "Calculates alignment, skin-weight, and color plans from built-in presets. No 3D scene is changed.",
            )}
          </p>
          <p data-testid="vrm-hair-physics-status" className="text-xs text-fg-2">
            {pick("본 웨이트와 체인 구성까지 지원합니다. SpringBone 물리 업데이트는 연결되지 않았습니다.", "Supports skin weights and bone-chain construction. SpringBone physics updates are not connected.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="vrm-hair-reset-tuning-btn"
            className={BTN_GHOST}
            onClick={handleResetTuning}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("보정 초기화", "Reset Tuning")}
          </button>
          <button
            type="button"
            data-testid="vrm-hair-apply-btn"
            className={BTN_PRIMARY}
            onClick={handleApplyTransplant}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {hasLiveVrms ? pick("실제 헤어 이식", "Apply Live Hair Transplant") : pick("이식 계획 계산", "Calculate Transplant Plan")}
          </button>
        </div>
      </header>

      {/* 1. 도너 VRM 실물 헤어 카탈로그 & 타깃 두상 비율 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-hair-catalog-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Scissors className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("① 계획용 도너 VRM 헤어 프리셋", "1. Donor VRM Hair Planning Presets")}</span>
          </div>
          <span className="text-xs text-fg-2 tabular-nums">
            {pick(
              `${activeDonor.vrmUrl} · VRM ${activeDonor.vrmVersion === "0" ? "0.x" : "1.0"} · 체인 ${activeDonor.hairMetrics.springChainCount}개`,
              `${activeDonor.vrmUrl} · VRM ${activeDonor.vrmVersion === "0" ? "0.x" : "1.0"} · ${activeDonor.hairMetrics.springChainCount} chains`,
            )}
          </span>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={pick("도너 VRM 헤어 스타일 선택", "Select Donor VRM Hair Style")}
        >
          {DONOR_HAIR_CATALOG.map((entry) => {
            const active = entry.id === donorId;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                data-testid={`vrm-hair-donor-${entry.id}`}
                onClick={() => setDonorId(entry.id)}
                className={`${CHIP_BASE} ${
                  active ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {isEn ? entry.styleLabelEn : entry.styleLabelKo}
              </button>
            );
          })}
        </div>

        <p className="rounded-md border border-line bg-raised px-3 py-2 text-xs text-fg-2">
          <strong className="font-semibold text-fg">
            {isEn ? activeDonor.styleLabelEn : activeDonor.styleLabelKo}
          </strong>
          {` — ${isEn ? activeDonor.silhouetteSummaryEn : activeDonor.silhouetteSummaryKo} `}
          <span className="tabular-nums text-fg">
            {pick(
              `(낙차 ${Math.round(activeDonor.hairMetrics.dropBelowHeadM * 100)} cm · 약 ${activeDonor.hairMetrics.triangleEstimate.toLocaleString()} tris)`,
              `(drop ${Math.round(activeDonor.hairMetrics.dropBelowHeadM * 100)} cm · ~${activeDonor.hairMetrics.triangleEstimate.toLocaleString()} tris)`,
            )}
          </span>
        </p>

        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-semibold text-fg">
            {pick("타깃 캐릭터 두상 비율", "Target Character Head Proportion")}
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={pick("타깃 두상 비율 선택", "Select Target Head Proportion")}
          >
            {TARGET_HEAD_PROPORTION_PRESETS.map((preset) => {
              const active = preset.id === targetProportionId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-hair-target-${preset.id}`}
                  onClick={() => setTargetProportionId(preset.id)}
                  className={`${CHIP_BASE} ${
                    active ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2 hover:text-fg"
                  }`}
                >
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. 두개골 맞춤 정렬 검사기 (Scale & Offset mm) */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-hair-skull-fit-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("② 두개골 5점 정렬 · 스케일/오프셋 (mm)", "2. Skull-to-Skull Alignment · Scale / Offset (mm)")}</span>
          </div>
          <span data-testid="vrm-hair-yaw-badge" className="text-xs font-medium text-fg-2 tabular-nums">
            {pick(`전방축 회전 보정 ${yawDeg}°`, `Forward Yaw Fix ${yawDeg}°`)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-hair-scale-telemetry">
            <div className="text-fg-2">{pick("이방성 두개골 배율 (X · Y · Z)", "Anisotropic Scale (X · Y · Z)")}</div>
            <div className="mt-1 font-semibold text-fg tabular-nums">
              {`${manifest.alignment.scale[0].toFixed(3)} × ${manifest.alignment.scale[1].toFixed(3)} × ${manifest.alignment.scale[2].toFixed(3)}`}
            </div>
          </div>

          <div className="rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-hair-offset-telemetry">
            <div className="text-fg-2">{pick("헤드 로컬 오프셋 (X · Y · Z)", "Head Local Offset (X · Y · Z)")}</div>
            <div className="mt-1 font-semibold text-fg tabular-nums">
              {`${formatSignedMm(manifest.alignment.offsetMm[0])} / ${formatSignedMm(manifest.alignment.offsetMm[1])} / ${formatSignedMm(manifest.alignment.offsetMm[2])}`}
            </div>
          </div>

          <div className="rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-hair-residual-telemetry">
            <div className="text-fg-2">{pick("정수리 · 폭 · 깊이 잔차", "Crown · Width · Depth Error")}</div>
            <div className="mt-1 font-semibold text-good tabular-nums">
              {`${manifest.alignment.crownResidualMm.toFixed(2)} / ${manifest.alignment.widthResidualMm.toFixed(2)} / ${manifest.alignment.depthResidualMm.toFixed(2)} mm`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised p-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={offsetYId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("수직 미세 보정 (Y)", "Vertical Offset (Y)")}</span>
              <span className="tabular-nums text-accent">{formatSignedMm(offsetYMm)}</span>
            </label>
            <input
              id={offsetYId}
              data-testid="vrm-hair-offset-y-slider"
              type="range"
              min={-20}
              max={20}
              step={1}
              value={offsetYMm}
              onChange={(event) => setOffsetYMm(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={offsetZId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("전후 미세 보정 (Z)", "Depth Offset (Z)")}</span>
              <span className="tabular-nums text-accent">{formatSignedMm(offsetZMm)}</span>
            </label>
            <input
              id={offsetZId}
              data-testid="vrm-hair-offset-z-slider"
              type="range"
              min={-20}
              max={20}
              step={1}
              value={offsetZMm}
              onChange={(event) => setOffsetZMm(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={scaleId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("볼륨 배율 보정", "Volume Scale Bias")}</span>
              <span className="tabular-nums text-accent">{`${scalePct}%`}</span>
            </label>
            <input
              id={scaleId}
              data-testid="vrm-hair-scale-slider"
              type="range"
              min={85}
              max={115}
              step={1}
              value={scalePct}
              onChange={(event) => setScalePct(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>
        </div>
      </div>

      {/* 3. 두피 → 모발 끝 본 웨이트 히트바 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-hair-weight-heatbar-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("③ 두피→끝단 본 웨이트 재매핑 히트바", "3. Root-to-Tip Bone Weight Heatbar")}</span>
          </div>
          <span
            data-testid="vrm-hair-weight-norm-badge"
            className="rounded-md border border-good/40 bg-good-soft px-2 py-0.5 text-xs font-semibold text-good tabular-nums"
          >
            {pick(
              `가중치 합 Σ=1.0000 · 두피 head ${Math.round(manifest.skinPreview.minScalpRootHeadWeight * 100)}% · 끝단 sway ${Math.round(manifest.skinPreview.meanTipSecondaryWeight * 100)}%`,
              `Σw=1.0000 · Scalp ${Math.round(manifest.skinPreview.minScalpRootHeadWeight * 100)}% · Tips ${Math.round(manifest.skinPreview.meanTipSecondaryWeight * 100)}%`,
            )}
          </span>
        </div>

        <div className="space-y-2" data-testid="vrm-hair-weight-bands">
          {manifest.skinPreview.weightBands.map((band) => {
            const headPct = Math.round(band.avgHeadWeight * 100);
            const swayPct = Math.round(band.avgSecondaryWeight * 100);
            return (
              <div
                key={band.bandIndex}
                data-testid={`vrm-hair-weight-band-${band.bandIndex}`}
                className="space-y-1 rounded-md border border-line bg-raised p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg">
                    {`${isEn ? band.labelEn : band.labelKo} (${Math.round(band.dropRangeRatio[0] * 100)}~${Math.round(band.dropRangeRatio[1] * 100)}%)`}
                  </span>
                  <span className="text-fg-2 tabular-nums">
                    {`head ${headPct}% · ${pick("보조 본", "secondary bones")} ${swayPct}%`}
                  </span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full bg-cool"
                    style={{ width: `${headPct}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${swayPct}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised p-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={scalpPinId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("두피 고정 구간 비율", "Scalp Root Pin Zone")}</span>
              <span className="tabular-nums text-accent">{`${scalpPinPct}%`}</span>
            </label>
            <input
              id={scalpPinId}
              data-testid="vrm-hair-scalp-pin-slider"
              type="range"
              min={10}
              max={30}
              step={2}
              value={scalpPinPct}
              onChange={(event) => setScalpPinPct(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={tipSwayId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("모발 끝단 보조 본 웨이트", "Tip Secondary Bone Weight")}</span>
              <span className="tabular-nums text-accent">{`${tipSwayPct}%`}</span>
            </label>
            <input
              id={tipSwayId}
              data-testid="vrm-hair-tip-sway-slider"
              type="range"
              min={65}
              max={100}
              step={5}
              value={tipSwayPct}
              onChange={(event) => setTipSwayPct(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>
        </div>
      </div>

      {/* 4. MToon ΔE00 컬러 조화 프리뷰 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-hair-mtoon-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("④ MToon DNA 색조 조화 · CIEDE2000 ΔE00 프리뷰", "4. MToon DNA Harmony · CIEDE2000 ΔE00")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              data-testid="vrm-hair-deltae-summary"
              className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-semibold text-fg tabular-nums"
            >
              {`ΔE00 ${manifest.mtoonHarmony.beforeDeltaE00.toFixed(2)} → ${manifest.mtoonHarmony.afterDeltaE00.toFixed(2)} (-${manifest.mtoonHarmony.improvementPercent.toFixed(1)}%)`}
            </span>
            <span
              data-testid="vrm-hair-harmony-grade"
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${gradeBadgeClass(manifest.mtoonHarmony.harmonyGrade)}`}
            >
              {gradeLabel(manifest.mtoonHarmony.harmonyGrade, isEn)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              {
                key: "donor",
                ko: "도너 원본 헤어 OKLCH",
                en: "Donor Hair OKLCH",
                color: manifest.mtoonHarmony.donorBaseOklch,
              },
              {
                key: "harmonized",
                ko: "보정 적용 베이스 OKLCH",
                en: "Harmonized Base OKLCH",
                color: manifest.mtoonHarmony.harmonizedBaseOklch,
              },
              {
                key: "shade",
                ko: "MToon 셰이드 DNA OKLCH",
                en: "MToon Shade DNA OKLCH",
                color: manifest.mtoonHarmony.harmonizedShadeOklch,
              },
            ] as const
          ).map((swatch) => (
            <div
              key={swatch.key}
              data-testid={`vrm-hair-swatch-${swatch.key}`}
              className="flex items-center gap-2.5 rounded-md border border-line bg-raised p-2.5"
            >
              <span
                aria-hidden="true"
                className="h-8 w-8 shrink-0 rounded-md border border-line-strong"
                style={{ backgroundColor: formatOklchCss(swatch.color) }}
              />
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-fg">{isEn ? swatch.en : swatch.ko}</div>
                <div className="text-[11px] text-fg-2 tabular-nums">{formatOklchCompact(swatch.color)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised p-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={harmonyId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("MToon 색조 조화 강도", "MToon Harmony Strength")}</span>
              <span className="tabular-nums text-accent">{`${harmonyPct}%`}</span>
            </label>
            <input
              id={harmonyId}
              data-testid="vrm-hair-harmony-slider"
              type="range"
              min={0}
              max={100}
              step={2}
              value={harmonyPct}
              onChange={(event) => setHarmonyPct(Number(event.target.value))}
              className={`w-full accent-accent ${FOCUS_RING}`}
            />
          </div>

          <button
            type="button"
            aria-pressed={replaceOriginalHair}
            data-testid="vrm-hair-replace-original-toggle"
            onClick={() => setReplaceOriginalHair((prev) => !prev)}
            className={`${CHIP_BASE} ${
              replaceOriginalHair ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2"
            }`}
          >
            {pick(
              `원본 헤어 숨김: ${replaceOriginalHair ? "켜짐" : "꺼짐"}`,
              `Hide Original Hair: ${replaceOriginalHair ? "ON" : "OFF"}`,
            )}
          </button>

          <button
            type="button"
            aria-pressed={enableOutlineMesh}
            data-testid="vrm-hair-outline-toggle"
            onClick={() => setEnableOutlineMesh((prev) => !prev)}
            className={`${CHIP_BASE} ${
              enableOutlineMesh ? "border-accent bg-accent-soft text-accent" : "border-line bg-canvas text-fg-2"
            }`}
          >
            {pick(
              `역면 외곽선 + vColor.rgb: ${enableOutlineMesh ? "켜짐" : "꺼짐"}`,
              `Outline + vColor.rgb: ${enableOutlineMesh ? "ON" : "OFF"}`,
            )}
          </button>
        </div>
      </div>

      {/* 5. 원클릭 이식 매니페스트 & 롤백 상태 */}
      <div className="space-y-2.5 rounded-lg border border-line bg-card p-3" data-testid="vrm-hair-manifest-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("⑤ 이식 계획과 실제 적용 상태", "5. Transplant Plan and Live Status")}</span>
          </div>
          <span data-testid="vrm-hair-manifest-signature" className="font-mono text-xs text-fg-2 tabular-nums">
            {manifest.createdSignature}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 rounded-md border border-line bg-raised p-2.5 text-xs sm:grid-cols-3">
          <div>
            <span className="text-fg-2">{pick("도너 → 타깃", "Donor → Target")}</span>
            <div className="mt-0.5 font-semibold text-fg">
              {`${manifest.donorStyleLabelKo} → ${manifest.targetLabelKo}`}
            </div>
          </div>
          <div>
            <span className="text-fg-2">{pick("계획된 본 체인 구성", "Planned Bone Chains")}</span>
            <div className="mt-0.5 font-semibold text-fg tabular-nums">
              {pick(
                `${manifest.skinPreview.springChainCount}구역 · 보조 본 ${manifest.skinPreview.secondaryBoneCount}개`,
                `${manifest.skinPreview.springChainCount} zones · ${manifest.skinPreview.secondaryBoneCount} bones`,
              )}
            </div>
          </div>
          <div>
            <span className="text-fg-2">{pick("MToon 셰이더 보증", "MToon Shader Guard")}</span>
            <div className="mt-0.5 font-semibold text-good tabular-nums">
              {`Toony ${manifest.mtoonHarmony.shadingToonyFactor.toFixed(2)} · vColor.rgb OK`}
            </div>
          </div>
        </div>

        {liveError ? (
          <div
            role="alert"
            data-testid="vrm-hair-live-error"
            className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-xs font-medium text-bad"
          >
            {liveError}
          </div>
        ) : null}

        {completedManifest ? (
          <div
            data-testid={liveTransplantActive ? "vrm-hair-applied-status" : "vrm-hair-plan-status"}
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-good/40 bg-good-soft px-3 py-2 text-xs text-good"
          >
            <div className="flex items-center gap-1.5 font-semibold tabular-nums">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {pick(
                  liveTransplantActive ? "연결된 VRM에 헤어 이식 완료 · 현재 3D 씬 반영됨" : `이식 계획 계산 완료 (${completedManifest.donorStyleLabelKo} · ${completedManifest.createdSignature}) · 3D 씬 미반영`,
                  liveTransplantActive ? "Hair transplanted to connected VRM · Live 3D scene updated" : `Transplant plan calculated (${completedManifest.createdSignature}) · No 3D scene changes`,
                )}
              </span>
            </div>
            <button
              type="button"
              data-testid="vrm-hair-rollback-btn"
              onClick={handleRollback}
              className={BTN_GHOST}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {liveTransplantActive ? pick("이식 원복", "Rollback Transplant") : pick("계획 지우기", "Clear Plan")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
