/** 컷 진입 효과음과 무드별 앰비언트 BGM을 결정적 PCM 트랙으로 합성한다. */
import type { MotionTeaserSchedule } from "./webtoon-motion-teaser";
import type {
  WebtoonManuscriptMoodId,
  WebtoonSfxStampOption,
  WebtoonStripSfxStamps,
} from "./webtoon-strip-composer";

export interface SynthesizeMotionAudioOptions {
  readonly includeAmbientBgm?: boolean;
  readonly moodId?: WebtoonManuscriptMoodId;
}

export interface MotionTeaserAudioTrackPcm {
  readonly sampleRate: number;
  readonly durationMs: number;
  readonly eventCount: number;
  readonly ambientBgm: boolean;
  readonly samples: Float32Array;
}

export const MOTION_TEASER_AUDIO_SAMPLE_RATE = 22_050;

/**
 * 시간대 원고 무드별 무저작권 절차적 앰비언트 화성 코드 패드 주파수(Hz, 4성부 보이싱).
 */
export const MOOD_AMBIENT_CHORD_HZ: Readonly<
  Record<WebtoonManuscriptMoodId, readonly [number, number, number, number]>
> = Object.freeze({
  "daylight-paper": [174.61, 220.0, 261.63, 329.63], // Fmaj7 포근한 한낮 어쿠스틱 패드
  "twilight-amber": [146.83, 220.0, 261.63, 329.63], // Dm9 노을빛 서정 패드
  "midnight-noir": [130.81, 155.56, 196.0, 246.94], // Cm(maj7) 느와르 미스터리 패드
  "backlit-awakening": [110.0, 164.81, 220.0, 246.94], // Asus2/A5 역광 각성 에테르 패드
});

function softLimitSample(raw: number): number {
  const shaped = Math.tanh(raw * 1.08) * 0.95;
  return Math.max(-0.95, Math.min(0.95, shaped));
}

function synthesizeMoodAmbientPadBed(
  samples: Float32Array,
  sampleRate: number,
  moodId: WebtoonManuscriptMoodId,
): void {
  const chord = MOOD_AMBIENT_CHORD_HZ[moodId] ?? MOOD_AMBIENT_CHORD_HZ["daylight-paper"];
  const total = samples.length;
  if (total <= 0) return;
  const fadeInSamples = Math.max(1, Math.min(Math.floor(total * 0.2), Math.floor(sampleRate * 0.18)));
  const fadeOutSamples = Math.max(1, Math.min(Math.floor(total * 0.25), Math.floor(sampleRate * 0.24)));
  const voiceWeights = [0.34, 0.27, 0.22, 0.17] as const;

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const fadeIn = i < fadeInSamples ? 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples)) : 1;
    const rem = total - 1 - i;
    const fadeOut = rem < fadeOutSamples ? 0.5 * (1 - Math.cos((Math.PI * rem) / fadeOutSamples)) : 1;
    // 완만한 호흡 모듈레이션(0.45Hz)으로 루프 이음새 없는 따뜻한 앰비언트 패드 형성 (-18dB ≈ 0.125 peak)
    const shimmer = 0.86 + 0.14 * Math.sin(2 * Math.PI * 0.45 * t);
    let pad = 0;
    for (let v = 0; v < 4; v += 1) {
      const freq = chord[v]!;
      const detuned = freq * (1 + (v - 1.5) * 0.0018);
      const voice =
        Math.sin(2 * Math.PI * freq * t + v * 0.6) * 0.68 +
        Math.sin(2 * Math.PI * detuned * t + v * 1.1) * 0.32;
      pad += voice * voiceWeights[v]!;
    }
    samples[i] = softLimitSample((samples[i] ?? 0) + pad * 0.125 * shimmer * fadeIn * fadeOut);
  }
}

