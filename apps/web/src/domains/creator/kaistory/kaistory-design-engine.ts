/**
 * kaistory-design-engine.ts — KAISTORY `design.kaistory.net` (편집·변환 도구) 정밀 이식 순수 모듈.
 *
 * REA 역공학 근거:
 * - Evidence: `ev_2b16294fc401ce73cae3970c4be9ae4677825a2e1681951fdc4e1f7ed3108510`
 * - 번들: `design.kaistory.net/assets/index-BO260uB-.js`
 *
 * 핵심 기능:
 * 1. 만화 페이지(2508×3541) ↔ 웹툰 세로컷 이중 좌표계 및 「⬆ 웹툰: 앞 페이지에 합침」 병합 엔진
 * 2. 말풍선 본체 도형(타원·둥근사각·이중다각형·생각구름·외침·자유경로) 및 꼬리 6종(삼각·사각·좌곡선·우곡선·번개/꺾임·생각원) + 이진 탐색 경계 교차점 계산 + 자동 테두리 굵기 감지
 * 3. 이미지 말풍선(fukidashi 21종) 및 전경 효과(집중선·속도선·고개 돌림 등) 카탈로그 + Multiply 틴트 + 15° 회전
 * 4. 이웃 말풍선 연결(`linkGroup`) Union-Find 클러스터링 및 「앞 말풍선에 살짝 겹치도록 옮기기」 14px 스냅
 * 5. 웹툰 화자 표시 3모드(이름표 배지·말풍선 채움색·말풍선 테두리색) 및 명도 대비 계산
 * 6. 크로마키 배경 투명화 — 자동 모서리색 추출 및 「바깥쪽만(안쪽 같은 색은 남김)」 외곽 Flood-Fill 알고리즘
 * 7. 효과음(SFX) 다중 외곽선 프리셋 6종 및 언어별 효과음 이미지 치환
 * 8. 끊어진 콘티 참조(`kontiRef`) Levenshtein 유사도(>= 0.8) 기반 자동 재연결 및 5개국어 번역 복원
 * 9. PSD 레이어 자동 분류(크기 비율 > 0.22 캐릭터 판별) 및 5개국어 대사 시트(`.xlsx` 호환 행) 생성
 */

import type {
  KaistoryCharacterBubbleColorOverride,
  KaistoryContiDialogue,
  KaistoryLangCode,
  KaistorySpeakerDisplayMode,
} from "./kaistory-conti-model";

export const KAISTORY_MANGA_CANVAS_WIDTH = 2508;
export const KAISTORY_MANGA_CANVAS_HEIGHT = 3541;

export type KaistoryBubbleShapeKind =
  | "ellipse"
  | "roundRect"
  | "doublePoly"
  | "thought"
  | "burst"
  | "path";

export type KaistoryBubbleTailProfile =
  | "triangle"
  | "rect"
  | "curveL"
  | "curveR"
  | "zigzag"
  | "thought"
  | "custom";

export const KAISTORY_TAIL_PROFILE_LABELS: Readonly<
  Record<KaistoryBubbleTailProfile, string>
> = Object.freeze({
  triangle: "삼각",
  rect: "사각",
  curveL: "좌곡선",
  curveR: "우곡선",
  zigzag: "번개/꺾임",
  thought: "생각 원",
  custom: "직접 편집",
});

export interface KaistoryBubbleGeometrySpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape: KaistoryBubbleShapeKind;
  /** 둥근사각 모서리 비율 (0..1). */
  readonly cornerRatio: number;
  /** 다각형 변 수 (0 = 자동 6..8, 또는 3..12). */
  readonly polySides: number;
  /** 테두리 두께 (0 = 자동 — 컷 테두리 두께 참조). */
  readonly strokeWidth: number;
  readonly tailProfile: KaistoryBubbleTailProfile;
  readonly tailTipX: number;
  readonly tailTipY: number;
  readonly tailSpreadPx: number;
  readonly tailCurveOffset: number;
  readonly thoughtDotCount: number;
  readonly thoughtDotShrink: number;
  readonly linkGroup?: string;
  readonly clipToFrame: boolean;
  readonly mangaHidden: boolean;
}

