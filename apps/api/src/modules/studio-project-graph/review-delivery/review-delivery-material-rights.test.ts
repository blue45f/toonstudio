import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createStudioVrmProjectArchiveUseContextReceipt } from "@toonstudio/contracts/studio-vrm-archive-rights";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CONTRACT,
  STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CAPABILITY, hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { bg3dBundleFixture } from "../../creator/studio-bg3d-bundle.test-fixture";
import { STUDIO_VRM_1_PUBLIC_LICENSE_URL } from "@toonstudio/contracts/studio-vrm-license-metadata";
import { assertReviewDeliveryMaterialRights, assertReviewDeliveryVrmLicense, verifyReviewDeliveryMaterialReferences } from "./review-delivery-material-rights";

const commercial = { status: "licensed", commercialUse: true, attributionRequired: false };
const background = (rights: unknown) => ({ type: "image", bg3dScene: {
  nodes: [{ kind: "model", attachmentId: "desk" }],
  attachments: [{ id: "desk", rights }, { id: "unused", rights: { commercialUse: false } }],
} });
const community = (licenseId: string, attributionText = "") => ({
  type: "image", communityAssetCredit: { licenseId, commercialUse: true, attributionText },
});
const doc = (...elements: unknown[]) => ({ pagesList: [{ id: "cut-2", elements }] });

describe("고정 검수 원고 소재 확인", () => {
  it.each([community("cc-by-nc-4.0"), community("cc-by-4.0"), community("unknown"),
    background({ ...commercial, status: "unknown" }), background({ ...commercial, commercialUse: false }),
    background({ ...commercial, attributionRequired: true }), { type: "frame", bundleSourceCredit: {} }])(
    "사용권이 불분명하거나 필수 출처 표기가 없는 소재를 차단한다", (element) => {
      expect(() => assertReviewDeliveryMaterialRights(doc(element))).toThrow();
    },
  );
  it("쓰지 않은 첨부물은 제외하고 출고하는 컷과 보이는 마스터의 소재를 검사한다", () => {
    expect(() => assertReviewDeliveryMaterialRights(doc(background(commercial), community("cc-by-4.0", "원작자")))).not.toThrow();
    const master = { elements: [community("cc-by-nc-4.0")] };
    expect(() => assertReviewDeliveryMaterialRights({ ...doc(), master })).toThrow();
    expect(() => assertReviewDeliveryMaterialRights({ pagesList: [{ elements: [], hideMaster: true }], master })).not.toThrow();
  });
});

it("출처가 생략된 과거 원고는 보존하고 명시한 사진 크레딧·가져오기 기록·차단 모델을 검증한다", () => {
  expect(() => assertReviewDeliveryMaterialRights(doc({ type: "image", id: "legacy" }))).not.toThrow();
  expect(() => assertReviewDeliveryMaterialRights(doc({ stockImageCredit: { photographerName: "사진가" } }))).toThrow();
  expect(() => assertReviewDeliveryMaterialRights(doc({ sourceRights: { statement: "unconfirmed" } }))).toThrow();
  const prohibited = { model: { source: "bundled", id: "avatar-a" } };
  expect(() => assertReviewDeliveryMaterialRights(doc({ vrmScene: prohibited }))).toThrow();
  expect(() => assertReviewDeliveryMaterialRights(doc({ bg3dScene: { nodes: [], pinnedVersionedCut: {
    source: { linkedVrm: { characters: [{ vrmScene: prohibited }] } },
  } } }))).toThrow();
  const digest = "a".repeat(64);
  expect(assertReviewDeliveryMaterialRights(doc({ vrmScene: { model: { source: "attachment", hash: "sha256:" + digest } } })).models).toEqual(new Set([digest]));
});

function modelBytes(extensions: unknown) {
  const value = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extensions }));
  const length = Math.ceil(value.length / 4) * 4, bytes = Buffer.alloc(20 + length, 32);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); value.copy(bytes, 20);
  return bytes;
}

function model0(commercial: string, actor = "Everyone", license = "CC0") {
  return modelBytes({ VRM: { meta: { title: "작업실 인물", author: "작가", licenseName: license, allowedUserName: actor,
    commercialUssageName: commercial, violentUssageName: "Disallow", sexualUssageName: "Disallow" } } });
}

