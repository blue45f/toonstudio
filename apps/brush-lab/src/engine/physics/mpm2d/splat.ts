/**
 * 입자 → 이미지: 가우시안 스플랫 누적 + smoothstep 문턱 알파(메타볼).
 *
 * 입자마다 가우시안 가중치로 `[밀도, 밀도×R, 밀도×G, 밀도×B]`를 16×16 희소 타일(`TilePool`, 타일당 1024 float = 픽셀당 4칸)에 누적한다.
 * 색은 **선형 sRGB**에서 가중 평균하므로 입자 경계에서 어두운 띠가 생기지 않는다. 누적 밀도가 문턱(`low`..`high`)을 넘으면
 * smoothstep으로 알파가 켜져 입자 덩어리가 매끈한 가장자리를 가진 한 덩어리 물감이 된다(질감은 종이 단계가 담당한다).
 *
 * 가우시안은 `(1 − x/16)¹⁶`(x = r²/2σ²)으로 근사한다 — 네 번의 제곱만 쓰는 사칙 연산이라 `Math.exp` 없이 결정적이고,
 * 3σ 바깥은 자른다. 문턱은 "입자가 꽉 찬 영역의 밀도"에 대한 비율로 받는다(간격이 바뀌어도 가장자리 위치가 같다).
 *
 * `resolveWetTile`은 누적 타일을 문서 위에 올릴 최종 픽셀(선형 premultiplied)로 바꾼다. 문서에 이미 물감이 있으면 KM 혼색으로
 * 섞는다(노랑 위의 파랑 → 초록). 문서를 바꾸지 않고 `out`에만 쓰므로 읽기(readback)와 굽기(bake)가 같은 함수를 쓴다.
 */
import { StrokeBudgetExceededError } from "../../core/errors";
import { STROKE_FLOATS_PER_TILE, TILE_SIZE } from "../../raster/tile-binning";
import { TilePool } from "../../raster/tile-pool";

import type { BandMixer } from "../../pigment/km-mix";

export interface SplatConfig {
  widthPx: number;
  heightPx: number;
  /** 가우시안 σ(px). */
  sigmaPx: number;
  /** 입자 간격(px). 꽉 찬 밀도 = 2πσ²/간격². */
  spacingPx: number;
  /** 알파가 켜지기 시작하는 밀도 비율(꽉 찬 밀도 대비). */
  lowFraction: number;
  /** 알파가 1이 되는 밀도 비율. */
  highFraction: number;
  /** 타일 풀 용량(타일 수). 넘으면 그 입자를 건너뛰고 `skippedParticles`로 센다. */
  capacityTiles: number;
}

/** 해상도 의존 없이 쓰는 문턱(절대 밀도). */
export interface WetThresholds {
  low: number;
  high: number;
}

const CUTOFF_X = 4.5; // 3σ: x = r²/(2σ²) = 4.5

export class ParticleSplat {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly pool: TilePool;
  /** 타일 풀이 모자라 누적하지 못한 입자 수(누적, `clear`로 0). */
  skippedParticles = 0;
  private readonly sigma: number;
  private readonly radius: number;
  private readonly invTwoSigma2: number;
  private readonly thresholds: WetThresholds;
  private readonly views = new Map<number, Float32Array>();

  constructor(cfg: SplatConfig) {
    if (!(cfg.sigmaPx > 0) || !(cfg.spacingPx > 0)) throw new RangeError("ParticleSplat: sigmaPx·spacingPx는 양수여야 한다");
    if (!(cfg.lowFraction >= 0) || !(cfg.highFraction > cfg.lowFraction)) {
      throw new RangeError("ParticleSplat: 0 ≤ lowFraction < highFraction이어야 한다");
    }
    this.width = cfg.widthPx;
    this.height = cfg.heightPx;
    this.tilesX = Math.ceil(cfg.widthPx / TILE_SIZE);
    this.tilesY = Math.ceil(cfg.heightPx / TILE_SIZE);
    this.pool = new TilePool(cfg.capacityTiles, STROKE_FLOATS_PER_TILE);
    this.sigma = cfg.sigmaPx;
    this.radius = Math.ceil(cfg.sigmaPx * 3);
    this.invTwoSigma2 = 1 / (2 * cfg.sigmaPx * cfg.sigmaPx);
    const full = (2 * Math.PI * cfg.sigmaPx * cfg.sigmaPx) / (cfg.spacingPx * cfg.spacingPx);
    this.thresholds = { low: full * cfg.lowFraction, high: full * cfg.highFraction };
  }

