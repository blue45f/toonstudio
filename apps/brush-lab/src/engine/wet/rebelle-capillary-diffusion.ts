import { kmMixRgb } from "../pigment/kubelka-munk";

export type Rgb = readonly [number, number, number];

/**
 * Rebelle 7 / Adobe Fresco 스타일의 실시간 모세관 수채 확산(Capillary Diffusion)·
 * 중력 기울기 이류(Gravity Tilt Advection)·수분 증발·과립화(Granulation)·꽃양배추(Cauliflower) 번짐을
 * 외부 상용 라이브러리 없이 순수 수학 공식으로 클린룸 내재화한 모듈.
 *
 * 핵심 물리 모델:
 * 1. 모세관 수분 확산:
 *    $$\frac{\partial w}{\partial t} = D \nabla \cdot (c(h) \nabla w) - \vec{g}_{\text{tilt}} \cdot \nabla w - \lambda_{\text{evap}} w$$
 *    여기서 $c(h) = 1 - \alpha_{\text{grain}} h(x,y)$ 는 종이 산($h \to 1$)에서의 모세관 저항 계수다.
 * 2. 꽃양배추(Backrun / Coffee-ring) 외곽 집적:
 *    젖은 영역과 마른 영역의 경계($|\nabla w|$ 가 큰 지점)에서 증발 속도가 빨라
 *    내부 수분과 안료가 외곽 경계선으로 이동해 짙은 테두리(fringe)를 형성한다.
 * 3. 안료 과립화(Granulation):
 *    무거운 광물 안료는 종이 골짜기($1 - h(x,y)$)에 침전되어 질감을 드러낸다.
 * 4. Kubelka-Munk K/S 습식 색 혼합:
 *    이웃 셀에서 유입되는 물감과 현재 셀의 물감을 물리적 K/S 공간(`kmMixRgb`)에서 혼합한다.
 */

export interface RebelleCapillaryConfig {
  /** 모세관 확산 계수 (0..0.25, 기본 0.12) */
  readonly diffusionRate: number;
  /** 증발(건조) 감쇠율 (0..0.2, 기본 0.02) */
  readonly evaporationRate: number;
  /** 종이 요철 저항 강도 (0..1, 기본 0.45) */
  readonly paperResistance: number;
  /** 안료 과립화(종이 골짜기 침전) 강도 (0..1, 기본 0.5) */
  readonly granulationStrength: number;
  /** 꽃양배추(외곽 경계 테두리 집적) 강도 (0..1, 기본 0.35) */
  readonly fringeStrength: number;
  /** 캔버스 중력 기울기 X (-1..1, 기본 0) */
  readonly tiltX: number;
  /** 캔버스 중력 기울기 Y (-1..1, 기본 0) */
  readonly tiltY: number;
}

export const DEFAULT_REBELLE_CAPILLARY_CONFIG: RebelleCapillaryConfig = {
  diffusionRate: 0.12,
  evaporationRate: 0.02,
  paperResistance: 0.45,
  granulationStrength: 0.5,
  fringeStrength: 0.35,
  tiltX: 0,
  tiltY: 0,
};

export interface CapillaryWetGrid {
  readonly width: number;
  readonly height: number;
  /** 셀별 수분량 (0..1) */
  readonly wetness: Float32Array;
  /** 셀별 안료 농도 (0..1) */
  readonly pigmentDensity: Float32Array;
  /** 셀별 종이 높이맵 (0 = 골짜기, 1 = 봉우리) */
  readonly paperHeight: Float32Array;
  /** 셀별 선형 RGB 안료 색상 (길이 = width * height * 3) */
  readonly pigmentRgb: Float32Array;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * 결정론적 종이 높이맵을 가진 초기 수채 모세관 격자를 생성한다.
 */
export function createCapillaryWetGrid(width: number, height: number): CapillaryWetGrid {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const count = safeW * safeH;
  const paperHeight = new Float32Array(count);
  const pigmentRgb = new Float32Array(count * 3);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      // 결정론적 다중 주파수 코사인 합성으로 콜드프레스 수채화지 요철 생성
      const wave1 = Math.sin((x + 0.5) * 1.1) * Math.cos((y + 0.5) * 1.1);
      const wave2 = Math.sin((x + 0.25) * 2.3 + (y + 0.25) * 1.7);
      paperHeight[idx] = clamp01(0.5 + 0.3 * wave1 + 0.2 * wave2);
      pigmentRgb[idx * 3] = 1;
      pigmentRgb[idx * 3 + 1] = 1;
      pigmentRgb[idx * 3 + 2] = 1;
    }
  }

  return {
    width: safeW,
    height: safeH,
    wetness: new Float32Array(count),
    pigmentDensity: new Float32Array(count),
    paperHeight,
    pigmentRgb,
  };
}

