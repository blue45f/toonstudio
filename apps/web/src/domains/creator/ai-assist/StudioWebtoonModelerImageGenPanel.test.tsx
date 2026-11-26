// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";

import { StudioWebtoonModelerImageGenPanel } from "./StudioWebtoonModelerImageGenPanel";

vi.mock("@/platform/studio-ecosystem-client", () => ({
  studioEcosystemClient: { compileModelerCut: vi.fn() },
}));

afterEach(cleanup);

describe("StudioWebtoonModelerImageGenPanel", () => {
  it("캐릭터를 추가하고 컷 생성 요청을 보낸 뒤 서버 오류 시 로컬 완료를 표시한다", async () => {
    vi.mocked(studioEcosystemClient.compileModelerCut).mockRejectedValueOnce(new Error("offline"));
    const onGenerate = vi.fn();
    render(<StudioWebtoonModelerImageGenPanel onGenerateCutImage={onGenerate} />);

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 추가" }));
    fireEvent.click(screen.getByRole("button", { name: /웹툰 컷 생성/u }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0]?.[0]?.characterConsistencyTokens.length).toBe(2);
    expect(studioEcosystemClient.compileModelerCut).toHaveBeenCalledTimes(1);
    const status = await screen.findByText(/생성 요청 1건.*로컬 컴파일 완료/u);
    expect(status).toBe(screen.getByRole("status"));
  });

  it("컷 프리뷰를 선언적 SVG로 렌더링하고 비정상 select 값으로 DOM XSS를 주입할 수 없다", () => {
    const { container } = render(<StudioWebtoonModelerImageGenPanel />);
    const preview = screen.getByLabelText("웹툰 모델러 컷 프리뷰");
    expect(preview.querySelector("svg")).not.toBeNull();
    expect(preview.querySelector("script")).toBeNull();

    const ratioSelect = screen.getByLabelText("컷 비율") as HTMLSelectElement;
    fireEvent.change(ratioSelect, { target: { value: '16:9"><script>alert(1)</script>' } });
    expect(ratioSelect.value).toBe("9:16");
    expect(preview.querySelector("script")).toBeNull();
    expect(container.querySelector("script")).toBeNull();

    fireEvent.change(ratioSelect, { target: { value: "16:9" } });
    expect(preview.textContent).toContain("16:9");
  });
});
