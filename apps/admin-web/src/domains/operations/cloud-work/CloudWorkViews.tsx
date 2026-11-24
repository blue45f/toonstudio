import { currentRisk, duplicateNotes, effectiveMain, effectiveOps, effectiveStage, formatTime, freshness, olderMain, RISK_LABELS, sourceComparison, STAGES } from "@toonstudio/contracts/admin-cloud-workboard";

import { prLabel, shortSha } from "./cloud-work-helpers";
import { WorkBadge, WorkCiBadge, WorkEmpty, WorkIcon, WorkLink, WorkStage } from "./cloud-work-ui";
import { CloudWorkVerification } from "./CloudWorkVerification";

import type { WorkView } from "./cloud-work-helpers";
import type { Board, Task } from "@toonstudio/contracts/admin-cloud-workboard";

interface Props { board: Board; tasks: Task[]; now: number; view: WorkView; layout: "table" | "kanban"; onEdit: (task: Task) => void }

function TaskSignals({ task, now }: { task: Task; now: number }) {
  const detected = Object.keys(task.risks).filter(key => currentRisk(task, key as keyof Task["risks"], now) === "감지");
  const unconfirmed = Object.keys(task.risks).some(key => currentRisk(task, key as keyof Task["risks"], now) === "미확인");
  return <div className="cw-badges"><WorkCiBadge task={task} now={now} />{detected.map(key => <WorkBadge key={key} tone="red">{RISK_LABELS[key as keyof Task["risks"]]}</WorkBadge>)}{unconfirmed && <WorkBadge>기타 신호 미확인</WorkBadge>}{!detected.length && !unconfirmed && <WorkBadge>미감지 확인</WorkBadge>}</div>;
}

function TaskCard({ task, now, onEdit }: { task: Task; now: number; onEdit: Props["onEdit"] }) {
  return <article className="cw-task-card">
    <div className="cw-spread"><span className="cw-meta">{task.id} · {task.project}</span><WorkBadge tone={task.priority === "높음" ? "amber" : "gray"}>{task.priority}</WorkBadge></div>
    <button type="button" className="cw-title-button" onClick={() => onEdit(task)}>{task.title}</button>
    <WorkStage value={effectiveStage(task, now)} />{effectiveStage(task, now) !== task.stage && <span className="cw-cell-note">이전 기록: {task.stage} · 재확인</span>}<TaskSignals task={task} now={now} />
    <p className="cw-muted">{sourceComparison(task)}</p>
    <p>{task.nextAction || "다음 조치 미기록"}</p>
    <div className="cw-spread cw-meta"><span>{task.owner || "담당자 미정"}</span><span>{freshness(task, now)}</span></div>
  </article>;
}

function TaskTable({ tasks, now, onEdit }: Pick<Props, "tasks" | "now" | "onEdit">) {
  return <><div className="cw-table-wrap"><table className="cw-task-table"><caption className="cw-sr-only">클라우드 작업 상태와 다음 조치</caption>
    <thead><tr><th>작업 / 프로젝트</th><th>현재 상태</th><th>소스 · main 비교</th><th>CI · 위험 신호</th><th>운영 확인</th><th>다음 조치 · 확인 시점</th></tr></thead>
    <tbody>{tasks.map(task => <tr key={task.id}>
      <td><span className="cw-meta">{task.id} · {task.project}</span><button type="button" className="cw-title-button" onClick={() => onEdit(task)}>{task.title}</button><span className="cw-meta">{task.owner || "담당자 미정"} · {task.action}</span></td>
      <td><WorkStage value={effectiveStage(task, now)} /><span className="cw-cell-note">{task.priority} 우선순위</span>{effectiveStage(task, now) !== task.stage && <span className="cw-cell-note">이전 기록: {task.stage} · 재확인</span>}</td>
      <td><span>{sourceComparison(task)}</span><span className="cw-cell-note">main: {effectiveMain(task, now)}</span><WorkLink url={task.pr}>{prLabel(task.pr)}</WorkLink>{task.baseBranch && task.baseBranch !== "main" && <span className="cw-cell-note">대상 브랜치: {task.baseBranch}</span>}</td>
      <td><TaskSignals task={task} now={now} /></td>
      <td><span>배포 {effectiveOps(task, "deploy", now)}</span><span className="cw-cell-note">마이그레이션 {effectiveOps(task, "migration", now)}</span><span className="cw-cell-note">계정 {effectiveOps(task, "account", now)} · 인프라 {effectiveOps(task, "infra", now)}</span><span className="cw-cell-note">정리 {effectiveOps(task, "cleanup", now)}</span></td>
      <td><p>{task.nextAction || "다음 조치 미기록"}</p><span className="cw-cell-note">{formatTime(task.verifiedAt)}</span><WorkBadge tone={freshness(task, now) === "24시간 내 확인" ? "teal" : "gray"}>{freshness(task, now)}</WorkBadge></td>
    </tr>)}</tbody></table></div>
    <div className="cw-mobile-tasks">{tasks.map(task => <TaskCard key={task.id} task={task} now={now} onEdit={onEdit} />)}</div></>;
}

