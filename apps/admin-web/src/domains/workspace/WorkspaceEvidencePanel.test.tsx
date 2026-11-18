// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceEvidencePanel } from "./WorkspaceEvidencePanel";

import type { WorkspaceCiEvidence, WorkspaceCiEvidenceTarget, WorkspaceDeploymentEvidence, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

const now = new Date("2026-11-18T04:00:00Z"), sha = "a".repeat(40), repository = "sample/toonstudio";
function ci(): WorkspaceCiEvidence {
  return {
    id: "synthetic-ci", kind: "ci", repository, runId: "200", runAttempt: 1, event: "push", workflow: "core.yml", job: "contract", shard: "2/3", scope: "core-contract-2",
    testedSha: sha, headSha: "", baseSha: "", conclusion: "success", completedAt: "2026-11-18T03:40:00Z", collectedAt: "2026-11-18T03:50:00Z",
    availability: "available", url: `https://github.com/${repository}/actions/runs/200`,
  };
}
function target(): WorkspaceCiEvidenceTarget {
  return { kind: "ci", repository, targetSha: sha, scope: "core-contract-2", reference: "main", workflow: "core.yml", job: "contract", shard: "2/3",
    main: { repository, sha, observedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repository}/commit/${sha}` },
  };
}
function record(): WorkspaceRecord {
  return { ...createWorkspaceRecord("synthetic-review", "coordination", "operation"), evidence: [ci()], evidenceTarget: target(),
    operationalState: { workStatus: "in_progress", pullRequestStatus: "unknown", ciStatus: "success", deploymentStatus: "not-deployed", approvalStatus: "pending" },
  };
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("증거 패널의 현재 대상 표시", () => {
  it("정확한 main SHA·범위와 최근 관측을 표시하고 자동 조회나 승인을 실행하지 않는다", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const input = record(); render(<WorkspaceEvidencePanel record={input} now={now} />);
    expect(screen.getAllByText("저장된 관측 기준 유효")).toHaveLength(2);
    expect(screen.getByText(/현재 대조 대상:/u).textContent).toContain(sha);
    expect(screen.getByText(/업무 in_progress/u).textContent).toContain("승인 pending");
    expect(screen.getByRole("link", { name: /증거 열기/u }).getAttribute("href")).toBe(ci().url);
    expect(screen.queryByRole("button", { name: /실행|재실행|배포|승인/u })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(input.factStatus).toBe("미확인");
  });
  it("main 관측이 정확히 1시간이면 유효하되 1ms를 넘으면 과거 성공을 현재 녹색으로 표시하지 않는다", () => {
    const evidenceTarget = { ...target(), main: { ...target().main!, observedAt: "2026-11-18T03:00:00Z" } };
    const { rerender } = render(<WorkspaceEvidencePanel record={{ ...record(), evidenceTarget }} now={now} />);
    expect(screen.getAllByText("저장된 관측 기준 유효")).toHaveLength(2);
    rerender(<WorkspaceEvidencePanel record={{ ...record(), evidenceTarget }} now={new Date(now.getTime() + 1)} />);
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getAllByText("재확인 필요").length).toBeGreaterThan(0);
    expect(screen.getByText(/과거 성공 이력은 유지됩니다/u)).toBeTruthy();
  });
  it("열린 화면에서도 사용자 조작 없이 main 관측 만료를 다시 계산하고 구독을 정리한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const removeFocus = vi.spyOn(window, "removeEventListener"), removeVisibility = vi.spyOn(document, "removeEventListener");
    const input = { ...record(), evidenceTarget: { ...target(), main: { ...target().main!, observedAt: "2026-11-18T03:00:00Z" } } };
    const previous = structuredClone(input);
    const { unmount } = render(<WorkspaceEvidencePanel record={input} />);
    expect(screen.getAllByText("저장된 관측 기준 유효")).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getAllByText("재확인 필요").length).toBeGreaterThan(0);
    expect(screen.getByText(/업무 in_progress/u).textContent).toContain("승인 pending");
    expect(input).toEqual(previous);
    expect(fetch).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeFocus).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeVisibility).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
  it.each(["focus", "visibilitychange"] as const)("%s 복귀 시 다음 타이머를 기다리지 않고 만료를 표시한다", event => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const input = { ...record(), evidenceTarget: { ...target(), main: { ...target().main!, observedAt: "2026-11-18T03:00:00Z" } } };
    render(<WorkspaceEvidencePanel record={input} />);
    expect(screen.getAllByText("저장된 관측 기준 유효")).toHaveLength(2);
    vi.setSystemTime(new Date(now.getTime() + 1));
    fireEvent(event === "focus" ? window : document, new Event(event));
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getByText(/업무 in_progress/u).textContent).toContain("승인 pending");
    expect(fetch).not.toHaveBeenCalled();
    expect(input.operationalState?.approvalStatus).toBe("pending");
  });
  it("명시한 now는 고정된 대조 시각으로 유지하고 로컬 시계 구독을 만들지 않는다", () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    render(<WorkspaceEvidencePanel record={record()} now={now} />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(2 * 60 * 60 * 1000); });
    fireEvent(window, new Event("focus"));
    expect(screen.getAllByText("저장된 관측 기준 유효")).toHaveLength(2);
  });
  it("관측 main이 다른 SHA이면 최근 성공이라도 대상 불일치를 표시한다", () => {
    render(<WorkspaceEvidencePanel record={{ ...record(), evidenceTarget: { ...target(), main: { ...target().main!, sha: "b".repeat(40) } } }} now={now} />);
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getAllByText("대상 불일치").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/현재 관측한 main SHA와 검증 기준이 다릅니다/u).length).toBeGreaterThan(0);
  });
  it("같은 실행의 새 실패 회차가 있으면 옛 성공을 이전 실행 이력으로 낮춰 표시한다", () => {
    const failure: WorkspaceCiEvidence = { ...ci(), id: "synthetic-rerun", runAttempt: 2, conclusion: "failure", completedAt: "2026-11-18T03:55:00Z", collectedAt: now.toISOString(), url: `https://github.com/${repository}/actions/runs/200/attempts/2` };
    render(<WorkspaceEvidencePanel record={{ ...record(), evidence: [ci(), failure] }} now={now} />);
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    const history = screen.getByText(/core.yml · 실행 200 \/ 회차 1/u).closest("article")!;
    expect(within(history).getByText("이전 실행 이력")).toBeTruthy();
    expect(history.querySelector(".workspace-badge--good")).toBeNull();
    const latest = screen.getByText(/core.yml · 실행 200 \/ 회차 2/u).closest("article")!;
    expect(within(latest).getByText("실패")).toBeTruthy();
  });
  it("동일 실행 회차의 결과가 상충하면 개별 성공도 현재 유효하다고 표시하지 않는다", () => {
    const conflicting: WorkspaceCiEvidence = { ...ci(), id: "synthetic-conflict", conclusion: "failure", collectedAt: "2026-11-18T03:55:00Z" };
    render(<WorkspaceEvidencePanel record={{ ...record(), evidence: [ci(), conflicting] }} now={now} />);
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getByText("근거 미완성")).toBeTruthy();
    expect(screen.getByText("집계 재확인 필요")).toBeTruthy();
    expect(screen.getByText(/같은 CI 실행 회차의 결과가 서로 상충합니다/u)).toBeTruthy();
    expect(document.querySelector(".workspace-badge--good")).toBeNull();
  });
  it("이미지 빌드만 기록된 배포는 적용·원점·스모크 완료로 표시하지 않는다", () => {
    const deployment: WorkspaceDeploymentEvidence = {
      id: "synthetic-image", kind: "deployment", repository, deploymentId: "build-only", provider: "example-host", unit: "api", environment: "production", origin: "https://origin.example.test", scope: "api-runtime",
      phase: "image-built", artifactSha: sha, artifactDigest: "d".repeat(64), appliedSha: "", appliedAt: "", collectedAt: "2026-11-18T03:50:00Z", availability: "available", url: "https://example.test/deployments/build-only",
      originReadiness: { status: "unknown", observedAt: "", sha: "", environment: "", origin: "", url: "" },
      smoke: { status: "not-run", testedAt: "", sha: "", environment: "", origin: "", scope: "", url: "" },
    };
    render(<WorkspaceEvidencePanel record={{ ...record(), evidence: [deployment], evidenceTarget: {
      kind: "deployment", repository, targetSha: sha, reference: "main", main: target().main, scope: "api-runtime", provider: "example-host", unit: "api", environment: "production", origin: "https://origin.example.test",
    } }} now={now} />);
    expect(screen.queryByText("저장된 관측 기준 유효")).toBeNull();
    expect(screen.getAllByText("근거 미완성").length).toBeGreaterThan(0);
    expect(screen.getByText(/적용 image-built · 원점 준비 unknown · 스모크 not-run/u)).toBeTruthy();
    expect(screen.getAllByText(/이미지 빌드만으로 실제 배포 적용을 확인할 수 없습니다/u).length).toBeGreaterThan(0);
  });
});
