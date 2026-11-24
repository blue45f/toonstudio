/**
 * 3D 캐릭터 원본 VRM 재질 DNA 자동 상속(Auto-Shader Transfer) & 3단 깊이/3점 리라이팅 패널.
 *
 * - props 없이 단독 렌더링 가능하며 원본 VRM 텍스처·MToon DNA 샘플링, 교체 파츠 4종 이식 전/후 ΔE00 실측 비교,
 *   2D 캔버스 합성용 전경·캐릭터·배경 3단 깊이 레이어 분리 토글과 3점 조명 리라이팅 맵을 실시간 제어한다.
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건 · Web Storage 미사용 · KO/EN).
 */

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  Palette,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Wand2,
} from "lucide-react";
import { useCallback, useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  buildDepthRelightingForVrmDna,
  DEFAULT_DEPTH_SLICE_CONFIG,
  DEFAULT_RAW_REPLACEMENT_PARTS,
  extractVrmMaterialDna,
  formatOklchCss,
  transferVrmShaderDnaToParts,
  VRM_DNA_PRESET_SOURCES,
  type DepthAndRelightingCompositeResult,
  type DepthSliceLayerId,
  type DepthSliceVisibility,
  type OklchColor,
  type ShaderHarmonyGrade,
  type ShadowTemperatureClass,
  type VrmBatchShaderTransferReport,
  type VrmCharacterDnaSource,
  type VrmDnaPresetId,
  type VrmPartShaderTransferResult,
  type VrmRawPartMaterialInput,
} from "./vrm-auto-shader-transfer";

export interface StudioVrmAutoShaderTransferPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialPresetId?: VrmDnaPresetId;
  readonly initialHarmonyStrength?: number;
  readonly customSource?: VrmCharacterDnaSource;
  readonly customParts?: readonly VrmRawPartMaterialInput[];
  readonly onTransferComplete?: (report: VrmBatchShaderTransferReport) => void;
  readonly onDepthRelightingChange?: (result: DepthAndRelightingCompositeResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const PRESET_LIST: readonly { readonly id: VrmDnaPresetId; readonly ko: string; readonly en: string }[] = [
  { id: "pastel-atelier", ko: "파스텔 아틀리에", en: "Pastel Atelier" },
  { id: "sunset-drama", ko: "석양 로맨스", en: "Golden Hour" },
  { id: "cyber-noir", ko: "네온 누아르", en: "Noir Midnight" },
];

const DEPTH_LAYER_META: readonly {
  readonly id: DepthSliceLayerId;
  readonly ko: string;
  readonly en: string;
  readonly barClass: string;
}[] = [
  { id: "foreground", ko: "전경 레이어", en: "Foreground Slice", barClass: "bg-accent" },
  { id: "character", ko: "캐릭터 본체", en: "Character Slice", barClass: "bg-cool" },
  { id: "background", ko: "배경 레이어", en: "Background Slice", barClass: "bg-raised" },
];

function formatOklchCompact(c: OklchColor): string {
  return `L ${c.l.toFixed(2)} · C ${c.c.toFixed(3)} · H ${c.h.toFixed(0)}°`;
}

function gradeBadgeClass(grade: ShaderHarmonyGrade): string {
  if (grade === "harmonized") return "border-good/40 bg-good-soft text-good";
  if (grade === "acceptable") return "border-warn/40 bg-warning-soft text-warn";
  return "border-bad/40 bg-bad-soft text-bad";
}

function gradeLabel(grade: ShaderHarmonyGrade, isEn: boolean): string {
  if (grade === "harmonized") return isEn ? "Harmonized" : "톤 조화 완료";
  if (grade === "acceptable") return isEn ? "Acceptable" : "허용 범위";
  return isEn ? "Needs Tuning" : "조정 필요";
}

function tempLabel(tempClass: ShadowTemperatureClass, isEn: boolean): string {
  if (tempClass === "cool") return isEn ? "Cool Tint" : "한색 그림자";
  if (tempClass === "warm") return isEn ? "Warm Tint" : "난색 그림자";
  return isEn ? "Neutral Tint" : "중성 그림자";
}

function shaderTag(shader: VrmPartShaderTransferResult["sourceShaderType"], isEn: boolean): string {
  if (shader === "pbr-standard") return isEn ? "Raw PBR" : "원시 PBR";
  if (shader === "pbr-physical") return isEn ? "Physical PBR" : "물리 PBR";
  if (shader === "foreign-mtoon") return isEn ? "Foreign MToon" : "타 MToon";
  return isEn ? "Unlit Basic" : "무광 Basic";
}

/** 원본 VRM 재질 DNA 자동 상속 및 3단 깊이/3점 리라이팅 단독 스튜디오 패널. */
export function StudioVrmAutoShaderTransferPanel({
  locale,
  className = "",
  initialPresetId = "pastel-atelier",
  initialHarmonyStrength = 0.85,
  customSource,
  customParts,
  onTransferComplete,
  onDepthRelightingChange,
}: StudioVrmAutoShaderTransferPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [presetId, setPresetId] = useState<VrmDnaPresetId>(initialPresetId);
  const [sampleRevision, setSampleRevision] = useState<number>(1);
  const [harmonyStrength, setHarmonyStrength] = useState<number>(initialHarmonyStrength);
  const [inheritHairAngelRing, setInheritHairAngelRing] = useState<boolean>(true);
  const [lockLightDirection, setLockLightDirection] = useState<boolean>(true);
  const [selectedPartId, setSelectedPartId] = useState<string>(DEFAULT_RAW_REPLACEMENT_PARTS[0]?.partId ?? "");

  const [visibility, setVisibility] = useState<DepthSliceVisibility>(DEFAULT_DEPTH_SLICE_CONFIG.visibility);
  const [nearCutZ, setNearCutZ] = useState<number>(DEFAULT_DEPTH_SLICE_CONFIG.nearCutZ);
  const [farCutZ, setFarCutZ] = useState<number>(DEFAULT_DEPTH_SLICE_CONFIG.farCutZ);
  const [rimGain, setRimGain] = useState<number>(0.72);

  const activeSource = customSource ?? VRM_DNA_PRESET_SOURCES[presetId];
  const activeParts = customParts ?? DEFAULT_RAW_REPLACEMENT_PARTS;

  const dna = useMemo(() => {
    void sampleRevision;
    return extractVrmMaterialDna(activeSource);
  }, [activeSource, sampleRevision]);

  const transferReport = useMemo<VrmBatchShaderTransferReport>(
    () =>
      transferVrmShaderDnaToParts(dna, activeParts, {
        toneHarmonyStrength: harmonyStrength,
        inheritHairAngelRing,
        lockLightDirection,
      }),
    [activeParts, dna, harmonyStrength, inheritHairAngelRing, lockLightDirection],
  );

  const selectedPart = useMemo<VrmPartShaderTransferResult | undefined>(() => {
    return transferReport.partResults.find((item) => item.partId === selectedPartId) ?? transferReport.partResults[0];
  }, [selectedPartId, transferReport.partResults]);

  const depthRelighting = useMemo<DepthAndRelightingCompositeResult>(
    () =>
      buildDepthRelightingForVrmDna(dna, {
        resolution: 32,
        rimIntensity: rimGain,
        sliceConfig: {
          nearCutZ,
          farCutZ,
          visibility,
        },
      }),
    [dna, farCutZ, nearCutZ, rimGain, visibility],
  );

  const handleResampleDna = useCallback(() => {
    setSampleRevision((prev) => prev + 1);
    const freshDna = extractVrmMaterialDna(activeSource);
    const freshReport = transferVrmShaderDnaToParts(freshDna, activeParts, {
      toneHarmonyStrength: harmonyStrength,
      inheritHairAngelRing,
      lockLightDirection,
    });
    onTransferComplete?.(freshReport);
  }, [activeParts, activeSource, harmonyStrength, inheritHairAngelRing, lockLightDirection, onTransferComplete]);

  const handleToggleLayer = useCallback(
    (layerId: DepthSliceLayerId) => {
      setVisibility((prev) => {
        const next: DepthSliceVisibility = { ...prev, [layerId]: !prev[layerId] };
        const freshDepth = buildDepthRelightingForVrmDna(dna, {
          resolution: 32,
          rimIntensity: rimGain,
          sliceConfig: { nearCutZ, farCutZ, visibility: next },
        });
        onDepthRelightingChange?.(freshDepth);
        return next;
      });
    },
    [dna, farCutZ, nearCutZ, onDepthRelightingChange, rimGain],
  );

  const harmonySliderId = `${uid}-harmony`;
  const nearCutId = `${uid}-near-cut`;
  const farCutId = `${uid}-far-cut`;
  const rimGainId = `${uid}-rim-gain`;

  return (
    <section
      data-testid="vrm-auto-shader-transfer-panel"
      aria-label={pick("VRM 재질 DNA 자동 상속 및 깊이 리라이팅", "VRM Auto-Shader DNA Transfer and Depth Relighting")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Wand2 className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("VRM 재질 DNA 자동 상속 · 깊이 리라이팅", "VRM Shader DNA Transfer · Depth Relighting")}
            </h2>
            <span
              data-testid="vrm-dna-harmony-badge"
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                transferReport.allHarmonized
                  ? "border-good/40 bg-good-soft text-good"
                  : "border-warn/40 bg-warning-soft text-warn"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(
                `평균 ΔE00 -${transferReport.meanImprovementPercent.toFixed(1)}%`,
                `Mean ΔE00 -${transferReport.meanImprovementPercent.toFixed(1)}%`,
              )}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "원본 VRM 텍스처·MToon DNA를 교체 파츠에 자동 이식하고 2D 합성용 3단 Z-슬라이스·3점 조명 맵을 생성합니다.",
              "Samples source VRM texture and MToon DNA onto swapped parts, plus 3-tier Z-slice depth masks and 3-point relighting maps.",
            )}
          </p>
        </div>

        <button
          type="button"
          data-testid="vrm-dna-resample-btn"
          className={BTN_PRIMARY}
          onClick={handleResampleDna}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("원본 DNA 재샘플링", "Resample VRM DNA")}
        </button>
      </header>

      {/* 1. 원본 VRM DNA 샘플링 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-dna-source-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("① 원본 VRM 재질 DNA 프로파일", "1. Source VRM Material DNA Profile")}</span>
          </div>
          <span data-testid="vrm-dna-sample-meta" className="text-xs text-fg-2 tabular-nums">
            {pick(
              `${dna.sourceNameKo} · 슬롯 ${dna.sampledMaterialCount} · ${dna.sampledTexturePixelCount}px · #${sampleRevision}`,
              `${dna.sourceNameEn} · ${dna.sampledMaterialCount} slots · ${dna.sampledTexturePixelCount}px · #${sampleRevision}`,
            )}
          </span>
        </div>

        {!customSource ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("원본 VRM 캐릭터 선택", "Select Source VRM Character")}>
            {PRESET_LIST.map((preset) => {
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`vrm-dna-preset-${preset.id}`}
                  onClick={() => setPresetId(preset.id)}
                  className={`${CHIP_BASE} ${
                    active ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg"
                  }`}
                >
                  {isEn ? preset.en : preset.ko}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="vrm-dna-dominant-oklch-grid">
          {(
            [
              { key: "skin", ko: "피부 주조 OKLCH", en: "Skin OKLCH", sample: dna.dominantColors.skin },
              { key: "hair", ko: "원본 헤어 OKLCH", en: "Source Hair OKLCH", sample: dna.dominantColors.hair },
              { key: "outfit", ko: "의상 주조 OKLCH", en: "Outfit OKLCH", sample: dna.dominantColors.outfit },
            ] as const
          ).map((item) => (
            <div
              key={item.key}
              data-testid={`vrm-dna-swatch-${item.key}`}
              className="flex items-center gap-2.5 rounded-md border border-line bg-raised p-2.5"
            >
              <span
                aria-hidden="true"
                className="h-8 w-8 shrink-0 rounded-md border border-line-strong"
                style={{ backgroundColor: formatOklchCss(item.sample.oklch) }}
              />
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-fg">{isEn ? item.en : item.ko}</div>
                <div className="text-[11px] text-fg-2 tabular-nums">{formatOklchCompact(item.sample.oklch)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-dna-shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-fg">{pick("그림자 색온도 틴트", "Shadow Temperature Tint")}</span>
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-sm border border-line-strong"
                style={{ backgroundColor: formatOklchCss(dna.shadowTint.tintOklch) }}
              />
            </div>
            <div className="font-semibold text-accent tabular-nums">
              {`${dna.shadowTint.temperatureKelvin} K · ${tempLabel(dna.shadowTint.temperatureClass, isEn)}`}
            </div>
            <div className="text-[11px] text-fg-2 tabular-nums">
              {`ΔH ${dna.shadowTint.hueShiftDeg > 0 ? "+" : ""}${dna.shadowTint.hueShiftDeg.toFixed(1)}° · ΔL -${dna.shadowTint.lightnessDrop.toFixed(2)}`}
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-dna-outline-card">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-fg">{pick("셀 경계 · 외곽선", "Cel Step · Outline")}</span>
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-sm border border-line-strong"
                style={{ backgroundColor: formatOklchCss(dna.outline.colorOklch) }}
              />
            </div>
            <div className="font-semibold text-fg tabular-nums">
              {`Toony ${dna.celShading.shadingToonyFactor.toFixed(2)} · Shift ${dna.celShading.shadingShiftFactor.toFixed(2)}`}
            </div>
            <div className="text-[11px] text-fg-2 tabular-nums">
              {pick(
                `두께 ${(dna.outline.widthFactor * 1000).toFixed(2)} mm · 조명혼합 ${Math.round(dna.outline.lightingMixFactor * 100)}%`,
                `Width ${(dna.outline.widthFactor * 1000).toFixed(2)} mm · Mix ${Math.round(dna.outline.lightingMixFactor * 100)}%`,
              )}
            </div>
          </div>

          <div className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-xs" data-testid="vrm-dna-rim-card">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-fg">{pick("림 프레넬 · 엔젤링 · 주광", "Rim Fresnel · Angel Ring")}</span>
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-sm border border-line-strong"
                style={{ backgroundColor: formatOklchCss(dna.rimLight.colorOklch) }}
              />
            </div>
            <div className="font-semibold text-fg tabular-nums">
              {`Fresnel ${dna.rimLight.fresnelPower.toFixed(1)} · Ring ${Math.round(dna.angelRing.intensity * 100)}%`}
            </div>
            <div className="text-[11px] text-fg-2 tabular-nums">
              {pick(
                `주광 방위 ${dna.lightAzimuthDeg.toFixed(0)}° · 고도 ${dna.lightElevationDeg.toFixed(0)}°`,
                `Key Az ${dna.lightAzimuthDeg.toFixed(0)}° · El ${dna.lightElevationDeg.toFixed(0)}°`,
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 파츠별 DNA 자동 이식 & ΔE00 실측 비교 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-dna-parts-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("② 교체 파츠 DNA 이식 · 이식 전/후 ΔE00 실측", "2. Swapped Part DNA Transfer · Before/After ΔE00")}</span>
          </div>
          <div
            data-testid="vrm-dna-aggregate-deltae"
            className="rounded-md border border-line bg-raised px-2.5 py-1 text-xs font-semibold text-fg tabular-nums"
          >
            {`ΔE00 ${transferReport.meanBeforeDeltaE00.toFixed(2)} → ${transferReport.meanAfterDeltaE00.toFixed(2)} (-${transferReport.meanImprovementPercent.toFixed(1)}%)`}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised p-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={harmonySliderId} className="flex items-center justify-between text-xs font-medium text-fg">
              <span>{pick("톤 조화 강도", "Tone Harmony")}</span>
              <span className="tabular-nums text-accent">{`${Math.round(harmonyStrength * 100)}%`}</span>
            </label>
            <input
              id={harmonySliderId}
              data-testid="vrm-dna-harmony-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(harmonyStrength * 100)}
              onChange={(event) => setHarmonyStrength(Number(event.target.value) / 100)}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>

          <button
            type="button"
            aria-pressed={inheritHairAngelRing}
            data-testid="vrm-dna-angel-ring-toggle"
            onClick={() => setInheritHairAngelRing((v) => !v)}
            className={`${CHIP_BASE} ${
              inheritHairAngelRing ? "border-accent bg-accent-soft text-fg" : "border-line bg-canvas text-fg-2"
            }`}
          >
            {pick(
              `헤어 엔젤링 상속: ${inheritHairAngelRing ? "켜짐" : "꺼짐"}`,
              `Hair Angel Ring: ${inheritHairAngelRing ? "ON" : "OFF"}`,
            )}
          </button>

          <button
            type="button"
            aria-pressed={lockLightDirection}
            data-testid="vrm-dna-light-lock-toggle"
            onClick={() => setLockLightDirection((v) => !v)}
            className={`${CHIP_BASE} ${
              lockLightDirection ? "border-accent bg-accent-soft text-fg" : "border-line bg-canvas text-fg-2"
            }`}
          >
            {pick(
              `주광 방향 일치 잠금: ${lockLightDirection ? "켜짐" : "꺼짐"}`,
              `Lock Key Light Dir: ${lockLightDirection ? "ON" : "OFF"}`,
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="vrm-dna-part-list">
          {transferReport.partResults.map((part) => {
            const active = selectedPart?.partId === part.partId;
            return (
              <button
                key={part.partId}
                type="button"
                aria-pressed={active}
                data-testid={`vrm-dna-part-card-${part.partId}`}
                onClick={() => setSelectedPartId(part.partId)}
                className={`flex min-h-11 w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  active ? "border-accent bg-accent-soft/50" : "border-line bg-raised hover:border-line-strong"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg">{isEn ? part.labelEn : part.labelKo}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gradeBadgeClass(part.harmonyGrade)}`}
                  >
                    {gradeLabel(part.harmonyGrade, isEn)}
                  </span>
                </div>

                <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-sm border border-line-strong"
                      style={{ backgroundColor: formatOklchCss(part.rawBaseOklch) }}
                    />
                    <span className="text-fg-3">→</span>
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-sm border border-line-strong"
                      style={{ backgroundColor: formatOklchCss(part.transferred.baseColorOklch) }}
                    />
                    <span className="text-[11px] text-fg-2">{`${shaderTag(part.sourceShaderType, isEn)} → MToon DNA`}</span>
                  </div>

                  <span className="font-semibold text-good" data-testid={`vrm-dna-part-deltae-${part.partId}`}>
                    {`ΔE00 ${part.beforeDeltaE00.compositeDeltaE00.toFixed(2)} → ${part.afterDeltaE00.compositeDeltaE00.toFixed(2)}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedPart ? (
          <div
            data-testid="vrm-dna-selected-part-detail"
            className="grid grid-cols-2 gap-2 rounded-md border border-line bg-raised p-2.5 text-xs tabular-nums sm:grid-cols-4"
          >
            <div>
              <div className="text-fg-3">{pick("리트 베이스 ΔE00", "Lit Base ΔE00")}</div>
              <div className="font-semibold text-fg">
                {`${selectedPart.beforeDeltaE00.litBaseDeltaE00.toFixed(2)} → ${selectedPart.afterDeltaE00.litBaseDeltaE00.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("그림자 색온도 ΔE00", "Shadow Tint ΔE00")}</div>
              <div className="font-semibold text-fg">
                {`${selectedPart.beforeDeltaE00.shadowToneDeltaE00.toFixed(2)} → ${selectedPart.afterDeltaE00.shadowToneDeltaE00.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("외곽선·셀 오차", "Outline · Cel Err")}</div>
              <div className="font-semibold text-good">
                {`${(selectedPart.afterOutlineWidthDelta * 1000).toFixed(2)} mm · ${selectedPart.afterCelBoundaryError.toFixed(3)}`}
              </div>
            </div>
            <div>
              <div className="text-fg-3">{pick("광원 정렬 · 엔젤링", "Light Align · Ring")}</div>
              <div className="font-semibold text-fg">
                {`cos ${selectedPart.afterLightAlignmentCosine.toFixed(3)} · ${Math.round(selectedPart.transferred.angelRingIntensity * 100)}%`}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 3. 2D 캔버스 합성용 3단 깊이 분리 + 3점 조명 리라이팅 맵 */}
      <div className="space-y-3 rounded-lg border border-line bg-card p-3" data-testid="vrm-dna-depth-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Layers className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
            <span>{pick("③ 2D 캔버스 3단 깊이 분리 · 3점 조명 리라이팅 맵", "3. 2D Canvas 3-Tier Depth Slices · 3-Point Relighting Map")}</span>
          </div>
          <span data-testid="vrm-dna-active-layers-summary" className="text-xs font-semibold text-fg-2 tabular-nums">
            {pick(
              `활성 Z-레이어 ${depthRelighting.activeLayerCount}/3 · 합성 커버리지 ${(depthRelighting.activeCoverageRatio * 100).toFixed(1)}%`,
              `Active Z-Layers ${depthRelighting.activeLayerCount}/3 · Coverage ${(depthRelighting.activeCoverageRatio * 100).toFixed(1)}%`,
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="vrm-dna-depth-toggles">
          {DEPTH_LAYER_META.map((meta) => {
            const slice = depthRelighting.layers[meta.id];
            const active = slice.visible;
            const ToggleIcon = active ? Eye : EyeOff;
            return (
              <button
                key={meta.id}
                type="button"
                aria-pressed={active}
                data-testid={`vrm-dna-depth-toggle-${meta.id}`}
                onClick={() => handleToggleLayer(meta.id)}
                className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  active ? "border-accent bg-raised text-fg" : "border-line bg-canvas text-fg-3 opacity-75"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2 text-xs font-semibold">
                  <span>{isEn ? meta.en : meta.ko}</span>
                  <ToggleIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                </div>
                <div className="flex w-full items-center justify-between text-[11px] text-fg-2 tabular-nums">
                  <span>{`Z ${slice.zRange[0].toFixed(2)}–${slice.zRange[1].toFixed(2)}`}</span>
                  <span>{`${(slice.coverageRatio * 100).toFixed(1)}%`}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 3단 Z-슬라이스 점유 시각화 바 */}
        <div
          aria-label={pick("3단 깊이 레이어 비율", "Three-tier depth slice ratio")}
          className="flex h-2.5 w-full overflow-hidden rounded-full border border-line bg-canvas"
        >
          {DEPTH_LAYER_META.map((meta) => {
            const slice = depthRelighting.layers[meta.id];
            const widthPct = Math.max(0, slice.coverageRatio * 100);
            return (
              <div
                key={meta.id}
                className={`${meta.barClass} transition-opacity motion-reduce:transition-none ${slice.visible ? "opacity-100" : "opacity-20"}`}
                style={{ width: `${widthPct.toFixed(2)}%` }}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised p-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor={nearCutId} className="flex items-center justify-between text-xs text-fg">
              <span>{pick("전경/캐릭터 경계 Z", "Foreground Cut Z")}</span>
              <span className="tabular-nums text-fg-2">{nearCutZ.toFixed(2)}</span>
            </label>
            <input
              id={nearCutId}
              data-testid="vrm-dna-near-cut-slider"
              type="range"
              min={15}
              max={55}
              step={1}
              value={Math.round(nearCutZ * 100)}
              onChange={(event) => {
                const next = Number(event.target.value) / 100;
                setNearCutZ(Math.min(next, farCutZ - 0.1));
              }}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={farCutId} className="flex items-center justify-between text-xs text-fg">
              <span>{pick("캐릭터/배경 경계 Z", "Background Cut Z")}</span>
              <span className="tabular-nums text-fg-2">{farCutZ.toFixed(2)}</span>
            </label>
            <input
              id={farCutId}
              data-testid="vrm-dna-far-cut-slider"
              type="range"
              min={45}
              max={88}
              step={1}
              value={Math.round(farCutZ * 100)}
              onChange={(event) => {
                const next = Number(event.target.value) / 100;
                setFarCutZ(Math.max(next, nearCutZ + 0.1));
              }}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={rimGainId} className="flex items-center justify-between text-xs text-fg">
              <span>{pick("3점 림라이트 강도", "3-Point Rim Gain")}</span>
              <span className="tabular-nums text-fg-2">{`${Math.round(rimGain * 100)}%`}</span>
            </label>
            <input
              id={rimGainId}
              data-testid="vrm-dna-rim-gain-slider"
              type="range"
              min={0}
              max={150}
              step={5}
              value={Math.round(rimGain * 100)}
              onChange={(event) => setRimGain(Number(event.target.value) / 100)}
              className="w-full accent-[var(--color-accent)]"
            />
          </div>
        </div>

        <div
          data-testid="vrm-dna-relighting-metrics"
          className="grid grid-cols-2 gap-2 rounded-md border border-line bg-raised p-2.5 text-xs tabular-nums sm:grid-cols-4"
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-fg-3">
              <Sun className="h-3 w-3 text-accent" aria-hidden="true" />
              <span>{pick("Key / Fill 대비비", "Key / Fill Ratio")}</span>
            </div>
            <div className="font-semibold text-fg">{`${depthRelighting.relighting.metrics.keyFillContrastRatio.toFixed(2)}×`}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-fg-3">{pick("림 프레넬 커버리지", "Rim Fresnel Area")}</div>
            <div className="font-semibold text-fg">{`${(depthRelighting.relighting.metrics.rimCoverageRatio * 100).toFixed(1)}%`}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-fg-3">{pick("주광 방향 정렬도", "Key Dir Alignment")}</div>
            <div className="font-semibold text-good">{`cos ${depthRelighting.relighting.metrics.lightDirectionAlignmentCosine.toFixed(3)}`}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-fg-3">{pick("리라이팅 평균 휘도", "Relit Luminance")}</div>
            <div className="font-semibold text-fg">{depthRelighting.relighting.metrics.meanRelitLuminance.toFixed(3)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
