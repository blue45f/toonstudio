import * as THREE from "three";

/** 단위 두상(+z가 얼굴)에서 귀 뒤와 뒤통수를 연속으로 감싸는 모발 안쪽 층. */
export function createStudioVrmHairDrape(length: number, wave: number): THREE.BufferGeometry {
  const columns = 48;
  const rows = 20;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = columns + 1;
  const layerSize = stride * (rows + 1);
  for (const inner of [false, true]) {
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      for (let col = 0; col <= columns; col += 1) {
        const u = col / columns;
        const a = THREE.MathUtils.lerp(1.26, 2 * Math.PI - 1.26, u);
        const temple = Math.abs(2 * u - 1) ** 3;
        const flow = a + (0.045 + 0.07 * wave) * Math.sin(t * Math.PI * 1.4 + a);
        const scallop = 0.09 * Math.cos(8 * a + 0.7) + 0.04 * Math.sin(13 * a);
        const hemY = -length * (1 - 0.32 * temple) + scallop;
        const y = THREE.MathUtils.lerp(0.76, hemY, t);
        const skull = Math.sqrt(1 - Math.max(0, y) ** 2);
        const below = THREE.MathUtils.smoothstep(-y, 0, length);
        const groove = Math.cos(12 * flow) * (0.009 + 0.023 * below);
        const lowerWave = wave * below * Math.sin(2.3 * Math.PI * t + a * 1.5) * 0.06;
        const shell = skull * (0.91 + 0.11 * THREE.MathUtils.smoothstep(-y, -0.7, -0.05));
        const r = shell + groove + lowerWave - (inner ? 0.085 : 0);
        positions.push(Math.sin(flow) * r * (1 - 0.1 * below), y, Math.cos(flow) * r - 0.17 * below);
        uvs.push(3 * u, t);
      }
    }
  }
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, d, a, d, c);
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= columns; col += 1) {
      const a = row * stride + col;
      if (row < rows && col < columns) {
        quad(a, a + stride, a + 1, a + stride + 1);
        quad(a + layerSize, a + layerSize + 1, a + layerSize + stride, a + layerSize + stride + 1);
      }
      if ((row === 0 || row === rows) && col < columns) {
        if (row === 0) quad(a, a + 1, a + layerSize, a + layerSize + 1);
        else quad(a, a + layerSize, a + 1, a + layerSize + 1);
      }
      if ((col === 0 || col === columns) && row < rows) {
        if (col === 0) quad(a, a + layerSize, a + stride, a + layerSize + stride);
        else quad(a, a + stride, a + layerSize, a + layerSize + stride);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}
