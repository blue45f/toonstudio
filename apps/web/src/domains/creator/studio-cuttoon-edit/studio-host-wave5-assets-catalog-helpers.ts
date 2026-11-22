import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { SharedAssetCatalogItem } from "@/platform/creator-client";
import type { CreatorAssetReportReason } from "@/shared/lib/creator-asset-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import {
  applyDialogueTranslations,
  switchDialogueLocale,
} from "../lettering/studio-dialogue-translate";
import { createStudioAssetFavoriteId } from "../studio-asset-favorites";
import type { StudioAsset } from "../studio-asset-library";
import type { StudioPageInsertState } from "../studio-comipo-shipped";
import type { StudioCreatorPackDefinition } from "../studio-creator-pack-catalog";
import type { Tool } from "../studio-editor-tool-model";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import { loadStudioComipoShipped } from "../studio-page-lazy-ui";
import type { StudioMenuAssetLoaderEntry } from "../studio-page-menu-asset-loaders";
import type { PageState } from "../studio-page-state";
import type { PanelLayoutPreset } from "../studio-panel-layouts";
import { SFX_CATEGORIES, SFX_LIBRARY } from "../studio-sfx-presets";
import type {
  StudioAssetShareOptions,
  StudioAssetSortOrder,
  StudioAssetTab,
} from "../StudioAssetMenuPanel";
import type {
  StudioOptionalAssetPacks,
  StudioSceneTemplatePacks,
  StudioSfxPacks,
} from "../StudioToolBeltContent";

export interface StudioMarketplaceCloudSyncRetryState {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly pack: StudioCreatorPackDefinition;
  readonly issue: string;
}

export async function runStudioLoadSharedAssets({
  assetSearchQuery,
  assetSortOrder,
  setSharedLoading,
  setSharedError,
  setShared,
  setSharedNextOffset,
  loadFailedMessage,
}: {
  readonly assetSearchQuery: string;
  readonly assetSortOrder: StudioAssetSortOrder;
  readonly setSharedLoading: Dispatch<SetStateAction<boolean>>;
  readonly setSharedError: Dispatch<SetStateAction<string | null>>;
  readonly setShared: Dispatch<SetStateAction<SharedAssetCatalogItem[]>>;
  readonly setSharedNextOffset: Dispatch<SetStateAction<number | null>>;
  readonly loadFailedMessage: string;
}): Promise<void> {
  setSharedLoading(true);
  setSharedError(null);
  try {
    const { listSharedAssetCatalog } = await import("@/platform/creator-client");
    const page = await listSharedAssetCatalog({
      limit: 20,
      search: assetSearchQuery.trim() || undefined,
      sort: assetSortOrder === "popular" || assetSortOrder === "name" ? assetSortOrder : "newest",
    });
    setShared(page.items);
    setSharedNextOffset(page.nextOffset);
  } catch (err) {
    setSharedError(err instanceof Error ? err.message : loadFailedMessage);
    setShared([]);
    setSharedNextOffset(null);
  } finally {
    setSharedLoading(false);
  }
}

export async function runStudioLoadMoreSharedAssets({
  sharedNextOffset,
  sharedLoadingMore,
  assetSearchQuery,
  assetSortOrder,
  setSharedLoadingMore,
  setSharedError,
  setShared,
  setSharedNextOffset,
  nextLoadFailedMessage,
}: {
  readonly sharedNextOffset: number | null;
  readonly sharedLoadingMore: boolean;
  readonly assetSearchQuery: string;
  readonly assetSortOrder: StudioAssetSortOrder;
  readonly setSharedLoadingMore: Dispatch<SetStateAction<boolean>>;
  readonly setSharedError: Dispatch<SetStateAction<string | null>>;
  readonly setShared: Dispatch<SetStateAction<SharedAssetCatalogItem[]>>;
  readonly setSharedNextOffset: Dispatch<SetStateAction<number | null>>;
  readonly nextLoadFailedMessage: string;
}): Promise<void> {
  if (sharedNextOffset === null || sharedLoadingMore) return;
  setSharedLoadingMore(true);
  setSharedError(null);
  try {
    const { listSharedAssetCatalog } = await import("@/platform/creator-client");
    const page = await listSharedAssetCatalog({
      limit: 20,
      offset: sharedNextOffset,
      search: assetSearchQuery.trim() || undefined,
      sort: assetSortOrder === "popular" || assetSortOrder === "name" ? assetSortOrder : "newest",
    });
    setShared((current) => {
      const seen = new Set(current.map((asset) => asset.id));
      return [...current, ...page.items.filter((asset) => !seen.has(asset.id))];
    });
    setSharedNextOffset(page.nextOffset);
  } catch (err) {
    setSharedError(err instanceof Error ? err.message : nextLoadFailedMessage);
  } finally {
    setSharedLoadingMore(false);
  }
}

