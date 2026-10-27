import { useMemo, useState, type ReactElement } from "react";

import type { ShaperBodySliderValues } from "./studio-shaper-model";
import {
  BLEND_AI_SCALE_GUIDES,
  buildTripo3dCustomizationRecipe,
  evaluateTripoStudioWorkspaceGuard,
  GLBFORGE_EXTRUDE_PRESETS,
  GLBFORGE_PROFILES,
  MESHY_CREATIVE_PRODUCTS,
  MESHY_SLICERS,
  planWebtoonSignageReliefExtrusion,
  simulateGlbForgeAuditAndOptimization,
  TRIPO3D_CUSTOMIZER_PALETTES,
  TRIPO3D_HAND_POSE_VARIANTS,
  TRIPO3D_MCP_GENERATED_MODELS,
  TRIPO_STUDIO_12_WORKSPACES,
  TRIPO_STUDIO_FREE_TRIAL_LEDGER,
  TRIPO_TEXT_TO_MOTION_PRESETS,
  VRM_TOOLKIT_MCP_INSPECTED_AVATARS,
  type GlbForgeBudgetProfileId,
  type ReliefExtrudePresetId,
  type Tripo3dCustomizerPaletteId,
  type Tripo3dHandPoseVariantId,
  type Tripo3dMcpGeneratedModelDomain,
  type TripoStudioWorkspaceId,
} from "./studio-tripo3d-ecosystem-engine";
import type { StudioVarco3dMannequinPosePresetId } from "./studio-varco3d-character-lab-diorama-catalog";

export interface StudioTripo3dEcosystemExtensionPanelProps {
  readonly accordionGroupName: string;
  readonly faceLimit: number;
  readonly quadEnabled: boolean;
  readonly defaultShaperSliders: ShaperBodySliderValues;
  readonly onApplyMannequinBodySliders?: (
    sliders: ShaperBodySliderValues,
    options?: {
      readonly posePresetId?: StudioVarco3dMannequinPosePresetId;
      readonly archetypeLabelKo?: string;
      readonly motionLabelKo?: string;
    },
  ) => void;
}

