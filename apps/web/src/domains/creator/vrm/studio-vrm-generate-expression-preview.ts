/**
 * 표정 편집기의 **정면 얼굴 미리보기** 기하.
 *
 * 조형 패널의 일러스트 미리보기는 실제 메시가 아니라 표정을 보여 줄 수 없다. 그래서 생성기가 실제로
 * 굽는 얼굴 프리미티브(흰자·홍채·하이라이트·눈꺼풀 선·눈썹·입)에 고른 표정의 모프 델타를 더해
 * 정면(-Z 방향으로 보는 카메라)으로 투영한다. 내보낼 VRM 과 같은 데이터라 미리보기와 결과가 어긋나지
 * 않는다.
 *
 * 삼각형은 깊이(z) 순으로 칠한다(화가 알고리즘). 하이라이트가 흰자와 같은 프리미티브에 있어도 홍채보다
 * 앞(outset 이 크다)이라 위에 그려진다.
 */

import { rgbToHex } from "./studio-vrm-costume";
import { buildStudioVrmHumanoidMesh } from "./studio-vrm-humanoid-mesh";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";

export type StudioVrmExpressionPreviewShape = {
  readonly color: string;
  /** SVG path 데이터(같은 색 삼각형이 이어진 묶음). */
  readonly path: string;
};

export type StudioVrmExpressionPreview = {
  readonly viewBox: string;
  readonly head: { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };
  readonly skinColor: string;
  readonly shapes: readonly StudioVrmExpressionPreviewShape[];
  /** 모델에 그 이름의 표정이 없으면 `false` — 미리보기는 무표정을 보여 준다. */
  readonly hasExpression: boolean;
};

/** 미터 → 미리보기 단위(mm). 정점 좌표를 소수 둘째 자리로 줄여도 0.01mm 오차라 눈에 띄지 않는다. */
const UNITS_PER_METER = 1000;

function format(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function colorOf(factor: readonly number[] | undefined, fallback: string): string {
  if (!factor) return fallback;
  return rgbToHex({ r: factor[0], g: factor[1], b: factor[2] });
}

type Triangle = { readonly depth: number; readonly color: string; readonly points: readonly number[] };

type FaceMesh = ReturnType<typeof buildStudioVrmHumanoidMesh>;

function previewFromMesh(mesh: FaceMesh, expression: string | null): StudioVrmExpressionPreview {
  const targetIndex = expression === null ? -1 : mesh.morphTargetNames.indexOf(expression);
  const face = mesh.parts[mesh.facePartIndex];
  const head = mesh.rig.head;
  const triangles: Triangle[] = [];

  for (const primitive of face.primitives) {
    const positions = primitive.positions;
    const deltas = targetIndex >= 0 ? primitive.targets?.[targetIndex]?.positions : undefined;
    const indices = primitive.indices;
    if (!indices) continue;
    const material = primitive.material === undefined ? undefined : mesh.materials[primitive.material];
    const color = colorOf(material?.baseColorFactor, "#333333");
    const point = (vertex: number, axis: number) =>
      (positions[vertex * 3 + axis] ?? 0) + (deltas ? deltas[vertex * 3 + axis] ?? 0 : 0);
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const corners = [indices[index], indices[index + 1], indices[index + 2]];
      const points: number[] = [];
      let depth = 0;
      for (const vertex of corners) {
        // 정면에서 본 화면: +X 가 오른쪽(캐릭터의 왼쪽), +Y 가 위. SVG 는 아래로 자라므로 Y 를 뒤집는다.
        points.push((point(vertex, 0) - head.center[0]) * UNITS_PER_METER);
        points.push(-(point(vertex, 1) - head.center[1]) * UNITS_PER_METER);
        depth += point(vertex, 2);
      }
      const area = (points[2] - points[0]) * (points[5] - points[1]) - (points[4] - points[0]) * (points[3] - points[1]);
      // 눈을 감아 납작해진 패치처럼 넓이가 사실상 0 인 삼각형은 그릴 것이 없다.
      if (Math.abs(area) < 1e-6) continue;
      triangles.push({ depth: depth / 3, color, points });
    }
  }

  triangles.sort((left, right) => left.depth - right.depth);
  const shapes: StudioVrmExpressionPreviewShape[] = [];
  let current: { color: string; segments: string[] } | null = null;
  for (const triangle of triangles) {
    const [ax, ay, bx, by, cx, cy] = triangle.points.map(format);
    const segment = `M${ax} ${ay}L${bx} ${by}L${cx} ${cy}Z`;
    if (current && current.color === triangle.color) {
      current.segments.push(segment);
      continue;
    }
    if (current) shapes.push({ color: current.color, path: current.segments.join("") });
    current = { color: triangle.color, segments: [segment] };
  }
  if (current) shapes.push({ color: current.color, path: current.segments.join("") });

  const rx = head.radiusX * UNITS_PER_METER;
  const ry = head.radiusY * UNITS_PER_METER;
  const margin = Math.max(rx, ry) * 0.12;
  const skin = mesh.materials.find((entry) => entry.name === "Skin");
  return {
    viewBox: [-rx - margin, -ry - margin, (rx + margin) * 2, (ry + margin) * 2].map(format).join(" "),
    head: { cx: 0, cy: 0, rx, ry },
    skinColor: colorOf(skin?.baseColorFactor, "#f5cdb8"),
    shapes,
    hasExpression: targetIndex >= 0,
  };
}

/**
 * 조형 상태의 생성 얼굴에 표정을 하나씩 가중치 1로 얹은 정면 미리보기들. `null` 은 무표정이다.
 * 메시는 한 번만 굽는다 — 슬라이더를 움직일 때마다 무표정과 편집 결과를 함께 다시 그린다.
 */
export function buildStudioVrmExpressionPreviews(
  state: AvatarForgeState,
  expressions: readonly (string | null)[],
): StudioVrmExpressionPreview[] {
  const mesh = buildStudioVrmHumanoidMesh(state);
  return expressions.map((expression) => previewFromMesh(mesh, expression));
}
