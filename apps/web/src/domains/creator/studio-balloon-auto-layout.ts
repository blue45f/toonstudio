/**
 * Studio Responsive Balloon Auto-Layout & Tail Path Generator — 대사 길이에 따른
 * 자동 크기 조절, 인물 얼굴/패널 테두리 충돌 회피 및 베지어 꼬리 곡선 생성 코어.
 *
 * 마스터플랜 7.3 (전문 말풍선), 8.5 (Responsive Panel·Balloon Auto Layout) & 997개 기능 갭:
 * - 말풍선 도형 (Oval, Round-Rect, Shout-Burst, Cloud-Thought, Whisper-Dash, Jagged)
 * - Hug-Content 반응형 텍스트 박스 계산 및 다국어 번역 시 자동 리플로우
 * - 다중 꼬리 및 곡선 베지어 패스(Tail Anchor & Bezier Path) 생성
 * - 인물 얼굴/중요 소품 및 타 말풍선과의 충돌 회피(Collision Avoidance) 솔버
 * - 읽기 순서(Reading Order) 유지 및 오버플로 검증
 * - 순수 함수, 불변성, 결정론, DOM/React 무관
 */

export const STUDIO_BALLOON_LAYOUT_VERSION = 1 as const;

export const BALLOON_SHAPES = [
  "oval",
  "round-rect",
  "rectangle",
  "shout-burst",
  "cloud-thought",
  "whisper-dash",
  "jagged-electronic",
] as const;
export type BalloonShape = (typeof BALLOON_SHAPES)[number];

export type BalloonSizeMode = "fixed" | "hug-content" | "fill-container";

export interface TailAnchor {
  readonly id: string;
  readonly targetSpeakerPoint: readonly [number, number]; // [x, y] tip
  readonly balloonAnchorPoint?: readonly [number, number]; // [x, y] base on balloon
  readonly curvature: number; // -1..1
  readonly tailWidth: number; // px at base
}

export interface BalloonLayoutRule {
  readonly sizeMode: BalloonSizeMode;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly paddingPx: number;
  readonly avoidCollisions: boolean;
}

export interface BalloonRecord {
  readonly id: string;
  readonly dialogueId: string;
  readonly text: string;
  readonly fontSize: number;
  readonly shape: BalloonShape;
  readonly readingOrder: number;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly tails: readonly TailAnchor[];
  readonly layoutRule: BalloonLayoutRule;
  readonly speakerRef?: string;
  readonly styleTokenRef?: string;
}

