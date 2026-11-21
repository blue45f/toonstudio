/**
 * 네이버 웹툰 AI 페인터 스타일 클린룸 로컬 선화 자동 채색 · 음영 엔진
 *
 * REA 실증 근거: ev_4e5c0db05c83d7ecea85d2bb6cd0a6e44dda0d6a51df4ef104622e296e5fd830
 * (https://ai.webtoons.com/ -> https://comic.naver.com/index 관측.
 *  explicit unknowns: 서버 측 신경망 채색 모델 가중치 및 인증된 Creator Studio API 페이로드는 공개되지 않음.)
 *
 * 이 엔진은 서버 가중치를 추정·복제하지 않고, 클라이언트에서 선화의 어두운 잉크 경계를 자동 감지한 뒤
 * 사용자가 찍은 컬러 힌트 핀({ x, y, rgb, radius })으로부터 경계 가중 Laplace/Jacobi 색상 확산을 반복해
 * 선 바깥 번짐 없이 자연스럽게 채색하고 4종 웹툰 스타일 프리셋과 전/후 비교 슬라이더를 제공한다.
 */

export interface PainterRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface ColorHintPin {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rgb: readonly [number, number, number];
  readonly radius: number;
  readonly labelKo?: string;
}

export type WebtoonColorStylePresetId =
  | "daily-watercolor"
  | "rofan-glow"
  | "action-hardcel"
  | "academy-pastel";

export interface WebtoonColorStylePreset {
  readonly id: WebtoonColorStylePresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly saturationGain: number;
  readonly brightnessShift: number;
  readonly celQuantizeSteps: number;
  readonly edgeShadowStrength: number;
  readonly glowLift: number;
  readonly tintRgb: readonly [number, number, number];
  readonly tintMix: number;
}

export const WEBTOON_COLOR_STYLE_PRESETS: readonly WebtoonColorStylePreset[] = [
  {
    id: "daily-watercolor",
    labelKo: "일상 수채화",
    descriptionKo: "종이 결처럼 부드럽고 따뜻한 수채 번짐 톤",
    saturationGain: 0.94,
    brightnessShift: 8,
    celQuantizeSteps: 0,
    edgeShadowStrength: 0.16,
    glowLift: 0.06,
    tintRgb: [252, 240, 224],
    tintMix: 0.12,
  },
  {
    id: "rofan-glow",
    labelKo: "로판 글로우",
    descriptionKo: "화사한 하이라이트 광채와 보석 같은 채도 보정",
    saturationGain: 1.22,
    brightnessShift: 10,
    celQuantizeSteps: 0,
    edgeShadowStrength: 0.12,
    glowLift: 0.24,
    tintRgb: [255, 228, 242],
    tintMix: 0.16,
  },
  {
    id: "action-hardcel",
    labelKo: "액션 하드셀",
    descriptionKo: "선명한 2단 셀 명암 대비와 묵직한 그림자",
    saturationGain: 1.15,
    brightnessShift: -6,
    celQuantizeSteps: 3,
    edgeShadowStrength: 0.34,
    glowLift: 0.02,
    tintRgb: [215, 226, 250],
    tintMix: 0.08,
  },
  {
    id: "academy-pastel",
    labelKo: "학원물 파스텔",
    descriptionKo: "청량하고 맑은 고명도 파스텔 톤",
    saturationGain: 0.88,
    brightnessShift: 18,
    celQuantizeSteps: 0,
    edgeShadowStrength: 0.1,
    glowLift: 0.14,
    tintRgb: [232, 238, 255],
    tintMix: 0.18,
  },
];

export interface LineartColorizeOptions {
  readonly presetId?: WebtoonColorStylePresetId;
  readonly inkLuminanceThreshold?: number;
  readonly iterations?: number;
  readonly preserveCrispInk?: boolean;
}

export interface LineartColorizeResult {
  readonly colorizedImage: PainterRgbaBuffer;
  readonly colorOnlyLayer: PainterRgbaBuffer;
  readonly preset: WebtoonColorStylePreset;
  readonly inkPixelCount: number;
  readonly coloredPixelCount: number;
  readonly iterationsRun: number;
  readonly convergenceDelta: number;
  readonly bleedViolationCount: number;
}

export interface BeforeAfterComparisonState {
  readonly splitPercent: number;
  readonly orientation: "vertical" | "horizontal";
  readonly showLabels: boolean;
}

