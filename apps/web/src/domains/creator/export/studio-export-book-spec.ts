/**
 * Studio 단행본 조판 스펙 옵션 상태 — 내보내기 메뉴의 "단행본 조판 (인쇄용 PDF)" 선택지.
 *
 * 인쇄 스펙(studio-export-print-spec)과 같은 이유로 모듈 스코프 초안을 둔다: 내보내기
 * 패널은 메뉴가 닫힐 때마다 언마운트되므로, 컴포넌트 상태만으로는 작가가 골라 둔 판형이
 * 닫았다 열면 조용히 사라진다. 이 모듈은 판형 선택 UI 상태를 소유하고, 단행본 빌더
 * (studio-book-pdf-export)가 받는 요청 형태로 해석(resolve)하는 순수 함수를 제공한다.
 *
 * 인쇄 스펙과의 관계: 둘 다 켜져 있으면 단행본 조판이 우선한다(렌더러가 동시 지정을
 * throw로 막으므로, 패널은 book 요청이 있으면 print 키를 보내지 않는다).
 *
 * 책 구성(여백 안에 맞춤·쪽 번호·표지)은 선택 필드다. 모두 생략하면 기존 풀블리드 단행본 동작과
 * 요청 모양이 그대로다. "A5 세로 제본 책" 프리셋은 이 필드들을 한 번에 맞춘다.
 */

import {
  DEFAULT_BOOK_FOLIO,
  findBookBindingPreset,
  type BookBindingLayout,
  type BookPagePlacement,
} from "./studio-book-binding";
import {
  BOOK_TRIM_PRESETS,
  describeBookTrimSpec,
  findBookTrimPreset,
} from "./studio-book-layout-model";

import type { BookPrintRequest } from "./studio-book-pdf-export";

/** 단행본 조판 UI 상태 — 빌더 요청에 적용 여부(enabled)를 더한 형태다. */
export interface StudioBookLayoutSpecState {
  /** 켜면 PDF 내보내기가 단행본 빌더를 탄다. 끄면 기존 경로와 완전히 같다. */
  readonly enabled: boolean;
  /** 판형 프리셋 id (BOOK_TRIM_PRESETS). */
  readonly presetId: string;
  /** 재단 마크 렌더링 여부. */
  readonly cropMarks: boolean;
  /** 렌더 해상도(dpi) — 페이지 캔버스를 만들 때의 목표 해상도 안내·검증에 쓴다. */
  readonly dpi: number;
  /** 책 구성 — 페이지 이미지를 도련까지 채울지(기본) 안전 영역(여백) 안에 비율을 지켜 맞출지. */
  readonly placement?: BookPagePlacement;
  /** 본문 쪽마다 쪽 번호를 찍는다(표지 제외). */
  readonly folio?: boolean;
  /** 맨 앞에 글자 표지(작품 제목 + 지은이)를 붙인다. */
  readonly cover?: boolean;
  /** 표지에 적을 지은이. 비우면 지은이 줄이 없다. */
  readonly coverAuthor?: string;
}

/** 기본 상태 — 적용 안 함, 첫 프리셋(신국판), 재단 마크 켬, 300dpi. */
export const DEFAULT_STUDIO_BOOK_LAYOUT_SPEC: StudioBookLayoutSpecState = {
  enabled: false,
  presetId: BOOK_TRIM_PRESETS[0].id,
  cropMarks: true,
  dpi: 300,
};

let draft: StudioBookLayoutSpecState | null = null;

export function readStudioBookLayoutSpecDraft(): StudioBookLayoutSpecState | null {
  return draft;
}

export function writeStudioBookLayoutSpecDraft(next: StudioBookLayoutSpecState): void {
  draft = next;
}

/** Test-only reset so one case's book spec cannot leak into the next. */
export function resetStudioBookLayoutSpecDraft(): void {
  draft = null;
}

/** 책 구성 필드 → 빌더의 binding. 하나도 켜지 않았으면 undefined(요청에 binding 키를 싣지 않는다). */
export function resolveBookBindingLayout(state: StudioBookLayoutSpecState): BookBindingLayout | undefined {
  const author = (state.coverAuthor ?? "").trim();
  const placement = state.placement === "inside-safe" ? ("inside-safe" as const) : undefined;
  const folio = state.folio ? DEFAULT_BOOK_FOLIO : undefined;
  const cover = state.cover ? (author ? { author } : {}) : undefined;
  if (!placement && !folio && !cover) return undefined;
  return {
    ...(placement ? { placement } : {}),
    ...(folio ? { folio } : {}),
    ...(cover ? { cover } : {}),
  };
}

/** 프리셋이 정한 책 구성을 현재 상태에 적용한다(켜기 + 판형 + 마크 + 해상도 + 구성). 모르는 id면 그대로. */
export function applyBookBindingPreset(
  state: StudioBookLayoutSpecState,
  presetId: string
): StudioBookLayoutSpecState {
  const preset = findBookBindingPreset(presetId);
  if (!preset) return state;
  return {
    ...state,
    enabled: true,
    presetId: preset.trimPresetId,
    cropMarks: preset.cropMarks,
    dpi: preset.dpi,
    placement: preset.placement,
    folio: preset.folio,
    cover: preset.cover,
  };
}

/** 지금 상태가 프리셋과 같은 구성인지(작가가 한 항목만 바꿨는지 구분해 눌림 표시에 쓴다). 지은이는 비교하지 않는다. */
export function matchesBookBindingPreset(state: StudioBookLayoutSpecState, presetId: string): boolean {
  const preset = findBookBindingPreset(presetId);
  if (!preset || !state.enabled) return false;
  return (
    state.presetId === preset.trimPresetId &&
    state.cropMarks === preset.cropMarks &&
    state.dpi === preset.dpi &&
    (state.placement ?? "full-bleed") === preset.placement &&
    Boolean(state.folio) === preset.folio &&
    Boolean(state.cover) === preset.cover
  );
}

/**
 * UI 상태 → 단행본 빌더 요청. 비활성이면 undefined — 호출자는 book 키 자체를 생략해야
 * 하고, 그래야 렌더러가 기존 경로(기본/인쇄 스펙)를 그대로 탄다. 모르는 프리셋 id는
 * 첫 프리셋으로 폴백한다(초안이 구버전 프리셋을 들고 있어도 내보내기가 죽지 않게).
 */
export function resolveBookPrintRequest(
  state: StudioBookLayoutSpecState
): BookPrintRequest | undefined {
  if (!state.enabled) return undefined;
  const preset = findBookTrimPreset(state.presetId) ?? BOOK_TRIM_PRESETS[0];
  const binding = resolveBookBindingLayout(state);
  return {
    spec: preset.spec,
    presetId: preset.id,
    cropMarks: state.cropMarks,
    dpi: state.dpi,
    ...(binding ? { binding } : {}),
  };
}

/** 적용 중인 단행본 조판의 한 줄 요약 — 상태 표시에 쓴다. */
export function describeBookLayoutSpec(state: StudioBookLayoutSpecState): string {
  const preset = findBookTrimPreset(state.presetId) ?? BOOK_TRIM_PRESETS[0];
  const parts = [preset.label, describeBookTrimSpec(preset.spec)];
  if (state.cropMarks) parts.push("재단 마크");
  parts.push(`${state.dpi}dpi`);
  if (state.placement === "inside-safe") parts.push("여백 안에 맞춤");
  if (state.folio) parts.push("쪽 번호");
  if (state.cover) parts.push("표지");
  return parts.join(" · ");
}
