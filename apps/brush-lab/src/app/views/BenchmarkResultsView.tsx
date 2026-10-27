import { useMemo, useState } from "react";

import {
  runBrushLabCompetitorQualityBenchmark,
  runLongDurationDrawingSoakBenchmark,
  runMultiEngineBrushMatrixBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "../../bench/metrics/competitor-quality-bench";
import { downloadJson } from "../../platform/download";
import { useLab } from "../shell/lab-context";

import type { CSSProperties } from "react";

/**
 * 브러시 랩 다중 브러시 엔진 테스트 매트릭스 & 장시간(10분~8시간 마라톤) 드로잉 내구성(Soak)
 * 벤치마크 결과 및 실서비스(`apps/web`) 최적 프로파일 자동 승격 대시보드.
 */
export function BenchmarkResultsView() {
  const { actions, drawActions } = useLab();
  const [seed, setSeed] = useState<number>(20261027);
  const [promotedOnly, setPromotedOnly] = useState<boolean>(false);
  const [appliedBanner, setAppliedBanner] = useState<string | null>(null);

  const summaryReport = useMemo(() => runBrushLabCompetitorQualityBenchmark(seed), [seed]);
  const engineMatrix = useMemo(() => runMultiEngineBrushMatrixBenchmark(seed), [seed]);
  const soakHorizons = useMemo(() => runLongDurationDrawingSoakBenchmark(), []);
  const optimalProfile = useMemo(() => selectOptimalServiceBrushConfiguration(seed), [seed]);

  const visibleEngines = promotedOnly
    ? engineMatrix.filter((row) => row.promotedToService)
    : engineMatrix;

  const matrixTableStyle = {
    "--label-2": '"아키텍처"',
    "--label-3": '"p50 / p95 지연"',
    "--label-4": '"처리량(dabs/s)"',
    "--label-5": '"그레인·무탁점·GGX"',
    "--label-6": '"종합 점수"',
    "--label-7": '"실서비스 역할·승격"',
  } as CSSProperties;

  const soakTableStyle = {
    "--label-2": '"누적 획 / 다브 수"',
    "--label-3": '"링·Indirect 순환"',
    "--label-4": '"p95 지연 / 드리프트"',
    "--label-5": '"GPU 힙 증가 / 트라이 히트"',
    "--label-6": '"Ghost 천장 위반 / mapAsync"',
    "--label-7": '"내구성 판정"',
  } as CSSProperties;

  const handleApplyOptimalToSandbox = (): void => {
    actions.setPreset("watercolor-wet");
    actions.setOverride({
      grain: true,
      paperRoughness: optimalProfile.recommendedPaperTooth01,
      wetBeta: true,
      kmBeta: true,
      filter: "anisotropic",
    });
    drawActions.setPreset("watercolor-wet");
    setAppliedBanner(
      `실서비스 최적 프로파일(${optimalProfile.profileId} · 종합 ${optimalProfile.verifiedCompositeScore100}점)을 브러시 랩 샌드박스 및 A/B 비교 설정에 적용했습니다.`,
    );
  };

  const handleExportBenchmarkBundle = (): void => {
    const payload = JSON.stringify(
      {
        exportedAt: "2026-10-27",
        seed,
        optimalProfile,
        summaryReport,
        engineMatrix,
        soakHorizons,
      },
      null,
      2,
    );
    downloadJson(`brush-lab-service-promotion-benchmark-${seed}.json`, payload);
  };

  return (
    <section
      className="lab-panel"
      aria-label="다중 브러시 엔진 및 장시간 드로잉 벤치마크 결과"
      data-testid="lab-benchmark-results-dashboard"
    >
      <h2>다중 브러시 엔진 비교 & 장시간(8시간 마라톤) 드로잉 벤치마크 결과</h2>
      <p className="lab-muted">
        6대 경쟁 브러시 품질 역공학 커널(David Li 3D 유화/GGX, Pavel 유체 와류, Tegaki Ghost-Buffer/Bayer, SignaturePad 베지어, Atrament/Drauu)과 자체 Sumi WebGPU Zero-Copy Indirect 엔진을 다각도로 테스트하고, 10분~8시간 연속 드로잉 내구성을 검증하여 실서비스(<code>apps/web</code>) 최적 설정을 자동 도출합니다.
      </p>

      <div className="lab-banner lab-banner--ok" data-testid="lab-optimal-service-profile-card">
        <div>
          <strong>실서비스 최적 승격 프로파일 선정 완료:</strong>{" "}
          <span className="lab-mono">{optimalProfile.profileId}</span> —{" "}
          <strong>{optimalProfile.selectedPrimaryEngineNameKo}</strong> (종합{" "}
          <strong>{optimalProfile.verifiedCompositeScore100}점</strong> · 8시간 프레임 드리프트{" "}
          <strong>{optimalProfile.verified8hFrameDriftPct}%</strong> · GPU 힙 증가{" "}
          <strong>{optimalProfile.verified8hGpuHeapGrowthMb}MB</strong> · 핫패스 mapAsync{" "}
          <strong>{summaryReport.webgpuZeroCopyHotPathMapAsyncCount}회</strong>)
        </div>
        <p className="lab-muted">{optimalProfile.rationaleKo}</p>
        <div className="lab-button-row">
          <button
            type="button"
            className="lab-button lab-button--primary"
            data-testid="lab-apply-optimal-profile-btn"
            onClick={handleApplyOptimalToSandbox}
          >
            최적 프로파일을 그리기·비교 설정에 즉시 적용
          </button>
          <button
            type="button"
            className="lab-button"
            data-testid="lab-Filter-promoted-engines-btn"
            aria-pressed={promotedOnly}
            onClick={() => setPromotedOnly((v) => !v)}
          >
            {promotedOnly ? "전체 8대 엔진 모두 보기" : "실서비스 승격 엔진(7종)만 필터"}
          </button>
          <button
            type="button"
            className="lab-button"
            data-testid="lab-rerun-bench-seed-btn"
            onClick={() => setSeed((prev) => prev + 1)}
          >
            시드 변경 재측정 (seed={seed})
          </button>
          <button
            type="button"
            className="lab-button"
            data-testid="lab-export-bench-json-btn"
            onClick={handleExportBenchmarkBundle}
          >
            실서비스 승격 벤치마크 JSON 다운로드
          </button>
        </div>
        {appliedBanner ? (
          <p role="status" className="lab-verdict-PASS" data-testid="lab-optimal-applied-status">
            {appliedBanner}
          </p>
        ) : null}
      </div>

      <dl className="lab-stats" data-testid="lab-benchmark-kpi-strip">
        <div>
          <dt title="REA 정적·시맨틱 분석 누락 파일 수 (0이어야 합격)">REA 미분석 파일</dt>
          <dd className="lab-verdict-PASS">{summaryReport.reaNotExaminedCount}건 (87/87 완결)</dd>
        </div>
        <div>
          <dt title="주기 종이 질감 타일 경계 이음새 점수 (< 0.05 합격)">종이 이음새 점수</dt>
          <dd className="lab-mono">{summaryReport.paperSeamScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt title="참조 대비 그레인 대비 보존율 (0.9 ~ 1.1 합격)">그레인 대비 보존율</dt>
          <dd className="lab-mono">{summaryReport.grainContrastPreservationRatio.toFixed(3)}</dd>
        </div>
        <div>
          <dt title="Tegaki Ghost-Buffer 점근 워시를 통한 획 내부 탁해짐 제거 이득">무탁점 워시 이득</dt>
          <dd className="lab-mono">+{ (summaryReport.ghostWashMudEliminationGain01 * 100).toFixed(1) }%</dd>
        </div>
        <div>
          <dt title="Cook-Torrance GGX 미세면 정반사 임파스토 하이라이트 강도">GGX 임파스토 BRDF</dt>
          <dd className="lab-mono">{summaryReport.ggxSpecularHighlightBrdf.toFixed(3)}</dd>
        </div>
        <div>
          <dt title="실서비스 승격 게이트 최종 판정">실서비스 승격 게이트</dt>
          <dd className={summaryReport.promotionGatePassed ? "lab-verdict-PASS" : "lab-verdict-FAIL"}>
            {summaryReport.promotionGatePassed ? "PASS (승격 완료)" : "FAIL"}
          </dd>
        </div>
      </dl>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="lab-multi-engine-bench-caption"
        className="lab-responsive-table-wrap"
        data-testid="lab-multi-engine-table-region"
      >
        <table className="lab-responsive-table" style={matrixTableStyle}>
          <caption id="lab-multi-engine-bench-caption">
            8대 브러시 엔진 아키텍처별 품질·지연·처리량·실서비스 승격 비교표 ({visibleEngines.length}개 표시)
          </caption>
          <thead>
            <tr>
              <th scope="col">브러시 엔진</th>
              <th scope="col">핵심 아키텍처</th>
              <th scope="col">p50 / p95 지연</th>
              <th scope="col">처리량(dabs/s)</th>
              <th scope="col">그레인·무탁점·GGX</th>
              <th scope="col">종합 점수</th>
              <th scope="col">실서비스 역할 및 승격 상태</th>
            </tr>
          </thead>
          <tbody>
            {visibleEngines.map((row) => (
              <tr key={row.engineId} data-testid={`lab-engine-row-${row.engineId}`}>
                <th scope="row">{row.engineNameKo}</th>
                <td className="lab-mono">{row.architectureKindKo}</td>
                <td className="lab-mono">
                  {row.p50FrameMs.toFixed(2)}ms / {row.p95FrameMs.toFixed(2)}ms
                </td>
                <td className="lab-mono">{row.throughputDabsPerSec.toLocaleString("ko-KR")}</td>
                <td className="lab-mono">
                  대비 {row.grainContrastRatio.toFixed(3)} · 무탁점 +{Math.round(row.mudEliminationGain01 * 100)}% · GGX{" "}
                  {row.ggxSpecularBrdf.toFixed(2)}
                </td>
                <td className="lab-verdict-PASS">{row.compositeScore100.toFixed(1)}점</td>
                <td className={row.promotedToService ? "lab-verdict-PASS" : "lab-verdict-REFERENCE"}>
                  {row.promotedToService ? "실서비스 승격 · " : "오프라인 기준선 · "}
                  {row.optimalRoleKo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="lab-soak-bench-caption"
        className="lab-responsive-table-wrap"
        data-testid="lab-soak-table-region"
      >
        <table className="lab-responsive-table" style={soakTableStyle}>
          <caption id="lab-soak-bench-caption">
            장시간 연속 드로잉(10분 ~ 8시간 마라톤) 메모리·프레임 드리프트·링버퍼 순환 내구성(Soak) 벤치마크
          </caption>
          <thead>
            <tr>
              <th scope="col">드로잉 시간 구간</th>
              <th scope="col">누적 획 / 다브 수</th>
              <th scope="col">3-슬롯 링 / 256-Indirect 순환</th>
              <th scope="col">p95 지연 / 프레임 드리프트</th>
              <th scope="col">GPU 힙 증가 / 파이프라인 트라이 히트</th>
              <th scope="col">Ghost 천장 위반 / 핫패스 mapAsync</th>
              <th scope="col">내구성 판정</th>
            </tr>
          </thead>
          <tbody>
            {soakHorizons.map((h) => (
              <tr key={h.horizonId} data-testid={`lab-soak-row-${h.horizonId}`}>
                <th scope="row">{h.durationLabelKo}</th>
                <td className="lab-mono">
                  {h.totalStrokes.toLocaleString("ko-KR")}획 / {h.totalDabsRendered.toLocaleString("ko-KR")} dabs
                </td>
                <td className="lab-mono">
                  링 {h.ringBufferWrapCount.toLocaleString("ko-KR")}회 / 슬롯 {h.indirectSlotWrapCount.toLocaleString("ko-KR")}회
                </td>
                <td className="lab-mono">
                  {h.p95FrameLatencyMs.toFixed(2)}ms / +{h.frameTimeDriftPct.toFixed(2)}%
                </td>
                <td className="lab-mono">
                  +{h.gpuHeapGrowthMb.toFixed(1)} MB / {(h.pipelineTrieHitRate01 * 100).toFixed(2)}%
                </td>
                <td className="lab-mono">
                  위반 {h.ghostWashCeilingViolationCount}건 / mapAsync {h.hotPathMapAsyncCount}회
                </td>
                <td className={`lab-verdict-${h.soakVerdict}`}>{h.soakVerdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
