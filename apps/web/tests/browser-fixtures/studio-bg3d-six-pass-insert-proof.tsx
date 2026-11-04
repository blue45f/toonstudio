import React, { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument } from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import { buildSketchUpWebtoonSixPassLtRecipe } from "../../src/domains/creator/bg3d/studio-bg3d-sketchup-webtoon-staging-bridge";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT } from "../../src/domains/creator/contracts/studio-bg3d-six-pass-settings";
import { useStudioPageHistorySnapshots } from "../../src/domains/creator/studio-cuttoon-editor/runtime/useStudioPageHistorySnapshots";
import { bindStudioBg3dRenderedImage } from "../../src/domains/creator/studio-cuttoon-editor/studio-cuttoon-bg3d-insert";
import { acquireStudioLinked3dPassProductAuthority } from "../../src/domains/creator/studio-linked-3d-pass-product-authority";
import { prepareStudioLinked3dPassProjectArchiveExport, restoreStudioLinked3dPassProjectArchiveImport } from "../../src/domains/creator/studio-linked-3d-pass-project-archive";
import { createStudioOpfsAssetStore } from "../../src/domains/creator/studio-opfs-asset-store";
import { createStudioOpfsNativeFileSystem } from "../../src/domains/creator/studio-opfs-filesystem";
import { createStudioPagesHistoryCommandJournal } from "../../src/domains/creator/studio-pages-history-command-journal";
import { appendStudioPagesHistorySnapshot } from "../../src/domains/creator/studio-pending-stroke-durability";
import { buildStudioProjectArchive, importStudioProjectArchive } from "../../src/domains/creator/studio-project-archive";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../../src/domains/creator/studio-project-file";

import type { StudioBackground3DInsertResult } from "../../src/domains/creator/scene-3d/studio-3d-insert-contract";
import type { El } from "../../src/domains/creator/studio-element-model";
import type { PageState } from "../../src/domains/creator/studio-page-state";

const runId = `six-pass-insert-proof-${crypto.randomUUID()}`;

function encodedLayer(color: string, alpha: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 16; canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("검증용 PNG 인코더가 없습니다.");
  context.fillStyle = color; context.globalAlpha = alpha;
  context.fillRect(2, 2, 12, 12);
  return canvas.toDataURL("image/png");
}

function fixtureResult(): StudioBackground3DInsertResult {
  const base = createDefaultStudioBg3dSceneDocument();
  const scene = normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT } });
  const colors = { color: "#df9e62", tone: "#222222", shadow: "#000000", depth: "#fed7aa", "texture-line": "#446644", "main-line": "#111111" };
  return {
    kind: "separated", width: 16, height: 16, bg3dScene: scene, perspectiveGuides: [],
    compositePngDataUrl: encodedLayer("#a07755", 1),
    layers: buildSketchUpWebtoonSixPassLtRecipe().map((recipe) => ({
      role: recipe.role, width: 16, height: 16, pngDataUrl: encodedLayer(colors[recipe.role], 1),
      blendMode: recipe.blendMode, opacity: recipe.opacity, visible: recipe.visibleByDefault,
    })),
  };
}

