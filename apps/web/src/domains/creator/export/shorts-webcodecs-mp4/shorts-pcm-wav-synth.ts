/**
 * 순수 16-bit Linear PCM RIFF/WAVE 오디오 합성기 및 헤더 검증기.
 *
 * Web Audio API(`AudioContext` / `OfflineAudioContext`)가 없는 Node·Worker·테스트 환경에서도
 * 감정별 앰비언트 3화음 코드 패드와 효과음 펄스(풍경 종·심박·반짝임·임팩트 붐·엔딩 벨)를
 * 결정적으로 믹싱해 표준 44바이트 RIFF/WAVE `.wav` 바이너리를 생성한다.
 */

import type { CompiledShortsTimeline, ShortsAudioCue } from "./shorts-timeline-compiler";

export interface ShortsWavSynthOptions {
  readonly sampleRate?: 22050 | 44100;
  readonly channels?: 1 | 2;
  readonly includeBgm?: boolean;
  readonly includeSfx?: boolean;
  readonly masterGain?: number;
}

export interface ShortsWavTrackResult {
  readonly bytes: Uint8Array;
  readonly mimeType: "audio/wav";
  readonly sampleRate: 22050 | 44100;
  readonly channels: 1 | 2;
  readonly bitsPerSample: 16;
  readonly sampleFrames: number;
  readonly dataByteLength: number;
  readonly durationSec: number;
  readonly peakAmplitude: number;
  readonly rmsAmplitude: number;
}

export interface WavHeaderInspectionResult {
  readonly isValid: boolean;
  readonly riffId: string;
  readonly chunkSize: number;
  readonly waveId: string;
  readonly fmtId: string;
  readonly subchunk1Size: number;
  readonly audioFormat: number;
  readonly channels: number;
  readonly sampleRate: number;
  readonly byteRate: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
  readonly dataId: string;
  readonly dataByteLength: number;
  readonly totalBytes: number;
}

const WAV_HEADER_BYTES = 44;
const TWO_PI = Math.PI * 2;

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i) & 0x7f;
  }
}

function deterministicNoise(index: number): number {
  const x = Math.imul(index ^ 0x5f3759df, 0x27d4eb2d) >>> 0;
  const mixed = ((x ^ (x >>> 15)) * 0x85ebca6b) >>> 0;
  return (mixed / 0xffffffff) * 2 - 1;
}

function renderCueSfxSample(cue: ShortsAudioCue, elapsedSec: number, sampleIdx: number): number {
  if (elapsedSec < 0) return 0;
  const f = cue.sfxPulseHz;
  switch (cue.sfxStyle) {
    case "chime": {
      if (elapsedSec > 0.5) return 0;
      const env = Math.exp(-elapsedSec * 7.5);
      return env * (0.65 * Math.sin(TWO_PI * f * elapsedSec) + 0.35 * Math.sin(TWO_PI * f * 2.0 * elapsedSec));
    }
    case "heartbeat": {
      const pulseA = elapsedSec <= 0.14 ? Math.exp(-elapsedSec * 22) * Math.sin(TWO_PI * f * elapsedSec) : 0;
      const offsetB = elapsedSec - 0.18;
      const pulseB =
        offsetB >= 0 && offsetB <= 0.16
          ? Math.exp(-offsetB * 18) * Math.sin(TWO_PI * (f * 0.85) * offsetB) * 0.82
          : 0;
      return pulseA + pulseB;
    }
    case "sparkle": {
      if (elapsedSec > 0.42) return 0;
      const step = elapsedSec < 0.12 ? 1 : elapsedSec < 0.24 ? 1.25 : 1.5;
      const env = Math.exp(-elapsedSec * 6.5);
      return env * Math.sin(TWO_PI * f * step * elapsedSec);
    }
    case "impact-hit": {
      if (elapsedSec > 0.38) return 0;
      const sweepHz = f * Math.exp(-elapsedSec * 5.2) + 46;
      const env = Math.exp(-elapsedSec * 8.0);
      const noiseEnv = Math.exp(-elapsedSec * 28.0);
      return env * Math.sin(TWO_PI * sweepHz * elapsedSec) + noiseEnv * 0.35 * deterministicNoise(sampleIdx);
    }
    case "soft-bell": {
      if (elapsedSec > 0.65) return 0;
      const env = Math.exp(-elapsedSec * 5.0);
      return env * (0.7 * Math.sin(TWO_PI * f * elapsedSec) + 0.3 * Math.sin(TWO_PI * f * 0.5 * elapsedSec));
    }
  }
}

/**
 * 타임라인의 감정별 오디오 큐로부터 표준 16-bit PCM RIFF/WAVE `.wav` 바이너리를 합성한다.
 */
