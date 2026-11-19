/**
 * StudioPage addSceneTemplate / addDialogueBubbles shipped 경로.
 * React setState·commit 제외한 본문은 runStudioPageAdd* 한 곳에만 있다.
 */

import { CANVAS_W } from "./studio-assets";
import { seedBounds } from "./studio-comipo-compose";
import { collectStudioDecorRefs } from "./studio-comipo-incremental";
import {
  mutateComipoSnapshot,
  pickTargetPanelFrame,
  sceneTemplateInsertHeight,
  type ComipoInsertAction,
  type MutateComipoResult,
  type StudioCanvasSnapshot,
} from "./studio-comipo-insert";
import { composeDialogueInPolygon } from "./render/studio-comipo-polygon-dialogue";
import { viewportSpawnCenter, type Rect } from "./studio-selection";

import type { StudioDecorElement } from "./studio-comipo-incremental";
import type { PanelLayoutFrame } from "./studio-panel-layouts";

export type StudioElementLike = {
  id: string;
  type: string;
  hidden?: boolean;
  locked?: boolean;
  points?: readonly number[];
  frameClipId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const DECOR_TYPES = new Set(["bubble", "text", "focusLines", "speedLines"]);

export function isStudioDecorElement(el: StudioElementLike): el is StudioDecorElement {
  return DECOR_TYPES.has(el.type);
}

export type StudioPageSelectedFrame = {
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
};

/** StudioPage 가 addSceneTemplate / addDialogueBubbles 에 넘기는 캔버스·선택 상태. */
export type StudioPageInsertState = {
  elements: readonly StudioElementLike[];
  canvasH: number;
  canvasW?: number;
  selected: StudioPageSelectedFrame | null;
  /** 현재 화면에 실제로 보이는 캔버스 중심. DOM이 없는 테스트/SSR에서는 생략한다. */
  viewCenter?: { x: number; y: number } | null;
};

export function studioSpawnCenter(state: StudioPageInsertState): [number, number] {
  const w = state.canvasW ?? CANVAS_W;
  const selectedRect: Rect | null = state.selected
    ? { x: state.selected.x, y: state.selected.y, w: state.selected.width, h: state.selected.height }
    : null;
  return viewportSpawnCenter(w, state.canvasH, selectedRect, state.viewCenter);
}

/** StudioPage.studioCanvasSnapshot 과 동일 계약. */
export function studioCanvasSnapshotFromElements(
  elements: readonly StudioElementLike[]
): StudioCanvasSnapshot {
  const frames = elements
    .filter(
      (e): e is StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } =>
        e.type === "frame" && !e.hidden && e.x != null && e.y != null && e.width != null && e.height != null
    )
    .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
  return {
    frames,
    decor: elements.filter(isStudioDecorElement) as StudioDecorElement[],
  };
}

function selectedFrameBbox(selected: StudioPageSelectedFrame | null): PanelLayoutFrame | null {
  if (!selected || selected.type !== "frame") return null;
  return {
    x: selected.x,
    y: selected.y,
    width: selected.width,
    height: selected.height,
  };
}

/** StudioPage.addSceneTemplate 의 action 분기(spawnCenter + selected + pickTarget). */
export function buildSceneInsertActionFromPageState(
  snapshot: StudioCanvasSnapshot,
  state: StudioPageInsertState,
  templateId: string
): ComipoInsertAction {
  const [cx, cy] = studioSpawnCenter(state);
  const selectedFrame = selectedFrameBbox(state.selected);
  const target = selectedFrame ?? pickTargetPanelFrame(snapshot.frames, cx, cy);

  if (target && snapshot.frames.length > 0) {
    return { kind: "scene", templateId, targetFrame: target };
  }
  const sceneHeight = sceneTemplateInsertHeight(templateId);
  const margin = 24;
  const maxOriginY = Math.max(margin, state.canvasH - sceneHeight - margin);
  return {
    kind: "scene",
    templateId,
    originY: Math.min(maxOriginY, Math.max(margin, Math.round(cy - sceneHeight / 2))),
    createFrameAtOrigin: true,
  };
}

export type CommitMutationPatch = {
  kept: StudioElementLike[];
  addedFrames: PanelLayoutFrame[];
  decor: StudioDecorElement[];
};

