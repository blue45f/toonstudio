import { useMemo, useState } from "react";

import { brushLabBenchmarkBundleFileName, createBrushLabBenchmarkBundleV2 } from "../../bench/metrics/competitor-benchmark-export";
import {
  runBrushLabCompetitorQualityBenchmark,
  runLongDurationDrawingSoakBenchmark,
  runMultiEngineBrushMatrixBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "../../bench/metrics/competitor-quality-bench";
import {
  WEBTOON_BRUSH_GENRE_RECOMMENDATIONS,
  evaluateWebtoonBrushVerifyAiGate,
  expandWebtoonBrushFreshLensDraft,
  type BrushLabFreshLensId,
  type WebtoonBrushGenreId,
} from "../../bench/metrics/webtoon-brush-verify-ai-remix";
import {
  QUADRATIC_PIGMENT_MODEL,
  evaluateAnisotropicSmudgeReservoirAndRake,
  evaluateCapillaryCauliflowerAndGranulation,
  evaluateCentrifugalBristleTurnSplayAndTilt,
  evaluateCentripetalCatmullCurvatureAdaptiveStamps,
  evaluateP5BrushWatercolorPolygonBleedAndGaussianPressure,
  evaluateQuadraticPigmentMix,
  evaluateSpectral38BandKubelkaMunkMix,
  evaluateSubpixelDualEnvelopeLineartAA,
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
  const [selectedGenreId, setSelectedGenreId] = useState<WebtoonBrushGenreId>("action-gpen-slash");
  const [selectedLensId, setSelectedLensId] = useState<BrushLabFreshLensId>("contrarian-take");
  const [showModeBDraft, setShowModeBDraft] = useState<boolean>(false);
  const [turnRateRadPerSec, setTurnRateRadPerSec] = useState<number>(9.5);
  const [tiltAltitudeDeg, setTiltAltitudeDeg] = useState<number>(28);

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

  const liveWave37 = useMemo(() => {
    const centripetal = evaluateCentripetalCatmullCurvatureAdaptiveStamps({
      controlPoints: [
        { x: 8, y: 40, pressure01: 0.35 },
        { x: 34, y: 10, pressure01: 0.72 },
        { x: 52, y: 46, pressure01: 0.88 },
        { x: 84, y: 14, pressure01: 0.42 },
      ],
      baseDiameterPx: 14,
      baseSpacingRatio: 0.12,
      curvatureTighteningGain: 2.6,
    });
    const subpixelAa = evaluateSubpixelDualEnvelopeLineartAA({
      canvasSizePx: 48,
      strokeWidthPx: 7,
      exitVelocityPxPerSec: 1500,
      aaBandPx: 1.15,
    });
    const bristleTurn = evaluateCentrifugalBristleTurnSplayAndTilt({
      bristleCount: 32,
      baseRadiusPx: 10,
      turnRateRadPerSec,
      speedPxPerSec: 680,
      tiltAltitudeDeg,
      stiffness01: 0.45,
      seed,
    });
    const capillary = evaluateCapillaryCauliflowerAndGranulation({
      wetness01: 0.82,
      evaporation01: 0.68,
      granulation01: pigmentMixRatio01,
      paperTooth01: 0.65,
      targetWashCeiling01: 0.68,
      seed,
    });
    const smudge = evaluateAnisotropicSmudgeReservoirAndRake({
      brushLoadRgb: { r: 0.94, g: 0.76, b: 0.14 },
      canvasSampleStrip: [
        { r: 0.14, g: 0.34, b: 0.78 },
        { r: 0.18, g: 0.4, b: 0.72 },
        { r: 0.24, g: 0.46, b: 0.66 },
      ],
      pickupRate01: pigmentMixRatio01 * 0.7,
      colorDepositRate01: 0.68,
      rakeBristleDepth01: 0.62,
    });
    return { centripetal, subpixelAa, bristleTurn, capillary, smudge };
  }, [pigmentMixRatio01, seed, tiltAltitudeDeg, turnRateRadPerSec]);

  const brushVerifyAiReport = useMemo(
    () =>
      evaluateWebtoonBrushVerifyAiGate({
        genreId: selectedGenreId,
        compositeBenchScore100: optimalProfile.verifiedCompositeScore100,
        chromaPreservationGain01: summaryReport.spectral38ChromaPreservationGain01,
        mudEliminationGain01: summaryReport.ghostWashMudEliminationGain01,
        eightHourFrameDriftPct: optimalProfile.verified8hFrameDriftPct,
      }),
    [
      selectedGenreId,
      optimalProfile.verifiedCompositeScore100,
      summaryReport.spectral38ChromaPreservationGain01,
      summaryReport.ghostWashMudEliminationGain01,
      optimalProfile.verified8hFrameDriftPct,
    ],
  );

  const activeBrushLens = useMemo(
    () =>
      brushVerifyAiReport.remixes.find((r) => r.id === selectedLensId) ??
      brushVerifyAiReport.remixes[0]!,
    [brushVerifyAiReport.remixes, selectedLensId],
  );

  const expandedModeBDraft = useMemo(
    () => expandWebtoonBrushFreshLensDraft(brushVerifyAiReport, selectedLensId),
    [brushVerifyAiReport, selectedLensId],
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
    const optimalOverrides = {
      grain: true,
      paperRoughness: optimalProfile.recommendedPaperTooth01,
      wetBeta: true,
      kmBeta: true,
      filter: "anisotropic" as const,
    };
    actions.setPreset("watercolor-wet");
    actions.setOverride(optimalOverrides);
    drawActions.setPreset("watercolor-wet");
    drawActions.setOverride(optimalOverrides);
    setAppliedBanner(
      `실서비스 최적 프로파일(${optimalProfile.profileId} · 종합 ${optimalProfile.verifiedCompositeScore100}점)을 브러시 랩 샌드박스 및 A/B 비교 설정에 적용했습니다.`,
    );
  };

  const handleApplyGenreRecommendation = (genreId: WebtoonBrushGenreId): void => {
    setSelectedGenreId(genreId);
    const rec =
      WEBTOON_BRUSH_GENRE_RECOMMENDATIONS.find((g) => g.genreId === genreId) ??
      WEBTOON_BRUSH_GENRE_RECOMMENDATIONS[0]!;
    const overrides = {
      grain: rec.enableGrain,
      paperRoughness: rec.recommendedPaperTooth01,
      wetBeta: rec.enableWetBeta,
      kmBeta: rec.enableKmBeta,
      filter: "anisotropic" as const,
    };
    actions.setPreset(rec.targetPresetId);
    actions.setOverride(overrides);
    drawActions.setPreset(rec.targetPresetId);
    drawActions.setOverride(overrides);
    setAppliedBanner(
      `웹툰 장르 프리셋 [${rec.labelKo}] (${rec.targetPresetId} · 종이 거칠기 ${rec.recommendedPaperTooth01})을 드로잉·비교 샌드박스에 적용했습니다.`,
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
        경쟁사 브러시 품질 역공학·R&amp;D 커널(구심 Catmull-Rom 곡률 적응 보간, 서브픽셀 SDF AA, 원심 강모 부채꼴 벌어짐, 모세관 꽃양배추 링, David Li 3D 유화/GGX, Tegaki Ghost-Buffer)과 자체 Sumi WebGPU Zero-Copy Indirect 엔진을 다각도로 검증하여 실서비스(<code>apps/web</code>) 최적 설정을 자동 도출합니다.
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

      <div className="lab-banner" data-testid="lab-webtoon-verify-ai-remix-panel">
        <div className="lab-button-row">
          <strong data-testid="lab-brush-verify-ai-badge">
            {brushVerifyAiReport.summaryBadgeKo}
          </strong>
        </div>
        <p className="lab-mono" data-testid="lab-brush-remix-header">
          {brushVerifyAiReport.remixHeaderKo}
        </p>
        <div className="lab-button-row" role="group" aria-label="웹툰 장르별 최적 브러시 추천">
          {WEBTOON_BRUSH_GENRE_RECOMMENDATIONS.map((rec) => (
            <button
              key={rec.genreId}
              type="button"
              className="lab-button"
              data-testid={`lab-genre-preset-${rec.genreId}`}
              aria-pressed={selectedGenreId === rec.genreId}
              onClick={() => handleApplyGenreRecommendation(rec.genreId)}
            >
              {rec.labelKo}
            </button>
          ))}
        </div>
        <p className="lab-muted" data-testid="lab-brush-genre-rationale">
          {brushVerifyAiReport.genreRecommendation.rationaleKo}
        </p>
        <div className="lab-button-row" role="group" aria-label="브러시 5-Lens 크리에이티브 리믹스">
          {brushVerifyAiReport.remixes.map((remix) => (
            <button
              key={remix.id}
              type="button"
              className="lab-button"
              data-testid={`lab-brush-fresh-lens-${remix.id}`}
              aria-pressed={selectedLensId === remix.id}
              onClick={() => setSelectedLensId(remix.id)}
            >
              {remix.badgeKo}
            </button>
          ))}
          <button
            type="button"
            className="lab-button"
            data-testid="lab-brush-toggle-mode-b-draft-btn"
            aria-pressed={showModeBDraft}
            onClick={() => setShowModeBDraft((v) => !v)}
          >
            {showModeBDraft ? "Mode B 초안 접기" : "Mode B 채널별 초안 펼치기"}
          </button>
        </div>
        <div data-testid="lab-brush-fresh-lens-detail">
          <p>
            <strong>{activeBrushLens.badgeKo}: {activeBrushLens.titleKo}</strong>
          </p>
          <p className="lab-muted">
            → <strong>Angle:</strong> {activeBrushLens.angleKo}
          </p>
          {activeBrushLens.actionableStepsKo ? (
            <ol className="lab-muted" data-testid="lab-brush-fresh-lens-steps">
              {activeBrushLens.actionableStepsKo.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          ) : null}
          {showModeBDraft ? (
            <div className="lab-banner" data-testid="lab-brush-mode-b-draft-card">
              <p className="lab-mono">
                [{expandedModeBDraft.channelFormatKo}] {expandedModeBDraft.headlineKo}
              </p>
              {expandedModeBDraft.bodyParagraphsKo.map((para, idx) => (
                <p key={idx} className="lab-muted">{para}</p>
              ))}
              <p className="lab-mono">{expandedModeBDraft.keyTakeawayKo}</p>
            </div>
          ) : null}
        </div>
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
          <dt title="구심 Catmull-Rom 곡률 적응형 스탬프 보간으로 감소한 코너 꺾임 비율">코너 꺾임 감소율</dt>
          <dd className="lab-mono">-{(summaryReport.centripetalCornerKinkReduction01 * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt title="서브픽셀 1px Smoothstep SDF AA 적용 시 대각선 계단 분산 감소율">서브픽셀 계단 감소</dt>
          <dd className="lab-mono">-{(summaryReport.subpixelAaStaircaseReduction01 * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt title="물리 강모 급선회 원심 부채꼴 벌어짐 배율">급선회 강모 벌어짐</dt>
          <dd className="lab-mono">{summaryReport.bristleCentrifugalFanSplayRatio.toFixed(2)}×</dd>
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
          <dt title="기존 수치 기준의 충족 여부이며 원산지·운영 승격 승인이 아니다">수치 품질 게이트</dt>
          <dd className={summaryReport.promotionGatePassed ? "lab-verdict-PASS" : "lab-verdict-FAIL"}>
            {summaryReport.promotionGatePassed ? "PASS (수치 기준 충족)" : "FAIL"}
          </dd>
        </div>
      </dl>

      <div className="lab-banner" data-testid="lab-wave37-competitor-parity-simulator">
        <strong>Wave 37 경쟁사 1:1 패리티 물리·보간 실시간 R&amp;D 검증기 (Catmull 적응 스탬프 · 서브픽셀 AA · 원심 강모 · 모세관 링)</strong>
        <div className="lab-button-row">
          <label htmlFor="lab-wave37-turn-rate-slider">
            선회 각속도(rad/s): <span className="lab-mono">{turnRateRadPerSec.toFixed(1)}</span>
          </label>
          <input
            id="lab-wave37-turn-rate-slider"
            type="range"
            min={0}
            max={18}
            step={0.5}
            value={turnRateRadPerSec}
            data-testid="lab-wave37-turn-rate-slider"
            onChange={(e) => setTurnRateRadPerSec(Number(e.target.value))}
          />
          <label htmlFor="lab-wave37-tilt-altitude-slider">
            펜 기울기 고도각(°): <span className="lab-mono">{tiltAltitudeDeg}°</span>
          </label>
          <input
            id="lab-wave37-tilt-altitude-slider"
            type="range"
            min={15}
            max={85}
            step={5}
            value={tiltAltitudeDeg}
            data-testid="lab-wave37-tilt-altitude-slider"
            onChange={(e) => setTiltAltitudeDeg(Number(e.target.value))}
          />
        </div>
        <p className="lab-mono" data-testid="lab-wave37-live-readout">
          구심 Catmull 스탬프 {liveWave37.centripetal.adaptiveStamps.length}개(콩알자국 이득 -{(liveWave37.centripetal.scallopReductionGain01 * 100).toFixed(1)}% · 코너 꺾임 -{(liveWave37.centripetal.cornerKinkReductionRatio01 * 100).toFixed(1)}%) · 서브픽셀 SDF AA 계단 분산 -{(liveWave37.subpixelAa.edgeStaircaseVarianceReduction01 * 100).toFixed(1)}%(끝선 반경 {liveWave37.subpixelAa.terminalRadiusPx.toFixed(2)}px) · 원심 강모 부채꼴 {liveWave37.bristleTurn.centrifugalFanSplayRatio.toFixed(2)}×(기울기 측면 종횡비 {liveWave37.bristleTurn.tiltedBroadSideAspectRatio.toFixed(2)}×) · 모세관 엣지 링 대비 +{(liveWave37.capillary.edgeRingContrastGain01 * 100).toFixed(1)}%(천장 위반 {liveWave37.capillary.ghostCeilingViolationCount}건) · 스머지 연속성 {(liveWave37.smudge.pickupContinuityScore01 * 100).toFixed(1)}%
        </p>
      </div>

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
