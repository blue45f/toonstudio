import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { createBg3dBundleProjectFixture } from "../bg3d/studio-bg3d-bundle-project.test-fixture";
import type { StudioCrdtSceneGraphFrontier } from "./studio-crdt-history";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { asStudioCrdtDocumentHost } from "./studio-crdt-document-host";
import { publishStudioCrdtSceneGraphDiff, publishStudioCrdtDrawGraphDiff } from "./studio-crdt-scene-publisher";
import { studioCrdtBg3dReaderMetadata, studioCrdtPeerSyncResponse } from "./studio-crdt-bg3d-reader-fence";
import { STUDIO_CRDT_ORIGIN_REMOTE, STUDIO_CRDT_PROTOCOL_VERSION, encodeStudioCrdtUpdate, type StudioCrdtRemoteUpdate } from "./studio-crdt-protocol";
import { StudioCrdtRoomBinding, type StudioCrdtBindingStatus } from "./studio-crdt-room-binding";
import { add, FakeRoom, room } from "./studio-crdt-room-binding.test-support";

const { hydrate } = vi.hoisted(() => ({ hydrate: vi.fn() }));
vi.mock("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration", () => ({ hydrateStudioBg3dSixPassFrontier: hydrate }));
const metadata = { requiredReaderCapabilities: [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY], artifactScope: "work" as const };
const hydrated = (frontier: StudioCrdtSceneGraphFrontier) => ({ frontier, sources: new Map<string, never>() });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

async function fixture(start = true) {
  const bundle = await createBg3dBundleProjectFixture();
  const server = new StudioCrdtDocument();
  publishStudioCrdtSceneGraphDiff(server, [], bundle.project.pagesList);
  const client = new StudioCrdtDocument();
  const peerA = new StudioCrdtDocument(server.encodeStateAsUpdate());
  const peerB = new StudioCrdtDocument(server.encodeStateAsUpdate());
  const fake = new FakeRoom(server);
  const requestSync = fake.requestCrdtSync.bind(fake);
  vi.spyOn(fake, "requestCrdtSync").mockImplementation(async (request) => ({ ...await requestSync(request), ...metadata }));
  const statuses: StudioCrdtBindingStatus[] = [];
  const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake), onStatus: (status) => statuses.push(status) });
  hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => hydrated(frontier));
  if (start) await binding.start(); hydrate.mockClear();
  function update(peer: StudioCrdtDocument, id: string, sequence: number): StudioCrdtRemoteUpdate {
    const base = peer.encodeStateVector(); add(peer, id, sequence);
    const bytes = peer.encodeStateAsUpdate(base); server.applyUpdate(bytes); fake.serverSequence = sequence;
    return { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: fake.workId, updateId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      serverSequence: String(sequence), update: encodeStudioCrdtUpdate(bytes), ...metadata };
  }
  function deliver(update: StudioCrdtRemoteUpdate) {
    return Promise.all([...fake.crdtListeners].map((listener) => listener({ type: "update", update, senderSessionId: update.updateId })));
  }
  return { client, server, peerA, peerB, fake, binding, statuses, update, deliver,
    close() { binding.close(); for (const doc of [client, server, peerA, peerB]) doc.destroy(); } };
}

