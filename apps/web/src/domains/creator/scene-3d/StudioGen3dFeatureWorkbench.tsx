import { useMemo, useState, type ReactElement } from "react";

import type { ShaperBodySliderValues } from "./studio-shaper-model";
import {
  buildMultiStageLodLadder,
  buildGen3dPoseControlSpec,
  buildWebtoon3dBackgroundCluster,
  computeAlbedoDelightingMetrics,
  computeGen3dPlatformWalletSummary,
  PRO3D_THINKING_EFFORTS,
  normalizeGen3dP2BBoxEditRegion,
  planPro3dGen25Session,
  planGen3dV3Pipeline,
  STUDIO_3D_COMPETITOR_REA_BENCHMARKS,
  type Pro3dControlNetMode,
  type Pro3dCardMode,
  type Pro3dEditOperation,
  type Pro3dSubMode,
  type Pro3dVersion,
  type Pro3dThinkingEffortId,
  type Gen3dV3ExportFormat,
  type Gen3dV3GenerationMode,
  type Gen3dV3ModelVersion,
  type Gen3dV3PostprocessStep,
  type Gen3dV3RigSpec,
  type Gen3dV3RigType,
  type Webtoon3dBackgroundClusterInput,
} from "./studio-gen3d-feature-engine";
import type { StudioAsset3dMannequinPosePresetId } from "./studio-asset3d-character-lab-diorama-catalog";
import { StudioGen3dEcosystemExtensionPanel } from "./StudioGen3dEcosystemExtensionPanel";

export interface StudioGen3dFeatureWorkbenchProps {
  readonly accordionGroupName: string;
  readonly onApplyMannequinBodySliders?: (
    sliders: ShaperBodySliderValues,
    options?: {
      readonly posePresetId?: StudioAsset3dMannequinPosePresetId;
      readonly archetypeLabelKo?: string;
      readonly motionLabelKo?: string;
    },
  ) => void;
}

const CHAIN_CANDIDATE_STEPS: readonly Gen3dV3PostprocessStep[] = Object.freeze([
  "rig-check", "rig", "retarget", "segment", "complete", "decimate", "uv", "edit", "smartsegment", "convert",
]);

const RIG_TYPES: readonly Gen3dV3RigType[] = Object.freeze([
  "biped", "quadruped", "hexapod", "octopod", "avian", "serpentine", "aquatic", "others",
]);

const RIG_SPECS: readonly Gen3dV3RigSpec[] = Object.freeze([
  "tripo", "mixamo", "actorcore", "unity", "unreal", "vrm",
]);

