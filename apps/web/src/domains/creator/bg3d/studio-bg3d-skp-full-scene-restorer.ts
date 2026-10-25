/**
 * studio-bg3d-skp-full-scene-restorer.ts
 *
 * SketchUp(.skp) 모델 전체 복원 브리지 — OpenSKP(`parseSkp`, `buildInstancedScene`, `extractThumbnail`)가
 * 제공하는 모든 엔티티(장면 Pages/카메라·태그 Layers/색상/숨김·인스턴스 계층 트리·다이나믹 컴포넌트 속성·
 * 단면 평면 SectionPlane·치수선 Dimension·지시선 TextEntity·보조선 ConstructionLine/Point·스타일 Style·
 * 내장 썸네일 SkpThumbnail)를 ToonStudio 3D 장면 규격(Y-up, 미터 단위)으로 손실 없이 복원한다.
 *
 * 좌표 변환 근거(REA `ev_a1d0b81b0db0d09672067f12696131418b183628537ddf7d542d4b8a0211be3a`):
 * - SketchUp 내부 원시 좌표는 인치(inch, 1 inch = 0.0254 m) 및 Z-up 오른손 좌표계(X: 우측, Y: 북쪽/깊이, Z: 위쪽).
 * - OpenSKP 및 ToonStudio glTF/Three.js 뷰포트는 미터(m) 및 Y-up 오른손 좌표계:
 *   `(x_m, y_m, z_m) = (x_in * 0.0254 * scale, z_in * 0.0254 * scale, -y_in * 0.0254 * scale)`
 */

import {
  createDynamicComponent,
  setDynamicComponentValue,
  type DynamicComponentKind,
  type DynamicComponentState,
} from "../scene-3d/studio-3d-dynamic-components";
import { sanitizeStudioBg3dSkpName } from "./studio-bg3d-skp-report-builder";

import type { StudioBg3dShot, StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";

export const SKP_INCH_TO_METER = 0.0254;
export const SKP_INFINITE_LINE_SENTINEL_THRESHOLD = 1e20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readVec3Tuple(value: unknown): readonly [number, number, number] | null {
  if (!isUnknownArray(value) || value.length < 3) return null;
  const x = value[0];
  const y = value[1];
  const z = value[2];
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof z !== "number" || !Number.isFinite(z)
  ) {
    return null;
  }
  return [x, y, z];
}

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * SketchUp Z-up 인치 좌표를 ToonStudio Y-up 미터 좌표로 변환한다.
 * `(x_skp, y_skp, z_skp) -> (x_skp * 0.0254 * scale, z_skp * 0.0254 * scale, -y_skp * 0.0254 * scale)`
 */
export function skpPointInchesZUpToMetersYUp(
  pointInchesZUp: readonly [number, number, number],
  unitScaleFactor = 1,
): StudioBg3dVec3 {
  const scale = Number.isFinite(unitScaleFactor) && unitScaleFactor > 0
    ? SKP_INCH_TO_METER * unitScaleFactor
    : SKP_INCH_TO_METER;
  return Object.freeze([
    round6(pointInchesZUp[0] * scale),
    round6(pointInchesZUp[2] * scale),
    round6(-pointInchesZUp[1] * scale),
  ]);
}

/**
 * SketchUp Z-up 방향 벡터를 ToonStudio Y-up 정규화 단위 벡터로 변환한다.
 * `(dx_skp, dy_skp, dz_skp) -> normalize(dx_skp, dz_skp, -dy_skp)`
 */
export function skpDirectionZUpToYUp(
  dirZUp: readonly [number, number, number],
  fallback: StudioBg3dVec3 = [0, 1, 0],
): StudioBg3dVec3 {
  const rx = dirZUp[0];
  const ry = dirZUp[2];
  const rz = -dirZUp[1];
  const len = Math.hypot(rx, ry, rz);
  if (!Number.isFinite(len) || len < 1e-9) {
    return Object.freeze([fallback[0], fallback[1], fallback[2]]);
  }
  return Object.freeze([
    round6(rx / len),
    round6(ry / len),
    round6(rz / len),
  ]);
}

/**
 * SketchUp 단면 평면 방정식 `ax + by + cz + d = 0` (인치, Z-up)을
 * ToonStudio Y-up 미터 기준 평면 계수 `[nx, ny, nz, constantMeters]`로 변환한다.
 */