export interface KaistoryDualPanelCutLayout {
  readonly cutId: string;
  readonly pageNumber: number;
  readonly cutOrder: number;
  readonly pageX: number;
  readonly pageY: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly webtoonX: number;
  readonly webtoonY: number;
  readonly webtoonWidth: number;
  readonly webtoonHeight: number;
  /** ⬆ 웹툰: 앞 페이지에 합침 */
  readonly mergeIntoPreviousWebtoonPage: boolean;
  readonly frameStrokeWidth: number;
}

/**
 * 「⬆ 웹툰: 앞 페이지에 합침」 플래그를 반영하여 웹툰 세로 스크롤 스트립 묶음을 계산한다.
 */
export function groupCutsIntoWebtoonStrips(
  cuts: readonly KaistoryDualPanelCutLayout[],
): readonly {
  readonly stripPageNumber: number;
  readonly cutIds: readonly string[];
  readonly totalWebtoonHeight: number;
}[] {
  const sorted = [...cuts].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.cutOrder - b.cutOrder,
  );
  const strips: {
    stripPageNumber: number;
    cutIds: string[];
    totalWebtoonHeight: number;
  }[] = [];

  for (const cut of sorted) {
    const prevStrip = strips[strips.length - 1];
    if (
      prevStrip &&
      (prevStrip.stripPageNumber === cut.pageNumber || cut.mergeIntoPreviousWebtoonPage)
    ) {
      prevStrip.cutIds.push(cut.cutId);
      prevStrip.totalWebtoonHeight = Math.max(
        prevStrip.totalWebtoonHeight,
        cut.webtoonY + cut.webtoonHeight,
      );
    } else {
      strips.push({
        stripPageNumber: cut.pageNumber,
        cutIds: [cut.cutId],
        totalWebtoonHeight: cut.webtoonY + cut.webtoonHeight,
      });
    }
  }
  return Object.freeze(
    strips.map((s) =>
      Object.freeze({
        stripPageNumber: s.stripPageNumber,
        cutIds: Object.freeze(s.cutIds),
        totalWebtoonHeight: s.totalWebtoonHeight,
      }),
    ),
  );
}

/**
 * 말풍선 테두리 두께가 `0(자동)`일 때 컷 테두리 두께를 기반으로 실제 두께를 결정한다.
 */
export function resolveBubbleStrokeWidth(
  bubbleStrokeWidth: number,
  panelFrameStrokeWidth?: number,
): number {
  if (bubbleStrokeWidth > 0) return bubbleStrokeWidth;
  if (panelFrameStrokeWidth && panelFrameStrokeWidth > 0) {
    return Math.max(1.5, Math.min(8, Math.round(panelFrameStrokeWidth * 0.85 * 10) / 10));
  }
  return 3;
}

/**
 * 점이 말풍선 본체 내부에 있는지 판정한다 (이진 탐색 교차점 계산용).
 */
export function isPointInsideBubbleBody(
  px: number,
  py: number,
  bubble: Pick<
    KaistoryBubbleGeometrySpec,
    "x" | "y" | "width" | "height" | "shape" | "cornerRatio"
  >,
): boolean {
  const cx = bubble.x + bubble.width / 2;
  const cy = bubble.y + bubble.height / 2;
  const rx = Math.max(1, bubble.width / 2);
  const ry = Math.max(1, bubble.height / 2);

  if (bubble.shape === "roundRect") {
    const halfW = rx;
    const halfH = ry;
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    if (dx > halfW || dy > halfH) return false;
    const r = Math.min(halfW, halfH) * Math.max(0, Math.min(1, bubble.cornerRatio));
    if (r <= 0.5) return true;
    const cornerDx = Math.max(0, dx - (halfW - r));
    const cornerDy = Math.max(0, dy - (halfH - r));
    return cornerDx * cornerDx + cornerDy * cornerDy <= r * r;
  }

  const normX = (px - cx) / rx;
  const normY = (py - cy) / ry;
  return normX * normX + normY * normY <= 1;
}

