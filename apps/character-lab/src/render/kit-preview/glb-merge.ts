/**
 * 여러 GLB(베이스 + 파츠)를 한 GLB로 병합한다(순수, 바이트·JSON 수준).
 *
 * 앱 엔진은 아직 `kit` 소스(KT-04)가 없어 GLB 하나만 받는다. 뷰어는 앱 로더와 같은 의미로 조립한다:
 * 계약 §4.3 — 모든 파츠 스킨을 **베이스 스켈레톤에 본 이름 기준으로 바인딩**한다.
 *   - `skin.joints` 이름 배열이 원소별로 같으면 `skin`만 베이스 것으로 바꾼다.
 *   - 이름 집합은 같고 순서만 다르면 `JOINTS_0`을 베이스 인덱스로 재매핑한다(경고 `kit-joint-order`).
 *   - 집합이 다르거나(누락·여분) 부모가 다르면 `kit-joint-mismatch` LabFailure로 **전체를 실패**시킨다(무음 대체 금지).
 *   - 레스트 포즈(IBM)가 다르면 경고 `kit-rest-mismatch`(사탕 포장지 변형의 흔한 원인).
 * 파츠 GLB의 스켈레톤·관절 노드는 가져오지 않는다. 필요한 bufferView만 BIN에 덧붙여(4바이트 정렬) 합친다.
 * 스킨이 아닌 파츠 메시는 키트 규약 위반이므로 경고(`kit-skin-invalid`)하고 월드 변환을 구워 장면 루트에 둔다.
 * `TS_Mouth`처럼 프리미티브마다 역할이 다른 메시는 노드로 쪼갠다(앱 패키지 로더는 `_primitive<i>`를 한 파츠로 묶기 때문).
 */
import { failVisible } from "../../contracts";
import { mat4FromTRS, mat4Multiply } from "../../shared/math";

import { buildParentMap, nodeName } from "./glb-inspect";
import { accessorFitsBin, accessorLayout, arrayField, asNumber, asString, dataViewOf, ensureArrayField, isJsonObject, objectAt, readAccessorValue, writeAccessorInteger } from "./glb-io";
import { makeWarning } from "./warnings";

import type { GlbSummary } from "./glb-inspect";
import type { GlbDocument, JsonObject, JsonValue } from "./glb-io";
import type { PrimitiveSplitRule } from "./kit-roles";
import type { PreviewWarning } from "./warnings";

export interface MergeInput {
  readonly label: string;
  readonly doc: GlbDocument;
  readonly summary: GlbSummary;
}

export interface MergePartReport {
  readonly label: string;
  readonly meshNodes: readonly string[];
  /** 파츠 스킨의 관절 순서: same = 베이스와 같음, reordered = 재매핑함, none = 스킨 메시 없음 */
  readonly jointOrder: "same" | "reordered" | "none";
  readonly skinnedNodes: number;
  readonly unskinnedNodes: number;
}

export interface MergeSplit {
  readonly node: string;
  readonly into: readonly string[];
}

export interface MergeReport {
  readonly parts: readonly MergePartReport[];
  readonly splits: readonly MergeSplit[];
  /** 병합·분할로 베이스 GLB와 달라졌는지(false면 원본 바이트를 그대로 써도 된다) */
  readonly changed: boolean;
  readonly warnings: readonly PreviewWarning[];
}

export interface MergeOutcome {
  readonly doc: GlbDocument;
  readonly report: MergeReport;
}

const MAX_LISTED = 5;
const IBM_TOLERANCE = 1e-3;

function listNames(names: readonly string[]): string {
  return `${names.slice(0, MAX_LISTED).join(", ")}${names.length > MAX_LISTED ? ` 외 ${names.length - MAX_LISTED}개` : ""}`;
}

// ---------------------------------------------------------------- BIN 덧붙이기

class ByteSink {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  constructor(initial: Uint8Array) {
    this.append(initial);
  }

