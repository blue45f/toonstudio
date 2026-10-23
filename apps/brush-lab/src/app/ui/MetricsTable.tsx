import { flattenMetrics } from "../../bench/report/report-schema";
import { useLab } from "../shell/lab-context";
import { findDescriptor } from "../state/lane-helpers";
import { metricVerdictDisplay, verdictDisplay } from "../state/lane-maturity";

import type { BrushCertificationReport, ThresholdRule, Verdict } from "../../bench/report/report-schema";
import type { LaneDescriptor } from "../../lanes/lane";
import type { AbComparison } from "../state/bench-types";

export interface MetricsTableProps {
  reportA: BrushCertificationReport | null;
  reportB: BrushCertificationReport | null;
  comparison: AbComparison | null;
  laneA: string;
  laneB: string;
}

export function formatMetric(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4);
}

function thresholdText(rule: ThresholdRule | undefined): string {
  return rule ? `${rule.op} ${rule.threshold}` : "—";
}

const METRIC_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "fidelity.deltaEMean": "기준선 대비 평균 색차(CIEDE2000/OKLab ΔE) — 낮을수록 기준선과 색이 일치함",
  "fidelity.deltaEP99": "상위 99% 픽셀 색차 — 가장자리나 겹침 구간의 이상치 색차 확인용",
  "fidelity.deltaEMax": "최대 픽셀 색차",
  "fidelity.iou": "그려진 영역의 교집합/합집합 비율(0~1) — 1에 가까울수록 획 외곽선이 일치함",
  "fidelity.fuzzyMismatchPct": "3×3 이웃 내 허용 오차(δ48)를 벗어난 픽셀 비율(%) — 낮을수록 좋음",
  "performance.dabsPerSecond": "초당 처리한 브러시 스탬프(dab) 수 — 높을수록 처리량이 큼",
  "performance.frameP50Ms": "프레임 처리 시간 중앙값(ms)",
  "performance.frameP95Ms": "프레임 처리 시간 상위 95%(ms) — 끊김(히치) 지표",
  "performance.inputToSubmitP95Ms": "입력 샘플 수신부터 GPU/엔진 제출까지 지연 상위 95%(ms)",
};

function describeMetricKey(key: string): string | undefined {
  return METRIC_DESCRIPTIONS[key];
}

function verdictClass(verdict: Verdict | undefined, excluded: boolean): string | undefined {
  if (excluded) return "lab-verdict-EXCLUDED";
  return verdict ? `lab-verdict-${verdict}` : undefined;
}

/**
 * 지표별 판정 셀. 실험·미등록 레인은 합격/불합격 색 대신 참고용 스타일과 "(참고)" 문구로 그린다(인증 집계에서 제외된 레인의 PASS/FAIL이 인증처럼 읽히지 않게).
 * `desc`가 null이어도 리포트가 있으면 레지스트리에 없는 레인이다(안전한 쪽으로 참고 처리).
 */
function VerdictCell({ verdict, desc, hasReport }: { verdict: Verdict | undefined; desc: LaneDescriptor | null; hasReport: boolean }) {
  if (!hasReport) return <td>—</td>;
  const shown = metricVerdictDisplay(verdict, desc);
  const className = shown.reference ? "lab-verdict-REFERENCE" : verdict ? `lab-verdict-${verdict}` : undefined;
  return <td className={className}>{shown.text}</td>;
}

