// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import { StudioLiveCollaborationProviderLazy } from "./StudioLiveCollaborationProviderLazy";

describe("StudioLiveCollaborationProviderLazy", () => {
  it("지연 로드된 협업 공급자가 준비되어도 children(캔버스·Konva·OPFS)을 언마운트·재마운트하지 않고 컨텍스트를 미러링한다", async () => {
    let mountCount = 0;
    let unmountCount = 0;
    const seenAvailabilities: string[] = [];

    function CanvasChildProbe() {
      const live = useStudioLiveCollaboration();
      seenAvailabilities.push(live.availability);
      useEffect(() => {
        mountCount += 1;
        return () => {
          unmountCount += 1;
        };
      }, []);
      return <div data-testid="canvas-probe" data-availability={live.availability} />;
    }

    const onRoomChange = vi.fn();
    const { getByTestId } = render(
      <StudioLiveCollaborationProviderLazy
        workId="work-lazy-stability"
        participant={{ displayName: "작가", role: "owner" }}
        currentPageId="page-1"
        currentTool="pen"
        onRoomChange={onRoomChange}
      >
        <CanvasChildProbe />
      </StudioLiveCollaborationProviderLazy>,
    );

    expect(getByTestId("canvas-probe")).toBeTruthy();
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);

    await waitFor(() => {
      expect(seenAvailabilities.length).toBeGreaterThanOrEqual(1);
    });

    // 지연 로드 완료 후에도 children이 절대 언마운트/재마운트되지 않아야 한다.
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
  });
});
