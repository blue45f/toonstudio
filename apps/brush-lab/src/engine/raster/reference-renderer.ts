import { encodeLabImage } from "../core/color";
import { InvalidStateError } from "../core/errors";
import { StrokePipeline } from "../dynamics/stroke-pipeline";
import { buildMipChain, TIP_KINDS_ORDERED } from "../texture/mip-chain";
import { generatePaper } from "../texture/paper-grain";
import { generateTip } from "../texture/tip-generators";
import { impastoLighting, impastoSpecular, impastoSpecularFlat } from "../wet/impasto";
import { compositeWaterLayer } from "../wet/layer-composite";
import { compositeOilLayer, flattenOil, newOilCarry } from "../wet/oil-layer";
import { createWetState, WET_CH } from "../wet/state";
import { bakeWet, stepWet } from "../wet/wet-reference";

import { compositeTile } from "./composite";
import { StrokeLayer } from "./stroke-layer";
import { TILE_PIXELS, TILE_SIZE } from "./tile-binning";

import type { RasterContext } from "./fine-raster";
import type { RasterReceipt } from "./stroke-layer";
import type { DabBatch } from "../core/dab-layout";
import type { LabImage, RawSample, Rgba, TipKind } from "../core/types";
import type { BrushProgram, BrushTipSpec } from "../presets/program-schema";
import type { PaperField, PaperSpec } from "../texture/paper-grain";
import type { TipMask, TipParams } from "../texture/tip-generators";
import type { WetParams } from "../wet/params";
import type { WetState } from "../wet/state";
import type { WetStepReceipt } from "../wet/wet-reference";

/**
 * CPU 참조 표면. 문서(선형 premultiplied f32) + 획 레이어 + 습식 상태.
 * 같은 (program, seed, 배치)면 같은 픽셀이다.
 *
 * 습식 매체의 색은 문서가 아니라 **습식 층**(수채: 부유·침착·고정 안료, 유화: 색·부피 물감)이 들고 있고
 * 표시 시점(`toLabImage`/`toLinear`)에 문서 위에 비파괴로 합성된다. 그래서 같은 매체의 다음 획이 마른 안료를 다시
 * 적시거나(재습윤·백런) 젖은 물감을 밀 수 있다. 다른 매체(건식 획·수채↔유화 전환)가 시작되면 쌓는 순서를 지키려고
 * 습식 층을 먼저 문서에 굽는다(`flattenWet`).
 */
export const TIP_MASK_SIZE = 64;
export const PAPER_FIELD_SIZE = 256;
/** CPU 참조가 프레임당 습식 시뮬레이션에 쓰는 가상 프레임 시간(ms). */
export const WET_FRAME_MS = 1000 / 60;
/** endStroke에서 수채 건조까지 돌리는 최대 프레임 수(결정적 상한). */
export const WET_DRY_STEPS_MAX = 240;
/** endStroke에서 유화 레벨링이 가라앉을 때까지 돌리는 최대 프레임 수. */
export const WET_OIL_SETTLE_FRAMES = 48;
/** 임파스토 릴리프 조명의 고정 광원(문서 좌표, 좌상단에서 비춤). */
export const IMPASTO_LIGHT: readonly [number, number, number] = [-0.5, -0.5, 1];
/** 높이 → 기울기 배율. */
export const IMPASTO_RELIEF_GAIN = 2.5;
/** 릴리프 하이라이트 강도(가산, 평탄면 기준 초과분 × 알파). */
export const IMPASTO_SPECULAR = 0.4;

export interface StrokeReceiptCpu extends RasterReceipt {
  wet: WetStepReceipt | null;
}

export interface SurfaceOptions {
  strokeCapacityTiles?: number;
  wetCapacityTiles?: number;
}

/** `abortStroke`의 결과. */
export interface SurfaceAbortReceipt {
  /** 진행 중인 획이 있었는가. false면 아무것도 하지 않은 no-op이다(멱등). */
  aborted: boolean;
  /** 버린 dab 수(문서에 합성되지 않은 채 사라진 획의 dab). */
  discardedDabs: number;
  /** 문서·습식 층·높이·표시 플래그가 획 시작 시점 상태로 복원됐는가. */
  restored: boolean;
  /** `restored`가 false일 때의 한글 사유. */
  reasonKo?: string;
  /** 저널에서 되돌린 습식 타일 수(코어 + 확장). */
  restoredWetTiles: number;
  /** 매체 전환 획이라 문서 전체를 복사해 두었다가 되돌렸는가. */
  documentCopied: boolean;
}

