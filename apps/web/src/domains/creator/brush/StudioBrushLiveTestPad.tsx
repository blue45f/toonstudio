import { Eraser, Moon, RotateCcw, Sun } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  evaluateDipPenRailroadingProfile,
  MANGA_NIB_PERSONALITY_PROFILES,
} from "@toonstudio/studio-brush-platform";

import { STUDIO_FOCUS_RING, StudioContextPill } from "../studio-panel-ui";
import { mixStudioSpectralWgm } from "../studio-spectral-wgm-mix-v1";

import {
  planStudioDynamicBrush,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushPlan,
} from "./studio-brush-dynamics";
import {
  resolveNormalizedStudioBrushDabColor,
  resolveNormalizedStudioBrushGrainAlphaMultiplier,
  studioBrushGrainIsActive,
} from "./studio-brush-material-dynamics";
import {
  composeStudioBrushDualTipAlphaMap,
  planNormalizedStudioBrushTipComposition,
  studioBrushDualTipUsesSolidEllipse,
} from "./studio-brush-tip-composition";
import {
  DEFAULT_STUDIO_BRUSH_UNIFIED_MEDIA_PHYSICS,
  type StudioBrushUnifiedMediaPhysics,
} from "./studio-brush-studio-constants";
import {
  buildStudioBrushTipAlphaMap,
  planStudioBrushTipStampWorldSamples,
  studioBrushTipUsesSolidEllipse,
} from "./studio-brush-tip-stamp";

import { cn } from "@/shared/lib/utils";

export type { StudioBrushUnifiedMediaPhysics };

const PAD_W = 288;
const PAD_H = 96;
const MAX_STORED_STROKES = 8;

const SAMPLE_POINTS: readonly number[] = [
  16, 62, 52, 35, 91, 77, 133, 27, 177, 64, 224, 42, 272, 67,
];
const SAMPLE_PRESSURES: readonly number[] = [0.12, 0.3, 0.9, 0.55, 1, 0.42, 0.2];
const SAMPLE_SPEEDS: readonly number[] = [0.15, 0.22, 0.4, 0.8, 1.2, 0.55, 0.2];
const SAMPLE_TILT_XS: readonly number[] = [0, 8, 25, 42, 55, 24, 0];
const SAMPLE_TILT_YS: readonly number[] = [0, 3, 14, 28, 18, 6, 0];
const SAMPLE_TWISTS: readonly number[] = [0, 30, 75, 130, 210, 300, 355];

export interface StudioBrushLiveTestPadProps {
  readonly settings: NormalizedStudioBrushDynamicsSettings;
  readonly strokeWidth: number;
  readonly color: string;
  readonly pressureCurve?: number;
  readonly useVelocityPressure?: boolean;
  readonly velocitySensitivity?: number;
  readonly mediaPhysics?: StudioBrushUnifiedMediaPhysics;
}

interface CapturedLiveStroke {
  readonly points: readonly number[];
  readonly pressures: readonly number[];
  readonly speeds: readonly number[];
  readonly tiltXs: readonly number[];
  readonly tiltYs: readonly number[];
  readonly twists: readonly number[];
}

interface LiveTelemetry {
  readonly pressure: number;
  readonly tiltDeg: number;
  readonly speed: number;
  readonly dabCount: number;
}

