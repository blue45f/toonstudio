/**
 * #35 원클릭 창작자 IP 파생 상품 패키징 스튜디오 — 360° 3D 턴테이블 카메라 및 15초 오디오툰 트레일러 빌더 (₩0 로컬).
 *
 * (c) 360° 3D 턴테이블 카메라 키프레임(glTF Y-up 미터 단위 + 단위 쿼터니언)
 * (d) 15초 오디오툰 트레일러 큐시트(4막 페이스 · BPM 비트 마커 · BGM 덕킹 · WebVTT 자막)
 */

import { canonicalJsonStringify, sha256HexFromText } from "./sha256-digest";

export interface TurntableCameraOptions {
  readonly frameCount?: number;
  readonly fps?: number;
  readonly targetHeightM?: number;
  readonly targetWidthM?: number;
  readonly elevationDeg?: number;
  readonly focalLengthMm?: number;
  readonly sensorHeightMm?: number;
  readonly verticalMarginRatio?: number;
  readonly direction?: "ccw" | "cw";
}

export interface TurntableCameraKeyframe {
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly positionM: readonly [number, number, number];
  readonly lookAtM: readonly [number, number, number];
  readonly upVector: readonly [number, number, number];
  readonly quaternionXyzw: readonly [number, number, number, number];
  readonly verticalFovDeg: number;
}

export interface TurntableCameraManifest {
  readonly coordinateSystem: "gltf-y-up-meters";
  readonly floorPlaneY: 0;
  readonly frameCount: number;
  readonly fps: number;
  readonly durationSec: number;
  readonly direction: "ccw" | "cw";
  readonly azimuthStepDeg: number;
  readonly totalSweepDeg: 360;
  readonly orbitRadiusM: number;
  readonly lookAtHeightM: number;
  readonly verticalFovDeg: number;
  readonly focalLengthMm: number;
  readonly loopSeamless: boolean;
  readonly keyframes: readonly TurntableCameraKeyframe[];
  readonly artifactSha256: string;
}

export interface TrailerHighlightCutInput {
  readonly cutId: string;
  readonly title: string;
  readonly subtitleText?: string;
  readonly voiceoverLine?: string;
  readonly speakerName?: string;
  readonly sfxLabel?: string;
  readonly emphasisWeight?: number;
}

export interface AudioToonTrailerOptions {
  readonly durationMs?: number;
  readonly bgmAssetId?: string;
  readonly bgmBpm?: number;
  readonly aspectRatio?: "9:16" | "16:9" | "1:1";
  readonly titleCardText?: string;
  readonly ctaText?: string;
  readonly targetLoudnessLufs?: number;
  readonly truePeakMaxDbtp?: number;
}

export interface TrailerVisualCue {
  readonly act: "hook" | "escalation" | "climax" | "title-cta";
  readonly cutId: string;
  readonly title: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly cameraMotion: "ken-burns-zoom-in" | "vertical-pan-up" | "impact-shake" | "hold";
  readonly transitionOut: "cut" | "flash-white" | "whip-pan" | "fade-black";
  readonly subtitleText: string;
}

export interface TrailerVoiceoverCue {
  readonly cueId: string;
  readonly speakerName: string;
  readonly lineText: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly duckingDb: number;
}

export interface TrailerSfxCue {
  readonly cueId: string;
  readonly label: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly gainDb: number;
}

export interface BgmDuckingEnvelope {
  readonly startMs: number;
  readonly endMs: number;
  readonly gainDb: number;
}

