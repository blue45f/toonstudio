/**
 * Wave-32: 모바일 OLED 다이아몬드 펜타일(PenTile) 및 회전 태블릿용 무색수차(Fringing-Free) 선화 리샘플러.
 *
 * 데스크톱 가로 RGB 스트라이프 모니터용 서브픽셀 렌더링을 스마트폰 OLED 펜타일이나 세로 회전 태블릿에 그대로 적용하면
 * 1px 흑백 만화 선화 가장자리에 적·녹 색번짐(Chroma Fringing)이 나타난다.
 * 디스플레이 기하에 맞춰 RGB 지향성 필터와 휘도 고정 대칭 Mitchell-Netravali 필터를 무손실 전환한다.
 */

export type SubpixelDisplayLayout =
  | "rgb-horizontal-stripe"
  | "bgr-horizontal-stripe"
  | "oled-diamond-pentile"
  | "rotated-tablet-dynamic";

export interface DisplaySubpixelProbe {
  readonly devicePixelRatio: number;
  readonly isTouchPrimary: boolean;
  readonly orientationAngleDeg: number;
  readonly panelHint?: "lcd-rgb" | "lcd-bgr" | "oled-pentile";
}

export interface SubpixelLineRenderReport {
  readonly width: number;
  readonly height: number;
  /** 출력 RGBA [0..1] Float32Array (길이 width * height * 4) */
  readonly rgba: Float32Array;
  readonly resolvedLayout: SubpixelDisplayLayout;
  /** 무채색 입력 대비 R-G-B 채널 간 불일치 제곱평균제곱근(RMS): 펜타일·회전 모드에서는 엄격히 0 */
  readonly chromaFringingRms: number;
}

/**
 * 단말 배율·회전각·패널 힌트로부터 안전한 서브픽셀 배치 모드를 결정한다.
 */
export function resolveSafeSubpixelLayout(probe: DisplaySubpixelProbe): SubpixelDisplayLayout {
  const normalizedAngle = ((Math.round(probe.orientationAngleDeg) % 360) + 360) % 360;
  if (probe.panelHint === "oled-pentile") {
    return "oled-diamond-pentile";
  }
  if (normalizedAngle !== 0 || probe.isTouchPrimary) {
    return probe.devicePixelRatio >= 2.5 ? "oled-diamond-pentile" : "rotated-tablet-dynamic";
  }
  if (probe.panelHint === "lcd-bgr") {
    return "bgr-horizontal-stripe";
  }
  return "rgb-horizontal-stripe";
}

/**
 * Mitchell-Netravali (B = 1/3, C = 1/3) 3차 대칭 재구성 커널.
 */
export function mitchellNetravaliWeight(distance: number): number {
  const x = Math.abs(distance);
  if (x >= 2) return 0;
  if (x < 1) {
    return ((7 * x * x * x - 12 * x * x + 5.333333333333333) / 6);
  }
  return ((-2.3333333333333335 * x * x * x + 12 * x * x - 20 * x + 10.666666666666666) / 6);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sampleLuminance3xSupersampled(
  supersampledCoverage3x: Float32Array,
  width3x: number,
  height: number,
  subX: number,
  y: number,
): number {
  const clampedX = Math.max(0, Math.min(width3x - 1, subX));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  return clamp01(supersampledCoverage3x[clampedY * width3x + clampedX] ?? 0);
}

/**
 * 가로 3배 슈퍼샘플링된 선화 잉크 커버리지(`width * 3` × `height`, 0=백지, 1=흑색 먹선)를
 * 대상 디스플레이 서브픽셀 레이아웃에 맞춰 선명하고 색번짐 없는 RGBA [0..1] 버퍼로 다운샘플링한다.
 */
export function resolveCrispLineArtSubpixels(
  supersampledCoverage3x: Float32Array,
  width: number,
  height: number,
  layout: SubpixelDisplayLayout,
  maxLcdSubpixelStrength = 0.65,
): SubpixelLineRenderReport {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const width3x = safeW * 3;
  const rgba = new Float32Array(safeW * safeH * 4);
  const strength = clamp01(maxLcdSubpixelStrength);

  const useDirectionalStripe =
    layout === "rgb-horizontal-stripe" || layout === "bgr-horizontal-stripe";

  let chromaDiffSqSum = 0;
  const totalPixels = safeW * safeH;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const centerSubX = x * 3 + 1;
      const outBase = (y * safeW + x) * 4;

      if (!useDirectionalStripe) {
        // OLED 펜타일 및 회전 태블릿: 휘도 잠금 대칭 Mitchell-Netravali 필터로 색번짐을 0으로 봉쇄
        let weightedCov = 0;
        let weightSum = 0;
        for (let k = -3; k <= 3; k += 1) {
          const w = mitchellNetravaliWeight(k / 2);
          if (w <= 0) continue;
          weightedCov += sampleLuminance3xSupersampled(
            supersampledCoverage3x,
            width3x,
            safeH,
            centerSubX + k,
            y,
          ) * w;
          weightSum += w;
        }
        const ink = weightSum > 0 ? clamp01(weightedCov / weightSum) : 0;
        const luma = 1 - ink;
        rgba[outBase] = luma;
        rgba[outBase + 1] = luma;
        rgba[outBase + 2] = luma;
        rgba[outBase + 3] = 1;
        continue;
      }

      // 데스크톱 가로 스트라이프: 5-탭 Gibson 지향성 에너지 균형 필터 [1/9, 2/9, 3/9, 2/9, 1/9]
      const fiveTap = (subCenter: number): number => {
        const cM2 = sampleLuminance3xSupersampled(supersampledCoverage3x, width3x, safeH, subCenter - 2, y);
        const cM1 = sampleLuminance3xSupersampled(supersampledCoverage3x, width3x, safeH, subCenter - 1, y);
        const c0 = sampleLuminance3xSupersampled(supersampledCoverage3x, width3x, safeH, subCenter, y);
        const cP1 = sampleLuminance3xSupersampled(supersampledCoverage3x, width3x, safeH, subCenter + 1, y);
        const cP2 = sampleLuminance3xSupersampled(supersampledCoverage3x, width3x, safeH, subCenter + 2, y);
        return (cM2 + 2 * cM1 + 3 * c0 + 2 * cP1 + cP2) / 9;
      };

      const leftInk = fiveTap(centerSubX - 1);
      const midInk = fiveTap(centerSubX);
      const rightInk = fiveTap(centerSubX + 1);

      const rawRInk = layout === "rgb-horizontal-stripe" ? leftInk : rightInk;
      const rawGInk = midInk;
      const rawBInk = layout === "rgb-horizontal-stripe" ? rightInk : leftInk;

      const r = 1 - clamp01(midInk + (rawRInk - midInk) * strength);
      const g = 1 - clamp01(rawGInk);
      const b = 1 - clamp01(midInk + (rawBInk - midInk) * strength);

      rgba[outBase] = r;
      rgba[outBase + 1] = g;
      rgba[outBase + 2] = b;
      rgba[outBase + 3] = 1;

      const mean = (r + g + b) / 3;
      chromaDiffSqSum += ((r - mean) * (r - mean) + (g - mean) * (g - mean) + (b - mean) * (b - mean)) / 3;
    }
  }

  return {
    width: safeW,
    height: safeH,
    rgba,
    resolvedLayout: layout,
    chromaFringingRms: Math.sqrt(chromaDiffSqSum / totalPixels),
  };
}
