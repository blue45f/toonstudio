import { studioLiveAdjustmentDescriptorError } from "./contracts/studio-work-asset-contract";
import { StudioLiveAdjustmentControls } from "./StudioLiveAdjustmentControls";
import { StudioLegacyFilterCompatibilityDrawer } from "./filter/StudioLegacyFilterCompatibilityDrawer";
import { ChevronDown } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { isIdentityCurveChannels, normalizeCurve } from "./studio-curves";
import { createStudioEffectId } from "./studio-effect-favorites";
import { isIdentityLevelsChannels, normalizeLevels } from "./studio-levels";
import { extractFilterFields, looksResetPatch } from "./studio-looks";
import { applyPhotoWebtoonPreset, resetPhotoWebtoonPreset } from "./studio-photo-webtoon-preset";
import { useStudioHistogramSource } from "./useStudioHistogramSource";

import type { LayerStylePatch } from "./layer/studio-layer-styles";
import type { ImageFilterFields } from "./render/studio-konva-filter-fields";
import type { CurvePoint, CurveRgbChannels } from "./studio-curves";
import type { StudioEffectFavoriteState, StudioEffectId } from "./studio-effect-favorites";
import type { El, ImageEl } from "./studio-element-model";
import type { LevelsParams, LevelsRgbChannels } from "./studio-levels";
import type { StudioLook } from "./studio-looks";
import type { ReactNode } from "react";

import { useT } from "@/shared/lib/i18n";

function createLookEffectId(lookId: string): StudioEffectId {
  return createStudioEffectId("look", lookId);
}

const StudioCurvePanel = lazy(() => import("./StudioCurvePanel").then((mod) => ({ default: mod.StudioCurvePanel })));
const StudioSmartFiltersPanel = lazy(() => import("./StudioSmartFiltersPanel").then((mod) => ({ default: mod.StudioSmartFiltersPanel })));
const StudioLayerStylePanel = lazy(() => import("./layer/StudioLayerStylePanel").then((mod) => ({ default: mod.StudioLayerStylePanel })));
const StudioLevelsPanel = lazy(() => import("./StudioLevelsPanel").then((mod) => ({ default: mod.StudioLevelsPanel })));
const StudioLooksPanel = lazy(() => import("./StudioLooksPanel").then((mod) => ({ default: mod.StudioLooksPanel })));
const StudioPhotoWebtoonPresetPanel = lazy(() => import("./StudioPhotoWebtoonPresetPanel").then((mod) => ({ default: mod.StudioPhotoWebtoonPresetPanel })));
const StudioLineCleanupAndDustSection = lazy(() =>
  import("./filter/StudioLineCleanupAndDustSection").then((mod) => ({ default: mod.StudioLineCleanupAndDustSection })),
);
const PhotoshopProStudioWorkbench = lazy(() => import("./photoshop-pro/PhotoshopProStudioWorkbench"));

interface StudioImageAdjustmentsPanelProps {
  selected: ImageEl;
  readableImageSrc?: string | null;
  destructiveEditDisabledReason?: string | null;
  filterClipboard: Partial<ImageFilterFields> | null;
  onSetFilterClipboard: (value: Partial<ImageFilterFields> | null) => void;
  onPatch: (patch: Partial<El>) => void;
  onCreateShadingLayer?: (payload: { readonly dataUrl: string; readonly name: string; readonly blendMode: "source-over" | "multiply"; readonly clipBelow: boolean }) => boolean | void;
  effectFavoriteState: StudioEffectFavoriteState;
  onToggleEffectFavorite: (effectId: StudioEffectId) => void;
  onRememberEffectRecent: (effectId: StudioEffectId) => void;
}

type DeferredAdjustmentSectionProps = Pick<StudioImageAdjustmentsPanelProps, "selected" | "onPatch">;

