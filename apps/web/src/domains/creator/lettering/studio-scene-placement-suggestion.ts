/**
 * Studio Scene Placement Suggestion — 말풍선·효과음 씬 배치 제안 순수 코어.
 *
 * 투닝 플러스 Editor의 씬 배치 자동화(컷 안 요소 배치를 읽어 다음 배치를
 * 제안)를 우리 구조로 흡수한 제안 층이다. 기존 자산과의 역할 분담:
 *  - `studio-bubble-auto-layout`는 "새 말풍선 여러 개를 한 번에 전 배치"하는
 *    배치 엔진이다. 이 모듈은 그와 달리, 이미 컷에 있는(또는 막 넣으려는)
 *    말풍선·효과음 하나하나에 대해 "여기가 좋아요" 후보를 순위·근거와 함께
 *    제안하고, 사용자가 골라 미리보기→적용/취소하는 단건 제안 층이다.
 *    효과음 배치는 자동 배치 엔진이 다루지 않아 이 모듈이 처음 맡는다.
 *  - 꼬리(tailDirection/tailXRatio/tailHeight)는 새로 계산하지 않고
 *    `studio-bubble-anchor`의 computeBubbleAnchorTail을 그대로 쓴다 —
 *    손잡이 드래그·자동 부착과 100% 같은 꼬리가 나온다.
 *  - 감정 정합은 `StudioAiEmotionBubbleMatcher`(ai/)의 판정을 그대로 읽는다.
 *    대사가 있으면 판정 감정·추천 형상을 후보와 함께 반환하고, 호스트가
 *    지정한 감정/형상과 다르면 경고를 낸다(조용히 덮지 않는다). 외침·놀람
 *    (spiky 형상)은 주변 여유 공간이 있어야 한다는 배치 가점/감점만 얹는다.
 *  - 효과음 카테고리는 `studio-sfx-presets`의 SfxCategory 6종을 그대로 쓴다.
 *
 * 전부 순수·결정적. DOM/Konva 의존성 없음. 좌표계는 전부 페이지 좌표
 * (BubbleEl.x/y와 동일 원점), 회전된 요소는 바운즈 근사로 취급한다
 * (elBounds() 전역 관례와 동일).
 */

import type { SfxCategory } from "../studio-sfx-presets";
import {
  StudioAiEmotionBubbleMatcher,
  type BubbleShapePreset,
  type SpeechEmotionKind,
} from "../ai/studio-ai-emotion-bubble-matcher";
import { computeBubbleAnchorTail, type BubbleAnchorTailResult } from "./studio-bubble-anchor";

/** 패널 안쪽 여백(px) — auto-layout의 BUBBLE_AUTO_LAYOUT_MARGIN과 같은 값. */
export const SCENE_PLACEMENT_PANEL_MARGIN = 12;
/** 화자/앵커와 요소 사이의 기본 간격(px). */
export const SCENE_PLACEMENT_ANCHOR_GAP = 16;
/** 얼굴 영역으로 보는 캐릭터 바운즈 상단 비율 — 이 영역 침범은 강하게 감점. */
export const SCENE_PLACEMENT_FACE_ZONE_RATIO = 0.32;
/** 외침·놀람(spiky) 형상이 "여유 있다"고 보는 최소 clearance(px). */
export const SCENE_PLACEMENT_SPIKY_CLEARANCE_PX = 20;

export interface ScenePlacementRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 컷 안 캐릭터(또는 소리 발생 대상) — 화자·앵커·장애물을 겸한다. */
export interface ScenePlacementFigure {
  readonly id: string;
  readonly bounds: ScenePlacementRect;
  /** 얼굴/입 중심(페이지 좌표). 없으면 바운즈 상단 중앙으로 근사한다. */
  readonly facePoint?: { readonly x: number; readonly y: number };
  readonly label?: string;
}

