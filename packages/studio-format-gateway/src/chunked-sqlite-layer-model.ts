/**
 * @file chunked-sqlite-layer-model.ts
 * @description `CSFCHUNK` 문서 DB의 `Layer` 행을 해석하는 순수 함수: 열 목록, 값 환산, 레이어 종류 판정, 합성 모드 표, 레이어 트리 평탄화.
 *
 * 근거 수준(중요): 열 이름·값의 의미·트리 규칙은 **제3자가 공개한 명세**에서 가져왔고 우리가 실제 `.clip` 파일로 확인한 것은 없다.
 * - S1 nanikasheila/CLIP_STUDIO_PAINT_Format `docs/spec/03-canvas-and-layers.md`, `schema-catalog.md` (MIT, 실제 파일 719개로 대조했다고 밝힘.
 *   합성 모드 표는 저자가 CSP와 대조했다고 적음)
 * - S2 wamsoft/clipparse `docs/CLIP_FORMAT.md` (MIT, 실제 파일 4개 측정)
 * 두 출처가 같게 적은 것: 레이어 트리는 `LayerFirstChildIndex`(첫 자식) + `LayerNextIndex`(다음 형제) 연결 목록이고 값은 `Layer.MainId`, 0으로 끝난다.
 * 첫 자식이 가장 아래 레이어다. `LayerOpacity`는 0~256(256 = 100%). `LayerType` 256 = 루트, 1584 = 용지. `LayerFolder`의 비트 0 = 폴더.
 * `LayerClip`이 0이 아니면 아래 레이어에 클리핑. 합성 모드 값 29개는 두 출처가 모두 같다(S2 §9의 표도 같은 29개). 한쪽만 적은 것: 컷 틀 폴더의
 * 표지 `ComicFrameLineMipmap`과 "마스크를 저장하지 않는다"(S1만), `LayerLock`의 비트 의미(S2만: 비트 0 편집 잠금, 비트 4 투명 픽셀 잠금. S1은 0이
 * 아니면 잠금이라고만 적고 비트별 의미는 미해명이라고 적음). 두 출처가 다르거나 한쪽만 적어 해석하지 않은 것: `LayerVisibility`의 비트(S1: 비트 0
 * 표시·비트 1 마스크 사용, S2: 0/1만), `LayerFolder` 비트 4(S1: 팔레트에서 열림, S2: 접힘). 이 코드는 해석하지 않은 값의 원본을 그대로 노출한다.
 * 항목별 교차 확인 표는 `docs/design/chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`에 있다.
 */

import { CLIP_DOCUMENT_LIMITS, type ClipLayerKind, type ClipSqliteColumn, type ClipSqliteValue } from "./chunked-sqlite-document-types";

// ---------------------------------------------------------------------------
// 값 환산
// ---------------------------------------------------------------------------

/** SQLite 정수 셀을 안전 정수로 환산한다. 정수가 아니거나 범위를 넘으면 null. */
export function readClipInteger(value: ClipSqliteValue | undefined): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "bigint") {
    const converted = Number(value);
    return Number.isSafeInteger(converted) && BigInt(converted) === value ? converted : null;
  }
  return null;
}

/** SQLite 실수 셀을 유한한 수로 환산한다. */
export function readClipNumber(value: ClipSqliteValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : null;
  }
  return null;
}

const UTF8 = new TextDecoder("utf-8");

/** 텍스트 셀(BLOB로 저장된 UTF-8 포함)을 `maxCharacters` 코드 단위까지만 읽는다. */
export function readClipText(value: ClipSqliteValue | undefined, maxCharacters: number): string | null {
  let text: string;
  if (typeof value === "string") text = value;
  else if (value instanceof Uint8Array) text = UTF8.decode(value.subarray(0, maxCharacters * 4));
  else return null;
  if (text.length <= maxCharacters) return text;
  const clipped = text.slice(0, maxCharacters);
  // 자른 끝에 서로게이트 쌍의 앞 절반만 남았으면 버린다.
  return /[\ud800-\udbff]$/u.test(clipped) ? clipped.slice(0, -1) : clipped;
}