export function StudioTripo3dEcosystemExtensionPanel({
  accordionGroupName,
  faceLimit,
  quadEnabled,
  defaultShaperSliders,
  onApplyMannequinBodySliders,
}: StudioTripo3dEcosystemExtensionPanelProps): ReactElement {
  const [workspaceId, setWorkspaceId] = useState<TripoStudioWorkspaceId>("smart-uv");
  const [magicBrushPrompt, setMagicBrushPrompt] = useState<string>(
    "neon hangul convenience store logo on front signboard",
  );
  const [selectedMotionId, setSelectedMotionId] = useState<string>("slash-leap");
  const [glbProfileId, setGlbProfileId] = useState<GlbForgeBudgetProfileId>("mobile-hero");
  const [drawCalls, setDrawCalls] = useState<number>(6);
  const [extrudePresetId, setExtrudePresetId] = useState<ReliefExtrudePresetId>("neon");
  const [extrudeLayers, setExtrudeLayers] = useState<number>(3);
  const [pillowCm, setPillowCm] = useState<number>(0.25);
  const [meshyProductId, setMeshyProductId] = useState<string>("keycap");
  const [meshySlicer, setMeshySlicer] = useState<string>("bambu");
  const [bangStrength, setBangStrength] = useState<number>(6);
  const [mcpDomainFilter, setMcpDomainFilter] = useState<Tripo3dMcpGeneratedModelDomain | "all">(
    "all",
  );
  const [selectedMcpModelId, setSelectedMcpModelId] = useState<string>(
    TRIPO3D_MCP_GENERATED_MODELS[0]?.id ?? "tripo3d-p2-bg-street-cafe-kit",
  );

  // ── Section 5: Interactive Part-by-Part / Shader / Proportion Customizer State ──
  const [disabledPartIdsByModel, setDisabledPartIdsByModel] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [paletteId, setPaletteId] = useState<Tripo3dCustomizerPaletteId>("webtoon-cel-day");
  const [toonRampSteps, setToonRampSteps] = useState<2 | 3 | 4>(3);
  const [outlineWidthMm, setOutlineWidthMm] = useState<number>(1.5);
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const [mannequinHeadRatio, setMannequinHeadRatio] = useState<number>(8.0);
  const [handPoseVariantId, setHandPoseVariantId] = useState<Tripo3dHandPoseVariantId>("relaxed");
  const [customGlbUrl, setCustomGlbUrl] = useState<string>("");

  const visibleMcpModels = useMemo(
    () =>
      TRIPO3D_MCP_GENERATED_MODELS.filter(
        (m) => mcpDomainFilter === "all" || m.domain === mcpDomainFilter,
      ),
    [mcpDomainFilter],
  );

  const activeMcpModel = useMemo(
    () =>
      visibleMcpModels.find((m) => m.id === selectedMcpModelId) ??
      visibleMcpModels[0] ??
      TRIPO3D_MCP_GENERATED_MODELS[0]!,
    [selectedMcpModelId, visibleMcpModels],
  );

  const enabledPartIds = useMemo(() => {
    const disabled = new Set(disabledPartIdsByModel[activeMcpModel.id] ?? []);
    return activeMcpModel.customizableParts
      .filter((p) => !disabled.has(p.id))
      .map((p) => p.id);
  }, [activeMcpModel, disabledPartIdsByModel]);

  const customizationRecipe = useMemo(
    () =>
      buildTripo3dCustomizationRecipe({
        modelId: activeMcpModel.id,
        customGlbUrl,
        enabledPartIds,
        paletteId,
        toonRampSteps,
        outlineWidthMm,
        scaleMultiplier,
        mannequinHeadRatio,
        handPoseVariantId,
      }),
    [
      activeMcpModel.id,
      customGlbUrl,
      enabledPartIds,
      paletteId,
      toonRampSteps,
      outlineWidthMm,
      scaleMultiplier,
      mannequinHeadRatio,
      handPoseVariantId,
    ],
  );

  const workspaceGuard = useMemo(
    () =>
      evaluateTripoStudioWorkspaceGuard({
        workspaceId,
        faceCount: faceLimit,
        quad: quadEnabled,
      }),
    [workspaceId, faceLimit, quadEnabled],
  );

  const glbAudit = useMemo(
    () =>
      simulateGlbForgeAuditAndOptimization({
        profileId: glbProfileId,
        triangles: faceLimit,
        drawCalls,
        materials: 4,
        textureSizePx: 2048,
      }),
    [glbProfileId, faceLimit, drawCalls],
  );

  const extrudePlan = useMemo(
    () =>
      planWebtoonSignageReliefExtrusion({
        presetId: extrudePresetId,
        layers: extrudeLayers,
        depthCm: 1.2,
        pillowCm,
      }),
    [extrudePresetId, extrudeLayers, pillowCm],
  );

  const activeMotion = useMemo(
    () =>
      TRIPO_TEXT_TO_MOTION_PRESETS.find((m) => m.id === selectedMotionId) ??
      TRIPO_TEXT_TO_MOTION_PRESETS[0]!,
    [selectedMotionId],
  );

  const activeMeshyProduct = useMemo(
    () =>
      MESHY_CREATIVE_PRODUCTS.find((p) => p.id === meshyProductId) ??
      MESHY_CREATIVE_PRODUCTS[0]!,
    [meshyProductId],
  );

  function togglePart(partId: string): void {
    const currentDisabled = new Set(disabledPartIdsByModel[activeMcpModel.id] ?? []);
    if (currentDisabled.has(partId)) {
      currentDisabled.delete(partId);
    } else if (currentDisabled.size < activeMcpModel.customizableParts.length - 1) {
      currentDisabled.add(partId);
    }
    setDisabledPartIdsByModel((prev) => ({
      ...prev,
      [activeMcpModel.id]: [...currentDisabled],
    }));
  }

  return (
    <details
      name={accordionGroupName}
      data-testid="tripo3d-details-ecosystem-mcp"
      className="rounded-lg border border-line/60 bg-card px-3 py-2"
    >
      <summary className="cursor-pointer font-semibold text-fg">
        3D MCP 생태계 확장 허브 (Tripo 12-Workspace · GLBForge 17-Rule 린터 & 2D→3D 간판 압출 ·
        Meshy 7 크리에이티브 랩 · 22종 GLB 파츠별 커스터마이저)
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-3 text-[0.72rem] text-fg-2 md:grid-cols-3">
        {/* Column 1: Tripo Studio 12-Workspace Hub & Text-to-Motion */}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-fg">
            1. Tripo Studio 12-Workspace (H3.1 · Smart UV · 매직 브러시 · Text-to-Motion)
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Tripo Studio 12 워크스페이스">
            {TRIPO_STUDIO_12_WORKSPACES.map((ws) => (
              <button
                key={ws.id}
                type="button"
                data-testid={`tripo-ws-${ws.id}`}
                aria-pressed={workspaceId === ws.id}
                onClick={() => setWorkspaceId(ws.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.64rem] ${
                  workspaceId === ws.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {ws.labelKo}
                {ws.badgeKo ? ` (${ws.badgeKo})` : ""}
              </button>
            ))}
          </div>
          <div
            data-testid="tripo-ws-guard-readout"
            className="rounded border border-line/70 bg-panel p-1.5 text-[0.65rem]"
          >
            <div className="font-semibold text-fg">
              <code>{workspaceGuard.workspace.route}</code> · {workspaceGuard.workspace.creditCost} cr
            </div>
            <div className="text-fg-2">{workspaceGuard.workspace.summaryKo}</div>
            <div className={workspaceGuard.allowed ? "text-fg-3" : "font-semibold text-danger"}>
              {workspaceGuard.allowed
                ? `가드레일 통과: ${workspaceGuard.workspace.guardrailKo}`
                : workspaceGuard.blockersKo.join(" / ")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              data-testid="tripo-magic-brush-input"
              aria-label="매직 브러시 로컬 텍스처 인페인팅 프롬프트"
              value={magicBrushPrompt}
              onChange={(e) => setMagicBrushPrompt(e.target.value)}
              className="flex-1 rounded border border-line bg-panel px-2 py-0.5 text-[0.66rem] text-fg"
            />
            <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.62rem] text-fg-3">
              Magic Brush 5cr
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {TRIPO_TEXT_TO_MOTION_PRESETS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`tripo-motion-${m.id}`}
                aria-pressed={selectedMotionId === m.id}
                onClick={() => {
                  setSelectedMotionId(m.id);
                  onApplyMannequinBodySliders?.(defaultShaperSliders, {
                    posePresetId: m.mannequinPosePresetId,
                    archetypeLabelKo: "Tripo Text-to-Motion",
                    motionLabelKo: m.labelKo,
                  });
                }}
                className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                  selectedMotionId === m.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {m.labelKo}
              </button>
            ))}
          </div>
          <span data-testid="tripo-motion-readout" className="text-[0.64rem] text-fg-3">
            Text-to-Motion: <code>{activeMotion.tripoPresetId}</code> → 마네킹 포즈{" "}
            <strong>{activeMotion.mannequinPosePresetId}</strong> 즉시 연동
          </span>
        </div>

        {/* Column 2: GLBForge 17-Rule Linter & 2D-to-3D Webtoon Signage Extruder */}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-fg">
            2. GLBForge 17-Rule 성능 예산 린터 & 2D→3D 간판/굿즈 부조 압출기
          </span>
          <div className="flex flex-wrap gap-1">
            {GLBFORGE_PROFILES.map((prof) => (
              <button
                key={prof.id}
                type="button"
                data-testid={`glbforge-profile-${prof.id}`}
                aria-pressed={glbProfileId === prof.id}
                onClick={() => setGlbProfileId(prof.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                  glbProfileId === prof.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {prof.id}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-[0.65rem]">
            <span>드로우콜 시뮬레이션 ({drawCalls} DC)</span>
            <input
              type="range"
              data-testid="glbforge-drawcalls-slider"
              min={1}
              max={16}
              step={1}
              value={drawCalls}
              aria-valuetext={`${drawCalls} draw calls`}
              style={{ accentColor: "var(--color-accent, #338fff)" }}
              onChange={(e) => setDrawCalls(Number(e.target.value))}
            />
          </label>
          <div
            data-testid="glbforge-audit-readout"
            className="rounded border border-line/70 bg-panel p-1.5 text-[0.64rem]"
          >
            <div>
              GLBForge 점수: <strong>{glbAudit.score}/100</strong> (
              {glbAudit.passed ? "예산 통과" : `위반 ${glbAudit.findingsKo.length}건`}) · 최적화 후{" "}
              <strong>{glbAudit.optimizedTriangles.toLocaleString()} Tri</strong> /{" "}
              <strong>{glbAudit.optimizedDrawCalls} DC</strong> (LOD1 {glbAudit.lod1Triangles.toLocaleString()} /
              LOD2 {glbAudit.lod2Triangles.toLocaleString()})
            </div>
            {glbAudit.findingsKo[0] ? (
              <div className="mt-0.5 text-[0.61rem] text-fg-3">{glbAudit.findingsKo[0]}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {GLBFORGE_EXTRUDE_PRESETS.map((ep) => (
              <button
                key={ep.id}
                type="button"
                data-testid={`glbforge-extrude-${ep.id}`}
                aria-pressed={extrudePresetId === ep.id}
                onClick={() => setExtrudePresetId(ep.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                  extrudePresetId === ep.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {ep.id}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 text-[0.64rem]">
            <label className="flex items-center justify-between gap-1">
              <span>K-Means 층수 ({extrudeLayers})</span>
              <input
                type="range"
                data-testid="glbforge-extrude-layers"
                min={1}
                max={6}
                step={1}
                value={extrudeLayers}
                aria-valuetext={`${extrudeLayers} layers`}
                style={{ accentColor: "var(--color-accent, #338fff)" }}
                onChange={(e) => setExtrudeLayers(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center justify-between gap-1">
              <span>EDT 돔 ({pillowCm.toFixed(2)}cm)</span>
              <input
                type="range"
                data-testid="glbforge-extrude-pillow"
                min={0}
                max={1.5}
                step={0.05}
                value={pillowCm}
                aria-valuetext={`${pillowCm.toFixed(2)} centimeters`}
                style={{ accentColor: "var(--color-accent, #338fff)" }}
                onChange={(e) => setPillowCm(Number(e.target.value))}
              />
            </label>
          </div>
          <span data-testid="glbforge-extrude-readout" className="text-[0.63rem] text-fg-3">
            {extrudePlan.summaryKo}
          </span>
        </div>

        {/* Column 3: Meshy 7 Creative Lab + Hyper3D BANG + VRM/Blend-AI Scale */}
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-fg">
            3. Meshy 7 (meshy-t2) 크리에이티브 랩 · Rodin BANG · Blend-AI 실측 스케일
          </span>
          <div className="flex flex-wrap gap-1">
            {MESHY_CREATIVE_PRODUCTS.map((prod) => (
              <button
                key={prod.id}
                type="button"
                data-testid={`meshy-product-${prod.id}`}
                aria-pressed={meshyProductId === prod.id}
                onClick={() => setMeshyProductId(prod.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                  meshyProductId === prod.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {prod.id}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {MESHY_SLICERS.map((sl) => (
              <button
                key={sl}
                type="button"
                data-testid={`meshy-slicer-${sl}`}
                aria-pressed={meshySlicer === sl}
                onClick={() => setMeshySlicer(sl)}
                className={`rounded border px-1.5 py-0.5 text-[0.62rem] ${
                  meshySlicer === sl
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {sl}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-2 text-[0.64rem]">
            <span>Deemos BANG 파츠 분해 강도 ({bangStrength}/12 → ~{bangStrength * 2}파츠)</span>
            <input
              type="range"
              data-testid="rodin-bang-strength-slider"
              min={1}
              max={12}
              step={1}
              value={bangStrength}
              aria-valuetext={`strength ${bangStrength} of 12`}
              style={{ accentColor: "var(--color-accent, #338fff)" }}
              onChange={(e) => setBangStrength(Number(e.target.value))}
            />
          </label>
          <div
            data-testid="meshy-blendai-summary-readout"
            className="rounded border border-line/70 bg-panel p-1.5 text-[0.64rem]"
          >
            <div>
              <strong>{activeMeshyProduct.labelKo}</strong> (prototype→build 2단계 · 슬라이서{" "}
              <code>{meshySlicer}</code> · {activeMeshyProduct.credits}cr)
            </div>
            <div className="mt-0.5 text-fg-3">
              Blend-AI 실측 스케일:{" "}
              {BLEND_AI_SCALE_GUIDES.map((g) => `${g.labelKo} ${g.meters}m`).join(" · ")} · 3점 조명{" "}
              <strong>Key:Fill:Rim = 3:1:1.5</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Real Tripo3D MCP + GLBForge + VRM Toolkit Generated 3D Models (22 GLBs) */}
      <div
        data-testid="tripo3d-mcp-generated-models-section"
        className="mt-2.5 rounded-lg border border-line/70 bg-panel/70 p-2 text-[0.68rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-fg">
            4. Tripo Studio 무료 체험 전량 소진 & MCP 실생성 3D 모델 팩 ({TRIPO3D_MCP_GENERATED_MODELS.length}종 GLB +{" "}
            {VRM_TOOLKIT_MCP_INSPECTED_AVATARS.length}종 VRM 검증)
          </span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Tripo3D MCP 생성 3D 모델 도메인 필터">
            {(
              [
                { id: "all", labelKo: `전체 (${TRIPO3D_MCP_GENERATED_MODELS.length})` },
                { id: "bg3d", labelKo: "3D 배경 (8)" },
                { id: "mannequin", labelKo: "3D 데생인형 (6)" },
                { id: "character-lab", labelKo: "3D 캐릭터 랩 (8)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`tripo3d-mcp-domain-${tab.id}`}
                aria-pressed={mcpDomainFilter === tab.id}
                onClick={() => setMcpDomainFilter(tab.id)}
                className={`rounded border px-2 py-0.5 text-[0.62rem] ${
                  mcpDomainFilter === tab.id
                    ? "border-accent bg-accent-soft font-semibold text-fg"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                {tab.labelKo}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMcpModels.map((model) => (
            <button
              key={model.id}
              type="button"
              data-testid={`tripo3d-mcp-model-${model.id}`}
              aria-pressed={selectedMcpModelId === model.id}
              onClick={() => {
                setSelectedMcpModelId(model.id);
                onApplyMannequinBodySliders?.(defaultShaperSliders, {
                  posePresetId: model.recommendedPosePresetId ?? "standing",
                  archetypeLabelKo: model.nameKo,
                  motionLabelKo: model.fileName,
                });
              }}
              className={`flex flex-col items-start rounded border p-1.5 text-left transition-colors ${
                selectedMcpModelId === model.id
                  ? "border-accent bg-accent-soft/60 text-fg"
                  : "border-line bg-card text-fg-2 hover:border-accent/50"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className="font-semibold text-fg">{model.nameKo}</span>
                <span className="rounded bg-panel px-1 py-0.5 text-[0.58rem] font-semibold text-accent">
                  GLBForge {model.glbforgeScore}/100
                </span>
              </div>
              {model.freeTrialBadgeKo ? (
                <span className="mt-0.5 rounded bg-accent/15 px-1.5 py-0.5 text-[0.57rem] font-semibold text-accent">
                  {model.freeTrialBadgeKo} · {model.topologyMode}
                </span>
              ) : null}
              <span className="mt-0.5 line-clamp-2 text-[0.61rem] text-fg-3">
                {model.descriptionKo}
              </span>
              <span className="mt-1 text-[0.59rem] text-fg-2">
                <code>{model.url}</code> · {model.triangles.toLocaleString()} Tri · 파츠{" "}
                {model.customizableParts.length}개 · {Math.round(model.byteSize / 1024)}KB
              </span>
            </button>
          ))}
        </div>

        <div
          data-testid="tripo3d-mcp-selected-model-readout"
          className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded border border-line/60 bg-card px-2 py-1 text-[0.63rem]"
        >
          <div>
            선택된 3D 모델: <strong>{activeMcpModel.nameKo}</strong> (<code>{activeMcpModel.url}</code>) ·{" "}
            <span>{activeMcpModel.mcpPipelineKo}</span> · SHA-256{" "}
            <code>{activeMcpModel.sha256.slice(0, 19)}…</code>
          </div>
          <div className="text-fg-3" data-testid="vrm-toolkit-mcp-avatar-summary">
            VRM Toolkit MCP 검증:{" "}
            {VRM_TOOLKIT_MCP_INSPECTED_AVATARS.map(
              (v) =>
                `${v.nameKo} (${v.specFamily.toUpperCase()} · ${v.mappedBoneCount}본 · ${v.totalTriangles.toLocaleString()} Tri)`,
            ).join(" / ")}
          </div>
        </div>
      </div>

      {/* Section 5: Interactive Part-by-Part, Toon Shader, Proportion & Custom GLB Customizer */}
      <div
        data-testid="tripo3d-customizer-workbench"
        className="mt-2.5 rounded-lg border border-accent/50 bg-panel/80 p-2.5 text-[0.68rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-fg">
            5. 파츠별 ON/OFF · 웹툰 셀셰이더 · 등신 비례 · 커스텀 GLB 실시간 커스터마이저
          </span>
          <span
            data-testid="tripo3d-free-trial-ledger-readout"
            className="rounded border border-accent/40 bg-accent-soft/30 px-2 py-0.5 text-[0.6rem] font-semibold text-fg"
          >
            무료 체험 소진 원장:{" "}
            {TRIPO_STUDIO_FREE_TRIAL_LEDGER.map(
              (item) => `${item.id} ${item.usedCount}/${item.totalCount}`,
            ).join(" · ")}{" "}
            (잔여 무료 체험{" "}
            {TRIPO_STUDIO_FREE_TRIAL_LEDGER.reduce((acc, item) => acc + item.remainingCount, 0)}건)
          </span>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {/* Sub-col A: Semantic Part Toggles + Custom GLB URL */}
          <div className="flex flex-col gap-1.5 rounded border border-line/60 bg-card p-2">
            <span className="font-medium text-fg">
              A. 시맨틱 서브메시 파츠 ON/OFF ({customizationRecipe.activePartCount}/
              {customizationRecipe.totalPartCount} 활성 ·{" "}
              {customizationRecipe.estimatedActiveTriangles.toLocaleString()} Tri)
            </span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="3D 모델 시맨틱 파츠 토글">
              {activeMcpModel.customizableParts.map((part) => {
                const enabled = customizationRecipe.activePartIds.includes(part.id);
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-testid={`tripo3d-part-toggle-${part.id}`}
                    aria-pressed={enabled}
                    onClick={() => togglePart(part.id)}
                    className={`rounded border px-1.5 py-0.5 text-[0.62rem] transition-colors ${
                      enabled
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-3 line-through opacity-75"
                    }`}
                  >
                    {enabled ? "✓ " : "✕ "}
                    {part.labelKo}
                  </button>
                );
              })}
            </div>
            <label className="mt-1 flex flex-col gap-0.5 text-[0.62rem]">
              <span className="text-fg-3">사용자 커스텀 .glb / .vrm URL 오버라이드</span>
              <input
                type="text"
                data-testid="tripo3d-custom-glb-url-input"
                value={customGlbUrl}
                onChange={(e) => setCustomGlbUrl(e.target.value)}
                placeholder="/models/tripo3d-mcp/custom_asset.glb"
                className="rounded border border-line bg-panel px-2 py-0.5 text-[0.63rem] text-fg"
              />
            </label>
          </div>

          {/* Sub-col B: Color Palette + Toon Ramp + Outline Width */}
          <div className="flex flex-col gap-1.5 rounded border border-line/60 bg-card p-2">
            <span className="font-medium text-fg">
              B. 웹툰 컬러 팔레트 · 셀셰이딩 단계 · 먹선 외곽선
            </span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="웹툰 컬러 팔레트 프리셋">
              {TRIPO3D_CUSTOMIZER_PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  data-testid={`tripo3d-palette-${pal.id}`}
                  aria-pressed={paletteId === pal.id}
                  onClick={() => {
                    setPaletteId(pal.id);
                    setToonRampSteps(pal.defaultToonRampSteps);
                    setOutlineWidthMm(pal.defaultOutlineWidthMm);
                  }}
                  className={`rounded border px-1.5 py-0.5 text-[0.61rem] ${
                    paletteId === pal.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {pal.labelKo}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-[0.63rem]">
              <span>툰 램프 단수</span>
              <div className="flex gap-1">
                {([2, 3, 4] as const).map((steps) => (
                  <button
                    key={steps}
                    type="button"
                    data-testid={`tripo3d-toon-ramp-${steps}`}
                    aria-pressed={toonRampSteps === steps}
                    onClick={() => setToonRampSteps(steps)}
                    className={`rounded border px-2 py-0.5 text-[0.61rem] ${
                      toonRampSteps === steps
                        ? "border-accent bg-accent-soft font-semibold text-fg"
                        : "border-line bg-panel text-fg-2"
                    }`}
                  >
                    {steps}단
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-[0.63rem]">
              <span>외곽선 두께 ({outlineWidthMm.toFixed(1)}mm)</span>
              <input
                type="range"
                data-testid="tripo3d-outline-width-slider"
                min={0}
                max={5}
                step={0.1}
                value={outlineWidthMm}
                onChange={(e) => setOutlineWidthMm(Number(e.target.value))}
              />
            </label>
          </div>

          {/* Sub-col C: Scale Multiplier + Mannequin Head Ratio + Hand Pose Grips */}
          <div className="flex flex-col gap-1.5 rounded border border-line/60 bg-card p-2">
            <span className="font-medium text-fg">
              C. 등신 비례 ({mannequinHeadRatio.toFixed(1)}등신) · 스케일 ({scaleMultiplier.toFixed(2)}x) · 손 그립
            </span>
            <label className="flex items-center justify-between gap-2 text-[0.63rem]">
              <span>등신비 (5~9등신)</span>
              <input
                type="range"
                data-testid="tripo3d-mannequin-head-ratio-slider"
                min={5.0}
                max={9.0}
                step={0.5}
                value={mannequinHeadRatio}
                onChange={(e) => setMannequinHeadRatio(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[0.63rem]">
              <span>배경·소품 배율 ({scaleMultiplier.toFixed(2)}x)</span>
              <input
                type="range"
                data-testid="tripo3d-scale-multiplier-slider"
                min={0.4}
                max={2.5}
                step={0.05}
                value={scaleMultiplier}
                onChange={(e) => setScaleMultiplier(Number(e.target.value))}
              />
            </label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="손 포즈 그립 프리셋">
              {TRIPO3D_HAND_POSE_VARIANTS.map((hp) => (
                <button
                  key={hp.id}
                  type="button"
                  data-testid={`tripo3d-hand-pose-${hp.id}`}
                  aria-pressed={handPoseVariantId === hp.id}
                  onClick={() => {
                    setHandPoseVariantId(hp.id);
                    onApplyMannequinBodySliders?.(customizationRecipe.mannequinBodySliders, {
                      posePresetId: hp.mannequinPosePresetId,
                      archetypeLabelKo: `${mannequinHeadRatio.toFixed(1)}등신 커스텀`,
                      motionLabelKo: hp.labelKo,
                    });
                  }}
                  className={`rounded border px-1.5 py-0.5 text-[0.61rem] ${
                    handPoseVariantId === hp.id
                      ? "border-accent bg-accent-soft font-semibold text-fg"
                      : "border-line bg-panel text-fg-2"
                  }`}
                >
                  {hp.labelKo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1 rounded border border-line/70 bg-card px-2 py-1.5 text-[0.62rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div data-testid="tripo3d-customizer-shader-summary" className="font-medium text-fg">
              셰이더·파츠 요약: {customizationRecipe.shaderSummaryKo} · 유효 GLB{" "}
              <code>{customizationRecipe.effectiveGlbUrl}</code>
            </div>
            <a
              href={customizationRecipe.effectiveGlbUrl}
              download={activeMcpModel.fileName}
              data-testid="tripo3d-mcp-direct-glb-download"
              className="rounded border border-accent/60 bg-accent-soft/40 px-2 py-0.5 text-[0.6rem] font-semibold text-accent hover:bg-accent-soft"
            >
              .glb 원본/최적화 파일 다운로드 ({activeMcpModel.fileName})
            </a>
          </div>
          <code
            data-testid="tripo3d-customizer-recipe-readout"
            className="block truncate text-[0.58rem] text-fg-3"
          >
            {customizationRecipe.exportableJson}
          </code>
        </div>
      </div>
    </details>
  );
}
