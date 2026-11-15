import { useCallback, useState, useSyncExternalStore } from "react";
import type { SpaceAtmosphere } from "./hud/SpaceAtmosphereSettings";
import {
  studioBuildCatalogEntryById,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import type { StudioCameraPanStore } from "./studio-virtual-space-camera-pan";
import {
  parseStudioVirtualDecorationState,
  type StudioVirtualDecorPlacement,
  type StudioVirtualDecorationState,
} from "./studio-virtual-space-customization";
import {
  studioVirtualDecorBounds,
  studioVirtualDecorationNavigationWorld,
  studioVirtualDecorationStateForWorld,
} from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import { studioAmbientLightFor, studioDayPhaseLabel, type StudioLightFixture } from "./studio-virtual-space-lighting";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_SPACE_THEME_KEYS, type StudioSpaceThemeKey } from "./studio-virtual-space-theme";
import type { StudioUserZoomStore } from "./studio-virtual-space-user-zoom";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import {
  resolveStudioWorldSpawn,
  studioWorldCanOccupy,
} from "./studio-virtual-space-world-pathfinding";
import type { StudioSpaceLightingSnapshot } from "./use-studio-space-lighting";

export const STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX = 12;

export interface StudioVirtualSceneCameraSnapshot {
  readonly zoomLevel: number;
  readonly panOffsetX: number;
  readonly panOffsetY: number;
}

export interface StudioVirtualSceneFurnitureSnapshot {
  readonly decorations: StudioVirtualDecorationState;
  readonly placedFixtureRequests: readonly StudioBuildPlacementRequest[];
}

export interface StudioVirtualSceneStateInput {
  readonly camera: StudioVirtualSceneCameraSnapshot;
  readonly lighting: StudioSpaceLightingSnapshot;
  readonly environment: StudioVirtualEnvironmentPreference;
  readonly spaceTheme: StudioSpaceThemeKey;
  readonly atmosphere: SpaceAtmosphere;
  readonly furniture: StudioVirtualSceneFurnitureSnapshot;
}

export interface StudioVirtualSceneSnapshot extends StudioVirtualSceneStateInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly clonedFromId?: string;
}

export type StudioVirtualSceneRestorePlan =
  | {
      readonly ok: true;
      readonly camera: StudioVirtualSceneCameraSnapshot;
      readonly lighting: StudioSpaceLightingSnapshot;
      readonly environment: StudioVirtualEnvironmentPreference;
      readonly spaceTheme: StudioSpaceThemeKey;
      readonly atmosphere: SpaceAtmosphere;
      readonly decorations: StudioVirtualDecorationState;
      readonly placedFixtureRequests: readonly StudioBuildPlacementRequest[];
      readonly relocatedSelfPoint: StudioVirtualSpacePoint | null;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid-snapshot" | "incompatible-world" | "no-safe-spawn";
    };