export function runStudioLoadCommunityAssetsEffect({
  menu,
  assetTab,
  assetSearchQuery,
  assetSortOrder,
  setSharedLoading,
  setSharedError,
  setShared,
  setSharedNextOffset,
  loadFailedMessage,
}: {
  readonly menu: string | null;
  readonly assetTab: StudioAssetTab;
  readonly assetSearchQuery: string;
  readonly assetSortOrder: StudioAssetSortOrder;
  readonly setSharedLoading: Dispatch<SetStateAction<boolean>>;
  readonly setSharedError: Dispatch<SetStateAction<string | null>>;
  readonly setShared: Dispatch<SetStateAction<SharedAssetCatalogItem[]>>;
  readonly setSharedNextOffset: Dispatch<SetStateAction<number | null>>;
  readonly loadFailedMessage: () => string;
}): (() => void) | undefined {
  if (menu !== "asset" || assetTab !== "community") return undefined;
  const controller = new AbortController();
  setSharedLoading(true);
  setSharedError(null);
  void import("@/platform/creator-client")
    .then(({ listSharedAssetCatalog }) => listSharedAssetCatalog({
      limit: 20,
      search: assetSearchQuery.trim() || undefined,
      sort: assetSortOrder === "popular" || assetSortOrder === "name"
        ? assetSortOrder
        : "newest",
    }, controller.signal))
    .then((page) => {
      if (controller.signal.aborted) return;
      setShared(page.items);
      setSharedNextOffset(page.nextOffset);
    })
    .catch((caughtError: unknown) => {
      if (controller.signal.aborted) return;
      setSharedError(caughtError instanceof Error ? caughtError.message : loadFailedMessage());
      setShared([]);
      setSharedNextOffset(null);
    })
    .finally(() => {
      if (!controller.signal.aborted) setSharedLoading(false);
    });
  return () => controller.abort();
}

