import { CHECK_PHASES, currentCheckState, effectiveStage, PHASE_LABELS } from "@toonstudio/contracts/admin-cloud-workboard";

import { WorkBadge, WorkStage } from "./cloud-work-ui";

import type { Task, VerificationCheck } from "@toonstudio/contracts/admin-cloud-workboard";

interface Props { tasks: Task[]; now: number; onEdit: (task: Task) => void }

function phaseSummary(task: Task, phase: VerificationCheck["phase"], now: number) {
  const checks = task.verificationChecks.filter(check => check.phase === phase);
  const states = checks.map(check => currentCheckState(task, check, now));
  const completed = states.filter(state => state === "통과" || state === "해당 없음").length;
  const status = !states.length || states.includes("미확인") ? "미확인"
    : states.every(state => state === "해당 없음") ? "해당 없음" : "통과";
  return { status: states.includes("실패") ? "실패" : status, completed, total: checks.length };
}

export function CloudWorkVerification({ tasks, now, onEdit }: Props) {
  return <section aria-label="병합 전후 검증 단계">
    <p className="cw-meta">현재 SHA·환경·확인 시각에 맞는 증빙만 집계합니다. 단계가 비어 있거나 적용 제외 근거가 없으면 미확인입니다.</p>
    <div className="cw-verification-scroll"><table className="cw-verification-table"><caption className="cw-sr-only">작업별 병합 전후·운영·정리 검증 현황</caption>
      <thead><tr><th>작업</th>{CHECK_PHASES.map(phase => <th key={phase}>{PHASE_LABELS[phase]}</th>)}</tr></thead>
      <tbody>{tasks.map(task => <tr key={task.id}><td><span className="cw-meta">{task.project} · {task.id}</span><button type="button" className="cw-title-button" onClick={() => onEdit(task)}>{task.title}</button><WorkStage value={effectiveStage(task, now)} /></td>
        {CHECK_PHASES.map(phase => {
          const result = phaseSummary(task, phase, now);
          return <td key={phase}><button type="button" className="cw-verification-cell" aria-label={`${task.title} ${PHASE_LABELS[phase]} 기록 편집`} onClick={() => onEdit(task)}><WorkBadge tone={result.status === "실패" ? "red" : result.status === "통과" ? "green" : "gray"}>{result.status}</WorkBadge><span>{result.total ? `${result.completed}/${result.total} 증빙 유효` : "검증 항목 없음"}</span></button></td>;
        })}</tr>)}</tbody>
    </table></div>
  </section>;
}
