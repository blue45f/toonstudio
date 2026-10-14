import { describe, expect, it } from "vitest";

import {
  BUILTIN_CHARACTER_STYLE_PACKS,
  CHARACTER_STYLE_PACK_MAX_USER_PACKS,
  CHARACTER_STYLE_PACK_STORAGE_KEY,
  applyCharacterStylePack,
  captureCharacterStylePack,
  decodeCharacterStylePackShareCode,
  encodeCharacterStylePackShareCode,
  loadUserCharacterStylePacks,
  parseCharacterStylePack,
  previewCharacterStylePack,
  removeUserCharacterStylePack,
  saveUserCharacterStylePack,
  summarizeCharacterStylePack,
  type CharacterStylePack,
  type StylePackStorageLike,
} from "./studio-shaper-style-pack";
import {
  DEFAULT_SHAPER_APPEARANCE_STATE,
  type ShaperAppearanceState,
} from "./studio-shaper-model";

const NOW = "2026-10-14T00:00:00.000Z";

function memoryStorage(): StylePackStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function captureOk(
  appearance: ShaperAppearanceState,
  name: string,
): CharacterStylePack {
  const result = captureCharacterStylePack(appearance, { name, now: NOW });
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

const customAppearance: ShaperAppearanceState = {
  selection: {
    hair: "hair-ponytail",
    accessories: "acc-cap",
    top: "top-hoodie",
    bottom: "bottom-jeans",
    shoes: "shoes-boots",
  },
  colors: { "hair-ponytail": "#ABCDEF", "top-hoodie": "#22c55e" },
};

describe("parseCharacterStylePack (팩 스키마)", () => {
  it("기본 제공 팩 6종이 전부 스키마·카탈로그 검증을 통과한다", () => {
    expect(BUILTIN_CHARACTER_STYLE_PACKS).toHaveLength(6);
    const ids = new Set(BUILTIN_CHARACTER_STYLE_PACKS.map((pack) => pack.id));
    expect(ids.size).toBe(6);
    for (const pack of BUILTIN_CHARACTER_STYLE_PACKS) {
      expect(pack.source).toBe("builtin");
      expect(parseCharacterStylePack(pack).ok).toBe(true);
    }
  });

  it("카탈로그에 없는 아이템과 범주가 어긋난 아이템을 사유와 함께 거부한다", () => {
    const base = captureOk(customAppearance, "테스트 팩");
    const unknown = parseCharacterStylePack({
      ...base,
      appearance: {
        selection: { ...base.appearance.selection, hair: "hair-missing" },
        colors: {},
      },
    });
    expect(unknown).toMatchObject({ ok: false, code: "unknown-preset" });

    const mismatch = parseCharacterStylePack({
      ...base,
      appearance: {
        selection: { ...base.appearance.selection, hair: "top-school" },
        colors: {},
      },
    });
    expect(mismatch).toMatchObject({ ok: false, code: "category-mismatch" });
  });

  it("hex가 아닌 색상, 빈 이름, 버전 불일치를 거부한다", () => {
    const base = captureOk(customAppearance, "테스트 팩");
    expect(
      parseCharacterStylePack({
        ...base,
        appearance: { selection: base.appearance.selection, colors: { "top-hoodie": "red" } },
      }),
    ).toMatchObject({ ok: false, code: "invalid-color" });
    expect(parseCharacterStylePack({ ...base, name: "  " })).toMatchObject({
      ok: false,
      code: "invalid-name",
    });
    expect(parseCharacterStylePack({ ...base, version: 9 })).toMatchObject({
      ok: false,
      code: "unsupported-version",
    });
  });

  it("색상은 소문자로 정규화하고 중복 태그는 한 번만 남긴다", () => {
    const pack = captureOk(customAppearance, "정규화 팩");
    expect(pack.appearance.colors["hair-ponytail"]).toBe("#abcdef");
    const parsed = parseCharacterStylePack({ ...pack, tags: ["학원", "학원", "로맨스"] });
    if (!parsed.ok) throw new Error(parsed.code);
    expect(parsed.value.tags).toEqual(["학원", "로맨스"]);
  });
});

describe("capture/apply/preview (원클릭 적용·미리보기)", () => {
  it("현재 코디를 캡처하면 결정적 id가 생기고 재캡처 시 같은 id가 된다", () => {
    const a = captureOk(customAppearance, "내 코디");
    const b = captureOk(customAppearance, "내 코디");
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/);
    const other = captureOk(DEFAULT_SHAPER_APPEARANCE_STATE, "내 코디");
    expect(other.id).not.toBe(a.id);
  });

  it("적용은 팩 상태로 통째 교체하고 변경 범주 영수증을 남긴다", () => {
    const pack = captureOk(customAppearance, "교체 팩");
    const { appearance, receipt } = applyCharacterStylePack(
      DEFAULT_SHAPER_APPEARANCE_STATE,
      pack,
    );
    expect(appearance.selection).toEqual(pack.appearance.selection);
    expect(appearance.colors).toEqual(pack.appearance.colors);
    expect(receipt.changedCategories).toContain("hair");
    // 기본 코디와 5개 범주 전부 다르므로 영수증도 5개 범주를 모두 보고한다.
    expect(receipt.changedCategories).toHaveLength(5);
    expect(receipt.colorCount).toBe(2);
    expect(receipt.summaryKo).toContain("교체 팩");
  });

  it("이미 적용된 팩을 다시 적용하면 변경 없음으로 보고한다", () => {
    const pack = BUILTIN_CHARACTER_STYLE_PACKS[0];
    const { receipt } = applyCharacterStylePack(
      { selection: pack.appearance.selection, colors: pack.appearance.colors },
      pack,
    );
    expect(receipt.changedCategories).toHaveLength(0);
    expect(receipt.summaryKo).toContain("이미 적용");
  });

  it("미리보기는 범주별 전→후 라벨과 변경 여부를 돌려준다", () => {
    const pack = BUILTIN_CHARACTER_STYLE_PACKS[0];
    const rows = previewCharacterStylePack(DEFAULT_SHAPER_APPEARANCE_STATE, pack);
    expect(rows).toHaveLength(5);
    const hair = rows.find((row) => row.category === "hair");
    expect(hair).toMatchObject({ changed: true, toLabelKo: "시스루 뱅 단발" });
    expect(summarizeCharacterStylePack(pack)).toContain("헤어 시스루 뱅 단발");
  });
});

