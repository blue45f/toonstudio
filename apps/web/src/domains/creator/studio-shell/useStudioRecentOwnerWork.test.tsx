// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { StudioRecentServerWork } from "../offline/studio-recent-owner-work";
import { useStudioRecentOwnerWork } from "./useStudioRecentOwnerWork";

const read = vi.hoisted(() => vi.fn<(actorId: string, signal: AbortSignal) => Promise<StudioRecentServerWork | null>>());
vi.mock("../offline/studio-recent-owner-work", () => ({ readStudioRecentWork: read }));

it("계정이 바뀌면 앞선 응답과 이전 링크를 버리고 로그아웃 후에는 조회하지 않는다", async () => {
  let resolvePrevious: ((value: StudioRecentServerWork) => void) | undefined;
  const newer = { workId: "새 계정 작품", openedAt: 2 };
  read.mockImplementationOnce(() => new Promise(resolve => { resolvePrevious = resolve; })).mockResolvedValueOnce(newer);
  const view = renderHook(({ actor }: { actor: string | null }) => useStudioRecentOwnerWork(actor), {
    initialProps: { actor: "첫 작가" } as { actor: string | null },
  });
  view.rerender({ actor: "다음 작가" });
  await waitFor(() => expect(view.result.current).toEqual(newer));
  await act(async () => { resolvePrevious?.({ workId: "이전 계정 작품", openedAt: 1 }); });
  expect(view.result.current).toEqual(newer);
  view.rerender({ actor: null });
  expect(view.result.current).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
  view.unmount();
});