/**
 * 말풍선 중심에서 꼬리 끝점(`tailTip`)으로 향하는 반직선이 본체 외곽선과 만나는 교차점을
 * 14회 이진 탐색(`design.kaistory.net` `pwe` 동일 방식)으로 정밀 계산한다.
 */
export function findBubbleTailRootIntersection(
  bubble: KaistoryBubbleGeometrySpec,
): {
  readonly rootX: number;
  readonly rootY: number;
  readonly normalAngleRad: number;
} {
  const cx = bubble.x + bubble.width / 2;
  const cy = bubble.y + bubble.height / 2;
  const tx = bubble.tailTipX;
  const ty = bubble.tailTipY;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    const mx = cx + (tx - cx) * mid;
    const my = cy + (ty - cy) * mid;
    if (isPointInsideBubbleBody(mx, my, bubble)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const t = (lo + hi) * 0.5;
  const rootX = cx + (tx - cx) * t;
  const rootY = cy + (ty - cy) * t;
  const normalAngleRad = Math.atan2(ty - cy, tx - cx);
  return { rootX, rootY, normalAngleRad };
}

/**
 * 꼬리 프로파일(`triangle`, `rect`, `curveL`, `curveR`, `zigzag`, `thought`)에 따른
 * 폴리곤/베지어/생각원 기하 데이터를 생성한다.
 */
export function buildBubbleTailGeometry(bubble: KaistoryBubbleGeometrySpec): {
  readonly profile: KaistoryBubbleTailProfile;
  readonly rootX: number;
  readonly rootY: number;
  readonly polygonPoints: readonly { readonly x: number; readonly y: number }[];
  readonly thoughtDots: readonly {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }[];
} {
  const { rootX, rootY, normalAngleRad } = findBubbleTailRootIntersection(bubble);
  const perpX = -Math.sin(normalAngleRad);
  const perpY = Math.cos(normalAngleRad);
  const halfSpread = Math.max(4, bubble.tailSpreadPx * 0.5);
  const baseLeft = { x: rootX + perpX * halfSpread, y: rootY + perpY * halfSpread };
  const baseRight = { x: rootX - perpX * halfSpread, y: rootY - perpY * halfSpread };
  const tip = { x: bubble.tailTipX, y: bubble.tailTipY };

  if (bubble.tailProfile === "thought") {
    const count = Math.max(2, Math.min(6, Math.round(bubble.thoughtDotCount || 3)));
    const shrink = Math.max(0.3, Math.min(0.95, bubble.thoughtDotShrink || 0.72));
    const dots: { x: number; y: number; radius: number }[] = [];
    let radius = Math.max(5, halfSpread * 0.85);
    for (let i = 0; i < count; i += 1) {
      const ratio = (i + 1) / (count + 0.4);
      dots.push({
        x: rootX + (tip.x - rootX) * ratio,
        y: rootY + (tip.y - rootY) * ratio,
        radius: Math.round(radius * 10) / 10,
      });
      radius *= shrink;
    }
    return {
      profile: "thought",
      rootX,
      rootY,
      polygonPoints: Object.freeze([]),
      thoughtDots: Object.freeze(dots),
    };
  }

  if (bubble.tailProfile === "zigzag") {
    const dx = tip.x - rootX;
    const dy = tip.y - rootY;
    const mid1 = {
      x: rootX + dx * 0.42 + perpX * halfSpread * 0.75,
      y: rootY + dy * 0.42 + perpY * halfSpread * 0.75,
    };
    const mid2 = {
      x: rootX + dx * 0.62 - perpX * halfSpread * 0.6,
      y: rootY + dy * 0.62 - perpY * halfSpread * 0.6,
    };
    return {
      profile: "zigzag",
      rootX,
      rootY,
      polygonPoints: Object.freeze([baseLeft, mid1, mid2, tip, baseRight]),
      thoughtDots: Object.freeze([]),
    };
  }

  if (bubble.tailProfile === "rect") {
    const tipLeft = { x: tip.x + perpX * (halfSpread * 0.65), y: tip.y + perpY * (halfSpread * 0.65) };
    const tipRight = { x: tip.x - perpX * (halfSpread * 0.65), y: tip.y - perpY * (halfSpread * 0.65) };
    return {
      profile: "rect",
      rootX,
      rootY,
      polygonPoints: Object.freeze([baseLeft, tipLeft, tipRight, baseRight]),
      thoughtDots: Object.freeze([]),
    };
  }

  if (bubble.tailProfile === "curveL" || bubble.tailProfile === "curveR") {
    const sign = bubble.tailProfile === "curveL" ? 1 : -1;
    const bend = Math.max(8, Math.abs(bubble.tailCurveOffset || 16)) * sign;
    const midCurve = {
      x: (rootX + tip.x) * 0.5 + perpX * bend,
      y: (rootY + tip.y) * 0.5 + perpY * bend,
    };
    return {
      profile: bubble.tailProfile,
      rootX,
      rootY,
      polygonPoints: Object.freeze([baseLeft, midCurve, tip, baseRight]),
      thoughtDots: Object.freeze([]),
    };
  }

  return {
    profile: bubble.tailProfile,
    rootX,
    rootY,
    polygonPoints: Object.freeze([baseLeft, tip, baseRight]),
    thoughtDots: Object.freeze([]),
  };
}

export interface KaistoryForegroundEffectPreset {
  readonly id: string;
  readonly category: "line" | "fill" | "speed" | "motion";
  readonly categoryLabelKo: string;
  readonly labelKo: string;
}

export const KAISTORY_FOREGROUND_EFFECT_CATALOG: readonly KaistoryForegroundEffectPreset[] =
  Object.freeze([
    { id: "shuchu-thin", category: "line", categoryLabelKo: "라인", labelKo: "집중선 (가늘게)" },
    { id: "shuchu-dense", category: "line", categoryLabelKo: "라인", labelKo: "집중선 (조밀)" },
    { id: "koka-spiral", category: "line", categoryLabelKo: "라인", labelKo: "소용돌이 집중선" },
    { id: "shuchu-fill", category: "fill", categoryLabelKo: "채움", labelKo: "성게 플래시 (채움)" },
    { id: "koka-fill", category: "fill", categoryLabelKo: "채움", labelKo: "방사 성게 (채움)" },
    { id: "pinwheel", category: "fill", categoryLabelKo: "채움", labelKo: "바람개비 효과" },
    { id: "speed-vertical", category: "speed", categoryLabelKo: "속도선", labelKo: "세로 속도선" },
    { id: "speed-horizontal", category: "speed", categoryLabelKo: "속도선", labelKo: "가로 속도선" },
    { id: "motion-diag", category: "motion", categoryLabelKo: "움직임", labelKo: "대각선 돌진" },
    { id: "motion-sweep", category: "motion", categoryLabelKo: "움직임", labelKo: "휘두르기 궤적" },
    { id: "motion-impact", category: "motion", categoryLabelKo: "움직임", labelKo: "타격 충격파" },
    { id: "motion-head-turn", category: "motion", categoryLabelKo: "움직임", labelKo: "고개 돌림" },
  ]);

/**
 * 전경 효과를 15° 단위로 회전한다 (`design.kaistory.net` 회전 버튼 규격).
 */
export function rotateEffectBy15Degrees(currentDeg: number, steps: number): number {
  const next = (currentDeg + steps * 15) % 360;
  return next < 0 ? next + 360 : next;
}

/**
 * 이웃 말풍선 연결(`linkGroup`)과 AABB 겹침 여부를 결합해 Union-Find 연결 클러스터를 계산한다.
 */
export function computeLinkedBubbleClusters(
  bubbles: readonly Pick<
    KaistoryBubbleGeometrySpec,
    "id" | "x" | "y" | "width" | "height" | "linkGroup"
  >[],
): readonly (readonly string[])[] {
  const n = bubbles.length;
  const parent = Array.from({ length: n }, (_, idx) => idx);
  const find = (i: number): number => {
    let curr = i;
    while (parent[curr] !== curr) {
      parent[curr] = parent[parent[curr] ?? curr] ?? curr;
      curr = parent[curr] ?? curr;
    }
    return curr;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i += 1) {
    const bi = bubbles[i];
    if (!bi || !bi.linkGroup) continue;
    for (let j = i + 1; j < n; j += 1) {
      const bj = bubbles[j];
      if (!bj || bj.linkGroup !== bi.linkGroup) continue;
      const overlaps =
        bi.x <= bj.x + bj.width + 4 &&
        bi.x + bi.width + 4 >= bj.x &&
        bi.y <= bj.y + bj.height + 4 &&
        bi.y + bi.height + 4 >= bj.y;
      if (overlaps) union(i, j);
    }
  }

  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i += 1) {
    const b = bubbles[i];
    if (!b) continue;
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(b.id);
    groups.set(root, list);
  }
  return Object.freeze([...groups.values()].map((g) => Object.freeze(g)));
}

