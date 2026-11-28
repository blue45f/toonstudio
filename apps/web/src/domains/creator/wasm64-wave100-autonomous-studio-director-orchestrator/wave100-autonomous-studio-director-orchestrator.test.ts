import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCTION_STAGE_IDS,
  MASTER_RELEASE_INVARIANT_IDS,
  PRODUCTION_PHASES,
  PipelineCheckpointIntegrityError,
  ProductionDagCycleError,
  ProductionDagValidationError,
  RELEASE_SURFACE_TARGETS,
  canonicalizeWave100Json,
  computeCriticalPathSchedule,
  computeParallelExecutionWaves,
  computeWave100MerkleRootHex,
  createCanonicalWebtoonProductionDag,
  escapeDirectorSvgXml,
  evaluateMasterEpisodeReleaseGate,
  executeProductionPipeline,
  exportPipelineCheckpoint,
  renderWave100ProductionDirectorSvg,
  resumeProductionPipelineFromCheckpoint,
  sha256Wave100Hex,
  summarizeMasterProductionReleaseKo,
  verifyMasterReleaseCertificateIntegrity,
  verifyPipelineCheckpointIntegrity,
  type EpisodeMasterSnapshot,
  type MasterReleaseCertificate,
  type ProductionDagDefinition,
  type ProductionPhaseId,
  type ProductionStageSpec,
  type StageExecutionHandler,
} from "./index";

function createSampleMasterSnapshot(
  overrides?: Partial<EpisodeMasterSnapshot>,
): EpisodeMasterSnapshot {
  return {
    episodeId: "ep-100-capstone",
    episodeTitle: "제100화 별빛 종착역",
    seriesId: "series-starlight-chronicle",
    masterRevision: 4,
    panelCount: 68,
    targetRegions: ["KR", "JP", "US", "EU"],
    masterAssetFingerprint: "sha256:master-ep100-rev4-asset-tree",
    metadata: { authorHandle: "studio-blue45f", colorSpace: "display-p3" },
    ...overrides,
  };
}

function makeStage(
  id: string,
  dependsOn: readonly string[],
  estimatedDurationMs: number,
  phase: ProductionPhaseId = "preproduction",
): ProductionStageSpec {
  return {
    id,
    phase,
    labelKo: id,
    sourceWaves: [96],
    dependsOn,
    estimatedDurationMs,
    criticalForRelease: true,
    supportsSelfHealing: false,
    descriptionKo: id,
  };
}

