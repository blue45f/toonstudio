/** self-contained glTF의 활성 장면을 실제 편집 가능한 원본 메시로 해석한다. */
import { createStudioEditableMeshFromPolygons, STUDIO_EDITABLE_MESH_LIMITS, validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh, type StudioMeshVec3 } from "../../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../../mesh-uv/studio-mesh-uv-authority";

import { array, extensions, integer, item, NativeGlbError, nativeGltfAccessors, object, parseNativeGltf, reject, type JsonRecord, type NativeGltfAccessor } from "./studio-hybrid-dcc-native-glb-data";
import { multiplyNativeMatrix, nativeMatrixDeterminant, nativeMatrixPoint, nativeNodeMatrix, nativeWorldPlacement, NATIVE_IDENTITY, type NativeMatrix } from "./studio-hybrid-dcc-native-glb-math";
import { admitNativeGlbOutputWork, admitNativeGlbPrimitiveScanWork } from "./studio-hybrid-dcc-native-glb-budget";
import { STUDIO_NATIVE_IMPORT_MAX_ASSETS, studioNativeImportFailure, type StudioNativeImportAsset, type StudioNativeImportIssue, type StudioNativeImportResult } from "./studio-hybrid-dcc-native-import-contracts";
import { assertStudioNativeUvPrecision, StudioNativeUvPrecisionError, type StudioNativeUvPoint } from "./studio-hybrid-dcc-native-uv-precision";

interface PrimitiveJob {
  readonly node: number; readonly meshIndex: number; readonly primitiveIndex: number; readonly name: string;
  readonly position: NativeGltfAccessor; readonly uv?: NativeGltfAccessor; readonly indices?: NativeGltfAccessor;
  readonly indexCount: number; readonly mode: number; readonly material: number; readonly smooth: boolean; readonly world: NativeMatrix;
  readonly sourceVertices: readonly number[]; readonly sourceTriangles: readonly (readonly [number, number, number])[];
  readonly placement: ReturnType<typeof nativeWorldPlacement>;
}
const KNOWN_METADATA_EXTENSIONS = new Set(["VRM", "VRMC_vrm", "VRMC_springBone", "VRMC_materials_mtoon", "KHR_materials_unlit", "KHR_texture_transform"]);
function boundedName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.slice(0, 128) : fallback;
}
function accessor(values: readonly NativeGltfAccessor[], index: unknown, path: string): NativeGltfAccessor {
  const result = values[integer(index, path, values.length - 1)];
  if (!result) reject("INVALID_ACCESSOR", "참조한 accessor가 없습니다.", path); return result;
}
function checkAttribute(plan: NativeGltfAccessor, semantic: string, quantized: boolean, path: string): void {
  plan.validateAttribute();
  const floating = plan.componentType === 5126 && !plan.normalized;
  const unsignedNormalized = [5121, 5123].includes(plan.componentType) && plan.normalized;
  const signedNormalized = [5120, 5122].includes(plan.componentType) && plan.normalized;
  const valid = semantic === "POSITION" ? plan.type === "VEC3" && (floating || quantized && [5120, 5121, 5122, 5123].includes(plan.componentType))
    : semantic === "NORMAL" || semantic === "TANGENT" ? plan.type === (semantic === "NORMAL" ? "VEC3" : "VEC4") && (floating || quantized && signedNormalized)
      : /^TEXCOORD_\d+$/u.test(semantic) ? plan.type === "VEC2" && (floating || unsignedNormalized || quantized && signedNormalized)
        : /^COLOR_\d+$/u.test(semantic) ? ["VEC3", "VEC4"].includes(plan.type) && (floating || unsignedNormalized)
          : /^JOINTS_\d+$/u.test(semantic) ? plan.type === "VEC4" && [5121, 5123].includes(plan.componentType) && !plan.normalized
            : /^WEIGHTS_\d+$/u.test(semantic) ? plan.type === "VEC4" && (floating || unsignedNormalized)
              : semantic.startsWith("_");
  if (!valid) reject("INVALID_ATTRIBUTE", "정점 attribute의 구성 요소·타입·정규화 계약이 올바르지 않습니다.", path);
}