describe("6패스 복원 중 원격 업데이트의 입장 순서", () => {
  it("최신 v6 sync가 추월한 v7 업데이트는 정상 pending에 요구만 남겨 구 peer를 차단하지 않는다", async () => {
    const f = await fixture(false), pendingSource = new StudioCrdtDocument();
    const programs = { version: 1 as const, oil: { bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false } };
    const draw = (stroke: string, preserve = false) => ({ id: "draw-a", type: "draw" as const, points: [0, 0, 7, 8], stroke, strokeWidth: 2,
      brushEnginePrograms: programs, ...(preserve ? { psdGroupId: "psd-group" } : {}) });
    const pages = (stroke: string, preserve = false) => [{ id: "page-1", bg: "#fff", bgGrad: null, canvasH: 1080, elements: [draw(stroke, preserve)] }];
    const base = pages("#000000"), rich = pages("#112233", true), latest = pages("#abcdef");
    const oldSync = () => studioCrdtPeerSyncResponse({ document: f.client, workId: f.fake.workId, transferId: "old-sync", sequence: 2, scope: () => "work",
      request: { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: f.fake.workId, requestId: "old", stateVector: "AA==", readerCapabilities: [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY] } });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    try {
      publishStudioCrdtDrawGraphDiff(f.server, [], base); await f.binding.start();
      publishStudioCrdtDrawGraphDiff(pendingSource, [], base); const pendingVector = pendingSource.encodeStateVector();
      publishStudioCrdtDrawGraphDiff(pendingSource, base, latest);
      f.client.applyUpdate(pendingSource.encodeStateAsUpdate(pendingVector), STUDIO_CRDT_ORIGIN_REMOTE);
      const doc = asStudioCrdtDocumentHost(f.client).doc;
      expect(doc.store.pendingStructs).not.toBeNull();
      expect(studioCrdtBg3dReaderMetadata(f.client).requiredReaderCapabilities).toEqual([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY]);
      expect(oldSync()).not.toBeNull();
      hydrate.mockClear(); let calls = 0;
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => {
        if (++calls === 1) await gate;
        return hydrated(frontier);
      });
      const vector = f.server.encodeStateVector(); publishStudioCrdtDrawGraphDiff(f.server, base, rich);
      expect(f.server.getStroke("draw-a")?.payload.version).toBe(7); f.fake.serverSequence = 1;
      const incoming = f.deliver({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: f.fake.workId,
        updateId: "00000000-0000-4000-8000-000000000001", serverSequence: "1", update: encodeStudioCrdtUpdate(f.server.encodeStateAsUpdate(vector)),
        ...studioCrdtBg3dReaderMetadata(f.server, () => "work") });
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      publishStudioCrdtDrawGraphDiff(f.server, rich, latest); expect(f.server.getStroke("draw-a")?.payload.version).toBe(6);
      f.fake.serverSequence = 2; await f.binding.syncNow();
      const snapshot = f.client.encodeStateAsUpdate(), stateVector = f.client.encodeStateVector(), pending = doc.store.pendingStructs?.update.slice();
      const apply = vi.spyOn(f.client, "applyUpdateBase64"); release(); await incoming;
      expect(apply).not.toHaveBeenCalled(); expect(f.client.encodeStateAsUpdate()).toEqual(snapshot);
      expect(f.client.encodeStateVector()).toEqual(stateVector); expect(doc.store.pendingStructs?.update).toEqual(pending);
      expect(f.client.getStroke("draw-a")?.payload).toMatchObject({ version: 6, stroke: "#abcdef" });
      expect(studioCrdtBg3dReaderMetadata(f.client).requiredReaderCapabilities).toEqual([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY]);
      expect(oldSync()).not.toBeNull(); expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
    } finally { release(); pendingSource.destroy(); f.close(); }
  });
  it("서로 다른 두 클라이언트의 연속 변경을 다음 주기 동기화 없이 모두 적용한다", async () => {
    const f = await fixture();
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const syncCount = f.fake.syncRequests;
      const first = f.deliver(f.update(f.peerA, "peer-a-stroke", 1));
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      const second = f.deliver(f.update(f.peerB, "peer-b-stroke", 2));
      release(); await Promise.all([first, second]);
      expect(f.client.getStroke("peer-a-stroke")).not.toBeNull();
      expect(f.client.getStroke("peer-b-stroke")).not.toBeNull();
      expect(hydrate).toHaveBeenCalledTimes(2);
      expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
      expect(f.fake.syncRequests).toBe(syncCount);
      expect(f.fake.publications).toHaveLength(0);
    } finally { f.close(); }
  });

  it("거부된 본문 다음에 도착한 정상 업데이트도 검증하며 적용한다", async () => {
    const f = await fixture();
    try {
      hydrate.mockRejectedValueOnce(new Error("본문 hash 불일치"));
      const first = f.deliver(f.update(f.peerA, "rejected-stroke", 1));
      const second = f.deliver(f.update(f.peerB, "accepted-stroke", 2));
      await Promise.all([first, second]);
      expect(f.client.getStroke("rejected-stroke")).toBeNull();
      expect(f.client.getStroke("accepted-stroke")).not.toBeNull();
      expect(f.statuses.some(({ state, message }) => state === "error" && message === "본문 hash 불일치")).toBe(true);
    } finally { f.close(); }
  });

  it("원고를 닫으면 복원 대기와 뒤따르는 원격 변경을 적용하지 않는다", async () => {
    const f = await fixture();
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const first = f.deliver(f.update(f.peerA, "late-a", 1));
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      const second = f.deliver(f.update(f.peerB, "late-b", 2));
      f.binding.close(); release(); await Promise.all([first, second]);
      expect(f.client.getStroke("late-a")).toBeNull(); expect(f.client.getStroke("late-b")).toBeNull();
    } finally { f.close(); }
  });
  it("전체 동기화 복원 중 도착한 원격 변경도 즉시 보존한다", async () => {
    const f = await fixture();
    try {
      f.update(f.peerA, "sync-peer-a", 1);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const syncing = f.binding.syncNow();
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      const incoming = f.deliver(f.update(f.peerB, "during-sync-peer-b", 2));
      release(); await Promise.all([syncing, incoming]);
      expect(f.client.getStroke("sync-peer-a")).not.toBeNull();
      expect(f.client.getStroke("during-sync-peer-b")).not.toBeNull();
      expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
      expect(f.fake.publications).toHaveLength(0);
    } finally { f.close(); }
  });

  it.each(["update", "sync"] as const)("%s 복원 중 로컬 편집이 생겨도 원격 변경을 최신 원고에 다시 검증한다", async (kind) => {
    const f = await fixture();
    try {
      const remote = f.update(f.peerA, `remote-during-${kind}`, 1);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const receiving = kind === "update" ? f.deliver(remote) : f.binding.syncNow();
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      add(f.client, `local-during-${kind}`, 3);
      expect(f.client.getStroke(`local-during-${kind}`)).not.toBeNull();
      release(); await receiving;
      expect(f.client.getStroke(`remote-during-${kind}`)).not.toBeNull();
      expect(f.client.getStroke(`local-during-${kind}`)).not.toBeNull();
      expect(hydrate).toHaveBeenCalledTimes(2);
      expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
    } finally { f.close(); }
  });

  it("늦은 이전 동기화 응답으로 서버 순번을 되돌리거나 원격 변경을 재발행하지 않는다", async () => {
    const f = await fixture();
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementationOnce(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const syncing = f.binding.syncNow();
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      await f.deliver(f.update(f.peerA, "newer-a", 1));
      const second = f.update(f.peerB, "newer-b", 2);
      await f.deliver(second);
      release(); await syncing;
      const admissions = hydrate.mock.calls.length;
      await f.deliver(second);
      expect(hydrate).toHaveBeenCalledTimes(admissions);
      expect(f.client.getStroke("newer-a")).not.toBeNull(); expect(f.client.getStroke("newer-b")).not.toBeNull();
      expect(f.fake.publications).toHaveLength(0);
      expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
    } finally { f.close(); }
  });

  it("재검증 중에도 봉인 revision 교체와 구 reader·잘못된 권위 범위를 거부한다", async () => {
    const f = await fixture();
    try {
      const roots = asStudioCrdtDocumentHost(f.peerA).doc.getMap<string>("studio-bg3d-bundle-revisions-v1");
      const entry = roots.entries().next().value;
      if (!entry) throw new Error("봉인 fixture가 없습니다.");
      const [key, original] = entry;
      const base = f.peerA.encodeStateVector();
      roots.set(key, `${original} `);
      const invalid = { ...f.update(f.peerB, "reader-control", 1), update: encodeStudioCrdtUpdate(f.peerA.encodeStateAsUpdate(base)) };
      await f.deliver(invalid);
      expect(asStudioCrdtDocumentHost(f.client).doc.getMap<string>("studio-bg3d-bundle-revisions-v1").get(key)).toBe(original);
      expect(f.statuses.some(({ state, message }) => state === "error" && message.includes("봉인"))).toBe(true);
      const valid = f.update(f.peerB, "reader-control-two", 2);
      await f.deliver({ ...valid, requiredReaderCapabilities: [] });
      await f.deliver({ ...valid, artifactScope: "origin" });
      expect(f.client.getStroke("reader-control-two")).toBeNull();
      expect(hydrate).not.toHaveBeenCalled();
    } finally { f.close(); }
  });

  it("Yjs 삭제로 state vector가 그대로여도 최신 상태를 다시 검증한다", async () => {
    const f = await fixture();
    try {
      const notes = asStudioCrdtDocumentHost(f.client).doc.getMap<string>("admission-test-notes");
      asStudioCrdtDocumentHost(f.client).doc.transact(() => notes.set("temporary", "note"), STUDIO_CRDT_ORIGIN_REMOTE);
      const remote = f.update(f.peerA, "remote-after-delete", 1);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementation(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const receiving = f.deliver(remote);
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      const before = f.client.getStateVectorBase64();
      asStudioCrdtDocumentHost(f.client).doc.transact(() => notes.delete("temporary"), STUDIO_CRDT_ORIGIN_REMOTE);
      expect(f.client.getStateVectorBase64()).toBe(before);
      release(); await receiving;
      expect(hydrate).toHaveBeenCalledTimes(2);
      expect(notes.has("temporary")).toBe(false);
      expect(f.client.getStroke("remote-after-delete")).not.toBeNull();
    } finally { f.close(); }
  });

  it("최신 shadow의 본문 검증이 실패하면 로컬 편집만 보존하고 원격 변경을 거부한다", async () => {
    const f = await fixture();
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementationOnce(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); })
        .mockRejectedValueOnce(new Error("최신 shadow 본문 hash 불일치"));
      const receiving = f.deliver(f.update(f.peerA, "invalid-latest", 1));
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      add(f.client, "retained-local", 3);
      release(); await receiving;
      expect(hydrate).toHaveBeenCalledTimes(2);
      expect(f.client.getStroke("retained-local")).not.toBeNull();
      expect(f.client.getStroke("invalid-latest")).toBeNull();
      expect(f.statuses.some(({ state, message }) => state === "error" && message === "최신 shadow 본문 hash 불일치")).toBe(true);
    } finally { f.close(); }
  });

  it("최초 동기화 순번을 알기 전에 받은 원격 변경도 로컬 변경으로 재발행하지 않는다", async () => {
    const f = await fixture(false);
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      hydrate.mockImplementationOnce(async (frontier: StudioCrdtSceneGraphFrontier) => { await gate; return hydrated(frontier); });
      const starting = f.binding.start();
      await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
      await f.deliver(f.update(f.peerA, "initial-sync-remote", 1));
      release(); await starting;
      expect(f.client.getStroke("initial-sync-remote")).not.toBeNull();
      expect(f.fake.publications).toHaveLength(0);
      expect((await f.binding.flushAndWaitForAuthoritativeAck()).serverSequence).toBe("1");
      expect(f.fake.publications).toHaveLength(0);
      expect(f.statuses.filter(({ state }) => state === "error")).toEqual([]);
    } finally { f.close(); }
  });

});
