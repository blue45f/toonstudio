/** UV 좌표를 수정하지 않고 원본 삼각형·코너에 대응시켜 seam 양쪽을 측정한다. */
export const UV_EPSILON = 1e-6;

// 좌표 단위는 정규화된 atlas UV다. 두 끝점 각각의 성분별 최대 차이를 비교한다.
const MAX_ATLAS_RESOLUTION = 8192;
const MAX_ATLAS_COUNT = 16;
const MAX_VERTICES_PER_MESH = 65535;

class ContractError extends Error {
  constructor(scope, detail) {
    super(detail);
    this.name = "ContractError";
    this.scope = scope;
  }
}

function requireContract(condition, scope, detail) {
  if (!condition) throw new ContractError(scope, detail);
}

function numericBuffer(value, scope, label, multiple) {
  const arrayLike = Array.isArray(value)
    || (ArrayBuffer.isView(value) && !(value instanceof DataView));
  requireContract(arrayLike, scope, `${label}는 숫자 배열이어야 합니다.`);
  requireContract(
    Number.isSafeInteger(value.length) && value.length > 0 && value.length % multiple === 0,
    scope,
    `${label} 길이가 비어 있거나 ${multiple} 단위와 다릅니다.`,
  );
  for (let index = 0; index < value.length; index += 1) {
    requireContract(
      typeof value[index] === "number" && Number.isFinite(value[index]),
      scope,
      `${label}[${index}]가 유한한 숫자가 아닙니다.`,
    );
  }
  return value;
}

function vertexIndex(value, count, scope, label) {
  requireContract(
    Number.isSafeInteger(value) && value >= 0 && value < count,
    scope,
    `${label}가 정점 범위 밖입니다.`,
  );
  return value;
}

function physicalEdgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// 순환 회전만 동일시한다. 뒤집힌 winding과 정점 집합만 같은 삼각형은 동일시하지 않는다.
function cyclicOrientedKey(vertices) {
  const [a, b, c] = vertices;
  const rotations = [`${a},${b},${c}`, `${b},${c},${a}`, `${c},${a},${b}`];
  rotations.sort();
  return rotations[0];
}