export interface StudioVirtualSceneSnapshotBinding {
  readonly snapshots: readonly StudioVirtualSceneSnapshot[];
  readonly liveSummary: string;
  readonly notice: string | null;
  readonly onCapture: () => void;
  readonly onDuplicate: (id: string) => void;
  readonly onRestore: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

const sessionSnapshotsByScope = new Map<string, readonly StudioVirtualSceneSnapshot[]>();
let snapshotSequence = 0;

function nextSnapshotId(): string {
  snapshotSequence += 1;
  return `vs-snap-${Date.now().toString(36)}-${snapshotSequence}`;
}

function clonePlacement(item: StudioVirtualDecorPlacement): StudioVirtualDecorPlacement {
  return Object.freeze({
    id: item.id,
    type: item.type,
    ...(item.assetId !== undefined ? { assetId: item.assetId } : {}),
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    scale: item.scale,
  });
}

function cloneDecorations(state: StudioVirtualDecorationState): StudioVirtualDecorationState {
  return Object.freeze({
    presetKey: state.presetKey,
    districtKey: state.districtKey,
    presentationMode: state.presentationMode,
    placements: Object.freeze(state.placements.map(clonePlacement)),
    revision: state.revision,
    ...(state.layoutWidth !== undefined ? { layoutWidth: state.layoutWidth } : {}),
    ...(state.layoutHeight !== undefined ? { layoutHeight: state.layoutHeight } : {}),
  });
}

function cloneFixtureRequest(req: StudioBuildPlacementRequest): StudioBuildPlacementRequest {
  return Object.freeze({
    entryId: req.entryId,
    category: req.category,
    refId: req.refId,
    point: Object.freeze({ x: req.point.x, y: req.point.y }),
    rotation: req.rotation,
  });
}

function cloneLightFixture(fixture: StudioLightFixture): StudioLightFixture {
  return Object.freeze({
    id: fixture.id,
    kind: fixture.kind,
    position: Object.freeze({ x: fixture.position.x, y: fixture.position.y }),
    radius: fixture.radius,
    on: fixture.on,
    dimmer: fixture.dimmer,
    warm: fixture.warm,
  });
}

function cloneLighting(lighting: StudioSpaceLightingSnapshot): StudioSpaceLightingSnapshot {
  return Object.freeze({
    dayNightEnabled: lighting.dayNightEnabled,
    dayNightSpeedMs: lighting.dayNightSpeedMs,
    lightHourOverride: lighting.lightHourOverride,
    lightAutoMode: lighting.lightAutoMode,
    cycleTimeOfDay: lighting.cycleTimeOfDay,
    fixtures: Object.freeze(lighting.fixtures.map(cloneLightFixture)),
  });
}

function cloneEnvironment(env: StudioVirtualEnvironmentPreference): StudioVirtualEnvironmentPreference {
  return Object.freeze({
    version: 1,
    backdrop: env.backdrop,
    dayPhase: env.dayPhase,
    weather: env.weather,
  });
}

function cloneCamera(camera: StudioVirtualSceneCameraSnapshot): StudioVirtualSceneCameraSnapshot {
  return Object.freeze({
    zoomLevel: Number.isFinite(camera.zoomLevel) ? Math.round(camera.zoomLevel * 1000) / 1000 : 1,
    panOffsetX: Number.isFinite(camera.panOffsetX) ? Math.round(camera.panOffsetX) : 0,
    panOffsetY: Number.isFinite(camera.panOffsetY) ? Math.round(camera.panOffsetY) : 0,
  });
}

export function summarizeStudioVirtualSceneState(
  state: StudioVirtualSceneStateInput,
  fallbackHour = 12,
): string {
  const zoomPct = Math.round(state.camera.zoomLevel * 100);
  const panX = Math.round(state.camera.panOffsetX);
  const panY = Math.round(state.camera.panOffsetY);
  const effectiveHour = state.lighting.lightHourOverride ?? fallbackHour;
  const ambient = studioAmbientLightFor(effectiveHour, null);
  const phaseKo = studioDayPhaseLabel(ambient.phase).ko;
  const hourTag = state.lighting.lightHourOverride === null
    ? `실시간(${phaseKo})`
    : `${phaseKo}(${state.lighting.lightHourOverride}시)`;
  const cycleTag = state.lighting.dayNightEnabled ? "주야켜짐" : "고정광";
  const activeLights = state.lighting.fixtures.filter((item) => item.on).length;
  const decorCount = state.furniture.decorations.placements.length;
  const buildCount = state.furniture.placedFixtureRequests.length;
  const firstItem = state.furniture.decorations.placements[0];
  const firstTag = firstItem ? ` · 첫가구(${Math.round(firstItem.x)},${Math.round(firstItem.y)})` : "";
  return `카메라 ${zoomPct}% (${panX},${panY}) · 조명 ${hourTag}/${cycleTag}/점등${activeLights} · 테마 ${state.spaceTheme} · 가구 ${state.furniture.decorations.presetKey} ${decorCount}+${buildCount}개${firstTag}`;
}

export function createStudioVirtualSceneSnapshot(
  state: StudioVirtualSceneStateInput,
  options: {
    readonly id?: string;
    readonly name?: string;
    readonly createdAt?: string;
    readonly existingCount?: number;
    readonly clonedFromId?: string;
  } = {},
): StudioVirtualSceneSnapshot {
  const index = (options.existingCount ?? 0) + 1;
  const rawName = options.name?.trim() || `씬 스냅샷 ${index}`;
  return Object.freeze({
    id: options.id ?? nextSnapshotId(),
    name: rawName.slice(0, 60),
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...(options.clonedFromId ? { clonedFromId: options.clonedFromId } : {}),
    camera: cloneCamera(state.camera),
    lighting: cloneLighting(state.lighting),
    environment: cloneEnvironment(state.environment),
    spaceTheme: state.spaceTheme,
    atmosphere: state.atmosphere,
    furniture: Object.freeze({
      decorations: cloneDecorations(state.furniture.decorations),
      placedFixtureRequests: Object.freeze(
        state.furniture.placedFixtureRequests.map(cloneFixtureRequest),
      ),
    }),
  });
}

export function appendStudioVirtualSceneSnapshot(
  list: readonly StudioVirtualSceneSnapshot[],
  snapshot: StudioVirtualSceneSnapshot,
): readonly StudioVirtualSceneSnapshot[] {
  const next = [...list, snapshot];
  return Object.freeze(
    next.length > STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX
      ? next.slice(next.length - STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX)
      : next,
  );
}

export function duplicateStudioVirtualSceneSnapshot(
  list: readonly StudioVirtualSceneSnapshot[],
  sourceId: string,
  options: { readonly id?: string; readonly createdAt?: string } = {},
): readonly StudioVirtualSceneSnapshot[] | null {
  const idx = list.findIndex((entry) => entry.id === sourceId);
  if (idx < 0 || list.length >= STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX) return null;
  const source = list[idx]!;
  const clone = createStudioVirtualSceneSnapshot(source, {
    ...(options.id ? { id: options.id } : {}),
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    name: `${source.name} 복제본`.slice(0, 60),
    clonedFromId: source.id,
  });
  return Object.freeze([...list.slice(0, idx + 1), clone, ...list.slice(idx + 1)]);
}

export function removeStudioVirtualSceneSnapshot(
  list: readonly StudioVirtualSceneSnapshot[],
  id: string,
): readonly StudioVirtualSceneSnapshot[] {
  return Object.freeze(list.filter((entry) => entry.id !== id));
}

function isValidFixtureRequestsForWorld(
  requests: readonly StudioBuildPlacementRequest[],
  world?: StudioVirtualSpaceWorldManifest,
): boolean {
  for (const req of requests) {
    if (!studioBuildCatalogEntryById(req.entryId)) return false;
    if (!Number.isFinite(req.point.x) || !Number.isFinite(req.point.y)) return false;
    if (![0, 90, 180, 270].includes(req.rotation)) return false;
    if (world && (req.point.x < 0 || req.point.x > world.width || req.point.y < 0 || req.point.y > world.height)) {
      return false;
    }
  }
  return true;
}

export function planStudioVirtualSceneSnapshotRestore(input: {
  readonly snapshot: StudioVirtualSceneSnapshot | null | undefined;
  readonly currentRevision: number;
  readonly world?: StudioVirtualSpaceWorldManifest;
  readonly selfPoint: StudioVirtualSpacePoint;
}): StudioVirtualSceneRestorePlan {
  const { snapshot, currentRevision, world, selfPoint } = input;
  if (!snapshot) return { ok: false, reason: "invalid-snapshot" };
  if (!(STUDIO_SPACE_THEME_KEYS as readonly string[]).includes(snapshot.spaceTheme)) {
    return { ok: false, reason: "invalid-snapshot" };
  }
  if (!["focus", "balanced", "lively"].includes(snapshot.atmosphere)) {
    return { ok: false, reason: "invalid-snapshot" };
  }
  if (
    !Number.isFinite(snapshot.camera.zoomLevel) ||
    snapshot.camera.zoomLevel <= 0 ||
    !Number.isFinite(snapshot.camera.panOffsetX) ||
    !Number.isFinite(snapshot.camera.panOffsetY)
  ) {
    return { ok: false, reason: "invalid-snapshot" };
  }
  const parsedDecorations = parseStudioVirtualDecorationState(snapshot.furniture.decorations);
  if (!parsedDecorations) {
    return { ok: false, reason: "invalid-snapshot" };
  }
  if (world && (!(world.width >= 32) || !(world.height >= 32))) {
    return { ok: false, reason: "incompatible-world" };
  }
  if (!isValidFixtureRequestsForWorld(snapshot.furniture.placedFixtureRequests, world)) {
    return { ok: false, reason: "incompatible-world" };
  }
  const worldAdapted = world
    ? studioVirtualDecorationStateForWorld(parsedDecorations, world)
    : parsedDecorations;
  if (world) {
    for (const item of worldAdapted.placements) {
      const bounds = studioVirtualDecorBounds(item);
      if (
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > world.width ||
        bounds.y + bounds.height > world.height
      ) {
        return { ok: false, reason: "incompatible-world" };
      }
    }
  }
  const nextDecorations = cloneDecorations({
    ...worldAdapted,
    revision: Math.max(currentRevision + 1, worldAdapted.revision + 1),
  });

  let relocatedSelfPoint: StudioVirtualSpacePoint | null = null;
  if (world) {
    const navWorld = studioVirtualDecorationNavigationWorld(world, nextDecorations);
    if (!studioWorldCanOccupy(navWorld, selfPoint)) {
      const safeSpawn = resolveStudioWorldSpawn(navWorld, selfPoint);
      if (!safeSpawn) {
        return { ok: false, reason: "no-safe-spawn" };
      }
      relocatedSelfPoint = Object.freeze({ x: safeSpawn.x, y: safeSpawn.y });
    }
  }

  return Object.freeze({
    ok: true,
    camera: cloneCamera(snapshot.camera),
    lighting: cloneLighting(snapshot.lighting),
    environment: cloneEnvironment(snapshot.environment),
    spaceTheme: snapshot.spaceTheme,
    atmosphere: snapshot.atmosphere,
    decorations: nextDecorations,
    placedFixtureRequests: Object.freeze(
      snapshot.furniture.placedFixtureRequests.map(cloneFixtureRequest),
    ),
    relocatedSelfPoint,
  });
}

export function useStudioVirtualSceneSnapshotBinding(options: {
  readonly scopeKey: string;
  readonly userZoom: StudioUserZoomStore;
  readonly cameraPan: StudioCameraPanStore;
  readonly lighting: StudioSpaceLightingSnapshot;
  readonly fallbackHour: number;
  readonly environment: StudioVirtualEnvironmentPreference;
  readonly spaceTheme: StudioSpaceThemeKey;
  readonly atmosphere: SpaceAtmosphere;
  readonly decorations: StudioVirtualDecorationState;
  readonly placedFixtureRequests: readonly StudioBuildPlacementRequest[];
  readonly world?: StudioVirtualSpaceWorldManifest;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly onApplyRestore: (plan: Extract<StudioVirtualSceneRestorePlan, { readonly ok: true }>) => void;
}): StudioVirtualSceneSnapshotBinding {
  const {
    scopeKey, userZoom, cameraPan, lighting, fallbackHour, environment,
    spaceTheme, atmosphere, decorations, placedFixtureRequests, world, selfPoint, onApplyRestore,
  } = options;
  const zoomSnapshot = useSyncExternalStore(
    (listener) => userZoom.subscribe(listener),
    () => userZoom.getSnapshot(),
    () => userZoom.getSnapshot(),
  );
  useSyncExternalStore(
    (listener) => cameraPan.subscribe(listener),
    () => cameraPan.getSnapshot(),
    () => cameraPan.getSnapshot(),
  );
  const [snapshots, setSnapshotsState] = useState<readonly StudioVirtualSceneSnapshot[]>(
    () => sessionSnapshotsByScope.get(scopeKey) ?? Object.freeze([]),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const setSnapshots = useCallback((updater: (prev: readonly StudioVirtualSceneSnapshot[]) => readonly StudioVirtualSceneSnapshot[]) => {
    setSnapshotsState((prev) => {
      const next = updater(prev);
      sessionSnapshotsByScope.set(scopeKey, next);
      return next;
    });
  }, [scopeKey]);

  const liveOffset = cameraPan.getLiveOffset();
  const currentState: StudioVirtualSceneStateInput = {
    camera: { zoomLevel: zoomSnapshot.level, panOffsetX: liveOffset.x, panOffsetY: liveOffset.y },
    lighting,
    environment,
    spaceTheme,
    atmosphere,
    furniture: { decorations, placedFixtureRequests },
  };
  const liveSummary = summarizeStudioVirtualSceneState(currentState, fallbackHour);

  return {
    snapshots,
    liveSummary,
    notice,
    onCapture: () => {
      const latestOffset = cameraPan.getLiveOffset();
      const captured = createStudioVirtualSceneSnapshot(
        {
          ...currentState,
          camera: { zoomLevel: userZoom.get(), panOffsetX: latestOffset.x, panOffsetY: latestOffset.y },
        },
        { existingCount: snapshots.length },
      );
      setSnapshots((prev) => appendStudioVirtualSceneSnapshot(prev, captured));
      setNotice(`"${captured.name}" 스냅샷에 카메라·조명·가구 배치를 저장했어요.`);
    },
    onDuplicate: (id: string) => {
      let duplicated = false;
      setSnapshots((prev) => {
        const next = duplicateStudioVirtualSceneSnapshot(prev, id);
        if (!next) return prev;
        duplicated = true;
        return next;
      });
      setNotice(
        duplicated
          ? "스냅샷 복제본을 만들었어요. 재배치 뒤 복제본으로 안전하게 되돌릴 수 있어요."
          : `스냅샷은 최대 ${STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX}개까지 보관할 수 있어요.`,
      );
    },
    onRestore: (id: string) => {
      const target = snapshots.find((entry) => entry.id === id);
      const plan = planStudioVirtualSceneSnapshotRestore({
        snapshot: target,
        currentRevision: decorations.revision,
        ...(world ? { world } : {}),
        selfPoint,
      });
      if (!plan.ok) {
        setNotice("스냅샷이 현재 장소 경계와 호환되지 않아 현재 씬을 그대로 유지했어요.");
        return;
      }
      onApplyRestore(plan);
      setNotice(
        plan.relocatedSelfPoint
          ? `"${target?.name ?? "스냅샷"}"으로 복원하고 겹친 캐릭터 위치를 안전 타일로 보정했어요.`
          : `"${target?.name ?? "스냅샷"}"의 카메라·조명·가구 배치를 손상 없이 되돌렸어요.`,
      );
    },
    onDelete: (id: string) => {
      setSnapshots((prev) => removeStudioVirtualSceneSnapshot(prev, id));
      setNotice("선택한 씬 스냅샷을 삭제했어요.");
    },
  };
}