export interface AudioToonTrailerCueSheet {
  readonly durationMs: number;
  readonly aspectRatio: "9:16" | "16:9" | "1:1";
  readonly bgmTrack: {
    readonly assetId: string;
    readonly bpm: number;
    readonly startMs: 0;
    readonly endMs: number;
    readonly targetLoudnessLufs: number;
    readonly truePeakMaxDbtp: number;
    readonly beatMarkersMs: readonly number[];
    readonly duckingEnvelopes: readonly BgmDuckingEnvelope[];
  };
  readonly visualCuts: readonly TrailerVisualCue[];
  readonly voiceoverCues: readonly TrailerVoiceoverCue[];
  readonly sfxCues: readonly TrailerSfxCue[];
  readonly webvttCaptions: string;
  readonly artifactSha256: string;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function normalizeVec3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-9) {
    return [0, 0, 1];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lookAtQuaternionXyzw(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  worldUp: readonly [number, number, number],
): [number, number, number, number] {
  // glTF 카메라 로컬 축: +X 오른쪽, +Y 위, -Z 전방(= +Z는 타깃에서 카메라 방향).
  const zAxis = normalizeVec3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const xAxis = normalizeVec3(crossVec3(worldUp, zAxis));
  const yAxis = normalizeVec3(crossVec3(zAxis, xAxis));

  const m00 = xAxis[0];
  const m01 = yAxis[0];
  const m02 = zAxis[0];
  const m10 = xAxis[1];
  const m11 = yAxis[1];
  const m12 = zAxis[1];
  const m20 = xAxis[2];
  const m21 = yAxis[2];
  const m22 = zAxis[2];

  const trace = m00 + m11 + m22;
  let qx: number;
  let qy: number;
  let qz: number;
  let qw: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  const qLen = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
  return [roundTo(qx / qLen, 6), roundTo(qy / qLen, 6), roundTo(qz / qLen, 6), roundTo(qw / qLen, 6)];
}

/**
 * (c) glTF Y-up 미터 좌표계 기준 360° 3D 턴테이블 카메라 키프레임 시퀀스를 생성한다.
 */
export function buildTurntableCameraKeyframes(
  options?: TurntableCameraOptions,
): TurntableCameraManifest {
  const frameCount = Math.max(8, Math.min(360, Math.round(options?.frameCount ?? 36)));
  const fps = Math.max(1, options?.fps ?? 30);
  const targetHeightM = Math.max(0.2, options?.targetHeightM ?? 1.7);
  const targetWidthM = Math.max(0.2, options?.targetWidthM ?? targetHeightM * 0.45);
  const elevationDeg = Math.max(-45, Math.min(75, options?.elevationDeg ?? 12));
  const focalLengthMm = Math.max(12, options?.focalLengthMm ?? 50);
  const sensorHeightMm = Math.max(6, options?.sensorHeightMm ?? 24);
  const verticalMarginRatio = Math.max(0.05, Math.min(0.45, options?.verticalMarginRatio ?? 0.15));
  const direction: "ccw" | "cw" = options?.direction ?? "ccw";

  const verticalFovRad = 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm));
  const verticalFovDeg = roundTo((verticalFovRad * 180) / Math.PI, 3);
  const boundingSpanM = Math.max(targetHeightM, targetWidthM);
  const framedHalfSpan = (boundingSpanM * 0.5) / (1 - verticalMarginRatio);
  const orbitRadiusM = roundTo(framedHalfSpan / Math.tan(verticalFovRad * 0.5), 4);
  const lookAtHeightM = roundTo(targetHeightM * 0.5, 4);
  const elRad = (elevationDeg * Math.PI) / 180;
  const azimuthStepDeg = roundTo(360 / frameCount, 4);
  const dirSign = direction === "ccw" ? 1 : -1;

  const keyframes: TurntableCameraKeyframe[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const rawAz = (dirSign * (i * 360)) / frameCount;
    const azimuthDeg = roundTo(((rawAz % 360) + 360) % 360, 4);
    const azRad = (azimuthDeg * Math.PI) / 180;
    const x = roundTo(orbitRadiusM * Math.cos(elRad) * Math.sin(azRad), 5);
    const y = roundTo(lookAtHeightM + orbitRadiusM * Math.sin(elRad), 5);
    const z = roundTo(orbitRadiusM * Math.cos(elRad) * Math.cos(azRad), 5);
    const pos: readonly [number, number, number] = [x, y, z];
    const lookAt: readonly [number, number, number] = [0, lookAtHeightM, 0];
    const up: readonly [number, number, number] = [0, 1, 0];
    keyframes.push({
      frameIndex: i,
      timeSec: roundTo(i / fps, 4),
      azimuthDeg,
      elevationDeg,
      positionM: pos,
      lookAtM: lookAt,
      upVector: up,
      quaternionXyzw: lookAtQuaternionXyzw(pos, lookAt, up),
      verticalFovDeg,
    });
  }

  const payload = {
    coordinateSystem: "gltf-y-up-meters" as const,
    floorPlaneY: 0 as const,
    frameCount,
    fps,
    durationSec: roundTo(frameCount / fps, 4),
    direction,
    azimuthStepDeg,
    totalSweepDeg: 360 as const,
    orbitRadiusM,
    lookAtHeightM,
    verticalFovDeg,
    focalLengthMm,
    loopSeamless: true,
    keyframes,
  };
  return { ...payload, artifactSha256: sha256HexFromText(canonicalJsonStringify(payload)) };
}

function formatVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  const pad3 = (n: number): string => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

/**
 * (d) 에피소드 핵심 컷으로부터 정확히 15초(기본 15,000ms) 오디오툰 트레일러 큐시트와 WebVTT 자막을 생성한다.
 */
