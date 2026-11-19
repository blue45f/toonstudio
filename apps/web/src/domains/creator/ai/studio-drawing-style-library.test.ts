import { describe, expect, it, vi } from "vitest";
import { getArtistStyleDnaPreset } from "./studio-artist-style-dna";
import { blankDrawingStyle, createDrawingStyleLibrary, describeDrawingStyle, imageLookForDrawingStyle } from "./studio-drawing-style-library";

const wash = { ...blankDrawingStyle, name: "작업실 먹선", line: "가는 선", texture: "마른 종이" };
function fixture() {
  const rows = new Map<string, string>();
  const store = {
    get: async (key: string) => rows.get(key) ?? null,
    set: vi.fn(async (key: string, data: string) => { rows.set(key, data); }),
    delete: async (key: string) => { rows.delete(key); },
  };
  return { rows, store, lib: createDrawingStyleLibrary(store) };
}

describe("작가 그림체 보관함", () => {
  it("동시에 추가한 두 그림체가 다시 연 보관함에 모두 남고, 비워 둔 축은 지시에서 뺀다", async () => {
    const { store, lib } = fixture();
    await Promise.all([lib.save(wash), lib.save({ ...wash, name: "단편집" })]);
    expect((await createDrawingStyleLibrary(store).list()).map(item => item.recipe.name)).toEqual([wash.name, "단편집"]);
    expect(describeDrawingStyle(wash)).toBe("선 · 가는 선\n질감 · 마른 종이");
    expect(describeDrawingStyle(wash, true)).toContain("Texture · 마른 종이");
  });
  it("저장한 보정의 대비를 별도 이미지에 재현하고 기본 룩의 수치와 무관한 설정은 건드리지 않는다", async () => {
    const { lib } = fixture();
    const { entry } = await lib.save({ ...wash, lookId: "noir", contrastOffset: 12 });
    expect(imageLookForDrawingStyle(entry.recipe)?.patch).toMatchObject({ grayscale: true, contrast: 48 });
    expect(imageLookForDrawingStyle({ ...entry.recipe, contrastOffset: 0 })?.patch.contrast).toBe(36);
    expect(describeDrawingStyle(entry.recipe)).toContain("대비 +12");
    expect(imageLookForDrawingStyle(wash)).toBeUndefined();
  });
  it("동명 추가와 다른 창의 낡은 편집이 현재 그림체를 덮지 않는다", async () => {
    const { lib } = fixture();
    const { entry } = await lib.save(wash);
    await expect(lib.save({ ...wash, name: " "+wash.name+" " })).rejects.toThrow("style-name-in-use");
    await lib.save({ ...wash, line: "굵은 선" }, entry);
    await expect(lib.save({ ...wash, color: "먹색" }, entry)).rejects.toThrow("style-conflict");
    expect((await lib.list())[0].recipe.line).toBe("굵은 선");
  });
  it("지원되지 않는 보정이나 삭제한 모델을 다른 그림체로 바꾸지 않는다", async () => {
    const { lib } = fixture();
    expect(() => lib.save({ ...wash, lookId: "missing" })).toThrow();
    expect(await lib.list()).toEqual([]);
    expect(getArtistStyleDnaPreset("deleted-draft-model")).toBeUndefined();
    expect(getArtistStyleDnaPreset("k-action-sharp")?.profile.lineWeight).toBe("bold");
  });
  it("저장 실패 뒤 같은 작업을 다시 저장하고 손상된 보관함은 보존한다", async () => {
    const { rows, store, lib } = fixture();
    store.set.mockRejectedValueOnce(new Error("offline"));
    await expect(lib.save(wash)).rejects.toThrow("offline");
    await lib.save(wash);
    rows.set("library", "broken");
    await expect(lib.save({ ...wash, name: "둘째" })).rejects.toThrow();
    expect(rows.get("library")).toBe("broken");
  });
});
