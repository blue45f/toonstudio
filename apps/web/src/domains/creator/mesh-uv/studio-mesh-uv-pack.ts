/** 웹 자체의 결정적 shelf AABB 배치. Blender pack 결과·최적 밀도를 보증하지 않는다. */
import { validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, type StudioMeshUvCorner, type StudioMeshUvIsland, type StudioMeshUvLayer } from "./studio-mesh-uv-authority";

export interface StudioMeshUvPackOptions { readonly margin: number; readonly rotate: boolean }
export interface StudioMeshUvPackResult {
  readonly uvLayer: StudioMeshUvLayer;
  readonly islandCount: number;
  readonly rotatedIslandCount: number;
  readonly scale: number;
  /** 요청한 margin의 하한. 0에서도 exact UV 연결 보호를 위해 2^-20을 확보한다. */
  readonly effectiveMargin: number;
}
export const STUDIO_MESH_UV_PACK_DEFAULT_OPTIONS: StudioMeshUvPackOptions = Object.freeze({ margin: 0.02, rotate: true });
export const STUDIO_MESH_UV_PACK_MAX_MARGIN = 0.25;
export const STUDIO_MESH_UV_PACK_MIN_EFFECTIVE_MARGIN = 2 ** -20;
const ROUNDING_GUARD = 2 ** -21;
const MAX_LAYOUT_PASSES = 24;

export class StudioMeshUvPackError extends Error {
  constructor(readonly code: "invalid-options" | "invalid-source" | "collapsed-island" | "margin-infeasible" | "precision-limit" | "budget-exceeded", message: string) {
    super(message); this.name = "StudioMeshUvPackError";
  }
}
function fail(code: StudioMeshUvPackError["code"], message: string): never { throw new StudioMeshUvPackError(code, message); }
interface Bounds { minU: number; minV: number; maxU: number; maxV: number }
interface Chart extends StudioMeshUvIsland { readonly bounds: Bounds; readonly width: number; readonly height: number; readonly rotated: boolean }
interface Cell { readonly chart: Chart; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly row: number }
interface Plan { readonly cells: readonly Cell[]; readonly scale: number }
const emptyBounds = (): Bounds => ({ minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity });
function include(bounds: Bounds, corner: StudioMeshUvCorner): void {
  bounds.minU = Math.min(bounds.minU, corner.u); bounds.maxU = Math.max(bounds.maxU, corner.u);
  bounds.minV = Math.min(bounds.minV, corner.v); bounds.maxV = Math.max(bounds.maxV, corner.v);
}
function cross(a: StudioMeshUvCorner, b: StudioMeshUvCorner, c: StudioMeshUvCorner): number {
  return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
}
function faceLoop(mesh: StudioEditableMesh, faceId: number): readonly number[] {
  const start = mesh.faces[faceId]!.he;
  const ids: number[] = [];
  let id = start;
  do { ids.push(id); id = mesh.halfEdges[id]!.next; } while (id !== start);
  return ids;
}

/** 후보 수는 최대 24, 각 후보는 O(N)이다. 임의의 island 수 제한으로 메시를 잘라내지 않는다. */
function layout(charts: readonly Chart[], span: number, gap: number): Plan {
  const count = charts.length;
  const candidates = new Set([1, count, Math.max(1, Math.floor(Math.sqrt(count))), Math.ceil(Math.sqrt(count))]);
  for (let columns = 2; columns < count; columns *= 2) candidates.add(columns);
  if (candidates.size > MAX_LAYOUT_PASSES) fail("budget-exceeded", "UV 배치 탐색 예산을 넘었습니다.");
  let best: { columns: number; scale: number } | null = null;
  for (const columns of [...candidates].sort((a, b) => a - b)) {
    let scale = Infinity; let totalHeight = 0; let rows = 0;
    for (let start = 0; start < count; start += columns) {
      const end = Math.min(count, start + columns);
      let width = 0; let height = 0;
      for (let index = start; index < end; index += 1) {
        const chart = charts[index]!; width += chart.width / span; height = Math.max(height, chart.height / span);
      }
      const room = 1 - 2 * gap - (end - start - 1) * gap;
      scale = Math.min(scale, room / width); totalHeight += height; rows += 1;
    }
    scale = Math.min(scale, (1 - 2 * gap - (rows - 1) * gap) / totalHeight);
    // 저장한 Float32 폭의 수 ulp 차이로 동률 배치의 행·열이 뒤집히지 않게 한다.
    if (scale > 0 && Number.isFinite(scale) && (!best || scale > best.scale * (1 + 1e-6))) best = { columns, scale };
  }
  if (!best) fail("margin-infeasible", "현재 아일랜드 수에 요청한 UV 여백을 확보할 수 없습니다. 여백을 줄이세요.");
  const cells: Cell[] = [];
  let y = gap;
  for (let start = 0, row = 0; start < count; start += best.columns, row += 1) {
    let x = gap; let height = 0;
    for (let index = start; index < Math.min(count, start + best.columns); index += 1) {
      const chart = charts[index]!; const w = chart.width / span * best.scale; const h = chart.height / span * best.scale;
      cells.push({ chart, x, y, width: w, height: h, row }); x += w + gap; height = Math.max(height, h);
    }
    y += height + gap;
  }
  return { cells, scale: best.scale };
}

