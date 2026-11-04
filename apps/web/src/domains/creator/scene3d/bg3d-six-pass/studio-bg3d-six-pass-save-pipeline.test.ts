import { beforeEach, describe, expect, it, vi } from "vitest";
import { runStudioPageSavePipeline, type StudioPageSavePipelineDeps } from "../../studio-page-save-pipeline";
import { createBg3dBundleProjectFixture } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import type { StudioDraftCollaborationIdentity } from "../../studio-draft-collaboration";
import type { CreatorDraftCollaborationRoomResponse } from "../../creator-draft-collaboration-client";
import type Konva from "konva";

const calls = vi.hoisted(() => ({ events: [] as string[], ensure: vi.fn(), update: vi.fn(), promote: vi.fn(), provision: vi.fn(),
  create: vi.fn(), retire: vi.fn(), clear: vi.fn(), error: vi.fn() }));
vi.mock("../../studio-linked-3d-pass-cloud-project", () => ({ ensureStudioLinked3dPassCloudProject: calls.ensure }));
vi.mock("@/platform/creator-client", () => ({ createWork: calls.create, updateWork: calls.update,
  getWork: vi.fn(async (id: string) => ({ id, revision: 1 })) }));
vi.mock("../../creator-draft-collaboration-client", () => ({ provisionCreatorDraftCollaborationRoom: calls.provision, promoteCreatorDraftCollaborationRoom: calls.promote }));
vi.mock("../../studio-draft-collaboration", async (original) => ({ ...await original<typeof import("../../studio-draft-collaboration")>(), retireStudioDraftCollaborationIdentity: calls.retire }));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({ downscaleStudioCanvasDataUrl: vi.fn(async () => "data:image/png;base64,AA==") }));
vi.mock("../../studio-publication-integrity", () => ({ writeStudioPublicationIntegrity: vi.fn(async () => ({})) }));
vi.mock("../../studio-page-lazy-ui", () => ({ preloadStudioCaptureReadinessRuntime: vi.fn(), preloadStudioSavePayloadRuntime: vi.fn(),
  loadStudioSavePayloadRuntime: async () => await import("../../studio-save-payload") }));
vi.mock("../../studio-durable-save-intent", () => ({ studioDurableSaveIntentRepository: { load: vi.fn(async () => null) },
  boundStudioSaveIntentOperation: async <T>(operation: Promise<T>) => await operation, acknowledgeStudioDurableSaveIntent: vi.fn() }));

const identity: StudioDraftCollaborationIdentity = { version: 1, draftDocumentId: "draft_12345678-1234-4234-8234-123456789abc",
  documentScopeKey: "studio-native-draft", ownerScopeKey: "12345678-1234-4234-8234-123456789abc", persistence: "persistent",
  createdAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
const room: CreatorDraftCollaborationRoomResponse = { version: 1, roomId: "draft-room_12345678-1234-4234-8234-123456789abc",
  draftDocumentId: identity.draftDocumentId, provisionalWorkId: "work-provisional", ownerScopeKey: identity.ownerScopeKey,
  status: "active", graphRevision: 0, initialSnapshotByteLength: 1024, provisionIntent: "cloud-save",
  provisionedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), promotedAt: null };

