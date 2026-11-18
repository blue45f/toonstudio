import { STATUSES } from "@toonstudio/contracts/ai-operations";
import { useState } from "react";


import { AI_PAGES, EMPTY_FILTERS, ITEM_TYPES, SOURCE_KINDS, aiCsv, aiDate, aiFreshness, downloadAiFile, filterAiItems, newAiItem } from "./ai-operations-model";
import { createAiOperationsStarter } from "./ai-operations-starter";
import { AiOperationsDialog } from "./AiOperationsDialog";
import { AiItemEditor, AiMetaEditor, AiSourceEditor } from "./AiOperationsEditors";
import { AiOperationsImport } from "./AiOperationsImport";
import { AiAudit, AiItemsTable, AiOverview, AiSources, AiTasks } from "./AiOperationsViews";
import { useAiOperationsBoard } from "./useAiOperationsBoard";

import type { AiPage } from "./ai-operations-model";
import type { BoardItem, BoardSource } from "@toonstudio/contracts/ai-operations";
import "./ai-operations.css";

type Modal = { kind: "item"; item: BoardItem } | { kind: "source"; source: BoardSource } | { kind: "import" | "meta" | "new" | "reload" } | null;

export function AiOperationsBoard({ userIdentity, authorized = true }: { userIdentity: string; authorized?: boolean }) {
  if (!userIdentity.trim()) return <p role="alert">관리자 인증 후 운영 보드를 열 수 있습니다.</p>;
  return <AiOperationsWorkspace key={userIdentity} userIdentity={userIdentity} authorized={authorized} />;
}
function AiOperationsWorkspace({ userIdentity, authorized }: { userIdentity: string; authorized: boolean }) {
  const board = useAiOperationsBoard(userIdentity);
  const [page, setPage] = useState<AiPage>("overview"); const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sourceKind, setSourceKind] = useState(""); const [newType, setNewType] = useState<BoardItem["type"]>("model");
  const [modal, setModal] = useState<Modal>(null); const [localError, setLocalError] = useState("");
  const snapshot = board.draft; const server = board.server; const canEdit = Boolean(server?.canEdit && !board.busy && !board.conflict);
  const visible = snapshot ? filterAiItems(snapshot.items, page, filters) : [];
  const sources = snapshot?.sources.filter((source) => (!sourceKind || source.kind === sourceKind) && (!filters.query.trim() || [source.title, source.scope, source.url].join(" ").toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase()))) ?? [];
  const close = () => setModal(null);
  function exportJson() { if (snapshot) downloadAiFile(JSON.stringify({ ...snapshot, exportedAt: new Date().toISOString() }, null, 2), "toonstudio-ai-operations.json", "application/json;charset=utf-8"); }
  function applyItem(item: BoardItem): string | null {
    if (!snapshot) return "기록을 불러온 뒤 편집하세요.";
    const exists = snapshot.items.some((entry) => entry.id === item.id);
    return board.replaceDraft({ ...snapshot, items: exists ? snapshot.items.map((entry) => entry.id === item.id ? item : entry) : [...snapshot.items, item] });
  }
  function applySource(source: BoardSource): string | null {
    if (!snapshot) return "기록을 불러온 뒤 편집하세요.";
    const exists = snapshot.sources.some((entry) => entry.id === source.id);
    return board.replaceDraft({ ...snapshot, sources: exists ? snapshot.sources.map((entry) => entry.id === source.id ? source : entry) : [...snapshot.sources, source] });
  }
  function start() { setLocalError(board.replaceDraft(createAiOperationsStarter()) ?? ""); }
  function reload() { close(); setLocalError(""); void board.load(); }
  // 권한 재확인 중에는 DOM을 제거하되 적용 전 편집 초안은 메모리에 보존한다.
  return <>{authorized && <section className="ai-ops" aria-labelledby="ai-operations-title">
    <header className="ai-ops-header"><div><p className="ai-ops-eyebrow">TOONSTUDIO / 운영 근거</p><h1 id="ai-operations-title">AI·무료 플랜 운영</h1><p>Cloudflare 모델 종료 · Onpod 처리 한도 · 근거와 다음 조치</p></div><div className="ai-ops-actions"><button type="button" disabled={board.busy} onClick={() => board.dirty ? setModal({ kind: "reload" }) : reload()}>저장 기록 새로 읽기</button>{server?.canEdit && <button type="button" disabled={!canEdit} onClick={() => setModal({ kind: "import" })}>JSON 가져오기</button>}<button type="button" disabled={!snapshot} onClick={exportJson}>JSON 내보내기</button></div></header>
    {board.notice && <p role="status" className="ai-ops-notice">{board.notice}</p>}
    {(board.error || localError) && <div role="alert" className="ai-ops-error"><strong>{board.error || localError}</strong><p>{snapshot ? "현재 화면의 기록은 유지됩니다. JSON으로 백업한 뒤 저장 상태를 확인하세요." : "기록을 읽지 못한 상태를 빈 보드로 처리하지 않습니다. 관리자 권한과 서버 저장 준비 상태를 확인하세요."}</p>{board.conflict && <p>다른 관리자가 먼저 저장했습니다. 현재 기록을 백업하고 최신 저장본을 다시 읽으세요.</p>}</div>}
    {!server && <div className="ai-ops-panel"><p>{board.busy ? "서버에서 운영 기록을 확인하고 있습니다." : "서버 저장 기록을 확인한 뒤 보드를 사용할 수 있습니다."}</p></div>}
    {server && <div className="ai-ops-savebar"><div><strong>{server.canEdit ? "관리자 공용 기록" : "운영자 열람 전용"}</strong><span>리비전 {server.revision} · 마지막 저장 {aiDate(server.updatedAt)}</span><span className={board.dirty ? "ai-ops-unsaved" : "ai-ops-muted"}>{board.dirty ? "아직 서버에 저장하지 않은 변경 있음" : "저장본과 일치"}</span></div>{server.canEdit && <button type="button" className="ai-ops-primary" disabled={!canEdit || !board.dirty || !snapshot} onClick={() => { void board.save(); }}>{board.busy ? "처리 중…" : "서버에 저장"}</button>}</div>}
    {server && !snapshot && <section className="ai-ops-panel ai-ops-empty"><h2>저장된 운영 보드가 없습니다</h2><p>공개 코드의 기준 자료로 시작하거나, 기존 Sites 보드의 JSON을 가져올 수 있습니다. 개인 메일과 내부 관측은 기본 번들에 포함하지 않습니다.</p>{server.canEdit ? <div className="ai-ops-actions"><button type="button" disabled={!canEdit} className="ai-ops-primary" onClick={start}>공개 기준으로 시작</button><button type="button" disabled={!canEdit} onClick={() => setModal({ kind: "import" })}>기존 Sites 기록 가져오기</button></div> : <p>관리자가 보드를 등록하면 이 화면에서 확인할 수 있습니다.</p>}</section>}
    {server && snapshot && <>
      <div className="ai-ops-basis"><span>기준 관측: {aiDate(snapshot.meta.snapshotAt)}</span><strong>{aiFreshness(snapshot)}</strong><span>기준 main: {snapshot.meta.mainCommitUrl ? <a href={snapshot.meta.mainCommitUrl} target="_blank" rel="noopener noreferrer"><code>{snapshot.meta.mainSha.slice(0, 10) || "미확인"}</code></a> : "미확인"}</span>{server.canEdit && <button type="button" disabled={!canEdit} onClick={() => setModal({ kind: "meta" })}>기준 정보</button>}</div>
      <nav className="ai-ops-nav" aria-label="AI·무료 운영 보드 화면">{AI_PAGES.map(([key, label]) => <button type="button" key={key} aria-pressed={page === key} onClick={() => setPage(key)}>{label}</button>)}</nav>
      <div className="ai-ops-toolbar"><label className="ai-ops-search">기록 검색<input type="search" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="모델 ID, 제목, 담당자, 근거" /></label>
        {page === "sources" ? <label>근거 유형<select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}><option value="">전체 유형</option>{SOURCE_KINDS.map((kind) => <option key={kind}>{kind}</option>)}</select></label> : <>
          <label>상태 필터<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">전체 상태</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>제공자 필터<select value={filters.provider} onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))}><option value="">전체 제공자</option>{["Cloudflare", "Onpod", "공통"].map((provider) => <option key={provider}>{provider}</option>)}</select></label>
          <label>우선순위 필터<select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}><option value="">전체 우선순위</option>{["P0", "P1", "P2"].map((priority) => <option key={priority}>{priority}</option>)}</select></label></>}
        <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSourceKind(""); }}>필터 초기화</button>
      </div>
      <div className="ai-ops-section-heading"><p>{page === "sources" ? `근거 ${sources.length}개` : `기록 ${visible.length}개 / 전체 ${snapshot.items.length}개`}</p><div className="ai-ops-actions">{page !== "sources" && <button type="button" onClick={() => downloadAiFile(aiCsv(visible), "toonstudio-ai-operations.csv", "text/csv;charset=utf-8")}>필터 결과 CSV</button>}{server.canEdit && <button type="button" disabled={!canEdit} onClick={() => page === "sources" ? setModal({ kind: "source", source: { id: `source-${crypto.randomUUID()}`, title: "", url: "", kind: "공식 문서", observedAt: "", scope: "" } }) : setModal({ kind: "new" })}>{page === "sources" ? "근거 등록" : "새 기록"}</button>}</div></div>
      {page === "overview" && <AiOverview snapshot={snapshot} items={visible} onItem={(item) => setModal({ kind: "item", item })} />}
      {["models", "alerts", "hypotheses"].includes(page) && <AiItemsTable page={page} items={visible} onItem={(item) => setModal({ kind: "item", item })} />}
      {page === "tasks" && <AiTasks items={visible} status={filters.status} onItem={(item) => setModal({ kind: "item", item })} />}
      {page === "sources" && <AiSources sources={sources} onSource={(source) => setModal({ kind: "source", source })} />}
      <AiAudit server={server} snapshot={snapshot} />
      <details className="ai-ops-panel"><summary>근거 해석 기준</summary><ul>{snapshot.meta.caveats.map((caveat, index) => <li key={index}>{caveat}</li>)}</ul><p>처리량·동시성·재시도·장시간 요청·중복 실행은 각각 근거를 대조합니다. 근거가 없는 수치와 해결 완료 표시는 만들지 않습니다.</p></details>
    </>}
    <footer className="ai-ops-footer">수동 관측·검토 기록 · 외부 서비스 자동 조회 없음 · 코드·푸시·병합·배포·요금제 변경 실행 없음</footer>
  </section>}
    {server && modal?.kind === "import" && <AiOperationsImport current={snapshot} visible={authorized} onClose={close} onImport={board.replaceDraft} />}
    {snapshot && modal?.kind === "item" && <AiItemEditor visible={authorized} key={modal.item.id} item={modal.item} snapshot={snapshot} canEdit={canEdit} onApply={applyItem} onClose={close} />}
    {snapshot && modal?.kind === "source" && <AiSourceEditor visible={authorized} key={modal.source.id} source={modal.source} canEdit={canEdit} onApply={applySource} onClose={close} />}
    {snapshot && modal?.kind === "meta" && <AiMetaEditor visible={authorized} snapshot={snapshot} onApply={board.replaceDraft} onClose={close} />}
    {snapshot && modal?.kind === "new" && <AiOperationsDialog visible={authorized} title="새 운영 기록" description="실제 관측과 근거를 기록할 종류를 선택하세요. 운영 변경 항목은 승인 대기로 시작합니다." onClose={close}><label>기록 종류<select value={newType} onChange={(event) => setNewType(event.target.value as BoardItem["type"])}>{ITEM_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="ai-ops-primary" onClick={() => setModal({ kind: "item", item: newAiItem(newType) })}>기록 내용 입력</button></AiOperationsDialog>}
    {modal?.kind === "reload" && <AiOperationsDialog visible={authorized} title="최신 저장본 다시 읽기" description="현재 화면의 미저장 변경을 버리고 서버 저장본을 읽습니다. 필요한 기록을 먼저 JSON으로 백업하세요." onClose={close}><div className="ai-ops-actions"><button type="button" onClick={exportJson}>현재 기록 JSON 백업</button><button type="button" onClick={reload}>변경을 버리고 다시 읽기</button><button type="button" onClick={close}>취소</button></div></AiOperationsDialog>}
  </>;
}
