import { z } from "zod";

import { studioEntityIdSchema } from "./ids";
import { reviewPenStrokesStorageByteLength } from "./review-pen-storage";
import { validateStudioReviewSpatialAnchor, type StudioReviewPageMapping } from "./review-source-map";

export const STUDIO_REVIEW_PEN_MAX_STROKES = 50;
export const STUDIO_REVIEW_PEN_MAX_POINTS_PER_STROKE = 500;
export const STUDIO_REVIEW_PEN_MAX_JSON_BYTES = 2 * 1024 * 1024;

export const reviewPenPointSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
}).strict().readonly();
export type ReviewPenPoint = z.infer<typeof reviewPenPointSchema>;

/** 고정 원고의 원본 픽셀 좌표로 저장하는 펜 첨삭 계약이다. */
export const reviewPenStrokeSchema = z.object({
  id: studioEntityIdSchema.max(64),
  points: z.array(reviewPenPointSchema).min(2).max(STUDIO_REVIEW_PEN_MAX_POINTS_PER_STROKE).readonly(),
  color: z.string().regex(/^#[\da-f]{6}$/iu),
  width: z.number().finite().positive(),
}).strict().readonly();
export type ReviewPenStroke = z.infer<typeof reviewPenStrokeSchema>;

export const reviewPenStrokesSchema = z.array(reviewPenStrokeSchema).max(STUDIO_REVIEW_PEN_MAX_STROKES)
  .superRefine((strokes, context) => {
    if (new Set(strokes.map((stroke) => stroke.id)).size !== strokes.length) {
      context.addIssue({ code: "custom", message: "pen stroke ids must be unique" });
    }
    if (reviewPenStrokesStorageByteLength(strokes) > STUDIO_REVIEW_PEN_MAX_JSON_BYTES) {
      context.addIssue({ code: "custom", message: "펜 첨삭의 JSONB 저장 표현은 2 MiB를 넘을 수 없습니다." });
    }
  }).readonly();

/** 기존 공간 앵커와 같은 불변 source mapping 안에서 모든 펜 좌표를 검사한다. */
export function validateStudioReviewPenStrokes(
  mapping: StudioReviewPageMapping,
  anchor: Parameters<typeof validateStudioReviewSpatialAnchor>[1],
  strokes: readonly ReviewPenStroke[],
): boolean {
  const parsed = reviewPenStrokesSchema.safeParse(strokes);
  if (!parsed.success) return false;
  if (parsed.data.length === 0) return true;
  if (mapping.status !== "mapped" || anchor.kind !== "region"
    || !validateStudioReviewSpatialAnchor(mapping, anchor)
    || anchor.x === undefined || anchor.y === undefined
    || anchor.width === undefined || anchor.height === undefined) return false;
  const { x, y, width, height } = anchor;
  const right = x + width, bottom = y + height;
  // min/max에서 만든 영역을 다시 더할 때 생기는 부동소수점 오차만 허용한다.
  const epsilon = Number.EPSILON * 4 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(right), Math.abs(bottom));
  return parsed.data.every((stroke) => stroke.width <= Math.max(mapping.page.width, mapping.page.height)
    && stroke.points.every((point) => point.x <= mapping.page.width && point.y <= mapping.page.height
      && point.x >= x - epsilon && point.y >= y - epsilon
      && point.x <= right + epsilon && point.y <= bottom + epsilon));
}
