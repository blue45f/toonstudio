import { parseNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality";
import { useEffect, useState } from "react";

import { NestEvidence, NestOverview, NestPaths, NestVersions, nestSections } from "./NestBoardViews";
import { nestDate, nestExport } from "./nestjs-quality-ui";
import { NestJsonDialog } from "./NestJsonDialog";
import { NestTaskEditor } from "./NestTaskEditor";
import { NestTaskWorkspace } from "./NestTaskWorkspace";
import { useNestBoard } from "./useNestBoard";

import type { NestSection } from "./NestBoardViews";
import type { NestBoardDocument, Task } from "@toonstudio/contracts/admin-nestjs-quality";

import "./nestjs-quality.css";

interface Props {
  userIdentity: string; role: "admin" | "operator"; verified: boolean;
  onUnauthorized: (message: string) => void;
}

export function NestQualityBoard({ userIdentity, role, verified, onUnauthorized }: Props) {
  if (!userIdentity.trim()) return <p role="alert">관리자 인증 후 NestJS 기록을 열 수 있습니다.</p>;
  return <NestWorkspace key={userIdentity} role={role} verified={verified} onUnauthorized={onUnauthorized} />;
}

function NestWorkspace({ role, verified, onUnauthorized }: Omit<Props, "userIdentity">) {
  const { view, busy, error, conflict, reload, save } = useNestBoard(verified, onUnauthorized);
  const [section, setSection] = useState<NestSection>("overview");
  const [selected, setSelected] = useState<Task | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const canEdit = verified && role === "admin" && view?.canEdit === true;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  function openId(id: string): void {
    const task = view?.document.tasks.find((item) => item.id === id);
    if (task) setSelected(task);
    else setNotice("해당 항목은 현재 문서에 없습니다. 변경 이력과 가져오기 자료를 확인하세요.");
  }
  function documentWithTask(task: Task): NestBoardDocument {
    if (!view) throw new Error("서버 기록을 먼저 읽으세요.");
    return { ...view.document, tasks: view.document.tasks.some((item) => item.id === task.id)
      ? view.document.tasks.map((item) => item.id === task.id ? task : item) : [...view.document.tasks, task] };
  }
  async function persist(document: NestBoardDocument, reason: string): Promise<string | null> {
    if (!canEdit) return "현재 계정은 읽기 전용입니다.";
    try {
      const validated = parseNestBoardDocument(document);
      if (!await save(validated, reason)) return "서버 저장이 완료되지 않았습니다. 초안은 현재 화면에 남아 있습니다.";
      setSelected(null);
      setJsonOpen(false);
      setDirty(false);
      setNotice("서버에 검증 기록을 저장했습니다. 실제 코드·CI·병합·배포 작업은 실행하지 않았습니다.");
      return null;
    } catch (cause) { return cause instanceof Error ? cause.message : "기록 형식을 확인하세요."; }
  }
  async function reloadAndClose(): Promise<boolean> {
    if (!await reload()) return false;
    setSelected(null);
    setJsonOpen(false);
    setDirty(false);
    setNotice("서버의 최신 기록을 다시 읽었습니다.");
    return true;
  }
  function exportDocument(document: NestBoardDocument, draft = false): void {
    if (!view) return;
    try { nestExport(document, view, draft); setNotice(draft ? "미저장 초안과 서버 이력 요약을 JSON으로 내보냈습니다." : "문서 전체와 서버 이력 요약을 JSON으로 내보냈습니다."); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "내보내기 파일을 만들지 못했습니다."); }
  }
  function addTask(): void {
    if (!view || !canEdit) return;
    setSelected({ id: `custom-${crypto.randomUUID()}`, title: "새 검증 항목", category: "추가 검증", priority: "P1", status: "미확인",
      kind: "사용자 기록", summary: "후속 검증 항목", scope: "범위 미확인", nextAction: "", owner: "미지정", commit: view.document.snapshot.mainSha,
      checkedAt: new Date().toISOString(), verificationDate: "", environment: "미확인", result: "미확인", steps: [], acceptance: "",
      beforeEvidence: "미확인 · 실행 증거 없음", afterEvidence: "미확인 · 실행 증거 없음", evidenceLinks: [], notes: "", approvalRequired: false, archived: false, revision: 0 });
  }
  const age = view ? now - Date.parse(view.document.snapshot.observedAt) : 0;
  const stale = !Number.isFinite(age) || age > 24 * 60 * 60 * 1000 || age < -60_000;

  return <section className="nest-board" aria-labelledby="nest-board-title">
    <header className="nest-heading"><div><p className="nest-eyebrow">TOONSTUDIO / 호환성 검증</p><h1 id="nest-board-title">NestJS 호환성 검증</h1><p>API부터 실시간 협업까지, 커밋과 전후 증거를 비교합니다.</p></div><div className="nest-toolbar"><button type="button" disabled={!view} onClick={() => setJsonOpen(true)}>NestJS JSON 관리</button><button type="button" disabled={!view} onClick={() => view && exportDocument(view.document)}>기록 내보내기</button><button type="button" disabled={busy || dirty || !verified} onClick={() => void reloadAndClose()}>{busy && !view ? "기록 읽는 중…" : "서버 기록 새로고침"}</button></div></header>
    {notice && <p role="status" className="nest-notice">{notice}</p>}
    {error && !selected && !jsonOpen && <div className="nest-error" role="alert"><strong>서버 기록 연결 확인 필요</strong><p>{error}</p><p>서버 저장 성공으로 처리하거나 브라우저 저장으로 대체하지 않습니다.</p><button type="button" disabled={busy || !verified} onClick={() => void reload()}>서버 기록 다시 읽기</button></div>}
    {!view ? !error && <p role="status" className="nest-empty">서버에서 NestJS 검증 기록을 읽고 있습니다.</p> : <>
      <div className="nest-snapshot"><a href={view.document.snapshot.mainUrl} target="_blank" rel="noopener noreferrer">기록된 main <code>{view.document.snapshot.mainSha.slice(0, 12)}</code> ↗</a><span>자료 확인 {nestDate(view.document.snapshot.observedAt)}</span><span>서버 버전 {view.revision}</span></div>
      <p className={stale ? "nest-notice nest-warning" : "nest-muted"}>{stale ? "자료 확인 후 24시간 이상 지났거나 시각을 확인해야 합니다. 최신 main·병합·CI 상태를 다시 확인하세요." : "수동 확인 스냅샷입니다. 최신 main·CI와 자동 동기화하지 않습니다."}</p>
      {!canEdit && <p className="nest-notice">읽기 전용 · 이 계정은 기록 조회와 JSON 내보내기만 할 수 있습니다.</p>}
      <nav className="nest-tabs nest-navigation" aria-label="NestJS 보드 화면">{nestSections.map(([key, label]) => <button type="button" key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}</nav>
      {section === "overview" && <NestOverview document={view.document} onOpen={setSelected} onSection={setSection} />}
      {section === "versions" && <NestVersions snapshot={view.document.snapshot} onOpenId={openId} />}
      {section === "paths" && <NestPaths document={view.document} onOpen={setSelected} onOpenId={openId} />}
      {(section === "tasks" || section === "scenarios" || section === "approvals") && <NestTaskWorkspace key={section} section={section} tasks={view.document.tasks} canEdit={canEdit} onOpen={setSelected} onAdd={addTask} />}
      {section === "evidence" && <NestEvidence view={view} onOpenId={openId} />}
      <footer className="nest-footer"><span>ToonStudio 서버 기록 · 자동 CI 실행 없음</span><span>{dirty ? "저장되지 않은 초안 있음" : `서버 저장일 ${nestDate(view.updatedAt)}`}</span></footer>
      {selected && <NestTaskEditor key={selected.id} task={selected} isNew={!view.document.tasks.some((task) => task.id === selected.id)} canEdit={canEdit} busy={busy} error={error} conflict={conflict} onDirty={setDirty} onClose={() => setSelected(null)} onSave={(task, reason) => persist(documentWithTask(task), reason)} onExport={(task) => exportDocument(documentWithTask(task), true)} onReload={reloadAndClose} />}
      {jsonOpen && <NestJsonDialog view={view} canEdit={canEdit} busy={busy} error={error} conflict={conflict} onDirty={setDirty} onClose={() => setJsonOpen(false)} onSave={persist} onReload={reloadAndClose} />}
    </>}
  </section>;
}
