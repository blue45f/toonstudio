// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listProductionProjects } from "./production-dashboard-api";
import { SharedResourcePriorityBoard } from "./SharedResourcePriorityBoard";
import * as licenseModel from "./shared-resource-priority-license-model";
import type { AssetLicenseMetadata } from "./shared-resource-priority-license-model";

vi.mock("./production-dashboard-api", () => ({ listProductionProjects: vi.fn() }));
vi.mock("./production-api", () => ({ getProductionProject: vi.fn() }));
vi.mock("./shared-resource-priority-license-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shared-resource-priority-license-model")>();
  return { ...actual, buildSharedResourceBoard: vi.fn(actual.buildSharedResourceBoard) };
});

const listProjects = vi.mocked(listProductionProjects);
const buildBoard = vi.mocked(licenseModel.buildSharedResourceBoard);

describe("SharedResourcePriorityBoard 집계", () => {
  beforeEach(() => {
    listProjects.mockReset();
    buildBoard.mockClear();
    listProjects.mockResolvedValue({ projects: [] });
  });
  afterEach(cleanup);

  it("작품이 없으면 빈 상태 안내를 보여 준다", async () => {
    render(<SharedResourcePriorityBoard />);

    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/아직 집계할 열린 작업이나 에셋 요구가 없습니다|No open work or asset needs/u)).toBeTruthy();
    });
  });

  it("라이선스 등록분은 집계 시점의 값을 읽고, 새 배열로 바뀌어도 다시 불러오지 않는다", async () => {
    const licenses: readonly AssetLicenseMetadata[] = [];
    const { rerender } = render(<SharedResourcePriorityBoard assetLicenses={licenses} />);
    await waitFor(() => expect(buildBoard).toHaveBeenCalledTimes(1));
    expect(buildBoard.mock.calls[0]?.[1]).toMatchObject({ licenses });

    // 호출자가 같은 내용을 새 배열로 넘겨도(기본값 [] 포함) 재조회 루프가 생기지 않는다.
    rerender(<SharedResourcePriorityBoard assetLicenses={[]} />);
    rerender(<SharedResourcePriorityBoard assetLicenses={[]} />);

    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(buildBoard).toHaveBeenCalledTimes(1);
  });
});
