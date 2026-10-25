import { useMemo, useState, type CSSProperties, type ReactElement } from "react";

import {
  STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS,
  STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_VARCO3D_RETARGETED_MOTION_TASKS,
  STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES,
  STUDIO_VARCO3D_WEBTOON_PROP_ASSETS,
  composeVarco3dCharacterLabLoadout,
  evaluateVarco3dDioramaScenePlacement,
  resolveVarco3dTurnaroundViewUrl,
  type StudioVarco3dTurnaroundAngle,
} from "./studio-varco3d-character-lab-diorama-catalog";
import {
  STUDIO_VARCO3D_12VIEW_CAMERA_RING,
  STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY,
  STUDIO_VARCO3D_POINT_POLICIES,
  buildVarco3dCanonicalPartDescriptor,
  evaluateVarco3dPointPolicyReservation,
  inspectVarco3d12ViewReconstructionBundle,
  type StudioVarco3d12ViewAngle,
  type StudioVarco3d12ViewMapFamily,
} from "./studio-varco3d-vibe-pipeline-canonical-bridge";
import {
  STUDIO_VARCO3D_ANIMATION_CATEGORIES,
  STUDIO_VARCO3D_WORKFLOW_NODE_CATALOG,
  STUDIO_VARCO3D_WORKFLOW_PREFLIGHT_METRICS,
  buildVarco3dArExportLinks,
  classifyVarco3dAnimationKey,
  computeVarco3dMcpReconnectBackoffMs,
  evaluateVarco3dGenerate3dNodePreflight,
  stepVarco3dUvViewerChannelByArrowKey,
  unpackVarco3dOrmChannelToGrayscaleRgba,
  validateVarco3dWorkflowConnection,
  type StudioVarco3dUvPreviewMode,
} from "./studio-varco3d-workflow-mcp-uv-ar-engine";

const UV_MODES: readonly StudioVarco3dUvPreviewMode[] = Object.freeze([
  "baseColor",
  "normal",
  "roughness",
  "metallic",
]);

const TURNAROUND_ANGLES: readonly StudioVarco3dTurnaroundAngle[] = Object.freeze([
  "front",
  "back",
  "left",
  "right",
]);

const MV12_FAMILIES: readonly StudioVarco3d12ViewMapFamily[] = Object.freeze([
  "mvImages",
  "mvAlbedo",
  "mvOrm",
]);

const DEFERRED_CATALOG_CONTAINER_STYLE: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto none auto 280px",
};

const SAMPLE_ANIMATION_KEYS = Object.freeze([
  { key: "webtoon_sword_combo_looping", labelKo: "휴머노이드 검술 루프" },
  { key: "dog_gallop_left_lead_looping", labelKo: "4족 보행(견공) 갤럽 루프" },
  { key: "horse_rear_up", labelKo: "마상(Equine) 앞발 들기" },
]);

export interface StudioVarco3dWorkflowMcpExportSectionProps {
  readonly accordionGroupName: string;
}

