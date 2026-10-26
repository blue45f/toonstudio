/**
 * VARCO 3D 전체 25개 모듈(812,376 AST 노드) REA 전수 역공학 UI/UX 통합 데크.
 *
 * - Geodesic ExpMap 3D 스티커/데칼 감쇠(`falloffAlphaFromDot`) 및 UV `[0,1]^2` 반평면 다각형 클리핑
 * - 4대 사지(왼팔·오른팔·왼다리·오른다리) 2-Bone IK 체인 자동 탐지·극벡터(`projectedRestBend`)·9단계 웨이트 램프(`WEIGHT_RAMP_GRADIENT`)
 * - CustomWorkflow V2 마그네틱 스냅(`GUIDE_COLOR`)·ELK 계층형 Tidy-Up(`120px / 48px`)·Flow AI Composer(`TOOL_VERBS`)
 * - Universal 3D Agent(`/agent` 30-Tool Sandbox)·External REST API v1/v2(`ENDPOINT_INDEX`)·AFS 파일시스템(`FORMAT_BADGE_BG`)·5종 공식 DCC/엔진 브리지 플러그인
 */

import { useMemo, useState, type CSSProperties, type ReactElement } from "react";

import {
  STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS,
  STUDIO_VARCO3D_FLOW_AGENT_SUGGESTIONS,
  STUDIO_VARCO3D_FORMAT_BADGE_STYLES,
  STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS,
  STUDIO_VARCO3D_STICKER_DECAL_PRESETS,
  STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY,
  STUDIO_VARCO3D_UNIVERSAL_AGENT_TOOLS,
  VARCO3D_TIDY_LAYOUT_CONSTANTS,
  VARCO3D_UNIVERSAL_AGENT_MAX_STEPS,
  buildVarco3dWeightRampCssGradient,
  clipVarco3dPolygonToUnitUvSquare,
  computeVarco3dDecalFalloffAlpha,
  computeVarco3dMagneticNodeSnap,
  computeVarco3dProjectedRestBend,
  computeVarco3dTidyUpLayeredLayout,
  detectVarco3dLimbIkChains,
  formatVarco3dFlowAgentToolPhrase,
  validateVarco3dUniversalAgentGenerate3dCall,
} from "./studio-varco3d-full-platform-engine";

export interface StudioVarco3dFullPlatformDeckProps {
  readonly accordionGroupName: string;
}

const DEFERRED_DECK_STYLE: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto 320px",
};

const SAMPLE_SKELETON_BONES = [
  { name: "mixamorig:Hips", parentName: null },
  { name: "mixamorig:LeftArm", parentName: "mixamorig:Hips" },
  { name: "mixamorig:LeftForeArm", parentName: "mixamorig:LeftArm" },
  { name: "mixamorig:LeftHand", parentName: "mixamorig:LeftForeArm" },
  { name: "mixamorig:RightArm", parentName: "mixamorig:Hips" },
  { name: "mixamorig:RightForeArm", parentName: "mixamorig:RightArm" },
  { name: "mixamorig:RightHand", parentName: "mixamorig:RightForeArm" },
  { name: "mixamorig:LeftUpLeg", parentName: "mixamorig:Hips" },
  { name: "mixamorig:LeftLeg", parentName: "mixamorig:LeftUpLeg" },
  { name: "mixamorig:LeftFoot", parentName: "mixamorig:LeftLeg" },
  { name: "mixamorig:RightUpLeg", parentName: "mixamorig:Hips" },
  { name: "mixamorig:RightLeg", parentName: "mixamorig:RightUpLeg" },
  { name: "mixamorig:RightFoot", parentName: "mixamorig:RightLeg" },
] as const;