export function skpPlaneZUpToMetersYUp(
  plane: readonly [number, number, number, number],
  unitScaleFactor = 1,
): readonly [number, number, number, number] {
  const scale = Number.isFinite(unitScaleFactor) && unitScaleFactor > 0
    ? SKP_INCH_TO_METER * unitScaleFactor
    : SKP_INCH_TO_METER;
  const normal = skpDirectionZUpToYUp([plane[0], plane[1], plane[2]], [0, 0, -1]);
  const nLen = Math.hypot(plane[0], plane[1], plane[2]);
  const normalizedD = nLen > 1e-9 ? (plane[3] / nLen) * scale : plane[3] * scale;
  return Object.freeze([
    normal[0],
    normal[1],
    normal[2],
    round6(normalizedD),
  ]);
}

export interface StudioBg3dRestoredSkpSceneShot {
  readonly index: number;
  readonly name: string;
  readonly shot: StudioBg3dShot;
  readonly parallel: boolean;
  readonly orthoHeightMeters: number | null;
  readonly hiddenLayerNames: readonly string[];
}

export interface RestoreSkpScenesOptions {
  readonly unitScaleFactor?: number;
  readonly idPrefix?: string;
}

/**
 * `SkpModel.pages` (SketchUp Scenes)의 카메라 위치·타깃·업벡터·화각·평행 투영·숨김 레이어를
 * ToonStudio `StudioBg3dShot` 목록으로 변환한다.
 */
export function restoreStudioBg3dSkpScenesToShots(
  model: unknown,
  options: RestoreSkpScenesOptions = {},
): readonly StudioBg3dRestoredSkpSceneShot[] {
  if (!isRecord(model) || !isUnknownArray(model.pages)) {
    return Object.freeze([]);
  }
  const unitScale = options.unitScaleFactor ?? 1;
  const idPrefix = options.idPrefix ?? "skp-scene";
  const scale = Number.isFinite(unitScale) && unitScale > 0
    ? SKP_INCH_TO_METER * unitScale
    : SKP_INCH_TO_METER;

  const restored: StudioBg3dRestoredSkpSceneShot[] = [];
  for (let i = 0; i < model.pages.length; i += 1) {
    const page = model.pages[i];
    if (!isRecord(page)) continue;
    const rawName = sanitizeStudioBg3dSkpName(page.name) ?? `Scene ${i + 1}`;
    const eyeIn = readVec3Tuple(page.eye) ?? [0, -120, 64];
    const targetIn = readVec3Tuple(page.target) ?? [0, 0, 48];
    const upIn = readVec3Tuple(page.up) ?? [0, 0, 1];

    const position = skpPointInchesZUpToMetersYUp(eyeIn, unitScale);
    const target = skpPointInchesZUpToMetersYUp(targetIn, unitScale);
    const up = skpDirectionZUpToYUp(upIn, [0, 1, 0]);
    const parallel = page.parallel === true;
    const rawFov = readNumber(page.fov, 35);
    const fovDegrees = Math.min(120, Math.max(10, rawFov > 0 ? rawFov : 35));
    const rawOrthoHeight = readNumber(page.orthoHeight, 0);
    const orthoHeightMeters = parallel && rawOrthoHeight > 0
      ? round6(rawOrthoHeight * scale)
      : null;

    const hiddenLayerNames = isUnknownArray(page.hiddenLayers)
      ? page.hiddenLayers
          .map((item) => sanitizeStudioBg3dSkpName(item))
          .filter((item): item is string => item !== null)
      : [];

    const zoom = parallel && orthoHeightMeters && orthoHeightMeters > 0
      ? round6(Math.min(20, Math.max(0.1, 4 / orthoHeightMeters)))
      : 1;

    const shot: StudioBg3dShot = Object.freeze({
      id: `${idPrefix}-${i + 1}`,
      name: rawName,
      camera: Object.freeze({
        position,
        target,
        up,
        fovDegrees: round6(fovDegrees),
        projection: parallel ? "orthographic" : "perspective",
        zoom,
      }),
      ...(hiddenLayerNames.length > 0
        ? { hiddenTags: Object.freeze([...new Set(hiddenLayerNames)].sort()) }
        : {}),
    });

    restored.push(Object.freeze({
      index: i,
      name: rawName,
      shot,
      parallel,
      orthoHeightMeters,
      hiddenLayerNames: Object.freeze(hiddenLayerNames),
    }));
  }

  return Object.freeze(restored);
}