export function StudioVarco3dWorkflowMcpExportSection({
  accordionGroupName,
}: StudioVarco3dWorkflowMcpExportSectionProps): ReactElement {
  const [sourceNodeType, setSourceNodeType] = useState<"Generate3D" | "Rig">("Rig");
  const [targetNodeType, setTargetNodeType] = useState<"Animate" | "Remesh">("Animate");
  const [useAlphaEnabled, setUseAlphaEnabled] = useState<boolean>(true);
  const [hasTransparentPixels, setHasTransparentPixels] = useState<boolean>(true);
  const [uvMode, setUvMode] = useState<StudioVarco3dUvPreviewMode>("baseColor");
  const [selectedAnimKey, setSelectedAnimKey] = useState<string>(
    "webtoon_sword_combo_looping",
  );
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(
    "char_rofan_villainess_empress",
  );
  const [selectedWigId, setSelectedWigId] = useState<string>("charlab_wig_rofan_hime_wave");
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>(
    "charlab_outfit_rofan_crimson_gown",
  );
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>(
    "charlab_weapon_paladin_greatsword",
  );
  const [selectedTurnaroundAngle, setSelectedTurnaroundAngle] =
    useState<StudioVarco3dTurnaroundAngle>("front");
  const [selectedDioramaId, setSelectedDioramaId] = useState<string>(
    "diorama_rofan_imperial_ballroom",
  );
  const [selected12ViewFamily, setSelected12ViewFamily] =
    useState<StudioVarco3d12ViewMapFamily>("mvAlbedo");
  const [selected12ViewAngle, setSelected12ViewAngle] =
    useState<StudioVarco3d12ViewAngle>("front");
  const [selectedMotionTaskId, setSelectedMotionTaskId] = useState<string>(
    "cf5cbba3-4987-49b7-a1d1-079ccfcb09b8",
  );
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string>("task:AI_RIG");

  const connectionValidation = useMemo(
    () =>
      validateVarco3dWorkflowConnection({
        nodes: [
          { id: "src_node", type: sourceNodeType },
          { id: "dst_node", type: targetNodeType },
        ],
        edges: [],
        candidate: {
          source: "src_node",
          target: "dst_node",
          sourceHandle: "out",
          targetHandle: "mesh",
        },
      }),
    [sourceNodeType, targetNodeType],
  );

  const preflightResult = useMemo(
    () =>
      evaluateVarco3dGenerate3dNodePreflight({
        nodeId: "gen3d_main",
        useAlpha: useAlphaEnabled,
        hasLicense: false,
        isPlusAuthorized: true,
        sourceNodeType: "ImageInput",
        imageMaxDimensionPx: 1024,
        imageHasTransparency: hasTransparentPixels,
      }),
    [useAlphaEnabled, hasTransparentPixels],
  );

  const ormUnpackedPreview = useMemo(
    () =>
      unpackVarco3dOrmChannelToGrayscaleRgba(
        new Uint8ClampedArray([24, 164, 212, 255]),
        uvMode === "metallic" ? "metallic" : "roughness",
      ),
    [uvMode],
  );

  const arLinks = useMemo(
    () =>
      buildVarco3dArExportLinks({
        taskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
        glbOrUsdzUrl: "https://3d.varco.ai/assets/character_shaper.glb",
      }),
    [],
  );

  const classifiedAnim = useMemo(
    () => classifyVarco3dAnimationKey(selectedAnimKey),
    [selectedAnimKey],
  );

  const backoffScheduleText = useMemo(
    () =>
      [0, 1, 2, 3, 4]
        .map((attempt) => `${computeVarco3dMcpReconnectBackoffMs(attempt) / 1000}s`)
        .join(" → "),
    [],
  );

  const characterLabLoadout = useMemo(
    () =>
      composeVarco3dCharacterLabLoadout({
        archetypeId: selectedArchetypeId,
        itemIds: [selectedWigId, selectedOutfitId, selectedWeaponId],
      }),
    [selectedArchetypeId, selectedWigId, selectedOutfitId, selectedWeaponId],
  );

  const turnaroundViewUrl = useMemo(
    () =>
      characterLabLoadout.primaryTurnaround
        ? resolveVarco3dTurnaroundViewUrl(
            characterLabLoadout.primaryTurnaround,
            selectedTurnaroundAngle,
          )
        : "",
    [characterLabLoadout.primaryTurnaround, selectedTurnaroundAngle],
  );

  const dioramaPlacementPlan = useMemo(
    () =>
      evaluateVarco3dDioramaScenePlacement({
        dioramaId: selectedDioramaId,
        propIds: ["prop_school_desk_chair", "prop_cafe_table_set", "prop_pojangmacha_cart"],
      }),
    [selectedDioramaId],
  );

  const wigOptions = useMemo(
    () => STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "head-hair"),
    [],
  );
  const outfitOptions = useMemo(
    () => STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.filter((item) => item.slot === "outfit-set"),
    [],
  );

  const canonicalWigDescriptor = useMemo(() => {
    const activeWig =
      STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.find((item) => item.id === selectedWigId) ??
      STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS[0]!;
    return buildVarco3dCanonicalPartDescriptor(activeWig);
  }, [selectedWigId]);

  const mv12Inspection = useMemo(
    () =>
      inspectVarco3d12ViewReconstructionBundle({
        angle: selected12ViewAngle,
        mapFamily: selected12ViewFamily,
      }),
    [selected12ViewAngle, selected12ViewFamily],
  );

  const selectedMotionTask = useMemo(
    () =>
      STUDIO_VARCO3D_RETARGETED_MOTION_TASKS.find(
        (entry) => entry.animTaskId === selectedMotionTaskId,
      ) ?? STUDIO_VARCO3D_RETARGETED_MOTION_TASKS[0]!,
    [selectedMotionTaskId],
  );

  const pointReservationEval = useMemo(
    () =>
      evaluateVarco3dPointPolicyReservation({
        targetKey: selectedPolicyKey,
        quantity: 6,
        remainingPoints: 0,
        runningStudioTaskCount: 12,
      }),
    [selectedPolicyKey],
  );

  return (
    <>
      <details
        name={accordionGroupName}
        data-testid="varco3d-details-workflow-mcp"
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          CustomWorkflow V2 노드 연결 검증기 ({STUDIO_VARCO3D_WORKFLOW_NODE_CATALOG.length}노드) &
          Generate3D 프리플라이트 & MCP 브리지 v
          {STUDIO_VARCO3D_WORKFLOW_PREFLIGHT_METRICS.mcpProtocolVersion}
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">포트 meshKind 호환성 검증 (Rig ↔ Animate/Remesh)</span>
            <div className="flex flex-wrap gap-1">
              {(["Generate3D", "Rig"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  data-testid={`varco3d-wf-src-${src}`}
                  aria-pressed={sourceNodeType === src}
                  onClick={() => setSourceNodeType(src)}
                  className={`rounded border px-2 py-0.5 text-[0.68rem] ${
                    sourceNodeType === src
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  출력: {src}
                </button>
              ))}
              {(["Animate", "Remesh"] as const).map((dst) => (
                <button
                  key={dst}
                  type="button"
                  data-testid={`varco3d-wf-dst-${dst}`}
                  aria-pressed={targetNodeType === dst}
                  onClick={() => setTargetNodeType(dst)}
                  className={`rounded border px-2 py-0.5 text-[0.68rem] ${
                    targetNodeType === dst
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  입력: {dst}
                </button>
              ))}
            </div>
            <span
              data-testid="varco3d-wf-connection-readout"
              className="text-[0.68rem] text-fg-3"
            >
              {connectionValidation.ok
                ? "연결 가능 (OK)"
                : `차단됨: ${connectionValidation.reason}`}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              Generate3D 알파/업스케일 프리플라이트 (512px 스캔)
            </span>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="varco3d-preflight-use-alpha"
                  checked={useAlphaEnabled}
                  onChange={(e) => setUseAlphaEnabled(e.target.checked)}
                />
                <span>useAlpha 활성</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  data-testid="varco3d-preflight-has-transparency"
                  checked={hasTransparentPixels}
                  onChange={(e) => setHasTransparentPixels(e.target.checked)}
                />
                <span>투명 픽셀 존재</span>
              </label>
            </div>
            <span data-testid="varco3d-preflight-readout" className="text-[0.68rem] text-fg-3">
              {preflightResult.ok
                ? `통과 · skipUpscale=${String(preflightResult.skipInputUpscale)} · 라이선스=${preflightResult.assignedDefaultLicense}`
                : `차단됨: ${preflightResult.errorKey}`}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">WebSocket MCP 에디터 브리지 v2</span>
            <span className="text-[0.68rem] text-fg-3">
              지수 백오프: <code data-testid="varco3d-mcp-backoff-readout">{backoffScheduleText}</code>
            </span>
            <span className="text-[0.66rem] text-fg-3">
              엔드포인트: <code>/api/mcp/editor-ws</code> (4족 리깅 에이전트 차단 가드 활성)
            </span>
          </div>
        </div>
      </details>

      <details
        name={accordionGroupName}
        data-testid="varco3d-details-uv-ar-motion"
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          UV 아틀라스 ORM 채널 언패커 (B/N/R/M) & iOS USDZ / Android AR Scene Viewer &{" "}
          {STUDIO_VARCO3D_ANIMATION_CATEGORIES.length}-카테고리 모션 분류기
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">UV 맵 채널 프리뷰 (B / N / R / M)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="varco3d-uv-step-left"
                onClick={() =>
                  setUvMode(
                    (prev) =>
                      stepVarco3dUvViewerChannelByArrowKey(UV_MODES, prev, "ArrowLeft").nextMode,
                  )
                }
                className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
              >
                ←
              </button>
              <span
                data-testid="varco3d-uv-active-mode"
                className="rounded bg-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-fg"
              >
                {uvMode}
              </span>
              <button
                type="button"
                data-testid="varco3d-uv-step-right"
                onClick={() =>
                  setUvMode(
                    (prev) =>
                      stepVarco3dUvViewerChannelByArrowKey(UV_MODES, prev, "ArrowRight").nextMode,
                  )
                }
                className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
              >
                →
              </button>
            </div>
            <span className="text-[0.66rem] text-fg-3">
              ORM 추출 그레이스케일 바이트: <strong>{ormUnpackedPreview.grayscaleRgba[0]}</strong> ·
              채널 마스크: <code>[{ormUnpackedPreview.channelMask.join(",")}]</code>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">AR Quick Look (USDZ) & Scene Viewer</span>
            <code
              data-testid="varco3d-ar-usdz-url"
              className="truncate text-[0.65rem] text-fg-3"
            >
              {arLinks.iosUsdzApiUrl}
            </code>
            <code
              data-testid="varco3d-ar-android-url"
              className="truncate text-[0.65rem] text-fg-3"
            >
              {arLinks.androidSceneViewerIntentUrl}
            </code>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">스켈레톤 패밀리 모션 분류기 (Humanoid/Quadruped/Equine)</span>
            <div className="flex flex-wrap gap-1">
              {SAMPLE_ANIMATION_KEYS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  data-testid={`varco3d-motion-sample-${item.key}`}
                  aria-pressed={selectedAnimKey === item.key}
                  onClick={() => setSelectedAnimKey(item.key)}
                  className={`rounded border px-1.5 py-0.5 text-[0.66rem] ${
                    selectedAnimKey === item.key
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {item.labelKo}
                </button>
              ))}
            </div>
            <span data-testid="varco3d-motion-family-readout" className="text-[0.68rem] text-fg-3">
              패밀리: <strong>{classifiedAnim.clipFamily}</strong> · 루프:{" "}
              <strong>{classifiedAnim.isLooping ? "YES" : "NO"}</strong>
            </span>
          </div>
        </div>
      </details>

      <details
        name={accordionGroupName}
        data-testid="varco3d-details-character-lab-diorama"
        style={DEFERRED_CATALOG_CONTAINER_STYLE}
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          Character Labs 모듈형 파츠 코디네이터 ({STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS.length}
          종 · 4-View 턴어라운드) & 3D 배경 아이소메트릭 디오라마 (
          {STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.length}종) · 한국 웹툰 소품 (
          {STUDIO_VARCO3D_WEBTOON_PROP_ASSETS.length}종)
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              Character Labs 베이스 아키타입 ({STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES.length}종)
              & 가발/의상 슬롯
            </span>
            <select
              aria-label="Character Labs 베이스 아키타입"
              data-testid="varco3d-charlab-archetype-select"
              value={selectedArchetypeId}
              onChange={(e) => setSelectedArchetypeId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES.map((arch) => (
                <option key={arch.id} value={arch.id}>
                  {arch.labelKo} ({arch.headTallRatio}등신)
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {wigOptions.map((wig) => (
                <button
                  key={wig.id}
                  type="button"
                  data-testid={`varco3d-charlab-wig-${wig.id}`}
                  aria-pressed={selectedWigId === wig.id}
                  onClick={() => setSelectedWigId(wig.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedWigId === wig.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {wig.labelKo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {outfitOptions.slice(0, 4).map((outfit) => (
                <button
                  key={outfit.id}
                  type="button"
                  data-testid={`varco3d-charlab-outfit-${outfit.id}`}
                  aria-pressed={selectedOutfitId === outfit.id}
                  onClick={() => setSelectedOutfitId(outfit.id)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selectedOutfitId === outfit.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {outfit.labelKo}
                </button>
              ))}
            </div>
            <span data-testid="varco3d-charlab-loadout-readout" className="text-[0.66rem] text-fg-3">
              장착 파츠: <strong>{characterLabLoadout.equippedItems.length}개</strong> · 폴리곤 예산:{" "}
              <strong>{characterLabLoadout.totalPolygonBudget.toLocaleString()} tris</strong> · 장르
              시너지: <strong>{characterLabLoadout.genreSynergyScore}%</strong> · 본 바인딩:{" "}
              <code>{characterLabLoadout.attachedBones.join(", ")}</code>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              실시간 4-View 직교 턴어라운드 시트 (FOUR_VIEW_GENERATION)
            </span>
            <div className="flex flex-wrap gap-1">
              {TURNAROUND_ANGLES.map((angle) => (
                <button
                  key={angle}
                  type="button"
                  data-testid={`varco3d-turnaround-angle-${angle}`}
                  aria-pressed={selectedTurnaroundAngle === angle}
                  onClick={() => setSelectedTurnaroundAngle(angle)}
                  className={`rounded border px-2 py-0.5 text-[0.66rem] uppercase ${
                    selectedTurnaroundAngle === angle
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {angle}
                </button>
              ))}
              <button
                type="button"
                data-testid="varco3d-charlab-weapon-murim"
                onClick={() => setSelectedWeaponId("charlab_weapon_murim_jade_sword")}
                className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.65rem] text-fg-2"
              >
                무림 장검 장착
              </button>
            </div>
            <code
              data-testid="varco3d-turnaround-view-url"
              className="truncate text-[0.64rem] text-fg-3"
            >
              {turnaroundViewUrl}
            </code>
            <span className="text-[0.65rem] text-fg-3">
              턴어라운드 태스크 ID:{" "}
              <code>{characterLabLoadout.primaryTurnaround?.taskId ?? "none"}</code>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              3D 배경 아이소메트릭 디오라마 ({STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.length}종) &
              한국 웹툰 소품 배치
            </span>
            <select
              aria-label="3D 배경 아이소메트릭 디오라마 선택"
              data-testid="varco3d-diorama-select"
              value={selectedDioramaId}
              onChange={(e) => setSelectedDioramaId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.labelKo} ({scene.ambientKelvin}K)
                </option>
              ))}
            </select>
            <span data-testid="varco3d-diorama-plan-readout" className="text-[0.66rem] text-fg-3">
              FOV: <strong>{dioramaPlacementPlan.diorama.cameraFovDeg}°</strong> · 고도각:{" "}
              <strong>{dioramaPlacementPlan.diorama.cameraElevationDeg}°</strong> · 방위각:{" "}
              <strong>{dioramaPlacementPlan.diorama.cameraAzimuthDeg}°</strong> · 소품 면적:{" "}
              <strong>{dioramaPlacementPlan.totalFootprintAreaSqMeters}㎡</strong>
            </span>
            <code
              data-testid="varco3d-diorama-portal-url"
              className="truncate text-[0.64rem] text-fg-3"
            >
              {dioramaPlacementPlan.varcoAssetPortalUrl}
            </code>
          </div>
        </div>
      </details>

      <details
        name={accordionGroupName}
        data-testid="varco3d-details-vibe-pipeline-canonical"
        style={DEFERRED_CATALOG_CONTAINER_STYLE}
        className="rounded-lg border border-line/60 bg-card px-3 py-2"
      >
        <summary className="cursor-pointer font-semibold text-fg">
          CharacterCanonicalPart 브리지 & 12-View PBR 재구성 링 (mvImages/mvAlbedo/mvOrm) &{" "}
          {STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY.totalClips}-모션 리타겟팅 (mixamo52) &{" "}
          {STUDIO_VARCO3D_POINT_POLICIES.length}종 포인트/큐 정책
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              CharacterCanonicalPartDescriptor 브리지 (skinned-transplant / socket)
            </span>
            <span
              data-testid="varco3d-canonical-part-readout"
              className="text-[0.66rem] text-fg-3"
            >
              슬롯: <strong>{canonicalWigDescriptor.slot}</strong> · 바인딩:{" "}
              <strong>{canonicalWigDescriptor.binding.kind}</strong> · 타겟본:{" "}
              <code>{canonicalWigDescriptor.binding.targetBone}</code> · LOD:{" "}
              <strong>{canonicalWigDescriptor.lods.length}단계</strong>
            </span>
            <code
              data-testid="varco3d-canonical-part-sha256"
              className="truncate text-[0.63rem] text-fg-3"
            >
              sha256:{canonicalWigDescriptor.source.sha256}
            </code>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              12-View PBR 재구성 링 ({STUDIO_VARCO3D_12VIEW_CAMERA_RING.length}방향 · cd1e75d3)
            </span>
            <div className="flex flex-wrap gap-1">
              {MV12_FAMILIES.map((family) => (
                <button
                  key={family}
                  type="button"
                  data-testid={`varco3d-12view-family-${family}`}
                  aria-pressed={selected12ViewFamily === family}
                  onClick={() => setSelected12ViewFamily(family)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selected12ViewFamily === family
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {family}
                </button>
              ))}
              {(["front", "right", "back2", "top2"] as const).map((ang) => (
                <button
                  key={ang}
                  type="button"
                  data-testid={`varco3d-12view-angle-${ang}`}
                  aria-pressed={selected12ViewAngle === ang}
                  onClick={() => setSelected12ViewAngle(ang)}
                  className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                    selected12ViewAngle === ang
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {ang}
                </button>
              ))}
            </div>
            <span data-testid="varco3d-12view-stage-readout" className="text-[0.65rem] text-fg-3">
              스테이지: <code>{mv12Inspection.pipelineStageKey}</code> · 링 인덱스:{" "}
              <strong>#{mv12Inspection.ringIndex}</strong>
            </span>
            <code
              data-testid="varco3d-12view-url-readout"
              className="truncate text-[0.63rem] text-fg-3"
            >
              {mv12Inspection.objectUrl}
            </code>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">
              실서버 ANIMATE 리타겟팅 ({STUDIO_VARCO3D_RETARGETED_MOTION_TASKS.length}종) & 포인트 정책
            </span>
            <select
              aria-label="실서버 ANIMATE 리타겟팅 태스크 선택"
              data-testid="varco3d-retargeted-motion-select"
              value={selectedMotionTaskId}
              onChange={(e) => setSelectedMotionTaskId(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_VARCO3D_RETARGETED_MOTION_TASKS.map((task) => (
                <option key={task.animTaskId} value={task.animTaskId}>
                  {task.labelKo} ({task.animTaskId.slice(0, 8)})
                </option>
              ))}
            </select>
            <select
              aria-label="VARCO 3D 포인트 정책 선택"
              data-testid="varco3d-point-policy-select"
              value={selectedPolicyKey}
              onChange={(e) => setSelectedPolicyKey(e.target.value)}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg"
            >
              {STUDIO_VARCO3D_POINT_POLICIES.map((pol) => (
                <option key={pol.targetKey} value={pol.targetKey}>
                  {pol.targetKey} ({pol.labelKo})
                </option>
              ))}
            </select>
            <span
              data-testid="varco3d-retargeted-policy-readout"
              className="text-[0.65rem] text-fg-3"
            >
              모션FBX: <code>{selectedMotionTask.animationFbx}</code> · 정책 상태:{" "}
              <strong>{pointReservationEval.errorCode}</strong> · 가용 워커:{" "}
              <strong>{pointReservationEval.availableParallelSlots}/30</strong>
            </span>
          </div>
        </div>
      </details>
    </>
  );
}
