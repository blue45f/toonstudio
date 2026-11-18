import { NestLinks, NestSource, NestStatus, NestTaskList, isNestClosed, nestDate } from "./nestjs-quality-ui";

import type { NestBoardDocument, NestBoardView, Snapshot, Task } from "@toonstudio/contracts/admin-nestjs-quality";

export type NestSection = "overview" | "versions" | "paths" | "scenarios" | "tasks" | "approvals" | "evidence";
export const nestSections: readonly [NestSection, string][] = [["overview", "검증 개요"], ["versions", "버전 · PR · CI"], ["paths", "API · 실시간 경로"], ["scenarios", "검증 시나리오"], ["tasks", "작업 보드"], ["approvals", "승인 대기"], ["evidence", "근거 · 변경 이력"]];

function Sequence({ snapshot }: { snapshot: Snapshot }) {
  return <section className="nest-panel"><h2>정렬 순서와 변경 영향</h2><ol className="nest-sequence">{snapshot.sequence.map((stage) => <li key={stage.title}><h3>{stage.title}</h3><p>{stage.detail}</p><span className="nest-tag">{stage.status}</span></li>)}</ol></section>;
}

function AdapterJudgement({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const task = tasks.find((item) => item.id === "nest-005") ?? tasks.find((item) => item.title.includes("WsAdapter") && item.category === "적용 범위");
  return <section className="nest-panel nest-adapter"><div><p className="nest-eyebrow">별도 적용 범위 판정</p><h2>WsAdapter 제한과 StudioLivePostgresIoAdapter</h2></div>{task ? <><div className="nest-toolbar"><NestStatus status={task.status} /><strong>확인 결과 · {task.result}</strong></div><p>{task.summary}</p><p><strong>영향 범위</strong> · {task.scope}</p><p className="nest-muted">자료 확인 {nestDate(task.checkedAt)} · 정적 판정일 {nestDate(task.verificationDate)}. 이 판정은 실제 연결·payload·재연결 검증 결과와 별개입니다.</p><NestLinks links={task.evidenceLinks} /><button type="button" onClick={() => onOpen(task)}>WsAdapter 적용 판정 기록 열기</button></> : <p>별도 판정 항목이 아직 없습니다. 적용 여부는 미확인입니다.</p>}</section>;
}

export function NestOverview({ document, onOpen, onSection }: { document: NestBoardDocument; onOpen: (task: Task) => void; onSection: (section: NestSection) => void }) {
  const active = document.tasks.filter((task) => !isNestClosed(task));
  const scenarios = document.tasks.filter((task) => task.category === "검증 시나리오");
  const unknown = scenarios.filter((task) => !task.verificationDate || task.result === "미확인");
  const approvals = document.tasks.filter((task) => !task.archived && task.approvalRequired);
  return <>
    <div className="nest-metrics">
      <button type="button" onClick={() => onSection("tasks")}><span>남은 검증·조치</span><strong>{active.length}</strong><small>완료·보관 제외</small></button>
      <button type="button" onClick={() => onSection("scenarios")}><span>실행 증거 확인 필요</span><strong>{unknown.length} / {scenarios.length}</strong><small>시나리오 결과와 검증일 기준</small></button>
      <button type="button" onClick={() => onSection("versions")}><span>기록된 main CI</span><strong className="nest-word">{document.snapshot.mainCiState}</strong><small>수동 관측 · 자동 동기화 없음</small></button>
      <button type="button" onClick={() => onSection("approvals")}><span>승인 검토 대기</span><strong>{approvals.length}</strong><small>코드 수정·PR·배포의 선행 조건</small></button>
    </div>
    <div className="nest-grid"><section className="nest-panel"><h2>우선 확인할 항목</h2><NestTaskList tasks={[...active].sort((a, b) => a.priority.localeCompare(b.priority)).slice(0, 6)} onOpen={onOpen} /><button type="button" onClick={() => onSection("tasks")}>전체 작업 보기</button></section><section className="nest-panel"><h2>현재 비교 기준</h2><dl className="nest-facts"><dt>저장소</dt><dd>{document.repository}</dd><dt>main SHA</dt><dd><code>{document.snapshot.mainSha}</code></dd><dt>자료 확인일</dt><dd>{nestDate(document.snapshot.observedAt)}</dd><dt>패키지</dt><dd>{document.snapshot.packages.length}개</dd><dt>후속 PR</dt><dd>{document.snapshot.prs.length}개</dd></dl><p>패키지 선언·잠금 버전, CI 로그, 정적 코드 경로와 실제 런타임 결과를 같은 커밋인지 대조합니다.</p><NestLinks links={[{ label: "기준 main", url: document.snapshot.mainUrl }, { label: "main CI", url: document.snapshot.mainCiUrl }, { label: "공식 릴리스", url: document.snapshot.releaseUrl }]} /></section></div>
    <AdapterJudgement tasks={document.tasks} onOpen={onOpen} />
    <Sequence snapshot={document.snapshot} />
  </>;
}

export function NestVersions({ snapshot, onOpenId }: { snapshot: Snapshot; onOpenId: (id: string) => void }) {
  return <>
    <section className="nest-panel"><div className="nest-toolbar nest-between"><h2>패키지별 버전과 호환성 근거</h2><span className="nest-muted">자료 갱신: JSON 검토 후 저장</span></div><div className="nest-table-scroll" tabIndex={0} role="region" aria-label="NestJS 패키지 비교 표"><table><thead><tr><th>패키지</th><th>선언 / 잠금</th><th>목표 정렬 제안</th><th>peer 근거 · 영향 범위</th><th>판정</th></tr></thead><tbody>{snapshot.packages.map((row) => <tr key={row.name}><td><button type="button" className="nest-link-button" onClick={() => onOpenId(row.taskId)}>{row.name}</button></td><td><code>{row.declared}</code><small>잠금 {row.locked}</small></td><td><strong>{row.target}</strong><small>{row.targetNote}</small></td><td><p>{row.peerSummary}</p><small>{row.scope}</small><NestLinks links={row.links} /></td><td>{row.assessment}</td></tr>)}</tbody></table></div></section>
    <section className="nest-panel"><h2>후속 PR · 병합 상태</h2><div className="nest-grid">{snapshot.prs.map((pr) => <article className="nest-subpanel" key={pr.number}><h3><NestSource link={{ label: `#${pr.number} ${pr.title}`, url: pr.url }} /></h3><strong>{pr.state}</strong><p>{pr.note}</p><small>병합일 {nestDate(pr.mergedAt)}</small><code>{pr.sha || "커밋 미확인"}</code></article>)}</div></section>
    <section className="nest-panel"><h2>CI 결과와 증거 범위</h2><p className="nest-muted">관련 없는 실패와 취소를 Nest 회귀로 합산하지 않습니다. 기록 시점과 실제 로그를 확인하세요.</p><div className="nest-grid">{snapshot.ci.map((ci, index) => <article className="nest-subpanel" key={`${ci.url}-${index}`}><p className="nest-eyebrow">{ci.scope}</p><h3>{ci.title}</h3><strong>{ci.result}</strong><p>{ci.detail}</p><span className="nest-tag">{ci.counted ? "Nest 관련 검토 대상" : "Nest 실패 집계 제외"}</span><NestSource link={{ label: `${ci.title} 로그`, url: ci.url }} /></article>)}</div></section>
    <section className="nest-panel"><h2>릴리스 근거</h2><p>기록된 릴리스 날짜: {snapshot.releaseDate || "미확인"}. 개별 패키지의 peer 범위와 커스텀 어댑터 상속 경로를 함께 검토합니다.</p><NestSource link={{ label: "공식 릴리스 노트", url: snapshot.releaseUrl }} /></section>
    <Sequence snapshot={snapshot} />
  </>;
}

export function NestPaths({ document, onOpen, onOpenId }: { document: NestBoardDocument; onOpen: (task: Task) => void; onOpenId: (id: string) => void }) {
  return <><p className="nest-notice">코드에서 확인한 경로입니다. HTTP prefix, Socket.IO path·namespace, 인증·재연결·전파 흐름의 실제 성공은 시나리오에서 따로 검증합니다.</p><div className="nest-grid">{document.snapshot.paths.map((path, index) => <article className="nest-panel" key={path.id}><p className="nest-eyebrow">{String(index + 1).padStart(2, "0")} · {path.subtitle}</p><h2>{path.title}</h2><p>{path.detail}</p><div className="nest-toolbar"><NestSource link={{ label: "코드 근거", url: path.url }} /><button type="button" onClick={() => onOpenId(path.taskId)}>관련 검증 기록</button></div></article>)}</div><AdapterJudgement tasks={document.tasks} onOpen={onOpen} /></>;
}

export function NestEvidence({ view, onOpenId }: { view: NestBoardView; onOpenId: (id: string) => void }) {
  const { document } = view;
  return <>
    <div className="nest-grid"><section className="nest-panel"><h2>공식·저장소 근거</h2><NestLinks links={document.snapshot.sources} /></section><section className="nest-panel"><h2>기본 미완료 목록에서 제외</h2>{document.snapshot.exclusions.map((item, index) => <article className="nest-evidence-item" key={`${item.title}-${index}`}><h3>{item.title}</h3><p>{item.reason}</p>{item.url && <NestSource link={{ label: "제외 근거", url: item.url }} />}</article>)}</section></div>
    <section className="nest-panel"><h2>서버 변경 이력</h2><p>현재 버전 {view.revision} · 서버 저장일 {nestDate(view.updatedAt)}. 서버가 기록한 행위자·시간·변경 대상을 표시합니다. 버전별 전체 문서 전후 사본은 권한을 확인하는 별도 JSON에서 열 수 있습니다.</p>{view.history.length ? <ol className="nest-history">{view.history.map((entry) => <li key={entry.revision}><div className="nest-toolbar"><strong>버전 {entry.revision} · {entry.reason}</strong><time>{nestDate(entry.createdAt)}</time></div><p>기록한 관리자: {entry.actorId} · {entry.snapshotChanged ? "스냅샷 변경" : "항목 기록 변경"}</p><div className="nest-toolbar">{entry.changedTaskIds.map((id) => <button type="button" key={id} onClick={() => onOpenId(id)}>{id}</button>)}<a href={`/api/admin/quality/nestjs/history/${entry.revision}`} target="_blank" rel="noopener noreferrer">버전 {entry.revision} 전후 문서 JSON ↗</a></div></li>)}</ol> : <p className="nest-empty">아직 서버에 저장한 변경 이력이 없습니다. 기본 자료 표시 자체는 새 검증 실행을 뜻하지 않습니다.</p>}</section>
    <details className="nest-panel"><summary>가져온 원본 출처 이력 {document.sourceHistory.length}건</summary><p className="nest-muted">원본 Sites 기록입니다. ToonStudio 서버가 생성한 감사 이력과 구분합니다.</p>{document.sourceHistory.map((entry) => <article className="nest-evidence-item" key={entry.id}><strong>{entry.taskTitle}</strong><p>{entry.changes.join(" · ")}</p><small>{nestDate(entry.changedAt)} · {entry.actor}</small></article>)}</details>
  </>;
}
