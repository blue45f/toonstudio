import {
  COMPARE_VIEWPORT_IDENTITY, clampComparePan, clampCompareScale,
  compareSourceKey, type CompareSession, type CompareSourceRef, type SharedCompareViewport,
} from "./compare-review-model";
import type { VoiceViewSnapshot } from "./review-voice-commentary-model";

/** 이미지 주소나 풀 항목을 복제하지 않고, 이미 접근 가능한 소스의 표시 상태만 보관한다. */
export interface VoiceCompareView {
  readonly version: 1;
  readonly panes: readonly CompareSourceRef[];
  readonly mode: CompareSession["mode"];
  readonly syncView: boolean;
  readonly offsets: readonly { readonly source: CompareSourceRef; readonly dx: number; readonly dy: number }[];
  readonly flipBoth: boolean;
  readonly flipVertical: boolean;
  readonly diffOn: boolean;
  readonly overlayOpacity: number;
  readonly shared: SharedCompareViewport;
  readonly locals: readonly SharedCompareViewport[];
  readonly sliderPosition: number;
  readonly blink: { readonly enabled: boolean; readonly intervalMs: number; readonly phase: boolean };
  readonly focusedPane: number;
}
export interface VoiceCompareCapture { readonly view: VoiceViewSnapshot; readonly pinThreadIds: readonly string[] }
export interface VoiceCompareController {
  capture(): VoiceCompareCapture | null;
  /** 아직 불러오지 못한 소스가 있으면 구성을 부분 적용하지 않고 false를 반환한다. */
  apply(view: VoiceViewSnapshot, pinThreadIds: readonly string[]): boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
/** JSON 저장에서 구분되지 않는 영 표현은 동일한 화면 상태 한 가지로 고정한다. */
function canonicalZero(value: number): number { return value === 0 ? 0 : value; }
function bounded(value: unknown, min: number, max: number): value is number { return finite(value) && value >= min && value <= max; }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500; }
function source(value: unknown): CompareSourceRef | null {
  if (!record(value)) return null;
  switch (value.kind) {
    case "revision": return exactKeys(value, ["kind", "processId", "revisionId"]) && identifier(value.processId) && identifier(value.revisionId)
      ? { kind: "revision", processId: value.processId, revisionId: value.revisionId } : null;
    case "external": return exactKeys(value, ["kind", "assetId"]) && identifier(value.assetId) ? { kind: "external", assetId: value.assetId } : null;
    case "page": return exactKeys(value, ["kind", "projectId", "episodeId", "pageId"]) && identifier(value.projectId) && identifier(value.episodeId) && identifier(value.pageId)
      ? { kind: "page", projectId: value.projectId, episodeId: value.episodeId, pageId: value.pageId } : null;
    case "reference": return exactKeys(value, ["kind", "boardId", "itemId"]) && identifier(value.boardId) && identifier(value.itemId)
      ? { kind: "reference", boardId: value.boardId, itemId: value.itemId } : null;
    default: return null;
  }
}
function viewport(value: unknown): SharedCompareViewport | null {
  return record(value) && exactKeys(value, ["scale", "tx", "ty"])
    && bounded(value.scale, 0.25, 8) && bounded(value.tx, -1, 1) && bounded(value.ty, -1, 1)
    ? { scale: value.scale, tx: canonicalZero(value.tx), ty: canonicalZero(value.ty) } : null;
}

/** 저장된 확장 계약을 검증한다. 오래된 트랙의 확장 부재와 잘못된 확장을 구분한다. */
export function parseVoiceCompareView(value: unknown): VoiceCompareView | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.panes) || value.panes.length < 1 || value.panes.length > 4
    || !exactKeys(value, ["version", "panes", "mode", "syncView", "offsets", "flipBoth", "flipVertical", "diffOn",
      "overlayOpacity", "shared", "locals", "sliderPosition", "blink", "focusedPane"])
    || typeof value.mode !== "string" || !["panes", "slider", "blink", "overlay"].includes(value.mode)
    || typeof value.syncView !== "boolean" || typeof value.flipBoth !== "boolean"
    || typeof value.flipVertical !== "boolean" || typeof value.diffOn !== "boolean"
    || !bounded(value.overlayOpacity, 0, 1) || !Array.isArray(value.offsets) || value.offsets.length > 4
    || !Array.isArray(value.locals) || value.locals.length !== value.panes.length || !bounded(value.sliderPosition, 0, 100)
    || !record(value.blink) || !exactKeys(value.blink, ["enabled", "intervalMs", "phase"])
    || typeof value.blink.enabled !== "boolean" || typeof value.blink.phase !== "boolean"
    || !bounded(value.blink.intervalMs, 250, 2000) || !bounded(value.focusedPane, 0, 3)
    || !Number.isInteger(value.focusedPane) || value.focusedPane >= value.panes.length) return null;
  const panes: CompareSourceRef[] = [];
  for (const entry of value.panes) { const parsed = source(entry); if (!parsed) return null; panes.push(parsed); }
  const shared = viewport(value.shared);
  if (!shared) return null;
  const locals: SharedCompareViewport[] = [];
  for (const entry of value.locals) { const parsed = viewport(entry); if (!parsed) return null; locals.push(parsed); }
  const offsets: { source: CompareSourceRef; dx: number; dy: number }[] = [];
  for (const entry of value.offsets) {
    if (!record(entry) || !exactKeys(entry, ["source", "dx", "dy"]) || !bounded(entry.dx, -0.25, 0.25) || !bounded(entry.dy, -0.25, 0.25)) return null;
    const parsed = source(entry.source);
    if (!parsed) return null;
    offsets.push({ source: parsed, dx: canonicalZero(entry.dx), dy: canonicalZero(entry.dy) });
  }
  const mode = value.mode;
  if (mode !== "panes" && mode !== "slider" && mode !== "blink" && mode !== "overlay") return null;
  return { version: 1, panes, mode, syncView: value.syncView, offsets, flipBoth: value.flipBoth,
    flipVertical: value.flipVertical, diffOn: value.diffOn, overlayOpacity: canonicalZero(value.overlayOpacity),
    shared, locals, sliderPosition: canonicalZero(value.sliderPosition),
    blink: { enabled: value.blink.enabled, intervalMs: value.blink.intervalMs, phase: value.blink.phase },
    focusedPane: canonicalZero(value.focusedPane) };
}

