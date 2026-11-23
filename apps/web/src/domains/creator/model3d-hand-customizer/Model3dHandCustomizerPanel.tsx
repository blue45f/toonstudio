/**
 * 15관절 3D 손 모델 · 정점 가중치/FFD 래티스/Auto-LOD · STL 임포트/3D 그룹/상호 그림자 스튜디오 패널.
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 전이 속성만 사용 · 모든 props optional · KO/EN 지원).
 */

import { Box, Hand, Layers, RotateCcw, SlidersHorizontal, SunMedium } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_HAND_CAMERA, FINGER_LABELS, FINGER_ORDER, HAND_POSE_PRESETS,
  getHandPosePreset, mirrorHandPose, solveHandSkeleton3d, updateFingerCurlRatio,
  type FingerName, type HandPose3d, type HandPosePresetId, type Handedness,
} from "./hand-rig-3d";
import {
  DEFAULT_3D_FOLDER_GROUP, DEFAULT_AUTO_LOD_SCENE_INSTANCES,
  auditAndNormalize3dMesh, computeAutoLodPlan, computeMeshBounds,
  createSampleAsciiStlWithDefects, createSampleBinaryStlBytes,
  createUpperBodyLattice, createUpperBodySleeveMesh, deformMeshByLattice,
  evaluate3dGroupAndCastShadows, lightDirectionFromAngles, parseStlMesh, smoothVertexWeights,
  type AutoLodSceneInstance, type Scene3dFolderGroup,
} from "./mesh-customizer-stl-lod";

export type Model3dHandCustomizerTab = "hand-rig" | "weight-ffd-lod" | "stl-group-shadow";
export type StlSampleMode = "binary-mm" | "ascii-defective";

