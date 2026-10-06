/**
 * 가상 스튜디오 합성 앰비언스 (절차 생성, 음원 파일 없음).
 *
 * 보유한 환경음 녹음이 빗소리 2종뿐이라, 바람·실내 공기감을 코드로 만든다.
 * 화이트 노이즈를 시간에 따라 움직이는 1폴 저역 필터에 통과시키는 방식이며,
 * 필터를 원형 버퍼로 여러 번 돌려 루프 경계가 이어지게 한다(클릭 없음).
 * 생성은 결정적이다(고정 시드) — 같은 종류는 항상 같은 소리를 낸다.
 */

export type StudioAmbientSynthKind = "wind" | "room";

export interface StudioAmbientSynthSpec {
  /** 저역 필터 기본 차단 주파수(Hz). */
  readonly baseCutoffHz: number;
  /** 차단 주파수가 출렁이는 폭(Hz). */
  readonly swingCutoffHz: number;
  /** 루프 한 바퀴 동안의 차단 주파수 출렁임 횟수(정수라야 경계가 이어진다). */
  readonly gustCycles: number;
  /** 루프 한 바퀴 동안의 음량 swell 횟수(정수). */
  readonly swellCycles: number;
  /** swell 깊이 0~1. */
  readonly swellDepth: number;
  /** 목표 RMS. 바람은 또렷하게, 실내 공기감은 배경에 깔릴 만큼만. */
  readonly targetRms: number;
  readonly seed: number;
}

const SYNTH_SPECS: Record<StudioAmbientSynthKind, StudioAmbientSynthSpec> = {
  // 바람: 차단 주파수가 천천히 오르내리고 음량도 함께 출렁인다.
  wind: { baseCutoffHz: 420, swingCutoffHz: 380, gustCycles: 1, swellCycles: 2, swellDepth: 0.35, targetRms: 0.13, seed: 0x51ab3 },
  // 실내 공기감: 낮은 대역의 거의 일정한 공기 소리. 환풍기처럼 배경에 깔린다.
  room: { baseCutoffHz: 190, swingCutoffHz: 25, gustCycles: 1, swellCycles: 1, swellDepth: 0.08, targetRms: 0.035, seed: 0x9c41d },
};

export function studioAmbientSynthSpec(kind: StudioAmbientSynthKind): StudioAmbientSynthSpec {
  return SYNTH_SPECS[kind];
}

/** 결정적 난수(mulberry32). 같은 시드는 같은 수열을 만든다. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateChannel(spec: StudioAmbientSynthSpec, sampleRate: number, samples: number, seed: number): Float32Array<ArrayBuffer> {
  const random = mulberry32(seed);
  const white = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) white[index] = random() * 2 - 1;
  const out: Float32Array<ArrayBuffer> = new Float32Array(samples);
  // 원형 버퍼를 세 번 돌린다. 필터 상태가 수렴해 시작과 끝이 자연스럽게 이어진다.
  let previous = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 0; index < samples; index += 1) {
      const phase = (index / samples) * Math.PI * 2;
      const cutoff = spec.baseCutoffHz + spec.swingCutoffHz * (0.5 + 0.5 * Math.sin(phase * spec.gustCycles));
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      previous += alpha * (white[index]! - previous);
      out[index] = previous;
    }
  }
  // 음량 swell(주기 함수라 루프 경계에서 끊기지 않는다)과 RMS 정규화.
  let sumSquares = 0;
  for (let index = 0; index < samples; index += 1) {
    const phase = (index / samples) * Math.PI * 2;
    const swell = 1 - spec.swellDepth * (0.5 + 0.5 * Math.sin(phase * spec.swellCycles + Math.PI));
    out[index] = out[index]! * swell;
    sumSquares += out[index]! * out[index]!;
  }
  const rms = Math.sqrt(sumSquares / samples);
  if (rms <= 0) return out;
  let peak = 0;
  for (let index = 0; index < samples; index += 1) peak = Math.max(peak, Math.abs(out[index]!));
  const scale = Math.min(spec.targetRms / rms, peak > 0 ? 0.95 / peak : Number.POSITIVE_INFINITY);
  for (let index = 0; index < samples; index += 1) out[index] = out[index]! * scale;
  return out;
}

/** 스테레오 샘플을 생성한다. 좌우는 시드만 달라 서로 상관성이 낮다. */
export function generateStudioAmbientSamples(
  kind: StudioAmbientSynthKind,
  sampleRate: number,
  seconds: number,
): { readonly left: Float32Array<ArrayBuffer>; readonly right: Float32Array<ArrayBuffer> } {
  const spec = studioAmbientSynthSpec(kind);
  const samples = Math.max(1, Math.round(sampleRate * seconds));
  return Object.freeze({
    left: generateChannel(spec, sampleRate, samples, spec.seed),
    right: generateChannel(spec, sampleRate, samples, spec.seed ^ 0x5f3759df),
  });
}

/** 재생용 AudioBuffer로 만든다. 컨트롤러가 녹음 트랙의 decode 결과와 같은 자리에 쓴다. */
export function createStudioAmbientSynthBuffer(
  context: AudioContext,
  kind: StudioAmbientSynthKind,
  seconds: number,
): AudioBuffer {
  const { left, right } = generateStudioAmbientSamples(kind, context.sampleRate, seconds);
  const buffer = context.createBuffer(2, left.length, context.sampleRate);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}
