import { cloneElement, lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import type { StudioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";
import { createStudioBg3dHistorySnapshot } from "../bg3d/studio-bg3d-editor-derivations";
import type { StudioBackground3DProps } from "../bg3d/StudioBackground3DTypes";
import { canEditStudioSharedDocument, getStudioSharedDocumentMeta, isStudioSharedDocumentAccessError } from "../studio-shared-document-client";
import { createStudioVrmCutPaintSession, type StudioVrmCutPaintSession } from "../vrm/studio-vrm-cut-paint-session";
import type { StudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dCutBg3dHost, type StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";
import { readTeamVrmCutReceipt, TeamVrmCutAccessError, type TeamCutScope, type readTeamVrmCut } from "./studio-team-vrm-cut-client";
import { teamCutAssetPlan, type StudioTeamVrmCutResources } from "./studio-team-vrm-cut-assets";
import { TeamVrmCutPaintAction, reviseTeamVrmCutPaint } from "./studio-team-vrm-cut-revision";

const Poser = lazy(async () => ({default: (await import("../vrm/StudioVrmPoser")).StudioVrmPoser}));
type Loaded = Awaited<ReturnType<typeof readTeamVrmCut>>;
interface EditorProps {
  scope: TeamCutScope;
  loaded: Loaded;
  editor: ReactElement<StudioBackground3DProps>;
  authority?: StudioScopedWriteAuthority | null;
  actorId?: string | null;
  onLostAccess(message: string): void;
}
class CutEditDenied extends Error {}
type Edit = {host: StudioScene3dCutBg3dEditorHost; actorId: string; hash: string; actor: StudioVrmSceneDocument; session: StudioVrmCutPaintSession};

export function StudioTeamVrmCutRevisionEditor({scope, loaded, editor, authority, actorId, onLostAccess}: EditorProps) {
  const [resources, setResources] = useState<StudioTeamVrmCutResources>(loaded.resources);
  const versions = useRef(new Set([loaded.scene.pinnedVersionedCut?.sourceHash]));
  const [edit, setEdit] = useState<Edit>();
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function cancel() { request.current?.abort(); request.current = null; setEdit(undefined); }
  async function authorize() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const [receipt, meta] = await Promise.all([readTeamVrmCutReceipt(scope, controller.signal), getStudioSharedDocumentMeta(scope.workId, controller.signal)]);
    controller.signal.throwIfAborted();
    let canEdit = canEditStudioSharedDocument(meta);
    if (authority && (!canEdit || authority.mappedFullEdit)) {
      const policy = await authority.refresh();
      controller.signal.throwIfAborted();
      canEdit = !!policy && authority.mappedPolicyVerified && authority.drawingAllowed
        && authority.workId === scope.workId && authority.authScopeKey === actorId
        && authority.currentTarget?.definition.pageId === scope.pageId && authority.purposeContext().grantIds.length > 0;
    }
    if (receipt.sceneSha256 !== loaded.sceneSha256 || meta.workId !== scope.workId || !canEdit)
      throw new CutEditDenied("현재 이 작품의 캐릭터를 편집할 권한이 없습니다. 원고에서 팀 권한을 확인해 주세요.");
    return controller.signal;
  }
  function report(cause: unknown) {
    if (cause instanceof Error && cause.name === "AbortError") return;
    if (cause instanceof TeamVrmCutAccessError || isStudioSharedDocumentAccessError(cause)) { onLostAccess(cause.message); return; }
    if (cause instanceof CutEditDenied) cancel();
    setError(cause instanceof Error ? cause.message : "작품을 확인하지 못했습니다. 다시 시도해 주세요.");
  }
  async function open(host: StudioScene3dCutBg3dEditorHost, actorId: string) {
    setError("");
    try {
      const signal = await authorize();
      const cut = host.readCurrentCanonicalSceneForShot()?.pinnedVersionedCut;
      const actor = cut?.source.linkedVrm?.characters.find(c => c.elementId === actorId);
      if (!cut || !actor || !host.open || host.cutWorkId !== scope.workId || cut.source.linkedVrm?.documentScope !== host.cutDocumentKey
        || cut.id !== loaded.scene.pinnedVersionedCut?.id || !versions.current.has(cut.sourceHash))
        throw new Error("작품에 저장된 컷을 선택한 뒤 새 버전을 편집해 주세요.");
      signal.throwIfAborted();
      setEdit({host, actorId, hash: cut.sourceHash, actor: actor.vrmScene, session: createStudioVrmCutPaintSession(actor.vrmScene.model, resources)});
    } catch (cause) { report(cause); }
  }
  async function apply(paint: StudioVrmSceneDocument["surfacePaint"], current: () => boolean) {
    if (!edit) return false;
    setError("");
    try {
      const signal = await authorize();
      const host = createStudioScene3dCutBg3dHost(edit.host);
      const reason = host.blockedReason();
      if (reason) throw new Error(reason);
      const stage = edit.host.readCurrentCanonicalSceneForShot();
      if (!stage?.pinnedVersionedCut || edit.host.cutWorkId !== scope.workId) throw new Error("현재 열려 있는 작품 컷을 확인해 주세요.");
      const source = host.readSource(stage.pinnedVersionedCut.source);
      const next = reviseTeamVrmCutPaint(stage, source, edit.hash, edit.actorId, {...edit.actor, surfacePaint:paint});
      const cast = next.pinnedVersionedCut?.source.linkedVrm;
      if (!cast || !current()) throw new Error("확인하는 동안 채색이 바뀌었습니다. 획을 마치고 다시 적용해 주세요.");
      teamCutAssetPlan(cast);
      signal.throwIfAborted();
      const { primitives, customModels } = edit.host;
      const before = createStudioBg3dHistorySnapshot({primitives, customModels, document:stage});
      edit.host.commitImmediateHistoryTransition(primitives, customModels, next, before, {
        commandId: "scene3d.cut.paint", label: "팀 컷 캐릭터 채색", source: "inspector", preserveBeforeCamera: true,
      });
      edit.host.replaceCanonicalDocumentState({document:next});
      versions.current.add(next.pinnedVersionedCut?.sourceHash);
      setResources(edit.session.resources);
      setEdit(undefined);
      return true;
    } catch (cause) { report(cause); return false; }
  }
  return <TeamVrmCutPaintAction.Provider value={open}>
    {cloneElement(editor, { initialScene: loaded.scene, cutWorkResources: resources })}
    {editor.props.open !== false && edit && <Suspense fallback={<p role="status" className="fixed bottom-5 left-5 z-[85] bg-panel p-3">캐릭터 포저를 여는 중입니다.</p>}>
      <Poser open onClose={cancel} initialScene={edit.actor} cutPaintSession={edit.session} onApplyCutPaint={apply} onInsert={() => false} />
    </Suspense>}
    {error && <div role="alert" className="fixed inset-x-3 bottom-4 z-[90] mx-auto flex max-w-lg items-center gap-3 rounded-lg border border-line bg-panel p-3 text-fg">
      <p>{error}</p><button type="button" className="min-h-11 px-2" onClick={() => setError("")}>닫기</button>
    </div>}
  </TeamVrmCutPaintAction.Provider>;
}