// ---------------------------------------------------------------------------
// 열 목록
// ---------------------------------------------------------------------------

const plain = (name: string): ClipSqliteColumn => ({ name });
const presence = (name: string): ClipSqliteColumn => ({ name, mode: "present" });
const lengthOf = (name: string): ClipSqliteColumn => ({ name, mode: "length" });

/**
 * 이름·UUID 열에서 판독기에게 요청하는 최대 길이. 호출자가 정할 수 있는 `maxTextCharacters`는 기본값 이하로만 내릴 수 있으므로 기본값의
 * 4배(UTF-8 한 글자의 최대 바이트 수)면 어느 설정에서도 `readClipText`가 자를 몫을 포함한다. 이 값은 수백 MB짜리 셀이 메모리에 올라오는 것을
 * 막는 상한일 뿐이고 결과의 글자 수 상한은 `maxTextCharacters`가 정한다.
 */
export const CLIP_TEXT_CELL_LIMIT = CLIP_DOCUMENT_LIMITS.maxTextCharacters * 4;
const bounded = (name: string): ClipSqliteColumn => ({ name, limit: CLIP_TEXT_CELL_LIMIT });

/**
 * `Layer`에서 읽는 열. 큰 BLOB 열(텍스트·그라데이션·필터 정보)은 내용을 옮기지 않고 길이/존재만 묻는다. 파일에 없는 열은 가져오기가
 * `tableColumns`로 걸러내고 "값 없음"으로 다룬다(명세: 표와 열은 처음 필요할 때 만들어지므로 없는 열은 오류가 아니다).
 */
export const CLIP_LAYER_COLUMNS: readonly ClipSqliteColumn[] = Object.freeze([
  plain("MainId"),
  bounded("LayerName"),
  plain("LayerType"),
  bounded("LayerUuid"),
  plain("LayerVisibility"),
  plain("LayerOpacity"),
  plain("LayerComposite"),
  plain("LayerClip"),
  plain("LayerLock"),
  plain("LayerFolder"),
  plain("LayerFirstChildIndex"),
  plain("LayerNextIndex"),
  plain("LayerOffsetX"),
  plain("LayerOffsetY"),
  plain("LayerRenderOffscrOffsetX"),
  plain("LayerRenderOffscrOffsetY"),
  plain("LayerMaskOffsetX"),
  plain("LayerMaskOffsetY"),
  plain("LayerMaskOffscrOffsetX"),
  plain("LayerMaskOffscrOffsetY"),
  plain("LayerRenderMipmap"),
  plain("LayerLayerMaskMipmap"),
  plain("DrawColorEnable"),
  plain("DrawColorMainRed"),
  plain("DrawColorMainGreen"),
  plain("DrawColorMainBlue"),
  plain("DrawToRenderOffscreenType"),
  lengthOf("TextLayerString"),
  lengthOf("GradationFillInfo"),
  lengthOf("FilterLayerInfo"),
  plain("FirstLayerObject"),
  lengthOf("ResizableImageInfo"),
  plain("ComicFrameLineMipmap"),
  presence("VectorNormalStrokeIndex"),
]);

// ---------------------------------------------------------------------------
// 합성 모드
// ---------------------------------------------------------------------------

/** `Layer.LayerComposite` 값 → 모드 ID. S1이 CSP와 대조했다고 적은 표이며 29개 값 모두 S2 §9의 표와 같다. */
const COMPOSITE_MODES = new Map<number, string>([
  [0, "normal"],
  [1, "darken"],
  [2, "multiply"],
  [3, "color-burn"],
  [4, "linear-burn"],
  [5, "subtract"],
  [6, "darker-color"],
  [7, "lighten"],
  [8, "screen"],
  [9, "color-dodge"],
  [10, "glow-dodge"],
  [11, "add"],
  [12, "glow-add"],
  [13, "lighter-color"],
  [14, "overlay"],
  [15, "soft-light"],
  [16, "hard-light"],
  [17, "vivid-light"],
  [18, "linear-light"],
  [19, "pin-light"],
  [20, "hard-mix"],
  [21, "difference"],
  [22, "exclusion"],
  [23, "hue"],
  [24, "saturation"],
  [25, "color"],
  [26, "luminosity"],
  [30, "pass-through"],
  [36, "divide"],
]);