export function interpolateVoiceCompareView(a: VoiceCompareView, b: VoiceCompareView, ratio: number): VoiceCompareView {
  const fixed = (view: VoiceCompareView) => JSON.stringify({ panes: view.panes, mode: view.mode,
    syncView: view.syncView, offsets: view.offsets, flipBoth: view.flipBoth, flipVertical: view.flipVertical,
    diffOn: view.diffOn, blink: view.blink, focusedPane: view.focusedPane });
  if (fixed(a) !== fixed(b) || a.locals.length !== b.locals.length) return a;
  const t = Math.max(0, Math.min(1, ratio));
  const between = (from: number, to: number) => from + (to - from) * t;
  const pan = (from: SharedCompareViewport, to: SharedCompareViewport): SharedCompareViewport => ({
    scale: clampCompareScale(between(from.scale, to.scale)), tx: clampComparePan(between(from.tx, to.tx)),
    ty: clampComparePan(between(from.ty, to.ty)),
  });
  return { ...a, shared: pan(a.shared, b.shared), locals: a.locals.map((local, index) => pan(local, b.locals[index] ?? local)),
    overlayOpacity: between(a.overlayOpacity, b.overlayOpacity), sliderPosition: between(a.sliderPosition, b.sliderPosition) };
}

export function captureVoiceCompareView(session: CompareSession, state: Omit<VoiceCompareView,
  "version" | "panes" | "mode" | "syncView" | "offsets" | "flipBoth" | "flipVertical" | "diffOn" | "overlayOpacity">): VoiceViewSnapshot | null {
  const front = session.panes[0];
  const frontItem = front ? session.pool.find((item) => compareSourceKey(item.source) === compareSourceKey(front)) : null;
  if (!frontItem || session.panes.some((pane) => !session.pool.some((item) => compareSourceKey(item.source) === compareSourceKey(pane)))) return null;
  const compare = parseVoiceCompareView({ version: 1, panes: session.panes, mode: session.mode, syncView: session.syncView,
    offsets: session.panes.map((pane) => ({ source: pane, ...(session.offsets[compareSourceKey(pane)] ?? { dx: 0, dy: 0 }) })),
    flipBoth: session.flipBoth, flipVertical: session.flipVertical, diffOn: session.diffOn,
    overlayOpacity: session.overlayOpacity, ...state,
    focusedPane: Math.max(0, Math.min(session.panes.length - 1, Math.trunc(state.focusedPane))) });
  if (!compare) return null;
  const first = session.syncView ? compare.shared : compare.locals[0] ?? COMPARE_VIEWPORT_IDENTITY;
  return { surface: "compare", poolItemId: frontItem.id, pageId: null, mode: session.mode, ...first, compare };
}

/** 현재 권한으로 얻은 풀을 유지한다. 녹음의 식별자가 없는 소스를 임의로 추가하지 않는다. */
export function voiceCompareSessionForReplay(session: CompareSession, view: VoiceViewSnapshot): CompareSession | null {
  if (view.surface !== "compare") return null;
  const bySource = new Map(session.pool.map((item) => [compareSourceKey(item.source), item]));
  if (view.compare) {
    const compare = parseVoiceCompareView(view.compare);
    if (!compare || compare.panes.some((pane) => !bySource.has(compareSourceKey(pane)))) return null;
    return { ...session, panes: compare.panes, mode: compare.mode, syncView: compare.syncView,
      offsets: Object.fromEntries(compare.offsets.map((entry) => [compareSourceKey(entry.source), { dx: entry.dx, dy: entry.dy }])),
      flipBoth: compare.flipBoth, flipVertical: compare.flipVertical, diffOn: compare.diffOn, overlayOpacity: compare.overlayOpacity };
  }
  const first = session.pool.find((item) => item.id === view.poolItemId);
  if (!first) return null;
  const mode = view.mode;
  return { ...session, panes: [first.source, ...session.panes.filter((pane) => compareSourceKey(pane) !== compareSourceKey(first.source))].slice(0, 4),
    mode: mode === "panes" || mode === "slider" || mode === "blink" || mode === "overlay" ? mode : session.mode,
    syncView: true, offsets: {} };
}
