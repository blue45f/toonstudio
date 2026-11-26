/**
 * Super-Gap Pillar A (#4): Personalized Hand-Tremor FFT Kalman / One-Euro Auto-Calibrator.
 * 초기 20개 원시 스트로크를 Hann + Radix-2 FFT로 분석해 손떨림 주파수(4~14Hz)와 진폭을
 * 계측하고 의도적 코너를 보존하는 개인화 One-Euro(`minCutoff`/`beta`) 및 2D Kalman 필터를
 * ₩0 로컬로 자동 보정한다.
 */

export interface RawStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure?: number;
}

export interface SpectrumBin {
  readonly frequencyHz: number;
  readonly magnitude: number;
  readonly power: number;
}

export interface StrokeSpectrumAnalysis {
  readonly samplingRateHz: number;
  readonly fftSize: number;
  readonly dominantTremorHz: number;
  readonly tremorBandEnergyRatio: number;
  readonly intentionalBandEnergyRatio: number;
  readonly tremorRmsPx: number;
  readonly signalToTremorDb: number;
  readonly bins: readonly SpectrumBin[];
}

export interface CalibratedOneEuroParams {
  readonly minCutoffHz: number;
  readonly beta: number;
  readonly dCutoffHz: number;
}

export interface CalibratedKalmanParams {
  readonly processNoiseQ: number;
  readonly measurementNoiseR: number;
  readonly cornerResetAngleRad: number;
}

export interface ArtistTremorCalibrationProfile {
  readonly analyzedStrokeCount: number;
  readonly recommendedStrokeCount: 20;
  readonly isFullCalibration: boolean;
  readonly detectedCornerCount: number;
  readonly spectrum: StrokeSpectrumAnalysis;
  readonly oneEuro: CalibratedOneEuroParams;
  readonly kalman: CalibratedKalmanParams;
  readonly tremorSeverity: "steady" | "mild" | "moderate" | "strong";
  readonly elapsedMs: number;
}

function nextPowerOfTwo(n: number): number {
  let p = 16;
  while (p < n && p < 4096) {
    p <<= 1;
  }
  return p;
}

/**
 * 제자리(in-place) Radix-2 Cooley-Tukey FFT.
 */
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wCos = Math.cos(angleStep);
    const wSin = Math.sin(angleStep);
    for (let start = 0; start < n; start += len) {
      let curCos = 1;
      let curSin = 0;
      for (let k = 0; k < half; k += 1) {
        const uRe = re[start + k];
        const uIm = im[start + k];
        const vRe = re[start + k + half] * curCos - im[start + k + half] * curSin;
        const vIm = re[start + k + half] * curSin + im[start + k + half] * curCos;
        re[start + k] = uRe + vRe;
        im[start + k] = uIm + vIm;
        re[start + k + half] = uRe - vRe;
        im[start + k + half] = uIm - vIm;
        const nextCos = curCos * wCos - curSin * wSin;
        curSin = curCos * wSin + curSin * wCos;
        curCos = nextCos;
      }
    }
  }
}

function resampleStrokeUniform(
  stroke: readonly RawStrokeSample[],
  targetFsHz: number,
): { xs: Float64Array; ys: Float64Array } {
  const tStart = stroke[0].timestampMs;
  const tEnd = stroke[stroke.length - 1].timestampMs;
  const durationSec = Math.max(0.05, (tEnd - tStart) / 1000);
  const count = Math.max(16, Math.min(2048, Math.floor(durationSec * targetFsHz) + 1));
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  const stepMs = 1000 / targetFsHz;

  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const targetT = tStart + i * stepMs;
    while (cursor < stroke.length - 2 && stroke[cursor + 1].timestampMs < targetT) {
      cursor += 1;
    }
    const a = stroke[cursor];
    const b = stroke[Math.min(stroke.length - 1, cursor + 1)];
    const span = b.timestampMs - a.timestampMs;
    const frac = span > 1e-6 ? Math.max(0, Math.min(1, (targetT - a.timestampMs) / span)) : 0;
    xs[i] = a.x + (b.x - a.x) * frac;
    ys[i] = a.y + (b.y - a.y) * frac;
  }
  return { xs, ys };
}