/** 지표·임계값·판정 표. 지표 키는 리포트의 `<group>.<key>` 평탄화 키를 그대로 쓴다. */
export function MetricsTable({ reportA, reportB, comparison, laneA, laneB }: MetricsTableProps) {
  const { registry } = useLab();
  // 실험 레인은 인증 판정(PASS/FAIL) 집계에서 제외한다: 종합 판정을 "인증 제외"로 바꾸고 원래 판정은 참고로만 남긴다.
  // 리포트가 있는데 레지스트리에 없는 레인이면 성숙도를 알 수 없으므로 안전한 쪽(인증 제외·"레인 미등록")으로 표시한다.
  const descA = reportA ? findDescriptor(registry, reportA.laneId) : null;
  const descB = reportB ? findDescriptor(registry, reportB.laneId) : null;
  const shownA = verdictDisplay(reportA?.verdict ?? null, reportA ? descA : undefined);
  const shownB = verdictDisplay(reportB?.verdict ?? null, reportB ? descB : undefined);
  const flatA = reportA ? flattenMetrics(reportA.metrics) : null;
  const flatB = reportB ? flattenMetrics(reportB.metrics) : null;
  const keys = Array.from(new Set([...Object.keys(flatA ?? {}), ...Object.keys(flatB ?? {})]));
  if (keys.length === 0 && !comparison) {
    return <p className="lab-muted">A/B를 실행하면 지표·임계값·판정이 여기에 표시된다.</p>;
  }
  const notes: { key: string; note: string; slot: "A" | "B" }[] = [];
  for (const [slot, report] of [
    ["A", reportA],
    ["B", reportB],
  ] as const) {
    if (!report) continue;
    for (const [key, note] of Object.entries(report.metricNotes)) notes.push({ key, note, slot });
  }
  const perfRows: { label: string; title?: string; a: string; b: string }[] = comparison
    ? [
        { label: "dabs/s", title: "초당 렌더링한 브러시 스탬프(dab) 처리량 (높을수록 빠름)", a: formatMetric(comparison.perfA.dabsPerSecond), b: formatMetric(comparison.perfB.dabsPerSecond) },
        { label: "프레임 p50(ms)", title: "프레임당 소요 시간 중앙값(ms)", a: formatMetric(comparison.perfA.frameP50Ms), b: formatMetric(comparison.perfB.frameP50Ms) },
        { label: "프레임 p95(ms)", title: "프레임당 소요 시간 상위 95%(ms)", a: formatMetric(comparison.perfA.frameP95Ms), b: formatMetric(comparison.perfB.frameP95Ms) },
        {
          label: "입력→제출 p95(ms)",
          title: "포인터 입력부터 렌더 제출까지 지연 시간 상위 95%(ms)",
          a: formatMetric(comparison.perfA.inputToSubmitP95Ms),
          b: formatMetric(comparison.perfB.inputToSubmitP95Ms),
        },
        { label: "GPU 시간(ms)", title: "GPU 타임스탬프 쿼리로 측정한 순수 커널/패스 실행 시간(ms)", a: formatMetric(comparison.perfA.gpuTimeMs), b: formatMetric(comparison.perfB.gpuTimeMs) },
        { label: "submit 수", title: "획 전체 동안 발생한 커맨드 버퍼 제출 횟수", a: formatMetric(comparison.perfA.submitCount), b: formatMetric(comparison.perfB.submitCount) },
      ]
    : [];
  return (
    <div className="lab-table-wrap">
      {keys.length > 0 ? (
        <table className="lab-table" aria-label="지표·임계값·판정">
          <caption className="lab-visually-hidden">레인별 지표 값과 임계값 판정</caption>
          <thead>
            <tr>
              <th scope="col">지표</th>
              <th scope="col">A ({laneA})</th>
              <th scope="col">B ({laneB})</th>
              <th scope="col">임계값</th>
              <th scope="col">판정 A</th>
              <th scope="col">판정 B</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const rule = reportA?.thresholds[key] ?? reportB?.thresholds[key];
              return (
                <tr key={key} data-testid={`lab-metric-${key}`}>
                  <th scope="row" className="lab-mono" title={describeMetricKey(key)}>
                    {key}
                  </th>
                  <td>{formatMetric(flatA?.[key])}</td>
                  <td>{formatMetric(flatB?.[key])}</td>
                  <td>{thresholdText(rule)}</td>
                  <VerdictCell verdict={reportA?.verdicts[key]} desc={descA} hasReport={reportA !== null} />
                  <VerdictCell verdict={reportB?.verdicts[key]} desc={descB} hasReport={reportB !== null} />
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {comparison ? (
        <table className="lab-table" aria-label="A/B 비교">
          <caption className="lab-visually-hidden">A와 B의 픽셀·성능 비교</caption>
          <thead>
            <tr>
              <th scope="col">비교 항목</th>
              <th scope="col">A ({comparison.laneA})</th>
              <th scope="col">B ({comparison.laneB})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" title="두 레인이 칠한 불투명 픽셀 영역의 교집합/합집합 비율(1.0이면 외곽 일치)">커버리지 IoU</th>
              <td colSpan={2}>{formatMetric(comparison.iou)}</td>
            </tr>
            <tr>
              <th scope="row" title="두 레인 출력 픽셀 간 지각 색차(평균 / 상위 99% / 최댓값, 0에 가까울수록 동일)">ΔE 평균 / p99 / 최대</th>
              <td colSpan={2}>
                {formatMetric(comparison.deltaE.mean)} / {formatMetric(comparison.deltaE.p99)} /{" "}
                {formatMetric(comparison.deltaE.max)}
              </td>
            </tr>
            <tr>
              <th scope="row" title="3×3 주변 픽셀과 비교해도 허용 색차(δ48)를 넘는 불일치 픽셀 비율(%)">퍼지 불일치(δ48, 3×3) %</th>
              <td colSpan={2}>{formatMetric(comparison.fuzzyMismatchPct)}</td>
            </tr>
            <tr>
              <th scope="row" title="비트 단위로 완전히 동일한 이미지인지 여부(FNV-1a 64비트 해시 비교)">픽셀 해시 동일</th>
              <td colSpan={2} className={comparison.hashEqual ? "lab-verdict-PASS" : "lab-verdict-FAIL"}>
                {comparison.hashEqual ? "동일" : "다름"}
              </td>
            </tr>
            <tr>
              <th scope="row" title="출력 RGBA 버퍼의 FNV-1a 64비트 해시값">픽셀 해시</th>
              <td className="lab-mono">{comparison.hashA}</td>
              <td className="lab-mono">{comparison.hashB}</td>
            </tr>
            {perfRows.map((row) => (
              <tr key={row.label}>
                <th scope="row" title={row.title}>{row.label}</th>
                <td>{row.a}</td>
                <td>{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p>
        <strong>종합 판정</strong> — A:{" "}
        <span className={verdictClass(reportA?.verdict, shownA.excluded)} data-testid="lab-verdict-a">
          {shownA.text}
        </span>{" "}
        · B:{" "}
        <span className={verdictClass(reportB?.verdict, shownB.excluded)} data-testid="lab-verdict-b">
          {shownB.text}
        </span>
        <span className="lab-muted"> (FAIL이 하나라도 있으면 FAIL, 측정 불가는 UNAVAILABLE)</span>
      </p>
      {shownA.excluded || shownB.excluded ? (
        <p className="lab-muted" role="note" data-testid="lab-verdict-excluded-note">
          {[shownA, shownB].some((v) => v.excluded && !v.unregistered) ? (
            <>
              실험 레인({[shownA.excluded && !shownA.unregistered ? "A" : null, shownB.excluded && !shownB.unregistered ? "B" : null].filter((s) => s !== null).join("·")})은 인증
              판정(PASS/FAIL) 집계에서 제외한다.{" "}
            </>
          ) : null}
          {[shownA, shownB].some((v) => v.unregistered) ? (
            <span data-testid="lab-verdict-unregistered-note">
              레지스트리에 없는 레인({[shownA.unregistered ? "A" : null, shownB.unregistered ? "B" : null].filter((s) => s !== null).join("·")})은 성숙도를 알 수 없어 안전하게 인증
              집계에서 제외하고 &quot;레인 미등록&quot;으로 표시한다.{" "}
            </span>
          ) : null}
          위 표의 지표·임계값 판정은 참고용이며 원래 종합 판정은{" "}
          {[shownA.excluded ? `A ${shownA.reference}` : null, shownB.excluded ? `B ${shownB.reference}` : null].filter((s) => s !== null).join(", ")}였다.
        </p>
      ) : null}
      {notes.length > 0 ? (
        <details>
          <summary>측정 불가 지표 사유 {notes.length}건</summary>
          <ul>
            {notes.map((n) => (
              <li key={`${n.slot}-${n.key}`}>
                [{n.slot}] <span className="lab-mono">{n.key}</span>: {n.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
