/**
 * 캐릭터 캐논 IndexedDB 이관 테스트 —
 * 구 localStorage 캐논 문서(이미지 data URL 포함)가 첫 하이드레이션에서
 * 손실 없이 IDB로 이관되는지, 이후 저장이 IDB에만 남는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet, idbKvSet } from "@/shared/lib/idb-kv";

import {
  buildCharacterCanonSheet,
  CHARACTER_CANON_STORAGE_KEY,
  type CanonSheetDraft,
  type CharacterCanonDocument,
} from "./studio-character-canon";
import { useStudioCharacterCanon } from "./useStudioCharacterCanon";

const LEGACY_DOCUMENT: CharacterCanonDocument = {
  version: 1,
  sheets: [
    buildCharacterCanonSheet(
      {
        name: "하린",
        appearance: "짧은 은발, 초록 눈",
        outfit: "검은 후드와 청바지",
        tags: ["무표정"],
        referenceImage: "data:image/png;base64,iVBORw0KGgo=",
        referenceSource: "upload",
        referenceLabel: "업로드",
      },
      { id: "sheet-legacy", now: "2026-09-15T00:00:00.000Z" },
    ),
  ],
  usage: [],
};

const NEW_DRAFT: CanonSheetDraft = {
  name: "유진",
  appearance: "긴 흑발, 회색 눈",
  outfit: "남색 교복 재킷",
  tags: [],
  referenceImage: null,
  referenceSource: null,
  referenceLabel: null,
};

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("캐논 IDB 이관", () => {
  it("구 localStorage 문서가 하이드레이션으로 보존되고 구 키가 제거된다", async () => {
    localStorage.setItem(
      CHARACTER_CANON_STORAGE_KEY,
      JSON.stringify(LEGACY_DOCUMENT),
    );

    const { result } = renderHook(() => useStudioCharacterCanon());
    // 하이드레이션 전에는 빈 목록과 구분되어야 한다.
    expect(result.current.hydrated).toBe(false);

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.sheets.map((sheet) => sheet.id)).toEqual([
      "sheet-legacy",
    ]);
    expect(result.current.sheets[0]?.referenceImage).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );

    // 구 키는 이관 검증이 끝난 뒤에만 제거되고, 정본은 IDB에 남는다.
    expect(localStorage.getItem(CHARACTER_CANON_STORAGE_KEY)).toBeNull();
    await expect(idbKvGet(CHARACTER_CANON_STORAGE_KEY)).resolves.toBe(
      JSON.stringify(LEGACY_DOCUMENT),
    );
  });

  it("IDB 문서가 있으면 그쪽이 우선하고 낡은 localStorage 사본은 제거된다", async () => {
    await idbKvSet(
      CHARACTER_CANON_STORAGE_KEY,
      JSON.stringify(LEGACY_DOCUMENT),
    );
    localStorage.setItem(
      CHARACTER_CANON_STORAGE_KEY,
      JSON.stringify({ version: 1, sheets: [], usage: [] }),
    );

    const { result } = renderHook(() => useStudioCharacterCanon());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.sheets).toHaveLength(1);
    expect(localStorage.getItem(CHARACTER_CANON_STORAGE_KEY)).toBeNull();
  });

  it("저장은 IDB에만 남고 localStorage에는 키가 생기지 않는다", async () => {
    const { result } = renderHook(() => useStudioCharacterCanon());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      const saved = result.current.saveSheet(NEW_DRAFT);
      expect(saved.ok).toBe(true);
    });
    expect(result.current.sheets.map((sheet) => sheet.name)).toEqual(["유진"]);

    await waitFor(async () => {
      const raw = await idbKvGet(CHARACTER_CANON_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? "{}").sheets?.[0]?.name).toBe("유진");
    });
    expect(localStorage.getItem(CHARACTER_CANON_STORAGE_KEY)).toBeNull();
  });

  it("하이드레이션 전에 생긴 편집은 이관 문서와 병합돼 둘 다 남는다", async () => {
    localStorage.setItem(
      CHARACTER_CANON_STORAGE_KEY,
      JSON.stringify(LEGACY_DOCUMENT),
    );

    const { result } = renderHook(() => useStudioCharacterCanon());
    // 하이드레이션 완료를 기다리지 않고 즉시 편집한다.
    act(() => {
      result.current.saveSheet(NEW_DRAFT);
    });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await waitFor(() =>
      expect(result.current.sheets.map((sheet) => sheet.name).sort()).toEqual(
        ["유진", "하린"],
      ),
    );
  });
});
