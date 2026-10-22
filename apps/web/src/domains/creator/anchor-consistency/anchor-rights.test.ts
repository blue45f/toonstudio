import { describe, expect, it } from "vitest";

import {
  ANCHOR_RIGHTS_LICENSE_ID,
  ANCHOR_RIGHTS_NOTE_MAX_LENGTH,
  ANCHOR_RIGHTS_SCHEMA,
  ANCHOR_RIGHTS_STATEMENT_KO,
  AnchorRightsError,
  anchorAssetRightsMetadata,
  createAnchorRights,
  normalizeAnchorRightsNote,
} from "./anchor-rights";

const BASE = { confirmed: true, attestedAt: "2026-10-22T09:30:00+09:00", anchorId: "hero-01", sourceCharacterId: "char-7" } as const;

describe("앵커 권리 확인", () => {
  it("확인한 기록만 만들고 가상 캐릭터·생체 정보 미사용을 함께 남긴다", () => {
    const rights = createAnchorRights({ ...BASE, note: "  내가 그린   캐릭터  " });
    expect(rights).toMatchObject({
      schema: ANCHOR_RIGHTS_SCHEMA,
      version: 1,
      confirmed: true,
      virtualCharacterOnly: true,
      biometricProcessing: "none",
      anchorId: "hero-01",
      sourceCharacterId: "char-7",
      note: "내가 그린 캐릭터",
      statement: ANCHOR_RIGHTS_STATEMENT_KO,
    });
    expect(rights.attestedAt).toBe("2026-10-22T00:30:00.000Z");
    expect(Object.isFrozen(rights)).toBe(true);
  });

  it("확인 문장은 가상 캐릭터이며 실존 인물의 사진이 아님을 분명히 말한다", () => {
    expect(ANCHOR_RIGHTS_STATEMENT_KO).toContain("가상 캐릭터");
    expect(ANCHOR_RIGHTS_STATEMENT_KO).toContain("실존 인물의 사진이나 초상이 아닙니다");
    expect(ANCHOR_RIGHTS_STATEMENT_KO).toContain("권리를 가졌거나 이용 허락을 받은");
  });

  it("확인하지 않았거나 시각·식별자가 올바르지 않으면 기록을 만들지 않는다", () => {
    const code = (input: Parameters<typeof createAnchorRights>[0]): string => {
      try {
        createAnchorRights(input);
        return "ok";
      } catch (error) {
        return error instanceof AnchorRightsError ? error.code : "other";
      }
    };
    expect(code({ ...BASE, confirmed: false })).toBe("not-confirmed");
    expect(code({ ...BASE, confirmed: undefined as never })).toBe("not-confirmed");
    expect(code({ ...BASE, attestedAt: "어제" })).toBe("invalid-time");
    expect(code({ ...BASE, anchorId: "Bad Id" })).toBe("invalid-identity");
    expect(code({ ...BASE, sourceCharacterId: "" })).toBe("invalid-identity");
    expect(code(BASE)).toBe("ok");
  });

  it("메모는 제어 문자를 지우고 공백을 정리하며 길이를 제한한다", () => {
    expect(normalizeAnchorRightsNote("a\u0000b\tc\nd")).toBe("a b c d");
    expect(normalizeAnchorRightsNote("x".repeat(ANCHOR_RIGHTS_NOTE_MAX_LENGTH + 50))).toHaveLength(ANCHOR_RIGHTS_NOTE_MAX_LENGTH);
    expect(createAnchorRights(BASE).note).toBe("");
  });

  it("소재 라이브러리용 권리 메타데이터는 출처 종류만 스테이지와 파일로 나눈다", () => {
    const rights = createAnchorRights({ ...BASE, note: "직접 제작" });
    const fromFile = anchorAssetRightsMetadata(rights, "file");
    const fromStage = anchorAssetRightsMetadata(rights, "stage");
    expect(fromFile).toMatchObject({
      sourceKind: "local-upload",
      sourceId: "anchor:hero-01",
      licenseId: ANCHOR_RIGHTS_LICENSE_ID,
      rightsConfirmed: true,
      attributionText: "직접 제작",
      attributionRequired: null,
      licenseUrl: null,
    });
    expect(fromStage.sourceKind).toBe("3d-generated");
    expect(fromStage.licenseId).toBe(fromFile.licenseId);
  });
});