export interface StudioBg3dRestoredSkpTag {
  readonly name: string;
  readonly colorHex: string;
  readonly hidden: boolean;
}

function rgbByteToHex(value: unknown, fallback = 128): string {
  const n = typeof value === "number" && Number.isFinite(value)
    ? Math.min(255, Math.max(0, Math.round(value)))
    : fallback;
  return n.toString(16).padStart(2, "0");
}

function skpColorToHex(color: unknown, fallback = "#808080"): string {
  if (!isRecord(color)) return fallback;
  return `#${rgbByteToHex(color.r)}${rgbByteToHex(color.g)}${rgbByteToHex(color.b)}`;
}

/**
 * `SkpModel.layers`에서 태그 이름, RGB 색상(`#rrggbb`), 초기 숨김 상태를 복원한다.
 */
export function restoreStudioBg3dSkpTags(model: unknown): readonly StudioBg3dRestoredSkpTag[] {
  if (!isRecord(model) || !isUnknownArray(model.layers)) {
    return Object.freeze([]);
  }
  const seen = new Set<string>();
  const tags: StudioBg3dRestoredSkpTag[] = [];
  for (const layer of model.layers) {
    if (!isRecord(layer)) continue;
    const name = sanitizeStudioBg3dSkpName(layer.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    tags.push(Object.freeze({
      name,
      colorHex: skpColorToHex(layer.color, "#647696"),
      hidden: layer.hidden === true,
    }));
  }
  return Object.freeze(tags);
}

export interface StudioBg3dRestoredSkpInstanceNode {
  readonly id: string;
  readonly name: string;
  readonly definitionName: string;
  readonly layer: string;
  readonly parentId: string | null;
  readonly positionMeters: StudioBg3dVec3;
  readonly rotationRad: StudioBg3dVec3;
  readonly scale: StudioBg3dVec3;
  readonly guid: string | null;
  readonly meshResourceId: number | null;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly attributeDictionaries: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>;
  readonly dynamicComponentCandidate: DynamicComponentState | null;
}

export interface StudioBg3dRestoredSkpHierarchy {
  readonly nodes: readonly StudioBg3dRestoredSkpInstanceNode[];
  readonly layerHidden: Readonly<Record<string, boolean>>;
  readonly dynamicComponents: readonly DynamicComponentState[];
}

/**
 * glTF 4x4 열 우선(column-major) 행렬 16개 원소에서 이동·회전(Euler XYZ 라디안)·배율을 분해한다.
 */
export function decomposeGlTFColumnMajorMatrix16(
  matrix: readonly number[],
): {
  readonly position: StudioBg3dVec3;
  readonly rotation: StudioBg3dVec3;
  readonly scale: StudioBg3dVec3;
} {
  if (matrix.length < 16 || matrix.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
  }
  const m00 = matrix[0]!;
  const m01 = matrix[1]!;
  const m02 = matrix[2]!;
  const m10 = matrix[4]!;
  const m11 = matrix[5]!;
  const m12 = matrix[6]!;
  const m20 = matrix[8]!;
  const m21 = matrix[9]!;
  const m22 = matrix[10]!;
  const tx = matrix[12]!;
  const ty = matrix[13]!;
  const tz = matrix[14]!;

  const sx = Math.hypot(m00, m01, m02) || 1;
  const sy = Math.hypot(m10, m11, m12) || 1;
  const sz = Math.hypot(m20, m21, m22) || 1;

  const r00 = m00 / sx;
  const r01 = m01 / sx;
  const r02 = m02 / sx;
  const r11 = m11 / sy;
  const r12 = m12 / sy;
  const r20 = m20 / sz;
  const r21 = m21 / sz;
  const r22 = m22 / sz;

  const ry = Math.asin(Math.min(1, Math.max(-1, r20)));
  const nonGimbal = Math.abs(r20) < 0.999999;
  const rx = nonGimbal ? Math.atan2(-r21, r22) : Math.atan2(r12, r11);
  const rz = nonGimbal ? Math.atan2(-m10 / sy, r00) : 0;
  void r01;
  void r02;

  return {
    position: Object.freeze([round6(tx), round6(ty), round6(tz)]),
    rotation: Object.freeze([round6(rx), round6(ry), round6(rz)]),
    scale: Object.freeze([round6(sx), round6(sy), round6(sz)]),
  };
}

function sanitizeFlatPropMap(
  raw: unknown,
): Readonly<Record<string, string | number | boolean>> {
  if (!isRecord(raw)) return Object.freeze({});
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return Object.freeze(out);
}

function inferDynamicComponentFromSkpNode(
  nodeId: string,
  name: string,
  definitionName: string,
  properties: Readonly<Record<string, string | number | boolean>>,
): DynamicComponentState | null {
  const combinedText = `${name} ${definitionName} ${Object.keys(properties).join(" ")} ${String(properties.onclick ?? "")}`.toLowerCase();
  const hasDynamicProps = Object.keys(properties).length > 0;
  let kind: DynamicComponentKind | null = null;

  if (/\b(double[_\s-]*door|양개문|양문)\b/u.test(combinedText)) {
    kind = "door-double-swing";
  } else if (/\b(door|문|현관문|교실문|여닫이)\b/u.test(combinedText)) {
    kind = "door-single-swing";
  } else if (/\b(window|창문|미닫이창|슬라이딩)\b/u.test(combinedText)) {
    kind = "window-sliding";
  } else if (/\b(drawer|서랍)\b/u.test(combinedText)) {
    kind = "furniture-drawer";
  } else if (/\b(chest|lid|상자|뚜껑)\b/u.test(combinedText)) {
    kind = "treasure-chest";
  } else if (/\b(lamp|light|전등|조명|가로등)\b/u.test(combinedText) && hasDynamicProps) {
    kind = "light-switchable";
  } else if (/\b(wheel|바퀴)\b/u.test(combinedText)) {
    kind = "vehicle-wheel-turn";
  } else if (hasDynamicProps && typeof properties.onclick === "string") {
    const onclickLower = properties.onclick.toLowerCase();
    if (onclickLower.includes("rot")) kind = "door-single-swing";
    else if (onclickLower.includes("x") || onclickLower.includes("y") || onclickLower.includes("z")) {
      kind = "furniture-drawer";
    }
  }

  if (!kind) return null;

  const customMaxRange = typeof properties.max_angle === "number"
    ? properties.max_angle
    : typeof properties.open_angle === "number"
      ? properties.open_angle
      : undefined;
  const base = createDynamicComponent(nodeId, kind, false, customMaxRange);
  const initialRatio = typeof properties.open_ratio === "number"
    ? properties.open_ratio
    : properties.is_open === true
      ? 1
      : 0;
  return setDynamicComponentValue(
    {
      ...base,
      label: `${definitionName || name} (${base.label})`,
    },
    initialRatio,
  );
}

/**
 * `buildInstancedScene()` 또는 `buildScene().sceneHierarchy`에서 전체 인스턴스 계층 트리와
 * SketchUp 다이나믹 컴포넌트(`dynamic_attributes`) 및 BIM 속성 사전을 복원한다.
 */
export function restoreStudioBg3dSkpInstancedHierarchy(
  instancedSceneOrRoot: unknown,
): StudioBg3dRestoredSkpHierarchy {
  if (!isRecord(instancedSceneOrRoot)) {
    return Object.freeze({
      nodes: Object.freeze([]),
      layerHidden: Object.freeze({}),
      dynamicComponents: Object.freeze([]),
    });
  }

  const root = isRecord(instancedSceneOrRoot.root)
    ? instancedSceneOrRoot.root
    : instancedSceneOrRoot;

  const layerHidden: Record<string, boolean> = {};
  if (isRecord(instancedSceneOrRoot.layerHidden)) {
    for (const [layerName, hidden] of Object.entries(instancedSceneOrRoot.layerHidden)) {
      if (typeof hidden === "boolean") {
        layerHidden[layerName] = hidden;
      }
    }
  }

  const nodes: StudioBg3dRestoredSkpInstanceNode[] = [];
  const dynamicComponents: DynamicComponentState[] = [];

  interface QueueItem {
    readonly raw: unknown;
    readonly parentId: string | null;
  }

  const rootChildren = isUnknownArray(root.children) ? root.children : [];
  const stack: QueueItem[] = [];
  for (let i = rootChildren.length - 1; i >= 0; i -= 1) {
    stack.push({ raw: rootChildren[i], parentId: null });
  }

  let seq = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!isRecord(current.raw)) continue;
    seq += 1;
    const nodeId = `skp-inst-${seq}`;
    const rawName = sanitizeStudioBg3dSkpName(current.raw.name) ?? `Instance ${seq}`;
    const definitionName = sanitizeStudioBg3dSkpName(current.raw.definitionName) ?? rawName;
    const layer = sanitizeStudioBg3dSkpName(current.raw.layer) ?? "Layer0";

    const matrix = isUnknownArray(current.raw.matrix)
      ? current.raw.matrix.filter((n): n is number => typeof n === "number")
      : [];
    const decomposed = decomposeGlTFColumnMajorMatrix16(matrix);

    const posMm = readVec3Tuple(current.raw.positionMm);
    const positionMeters: StudioBg3dVec3 = matrix.length >= 16
      ? decomposed.position
      : posMm
        ? Object.freeze([round6(posMm[0] / 1000), round6(posMm[1] / 1000), round6(posMm[2] / 1000)])
        : [0, 0, 0];

    const properties = sanitizeFlatPropMap(current.raw.properties);
    const attributeDictionaries: Record<string, Readonly<Record<string, string | number | boolean>>> = {};
    if (isRecord(current.raw.attributeDictionaries)) {
      for (const [dictName, dictVal] of Object.entries(current.raw.attributeDictionaries)) {
        if (dictName === "__proto__" || dictName === "constructor" || dictName === "prototype") continue;
        attributeDictionaries[dictName] = sanitizeFlatPropMap(dictVal);
      }
    }

    const mergedDynamicProps = {
      ...(attributeDictionaries.dynamic_attributes ?? {}),
      ...properties,
    };

    const dynamicComponentCandidate = inferDynamicComponentFromSkpNode(
      nodeId,
      rawName,
      definitionName,
      mergedDynamicProps,
    );
    if (dynamicComponentCandidate) {
      dynamicComponents.push(dynamicComponentCandidate);
    }

    nodes.push(Object.freeze({
      id: nodeId,
      name: rawName,
      definitionName,
      layer,
      parentId: current.parentId,
      positionMeters,
      rotationRad: decomposed.rotation,
      scale: decomposed.scale,
      guid: typeof current.raw.guid === "string" ? current.raw.guid : null,
      meshResourceId: typeof current.raw.meshResourceId === "number" ? current.raw.meshResourceId : null,
      properties,
      attributeDictionaries: Object.freeze(attributeDictionaries),
      dynamicComponentCandidate,
    }));

    const children = isUnknownArray(current.raw.children) ? current.raw.children : [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push({ raw: children[i], parentId: nodeId });
    }
  }

  return Object.freeze({
    nodes: Object.freeze(nodes),
    layerHidden: Object.freeze(layerHidden),
    dynamicComponents: Object.freeze(dynamicComponents),
  });
}

