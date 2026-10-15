/**
 * openskp 가 돌려준 값에서 보고서에 필요한 사실만 안전하게 읽어 낸다.
 *
 * openskp 의 반환 타입(SkpModel, SkpScene)은 설치본마다 달라질 수 있어 이 모듈은 값을 unknown 으로
 * 받아 필요한 속성만 타입 가드로 읽는다. 읽지 못한 항목은 건너뛰며 추측해서 채우지 않는다.
 * 구조 근거는 openskp 1.3.0 타입 정의(SkpModel, Definition, Instance, Layer, Material, Page, SkpScene,
 * InstanceNode)이다.
 */

import {
  buildStudioBg3dSkpNameList,
  sanitizeStudioBg3dSkpName,
  STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST,
} from "./studio-bg3d-skp-report-builder";
import { describeStudioBg3dSkpDeclaredUnits, type StudioBg3dSkpDeclaredUnits } from "./studio-bg3d-skp-unit";

import type { StudioBg3dSkpReportNameList } from "./studio-bg3d-skp-import-report";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

/** Array.isArray 는 any[] 로 좁히므로 unknown 배열로 좁히는 가드를 따로 둔다. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function toArray(value: unknown): readonly unknown[] {
  return isUnknownArray(value) ? value : [];
}

/** Map 이면 값 목록, 배열이면 그대로. openskp 의 definitions 는 Map<number, Definition> 이다. */
function toValues(value: unknown): readonly unknown[] {
  if (value instanceof Map) {
    const values: unknown[] = Array.from(value.values());
    return values;
  }
  return toArray(value);
}

/** PNG(89 50 4E 47) 또는 JPEG(FF D8 FF) 바이트인지 본다. glTF 는 이 둘만 담을 수 있다. */
export function isStudioBg3dSkpEmbeddableImage(data: Uint8Array): boolean {
  const png = data.byteLength >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  const jpeg = data.byteLength >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  return png || jpeg;
}

export interface StudioBg3dSkpModelSummary {
  readonly declaredUnits: StudioBg3dSkpDeclaredUnits;
  /** 배치된 정의(루트 포함)의 SketchUp 면 수 합계. */
  readonly sourceFaces: number;
  readonly tagNames: readonly string[];
  readonly hiddenTagNames: readonly string[];
  readonly sceneNames: readonly string[];
  /** 배치된 정의 안에서 "숨김"으로 지정된 인스턴스 기록 수(배치 횟수로 곱하지 않음). */
  readonly hiddenInstanceCount: number;
  /** 사용 중인 재질 중 텍스처 이미지 바이트가 파일에 없는 것의 이름. */
  readonly missingTextureMaterials: readonly string[];
  /** 사용 중인 재질 중 이미지 바이트는 있으나 PNG/JPEG 가 아니라 평균 색으로 대체되는 것의 이름. */
  readonly unsupportedTextureMaterials: readonly string[];
}

interface MaterialLookup {
  get(id: number): unknown;
}

function createMaterialLookup(model: unknown): MaterialLookup {
  const byId = readProperty(model, "materialsById");
  if (byId instanceof Map) {
    return { get: (id): unknown => byId.get(id) };
  }
  const fallback = new Map<number, unknown>();
  for (const material of toArray(readProperty(model, "materials"))) {
    const id = readProperty(material, "id");
    if (typeof id === "number") fallback.set(id, material);
  }
  return { get: (id) => fallback.get(id) };
}

interface UsageScan {
  faces: number;
  hiddenInstances: number;
  readonly usedMaterialIds: Set<number>;
}

/** 루트에서 refIdx 로 닿는 정의만 한 번씩 훑어 면 수·사용 재질·숨김 인스턴스를 센다. */
function scanPlacedDefinitions(model: unknown): UsageScan {
  const scan: UsageScan = { faces: 0, hiddenInstances: 0, usedMaterialIds: new Set() };
  const definitionsById = new Map<unknown, unknown>();
  for (const definition of toValues(readProperty(model, "definitions"))) {
    definitionsById.set(readProperty(definition, "id"), definition);
  }
  const visited = new Set<unknown>();
  const pending: unknown[] = [readProperty(model, "root")];
  while (pending.length > 0) {
    const definition = pending.pop();
    if (definition === undefined || visited.has(definition)) continue;
    visited.add(definition);
    for (const face of toArray(readProperty(definition, "faces"))) {
      scan.faces += 1;
      for (const key of ["materialId", "backMaterialId"] as const) {
        const id = readProperty(face, key);
        if (typeof id === "number") scan.usedMaterialIds.add(id);
      }
    }
    for (const instance of toArray(readProperty(definition, "instances"))) {
      if (readProperty(instance, "hidden") === true) scan.hiddenInstances += 1;
      const materialId = readProperty(instance, "materialId");
      if (typeof materialId === "number") scan.usedMaterialIds.add(materialId);
      const target = definitionsById.get(readProperty(instance, "refIdx"));
      if (target !== undefined) pending.push(target);
    }
  }
  return scan;
}