function reflectedSample(series: Float64Array, index: number): number {
  const n = series.length;
  if (index < 0) {
    const mirror = Math.min(n - 1, -index);
    return 2 * series[0] - series[mirror];
  }
  if (index >= n) {
    const mirror = Math.max(0, 2 * (n - 1) - index);
    return 2 * series[n - 1] - series[mirror];
  }
  return series[index];
}

function highPassResidual(series: Float64Array, halfWindow: number): Float64Array {
  const n = series.length;
  const out = new Float64Array(n);
  const hw = Math.max(2, halfWindow);
  const winSize = 2 * hw + 1;
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let d = -hw; d <= hw; d += 1) {
      sum += reflectedSample(series, i + d);
    }
    out[i] = series[i] - sum / winSize;
  }
  return out;
}

/**
 * 원시 스트로크 집합의 손떨림 주파수 스펙트럼(Hann + Radix-2 FFT)을 계산한다.
 */
export function computeStrokeVelocitySpectrumDft(
  strokes: readonly (readonly RawStrokeSample[])[],
): StrokeSpectrumAnalysis {
  const dts: number[] = [];
  for (let s = 0; s < strokes.length; s += 1) {
    const st = strokes[s];
    for (let i = 1; i < st.length; i += 1) {
      const dt = st[i].timestampMs - st[i - 1].timestampMs;
      if (dt > 0.5 && dt < 200) dts.push(dt);
    }
  }
  dts.sort((a, b) => a - b);
  const medianDtMs = dts.length > 0 ? dts[dts.length >> 1] : 1000 / 120;
  const samplingRateHz = Math.max(30, Math.min(480, 1000 / medianDtMs));

  let maxSampleCount = 64;
  const resampled: { xs: Float64Array; ys: Float64Array }[] = [];
  for (let s = 0; s < strokes.length; s += 1) {
    if (strokes[s].length < 4) continue;
    const rs = resampleStrokeUniform(strokes[s], samplingRateHz);
    if (rs.xs.length > maxSampleCount) maxSampleCount = rs.xs.length;
    resampled.push(rs);
  }

  const fftSize = nextPowerOfTwo(maxSampleCount);
  const halfBins = fftSize >> 1;
  const psdAccum = new Float64Array(halfBins);
  const smoothHalfWindow = Math.max(3, Math.round(samplingRateHz * 0.065));

  for (let r = 0; r < resampled.length; r += 1) {
    const { xs, ys } = resampled[r];
    const rx = highPassResidual(xs, smoothHalfWindow);
    const ry = highPassResidual(ys, smoothHalfWindow);
    const n = xs.length;

    // 의도적 급코너(>= 38°) 근방은 스펙트럼 누설 방지를 위해 코너 마스크로 마스킹
    const cornerMask = new Float64Array(n).fill(1);
    const cWin = Math.max(4, Math.min(10, Math.floor(n / 12)));
    const maskRadius = smoothHalfWindow + 2;
    for (let i = cWin; i < n - cWin; i += 1) {
      const v1x = xs[i] - xs[i - cWin];
      const v1y = ys[i] - ys[i - cWin];
      const v2x = xs[i + cWin] - xs[i];
      const v2y = ys[i + cWin] - ys[i];
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 >= 8 && l2 >= 8) {
        const cosA = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
        if (Math.acos(cosA) >= (38 * Math.PI) / 180) {
          const lo = Math.max(0, i - maskRadius);
          const hi = Math.min(n - 1, i + maskRadius);
          for (let m = lo; m <= hi; m += 1) {
            const distFrac = Math.abs(m - i) / (maskRadius + 1);
            const wKeep = Math.min(cornerMask[m], distFrac * distFrac * 0.15);
            cornerMask[m] = wKeep;
          }
        }
      }
    }

    const reX = new Float64Array(fftSize);
    const imX = new Float64Array(fftSize);
    const reY = new Float64Array(fftSize);
    const imY = new Float64Array(fftSize);
    let winEnergy = 0;

    for (let i = 0; i < n; i += 1) {
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
      const wEff = hann * cornerMask[i];
      winEnergy += wEff * wEff;
      reX[i] = rx[i] * wEff;
      reY[i] = ry[i] * wEff;
    }

    fftRadix2(reX, imX);
    fftRadix2(reY, imY);

    // Parseval 일측 전력 정규화: 2 / (fftSize * sum(wEff^2))
    const normFactor = 2 / Math.max(1e-6, fftSize * winEnergy);
    for (let k = 1; k < halfBins; k += 1) {
      const px = (reX[k] * reX[k] + imX[k] * imX[k]) * normFactor;
      const py = (reY[k] * reY[k] + imY[k] * imY[k]) * normFactor;
      psdAccum[k] += px + py;
    }
  }

  const normStrokes = Math.max(1, resampled.length);
  const freqStep = samplingRateHz / fftSize;
  const bins: SpectrumBin[] = [];
  let totalPower = 0;
  let tremorPower = 0;
  let intentionalPower = 0;
  let peakTremorPower = -1;
  let dominantTremorHz = 8.0;

  for (let k = 1; k < halfBins; k += 1) {
    const freq = k * freqStep;
    const power = psdAccum[k] / normStrokes;
    const magnitude = Math.sqrt(Math.max(0, power));
    bins.push({ frequencyHz: freq, magnitude, power });
    totalPower += power;

    if (freq >= 0.5 && freq < 3.5) {
      intentionalPower += power;
    } else if (freq >= 4.0 && freq <= 14.0) {
      tremorPower += power;
      if (power > peakTremorPower) {
        peakTremorPower = power;
        dominantTremorHz = freq;
      }
    }
  }

  // Parseval 정리로 4~14Hz 생리적 손떨림 대역의 순수 RMS 진폭(px) 산출
  const tremorRmsPx = Math.sqrt(Math.max(0, tremorPower));
  const tremorBandEnergyRatio = totalPower > 1e-12 ? tremorPower / totalPower : 0;
  const intentionalBandEnergyRatio = totalPower > 1e-12 ? intentionalPower / totalPower : 0;
  const signalToTremorDb =
    tremorPower > 1e-12
      ? 10 * Math.log10((intentionalPower + 1e-12) / tremorPower)
      : 40;

  return {
    samplingRateHz,
    fftSize,
    dominantTremorHz,
    tremorBandEnergyRatio,
    intentionalBandEnergyRatio,
    tremorRmsPx,
    signalToTremorDb,
    bins,
  };
}

