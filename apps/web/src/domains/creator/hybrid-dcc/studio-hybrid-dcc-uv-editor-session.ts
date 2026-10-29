/** UV 편집 화면의 좌표 변환과 선택 판정. 저장 좌표의 V는 위쪽이며 타일 밖도 자르지 않는다. */
import type { StudioMeshUvCorner } from "../mesh-uv/studio-mesh-uv-authority";
import type { StudioHybridDccUvEditorModel, StudioHybridDccUvTransform } from "./studio-hybrid-dcc-uv-edit";

export interface StudioUvViewBox { readonly x: number; readonly y: number; readonly size: number }
export type StudioUvFields = Readonly<Record<"u" | "v" | "angle", string>>;
export const studioUvDefaultFields = (kind: StudioHybridDccUvTransform["kind"]): StudioUvFields => ({ u: kind === "scale" ? "1" : "0", v: kind === "scale" ? "1" : "0", angle: "0" });

export function studioUvTransformRequest(kind: StudioHybridDccUvTransform["kind"], fields: StudioUvFields): StudioHybridDccUvTransform | null {
  const number = (text: string) => text.trim() === "" ? NaN : Number(text);
  if (kind === "rotate") {
    const value = number(fields.angle);
    return Number.isFinite(value) ? { kind, angleRad: value * Math.PI / 180 } : null;
  }
  const x = number(fields.u); const y = number(fields.v);
  return Number.isFinite(x) && Number.isFinite(y) ? { kind, value: { x, y } } : null;
}

export function studioUvViewBox(corners: readonly StudioMeshUvCorner[]): StudioUvViewBox {
  let minU = 0; let maxU = 1; let minV = 0; let maxV = 1;
  for (const { u, v } of corners) { minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
  const span = Math.max(maxU - minU, maxV - minV, 1);
  const size = span * 1.16;
  return { x: (minU + maxU - size) / 2, y: -(minV + maxV + size) / 2, size };
}

/** preserveAspectRatio=xMidYMid meet의 여백도 반영해 화면 비율이 달라도 선택 위치를 보존한다. */
export function studioUvClientPoint(view: StudioUvViewBox, rect: Pick<DOMRect, "left" | "top" | "width" | "height">, x: number, y: number): { readonly u: number; readonly v: number } | null {
  const side = Math.min(rect.width, rect.height);
  if (!(side > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const px = x - rect.left - (rect.width - side) / 2;
  const py = y - rect.top - (rect.height - side) / 2;
  if (px < 0 || px > side || py < 0 || py > side) return null;
  return { u: view.x + px / side * view.size, v: -(view.y + py / side * view.size) };
}

function segmentDistance(u: number, v: number, a: StudioMeshUvCorner, b: StudioMeshUvCorner): number {
  const du = b.u - a.u; const dv = b.v - a.v;
  const t = Math.max(0, Math.min(1, ((u - a.u) * du + (v - a.v) * dv) / (du * du + dv * dv || 1)));
  return Math.hypot(u - a.u - t * du, v - a.v - t * dv);
}

/** 코너는 동일 좌표라도 별도 ID다. 겹친 후보는 목록에서 각각 선택할 수 있다. */
export function studioUvHitTest(model: StudioHybridDccUvEditorModel, mode: "island" | "corner", u: number, v: number, radius: number): number | null {
  if (mode === "corner") {
    let best: number | null = null; let distance = radius;
    for (const corner of model.corners) {
      const next = Math.hypot(u - corner.u, v - corner.v);
      if (next < distance || (next === distance && best === null)) { distance = next; best = corner.halfEdgeId; }
    }
    return best;
  }
  for (const island of model.islands) {
    for (const { corners } of island.polygons) {
      let inside = false;
      for (let index = 0; index < corners.length; index += 1) {
        const a = corners[index]; const b = corners[(index + 1) % corners.length];
        if (!a || !b) continue;
        if (segmentDistance(u, v, a, b) <= radius) return island.id;
        if ((a.v > v) !== (b.v > v) && u < (b.u - a.u) * (v - a.v) / (b.v - a.v) + a.u) inside = !inside;
      }
      if (inside) return island.id;
    }
  }
  return null;
}

export function studioUvPolygonPath(model: StudioHybridDccUvEditorModel, islandIds?: ReadonlySet<number>): string {
  return model.islands.filter(({ id }) => !islandIds || islandIds.has(id)).flatMap(({ polygons }) => polygons.map(({ corners }) => corners.map(({ u, v }, index) => `${index === 0 ? "M" : "L"}${u} ${-v}`).join("") + "Z")).join("");
}
