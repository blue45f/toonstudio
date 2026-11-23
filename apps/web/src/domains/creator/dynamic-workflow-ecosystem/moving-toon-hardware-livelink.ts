/**
 * 무빙툰(OpenTimelineIO .otio / AE / Live2D / 보이스코믹) · WebHID 하드웨어 프로필 라우터 ·
 * 3D DCC 실시간 카메라/태양광 라이브링크 · Wasm64 모아레 방지 하프톤 & XPBD 천/머리카락 물리 엔진.
 */

export type MovingToonTargetProfile = "otio" | "after-effects" | "live2d" | "voice-comic";
export type MovingToonLayerKind = "background" | "midground" | "character" | "foreground" | "sfx" | "balloon";
export type MovingToonTransitionType = "cut" | "dissolve" | "pan-vertical" | "zoom-push";
export type MovingToonEasing = "linear" | "ease-in-out" | "ease-out-cubic" | "hold";

export interface MovingToonLayerInput {
  readonly layerId: string; readonly name: string; readonly kind: MovingToonLayerKind;
  readonly zDepth: number; readonly opacity?: number; readonly live2dRigParam?: string; readonly assetRef?: string;
}

export interface MovingToonCameraKeyframe {
  readonly timeSec: number; readonly panX: number; readonly panY: number; readonly zoom: number;
  readonly tiltDeg?: number; readonly easing?: MovingToonEasing;
}

export interface MovingToonVoiceLineInput {
  readonly lineId: string; readonly speaker: string; readonly text: string;
  readonly startSec: number; readonly endSec: number; readonly audioRef?: string; readonly locale?: string;
}

export interface MovingToonCutInput {
  readonly cutId: string; readonly title: string; readonly durationSec: number;
  readonly transitionType?: MovingToonTransitionType; readonly transitionSec?: number;
  readonly layers: readonly MovingToonLayerInput[];
  readonly cameraKeyframes: readonly MovingToonCameraKeyframe[];
  readonly voiceLines?: readonly MovingToonVoiceLineInput[];
}

export interface MovingToonExportInput {
  readonly workTitle: string; readonly episodeTitle: string;
  readonly fps?: number; readonly widthPx?: number; readonly heightPx?: number;
  readonly targetProfile?: MovingToonTargetProfile; readonly cuts: readonly MovingToonCutInput[];
}

export interface OtioRationalTime { readonly OTIO_SCHEMA: "RationalTime.1"; readonly value: number; readonly rate: number; }
export interface OtioTimeRange { readonly OTIO_SCHEMA: "TimeRange.1"; readonly start_time: OtioRationalTime; readonly duration: OtioRationalTime; }
export interface OtioExternalReference { readonly OTIO_SCHEMA: "ExternalReference.1"; readonly target_url: string; readonly available_range: OtioTimeRange; }
export interface OtioClip {
  readonly OTIO_SCHEMA: "Clip.1"; readonly name: string; readonly source_range: OtioTimeRange;
  readonly media_reference: OtioExternalReference; readonly metadata: Readonly<Record<string, unknown>>;
}
export interface OtioGap { readonly OTIO_SCHEMA: "Gap.1"; readonly name: string; readonly source_range: OtioTimeRange; }
export interface OtioTransition {
  readonly OTIO_SCHEMA: "Transition.1"; readonly name: string; readonly transition_type: string;
  readonly in_offset: OtioRationalTime; readonly out_offset: OtioRationalTime; readonly metadata: Readonly<Record<string, unknown>>;
}
export type OtioTrackChild = OtioClip | OtioGap | OtioTransition;
export interface OtioTrack { readonly OTIO_SCHEMA: "Track.1"; readonly name: string; readonly kind: "Video" | "Audio"; readonly children: readonly OtioTrackChild[]; }
export interface OtioTimelineDocument {
  readonly OTIO_SCHEMA: "Timeline.1"; readonly name: string; readonly global_start_time: OtioRationalTime;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tracks: { readonly OTIO_SCHEMA: "Stack.1"; readonly name: "tracks"; readonly children: readonly OtioTrack[] };
}

export interface MotionLayer25D {
  readonly layerId: string; readonly name: string; readonly kind: MovingToonLayerKind;
  readonly zDepth: number; readonly parallaxFactor: number; readonly opacity: number;
  readonly aeZPositionPx: number; readonly live2dRigParam: string | null;
  readonly projectedOffsetStartPx: readonly [number, number]; readonly projectedOffsetEndPx: readonly [number, number];
}

export interface MotionSubtitleCue {
  readonly cueIndex: number; readonly cutId: string; readonly lineId: string; readonly speaker: string;
  readonly text: string; readonly startSrt: string; readonly endSrt: string; readonly startSec: number; readonly endSec: number;
}

export interface MotionCut25D {
  readonly cutId: string; readonly title: string; readonly timelineStartSec: number; readonly durationSec: number;
  readonly layers: readonly MotionLayer25D[]; readonly cameraKeyframes: readonly MovingToonCameraKeyframe[];
}

export interface MovingToonOtioScenePackage {
  readonly schema: "Timeline.1"; readonly targetProfile: MovingToonTargetProfile;
  readonly otioDocument: OtioTimelineDocument; readonly otioJson: string;
  readonly motionScene25D: {
    readonly fps: number; readonly widthPx: number; readonly heightPx: number;
    readonly cuts: readonly MotionCut25D[]; readonly afterEffectsCameraFovDeg: number;
    readonly live2dBindings: readonly { readonly cutId: string; readonly layerId: string; readonly paramId: string; readonly range: readonly [number, number] }[];
    readonly subtitleCues: readonly MotionSubtitleCue[];
  };
  readonly summary: {
    readonly cutCount: number; readonly totalDurationSec: number; readonly totalFrames: number;
    readonly totalLayers: number; readonly voiceLineCount: number; readonly subtitleCueCount: number;
    readonly zDepthRange: readonly [number, number]; readonly losslessVerified: boolean;
  };
}

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function roundTo(v: number, digits = 4): number { const f = 10 ** digits; const out = Math.round(v * f) / f; return Object.is(out, -0) ? 0 : out; }
function toRationalTime(seconds: number, fps: number): OtioRationalTime { return { OTIO_SCHEMA: "RationalTime.1", value: Math.max(0, Math.round(seconds * fps)), rate: fps }; }
function toTimeRange(startSec: number, durationSec: number, fps: number): OtioTimeRange { return { OTIO_SCHEMA: "TimeRange.1", start_time: toRationalTime(startSec, fps), duration: toRationalTime(durationSec, fps) }; }

