import { useState } from "react";

import { downloadJson } from "../../platform/download";
import { useLab, useLabSelector } from "../shell/lab-context";
import { findDescriptor } from "../state/lane-helpers";
import { rawVerdictNoteKo, summarizeCertification, verdictDisplay } from "../state/lane-maturity";
import { messageOf } from "../state/run-compare";

/** 리포트 탭: 세션 안에서 만든 인증 리포트 목록과 원문(정규 직렬화) 보기. 서버 저장은 없다. */
export function ReportView() {
  const { runner, actions, registry } = useLab();
  const reports = useLabSelector((s) => s.reports);
  const [selected, setSelected] = useState<number>(0);
  const current = reports[selected] ?? reports[reports.length - 1] ?? null;
  const summary = summarizeCertification(reports, registry);
  const rawNote = current ? rawVerdictNoteKo(findDescriptor(registry, current.laneId)) : null;
  let raw: string | null = null;
  let rawError: string | null = null;
  if (current) {
    try {
      raw = runner.serializeReport(current);
    } catch (error) {
      rawError = messageOf(error);
    }
  }
  return (
    <div className="lab-tabpanel">
      <section className="lab-panel">
        <h2>세션 리포트 ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="lab-muted">A/B 비교를 실행하면 레인별 인증 리포트가 여기에 쌓인다(세션 메모리에만 있다).</p>
        ) : (
          <>
          <p data-testid="lab-report-summary">
            <strong>인증 집계</strong> — PASS {summary.pass} · FAIL {summary.fail} · UNAVAILABLE {summary.unavailable}
            {summary.excluded > 0 ? (
              <span className="lab-muted"> · 실험 레인 {summary.excluded}건은 인증 판정 집계에서 제외(참고용)</span>
            ) : null}
            {summary.unregistered > 0 ? (
              <span className="lab-muted" data-testid="lab-report-unregistered"> · 레인 미등록 {summary.unregistered}건은 성숙도를 알 수 없어 인증 집계에서 제외</span>
            ) : null}
          </p>
          <div className="lab-table-wrap">
            <table className="lab-table" aria-label="세션 리포트 목록">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">프리셋</th>
                  <th scope="col">레인</th>
                  <th scope="col">fixture</th>
                  <th scope="col">생성</th>
                  <th scope="col">판정</th>
                  <th scope="col">pixelHash</th>
                  <th scope="col">열기</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={`${r.createdAt}-${i}`} aria-selected={i === selected}>
                    <td>{i + 1}</td>
                    <td>{r.presetId}</td>
                    <td className="lab-mono">{r.laneId}</td>
                    <td>{r.fixtureId}</td>
                    <td>{r.createdAt}</td>
                    <td className={verdictDisplay(r.verdict, findDescriptor(registry, r.laneId)).excluded ? "lab-verdict-EXCLUDED" : `lab-verdict-${r.verdict}`}>
                      {verdictDisplay(r.verdict, findDescriptor(registry, r.laneId)).text}
                    </td>
                    <td className="lab-mono">{r.pixelHash}</td>
                    <td>
                      <button type="button" className="lab-button" onClick={() => setSelected(i)}>
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="lab-button-row">
          <button
            type="button"
            className="lab-button"
            disabled={!current}
            onClick={() => {
              if (!current) return;
              try {
                downloadJson(runner.reportFileName(current), runner.serializeReport(current));
              } catch (error) {
                actions.pushError({ laneId: null, code: "download-failed", message: `JSON 다운로드 실패: ${messageOf(error)}` });
              }
            }}
          >
            선택 리포트 JSON 다운로드
          </button>
          <button type="button" className="lab-button" disabled={reports.length === 0} onClick={() => actions.clearReports()}>
            목록 비우기
          </button>
        </div>
      </section>
      {current ? (
        <section className="lab-panel">
          <h2>
            원문 — {current.presetId} · {current.laneId}
          </h2>
          {rawNote !== null ? (
            <p className="lab-muted" role="note" data-testid="lab-report-raw-note">
              {rawNote}
            </p>
          ) : null}
          {raw !== null ? (
            <pre className="lab-pre lab-mono" data-testid="lab-report-raw">
              {raw}
            </pre>
          ) : (
            <p className="lab-error-list" role="alert">
              직렬화 실패: {rawError}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
