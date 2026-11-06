// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProductionEpisodeRoomPage } from "./ProductionEpisodeRoomPage";
import { useI18n } from "@/shared/lib/i18n";

function renderEpisodeRoom() {
  return render(
    <MemoryRouter initialEntries={["/production/projects/sample-project/episodes/episode-12"]}>
      <Routes>
        <Route
          path="/production/projects/:projectId/episodes/:episodeId"
          element={<ProductionEpisodeRoomPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("ProductionEpisodeRoomPage REA Redline & Handoff Workbench", () => {
  it("renders benchmark attribution and updates redlineLayer and handoffGate toggles with aria-pressed", async () => {
    renderEpisodeRoom();

    const bar = await screen.findByTestId("episode-room-rea-redline-bar");
    expect(bar.textContent).toContain("SyncSketch · Frame.io · ShotGrid Review · Kitsu");

    const poseBtn = screen.getByTestId("episode-room-rea-layer-anatomical-pose-fix");
    const balloonBtn = screen.getByTestId("episode-room-rea-layer-balloon-tail-lead");
    const lightingBtn = screen.getByTestId("episode-room-rea-layer-lighting-continuity");

    expect(poseBtn.getAttribute("aria-pressed")).toBe("true");
    expect(balloonBtn.getAttribute("aria-pressed")).toBe("false");
    expect(lightingBtn.getAttribute("aria-pressed")).toBe("false");

    const zeroBtn = screen.getByTestId("episode-room-rea-gate-zero-blocking-threads");
    const dualBtn = screen.getByTestId("episode-room-rea-gate-pd-art-dual-signoff");
    const hotfixBtn = screen.getByTestId("episode-room-rea-gate-emergency-hotfix-lane");

    expect(zeroBtn.getAttribute("aria-pressed")).toBe("true");
    expect(dualBtn.getAttribute("aria-pressed")).toBe("false");
    expect(hotfixBtn.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("episode-room-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("인체·동세 레드라인");
    expect(status.textContent).toContain("미해결 블로커 0건 잠금");

    fireEvent.click(balloonBtn);
    expect(balloonBtn.getAttribute("aria-pressed")).toBe("true");
    expect(poseBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("말풍선 꼬리·시선 유도");

    fireEvent.click(lightingBtn);
    expect(lightingBtn.getAttribute("aria-pressed")).toBe("true");
    expect(balloonBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("조명·색온도 연속성");

    fireEvent.click(dualBtn);
    expect(dualBtn.getAttribute("aria-pressed")).toBe("true");
    expect(zeroBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("PD·작화 이중 승인");

    fireEvent.click(hotfixBtn);
    expect(hotfixBtn.getAttribute("aria-pressed")).toBe("true");
    expect(dualBtn.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("긴급 핫픽스 패스트트랙");
  });

  it("maintains zero Hangul characters inside episode-room-rea-redline-bar when locale is en", async () => {
    useI18n.getState().setLang("en");
    renderEpisodeRoom();

    const bar = await screen.findByTestId("episode-room-rea-redline-bar");
    expect(bar.textContent ?? "").not.toMatch(/[가-힣]/u);

    const withinBar = within(bar);
    fireEvent.click(withinBar.getByTestId("episode-room-rea-layer-lighting-continuity"));
    fireEvent.click(withinBar.getByTestId("episode-room-rea-gate-pd-art-dual-signoff"));

    const status = withinBar.getByTestId("episode-room-rea-status");
    expect(status.textContent).toContain("Lighting & Color Continuity");
    expect(status.textContent).toContain("PD & Art Dual Sign-Off");
    expect(bar.textContent ?? "").not.toMatch(/[가-힣]/u);
  });
});
