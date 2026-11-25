/**
 * Wave 55D — Rights-BOM 클린 절차적 웹툰 에셋·재질·3D 소품 자동 합성 그래프 스튜디오 제어판.
 *
 * - 6종 웹툰 실전 절차적 에셋 프리셋(고딕 아치·한옥 기와·서울 골목·판타지 마법진·만화 수풀·심리스 한지/석재 PBR)
 * - 결정론적 Seed 입력·변주, LOD(1~4), 마모도, 선화 두께, 탈-바이올렛 5안료 팔레트, 3채널(통합/LT 선화/PBR 법선·거칠기) 제어
 * - 순수 시맨틱 SVG 라이브 합성 캔버스 + 6단계 비순환 합성 DAG 요약(OKLCH·currentColor 전용, 원시 색·바이올렛 0%)
 * - Rights-BOM 클린 증명 배지·외부 Fab/Megascans 원시 재배포 금지 경고·SVG/JSON 복사 및 미리보기
 */

import {
  AlertTriangle, Box, CheckCircle2, Code2, Copy, FileCode2, GitBranch, Layers, Palette, RotateCcw, ShieldCheck, Shuffle, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  PIGMENT_HARMONIES, PROCEDURAL_ASSET_RECIPES, exportProceduralAssetManifestJson, exportSynthesizedAssetSvg,
  formatOklch, getPigmentHarmony, getProceduralAssetRecipe, nextDeterministicSeed, normalizeSeed,
  resolveChannelElementStyle, synthesizeProceduralAsset,
  type ComplexityLod, type DagPipelineNode, type PigmentHarmonyId, type PreviewChannelId,
  type ProceduralAssetRecipeId, type ProceduralAssetSynthInput, type ProceduralAssetSynthResult, type Vec2,
} from "./procedural-asset-synth-engine";

export interface StudioProceduralAssetSynthPanelProps {
  readonly initialRecipeId?: ProceduralAssetRecipeId;
  readonly initialSeed?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onAssetSynthesized?: (result: ProceduralAssetSynthResult) => void;
  readonly onExportSvg?: (svg: string, result: ProceduralAssetSynthResult) => void;
  readonly onExportJson?: (json: string, result: ProceduralAssetSynthResult) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_HUD_BG = formatOklch({ l: 0.19, c: 0.016, h: 236 }, 0.86);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.006, h: 86 });
const SVG_LT_PAPER = formatOklch({ l: 0.985, c: 0.004, h: 86 });
const SVG_PBR_CANVAS = formatOklch({ l: 0.22, c: 0.024, h: 222 });
const SVG_DAG_BG = formatOklch({ l: 0.96, c: 0.008, h: 90 });
const SVG_DAG_NODE_BG = formatOklch({ l: 0.99, c: 0.004, h: 84 });
const SVG_DAG_NODE_BORDER = formatOklch({ l: 0.56, c: 0.11, h: 215 });
const SVG_DAG_BOM_BORDER = formatOklch({ l: 0.54, c: 0.125, h: 156 });
const SVG_DAG_EDGE = formatOklch({ l: 0.48, c: 0.045, h: 226 });
const SVG_DAG_TEXT = formatOklch({ l: 0.22, c: 0.018, h: 238 });
const SVG_DAG_SUB = formatOklch({ l: 0.44, c: 0.025, h: 232 });

const LOD_LEVELS: readonly { readonly lod: ComplexityLod; readonly resLabel: string }[] = [
  { lod: 1, resLabel: "512px" },
  { lod: 2, resLabel: "1K" },
  { lod: 3, resLabel: "2K" },
  { lod: 4, resLabel: "4K" },
];

const CHANNELS: readonly { readonly id: PreviewChannelId; readonly ko: string; readonly en: string }[] = [
  { id: "composite", ko: "통합 렌더", en: "Composite" },
  { id: "lt-lineart", ko: "LT 선화", en: "LT Lineart" },
  { id: "pbr-normal-roughness", ko: "PBR 법선·거칠기", en: "PBR Normal·Rough" },
];