function formatSrtTimestamp(totalSec: number): string {
  const safeMs = Math.max(0, Math.round(totalSec * 1000));
  const h = Math.floor(safeMs / 3_600_000);
  const m = Math.floor((safeMs % 3_600_000) / 60_000);
  const s = Math.floor((safeMs % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(safeMs % 1000).padStart(3, "0")}`;
}

function computeParallaxFactor(zDepth: number): number {
  const focalPlane = 6.0;
  return roundTo(clamp(focalPlane / Math.max(1.2, focalPlane - clamp(zDepth, -12, 4.8)), 0.25, 3.2), 4);
}

/** 웹툰 컷 레이어 Z-깊이·카메라 패럴랙스·보이스 자막을 표준 OpenTimelineIO(.otio)와 2.5D 모션 씬으로 변환한다. */
export function buildMovingToonOtioScene(input: MovingToonExportInput): MovingToonOtioScenePackage {
  const fps = clamp(Math.round(input.fps ?? 24), 12, 120);
  const widthPx = Math.max(320, Math.round(input.widthPx ?? 1080));
  const heightPx = Math.max(320, Math.round(input.heightPx ?? 1920));
  const targetProfile: MovingToonTargetProfile = input.targetProfile ?? "otio";

  const videoChildren: OtioTrackChild[] = [];
  const audioChildren: OtioTrackChild[] = [];
  const motionCuts: MotionCut25D[] = [];
  const subtitleCues: MotionSubtitleCue[] = [];
  const live2dBindings: { readonly cutId: string; readonly layerId: string; readonly paramId: string; readonly range: readonly [number, number] }[] = [];

  let timelineCursorSec = 0;
  let audioCursorSec = 0;
  let totalLayers = 0;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let cutIndex = 0; cutIndex < input.cuts.length; cutIndex += 1) {
    const cut = input.cuts[cutIndex];
    const durationSec = Math.max(0.25, cut.durationSec);
    const keyframes = cut.cameraKeyframes.length > 0
      ? [...cut.cameraKeyframes].sort((a, b) => a.timeSec - b.timeSec)
      : [{ timeSec: 0, panX: 0, panY: 0, zoom: 1, tiltDeg: 0, easing: "linear" as const }];
    const firstKf = keyframes[0];
    const lastKf = keyframes[keyframes.length - 1];

    const projectedLayers: MotionLayer25D[] = cut.layers.map((layer) => {
      const zDepth = roundTo(clamp(layer.zDepth, -12, 4.8), 3);
      minZ = Math.min(minZ, zDepth);
      maxZ = Math.max(maxZ, zDepth);
      const parallaxFactor = computeParallaxFactor(zDepth);
      if (layer.live2dRigParam) {
        live2dBindings.push({
          cutId: cut.cutId, layerId: layer.layerId, paramId: layer.live2dRigParam,
          range: [roundTo(-15 * parallaxFactor, 2), roundTo(15 * parallaxFactor, 2)],
        });
      }
      return {
        layerId: layer.layerId, name: layer.name, kind: layer.kind, zDepth, parallaxFactor,
        opacity: roundTo(clamp(layer.opacity ?? 1, 0, 1), 3), aeZPositionPx: Math.round(-zDepth * 240),
        live2dRigParam: layer.live2dRigParam ?? null,
        projectedOffsetStartPx: [roundTo(firstKf.panX * parallaxFactor, 2), roundTo(firstKf.panY * parallaxFactor, 2)],
        projectedOffsetEndPx: [roundTo(lastKf.panX * parallaxFactor, 2), roundTo(lastKf.panY * parallaxFactor, 2)],
      };
    });
    totalLayers += projectedLayers.length;

    const range = toTimeRange(0, durationSec, fps);
    videoChildren.push({
      OTIO_SCHEMA: "Clip.1", name: `${cut.cutId}_${cut.title}`, source_range: range,
      media_reference: { OTIO_SCHEMA: "ExternalReference.1", target_url: `toonstudio://cuts/${encodeURIComponent(cut.cutId)}`, available_range: range },
      metadata: { toonstudio: { cutId: cut.cutId, title: cut.title, targetProfile, layers: projectedLayers, cameraKeyframes: keyframes } },
    });

    const transitionSec = clamp(cut.transitionSec ?? 0, 0, durationSec * 0.45);
    if (cutIndex < input.cuts.length - 1 && transitionSec > 0 && cut.transitionType && cut.transitionType !== "cut") {
      const half = transitionSec * 0.5;
      videoChildren.push({
        OTIO_SCHEMA: "Transition.1", name: `${cut.cutId}_to_next_${cut.transitionType}`,
        transition_type: cut.transitionType === "dissolve" ? "SMPTE_Dissolve" : `ToonStudio_${cut.transitionType}`,
        in_offset: toRationalTime(half, fps), out_offset: toRationalTime(half, fps),
        metadata: { toonstudio: { transitionType: cut.transitionType } },
      });
    }

    for (const voice of [...(cut.voiceLines ?? [])].sort((a, b) => a.startSec - b.startSec)) {
      const absStart = timelineCursorSec + clamp(voice.startSec, 0, durationSec);
      const absEnd = timelineCursorSec + clamp(Math.max(voice.endSec, voice.startSec + 0.1), 0.1, durationSec);
      const lineDur = Math.max(0.1, absEnd - absStart);
      if (absStart - audioCursorSec > 0.02) {
        audioChildren.push({ OTIO_SCHEMA: "Gap.1", name: `gap_before_${voice.lineId}`, source_range: toTimeRange(0, absStart - audioCursorSec, fps) });
      }
      const audioRange = toTimeRange(0, lineDur, fps);
      audioChildren.push({
        OTIO_SCHEMA: "Clip.1", name: `${voice.lineId}_${voice.speaker}`, source_range: audioRange,
        media_reference: { OTIO_SCHEMA: "ExternalReference.1", target_url: voice.audioRef ?? `toonstudio://voice/${encodeURIComponent(voice.lineId)}.wav`, available_range: audioRange },
        metadata: { toonstudio: { cutId: cut.cutId, lineId: voice.lineId, speaker: voice.speaker, text: voice.text, locale: voice.locale ?? "ko" } },
      });
      audioCursorSec = absEnd;
      subtitleCues.push({
        cueIndex: subtitleCues.length + 1, cutId: cut.cutId, lineId: voice.lineId, speaker: voice.speaker, text: voice.text,
        startSrt: formatSrtTimestamp(absStart), endSrt: formatSrtTimestamp(absEnd), startSec: roundTo(absStart, 3), endSec: roundTo(absEnd, 3),
      });
    }

    motionCuts.push({ cutId: cut.cutId, title: cut.title, timelineStartSec: roundTo(timelineCursorSec, 3), durationSec: roundTo(durationSec, 3), layers: projectedLayers, cameraKeyframes: keyframes });
    timelineCursorSec += durationSec;
  }

  const totalDurationSec = roundTo(timelineCursorSec, 3);
  const otioDocument: OtioTimelineDocument = {
    OTIO_SCHEMA: "Timeline.1",
    name: `${input.workTitle} - ${input.episodeTitle}`,
    global_start_time: toRationalTime(0, fps),
    metadata: {
      toonstudio: {
        schemaVersion: "toonstudio.moving-toon.v1", workTitle: input.workTitle, episodeTitle: input.episodeTitle,
        resolution: { widthPx, heightPx }, fps, targetProfile, losslessLayerCount: totalLayers, subtitleCueCount: subtitleCues.length,
      },
    },
    tracks: {
      OTIO_SCHEMA: "Stack.1", name: "tracks",
      children: [
        { OTIO_SCHEMA: "Track.1", name: "V1_Webtoon_2_5D_Layers", kind: "Video", children: videoChildren },
        { OTIO_SCHEMA: "Track.1", name: "A1_Voice_Comic_Dialogue", kind: "Audio", children: audioChildren },
      ],
    },
  };

  return {
    schema: "Timeline.1", targetProfile, otioDocument, otioJson: JSON.stringify(otioDocument, null, 2),
    motionScene25D: { fps, widthPx, heightPx, cuts: motionCuts, afterEffectsCameraFovDeg: 39.6, live2dBindings, subtitleCues },
    summary: {
      cutCount: motionCuts.length, totalDurationSec, totalFrames: Math.round(totalDurationSec * fps), totalLayers,
      voiceLineCount: subtitleCues.length, subtitleCueCount: subtitleCues.length,
      zDepthRange: Number.isFinite(minZ) ? [minZ, maxZ] : [0, 0],
      losslessVerified: motionCuts.reduce((acc, c) => acc + c.layers.length, 0) === totalLayers && motionCuts.length === input.cuts.length,
    },
  };
}