export const CLIP_PASS_THROUGH_COMPOSITE = 30;

/** 알려진 합성 모드의 ID. 모르는 값이면 null. */
export function clipCompositeModeId(raw: number): string | null {
  return COMPOSITE_MODES.get(raw) ?? null;
}

// ---------------------------------------------------------------------------
// 행 모델
// ---------------------------------------------------------------------------

export interface ClipLayerMarkers {
  readonly text: boolean;
  readonly fill: boolean;
  readonly filter: boolean;
  readonly model3d: boolean;
  readonly imageMaterial: boolean;
  readonly frameLine: boolean;
  readonly vectorStroke: boolean;
}

export interface ClipLayerRow {
  readonly id: number;
  readonly name: string;
  readonly layerType: number;
  readonly uuid: string | null;
  readonly visibility: number;
  readonly opacity: number;
  readonly composite: number;
  readonly clip: number;
  readonly lock: number;
  readonly folder: number;
  readonly firstChild: number;
  readonly next: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly renderOffsetX: number;
  readonly renderOffsetY: number;
  readonly maskOffsetX: number;
  readonly maskOffsetY: number;
  readonly maskRenderOffsetX: number;
  readonly maskRenderOffsetY: number;
  readonly renderMipmap: number;
  readonly maskMipmap: number;
  readonly drawColorEnabled: boolean;
  readonly drawColor: { readonly r: number; readonly g: number; readonly b: number } | null;
  /** `DrawToRenderOffscreenType` 원본 값. 열이 없거나 정수가 아니면 null. 렌더 오프셋 해석(S1과 S2의 어긋남)을 검증할 때 상관을 보려고 노출한다. */
  readonly drawToRenderType: number | null;
  readonly markers: ClipLayerMarkers;
}

/** 열 이름으로 셀을 꺼내는 함수. 파일에 없는 열이면 undefined. */
export type ClipRowCells = (column: string) => ClipSqliteValue | undefined;

/** 4,294,967,295(흰색)처럼 상위 8비트에 채널을 담은 32비트 값에서 8비트 채널을 꺼낸다. */
function colorChannel(raw: number): number {
  return Math.floor(raw / 0x1000000) & 0xff;
}

function integerOr(cells: ClipRowCells, column: string, fallback: number): number {
  return readClipInteger(cells(column)) ?? fallback;
}

/**
 * 한 행을 `ClipLayerRow`로 환산한다. `MainId`가 없거나 양의 정수가 아니면 null(그 행은 건너뛴다).
 * 값이 없거나 형식이 맞지 않는 열은 기본값을 쓴다: 표시 1, 불투명도 256, 나머지는 0.
 */
