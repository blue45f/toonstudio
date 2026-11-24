/**
 * 2D 러프 스케치 -> 3D 캐릭터 포즈 · 카메라 화각 · 3점 조명 동시 역산 패널 (Sketch-to-3D Stage Solver).
 * Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 금지 · Web Storage 금지 · props 없이 단독 렌더 · KO/EN).
 */

import {
  Box,
  CheckCircle2,
  Eraser,
  Layers,
  PenTool,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  getSketchStagePreset,
  normalizeCanvasPoint,
  SKETCH_STAGE_PRESETS,
  solveSketchTo3dStage,
  type SketchPoint2D,
  type SketchStageDocument,
  type SketchStagePresetId,
  type SketchStroke2D,
  type SketchStrokeKind,
  type SketchTo3dStageResult,
} from "./sketch-to-3d-stage-solver";
import { formatAngleCategory, formatSignedDeg } from "./sketch-to-3d-stage-format";
import {
  StudioSketchCameraLightingReadouts,
  StudioSketchPoseReadout,
  type PoseReadoutMode,
} from "./StudioSketchTo3dStageReadouts";

export interface StudioSketchTo3dStagePanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialPresetId?: SketchStagePresetId;
  readonly initialSketch?: SketchStageDocument;
  readonly onStageSolved?: (result: SketchTo3dStageResult) => void;
  readonly onApplyTo3dStage?: (result: SketchTo3dStageResult) => void;
}

type DrawToolId =
  | "head"
  | "spine"
  | "arm"
  | "leg"
  | "vanishingPairA"
  | "vanishingPairB"
  | "shadowHatch";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const DRAW_TOOLS: readonly {
  readonly id: DrawToolId;
  readonly ko: string;
  readonly en: string;
}[] = [
  { id: "head", ko: "머리 원", en: "Head Circle" },
  { id: "spine", ko: "척추선", en: "Spine Line" },
  { id: "arm", ko: "팔 제스처", en: "Arm Gesture" },
  { id: "leg", ko: "다리 제스처", en: "Leg Gesture" },
  { id: "vanishingPairA", ko: "소실선 A", en: "Vanishing A" },
  { id: "vanishingPairB", ko: "소실선 B", en: "Vanishing B" },
  { id: "shadowHatch", ko: "그림자 빗금", en: "Shadow Hatch" },
];

function resolveCanvasColorToken(canvas: HTMLCanvasElement, cssVar: string): string {
  const computed = globalThis.getComputedStyle?.(canvas);
  const token = computed?.getPropertyValue(cssVar).trim();
  return token && token.length > 0 ? token : "currentColor";
}

function strokeTokenForKind(kind: SketchStrokeKind): {
  readonly cssVar: string;
  readonly lineWidth: number;
  readonly dashed: boolean;
} {
  if (kind === "vanishingPairA") return { cssVar: "--color-cool", lineWidth: 1.5, dashed: true };
  if (kind === "vanishingPairB") return { cssVar: "--color-good", lineWidth: 1.5, dashed: true };
  if (kind === "shadowHatch") return { cssVar: "--color-warn", lineWidth: 2, dashed: false };
  if (kind === "head" || kind === "spine") return { cssVar: "--color-accent", lineWidth: 2.5, dashed: false };
  return { cssVar: "--color-fg", lineWidth: 2.2, dashed: false };
}

