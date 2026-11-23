/**
 * Clip Studio Paint 4.0~5.0 스타일 2D 퍼펫 변형(Puppet Warp) 스튜디오 패널.
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 전이 속성만 사용 · 500줄 이하 · 모든 props optional · KO/EN 지원).
 */

import { Lock, Move, Plus, RotateCcw, Sparkles, Trash2, Unlock } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_MLS_ALPHA, DEFAULT_PUPPET_STAGE_HEIGHT, DEFAULT_PUPPET_STAGE_WIDTH, PUPPET_WARP_PRESETS,
  buildDeformableGridMesh, buildDemoCharacterSilhouette, computeMlsRigidDeformation,
  computePuppetWarpMetrics, createDefaultWebtoonPuppetPins, createDemoCharacterRgba,
  createPuppetWarpPresetPins, evaluateMlsRigidPoint, warpRgbaImageWithPuppetMesh,
  type DeformableGridMesh, type MeshVertex2D, type PuppetWarpMetrics,
  type PuppetWarpPin, type PuppetWarpPresetId,
} from "./puppet-warp-mls-engine";

export interface PuppetWarpDeformationSnapshot {
  readonly mesh: DeformableGridMesh;
  readonly pins: readonly PuppetWarpPin[];
  readonly deformedVertices: readonly MeshVertex2D[];
  readonly metrics: PuppetWarpMetrics;
  readonly alpha: number;
}

export interface PuppetWarpStudioPanelProps {
  readonly stageWidth?: number;
  readonly stageHeight?: number;
  readonly initialCols?: number;
  readonly initialAlpha?: number;
  readonly initialPins?: readonly PuppetWarpPin[];
  readonly sourceRgba?: Uint8ClampedArray;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPinsChange?: (pins: readonly PuppetWarpPin[]) => void;
  readonly onDeformationChange?: (snapshot: PuppetWarpDeformationSnapshot) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const clampValue = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const roundTenth = (value: number): number => Math.round(value * 10) / 10;
const toSvgPoints = (points: readonly MeshVertex2D[]): string => points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");

function buildWireframePath(edges: readonly (readonly [number, number])[], vertices: readonly MeshVertex2D[]): string {
  const parts: string[] = [];
  for (const [a, b] of edges) {
    const va = vertices[a];
    const vb = vertices[b];
    if (va && vb) parts.push(`M${va.x.toFixed(1)} ${va.y.toFixed(1)}L${vb.x.toFixed(1)} ${vb.y.toFixed(1)}`);
  }
  return parts.join(" ");
}

interface SliderRowProps {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly valueTestId?: string;
  readonly inputTestId: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly disabled?: boolean;
  readonly onChange: (next: number) => void;
}

function SliderRow({ id, label, valueText, valueTestId, inputTestId, min, max, step, value, disabled = false, onChange }: SliderRowProps): ReactElement {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between text-fg-2">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums font-semibold text-fg" data-testid={valueTestId}>{valueText}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} data-testid={inputTestId} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent disabled:opacity-40" />
    </div>
  );
}

