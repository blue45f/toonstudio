/**
 * 채색 패널의 프롬프트 라이브러리 상태.
 *
 * 목록 연산은 studio-ai-prompt-library.ts 의 순수 함수가 맡고, 저장은 Studio 로컬 DB
 * (studio-ai-prompt-library-storage.ts)가 맡는다. DB 에서 불러오기 전에 한 편집은 불러온 목록 위에
 * 다시 적용하고, 불러온 뒤에만 저장한다. DB 를 열지 못하면 화면 안에서만 유지하고 다른 저장소로
 * 대신 쓰지 않는다. 저장은 저장소 안에서 순서대로 처리되어 앞선 편집이 나중 편집을 덮지 않는다.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { StudioAiPromptLibraryEntry } from "./studio-ai-prompt-library";
import {
  acquireStudioAiPromptLibraryRepository,
  type StudioAiPromptLibraryRepository,
} from "./studio-ai-prompt-library-storage";

type Entries = readonly StudioAiPromptLibraryEntry[];
/** now 는 편집 이벤트 시각이다. 불러오기 전 편집을 다시 적용해도 같은 시각을 쓴다. */
export type StudioAiPromptLibraryTransform = (entries: Entries, now: number) => Entries;
export type StudioAiPromptLibraryPersistenceState = "loading" | "ready" | "saving" | "error";

type BoundTransform = (entries: Entries) => Entries;
type State = {
  readonly entries: Entries;
  readonly pending: readonly BoundTransform[];
  readonly loaded: boolean;
  readonly revision: number;
};
type Action =
  | { readonly type: "load"; readonly entries: Entries }
  | { readonly type: "apply"; readonly transform: BoundTransform };

const INITIAL_STATE: State = { entries: Object.freeze([]), pending: [], loaded: false, revision: 0 };

function reduceLibrary(state: State, action: Action): State {
  if (action.type === "load") {
    return {
      ...state,
      entries: state.pending.reduce<Entries>((entries, transform) => transform(entries), action.entries),
      pending: [],
      loaded: true,
    };
  }
  return {
    ...state,
    entries: action.transform(state.entries),
    pending: state.loaded ? state.pending : [...state.pending, action.transform],
    revision: state.revision + 1,
  };
}

/**
 * acquireRepository 는 첫 렌더의 값만 쓴다(시험에서 메모리 저장소를 넣는 자리).
 */
export function useStudioAiPromptLibrary(
  acquireRepository: () => Promise<StudioAiPromptLibraryRepository> = acquireStudioAiPromptLibraryRepository,
) {
  const [state, dispatch] = useReducer(reduceLibrary, INITIAL_STATE);
  const [persistenceState, setPersistenceState] = useState<StudioAiPromptLibraryPersistenceState>("loading");
  const repositoryRef = useRef<Promise<StudioAiPromptLibraryRepository> | null>(null);
  const acquireRef = useRef(acquireRepository);

  useEffect(() => {
    let active = true;
    const repository = acquireRef.current();
    repositoryRef.current = repository;
    void repository
      .then((opened) => opened.load())
      .then((entries) => {
        if (!active) return;
        dispatch({ type: "load", entries });
        setPersistenceState("ready");
      })
      .catch(() => {
        if (active) setPersistenceState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const repository = repositoryRef.current;
    if (!state.loaded || state.revision === 0 || !repository) return;
    let active = true;
    setPersistenceState("saving");
    void repository
      .then((opened) => opened.save(state.entries))
      .then(() => {
        if (active) setPersistenceState("ready");
      })
      .catch(() => {
        if (active) setPersistenceState("error");
      });
    return () => {
      active = false;
    };
  }, [state.loaded, state.entries, state.revision]);

  const apply = useCallback((transform: StudioAiPromptLibraryTransform) => {
    const now = Date.now();
    dispatch({ type: "apply", transform: (entries) => transform(entries, now) });
  }, []);

  return { entries: state.entries, apply, persistenceState };
}
