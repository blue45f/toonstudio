// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { createOpfsSnapshotTimeMachine } from "./studio-opfs-self-heal-engine";
import { StudioOpfsSelfHealPanel } from "./StudioOpfsSelfHealPanel";

const TEXT_ENCODER = new TextEncoder();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioOpfsSelfHealPanel", () => {
  it("마운트 직후에는 저장소를 건드리지 않고, 진단 클릭 시 용량 위험 등급·고아 정리·직전 정상 스냅샷 복구를 수행한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const timeMachine = createOpfsSnapshotTimeMachine({
      fs,
      projectId: "project-heal-ui",
      now: () => 1_700_000_000_000,
    });

    const rev1 = await timeMachine.saveSnapshot({
      snapshotId: "snap-r1",
      revision: 1,
      label: "1차 채색",
      payload: JSON.stringify({ page: 1, ink: "ok" }),
    });
    const rev2 = await timeMachine.saveSnapshot({
      snapshotId: "snap-r2",
      revision: 2,
      label: "2차 명암",
      parentSnapshotId: rev1.record.snapshotId,
      payload: JSON.stringify({ page: 1, ink: "shading" }),
    });
    // 최신 스냅샷 손상 + 오래된 고아 임시 파일 삽입
    await fs.write(rev2.path, TEXT_ENCODER.encode("{corrupted-head"));
    await fs.write("tmp/orphan-crash.tmp", TEXT_ENCODER.encode("stale-temp-bytes"));

    const estimateSpy = vi.fn(async () => ({ usage: 920_000_000, quota: 1_000_000_000 }));
    const restoreSpy = vi.fn();

    render(
      <StudioOpfsSelfHealPanel
        projectId="project-heal-ui"
        fileSystem={fs}
        storageEstimator={{ estimate: estimateSpy }}
        onRestoreSnapshot={restoreSpy}
      />,
    );

    // 마운트 시 자동 저장소 접근 없음(경계 안전)
    expect(estimateSpy).not.toHaveBeenCalled();

    // 1. 저장소·무결성 진단 클릭
    fireEvent.click(screen.getByRole("button", { name: "저장소·무결성 진단" }));
    await waitFor(() => {
      expect(screen.getByTestId("self-heal-quota-grade").textContent).toContain("위험 (90%+)");
    });
    expect(screen.getByText("자동 복구 대상")).toBeTruthy();
    expect(screen.getByText("손상 격리")).toBeTruthy();
    expect(screen.getByRole("button", { name: "고아 임시 파일 정리 (1건)" })).toBeTruthy();

    // 2. 고아 임시 파일 정리 클릭 -> 고아 파일만 삭제되고 정상 스냅샷은 그대로 보존
    fireEvent.click(screen.getByRole("button", { name: "고아 임시 파일 정리 (1건)" }));
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("고아 임시 파일 1건 정리 완료");
    });
    expect(await fs.read("tmp/orphan-crash.tmp")).toBeNull();
    expect(await fs.read(rev1.path)).not.toBeNull();

    // 3. 직전 정상 스냅샷 복구 클릭 -> 검증된 rev1 전달
    fireEvent.click(screen.getByRole("button", { name: "직전 정상 스냅샷 복구" }));
    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledTimes(1);
    });
    expect(restoreSpy.mock.calls[0]?.[0]).toMatchObject({
      snapshotId: "snap-r1",
      revision: 1,
      label: "1차 채색",
    });
  });

  it("OPFS 미지원 환경에서도 용량 진단 결과를 정직하게 표시한다", async () => {
    render(
      <StudioOpfsSelfHealPanel
        projectId="project-no-opfs"
        fileSystem={null}
        storageEstimator={{ estimate: async () => ({ usage: 780, quota: 1000 }) }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "저장소·무결성 진단" }));
    await waitFor(() => {
      expect(screen.getByTestId("self-heal-quota-grade").textContent).toContain("주의 (75%+)");
    });
    expect(screen.getByText(/OPFS.*열 수 없어/u)).toBeTruthy();
  });
});
