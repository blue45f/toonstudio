import { PlaneGeometry } from "three";

export type SpatialSurface = "cylinder-90deg-canopy" | "dome-120deg-cinema" | "floating-panel-stack";
export type SpatialFocus = "pointed-panel" | "all-panels" | "current-panel";

export function createSpatialPanelGeometry(width: number, height: number, surface: SpatialSurface): PlaneGeometry {
  if (surface === "floating-panel-stack") return new PlaneGeometry(width, height);

  // 가로 중앙선의 호 길이를 원화 너비와 같게 유지한다. 돔은 세로로도 60° 휜다.
  const dome = surface === "dome-120deg-cinema";
  const horizontalArc = dome ? 2 * Math.PI / 3 : Math.PI / 2;
  const verticalArc = Math.PI / 3;
  const radius = width / horizontalArc;
  const geometry = new PlaneGeometry(width, height, 32, dome ? 12 : 1);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const longitude = (uv.getX(i) - 0.5) * horizontalArc;
    const latitude = dome ? (uv.getY(i) - 0.5) * verticalArc : 0;
    const cosLatitude = Math.cos(latitude);
    positions.setXYZ(
      i,
      radius * Math.sin(longitude) * cosLatitude,
      dome ? height / verticalArc * Math.sin(latitude) : positions.getY(i),
      radius * (1 - cosLatitude * Math.cos(longitude)),
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