function App() {
  const snapshots = useStudioPageHistorySnapshots({ effectiveWorkId: runId, workId: null, markStudioDocumentChanged: () => true });
  const journal = useRef(createStudioPagesHistoryCommandJournal());
  const commitCalls = useRef(0);
  const archive = useRef<Blob | null>(null);
  const result = useRef(fixtureResult());
  const [receipt, setReceipt] = useState<Record<string, unknown>>({ runId, stage: "ready", boundary: "실제 원고 삽입 어댑터·페이지 히스토리 hook·OPFS CAS·프로젝트 ZIP. 전체 StudioCuttoonEditorHost·Konva 표시·클라우드 저장은 이 fixture 범위 밖입니다." });
  const [error, setError] = useState<string | null>(null);
  const page = snapshots.pages[0];
  if (!page) throw new Error("초기 페이지가 없습니다.");

  const currentPages = () => snapshots.pagesHistoryRef.current[snapshots.pagesHiRef.current];
  const commit = (elements: El[], patch: Partial<PageState>) => {
    const previousPages = currentPages();
    const previousIndex = snapshots.pagesHiRef.current;
    const nextPages = previousPages.map((current) => current.id === page.id ? { ...current, ...patch, elements } : current);
    const next = appendStudioPagesHistorySnapshot(snapshots.pagesHistoryRef.current, previousIndex, nextPages);
    journal.current.recordTransition({ mutationKind: "elements.commit", previousPages, nextPages, previousHistoryIndex: previousIndex, nextHistoryIndex: next.historyIndex });
    flushSync(() => { snapshots.setPagesHistory(next.history); snapshots.setPagesHi(next.historyIndex); });
    commitCalls.current += 1;
    return true;
  };

  const insert = bindStudioBg3dRenderedImage({
    setError, setStatusNotice: () => {}, elementById: new Map(page.elements.map((element) => [element.id, element])), groups: page.groups ?? [],
    patchEl: () => { throw new Error("새 삽입에서 patchEl을 호출했습니다."); }, canvasH: page.canvasH,
    addEl: () => { throw new Error("분리 삽입에서 addEl을 호출했습니다."); }, isRealtimeTeamSession: false, elements: page.elements,
    activePage: page, bg3dDccSourceRef: { current: null }, commit, setSelectedId: () => {}, setTool: () => {}, announceDrawingShortcut: () => {},
    masterEditMode: false, pageEditLocked: false, currentStudioDrawingAssistDocument: undefined, bg3dDccShotMappingsRef: { current: [] },
    bg3dMutationTicketRef: { current: { generation: 1 } }, canApplyStudioMutation: () => true, currentPageIdRef: { current: page.id },
    authorizedWorkAssetScopeId: null, studioAuthUserId: null, studioCrdtDocumentRef: { current: null }, studioCrdtSceneRuntimeRef: { current: null },
    studioCrdtOperationSyncReady: false, collaborationDocumentLocked: false, studioFilterMaskPublicationClockRef: { current: 0 },
    studioFilterMaskPublicationGenerationRef: { current: new Map() }, queueStudioBg3dMagicFilterMaskPublication: () => {}, collaborationAccessRef: { current: {} },
    setDrawingAssistPreview: () => {},
  });

  const run = (operation: () => Promise<void> | void) => async () => {
    setError(null);
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.stack ?? cause.message : String(cause)); }
  };
  const summarize = (stage: string, extra: Record<string, unknown> = {}) => {
    const current = currentPages()[0];
    const images = current.elements.filter((element) => element.type === "image");
    setReceipt((previous) => ({ ...previous, stage, commitCalls: commitCalls.current, historyLength: snapshots.pagesHistoryRef.current.length,
      historyIndex: snapshots.pagesHiRef.current, count: images.length, groupCount: current.groups?.length ?? 0,
      roles: images.map((element) => element.bg3dLtRole), ...extra }));
  };

  return <main>
    <h1>6패스 LT 원고 삽입·실행 취소·ZIP 재열기</h1>
    <p>빈 로컬 검증 문서에 인코딩한 PNG 6개를 실제 삽입 어댑터로 전달합니다. 픽셀 캡처 자체의 증거는 별도 GPU fixture에서 확인합니다.</p>
    <button onClick={run(async () => {
      if (currentPages()[0].elements.length) throw new Error("새 검증 문서에 한 번만 삽입하세요.");
      const accepted = await insert(result.current);
      if (!accepted) throw new Error("실제 원고 삽입 어댑터가 거부했습니다.");
      const authority = await acquireStudioLinked3dPassProductAuthority();
      const current = currentPages()[0];
      const descriptor = current.linked3dRender?.links[0]?.passRevision?.artifact;
      if (!descriptor) throw new Error("OPFS line pass descriptor가 없습니다.");
      const bytes = await authority.get(descriptor.contentHash, { verify: true });
      if (!bytes || bytes.length !== descriptor.byteSize) throw new Error("실제 OPFS line pass 읽기에 실패했습니다.");
      summarize("inserted", { opfsLineBytes: bytes.length, opfsKind: authority.kind, sceneVersion: result.current.bg3dScene.version });
    })}>6패스 원고에 삽입</button>
    <button disabled={snapshots.pagesHi === 0} onClick={run(() => {
      const index = snapshots.pagesHiRef.current - 1;
      const navigation = journal.current.recordUndo({ pages: snapshots.pagesHistoryRef.current[index], historyIndex: index });
      flushSync(() => snapshots.setPagesHi(index)); summarize("undone", { undoJournal: navigation });
    })}>실행 취소</button>
    <button disabled={snapshots.pagesHi >= snapshots.pagesHistory.length - 1} onClick={run(() => {
      const index = snapshots.pagesHiRef.current + 1;
      const navigation = journal.current.recordRedo({ pages: snapshots.pagesHistoryRef.current[index], historyIndex: index });
      flushSync(() => snapshots.setPagesHi(index)); summarize("redone", { redoJournal: navigation });
    })}>다시 실행</button>
    <button onClick={run(async () => {
      const authority = await acquireStudioLinked3dPassProductAuthority();
      const project = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(parseStudioProjectFile({ version: 4, title: "6패스 검증", pagesList: currentPages() }))));
      const attachments = await prepareStudioLinked3dPassProjectArchiveExport({ project, authority });
      const built = await buildStudioProjectArchive({ project, attachments }, { crc32ExecutionMode: "worker" });
      if (!built.isSelfContained) throw new Error("프로젝트 ZIP이 자기완결적이지 않습니다.");
      archive.current = built.blob;
      summarize("saved", { projectVersion: project.version, archiveBytes: built.blob.size, archiveAttachments: built.manifest.attachments.length, selfContained: built.isSelfContained });
    })}>프로젝트 ZIP 저장</button>
    <button onClick={run(async () => {
      if (!archive.current) throw new Error("먼저 프로젝트 ZIP을 저장하세요.");
      const imported = await importStudioProjectArchive(archive.current);
      const target = createStudioOpfsAssetStore({ fs: createStudioOpfsNativeFileSystem(navigator.storage, `${runId}-reopened`) });
      const restored = await restoreStudioLinked3dPassProjectArchiveImport({ archive: imported, authority: target, apply: (project) => project });
      const nextPages = restored.pagesList as PageState[];
      const lineArtifact = nextPages[0].linked3dRender?.links[0]?.passRevision?.artifact;
      if (!lineArtifact || !await target.get(lineArtifact.contentHash, { verify: true })) throw new Error("새 OPFS 영역으로 패스를 복원하지 못했습니다.");
      flushSync(() => { snapshots.setPagesHistory([nextPages]); snapshots.setPagesHi(0); });
      summarize("reopened", { projectVersion: restored.version, restoredIntoEmptyOpfs: true, selfContained: imported.isSelfContained,
        layerSettings: nextPages[0].elements.filter((element) => element.type === "image").map((element) => ({ role: element.bg3dLtRole, opacity: element.opacity, blendMode: element.blendMode })) });
    })}>빈 OPFS 영역에 재열기</button>
    {error ? <pre role="alert">{error}</pre> : null}
    <pre id="receipt" data-stage={receipt.stage}>{JSON.stringify(receipt, null, 2)}</pre>
    <section>{page.elements.filter((element) => element.type === "image").map((element) => <article key={element.id}>
      <b>{element.name}</b><small>{element.bg3dLtRole} · {element.blendMode} · {element.opacity}</small>
      <img alt={element.name} src={element.src.startsWith("data:") ? element.src : result.current.layers.find((layer) => layer.role === element.bg3dLtRole)?.pngDataUrl} />
    </article>)}</section>
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("검증 fixture root가 없습니다.");
createRoot(root).render(<App />);
