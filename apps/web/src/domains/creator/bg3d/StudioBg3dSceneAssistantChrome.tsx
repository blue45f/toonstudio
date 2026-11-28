import {
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
} from "lucide-react";
import type { Ref } from "react";
import { resolveStudioMobileTouchPlan } from "../studio-mobile-touch-flow";
import { StudioToolArtwork, type StudioArtworkTool } from "../studio-tool-art/StudioToolArtwork";

import {
  formatHeroBg3dMegabytes,
  readBrowserHeroBg3dDeliveryContext,
  resolveHeroBg3dDeliveryAsset,
} from "./studio-bg3d-hero-tier-selector";
import {
  STUDIO_BG3D_ASSISTANT_STEPS,
  studioBg3dAssistantStepIndex,
  type StudioBg3dAssistantGoal,
  type StudioBg3dAssistantScenePreset,
  type StudioBg3dAssistantSheetState,
  type StudioBg3dAssistantStep,
} from "./studio-bg3d-scene-assistant";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function SceneAssistantTouchGuide() {
  const bt = useBilingual("SceneAssistantTouchGuide");
  const { canDo, cannotDo, tier } = resolveStudioMobileTouchPlan("bg3d");
  return (
    <details
      data-studio-mobile-touch-tier={tier}
      className="mx-3 hidden border-b border-line text-sm text-fg max-lg:block [@media(pointer:coarse)_and_(max-width:1366px)]:block"
    >
      <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline-accent">
        {bt("터치 작업 안내", "Touch editing guide")}
      </summary>
      <ul className="list-disc space-y-1 pb-2 ps-5">
        {canDo.map((entry) => <li key={entry.ko}>{bt(entry.ko, entry.en)}</li>)}
      </ul>
      {cannotDo.map((entry) => <p className="pb-3 text-fg-2" key={entry.ko}>{bt(entry.ko, entry.en)}</p>)}
    </details>
  );
}

export interface StudioBg3dAssistantAssetItem {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string | null;
  readonly canUse: boolean;
}

const GOALS: readonly {
  readonly id: StudioBg3dAssistantGoal;
  readonly title: string;
  readonly description: string;
  readonly art: StudioArtworkTool;
}[] = Object.freeze([
  { id: "background", title: "배경·구도", description: "완성된 장소를 고르고 카메라만 맞춰요", art: "environment" },
  { id: "character", title: "인물·포즈", description: "프로젝트 캐릭터와 포즈 참고를 배치해요", art: "performer" },
  { id: "props", title: "소품", description: "가구와 물건을 현재 장면에 바로 놓아요", art: "stageProp" },
]);

export function SheetHandle({
  state,
  onChange,
  buttonRef,
  placementActive,
  onOpenInsertSettings,
}: {
  readonly state: StudioBg3dAssistantSheetState;
  readonly onChange: (state: StudioBg3dAssistantSheetState) => void;
  readonly buttonRef: Ref<HTMLButtonElement>;
  readonly placementActive: boolean;
  readonly onOpenInsertSettings: (() => void) | undefined;
}) {
  const bt = useBilingual("StudioBg3dSceneAssistantChrome");
  const next = state === "peek" ? "half" : state === "half" ? "full" : "peek";
  const revealPlacement = placementActive && state !== "peek";
  const holdInsertSettings = placementActive && state === "peek" && Boolean(onOpenInsertSettings);
  const actionLabel = revealPlacement
    ? bt("배치 화면 보기", "Show placement")
    : holdInsertSettings ? bt("배치 확정 또는 취소 필요", "Confirm or cancel placement")
      : onOpenInsertSettings ? bt("삽입 설정 열기", "Open insert settings") : null;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="scene-assistant__sheet-handle"
      aria-label={actionLabel ?? (state === "full" ? "도구 패널 접기" : "도구 패널 펼치기")}
      aria-disabled={holdInsertSettings || undefined}
      onClick={holdInsertSettings ? undefined : onOpenInsertSettings ?? (() => onChange(revealPlacement ? "peek" : next))}
    >
      {actionLabel ? <strong className="scene-assistant__crop-preview-return-label">{actionLabel}</strong> : <span aria-hidden />}
      {!holdInsertSettings ? (revealPlacement || state === "full" ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />) : null}
    </button>
  );
}