const StudioAutoAdjustSection = lazy(async () => {
  const [panelMod, autoAdjust] = await Promise.all([
    import("./StudioAutoAdjustPanel"),
    import("./studio-auto-adjust"),
  ]);
  const Panel = panelMod.StudioAutoAdjustPanel;
  function StudioAutoAdjustSection({ selected, onPatch }: DeferredAdjustmentSectionProps) {
    const value = autoAdjust.normalizeAutoAdjust(selected.autoAdjust);
    return (
      <Panel
        value={value}
        onPatch={(patch) =>
          onPatch({
            autoAdjust: autoAdjust.normalizeAutoAdjust({ ...value, ...patch }),
          } as Partial<El>)
        }
        onApplyPreset={(v) => onPatch({ autoAdjust: v } as Partial<El>)}
        onReset={() => onPatch({ autoAdjust: undefined } as Partial<El>)}
      />
    );
  }
  return { default: StudioAutoAdjustSection };
});

const StudioColorMatchSection = lazy(async () => {
  const panelMod = await import("./StudioColorMatchPanel");
  const Panel = panelMod.StudioColorMatchPanel;
  function StudioColorMatchSection({ onPatch }: DeferredAdjustmentSectionProps) {
    return (
      <Panel
        onApplyDataUrl={(dataUrl) => onPatch({ src: dataUrl } as Partial<El>)}
      />
    );
  }
  return { default: StudioColorMatchSection };
});

const StudioShadingAssistWiredPanel = lazy(() =>
  import("./shading/StudioShadingAssistWiredPanel").then((mod) => ({ default: mod.StudioShadingAssistWiredPanel })),
);

function hasAdjustmentValue(value: unknown) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function AdjustmentSection({
  title,
  defaultOpen = false,
  forceOpen = false,
  loadingLabel,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  loadingLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section className="mt-3 border-t border-line/50 pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-fg transition-colors hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>
      {open ? (
        <Suspense
          fallback={
            <div className="mt-2 rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-fg-3">
              {loadingLabel}
            </div>
          }
        >
          <div className="mt-2">{children}</div>
        </Suspense>
      ) : null}
    </section>
  );
}

