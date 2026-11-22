import { Check, Contrast, RefreshCw, SunMedium } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS,
  deriveCharacterLightSyncFromBg3dLighting,
  dispatchStudioBg3d2dCharacterLightSync,
  resolveStudioBg3d2dLightSyncPreset,
  type StudioBg3d2dCharacterLightSyncPayload,
  type StudioBg3d2dCharacterLightSyncResult,
  type StudioBg3d2dLightSyncPreset,
  type StudioBg3d2dRimBlendMode,
} from "./studio-bg3d-2d-character-light-sync";

import type { StudioBg3dLightingSettings } from "./studio-bg3d-scene-document";

export interface StudioBg3dCharacterLightSyncCardProps {
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly disabled?: boolean;
  readonly onUpdateLighting: (patch: Partial<StudioBg3dLightingSettings>) => void;
  readonly onUpdateExposure: (value: number) => void;
  readonly onCommitLightingHistory?: () => void;
  /** 1클릭 2D 캐릭터 광원 동기화 실행 시 최신 페이로드를 상위 에디터에 전달한다. */
  readonly onSync2dCharacterLight?: (payload: StudioBg3d2dCharacterLightSyncPayload) => void;
}

const COMPASS_SIZE = 48;
const COMPASS_CENTER = COMPASS_SIZE / 2;
const COMPASS_RADIUS = 18;

function blendModeLabel(mode: StudioBg3d2dRimBlendMode, copy: (ko: string, en: string) => string): string {
  switch (mode) {
    case "add":
      return copy("가산(add)", "Add");
    case "screen":
      return copy("스크린(screen)", "Screen");
    case "soft-light":
      return copy("소프트 라이트(soft-light)", "Soft Light");
  }
}

function gradientBarBackground(result: StudioBg3d2dCharacterLightSyncResult): string {
  const { shadow, midtone, highlight } = result.gradientMap;
  return `linear-gradient(90deg, ${shadow.color.srgbHex} 0%, ${midtone.color.srgbHex} 50%, ${highlight.color.srgbHex} 100%)`;
}

function buildResultSignature(result: StudioBg3d2dCharacterLightSyncResult): string {
  const { normalizedInput, rimLight, shadowCast, gradientMap } = result;
  return [
    normalizedInput.azimuthDeg,
    normalizedInput.elevationDeg,
    normalizedInput.colorTemperatureK,
    gradientMap.shadow.color.srgbHex,
    gradientMap.midtone.color.srgbHex,
    gradientMap.highlight.color.srgbHex,
    rimLight.blendMode,
    rimLight.thicknessPx,
    shadowCast.angleDeg,
  ].join("|");
}

function LightDirectionPreviewDiagram({
  result,
  label,
}: {
  readonly result: StudioBg3d2dCharacterLightSyncResult;
  readonly label: string;
}) {
  const rimX = COMPASS_CENTER + result.rimLight.vector2d.x * COMPASS_RADIUS;
  const rimY = COMPASS_CENTER + result.rimLight.vector2d.y * COMPASS_RADIUS;
  const shadowX = COMPASS_CENTER + result.shadowCast.direction2d.x * COMPASS_RADIUS;
  const shadowY = COMPASS_CENTER + result.shadowCast.direction2d.y * COMPASS_RADIUS;

  return (
    <svg
      width={COMPASS_SIZE}
      height={COMPASS_SIZE}
      viewBox={`0 0 ${COMPASS_SIZE} ${COMPASS_SIZE}`}
      role="img"
      aria-label={label}
      className="size-12 shrink-0 rounded-lg border border-line bg-panel"
    >
      <circle
        cx={COMPASS_CENTER}
        cy={COMPASS_CENTER}
        r={COMPASS_RADIUS}
        className="fill-none stroke-line"
        strokeWidth={1}
      />
      <line
        x1={COMPASS_CENTER}
        y1={COMPASS_CENTER}
        x2={shadowX}
        y2={shadowY}
        stroke={result.shadowCast.color.srgbHex}
        strokeWidth={2}
        strokeDasharray="3 2"
        strokeLinecap="round"
      />
      <line
        x1={COMPASS_CENTER}
        y1={COMPASS_CENTER}
        x2={rimX}
        y2={rimY}
        stroke={result.rimLight.color.srgbHex}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle
        cx={COMPASS_CENTER}
        cy={COMPASS_CENTER}
        r={3.5}
        className="fill-fg-2 stroke-panel"
        strokeWidth={1}
      />
      <circle
        cx={rimX}
        cy={rimY}
        r={4}
        fill={result.rimLight.color.srgbHex}
        className="stroke-line-strong"
        strokeWidth={1}
      />
    </svg>
  );
}

/**
 * 3D 배경 광원·색온도를 2D 캐릭터 3단계 그라데이션 맵·역광 림라이트·그림자 방향으로
 * 1클릭 동기화하는 BG3D 조명 스튜디오 연결 카드.
 */
