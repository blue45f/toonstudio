/**
 * 레이어 PSD 계획(순수): 캡처 결과 → 레이어 트리(bottom→top). ag-psd 조립은 psd-assemble.ts가 한다.
 *
 * 레이어 순서(bottom→top)
 *   [참조](숨김 그룹)      참조/깊이, 참조/법선            (includeReferencePasses)
 *   [부위 ID 마스크](숨김 그룹) <부위 한글명>…           (includeIdMasks, part-id 패스 필요)
 *   밑색                   flat, normal
 *   음영                   tone-split shade, multiply
 *   하이라이트             tone-split highlight, screen
 *   [페인트](숨김 그룹)    페인트/<부위> (UV 공간)         (칠한 픽셀이 있는 레이어만)
 *   주선                   line-extract, normal
 * 합성(root imageData)은 lit 패스다. 밑색×음영→screen 하이라이트는 불투명 영역에서 lit와 MAE ≤ 2/255로 재합성된다.
 */
import { PART_ROLES, PART_ROLE_LABELS_KO, failVisible } from "../contracts";

import { extractLineArt, extractOutlinePassLuminanceToAlpha, lineArtToRaster } from "./line-extract";
import { decodeIdPass } from "./raster-convert";
import { multiplyByte, opaqueMae, recompose, screenByte, splitTones } from "./tone-split";

import type { CaptureResult, CapturedDepth, CapturedRaster, LabFailure, PaintLayer, PartRole } from "../contracts";
import type { LineArtOptions } from "./line-extract";

export type PsdBlendMode = "normal" | "multiply" | "screen";

export interface PsdRasterLayerPlan {
  readonly kind: "raster";
  readonly name: string;
  readonly blendMode: PsdBlendMode;
  /** 0..1 */
  readonly opacity: number;
  readonly hidden: boolean;
  readonly raster: CapturedRaster;
  /** 직전 비클리핑 밑색의 알파를 보존하는 PSD clipping layer다. */
  readonly clipping?: boolean;
}

export interface PsdGroupPlan {
  readonly kind: "group";
  readonly name: string;
  readonly hidden: boolean;
  readonly opened: boolean;
  readonly children: readonly PsdLayerPlan[];
}

export type PsdLayerPlan = PsdRasterLayerPlan | PsdGroupPlan;

export interface PsdPlanReceipt {
  readonly width: number;
  readonly height: number;
  /** 래스터 레이어 수(그룹 제외) */
  readonly layerCount: number;
  readonly groupCount: number;
  /** 모든 레이어 이름(bottom→top, 그룹 자식은 "그룹/이름") */
  readonly names: readonly string[];
  /** 건너뛴 레이어와 한글 사유 */
  readonly skippedKo: readonly string[];
  readonly lineArtPixels: number;
  /** 밑색·음영·하이라이트 재합성 vs lit 불투명 MAE(0..255) */
  readonly recomposeMae: number;
}

export interface PsdPlan {
  readonly width: number;
  readonly height: number;
  readonly composite: CapturedRaster;
  /** bottom→top */
  readonly layers: readonly PsdLayerPlan[];
  readonly receipt: PsdPlanReceipt;
}

export interface PsdPlanOptions {
  readonly includeIdMasks: boolean;
  readonly includeReferencePasses: boolean;
  readonly lineArt?: Partial<LineArtOptions>;
  /**
   * SHAPER ExportManager::createHairLayer(0x0600018a) 호환 옵션:
   * true이고 part-id 패스에 헤어(hair / hair-accessory) 픽셀이 있으면
   * 본체 레이어에서 해당 픽셀을 제거하고 "헤어 분리" 그룹으로 옮긴다.
   * 헤어 하이라이트는 밑색에 보존하고 음영·주선은 밑색 알파에 클리핑한다.
   */
  readonly splitHairLayers?: boolean;
}

export type PlanPsdResult = { readonly ok: true; readonly plan: PsdPlan } | { readonly ok: false; readonly failure: LabFailure };

export const PSD_MAX_DIMENSION = 2048;

export const PSD_LAYER_NAMES = Object.freeze({
  reference: "참조",
  referenceDepth: "깊이",
  referenceNormal: "법선",
  idMasks: "부위 ID 마스크",
  flat: "밑색",
  shade: "음영",
  highlight: "하이라이트",
  paint: "페인트",
  line: "주선",
  hairGroup: "헤어 분리",
  hairFlat: "헤어 밑색",
  hairShade: "헤어 음영",
  hairLine: "헤어 주선",
});

function raster(name: string, blendMode: PsdBlendMode, data: CapturedRaster, hidden = false, opacity = 1): PsdRasterLayerPlan {
  return { kind: "raster", name, blendMode, opacity, hidden, raster: data };
}