/** scene 외부 노드도 cycle·중복 부모·잘못된 참조를 먼저 거부한다. */
function sceneNodes(root: JsonRecord): { readonly nodes: readonly JsonRecord[]; readonly roots: readonly number[]; readonly matrices: readonly NativeMatrix[] } {
  const rawNodes = array(root.nodes, "nodes", true);
  if (rawNodes.length > 8192) reject("NODE_BUDGET", "노드 수가 편집 예산을 넘었습니다.", "nodes");
  const nodes = rawNodes.map((raw, index) => object(raw, `nodes[${index}]`));
  const matrices = nodes.map((node, index) => nativeNodeMatrix(node, `nodes[${index}]`));
  const parents = new Array<number>(nodes.length).fill(0);
  const children = nodes.map((node, index) => array(node.children, `nodes[${index}].children`, true).map((child) => integer(child, `nodes[${index}].children`, nodes.length - 1)));
  for (const list of children) for (const child of list) {
    parents[child] = (parents[child] ?? 0) + 1;
    if (parents[child] !== 1) reject("INVALID_NODE_GRAPH", "glTF 노드에 중복 부모 또는 중복 자식 참조가 있습니다.", "nodes");
  }
  const colors = new Uint8Array(nodes.length);
  for (let seed = 0; seed < nodes.length; seed += 1) {
    const stack: Array<{ readonly id: number; readonly exit: boolean }> = [{ id: seed, exit: false }];
    while (stack.length) {
      const frame = stack.pop(); if (!frame) break;
      if (frame.exit) { colors[frame.id] = 2; continue; }
      if (colors[frame.id] === 1) reject("NODE_CYCLE", "노드 계층에 순환 참조가 있습니다.", "nodes");
      if (colors[frame.id] === 2) continue;
      colors[frame.id] = 1; stack.push({ id: frame.id, exit: true });
      for (const child of children[frame.id] ?? []) stack.push({ id: child, exit: false });
    }
  }
  const scenes = array(root.scenes, "scenes", true);
  const roots = scenes.length ? array(item(scenes, root.scene ?? 0, "scene").nodes, "scene.nodes", true).map((value) => integer(value, "scene.nodes", nodes.length - 1))
    : nodes.flatMap((_, index) => parents[index] === 0 ? [index] : []);
  if (new Set(roots).size !== roots.length || roots.some((id) => parents[id] !== 0)) reject("INVALID_NODE_GRAPH", "활성 장면의 루트 노드가 중복되거나 다른 노드의 자식입니다.", "scene.nodes");
  return { nodes, roots, matrices };
}

type TriangleSource = Pick<PrimitiveJob, "indices" | "indexCount" | "mode">;
function indexAt(job: TriangleSource, index: number): number { return job.indices ? job.indices.get(index, 0) : index; }
function triangles(job: TriangleSource, visit: (a: number, b: number, c: number) => void): number {
  let degenerate = 0;
  for (let index = 0; index < (job.mode === 4 ? job.indexCount : job.indexCount - 2); index += job.mode === 4 ? 3 : 1) {
    const a = job.mode === 4 ? indexAt(job, index) : job.mode === 6 ? indexAt(job, 0) : indexAt(job, index + index % 2);
    const b = job.mode === 4 ? indexAt(job, index + 1) : job.mode === 6 ? indexAt(job, index + 1) : indexAt(job, index + 1 - index % 2);
    const c = indexAt(job, job.mode === 4 ? index + 2 : index + 2);
    if (a === b || b === c || c === a) { degenerate += 1; continue; }
    visit(a, b, c);
  }
  return degenerate;
}
function sourcePoint(job: Pick<PrimitiveJob, "position" | "world" | "placement">, sourceIndex: number): StudioMeshVec3 {
  const point = [job.position.get(sourceIndex, 0), job.position.get(sourceIndex, 1), job.position.get(sourceIndex, 2)] as const;
  const next = job.placement.bake ? nativeMatrixPoint(job.world, point) : point;
  const x = Math.fround(next[0]), y = Math.fround(next[1]), z = Math.fround(next[2]);
  if (![x, y, z].every(Number.isFinite)) reject("NONFINITE_POSITION", "정점 좌표가 유한 Float32 범위를 넘었습니다.");
  return { x, y, z };
}

