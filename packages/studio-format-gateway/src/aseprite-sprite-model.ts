/**
 * @file aseprite-sprite-model.ts
 * @description 가져온 Aseprite 스프라이트를 해석하는 순수 함수: 레이어 트리, 셀 검증, 사용자 데이터 귀속, 팔레트 시점,
 *              링크 셀 해석, 셀 그리기 순서.
 *
 * 출처와 이용 조건은 `aseprite-sprite-cursor.ts` 머리말과 같다(필드 크기·상수만 자체 표현으로 옮겼다).
 */

import type { AsepriteRgba, AsepriteUserDataChunk } from "./aseprite-sprite-chunks";
import type {
  AsepriteSpriteCel,
  AsepriteSpriteImportResult,
  AsepriteSpriteLayer,
  AsepriteSpriteLayerFlags,
  AsepriteSpriteSlice,
  AsepriteSpriteTag,
  AsepriteSpriteTileset,
} from "./aseprite-sprite-types";
import type { FormatIssue } from "./format-common";

export const BLEND_MODE_NAMES: readonly string[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "addition",
  "subtract",
  "divide",
];

export function issue(scope: FormatIssue["scope"], code: string, message: string, path?: string): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

/** `frameIndex` 시점(그 프레임 포함)까지의 팔레트 청크를 적용한 팔레트. 새 팔레트가 하나라도 있으면 구 팔레트는 무시한다. */
export function asepritePaletteAtFrame(
  result: Pick<AsepriteSpriteImportResult, "paletteUpdates" | "header">,
  frameIndex: number,
): AsepriteRgba[] {
  const hasNew = result.paletteUpdates.some((u) => u.source === "new");
  const palette: AsepriteRgba[] = [];
  const fallback: AsepriteRgba = { r: 0, g: 0, b: 0, a: 255 };
  for (const update of result.paletteUpdates) {
    if (update.frameIndex > frameIndex) break;
    if (hasNew && update.source !== "new") continue;
    if (update.declaredSize !== null) {
      palette.length = Math.min(palette.length, update.declaredSize);
      while (palette.length < update.declaredSize) palette.push(fallback);
    }
    for (const entry of update.entries) {
      while (palette.length < entry.index) palette.push(fallback);
      palette[entry.index] = { r: entry.r, g: entry.g, b: entry.b, a: entry.a };
    }
  }
  return palette;
}

/** 셀 배열마다 한 번만 만드는 (프레임, 레이어) → 셀 색인. 같은 자리에 셀이 둘이면 먼저 나온 것을 쓴다. */
const celIndexCache = new WeakMap<readonly AsepriteSpriteCel[], Map<string, AsepriteSpriteCel>>();

function celIndexOf(cels: readonly AsepriteSpriteCel[]): Map<string, AsepriteSpriteCel> {
  let index = celIndexCache.get(cels);
  if (index === undefined) {
    index = new Map();
    for (const cel of cels) {
      const key = `${cel.frameIndex}:${cel.layerIndex}`;
      if (!index.has(key)) index.set(key, cel);
    }
    celIndexCache.set(cels, index);
  }
  return index;
}

/** 링크 셀이 가리키는 실제 셀. 링크가 아니면 자기 자신, 해석할 수 없으면 null. */
export function resolveAsepriteLinkedCel(
  result: Pick<AsepriteSpriteImportResult, "cels">,
  cel: AsepriteSpriteCel,
): AsepriteSpriteCel | null {
  let current = cel;
  for (let hops = 0; hops < 64; hops += 1) {
    if (current.kind !== "linked") return current;
    const frame = current.linkedFrame;
    const layerIndex = current.layerIndex;
    if (frame === null || frame >= current.frameIndex) return null;
    const next = celIndexOf(result.cels).get(`${frame}:${layerIndex}`);
    if (next === undefined) return null;
    current = next;
  }
  return null;
}

/** 한 프레임의 셀을 그리는 순서(뒤에서 앞으로)로 정렬한다: `layerIndex + zIndex`, 같으면 `zIndex`가 작은 쪽이 먼저. */
export function orderAsepriteFrameCels(cels: readonly AsepriteSpriteCel[]): AsepriteSpriteCel[] {
  return [...cels].sort((a, b) => {
    const order = a.layerIndex + a.zIndex - (b.layerIndex + b.zIndex);
    return order !== 0 ? order : a.zIndex - b.zIndex;
  });
}

export type Attach =
  | { readonly kind: "layer"; readonly layer: AsepriteSpriteLayer }
  | { readonly kind: "cel"; readonly cel: AsepriteSpriteCel }
  | { readonly kind: "tags"; readonly tags: AsepriteSpriteTag[]; next: number }
  | { readonly kind: "tileset"; readonly tileset: AsepriteSpriteTileset; taken: number }
  | { readonly kind: "slice"; readonly slice: AsepriteSpriteSlice }
  | { readonly kind: "sprite" }
  | null;

export function layerFlags(flags: number): AsepriteSpriteLayerFlags {
  return {
    visible: (flags & 1) !== 0,
    editable: (flags & 2) !== 0,
    lockMovement: (flags & 4) !== 0,
    background: (flags & 8) !== 0,
    preferLinkedCels: (flags & 16) !== 0,
    collapsed: (flags & 32) !== 0,
    reference: (flags & 64) !== 0,
  };
}

