/**
 * 투고 패키지 — 화면 초안 상태(순수 리듀서).
 *
 * 작품 소개 글, 회차 목록(번호·제목·메모·고른 이미지), 점검 기준, 캐릭터 선택을 한 곳에서 다룬다. 상태 갱신은 전부
 * 이 순수 함수라 파일 읽기 같은 비동기 부수 효과와 분리해 시험할 수 있다. 이미지 Blob 은 메모리 상태에만 있고
 * 저장되지 않는다(`submission-package-draft-store` 가 글만 저장한다).
 */
import { orderSubmissionDocuments, type SubmissionDocumentSeed } from "./submission-package-document-order";
import {
  EMPTY_SUBMISSION_DRAFT_TEXT,
  type SubmissionCoverLocaleChoice,
  type SubmissionDraftText,
} from "./submission-package-draft-store";
import { SUBMISSION_PACKAGE_MIN_EPISODES, type SubmissionPageFile, type SubmissionTargetWidthId } from "./submission-package-types";

/** 이 회차와 이어진 스튜디오 문서의 기록(표시용). 규격 점검에는 쓰지 않는다 — 점검은 고른 이미지의 실제 크기로 한다. */
export interface SubmissionEpisodeDocumentInfo {
  readonly id: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly pageCount: number;
}

export interface SubmissionEpisodeState {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly note: string;
  readonly pages: readonly SubmissionPageFile[];
  /** 지금 읽는 중인 파일 수. 0 이면 읽기가 끝난 것이다. */
  readonly reading: number;
  readonly document: SubmissionEpisodeDocumentInfo | null;
}

export interface SubmissionDraftState {
  readonly title: string;
  readonly authorName: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly targetWidth: SubmissionTargetWidthId;
  readonly includeCoverPdf: boolean;
  readonly coverLocale: SubmissionCoverLocaleChoice;
  readonly episodes: readonly SubmissionEpisodeState[];
  readonly characterOverrides: Readonly<Record<string, boolean>>;
}

export type SubmissionDraftField = "title" | "authorName" | "logline" | "synopsis";

export type SubmissionDraftAction =
  | { readonly type: "set-field"; readonly field: SubmissionDraftField; readonly value: string }
  | { readonly type: "set-target"; readonly value: SubmissionTargetWidthId }
  | { readonly type: "set-include-pdf"; readonly value: boolean }
  | { readonly type: "set-cover-locale"; readonly value: SubmissionCoverLocaleChoice }
  | { readonly type: "add-episode"; readonly id: string }
  | { readonly type: "remove-episode"; readonly id: string }
  | { readonly type: "update-episode"; readonly id: string; readonly patch: Partial<Pick<SubmissionEpisodeState, "number" | "title" | "note">> }
  | { readonly type: "reading"; readonly id: string; readonly delta: number }
  | { readonly type: "add-pages"; readonly id: string; readonly pages: readonly SubmissionPageFile[] }
  | { readonly type: "remove-page"; readonly id: string; readonly pageId: string }
  | { readonly type: "move-page"; readonly id: string; readonly pageId: string; readonly direction: -1 | 1 }
  | { readonly type: "toggle-character"; readonly characterId: string; readonly value: boolean };

export function createEmptyEpisode(id: string, number: number, document: SubmissionEpisodeDocumentInfo | null = null, title = ""): SubmissionEpisodeState {
  return { id, number, title, note: "", pages: [], reading: 0, document };
}

/**
 * 처음 여는 초안: 투고 최소 회차만큼 빈 칸을 미리 둔다.
 * 문서로 칸을 채울 때의 순서와 번호는 `orderSubmissionDocuments` 가 정한다(문서 목록의 '최근에 연 순'을 따르지 않는다).
 */
