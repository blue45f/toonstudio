/**
 * 학생 학기 포트폴리오 패키지(웹 요약 · 인쇄용 마크다운 · JSON) 1클릭 생성·내보내기 카드.
 */

import { Download, FileText } from "lucide-react";
import { useState, type ReactElement } from "react";

import type { RubricGrade, StudentPortfolioBundle } from "./classroom-critique-rubric";

export interface ClassroomPortfolioExportCardProps {
  readonly bundle: StudentPortfolioBundle;
  readonly isKo: boolean;
  readonly onDownloadJson: (filename: string, jsonText: string) => void;
}

function gradeBadgeClass(grade: RubricGrade): string {
  if (grade === "S" || grade === "A") return "ccr-pill ccr-pill-good ccr-num";
  if (grade === "B") return "ccr-pill ccr-pill-accent ccr-num";
  return "ccr-pill ccr-pill-bad ccr-num";
}

export function ClassroomPortfolioExportCard({
  bundle,
  isKo,
  onDownloadJson,
}: ClassroomPortfolioExportCardProps): ReactElement {
  const pick = (ko: string, en: string): string => (isKo ? ko : en);
  const [format, setFormat] = useState<"web" | "print" | "json">("web");
  const [builtNotice, setBuiltNotice] = useState("");

  function handleBuildPortfolio(): void {
    setBuiltNotice(
      pick(
        `학기 포트폴리오 패키지 생성 완료 · B등급 이상 ${bundle.includedWorks.length}편 수록 (${bundle.overallGrade}등급)`,
        `Semester portfolio package ready · ${bundle.includedWorks.length} Grade B+ work(s) included (Grade ${bundle.overallGrade})`,
      ),
    );
  }

  return (
    <article className="ccr-card" data-testid="ccr-portfolio-panel">
      <div className="ccr-head-inline">
        <div>
          <h3>{pick("학생 학기 포트폴리오 패키지 (B등급 이상 자동 수록)", "Student Term Portfolio Package (Grade B+ Auto-Included)")}</h3>
          <p className="ccr-meta" data-testid="ccr-portfolio-summary">
            {pick(bundle.webSummaryKo, bundle.webSummaryEn)}
          </p>
        </div>
        <div className="ccr-row-actions">
          <button
            type="button"
            className="ccr-btn ccr-btn-primary"
            data-testid="ccr-build-portfolio-btn"
            onClick={handleBuildPortfolio}
          >
            <FileText size={15} aria-hidden="true" />
            {pick("1클릭 포트폴리오 생성", "Build Portfolio Bundle")}
          </button>
          <button
            type="button"
            className="ccr-btn"
            data-testid="ccr-download-portfolio-btn"
            onClick={() => onDownloadJson(`toonstudio-portfolio-${bundle.studentId}.json`, bundle.jsonPayload)}
          >
            <Download size={15} aria-hidden="true" />
            {pick("JSON 내보내기", "Export JSON")}
          </button>
        </div>
      </div>

      {builtNotice && (
        <p className="ccr-pill ccr-pill-good" role="status" data-testid="ccr-portfolio-status">
          {builtNotice}
        </p>
      )}

      <div className="ccr-row-actions" role="group" aria-label={pick("포트폴리오 출력 형식 선택", "Choose portfolio output format")}>
        <button type="button" className="ccr-btn" aria-pressed={format === "web"} onClick={() => setFormat("web")}>
          {pick("웹 요약", "Web Summary")}
        </button>
        <button type="button" className="ccr-btn" aria-pressed={format === "print"} onClick={() => setFormat("print")}>
          {pick("인쇄용 마크다운", "Print Sheet")}
        </button>
        <button type="button" className="ccr-btn" aria-pressed={format === "json"} onClick={() => setFormat("json")}>
          {pick("JSON 데이터", "JSON Payload")}
        </button>
      </div>

      {format === "web" && (
        <ul className="ccr-pin-list" data-testid="ccr-portfolio-works-list">
          {bundle.includedWorks.map((work) => (
            <li key={work.submissionId} className="ccr-subcard">
              <div className="ccr-head-inline">
                <strong>
                  W{String(work.week).padStart(2, "0")} · {pick(work.titleKo, work.titleEn)} ({work.cutLabel})
                </strong>
                <span className={gradeBadgeClass(work.grade)}>
                  {work.totalScore}/25 · {work.grade}
                </span>
              </div>
              <p className="ccr-meta ccr-num">
                {pick(work.summaryKo, work.summaryEn)} ·{" "}
                {pick(`첨삭 반영 ${work.resolvedPinCount}/${work.totalPinCount}`, `Pins Resolved ${work.resolvedPinCount}/${work.totalPinCount}`)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {format === "print" && (
        <pre className="ccr-code-preview" data-testid="ccr-portfolio-print-preview">
          {pick(bundle.printableMarkdownKo, bundle.printableMarkdownEn)}
        </pre>
      )}
      {format === "json" && (
        <pre className="ccr-code-preview ccr-num" data-testid="ccr-portfolio-json-preview">
          {bundle.jsonPayload}
        </pre>
      )}
    </article>
  );
}