type CoalescedEvent = PointerEvent & {
  getCoalescedEvents?: () => readonly PointerEvent[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeCoalescedEvents(event: PointerEvent): readonly PointerEvent[] {
  const fn = (event as CoalescedEvent).getCoalescedEvents;
  if (typeof fn !== "function") return [event];
  try {
    const list = fn.call(event);
    return list.length > 0 ? list : [event];
  } catch {
    return [event];
  }
}

function parseHexColor(color: string): readonly [number, number, number] | null {
  const trimmed = color.trim();
  const short = /^#([0-9a-f]{3})$/iu.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1]!;
    return [
      Number.parseInt(`${r}${r}`, 16) / 255,
      Number.parseInt(`${g}${g}`, 16) / 255,
      Number.parseInt(`${b}${b}`, 16) / 255,
    ];
  }
  const full = /^#([0-9a-f]{6})$/iu.exec(trimmed);
  if (!full) return null;
  return [
    Number.parseInt(full[1]!.slice(0, 2), 16) / 255,
    Number.parseInt(full[1]!.slice(2, 4), 16) / 255,
    Number.parseInt(full[1]!.slice(4, 6), 16) / 255,
  ];
}

function rgbUnitToHex(r: number, g: number, b: number): string {
  const ch = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function resolveLiveDabColor(
  baseColor: string,
  dabIndex: number,
  normalized: NormalizedStudioBrushDynamicsSettings,
  paperTone: "dark" | "light",
  wetMixStrength: number,
): string {
  const base = resolveNormalizedStudioBrushDabColor(
    baseColor,
    dabIndex,
    normalized.seed,
    normalized.colorDynamics,
  );
  if (wetMixStrength <= 0.01) return base;
  const rgb = parseHexColor(base);
  if (!rgb) return base;
  // Blend with complementary paper/underpaint reflectance via spectral WGM
  const underpaint = paperTone === "light"
    ? { r: 0.96, g: 0.93, b: 0.86 }
    : { r: 0.24, g: 0.28, b: 0.36 };
  const mixed = mixStudioSpectralWgm(
    { r: rgb[0], g: rgb[1], b: rgb[2] },
    underpaint,
    1 - clamp(wetMixStrength * 0.55, 0, 0.7),
    1,
  );
  return rgbUnitToHex(mixed.r, mixed.g, mixed.b);
}

function getSafe2dContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  if (
    typeof navigator !== "undefined"
    && /jsdom/iu.test(navigator.userAgent)
    && !("mock" in canvas.getContext)
  ) {
    return null;
  }
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function paintPlansToCanvas(
  ctx: CanvasRenderingContext2D,
  plans: readonly StudioDynamicBrushPlan[],
  color: string,
  paperTone: "dark" | "light",
  mediaPhysics: StudioBrushUnifiedMediaPhysics,
): void {
  ctx.clearRect(0, 0, PAD_W, PAD_H);
  const nibSpec = (
    MANGA_NIB_PERSONALITY_PROFILES[mediaPhysics.nibPersonality] ??
    MANGA_NIB_PERSONALITY_PROFILES["g-pen"]
  ).spec;

  for (const plan of plans) {
    const normalized = plan.settings;
    const grainActive = studioBrushGrainIsActive(normalized.grain);
    const tips = [normalized.tip, ...normalized.tipLayers.map((layer) => layer.tip)];
    const ellipseTips = tips.map((tip, tipIndex) => (
      !grainActive && (tipIndex === 0
        ? studioBrushDualTipUsesSolidEllipse(tip, normalized.dualBrush)
        : studioBrushTipUsesSolidEllipse(tip))
    ));
    const alphaMaps = tips.map((tip, tipIndex) => (
      ellipseTips[tipIndex]
        ? null
        : tipIndex === 0
          ? composeStudioBrushDualTipAlphaMap(tip, normalized.dualBrush)
          : buildStudioBrushTipAlphaMap(tip)
    ));
    const strokeOriginX = plan.dabs[0]?.sourceX ?? plan.dabs[0]?.x ?? 0;
    const strokeOriginY = plan.dabs[0]?.sourceY ?? plan.dabs[0]?.y ?? 0;
    const grainAt = (x: number, y: number) => (
      resolveNormalizedStudioBrushGrainAlphaMultiplier(
        { x, y, strokeOriginX, strokeOriginY, strokeSeed: normalized.seed },
        normalized.grain,
      )
    );

    for (const dab of plan.dabs) {
      const dabColor = resolveLiveDabColor(
        color,
        dab.index,
        normalized,
        paperTone,
        mediaPhysics.wetMixStrength,
      );
      const composedTips = planNormalizedStudioBrushTipComposition(
        dab,
        normalized.tip,
        normalized.tipLayers,
      );

      for (const composedTip of composedTips) {
        const composedDab = composedTip.dab;
        const tipIndex = composedTip.role === "primary" ? 0 : composedTip.layerIndex + 1;
        const baseOpacity = clamp(composedDab.opacity * composedDab.flow, 0.02, 1);
        const alphaMap = alphaMaps[tipIndex] ?? null;

        if (ellipseTips[tipIndex] || !alphaMap) {
          const rx = Math.max(0.25, composedDab.size / 2);
          const ry = Math.max(0.2, rx * composedDab.roundness);
          const rad = (composedDab.angle * Math.PI) / 180;
          const opacity = clamp(baseOpacity * grainAt(composedDab.x, composedDab.y), 0.01, 1);

          // Optional impasto ridge shadow + specular relief
          if (mediaPhysics.impastoDepth > 0.02 && tipIndex === 0) {
            const lift = 0.6 + mediaPhysics.impastoDepth * 2.1;
            ctx.save();
            ctx.translate(composedDab.x + lift * 0.65, composedDab.y + lift * 0.85);
            ctx.rotate(rad);
            ctx.globalAlpha = clamp(opacity * mediaPhysics.impastoDepth * 0.45, 0.02, 0.55);
            ctx.fillStyle = paperTone === "light" ? "rgba(18, 16, 14, 0.6)" : "rgba(0, 0, 0, 0.65)";
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Optional dip-pen railroading split tines under heavy pressure
          const railroad = mediaPhysics.railroadEnabled && tipIndex === 0
            ? evaluateDipPenRailroadingProfile(
                clamp(composedDab.size / 16, 0, 1) * nibSpec.gapMax,
                nibSpec.gapMax,
                mediaPhysics.railroadThreshold,
                0,
              )
            : null;

          if (railroad && railroad.splitRatio > 0.08) {
            const offset = rx * 0.52 * railroad.splitRatio;
            const perpX = -Math.sin(rad) * offset;
            const perpY = Math.cos(rad) * offset;
            const tineRx = Math.max(0.35, rx * (0.42 - railroad.splitRatio * 0.14));
            ctx.fillStyle = dabColor;
            for (const sign of [-1, 1] as const) {
              ctx.save();
              ctx.translate(composedDab.x + perpX * sign, composedDab.y + perpY * sign);
              ctx.rotate(rad);
              ctx.globalAlpha = clamp(opacity * railroad.outerTrackAlpha, 0.05, 1);
              ctx.beginPath();
              ctx.ellipse(0, 0, tineRx, ry * 0.85, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            ctx.save();
            ctx.translate(composedDab.x, composedDab.y);
            ctx.rotate(rad);
            ctx.globalAlpha = clamp(opacity * railroad.centerAlpha * 0.45, 0.02, 0.6);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * 0.55, ry * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(composedDab.x, composedDab.y);
            ctx.rotate(rad);
            ctx.globalAlpha = opacity;
            ctx.fillStyle = dabColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          if (mediaPhysics.impastoDepth > 0.08 && tipIndex === 0) {
            const lift = 0.5 + mediaPhysics.impastoDepth * 1.4;
            ctx.save();
            ctx.translate(composedDab.x - lift * 0.5, composedDab.y - lift * 0.55);
            ctx.rotate(rad);
            ctx.globalAlpha = clamp(opacity * mediaPhysics.impastoDepth * 0.35, 0.02, 0.4);
            ctx.fillStyle = "rgba(255, 252, 245, 0.85)";
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * 0.58, ry * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          ctx.fillStyle = dabColor;
          for (const sample of planStudioBrushTipStampWorldSamples(
            composedDab,
            composedTip.tip,
            { alphaMap, grid: 5 },
          )) {
            ctx.globalAlpha = clamp(
              baseOpacity * sample.alpha * grainAt(sample.x, sample.y),
              0.001,
              1,
            );
            ctx.beginPath();
            ctx.arc(sample.x, sample.y, sample.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function renderPlanToSvg(plan: StudioDynamicBrushPlan, color: string) {
  const normalized = plan.settings;
  const grainActive = studioBrushGrainIsActive(normalized.grain);
  const tips = [normalized.tip, ...normalized.tipLayers.map((layer) => layer.tip)];
  const ellipseTips = tips.map((tip, tipIndex) => (
    !grainActive && (tipIndex === 0
      ? studioBrushDualTipUsesSolidEllipse(tip, normalized.dualBrush)
      : studioBrushTipUsesSolidEllipse(tip))
  ));
  const alphaMaps = tips.map((tip, tipIndex) => (
    ellipseTips[tipIndex]
      ? null
      : tipIndex === 0
        ? composeStudioBrushDualTipAlphaMap(tip, normalized.dualBrush)
        : buildStudioBrushTipAlphaMap(tip)
  ));
  const strokeOriginX = plan.dabs[0]?.sourceX ?? plan.dabs[0]?.x ?? 0;
  const strokeOriginY = plan.dabs[0]?.sourceY ?? plan.dabs[0]?.y ?? 0;
  const grainAt = (x: number, y: number) => (
    resolveNormalizedStudioBrushGrainAlphaMultiplier(
      { x, y, strokeOriginX, strokeOriginY, strokeSeed: normalized.seed },
      normalized.grain,
    )
  );
  return plan.dabs.flatMap((dab) => {
    const dabColor = resolveNormalizedStudioBrushDabColor(
      color,
      dab.index,
      normalized.seed,
      normalized.colorDynamics,
    );
    return planNormalizedStudioBrushTipComposition(
      dab,
      normalized.tip,
      normalized.tipLayers,
    ).flatMap((composedTip) => {
      const composedDab = composedTip.dab;
      const tipIndex = composedTip.role === "primary" ? 0 : composedTip.layerIndex + 1;
      const baseOpacity = Math.min(1, Math.max(0.02, composedDab.opacity * composedDab.flow));
      const alphaMap = alphaMaps[tipIndex] ?? null;
      if (ellipseTips[tipIndex] || !alphaMap) {
        const radius = Math.max(0.25, composedDab.size / 2);
        return [(
          <ellipse
            key={`${dab.index}-${tipIndex}`}
            cx={composedDab.x}
            cy={composedDab.y}
            rx={radius}
            ry={radius * composedDab.roundness}
            fill={dabColor}
            opacity={Math.min(1, baseOpacity * grainAt(composedDab.x, composedDab.y))}
            transform={`rotate(${composedDab.angle} ${composedDab.x} ${composedDab.y})`}
          />
        )];
      }
      return planStudioBrushTipStampWorldSamples(
        composedDab,
        composedTip.tip,
        { alphaMap, grid: 5 },
      ).map((sample, sampleIndex) => (
        <circle
          key={`${dab.index}-${tipIndex}-${sampleIndex}`}
          cx={sample.x}
          cy={sample.y}
          r={sample.radius}
          fill={dabColor}
          opacity={Math.min(
            1,
            Math.max(0.001, baseOpacity * sample.alpha * grainAt(sample.x, sample.y)),
          )}
        />
      ));
    });
  });
}

/**
 * 실시간 인터랙티브 브러시 드로잉 테스트 패드.
 * - 초기/SSR 상태에서는 기존 256댑 결정론적 SVG 미리보기를 그대로 렌더링해 하위 계약을 100% 보존한다.
 * - 사용자가 포인터(펜·마우스·터치)로 직접 그리면 필압·기울기·속도·테이퍼·듀얼팁·임파스토·습식 혼색·
 *   레일로딩을 실제 `<canvas>`에 즉시 그려 보여준다.
 */
export function StudioBrushLiveTestPad({
  settings,
  strokeWidth,
  color,
  pressureCurve = 1,
  useVelocityPressure = true,
  velocitySensitivity = 0.65,
  mediaPhysics = DEFAULT_STUDIO_BRUSH_UNIFIED_MEDIA_PHYSICS,
}: StudioBrushLiveTestPadProps) {
  const [paperTone, setPaperTone] = useState<"dark" | "light">("dark");
  const [showSample, setShowSample] = useState(true);
  const [userStrokes, setUserStrokes] = useState<readonly CapturedLiveStroke[]>([]);
  const [draftStroke, setDraftStroke] = useState<CapturedLiveStroke | null>(null);
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStateRef = useRef<{
    id: number;
    points: number[];
    pressures: number[];
    speeds: number[];
    tiltXs: number[];
    tiltYs: number[];
    twists: number[];
    lastTimeMs: number;
  } | null>(null);

  const clampedWidth = Math.max(3, Math.min(28, strokeWidth));

  const samplePlan = useMemo(
    () =>
      planStudioDynamicBrush({
        points: SAMPLE_POINTS,
        pressures: SAMPLE_PRESSURES,
        speeds: SAMPLE_SPEEDS,
        tiltXs: SAMPLE_TILT_XS,
        tiltYs: SAMPLE_TILT_YS,
        twists: SAMPLE_TWISTS,
        baseWidth: clampedWidth,
        baseOpacity: settings.opacity.base,
        settings,
        maxDabs: 256,
      }),
    [clampedWidth, settings],
  );

  const livePlans = useMemo(() => {
    const strokes = draftStroke ? [...userStrokes, draftStroke] : userStrokes;
    return strokes.map((stroke) =>
      planStudioDynamicBrush({
        points: stroke.points,
        pressures: stroke.pressures,
        speeds: stroke.speeds,
        tiltXs: stroke.tiltXs,
        tiltYs: stroke.tiltYs,
        twists: stroke.twists,
        baseWidth: clampedWidth,
        baseOpacity: settings.opacity.base,
        settings,
        maxDabs: 256,
      }),
    );
  }, [clampedWidth, draftStroke, settings, userStrokes]);

  const hasUserStrokes = livePlans.length > 0;
  const activePlans = useMemo(
    () => (hasUserStrokes ? livePlans : showSample ? [samplePlan] : []),
    [hasUserStrokes, livePlans, samplePlan, showSample],
  );

  useEffect(() => {
    const ctx = getSafe2dContext(canvasRef.current);
    if (!ctx) return;
    paintPlansToCanvas(ctx, activePlans, color, paperTone, mediaPhysics);
  }, [activePlans, color, mediaPhysics, paperTone]);

  const resolveSampleFromPointer = useCallback(
    (
      nativeEvent: PointerEvent,
      rect: DOMRect,
      prevX: number | null,
      prevY: number | null,
      prevTimeMs: number,
    ) => {
      const x = rect.width > 0
        ? clamp(((nativeEvent.clientX - rect.left) / rect.width) * PAD_W, 0, PAD_W)
        : clamp(nativeEvent.clientX, 0, PAD_W);
      const y = rect.height > 0
        ? clamp(((nativeEvent.clientY - rect.top) / rect.height) * PAD_H, 0, PAD_H)
        : clamp(nativeEvent.clientY, 0, PAD_H);
      const nowMs = Number.isFinite(nativeEvent.timeStamp) && nativeEvent.timeStamp > 0
        ? nativeEvent.timeStamp
        : prevTimeMs + 8;
      const dt = Math.max(4, nowMs - prevTimeMs);
      const dist = prevX !== null && prevY !== null ? Math.hypot(x - prevX, y - prevY) : 0;
      const speed = clamp(dist / dt, 0, 4);
      const isPen = nativeEvent.pointerType === "pen" && Number.isFinite(nativeEvent.pressure) && nativeEvent.pressure > 0;
      const rawPressure = isPen
        ? clamp(nativeEvent.pressure, 0.02, 1)
        : useVelocityPressure
          ? clamp(0.9 - speed * 0.35 * clamp(velocitySensitivity, 0.1, 1), 0.14, 0.96)
          : 0.65;
      const curvedPressure = clamp(Math.pow(rawPressure, clamp(pressureCurve, 0.35, 2.5)), 0.02, 1);
      const tiltX = Number.isFinite(nativeEvent.tiltX) ? clamp(nativeEvent.tiltX, -90, 90) : 0;
      const tiltY = Number.isFinite(nativeEvent.tiltY) ? clamp(nativeEvent.tiltY, -90, 90) : 0;
      const twist = Number.isFinite(nativeEvent.twist) ? clamp(nativeEvent.twist, 0, 359) : 0;
      return { x, y, pressure: curvedPressure, speed, tiltX, tiltY, twist, timeMs: nowMs, dist };
    },
    [pressureCurve, useVelocityPressure, velocitySensitivity],
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // jsdom / embedded webview fallback
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const initial = resolveSampleFromPointer(
      event.nativeEvent,
      rect,
      null,
      null,
      event.nativeEvent.timeStamp || 0,
    );
    const nextState = {
      id: event.pointerId,
      points: [initial.x, initial.y],
      pressures: [initial.pressure],
      speeds: [initial.speed],
      tiltXs: [initial.tiltX],
      tiltYs: [initial.tiltY],
      twists: [initial.twist],
      lastTimeMs: initial.timeMs,
    };
    pointerStateRef.current = nextState;
    setShowSample(false);
    setDraftStroke({
      points: [...nextState.points],
      pressures: [...nextState.pressures],
      speeds: [...nextState.speeds],
      tiltXs: [...nextState.tiltXs],
      tiltYs: [...nextState.tiltYs],
      twists: [...nextState.twists],
    });
    setTelemetry({
      pressure: initial.pressure,
      tiltDeg: Math.round(Math.hypot(initial.tiltX, initial.tiltY)),
      speed: initial.speed,
      dabCount: 1,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = pointerStateRef.current;
    if (!active || active.id !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const coalesced = safeCoalescedEvents(event.nativeEvent);
    let added = false;
    let latestSample: ReturnType<typeof resolveSampleFromPointer> | null = null;
    for (const nativeSample of coalesced) {
      const prevX = active.points[active.points.length - 2] ?? null;
      const prevY = active.points[active.points.length - 1] ?? null;
      const sample = resolveSampleFromPointer(nativeSample, rect, prevX, prevY, active.lastTimeMs);
      if (sample.dist < 0.8) continue;
      active.points.push(sample.x, sample.y);
      active.pressures.push(sample.pressure);
      active.speeds.push(sample.speed);
      active.tiltXs.push(sample.tiltX);
      active.tiltYs.push(sample.tiltY);
      active.twists.push(sample.twist);
      active.lastTimeMs = sample.timeMs;
      latestSample = sample;
      added = true;
    }
    if (!added || !latestSample) return;
    const draft: CapturedLiveStroke = {
      points: [...active.points],
      pressures: [...active.pressures],
      speeds: [...active.speeds],
      tiltXs: [...active.tiltXs],
      tiltYs: [...active.tiltYs],
      twists: [...active.twists],
    };
    setDraftStroke(draft);
    setTelemetry({
      pressure: latestSample.pressure,
      tiltDeg: Math.round(Math.hypot(latestSample.tiltX, latestSample.tiltY)),
      speed: latestSample.speed,
      dabCount: active.pressures.length,
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = pointerStateRef.current;
    if (!active || active.id !== event.pointerId) return;
    pointerStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const committed: CapturedLiveStroke = {
      points: [...active.points],
      pressures: [...active.pressures],
      speeds: [...active.speeds],
      tiltXs: [...active.tiltXs],
      tiltYs: [...active.tiltYs],
      twists: [...active.twists],
    };
    setDraftStroke(null);
    setUserStrokes((prev) => [...prev.slice(-(MAX_STORED_STROKES - 1)), committed]);
  };

  const handleClear = () => {
    pointerStateRef.current = null;
    setDraftStroke(null);
    setUserStrokes([]);
    setShowSample(false);
    setTelemetry(null);
  };

  const handleRestoreSample = () => {
    pointerStateRef.current = null;
    setDraftStroke(null);
    setUserStrokes([]);
    setShowSample(true);
    setTelemetry(null);
  };

  const totalDabs = activePlans.reduce((sum, item) => sum + item.dabs.length, 0);

  return (
    <div
      data-studio-brush-live-test-pad="true"
      className="rounded-xl border border-line bg-card/55 p-2.5"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-semibold text-fg-2">실시간 테스트 패드</span>
        <StudioContextPill tone="neutral">필압 · 속도 · 기울기 · 회전</StudioContextPill>
      </div>

      <div
        data-appearance-preview={paperTone}
        data-paper-tone={paperTone}
        className="relative h-24 w-full overflow-hidden rounded-lg border border-line/70 bg-canvas"
      >
        <svg
          viewBox={`0 0 ${PAD_W} ${PAD_H}`}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            hasUserStrokes && "opacity-0",
          )}
          aria-hidden="true"
        >
          {!hasUserStrokes && showSample ? renderPlanToSvg(samplePlan, color) : null}
        </svg>
        <canvas
          ref={canvasRef}
          width={PAD_W}
          height={PAD_H}
          data-testid="studio-brush-live-test-canvas"
          aria-label="브러시 실시간 드로잉 테스트 캔버스"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          className="relative z-10 block h-full w-full cursor-crosshair touch-none"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="테스트 종이 배경 전환"
          className="inline-flex flex-1 rounded-lg border border-line bg-panel p-0.5"
        >
          <button
            type="button"
            data-testid="studio-brush-live-pad-paper-light"
            aria-pressed={paperTone === "light"}
            onClick={() => setPaperTone("light")}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors",
              STUDIO_FOCUS_RING,
              paperTone === "light"
                ? "bg-accent-soft text-accent"
                : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Sun size={13} aria-hidden />
            밝은 종이
          </button>
          <button
            type="button"
            data-testid="studio-brush-live-pad-paper-dark"
            aria-pressed={paperTone === "dark"}
            onClick={() => setPaperTone("dark")}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors",
              STUDIO_FOCUS_RING,
              paperTone === "dark"
                ? "bg-accent-soft text-accent"
                : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Moon size={13} aria-hidden />
            어두운 종이
          </button>
        </div>

        <button
          type="button"
          data-testid="studio-brush-live-pad-sample"
          aria-label="예시 획 다시 보기"
          onClick={handleRestoreSample}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <RotateCcw size={13} aria-hidden />
          예시
        </button>

        <button
          type="button"
          data-testid="studio-brush-live-pad-clear"
          aria-label="테스트 패드 지우기"
          onClick={handleClear}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <Eraser size={13} aria-hidden />
          지우기
        </button>
      </div>

      <p
        aria-live="polite"
        data-testid="studio-brush-live-pad-status"
        className="mt-1.5 text-xs leading-relaxed text-fg-3 tabular-nums"
      >
        {telemetry
          ? `필압 ${Math.round(telemetry.pressure * 100)}% · 기울기 ${telemetry.tiltDeg}° · 속도 ${telemetry.speed.toFixed(2)} · 도장 ${totalDabs}개`
          : !hasUserStrokes && !showSample
            ? "패드가 비었습니다. 펜이나 마우스로 직접 그어 확인하세요."
            : `직접 그어 필압·테이퍼·듀얼 팁·혼색을 바로 확인할 수 있습니다.${samplePlan.capped ? " 예시 도장은 256개로 제한됩니다." : ""}`}
      </p>
    </div>
  );
}