function actorConsent(actor: "author" | "separately-licensed-person" | "other", confirmedAttributionTexts: string[] = []) {
  return createStudioVrmProjectArchiveUseContextReceipt({ confirmedByUser: true, avatarPermissionBasis: actor,
    confirmedAttributionTexts, excessivelyViolent: "absent", excessivelySexual: "absent", politicalOrReligious: "absent", antisocialOrHate: "absent" });
}

it("상업 허용과 배우 사용 범위를 각각 확인한다", () => {
  expect(() => assertReviewDeliveryVrmLicense(model0("Allow"))).not.toThrow();
  expect(() => assertReviewDeliveryVrmLicense(model0("Allow", "Everyone", "Other"))).not.toThrow();
  expect(() => assertReviewDeliveryVrmLicense(model0("Disallow"))).toThrow();
  for (const [scope, actor] of [["OnlyAuthor", "author"], ["ExplicitlyLicensedPerson", "separately-licensed-person"]] as const) {
    const restricted = model0("Allow", scope);
    expect(() => assertReviewDeliveryVrmLicense(restricted)).toThrow();
    expect(() => assertReviewDeliveryVrmLicense(restricted, actorConsent("other"))).toThrow();
    expect(() => assertReviewDeliveryVrmLicense(restricted, actorConsent(actor))).not.toThrow();
  }
  const personal = modelBytes({ VRMC_vrm: { specVersion: "1.0", humanoid: {}, meta: { name: "작가 모델", authors: ["작가"],
    licenseUrl: STUDIO_VRM_1_PUBLIC_LICENSE_URL, avatarPermission: "everyone", commercialUsage: "personalProfit", creditNotation: "unnecessary" } } });
  expect(() => assertReviewDeliveryVrmLicense(personal, actorConsent("author"))).toThrow();
});

it("CC0 번들 권리 기록은 승인 원고에 배치한 이미지·프레임과 실제로 일치해야 한다", async () => {
  const source = Buffer.from("합성 이미지"), hash = createHash("sha256").update(source).digest("hex");
  const path = "/assets/studio/bundle-renders-v1/assets/bench/prop.webp";
  const credit = { schema: "toonstudio.bundle-source-credit.v1", assetId: "bench", ledgerPackId: "cbv1-008-cute-park-pack",
    contentHash: `sha256:${hash}`, renderPath: path, sourceUrl: "https://rg-poly.itch.io/cute-park-pack", provider: "RG Poly",
    licenseId: "cc0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", licenseName: "CC0",
    serve: "allow", status: "public-domain", commercialUse: true, attributionRequired: false };
  for (const element of [{ type: "frame", bg: path }, { type: "image", src: `data:image/webp;base64,${source.toString("base64")}` },
    { type: "image", src: `toonstudio-asset://sha256/${hash}` }]) {
    expect(() => assertReviewDeliveryMaterialRights(doc({ ...element, bundleSourceCredit: credit }))).not.toThrow();
  }
  for (const element of [{ type: "frame", bg: "#ffffff" }, { type: "image", src: `https://example.org${path}` },
    { type: "image", src: "data:image/webp;base64,AAAA" }, { type: "image", id: "a", src: "work-asset://image/b" }]) {
    expect(() => assertReviewDeliveryMaterialRights(doc({ ...element, bundleSourceCredit: credit }))).toThrow();
  }
  const refs = assertReviewDeliveryMaterialRights(doc({ type: "image", id: "a", src: "work-asset://image/a", bundleSourceCredit: credit }));
  const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
  const client = { query } as unknown as PoolClient;
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", refs)).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledWith(expect.stringContaining("sha256=$3"), ["work-a", "a", hash]);
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-b", refs)).rejects.toThrow();
});

