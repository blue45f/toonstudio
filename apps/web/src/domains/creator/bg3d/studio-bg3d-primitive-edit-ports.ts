import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioBg3dPrimitiveEditSourceSummary } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";

export type StudioBg3dPrimitiveEditBeginResult =
  | { readonly ok: true; readonly context: StudioBg3dPrimitiveEditWorkspace }
  | { readonly ok: false; readonly messageKo: string };

export type StudioBg3dPrimitiveEditApplyResult =
  | { readonly ok: true; readonly messageKo?: string }
  | { readonly ok: false; readonly messageKo: string };

export interface StudioBg3dPrimitiveEditPorts {
  readonly primitiveEditSelection?: StudioBg3dPrimitiveEditSourceSummary;
  readonly onBeginPrimitiveEdit?: () => Promise<StudioBg3dPrimitiveEditBeginResult>;
  readonly onApplyPrimitiveEdit?: (
    context: StudioBg3dPrimitiveEditWorkspace,
    workspace: StudioHybridDccWorkspace,
    signal: AbortSignal,
  ) => Promise<StudioBg3dPrimitiveEditApplyResult>;
}