  /** 알파 문턱(절대 밀도). */
  get wetThresholds(): WetThresholds {
    return this.thresholds;
  }

  /** 누적 타일을 비운다. */
  clear(): void {
    this.pool.clear();
    this.views.clear();
    this.skippedParticles = 0;
  }

  /** 할당된 (타일 번호, 읽기 전용 데이터) 목록(타일 번호 오름차순). */
  tiles(): [tile: number, data: Float32Array][] {
    return this.pool.entries().map(([tile, slot]) => [tile, this.pool.peek(slot)]);
  }

  private tileView(tile: number): Float32Array {
    const cached = this.views.get(tile);
    if (cached) return cached;
    const view = this.pool.view(this.pool.alloc(tile));
    this.views.set(tile, view);
    return view;
  }

  /**
   * 입자 `count`개를 누적한다. `rgb`는 입자마다 선형 sRGB straight 3칸이다.
   * 타일 풀이 모자라면 그 입자를 통째로 건너뛰고(부분 그리기 없음) 센다.
   */
  accumulate(xs: ArrayLike<number>, ys: ArrayLike<number>, rgb: ArrayLike<number>, count: number): void {
    const R = this.radius;
    const inv2s2 = this.invTwoSigma2;
    for (let p = 0; p < count; p += 1) {
      const cx = xs[p];
      const cy = ys[p];
      const x0 = Math.max(0, Math.floor(cx) - R);
      const x1 = Math.min(this.width - 1, Math.floor(cx) + R);
      const y0 = Math.max(0, Math.floor(cy) - R);
      const y1 = Math.min(this.height - 1, Math.floor(cy) + R);
      if (x1 < x0 || y1 < y0) continue;
      // 걸치는 타일을 먼저 모두 확보한다(원자적: 하나라도 못 얻으면 이 입자는 통째로 건너뜀).
      const tx0 = Math.floor(x0 / TILE_SIZE);
      const tx1 = Math.floor(x1 / TILE_SIZE);
      const ty0 = Math.floor(y0 / TILE_SIZE);
      const ty1 = Math.floor(y1 / TILE_SIZE);
      try {
        for (let ty = ty0; ty <= ty1; ty += 1) for (let tx = tx0; tx <= tx1; tx += 1) this.tileView(ty * this.tilesX + tx);
      } catch (error) {
        if (error instanceof StrokeBudgetExceededError) {
          this.skippedParticles += 1;
          continue;
        }
        throw error;
      }
      const cr = rgb[p * 3];
      const cg = rgb[p * 3 + 1];
      const cb = rgb[p * 3 + 2];
      let lastTile = -1;
      let data: Float32Array | undefined;
      for (let y = y0; y <= y1; y += 1) {
        const dy = y + 0.5 - cy;
        const ly = y - Math.floor(y / TILE_SIZE) * TILE_SIZE;
        const rowTile = Math.floor(y / TILE_SIZE) * this.tilesX;
        for (let x = x0; x <= x1; x += 1) {
          const dx = x + 0.5 - cx;
          const xx = (dx * dx + dy * dy) * inv2s2;
          if (xx >= CUTOFF_X) continue;
          let w = 1 - xx * 0.0625;
          w *= w;
          w *= w;
          w *= w;
          w *= w;
          const tile = rowTile + Math.floor(x / TILE_SIZE);
          if (tile !== lastTile) {
            data = this.views.get(tile);
            lastTile = tile;
          }
          if (!data) continue;
          const o = (ly * TILE_SIZE + (x - Math.floor(x / TILE_SIZE) * TILE_SIZE)) * 4;
          data[o] += w;
          data[o + 1] += w * cr;
          data[o + 2] += w * cg;
          data[o + 3] += w * cb;
        }
      }
    }
  }

  /** 가우시안 σ(px). */
  get sigmaPx(): number {
    return this.sigma;
  }
}

/** 문턱 보간: smoothstep(low, high, d). */
function smoothstep(low: number, high: number, d: number): number {
  const t = (d - low) / (high - low);
  const c = t > 0 ? (t < 1 ? t : 1) : 0;
  return c * c * (3 - 2 * c);
}

/** 색이 이만큼 이하로 다르면 혼색 대신 단순 합성한다(같은 색끼리 KM 복원 왕복 오차가 번지는 것을 막고 시간을 아낀다). */
const SAME_COLOR_EPS = 2e-3;
const ALPHA_EPS = 1e-6;
/** 알파가 이 이하인 스플랫 픽셀은 문서를 그대로 둔다. */
const WET_ALPHA_MIN = 1e-4;

