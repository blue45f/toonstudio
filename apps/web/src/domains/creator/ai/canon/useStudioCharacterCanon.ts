// 캐릭터 캐논 라이브러리의 React 바인딩.
// 게스트는 이 브라우저의 로컬 저장소에만 쓰고, 로그인 상태에서는 서버에 write-through 한다.
// 저장·갤러리 같은 실제 동작은 studio-character-canon.ts의 순수 함수에 두고
// 이 훅은 브라우저 저장소 연결과 로그인 감지만 맡는다.
//
// 저장 매체 (2026-10-06 IndexedDB 이전):
//  · 정본은 IndexedDB(shared/lib/idb-kv)다. 캐논 문서는 레퍼런스 이미지(data URL)를
//    품은 성장형 문서라 localStorage 5MB 한도에 닿으면 저장이 조용히 실패해 시트가
//    사라질 수 있었다.
//  · 첫 하이드레이션에서 구 localStorage 값을 검증 후 이관한다(migrateLocalStorage
//    ValueToIdb — 이관이 확인되기 전에는 구 값을 절대 지우지 않는다).
//  · IndexedDB를 못 쓰는 환경에서는 localStorage가 폴백 정본으로 남는다.
//  · 하이드레이션이 비동기라, 끝나기 전에는 어떤 저장·서버 동기화도 하지 않는다
//    (빈 초기 문서가 저장본을 덮는 사고 방지). 그 전에 생긴 사용자 편집은
//    하이드레이션 결과와 병합해 양쪽 데이터를 모두 보존한다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApp } from "@/shared/lib/store";
import {
  idbKvGet,
  idbKvSet,
  migrateLocalStorageValueToIdb,
} from "@/shared/lib/idb-kv";

import {
  buildCharacterCanonSheet,
  canonPanelUsageForCharacter,
  characterCanonSheetById,
  emptyCharacterCanonDocument,
  loadCharacterCanonDocument,
  mergeCharacterCanonDocuments,
  parseCharacterCanonDocument,
  recordCanonPanelUsage,
  removeCharacterCanonSheet,
  saveCharacterCanonDocument,
  syncCharacterCanonToServer,
  touchCharacterCanonSheet,
  upsertCharacterCanonSheet,
  validateCanonSheetDraft,
  CHARACTER_CANON_STORAGE_KEY,
  type CanonPanelUsage,
  type CanonSheetDraft,
  type CanonStorage,
  type CharacterCanonDocument,
} from "./studio-character-canon";

function browserCanonStorage(): CanonStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** AI 코믹 디렉터 세션 문서에서 패널 썸네일을 찾아온다(갤러리용). */
export function loadCanonPanelThumbnail(
  storage: Pick<CanonStorage, "getItem">,
  sessionId: string,
  panelIndex: number,
): string | null {
  if (!sessionId) return null;
  try {
    const raw = storage.getItem(
      `toonspectrum:studio-ai-comic-director:${sessionId}`,
    );
    if (!raw) return null;
    const document = JSON.parse(raw) as {
      readonly scenes?: readonly { readonly imageDataUrl?: unknown }[];
    };
    const scene = document.scenes?.[panelIndex];
    return typeof scene?.imageDataUrl === "string" && scene.imageDataUrl
      ? scene.imageDataUrl
      : null;
  } catch {
    return null;
  }
}

