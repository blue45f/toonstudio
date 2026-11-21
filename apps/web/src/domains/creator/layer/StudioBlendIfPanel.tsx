/**
 * StudioBlendIfPanel.tsx
 *
 * Photoshop / Photopea / Affinity 스타일 비파괴 Blend-If & Blend Ranges UI 패널.
 * - 레이어 스타일 고급 접힘(`<details>`) 진입 시 동적 `import()`(`React.lazy`)로 로드할 수 있는 독립 모듈.
 * - OKLCH 시맨틱 토큰(`bg-panel`, `bg-card`, `bg-raised`, `border-line`, `text-fg`, `text-fg-2`,
 *   `text-accent`, `text-on-accent`), 44px 터치 타깃(`min-h-11`), `[word-break:keep-all]`, `tabular-nums` 준수.
 */
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  BLEND_IF_CHANNELS,
  BLEND_IF_CHANNEL_LABELS_KO,
  DEFAULT_BLEND_IF_HANDLES,
  STUDIO_BLEND_IF_PRESETS,
  createDefaultBlendIfConfig,
  evaluateBlendIfRangeAlpha,
  isIdentityBlendIfConfig,
  isIdentityBlendIfHandles,
  patchBlendIfChannelHandles,
  type BlendIfChannel,
  type BlendIfSplitHandles,
  type StudioBlendIfConfig,
} from "./studio-blend-if-compositor";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioBlendIfPanelProps {
  readonly config: StudioBlendIfConfig;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChange: (next: StudioBlendIfConfig) => void;
}

type HandleFieldKey = "bMin" | "bSoft" | "wSoft" | "wMax";

