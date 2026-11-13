// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Box } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dTaskNavigation } from "./StudioBg3dTaskNavigation";

const tabs = ["templates", "shapes", "models", "view", "lt", "layers"].map(id => ({ id, label: id, icon: Box }));
afterEach(cleanup);
function Host({ onSelect = () => {} }: { readonly onSelect?: (id: string) => void }) {
  const [active, setActive] = useState("templates");
  return <StudioBg3dTaskNavigation tabs={tabs} active={active} onSelect={id => { setActive(id); onSelect(id); }} />;
}
describe("3D 목적별 패널 탐색", () => {
  it("세 목적을 고르면 기존 여섯 패널을 중복 없이 모두 찾을 수 있다", () => {
    const select = vi.fn(); render(<Host onSelect={select} />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["templates", "shapes", "models"]);
    fireEvent.click(screen.getByRole("button", { name: "구도·작화" }));
    expect(select).toHaveBeenLastCalledWith("view");
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["view", "lt"]);
    fireEvent.click(screen.getByRole("tab", { name: "lt" }));
    expect(select).toHaveBeenLastCalledWith("lt");
    fireEvent.click(screen.getByRole("button", { name: "장면 레이어" }));
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["layers"]);
    expect(select).toHaveBeenLastCalledWith("layers");
    fireEvent.click(screen.getByRole("button", { name: "장면 만들기" }));
    expect(select).toHaveBeenLastCalledWith("templates");
  });
  it("현재 목적 안에서 방향키·Home·End와 roving tabindex 계약을 유지한다", () => {
    render(<Host />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "templates" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "models" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "models" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "templates" }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "models" }).tabIndex).toBe(-1);
  });
  it("물리·몰입 모드 잠금은 새 탐색 전체에 적용된다", () => {
    const { container } = render(<StudioBg3dTaskNavigation tabs={tabs} active="layers" onSelect={vi.fn()} blocked />);
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(true);
  });
});
