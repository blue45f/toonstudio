// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  commitSemanticSnapshot,
  computeDeterministicDigestHex,
  computeEpisodeTreeHash,
  computeRenderFarmTelemetry,
  computeSemanticDiff,
  createDefaultComicVcsRepository,
  createRenderCheckpoint,
  createRenderFarmPlan,
  createSemanticBranch,
  DEFAULT_COMPUTE_NODES,
  DEFAULT_RENDER_FARM_JOB,
  diagnoseEdgeClusterHealth,
  findMergeBaseCommitId,
  getBranchHeadCommit,
  getBranchHistory,
  injectNodeFailure,
  planThreeWaySemanticMerge,
  recoverComputeNode,
  RENDER_PASS_DAG_SPECS,
  RENDER_PASS_STAGES,
  resolveMergeConflictsAndCommit,
  resumeFromCheckpoint,
  rollbackBranchToCommit,
  runOneClickSixPassRender,
  stepRenderFarmTick,
  StudioRenderFarmVcsPanel,
  switchSemanticBranch,
  validateRenderPassDag,
  type ComicEpisodeSnapshot,
  type RenderPassDagSpec,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/distributed-render-semantic-vcs",
);

describe("Wave 40D: 6패스 분산 렌더팜 스케줄러 · 에지 헬스 진단 · 웹툰 시맨틱 VCS", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 6패스 렌더링 DAG는 정확한 위상 정렬 순서와 임계 경로를 검증하고 순환 그래프를 감지한다", () => {
    const validResult = validateRenderPassDag(RENDER_PASS_DAG_SPECS);
    expect(validResult.valid).toBe(true);
    expect(validResult.topologicalOrder).toEqual(RENDER_PASS_STAGES);
    expect(validResult.cycleStages).toEqual([]);
    expect(validResult.criticalPathMs).toBe(1080);

    const cyclicSpecs: RenderPassDagSpec[] = RENDER_PASS_DAG_SPECS.map((spec) =>
      spec.stage === "lineart" ? { ...spec, dependsOn: ["lettering"] } : spec,
    );
    const cyclicResult = validateRenderPassDag(cyclicSpecs);
    expect(cyclicResult.valid).toBe(false);
    expect(cyclicResult.cycleStages.length).toBeGreaterThanOrEqual(2);
  });

  it("2. 원클릭 6패스 분산 실행은 DAG 의존성을 지키며 24개 청크 완주 및 패스별 자동 체크포인트를 생성한다", () => {
    const initial = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    expect(initial.chunks).toHaveLength(24);
    expect(initial.chunks.filter((c) => c.status === "ready").every((c) => c.stage === "lineart")).toBe(true);
    expect(initial.chunks.filter((c) => c.status === "pending")).toHaveLength(20);

    const finished = runOneClickSixPassRender(initial);
    expect(finished.status).toBe("completed");
    expect(finished.chunks.every((c) => c.status === "completed" && c.outputDigest !== null)).toBe(true);
    expect(finished.checkpoints.length).toBeGreaterThanOrEqual(4);

    const replay = runOneClickSixPassRender(createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES));
    expect(finished.chunks.map((c) => c.outputDigest)).toEqual(replay.chunks.map((c) => c.outputDigest));
  });

  it("3. 유휴 WebGPU·에지 노드는 과부하 노드의 큐에서 작업을 훔쳐(Work-Stealing) 처리량을 유지한다", () => {
    const initial = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    const afterTick1 = stepRenderFarmTick(initial);
    expect(afterTick1.stealEvents.length).toBeGreaterThanOrEqual(1);
    expect(afterTick1.stealEvents.every((e) => e.fromNodeId !== e.toNodeId && e.savedEstimatedMs > 0)).toBe(true);

    const finished = runOneClickSixPassRender(afterTick1);
    const totalStolenByNodes = finished.nodes.reduce((sum, n) => sum + n.stolenChunks, 0);
    expect(totalStolenByNodes).toBe(finished.stealEvents.length);
    expect(totalStolenByNodes).toBeGreaterThanOrEqual(2);
  });

  it("4. 메모리 예산 백프레셔 제어는 긴축 예산(512MB)에서 예산을 초과하지 않으면서 교착 없이 완주한다", () => {
    let state = createRenderFarmPlan(
      { ...DEFAULT_RENDER_FARM_JOB, globalMemoryBudgetMb: 512, backpressureHighPct: 75, backpressureCriticalPct: 90 },
      DEFAULT_COMPUTE_NODES,
    );
    let maxObservedMb = 0;
    let sawBackpressure = false;

    for (let i = 0; i < 80 && state.status !== "completed"; i += 1) {
      state = stepRenderFarmTick(state, 120);
      const usedMb = state.nodes.reduce((s, n) => s + n.memoryUsedMb, 0);
      maxObservedMb = Math.max(maxObservedMb, usedMb);
      expect(usedMb).toBeLessThanOrEqual(512);
      if (state.backpressureLevel === "high" || state.backpressureLevel === "critical") {
        sawBackpressure = true;
      }
    }

    expect(state.status).toBe("completed");
    expect(maxObservedMb).toBeLessThanOrEqual(512);
    expect(sawBackpressure).toBe(true);
    expect(state.backpressureEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("5. 실행 중 노드 장애 주입 시 진행 청크가 안전 반환되고 정상 노드가 failover 작업 훔치기로 완주한다", () => {
    let state = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    state = stepRenderFarmTick(state, 80);
    const runningChunk = state.chunks.find((c) => c.status === "running" && c.assignedNodeId !== null);
    expect(runningChunk).toBeDefined();
    const targetNodeId = runningChunk?.assignedNodeId ?? "gpu-local-0";

    const failed = injectNodeFailure(state, targetNodeId);
    expect(failed.nodes.find((n) => n.id === targetNodeId)?.status).toBe("offline");
    expect(failed.failoverRecoveries).toBeGreaterThanOrEqual(1);
    expect(failed.chunks.some((c) => c.assignedNodeId === targetNodeId)).toBe(false);

    const finished = runOneClickSixPassRender(failed);
    expect(finished.status).toBe("completed");
    expect(finished.stealEvents.some((e) => e.reason === "failover-recovery")).toBe(true);
  });

  it("6. 전체 노드 오프라인 시 degraded 상태로 안전 정지하고 노드 복구 후 렌더링을 완료한다", () => {
    let state = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    for (const node of state.nodes) {
      state = injectNodeFailure(state, node.id);
    }
    const stalled = runOneClickSixPassRender(state);
    expect(stalled.status).toBe("degraded");
    const stalledTel = computeRenderFarmTelemetry(stalled);
    expect(stalledTel.estimatedRemainingMs).toBe(-1);
    expect(stalledTel.edgeHealth.grade).toBe("D");

    const recovered = recoverComputeNode(stalled, "gpu-local-0");
    const completed = runOneClickSixPassRender(recovered);
    expect(completed.status).toBe("completed");
  });

  it("7. 결정론적 체크포인트 재개는 이미 완료된 청크 해시를 보존하고 이후 청크만 재실행한다", () => {
    let state = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    state = stepRenderFarmTick(state, 150);
    state = stepRenderFarmTick(state, 150);
    state = createRenderCheckpoint(state, "수동 체크포인트", "Manual Checkpoint");
    const cp = state.checkpoints[state.checkpoints.length - 1];
    expect(cp).toBeDefined();
    expect(cp?.completedChunkIds.length).toBeGreaterThan(0);

    const further = stepRenderFarmTick(stepRenderFarmTick(state, 150), 150);
    const resumed = resumeFromCheckpoint(further, cp?.checkpointId ?? "");
    expect(resumed.lastResumedCheckpointId).toBe(cp?.checkpointId);
    expect(resumed.tickIndex).toBe(cp?.tickIndex);

    for (const completedId of cp?.completedChunkIds ?? []) {
      const chunk = resumed.chunks.find((c) => c.id === completedId);
      expect(chunk?.status).toBe("completed");
      expect(chunk?.outputDigest).toBe(cp?.completedDigests[completedId]);
    }
    expect(resumed.chunks.some((c) => c.resumedFromCheckpointId === cp?.checkpointId)).toBe(true);

    const completed = runOneClickSixPassRender(resumed);
    expect(completed.status).toBe("completed");
  });

  it("8. 초저지연 에지 클러스터 헬스 진단은 S등급 SLA, 지연 상승 경고, 오프라인 치명 경보를 정확히 판정한다", () => {
    const healthy = diagnoseEdgeClusterHealth(DEFAULT_COMPUTE_NODES);
    expect(healthy.grade).toBe("S");
    expect(healthy.slaCompliant).toBe(true);
    expect(healthy.p95RttMs).toBeLessThanOrEqual(35);
    expect(healthy.alerts).toHaveLength(0);

    const degradedNodes = DEFAULT_COMPUTE_NODES.map((n) =>
      n.id === "edge-tokyo-02" ? { ...n, rttMs: 68, jitterMs: 9.5, status: "degraded" as const } : n,
    );
    const degraded = diagnoseEdgeClusterHealth(degradedNodes);
    expect(degraded.slaCompliant).toBe(false);
    expect(degraded.alerts.some((a) => a.nodeId === "edge-tokyo-02" && a.severity === "warning")).toBe(true);

    const offlineNodes = DEFAULT_COMPUTE_NODES.map((n) =>
      n.id === "edge-seoul-01" ? { ...n, status: "offline" as const, rttMs: 999 } : n,
    );
    const offlineReport = diagnoseEdgeClusterHealth(offlineNodes);
    expect(offlineReport.offlineNodeCount).toBe(1);
    expect(offlineReport.alerts.some((a) => a.nodeId === "edge-seoul-01" && a.severity === "critical")).toBe(true);
    expect(offlineReport.grade).toBe("B");
  });

  it("9. 렌더팜 텔레메트리는 진행률·처리량·ETA·6패스별 요약을 결정론적으로 산출한다", () => {
    const initial = createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, DEFAULT_COMPUTE_NODES);
    const t0 = computeRenderFarmTelemetry(initial);
    expect(t0.overallProgressPct).toBe(0);
    expect(t0.estimatedRemainingMs).toBeGreaterThan(0);
    expect(t0.stageProgress).toHaveLength(6);

    const mid = stepRenderFarmTick(stepRenderFarmTick(initial, 160), 160);
    const tMid = computeRenderFarmTelemetry(mid);
    expect(tMid.overallProgressPct).toBeGreaterThan(0);
    expect(tMid.estimatedRemainingMs).toBeLessThan(t0.estimatedRemainingMs);
    expect(tMid.throughputChunksPerSec).toBeGreaterThan(0);

    const done = runOneClickSixPassRender(mid);
    const tDone = computeRenderFarmTelemetry(done);
    expect(tDone.overallProgressPct).toBe(100);
    expect(tDone.estimatedRemainingMs).toBe(0);
    expect(tDone.stageProgress.every((s) => s.status === "completed")).toBe(true);
    expect(computeDeterministicDigestHex("toonstudio")).toHaveLength(16);
  });

  it("10. 시맨틱 VCS는 main·alt-ending·editor-revision 브랜치 분기·전환·스냅샷 커밋을 관리한다", () => {
    const repo = createDefaultComicVcsRepository();
    expect(Object.keys(repo.branches)).toEqual(expect.arrayContaining(["main", "alt-ending", "editor-revision"]));
    expect(repo.activeBranch).toBe("main");

    const forked = createSemanticBranch(repo, "director-cut", { switchToNew: true });
    expect(forked.activeBranch).toBe("director-cut");
    expect(forked.branches["director-cut"]?.headCommitId).toBe(repo.branches.main?.headCommitId);

    // 중복 이름 분기 시 무변경 가드
    expect(createSemanticBranch(forked, "director-cut")).toBe(forked);

    const switched = switchSemanticBranch(forked, "alt-ending");
    expect(switched.activeBranch).toBe("alt-ending");
    expect(getBranchHistory(switched, "alt-ending")).toHaveLength(2);
  });

  it("11. 구조적 시맨틱 Diff는 추가·수정·삭제된 컷·레이어·말풍선과 변경 필드를 정확히 식별한다", () => {
    const repo = createDefaultComicVcsRepository();
    const base = getBranchHeadCommit(repo, "main")?.snapshot;
    expect(base).toBeDefined();
    if (!base) return;

    const cut0 = base.cuts[0];
    const cut1 = base.cuts[1];
    const c0Layer0 = cut0?.layers[0];
    const c0Layer1 = cut0?.layers[1];
    const c1Layer0 = cut1?.layers[0];
    const c1Bal0 = cut1?.balloons[0];
    const c1Bal1 = cut1?.balloons[1];
    if (!cut0 || !cut1 || !c0Layer0 || !c0Layer1 || !c1Layer0 || !c1Bal0 || !c1Bal1) {
      throw new Error("기본 스냅샷 구조가 누락되었습니다.");
    }

    const modified: ComicEpisodeSnapshot = {
      ...base,
      cuts: [
        // cut-01 수정: 레이어 1건 수정, 레이어 1건 추가, 말풍선 1건 삭제
        {
          ...cut0,
          title: "컷 1 · 옥상 철문 급개방",
          layers: [
            c0Layer0,
            { ...c0Layer1, opacity: 0.95 },
            { id: "l-01-fx", name: "번개-섬광", role: "fx", visible: true, opacity: 0.9, blendMode: "add", strokeDigest: "st-999z" },
          ],
          balloons: [],
        },
        // cut-02 수정: 말풍선 텍스트 수정 + 신규 말풍선 추가 + 레이어 1건 삭제
        {
          ...cut1,
          layers: [c1Layer0],
          balloons: [
            { ...c1Bal0, text: "더 이상 물러설 곳은 없어." },
            c1Bal1,
            { id: "bal-02-c", speaker: "하린", text: "선택해.", style: "shout", x: 180, y: 420, width: 220, height: 90, fontSizePx: 26 },
          ],
        },
        // cut-03 삭제, cut-05 신규 추가
        {
          id: "cut-05", order: 5, title: "컷 5 · 보너스 쿠키", cameraShot: "closeup", heightPx: 960,
          layers: [], balloons: [],
        },
      ],
    };

    const diff = computeSemanticDiff(base, modified);
    expect(diff.summary.cutsAdded).toBe(1);
    expect(diff.summary.cutsModified).toBe(1);
    expect(diff.summary.cutsRemoved).toBe(1);
    expect(diff.summary.layersAdded).toBe(1);
    expect(diff.summary.layersModified).toBe(1);
    expect(diff.summary.layersRemoved).toBe(1);
    expect(diff.summary.balloonsAdded).toBe(1);
    expect(diff.summary.balloonsModified).toBe(1);
    expect(diff.summary.balloonsRemoved).toBe(1);
    expect(diff.entries.some((e) => e.path === "cut-02/balloon/bal-02-a" && e.changeKind === "modified")).toBe(true);
  });

  it("12. LCA 탐색은 분기된 브랜치와 병합 커밋 이후에도 정확한 공통 조상을 찾는다", () => {
    const repo = createDefaultComicVcsRepository();
    const rootId = repo.commitOrder[0] ?? "";
    const mainHead = getBranchHeadCommit(repo, "main")?.id ?? "";
    const altHead = getBranchHeadCommit(repo, "alt-ending")?.id ?? "";
    expect(findMergeBaseCommitId(repo, mainHead, altHead)).toBe(rootId);

    const plan = planThreeWaySemanticMerge(repo, "alt-ending", "main");
    const merged = resolveMergeConflictsAndCommit(repo, plan);
    const editorHead = getBranchHeadCommit(merged.repo, "editor-revision")?.id ?? "";
    expect(findMergeBaseCommitId(merged.repo, merged.commit.id, editorHead)).toBe(rootId);
  });

  it("13. 서로 다른 컷을 수정한 브랜치(alt-ending → main)는 충돌 0건으로 3-Way 자동 병합된다", () => {
    const repo = createDefaultComicVcsRepository();
    const plan = planThreeWaySemanticMerge(repo, "alt-ending", "main");

    expect(plan.canAutoMerge).toBe(true);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.autoMergedFromOurs).toBeGreaterThanOrEqual(2);
    expect(plan.autoMergedFromTheirs).toBeGreaterThanOrEqual(2);

    const merged = resolveMergeConflictsAndCommit(repo, plan);
    expect(merged.commit.parentIds).toHaveLength(2);
    expect(merged.commit.snapshot.cuts).toHaveLength(4);
    expect(merged.commit.snapshot.cuts.find((c) => c.id === "cut-04")).toBeDefined();
    expect(merged.commit.snapshot.cuts.find((c) => c.id === "cut-01")?.layers.find((l) => l.id === "l-01-shadow")?.opacity).toBe(0.86);
    expect(merged.commit.snapshot.cuts.find((c) => c.id === "cut-03")?.balloons[0]?.text).toContain("같은 방향");
  });

  it("14. 같은 컷 내부에서도 서로 다른 레이어·말풍선을 수정한 경우 무충돌 3-Way 자동 병합된다", () => {
    let repo = createDefaultComicVcsRepository();
    const mainHead = getBranchHeadCommit(repo, "main");
    expect(mainHead).toBeDefined();
    if (!mainHead) return;

    repo = createSemanticBranch(repo, "fx-pass", { fromBranch: "main" });
    repo = createSemanticBranch(repo, "copy-pass", { fromBranch: "main" });

    // fx-pass: cut-02의 조명 레이어만 수정
    const fxSnap: ComicEpisodeSnapshot = {
      ...mainHead.snapshot,
      cuts: mainHead.snapshot.cuts.map((c) =>
        c.id === "cut-02"
          ? { ...c, layers: c.layers.map((l) => (l.id === "l-02-light" ? { ...l, opacity: 0.92 } : l)) }
          : c,
      ),
    };
    repo = commitSemanticSnapshot(repo, fxSnap, { branchName: "fx-pass", message: "컷 2 조명 강화" }).repo;

    // copy-pass: cut-02의 두 번째 말풍선(bal-02-b)만 수정
    const copySnap: ComicEpisodeSnapshot = {
      ...mainHead.snapshot,
      cuts: mainHead.snapshot.cuts.map((c) =>
        c.id === "cut-02"
          ? { ...c, balloons: c.balloons.map((b) => (b.id === "bal-02-b" ? { ...b, text: "이번만큼은 믿지 않아." } : b)) }
          : c,
      ),
    };
    repo = commitSemanticSnapshot(repo, copySnap, { branchName: "copy-pass", message: "컷 2 서진 대사 다듬기" }).repo;

    const plan = planThreeWaySemanticMerge(repo, "copy-pass", "fx-pass");
    expect(plan.canAutoMerge).toBe(true);
    expect(plan.conflicts).toHaveLength(0);
    const mergedCut2 = plan.mergedSnapshot.cuts.find((c) => c.id === "cut-02");
    expect(mergedCut2?.layers.find((l) => l.id === "l-02-light")?.opacity).toBe(0.92);
    expect(mergedCut2?.balloons.find((b) => b.id === "bal-02-b")?.text).toBe("이번만큼은 믿지 않아.");
  });

  it("15. 같은 말풍선 동시 수정(editor-revision → main)은 충돌을 핀포인트하고 ours/theirs/manual 해결을 모두 지원한다", () => {
    const repo = createDefaultComicVcsRepository();
    const plan = planThreeWaySemanticMerge(repo, "editor-revision", "main");

    expect(plan.canAutoMerge).toBe(false);
    expect(plan.conflicts).toHaveLength(1);
    const conflict = plan.conflicts[0];
    if (!conflict) throw new Error("충돌 항목이 누락되었습니다.");
    expect(conflict.entityKind).toBe("balloon");
    expect(conflict.path).toBe("cut-02/balloon/bal-02-a");
    expect(conflict.conflictedFields).toEqual(expect.arrayContaining(["text", "style"]));
    // 비충돌 변경(cut-03 폭우 FX 레이어)은 자동 병합에 이미 포함
    expect(plan.mergedSnapshot.cuts.find((c) => c.id === "cut-03")?.layers.some((l) => l.id === "l-03-fx-rain")).toBe(true);

    // 미해결/빈 manual 텍스트 검증 오류
    expect(() => resolveMergeConflictsAndCommit(repo, plan, [])).toThrow();
    expect(() =>
      resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "manual", manualText: "   " }]),
    ).toThrow();

    const oursRes = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "ours" }]);
    expect(oursRes.commit.snapshot.cuts.find((c) => c.id === "cut-02")?.balloons.find((b) => b.id === "bal-02-a")?.style).toBe("shout");

    const theirsRes = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "theirs" }]);
    expect(theirsRes.commit.snapshot.cuts.find((c) => c.id === "cut-02")?.balloons.find((b) => b.id === "bal-02-a")?.style).toBe("whisper");

    const manualRes = resolveMergeConflictsAndCommit(repo, plan, [
      { conflictId: conflict.conflictId, choice: "manual", manualText: "열쇠만 넘겨. 옥상 문은 내가 직접 닫을게.", manualStyle: "normal" },
    ]);
    const finalBal = manualRes.commit.snapshot.cuts.find((c) => c.id === "cut-02")?.balloons.find((b) => b.id === "bal-02-a");
    expect(finalBal?.text).toBe("열쇠만 넘겨. 옥상 문은 내가 직접 닫을게.");
    expect(finalBal?.style).toBe("normal");
  });

  it("16. 한쪽 브랜치에서 말풍선을 삭제하고 다른 쪽에서 수정하면 modify-delete 충돌을 감지한다", () => {
    let repo = createDefaultComicVcsRepository();
    const mainHead = getBranchHeadCommit(repo, "main");
    if (!mainHead) throw new Error("main HEAD 누락");
    repo = createSemanticBranch(repo, "trim-cut1", { fromBranch: "main" });
    repo = createSemanticBranch(repo, "edit-cut1", { fromBranch: "main" });

    const trimmedSnap: ComicEpisodeSnapshot = {
      ...mainHead.snapshot,
      cuts: mainHead.snapshot.cuts.map((c) => (c.id === "cut-01" ? { ...c, balloons: [] } : c)),
    };
    repo = commitSemanticSnapshot(repo, trimmedSnap, { branchName: "trim-cut1", message: "컷 1 대사 삭제" }).repo;

    const editedSnap: ComicEpisodeSnapshot = {
      ...mainHead.snapshot,
      cuts: mainHead.snapshot.cuts.map((c) =>
        c.id === "cut-01" ? { ...c, balloons: c.balloons.map((b) => ({ ...b, text: "폭우가 쏟아지기 전에 끝내자." })) } : c,
      ),
    };
    repo = commitSemanticSnapshot(repo, editedSnap, { branchName: "edit-cut1", message: "컷 1 대사 보강" }).repo;

    const plan = planThreeWaySemanticMerge(repo, "edit-cut1", "trim-cut1");
    expect(plan.canAutoMerge).toBe(false);
    const conflict = plan.conflicts[0];
    if (!conflict) throw new Error("modify-delete 충돌 누락");
    expect(conflict.reason).toBe("modify-delete");
    const resolved = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "theirs" }]);
    expect(resolved.commit.snapshot.cuts.find((c) => c.id === "cut-01")?.balloons[0]?.text).toBe("폭우가 쏟아지기 전에 끝내자.");
  });

  it("17. 결정론적 롤백(revert-commit / reset-head)은 브라우저 스토리지 없이 정확한 treeHash 스냅샷을 복원한다", () => {
    const repo = createDefaultComicVcsRepository();
    const rootCommitId = repo.commitOrder[0] ?? "";
    const rootCommit = repo.commits[rootCommitId];
    if (!rootCommit) throw new Error("루트 커밋 누락");

    const reverted = rollbackBranchToCommit(repo, "main", rootCommitId, { mode: "revert-commit" });
    const newHead = getBranchHeadCommit(reverted.repo, "main");
    if (!newHead) throw new Error("롤백 HEAD 누락");
    expect(newHead.treeHash).toBe(computeEpisodeTreeHash(rootCommit.snapshot));
    expect(computeSemanticDiff(rootCommit.snapshot, newHead.snapshot).summary.hasChanges).toBe(false);
    expect(reverted.repo.rollbackHistory).toHaveLength(1);
    expect(getBranchHistory(reverted.repo, "main")).toHaveLength(3);

    const reset = rollbackBranchToCommit(repo, "main", rootCommitId, { mode: "reset-head" });
    expect(getBranchHeadCommit(reset.repo, "main")?.id).toBe(rootCommitId);
  });

  it("18. StudioRenderFarmVcsPanel은 Props 없이 단독 렌더링되며 탭 1에서 6패스 실행·백프레셔·장애주입·체크포인트 재개가 동작한다", () => {
    const onTelemetry = vi.fn();
    render(<StudioRenderFarmVcsPanel onRenderTelemetryChange={onTelemetry} />);

    expect(screen.getByTestId("renderfarm-semantic-vcs-panel")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /6패스 분산 렌더팜/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("edge-grade-badge").textContent).toBe("S");

    fireEvent.click(screen.getByTestId("btn-step-tick"));
    fireEvent.click(screen.getByTestId("btn-toggle-node-edge-seoul-01"));
    expect(screen.getByTestId("node-status-edge-seoul-01").textContent).toBe("offline");

    fireEvent.click(screen.getByTestId("btn-save-checkpoint"));
    expect(screen.getByTestId("checkpoint-count").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("btn-run-six-pass"));
    expect(screen.getByTestId("farm-progress-pct").textContent).toContain("100%");

    fireEvent.click(screen.getByTestId("btn-budget-tight"));
    expect(screen.getByTestId("farm-memory-usage").textContent).toContain("512 MB");
    expect(onTelemetry).toHaveBeenCalled();
  });

  it("19. 탭 2에서 브랜치 분기·컷 Diff·무충돌 병합(alt-ending)·말풍선 충돌 수동 해결(editor-revision)·롤백이 동작한다", () => {
    const onRepoChange = vi.fn();
    render(<StudioRenderFarmVcsPanel initialTab="semantic-vcs" onRepositoryChange={onRepoChange} />);

    expect(screen.getByTestId("panel-semantic-vcs")).toBeTruthy();
    // 기본 비교 대상 editor-revision -> 충돌 1건 핀포인트 확인
    expect(screen.getByTestId("merge-conflict-count").textContent).toContain("충돌 1건");

    // manual 선택 후 대사 입력 -> 병합 커밋
    fireEvent.click(screen.getByRole("button", { name: "직접 병합 (manual)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "수동 병합 대사 입력" }), {
      target: { value: "지금 열쇠를 넘겨, 여기서 끝내자." },
    });
    fireEvent.click(screen.getByTestId("btn-apply-merge"));
    expect(screen.getByTestId("vcs-notice-banner").textContent).toContain("병합 커밋");

    // alt-ending 비교 전환 -> 무충돌 0건 확인 후 자동 병합
    fireEvent.click(screen.getByTestId("btn-compare-alt-ending"));
    expect(screen.getByTestId("merge-conflict-count").textContent).toContain("충돌 0건");
    fireEvent.click(screen.getByTestId("btn-apply-merge"));
    expect(screen.getByTestId("vcs-active-head").textContent).toContain("4컷");

    // 신규 브랜치 분기
    fireEvent.change(screen.getByTestId("input-new-branch"), { target: { value: "final-polish" } });
    fireEvent.click(screen.getByTestId("btn-create-branch"));
    expect(screen.getByTestId("btn-branch-final-polish")).toBeTruthy();
    expect(onRepoChange).toHaveBeenCalled();
  });

  it("20. 영문 로케일 단독 렌더링 및 모듈 전체 엄격 정적 위생 규칙(800줄·무색상·무스토리지·props규칙)을 통과한다", () => {
    render(<StudioRenderFarmVcsPanel locale="en" />);
    expect(screen.getByTestId("btn-run-six-pass").textContent).toContain("Calculate 6-Pass Example");

    const files = [
      "distributed-render-scheduler.ts",
      "semantic-comic-vcs.ts",
      "StudioRenderFarmVcsPanel.tsx",
      "index.ts",
      "distributed-render-semantic-vcs.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} private Map store 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioRenderFarmVcsPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioRenderFarmVcsPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
