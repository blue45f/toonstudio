// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commitSemanticSnapshot, computeEpisodeTreeHash, createRenderFarmPlan, createSemanticBranch,
  createSemanticVcsRepository, DEFAULT_COMPUTE_NODES, DEFAULT_RENDER_FARM_JOB,
  getBranchHeadCommit, planThreeWaySemanticMerge, resolveMergeConflictsAndCommit,
  stepRenderFarmTick, StudioRenderFarmVcsPanel,
  type ComicCutNode, type ComicEpisodeSnapshot, type RenderFarmTelemetry, type SemanticVcsRepository,
} from "./index";

const CUT: ComicCutNode = {
  id: "shared", order: 0, title: "  원문 | 제목  ", cameraShot: "medium", heightPx: 100,
  layers: [{ id: "line", name: "원본", role: "lineart", visible: true, opacity: 1, blendMode: "normal", strokeDigest: "original" }],
  balloons: [{ id: "line", speaker: "A", text: "  원문\n대사  ", style: "normal", x: 0, y: 0, width: 10, height: 10, fontSizePx: 12 }],
};
const EMPTY: ComicEpisodeSnapshot = { episodeId: "example", episodeNumber: 1, title: "원본", cuts: [] };
const baseRepo = (): SemanticVcsRepository => createSemanticVcsRepository({ repoId: "test", initialSnapshot: EMPTY });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("렌더/VCS 예제의 입력·내용 보존 경계", () => {
  it("중복 컷·노드 ID와 NaN·비유한 예산을 완료 상태로 만들지 않는다", () => {
    const original = JSON.stringify(DEFAULT_RENDER_FARM_JOB);
    expect(() => createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, cutIds: ["same", "same"] })).toThrow(/고유 ID/);
    expect(() => createRenderFarmPlan(DEFAULT_RENDER_FARM_JOB, [...DEFAULT_COMPUTE_NODES, ...DEFAULT_COMPUTE_NODES])).toThrow(/고유 ID/);
    for (const value of [NaN, Infinity, -Infinity, 0, -1, 1.5]) {
      expect(() => createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, tilesPerCut: value })).toThrow();
    }
    expect(() => createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, globalMemoryBudgetMb: NaN })).toThrow();
    const plan = createRenderFarmPlan();
    expect(() => stepRenderFarmTick(plan, NaN)).toThrow();
    expect(plan.tickIndex).toBe(0);
    expect(JSON.stringify(DEFAULT_RENDER_FARM_JOB)).toBe(original);
  });

  it("동일 ID로 새로 추가한 컷의 선택은 레이어·말풍선·공백까지 전체 내용을 보존한다", () => {
    let repo = createSemanticBranch(baseRepo(), "source");
    const theirs: ComicCutNode = { ...CUT, title: "대상", layers: [{ ...CUT.layers[0], id: "target-layer", name: "대상", role: "fx", visible: true, opacity: 0.4, blendMode: "add", strokeDigest: "target" }], balloons: [{ ...CUT.balloons[0], id: "target-balloon", speaker: "대상", text: "  대상 대사\n둘째 줄  ", style: "thought", x: 2, y: 3, width: 50, height: 20, fontSizePx: 18 }] };
    repo = commitSemanticSnapshot(repo, { ...EMPTY, cuts: [CUT] }, { branchName: "main", message: "현재 추가" }).repo;
    repo = commitSemanticSnapshot(repo, { ...EMPTY, cuts: [theirs] }, { branchName: "source", message: "대상 추가" }).repo;
    const plan = planThreeWaySemanticMerge(repo, "source", "main");
    const conflict = plan.conflicts[0];
    if (!conflict) throw new Error("새 컷 충돌 누락");
    const original = JSON.stringify(repo);
    for (const choice of ["ours", "theirs"] as const) {
      const merged = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice }]);
      expect(merged.commit.snapshot.cuts).toEqual([choice === "ours" ? CUT : theirs]);
    }
    expect(JSON.stringify(repo)).toBe(original);
  });

  it("컷 메타데이터 선택은 이미 자동 병합한 하위 내용을 되돌리지 않는다", () => {
    const initial = { ...EMPTY, cuts: [CUT] };
    let repo = createSemanticVcsRepository({ repoId: "metadata", initialSnapshot: initial });
    repo = createSemanticBranch(repo, "source");
    const ours = { ...CUT, title: "현재 제목", balloons: CUT.balloons.map((balloon) => ({ ...balloon, text: "현재 대사" })) };
    const theirs = { ...CUT, title: "대상 제목", layers: CUT.layers.map((layer) => ({ ...layer, opacity: 0.6 })) };
    repo = commitSemanticSnapshot(repo, { ...EMPTY, cuts: [ours] }, { branchName: "main", message: "현재 수정" }).repo;
    repo = commitSemanticSnapshot(repo, { ...EMPTY, cuts: [theirs] }, { branchName: "source", message: "대상 수정" }).repo;
    const plan = planThreeWaySemanticMerge(repo, "source", "main");
    const conflict = plan.conflicts[0];
    if (!conflict) throw new Error("메타데이터 충돌 누락");
    expect(plan.conflicts).toHaveLength(1);
    expect(conflict.conflictedFields).not.toContain("cut");
    const merged = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "theirs" }]);
    expect(merged.commit.snapshot.cuts[0]).toEqual({ ...theirs, balloons: ours.balloons });
  });

  it.each(["balloon", "layer"] as const)("하이픈 경계가 다른 %s 충돌의 ours/theirs 선택을 독립적으로 보존한다", (kind) => {
    const snapshot = (version: string): ComicEpisodeSnapshot => ({
      ...EMPTY,
      cuts: [{ cutId: "a-b", entityId: "c" }, { cutId: "a", entityId: "b-c" }].map(({ cutId, entityId }) => ({
        ...CUT, id: cutId,
        layers: CUT.layers.map((layer) => ({ ...layer, id: entityId, name: kind === "layer" ? `${version}:${cutId}` : layer.name })),
        balloons: CUT.balloons.map((balloon) => ({ ...balloon, id: entityId, text: kind === "balloon" ? `${version}:${cutId}` : balloon.text })),
      })),
    });
    let repo = createSemanticVcsRepository({ repoId: "tuple", initialSnapshot: snapshot("base") });
    repo = createSemanticBranch(repo, "source");
    repo = commitSemanticSnapshot(repo, snapshot("ours"), { branchName: "main", message: "현재 수정" }).repo;
    repo = commitSemanticSnapshot(repo, snapshot("theirs"), { branchName: "source", message: "대상 수정" }).repo;
    const before = JSON.stringify(repo);
    const plan = planThreeWaySemanticMerge(repo, "source", "main");
    expect(plan.conflicts).toHaveLength(2);
    expect(new Set(plan.conflicts.map((conflict) => conflict.conflictId)).size).toBe(2);
    const merged = resolveMergeConflictsAndCommit(repo, plan, plan.conflicts.map((conflict) => ({
      conflictId: conflict.conflictId, choice: conflict.cutId === "a-b" ? "ours" : "theirs",
    })));
    for (const cut of merged.commit.snapshot.cuts) {
      const expected = `${cut.id === "a-b" ? "ours" : "theirs"}:${cut.id}`;
      expect(kind === "balloon" ? cut.balloons[0]?.text : cut.layers[0]?.name).toBe(expected);
    }
    expect(JSON.stringify(repo)).toBe(before);
  });

  it.each(["main", "source"])("%s HEAD가 계획 후 바뀌면 stale 병합으로 최신 내용을 덮지 않는다", (branchName) => {
    let repo = createSemanticBranch(baseRepo(), "source");
    const plan = planThreeWaySemanticMerge(repo, "source", "main");
    repo = commitSemanticSnapshot(repo, { ...EMPTY, cuts: [CUT] }, { branchName, message: "계획 이후 변경" }).repo;
    const preserved = JSON.stringify(repo);
    expect(() => resolveMergeConflictsAndCommit(repo, plan)).toThrow(/다시 계산/);
    expect(JSON.stringify(repo)).toBe(preserved);
    expect(getBranchHeadCommit(repo, branchName)?.snapshot.cuts).toEqual([CUT]);
  });

  it("구분자가 있는 화자와 대사를 서로 다른 내용으로 병합하고 수동 원문 공백도 보존한다", () => {
    const balloon = CUT.balloons[0];
    if (!balloon) throw new Error("말풍선 누락");
    const snapshot = (speaker: string, text: string): ComicEpisodeSnapshot => ({ ...EMPTY, cuts: [{ ...CUT, balloons: [{ ...balloon, speaker, text }] }] });
    const ours = snapshot("A|B", "C");
    const theirs = snapshot("A", "B|C");
    expect(computeEpisodeTreeHash(ours)).not.toBe(computeEpisodeTreeHash(theirs));
    let repo = createSemanticVcsRepository({ repoId: "separator", initialSnapshot: snapshot("base", "base") });
    repo = createSemanticBranch(repo, "source");
    repo = commitSemanticSnapshot(repo, ours, { branchName: "main", message: "현재" }).repo;
    repo = commitSemanticSnapshot(repo, theirs, { branchName: "source", message: "대상" }).repo;
    const plan = planThreeWaySemanticMerge(repo, "source", "main");
    const conflict = plan.conflicts[0];
    if (!conflict) throw new Error("구분자 충돌이 누락됨");
    const target = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "theirs" }]);
    expect(target.commit.snapshot.cuts[0]?.balloons).toEqual(theirs.cuts[0]?.balloons);
    const manual = resolveMergeConflictsAndCommit(repo, plan, [{ conflictId: conflict.conflictId, choice: "manual", manualText: "  합의\n원문  " }]);
    expect(manual.commit.snapshot.cuts[0]?.balloons[0]?.text).toBe("  합의\n원문  ");
  });

  it("VCS 스냅샷의 중복 ID도 Map에서 덮어쓰기 전에 거부한다", () => {
    expect(() => createSemanticVcsRepository({ repoId: "duplicate", initialSnapshot: { ...EMPTY, cuts: [CUT, CUT] } })).toThrow(/고유/);
    expect(() => computeEpisodeTreeHash({ ...EMPTY, cuts: [{ ...CUT, balloons: [...CUT.balloons, ...CUT.balloons] }] })).toThrow(/고유/);
    expect(() => computeEpisodeTreeHash({ ...EMPTY, episodeNumber: NaN })).toThrow(/유한/);
  });

  it("기본 패널은 가정값·미연동 상태와 메모리 기록을 안내한다", () => {
    render(<StudioRenderFarmVcsPanel locale="ko" />);
    expect(screen.getByTestId("renderfarm-semantic-vcs-panel").textContent).toContain("실측이 아닙니다");
    expect(screen.getByText(/현재 원고, GPU 렌더/).textContent).toContain("OPFS 영구 저장에 연결되지 않습니다");
    fireEvent.click(screen.getByTestId("btn-save-checkpoint"));
    expect(screen.getByTestId("checkpoint-count").textContent).toContain("메모리에 기록됨");
    expect(screen.queryByTestId("example-callback-status")).toBeNull();
  });

  it("텔레메트리 콜백 대기 중 중복을 막고 거절 후 같은 결과만 재알림한다", async () => {
    let rejectPending: (reason: Error) => void = () => { throw new Error("대기 Promise 누락"); };
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
    const onTelemetry = vi.fn<(telemetry: RenderFarmTelemetry) => void | Promise<void>>().mockImplementationOnce(() => pending).mockResolvedValueOnce(undefined);
    render(<StudioRenderFarmVcsPanel locale="ko" onRenderTelemetryChange={onTelemetry} />);
    fireEvent.click(screen.getByTestId("btn-step-tick"));
    const result = onTelemetry.mock.calls[0]?.[0];
    const progress = screen.getByTestId("farm-progress-pct").textContent;
    expect(screen.getByTestId("example-callback-status").textContent).toContain("응답 대기");
    fireEvent.click(screen.getByTestId("btn-step-tick"));
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    await act(async () => { rejectPending(new Error("수신 실패")); });
    expect(screen.getByRole("alert").textContent).toContain("수신 실패");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" })); });
    expect(onTelemetry).toHaveBeenCalledTimes(2);
    expect(onTelemetry.mock.calls[1]?.[0]).toEqual(result);
    expect(screen.getByTestId("farm-progress-pct").textContent).toBe(progress);
    expect(screen.getByTestId("example-callback-status").textContent).toContain("완료를 뜻하지 않습니다");
  });

  it("빈 수동 대사는 성공 배너나 저장소 알림 없이 오류로 남긴다", () => {
    const onRepo = vi.fn();
    render(<StudioRenderFarmVcsPanel locale="ko" initialTab="semantic-vcs" onRepositoryChange={onRepo} />);
    const head = screen.getByTestId("vcs-active-head").textContent;
    fireEvent.click(screen.getByRole("button", { name: "직접 병합 (manual)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "수동 병합 대사 입력" }), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("btn-apply-merge"));
    expect(screen.getByRole("alert").textContent).toContain("비어 있습니다");
    expect(screen.getByTestId("vcs-active-head").textContent).toBe(head);
    expect(onRepo).not.toHaveBeenCalled();
  });

  it("저장소 콜백의 동기 실패 재시도는 메모리 커밋을 추가하지 않는다", () => {
    const onRepo = vi.fn<(repo: SemanticVcsRepository) => void | Promise<void>>().mockImplementationOnce(() => { throw new Error("연결 거부"); }).mockImplementationOnce(() => undefined);
    render(<StudioRenderFarmVcsPanel locale="ko" initialTab="semantic-vcs" onRepositoryChange={onRepo} />);
    fireEvent.click(screen.getByTestId("btn-quick-commit"));
    const next = onRepo.mock.calls[0]?.[0];
    const count = screen.getByTestId("vcs-history-count").textContent;
    expect(screen.getByRole("alert").textContent).toContain("연결 거부");
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(onRepo.mock.calls[1]?.[0]).toBe(next);
    expect(screen.getByTestId("vcs-history-count").textContent).toBe(count);
  });
});
