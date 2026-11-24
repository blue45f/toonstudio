import { blankCheck, CHECK_PHASES, CHECK_STATES, currentCheckState, inputTime, OPS, PHASE_LABELS, stampISO } from "@toonstudio/contracts/admin-cloud-workboard";
import { useState } from "react";

import { WorkBadge, WorkCallout, WorkField, WorkIcon, WorkLink, WorkSelect } from "./cloud-work-ui";
import "./cloud-work-verification.css";

import type { Task, VerificationCheck } from "@toonstudio/contracts/admin-cloud-workboard";

interface Props { task: Task; update: (patch: Partial<Task>) => void }
const MAX_CHECKS = 60;

export function CloudWorkVerificationEditor({ task, update }: Props) {
  const [timeErrors, setTimeErrors] = useState<Record<string, string>>({});
  const change = (id: string, patch: Partial<VerificationCheck>) => update({
    verificationChecks: task.verificationChecks.map(check => check.id === id ? { ...check, ...patch } : check),
  });
  const changeTime = (id: string, value: string) => {
    try {
      const observedAt = stampISO(value);
      change(id, { observedAt });
      setTimeErrors(current => ({ ...current, [id]: "" }));
    } catch {
      setTimeErrors(current => ({ ...current, [id]: "시각 형식을 확인해 주세요." }));
    }
  };
  const missingPhases = CHECK_PHASES.filter(phase => !task.verificationChecks.some(check => check.phase === phase));
  return <>
    <WorkCallout>검증 대상 SHA·환경·원문 링크와 직접 확인한 시각을 기록하세요. 대상이 바뀌거나 근거가 오래되면 현재 판정은 미확인이며, 기록된 결과는 보존됩니다.</WorkCallout>
    <div className="cw-section-heading"><h3>검증 단계 <span>{task.verificationChecks.length}/{MAX_CHECKS}</span></h3>
      <button type="button" disabled={!missingPhases.length || task.verificationChecks.length + missingPhases.length > MAX_CHECKS} onClick={() => update({ verificationChecks: [...task.verificationChecks, ...missingPhases.map(phase => blankCheck(phase))] })}><WorkIcon name="add" />기본 단계 추가</button>
    </div>
    {CHECK_PHASES.map(phase => {
      const checks = task.verificationChecks.filter(check => check.phase === phase);
      const confirmed = checks.filter(check => ["통과", "해당 없음"].includes(currentCheckState(task, check))).length;
      const failed = checks.some(check => currentCheckState(task, check) === "실패");
      return <section key={phase} className="cw-verification-phase" aria-label={PHASE_LABELS[phase]}>
        <div className="cw-section-heading"><h3>{PHASE_LABELS[phase]}</h3><div className="cw-badges">
          <WorkBadge tone={failed ? "red" : checks.length > 0 && confirmed === checks.length ? "teal" : "gray"}>{failed ? "실패" : checks.length > 0 && confirmed === checks.length ? "확인" : "미확인"} · {confirmed}/{checks.length}</WorkBadge>
          <button type="button" aria-label={`${PHASE_LABELS[phase]} 검사 추가`} disabled={task.verificationChecks.length >= MAX_CHECKS} onClick={() => update({ verificationChecks: [...task.verificationChecks, blankCheck(phase)] })}><WorkIcon name="add" />검사 추가</button>
        </div></div>
        {!checks.length && <p className="cw-muted">검증 항목 미확인 · 필요한 검사를 등록하세요.</p>}
        {task.verificationChecks.map((check, index) => {
          if (check.phase !== phase) return null;
          const label = `검사 ${index + 1}`;
          const state = currentCheckState(task, check);
          return <fieldset className="cw-verification-check" key={check.id}><legend>{label} · {check.label}</legend>
            <div className="cw-spread cw-check-toolbar">
              <label className="cw-check"><input type="checkbox" aria-label={`${label} 필수 검증`} checked={check.required} onChange={event => change(check.id, { required: event.target.checked })} />필수 검증</label>
              <WorkBadge tone={state === "실패" ? "red" : state === "통과" || state === "해당 없음" ? "teal" : "gray"}>현재 판정: {state}</WorkBadge>
              <button type="button" className="cw-danger-text" aria-label={`${label} 기록 제거`} onClick={() => update({ verificationChecks: task.verificationChecks.filter(item => item.id !== check.id) })}><WorkIcon name="x" />기록 제거</button>
            </div>
            {state !== check.state && <p className="cw-warning-text">기록된 결과는 {check.state}입니다. 대상 SHA·환경과 근거의 최신성을 다시 확인하세요.</p>}
            <div className="cw-form-grid">
              <WorkField label={`${label} 항목`} wide><input aria-label={`${label} 항목`} maxLength={300} value={check.label} onChange={event => change(check.id, { label: event.target.value })} /></WorkField>
              <WorkField label={`${label} 기록된 결과`}><WorkSelect label={`${label} 기록된 결과`} value={check.state} options={CHECK_STATES} onChange={value => change(check.id, { state: value as VerificationCheck["state"] })} /></WorkField>
              <WorkField label={`${label} 환경·확인 범위`}><input aria-label={`${label} 환경·확인 범위`} maxLength={300} value={check.environment} onChange={event => change(check.id, { environment: event.target.value })} /></WorkField>
              <WorkField label={`${label} 대상 전체 SHA`} wide><input aria-label={`${label} 대상 전체 SHA`} maxLength={40} value={check.subjectSha} onChange={event => change(check.id, { subjectSha: event.target.value })} /></WorkField>
              <WorkField label={`${label} 근거 URL`} wide><input aria-label={`${label} 근거 URL`} maxLength={2000} value={check.evidenceUrl} onChange={event => change(check.id, { evidenceUrl: event.target.value })} /></WorkField>
              <WorkField label={`${label} 로그 URL`} wide><input aria-label={`${label} 로그 URL`} maxLength={2000} value={check.logUrl} onChange={event => change(check.id, { logUrl: event.target.value })} /></WorkField>
              <WorkField label={`${label} 확인 시각 (KST)`}><input aria-label={`${label} 확인 시각 (KST)`} aria-invalid={!!timeErrors[check.id]} type="datetime-local" value={inputTime(check.observedAt)} onChange={event => changeTime(check.id, event.target.value)} />{timeErrors[check.id] && <small role="alert">{timeErrors[check.id]}</small>}</WorkField>
              <WorkField label={`${label} 결과 범위·실패·적용 제외 사유`} wide><textarea aria-label={`${label} 결과 범위·실패·적용 제외 사유`} rows={3} maxLength={6000} value={check.reason} onChange={event => change(check.id, { reason: event.target.value })} /></WorkField>
            </div>
            <div className="cw-badges"><WorkLink url={check.evidenceUrl}>검증 근거 열기</WorkLink><WorkLink url={check.logUrl}>원본 로그 열기</WorkLink></div>
          </fieldset>;
        })}
      </section>;
    })}
    <div className="cw-section-heading"><h3>워킹트리·브랜치 보존과 정리</h3></div>
    <div className="cw-form-grid">
      <WorkField label="정리 상태"><WorkSelect label="정리 상태" value={task.cleanupStatus} options={OPS} onChange={value => update({ cleanupStatus: value as Task["cleanupStatus"] })} /></WorkField>
      {([["worktreeCount", "등록 워킹트리 수"], ["unmergedBranchCount", "미병합 브랜치 수"], ["stashCount", "stash 수"]] as const).map(([key, label]) => <WorkField label={label} key={key} hint="확인하지 못한 수량은 빈칸으로 둡니다."><input aria-label={label} type="number" min={0} max={100000} value={task[key] ?? ""} onChange={event => update({ [key]: event.target.value === "" ? null : Number(event.target.value) })} /></WorkField>)}
      <WorkField label="원본 보존·정리 범위" wide><textarea aria-label="원본 보존·정리 범위" maxLength={6000} rows={3} value={task.preservationNote} onChange={event => update({ preservationNote: event.target.value })} /></WorkField>
      <WorkField label="보존 확인 근거 URL" wide><input aria-label="보존 확인 근거 URL" maxLength={2000} value={task.preservationLink} onChange={event => update({ preservationLink: event.target.value })} /></WorkField>
    </div>
    <WorkCallout tone="warning">브랜치 삭제와 변경 사항 폐기는 개요의 담당 조치 유형에서 선택해 승인 대기로 기록합니다. 검증 항목 제거는 보드의 편집이며 저장소 명령을 실행하지 않습니다.</WorkCallout>
  </>;
}