/** 예약 사각형 포함·같은 행의 인접 간격·행 간격으로 모든 쌍의 분리를 선형 검증한다. */
function verifyPlacement(layer: StudioMeshUvLayer, plan: Plan, margin: number): void {
  let row = -1; let previousRight = -Infinity; let previousRowTop = -Infinity; let rowTop = -Infinity; let rowBottom = Infinity;
  const finishRow = () => {
    if (rowBottom - previousRowTop < margin) fail("precision-limit", "Float32 UV에서 행 사이 여백을 확보할 수 없습니다. 여백이나 입력 좌표를 조정하세요.");
    previousRowTop = rowTop;
  };
  for (const cell of plan.cells) {
    if (row !== cell.row) {
      if (row !== -1) finishRow();
      row = cell.row; previousRight = -Infinity; rowTop = -Infinity; rowBottom = Infinity;
    }
    const bounds = emptyBounds();
    for (const id of cell.chart.cornerIds) include(bounds, layer.corners[id]!);
    if (!(bounds.maxU > bounds.minU && bounds.maxV > bounds.minV)
      || bounds.minU < margin || bounds.minV < margin || bounds.maxU > 1 - margin || bounds.maxV > 1 - margin
      || bounds.minU < cell.x - ROUNDING_GUARD || bounds.maxU > cell.x + cell.width + ROUNDING_GUARD
      || bounds.minV < cell.y - ROUNDING_GUARD || bounds.maxV > cell.y + cell.height + ROUNDING_GUARD
      || bounds.minU - previousRight < margin) fail("precision-limit", "Float32 UV에서 형태 또는 여백을 보존할 수 없습니다. 입력 좌표나 여백을 조정하세요.");
    previousRight = bounds.maxU; rowBottom = Math.min(rowBottom, bounds.minV); rowTop = Math.max(rowTop, bounds.maxV);
  }
  finishRow();
}
function verifyShape(mesh: StudioEditableMesh, before: StudioMeshUvLayer, after: StudioMeshUvLayer): void {
  const equal = (layer: StudioMeshUvLayer, a: number, b: number) => layer.corners[a]!.u === layer.corners[b]!.u && layer.corners[a]!.v === layer.corners[b]!.v;
  for (const edge of mesh.halfEdges) {
    if (edge.twin < 0 || edge.id > edge.twin) continue;
    const twin = mesh.halfEdges[edge.twin]!;
    if (equal(before, edge.id, twin.next) !== equal(after, edge.id, twin.next)
      || equal(before, edge.next, twin.id) !== equal(after, edge.next, twin.id)) fail("precision-limit", "Float32 UV 정리로 기존 UV 경계의 연결이 달라집니다. 원본을 보존하기 위해 취소했습니다.");
  }
  for (const face of mesh.faces) {
    const ids = faceLoop(mesh, face.id); const a = ids[0]!;
    for (let index = 0; index < ids.length; index += 1) {
      const first = ids[index]!; const second = ids[(index + 1) % ids.length]!;
      const b0 = before.corners[first]!; const b1 = before.corners[second]!;
      const a0 = after.corners[first]!; const a1 = after.corners[second]!;
      if ((b0.u !== b1.u || b0.v !== b1.v) && a0.u === a1.u && a0.v === a1.v) fail("precision-limit", "정리 결과의 Float32 UV 모서리가 새로 접힙니다. 입력 좌표의 크기 차이를 줄이세요.");
    }
    for (let index = 1; index + 1 < ids.length; index += 1) {
      const b = ids[index]!; const c = ids[index + 1]!;
      const previous = cross(before.corners[a]!, before.corners[b]!, before.corners[c]!);
      const next = cross(after.corners[a]!, after.corners[b]!, after.corners[c]!);
      if (previous !== 0 && (next === 0 || Math.sign(previous) !== Math.sign(next))) fail("precision-limit", "정리 결과의 Float32 UV 삼각형이 접힙니다. 입력 좌표의 크기 차이를 줄이세요.");
    }
  }
}