  /** 바이트를 덧붙이고(4바이트 정렬) 시작 오프셋을 돌려준다. */
  append(bytes: Uint8Array): number {
    const offset = this.length;
    const padded = (bytes.byteLength + 3) & ~3;
    const chunk = new Uint8Array(padded);
    chunk.set(bytes);
    this.chunks.push(chunk);
    this.length += padded;
    return offset;
  }

  get byteLength(): number {
    return this.length;
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.length);
    let cursor = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return out;
  }
}

// ---------------------------------------------------------------- 자원 복사

interface CopyContext {
  readonly label: string;
  readonly srcJson: JsonObject;
  readonly srcBin: Uint8Array;
  readonly dstJson: JsonObject;
  readonly sink: ByteSink;
  readonly bufferViews: Map<number, number>;
  readonly accessors: Map<number, number>;
  readonly images: Map<number, number>;
  readonly samplers: Map<number, number>;
  readonly textures: Map<number, number>;
  readonly materials: Map<number, number>;
  readonly meshes: Map<number, number>;
}

function createCopyContext(label: string, src: GlbDocument, dstJson: JsonObject, sink: ByteSink): CopyContext {
  return { label, srcJson: src.json, srcBin: src.bin, dstJson, sink, bufferViews: new Map(), accessors: new Map(), images: new Map(), samplers: new Map(), textures: new Map(), materials: new Map(), meshes: new Map() };
}

function clone<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

function append(ctx: CopyContext, key: string, value: JsonObject): number {
  const list = ensureArrayField(ctx.dstJson, key);
  list.push(value);
  return list.length - 1;
}

function copyBufferView(ctx: CopyContext, index: number): number {
  const known = ctx.bufferViews.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "bufferViews"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 bufferView ${index}를 참조합니다.`);
  if ((asNumber(source.buffer) ?? 0) !== 0) throw failVisible("glb-invalid", `${ctx.label}: GLB의 BIN 청크(buffer 0) 밖의 버퍼를 참조하는 bufferView ${index}는 병합할 수 없습니다.`);
  const start = asNumber(source.byteOffset) ?? 0;
  const length = asNumber(source.byteLength) ?? 0;
  if (start < 0 || start + length > ctx.srcBin.byteLength) throw failVisible("glb-invalid", `${ctx.label}: bufferView ${index}가 BIN 청크 범위를 벗어납니다(${start}+${length} > ${ctx.srcBin.byteLength}).`);
  const offset = ctx.sink.append(ctx.srcBin.subarray(start, start + length));
  const copy = clone(source);
  copy.buffer = 0;
  copy.byteOffset = offset;
  const created = append(ctx, "bufferViews", copy);
  ctx.bufferViews.set(index, created);
  return created;
}

function copyAccessor(ctx: CopyContext, index: number): number {
  const known = ctx.accessors.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "accessors"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 accessor ${index}를 참조합니다.`);
  const copy = clone(source);
  const bufferView = asNumber(copy.bufferView);
  if (bufferView !== null) copy.bufferView = copyBufferView(ctx, bufferView);
  const sparse = isJsonObject(copy.sparse) ? copy.sparse : null;
  if (sparse) {
    for (const key of ["indices", "values"]) {
      const part = sparse[key];
      const view = isJsonObject(part) ? asNumber(part.bufferView) : null;
      if (isJsonObject(part) && view !== null) part.bufferView = copyBufferView(ctx, view);
    }
  }
  const created = append(ctx, "accessors", copy);
  ctx.accessors.set(index, created);
  return created;
}

function copySampler(ctx: CopyContext, index: number): number {
  const known = ctx.samplers.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "samplers"), index);
  const created = append(ctx, "samplers", source ? clone(source) : {});
  ctx.samplers.set(index, created);
  return created;
}