function countIntentionalCorners(strokes: readonly (readonly RawStrokeSample[])[]): number {
  let count = 0;
  for (let s = 0; s < strokes.length; s += 1) {
    const st = strokes[s];
    if (st.length < 9) continue;
    // 손떨림 반주기(~50ms)를 평균 상쇄하는 매크로 현(chord) 윈도로 의도적 코너만 추출
    const win = Math.max(4, Math.min(10, Math.floor(st.length / 12)));
    let cooldown = 0;
    for (let i = win; i < st.length - win; i += 1) {
      if (cooldown > 0) {
        cooldown -= 1;
        continue;
      }
      const v1x = st[i].x - st[i - win].x;
      const v1y = st[i].y - st[i - win].y;
      const v2x = st[i + win].x - st[i].x;
      const v2y = st[i + win].y - st[i].y;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 < 8 || l2 < 8) continue;
      const cosA = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
      const turnRad = Math.acos(cosA);
      if (turnRad >= (45 * Math.PI) / 180) {
        count += 1;
        cooldown = win + 2;
      }
    }
  }
  return count;
}

/**
 * 작가의 초기 스트로크(권장 20개)를 FFT로 분석해 개인화 One-Euro & Kalman 파라미터를 자동 보정한다.
 */
export function calibrateArtistTremorFilter(
  rawStrokes: readonly (readonly RawStrokeSample[])[],
): ArtistTremorCalibrationProfile {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const analyzed = rawStrokes.slice(0, 20);
  const spectrum = computeStrokeVelocitySpectrumDft(analyzed);
  const detectedCornerCount = countIntentionalCorners(analyzed);

  // 손떨림 진폭(tremorRmsPx)을 주 지표로, 4~14Hz 대역 집중도를 가중 승수로 결합해 보정:
  // 서브픽셀 진폭(steady)은 대역 집중도가 높아도 과평활화하지 않는다.
  const ampFactor = Math.max(0, Math.min(1, spectrum.tremorRmsPx / 3.0));
  const tremorIntensity = Math.max(
    0,
    Math.min(1, ampFactor * (0.65 + 0.35 * spectrum.tremorBandEnergyRatio)),
  );
  const minCutoffHz = Math.max(0.55, Math.min(4.2, 3.6 - tremorIntensity * 2.85));
  const cornerDensity = Math.min(1, detectedCornerCount / Math.max(1, analyzed.length * 1.5));
  // 픽셀 좌표계(100~600 px/s) 기준 Casiez One-Euro beta 범위: 0.0015~0.014
  const beta = Math.max(
    0.0015,
    Math.min(0.014, 0.002 + cornerDensity * 0.0042 + (1 - tremorIntensity) * 0.0045),
  );
  const dCutoffHz = Math.max(0.8, Math.min(2.2, 1.45 - tremorIntensity * 0.45));

  const measurementNoiseR = Math.max(0.15, Math.min(18, 0.35 + spectrum.tremorRmsPx * spectrum.tremorRmsPx * 1.15));
  const processNoiseQ = Math.max(0.05, Math.min(6, 0.4 + cornerDensity * 1.4));
  const cornerResetAngleRad = (52 * Math.PI) / 180;

  let tremorSeverity: ArtistTremorCalibrationProfile["tremorSeverity"] = "steady";
  if (spectrum.tremorRmsPx >= 2.2 || tremorIntensity >= 0.72) {
    tremorSeverity = "strong";
  } else if (spectrum.tremorRmsPx >= 1.1 || tremorIntensity >= 0.45) {
    tremorSeverity = "moderate";
  } else if (spectrum.tremorRmsPx >= 0.45 || tremorIntensity >= 0.22) {
    tremorSeverity = "mild";
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    analyzedStrokeCount: analyzed.length,
    recommendedStrokeCount: 20,
    isFullCalibration: rawStrokes.length >= 20,
    detectedCornerCount,
    spectrum,
    oneEuro: { minCutoffHz, beta, dCutoffHz },
    kalman: { processNoiseQ, measurementNoiseR, cornerResetAngleRad },
    tremorSeverity,
    elapsedMs: Math.max(0, t1 - t0),
  };
}

