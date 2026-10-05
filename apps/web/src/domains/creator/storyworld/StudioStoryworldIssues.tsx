/**
 * 스토리월드 모순·위험 탭 — 인과 엔진 이슈 목록과 설정·연속성 검사 패널.
 *
 * 이슈 처리 상태(해결 표시·무시 사유)는 페이지가 소유한 문서(dispositions)를
 * 콜백으로만 다룬다. 연속성 이슈의 "설정에서 고치기"는 onFix로 위임한다.
 */
import { AlertTriangle, Info, WandSparkles, Wrench, XCircle } from "lucide-react";
import { useState } from "react";

import type {
  StoryworldAnalysisResult,
  StoryworldAxisId,
  StoryworldIssue,
  StoryworldSeverity,
} from "./studio-storyworld-causality";
import type { StoryworldContinuityIssue } from "./studio-storyworld-continuity";
import type {
  StoryworldIssueDispositionDocument,
  StoryworldIssueDispositionStatus,
} from "./studio-storyworld-issue-dispositions";
import { EmptyState, Panel } from "./StudioStoryworldLabShared";
import { AXIS_LABELS, SEVERITY_LABELS, severityIcon } from "./studio-storyworld-lab-display";

function IssueDispositionControls({ issueKey, dispositions, onSet, onClear }: {
  readonly issueKey: string;
  readonly dispositions: StoryworldIssueDispositionDocument | null;
  readonly onSet: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
  readonly onClear: (issueKey: string) => void;
}) {
  const [ignoring, setIgnoring] = useState(false);
  const [note, setNote] = useState("");
  const disposition = dispositions?.dispositions.find((item) => item.issueKey === issueKey) ?? null;
  if (disposition) {
    return (
      <div className="storyworld-disposition">
        <span className="storyworld-disposition__chip">
          {disposition.status === "resolved" ? "해결 표시됨" : "무시됨"}
        </span>
        {disposition.note ? <span className="storyworld-disposition__note">{disposition.note}</span> : null}
        <button className="storyworld-button" onClick={() => onClear(issueKey)} type="button">처리 되돌리기</button>
      </div>
    );
  }
  return (
    <div className="storyworld-disposition">
      <button className="storyworld-button" onClick={() => onSet(issueKey, "resolved")} type="button">해결 표시</button>
      {ignoring ? (
        <>
          <label className="sr-only" htmlFor={`ignore-note-${issueKey}`}>무시 사유</label>
          <input
            id={`ignore-note-${issueKey}`}
            onChange={(event) => setNote(event.target.value)}
            placeholder="무시 사유 (예: 의도된 연출)"
            value={note}
          />
          <button
            className="storyworld-button"
            onClick={() => { onSet(issueKey, "ignored", note.trim() ? note.trim() : undefined); setIgnoring(false); }}
            type="button"
          >
            무시 확정
          </button>
        </>
      ) : (
        <button className="storyworld-button" onClick={() => setIgnoring(true)} type="button">무시</button>
      )}
    </div>
  );
}

