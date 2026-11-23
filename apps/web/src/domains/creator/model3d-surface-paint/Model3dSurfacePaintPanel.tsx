/**
 * Clip Studio Paint 4.0~5.0 스타일 3D 표면 직접 페인팅 & 4층 비파괴 텍스처 레이어링 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 미사용 · 명시적 transition 속성만 사용 · 500줄 이하 · KO/EN 지원).
 */

import { Box, Download, Eraser, Eye, EyeOff, Grid3x3, Layers, Paintbrush, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_CAMERA_CONFIG, DEFAULT_TEXTURE_SIZE, SURFACE_BRUSH_SWATCHES,
  applyPresetStampToTextureLayer, auditUvMeshIntegrity, buildSurfacePaintMeshPreset,
  clearSingleTextureLayer, composite3dTextureStack, createDefault3dTextureStack,
  createPerspectiveRayFromViewport, exportBakedUvSheetPng, paintBrushDabOnTextureLayer,
  paintBrushStrokeOnTextureLayer, rasterizeTexturedMeshPreview, raycastMeshToUv,
  type BakedUvSheetPng, type PresetStampKind, type SurfacePaintMeshPresetId,
  type TextureBlendMode, type TextureLayer3d, type TextureLayerRole, type UvRaycastHit,
} from "./uv-raycast-surface-painter";

export interface Model3dSurfacePaintPanelProps {
  readonly initialMeshPreset?: SurfacePaintMeshPresetId;
  readonly initialYawDeg?: number;
  readonly initialPitchDeg?: number;
  readonly textureSize?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onTextureCompositeChange?: (rgba: Uint8ClampedArray, texSize: number) => void;
  readonly onExportUvSheetPng?: (baked: BakedUvSheetPng) => void;
}

const VIEWPORT_PX = 192;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_ACCENT = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_COMPACT = `inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md border border-line bg-card px-2.5 py-1.5 text-[11px] font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg ${FOCUS_RING}`;
const ICON_BTN = `inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-fg-2 transition-colors motion-reduce:transition-none hover:bg-raised hover:text-fg ${FOCUS_RING}`;

const MESH_PRESETS: readonly { readonly id: SurfacePaintMeshPresetId; readonly ko: string; readonly en: string }[] = [
  { id: "sphere-head", ko: "두상", en: "Head" },
  { id: "torso-armor", ko: "상체 아머", en: "Torso Armor" },
  { id: "prop-box", ko: "소품 박스", en: "Prop Box" },
];

const BLEND_MODES: readonly { readonly value: TextureBlendMode; readonly ko: string; readonly en: string }[] = [
  { value: "normal", ko: "표준 (Normal)", en: "Normal" },
  { value: "multiply", ko: "곱하기 (Multiply)", en: "Multiply" },
  { value: "screen", ko: "스크린 (Screen)", en: "Screen" },
];

const STAMP_BUTTONS: readonly { readonly kind: PresetStampKind; readonly role: TextureLayerRole; readonly ko: string; readonly en: string }[] = [
  { kind: "ink-guide", role: "ink-guide", ko: "선화 가이드", en: "Ink Guide" },
  { kind: "fabric-pattern", role: "fabric-pattern", ko: "의상 패턴", en: "Fabric Pattern" },
  { kind: "decal-scar", role: "decal-scar", ko: "흉터 데칼", en: "Scar Decal" },
];

interface ControlSliderProps {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly valueTestId?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}

function ControlSlider({ id, label, valueText, valueTestId, min, max, step, value, onChange }: ControlSliderProps): ReactElement {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between text-fg-2">
        <label htmlFor={id}>{label}</label>
        <span data-testid={valueTestId} className="tabular-nums font-semibold text-fg">{valueText}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
    </div>
  );
}