export interface StudioBg3dRestoredSkpSectionPlane {
  readonly name: string;
  readonly symbol: string;
  readonly hidden: boolean;
  /** `[nx, ny, nz, d]` in Y-up meters (`nx*x + ny*y + nz*z + d = 0`). */
  readonly planeMetersYUp: readonly [number, number, number, number];
}

export interface StudioBg3dRestoredSkpDimension {
  readonly text: string;
  readonly hidden: boolean;
  readonly startMeters: StudioBg3dVec3;
  readonly endMeters: StudioBg3dVec3;
  readonly offsetMeters: StudioBg3dVec3;
  readonly measuredMeters: number;
}

export interface StudioBg3dRestoredSkpLeaderText {
  readonly text: string;
  readonly hidden: boolean;
  readonly pointMeters: StudioBg3dVec3;
  readonly leaderEndMeters: StudioBg3dVec3;
}

export interface StudioBg3dRestoredSkpConstructionLine {
  readonly infinite: boolean;
  readonly pointMeters: StudioBg3dVec3;
  readonly directionYUp: StudioBg3dVec3;
  readonly startMeters: StudioBg3dVec3 | null;
  readonly endMeters: StudioBg3dVec3 | null;
}

export interface StudioBg3dRestoredSkpConstructionPoint {
  readonly positionMeters: StudioBg3dVec3;
}

