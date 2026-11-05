import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "../bg3d/studio-bg3d-bundle-project.test-fixture";
import * as product from "../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-product-authority";
import * as line from "../studio-linked-3d-pass-product-authority";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";
import { FakeRoom } from "./studio-crdt-room-binding.test-support";
import { publishStudioCrdtSceneGraphDiff, publishStudioCrdtDrawGraphDiff } from "./studio-crdt-scene-publisher";
import { StudioMemoryBroadcastHub, StudioBroadcastChannelTransport } from "./studio-live-collaboration-transport";
import { StudioCrdtLocalReaderFence } from "./studio-crdt-local-reader-fence";
import { applyStudioCrdtBg3dReaderUpdate, studioCrdtBg3dReaderMetadata, studioCrdtPeerSyncResponse } from "./studio-crdt-bg3d-reader-fence";
import { createStudioCrdtLocalWireMessage, encodeStudioCrdtUpdate, parseStudioCrdtLocalWireMessage, STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtTransportMessage } from "./studio-crdt-protocol";
import type { StudioLiveRoom } from "./studio-live-collaboration-room";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";

const CAP = "bg3d-sixpass-bundle.v1";
const meta = { readerCapabilities: [CAP], requiredReaderCapabilities: [CAP], artifactScope: "origin" as const };
const update = { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", updateId: "00000000-0000-4000-8000-000000000004", serverSequence: "0", update: "AAA=" };
const message = { kind: "update" as const, workId: "work-a", senderSessionId: "alice", targetSessionId: null, payload: update };

describe("archive 없는 v7 보존 획 reader 경계", () => {
  const preserved = "legacy-pigment-preservation.v1";
  function pages(preserve: boolean) {
    return [{ id: "page-a", elements: [{ id: "draw-a", type: "draw" as const,
      points: [0, 0, 7, 8], stroke: "#000000", strokeWidth: 2,
      ...(preserve ? { colorizeMaskEnabled: false } : {}) }] }];
  }
  it("raw v7과 삭제 이력의 요구 capability를 광고하고 구 peer의 sync를 본문 없이 거부한다", () => {
    const source = new StudioCrdtDocument();
    try {
      publishStudioCrdtDrawGraphDiff(source, [], pages(true));
      for (const deleted of [false, true]) {
        if (deleted) source.deleteStroke("draw-a");
        const metadata = studioCrdtBg3dReaderMetadata(source);
        expect(metadata.requiredReaderCapabilities).toEqual([preserved]); expect(metadata).not.toHaveProperty("artifactScope");
        const input = { document: source, workId: "work-a", transferId: "transfer", sequence: 1,
          request: { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: "sync-a", stateVector: "AA==", readerCapabilities: [CAP] } };
        expect(studioCrdtPeerSyncResponse(input)).toBeNull();
        expect(studioCrdtPeerSyncResponse({ ...input, request: { ...input.request, readerCapabilities: [CAP, preserved] } }))
          .toMatchObject({ requiredReaderCapabilities: [preserved] });
      }
    } finally { source.destroy(); }
  });
  it("부모 key가 생략된 v1→v7 증분도 실제 적용 전에 요구 메타를 확인한다", () => {
    const source = new StudioCrdtDocument(), target = new StudioCrdtDocument();
    try {
      publishStudioCrdtDrawGraphDiff(source, [], pages(false)); target.applyUpdate(source.encodeStateAsUpdate());
      const vector = target.encodeStateVector();
      publishStudioCrdtDrawGraphDiff(source, pages(false), pages(true));
      expect(source.getStroke("draw-a")?.payload.version).toBe(7);
      const bytes = source.encodeStateAsUpdate(vector), apply = vi.fn(() => target.applyUpdate(bytes));
      expect(() => applyStudioCrdtBg3dReaderUpdate(target, bytes, {}, "work-a", false, { isActive: () => true, apply })).toThrow(/reader/);
      expect(apply).not.toHaveBeenCalled(); expect(target.getStroke("draw-a")?.payload.version).toBe(1);
      expect(applyStudioCrdtBg3dReaderUpdate(target, bytes, studioCrdtBg3dReaderMetadata(source), "work-a", false,
        { isActive: () => true, apply })).toBeNull();
      expect(target.getStroke("draw-a")?.payload).toMatchObject({ version: 7, extensions: { colorizeMaskEnabled: false } });
    } finally { source.destroy(); target.destroy(); }
  });
  it("일반 좌표값 7은 v7 요구로 오인하지 않고 기존 동기 적용을 유지한다", () => {
    const source = new StudioCrdtDocument(), target = new StudioCrdtDocument();
    try {
      publishStudioCrdtDrawGraphDiff(source, [], pages(false)); const bytes = source.encodeStateAsUpdate();
      expect(applyStudioCrdtBg3dReaderUpdate(target, bytes, {}, "work-a", false,
        { isActive: () => true, apply: () => target.applyUpdate(bytes) })).toBeNull();
      expect(target.getStroke("draw-a")?.payload.version).toBe(1);
    } finally { source.destroy(); target.destroy(); }
  });
  it.each([false, true])("sender 광고 없는 요구 계약은 authoritative=%s일 때 서버 응답으로만 받는다", (authoritative) => {
    const source = new StudioCrdtDocument(), target = new StudioCrdtDocument();
    try {
      publishStudioCrdtDrawGraphDiff(source, [], pages(true)); const bytes = source.encodeStateAsUpdate();
      const apply = () => applyStudioCrdtBg3dReaderUpdate(target, bytes, { requiredReaderCapabilities: [preserved] }, "work-a", authoritative,
        { isActive: () => true, apply: () => target.applyUpdate(bytes) });
      if (authoritative) { expect(apply()).toBeNull(); expect(target.getStroke("draw-a")?.payload.version).toBe(7); }
      else { expect(apply).toThrow(/reader/); expect(target.getStrokes()).toEqual([]); }
    } finally { source.destroy(); target.destroy(); }
  });
  it("로컬 봉투도 BG3D만 지원하는 광고와 요구 메타 없는 구 update를 거부한다", () => {
    const fence = new StudioCrdtLocalReaderFence("work-a", "alice", () => {});
    const metadata = { readerCapabilities: [CAP, preserved], requiredReaderCapabilities: [preserved] };
    expect(fence.decorate({ ...message, payload: { ...update, ...metadata } })).toMatchObject(metadata);
    const request = createStudioCrdtLocalWireMessage({ kind: "sync-request", workId: "work-a", senderSessionId: "old", targetSessionId: null,
      payload: { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: "sync-old", stateVector: "AA==" } });
    fence.receiveAdvertisement({ brand: "toonspectrum:studio-crdt-readers:v1", workId: "work-a", senderSessionId: "old", readerCapabilities: [CAP] });
    expect(fence.accept(request)).toBeNull();
    expect(fence.accept(createStudioCrdtLocalWireMessage({ ...message, senderSessionId: "old" }))).toBeNull();
  });
});

describe("구 reader와 신규 6패스 reader 경계", () => {
  it("일반 v8 메시지 키는 유지하고 새 기능 봉투는 구 exact-key reader가 거절한다", () => {
    const fence = new StudioCrdtLocalReaderFence("work-a", "alice", () => {});
    expect(fence.decorate(message)).toEqual(createStudioCrdtLocalWireMessage(message));
    const feature = fence.decorate({ ...message, payload: { ...update, ...meta } });
    expect(parseStudioCrdtLocalWireMessage(feature)).not.toBeNull();
    const oldKeys = ["brand", "kind", "payload", "protocolVersion", "senderSessionId", "targetSessionId", "workId"].sort();
    expect(Object.keys(feature).sort()).not.toEqual(oldKeys);
    expect(feature).toMatchObject(meta);
    expect(fence.decorate(message)).toMatchObject(meta);
  });
  it("retained 문서는 old update·sync를 거부하고 별도 reader 광고를 한 새 peer의 sync만 허용한다", () => {
    const fence = new StudioCrdtLocalReaderFence("work-a", "alice", () => {});
    fence.decorate({ ...message, payload: { ...update, ...meta } });
    expect(fence.accept(createStudioCrdtLocalWireMessage({ ...message, senderSessionId: "old-peer" }))).toBeNull();
    const request = createStudioCrdtLocalWireMessage({ kind: "sync-request", workId: "work-a", senderSessionId: "new-peer", targetSessionId: null,
      payload: { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: "sync-1", stateVector: "AA==" } });
    expect(fence.accept(request)).toBeNull();
    expect(fence.receiveAdvertisement({ brand: "toonspectrum:studio-crdt-readers:v1", workId: "work-a", senderSessionId: "new-peer", readerCapabilities: [CAP] })).toBe(true);
    expect(fence.accept(request)).toMatchObject({ payload: { readerCapabilities: [CAP] } });
  });
});

describe("실제 binding의 native 본문 입장 전 CRDT 교체 차단", () => {
  beforeEach(() => vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))));
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  async function setup(missing: boolean, scoped?: ReturnType<typeof createStudioScopedWriteFixture>) {
    const f = await createBg3dBundleProjectFixture(missing), source = new StudioCrdtDocument(), target = new StudioCrdtDocument(), empty = new StudioCrdtDocument();
    publishStudioCrdtSceneGraphDiff(source, [], f.project.pagesList);
    vi.spyOn(product, "acquireStudioBg3dSixPassBundleProductAuthority").mockResolvedValue(missing ? createBg3dBundleTestAuthority() : f.authority);
    vi.spyOn(product, "runStudioBg3dSixPassBundleMutationExclusive").mockImplementation(async <T>(_scope: string, task: () => Promise<T>) => await task());
    vi.spyOn(line, "acquireStudioLinked3dPassProductAuthority").mockResolvedValue(f.authority);
    const room = new FakeRoom(empty, "local"), statuses: { state: string }[] = [];
    if (scoped) room.workId = scoped.authority.workId;
    const binding = new StudioCrdtRoomBinding({ document: target, room: room as unknown as StudioLiveRoom, canEdit: false,
      scopedWrite: scoped?.authority, onStatus: (status) => statuses.push(status) });
    await binding.start();
    const send = (metadata: typeof meta | Record<string, never>) => {
      const event: StudioCrdtTransportMessage = { type: "update", senderSessionId: "peer", update: { ...update,
        workId: room.workId, update: encodeStudioCrdtUpdate(source.encodeStateAsUpdate()), ...metadata } };
      for (const listener of room.crdtListeners) listener(event);
    };
    return { f, source, target, empty, binding, statuses, send, close: () => { binding.close(); source.destroy(); target.destroy(); empty.destroy(); } };
  }
  it("새 native 영수증 없는 feature 업데이트와 marker 없는 old 업데이트는 실제 Y 문서에 들어가지 않는다", async () => {
    const f = await setup(true);
    try {
      f.send({}); await vi.waitFor(() => expect(f.statuses.at(-1)?.state).toBe("error")); expect(f.target.getSceneElements()).toEqual([]);
      f.send(meta); await vi.waitFor(() => expect(f.statuses.filter((entry) => entry.state === "error")).toHaveLength(2));
      expect(f.target.getSceneElements()).toEqual([]); expect(f.target.getPages()).toEqual([]);
    } finally { f.close(); }
  });
  it("7본문·manifest native 입장이 끝난 후 실제 Y 문서에 여섯 역할을 한 번 적용한다", async () => {
    const f = await setup(false);
    try {
      f.send(meta); expect(f.target.getSceneElements()).toEqual([]);
      await vi.waitFor(() => expect(f.target.getSceneElements()).toHaveLength(6));
      expect(f.target.getPages()[0].bg3dLtBundleReferences?.active["bundle-1"]).toBe("rev-1");
      expect(f.statuses.filter((entry) => entry.state === "error")).toEqual([]);
    } finally { f.close(); }
  });
  it("native 본문 입장 뒤에만 현재 room의 여섯 역할·그룹을 권한의 실재 ID로 조회한다", async () => {
    const scoped = createStudioScopedWriteFixture(); scoped.choose();
    const f = await setup(false, scoped);
    const page = f.f.project.pagesList[0];
    try {
      for (const element of page.elements) expect(scoped.authority.hasCurrentLiveEntity("element", element.id)).toBe(false);
      f.send(meta);
      await vi.waitFor(() => expect(f.target.getSceneElements()).toHaveLength(6));
      for (const element of page.elements) {
        expect(scoped.authority.hasCurrentLiveEntity("element", element.id)).toBe(true);
        expect(scoped.authority.hasCurrentLiveEntity("element", element.id, "target-2")).toBe(false);
      }
      expect(scoped.authority.hasCurrentLiveEntity("group", f.f.manifest.groupId)).toBe(true);
      f.binding.close();
      for (const element of page.elements) expect(scoped.authority.hasCurrentLiveEntity("element", element.id)).toBe(false);
      expect(f.statuses.filter((entry) => entry.state === "error")).toEqual([]);
    } finally { f.close(); }
  });
});


