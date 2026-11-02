/** 고정 엔진의 seam 가능성만 관찰하는 입력이다. 제품 기능의 완료 증거로 사용하지 않는다. */

function continuousControl() {
  return {
    id: "coplanar-shared-continuous-control",
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
    uv: [0, 0, 1, 0, 1, 1, 0, 1],
    sourceVertexIds: [0, 1, 2, 3],
    // 이 edge는 연속 입력의 관찰 대조군이며 seam 성공 판정을 요구하지 않는다.
    markedEdges: [{ label: "continuous-diagonal-control", sourceVertexPair: [0, 2] }],
    options: { useInputMeshUvs: true, textureSeamWeight: 0.5 },
    expectation: "observe",
  };
}

function duplicatedDiagonal(useInputMeshUvs, expectation) {
  return {
    id: useInputMeshUvs
      ? "coplanar-duplicated-uv-cut-input-uv-enabled"
      : "coplanar-duplicated-uv-cut-input-uv-disabled-observe",
    // 두 삼각형의 대각선 양끝은 같은 물리 위치지만 입력 정점은 다르다.
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 3, 4, 5],
    // 두 면의 UV 방향은 같고 대각선 양쪽의 UV 위치만 분리한다.
    uv: [0, 0, 0.4, 0, 0.4, 0.4, 0.6, 0, 1, 0.4, 0.6, 0.4],
    sourceVertexIds: [0, 1, 2, 0, 2, 3],
    markedEdges: [{ label: "duplicated-diagonal-cut", sourceVertexPair: [0, 2] }],
    options: { useInputMeshUvs, textureSeamWeight: 0.5 },
    expectation,
  };
}

function cylinderSideStrip() {
  // 마지막 열은 첫 열과 정확히 같은 위치를 사용한다. 삼각함수 반올림 차이는 넣지 않는다.
  const ring = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]];
  const positions = [];
  const uv = [];
  const sourceVertexIds = [];
  const indices = [];
  for (let column = 0; column < ring.length; column += 1) {
    const [x, z] = ring[column];
    positions.push(x, 0, z, x, 1, z);
    uv.push(column / 4, 0, column / 4, 1);
    sourceVertexIds.push((column % 4) * 2, (column % 4) * 2 + 1);
  }
  for (let segment = 0; segment < 4; segment += 1) {
    const bottom = segment * 2;
    const top = bottom + 1;
    const nextBottom = bottom + 2;
    const nextTop = bottom + 3;
    // 外向き winding을 유지하며 모든 면은 절개선을 거치지 않는 strip 경로로 연결한다.
    indices.push(bottom, top, nextTop, bottom, nextTop, nextBottom);
  }
  return {
    id: "cylinder-side-four-segments-single-cut-connected-strip",
    positions,
    indices,
    uv,
    sourceVertexIds,
    markedEdges: [{ label: "cylinder-closing-vertical-cut", sourceVertexPair: [0, 1] }],
    options: { useInputMeshUvs: true, textureSeamWeight: 0.5 },
    expectation: "strict-seam",
  };
}

/** 호출마다 독립 배열을 갖는, JSON으로 직렬화할 수 있는 입력 사례를 반환한다. */
export function createCases() {
  return [
    continuousControl(),
    duplicatedDiagonal(false, "observe"),
    duplicatedDiagonal(true, "strict-seam"),
    cylinderSideStrip(),
  ];
}
