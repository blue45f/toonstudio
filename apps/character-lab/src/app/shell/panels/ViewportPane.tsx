/**
 * ViewportPane: 엔진 캔버스 + 도구 막대(4방향 시점·부감/앙각·투명 격자·원고 컷 매칭 포함) + HUD + 관절 핸들 + 형상 제어점 + 드로잉 오버레이.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { DEFAULT_FRAMING, PART_ROLE_LABELS_KO, failVisible, isLabFailure } from "../../../contracts";
import { formatShaperInputStyleGuide } from "../../../export/recipe-file";
import { clientToNdc, normalizePointerPressure } from "../../../paint/paint-bridge";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { readPoseSkeleton } from "../../../render/pose-skeleton";
import { readProjectionPaint } from "../../../render/projection-paint";
import { readViewportCamera } from "../../../render/viewport-camera";
import { applyCanvasShaperViewPreset, setCanvasCameraInputStyle } from "../../../render/viewport-controls";
import { clientToRenderPixel, viewportPixelRatio } from "../../../render/viewport-math";
import { describeEngineStatus } from "../engine-status-text";
import { useApplyPlan, useDispatch, useEngineSession, useLabState, useLabStore, useUiActions, useUiState, useViewportRegistry } from "../lab-store-context";

import { createSwitchingPaintDriver } from "./projection-paint-driver";
import {
  SHAPER_BUILTIN_ARCHETYPE_PRESETS, SHAPER_BUILTIN_PART_PRESETS, SHAPER_BUILTIN_POSE_PRESETS, SHAPER_GIZMO_MODES,
  buildShaperPresetCommands, computeShaperBoneScaleDrag, computeShaperControlPointDrag, computeShaperControlPoints, computeShaperIkHandleDrag,
} from "./shaper-control-points";
import { diagnoseSkeletonData, postSkeletonFailureOnce } from "./skeleton-boundary-guard";
import { ViewportBackdropLayers, ViewportCompositionBar, ViewportOnboardingCard, ViewportSvgGizmoLayer, clampReferenceOpacity } from "./viewport-backdrop-overlay";
import {
  SHAPER_BUILTIN_BODY_PRESETS, SHAPER_BUILTIN_FACE_PRESETS, applySymmetryToPose, computeJointDrag, computeVisibleBoneLinks,
  handlesKey, hudRows, jointLabelKo, resolveDragPivotWithMode, resolveShaperViewportKeyShortcut, visibleHandles,
} from "./viewport-interactions";

import type { ShaperControlPointId, ShaperGizmoMode, ShaperProjectedControlPoint } from "./shaper-control-points";
import type { ReferenceCutPlacement, ReferenceCutState, ViewportPitchDeg } from "./viewport-backdrop-overlay";
import type { DragPivot, JointDragOutcome, ShaperCameraInputStyle, ShaperPivotMode } from "./viewport-interactions";
import type { ApplyPlan, BodyParamKey, CameraFraming, CharacterEngine, EngineBackend, FaceParamKey, HudSample, HumanoidBoneName, JointDragHandle, LabFailure, ParamValues, Pose, SkeletonData } from "../../../contracts";
import type { PointerPaintDriver } from "../../../paint/paint-bridge";
import type { PaintSession } from "../../../paint/paint-session";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

export interface ViewportPaneProps {
  readonly paintSession?: PaintSession;
  readonly hudIntervalMs?: number;
  readonly initialOverlays?: { readonly handles?: boolean; readonly hud?: boolean; readonly controlPoints?: boolean };
}

export const DEFAULT_HUD_INTERVAL_MS = 250;
const FRAMING_MODES: ReadonlyArray<{ readonly mode: CameraFraming["mode"]; readonly label: string }> = [
  { mode: "full-body", label: "전신" },
  { mode: "bust", label: "상반신" },
  { mode: "face", label: "얼굴" },
];
const FILL: CSSProperties = { position: "absolute", inset: 0 };
const CANVAS_KEY_SHORTCUTS = "ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Home";

interface DragSession {
  readonly pointerId: number;
  readonly target: SVGCircleElement;
  readonly engine: CharacterEngine;
  readonly skeleton: SkeletonData;
  readonly handle: JointDragHandle;
  readonly pivot: DragPivot;
  readonly startPose: Pose;
  readonly startPixel: readonly [number, number];
  readonly basePlan: ApplyPlan | null;
  readonly mode: ShaperGizmoMode;
  readonly baseBody: ParamValues<BodyParamKey>;
  outcome: JointDragOutcome | null;
  ikOutcome: { readonly pose: Pose; readonly labelKo: string } | null;
  scaleOutcome: { readonly key: BodyParamKey; readonly value: number; readonly labelKo: string } | null;
}

interface ControlPointDragSession {
  readonly pointerId: number;
  readonly target: SVGCircleElement;
  readonly controlPoint: ShaperProjectedControlPoint;
  readonly startPixel: readonly [number, number];
  readonly baseFace: ParamValues<FaceParamKey>;
  readonly baseBody: ParamValues<BodyParamKey>;
  changes: ReadonlyArray<{ readonly group: "face" | "body"; readonly key: FaceParamKey | BodyParamKey; readonly value: number }>;
}

function failureText(error: unknown, fallback: string): string {
  return isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : fallback;
}

function releaseCapture(el: Element | undefined, pointerId: number): void {
  if (el && typeof el.releasePointerCapture === "function" && el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
}

export function ViewportPane({ paintSession, hudIntervalMs = DEFAULT_HUD_INTERVAL_MS, initialOverlays }: ViewportPaneProps) {
  const labState = useLabState();
  const store = useLabStore();
  const dispatch = useDispatch();
  const engineSession = useEngineSession();
  const registry = useViewportRegistry();
  const ui = useUiState();
  const { setDrawingMode } = useUiActions();
  const plan = useApplyPlan();
  const paint = paintSession ?? getDefaultPaintSession();
  const activePart = useSyncExternalStore(paint.subscribe, () => paint.getState().activePart, () => paint.getState().activePart);
  const activeSublayer = useSyncExternalStore(paint.subscribe, () => paint.getState().activeSublayer, () => paint.getState().activeSublayer);
  const brushRadius = useSyncExternalStore(paint.subscribe, () => Math.round(paint.getState().brush.radiusPx), () => Math.round(paint.getState().brush.radiusPx));
  const toolMode = useSyncExternalStore(paint.subscribe, () => paint.getState().toolMode, () => paint.getState().toolMode);
  const paintSymmetry = useSyncExternalStore(paint.subscribe, () => paint.getState().symmetry, () => paint.getState().symmetry);

  const engineText = describeEngineStatus(labState.engine);
  const engine = labState.engine.phase === "ready" ? engineSession.engine() : null;

  const [showHandles, setShowHandles] = useState(initialOverlays?.handles ?? false);
  const [showFingers, setShowFingers] = useState(false);
  const [showControlPoints, setShowControlPoints] = useState(initialOverlays?.controlPoints ?? false);
  const [showHud, setShowHud] = useState(initialOverlays?.hud ?? false);
  const [framing, setFraming] = useState<CameraFraming["mode"]>(DEFAULT_FRAMING.mode);
  const [activeYawDeg, setActiveYawDeg] = useState<number | null>(null);
  const [activePitchDeg, setActivePitchDeg] = useState<ViewportPitchDeg | null>(null);
  const [checkerboard, setCheckerboard] = useState(false);
  const [manuscriptGuide, setManuscriptGuide] = useState(false);
  const [referenceCut, setReferenceCut] = useState<ReferenceCutState | null>(null);
  const [cameraInputStyle, setCameraInputStyle] = useState<ShaperCameraInputStyle>("unity");
  const [symmetryMode, setSymmetryMode] = useState(false);
  const [pivotMode, setPivotMode] = useState<ShaperPivotMode>("parent");
  const [gizmoMode, setGizmoMode] = useState<ShaperGizmoMode>(2);
  const [shaperPresetId, setShaperPresetId] = useState("");
  const [hud, setHud] = useState<HudSample | null>(null);
  const [handles, setHandles] = useState<readonly JointDragHandle[]>([]);
  const [renderSize, setRenderSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const [draggingBone, setDraggingBone] = useState<string | null>(null);
  const [draggingCp, setDraggingCp] = useState<ShaperControlPointId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canvasGeneration, setCanvasGeneration] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const cpDragRef = useRef<ControlPointDragSession | null>(null);
  const driverRef = useRef<PointerPaintDriver | null>(null);
  const planRef = useRef<ApplyPlan | null>(plan);
  const poseRef = useRef<Pose>(labState.recipe.pose);
  const handlesKeyRef = useRef("");
  const fingersRef = useRef(showFingers);
  const symmetryRef = useRef(symmetryMode);
  const pivotModeRef = useRef<ShaperPivotMode>(pivotMode);
  const gizmoModeRef = useRef<ShaperGizmoMode>(gizmoMode);
  const renderFailureRef = useRef<LabFailure | null>(null);
  const reportSkeletonFailure = useCallback((failure: LabFailure): void => { postSkeletonFailureOnce(store, failure); setNotice(failureText(failure, failure.reasonKo)); }, [store]);

  useEffect(() => {
    planRef.current = plan;
    poseRef.current = labState.recipe.pose;
    fingersRef.current = showFingers;
    symmetryRef.current = symmetryMode;
    pivotModeRef.current = pivotMode;
    gizmoModeRef.current = gizmoMode;
    if (renderFailureRef.current) postSkeletonFailureOnce(store, renderFailureRef.current);
  });

  const registerCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      canvasElRef.current = canvas;
      if (!canvas) return undefined;
      setCanvasCameraInputStyle(canvas, cameraInputStyle);
      return registry.register(canvas);
    },
    [registry, cameraInputStyle],
  );

  useEffect(() => {
    if (canvasElRef.current) setCanvasCameraInputStyle(canvasElRef.current, cameraInputStyle);
  }, [cameraInputStyle]);

  useEffect(() => registry.setRenewer(() => flushSync(() => setCanvasGeneration((generation) => generation + 1))), [registry]);

  useEffect(() => {
    if (!engine || !containerRef.current) return undefined;
    const container = containerRef.current;
    const apply = (): void => {
      const rect = container.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return;
      const ratio = viewportPixelRatio(window.devicePixelRatio);
      engine.resize(Math.round(rect.width * ratio), Math.round(rect.height * ratio));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    return () => observer.disconnect();
  }, [engine]);

  useEffect(() => {
    if (!engine || !showHud) {
      setHud(null);
      return undefined;
    }
    const read = (): void => {
      try {
        setHud(engine.readHud());
      } catch (error) {
        setHud(null);
        setNotice(failureText(error, "HUD를 읽지 못했습니다."));
      }
    };
    read();
    if (!(hudIntervalMs > 0)) return undefined;
    const timer = window.setInterval(read, hudIntervalMs);
    return () => window.clearInterval(timer);
  }, [engine, showHud, hudIntervalMs]);

  const syncHandles = useCallback((target: CharacterEngine): void => {
    const next = visibleHandles(target.jointHandles(), { fingers: fingersRef.current });
    const camera = readViewportCamera(target);
    const key = `${handlesKey(next)}#${camera?.width ?? 0}x${camera?.height ?? 0}`;
    if (key === handlesKeyRef.current) return;
    handlesKeyRef.current = key;
    setHandles(next);
    setRenderSize(camera ? { width: camera.width, height: camera.height } : null);
  }, []);

  useEffect(() => {
    handlesKeyRef.current = "";
    if (!engine || (!showHandles && !showControlPoints)) {
      setHandles([]);
      return undefined;
    }
    let alive = true;
    let frame = 0;
    const tick = (): void => {
      if (!alive) return;
      syncHandles(engine);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
    };
  }, [engine, showHandles, showControlPoints, showFingers, syncHandles]);

  useEffect(() => {
    if (!engine || !ui.drawingMode) {
      driverRef.current = null;
      return undefined;
    }
    const driver = createSwitchingPaintDriver(paint, {
      pick: (ndcX, ndcY, options) => options ? engine.pick(ndcX, ndcY, options) : engine.pick(ndcX, ndcY),
      upload: (layer) => engine.updatePaintTexture(layer),
      commit: (undoToken) => dispatch({ type: "paint/stroke", undoToken }),
      projection: () => readProjectionPaint(engine),
      notify: setNotice,
    });
    driverRef.current = driver;
    return () => {
      driver.cancel();
      driverRef.current = null;
    };
  }, [engine, ui.drawingMode, paint, dispatch]);

  const onFraming = useCallback(
    (mode: CameraFraming["mode"]): void => {
      if (!engine) return;
      try {
        engine.setCamera({ ...DEFAULT_FRAMING, mode });
        setFraming(mode);
        setActiveYawDeg(0);
        setActivePitchDeg(0);
        setNotice(null);
      } catch (error) {
        setNotice(failureText(error, "카메라를 바꾸지 못했습니다."));
      }
    },
    [engine],
  );

  const onSelectTurnaround = useCallback(
    (yawDeg: 0 | 35 | 90 | 180): void => {
      if (!engine) return;
      const pitchDeg = activePitchDeg ?? 0;
      try {
        engine.setCamera({ ...DEFAULT_FRAMING, mode: framing, yawDeg, pitchDeg, distanceScale: 1 });
        setActiveYawDeg(yawDeg);
        setNotice(`4방향 시점 전환: ${yawDeg}°`);
      } catch (error) {
        setNotice(failureText(error, "시점을 바꾸지 못했습니다."));
      }
    },
    [engine, framing, activePitchDeg],
  );

  const onSelectPitch = useCallback(
    (pitchDeg: ViewportPitchDeg): void => {
      if (!engine) return;
      const yawDeg = activeYawDeg ?? 0;
      try {
        engine.setCamera({ ...DEFAULT_FRAMING, mode: framing, yawDeg, pitchDeg, distanceScale: 1 });
        setActivePitchDeg(pitchDeg);
        const tag = pitchDeg < 0 ? "로우앵글" : pitchDeg > 0 ? "하이앵글" : "아이레벨";
        setNotice(`웹툰 연출 앵글 전환: ${tag} (${pitchDeg > 0 ? `+${pitchDeg}°` : `${pitchDeg}°`})`);
      } catch (error) {
        setNotice(failureText(error, "연출 앵글을 바꾸지 못했습니다."));
      }
    },
    [engine, framing, activeYawDeg],
  );

  const onLoadReferenceFile = useCallback((file: File): void => {
    const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
    if (!url) {
      setNotice("이 브라우저 환경에서는 로컬 이미지 미리보기 URL을 생성할 수 없습니다.");
      return;
    }
    setReferenceCut((prev) => ({ url, fileName: file.name, opacity: prev ? prev.opacity : 0.45, placement: prev ? prev.placement : "underlay" }));
    setNotice(`원고 컷 참조 로드됨: ${file.name}`);
  }, []);

  const onChangeReferenceOpacity = useCallback((opacity: number): void => {
    setReferenceCut((prev) => (prev ? { ...prev, opacity: clampReferenceOpacity(opacity) } : null));
  }, []);

  const onChangeReferencePlacement = useCallback((placement: ReferenceCutPlacement): void => {
    setReferenceCut((prev) => (prev ? { ...prev, placement } : null));
  }, []);

  const selectBackend = useCallback(
    (backend: EngineBackend): void => {
      const canvas = registry.claim();
      if (!canvas) {
        store.applyEvent({ type: "failure", failure: failVisible("viewport-canvas-missing", "뷰포트 캔버스를 찾을 수 없어 엔진을 만들 수 없습니다. 뷰포트가 마운트된 뒤 다시 선택하세요.") });
        return;
      }
      void engineSession.select(backend, canvas);
    },
    [registry, store, engineSession],
  );

  const onResetView = useCallback((): void => {
    if (!engine) return;
    try {
      engine.setCamera({ ...DEFAULT_FRAMING, mode: framing });
      setActiveYawDeg(0);
      setActivePitchDeg(0);
      setNotice(null);
    } catch (error) {
      setNotice(failureText(error, "시점을 초기화하지 못했습니다."));
    }
  }, [engine, framing]);

  const presetRecipeRef = useRef(labState.recipe);
  useEffect(() => {
    if (shaperPresetId && labState.recipe !== presetRecipeRef.current) setShaperPresetId("");
  }, [labState.recipe, shaperPresetId]);

  const cancelDrag = useCallback((): void => {
    const session = dragRef.current;
    const cpSession = cpDragRef.current;
    dragRef.current = null;
    cpDragRef.current = null;
    setDraggingBone(null);
    setDraggingCp(null);
    if (driverRef.current?.active) driverRef.current.cancel();
    releaseCapture(session?.target, session?.pointerId ?? -1);
    releaseCapture(cpSession?.target, cpSession?.pointerId ?? -1);
    if (session?.basePlan) {
      try {
        session.engine.applyPlan(session.basePlan);
        syncHandles(session.engine);
      } catch (error) {
        setNotice(failureText(error, "드래그 미리보기를 되돌리지 못했습니다."));
      }
    }
  }, [syncHandles]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const lowerKey = event.key.toLowerCase();
      if (ctrlOrMeta && !event.altKey) {
        if (lowerKey === "z" && !event.shiftKey) {
          event.preventDefault();
          cancelDrag();
          dispatch({ type: "history/undo" });
        } else if ((lowerKey === "z" && event.shiftKey) || lowerKey === "y") {
          event.preventDefault();
          cancelDrag();
          dispatch({ type: "history/redo" });
        }
        return;
      }
      if (!engine || ctrlOrMeta || event.altKey) return;
      const shaperAction = resolveShaperViewportKeyShortcut(event.key, { shift: event.shiftKey, ctrl: ctrlOrMeta, alt: event.altKey });
      if (shaperAction?.kind === "reset-camera") { onResetView(); return; }
      if (shaperAction?.kind === "gizmo-mode") {
        setGizmoMode(shaperAction.mode);
        const modeInfo = SHAPER_GIZMO_MODES.find((m) => m.mode === shaperAction.mode);
        if (modeInfo) setNotice(`기즈모 모드 전환: ${modeInfo.labelKo}`);
        return;
      }
      if (shaperAction?.kind === "camera-view") {
        if (shaperAction.view === "front") {
          onFraming("full-body");
          if (canvasElRef.current) applyCanvasShaperViewPreset(canvasElRef.current, "front");
        } else if (shaperAction.view === "bottom") {
          onFraming("bust");
        } else if (shaperAction.view === "left") {
          if (canvasElRef.current) applyCanvasShaperViewPreset(canvasElRef.current, "left");
          setNotice("좌측면 시점 (L)");
        } else if (shaperAction.view === "top") {
          if (canvasElRef.current) applyCanvasShaperViewPreset(canvasElRef.current, "top");
          setNotice("상단 시점 (T)");
        }
        return;
      }
      if (lowerKey === "c") onFraming("face");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, onFraming, onResetView, dispatch, cancelDrag]);

  const applyShaperBuiltInPreset = useCallback(
    (presetKey: string): void => {
      setShaperPresetId(presetKey);
      if (!presetKey) return;
      const batch = buildShaperPresetCommands(presetKey);
      if (batch) {
        for (const cmd of batch.commands) dispatch(cmd);
        presetRecipeRef.current = store.getState().recipe;
        setNotice(batch.noticeKo);
        return;
      }
      if (presetKey in SHAPER_BUILTIN_BODY_PRESETS) {
        const entry = SHAPER_BUILTIN_BODY_PRESETS[presetKey as keyof typeof SHAPER_BUILTIN_BODY_PRESETS];
        for (const [key, value] of Object.entries(entry.bodyParams)) {
          if (typeof value === "number") dispatch({ type: "param/set", group: "body", key: key as BodyParamKey, value, coalesceKey: `shaper-preset:${entry.id}` });
        }
        presetRecipeRef.current = store.getState().recipe;
        setNotice(`${entry.labelKo} 체형 비율을 적용했습니다.`);
        return;
      }
      if (presetKey in SHAPER_BUILTIN_FACE_PRESETS) {
        const entry = SHAPER_BUILTIN_FACE_PRESETS[presetKey as keyof typeof SHAPER_BUILTIN_FACE_PRESETS];
        for (const [key, value] of Object.entries(entry.faceParams)) {
          if (typeof value === "number") dispatch({ type: "param/set", group: "face", key: key as FaceParamKey, value, coalesceKey: `shaper-preset:${entry.id}` });
        }
        presetRecipeRef.current = store.getState().recipe;
        setNotice(`${entry.labelKo} 두상 비율을 적용했습니다.`);
      }
    },
    [dispatch, store],
  );

  useEffect(() => {
    if (!draggingBone && !draggingCp) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === "Escape") cancelDrag(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", cancelDrag);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("blur", cancelDrag); };
  }, [draggingBone, draggingCp, cancelDrag]);

  useEffect(() => cancelDrag, [engine, labState.recipe.source, gizmoMode, cancelDrag]);
  useEffect(() => {
    if (!showHandles && !showControlPoints) cancelDrag();
  }, [showHandles, showControlPoints, cancelDrag]);

  const pixelOf = (event: ReactPointerEvent<Element>, camera: ViewportCameraInfo): readonly [number, number] | null => {
    const svg = svgRef.current;
    return svg ? clientToRenderPixel(event.clientX, event.clientY, svg.getBoundingClientRect(), camera) : null;
  };

  const onHandleDown = (event: ReactPointerEvent<SVGCircleElement>, handle: JointDragHandle): void => {
    if (!engine || event.button !== 0) return;
    event.preventDefault();
    const skeleton = readPoseSkeleton(engine);
    const camera = readViewportCamera(engine);
    if (!skeleton || !camera) {
      setNotice("관절 드래그를 쓸 수 없습니다: 이 엔진·소스는 스켈레톤(포즈 프레임)을 제공하지 않습니다.");
      return;
    }
    const skelErr = diagnoseSkeletonData(skeleton);
    if (skelErr) { reportSkeletonFailure(skelErr); return; }
    const mode = gizmoModeRef.current;
    if (mode === 0) {
      setDraggingBone(handle.bone);
      setNotice(`${jointLabelKo(handle.bone)} 선택됨 (Q 선택 모드 — W: IK 이동, E: FK 회전, R: 체형 스케일)`);
      return;
    }
    const startPose = planRef.current?.boneRotations ?? poseRef.current;
    let pivotFailure: LabFailure | null = null;
    const pivot = resolveDragPivotWithMode(skeleton, startPose, handle.bone as HumanoidBoneName, pivotModeRef.current, {
      onFailure: (failure) => { pivotFailure = failure; postSkeletonFailureOnce(store, failure); },
    });
    const startPixel = pixelOf(event, camera);
    if (!pivot || !startPixel) {
      setNotice(pivotFailure ? `${jointLabelKo(handle.bone)} 핸들은 회전 관절을 찾지 못해 끌 수 없습니다: ${failureText(pivotFailure, (pivotFailure as LabFailure).reasonKo)}` : `${jointLabelKo(handle.bone)} 핸들은 회전 관절을 찾지 못해 끌 수 없습니다.`);
      return;
    }
    if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, target: event.currentTarget, engine, skeleton, handle, pivot, startPose, startPixel, basePlan: planRef.current, mode, baseBody: labState.recipe.body, outcome: null, ikOutcome: null, scaleOutcome: null };
    setDraggingBone(handle.bone);
    setNotice(null);
  };

  const onHandleMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const camera = readViewportCamera(session.engine);
    const currentPixel = camera ? pixelOf(event, camera) : null;
    if (!camera || !currentPixel) return;
    if (session.mode === 3) {
      const scaleOut = computeShaperBoneScaleDrag({ handleBone: session.handle.bone as HumanoidBoneName, startPixel: session.startPixel, currentPixel, renderWidth: camera.width, renderHeight: camera.height, baseBody: session.baseBody });
      session.scaleOutcome = scaleOut;
      setNotice(scaleOut.labelKo);
      return;
    }
    if (session.mode === 1) {
      const ikOut = computeShaperIkHandleDrag({ skeleton: session.skeleton, startPose: poseRef.current, handleBone: session.handle.bone as HumanoidBoneName, camera, startPixel: session.startPixel, currentPixel, symmetryEnabled: symmetryRef.current || event.altKey, pivotMode: pivotModeRef.current, onFailure: reportSkeletonFailure });
      if (!ikOut) return;
      session.ikOutcome = { pose: ikOut.pose, labelKo: ikOut.labelKo };
      setNotice(ikOut.reasonKo ?? `${ikOut.labelKo} 미리보기`);
      if (session.basePlan) {
        try {
          session.engine.applyPlan({ ...session.basePlan, boneRotations: { ...session.basePlan.boneRotations, ...ikOut.pose } });
          syncHandles(session.engine);
        } catch (error) {
          setNotice(failureText(error, "IK 미리보기를 적용하지 못했습니다."));
        }
      }
      return;
    }
    let outcome: JointDragOutcome | null;
    try {
      outcome = computeJointDrag({ skeleton: session.skeleton, startPose: session.startPose, pivot: session.pivot, camera, startPixel: session.startPixel, currentPixel, onFailure: reportSkeletonFailure });
    } catch (error) {
      setNotice(failureText(error, `관절 드래그 계산에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`));
      return;
    }
    if (!outcome) return;
    const rotation = outcome.pose[outcome.pivotBone];
    const effectivePose = rotation && (symmetryRef.current || event.altKey) ? applySymmetryToPose(outcome.pose, outcome.pivotBone, rotation, true) : outcome.pose;
    session.outcome = { ...outcome, pose: effectivePose };
    setNotice(outcome.clamped ? `${jointLabelKo(outcome.pivotBone)}: 관절 제한에 닿아 요청(${Math.abs(outcome.requestedDeg).toFixed(0)}°)보다 덜 회전합니다.` : null);
    if (session.basePlan) {
      try {
        session.engine.applyPlan({ ...session.basePlan, boneRotations: effectivePose });
        syncHandles(session.engine);
      } catch (error) {
        setNotice(failureText(error, "드래그 미리보기를 적용하지 못했습니다."));
      }
    }
  };

  const finishDrag = (event: ReactPointerEvent<SVGCircleElement>, commit: boolean): void => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.mode === 3) {
      if (!commit || !session.scaleOutcome) { cancelDrag(); return; }
      dragRef.current = null;
      setDraggingBone(null);
      releaseCapture(event.currentTarget, event.pointerId);
      dispatch({ type: "param/set", group: "body", key: session.scaleOutcome.key, value: session.scaleOutcome.value, coalesceKey: `shaper-bone-scale:${session.handle.bone}` });
      return;
    }
    if (session.mode === 1) {
      const ikOutcome = session.ikOutcome;
      if (!commit || !ikOutcome) { cancelDrag(); return; }
      dragRef.current = null;
      setDraggingBone(null);
      releaseCapture(event.currentTarget, event.pointerId);
      dispatch({ type: "pose/set", pose: ikOutcome.pose, scope: "full", labelKo: ikOutcome.labelKo });
      return;
    }
    const outcome = session.outcome;
    const rotation = outcome?.pose[outcome.pivotBone];
    if (!commit || !outcome || !rotation) { cancelDrag(); return; }
    dragRef.current = null;
    setDraggingBone(null);
    releaseCapture(event.currentTarget, event.pointerId);
    const nextPose = applySymmetryToPose(poseRef.current, outcome.pivotBone, rotation, symmetryRef.current || event.altKey);
    dispatch({ type: "pose/set", pose: nextPose, scope: "full", labelKo: `관절 드래그: ${jointLabelKo(outcome.pivotBone)}` });
  };

  const onControlPointDown = (event: ReactPointerEvent<SVGCircleElement>, cp: ShaperProjectedControlPoint): void => {
    if (!engine || event.button !== 0) return;
    event.preventDefault();
    const camera = readViewportCamera(engine);
    const startPixel = camera ? pixelOf(event, camera) : null;
    if (!camera || !startPixel) return;
    if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId);
    cpDragRef.current = { pointerId: event.pointerId, target: event.currentTarget, controlPoint: cp, startPixel, baseFace: labState.recipe.face, baseBody: labState.recipe.body, changes: [] };
    setDraggingCp(cp.id);
    setNotice(`${cp.labelKo} 드래그 성형 시작`);
  };

  const onControlPointMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    const session = cpDragRef.current;
    if (!session || !engine || session.pointerId !== event.pointerId) return;
    const camera = readViewportCamera(engine);
    const currentPixel = camera ? pixelOf(event, camera) : null;
    if (!camera || !currentPixel) return;
    const outcome = computeShaperControlPointDrag({ controlPoint: session.controlPoint, startPixel: session.startPixel, currentPixel, renderWidth: camera.width, renderHeight: camera.height, baseFace: session.baseFace, baseBody: session.baseBody });
    session.changes = outcome.changes;
    setNotice(outcome.summaryKo);
  };

  const finishControlPointDrag = (event: ReactPointerEvent<SVGCircleElement>, commit: boolean): void => {
    const session = cpDragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!commit || session.changes.length === 0) { cancelDrag(); return; }
    cpDragRef.current = null;
    setDraggingCp(null);
    releaseCapture(event.currentTarget, event.pointerId);
    for (const change of session.changes) {
      dispatch({ type: "param/set", group: change.group, key: change.key, value: change.value, coalesceKey: `shaper-cp:${session.controlPoint.id}` });
    }
  };

  const onDrawDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const driver = driverRef.current;
    if (!driver || event.button !== 0) return;
    event.preventDefault();
    const ndc = clientToNdc(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId);
    const touched = ndc ? driver.down({ ndcX: ndc[0], ndcY: ndc[1], pressure: normalizePointerPressure(event) }) : false;
    setNotice(touched ? null : `선택한 레이어(${PART_ROLE_LABELS_KO[paint.getState().activePart]}) 표면 위에서 시작하세요.`);
  };

  const onDrawMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const driver = driverRef.current;
    if (!driver?.active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const sample of coalesced.length > 0 ? coalesced : [native]) {
      const ndc = clientToNdc(sample.clientX, sample.clientY, rect);
      if (ndc) driver.move({ ndcX: ndc[0], ndcY: ndc[1], pressure: normalizePointerPressure(sample) });
    }
  };

  const onDrawUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    driverRef.current?.up();
    releaseCapture(event.currentTarget, event.pointerId);
  };

  const hudList = hud ? hudRows(hud) : [];
  const viewBox = renderSize ? `0 0 ${renderSize.width} ${renderSize.height}` : undefined;
  const ratio = typeof window !== "undefined" ? viewportPixelRatio(window.devicePixelRatio) : 1;
  const noHandleReason = engine && showHandles && handles.length === 0 ? "이 소스에는 스켈레톤이 없어 표시할 관절 핸들이 없습니다." : null;
  const poseSkeleton = engine && (showHandles || showControlPoints) ? readPoseSkeleton(engine) : null;
  const skeletonCorrupted = Boolean(poseSkeleton && diagnoseSkeletonData(poseSkeleton));
  const activeCamera = engine && showControlPoints ? readViewportCamera(engine) : null;
  renderFailureRef.current = null;
  const onRenderFailure = (failure: LabFailure): void => { renderFailureRef.current = failure; };
  const boneLinks = engine && showHandles && poseSkeleton ? computeVisibleBoneLinks(handles, poseSkeleton, { onFailure: onRenderFailure }) : [];
  const controlPoints = engine && showControlPoints && poseSkeleton && activeCamera ? computeShaperControlPoints(poseSkeleton, plan?.boneRotations ?? labState.recipe.pose, activeCamera, { onFailure: onRenderFailure }) : [];
  const activeHandle = draggingBone ? handles.find((entry) => entry.bone === draggingBone) ?? null : null;

  return (
    <div ref={containerRef} className="cl-viewport" data-checkerboard={checkerboard ? "true" : undefined} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
      <ViewportBackdropLayers checkerboard={checkerboard} manuscriptGuide={manuscriptGuide} referenceCut={referenceCut} />
      <canvas key={canvasGeneration} ref={registerCanvas} className="cl-viewport-canvas" aria-label="캐릭터 뷰포트" aria-keyshortcuts={CANVAS_KEY_SHORTCUTS} tabIndex={0} style={{ position: "relative", zIndex: 1 }} />

      <div className="cl-viewport-toolbar" role="toolbar" aria-label="뷰포트 도구" style={{ position: "absolute", top: 8, left: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span className="cl-viewport-group" role="group" aria-label="카메라 프레이밍" style={{ display: "inline-flex", gap: 4 }}>
          {FRAMING_MODES.map((entry) => (
            <button key={entry.mode} type="button" className="cl-viewport-button" aria-pressed={framing === entry.mode} disabled={!engine} onClick={() => onFraming(entry.mode)}>{entry.label}</button>
          ))}
          <button type="button" className="cl-viewport-button" disabled={!engine} onClick={onResetView} title="현재 프레이밍으로 시점을 되돌립니다(캔버스 더블클릭·0 키·F5 키와 같음)">시점 초기화</button>
          <select className="cl-viewport-select" aria-label="카메라 조작 방식" value={cameraInputStyle} title={formatShaperInputStyleGuide(cameraInputStyle).camControlToolTipText} onChange={(event) => setCameraInputStyle(event.target.value as ShaperCameraInputStyle)}>
            <option value="unity">Unity 조작</option>
            <option value="blender">Blender 조작</option>
            <option value="max">3ds Max 조작</option>
          </select>
        </span>
        <ViewportCompositionBar
          engineReady={Boolean(engine)}
          checkerboard={checkerboard}
          manuscriptGuide={manuscriptGuide}
          activeYawDeg={activeYawDeg}
          activePitchDeg={activePitchDeg}
          referenceCut={referenceCut}
          onToggleCheckerboard={() => setCheckerboard((prev) => !prev)}
          onToggleManuscriptGuide={() => setManuscriptGuide((prev) => !prev)}
          onSelectTurnaround={onSelectTurnaround}
          onSelectPitch={onSelectPitch}
          onLoadReferenceFile={onLoadReferenceFile}
          onChangeReferenceOpacity={onChangeReferenceOpacity}
          onChangeReferencePlacement={onChangeReferencePlacement}
          onClearReference={() => { setReferenceCut(null); setNotice("원고 컷 참조를 해제했습니다."); }}
        />
        <span className="cl-viewport-group" role="group" aria-label="오버레이" style={{ display: "inline-flex", gap: 4 }}>
          <button type="button" className="cl-viewport-button" aria-pressed={showHandles} onClick={() => setShowHandles((value) => !value)}>관절 핸들</button>
          <button type="button" className="cl-viewport-button" aria-pressed={showFingers} disabled={!showHandles} onClick={() => setShowFingers((value) => !value)}>손가락 핸들</button>
          <button type="button" className="cl-viewport-button" aria-pressed={showControlPoints} title="SHAPER ControlPoint(초록색 구체): 3D 뷰포트에서 얼굴·체형 제어점을 직접 끌어 성형" onClick={() => setShowControlPoints((value) => !value)}>형상 제어점</button>
          <button type="button" className="cl-viewport-button" aria-pressed={symmetryMode} disabled={!showHandles} title="SHAPER 대칭 포즈 조작(좌우 관절 대칭 회전/IK)" onClick={() => setSymmetryMode((value) => !value)}>대칭 조작</button>
          <button type="button" className="cl-viewport-button" aria-pressed={pivotMode === "direct"} disabled={!showHandles} title="SHAPER BoneManager.pivotIKMode 전환" onClick={() => setPivotMode((mode) => (mode === "parent" ? "direct" : "parent"))}>직접 피벗</button>
          <select className="cl-viewport-select" aria-label="기즈모 조작 모드" value={gizmoMode} disabled={!showHandles} title="SHAPER PivotManager 기즈모 모드 전환 (단축키 Q / W / E / R)" onChange={(event) => setGizmoMode(Number(event.target.value) as ShaperGizmoMode)}>
            {SHAPER_GIZMO_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.shortLabelKo}</option>)}
          </select>
          <select className="cl-viewport-select" aria-label="SHAPER 내장 프리셋" value={shaperPresetId} title="SHAPER BuiltInData 풀세트 아키타입·체형·두상·이목구비·포즈를 즉시 적용합니다" onChange={(event) => applyShaperBuiltInPreset(event.target.value)}>
            <option value="">SHAPER 프리셋 적용…</option>
            <optgroup label="SHAPER 풀세트 아키타입 (헤어+의상+체형+포즈)">
              {Object.values(SHAPER_BUILTIN_ARCHETYPE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
            </optgroup>
            <optgroup label="SHAPER 정본 체형 (BuiltInData/body)">
              {Object.values(SHAPER_BUILTIN_BODY_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
            </optgroup>
            <optgroup label="SHAPER 정본 두상 (BuiltInData/head)">
              {Object.values(SHAPER_BUILTIN_FACE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
            </optgroup>
            <optgroup label="SHAPER 이목구비 파츠 (BuiltInData/parts)">
              {Object.values(SHAPER_BUILTIN_PART_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
            </optgroup>
            <optgroup label="SHAPER 정본 포즈 (BuiltInData/pose)">
              {Object.values(SHAPER_BUILTIN_POSE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
            </optgroup>
          </select>
          <button type="button" className="cl-viewport-button" aria-pressed={showHud} onClick={() => setShowHud((value) => !value)}>HUD</button>
          <button type="button" className="cl-viewport-button" aria-pressed={ui.drawingMode} disabled={!engine} onClick={() => setDrawingMode(!ui.drawingMode)}>드로잉</button>
        </span>
      </div>

      {labState.engine.phase === "idle" ? <ViewportOnboardingCard onSelectBackend={selectBackend} /> : null}
      {labState.engine.phase !== "ready" ? (
        <p className="cl-viewport-status" role="status" data-tone={engineText.tone} style={{ position: "absolute", left: 12, right: 12, bottom: 12, margin: 0 }}>{engineText.text}</p>
      ) : null}

      {engine && (showHandles || showControlPoints) ? (
        <ViewportSvgGizmoLayer
          svgRef={svgRef} gizmoMode={gizmoMode} viewBox={viewBox} ratio={ratio} showHandles={showHandles} showControlPoints={showControlPoints} skeletonCorrupted={skeletonCorrupted}
          boneLinks={boneLinks} handles={handles} activeHandle={activeHandle} draggingBone={draggingBone} controlPoints={controlPoints} draggingCp={draggingCp}
          onHandleDown={onHandleDown} onHandleMove={onHandleMove} onHandleUp={(event) => finishDrag(event, true)} onHandleCancel={(event) => finishDrag(event, false)}
          onHandleLostCapture={(event) => { if (dragRef.current?.pointerId === event.pointerId) cancelDrag(); }}
          onControlPointDown={onControlPointDown} onControlPointMove={onControlPointMove} onControlPointUp={(event) => finishControlPointDrag(event, true)} onControlPointCancel={(event) => finishControlPointDrag(event, false)}
          onControlPointLostCapture={(event) => { if (cpDragRef.current?.pointerId === event.pointerId) cancelDrag(); }}
        />
      ) : null}

      {engine && ui.drawingMode ? (
        <div className="cl-viewport-draw-layer" role="application" aria-label="모델 위 드로잉 영역" style={{ ...FILL, cursor: "crosshair", touchAction: "none" }} onPointerDown={onDrawDown} onPointerMove={onDrawMove} onPointerUp={onDrawUp} onPointerCancel={() => driverRef.current?.cancel()} onLostPointerCapture={() => driverRef.current?.cancel()} />
      ) : null}

      {engine && ui.drawingMode ? (
        <p className="cl-viewport-hint" style={{ position: "absolute", top: 44, left: 8, margin: 0 }}>
          드로잉 모드({toolMode === "eraser" ? "지우개" : "브러시"}{paintSymmetry ? " · 대칭 ON" : ""}) · 레이어 {PART_ROLE_LABELS_KO[activePart]}(L{activeSublayer}) · 브러시 {brushRadius}px — 카메라 조작은 꺼져 있습니다(드로잉을 끄면 회전·확대).
        </p>
      ) : null}

      {notice || noHandleReason ? (
        <p className="cl-viewport-notice" role="status" style={{ position: "absolute", left: 8, right: 8, bottom: engine ? 8 : 56, margin: 0 }}>
          {notice ?? noHandleReason}
        </p>
      ) : null}

      {hudList.length > 0 ? (
        <dl className="cl-viewport-hud" aria-label="성능 HUD" style={{ position: "absolute", top: 8, right: 8, margin: 0, pointerEvents: "none" }}>
          {hudList.map((row) => (
            <div key={row.key} className="cl-viewport-hud-row" data-key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <dt>{row.label}</dt>
              <dd style={{ margin: 0 }}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
