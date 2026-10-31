/** 실제 Panel/Canvas의 수동 관측기다. 도구·Worker·선택·문서 확정은 제품 UI만 실행한다. */
import { _roots } from "@react-three/fiber";
import { createRoot } from "react-dom/client";
import {
  BufferGeometry, Euler, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, Points, PointsMaterial, Quaternion,
  Raycaster, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { mapStudioHybridDccRayFaceIndex } from "@/domains/creator/hybrid-dcc/studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "@/domains/creator/hybrid-dcc/studio-hybrid-dcc-document";
import { readStudioMeshFaceLoops } from "@/domains/creator/hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";
import { deriveStudioHybridDccViewportSnapshot } from "@/domains/creator/hybrid-dcc/studio-hybrid-dcc-viewport-snapshot";
import {
  createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceCommitObjectTransform,
  workspaceComponentSelectionSource, synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace,
} from "@/domains/creator/hybrid-dcc/studio-hybrid-dcc-workspace";
import { StudioHybridDccPanel } from "@/domains/creator/hybrid-dcc/StudioHybridDccPanel";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "@/domains/creator/mesh-uv/studio-mesh-uv-authority";
import { serializeStudioEditableMesh } from "@/domains/creator/studio-editable-half-edge-mesh";
import "@/app/styles/globals.css";

const FIXTURE = new URLSearchParams(location.search).get("fixture") === "affine-uv" ? "affine-uv" : "edge";
const DOCUMENT_ID = `qa-boundary-chord-${FIXTURE}-20261030`;
const ASSET_ID = `qa-boundary-${FIXTURE}-cube`;
const seeded = workspaceAddUnitCube(createStudioHybridDccWorkspace(DOCUMENT_ID), ASSET_ID);
const seedSource = workspaceComponentSelectionSource(seeded);
if (!seedSource) throw new Error("초기 fixture의 공개 geometry 권위가 없습니다.");
const behind = seedSource.mesh.halfEdges[0];
if (!behind || behind.twin < 0) throw new Error("초기 crease의 뒤쪽 실제 모서리가 없습니다.");
// 첫 edge 문서는 기본 crease0·무UV 메시를 그대로 쓴다. 보존 분기를 켜서 collinear 경계를 가리지 않는다.
if (FIXTURE === "edge" && (seedSource.mesh.uvLayer !== undefined
  || seedSource.mesh.vertices.some((vertex) => vertex.crease !== 0)
  || seedSource.mesh.halfEdges.some((edge) => edge.crease !== 0))) throw new Error("기본 edge fixture는 모든 crease가 0이고 UV가 없어야 합니다.");
const creased = FIXTURE === "edge" ? seedSource.mesh : { ...seedSource.mesh,
  vertices: seedSource.mesh.vertices.map((vertex) => vertex.id === 0 ? { ...vertex, crease: 0.375 } : vertex),
  // interactive 표시 계약에 맞는 hard-surface fixture다. smooth+crease 지원으로 확대하지 않는다.
  faces: seedSource.mesh.faces.map((face) => ({ ...face, smooth: false, materialSlot: face.id % 3 })),
  halfEdges: seedSource.mesh.halfEdges.map((edge) => edge.id === behind.id || edge.id === behind.twin ? { ...edge, crease: 0.625 } : edge),
};
const initialLoops = readStudioMeshFaceLoops(creased);
if (!initialLoops) throw new Error("초기 fixture의 면 경계를 읽지 못했습니다.");
const frontFace = initialLoops.find((loop) => loop.vertexIds.every((id) => creased.vertices[id]?.position.z === 0.5));
if (!frontFace) throw new Error("실제 +Z 큐브 면이 없습니다.");
const TARGET_FACE_ID = frontFace.id;
// UV 문서의 속성만 공개 geometry.commit으로 초기 준비한다. edge 문서는 기본 메시를 유지한다. 실행 중 도구를 대체하지 않는다.
const attributed = FIXTURE !== "affine-uv" ? creased : { ...creased, uvLayer: decodeStudioMeshUvLayer({
  revision: 1, topologyHash: hashStudioMeshUvTopology(creased),
  corners: initialLoops.flatMap((loop) => {
    const axes = (["x", "y", "z"] as const).filter((axis) => new Set(loop.vertexIds.map((id) => creased.vertices[id]?.position[axis])).size > 1);
    const [uAxis, vAxis] = axes;
    if (!uAxis || !vAxis || axes.length !== 2) throw new Error("UV fixture는 두 축의 평면 큐브 면이어야 합니다.");
    return loop.vertexIds.map((id, index) => {
      const position = creased.vertices[id]?.position, halfEdgeId = loop.halfEdgeIds[index];
      if (!position || halfEdgeId === undefined) throw new Error("UV fixture의 실제 코너가 없습니다.");
      return { halfEdgeId, u: Math.fround(position[uAxis] + 0.5), v: Math.fround(position[vAxis] + 0.5) };
    });
  }).sort((left, right) => left.halfEdgeId - right.halfEdgeId),
}, creased) };
const prepared = FIXTURE === "edge" ? seeded
  : synchronizeWorkspaceGeometryAuthority(seeded, hybridDccCommitGeometry(seeded.session, ASSET_ID, attributed));
const initial = workspaceCommitObjectTransform(prepared, ASSET_ID, {
  revision: 1, position: [0.35, 0.2, -0.1], rotationEulerRad: [0.12, -0.2, 0.06], scale: [1.2, 0.9, 1.1],
});
let current = initial, notifications = 0, mounted = true;
const host = document.getElementById("root");
if (!host) throw new Error("실제 Panel을 마운트할 root가 없습니다.");
const root = createRoot(host);

function source() {
  const value = workspaceComponentSelectionSource(current);
  if (!value || value.assetId !== ASSET_ID) throw new Error("관측할 실제 원본 cube가 없습니다.");
  return value;
}
function live() {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="편집 메시 3D 렌더"]');
  if (!canvas) throw new Error("제품 Canvas가 준비되지 않았습니다.");
  const store = _roots.get(canvas)?.store;
  if (!store) throw new Error("실제 R3F root store를 찾지 못했습니다.");
  const state = store.getState();
  if (!(state.gl instanceof WebGLRenderer)) throw new Error("이 시나리오는 실제 WebGLRenderer만 검사합니다.");
  const context = state.gl.getContext();
  if (!(context instanceof WebGL2RenderingContext)) throw new Error("실제 Canvas가 WebGL2를 사용하지 않습니다.");
  return { canvas, state, renderer: state.gl, context };
}
function authority() {
  const value = source();
  const transform = current.session.state.objectTransforms[ASSET_ID];
  if (!transform) throw new Error("원본 object-local TRS 권위가 없습니다.");
  return {
    documentId: current.session.state.documentId, stateHash: current.session.state.stateHash,
    assetId: value.assetId, meshHash: value.sourceHash, meshRevision: value.meshRevision,
    mesh: serializeStudioEditableMesh(value.mesh), halfEdgeCount: value.mesh.halfEdges.length, transform,
    uvTopologyHash: value.mesh.uvLayer ? hashStudioMeshUvTopology(value.mesh) : null,
    uvCorners: value.mesh.uvLayer ? (readStudioMeshFaceLoops(value.mesh) ?? []).flatMap((loop) => loop.vertexIds.map((vertexId, index) => {
      const halfEdgeId = loop.halfEdgeIds[index], uv = halfEdgeId === undefined ? undefined : value.mesh.uvLayer?.corners[halfEdgeId];
      if (!uv) throw new Error("관측할 실제 UV 코너가 없습니다.");
      return { faceId: loop.id, vertexId, u: uv.u, v: uv.v };
    })) : null,
    undoDepth: current.session.undoStack.length, redoDepth: current.session.redoStack.length,
    commandCount: current.session.state.commandCount,
  };
}
function observe() {
  const viewport = document.querySelector('[data-studio-hybrid-dcc-viewport="true"]');
  return {
    mounted, notifications, fixture: FIXTURE, targetFaceId: TARGET_FACE_ID, authority: authority(),
    selectionMode: viewport?.getAttribute("data-selection-mode") ?? null,
    selectedElements: Number(viewport?.getAttribute("data-selected-elements") ?? "0"),
    contextLost: viewport?.getAttribute("data-context-lost") ?? null,
    boundaryText: document.querySelector('[data-studio-hybrid-dcc-boundary-chord="true"]')?.textContent ?? "",
    healingText: document.querySelector('[data-studio-coplanar-edge-heal="true"]')?.textContent ?? "",
  };
}
function actualMesh() {
  const { canvas, state, renderer, context } = live();
  const snapshot = deriveStudioHybridDccViewportSnapshot(current, "face", true);
  if (snapshot.errors.length) throw new Error(snapshot.errors.map(({ message }) => message).join(" · "));
  const asset = snapshot.assets.find(({ assetId }) => assetId === ASSET_ID);
  if (!asset) throw new Error("실제 원본의 표시 계획이 없습니다.");
  const expected = new Matrix4().compose(new Vector3(...asset.position),
    new Quaternion().setFromEuler(new Euler(...asset.rotationEulerRad, "XYZ")), new Vector3(...asset.scale));
  const meshes: Mesh[] = [];
  const sceneTypes: Record<string, number> = {};
  const candidates: Array<{ type: string; materials: string[]; materialArray: boolean; physical: boolean; positions: number | null;
    indices: number | null; matrixWorld: number[]; maximumMatrixError: number; matches: boolean }> = [];
  state.scene.traverse((object) => {
    sceneTypes[object.type] = (sceneTypes[object.type] ?? 0) + 1;
    if (!(object instanceof Mesh)) return;
    const physical = object.material instanceof MeshPhysicalMaterial;
    const positions = object.geometry.getAttribute("position")?.count ?? null;
    const matches = object.matrixWorld.elements.every((value, index) => {
      const wanted = expected.elements[index];
      return wanted !== undefined && Math.abs(value - wanted) <= 64 * Number.EPSILON * Math.max(1, Math.abs(wanted));
    });
    candidates.push({ type: object.type,
      materials: (Array.isArray(object.material) ? object.material : [object.material]).map((material) => material.type),
      materialArray: Array.isArray(object.material), physical, positions, indices: object.geometry.getIndex()?.count ?? null, matrixWorld: object.matrixWorld.toArray(),
      maximumMatrixError: Math.max(...object.matrixWorld.elements.map((value, index) => Math.abs(value - (expected.elements[index] ?? NaN)))), matches });
    if (physical && positions === asset.indices.length && matches) meshes.push(object);
  });
  if (meshes.length !== 1 || !meshes[0]) throw new Error(`실제 원본 표면의 재질·위치 수·TRS 식별 조건이 일치하지 않습니다. ${JSON.stringify({
    matchingCount: meshes.length, expectedPositions: asset.indices.length, normalMode: asset.normalMode,
    expectedMatrixWorld: expected.toArray(), sceneTypes, candidateCount: candidates.length, candidates,
  })}`);
  return { canvas, state, renderer, context, mesh: meshes[0], asset };
}
function projected(local: Vector3, mesh: Mesh) {
  const { canvas, state } = live(), rect = canvas.getBoundingClientRect();
  const world = local.clone().applyMatrix4(mesh.matrixWorld), ndc = world.clone().project(state.camera);
  if (![ndc.x, ndc.y, ndc.z].every(Number.isFinite) || Math.abs(ndc.x) >= 0.95 || Math.abs(ndc.y) >= 0.95
    || ndc.z < -1 || ndc.z > 1) throw new Error("클릭할 실제 경계가 현재 화면 안에 있지 않습니다.");
  return { x: rect.left + (ndc.x + 1) * rect.width / 2, y: rect.top + (1 - ndc.y) * rect.height / 2,
    ndc: [ndc.x, ndc.y], local: local.toArray(), world: world.toArray() };
}
let pointerTrace: { active: boolean; dropped: number; rows: Record<string, unknown>[]; controlsObserved: boolean } | null = null;
let stopPointerTrace: (() => void) | null = null;
/** 첫 경계 클릭의 수동 관측만 보존한다. 제품 이벤트·행렬·공유 raycaster를 변경하지 않는다. */
function beginPointerTrace() {
  if (pointerTrace) throw new Error("첫 클릭 관측을 다시 시작할 수 없습니다.");
  const { canvas, state } = live(), candidate: unknown = state.controls;
  const controls = candidate instanceof OrbitControlsImpl ? candidate : null;
  const trace = { active: true, dropped: 0, rows: [] as Record<string, unknown>[], controlsObserved: controls !== null };
  pointerTrace = trace;
  const append = (row: Record<string, unknown>) => {
    if (trace.rows.length === 48) { trace.rows.shift(); trace.dropped++; }
    trace.rows.push(row);
  };
  const orbit = (type: "start" | "change" | "end") => () => {
    append({ kind: "orbit", type, at: performance.now(), controlsStillCurrent: _roots.get(canvas)?.store.getState().controls === controls });
  };
  const start = orbit("start"), change = orbit("change"), end = orbit("end");
  const input = (event: MouseEvent) => {
    if (!event.isTrusted) return;
    const at = performance.now(), sameCanvas = event.target === canvas;
    const rect = canvas.getBoundingClientRect();
    const row: Record<string, unknown> = { kind: "native", type: event.type, at, timeStamp: event.timeStamp,
      trusted: event.isTrusted, client: [event.clientX, event.clientY], offset: [event.offsetX, event.offsetY], button: event.button,
      sameCanvas, targetTag: event.target instanceof Element ? event.target.tagName : null,
      canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      topElementIsCanvas: document.elementFromPoint(event.clientX, event.clientY) === canvas,
      timing: "window capture; 제품 bubble handler 실행 전" };
    if (sameCanvas) try {
      const { mesh, state: currentState } = actualMesh();
      row.controlsStillCurrent = currentState.controls === controls;
      row.meshUuid = mesh.uuid; row.matrixWorld = mesh.matrixWorld.toArray();
      row.camera = { position: currentState.camera.position.toArray(), quaternion: currentState.camera.quaternion.toArray(),
        matrixWorld: currentState.camera.matrixWorld.toArray(), projectionMatrix: currentState.camera.projectionMatrix.toArray() };
      row.initialHits = currentState.internal.initialHits.slice(0, 8).map((object) => ({ uuid: object.uuid, type: object.type }));
      row.initialHitsCount = currentState.internal.initialHits.length;
      row.initialHitsTiming = event.type === "pointerdown" ? "현재 down 처리 전이므로 이전 입력일 수 있음" : "현재 이벤트 capture 시점의 기존 목록";
      row.pickingButtons = Array.from(document.querySelectorAll('[data-studio-hybrid-dcc-boundary-chord="true"] button[aria-pressed]'))
        .slice(0, 4).map((button) => ({ text: button.textContent, pressed: button.getAttribute("aria-pressed") }));
      if (!mesh.geometry.boundingSphere) row.rayUnavailable = "기존 boundingSphere가 없어 지연 생성을 수행하지 않음";
      else {
        const ray = new Raycaster();
        ray.near = currentState.raycaster.near; ray.far = currentState.raycaster.far; ray.layers.mask = currentState.raycaster.layers.mask;
        ray.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), currentState.camera);
        const hits = ray.intersectObject(mesh, false);
        row.independentHits = hits.slice(0, 4).map((hit) => {
          const mapped = typeof hit.faceIndex === "number" ? mapStudioHybridDccRayFaceIndex(source(), hit.faceIndex) : null;
          return { meshUuid: hit.object.uuid, faceIndex: hit.faceIndex, distance: hit.distance, point: hit.point.toArray(),
            faceId: mapped?.ok ? mapped.value.faceId : null, mappingDiagnostics: mapped && !mapped.ok ? mapped.diagnostics : [] };
        });
        row.independentHitCount = hits.length;
      }
    } catch (error) { row.observationError = error instanceof Error ? error.message : String(error); }
    append(row);
    if (sameCanvas && event.type === "click") stopPointerTrace?.();
  };
  for (const type of ["pointerdown", "pointerup", "click"] as const) window.addEventListener(type, input, { capture: true, passive: true });
  controls?.addEventListener("start", start); controls?.addEventListener("change", change); controls?.addEventListener("end", end);
  stopPointerTrace = () => {
    for (const type of ["pointerdown", "pointerup", "click"] as const) window.removeEventListener(type, input, true);
    controls?.removeEventListener("start", start); controls?.removeEventListener("change", change); controls?.removeEventListener("end", end);
    trace.active = false;
  };
}
/** 좌표 계산만 제공한다. ray hit/opaque endpoint 발급 함수나 편집 함수를 대신 호출하지 않는다. */
function targets(requestedFace?: number) {
  const { mesh, canvas, state } = actualMesh(), original = source();
  const loops = readStudioMeshFaceLoops(original.mesh);
  if (!loops) throw new Error("원본 face loop가 없습니다.");
  const ray = new Raycaster();
  requestedFace ??= TARGET_FACE_ID;
  const visible = loops.flatMap((loop) => {
    if (requestedFace !== undefined && requestedFace !== loop.id) return [];
    const center = new Vector3();
    for (const id of loop.vertexIds) {
      const point = original.mesh.vertices[id]?.position;
      if (!point) throw new Error("face의 실제 정점이 없습니다.");
      center.add(new Vector3(point.x, point.y, point.z));
    }
    center.multiplyScalar(1 / loop.vertexIds.length);
    const ndc = center.clone().applyMatrix4(mesh.matrixWorld).project(state.camera);
    ray.setFromCamera(new Vector2(ndc.x, ndc.y), state.camera);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit || typeof hit.faceIndex !== "number") return [];
    const mapped = mapStudioHybridDccRayFaceIndex(original, hit.faceIndex);
    return mapped.ok && mapped.value.faceId === loop.id && Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.8
      ? [{ loop, center, distance: ndc.x ** 2 + ndc.y ** 2 }] : [];
  }).sort((left, right) => left.distance - right.distance);
  const face = visible[0];
  if (!face || face.loop.vertexIds.length !== 4) throw new Error("네 경계를 가진 실제 보이는 cube 면이 없습니다.");
  const vertex = (index: number) => {
    const id = face.loop.vertexIds[index], point = id === undefined ? undefined : original.mesh.vertices[id]?.position;
    if (!point) throw new Error("요청한 실제 경계 정점이 없습니다.");
    return new Vector3(point.x, point.y, point.z);
  };
  // 경계선보다 아주 조금 면 안쪽에서 ray를 맞힌다. endpoint 자체는 제품의 실제 근접 계산이 결정한다.
  const edgePoint = (index: number, t: number) => projected(vertex(index).lerp(vertex((index + 1) % 4), t).lerp(face.center, 0.001), mesh);
  const vertexPoint = (index: number) => projected(vertex(index).lerp(face.center, 0.001), mesh);
  const originalEdges = new Set(triangleSegments(mesh.geometry).map((entry) => segmentKey(entry[0], entry[1])));
  const vertexIndices = ([[0, 2], [1, 3]] as const).find(([a, b]) => !originalEdges.has(segmentKey(vertex(a).toArray(), vertex(b).toArray())));
  if (!vertexIndices) throw new Error("원래 삼각분할에 없는 반대 꼭짓점 선을 찾지 못했습니다.");
  const rect = canvas.getBoundingClientRect();
  const blank = [[0.88, -0.78], [-0.88, -0.78], [0.88, 0.55], [-0.88, 0.55]].flatMap(([x, y]) => {
    if (x === undefined || y === undefined) return [];
    ray.setFromCamera(new Vector2(x, y), state.camera);
    const clientX = rect.left + (x + 1) * rect.width / 2, clientY = rect.top + (1 - y) * rect.height / 2;
    return ray.intersectObject(mesh, false).length === 0 && document.elementFromPoint(clientX, clientY) === canvas
      ? [{ x: clientX, y: clientY }] : [];
  })[0];
  if (!blank) throw new Error("가리지 않은 실제 빈 Canvas 지점을 찾지 못했습니다.");
  return { faceId: face.loop.id, center: projected(face.center, mesh), edgeStart: edgePoint(0, 0.25), edgeEnd: edgePoint(2, 0.75),
    vertexStart: vertexPoint(vertexIndices[0]), vertexEnd: vertexPoint(vertexIndices[1]),
    expectedVertexIds: vertexIndices.map((index) => face.loop.vertexIds[index]), blank,
    matrixWorld: mesh.matrixWorld.toArray(), canonicalTransform: current.session.state.objectTransforms[ASSET_ID] };
}