/** 3D 모델 UV 표면 직접 페인팅 · 4층 비파괴 텍스처 레이어링 · 2D UV 시트 베이크 통합 패널. */
export function Model3dSurfacePaintPanel({
  initialMeshPreset = "sphere-head",
  initialYawDeg = 18,
  initialPitchDeg = -8,
  textureSize = DEFAULT_TEXTURE_SIZE,
  locale,
  className,
  onTextureCompositeChange,
  onExportUvSheetPng,
}: Model3dSurfacePaintPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const safeTexSize = Math.max(32, Math.min(256, Math.floor(textureSize)));
  const [meshPreset, setMeshPreset] = useState<SurfacePaintMeshPresetId>(initialMeshPreset);
  const [yawDeg, setYawDeg] = useState<number>(initialYawDeg);
  const [pitchDeg, setPitchDeg] = useState<number>(initialPitchDeg);
  const [layers, setLayers] = useState<readonly TextureLayer3d[]>(() => createDefault3dTextureStack(safeTexSize, initialMeshPreset));
  const [activeRole, setActiveRole] = useState<TextureLayerRole>("ink-guide");
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>(SURFACE_BRUSH_SWATCHES[0]?.id ?? "sumi-ink");
  const [brushRadiusPx, setBrushRadiusPx] = useState<number>(5);
  const [brushHardness, setBrushHardness] = useState<number>(0.65);
  const [showUvWireframe, setShowUvWireframe] = useState<boolean>(true);
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [lastHit, setLastHit] = useState<UvRaycastHit | null>(null);
  const [reticlePos, setReticlePos] = useState<{ readonly xPct: number; readonly yPct: number } | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStateRef = useRef<{ drawing: boolean; lastUv: { u: number; v: number } | null }>({ drawing: false, lastUv: null });

  const mesh = useMemo(() => buildSurfacePaintMeshPreset(meshPreset), [meshPreset]);
  const meshIntegrity = useMemo(() => auditUvMeshIntegrity(mesh), [mesh]);
  const composited = useMemo(() => composite3dTextureStack(layers, safeTexSize), [layers, safeTexSize]);
  const previewPixels = useMemo(
    () => rasterizeTexturedMeshPreview(mesh, composited.rgba, safeTexSize, VIEWPORT_PX, yawDeg, pitchDeg, DEFAULT_CAMERA_CONFIG),
    [composited.rgba, mesh, pitchDeg, safeTexSize, yawDeg],
  );
  const bakedSheet = useMemo(
    () => exportBakedUvSheetPng(composited.rgba, safeTexSize, showUvWireframe ? { meshForWireframe: mesh } : {}),
    [composited.rgba, mesh, safeTexSize, showUvWireframe],
  );
  const activeSwatch = SURFACE_BRUSH_SWATCHES.find((item) => item.id === selectedSwatchId) ?? SURFACE_BRUSH_SWATCHES[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(previewPixels), VIEWPORT_PX, VIEWPORT_PX), 0, 0);
  }, [previewPixels]);

  const commitLayers = (nextLayers: readonly TextureLayer3d[], notice?: string): void => {
    setLayers(nextLayers);
    if (notice !== undefined) setStatusNotice(notice);
    if (onTextureCompositeChange) {
      onTextureCompositeChange(composite3dTextureStack(nextLayers, safeTexSize).rgba, safeTexSize);
    }
  };

  const paintAtNormalizedPoint = (normX: number, normY: number, isContinuousDrag: boolean): boolean => {
    const ray = createPerspectiveRayFromViewport(normX, normY, DEFAULT_CAMERA_CONFIG);
    const hit = raycastMeshToUv(ray.origin, ray.dir, mesh, yawDeg, pitchDeg);
    if (!hit) {
      setReticlePos(null);
      return false;
    }
    setLastHit(hit);
    setReticlePos({ xPct: normX * 100, yPct: normY * 100 });
    const colorRgba = activeSwatch?.rgba ?? ([26, 28, 36, 255] as const);
    const prevUv = isContinuousDrag ? pointerStateRef.current.lastUv : null;
    pointerStateRef.current.lastUv = { u: hit.u, v: hit.v };

    const nextLayers = layers.map((layer) => {
      if (layer.role !== activeRole) return layer;
      const cloned = new Uint8ClampedArray(layer.rgba);
      if (prevUv) {
        paintBrushStrokeOnTextureLayer(cloned, safeTexSize, prevUv.u, prevUv.v, hit.u, hit.v, brushRadiusPx, colorRgba, brushHardness, { wrapU: mesh.seamWrappedU });
      } else {
        paintBrushDabOnTextureLayer(cloned, safeTexSize, hit.u, hit.v, brushRadiusPx, colorRgba, brushHardness, { wrapU: mesh.seamWrappedU });
      }
      return { ...layer, visible: true, rgba: cloned };
    });
    setStrokeCount((prev) => prev + 1);
    commitLayers(nextLayers);
    return true;
  };

  const resolveNormCoords = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : VIEWPORT_PX;
    const height = rect.height > 0 ? rect.height : VIEWPORT_PX;
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)) };
  };

  const handleViewportPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    const { x, y } = resolveNormCoords(event);
    pointerStateRef.current = { drawing: true, lastUv: null };
    paintAtNormalizedPoint(x, y, false);
  };

  const handleViewportPointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const { x, y } = resolveNormCoords(event);
    if (pointerStateRef.current.drawing) {
      paintAtNormalizedPoint(x, y, true);
      return;
    }
    const ray = createPerspectiveRayFromViewport(x, y, DEFAULT_CAMERA_CONFIG);
    const hoverHit = raycastMeshToUv(ray.origin, ray.dir, mesh, yawDeg, pitchDeg);
    setLastHit(hoverHit ?? lastHit);
    setReticlePos(hoverHit ? { xPct: x * 100, yPct: y * 100 } : null);
  };

  const handleViewportPointerEnd = (): void => {
    pointerStateRef.current = { drawing: false, lastUv: null };
  };

  const handleViewportKeyboardClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.detail === 0) paintAtNormalizedPoint(0.5, 0.5, false);
  };

  const handleSwitchMesh = (nextPreset: SurfacePaintMeshPresetId): void => {
    setMeshPreset(nextPreset);
    setLastHit(null);
    setReticlePos(null);
    setStrokeCount(0);
    commitLayers(createDefault3dTextureStack(safeTexSize, nextPreset), pick("메쉬 프리셋과 4층 베이스 텍스처 스택을 전환했습니다.", "Switched 3D mesh preset and refreshed the 4-layer base stack."));
  };

  const handleApplyPresetStamp = (kind: PresetStampKind, targetRole: TextureLayerRole): void => {
    setActiveRole(targetRole);
    commitLayers(
      layers.map((layer) => (layer.role === targetRole ? applyPresetStampToTextureLayer(layer, safeTexSize, kind, meshPreset) : layer)),
      pick("1클릭 프로시저럴 스탬프를 해당 레이어에 적용했습니다.", "Applied 1-click procedural stamp to the target texture layer."),
    );
  };

  const handleResetAll = (): void => {
    setYawDeg(initialYawDeg);
    setPitchDeg(initialPitchDeg);
    setStrokeCount(0);
    setLastHit(null);
    commitLayers(createDefault3dTextureStack(safeTexSize, meshPreset), pick("4층 텍스처 스택과 카메라 각도를 초기화했습니다.", "Reset the 4-layer texture stack and camera angles."));
  };

  const handleExportPng = (): void => {
    onExportUvSheetPng?.(bakedSheet);
    setStatusNotice(
      pick(
        `2D UV 시트 PNG 베이크 완료 (${bakedSheet.width}×${bakedSheet.height} · ${bakedSheet.byteLength.toLocaleString("en-US")} bytes · #${bakedSheet.checksumHex})`,
        `Baked 2D UV Sheet PNG (${bakedSheet.width}×${bakedSheet.height} · ${bakedSheet.byteLength.toLocaleString("en-US")} bytes · #${bakedSheet.checksumHex})`,
      ),
    );
  };

  const displayLayersTopDown = [...layers].reverse();

  return (
    <section
      aria-label={pick("3D 표면 직접 페인팅 및 4층 텍스처 레이어링", "3D Direct Surface Paint & 4-Layer Texture Stack")}
      data-testid="model3d-surface-paint-panel"
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Paintbrush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("3D UV 표면 직접 페인팅 · 4층 비파괴 텍스처", "3D UV Direct Surface Paint · 4-Layer Non-Destructive Stack")}</span>
          </div>
          <h2 className="text-sm font-bold text-fg">{pick("3D 메쉬 직접 드로잉 & 2D UV 베이크 스튜디오", "3D Mesh Direct Painting & 2D UV Bake Studio")}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
          <span
            data-testid="mesh-manifold-badge"
            className={`rounded-full border px-2.5 py-0.5 font-semibold ${meshIntegrity.isCleanManifold ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}
          >
            {meshIntegrity.isCleanManifold
              ? pick(`매니폴드 정상 · 비매니폴드 ${meshIntegrity.nonManifoldEdgeCount}건`, `Clean Manifold · ${meshIntegrity.nonManifoldEdgeCount} Non-Manifold`)
              : pick("토폴로지 점검 필요", "Topology Check Required")}
          </span>
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-fg-2">{pick(`삼각형 ${mesh.triangleCount}개`, `${mesh.triangleCount} tris`)}</span>
        </div>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-6">
          <div role="group" aria-label={pick("3D 메쉬 프리셋 선택", "3D Mesh Preset Selector")} className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-canvas p-1">
            {MESH_PRESETS.map((preset) => {
              const selected = preset.id === meshPreset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  data-testid={`mesh-preset-${preset.id}`}
                  onClick={() => handleSwitchMesh(preset.id)}
                  className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}
                >
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick(preset.ko, preset.en)}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-line bg-canvas p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-fg-2">
              <span className="font-semibold text-fg">{pick(mesh.nameKo, mesh.nameEn)}</span>
              <span data-testid="surface-hit-readout" className="tabular-nums text-fg-3">
                {lastHit ? `UV (${lastHit.u.toFixed(2)}, ${lastHit.v.toFixed(2)}) · Z ${lastHit.depth.toFixed(2)}` : pick("3D 표면을 클릭·드래그해 직접 칠하세요", "Click or drag directly on the 3D surface")}
              </span>
            </div>

            <button
              type="button"
              aria-label={pick("3D 표면 직접 페인팅 뷰포트", "3D Direct Surface Paint Viewport")}
              data-testid="surface-paint-viewport"
              data-stroke-count={strokeCount}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerLeave={handleViewportPointerEnd}
              onClick={handleViewportKeyboardClick}
              className={`relative mx-auto block aspect-square w-full max-w-[260px] cursor-crosshair select-none overflow-hidden rounded-xl border border-line-strong bg-card p-0 touch-none ${FOCUS_RING}`}
            >
              <canvas ref={canvasRef} width={VIEWPORT_PX} height={VIEWPORT_PX} className="block h-full w-full" />
              <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
                <line x1="50" y1="6" x2="50" y2="94" className="stroke-line opacity-40" strokeWidth="0.4" strokeDasharray="2 2" />
                <line x1="6" y1="50" x2="94" y2="50" className="stroke-line opacity-40" strokeWidth="0.4" strokeDasharray="2 2" />
                {reticlePos ? (
                  <g>
                    <circle cx={reticlePos.xPct} cy={reticlePos.yPct} r="3.6" className="fill-none stroke-accent" strokeWidth="1" />
                    <circle cx={reticlePos.xPct} cy={reticlePos.yPct} r="0.9" className="fill-accent" />
                  </g>
                ) : null}
              </svg>
            </button>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <ControlSlider id={`${uid}-yaw`} label={pick("좌우 회전 (Yaw)", "Yaw Rotation")} valueText={`${yawDeg}°`} valueTestId="yaw-value" min={-180} max={180} step={1} value={yawDeg} onChange={setYawDeg} />
              <ControlSlider id={`${uid}-pitch`} label={pick("상하 기울기 (Pitch)", "Pitch Tilt")} valueText={`${pitchDeg}°`} valueTestId="pitch-value" min={-75} max={75} step={1} value={pitchDeg} onChange={setPitchDeg} />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg">{pick("브러시 잉크 & 경도", "Brush Pigment & Hardness")}</span>
              <div className="flex items-center gap-1.5" role="group" aria-label={pick("브러시 색상 팔레트", "Brush Color Palette")}>
                {SURFACE_BRUSH_SWATCHES.map((swatch) => {
                  const selected = swatch.id === selectedSwatchId;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={pick(swatch.labelKo, swatch.labelEn)}
                      aria-pressed={selected}
                      onClick={() => setSelectedSwatchId(swatch.id)}
                      style={{ "--paint-swatch": swatch.swatchOklch } as CSSProperties}
                      className={`h-7 w-7 cursor-pointer rounded-full border-2 bg-[var(--paint-swatch)] transition-transform motion-reduce:transition-none ${FOCUS_RING} ${selected ? "scale-110 border-accent" : "border-line-strong hover:scale-105"}`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <ControlSlider id={`${uid}-radius`} label={pick("브러시 반경", "Brush Radius")} valueText={`${brushRadiusPx}px`} min={2} max={18} step={1} value={brushRadiusPx} onChange={setBrushRadiusPx} />
              <ControlSlider id={`${uid}-hardness`} label={pick("경도 (Hardness)", "Hardness")} valueText={`${Math.round(brushHardness * 100)}%`} min={0} max={100} step={5} value={Math.round(brushHardness * 100)} onChange={(v) => setBrushHardness(v / 100)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="stamp-center-surface-btn" onClick={() => paintAtNormalizedPoint(0.5, 0.5, false)} className={BTN_BASE}>
                <Paintbrush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("중앙 표면 찍기", "Stamp Center")}</span>
              </button>
              <button type="button" onClick={handleResetAll} className={BTN_BASE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("초기화", "Reset")}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-6">
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick("4층 비파괴 텍스처 레이어 스택", "4-Layer Non-Destructive Texture Stack")}</span>
              </div>
              <span className="tabular-nums text-[11px] text-fg-3">
                {pick(`표시 ${composited.visibleLayerCount}/4층 · 스트로크 ${strokeCount}회`, `${composited.visibleLayerCount}/4 visible · ${strokeCount} strokes`)}
              </span>
            </div>

            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {STAMP_BUTTONS.map((stamp) => (
                <button key={stamp.kind} type="button" data-testid={`quick-stamp-${stamp.kind}`} onClick={() => handleApplyPresetStamp(stamp.kind, stamp.role)} className={BTN_COMPACT}>
                  <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
                  <span>{pick(`1클릭 ${stamp.ko}`, `1-Click ${stamp.en}`)}</span>
                </button>
              ))}
            </div>

            <ul data-testid="texture-layer-stack" className="space-y-2">
              {displayLayersTopDown.map((layer) => {
                const selected = layer.role === activeRole;
                const opacityPct = Math.round(layer.opacity * 100);
                return (
                  <li key={layer.id} data-layer-role={layer.role} className={`rounded-lg border p-2.5 transition-colors motion-reduce:transition-none ${selected ? "border-accent bg-accent-soft/30" : "border-line bg-canvas"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" aria-pressed={selected} data-testid={`select-layer-${layer.role}`} onClick={() => setActiveRole(layer.role)} className={`min-h-8 flex-1 cursor-pointer truncate text-left text-xs font-semibold text-fg ${FOCUS_RING}`}>
                        {pick(layer.nameKo, layer.nameEn)}
                      </button>
                      <div className="flex items-center gap-1">
                        <button type="button" aria-pressed={layer.visible} aria-label={pick(`${layer.nameKo} 표시 전환`, `Toggle ${layer.nameEn} visibility`)} data-testid={`toggle-visible-${layer.role}`} onClick={() => commitLayers(layers.map((item) => (item.role === layer.role ? { ...item, visible: !item.visible } : item)))} className={ICON_BTN}>
                          {layer.visible ? <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" />}
                        </button>
                        <button type="button" aria-label={pick(`${layer.nameKo} 레이어 비우기`, `Clear ${layer.nameEn} layer`)} data-testid={`clear-layer-${layer.role}`} onClick={() => commitLayers(layers.map((item) => (item.role === layer.role ? clearSingleTextureLayer(item, safeTexSize, meshPreset) : item)), pick("선택한 레이어만 비파괴적으로 초기화했습니다.", "Cleared only the selected layer non-destructively."))} className={ICON_BTN}>
                          <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-12 items-center gap-2 text-[11px]">
                      <select aria-label={pick(`${layer.nameKo} 블렌드 모드`, `${layer.nameEn} blend mode`)} data-testid={`blend-mode-${layer.role}`} value={layer.blendMode} onChange={(e) => commitLayers(layers.map((item) => (item.role === layer.role ? { ...item, blendMode: e.target.value as TextureBlendMode } : item)))} className={`col-span-5 rounded-md border border-line bg-card px-2 py-1 text-[11px] font-medium text-fg ${FOCUS_RING}`}>
                        {BLEND_MODES.map((m) => <option key={m.value} value={m.value}>{pick(m.ko, m.en)}</option>)}
                      </select>
                      <div className="col-span-7 flex items-center gap-2">
                        <input type="range" aria-label={pick(`${layer.nameKo} 불투명도`, `${layer.nameEn} opacity`)} data-testid={`opacity-slider-${layer.role}`} min={0} max={100} step={5} value={opacityPct} onChange={(e) => commitLayers(layers.map((item) => (item.role === layer.role ? { ...item, opacity: Math.min(1, Math.max(0, Number(e.target.value) / 100)) } : item)))} className="w-full accent-accent" />
                        <span className="w-9 shrink-0 text-right tabular-nums font-semibold text-fg-2">{opacityPct}%</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg">{pick("2D UV 시트 베이크 미리보기", "2D UV Sheet Bake Preview")}</span>
              <button type="button" aria-pressed={showUvWireframe} data-testid="toggle-uv-wireframe" onClick={() => setShowUvWireframe((prev) => !prev)} className={BTN_COMPACT}>
                <Grid3x3 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{showUvWireframe ? pick("UV 격자 켜짐", "UV Wireframe On") : pick("UV 격자 꺼짐", "UV Wireframe Off")}</span>
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <img src={bakedSheet.dataUrl} alt={pick("4층 합성 2D UV 베이크 시트 미리보기", "Composited 4-layer 2D UV baked sheet preview")} data-testid="uv-sheet-bake-preview" className="h-28 w-28 shrink-0 rounded-lg border border-line-strong bg-canvas object-cover" />
              <div className="flex-1 space-y-2 text-xs">
                <p className="leading-relaxed text-fg-2">
                  {pick("4층 비파괴 스택을 실시간 합성해 2D 캔버스·외부 3D 툴로 바로 가져갈 수 있는 무손실 PNG UV 시트를 베이크합니다.", "Composites the 4 non-destructive layers into a lossless local PNG UV sheet ready for 2D retouching or 3D export.")}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-fg-3">
                  <span>{bakedSheet.width}×{bakedSheet.height}px</span>
                  <span>·</span>
                  <span data-testid="uv-bake-bytes">{bakedSheet.byteLength.toLocaleString("en-US")} bytes</span>
                  <span>·</span>
                  <span data-testid="uv-bake-checksum">#{bakedSheet.checksumHex}</span>
                </div>
                <button type="button" data-testid="export-uv-png-btn" onClick={handleExportPng} className={BTN_ACCENT}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("2D UV 시트 PNG 베이크 내보내기", "Export Baked UV Sheet PNG")}</span>
                </button>
              </div>
            </div>
          </div>

          {statusNotice ? (
            <p role="status" data-testid="surface-paint-status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-medium text-good">{statusNotice}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