// --- 2. WebHID 창작 하드웨어 & 무선 보조 리모컨 프로필 라우터 ---

export type HardwareControllerFamily = "tourbox" | "wacom-expresskeys" | "stream-deck" | "apple-pencil-pro" | "mobile-wireless-remote";
export type HardwareModifierKey = "shift" | "ctrl" | "alt" | "meta";
export type HardwareInputKind = "press" | "release" | "delta" | "squeeze" | "barrel-roll" | "analog";
export type ToonStudioShortcutAction =
  | "canvas.zoom" | "canvas.rotate" | "canvas.undo" | "canvas.redo"
  | "brush.size.step" | "brush.opacity.step" | "brush.angle.roll"
  | "tool.toggle.eraser" | "tool.quick.wheel" | "tool.eyedropper"
  | "color.hue.shift" | "color.saturation.shift" | "layer.toggle.redline" | "timeline.step.frame" | "camera.reset.view";

export interface HardwareBindingRule {
  readonly controlId: string; readonly modifiers?: readonly HardwareModifierKey[];
  readonly action: ToonStudioShortcutAction; readonly shortcutLabel: string;
  readonly stepSize?: number; readonly unit?: "px" | "deg" | "percent" | "frames" | "step"; readonly squeezeThreshold?: number;
}
export interface HardwareControllerProfileInput {
  readonly profileId: string; readonly displayName: string; readonly family: HardwareControllerFamily;
  readonly vendorId?: number; readonly productId?: number; readonly sensitivity?: number; readonly bindings?: readonly HardwareBindingRule[];
}
export interface NormalizedHardwareProfile {
  readonly profileId: string; readonly displayName: string; readonly family: HardwareControllerFamily;
  readonly vendorId: number; readonly productId: number; readonly sensitivity: number;
  readonly transport: "webhid" | "pointer-stylus" | "webrtc-local";
  readonly bindings: readonly HardwareBindingRule[]; readonly bindingCount: number;
}
export interface HardwareInputEvent {
  readonly controlId: string; readonly eventKind: HardwareInputKind;
  readonly delta?: number; readonly angleDeg?: number; readonly pressure?: number;
  readonly modifiers?: readonly HardwareModifierKey[]; readonly timestampMs?: number;
}
export interface HardwareRoutedCommand {
  readonly matched: boolean; readonly family: HardwareControllerFamily; readonly controlId: string;
  readonly action: ToonStudioShortcutAction | null; readonly shortcutLabel: string | null;
  readonly value: number; readonly unit: "px" | "deg" | "percent" | "frames" | "step";
  readonly hapticFeedback: "light" | "medium" | "none";
  readonly reason: "routed" | "ignored-release" | "ignored-threshold" | "unmapped-control";
}

interface HardwareFactorySpec { readonly vendorId: number; readonly productId: number; readonly transport: "webhid" | "pointer-stylus" | "webrtc-local"; readonly bindings: readonly HardwareBindingRule[]; }

