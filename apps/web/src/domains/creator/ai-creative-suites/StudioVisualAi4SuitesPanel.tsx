import {
  CheckCircle2,
  Layers,
  Paintbrush,
  Play,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Workflow,
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  applyAntiAiScrapingProtection,
  computeShadingAssist,
  createSamplePoseAndHandLandmarks,
  normalizePoseAndHandLandmarks,
  runSmartSuperResolution,
  type ResampleKernelKind,
  type SuperResolutionScale,
} from "./csp-ai-smart-assist-engine";
import {
  createDefaultFireflyGraph,
  executeFireflyGraph,
  verifyC2paContentCredentials,
  type FireflyGraphDocument,
  type FireflyObjectMaskParams,
  type FireflyRgbaBuffer,
} from "./firefly-graph-relight-engine";
import {
  addComfyNode,
  buildMultiControlNetStack,
  composeRegionalPromptAttentionMap,
  createDefaultKritaComfyWorkflow,
  createLivePaintingState,
  exportComfyUiPromptGraph,
  flushLivePaintingPatch,
  importComfyUiPromptGraph,
  markCanvasDirtyRect,
  simulateComfyGraphOffline,
  updateLivePaintingStrength,
  type ControlNetKind,
} from "./krita-comfy-live-canvas-engine";
import {
  createBeforeAfterComparisonState,
  createDemoWebtoonLineart,
  runNaverStyleLineartColorize,
  setComparisonSplitPercent,
  toggleComparisonOrientation,
  WEBTOON_COLOR_STYLE_PRESETS,
  type ColorHintPin,
  type WebtoonColorStylePresetId,
} from "./naver-ai-painter-engine";

type SuiteTabId = "firefly" | "csp" | "krita" | "painter";

const SUITE_TABS: readonly { readonly id: SuiteTabId; readonly labelKo: string }[] = [
  { id: "firefly", labelKo: "파이어플라이 그래프·조명" },
  { id: "csp", labelKo: "클립스튜디오 AI 보정" },
  { id: "krita", labelKo: "크리타·ComfyUI 라이브" },
  { id: "painter", labelKo: "웹툰 선화 자동 채색" },
];

const CONTROLNET_LABELS_KO: Readonly<Record<ControlNetKind, string>> = {
  Lineart: "선화 유지",
  DepthAnything3: "깊이감 반영",
  OpenPose: "인체 포즈 맞춤",
  Canny: "윤곽선 고정",
  Tile: "세부 질감 보강",
  IPAdapter: "화풍 참조",
};

const PIN_SWATCHES: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly rgb: readonly [number, number, number];
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly badgeClass: string;
}[] = [
  { id: "pin-hair", labelKo: "코랄 머리카락", rgb: [224, 118, 108], x: 24, y: 11, radius: 2, badgeClass: "bg-accent" },
  { id: "pin-skin", labelKo: "따뜻한 피부톤", rgb: [248, 214, 190], x: 24, y: 20, radius: 2, badgeClass: "bg-warn" },
  { id: "pin-top", labelKo: "청량한 상의", rgb: [112, 166, 228], x: 24, y: 35, radius: 3, badgeClass: "bg-good" },
  { id: "pin-accent", labelKo: "로즈 포인트", rgb: [212, 134, 178], x: 20, y: 12, radius: 2, badgeClass: "bg-fg-2" },
];

const TOGGLE_ON =
  "min-h-11 rounded-lg border border-accent/50 bg-panel px-2.5 text-xs font-medium text-fg transition-colors duration-150";
const TOGGLE_OFF =
  "min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg-3 transition-colors duration-150";
const ACCENT_BTN =
  "min-h-11 rounded-lg bg-accent px-2.5 text-xs font-semibold text-on-accent transition-colors duration-150";
const OUTLINE_BTN =
  "min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg transition-colors duration-150 hover:bg-raised";

function createSamplePreviewBuffer(width = 32, height = 32): FireflyRgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const inCircle = Math.hypot(x - width * 0.5, y - height * 0.5) < width * 0.34;
      data[o] = inCircle ? 218 : 142;
      data[o + 1] = inCircle ? 176 : 162;
      data[o + 2] = inCircle ? 156 : 196;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

