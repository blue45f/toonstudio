import { z } from "zod";

/**
 * AnimationGraphIR — the connected animation-production layer (V11.1 §10.3).
 *
 * Cels, drawing levels, the exposure sheet (X-sheet), camera and audio hang
 * off one graph so the timeline, light table and batch output all read the
 * same structure. Cel pixels live in the scene/layer store; this graph owns
 * timing and references only.
 */

export const animationCelIRSchema = z.object({
  id: z.string().min(1),
  /** Scene node (layer) holding this cel's artwork. */
  sceneNodeId: z.string().min(1),
  label: z.string().default(""),
});
export type AnimationCelIR = z.infer<typeof animationCelIRSchema>;

/** A drawing level = one X-sheet column (A/B/C… in paper terms). */
export const animationLevelIRSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cels: z.array(animationCelIRSchema),
});
export type AnimationLevelIR = z.infer<typeof animationLevelIRSchema>;

/** One exposure: at `frame`, `levelId` shows `celId` (null = hold nothing). */
export const animationExposureIRSchema = z.object({
  frame: z.number().int().nonnegative(),
  levelId: z.string().min(1),
  celId: z.string().min(1).nullable(),
});
export type AnimationExposureIR = z.infer<typeof animationExposureIRSchema>;

/**
 * Segment easing for the span that *ends* at a keyframe (the same arrival
 * semantics the animatic timeline sampler uses). Presets are cubic beziers;
 * `custom` carries user-drawn control points from the curve editor.
 * Canonical preset values live in ANIMATION_EASING_PRESETS below and mirror
 * the web curve model (keyframe-curve-model.ts EASING_PRESETS).
 */
export const animationEasingIRSchema = z.enum([
  "hold",
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "ease-in-back",
  "ease-out-back",
  "custom",
]);
export type AnimationEasingIR = z.infer<typeof animationEasingIRSchema>;

/** Bezier control points (x1,y1,x2,y2): x in 0..1, y in -0.5..1.5 (overshoot). */
export const animationCurvePointsIRSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(-0.5).max(1.5),
  z.number().min(0).max(1),
  z.number().min(-0.5).max(1.5),
]);
export type AnimationCurvePointsIR = z.infer<typeof animationCurvePointsIRSchema>;

export const animationKeyframeIRSchema = z
  .object({
    frame: z.number().int().nonnegative(),
    value: z.number(),
    easing: animationEasingIRSchema.default("linear"),
    /** Required when easing is "custom"; ignored (and dropped) otherwise. */
    curve: animationCurvePointsIRSchema.optional(),
  })
  .superRefine((keyframe, ctx) => {
    if (keyframe.easing === "custom" && !keyframe.curve) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curve"],
        message: "custom easing requires bezier curve points",
      });
    }
    if (keyframe.curve && keyframe.curve[2] < keyframe.curve[0]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curve"],
        message: "curve control point x2 must not be left of x1",
      });
    }
  });
export type AnimationKeyframeIR = z.infer<typeof animationKeyframeIRSchema>;

export type AnimationSegmentEasingIR =
  | { readonly kind: "linear" }
  | { readonly kind: "step"; readonly at: number }
  | { readonly kind: "bezier"; readonly points: AnimationCurvePointsIR };

/** Canonical easing presets (mirror of the web curve model's EASING_PRESETS). */
export const ANIMATION_EASING_PRESETS: Readonly<Record<Exclude<AnimationEasingIR, "custom">, AnimationSegmentEasingIR>> = {
  linear: { kind: "linear" },
  hold: { kind: "step", at: 1 },
  "ease-in": { kind: "bezier", points: [0.42, 0, 1, 1] },
  "ease-out": { kind: "bezier", points: [0, 0, 0.58, 1] },
  "ease-in-out": { kind: "bezier", points: [0.42, 0, 0.58, 1] },
  "ease-in-back": { kind: "bezier", points: [0.36, 0, 0.66, -0.56] },
  "ease-out-back": { kind: "bezier", points: [0.34, 1.56, 0.64, 1] },
};

/** Resolve a keyframe's (easing, curve) pair to a samplable segment easing. */
export function resolveAnimationSegmentEasing(
  keyframe: Pick<AnimationKeyframeIR, "easing" | "curve">,
): AnimationSegmentEasingIR {
  if (keyframe.easing === "custom" && keyframe.curve) {
    return { kind: "bezier", points: keyframe.curve };
  }
  return ANIMATION_EASING_PRESETS[keyframe.easing === "custom" ? "ease-in-out" : keyframe.easing];
}

function cubicBezierAxis(p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

/** Sample a segment easing at local progress x (0..1). Newton + bisection fallback. */
export function sampleAnimationEasing(easing: AnimationSegmentEasingIR, x: number): number {
  const clamped = Math.min(1, Math.max(0, x));
  if (easing.kind === "linear") return clamped;
  if (easing.kind === "step") return clamped >= easing.at ? 1 : 0;
  const [x1, y1, x2, y2] = easing.points;
  if (clamped === 0 || clamped === 1) return clamped;
  let lo = 0;
  let hi = 1;
  let t = clamped;
  for (let i = 0; i < 32; i += 1) {
    const v = cubicBezierAxis(x1, x2, t);
    if (Math.abs(v - clamped) < 1e-6) break;
    if (v < clamped) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return cubicBezierAxis(y1, y2, t);
}

/**
 * Sample a numeric keyframe track at `frame`. The segment easing is read from
 * the keyframe the segment ends at, matching the animatic preview sampler, so
 * a curve drawn in the editor produces the same motion here.
 */
export function sampleAnimationKeyframeTrack(
  keyframes: readonly AnimationKeyframeIR[],
  frame: number,
): number | null {
  if (keyframes.length === 0) return null;
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index]!;
    if (frame > right.frame) continue;
    const left = keyframes[index - 1]!;
    const span = right.frame - left.frame;
    const local = span > 0 ? (frame - left.frame) / span : 0;
    const eased = sampleAnimationEasing(resolveAnimationSegmentEasing(right), local);
    return left.value + (right.value - left.value) * eased;
  }
  return last.value;
}