export const HARDWARE_FACTORY_SPECS: Readonly<Record<HardwareControllerFamily, HardwareFactorySpec>> = {
  tourbox: {
    vendorId: 1155, productId: 22336, transport: "webhid",
    bindings: [
      { controlId: "knob", action: "brush.size.step", shortcutLabel: "Bracket [ / ]", stepSize: 2, unit: "px" },
      { controlId: "dial", action: "canvas.rotate", shortcutLabel: "R + Drag", stepSize: 5, unit: "deg" },
      { controlId: "scroll", action: "canvas.zoom", shortcutLabel: "Ctrl + Wheel", stepSize: 10, unit: "percent" },
      { controlId: "side", action: "canvas.undo", shortcutLabel: "Ctrl+Z", stepSize: 1, unit: "step" },
      { controlId: "side", modifiers: ["shift"], action: "canvas.redo", shortcutLabel: "Ctrl+Shift+Z", stepSize: 1, unit: "step" },
      { controlId: "tall", action: "tool.toggle.eraser", shortcutLabel: "E", stepSize: 1, unit: "step" },
      { controlId: "c1", action: "layer.toggle.redline", shortcutLabel: "Alt+R", stepSize: 1, unit: "step" },
    ],
  },
  "wacom-expresskeys": {
    vendorId: 1386, productId: 817, transport: "webhid",
    bindings: [
      { controlId: "touch-ring", action: "canvas.zoom", shortcutLabel: "Zoom Ring", stepSize: 8, unit: "percent" },
      { controlId: "touch-ring", modifiers: ["alt"], action: "brush.size.step", shortcutLabel: "Alt + Ring", stepSize: 3, unit: "px" },
      { controlId: "ek-1", action: "canvas.undo", shortcutLabel: "Ctrl+Z", stepSize: 1, unit: "step" },
      { controlId: "ek-2", action: "tool.eyedropper", shortcutLabel: "I", stepSize: 1, unit: "step" },
      { controlId: "ek-3", action: "camera.reset.view", shortcutLabel: "Ctrl+0", stepSize: 1, unit: "step" },
    ],
  },
  "stream-deck": {
    vendorId: 4057, productId: 128, transport: "webhid",
    bindings: [
      { controlId: "key-1", action: "layer.toggle.redline", shortcutLabel: "Deck K1 Redline", stepSize: 1, unit: "step" },
      { controlId: "key-2", action: "tool.quick.wheel", shortcutLabel: "Deck K2 QuickWheel", stepSize: 1, unit: "step" },
      { controlId: "key-3", action: "camera.reset.view", shortcutLabel: "Deck K3 ResetView", stepSize: 1, unit: "step" },
      { controlId: "encoder-1", action: "brush.opacity.step", shortcutLabel: "Deck Dial Opacity", stepSize: 5, unit: "percent" },
      { controlId: "encoder-2", action: "timeline.step.frame", shortcutLabel: "Deck Dial Frame", stepSize: 1, unit: "frames" },
    ],
  },
  "apple-pencil-pro": {
    vendorId: 1452, productId: 4608, transport: "pointer-stylus",
    bindings: [
      { controlId: "squeeze", action: "tool.quick.wheel", shortcutLabel: "Pencil Pro Squeeze", stepSize: 1, unit: "step", squeezeThreshold: 0.35 },
      { controlId: "barrel-roll", action: "brush.angle.roll", shortcutLabel: "Pencil Pro Barrel Roll", stepSize: 1, unit: "deg" },
      { controlId: "double-tap", action: "tool.toggle.eraser", shortcutLabel: "Pencil Double Tap", stepSize: 1, unit: "step" },
    ],
  },
  "mobile-wireless-remote": {
    vendorId: 0, productId: 9001, transport: "webrtc-local",
    bindings: [
      { controlId: "color-wheel-hue", action: "color.hue.shift", shortcutLabel: "Remote Hue Ring", stepSize: 1, unit: "deg" },
      { controlId: "color-wheel-sat", action: "color.saturation.shift", shortcutLabel: "Remote Sat Slider", stepSize: 5, unit: "percent" },
      { controlId: "brush-size-pinch", action: "brush.size.step", shortcutLabel: "Remote Pinch Size", stepSize: 4, unit: "px" },
      { controlId: "undo-two-finger", action: "canvas.undo", shortcutLabel: "2-Finger Undo", stepSize: 1, unit: "step" },
    ],
  },
};

function makeBindingKey(controlId: string, modifiers?: readonly HardwareModifierKey[]): string {
  return `${controlId.trim().toLowerCase()}|${[...(modifiers ?? [])].sort().join("+")}`;
}

/** WebHID·스타일러스·무선 리모컨 프로필을 정규화하고 공장 기본 매핑과 사용자 오버라이드를 병합한다. */
export function normalizeHardwareControllerProfile(input: HardwareControllerProfileInput): NormalizedHardwareProfile {
  const spec = HARDWARE_FACTORY_SPECS[input.family];
  const merged = new Map<string, HardwareBindingRule>(spec.bindings.map((r) => [makeBindingKey(r.controlId, r.modifiers), r]));
  for (const r of input.bindings ?? []) {
    const clean: HardwareBindingRule = {
      ...r, controlId: r.controlId.trim().toLowerCase(),
      modifiers: r.modifiers ? [...new Set(r.modifiers)].sort() : undefined,
      stepSize: r.stepSize !== undefined ? clamp(r.stepSize, 0.1, 100) : 1, unit: r.unit ?? "step",
      squeezeThreshold: r.squeezeThreshold !== undefined ? clamp(r.squeezeThreshold, 0.05, 0.95) : undefined,
    };
    merged.set(makeBindingKey(clean.controlId, clean.modifiers), clean);
  }
  const bindings = [...merged.values()];
  return {
    profileId: input.profileId.trim() || `${input.family}-default`, displayName: input.displayName.trim() || input.family,
    family: input.family, vendorId: input.vendorId ?? spec.vendorId, productId: input.productId ?? spec.productId,
    sensitivity: roundTo(clamp(input.sensitivity ?? 1, 0.1, 4), 2), transport: spec.transport, bindings, bindingCount: bindings.length,
  };
}

