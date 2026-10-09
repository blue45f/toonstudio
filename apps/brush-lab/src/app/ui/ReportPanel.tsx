import { downloadJson, downloadPng } from "../../platform/download";
import { useLab, useLabSelector } from "../shell/lab-context";
import { findDescriptor } from "../state/lane-helpers";
import { rawVerdictNoteKo } from "../state/lane-maturity";
import { messageOf } from "../state/run-compare";

import type { BrushCertificationReport } from "../../bench/report/report-schema";
import type { LabImage } from "../../engine/core/types";

/** JSON/PNG 리포트 다운로드(Blob URL은 platform/download가 revoke를 보장한다). */
export function ReportPanel() {
  const { runner, actions, registry } = useLab();
  const results = useLabSelector((s) => s.results);
  const laneA = useLabSelector((s) => s.laneA);
  const laneB = useLabSelector((s) => s.laneB);

  const fail = (what: string, error: unknown): void =>
    actions.pushError({ laneId: null, code: "download-failed", message: `${what} 실패: ${messageOf(error)}` });

  const saveJson = (report: BrushCertificationReport): void => {
    try {
      downloadJson(runner.reportFileName(report), runner.serializeReport(report));
    } catch (error) {
      fail("JSON 다운로드", error);
    }
  };
  const savePng = (name: string, image: LabImage): void => {
    try {
      downloadPng(name, runner.labImageToPngBytes(image));
    } catch (error) {
      fail("PNG 다운로드", error);
    }
  };
  const pngName = (report: BrushCertificationReport | null, fallback: string): string =>
    report ? runner.reportFileName(report).replace(/\.json$/u, ".png") : `${fallback}.png`;

  const hasAny = results.a !== null || results.b !== null;
  // 다운로드 JSON의 verdict는 성숙도를 담지 않는 원시 판정이다 — 실험·미등록 레인이면 밖으로 가져가기 전에 알린다(스키마 변경은 하지 않는다).
  const rawNotes = [results.reportA, results.reportB]
    .filter((r): r is BrushCertificationReport => r !== null)
    .map((r) => rawVerdictNoteKo(findDescriptor(registry, r.laneId)))
    .filter((n): n is string => n !== null);
  return (
    <div className="lab-button-row" data-testid="lab-report-panel">
      <button type="button" className="lab-button lab-button--primary" disabled={!results.reportA} onClick={() => results.reportA && saveJson(results.reportA)}>
        JSON 다운로드 (A)
      </button>
      <button type="button" className="lab-button lab-button--primary" disabled={!results.reportB} onClick={() => results.reportB && saveJson(results.reportB)}>
        JSON 다운로드 (B)
      </button>
      <button type="button" className="lab-button" disabled={!results.a} onClick={() => results.a && savePng(pngName(results.reportA, `${laneA}-a`), results.a.image)}>
        PNG 다운로드 (A)
      </button>
      <button type="button" className="lab-button" disabled={!results.b} onClick={() => results.b && savePng(pngName(results.reportB, `${laneB}-b`), results.b.image)}>
        PNG 다운로드 (B)
      </button>
      <button
        type="button"
        className="lab-button"
        disabled={!results.comparison}
        onClick={() => results.comparison && savePng(`diff-${results.comparison.laneA}-vs-${results.comparison.laneB}.png`, results.comparison.heatmap)}
      >
        차이맵 PNG
      </button>
      <span className="lab-muted">
        {hasAny
          ? results.source === "live"
            ? "실시간 획 결과(리포트는 캡처 획을 A/B 실행해 생성)"
            : `리포트 ${[results.reportA, results.reportB].filter((r) => r !== null).length}개 · 세션 리포트 탭에 추가됨`
          : "실행 결과가 없다."}
      </span>
      {rawNotes.length > 0 ? (
        <p className="lab-muted" role="note" data-testid="lab-report-panel-note">
          {rawNotes[0]}
        </p>
      ) : null}
    </div>
  );
}