function validateFixture(fixture) {
  const scope = "fixture";
  requireContract(fixture !== null && typeof fixture === "object", scope, "fixture가 없습니다.");
  requireContract(typeof fixture.id === "string" && fixture.id.length > 0, scope, "fixture id가 없습니다.");
  requireContract(
    fixture.expectation === "strict-seam" || fixture.expectation === "observe",
    scope,
    "fixture expectation이 올바르지 않습니다.",
  );
  const positions = numericBuffer(fixture.positions, scope, "positions", 3);
  const indices = numericBuffer(fixture.indices, scope, "indices", 3);
  const uv = numericBuffer(fixture.uv, scope, "uv", 2);
  const sourceVertexIds = numericBuffer(fixture.sourceVertexIds, scope, "sourceVertexIds", 1);
  const vertexCount = positions.length / 3;
  requireContract(vertexCount <= MAX_VERTICES_PER_MESH, scope, "입력 정점 예산을 넘었습니다.");
  requireContract(uv.length === vertexCount * 2, scope, "입력 UV는 정점마다 한 쌍이어야 합니다.");
  requireContract(sourceVertexIds.length === vertexCount, scope, "물리 정점 대응표 길이가 다릅니다.");
  requireContract(
    fixture.options !== null && typeof fixture.options === "object"
      && typeof fixture.options.useInputMeshUvs === "boolean"
      && typeof fixture.options.textureSeamWeight === "number"
      && Number.isFinite(fixture.options.textureSeamWeight)
      && fixture.options.textureSeamWeight >= 0
      && fixture.options.textureSeamWeight <= 1000000,
    scope,
    "입력 chart 옵션이 올바르지 않습니다.",
  );
  const physicalPositions = new Map();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const physical = sourceVertexIds[vertex];
    requireContract(Number.isSafeInteger(physical) && physical >= 0, scope, "물리 정점 ID가 올바르지 않습니다.");
    const existing = physicalPositions.get(physical);
    if (existing !== undefined) {
      for (let axis = 0; axis < 3; axis += 1) {
        requireContract(
          positions[existing * 3 + axis] === positions[vertex * 3 + axis],
          scope,
          `물리 정점 ${physical}의 복제 위치가 일치하지 않습니다.`,
        );
      }
    } else {
      physicalPositions.set(physical, vertex);
    }
  }
  const triangles = [];
  const trianglesByKey = new Map();
  const edgeIncidents = new Map();
  const usedInputVertices = new Set();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertices = [0, 1, 2].map((corner) => vertexIndex(indices[offset + corner], vertexCount, scope, "입력 인덱스"));
    const physicals = vertices.map((vertex) => sourceVertexIds[vertex]);
    requireContract(new Set(vertices).size === 3 && new Set(physicals).size === 3, scope, "입력 삼각형에 중복 정점이 있습니다.");
    const a = vertices[0] * 3;
    const b = vertices[1] * 3;
    const c = vertices[2] * 3;
    const ab = [0, 1, 2].map((axis) => positions[b + axis] - positions[a + axis]);
    const ac = [0, 1, 2].map((axis) => positions[c + axis] - positions[a + axis]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    requireContract(cross.some((component) => component !== 0), scope, "입력 삼각형의 3D 면적이 0입니다.");
    const triangleId = offset / 3;
    const key = cyclicOrientedKey(vertices);
    requireContract(!trianglesByKey.has(key), scope, "원본 입력 삼각형의 방향 키가 중복되어 코너 대응이 모호합니다.");
    const triangle = { triangleId, vertices, physicals };
    triangles.push(triangle);
    trianglesByKey.set(key, triangle);
    for (let corner = 0; corner < 3; corner += 1) {
      usedInputVertices.add(vertices[corner]);
      const next = (corner + 1) % 3;
      const edgeKey = physicalEdgeKey(physicals[corner], physicals[next]);
      const incident = { triangleId, fromCorner: corner, toCorner: next };
      const incidents = edgeIncidents.get(edgeKey) ?? [];
      incidents.push(incident);
      edgeIncidents.set(edgeKey, incidents);
    }
  }
  requireContract(usedInputVertices.size === vertexCount, scope, "입력에 사용되지 않는 정점이 있습니다.");
  requireContract(Array.isArray(fixture.markedEdges), scope, "markedEdges가 배열이 아닙니다.");
  requireContract(fixture.expectation !== "strict-seam" || fixture.markedEdges.length > 0, scope, "strict-seam에는 측정할 edge가 필요합니다.");
  const labels = new Set();
  const markedEdges = fixture.markedEdges.map((edge) => {
    requireContract(edge !== null && typeof edge === "object" && typeof edge.label === "string" && edge.label.length > 0, scope, "marked edge label이 없습니다.");
    requireContract(!labels.has(edge.label), scope, "marked edge label이 중복됩니다.");
    labels.add(edge.label);
    requireContract(Array.isArray(edge.sourceVertexPair) && edge.sourceVertexPair.length === 2, scope, "marked edge의 물리 정점 쌍이 올바르지 않습니다.");
    const [a, b] = edge.sourceVertexPair;
    requireContract(Number.isSafeInteger(a) && Number.isSafeInteger(b) && a >= 0 && b >= 0 && a !== b, scope, "marked edge의 물리 정점 ID가 올바르지 않습니다.");
    const incidents = edgeIncidents.get(physicalEdgeKey(a, b)) ?? [];
    requireContract(incidents.length === 2 && incidents[0].triangleId !== incidents[1].triangleId, scope, `marked edge ${edge.label}는 정확히 두 원본 삼각형에 나타나야 합니다.`);
    const fromA = triangles[incidents[0].triangleId].physicals[incidents[0].fromCorner];
    const fromB = triangles[incidents[1].triangleId].physicals[incidents[1].fromCorner];
    requireContract(fromA !== fromB, scope, `marked edge ${edge.label} 양쪽 winding이 반대 방향이 아닙니다.`);
    return { label: edge.label, sourceVertexPair: [a, b], incidents };
  });
  return { positions, vertexCount, physicalVertexCount: physicalPositions.size, triangles, trianglesByKey, markedEdges };
}

