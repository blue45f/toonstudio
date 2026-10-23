import { describe, expect, it } from "vitest";

import { CHARACTER_LOOK_FILE_SUFFIX, CHARACTER_LOOK_FORMAT, applyCharacterLook, createDefaultRecipe, extractCharacterLook } from "../contracts";

import {
  LOOK_LIBRARY_BACKUP_KEY,
  LOOK_LIBRARY_FORMAT,
  LOOK_LIBRARY_MAX_CHARS,
  LOOK_LIBRARY_MAX_ENTRIES,
  LOOK_LIBRARY_STORAGE_KEY,
  LOOK_THUMBNAIL_MAX_CHARS,
  addLookToLibrary,
  createLookLibrary,
  createLookLibraryStore,
  findLook,
  importLookFileText,
  listLibraryLooks,
  lookApplyCommand,
  lookFileName,
  normalizeLookName,
  parseLookFileText,
  parseLookLibraryText,
  removeLookFromLibrary,
  renameLookInLibrary,
  saveLookToLibrary,
  serializeLookFile,
  serializeLookLibrary,
  setLookThumbnail,
} from "./look-library";

import type { LookLibrary, LookLibraryResult, LookStorageLike } from "./look-library";
import type { CharacterRecipe } from "../contracts";

function styled(): CharacterRecipe {
  const base = createDefaultRecipe();
  return {
    ...base,
    slots: { ...base.slots, top: "top/blazer", eyes: "eyes/wide" },
    face: { eyeSize: 0.4 },
    colors: { ...base.colors, top: "#112233", lip: "#aa3344" },
    hairColor: { gradient: [0.4, 1], tipMix: 0.5, accent: "inner" },
  };
}

function ok(result: LookLibraryResult): Extract<LookLibraryResult, { ok: true }> {
  if (!result.ok) throw new Error(`${result.failure.code}: ${result.failure.reasonKo}`);
  return result;
}

function save(library: LookLibrary, nameKo: string, now = 1_000, scope: "full" | "outfit" | "colors" | "face" | "style" = "outfit"): LookLibrary {
  return ok(saveLookToLibrary(library, { recipe: styled(), scope, nameKo, now })).library;
}

/** Map 기반 가짜 저장소(쓰기 실패를 흉내 낼 수 있다) */
function fakeStorage(fail?: () => unknown): LookStorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (fail) throw fail();
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function domError(name: string, code?: number): Error {
  const error = new Error(name);
  error.name = name;
  if (code !== undefined) Object.assign(error, { code });
  return error;
}