/**
 * 획 시작 시점의 되돌림 기준점. 문서는 `endStroke`에서만 바뀌므로 보통 복사하지 않고(습식 풀은 `TilePool` 저널이 처음 건드린 타일만
 * 복사한다), 이번 획이 다른 매체의 습식 층을 먼저 문서에 굽는 경우(`flattenWet`)에만 문서 전체를 복사해 둔다.
 */
interface SurfaceCheckpoint {
  waterLayer: boolean;
  oilLayer: boolean;
  hasHeight: boolean;
  layerParams: WetParams | null;
  layerPaper: PaperField | null;
  /** 획 시작 전에 습식 상태 객체가 있었는가(없으면 되돌릴 때 버린다). */
  hadWet: boolean;
  wet: { active: Set<number>; oilTiles: Set<number>; timeMs: number; km: boolean; hadExt: boolean } | null;
  documentCopy: Float32Array | null;
}

const tipCache = new Map<string, TipMask[]>();
const paperCache = new Map<string, PaperField>();

function tipKey(kind: TipKind, seed: number, params: TipParams): string {
  return `${kind}|${seed}|${params.hardness}|${params.aspect}|${params.strands ?? ""}|${params.density ?? ""}|${params.angle ?? ""}|${params.frequency ?? ""}|${params.octaves ?? ""}`;
}

/** 팁 mip 체인(프로세스 캐시, 결정적). */
export function tipChainFor(kind: TipKind, seed: number, params: TipParams): TipMask[] {
  const key = tipKey(kind, seed, params);
  const hit = tipCache.get(key);
  if (hit) return hit;
  const chain = buildMipChain(generateTip(kind, TIP_MASK_SIZE, seed, params));
  tipCache.set(key, chain);
  return chain;
}

/** 종이 필드(프로세스 캐시, 결정적). */
export function paperFor(spec: PaperSpec): PaperField {
  const key = `${spec.seed}|${spec.roughness}|${spec.absorbency}`;
  const hit = paperCache.get(key);
  if (hit) return hit;
  const field = generatePaper(spec, PAPER_FIELD_SIZE);
  paperCache.set(key, field);
  return field;
}

function buildTipChains(tip: BrushTipSpec, dual: BrushTipSpec | null): Record<TipKind, TipMask[]> {
  const chains = {} as Record<TipKind, TipMask[]>;
  for (const kind of TIP_KINDS_ORDERED) {
    const src = kind === tip.kind ? tip : dual && kind === dual.kind ? dual : null;
    chains[kind] = src ? tipChainFor(kind, src.seed, src.params) : tipChainFor(kind, 1, { hardness: 0.8, aspect: 1 });
  }
  return chains;
}

export class Surface {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly document: Float32Array;
  readonly stroke: StrokeLayer;
  wet: WetState | null = null;
  private readonly wetCapacity: number;
  private ctx: RasterContext | null = null;
  private program: BrushProgram | null = null;
  private strokeDabs = 0;
  private overflow = 0;
  private dirtyMax = 0;
  private lastWetReceipt: WetStepReceipt | null = null;
  /** 임파스토 획이 한 번이라도 있었는가(표시 시점 릴리프 조명 적용 여부). */
  private hasHeight = false;
  /** 문서에 아직 굽지 않은 습식 층 종류. */
  private waterLayer = false;
  private oilLayer = false;
  /** 습식 층을 건조·평탄화할 때 쓰는 마지막 습식 획의 파라미터와 종이. */
  private layerParams: WetParams | null = null;
  private layerPaper: PaperField | null = null;
  /** 진행 중인 획의 되돌림 기준점(`beginStroke`~`endStroke`/`abortStroke`). */
  private checkpoint: SurfaceCheckpoint | null = null;
  /** `endStroke`가 문서 합성을 시작했는가. 그 도중에 실패하면 문서를 되돌릴 수 없다. */
  private documentTouched = false;