export function initialSubmissionDraft(options: {
  readonly saved: SubmissionDraftText | null;
  readonly projectTitle: string;
  readonly documents: readonly SubmissionDocumentSeed[];
  readonly idFor: (index: number) => string;
}): SubmissionDraftState {
  const { saved } = options;
  const base: SubmissionDraftText = saved ?? { ...EMPTY_SUBMISSION_DRAFT_TEXT, title: options.projectTitle };
  const savedEpisodes = base.episodes;
  let episodes: SubmissionEpisodeState[];
  if (savedEpisodes.length > 0) {
    episodes = savedEpisodes.map((meta) => ({ ...createEmptyEpisode(meta.id, meta.number, null, meta.title), note: meta.note }));
  } else if (options.documents.length > 0) {
    episodes = orderSubmissionDocuments(options.documents).map(({ document, number }, index) =>
      createEmptyEpisode(
        options.idFor(index),
        number,
        { id: document.id, width: document.width, height: document.height, pageCount: document.pageCount },
        document.title,
      ),
    );
    // 문서가 최소 회차보다 적어도 투고에 필요한 만큼 빈 칸을 이어 둔다(사용자가 '회차 추가'를 찾지 않아도 되게).
    // 번호는 '회차 추가'와 같이 가장 큰 번호 다음부터라서, 제목의 숫자가 건너뛴 번호와도 겹치지 않는다.
    for (let index = episodes.length; index < SUBMISSION_PACKAGE_MIN_EPISODES; index += 1) {
      episodes.push(createEmptyEpisode(options.idFor(index), nextEpisodeNumber(episodes)));
    }
  } else {
    episodes = Array.from({ length: SUBMISSION_PACKAGE_MIN_EPISODES }, (_, index) => createEmptyEpisode(options.idFor(index), index + 1));
  }
  return {
    title: base.title,
    authorName: base.authorName,
    logline: base.logline,
    synopsis: base.synopsis,
    targetWidth: base.targetWidth,
    includeCoverPdf: base.includeCoverPdf,
    coverLocale: base.coverLocale,
    episodes,
    characterOverrides: base.characterOverrides,
  };
}

function mapEpisode(
  state: SubmissionDraftState,
  id: string,
  update: (episode: SubmissionEpisodeState) => SubmissionEpisodeState,
): SubmissionDraftState {
  let changed = false;
  const episodes = state.episodes.map((episode) => {
    if (episode.id !== id) return episode;
    changed = true;
    return update(episode);
  });
  return changed ? { ...state, episodes } : state;
}

function nextEpisodeNumber(episodes: readonly SubmissionEpisodeState[]): number {
  return episodes.reduce((max, episode) => (Number.isSafeInteger(episode.number) ? Math.max(max, episode.number) : max), 0) + 1;
}

export function submissionDraftReducer(state: SubmissionDraftState, action: SubmissionDraftAction): SubmissionDraftState {
  switch (action.type) {
    case "set-field":
      return state[action.field] === action.value ? state : { ...state, [action.field]: action.value };
    case "set-target":
      return { ...state, targetWidth: action.value };
    case "set-include-pdf":
      return { ...state, includeCoverPdf: action.value };
    case "set-cover-locale":
      return { ...state, coverLocale: action.value };
    case "add-episode":
      return state.episodes.some((episode) => episode.id === action.id)
        ? state
        : { ...state, episodes: [...state.episodes, createEmptyEpisode(action.id, nextEpisodeNumber(state.episodes))] };
    case "remove-episode":
      return { ...state, episodes: state.episodes.filter((episode) => episode.id !== action.id) };
    case "update-episode":
      return mapEpisode(state, action.id, (episode) => ({ ...episode, ...action.patch }));
    case "reading":
      return mapEpisode(state, action.id, (episode) => ({ ...episode, reading: Math.max(0, episode.reading + action.delta) }));
    case "add-pages":
      return mapEpisode(state, action.id, (episode) => ({ ...episode, pages: [...episode.pages, ...action.pages] }));
    case "remove-page":
      return mapEpisode(state, action.id, (episode) => ({ ...episode, pages: episode.pages.filter((page) => page.id !== action.pageId) }));
    case "move-page":
      return mapEpisode(state, action.id, (episode) => {
        const from = episode.pages.findIndex((page) => page.id === action.pageId);
        const to = from + action.direction;
        if (from < 0 || to < 0 || to >= episode.pages.length) return episode;
        const pages = [...episode.pages];
        const [moved] = pages.splice(from, 1);
        if (!moved) return episode;
        pages.splice(to, 0, moved);
        return { ...episode, pages };
      });
    case "toggle-character":
      return { ...state, characterOverrides: { ...state.characterOverrides, [action.characterId]: action.value } };
    default:
      return state;
  }
}

/** 저장 대상 글만 뽑는다(이미지·읽기 상태는 제외). */
export function submissionDraftToText(state: SubmissionDraftState): SubmissionDraftText {
  return {
    title: state.title,
    authorName: state.authorName,
    logline: state.logline,
    synopsis: state.synopsis,
    targetWidth: state.targetWidth,
    includeCoverPdf: state.includeCoverPdf,
    coverLocale: state.coverLocale,
    // 입력 도중의 비어 있는 번호(NaN)는 0 으로 남겨 다시 열었을 때도 잘못된 번호로 보이게 한다.
    episodes: state.episodes.map((episode) => ({ id: episode.id, number: Number.isSafeInteger(episode.number) ? episode.number : 0, title: episode.title, note: episode.note })),
    characterOverrides: state.characterOverrides,
  };
}
