import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";

type RecordValue = Record<string, unknown>;
export interface StudioRigFile {
  readonly json: RecordValue;
  readonly binary: Uint8Array<ArrayBuffer>;
}
export interface StudioRigJoint {
  readonly id: number;
  readonly name: string;
  readonly parent: string | null;
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("GLB의 골격 원장을 읽을 수 없어요.");
  return value as RecordValue;
}
function records(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) throw new Error("GLB에 골격을 편집할 자료가 없어요.");
  return value.map(record);
}
function ids(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || value.some((id) => !Number.isInteger(id) || id < 0 || id >= count))
    throw new Error("GLB의 노드 참조가 올바르지 않아요.");
  return value as number[];
}
function nodeName(node: RecordValue, id: number): string {
  return typeof node.name === "string" && node.name.trim() ? node.name : `관절 ${id + 1}`;
}
export function studioRigSkinNames(model: StudioRigFile): string[] {
  return records(model.json.skins).map((skin, index) =>
    typeof skin.name === "string" && skin.name ? skin.name : `골격 ${index + 1}`,
  );
}
export function studioRigJoints(model: StudioRigFile, skinIndex: number): StudioRigJoint[] {
  const nodes = records(model.json.nodes),
    skin = records(model.json.skins)[skinIndex];
  if (!skin) throw new Error("선택한 골격을 찾지 못했어요.");
  const joints = ids(skin.joints, nodes.length);
  if (!joints.length || new Set(joints).size !== joints.length)
    throw new Error("GLB의 관절 목록이 비었거나 중복돼요.");
  const parents = new Map<number, number>();
  nodes.forEach((node, index) => {
    for (const child of ids(node.children ?? [], nodes.length)) {
      if (parents.has(child)) throw new Error("GLB 노드에 부모가 둘 이상 있어요.");
      parents.set(child, index);
    }
  });
  return joints.map((id) => {
    const parent = parents.get(id);
    return {
      id,
      name: nodeName(nodes[id]!, id),
      parent: parent === undefined ? null : nodeName(nodes[parent]!, parent),
    };
  });
}
export function readStudioRigFile(bytes: Uint8Array): StudioRigFile {
  const { json, binary } = readStudioVrmExportGlb(bytes);
  if (
    records(json.buffers).length !== 1 ||
    records(json.buffers)[0]!.uri !== undefined ||
    records(json.images ?? []).some((image) => typeof image.uri === "string" && !image.uri.startsWith("data:"))
  )
    throw new Error("모델과 텍스처를 한 파일에 담은 GLB를 열어 주세요.");
  const model = { json, binary };
  const meshes = records(json.meshes),
    nodes = records(json.nodes);
  const bound = nodes.some(
    (node) =>
      typeof node.skin === "number" &&
      typeof node.mesh === "number" &&
      records(meshes[node.mesh]?.primitives ?? []).some((primitive) => {
        const attributes = record(primitive.attributes);
        return Number.isInteger(attributes.JOINTS_0) && Number.isInteger(attributes.WEIGHTS_0);
      }),
  );
  if (!bound) throw new Error("메시에 관절과 웨이트가 연결된 캐릭터 GLB를 열어 주세요.");
  const skinCount = studioRigSkinNames(model).length;
  if (!skinCount) throw new Error("스킨이 있는 캐릭터 GLB를 열어 주세요.");
  for (let i = 0; i < skinCount; i++) studioRigJoints(model, i);
  return model;
}
export function renameStudioRigJoint(
  model: StudioRigFile,
  skinIndex: number,
  joint: number,
  input: string,
): StudioRigFile {
  const name = input.trim(),
    nodes = records(model.json.nodes),
    joints = studioRigJoints(model, skinIndex);
  if (!name || name.length > 128 || Array.from(name).some((char) => char.charCodeAt(0) < 32))
    throw new Error("관절 이름은 1~128자로 입력해 주세요.");
  if (!joints.some((item) => item.id === joint)) throw new Error("이 골격의 관절을 선택해 주세요.");
  if (nodes.some((node, index) => index !== joint && node.name === name))
    throw new Error("이미 쓰고 있는 노드 이름이에요.");
  nodes[joint] = { ...nodes[joint], name };
  return { ...model, json: { ...model.json, nodes } };
}
function inverseBinds(model: StudioRigFile, skin: RecordValue, count: number): Float32Array {
  const values = new Float32Array((count + 1) * 16);
  if (skin.inverseBindMatrices === undefined) {
    for (let index = 0; index < count; index++)
      for (const diagonal of [0, 5, 10, 15]) values[index * 16 + diagonal] = 1;
    return values;
  }
  const a = records(model.json.accessors)[Number(skin.inverseBindMatrices)];
  if (!a || a.componentType !== 5126 || a.type !== "MAT4" || Number(a.count) < count || a.sparse !== undefined)
    throw new Error("이 역바인드 행렬 형식에서는 관절을 추가할 수 없어요.");
  const view = records(model.json.bufferViews)[Number(a.bufferView)];
  if (!view || view.buffer !== 0 || view.extensions !== undefined)
    throw new Error("압축된 역바인드 행렬은 원본 제작 도구에서 편집해 주세요.");
  const offset = Number(view.byteOffset ?? 0),
    length = Number(view.byteLength),
    start = Number(a.byteOffset ?? 0),
    stride = Number(view.byteStride ?? 64);
  if (
    ![offset, length, start, stride].every(Number.isSafeInteger) ||
    offset < 0 ||
    start < 0 ||
    stride < 64 ||
    start + (count - 1) * stride + 64 > length ||
    offset + length > model.binary.length
  )
    throw new Error("역바인드 행렬이 GLB의 버퍼 범위를 벗어났어요.");
  const source = new DataView(model.binary.buffer, model.binary.byteOffset, model.binary.byteLength);
  for (let i = 0; i < count; i++)
    for (let n = 0; n < 16; n++) values[i * 16 + n] = source.getFloat32(offset + start + i * stride + n * 4, true);
  if (!values.every(Number.isFinite)) throw new Error("유효하지 않은 역바인드 행렬이에요.");
  return values;
}
export function addStudioRigChild(model: StudioRigFile, skinIndex: number, parentId: number): StudioRigFile {
  const nodes = records(model.json.nodes),
    skins = records(model.json.skins),
    skin = skins[skinIndex];
  if (!skin) throw new Error("선택한 골격을 찾지 못했어요.");
  const joints = ids(skin.joints, nodes.length),
    parentSlot = joints.indexOf(parentId);
  if (parentSlot < 0 || joints.length >= 65535) throw new Error("선택한 골격에 관절을 추가할 수 없어요.");
  const matrices = inverseBinds(model, skin, joints.length);
  const newId = nodes.length,
    offsetY = 0.12,
    last = joints.length * 16;
  // 자식의 inverse bind = inverse(자식 로컬 이동) × 부모 inverse bind. 기존 관절 슬롯과 가중치는 그대로 둔다.
  matrices.copyWithin(last, parentSlot * 16, parentSlot * 16 + 16);
  for (let column = 0; column < 4; column++)
    matrices[last + column * 4 + 1]! -= offsetY * matrices[last + column * 4 + 3]!;
  let suffix = joints.length + 1;
  while (nodes.some((node) => node.name === `CustomBone_${suffix}`)) suffix++;
  nodes[parentId] = {
    ...nodes[parentId],
    children: [...ids(nodes[parentId]!.children ?? [], nodes.length), newId],
  };
  nodes.push({ name: `CustomBone_${suffix}`, translation: [0, offsetY, 0] });
  const views = records(model.json.bufferViews),
    accessors = records(model.json.accessors),
    buffers = records(model.json.buffers);
  const start = Math.ceil(model.binary.byteLength / 4) * 4,
    binary = new Uint8Array(start + matrices.byteLength);
  binary.set(model.binary);
  const target = new DataView(binary.buffer);
  matrices.forEach((value, index) => target.setFloat32(start + index * 4, value, true));
  skins[skinIndex] = { ...skin, joints: [...joints, newId], inverseBindMatrices: accessors.length };
  accessors.push({ bufferView: views.length, componentType: 5126, count: joints.length + 1, type: "MAT4" });
  views.push({ buffer: 0, byteOffset: start, byteLength: matrices.byteLength });
  buffers[0] = { ...buffers[0], byteLength: binary.byteLength };
  return { json: { ...model.json, nodes, skins, accessors, bufferViews: views, buffers }, binary };
}
export function writeStudioRigFile(model: StudioRigFile): Uint8Array<ArrayBuffer> {
  return writeStudioVrmExportGlb(model);
}