/** B가 만든 두 실제 child의 공유 seam만 읽어 native 클릭 좌표를 제공한다. 선택·치유 함수를 호출하지 않는다. */
function healingTargets() {
  const { mesh, state } = actualMesh(), original = source();
  const loops = readStudioMeshFaceLoops(original.mesh);
  if (FIXTURE !== "affine-uv" || !loops || loops.length !== 7) throw new Error("치유 입력은 UV vertex 분할의 실제 7면 문서여야 합니다.");
  const keep = loops.find(({ id }) => id === TARGET_FACE_ID), drop = loops.find(({ id }) => id === original.mesh.faces.length - 1);
  if (!keep || !drop || keep.id === drop.id) throw new Error("분할된 두 원본 child 면이 없습니다.");
  const seams = original.mesh.halfEdges.filter((edge) => edge.face === keep.id && original.mesh.halfEdges[edge.twin]?.face === drop.id);
  const seam = seams[0], twin = seam && original.mesh.halfEdges[seam.twin];
  if (seams.length !== 1 || !seam || !twin || seam.crease !== 0 || twin.crease !== 0) throw new Error("B가 만든 단일 zero-crease seam이 아닙니다.");
  const from = original.mesh.halfEdges[seam.prev]?.vertex, to = seam.vertex;
  const a = from === undefined ? undefined : original.mesh.vertices[from]?.position, c = original.mesh.vertices[to]?.position;
  if (from === undefined || !a || !c) throw new Error("실제 seam의 원본 정점이 없습니다.");
  const center = (loop: { readonly vertexIds: readonly number[] }) => {
    const point = new Vector3();
    for (const id of loop.vertexIds) {
      const vertex = original.mesh.vertices[id]?.position;
      if (!vertex) throw new Error("child의 원본 정점이 없습니다.");
      point.add(new Vector3(vertex.x, vertex.y, vertex.z));
    }
    return point.multiplyScalar(1 / loop.vertexIds.length);
  };
  const faceTargets = [keep, drop].map((loop) => ({ faceId: loop.id, point: projected(center(loop), mesh) }));
  const middle = new Vector3(a.x, a.y, a.z).lerp(new Vector3(c.x, c.y, c.z), 0.5).lerp(center(keep), 0.001);
  const edge = projected(middle, mesh), ray = new Raycaster();
  ray.setFromCamera(new Vector2(edge.ndc[0], edge.ndc[1]), state.camera);
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit || typeof hit.faceIndex !== "number") throw new Error("실제 seam 근처의 표면 ray hit가 없습니다.");
  const mapped = mapStudioHybridDccRayFaceIndex(original, hit.faceIndex), halfEdgeId = Math.min(seam.id, twin.id);
  if (!mapped.ok || !mapped.value.edgeCandidates.some(({ id }) => id === halfEdgeId)) throw new Error("클릭할 면이 canonical seam을 포함하지 않습니다.");
  const endpoints: readonly [Position, Position] = [[a.x, a.y, a.z], [c.x, c.y, c.z]];
  return { sourceHash: original.sourceHash, halfEdgeId, twinId: Math.max(seam.id, twin.id),
    vertexIds: [from, to], faceIds: [keep.id, drop.id], endpoints, edge, faceTargets,
    matrixWorld: mesh.matrixWorld.toArray(), canonicalTransform: current.session.state.objectTransforms[ASSET_ID] };
}
/** 제품의 renderOrder=7 edge 선택 overlay만 관측해 native 클릭이 실제 seam을 골랐는지 확인한다. */
function selectedEdges() {
  const { state, mesh } = actualMesh(), segments: (readonly [Position, Position])[] = [];
  state.scene.traverse((object) => {
    if (!(object instanceof LineSegments) || object.renderOrder !== 7 || !object.visible
      || !object.matrixWorld.elements.every((value, index) => value === mesh.matrixWorld.elements[index])) return;
    const position = object.geometry.getAttribute("position");
    if (!position || position.count % 2 !== 0) throw new Error("실제 edge 선택 overlay의 위치 stream이 다릅니다.");
    for (let index = 0; index < position.count; index += 2) segments.push([
      [position.getX(index), position.getY(index), position.getZ(index)],
      [position.getX(index + 1), position.getY(index + 1), position.getZ(index + 1)],
    ]);
  });
  return segments;
}