export interface Model3dHandCustomizerPanelProps {
  readonly initialTab?: Model3dHandCustomizerTab;
  readonly initialPresetId?: HandPosePresetId;
  readonly initialHandedness?: Handedness;
  readonly initialStlSample?: StlSampleMode;
  readonly initialGroup?: Scene3dFolderGroup;
  readonly locale?: "ko" | "en";
  readonly onPoseChange?: (pose: HandPose3d, handedness: Handedness) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BADGE_GOOD = "inline-flex items-center rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good";
const BADGE_WARN = "inline-flex items-center rounded-full border border-warn/40 bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warn";
const BADGE_INFO = "inline-flex items-center rounded-full border border-cool/40 bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-cool";

function fingerAverageCurlPercent(pose: HandPose3d, finger: FingerName): number {
  const f = pose.fingers[finger];
  const maxSum = finger === "thumb" ? 168 : 274;
  return Math.round(Math.min(100, Math.max(0, ((f.curl1Deg + f.curl2Deg + f.curl3Deg) / maxSum) * 100)));
}

function buildCrowdInstances(crowdCount: number): readonly AutoLodSceneInstance[] {
  const base = DEFAULT_AUTO_LOD_SCENE_INSTANCES.slice(0, 3);
  const crowd: AutoLodSceneInstance[] = Array.from({ length: crowdCount }, (_, idx) => ({
    id: `crowd-dyn-${idx + 1}`,
    assetKey: "char-student-bg",
    labelKo: `원경 군중 #${idx + 1}`,
    labelEn: `Distant Crowd #${idx + 1}`,
    baseTriangles: 32_000,
    distanceMeters: 12 + idx * 1.4,
    materialCount: 2,
  }));
  return [...base, ...crowd];
}

function mapWorldToSvg(val: number, min: number, max: number, size: number, pad: number): number {
  const span = Math.max(0.4, max - min);
  return Number((pad + ((val - min) / span) * (size - pad * 2)).toFixed(1));
}

export function Model3dHandCustomizerPanel({
  initialTab = "hand-rig",
  initialPresetId = "open-relaxed",
  initialHandedness = "right",
  initialStlSample = "binary-mm",
  initialGroup = DEFAULT_3D_FOLDER_GROUP,
  locale,
  onPoseChange,
}: Model3dHandCustomizerPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? storeLang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<Model3dHandCustomizerTab>(initialTab);
  const [handedness, setHandedness] = useState<Handedness>(initialHandedness);
  const [handPose, setHandPose] = useState<HandPose3d>(() => getHandPosePreset(initialPresetId).pose);
  const [cameraYawDeg, setCameraYawDeg] = useState<number>(DEFAULT_HAND_CAMERA.azimuthDeg);

  const [smoothIterations, setSmoothIterations] = useState<number>(4);
  const [smoothLambda, setSmoothLambda] = useState<number>(0.5);
  const [shoulderScale, setShoulderScale] = useState<number>(1.22);
  const [torsoHeightScale, setTorsoHeightScale] = useState<number>(1.08);
  const [waistTaperScale, setWaistTaperScale] = useState<number>(0.92);
  const [crowdCount, setCrowdCount] = useState<number>(5);

  const [stlSampleMode, setStlSampleMode] = useState<StlSampleMode>(initialStlSample);
  const [groupShiftX, setGroupShiftX] = useState<number>(0);
  const [groupRotateZ, setGroupRotateZ] = useState<number>(0);
  const [lightAzimuthDeg, setLightAzimuthDeg] = useState<number>(12);

  const solvedHand = useMemo(
    () => solveHandSkeleton3d(handPose, handedness, { azimuthDeg: cameraYawDeg }),
    [handPose, handedness, cameraYawDeg],
  );

  const upperBodyBase = useMemo(() => createUpperBodySleeveMesh(), []);
  const smoothResult = useMemo(
    () => smoothVertexWeights(upperBodyBase.mesh, upperBodyBase.pinchedWeights, { iterations: smoothIterations, lambda: smoothLambda }),
    [upperBodyBase, smoothIterations, smoothLambda],
  );
  const ffdResult = useMemo(() => {
    const baseBounds = computeMeshBounds(upperBodyBase.mesh.vertices);
    const lattice = createUpperBodyLattice(baseBounds, {
      shoulderWidthScale: shoulderScale,
      waistTaperScale,
      torsoHeightScale,
      chestDepthScale: 1.0,
    });
    return deformMeshByLattice(upperBodyBase.mesh, lattice);
  }, [upperBodyBase.mesh, shoulderScale, waistTaperScale, torsoHeightScale]);

  const lodPlan = useMemo(() => computeAutoLodPlan(buildCrowdInstances(crowdCount)), [crowdCount]);

  const stlAudit = useMemo(() => {
    const rawMesh =
      stlSampleMode === "binary-mm"
        ? parseStlMesh(createSampleBinaryStlBytes())
        : parseStlMesh(createSampleAsciiStlWithDefects());
    return auditAndNormalize3dMesh(rawMesh);
  }, [stlSampleMode]);

  const groupEval = useMemo(() => {
    const transformedGroup: Scene3dFolderGroup = {
      ...initialGroup,
      transform: {
        translate: { x: initialGroup.transform.translate.x + groupShiftX, y: initialGroup.transform.translate.y, z: initialGroup.transform.translate.z },
        rotateDeg: { x: initialGroup.transform.rotateDeg.x, y: initialGroup.transform.rotateDeg.y, z: initialGroup.transform.rotateDeg.z + groupRotateZ },
        scale: initialGroup.transform.scale,
      },
    };
    return evaluate3dGroupAndCastShadows(transformedGroup, lightDirectionFromAngles(lightAzimuthDeg, 42));
  }, [initialGroup, groupShiftX, groupRotateZ, lightAzimuthDeg]);

  const applyPose = (nextPose: HandPose3d, nextHand: Handedness = handedness) => {
    setHandPose(nextPose);
    setHandedness(nextHand);
    onPoseChange?.(nextPose, nextHand);
  };

  const handleMirrorToggle = () => {
    const nextHand: Handedness = handedness === "right" ? "left" : "right";
    applyPose(mirrorHandPose(handPose), nextHand);
  };

  const tabs: readonly { readonly id: Model3dHandCustomizerTab; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "hand-rig", label: pick("15관절 3D 손 모델", "15-Joint 3D Hand"), icon: <Hand className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
    { id: "weight-ffd-lod", label: pick("가중치·FFD·Auto-LOD", "Weights · FFD · LOD"), icon: <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
    { id: "stl-group-shadow", label: pick("STL·3D 그룹·상호 그림자", "STL · Group · Shadows"), icon: <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
  ];

  const palmPointsAttr = solvedHand.palmPolygon2d.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const ffdOrigW = ffdResult.originalBounds.max.x - ffdResult.originalBounds.min.x;
  const ffdNextW = ffdResult.deformedBounds.max.x - ffdResult.deformedBounds.min.x;
  const ffdNextH = ffdResult.deformedBounds.max.z - ffdResult.deformedBounds.min.z;

  return (
    <section
      aria-label={pick("3D 손 모델·메쉬 커스텀·Auto-LOD·STL 스튜디오", "3D Hand Rig, Mesh Customizer, Auto-LOD & STL Studio")}
      data-testid="model3d-hand-customizer-panel"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold text-fg">
            {pick("3D 손 모델(15관절) · 메쉬 커스텀 · Auto-LOD · STL 스튜디오", "15-Joint 3D Hand · Mesh Customizer · Auto-LOD · STL Studio")}
          </h2>
          <p className="text-xs text-fg-3">
            {pick("FK 15관절 포즈와 8종 프리셋, 라플라시안 가중치·FFD 래티스, 3단계 Auto-LOD 및 STL·상호 그림자를 로컬에서 즉시 검증합니다.", "Real-time 15-joint FK hand presets, weight smoothing, 2x2x2 FFD lattice, 3-tier Auto-LOD, and STL group cast shadows.")}
          </p>
        </div>
        <span className={BADGE_INFO}>{pick("로컬 3D FK · 60fps 예산", "Local 3D FK · 60fps Budget")}</span>
      </header>

      <div role="tablist" aria-label={pick("3D 커스터마이저 도구 탭", "3D Customizer Tabs")} className="grid gap-1.5 rounded-lg border border-line bg-canvas p-1 sm:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${uid}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? BTN_ACTIVE : BTN}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "hand-rig" ? (
        <div id={`${uid}-panel-hand-rig`} role="tabpanel" aria-labelledby={`${uid}-tab-hand-rig`} data-testid="panel-hand-rig" className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(["right", "left"] as const).map((side) => (
                  <button key={side} type="button" aria-pressed={handedness === side} data-testid={`hand-side-${side}`} onClick={() => applyPose(handPose, side)} className={handedness === side ? BTN_ACTIVE : BTN}>
                    {side === "right" ? pick("오른손", "Right") : pick("왼손", "Left")}
                  </button>
                ))}
                <button type="button" data-testid="hand-mirror-btn" onClick={handleMirrorToggle} className={BTN}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("좌우 미러링", "Mirror Pose")}</span>
                </button>
              </div>
              <span data-testid="hand-joint-count" className="rounded-md bg-raised px-2 py-1 text-[11px] font-bold text-fg tabular-nums">
                {pick(`${solvedHand.summary.jointCount}관절 · ${handedness === "right" ? "우" : "좌"}`, `${solvedHand.summary.jointCount} Joints · ${handedness}`)}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-canvas p-2">
              <svg viewBox="0 0 320 260" role="img" aria-label={pick("실시간 15관절 3D 손 원근 프리뷰", "Live 15-joint 3D perspective hand preview")} data-testid="hand-svg-preview" className="h-56 w-full">
                <polygon points={palmPointsAttr} className="fill-panel stroke-line" strokeWidth={1.5} strokeLinejoin="round" />
                {solvedHand.capsules.map((seg) => {
                  const bodyWidth = Math.max(3, (seg.radiusStartPx + seg.radiusEndPx) * 0.92);
                  const fillClass =
                    seg.lighting.celBand === "highlight"
                      ? "stroke-raised"
                      : seg.lighting.celBand === "midtone"
                        ? "stroke-card"
                        : "stroke-panel";
                  return (
                    <g key={seg.id} data-capsule-id={seg.id}>
                      <line x1={seg.start2d.x} y1={seg.start2d.y} x2={seg.end2d.x} y2={seg.end2d.y} strokeLinecap="round" className="stroke-fg" strokeWidth={Number((bodyWidth + seg.nprOutlineWidthPx * 1.4).toFixed(2))} />
                      <line x1={seg.start2d.x} y1={seg.start2d.y} x2={seg.end2d.x} y2={seg.end2d.y} strokeLinecap="round" className={fillClass} strokeWidth={Number(bodyWidth.toFixed(2))} strokeOpacity={0.95} />
                    </g>
                  );
                })}
                {solvedHand.joints.map((joint) => (
                  <circle key={joint.id} cx={joint.screen.x} cy={joint.screen.y} r={2.8} data-joint-id={joint.id} className={joint.finger === "thumb" ? "fill-accent stroke-canvas" : "fill-cool stroke-canvas"} strokeWidth={1} />
                ))}
              </svg>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-panel px-2 py-1.5">
                <span className="text-[10px] text-fg-3">{pick("NPR 외곽선", "NPR Outline")}</span>
                <p data-testid="hand-npr-width" className="text-xs font-bold text-fg tabular-nums">{solvedHand.summary.averageNprOutlinePx}px</p>
              </div>
              <div className="rounded-md bg-panel px-2 py-1.5">
                <span className="text-[10px] text-fg-3">{pick("3점 광원 음영", "3-Point Shade")}</span>
                <p data-testid="hand-shade-intensity" className="text-xs font-bold text-fg tabular-nums">{Math.round(solvedHand.summary.meanShadeIntensity * 100)}%</p>
              </div>
              <div className="rounded-md bg-panel px-2 py-1.5">
                <span className="text-[10px] text-fg-3">{pick("깊이 캡슐", "Depth Capsules")}</span>
                <p className="text-xs font-bold text-fg tabular-nums">{solvedHand.summary.capsuleCount}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <h3 className="text-xs font-bold text-fg">{pick("8종 웹툰 실전 손 포즈 프리셋", "8 Webtoon Hand Pose Presets")}</h3>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("손 포즈 프리셋 선택", "Hand pose presets")}>
              {HAND_POSE_PRESETS.map((preset) => {
                const active = handPose.presetId === preset.id;
                return (
                  <button key={preset.id} type="button" aria-pressed={active} data-testid={`preset-${preset.id}`} onClick={() => applyPose(preset.pose)} className={`${active ? BTN_ACTIVE : BTN} justify-start px-2.5 text-left`}>
                    <span className="truncate">{pick(preset.labelKo, preset.labelEn)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-2.5">
              {FINGER_ORDER.map((finger) => {
                const inputId = `${uid}-curl-${finger}`;
                const val = fingerAverageCurlPercent(handPose, finger);
                return (
                  <div key={finger} className="grid grid-cols-[3.5rem_1fr_2.6rem] items-center gap-2 text-xs">
                    <label htmlFor={inputId} className="font-medium text-fg-2">{pick(FINGER_LABELS[finger].ko, FINGER_LABELS[finger].en)}</label>
                    <input id={inputId} type="range" min={0} max={100} value={val} data-testid={`slider-finger-${finger}`} onChange={(e) => applyPose(updateFingerCurlRatio(handPose, finger, Number(e.currentTarget.value)))} className="h-2 w-full cursor-pointer accent-accent" />
                    <span data-testid={`value-finger-${finger}`} className="text-right font-semibold text-fg tabular-nums">{val}%</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[3.5rem_1fr_2.6rem] items-center gap-2 text-xs">
                <label htmlFor={`${uid}-cam-yaw`} className="font-medium text-fg-2">{pick("회전각", "Orbit")}</label>
                <input id={`${uid}-cam-yaw`} type="range" min={-60} max={60} value={cameraYawDeg} data-testid="slider-camera-yaw" onChange={(e) => setCameraYawDeg(Number(e.currentTarget.value))} className="h-2 w-full cursor-pointer accent-accent" />
                <span className="text-right font-semibold text-fg tabular-nums">{cameraYawDeg}°</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "weight-ffd-lod" ? (
        <div id={`${uid}-panel-weight-ffd-lod`} role="tabpanel" aria-labelledby={`${uid}-tab-weight-ffd-lod`} data-testid="panel-weight-ffd-lod" className="grid gap-3 lg:grid-cols-3">
          <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("정점 가중치 라플라시안 스무딩", "Vertex Weight Smoothing")}</h3>
              <span data-testid="weight-reduction-badge" className={BADGE_GOOD}>
                <span className="tabular-nums">-{Math.round(smoothResult.varianceReductionRatio * 100)}%</span>
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-smooth-iter`} className="text-fg-2">{pick("스무딩 반복", "Iterations")}</label>
                  <span data-testid="smooth-iter-value" className="font-bold text-fg tabular-nums">{smoothIterations}</span>
                </div>
                <input id={`${uid}-smooth-iter`} type="range" min={0} max={10} value={smoothIterations} data-testid="slider-smooth-iterations" onChange={(e) => setSmoothIterations(Number(e.currentTarget.value))} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-smooth-lambda`} className="text-fg-2">{pick("완화 강도 λ", "Strength λ")}</label>
                  <span className="font-bold text-fg tabular-nums">{smoothLambda.toFixed(2)}</span>
                </div>
                <input id={`${uid}-smooth-lambda`} type="range" min={20} max={80} value={Math.round(smoothLambda * 100)} data-testid="slider-smooth-lambda" onChange={(e) => setSmoothLambda(Number(e.currentTarget.value) / 100)} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 rounded-lg bg-panel p-2 text-[11px] tabular-nums">
              <div><span className="text-fg-3">{pick("초기 분산", "Before Var")}</span><p className="font-bold text-fg">{smoothResult.beforeVariance.toFixed(4)}</p></div>
              <div><span className="text-fg-3">{pick("보정 분산", "After Var")}</span><p data-testid="weight-after-variance" className="font-bold text-good">{smoothResult.afterVariance.toFixed(4)}</p></div>
            </div>
          </article>

          <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("2×2×2 FFD 래티스 상체 변형", "2×2×2 FFD Upper-Body Lattice")}</h3>
              <span data-testid="ffd-max-disp" className="text-[11px] font-bold text-cool tabular-nums">Δ{(ffdResult.maxDisplacementMeters * 100).toFixed(1)}cm</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-ffd-shoulder`} className="text-fg-2">{pick("어깨 너비", "Shoulder Width")}</label>
                  <span className="font-bold text-fg tabular-nums">{Math.round(shoulderScale * 100)}%</span>
                </div>
                <input id={`${uid}-ffd-shoulder`} type="range" min={75} max={145} value={Math.round(shoulderScale * 100)} data-testid="slider-ffd-shoulder" onChange={(e) => setShoulderScale(Number(e.currentTarget.value) / 100)} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-ffd-height`} className="text-fg-2">{pick("상체 길이", "Torso Height")}</label>
                  <span className="font-bold text-fg tabular-nums">{Math.round(torsoHeightScale * 100)}%</span>
                </div>
                <input id={`${uid}-ffd-height`} type="range" min={80} max={130} value={Math.round(torsoHeightScale * 100)} data-testid="slider-ffd-height" onChange={(e) => setTorsoHeightScale(Number(e.currentTarget.value) / 100)} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${uid}-ffd-waist`} className="text-fg-2">{pick("허리 테이퍼", "Waist Taper")}</label>
                  <span className="font-bold text-fg tabular-nums">{Math.round(waistTaperScale * 100)}%</span>
                </div>
                <input id={`${uid}-ffd-waist`} type="range" min={75} max={125} value={Math.round(waistTaperScale * 100)} data-testid="slider-ffd-waist" onChange={(e) => setWaistTaperScale(Number(e.currentTarget.value) / 100)} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 rounded-lg bg-panel p-2 text-[11px] tabular-nums">
              <div><span className="text-fg-3">{pick("어깨 폭(원→변형)", "Span (Orig→New)")}</span><p data-testid="ffd-span-readout" className="font-bold text-fg">{ffdOrigW.toFixed(2)}→{ffdNextW.toFixed(2)}m</p></div>
              <div><span className="text-fg-3">{pick("변형 상체 높이", "New Height")}</span><p className="font-bold text-fg">{ffdNextH.toFixed(2)}m</p></div>
            </div>
          </article>

          <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("3단계 Auto-LOD · 60fps", "3-Tier Auto-LOD · 60fps")}</h3>
              <span data-testid="lod-fps-badge" className={lodPlan.within60FpsBudget ? BADGE_GOOD : BADGE_WARN}>
                <span className="tabular-nums">{lodPlan.estimatedFps}fps · {lodPlan.estimatedFrameMs}ms</span>
              </span>
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <label htmlFor={`${uid}-lod-crowd`} className="text-fg-2">{pick("원경 군중 인스턴스", "Crowd Instances")}</label>
                <span className="font-bold text-fg tabular-nums">{crowdCount}</span>
              </div>
              <input id={`${uid}-lod-crowd`} type="range" min={2} max={24} value={crowdCount} data-testid="slider-lod-crowd" onChange={(e) => setCrowdCount(Number(e.currentTarget.value))} className="h-2 w-full cursor-pointer accent-accent" />
            </div>
            <ul className="space-y-1 text-[11px] tabular-nums" data-testid="lod-tier-list">
              {(["LOD0", "LOD1", "LOD2"] as const).map((tier) => (
                <li key={tier} className="flex items-center justify-between rounded-md bg-panel px-2 py-1">
                  <span className="font-semibold text-fg">{tier} ({Math.round(lodPlan.tierSummary[tier].triangleRatio * 100)}%)</span>
                  <span className="text-fg-2">{lodPlan.tierSummary[tier].instanceCount} · {lodPlan.tierSummary[tier].renderedTriangles.toLocaleString("en-US")} tris</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto grid grid-cols-2 gap-2 rounded-lg bg-panel p-2 text-[11px] tabular-nums">
              <div><span className="text-fg-3">{pick("Instancing 콜", "Instanced Calls")}</span><p data-testid="lod-draw-calls" className="font-bold text-good">{lodPlan.naiveDrawCalls}→{lodPlan.instancedDrawCalls}</p></div>
              <div><span className="text-fg-3">{pick("삼각형 절감", "Tri Savings")}</span><p className="font-bold text-fg">-{lodPlan.triangleReductionPercent}%</p></div>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "stl-group-shadow" ? (
        <div id={`${uid}-panel-stl-group-shadow`} role="tabpanel" aria-labelledby={`${uid}-tab-stl-group-shadow`} data-testid="panel-stl-group-shadow" className="grid gap-3 lg:grid-cols-2">
          <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("바이너리/ASCII STL 파서 · Z=0 정규화", "Binary/ASCII STL Parser · Z=0 Grounding")}</span>
              </h3>
              <span data-testid="stl-manifold-badge" className={stlAudit.rawAudit.isManifold ? BADGE_GOOD : BADGE_WARN}>
                {stlAudit.rawAudit.isManifold ? pick("매니폴드 통과", "Manifold OK") : pick(`결함 ${stlAudit.rawAudit.nonManifoldEdgeCount + stlAudit.rawAudit.degenerateTriangleCount}건`, `${stlAudit.rawAudit.nonManifoldEdgeCount + stlAudit.rawAudit.degenerateTriangleCount} Defect(s)`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={stlSampleMode === "binary-mm"} data-testid="stl-sample-binary" onClick={() => setStlSampleMode("binary-mm")} className={stlSampleMode === "binary-mm" ? BTN_ACTIVE : BTN}>
                {pick("바이너리 STL (mm 소품)", "Binary STL (mm Prop)")}
              </button>
              <button type="button" aria-pressed={stlSampleMode === "ascii-defective"} data-testid="stl-sample-ascii" onClick={() => setStlSampleMode("ascii-defective")} className={stlSampleMode === "ascii-defective" ? BTN_ACTIVE : BTN}>
                {pick("ASCII STL (결함 진단)", "ASCII STL (Defect Audit)")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-panel p-2.5 text-xs tabular-nums">
              <div><span className="text-[11px] text-fg-3">{pick("포맷 · 정점/면", "Format · V/T")}</span><p data-testid="stl-format-summary" className="font-bold text-fg">{stlAudit.normalizedMesh.format} · {stlAudit.rawAudit.vertexCount}v / {stlAudit.rawAudit.triangleCount}t</p></div>
              <div><span className="text-[11px] text-fg-3">{pick("비매니폴드 · 퇴화", "Non-Manifold · Degen")}</span><p data-testid="stl-defect-counts" className="font-bold text-fg">{stlAudit.rawAudit.nonManifoldEdgeCount} / {stlAudit.rawAudit.degenerateTriangleCount}</p></div>
              <div><span className="text-[11px] text-fg-3">{pick("미터 스케일 배율", "Metric Scale")}</span><p className="font-bold text-fg">×{stlAudit.appliedScaleFactor}</p></div>
              <div><span className="text-[11px] text-fg-3">{pick("정규화 바닥 Z", "Grounded Min Z")}</span><p data-testid="stl-min-z" className="font-bold text-good">{stlAudit.normalizedAudit.bounds.min.z.toFixed(3)}m</p></div>
            </div>
          </article>

          <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <SunMedium className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("3D 그룹 일괄 변환 · 상호 그림자 투영", "3D Group TRS · Inter-Object Cast Shadows")}</span>
              </h3>
              <span data-testid="shadow-hit-count" className={groupEval.summary.shadowHitCount > 0 ? BADGE_INFO : BADGE_WARN}>
                <span className="tabular-nums">{pick(`상호 그림자 ${groupEval.summary.shadowHitCount}쌍`, `${groupEval.summary.shadowHitCount} Cast Pair(s)`)}</span>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 text-xs">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-grp-x`} className="flex justify-between text-fg-2"><span>{pick("그룹 X", "Shift X")}</span><strong className="text-fg tabular-nums">{groupShiftX.toFixed(1)}m</strong></label>
                <input id={`${uid}-grp-x`} type="range" min={-15} max={15} value={Math.round(groupShiftX * 10)} data-testid="slider-group-x" onChange={(e) => setGroupShiftX(Number(e.currentTarget.value) / 10)} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-grp-rot`} className="flex justify-between text-fg-2"><span>{pick("그룹 회전", "Group Yaw")}</span><strong className="text-fg tabular-nums">{groupRotateZ}°</strong></label>
                <input id={`${uid}-grp-rot`} type="range" min={-90} max={90} value={groupRotateZ} data-testid="slider-group-rotate" onChange={(e) => setGroupRotateZ(Number(e.currentTarget.value))} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-light-az`} className="flex justify-between text-fg-2"><span>{pick("광원 각도", "Light Azimuth")}</span><strong className="text-fg tabular-nums">{lightAzimuthDeg}°</strong></label>
                <input id={`${uid}-light-az`} type="range" min={-180} max={180} value={lightAzimuthDeg} data-testid="slider-light-azimuth" onChange={(e) => setLightAzimuthDeg(Number(e.currentTarget.value))} className="h-2 w-full cursor-pointer accent-accent" />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-canvas p-1.5">
              <svg viewBox="0 0 280 120" role="img" aria-label={pick("3D 그룹 상단 투영 및 상호 그림자 맵", "Top-down 3D group & cast shadow map")} data-testid="shadow-map-svg" className="h-28 w-full">
                {groupEval.objects.map((obj) => {
                  const x1 = mapWorldToSvg(obj.worldBounds.min.x, -2.5, 2.5, 280, 12);
                  const x2 = mapWorldToSvg(obj.worldBounds.max.x, -2.5, 2.5, 280, 12);
                  const y1 = mapWorldToSvg(obj.worldBounds.min.y, -1.6, 1.6, 120, 10);
                  const y2 = mapWorldToSvg(obj.worldBounds.max.y, -1.6, 1.6, 120, 10);
                  return (
                    <rect key={obj.id} x={x1} y={y1} width={Math.max(6, x2 - x1)} height={Math.max(6, y2 - y1)} rx={3} className="fill-raised stroke-fg-2" strokeWidth={1.2} />
                  );
                })}
                {groupEval.castShadowPairs.map((hit) => {
                  const sx1 = mapWorldToSvg(hit.projectedFootprint2d.minX, -2.5, 2.5, 280, 12);
                  const sx2 = mapWorldToSvg(hit.projectedFootprint2d.maxX, -2.5, 2.5, 280, 12);
                  const sy1 = mapWorldToSvg(hit.projectedFootprint2d.minY, -1.6, 1.6, 120, 10);
                  const sy2 = mapWorldToSvg(hit.projectedFootprint2d.maxY, -1.6, 1.6, 120, 10);
                  return (
                    <rect key={`${hit.casterId}-${hit.receiverId}`} x={sx1} y={sy1} width={Math.max(4, sx2 - sx1)} height={Math.max(4, sy2 - sy1)} rx={2} className="fill-accent-soft stroke-accent" strokeWidth={1.2} />
                  );
                })}
              </svg>
            </div>

            <ul className="space-y-1 text-[11px] tabular-nums" data-testid="shadow-pairs-list">
              {groupEval.castShadowPairs.length > 0 ? (
                groupEval.castShadowPairs.map((hit) => (
                  <li key={`${hit.casterId}-${hit.receiverId}`} className="flex items-center justify-between rounded-md bg-panel px-2 py-1 text-fg-2">
                    <span className="font-semibold text-fg">{hit.casterId} → {hit.receiverId}</span>
                    <span>{pick(`피복 ${Math.round(hit.coverageRatio * 100)}% · ${hit.overlapAreaM2}m²`, `Cover ${Math.round(hit.coverageRatio * 100)}% · ${hit.overlapAreaM2}m²`)}</span>
                  </li>
                ))
              ) : (
                <li className="rounded-md bg-panel px-2 py-1 text-fg-3">{pick("현재 광원 각도에서 겹치는 오브젝트 간 그림자가 없습니다.", "No inter-object cast shadows at this light angle.")}</li>
              )}
            </ul>
          </article>
        </div>
      ) : null}
    </section>
  );
}