export function synthesizeShortsWavTrack(
  timeline: CompiledShortsTimeline,
  options?: ShortsWavSynthOptions,
): ShortsWavTrackResult {
  const sampleRate: 22050 | 44100 = options?.sampleRate === 44100 ? 44100 : 22050;
  const channels: 1 | 2 = options?.channels === 2 ? 2 : 1;
  const includeBgm = options?.includeBgm ?? true;
  const includeSfx = options?.includeSfx ?? true;
  const masterGain = Math.min(1, Math.max(0.05, options?.masterGain ?? 0.84));
  const durationSec = Math.max(0.25, timeline.totalDurationSec);
  const sampleFrames = Math.max(1, Math.round(durationSec * sampleRate));
  const bitsPerSample = 16 as const;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = sampleFrames * blockAlign;
  const totalBytes = WAV_HEADER_BYTES + dataByteLength;

  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);

  // 표준 44바이트 RIFF/WAVE PCM 헤더
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataByteLength, true);

  const leftChannel = new Float32Array(sampleFrames);
  const rightChannel = channels === 2 ? new Float32Array(sampleFrames) : null;

  for (const cue of timeline.audioCues) {
    const startSample = Math.max(0, Math.floor(cue.startSec * sampleRate));
    const endSample = Math.min(sampleFrames, Math.ceil(cue.endSec * sampleRate));
    const cueLengthSamples = Math.max(1, endSample - startSample);
    const fadeSamples = Math.min(Math.floor(cueLengthSamples * 0.25), Math.floor(sampleRate * 0.22));
    const [f1, f2, f3] = cue.chordHz;

    for (let s = startSample; s < endSample; s += 1) {
      const localIdx = s - startSample;
      const tSec = s / sampleRate;
      const elapsedSec = tSec - cue.triggerSec;

      let env = 1;
      if (fadeSamples > 0) {
        if (localIdx < fadeSamples) env = localIdx / fadeSamples;
        else if (localIdx > cueLengthSamples - fadeSamples) {
          env = (cueLengthSamples - localIdx) / fadeSamples;
        }
      }

      let sampleLeft = 0;
      let sampleRight = 0;

      if (includeBgm) {
        const padLeft =
          (Math.sin(TWO_PI * f1 * tSec) +
            0.78 * Math.sin(TWO_PI * f2 * tSec) +
            0.62 * Math.sin(TWO_PI * f3 * tSec) +
            0.16 * Math.sin(TWO_PI * f1 * 2 * tSec)) /
          2.56;
        const padRight =
          channels === 2
            ? (Math.sin(TWO_PI * f1 * tSec + 0.14) +
                0.78 * Math.sin(TWO_PI * (f2 * 1.0015) * tSec) +
                0.62 * Math.sin(TWO_PI * f3 * tSec - 0.14)) /
              2.4
            : padLeft;
        sampleLeft += padLeft * env * cue.bgmGain;
        sampleRight += padRight * env * cue.bgmGain;
      }

      if (includeSfx) {
        const sfxVal = renderCueSfxSample(cue, elapsedSec, s) * cue.sfxGain;
        sampleLeft += sfxVal;
        sampleRight += sfxVal;
      }

      leftChannel[s] = (leftChannel[s] ?? 0) + sampleLeft;
      if (rightChannel) {
        rightChannel[s] = (rightChannel[s] ?? 0) + sampleRight;
      }
    }
  }

  let peakAmplitude = 0;
  let sumSquares = 0;
  let writeOffset = WAV_HEADER_BYTES;

  for (let i = 0; i < sampleFrames; i += 1) {
    const rawL = Math.tanh((leftChannel[i] ?? 0) * masterGain);
    const absL = Math.abs(rawL);
    if (absL > peakAmplitude) peakAmplitude = absL;
    sumSquares += rawL * rawL;
    view.setInt16(writeOffset, Math.round(rawL * 32_767), true);
    writeOffset += 2;

    if (rightChannel) {
      const rawR = Math.tanh((rightChannel[i] ?? 0) * masterGain);
      const absR = Math.abs(rawR);
      if (absR > peakAmplitude) peakAmplitude = absR;
      sumSquares += rawR * rawR;
      view.setInt16(writeOffset, Math.round(rawR * 32_767), true);
      writeOffset += 2;
    }
  }

  const totalSampleCount = sampleFrames * channels;
  const rmsAmplitude = Math.sqrt(sumSquares / Math.max(1, totalSampleCount));

  return {
    bytes,
    mimeType: "audio/wav",
    sampleRate,
    channels,
    bitsPerSample,
    sampleFrames,
    dataByteLength,
    durationSec: Math.round((sampleFrames / sampleRate) * 1_000) / 1_000,
    peakAmplitude: Math.round(peakAmplitude * 10_000) / 10_000,
    rmsAmplitude: Math.round(rmsAmplitude * 10_000) / 10_000,
  };
}

export function inspectWavHeader(bytes: Uint8Array): WavHeaderInspectionResult {
  if (bytes.byteLength < WAV_HEADER_BYTES) {
    return {
      isValid: false,
      riffId: "",
      chunkSize: 0,
      waveId: "",
      fmtId: "",
      subchunk1Size: 0,
      audioFormat: 0,
      channels: 0,
      sampleRate: 0,
      byteRate: 0,
      blockAlign: 0,
      bitsPerSample: 0,
      dataId: "",
      dataByteLength: 0,
      totalBytes: bytes.byteLength,
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffId = readAscii(bytes, 0, 4);
  const chunkSize = view.getUint32(4, true);
  const waveId = readAscii(bytes, 8, 4);
  const fmtId = readAscii(bytes, 12, 4);
  const subchunk1Size = view.getUint32(16, true);
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataId = readAscii(bytes, 36, 4);
  const dataByteLength = view.getUint32(40, true);

  const expectedBlockAlign = channels * (bitsPerSample / 8);
  const expectedByteRate = sampleRate * expectedBlockAlign;
  const isValid =
    riffId === "RIFF" &&
    waveId === "WAVE" &&
    fmtId === "fmt " &&
    dataId === "data" &&
    subchunk1Size === 16 &&
    audioFormat === 1 &&
    bitsPerSample === 16 &&
    (channels === 1 || channels === 2) &&
    blockAlign === expectedBlockAlign &&
    byteRate === expectedByteRate &&
    chunkSize === 36 + dataByteLength &&
    bytes.byteLength === WAV_HEADER_BYTES + dataByteLength;

  return {
    isValid,
    riffId,
    chunkSize,
    waveId,
    fmtId,
    subchunk1Size,
    audioFormat,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    dataId,
    dataByteLength,
    totalBytes: bytes.byteLength,
  };
}