function lowPassAlpha(dtSec: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(0.05, cutoffHz));
  return 1 / (1 + tau / Math.max(1e-4, dtSec));
}

export interface FilteredStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly effectiveCutoffHz: number;
  readonly cornerPreserved: boolean;
}

/**
 * 개인화 One-Euro + 2D Kalman + 의도적 코너 보존 실시간 스트로크 필터.
 */
export class OneEuroKalmanStrokeFilter {
  private readonly oneEuro: CalibratedOneEuroParams;
  private readonly kalman: CalibratedKalmanParams;
  private initialized = false;
  private lastT = 0;
  private filtX = 0;
  private filtY = 0;
  private dxFilt = 0;
  private dyFilt = 0;
  private kalmanPx = 1;
  private kalmanPy = 1;
  private recentRaw: RawStrokeSample[] = [];

  constructor(profile: Pick<ArtistTremorCalibrationProfile, "oneEuro" | "kalman">) {
    this.oneEuro = profile.oneEuro;
    this.kalman = profile.kalman;
  }

  public reset(): void {
    this.initialized = false;
    this.lastT = 0;
    this.filtX = 0;
    this.filtY = 0;
    this.dxFilt = 0;
    this.dyFilt = 0;
    this.kalmanPx = 1;
    this.kalmanPy = 1;
    this.recentRaw = [];
  }