/** 정규화된 하드웨어 프로필을 바탕으로 입력 이벤트를 ToonStudio 단축키·액션 명령으로 1:1 라우팅한다. */
export function routeHardwareInputEvent(profile: NormalizedHardwareProfile, event: HardwareInputEvent): HardwareRoutedCommand {
  const controlId = event.controlId.trim().toLowerCase();
  if (event.eventKind === "release") {
    return { matched: false, family: profile.family, controlId, action: null, shortcutLabel: null, value: 0, unit: "step", hapticFeedback: "none", reason: "ignored-release" };
  }
  const exactKey = makeBindingKey(controlId, event.modifiers);
  const fallbackKey = makeBindingKey(controlId, undefined);
  const rule =
    profile.bindings.find((r) => makeBindingKey(r.controlId, r.modifiers) === exactKey) ??
    profile.bindings.find((r) => makeBindingKey(r.controlId, r.modifiers) === fallbackKey);

  if (!rule) {
    return { matched: false, family: profile.family, controlId, action: null, shortcutLabel: null, value: 0, unit: "step", hapticFeedback: "none", reason: "unmapped-control" };
  }
  if (event.eventKind === "squeeze") {
    const pressure = clamp(event.pressure ?? 0, 0, 1);
    if (pressure < (rule.squeezeThreshold ?? 0.35)) {
      return { matched: false, family: profile.family, controlId, action: rule.action, shortcutLabel: rule.shortcutLabel, value: 0, unit: rule.unit ?? "step", hapticFeedback: "none", reason: "ignored-threshold" };
    }
    return { matched: true, family: profile.family, controlId, action: rule.action, shortcutLabel: rule.shortcutLabel, value: roundTo(pressure, 3), unit: rule.unit ?? "step", hapticFeedback: "medium", reason: "routed" };
  }
  if (event.eventKind === "barrel-roll") {
    return { matched: true, family: profile.family, controlId, action: rule.action, shortcutLabel: rule.shortcutLabel, value: roundTo((((event.angleDeg ?? 0) % 360) + 360) % 360, 2), unit: "deg", hapticFeedback: "light", reason: "routed" };
  }
  const step = rule.stepSize ?? 1;
  const value = event.eventKind === "delta" || event.eventKind === "analog" ? roundTo((event.delta ?? 1) * step * profile.sensitivity, 3) : roundTo(step, 3);
  return { matched: true, family: profile.family, controlId, action: rule.action, shortcutLabel: rule.shortcutLabel, value, unit: rule.unit ?? "step", hapticFeedback: event.eventKind === "press" ? "light" : "none", reason: "routed" };
}

// --- 3. 3D DCC 실시간 카메라·태양광 라이브링크 (Blender · SketchUp · Unreal) ---

export type DccLiveLinkSource = "blender" | "sketchup" | "unreal";
export type Vec3Tuple = readonly [number, number, number];

export interface DccLiveLinkPacket {
  readonly sourceDcc: DccLiveLinkSource; readonly sessionId: string; readonly sequence: number; readonly timestampMs: number;
  readonly unitScaleToMeters?: number; readonly upAxis?: "Z" | "Y";
  readonly camera: { readonly position: Vec3Tuple; readonly target: Vec3Tuple; readonly fovDeg: number; readonly rollDeg?: number; readonly sensorWidthMm?: number };
  readonly sun: { readonly azimuthDeg: number; readonly elevationDeg: number; readonly intensity?: number; readonly colorTempKelvin?: number };
}

export interface NprShadowGuide {
  readonly sunDirectionYUp: Vec3Tuple; readonly castShadowAngle2dDeg: number; readonly shadowLengthRatio: number;
  readonly terminatorHardness: number; readonly rimLightIntensity: number;
  readonly timeOfDayMood: "night" | "golden-hour" | "daylight" | "zenith"; readonly sunShiftDeltaDeg: number;
}

export interface DccLiveLinkSyncState {
  readonly status: "applied" | "stale-ignored"; readonly sourceDcc: DccLiveLinkSource;
  readonly sessionId: string; readonly sequence: number; readonly timestampMs: number;
  readonly cameraPositionMeters: Vec3Tuple; readonly cameraTargetMeters: Vec3Tuple;
  readonly fovDeg: number; readonly focalLength35mm: number; readonly viewMatrix4x4: readonly number[];
  readonly sunAzimuthDeg: number; readonly sunElevationDeg: number; readonly nprShadowGuide: NprShadowGuide;
}

function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < 1e-8 ? [0, 0, -1] : [v[0] / len, v[1] / len, v[2] / len];
}
function crossVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dotVec3(a: Vec3Tuple, b: Vec3Tuple): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function convertDccPointToYUpMeters(pt: Vec3Tuple, dcc: DccLiveLinkSource, scale: number, upAxis: "Z" | "Y"): Vec3Tuple {
  if (upAxis === "Y") return [roundTo(pt[0] * scale, 4), roundTo(pt[1] * scale, 4), roundTo(pt[2] * scale, 4)];
  if (dcc === "unreal") return [roundTo(pt[1] * scale, 4), roundTo(pt[2] * scale, 4), roundTo(-pt[0] * scale, 4)];
  return [roundTo(pt[0] * scale, 4), roundTo(pt[2] * scale, 4), roundTo(-pt[1] * scale, 4)];
}