export function AssistantStepper({
  step,
  onStepChange,
  finishDisabled,
}: {
  readonly step: StudioBg3dAssistantStep;
  readonly onStepChange: (step: StudioBg3dAssistantStep) => void;
  readonly finishDisabled: boolean;
}) {
  const activeIndex = studioBg3dAssistantStepIndex(step);
  return (
    <nav className="scene-assistant__steps" aria-label="장면 제작 단계">
      {STUDIO_BG3D_ASSISTANT_STEPS.map((item, index) => {
        const current = item.id === step;
        const complete = index < activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={`${item.number}. ${item.label}`}
            aria-current={current ? "step" : undefined}
            disabled={finishDisabled && item.id === "finish"}
            className="scene-assistant__step"
            data-current={current || undefined}
            data-complete={complete || undefined}
            onClick={() => onStepChange(item.id)}
          >
            <span className="scene-assistant__step-number">
              {complete ? <Check size={13} aria-hidden /> : item.number}
            </span>
            <span className="scene-assistant__step-copy">
              <span>{item.shortLabel}</span>
              <small>{item.label}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function GoalPicker({
  goal,
  onChange,
}: {
  readonly goal: StudioBg3dAssistantGoal;
  readonly onChange: (goal: StudioBg3dAssistantGoal) => void;
}) {
  return (
    <div className="scene-assistant__goal-grid" role="group" aria-label="만들 장면 종류">
      {GOALS.map((item) => {
        return (
          <button
            key={item.id}
            type="button"
            className="scene-assistant__goal"
            data-scene-goal={item.id}
            aria-pressed={goal === item.id}
            onClick={() => onChange(item.id)}
          >
            <span className="scene-assistant__goal-icon"><StudioToolArtwork tool={item.art} /></span>
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
          </button>
        );
      })}
    </div>
  );
}

export function ScenePresetCard({
  preset,
  selected,
  disabled,
  onSelect,
}: {
  readonly preset: StudioBg3dAssistantScenePreset;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (preset: StudioBg3dAssistantScenePreset) => void;
}) {
  return (
    <button
      type="button"
      className="scene-assistant__scene-card"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(preset)}
    >
      <img src={preset.image} alt="" loading="lazy" decoding="async" />
      <span className="scene-assistant__scene-card-shade" aria-hidden />
      <span className="scene-assistant__scene-card-copy">
        <span className="scene-assistant__badge">{preset.badge}</span>
        <strong>{preset.title}</strong>
        <small>{preset.description}</small>
      </span>
      {selected ? <span className="scene-assistant__scene-check"><Check size={14} aria-hidden /></span> : null}
    </button>
  );
}

export function AssetCard({
  asset,
  disabled,
  onAdd,
}: {
  readonly asset: StudioBg3dAssistantAssetItem;
  readonly disabled: boolean;
  readonly onAdd: (asset: StudioBg3dAssistantAssetItem) => void;
}) {
  const delivery = resolveHeroBg3dDeliveryAsset(asset.id, readBrowserHeroBg3dDeliveryContext());
  const deliveredAsset = delivery.asset;
  const resolvedItem = delivery.isHeroV1 && deliveredAsset && deliveredAsset.id !== asset.id
    ? { ...asset, id: deliveredAsset.id }
    : asset;
  const showMobileSavingsBadge = delivery.isHeroV1 && delivery.tier === "mobile" && delivery.savedBytes > 0;

  return (
    <button
      type="button"
      className="scene-assistant__asset-card"
      data-bg3d-delivery-tier={delivery.isHeroV1 ? delivery.tier : undefined}
      data-bg3d-delivery-url={delivery.isHeroV1 ? deliveredAsset?.url : undefined}
      data-bg3d-saved-bytes={delivery.isHeroV1 ? delivery.savedBytes : undefined}
      disabled={disabled || !asset.canUse}
      onClick={() => onAdd(resolvedItem)}
    >
      <span className="scene-assistant__asset-thumb">
        {asset.thumbnail
          ? <img src={asset.thumbnail} alt="" loading="lazy" decoding="async" />
          : <Box size={28} aria-hidden />}
      </span>
      <span className="[word-break:keep-all]">
        <strong>{asset.name}</strong>
        <small>장면에 놓고 위치를 정해요</small>
        {showMobileSavingsBadge ? (
          <span
            data-testid={`bg3d-asset-mobile-savings-${asset.id}`}
            className="mt-1 inline-flex items-center rounded-md border border-accent bg-accent-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums text-accent"
          >
            {`모바일 경량 -${delivery.savedPercent.toFixed(1)}% (${formatHeroBg3dMegabytes(delivery.savedBytes)} 절감)`}
          </span>
        ) : null}
      </span>
      <ImagePlus size={16} aria-hidden />
    </button>
  );
}