const DAG_NODE_POS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {
  "seed-field": { x: 14, y: 24 },
  "primitive-topology": { x: 130, y: 24 },
  "lt-ink-extract": { x: 246, y: 24 },
  "pbr-weathering": { x: 14, y: 120 },
  "manifold-grounding": { x: 130, y: 120 },
  "rights-bom-seal": { x: 246, y: 120 },
};

const toPointsAttr = (pts: readonly Vec2[]): string =>
  pts.map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(" ");

function SynthesizedAssetPreviewSvg(props: { readonly result: ProceduralAssetSynthResult; readonly isEn: boolean }): ReactElement {
  const { result, isEn } = props;
  const { svgScene, params, harmony, recipe, rightsBomCertificate } = result;
  const bg =
    params.previewChannel === "lt-lineart"
      ? SVG_LT_PAPER
      : params.previewChannel === "pbr-normal-roughness"
        ? SVG_PBR_CANVAS
        : svgScene.backgroundOklch;
  const channelLabel =
    params.previewChannel === "lt-lineart"
      ? isEn ? "LT LINEART" : "LT 선화"
      : params.previewChannel === "pbr-normal-roughness"
        ? isEn ? "PBR SLOPE/ROUGH" : "PBR 법선·거칠기"
        : isEn ? "COMPOSITE" : "통합";

  return (
    <svg
      data-testid="synth-preview-svg" data-recipe-id={recipe.id} data-seed={params.seed} data-lod={params.complexityLod}
      data-channel={params.previewChannel} data-harmony-id={harmony.id} data-element-count={svgScene.elements.length}
      data-license-class={rightsBomCertificate.licenseClass} data-violet-free="true"
      viewBox={`0 0 ${svgScene.width} ${svgScene.height}`} role="img"
      aria-label={isEn ? `Procedural synthesis preview of ${recipe.nameEn}, seed ${params.seed}, LOD ${params.complexityLod}` : `${recipe.nameKo} 절차적 합성 미리보기(시드 ${params.seed}, LOD ${params.complexityLod})`}
      className="h-72 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width={svgScene.width} height={svgScene.height} fill={bg} />
      <g>
        {svgScene.elements.map((el) => {
          const st = resolveChannelElementStyle(el, params.previewChannel, harmony, params.lineWeightPx);
          if (!st.visible) return null;
          if (el.kind === "rect") {
            return <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height} rx={el.rx} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} opacity={st.opacity} strokeDasharray={el.dashArray} />;
          }
          if (el.kind === "circle") {
            return <circle key={el.id} cx={el.cx} cy={el.cy} r={el.r} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} opacity={st.opacity} strokeDasharray={el.dashArray} />;
          }
          if (el.kind === "polygon") {
            return <polygon key={el.id} points={toPointsAttr(el.points)} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} opacity={st.opacity} />;
          }
          if (el.kind === "line") {
            return <line key={el.id} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={st.stroke} strokeWidth={st.strokeWidth} opacity={st.opacity} strokeDasharray={el.dashArray} />;
          }
          return <path key={el.id} d={el.d} fill={st.fill} stroke={st.stroke} strokeWidth={st.strokeWidth} opacity={st.opacity} strokeDasharray={el.dashArray} />;
        })}
      </g>
      <rect x="10" y="10" width="142" height="20" rx="5" fill={SVG_HUD_BG} />
      <text x="18" y="23" fill={SVG_HUD_TEXT} fontSize="8.5" fontFamily="monospace" fontWeight="700">{`${channelLabel} · SEED ${params.seed}`}</text>
      <rect x="10" y={svgScene.height - 28} width={svgScene.width - 20} height="19" rx="5" fill={SVG_HUD_BG} />
      <text x="18" y={svgScene.height - 15.5} fill={SVG_HUD_TEXT} fontSize="8.2" fontFamily="monospace">
        {`LOD ${params.complexityLod} · W ${Math.round(params.weathering01 * 100)}% · LW ${params.lineWeightPx.toFixed(1)}px · CC0 CLEAN BOM`}
      </text>
    </svg>
  );
}