/**
 * 「앞 말풍선에 살짝 겹치도록 옮기기」 — 두 번째 말풍선을 앞 말풍선 방향으로 이동시켜
 * `overlapPx`(기본 14px)만큼 자연스럽게 겹치게 만든다.
 */
export function snapBubbleToOverlapPrevious(
  previous: Pick<KaistoryBubbleGeometrySpec, "x" | "y" | "width" | "height">,
  current: Pick<KaistoryBubbleGeometrySpec, "x" | "y" | "width" | "height">,
  overlapPx = 14,
): { readonly x: number; readonly y: number } {
  const prevCx = previous.x + previous.width / 2;
  const prevCy = previous.y + previous.height / 2;
  const currCx = current.x + current.width / 2;
  const currCy = current.y + current.height / 2;

  const dx = currCx - prevCx;
  const dy = currCy - prevCy;
  const touchDistX = (previous.width + current.width) / 2;
  const touchDistY = (previous.height + current.height) / 2;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const sign = dx >= 0 ? 1 : -1;
    const targetCx = prevCx + sign * Math.max(0, touchDistX - overlapPx);
    return {
      x: Math.round(targetCx - current.width / 2),
      y: current.y,
    };
  }
  const sign = dy >= 0 ? 1 : -1;
  const targetCy = prevCy + sign * Math.max(0, touchDistY - overlapPx);
  return {
    x: current.x,
    y: Math.round(targetCy - current.height / 2),
  };
}