export function attachUserData(attach: Attach, chunk: AsepriteUserDataChunk, orphan: (message: string) => void): Attach {
  if (attach === null) {
    orphan("사용자 데이터 청크가 붙을 대상(레이어·셀·태그·타일셋·슬라이스·스프라이트)이 없다");
    return null;
  }
  switch (attach.kind) {
    case "layer":
      if (attach.layer.userData === null) attach.layer.userData = chunk;
      else orphan(`레이어 "${attach.layer.name}"에 사용자 데이터가 이미 있다`);
      return null;
    case "cel":
      if (attach.cel.userData === null) attach.cel.userData = chunk;
      else orphan("셀에 사용자 데이터가 이미 있다");
      return null;
    case "slice":
      if (attach.slice.userData === null) attach.slice.userData = chunk;
      else orphan(`슬라이스 "${attach.slice.name}"에 사용자 데이터가 이미 있다`);
      return null;
    case "tags": {
      const tag = attach.tags[attach.next];
      if (tag === undefined) {
        orphan("태그 수보다 많은 사용자 데이터가 이어졌다");
        return null;
      }
      tag.userData = chunk;
      attach.next += 1;
      return attach.next >= attach.tags.length ? null : attach;
    }
    case "tileset":
      if (attach.taken === 0) attach.tileset.userData = chunk;
      else if (attach.taken <= attach.tileset.tileCount) attach.tileset.tileUserData.push(chunk);
      else orphan("타일 수보다 많은 사용자 데이터가 이어졌다");
      attach.taken += 1;
      return attach;
    case "sprite":
      return attach;
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** 자식 레벨로 부모를 정하고 보이는지를 조상까지 합친다. 레벨 점프나 그룹이 아닌 부모는 진단하고 루트에 붙인다. */
export function buildLayerTree(layers: AsepriteSpriteLayer[], warnings: FormatIssue[]): void {
  const stack: number[] = [];
  for (const source of layers) {
    const layer = source as Mutable<AsepriteSpriteLayer>;
    let level = layer.childLevel;
    if (level > stack.length) {
      warnings.push(
        issue("semantic", "aseprite-layer-child-level-invalid", `레이어 "${layer.name}"의 자식 레벨 ${level}이 직전 계층 깊이 ${stack.length}보다 2 이상 깊다`, `layer[${layer.index}]`),
      );
      level = stack.length;
    }
    stack.length = level;
    let parent: number | null = level > 0 ? (stack[level - 1] ?? null) : null;
    if (parent !== null && layers[parent]!.kind !== "group") {
      warnings.push(
        issue("semantic", "aseprite-layer-parent-not-group", `레이어 "${layer.name}"의 부모 "${layers[parent]!.name}"가 그룹이 아니어서 루트에 붙였다`, `layer[${layer.index}]`),
      );
      parent = null;
    }
    layer.parentIndex = parent;
    layer.depth = parent === null ? 0 : layers[parent]!.depth + 1;
    layer.effectiveVisible = layer.flags.visible && (parent === null || layers[parent]!.effectiveVisible);
    stack[level] = layer.index;
  }
}

export function validateCels(
  cels: readonly AsepriteSpriteCel[],
  layers: readonly AsepriteSpriteLayer[],
  frameCount: number,
  warnings: FormatIssue[],
  unsupported: FormatIssue[],
): void {
  const byFrameAndLayer = new Map<string, AsepriteSpriteCel>();
  for (const cel of cels) byFrameAndLayer.set(`${cel.frameIndex}:${cel.layerIndex}`, cel);
  for (const cel of cels) {
    const where = `frame[${cel.frameIndex}].cel[layer ${cel.layerIndex}]`;
    const layer = layers[cel.layerIndex];
    if (layer === undefined) {
      unsupported.push(issue("semantic", "aseprite-cel-layer-missing", `셀이 존재하지 않는 레이어 ${cel.layerIndex}를 가리킨다 (레이어 ${layers.length}개)`, where));
    } else if (layer.kind === "group") {
      warnings.push(issue("semantic", "aseprite-cel-on-group-layer", `그룹 레이어 "${layer.name}"에 셀이 있다`, where));
    } else if (cel.kind === "tilemap" && layer.kind !== "tilemap") {
      warnings.push(issue("semantic", "aseprite-cel-kind-mismatch", `타일맵 셀이 타일맵이 아닌 레이어 "${layer.name}"에 있다`, where));
    } else if (cel.kind === "image" && layer.kind === "tilemap") {
      warnings.push(issue("semantic", "aseprite-cel-kind-mismatch", `이미지 셀이 타일맵 레이어 "${layer.name}"에 있다`, where));
    }
    if (cel.kind === "linked") {
      const target = cel.linkedFrame;
      if (target === null || target >= cel.frameIndex || target >= frameCount || !byFrameAndLayer.has(`${target}:${cel.layerIndex}`)) {
        unsupported.push(issue("semantic", "aseprite-cel-link-invalid", `링크 셀이 가리키는 프레임 ${target}의 같은 레이어 셀을 찾지 못했다`, where));
      }
    }
  }
}