function synthesizeSingleSfxEvent(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  stamp: Exclude<WebtoonSfxStampOption, "none">,
): void {
  const startIdx = Math.max(0, Math.floor(startSec * sampleRate));
  const durationSec =
    stamp === "kugugung" ? 0.44 : stamp === "dugeun" ? 0.36 : stamp === "ssaa" ? 0.40 : 0.26;
  const count = Math.min(samples.length - startIdx, Math.floor(durationSec * sampleRate));
  if (count <= 0) return;

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const u = i / count;
    const env = Math.sin(Math.min(1, u * 8) * Math.PI * 0.5) * Math.pow(1 - u, 1.65);
    let wave: number;

    if (stamp === "dugeun") {
      // 두근: 심장 고동 2연타 저역 펄스
      const beat1 = t < 0.15 ? Math.sin(2 * Math.PI * (74 - t * 90) * t) * Math.pow(1 - t / 0.15, 1.8) : 0;
      const dt2 = t - 0.16;
      const beat2 = dt2 >= 0 && dt2 < 0.18 ? Math.sin(2 * Math.PI * (86 - dt2 * 100) * dt2) * Math.pow(1 - dt2 / 0.18, 1.7) : 0;
      wave = (beat1 + beat2 * 0.92) * 0.42;
    } else if (stamp === "seureung") {
      // 스릉: 금속성 발도 상향 FM 스윕
      const freq = 580 + 1920 * Math.pow(u, 0.72);
      wave = (Math.sin(2 * Math.PI * freq * t) * 0.65 + Math.sin(2 * Math.PI * freq * 2.03 * t) * 0.35) * env * 0.28;
    } else if (stamp === "kugugung") {
      // 쿠구궁: 저주파 지진 서브베이스 진동
      const mod = Math.sin(2 * Math.PI * 19 * t) * 1.4;
      wave = (Math.sin(2 * Math.PI * 52 * t + mod) * 0.7 + Math.sin(2 * Math.PI * 104 * t) * 0.3) * env * 0.38;
    } else if (stamp === "pat") {
      // 팟: 맑은 섬광 벨 하모닉 차임
      wave = (Math.sin(2 * Math.PI * 1318.5 * t) * 0.6 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.4) * env * 0.26;
    } else if (stamp === "beonjjeok") {
      // 번쩍: 각성 전기 처프 스윕
      const chirp = 1960 - 1320 * Math.abs(u - 0.38);
      wave = (Math.sin(2 * Math.PI * chirp * t) * 0.7 + Math.sin(2 * Math.PI * (chirp * 1.5) * t) * 0.3) * env * 0.28;
    } else {
      // 싸아: 서늘한 밤바람 배음 클러스터(Math.random 없는 결정적 다중 사인 합성)
      const cluster =
        Math.sin(2 * Math.PI * 311.1 * t) * 0.34 +
        Math.sin(2 * Math.PI * 466.2 * t + 0.7) * 0.28 +
        Math.sin(2 * Math.PI * 739.9 * t + 1.9) * 0.22 +
        Math.sin(2 * Math.PI * 1174.7 * t + 3.1) * 0.16;
      wave = cluster * env * 0.24;
    }

    samples[startIdx + i] = softLimitSample((samples[startIdx + i] ?? 0) + wave);
  }
}

/**
 * 컷별 효과음 스탬프(`sfxStamps`)·무드별 앰비언트 화성 BGM 패드(`includeAmbientBgm`)와 오토패닝 스케줄을 동기화해 결정적 모노 PCM 트랙을 합성한다.
 */
export function synthesizeMotionTeaserAudioPcm(
  schedule: MotionTeaserSchedule,
  sfxStamps: WebtoonStripSfxStamps,
  sampleRate = MOTION_TEASER_AUDIO_SAMPLE_RATE,
  options: SynthesizeMotionAudioOptions = {},
): MotionTeaserAudioTrackPcm {
  const safeRate = Math.max(8_000, Math.min(48_000, Math.floor(sampleRate)));
  const totalSamples = Math.max(256, Math.ceil((schedule.outputDurationMs / 1000) * safeRate));
  const samples = new Float32Array(totalSamples);
  const ambientBgm = options.includeAmbientBgm === true;

  if (ambientBgm) {
    synthesizeMoodAmbientPadBed(samples, safeRate, options.moodId ?? "daylight-paper");
  }

  let eventCount = 0;
  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const stamp = sfxStamps[cutIdx];
    if (stamp === "none") continue;
    const seg = schedule.timeline.segments[cutIdx]!;
    const startSec = (seg.dwellStartMs / Math.max(0.25, schedule.speed) + 35) / 1000;
    synthesizeSingleSfxEvent(samples, safeRate, startSec, stamp);
    eventCount += 1;
  }

  return {
    sampleRate: safeRate,
    durationMs: schedule.outputDurationMs,
    eventCount,
    ambientBgm,
    samples,
  };
}