export async function runStudioRetryMarketplaceCloudSync({
  studioMarketplaceCloudSyncRetry,
  studioMarketplaceCloudSyncRetryPending,
  studioHasAuthenticatedSession,
  studioMarketplaceCloudSyncRetryControllerRef,
  setStudioMarketplaceCloudSyncRetryPending,
  setStudioMarketplaceCloudSyncRetry,
  setError,
  setStatusNotice,
  syncFailedMessage,
  formatSyncFailedDetail,
}: {
  readonly studioMarketplaceCloudSyncRetry: StudioMarketplaceCloudSyncRetryState | null;
  readonly studioMarketplaceCloudSyncRetryPending: boolean;
  readonly studioHasAuthenticatedSession: boolean;
  readonly studioMarketplaceCloudSyncRetryControllerRef: MutableRefObject<AbortController | null>;
  readonly setStudioMarketplaceCloudSyncRetryPending: Dispatch<SetStateAction<boolean>>;
  readonly setStudioMarketplaceCloudSyncRetry: Dispatch<SetStateAction<StudioMarketplaceCloudSyncRetryState | null>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setStatusNotice: Dispatch<SetStateAction<string | null>>;
  readonly syncFailedMessage: string;
  readonly formatSyncFailedDetail: (name: string, issue: string) => string;
}): Promise<void> {
  const retry = studioMarketplaceCloudSyncRetry;
  if (!retry || studioMarketplaceCloudSyncRetryPending) return;
  if (!studioHasAuthenticatedSession) {
    setError("계정 설치 확인을 다시 동기화하려면 로그인해 주세요. 로컬 설치는 유지됩니다.");
    return;
  }
  studioMarketplaceCloudSyncRetryControllerRef.current?.abort();
  const controller = new AbortController();
  studioMarketplaceCloudSyncRetryControllerRef.current = controller;
  setStudioMarketplaceCloudSyncRetryPending(true);
  setError(null);
  setStatusNotice("현재 기기의 정확한 설치와 계정 라이브러리를 다시 확인하고 있어요…");
  try {
    const { retryStudioMarketplaceCloudSyncOperation } =
      await import("../studio-marketplace-deep-link-operation");
    const synchronized = await retryStudioMarketplaceCloudSyncOperation(
      retry.record,
      retry.pack,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    setStudioMarketplaceCloudSyncRetry(null);
    setStatusNotice(`${retry.record.name} · ${synchronized.message}`);
  } catch (caught: unknown) {
    if (controller.signal.aborted) return;
    const issue = caught instanceof Error && caught.message.trim()
      ? caught.message
      : syncFailedMessage;
    setStudioMarketplaceCloudSyncRetry({ ...retry, issue });
    setStatusNotice(null);
    setError(formatSyncFailedDetail(retry.record.name, issue));
  } finally {
    if (studioMarketplaceCloudSyncRetryControllerRef.current === controller) {
      studioMarketplaceCloudSyncRetryControllerRef.current = null;
      setStudioMarketplaceCloudSyncRetryPending(false);
    }
  }
}

export async function runStudioShareAsset({
  asset,
  options,
  studioAuthUserId,
  setPublishingId,
  setAssetTab,
  loadSharedAssets,
  setError,
  shareFailedMessage,
}: {
  readonly asset: StudioAsset;
  readonly options: StudioAssetShareOptions;
  readonly studioAuthUserId: string | null;
  readonly setPublishingId: Dispatch<SetStateAction<string | null>>;
  readonly setAssetTab: Dispatch<SetStateAction<StudioAssetTab>>;
  readonly loadSharedAssets: () => Promise<void>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly shareFailedMessage: string;
}): Promise<void> {
  if (!studioAuthUserId) {
    setError("에셋을 공유하려면 로그인이 필요해요.");
    return;
  }
  setPublishingId(asset.id);
  try {
    const { publishAsset } = await import("@/platform/creator-client");
    await publishAsset({
      name: asset.name,
      dataUrl: asset.dataUrl,
      width: asset.width,
      height: asset.height,
      kind: "image",
      ...options,
    });
    setAssetTab("community");
    await loadSharedAssets();
  } catch (err) {
    setError(err instanceof Error ? err.message : shareFailedMessage);
  } finally {
    setPublishingId(null);
  }
}

export async function runStudioDeleteSharedAsset({
  id,
  removeAssetFavorite,
  loadSharedAssets,
  setError,
  deleteFailedMessage,
}: {
  readonly id: string;
  readonly removeAssetFavorite: (favoriteId: string) => void;
  readonly loadSharedAssets: () => Promise<void>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly deleteFailedMessage: string;
}): Promise<void> {
  try {
    const { deleteSharedAsset } = await import("@/platform/creator-client");
    await deleteSharedAsset(id);
    removeAssetFavorite(createStudioAssetFavoriteId("community", id));
    await loadSharedAssets();
  } catch (err) {
    setError(err instanceof Error ? err.message : deleteFailedMessage);
  }
}

export async function runStudioReportSharedAsset({
  asset,
  reason,
  details,
  studioAuthUserId,
  announceDrawingShortcut,
  loadSharedAssets,
  setError,
  reportFailedMessage,
}: {
  readonly asset: SharedAssetCatalogItem;
  readonly reason: CreatorAssetReportReason;
  readonly details: string;
  readonly studioAuthUserId: string | null;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly loadSharedAssets: () => Promise<void>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly reportFailedMessage: string;
}): Promise<void> {
  if (!studioAuthUserId) {
    setError("에셋을 신고하려면 로그인이 필요해요.");
    return;
  }
  try {
    const { reportSharedAsset } = await import("@/platform/creator-client");
    await reportSharedAsset(asset.id, { reason, details });
    announceDrawingShortcut("신고가 접수되었습니다. 검수 결과에 따라 공개 상태가 조정됩니다.");
    await loadSharedAssets();
  } catch (err) {
    setError(err instanceof Error ? err.message : reportFailedMessage);
  }
}

export async function runStudioAddDialogueBubbles<TDeferredAction>({
  targetFrameId,
  dialogueScript,
  comipoActionBusyRef,
  captureDeferredComipoAction,
  canApplyDeferredComipoAction,
  studioInsertState,
  commit,
  setDialogueScript,
  setMenu,
  setTool,
  setError,
  placeFailedMessage,
  engineLoadFailedMessage,
}: {
  readonly targetFrameId?: string;
  readonly dialogueScript: string;
  readonly comipoActionBusyRef: MutableRefObject<boolean>;
  readonly captureDeferredComipoAction: () => TDeferredAction;
  readonly canApplyDeferredComipoAction: (action: TDeferredAction) => boolean;
  readonly studioInsertState: () => StudioPageInsertState;
  readonly commit: (nextElements: El[]) => boolean;
  readonly setDialogueScript: Dispatch<SetStateAction<string>>;
  readonly setMenu: (next: null) => void;
  readonly setTool: Dispatch<SetStateAction<Tool>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly placeFailedMessage: string;
  readonly engineLoadFailedMessage: string;
}): Promise<void> {
  if (!dialogueScript.trim()) return;
  if (comipoActionBusyRef.current) return;
  const deferredAction = captureDeferredComipoAction();
  const script = dialogueScript;
  comipoActionBusyRef.current = true;
  try {
    const { runStudioPageAddDialogueBubbles } = await loadStudioComipoShipped();
    if (!canApplyDeferredComipoAction(deferredAction)) return;
    const result = runStudioPageAddDialogueBubbles(studioInsertState(), script, uid, targetFrameId);
    if (!result.ok) {
      setError(placeFailedMessage);
      return;
    }
    if (!commit(result.elements as El[])) return;
    setDialogueScript((current) => (current === script ? "" : current));
    setMenu(null);
    setTool("select");
  } catch (error) {
    console.error("Failed to load the Studio dialogue insertion engine:", error);
    if (canApplyDeferredComipoAction(deferredAction)) {
      setError(engineLoadFailedMessage);
    }
  } finally {
    comipoActionBusyRef.current = false;
  }
}

export function runStudioApplyTranslationDraft({
  translateDraft,
  pages,
  translateTargetLocale,
  commitPages,
  setActiveDialogueLocale,
  setTranslateDraft,
}: {
  readonly translateDraft: Map<string, string> | null;
  readonly pages: PageState[];
  readonly translateTargetLocale: string;
  readonly commitPages: (nextPages: PageState[]) => boolean;
  readonly setActiveDialogueLocale: Dispatch<SetStateAction<string>>;
  readonly setTranslateDraft: Dispatch<SetStateAction<Map<string, string> | null>>;
}): void {
  if (!translateDraft || translateDraft.size === 0) return;
  const results = collectDialogueItems(pages)
    .filter((it) => translateDraft.has(it.id))
    .map((it) => ({ id: it.id, pageId: it.pageId, text: translateDraft.get(it.id)! }));
  const withTranslations = applyDialogueTranslations(pages, results, translateTargetLocale);
  const switched = switchDialogueLocale(withTranslations, translateTargetLocale);
  if (switched === pages || commitPages(switched as PageState[])) {
    setActiveDialogueLocale(translateTargetLocale);
    setTranslateDraft(null);
  }
}

export function buildStudioMenuAssetLoaderEntries({
  menu, panelLayoutPresetsLength, sceneTemplatePacksLoaded, sfxPacksLoaded,
  studioBgSceneAssetsLoaded, studioStickerAssetsLoaded, studioEmeresAssetsLoaded,
  setPanelLayoutsLoading, setPanelLayoutsError, setPanelLayoutPresets,
  setSceneTemplatesLoading, setSceneTemplatesError, setSceneTemplatePacks,
  setSfxLoading, setSfxError, setSfxPacks,
  setStudioBgSceneAssetsLoading, setStudioBgSceneAssetsError, setStudioBgSceneAssetsLoaded,
  setStudioStickerAssetsLoading, setStudioStickerAssetsError, setStudioStickerAssetsLoaded,
  setStudioEmeresAssetsLoading, setStudioEmeresAssetsError, setStudioEmeresAssetsLoaded,
  setStudioOptionalAssets, loadBgScenes, loadStickerAssets, errorMessages,
}: {
  readonly menu: string | null;
  readonly panelLayoutPresetsLength: number;
  readonly sceneTemplatePacksLoaded: boolean;
  readonly sfxPacksLoaded: boolean;
  readonly studioBgSceneAssetsLoaded: boolean;
  readonly studioStickerAssetsLoaded: boolean;
  readonly studioEmeresAssetsLoaded: boolean;
  readonly setPanelLayoutsLoading: Dispatch<SetStateAction<boolean>>;
  readonly setPanelLayoutsError: Dispatch<SetStateAction<string | null>>;
  readonly setPanelLayoutPresets: Dispatch<SetStateAction<PanelLayoutPreset[]>>;
  readonly setSceneTemplatesLoading: Dispatch<SetStateAction<boolean>>;
  readonly setSceneTemplatesError: Dispatch<SetStateAction<string | null>>;
  readonly setSceneTemplatePacks: Dispatch<SetStateAction<StudioSceneTemplatePacks | null>>;
  readonly setSfxLoading: Dispatch<SetStateAction<boolean>>;
  readonly setSfxError: Dispatch<SetStateAction<string | null>>;
  readonly setSfxPacks: Dispatch<SetStateAction<StudioSfxPacks | null>>;
  readonly setStudioBgSceneAssetsLoading: Dispatch<SetStateAction<boolean>>;
  readonly setStudioBgSceneAssetsError: Dispatch<SetStateAction<string | null>>;
  readonly setStudioBgSceneAssetsLoaded: Dispatch<SetStateAction<boolean>>;
  readonly setStudioStickerAssetsLoading: Dispatch<SetStateAction<boolean>>;
  readonly setStudioStickerAssetsError: Dispatch<SetStateAction<string | null>>;
  readonly setStudioStickerAssetsLoaded: Dispatch<SetStateAction<boolean>>;
  readonly setStudioEmeresAssetsLoading: Dispatch<SetStateAction<boolean>>;
  readonly setStudioEmeresAssetsError: Dispatch<SetStateAction<string | null>>;
  readonly setStudioEmeresAssetsLoaded: Dispatch<SetStateAction<boolean>>;
  readonly setStudioOptionalAssets: Dispatch<SetStateAction<StudioOptionalAssetPacks>>;
  readonly loadBgScenes: () => Promise<[
    typeof import("../studio-bg-scenes"),
    typeof import("../studio-bg-scenes-extra"),
  ]>;
  readonly loadStickerAssets: () => Promise<[
    typeof import("../studio-fx-assets"),
    typeof import("../studio-creature-stickers"),
    typeof import("../studio-prop-stickers"),
  ]>;
  readonly errorMessages: {
    readonly panelLayouts: string;
    readonly sceneTemplates: string;
    readonly sfxPresets: string;
    readonly bgScenes: string;
    readonly stickerAssets: string;
    readonly emeresFrames: string;
  };
}): readonly StudioMenuAssetLoaderEntry[] {
  return [
    {
      active: menu === "template",
      loaded: panelLayoutPresetsLength > 0,
      setLoading: setPanelLayoutsLoading,
      setError: setPanelLayoutsError,
      logLabel: "Failed to load studio panel layouts:",
      errorMessage: errorMessages.panelLayouts,
      load: () =>
        import("../studio-panel-layouts").then((mod) => () => {
          setPanelLayoutPresets(mod.PANEL_LAYOUTS);
        }),
    },
    {
      active: menu === "scene",
      loaded: sceneTemplatePacksLoaded,
      setLoading: setSceneTemplatesLoading,
      setError: setSceneTemplatesError,
      logLabel: "Failed to load studio scene templates:",
      errorMessage: errorMessages.sceneTemplates,
      load: () =>
        import("../studio-scene-templates").then((mod) => () => {
          setSceneTemplatePacks({
            categories: mod.SCENE_TEMPLATE_CATEGORIES,
            templates: mod.SCENE_TEMPLATES,
          });
        }),
    },
    {
      active: menu === "sticker",
      loaded: sfxPacksLoaded,
      setLoading: setSfxLoading,
      setError: setSfxError,
      logLabel: "Failed to load studio SFX presets:",
      errorMessage: errorMessages.sfxPresets,
      load: () =>
        Promise.resolve(() => {
          setSfxPacks({
            categories: SFX_CATEGORIES,
            presets: SFX_LIBRARY,
          });
        }),
    },
    {
      active: menu === "bgScene",
      loaded: studioBgSceneAssetsLoaded,
      setLoading: setStudioBgSceneAssetsLoading,
      setError: setStudioBgSceneAssetsError,
      logLabel: "Failed to load studio background scenes:",
      errorMessage: errorMessages.bgScenes,
      load: () =>
        loadBgScenes().then(([bgScenes, bgScenesExtra]) => () => {
          const allScenes = [...bgScenes.BG_SCENES, ...bgScenesExtra.BG_SCENES_EXTRA];
          setStudioOptionalAssets((prev) => ({
            ...prev,
            bgSceneSections: bgScenes.bgSceneSections(allScenes),
            bgSceneGenreGroups: bgScenes.groupBgScenes(allScenes),
          }));
          setStudioBgSceneAssetsLoaded(true);
        }),
    },
    {
      active: menu === "sticker",
      loaded: studioStickerAssetsLoaded,
      setLoading: setStudioStickerAssetsLoading,
      setError: setStudioStickerAssetsError,
      logLabel: "Failed to load studio sticker assets:",
      errorMessage: errorMessages.stickerAssets,
      load: () =>
        loadStickerAssets().then(([fxAssets, creatureAssets, propAssets]) => () => {
          setStudioOptionalAssets((prev) => ({
            ...prev,
            comicVectorStickers: fxAssets.COMIC_VECTOR_STICKERS,
            creatureStickers: creatureAssets.CREATURE_STICKERS,
            propStickers: propAssets.PROP_STICKERS,
            fxOverlays: fxAssets.FX_OVERLAYS,
          }));
          setStudioStickerAssetsLoaded(true);
        }),
    },
    {
      active: menu === "emeres",
      loaded: studioEmeresAssetsLoaded,
      setLoading: setStudioEmeresAssetsLoading,
      setError: setStudioEmeresAssetsError,
      logLabel: "Failed to load studio emeres templates:",
      errorMessage: errorMessages.emeresFrames,
      load: () =>
        import("../studio-emeres-templates").then((emeres) => () => {
          setStudioOptionalAssets((prev) => ({
            ...prev,
            emeresSections: emeres.emeresSections(),
            emeresUnderlayOpacity: emeres.EMERES_DEFAULT_OPACITY,
          }));
          setStudioEmeresAssetsLoaded(true);
        }),
    },
  ];
}
