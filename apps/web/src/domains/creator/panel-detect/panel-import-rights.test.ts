import { describe, expect, it } from "vitest";

import { buildStudioAssetRightsManifest } from "../studio-asset-rights-manifest";
import { projectStudioAssetRightsUsages } from "../studio-asset-rights-projection";
import {
  PANEL_IMPORT_NOTE_MAX_LENGTH,
  PANEL_IMPORT_RIGHTS_STATEMENT_KO,
  PanelImportRightsError,
  computeSourceSha256,
  createPanelImportRights,
  normalizePanelImportNote,
  panelImportReceiptText,
  panelImportRightsAssetId,
  parsePanelImportRights,
  type CreatePanelImportRightsInput,
} from "./panel-import-rights";

import type { El } from "../studio-element-model";

const SOURCE = {
  fileName: "ep01-scan.png",
  mimeType: "image/png",
  sizeBytes: 2_400_000,
  width: 1600,
  height: 2400,
  sha256: "a".repeat(64),
} as const;

function input(overrides: Partial<CreatePanelImportRightsInput> = {}): CreatePanelImportRightsInput {
  return { confirmed: true, attestedAt: "2026-10-15T01:02:03.000Z", source: SOURCE, ...overrides };
}

describe("출처·권리 확인 기록", () => {
  it("확인 문구의 한글 정본을 고정한다", () => {
    expect(PANEL_IMPORT_RIGHTS_STATEMENT_KO).toBe("내가 권리를 가진 원고이거나 이용 허락을 받은 원고입니다");
  });

  it("확인(confirmed: true) 없이는 만들 수 없다", () => {
    for (const confirmed of [false, undefined, "true", 1]) {
      expect(() => createPanelImportRights(input({ confirmed: confirmed as never }))).toThrowError(
        expect.objectContaining({ code: "not-confirmed" }),
      );
    }
    expect(() => createPanelImportRights(input({ confirmed: false }))).toThrow(PanelImportRightsError);
  });

  it("확인하면 시각을 정규화하고 메모를 정리한 읽기 전용 기록을 만든다", () => {
    const rights = createPanelImportRights(input({ attestedAt: "2026-10-15T10:02:03+09:00", note: "  작가 본인\n원고 \u0007 입니다  " }));
    expect(rights).toMatchObject({
      schema: "toonstudio.panel-import-rights",
      version: 1,
      statement: "owned-or-licensed",
      attestedAt: "2026-10-15T01:02:03.000Z",
      note: "작가 본인 원고 입니다",
      tool: { name: "panel-detect-reflow", version: 1 },
    });
    expect(Object.isFrozen(rights)).toBe(true);
    expect(Object.isFrozen(rights.source)).toBe(true);
  });

  it("잘못된 시각·영수증은 거절한다", () => {
    expect(() => createPanelImportRights(input({ attestedAt: "어제" }))).toThrowError(expect.objectContaining({ code: "invalid-time" }));
    expect(() => createPanelImportRights(input({ source: { ...SOURCE, sha256: "xyz" } }))).toThrowError(expect.objectContaining({ code: "invalid-receipt" }));
    expect(() => createPanelImportRights(input({ source: { ...SOURCE, width: 0 } }))).toThrowError(expect.objectContaining({ code: "invalid-receipt" }));
    expect(() => createPanelImportRights(input({ source: { ...SOURCE, fileName: "  " } }))).toThrowError(expect.objectContaining({ code: "invalid-receipt" }));
  });

  it("메모는 길이를 제한하고 서로게이트 쌍을 자르지 않는다", () => {
    const long = "가".repeat(PANEL_IMPORT_NOTE_MAX_LENGTH + 40);
    expect([...normalizePanelImportNote(long)]).toHaveLength(PANEL_IMPORT_NOTE_MAX_LENGTH);
    const emoji = "😀".repeat(PANEL_IMPORT_NOTE_MAX_LENGTH + 5);
    expect([...normalizePanelImportNote(emoji)]).toHaveLength(PANEL_IMPORT_NOTE_MAX_LENGTH);
    expect(normalizePanelImportNote("a\t\tb\n\nc")).toBe("a b c");
  });

  it("저장소에서 읽은 값은 형식을 다시 검증한다", () => {
    const rights = createPanelImportRights(input());
    expect(parsePanelImportRights(JSON.parse(JSON.stringify(rights)))).toEqual(rights);
    expect(parsePanelImportRights({ ...rights, version: 2 })).toBeNull();
    expect(parsePanelImportRights({ ...rights, statement: "public-domain" })).toBeNull();
    expect(parsePanelImportRights({ ...rights, source: { ...rights.source, sha256: "short" } })).toBeNull();
    expect(parsePanelImportRights({ ...rights, attestedAt: "never" })).toBeNull();
    expect(parsePanelImportRights(null)).toBeNull();
    expect(parsePanelImportRights("rights")).toBeNull();
  });

  it("자산 ID 는 같은 원본이면 같고, 영수증 문장에 원본 정보와 확인 날짜가 들어간다", () => {
    const first = createPanelImportRights(input());
    const second = createPanelImportRights(input({ attestedAt: "2026-10-16T00:00:00.000Z" }));
    expect(panelImportRightsAssetId(first)).toBe(panelImportRightsAssetId(second));
    expect(panelImportRightsAssetId(first)).toBe(`panel-import:${"a".repeat(24)}`);
    const text = panelImportReceiptText(createPanelImportRights(input({ note: "출판사 허락" })));
    expect(text).toContain("ep01-scan.png");
    expect(text).toContain("1600×2400px");
    expect(text).toContain("2026-10-15");
    expect(text).toContain("메모: 출판사 허락");
    expect(text).not.toContain("a".repeat(13));
  });

  it("원본 바이트의 SHA-256 을 구한다", async () => {
    const bytes = new TextEncoder().encode("abc");
    const digest = await computeSourceSha256(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("권리 명세(rights manifest) 합류", () => {
  function image(id: string, extra: Partial<Extract<El, { type: "image" }>> = {}): Extract<El, { type: "image" }> {
    return { id, type: "image", src: "data:image/png;base64,AA==", x: 0, y: 0, width: 10, height: 10, rotation: 0, ...extra };
  }

  it("확인 기록이 있는 이미지는 알 수 없음(unknown)이 아니라 사용자 확인(custom)으로 올라가고, 같은 원본의 컷은 한 자산으로 묶인다", () => {
    const rights = createPanelImportRights(input());
    const usages = projectStudioAssetRightsUsages([
      { id: "page-1", elements: [image("cut-1", { sourceRights: rights }), image("cut-2", { sourceRights: rights }), image("plain")] },
    ]);
    expect(usages.map((usage) => ({ assetId: usage.assetId, licenseId: usage.licenseId, kind: usage.source?.kind }))).toEqual([
      { assetId: panelImportRightsAssetId(rights), licenseId: "custom", kind: "local-upload" },
      { assetId: panelImportRightsAssetId(rights), licenseId: "custom", kind: "local-upload" },
      { assetId: "local:plain", licenseId: "unknown", kind: "local-upload" },
    ]);
    const manifest = buildStudioAssetRightsManifest({ workId: "work-1", usages: usages.slice(0, 2), now: Date.parse("2026-10-15T00:00:00.000Z") });
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0].usages).toHaveLength(2);
    expect(manifest.assets[0].license.id).toBe("custom");
    const codes = manifest.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).not.toContain("LICENSE_UNKNOWN");
    expect(codes).not.toContain("SOURCE_MISSING");
    // 원본 파일 해시를 자산 버전으로 쓰므로 버전 누락 오류도 없다.
    expect(codes).not.toContain("ASSET_VERSION_MISSING");
    expect(manifest.assets[0].assetVersion).toBe(`sha256:${"a".repeat(64)}`);
    // 허락 범위·만료는 사용자 확인으로는 알 수 없으므로 그대로 확인 필요로 남는다.
    expect(codes).toContain("EXPIRY_UNKNOWN");
    expect(manifest.assets[0].commercialUse).toBe("unknown");
  });

  it("깨진 확인 기록은 무시하고 기존 fail-closed 경로(local-upload/unknown)로 둔다", () => {
    const usages = projectStudioAssetRightsUsages([
      { id: "page-1", elements: [image("cut-1", { sourceRights: { schema: "toonstudio.panel-import-rights" } as never })] },
    ]);
    expect(usages[0]).toMatchObject({ assetId: "local:cut-1", licenseId: "unknown" });
  });
});