describe("실제 BroadcastChannel transport의 reader 협상", () => {
  it("구peer sync는 응답하지 않고 새 빈 탭의 광고 후 origin snapshot을 전달한다", async () => {
    const hub = new StudioMemoryBroadcastHub();
    const make = (sessionId: string) => new StudioBroadcastChannelTransport("reader-room", hub.create,
      { workId: "work-a", participant: { sessionId, displayName: sessionId, role: "editor" } }, { syncTimeoutMs: 100 });
    const a = make("alice"), b = make("bob"); await a.connect(); await b.connect();
    const requests: string[] = [];
    a.subscribeCrdt((event) => { if (event.type === "sync-request") {
      requests.push(event.senderSessionId);
      a.respondCrdtSync({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: event.request.requestId,
        transferId: "00000000-0000-4000-8000-000000000022", chunks: ["AAA="], chunkCount: 1, totalBytes: 2,
        serverStateVector: "AA==", serverSequence: "0", ...meta }, event.senderSessionId);
    } });
    try {
      await a.publishCrdtUpdate({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", updateId: update.updateId,
        clientSequence: 1, update: update.update, ...meta });
      const old = hub.create("reader-room");
      old.postMessage(createStudioCrdtLocalWireMessage({ workId: "work-a", senderSessionId: "old-peer", targetSessionId: null, kind: "sync-request",
        payload: { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: "old-sync", stateVector: "AA==" } }));
      expect(requests).toEqual([]);
      const result = await b.requestCrdtSync({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-a", requestId: "new-sync", stateVector: "AA==" });
      expect(requests).toEqual(["bob"]); expect(result).toMatchObject(meta); old.close();
    } finally { a.close(); b.close(); }
  });
});
