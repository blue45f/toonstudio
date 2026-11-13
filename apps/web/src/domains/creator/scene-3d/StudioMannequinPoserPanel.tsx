/**
 * Studio 3D 데생 인형 포저 패널 (v5 에코르셰 해부학·견갑상완 리듬·무게중심 추선·2D 핸드 셋업·접촉/사면도 영속·CSP 호환 통합).
 *
 * 클립스튜디오 데생 인형을 능가하는 에코르셰 근육 면·유기 단면 로프트·아사로 다면체 모드,
 * 관절 잠금(Joint Lock), 견갑상완 리듬, 생체역학 무게중심(CoM) 자동 균형, 루미스·단축 등고선 가이드,
 * 손 접촉·콘트라포스토·사면도(Quad View)·화각 저장/복원 및 Undo/Redo·체형 변경 연동,
 * 2D 핸드 셋업 패드(벌림·쥐기·엄지 대립), 클립스튜디오 `.pep`/`.3dp` 양방향 변환을 제공한다.
 */

import { StudioMannequinRotationControls, type StudioMannequinRotationCommand } from "./StudioMannequinRotationControls";
import {
  AlertTriangle,
  Camera,
  PersonStanding,
  Redo2,
  Sliders,
  Sparkles,
  Undo2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { confirmStudioDestructiveAction } from "../studio-destructive-action-preview";
import { studioDiscardUnpersistedMannequinStateRequest } from "../studio-destructive-command-catalog";
import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import { STUDIO_FOCUS_RING, studioSegmentChipClass } from "../studio-panel-ui";
import { copyStudioText } from "../studio-workbench-clipboard";
import {
  StudioVrmPhotoPoseScanner,
  type StudioVrmPhotoPoseApplyPayload,
} from "../vrm/StudioVrmPhotoPoseScanner";

import { getWebtoonPosePresetById } from "./studio-3d-advanced-poses-library";
import { StudioMannequinDuoFigureSwitch, StudioMannequinDuoPartnerCard } from "./StudioMannequinDuoPartnerCard";
import {
  isStudioMannequinDuoPreset,
  resolveStudioMannequinLibraryPresetPose,
  resolveStudioMannequinWebtoonPresetPose,
} from "./studio-mannequin-preset-application";
import { composeStudioMannequinDuoState, useStudioMannequinDuoPartner } from "./use-studio-mannequin-duo-partner";
import { StudioMannequinCameraSection, type StudioMannequinWebcamLoadingStage } from "./StudioMannequinCameraSection";
import { StudioMannequinPoserHeaderActions } from "./StudioMannequinPoserHeaderActions";
import { studioMannequinPosesNearlyEqual, useStudioMannequinViewportGestures } from "./use-studio-mannequin-viewport-gestures";

import { getProductStudioMannequinStateSqliteRepository } from "./studio-mannequin-bg3d-preset-sqlite-repository";
import { applyStudioBodyMorph, type StudioBodyMorph } from "./studio-body-morphs";
import {
  mergeHandPadIntoFingerPose,
  type StudioMannequinFingerSplayMap,
  type StudioMannequinHandPadOutput,
  type StudioMannequinSurfaceMode,
} from "./studio-mannequin-ecorche-anatomy";
import {
  analyzeStudioMannequinGesture,
  applyStudioMannequinBreathingParams,
  applyStudioMannequinGazeTarget,
  type StudioMannequinHandContactTargetId,
} from "./studio-mannequin-gesture-dynamics";
import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_FINGER_NAMES,
  STUDIO_MANNEQUIN_HEAD_PRESETS,
  buildStudioMannequinSpec,
  clampStudioMannequinBodyParams,
  clampStudioMannequinFingerPose,
  clampStudioMannequinJointRotation,
  resolveStudioMannequinArchetypeParams,
  type StudioMannequinBodyParams,
  type StudioMannequinFingerName,
  type StudioMannequinFingerPose,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
  clampStudioMannequinFovDeg,
} from "./studio-mannequin-quad-view";
import { createStudioMannequinPhotoPoseApplyPlan } from "./studio-mannequin-photo-pose-apply";
import {
  createStudioMannequinHandFrameResult,
  disposeStudioMannequinHandLandmarker,
  getStudioMannequinHandTrackingErrorMessage,
  initStudioMannequinHandLandmarker,
  type StudioMannequinHandLandmarker,
} from "./studio-mannequin-hand-tracking";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  canonicalizeStudioMannequinRigState,
  createStudioMannequinRestPose,
  encodeStudioMannequinShareHash,
  exportStudioMannequinStateToJSON,
  normalizeStudioMannequinPose,
  studioMannequinPosePresetScope,
  type StudioMannequinHandContactMap,
  type StudioMannequinPersistentPartner,
  type StudioMannequinPersistentRigState,
  type StudioMannequinPersistentState,
  type StudioMannequinPose,
  type StudioMannequinPoseCategory,
} from "./studio-mannequin-poses";
import {
  hasActiveStudioMannequinSemanticContacts,
  importStudioMannequinStateWithDiagnostics,
  mirrorStudioMannequinSemanticContacts,
  parseStudioMannequinShareHashWithDiagnostics,
  reconcileStudioMannequinSemanticContactsAfterManualEdit,
  resolveContrappostoToggleTransition,
  resolveHandContactToggleTransition,
  resolveUndoRedoSemanticStep,
  retargetStudioMannequinSemanticPose,
} from "./studio-mannequin-semantic-persistence";
import {
  STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  analyzeStudioMannequinBalance,
  applyStudioMannequinJointLocks,
  applyStudioMannequinScapulohumeralRhythm,
  exportMannequinParamsToCsp3dp,
  exportMannequinPoseToCspPep,
  importCsp3dpToMannequinParams,
  importCspPepPoseToMannequin,
  stabilizeStudioMannequinCenterOfMass,
  toggleStudioMannequinJointLock,
  type StudioMannequinGuideVisibility,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";
import { StudioMannequinBodySection, StudioMannequinJointSection } from "./StudioMannequinProSections";
import {
  StudioMagicPoserPanel,
  type StudioMagicPoserScene,
} from "./StudioMagicPoserPanel";
import {
  createStudioPoseHistory,
  describeStudioPoseHistory,
  recordStudioPoseHistory,
  type StudioMannequinPoseSemanticMeta,
  type StudioPoseHistory,
} from "./studio-pose-history";
import {
  createStudioMannequinScene,
  type StudioMannequinCameraPreset,
  type StudioMannequinCaptureResult,
  type StudioMannequinProjection,
  type StudioMannequinSceneHandle,
} from "./studio-mannequin-scene";
import { StudioCompositionGenerationBriefPanel } from "../ai/StudioCompositionGenerationBriefPanel";
import { buildStudioMannequinCompositionSnapshot } from "./studio-mannequin-composition-snapshot";
import type { StudioMannequinLightingRig } from "./studio-mannequin-lighting";
import { StudioMannequinFootGroundingToggle } from "./StudioMannequinFootGroundingToggle";
import { useStudioMannequinFootGrounding } from "./use-studio-mannequin-foot-grounding";
import { resolveStudioMannequinRenderFrame } from "./studio-mannequin-render-pipeline";
import {
  disposeStudioMannequinPoseLandmarker,
  getStudioMannequinWebcamErrorMessage,
  initStudioMannequinPoseLandmarker,
  isStudioMannequinWebcamAbortError,
  requestStudioMannequinCameraStream,
  solvePoseToMannequinJoints,
  stopStudioMannequinMediaStream,
  smoothMannequinJointRotations,
  type StudioMannequinPoseLandmarker,
  type StudioMannequinWebcamErrorStage,
} from "./studio-mannequin-webcam-tracking";
import {
  buildShaperLayeredPsd,
  SHAPER_MANNEQUIN_SUPPORTED_CATEGORIES,
  type ShaperPresetSelection,
} from "./studio-shaper-model";
import { StudioShaperPanel } from "./StudioShaperPanel";
import { StudioMannequinPoseSection } from "./StudioMannequinPoserPoseSection";
import "../studio-3d-ui/studio-3d-illustrated-chrome.css";
import "../studio-3d-ui/studio-3d-reference-workspace.css";

import { ModalStatusSlot } from "@/shared/components/modal-status-slot";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export { StudioMannequinBodySection, StudioMannequinCameraSection, StudioMannequinJointSection, StudioMannequinPoseSection };
export type { StudioMannequinCaptureResult } from "./studio-mannequin-scene";

export interface StudioMannequinPoserPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onInsert: (result: StudioMannequinCaptureResult) => Promise<boolean | void> | boolean | void;
  readonly initialPosePresetId?: string;
  readonly captureTarget?: "canvas" | "download";
}

type MannequinTabId = "shaper" | "body" | "pose" | "magic" | "joint" | "camera";
type StudioMannequinPersistenceStatus = "idle" | "loading" | "ready" | "saving" | "memory-only";

interface StudioMannequinPhotoPoseApplyStatus {
  readonly sourceName: string;
  readonly confidencePercent: number;
  readonly appliedJointCount: number;
}

const STUDIO_MANNEQUIN_PHOTO_MIN_APPLIED_JOINTS = 6;
const STUDIO_MANNEQUIN_HAND_MAX_FRAME_FAILURES = 20;

const TABS: readonly { id: MannequinTabId; label: string; icon: ReactElement }[] = Object.freeze([
  { id: "shaper", label: "셰이퍼", icon: <Wand2 size={13} aria-hidden /> },
  { id: "body", label: "체형", icon: <UserRound size={13} aria-hidden /> },
  { id: "pose", label: "포즈", icon: <PersonStanding size={13} aria-hidden /> },
  { id: "magic", label: "매직 포저", icon: <Sparkles size={13} aria-hidden /> },
  { id: "joint", label: "관절", icon: <Sliders size={13} aria-hidden /> },
  { id: "camera", label: "카메라·캡처", icon: <Camera size={13} aria-hidden /> },
]);

function getErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