export function StudioGen3dFeatureWorkbench({
  accordionGroupName,
  onApplyMannequinBodySliders,
}: StudioGen3dFeatureWorkbenchProps): ReactElement {
  const [gen3dMode, setGen3dMode] = useState<Gen3dV3GenerationMode>("text-to-model");
  const [gen3dPrompt, setGen3dPrompt] = useState<string>("low-poly webtoon convenience store counter and neon sign");
  const [requestedModel, setRequestedModel] = useState<"auto" | Gen3dV3ModelVersion>("auto");
  const [quadEnabled, setQuadEnabled] = useState<boolean>(false);
  const [smartLowPoly, setSmartLowPoly] = useState<boolean>(true);
  const [delightEnabled, setDelightEnabled] = useState<boolean>(true);
  const [faceLimit, setFaceLimit] = useState<number>(8000);
  const [chainSteps, setChainSteps] = useState<readonly Gen3dV3PostprocessStep[]>([
    "rig-check", "rig", "retarget", "convert",
  ]);
  const [rigType, setRigType] = useState<Gen3dV3RigType>("biped");
  const [rigSpec, setRigSpec] = useState<Gen3dV3RigSpec>("mixamo");
  const [exportFormat, setExportFormat] = useState<Gen3dV3ExportFormat>("glb");
  const [poseType, setPoseType] = useState<"None" | "T-Pose" | "A-Pose">("T-Pose");
  const [headHeightRatio, setHeadHeightRatio] = useState<number>(1.1);
  const [legsHeightRatio, setLegsHeightRatio] = useState<number>(1.15);
  const [armsLengthRatio, setArmsLengthRatio] = useState<number>(1.0);
  const [spanOfLegs, setSpanOfLegs] = useState<number>(10.0);
  const [pro3dCardMode, setPro3dCardMode] = useState<Pro3dCardMode>("Generation");
  const [pro3dVersion, setPro3dVersion] = useState<Pro3dVersion>("Gen-2.5");
  const [pro3dSubMode, setPro3dSubMode] = useState<Pro3dSubMode>("Standard");
  const [controlNetMode, setControlNetMode] = useState<Pro3dControlNetMode>("bbox");
  const [thinkingEffort, setThinkingEffort] = useState<Pro3dThinkingEffortId>("High");
  const [editOperation, setEditOperation] = useState<Pro3dEditOperation>("Parts");
  const [bgPresetId, setBgPresetId] = useState<Webtoon3dBackgroundClusterInput["presetId"]>("korean-alley-commercial");
  const [floorCount, setFloorCount] = useState<number>(4);
  const [cameraPlane, setCameraPlane] = useState<Webtoon3dBackgroundClusterInput["cameraPlane"]>("street-low");

  const poseSpec = useMemo(
    () =>
      buildGen3dPoseControlSpec({
        poseType,
        headBodyHeightRatio: headHeightRatio,
        headBodyWidthRatio: 1.0,
        legsBodyHeightRatio: legsHeightRatio,
        armsBodyLengthRatio: armsLengthRatio,
        spanOfLegs,
      }),
    [poseType, headHeightRatio, legsHeightRatio, armsLengthRatio, spanOfLegs],
  );

  const gen3dPlan = useMemo(
    () =>
      planGen3dV3Pipeline({
        mode: gen3dMode,
        prompt: gen3dPrompt,
        ...(requestedModel !== "auto" ? { requestedModel } : {}),
        quad: quadEnabled,
        smartLowPoly,
        delight: delightEnabled,
        faceLimit,
        poseControl: {
          poseType,
          headBodyHeightRatio: headHeightRatio,
          headBodyWidthRatio: 1.0,
          legsBodyHeightRatio: legsHeightRatio,
          armsBodyLengthRatio: armsLengthRatio,
          spanOfLegs,
        },
        chainSteps,
        rigType,
        rigSpec,
        animations: ["preset:idle", "preset:walk"],
        exportFormat,
      }),
    [
      gen3dMode,
      gen3dPrompt,
      requestedModel,
      quadEnabled,
      smartLowPoly,
      delightEnabled,
      faceLimit,
      poseType,
      headHeightRatio,
      legsHeightRatio,
      armsLengthRatio,
      spanOfLegs,
      chainSteps,
      rigType,
      rigSpec,
      exportFormat,
    ],
  );

  const p2BBoxPreview = useMemo(
    () =>
      normalizeGen3dP2BBoxEditRegion({
        taskId: "task_tripo_v3_scene",
        minCorner: [-0.8, 0.0, -0.6],
        maxCorner: [0.8, 1.6, 0.6],
        editPrompt: "refine storefront awning and vending machine details",
      }),
    [],
  );

  const walletSummary = useMemo(
    () =>
      computeGen3dPlatformWalletSummary({
        defaultBalance: 2900,
        defaultFrozen: 100,
        freeBalance: 300,
        alertThreshold: 200,
      }),
    [],
  );

  const pro3dPlan = useMemo(
    () =>
      planPro3dGen25Session({
        cardMode: pro3dCardMode,
        requestedVersion: pro3dVersion,
        subMode: pro3dSubMode,
        controlNetMode,
        bboxDimensions: [1.4, 2.0, 1.2],
        voxelResolution: 64,
        pointCloudBudget: 8192,
        thinkingEffort,
        editOperation,
      }),
    [pro3dCardMode, pro3dVersion, pro3dSubMode, controlNetMode, thinkingEffort, editOperation],
  );

  const lodLadder = useMemo(
    () => buildMultiStageLodLadder(faceLimit, quadEnabled),
    [faceLimit, quadEnabled],
  );

  const delightMetrics = useMemo(
    () =>
      computeAlbedoDelightingMetrics({
        delightEnabled,
        shadowIntensity: 88,
        toonShadingTarget: true,
      }),
    [delightEnabled],
  );

  const bgClusterPlan = useMemo(
    () =>
      buildWebtoon3dBackgroundCluster({
        presetId: bgPresetId,
        floorCount,
        roofPitchDeg: 18,
        windowBayCount: 5,
        alleyWidthMeters: 4.5,
        cameraPlane,
      }),
    [bgPresetId, floorCount, cameraPlane],
  );

  const toggleChainStep = (step: Gen3dV3PostprocessStep): void => {
    setChainSteps((prev) =>
      prev.includes(step) ? prev.filter((item) => item !== step) : [...prev, step],
    );
  };

  return (
    <>
      <details
        name={accordionGroupName}
        data-testid="tripo3d-details-v3-pipeline"
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          Tripo Studio V3 3원 모델 라우터 (v3.1 / P1 / P2) & 12단계 후처리 체인 & Blender 5비율 포즈
          제어기
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-3 text-[0.72rem] text-fg-2 md:grid-cols-3">
          {/* Column 1: Prompt + Dual/Triple Model Router */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-fg">
              1. 생성 엔드포인트 & 3원 모델 라우팅 (v3.1 / P1 / P2)
            </span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  "text-to-model",
                  "image-to-model",
                  "multiview-to-model",
                  "image-to-splat",
                ] as const
              ).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`tripo3d-mode-${m}`}
                  aria-pressed={gen3dMode === m}
                  onClick={() => setGen3dMode(m)}
                  className={`rounded border px-1.5 py-0.5 text-[0.66rem] ${
                    gen3dMode === m
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              type="text"
              data-testid="tripo3d-prompt-input"
              aria-label="3D 생성 프롬프트"
              value={gen3dPrompt}
              onChange={(e) => setGen3dPrompt(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-1 text-[0.7rem] text-fg"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(["auto", "H3.1-20260901", "v3.1-20260211", "P1-20260311", "P2-20260801"] as const).map((ver) => (
                <button
                  key={ver}
                  type="button"
                  data-testid={`tripo3d-model-${ver}`}
                  aria-pressed={requestedModel === ver}
                  onClick={() => setRequestedModel(ver)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    requestedModel === ver
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {ver === "auto" ? "자동 라우팅" : ver}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="tripo3d-toggle-quad"
                  checked={quadEnabled}
                  onChange={(e) => setQuadEnabled(e.target.checked)}
                />
                <span>Quad 토폴로지</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="tripo3d-toggle-smart-lowpoly"
                  checked={smartLowPoly}
                  onChange={(e) => setSmartLowPoly(e.target.checked)}
                />
                <span>Smart Low-Poly</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="tripo3d-toggle-delight"
                  checked={delightEnabled}
                  onChange={(e) => setDelightEnabled(e.target.checked)}
                />
                <span>v3.5 Delight</span>
              </label>
            </div>
            <span data-testid="tripo3d-selected-model-readout" className="text-[0.68rem] text-fg-3">
              선택된 모델: <strong>{gen3dPlan.selectedModel}</strong> ({gen3dPlan.routeReasonKo})
            </span>
            {gen3dPlan.strippedParams.length > 0 && (
              <span data-testid="tripo3d-stripped-params-readout" className="text-[0.65rem] text-fg-3">
                P1 자동 제거 파라미터: <code>{gen3dPlan.strippedParams.join(", ")}</code>
              </span>
            )}
          </div>

          {/* Column 2: 12-Step Post-Processing Chain + Rig v3.0 */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-fg">
              2. 12단계 후처리 체인 & Rig v3.0 (8종 골격 · 6종 스펙)
            </span>
            <div className="flex flex-wrap gap-1">
              {CHAIN_CANDIDATE_STEPS.map((step) => (
                <button
                  key={step}
                  type="button"
                  data-testid={`tripo3d-chain-${step}`}
                  aria-pressed={chainSteps.includes(step)}
                  onClick={() => toggleChainStep(step)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    chainSteps.includes(step)
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {step}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {RIG_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  data-testid={`tripo3d-rigtype-${rt}`}
                  aria-pressed={rigType === rt}
                  onClick={() => setRigType(rt)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    rigType === rt
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {RIG_SPECS.map((spec) => (
                <button
                  key={spec}
                  type="button"
                  data-testid={`tripo3d-rigspec-${spec}`}
                  aria-pressed={rigSpec === spec}
                  onClick={() => setRigSpec(spec)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    rigSpec === spec
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {spec}
                </button>
              ))}
              {(["glb", "fbx", "usdz"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  data-testid={`tripo3d-format-${fmt}`}
                  aria-pressed={exportFormat === fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    exportFormat === fmt
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  .{fmt}
                </button>
              ))}
            </div>
            <span data-testid="tripo3d-chain-validation-readout" className="text-[0.67rem] text-fg-3">
              {gen3dPlan.valid
                ? `검증 통과 · 모션: ${
                    gen3dPlan.skippedRetarget
                      ? "비적용(골격 유지)"
                      : gen3dPlan.swappedAnimations.join(", ")
                  }`
                : `차단됨: ${gen3dPlan.hardErrors[0]}`}
            </span>
            <span className="text-[0.65rem] text-fg-3">
              P2 로컬 BBox 리두 영역: <code>{p2BBoxPreview.dimensions.join("×")}m</code> (부피{" "}
              {p2BBoxPreview.volumeCubicUnits}m³)
            </span>
          </div>

          {/* Column 3: Blender 5-Ratio Pose Control + Pre-Run Plan Card */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-fg">
              3. Blender 5비율 T/A-Pose 제어 & Pre-Run 크레딧 카드
            </span>
            <div className="flex items-center gap-1">
              {(["None", "T-Pose", "A-Pose"] as const).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  data-testid={`tripo3d-pose-${pt}`}
                  aria-pressed={poseType === pt}
                  onClick={() => setPoseType(pt)}
                  className={`rounded border px-2 py-0.5 text-[0.66rem] ${
                    poseType === pt
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {pt}
                </button>
              ))}
              <button
                type="button"
                data-testid="tripo3d-apply-pose-to-mannequin"
                onClick={() => {
                  onApplyMannequinBodySliders?.(poseSpec.shaperSliders, {
                    posePresetId: "standing",
                    archetypeLabelKo: `Tripo ${poseType} 체형 비율`,
                    motionLabelKo: gen3dPlan.swappedAnimations[0] ?? "preset:idle",
                  });
                }}
                className="ml-auto rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.66rem] font-semibold text-fg"
              >
                마네킹 체형 반영
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[0.65rem]">
              <label className="flex items-center justify-between gap-1">
                <span>두신 비율 ({headHeightRatio.toFixed(2)})</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  value={headHeightRatio}
                  onChange={(e) => setHeadHeightRatio(Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-1">
                <span>하체 비율 ({legsHeightRatio.toFixed(2)})</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.05}
                  value={legsHeightRatio}
                  onChange={(e) => setLegsHeightRatio(Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-1">
                <span>팔 길이 ({armsLengthRatio.toFixed(2)})</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.05}
                  value={armsLengthRatio}
                  onChange={(e) => setArmsLengthRatio(Number(e.target.value))}
                />
              </label>
              <label className="flex items-center justify-between gap-1">
                <span>다리 각도 ({spanOfLegs.toFixed(0)}°)</span>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={1}
                  value={spanOfLegs}
                  onChange={(e) => setSpanOfLegs(Number(e.target.value))}
                />
              </label>
            </div>
            <div
              data-testid="tripo3d-prerun-plan-card"
              className="rounded border border-line/80 bg-panel p-1.5 text-[0.66rem]"
            >
              <div>
                예상 크레딧: <strong>{gen3dPlan.estimatedCredits} cr</strong> (~$
                {gen3dPlan.estimatedUsd.toFixed(2)} USD) · 지갑 가용:{" "}
                <strong>{walletSummary.totalAvailableCredits} cr</strong>
              </div>
              <code
                data-testid="tripo3d-cli-preview"
                className="mt-0.5 block truncate text-[0.62rem] text-fg-3"
              >
                {gen3dPlan.cliCommandPreview}
              </code>
            </div>
          </div>
        </div>
      </details>

      <details
        name={accordionGroupName}
        data-testid="tripo3d-details-competitor-synthesis"
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          경쟁사 REA 전체 역공학 통합 워크벤치 (Hyper3D Rodin Gen-2.5 · Deemos Bang · Meshy LOD ·
          Sloyd/CSM 배경 클러스터)
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-3 text-[0.72rem] text-fg-2 md:grid-cols-3">
          {/* Column 1: Hyper3D Rodin Gen-2.5 & Deemos Bang Dual-Card Stack */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-fg">
                Hyper3D Rodin Dual-Card & Deemos Bang
              </span>
              <span
                data-testid="rodin-version-badge"
                style={{ background: pro3dPlan.badgeStyle }}
                className="rounded px-2 py-0.5 text-[0.64rem] font-bold text-white"
              >
                {pro3dPlan.effectiveVersion} · {pro3dPlan.subMode}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(["Generation", "3D Editing"] as const).map((cm) => (
                <button
                  key={cm}
                  type="button"
                  data-testid={`rodin-card-${cm}`}
                  aria-pressed={pro3dCardMode === cm}
                  onClick={() => setPro3dCardMode(cm)}
                  className={`rounded border px-2 py-0.5 text-[0.66rem] ${
                    pro3dCardMode === cm
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  카드: {cm}
                </button>
              ))}
              {(["Gen-2.5", "Gen-1.5"] as const).map((ver) => (
                <button
                  key={ver}
                  type="button"
                  data-testid={`rodin-ver-${ver}`}
                  disabled={pro3dPlan.versionLockedByEditingCard && ver === "Gen-1.5"}
                  aria-pressed={pro3dPlan.effectiveVersion === ver}
                  onClick={() => setPro3dVersion(ver)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    pro3dPlan.effectiveVersion === ver
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2 disabled:opacity-40"
                  }`}
                >
                  {ver}
                </button>
              ))}
              {(["Standard", "Remix Gen", "Turbo Gen"] as const).map((sm) => (
                <button
                  key={sm}
                  type="button"
                  data-testid={`rodin-submode-${sm}`}
                  aria-pressed={pro3dSubMode === sm}
                  onClick={() => setPro3dSubMode(sm)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    pro3dSubMode === sm
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {sm}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(["default", "bbox", "voxel", "pointcloud"] as const).map((cn) => (
                <button
                  key={cn}
                  type="button"
                  data-testid={`rodin-controlnet-${cn}`}
                  aria-pressed={controlNetMode === cn}
                  onClick={() => setControlNetMode(cn)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    controlNetMode === cn
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  CN:{cn}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {PRO3D_THINKING_EFFORTS.map((eff) => (
                <button
                  key={eff.id}
                  type="button"
                  data-testid={`rodin-effort-${eff.id}`}
                  aria-pressed={thinkingEffort === eff.id}
                  onClick={() => setThinkingEffort(eff.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                    thinkingEffort === eff.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {eff.id} ({eff.durationSeconds}s)
                </button>
              ))}
            </div>
            {pro3dCardMode === "3D Editing" && (
              <div className="flex flex-wrap gap-1">
                {(["Parts", "Refine", "Modify"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    data-testid={`rodin-edit-op-${op}`}
                    aria-pressed={editOperation === op}
                    onClick={() => setEditOperation(op)}
                    className={`rounded border px-2 py-0.5 text-[0.65rem] ${
                      editOperation === op
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {op === "Parts" ? "Parts (Deemos Bang)" : op}
                  </button>
                ))}
              </div>
            )}
            <span data-testid="rodin-plan-readout" className="text-[0.66rem] text-fg-3">
              {pro3dPlan.controlNetSummaryKo} · Thinking:{" "}
              <strong>{pro3dPlan.thinkingEffort?.labelKo ?? "N/A (Gen-1.5)"}</strong>
              {pro3dPlan.deemosBangPartsEnabled ? " · Deemos Bang 파트 분할 활성" : ""}
            </span>
          </div>

          {/* Column 2: Meshy 4-Stage LOD Ladder & Albedo Delighting */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-fg">
              Meshy AI 4단계 웹툰 LOD 래더 & Albedo 디라이팅
            </span>
            <div className="flex items-center gap-2 text-[0.66rem]">
              <span>기준 폴리곤 ({faceLimit.toLocaleString()} faces)</span>
              <input
                type="range"
                data-testid="meshy-lod-base-faces"
                min={1000}
                max={120000}
                step={1000}
                value={faceLimit}
                onChange={(e) => setFaceLimit(Number(e.target.value))}
              />
            </div>
            <div className="grid grid-cols-2 gap-1 text-[0.64rem]">
              {lodLadder.map((stage) => (
                <div
                  key={stage.stage}
                  data-testid={`meshy-lod-${stage.stage}`}
                  className="rounded border border-line/70 bg-panel px-1.5 py-1"
                >
                  <strong>{stage.stage}</strong>: {stage.targetFaces.toLocaleString()} faces
                  <div className="text-[0.6rem] text-fg-3">{stage.roleKo}</div>
                </div>
              ))}
            </div>
            <span data-testid="meshy-delight-readout" className="text-[0.66rem] text-fg-3">
              그림자 제거율: <strong>{delightMetrics.shadowRemovalPercent}%</strong> · 하이라이트 억제:{" "}
              <strong>{delightMetrics.specularSuppressionPercent}%</strong> · 툰 셰이더 호환:{" "}
              <strong>{delightMetrics.toonShaderReady ? "READY" : "RAW"}</strong>
            </span>
          </div>

          {/* Column 3: Sloyd Parametric + CSM Cube Webtoon Background Cluster */}
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-fg">
              Sloyd 파라메트릭 × CSM 6-Plane 웹툰 3D 배경 클러스터
            </span>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: "korean-alley-commercial", label: "한국 상가 골목" },
                  { id: "school-rooftop-sunset", label: "학교 옥상 노을" },
                  { id: "fantasy-palace-courtyard", label: "로판 황궁 회랑" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`bgcluster-preset-${preset.id}`}
                  aria-pressed={bgPresetId === preset.id}
                  onClick={() => setBgPresetId(preset.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    bgPresetId === preset.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
              <label className="flex items-center gap-1">
                <span>층수 ({floorCount}F)</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={floorCount}
                  onChange={(e) => setFloorCount(Number(e.target.value))}
                />
              </label>
              {(["street-low", "front", "top-iso"] as const).map((plane) => (
                <button
                  key={plane}
                  type="button"
                  data-testid={`bgcluster-cam-${plane}`}
                  aria-pressed={cameraPlane === plane}
                  onClick={() => setCameraPlane(plane)}
                  className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                    cameraPlane === plane
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  샷:{plane}
                </button>
              ))}
            </div>
            <div
              data-testid="bgcluster-summary-readout"
              className="rounded border border-line/70 bg-panel p-1.5 text-[0.65rem]"
            >
              <div>
                <strong>{bgClusterPlan.labelKo}</strong>
              </div>
              <div className="text-fg-3">
                절차적 건축 모듈: <strong>{bgClusterPlan.proceduralModuleCount}개</strong> · AI 히어로
                소품: <strong>{bgClusterPlan.aiHeroPropCount}개</strong> · 총{" "}
                <strong>{bgClusterPlan.totalEstimatedFaces.toLocaleString()}</strong> faces · FOV{" "}
                {bgClusterPlan.cameraFovDeg}°
              </div>
              <div className="mt-0.5 text-[0.6rem] text-fg-3">
                벤치마크 내재화 ({STUDIO_3D_COMPETITOR_REA_BENCHMARKS.length}개 플랫폼):{" "}
                {STUDIO_3D_COMPETITOR_REA_BENCHMARKS.map((b) => b.name).join(" · ")}
              </div>
            </div>
          </div>
        </div>
      </details>

      <StudioGen3dEcosystemExtensionPanel
        accordionGroupName={accordionGroupName}
        faceLimit={faceLimit}
        quadEnabled={quadEnabled}
        defaultShaperSliders={poseSpec.shaperSliders}
        onApplyMannequinBodySliders={onApplyMannequinBodySliders}
      />
    </>
  );
}