export function StudioVarco3dFullPlatformDeck({
  accordionGroupName,
}: StudioVarco3dFullPlatformDeckProps): ReactElement {
  const [decalDotPercent, setDecalDotPercent] = useState<number>(15);
  const [selectedStickerId, setSelectedStickerId] = useState<string>(
    STUDIO_VARCO3D_STICKER_DECAL_PRESETS[0]!.id,
  );
  const [dragNodeX, setDragNodeX] = useState<number>(104);
  const [selectedFlowTool, setSelectedFlowTool] = useState<string>("create_node");
  const [multiviewBackEnabled, setMultiviewBackEnabled] = useState<boolean>(false);
  const [selectedDccPluginId, setSelectedDccPluginId] = useState<string>(
    STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS[0]!.id,
  );
  const [selectedEndpointSlug, setSelectedEndpointSlug] = useState<string>("generate");

  const decalDot = decalDotPercent / 100;
  const decalAlpha = useMemo(() => computeVarco3dDecalFalloffAlpha(decalDot), [decalDot]);
  const weightRampGradient = useMemo(() => buildVarco3dWeightRampCssGradient(), []);
  const detectedLimbChains = useMemo(() => detectVarco3dLimbIkChains(SAMPLE_SKELETON_BONES), []);
  const restBendPole = useMemo(
    () =>
      computeVarco3dProjectedRestBend(
        { x: 0, y: 120, z: 0 },
        { x: 0, y: 85, z: 18 },
        { x: 0, y: 50, z: 0 },
      ),
    [],
  );

  const clippedUvQuad = useMemo(
    () =>
      clipVarco3dPolygonToUnitUvSquare([
        { u: -0.15, v: 0.2 },
        { u: 0.85, v: 0.2 },
        { u: 0.85, v: 1.15 },
        { u: -0.15, v: 1.15 },
      ]),
    [],
  );

  const magneticSnap = useMemo(
    () =>
      computeVarco3dMagneticNodeSnap(
        { id: "drag-node", x: dragNodeX, y: 42, width: 200, height: 120 },
        [{ id: "anchor-node", x: 100, y: 40, width: 200, height: 120 }],
        8,
      ),
    [dragNodeX],
  );

  const tidyLayout = useMemo(
    () =>
      computeVarco3dTidyUpLayeredLayout(
        [
          { id: "n1", x: 20, y: 40, width: 200, height: 120 },
          { id: "n2", x: 50, y: 90, width: 200, height: 120 },
        ],
        [{ source: "n1", target: "n2" }],
      ),
    [],
  );

  const flowToolPhrase = useMemo(
    () => formatVarco3dFlowAgentToolPhrase(selectedFlowTool, 2, false),
    [selectedFlowTool],
  );

  const agentValidation = useMemo(
    () =>
      validateVarco3dUniversalAgentGenerate3dCall({
        frontImageId: "img_front_01",
        ...(multiviewBackEnabled ? { backImageId: "img_back_01" } : {}),
        polygonCount: 30_000,
        tPose: true,
        pbr: true,
      }),
    [multiviewBackEnabled],
  );

  const selectedDccPlugin = useMemo(
    () =>
      STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS.find((p) => p.id === selectedDccPluginId) ??
      STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS[0]!,
    [selectedDccPluginId],
  );

  const selectedEndpoint = useMemo(
    () =>
      STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS.find((ep) => ep.slug === selectedEndpointSlug) ??
      STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS[0]!,
    [selectedEndpointSlug],
  );

  return (
    <details
      name={accordionGroupName}
      data-testid="varco3d-details-full-platform-rea-deck"
      style={DEFERRED_DECK_STYLE}
      className="rounded-xl border border-line/60 bg-card/90 px-3 py-2 shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.28)]"
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-semibold text-fg">
        <span>
          REA 전체 25모듈 역공학 스위트: Geodesic ExpMap 데칼 · 4-사지 IK 자동 탐지 · 마그네틱 스냅 &
          Tidy-Up · Universal/Flow Agent ({STUDIO_VARCO3D_UNIVERSAL_AGENT_TOOLS.length}툴) · AFS &
          tRPC ({STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.totalProcedures}종)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-[4px] bg-[rgba(84,231,250,0.1)] px-[6px] py-[3px] text-[9px] font-semibold leading-none text-[#54e7fa]">
            25 MODULES · 812K AST
          </span>
          <span className="rounded-full bg-[#163D2F] px-2 py-0.5 text-[10px] font-semibold text-[#41D18D]">
            141 tRPC · 30 AGENT TOOLS
          </span>
        </span>
      </summary>

      <div className="mt-2 grid grid-cols-1 gap-2.5 text-[0.72rem] text-fg-2 md:grid-cols-3">
        {/* Column 1: Geodesic ExpMap Decal & 4-Limb IK Chain Detector + Weight Ramp */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-fg">
            Geodesic ExpMap 데칼 투영 & 4대 사지 IK 체인 ({detectedLimbChains.length}종)
          </span>
          <div
            data-testid="varco3d-weight-ramp-gradient-bar"
            style={{ background: weightRampGradient }}
            className="h-2.5 w-full rounded-full border border-white/20"
            title="WEIGHT_RAMP_GRADIENT (weightHeatRgb 9-stop)"
          />
          <label className="flex items-center justify-between gap-2 text-[0.65rem]">
            <span>데칼 법선 내적 (dot={decalDot.toFixed(2)})</span>
            <input
              type="range"
              aria-label="데칼 법선 내적 감쇠"
              data-testid="varco3d-decal-dot-slider"
              min={-50}
              max={100}
              value={decalDotPercent}
              onChange={(e) => setDecalDotPercent(Number(e.target.value))}
              className="w-24 accent-[#338FFF]"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {STUDIO_VARCO3D_STICKER_DECAL_PRESETS.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                data-testid={`varco3d-sticker-preset-${sticker.id}`}
                aria-pressed={selectedStickerId === sticker.id}
                onClick={() => setSelectedStickerId(sticker.id)}
                className={`rounded border px-1.5 py-0.5 text-[0.63rem] ${
                  selectedStickerId === sticker.id
                    ? "border-[#338FFF] bg-[#338FFF]/20 font-semibold text-fg"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {sticker.labelKo}
              </button>
            ))}
          </div>
          <span data-testid="varco3d-decal-ik-readout" className="text-[0.64rem] text-fg-3">
            ExpMap 감쇠 알파: <strong>{(decalAlpha * 100).toFixed(1)}%</strong> · UV 클리핑 정점:{" "}
            <strong>{clippedUvQuad.length}개</strong> · 사지 IK:{" "}
            <code>{detectedLimbChains.map((c) => c.id).join(", ")}</code> · 극벡터:{" "}
            <code>
              ({restBendPole.x}, {restBendPole.y}, {restBendPole.z})
            </code>
          </span>
        </div>

        {/* Column 2: CustomWorkflow V2 Magnetic Snap, Tidy-Up Layout & Flow/Universal Agent */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-fg">
            마그네틱 정렬 스냅 ({VARCO3D_TIDY_LAYOUT_CONSTANTS.GUIDE_COLOR}) & Flow/Universal Agent (
            {STUDIO_VARCO3D_UNIVERSAL_AGENT_TOOLS.length}툴 · maxSteps={VARCO3D_UNIVERSAL_AGENT_MAX_STEPS})
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="varco3d-snap-test-toggle"
              onClick={() => setDragNodeX((prev) => (prev === 104 ? 140 : 104))}
              className="rounded border border-line bg-panel px-2 py-0.5 text-[0.64rem] text-fg"
            >
              드래그 X={dragNodeX}px 스냅 테스트
            </button>
            <select
              aria-label="Flow 에이전트 툴 선택"
              data-testid="varco3d-flow-agent-tool-select"
              value={selectedFlowTool}
              onChange={(e) => setSelectedFlowTool(e.target.value)}
              className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] text-fg"
            >
              {["create_node", "connect_edge", "delete_node", "move_node", "estimate_run"].map(
                (tName) => (
                  <option key={tName} value={tName}>
                    {tName}
                  </option>
                ),
              )}
            </select>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[0.64rem]">
            <input
              type="checkbox"
              data-testid="varco3d-universal-agent-multiview-toggle"
              checked={multiviewBackEnabled}
              onChange={(e) => setMultiviewBackEnabled(e.target.checked)}
            />
            <span>Universal Agent 멀티뷰(Back) + T-Pose/PBR 제약 검사</span>
          </label>
          <span data-testid="varco3d-snap-tidy-agent-readout" className="text-[0.64rem] text-fg-3">
            스냅 X: <strong>{magneticSnap.snappedX}px</strong> (가이드{" "}
            <strong>{magneticSnap.guides.length}개</strong>) · Tidy n2.x:{" "}
            <strong>{tidyLayout.get("n2")?.x ?? 0}px</strong> · Flow 문구:{" "}
            <code>{flowToolPhrase}</code> · Agent 상태:{" "}
            <strong>{agentValidation.ok ? "VALID" : agentValidation.error}</strong>
          </span>
          <span className="truncate text-[0.62rem] text-fg-3">
            추천 프롬프트: <code>{STUDIO_VARCO3D_FLOW_AGENT_SUGGESTIONS[0]}</code>
          </span>
        </div>

        {/* Column 3: AFS Format Badges, External API v1/v2 & 5 Official DCC/Engine Plugins */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-fg">
            AFS 포맷 배지 · External API ({STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS.length}종) & 공식
            DCC/엔진 플러그인 ({STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS.length}종)
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {(
              Object.entries(STUDIO_VARCO3D_FORMAT_BADGE_STYLES) as ReadonlyArray<
                readonly [string, string]
              >
            ).map(([formatKey, bgClass]) => (
              <span
                key={formatKey}
                data-testid={`varco3d-afs-badge-${formatKey}`}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${bgClass}`}
              >
                {formatKey}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <select
              aria-label="공식 DCC 및 게임엔진 플러그인 선택"
              data-testid="varco3d-official-dcc-plugin-select"
              value={selectedDccPluginId}
              onChange={(e) => setSelectedDccPluginId(e.target.value)}
              className="min-w-0 flex-1 rounded border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] text-fg"
            >
              {STUDIO_VARCO3D_OFFICIAL_DCC_PLUGINS.map((plug) => (
                <option key={plug.id} value={plug.id}>
                  {plug.labelKo} ({plug.version})
                </option>
              ))}
            </select>
            <select
              aria-label="External API 엔드포인트 선택"
              data-testid="varco3d-external-api-endpoint-select"
              value={selectedEndpointSlug}
              onChange={(e) => setSelectedEndpointSlug(e.target.value)}
              className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] text-fg"
            >
              {STUDIO_VARCO3D_EXTERNAL_API_ENDPOINTS.map((ep) => (
                <option key={`${ep.method}-${ep.path}`} value={ep.slug}>
                  {ep.method} {ep.path}
                </option>
              ))}
            </select>
          </div>
          <code
            data-testid="varco3d-dcc-plugin-download-readout"
            className="truncate text-[0.62rem] text-fg-3"
          >
            {selectedDccPlugin.fileName} → {selectedDccPlugin.downloadPath}
          </code>
          <span
            data-testid="varco3d-external-api-trpc-readout"
            className="text-[0.64rem] text-fg-3"
          >
            API: <code>{selectedEndpoint.method} {selectedEndpoint.path}</code> (
            {selectedEndpoint.summary}) · tRPC:{" "}
            <strong>
              {STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.totalRouters}라우터 /{" "}
              {STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.totalProcedures}프로시저
            </strong>{" "}
            (릴리즈 <code>{STUDIO_VARCO3D_TRPC_ROUTER_SUMMARY.sentryRelease}</code>)
          </span>
        </div>
      </div>
    </details>
  );
}