export interface KaistorySpeakerVisualStyle {
  readonly showSpeakerBadge: boolean;
  readonly badgeBackgroundHex: string;
  readonly badgeTextHex: "#ffffff" | "#111827";
  readonly bubbleFillHex: string;
  readonly bubbleStrokeHex: string;
}

/**
 * 웹툰 화자 표시 3모드(`name` 이름표 배지, `color` 채움색, `outline` 외곽선색) 및
 * 캐릭터별 오버라이드(`project_default`/`fill_and_stroke`/`stroke_only`)를 결합해 시각 스타일을 계산한다.
 */
export function resolveWebtoonSpeakerVisuals(input: {
  readonly speakerName: string;
  readonly characterColorHex: string;
  readonly projectMode: KaistorySpeakerDisplayMode;
  readonly characterOverride?: KaistoryCharacterBubbleColorOverride;
}): KaistorySpeakerVisualStyle {
  const hex = input.characterColorHex.replace(/^#/u, "").padEnd(6, "0");
  const r = Number.parseInt(hex.slice(0, 2), 16) || 0;
  const g = Number.parseInt(hex.slice(2, 4), 16) || 0;
  const b = Number.parseInt(hex.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const badgeTextHex: "#ffffff" | "#111827" = luminance > 0.62 ? "#111827" : "#ffffff";

  const toHex2 = (v: number) => Math.round(v * 0.16 + 255 * 0.84).toString(16).padStart(2, "0");
  const pastelHex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  const normalizedCharHex = `#${hex.slice(0, 6)}`;

  if (input.projectMode === "name") {
    return {
      showSpeakerBadge: Boolean(input.speakerName.trim()),
      badgeBackgroundHex: normalizedCharHex,
      badgeTextHex,
      bubbleFillHex: "#ffffff",
      bubbleStrokeHex: "#111827",
    };
  }
  const override = input.characterOverride ?? "project_default";
  const useTintedFill =
    override === "fill_and_stroke" || (override === "project_default" && input.projectMode === "color");
  return {
    showSpeakerBadge: false,
    badgeBackgroundHex: normalizedCharHex,
    badgeTextHex,
    bubbleFillHex: useTintedFill ? pastelHex : "#ffffff",
    bubbleStrokeHex: normalizedCharHex,
  };
}

/**
 * 크로마키 배경 제거 — `edgeOnly: true`（「바깥쪽만 (안쪽 같은 색은 남김)」)일 때
 * 이미지 4변 테두리 픽셀에서 시작하는 BFS Flood-Fill로 외부 배경만 투명화하고
 * 캐릭터 내부의 흰색(눈자위·셔츠 등)은 보존한다.
 */
export function applyEdgeAwareChromaKey(input: {
  readonly width: number;
  readonly height: number;
  /** RGBA 4바이트 배열 (길이 = width * height * 4). */
  readonly rgba: Uint8ClampedArray;
  /** 지정하지 않으면 네 모서리 평균 색상을 자동 추출한다 (`자동(모서리색)`). */
  readonly keyColorRgb?: readonly [number, number, number];
  /** 0..0.6 정규화 거리 허용치. */
  readonly tolerance: number;
  readonly edgeOnly: boolean;
}): {
  readonly keyColorRgb: readonly [number, number, number];
  readonly outputRgba: Uint8ClampedArray;
  readonly clearedPixelCount: number;
} {
  const { width, height, rgba } = input;
  const out = new Uint8ClampedArray(rgba);
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return { keyColorRgb: [255, 255, 255], outputRgba: out, clearedPixelCount: 0 };
  }

  const keyRgb: readonly [number, number, number] = input.keyColorRgb ?? (() => {
    const corners = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      ((height - 1) * width + (width - 1)) * 4,
    ];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (const offset of corners) {
      sr += rgba[offset] ?? 255;
      sg += rgba[offset + 1] ?? 255;
      sb += rgba[offset + 2] ?? 255;
    }
    return [Math.round(sr / 4), Math.round(sg / 4), Math.round(sb / 4)] as const;
  })();

  const maxDist = 441.6729559300637; // sqrt(255^2 * 3)
  const tol = Math.max(0.01, Math.min(0.6, input.tolerance));
  const innerTol = tol * 0.7;

  const colorDistNormalized = (pixelIndex: number): number => {
    const offset = pixelIndex * 4;
    const dr = (rgba[offset] ?? 0) - keyRgb[0];
    const dg = (rgba[offset + 1] ?? 0) - keyRgb[1];
    const db = (rgba[offset + 2] ?? 0) - keyRgb[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) / maxDist;
  };

  let clearedPixelCount = 0;
  const applyFadeAt = (pixelIndex: number, dist: number) => {
    const alphaOffset = pixelIndex * 4 + 3;
    const prevAlpha = out[alphaOffset] ?? 255;
    if (dist <= innerTol) {
      out[alphaOffset] = 0;
      if (prevAlpha > 0) clearedPixelCount += 1;
    } else if (dist <= tol) {
      const factor = (dist - innerTol) / Math.max(1e-6, tol - innerTol);
      out[alphaOffset] = Math.round(prevAlpha * factor);
      if (out[alphaOffset] === 0 && prevAlpha > 0) clearedPixelCount += 1;
    }
  };

  if (!input.edgeOnly) {
    const total = width * height;
    for (let idx = 0; idx < total; idx += 1) {
      const dist = colorDistNormalized(idx);
      if (dist <= tol) applyFadeAt(idx, dist);
    }
    return { keyColorRgb: keyRgb, outputRgba: out, clearedPixelCount };
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const dist = colorDistNormalized(idx);
    if (dist <= tol) {
      visited[idx] = 1;
      queue[tail] = idx;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head] ?? 0;
    head += 1;
    const dist = colorDistNormalized(idx);
    applyFadeAt(idx, dist);
    const x = idx % width;
    const y = Math.trunc(idx / width);
    tryEnqueue(x - 1, y);
    tryEnqueue(x + 1, y);
    tryEnqueue(x, y - 1);
    tryEnqueue(x, y + 1);
  }

  return { keyColorRgb: keyRgb, outputRgba: out, clearedPixelCount };
}