  public push(sample: RawStrokeSample): FilteredStrokeSample {
    const pressure = sample.pressure ?? 1;
    if (!this.initialized) {
      this.initialized = true;
      this.lastT = sample.timestampMs;
      this.filtX = sample.x;
      this.filtY = sample.y;
      this.recentRaw = [sample];
      return {
        x: sample.x,
        y: sample.y,
        timestampMs: sample.timestampMs,
        pressure,
        effectiveCutoffHz: this.oneEuro.minCutoffHz,
        cornerPreserved: false,
      };
    }

    const dtSec = Math.max(0.001, (sample.timestampMs - this.lastT) / 1000);
    this.lastT = sample.timestampMs;
    this.recentRaw.push(sample);
    if (this.recentRaw.length > 6) {
      this.recentRaw.shift();
    }

    // 1) 의도적 코너 감지: 2~3샘플 구간 전후 방향이 크게 꺾이면서 실제 변위가 충분할 때
    let cornerPreserved = false;
    if (this.recentRaw.length >= 4) {
      const a = this.recentRaw[0];
      const mid = this.recentRaw[this.recentRaw.length - 2];
      const cur = sample;
      const inDx = mid.x - a.x;
      const inDy = mid.y - a.y;
      const outDx = cur.x - mid.x;
      const outDy = cur.y - mid.y;
      const inLen = Math.hypot(inDx, inDy);
      const outLen = Math.hypot(outDx, outDy);
      if (inLen >= 4.0 && outLen >= 2.5) {
        const cosTurn = Math.max(
          -1,
          Math.min(1, (inDx * outDx + inDy * outDy) / (inLen * outLen)),
        );
        const turnAngle = Math.acos(cosTurn);
        if (turnAngle >= this.kalman.cornerResetAngleRad) {
          cornerPreserved = true;
        }
      }
    }

    if (cornerPreserved) {
      // 이전 방향 관성으로 코너가 둥글게 깎이는 현상을 막기 위해 코너 정점(apex)을 우선 통과
      const apex = this.recentRaw[this.recentRaw.length - 2];
      this.filtX = apex.x * 0.78 + sample.x * 0.22;
      this.filtY = apex.y * 0.78 + sample.y * 0.22;
      this.dxFilt = (sample.x - apex.x) / dtSec;
      this.dyFilt = (sample.y - apex.y) / dtSec;
      return {
        x: this.filtX,
        y: this.filtY,
        timestampMs: sample.timestampMs,
        pressure,
        effectiveCutoffHz: 32,
        cornerPreserved: true,
      };
    }

    // 2) 축별 One-Euro 미분 저역필터 및 동적 컷오프 계산 (진행 속도가 측면 떨림 컷오프를 과확장하지 않도록 분리)
    const rawVx = (sample.x - this.filtX) / dtSec;
    const rawVy = (sample.y - this.filtY) / dtSec;
    const alphaD = lowPassAlpha(dtSec, this.oneEuro.dCutoffHz);
    this.dxFilt += alphaD * (rawVx - this.dxFilt);
    this.dyFilt += alphaD * (rawVy - this.dyFilt);

    const cutoffX = this.oneEuro.minCutoffHz + this.oneEuro.beta * Math.abs(this.dxFilt);
    const cutoffY = this.oneEuro.minCutoffHz + this.oneEuro.beta * Math.abs(this.dyFilt);
    const alphaEuroX = lowPassAlpha(dtSec, cutoffX);
    const alphaEuroY = lowPassAlpha(dtSec, cutoffY);
    const euroX = this.filtX + alphaEuroX * (sample.x - this.filtX);
    const euroY = this.filtY + alphaEuroY * (sample.y - this.filtY);
    const cutoffHz = 0.5 * (cutoffX + cutoffY);

    // 3) 2D Kalman 보정
    const predX = this.filtX + this.dxFilt * dtSec * 0.25;
    const predY = this.filtY + this.dyFilt * dtSec * 0.25;
    this.kalmanPx += this.kalman.processNoiseQ;
    this.kalmanPy += this.kalman.processNoiseQ;
    const effR = this.kalman.measurementNoiseR;
    const gainX = this.kalmanPx / (this.kalmanPx + effR);
    const gainY = this.kalmanPy / (this.kalmanPy + effR);
    const kalmanX = predX + gainX * (sample.x - predX);
    const kalmanY = predY + gainY * (sample.y - predY);
    this.kalmanPx *= 1 - gainX;
    this.kalmanPy *= 1 - gainY;

    // One-Euro와 Kalman 추정치 융합
    const blendKalman = 0.3;
    const nextX = euroX * (1 - blendKalman) + kalmanX * blendKalman;
    const nextY = euroY * (1 - blendKalman) + kalmanY * blendKalman;

    this.filtX = nextX;
    this.filtY = nextY;

    return {
      x: this.filtX,
      y: this.filtY,
      timestampMs: sample.timestampMs,
      pressure,
      effectiveCutoffHz: cutoffHz,
      cornerPreserved: false,
    };
  }
}

export function applyCalibratedStrokeFilter(
  samples: readonly RawStrokeSample[],
  profile: Pick<ArtistTremorCalibrationProfile, "oneEuro" | "kalman">,
): FilteredStrokeSample[] {
  const filter = new OneEuroKalmanStrokeFilter(profile);
  const result: FilteredStrokeSample[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    result.push(filter.push(samples[i]));
  }
  return result;
}