function classifyTextures(
  model: unknown,
  usedMaterialIds: ReadonlySet<number>,
): { readonly missing: readonly string[]; readonly unsupported: readonly string[] } {
  const lookup = createMaterialLookup(model);
  const missing: string[] = [];
  const unsupported: string[] = [];
  for (const id of usedMaterialIds) {
    const material = lookup.get(id);
    const texture = readProperty(material, "texture");
    if (!isRecord(texture)) continue;
    const name = sanitizeStudioBg3dSkpName(readProperty(material, "name")) ?? `재질 ${id}`;
    const data = texture.data;
    if (!(data instanceof Uint8Array) || data.byteLength === 0) missing.push(name);
    else if (!isStudioBg3dSkpEmbeddableImage(data)) unsupported.push(name);
  }
  return { missing, unsupported };
}

/**
 * parseSkp() 결과를 요약한다. 모델이 객체가 아니면 null 이다(호출자가 metadata-unavailable 로 보고).
 */
export function summarizeOpenSkpModel(model: unknown): StudioBg3dSkpModelSummary | null {
  if (!isRecord(model)) return null;
  const scan = scanPlacedDefinitions(model);
  const layers = toArray(model.layers);
  const textures = classifyTextures(model, scan.usedMaterialIds);
  const hiddenTagNames = layers
    .filter((layer) => readProperty(layer, "hidden") === true)
    .map((layer) => sanitizeStudioBg3dSkpName(readProperty(layer, "name")))
    .filter((name): name is string => name !== null);
  return {
    declaredUnits: describeStudioBg3dSkpDeclaredUnits(model.units),
    sourceFaces: scan.faces,
    tagNames: layers.map((layer) => readProperty(layer, "name")).filter((name): name is string => typeof name === "string"),
    hiddenTagNames,
    sceneNames: toArray(model.pages).map((page) => readProperty(page, "name")).filter((name): name is string => typeof name === "string"),
    hiddenInstanceCount: scan.hiddenInstances,
    missingTextureMaterials: textures.missing,
    unsupportedTextureMaterials: textures.unsupported,
  };
}

export interface StudioBg3dSkpHierarchySummary {
  readonly components: StudioBg3dSkpReportNameList;
  /** 배치된 컴포넌트·그룹 인스턴스 수(루트 제외). */
  readonly instances: number;
  /** 배치된 개체가 쓰는 태그 이름(유효 태그, 상속 반영). */
  readonly tagNames: readonly string[];
}

/** buildScene() 의 sceneHierarchy 트리에서 배치된 컴포넌트 이름·인스턴스 수·사용 태그를 읽는다. */
export function summarizeOpenSkpHierarchy(root: unknown): StudioBg3dSkpHierarchySummary {
  if (!isRecord(root)) {
    return { components: STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST, instances: 0, tagNames: [] };
  }
  const names: unknown[] = [];
  const tags: unknown[] = [];
  let instances = 0;
  // 파일 순서(전위 순회)를 유지하려고 자식을 거꾸로 쌓는다.
  const pending: unknown[] = [...toArray(root.children)].reverse();
  while (pending.length > 0) {
    const node = pending.pop();
    if (!isRecord(node)) continue;
    instances += 1;
    const definitionName = readProperty(node, "definitionName");
    names.push(typeof definitionName === "string" && definitionName.length > 0 ? definitionName : node.name);
    tags.push(node.layer);
    // 형제가 수십만 개여도 호출 인자 한도에 걸리지 않도록 spread 대신 반복문으로 쌓는다.
    const children = toArray(node.children);
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return {
    components: buildStudioBg3dSkpNameList(names),
    instances,
    tagNames: tags.filter((tag): tag is string => typeof tag === "string"),
  };
}

/** 정의된 태그와 배치된 개체가 쓰는 태그를 합쳐 이름 목록으로 만든다. */
export function buildStudioBg3dSkpTagList(
  defined: readonly string[],
  used: readonly string[],
): StudioBg3dSkpReportNameList {
  return buildStudioBg3dSkpNameList([...defined, ...used]);
}