  constructor(width: number, height: number, opts: SurfaceOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`Surface size must be positive integers, got ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);
    this.document = new Float32Array(width * height * 4);
    const tiles = this.tilesX * this.tilesY;
    this.stroke = new StrokeLayer(width, height, opts.strokeCapacityTiles ?? tiles);
    this.wetCapacity = opts.wetCapacityTiles ?? tiles;
  }

  /** 문서를 단색(선형 premultiplied)으로 채운다. */
  fill(rgba: Rgba): void {
    for (let i = 0; i < this.document.length; i += 4) {
      this.document[i] = rgba[0];
      this.document[i + 1] = rgba[1];
      this.document[i + 2] = rgba[2];
      this.document[i + 3] = rgba[3];
    }
  }

  beginStroke(program: BrushProgram, seed: number): void {
    const model = program.deposition.model;
    const needsWet = program.wet !== null && (model === "wet-flow" || model === "impasto");
    // 쌓는 순서 보존: 습식 층이 있는데 이번 획이 같은 종류의 습식 획이 아니면 먼저 굽는다.
    const kind = needsWet ? (model === "impasto" ? "oil" : "water") : null;
    const willFlatten = (this.waterLayer && kind !== "water") || (this.oilLayer && kind !== "oil");
    // 되돌림 기준점은 어떤 상태도 바꾸기 전(플래튼 포함)에 잡는다.
    this.openCheckpoint(willFlatten);
    if (willFlatten) this.flattenWet();
    if (needsWet && !this.wet) {
      this.wet = createWetState(this.width, this.height, this.wetCapacity);
    }
    this.program = program;
    this.strokeDabs = 0;
    this.overflow = 0;
    this.dirtyMax = 0;
    this.lastWetReceipt = null;
    this.ctx = {
      program,
      tipChain: buildTipChains(program.tip, program.deposition.dual),
      paper: program.paper.enabled ? paperFor(program.paper) : null,
      document: this.document,
      width: this.width,
      height: this.height,
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      seed,
      wet: needsWet ? this.wet : null,
      oilCarry: newOilCarry(),
    };
    if (needsWet && this.wet && program.wet) {
      this.layerParams = program.wet;
      this.layerPaper = this.ctx.paper;
      this.wet.render.km = program.colorDynamics.kmMixing;
      if (kind === "water") this.waterLayer = true;
      else this.oilLayer = true;
    }
  }

  /** 현재 획의 종이 필드(StrokePipeline 마찰·그레인용). */
  paperField(): PaperField | null {
    return this.ctx?.paper ?? null;
  }

  addDabs(batch: DabBatch): RasterReceipt {
    const ctx = this.ctx;
    const program = this.program;
    if (!ctx || !program) throw new InvalidStateError("Surface.addDabs called before beginStroke");
    const receipt = this.stroke.accumulate(batch, ctx);
    this.strokeDabs += receipt.dabCount;
    this.overflow += receipt.overflowDabs;
    this.dirtyMax = Math.max(this.dirtyMax, receipt.dirtyTiles);
    if (ctx.wet && program.wet) {
      if (program.deposition.model === "impasto" && batch.count > 0) this.hasHeight = true;
      this.lastWetReceipt = stepWet(ctx.wet, program.wet, WET_FRAME_MS, ctx.paper);
    }
    return receipt;
  }

  /**
   * 획 끝: document = blend(document, stroke × opacity). 습식은 건조(수채) 또는 레벨링 안정(유화)까지 돌리지만
   * 문서에 굽지는 않는다 — 습식 층은 표시 시점에 합성되고 다음 같은 매체 획과 상호작용한다(`flattenWet`로 굽는다).
   * 임파스토 높이도 문서에 굽지 않고 표시 시점 조명으로만 반영한다(여러 획이 겹쳐도 조명이 중복 적용되지 않는다).
   */
  endStroke(): StrokeReceiptCpu {
    const ctx = this.ctx;
    const program = this.program;
    if (!ctx || !program) throw new InvalidStateError("Surface.endStroke called before beginStroke");
    const poolTilesUsed = this.stroke.pool.used();
    this.documentTouched = true;
    for (const [tile, data] of this.stroke.tiles()) {
      const tx = tile % this.tilesX;
      const ty = Math.floor(tile / this.tilesX);
      compositeTile(this.document, 0, data, program.deposition.opacity, program.deposition.blend, this.width, this.height, tx, ty);
    }
    this.stroke.clear();
    let wetReceipt: WetStepReceipt | null = this.lastWetReceipt;
    if (ctx.wet && program.wet) {
      wetReceipt = this.settleWet(ctx.wet, program.wet, ctx.paper) ?? wetReceipt;
    }
    const receipt: StrokeReceiptCpu = {
      dabCount: this.strokeDabs,
      dirtyTiles: this.dirtyMax,
      overflowDabs: this.overflow,
      poolTilesUsed,
      wet: wetReceipt,
    };
    this.ctx = null;
    this.program = null;
    this.closeCheckpoint();
    return receipt;
  }

  /**
   * 진행 중인 획을 **문서에 합성하지 않고 버리고**, 문서·습식 층(수채 안료·유화 물감)·높이·표시 플래그를 `beginStroke` 직전 상태로
   * 되돌린다. 획 레이어는 비우고, 습식 풀은 저널(타일 단위 copy-on-write: 획 도중 처음 건드린 타일만 복사해 둔 것)로 복원한다.
   * 문서는 `endStroke`에서만 바뀌므로 복사하지 않는다(다른 매체의 습식 층을 먼저 굽는 획만 문서 전체를 복사해 둔다).
   * 획이 없으면 no-op(멱등). `endStroke`가 문서 합성 도중 실패했다면 문서의 일부가 이미 바뀌었으므로 `restored: false`와 사유를 돌려준다.
   */
  abortStroke(): SurfaceAbortReceipt {
    const cp = this.checkpoint;
    if (!cp) {
      return { aborted: false, discardedDabs: 0, restored: true, restoredWetTiles: 0, documentCopied: false };
    }
    const discardedDabs = this.strokeDabs;
    const documentTouched = this.documentTouched;
    this.stroke.clear();
    let restoredWetTiles = 0;
    const wet = this.wet;
    if (!cp.hadWet) {
      // 이 획이 처음 만든 습식 상태는 통째로 버린다.
      this.wet = null;
    } else if (wet && cp.wet) {
      restoredWetTiles += wet.pool.rollbackJournal();
      const ext = wet.ext;
      if (ext) {
        // 확장 풀이 이 획에서 처음 만들어졌다면(기준점에 없었다면) 전부 이 획의 내용이므로 비운다.
        if (cp.wet.hadExt) restoredWetTiles += ext.rollbackJournal();
        else ext.clear();
      }
      wet.active.clear();
      for (const tile of cp.wet.active) wet.active.add(tile);
      wet.oilTiles.clear();
      for (const tile of cp.wet.oilTiles) wet.oilTiles.add(tile);
      wet.timeMs = cp.wet.timeMs;
      wet.render.km = cp.wet.km;
    }
    const documentCopied = cp.documentCopy !== null;
    if (cp.documentCopy) this.document.set(cp.documentCopy);
    this.waterLayer = cp.waterLayer;
    this.oilLayer = cp.oilLayer;
    this.hasHeight = cp.hasHeight;
    this.layerParams = cp.layerParams;
    this.layerPaper = cp.layerPaper;
    this.ctx = null;
    this.program = null;
    this.strokeDabs = 0;
    this.overflow = 0;
    this.dirtyMax = 0;
    this.lastWetReceipt = null;
    this.checkpoint = null;
    this.documentTouched = false;
    const receipt: SurfaceAbortReceipt = { aborted: true, discardedDabs, restored: !documentTouched || documentCopied, restoredWetTiles, documentCopied };
    if (!receipt.restored) {
      receipt.reasonKo = "endStroke가 문서 합성 도중 실패해 문서 일부가 이미 바뀌었다(획 레이어와 습식 층만 되돌렸다)";
    }
    return receipt;
  }

  /** 되돌림 기준점을 연다. 확정되지 않은 이전 기준점은 버린다. */
  private openCheckpoint(copyDocument: boolean): void {
    this.closeCheckpoint();
    const wet = this.wet;
    this.checkpoint = {
      waterLayer: this.waterLayer,
      oilLayer: this.oilLayer,
      hasHeight: this.hasHeight,
      layerParams: this.layerParams,
      layerPaper: this.layerPaper,
      hadWet: wet !== null,
      wet: wet
        ? { active: new Set(wet.active), oilTiles: new Set(wet.oilTiles), timeMs: wet.timeMs, km: wet.render.km, hadExt: wet.ext !== null }
        : null,
      documentCopy: copyDocument ? new Float32Array(this.document) : null,
    };
    this.documentTouched = false;
    if (wet) {
      wet.pool.beginJournal();
      wet.ext?.beginJournal();
    }
  }

  /** 기준점을 확정한다(복사본을 버린다). */
  private closeCheckpoint(): void {
    const wet = this.wet;
    if (wet) {
      wet.pool.commitJournal();
      wet.ext?.commitJournal();
    }
    this.checkpoint = null;
    this.documentTouched = false;
  }

  /** 활성 타일이 없어질 때까지(상한 프레임) 습식을 전진한다. 마지막 영수증을 돌려준다. */
  private settleWet(wet: WetState, params: WetParams, paper: PaperField | null): WetStepReceipt | null {
    const frames = params.medium === "oil" ? WET_OIL_SETTLE_FRAMES : WET_DRY_STEPS_MAX;
    let receipt: WetStepReceipt | null = null;
    for (let i = 0; i < frames; i += 1) {
      receipt = stepWet(wet, params, WET_FRAME_MS, paper);
      if (receipt.activeTiles === 0) break;
    }
    return receipt;
  }

  /**
   * 습식 층을 문서에 굽는다: 수채는 건조까지 돌린 뒤 안료를 굽고, 유화는 색을 굽고 부피를 마른 릴리프로 굳힌다
   * (릴리프 조명은 높이가 남아 계속 적용된다). 다른 매체 획이 시작될 때 자동으로 불리며 앱이 직접 불러도 된다.
   */
  flattenWet(): void {
    const wet = this.wet;
    if (!wet) return;
    if (this.waterLayer) {
      if (this.layerParams && this.layerParams.medium !== "oil") this.settleWet(wet, this.layerParams, this.layerPaper);
      bakeWet(wet, this.document, this.width, { km: wet.render.km });
      this.waterLayer = false;
    }
    if (this.oilLayer) {
      flattenOil(wet, this.document, this.width);
      this.oilLayer = false;
    }
  }

  /**
   * 표시용 문서: 습식 층(수채 안료·유화 물감)을 합성하고 임파스토 높이가 있으면 릴리프 조명(베타)을 적용한 복사본,
   * 습식 층도 높이도 없으면 원본 참조.
   * - 램버트 배율: 평탄한 곳 1, 능선은 밝고 골은 어둡다(최대 1.5배)
   * - Blinn-Phong 하이라이트(가산): IMPASTO_SPECULAR·max(0, spec − spec_flat)·alpha — 검은 물감의 능선에도 광택
   * 결과는 premultiplied 불변식(rgb ≤ alpha)을 지키도록 채널별로 [0, alpha]에 클램프한다.
   * GPU `impasto_factor`/`impasto_specular`(common.wgsl)가 같은 식을 미러한다.
   */
  private displayDocument(): Float32Array {
    const wet = this.wet;
    if (!wet || (!this.waterLayer && !this.oilLayer && !this.hasHeight)) return this.document;
    const doc = new Float32Array(this.document);
    if (this.waterLayer) compositeWaterLayer(wet, doc, this.width, { km: wet.render.km });
    if (this.oilLayer) compositeOilLayer(wet, doc, this.width);
    if (!this.hasHeight) return doc;
    const height = this.heightMap(wet);
    const lit = impastoLighting(height, this.width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
    const spec = impastoSpecular(height, this.width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
    const specFlat = impastoSpecularFlat(IMPASTO_LIGHT);
    const ll = Math.hypot(IMPASTO_LIGHT[0], IMPASTO_LIGHT[1], IMPASTO_LIGHT[2]);
    const flat = IMPASTO_LIGHT[2] / ll;
    for (let i = 0; i < height.length; i += 1) {
      if ((height[i] ?? 0) <= 0) continue;
      const factor = Math.fround(Math.min(1.5, (lit[i] ?? flat) / flat));
      const o = i * 4;
      const alpha = doc[o + 3] ?? 0;
      const highlight = Math.fround(IMPASTO_SPECULAR * Math.max(0, (spec[i] ?? specFlat) - specFlat) * alpha);
      for (let c = 0; c < 3; c += 1) {
        const v = Math.fround((doc[o + c] ?? 0) * factor + highlight);
        doc[o + c] = v < 0 ? 0 : v > alpha ? alpha : v;
      }
    }
    return doc;
  }

  /** 습식 풀의 height 채널을 문서 크기 배열로 모은다(미할당 타일은 0). */
  heightMap(wet: WetState): Float32Array {
    const out = new Float32Array(this.width * this.height);
    for (const [tile, slot] of wet.pool.entries()) {
      const data = wet.pool.peek(slot);
      const tx = tile % this.tilesX;
      const ty = Math.floor(tile / this.tilesX);
      for (let ly = 0; ly < TILE_SIZE; ly += 1) {
        const py = ty * TILE_SIZE + ly;
        if (py >= this.height) continue;
        for (let lx = 0; lx < TILE_SIZE; lx += 1) {
          const px = tx * TILE_SIZE + lx;
          if (px >= this.width) continue;
          out[py * this.width + px] = data[WET_CH.height * TILE_PIXELS + ly * TILE_SIZE + lx] ?? 0;
        }
      }
    }
    return out;
  }

  /** sRGB straight RGBA8(임파스토 조명 포함). */
  toLabImage(): LabImage {
    return encodeLabImage(this.displayDocument(), this.width, this.height);
  }

  /** 선형 premultiplied 복사본(임파스토 조명 포함). */
  toLinear(): Float32Array {
    const doc = this.displayDocument();
    return doc === this.document ? new Float32Array(doc) : doc;
  }
}

export interface RenderStrokeOptions {
  width: number;
  height: number;
  seed: number;
  /** 프레임 분할 간격(ms). 기본 16.67. */
  frameMs?: number;
  color?: Rgba;
  /** 문서 초기 채움(선형 premultiplied). */
  background?: Rgba;
  surface?: Surface;
}

export interface RenderStrokeResult {
  image: LabImage;
  linear: Float32Array;
  receipt: StrokeReceiptCpu;
  frames: number;
  dabs: number;
}

/** tMs 경계로 프레임 배치를 나눈다(bench replay와 같은 규칙: 프레임 창 [k·frameMs, (k+1)·frameMs)). */
export function splitFrames(samples: readonly RawSample[], frameMs = WET_FRAME_MS): RawSample[][] {
  if (samples.length === 0) return [];
  const t0 = samples[0]?.tMs ?? 0;
  const frames: RawSample[][] = [];
  let current: RawSample[] = [];
  let frameIndex = 0;
  for (const s of samples) {
    const k = Math.floor((s.tMs - t0) / frameMs);
    while (k > frameIndex && current.length > 0) {
      frames.push(current);
      current = [];
      frameIndex += 1;
    }
    frameIndex = Math.max(frameIndex, k);
    current.push(s);
  }
  if (current.length > 0) frames.push(current);
  return frames;
}

/** 획 1개를 CPU 참조로 렌더한다(테스트·레인·갤러리 공용). */
export function renderStroke(program: BrushProgram, samples: readonly RawSample[], opts: RenderStrokeOptions): RenderStrokeResult {
  const surface = opts.surface ?? new Surface(opts.width, opts.height);
  if (opts.background && !opts.surface) surface.fill(opts.background);
  surface.beginStroke(program, opts.seed);
  const pipeline = new StrokePipeline(program, opts.seed, undefined, surface.paperField(), { color: opts.color });
  const frames = splitFrames(samples, opts.frameMs ?? WET_FRAME_MS);
  let dabs = 0;
  for (const frame of frames) {
    const batch = pipeline.push(frame);
    dabs += batch.count;
    surface.addDabs(batch);
  }
  const tail = pipeline.finish();
  dabs += tail.count;
  surface.addDabs(tail);
  const receipt = surface.endStroke();
  return { image: surface.toLabImage(), linear: surface.toLinear(), receipt, frames: frames.length, dabs };
}

/** 썸네일 배경: 지우개·smudge 가족은 빈 문서에서 아무것도 보이지 않으므로 그라데이션 위에 그린다. */
export function thumbnailBackground(program: BrushProgram, width: number, height: number): Surface {
  const surface = new Surface(width, height);
  if (program.family === "eraser" || program.family === "smudge") {
    const doc = surface.document;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        const t = x / Math.max(1, width - 1);
        const band = Math.floor((y / Math.max(1, height)) * 4) % 2 === 0 ? 0.8 : 0.35;
        doc[o] = t * band;
        doc[o + 1] = 0.5 * band;
        doc[o + 2] = (1 - t) * band;
        doc[o + 3] = 1;
      }
    }
  }
  return surface;
}

/** 프리셋 썸네일(갤러리·카탈로그 다양성 테스트 공용). */
export function renderPresetThumbnail(program: BrushProgram, samples: readonly RawSample[], size: number, seed = 1): RenderStrokeResult {
  const surface = thumbnailBackground(program, size, size);
  return renderStroke(program, samples, { width: size, height: size, seed, surface });
}
