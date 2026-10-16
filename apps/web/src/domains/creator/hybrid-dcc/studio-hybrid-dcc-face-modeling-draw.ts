/**
 * 면 그리기: 면 안쪽에 점들로 닫힌 볼록 다각형을 그려 면을 도형과 그 둘레 면으로 나눈다.
 *
 * 순수 함수이며 입력 메시를 바꾸지 않는다. 구멍은 만들지 않는다(half-edge가 구멍을 표현하지 못한다):
 * 면에서 도형을 떼어 낸 나머지(구멍 뚫린 고리)는 볼록 조각으로 나누어 면으로 돌려준다. 면의 경계 정점과
 * 모서리는 그대로라 이웃 면은 건드리지 않는다. 규칙과 한계는 docs/features/hybrid-dcc-face-modeling.md.
 */

import {
  createStudioFaceModelingContext,
  createStudioFaceOutput,
  finishStudioFaceOutput,
  prepareStudioConvexFace,
  selectStudioFaceLoops,
  studioFaceEdgeCreases,
  studioPolygonArea,
} from "./studio-hybrid-dcc-face-modeling-context";
import {
  convexPolygonInsetMargin,
  describeStudioPlanarPolygon,
  mergeStudioPlanarPolygons,
  triangulateConvexAnnulus,
  unprojectFromStudioPlanarFrame,
  type StudioPlanarFrame,
  type StudioPlanarPoint,
} from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  failStudioFaceModeling,
  findRenderableStartCorner,
  okStudioFaceModeling,
  STUDIO_FACE_MODELING_LIMITS,
  type StudioFaceModelingOutcome,
  type StudioFaceModelingResult,
} from "./studio-hybrid-dcc-face-modeling-mesh";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";

export interface StudioFaceDrawingGuide {
  readonly frame: StudioPlanarFrame;
  /** 면 좌표계(가로 u, 세로 v)의 반시계 윤곽. */
  readonly outline: readonly StudioPlanarPoint[];
  /** 윤곽 꼭짓점의 정점 ID. */
  readonly vertexIds: readonly number[];
  /** 이보다 가까운 점은 겹친 것으로 본다. */
  readonly minFeature: number;
}

/** 면 그리기 화면이 면 윤곽을 그리고 점을 받을 좌표계를 만든다. 그릴 수 없는 면이면 이유를 돌려준다. */
export function describeStudioEditableMeshFaceForDrawing(
  mesh: StudioEditableMesh,
  faceId: number,
): StudioFaceModelingResult<StudioFaceDrawingGuide> {
  const context = createStudioFaceModelingContext(mesh);
  if (!context.ok) return context;
  const selected = selectStudioFaceLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareStudioConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  return okStudioFaceModeling({
    frame: face.value.frame,
    outline: face.value.polygon,
    vertexIds: face.value.loop.vertexIds,
    minFeature: context.value.minFeature,
  });
}

/**
 * 면 안쪽에 점들로 닫힌 볼록 다각형을 그려 면을 나눈다. 점은 `describeStudioEditableMeshFaceForDrawing`이
 * 알려 주는 면 좌표계(가로 u, 세로 v, 단위는 메시 단위)로 받는다.
 *
 * 규칙: 점 3개 이상, 서로 겹치지 않고, 자기 교차하지 않고, 볼록하며 일직선 점이 없어야 한다. 모든 점이
 * 면 경계에서 `minFeature` 이상 떨어진 면 안쪽이어야 한다(경계에 닿거나 밖으로 나가면 거부).
 * 시계·반시계 입력 순서는 모두 받는다.
 */
