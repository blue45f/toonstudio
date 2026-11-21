/**
 * PPT 마스터 컷 슬라이드 & 발표 레이저 포인터 · 형광펜 주석 · 발표자 노트 엔진.
 */

import type { Point2D } from "./ppt-boolean-geometry";

export type SlideTransitionKind = "none" | "fade" | "slide-left" | "zoom-cut";
export type SlideLayoutMaster = "full-cut" | "split-script" | "story-grid" | "pitch-cover";

export interface LaserPointerSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly opacity: number;
}

export interface HighlighterStroke {
  readonly id: string;
  readonly colorToken: string;
  readonly widthPx: number;
  readonly points: readonly Point2D[];
}

export interface PresentationSlide {
  readonly id: string;
  readonly cutNumber: number;
  readonly title: string;
  readonly layoutMaster: SlideLayoutMaster;
  readonly speakerNotes: string;
  readonly transition: SlideTransitionKind;
  readonly durationSec: number;
  readonly shapeIds: readonly string[];
  readonly highlights: readonly HighlighterStroke[];
}

export interface PresentationDeckState {
  readonly title: string;
  readonly currentSlideIndex: number;
  readonly slides: readonly PresentationSlide[];
  readonly laserEnabled: boolean;
  readonly laserFadeMs: number;
  readonly laserTrail: readonly LaserPointerSample[];
  readonly highlighterEnabled: boolean;
}

export interface CutSlideInput {
  readonly cutNumber: number;
  readonly title: string;
  readonly notes: string;
  readonly layoutMaster?: SlideLayoutMaster;
  readonly shapeIds?: readonly string[];
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createMasterSlidesFromCuts(
  cuts: readonly CutSlideInput[],
  deckTitle = "웹툰 콘티 발표 덱",
): PresentationDeckState {
  const slides: PresentationSlide[] = cuts.map((cut, index) => ({
    id: `slide-cut-${cut.cutNumber}`,
    cutNumber: cut.cutNumber,
    title: cut.title,
    layoutMaster: cut.layoutMaster ?? (index === 0 ? "pitch-cover" : "full-cut"),
    speakerNotes: cut.notes,
    transition: index === 0 ? "fade" : "slide-left",
    durationSec: 20,
    shapeIds: cut.shapeIds ?? [],
    highlights: [],
  }));
  return {
    title: deckTitle,
    currentSlideIndex: 0,
    slides,
    laserEnabled: true,
    laserFadeMs: 1200,
    laserTrail: [],
    highlighterEnabled: false,
  };
}

export function pruneLaserTrail(
  deck: PresentationDeckState,
  nowMs: number,
): PresentationDeckState {
  const fadeMs = Math.max(100, deck.laserFadeMs);
  const nextTrail = deck.laserTrail
    .map((sample) => {
      const age = Math.max(0, nowMs - sample.timestampMs);
      const opacity = roundMetric(clamp(1 - age / fadeMs, 0, 1));
      return { ...sample, opacity };
    })
    .filter((sample) => sample.opacity > 0.02);
  return { ...deck, laserTrail: nextTrail };
}

export function appendLaserPointerPoint(
  deck: PresentationDeckState,
  point: Point2D,
  nowMs: number,
): PresentationDeckState {
  if (!deck.laserEnabled) return deck;
  const pruned = pruneLaserTrail(deck, nowMs);
  const appended: LaserPointerSample = {
    x: roundMetric(point.x),
    y: roundMetric(point.y),
    timestampMs: nowMs,
    opacity: 1,
  };
  return { ...pruned, laserTrail: [...pruned.laserTrail.slice(-47), appended] };
}

export function addSlideHighlighterStroke(
  deck: PresentationDeckState,
  points: readonly Point2D[],
  colorToken = "var(--ppt-highlight-amber)",
  widthPx = 14,
): PresentationDeckState {
  if (points.length < 2 || deck.slides.length === 0) return deck;
  const slideIdx = clamp(deck.currentSlideIndex, 0, deck.slides.length - 1);
  const nextSlides = deck.slides.map((slide, idx) => {
    if (idx !== slideIdx) return slide;
    const stroke: HighlighterStroke = {
      id: `hl-${slide.id}-${slide.highlights.length + 1}`,
      colorToken,
      widthPx,
      points,
    };
    return { ...slide, highlights: [...slide.highlights, stroke] };
  });
  return { ...deck, slides: nextSlides };
}

export function updateSlideNotes(
  deck: PresentationDeckState,
  slideId: string,
  notes: string,
): PresentationDeckState {
  return {
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId ? { ...slide, speakerNotes: notes } : slide,
    ),
  };
}

export function navigatePresentationSlide(
  deck: PresentationDeckState,
  targetIndex: number,
): PresentationDeckState {
  if (deck.slides.length === 0) return deck;
  return {
    ...deck,
    currentSlideIndex: clamp(targetIndex, 0, deck.slides.length - 1),
    laserTrail: [],
  };
}

export function createDefaultPresentationDeck(): PresentationDeckState {
  return createMasterSlidesFromCuts(
    [
      {
        cutNumber: 1,
        title: "1화 오프닝 — 옥상 대치 구도",
        layoutMaster: "pitch-cover",
        notes: "하이 앵글에서 주인공 실루엣을 강조하고, 2초 정적 뒤 타이틀 진입.",
        shapeIds: ["cut-a", "cut-b"],
      },
      {
        cutNumber: 2,
        title: "전환 컷 — 시선 유도 및 대사 배치",
        layoutMaster: "split-script",
        notes: "좌측 컷에서 우측 액션 컷으로 엘보우 시선선을 유지해 독자 피로 감소.",
        shapeIds: ["cut-c"],
      },
      {
        cutNumber: 3,
        title: "클라이맥스 — 집중선 및 감정 폭발",
        layoutMaster: "story-grid",
        notes: "말풍선 겹침을 불리언 결합으로 정리해 가독성 확보.",
        shapeIds: ["cut-d"],
      },
    ],
    "1화 콘티 · 편집자 피칭 덱",
  );
}