export function projectClipLayerRow(cells: ClipRowCells, maxTextCharacters: number): ClipLayerRow | null {
  const id = readClipInteger(cells("MainId"));
  if (id === null || id <= 0) return null;
  const red = readClipInteger(cells("DrawColorMainRed"));
  const green = readClipInteger(cells("DrawColorMainGreen"));
  const blue = readClipInteger(cells("DrawColorMainBlue"));
  const drawColor =
    red !== null && green !== null && blue !== null && red >= 0 && green >= 0 && blue >= 0
      ? { r: colorChannel(red), g: colorChannel(green), b: colorChannel(blue) }
      : null;
  // 종류 표지 열이 "있다"고 보는 기준은 이 구현의 가정이다: 열 값은 BLOB 열이면 길이, 정수 열이면 값 자체이고 0보다 커야 한다. S1은 표지 열이
  // NULL이 아니면 그 종류라고만 적었으므로, 길이가 0인 BLOB을 그 종류로 보지 않는 것은 출처가 없는 선택이다.
  const exists = (column: string): boolean => (readClipInteger(cells(column)) ?? 0) > 0;
  return {
    id,
    name: readClipText(cells("LayerName"), maxTextCharacters) ?? "",
    layerType: integerOr(cells, "LayerType", 0),
    uuid: readClipText(cells("LayerUuid"), maxTextCharacters),
    visibility: integerOr(cells, "LayerVisibility", 1),
    opacity: integerOr(cells, "LayerOpacity", 256),
    composite: integerOr(cells, "LayerComposite", 0),
    clip: integerOr(cells, "LayerClip", 0),
    lock: integerOr(cells, "LayerLock", 0),
    folder: integerOr(cells, "LayerFolder", 0),
    firstChild: integerOr(cells, "LayerFirstChildIndex", 0),
    next: integerOr(cells, "LayerNextIndex", 0),
    offsetX: integerOr(cells, "LayerOffsetX", 0),
    offsetY: integerOr(cells, "LayerOffsetY", 0),
    renderOffsetX: integerOr(cells, "LayerRenderOffscrOffsetX", 0),
    renderOffsetY: integerOr(cells, "LayerRenderOffscrOffsetY", 0),
    maskOffsetX: integerOr(cells, "LayerMaskOffsetX", 0),
    maskOffsetY: integerOr(cells, "LayerMaskOffsetY", 0),
    maskRenderOffsetX: integerOr(cells, "LayerMaskOffscrOffsetX", 0),
    maskRenderOffsetY: integerOr(cells, "LayerMaskOffscrOffsetY", 0),
    renderMipmap: integerOr(cells, "LayerRenderMipmap", 0),
    maskMipmap: integerOr(cells, "LayerLayerMaskMipmap", 0),
    drawColorEnabled: integerOr(cells, "DrawColorEnable", 0) !== 0,
    drawColor,
    drawToRenderType: readClipInteger(cells("DrawToRenderOffscreenType")),
    markers: {
      text: exists("TextLayerString"),
      fill: exists("GradationFillInfo"),
      filter: exists("FilterLayerInfo"),
      model3d: exists("FirstLayerObject"),
      imageMaterial: exists("ResizableImageInfo"),
      frameLine: exists("ComicFrameLineMipmap"),
      vectorStroke: readClipInteger(cells("VectorNormalStrokeIndex")) === 1,
    },
  };
}

// ---------------------------------------------------------------------------
// 종류 판정
// ---------------------------------------------------------------------------

const LAYER_TYPE_PAPER = 1584;
const LAYER_TYPE_STORY_INFO = 800;
const LAYER_TYPE_FILTER_BIT = 4096;
const LAYER_TYPE_RASTER_BIT = 1;

/**
 * 레이어 종류를 판정한다. 순서는 S1의 판정 표를 따른다(앞선 조건이 먼저 이긴다): 용지(1584) → 작품 정보(800) → 폴더(`LayerFolder` 비트 0) →
 * 텍스트 → 그라데이션·단색 채움 → 색조 보정(필터 정보 또는 `LayerType` 비트 12) → 3D → 화상 소재 → 벡터(`VectorObjectList`에 든 레이어)
 * → 래스터(`LayerType` 비트 0) → 아무것도 그리지 않은 벡터(`LayerType` 0 + 벡터 획 열). 어느 것도 아니면 `other`.
 * 폴더 가운데 `ComicFrameLineMipmap`이 있는 것은 컷 틀 폴더(`frame-folder`)다(S1만 적음: 마스크를 저장하지 않는다).
 */