export function StudioBg3dCharacterLightSyncCard({
  lighting,
  exposure,
  disabled = false,
  onUpdateLighting,
  onUpdateExposure,
  onCommitLightingHistory,
  onSync2dCharacterLight,
}: StudioBg3dCharacterLightSyncCardProps) {
  const copy = useBilingual("StudioBg3dCharacterLightSyncCard");
  const titleId = useId();
  const [lastSynced, setLastSynced] = useState<{
    readonly signature: string;
    readonly labelKo: string;
    readonly labelEn: string;
    readonly summaryKo: string;
    readonly summaryEn: string;
  } | null>(null);

  const activePreset = useMemo(
    () => resolveStudioBg3d2dLightSyncPreset(lighting, exposure),
    [lighting, exposure],
  );
  const syncResult = useMemo(
    () => deriveCharacterLightSyncFromBg3dLighting(lighting, exposure),
    [lighting, exposure],
  );
  const currentSignature = useMemo(() => buildResultSignature(syncResult), [syncResult]);
  const isSyncedWithCurrent = lastSynced?.signature === currentSignature;

  const handleApplyPreset = (preset: StudioBg3d2dLightSyncPreset) => {
    if (disabled) return;
    onUpdateLighting(preset.bg3dLighting);
    onUpdateExposure(preset.exposure);
    onCommitLightingHistory?.();
  };

  const handleOneClickSync = () => {
    if (disabled) return;
    const labelKo = activePreset
      ? `${activePreset.labelKo} ${activePreset.kelvinLabel}`
      : `현재 3D 씬 ${syncResult.normalizedInput.colorTemperatureK}K`;
    const labelEn = activePreset
      ? `${activePreset.labelEn} ${activePreset.kelvinLabel}`
      : `Live 3D scene ${syncResult.normalizedInput.colorTemperatureK}K`;
    const receipt = dispatchStudioBg3d2dCharacterLightSync(syncResult, {
      source: activePreset ? "preset" : "scene-3d",
      presetId: activePreset?.id ?? null,
      labelKo,
    });
    onSync2dCharacterLight?.(receipt.payload);
    setLastSynced({
      signature: currentSignature,
      labelKo,
      labelEn,
      summaryKo: `림 ${syncResult.rimLight.thicknessPx.toFixed(1)}px (${syncResult.rimLight.blendMode}) · 그림자 ${Math.round(syncResult.shadowCast.angleDeg)}°`,
      summaryEn: `Rim ${syncResult.rimLight.thicknessPx.toFixed(1)}px (${syncResult.rimLight.blendMode}) · Shadow ${Math.round(syncResult.shadowCast.angleDeg)}°`,
    });
  };

  const stops = [
    {
      key: "shadow",
      label: copy("암부", "Shadow"),
      stage: syncResult.gradientMap.shadow,
    },
    {
      key: "midtone",
      label: copy("중간톤", "Midtone"),
      stage: syncResult.gradientMap.midtone,
    },
    {
      key: "highlight",
      label: copy("광원", "Highlight"),
      stage: syncResult.gradientMap.highlight,
    },
  ] as const;

  return (
    <section
      data-testid="bg3d-2d-character-light-sync-card"
      aria-labelledby={titleId}
      className="mb-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg [word-break:keep-all]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={titleId} className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Contrast size={14} className="shrink-0 text-accent" aria-hidden />
            <span>{copy("2D 캐릭터 광원 동기화", "2D character light sync")}</span>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {copy(
              "3D 배경의 태양각·색온도를 2D 캐릭터 그라데이션 맵과 역광 림라이트로 맞춥니다.",
              "Match 2D character gradient maps and rim lighting to the active 3D background sun angle and color temperature.",
            )}
          </p>
        </div>
        <span
          data-testid="bg3d-2d-light-sync-kelvin-badge"
          className="shrink-0 rounded-full border border-line bg-card px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-fg-2"
        >
          {syncResult.normalizedInput.colorTemperatureK}K
        </span>
      </div>

      {/* 실시간 3D 씬 파생 미리보기(3단계 그라데이션 + 림/그림자 방향) */}
      <div className="mt-2.5 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center gap-2.5">
          <LightDirectionPreviewDiagram
            result={syncResult}
            label={copy(
              `림라이트 방향 ${Math.round(syncResult.rimLight.angleDeg)}도, 그림자 투사 ${Math.round(syncResult.shadowCast.angleDeg)}도`,
              `Rim light ${Math.round(syncResult.rimLight.angleDeg)} deg, shadow cast ${Math.round(syncResult.shadowCast.angleDeg)} deg`,
            )}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <span className="font-semibold text-fg">
                {activePreset
                  ? copy(
                      `${activePreset.labelKo} 프리셋 연동`,
                      `${activePreset.labelEn} preset active`,
                    )
                  : copy("현재 3D 씬 직결", "Live 3D scene linked")}
              </span>
              <span className="font-mono text-xs tabular-nums text-fg-3">
                {copy(
                  `방위 ${Math.round(syncResult.normalizedInput.azimuthDeg)}° · 고도 ${Math.round(syncResult.normalizedInput.elevationDeg)}°`,
                  `Az ${Math.round(syncResult.normalizedInput.azimuthDeg)}° · El ${Math.round(syncResult.normalizedInput.elevationDeg)}°`,
                )}
              </span>
            </div>
            <div
              data-testid="bg3d-2d-light-sync-rim-readout"
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums text-fg-2"
            >
              <span>
                {copy(
                  `림 ${syncResult.rimLight.thicknessPx.toFixed(1)}px`,
                  `Rim ${syncResult.rimLight.thicknessPx.toFixed(1)}px`,
                )}
              </span>
              <span>·</span>
              <span>{blendModeLabel(syncResult.rimLight.blendMode, copy)}</span>
              <span>·</span>
              <span>
                {copy(
                  `그림자 ${Math.round(syncResult.shadowCast.angleDeg)}°`,
                  `Shadow ${Math.round(syncResult.shadowCast.angleDeg)}°`,
                )}
              </span>
            </div>
          </div>
        </div>

        <div
          data-testid="bg3d-2d-light-sync-gradient-bar"
          className="mt-2 h-3 w-full rounded-md border border-line"
          style={{ background: gradientBarBackground(syncResult) }}
          aria-hidden
        />

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {stops.map(({ key, label, stage }) => (
            <div
              key={key}
              title={stage.color.oklchCss}
              className="flex min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1"
            >
              <span
                className="size-3.5 shrink-0 rounded-sm border border-line-strong"
                style={{ backgroundColor: stage.color.srgbHex }}
                aria-hidden
              />
              <span className="min-w-0 truncate text-xs text-fg-2">
                <span className="font-semibold text-fg">{label}</span>{" "}
                <span className="font-mono tabular-nums text-fg-3">
                  {stage.color.srgbHex}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 웹툰 현장 즉시 프리셋 5종 */}
      <div className="mt-2.5">
        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-fg-2">
          <SunMedium size={13} className="shrink-0 text-accent" aria-hidden />
          <span>{copy("웹툰 현장 광원 프리셋 5종", "5 webtoon lighting presets")}</span>
        </p>
        <div
          role="group"
          aria-label={copy("웹툰 현장 광원 프리셋 5종", "5 webtoon lighting presets")}
          className="grid grid-cols-2 gap-1.5"
        >
          {STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS.map((preset) => {
            const selected = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={copy(
                  `${preset.labelKo} ${preset.kelvinLabel} 캐릭터 광원 프리셋 선택`,
                  `Select ${preset.labelEn} ${preset.kelvinLabel} character light preset`,
                )}
                title={copy(preset.summaryKo, preset.summaryEn)}
                data-testid={`bg3d-2d-light-sync-preset-${preset.id}`}
                onClick={() => handleApplyPreset(preset)}
                className={`flex min-h-11 min-w-11 cursor-pointer flex-col items-stretch justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none ${
                  selected
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                }`}
              >
                <span className="flex min-w-0 items-center justify-between gap-1">
                  <span className="truncate font-semibold text-fg">
                    {copy(preset.labelKo, preset.labelEn)}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-fg-3">
                    {preset.kelvinLabel}
                    {selected ? <Check size={12} className="text-accent" aria-hidden /> : null}
                  </span>
                </span>
                <span
                  className="h-2 w-full rounded-sm border border-line/70"
                  style={{ background: gradientBarBackground(preset.preview) }}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 1클릭 2D 캐릭터 동기화 실행 버튼 */}
      <div className="mt-2.5 flex flex-col gap-1.5">
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-2d-character-light-sync-apply-btn"
          onClick={handleOneClickSync}
          className="inline-flex min-h-11 min-w-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-bold text-accent transition-colors duration-150 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
        >
          {isSyncedWithCurrent ? (
            <Check size={14} className="shrink-0" aria-hidden />
          ) : (
            <RefreshCw size={14} className="shrink-0" aria-hidden />
          )}
          <span>
            {isSyncedWithCurrent
              ? copy("2D 캐릭터 광원 동기화 완료 (다시 적용)", "2D character light synced (re-apply)")
              : copy("2D 캐릭터 광원 동기화", "Sync 2D character lighting")}
          </span>
        </button>

        {lastSynced ? (
          <p
            aria-live="polite"
            data-testid="bg3d-2d-character-light-sync-status"
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs leading-relaxed text-fg-2"
          >
            <span className="font-semibold text-good">
              {copy("적용됨", "Applied")}
            </span>{" "}
            · {copy(lastSynced.labelKo, lastSynced.labelEn)} ·{" "}
            <span className="font-mono tabular-nums">
              {copy(lastSynced.summaryKo, lastSynced.summaryEn)}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
