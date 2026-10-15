/**
 * 추론 서비스 — 장면 색인·세션 상태·커서 해석·안내 문구를 묶는 프레임워크 비의존 객체.
 *
 * 줄자·이동 스냅·밀기/당기기 입력·방 빌더 벽 그리기가 모두 같은 서비스 하나를 쓴다. React 훅
 * (`useStudioBg3dInference`)과 R3F 컨트롤러는 이 객체를 감싸는 얇은 껍데기이므로, 방 빌더처럼 이 모듈을
 * 직접 부르는 쪽도 같은 규칙(축 잠금, Shift 유지, VCB 길이 입력, 안내 문구)을 그대로 얻는다.
 *
 * 서비스는 DOM·three.js·타이머를 직접 모른다. 시간(`now`)과 지연 실행(`scheduler`)은 주입받는다.
 */

import {
  STUDIO_BG3D_INFERENCE_BUDGET,
  resolveStudioBg3dInferenceAxisRoles,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import { collectStudioBg3dInferenceIncidentDirections, resolveStudioBg3dInference } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import { distance, isFiniteVec3 } from "./studio-bg3d-inference-math";
import { createStudioBg3dInferenceProbe } from "./studio-bg3d-inference-probe";
import {
  createStudioBg3dInferenceSessionState,
  measureStudioBg3dInferenceDistance,
  reduceStudioBg3dInferenceSession,
} from "./studio-bg3d-inference-session";
import {
  buildStudioBg3dInferenceSourceSet,
  listStudioBg3dInferencePointsNear,
} from "./studio-bg3d-inference-sources";
import { createStudioBg3dInferenceAnnouncer } from "./studio-bg3d-inference-timing";
import { formatStudioBg3dMeasurementLength } from "./studio-bg3d-measurement";

import type { StudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import type { StudioBg3dInferenceAxisRoles, StudioBg3dInferenceKind } from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceEffect,
  StudioBg3dInferenceKeyEvent,
  StudioBg3dInferenceNoticeTone,
  StudioBg3dInferenceReduceOptions,
  StudioBg3dInferenceReduction,
  StudioBg3dInferenceSessionEvent,
  StudioBg3dInferenceSessionState,
  StudioBg3dInferenceTool,
} from "./studio-bg3d-inference-session";
import type {
  BuildStudioBg3dInferenceSourcesInput,
  StudioBg3dInferencePointFeature,
  StudioBg3dInferenceSourceStats,
} from "./studio-bg3d-inference-sources";
import type {
  StudioBg3dInferenceCursor,
  StudioBg3dInferenceOutcome,
  StudioBg3dInferencePointerKind,
  StudioBg3dInferenceReferenceDirection,
  StudioBg3dInferenceResult,
} from "./studio-bg3d-inference-types";
import type { StudioBg3dMeasurementUnit } from "./studio-bg3d-measurement";

type V3 = StudioBg3dInferenceVec3;

/** 길이 입력 적용 효과를 받는 도구 쪽 핸들러가 받는 값. 끝점은 `기준점 + 방향 × 길이`다. */
export interface StudioBg3dInferenceApplyLengthRequest {
  /** 항상 0보다 큰 길이(m). */
  readonly meters: number;
  /** 음수 부호를 반영한 단위 방향. */
  readonly direction: V3;
  readonly negative: boolean;
  readonly reference: V3;
  readonly endPoint: V3;
}

export interface StudioBg3dInferenceEffectHandlers {
  readonly applyLength?: (request: StudioBg3dInferenceApplyLengthRequest) => void;
  /** Esc: 도구가 진행 중인 작업을 취소한다. */
  readonly cancel?: () => void;
}

export interface StudioBg3dInferenceBeginOptions {
  readonly referencePoint?: V3 | null;
  readonly unit?: StudioBg3dMeasurementUnit;
  /** 음수 길이를 받는지(기본 true). */
  readonly allowNegative?: boolean;
  readonly maxMeters?: number;
  readonly handlers?: StudioBg3dInferenceEffectHandlers;
  /** 지정하면 이 종류만 후보로 쓴다. */
  readonly enabledKinds?: ReadonlySet<StudioBg3dInferenceKind> | null;
  readonly grid?: { readonly step: number; readonly origin?: V3 } | null;
  /** 후보에서 뺄 출처(끌고 있는 객체 등). */
  readonly excludeSourceIds?: ReadonlySet<string> | null;
  /** false면 방향키·Esc·숫자 입력 키 라우팅을 쓰지 않는다 (기즈모 드래그처럼 포인터가 주도하는 도구). 기본 true. */
  readonly keyboard?: boolean;
  /** false면 HUD 패널을 그리지 않는다 (마커·안내문만). 기본 true. */
  readonly hud?: boolean;
}

export interface StudioBg3dInferenceLiveMessage {
  /** 같은 문구가 다시 와도 live region이 읽도록 매번 증가한다. */
  readonly seq: number;
  readonly text: string;
  readonly urgent: boolean;
  /** 오류는 assertive, 나머지는 polite live region으로 보낸다. */
  readonly tone: StudioBg3dInferenceNoticeTone;
}

export interface StudioBg3dInferenceSceneInfo {
  readonly revision: string | null;
  /** 색인을 다시 만든 횟수 — 같은 장면이면 늘지 않는다. */
  readonly builds: number;
  readonly stats: StudioBg3dInferenceSourceStats | null;
}

export interface StudioBg3dInferenceServiceSnapshot {
  readonly version: number;
  readonly session: StudioBg3dInferenceSessionState;
  readonly options: { readonly keyboard: boolean; readonly hud: boolean };
  readonly live: StudioBg3dInferenceLiveMessage;
  /** 기준점에서 현재 결과 점까지의 거리(m). 기준점이 없으면 null. */
  readonly measuredMeters: number | null;
  readonly scene: StudioBg3dInferenceSceneInfo;
}

export interface StudioBg3dInferenceResolveInput {
  readonly cursor: StudioBg3dInferenceCursor;
  readonly pointer?: StudioBg3dInferencePointerKind;
}

export interface StudioBg3dInferencePickCandidate {
  readonly id: string;
  readonly kind: StudioBg3dInferencePointFeature["kind"];
  readonly point: V3;
  /** 예: "상자 1 · 꼭짓점". */
  readonly label: string;
  readonly distanceMeters: number;
  readonly approximate: boolean;
  readonly sourceId: string;
}

export interface StudioBg3dInferenceFreshPoint {
  readonly point: V3;
  readonly result: StudioBg3dInferenceResult | null;
  /** 추론 결과로 바뀌었는지(false면 원래 점 그대로). */
  readonly snapped: boolean;
}

export interface StudioBg3dInferenceService {
  getSnapshot(): StudioBg3dInferenceServiceSnapshot;
  subscribe(listener: () => void): () => void;

  // 장면
  syncScene(input: BuildStudioBg3dInferenceSourcesInput & { readonly cellSize?: number }): boolean;
  getIndex(): StudioBg3dInferenceIndex;
  setReferenceDirections(directions: readonly StudioBg3dInferenceReferenceDirection[]): void;
  /** 키보드 점 고르기 목록의 기준 위치(선택 객체·시점 중심). */
  setFocusPoint(point: V3 | null): void;

  // 세션
  begin(tool: StudioBg3dInferenceTool, options?: StudioBg3dInferenceBeginOptions): void;
  end(): void;
  /** 세션이 활성이고 키보드 라우팅을 쓰는 도구인지. */
  isKeyboardActive(): boolean;
  /** 도구의 클로저가 렌더마다 바뀌는 호스트가 최신 핸들러로 교체한다. */
  setHandlers(handlers: StudioBg3dInferenceEffectHandlers): void;
  isActive(): boolean;
  setReference(point: V3 | null): void;
  setUnit(unit: StudioBg3dMeasurementUnit): void;
  requestLock(role: "first" | "second" | "vertical" | "relation"): void;
  clearLock(): void;
  setVcbText(text: string): void;
  submitVcb(): void;
  getVcbText(): string;
  addHoverReference(point: V3): void;
  handleKey(
    phase: "key-down" | "key-up",
    event: StudioBg3dInferenceKeyEvent,
  ): Pick<StudioBg3dInferenceReduction, "handled">;
  resetModifiers(): void;
  getAxisRoles(): StudioBg3dInferenceAxisRoles;
  /** 입력창을 가진 UI가 "포커스 요청" 효과를 받을 함수를 등록한다. */
  registerVcbFocus(focus: () => void): () => void;

  // 해석
  resolve(input: StudioBg3dInferenceResolveInput): StudioBg3dInferenceOutcome | null;
  /** 도구 쪽에서 이미 계산한 결과(예: 이동 스냅 계획)를 표시·안내용으로 게시한다. */
  publishResult(result: StudioBg3dInferenceResult | null): void;
  getResult(): StudioBg3dInferenceResult | null;
  /**
   * R3F 클릭처럼 "원래 점"만 아는 호출자가 방금 계산된 추론 결과로 점을 바꿔 받는다.
   * 결과가 오래됐거나 커서 위치와 어긋나면 원래 점을 그대로 돌려준다.
   */
  resolveFreshPoint(rawPoint: V3): StudioBg3dInferenceFreshPoint;

  // 키보드 점 고르기
  listPickCandidates(limit?: number): readonly StudioBg3dInferencePickCandidate[];
  pickCandidate(candidate: StudioBg3dInferencePickCandidate): StudioBg3dInferenceResult;
}

export interface CreateStudioBg3dInferenceServiceOptions {
  readonly now?: () => number;
  /** 보류 중인 스크린리더 안내를 나중에 내보내기 위한 지연 실행. 취소 함수를 돌려준다. */
  readonly scheduler?: (callback: () => void, delayMs: number) => () => void;
  readonly axisRoles?: StudioBg3dInferenceAxisRoles;
  readonly announceIntervalMs?: number;
  /** 결과가 최신으로 인정되는 시간(ms). */
  readonly freshResultMs?: number;
  /** 커서 근처로 인정하는 허용 반경(px). */
  readonly freshResultPx?: number;
}

const DEFAULT_FRESH_RESULT_MS = 1_500;
const DEFAULT_FRESH_RESULT_PX = 10;
const EMPTY_LIVE: StudioBg3dInferenceLiveMessage = Object.freeze({ seq: 0, text: "", urgent: false, tone: "info" });
const EMPTY_SCENE: StudioBg3dInferenceSceneInfo = Object.freeze({ revision: null, builds: 0, stats: null });

function defaultScheduler(callback: () => void, delayMs: number): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

function sceneKeyOf(input: BuildStudioBg3dInferenceSourcesInput & { readonly cellSize?: number }): string {
  const parts: string[] = [String(input.cellSize ?? "")];
  for (const entity of input.entities) {
    parts.push(
      entity.id,
      entity.kind,
      entity.label ?? "",
      entity.parentId ?? "",
      entity.visible === false ? "0" : "1",
      entity.position.join(","),
      entity.rotation.join(","),
      entity.scale.join(","),
      entity.modelBounds ? `${entity.modelBounds.min.join(",")}|${entity.modelBounds.max.join(",")}` : "",
    );
  }
  for (const line of input.lines ?? []) {
    parts.push("L", line.id, line.label, line.role, line.a.join(","), line.b.join(","));
  }
  for (const point of input.points ?? []) {
    parts.push("P", point.id, point.label, point.kind, point.point.join(","));
  }
  if (input.excludeIds && input.excludeIds.size > 0) parts.push("X", [...input.excludeIds].sort().join(","));
  return parts.join("\u0001");
}

function resultAnnouncementKey(result: StudioBg3dInferenceResult): string {
  return [
    result.kind,
    result.axis ?? "",
    result.sourceIds.join(","),
    result.edgeId ?? "",
    result.relation?.id ?? "",
    result.constraint.kind,
  ].join("|");
}

/** 같은 점으로 보아 갱신을 건너뛰는 허용 오차(m). */
const SAME_POINT_EPSILON = 1e-7;

function sameResult(left: StudioBg3dInferenceResult | null, right: StudioBg3dInferenceResult | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind
    && left.axis === right.axis
    && left.label === right.label
    && left.detail === right.detail
    && left.edgeId === right.edgeId
    && left.constraint.kind === right.constraint.kind
    && left.guides.length === right.guides.length
    && distance(left.point, right.point) < SAME_POINT_EPSILON
    && (left.alignmentOrigin === null) === (right.alignmentOrigin === null)
  );
}