export interface StudioBg3dRestoredSkpStyle {
  readonly name: string;
  readonly frontColorHex: string;
  readonly backColorHex: string;
}

export interface StudioBg3dRestoredSkpAnnotations {
  readonly sectionPlanes: readonly StudioBg3dRestoredSkpSectionPlane[];
  readonly dimensions: readonly StudioBg3dRestoredSkpDimension[];
  readonly leaderTexts: readonly StudioBg3dRestoredSkpLeaderText[];
  readonly constructionLines: readonly StudioBg3dRestoredSkpConstructionLine[];
  readonly constructionPoints: readonly StudioBg3dRestoredSkpConstructionPoint[];
  readonly styles: readonly StudioBg3dRestoredSkpStyle[];
}

/**
 * `SkpModel.root` 및 `SkpModel.styles`에서 단면 평면(SectionPlane), 치수선(Dimension),
 * 지시선 텍스트(TextEntity), 보조선(ConstructionLine), 보조점(ConstructionPoint), 스타일(Style)을 복원한다.
 */
export function restoreStudioBg3dSkpAnnotationsAndGuides(
  model: unknown,
  options: { readonly unitScaleFactor?: number } = {},
): StudioBg3dRestoredSkpAnnotations {
  if (!isRecord(model)) {
    return Object.freeze({
      sectionPlanes: Object.freeze([]),
      dimensions: Object.freeze([]),
      leaderTexts: Object.freeze([]),
      constructionLines: Object.freeze([]),
      constructionPoints: Object.freeze([]),
      styles: Object.freeze([]),
    });
  }
  const unitScale = options.unitScaleFactor ?? 1;
  const root = isRecord(model.root) ? model.root : {};

  const sectionPlanes: StudioBg3dRestoredSkpSectionPlane[] = [];
  for (const sp of isUnknownArray(root.sectionPlanes) ? root.sectionPlanes : []) {
    if (!isRecord(sp) || !isUnknownArray(sp.plane) || sp.plane.length < 4) continue;
    const a = readNumber(sp.plane[0], 0);
    const b = readNumber(sp.plane[1], 0);
    const c = readNumber(sp.plane[2], 1);
    const d = readNumber(sp.plane[3], 0);
    sectionPlanes.push(Object.freeze({
      name: sanitizeStudioBg3dSkpName(sp.name) ?? "Section Plane",
      symbol: sanitizeStudioBg3dSkpName(sp.label) ?? "1",
      hidden: sp.hidden === true,
      planeMetersYUp: skpPlaneZUpToMetersYUp([a, b, c, d], unitScale),
    }));
  }

  const dimensions: StudioBg3dRestoredSkpDimension[] = [];
  for (const dim of isUnknownArray(root.dimensions) ? root.dimensions : []) {
    if (!isRecord(dim)) continue;
    const aIn = readVec3Tuple(dim.a);
    const bIn = readVec3Tuple(dim.b);
    if (!aIn || !bIn) continue;
    const offsetIn = readVec3Tuple(dim.offset) ?? [0, 0, 12];
    const startMeters = skpPointInchesZUpToMetersYUp(aIn, unitScale);
    const endMeters = skpPointInchesZUpToMetersYUp(bIn, unitScale);
    const offsetMeters = skpPointInchesZUpToMetersYUp(offsetIn, unitScale);
    const measuredMeters = round6(
      Math.hypot(
        endMeters[0] - startMeters[0],
        endMeters[1] - startMeters[1],
        endMeters[2] - startMeters[2],
      ),
    );
    const rawText = sanitizeStudioBg3dSkpName(dim.text) ?? `${measuredMeters.toFixed(2)} m`;
    dimensions.push(Object.freeze({
      text: rawText,
      hidden: dim.hidden === true,
      startMeters,
      endMeters,
      offsetMeters,
      measuredMeters,
    }));
  }

  const leaderTexts: StudioBg3dRestoredSkpLeaderText[] = [];
  for (const txt of isUnknownArray(root.texts) ? root.texts : []) {
    if (!isRecord(txt)) continue;
    const ptIn = readVec3Tuple(txt.point);
    if (!ptIn) continue;
    const leaderIn = readVec3Tuple(txt.leader) ?? [0, 0, 0];
    const pointMeters = skpPointInchesZUpToMetersYUp(ptIn, unitScale);
    const deltaMeters = skpPointInchesZUpToMetersYUp(leaderIn, unitScale);
    const leaderEndMeters: StudioBg3dVec3 = Object.freeze([
      round6(pointMeters[0] + deltaMeters[0]),
      round6(pointMeters[1] + deltaMeters[1]),
      round6(pointMeters[2] + deltaMeters[2]),
    ]);
    leaderTexts.push(Object.freeze({
      text: sanitizeStudioBg3dSkpName(txt.text) ?? "Label",
      hidden: txt.hidden === true,
      pointMeters,
      leaderEndMeters,
    }));
  }

  const constructionLines: StudioBg3dRestoredSkpConstructionLine[] = [];
  for (const cline of isUnknownArray(root.constructionLines) ? root.constructionLines : []) {
    if (!isRecord(cline)) continue;
    const ptIn = readVec3Tuple(cline.point) ?? [0, 0, 0];
    const dirIn = readVec3Tuple(cline.direction) ?? [1, 0, 0];
    const startIn = readVec3Tuple(cline.start);
    const endIn = readVec3Tuple(cline.end);
    const isSentinel = (v: readonly [number, number, number] | null): boolean =>
      v === null ||
      Math.abs(v[0]) >= SKP_INFINITE_LINE_SENTINEL_THRESHOLD ||
      Math.abs(v[1]) >= SKP_INFINITE_LINE_SENTINEL_THRESHOLD ||
      Math.abs(v[2]) >= SKP_INFINITE_LINE_SENTINEL_THRESHOLD;
    const infinite = isSentinel(startIn) || isSentinel(endIn);
    constructionLines.push(Object.freeze({
      infinite,
      pointMeters: skpPointInchesZUpToMetersYUp(ptIn, unitScale),
      directionYUp: skpDirectionZUpToYUp(dirIn, [1, 0, 0]),
      startMeters: !infinite && startIn ? skpPointInchesZUpToMetersYUp(startIn, unitScale) : null,
      endMeters: !infinite && endIn ? skpPointInchesZUpToMetersYUp(endIn, unitScale) : null,
    }));
  }

  const constructionPoints: StudioBg3dRestoredSkpConstructionPoint[] = [];
  for (const cpt of isUnknownArray(root.constructionPoints) ? root.constructionPoints : []) {
    if (!isRecord(cpt)) continue;
    const posIn = readVec3Tuple(cpt.position);
    if (!posIn) continue;
    constructionPoints.push(Object.freeze({
      positionMeters: skpPointInchesZUpToMetersYUp(posIn, unitScale),
    }));
  }

  const styles: StudioBg3dRestoredSkpStyle[] = [];
  for (const style of isUnknownArray(model.styles) ? model.styles : []) {
    if (!isRecord(style)) continue;
    styles.push(Object.freeze({
      name: sanitizeStudioBg3dSkpName(style.name) ?? "Default Style",
      frontColorHex: skpColorToHex(style.frontColor, "#ffffff"),
      backColorHex: skpColorToHex(style.backColor, "#647696"),
    }));
  }

  return Object.freeze({
    sectionPlanes: Object.freeze(sectionPlanes),
    dimensions: Object.freeze(dimensions),
    leaderTexts: Object.freeze(leaderTexts),
    constructionLines: Object.freeze(constructionLines),
    constructionPoints: Object.freeze(constructionPoints),
    styles: Object.freeze(styles),
  });
}

export interface StudioBg3dSkpThumbnailSummary {
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly source: "model" | "preview";
  readonly byteSize: number;
  readonly data: Uint8Array;
}

/**
 * OpenSKP `extractThumbnail(buffer)` 결과를 검증·정규화한다.
 */
export function extractStudioBg3dSkpThumbnailSummary(
  thumbnailResult: unknown,
): StudioBg3dSkpThumbnailSummary | null {
  if (!isRecord(thumbnailResult)) return null;
  const data = thumbnailResult.data;
  if (!(data instanceof Uint8Array) || data.byteLength === 0) return null;
  const mimeType = thumbnailResult.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const width = Math.max(1, Math.round(readNumber(thumbnailResult.width, 128)));
  const height = Math.max(1, Math.round(readNumber(thumbnailResult.height, 128)));
  const source = thumbnailResult.source === "preview" ? "preview" : "model";
  return Object.freeze({
    mimeType,
    width,
    height,
    source,
    byteSize: data.byteLength,
    data,
  });
}