function DagPipelineDiagramSvg(props: {
  readonly nodes: readonly DagPipelineNode[]; readonly graphDigest: string; readonly isAcyclic: boolean; readonly isEn: boolean;
}): ReactElement {
  const { nodes, graphDigest, isAcyclic, isEn } = props;
  const nodeW = 100;
  const nodeH = 62;

  return (
    <svg
      data-testid="synth-dag-svg" data-stage-count={nodes.length} data-acyclic={String(isAcyclic)}
      data-graph-digest={graphDigest} data-violet-free="true" viewBox="0 0 360 226" role="img"
      aria-label={isEn ? `Procedural synthesis ${nodes.length}-stage DAG graph` : `절차적 에셋 합성 ${nodes.length}단계 비순환 DAG 파이프라인`}
      className="h-56 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="226" fill={SVG_DAG_BG} />
      <g fill="none" stroke={SVG_DAG_EDGE} strokeWidth="1.25">
        {nodes.map((node) => {
          const to = DAG_NODE_POS[node.id];
          if (!to) return null;
          return node.dependsOn.map((depId) => {
            const from = DAG_NODE_POS[depId];
            if (!from) return null;
            return <line key={`${depId}->${node.id}`} x1={from.x + nodeW / 2} y1={from.y + nodeH / 2} x2={to.x + nodeW / 2} y2={to.y + nodeH / 2} strokeDasharray="3 2" />;
          });
        })}
      </g>
      <g>
        {nodes.map((node) => {
          const pos = DAG_NODE_POS[node.id] ?? { x: 14, y: 24 };
          const border = node.stageKind === "rights-bom" ? SVG_DAG_BOM_BORDER : SVG_DAG_NODE_BORDER;
          return (
            <g key={node.id}>
              <rect x={pos.x} y={pos.y} width={nodeW} height={nodeH} rx="8" fill={SVG_DAG_NODE_BG} stroke={border} strokeWidth="1.35" />
              <text x={pos.x + 8} y={pos.y + 16} fill={border} fontSize="8" fontFamily="monospace" fontWeight="700">{`S${node.order} · ${node.stageKind.toUpperCase()}`}</text>
              <text x={pos.x + 8} y={pos.y + 33} fill={SVG_DAG_TEXT} fontSize="8.5" fontWeight="700">{(isEn ? node.labelEn : node.labelKo).slice(0, 15)}</text>
              <text x={pos.x + 8} y={pos.y + 50} fill={SVG_DAG_SUB} fontSize="7.6" fontFamily="monospace">{`${node.primitiveCount}p · ${node.estimatedCostMs}ms`}</text>
            </g>
          );
        })}
      </g>
      <rect x="14" y="194" width="332" height="22" rx="5" fill={SVG_HUD_BG} />
      <text x="22" y="208" fill={SVG_HUD_TEXT} fontSize="8.3" fontFamily="monospace">{`DAG ${nodes.length} STAGES · ACYCLIC=${isAcyclic ? "OK" : "ERR"} · DIGEST ${graphDigest.slice(0, 12)}`}</text>
    </svg>
  );
}