export interface ScenePlacementScene {
  /** 컷(패널) 경계. 후보는 이 안쪽(여백 적용)에 들어와야 한다. */
  readonly panel: ScenePlacementRect;
  readonly figures: readonly ScenePlacementFigure[];
  /** 캐릭터 외 고정 장애물(중요 배경 요소 등). 기본 []. */
  readonly obstacles?: readonly ScenePlacementRect[];
  /** 이미 확정 배치된 다른 말풍선·효과음 영역 — 새 후보가 피한다. 기본 []. */
  readonly occupied?: readonly ScenePlacementRect[];
}

interface ScenePlacementRequestBase {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** 현재 위치 — 있으면 급격한 이동을 피하는 안정성 가점을 준다. */
  readonly current?: { readonly x: number; readonly y: number };
}

export interface BalloonScenePlacementRequest extends ScenePlacementRequestBase {
  readonly kind: "balloon";
  /** 화자 figure id. speakerPoint가 있으면 그쪽이 우선. */
  readonly speakerId?: string;
  /** 화자 얼굴/입 좌표 직접 지정. */
  readonly speakerPoint?: { readonly x: number; readonly y: number };
  /** 화자 방향 미러(BubbleEl.tail과 동일 의미) — 꼬리 계산에 그대로 전달. */
  readonly tailSide?: "left" | "right" | "none";
  /** 대사 — 감정 매처 정합 검사용. 없으면 감정 검사를 건너뛴다. */
  readonly text?: string;
  /** 호스트가 이미 정한 감정 — 매처 판정과 다르면 경고를 낸다. */
  readonly emotion?: SpeechEmotionKind;
  /** 호스트가 이미 정한 말풍선 형상 — 매처 추천과 다르면 경고를 낸다. */
  readonly bubbleShape?: BubbleShapePreset;
}

export interface SfxScenePlacementRequest extends ScenePlacementRequestBase {
  readonly kind: "sfx";
  /** 효과음 카테고리(studio-sfx-presets 6종) — 배치 성향을 가른다. */
  readonly category?: SfxCategory;
  /** 소리가 나는 대상 figure id. anchorPoint가 있으면 그쪽이 우선. */
  readonly anchorFigureId?: string;
  /** 소리 발생 좌표 직접 지정. */
  readonly anchorPoint?: { readonly x: number; readonly y: number };
}

export type ScenePlacementRequest = BalloonScenePlacementRequest | SfxScenePlacementRequest;

/** 후보 근거 코드 — 패널이 라벨로 번역해 보여준다. */
export type ScenePlacementReasonCode =
  | "near-speaker"
  | "above-speaker"
  | "clear-of-figures"
  | "face-overlap"
  | "figure-overlap"
  | "occupied-overlap"
  | "obstacle-overlap"
  | "wide-clearance"
  | "emotion-room"
  | "emotion-cramped"
  | "near-action"
  | "panel-edge"
  | "stable-position"
  | "tail-clamped";

export interface ScenePlacementCandidate {
  readonly x: number;
  readonly y: number;
  /** 0..100. 높을수록 좋다. */
  readonly score: number;
  readonly reasons: readonly ScenePlacementReasonCode[];
  /** 말풍선 후보에만 — 앵커 코어로 계산한 꼬리(손잡이 드래그와 동일 결과). */
  readonly tail?: BubbleAnchorTailResult;
  /** 패널 안에 온전히 들어가는가. */
  readonly fitsPanel: boolean;
  /** 캐릭터 바운즈와 겹치는가(얼굴 포함 여부와 별개로 사실만 보고). */
  readonly overlapsFigure: boolean;
  /** 가장 가까운 장애물·캐릭터·확정 영역까지의 여유(px). 겹치면 0. */
  readonly clearancePx: number;
}

export interface ScenePlacementEmotionInfo {
  readonly detectedEmotion: SpeechEmotionKind;
  readonly recommendedBubbleShape: BubbleShapePreset;
  readonly confidenceScore: number;
  readonly needsHumanReview: boolean;
  /** 호스트 지정 감정·형상이 매처 판정과 어긋나지 않는가. 지정이 없으면 true. */
  readonly consistent: boolean;
}

