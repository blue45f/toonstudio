import { useMemo, useState, type ReactElement } from "react";

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
    </>
  );
}
