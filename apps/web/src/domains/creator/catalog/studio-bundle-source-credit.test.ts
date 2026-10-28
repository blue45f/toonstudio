import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { StudioWorkAssetElementSchema, StudioWorkAssetManifestSchema, parseStudioWorkAssetStructuredEditValue } from "@toonstudio/contracts/studio-work-asset-contract";
import { createAssetRecord } from "../studio-asset-library";
import { projectStudioAssetRightsUsages } from "../studio-asset-rights-projection";
import { applyStudioBundleSourcePatch, insertStudioAssetWithBundleCredit, parseStudioBundleSourceCredit, studioBundleAssetRights, studioBundleFrameBackgroundPatch, studioBundleCreditMatchesSource } from "./studio-bundle-source-credit";
import { studioBundleCreditFixture } from "./studio-bundle-source-credit.test-fixture";
import { buildStudioProjectArchive, importStudioProjectArchive } from "../studio-project-archive";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";

import type { ImageEl } from "../studio-element-model";

const CREDIT = studioBundleCreditFixture();
const IMAGE: ImageEl = { id: "placed", type: "image", src: CREDIT.renderPath, x: 0, y: 0, width: 10, height: 10, rotation: 0, bundleSourceCredit: CREDIT };
const project = (image: unknown) => ({ version: 2, title: "번들 검증", pagesList: [{ id: "page", elements: [image], bg: "#ffffff", bgGrad: null, canvasH: 1080 }] });