export function packStudioMeshCornerUvs(mesh: StudioEditableMesh, options: StudioMeshUvPackOptions = STUDIO_MESH_UV_PACK_DEFAULT_OPTIONS): StudioMeshUvPackResult {
  if (!options || !Number.isFinite(options.margin) || options.margin < 0 || options.margin > STUDIO_MESH_UV_PACK_MAX_MARGIN || typeof options.rotate !== "boolean") fail("invalid-options", "UV 여백은 0 이상 0.25 이하의 유한 값이며 회전 옵션은 참·거짓이어야 합니다.");
  const admitted = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!admitted.ok || !mesh.uvLayer || mesh.faces.length === 0) fail("invalid-source", "현재 메시의 유효한 면 코너 UV를 먼저 펼치세요.");
  const source = mesh.uvLayer;
  const islands = deriveStudioMeshUvIslands(mesh);
  let span = 0;
  const charts: Chart[] = islands.map((island) => {
    const bounds = emptyBounds(); for (const id of island.cornerIds) include(bounds, source.corners[id]!);
    const width = bounds.maxU - bounds.minU; const height = bounds.maxV - bounds.minV;
    if (!(width > 0 && height > 0)) fail("collapsed-island", "너비·높이가 있는 아일랜드만 정리할 수 있습니다. 전체가 접힌 UV를 먼저 펼치세요.");
    span = Math.max(span, width, height);
    const rotated = options.rotate && height > width * (1 + 1e-6);
    return { ...island, bounds, rotated, width: rotated ? height : width, height: rotated ? width : height };
  });
  const effectiveMargin = Math.max(options.margin, STUDIO_MESH_UV_PACK_MIN_EFFECTIVE_MARGIN);
  const plan = layout(charts, span, effectiveMargin + 2 * ROUNDING_GUARD);
  const corners = source.corners.map((corner) => ({ ...corner }));
  for (const cell of plan.cells) {
    for (const id of cell.chart.cornerIds) {
      const uv = source.corners[id]!; const b = cell.chart.bounds;
      const x = cell.chart.rotated ? b.maxV - uv.v : uv.u - b.minU;
      const y = cell.chart.rotated ? uv.u - b.minU : uv.v - b.minV;
      corners[id] = { halfEdgeId: id, u: Math.fround(cell.x + x / span * plan.scale), v: Math.fround(cell.y + y / span * plan.scale) };
    }
  }
  const uvLayer = decodeStudioMeshUvLayer({ ...source, corners }, mesh);
  verifyPlacement(uvLayer, plan, effectiveMargin); verifyShape(mesh, source, uvLayer);
  const rebound = deriveStudioMeshUvIslands({ ...mesh, uvLayer });
  if (rebound.length !== islands.length || rebound.some((island, index) => island.id !== islands[index]?.id
    || island.faceIds.length !== islands[index]?.faceIds.length || island.faceIds.some((id, face) => id !== islands[index]?.faceIds[face]))) fail("precision-limit", "Float32 UV 정리로 아일랜드 연결이 달라집니다. 원본을 보존하기 위해 취소했습니다.");
  // 새 배치와 Float32 수 ulp 이내이고 이미 같은 여백을 만족하면 재정리로 이력을 늘리지 않는다.
  if (corners.every((corner, id) => Math.abs(corner.u - source.corners[id]!.u) <= ROUNDING_GUARD / 2 && Math.abs(corner.v - source.corners[id]!.v) <= ROUNDING_GUARD / 2)) {
    try { verifyPlacement(source, plan, effectiveMargin); return { uvLayer: source, islandCount: islands.length, rotatedIslandCount: 0, scale: 1, effectiveMargin }; }
    catch (error) { if (!(error instanceof StudioMeshUvPackError)) throw error; }
  }
  return { uvLayer, islandCount: islands.length, rotatedIslandCount: charts.filter(({ rotated }) => rotated).length, scale: plan.scale / span, effectiveMargin };
}