describe("공유 코드", () => {
  it("인코드→디코드가 무손실이고 같은 팩은 같은 코드다", () => {
    const pack = captureOk(customAppearance, "공유 팩");
    const code = encodeCharacterStylePackShareCode(pack);
    expect(code).toMatch(/^TSP1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    expect(encodeCharacterStylePackShareCode(pack)).toBe(code);
    const decoded = decodeCharacterStylePackShareCode(`친구 코드예요:\n${code}\n써보세요`);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.value.appearance).toEqual(pack.appearance);
    expect(decoded.value.name).toBe("공유 팩");
    expect(decoded.value.source).toBe("user");
  });

  it("1글자 변조는 checksum-mismatch, 다른 버전은 unsupported-version이다", () => {
    const pack = captureOk(customAppearance, "공유 팩");
    const code = encodeCharacterStylePackShareCode(pack);
    const tampered = code.slice(0, -1) + (code.endsWith("0") ? "1" : "0");
    expect(decodeCharacterStylePackShareCode(tampered)).toMatchObject({
      ok: false,
      code: "checksum-mismatch",
    });
    expect(decodeCharacterStylePackShareCode(code.replace("TSP1", "TSP9"))).toMatchObject({
      ok: false,
      code: "unsupported-version",
    });
    expect(decodeCharacterStylePackShareCode("그냥 텍스트")).toMatchObject({
      ok: false,
      code: "not-a-style-pack-code",
    });
    expect(decodeCharacterStylePackShareCode("  ")).toMatchObject({ ok: false, code: "empty" });
  });
});

describe("사용자 팩 저장소", () => {
  it("저장→재로드가 왕복되고 같은 id 재저장은 덮어쓴다", () => {
    const storage = memoryStorage();
    const pack = captureOk(customAppearance, "저장 팩");
    expect(saveUserCharacterStylePack(storage, pack).ok).toBe(true);
    expect(storage.map.has(CHARACTER_STYLE_PACK_STORAGE_KEY)).toBe(true);
    const renamed = { ...pack, name: "저장 팩 2" };
    expect(saveUserCharacterStylePack(storage, renamed).ok).toBe(true);
    const { packs, dropped } = loadUserCharacterStylePacks(storage);
    expect(dropped).toBe(0);
    expect(packs).toHaveLength(1);
    expect(packs[0].name).toBe("저장 팩 2");
  });

  it("삭제하면 목록에서 사라지고, 깨진 항목은 건너뛰고 개수를 보고한다", () => {
    const storage = memoryStorage();
    const a = captureOk(customAppearance, "팩 A");
    const b = captureOk(DEFAULT_SHAPER_APPEARANCE_STATE, "팩 B");
    saveUserCharacterStylePack(storage, a);
    saveUserCharacterStylePack(storage, b);
    // 저장소 JSON에 깨진 항목을 섞는다.
    const raw = JSON.parse(storage.map.get(CHARACTER_STYLE_PACK_STORAGE_KEY) ?? "[]");
    raw.push({ version: 1, id: "broken" });
    storage.map.set(CHARACTER_STYLE_PACK_STORAGE_KEY, JSON.stringify(raw));
    const loaded = loadUserCharacterStylePacks(storage);
    expect(loaded.packs).toHaveLength(2);
    expect(loaded.dropped).toBe(1);

    const removed = removeUserCharacterStylePack(storage, a.id);
    if (!removed.ok) throw new Error(removed.code);
    expect(removed.value.map((pack) => pack.id)).toEqual([b.id]);
  });

  it("상한을 넘기면 기존 팩을 밀어내지 않고 pack-limit로 거부한다", () => {
    const storage = memoryStorage();
    for (let i = 0; i < CHARACTER_STYLE_PACK_MAX_USER_PACKS; i += 1) {
      const pack = captureOk(
        {
          selection: { ...customAppearance.selection },
          colors: { "top-hoodie": `#0000${String(i).padStart(2, "0")}` },
        },
        `팩 ${i}`,
      );
      // id 충돌을 피하려고 색상 해시가 달라지게 한 서로 다른 구성을 저장한다.
      expect(saveUserCharacterStylePack(storage, pack).ok).toBe(true);
    }
    const overflow = captureOk(customAppearance, "넘치는 팩");
    expect(saveUserCharacterStylePack(storage, overflow)).toMatchObject({
      ok: false,
      code: "pack-limit",
    });
    expect(loadUserCharacterStylePacks(storage).packs).toHaveLength(
      CHARACTER_STYLE_PACK_MAX_USER_PACKS,
    );
  });

  it("스토리지가 없으면 storage-unavailable로 정직하게 실패한다", () => {
    const pack = captureOk(customAppearance, "팩");
    expect(saveUserCharacterStylePack(null, pack)).toMatchObject({
      ok: false,
      code: "storage-unavailable",
    });
    expect(loadUserCharacterStylePacks(null)).toEqual({ packs: [], dropped: 0 });
  });
});