export interface WetResolveParams {
  thresholds: WetThresholds;
  /** 물감 불투명도 배율(0..1). 프로그램 opacity × 획 색 알파. */
  opacity: number;
  /** KM 혼색기. null이면 항상 단순 over(혼색 없음). */
  mixer: BandMixer | null;
}

const scratchA: [number, number, number] = [0, 0, 0];
const scratchB: [number, number, number] = [0, 0, 0];
const scratchOut = new Float32Array(3);

/**
 * 누적 타일 하나를 문서 위에 올린 최종 픽셀을 `out`(1024 float, 선형 premultiplied RGBA, 타일 레이아웃)에 쓴다.
 * 캔버스 밖 픽셀은 쓰지 않는다(0으로 둔다). 문서·누적 데이터는 읽기만 한다.
 * 반환값은 알파가 켜진(문서를 바꾸는) 픽셀 수다.
 */
export function resolveWetTile(
  doc: Float32Array,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  accum: Float32Array,
  p: WetResolveParams,
  out: Float32Array,
): number {
  const x0 = tileX * TILE_SIZE;
  const y0 = tileY * TILE_SIZE;
  const lyEnd = Math.min(TILE_SIZE, height - y0);
  const lxEnd = Math.min(TILE_SIZE, width - x0);
  const { low, high } = p.thresholds;
  const op = p.opacity > 0 ? (p.opacity < 1 ? p.opacity : 1) : 0;
  let touched = 0;
  out.fill(0);
  for (let ly = 0; ly < lyEnd; ly += 1) {
    for (let lx = 0; lx < lxEnd; lx += 1) {
      const s = (ly * TILE_SIZE + lx) * 4;
      const d = ((y0 + ly) * width + (x0 + lx)) * 4;
      const dr = doc[d];
      const dg = doc[d + 1];
      const db = doc[d + 2];
      const da = doc[d + 3];
      const density = accum[s];
      const a = density > low ? smoothstep(low, high, density) * op : 0;
      if (a <= WET_ALPHA_MIN) {
        out[s] = dr;
        out[s + 1] = dg;
        out[s + 2] = db;
        out[s + 3] = da;
        continue;
      }
      touched += 1;
      const inv = 1 / density;
      const sr = accum[s + 1] * inv;
      const sg = accum[s + 2] * inv;
      const sb = accum[s + 3] * inv;
      const k = 1 - a;
      const outA = a + da * k;
      if (da <= ALPHA_EPS) {
        out[s] = sr * a;
        out[s + 1] = sg * a;
        out[s + 2] = sb * a;
        out[s + 3] = a;
        continue;
      }
      const ir = dr / da;
      const ig = dg / da;
      const ib = db / da;
      const same =
        Math.abs(ir - sr) <= SAME_COLOR_EPS && Math.abs(ig - sg) <= SAME_COLOR_EPS && Math.abs(ib - sb) <= SAME_COLOR_EPS;
      if (p.mixer === null || same) {
        out[s] = sr * a + dr * k;
        out[s + 1] = sg * a + dg * k;
        out[s + 2] = sb * a + db * k;
        out[s + 3] = outA;
        continue;
      }
      // 문서의 색(straight)과 물감 색을 KM으로 섞는다. 가중은 "물감이 차지하는 몫" a / (a + (1 − a)·da).
      scratchA[0] = ir;
      scratchA[1] = ig;
      scratchA[2] = ib;
      scratchB[0] = sr;
      scratchB[1] = sg;
      scratchB[2] = sb;
      const w = a / (a + k * da);
      p.mixer.mix(scratchA, scratchB, w, scratchOut, 0);
      out[s] = scratchOut[0] * outA;
      out[s + 1] = scratchOut[1] * outA;
      out[s + 2] = scratchOut[2] * outA;
      out[s + 3] = outA;
    }
  }
  return touched;
}

/** `resolveWetTile`이 만든 타일을 문서에 복사한다(캔버스 안쪽만). */
export function commitWetTile(
  doc: Float32Array,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  resolved: Float32Array,
): void {
  const x0 = tileX * TILE_SIZE;
  const y0 = tileY * TILE_SIZE;
  const lyEnd = Math.min(TILE_SIZE, height - y0);
  const lxEnd = Math.min(TILE_SIZE, width - x0);
  for (let ly = 0; ly < lyEnd; ly += 1) {
    const s = ly * TILE_SIZE * 4;
    const d = ((y0 + ly) * width + x0) * 4;
    doc.set(resolved.subarray(s, s + lxEnd * 4), d);
  }
}