function TaskKanban({ tasks, now, onEdit }: Pick<Props, "tasks" | "now" | "onEdit">) {
  return <div className="cw-kanban" aria-label="상태별 칸반">{STAGES.map(stage => {
    const items = tasks.filter(task => effectiveStage(task, now) === stage);
    return <section className="cw-kanban-column" key={stage} aria-label={stage}><header><WorkStage value={stage} /><span>{items.length}</span></header>
      {items.length ? items.map(task => <TaskCard key={task.id} task={task} now={now} onEdit={onEdit} />) : <p className="cw-muted cw-kanban-empty">작업 없음</p>}
    </section>;
  })}</div>;
}

function ComparisonCards({ tasks, board, now, onEdit }: Omit<Props, "view" | "layout">) {
  return <div className="cw-cards">{tasks.map(task => {
    const duplicates = duplicateNotes(task, board.tasks);
    return <article className="cw-comparison-card" key={task.id}>
      <div className="cw-spread"><div><span className="cw-meta">{task.id} · {task.project}</span><button className="cw-title-button" type="button" onClick={() => onEdit(task)}>{task.title}</button></div><WorkStage value={effectiveStage(task, now)} /></div>
      <div className="cw-source-grid">
        <div><span>로컬</span><code title={task.localSha}>{shortSha(task.localSha)}</code><p>{task.localBranch || "브랜치 미확인"}</p><small>변경 파일 {task.dirtyFiles ?? "미확인"}</small></div>
        <div><span>원격</span><code title={task.remoteSha}>{shortSha(task.remoteSha)}</code><p>{task.remoteBranch || "브랜치 미확인"}</p><WorkLink url={task.pr}>{prLabel(task.pr)} · {task.prState}</WorkLink><small>대상 {task.baseBranch || "미확인"} · {task.prDraft === null ? "초안 여부 미확인" : task.prDraft ? "초안" : "검토 요청"}</small></div>
        <div><span>main</span><code title={task.mainSha}>{shortSha(task.mainSha)}</code><p>{effectiveMain(task, now)}</p><small>병합 커밋 {shortSha(task.mergeSha)}</small><small>{olderMain(task, board.tasks) ? "더 최근의 main 증빙 있음 · 재확인" : freshness(task, now)}</small></div>
      </div>
      <p className="cw-comparison-result"><WorkIcon name="compare" />{sourceComparison(task)}</p>
      <p>{task.comparisonNote || "내용 비교 근거가 없습니다. SHA 차이만으로 동일 변경 여부를 단정하지 않습니다."}</p>
      {duplicates.length > 0 && <ul className="cw-warning-list">{duplicates.map(note => <li key={note}>{note}</li>)}</ul>}
      <div className="cw-spread cw-meta"><span>변경 그룹 {task.changeKey || "미기록"} · 배포 {task.deployEnvironment || "환경 미확인"} / {shortSha(task.deploySha)} / 구성 {task.deployConfigKey || "미확인"}</span><WorkLink url={task.comparisonLink}>비교 근거</WorkLink></div>
      <div className="cw-badges"><WorkLink url={task.adminBoardUrl}>운영 원본 보드</WorkLink><WorkLink url={task.sourcePageUrl}>작업 원장</WorkLink></div>
    </article>;
  })}</div>;
}