describe("번들 렌더의 정식 출처 계약", () => {
  it("CC0·원장·공용 출처·해시의 모순과 알 수 없는 필드를 거부한다", () => {
    expect(parseStudioBundleSourceCredit(CREDIT)).toEqual(CREDIT);
    for (const patch of [
      { contentHash: "invalid" }, { serve: "hold" }, { commercialUse: false },
      { status: "licensed" }, { licenseUrl: "https://example.test/cc0" },
      { sourceUrl: "https://itch.io/download/private" },
      { sourceUrl: "https://rg-poly.itch.io/cute-park-pack?key=opaque" },
      { sourceUrl: "https://example.test/cute-park-pack" }, { provider: "" }, { futureGrant: true },
      { renderPath: "/assets/studio/bundle-scenes-v1/different-asset.webp" },
    ]) expect(parseStudioBundleSourceCredit({ ...CREDIT, ...patch })).toBeNull();
    expect(parseStudioBundleSourceCredit(studioBundleCreditFixture({ ledgerPackId: "rg-poly-food-pack" }))).not.toBeNull();
  });

  it("외부의 같은 pathname·미지원 data MIME·잘못된 base64는 같은 번들 이미지로 승격하지 않는다", () => {
    expect(studioBundleCreditMatchesSource(CREDIT, CREDIT.renderPath)).toBe(true);
    for (const source of [`https://outside.example${CREDIT.renderPath}`, `javascript:${CREDIT.renderPath}`, "data:image/svg+xml;base64,PHN2Zy8+", "data:text/plain;base64,QQ==", "data:image/webp;base64,%%%", "/assets/other.webp"]) expect(studioBundleCreditMatchesSource(CREDIT, source)).toBe(false);
    const wrongBackground = { id: "wrong-frame", type: "frame" as const, x: 0, y: 0, width: 20, height: 20, bg: "/assets/other.webp", bundleSourceCredit: CREDIT };
    expect(projectStudioAssetRightsUsages([{ id: "page", elements: [wrongBackground] }])[0]).toMatchObject({ licenseId: "unknown" });
  });

  it("삽입 patch와 권리 명세에 동일한 소재 ID·해시·CC0를 남기고 일반 에셋은 세 인자로 삽입한다", () => {
    const add = vi.fn<(src: string, width: number, height: number, provenance?: undefined, animated?: boolean, patch?: Pick<ImageEl, "bundleSourceCredit"> & { name?: string }) => boolean>(() => true);
    const record = createAssetRecord({ name: "공원", dataUrl: IMAGE.src, width: 10, height: 10, contentHash: CREDIT.contentHash, bundleSourceCredit: CREDIT, rights: studioBundleAssetRights(CREDIT) });
    expect(insertStudioAssetWithBundleCredit(record, add)).toBe(true);
    expect(add).toHaveBeenLastCalledWith(IMAGE.src, 10, 10, undefined, false, { name: "공원", bundleSourceCredit: CREDIT });
    expect(projectStudioAssetRightsUsages([{ id: "page", elements: [IMAGE] }])).toEqual([expect.objectContaining({
      assetId: `bundle:${CREDIT.assetId}`, assetVersion: CREDIT.contentHash,
      source: { kind: "external", id: CREDIT.sourceUrl }, licenseId: "cc0-1.0", commercialUse: true, redistribution: "allowed",
    })]);
    const plain = createAssetRecord({ name: "일반", dataUrl: IMAGE.src, width: 10, height: 10 });
    insertStudioAssetWithBundleCredit(plain, add);
    expect(add).toHaveBeenLastCalledWith(IMAGE.src, 10, 10);
    expect(() => createAssetRecord({ ...record, contentHash: `sha256:${"b".repeat(64)}` })).toThrow("해시");
    expect(() => createAssetRecord({ ...record, rights: { ...studioBundleAssetRights(CREDIT), rightsConfirmed: false } })).toThrow("권리");
  });

  it("공유 Web/API asset descriptor의 strict 경계가 정식 credit을 보존하고 잘못된 기록은 거부한다", () => {
    const { src: _src, ...descriptor } = IMAGE;
    expect(StudioWorkAssetElementSchema.parse(descriptor).bundleSourceCredit).toEqual(CREDIT);
    expect(parseStudioWorkAssetStructuredEditValue("bundleSourceCredit", CREDIT)).toEqual(CREDIT);
    expect(() => StudioWorkAssetElementSchema.parse({ ...descriptor, bundleSourceCredit: { ...CREDIT, status: "licensed" } })).toThrow();
    expect(() => StudioWorkAssetElementSchema.parse({ ...descriptor, type: "vrm" })).toThrow();
  });

  it("실제 admitted manifest의 바이트 해시와 descriptor 출처 해시가 다르면 거부한다", () => {
    const manifest = { version: 1, assetId: IMAGE.id, elementType: "image", mimeType: "image/webp", byteSize: 64,
      sha256: CREDIT.contentHash.slice(7), intrinsicImage: { width: 10, height: 10, decodedRgbaBytes: 400 },
      descriptor: { version: 1, element: { id: IMAGE.id, type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, bundleSourceCredit: CREDIT } }, updatedAt: "2026-10-28T00:00:00Z" };
    expect(StudioWorkAssetManifestSchema.safeParse(manifest).success).toBe(true);
    expect(StudioWorkAssetManifestSchema.safeParse({ ...manifest, sha256: "b".repeat(64) }).success).toBe(false);
  });

  it("프로젝트 serialize/parse가 출처를 보존하고 손상된 출처는 전체 프로젝트에서 거부한다", () => {
    const parsed = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(project(IMAGE))));
    expect(parsed.pagesList[0]?.elements[0]).toMatchObject({ bundleSourceCredit: CREDIT });
    expect(() => parseStudioProjectFile(project({ ...IMAGE, bundleSourceCredit: { ...CREDIT, contentHash: "wrong" } }))).toThrow("출처");
  });

  it("프레임 배경의 출처를 보존하며 일반·AI 배경으로 교체할 때 이전 번들 기록을 제거한다", () => {
    const patch = studioBundleFrameBackgroundPatch({ bundleSourceCredit: CREDIT }, IMAGE.src);
    const frame = { id: "frame", type: "frame", x: 0, y: 0, width: 200, height: 100, ...patch };
    expect(parseStudioProjectFile(project(frame)).pagesList[0]?.elements[0]).toMatchObject({ bundleSourceCredit: CREDIT });
    expect(projectStudioAssetRightsUsages([{ id: "page", elements: [{ ...frame, type: "frame" }] }])[0]).toMatchObject({ assetId: `bundle:${CREDIT.assetId}`, assetVersion: CREDIT.contentHash });
    const typedFrame = { ...frame, type: "frame" as const };
    expect(applyStudioBundleSourcePatch(typedFrame, { x: 40 })).toMatchObject({ bundleSourceCredit: CREDIT });
    expect(applyStudioBundleSourcePatch(typedFrame, { bgColor: "white" })).toMatchObject({ bundleSourceCredit: CREDIT });
    expect(applyStudioBundleSourcePatch(typedFrame, { bg: undefined })).toMatchObject({ bundleSourceCredit: undefined });
    const replaced = applyStudioBundleSourcePatch(typedFrame, { bg: "/assets/normal.webp" });
    expect(projectStudioAssetRightsUsages([{ id: "page", elements: [{ ...replaced, type: "frame" }] }])).toEqual([]);
    expect(parseStudioProjectFile(project(replaced)).pagesList[0]?.elements[0]).toMatchObject({ bg: "/assets/normal.webp" });
  });

  it("실제 이미지 바이트와 출처·권리·해시를 프로젝트 아카이브로 왕복한다", async () => {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO4H8xkAAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const credit = studioBundleCreditFixture({ contentHash: `sha256:${hash}` });
    const src = `data:image/png;base64,${base64}`;
    const archive = await buildStudioProjectArchive({ project: project({ ...IMAGE, src, bundleSourceCredit: credit }) }, { crc32ExecutionMode: "direct-headless" });
    expect(archive.isSelfContained).toBe(true);
    expect(archive.manifest.attachments).toEqual([expect.objectContaining({ sha256: hash })]);
    const restored = await importStudioProjectArchive(archive.blob);
    expect(restored.project.pagesList[0]?.elements[0]).toMatchObject({ src, bundleSourceCredit: credit });
    // 편집된 래스터도 문서 저장은 가능하지만 원본 해시와 다른 바이트를 CC0로 승격하지 않는다.
    expect(parseStudioProjectFile(project({ ...IMAGE, src, bundleSourceCredit: CREDIT })).pagesList[0]?.elements[0]).toMatchObject({ src });
    expect(studioBundleCreditMatchesSource(CREDIT, src)).toBe(false);
    expect(studioBundleCreditMatchesSource(credit, src)).toBe(true);
  });
});