describe("Wave 100 — 자율 에피소드 프로덕션 디렉터 & 크로스-엔진 DAG 오케스트레이터", () => {
  describe("FIPS 180-4 SHA-256 및 정규 JSON 직렬화", () => {
    it("표준 FIPS 180-4 SHA-256 벡터(빈 문자열·abc·UTF-8 한글)를 비트-정확하게 계산한다", () => {
      expect(sha256Wave100Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256Wave100Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      const koDigest = sha256Wave100Hex("툰스튜디오-웨이브100-마스터");
      expect(koDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(koDigest).toBe(sha256Wave100Hex("툰스튜디오-웨이브100-마스터"));
    });

    it("canonicalizeWave100Json이 키 순서에 무관한 동일 직렬화와 -0·비유한수 정규화를 보장한다", () => {
      const a = canonicalizeWave100Json({ z: 1, a: -0, nested: { b: true, a: [1, NaN] } });
      const b = canonicalizeWave100Json({ nested: { a: [1, Infinity], b: true }, a: 0, z: 1 });
      expect(a).toBe(b);
      expect(a).toBe('{"a":0,"nested":{"a":[1,null],"b":true},"z":1}');
    });

    it("computeWave100MerkleRootHex가 리프 순서 및 1문자 변경에 민감한 머클 루트를 계산한다", () => {
      const rootA = computeWave100MerkleRootHex(["h1", "h2", "h3"]);
      expect(rootA).toBe(computeWave100MerkleRootHex(["h1", "h2", "h3"]));
      expect(rootA).not.toBe(computeWave100MerkleRootHex(["h1", "h2", "h4"]));
      expect(computeWave100MerkleRootHex([])).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("표준 5단계·10스테이지 DAG 토폴로지 및 순환 검출", () => {
    it("표준 웹툰 프로덕션 DAG는 정확히 5개 페이즈와 10개 스테이지 및 전 웨이브 엔진을 포괄한다", () => {
      const dag = createCanonicalWebtoonProductionDag();
      expect(dag.stages).toHaveLength(10);
      expect(dag.stages.map((s) => s.id)).toEqual([...CANONICAL_PRODUCTION_STAGE_IDS]);
      const phases = new Set(dag.stages.map((s) => s.phase));
      for (const phase of PRODUCTION_PHASES) expect(phases.has(phase)).toBe(true);

      const waveSet = new Set<number>();
      for (const s of dag.stages) for (const w of s.sourceWaves) waveSet.add(w);
      for (const w of [68, 73, 74, 76, 79, 80, 82, 83, 86, 87, 88, 91, 92, 94, 95, 96, 97, 98]) {
        expect(waveSet.has(w)).toBe(true);
      }
    });

    it("병렬 웨이브 그룹핑이 위상 순서를 보존하며 최소 4개 스테이지를 동시 실행 레인에 배치한다", () => {
      const dag = createCanonicalWebtoonProductionDag();
      const waves = computeParallelExecutionWaves(dag);
      expect(waves).toHaveLength(5);
      expect(Math.max(...waves.map((w) => w.stageCount))).toBeGreaterThanOrEqual(4);
      expect(waves[2].stageCount).toBe(4);

      const waveOf = new Map<string, number>();
      for (const wave of waves) for (const id of wave.stageIds) waveOf.set(id, wave.waveIndex);
      for (const stage of dag.stages) {
        const myWave = waveOf.get(stage.id) ?? -1;
        for (const dep of stage.dependsOn) expect(waveOf.get(dep) ?? 999).toBeLessThan(myWave);
      }
    });

    it("직접 자기 순환(a -> a)을 ProductionDagCycleError로 즉시 차단한다", () => {
      const cyclicDag: ProductionDagDefinition = {
        dagId: "self-loop",
        schemaVersion: "wave100-dag-v1",
        stages: [makeStage("stage-a", ["stage-a"], 100)],
      };
      expect(() => computeParallelExecutionWaves(cyclicDag)).toThrow(ProductionDagCycleError);
      expect(() => computeCriticalPathSchedule(cyclicDag)).toThrow(ProductionDagCycleError);
    });

    it("다중 노드 간접 순환(a -> ... -> a)을 감지하고 정확한 cyclePath를 포함한다", () => {
      const base = createCanonicalWebtoonProductionDag();
      const cyclicDag: ProductionDagDefinition = {
        ...base,
        stages: base.stages.map((s) =>
          s.id === "script-camera-blocking"
            ? { ...s, dependsOn: ["centennial-c2pa-vault-seal"] }
            : s,
        ),
      };
      let caught: unknown;
      try {
        computeCriticalPathSchedule(cyclicDag);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProductionDagCycleError);
      const cycleErr = caught as ProductionDagCycleError;
      expect(cycleErr.cyclePath.length).toBeGreaterThanOrEqual(3);
      expect(cycleErr.cyclePath[0]).toBe(cycleErr.cyclePath[cycleErr.cyclePath.length - 1]);
    });

    it("존재하지 않는 선행 스테이지 참조를 ProductionDagValidationError로 거부한다", () => {
      const brokenDag: ProductionDagDefinition = {
        dagId: "missing-dep",
        schemaVersion: "wave100-dag-v1",
        stages: [makeStage("only-stage", ["non-existent-stage"], 200)],
      };
      expect(() => computeCriticalPathSchedule(brokenDag)).toThrow(ProductionDagValidationError);
    });

    it("중복 스테이지 ID 및 음수 소요 시간을 ProductionDagValidationError로 거부한다", () => {
      const base = createCanonicalWebtoonProductionDag();
      expect(() =>
        computeParallelExecutionWaves({ ...base, stages: [base.stages[0], base.stages[0]] }),
      ).toThrow(ProductionDagValidationError);
      expect(() =>
        computeCriticalPathSchedule({
          ...base,
          stages: [{ ...base.stages[0], estimatedDurationMs: -50 }],
        }),
      ).toThrow(ProductionDagValidationError);
    });
  });

  describe("CPM 임계 경로 스케줄링 수학 검증", () => {
    it("표준 DAG에서 총 직렬 시간·병렬 월클락 시간·1.5배 이상 병렬 가속비를 정확히 산출한다", () => {
      const schedule = computeCriticalPathSchedule(createCanonicalWebtoonProductionDag());
      expect(schedule.totalSerialMs).toBe(17000);
      expect(schedule.parallelWallClockMs).toBe(9450);
      expect(schedule.parallelWallClockMs).toBeLessThan(schedule.totalSerialMs);
      expect(schedule.parallelSpeedupRatio).toBeGreaterThan(1.5);
      expect(schedule.parallelSpeedupRatio).toBeCloseTo(17000 / 9450, 3);
      expect(schedule.maxConcurrentStages).toBe(4);
    });

    it("임계 경로 노드는 정확히 slackMs === 0이고 소요 합이 parallelWallClockMs와 일치한다", () => {
      const schedule = computeCriticalPathSchedule(createCanonicalWebtoonProductionDag());
      expect(schedule.criticalPathStageIds).toEqual([
        "script-camera-blocking",
        "causal-ink-and-kinematic-cleanup",
        "overnight-self-healing-qa",
        "multi-format-packager",
        "centennial-c2pa-vault-seal",
      ]);

      let criticalSum = 0;
      for (const id of schedule.criticalPathStageIds) {
        const timing = schedule.stageTimings[id];
        expect(timing.isCritical).toBe(true);
        expect(timing.slackMs).toBe(0);
        expect(timing.earliestStartMs).toBe(timing.latestStartMs);
        expect(timing.earliestFinishMs).toBe(timing.latestFinishMs);
        criticalSum += timing.durationMs;
      }
      expect(criticalSum).toBe(schedule.parallelWallClockMs);
    });

    it("비임계 분기 스테이지는 정확한 양수 slackMs를 가진다", () => {
      const schedule = computeCriticalPathSchedule(createCanonicalWebtoonProductionDag());
      expect(schedule.stageTimings["continuity-bible-check"].slackMs).toBe(450);
      expect(schedule.stageTimings["fluid-relief-and-relighting"].slackMs).toBe(500);
      expect(schedule.stageTimings["saliency-and-audio-pacing"].slackMs).toBe(600);
      expect(schedule.stageTimings["geo-compliance-and-rights-bom"].slackMs).toBe(800);
      expect(schedule.stageTimings["cvd-mobile-readability-audit"].slackMs).toBe(1800);
      for (const id of schedule.nonCriticalStageIds) {
        expect(schedule.stageTimings[id].slackMs).toBeGreaterThan(0);
        expect(schedule.stageTimings[id].isCritical).toBe(false);
      }
    });

    it("동일 길이의 다중 임계 경로를 가진 다이아몬드 DAG도 모든 zero-slack 노드를 식별한다", () => {
      const diamondDag: ProductionDagDefinition = {
        dagId: "diamond-tied-cp",
        schemaVersion: "wave100-dag-v1",
        stages: [
          makeStage("start", [], 200, "preproduction"),
          makeStage("branch-a", ["start"], 500, "drawing-craft"),
          makeStage("branch-b", ["start"], 500, "drawing-craft"),
          makeStage("branch-fast", ["start"], 150, "reader-experience"),
          makeStage("join", ["branch-a", "branch-b", "branch-fast"], 300, "multi-surface-release"),
        ],
      };
      const schedule = computeCriticalPathSchedule(diamondDag);
      expect(schedule.parallelWallClockMs).toBe(1000);
      expect(schedule.totalSerialMs).toBe(1650);
      expect(schedule.criticalPathStageIds).toEqual(["start", "branch-a", "branch-b", "join"]);
      expect(schedule.stageTimings["branch-fast"].slackMs).toBe(350);
    });
  });

  describe("종단간 클린 프로덕션 실행 및 마스터 상태 격리", () => {
    it("정상 에피소드는 10개 스테이지를 모두 통과하고 5개 서피스 승인 및 유효 인증서를 발급한다", () => {
      const report = executeProductionPipeline({ masterSnapshot: createSampleMasterSnapshot() });
      expect(report.stages).toHaveLength(10);
      expect(report.passedStageCount).toBe(10);
      expect(report.blockedStageCount).toBe(0);
      expect(report.allStagesSucceeded).toBe(true);
      expect(report.allCriticalStagesSucceeded).toBe(true);
      expect(report.masterStateIsolated).toBe(true);

      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("APPROVED");
      expect(gate.passedInvariantCount).toBe(7);
      expect(gate.approvedSurfaces).toEqual([...RELEASE_SURFACE_TARGETS]);
      expect(gate.blockedSurfaces).toHaveLength(0);
      expect(gate.remediationActions).toHaveLength(0);
      expect(verifyMasterReleaseCertificateIntegrity(gate.certificate).valid).toBe(true);
      expect(gate.certificate.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(gate.certificate.waveCoverageCount).toBe(report.waveCoverageCount);
    });

    it("마스터 스냅샷이 스테이지 핸들러에 깊은 동결로 전달되어 외부 변형을 차단한다", () => {
      const master = createSampleMasterSnapshot();
      let attemptedMutationThrew = false;

      const report = executeProductionPipeline({
        masterSnapshot: master,
        stageHandlers: {
          "script-camera-blocking": (ctx) => {
            try {
              (ctx.masterSnapshot as { episodeTitle: string }).episodeTitle = "변조됨";
            } catch {
              attemptedMutationThrew = true;
            }
            return { status: "passed", summaryKo: "격리 검증 완료", output: { blockedPanelCount: 68 } };
          },
        },
      });

      expect(attemptedMutationThrew).toBe(true);
      expect(master.episodeTitle).toBe("제100화 별빛 종착역");
      expect(report.masterStateIsolated).toBe(true);
    });

    it("야간 자가치유 QA가 결함을 자동 복구(healed-passed)하고 하드 블로커가 0건이면 최종 승인된다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "overnight-self-healing-qa": () => ({
            status: "healed-passed",
            healedIssueCount: 3,
            summaryKo: "선화 틈·말풍선 겹침 3건 자동 치유 완료 (잔여 하드 블로커 0건)",
            output: { unhealedHardQaBlockers: 0, autoHealedDefectCount: 3 },
          }),
        },
      });
      expect(report.healedStageCount).toBe(1);
      expect(report.passedStageCount).toBe(9);
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("APPROVED");
      expect(gate.invariants.overnightQaZeroHardBlockers).toBe(true);
    });

    it("동일 입력에 대해 실행 보고서 머클 다이제스트와 인증서 SHA-256이 결정론적으로 일치한다", () => {
      const master = createSampleMasterSnapshot();
      const reportA = executeProductionPipeline({ masterSnapshot: master, executedAtIso: "2026-11-28T09:00:00Z" });
      const reportB = executeProductionPipeline({ masterSnapshot: master, executedAtIso: "2026-11-28T09:00:00Z" });
      expect(reportA.merkleStageDigest).toBe(reportB.merkleStageDigest);
      expect(evaluateMasterEpisodeReleaseGate(reportA).certificate.certificateSha256).toBe(
        evaluateMasterEpisodeReleaseGate(reportB).certificate.certificateSha256,
      );
    });
  });

  describe("Fail-Closed 마스터 출고 게이트키퍼 및 인증서 위변조 검출", () => {
    it("권리 BOM 실패 시 모든 상업 배포 서피스를 차단하고 masterDecision을 BLOCKED로 판정한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "geo-compliance-and-rights-bom": () => ({
            status: "passed",
            summaryKo: "권리 BOM 만료 라이선스 1건 감지",
            output: {
              rightsBomCleared: false,
              geoComplianceCleared: true,
              unresolvedGeoBlockers: 0,
              expiredLicenseCount: 1,
              territoryViolationCount: 0,
            },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.rightsBomCleared).toBe(false);
      expect(gate.surfaceDecisions["vertical-webtoon-strip"]).toBe("RELEASE_BLOCKED");
      expect(gate.surfaceDecisions["tstudio-live-reactive"]).toBe("RELEASE_BLOCKED");
      expect(gate.surfaceDecisions["print-b5-cmyk"]).toBe("RELEASE_BLOCKED");
      expect(gate.surfaceDecisions["webxr-spatial-theater"]).toBe("RELEASE_BLOCKED");
      expect(gate.remediationActions.some((r) => r.invariantId === "rightsBomCleared")).toBe(true);
    });

    it("권역 심의 미해결 차단이 남아 있으면 masterDecision을 BLOCKED로 판정하고 시정 조치를 제시한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "geo-compliance-and-rights-bom": () => ({
            status: "passed",
            summaryKo: "JP·DE 권역 심의 미해결 2건",
            output: { rightsBomCleared: true, geoComplianceCleared: false, unresolvedGeoBlockers: 2 },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.geoComplianceCleared).toBe(false);
      expect(gate.remediationActions.some((r) => r.invariantId === "geoComplianceCleared")).toBe(true);
    });

    it("야간 QA에 미치유 하드 블로커가 1건이라도 남으면 모든 서피스를 차단한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "overnight-self-healing-qa": () => ({
            status: "passed",
            summaryKo: "하드 블로커 1건 미치유",
            output: { unhealedHardQaBlockers: 1, autoHealedDefectCount: 2 },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.overnightQaZeroHardBlockers).toBe(false);
      expect(gate.approvedSurfaces).toHaveLength(0);
    });

    it("색각안전(CVD) 또는 저감 모션 검증이 실패하면 접근성 불변식을 실패로 처리한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "cvd-mobile-readability-audit": () => ({
            status: "passed",
            summaryKo: "저감 모션 안전 기준 미달",
            output: { cvdAuditPassed: true, reducedMotionSafe: false },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.accessibilityAndCvdPassed).toBe(false);
      expect(gate.surfaceDecisions["vertical-webtoon-strip"]).toBe("RELEASE_BLOCKED");
      expect(gate.surfaceDecisions["webxr-spatial-theater"]).toBe("RELEASE_BLOCKED");
    });

    it("연속성 바이블 모순이 1건이라도 존재하면 전체 출고를 차단한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "continuity-bible-check": () => ({
            status: "passed",
            summaryKo: "주인공 의상 색상 모순 1건",
            output: { continuityContradictions: 1 },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.continuityAndCanonPassed).toBe(false);
      expect(gate.approvedSurfaces).toHaveLength(0);
    });

    it("100년 C2PA 금고 봉인이 무효하면 centennialVaultSealed 실패로 마스터 출고를 차단한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "centennial-c2pa-vault-seal": () => ({
            status: "passed",
            summaryKo: "C2PA 서명 누락",
            output: { c2paVaultSealValid: false, vaultManifestSha256: "" },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      expect(gate.masterDecision).toBe("BLOCKED");
      expect(gate.invariants.centennialVaultSealed).toBe(false);
      expect(gate.surfaceDecisions["centennial-c2pa-vault"]).toBe("RELEASE_BLOCKED");
    });

    it("마스터 출고 인증서의 어떤 필드든 1문자만 변조해도 verifyMasterReleaseCertificateIntegrity가 즉시 실패한다", () => {
      const validCert = evaluateMasterEpisodeReleaseGate(
        executeProductionPipeline({ masterSnapshot: createSampleMasterSnapshot() }),
      ).certificate;
      expect(verifyMasterReleaseCertificateIntegrity(validCert).valid).toBe(true);

      const flipHex = (hex: string): string => (hex[0] === "a" ? "b" : "a") + hex.slice(1);
      const variants: readonly MasterReleaseCertificate[] = [
        { ...validCert, certificateSha256: flipHex(validCert.certificateSha256) },
        { ...validCert, episodeId: `${validCert.episodeId}x` },
        { ...validCert, merkleStageDigest: flipHex(validCert.merkleStageDigest) },
        { ...validCert, masterDecision: "BLOCKED" },
      ];
      for (const tampered of variants) {
        expect(verifyMasterReleaseCertificateIntegrity(tampered).valid).toBe(false);
      }
    });
  });

  describe("재개 가능 체크포인트 워크플로 (차단 → 내보내기 → 수정 → 캐시 재개)", () => {
    it("1차 실행에서 8단계(geo-compliance-and-rights-bom)가 차단되면 1~7단계는 통과, 9~10단계는 선행 보류된다", () => {
      const run1 = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "geo-compliance-and-rights-bom": () => ({
            status: "blocked",
            summaryKo: "JP 권역 상업 폰트 라이선스 만료로 차단",
            output: { rightsBomCleared: false, geoComplianceCleared: false, unresolvedGeoBlockers: 1, expiredLicenseCount: 1 },
            blockingReasons: [{
              code: "RIGHTS_BOM_EXPIRED",
              severity: "license-blocker",
              messageKo: "상업 폰트 라이선스 만료",
              remediationKo: "승인 폰트로 교체하세요.",
            }],
          }),
        },
      });
      expect(run1.passedStageCount).toBe(7);
      expect(run1.blockedStageCount).toBe(1);
      expect(run1.skippedUpstreamBlockedCount).toBe(2);
      expect(run1.stagesById["geo-compliance-and-rights-bom"].status).toBe("blocked");
      expect(run1.stagesById["multi-format-packager"].status).toBe("skipped-upstream-blocked");
      expect(run1.stagesById["centennial-c2pa-vault-seal"].status).toBe("skipped-upstream-blocked");
      const gate1 = evaluateMasterEpisodeReleaseGate(run1);
      expect(gate1.masterDecision).toBe("BLOCKED");
      expect(gate1.invariants.allCriticalStagesSucceeded).toBe(false);
    });

    it("체크포인트 재개 시 1~7단계를 캐시에서 재사용하고 8~10단계만 실행해 최종 APPROVED 인증서를 발급한다", () => {
      const master = createSampleMasterSnapshot();
      const run1 = executeProductionPipeline({
        masterSnapshot: master,
        executedAtIso: "2026-11-28T01:00:00Z",
        stageHandlers: {
          "geo-compliance-and-rights-bom": () => ({
            status: "blocked",
            summaryKo: "권리 BOM 만료로 차단",
            output: { rightsBomCleared: false, geoComplianceCleared: false, unresolvedGeoBlockers: 1 },
          }),
        },
      });

      const checkpoint = exportPipelineCheckpoint(run1, "2026-11-28T01:02:00Z");
      expect(verifyPipelineCheckpointIntegrity(checkpoint)).toBe(true);
      expect(checkpoint.cachedStageOrder).toHaveLength(7);
      expect(checkpoint.blockedStageIdsAtExport).toEqual(["geo-compliance-and-rights-bom"]);

      const invokedOnResume: string[] = [];
      const trackingHandlers: Record<string, StageExecutionHandler> = {};
      for (const stageId of CANONICAL_PRODUCTION_STAGE_IDS) {
        trackingHandlers[stageId] = (ctx) => {
          invokedOnResume.push(ctx.stage.id);
          if (ctx.stage.id === "geo-compliance-and-rights-bom") {
            return {
              status: "passed",
              summaryKo: "폰트 라이선스 교체 후 권리 BOM·권역 심의 통과",
              output: { rightsBomCleared: true, geoComplianceCleared: true, unresolvedGeoBlockers: 0, expiredLicenseCount: 0, territoryViolationCount: 0 },
            };
          }
          if (ctx.stage.id === "multi-format-packager") {
            return { status: "passed", summaryKo: "5대 서피스 패키지 빌드 완료", output: { packagedSurfaces: [...RELEASE_SURFACE_TARGETS] } };
          }
          if (ctx.stage.id === "centennial-c2pa-vault-seal") {
            return { status: "passed", summaryKo: "100년 C2PA 금고 봉인 완료", output: { c2paVaultSealValid: true, vaultManifestSha256: sha256Wave100Hex("resumed-vault-seal") } };
          }
          return { status: "passed", summaryKo: "재실행", output: {} };
        };
      }

      const run2 = resumeProductionPipelineFromCheckpoint(checkpoint, {
        masterSnapshot: master,
        executedAtIso: "2026-11-28T01:10:00Z",
        stageHandlers: trackingHandlers,
      });

      expect(run2.resumedFromCheckpointId).toBe(checkpoint.checkpointId);
      expect(run2.reusedCachedStageCount).toBe(7);
      expect(run2.reusedCachedStageCount).toBeGreaterThanOrEqual(6);
      expect(run2.skippedCachedStages).toHaveLength(7);
      expect(invokedOnResume).toEqual([
        "geo-compliance-and-rights-bom",
        "multi-format-packager",
        "centennial-c2pa-vault-seal",
      ]);
      expect(run2.allStagesSucceeded).toBe(true);

      const gate2 = evaluateMasterEpisodeReleaseGate(run2);
      expect(gate2.masterDecision).toBe("APPROVED");
      expect(gate2.approvedSurfaces).toEqual([...RELEASE_SURFACE_TARGETS]);
      expect(verifyMasterReleaseCertificateIntegrity(gate2.certificate).valid).toBe(true);
    });

    it("위변조된 체크포인트 스냅샷은 PipelineCheckpointIntegrityError로 재개를 차단한다", () => {
      const master = createSampleMasterSnapshot();
      const checkpoint = exportPipelineCheckpoint(executeProductionPipeline({ masterSnapshot: master }));
      const tampered = { ...checkpoint, episodeId: `${checkpoint.episodeId}-tampered` };
      expect(verifyPipelineCheckpointIntegrity(tampered)).toBe(false);
      expect(() =>
        resumeProductionPipelineFromCheckpoint(tampered, { masterSnapshot: master }),
      ).toThrow(PipelineCheckpointIntegrityError);
    });

    it("상위 스테이지를 강제 재실행해 출력 해시가 바뀌면 하위 캐시도 자동으로 무효화된다", () => {
      const master = createSampleMasterSnapshot();
      const checkpoint = exportPipelineCheckpoint(executeProductionPipeline({ masterSnapshot: master }));
      const run2 = resumeProductionPipelineFromCheckpoint(checkpoint, {
        masterSnapshot: master,
        forceRerunStageIds: ["script-camera-blocking"],
        stageHandlers: {
          "script-camera-blocking": () => ({
            status: "passed",
            summaryKo: "카메라 구도 전면 수정",
            output: { blockedPanelCount: 72, cameraRigPreset: "revised-v2" },
          }),
        },
      });
      expect(run2.skippedCachedStages).toEqual(["continuity-bible-check"]);
      expect(run2.executedStageIds).toContain("script-camera-blocking");
      expect(run2.executedStageIds).toContain("causal-ink-and-kinematic-cleanup");
      expect(run2.executedStageIds).toContain("centennial-c2pa-vault-seal");
    });
  });

  describe("OKLCH 인쇄 대응 SVG 다이어그램 및 자연스러운 한국어 출고 보고서", () => {
    it("SVG는 0 NaN/Infinity, 0 raw hex/rgb, OKLCH 색상, 임계 경로·배지·5대 서피스·인증서 지문을 포함한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "overnight-self-healing-qa": () => ({
            status: "healed-passed",
            healedIssueCount: 2,
            summaryKo: "2건 자동 치유",
            output: { unhealedHardQaBlockers: 0 },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      const svg = renderWave100ProductionDirectorSvg(report, gate.certificate);

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/rgba?\s*\(/i);
      expect(svg).toContain("oklch(");
      expect(svg).toContain("[CP]");
      expect(svg).toContain("PASS");
      expect(svg).toContain("HEAL");
      expect(svg).toContain("RELEASE_APPROVED");
      expect(svg).toContain(gate.certificate.certificateSha256);
    });

    it("에피소드 제목·ID에 포함된 XML 특수문자를 안전하게 이스케이프한다", () => {
      expect(escapeDirectorSvgXml(`<script>"A&B"</script>'x'`)).toBe(
        "&lt;script&gt;&quot;A&amp;B&quot;&lt;/script&gt;&apos;x&apos;",
      );
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot({ episodeTitle: `제100화 <폭풍 & "여명">'` }),
      });
      const svg = renderWave100ProductionDirectorSvg(
        report,
        evaluateMasterEpisodeReleaseGate(report).certificate,
      );
      expect(svg).toContain("&lt;폭풍 &amp; &quot;여명&quot;&gt;&apos;");
      expect(svg).not.toContain('<폭풍 & "여명">');
    });

    it("승인된 에피소드의 한국어 보고서가 가속비·스테이지 현황·5대 서피스·권리 BOM·C2PA 서명을 자연스럽게 요약한다", () => {
      const report = executeProductionPipeline({ masterSnapshot: createSampleMasterSnapshot() });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      const summary = summarizeMasterProductionReleaseKo(report, gate.certificate, gate);

      expect(summary).toContain("최종 출고 승인");
      expect(summary).toContain("1.80배 가속");
      expect(summary).toContain("세로 스크롤 웹툰 스트립");
      expect(summary).toContain("100년 보존 C2PA 금고");
      expect(summary).toContain(gate.certificate.certificateSha256);
      expect(summary).toContain("차단 사유가 없습니다");
      expect(summary).not.toContain("하는 것을 가능하게 합니다");
      expect(summary).not.toContain("원활한 워크플로우를 보장합니다");
    });

    it("차단된 에피소드의 한국어 보고서와 SVG가 차단 스테이지·미충족 불변식·구체적 다음 조치를 안내한다", () => {
      const report = executeProductionPipeline({
        masterSnapshot: createSampleMasterSnapshot(),
        stageHandlers: {
          "geo-compliance-and-rights-bom": () => ({
            status: "blocked",
            summaryKo: "EU 권역 라이선스 미승인",
            output: { rightsBomCleared: false, geoComplianceCleared: false, unresolvedGeoBlockers: 1 },
          }),
        },
      });
      const gate = evaluateMasterEpisodeReleaseGate(report);
      const svg = renderWave100ProductionDirectorSvg(report, gate.certificate);
      const summary = summarizeMasterProductionReleaseKo(report, gate.certificate);

      expect(svg).toContain("BLOCK");
      expect(svg).toContain("RELEASE_BLOCKED");
      expect(summary).toContain("출고 차단");
      expect(summary).toContain("geo-compliance-and-rights-bom");
      expect(summary).toContain("체크포인트를 재개하세요");
      expect(MASTER_RELEASE_INVARIANT_IDS).toHaveLength(7);
    });
  });
});