export interface ScenePlacementSuggestion {
  readonly requestId: string;
  readonly kind: ScenePlacementRequest["kind"];
  /** 점수 내림차순(동률은 읽기 순서: 위→아래, 왼쪽→오른쪽). */
  readonly candidates: readonly ScenePlacementCandidate[];
  /** 1순위 후보. 후보가 하나도 없으면 null(경고 참조). */
  readonly best: ScenePlacementCandidate | null;
  /** 말풍선+대사가 있을 때만 — 감정 매처 판정과 정합 여부. */
  readonly emotion?: ScenePlacementEmotionInfo;
  readonly warnings: readonly string[];
}

export interface ScenePlacementOptions {
  /** 반환할 후보 수 상한. 기본 3. */
  readonly limit?: number;
  readonly panelMargin?: number;
  readonly anchorGap?: number;
}

/** 적용 패치 — 호스트 요소(BubbleEl/TextEl 부분집합)에 그대로 얹을 수 있는 형태. */
export interface ScenePlacementPatch {
  readonly id: string;
  readonly kind: ScenePlacementRequest["kind"];
  readonly x: number;
  readonly y: number;
  /** 말풍선만 — BubbleEl의 tailDirection/tailXRatio/tailHeight로 바로 복사. */
  readonly tail?: BubbleAnchorTailResult;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function overlapArea(a: ScenePlacementRect, b: ScenePlacementRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 두 rect 사이 간격(px). 겹치면 0. */
function rectGap(a: ScenePlacementRect, b: ScenePlacementRect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

function faceZone(fig: ScenePlacementFigure): ScenePlacementRect {
  const h = fig.bounds.h * SCENE_PLACEMENT_FACE_ZONE_RATIO;
  return { x: fig.bounds.x, y: fig.bounds.y, w: fig.bounds.w, h };
}

function figureFacePoint(fig: ScenePlacementFigure): { x: number; y: number } {
  if (fig.facePoint) return fig.facePoint;
  return {
    x: fig.bounds.x + fig.bounds.w / 2,
    y: fig.bounds.y + fig.bounds.h * SCENE_PLACEMENT_FACE_ZONE_RATIO,
  };
}

/** 후보 위치 생성 — 앵커 주변 8슬롯 + 패널 여백 9분할 슬롯. 중복은 좌표로 제거. */
function generatePositions(
  req: ScenePlacementRequest,
  scene: ScenePlacementScene,
  anchor: { x: number; y: number; bounds?: ScenePlacementRect } | null,
  margin: number,
  gap: number,
): { x: number; y: number; slot: string }[] {
  const { width: w, height: h } = req;
  const panel = scene.panel;
  const out: { x: number; y: number; slot: string }[] = [];
  const seen = new Set<string>();
  const push = (x: number, y: number, slot: string) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const key = `${rx},${ry}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x: rx, y: ry, slot });
  };

  if (anchor?.bounds) {
    const b = anchor.bounds;
    const cx = b.x + b.w / 2 - w / 2;
    push(cx, b.y - gap - h, "above");
    push(b.x - gap - w, b.y - gap - h, "above-left");
    push(b.x + b.w + gap, b.y - gap - h, "above-right");
    push(b.x - gap - w, b.y, "left");
    push(b.x + b.w + gap, b.y, "right");
    push(cx, b.y + b.h + gap, "below");
    push(b.x - gap - w, b.y + b.h + gap, "below-left");
    push(b.x + b.w + gap, b.y + b.h + gap, "below-right");
  } else if (anchor) {
    // 점 앵커(얼굴/발생점) — 요소를 앵커 위쪽에 두는 것을 기본으로 8방향.
    const d = Math.max(w, h) * 0.5 + gap;
    push(anchor.x - w / 2, anchor.y - d - h / 2, "above");
    push(anchor.x - w / 2 + d, anchor.y - d - h / 2, "above-right");
    push(anchor.x - w / 2 - d, anchor.y - d - h / 2, "above-left");
    push(anchor.x + d - w / 2, anchor.y - h / 2, "right");
    push(anchor.x - d - w / 2, anchor.y - h / 2, "left");
    push(anchor.x - w / 2, anchor.y + d - h / 2, "below");
    push(anchor.x - w / 2 + d, anchor.y + d - h / 2, "below-right");
    push(anchor.x - w / 2 - d, anchor.y + d - h / 2, "below-left");
  }

  // 패널 여백 슬롯 — 화자가 없거나 앵커 슬롯이 전부 막혔을 때의 폴백이자
  // ambient/silence 효과음의 주 무대.
  const ix = panel.x + margin;
  const iy = panel.y + margin;
  const iw = Math.max(0, panel.w - margin * 2 - w);
  const ih = Math.max(0, panel.h - margin * 2 - h);
  push(ix, iy, "panel-top-left");
  push(ix + iw / 2, iy, "panel-top");
  push(ix + iw, iy, "panel-top-right");
  push(ix, iy + ih / 2, "panel-left");
  push(ix + iw / 2, iy + ih / 2, "panel-center");
  push(ix + iw, iy + ih / 2, "panel-right");
  push(ix, iy + ih, "panel-bottom-left");
  push(ix + iw / 2, iy + ih, "panel-bottom");
  push(ix + iw, iy + ih, "panel-bottom-right");
  return out;
}

const SPIKY_EMOTIONS: ReadonlySet<SpeechEmotionKind> = new Set(["rage-shout", "shock-gasp"]);
const NEAR_ANCHOR_SFX: ReadonlySet<SfxCategory> = new Set(["impact", "motion"]);
const EDGE_SFX: ReadonlySet<SfxCategory> = new Set(["ambient", "silence"]);

const emotionMatcher = new StudioAiEmotionBubbleMatcher();

/**
 * 말풍선·효과음 하나의 배치 후보를 도출한다.
 * 후보가 패널에 전혀 들어가지 않으면 best=null + 경고를 반환한다(지어내지 않음).
 */
export function suggestScenePlacement(
  req: ScenePlacementRequest,
  scene: ScenePlacementScene,
  options: ScenePlacementOptions = {},
): ScenePlacementSuggestion {
  const warnings: string[] = [];
  const limit = Math.max(1, Math.floor(options.limit ?? 3));
  const margin = options.panelMargin ?? SCENE_PLACEMENT_PANEL_MARGIN;
  const gap = options.anchorGap ?? SCENE_PLACEMENT_ANCHOR_GAP;
  const panel = scene.panel;
  const figures = scene.figures ?? [];
  const obstacles = scene.obstacles ?? [];
  const occupied = scene.occupied ?? [];

  // --- 앵커(화자/발생점) 해석 ---
  let anchorPoint: { x: number; y: number } | null = null;
  let anchorBounds: ScenePlacementRect | undefined;
  let anchorFigure: ScenePlacementFigure | undefined;
  if (req.kind === "balloon") {
    if (req.speakerPoint) {
      anchorPoint = req.speakerPoint;
    } else if (req.speakerId) {
      anchorFigure = figures.find((f) => f.id === req.speakerId);
      if (anchorFigure) {
        anchorPoint = figureFacePoint(anchorFigure);
        anchorBounds = anchorFigure.bounds;
      } else {
        warnings.push(`화자(${req.speakerId})를 컷에서 찾지 못해 여백 기준으로만 제안해요.`);
      }
    }
  } else {
    if (req.anchorPoint) {
      anchorPoint = req.anchorPoint;
    } else if (req.anchorFigureId) {
      anchorFigure = figures.find((f) => f.id === req.anchorFigureId);
      if (anchorFigure) {
        anchorPoint = {
          x: anchorFigure.bounds.x + anchorFigure.bounds.w / 2,
          y: anchorFigure.bounds.y + anchorFigure.bounds.h / 2,
        };
        anchorBounds = anchorFigure.bounds;
      } else {
        warnings.push(`효과음 대상(${req.anchorFigureId})을 컷에서 찾지 못해 여백 기준으로만 제안해요.`);
      }
    }
  }

  // --- 감정 매처 정합 (말풍선+대사) ---
  let emotion: ScenePlacementEmotionInfo | undefined;
  if (req.kind === "balloon" && req.text && req.text.trim()) {
    const rec = emotionMatcher.match(req.text);
    const mismatches: string[] = [];
    if (req.emotion && req.emotion !== rec.detectedEmotion) {
      mismatches.push(`지정한 감정(${req.emotion})과 매처 판정(${rec.detectedEmotion})이 달라요`);
    }
    if (req.bubbleShape && req.bubbleShape !== rec.recommendedBubbleShape) {
      mismatches.push(`지정한 형상(${req.bubbleShape})과 매처 추천(${rec.recommendedBubbleShape})이 달라요`);
    }
    emotion = {
      detectedEmotion: rec.detectedEmotion,
      recommendedBubbleShape: rec.recommendedBubbleShape,
      confidenceScore: rec.confidenceScore,
      needsHumanReview: rec.needsHumanReview,
      consistent: mismatches.length === 0,
    };
    warnings.push(...mismatches);
  }
  const spiky = emotion ? SPIKY_EMOTIONS.has(emotion.detectedEmotion) : false;

  // --- 후보 채점 ---
  const panelDiag = Math.hypot(panel.w, panel.h) || 1;
  const innerPanel: ScenePlacementRect = {
    x: panel.x + margin,
    y: panel.y + margin,
    w: Math.max(0, panel.w - margin * 2),
    h: Math.max(0, panel.h - margin * 2),
  };
  const positions = generatePositions(
    req,
    scene,
    anchorPoint ? { x: anchorPoint.x, y: anchorPoint.y, bounds: anchorBounds } : null,
    margin,
    gap,
  );

  const scored: ScenePlacementCandidate[] = [];
  const seenClamped = new Set<string>();
  for (const pos of positions) {
    // 패널 안으로 클램프 — 클램프 후에도 넘치면(요소가 패널보다 크면) 부적합.
    const x = clamp(pos.x, innerPanel.x, innerPanel.x + Math.max(0, innerPanel.w - req.width));
    const y = clamp(pos.y, innerPanel.y, innerPanel.y + Math.max(0, innerPanel.h - req.height));
    const clampedKey = `${x},${y}`;
    if (seenClamped.has(clampedKey)) continue;
    seenClamped.add(clampedKey);
    const rect: ScenePlacementRect = { x, y, w: req.width, h: req.height };
    const fitsPanel = req.width <= innerPanel.w && req.height <= innerPanel.h;
    if (!fitsPanel) continue;

    const reasons = new Set<ScenePlacementReasonCode>();
    let score = 60;

    // 겹침 감점 — 자기 화자 포함 전 캐릭터가 대상(본체가 화자를 가리면 안 됨).
    let figureOverlapRatio = 0;
    let faceOverlapRatio = 0;
    let overlapsFigure = false;
    for (const fig of figures) {
      const ov = overlapArea(rect, fig.bounds);
      if (ov > 0) {
        overlapsFigure = true;
        figureOverlapRatio = Math.max(figureOverlapRatio, ov / (req.width * req.height));
      }
      const fov = overlapArea(rect, faceZone(fig));
      if (fov > 0) {
        faceOverlapRatio = Math.max(faceOverlapRatio, fov / (req.width * req.height));
      }
    }
    if (req.kind === "sfx" && req.category && NEAR_ANCHOR_SFX.has(req.category)) {
      // 임팩트·모션 효과음은 그림 위에 얹는 게 관례 — 몸통 겹침은 약하게만.
      score -= Math.round(15 * figureOverlapRatio);
    } else {
      score -= Math.round(45 * figureOverlapRatio);
    }
    if (figureOverlapRatio > 0) reasons.add("figure-overlap");
    score -= Math.round(30 * faceOverlapRatio);
    if (faceOverlapRatio > 0) reasons.add("face-overlap");

    let occupiedRatio = 0;
    for (const occ of occupied) {
      occupiedRatio = Math.max(occupiedRatio, overlapArea(rect, occ) / (req.width * req.height));
    }
    score -= Math.round(35 * occupiedRatio);
    if (occupiedRatio > 0) reasons.add("occupied-overlap");

    let obstacleRatio = 0;
    for (const ob of obstacles) {
      obstacleRatio = Math.max(obstacleRatio, overlapArea(rect, ob) / (req.width * req.height));
    }
    score -= Math.round(30 * obstacleRatio);
    if (obstacleRatio > 0) reasons.add("obstacle-overlap");

    if (!overlapsFigure && occupiedRatio === 0 && obstacleRatio === 0) {
      reasons.add("clear-of-figures");
    }

    // 여유 공간(clearance)
    let clearance = Number.POSITIVE_INFINITY;
    for (const fig of figures) clearance = Math.min(clearance, rectGap(rect, fig.bounds));
    for (const ob of obstacles) clearance = Math.min(clearance, rectGap(rect, ob));
    for (const occ of occupied) clearance = Math.min(clearance, rectGap(rect, occ));
    if (!Number.isFinite(clearance)) clearance = Math.min(panel.w, panel.h);
    score += Math.round(10 * Math.min(1, clearance / 48));
    if (clearance >= 32) reasons.add("wide-clearance");

    // 앵커 근접·성향
    if (anchorPoint) {
      const center = { x: x + req.width / 2, y: y + req.height / 2 };
      const dist = Math.hypot(center.x - anchorPoint.x, center.y - anchorPoint.y);
      const proximity = 1 - Math.min(1, dist / panelDiag);
      if (req.kind === "balloon") {
        score += Math.round(20 * proximity);
        if (proximity > 0.55) reasons.add("near-speaker");
        if (center.y < anchorPoint.y) {
          // 읽기 순서: 말풍선은 화자보다 위가 기본(웹툰 세로 읽기).
          score += 6;
          reasons.add("above-speaker");
        }
      } else if (req.category && EDGE_SFX.has(req.category)) {
        // ambient/silence는 앵커에서 멀고 패널 가장자리에 붙을수록 좋다.
        score += Math.round(12 * (1 - proximity));
        const edgeDist = Math.min(
          x - innerPanel.x,
          innerPanel.x + innerPanel.w - (x + req.width),
          y - innerPanel.y,
          innerPanel.y + innerPanel.h - (y + req.height),
        );
        if (edgeDist <= 1) {
          score += 8;
          reasons.add("panel-edge");
        }
      } else {
        score += Math.round(18 * proximity);
        if (proximity > 0.55) reasons.add("near-action");
      }
    } else if (req.kind === "sfx" && req.category && EDGE_SFX.has(req.category)) {
      const edgeDist = Math.min(
        x - innerPanel.x,
        innerPanel.x + innerPanel.w - (x + req.width),
        y - innerPanel.y,
        innerPanel.y + innerPanel.h - (y + req.height),
      );
      if (edgeDist <= 1) {
        score += 8;
        reasons.add("panel-edge");
      }
    }

    // 감정(spiky) 여유 조건
    if (spiky) {
      if (clearance >= SCENE_PLACEMENT_SPIKY_CLEARANCE_PX) {
        score += 5;
        reasons.add("emotion-room");
      } else if (clearance < 8) {
        score -= 5;
        reasons.add("emotion-cramped");
      }
    }

    // 현재 위치 안정성 — 가까운 후보를 살짝 우대해 제안이 요동치지 않게.
    if (req.current) {
      const moved = Math.hypot(x - req.current.x, y - req.current.y);
      if (moved <= 24) {
        score += 4;
        reasons.add("stable-position");
      }
    }

    // 꼬리 — 앵커 코어 재사용(말풍선만, 화자가 있을 때만).
    let tail: BubbleAnchorTailResult | undefined;
    if (req.kind === "balloon" && anchorPoint) {
      const computed = computeBubbleAnchorTail(
        { x, y, width: req.width, height: req.height, rotation: 0, tail: req.tailSide ?? "left" },
        anchorPoint,
      );
      if (computed) {
        tail = computed;
        if (computed.tailHeight >= 150) reasons.add("tail-clamped");
      }
    }

    scored.push({
      x,
      y,
      score: clamp(Math.round(score), 0, 100),
      reasons: [...reasons],
      ...(tail ? { tail } : {}),
      fitsPanel,
      overlapsFigure,
      clearancePx: Math.round(clearance),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  const candidates = scored.slice(0, limit);
  if (candidates.length === 0) {
    warnings.push("패널 안에 들어가는 배치 후보가 없어요. 요소 크기를 줄이거나 패널을 넓혀 주세요.");
  }

  return {
    requestId: req.id,
    kind: req.kind,
    candidates,
    best: candidates[0] ?? null,
    ...(emotion ? { emotion } : {}),
    warnings,
  };
}

/** 여러 요청을 한 번에 — 앞선 제안의 1순위를 occupied에 누적해 서로 겹치지 않게 한다. */
export function suggestScenePlacements(
  requests: readonly ScenePlacementRequest[],
  scene: ScenePlacementScene,
  options: ScenePlacementOptions = {},
): readonly ScenePlacementSuggestion[] {
  const occupied: ScenePlacementRect[] = [...(scene.occupied ?? [])];
  const out: ScenePlacementSuggestion[] = [];
  for (const req of requests) {
    const suggestion = suggestScenePlacement(req, { ...scene, occupied }, options);
    out.push(suggestion);
    if (suggestion.best) {
      occupied.push({ x: suggestion.best.x, y: suggestion.best.y, w: req.width, h: req.height });
    }
  }
  return out;
}

/** 선택한 후보 → 적용 패치. 미리보기와 실제 적용이 같은 패치를 쓴다. */
export function buildScenePlacementPatch(
  suggestion: ScenePlacementSuggestion,
  candidateIndex = 0,
): ScenePlacementPatch | null {
  const candidate = suggestion.candidates[candidateIndex];
  if (!candidate) return null;
  return {
    id: suggestion.requestId,
    kind: suggestion.kind,
    x: candidate.x,
    y: candidate.y,
    ...(candidate.tail ? { tail: candidate.tail } : {}),
  };
}

export interface ScenePlacementElementLike {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly tailDirection?: string;
  readonly tailXRatio?: number;
  readonly tailHeight?: number;
}

/**
 * 패치들을 요소 배열에 불변 적용한다 — "적용"의 실체. "취소"는 이 함수를
 * 부르지 않고 미리보기 패치를 버리는 것이라 별도 롤백이 필요 없다.
 * 패치에 없는 요소는 참조를 그대로 유지한다.
 */
export function applyScenePlacementPatches<T extends ScenePlacementElementLike>(
  elements: readonly T[],
  patches: readonly ScenePlacementPatch[],
): T[] {
  const byId = new Map(patches.map((p) => [p.id, p]));
  return elements.map((el) => {
    const patch = byId.get(el.id);
    if (!patch) return el;
    return {
      ...el,
      x: patch.x,
      y: patch.y,
      ...(patch.tail
        ? {
            tailDirection: patch.tail.tailDirection,
            tailXRatio: patch.tail.tailXRatio,
            tailHeight: patch.tail.tailHeight,
          }
        : {}),
    };
  });
}
