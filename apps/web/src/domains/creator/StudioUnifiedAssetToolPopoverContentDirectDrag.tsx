import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  StudioAiTeammateAndAssetSearchHub,
  type RecommendedAssetBundle,
  type StudioSmartAssetItem,
} from "./ai-teammate-and-search";
import {
  StudioUnifiedAssetToolPopoverContent,
  type StudioUnifiedAssetToolPopoverContentProps,
} from "./StudioUnifiedAssetToolPopoverContent";
import { StudioInsertHubDirectDragBoundary } from "./StudioInsertHubDirectDragBoundary";

/**
 * Progressive enhancement wrapper for the existing insertion surface.
 * The owned click, keyboard, Undo, save, provenance, and review-lock paths remain
 * inside StudioUnifiedAssetToolPopoverContent; this layer only writes established
 * drag MIME envelopes when a supported result card starts a browser drag and mounts
 * the collapsible AI Teammate & Smart Asset Search Hub inside the lazy asset popover.
 */
export function StudioUnifiedAssetToolPopoverContentDirectDrag({
  toolBelt,
}: StudioUnifiedAssetToolPopoverContentProps) {
  const [hubOpen, setHubOpen] = useState(false);

  const handleInsertSmartAsset = (asset: StudioSmartAssetItem) => {
    if (toolBelt.activeSurfaceReviewLocked) return;
    toolBelt.stableHandlers.applyAiAssistPresetPrompt("background", asset.title);
  };

  const handleApplySmartBundle = (bundle: RecommendedAssetBundle) => {
    if (toolBelt.activeSurfaceReviewLocked) return;
    toolBelt.stableHandlers.applyAiAssistPresetPrompt("background", bundle.bundleName);
  };

  return (
    <StudioInsertHubDirectDragBoundary toolBelt={toolBelt}>
      <StudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />
      <div className="mt-3 border-t border-line pt-3">
        <details
          data-testid="studio-ai-teammate-search-disclosure"
          className="group/ats-hub rounded-2xl border border-line bg-card"
          onToggle={(event) => setHubOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 [word-break:keep-all]">
                6인 AI 팀원 군단 · 스마트 소재 검색 허브
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-fg-3 transition-transform group-open/ats-hub:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          {hubOpen ? (
            <div className="border-t border-line p-2.5">
              <StudioAiTeammateAndAssetSearchHub
                onInsertAsset={handleInsertSmartAsset}
                onApplyBundle={handleApplySmartBundle}
              />
            </div>
          ) : null}
        </details>
      </div>
    </StudioInsertHubDirectDragBoundary>
  );
}