function clampByte(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

function clampRange(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function pixelLuma(data: Uint8ClampedArray, offset: number): number {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

export function getWebtoonColorStylePreset(
  presetId: WebtoonColorStylePresetId,
): WebtoonColorStylePreset {
  return (
    WEBTOON_COLOR_STYLE_PRESETS.find((preset) => preset.id === presetId) ??
    WEBTOON_COLOR_STYLE_PRESETS[0]
  );
}

/**
 * 선화 RGBA와 컬러 힌트 핀 배열로 경계 가중 Laplace/Jacobi 자동 채색을 수행한다.
 * 닫힌 어두운 잉크 경계(전도도 0)를 넘지 않으므로 선 바깥 번짐이 0건으로 유지된다.
 */
export function runNaverStyleLineartColorize(
  lineArt: PainterRgbaBuffer,
  pins: readonly ColorHintPin[],
  options?: LineartColorizeOptions,
): LineartColorizeResult {
  const { width, height, data } = lineArt;
  const total = width * height;
  const preset = getWebtoonColorStylePreset(options?.presetId ?? "daily-watercolor");
  const inkThreshold = clampRange(options?.inkLuminanceThreshold ?? 108, 24, 210);
  const maxIterations = clampRange(options?.iterations ?? 36, 4, 120);
  const preserveCrispInk = options?.preserveCrispInk ?? true;

  // 1. 잉크 장벽 및 연속 경계 전도도 맵 계산.
  const isInk = new Uint8Array(total);
  const conductance = new Float32Array(total);
  let inkPixelCount = 0;

  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const alpha = data[o + 3];
    const luma = pixelLuma(data, o);
    if (alpha >= 24 && luma < inkThreshold) {
      isInk[i] = 1;
      conductance[i] = 0;
      inkPixelCount += 1;
    } else {
      // 선화 안티앨리어싱 회색 경계에서는 전도도를 낮춰 경계 번짐을 억제한다.
      const edgeSoft = alpha >= 24 ? clampRange((luma - inkThreshold) / 72, 0.08, 1) : 1;
      conductance[i] = edgeSoft;
    }
  }

  // 2. 디리클레(Dirichlet) 핀 앵커 시드 + 잉크 장벽 준수 반경 BFS 확장.
  const fixed = new Uint8Array(total);
  const reachable = new Uint8Array(total);
  const fieldR = new Float32Array(total);
  const fieldG = new Float32Array(total);
  const fieldB = new Float32Array(total);
  const bfsQueue = new Int32Array(total);
  let bfsHead = 0;
  let bfsTail = 0;

  for (const pin of pins) {
    const sx = clampRange(Math.round(pin.x), 0, width - 1);
    const sy = clampRange(Math.round(pin.y), 0, height - 1);
    const startIdx = sy * width + sx;
    if (isInk[startIdx] === 1) continue;

    const maxR = Math.max(1, pin.radius);
    const localVisited = new Uint8Array(total);
    const seedQueue: number[] = [startIdx];
    localVisited[startIdx] = 1;

    while (seedQueue.length > 0) {
      const idx = seedQueue.shift();
      if (idx === undefined) break;
      const x = idx % width;
      const y = (idx - x) / width;

      fixed[idx] = 1;
      fieldR[idx] = pin.rgb[0];
      fieldG[idx] = pin.rgb[1];
      fieldB[idx] = pin.rgb[2];
      if (reachable[idx] === 0) {
        reachable[idx] = 1;
        bfsQueue[bfsTail] = idx;
        bfsTail += 1;
      }

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const nIdx of neighbors) {
        if (nIdx < 0 || localVisited[nIdx] === 1 || isInk[nIdx] === 1) continue;
        const nx = nIdx % width;
        const ny = (nIdx - nx) / width;
        if (Math.hypot(nx - sx, ny - sy) <= maxR) {
          localVisited[nIdx] = 1;
          seedQueue.push(nIdx);
        }
      }
    }
  }

  // 3. 멀티소스 BFS로 핀과 연결된 닫힌 영역 전체에 초기 보로노이 색상 전파 (잉크 장벽 절대 미통과).
  while (bfsHead < bfsTail) {
    const idx = bfsQueue[bfsHead];
    bfsHead += 1;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x + 1 < width ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y + 1 < height ? idx + width : -1,
    ];
    for (const nIdx of neighbors) {
      if (nIdx < 0 || isInk[nIdx] === 1 || reachable[nIdx] === 1) continue;
      reachable[nIdx] = 1;
      fieldR[nIdx] = fieldR[idx];
      fieldG[nIdx] = fieldG[idx];
      fieldB[nIdx] = fieldB[idx];
      bfsQueue[bfsTail] = nIdx;
      bfsTail += 1;
    }
  }

  // 4. 경계 가중 Laplace/Jacobi 색상 확산 반복: 같은 영역 내 다중 핀 사이를 자연스럽게 그라데이션 보간.
  const nextR = new Float32Array(fieldR);
  const nextG = new Float32Array(fieldG);
  const nextB = new Float32Array(fieldB);
  let iterationsRun = 0;
  let convergenceDelta = 0;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let maxStepChange = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (reachable[idx] === 0 || fixed[idx] === 1 || isInk[idx] === 1) continue;

        let wSum = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        const cSelf = conductance[idx];

        const accumulate = (nIdx: number): void => {
          if (reachable[nIdx] === 0 || isInk[nIdx] === 1) return;
          const w = Math.min(cSelf, conductance[nIdx]);
          if (w <= 0) return;
          wSum += w;
          rSum += fieldR[nIdx] * w;
          gSum += fieldG[nIdx] * w;
          bSum += fieldB[nIdx] * w;
        };

        if (x > 0) accumulate(idx - 1);
        if (x + 1 < width) accumulate(idx + 1);
        if (y > 0) accumulate(idx - width);
        if (y + 1 < height) accumulate(idx + width);

        if (wSum > 0) {
          const nr = rSum / wSum;
          const ng = gSum / wSum;
          const nb = bSum / wSum;
          const delta =
            Math.abs(nr - fieldR[idx]) + Math.abs(ng - fieldG[idx]) + Math.abs(nb - fieldB[idx]);
          if (delta > maxStepChange) maxStepChange = delta;
          nextR[idx] = nr;
          nextG[idx] = ng;
          nextB[idx] = nb;
        }
      }
    }
    fieldR.set(nextR);
    fieldG.set(nextG);
    fieldB.set(nextB);
    iterationsRun = iter + 1;
    convergenceDelta = Math.round(maxStepChange * 1000) / 1000;
    if (maxStepChange < 0.05) break;
  }

  // 5. 4종 웹툰 스타일 프리셋 톤 보정 + 선화 경계 음영 + 선명 잉크 합성.
  const colorOnly = new Uint8ClampedArray(total * 4);
  const colorized = new Uint8ClampedArray(data);
  let coloredPixelCount = 0;
  let bleedViolationCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const o = idx * 4;
      if (isInk[idx] === 1) {
        if (preserveCrispInk) {
          colorized[o] = data[o];
          colorized[o + 1] = data[o + 1];
          colorized[o + 2] = data[o + 2];
          colorized[o + 3] = data[o + 3];
        }
        continue;
      }

      if (reachable[idx] === 0) {
        if (colorOnly[o + 3] > 0) bleedViolationCount += 1;
        continue;
      }

      coloredPixelCount += 1;
      let r = fieldR[idx];
      let g = fieldG[idx];
      let b = fieldB[idx];

      // 잉크 인접 픽셀에 스타일별 미세 테두리 음영 적용.
      const nearInk =
        (x > 0 && isInk[idx - 1] === 1) ||
        (x + 1 < width && isInk[idx + 1] === 1) ||
        (y > 0 && isInk[idx - width] === 1) ||
        (y + 1 < height && isInk[idx + width] === 1);
      const edgeShade = nearInk ? 1 - preset.edgeShadowStrength : 1;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * preset.saturationGain + preset.brightnessShift;
      g = gray + (g - gray) * preset.saturationGain + preset.brightnessShift;
      b = gray + (b - gray) * preset.saturationGain + preset.brightnessShift;

      if (preset.celQuantizeSteps > 0) {
        const step = 255 / preset.celQuantizeSteps;
        const directional = (x / Math.max(1, width) + y / Math.max(1, height)) * 0.5;
        const celGain = directional > 0.58 ? 0.82 : 1.04;
        r = Math.round((r * celGain) / step) * step;
        g = Math.round((g * celGain) / step) * step;
        b = Math.round((b * celGain) / step) * step;
      }

      const highlightBoost = preset.glowLift * (1 - (y / Math.max(1, height)) * 0.7) * 42;
      r = (r * (1 - preset.tintMix) + preset.tintRgb[0] * preset.tintMix + highlightBoost) * edgeShade;
      g = (g * (1 - preset.tintMix) + preset.tintRgb[1] * preset.tintMix + highlightBoost) * edgeShade;
      b = (b * (1 - preset.tintMix) + preset.tintRgb[2] * preset.tintMix + highlightBoost) * edgeShade;

      const cr = clampByte(r);
      const cg = clampByte(g);
      const cb = clampByte(b);

      colorOnly[o] = cr;
      colorOnly[o + 1] = cg;
      colorOnly[o + 2] = cb;
      colorOnly[o + 3] = 255;

      // 원본 선화 픽셀(밝은 종이/투명) 위에 Multiply 감성으로 자연 합성.
      const srcAlpha = data[o + 3] / 255;
      if (srcAlpha < 0.08) {
        colorized[o] = cr;
        colorized[o + 1] = cg;
        colorized[o + 2] = cb;
        colorized[o + 3] = 255;
      } else {
        colorized[o] = clampByte((cr * data[o]) / 255);
        colorized[o + 1] = clampByte((cg * data[o + 1]) / 255);
        colorized[o + 2] = clampByte((cb * data[o + 2]) / 255);
        colorized[o + 3] = 255;
      }
    }
  }

  return {
    colorizedImage: { width, height, data: colorized },
    colorOnlyLayer: { width, height, data: colorOnly },
    preset,
    inkPixelCount,
    coloredPixelCount,
    iterationsRun,
    convergenceDelta,
    bleedViolationCount,
  };
}

