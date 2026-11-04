import { STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN } from "@toonstudio/contracts/studio-work-asset-contract";
import { ForbiddenException, PayloadTooLargeException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest, verifyStudioBg3dSixPassBundleReceipt } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { MembershipResourceQuotaError } from "../membership-operations/membership-resource-quota";
import { buildStudioBg3dBundleSealedChain } from "./studio-bg3d-bundle-chain";
import { StudioBg3dBundleService } from "./studio-bg3d-bundle.service";
import { bg3dBundleFixture, bg3dTestObject } from "./studio-bg3d-bundle.test-fixture";
import type { StudioBg3dBundleRecord, StudioBg3dBundleRepository } from "./studio-bg3d-bundle.repository";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";

function fixture() {
  const f = bg3dBundleFixture();
  const record: StudioBg3dBundleRecord = { manifest: f.manifest, manifestHash: hashStudioBg3dSixPassBundleManifest(f.manifest), state: "prepared", sealedAt: null, artifacts: [] };
  const read = vi.fn<StudioBg3dBundleRepository["read"]>().mockResolvedValue(record);
  const prepare = vi.fn<StudioBg3dBundleRepository["prepare"]>().mockResolvedValue(record);
  const storeArtifact = vi.fn<StudioBg3dBundleRepository["storeArtifact"]>().mockImplementation(async (_actor, _key, role, object) => ({ ...record, artifacts: [{ role, object }] }));
  const seal = vi.fn<StudioBg3dBundleRepository["seal"]>().mockResolvedValue({ ...record, state: "sealed", sealedAt: new Date().toISOString() });
  const capabilities = vi.fn<StudioBg3dBundleRepository["capabilities"]>().mockResolvedValue({ schemaReady: true, fileMaxBytes: 10, remainingStorageBytes: 20, remainingDailyUploadBytes: 30 });
  const sealedChain = vi.fn<StudioBg3dBundleRepository["sealedChain"]>().mockResolvedValue(buildStudioBg3dBundleSealedChain({ workId: "work-one", bundleId: f.manifest.bundleId }, [f.manifest]));
  const repository: StudioBg3dBundleRepository = { read, prepare, storeArtifact, seal, capabilities, sealedChain };
  const upload = vi.fn<PrivateObjectStoragePort["uploadImmutable"]>().mockResolvedValue(bg3dTestObject(f.png));
  const signed = vi.fn<PrivateObjectStoragePort["createSignedReadUrl"]>();
  const storage: PrivateObjectStoragePort = { verifyPrivatePurposeBuckets: vi.fn(async () => ({ ready: true as const, privatePurposeBuckets: 3 })), uploadImmutable: upload, createSignedReadUrl: signed, deleteGeneratedObject: vi.fn() };
  const service = new StudioBg3dBundleService(repository, storage);
  const key = { workId: "work-one", bundleId: f.manifest.bundleId, renderRevisionId: f.manifest.renderRevisionId };
  return { ...f, record, read, prepare, storeArtifact, seal, capabilities, upload, signed, service, key, repository, storage,
    sealedChain, file: { buffer: f.png, size: f.png.byteLength, mimetype: "image/png" } };
}
describe("saved work 6패스 전용 입장 서비스", () => {
  beforeEach(() => vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN));
  afterEach(() => vi.unstubAllEnvs());
  it("비활성 입장은 원본 버퍼·저장소·DB를 사용하기 전에 거부한다", async () => {
    const f = fixture(); vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", "false");
    await expect(f.service.prepare("owner", f.key, f.manifest)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.upload("owner", f.key, "color", f.file)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("manifest의 경로·역할·해상도·byte budget이 다르면 준비하지 않는다", async () => {
    const f = fixture();
    await expect(f.service.prepare("owner", { ...f.key, renderRevisionId: "different" }, f.manifest)).rejects.toThrow(/manifest/);
    await expect(f.service.prepare("owner", f.key, { ...f.manifest, layers: f.manifest.layers.slice(0, 5) })).rejects.toThrow(/manifest/);
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("권한 부족·기존 quota 실패는 원격 업로드를 시작하지 않는다", async () => {
    const f = fixture(); f.read.mockRejectedValueOnce(new ForbiddenException("권한 변경"));
    await expect(f.service.upload("viewer", f.key, "color", f.file)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.upload).not.toHaveBeenCalled();
    f.prepare.mockRejectedValueOnce(new MembershipResourceQuotaError("storage", 100, 100, 150));
    await expect(f.service.prepare("owner", f.key, f.manifest)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });
  it("한 출력의 실제 SHA·길이·PNG 구조가 다르면 저장하지 않는다", async () => {
    const f = fixture(), corrupt = Buffer.from(f.png); corrupt[corrupt.length - 1] ^= 1;
    await expect(f.service.upload("owner", f.key, "color", { ...f.file, buffer: corrupt })).rejects.toThrow(/확인하지 못/);
    await expect(f.service.upload("owner", f.key, "color", { ...f.file, size: 1 })).rejects.toThrow(/manifest/);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.storeArtifact).not.toHaveBeenCalled();
  });
  it("업로드 후 권한 재검사가 거부되면 문서 영수증을 성공으로 반환하지 않는다", async () => {
    const f = fixture(); f.storeArtifact.mockRejectedValueOnce(new ForbiddenException("권한 변경"));
    await expect(f.service.upload("owner", f.key, "color", f.file)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.upload).toHaveBeenCalledTimes(1); expect(f.read).toHaveBeenCalledWith("owner", f.key, "edit", undefined);
    expect(f.seal).not.toHaveBeenCalled();
  });
  it("이미 저장한 동일 role 요청은 재업로드 없이 영수증을 반환한다", async () => {
    const f = fixture(); f.read.mockResolvedValue({ ...f.record, artifacts: [{ role: "color", object: bg3dTestObject(f.png) }] });
    const result = await f.service.upload("owner", f.key, "color", f.file);
    expect(result.uploadedRoles).toEqual(["color"]); expect(result.receipt).toBeNull(); expect(f.upload).not.toHaveBeenCalled();
  });
  it("응답 유실은 자동 재전송하지 않고 GET 상태 조회로 재개한다", async () => {
    const f = fixture(); f.upload.mockRejectedValueOnce(new Error("업로드 응답 유실"));
    await expect(f.service.upload("owner", f.key, "color", f.file)).rejects.toThrow(/상태를 조회/);
    expect(f.upload).toHaveBeenCalledTimes(1); expect(f.storeArtifact).not.toHaveBeenCalled();
    expect((await f.service.get("owner", f.key)).uploadedRoles).toEqual([]);
  });
  it("scene SHA가 맞아도 카메라·출력 hash 결박이 다르면 거부한다", async () => {
    const f = fixture(); f.read.mockResolvedValue({ ...f.record, manifest: parseStudioBg3dSixPassBundleManifest({ ...f.manifest, cameraHash: `sha256:${"0".repeat(64)}` }) });
    await expect(f.service.upload("owner", f.key, "scene", { buffer: f.scene, size: f.scene.length, mimetype: "application/json" })).rejects.toThrow(/확인하지 못/);
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("seal 영수증은 작품·원본 manifest에 결박하고 비공개 locator를 포함하지 않는다", async () => {
    const f = fixture(), result = await f.service.seal("owner", f.key);
    expect(() => verifyStudioBg3dSixPassBundleReceipt(result.receipt, f.manifest, f.key.workId)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(/providerId|objectPath|bucket|signedRead/);
  });
  it("봉인 chain은 read ACL을 재사용하고 비공개 locator 없이 완전한 tip을 반환한다", async () => {
    const f = fixture();
    const result = await f.service.sealedChain("viewer", { workId: f.key.workId, bundleId: f.key.bundleId });
    expect(f.sealedChain).toHaveBeenCalledWith("viewer", { workId: f.key.workId, bundleId: f.key.bundleId });
    expect(result).toMatchObject({ sealedTipRevisionId: f.manifest.renderRevisionId, revisions: [f.manifest] });
    expect(JSON.stringify(result)).not.toMatch(/objectPath|signedRead|providerId/);
    f.sealedChain.mockRejectedValueOnce(new ForbiddenException("권한 변경"));
    await expect(f.service.sealedChain("outsider", { workId: f.key.workId, bundleId: f.key.bundleId })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("chain 응답의 work·bundle·tip이 요청과 다르면 적용 근거로 반환하지 않는다", async () => {
    const f = fixture();
    f.sealedChain.mockResolvedValueOnce({ version: 1, workId: "other-work", bundleId: f.key.bundleId,
      sealedTipRevisionId: f.manifest.renderRevisionId, revisions: [f.manifest] });
    await expect(f.service.sealedChain("viewer", { workId: f.key.workId, bundleId: f.key.bundleId })).rejects.toThrow(/응답/);
  });
  it("capability는 현재 quota를 낮추거나 늘리지 않고 비활성 상태를 표시한다", async () => {
    const f = fixture(); vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", "false");
    expect(await f.service.capabilities("viewer", f.key.workId)).toMatchObject({ enabled: false, maximumPngBytes: 67108864, maximumPngTotalBytes: 402653184, fileMaxBytes: 10, remainingStorageBytes: 20 });
    f.capabilities.mockResolvedValueOnce({ schemaReady: false, fileMaxBytes: 10, remainingStorageBytes: 20, remainingDailyUploadBytes: 30 });
    vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN);
    expect((await f.service.capabilities("owner", f.key.workId)).enabled).toBe(false);
  });
});