/** 2D 러프 스케치 -> 3D 포즈·카메라·조명 동시 역산 단독 패널. */
export function StudioSketchTo3dStagePanel({
  locale,
  className,
  initialPresetId = "high-angle-action-punch",
  initialSketch,
  onStageSolved,
  onApplyTo3dStage,
}: StudioSketchTo3dStagePanelProps = {}): ReactElement {
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activePresetId, setActivePresetId] = useState<SketchStagePresetId | null>(
    initialSketch ? null : initialPresetId,
  );
  const [strokes, setStrokes] = useState<readonly SketchStroke2D[]>(
    () => initialSketch?.strokes ?? getSketchStagePreset(initialPresetId).sketch.strokes,
  );
  const [aspectRatio, setAspectRatio] = useState<number>(
    () => initialSketch?.aspectRatio ?? getSketchStagePreset(initialPresetId).sketch.aspectRatio ?? 16 / 9,
  );
  const [activeTool, setActiveTool] = useState<DrawToolId>("arm");
  const [draftPoints, setDraftPoints] = useState<readonly SketchPoint2D[] | null>(null);
  const [poseMode, setPoseMode] = useState<PoseReadoutMode>("euler");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeSeqRef = useRef<number>(1);

  const effectiveStrokes = useMemo<readonly SketchStroke2D[]>(() => {
    if (!draftPoints || draftPoints.length < 2) return strokes;
    return [...strokes, { id: "live-draft", kind: activeTool, points: draftPoints }];
  }, [activeTool, draftPoints, strokes]);

  const solved = useMemo<SketchTo3dStageResult>(
    () => solveSketchTo3dStage({ aspectRatio, strokes: effectiveStrokes }),
    [aspectRatio, effectiveStrokes],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = resolveCanvasColorToken(canvas, "--color-line");
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    for (const frac of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.moveTo(w * frac, 0);
      ctx.lineTo(w * frac, h);
      ctx.moveTo(0, h * frac);
      ctx.lineTo(w, h * frac);
      ctx.stroke();
    }
    ctx.restore();

    const horizonY = solved.camera.horizonYNormalized * h;
    if (horizonY >= -h * 0.2 && horizonY <= h * 1.2) {
      ctx.save();
      ctx.strokeStyle = resolveCanvasColorToken(canvas, "--color-fg-3");
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w, horizonY);
      ctx.stroke();
      ctx.restore();
    }

    for (const stroke of effectiveStrokes) {
      if (stroke.points.length < 2) continue;
      const spec = strokeTokenForKind(stroke.kind);
      ctx.save();
      ctx.strokeStyle = resolveCanvasColorToken(canvas, spec.cssVar);
      ctx.lineWidth = spec.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (spec.dashed) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      const first = stroke.points[0];
      if (first) {
        ctx.moveTo(first.x * w, first.y * h);
        for (let i = 1; i < stroke.points.length; i += 1) {
          const pt = stroke.points[i];
          if (pt) ctx.lineTo(pt.x * w, pt.y * h);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    if (solved.lighting.shadowCentroid) {
      const sx = solved.lighting.shadowCentroid.x * w;
      const sy = solved.lighting.shadowCentroid.y * h;
      const cx = solved.pose.landmarks.characterCenter.x * w;
      const cy = solved.pose.landmarks.characterCenter.y * h;

      ctx.save();
      ctx.fillStyle = resolveCanvasColorToken(canvas, "--color-warn");
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = resolveCanvasColorToken(canvas, "--color-accent");
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + solved.lighting.key.direction.x * 58, cy - solved.lighting.key.direction.y * 58);
      ctx.stroke();
      ctx.restore();
    }
  }, [effectiveStrokes, solved]);

  const commitStrokes = useCallback(
    (nextStrokes: readonly SketchStroke2D[], nextAspect: number, presetId: SketchStagePresetId | null) => {
      setStrokes(nextStrokes);
      setAspectRatio(nextAspect);
      setActivePresetId(presetId);
      onStageSolved?.(solveSketchTo3dStage({ aspectRatio: nextAspect, strokes: nextStrokes }));
    },
    [onStageSolved],
  );

  const handleSelectPreset = useCallback(
    (presetId: SketchStagePresetId) => {
      const preset = getSketchStagePreset(presetId);
      setDraftPoints(null);
      commitStrokes(preset.sketch.strokes, preset.sketch.aspectRatio ?? 16 / 9, preset.id);
      setStatusMessage(
        isEn
          ? `Loaded preset "${preset.labelEn}" and solved pose, camera, and 3-point lighting.`
          : `"${preset.labelKo}" 프리셋을 불러와 3D 포즈·카메라·조명을 역산했습니다.`,
      );
    },
    [commitStrokes, isEn],
  );

  const extractNormalizedPoint = (event: ReactPointerEvent<HTMLCanvasElement>): SketchPoint2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return normalizeCanvasPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width > 0 ? rect.width : CANVAS_WIDTH,
      rect.height > 0 ? rect.height : CANVAS_HEIGHT,
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const pt = extractNormalizedPoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraftPoints([pt]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!draftPoints) return;
    const pt = extractNormalizedPoint(event);
    const prev = draftPoints[draftPoints.length - 1];
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 0.004) return;
    setDraftPoints([...draftPoints, pt]);
  };

  const finishDraftStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!draftPoints) return;
    const endPt = extractNormalizedPoint(event);
    const finalPoints =
      draftPoints.length === 1 && draftPoints[0] ? [draftPoints[0], endPt] : [...draftPoints, endPt];
    setDraftPoints(null);
    const first = finalPoints[0];
    const last = finalPoints[finalPoints.length - 1];
    if (finalPoints.length < 2 || !first || !last || Math.hypot(last.x - first.x, last.y - first.y) < 0.005) return;

    const seq = strokeSeqRef.current;
    strokeSeqRef.current += 1;
    const nextStrokes = [...strokes, { id: `user-${activeTool}-${seq}`, kind: activeTool, points: finalPoints }];
    commitStrokes(nextStrokes, aspectRatio, null);
    setStatusMessage(
      isEn
        ? `Added stroke #${nextStrokes.length} and updated 3D stage solution.`
        : `러프 스트로크 ${nextStrokes.length}획을 반영해 3D 스테이지를 갱신했습니다.`,
    );
  };

  const handleUndoStroke = (): void => {
    if (strokes.length === 0) return;
    const nextStrokes = strokes.slice(0, -1);
    commitStrokes(nextStrokes, aspectRatio, null);
    setStatusMessage(
      isEn
        ? `Removed last stroke (${nextStrokes.length} remaining).`
        : `마지막 스트로크를 되돌렸습니다 (남은 획 ${nextStrokes.length}개).`,
    );
  };

  const handleClearCanvas = (): void => {
    setDraftPoints(null);
    commitStrokes([], aspectRatio, null);
    setStatusMessage(
      isEn
        ? "Cleared rough canvas. Draw strokes or choose a preset."
        : "러프 캔버스를 비웠습니다. 직접 그리거나 프리셋을 선택해 주세요.",
    );
  };

  const handleApplyStage = (): void => {
    onApplyTo3dStage?.(solved);
    setStatusMessage(
      isEn
        ? `Applied 3D stage: ${solved.camera.focalLengthMm}mm lens, ${formatAngleCategory(solved.camera.angleCategory, true)}, key ${formatSignedDeg(solved.lighting.key.azimuthDeg)}.`
        : `3D 스테이지 적용 완료: ${solved.camera.focalLengthMm}mm 화각 · ${formatAngleCategory(solved.camera.angleCategory, false)} · 주광 ${formatSignedDeg(solved.lighting.key.azimuthDeg)}.`,
    );
  };

  const activePresetMeta = activePresetId ? getSketchStagePreset(activePresetId) : null;

  return (
    <section
      data-testid="sketch-to-3d-stage-panel"
      aria-label={pick("2D 러프 스케치 3D 스테이지 역산기", "Sketch-to-3D Stage Solver")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Box className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("러프 스케치 → 3D 스테이지 동시 역산", "Sketch-to-3D Stage Solver")}
            </h2>
            <span
              data-testid="sketch-stage-summary-pill"
              className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent tabular-nums"
            >
              {solved.camera.focalLengthMm}mm · {formatAngleCategory(solved.camera.angleCategory, isEn)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "2D 러프 스트로크(머리·척추·팔다리·소실선·그림자 빗금)에서 VRM 포즈·화각·3점 조명을 동시에 역산합니다.",
              "Simultaneously solves VRM humanoid pose, camera lens/angle, and 3-point lighting from 2D rough strokes.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="sketch-stage-confidence-badge"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 tabular-nums"
          >
            {pick(
              `신뢰도 ${Math.round(solved.overallConfidence * 100)}% · ${solved.strokeCount}획`,
              `Confidence ${Math.round(solved.overallConfidence * 100)}% · ${solved.strokeCount} strokes`,
            )}
          </span>
          <button
            type="button"
            data-testid="sketch-stage-apply-btn"
            className={BTN_PRIMARY}
            onClick={handleApplyStage}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("3D 스테이지 적용", "Apply to 3D Stage")}
          </button>
        </div>
      </header>

      <div className="space-y-2 rounded-lg border border-line bg-card p-3" data-testid="sketch-stage-preset-bar">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-fg">{pick("2D 러프 프리셋 (4종)", "2D Rough Presets (4)")}</span>
          <span className="text-fg-2">
            {activePresetMeta
              ? pick(activePresetMeta.summaryKo, activePresetMeta.summaryEn)
              : pick("사용자 직접 드로잉 모드", "Custom Hand-Drawn Rough Mode")}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SKETCH_STAGE_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                data-testid={`sketch-stage-preset-${preset.id}`}
                onClick={() => handleSelectPreset(preset.id)}
                className={`${CHIP_BASE} ${
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg"
                }`}
              >
                {pick(preset.labelKo, preset.labelEn)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-3 rounded-lg border border-line bg-card p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
              <PenTool className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("인터랙티브 2D 러프 캔버스", "Interactive 2D Rough Canvas")}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="sketch-stage-undo-btn"
                className={BTN_OUTLINE}
                onClick={handleUndoStroke}
                disabled={strokes.length === 0}
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("되돌리기", "Undo")}
              </button>
              <button
                type="button"
                data-testid="sketch-stage-clear-btn"
                className={BTN_OUTLINE}
                onClick={handleClearCanvas}
                disabled={strokes.length === 0}
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("비우기", "Clear")}
              </button>
            </div>
          </div>

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={pick("러프 스트로크 레이어 도구", "Rough Stroke Layer Tools")}
          >
            {DRAW_TOOLS.map((tool) => {
              const active = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`sketch-stage-tool-${tool.id}`}
                  onClick={() => setActiveTool(tool.id)}
                  className={`${CHIP_BASE} ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-canvas text-fg-2 hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {pick(tool.ko, tool.en)}
                </button>
              );
            })}
          </div>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            data-testid="sketch-stage-canvas"
            aria-label={pick("2D 러프 스케치 드로잉 캔버스", "2D Rough Sketch Drawing Canvas")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDraftStroke}
            onPointerCancel={finishDraftStroke}
            className="aspect-[16/9] w-full cursor-crosshair touch-none rounded-lg border border-line bg-canvas text-fg"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" />
              {pick(
                "머리·척추(강조색) · 팔다리(전경) · 소실선 A/B(점선) · 그림자 빗금(경고색)",
                "Head/Spine (Accent) · Limbs (Ink) · Vanishing A/B (Dashed) · Shadow Hatch (Warn)",
              )}
            </span>
            <span className="tabular-nums">
              {pick(
                `지평선 Y ${Math.round(solved.camera.horizonYNormalized * 100)}%`,
                `Horizon Y ${Math.round(solved.camera.horizonYNormalized * 100)}%`,
              )}
            </span>
          </div>
        </div>

        <StudioSketchCameraLightingReadouts solved={solved} isEn={isEn} />
      </div>

      <StudioSketchPoseReadout
        solved={solved}
        poseMode={poseMode}
        onChangePoseMode={setPoseMode}
        isEn={isEn}
      />

      {statusMessage ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="sketch-stage-status"
          className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2"
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
