import { useState } from "react";
import { StudioVirtualSpaceClonePanel } from "./StudioVirtualSpaceClonePanel";
import type { StudioTileEffectDefinition } from "./studio-virtual-space-tile-effects";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { writeStudioWorldAuthoringDraft } from "./studio-world-draft-storage";

export interface WorldCloneBinding {
  readonly scope: string;
  readonly effects: readonly StudioTileEffectDefinition[];
  readonly onLoad: (effects: readonly StudioTileEffectDefinition[]) => void;
  readonly incoming: string;
  readonly expanded: boolean;
}

export function StudioWorldCloneSection({ projectId, manifest, basePublishedRevisionId, disabled, onChange, clone }: {
  readonly projectId: string;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly basePublishedRevisionId?: string | null;
  readonly disabled?: boolean;
  readonly onChange: (value: StudioVirtualSpaceWorldManifest) => void;
  readonly clone: WorldCloneBinding;
}) {
  const [expanded, setExpanded] = useState(clone.expanded || Boolean(clone.incoming));
  return <details open={expanded} data-space-interactive="true" className="rounded-lg border border-line bg-card p-3"
    onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">공간 복제</summary>
    {expanded ? <StudioVirtualSpaceClonePanel world={manifest} tileEffects={clone.effects} incoming={clone.incoming}
      disabled={Boolean(disabled)} onApplySnapshot={(snapshot) => {
        if (disabled || !writeStudioWorldAuthoringDraft(projectId, snapshot.world, basePublishedRevisionId,
          { scope: clone.scope, effects: snapshot.tileEffects })) return false;
        onChange(snapshot.world);
        clone.onLoad(snapshot.tileEffects);
        return true;
      }} /> : null}
  </details>;
}