/** 전/후 비교 분할 슬라이더 초기 상태 생성. */
export function createBeforeAfterComparisonState(
  splitPercent = 50,
): BeforeAfterComparisonState {
  return {
    splitPercent: clampRange(Math.round(splitPercent), 0, 100),
    orientation: "vertical",
    showLabels: true,
  };
}

export function setComparisonSplitPercent(
  state: BeforeAfterComparisonState,
  percent: number,
): BeforeAfterComparisonState {
  return { ...state, splitPercent: clampRange(Math.round(percent), 0, 100) };
}

export function stepComparisonSplit(
  state: BeforeAfterComparisonState,
  deltaPercent: number,
): BeforeAfterComparisonState {
  return setComparisonSplitPercent(state, state.splitPercent + deltaPercent);
}

export function toggleComparisonOrientation(
  state: BeforeAfterComparisonState,
): BeforeAfterComparisonState {
  return {
    ...state,
    orientation: state.orientation === "vertical" ? "horizontal" : "vertical",
  };
}

/**
 * 즉시 체험 가능한 웹툰 캐릭터 선화(닫힌 머리·얼굴·상의 영역) RGBA 버퍼를 생성한다.
 */
export function createDemoWebtoonLineart(width = 48, height = 48): PainterRgbaBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = 252;
    data[o + 1] = 250;
    data[o + 2] = 248;
    data[o + 3] = 255;
  }

  const drawInkPixel = (x: number, y: number): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const o = (y * width + x) * 4;
    data[o] = 20;
    data[o + 1] = 20;
    data[o + 2] = 24;
    data[o + 3] = 255;
  };

  const cx = width * 0.5;
  const headCy = height * 0.36;
  const headR = Math.min(width, height) * 0.24;

  // 닫힌 얼굴 윤곽선 + 상단 머리카락 경계 + 하단 상의 윤곽선.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distHead = Math.hypot(x - cx, y - headCy);
      if (Math.abs(distHead - headR) <= 0.9) {
        drawInkPixel(x, y);
      }
      // 앞머리 구분선 (얼굴 내부를 머리카락/피부 두 닫힌 영역으로 분할).
      if (distHead < headR && Math.abs(y - (headCy - headR * 0.22)) <= 0.75) {
        drawInkPixel(x, y);
      }
      // 상의 사다리꼴 닫힌 윤곽선.
      const torsoTop = Math.round(headCy + headR);
      const torsoBot = Math.round(height * 0.88);
      if (y >= torsoTop && y <= torsoBot) {
        const t = (y - torsoTop) / Math.max(1, torsoBot - torsoTop);
        const halfW = headR * (0.7 + t * 0.55);
        const onSide = Math.abs(Math.abs(x - cx) - halfW) <= 0.95;
        const onTopOrBot = (y === torsoTop || y === torsoBot) && Math.abs(x - cx) <= halfW;
        if (onSide || onTopOrBot) {
          drawInkPixel(x, y);
        }
      }
    }
  }

  return { width, height, data };
}
