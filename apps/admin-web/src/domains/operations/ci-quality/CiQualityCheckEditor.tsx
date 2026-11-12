import { useState } from "react";

import { getFreshness, statusLabels, validateQualityBoard } from "./ci-quality-model";
import { QualityDialog, QualityFormError, qualityFormValue, qualityIsoTime, qualityLocalTime } from "./quality-ui";

import type { QualityBoard, QualityCheck } from "./ci-quality-model";

export function CiQualityCheckEditor({ check, board, initialTab = "evidence", onSave, onClose }: {
  check: QualityCheck;
  board: QualityBoard;
  initialTab?: "evidence" | "failure" | "json";
  onSave: (check: QualityCheck) => string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState("");
  const fresh = getFreshness(check, board);
  const stats = [["passed", "통과"], ["failed", "실패"], ["skipped", "건너뜀"], ["total", "전체"], ["duration", "실행 시간(초)"]] as const;
  const failureFields = [["change", "관련 변경"], ["baseline", "이전 정상 상태 · SHA · 실행 시각"], ["diff", "이전 정상 상태와의 차이"], ["cause", "원인 · 근거 (추정인 경우 표시)"], ["action", "권장 조치"]] as const;

  return <QualityDialog title={`${check.name} 결과 기록`} description="실제 결과만 기록하세요. 상태와 근거의 최신성은 별도로 판정합니다. 토큰·쿠키·키는 입력하지 마세요." onClose={onClose}>
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const value = (key: string) => qualityFormValue(data, key);
      const number = (key: string) => value(key) === "" ? null : Number(value(key));
      try {
        const ciJson: unknown = value("ciJson") ? JSON.parse(value("ciJson")) : null;
        const candidate = {
          ...check,
          status: value("status"),
          scope: value("scope"), sha: value("sha"), executedAt: value("executedAt") === qualityLocalTime(check.executedAt) ? check.executedAt : qualityIsoTime(value("executedAt")),
          logUrl: value("logUrl"), summary: value("summary"),
          stats: { passed: number("passed"), failed: number("failed"), skipped: number("skipped"), total: number("total"), duration: number("duration") },
          failure: { change: value("change"), baseline: value("baseline"), diff: value("diff"), cause: value("cause"), action: value("action"), classification: value("classification") },
          ciJson,
          updatedAt: new Date().toISOString(),
        };
        if (ciJson !== null && (typeof ciJson !== "object" || Array.isArray(ciJson))) throw new Error("CI 요약 JSON은 객체여야 합니다.");
        const normalized = validateQualityBoard({ ...board, checks: board.checks.map((current) => current.id === check.id ? candidate : current) });
        const recorded = normalized.checks.find((current) => current.id === check.id);
        if (!recorded) throw new Error("검증 항목을 찾을 수 없습니다.");
        const failure = onSave(recorded);
        if (failure) setError(failure);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "기록 형식을 확인하세요.");
      }
    }}>
      <div className="ci-quality-dialog-body">
        <p className={`ci-quality-freshness ci-quality-freshness--${fresh.kind}`}><strong>{fresh.label}</strong> · {fresh.reason}</p>
        <div className="ci-quality-editor-tabs" role="group" aria-label="결과 기록 구역">
          {([["evidence", "실행 근거"], ["failure", "실패 분석"], ["json", "CI 요약 JSON"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div hidden={tab !== "evidence"} className="ci-quality-form-grid">
          <label>진행 상태<select name="status" defaultValue={check.status}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>근거 범위<input name="scope" defaultValue={check.scope} maxLength={500} placeholder="예: product shard · 전체 suite · 390px E2E" /></label>
          <label>근거 커밋 SHA (40자리)<input name="sha" defaultValue={check.sha} maxLength={40} spellCheck={false} /></label>
          <label>실행 시각 (이 기기의 시간대)<input type="datetime-local" name="executedAt" defaultValue={qualityLocalTime(check.executedAt)} /><small>표시와 내보내기는 KST/UTC 기준입니다.</small></label>
          <label>로그 URL<input type="url" name="logUrl" defaultValue={check.logUrl} maxLength={2048} placeholder="https://github.com/…/actions/runs/…" /></label>
          <label>검증 요약<input name="summary" defaultValue={check.summary} maxLength={4000} /></label>
          <fieldset className="ci-quality-full"><legend>테스트 통계 · 미입력은 미확인</legend><div className="ci-quality-stat-fields">{stats.map(([key, label]) => <label key={key}>{label}<input type="number" name={key} min="0" step={key === "duration" ? "any" : "1"} defaultValue={check.stats[key] ?? ""} /></label>)}</div><p>부분 실행과 전체 실행을 구분하세요. 서로 겹치는 실행을 합산하면 중복될 수 있습니다.</p></fieldset>
          <div className="ci-quality-full"><h3>저장소 검증 명령 · 참조 전용</h3><pre>{check.command}</pre><small>출처: {check.source}</small></div>
        </div>
        <div hidden={tab !== "failure"} className="ci-quality-form-grid">
          <label>실패 분류<select name="classification" defaultValue={check.failure.classification}><option value="unknown">미확인</option><option value="regression">회귀</option><option value="transient">일시 오류</option></select></label>
          {failureFields.map(([key, label]) => <label key={key}>{label}<textarea name={key} defaultValue={check.failure[key]} rows={3} maxLength={12000} /></label>)}
          <p className="ci-quality-full ci-quality-muted">로그 링크는 실행 근거 구역에 기록합니다. 코드 수정·재실행·배포가 필요하면 승인 대기에 제안만 남기세요.</p>
        </div>
        <div hidden={tab !== "json"}>
          <label>CI 결과 요약 JSON<textarea className="ci-quality-json" name="ciJson" rows={14} maxLength={200000} defaultValue={check.ciJson ? JSON.stringify(check.ciJson, null, 2) : ""} placeholder={'{ "workflow": "CI", "job": "core", "conclusion": "success", "headSha": "…", "scope": "product shard" }'} /></label>
          <p>원본 요약 객체를 기록합니다. 입력한 JSON만으로 성공 판정이나 CI 연결을 수행하지 않습니다. SHA·상태·통계와 대조하세요.</p>
        </div>
        <QualityFormError error={error} />
      </div>
      <footer className="ci-quality-dialog-footer"><span>기록 저장만 수행합니다. 외부 명령은 실행하지 않습니다.</span><button type="submit" className="ci-quality-primary">기록 저장</button></footer>
    </form>
  </QualityDialog>;
}
