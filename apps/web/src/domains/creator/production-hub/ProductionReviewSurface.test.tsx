// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionReviewSurface } from "./ProductionReviewSurface";
import { productionSubmissionReviewFixture } from "./production-review-submission.test-fixture";

afterEach(cleanup);

describe("작업 검수 링크와 운영·체험 경계", () => {
  it("주소의 작업·회차를 읽어 해당 작업의 현재 제출본을 검수 작업대에 연다", () => {
    const { aggregate, task, submission } = productionSubmissionReviewFixture("episode-13");
    render(<MemoryRouter initialEntries={[`/review?task=${task.id}&episode=episode-13`]}><ProductionReviewSurface aggregate={aggregate} canEdit roleLens="art" execute={vi.fn(async () => undefined)} /></MemoryRouter>);
    const workspace = document.querySelector("[data-production-review-workspace]");
    if (!(workspace instanceof HTMLElement)) throw new Error("검수 작업대가 없습니다.");
    expect((within(workspace).getByRole("combobox", { name: "검수 회차" }) as HTMLSelectElement).value).toBe("episode-13");
    expect((within(workspace).getByRole("combobox", { name: "검수 제출본" }) as HTMLSelectElement).value).toBe(submission.id);
    expect(screen.queryByText("기능 체험 · 서버에 적용되지 않음")).toBeNull();
    expect(screen.queryByText(/크리에이티브 합의/)).toBeNull();
  });
  it("중복된 작업 파라미터는 다른 제출본으로 조용히 대체하지 않는다", () => {
    const { aggregate, task } = productionSubmissionReviewFixture();
    render(<MemoryRouter initialEntries={[`/review?task=${task.id}&task=another`]}><ProductionReviewSurface aggregate={aggregate} canEdit roleLens="art" execute={vi.fn(async () => undefined)} /></MemoryRouter>);
    expect(screen.getByText("선택한 작업을 찾을 수 없습니다.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "검수 제출본" }) as HTMLSelectElement).value).toBe("");
  });
  it("명시적인 샘플에서만 기능 체험 입구를 제공하고 처음에는 예시 도구를 실행하지 않는다", () => {
    const { aggregate } = productionSubmissionReviewFixture();
    render(<MemoryRouter><ProductionReviewSurface aggregate={aggregate} isDemo canEdit roleLens="art" execute={vi.fn(async () => undefined)} /></MemoryRouter>);
    const summary = screen.getByText("기능 체험 · 서버에 적용되지 않음");
    expect(summary.closest("details")?.open).toBe(false);
    expect(screen.queryByText(/크리에이티브 합의/)).toBeNull();
  });
});