function group(name: string, hidden: boolean, children: readonly PsdLayerPlan[]): PsdGroupPlan {
  return { kind: "group", name, hidden, opened: !hidden, children };
}

function hsvToRgb(h: number, s: number, v: number): readonly [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6] ?? [v, t, p];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * 부위별 결정적 마스크 색(황금각 간격 HSV). 색은 `PART_ROLES` 인덱스로만 정해지므로 역할은 배열 **끝에만** 더해야 기존 색이 안 바뀐다
 * (키트 v1의 `underwear`가 그렇게 추가됐고 골든은 psd-plan.test.ts가 고정한다).
 */
export function idMaskColor(role: PartRole): readonly [number, number, number] {
  const index = Math.max(0, PART_ROLES.indexOf(role));
  return hsvToRgb((index * 0.381966) % 1, 0.65, 0.95);
}

/** partId 픽셀 → 부위별 단색 마스크 래스터(alpha 255/0) */
export function buildIdMaskLayers(partIds: Uint16Array, width: number, height: number, palette: CaptureResult["partIdPalette"]): PsdRasterLayerPlan[] {
  const byRole = new Map<PartRole, Set<number>>();
  for (const [key, entry] of Object.entries(palette)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    const ids = byRole.get(entry.role) ?? new Set<number>();
    ids.add(id);
    byRole.set(entry.role, ids);
  }
  const layers: PsdRasterLayerPlan[] = [];
  for (const role of PART_ROLES) {
    const ids = byRole.get(role);
    if (!ids) continue;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const color = idMaskColor(role);
    let count = 0;
    for (let p = 0; p < partIds.length; p += 1) {
      if (!ids.has(partIds[p] ?? 0)) continue;
      const i = p * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
      count += 1;
    }
    if (count === 0) continue;
    layers.push(raster(PART_ROLE_LABELS_KO[role], "normal", { width, height, rgba }));
  }
  return layers;
}

/** 깊이 → 회색 래스터(가까울수록 밝음), lit alpha>0인 픽셀만 불투명 */
export function depthToRaster(depth: CapturedDepth, lit: CapturedRaster): CapturedRaster {
  const rgba = new Uint8ClampedArray(depth.width * depth.height * 4);
  for (let p = 0; p < depth.depth.length; p += 1) {
    const i = p * 4;
    if ((lit.rgba[i + 3] ?? 0) === 0) continue;
    const value = Math.round((1 - Math.min(1, Math.max(0, depth.depth[p] ?? 0))) * 255);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
    rgba[i + 3] = 255;
  }
  return { width: depth.width, height: depth.height, rgba };
}

/** 정수 배율 박스 다운샘플(premultiplied 평균 후 straight 복원) */
export function downsampleRaster(source: CapturedRaster, factor: number): CapturedRaster {
  if (factor <= 1) return source;
  const width = Math.max(1, Math.floor(source.width / factor));
  const height = Math.max(1, Math.floor(source.height / factor));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = ((y * factor + sy) * source.width + x * factor + sx) * 4;
          const alpha = source.rgba[i + 3] ?? 0;
          r += (source.rgba[i] ?? 0) * alpha;
          g += (source.rgba[i + 1] ?? 0) * alpha;
          b += (source.rgba[i + 2] ?? 0) * alpha;
          a += alpha;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
        rgba[o + 3] = Math.round(a / (factor * factor));
      }
    }
  }
  return { width, height, rgba };
}

function hasPaint(layer: PaintLayer): boolean {
  for (let i = 3; i < layer.rgba.length; i += 4) if ((layer.rgba[i] ?? 0) !== 0) return true;
  return false;
}

function collectHairPartIds(palette: CaptureResult["partIdPalette"]): ReadonlySet<number> {
  const hairIds = new Set<number>();
  for (const [key, entry] of Object.entries(palette)) {
    const id = Number(key);
    if (Number.isInteger(id) && id > 0 && (entry.role === "hair" || entry.role === "hair-accessory")) {
      hairIds.add(id);
    }
  }
  return hairIds;
}

function filterRasterByPartIdSet(source: CapturedRaster, partIds: Uint16Array, allowedIds: ReadonlySet<number>): { readonly raster: CapturedRaster; readonly pixelCount: number } {
  const rgba = new Uint8ClampedArray(source.rgba.length);
  let pixelCount = 0;
  for (let p = 0; p < partIds.length; p += 1) {
    if (!allowedIds.has(partIds[p] ?? 0)) continue;
    const i = p * 4;
    const a = source.rgba[i + 3] ?? 0;
    if (a === 0) continue;
    rgba[i] = source.rgba[i] ?? 0;
    rgba[i + 1] = source.rgba[i + 1] ?? 0;
    rgba[i + 2] = source.rgba[i + 2] ?? 0;
    rgba[i + 3] = a;
    pixelCount += 1;
  }
  return { raster: { width: source.width, height: source.height, rgba }, pixelCount };
}