describe("state/look-library: 저장·불러오기", () => {
  it("범위를 골라 저장하면 그 범위의 look/1 문서가 맨 앞에 들어가고, 적용하면 범위 값만 돌아온다", () => {
    const library = save(createLookLibrary(), "  내 교복  ", 5_000, "outfit");
    const [entry] = library.entries;
    expect(entry?.look).toMatchObject({ format: CHARACTER_LOOK_FORMAT, nameKo: "내 교복", scope: "outfit" });
    expect(entry?.look.id).toMatch(/^look-[0-9a-z]+-1$/u);
    expect(entry).toMatchObject({ savedAt: 5_000, updatedAt: 5_000 });
    if (!entry) return;
    const applied = applyCharacterLook(createDefaultRecipe(), entry.look);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.recipe.slots.top).toBe("top/blazer");
    expect(applied.recipe.colors.top).toBe("#112233");
    // 의상 범위 밖(얼굴·입술)은 그대로
    expect(applied.recipe.slots.eyes).toBe(createDefaultRecipe().slots.eyes);
    expect(applied.recipe.colors.lip).toBeUndefined();
    expect(lookApplyCommand(entry.look)).toEqual({ type: "look-preset/apply", look: entry.look });
  });

  it("목록은 최근에 바꾼 순이고 범위로 거를 수 있다. 찾기·지우기", () => {
    let library = save(createLookLibrary(), "하나", 1, "outfit");
    library = save(library, "둘", 3, "colors");
    library = save(library, "셋", 2, "outfit");
    expect(listLibraryLooks(library).map((entry) => entry.look.nameKo)).toEqual(["둘", "셋", "하나"]);
    expect(listLibraryLooks(library, "outfit").map((entry) => entry.look.nameKo)).toEqual(["셋", "하나"]);
    const id = library.entries[0]?.look.id ?? "";
    expect(findLook(library, id)?.look.nameKo).toBe("셋");
    const removed = removeLookFromLibrary(library, id);
    expect(removed.entries).toHaveLength(2);
    expect(removeLookFromLibrary(removed, "없는-id")).toBe(removed);
  });

  it("같은 이름: 기본은 번호를 붙이고, replace는 그 항목을 덮어쓰며(id·처음 저장 시각 유지), reject는 거부한다", () => {
    let library = save(createLookLibrary(), "데이트룩", 10);
    library = save(library, "데이트룩 ", 20);
    expect(library.entries.map((entry) => entry.look.nameKo)).toEqual(["데이트룩 (2)", "데이트룩"]);
    library = save(library, "데이트룩", 30);
    expect(library.entries[0]?.look.nameKo).toBe("데이트룩 (3)");
    const original = library.entries.find((entry) => entry.look.nameKo === "데이트룩");
    const replaced = ok(saveLookToLibrary(library, { recipe: createDefaultRecipe(), scope: "colors", nameKo: "데이트룩", now: 40, onDuplicate: "replace" }));
    expect(replaced.library.entries).toHaveLength(3);
    expect(replaced.entry).toMatchObject({ savedAt: 10, updatedAt: 40, look: { id: original?.look.id, scope: "colors" } });
    const rejected = saveLookToLibrary(library, { recipe: createDefaultRecipe(), scope: "full", nameKo: "데이트룩", now: 50, onDuplicate: "reject" });
    expect(rejected).toMatchObject({ ok: false, failure: { code: "look-name-duplicate" } });
    expect(normalizeLookName("  Date  Look ")).toBe("date look");
  });

  it("이름 검사: 빈 이름·40자 초과는 한글 사유로 거부, 이름 바꾸기도 중복을 거부한다", () => {
    expect(saveLookToLibrary(createLookLibrary(), { recipe: styled(), scope: "full", nameKo: "   ", now: 1 })).toMatchObject({ ok: false, failure: { code: "look-name-invalid" } });
    expect(saveLookToLibrary(createLookLibrary(), { recipe: styled(), scope: "full", nameKo: "가".repeat(41), now: 1 })).toMatchObject({ ok: false, failure: { code: "look-name-invalid" } });
    let library = save(createLookLibrary(), "봄", 1);
    library = save(library, "여름", 2);
    const spring = library.entries.find((entry) => entry.look.nameKo === "봄");
    const renamed = ok(renameLookInLibrary(library, spring?.look.id ?? "", "  초봄 ", 9));
    expect(renamed.entry).toMatchObject({ look: { nameKo: "초봄" }, updatedAt: 9, savedAt: 1 });
    expect(renameLookInLibrary(library, spring?.look.id ?? "", "여름", 9)).toMatchObject({ ok: false, failure: { code: "look-name-duplicate" } });
    expect(renameLookInLibrary(library, "없음", "가을", 9)).toMatchObject({ ok: false, failure: { code: "look-not-found" } });
  });

  it("썸네일 참조: data URL(형식·길이 상한)·캐시 키, null이면 지운다", () => {
    const thumbnail = { kind: "data-url" as const, dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    const library = ok(saveLookToLibrary(createLookLibrary(), { recipe: styled(), scope: "full", nameKo: "썸네일", now: 1, thumbnail })).library;
    const id = library.entries[0]?.look.id ?? "";
    expect(findLook(library, id)?.thumbnail).toEqual(thumbnail);
    const keyed = ok(setLookThumbnail(library, id, { kind: "cache-key", key: "hair/soft-bob|toon|style|0123456789abcdef" }, 2));
    expect(keyed.entry.thumbnail).toMatchObject({ kind: "cache-key" });
    expect(ok(setLookThumbnail(keyed.library, id, null, 3)).entry.thumbnail).toBeUndefined();
    const big = { kind: "data-url" as const, dataUrl: `data:image/png;base64,${"A".repeat(LOOK_THUMBNAIL_MAX_CHARS)}` };
    expect(setLookThumbnail(library, id, big, 4)).toMatchObject({ ok: false, failure: { code: "look-thumbnail-invalid" } });
    expect(setLookThumbnail(library, id, { kind: "data-url", dataUrl: "javascript:alert(1)" }, 4)).toMatchObject({ ok: false, failure: { code: "look-thumbnail-invalid" } });
  });

  it("용량 상한: 항목 수(60)와 직렬화 문자 수를 넘으면 한글 사유로 거부한다", () => {
    let library = createLookLibrary();
    for (let index = 0; index < LOOK_LIBRARY_MAX_ENTRIES; index += 1) library = save(library, `룩 ${index}`, index, "colors");
    expect(library.entries).toHaveLength(LOOK_LIBRARY_MAX_ENTRIES);
    const full = saveLookToLibrary(library, { recipe: styled(), scope: "colors", nameKo: "하나 더", now: 999 });
    expect(full).toMatchObject({ ok: false, failure: { code: "look-library-full" } });
    if (!full.ok) expect(full.failure.reasonKo).toMatch(/최대 60개/u);
    // 큰 썸네일로 문자 수 상한을 넘긴다(썸네일 하나는 상한 안이지만 합계가 넘는다)
    const thumbnail = { kind: "data-url" as const, dataUrl: `data:image/png;base64,${"A".repeat(LOOK_THUMBNAIL_MAX_CHARS - 40)}` };
    let heavy = createLookLibrary();
    let failure: string | null = null;
    for (let index = 0; index < LOOK_LIBRARY_MAX_ENTRIES && failure === null; index += 1) {
      const result = saveLookToLibrary(heavy, { recipe: styled(), scope: "colors", nameKo: `큰 룩 ${index}`, now: index, thumbnail });
      if (result.ok) heavy = result.library;
      else failure = result.failure.code;
    }
    expect(failure).toBe("look-library-too-large");
    expect(serializeLookLibrary(heavy).length).toBeLessThanOrEqual(LOOK_LIBRARY_MAX_CHARS);
  });
});