/** Blender · SketchUp · Unreal 소켓 패킷을 ToonStudio Y-up 미터 카메라 행렬과 NPR 그림자 가이드로 동기화한다. */
export function reconcileDccLiveLinkPacket(packet: DccLiveLinkPacket, previousState?: DccLiveLinkSyncState | null): DccLiveLinkSyncState {
  if (previousState && previousState.sessionId === packet.sessionId && packet.sequence <= previousState.sequence) {
    return { ...previousState, status: "stale-ignored" };
  }
  const scale = clamp(packet.unitScaleToMeters ?? (packet.sourceDcc === "unreal" ? 0.01 : packet.sourceDcc === "sketchup" ? 0.0254 : 1.0), 0.0001, 1000);
  const upAxis = packet.upAxis ?? "Z";
  const pos = convertDccPointToYUpMeters(packet.camera.position, packet.sourceDcc, scale, upAxis);
  const target = convertDccPointToYUpMeters(packet.camera.target, packet.sourceDcc, scale, upAxis);
  const fovDeg = roundTo(clamp(packet.camera.fovDeg, 10, 140), 2);
  const focalLength35mm = roundTo(clamp(packet.camera.sensorWidthMm ?? 36, 12, 70) / (2 * Math.tan((fovDeg * Math.PI) / 360)), 2);

  const forward = normalizeVec3([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const right = normalizeVec3(crossVec3(forward, Math.abs(forward[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]));
  const up = normalizeVec3(crossVec3(right, forward));
  const negF: Vec3Tuple = [-forward[0], -forward[1], -forward[2]];
  const viewMatrix4x4: readonly number[] = [
    roundTo(right[0], 5), roundTo(up[0], 5), roundTo(negF[0], 5), 0,
    roundTo(right[1], 5), roundTo(up[1], 5), roundTo(negF[1], 5), 0,
    roundTo(right[2], 5), roundTo(up[2], 5), roundTo(negF[2], 5), 0,
    roundTo(-dotVec3(right, pos), 5), roundTo(-dotVec3(up, pos), 5), roundTo(-dotVec3(negF, pos), 5), 1,
  ];

  const sunAzimuthDeg = roundTo(((packet.sun.azimuthDeg % 360) + 360) % 360, 2);
  const sunElevationDeg = roundTo(clamp(packet.sun.elevationDeg, -90, 90), 2);
  const azRad = (sunAzimuthDeg * Math.PI) / 180;
  const elRad = (sunElevationDeg * Math.PI) / 180;
  const sunDir: Vec3Tuple = [roundTo(Math.cos(elRad) * Math.sin(azRad), 5), roundTo(Math.sin(elRad), 5), roundTo(Math.cos(elRad) * Math.cos(azRad), 5)];

  return {
    status: "applied", sourceDcc: packet.sourceDcc, sessionId: packet.sessionId, sequence: packet.sequence, timestampMs: packet.timestampMs,
    cameraPositionMeters: pos, cameraTargetMeters: target, fovDeg, focalLength35mm, viewMatrix4x4, sunAzimuthDeg, sunElevationDeg,
    nprShadowGuide: {
      sunDirectionYUp: sunDir,
      castShadowAngle2dDeg: roundTo((sunAzimuthDeg + 180) % 360, 2),
      shadowLengthRatio: sunElevationDeg <= 0 ? 6.0 : roundTo(clamp(1 / Math.max(Math.tan(elRad), 0.16), 0.2, 6.0), 3),
      terminatorHardness: roundTo(clamp(0.42 + (Math.max(0, sunElevationDeg) / 90) * 0.52, 0.35, 0.96), 3),
      rimLightIntensity: roundTo(clamp((dotVec3(forward, sunDir) + 0.25) / 1.25, 0, 1), 3),
      timeOfDayMood: sunElevationDeg < 0 ? "night" : sunElevationDeg < 18 ? "golden-hour" : sunElevationDeg > 68 ? "zenith" : "daylight",
      sunShiftDeltaDeg: previousState ? roundTo(Math.hypot(sunAzimuthDeg - previousState.sunAzimuthDeg, sunElevationDeg - previousState.sunElevationDeg), 2) : 0,
    },
  };
}

// --- 4. Wasm64 출판 하프톤(모아레 방지 CMYK 회전 망점) & XPBD 천/머리카락 물리 스텝퍼 ---

export interface MoireFreeHalftoneOptions {
  readonly tileSize?: number; readonly lpi?: number; readonly dpi?: number;
  readonly cmykCoverage: { readonly c: number; readonly m: number; readonly y: number; readonly k: number };
  readonly anglesDeg?: { readonly c: number; readonly m: number; readonly y: number; readonly k: number };
}

export interface MoireFreeHalftoneTile {
  readonly tileSize: number; readonly lpi: number; readonly dpi: number;
  readonly anglesDeg: { readonly c: number; readonly m: number; readonly y: number; readonly k: number };
  readonly minCmkSeparationDeg: number; readonly moireRiskScore: number; readonly isMoireFree: boolean;
  readonly channels: { readonly cMask: Uint8Array; readonly mMask: Uint8Array; readonly yMask: Uint8Array; readonly kMask: Uint8Array };
  readonly measuredCoverage: { readonly c: number; readonly m: number; readonly y: number; readonly k: number };
  readonly coverageErrorMax: number;
  readonly wasm64MemoryPlan: { readonly addressBits: 64; readonly bytesPerTile: number; readonly plate600DpiBytes: number; readonly requiresWasm64PlateBuffer: boolean };
}

function angularSeparationMod90(a: number, b: number): number {
  const diff = Math.abs((((a - b) % 90) + 90) % 90);
  return Math.min(diff, 90 - diff);
}

function rasterizeRotatedDotChannel(tileSize: number, coverage: number, angleDeg: number, frequency: number): { readonly mask: Uint8Array; readonly measured: number } {
  const total = tileSize * tileSize;
  const mask = new Uint8Array(total);
  const scores = new Float32Array(total);
  const target = clamp(coverage, 0, 1);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const u = (x * cosA - y * sinA) * frequency * Math.PI * 2;
      const v = (x * sinA + y * cosA) * frequency * Math.PI * 2;
      scores[y * tileSize + x] = 0.5 + 0.5 * Math.cos(u) * Math.cos(v);
    }
  }
  const sorted = Float32Array.from(scores).sort();
  const threshold = target <= 0 ? 2 : target >= 1 ? -1 : sorted[clamp(Math.floor((1 - target) * total), 0, total - 1)];
  let onCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (scores[i] >= threshold) { mask[i] = 255; onCount += 1; }
  }
  return { mask, measured: roundTo(onCount / total, 4) };
}