/**
 * 격자의 특정 원형 영역에 수분과 안료를 붓는다.
 */
export function depositWetPigmentDab(
  grid: CapillaryWetGrid,
  centerX: number,
  centerY: number,
  radiusPx: number,
  waterAmount: number,
  pigmentAmount: number,
  color: Rgb,
): void {
  const r = Math.max(0.5, radiusPx);
  const minX = Math.max(0, Math.floor(centerX - r));
  const maxX = Math.min(grid.width - 1, Math.ceil(centerX + r));
  const minY = Math.max(0, Math.floor(centerY - r));
  const maxY = Math.min(grid.height - 1, Math.ceil(centerY + r));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - centerX, y - centerY);
      if (dist > r) continue;
      const falloff = 1 - (dist / r) ** 2;
      const idx = y * grid.width + x;

      const addedWater = clamp01(waterAmount) * falloff;
      const addedPigment = clamp01(pigmentAmount) * falloff;

      const prevPigment = grid.pigmentDensity[idx] ?? 0;
      const nextPigment = clamp01(prevPigment + addedPigment);
      grid.wetness[idx] = clamp01((grid.wetness[idx] ?? 0) + addedWater);
      grid.pigmentDensity[idx] = nextPigment;

      if (addedPigment > 1e-4) {
        const prevColor: Rgb = [
          grid.pigmentRgb[idx * 3] ?? 1,
          grid.pigmentRgb[idx * 3 + 1] ?? 1,
          grid.pigmentRgb[idx * 3 + 2] ?? 1,
        ];
        const mixWeight = prevPigment <= 1e-4 ? 1 : clamp01(addedPigment / (prevPigment + addedPigment));
        const mixed = prevPigment <= 1e-4 ? color : kmMixRgb(prevColor, color, mixWeight);
        grid.pigmentRgb[idx * 3] = mixed[0];
        grid.pigmentRgb[idx * 3 + 1] = mixed[1];
        grid.pigmentRgb[idx * 3 + 2] = mixed[2];
      }
    }
  }
}

/**
 * 종이 높이와 과립화 강도로부터 셀의 유효 안료 침전 계수를 계산한다.
 * 골짜기(`paperHeight` 가 낮을수록)에 안료가 더 짙게 모인다.
 */
export function computeGranulationFactor(paperHeight: number, granulationStrength: number): number {
  const h = clamp01(paperHeight);
  const g = clamp01(granulationStrength);
  const valleyDepth = 1 - h;
  return 1 + g * (valleyDepth - 0.5) * 1.4;
}

/**
 * 모세관 수채 확산을 1스텝 진행하고 새로운 격자 상태를 반환한다.
 */
