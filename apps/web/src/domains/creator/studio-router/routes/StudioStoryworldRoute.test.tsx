// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioStoryworldRoute } from "./StudioStoryworldRoute";

vi.mock("../../storyworld/StudioStoryworldLabPage", () => ({
  StudioStoryworldLabPage: (props: { readonly workId: string | null; readonly initialView?: string | null }) => (
    <div data-testid="lab" data-view={props.initialView ?? "none"} data-work={props.workId ?? "none"} />
  ),
}));

afterEach(() => cleanup());

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudioStoryworldRoute remixSourceWorkId={null} workId="work-1" />
    </MemoryRouter>,
  );
}

describe("StudioStoryworldRoute", () => {
  it("passes the plausibility view from the address to the lab page", async () => {
    renderAt("/studio/work/work-1/storyworld?view=plausibility");
    const lab = await screen.findByTestId("lab");
    expect(lab.getAttribute("data-view")).toBe("plausibility");
    expect(lab.getAttribute("data-work")).toBe("work-1");
  });

  it("ignores unknown view values and an absent view", async () => {
    renderAt("/studio/work/work-1/storyworld?view=other");
    expect((await screen.findByTestId("lab")).getAttribute("data-view")).toBe("none");
    cleanup();
    renderAt("/studio/work/work-1/storyworld");
    expect((await screen.findByTestId("lab")).getAttribute("data-view")).toBe("none");
  });
});
