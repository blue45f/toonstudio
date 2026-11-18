// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { assessWorkspaceEvidenceSet, createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceEvidenceEditor } from "./WorkspaceEvidenceEditor";

import type { WorkspaceCiEvidence, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

const now = new Date("2026-11-18T04:00:00Z"), sha = "a".repeat(40), head = "b".repeat(40), testedMerge = "c".repeat(40), repository = "sample/toonstudio";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function edit(busy = false) {
  const record: WorkspaceRecord = { ...createWorkspaceRecord("synthetic-editor", "coordination", "operation"), status: "검토 필요",
    operationalState: { workStatus: "in_progress", pullRequestStatus: "open", ciStatus: "unknown", deploymentStatus: "not-deployed", approvalStatus: "pending" },
  };
  const save = vi.fn(async (_record: WorkspaceRecord): Promise<string | null> => null), close = vi.fn();
  render(<WorkspaceEvidenceEditor record={record} busy={busy} onSave={save} onClose={close} />);
  return { record, save, close };
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u")), { target: { value } });
}
function fillCi() {
  const fields = [
    ["저장소 (owner/repo)", repository], ["검증 대상 SHA (40자리)", sha], ["확인해야 할 범위", "core-contract"], ["실제로 검증한 범위", "core-contract"],
    ["실행·배포 증거 주소", `https://github.com/${repository}/actions/runs/200/attempts/2`], ["실제로 수집한 시각 (시간대 포함)", "2026-11-18T03:50:00Z"],
    ["직접 확인한 원격 main SHA", sha], ["원격 main 확인 시각 (시간대 포함)", "2026-11-18T03:55:00Z"], ["main 관측 증거 주소", `https://github.com/${repository}/commit/${sha}`],
    ["Actions 실행 번호", "200"], ["실행 회차", "2"], ["워크플로", "core.yml"], ["Job (전체 실행이면 빈칸)", "contract"], ["Shard (해당 없으면 빈칸)", "2/3"],
    ["실제로 테스트한 SHA", sha], ["실행 결과", "success"], ["실제 실행 완료 시각 (시간대 포함)", "2026-11-18T03:40:00Z"],
  ];
  for (const [label, value] of fields) change(label, value);
}

describe("수동 검증 증거 연결", () => {
  it("직접 입력한 대상·시각·실행 회차만 저장하고 외부 실행·승인 변경을 하지 않는다", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { record, save, close } = edit(); fillCi();
    fireEvent.click(screen.getByRole("button", { name: "증거 연결 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const submitted = save.mock.calls[0][0], evidence = submitted.evidence![0] as WorkspaceCiEvidence;
    expect(evidence).toMatchObject({ runId: "200", runAttempt: 2, completedAt: "2026-11-18T03:40:00Z", collectedAt: "2026-11-18T03:50:00Z", testedSha: sha, conclusion: "success" });
    expect(submitted.evidenceTarget).toMatchObject({ targetSha: sha, scope: "core-contract", main: { sha, observedAt: "2026-11-18T03:55:00Z" } });
    expect(submitted.status).toBe(record.status);
    expect(submitted.factStatus).toBe("미확인");
    expect(submitted.operationalState).toEqual(record.operationalState);
    expect(close).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^재실행|^배포 실행|^승인$/u })).toBeNull();
  });
  it.each([
    ["검증 대상 SHA (40자리)", "short-sha", "전체 SHA"],
    ["실제로 수집한 시각 (시간대 포함)", "2026-11-19T03:50:00Z", "과거 또는 현재"],
    ["실행 회차", "0", "1 이상의 정수"],
  ])("%s가 잘못됐으면 저장 콜백을 실행하지 않는다", async (label, value, message) => {
    const { save, close } = edit(); fillCi(); change(label, value);
    fireEvent.click(screen.getByRole("button", { name: "증거 연결 저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it("PR 대상에는 실제 merge SHA와 head·base 및 main 관측을 따로 연결한다", async () => {
    const { save } = edit(); fillCi();
    change("대조 기준", "pull-request");
    change("검증 대상 SHA (40자리)", testedMerge); change("실제로 테스트한 SHA", testedMerge);
    change("실행 이벤트", "pull_request"); change("실행 당시 PR head SHA", head); change("실행 당시 PR base SHA", sha);
    change("현재 PR head SHA", head); change("현재 PR base SHA", sha);
    expect(screen.getByLabelText(/^직접 확인한 원격 main SHA/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "증거 연결 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const submitted = save.mock.calls[0][0];
    expect(submitted.evidenceTarget).toMatchObject({ reference: "pull-request", targetSha: testedMerge, headSha: head, baseSha: sha, main: { sha } });
    expect(assessWorkspaceEvidenceSet(submitted.evidence!, submitted.evidenceTarget!, now).current).toBe(true);
  });
  it("배포 증거로 전환하면 지원하지 않는 PR 대조 기준을 남기지 않는다", () => {
    edit(); change("대조 기준", "pull-request"); change("증거 종류", "deployment");
    expect((screen.getByLabelText("대조 기준") as HTMLSelectElement).value).toBe("main");
    expect(screen.queryByRole("option", { name: "PR 검증 대상" })).toBeNull();
  });
  it("저장 중에는 수동 증거를 중복 제출하지 않는다", () => {
    const { save } = edit(true);
    fireEvent.submit(screen.getByRole("button", { name: "증거 연결 저장" }).closest("form")!);
    expect(save).not.toHaveBeenCalled();
  });
});
