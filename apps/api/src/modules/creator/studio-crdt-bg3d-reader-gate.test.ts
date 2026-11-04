import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import * as Y from "yjs";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { StudioCrdtService } from "./studio-crdt.service";
import { StudioBg3dReaderUpgradeRequiredError } from "./studio-bg3d-reader-capability";
import { assertStudioBg3dBundleReaderInTransaction } from "./studio-bg3d-bundle.repository";
import { performJoin } from "./studio-live-gateway-join";
import { MemoryStudioCrdtRepository, MemoryStudioCrdtClusterLoadRepository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences } from "../../../../../tests/integration/api-web/api/modules/creator/studio-crdt.service.test-support";
import type { StudioBg3dBundleService } from "./studio-bg3d-bundle.service";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveSocket } from "./studio-live.protocol";

vi.mock("./studio-bg3d-bundle.repository", () => ({ STUDIO_BG3D_BUNDLE_REPOSITORY: Symbol("test repository"), assertStudioBg3dBundleReaderInTransaction: vi.fn(),
  readStudioBg3dBundleRecordInTransaction: vi.fn(), verifyStudioBg3dSealedReferencesInTransaction: vi.fn() }));
const services: StudioCrdtService[] = [];
function harness() {
  const repository = new MemoryStudioCrdtRepository();
  const bundles = { hasRetainedBundles: vi.fn(async () => true), assertReaderCapability: vi.fn(async (_workId: string, readers: readonly string[]) => {
    if (!readers.includes(CAP)) throw new StudioBg3dReaderUpgradeRequiredError();
  }) };
  const service = new StudioCrdtService(repository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences, new MemoryStudioCrdtClusterLoadRepository(), {}, undefined, bundles as unknown as StudioBg3dBundleService);
  services.push(service); return { repository, bundles, service };
}
afterEach(() => { for (const service of services.splice(0)) service.onModuleDestroy(); vi.resetAllMocks(); });
describe("6패스 작품 reader capability gate", () => {
  it("보존 원본이 있는 작품의 구 reader sync와 쓰기를 거부하고 지원 reader에게만 요구 계약을 보낸다", async () => {
    const h = harness(); await expect(h.service.syncBytes("work-one")).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    await expect(h.service.syncBytes("work-one", null, [CAP])).resolves.toMatchObject({ requiredReaderCapabilities: [CAP] });
    const doc = new Y.Doc(); doc.getMap("metadata").set("example", true);
    await expect(h.service.applyUpdateBytes({ workId: "work-one", actorUserId: "actor", updateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data: Y.encodeStateAsUpdate(doc) })).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    expect(h.repository.receipts.size).toBe(0); doc.destroy();
  });
  it("사전 읽기 뒤 생긴 retained feature도 실제 append transaction에서 구 reader 쓰기를 거부한다", async () => {
    const h = harness(); h.bundles.assertReaderCapability.mockResolvedValue(undefined); h.bundles.hasRetainedBundles.mockResolvedValue(false);
    vi.mocked(assertStudioBg3dBundleReaderInTransaction).mockRejectedValueOnce(new ConflictException({ code: "studio_bg3d_reader_upgrade_required" }));
    const doc = new Y.Doc(); doc.getMap("metadata").set("example", true);
    await expect(h.service.applyUpdateBytes({ workId: "work-one", actorUserId: "actor", updateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data: Y.encodeStateAsUpdate(doc) })).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    expect(assertStudioBg3dBundleReaderInTransaction).toHaveBeenCalledWith(h.repository.validationTransaction, "work-one", []);
    expect(h.repository.receipts.size).toBe(0); doc.destroy();
  });
  it("기능 작품의 구 reader는 adapter room 참가 전 거부한다", async () => {
    const principal = { userId: "actor" }, join = vi.fn(), disconnectInvalidJoinSession = vi.fn();
    const client = { id: "old", data: {}, join, emit: vi.fn() } as unknown as StudioLiveSocket;
    const host = { isCurrentJoinTransition: () => true, socketAuthentication: { revalidate: async () => true, principal: () => principal },
      isSocketPrincipalCurrent: () => true, hasUserConnectionCapacity: () => true,
      creatorService: { getWorkTeam: async () => ({ workId: "work-one", viewer: { userId: "actor", status: "active", capabilities: { view: true } } }) },
      studioCrdtService: { assertReaderCapability: async () => { throw new StudioBg3dReaderUpgradeRequiredError(); } },
      disconnectInvalidJoinSession, logger: { warn: vi.fn() } } as unknown as StudioLiveGatewayHost;
    await expect(performJoin.call(host, client, { workId: "work-one", clientInstanceId: "old-client" }, 1)).resolves.toMatchObject({ ok: false, code: "reader_upgrade_required", requiredReaderCapabilities: [CAP] });
    expect(join).not.toHaveBeenCalled(); expect(disconnectInvalidJoinSession).toHaveBeenCalledWith(client);
  });
});
