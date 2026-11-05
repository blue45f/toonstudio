import { describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { resolveStudioCrdtPageBridgeErrorFromCause } from "../status-i18n/studio-producer-error-i18n-live-crdt";
import { StudioCrdtDocument, type StudioCrdtJsonObject, type StudioCrdtStrokeRecord } from "./studio-crdt-document";
import {
  studioCrdtStrokeToDrawElement,
  studioDrawElementToCrdtStroke,
  StudioCrdtPageBridgeError,
  type StudioCrdtCompatibleDrawElement,
} from "./studio-crdt-page-bridge";

function archivedStroke(): StudioCrdtCompatibleDrawElement {
  const material = createBrushStudioV6MaterialReceipt({
    ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full",
  });
  return {
    id: "archive-id", type: "draw", points: [1, 2, 3, 4], stroke: "#123456", strokeWidth: 20,
    hidden: true, groupId: "archive-group",
    legacyPigmentArchive: { version: 1, sourceElementId: "source-id", sourceIndex: 2, sourceHidden: false },
    brushEnginePrograms: { version: 1, material: {
      version: 1, seed: material.seed, slots: material.slots, tuning: material.tuning, input: material.input,
    } },
  };
}

function record(): StudioCrdtStrokeRecord {
  return { ...studioDrawElementToCrdtStroke("page-1", archivedStroke()), status: "finalized", deleted: false, orderIndex: 0 };
}
const INVALID_ARCHIVES: StudioCrdtJsonObject[] = [
  { version: 2, sourceElementId: "source-id", sourceIndex: 2 },
  { version: 1, sourceElementId: "source-id", sourceIndex: -1 },
  { version: 1, sourceElementId: "source-id", sourceIndex: 2, unexpected: true },
];

describe("보관 획의 메타데이터 쓰기·표시 경계", () => {
  it("kind·mode의 전체 쓰기와 필드별 삭제가 v7 원본의 부재를 재접속 뒤에도 보존한다", () => {
    const document = new StudioCrdtDocument();
    try {
      const input = studioDrawElementToCrdtStroke("page-1", archivedStroke());
      const complete = { ...input.payload, kind: "freehand", mode: "pen" as const };
      document.addStroke({ ...input, payload: complete });
      expect(document.getStroke(input.id)?.payload).toMatchObject({ kind: "freehand", mode: "pen" });
      document.patchStroke(input.id, { payload: input.payload, changedPayloadKeys: ["kind", "mode"] });
      const peer = new StudioCrdtDocument(document.encodeStateAsUpdate());
      try {
        const restored = peer.getStroke(input.id);
        expect(restored?.payload).not.toHaveProperty("kind");
        expect(restored?.payload).not.toHaveProperty("mode");
        if (!restored) throw new Error("보관 획이 복원되지 않았습니다.");
        expect(studioCrdtStrokeToDrawElement(restored)).toEqual(archivedStroke());
      } finally { peer.destroy(); }
    } finally { document.destroy(); }
  });

  it("검증한 보관 출처를 값 손실이나 입력 객체 공유 없이 복원한다", () => {
    const source = record(), before = structuredClone(source);
    const restored = studioCrdtStrokeToDrawElement(source);
    expect(restored.legacyPigmentArchive).toEqual(source.payload.extensions?.legacyPigmentArchive);
    expect(restored.legacyPigmentArchive).not.toBe(source.payload.extensions?.legacyPigmentArchive);
    if (!restored.legacyPigmentArchive) throw new Error("보관 출처가 없습니다.");
    restored.legacyPigmentArchive.sourceIndex = 99;
    expect(source).toEqual(before);
  });

  it.each(INVALID_ARCHIVES)("손상된 보관 출처는 구체적인 코드와 복구 안내로 거절한다: %j", (archive) => {
    const source = record();
    source.payload.extensions = { ...source.payload.extensions, legacyPigmentArchive: archive };
    const before = structuredClone(source);
    expect(() => studioCrdtStrokeToDrawElement(source)).toThrow(StudioCrdtPageBridgeError);
    try { studioCrdtStrokeToDrawElement(source); }
    catch (cause) {
      expect(cause).toMatchObject({ code: "legacy-pigment-archive-invalid", message: "legacy-pigment-archive-invalid" });
      expect(resolveStudioCrdtPageBridgeErrorFromCause(cause)).toBe("외부 혼색 원본의 보관 출처가 올바르지 않습니다. 원본 보관본을 다시 확인해 주세요.");
    }
    expect(source).toEqual(before);
  });
});