export function drawStudioEditableMeshFacePolygon(
  mesh: StudioEditableMesh,
  faceId: number,
  points: readonly StudioPlanarPoint[],
): StudioFaceModelingResult<StudioFaceModelingOutcome> {
  const context = createStudioFaceModelingContext(mesh);
  if (!context.ok) return context;
  const selected = selectStudioFaceLoops(context.value, [faceId]);
  if (!selected.ok) return selected;
  const face = prepareStudioConvexFace(context.value, selected.value[0]!);
  if (!face.ok) return face;
  const { minFeature } = context.value;

  if (points.length < 3) return failStudioFaceModeling("degenerate-input", "a shape needs at least three points");
  if (points.length > STUDIO_FACE_MODELING_LIMITS.maxDrawPoints) {
    return failStudioFaceModeling("budget-exceeded", "too many points");
  }
  if (points.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    return failStudioFaceModeling("invalid-parameter", "points must be finite numbers");
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]!;
    if (Math.hypot(next[0] - points[index]![0], next[1] - points[index]![1]) < minFeature) {
      return failStudioFaceModeling("degenerate-input", "two neighbouring points coincide", {
        elementIds: [index, (index + 1) % points.length],
      });
    }
  }
  // 자기 교차·되접힘은 시계/반시계와 무관하게 입력 순서 그대로 판정한다(나비넥타이는 면적이 0이 되기도 한다).
  const raw = describeStudioPlanarPolygon(points);
  if (!raw.simple || raw.spikeCorners.length > 0) {
    const contact = raw.selfContact;
    const elementIds = contact
      ? [...new Set([contact[0], (contact[0] + 1) % points.length, contact[1], (contact[1] + 1) % points.length])]
      : raw.spikeCorners;
    return failStudioFaceModeling("self-intersection", "the drawn outline crosses or touches itself", {
      elementIds,
    });
  }
  if (Math.abs(raw.signedArea) < minFeature * minFeature) {
    return failStudioFaceModeling("degenerate-input", "the drawn shape has no area");
  }
  const counterClockwise = raw.signedArea > 0;
  const drawn = counterClockwise ? [...points] : [...points].reverse();
  const toOriginalIndex = (index: number) => (counterClockwise ? index : points.length - 1 - index);
  const shape = counterClockwise ? raw : describeStudioPlanarPolygon(drawn);
  if (shape.collinearCorners.length > 0) {
    return failStudioFaceModeling("degenerate-input", "three points lie on one line", {
      elementIds: shape.collinearCorners.map(toOriginalIndex).sort((left, right) => left - right),
    });
  }
  if (!shape.convex) {
    return failStudioFaceModeling("non-convex", "the drawn shape must be convex");
  }
  const outside = drawn
    .map((point, index) => ({ index, margin: convexPolygonInsetMargin(face.value.polygon, point) }))
    .filter(({ margin }) => !(margin >= minFeature));
  if (outside.length > 0) {
    return failStudioFaceModeling("out-of-face", "points must lie inside the face, away from its border", {
      elementIds: outside.map(({ index }) => toOriginalIndex(index)).sort((left, right) => left - right),
    });
  }

  const annulus = triangulateConvexAnnulus(face.value.polygon, drawn);
  if (!annulus) {
    return failStudioFaceModeling("self-intersection", "the face around the drawn shape cannot be split");
  }
  const output = createStudioFaceOutput(mesh);
  const loop = face.value.loop;
  const outerCount = loop.vertexIds.length;
  const drawnIndices = drawn
    .map((point) => unprojectFromStudioPlanarFrame(face.value.frame, point))
    .map((point) => output.addVertex(point));
  const combined = [...loop.vertexIds, ...drawnIndices];
  const combinedPolygon = [...face.value.polygon, ...drawn];
  const pieces = mergeStudioPlanarPolygons(
    combinedPolygon,
    annulus.triangles,
    (candidate) => findRenderableStartCorner(
      candidate.map((index) => output.positions[combined[index]!]!),
    ) >= 0,
  );
  const faceCreases = studioFaceEdgeCreases(mesh, loop);
  let created = 0;
  for (const source of context.value.loops) {
    if (source.id !== loop.id) {
      output.keepFace(source);
      continue;
    }
    const innerId = output.addFace(drawnIndices, loop);
    if (innerId === null) {
      return failStudioFaceModeling("unrenderable-result", "the drawn face cannot be triangulated");
    }
    created += studioPolygonArea(drawnIndices.map((index) => output.positions[index]!));
    output.faceRemap.set(loop.id, innerId);
    for (const piece of pieces) {
      const indices = piece.map((index) => combined[index]!);
      const creases = piece.map((index, position) => {
        const nextIndex = piece[(position + 1) % piece.length]!;
        const consecutive = index < outerCount && nextIndex === (index + 1) % outerCount;
        return consecutive ? faceCreases[index] ?? 0 : 0;
      });
      if (output.addFace(indices, loop, creases) === null) {
        return failStudioFaceModeling("unrenderable-result", "a piece around the drawn shape cannot be triangulated");
      }
      created += studioPolygonArea(indices.map((index) => output.positions[index]!));
    }
  }
  const innerFaceId = output.faceRemap.get(loop.id);
  return finishStudioFaceOutput(context.value, output, "draw", innerFaceId === undefined || innerFaceId === null ? [] : [innerFaceId], {
    removed: face.value.frame.area,
    created,
  });
}