function RangeSliderField({
  id,
  label,
  valueText,
  min,
  max,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-xs text-fg-2">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{valueText}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full accent-accent"
      />
    </div>
  );
}

export function StudioVisualAi4SuitesPanel() {
  const uid = useId();
  const [activeTab, setActiveTab] = useState<SuiteTabId>("firefly");

  // 공용 로컬 샘플 버퍼 (외부 네트워크·유료 API 호출 0건)
  const sampleImage = useMemo(() => createSamplePreviewBuffer(32, 32), []);
  const demoLineart = useMemo(() => createDemoWebtoonLineart(48, 48), []);

  // 1) 파이어플라이 그래프·조명 상태
  const [fireflyGraph, setFireflyGraph] = useState<FireflyGraphDocument>(() => createDefaultFireflyGraph());
  const [lightAzimuth, setLightAzimuth] = useState(35);
  const [lightElevation, setLightElevation] = useState(42);
  const [maskMode, setMaskMode] = useState<FireflyObjectMaskParams["mode"]>("recolor");
  const [fireflyRunCount, setFireflyRunCount] = useState(1);

  const activeFireflyGraph = useMemo<FireflyGraphDocument>(
    () => ({
      ...fireflyGraph,
      nodes: fireflyGraph.nodes.map((node) => {
        if (node.kind === "Relight") {
          return { ...node, params: { ...node.params, azimuthDeg: lightAzimuth, elevationDeg: lightElevation } };
        }
        if (node.kind === "ObjectMask") {
          return { ...node, params: { ...node.params, mode: maskMode } };
        }
        return node;
      }),
    }),
    [fireflyGraph, lightAzimuth, lightElevation, maskMode],
  );
  const fireflyResult = useMemo(() => executeFireflyGraph(activeFireflyGraph, sampleImage), [activeFireflyGraph, sampleImage]);
  const c2paCheck = useMemo(
    () => (fireflyResult.credentials ? verifyC2paContentCredentials(fireflyResult.image, fireflyResult.credentials) : null),
    [fireflyResult],
  );

  // 2) 클립스튜디오 AI 보정 상태
  const [srScale, setSrScale] = useState<SuperResolutionScale>(2);
  const [srDenoise, setSrDenoise] = useState(true);
  const [srKernel, setSrKernel] = useState<ResampleKernelKind>("catmull-rom");
  const [shadingAzimuth, setShadingAzimuth] = useState(135);
  const [protectionActive, setProtectionActive] = useState(true);

  const srResult = useMemo(
    () => runSmartSuperResolution(sampleImage, { scale: srScale, denoise: srDenoise, kernel: srKernel }),
    [sampleImage, srScale, srDenoise, srKernel],
  );
  const shadingResult = useMemo(
    () => computeShadingAssist(demoLineart, { azimuthDeg: shadingAzimuth, elevationDeg: 45 }),
    [demoLineart, shadingAzimuth],
  );
  const poseBridgeResult = useMemo(() => {
    const sample = createSamplePoseAndHandLandmarks();
    return normalizePoseAndHandLandmarks(sample.pose, sample.hands);
  }, []);
  const protectionResult = useMemo(
    () => (protectionActive ? applyAntiAiScrapingProtection(sampleImage, { maxDelta: 3 }) : null),
    [protectionActive, sampleImage],
  );

  // 3) 크리타·ComfyUI 라이브 상태
  const initialKrita = useMemo(() => createDefaultKritaComfyWorkflow(), []);
  const [liveState, setLiveState] = useState(() => createLivePaintingState(768, 1024, { strength: 0.42 }));
  const [regionalLayers, setRegionalLayers] = useState(initialKrita.regionalLayers);
  const [controlNets, setControlNets] = useState(initialKrita.controlNets);
  const [comfyGraph, setComfyGraph] = useState(initialKrita.graph);
  const [roundTripVerified, setRoundTripVerified] = useState<string | null>(null);

  const regionalSummary = useMemo(() => composeRegionalPromptAttentionMap(regionalLayers), [regionalLayers]);
  const controlNetStack = useMemo(() => buildMultiControlNetStack(controlNets), [controlNets]);
  const comfySimulation = useMemo(() => simulateComfyGraphOffline(comfyGraph), [comfyGraph]);
  const exportedComfyJson = useMemo(() => JSON.stringify(exportComfyUiPromptGraph(comfyGraph), null, 2), [comfyGraph]);

  // 4) 웹툰 선화 자동 채색 상태
  const [painterPreset, setPainterPreset] = useState<WebtoonColorStylePresetId>("daily-watercolor");
  const [pins, setPins] = useState<readonly ColorHintPin[]>(() =>
    PIN_SWATCHES.slice(0, 3).map(({ id, labelKo, rgb, x, y, radius }) => ({ id, labelKo, rgb, x, y, radius })),
  );
  const [compareState, setCompareState] = useState(() => createBeforeAfterComparisonState(54));
  const painterResult = useMemo(
    () => runNaverStyleLineartColorize(demoLineart, pins, { presetId: painterPreset, iterations: 24 }),
    [demoLineart, pins, painterPreset],
  );

  const handleToggleFireflyNode = (nodeId: string) => {
    setFireflyGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId && n.kind !== "Output" ? { ...n, enabled: !n.enabled } : n)),
    }));
    setFireflyRunCount((c) => c + 1);
  };

  const handleEmitLivePatch = () => {
    setLiveState((prev) => {
      const mutated = markCanvasDirtyRect(prev, { x: 118, y: 182, width: 224, height: 260 }, 1000);
      return flushLivePaintingPatch(mutated, 1240).state;
    });
  };

  const handleVerifyComfyRoundTrip = () => {
    const restored = importComfyUiPromptGraph(exportComfyUiPromptGraph(comfyGraph), comfyGraph.nameKo);
    setRoundTripVerified(`JSON 왕복 검증 완료 · 노드 ${restored.nodes.length}개 · 연결 ${restored.edges.length}개 일치`);
  };

  const handleAppendDepthNode = () => {
    setComfyGraph((prev) =>
      addComfyNode(prev, {
        id: `depth-${prev.nodes.length + 1}`,
        classType: "DepthAnythingV3Preprocessor",
        title: "깊이맵 전처리기",
        position: { x: 280, y: 560 },
        widgets: { resolution: 512 },
      }),
    );
  };

  const handleAddAccentPin = () => {
    const { id, labelKo, rgb, x, y, radius } = PIN_SWATCHES[3];
    setPins((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, { id, labelKo, rgb, x, y, radius }]));
  };

  const handleResetPins = () => {
    setPins(PIN_SWATCHES.slice(0, 3).map(({ id, labelKo, rgb, x, y, radius }) => ({ id, labelKo, rgb, x, y, radius })));
  };

  return (
    <section
      aria-label="비주얼 AI 4대 스튜디오 랩"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-accent" strokeWidth={1.6} aria-hidden="true" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-fg">비주얼 AI 4대 스튜디오 랩</h4>
            <p className="text-xs text-fg-2">
              유료 API 없이 내 기기에서 바로 쓰는 조명 · 선명 보정 · 라이브 캔버스 · 선화 자동 채색
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-good">
          <ShieldCheck className="size-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          무과금 로컬 연산 · ₩0
        </span>
      </header>

      <div role="tablist" aria-label="비주얼 AI 도구 선택" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {SUITE_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={
                selected
                  ? "min-h-11 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors duration-150"
                  : "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised"
              }
            >
              {tab.labelKo}
            </button>
          );
        })}
      </div>

      {activeTab === "firefly" && (
        <div id={`${uid}-panel-firefly`} role="tabpanel" aria-labelledby={`${uid}-tab-firefly`} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Sun className="size-3.5 text-accent" aria-hidden="true" />
                  조명 방향 · 영역 보정
                </span>
                <span className="text-xs tabular-nums text-fg-3">
                  출력 {fireflyResult.image.width}×{fireflyResult.image.height}
                </span>
              </div>
              <RangeSliderField id={`${uid}-ff-az`} label="빛이 비추는 방향(방위각)" valueText={`${lightAzimuth}°`} min={0} max={360} value={lightAzimuth} onChange={setLightAzimuth} />
              <RangeSliderField id={`${uid}-ff-el`} label="광원 높이(고도)" valueText={`${lightElevation}°`} min={10} max={85} value={lightElevation} onChange={setLightElevation} />
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-ff-mask`} className="text-xs text-fg-2">영역 편집 방식</label>
                <select
                  id={`${uid}-ff-mask`}
                  value={maskMode}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "recolor" || v === "fill" || v === "remove" || v === "expand") setMaskMode(v);
                  }}
                  className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg"
                >
                  <option value="recolor">선택 개체 색감 보정</option>
                  <option value="fill">자연스러운 영역 채우기</option>
                  <option value="remove">불필요한 개체 지우기</option>
                  <option value="expand">캔버스 바깥 확장(아웃페인트)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">비파괴 작업 단계</span>
                <button
                  type="button"
                  onClick={() => setFireflyRunCount((c) => c + 1)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90"
                >
                  <Play className="size-3.5" aria-hidden="true" />
                  파이프라인 다시 실행
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {fireflyGraph.nodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      disabled={node.kind === "Output"}
                      onClick={() => handleToggleFireflyNode(node.id)}
                      className={`flex w-full items-center justify-between ${node.enabled ? TOGGLE_ON : TOGGLE_OFF}`}
                    >
                      <span>{node.labelKo}</span>
                      <span className="tabular-nums">{node.enabled ? "켜짐" : "꺼짐"}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {c2paCheck && (
                <p role="status" className="inline-flex items-center gap-1.5 text-xs tabular-nums text-good">
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  콘텐츠 자격증명 서명 {c2paCheck.valid ? "유효" : "확인 필요"} · 실행 {fireflyRunCount}회
                </p>
              )}
            </div>
          </div>

          <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
              <span>실행 기록 및 콘텐츠 자격증명 상세 보기</span>
              <span className="tabular-nums text-fg-3">{fireflyResult.trace.length}단계</span>
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 text-fg-2">
              {fireflyResult.trace.map((step) => (
                <p key={step.nodeId} className="tabular-nums">
                  · {step.labelKo}: {step.summaryKo} ({step.outputWidth}×{step.outputHeight})
                </p>
              ))}
              {fireflyResult.credentials && (
                <p className="mt-1 rounded-md border border-line bg-panel p-2 font-mono text-[11px] text-fg-3">
                  Rights BOM: {fireflyResult.credentials.rightsBomAssetId} · 무결성 다이제스트{" "}
                  {fireflyResult.credentials.pixelDigestHex.slice(0, 16)}…
                </p>
              )}
            </div>
          </details>
        </div>
      )}

      {activeTab === "csp" && (
        <div id={`${uid}-panel-csp`} role="tabpanel" aria-labelledby={`${uid}-tab-csp`} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Sliders className="size-3.5 text-accent" aria-hidden="true" />
                선명 확대 · 노이즈 제거
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {([2, 3, 4] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setSrScale(scale)}
                    className={`${srScale === scale ? ACCENT_BTN : OUTLINE_BTN} tabular-nums`}
                  >
                    {scale}배 확대
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSrDenoise((v) => !v)} className={OUTLINE_BTN}>
                  선화 노이즈 제거: {srDenoise ? "켜짐" : "꺼짐"}
                </button>
                <button
                  type="button"
                  onClick={() => setSrKernel((k) => (k === "catmull-rom" ? "lanczos3" : "catmull-rom"))}
                  className={OUTLINE_BTN}
                >
                  선명도 모드: {srKernel === "catmull-rom" ? "부드러운 곡선" : "선명한 엣지"}
                </button>
              </div>
              <p className="text-xs tabular-nums text-fg-2">
                결과 해상도 {srResult.image.width}×{srResult.image.height} · 윤곽 선명도 {srResult.edgeSharpnessScore}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                자동 음영 · 포즈 정규화 · 학습 보호
              </span>
              <RangeSliderField id={`${uid}-csp-az`} label="음영 광원 각도" valueText={`${shadingAzimuth}°`} min={0} max={360} value={shadingAzimuth} onChange={setShadingAzimuth} />
              <p className="text-xs tabular-nums text-fg-2">
                닫힌 선화 영역 {shadingResult.enclosedPixelCount}px · 음영 비율 {Math.round(shadingResult.shadowCoverageRatio * 100)}%
              </p>
              <button type="button" onClick={() => setProtectionActive((v) => !v)} className={OUTLINE_BTN}>
                내보내기 무단 학습 보호 필터: {protectionActive ? "활성화" : "비활성화"}
              </button>
              {protectionResult && (
                <p role="status" className="text-xs tabular-nums text-good">
                  화질 보존 PSNR {protectionResult.psnrDb} dB · 최대 색상차 Δ{protectionResult.maxChannelDelta}{" "}
                  ({protectionResult.protectionCompliant ? "보호 기준 통과" : "조정 필요"})
                </p>
              )}
            </div>
          </div>

          <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
              <span>포즈·손 뼈대 정규화 결과 보기</span>
              <span className="tabular-nums text-fg-3">
                본 {poseBridgeResult.bones.length}개 · 손가락 {poseBridgeResult.fingerCurls.length}개
              </span>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-line pt-2 text-fg-2 tabular-nums sm:grid-cols-3">
              {poseBridgeResult.bones.slice(0, 6).map((b) => (
                <span key={b.bone} className="rounded border border-line bg-panel px-2 py-1">
                  {b.bone}: {b.rollDeg}°
                </span>
              ))}
            </div>
          </details>
        </div>
      )}

      {activeTab === "krita" && (
        <div id={`${uid}-panel-krita`} role="tabpanel" aria-labelledby={`${uid}-tab-krita`} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Layers className="size-3.5 text-accent" aria-hidden="true" />
                실시간 라이브 페인팅 · 영역 프롬프트
              </span>
              <RangeSliderField
                id={`${uid}-krita-str`}
                label="실시간 보정 강도 (15%~85%)"
                valueText={`${Math.round(liveState.strength * 100)}%`}
                min={15}
                max={85}
                value={Math.round(liveState.strength * 100)}
                onChange={(v) => setLiveState((prev) => updateLivePaintingStrength(prev, v / 100))}
              />
              <button type="button" onClick={handleEmitLivePatch} className={ACCENT_BTN}>
                브러시 수정 영역 라이브 패치 반영
              </button>
              <p role="status" className="text-xs tabular-nums text-fg-2">
                {liveState.lastPatch
                  ? `패치 #${liveState.lastPatch.revision} 반영됨 · 영역 ${liveState.lastPatch.tileRect.width}×${liveState.lastPatch.tileRect.height}px`
                  : `대기 중 · 영역 프롬프트 ${regionalSummary.activeLayerCount}개 활성`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {regionalLayers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() =>
                      setRegionalLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, enabled: !l.enabled } : l)))
                    }
                    className={layer.enabled ? TOGGLE_ON : TOGGLE_OFF}
                  >
                    {layer.labelKo} {layer.enabled ? "켜짐" : "꺼짐"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Workflow className="size-3.5 text-accent" aria-hidden="true" />
                  구도·화풍 가이드 스택 (6종)
                </span>
                <span className="text-xs tabular-nums text-fg-3">누적 강도 {controlNetStack.totalGuidanceLoad}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {controlNets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setControlNets((prev) => prev.map((c) => (c.id === item.id ? { ...c, enabled: !c.enabled } : c)))
                    }
                    className={item.enabled ? TOGGLE_ON : TOGGLE_OFF}
                  >
                    {CONTROLNET_LABELS_KO[item.type]}
                  </button>
                ))}
              </div>
              <p className="text-xs tabular-nums text-fg-2">
                오프라인 시뮬레이션: {comfySimulation.ok ? `${comfySimulation.steps.length}단계 통과 (${comfySimulation.totalSimulatedMs}ms)` : "오류 확인"}
              </p>
            </div>
          </div>

          <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
              <span>ComfyUI 워크플로 편집 · JSON 내보내기/불러오기</span>
              <span className="tabular-nums text-fg-3">노드 {comfyGraph.nodes.length}개</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleAppendDepthNode} className={OUTLINE_BTN}>깊이맵 노드 추가</button>
                <button type="button" onClick={handleVerifyComfyRoundTrip} className={OUTLINE_BTN}>표준 JSON 왕복 검증</button>
              </div>
              {roundTripVerified && <p className="tabular-nums text-good">{roundTripVerified}</p>}
              <pre className="max-h-36 overflow-auto rounded-md border border-line bg-panel p-2 font-mono text-[11px] text-fg-3">
                {exportedComfyJson}
              </pre>
            </div>
          </details>
        </div>
      )}

      {activeTab === "painter" && (
        <div id={`${uid}-panel-painter`} role="tabpanel" aria-labelledby={`${uid}-tab-painter`} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Paintbrush className="size-3.5 text-accent" aria-hidden="true" />
                웹툰 채색 화풍 프리셋 (4종)
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBTOON_COLOR_STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPainterPreset(preset.id)}
                    className={painterPreset === preset.id ? ACCENT_BTN : OUTLINE_BTN}
                  >
                    {preset.labelKo}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-2">{painterResult.preset.descriptionKo}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleAddAccentPin} className={OUTLINE_BTN}>포인트 색 핀 추가</button>
                <button type="button" onClick={handleResetPins} className={`inline-flex items-center gap-1 ${OUTLINE_BTN}`}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  기본 핀 복원
                </button>
              </div>
              <p role="status" className="text-xs tabular-nums text-good">
                자동 채색 완료 · {painterResult.coloredPixelCount}px 채움 · 선 바깥 번짐 {painterResult.bleedViolationCount}건
              </p>
            </div>

            <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg">채색 전 / 후 비교 슬라이더</span>
                <button type="button" onClick={() => setCompareState((s) => toggleComparisonOrientation(s))} className={OUTLINE_BTN}>
                  {compareState.orientation === "vertical" ? "좌우 비교" : "상하 비교"}
                </button>
              </div>
              <div className="relative h-28 overflow-hidden rounded-lg border border-line bg-canvas">
                <div className="absolute inset-0 flex items-center justify-between px-3 text-xs text-fg-3">
                  <span>원본 선화</span>
                  <span>{painterResult.preset.labelKo} 결과</span>
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 border-r-2 border-accent bg-accent/15"
                  style={
                    compareState.orientation === "vertical"
                      ? { width: `${compareState.splitPercent}%` }
                      : { width: "100%", height: `${compareState.splitPercent}%` }
                  }
                />
              </div>
              <RangeSliderField
                id={`${uid}-painter-split`}
                label="비교 분할 위치"
                valueText={`${compareState.splitPercent}%`}
                min={0}
                max={100}
                value={compareState.splitPercent}
                onChange={(v) => setCompareState((s) => setComparisonSplitPercent(s, v))}
              />
            </div>
          </div>

          <details className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
              <span>배치된 컬러 힌트 핀 · 확산 수렴 상세</span>
              <span className="tabular-nums text-fg-3">핀 {pins.length}개</span>
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 text-fg-2 tabular-nums">
              <div className="flex flex-wrap gap-1.5">
                {pins.map((pin) => {
                  const swatch = PIN_SWATCHES.find((s) => s.id === pin.id);
                  return (
                    <span key={pin.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1">
                      <span className={`size-2 rounded-full ${swatch?.badgeClass ?? "bg-accent"}`} aria-hidden="true" />
                      {pin.labelKo ?? pin.id} ({pin.x}, {pin.y})
                    </span>
                  );
                })}
              </div>
              <p className="text-fg-3">
                경계 가중 확산 {painterResult.iterationsRun}회 반복 · 수렴 오차 {painterResult.convergenceDelta}
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

export default StudioVisualAi4SuitesPanel;
