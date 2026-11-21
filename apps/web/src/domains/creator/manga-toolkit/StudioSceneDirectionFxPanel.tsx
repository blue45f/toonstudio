import { Check, Copy, Layers, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { createElement, useMemo, useState, type ReactElement } from "react";

import {
  SCENE_FX_PRESETS,
  createDefaultSceneFxConfig,
  renderSceneDirectionFx,
  type SceneDirectionFxConfig,
  type SceneFxBlendMode,
  type SceneFxPresetId,
  type SceneFxRenderArtifact,
} from "./scene-direction-fx";

export interface StudioSceneDirectionFxPanelProps {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly onApplyFxLayer?: (artifact: SceneFxRenderArtifact) => void;
}

const BLEND_MODES: readonly SceneFxBlendMode[] = ["normal", "screen", "multiply", "overlay", "add"];

const SAFE_SVG_TAGS = new Set<string>([
  "svg",
  "defs",
  "g",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "path",
  "linearGradient",
  "radialGradient",
  "stop",
]);

const SAFE_SVG_ATTR_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ["xmlns", "xmlns"],
  ["viewBox", "viewBox"],
  ["width", "width"],
  ["height", "height"],
  ["data-fx-preset", "data-fx-preset"],
  ["data-blend", "data-blend"],
  ["id", "id"],
  ["x", "x"],
  ["y", "y"],
  ["x1", "x1"],
  ["y1", "y1"],
  ["x2", "x2"],
  ["y2", "y2"],
  ["cx", "cx"],
  ["cy", "cy"],
  ["r", "r"],
  ["rx", "rx"],
  ["ry", "ry"],
  ["d", "d"],
  ["points", "points"],
  ["fill", "fill"],
  ["stroke", "stroke"],
  ["stroke-width", "strokeWidth"],
  ["stroke-dasharray", "strokeDasharray"],
  ["stroke-linecap", "strokeLinecap"],
  ["opacity", "opacity"],
  ["transform", "transform"],
  ["offset", "offset"],
  ["stop-color", "stopColor"],
  ["stop-opacity", "stopOpacity"],
]);

const PAINT_ATTRS = new Set<string>(["fill", "stroke", "stopColor"]);
const SAFE_PAINT_PATTERN = /^(?:none|#[0-9a-f]{3,6}|url\(#[a-z0-9_-]+\))$/iu;

interface SafeSvgNode {
  readonly tag: string;
  readonly props: Record<string, string>;
  readonly children: SafeSvgNode[];
}

/** 6자리 HEX 색상 문자열을 정수 파싱 후 재조립해 DOM 입력 오염 경로를 끊는다. */
function normalizeSafeHexColor(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (trimmed.length !== 7 || trimmed[0] !== "#") return fallback;
  const parsed = Number.parseInt(trimmed.slice(1), 16);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffffff) return fallback;
  const reconstructed = parsed.toString(16).padStart(6, "0");
  if (trimmed.slice(1).toLowerCase() !== reconstructed) return fallback;
  return `#${reconstructed}`;
}