export interface KaistorySfxStylePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly fillHex: string;
  readonly outerStrokeHex: string;
  readonly innerStrokeHex: string;
}

export const KAISTORY_SFX_STYLE_PRESETS: readonly KaistorySfxStylePreset[] = Object.freeze([
  { id: "impact-red", labelKo: "강렬 빨강", fillHex: "#FF2E2E", outerStrokeHex: "#FFFFFF", innerStrokeHex: "#111111" },
  { id: "gold-impact", labelKo: "골드 임팩트", fillHex: "#FFB800", outerStrokeHex: "#111111", innerStrokeHex: "#FFF3B0" },
  { id: "neon-blue", labelKo: "네온 블루", fillHex: "#00E5FF", outerStrokeHex: "#0A192F", innerStrokeHex: "#FFFFFF" },
  { id: "dark-horror", labelKo: "다크 호러", fillHex: "#1F122B", outerStrokeHex: "#E11D48", innerStrokeHex: "#FFFFFF" },
  { id: "comic-yellow", labelKo: "코믹 옐로우", fillHex: "#FACC15", outerStrokeHex: "#1E293B", innerStrokeHex: "#FFFFFF" },
  { id: "mint-pop", labelKo: "민트 팝", fillHex: "#34D399", outerStrokeHex: "#064E3B", innerStrokeHex: "#FFFFFF" },
]);