export function StudioImageAdjustmentsPanel({
  selected, readableImageSrc, destructiveEditDisabledReason,
  filterClipboard, onSetFilterClipboard, onPatch, onCreateShadingLayer,
  effectFavoriteState, onToggleEffectFavorite, onRememberEffectRecent,
}: StudioImageAdjustmentsPanelProps) {
  // 채널(r/g/b) 곡선·레벨 필드(curveCh/levelsCh) — ImageEl 타입 선언에는 아직 없어
  // ImageFilterFields로 읽는다(런타임은 같은 요소 객체라 patchEl 스프레드로 그대로 왕복된다).
  const filterFields: ImageFilterFields = selected;
  // 히스토그램 원본 픽셀 — src 키 LRU 캐시라 선택/src 변경 시에만 디코드되고
  // 레벨·톤커브 두 패널이 같은 디코드 1회를 공유한다.
  const histogramSource = useStudioHistogramSource(selected.src);
  const t = useT();
  const sectionLoading = t("studio.imageAdjustments.sectionLoading");
  const sectionTitle = {
    lookPreset: t("studio.imageAdjustments.section.lookPreset"),
    smartFilter: t("studio.imageAdjustments.section.smartFilter"),
    photoToonFilter: t("studio.imageAdjustments.section.photoToonFilter"),
    basicFilter: t("studio.imageAdjustments.section.basicFilter"),
    level: t("studio.imageAdjustments.section.level"),
    layerStyle: t("studio.imageAdjustments.section.layerStyle"),
    toneCurve: t("studio.imageAdjustments.section.toneCurve"),
    colorBalance: t("studio.imageAdjustments.section.colorBalance"),
    channelMixer: t("studio.imageAdjustments.section.channelMixer"),
    selectiveColor: t("studio.imageAdjustments.section.selectiveColor"),
    vibrance: t("studio.imageAdjustments.section.vibrance"),
    photoFilter: t("studio.imageAdjustments.section.photoFilter"),
    colorToAlpha: t("studio.imageAdjustments.section.colorToAlpha"),
    gradientMap: t("studio.imageAdjustments.section.gradientMap"),
    autoAdjust: t("studio.imageAdjustments.section.autoAdjust"),
    clarity: t("studio.imageAdjustments.section.clarity"),
    shadowHighlight: t("studio.imageAdjustments.section.shadowHighlight"),
    glow: t("studio.imageAdjustments.section.glow"),
    outline: t("studio.imageAdjustments.section.outline"),
    halftone: t("studio.imageAdjustments.section.halftone"),
    grain: t("studio.imageAdjustments.section.grain"),
    inkWash: t("studio.imageAdjustments.section.inkWash"),
    blurFx: t("studio.imageAdjustments.section.blurFx"),
    distort: t("studio.imageAdjustments.section.distort"),
    stylize: t("studio.imageAdjustments.section.stylize"),
    light: t("studio.imageAdjustments.section.light"),
    detail: t("studio.imageAdjustments.section.detail"),
    sketch: t("studio.imageAdjustments.section.sketch"),
    colorMatch: "색감 맞추기",
    shadingAssist: "자동 명암",
  };
  if (selected.adjustmentLayer) return <>
    <StudioLiveAdjustmentControls selected={selected} onPatch={onPatch} />
    <Suspense fallback={<p role="status">{sectionLoading}</p>}>
      <StudioSmartFiltersPanel stack={selected.smartFilters} maxEntries={24}
        validateStack={(next) => studioLiveAdjustmentDescriptorError(selected, next)} onChange={(smartFilters) => onPatch({ smartFilters })} />
    </Suspense>
  </>;
  return (
    <>
      <AdjustmentSection title={sectionTitle.lookPreset} loadingLabel={sectionLoading} defaultOpen>
        <StudioLooksPanel
          onApplyLook={(look: StudioLook) => {
            onRememberEffectRecent(createLookEffectId(look.id));
            onPatch({ ...looksResetPatch(), ...look.patch } as Partial<El>);
          }}
          onCopy={() => onSetFilterClipboard(extractFilterFields(selected))}
          onPaste={() => {
            if (filterClipboard) onPatch({ ...looksResetPatch(), ...filterClipboard } as Partial<El>);
          }}
          onResetAll={() => onPatch(looksResetPatch() as Partial<El>)}
          canPaste={!!filterClipboard}
          favoriteState={effectFavoriteState}
          onToggleFavorite={onToggleEffectFavorite}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.smartFilter}
        loadingLabel={sectionLoading}
        defaultOpen
      >
        <StudioSmartFiltersPanel
          stack={selected.smartFilters}
          onChange={(smartFilters) => onPatch({ smartFilters } as Partial<El>)}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.photoToonFilter}
        loadingLabel={sectionLoading}
        defaultOpen
      >
        <StudioPhotoWebtoonPresetPanel
          onApplyPreset={(preset) => onPatch(applyPhotoWebtoonPreset(filterFields, preset.id) as Partial<El>)}
          onReset={() => onPatch(resetPhotoWebtoonPreset(filterFields) as Partial<El>)}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.level}
        loadingLabel={sectionLoading}
        defaultOpen
      >
        <StudioLevelsPanel
          histogramSource={histogramSource}
          value={normalizeLevels({
            blackPoint: selected.levelsBlack,
            whitePoint: selected.levelsWhite,
            gamma: selected.levelsGamma,
            outBlack: selected.levelsOutBlack,
            outWhite: selected.levelsOutWhite,
          })}
          channels={filterFields.levelsCh}
          onPatch={(patch) =>
            onPatch({
              ...(patch.blackPoint !== undefined ? { levelsBlack: patch.blackPoint } : {}),
              ...(patch.whitePoint !== undefined ? { levelsWhite: patch.whitePoint } : {}),
              ...(patch.gamma !== undefined ? { levelsGamma: patch.gamma } : {}),
              ...(patch.outBlack !== undefined ? { levelsOutBlack: patch.outBlack } : {}),
              ...(patch.outWhite !== undefined ? { levelsOutWhite: patch.outWhite } : {}),
            } as Partial<El>)
          }
          onChannelsChange={(ch: LevelsRgbChannels) => {
            // 전 채널이 항등이면 필드 자체를 비워 저장본을 깨끗하게 유지한다(없음=항등 하위호환).
            const patch: Partial<ImageFilterFields> = {
              levelsCh: isIdentityLevelsChannels(ch) ? undefined : ch,
            };
            onPatch(patch as Partial<El>);
          }}
          onApplyPreset={(p: LevelsParams) =>
            onPatch({
              levelsBlack: p.blackPoint,
              levelsWhite: p.whitePoint,
              levelsGamma: p.gamma,
              levelsOutBlack: p.outBlack,
              levelsOutWhite: p.outWhite,
            } as Partial<El>)
          }
          onReset={() => {
            const patch: Partial<ImageFilterFields> = {
              levelsBlack: undefined,
              levelsWhite: undefined,
              levelsGamma: undefined,
              levelsOutBlack: undefined,
              levelsOutWhite: undefined,
              levelsCh: undefined,
            };
            onPatch(patch as Partial<El>);
          }}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.layerStyle}
        loadingLabel={sectionLoading}
        defaultOpen
      >
        <StudioLayerStylePanel
          values={selected as LayerStylePatch}
          onPatch={(patch) => onPatch(patch as Partial<El>)}
          outline={selected.outline}
          onOutlineChange={(next) => onPatch({ outline: next } as Partial<El>)}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.toneCurve}
        loadingLabel={sectionLoading}
        defaultOpen={hasAdjustmentValue(selected.curve) || hasAdjustmentValue(filterFields.curveCh)}
      >
        <StudioCurvePanel
          histogramSource={histogramSource}
          points={normalizeCurve(selected.curve)}
          channels={filterFields.curveCh}
          onChange={(pts: CurvePoint[]) => onPatch({ curve: pts } as Partial<El>)}
          onChannelsChange={(ch: CurveRgbChannels) => {
            // 전 채널이 항등이면 필드 자체를 비워 저장본을 깨끗하게 유지한다(없음=항등 하위호환).
            const patch: Partial<ImageFilterFields> = {
              curveCh: isIdentityCurveChannels(ch) ? undefined : ch,
            };
            onPatch(patch as Partial<El>);
          }}
          onReset={() => {
            const patch: Partial<ImageFilterFields> = { curve: undefined, curveCh: undefined };
            onPatch(patch as Partial<El>);
          }}
        />
      </AdjustmentSection>

      <AdjustmentSection
        title={sectionTitle.autoAdjust}
        loadingLabel={sectionLoading}
        forceOpen={hasAdjustmentValue(selected.autoAdjust)}
      >
        <StudioAutoAdjustSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title={sectionTitle.colorMatch} loadingLabel={sectionLoading}>
        <StudioColorMatchSection selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <AdjustmentSection title={sectionTitle.shadingAssist} loadingLabel={sectionLoading}>
        <StudioShadingAssistWiredPanel selected={selected} readableImageSrc={readableImageSrc} onPatch={onPatch} onCreateShadingLayer={onCreateShadingLayer} destructiveEditDisabledReason={destructiveEditDisabledReason} />
      </AdjustmentSection>

      <AdjustmentSection title="선화 정리 · 먼지 제거 · 분위기 색감" loadingLabel={sectionLoading}>
        <StudioLineCleanupAndDustSection
          imageSrc={selected.src}
          onCommitImageSrc={(src) => onPatch({ src })}
          onExtractGradientStops={(stops) => onPatch({ gradientMap: { stops: stops.map((s) => ({ pos: s.pos, color: s.color })) } })}
        />
      </AdjustmentSection>

      <AdjustmentSection title="포토샵 프로 랩 열기" loadingLabel={sectionLoading}>
        <PhotoshopProStudioWorkbench selected={selected} onPatch={onPatch} />
      </AdjustmentSection>

      <StudioLegacyFilterCompatibilityDrawer
        selected={selected}
        onPatch={onPatch}
        titles={sectionTitle}
        loadingLabel={sectionLoading}
      />
    </>
  );
}