function createWebcamPreflightError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function downloadTextBlob(content: string, filename: string, mimeType = "application/xml"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudioMannequinPoserPanel({
  open,
  onClose,
  onInsert,
  initialPosePresetId,
  captureTarget = "canvas",
}: StudioMannequinPoserPanelProps): ReactElement | null {
  const dialogTitleId = useId();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<StudioMannequinSceneHandle | null>(null);
  const lightingRigRef = useRef<StudioMannequinLightingRig | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cspPepInputRef = useRef<HTMLInputElement | null>(null);
  const csp3dpInputRef = useRef<HTMLInputElement | null>(null);
  const [stateRepository] = useState(getProductStudioMannequinStateSqliteRepository);

  const [params, setParams] = useState<StudioMannequinBodyParams>(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
  const [pose, setPose] = useState<StudioMannequinPose>(createStudioMannequinRestPose);
  const [materialStyle, setMaterialStyle] = useState<StudioMannequinMaterialStyle>("wood");
  const [surfaceMode, setSurfaceMode] = useState<StudioMannequinSurfaceMode>("ecorche");
  const [pectoralVolume, setPectoralVolume] = useState(1);
  const [muscleDefinition, setMuscleDefinition] = useState(1);
  const [breathPhase, setBreathPhase] = useState(0);
  const [fingerPose, setFingerPose] = useState<StudioMannequinFingerPose>(() => clampStudioMannequinFingerPose(undefined));
  const [leftSplayDeg, setLeftSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});
  const [rightSplayDeg, setRightSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});
  const [jointLocks, setJointLocks] = useState<StudioMannequinJointLockMap>({});
  const [scapulohumeralRhythm, setScapulohumeralRhythm] = useState(true);
  const [guideVisibility, setGuideVisibility] = useState<StudioMannequinGuideVisibility>(STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY);
  const [activeContrapposto, setActiveContrapposto] = useState<"left" | "right" | null>(null);
  const [activeHandContacts, setActiveHandContacts] = useState<StudioMannequinHandContactMap>({});

  const [poseCategory, setPoseCategory] = useState<StudioMannequinPoseCategory | "all">("all");
  const [tab, setTab] = useState<MannequinTabId>("pose");
  const [selectedJointId, setSelectedJointId] = useState<StudioMannequinJointId | null>(null);
  const [projection, setProjection] = useState<StudioMannequinProjection>("perspective");
  const [quadView, setQuadView] = useState(false);
  const [cameraFovDeg, setCameraFovDeg] = useState(STUDIO_MANNEQUIN_FOV_DEFAULT_DEG);
  const [cameraPreset, setCameraPreset] = useState<StudioMannequinCameraPreset>("home");
  const [selectedCameraAngle, setSelectedCameraAngle] = useState<StudioMannequinCameraPreset | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [lastPosePresetId, setLastPosePresetId] = useState<string | null>(initialPosePresetId ?? null);
  const [captureScale, setCaptureScale] = useState<number>(2);
  const [capturing, setCapturing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<StudioMannequinPersistenceStatus>("idle");
  const [photoPoseApplyStatus, setPhotoPoseApplyStatus] = useState<StudioMannequinPhotoPoseApplyStatus | null>(null);
  const footGrounding = useStudioMannequinFootGrounding();
  const groundFootPose = footGrounding.groundPose;

  const poseHistoryRef = useRef<StudioPoseHistory>(createStudioPoseHistory());
  const [poseHistorySnapshot, setPoseHistorySnapshot] = useState<StudioPoseHistory>(poseHistoryRef.current);
  const rotateGestureRecordedRef = useRef(false);

  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamLoadingStage, setWebcamLoadingStage] = useState<StudioMannequinWebcamLoadingStage>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [poseFrozen, setPoseFrozen] = useState(false);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [handTracking, setHandTracking] = useState(false);
  const [handTrackingLoading, setHandTrackingLoading] = useState(false);
  const [handTrackingError, setHandTrackingError] = useState<string | null>(null);
  const [facialTracking, setFacialTracking] = useState(true);

  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const webcamLandmarkerRef = useRef<StudioMannequinPoseLandmarker | null>(null);
  const webcamFrameRef = useRef<number | null>(null);
  const webcamAbortControllerRef = useRef<AbortController | null>(null);
  const webcamSessionRef = useRef(0);
  const webcamActiveRef = useRef(false);
  const webcamLoadingRef = useRef(false);
  const handLandmarkerRef = useRef<StudioMannequinHandLandmarker | null>(null);
  const handInitAbortControllerRef = useRef<AbortController | null>(null);
  const handTrackingRef = useRef(false);
  const handTrackingLoadingRef = useRef(false);
  const handFailureStreakRef = useRef(0);
  const poseFrozenRef = useRef(false);
  const mirrorModeRef = useRef(true);
  const mountedRef = useRef(false);
  const hydrationGenerationRef = useRef(0);
  const hydrationSafeForFinalFlushRef = useRef(false);
  const persistenceGenerationRef = useRef(0);
  const stateRevisionRef = useRef(0);
  const poseRef = useRef(pose);
  const jointLocksRef = useRef(jointLocks);
  const rhythmRef = useRef(scapulohumeralRhythm);
  const activeContrappostoRef = useRef<"left" | "right" | null>(activeContrapposto);
  const activeHandContactsRef = useRef<StudioMannequinHandContactMap>(activeHandContacts);
  const projectionRef = useRef<StudioMannequinProjection>(projection);
  const quadViewRef = useRef(quadView);
  const cameraFovDegRef = useRef(cameraFovDeg);
  const breathPhaseRef = useRef(breathPhase);
  const fingerPoseRef = useRef(fingerPose);
  const duoPartnerRef = useRef<StudioMannequinPersistentPartner | null>(null);
  jointLocksRef.current = jointLocks;
  rhythmRef.current = scapulohumeralRhythm;
  activeContrappostoRef.current = activeContrapposto;
  activeHandContactsRef.current = activeHandContacts;
  projectionRef.current = projection;
  quadViewRef.current = quadView;
  cameraFovDegRef.current = cameraFovDeg;
  breathPhaseRef.current = breathPhase;
  fingerPoseRef.current = fingerPose;

  const readCurrentSemanticMeta = useCallback((): StudioMannequinPoseSemanticMeta => ({
    ...(activeHandContactsRef.current.left || activeHandContactsRef.current.right ? { handContacts: activeHandContactsRef.current } : {}),
    ...(activeContrappostoRef.current ? { contrapposto: activeContrappostoRef.current } : {}),
  }), []);

  const buildCurrentCanonicalRig = useCallback(
    (): StudioMannequinPersistentRigState | undefined =>
      canonicalizeStudioMannequinRigState({
        handContacts: activeHandContactsRef.current,
        contrapposto: activeContrappostoRef.current ?? undefined,
        quadView: quadViewRef.current ? true : undefined,
        cameraFovDeg: cameraFovDegRef.current,
        projection: projectionRef.current === "orthographic" ? "orthographic" : undefined,
      }),
    [],
  );

  const stateRef = useRef<StudioMannequinPersistentState>({ params, pose });

  const commitDuoPartnerState = useCallback((partner: StudioMannequinPersistentPartner | null, userEdit: boolean) => {
    duoPartnerRef.current = partner;
    if (userEdit) stateRevisionRef.current += 1;
    stateRef.current = composeStudioMannequinDuoState(
      { params: stateRef.current.params, pose: stateRef.current.pose, rig: buildCurrentCanonicalRig() },
      partner,
    );
  }, [buildCurrentCanonicalRig]);

  const duo = useStudioMannequinDuoPartner({ sceneRef, onPartnerCommitted: commitDuoPartnerState, groundPose: groundFootPose });
  const { attachScene: attachDuoScene, placeDuo, applyPoseToPartner, restorePartner: restoreDuoPartner } = duo;
  duoPartnerRef.current = duo.partner;
  stateRef.current = composeStudioMannequinDuoState({ params, pose, rig: buildCurrentCanonicalRig() }, duo.partner);

  const webcamLoading = webcamLoadingStage !== null;
  webcamActiveRef.current = webcamActive;
  webcamLoadingRef.current = webcamLoading;
  handTrackingRef.current = handTracking;
  handTrackingLoadingRef.current = handTrackingLoading;
  poseFrozenRef.current = poseFrozen;
  mirrorModeRef.current = mirrorMode;

  const syncStateSnapshot = useCallback((nextParams: StudioMannequinBodyParams, nextPose: StudioMannequinPose) => {
    stateRef.current = composeStudioMannequinDuoState({ params: nextParams, pose: nextPose, rig: buildCurrentCanonicalRig() }, duoPartnerRef.current);
  }, [buildCurrentCanonicalRig]);

  const applySemanticMeta = useCallback((meta: StudioMannequinPoseSemanticMeta | undefined) => {
    const nextHandContacts: StudioMannequinHandContactMap = {
      ...(meta?.handContacts?.left ? { left: meta.handContacts.left } : {}),
      ...(meta?.handContacts?.right ? { right: meta.handContacts.right } : {}),
    };
    const nextContrapposto: "left" | "right" | null =
      meta?.contrapposto === "left" || meta?.contrapposto === "right" ? meta.contrapposto : null;
    activeHandContactsRef.current = nextHandContacts;
    activeContrappostoRef.current = nextContrapposto;
    setActiveHandContacts(nextHandContacts);
    setActiveContrapposto(nextContrapposto);
    syncStateSnapshot(stateRef.current.params, poseRef.current);
  }, [syncStateSnapshot]);

  const commitParams = useCallback((nextParams: StudioMannequinBodyParams) => {
    stateRevisionRef.current += 1;
    const currentMeta = readCurrentSemanticMeta();
    let nextPose = poseRef.current;
    if (hasActiveStudioMannequinSemanticContacts(currentMeta)) {
      const nextSpec = buildStudioMannequinSpec(applyStudioMannequinBreathingParams(nextParams, breathPhaseRef.current), { fingerPose: fingerPoseRef.current });
      nextPose = retargetStudioMannequinSemanticPose(nextSpec, poseRef.current, currentMeta, jointLocksRef.current);
      poseRef.current = nextPose;
      setPose(nextPose);
    }
    syncStateSnapshot(nextParams, nextPose);
    setParams(nextParams);
  }, [readCurrentSemanticMeta, syncStateSnapshot]);

  const commitPose = useCallback((nextPose: StudioMannequinPose): StudioMannequinPose => {
    stateRevisionRef.current += 1;
    poseRef.current = nextPose;
    syncStateSnapshot(stateRef.current.params, nextPose);
    setPose(nextPose);
    return nextPose;
  }, [syncStateSnapshot]);

  const recordPoseHistory = useCallback(() => {
    poseHistoryRef.current = recordStudioPoseHistory(poseHistoryRef.current, poseRef.current, readCurrentSemanticMeta());
    setPoseHistorySnapshot(poseHistoryRef.current);
  }, [readCurrentSemanticMeta]);

  const commitPoseWithHistory = useCallback(
    (nextPose: StudioMannequinPose, nextMeta: StudioMannequinPoseSemanticMeta = {}): StudioMannequinPose => {
      const locked = applyStudioMannequinJointLocks(poseRef.current, nextPose, jointLocksRef.current);
      recordPoseHistory();
      rotateGestureRecordedRef.current = true;
      applySemanticMeta(nextMeta);
      return commitPose(groundFootPose(locked, stateRef.current.params).pose);
    },
    [applySemanticMeta, commitPose, groundFootPose, recordPoseHistory],
  );

  const resetPoseHistoryGesture = useCallback(() => {
    rotateGestureRecordedRef.current = false;
  }, []);

  const recordPoseHistoryOncePerGesture = useCallback(() => {
    if (rotateGestureRecordedRef.current) return;
    rotateGestureRecordedRef.current = true;
    poseHistoryRef.current = recordStudioPoseHistory(poseHistoryRef.current, poseRef.current, readCurrentSemanticMeta());
    setPoseHistorySnapshot(poseHistoryRef.current);
  }, [readCurrentSemanticMeta]);

  const resetPoseHistoryGestureOnKey = (event: React.KeyboardEvent) => {
    if (!event.repeat) resetPoseHistoryGesture();
  };
  const viewportGestures = useStudioMannequinViewportGestures({
    onGestureStart: resetPoseHistoryGesture,
    onCameraMoved: () => setSelectedCameraAngle(null),
  });
  const notePoseEdited = viewportGestures.notePoseEdited;

  // 매직 포저 어댑터: 50종 손 프리셋의 30마디 굴곡(setFingerCurls) + 체형 모프(onBodyMorphChange) 완전 연동
  const magicPoserScene = useMemo<StudioMagicPoserScene>(
    () => ({
      setPose: (nextPose: StudioMannequinPose) => {
        const prevPose = poseRef.current;
        const grounded = groundFootPose(applyStudioMannequinJointLocks(prevPose, nextPose, jointLocksRef.current), stateRef.current.params).pose;
        recordPoseHistoryOncePerGesture();
        applySemanticMeta(reconcileStudioMannequinSemanticContactsAfterManualEdit(prevPose, grounded, readCurrentSemanticMeta()));
        return commitPose(grounded);
      },
      getPose: () => poseRef.current,
      setJointRotation: (jointId, rotation) => {
        if (jointLocksRef.current[jointId]) return;
        const prevPose = poseRef.current;
        const clamped = clampStudioMannequinJointRotation(jointId, rotation);
        recordPoseHistoryOncePerGesture();
        let next = normalizeStudioMannequinPose({
          joints: { ...prevPose.joints, [jointId]: clamped },
          pelvisOffset: prevPose.pelvisOffset,
        });
        if (rhythmRef.current && (jointId === "leftUpperArm" || jointId === "rightUpperArm")) {
          next = applyStudioMannequinScapulohumeralRhythm(next, jointLocksRef.current, 1);
        }
        applySemanticMeta(reconcileStudioMannequinSemanticContactsAfterManualEdit(prevPose, next, readCurrentSemanticMeta()));
        commitPose(next);
      },
      setFingerCurls: (side, curls) => {
        setFingerPose((prev) => {
          const handPatch: Partial<Record<StudioMannequinFingerName, readonly [number, number, number]>> = {};
          for (const fname of STUDIO_MANNEQUIN_FINGER_NAMES) {
            const c = curls[fname];
            if (typeof c === "number" && Number.isFinite(c)) handPatch[fname] = [c, c, c];
          }
          return clampStudioMannequinFingerPose({ ...prev, [side]: { ...prev[side], ...handPatch } });
        });
      },
      setLightingRig: (rig: StudioMannequinLightingRig) => {
        lightingRigRef.current = rig;
        sceneRef.current?.setLightingRig(rig);
      },
      getLightingRig: () => sceneRef.current?.getLightingRig() ?? lightingRigRef.current,
    }),
    [applySemanticMeta, commitPose, groundFootPose, readCurrentSemanticMeta, recordPoseHistoryOncePerGesture],
  );

  const morphBaseParamsRef = useRef<StudioMannequinBodyParams | null>(null);
  const handleMagicBodyMorphChange = useCallback(
    (morph: StudioBodyMorph) => {
      if (!morphBaseParamsRef.current) morphBaseParamsRef.current = stateRef.current.params;
      commitParams(applyStudioBodyMorph(morphBaseParamsRef.current, morph));
    },
    [commitParams],
  );

  const effectiveParams = useMemo(() => applyStudioMannequinBreathingParams(params, breathPhase), [params, breathPhase]);
  const spec = useMemo(() => buildStudioMannequinSpec(effectiveParams, { fingerPose }), [effectiveParams, fingerPose]);
  const balanceReport = useMemo(() => analyzeStudioMannequinBalance(spec, pose), [spec, pose]);
  const gestureAnalysis = useMemo(() => analyzeStudioMannequinGesture(spec, pose), [spec, pose]);

  const stepHistory = useCallback((direction: "undo" | "redo") => {
    const resolved = resolveUndoRedoSemanticStep({
      direction,
      history: poseHistoryRef.current,
      currentPose: poseRef.current,
      currentMeta: readCurrentSemanticMeta(),
      spec,
      locks: jointLocksRef.current,
    });
    if (!resolved) return;
    poseHistoryRef.current = resolved.history;
    setPoseHistorySnapshot(resolved.history);
    applySemanticMeta(resolved.meta);
    commitPose(resolved.pose);
  }, [applySemanticMeta, commitPose, readCurrentSemanticMeta, spec]);

  const handleUndoPose = useCallback(() => stepHistory("undo"), [stepHistory]);
  const handleRedoPose = useCallback(() => stepHistory("redo"), [stepHistory]);

  const poseHistoryDescription = useMemo(() => describeStudioPoseHistory(poseHistorySnapshot), [poseHistorySnapshot]);

  const compositionSnapshot = useMemo(
    () =>
      buildStudioMannequinCompositionSnapshot({
        cameraPreset,
        heightCm: params.heightCm,
        posePresetId: lastPosePresetId,
        poseLabel: lastPosePresetId
          ? (STUDIO_MANNEQUIN_POSE_PRESETS.find((entry) => entry.id === lastPosePresetId)?.label
            ?? getWebtoonPosePresetById(lastPosePresetId)?.name
            ?? null)
          : null,
        materialStyle,
      }),
    [cameraPreset, lastPosePresetId, materialStyle, params.heightCm],
  );

  const releaseHandTrackingResources = useCallback(() => {
    handTrackingRef.current = false;
    handTrackingLoadingRef.current = false;
    handFailureStreakRef.current = 0;
    handInitAbortControllerRef.current?.abort();
    handInitAbortControllerRef.current = null;
    handLandmarkerRef.current = null;
    disposeStudioMannequinHandLandmarker();
  }, []);

  const releaseWebcamResources = useCallback(() => {
    releaseHandTrackingResources();
    setHandTracking(false);
    setHandTrackingLoading(false);
    setHandTrackingError(null);
    webcamSessionRef.current += 1;
    webcamActiveRef.current = false;
    webcamLoadingRef.current = false;
    webcamAbortControllerRef.current?.abort();
    webcamAbortControllerRef.current = null;
    if (webcamFrameRef.current !== null) {
      cancelAnimationFrame(webcamFrameRef.current);
      webcamFrameRef.current = null;
    }
    const video = webcamVideoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // Ignore embedded browser pause() errors prior to metadata load.
      }
      video.srcObject = null;
    }
    const stream = webcamStreamRef.current;
    webcamStreamRef.current = null;
    if (stream) stopStudioMannequinMediaStream(stream);
    webcamLandmarkerRef.current = null;
    disposeStudioMannequinPoseLandmarker();
  }, [releaseHandTrackingResources]);

  const stopWebcam = useCallback(() => {
    releaseWebcamResources();
    setWebcamActive(false);
    setWebcamLoadingStage(null);
    setWebcamError(null);
  }, [releaseWebcamResources]);

  const handleToggleWebcam = useCallback(async () => {
    if (webcamActiveRef.current || webcamLoadingRef.current) {
      stopWebcam();
      return;
    }
    const session = webcamSessionRef.current + 1;
    webcamSessionRef.current = session;
    const abortController = new AbortController();
    webcamAbortControllerRef.current = abortController;
    webcamLoadingRef.current = true;
    let failureStage: StudioMannequinWebcamErrorStage = "camera";

    try {
      setWebcamLoadingStage("engine");
      setWebcamError(null);
      if (window.isSecureContext === false) {
        throw createWebcamPreflightError("StudioMannequinInsecureContextError", "Camera access requires a secure context.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw createWebcamPreflightError("StudioMannequinCameraUnavailableError", "navigator.mediaDevices.getUserMedia is unavailable.");
      }
      failureStage = "engine";
      const landmarker = await initStudioMannequinPoseLandmarker({ signal: abortController.signal });
      if (webcamSessionRef.current !== session || abortController.signal.aborted) return;

      failureStage = "camera";
      setWebcamLoadingStage("camera");
      const stream = await requestStudioMannequinCameraStream(
        () => navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: "user" } },
        }),
        { signal: abortController.signal },
      );
      if (webcamSessionRef.current !== session || abortController.signal.aborted) {
        stopStudioMannequinMediaStream(stream);
        return;
      }
      webcamStreamRef.current = stream;
      const video = webcamVideoRef.current;
      if (!video) {
        throw createWebcamPreflightError("StudioMannequinCameraUnavailableError", "The webcam preview element is unavailable.");
      }
      video.srcObject = stream;
      await video.play();
      if (webcamSessionRef.current !== session || abortController.signal.aborted) {
        stopStudioMannequinMediaStream(stream);
        video.srcObject = null;
        return;
      }
      webcamLandmarkerRef.current = landmarker;
      webcamActiveRef.current = true;
      webcamLoadingRef.current = false;
      setWebcamLoadingStage(null);
      setWebcamActive(true);
    } catch (cause) {
      if (webcamSessionRef.current !== session || abortController.signal.aborted || isStudioMannequinWebcamAbortError(cause)) {
        return;
      }
      console.warn(`Studio mannequin webcam ${failureStage} initialization failed:`, cause);
      releaseWebcamResources();
      setWebcamActive(false);
      setWebcamLoadingStage(null);
      setWebcamError(getStudioMannequinWebcamErrorMessage(failureStage, cause));
    } finally {
      if (webcamSessionRef.current === session) {
        webcamLoadingRef.current = false;
        setWebcamLoadingStage(null);
      }
    }
  }, [releaseWebcamResources, stopWebcam]);

  const handleToggleHandTracking = useCallback(() => {
    if (handTrackingLoadingRef.current || handTrackingRef.current) {
      releaseHandTrackingResources();
      setHandTracking(false);
      setHandTrackingLoading(false);
      setHandTrackingError(null);
      return;
    }
    if (!webcamActiveRef.current) return;
    const abortController = new AbortController();
    handInitAbortControllerRef.current = abortController;
    handTrackingLoadingRef.current = true;
    setHandTrackingLoading(true);
    setHandTrackingError(null);

    void initStudioMannequinHandLandmarker({ signal: abortController.signal }).then(
      (landmarker) => {
        if (abortController.signal.aborted || !webcamActiveRef.current) {
          disposeStudioMannequinHandLandmarker();
          return;
        }
        handInitAbortControllerRef.current = null;
        handLandmarkerRef.current = landmarker;
        handTrackingLoadingRef.current = false;
        handTrackingRef.current = true;
        setHandTrackingLoading(false);
        setHandTracking(true);
      },
      (cause: unknown) => {
        if (abortController.signal.aborted || isStudioMannequinWebcamAbortError(cause)) return;
        console.warn("Studio mannequin hand tracking initialization failed:", cause);
        releaseHandTrackingResources();
        setHandTracking(false);
        setHandTrackingLoading(false);
        setHandTrackingError(getStudioMannequinHandTrackingErrorMessage(cause));
      },
    );
  }, [releaseHandTrackingResources]);

  useEffect(() => {
    if (!open) stopWebcam();
  }, [open, stopWebcam]);

  useEffect(() => () => releaseWebcamResources(), [releaseWebcamResources]);

  poseRef.current = pose;

  const photoPoseAppliedPoseRef = useRef<StudioMannequinPose | null>(null);
  useEffect(() => {
    if (!photoPoseAppliedPoseRef.current || pose === photoPoseAppliedPoseRef.current) return;
    photoPoseAppliedPoseRef.current = null;
    setPhotoPoseApplyStatus(null);
  }, [pose]);

  useEffect(() => {
    if (!webcamActive) return;
    let lastVideoTime = -1;
    const loop = () => {
      if (!webcamActiveRef.current) return;
      try {
        const video = webcamVideoRef.current;
        const landmarker = webcamLandmarkerRef.current;
        if (
          !poseFrozenRef.current
          && video
          && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && video.currentTime !== lastVideoTime
          && landmarker
        ) {
          lastVideoTime = video.currentTime;
          const detection = landmarker.detectForVideo(video, performance.now());
          try {
            if (detection.landmarks && detection.landmarks[0]) {
              const rawJoints = solvePoseToMannequinJoints(detection.landmarks[0], {
                mirrorMode: mirrorModeRef.current,
                smoothing: 0.35,
              });
              const smoothedJoints = smoothMannequinJointRotations(poseRef.current.joints, rawJoints, 0.35);
              const updatedPose: StudioMannequinPose = {
                ...poseRef.current,
                joints: { ...poseRef.current.joints, ...smoothedJoints },
              };
              commitPose(updatedPose);
              sceneRef.current?.setPose(updatedPose);
            }
          } finally {
            detection.close?.();
          }

          const handLandmarker = handTrackingRef.current ? handLandmarkerRef.current : null;
          if (handLandmarker) {
            try {
              const handDetection = handLandmarker.detectForVideo(video, performance.now());
              try {
                const handFrame = createStudioMannequinHandFrameResult(handDetection, { mirror: mirrorModeRef.current });
                if (Object.keys(handFrame.wrists).length > 0) {
                  const smoothedWrists = smoothMannequinJointRotations(poseRef.current.joints, handFrame.wrists, 0.35);
                  const updatedPose: StudioMannequinPose = {
                    ...poseRef.current,
                    joints: { ...poseRef.current.joints, ...smoothedWrists },
                  };
                  commitPose(updatedPose);
                  sceneRef.current?.setPose(updatedPose);
                }
                handFailureStreakRef.current = 0;
              } finally {
                handDetection.close?.();
              }
            } catch (handCause) {
              console.warn("Studio mannequin hand frame analysis failed:", handCause);
              const streak = handFailureStreakRef.current + 1;
              handFailureStreakRef.current = streak;
              if (streak >= STUDIO_MANNEQUIN_HAND_MAX_FRAME_FAILURES) {
                releaseHandTrackingResources();
                setHandTracking(false);
                setHandTrackingError(frozenStatus2Text("studio.frozenStatus2.mannequin.handTrackingStopped", "실시간 손 인식이 반복적으로 실패해 손 추적을 중단했습니다. 신체 동작 인식은 계속됩니다."));
              }
            }
          }
        }
      } catch (cause) {
        console.warn("Studio mannequin webcam frame analysis failed:", cause);
        releaseWebcamResources();
        setWebcamActive(false);
        setWebcamLoadingStage(null);
        setWebcamError(getStudioMannequinWebcamErrorMessage("tracking", cause));
        return;
      }
      webcamFrameRef.current = requestAnimationFrame(loop);
    };
    webcamFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (webcamFrameRef.current !== null) {
        cancelAnimationFrame(webcamFrameRef.current);
        webcamFrameRef.current = null;
      }
    };
  }, [commitPose, releaseHandTrackingResources, releaseWebcamResources, webcamActive]);

  const poseFromSceneRef = useRef(false);

  const hydrateLoadedMannequinState = useCallback(
    (loaded: StudioMannequinPersistentState, userEdit = false) => {
      const rig = canonicalizeStudioMannequinRigState(loaded.rig);
      const nextProjection: StudioMannequinProjection = rig?.projection === "orthographic" ? "orthographic" : "perspective";
      const nextQuadView = rig?.quadView === true;
      const nextFov = rig?.cameraFovDeg ?? STUDIO_MANNEQUIN_FOV_DEFAULT_DEG;
      const nextHandContacts = rig?.handContacts ?? {};
      const nextContrapposto = rig?.contrapposto ?? null;
      const nextMeta: StudioMannequinPoseSemanticMeta = {
        ...(nextHandContacts.left || nextHandContacts.right ? { handContacts: nextHandContacts } : {}),
        ...(nextContrapposto ? { contrapposto: nextContrapposto } : {}),
      };
      const nextPose = userEdit && hasActiveStudioMannequinSemanticContacts(nextMeta)
        ? retargetStudioMannequinSemanticPose(
            buildStudioMannequinSpec(applyStudioMannequinBreathingParams(loaded.params, breathPhaseRef.current), { fingerPose: fingerPoseRef.current }),
            loaded.pose,
            nextMeta,
            {},
          )
        : loaded.pose;

      projectionRef.current = nextProjection;
      quadViewRef.current = nextQuadView;
      cameraFovDegRef.current = nextFov;
      activeHandContactsRef.current = nextHandContacts;
      activeContrappostoRef.current = nextContrapposto;
      morphBaseParamsRef.current = loaded.params;
      poseRef.current = nextPose;
      duoPartnerRef.current = loaded.partner ?? null;
      if (userEdit) stateRevisionRef.current += 1;
      stateRef.current = composeStudioMannequinDuoState({ params: loaded.params, pose: nextPose, rig }, loaded.partner ?? null);
      setProjection(nextProjection);
      setQuadView(nextQuadView);
      setCameraFovDeg(nextFov);
      setActiveHandContacts(nextHandContacts);
      setActiveContrapposto(nextContrapposto);
      setParams(loaded.params);
      setPose(nextPose);
      sceneRef.current?.setProjection(nextProjection);
      sceneRef.current?.setQuadView?.(nextQuadView);
      sceneRef.current?.setCameraFovDeg?.(nextFov);
      restoreDuoPartner(loaded.partner ?? null, { userEdit });
    },
    [restoreDuoPartner],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      if (hydrationSafeForFinalFlushRef.current) {
        void stateRepository.save(stateRef.current).catch((cause: unknown) => {
          console.warn("Studio mannequin final SQLite flush failed:", cause);
        });
      }
      mountedRef.current = false;
      hydrationGenerationRef.current += 1;
      persistenceGenerationRef.current += 1;
    };
  }, [stateRepository]);

  const persistState = useCallback(async (): Promise<boolean> => {
    if (!hydrationSafeForFinalFlushRef.current) {
      setError(persistenceStatus === "memory-only" ? frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteUnknownSave", "기존 SQLite 상태를 확인하지 못해 저장하거나 닫을 수 없습니다. JSON으로 내보낸 뒤 다시 열어 주세요.") : frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteLoadingRetry", "기존 SQLite 상태를 불러오는 중입니다. 완료된 뒤 다시 시도해 주세요."));
      return false;
    }
    const generation = persistenceGenerationRef.current + 1;
    persistenceGenerationRef.current = generation;
    setPersistenceStatus("saving");
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const revision = stateRevisionRef.current;
        await stateRepository.save(stateRef.current);
        if (!mountedRef.current || persistenceGenerationRef.current !== generation) return false;
        if (stateRevisionRef.current === revision) {
          setPersistenceStatus("ready");
          setError(null);
          return true;
        }
      }
      throw new Error(frozenStatus2Text("studio.frozenStatus2.mannequin.snapshotUnstable", "저장 중 포즈가 계속 변경되어 안정된 스냅샷을 만들지 못했습니다."));
    } catch (cause) {
      if (mountedRef.current && persistenceGenerationRef.current === generation) {
        setPersistenceStatus("memory-only");
        const detail = getErrorText(cause, frozenStatus2Text("studio.frozenStatus2.mannequin.storageError", "저장소 오류"));
        setError(frozenStatus2Text("studio.frozenStatus2.mannequin.saveFailed", { detail }, "SQLite/OPFS에 데생 인형 상태를 저장하지 못했습니다. 현재 탭 메모리 임시 · 새로고침 시 사라짐. JSON 내보내기로 보존한 뒤 다시 닫아 주세요: {detail}"));
      }
      return false;
    }
  }, [persistenceStatus, stateRepository]);

  const closeWithPersist = useCallback(() => {
    if (!hydrationSafeForFinalFlushRef.current) {
      setError(persistenceStatus === "memory-only" ? frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteUnknownCloseSave", "기존 SQLite 상태를 확인하지 못해 닫기 저장을 수행할 수 없습니다. JSON으로 내보낸 뒤 다시 열어 주세요.") : frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteLoadingRetryClose", "기존 SQLite 상태를 불러오는 중입니다. 완료된 뒤 다시 닫아 주세요."));
      return;
    }
    releaseWebcamResources();
    setWebcamActive(false);
    setWebcamLoadingStage(null);
    void persistState().then((saved) => {
      if (saved && mountedRef.current) onClose();
    });
  }, [onClose, persistState, persistenceStatus, releaseWebcamResources]);

  const closeWithoutPersist = useCallback(async () => {
    if (!(await confirmStudioDestructiveAction(studioDiscardUnpersistedMannequinStateRequest())) || !mountedRef.current) return;
    releaseWebcamResources();
    setWebcamActive(false);
    setWebcamLoadingStage(null);
    onClose();
  }, [onClose, releaseWebcamResources]);

  useEffect(() => {
    if (!open) return;
    const generation = hydrationGenerationRef.current + 1;
    hydrationGenerationRef.current = generation;
    hydrationSafeForFinalFlushRef.current = false;
    const startingRevision = stateRevisionRef.current;
    let active = true;
    setPersistenceStatus("loading");
    setError(null);
    void stateRepository.load().then((stored) => {
      if (!active || !mountedRef.current || hydrationGenerationRef.current !== generation) return;
      if (stateRevisionRef.current !== startingRevision) {
        hydrationSafeForFinalFlushRef.current = true;
        setPersistenceStatus("ready");
        return;
      }
      if (stored) {
        hydrateLoadedMannequinState(stored, false);
      } else if (typeof window !== "undefined" && window.location.hash.includes("mannequin=")) {
        const hashResult = parseStudioMannequinShareHashWithDiagnostics(window.location.hash, { fallbackParams: stateRef.current.params });
        if (hashResult) {
          if (hashResult.ok) {
            hydrateLoadedMannequinState(hashResult.state, true);
            if (hashResult.warnings.length > 0) setCaptureNotice(hashResult.warnings.join(" "));
          } else {
            setError(hashResult.messageKo);
          }
        }
      }
      hydrationSafeForFinalFlushRef.current = true;
      setPersistenceStatus("ready");
    }).catch((cause: unknown) => {
      if (!active || !mountedRef.current || hydrationGenerationRef.current !== generation) return;
      setPersistenceStatus("memory-only");
      const detail = getErrorText(cause, frozenStatus2Text("studio.frozenStatus2.mannequin.storageError", "저장소 오류"));
      setError(frozenStatus2Text("studio.frozenStatus2.mannequin.loadFailed", { detail }, "SQLite/OPFS에서 데생 인형 상태를 불러오지 못해 기본값을 현재 탭 메모리에만 유지합니다. 현재 탭 메모리 임시 · 새로고침 시 사라짐: {detail}"));
    });
    return () => {
      active = false;
      if (hydrationGenerationRef.current === generation) hydrationGenerationRef.current += 1;
    };
  }, [hydrateLoadedMannequinState, open, stateRepository]);

  useEffect(() => {
    if (!open) return;
    const container = viewportRef.current;
    if (!container) return;

    let handle: StudioMannequinSceneHandle;
    try {
      handle = createStudioMannequinScene({
        container,
        initialSpec: buildStudioMannequinSpec(stateRef.current.params),
        initialPose: stateRef.current.pose,
        initialLightingRig: lightingRigRef.current,
        onSelectJoint: (jointId) => setSelectedJointId(jointId),
        onPoseEdited: (editedPose) => {
          notePoseEdited();
          const prevPose = poseRef.current;
          const locked = applyStudioMannequinJointLocks(prevPose, editedPose, jointLocksRef.current);
          const grounded = groundFootPose(locked, stateRef.current.params);
          if (!studioMannequinPosesNearlyEqual(grounded.pose, prevPose)) {
            recordPoseHistoryOncePerGesture();
            applySemanticMeta(reconcileStudioMannequinSemanticContactsAfterManualEdit(prevPose, grounded.pose, readCurrentSemanticMeta()));
          }
          poseFromSceneRef.current = !grounded.applied;
          commitPose(grounded.pose);
        },
      });
      sceneRef.current = handle;
      if (projectionRef.current !== "perspective") handle.setProjection(projectionRef.current);
      attachDuoScene(handle);
      setSceneError(null);
    } catch (cause) {
      setSceneError(getErrorText(cause, frozenStatus2Text("studio.frozenStatus2.mannequin.sceneInitFailed", "3D 데생 인형 씬을 초기화하지 못했습니다. WebGL 지원을 확인하세요.")));
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      handle.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      sceneRef.current = null;
      handle.dispose();
    };
  }, [applySemanticMeta, attachDuoScene, commitPose, groundFootPose, notePoseEdited, open, readCurrentSemanticMeta, recordPoseHistoryOncePerGesture]);

  useEffect(() => {
    sceneRef.current?.setBodySpec(spec);
  }, [spec]);

  useEffect(() => {
    sceneRef.current?.setEcorcheState?.({
      surfaceMode,
      pectoralVolume,
      muscleDefinition,
      fingerPose,
      leftSplayDeg,
      rightSplayDeg,
    });
  }, [surfaceMode, pectoralVolume, muscleDefinition, fingerPose, leftSplayDeg, rightSplayDeg]);

  useEffect(() => {
    sceneRef.current?.setJointLocks?.(jointLocks);
  }, [jointLocks]);

  useEffect(() => {
    sceneRef.current?.setScapulohumeralRhythm?.(scapulohumeralRhythm);
  }, [scapulohumeralRhythm]);

  useEffect(() => {
    sceneRef.current?.setGuideVisibility?.(guideVisibility);
  }, [guideVisibility]);

  useEffect(() => {
    sceneRef.current?.setQuadView?.(quadView);
  }, [quadView]);

  useEffect(() => {
    sceneRef.current?.setCameraFovDeg?.(cameraFovDeg);
  }, [cameraFovDeg]);

  useEffect(() => {
    if (poseFromSceneRef.current) {
      poseFromSceneRef.current = false;
      return;
    }
    sceneRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || capturing || persistenceStatus !== "ready") return;
      event.preventDefault();
      closeWithPersist();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, capturing, closeWithPersist, persistenceStatus]);

  const applyPosePreset = useCallback((presetId: string) => {
    const preset = STUDIO_MANNEQUIN_POSE_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setLastPosePresetId(presetId);
    if (isStudioMannequinDuoPreset(preset)) {
      const leadPose = resolveStudioMannequinLibraryPresetPose(preset, params, poseRef.current);
      commitPoseWithHistory(placeDuo({ presetId: preset.id, leadPose, leadParams: params }).leadPose, {});
      return;
    }
    if (applyPoseToPartner((partner) => resolveStudioMannequinLibraryPresetPose(preset, partner.params, partner.pose))) return;
    const nextMeta: StudioMannequinPoseSemanticMeta =
      studioMannequinPosePresetScope(preset) === "hand-only" && activeContrappostoRef.current
        ? { contrapposto: activeContrappostoRef.current }
        : {};
    commitPoseWithHistory(resolveStudioMannequinLibraryPresetPose(preset, params, poseRef.current), nextMeta);
  }, [applyPoseToPartner, commitPoseWithHistory, params, placeDuo]);

  const applyWebtoonPosePreset = useCallback((presetId: string) => {
    const preset = getWebtoonPosePresetById(presetId);
    if (!preset) return;
    setLastPosePresetId(presetId);
    if (isStudioMannequinDuoPreset(preset)) {
      const leadPose = resolveStudioMannequinWebtoonPresetPose(preset, params);
      commitPoseWithHistory(placeDuo({ presetId: preset.id, leadPose, leadParams: params }).leadPose, {});
      return;
    }
    if (applyPoseToPartner((partner) => resolveStudioMannequinWebtoonPresetPose(preset, partner.params))) return;
    commitPoseWithHistory(resolveStudioMannequinWebtoonPresetPose(preset, params), {});
  }, [applyPoseToPartner, commitPoseWithHistory, params, placeDuo]);

  const starterPresetAppliedRef = useRef(false);
  useEffect(() => {
    if (!open || starterPresetAppliedRef.current) return;
    const starterId = initialPosePresetId?.trim();
    if (!starterId) return;
    starterPresetAppliedRef.current = true;
    if (STUDIO_MANNEQUIN_POSE_PRESETS.some((entry) => entry.id === starterId)) {
      applyPosePreset(starterId);
    } else {
      applyWebtoonPosePreset(starterId);
    }
  }, [open, initialPosePresetId, applyPosePreset, applyWebtoonPosePreset]);

  const handleRotateSelected = useCallback(
    (rotation: StudioMannequinVec3) => {
      if (!selectedJointId || jointLocksRef.current[selectedJointId]) return;
      const prevPose = poseRef.current;
      recordPoseHistoryOncePerGesture();
      const clamped = clampStudioMannequinJointRotation(selectedJointId, rotation);
      let next = normalizeStudioMannequinPose({
        joints: { ...prevPose.joints, [selectedJointId]: clamped },
        pelvisOffset: prevPose.pelvisOffset,
      });
      if (rhythmRef.current && (selectedJointId === "leftUpperArm" || selectedJointId === "rightUpperArm")) {
        next = applyStudioMannequinScapulohumeralRhythm(next, jointLocksRef.current, 1);
      }
      applySemanticMeta(reconcileStudioMannequinSemanticContactsAfterManualEdit(prevPose, next, readCurrentSemanticMeta()));
      commitPose(next);
    },
    [applySemanticMeta, commitPose, readCurrentSemanticMeta, recordPoseHistoryOncePerGesture, selectedJointId],
  );

  const handleApplyHandPad = useCallback(
    (side: "left" | "right" | "both", output: StudioMannequinHandPadOutput) => {
      setFingerPose((prev) => mergeHandPadIntoFingerPose(prev, side, output));
      if (side === "left" || side === "both") setLeftSplayDeg(output.splayDeg);
      if (side === "right" || side === "both") setRightSplayDeg(output.splayDeg);
    },
    [],
  );

  const handleBreathPhaseChange = useCallback((nextBreath: number) => {
    breathPhaseRef.current = nextBreath;
    setBreathPhase(nextBreath);
    const currentMeta = readCurrentSemanticMeta();
    if (hasActiveStudioMannequinSemanticContacts(currentMeta)) {
      const nextSpec = buildStudioMannequinSpec(applyStudioMannequinBreathingParams(stateRef.current.params, nextBreath), { fingerPose: fingerPoseRef.current });
      commitPose(retargetStudioMannequinSemanticPose(nextSpec, poseRef.current, currentMeta, jointLocksRef.current));
    }
  }, [commitPose, readCurrentSemanticMeta]);

  const handleAutoBalance = useCallback(() => {
    const stabilized = stabilizeStudioMannequinCenterOfMass(spec, poseRef.current);
    commitPoseWithHistory(stabilized, readCurrentSemanticMeta());
  }, [commitPoseWithHistory, readCurrentSemanticMeta, spec]);

  const handleApplyContrapposto = useCallback((weightSide: "left" | "right") => {
    recordPoseHistory();
    rotateGestureRecordedRef.current = true;
    const res = resolveContrappostoToggleTransition({
      spec,
      currentPose: poseRef.current,
      currentMeta: readCurrentSemanticMeta(),
      weightSide,
      locks: jointLocksRef.current,
      groundFallback: (p) => groundFootPose(p, stateRef.current.params).pose,
    });
    applySemanticMeta(res.meta);
    commitPose(res.pose);
  }, [applySemanticMeta, commitPose, groundFootPose, readCurrentSemanticMeta, recordPoseHistory, spec]);

  const handleApplyHandContact = useCallback((side: "left" | "right", targetId: StudioMannequinHandContactTargetId) => {
    recordPoseHistory();
    rotateGestureRecordedRef.current = true;
    const res = resolveHandContactToggleTransition({
      spec,
      currentPose: poseRef.current,
      currentMeta: readCurrentSemanticMeta(),
      side,
      targetId,
      locks: jointLocksRef.current,
      groundFallback: (p) => groundFootPose(p, stateRef.current.params).pose,
    });
    applySemanticMeta(res.meta);
    commitPose(res.pose);
  }, [applySemanticMeta, commitPose, groundFootPose, readCurrentSemanticMeta, recordPoseHistory, spec]);

  const handleClearSemanticContacts = useCallback(() => {
    if (!hasActiveStudioMannequinSemanticContacts(readCurrentSemanticMeta())) return;
    recordPoseHistory();
    stateRevisionRef.current += 1;
    applySemanticMeta({});
  }, [applySemanticMeta, readCurrentSemanticMeta, recordPoseHistory]);

  const handleMirrorPose = useCallback(() => {
    recordPoseHistory();
    rotateGestureRecordedRef.current = true;
    const mirroredBase = resolveStudioMannequinRenderFrame({ params, pose: poseRef.current, mirror: true, ground: true }).pose;
    const mirroredLocked = applyStudioMannequinJointLocks(poseRef.current, mirroredBase, jointLocksRef.current);
    const mirroredMeta = mirrorStudioMannequinSemanticContacts(readCurrentSemanticMeta());
    applySemanticMeta(mirroredMeta);
    const nextPose = hasActiveStudioMannequinSemanticContacts(mirroredMeta)
      ? retargetStudioMannequinSemanticPose(spec, mirroredLocked, mirroredMeta, jointLocksRef.current)
      : groundFootPose(mirroredLocked, stateRef.current.params).pose;
    commitPose(nextPose);
  }, [applySemanticMeta, commitPose, groundFootPose, params, readCurrentSemanticMeta, recordPoseHistory, spec]);

  const handleLookAtCamera = useCallback(() => {
    const target = sceneRef.current?.getCameraWorldPosition?.() ?? [0, spec.heightM * 0.88, 3.1];
    const currentMeta = readCurrentSemanticMeta();
    let next = applyStudioMannequinGazeTarget(spec, poseRef.current, target, jointLocksRef.current, 1);
    if (currentMeta.handContacts?.left || currentMeta.handContacts?.right) {
      next = retargetStudioMannequinSemanticPose(spec, next, { handContacts: currentMeta.handContacts }, jointLocksRef.current);
    }
    commitPoseWithHistory(next, currentMeta);
  }, [commitPoseWithHistory, readCurrentSemanticMeta, spec]);

  const handleRotateDirection = useCallback(
    (event: StudioMannequinRotationCommand) => {
      if (!selectedJointId || jointLocksRef.current[selectedJointId]) return;
      const stepRad = ((event.shiftKey ? 0.5 : 2) * Math.PI) / 180;
      const prevPose = poseRef.current;
      const cur = prevPose.joints[selectedJointId] ?? [0, 0, 0];
      let nextRot: [number, number, number] | null = null;
      if (event.key === "ArrowUp") nextRot = [cur[0] - stepRad, cur[1], cur[2]];
      else if (event.key === "ArrowDown") nextRot = [cur[0] + stepRad, cur[1], cur[2]];
      else if (event.key === "ArrowLeft") nextRot = event.altKey ? [cur[0], cur[1] - stepRad, cur[2]] : [cur[0], cur[1], cur[2] + stepRad];
      else if (event.key === "ArrowRight") nextRot = event.altKey ? [cur[0], cur[1] + stepRad, cur[2]] : [cur[0], cur[1], cur[2] - stepRad];
      if (!nextRot) return;
      if (!event.repeat) resetPoseHistoryGesture();
      recordPoseHistoryOncePerGesture();
      const clamped = clampStudioMannequinJointRotation(selectedJointId, nextRot);
      let next = normalizeStudioMannequinPose({
        joints: { ...prevPose.joints, [selectedJointId]: clamped },
        pelvisOffset: prevPose.pelvisOffset,
      });
      if (rhythmRef.current && (selectedJointId === "leftUpperArm" || selectedJointId === "rightUpperArm")) {
        next = applyStudioMannequinScapulohumeralRhythm(next, jointLocksRef.current, 1);
      }
      const grounded = groundFootPose(next, stateRef.current.params).pose;
      applySemanticMeta(reconcileStudioMannequinSemanticContactsAfterManualEdit(prevPose, grounded, readCurrentSemanticMeta()));
      commitPose(grounded);
    },
    [applySemanticMeta, commitPose, groundFootPose, readCurrentSemanticMeta, recordPoseHistoryOncePerGesture, resetPoseHistoryGesture, selectedJointId],
  );

  const handleProjectionChange = useCallback((next: StudioMannequinProjection) => {
    projectionRef.current = next;
    stateRevisionRef.current += 1;
    syncStateSnapshot(stateRef.current.params, poseRef.current);
    setProjection(next);
    sceneRef.current?.setProjection(next);
  }, [syncStateSnapshot]);

  const handleToggleQuadView = useCallback(() => {
    const next = !quadViewRef.current;
    quadViewRef.current = next;
    stateRevisionRef.current += 1;
    syncStateSnapshot(stateRef.current.params, poseRef.current);
    setQuadView(next);
    sceneRef.current?.setQuadView?.(next);
  }, [syncStateSnapshot]);

  const handleCameraFovChange = useCallback((nextFov: number) => {
    const clamped = clampStudioMannequinFovDeg(nextFov);
    cameraFovDegRef.current = clamped;
    stateRevisionRef.current += 1;
    syncStateSnapshot(stateRef.current.params, poseRef.current);
    setCameraFovDeg(clamped);
    sceneRef.current?.setCameraFovDeg?.(clamped);
  }, [syncStateSnapshot]);

  const handleExportJson = useCallback(() => {
    const json = exportStudioMannequinStateToJSON(stateRef.current);
    downloadTextBlob(json, `toonstudio-mannequin-${Date.now()}.mannequin`, "application/json");
  }, []);

  const handleImportJson = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = importStudioMannequinStateWithDiagnostics(e.target?.result, { fallbackParams: stateRef.current.params });
      if (!result.ok) {
        setError(result.messageKo);
        return;
      }
      recordPoseHistory();
      rotateGestureRecordedRef.current = true;
      hydrateLoadedMannequinState(result.state, true);
      setError(null);
      if (result.warnings.length > 0) setCaptureNotice(result.warnings.join(" "));
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [hydrateLoadedMannequinState, recordPoseHistory]);

  const handleImportCspPep = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xml = typeof e.target?.result === "string" ? e.target.result : "";
        const imported = importCspPepPoseToMannequin(xml);
        setFingerPose(imported.fingerPose);
        commitPoseWithHistory(imported.pose, {});
        setCaptureNotice(`클립스튜디오 포즈 적용됨 (${imported.aliasName} · ${imported.mappedBoneCount}본)`);
        setError(null);
      } catch (cause) {
        setError(getErrorText(cause, "유효하지 않은 클립스튜디오 .pep 포즈 XML입니다."));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [commitPoseWithHistory]);

  const handleExportCspPep = useCallback(() => {
    const xml = exportMannequinPoseToCspPep(poseRef.current, "ToonStudio_Ecorche_v3", fingerPose);
    downloadTextBlob(xml, `toonstudio-pose-${Date.now()}.pep`, "application/xml");
  }, [fingerPose]);

  const handleImportCsp3dp = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xml = typeof e.target?.result === "string" ? e.target.result : "";
        const nextParams = importCsp3dpToMannequinParams(xml, stateRef.current.params);
        morphBaseParamsRef.current = nextParams;
        commitParams(nextParams);
        setCaptureNotice("클립스튜디오 .3dp 체형 비율이 적용되었습니다.");
        setError(null);
      } catch (cause) {
        setError(getErrorText(cause, "유효하지 않은 클립스튜디오 .3dp 체형 XML입니다."));
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [commitParams]);

  const handleExportCsp3dp = useCallback(() => {
    const xml = exportMannequinParamsToCsp3dp(stateRef.current.params);
    downloadTextBlob(xml, `toonstudio-body-${Date.now()}.3dp`, "application/xml");
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const hash = encodeStudioMannequinShareHash(stateRef.current);
    const fullUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    void copyStudioText(fullUrl).then((ok) => {
      if (!ok) return;
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }, []);

  const handleApplyPhotoPose = useCallback((payload: StudioVrmPhotoPoseApplyPayload): boolean => {
    if (payload.confidence.quality === "low" || payload.confidence.overall < 0.5 || payload.confidence.coverage < 0.6) {
      setError("사진 포즈 신뢰도가 낮아 적용하지 않았습니다. 사람이 더 크게 보이는 전신 사진을 선택해 주세요.");
      return false;
    }
    const plan = createStudioMannequinPhotoPoseApplyPlan({
      currentPose: poseRef.current,
      mediaPipeLandmarks: payload.worldLandmarks,
      handDetections: payload.handDetections ?? [],
      mirrorMode: false,
      minimumVisibility: 0.35,
    });
    if (plan.appliedJoints.length < STUDIO_MANNEQUIN_PHOTO_MIN_APPLIED_JOINTS) {
      setError("사진에서 안전하게 적용할 수 있는 관절이 부족해 기존 포즈를 유지했습니다. 팔·다리가 선명한 전신 사진을 다시 선택해 주세요.");
      return false;
    }
    photoPoseAppliedPoseRef.current = commitPoseWithHistory(plan.pose, {});
    setPhotoPoseApplyStatus({
      sourceName: payload.sourceName,
      confidencePercent: Math.round(payload.confidence.overall * 100),
      appliedJointCount: plan.appliedJoints.length,
    });
    setError(null);
    return true;
  }, [commitPoseWithHistory]);

  const handleShaperSelectionChange = useCallback((sel: ShaperPresetSelection) => {
    let nextParams = { ...params };
    if (sel.body === "body-chibi") {
      nextParams = { ...nextParams, headCount: 3.5, heightCm: 120, shoulderWidth: 0.8, pelvisWidth: 0.8 };
    } else if (sel.body === "body-tall") {
      nextParams = { ...nextParams, headCount: 8.5, heightCm: 188, shoulderWidth: 1.15, legLength: 1.15 };
    } else if (sel.body === "body-muscular") {
      nextParams = { ...nextParams, headCount: 7.8, heightCm: 184, shoulderWidth: 1.25, build: 2.5 };
    } else if (sel.body === "body-slim-female") {
      nextParams = { ...nextParams, headCount: 7.2, heightCm: 162, shoulderWidth: 0.92, pelvisWidth: 1.05, build: 0.8 };
    } else if (sel.body === "body-slim-male") {
      nextParams = { ...nextParams, headCount: 7.6, heightCm: 176, shoulderWidth: 1.08, pelvisWidth: 0.95, build: 0.9 };
    }
    if (sel.face === "face-sharp") nextParams = { ...nextParams, ...STUDIO_MANNEQUIN_HEAD_PRESETS.sharp.params };
    else if (sel.face === "face-round") nextParams = { ...nextParams, ...STUDIO_MANNEQUIN_HEAD_PRESETS.round.params };
    else if (sel.face === "face-square") nextParams = { ...nextParams, faceWidth: 1.15, chinLength: 1.05, eyeScale: 1.0, noseHeight: 1.1 };
    else if (sel.face === "face-chibi") nextParams = { ...nextParams, ...STUDIO_MANNEQUIN_HEAD_PRESETS.chibi.params };
    else if (sel.face === "face-oval") nextParams = { ...nextParams, ...STUDIO_MANNEQUIN_HEAD_PRESETS.anime.params };
    if (sel.eye === "eye-romance") nextParams = { ...nextParams, eyeScale: 1.16 };
    else if (sel.eye === "eye-gentle") nextParams = { ...nextParams, eyeScale: 1.08 };
    else if (sel.eye === "eye-action") nextParams = { ...nextParams, eyeScale: 0.96 };
    else if (sel.eye === "eye-cat") nextParams = { ...nextParams, eyeScale: 1.04 };
    if (sel.nose === "nose-dot") nextParams = { ...nextParams, noseHeight: 0.84 };
    else if (sel.nose === "nose-straight") nextParams = { ...nextParams, noseHeight: 1.04 };
    else if (sel.nose === "nose-bridge") nextParams = { ...nextParams, noseHeight: 1.14 };
    commitParams(nextParams);

    if (sel.bodypose === "pose-stand") commitPoseWithHistory(createStudioMannequinRestPose(), {});
    else if (sel.bodypose === "pose-run") applyPosePreset("dash");
    else if (sel.bodypose === "pose-sit") applyPosePreset("sit-chair");
    else if (sel.bodypose === "pose-hip") applyPosePreset("cross-arms");
    else if (sel.bodypose === "pose-sword") applyPosePreset("sword-ready");
    if (sel.handpose) applyPosePreset(sel.handpose);
  }, [applyPosePreset, commitParams, commitPoseWithHistory, params]);

  const handleShaperBodyParamsChange = useCallback((partial: Partial<StudioMannequinBodyParams>) => {
    commitParams(clampStudioMannequinBodyParams({ ...stateRef.current.params, ...partial }));
  }, [commitParams]);

  const handleExportPsdFromScene = useCallback(async () => {
    const handle = sceneRef.current;
    if (!handle) return;
    try {
      setCapturing(true);
      const result = await handle.captureDataUrl(2);
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = result.pngDataUrl;
      });
      const offCanvas = document.createElement("canvas");
      offCanvas.width = result.width;
      offCanvas.height = result.height;
      const ctx = offCanvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const beauty = new Uint8ClampedArray(ctx.getImageData(0, 0, result.width, result.height).data);
      const flatColor = new Uint8ClampedArray(beauty.length);
      const shadowCel = new Uint8ClampedArray(beauty.length);
      const highlights = new Uint8ClampedArray(beauty.length);
      const lineArt = new Uint8ClampedArray(beauty.length);
      const w = result.width;
      const h = result.height;
      const luminanceAt = (i: number) => beauty[i] * 0.2126 + beauty[i + 1] * 0.7152 + beauty[i + 2] * 0.0722;

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;
          const alpha = beauty[idx + 3];
          if (alpha <= 4) continue;
          const normalize = Math.min(1.45, Math.max(0.72, 190 / Math.max(beauty[idx], beauty[idx + 1], beauty[idx + 2], 1)));
          flatColor[idx] = Math.min(255, Math.round(beauty[idx] * normalize));
          flatColor[idx + 1] = Math.min(255, Math.round(beauty[idx + 1] * normalize));
          flatColor[idx + 2] = Math.min(255, Math.round(beauty[idx + 2] * normalize));
          flatColor[idx + 3] = alpha;
          const lum = luminanceAt(idx);
          shadowCel[idx] = 48;
          shadowCel[idx + 1] = 36;
          shadowCel[idx + 2] = 52;
          shadowCel[idx + 3] = Math.round(alpha * Math.min(1, Math.max(0, (172 - lum) / 105)) * 0.76);
          highlights[idx] = 255;
          highlights[idx + 1] = 241;
          highlights[idx + 2] = 219;
          highlights[idx + 3] = Math.round(alpha * Math.min(1, Math.max(0, (lum - 188) / 67)) * 0.58);
        }
      }
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          const idx = (y * w + x) * 4;
          const alpha = beauty[idx + 3];
          if (alpha <= 20) continue;
          const left = idx - 4;
          const right = idx + 4;
          const up = idx - w * 4;
          const down = idx + w * 4;
          const boundary = Math.max(Math.abs(alpha - beauty[left + 3]), Math.abs(alpha - beauty[right + 3]), Math.abs(alpha - beauty[up + 3]), Math.abs(alpha - beauty[down + 3]));
          const formEdge = Math.abs(luminanceAt(left) - luminanceAt(right)) + Math.abs(luminanceAt(up) - luminanceAt(down));
          const lineAlpha = Math.min(255, Math.round(boundary * 1.4 + Math.max(0, formEdge - 46) * 2.1));
          if (lineAlpha <= 18) continue;
          lineArt[idx] = 24;
          lineArt[idx + 1] = 20;
          lineArt[idx + 2] = 28;
          lineArt[idx + 3] = lineAlpha;
        }
      }
      const psdBlob = buildShaperLayeredPsd({ width: w, height: h, flatColor, shadowCel, highlights, lineArt });
      const url = URL.createObjectURL(psdBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shaper-webtoon-${Date.now()}.psd`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(getErrorText(cause, frozenStatus2Text("studio.frozenStatus2.mannequin.psdFailed", "PSD 내보내기를 실패했습니다.")));
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleCapture = useCallback(() => {
    const handle = sceneRef.current;
    if (!handle || capturing) return;
    if (!hydrationSafeForFinalFlushRef.current) {
      setError(persistenceStatus === "memory-only" ? frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteUnknownCapture", "기존 SQLite 상태를 확인하지 못해 캡처를 삽입할 수 없습니다. JSON으로 내보낸 뒤 다시 열어 주세요.") : frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteLoadingRetryCapture", "기존 SQLite 상태를 불러오는 중입니다. 완료된 뒤 다시 캡처해 주세요."));
      return;
    }
    setCapturing(true);
    setError(null);
    void (async () => {
      try {
        const result = await handle.captureDataUrl(captureScale);
        const accepted = await onInsert(result);
        if (accepted === false) {
          throw new Error(frozenStatus2Text("studio.frozenStatus2.mannequin.docChanged", "편집 중 문서가 바뀌어 캡처를 삽입하지 않았습니다. 현재 페이지에서 다시 시도해 주세요."));
        }
        if (!(await persistState())) return;
        if (captureTarget === "download") setCaptureNotice(`PNG로 저장했습니다 (${result.width}×${result.height})`);
        else onClose();
      } catch (cause) {
        setError(getErrorText(cause, frozenStatus2Text("studio.frozenStatus2.mannequin.captureFailed", "3D 데생 인형 캡처를 추가하지 못했습니다.")));
      } finally {
        setCapturing(false);
      }
    })();
  }, [captureScale, captureTarget, capturing, onClose, onInsert, persistState, persistenceStatus]);

  useEffect(() => {
    if (!captureNotice) return;
    const timer = window.setTimeout(() => setCaptureNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [captureNotice]);

  if (!open) return null;

  const selectedRotation: StudioMannequinVec3 = selectedJointId ? pose.joints[selectedJointId] ?? [0, 0, 0] : [0, 0, 0];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      data-studio-mannequin-dialog="true"
      data-studio-3d-reference="tooncraft"
      className="fixed inset-0 z-[80] isolate flex flex-col overflow-hidden overscroll-none bg-canvas/85 p-2 text-fg backdrop-blur-sm sm:p-4"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <input ref={fileInputRef} type="file" accept=".mannequin,.json" className="hidden" onChange={handleImportJson} />
      <input ref={cspPepInputRef} type="file" accept=".pep,.xml" className="hidden" onChange={handleImportCspPep} />
      <input ref={csp3dpInputRef} type="file" accept=".3dp,.xml" className="hidden" onChange={handleImportCsp3dp} />

      <div data-studio-mannequin-surface="true" className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header data-studio-mannequin-header="true" className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id={dialogTitleId} className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-tight">
              <PersonStanding size={16} className="text-accent" aria-hidden />
              3D 데생 인형
            </h2>
            <span
              aria-live="polite"
              className={cn(
                "sr-only text-[0.66rem] sm:not-sr-only sm:inline",
                persistenceStatus === "memory-only" ? "text-warn" : "text-fg-3",
              )}
            >
              {captureNotice ?? (persistenceStatus === "loading"
                ? frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteLoading", "SQLite 불러오는 중")
                : persistenceStatus === "saving"
                  ? frozenStatus2Text("studio.frozenStatus2.mannequin.sqliteSaving", "SQLite 저장 중")
                  : persistenceStatus === "memory-only"
                    ? frozenStatus2Text("studio.frozenStatus2.mannequin.memoryOnlyTab", "현재 탭 메모리 임시")
                    : "")}
            </span>
            <StudioMannequinPoserHeaderActions
              onExportJson={handleExportJson}
              onImportJson={() => fileInputRef.current?.click()}
              onCopyShareLink={handleCopyShareLink}
              copiedLink={copiedLink}
              onOpenPhotoPose={() => setTab("pose")}
            />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <ModalStatusSlot className="flex min-w-0 justify-end" />
            <button
              type="button"
              onClick={persistenceStatus === "memory-only" ? closeWithoutPersist : closeWithPersist}
              disabled={persistenceStatus === "idle" || persistenceStatus === "loading" || persistenceStatus === "saving"}
              title={
                persistenceStatus === "loading" || persistenceStatus === "idle"
                  ? "SQLite 상태를 불러온 뒤 닫을 수 있습니다."
                  : persistenceStatus === "memory-only"
                    ? "현재 탭의 변경을 저장하지 않고 닫습니다. 먼저 JSON으로 내보내세요."
                    : undefined
              }
              className={buttonClass({ size: "icon", variant: "quiet", className: "min-h-11 min-w-11 pointer-coarse:size-11" })}
              aria-label="3D 데생 인형 닫기"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div data-studio-mannequin-stage="true" className="relative min-h-0 flex-1 basis-1/2">
            {sceneError ? (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className="max-w-xs space-y-2">
                  <AlertTriangle size={22} className="mx-auto text-warn" aria-hidden />
                  <p className="text-xs leading-relaxed text-fg-2">{sceneError}</p>
                </div>
              </div>
            ) : (
              <div
                ref={viewportRef}
                className={cn("h-full w-full", STUDIO_FOCUS_RING)}
                data-studio-mannequin-viewport="true"
                aria-label="3D 데생 인형 뷰포트"
                {...viewportGestures.handlers}
              />
            )}
            {sceneError ? null : <StudioMannequinRotationControls disabled={!selectedJointId || !!jointLocks[selectedJointId]} onRotate={handleRotateDirection} />}
            {sceneError ? null : <StudioMannequinDuoFigureSwitch duo={duo} />}
            {error ? (
              <p role="alert" className="absolute inset-x-3 bottom-3 rounded-lg border border-warn/40 bg-panel/95 px-3 py-2 text-[0.72rem] leading-relaxed text-warn shadow-lg">
                {error}
              </p>
            ) : null}
          </div>

          <aside className="flex min-h-0 w-full flex-1 basis-1/2 flex-col border-t border-line/70 md:w-[320px] md:flex-none md:basis-auto md:border-l md:border-t-0">
            <nav className="grid grid-cols-3 gap-1 border-b border-line/60 p-2" aria-label="데생 인형 설정 탭">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={tab === entry.id}
                  className={cn(studioSegmentChipClass(tab === entry.id), "min-h-9 min-w-0 justify-center gap-1 whitespace-nowrap rounded-xl px-2 pointer-coarse:min-h-11")}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-line/60 px-3 py-2" aria-label="포즈 변경 히스토리">
              <button
                type="button"
                onClick={handleUndoPose}
                disabled={!poseHistoryDescription.canUndo}
                title={poseHistoryDescription.canUndo ? `이전 포즈로 되돌리기 (${poseHistoryDescription.undoCount}개)` : frozenStatus2Text("studio.frozenStatus2.mannequin.undoUnavailable", "되돌릴 변경이 없습니다")}
                aria-label={`되돌리기${poseHistoryDescription.canUndo ? ` (${poseHistoryDescription.undoCount}개 가능)` : ""}`}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11 pointer-coarse:px-3"
              >
                <Undo2 size={13} aria-hidden /> 되돌리기
              </button>
              <button
                type="button"
                onClick={handleRedoPose}
                disabled={!poseHistoryDescription.canRedo}
                title={poseHistoryDescription.canRedo ? `다시 실행하기 (${poseHistoryDescription.redoCount}개)` : frozenStatus2Text("studio.frozenStatus2.mannequin.redoUnavailable", "다시 실행할 변경이 없습니다")}
                aria-label={`다시실행${poseHistoryDescription.canRedo ? ` (${poseHistoryDescription.redoCount}개 가능)` : ""}`}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11 pointer-coarse:px-3"
              >
                <Redo2 size={13} aria-hidden /> 다시실행
              </button>
              <span className="text-[0.66rem] text-fg-3">
                되돌리기 {poseHistoryDescription.undoCount} · 다시실행 {poseHistoryDescription.redoCount}
              </span>
              <StudioMannequinFootGroundingToggle enabled={footGrounding.enabled} onToggle={footGrounding.onToggle} lastResult={footGrounding.lastResult} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === "shaper" ? (
                <StudioShaperPanel
                  supportedCategories={SHAPER_MANNEQUIN_SUPPORTED_CATEGORIES}
                  onSelectionChange={handleShaperSelectionChange}
                  onBodyParamsChange={handleShaperBodyParamsChange}
                  onExportPsd={handleExportPsdFromScene}
                  onTriggerPoseScanner={() => setTab("pose")}
                  onInsertCanvas={handleCapture}
                />
              ) : null}
              {tab === "body" ? (
                <StudioMannequinBodySection
                  params={params}
                  materialStyle={materialStyle}
                  surfaceMode={surfaceMode}
                  pectoralVolume={pectoralVolume}
                  muscleDefinition={muscleDefinition}
                  breathPhase={breathPhase}
                  onParamsChange={(next) => {
                    morphBaseParamsRef.current = next;
                    commitParams(next);
                  }}
                  onApplyPreset={(presetId) => {
                    const next = STUDIO_MANNEQUIN_BODY_PRESETS[presetId].params;
                    morphBaseParamsRef.current = next;
                    commitParams(next);
                  }}
                  onApplyArchetype={(archetypeId) => {
                    const next = resolveStudioMannequinArchetypeParams(archetypeId);
                    morphBaseParamsRef.current = next;
                    commitParams(next);
                  }}
                  onMaterialStyleChange={(style) => {
                    setMaterialStyle(style);
                    sceneRef.current?.setMaterialStyle(style);
                  }}
                  onSurfaceModeChange={(mode) => {
                    setSurfaceMode(mode);
                    sceneRef.current?.setSurfaceMode?.(mode);
                  }}
                  onPectoralVolumeChange={setPectoralVolume}
                  onMuscleDefinitionChange={setMuscleDefinition}
                  onBreathPhaseChange={handleBreathPhaseChange}
                  onImportCsp3dp={() => csp3dpInputRef.current?.click()}
                  onExportCsp3dp={handleExportCsp3dp}
                />
              ) : null}
              {tab === "pose" ? (
                <>
                  <StudioVrmPhotoPoseScanner
                    disabled={webcamActive || webcamLoading || capturing}
                    includeHandDetection
                    minimumApplyQuality="medium"
                    onApply={handleApplyPhotoPose}
                  />
                  {photoPoseApplyStatus ? (
                    <div role="status" aria-live="polite" className="mb-3 rounded-lg border border-accent/35 bg-accent-soft/60 p-2 text-[0.66rem] leading-relaxed text-fg-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate" title={photoPoseApplyStatus.sourceName}>
                          사진 포즈 적용됨 · 관절 {photoPoseApplyStatus.appliedJointCount}개 · 신뢰도 {photoPoseApplyStatus.confidencePercent}%
                        </span>
                        <span className="shrink-0 text-fg-3">위 되돌리기로 취소 가능</span>
                      </div>
                    </div>
                  ) : null}
                  <StudioMannequinPoseSection
                    selectedCategory={poseCategory}
                    onCategorySelect={setPoseCategory}
                    onApplyPreset={applyPosePreset}
                    onApplyWebtoonPreset={applyWebtoonPosePreset}
                    applyDisabled={capturing}
                    onMirror={handleMirrorPose}
                    onResetJoints={() => commitPoseWithHistory(createStudioMannequinRestPose(), {})}
                  />
                  <StudioMannequinDuoPartnerCard duo={duo} />
                </>
              ) : null}
              {tab === "magic" ? (
                <div onPointerDownCapture={resetPoseHistoryGesture} onKeyDownCapture={resetPoseHistoryGestureOnKey}>
                  <StudioMagicPoserPanel
                    scene={magicPoserScene}
                    currentPose={pose}
                    hostOwnsHistory
                    onBodyMorphChange={handleMagicBodyMorphChange}
                  />
                </div>
              ) : null}
              {tab === "joint" ? (
                <div onPointerDownCapture={resetPoseHistoryGesture} onKeyDownCapture={resetPoseHistoryGestureOnKey}>
                  <StudioMannequinJointSection
                    selectedJointId={selectedJointId}
                    rotation={selectedRotation}
                    noJointSelectedText={frozenStatus2Text("studio.frozenStatus2.mannequin.noJointSelected", "선택된 관절이 없습니다. 뷰포트의 마네킹을 클릭하면 해당 부위 관절이 선택됩니다.")}
                    jointLocks={jointLocks}
                    scapulohumeralRhythm={scapulohumeralRhythm}
                    guideVisibility={guideVisibility}
                    balanceReport={balanceReport}
                    gestureAnalysis={gestureAnalysis}
                    activeContrapposto={activeContrapposto}
                    activeHandContacts={activeHandContacts}
                    onSelectJoint={(jointId) => {
                      setSelectedJointId(jointId);
                      sceneRef.current?.selectJoint(jointId);
                    }}
                    onRotate={handleRotateSelected}
                    onResetJoint={() => handleRotateSelected([0, 0, 0])}
                    onToggleJointLock={(jointId) => setJointLocks((prev) => toggleStudioMannequinJointLock(prev, jointId))}
                    onClearAllJointLocks={() => setJointLocks({})}
                    onToggleScapulohumeralRhythm={setScapulohumeralRhythm}
                    onGuideVisibilityChange={(patch) => setGuideVisibility((prev) => ({ ...prev, ...patch }))}
                    onAutoBalance={handleAutoBalance}
                    onApplyContrapposto={handleApplyContrapposto}
                    onApplyHandContact={handleApplyHandContact}
                    onClearSemanticContacts={handleClearSemanticContacts}
                    onLookAtCamera={handleLookAtCamera}
                    onApplyHandPad={handleApplyHandPad}
                    onImportCspPep={() => cspPepInputRef.current?.click()}
                    onExportCspPep={handleExportCspPep}
                  />
                </div>
              ) : null}
              {tab === "camera" ? (
                <>
                  <StudioMannequinCameraSection
                    projection={projection}
                    onProjectionChange={handleProjectionChange}
                    quadView={quadView}
                    onToggleQuadView={handleToggleQuadView}
                    cameraFovDeg={cameraFovDeg}
                    onCameraFovChange={handleCameraFovChange}
                    captureScale={captureScale}
                    onCaptureScaleChange={setCaptureScale}
                    onCameraPreset={(preset) => {
                      setCameraPreset(preset);
                      setSelectedCameraAngle(preset);
                      sceneRef.current?.setCameraPreset(preset);
                    }}
                    selectedCameraAngle={selectedCameraAngle}
                    onResetCamera={() => {
                      setCameraPreset("home");
                      setSelectedCameraAngle(null);
                      sceneRef.current?.resetCamera();
                    }}
                    onCapture={handleCapture}
                    capturing={capturing}
                    captureDisabled={persistenceStatus !== "ready"}
                    captureLabel={captureTarget === "download" ? "PNG로 저장" : "캔버스로 캡처"}
                    webcamActive={webcamActive}
                    webcamLoadingStage={webcamLoadingStage}
                    webcamError={webcamError}
                    onToggleWebcam={handleToggleWebcam}
                    poseFrozen={poseFrozen}
                    onTogglePoseFreeze={() => setPoseFrozen((prev) => !prev)}
                    mirrorMode={mirrorMode}
                    onToggleMirrorMode={() => setMirrorMode((prev) => !prev)}
                    handTracking={handTracking}
                    onToggleHandTracking={handleToggleHandTracking}
                    handTrackingLoading={handTrackingLoading}
                    handTrackingError={handTrackingError}
                    facialTracking={facialTracking}
                    onToggleFacialTracking={() => setFacialTracking((prev) => !prev)}
                  />
                  <div className="mt-3 border-t border-line/60 pt-3">
                    <StudioCompositionGenerationBriefPanel
                      snapshot={compositionSnapshot}
                      onInsertCaptureFallback={handleCapture}
                    />
                  </div>
                </>
              ) : null}
              <video ref={webcamVideoRef} className="hidden" playsInline muted />
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