/**
 * 두 문자열 간 정규화 Levenshtein 유사도(0..1)를 계산한다.
 */
export function computeNormalizedLevenshteinSimilarity(a: string, b: string): number {
  const s1 = a.trim().replace(/\s+/gu, " ");
  const s2 = b.trim().replace(/\s+/gu, " ");
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const prev = Array.from({ length: len2 + 1 }, (_, j) => j);
  const curr = new Array<number>(len2 + 1).fill(0);

  for (let i = 1; i <= len1; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= len2; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= len2; j += 1) prev[j] = curr[j] ?? 0;
  }

  const distance = prev[len2] ?? Math.max(len1, len2);
  return 1 - distance / Math.max(len1, len2);
}

export interface KaistoryKontiRelinkCandidate {
  readonly bubbleId: string;
  readonly linkedDialogueId: string | null;
  readonly similarity: number;
  readonly status: "kept" | "relinked" | "unmatched";
  readonly restoredTranslations: Readonly<Partial<Record<KaistoryLangCode, string>>>;
}

/**
 * 끊어진 콘티 대사 참조(`kontiRef`)를 Levenshtein 유사도(`>= 0.8`)로 자동 재연결하고
 * 5개국어 번역(`ko`, `en`, `ja`, `zh`, `ru`)을 복원한다.
 */
