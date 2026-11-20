import { CONFLICT_LABEL, dateLabel, display, FRESHNESS_LABEL, freshness, IMPACT_LABEL, STATUSES, STATUS_LABEL } from "@toonstudio/contracts/admin-production-change";
import { useMemo, useState, useEffect } from "react";

import { emptyChangeFilters, filterProductionChanges } from "./production-change-list";
import { ChangeError, ChangeFreshness, ChangeIcon, ChangeInfo, ChangeStatus, changeCsv, labelOptions, saveDownload } from "./production-change-ui";
import { ProductionChangeEditor } from "./ProductionChangeEditor";
import { useProductionChanges } from "./useProductionChanges";
import "./production-change.css";

import type { ChangeFilters, ChangeView } from "./production-change-list";
import type { AdminIdentity } from "../../../platform/http/admin-identity";
import type { RequestData, RequestRecord } from "@toonstudio/contracts/admin-production-change";

const views: readonly [ChangeView, string][] = [["all", "전체 요청"], ["approval", "승인 대기"], ["conflict", "Conflict Center"], ["verification", "사후 검증"], ["guide", "기록 안내"]];
export function ProductionChangeBoard({ actor, verified, onUnauthorized }: { actor: AdminIdentity; verified: boolean; onUnauthorized: (message: string) => void }) {
  const canWrite = verified && actor.role === "admin";
  const board = useProductionChanges(verified, canWrite, onUnauthorized);
  const [section, setSection] = useState<ChangeView>("all");
  const [filters, setFilters] = useState<ChangeFilters>(emptyChangeFilters);
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [editing, setEditing] = useState<{ record: RequestRecord | null; tab: "overview" | "conflict" | "verification" | "history" } | null>(null);
  const [notice, setNotice] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const records = board.records ?? [];
  const known = board.records !== null && !board.error;
  const filtered = useMemo(() => filterProductionChanges(board.records ?? [], section, filters, now), [board.records, section, filters, now]);
  const counts = { all: records.length, approval: records.filter(record => ["submitted", "analysis", "review"].includes(record.status)).length, conflict: records.filter(record => record.data.conflictState === "open").length, stale: records.filter(record => ["stale", "changed"].includes(freshness(record, now).key)).length };
  function navigate(view: ChangeView) { setSection(view); setFilters(emptyChangeFilters()); }
  function filter(key: keyof ChangeFilters, value: string) { setFilters(previous => ({ ...previous, [key]: value })); }
  function open(record: RequestRecord | null) { board.clearError(); setEditing({ record, tab: section === "conflict" ? "conflict" : section === "verification" ? "verification" : "overview" }); }
  async function save(record: RequestRecord | null, data: RequestData) { const result = await board.save(record, data); if (result) { setEditing(current => current ? { ...current, record: result } : null); setNotice("제작 변경 기록을 서버에 저장했습니다."); } return result; }
  async function download(kind: "json" | "csv") {
    const confirmed = await board.load();
    if (!confirmed) return;
    const selected = filterProductionChanges(confirmed, section, filters);
    const day = new Date().toISOString().slice(0, 10);
    saveDownload(`toonstudio-production-changes-${day}.${kind}`, kind === "json" ? JSON.stringify({ exportedAt: new Date().toISOString(), requests: selected }, null, 2) : changeCsv(selected), kind === "json" ? "application/json" : "text/csv;charset=utf-8");
    setExportOpen(false); setNotice("현재 필터의 요청을 내보냈습니다.");
  }
  async function exportDraft(record: RequestRecord | null, data: RequestData) {
    // 이미 확인된 계정의 미저장 초안은 서버 장애 중에도 직접 보관할 수 있다.
    if (!verified || board.authorizationLost) return;
    saveDownload(`toonstudio-change-draft-${record?.code ?? "new"}.json`, JSON.stringify({ kind: "unsaved-production-change-draft", exportedAt: new Date().toISOString(), base: record, data }, null, 2));
    setNotice("서버 정본과 구분한 미저장 초안을 내보냈습니다.");
  }
  async function reloadSelected() {
    const result = await board.load();
    if (!result) return null;
    const current = result.find(record => record.id === editing?.record?.id) ?? null;
    if (current) setEditing(previous => previous ? { ...previous, record: current } : null);
    return current;
  }
  if (board.authorizationLost) return <section className="pc-board"><ChangeError>접근 권한이 변경되어 제작 변경 기록과 편집 화면을 닫았습니다. 관리자 권한을 다시 확인하세요.</ChangeError></section>;
  return <section className="pc-board" aria-labelledby="production-changes-title" aria-busy={board.busy}>
    <header className="pc-page-heading"><div><p className="pc-eyebrow">PRODUCTION CHANGES</p><h1 id="production-changes-title">제작 변경 요청</h1><p>요청의 시작부터 충돌 해결, 적용 기록과 사후 검증까지 연결합니다.</p></div><button type="button" className="pc-button pc-button--primary" disabled={!canWrite || !known || board.busy} onClick={() => open(null)}><ChangeIcon name="plus" />새 변경 요청</button></header>
    <div className="pc-storage-state"><span><ChangeIcon name="lock" size={15} />서버 저장 · {actor.role === "admin" ? "관리자 편집" : "운영자 열람"}</span><span>모든 시각 KST</span></div>
    {!canWrite && verified && <ChangeInfo>열람 권한입니다. 요청·근거·이력을 확인하고 내보낼 수 있으며, 기록 수정과 승인은 관리자 권한이 필요합니다.</ChangeInfo>}
    <nav className="pc-navigation" aria-label="제작 변경 구역">{views.map(([view, label]) => <button type="button" key={view} aria-pressed={section === view} onClick={() => navigate(view)}>{label}</button>)}</nav>
    {section === "guide" ? <ProductionChangeGuide /> : <>
      <div className="pc-metrics">{([
        ["all", "전체 요청", "이 작업실에 기록한 변경", "file"], ["approval", "승인 대기", "제출 · 영향 분석 · 검토", "shield"], ["conflict", "해결할 충돌", "미해결 충돌 확인", "compare"], ["stale", "다시 확인할 증빙", "오래됨 · 재검증 필요", "clock"],
      ] as const).map(([key, label, hint, icon]) => <button type="button" key={key} className="pc-metric" onClick={() => { navigate(key === "stale" ? "all" : key); if (key === "stale") filter("freshness", "attention"); if (key === "conflict") filter("conflict", "open"); }}><span>{label}<ChangeIcon name={icon} /></span><strong>{known ? counts[key] : "—"}<small>{known ? "건" : "미확인"}</small></strong><small>{hint}</small></button>)}</div>
      <section className="pc-list-panel" aria-label="제작 변경 목록"><header className="pc-list-heading"><h2>{views.find(([view]) => view === section)?.[1]} <span>{known ? filtered.length : "—"}</span></h2><div className="pc-toolbar"><div className="pc-layout-toggle"><button type="button" aria-pressed={layout === "list"} aria-label="목록 보기" onClick={() => setLayout("list")}><ChangeIcon name="list" />목록</button><button type="button" aria-pressed={layout === "board"} aria-label="칸반 보기" onClick={() => setLayout("board")}><ChangeIcon name="board" />칸반</button></div><div className="pc-export-menu"><button type="button" className="pc-button" disabled={!known || board.busy || !verified} aria-expanded={exportOpen} onClick={() => setExportOpen(value => !value)}><ChangeIcon name="download" />내보내기</button>{exportOpen && <div><button type="button" onClick={() => void download("json")}>전체 기록 JSON</button><button type="button" onClick={() => void download("csv")}>목록 CSV</button></div>}</div><button type="button" className="pc-icon-button" disabled={!verified || board.busy} aria-label="서버 요청 새로고침" onClick={() => void board.load()}><ChangeIcon name="refresh" /></button></div></header>
        <div className="pc-filters"><label className="pc-search"><ChangeIcon name="search" /><input value={filters.search} placeholder="요청·프로젝트·에셋 검색" aria-label="요청 검색" onChange={event => filter("search", event.target.value)} /></label><label>상태<select aria-label="상태 필터" value={filters.status} onChange={event => filter("status", event.target.value)}><option value="all">모든 상태</option>{STATUSES.map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></label><label>영향도<select aria-label="영향도 필터" value={filters.impact} onChange={event => filter("impact", event.target.value)}><option value="all">모든 영향도</option>{labelOptions(IMPACT_LABEL).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>충돌<select aria-label="충돌 필터" value={filters.conflict} onChange={event => filter("conflict", event.target.value)}><option value="all">모든 충돌</option>{labelOptions(CONFLICT_LABEL).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>검증 최신성<select aria-label="최신성 필터" value={filters.freshness} onChange={event => filter("freshness", event.target.value)}><option value="all">모든 최신성</option><option value="attention">오래됨 · 재검증</option>{labelOptions(FRESHNESS_LABEL).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <div className="pc-results"><span>{known ? `${filtered.length}건의 요청` : "요청 수 미확인"}<button type="button" onClick={() => setFilters(emptyChangeFilters())}>필터 초기화</button></span><label>정렬<select aria-label="정렬 기준" value={filters.sort} onChange={event => filter("sort", event.target.value)}><option value="updated">최근 수정순</option><option value="impact">영향도 높은순</option><option value="status">상태 진행순</option><option value="conflict">미해결 충돌 우선</option><option value="freshness">증빙 오래된순</option></select></label></div>
        {board.error && <div className="pc-panel-message"><ChangeError>{board.error}</ChangeError><button type="button" className="pc-button" disabled={board.busy} onClick={() => void board.load()}>서버 기록 다시 불러오기</button></div>}
        {!board.error && board.records === null && <p className="pc-empty" role="status">서버에서 제작 변경 기록을 불러오고 있습니다.</p>}
        {known && (layout === "board" ? <div className="pc-kanban-scroll"><div className="pc-kanban">{STATUSES.map(status => <section className="pc-kanban-column" key={status}><header><ChangeStatus status={status} /><span>{filtered.filter(record => record.status === status).length}</span></header><div>{filtered.filter(record => record.status === status).map(record => <button type="button" className="pc-request-card" key={record.id} onClick={() => open(record)}><small>{record.code}</small><h3>{record.data.title}</h3><p>{display(record.data.project)} · {display(record.data.episode)}</p><div><span className={`pc-impact pc-impact--${record.data.impact}`}>{IMPACT_LABEL[record.data.impact]}</span><ChangeFreshness record={record} /></div><footer>{display(record.data.owner)}</footer></button>)}{!filtered.some(record => record.status === status) && <p className="pc-kanban-empty">요청 없음</p>}</div></section>)}</div></div> : filtered.length ? <div className="pc-table-scroll"><table className="pc-table"><caption className="pc-sr-only">저장된 제작 변경 요청과 현재 상태</caption><thead><tr><th scope="col">변경 요청</th><th scope="col">상태</th><th scope="col">영향도·충돌</th><th scope="col">담당자</th><th scope="col">검증 최신성</th><th scope="col">최근 수정</th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}><th scope="row"><button type="button" className="pc-open-request" onClick={() => open(record)}><small>{record.code}</small><strong>{record.data.title}</strong><span>{display(record.data.project)} / {display(record.data.episode)}</span></button></th><td><ChangeStatus status={record.status} /></td><td><div className="pc-cell-stack"><span className={`pc-impact pc-impact--${record.data.impact}`}>{IMPACT_LABEL[record.data.impact]}</span><span>{CONFLICT_LABEL[record.data.conflictState]}</span></div></td><td>{display(record.data.owner)}</td><td><div className="pc-cell-stack"><ChangeFreshness record={record} /><small>{dateLabel(freshness(record, now).latestAt)}</small></div></td><td>{dateLabel(record.updatedAt)}</td></tr>)}</tbody></table></div> : <div className="pc-empty"><span className="pc-empty-icon"><ChangeIcon name="file" size={34} /></span><h3>{records.length ? "조건에 맞는 요청이 없습니다" : "첫 변경 요청을 기록해 보세요"}</h3><p>{records.length ? "필터나 구역을 바꾸어 다른 요청을 확인하세요." : "프로젝트와 변경할 내용부터 시작하세요. 확인하지 않은 값은 미확인으로 남겨 둡니다."}</p><button type="button" className="pc-button pc-button--primary" disabled={!canWrite || board.busy} onClick={() => open(null)}><ChangeIcon name="plus" />새 변경 요청</button></div>)}
      </section>
      <div className="pc-flow"><div><ChangeIcon name="file" /><strong>요청과 검토</strong><span>초안 · 제출 · 영향 분석 · 검토</span></div><div><ChangeIcon name="shield" /><strong>결정과 적용</strong><span>승인 · 반려 · 예약 · 적용</span></div><div><ChangeIcon name="check" /><strong>검증과 마무리</strong><span>검증 완료 · 종료</span></div></div>
    </>}
    <p className="pc-record-policy"><ChangeIcon name="lock" size={15} />보드의 결정과 결과만 저장합니다. 코드·외부 배포·운영 데이터 변경은 실행하지 않습니다.</p>
    {notice && <div className="pc-notice" role="status"><ChangeIcon name="check" />{notice}<button type="button" className="pc-icon-button" aria-label="알림 닫기" onClick={() => setNotice("")}><ChangeIcon name="close" /></button></div>}
    {editing && <ProductionChangeEditor record={editing.record} initialTab={editing.tab} active={verified} canWrite={canWrite} busy={board.busy} error={board.error} conflict={board.conflict} onClose={() => { setEditing(null); board.clearError(); }} onSave={save} onTransition={async (record, status, note) => { const result = await board.transition(record, status, note); if (result) setEditing(current => current ? { ...current, record: result } : null); return result; }} onUpload={board.upload} onExportDraft={exportDraft} onReload={reloadSelected} />}
  </section>;
}
function ProductionChangeGuide() {
  return <section className="pc-guide"><header><p className="pc-eyebrow">RECORDING GUIDE</p><h2>변경마다 판단의 근거를 남깁니다.</h2><p>실제로 확인한 내용과 아직 확인하지 못한 내용을 구분하세요.</p></header><div className="pc-guide-grid"><article><ChangeIcon name="shield" /><h3>승인은 현재 변경 범위에 연결됩니다</h3><p>검토 상태에서 승인·반려를 기록합니다. 승인한 범위를 바꾸면 재검토로 돌아갑니다. 승인 기록은 외부 작업의 자동 실행 권한으로 사용되지 않습니다.</p></article><article><ChangeIcon name="compare" /><h3>로컬·원격 비교는 사용자 기록입니다</h3><p>시각적·구조적 차이, 영향 범위, 퍼블리싱 영향, 충돌 원인과 해결 방법을 기록합니다. 원본을 자동 분석·수정·병합하지 않습니다.</p></article><article><ChangeIcon name="check" /><h3>적용 이후에는 검증 증빙을 연결합니다</h3><p>전후 캡처와 대상 Revision, 필수 테스트와 회귀 여부를 확인하세요. 미확인 항목이나 필수 증빙이 남아 있으면 검증 완료로 넘어갈 수 없습니다.</p></article><article><ChangeIcon name="clock" /><h3>증빙 시각으로 최신성을 판단합니다</h3><p>기본 유효기간은 72시간이며 요청별로 바꿀 수 있습니다. 이 보드의 기본값이며 기존 ToonStudio 정책을 뜻하지 않습니다. 메모 수정은 증빙 시각을 갱신하지 않습니다.</p></article></div><ChangeInfo>예약은 일정 기록이며 자동 작업을 실행하지 않습니다. CI·배포·인프라 관리는 기존 운영 보드에서 이어가세요.</ChangeInfo></section>;
}
