import { useMemo, useState } from "react";

import { brushLabBenchmarkBundleFileName, createBrushLabBenchmarkBundleV2 } from "../../bench/metrics/competitor-benchmark-export";
import {
  runBrushLabCompetitorQualityBenchmark,
  runLongDurationDrawingSoakBenchmark,
  runMultiEngineBrushMatrixBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "../../bench/metrics/competitor-quality-bench";
import {
  QUADRATIC_PIGMENT_MODEL,
  evaluateP5BrushWatercolorPolygonBleedAndGaussianPressure,
  evaluateQuadraticPigmentMix,
  evaluateSpectral38BandKubelkaMunkMix,
} from "../../engine/brush-engine/competitor-quality-kernels";
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
  const [pigmentMixRatio01, setPigmentMixRatio01] = useState<number>(0.5);

  const summaryReport = useMemo(() => runBrushLabCompetitorQualityBenchmark(seed), [seed]);
  const engineMatrix = useMemo(() => runMultiEngineBrushMatrixBenchmark(seed), [seed]);
  const soakHorizons = useMemo(() => runLongDurationDrawingSoakBenchmark(), []);
  const optimalProfile = useMemo(() => selectOptimalServiceBrushConfiguration(seed), [seed]);
  const liveSpectralMix = useMemo(
    () =>
      evaluateSpectral38BandKubelkaMunkMix({
        colorASrgb01: { r: 0.98, g: 0.88, b: 0.05 },
        colorBSrgb01: { r: 0.04, g: 0.16, b: 0.62 },
        factorA: 1 - pigmentMixRatio01,
        factorB: pigmentMixRatio01,
        tintingStrengthA: 1.0,
        tintingStrengthB: 1.15,
      }),
    [pigmentMixRatio01],
  );
  const liveQuadraticPigment = useMemo(
    () =>
      evaluateQuadraticPigmentMix(
        { r: 0.99, g: 0.85, b: 0.02 },
        { r: 0.05, g: 0.14, b: 0.58 },
        pigmentMixRatio01,
      ),
    [pigmentMixRatio01],
  );
  const liveP5Bleed = useMemo(
    () =>
      evaluateP5BrushWatercolorPolygonBleedAndGaussianPressure({
        basePolygon: [
          { x: 10, y: 10 },
          { x: 50, y: 10 },
          { x: 50, y: 50 },
          { x: 10, y: 50 },
        ],
        bleedStrength01: pigmentMixRatio01,
        bleedDirection: "out",
        growthIterations: 2,
        strokeLengthPx: 120,
        sampleArcPosPx: 54,
        seed,
      }),
    [pigmentMixRatio01, seed],
  );

  const visibleEngines = promotedOnly
    ? engineMatrix.filter((row) => row.promotedToService)
    : engineMatrix;
  const promotedEngineCount = engineMatrix.filter((row) => row.promotedToService).length;

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
      createBrushLabBenchmarkBundleV2({
        exportedAt: new Date().toISOString(),
        seed,
        optimalProfile,
        summaryReport,
        engineMatrix,
        soakHorizons,
      }),
      null,
      2,
    );
    downloadJson(brushLabBenchmarkBundleFileName(seed), payload);
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
            {promotedOnly ? `전체 ${engineMatrix.length}종 모두 보기` : `실서비스 승격 표시 항목(${promotedEngineCount}종)만 필터`}
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
            벤치마크 JSON v2 다운로드
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
          <dt title="기존 소스에 기록된 REA 값이며 이번 검토에서 원문 artifact를 확인한 것은 아니다">기록된 REA 누락값</dt>
          <dd className="lab-mono">{summaryReport.reaWave36NotExaminedCount}건 (기록 {summaryReport.reaWave36RelevantFiles}파일)</dd>
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
          <dd className="lab-mono">+{(summaryReport.ghostWashMudEliminationGain01 * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt title="Spectral.js 38밴드 Kubelka-Munk OKLab 채도 보존 이득">38밴드 KM 채도 이득</dt>
          <dd className="lab-mono">+{(summaryReport.spectral38ChromaPreservationGain01 * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt title="로컬 이차 다항식·RGB 잔차 모델의 끝점(t=0, t=1) 복원 오차">이차 안료 7D 끝점 오차</dt>
          <dd className="lab-verdict-PASS">{summaryReport.quadraticPigmentEndpointIdentityError.toFixed(4)}</dd>
        </div>
        <div>
          <dt title="Cook-Torrance GGX 미세면 정반사 임파스토 하이라이트 강도">GGX 임파스토 BRDF</dt>
          <dd className="lab-mono">{summaryReport.ggxSpecularHighlightBrdf.toFixed(3)}</dd>
        </div>
        <div>
          <dt title="기존 수치 기준의 충족 여부이며 원산지·운영 승격 승인이 아니다">수치 품질 게이트</dt>
          <dd className={summaryReport.promotionGatePassed ? "lab-verdict-PASS" : "lab-verdict-FAIL"}>
            {summaryReport.promotionGatePassed ? "PASS (수치 기준 충족)" : "FAIL"}
          </dd>
        </div>
      </dl>

      <div className="lab-banner" data-testid="lab-wave36-interactive-inspector">
        <label htmlFor="lab-wave36-pigment-ratio-slider">
          <strong>분광 혼색(Spectral 38밴드) · 로컬 이차 안료 7D · 수채 번짐(p5.brush) 시뮬레이터:</strong>{" "}
          <span className="lab-mono">{Math.round(pigmentMixRatio01 * 100)}%</span>
        </label>
        <input
          id="lab-wave36-pigment-ratio-slider"
          type="range"
          min={0.05}
          max={0.95}
          step={0.05}
          value={pigmentMixRatio01}
          aria-valuetext={`${Math.round(pigmentMixRatio01 * 100)}% 안료 혼합 및 수채 번짐 강도`}
          data-testid="lab-wave36-pigment-ratio-slider"
          onChange={(e) => setPigmentMixRatio01(Number(e.target.value))}
        />
        <p className="lab-mono" data-testid="lab-wave36-live-readout">
          Spectral38 OKLab(L={liveSpectralMix.oklabLCh.L.toFixed(2)}, C={liveSpectralMix.oklabLCh.C.toFixed(2)}, h={liveSpectralMix.oklabLCh.hDeg.toFixed(1)}°) · 채도 이득 +{(liveSpectralMix.chromaPreservationGain01 * 100).toFixed(1)}% · 이차 안료 7D RGB({Math.round(liveQuadraticPigment.mixedRgb01.r * 255)},{Math.round(liveQuadraticPigment.mixedRgb01.g * 255)},{Math.round(liveQuadraticPigment.mixedRgb01.b * 255)}) · p5.brush 수채 다각형 정점 {liveP5Bleed.grownVertices.length}개(면적 {liveP5Bleed.polygonAreaPx2}px² · 초가우시안 필압 {liveP5Bleed.superGaussianPressure01})
        </p>
        <p className="lab-muted" data-testid="lab-quadratic-pigment-status">
          로컬 이차 안료 모델은 계수 원산지·공식 호환·실측 성능이 미확인인 실험 항목이며 운영 승격 대상이 아닙니다.
        </p>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-labelledby="lab-multi-engine-bench-caption"
        className="lab-responsive-table-wrap"
        data-testid="lab-multi-engine-table-region"
      >
        <table className="lab-responsive-table" style={matrixTableStyle}>
          <caption id="lab-multi-engine-bench-caption">
            {engineMatrix.length}종 브러시 모델 아키텍처별 품질·지연·처리량·승격 표시 비교표 ({visibleEngines.length}개 표시)
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
                  {row.promotedToService ? "실서비스 승격 · " : row.engineId === QUADRATIC_PIGMENT_MODEL.id ? "로컬 실험 모델 · " : "오프라인 기준선 · "}
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