beforeEach(() => {
  vi.clearAllMocks(); calls.events.length = 0;
  calls.provision.mockImplementation(async () => { calls.events.push("provision"); return room; });
  calls.ensure.mockImplementation(async (input: { workId: string }) => { calls.events.push(`seal:${input.workId}`); return []; });
  calls.update.mockImplementation(async (id: string) => { calls.events.push(`update:${id}`); return { id, revision: 2 }; });
  calls.promote.mockImplementation(async () => { calls.events.push("promote"); return { ...room, status: "promoted", graphRevision: 1, promotedAt: new Date().toISOString() }; });
  calls.retire.mockResolvedValue(true);
});
async function saveDeps(workId: string | null, retainedOnly = false) {
  const f = await createBg3dBundleProjectFixture();
  const page = retainedOnly ? { ...f.project.pagesList[0], elements: [], groups: [], linked3dRender: undefined,
    bg3dLtBundles: { ...f.state, bundles: [{ ...f.state.bundles[0], activeRevisionId: null }] } } : f.project.pagesList[0];
  // 전체 UI 대신 실제 저장 오케스트레이터가 사용하는 의존성 이음매만 제공한다.
  const partial: Partial<StudioPageSavePipelineDeps> = {
    loggedIn: true, studioAuthUserId: identity.ownerScopeKey, workId, remixId: null, sourceProjectId: null, sourceDocumentId: null,
    autosaveKey: identity.documentScopeKey, title: "6패스 원고", description: "", tagsText: "", location: { pathname: "/studio/canvas", search: "", hash: "", key: "test", state: null },
    navigate: vi.fn(), linkedTitleId: null, linkedSeriesId: null, linkedChallengeId: null,
    currentStudioDocumentScopeRef: { current: { authScopeKey: identity.ownerScopeKey, workId } }, editorMountedRef: { current: true },
    documentSaveInFlightRef: { current: false }, markStudioDocumentChanged: () => true, canApplyStudioMutation: () => true,
    captureStudioMutationTicket: () => ({ authScopeKey: identity.ownerScopeKey, workId, accessGeneration: 0, documentGeneration: 0 }),
    sharedDocument: null, collaborationDocumentLocked: false, collaborationOperationSyncRequired: false,
    sharedDocumentSaveAbortRef: { current: null }, ownerDetailAbortRef: { current: null }, studioCrdtSceneRuntimeRef: { current: null },
    studioCrdtDocumentRef: { current: null }, studioCrdtAuthoritativeSaveBarrierRef: { current: null }, pages: [page],
    pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 }, master: { elements: [] }, currentPageId: page.id,
    masterEditMode: false, pendingStrokeCommitsRef: { current: null }, setCurrentPageId: () => true, effScale: 1,
    captureReadyStageForPage: async () => ({ toDataURL: () => "data:image/png;base64,AA==" } as unknown as Konva.Stage),
    draftCollaboration: { status: "provisioning", identity, intent: "cloud-save" }, draftCollaborationProvisionAbortRef: { current: null },
    setDraftCollaboration: vi.fn(), preserveStudioViewBeforeCapture: vi.fn(), setSaving: vi.fn(), setError: calls.error,
    setSharedDocumentNotice: vi.fn(), setSelectedId: vi.fn(), setMasterEditMode: vi.fn(), hideStrokeGuide: vi.fn(), setIsExporting: vi.fn(),
    openWorkMetadataStep: vi.fn(), clearPendingSaveIntent: vi.fn(), loadedWork: null, setLoadedWork: vi.fn(),
    clearAutosaveDurableAuthority: calls.clear, studioLifecycleDurableGenerationRef: { current: 0 },
    studioRevisionProjectGenerationRef: { current: 0 }, studioLifecycleDurablePendingFingerprintRef: { current: "" }, webtoonTheme: "classic", panelGutter: 24,
  };
  return partial as StudioPageSavePipelineDeps;
}

describe("실제 작품 저장 파이프라인의 native 승격 입구", () => {
  it.each([false, true])("retainedOnly=%s인 새 원고도 임시 작품에 봉인한 뒤 같은 작품을 갱신·승격한다", async (retainedOnly) => {
    await runStudioPageSavePipeline("draft", await saveDeps(null, retainedOnly));
    expect(calls.events).toEqual(["provision", "seal:work-provisional", "update:work-provisional", "promote"]);
    expect(calls.create).not.toHaveBeenCalled(); expect(calls.clear).toHaveBeenCalledOnce();
    expect(calls.ensure.mock.calls[0]?.[0].project.pagesList[0].bg3dLtBundles.bundles[0].revisions).toHaveLength(1);
  });
  it("기존 작품에 가져온 원고도 같은 작품 봉인이 끝나야 REST 저장한다", async () => {
    await runStudioPageSavePipeline("draft", await saveDeps("work-existing"));
    expect(calls.events).toEqual(["seal:work-existing", "update:work-existing"]);
    expect(calls.provision).not.toHaveBeenCalled(); expect(calls.promote).not.toHaveBeenCalled(); expect(calls.clear).toHaveBeenCalledOnce();
  });
  it.each([null, "work-existing"])("workId=%s에서 봉인 실패는 update·promote·로컬 보호 해제를 차단한다", async (workId) => {
    calls.ensure.mockRejectedValueOnce(new Error("6패스 봉인 실패"));
    await runStudioPageSavePipeline("draft", await saveDeps(workId));
    expect(calls.update).not.toHaveBeenCalled(); expect(calls.promote).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled();
    expect(calls.clear).not.toHaveBeenCalled(); expect(calls.error).toHaveBeenLastCalledWith("6패스 봉인 실패");
  });
});
