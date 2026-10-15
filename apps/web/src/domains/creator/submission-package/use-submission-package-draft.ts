import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { toSubmissionPageFile } from "./submission-image-probe";
import { isAbortError } from "./submission-package-abort";
import {
  initialSubmissionDraft,
  submissionDraftReducer,
  submissionDraftToText,
  type SubmissionDraftAction,
  type SubmissionDraftField,
  type SubmissionDraftState,
  type SubmissionEpisodeState,
} from "./submission-package-draft-state";
import {
  readSubmissionDraftText,
  serializeSubmissionDraftText,
  writeSubmissionDraftText,
  type SubmissionCoverLocaleChoice,
  type SubmissionDraftStorage,
} from "./submission-package-draft-store";
import { submissionPlatformLimits } from "./submission-package-platform";
import { evaluateSubmissionPackage } from "./submission-package-preflight";
import { hasSheetContent } from "./submission-package-story";
import { compareNaturalNames } from "./submission-package-text";
import type {
  SubmissionCharacterSheet,
  SubmissionPackageDraft,
  SubmissionPageFile,
  SubmissionPlatformSizeLimits,
  SubmissionPreflightReport,
  SubmissionTargetWidthId,
} from "./submission-package-types";

/** 한 번에 머리를 읽는 파일 수. 머리만 읽으므로 가볍지만, 수백 장을 한꺼번에 열지는 않는다. */
const PROBE_CONCURRENCY = 4;
const PERSIST_DEBOUNCE_MS = 400;

export interface SubmissionDocumentSeed {
  readonly id: string;
  readonly title: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly pageCount: number;
}

export interface UseSubmissionPackageDraftOptions {
  readonly projectId: string;
  readonly projectTitle: string;
  /** 프로젝트의 웹툰 문서. 저장된 글이 없을 때만 회차 칸의 출발점으로 쓴다. */
  readonly documents: readonly SubmissionDocumentSeed[];
  /** 스토리 바이블에서 투고용으로 옮긴 캐릭터 시트 전체(선택 전). */
  readonly characters: readonly SubmissionCharacterSheet[];
  /** 시험용 저장소 주입. 기본은 `window.localStorage`(접근이 막히면 저장 없이 동작). */
  readonly storage?: SubmissionDraftStorage | null;
}

export type SubmissionDraftPersistence = "saved" | "unavailable";

export interface SubmissionDraftActions {
  readonly setField: (field: SubmissionDraftField, value: string) => void;
  readonly setTarget: (value: SubmissionTargetWidthId) => void;
  readonly setIncludePdf: (value: boolean) => void;
  readonly setCoverLocale: (value: SubmissionCoverLocaleChoice) => void;
  readonly addEpisode: () => void;
  readonly removeEpisode: (episodeId: string) => void;
  readonly updateEpisode: (episodeId: string, patch: Partial<Pick<SubmissionEpisodeState, "number" | "title" | "note">>) => void;
  readonly addFiles: (episodeId: string, files: readonly File[]) => Promise<void>;
  readonly removePage: (episodeId: string, pageId: string) => void;
  readonly movePage: (episodeId: string, pageId: string, direction: -1 | 1) => void;
  readonly toggleCharacter: (characterId: string, value: boolean) => void;
}

export interface SubmissionDraftController {
  readonly state: SubmissionDraftState;
  /** 점검과 만들기에 넘기는 초안(선택한 캐릭터만 담긴다). */
  readonly draft: SubmissionPackageDraft;
  readonly report: SubmissionPreflightReport;
  readonly platform: SubmissionPlatformSizeLimits | null;
  readonly selectedCharacterIds: ReadonlySet<string>;
  readonly persistence: SubmissionDraftPersistence;
  /** 저장된 글에서 복원했는가(이미지는 다시 골라야 한다고 안내하는 데 쓴다). */
  readonly restoredFromSaved: boolean;
  readonly actions: SubmissionDraftActions;
}

let idCounter = 0;