export function classifyClipLayer(row: ClipLayerRow, inVectorObjectList: boolean): ClipLayerKind {
  if (row.layerType === LAYER_TYPE_PAPER) return "paper";
  if (row.layerType === LAYER_TYPE_STORY_INFO) return "story-info";
  const { markers } = row;
  if ((row.folder & 1) !== 0) return markers.frameLine ? "frame-folder" : "folder";
  if (markers.text) return "text";
  if (markers.fill) return "fill";
  if (markers.filter || (row.layerType & LAYER_TYPE_FILTER_BIT) !== 0) return "adjustment";
  if (markers.model3d) return "model3d";
  if (markers.imageMaterial) return "image-material";
  if (inVectorObjectList) return "vector";
  if ((row.layerType & LAYER_TYPE_RASTER_BIT) !== 0) return "raster";
  if (row.layerType === 0 && markers.vectorStroke) return "vector";
  return "other";
}

// ---------------------------------------------------------------------------
// 트리
// ---------------------------------------------------------------------------

export interface ClipFlatLayer {
  readonly row: ClipLayerRow;
  readonly parentIndex: number | null;
  readonly depth: number;
  readonly effectiveVisible: boolean;
}

export interface ClipTreeOptions {
  readonly maxLayers: number;
  readonly maxDepth: number;
}

export type ClipTreeReport = (code: string, message: string) => void;

interface Frame {
  readonly children: readonly number[];
  cursor: number;
  readonly parentIndex: number | null;
  readonly depth: number;
  readonly parentVisible: boolean;
}

/**
 * 루트 폴더에서 시작해 레이어를 깊이 우선으로 평탄화한다. 같은 폴더 안에서는 위쪽 레이어가 먼저 온다(연결 목록은 아래에서 위 순서이므로
 * 뒤집는다). 순환·끊어진 연결·너무 깊은 중첩은 보고하고 그 가지만 버린다. 루트 자신은 결과에 넣지 않는다.
 */
export function flattenClipLayerTree(
  rows: ReadonlyMap<number, ClipLayerRow>,
  rootId: number,
  options: ClipTreeOptions,
  report: ClipTreeReport,
): ClipFlatLayer[] {
  const root = rows.get(rootId);
  if (root === undefined) return [];
  const output: ClipFlatLayer[] = [];
  const visited = new Set<number>([rootId]);

  const collectChildren = (folder: ClipLayerRow): number[] => {
    const ids: number[] = [];
    let cursor = folder.firstChild;
    while (cursor !== 0) {
      if (visited.has(cursor)) {
        report("clip-layer-link-cycle", `레이어 ${cursor}를 이미 읽었는데 다시 연결되어 있다. 이 연결은 따라가지 않는다`);
        break;
      }
      const row = rows.get(cursor);
      if (row === undefined) {
        report("clip-layer-link-missing", `레이어 ${cursor}를 가리키는 연결이 있지만 그 행이 없다`);
        break;
      }
      visited.add(cursor);
      ids.push(cursor);
      cursor = row.next;
    }
    return ids.reverse();
  };

  const stack: Frame[] = [{ children: collectChildren(root), cursor: 0, parentIndex: null, depth: 0, parentVisible: true }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.cursor >= frame.children.length) {
      stack.pop();
      continue;
    }
    const row = rows.get(frame.children[frame.cursor]!)!;
    frame.cursor += 1;
    if (output.length >= options.maxLayers) {
      report("clip-layer-limit", `레이어 ${options.maxLayers}개를 넘는 부분은 읽지 않는다`);
      return output;
    }
    const index = output.length;
    const effectiveVisible = frame.parentVisible && (row.visibility & 1) !== 0;
    output.push({ row, parentIndex: frame.parentIndex, depth: frame.depth, effectiveVisible });
    if ((row.folder & 1) === 0) {
      if (row.firstChild !== 0) report("clip-layer-children-ignored", `폴더가 아닌 레이어 ${row.id}의 자식 연결은 따라가지 않는다`);
      continue;
    }
    if (frame.depth + 1 > options.maxDepth) {
      if (row.firstChild !== 0) report("clip-group-depth-exceeded", `폴더 ${row.id}의 중첩이 ${options.maxDepth}단계를 넘어 하위 레이어를 읽지 않는다`);
      continue;
    }
    stack.push({ children: collectChildren(row), cursor: 0, parentIndex: index, depth: frame.depth + 1, parentVisible: effectiveVisible });
  }
  return output;
}