/** Rights-BOM 클린 절차적 웹툰 에셋·재질·3D 소품 자동 합성 그래프 제어판. */
export function StudioProceduralAssetSynthPanel(props: StudioProceduralAssetSynthPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();

  const initialRecipe = getProceduralAssetRecipe(props.initialRecipeId ?? "gothic-window-arch");
  const initialSeedVal = normalizeSeed(props.initialSeed, initialRecipe.defaultSeed);

  const [recipeId, setRecipeId] = useState<ProceduralAssetRecipeId>(initialRecipe.id);
  const [seed, setSeed] = useState<number>(initialSeedVal);
  const [complexityLod, setComplexityLod] = useState<ComplexityLod>(initialRecipe.defaultLod);
  const [weathering01, setWeathering01] = useState<number>(initialRecipe.defaultWeathering01);
  const [lineWeightPx, setLineWeightPx] = useState<number>(initialRecipe.defaultLineWeightPx);
  const [pigmentHarmony, setPigmentHarmony] = useState<PigmentHarmonyId>(initialRecipe.defaultHarmonyId);
  const [previewChannel, setPreviewChannel] = useState<PreviewChannelId>("composite");
  const [sourceDrawer, setSourceDrawer] = useState<"closed" | "svg" | "json">("closed");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const synthResult = useMemo(
    () => synthesizeProceduralAsset({ recipeId, seed, complexityLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel }),
    [recipeId, seed, complexityLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel],
  );
  const exportedSvgText = useMemo(() => exportSynthesizedAssetSvg(synthResult), [synthResult]);
  const exportedJsonText = useMemo(() => exportProceduralAssetManifestJson(synthResult), [synthResult]);

  const notifySynthesized = (nextInput: ProceduralAssetSynthInput): void => {
    if (props.onAssetSynthesized) props.onAssetSynthesized(synthesizeProceduralAsset(nextInput));
  };
  const copyToClipboard = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleSelectRecipe = (nextId: ProceduralAssetRecipeId): void => {
    const next = getProceduralAssetRecipe(nextId);
    setRecipeId(next.id);
    setSeed(next.defaultSeed);
    setComplexityLod(next.defaultLod);
    setWeathering01(next.defaultWeathering01);
    setLineWeightPx(next.defaultLineWeightPx);
    setPigmentHarmony(next.defaultHarmonyId);
    notifySynthesized({ recipeId: next.id, seed: next.defaultSeed, complexityLod: next.defaultLod, weathering01: next.defaultWeathering01, lineWeightPx: next.defaultLineWeightPx, pigmentHarmony: next.defaultHarmonyId, previewChannel });
    setStatusMessage(pick(`'${next.nameKo}' 생성기를 불러왔습니다(시드 ${next.defaultSeed}, LOD ${next.defaultLod}).`, `Loaded '${next.nameEn}' recipe (seed ${next.defaultSeed}, LOD ${next.defaultLod}).`));
  };

  const handleSeedInput = (raw: string): void => {
    const parsed = Number(raw);
    const nextSeed = normalizeSeed(Number.isFinite(parsed) && raw.trim() !== "" ? parsed : seed, synthResult.recipe.defaultSeed);
    setSeed(nextSeed);
    notifySynthesized({ recipeId, seed: nextSeed, complexityLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel });
    setStatusMessage(pick(`결정론적 시드를 ${nextSeed}로 갱신했습니다.`, `Updated deterministic seed to ${nextSeed}.`));
  };

  const handleRandomizeSeed = (): void => {
    const nextSeed = nextDeterministicSeed(seed);
    setSeed(nextSeed);
    notifySynthesized({ recipeId, seed: nextSeed, complexityLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel });
    setStatusMessage(pick(`새 변주 시드 ${nextSeed}로 에셋을 다시 합성했습니다.`, `Synthesized new deterministic variant with seed ${nextSeed}.`));
  };

  const handleLodChange = (nextLod: ComplexityLod): void => {
    setComplexityLod(nextLod);
    notifySynthesized({ recipeId, seed, complexityLod: nextLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel });
    setStatusMessage(pick(`복잡도를 LOD ${nextLod}로 전환했습니다.`, `Switched geometry and PBR complexity to LOD ${nextLod}.`));
  };

  const handleWeatheringChange = (pct: number): void => {
    const nextW = Math.round(pct) / 100;
    setWeathering01(nextW);
    notifySynthesized({ recipeId, seed, complexityLod, weathering01: nextW, lineWeightPx, pigmentHarmony, previewChannel });
  };

  const handleLineWeightChange = (nextLw: number): void => {
    setLineWeightPx(nextLw);
    notifySynthesized({ recipeId, seed, complexityLod, weathering01, lineWeightPx: nextLw, pigmentHarmony, previewChannel });
  };

  const handleHarmonyChange = (nextHarmonyId: PigmentHarmonyId): void => {
    const spec = getPigmentHarmony(nextHarmonyId);
    setPigmentHarmony(spec.id);
    notifySynthesized({ recipeId, seed, complexityLod, weathering01, lineWeightPx, pigmentHarmony: spec.id, previewChannel });
    setStatusMessage(pick(`탈-바이올렛 안료 팔레트를 '${spec.nameKo}'로 적용했습니다.`, `Applied non-violet pigment harmony '${spec.nameEn}'.`));
  };

  const handleChannelChange = (nextChannel: PreviewChannelId): void => {
    setPreviewChannel(nextChannel);
    notifySynthesized({ recipeId, seed, complexityLod, weathering01, lineWeightPx, pigmentHarmony, previewChannel: nextChannel });
  };

  const handleExportSvg = (): void => {
    copyToClipboard(exportedSvgText);
    setSourceDrawer("svg");
    props.onExportSvg?.(exportedSvgText, synthResult);
    setStatusMessage(pick(`인쇄·임포트용 순수 벡터 SVG(${synthResult.rightsBomCertificate.certificateId})를 복사했습니다.`, `Copied clean procedural vector SVG (${synthResult.rightsBomCertificate.certificateId}).`));
  };

  const handleExportJson = (): void => {
    copyToClipboard(exportedJsonText);
    setSourceDrawer("json");
    props.onExportJson?.(exportedJsonText, synthResult);
    setStatusMessage(pick("Rights-BOM 클린 증명서와 DAG 매니페스트 JSON을 복사했습니다.", "Copied Rights-BOM clean certificate & DAG JSON manifest."));
  };

  const handleReset = (): void => {
    setRecipeId(initialRecipe.id);
    setSeed(initialSeedVal);
    setComplexityLod(initialRecipe.defaultLod);
    setWeathering01(initialRecipe.defaultWeathering01);
    setLineWeightPx(initialRecipe.defaultLineWeightPx);
    setPigmentHarmony(initialRecipe.defaultHarmonyId);
    setPreviewChannel("composite");
    setSourceDrawer("closed");
    notifySynthesized({ recipeId: initialRecipe.id, seed: initialSeedVal, complexityLod: initialRecipe.defaultLod, weathering01: initialRecipe.defaultWeathering01, lineWeightPx: initialRecipe.defaultLineWeightPx, pigmentHarmony: initialRecipe.defaultHarmonyId, previewChannel: "composite" });
    setStatusMessage(pick("초기 생성기와 기본 합성 파라미터로 되돌렸습니다.", "Reset procedural recipe and parameters to defaults."));
  };

  const { recipe, mesh3dSummary, pbrMaterialStats, rightsBomCertificate, dagIntegrity } = synthResult;

  return (
    <section
      data-testid="procedural-asset-synth-panel"
      aria-label={pick("Rights-BOM 클린 절차적 웹툰 에셋 합성 스튜디오", "Rights-BOM Clean Procedural Asset Synthesizer Studio")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("절차적 합성 DAG", "Procedural Synth DAG")}
            </span>
            <span data-testid="synth-rights-bom-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("Rights-BOM 클린 · CC0 · 외부 오염 0%", "Rights-BOM Clean · CC0 · Zero Contamination")}
            </span>
            <span data-testid="synth-mesh-gate-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
              <Box className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {pick("비다양체 0 · Y=0 접지", "Manifold 0 · Y=0 Grounded")}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("Rights-BOM 클린 절차적 웹툰 에셋 · 재질 · 3D 소품 합성기", "Rights-BOM Clean Procedural Webtoon Asset, PBR & 3D Prop Synthesizer")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "외부 스캔이나 유료 소스 없이 Mulberry32 시드와 6단계 DAG로 배경·소품 SVG, LT 선화, 4채널 PBR, 수밀 3D 요약을 즉시 합성합니다.",
              "Synthesize copyright-clean webtoon SVG props, LT lineart, 4-channel PBR stats, and watertight 3D summaries from a deterministic 6-stage Mulberry32 DAG.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="synth-export-svg-btn" onClick={handleExportSvg} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("벡터 SVG 복사", "Copy Vector SVG")}
          </button>
          <button type="button" data-testid="synth-export-json-btn" onClick={handleExportJson} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("BOM 매니페스트 복사", "Copy BOM JSON")}
          </button>
          <button type="button" data-testid="synth-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="synth-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage ||
          pick(
            `${recipe.nameKo} · 시드 ${seed} · ${rightsBomCertificate.certificateId} 클린 합성 상태입니다. 시드와 채널을 바꿔 변주를 확인하세요.`,
            `Active clean synthesis: ${recipe.nameEn} · Seed ${seed} · ${rightsBomCertificate.certificateId}. Adjust seed or channel to inspect variants.`,
          )}
      </div>

      {/* 6종 웹툰 실전 절차적 에셋 프리셋 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("6종 웹툰 실전 절차적 에셋 생성기", "6 Production Webtoon Procedural Asset Recipes")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? recipe.webtoonUsageEn : recipe.webtoonUsageKo}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label={pick("절차적 에셋 프리셋 선택", "Select procedural asset recipe")}>
          {PROCEDURAL_ASSET_RECIPES.map((item) => {
            const isActive = item.id === recipeId;
            return (
              <button
                key={item.id} type="button" data-testid={`synth-recipe-${item.id}`} aria-pressed={isActive}
                onClick={() => handleSelectRecipe(item.id)}
                className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                  isActive ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="text-[10px] font-semibold text-fg-3">{isEn ? item.categoryEn : item.categoryKo}</span>
                  <span className="font-mono text-[10px] font-semibold text-fg-2 tabular-nums">{`SEED ${item.defaultSeed} · LOD ${item.defaultLod}`}</span>
                </div>
                <span className="text-xs font-bold text-fg">{isEn ? item.nameEn : item.nameKo}</span>
                <span className="text-[11px] leading-snug text-fg-2">{isEn ? item.taglineEn : item.taglineKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 결정론적 Seed · LOD · 마모도 · 선화 두께 · 5종 안료 팔레트 · 채널 제어 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-6">
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-seed`} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Shuffle className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("결정론적 Mulberry32 시드 (동일 시드 100% 재현)", "Deterministic Mulberry32 Seed")}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-seed`} data-testid="synth-seed-input" type="number" min={1} max={999999} value={seed}
                onChange={(e) => handleSeedInput(e.target.value)}
                className={`min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs font-semibold text-fg tabular-nums ${FOCUS_RING}`}
              />
              <button type="button" data-testid="synth-seed-random-btn" onClick={handleRandomizeSeed} className={`${BTN_OUTLINE} shrink-0`}>
                <Shuffle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("시드 변주", "Roll Seed")}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("복잡도 LOD & PBR 해상도", "Complexity LOD & PBR Resolution")}
            </span>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={pick("복잡도 LOD 선택", "Select complexity LOD")}>
              {LOD_LEVELS.map((entry) => (
                <button
                  key={entry.lod} type="button" data-testid={`synth-lod-${entry.lod}`} aria-pressed={complexityLod === entry.lod}
                  onClick={() => handleLodChange(entry.lod)} className={complexityLod === entry.lod ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span className="font-mono tabular-nums">{`L${entry.lod} · ${entry.resLabel}`}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("5종 탈-바이올렛 OKLCH 안료 팔레트", "5 Non-Violet OKLCH Pigment Harmonies")}
            </span>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="group" aria-label={pick("안료 팔레트 선택", "Select pigment harmony")}>
              {PIGMENT_HARMONIES.map((h) => (
                <button
                  key={h.id} type="button" data-testid={`synth-harmony-${h.id}`} aria-pressed={h.id === pigmentHarmony}
                  onClick={() => handleHarmonyChange(h.id)} className={`${h.id === pigmentHarmony ? BTN_ACTIVE : BTN_OUTLINE} justify-between`}
                >
                  <span className="truncate">{isEn ? h.nameEn : h.nameKo}</span>
                  <svg viewBox="0 0 36 12" className="h-3 w-9 shrink-0" aria-hidden="true">
                    <rect x="0" y="1" width="10" height="10" rx="2" fill={formatOklch(h.primaryFill)} />
                    <rect x="13" y="1" width="10" height="10" rx="2" fill={formatOklch(h.secondaryFill)} />
                    <rect x="26" y="1" width="10" height="10" rx="2" fill={formatOklch(h.accentFill)} />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 xl:col-span-6">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("프리뷰 채널 전환 (통합 · LT 선화 · PBR 법선/거칠기)", "Preview Channel (Composite · LT Lineart · PBR)")}
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={pick("프리뷰 채널 선택", "Select preview channel")}>
              {CHANNELS.map((ch) => (
                <button
                  key={ch.id} type="button" data-testid={`synth-channel-${ch.id}`} aria-pressed={previewChannel === ch.id}
                  onClick={() => handleChannelChange(ch.id)} className={previewChannel === ch.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {pick(ch.ko, ch.en)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${uid}-weathering`} className="flex items-center justify-between text-xs font-semibold text-fg [word-break:keep-all]">
              <span>{pick("표면 마모도 · 균열 · 거칠기 증분", "Surface Weathering & Roughness Delta")}</span>
              <span data-testid="synth-weathering-readout" className="font-mono font-bold text-accent tabular-nums">{`${Math.round(weathering01 * 100)}%`}</span>
            </label>
            <input id={`${uid}-weathering`} data-testid="synth-weathering-slider" type="range" min={0} max={100} step={2} value={Math.round(weathering01 * 100)} onChange={(e) => handleWeatheringChange(Number(e.target.value))} className="min-h-11 w-full cursor-pointer accent-accent" />
          </div>

          <div className="space-y-1">
            <label htmlFor={`${uid}-lineweight`} className="flex items-center justify-between text-xs font-semibold text-fg [word-break:keep-all]">
              <span>{pick("웹툰 LT 선화 두께", "Webtoon LT Line Weight")}</span>
              <span data-testid="synth-lineweight-readout" className="font-mono font-bold text-accent tabular-nums">{`${lineWeightPx.toFixed(1)}px`}</span>
            </label>
            <input id={`${uid}-lineweight`} data-testid="synth-lineweight-slider" type="range" min={0.5} max={4.0} step={0.1} value={lineWeightPx} onChange={(e) => handleLineWeightChange(Number(e.target.value))} className="min-h-11 w-full cursor-pointer accent-accent" />
          </div>
        </div>
      </div>

      {/* 라이브 SVG 합성 캔버스 + 6단계 DAG 파이프라인 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("순수 벡터 SVG 라이브 합성 캔버스", "Live Pure-Vector SVG Synthesis Canvas")}</h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {`${synthResult.svgScene.elements.length} ${pick("요소", "el")} · ${pbrMaterialStats.seamlessTileable ? pick("심리스", "Seamless") : pick("단품 소품", "Prop")}`}
            </span>
          </div>
          <SynthesizedAssetPreviewSvg result={synthResult} isEn={isEn} />
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick(`${dagIntegrity.stageCount}단계 합성 DAG 파이프라인`, `${dagIntegrity.stageCount}-Stage Synthesis DAG Pipeline`)}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${dagIntegrity.totalEstimatedCostMs}ms · ${dagIntegrity.edgeCount} ${pick("간선", "edges")}`}</span>
          </div>
          <DagPipelineDiagramSvg nodes={synthResult.dagPipeline} graphDigest={dagIntegrity.graphDigest} isAcyclic={dagIntegrity.isAcyclic} isEn={isEn} />
          <ol className="grid grid-cols-2 gap-1.5 text-[11px]" data-testid="synth-dag-stage-list">
            {synthResult.dagPipeline.map((node) => (
              <li key={node.id} className="flex items-center justify-between gap-1 rounded-lg border border-line bg-card px-2 py-1 [word-break:keep-all]">
                <span className="truncate font-medium text-fg">{`${node.order}. ${isEn ? node.labelEn : node.labelKo}`}</span>
                <span className="shrink-0 font-mono text-[10px] text-fg-3 tabular-nums">{node.deterministicHash.slice(0, 6)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 3D 수밀 메쉬 · 4채널 PBR · DAG · Rights-BOM 핵심 수치 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("3D 수밀 메쉬 (Y=0)", "Watertight 3D (Y=0)")}</div>
          <div data-testid="synth-metric-mesh" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${mesh3dSummary.vertexCount}V · ${mesh3dSummary.triangleCount}T`}</div>
          <div className="mt-0.5 font-mono text-[10px] text-fg-3 tabular-nums">{`${mesh3dSummary.dimensionsMeters.widthM}×${mesh3dSummary.dimensionsMeters.heightM}×${mesh3dSummary.dimensionsMeters.depthM}m · UV ${mesh3dSummary.uvCoveragePercent}%`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("4채널 PBR · 거칠기", "4-Ch PBR · Roughness")}</div>
          <div data-testid="synth-metric-pbr" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{`${pbrMaterialStats.resolutionPx}px · R ${pbrMaterialStats.channels.roughness.mean01}`}</div>
          <div className="mt-0.5 font-mono text-[10px] text-fg-3 tabular-nums">{`N ${pbrMaterialStats.channels.normal.meanSlopeDeg}° · AO ${pbrMaterialStats.channels.ao.meanOcclusion01}`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("LT 선화 · 마모 요소", "LT Ink · Wear Marks")}</div>
          <div data-testid="synth-metric-dag" className="mt-1 font-mono text-sm font-bold text-accent tabular-nums">{`${synthResult.svgScene.lineartElementCount} · ${synthResult.svgScene.weatheringElementCount}`}</div>
          <div className="mt-0.5 font-mono text-[10px] text-fg-3 tabular-nums">{`VRAM ~${pbrMaterialStats.estimatedVramKb}KB · ${dagIntegrity.totalEstimatedCostMs}ms`}</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("Rights-BOM 증명서", "Rights-BOM Cert")}</div>
          <div data-testid="synth-metric-bom" className="mt-1 font-mono text-xs font-bold text-good tabular-nums">{rightsBomCertificate.licenseClass}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-fg-3 tabular-nums">{rightsBomCertificate.certificateId}</div>
        </div>
      </div>

      {/* Rights-BOM 클린 증명서 & 외부 스캔 재배포 금지 경고 + 소스 드로어 */}
      <div data-testid="synth-rights-bom-card" className="space-y-3 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            {pick("Rights-BOM 클린 증명 체크리스트 & 출력 소스", "Rights-BOM Clean Proof Checklist & Source Export")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="synth-toggle-svg-btn" aria-expanded={sourceDrawer === "svg"} onClick={() => setSourceDrawer((prev) => (prev === "svg" ? "closed" : "svg"))} className={sourceDrawer === "svg" ? BTN_ACTIVE : BTN_OUTLINE}>
              <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "svg" ? pick("SVG 닫기", "Hide SVG") : pick("SVG 소스 보기", "View SVG")}
            </button>
            <button type="button" data-testid="synth-toggle-json-btn" aria-expanded={sourceDrawer === "json"} onClick={() => setSourceDrawer((prev) => (prev === "json" ? "closed" : "json"))} className={sourceDrawer === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sourceDrawer === "json" ? pick("JSON 닫기", "Hide JSON") : pick("JSON 매니페스트", "View JSON")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
          {([
            { ko: "외부 저작권 오염 0%", en: "Zero Copyright Contamination" },
            { ko: "상업 웹툰 재배포 허용", en: "Commercial Webtoon Cleared" },
            { ko: "동일 시드 100% 재현", en: "100% Deterministic Seed" },
            { ko: "수밀·Y=0·glbforge 통과", en: "Watertight · Y=0 Ready" },
          ] as const).map((chk) => (
            <span key={chk.en} className="inline-flex items-center gap-1.5 rounded-lg border border-good bg-good-soft px-2.5 py-1.5 font-medium text-good [word-break:keep-all]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(chk.ko, chk.en)}
            </span>
          ))}
        </div>

        <div data-testid="synth-external-redistribution-warning" className="flex items-start gap-2 rounded-lg border border-warn bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warn [word-break:keep-all]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{isEn ? rightsBomCertificate.externalRedistributionWarningEn : rightsBomCertificate.externalRedistributionWarningKo}</span>
        </div>

        {sourceDrawer !== "closed" ? (
          <pre data-testid={sourceDrawer === "svg" ? "synth-svg-preview" : "synth-json-preview"} className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {sourceDrawer === "svg" ? exportedSvgText : exportedJsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
