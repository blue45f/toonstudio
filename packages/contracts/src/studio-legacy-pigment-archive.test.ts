import { describe, expect, it } from "vitest";

import { hasValidStudioLegacyPigmentArchiveExtension, hasValidStudioLegacyPigmentArchiveStroke, parseStudioLegacyPigmentArchive } from "./studio-legacy-pigment-archive";

const valid = { version: 1, sourceElementId: "획 원본/한글", sourceIndex: 0 };

describe("외부 혼색 원본 보관 출처 계약", () => {
  it("원래 숨김 false와 필드 없음, 최대 ID와 안전한 순서를 보존한다", () => {
    expect(parseStudioLegacyPigmentArchive(valid)).toEqual(valid);
    expect(parseStudioLegacyPigmentArchive(valid)).not.toBe(valid);
    const complete = { ...valid, sourceElementId: "x".repeat(160), sourceGroupId: "g".repeat(160), sourceHidden: false, sourceIndex: Number.MAX_SAFE_INTEGER };
    expect(parseStudioLegacyPigmentArchive(complete)).toEqual(complete);
    expect(parseStudioLegacyPigmentArchive(valid)).not.toHaveProperty("sourceHidden");
  });
  it.each([
    null, [], { ...valid, version: 2 }, { ...valid, extra: "unknown" },
    { ...valid, sourceElementId: "" }, { ...valid, sourceElementId: "x".repeat(161) },
    { ...valid, sourceElementId: "bad\nID" }, { ...valid, sourceGroupId: "" },
    { ...valid, sourceGroupId: undefined }, { ...valid, sourceHidden: "false" },
    { ...valid, sourceHidden: undefined }, { ...valid, sourceIndex: -1 },
    { ...valid, sourceIndex: 0.5 }, { ...valid, sourceIndex: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, sourceIndex: "0" }, { ...valid, sourceIndex: undefined },
  ])("손상된 필드나 알 수 없는 버전을 제거하지 않고 거절한다: %j", (candidate) => {
    expect(parseStudioLegacyPigmentArchive(candidate)).toBeNull();
  });
  it("보관 출처는 v7에서만 허용하고 기존 v1-v6은 그대로 유지한다", () => {
    for (const version of [1, 2, 3, 4, 5, 6]) {
      expect(hasValidStudioLegacyPigmentArchiveExtension(version, valid)).toBe(false);
      expect(hasValidStudioLegacyPigmentArchiveExtension(version, undefined)).toBe(true);
    }
    expect(hasValidStudioLegacyPigmentArchiveExtension(7, valid)).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveExtension(7, undefined)).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveExtension(8, valid)).toBe(false);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 7, type: "draw", kind: "freehand", mode: "pen" })).toBe(false);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 7, type: "draw", extensions: { colorizeMaskEnabled: false } })).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 6, type: "draw", extensions: { colorizeMaskEnabled: false } })).toBe(false);
  });
});
