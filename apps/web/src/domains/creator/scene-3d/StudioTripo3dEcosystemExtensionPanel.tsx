import { useMemo, useState, type ReactElement } from "react";

import type { ShaperBodySliderValues } from "./studio-shaper-model";
import {
  BLEND_AI_SCALE_GUIDES,
  evaluateTripoStudioWorkspaceGuard,
  GLBFORGE_EXTRUDE_PRESETS,
  GLBFORGE_PROFILES,
  MESHY_CREATIVE_PRODUCTS,
  MESHY_SLICERS,
  planWebtoonSignageReliefExtrusion,
  simulateGlbForgeAuditAndOptimization,
  TRIPO_STUDIO_12_WORKSPACES,
  TRIPO_TEXT_TO_MOTION_PRESETS,
  type GlbForgeBudgetProfileId,
  type ReliefExtrudePresetId,
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

  return (
    <details
      name={accordionGroupName}
      data-testid="tripo3d-details-ecosystem-mcp"
      className="rounded-lg border border-line/60 bg-card px-3 py-2"
    >
      <summary className="cursor-pointer font-semibold text-fg">
        3D MCP 생태계 확장 허브 (Tripo 12-Workspace · GLBForge 17-Rule 린터 & 2D→3D 간판 압출 ·
        Meshy 7 크리에이티브 랩 · VRM/Blend-AI 스케일)
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
    </details>
  );
}