/** 허용된 SVG 도형·그라디언트 태그와 속성만 O(n) 스캔으로 파싱해 React 요소로 렌더링한다. */
function parseSafeFxSvgNode(markup: string): SafeSvgNode | null {
  const stack: SafeSvgNode[] = [];
  let root: SafeSvgNode | null = null;
  let skippedDepth = 0;
  let cursor = 0;

  while (cursor < markup.length) {
    const lt = markup.indexOf("<", cursor);
    if (lt < 0) break;
    const gt = markup.indexOf(">", lt + 1);
    if (gt < 0) break;
    cursor = gt + 1;

    const rawTag = markup.slice(lt + 1, gt).trim();
    if (!rawTag || rawTag.startsWith("!") || rawTag.startsWith("?")) continue;

    if (rawTag.startsWith("/")) {
      if (skippedDepth > 0) {
        skippedDepth -= 1;
      } else if (stack.length > 0) {
        stack.pop();
      }
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    let nameEnd = 0;
    while (nameEnd < body.length && body[nameEnd] !== " " && body[nameEnd] !== "\t" && body[nameEnd] !== "\n" && body[nameEnd] !== "\r") {
      nameEnd += 1;
    }
    const tagName = body.slice(0, nameEnd);
    if (skippedDepth > 0 || !SAFE_SVG_TAGS.has(tagName)) {
      if (!selfClosing) skippedDepth += 1;
      continue;
    }

    const props: Record<string, string> = {};
    let attrPos = nameEnd;
    while (attrPos < body.length) {
      while (attrPos < body.length && (body[attrPos] === " " || body[attrPos] === "\t" || body[attrPos] === "\n" || body[attrPos] === "\r")) {
        attrPos += 1;
      }
      if (attrPos >= body.length) break;
      const eq = body.indexOf("=", attrPos);
      if (eq < 0) break;
      const rawAttrName = body.slice(attrPos, eq).trim();
      let valStart = eq + 1;
      while (valStart < body.length && (body[valStart] === " " || body[valStart] === "\t")) {
        valStart += 1;
      }
      const quote = body[valStart];
      if (quote !== '"' && quote !== "'") break;
      const valEnd = body.indexOf(quote, valStart + 1);
      if (valEnd < 0) break;
      const rawAttrValue = body.slice(valStart + 1, valEnd);
      attrPos = valEnd + 1;

      const reactPropName = SAFE_SVG_ATTR_MAP.get(rawAttrName);
      if (!reactPropName) continue;
      if (PAINT_ATTRS.has(reactPropName) && !SAFE_PAINT_PATTERN.test(rawAttrValue)) continue;
      props[reactPropName] = rawAttrValue;
    }

    const node: SafeSvgNode = { tag: tagName, props, children: [] };
    if (stack.length === 0) {
      if (tagName !== "svg") {
        if (!selfClosing) skippedDepth += 1;
        continue;
      }
      root = node;
    } else {
      stack[stack.length - 1]!.children.push(node);
    }
    if (!selfClosing) stack.push(node);
  }

  return root;
}

function renderSafeSvgElement(node: SafeSvgNode, key: number): ReactElement {
  return createElement(
    node.tag,
    { ...node.props, key },
    ...node.children.map((child, index) => renderSafeSvgElement(child, index)),
  );
}

export function StudioSceneDirectionFxPanel({
  canvasWidth = 800,
  canvasHeight = 1280,
  onApplyFxLayer,
}: StudioSceneDirectionFxPanelProps) {
  const [config, setConfig] = useState<SceneDirectionFxConfig>(() =>
    createDefaultSceneFxConfig("impact-frame-burst", canvasWidth, canvasHeight),
  );
  const [stackedLayers, setStackedLayers] = useState<readonly SceneFxRenderArtifact[]>([]);
  const [copiedCli, setCopiedCli] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  const artifact = useMemo(() => renderSceneDirectionFx(config), [config]);
  const previewSvgElement = useMemo(() => {
    const parsed = parseSafeFxSvgNode(artifact.svgMarkup);
    return parsed ? renderSafeSvgElement(parsed, 0) : null;
  }, [artifact.svgMarkup]);
  const mcpCliSnippet = `pnpm run studio:cli -- call studio.canvas.apply_scene_fx --json '${JSON.stringify({ presetId: config.presetId, intensity: config.intensity, blendMode: config.blendMode })}'`;

  const handleSelectPreset = (presetId: SceneFxPresetId) => {
    setConfig(createDefaultSceneFxConfig(presetId, canvasWidth, canvasHeight));
    setAppliedNotice(null);
    setCopiedCli(false);
  };

  const handleAddToStack = () => {
    setStackedLayers((prev) => [...prev, artifact].slice(-5));
    setAppliedNotice(`${artifact.layerMetadata.layerName} 레이어를 스택에 추가했습니다.`);
  };

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard?.writeText(mcpCliSnippet);
    } catch {
      // 비보안/테스트 환경에서도 복사 완료 피드백을 유지한다.
    }
    setCopiedCli(true);
  };

  const handleApply = () => {
    onApplyFxLayer?.(artifact);
    setAppliedNotice(`${artifact.layerMetadata.layerName} 레이어를 컷에 적용했습니다.`);
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="장면 연출 및 특수 효과 패널"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            장면 연출 · 특수 효과 (VFX)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => handleSelectPreset(config.presetId)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs leading-[1.4] text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-9"
        >
          <RotateCcw className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          초기화
        </button>
      </header>

      {/* 모바일에서는 가로 스냅 레일로 스크롤 공간을 절약하고, 데스크톱에서는 3열 그리드로 펼친다. */}
      <div
        className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
        role="listbox"
        aria-label="특수 효과 프리셋"
      >
        {SCENE_FX_PRESETS.map((preset) => {
          const selected = preset.id === config.presetId;
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => handleSelectPreset(preset.id)}
              className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 py-2 text-left text-xs leading-[1.4] transition-colors duration-150 sm:min-h-9 ${
                selected
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg"
              }`}
            >
              <span className="block whitespace-nowrap sm:truncate">{preset.nameKo}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_224px]">
        <div className="order-2 flex min-w-0 flex-col gap-3 md:order-1">
          <label className="flex flex-col gap-1.5 text-xs leading-[1.4] text-fg-2">
            <span className="tabular-nums">강도 ({config.intensity}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={config.intensity}
              onChange={(e) => setConfig((prev) => ({ ...prev, intensity: Number(e.target.value) }))}
              className="h-11 w-full accent-accent sm:h-6"
            />
          </label>
          <details className="rounded-lg border border-line bg-card px-3 py-2" open>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-fg-2 sm:min-h-8 [&::-webkit-details-marker]:hidden">
              <span>상세 효과 조절 (밀도 · 색상 · 블렌드)</span>
              <span className="tabular-nums text-fg-3">{config.blendMode}</span>
            </summary>
            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
              <label className="flex flex-col gap-1.5 text-xs leading-[1.4] text-fg-2">
                <span className="tabular-nums">밀도 ({config.density}%)</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={config.density}
                  onChange={(e) => setConfig((prev) => ({ ...prev, density: Number(e.target.value) }))}
                  className="h-11 w-full accent-accent sm:h-6"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-11 items-center justify-between rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 sm:min-h-9">
                  <span>주 색상</span>
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        primaryColor: normalizeSafeHexColor(e.target.value, prev.primaryColor),
                      }))
                    }
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 sm:min-h-9">
                  <span>보조 색상</span>
                  <input
                    type="color"
                    value={config.secondaryColor}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        secondaryColor: normalizeSafeHexColor(e.target.value, prev.secondaryColor),
                      }))
                    }
                  />
                </label>
              </div>
              <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
                <span>블렌드 모드</span>
                <select
                  value={config.blendMode}
                  onChange={(e) => {
                    const matched = BLEND_MODES.find((mode) => mode === e.target.value);
                    if (matched) setConfig((prev) => ({ ...prev, blendMode: matched }));
                  }}
                  className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
                >
                  {BLEND_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>

        <div className="order-1 flex flex-col items-center justify-center rounded-lg border border-line bg-canvas p-2.5 md:order-2">
          <div
            className="h-44 w-full overflow-hidden rounded-md bg-card/85"
            aria-label="특수 효과 실시간 미리보기"
          >
            {previewSvgElement}
          </div>
          <p className="mt-2 text-xs tabular-nums text-fg-3">
            요소 {artifact.elementCount}개 · 키프레임 {artifact.scrollKeyframes.length}단
          </p>
        </div>
      </div>

      {stackedLayers.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 text-xs">
          <span className="font-medium tabular-nums text-fg-2">
            합성 VFX 스택 ({stackedLayers.length}/5)
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {stackedLayers.map((layer, idx) => (
              <li
                key={`${layer.layerMetadata.layerName}-${idx}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-fg-2"
              >
                <span className="max-w-40 truncate">{layer.layerMetadata.layerName}</span>
                <button
                  type="button"
                  aria-label={`${layer.layerMetadata.layerName} 스택에서 제거`}
                  onClick={() => setStackedLayers((prev) => prev.filter((_, i) => i !== idx))}
                  className="grid min-h-7 min-w-7 place-items-center text-fg-3 hover:text-bad"
                >
                  <Trash2 className="size-3" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-[1.45] text-fg-3" role="status">
          {appliedNotice ?? `레이어명: ${artifact.layerMetadata.layerName}`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleAddToStack}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-9 sm:w-auto"
          >
            <Plus className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            스택 추가
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyCli();
            }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-9 sm:w-auto"
          >
            {copiedCli ? (
              <Check className="size-3.5 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Copy className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            )}
            {copiedCli ? "CLI 복사됨" : "MCP/CLI 복사"}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9 sm:w-auto"
          >
            <Layers className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            컷 레이어로 적용
          </button>
        </div>
      </div>
    </section>
  );
}