export const animationCameraTrackIRSchema = z.object({
  /** Animated camera parameter curves, frames strictly increasing. */
  x: z.array(animationKeyframeIRSchema).default([]),
  y: z.array(animationKeyframeIRSchema).default([]),
  scale: z.array(animationKeyframeIRSchema).default([]),
  rotationDeg: z.array(animationKeyframeIRSchema).default([]),
});
export type AnimationCameraTrackIR = z.infer<typeof animationCameraTrackIRSchema>;

export const animationAudioTrackIRSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  offsetFrames: z.number().int(),
  gain: z.number().min(0).max(4).default(1),
});
export type AnimationAudioTrackIR = z.infer<typeof animationAudioTrackIRSchema>;

export const animationGraphIRSchema = z.object({
  version: z.literal(1),
  fps: z.number().positive().max(120),
  durationFrames: z.number().int().positive(),
  levels: z.array(animationLevelIRSchema),
  exposures: z.array(animationExposureIRSchema),
  camera: animationCameraTrackIRSchema.default({
    x: [],
    y: [],
    scale: [],
    rotationDeg: [],
  }),
  audio: z.array(animationAudioTrackIRSchema).default([]),
});
export type AnimationGraphIR = z.infer<typeof animationGraphIRSchema>;

export interface AnimationGraphIssue {
  entityId: string | null;
  message: string;
}

export function validateAnimationGraph(
  graph: AnimationGraphIR,
): AnimationGraphIssue[] {
  const issues: AnimationGraphIssue[] = [];
  const levelIds = new Set<string>();
  const celIdsByLevel = new Map<string, Set<string>>();

  for (const level of graph.levels) {
    if (levelIds.has(level.id)) {
      issues.push({ entityId: level.id, message: `duplicate level id: ${level.id}` });
    }
    levelIds.add(level.id);
    const celIds = new Set<string>();
    for (const cel of level.cels) {
      if (celIds.has(cel.id)) {
        issues.push({
          entityId: cel.id,
          message: `duplicate cel id in level ${level.id}: ${cel.id}`,
        });
      }
      celIds.add(cel.id);
    }
    celIdsByLevel.set(level.id, celIds);
  }

  const seenExposureSlots = new Set<string>();
  for (const exposure of graph.exposures) {
    if (exposure.frame >= graph.durationFrames) {
      issues.push({
        entityId: exposure.levelId,
        message: `exposure frame ${exposure.frame} exceeds duration ${graph.durationFrames}`,
      });
    }
    const celIds = celIdsByLevel.get(exposure.levelId);
    if (!celIds) {
      issues.push({
        entityId: exposure.levelId,
        message: `exposure references unknown level ${exposure.levelId}`,
      });
      continue;
    }
    if (exposure.celId !== null && !celIds.has(exposure.celId)) {
      issues.push({
        entityId: exposure.celId,
        message: `exposure references unknown cel ${exposure.celId} in level ${exposure.levelId}`,
      });
    }
    const slot = `${exposure.levelId}@${exposure.frame}`;
    if (seenExposureSlots.has(slot)) {
      issues.push({
        entityId: exposure.levelId,
        message: `conflicting exposures for level ${exposure.levelId} at frame ${exposure.frame}`,
      });
    }
    seenExposureSlots.add(slot);
  }

  const tracks: Array<[string, AnimationKeyframeIR[]]> = [
    ["camera.x", graph.camera.x],
    ["camera.y", graph.camera.y],
    ["camera.scale", graph.camera.scale],
    ["camera.rotationDeg", graph.camera.rotationDeg],
  ];
  for (const [name, keyframes] of tracks) {
    for (const keyframe of keyframes) {
      if (keyframe.easing === "custom" && !keyframe.curve) {
        issues.push({
          entityId: name,
          message: `${name} keyframe at frame ${keyframe.frame} uses custom easing without curve points`,
        });
      }
      if (keyframe.curve && keyframe.curve[2] < keyframe.curve[0]) {
        issues.push({
          entityId: name,
          message: `${name} keyframe at frame ${keyframe.frame} has curve control points with x2 left of x1`,
        });
      }
    }
    for (let index = 1; index < keyframes.length; index += 1) {
      const previous = keyframes[index - 1];
      const current = keyframes[index];
      if (previous && current && current.frame <= previous.frame) {
        issues.push({
          entityId: name,
          message: `${name} keyframes must have strictly increasing frames`,
        });
        break;
      }
    }
  }
  return issues;
}

/**
 * X-sheet resolution: the cel visible on `levelId` at `frame`, honoring
 * exposure holds (latest exposure at or before the frame wins).
 */
export function resolveExposedCel(
  graph: AnimationGraphIR,
  levelId: string,
  frame: number,
): string | null {
  let resolved: AnimationExposureIR | null = null;
  for (const exposure of graph.exposures) {
    if (exposure.levelId !== levelId || exposure.frame > frame) continue;
    if (resolved === null || exposure.frame > resolved.frame) resolved = exposure;
  }
  return resolved?.celId ?? null;
}