export function createStudioBg3dInferenceService(
  options: CreateStudioBg3dInferenceServiceOptions = {},
): StudioBg3dInferenceService {
  const now = options.now ?? (() => Date.now());
  const schedule = options.scheduler ?? defaultScheduler;
  const axisRoles = options.axisRoles ?? resolveStudioBg3dInferenceAxisRoles();
  const freshMs = options.freshResultMs ?? DEFAULT_FRESH_RESULT_MS;
  const freshPx = options.freshResultPx ?? DEFAULT_FRESH_RESULT_PX;
  const announcer = createStudioBg3dInferenceAnnouncer(options.announceIntervalMs);

  let session: StudioBg3dInferenceSessionState = createStudioBg3dInferenceSessionState();
  let index: StudioBg3dInferenceIndex | null = null;
  let sceneKey: string | null = null;
  let scene: StudioBg3dInferenceSceneInfo = EMPTY_SCENE;
  let externalDirections: readonly StudioBg3dInferenceReferenceDirection[] = [];
  let incidentDirections: readonly StudioBg3dInferenceReferenceDirection[] = [];
  let focusPoint: V3 | null = null;
  let handlers: StudioBg3dInferenceEffectHandlers = {};
  let beginOptions: StudioBg3dInferenceBeginOptions = {};
  let live: StudioBg3dInferenceLiveMessage = EMPTY_LIVE;
  let lastCursor: { readonly anchor: V3; readonly worldPerPixel: number; readonly atMs: number } | null = null;
  let snapshot: StudioBg3dInferenceServiceSnapshot | null = null;
  let version = 0;
  let cancelPendingAnnounce: (() => void) | null = null;
  /** 키보드 점 고르기 목록 캐시 — 같은 색인·기준·개수면 렌더마다 다시 정렬하지 않는다. */
  let pickCache: {
    readonly index: StudioBg3dInferenceIndex;
    readonly focusKey: string;
    readonly limit: number;
    readonly value: readonly StudioBg3dInferencePickCandidate[];
  } | null = null;
  const listeners = new Set<() => void>();
  const vcbFocusers = new Set<() => void>();

  const reduceOptions = (): StudioBg3dInferenceReduceOptions => ({
    axisRoles,
    allowNegative: beginOptions.allowNegative ?? true,
    ...(beginOptions.maxMeters === undefined ? {} : { maxMeters: beginOptions.maxMeters }),
  });

  const ensureIndex = (): StudioBg3dInferenceIndex => {
    if (!index) index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities: [] }));
    return index;
  };

  const buildSnapshot = (): StudioBg3dInferenceServiceSnapshot => {
    const result = session.lastResult;
    return Object.freeze({
      version,
      session,
      options: Object.freeze({ keyboard: beginOptions.keyboard !== false, hud: beginOptions.hud !== false }),
      live,
      measuredMeters: result ? measureStudioBg3dInferenceDistance(session.referencePoint, result.point) : null,
      scene,
    });
  };

  const emit = () => {
    version += 1;
    snapshot = null;
    for (const listener of [...listeners]) listener();
  };

  const publishLive = (text: string, urgent: boolean, tone: StudioBg3dInferenceNoticeTone) => {
    live = Object.freeze({ seq: live.seq + 1, text, urgent, tone });
  };

  const flushPendingAnnouncement = () => {
    cancelPendingAnnounce = null;
    const text = announcer.takePending(now());
    if (text !== null) {
      publishLive(text, false, "info");
      emit();
    }
  };

  const offerAnnouncement = (
    key: string,
    text: string,
    urgent: boolean,
    tone: StudioBg3dInferenceNoticeTone = "info",
  ): boolean => {
    const spoken = announcer.offer({ key, text, urgent }, now());
    if (spoken !== null) {
      publishLive(spoken, urgent, tone);
      return true;
    }
    if (!cancelPendingAnnounce) {
      cancelPendingAnnounce = schedule(flushPendingAnnouncement, 480);
    }
    return false;
  };

  const lengthLabel = (meters: number): string =>
    formatStudioBg3dMeasurementLength(meters, session.unit) ?? `${meters.toFixed(3)} m`;

  const announceResult = (result: StudioBg3dInferenceResult | null): boolean => {
    if (!result || result.kind === "free") return false;
    const meters = measureStudioBg3dInferenceDistance(session.referencePoint, result.point);
    const text = meters === null ? result.announcement : `${result.announcement} · 길이 ${lengthLabel(meters)}`;
    return offerAnnouncement(resultAnnouncementKey(result), text, false);
  };

  const recomputeIncidentDirections = () => {
    incidentDirections = session.referencePoint && index
      ? collectStudioBg3dInferenceIncidentDirections(index, session.referencePoint)
      : [];
  };

  const runEffects = (effects: readonly StudioBg3dInferenceEffect[], before: StudioBg3dInferenceSessionState) => {
    for (const effect of effects) {
      if (effect.type === "focus-vcb") {
        for (const focus of [...vcbFocusers]) focus();
      } else if (effect.type === "cancel") {
        handlers.cancel?.();
      } else if (effect.type === "apply-length") {
        const reference = before.referencePoint;
        if (!reference) continue;
        handlers.applyLength?.({
          meters: effect.meters,
          direction: effect.direction,
          negative: effect.negative,
          reference,
          endPoint: [
            reference[0] + effect.direction[0] * effect.meters,
            reference[1] + effect.direction[1] * effect.meters,
            reference[2] + effect.direction[2] * effect.meters,
          ],
        });
      }
    }
  };

  /** 리듀서를 적용하고 파생 상태(안내·기준 방향)를 갱신한다. 알림과 효과 실행은 호출자가 한다. */
  const apply = (event: StudioBg3dInferenceSessionEvent) => {
    const before = session;
    const reduction = reduceStudioBg3dInferenceSession(before, event, reduceOptions());
    session = reduction.state;
    if (session.referencePoint !== before.referencePoint) recomputeIncidentDirections();
    if (session.notice && session.notice.id !== before.notice?.id) {
      offerAnnouncement(`notice:${session.notice.id}`, session.notice.text, session.notice.urgent, session.notice.tone);
    }
    return { before, reduction };
  };

  const dispatch = (event: StudioBg3dInferenceSessionEvent): StudioBg3dInferenceReduction => {
    const liveBefore = live;
    const { before, reduction } = apply(event);
    if (session !== before || live !== liveBefore) emit();
    runEffects(reduction.effects, before);
    return reduction;
  };

  const service: StudioBg3dInferenceService = {
    getSnapshot() {
      snapshot ??= buildSnapshot();
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    syncScene(input) {
      const key = sceneKeyOf(input);
      if (key === sceneKey && index) return false;
      const source = buildStudioBg3dInferenceSourceSet(input);
      index = createStudioBg3dInferenceIndex(source, input.cellSize === undefined ? {} : { cellSize: input.cellSize });
      sceneKey = key;
      scene = Object.freeze({ revision: source.revision, builds: scene.builds + 1, stats: source.stats });
      recomputeIncidentDirections();
      emit();
      return true;
    },
    getIndex: ensureIndex,
    setReferenceDirections(directions) {
      externalDirections = directions.slice(0, STUDIO_BG3D_INFERENCE_BUDGET.maxReferenceDirections);
    },
    setFocusPoint(point) {
      focusPoint = point && isFiniteVec3(point) ? point : null;
    },

    begin(tool, beginInput = {}) {
      beginOptions = beginInput;
      handlers = beginInput.handlers ?? {};
      announcer.reset();
      lastCursor = null;
      dispatch({
        type: "begin",
        tool,
        ...(beginInput.referencePoint === undefined ? {} : { referencePoint: beginInput.referencePoint }),
        ...(beginInput.unit === undefined ? {} : { unit: beginInput.unit }),
      });
      recomputeIncidentDirections();
    },
    setHandlers(next) {
      handlers = next;
    },
    end() {
      cancelPendingAnnounce?.();
      cancelPendingAnnounce = null;
      announcer.reset();
      handlers = {};
      beginOptions = {};
      incidentDirections = [];
      lastCursor = null;
      const reduction = reduceStudioBg3dInferenceSession(session, { type: "end" }, reduceOptions());
      session = reduction.state;
      emit();
    },
    isActive: () => session.active,
    isKeyboardActive: () => session.active && beginOptions.keyboard !== false,
    setReference(point) {
      dispatch({ type: "set-reference", point });
    },
    setUnit(unit) {
      dispatch({ type: "set-unit", unit });
    },
    requestLock(role) {
      dispatch({ type: "request-lock", role });
    },
    clearLock() {
      dispatch({ type: "clear-lock" });
    },
    setVcbText(text) {
      dispatch({ type: "vcb-change", text });
    },
    submitVcb() {
      dispatch({ type: "vcb-submit" });
    },
    getVcbText: () => session.vcb.text,
    addHoverReference(point) {
      dispatch({ type: "add-hover-reference", point });
    },
    handleKey(phase, event) {
      const reduction = dispatch({ type: phase, event });
      return { handled: reduction.handled };
    },
    resetModifiers() {
      if (!session.active) return;
      dispatch({ type: "reset-modifiers" });
    },
    getAxisRoles: () => axisRoles,
    registerVcbFocus(focus) {
      vcbFocusers.add(focus);
      return () => vcbFocusers.delete(focus);
    },

    resolve(input) {
      if (!session.active) return null;
      const activeIndex = ensureIndex();
      const directions = [...incidentDirections, ...externalDirections].slice(
        0,
        STUDIO_BG3D_INFERENCE_BUDGET.maxReferenceDirections,
      );
      const outcome = resolveStudioBg3dInference({
        index: activeIndex,
        cursor: input.cursor,
        referencePoint: session.referencePoint,
        hoverReferences: session.hoverReferences,
        referenceDirections: directions,
        lock: session.lock,
        hold: session.hold,
        ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
        ...(beginOptions.enabledKinds === undefined ? {} : { enabledKinds: beginOptions.enabledKinds }),
        ...(beginOptions.grid === undefined ? {} : { grid: beginOptions.grid }),
        ...(beginOptions.excludeSourceIds === undefined ? {} : { excludeSourceIds: beginOptions.excludeSourceIds }),
      });
      const probe = createStudioBg3dInferenceProbe(input.cursor);
      if (probe.ok && probe.probe.anchor) {
        lastCursor = {
          anchor: probe.probe.anchor,
          worldPerPixel: probe.probe.worldPerPixelAt(probe.probe.anchor),
          atMs: now(),
        };
      } else {
        lastCursor = null;
      }
      const liveBefore = live;
      let changed = false;
      if (outcome.ok) {
        // 같은 결과(좌표 차이 1e-7 미만)면 상태를 바꾸지 않아 불필요한 렌더를 막는다.
        if (!sameResult(session.lastResult, outcome.result)) {
          apply({ type: "result", result: outcome.result });
          changed = true;
        }
        announceResult(outcome.result);
      } else if (session.lastResult) {
        apply({ type: "result", result: null });
        changed = true;
      }
      if (changed || live !== liveBefore) emit();
      return outcome;
    },
    publishResult(result) {
      if (!session.active) return;
      const liveBefore = live;
      const changed = !sameResult(session.lastResult, result);
      if (changed) apply({ type: "result", result });
      announceResult(result);
      if (changed || live !== liveBefore) emit();
    },
    getResult: () => session.lastResult,
    resolveFreshPoint(rawPoint) {
      const result = session.lastResult;
      if (!session.active || !result || result.kind === "free" || !lastCursor) {
        return { point: rawPoint, result: null, snapped: false };
      }
      if (now() - lastCursor.atMs > freshMs) return { point: rawPoint, result: null, snapped: false };
      const tolerance = Math.max(1e-3, lastCursor.worldPerPixel * freshPx);
      if (distance(rawPoint, lastCursor.anchor) > tolerance) {
        return { point: rawPoint, result: null, snapped: false };
      }
      return { point: result.point, result, snapped: true };
    },

    listPickCandidates(limit = 12) {
      const activeIndex = ensureIndex();
      const source = activeIndex.source;
      const focus = session.referencePoint ?? focusPoint ?? ([0, 0, 0] as const);
      const focusKey = focus.join(",");
      if (pickCache && pickCache.index === activeIndex && pickCache.focusKey === focusKey && pickCache.limit === limit) {
        return pickCache.value;
      }
      const value = Object.freeze(
        listStudioBg3dInferencePointsNear(source, focus, limit).map((feature) => {
          const name = source.labels.get(feature.sourceId) ?? feature.sourceId;
          return Object.freeze({
            id: feature.id,
            kind: feature.kind,
            point: feature.point,
            label: feature.tag ? `${name} · ${feature.tag}` : name,
            distanceMeters: distance(feature.point, focus),
            approximate: feature.approximate,
            sourceId: feature.sourceId,
          });
        }),
      );
      pickCache = { index: activeIndex, focusKey, limit, value };
      return value;
    },
    pickCandidate(candidate) {
      const label = studioBg3dInferenceKindLabel(candidate.kind);
      const detail = candidate.approximate ? `${candidate.label} (경계 상자 기준)` : candidate.label;
      const result: StudioBg3dInferenceResult = Object.freeze({
        kind: candidate.kind,
        point: candidate.point,
        label,
        detail,
        announcement: `${label} — ${detail}`,
        axis: null,
        direction: null,
        normal: null,
        sourceIds: Object.freeze([candidate.sourceId]),
        edgeId: null,
        alignmentOrigin: null,
        relation: null,
        guides: Object.freeze([]),
        constraint: Object.freeze({ kind: "none" as const }),
        projected: false,
        approximate: candidate.approximate,
        distancePx: 0,
      });
      if (session.active) {
        apply({ type: "result", result });
        // 직접 고른 점은 방금 계산된 커서 결과가 아니므로 "최신 커서 결과"로 쓰지 않는다.
        lastCursor = null;
        offerAnnouncement(`pick:${candidate.id}`, `${result.announcement} 선택`, true);
        emit();
      }
      return result;
    },
  };
  return service;
}