function sealedVrmCut(payload: Buffer) {
  const anchor = "vrmcut-11111111-1111-8111-a111-111111111111";
  const hash = createHash("sha256").update(payload).digest("hex");
  const sceneText = JSON.stringify({ nodes: [], pinnedVersionedCut: { source: { linkedVrm: { characters: [
    { vrmScene: { model: { source: "attachment", hash: `sha256:${hash}` } } },
  ] } } } });
  const row = { sceneText, sceneSha256: createHash("sha256").update(sceneText).digest("hex") };
  const refs = assertReviewDeliveryMaterialRights(doc({ type: "image", id: anchor, src: `work-asset://image/${anchor}` }));
  return { anchor, row, refs };
}

it("상업 이용과 배우 사용이 허용된 첨부 VRM도 필수 출처를 확인한 컷만 납품한다", async () => {
  const payload = model0("Allow", "Everyone", "CC_BY");
  const { row, refs } = sealedVrmCut(payload);
  const verify = (confirmedAttributionTexts: string[]) => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ ...row, rights: actorConsent("other", confirmedAttributionTexts) }] })
      .mockResolvedValueOnce({ rows: [{ payload }] });
    return verifyReviewDeliveryMaterialReferences({ query } as unknown as PoolClient, "work-a", refs);
  };
  await expect(verify([])).rejects.toMatchObject({ response: { code: "studio_review_delivery_material_rights" } });
  await expect(verify(["작업실 인물 · 작가 · CC_BY"])).resolves.toBeUndefined();
});

it("팀 이미지 앵커와 같은 작품·컷의 봉인 장면에서만 배우의 허용 범위를 읽는다", async () => {
  const payload = model0("Allow", "OnlyAuthor");
  const { anchor, row, refs } = sealedVrmCut(payload);
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [{ ...row, rights: actorConsent("author") }] }).mockResolvedValueOnce({ rows: [{ payload }] })
    .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ ...row, rights: actorConsent("other") }] })
    .mockResolvedValueOnce({ rows: [{ payload }] }).mockResolvedValueOnce({ rows: [{ ...row, sceneText: "{}" }] });
  const client = { query } as unknown as PoolClient;
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", refs)).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledWith(expect.stringContaining('cut."pageId"=$2'), ["work-a", "cut-2", anchor]);
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-b", refs)).rejects.toThrow();
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", refs)).rejects.toThrow();
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", refs)).rejects.toThrow();
});


it("6패스 재편집본의 배우와 봉인 컷의 배우가 다르면 사용 확인 기록을 재사용하지 않는다", async () => {
  const anchorId = "vrmcut-11111111-1111-8111-a111-111111111111";
  const source = { nodes: [], pinnedVersionedCut: { source: { linkedVrm: { characters: [{ elementId: "원래 배우" }] } } } };
  const sceneText = JSON.stringify(source), sceneSha256 = createHash("sha256").update(sceneText).digest("hex"), compositeSha256 = "d".repeat(64);
  const manifest = parseStudioBg3dSixPassBundleManifest({ ...bg3dBundleFixture().manifest, contract: STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CONTRACT,
    version: 2, minimumReaderCapability: STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CAPABILITY, workVrmCut: { anchorId, sceneSha256, compositeSha256 } });
  const snapshot = (scene: unknown) => ({ pagesList: [{ id: manifest.pageId, bg3dLtBundles: { contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT,
    version: 1, minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5, bundles: [{ bundleId: manifest.bundleId,
      activeRevisionId: manifest.renderRevisionId, revisions: [manifest] }] }, elements: [{ type: "image", id: manifest.anchorElementId, bg3dScene: scene,
        bg3dLtBundleReference: { role: "main-line", elementId: manifest.anchorElementId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
          manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) } }] }] });
  const client = { query: vi.fn().mockResolvedValue({ rows: [{ sceneText, sceneSha256, compositeSha256, rights: null }] }) } as unknown as PoolClient;
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", assertReviewDeliveryMaterialRights(snapshot(source)))).resolves.toBeUndefined();
  const other = { ...source, pinnedVersionedCut: { source: { linkedVrm: { characters: [{ elementId: "다른 배우" }] } } } };
  await expect(verifyReviewDeliveryMaterialReferences(client, "work-a", assertReviewDeliveryMaterialRights(snapshot(other)))).rejects.toThrow();
});