/** 실제 표시 삼각형과 wireframe 재질만 읽는다. 새 선을 그리거나 renderer를 바꾸지 않는다. */
type Position = readonly [number, number, number];
function segmentKey(a: readonly number[], b: readonly number[]): string {
  const keys = [JSON.stringify(a), JSON.stringify(b)].sort(); return `${keys[0]}|${keys[1]}`;
}
function triangleSegments(geometry: BufferGeometry): readonly (readonly [Position, Position])[] {
  const attribute = geometry.getAttribute("position"), index = geometry.getIndex(), pairs = new Map<string, readonly [Position, Position]>();
  if (!attribute) throw new Error("실제 표시 위치 stream이 없습니다.");
  const count = index?.count ?? attribute.count;
  if (count % 3 !== 0) throw new Error("실제 표시 삼각형의 코너 수가 다릅니다.");
  const at = (offset: number): Position => {
    const id = index ? index.getX(offset) : offset;
    return [attribute.getX(id), attribute.getY(id), attribute.getZ(id)];
  };
  for (let offset = 0; offset < count; offset += 3) {
    const vertices = [at(offset), at(offset + 1), at(offset + 2)] as const;
    for (const [a, b] of [[vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]]] as const) pairs.set(segmentKey(a, b), [a, b]);
  }
  return [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, pair]) => pair);
}
function wire(endpoints?: readonly [Position, Position]) {
  const { state, canvas } = live(), snapshot = deriveStudioHybridDccViewportSnapshot(current, "face", true);
  const asset = snapshot.assets.find(({ assetId }) => assetId === ASSET_ID);
  if (!asset || snapshot.errors.length) throw new Error("현재 wire의 원본 TRS를 확인하지 못했습니다.");
  const expected = new Matrix4().compose(new Vector3(...asset.position),
    new Quaternion().setFromEuler(new Euler(...asset.rotationEulerRad, "XYZ")), new Vector3(...asset.scale));
  const found: { readonly mesh: Mesh; readonly material: MeshBasicMaterial }[] = [];
  state.scene.traverse((object) => {
    if (object instanceof Mesh && object.visible && object.material instanceof MeshBasicMaterial && object.material.visible
      && object.material.wireframe && object.material.opacity > 0 && object.matrixWorld.elements.every((value, index) => {
        const wanted = expected.elements[index];
        return wanted !== undefined && Math.abs(value - wanted) <= 64 * Number.EPSILON * Math.max(1, Math.abs(wanted));
      })) {
      found.push({ mesh: object, material: object.material });
    }
  });
  const entry = found[0];
  if (!entry || found.length !== 1) throw new Error("같은 TRS의 실제 wireframe 표면이 하나가 아닙니다.");
  const rect = canvas.getBoundingClientRect(), segments = triangleSegments(entry.mesh.geometry);
  const project = (position: readonly number[]) => {
    const [x, y, z] = position;
    if (x === undefined || y === undefined || z === undefined) throw new Error("wire 위치의 세 좌표가 없습니다.");
    const ndc = new Vector3(x, y, z).applyMatrix4(entry.mesh.matrixWorld).project(state.camera);
    return { x: rect.left + (ndc.x + 1) * rect.width / 2, y: rect.top + (1 - ndc.y) * rect.height / 2 };
  };
  const camera = { matrixWorld: state.camera.matrixWorld.toArray(), projection: state.camera.projectionMatrix.toArray() };
  const projectedSegments = segments.map(([a, b]) => ({ local: [a, b], a: project(a), b: project(b) }));
  let probe: WireProbe | null = null;
  if (endpoints) {
    const a = project(endpoints[0]), b = project(endpoints[1]), dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < 30) throw new Error("실제 새 선의 화면 길이가 픽셀 가시성 검사에 너무 짧습니다.");
    const nx = -dy / length * 4, ny = dx / length * 4;
    probe = { rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      points: [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85].map((t) => {
        const x = a.x + dx * t, y = a.y + dy * t;
        return { x, y, left: { x: x + nx, y: y + ny }, right: { x: x - nx, y: y - ny } };
      }) };
  }
  return { segments, projectedSegments, camera, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    matrixWorld: entry.mesh.matrixWorld.toArray(),
    colorSrgb: entry.material.color.getHexString(SRGBColorSpace), opacity: entry.material.opacity, toneMapped: entry.material.toneMapped,
    signature: JSON.stringify(segments), probe };
}
interface WireProbe {
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly points: readonly { readonly x: number; readonly y: number; readonly left: { readonly x: number; readonly y: number }; readonly right: { readonly x: number; readonly y: number } }[];
}
/** 같은 실제 카메라의 원본/분할 PNG에서 선 위치의 변화와 양쪽 면의 불변을 함께 확인한다. */
async function inspectWireScreenshots(before: string, after: string, probe: WireProbe) {
  const decode = async (base64: string) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0))], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("wire PNG의 native 디코딩을 시작하지 못했습니다.");
      context.drawImage(bitmap, 0, 0);
      return { width: bitmap.width, height: bitmap.height, bytes: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
    } finally { bitmap.close(); }
  };
  const [original, changed] = await Promise.all([decode(before), decode(after)]);
  if (original.width !== changed.width || original.height !== changed.height) throw new Error("원본/분할 PNG 크기가 다릅니다.");
  const delta = (point: { readonly x: number; readonly y: number }, radius: number) => {
    const x = Math.round((point.x - probe.rect.left) * changed.width / probe.rect.width);
    const y = Math.round((point.y - probe.rect.top) * changed.height / probe.rect.height), differences: number[] = [];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= changed.width || y + dy >= changed.height) throw new Error("wire 픽셀 strip이 Canvas 밖입니다.");
      const offset = ((y + dy) * changed.width + x + dx) * 4;
      if (original.bytes[offset + 3] !== 255 || changed.bytes[offset + 3] !== 255) throw new Error("wire 비교 PNG는 실제 불투명 Canvas여야 합니다.");
      differences.push(Math.hypot(...[0, 1, 2].map((channel) => (changed.bytes[offset + channel] ?? 0) - (original.bytes[offset + channel] ?? 0))));
    }
    return differences.sort((a, b) => a - b);
  };
  const entries = probe.points.map((point) => {
    const center = delta(point, 2), left = delta(point.left, 1), right = delta(point.right, 1);
    const centerPeak = center.at(-1) ?? 0, leftMedian = left[Math.floor(left.length / 2)] ?? Infinity, rightMedian = right[Math.floor(right.length / 2)] ?? Infinity;
    return { point, centerPeak, leftMedian, rightMedian, visible: centerPeak >= 24 && leftMedian <= 10 && rightMedian <= 10 };
  });
  return { width: changed.width, height: changed.height, entries, qualifying: entries.filter(({ visible }) => visible).length };
}