export function useStudioCharacterCanon() {
  const userId = useApp((state) => state.userId);
  const [document, setDocument] = useState<CharacterCanonDocument>(() =>
    emptyCharacterCanonDocument(),
  );
  const [hydrated, setHydrated] = useState(false);
  // setState 업데이터는 늦게 실행될 수 있어서, 저장 결과를 동기적으로 만들려면
  // 최신 문서를 ref로 함께 추적한다.
  const documentRef = useRef(document);
  const hydratedRef = useRef(false);
  // 하이드레이션이 끝나기 전에 사용자 편집이 생겼는지 — 생겼으면 하이드레이션
  // 결과를 그대로 덮지 않고 병합해야 양쪽 데이터가 산다.
  const mutatedBeforeHydrationRef = useRef(false);

  const applyDocument = useCallback((next: CharacterCanonDocument) => {
    if (!hydratedRef.current) mutatedBeforeHydrationRef.current = true;
    documentRef.current = next;
    setDocument(next);
  }, []);

  // 첫 마운트에서 한 번만: 구 localStorage 값 이관 → IndexedDB에서 로드.
  // IndexedDB에 값이 없거나 못 쓰는 환경이면 localStorage 폴백을 읽는다.
  useEffect(() => {
    let active = true;
    void (async () => {
      await migrateLocalStorageValueToIdb(CHARACTER_CANON_STORAGE_KEY);
      const raw = await idbKvGet(CHARACTER_CANON_STORAGE_KEY);
      const loaded =
        raw !== null
          ? parseCharacterCanonDocument(raw)
          : loadCharacterCanonDocument(browserCanonStorage());
      if (!active) return;
      const next = mutatedBeforeHydrationRef.current
        ? mergeCharacterCanonDocuments(loaded, documentRef.current)
        : loaded;
      documentRef.current = next;
      setDocument(next);
      hydratedRef.current = true;
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // 문서가 바뀔 때마다 로컬에 저장하고, 로그인 상태면 서버에도 밀어 넣는다.
  // 하이드레이션 전에는 빈 초기 문서가 저장본·서버를 덮지 않도록 아무것도 하지 않는다.
  useEffect(() => {
    documentRef.current = document;
    if (!hydratedRef.current) return;
    void (async () => {
      const written = await idbKvSet(
        CHARACTER_CANON_STORAGE_KEY,
        JSON.stringify(document),
      );
      const storage = browserCanonStorage();
      if (written) {
        // 정본은 IndexedDB다. 낡은 localStorage 사본이 남아 있으면 지운다.
        try {
          storage.removeItem?.(CHARACTER_CANON_STORAGE_KEY);
        } catch {
          /* 정리 실패는 무시한다 — IDB 값이 우선한다. */
        }
      } else {
        // IndexedDB를 못 쓰는 환경에서는 localStorage가 정본 역할을 한다.
        saveCharacterCanonDocument(storage, document);
      }
    })();
    syncCharacterCanonToServer(document, userId);
  }, [document, userId]);

  const saveSheet = useCallback(
    (draft: CanonSheetDraft, editingId?: string | null) => {
      const errors = validateCanonSheetDraft(draft);
      if (errors.length > 0) return { ok: false as const, errors };
      const current = documentRef.current;
      const existing = editingId
        ? characterCanonSheetById(current, editingId)
        : null;
      const saved = existing
        ? touchCharacterCanonSheet(existing, draft)
        : buildCharacterCanonSheet(draft);
      applyDocument(upsertCharacterCanonSheet(current, saved));
      return { ok: true as const, sheet: saved };
    },
    [applyDocument],
  );

  const deleteSheet = useCallback(
    (sheetId: string) => {
      applyDocument(removeCharacterCanonSheet(documentRef.current, sheetId));
    },
    [applyDocument],
  );

  const recordUsage = useCallback(
    (
      record: Omit<CanonPanelUsage, "id" | "injectedAt"> & {
        readonly injectedAt?: string;
      },
    ) => {
      applyDocument(
        recordCanonPanelUsage(documentRef.current, {
          ...record,
          injectedAt: record.injectedAt ?? new Date().toISOString(),
        }),
      );
    },
    [applyDocument],
  );

  const usageForCharacter = useCallback(
    (characterId: string) => canonPanelUsageForCharacter(document, characterId),
    [document],
  );

  const sheets = useMemo(() => document.sheets, [document]);
  const usageCount = document.usage.length;

  return {
    sheets,
    usageCount,
    /** IndexedDB 하이드레이션이 끝났는지 — 끝나기 전에는 빈 목록과 "불러오는 중"을 구분해야 한다. */
    hydrated,
    isGuest: userId === null,
    saveSheet,
    deleteSheet,
    recordUsage,
    usageForCharacter,
    sheetById: useCallback(
      (sheetId: string) => characterCanonSheetById(document, sheetId),
      [document],
    ),
    /** 테스트·외부 동기화용 이스케이프 해치. */
    replaceDocument: applyDocument,
    empty: emptyCharacterCanonDocument(),
  };
}