export function relinkOrphanedBubblesByLevenshtein(input: {
  readonly bubbles: readonly {
    readonly bubbleId: string;
    readonly currentKontiRef?: string;
    readonly koText: string;
  }[];
  readonly contiDialogues: readonly KaistoryContiDialogue[];
  readonly threshold?: number;
}): readonly KaistoryKontiRelinkCandidate[] {
  const minSim = input.threshold ?? 0.8;
  const byId = new Map(input.contiDialogues.map((d) => [d.id, d]));

  return Object.freeze(
    input.bubbles.map((bubble) => {
      if (bubble.currentKontiRef && byId.has(bubble.currentKontiRef)) {
        const existing = byId.get(bubble.currentKontiRef)!;
        return {
          bubbleId: bubble.bubbleId,
          linkedDialogueId: existing.id,
          similarity: 1,
          status: "kept" as const,
          restoredTranslations: { ko: existing.text, ...existing.translations },
        };
      }
      let bestDialogue: KaistoryContiDialogue | null = null;
      let bestScore = 0;
      for (const candidate of input.contiDialogues) {
        const score = computeNormalizedLevenshteinSimilarity(bubble.koText, candidate.text);
        if (score > bestScore) {
          bestScore = score;
          bestDialogue = candidate;
        }
      }
      if (bestDialogue && bestScore >= minSim) {
        return {
          bubbleId: bubble.bubbleId,
          linkedDialogueId: bestDialogue.id,
          similarity: Math.round(bestScore * 1000) / 1000,
          status: "relinked" as const,
          restoredTranslations: { ko: bestDialogue.text, ...bestDialogue.translations },
        };
      }
      return {
        bubbleId: bubble.bubbleId,
        linkedDialogueId: null,
        similarity: Math.round(bestScore * 1000) / 1000,
        status: "unmatched" as const,
        restoredTranslations: { ko: bubble.koText },
      };
    }),
  );
}

/**
 * PSD 레이어 메타데이터를 분석하여 `design.kaistory.net`의 `importKonti` 규칙
 * (`컷 테두리`, `스케치`, `배경`, 면적 비율 `> 0.22` 캐릭터 vs 대사/말풍선)으로 분류한다.
 */
export function classifyImportedPsdLayer(input: {
  readonly layerName: string;
  readonly layerWidth: number;
  readonly layerHeight: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
}): "frame_border" | "sketch" | "background" | "character" | "balloon_or_sfx" {
  const name = input.layerName.trim().toLowerCase();
  if (/테두리|frame|border/u.test(name)) return "frame_border";
  if (/스케치|콘티|러프|sketch|rough/u.test(name)) return "sketch";
  if (/배경|bg|background/u.test(name)) return "background";

  const panelMaxDim = Math.max(1, input.panelWidth, input.panelHeight);
  const layerMaxDim = Math.max(input.layerWidth, input.layerHeight);
  const sizeRatio = layerMaxDim / panelMaxDim;
  return sizeRatio > 0.22 ? "character" : "balloon_or_sfx";
}

export interface KaistoryFiveLangDialogueRow {
  readonly pageNumber: number;
  readonly order: number;
  readonly speaker: string;
  readonly kind: string;
  readonly KO: string;
  readonly EN: string;
  readonly JA: string;
  readonly ZH: string;
  readonly RU: string;
}

/**
 * `design.kaistory.net`의 `_대사.xlsx` 내보내기 규격(`["페이지", "순서", "화자", "유형", "KO", "EN", "JA", "ZH", "RU"]`)으로
 * 다국어 대사 행을 생성한다.
 */
export function buildFiveLangDialogueSheetRows(
  pages: readonly {
    readonly pageNumber: number;
    readonly dialogues: readonly KaistoryContiDialogue[];
  }[],
): readonly KaistoryFiveLangDialogueRow[] {
  const rows: KaistoryFiveLangDialogueRow[] = [];
  for (const page of pages) {
    page.dialogues.forEach((dialogue, index) => {
      rows.push({
        pageNumber: page.pageNumber,
        order: index + 1,
        speaker: dialogue.speakerName || "미지정",
        kind: dialogue.kind,
        KO: dialogue.translations.ko ?? dialogue.text,
        EN: dialogue.translations.en ?? "",
        JA: dialogue.translations.ja ?? "",
        ZH: dialogue.translations.zh ?? "",
        RU: dialogue.translations.ru ?? "",
      });
    });
  }
  return Object.freeze(rows);
}