describe("state/look-library: 직렬화·저장소", () => {
  it("정규 직렬화는 왕복이 같고 스키마(id·이름 유일)를 검사한다", () => {
    let library = save(createLookLibrary(), "왕복", 1);
    library = save(library, "왕복 둘", 2, "style");
    const text = serializeLookLibrary(library);
    const parsed = parseLookLibraryText(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeLookLibrary(parsed.library)).toBe(text);
    const duplicateIds = JSON.parse(text) as { entries: Array<{ look: { id: string } }> };
    const second = duplicateIds.entries[1];
    if (second) second.look.id = duplicateIds.entries[0]?.look.id ?? "";
    expect(parseLookLibraryText(JSON.stringify(duplicateIds))).toMatchObject({ ok: false, failure: { code: "look-library-invalid" } });
    expect(parseLookLibraryText("{")).toMatchObject({ ok: false, failure: { code: "look-library-json" } });
    expect(parseLookLibraryText(JSON.stringify({ format: "other" }))).toMatchObject({ ok: false, failure: { code: "look-library-format" } });
  });

  it("저장소: 비어 있으면 빈 목록, 저장 뒤 같은 목록을 읽는다", () => {
    const storage = fakeStorage();
    const store = createLookLibraryStore(storage, () => 7);
    expect(store.load()).toEqual({ library: createLookLibrary() });
    const library = save(createLookLibrary(), "보관", 1);
    expect(store.save(library)).toEqual({ ok: true });
    expect(storage.data.get(LOOK_LIBRARY_STORAGE_KEY)).toBe(serializeLookLibrary(library));
    expect(serializeLookLibrary(store.load().library)).toBe(serializeLookLibrary(library));
  });

  it("손상된 저장본은 지우지 않고 백업 키로 옮긴 뒤 빈 목록과 한글 사유를 돌려준다", () => {
    const storage = fakeStorage();
    storage.data.set(LOOK_LIBRARY_STORAGE_KEY, "{망가진");
    const loaded = createLookLibraryStore(storage, () => 7).load();
    expect(loaded.library).toEqual(createLookLibrary());
    expect(loaded.failure).toMatchObject({ code: "look-library-json" });
    expect(loaded.failure?.reasonKo).toContain(LOOK_LIBRARY_BACKUP_KEY);
    expect(storage.data.get(LOOK_LIBRARY_BACKUP_KEY)).toBe("{망가진");
    expect(storage.data.has(LOOK_LIBRARY_STORAGE_KEY)).toBe(false);
  });

  it("쓰기 실패: 용량 초과(이름·코드 22·1014)·보안 오류·그 밖을 각각 한글 사유로 돌려준다(throw 없음)", () => {
    const library = save(createLookLibrary(), "실패", 1);
    const cases: Array<[unknown, string]> = [
      [domError("QuotaExceededError"), "look-storage-quota"],
      [domError("Whatever", 22), "look-storage-quota"],
      [domError("NS_ERROR_DOM_QUOTA_REACHED", 1014), "look-storage-quota"],
      [domError("SecurityError"), "look-storage-unavailable"],
      [new Error("disk"), "look-storage-failed"],
    ];
    for (const [error, code] of cases) {
      const result = createLookLibraryStore(fakeStorage(() => error), () => 3).save(library);
      expect(result, code).toMatchObject({ ok: false, failure: { code } });
      if (!result.ok) expect(result.failure.reasonKo).toMatch(/[가-힣]/u);
    }
    const unreadable: LookStorageLike = {
      getItem: () => {
        throw domError("SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(createLookLibraryStore(unreadable).load()).toMatchObject({ library: createLookLibrary(), failure: { code: "look-storage-unavailable" } });
  });
});

describe("state/look-library: .look.json 파일", () => {
  it("파일 직렬화는 정규형(키 정렬·들여쓰기·끝 개행)이고 왕복이 바이트 단위로 같다", () => {
    const look = extractCharacterLook(styled(), "colors", { id: "my-colors", nameKo: "내 색" });
    const text = serializeLookFile(look);
    expect(text.endsWith("\n")).toBe(true);
    expect(lookFileName(look)).toBe(`my-colors${CHARACTER_LOOK_FILE_SUFFIX}`);
    const parsed = parseLookFileText(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serializeLookFile(parsed.look)).toBe(text);
  });

  it("가져오기: 형식·구문 오류는 한글 사유, 같은 id·이름은 새 id·번호 이름으로 넣는다", () => {
    expect(parseLookFileText("not json")).toMatchObject({ ok: false, failure: { code: "look-json-syntax" } });
    expect(parseLookFileText(JSON.stringify({ format: "x" }))).toMatchObject({ ok: false, failure: { code: "look-format" } });
    const outOfScope = { format: CHARACTER_LOOK_FORMAT, id: "bad", nameKo: "범위 밖", scope: "colors", payload: { slots: { top: "top/tee" } }, locks: [] };
    expect(parseLookFileText(JSON.stringify(outOfScope))).toMatchObject({ ok: false, failure: { code: "look-invalid" } });

    const look = extractCharacterLook(styled(), "full", { id: "shared-look", nameKo: "공유 룩" });
    const first = ok(importLookFileText(createLookLibrary(), serializeLookFile(look), { now: 100 }));
    expect(first.entry.look.id).toBe("shared-look");
    const second = ok(importLookFileText(first.library, serializeLookFile(look), { now: 200 }));
    expect(second.entry.look.id).not.toBe("shared-look");
    expect(second.entry.look.nameKo).toBe("공유 룩 (2)");
    expect(second.library.entries).toHaveLength(2);
    expect(addLookToLibrary(first.library, look, { now: 300, onDuplicate: "reject" })).toMatchObject({ ok: false, failure: { code: "look-name-duplicate" } });
    expect(first.library.format).toBe(LOOK_LIBRARY_FORMAT);
  });
});
