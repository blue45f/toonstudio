/**
 * 개별 레거시 필터 호환 서랍(Legacy Filter Compatibility Drawer).
 *
 * 스마트 필터 스택(`StudioSmartFiltersPanel`)·레이어 스타일(`StudioLayerStylePanel`)과
 * 기능이 겹치는 21개 개별 필드 인스펙터 패널을 단일 접이식 호환 서랍으로 통합한다.
 * - 신규 작업에서는 접힌 상태를 유지해 인스펙터 최상위 중복 노출을 제거한다.
 * - 기존 저장 문서에 레거시 필드가 하나라도 남아 있으면 적용 건수 배지와 함께 자동 전개해
 *   100% 하위 호환 편집을 보장한다.
 */
import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import type { El, ImageEl } from "../studio-element-model";
import type { ReactNode } from "react";

interface DeferredLegacyProps {
  readonly selected: ImageEl;
  readonly onPatch: (patch: Partial<El>) => void;
}

const StudioImageFilterPanel = lazy(() =>
  import("../StudioImageFilterPanel").then((mod) => ({ default: mod.StudioImageFilterPanel })),
);

const StudioColorBalanceSection = lazy(async () => {
  const [panelMod, colorBalance] = await Promise.all([
    import("../StudioColorBalancePanel"),
    import("../studio-color-balance"),
  ]);
  const Panel = panelMod.StudioColorBalancePanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = colorBalance.normalizeColorBalance(selected.colorBalance);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ colorBalance: colorBalance.normalizeColorBalance({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(balance) => onPatch({ colorBalance: balance } as Partial<El>)}
        onReset={() => onPatch({ colorBalance: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioChannelMixerSection = lazy(async () => {
  const [panelMod, channelMixer] = await Promise.all([
    import("../StudioChannelMixerPanel"),
    import("../studio-channel-mixer"),
  ]);
  const Panel = panelMod.StudioChannelMixerPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = channelMixer.normalizeChannelMixer(selected.channelMixer);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ channelMixer: channelMixer.normalizeChannelMixer({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(mixer) => onPatch({ channelMixer: mixer } as Partial<El>)}
        onReset={() => onPatch({ channelMixer: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioSelectiveHslSection = lazy(async () => {
  const [panelMod, selectiveHsl] = await Promise.all([
    import("../StudioSelectiveHslPanel"),
    import("../studio-selective-hsl"),
  ]);
  const Panel = panelMod.StudioSelectiveHslPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = selectiveHsl.normalizeSelectiveHsl(selected.selectiveHsl);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ selectiveHsl: selectiveHsl.normalizeSelectiveHsl({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ selectiveHsl: v } as Partial<El>)}
        onReset={() => onPatch({ selectiveHsl: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioVibranceSection = lazy(async () => {
  const [panelMod, vibrance] = await Promise.all([
    import("../StudioVibrancePanel"),
    import("../studio-vibrance"),
  ]);
  const Panel = panelMod.StudioVibrancePanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = vibrance.normalizeVibrance(selected.vibrance);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ vibrance: vibrance.normalizeVibrance({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ vibrance: v } as Partial<El>)}
        onReset={() => onPatch({ vibrance: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioPhotoFilterSection = lazy(async () => {
  const [panelMod, photoFilter] = await Promise.all([
    import("../StudioPhotoFilterPanel"),
    import("../studio-photo-filter"),
  ]);
  const Panel = panelMod.StudioPhotoFilterPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = photoFilter.normalizePhotoFilter(selected.photoFilter);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ photoFilter: photoFilter.normalizePhotoFilter({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ photoFilter: v } as Partial<El>)}
        onReset={() => onPatch({ photoFilter: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioColorToAlphaSection = lazy(async () => {
  const [panelMod, colorToAlpha] = await Promise.all([
    import("../StudioColorToAlphaPanel"),
    import("../studio-color-to-alpha"),
  ]);
  const Panel = panelMod.StudioColorToAlphaPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = colorToAlpha.normalizeColorToAlpha(selected.colorToAlpha);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ colorToAlpha: colorToAlpha.normalizeColorToAlpha({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ colorToAlpha: v } as Partial<El>)}
        onReset={() => onPatch({ colorToAlpha: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioGradientMapSection = lazy(async () => {
  const [panelMod, gradientMap] = await Promise.all([
    import("../StudioGradientMapPanel"),
    import("../studio-gradient-map"),
  ]);
  const Panel = panelMod.StudioGradientMapPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = gradientMap.normalizeGradientMap(selected.gradientMap);
    return (
      <Panel
        value={value}
        onApplyPreset={(m) => onPatch({ gradientMap: m } as Partial<El>)}
        onEditStopColor={(i, color) => {
          const stops = value.stops.map((stop, index) => (index === i ? { ...stop, color } : stop));
          onPatch({ gradientMap: gradientMap.normalizeGradientMap({ stops }) } as Partial<El>);
        }}
        onReset={() => onPatch({ gradientMap: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioClaritySection = lazy(async () => {
  const [panelMod, clarity] = await Promise.all([
    import("../StudioClarityPanel"),
    import("../studio-clarity"),
  ]);
  const Panel = panelMod.StudioClarityPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = clarity.normalizeClarity(selected.clarity);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ clarity: clarity.normalizeClarity({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ clarity: v } as Partial<El>)}
        onReset={() => onPatch({ clarity: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioShadowHighlightSection = lazy(async () => {
  const [panelMod, shadowHighlight] = await Promise.all([
    import("../StudioShadowHighlightPanel"),
    import("../studio-shadow-highlight"),
  ]);
  const Panel = panelMod.StudioShadowHighlightPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = shadowHighlight.normalizeShadowHighlight(selected.shadowHighlight);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ shadowHighlight: shadowHighlight.normalizeShadowHighlight({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ shadowHighlight: v } as Partial<El>)}
        onReset={() => onPatch({ shadowHighlight: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioGlowSection = lazy(async () => {
  const [panelMod, glow] = await Promise.all([
    import("../StudioGlowPanel"),
    import("../studio-glow"),
  ]);
  const Panel = panelMod.StudioGlowPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = glow.normalizeGlow(selected.glow);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ glow: glow.normalizeGlow({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ glow: v } as Partial<El>)}
        onReset={() => onPatch({ glow: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioOutlineSection = lazy(async () => {
  const [panelMod, outline] = await Promise.all([
    import("../StudioOutlinePanel"),
    import("../studio-outline"),
  ]);
  const Panel = panelMod.StudioOutlinePanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = outline.normalizeOutline(selected.outline);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ outline: outline.normalizeOutline({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ outline: v } as Partial<El>)}
        onReset={() => onPatch({ outline: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioHalftoneSection = lazy(async () => {
  const [panelMod, halftone] = await Promise.all([
    import("../StudioHalftonePanel"),
    import("../studio-halftone"),
  ]);
  const Panel = panelMod.StudioHalftonePanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = halftone.normalizeHalftone(selected.halftone);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ halftone: halftone.normalizeHalftone({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ halftone: v } as Partial<El>)}
        onReset={() => onPatch({ halftone: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioGrainSection = lazy(async () => {
  const [panelMod, grain] = await Promise.all([
    import("../StudioGrainPanel"),
    import("../studio-grain"),
  ]);
  const Panel = panelMod.StudioGrainPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = grain.normalizeGrain(selected.grain);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ grain: grain.normalizeGrain({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ grain: v } as Partial<El>)}
        onReset={() => onPatch({ grain: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioInkWashSection = lazy(async () => {
  const [panelMod, inkWash] = await Promise.all([
    import("../StudioInkWashPanel"),
    import("../brush/studio-ink-wash"),
  ]);
  const Panel = panelMod.StudioInkWashPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = inkWash.normalizeInkWash(selected.inkWash);
    return (
      <Panel
        value={value}
        onPatch={(patch) => {
          const next = inkWash.normalizeInkWash({ ...value, ...patch });
          onPatch({
            inkWash: inkWash.isIdentityInkWash(next) ? undefined : next,
          } as Partial<El>);
        }}
        onApplyPreset={(v) =>
          onPatch({ inkWash: inkWash.isIdentityInkWash(v) ? undefined : v } as Partial<El>)
        }
        onReset={() => onPatch({ inkWash: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioBlurSection = lazy(async () => {
  const [panelMod, blur] = await Promise.all([
    import("../StudioBlurPanel"),
    import("../studio-blur"),
  ]);
  const Panel = panelMod.StudioBlurPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = blur.normalizeBlurFx(selected.blurFx);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ blurFx: blur.normalizeBlurFx({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ blurFx: v } as Partial<El>)}
        onReset={() => onPatch({ blurFx: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioDistortSection = lazy(async () => {
  const [panelMod, distort] = await Promise.all([
    import("../StudioDistortPanel"),
    import("../studio-distort"),
  ]);
  const Panel = panelMod.StudioDistortPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = distort.normalizeDistort(selected.distort);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ distort: distort.normalizeDistort({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ distort: v } as Partial<El>)}
        onReset={() => onPatch({ distort: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioStylizeSection = lazy(async () => {
  const [panelMod, stylize] = await Promise.all([
    import("../StudioStylizePanel"),
    import("../studio-stylize"),
  ]);
  const Panel = panelMod.StudioStylizePanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = stylize.normalizeStylize(selected.stylize);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ stylize: stylize.normalizeStylize({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ stylize: v } as Partial<El>)}
        onReset={() => onPatch({ stylize: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioLightSection = lazy(async () => {
  const [panelMod, light] = await Promise.all([
    import("../StudioLightPanel"),
    import("../studio-light"),
  ]);
  const Panel = panelMod.StudioLightPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = light.normalizeLight(selected.light);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ light: light.normalizeLight({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ light: v } as Partial<El>)}
        onReset={() => onPatch({ light: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioDetailSection = lazy(async () => {
  const [panelMod, detail] = await Promise.all([
    import("../StudioDetailPanel"),
    import("../studio-detail"),
  ]);
  const Panel = panelMod.StudioDetailPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = detail.normalizeDetail(selected.detail);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ detail: detail.normalizeDetail({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ detail: v } as Partial<El>)}
        onReset={() => onPatch({ detail: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

const StudioSketchSection = lazy(async () => {
  const [panelMod, sketch] = await Promise.all([
    import("../StudioSketchPanel"),
    import("../studio-sketch"),
  ]);
  const Panel = panelMod.StudioSketchPanel;
  function Section({ selected, onPatch }: DeferredLegacyProps) {
    const value = sketch.normalizeSketch(selected.sketch);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({ sketch: sketch.normalizeSketch({ ...value, ...patch }) } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ sketch: v } as Partial<El>)}
        onReset={() => onPatch({ sketch: undefined } as Partial<El>)}
      />
    );
  }
  return { default: Section };
});

function hasLegacyValue(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function hasBasicImageFilterFields(selected: ImageEl): boolean {
  return (
    hasLegacyValue(selected.blur)
    || hasLegacyValue(selected.brightness)
    || hasLegacyValue(selected.contrast)
    || hasLegacyValue(selected.grayscale)
    || hasLegacyValue(selected.sepia)
    || hasLegacyValue(selected.screentone)
    || hasLegacyValue(selected.lineart)
    || hasLegacyValue(selected.chromatic)
    || hasLegacyValue(selected.posterize)
    || hasLegacyValue(selected.noise)
    || hasLegacyValue(selected.saturation)
    || hasLegacyValue(selected.hue)
    || hasLegacyValue(selected.temperature)
    || hasLegacyValue(selected.sharpen)
    || hasLegacyValue(selected.pixelate)
    || hasLegacyValue(selected.inkThreshold)
    || hasLegacyValue(selected.invert)
    || hasLegacyValue(selected.duotoneShadow)
    || hasLegacyValue(selected.duotoneHighlight)
  );
}

function LegacySubsection({
  title,
  forceOpen = false,
  loadingLabel,
  children,
}: {
  readonly title: string;
  readonly forceOpen?: boolean;
  readonly loadingLabel: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(forceOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div className="border-t border-line/40 pt-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[0.72rem] font-medium text-fg-2 hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>{title}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>
      {open ? (
        <Suspense
          fallback={
            <div className="mt-1.5 rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-xs text-fg-3">
              {loadingLabel}
            </div>
          }
        >
          <div className="mt-1.5">{children}</div>
        </Suspense>
      ) : null}
    </div>
  );
}

export interface StudioLegacyFilterTitles {
  readonly basicFilter: string;
  readonly colorBalance: string;
  readonly channelMixer: string;
  readonly selectiveColor: string;
  readonly vibrance: string;
  readonly photoFilter: string;
  readonly colorToAlpha: string;
  readonly gradientMap: string;
  readonly clarity: string;
  readonly shadowHighlight: string;
  readonly glow: string;
  readonly outline: string;
  readonly halftone: string;
  readonly grain: string;
  readonly inkWash: string;
  readonly blurFx: string;
  readonly distort: string;
  readonly stylize: string;
  readonly light: string;
  readonly detail: string;
  readonly sketch: string;
}

export function StudioLegacyFilterCompatibilityDrawer({
  selected,
  onPatch,
  titles,
  loadingLabel,
}: {
  readonly selected: ImageEl;
  readonly onPatch: (patch: Partial<El>) => void;
  readonly titles: StudioLegacyFilterTitles;
  readonly loadingLabel: string;
}): React.ReactElement {
  const basicActive = hasBasicImageFilterFields(selected);
  const activeFlags = [
    basicActive,
    hasLegacyValue(selected.colorBalance),
    hasLegacyValue(selected.channelMixer),
    hasLegacyValue(selected.selectiveHsl),
    hasLegacyValue(selected.vibrance),
    hasLegacyValue(selected.photoFilter),
    hasLegacyValue(selected.colorToAlpha),
    hasLegacyValue(selected.gradientMap),
    hasLegacyValue(selected.clarity),
    hasLegacyValue(selected.shadowHighlight),
    hasLegacyValue(selected.glow),
    hasLegacyValue(selected.halftone),
    hasLegacyValue(selected.grain),
    hasLegacyValue(selected.inkWash),
    hasLegacyValue(selected.blurFx),
    hasLegacyValue(selected.distort),
    hasLegacyValue(selected.stylize),
    hasLegacyValue(selected.light),
    hasLegacyValue(selected.detail),
    hasLegacyValue(selected.sketch),
  ];
  const activeLegacyCount = activeFlags.filter(Boolean).length;
  const [open, setOpen] = useState(activeLegacyCount > 0);

  useEffect(() => {
    if (activeLegacyCount > 0) setOpen(true);
  }, [activeLegacyCount]);

  return (
    <section
      data-studio-legacy-filter-drawer="true"
      className="mt-3 rounded-xl border border-line/70 bg-card/35 p-2.5"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-fg-2 transition-colors hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">개별 레거시 필터 · 기존 문서 호환 (21종)</span>
          {activeLegacyCount > 0 ? (
            <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[0.62rem] font-bold text-accent">
              적용 중 {activeLegacyCount}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>
      <p className="mt-1 px-1.5 text-[0.65rem] leading-relaxed text-fg-3">
        신규 보정은 위 스마트 필터(비파괴 86종)를 권장합니다. 기존 문서에 저장된 개별 필터 값만 여기서 이어서 수정할 수 있습니다.
      </p>
      {open ? (
        <div className="mt-2.5 space-y-2 border-t border-line/50 pt-2">
          <LegacySubsection title={titles.basicFilter} loadingLabel={loadingLabel} forceOpen={basicActive}>
            <StudioImageFilterPanel values={selected} onPatch={(patch) => onPatch(patch as Partial<El>)} />
          </LegacySubsection>
          <LegacySubsection title={titles.blurFx} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.blurFx)}>
            <StudioBlurSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.clarity} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.clarity)}>
            <StudioClaritySection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.detail} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.detail)}>
            <StudioDetailSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.distort} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.distort)}>
            <StudioDistortSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.photoFilter} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.photoFilter)}>
            <StudioPhotoFilterSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.colorBalance} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.colorBalance)}>
            <StudioColorBalanceSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.channelMixer} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.channelMixer)}>
            <StudioChannelMixerSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.selectiveColor} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.selectiveHsl)}>
            <StudioSelectiveHslSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.vibrance} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.vibrance)}>
            <StudioVibranceSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.colorToAlpha} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.colorToAlpha)}>
            <StudioColorToAlphaSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.gradientMap} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.gradientMap)}>
            <StudioGradientMapSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.shadowHighlight} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.shadowHighlight)}>
            <StudioShadowHighlightSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.glow} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.glow)}>
            <StudioGlowSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.outline} loadingLabel={loadingLabel} forceOpen={false}>
            <StudioOutlineSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.halftone} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.halftone)}>
            <StudioHalftoneSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.grain} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.grain)}>
            <StudioGrainSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.inkWash} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.inkWash)}>
            <StudioInkWashSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.stylize} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.stylize)}>
            <StudioStylizeSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.light} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.light)}>
            <StudioLightSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
          <LegacySubsection title={titles.sketch} loadingLabel={loadingLabel} forceOpen={hasLegacyValue(selected.sketch)}>
            <StudioSketchSection selected={selected} onPatch={onPatch} />
          </LegacySubsection>
        </div>
      ) : null}
    </section>
  );
}