function gpu() {
  const { context, renderer, state, canvas } = live();
  const extension = context.getExtension("WEBGL_debug_renderer_info");
  return {
    origin: location.origin, secureContext: window.isSecureContext, backend: "webgl2",
    debugVendor: extension ? String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
    debugRenderer: extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
    version: String(context.getParameter(context.VERSION)), contextLost: context.isContextLost(),
    attributes: context.getContextAttributes(), pixelRatio: renderer.getPixelRatio(),
    width: canvas.width, height: canvas.height, calls: renderer.info.render.calls,
    camera: { position: state.camera.position.toArray(), matrixWorld: state.camera.matrixWorld.toArray(), projection: state.camera.projectionMatrix.toArray() },
  };
}
function markers() {
  const { state, canvas } = live(), rect = canvas.getBoundingClientRect(), values: unknown[] = [];
  state.scene.traverse((object) => {
    if (!(object instanceof Points) || !(object.material instanceof PointsMaterial) || object.material.size !== 10
      || object.geometry.getAttribute("position")?.count !== 1) return;
    const world = new Vector3().setFromMatrixPosition(object.matrixWorld), ndc = world.clone().project(state.camera);
    values.push({ local: object.position.toArray(), world: world.toArray(), matrixWorld: object.matrixWorld.toArray(),
      colorSrgb: object.material.color.getHexString(SRGBColorSpace),
      x: rect.left + (ndc.x + 1) * rect.width / 2, y: rect.top + (1 - ndc.y) * rect.height / 2,
      size: object.material.size, depthTest: object.material.depthTest });
  });
  return values;
}
function display() {
  const { state } = live(), meshes: { readonly positions: number[]; readonly normals: number[]; readonly uvs: number[] | null; readonly matrixWorld: number[] }[] = [];
  state.scene.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshPhysicalMaterial)) return;
    const positions = object.geometry.getAttribute("position"), normals = object.geometry.getAttribute("normal"), uvs = object.geometry.getAttribute("uv");
    if (!positions) return;
    if (!normals || normals.count !== positions.count || (uvs && uvs.count !== positions.count)) throw new Error("실제 표면의 normal/UV stream 대응이 없습니다.");
    const values: number[] = [], normalValues: number[] = [], uvValues: number[] = [];
    for (let index = 0; index < positions.count; index++) {
      values.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      normalValues.push(normals.getX(index), normals.getY(index), normals.getZ(index));
      if (uvs) uvValues.push(uvs.getX(index), uvs.getY(index));
    }
    meshes.push({ positions: values, normals: normalValues, uvs: uvs ? uvValues : null, matrixWorld: object.matrixWorld.toArray() });
  });
  if (meshes.length !== 1) throw new Error("실제 표시 표면을 하나로 읽지 못했습니다.");
  return { meshes, markers: markers() };
}
/** 스크린샷은 브라우저 native PNG decoder로 읽는다. 2D 디코딩을 GPU 실행 증거로 취급하지 않는다. */
async function inspectScreenshot(base64: string, point?: { readonly x: number; readonly y: number }) {
  const raw = atob(base64), bytes = Uint8Array.from(raw, (letter) => letter.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("스크린샷 native 디코딩용 Canvas를 만들지 못했습니다.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data, colors = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4) colors.add((pixels[index] ?? 0) * 65536 + (pixels[index + 1] ?? 0) * 256 + (pixels[index + 2] ?? 0));
    const rect = live().canvas.getBoundingClientRect();
    const x = point ? Math.round((point.x - rect.left) * bitmap.width / rect.width) : -1;
    const y = point ? Math.round((point.y - rect.top) * bitmap.height / rect.height) : -1;
    const patch: number[][] = [];
    if (point) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const offset = ((y + dy) * bitmap.width + x + dx) * 4;
      if (x + dx >= 0 && x + dx < bitmap.width && y + dy >= 0 && y + dy < bitmap.height) patch.push(Array.from(pixels.slice(offset, offset + 4)));
    }
    return { width: bitmap.width, height: bitmap.height, distinctColors: colors.size, patch };
  } finally { bitmap.close(); }
}
function changed(workspace: StudioHybridDccWorkspace) {
  current = workspace; notifications++;
  const output = document.getElementById("authority");
  if (output) output.textContent = JSON.stringify(observe(), null, 2);
}
const api = Object.freeze({ observe, targets, healingTargets, selectedEdges, gpu, markers, display, wire, inspectScreenshot, inspectWireScreenshots,
  beginPointerTrace, pointerTrace: () => pointerTrace ? { capacity: 48, ...pointerTrace, rows: [...pointerTrace.rows] } : null,
  shutdown() { stopPointerTrace?.(); if (mounted) { mounted = false; root.unmount(); } } });
declare global { interface Window { __boundaryChordQa: typeof api; } }
window.__boundaryChordQa = api;
root.render(<main className="h-screen min-h-0" data-boundary-chord-proof="actual-panel">
  <StudioHybridDccPanel initialWorkspace={initial} workspaceDocumentId={DOCUMENT_ID} onWorkspaceChange={changed} />
</main>);
const output = document.getElementById("authority");
if (output) output.textContent = JSON.stringify(observe(), null, 2);
