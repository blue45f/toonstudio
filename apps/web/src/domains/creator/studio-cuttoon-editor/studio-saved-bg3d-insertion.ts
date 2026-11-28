import { insertStudioAssetWithBundleCredit, studioBundleSourceCreditProperties } from "../catalog/studio-bundle-source-credit";
import { isStudioPasteScopeCurrent } from "../studio-edit-controls";

import type { StudioBg3dSceneDocument } from "../contracts/studio-bg3d-scene-document";
import type { StudioAsset } from "../studio-asset-library";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El, ImageEl } from "../studio-element-model";
import type { CanvasImagePlacement } from "../studio-image-placement";

export type InsertSavedBg3dMaterial = (asset: StudioAsset, options?: {
  readonly placement?: CanvasImagePlacement;
  readonly closeMenu?: boolean;
}) => Promise<boolean>;

interface Scope {
  readonly menu: object;
  readonly pageId: string;
  readonly master: boolean;
  readonly reviewLocked: boolean;
  readonly elements: readonly El[];
  readonly revision: unknown;
  readonly selectedId: string | null;
  readonly marqueeIds: readonly string[];
  readonly groupId: string | null;
  readonly ownsLocalDraft: boolean;
}

interface Context {
  readonly intent: { current: number };
  readonly elements: readonly El[];
  readonly captureMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly readScope: () => Scope;
  readonly readAssets: () => readonly StudioAsset[];
  readonly addImage: (src: string, width: number, height: number, provenance?: undefined, animated?: boolean,
    patch?: Partial<ImageEl> & { name?: string }, placement?: CanvasImagePlacement) => boolean;
  readonly closeMenu: (menu: object) => void;
  readonly reportReadFailure: () => void;
}

async function readSavedScene(asset: StudioAsset): Promise<StudioBg3dSceneDocument | null> {
  const { readStudioAssetBg3dScene } = await import("../studio-asset-library");
  return readStudioAssetBg3dScene(asset);
}

/** Only the originating authoritative canvas can consume a lazy local scene read. */
export function bindStudioSavedBg3dInsertion(context: Context, readScene = readSavedScene): InsertSavedBg3dMaterial {
  return async (requested, { placement, closeMenu } = {}) => {
    if (requested.kind !== "bg3d") return false;
    const intent = ++context.intent.current;
    const target = context.readScope();
    const ticket = context.captureMutationTicket();
    const findCurrentAsset = () => context.readAssets().find((asset) => asset.id === requested.id
      && asset.kind === "bg3d" && asset.contentHash === requested.contentHash && asset.dataUrl === requested.dataUrl);
    const stillCurrent = () => {
      const current = context.readScope();
      return intent === context.intent.current && context.elements === target.elements
        && current.menu === target.menu && current.elements === target.elements && current.revision === target.revision
        && current.selectedId === target.selectedId && current.marqueeIds === target.marqueeIds && current.groupId === target.groupId
        && current.ownsLocalDraft === target.ownsLocalDraft
        && isStudioPasteScopeCurrent({ mutationAllowed: context.canApplyMutation(ticket), reviewLocked: current.reviewLocked,
          targetPageId: target.pageId, currentPageId: current.pageId, targetMasterEditMode: target.master, currentMasterEditMode: current.master });
    };
    const initialAsset = findCurrentAsset();
    if (!initialAsset || !stillCurrent()) return false;

    try {
      // Team/shared originals, versioned cuts and pass bundles have their own insertion and ownership rules.
      const source = target.ownsLocalDraft && initialAsset.contentHash ? await readScene(initialAsset) : null;
      const asset = findCurrentAsset();
      if (!asset || !stillCurrent()) return false;
      const scene = source && !source.pinnedVersionedCut && !source.output.sixPassLt ? source : null;
      const added = placement || scene
        ? context.addImage(asset.dataUrl, asset.width, asset.height, undefined, false, {
          ...studioBundleSourceCreditProperties(asset), ...(scene ? { name: asset.name, bg3dScene: scene } : {}),
        }, placement)
        : insertStudioAssetWithBundleCredit(asset, context.addImage);
      if (added && closeMenu) context.closeMenu(target.menu);
      return added;
    } catch {
      if (stillCurrent()) context.reportReadFailure();
      return false;
    }
  };
}