export function buildAudioToonTrailerCueSheet(
  episodeTitle: string,
  highlightCuts: readonly TrailerHighlightCutInput[],
  options?: AudioToonTrailerOptions,
): AudioToonTrailerCueSheet {
  const durationMs = Math.max(5000, Math.round(options?.durationMs ?? 15000));
  const bgmBpm = Math.max(60, Math.min(200, options?.bgmBpm ?? 120));
  const aspectRatio = options?.aspectRatio ?? "9:16";
  const bgmAssetId = options?.bgmAssetId ?? "bgm-audiotoon-trailer-main";
  const targetLoudnessLufs = options?.targetLoudnessLufs ?? -14.0;
  const truePeakMaxDbtp = options?.truePeakMaxDbtp ?? -1.0;

  const titleCardDurationMs = Math.round(durationMs * (2500 / 15000));
  const contentDurationMs = durationMs - titleCardDurationMs;
  const safeCuts: readonly TrailerHighlightCutInput[] =
    highlightCuts.length > 0
      ? highlightCuts
      : [{ cutId: "cut-hero-01", title: episodeTitle, subtitleText: episodeTitle }];

  let weightTotal = 0;
  for (let i = 0; i < safeCuts.length; i += 1) {
    weightTotal += Math.max(0.25, safeCuts[i].emphasisWeight ?? 1);
  }

  const visualCuts: TrailerVisualCue[] = [];
  const voiceoverCues: TrailerVoiceoverCue[] = [];
  const sfxCues: TrailerSfxCue[] = [];
  const duckingEnvelopes: BgmDuckingEnvelope[] = [];
  let cursorMs = 0;

  for (let i = 0; i < safeCuts.length; i += 1) {
    const cut = safeCuts[i];
    const weight = Math.max(0.25, cut.emphasisWeight ?? 1);
    const endMs =
      i === safeCuts.length - 1
        ? contentDurationMs
        : Math.min(contentDurationMs, cursorMs + Math.round((contentDurationMs * weight) / weightTotal));
    const sliceMs = Math.max(100, endMs - cursorMs);
    const ratio = cursorMs / Math.max(1, contentDurationMs);
    const act: TrailerVisualCue["act"] = ratio < 0.25 ? "hook" : ratio < 0.7 ? "escalation" : "climax";
    const cameraMotion: TrailerVisualCue["cameraMotion"] =
      act === "hook" ? "ken-burns-zoom-in" : act === "escalation" ? "vertical-pan-up" : "impact-shake";
    const transitionOut: TrailerVisualCue["transitionOut"] =
      act === "climax" ? "flash-white" : i % 2 === 0 ? "whip-pan" : "cut";

    visualCuts.push({
      act,
      cutId: cut.cutId,
      title: cut.title,
      startMs: cursorMs,
      endMs: cursorMs + sliceMs,
      durationMs: sliceMs,
      cameraMotion,
      transitionOut,
      subtitleText: cut.subtitleText ?? cut.voiceoverLine ?? cut.title,
    });

    if (cut.voiceoverLine && cut.voiceoverLine.trim().length > 0) {
      const voStart = cursorMs + Math.min(120, Math.floor(sliceMs * 0.1));
      const voEnd = Math.max(voStart + 200, cursorMs + sliceMs - 100);
      voiceoverCues.push({
        cueId: `vo-${i + 1}`,
        speakerName: cut.speakerName ?? "내레이터",
        lineText: cut.voiceoverLine.trim(),
        startMs: voStart,
        endMs: Math.min(contentDurationMs, voEnd),
        duckingDb: -8,
      });
      duckingEnvelopes.push({
        startMs: Math.max(0, voStart - 80),
        endMs: Math.min(durationMs, voEnd + 120),
        gainDb: -8,
      });
    }
    if (cut.sfxLabel && cut.sfxLabel.trim().length > 0) {
      sfxCues.push({
        cueId: `sfx-${i + 1}`,
        label: cut.sfxLabel.trim(),
        startMs: cursorMs + Math.min(180, Math.floor(sliceMs * 0.15)),
        durationMs: Math.min(750, Math.max(250, Math.floor(sliceMs * 0.4))),
        gainDb: -3,
      });
    }
    cursorMs += sliceMs;
  }

  visualCuts.push({
    act: "title-cta",
    cutId: "title-card-cta",
    title: options?.titleCardText ?? episodeTitle,
    startMs: cursorMs,
    endMs: durationMs,
    durationMs: durationMs - cursorMs,
    cameraMotion: "hold",
    transitionOut: "fade-black",
    subtitleText: options?.ctaText ?? `${episodeTitle} — 지금 바로 감상하세요`,
  });

  const beatIntervalMs = 60000 / bgmBpm;
  const beatMarkersMs: number[] = [];
  for (let t = 0; t <= durationMs + 0.5; t += beatIntervalMs) {
    const rounded = Math.round(t);
    if (rounded <= durationMs) {
      beatMarkersMs.push(rounded);
    }
  }

  const vttLines: string[] = ["WEBVTT", ""];
  for (let i = 0; i < visualCuts.length; i += 1) {
    const cue = visualCuts[i];
    vttLines.push(`${i + 1}`);
    vttLines.push(`${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`);
    vttLines.push(cue.subtitleText);
    vttLines.push("");
  }

  const payload = {
    durationMs,
    aspectRatio,
    bgmTrack: {
      assetId: bgmAssetId,
      bpm: bgmBpm,
      startMs: 0 as const,
      endMs: durationMs,
      targetLoudnessLufs,
      truePeakMaxDbtp,
      beatMarkersMs,
      duckingEnvelopes,
    },
    visualCuts,
    voiceoverCues,
    sfxCues,
    webvttCaptions: vttLines.join("\n"),
  };

  return { ...payload, artifactSha256: sha256HexFromText(canonicalJsonStringify(payload)) };
}