export function decodeStudioNativeGlb(bytes: Uint8Array, format: "glb" | "gltf" | "vrm" = "glb"): StudioNativeImportResult {
  const issues: StudioNativeImportIssue[] = [];
  const warning = (code: string, detail: string, path?: string) => {
    // 사용자 보고서는 손실 종류별 요약이다. 첫 구조 경로만 남겨 큰 장면의 중복 경고가 다른 손실을 밀어내지 않게 한다.
    if (issues.some((issue) => issue.code === code)) return;
    if (issues.length < 512) issues.push({ severity: "warning", code, detail, ...(path === undefined ? {} : { path }) });
  };
  try {
    if (!["glb", "gltf", "vrm"].includes(format)) reject("INVALID_FORMAT", "GLB·embedded glTF·VRM 파일만 이 경로로 열 수 있습니다.");
    const data = parseNativeGltf(bytes, format !== "gltf"); const { root } = data;
    const used = array(root.extensionsUsed, "extensionsUsed", true);
    const required = array(root.extensionsRequired, "extensionsRequired", true);
    if (![...used, ...required].every((name) => typeof name === "string")) reject("INVALID_EXTENSION", "확장 이름 목록이 올바르지 않습니다.");
    for (const name of required) {
      if (!used.includes(name)) reject("INVALID_EXTENSION", "필수 확장이 사용 확장 목록에 없습니다.", "extensionsRequired");
      if (name !== "KHR_mesh_quantization" && !(typeof name === "string" && KNOWN_METADATA_EXTENSIONS.has(name))) reject("REQUIRED_EXTENSION", "필수 확장 또는 압축을 현재 편집 decoder에서 해석할 수 없습니다.", "extensionsRequired");
    }
    for (const name of used) if (name !== "KHR_mesh_quantization") warning("OPTIONAL_EXTENSION_DROPPED", "추가 확장의 동작은 가져오지 않고 기본 메시 데이터만 보존합니다.", "extensionsUsed");
    const plans = nativeGltfAccessors(data);
    const { nodes, roots, matrices } = sceneNodes(root);
    const meshes = array(root.meshes, "meshes", true); const materials = array(root.materials, "materials", true);
    const skins = array(root.skins, "skins", true); const cameras = array(root.cameras, "cameras", true);
    if (meshes.length > 8192 || materials.length > 8192) reject("METADATA_BUDGET", "메시·재질 메타데이터 수가 편집 예산을 넘었습니다.");
    for (const [index, node] of nodes.entries()) {
      if (node.mesh !== undefined) integer(node.mesh, `nodes[${index}].mesh`, meshes.length - 1);
      if (node.skin !== undefined) integer(node.skin, `nodes[${index}].skin`, skins.length - 1);
      if (node.camera !== undefined) integer(node.camera, `nodes[${index}].camera`, cameras.length - 1);
    }
    if (materials.length) warning("MATERIALS_NOT_IMPORTED", "재질 슬롯 번호는 보존하지만 재질·텍스처 표현은 가져오지 않습니다.", "materials");
    for (const [index, raw] of array(root.images, "images", true).entries()) {
      const image = object(raw, `images[${index}]`);
      if (image.uri !== undefined && typeof image.uri !== "string") reject("INVALID_IMAGE", "이미지 URI 형식이 올바르지 않습니다.", `images[${index}]`);
      if (image.bufferView !== undefined) integer(image.bufferView, `images[${index}].bufferView`, data.views.length - 1);
      warning("IMAGES_NOT_IMPORTED", "이미지 파일은 읽거나 요청하지 않으며 메시만 가져옵니다.", `images[${index}]`);
    }
    if (skins.length) warning("RIG_NOT_IMPORTED", "리깅·스키닝은 가져오지 않고 기본 메시를 정적 편집 대상으로 엽니다.", "skins");
    if (array(root.animations, "animations", true).length) warning("ANIMATION_NOT_IMPORTED", "애니메이션과 현재 포즈는 가져오지 않습니다.", "animations");
    if (cameras.length) warning("CAMERAS_NOT_IMPORTED", "카메라는 메시 가져오기 대상에서 제외합니다.", "cameras");
    const jobs: PrimitiveJob[] = []; let outputWorkBytes = 0; let primitiveScanWork = 0; const meshUses = new Set<number>();
    const stack = [...roots].reverse().map((id) => ({ id, parent: NATIVE_IDENTITY, depth: 0 }));
    while (stack.length) {
      const frame = stack.pop(); if (!frame) break;
      if (frame.depth > 256) reject("NODE_BUDGET", "노드 계층 깊이가 편집 예산을 넘었습니다.", "nodes");
      const node = nodes[frame.id]; const local = matrices[frame.id];
      if (!node || !local) reject("INVALID_NODE_GRAPH", "활성 노드를 찾을 수 없습니다.", "nodes");
      const world = multiplyNativeMatrix(frame.parent, local);
      for (const child of [...array(node.children, `nodes[${frame.id}].children`, true)].reverse()) stack.push({ id: integer(child, "nodes.children", nodes.length - 1), parent: world, depth: frame.depth + 1 });
      if (node.mesh === undefined) continue;
      const meshIndex = integer(node.mesh, `nodes[${frame.id}].mesh`, meshes.length - 1); const mesh = item(meshes, meshIndex, `meshes[${meshIndex}]`);
      const jobsBeforeNode = jobs.length;
      for (const [primitiveIndex, raw] of array(mesh.primitives, `meshes[${meshIndex}].primitives`).entries()) {
        const path = `meshes[${meshIndex}].primitives[${primitiveIndex}]`; const primitive = object(raw, path);
        const mode = integer(primitive.mode ?? 4, `${path}.mode`, 6);
        if (![4, 5, 6].includes(mode)) { warning("PRIMITIVE_MODE_SKIPPED", "점·선 primitive는 편집용 면 메시로 가져오지 않습니다.", path); continue; }
        const attrs = object(primitive.attributes, `${path}.attributes`);
        const ex = extensions(primitive, path);
        if (ex.KHR_draco_mesh_compression !== undefined && attrs.POSITION === undefined) reject("REQUIRED_COMPRESSION", "Draco 압축 메시를 해석할 수 없습니다.", path);
        const position = accessor(plans, attrs.POSITION, `${path}.attributes.POSITION`);
        const quantized = used.includes("KHR_mesh_quantization");
        for (const [semantic, index] of Object.entries(attrs)) {
          const attribute = accessor(plans, index, `${path}.attributes`); checkAttribute(attribute, semantic, quantized, `${path}.attributes`);
          if (attribute.count !== position.count) reject("ATTRIBUTE_COUNT", "primitive attribute의 정점 수가 서로 다릅니다.", path);
          if (semantic === "NORMAL") warning("NORMALS_REGENERATED", "입력 법선은 편집 정본에 저장하지 않으며 메시에서 다시 계산합니다.", path);
          else if (semantic !== "POSITION" && semantic !== "TEXCOORD_0") warning("ATTRIBUTE_DROPPED", "추가 UV·색·tangent·사용자 attribute는 가져오지 않습니다.", path);
        }
        const indices = primitive.indices === undefined ? undefined : accessor(plans, primitive.indices, `${path}.indices`);
        indices?.validateIndices(); const indexCount = indices?.count ?? position.count;
        if (indexCount < 3 || mode === 4 && indexCount % 3 !== 0) reject("INVALID_INDICES", "삼각형 index 수가 primitive 방식과 맞지 않습니다.", path);
        // 출력이 하나도 없는 퇴화 instance도 반복 검증 비용을 사용하므로 실제 index·면 순회 전에 차감한다.
        primitiveScanWork = admitNativeGlbPrimitiveScanWork(primitiveScanWork, indexCount, mode);
        for (let index = 0; index < indexCount; index += 1) {
          const value = indices ? indices.get(index, 0) : index;
          const restart = indices?.componentType === 5121 ? 255 : indices?.componentType === 5123 ? 65535 : 0xffffffff;
          if (!Number.isSafeInteger(value) || value < 0 || value >= position.count || indices && value === restart) reject("INDEX_RANGE", "삼각형 인덱스가 정점 범위를 벗어났거나 예약 값입니다.", path);
        }
        const material = primitive.material === undefined ? 0 : integer(primitive.material, `${path}.material`, materials.length - 1);
        if (primitive.targets !== undefined) { array(primitive.targets, `${path}.targets`); warning("MORPH_TARGETS_NOT_IMPORTED", "모프 타깃은 적용하지 않고 기본 메시만 가져옵니다.", path); }
        const uv = attrs.TEXCOORD_0 === undefined ? undefined : accessor(plans, attrs.TEXCOORD_0, `${path}.attributes.TEXCOORD_0`);
        const candidate = { node: frame.id, meshIndex, primitiveIndex, position, ...(uv ? { uv } : {}), ...(indices ? { indices } : {}), indexCount, mode, material, smooth: attrs.NORMAL !== undefined, world, placement: nativeWorldPlacement(world),
          name: boundedName(node.name, boundedName(mesh.name, `모델 ${frame.id + 1}`)) + (array(mesh.primitives, `${path}.primitives`).length > 1 ? ` · ${primitiveIndex + 1}` : "") };
        const referenced = new Set<number>(); const sourceTriangles: Array<readonly [number, number, number]> = []; let collapsed = 0;
        const degenerate = triangles(candidate, (a, b, c) => {
          const p = sourcePoint(candidate, a), q = sourcePoint(candidate, b), r = sourcePoint(candidate, c);
          const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
          const vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
          const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
          if (!Number.isFinite(area) || area <= STUDIO_EDITABLE_MESH_LIMITS.areaEpsilon) { collapsed += 1; return; }
          const nextVertices = referenced.size + [a, b, c].filter((id) => !referenced.has(id)).length;
          admitNativeGlbOutputWork(outputWorkBytes, nextVertices, (sourceTriangles.length + 1) * 3, uv !== undefined);
          referenced.add(a); referenced.add(b); referenced.add(c); sourceTriangles.push([a, b, c]);
        });
        if (degenerate || collapsed) warning("DEGENERATE_TRIANGLES_SKIPPED", "면적이 편집 한도 이하이거나 인덱스가 반복된 퇴화 삼각형을 제외했습니다.", path);
        if (!sourceTriangles.length) { warning("EMPTY_PRIMITIVE", "편집 가능한 삼각형이 없는 primitive를 제외했습니다.", path); continue; }
        if (jobs.length >= STUDIO_NATIVE_IMPORT_MAX_ASSETS) reject("GEOMETRY_BUDGET", "활성 장면의 오브젝트 수가 256개 예산을 넘었습니다.", path);
        outputWorkBytes = admitNativeGlbOutputWork(outputWorkBytes, referenced.size, sourceTriangles.length * 3, uv !== undefined);
        // 원본 index가 다른 같은 좌표는 합치지 않는다. 재료별 shared accessor의 미사용 정점만 제외한다.
        jobs.push({ ...candidate, sourceVertices: [...referenced].sort((a, b) => a - b), sourceTriangles });
      }
      if (jobs.length > jobsBeforeNode) {
        if (frame.depth > 0) warning("NODE_HIERARCHY_FLATTENED", "원본 부모·자식 계층은 평면 자산 목록으로 바꾸고 각 자산의 world 배치를 보존합니다.", "nodes");
        if (jobs.length - jobsBeforeNode > 1) warning("PRIMITIVES_SPLIT", "한 노드의 여러 primitive를 각각 독립 편집 자산으로 나눕니다.", "meshes");
        if (meshUses.has(meshIndex)) warning("INSTANCES_MADE_UNIQUE", "원본 메시를 공유하는 노드는 연결 복제 대신 각각 독립 편집 복사본으로 가져옵니다.", "nodes");
        meshUses.add(meshIndex);
      }
    }
    const assets: StudioNativeImportAsset[] = [];
    for (const job of jobs) {
      const path = `nodes[${job.node}]`; const placement = job.placement;
      if (placement.reason) warning(placement.reason, placement.reason === "SHEAR_BAKED" ? "계층 변환의 전단을 world 정점에 bake하고 오브젝트 변환을 초기화했습니다." : "표현할 수 없는 변환을 world 정점에 bake하고 오브젝트 변환을 초기화했습니다.", path);
      const positions = job.sourceVertices.map((id) => sourcePoint(job, id));
      const indexMap = new Map(job.sourceVertices.map((id, index) => [id, index]));
      const reflected = placement.bake && nativeMatrixDeterminant(job.world) < 0;
      const faces = job.sourceTriangles.map(([a, b, c]) => {
        const remapped = (id: number) => { const index = indexMap.get(id); if (index === undefined) reject("INDEX_RANGE", "원본 index의 compact 대응이 없습니다.", path); return index; };
        // 음수 determinant를 위치에 bake하면 renderer의 반전 보정도 winding에 명시적으로 옮긴다.
        return (reflected ? [a, c, b] : [a, b, c]).map(remapped);
      });
      const plain = createStudioEditableMeshFromPolygons(positions, faces);
      let mesh: StudioEditableMesh = { ...plain, faces: plain.faces.map((face) => ({ ...face, smooth: job.smooth, materialSlot: job.material })) };
      if (job.uv) {
        const uv = job.uv;
        const sourceIndexAtEdge = (edge: StudioEditableMesh["halfEdges"][number]): number => {
          const origin = mesh.halfEdges[edge.prev]?.vertex;
          const sourceIndex = origin === undefined ? undefined : job.sourceVertices[origin];
          if (sourceIndex === undefined) reject("INVALID_TOPOLOGY", "생성된 triangle corner의 원본 인덱스가 없습니다.", path);
          return sourceIndex;
        };
        const uvCorners = mesh.halfEdges.map((edge) => {
          const sourceIndex = sourceIndexAtEdge(edge);
          const u = Math.fround(uv.get(sourceIndex, 0)), v = Math.fround(1 - uv.get(sourceIndex, 1));
          if (!Number.isFinite(u) || !Number.isFinite(v)) reject("NONFINITE_UV", "UV가 유한 Float32 범위를 넘었습니다.", path);
          return { halfEdgeId: edge.id, u, v };
        });
        for (const face of mesh.faces) {
          const source: StudioNativeUvPoint[] = [], target: StudioNativeUvPoint[] = []; let edgeId = face.he;
          for (let corner = 0; corner < 3; corner += 1) {
            const edge = mesh.halfEdges[edgeId], next = uvCorners[edgeId];
            if (!edge || !next) reject("INVALID_TOPOLOGY", "UV triangle corner를 찾을 수 없습니다.", path);
            const sourceIndex = sourceIndexAtEdge(edge);
            // raw glTF V를 먼저 뒤집으면 차이가 이미 사라질 수 있으므로 확정 출력 코너와 직접 비교한다.
            source.push([uv.get(sourceIndex, 0), uv.get(sourceIndex, 1)]); target.push([next.u, next.v]); edgeId = edge.next;
          }
          try { assertStudioNativeUvPrecision(source, target, -1); }
          catch (error) { if (error instanceof StudioNativeUvPrecisionError) reject("UV_PRECISION_LOSS", error.message, path); throw error; }
        }
        mesh = { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: uvCorners }, mesh) };
      }
      const valid = validateStudioEditableMeshSerializableAuthority(mesh);
      if (!valid.ok) reject("INVALID_TOPOLOGY", "가져온 삼각형을 편집 메시 정본으로 구성할 수 없습니다.", path);
      assets.push({ name: job.name, mesh, initialTransform: placement.transform, sourceNodeIndex: job.node, sourceMeshIndex: job.meshIndex, sourcePrimitiveIndex: job.primitiveIndex });
    }
    if (!assets.length) reject("NO_EDITABLE_GEOMETRY", "활성 장면에 가져올 수 있는 삼각형 메시가 없습니다.");
    return { ok: true, value: { format, assets, issues } };
  } catch (error) {
    if (error instanceof NativeGlbError) return { ok: false, issues: [...issues, { severity: "error", code: error.code, detail: error.message, ...(error.path === undefined ? {} : { path: error.path }) }] };
    return studioNativeImportFailure("INVALID_GLTF", "모델 데이터를 안전한 편집 메시로 해석하지 못했습니다.");
  }
}
