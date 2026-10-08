/**
 * PDF 워크벤치 댓글 스코프·저장 어댑터 (cat7 T3 2차 — 댓글 저장 통합, 2026-10-08).
 *
 * 스코프 설계:
 * - 워크벤치 문서는 스튜디오 작품이 아니므로 댓글 문서를 작품 id로 열 수 없다. 대신
 *   원본 파일 내용 지문(SHA-256)을 문서 id로 삼아 `pdf:<documentId>` 스코프를 만든다.
 *   파일 이름이 바뀌어도 내용이 같으면 같은 스코프 — 앵커의 `documentId`와 같은 값이다.
 * - 워크벤치 소스 id가 곧 지문이므로(PdfWorkbenchPage), 소스 id가 그대로 documentId다.
 * - 스코프가 다르면 저장 슬롯도 다르다. 스튜디오 문서의 댓글과 섞일 자리가 없고,
 *   서로 다른 PDF의 댓글도 지문이 달라 격리된다.
 *
 * 저장 계약:
 * - 값은 스튜디오 댓글과 같은 `StudioCommentsDocument` 직렬화 형식이다. 읽을 때
 *   `normalizeStudioCommentsDocument`로 정규화하므로, 손상된 값은 빈 문서가 되고
 *   pdf-page 앵커 스레드는 정규화를 통과해 그대로 재조회된다.
 * - 워크벤치는 이 기기 안에서만 동작하므로 저장소도 로컬이다. 저장소가 없거나
 *   (서버 렌더·차단 환경) 쓰기가 실패하면 예외를 던지지 않는다 — 읽기는 빈 문서,
 *   쓰기는 이번 저장만 포기한다 (studio-beta-notice-storage와 같은 계약).
 */

import {
  createEmptyStudioCommentsDocument,
  normalizeStudioCommentsDocument,
  serializeStudioCommentsDocument,
  type StudioCommentsDocument,
} from "../studio-comments";

/** 워크벤치 댓글 스코프 접두사 — 다른 문서 스코프와 섞이지 않는 네임스페이스. */
export const PDF_WORKBENCH_COMMENT_SCOPE_PREFIX = "pdf:";

/** 로컬 저장 키 접두사. 실제 키는 `${접두사}${스코프 id}` 형태다. */
export const PDF_WORKBENCH_COMMENTS_STORAGE_KEY_PREFIX = "toonstudio-pdf-workbench-comments:";

/** 파일 지문으로 워크벤치 댓글 스코프 id를 만든다. */
export function pdfWorkbenchCommentScopeId(documentId: string): string {
  return `${PDF_WORKBENCH_COMMENT_SCOPE_PREFIX}${documentId}`;
}

/** 스코프 id에서 파일 지문을 되뽑는다. 워크벤치 스코프가 아니면 null이다. */
export function parsePdfWorkbenchCommentScopeId(scopeId: string): string | null {
  if (!scopeId.startsWith(PDF_WORKBENCH_COMMENT_SCOPE_PREFIX)) return null;
  const documentId = scopeId.slice(PDF_WORKBENCH_COMMENT_SCOPE_PREFIX.length);
  return documentId ? documentId : null;
}

/** 문서 지문에 대한 로컬 저장 키. */
export function pdfWorkbenchCommentsStorageKey(documentId: string): string {
  return `${PDF_WORKBENCH_COMMENTS_STORAGE_KEY_PREFIX}${pdfWorkbenchCommentScopeId(documentId)}`;
}

/** 어댑터가 요구하는 최소 키-값 저장소 (localStorage와 구조가 같다). */
export interface PdfWorkbenchCommentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 워크벤치 문서 하나의 댓글을 열고 저장하는 어댑터. */
export interface PdfWorkbenchCommentStore {
  /** 저장된 댓글 문서를 정규화해 돌려준다. 없거나 손상됐으면 빈 문서다. */
  load(documentId: string): StudioCommentsDocument;
  /** 댓글 문서를 정규화·직렬화해 저장한다. 실패해도 던지지 않는다. */
  save(documentId: string, document: StudioCommentsDocument): void;
  /** 그 문서의 댓글 저장 슬롯을 비운다. */
  clear(documentId: string): void;
}

function browserLocalStorage(): PdfWorkbenchCommentStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 저장소를 주입받는 댓글 어댑터를 만든다. 기본값은 브라우저 localStorage이고,
 * 테스트·비브라우저 환경에서는 맵 기반 저장소를 넣어 같은 계약을 검증한다.
 */
export function createPdfWorkbenchCommentStore(
  getStorage: () => PdfWorkbenchCommentStorage | null = browserLocalStorage,
): PdfWorkbenchCommentStore {
  return {
    load(documentId) {
      try {
        const raw = getStorage()?.getItem(pdfWorkbenchCommentsStorageKey(documentId));
        return raw ? normalizeStudioCommentsDocument(raw) : createEmptyStudioCommentsDocument();
      } catch {
        return createEmptyStudioCommentsDocument();
      }
    },
    save(documentId, document) {
      try {
        getStorage()?.setItem(
          pdfWorkbenchCommentsStorageKey(documentId),
          serializeStudioCommentsDocument(document),
        );
      } catch {
        // 저장소가 차단됐거나 가득 찬 경우 — 댓글 작성 자체는 계속되고 이번 저장만 잃는다.
      }
    },
    clear(documentId) {
      try {
        getStorage()?.removeItem(pdfWorkbenchCommentsStorageKey(documentId));
      } catch {
        // 저장소가 없으면 비울 것도 없다.
      }
    },
  };
}