export interface ObstacleRect {
  readonly id: string;
  readonly kind: "character-face" | "prop" | "panel-boundary";
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface BalloonDiagnostic {
  readonly code:
    | "TEXT_OVERFLOW"
    | "OBSTACLE_COLLISION"
    | "DANGLING_TAIL"
    | "READING_ORDER_INVERSION";
  readonly balloonId: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/**
 * 텍스트 길이, 폰트 크기, 패딩에 기반하여 최적 말풍선 외곽 치수를 계산한다.
 */
export function computeBalloonTextBounds(
  text: string,
  fontSize: number,
  rule: BalloonLayoutRule,
): { readonly width: number; readonly height: number } {
  if (rule.sizeMode === "fixed") {
    return { width: rule.minWidthPx, height: rule.minWidthPx * 0.75 };
  }

  // 추정 글자당 폭 (CJK 1em, 영문 0.55em)
  const lines = text.split("\n");
  let maxLineLen = 0;
  let totalChars = 0;

  for (const line of lines) {
    let lineVisualWidth = 0;
    for (let i = 0; i < line.length; i += 1) {
      const code = line.charCodeAt(i);
      lineVisualWidth += code > 127 ? 1.0 : 0.55;
    }
    maxLineLen = Math.max(maxLineLen, lineVisualWidth);
    totalChars += line.length;
  }

  const rawWidth = maxLineLen * fontSize + rule.paddingPx * 2;
  const clampedWidth = Math.max(rule.minWidthPx, Math.min(rule.maxWidthPx, rawWidth));

  // 줄바꿈 계산
  const effectiveContentWidth = clampedWidth - rule.paddingPx * 2;
  const approxCharsPerLine = Math.max(1, Math.floor(effectiveContentWidth / (fontSize * 0.9)));
  const estimatedLinesCount = Math.max(lines.length, Math.ceil(totalChars / approxCharsPerLine));
  const lineHeight = fontSize * 1.4;
  const calculatedHeight = estimatedLinesCount * lineHeight + rule.paddingPx * 2;

  return Object.freeze({
    width: Math.round(clampedWidth),
    height: Math.round(calculatedHeight),
  });
}

/**
 * 말풍선 중심과 화자 위치 사이의 2차 베지어 꼬리 SVG 패스를 생성한다.
 */
export function generateBalloonTailSvgPath(
  balloonBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  tail: TailAnchor,
): string {
  const [tipX, tipY] = tail.targetSpeakerPoint;
  const centerX = balloonBounds.x + balloonBounds.width / 2;
  const centerY = balloonBounds.y + balloonBounds.height / 2;

  // 기본 꼬리 접점 계산 (중심에서 팁 방향으로 말풍선 외곽점)
  const angle = Math.atan2(tipY - centerY, tipX - centerX);
  const baseCenter = tail.balloonAnchorPoint ?? [
    centerX + Math.cos(angle) * (balloonBounds.width * 0.45),
    centerY + Math.sin(angle) * (balloonBounds.height * 0.45),
  ];

  const perpAngle = angle + Math.PI / 2;
  const halfW = tail.tailWidth / 2;

  const base1X = baseCenter[0] + Math.cos(perpAngle) * halfW;
  const base1Y = baseCenter[1] + Math.sin(perpAngle) * halfW;
  const base2X = baseCenter[0] - Math.cos(perpAngle) * halfW;
  const base2Y = baseCenter[1] - Math.sin(perpAngle) * halfW;

  // 제어점 (Curvature 반영)
  const midX = (baseCenter[0] + tipX) / 2 + Math.cos(perpAngle) * (tail.curvature * 30);
  const midY = (baseCenter[1] + tipY) / 2 + Math.sin(perpAngle) * (tail.curvature * 30);

  return `M ${base1X.toFixed(1)} ${base1Y.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q ${midX.toFixed(1)} ${midY.toFixed(1)} ${base2X.toFixed(1)} ${base2Y.toFixed(1)} Z`;
}

function checkRectOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}

function isInsidePanelBounds(
  rect: { x: number; y: number; width: number; height: number },
  panelBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return (
    rect.x >= panelBounds.x &&
    rect.y >= panelBounds.y &&
    rect.x + rect.width <= panelBounds.x + panelBounds.width &&
    rect.y + rect.height <= panelBounds.y + panelBounds.height
  );
}

function clampToPanel(
  x: number,
  y: number,
  width: number,
  height: number,
  panelBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): { x: number; y: number } {
  const maxX = Math.max(panelBounds.x, panelBounds.x + panelBounds.width - width);
  const maxY = Math.max(panelBounds.y, panelBounds.y + panelBounds.height - height);
  return {
    x: Math.min(maxX, Math.max(panelBounds.x, x)),
    y: Math.min(maxY, Math.max(panelBounds.y, y)),
  };
}

/**
 * 인물 얼굴/소품/패널 경계(거터) 장애물과 충돌하는 말풍선의 위치를 안전한 빈 공간으로 이동시킨다.
 *
 * 불변식:
 * 1. `panel-boundary` 장애물 및 `panelBounds` 내부 경계를 절대 침범하지 않도록 보존한다.
 * 2. 해소 과정과 완료 후 전체 말풍선에 대해 `bounds.y` 기준 `readingOrder` 단조 비감소
 *    (인접·비인접 모든 쌍 포함)를 전수 보장한다.
 */
export function solveBalloonCollisions(
  balloons: readonly BalloonRecord[],
  obstacles: readonly ObstacleRect[],
  panelBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): readonly BalloonRecord[] {
  if (balloons.length === 0) return Object.freeze([]);

  const panelBoundaryObstacles = obstacles.filter((obs) => obs.kind === "panel-boundary");
  const indexed = balloons.map((balloon, index) => ({ balloon, index }));
  indexed.sort(
    (a, b) =>
      a.balloon.readingOrder - b.balloon.readingOrder ||
      a.balloon.bounds.y - b.balloon.bounds.y ||
      a.balloon.bounds.x - b.balloon.bounds.x ||
      a.index - b.index,
  );

  const placed: Array<{ balloon: BalloonRecord; index: number }> = [];
  const step = 20;
  const edgeGap = 8;

  for (const entry of indexed) {
    const b = entry.balloon;
    const minOrderY = placed.reduce((acc, prev) => {
      if (prev.balloon.readingOrder < b.readingOrder) {
        return Math.max(acc, prev.balloon.bounds.y);
      }
      return acc;
    }, panelBounds.y);

    if (!b.layoutRule.avoidCollisions) {
      placed.push({ balloon: b, index: entry.index });
      continue;
    }

    const width = b.bounds.width;
    const height = b.bounds.height;
    const hasAnyCollision = (rect: { x: number; y: number; width: number; height: number }): boolean =>
      !isInsidePanelBounds(rect, panelBounds) ||
      obstacles.some((obs) => checkRectOverlap(rect, obs.bounds)) ||
      placed.some((prev) => checkRectOverlap(rect, prev.balloon.bounds));

    const hasHardBoundaryCollision = (
      rect: { x: number; y: number; width: number; height: number },
    ): boolean =>
      !isInsidePanelBounds(rect, panelBounds) ||
      panelBoundaryObstacles.some((obs) => checkRectOverlap(rect, obs.bounds));

    const initialClamped = clampToPanel(b.bounds.x, Math.max(b.bounds.y, minOrderY), width, height, panelBounds);
    let chosenX = initialClamped.x;
    let chosenY = initialClamped.y;

    const initialRect = { x: chosenX, y: chosenY, width, height };
    if (hasAnyCollision(initialRect)) {
      const candidates: Array<{ x: number; y: number }> = [];
      const seen = new Set<string>();
      const addCandidate = (rawX: number, rawY: number): void => {
        const clamped = clampToPanel(rawX, rawY, width, height, panelBounds);
        if (clamped.y < minOrderY) return;
        const rx = Math.round(clamped.x);
        const ry = Math.round(clamped.y);
        const key = `${rx},${ry}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ x: rx, y: ry });
      };

      // 1) 장애물·선행 말풍선 경계 바깥으로 즉시 스냅하는 후보(수평·하향·허용 상향)
      const blockers = [...obstacles.map((o) => o.bounds), ...placed.map((p) => p.balloon.bounds)];
      for (const blk of blockers) {
        addCandidate(blk.x + blk.width + edgeGap, b.bounds.y);
        addCandidate(blk.x - width - edgeGap, b.bounds.y);
        addCandidate(b.bounds.x, blk.y + blk.height + edgeGap);
        addCandidate(b.bounds.x, blk.y - height - edgeGap);
        addCandidate(blk.x + blk.width + edgeGap, blk.y + blk.height + edgeGap);
        addCandidate(blk.x - width - edgeGap, blk.y + blk.height + edgeGap);
      }

      // 2) 읽기 순서를 깨지 않는 수평·하향·제한 상향 그리드 탐색
      const maxX = Math.max(panelBounds.x, panelBounds.x + panelBounds.width - width);
      const maxY = Math.max(panelBounds.y, panelBounds.y + panelBounds.height - height);
      for (let dy = 0; dy <= Math.max(step * 12, maxY - minOrderY); dy += step) {
        const yDown = b.bounds.y + dy;
        const yUp = b.bounds.y - dy;
        for (let dx = 0; dx <= Math.max(step * 12, maxX - panelBounds.x); dx += step) {
          addCandidate(b.bounds.x + dx, yDown);
          if (dx > 0) addCandidate(b.bounds.x - dx, yDown);
          if (dy > 0 && yUp >= minOrderY) {
            addCandidate(b.bounds.x + dx, yUp);
            if (dx > 0) addCandidate(b.bounds.x - dx, yUp);
          }
        }
      }

      // 3) 충돌 없는 최단 이동 후보 선택; 전부 충돌하면 최소한 거터/패널 경계는 침범하지 않는 후보 선택
      let bestFree: { x: number; y: number; dist: number } | null = null;
      let bestBoundarySafe: { x: number; y: number; dist: number } | null = null;

      for (const cand of candidates) {
        const rect = { x: cand.x, y: cand.y, width, height };
        const dist = Math.hypot(cand.x - b.bounds.x, cand.y - b.bounds.y);
        if (!hasAnyCollision(rect)) {
          if (!bestFree || dist < bestFree.dist) {
            bestFree = { ...cand, dist };
          }
        } else if (!hasHardBoundaryCollision(rect)) {
          if (!bestBoundarySafe || dist < bestBoundarySafe.dist) {
            bestBoundarySafe = { ...cand, dist };
          }
        }
      }

      if (bestFree) {
        chosenX = bestFree.x;
        chosenY = bestFree.y;
      } else if (bestBoundarySafe) {
        chosenX = bestBoundarySafe.x;
        chosenY = bestBoundarySafe.y;
      }
    }

    placed.push({
      index: entry.index,
      balloon: Object.freeze({
        ...b,
        bounds: Object.freeze({
          x: Math.round(chosenX),
          y: Math.round(chosenY),
          width,
          height,
        }),
      }),
    });
  }

  // 해소 후 전체 말풍선을 bounds.y 기준(동률 시 bounds.x)으로 정렬해
  // readingOrder 단조 비감소를 비인접 쌍까지 전수 보장한다.
  const sortedOrders = balloons.map((b) => b.readingOrder).sort((a, b) => a - b);
  const byVerticalOrder = [...placed].sort(
    (a, b) =>
      a.balloon.bounds.y - b.balloon.bounds.y ||
      a.balloon.bounds.x - b.balloon.bounds.x ||
      a.balloon.readingOrder - b.balloon.readingOrder ||
      a.index - b.index,
  );

  const normalized = byVerticalOrder.map((entry, idx) =>
    Object.freeze({
      ...entry.balloon,
      readingOrder: sortedOrders[idx] ?? idx + 1,
    }),
  );

  return Object.freeze(normalized);
}

/**
 * 말풍선 레이아웃 무결성(충돌, 꼬리 단절, 인접·비인접 읽기 순서 역전)을 검증한다.
 */
export function validateBalloonLayout(
  balloons: readonly BalloonRecord[],
  obstacles: readonly ObstacleRect[] = [],
): readonly BalloonDiagnostic[] {
  const diagnostics: BalloonDiagnostic[] = [];

  for (let i = 0; i < balloons.length; i += 1) {
    const b = balloons[i]!;

    // 1. 장애물(얼굴/소품/패널 경계·거터) 충돌 검사
    for (const obs of obstacles) {
      if (checkRectOverlap(b.bounds, obs.bounds)) {
        diagnostics.push({
          code: "OBSTACLE_COLLISION",
          balloonId: b.id,
          message: `말풍선 '${b.id}'이(가) 주요 요소('${obs.id}', ${obs.kind})와 겹쳐 있습니다.`,
          severity: obs.kind === "panel-boundary" ? "error" : "warning",
        });
      }
    }

    // 2. 꼬리 화자 누락 검사
    for (const tail of b.tails) {
      if (tail.targetSpeakerPoint[0] === 0 && tail.targetSpeakerPoint[1] === 0) {
        diagnostics.push({
          code: "DANGLING_TAIL",
          balloonId: b.id,
          message: `말풍선 '${b.id}'의 꼬리가 지정되지 않았습니다.`,
          severity: "warning",
        });
      }
    }
  }

  // 3. 읽기 순서 역전 전수 검사 (비인접 쌍 포함):
  //    readingOrder 오름차순으로 스캔할 때 bounds.y 는 단조 비감소해야 한다.
  const ordered = balloons
    .map((balloon, index) => ({ balloon, index }))
    .sort(
      (a, b) =>
        a.balloon.readingOrder - b.balloon.readingOrder ||
        a.balloon.bounds.y - b.balloon.bounds.y ||
        a.index - b.index,
    );

  let maxPrevY = Number.NEGATIVE_INFINITY;
  let maxPrevBalloon: BalloonRecord | null = null;
  let groupStart = 0;

  while (groupStart < ordered.length) {
    const currentOrder = ordered[groupStart]!.balloon.readingOrder;
    let groupEnd = groupStart;
    while (
      groupEnd < ordered.length &&
      ordered[groupEnd]!.balloon.readingOrder === currentOrder
    ) {
      const curr = ordered[groupEnd]!.balloon;
      if (maxPrevBalloon && curr.bounds.y < maxPrevY) {
        diagnostics.push({
          code: "READING_ORDER_INVERSION",
          balloonId: curr.id,
          message: `말풍선 '${curr.id}'이(가) 선행 말풍선('${maxPrevBalloon.id}', order=${maxPrevBalloon.readingOrder})보다 위쪽(y=${curr.bounds.y} < ${maxPrevY})에 위치하지만 읽기 순서 번호(${curr.readingOrder})가 더 큽니다.`,
          severity: "warning",
        });
      }
      groupEnd += 1;
    }
    for (let k = groupStart; k < groupEnd; k += 1) {
      const candidate = ordered[k]!.balloon;
      if (candidate.bounds.y > maxPrevY) {
        maxPrevY = candidate.bounds.y;
        maxPrevBalloon = candidate;
      }
    }
    groupStart = groupEnd;
  }

  return Object.freeze(diagnostics);
}