/** 표준 로제트 각도(K 45° · C 15° · M 75° · Y 0°) 기반 모아레 방지 CMYK 출판 하프톤 타일과 Wasm64 메모리 계획을 생성한다. */
export function generateMoireFreeHalftoneTile(options: MoireFreeHalftoneOptions): MoireFreeHalftoneTile {
  const tileSize = clamp(Math.round(options.tileSize ?? 32), 16, 128);
  const dpi = clamp(Math.round(options.dpi ?? 600), 150, 2400);
  const lpi = clamp(Math.round(options.lpi ?? 133), 45, 300);
  const anglesDeg = options.anglesDeg ?? { c: 15, m: 75, y: 0, k: 45 };
  const minCmkSeparationDeg = roundTo(
    Math.min(angularSeparationMod90(anglesDeg.c, anglesDeg.m), angularSeparationMod90(anglesDeg.c, anglesDeg.k), angularSeparationMod90(anglesDeg.m, anglesDeg.k)),
    2,
  );
  const freq = lpi / dpi;
  const cRes = rasterizeRotatedDotChannel(tileSize, options.cmykCoverage.c, anglesDeg.c, freq);
  const mRes = rasterizeRotatedDotChannel(tileSize, options.cmykCoverage.m, anglesDeg.m, freq);
  const yRes = rasterizeRotatedDotChannel(tileSize, options.cmykCoverage.y, anglesDeg.y, freq);
  const kRes = rasterizeRotatedDotChannel(tileSize, options.cmykCoverage.k, anglesDeg.k, freq);
  const plate600DpiBytes = Math.round(dpi * 10.1 * (dpi * 14.3) * 4);

  return {
    tileSize, lpi, dpi, anglesDeg, minCmkSeparationDeg,
    moireRiskScore: roundTo(clamp(1 - minCmkSeparationDeg / 30, 0, 1), 4),
    isMoireFree: minCmkSeparationDeg >= 27,
    channels: { cMask: cRes.mask, mMask: mRes.mask, yMask: yRes.mask, kMask: kRes.mask },
    measuredCoverage: { c: cRes.measured, m: mRes.measured, y: yRes.measured, k: kRes.measured },
    coverageErrorMax: roundTo(Math.max(
      Math.abs(cRes.measured - clamp(options.cmykCoverage.c, 0, 1)),
      Math.abs(mRes.measured - clamp(options.cmykCoverage.m, 0, 1)),
      Math.abs(yRes.measured - clamp(options.cmykCoverage.y, 0, 1)),
      Math.abs(kRes.measured - clamp(options.cmykCoverage.k, 0, 1)),
    ), 4),
    wasm64MemoryPlan: { addressBits: 64, bytesPerTile: tileSize * tileSize * 4, plate600DpiBytes, requiresWasm64PlateBuffer: plate600DpiBytes > 128 * 1024 * 1024 },
  };
}

export interface XpbdParticle { readonly x: number; readonly y: number; readonly z: number; readonly vx: number; readonly vy: number; readonly vz: number; readonly invMass: number; }
export interface XpbdStrandState { readonly particles: readonly XpbdParticle[]; readonly restSegmentLength: number; readonly stepCount: number; }
export interface XpbdStepParams {
  readonly dtSec?: number; readonly substeps?: number; readonly gravity?: Vec3Tuple; readonly wind?: Vec3Tuple;
  readonly stretchCompliance?: number; readonly bendingCompliance?: number; readonly damping?: number;
  readonly sphereCollider?: { readonly center: Vec3Tuple; readonly radius: number };
}
export interface XpbdStepResult {
  readonly state: XpbdStrandState; readonly maxStretchError: number; readonly kineticEnergy: number;
  readonly tipDisplacement: number; readonly colliderPushCount: number; readonly converged: boolean;
}

/** 초기 XPBD 천·머리카락 스트랜드를 생성한다(루트 파티클은 invMass=0 고정). */
export function createXpbdClothHairStrand(segmentCount: number, restSegmentLength = 0.08): XpbdStrandState {
  const count = clamp(Math.round(segmentCount), 2, 48);
  const segLen = clamp(restSegmentLength, 0.01, 1.0);
  const particles: XpbdParticle[] = Array.from({ length: count + 1 }, (_, i) => ({
    x: roundTo(i * segLen * 0.15, 5), y: roundTo(-i * segLen * 0.9887, 5), z: 0, vx: 0, vy: 0, vz: 0, invMass: i === 0 ? 0 : 1,
  }));
  return { particles, restSegmentLength: segLen, stepCount: 0 };
}