function copyImage(ctx: CopyContext, index: number): number {
  const known = ctx.images.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "images"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 image ${index}를 참조합니다.`);
  const copy = clone(source);
  const bufferView = asNumber(copy.bufferView);
  if (bufferView !== null) copy.bufferView = copyBufferView(ctx, bufferView);
  const created = append(ctx, "images", copy);
  ctx.images.set(index, created);
  return created;
}

function copyTexture(ctx: CopyContext, index: number): number {
  const known = ctx.textures.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "textures"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 texture ${index}를 참조합니다.`);
  const copy = clone(source);
  const image = asNumber(copy.source);
  if (image !== null) copy.source = copyImage(ctx, image);
  const sampler = asNumber(copy.sampler);
  if (sampler !== null) copy.sampler = copySampler(ctx, sampler);
  const created = append(ctx, "textures", copy);
  ctx.textures.set(index, created);
  return created;
}

/** 재질 JSON 안의 모든 `…Texture: {index}`(확장 재질 포함)를 새 texture 인덱스로 바꾼다. */
function remapTextureRefs(ctx: CopyContext, value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) remapTextureRefs(ctx, item);
    return;
  }
  if (!isJsonObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "extras") continue;
    if (key.endsWith("Texture") && isJsonObject(child) && asNumber(child.index) !== null) {
      child.index = copyTexture(ctx, asNumber(child.index) ?? 0);
    } else {
      remapTextureRefs(ctx, child);
    }
  }
}

