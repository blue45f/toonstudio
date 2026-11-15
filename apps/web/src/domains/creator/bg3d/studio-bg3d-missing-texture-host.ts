"use no memo";

import { useEffect, useRef, useState } from "react";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import {
  deleteStudioBg3dModelCacheVariants,
  readStudioBg3dModelCacheEntry,
  studioBg3dModalOperationCoordinator,
  type ModelRootCacheEntry,
} from "./studio-bg3d-editor-runtime-bindings";
import {
  decodeStudioBg3dRelinkTextureFile,
  disposeStudioBg3dRelinkedTexture,
  readStudioBg3dGlbMissingTextureReport,
  type StudioBg3dGlbTextureSlot,
  type StudioBg3dInstanceMissingTextureState,
} from "./studio-bg3d-glb-missing-textures";
import type { StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import type { StudioBg3dModalSession } from "./studio-bg3d-modal-operation-coordinator";

export interface StudioBg3dMissingTextureSlotViewItem {
  readonly slotKey: string;
  readonly materialKey: string;
  readonly materialName: string;
  readonly slot: StudioBg3dGlbTextureSlot;
  readonly slotLabel: string;
  readonly imageName: string | null;
  readonly fallbackPreviewEnabled: boolean;
  readonly relinkedFileName: string | null;
}

export interface StudioBg3dMissingTextureInstanceViewItem {
  readonly instanceId: string;
  readonly instanceLabel: string;
  readonly modelId: string;
  readonly selected: boolean;
  readonly totalMaterialCount: number;
  readonly problemMaterialCount: number;
  readonly healthyMaterialCount: number;
  readonly retryingSource: boolean;
  readonly slots: readonly StudioBg3dMissingTextureSlotViewItem[];
}

export interface StudioBg3dMissingTexturePorts {
  readonly items: readonly StudioBg3dMissingTextureInstanceViewItem[];
  readonly overridesByInstanceId: ReadonlyMap<
    string,
    StudioBg3dInstanceMissingTextureState
  >;
  readonly notice: { readonly tone: "info" | "error" | "success"; readonly message: string } | null;
  readonly busy: boolean;
  readonly onSelectInstance: (instanceId: string) => void;
  readonly onToggleFallbackPreview: (instanceId: string, slotKey: string) => void;
  readonly onRelinkSlotFile: (
    instanceId: string,
    slotKey: string,
    slot: StudioBg3dGlbTextureSlot,
    slotSummaryLabel: string,
    file: File,
  ) => Promise<void>;
  readonly onClearSlotRelink: (
    instanceId: string,
    slotKey: string,
    slotSummaryLabel: string,
  ) => void;
  readonly onRetryOriginalSource: (modelId: string, instanceLabel: string) => Promise<void>;
}

export interface StudioBg3dMissingTextureHostInput {
  readonly modalAssetSessionRef: { readonly current: StudioBg3dModalSession | null };
  readonly isModalAssetSessionCurrent: (session: StudioBg3dModalSession) => boolean;
  readonly customModels: readonly BgCustomModelInstance[];
  readonly selectedIds: ReadonlySet<string>;
  readonly stableEntityLabels?: ReadonlyMap<string, string>;
  readonly modelRootCacheRef: { readonly current: Map<string, ModelRootCacheEntry> };
  readonly materialBackend: StudioBg3dMaterialBackend;
  readonly busy: boolean;
  readonly ensureModelRootCached: (
    modelId: string,
    session: StudioBg3dModalSession,
    isOperationCurrent: () => boolean,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readonly setSelectedIds: (
    next: Set<string> | ((current: Set<string>) => Set<string>),
  ) => void;
  readonly setSelectedSharedCharacterElementId?: (id: string | null) => void;
  readonly setRefTick: (updater: (revision: number) => number) => void;
}

function disposeAllOverrides(
  map: ReadonlyMap<string, StudioBg3dInstanceMissingTextureState>,
): void {
  for (const instanceState of map.values()) {
    for (const slotState of Object.values(instanceState)) {
      disposeStudioBg3dRelinkedTexture(slotState.relinkedTexture);
    }
  }
}

export function useStudioBg3dMissingTextureHost(
  host: StudioBg3dMissingTextureHostInput,
): StudioBg3dMissingTexturePorts {
  const [overridesByInstanceId, setOverridesByInstanceId] = useState<
    ReadonlyMap<string, StudioBg3dInstanceMissingTextureState>
  >(() => new Map());
  const [retryingModelIds, setRetryingModelIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [notice, setNotice] = useState<{
    readonly tone: "info" | "error" | "success";
    readonly message: string;
  } | null>(null);

  const overridesRef = useRef(overridesByInstanceId);
  overridesRef.current = overridesByInstanceId;
  const activeModalSession = host.modalAssetSessionRef.current;
  const lastSessionRef = useRef<StudioBg3dModalSession | null>(activeModalSession);

  useEffect(() => {
    if (lastSessionRef.current !== activeModalSession) {
      lastSessionRef.current = activeModalSession;
      disposeAllOverrides(overridesRef.current);
      setOverridesByInstanceId(new Map());
      setRetryingModelIds(new Set());
      setNotice(null);
    }
  }, [activeModalSession]);

  useEffect(
    () => () => {
      disposeAllOverrides(overridesRef.current);
    },
    [],
  );

  // Prune overrides for deleted instances so GPU textures do not linger
  useEffect(() => {
    const liveIds = new Set(host.customModels.map((model) => model.id));
    let removedAny = false;
    for (const [instanceId, state] of overridesRef.current) {
      if (!liveIds.has(instanceId)) {
        removedAny = true;
        for (const slotState of Object.values(state)) {
          disposeStudioBg3dRelinkedTexture(slotState.relinkedTexture);
        }
      }
    }
    if (removedAny) {
      setOverridesByInstanceId((previous) => {
        const next = new Map<string, StudioBg3dInstanceMissingTextureState>();
        for (const [id, state] of previous) {
          if (liveIds.has(id)) next.set(id, state);
        }
        return next;
      });
    }
  }, [host.customModels]);

  const items: StudioBg3dMissingTextureInstanceViewItem[] = [];
  for (const instance of host.customModels) {
    const cacheEntry = readStudioBg3dModelCacheEntry(
      host.modelRootCacheRef.current,
      instance.modelId,
      host.materialBackend,
    );
    const report = readStudioBg3dGlbMissingTextureReport(cacheEntry?.root);
    if (!report || report.missingSlots.length === 0) continue;
    const instanceState = overridesByInstanceId.get(instance.id);
    const instanceLabel =
      host.stableEntityLabels?.get(instance.id) ??
      instance.name?.trim() ??
      cacheEntry?.record.name ??
      "3D 모델";
    items.push({
      instanceId: instance.id,
      instanceLabel,
      modelId: instance.modelId,
      selected: host.selectedIds.has(instance.id),
      totalMaterialCount: report.totalMaterialCount,
      problemMaterialCount: report.problemMaterialCount,
      healthyMaterialCount: report.healthyMaterialCount,
      retryingSource: retryingModelIds.has(instance.modelId),
      slots: report.missingSlots.map((slot) => {
        const slotState = instanceState?.[slot.slotKey];
        return {
          slotKey: slot.slotKey,
          materialKey: slot.materialKey,
          materialName: slot.materialName,
          slot: slot.slot,
          slotLabel: slot.slotLabel,
          imageName: slot.imageName,
          fallbackPreviewEnabled: slotState?.fallbackPreviewEnabled ?? true,
          relinkedFileName: slotState?.relinkedFileName ?? null,
        };
      }),
    });
  }

  return {
    items,
    overridesByInstanceId,
    notice,
    busy: host.busy,
    onSelectInstance: (instanceId: string) => {
      host.setSelectedSharedCharacterElementId?.(null);
      host.setSelectedIds(new Set([instanceId]));
    },
    onToggleFallbackPreview: (instanceId: string, slotKey: string) => {
      setOverridesByInstanceId((previous) => {
        const next = new Map(previous);
        const currentInstance = next.get(instanceId) ?? {};
        const currentSlot = currentInstance[slotKey];
        const nextEnabled = !(currentSlot?.fallbackPreviewEnabled ?? true);
        next.set(instanceId, {
          ...currentInstance,
          [slotKey]: {
            ...currentSlot,
            fallbackPreviewEnabled: nextEnabled,
          },
        });
        return next;
      });
    },
    onRelinkSlotFile: async (
      instanceId: string,
      slotKey: string,
      slot: StudioBg3dGlbTextureSlot,
      slotSummaryLabel: string,
      file: File,
    ) => {
      const session = host.modalAssetSessionRef.current;
      try {
        const texture = await decodeStudioBg3dRelinkTextureFile(file, slot);
        if (session && !host.isModalAssetSessionCurrent(session)) {
          disposeStudioBg3dRelinkedTexture(texture);
          return;
        }
        setOverridesByInstanceId((previous) => {
          const next = new Map(previous);
          const currentInstance = next.get(instanceId) ?? {};
          const existing = currentInstance[slotKey];
          if (existing?.relinkedTexture && existing.relinkedTexture !== texture) {
            disposeStudioBg3dRelinkedTexture(existing.relinkedTexture);
          }
          next.set(instanceId, {
            ...currentInstance,
            [slotKey]: {
              fallbackPreviewEnabled: existing?.fallbackPreviewEnabled ?? true,
              relinkedTexture: texture,
              relinkedFileName: file.name,
            },
          });
          return next;
        });
        setNotice({
          tone: "success",
          message: `${slotSummaryLabel}에 ${file.name} 텍스처를 다시 연결했어요. 다른 재질은 그대로 유지돼요.`,
        });
      } catch (error) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "선택한 이미지를 연결하지 못했어요. PNG·JPG·WebP 파일로 다시 시도해 주세요.",
        });
      }
    },
    onClearSlotRelink: (
      instanceId: string,
      slotKey: string,
      slotSummaryLabel: string,
    ) => {
      setOverridesByInstanceId((previous) => {
        const currentInstance = previous.get(instanceId);
        const existing = currentInstance?.[slotKey];
        if (!existing?.relinkedTexture) return previous;
        disposeStudioBg3dRelinkedTexture(existing.relinkedTexture);
        const next = new Map(previous);
        next.set(instanceId, {
          ...currentInstance,
          [slotKey]: {
            fallbackPreviewEnabled: existing.fallbackPreviewEnabled,
            relinkedTexture: null,
            relinkedFileName: null,
          },
        });
        return next;
      });
      setNotice({
        tone: "info",
        message: `${slotSummaryLabel}의 수동 연결을 해제하고 대체 미리보기로 되돌렸어요.`,
      });
    },
    onRetryOriginalSource: async (modelId: string, instanceLabel: string) => {
      const session = host.modalAssetSessionRef.current;
      if (!session || !host.isModalAssetSessionCurrent(session) || host.busy) return;
      if (retryingModelIds.has(modelId)) return;

      setRetryingModelIds((prev) => new Set([...prev, modelId]));
      const cache = host.modelRootCacheRef.current;
      const previousEntries = new Map<string, ModelRootCacheEntry>();
      for (const [key, entry] of cache) {
        if (entry.record.id === modelId) previousEntries.set(key, entry);
      }
      const removed = deleteStudioBg3dModelCacheVariants(cache, modelId);

      try {
        await studioBg3dModalOperationCoordinator.runSceneMutation(
          session,
          async (lease: {
            readonly isCurrent: () => boolean;
            readonly signal: AbortSignal;
            readonly throwIfRevoked: () => void;
          }) => {
            lease.throwIfRevoked();
            await host.ensureModelRootCached(
              modelId,
              session,
              lease.isCurrent,
              lease.signal,
            );
            lease.throwIfRevoked();
          },
          () => {
            const reloaded = readStudioBg3dModelCacheEntry(
              cache,
              modelId,
              host.materialBackend,
            );
            const nextReport = readStudioBg3dGlbMissingTextureReport(reloaded?.root);
            host.setRefTick((revision) => revision + 1);
            if (!nextReport || nextReport.missingSlots.length === 0) {
              setNotice({
                tone: "success",
                message: `${instanceLabel}의 원본 텍스처를 모두 정상 복구했어요.`,
              });
            } else {
              setNotice({
                tone: "info",
                message: `${instanceLabel} 원본을 다시 확인했지만 ${nextReport.missingSlots.length}개 슬롯은 여전히 비어 있어 대체 미리보기를 유지해요.`,
              });
            }
          },
        );
        setTimeout(() => {
          for (const oldEntry of removed) {
            try {
              oldEntry.dispose();
            } catch {
              // ignore
            }
          }
        }, 120);
      } catch {
        // Restore previous cache entries so the live scene is never left blank
        for (const [key, entry] of previousEntries) {
          if (!cache.has(key)) cache.set(key, entry);
        }
        host.setRefTick((revision) => revision + 1);
        setNotice({
          tone: "error",
          message: `${instanceLabel} 원본을 다시 불러오지 못해 현재 대체 미리보기를 그대로 유지했어요.`,
        });
      } finally {
        setRetryingModelIds((prev) => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
      }
    },
  };
}