function ApprovalCards({ tasks, now, onEdit }: Pick<Props, "tasks" | "now" | "onEdit">) {
  const approvals = tasks.filter(task => effectiveStage(task, now) === "승인 대기");
  if (!approvals.length) return <WorkEmpty title="승인 대기 작업이 없습니다" detail="실행이 필요한 작업은 승인 대기 상태에서 범위와 선행 조건을 기록합니다." />;
  return <div className="cw-cards">{approvals.map(task => <article className="cw-approval-card" key={task.id}>
    <div className="cw-spread"><span className="cw-meta">{task.id} · {task.project}</span><WorkBadge tone="purple">{task.action}</WorkBadge></div>
    <button className="cw-title-button" type="button" onClick={() => onEdit(task)}>{task.title}</button>
    <dl className="cw-detail-list"><div><dt>담당 작업</dt><dd>{task.assignment || "미기록"}</dd></div><div><dt>영향 범위</dt><dd>{task.scope || "미기록"}</dd></div><div><dt>선행 조건</dt><dd>{task.prerequisites || "미기록"}</dd></div><div><dt>차단 요인</dt><dd>{task.blockers || "미기록"}</dd></div><div><dt>다음 조치</dt><dd>{task.nextAction || "미기록"}</dd></div></dl>
    <p className="cw-approval-note"><WorkIcon name="lock" />보드에는 승인 대기 기록만 저장됩니다.</p>
  </article>)}</div>;
}

function ActivityList({ board, tasks }: Pick<Props, "board" | "tasks">) {
  const ids = new Set(tasks.map(task => task.id));
  const entries = board.audit.filter(entry => entry.taskId === "cloud-workboard-v1" || ids.has(entry.taskId));
  const sourceEntries = (board.sourceHistory ?? []).filter(entry => !entry.taskId || entry.taskId === "cloud-workboard-v1" || ids.has(entry.taskId));
  if (!entries.length && !sourceEntries.length) return <WorkEmpty title="변경 이력이 없습니다" detail="서버 저장 이력과 JSON에서 가져온 출처 이력은 따로 표시합니다." />;
  return <>{entries.length > 0 && <h3>이 보드의 저장 이력</h3>}{entries.some(entry => entry.taskId === "cloud-workboard-v1") && <p className="cw-meta">보드 전체 저장 기록은 작업 필터와 관계없이 표시됩니다.</p>}
    <ol className="cw-activity-list">{entries.map(entry => <li key={entry.id}><WorkIcon name="history" /><div><strong>{entry.title}</strong><p>{entry.detail}</p><span className="cw-meta">{entry.taskId === "cloud-workboard-v1" ? "보드 전체" : entry.taskId} · {formatTime(entry.at)}</span></div></li>)}</ol>
    {sourceEntries.length > 0 && <section className="cw-source-history" aria-label="가져온 출처 이력"><h3>가져온 출처 이력</h3><p className="cw-meta">원본 JSON의 사용자 기록입니다. 이 서버에서 실행하거나 검증한 이력이 아닙니다.</p><ol className="cw-activity-list">{sourceEntries.map(entry => <li key={JSON.stringify(entry)}><WorkIcon name="history" /><div><strong>{entry.title}</strong><p>{entry.detail}</p><span className="cw-meta">{entry.taskId || "원본 보드 전체"} · {formatTime(entry.at)}</span></div></li>)}</ol></section>}</>;
}

export function CloudWorkViews(props: Props) {
  if (props.view === "activity") return <ActivityList {...props} />;
  if (!props.tasks.length) return <WorkEmpty />;
  if (props.view === "compare") return <ComparisonCards {...props} />;
  if (props.view === "verification") return <CloudWorkVerification tasks={props.tasks} now={props.now} onEdit={props.onEdit} />;
  if (props.view === "approvals") return <ApprovalCards {...props} />;
  return props.layout === "kanban" ? <TaskKanban {...props} /> : <TaskTable {...props} />;
}