/** 헤어 그룹을 숨겼을 때 본체에 색·선이 남지 않도록 해당 픽셀의 RGBA를 모두 비운다. */
function withoutPartIds(source: CapturedRaster, partIds: Uint16Array, removedIds: ReadonlySet<number>): CapturedRaster {
  const rgba = new Uint8ClampedArray(source.rgba);
  for (let p = 0; p < partIds.length; p += 1) {
    if (removedIds.has(partIds[p] ?? 0)) rgba.fill(0, p * 4, p * 4 + 4);
  }
  return { width: source.width, height: source.height, rgba };
}

/** 3레이어 형식을 유지하면서 screen 하이라이트를 헤어 밑색으로 옮긴다. */
function hairBaseWithHighlights(flat: CapturedRaster, highlight: CapturedRaster): CapturedRaster {
  const rgba = new Uint8ClampedArray(flat.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) === 0) continue;
    // splitTones는 채널마다 음영 또는 하이라이트 하나만 사용하므로 순서를 바꿔도 재합성이 같다.
    for (let c = 0; c < 3; c += 1) rgba[i + c] = screenByte(rgba[i + c] ?? 0, highlight.rgba[i + c] ?? 0);
  }
  return { width: flat.width, height: flat.height, rgba };
}

export function planCharacterPsd(capture: CaptureResult, paintLayers: readonly PaintLayer[], options: PsdPlanOptions, now?: number): PlanPsdResult {
  const { width, height } = capture;
  if (width > PSD_MAX_DIMENSION || height > PSD_MAX_DIMENSION) {
    return { ok: false, failure: failVisible("psd-too-large", `PSD 크기 ${width}×${height}가 상한 ${PSD_MAX_DIMENSION}px를 넘습니다.`, undefined, now) };
  }
  const lit = capture.passes.lit;
  const flat = capture.passes.flat;
  if (!lit || !flat) {
    return { ok: false, failure: failVisible("psd-missing-pass", "PSD 조립에는 flat(밑색)·lit(조명) 패스가 모두 필요합니다.", undefined, now) };
  }
  for (const [name, pass] of Object.entries(capture.passes)) {
    if (pass && (pass.width !== width || pass.height !== height)) {
      return { ok: false, failure: failVisible("psd-pass-size", `${name} 패스 크기(${pass.width}×${pass.height})가 캡처 크기(${width}×${height})와 다릅니다.`, undefined, now) };
    }
  }
  const skippedKo: string[] = [];
  const layers: PsdLayerPlan[] = [];

  if (options.includeReferencePasses) {
    const children: PsdLayerPlan[] = [];
    if (capture.depth) children.push(raster(PSD_LAYER_NAMES.referenceDepth, "normal", depthToRaster(capture.depth, lit), true));
    else skippedKo.push("참조/깊이: depth 패스가 없습니다.");
    if (capture.passes.normal) children.push(raster(PSD_LAYER_NAMES.referenceNormal, "normal", capture.passes.normal, true));
    else skippedKo.push("참조/법선: normal 패스가 없습니다.");
    if (children.length > 0) layers.push(group(PSD_LAYER_NAMES.reference, true, children));
  }

  let partIds: Uint16Array | null = null;
  const idPass = capture.passes["part-id"];
  if (idPass) partIds = decodeIdPass(idPass.rgba, width, height);
  if (options.includeIdMasks) {
    if (!partIds) skippedKo.push("부위 ID 마스크: part-id 패스가 없습니다.");
    else {
      const masks = buildIdMaskLayers(partIds, width, height, capture.partIdPalette);
      if (masks.length === 0) skippedKo.push("부위 ID 마스크: 팔레트에 해당하는 부위 픽셀이 없습니다.");
      else layers.push(group(PSD_LAYER_NAMES.idMasks, true, masks));
    }
  }

  const tones = splitTones(flat, lit);
  let hairIds: ReadonlySet<number> | null = null;
  let hairFlat: CapturedRaster | null = null;
  if (options.splitHairLayers) {
    if (!partIds) skippedKo.push("헤어 분리: part-id 패스가 없습니다.");
    else {
      const ids = collectHairPartIds(capture.partIdPalette);
      const filtered = filterRasterByPartIdSet(flat, partIds, ids);
      if (filtered.pixelCount === 0) skippedKo.push("헤어 분리: 헤어 부위 픽셀이 없습니다.");
      else {
        hairIds = ids;
        hairFlat = filtered.raster;
      }
    }
  }
  const bodyRaster = (source: CapturedRaster): CapturedRaster => partIds && hairIds ? withoutPartIds(source, partIds, hairIds) : source;
  const bodyFlat = bodyRaster(flat);
  const bodyShade = bodyRaster(tones.shade);
  const bodyHighlight = bodyRaster(tones.highlight);
  const recomposed = recompose(bodyFlat, bodyShade, bodyHighlight);
  layers.push(raster(PSD_LAYER_NAMES.flat, "normal", bodyFlat));
  layers.push(raster(PSD_LAYER_NAMES.shade, "multiply", bodyShade));
  layers.push(raster(PSD_LAYER_NAMES.highlight, "screen", bodyHighlight));

  const paintChildren: PsdLayerPlan[] = [];
  for (const layer of paintLayers) {
    if (!hasPaint(layer)) {
      skippedKo.push(`페인트/${PART_ROLE_LABELS_KO[layer.part]}: 칠한 픽셀이 없습니다.`);
      continue;
    }
    const factor = Math.max(1, Math.ceil(Math.max(layer.width / width, layer.height / height)));
    const data = downsampleRaster({ width: layer.width, height: layer.height, rgba: layer.rgba }, factor);
    paintChildren.push(raster(`${PART_ROLE_LABELS_KO[layer.part]} (UV 공간${factor > 1 ? ` 1/${factor}` : ""})`, "normal", data, true));
  }
  if (paintChildren.length > 0) layers.push(group(PSD_LAYER_NAMES.paint, true, paintChildren));

  const lineInput = {
    lit,
    width,
    height,
    ...(capture.depth ? { depth: capture.depth } : {}),
    ...(capture.passes.normal ? { normal: capture.passes.normal } : {}),
    ...(partIds ? { partId: partIds } : {}),
    ...(idPass ? { idPass } : {}),
  };
  let lineArtPixels = 0;
  let fullLineRaster: CapturedRaster;
  if (options.lineArt?.useLuminanceToAlpha) {
    fullLineRaster = extractOutlinePassLuminanceToAlpha(lit);
    for (let i = 3; i < fullLineRaster.rgba.length; i += 4) {
      if ((fullLineRaster.rgba[i] ?? 0) > 0) lineArtPixels += 1;
    }
  } else {
    const lineMask = extractLineArt(lineInput, options.lineArt ?? {});
    for (let p = 0; p < lineMask.length; p += 1) if ((lineMask[p] ?? 0) > 0) lineArtPixels += 1;
    fullLineRaster = lineArtToRaster(lineMask, width, height);
  }
  layers.push(raster(PSD_LAYER_NAMES.line, "normal", bodyRaster(fullLineRaster)));

  if (partIds && hairIds && hairFlat) {
    const hairBase = hairBaseWithHighlights(hairFlat, tones.highlight);
    const hairShade = filterRasterByPartIdSet(tones.shade, partIds, hairIds).raster;
    const hairLine = filterRasterByPartIdSet(fullLineRaster, partIds, hairIds).raster;
    layers.push(
      group(PSD_LAYER_NAMES.hairGroup, false, [
        raster(PSD_LAYER_NAMES.hairFlat, "normal", hairBase),
        { ...raster(PSD_LAYER_NAMES.hairShade, "multiply", hairShade), clipping: true },
        { ...raster(PSD_LAYER_NAMES.hairLine, "normal", hairLine), clipping: true },
      ]),
    );
    // 영수증도 실제 분리한 색 레이어로 재합성한다(추출 주선은 기존과 같이 MAE 대상에서 제외).
    for (let i = 0; i < hairBase.rgba.length; i += 4) {
      if ((hairBase.rgba[i + 3] ?? 0) === 0) continue;
      for (let c = 0; c < 3; c += 1) recomposed.rgba[i + c] = multiplyByte(hairBase.rgba[i + c] ?? 0, hairShade.rgba[i + c] ?? 0);
      recomposed.rgba[i + 3] = hairBase.rgba[i + 3] ?? 0;
    }
  }
  const recomposeMae = opaqueMae(recomposed, lit);

  const names: string[] = [];
  let layerCount = 0;
  let groupCount = 0;
  const walk = (items: readonly PsdLayerPlan[], prefix: string): void => {
    for (const item of items) {
      if (item.kind === "group") {
        groupCount += 1;
        names.push(`${prefix}${item.name}`);
        walk(item.children, `${prefix}${item.name}/`);
      } else {
        layerCount += 1;
        names.push(`${prefix}${item.name}`);
      }
    }
  };
  walk(layers, "");

  return {
    ok: true,
    plan: {
      width,
      height,
      composite: lit,
      layers,
      receipt: { width, height, layerCount, groupCount, names, skippedKo, lineArtPixels, recomposeMae },
    },
  };
}