export function planCommitFromMutation(
  elements: readonly StudioElementLike[],
  result: MutateComipoResult
): CommitMutationPatch | null {
  if (!result.ok) return null;

  const decorById = new Map(result.snapshot.decor.map((element) => [element.id, element]));
  const kept: StudioElementLike[] = [];
  for (const element of elements) {
    if (isStudioDecorElement(element)) {
      const updated = decorById.get(element.id);
      if (updated) kept.push(updated);
      decorById.delete(element.id);
    } else {
      kept.push(element);
    }
  }
  const existingFrameKeys = new Set(
    elements
      .filter(
        (e): e is StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } =>
          e.type === "frame" && e.x != null && e.y != null && e.width != null && e.height != null
      )
      .map((f) => `${f.x},${f.y},${f.width},${f.height}`)
  );
  const addedFrames = result.snapshot.frames.filter(
    (f) => !existingFrameKeys.has(`${f.x},${f.y},${f.width},${f.height}`)
  );

  return { kept, addedFrames, decor: [...decorById.values()] };
}

export function frameElFromPanel(
  frame: PanelLayoutFrame,
  id: string
): StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } {
  return {
    id,
    type: "frame",
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

export function applyCommitPatch(
  patch: CommitMutationPatch,
  createId: () => string
): StudioElementLike[] {
  const newFrames = patch.addedFrames.map((f) => frameElFromPanel(f, createId()));
  return [...patch.kept, ...newFrames, ...patch.decor];
}

export type ShippedInsertResult =
  | { ok: false }
  | { ok: true; elements: StudioElementLike[]; snapshot: StudioCanvasSnapshot };

function runInsertMutation(
  elements: readonly StudioElementLike[],
  result: MutateComipoResult,
  createId: () => string,
  fallbackSnapshot: StudioCanvasSnapshot
): ShippedInsertResult {
  const patch = planCommitFromMutation(elements, result);
  if (!patch) return { ok: false };
  return {
    ok: true,
    elements: applyCommitPatch(patch, createId),
    snapshot: result.ok ? result.snapshot : fallbackSnapshot,
  };
}

/** StudioPage.addSceneTemplate 본문(React side-effect 제외). */
export function runStudioPageAddSceneTemplate(
  state: StudioPageInsertState,
  templateId: string,
  createId: () => string
): ShippedInsertResult {
  const snapshot = studioCanvasSnapshotFromElements(state.elements);
  const action = buildSceneInsertActionFromPageState(snapshot, state, templateId);
  const canvasW = state.canvasW ?? CANVAS_W;
  const result = mutateComipoSnapshot(snapshot, action, createId, canvasW);
  return runInsertMutation(state.elements, result, createId, snapshot);
}

/** StudioPage.addDialogueBubbles 본문(React side-effect 제외). */
export function runStudioPageAddDialogueBubbles(
  state: StudioPageInsertState,
  dialogueScript: string,
  createId: () => string,
  targetFrameId?: string,
): ShippedInsertResult {
  if (!dialogueScript.trim()) return { ok: false };
  const snapshot = studioCanvasSnapshotFromElements(state.elements);
  const canvasW = state.canvasW ?? CANVAS_W;
  let targetFrame: PanelLayoutFrame | undefined;
  if (targetFrameId !== undefined) {
    const frame = state.elements.find(element => element.id === targetFrameId);
    if (!frame || frame.type !== "frame" || frame.hidden || frame.locked) return { ok: false };
    const { x, y, width, height } = frame;
    if (x == null || y == null || width == null || height == null
      || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return { ok: false };
    targetFrame = { x, y, width, height };
    if (frame.points?.length) {
      const decor = state.elements.filter(element => element.frameClipId === undefined || element.frameClipId === targetFrameId)
        .filter(isStudioDecorElement);
      const occupied = collectStudioDecorRefs(targetFrame, decor).map(ref => seedBounds(ref.seed));
      const bubbles = composeDialogueInPolygon(dialogueScript, { ...targetFrame, points: frame.points }, canvasW, occupied);
      if (!bubbles) return { ok: false };
      const added = bubbles.map(bubble => ({ ...bubble, id: createId(), frameClipId: targetFrameId }));
      return { ok: true, elements: [...state.elements, ...added], snapshot: { frames: snapshot.frames, decor: [...snapshot.decor, ...added] } };
    }
  }
  const result = mutateComipoSnapshot(
    snapshot,
    { kind: "dialogue", script: dialogueScript, targetFrame },
    createId,
    canvasW
  );
  return runInsertMutation(state.elements, result, createId, snapshot);
}