function copyMaterial(ctx: CopyContext, index: number): number {
  const known = ctx.materials.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "materials"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 material ${index}를 참조합니다.`);
  const copy = clone(source);
  remapTextureRefs(ctx, copy);
  const created = append(ctx, "materials", copy);
  ctx.materials.set(index, created);
  return created;
}

function copyMesh(ctx: CopyContext, index: number): number {
  const known = ctx.meshes.get(index);
  if (known !== undefined) return known;
  const source = objectAt(arrayField(ctx.srcJson, "meshes"), index);
  if (!source) throw failVisible("glb-invalid", `${ctx.label}: 존재하지 않는 mesh ${index}를 참조합니다.`);
  const copy = clone(source);
  for (const primitive of arrayField(copy, "primitives")) {
    if (!isJsonObject(primitive)) continue;
    if (isJsonObject(primitive.attributes)) {
      for (const [semantic, accessor] of Object.entries(primitive.attributes)) {
        const accessorIndex = asNumber(accessor);
        if (accessorIndex !== null) primitive.attributes[semantic] = copyAccessor(ctx, accessorIndex);
      }
    }
    const indices = asNumber(primitive.indices);
    if (indices !== null) primitive.indices = copyAccessor(ctx, indices);
    const material = asNumber(primitive.material);
    if (material !== null) primitive.material = copyMaterial(ctx, material);
    for (const target of arrayField(primitive, "targets")) {
      if (!isJsonObject(target)) continue;
      for (const [semantic, accessor] of Object.entries(target)) {
        const accessorIndex = asNumber(accessor);
        if (accessorIndex !== null) target[semantic] = copyAccessor(ctx, accessorIndex);
      }
    }
  }
  const created = append(ctx, "meshes", copy);
  ctx.meshes.set(index, created);
  return created;
}

// ---------------------------------------------------------------- 스킨 바인딩

interface SkinBinding {
  readonly order: "same" | "reordered";
  /** 파츠 joint 인덱스 → 베이스 joint 인덱스 */
  readonly map: readonly number[];
}

function jointParentNames(json: JsonObject, skinIndex: number): Map<string, string | null> {
  const nodes = arrayField(json, "nodes");
  const parents = buildParentMap(json);
  const skin = objectAt(arrayField(json, "skins"), skinIndex);
  const result = new Map<string, string | null>();
  if (!skin) return result;
  for (const joint of arrayField(skin, "joints")) {
    const jointIndex = asNumber(joint);
    const node = jointIndex === null ? null : objectAt(nodes, jointIndex);
    if (!node || jointIndex === null) continue;
    const parentIndex = parents.get(jointIndex);
    const parent = parentIndex === undefined ? null : objectAt(nodes, parentIndex);
    result.set(nodeName(node, jointIndex), parent && parentIndex !== undefined ? nodeName(parent, parentIndex) : null);
  }
  return result;
}

function readInverseBindMatrices(doc: GlbDocument, skinIndex: number): Float64Array | null {
  const skin = objectAt(arrayField(doc.json, "skins"), skinIndex);
  const accessor = skin ? asNumber(skin.inverseBindMatrices) : null;
  if (accessor === null) return null;
  const layout = accessorLayout(doc.json, accessor);
  if (!layout || layout.components !== 16 || !accessorFitsBin(layout, doc.bin.byteLength)) return null;
  const view = dataViewOf(doc.bin);
  const out = new Float64Array(layout.count * 16);
  for (let element = 0; element < layout.count; element += 1) for (let component = 0; component < 16; component += 1) out[element * 16 + component] = readAccessorValue(view, layout, element, component);
  return out;
}

/** 파츠 스킨을 베이스 스킨에 이름 기준으로 바인딩한다. 집합·부모가 다르면 `kit-joint-mismatch`로 throw. */
function bindSkin(base: MergeInput, baseSkinIndex: number, part: MergeInput, partSkinIndex: number, warnings: PreviewWarning[]): SkinBinding {
  const baseJoints = base.summary.skins.find((skin) => skin.index === baseSkinIndex)?.joints ?? [];
  const partJoints = part.summary.skins.find((skin) => skin.index === partSkinIndex)?.joints ?? [];
  const baseIndexByName = new Map(baseJoints.map((name, index) => [name, index] as const));
  const missingInBase = partJoints.filter((name) => !baseIndexByName.has(name));
  const partSet = new Set(partJoints);
  const missingInPart = baseJoints.filter((name) => !partSet.has(name));
  if (missingInBase.length > 0 || missingInPart.length > 0 || partJoints.length !== baseJoints.length) {
    const details = [
      missingInPart.length > 0 ? `파츠에 없는 베이스 관절 ${missingInPart.length}개(${listNames(missingInPart)})` : null,
      missingInBase.length > 0 ? `베이스에 없는 파츠 관절 ${missingInBase.length}개(${listNames(missingInBase)})` : null,
      partJoints.length !== baseJoints.length ? `관절 수 ${partJoints.length} ≠ ${baseJoints.length}` : null,
    ].filter((text): text is string => text !== null);
    throw failVisible("kit-joint-mismatch", `파츠 '${part.label}'의 skin.joints가 베이스 '${base.label}'와 다릅니다: ${details.join("; ")}. 모든 GLB는 같은 관절 이름 집합(68개)을 싣고 베이스 스켈레톤에 바인딩돼야 합니다.`);
  }
  // 부모 일치
  const baseParents = jointParentNames(base.doc.json, baseSkinIndex);
  const partParents = jointParentNames(part.doc.json, partSkinIndex);
  const parentMismatch = partJoints.filter((name) => (partParents.get(name) ?? null) !== (baseParents.get(name) ?? null));
  if (parentMismatch.length > 0) {
    const first = parentMismatch.slice(0, MAX_LISTED).map((name) => `${name}(파츠 부모 ${partParents.get(name) ?? "없음"} ≠ 베이스 부모 ${baseParents.get(name) ?? "없음"})`);
    throw failVisible("kit-joint-mismatch", `파츠 '${part.label}'의 관절 부모가 베이스와 다릅니다: ${first.join(", ")}${parentMismatch.length > MAX_LISTED ? ` 외 ${parentMismatch.length - MAX_LISTED}개` : ""}.`);
  }
  const map = partJoints.map((name) => baseIndexByName.get(name) ?? 0);
  const order = map.every((target, index) => target === index) ? "same" : "reordered";
  if (order === "reordered") {
    warnings.push(makeWarning(part.label, "kit-joint-order", `skin.joints 순서가 베이스와 달라 JOINTS_0을 베이스 인덱스로 재매핑했습니다. 키트 빌더는 순서를 같게 내보내야 합니다(앱 로더는 방어용으로만 재매핑).`));
  }
  // 레스트 포즈(IBM) 대조
  const baseIbm = readInverseBindMatrices(base.doc, baseSkinIndex);
  const partIbm = readInverseBindMatrices(part.doc, partSkinIndex);
  if (baseIbm && partIbm) {
    const off: string[] = [];
    let worst = 0;
    partJoints.forEach((name, partIndex) => {
      const baseIndex = map[partIndex] ?? 0;
      let diff = 0;
      for (let component = 0; component < 16; component += 1) diff = Math.max(diff, Math.abs((partIbm[partIndex * 16 + component] ?? 0) - (baseIbm[baseIndex * 16 + component] ?? 0)));
      if (diff > IBM_TOLERANCE) {
        off.push(name);
        worst = Math.max(worst, diff);
      }
    });
    if (off.length > 0) warnings.push(makeWarning(part.label, "kit-rest-mismatch", `레스트 포즈(inverseBindMatrices)가 베이스와 다른 관절이 ${off.length}개입니다(최대 차이 ${worst.toFixed(4)}; ${listNames(off)}). 파츠가 다른 자세·크기에서 스킨됐다면 포즈에서 찢어집니다.`));
  } else if (!partIbm) {
    warnings.push(makeWarning(part.label, "kit-rest-unchecked", "파츠 skin에 inverseBindMatrices가 없어 레스트 포즈를 대조하지 못했습니다.", "info"));
  }
  return { order, map };
}

/** 파츠 BIN 사본에서 JOINTS_0(·JOINTS_1) 값을 베이스 인덱스로 제자리 재매핑한다. */
export function remapJointAccessors(json: JsonObject, bin: Uint8Array, mesh: JsonObject, map: readonly number[], done: Set<number>): number {
  const view = dataViewOf(bin);
  let remapped = 0;
  for (const primitive of arrayField(mesh, "primitives")) {
    if (!isJsonObject(primitive) || !isJsonObject(primitive.attributes)) continue;
    for (const semantic of ["JOINTS_0", "JOINTS_1"]) {
      const accessor = asNumber(primitive.attributes[semantic]);
      if (accessor === null || done.has(accessor)) continue;
      done.add(accessor);
      const layout = accessorLayout(json, accessor);
      if (!layout || !accessorFitsBin(layout, bin.byteLength)) throw failVisible("kit-skin-invalid", `JOINTS accessor ${accessor}를 읽을 수 없어(희소 accessor이거나 범위 밖) 재매핑하지 못했습니다.`);
      for (let element = 0; element < layout.count; element += 1) {
        for (let component = 0; component < layout.components; component += 1) {
          const value = readAccessorValue(view, layout, element, component);
          writeAccessorInteger(view, layout, element, component, map[value] ?? 0);
        }
      }
      remapped += layout.count;
    }
  }
  return remapped;
}

// ---------------------------------------------------------------- 노드 변환

function nodeMatrix(node: JsonObject): Float32Array {
  const matrix = node.matrix;
  if (Array.isArray(matrix) && matrix.length === 16 && matrix.every((value) => typeof value === "number")) return Float32Array.from(matrix as number[]);
  const t = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
  const r = Array.isArray(node.rotation) ? node.rotation : [0, 0, 0, 1];
  const s = Array.isArray(node.scale) ? node.scale : [1, 1, 1];
  const num = (list: readonly JsonValue[], index: number, fallback: number): number => (typeof list[index] === "number" ? (list[index] as number) : fallback);
  return mat4FromTRS([num(t, 0, 0), num(t, 1, 0), num(t, 2, 0)], [num(r, 0, 0), num(r, 1, 0), num(r, 2, 0), num(r, 3, 1)], [num(s, 0, 1), num(s, 1, 1), num(s, 2, 1)]);
}

/** 노드의 월드 행렬(조상 변환 누적). */
function worldMatrix(json: JsonObject, nodeIndex: number): Float32Array {
  const nodes = arrayField(json, "nodes");
  const parents = buildParentMap(json);
  const chain: number[] = [];
  const visited = new Set<number>();
  let cursor: number | undefined = nodeIndex;
  while (cursor !== undefined && !visited.has(cursor)) {
    visited.add(cursor);
    chain.unshift(cursor);
    cursor = parents.get(cursor);
  }
  let world: Float32Array | null = null;
  for (const index of chain) {
    const node = objectAt(nodes, index);
    if (!node) continue;
    const local = nodeMatrix(node);
    world = world ? mat4Multiply(world, local) : local;
  }
  return world ?? nodeMatrix({});
}

// ---------------------------------------------------------------- 병합

function sceneRootList(json: JsonObject): JsonValue[] {
  const scenes = ensureArrayField(json, "scenes");
  const sceneIndex = asNumber(json.scene) ?? 0;
  let scene = objectAt(scenes, sceneIndex);
  if (!scene) {
    scene = { nodes: [] };
    scenes[sceneIndex] = scene;
  }
  return ensureArrayField(scene, "nodes");
}

function unionStringArray(target: JsonObject, key: string, additions: readonly string[]): void {
  if (additions.length === 0) return;
  const list = ensureArrayField(target, key);
  for (const name of additions) if (!list.includes(name)) list.push(name);
}

/** 베이스 GLB의 메시 노드 중 스킨을 쓰는 첫 노드가 쓰는 skin 인덱스(없으면 첫 skin, 스킨이 없으면 null) */
function pickBaseSkin(base: MergeInput): number | null {
  const skinned = base.summary.meshNodes.find((mesh) => mesh.skinIndex !== null);
  return skinned?.skinIndex ?? base.summary.skins[0]?.index ?? null;
}

/**
 * 베이스와 파츠를 병합한다. 파츠가 없으면 분할만 적용한다. 실패(`kit-joint-mismatch` 등)는 LabFailure로 throw한다.
 * 입력 문서는 고치지 않는다(복제본을 만든다).
 */
export function mergeGlbs(inputs: readonly MergeInput[], splitRules: Readonly<Record<string, readonly PrimitiveSplitRule[]>>): MergeOutcome {
  const [base, ...parts] = inputs;
  if (!base) throw failVisible("kit-no-base", "병합할 GLB가 없습니다. 첫 번째 --glb가 베이스입니다.");
  const warnings: PreviewWarning[] = [];
  const dst: GlbDocument = { json: structuredClone(base.doc.json), bin: new Uint8Array(0) };
  const sink = new ByteSink(base.doc.bin);
  const baseSkin = pickBaseSkin(base);
  const nodes = ensureArrayField(dst.json, "nodes");
  const parentOfBase = buildParentMap(dst.json);
  const firstSkinned = base.summary.meshNodes.find((mesh) => mesh.skinIndex !== null);
  const skinAttachParent = firstSkinned ? parentOfBase.get(firstSkinned.nodeIndex) : undefined;
  const meshNodeNames = new Set(base.summary.meshNodes.map((mesh) => mesh.node));
  const reports: MergePartReport[] = [];
  let changed = false;

  for (const part of parts) {
    // 입력 순서와 관계없이 이름 충돌을 먼저 모두 검사한다(부분 병합 상태를 남기지 않는다).
    const conflicts = part.summary.meshNodes.filter((mesh) => meshNodeNames.has(mesh.node)).map((mesh) => mesh.node);
    if (conflicts.length > 0) throw failVisible("kit-mesh-duplicate", `파츠 '${part.label}'의 메시 노드 이름이 이미 장면에 있습니다: ${listNames(conflicts)}. 같은 슬롯의 파츠를 둘 이상 올렸거나 베이스가 파츠 메시를 이미 싣고 있습니다.`);
    if (part.summary.meshNodes.length === 0) warnings.push(makeWarning(part.label, "kit-part-empty", "파츠 GLB에 메시 노드가 없습니다.", "warn"));

    // 파츠 BIN 사본(JOINTS 재매핑을 제자리에서 하므로 원본을 건드리지 않는다)
    const work: GlbDocument = { json: part.doc.json, bin: new Uint8Array(part.doc.bin) };
    const ctx = createCopyContext(part.label, work, dst.json, sink);
    const bindings = new Map<number, SkinBinding>();
    const remappedAccessors = new Set<number>();
    let order: MergePartReport["jointOrder"] = "none";
    let skinnedNodes = 0;
    let unskinnedNodes = 0;
    const added: string[] = [];

    for (const meshNode of part.summary.meshNodes) {
      const sourceNode = objectAt(arrayField(part.doc.json, "nodes"), meshNode.nodeIndex);
      const sourceMeshIndex = sourceNode ? asNumber(sourceNode.mesh) : null;
      if (!sourceNode || sourceMeshIndex === null) continue;
      const newNode: JsonObject = { name: meshNode.node };
      if (meshNode.skinned && meshNode.skinIndex !== null) {
        if (baseSkin === null) throw failVisible("kit-joint-mismatch", `베이스 '${base.label}'에 스킨이 없어 파츠 '${part.label}'의 스킨 메시 '${meshNode.node}'를 바인딩할 수 없습니다. 베이스는 68관절 스켈레톤을 싣고 스킨돼야 합니다.`);
        let binding = bindings.get(meshNode.skinIndex);
        if (!binding) {
          binding = bindSkin(base, baseSkin, part, meshNode.skinIndex, warnings);
          bindings.set(meshNode.skinIndex, binding);
        }
        if (binding.order === "reordered") order = "reordered";
        else if (order === "none") order = "same";
        const sourceMesh = objectAt(arrayField(part.doc.json, "meshes"), sourceMeshIndex);
        if (binding.order === "reordered" && sourceMesh) remapJointAccessors(part.doc.json, work.bin, sourceMesh, binding.map, remappedAccessors);
        newNode.skin = baseSkin;
        for (const key of ["translation", "rotation", "scale", "matrix"]) if (sourceNode[key] !== undefined) newNode[key] = clone(sourceNode[key] as JsonValue);
        if (!meshNode.chainTransformIdentity) warnings.push(makeWarning(part.label, "kit-transform-invalid", `스킨 메시 '${meshNode.node}'(또는 조상)의 변환이 항등이 아닙니다. 계약은 Armature 루트와 스킨 메시 노드의 변환을 항등·스케일 1로 요구합니다.`));
        skinnedNodes += 1;
      } else {
        // 스킨이 아닌 메시: 규약 위반. 월드 변환을 구워 장면 루트에 둔다(포즈를 따라가지 않는다).
        warnings.push(makeWarning(part.label, "kit-skin-invalid", `메시 '${meshNode.node}'가 스키닝되지 않았습니다(키트 규약 위반: 헤드 본 100%여도 노드 부착 금지). 앱 로더는 이 파츠를 거부합니다. 뷰어는 월드 변환을 구워 장면 루트에 고정해 보여 주므로 포즈를 따라가지 않습니다.`, "error"));
        newNode.matrix = Array.from(worldMatrix(part.doc.json, meshNode.nodeIndex));
        unskinnedNodes += 1;
      }
      newNode.mesh = copyMesh(ctx, sourceMeshIndex);
      const created = nodes.length;
      nodes.push(newNode);
      if (newNode.skin !== undefined && skinAttachParent !== undefined) {
        const parent = objectAt(nodes, skinAttachParent);
        if (parent) ensureArrayField(parent, "children").push(created);
      } else {
        sceneRootList(dst.json).push(created);
      }
      meshNodeNames.add(meshNode.node);
      added.push(meshNode.node);
    }
    unionStringArray(dst.json, "extensionsUsed", part.summary.extensionsUsed);
    unionStringArray(dst.json, "extensionsRequired", part.summary.extensionsRequired);
    reports.push({ label: part.label, meshNodes: added, jointOrder: order, skinnedNodes, unskinnedNodes });
    if (added.length > 0) changed = true;
  }

  const splits = splitMultiPrimitiveNodes(dst.json, splitRules, base.label, warnings);
  if (splits.length > 0) changed = true;

  dst.bin = sink.finish();
  dst.json.buffers = [{ byteLength: dst.bin.byteLength }];
  return { doc: dst, report: { parts: reports, splits, changed, warnings } };
}

// ---------------------------------------------------------------- 프리미티브 분할

/**
 * 규칙에 이름이 있는 메시 노드(예: `TS_Mouth`)를 프리미티브마다 한 노드로 쪼갠다: `<이름>_<접미>`.
 * 프리미티브 수가 규칙 수와 다르면 쪼개지 않고 경고한다(어느 프리미티브가 어느 역할인지 알 수 없다).
 */
export function splitMultiPrimitiveNodes(json: JsonObject, rules: Readonly<Record<string, readonly PrimitiveSplitRule[]>>, source: string, warnings: PreviewWarning[]): MergeSplit[] {
  const nodes = ensureArrayField(json, "nodes");
  const meshes = ensureArrayField(json, "meshes");
  const splits: MergeSplit[] = [];
  const total = nodes.length;
  for (let nodeIndex = 0; nodeIndex < total; nodeIndex += 1) {
    const node = objectAt(nodes, nodeIndex);
    if (!node) continue;
    const name = asString(node.name);
    const rule = name ? rules[name] : undefined;
    const meshIndex = asNumber(node.mesh);
    const mesh = meshIndex === null ? null : objectAt(meshes, meshIndex);
    if (!name || !rule || !mesh) continue;
    const primitives = arrayField(mesh, "primitives");
    if (primitives.length === 1) {
      warnings.push(makeWarning(source, "kit-mouth-primitives", `메시 '${name}'는 프리미티브가 1개뿐이라 teeth/tongue로 나누지 못했습니다. 계약은 프리미티브 2개(0 = teeth, 1 = tongue)를 요구합니다. 하나의 teeth 파츠로 그립니다.`));
      continue;
    }
    if (primitives.length !== rule.length) {
      warnings.push(makeWarning(source, "kit-mouth-primitives", `메시 '${name}'의 프리미티브가 ${primitives.length}개라 규칙(${rule.length}개)과 달라 나누지 못했습니다.`));
      continue;
    }
    const parentIndex = buildParentMap(json).get(nodeIndex);
    const into: string[] = [];
    rule.forEach((entry, primitiveIndex) => {
      const splitName = `${name}_${entry.suffix}`;
      const primitive = primitives[primitiveIndex];
      const pieceMesh: JsonObject = { ...clone(mesh), name: `${asString(mesh.name) ?? name}_${entry.suffix}`, primitives: [clone(primitive ?? {})] };
      meshes.push(pieceMesh);
      const pieceMeshIndex = meshes.length - 1;
      let target: JsonObject;
      if (primitiveIndex === 0) {
        target = node;
      } else {
        target = {};
        for (const key of ["skin", "translation", "rotation", "scale", "matrix"]) if (node[key] !== undefined) target[key] = clone(node[key] as JsonValue);
        nodes.push(target);
        const created = nodes.length - 1;
        if (parentIndex !== undefined) {
          const parent = objectAt(nodes, parentIndex);
          if (parent) ensureArrayField(parent, "children").push(created);
        } else {
          sceneRootList(json).push(created);
        }
      }
      target.name = splitName;
      target.mesh = pieceMeshIndex;
      into.push(splitName);
    });
    splits.push({ node: name, into });
  }
  return splits;
}
