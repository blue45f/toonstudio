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
 */

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
  return {
    spec: preset.spec,
    presetId: preset.id,
    cropMarks: state.cropMarks,
    dpi: state.dpi,
  };
}

/** 적용 중인 단행본 조판의 한 줄 요약 — 상태 표시에 쓴다. */
export function describeBookLayoutSpec(state: StudioBookLayoutSpecState): string {
  const preset = findBookTrimPreset(state.presetId) ?? BOOK_TRIM_PRESETS[0];
  const parts = [preset.label, describeBookTrimSpec(preset.spec)];
  if (state.cropMarks) parts.push("재단 마크");
  parts.push(`${state.dpi}dpi`);
  return parts.join(" · ");
}
