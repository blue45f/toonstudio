import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioBg3dPrimitiveEditSourceSummary } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dFaceEditWorkspace } from "./studio-bg3d-face-edit-workspace";

export type StudioBg3dPrimitiveEditBeginResult =
  | { readonly ok: true; readonly context: StudioBg3dFaceEditWorkspace }
  | { readonly ok: false; readonly messageKo: string };

export type StudioBg3dPrimitiveEditApplyResult =
  | { readonly ok: true; readonly messageKo?: string }
  | { readonly ok: false; readonly messageKo: string };

export interface StudioBg3dPrimitiveEditPorts {
  readonly primitiveEditSelection?: StudioBg3dPrimitiveEditSourceSummary & { readonly sourceType?: StudioBg3dFaceEditWorkspace["kind"] };
  readonly onBeginPrimitiveEdit?: (signal?: AbortSignal) => Promise<StudioBg3dPrimitiveEditBeginResult>;
  readonly onApplyPrimitiveEdit?: (
    context: StudioBg3dFaceEditWorkspace,
    workspace: StudioHybridDccWorkspace,
    signal: AbortSignal,
  ) => Promise<StudioBg3dPrimitiveEditApplyResult>;
}