function newId(prefix: string): string {
  idCounter += 1;
  const random = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${idCounter.toString(36)}-${random}`;
}

function defaultStorage(): SubmissionDraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function useSubmissionPackageDraft(options: UseSubmissionPackageDraftOptions): SubmissionDraftController {
  const { projectId, projectTitle, documents, characters } = options;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const storageRef = useRef(storage);
  storageRef.current = storage;

  const [{ initial, restoredFromSaved }] = useState(() => {
    const saved = storage ? readSubmissionDraftText(storage, projectId) : null;
    return {
      restoredFromSaved: saved !== null && saved.episodes.length > 0,
      initial: initialSubmissionDraft({ saved, projectTitle, documents, idFor: () => newId("episode") }),
    };
  });
  const [state, dispatch] = useReducer(submissionDraftReducer, initial);
  const [persistence, setPersistence] = useState<SubmissionDraftPersistence>(storage ? "saved" : "unavailable");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  // 글만 저장한다(이미지 제외). 사용자가 아직 아무것도 바꾸지 않았다면 저장소에 쓰지 않는다.
  const text = submissionDraftToText(state);
  const serialized = serializeSubmissionDraftText(text);
  const textRef = useRef(text);
  textRef.current = text;
  const baselineRef = useRef(serialized);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current && serialized === baselineRef.current) return undefined;
    dirtyRef.current = true;
    const timer = globalThis.setTimeout(() => {
      const target = storageRef.current;
      setPersistence(target && writeSubmissionDraftText(target, projectId, textRef.current) ? "saved" : "unavailable");
    }, PERSIST_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [serialized, projectId]);

  const selectedCharacterIds = useMemo(
    () => new Set(characters.filter((sheet) => state.characterOverrides[sheet.id] ?? hasSheetContent(sheet)).map((sheet) => sheet.id)),
    [characters, state.characterOverrides],
  );

  const draft = useMemo<SubmissionPackageDraft>(
    () => ({
      title: state.title,
      authorName: state.authorName,
      logline: state.logline,
      synopsis: state.synopsis,
      targetWidth: state.targetWidth,
      episodes: state.episodes.map((episode) => ({ id: episode.id, number: episode.number, title: episode.title, note: episode.note, pages: episode.pages })),
      characters: characters.filter((sheet) => selectedCharacterIds.has(sheet.id)),
    }),
    [state, characters, selectedCharacterIds],
  );

  const platform = useMemo(() => submissionPlatformLimits(state.targetWidth), [state.targetWidth]);
  const report = useMemo(() => evaluateSubmissionPackage({ draft, platform }), [draft, platform]);

  const act = useCallback((action: SubmissionDraftAction) => dispatch(action), []);

  const addFiles = useCallback(async (episodeId: string, files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const ordered = [...files].sort((left, right) => compareNaturalNames(left.name, right.name));
    const signal = abortRef.current?.signal;
    dispatch({ type: "reading", id: episodeId, delta: ordered.length });
    try {
      const pages: SubmissionPageFile[] = await mapWithConcurrency(ordered, PROBE_CONCURRENCY, (file) => toSubmissionPageFile(file, { id: newId("page"), signal }));
      dispatch({ type: "add-pages", id: episodeId, pages });
    } catch (error) {
      // 화면을 떠나며 취소된 읽기는 조용히 끝낸다. 그 밖의 읽기 실패는 파일별 failure 로 이미 담겨 여기까지 오지 않는다.
      if (!isAbortError(error)) throw error;
    } finally {
      dispatch({ type: "reading", id: episodeId, delta: -ordered.length });
    }
  }, []);

  const actions = useMemo<SubmissionDraftActions>(
    () => ({
      setField: (field, value) => act({ type: "set-field", field, value }),
      setTarget: (value) => act({ type: "set-target", value }),
      setIncludePdf: (value) => act({ type: "set-include-pdf", value }),
      setCoverLocale: (value) => act({ type: "set-cover-locale", value }),
      addEpisode: () => act({ type: "add-episode", id: newId("episode") }),
      removeEpisode: (episodeId) => act({ type: "remove-episode", id: episodeId }),
      updateEpisode: (episodeId, patch) => act({ type: "update-episode", id: episodeId, patch }),
      addFiles,
      removePage: (episodeId, pageId) => act({ type: "remove-page", id: episodeId, pageId }),
      movePage: (episodeId, pageId, direction) => act({ type: "move-page", id: episodeId, pageId, direction }),
      toggleCharacter: (characterId, value) => act({ type: "toggle-character", characterId, value }),
    }),
    [act, addFiles],
  );

  return { state, draft, report, platform, selectedCharacterIds, persistence, restoredFromSaved, actions };
}