const HANDLE_FIELDS: readonly { readonly key: HandleFieldKey; readonly index: 0 | 1 | 2 | 3; readonly label: string }[] = [
  { key: "bMin", index: 0, label: "어둠 시작" },
  { key: "bSoft", index: 1, label: "어둠 페더" },
  { key: "wSoft", index: 2, label: "밝기 페더" },
  { key: "wMax", index: 3, label: "밝기 끝" },
];

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function buildRampPolylinePoints(handles: BlendIfSplitHandles): string {
  const points: string[] = [];
  const samples = 32;
  for (let i = 0; i <= samples; i += 1) {
    const v = (i / samples) * 255;
    const alpha = evaluateBlendIfRangeAlpha(v, handles);
    const x = ((v / 255) * 240).toFixed(1);
    const y = (44 - alpha * 36).toFixed(1);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function updateHandleAtIndex(
  handles: BlendIfSplitHandles,
  index: 0 | 1 | 2 | 3,
  nextVal: number,
): BlendIfSplitHandles {
  const clamped = Math.max(0, Math.min(255, Math.round(nextVal)));
  let [bMin, bSoft, wSoft, wMax] = handles;
  if (index === 0) {
    bMin = clamped;
    if (bSoft < bMin) bSoft = bMin;
    if (wSoft < bSoft) wSoft = bSoft;
    if (wMax < wSoft) wMax = wSoft;
  } else if (index === 1) {
    bSoft = clamped;
    if (bMin > bSoft) bMin = bSoft;
    if (wSoft < bSoft) wSoft = bSoft;
    if (wMax < wSoft) wMax = wSoft;
  } else if (index === 2) {
    wSoft = clamped;
    if (wMax < wSoft) wMax = wSoft;
    if (bSoft > wSoft) bSoft = wSoft;
    if (bMin > bSoft) bMin = bSoft;
  } else {
    wMax = clamped;
    if (wSoft > wMax) wSoft = wMax;
    if (bSoft > wSoft) bSoft = wSoft;
    if (bMin > bSoft) bMin = bSoft;
  }
  return [bMin, bSoft, wSoft, wMax];
}

interface BlendIfRangeSectionProps {
  readonly title: string;
  readonly targetId: "thisLayer" | "underlyingLayer";
  readonly handles: BlendIfSplitHandles;
  readonly disabled: boolean;
  readonly onHandlesChange: (next: BlendIfSplitHandles) => void;
}

function BlendIfRangeSection({
  title,
  targetId,
  handles,
  disabled,
  onHandlesChange,
}: BlendIfRangeSectionProps): ReactElement {
  const isDefault = isIdentityBlendIfHandles(handles);
  const polylinePoints = buildRampPolylinePoints(handles);

  return (
    <div className="space-y-2 rounded-xl border border-line bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg">{title}</span>
        <span className="text-[0.6875rem] tabular-nums text-fg-2">
          {handles[0]} / {handles[1]} · {handles[2]} / {handles[3]}
        </span>
      </div>

      <svg
        viewBox="0 0 240 50"
        aria-hidden="true"
        className="h-12 w-full rounded-lg border border-line bg-raised"
      >
        <line x1="0" y1="44" x2="240" y2="44" className="stroke-line" strokeWidth="1" />
        <line x1="0" y1="8" x2="240" y2="8" className="stroke-line/60" strokeWidth="1" strokeDasharray="3 3" />
        <polyline
          fill="none"
          points={polylinePoints}
          className={isDefault ? "stroke-fg-2" : "stroke-accent"}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {handles.map((value, idx) => {
          const cx = (value / 255) * 240;
          const cy = idx === 0 || idx === 3 ? 44 : 8;
          return (
            <circle
              key={`${targetId}-node-${idx}`}
              cx={cx}
              cy={cy}
              r="3.2"
              className="fill-accent stroke-panel"
              strokeWidth="1.2"
            />
          );
        })}
      </svg>

      <div className="grid grid-cols-2 gap-2">
        {HANDLE_FIELDS.map((field) => {
          const inputId = `blend-if-${targetId}-${field.key}`;
          const value = handles[field.index];
          return (
            <label
              key={field.key}
              htmlFor={inputId}
              className="flex flex-col gap-1 rounded-lg border border-line/70 bg-raised px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-1 text-[0.6875rem]">
                <span className="font-medium text-fg-2">{field.label}</span>
                <span className="font-semibold tabular-nums text-fg">{value}</span>
              </div>
              <input
                id={inputId}
                type="range"
                min={0}
                max={255}
                step={1}
                disabled={disabled}
                value={value}
                aria-label={`${title} ${field.label}`}
                onChange={(event) => {
                  const next = updateHandleAtIndex(handles, field.index, Number(event.target.value));
                  onHandlesChange(next);
                }}
                className="h-6 w-full cursor-pointer accent-accent"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function StudioBlendIfPanel({
  config,
  disabled = false,
  className,
  onChange,
}: StudioBlendIfPanelProps): ReactElement {
  const activeChannel = config.activeChannel;
  const channelSpec = config.channels[activeChannel];
  const isIdentity = isIdentityBlendIfConfig(config);

  const modifiedChannelCount = BLEND_IF_CHANNELS.filter((ch) => {
    const spec = config.channels[ch];
    return !isIdentityBlendIfHandles(spec.thisLayer) || !isIdentityBlendIfHandles(spec.underlyingLayer);
  }).length;

  const handleSelectChannel = (channel: BlendIfChannel): void => {
    onChange({ ...config, activeChannel: channel });
  };

  const handleResetAll = (): void => {
    onChange(createDefaultBlendIfConfig({ activeChannel }));
  };

  const handleResetActiveChannel = (): void => {
    const next = patchBlendIfChannelHandles(
      patchBlendIfChannelHandles(config, activeChannel, "thisLayer", DEFAULT_BLEND_IF_HANDLES),
      activeChannel,
      "underlyingLayer",
      DEFAULT_BLEND_IF_HANDLES,
    );
    onChange(next);
  };

  return (
    <section
      aria-label="명도 조건 합성 (Blend-If)"
      data-testid="studio-blend-if-panel"
      className={cn(
        "space-y-3 rounded-2xl border border-line bg-panel p-3 text-fg [word-break:keep-all]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-bold text-fg">명도 조건 합성</h3>
          </div>
          <p className="mt-0.5 text-xs text-fg-2">
            어둡거나 밝은 구간만 비파괴로 투명하게 섞습니다.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          aria-label="명도 조건 합성 사용"
          disabled={disabled}
          onClick={() => onChange({ ...config, enabled: !config.enabled })}
          className={cn(
            BUTTON_BASE,
            "shrink-0 min-w-14",
            config.enabled
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-raised text-fg-2 hover:text-fg",
          )}
        >
          {config.enabled ? "켜짐" : "꺼짐"}
        </button>
      </div>

      <div
        role="tablist"
        aria-label="조건 채널 선택"
        className="grid grid-cols-4 gap-1.5 rounded-xl border border-line bg-card p-1"
      >
        {BLEND_IF_CHANNELS.map((channel) => {
          const selected = channel === activeChannel;
          const spec = config.channels[channel];
          const dirty =
            !isIdentityBlendIfHandles(spec.thisLayer) ||
            !isIdentityBlendIfHandles(spec.underlyingLayer);
          return (
            <button
              key={channel}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => handleSelectChannel(channel)}
              className={cn(
                BUTTON_BASE,
                "min-w-11 px-1.5 text-[0.75rem]",
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-transparent bg-transparent text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <span>{BLEND_IF_CHANNEL_LABELS_KO[channel]}</span>
              {dirty ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <BlendIfRangeSection
        title={`이 레이어 (${BLEND_IF_CHANNEL_LABELS_KO[activeChannel]})`}
        targetId="thisLayer"
        handles={channelSpec.thisLayer}
        disabled={disabled || !config.enabled}
        onHandlesChange={(nextHandles) =>
          onChange(patchBlendIfChannelHandles(config, activeChannel, "thisLayer", nextHandles))
        }
      />

      <BlendIfRangeSection
        title={`아래 레이어 (${BLEND_IF_CHANNEL_LABELS_KO[activeChannel]})`}
        targetId="underlyingLayer"
        handles={channelSpec.underlyingLayer}
        disabled={disabled || !config.enabled}
        onHandlesChange={(nextHandles) =>
          onChange(patchBlendIfChannelHandles(config, activeChannel, "underlyingLayer", nextHandles))
        }
      />

      <details className="rounded-xl border border-line bg-card p-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-1 text-xs font-semibold text-fg">
          <span>빠른 합성 프리셋 및 PSD 옵션</span>
          <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-[0.6875rem] tabular-nums text-fg-2">
            수정 채널 {modifiedChannelCount}
          </span>
        </summary>

        <div className="mt-2 space-y-2.5 border-t border-line/70 pt-2.5">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="명도 조건 합성 프리셋">
            {STUDIO_BLEND_IF_PRESETS.filter((preset) => preset.id !== "identity").map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                title={preset.descriptionKo}
                onClick={() => onChange({ ...preset.config, enabled: true })}
                className={cn(
                  BUTTON_BASE,
                  "justify-start border-line bg-raised px-2.5 text-left text-fg-2 hover:border-accent hover:text-fg",
                )}
              >
                {preset.labelKo}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-2.5 text-xs text-fg-2">
              <span>클리핑된 레이어를 묶어서 혼합</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={config.blendClippingElements}
                onChange={(event) =>
                  onChange({ ...config, blendClippingElements: event.target.checked })
                }
                className="size-4 accent-accent"
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-2.5 text-xs text-fg-2">
              <span>내부 레이어 효과를 묶어서 혼합</span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={config.blendInteriorElements}
                onChange={(event) =>
                  onChange({ ...config, blendInteriorElements: event.target.checked })
                }
                className="size-4 accent-accent"
              />
            </label>
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-[0.6875rem] tabular-nums text-fg-2">
          {!config.enabled
            ? "비활성 상태 (원본 유지)"
            : isIdentity
              ? "현재 변경된 구간 없음"
              : `${modifiedChannelCount}개 채널에 비파괴 매트 적용 중`}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled || isIdentity}
            onClick={handleResetActiveChannel}
            className={cn(BUTTON_BASE, "border-line bg-raised text-fg-2 hover:text-fg")}
          >
            현재 채널 초기화
          </button>
          <button
            type="button"
            disabled={disabled || isIdentity}
            onClick={handleResetAll}
            className={cn(BUTTON_BASE, "border-line bg-raised text-fg-2 hover:text-fg")}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            전체 초기화
          </button>
        </div>
      </div>
    </section>
  );
}

export default StudioBlendIfPanel;