/** 2D 퍼펫 변형 MLS 강체 메쉬 인터랙티브 스튜디오 패널. */
export function PuppetWarpStudioPanel({
  stageWidth = DEFAULT_PUPPET_STAGE_WIDTH,
  stageHeight = DEFAULT_PUPPET_STAGE_HEIGHT,
  initialCols = 6,
  initialAlpha = DEFAULT_MLS_ALPHA,
  initialPins,
  sourceRgba,
  locale,
  className,
  onPinsChange,
  onDeformationChange,
}: PuppetWarpStudioPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? storeLang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const activeLang: "ko" | "en" = isEn ? "en" : "ko";
  const safeW = Math.max(64, Math.round(stageWidth));
  const safeH = Math.max(64, Math.round(stageHeight));
  const defaultPins = useMemo(() => initialPins ?? createDefaultWebtoonPuppetPins(safeW, safeH, activeLang), [initialPins, safeW, safeH, activeLang]);

  const [pins, setPins] = useState<readonly PuppetWarpPin[]>(defaultPins);
  const [selectedPinId, setSelectedPinId] = useState<string>(defaultPins[0]?.id ?? "");
  const [meshCols, setMeshCols] = useState<number>(clampValue(Math.round(initialCols), 4, 14));
  const [alpha, setAlpha] = useState<number>(clampValue(initialAlpha, 1.0, 3.0));
  const [activePreset, setActivePreset] = useState<PuppetWarpPresetId | null>(null);
  const [showRestMesh, setShowRestMesh] = useState<boolean>(true);
  const [showDeformedMesh, setShowDeformedMesh] = useState<boolean>(true);
  const [showPixelCanvas, setShowPixelCanvas] = useState<boolean>(true);
  const [addPinMode, setAddPinMode] = useState<boolean>(false);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [nextCustomIndex, setNextCustomIndex] = useState<number>(1);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const meshRows = Math.max(4, Math.round(meshCols * (safeH / safeW)));
  const mesh = useMemo(() => buildDeformableGridMesh(safeW, safeH, meshCols, meshRows), [safeW, safeH, meshCols, meshRows]);
  const deformedVertices = useMemo(() => computeMlsRigidDeformation(mesh, pins, alpha), [mesh, pins, alpha]);
  const metrics = useMemo(() => computePuppetWarpMetrics(mesh, deformedVertices, pins), [mesh, deformedVertices, pins]);
  const restMeshPath = useMemo(() => buildWireframePath(mesh.edges, mesh.vertices), [mesh]);
  const deformedMeshPath = useMemo(() => buildWireframePath(mesh.edges, deformedVertices), [mesh.edges, deformedVertices]);
  const baseSilhouette = useMemo(() => buildDemoCharacterSilhouette(safeW, safeH), [safeW, safeH]);
  const deformedSilhouette = useMemo(
    () => baseSilhouette.map((part) => ({ ...part, points: part.points.map((pt) => evaluateMlsRigidPoint(pt.x, pt.y, pins, alpha)) })),
    [baseSilhouette, pins, alpha],
  );
  const demoSourceRgba = useMemo(() => sourceRgba ?? createDemoCharacterRgba(safeW, safeH), [sourceRgba, safeW, safeH]);
  const selectedPin = useMemo(() => pins.find((pin) => pin.id === selectedPinId) ?? pins[0] ?? null, [pins, selectedPinId]);

  useEffect(() => {
    onDeformationChange?.({ mesh, pins, deformedVertices, metrics, alpha });
  }, [alpha, deformedVertices, mesh, metrics, onDeformationChange, pins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showPixelCanvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const warped = warpRgbaImageWithPuppetMesh(demoSourceRgba, safeW, safeH, mesh, deformedVertices);
    ctx.clearRect(0, 0, safeW, safeH);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(warped), safeW, safeH), 0, 0);
  }, [deformedVertices, demoSourceRgba, mesh, safeH, safeW, showPixelCanvas]);

  const commitPins = (next: readonly PuppetWarpPin[], notice: string, preset: PuppetWarpPresetId | null = null) => {
    setPins(next);
    setActivePreset(preset);
    setStatusNotice(notice);
    onPinsChange?.(next);
  };

  const updateSinglePin = (pinId: string, updater: (pin: PuppetWarpPin) => PuppetWarpPin, notice: string) => {
    commitPins(pins.map((pin) => (pin.id === pinId ? updater(pin) : pin)), notice, null);
  };

  const handleApplyPreset = (presetId: PuppetWarpPresetId) => {
    const presetMeta = PUPPET_WARP_PRESETS.find((item) => item.id === presetId);
    const nextPins = createPuppetWarpPresetPins(presetId, safeW, safeH, activeLang);
    const firstActive = nextPins.find((pin) => !pin.locked) ?? nextPins[0];
    if (firstActive) setSelectedPinId(firstActive.id);
    const label = presetMeta ? pick(presetMeta.nameKo, presetMeta.nameEn) : presetId;
    commitPins(nextPins, pick(`"${label}" 웹툰 포즈 프리셋을 적용했습니다.`, `Applied "${label}" pose preset.`), presetId);
  };

  const handleReset = () => {
    const restored = createDefaultWebtoonPuppetPins(safeW, safeH, activeLang);
    setSelectedPinId(restored[0]?.id ?? "");
    setAddPinMode(false);
    setDraggingPinId(null);
    commitPins(restored, pick("모든 핀과 메쉬 변형을 초기 휴식 자세로 되돌렸습니다.", "Reset all pins and mesh deformation to rest pose."), null);
  };

  const handleAddPinAt = (x: number, y: number) => {
    const rx = roundTenth(clampValue(x, 8, safeW - 8));
    const ry = roundTenth(clampValue(y, 8, safeH - 8));
    const newId = `custom-pin-${nextCustomIndex}`;
    const newLabel = pick(`추가 핀 ${nextCustomIndex}`, `Custom Pin ${nextCustomIndex}`);
    const created: PuppetWarpPin = { id: newId, restX: rx, restY: ry, targetX: rx, targetY: ry, rotationDeg: 0, locked: false, label: newLabel };
    setNextCustomIndex((count) => count + 1);
    setSelectedPinId(newId);
    setAddPinMode(false);
    commitPins([...pins, created], pick(`${newLabel} (${rx}, ${ry})을 추가했습니다.`, `Added ${newLabel} at (${rx}, ${ry}).`), null);
  };

  const handleQuickAddPin = () => {
    const offset = ((nextCustomIndex - 1) % 5) * 18;
    handleAddPinAt(safeW * 0.36 + offset, safeH * 0.42 + offset * 0.6);
  };

  const handleToggleLock = (pin: PuppetWarpPin) => {
    const nextLocked = !pin.locked;
    updateSinglePin(
      pin.id,
      (item) => ({ ...item, locked: nextLocked, targetX: nextLocked ? item.restX : item.targetX, targetY: nextLocked ? item.restY : item.targetY, rotationDeg: nextLocked ? 0 : item.rotationDeg }),
      nextLocked ? pick(`"${pin.label}" 핀을 기준 위치에 잠갔습니다.`, `Locked "${pin.label}" to its rest anchor.`) : pick(`"${pin.label}" 핀 잠금을 해제했습니다.`, `Unlocked "${pin.label}" for editing.`),
    );
  };

  const handleDeletePin = (pin: PuppetWarpPin) => {
    if (pins.length <= 1) return;
    const remaining = pins.filter((item) => item.id !== pin.id);
    if (selectedPinId === pin.id) setSelectedPinId(remaining[0]?.id ?? "");
    commitPins(remaining, pick(`"${pin.label}" 핀을 삭제했습니다.`, `Removed "${pin.label}".`), null);
  };

  const clientToStage = (clientX: number, clientY: number): MeshVertex2D | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { x: roundTenth(clampValue(((clientX - rect.left) / rect.width) * safeW, 0, safeW)), y: roundTenth(clampValue(((clientY - rect.top) / rect.height) * safeH, 0, safeH)) };
  };

  const handleSvgPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!addPinMode) return;
    const pt = clientToStage(event.clientX, event.clientY);
    if (pt) handleAddPinAt(pt.x, pt.y);
  };

  const handlePinPointerDown = (event: PointerEvent<SVGGElement>, pin: PuppetWarpPin) => {
    event.stopPropagation();
    setSelectedPinId(pin.id);
    if (pin.locked) {
      setStatusNotice(pick(`"${pin.label}" 핀은 잠겨 있어 이동할 수 없습니다.`, `"${pin.label}" is locked and cannot be moved.`));
      return;
    }
    setDraggingPinId(pin.id);
  };

  const handleSvgPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!draggingPinId) return;
    const targetPin = pins.find((item) => item.id === draggingPinId);
    if (!targetPin || targetPin.locked) return;
    const pt = clientToStage(event.clientX, event.clientY);
    if (pt) updateSinglePin(draggingPinId, (item) => ({ ...item, targetX: pt.x, targetY: pt.y }), pick(`"${targetPin.label}" 위치를 (${pt.x}, ${pt.y})으로 이동했습니다.`, `Moved "${targetPin.label}" to (${pt.x}, ${pt.y}).`));
  };

  const handlePinKeyDown = (event: KeyboardEvent<SVGGElement>, pin: PuppetWarpPin) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedPinId(pin.id);
      return;
    }
    if (pin.locked) return;
    const step = event.shiftKey ? 10 : 4;
    const deltaMap: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = deltaMap[event.key];
    if (!delta) return;
    event.preventDefault();
    const nx = roundTenth(clampValue(pin.targetX + delta[0], 0, safeW));
    const ny = roundTenth(clampValue(pin.targetY + delta[1], 0, safeH));
    updateSinglePin(pin.id, (item) => ({ ...item, targetX: nx, targetY: ny }), pick(`"${pin.label}" 핀을 키보드로 이동했습니다.`, `Nudged "${pin.label}" via keyboard.`));
  };

  const activePresetMeta = activePreset ? PUPPET_WARP_PRESETS.find((item) => item.id === activePreset) : undefined;
  const activePresetLabel = activePresetMeta ? pick(activePresetMeta.nameKo, activePresetMeta.nameEn) : pick("직접 편집", "Custom");
  const resolvedNotice = statusNotice ?? pick("핀을 드래그하거나 웹툰 포즈 프리셋을 눌러 강체 왜곡 없는 변형을 확인하세요.", "Drag pins or apply a webtoon pose preset to preview rigid MLS deformation.");

  return (
    <section aria-labelledby={`${uid}-title`} className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`} data-testid="puppet-warp-studio-panel">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={`${uid}-title`} className="text-sm font-bold tracking-tight text-fg">{pick("2D 퍼펫 변형 (MLS 강체 메쉬)", "2D Puppet Warp (MLS Rigid Mesh)")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("SIGGRAPH 2006 Moving Least Squares 강체 수식으로 관절 꺾임·전단 왜곡 없이 웹툰 포즈를 조정합니다.", "Deform webtoon poses cleanly with SIGGRAPH 2006 Moving Least Squares rigid mesh constraints.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAddPinMode((prev) => !prev)} aria-pressed={addPinMode} data-testid="puppet-add-mode-btn" className={addPinMode ? BTN_ACTIVE : BTN}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("캔버스 찍어 추가", "Place on Canvas")}
          </button>
          <button type="button" onClick={handleQuickAddPin} data-testid="puppet-add-pin-btn" className={BTN}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("핀 추가", "Add Pin")}
          </button>
          <button type="button" onClick={handleReset} data-testid="puppet-reset-btn" className={BTN}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <p className="text-[11px] text-fg-3">{pick("핀 / 고정", "Pins / Locked")}</p>
          <p className="tabular-nums text-sm font-bold text-fg" data-testid="puppet-pin-count">{metrics.pinCount} <span className="text-xs font-normal text-fg-3">({metrics.lockedPinCount})</span></p>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <p className="text-[11px] text-fg-3">{pick("삼각형 메쉬", "Mesh Triangles")}</p>
          <p className="tabular-nums text-sm font-bold text-fg" data-testid="puppet-triangle-count">{metrics.triangleCount} <span className="text-xs font-normal text-fg-3">({mesh.cols}×{mesh.rows})</span></p>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <p className="text-[11px] text-fg-3">{pick("최대 변위", "Max Displacement")}</p>
          <p className="tabular-nums text-sm font-bold text-accent" data-testid="puppet-max-displacement">{metrics.maxVertexDisplacementPx.toFixed(1)}px</p>
        </div>
        <div className="rounded-xl border border-line bg-card px-3 py-2">
          <p className="text-[11px] text-fg-3">{pick("포즈 모드", "Pose Mode")}</p>
          <p className="truncate text-sm font-semibold text-fg" data-testid="puppet-active-preset">{activePresetLabel}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("웹툰 포즈 원클릭 프리셋 (4종)", "Webtoon One-Click Pose Presets")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PUPPET_WARP_PRESETS.map((preset) => (
            <button key={preset.id} type="button" aria-pressed={activePreset === preset.id} data-testid={`puppet-preset-${preset.id}`} title={pick(preset.descriptionKo, preset.descriptionEn)} onClick={() => handleApplyPreset(preset.id)} className={activePreset === preset.id ? BTN_ACTIVE : BTN}>
              {pick(preset.nameKo, preset.nameEn)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-2 rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-fg">{pick("인터랙티브 메쉬 프리뷰", "Interactive Mesh Preview")}</span>
            <div className="flex flex-wrap items-center gap-3 text-fg-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showRestMesh} onChange={(e) => setShowRestMesh(e.target.checked)} className="accent-accent" />{pick("원본 격자", "Rest Mesh")}</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showDeformedMesh} onChange={(e) => setShowDeformedMesh(e.target.checked)} className="accent-accent" />{pick("변형 메쉬", "Warped Mesh")}</label>
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showPixelCanvas} onChange={(e) => setShowPixelCanvas(e.target.checked)} className="accent-accent" />{pick("픽셀 워프", "RGBA Warp")}</label>
            </div>
          </div>

          <div className="relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-lg border border-line bg-canvas select-none">
            {showPixelCanvas ? <canvas ref={canvasRef} width={safeW} height={safeH} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-80" /> : null}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${safeW} ${safeH}`}
              role="img"
              aria-label={pick("퍼펫 변형 메쉬 및 관절 핀 캔버스", "Puppet warp mesh and joint pin canvas")}
              data-testid="puppet-warp-svg"
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={() => setDraggingPinId(null)}
              onPointerLeave={() => setDraggingPinId(null)}
              className={`relative z-10 h-full w-full touch-none ${addPinMode ? "cursor-crosshair" : "cursor-default"}`}
            >
              {showRestMesh ? <path d={restMeshPath} fill="none" strokeWidth={0.75} strokeDasharray="3 3" className="stroke-line-strong/40" data-testid="puppet-rest-mesh-path" /> : null}
              {deformedSilhouette.map((part) => (
                <polygon key={part.id} points={toSvgPoints(part.points)} strokeWidth={1.2} className="fill-accent-soft stroke-fg-2/80" />
              ))}
              {showDeformedMesh ? <path d={deformedMeshPath} fill="none" strokeWidth={0.9} className="stroke-cool/65" data-testid="puppet-deformed-mesh-path" /> : null}
              {pins.map((pin) => {
                const effX = pin.locked ? pin.restX : pin.targetX;
                const effY = pin.locked ? pin.restY : pin.targetY;
                const effRotRad = ((pin.locked ? 0 : pin.rotationDeg) * Math.PI) / 180;
                const isSelected = selectedPin?.id === pin.id;
                const moved = Math.hypot(effX - pin.restX, effY - pin.restY) > 0.5;
                return (
                  <g
                    key={pin.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${pin.label} (${pin.locked ? pick("잠금", "Locked") : pick("활성", "Active")})`}
                    data-testid={`puppet-svg-pin-${pin.id}`}
                    onPointerDown={(event) => handlePinPointerDown(event, pin)}
                    onKeyDown={(event) => handlePinKeyDown(event, pin)}
                    className={pin.locked ? "cursor-not-allowed" : "cursor-grab"}
                  >
                    {moved ? <line x1={pin.restX} y1={pin.restY} x2={effX} y2={effY} strokeWidth={1.2} strokeDasharray="2 2" className="stroke-accent" /> : null}
                    {isSelected ? <circle cx={effX} cy={effY} r={11} strokeWidth={1.5} strokeDasharray="3 2" className="fill-none stroke-fg" /> : null}
                    <line x1={effX} y1={effY} x2={effX + Math.cos(effRotRad) * 10} y2={effY + Math.sin(effRotRad) * 10} strokeWidth={1.5} className={pin.locked ? "stroke-warn" : "stroke-fg"} />
                    <circle cx={effX} cy={effY} r={6} strokeWidth={1.8} className={pin.locked ? "fill-warn stroke-on-accent" : "fill-accent stroke-on-accent"} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3">
          <div className="space-y-2 border-b border-line pb-3">
            <h3 className="text-xs font-bold text-fg">{pick("메쉬 밀도 및 MLS 강성", "Mesh Density & MLS Stiffness")}</h3>
            <SliderRow id={`${uid}-density`} label={pick("메쉬 분할 밀도", "Mesh Grid Density")} valueText={`${mesh.cols}×${mesh.rows} (${mesh.triangles.length})`} inputTestId="puppet-mesh-density-slider" min={4} max={14} step={1} value={meshCols} onChange={setMeshCols} />
            <SliderRow id={`${uid}-alpha`} label={pick("관절 감쇠 계수 (α)", "Joint Falloff (α)")} valueText={alpha.toFixed(2)} inputTestId="puppet-alpha-slider" min={1} max={3} step={0.25} value={alpha} onChange={setAlpha} />
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-fg">{pick("관절 핀 목록", "Joint Pins")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {pins.map((pin) => (
                <button key={pin.id} type="button" aria-pressed={selectedPin?.id === pin.id} data-testid={`puppet-pin-chip-${pin.id}`} onClick={() => setSelectedPinId(pin.id)} className={`${CHIP_BASE} ${selectedPin?.id === pin.id ? "border-accent bg-accent-soft text-fg" : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg"}`}>
                  {pin.locked ? <Lock className="h-3 w-3 text-warn" aria-hidden="true" /> : null}
                  <span>{pin.label}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedPin ? (
            <div className="space-y-2.5 rounded-lg border border-line bg-raised p-3" data-testid="puppet-selected-pin-inspector">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-fg">{selectedPin.label}</p>
                  <p className="tabular-nums text-[11px] text-fg-3">
                    {pick("기준", "Rest")} ({selectedPin.restX.toFixed(0)}, {selectedPin.restY.toFixed(0)}) → {pick("목표", "Target")} ({(selectedPin.locked ? selectedPin.restX : selectedPin.targetX).toFixed(0)}, {(selectedPin.locked ? selectedPin.restY : selectedPin.targetY).toFixed(0)})
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-pressed={selectedPin.locked} data-testid="puppet-pin-lock-btn" onClick={() => handleToggleLock(selectedPin)} className={selectedPin.locked ? BTN_ACTIVE : BTN}>
                    {selectedPin.locked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Unlock className="h-3.5 w-3.5" aria-hidden="true" />}
                    {selectedPin.locked ? pick("잠금 해제", "Unlock") : pick("핀 잠금", "Lock Pin")}
                  </button>
                  <button type="button" disabled={pins.length <= 1} data-testid="puppet-pin-delete-btn" aria-label={pick("선택 핀 삭제", "Delete selected pin")} onClick={() => handleDeletePin(selectedPin)} className={BTN}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <SliderRow id={`${uid}-pin-x`} label={pick("수평 위치 X", "Target X")} valueText={`${(selectedPin.locked ? selectedPin.restX : selectedPin.targetX).toFixed(1)}px`} inputTestId="puppet-pin-x-slider" min={0} max={safeW} step={1} disabled={selectedPin.locked} value={selectedPin.locked ? selectedPin.restX : selectedPin.targetX} onChange={(next) => updateSinglePin(selectedPin.id, (item) => ({ ...item, targetX: next }), pick(`"${selectedPin.label}" X 좌표를 조정했습니다.`, `Adjusted "${selectedPin.label}" X position.`))} />
              <SliderRow id={`${uid}-pin-y`} label={pick("수직 위치 Y", "Target Y")} valueText={`${(selectedPin.locked ? selectedPin.restY : selectedPin.targetY).toFixed(1)}px`} inputTestId="puppet-pin-y-slider" min={0} max={safeH} step={1} disabled={selectedPin.locked} value={selectedPin.locked ? selectedPin.restY : selectedPin.targetY} onChange={(next) => updateSinglePin(selectedPin.id, (item) => ({ ...item, targetY: next }), pick(`"${selectedPin.label}" Y 좌표를 조정했습니다.`, `Adjusted "${selectedPin.label}" Y position.`))} />
              <SliderRow id={`${uid}-pin-rot`} label={pick("핀 회전 각도", "Pin Rotation")} valueText={`${selectedPin.locked ? 0 : selectedPin.rotationDeg}°`} valueTestId="puppet-pin-rotation-value" inputTestId="puppet-pin-rotation-slider" min={-180} max={180} step={1} disabled={selectedPin.locked} value={selectedPin.locked ? 0 : selectedPin.rotationDeg} onChange={(next) => updateSinglePin(selectedPin.id, (item) => ({ ...item, rotationDeg: next }), pick(`"${selectedPin.label}" 회전을 ${next}°로 설정했습니다.`, `Rotated "${selectedPin.label}" to ${next}°.`))} />
            </div>
          ) : null}
        </div>
      </div>

      <p role="status" data-testid="puppet-status-notice" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2">
        {resolvedNotice}
      </p>
    </section>
  );
}
