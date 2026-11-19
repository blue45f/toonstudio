import { isValidStudioFrameClip, studioFrameClip, type StudioFrameGeometry } from "@toonstudio/studio-project-model/frame-clip";

import { computeBubbleShapeGeometry } from "../lettering/studio-bubble-custom-shape";
import { composeDialogueIntoFrames, type ComposeBounds } from "../studio-comipo-compose";
import { estimateBubbleHeight } from "../studio-fit";

import type { DialogueBubbleSeed } from "../studio-dialogue";

type Span = [number, number];
const CLEARANCE = 4;

/** 말풍선의 위/아래 사이 전체 높이에서 컷의 내부인 가로 구간. 오목한 변도 제외한다. */
function clearSpans(points: readonly number[], top: number, bottom: number, obstacles: readonly ComposeBounds[]): Span[] {
  const mid = (top + bottom) / 2;
  const crossings: number[] = [];
  const blocked: Span[] = [];
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const x = points[i]!, y = points[i + 1]!, previousX = points[j]!, previousY = points[j + 1]!;
    const low = Math.min(y, previousY), high = Math.max(y, previousY);
    if (high <= top || low >= bottom) continue;
    if (y === previousY) {
      blocked.push([Math.min(x, previousX), Math.max(x, previousX)]);
      continue;
    }
    const at = (row: number) => x + (previousX - x) * ((row - y) / (previousY - y));
    if (low <= mid && mid < high) crossings.push(at(mid));
    const a = at(Math.max(top, low)), b = at(Math.min(bottom, high));
    blocked.push([Math.min(a, b), Math.max(a, b)]);
  }
  for (const ob of obstacles) {
    if (ob.y < bottom && ob.y + ob.h > top) blocked.push([ob.x, ob.x + ob.w]);
  }
  crossings.sort((a, b) => a - b);
  blocked.sort((a, b) => a[0] - b[0]);
  const free: Span[] = [];
  let firstBlock = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    let left = crossings[i]!;
    const right = crossings[i + 1]!;
    while (firstBlock < blocked.length && blocked[firstBlock]![1] <= left) firstBlock++;
    for (let j = firstBlock; j < blocked.length && blocked[j]![0] < right; j++) {
      const [start, end] = blocked[j]!;
      if (left < start) free.push([left, start]);
      left = Math.max(left, end);
    }
    if (left < right) free.push([left, right]);
  }
  return free;
}

function fitBubble(seed: DialogueBubbleSeed, frame: StudioFrameGeometry, polygon: readonly number[], obstacles: readonly ComposeBounds[]) {
  const desiredWidth = seed.width;
  for (const width of new Set([desiredWidth, Math.round(desiredWidth * .75), Math.round(desiredWidth * .5)])) {
    if (width <= 0) continue;
    const height = width === desiredWidth ? seed.height : estimateBubbleHeight(seed.text, width, 22);
    const tail = seed.variant === "speech" ? computeBubbleShapeGeometry({ ...seed, width, height, theme: "classic" }).tailSpec?.length ?? 0 : 0;
    const inkHeight = height + tail;
    const first = frame.y + CLEARANCE;
    const last = frame.y + frame.height - inkHeight - CLEARANCE;
    if (last < first) continue;
    const rows = new Set([seed.y, first, last]);
    for (let i = 1; i < 32; i++) rows.add(first + (last - first) * i / 32);
    for (const ob of obstacles) rows.add(ob.y + ob.h + CLEARANCE);
    for (const y of [...rows].sort((a, b) => Math.abs(a - seed.y) - Math.abs(b - seed.y))) {
      if (y < first || y > last) continue;
      let nearest: number | undefined;
      for (const [left, right] of clearSpans(polygon, y - CLEARANCE, y + inkHeight + CLEARANCE, obstacles)) {
        if (right - left < width + 2 * CLEARANCE) continue;
        const x = Math.max(left + CLEARANCE, Math.min(seed.x, right - width - CLEARANCE));
        if (nearest === undefined || Math.abs(x - seed.x) < Math.abs(nearest - seed.x)) nearest = x;
      }
      if (nearest !== undefined) return { bubble: { ...seed, x: nearest, y, width, height }, inkHeight };
    }
  }
  return null;
}

/** 기존 그림·대사를 움직이지 않고 새 대사와 꼬리를 선택한 컷 안에 함께 넣는다. */
export function composeDialogueInPolygon(script: string, frame: StudioFrameGeometry, canvasWidth: number, existing: readonly ComposeBounds[]) {
  if (!isValidStudioFrameClip(frame) || !frame.points) return null;
  const polygon = studioFrameClip(frame).points;
  if (!polygon) return null;
  const obstacles = [...existing];
  const bubbles: DialogueBubbleSeed[] = [];
  for (const seed of composeDialogueIntoFrames(script, [frame], canvasWidth)) {
    const placed = fitBubble(seed, frame, polygon, obstacles);
    if (!placed) return null;
    bubbles.push(placed.bubble);
    obstacles.push({ x: placed.bubble.x, y: placed.bubble.y, w: placed.bubble.width, h: placed.inkHeight });
  }
  return bubbles.length ? bubbles : null;
}