export function stepCapillaryDiffusion(
  grid: CapillaryWetGrid,
  config: Partial<RebelleCapillaryConfig> = {},
): CapillaryWetGrid {
  const cfg: RebelleCapillaryConfig = {
    ...DEFAULT_REBELLE_CAPILLARY_CONFIG,
    ...config,
  };
  const { width, height } = grid;
  const count = width * height;
  const nextWetness = new Float32Array(count);
  const nextPigment = new Float32Array(count);
  const nextRgb = new Float32Array(grid.pigmentRgb);

  const dRate = Math.max(0, Math.min(0.24, cfg.diffusionRate));
  const evap = Math.max(0, Math.min(0.5, cfg.evaporationRate));
  const resist = clamp01(cfg.paperResistance);
  const fringe = clamp01(cfg.fringeStrength);
  const tiltX = Math.max(-1, Math.min(1, cfg.tiltX));
  const tiltY = Math.max(-1, Math.min(1, cfg.tiltY));

  const offsets: readonly [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const wSelf = grid.wetness[idx] ?? 0;
      const pSelf = grid.pigmentDensity[idx] ?? 0;
      const hSelf = grid.paperHeight[idx] ?? 0.5;

      let wFlux = 0;
      let pFlux = 0;
      let dryNeighbors = 0;
      let currentColor: Rgb = [
        grid.pigmentRgb[idx * 3] ?? 1,
        grid.pigmentRgb[idx * 3 + 1] ?? 1,
        grid.pigmentRgb[idx * 3 + 2] ?? 1,
      ];

      for (const [ox, oy] of offsets) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          dryNeighbors += 1;
          continue;
        }
        const nIdx = ny * width + nx;
        const wNb = grid.wetness[nIdx] ?? 0;
        const pNb = grid.pigmentDensity[nIdx] ?? 0;
        const hNb = grid.paperHeight[nIdx] ?? 0.5;

        if (wNb < 0.05) dryNeighbors += 1;

        // 모세관 전도율: 종이 산이 높을수록 흐름 저항 증가
        const conductivity = Math.max(0.05, 1 - resist * 0.5 * (hSelf + hNb));
        // 중력 기울기 보정: 이웃에서 현재 셀로 향하는 벡터 (-ox, -oy) 와 기울기 내적
        const gravityBias = 1 + 0.35 * ((-ox) * tiltX + (-oy) * tiltY);
        const weight = dRate * conductivity * Math.max(0, gravityBias);

        wFlux += weight * (wNb - wSelf);

        // 수분이 충분할 때만 안료가 함께 확산
        const activeWet = Math.max(wSelf, wNb);
        if (activeWet > 0.04) {
          const pDelta = weight * activeWet * (pNb - pSelf);
          pFlux += pDelta;
          if (pDelta > 1e-4 && pNb > 1e-4) {
            const nbColor: Rgb = [
              grid.pigmentRgb[nIdx * 3] ?? 1,
              grid.pigmentRgb[nIdx * 3 + 1] ?? 1,
              grid.pigmentRgb[nIdx * 3 + 2] ?? 1,
            ];
            const mixT = clamp01(pDelta / Math.max(1e-4, pSelf + pDelta));
            currentColor = kmMixRgb(currentColor, nbColor, mixT);
          }
        }
      }

      // 꽃양배추(Cauliflower) 외곽 집적: 젖은 셀 옆에 마른 셀이 있으면 외곽에 안료가 모임
      const isWetEdge = wSelf > 0.08 && dryNeighbors > 0;
      const fringeBoost = isWetEdge ? 1 + fringe * (dryNeighbors / 4) * 0.18 : 1;
      const granFactor = computeGranulationFactor(hSelf, cfg.granulationStrength);

      const updatedWet = clamp01((wSelf + wFlux) * (1 - evap));
      const updatedPigment = clamp01((pSelf + pFlux) * fringeBoost * (0.85 + 0.15 * granFactor));

      nextWetness[idx] = updatedWet;
      nextPigment[idx] = updatedPigment;
      nextRgb[idx * 3] = currentColor[0];
      nextRgb[idx * 3 + 1] = currentColor[1];
      nextRgb[idx * 3 + 2] = currentColor[2];
    }
  }

  return {
    width,
    height,
    wetness: nextWetness,
    pigmentDensity: nextPigment,
    paperHeight: grid.paperHeight,
    pigmentRgb: nextRgb,
  };
}