function inspectValidOutput(fixture, source, output) {
  const scope = "output";
  requireContract(output !== null && typeof output === "object", scope, "출력이 없습니다.");
  const positions = numericBuffer(output.positions, scope, "positions", 3);
  const uv = numericBuffer(output.uv, scope, "uv", 2);
  const indices = numericBuffer(output.indices, scope, "indices", 3);
  const provenance = numericBuffer(output.originalInputVertexIndices, scope, "originalInputVertexIndices", 1);
  const vertexCount = positions.length / 3;
  requireContract(vertexCount <= MAX_VERTICES_PER_MESH, scope, "출력 정점 예산을 넘었습니다.");
  requireContract(uv.length === vertexCount * 2 && provenance.length === vertexCount, scope, "출력 위치·UV·원본 대응표 길이가 다릅니다.");
  requireContract(indices.length / 3 === source.triangles.length, scope, "출력 삼각형 수가 원본과 다릅니다.");
  const atlas = output.atlas;
  requireContract(atlas !== null && typeof atlas === "object", scope, "atlas 메타데이터가 없습니다.");
  requireContract(Number.isSafeInteger(atlas.width) && atlas.width > 0 && atlas.width <= MAX_ATLAS_RESOLUTION, scope, "atlas width가 범위 밖입니다.");
  requireContract(Number.isSafeInteger(atlas.height) && atlas.height > 0 && atlas.height <= MAX_ATLAS_RESOLUTION, scope, "atlas height가 범위 밖입니다.");
  requireContract(Number.isSafeInteger(atlas.atlasCount) && atlas.atlasCount > 0 && atlas.atlasCount <= MAX_ATLAS_COUNT, scope, "atlasCount가 범위 밖입니다.");
  // 정점별 atlas 식별자가 없는 현재 출력 계약으로 여러 atlas의 UV 연속성을 판정하지 않는다.
  requireContract(atlas.atlasCount === 1, scope, "여러 atlas는 정점별 atlas 대응 정보가 없어 이 oracle의 측정 범위 밖입니다.");
  const uniqueInputReferences = new Set();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const inputVertex = vertexIndex(provenance[vertex], source.vertexCount, scope, "출력 원본 대응표");
    uniqueInputReferences.add(inputVertex);
    for (let axis = 0; axis < 3; axis += 1) {
      requireContract(positions[vertex * 3 + axis] === source.positions[inputVertex * 3 + axis], scope, `출력 정점 ${vertex}의 위치가 대응 입력 정점과 다릅니다.`);
    }
    for (let axis = 0; axis < 2; axis += 1) {
      const value = uv[vertex * 2 + axis];
      requireContract(value >= -UV_EPSILON && value <= 1 + UV_EPSILON, scope, `출력 정점 ${vertex}의 UV가 정규화 범위 밖입니다.`);
    }
  }
  const reboundCorners = source.triangles.map(() => [null, null, null]);
  const seenSourceTriangles = new Set();
  const usedOutputVertices = new Set();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const outputVertices = [0, 1, 2].map((corner) => vertexIndex(indices[offset + corner], vertexCount, scope, "출력 인덱스"));
    requireContract(new Set(outputVertices).size === 3, scope, "출력 삼각형에 중복 정점 인덱스가 있습니다.");
    const inputVertices = outputVertices.map((vertex) => provenance[vertex]);
    const triangle = source.trianglesByKey.get(cyclicOrientedKey(inputVertices));
    requireContract(triangle !== undefined, scope, "출력 삼각형을 동일 winding의 원본 입력 삼각형에 대응시킬 수 없습니다.");
    requireContract(!seenSourceTriangles.has(triangle.triangleId), scope, "출력에서 같은 원본 삼각형이 중복되었습니다.");
    seenSourceTriangles.add(triangle.triangleId);
    for (let corner = 0; corner < 3; corner += 1) {
      const outputVertex = outputVertices[corner];
      const inputVertex = inputVertices[corner];
      const sourceCorner = triangle.vertices.indexOf(inputVertex);
      requireContract(sourceCorner >= 0 && reboundCorners[triangle.triangleId][sourceCorner] === null, scope, "원본 코너 대응이 중복되거나 누락되었습니다.");
      reboundCorners[triangle.triangleId][sourceCorner] = {
        inputVertexId: inputVertex,
        outputVertexId: outputVertex,
        uv: [uv[outputVertex * 2], uv[outputVertex * 2 + 1]],
      };
      usedOutputVertices.add(outputVertex);
    }
  }
  requireContract(seenSourceTriangles.size === source.triangles.length, scope, "원본 삼각형 일부가 출력에서 누락되었습니다.");
  requireContract(usedOutputVertices.size === vertexCount, scope, "출력에 사용되지 않는 정점이 있습니다.");
  const observations = source.markedEdges.map((edge) => {
    const sides = edge.incidents.map((incident) => {
      const triangle = source.triangles[incident.triangleId];
      const endpoints = edge.sourceVertexPair.map((physical) => {
        const corner = triangle.physicals.indexOf(physical);
        const rebound = reboundCorners[triangle.triangleId][corner];
        requireContract(corner >= 0 && rebound !== null, scope, `marked edge ${edge.label}의 코너 대응이 없습니다.`);
        return rebound;
      });
      return {
        triangleId: triangle.triangleId,
        inputVertexIds: endpoints.map((endpoint) => endpoint.inputVertexId),
        outputVertexIds: endpoints.map((endpoint) => endpoint.outputVertexId),
        uvEndpoints: endpoints.map((endpoint) => endpoint.uv),
      };
    });
    const endpointMaxAbsDeltas = [0, 1].map((endpoint) => Math.max(
      Math.abs(sides[0].uvEndpoints[endpoint][0] - sides[1].uvEndpoints[endpoint][0]),
      Math.abs(sides[0].uvEndpoints[endpoint][1] - sides[1].uvEndpoints[endpoint][1]),
    ));
    const continuous = endpointMaxAbsDeltas.every((delta) => delta <= UV_EPSILON);
    return { label: edge.label, sourceVertexPair: edge.sourceVertexPair, sides, endpointMaxAbsDeltas, continuous, discontinuous: !continuous };
  });
  const strict = fixture.expectation === "strict-seam";
  const featurePass = strict ? observations.every((edge) => edge.discontinuous) : null;
  const errors = strict
    ? observations.filter((edge) => edge.continuous).map((edge) => ({ code: "marked-edge-remains-continuous", detail: `선택 edge ${edge.label}의 양끝 UV가 모두 허용 오차 안에서 연속입니다.` }))
    : [];
  return {
    fixtureId: fixture.id,
    expectation: fixture.expectation,
    ok: !strict || featurePass,
    status: strict ? (featurePass ? "strict-seam-pass" : "strict-seam-fail") : "observe-only",
    featurePass,
    geometryValid: true,
    uvEpsilon: UV_EPSILON,
    uvEpsilonMetric: "each-endpoint-max-absolute-component-delta",
    uvCoordinateSpace: "normalized-atlas",
    atlas: { width: atlas.width, height: atlas.height, atlasCount: atlas.atlasCount },
    geometry: {
      inputVertexCount: source.vertexCount,
      physicalVertexCount: source.physicalVertexCount,
      outputVertexCount: vertexCount,
      sourceTriangleCount: source.triangles.length,
      outputTriangleCount: indices.length / 3,
      // 정점 수 증가는 관찰값이며 seam 성공 조건으로 사용하지 않는다.
      outputAdditionalVertexReferences: vertexCount - uniqueInputReferences.size,
    },
    observations,
    errors,
  };
}

/** 입력과 출력을 변경하지 않는다. observe-only의 ok는 형상·범위 검사만 의미한다. */
export function inspectResult(fixture, output) {
  try {
    const source = validateFixture(fixture);
    return inspectValidOutput(fixture, source, output);
  } catch (error) {
    const known = error instanceof ContractError;
    return {
      fixtureId: typeof fixture?.id === "string" ? fixture.id : null,
      expectation: fixture?.expectation ?? null,
      ok: false,
      status: known && error.scope === "fixture" ? "invalid-fixture" : "invalid-output",
      featurePass: null,
      geometryValid: false,
      uvEpsilon: UV_EPSILON,
      observations: [],
      errors: [{ code: known ? `invalid-${error.scope}` : "oracle-error", detail: error instanceof Error ? error.message : String(error) }],
    };
  }
}
