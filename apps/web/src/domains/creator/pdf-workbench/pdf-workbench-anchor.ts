/**
 * PDF 페이지 앵커 — 워크벤치 페이지에 댓글을 붙이기 위한 연결 지점 (cat7 T3).
 *
 * 현재 상태 (2026-10-08, 저장 통합 완료): 1차에서는 모델·식별자만 두고 저장 통합을
 * 미뤘다 — 기존 댓글 앵커 union(page/frame/element/point)이 모두 스튜디오 문서의
 * `pageId`를 키로 삼아, 스튜디오 문서가 아닌 가져온 PDF가 들어갈 자리가 없었기
 * 때문이다. 2차에서 아래 계약 변경을 모두 수행했다.
 *
 * 1. `StudioCommentAnchorSchema`에 pdf-page variant 추가 —
 *    `{ type: "pdf-page", documentId, sourcePageIndex, x?, y? }` (이 파일의
 *    `PdfPageCommentAnchor`와 같은 모양. x·y는 0..1 정규화 좌표).
 * 2. `canonicalStudioCommentAnchorKey`에 pdf-page 분기 추가 —
 *    이 파일에 있던 키 형식을 그대로 이식했고, `canonicalPdfPageAnchorKey`는
 *    이제 그 함수로 위임해 두 키 공간이 어긋날 수 없다.
 * 3. 댓글 문서 스코프 확장 — `pdf-workbench-comments.ts`가 워크벤치 문서를 담는
 *    스코프 id 네임스페이스(`pdf:<documentId>`)와, 그 스코프로 댓글 문서를 여는
 *    저장 어댑터를 제공한다. 스튜디오 문서 댓글과 저장 슬롯이 분리돼 스코프가
 *    깨진 댓글이 생기지 않는다. 스레드 UI(`StudioCommentsPanel`) 재사용 여부는
 *    아직 판정하지 않았다 — 저장 계약만 먼저 고정했다.
 *
 * 식별자 설계 원칙:
 * - `documentId`는 파일 내용 지문(SHA-256)이다. 파일 이름은 바뀌어도 내용이 같으면
 *   같은 문서로 본다. 지문 계산은 엔진(pdf-workbench-engine)이 맡는다.
 * - `sourcePageIndex`는 **원본 문서 기준** 0-based 번호다. 워크벤치에서 페이지를
 *   재배열·삭제해도 앵커가 따라 움직이지 않아야 댓글이 엉뚱한 페이지에 붙지 않는다.
 * - 워크벤치 결합 순서가 필요한 화면(예: "현재 3번째 페이지의 댓글")은 이 앵커를
 *   현재 상태의 페이지 항목과 대조해 역으로 찾는다 — 앵커 자체에 순서를 넣지 않는다.
 */

import { canonicalStudioCommentAnchorKey } from "../studio-comments";
import type { PdfWorkbenchPageEntry } from "./pdf-workbench-model";

/** PDF 한 페이지(원본 기준)를 가리키는 댓글 앵커. 좌표는 선택 — 없으면 페이지 전체 앵커. */
export interface PdfPageCommentAnchor {
  readonly type: "pdf-page";
  /** 원본 파일 내용 지문 (SHA-256 hex). */
  readonly documentId: string;
  /** 원본 문서 기준 0-based 페이지 번호 — 재배열에 불변. */
  readonly sourcePageIndex: number;
  /** 0..1 정규화 가로 위치 (페이지 핀일 때만). */
  readonly x?: number;
  /** 0..1 정규화 세로 위치 (페이지 핀일 때만). */
  readonly y?: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 페이지 항목 + 문서 지문으로 앵커를 만든다. 좌표는 0..1로 clamp해 정규화한다. */
export function createPdfPageAnchor(input: {
  readonly documentId: string;
  readonly sourcePageIndex: number;
  readonly x?: number;
  readonly y?: number;
}): PdfPageCommentAnchor {
  const anchor: PdfPageCommentAnchor = {
    type: "pdf-page",
    documentId: input.documentId,
    sourcePageIndex: Math.max(0, Math.trunc(input.sourcePageIndex)),
    ...(input.x === undefined ? {} : { x: clampUnit(input.x) }),
    ...(input.y === undefined ? {} : { y: clampUnit(input.y) }),
  };
  return anchor;
}

/** 워크벤치 페이지 항목에서 그 페이지의 문서 앵커를 만든다 (지문 맵 필요). */
export function pdfPageAnchorForEntry(
  entry: PdfWorkbenchPageEntry,
  documentIdBySourceId: ReadonlyMap<string, string>,
): PdfPageCommentAnchor | null {
  const documentId = documentIdBySourceId.get(entry.sourceId);
  if (!documentId) return null;
  return createPdfPageAnchor({ documentId, sourcePageIndex: entry.sourcePageIndex });
}

/**
 * 앵커의 정규 식별 키 — 같은 페이지의 앵커는 재배열·세션과 무관하게 같은 키를 갖는다.
 * 저장 통합(2026-10-08) 이후 키의 정본은 `canonicalStudioCommentAnchorKey`의 pdf-page
 * 분기다. 이 함수는 그 함수로 위임해 두 키 공간이 영원히 바이트 단위로 같게 유지한다.
 */
export function canonicalPdfPageAnchorKey(anchor: PdfPageCommentAnchor): string {
  return canonicalStudioCommentAnchorKey(anchor);
}