function ContinuityIssueCard({ issue, dispositions, onSet, onClear, onFix }: {
  readonly issue: StoryworldContinuityIssue;
  readonly dispositions: StoryworldIssueDispositionDocument | null;
  readonly onSet: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
  readonly onClear: (issueKey: string) => void;
  readonly onFix: (issue: StoryworldContinuityIssue) => void;
}) {
  return (
    <article className={`storyworld-issue storyworld-issue--${issue.severity}`}>
      {issue.severity === "error"
        ? <XCircle aria-hidden size={18} />
        : issue.severity === "warning"
          ? <AlertTriangle aria-hidden size={18} />
          : <Info aria-hidden size={18} />}
      <div>
        <div className="storyworld-issue__meta">
          <span>{SEVERITY_LABELS[issue.severity]}</span>
          <span>연속성 검사</span>
          <code>{issue.code}</code>
        </div>
        <p>{issue.messageKo}</p>
        <ul className="storyworld-issue__evidence">
          {issue.evidence.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="storyworld-disposition">
          <button className="storyworld-button storyworld-button--primary" onClick={() => onFix(issue)} type="button">
            <Wrench aria-hidden size={14} /> 설정에서 고치기
          </button>
        </div>
        <IssueDispositionControls dispositions={dispositions} issueKey={issue.id} onClear={onClear} onSet={onSet} />
      </div>
    </article>
  );
}

export function IssueList({ issues, limit, dispositions, onSetDisposition, onClearDisposition }: {
  readonly issues: readonly StoryworldIssue[];
  readonly limit?: number;
  readonly dispositions?: StoryworldIssueDispositionDocument | null;
  readonly onSetDisposition?: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
  readonly onClearDisposition?: (issueKey: string) => void;
}) {
  const visible = limit === undefined ? issues : issues.slice(0, limit);
  if (visible.length === 0) return <EmptyState>현재 필터에서 발견된 문제가 없습니다.</EmptyState>;
  return (
    <div className="storyworld-issue-list">
      {visible.map((issue) => {
        const Icon = severityIcon(issue.severity);
        return (
          <article className={`storyworld-issue storyworld-issue--${issue.severity}`} key={issue.id}>
            <Icon aria-hidden size={18} />
            <div>
              <div className="storyworld-issue__meta">
                <span>{SEVERITY_LABELS[issue.severity]}</span>
                <span>{AXIS_LABELS[issue.axis]}</span>
                {issue.sceneId ? <code>{issue.sceneId}</code> : null}
              </div>
              <p>{issue.message}</p>
              <small>{issue.code}</small>
              {onSetDisposition && onClearDisposition ? (
                <IssueDispositionControls
                  dispositions={dispositions ?? null}
                  issueKey={issue.id}
                  onClear={onClearDisposition}
                  onSet={onSetDisposition}
                />
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function IssuesTab({ result, continuityIssues, dispositions, onSetDisposition, onClearDisposition, onFixContinuity }: {
  readonly result: StoryworldAnalysisResult;
  readonly continuityIssues: readonly StoryworldContinuityIssue[];
  readonly dispositions: StoryworldIssueDispositionDocument | null;
  readonly onSetDisposition: (issueKey: string, status: StoryworldIssueDispositionStatus, note?: string) => void;
  readonly onClearDisposition: (issueKey: string) => void;
  readonly onFixContinuity: (issue: StoryworldContinuityIssue) => void;
}) {
  const [severity, setSeverity] = useState<StoryworldSeverity | "all">("all");
  const [axis, setAxis] = useState<StoryworldAxisId | "all">("all");
  const filtered = result.issues.filter((issue) =>
    (severity === "all" || issue.severity === severity)
      && (axis === "all" || issue.axis === axis),
  );
  const handledKeys = new Set((dispositions?.dispositions ?? []).map((item) => item.issueKey));
  const activeContinuity = continuityIssues.filter((issue) => !handledKeys.has(issue.id));
  const handledContinuity = continuityIssues.filter((issue) => handledKeys.has(issue.id));
  return (
    <div className="storyworld-tab-stack">
      <Panel
        description="인과 엔진이 보지 않는 행정적 불일치를 규칙으로만 검사합니다. 각 항목은 충돌한 데이터를 근거로 함께 보여 주며, 설정 관리 탭으로 바로 이동해 고칠 수 있습니다."
        title="설정·연속성 검사"
      >
        {continuityIssues.length === 0 ? (
          <EmptyState>연속성 검사에서 발견된 불일치가 없습니다.</EmptyState>
        ) : (
          <>
            <div className="storyworld-issue-list">
              {activeContinuity.map((issue) => (
                <ContinuityIssueCard
                  dispositions={dispositions}
                  issue={issue}
                  key={issue.id}
                  onClear={onClearDisposition}
                  onFix={onFixContinuity}
                  onSet={onSetDisposition}
                />
              ))}
            </div>
            {activeContinuity.length === 0 ? <EmptyState>활성 불일치가 없습니다. 처리된 항목은 아래에 있습니다.</EmptyState> : null}
            {handledContinuity.length > 0 ? (
              <details className="storyworld-handled">
                <summary>해결·무시됨 {handledContinuity.length}개</summary>
                <div className="storyworld-issue-list">
                  {handledContinuity.map((issue) => (
                    <ContinuityIssueCard
                      dispositions={dispositions}
                      issue={issue}
                      key={issue.id}
                      onClear={onClearDisposition}
                      onFix={onFixContinuity}
                      onSet={onSetDisposition}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </Panel>
      <Panel title="모순·위험 탐색기" description="필터는 표시만 바꾸며 분석 결과와 영수증을 변경하지 않습니다.">
        <div className="storyworld-filter-row">
          <label>
            심각도
            <select onChange={(event) => setSeverity(event.target.value as StoryworldSeverity | "all")} value={severity}>
              <option value="all">전체</option>
              <option value="error">오류</option>
              <option value="warning">경고</option>
              <option value="info">확인</option>
            </select>
          </label>
          <label>
            품질 축
            <select onChange={(event) => setAxis(event.target.value as StoryworldAxisId | "all")} value={axis}>
              <option value="all">전체</option>
              {Object.entries(AXIS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <span aria-live="polite">{filtered.length}개 표시</span>
        </div>
        <IssueList
          dispositions={dispositions}
          issues={filtered}
          onClearDisposition={onClearDisposition}
          onSetDisposition={onSetDisposition}
        />
      </Panel>
      <Panel title="비파괴 수선 의도" description="각 제안은 설명 가능한 중립 명령이며 명시적 승인 전에는 원고를 바꾸지 않습니다.">
        <div className="storyworld-proposal-grid">
          {result.repairProposals.map((proposal) => (
            <article className="storyworld-proposal" key={proposal.id}>
              <div className="storyworld-proposal__topline">
                <WandSparkles aria-hidden size={17} />
                <strong>{proposal.title}</strong>
                <span data-risk={proposal.risk}>위험 {proposal.risk}</span>
              </div>
              <p>{proposal.rationale}</p>
              <code>{proposal.intent.kind}</code>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