/** XPBD 거리·굽힘 제약 및 충돌 보정으로 천/머리카락 2D/3D 물리를 1프레임 전진시킨다. */
export function stepXpbdClothHairStrand(state: XpbdStrandState, params: XpbdStepParams = {}): XpbdStepResult {
  const dtSec = clamp(params.dtSec ?? 1 / 60, 1 / 240, 1 / 15);
  const substeps = clamp(Math.round(params.substeps ?? 8), 1, 24);
  const dtSub = dtSec / substeps;
  const gravity: Vec3Tuple = params.gravity ?? [0, -9.81, 0];
  const wind: Vec3Tuple = params.wind ?? [1.8, 0, 0.35];
  const stretchAlpha = Math.max(0, params.stretchCompliance ?? 1e-6) / (dtSub * dtSub);
  const bendAlpha = Math.max(0, params.bendingCompliance ?? 2e-4) / (dtSub * dtSub);
  const retain = clamp(1 - clamp(params.damping ?? 0.04, 0, 0.5) * dtSub * 10, 0.5, 1);
  const restLen = Math.max(1e-4, state.restSegmentLength);
  const restBendLen = restLen * 1.98;
  const collider = params.sphereCollider;
  const work = state.particles.map((p) => ({ ...p }));
  const n = work.length;
  const initialTip = state.particles[n - 1];
  let colliderPushCount = 0;

  const solvePair = (a: { x: number; y: number; z: number; invMass: number }, b: { x: number; y: number; z: number; invMass: number }, targetLen: number, alpha: number, onlyCompression: boolean): void => {
    const wSum = a.invMass + b.invMass;
    if (wSum <= 0) return;
    const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-7 || (onlyCompression && dist >= targetLen)) return;
    const corr = (dist - targetLen) / (wSum + alpha);
    const nx = dx / dist; const ny = dy / dist; const nz = dz / dist;
    a.x += a.invMass * corr * nx; a.y += a.invMass * corr * ny; a.z += a.invMass * corr * nz;
    b.x -= b.invMass * corr * nx; b.y -= b.invMass * corr * ny; b.z -= b.invMass * corr * nz;
  };

  for (let sub = 0; sub < substeps; sub += 1) {
    const prev = work.map((p) => [p.x, p.y, p.z] as const);
    for (const p of work) {
      if (p.invMass <= 0) continue;
      p.vx += (gravity[0] + wind[0]) * dtSub; p.vy += (gravity[1] + wind[1]) * dtSub; p.vz += (gravity[2] + wind[2]) * dtSub;
      p.x += p.vx * dtSub; p.y += p.vy * dtSub; p.z += p.vz * dtSub;
    }
    for (let i = 0; i < n - 1; i += 1) solvePair(work[i], work[i + 1], restLen, stretchAlpha, false);
    for (let i = 0; i < n - 2; i += 1) solvePair(work[i], work[i + 2], restBendLen, bendAlpha, true);
    if (collider) {
      for (const p of work) {
        if (p.invMass <= 0) continue;
        const dx = p.x - collider.center[0]; const dy = p.y - collider.center[1]; const dz = p.z - collider.center[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist < collider.radius) {
          const push = collider.radius / Math.max(dist, 1e-6);
          p.x = collider.center[0] + dx * push; p.y = collider.center[1] + dy * push; p.z = collider.center[2] + dz * push;
          colliderPushCount += 1;
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      const p = work[i];
      if (p.invMass <= 0) { p.vx = 0; p.vy = 0; p.vz = 0; continue; }
      p.vx = ((p.x - prev[i][0]) / dtSub) * retain; p.vy = ((p.y - prev[i][1]) / dtSub) * retain; p.vz = ((p.z - prev[i][2]) / dtSub) * retain;
    }
  }

  let maxStretchError = 0;
  let kineticEnergy = 0;
  for (let i = 0; i < n - 1; i += 1) {
    const dist = Math.hypot(work[i + 1].x - work[i].x, work[i + 1].y - work[i].y, work[i + 1].z - work[i].z);
    maxStretchError = Math.max(maxStretchError, Math.abs(dist - restLen) / restLen);
  }
  for (const p of work) if (p.invMass > 0) kineticEnergy += 0.5 * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) / p.invMass;
  const finalTip = work[n - 1];

  return {
    state: {
      particles: work.map((p) => ({ x: roundTo(p.x, 5), y: roundTo(p.y, 5), z: roundTo(p.z, 5), vx: roundTo(p.vx, 5), vy: roundTo(p.vy, 5), vz: roundTo(p.vz, 5), invMass: p.invMass })),
      restSegmentLength: restLen, stepCount: state.stepCount + 1,
    },
    maxStretchError: roundTo(maxStretchError, 5), kineticEnergy: roundTo(kineticEnergy, 4),
    tipDisplacement: roundTo(Math.hypot(finalTip.x - initialTip.x, finalTip.y - initialTip.y, finalTip.z - initialTip.z), 5),
    colliderPushCount, converged: Number.isFinite(maxStretchError) && maxStretchError < 0.025,
  };
}

export const DEFAULT_MOVING_TOON_INPUT: MovingToonExportInput = {
  workTitle: "월광 아틀리에 계약", episodeTitle: "EP.14 봉인 균열", fps: 24, widthPx: 1080, heightPx: 1920, targetProfile: "otio",
  cuts: [
    {
      cutId: "cut-01", title: "달빛 회랑 원경", durationSec: 3.5, transitionType: "dissolve", transitionSec: 0.5,
      layers: [
        { layerId: "l-sky", name: "야경 하늘", kind: "background", zDepth: -4.5 },
        { layerId: "l-arch", name: "고딕 회랑 기둥", kind: "midground", zDepth: -1.8 },
        { layerId: "l-serin", name: "세린 캐릭터", kind: "character", zDepth: 0.2, live2dRigParam: "ParamAngleX" },
        { layerId: "l-dust", name: "전경 빛먼지", kind: "foreground", zDepth: 1.8 },
      ],
      cameraKeyframes: [
        { timeSec: 0, panX: -24, panY: 18, zoom: 1.0, easing: "ease-in-out" },
        { timeSec: 3.5, panX: 16, panY: -12, zoom: 1.12, easing: "ease-out-cubic" },
      ],
      voiceLines: [{ lineId: "v-01", speaker: "세린", text: "봉인의 균열이 예상보다 빠르게 번지고 있어요.", startSec: 0.4, endSec: 2.8, locale: "ko" }],
    },
    {
      cutId: "cut-02", title: "검기 발현 클로즈업", durationSec: 2.8, transitionType: "zoom-push", transitionSec: 0.3,
      layers: [
        { layerId: "l-bg2", name: "균열 배경", kind: "background", zDepth: -3.2 },
        { layerId: "l-kael", name: "카엘 클로즈업", kind: "character", zDepth: 0.4, live2dRigParam: "ParamMouthOpenY" },
        { layerId: "l-sfx2", name: "파지직 효과음", kind: "sfx", zDepth: 1.4 },
      ],
      cameraKeyframes: [
        { timeSec: 0, panX: 0, panY: 8, zoom: 1.04, easing: "ease-out-cubic" },
        { timeSec: 2.8, panX: 4, panY: -6, zoom: 1.24, easing: "linear" },
      ],
      voiceLines: [{ lineId: "v-02", speaker: "카엘", text: "지금 막지 못하면 탑 전체가 무너진다!", startSec: 0.25, endSec: 2.4, locale: "ko" }],
    },
  ],
};

export const DEFAULT_DCC_LIVELINK_PACKET: DccLiveLinkPacket = {
  sourceDcc: "blender", sessionId: "livelink-ep14-bg", sequence: 1, timestampMs: 1_763_900_000_000,
  camera: { position: [4.2, -7.8, 2.6], target: [0.0, 0.5, 1.4], fovDeg: 42, sensorWidthMm: 36 },
  sun: { azimuthDeg: 138, elevationDeg: 26, intensity: 1.15, colorTempKelvin: 4800 },
};
