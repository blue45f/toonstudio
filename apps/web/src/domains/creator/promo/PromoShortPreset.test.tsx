// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PromoDirectorControls } from "./PromoDirectorControls";
import { directPromo, emptyPromoProject } from "./promo-model";
import { PromoPanelEditor } from "./PromoPanelEditor";

import type { PromoPanel, PromoProject, PromoScene } from "./promo-model";

afterEach(cleanup);

const image = "data:image/png;base64,aGVsbG8=";
function projectWith(count: number, seconds: PromoProject["seconds"] = 15): PromoProject {
  const panels: PromoPanel[] = Array.from({ length: count }, (_, index) => ({
    id: `cut-${index}`, src: image, description: "", caption: `자막 ${index + 1}`, motion: "push-in", fit: "contain", weight: 1,
  }));
  return { ...emptyPromoProject(), seconds, panels };
}
function renderControls(project: PromoProject) {
  const onApply = vi.fn();
  const onShortPreset = vi.fn();
  render(<PromoDirectorControls project={project} disabled={false} onApply={onApply} onShortPreset={onShortPreset} onPatch={vi.fn()} />);
  return { onApply, onShortPreset, button: screen.getByRole("button", { name: /10초 쇼츠 트레일러/u }) };
}

describe("10초 쇼츠 프리셋 버튼", () => {
  it("틱톡·쇼츠용 이름과 안내를 보여 주고, 누르면 길이 변경 규칙을 가진 호출자에게 맡긴다", () => {
    const { onApply, onShortPreset, button } = renderControls(projectWith(3));
    expect(button.textContent).toContain("틱톡·쇼츠");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onShortPreset).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
    const note = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent).toContain("세로 9:16");
    expect(note?.textContent).toContain("최대 6개");
    expect(note?.getAttribute("role")).toBeNull();
  });

  it("컷이 7개 이상이면 눌 수 없고 이유를 경고로 알리며 컷은 지우지 않는다고 말한다", () => {
    const { onShortPreset, button } = renderControls(projectWith(7));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onShortPreset).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.id).toBe(button.getAttribute("aria-describedby"));
    expect(alert.textContent).toContain("6개까지");
    expect(alert.textContent).toContain("7개");
    expect(alert.textContent).toContain("컷은 지우지 않았어요");
  });

  it("컷이 없어도 프리셋은 길이·비율 설정용으로 누를 수 있고 다른 연출 템플릿은 컷이 필요하다", () => {
    const { button } = renderControls(emptyPromoProject());
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /애니 오프닝/u }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("다른 연출 템플릿은 기존처럼 프로젝트를 바꾼 결과를 onApply로 넘긴다", () => {
    const project = projectWith(2);
    const { onApply, onShortPreset } = renderControls(project);
    fireEvent.click(screen.getByRole("button", { name: /시네마틱 예고편/u }));
    expect(onApply).toHaveBeenCalledWith(directPromo(project, "trailer"));
    expect(onShortPreset).not.toHaveBeenCalled();
  });
});

describe("컷 복제 상한", () => {
  const scene: PromoScene = {
    panel: { id: "p1", src: image, description: "", caption: "", motion: "still", fit: "contain", weight: 1 },
    from: 0,
    duration: 120,
  };
  function duplicateButton(count: number, maxPanels?: number) {
    render(<PromoPanelEditor scene={scene} index={0} count={count} {...(maxPanels === undefined ? {} : { maxPanels })} disabled={false} onChange={vi.fn()} onMove={vi.fn()} onRemove={vi.fn()} onDuplicate={vi.fn()} />);
    return screen.getByRole("button", { name: "컷 1 복제" }) as HTMLButtonElement;
  }

  it("길이별 상한을 받으면 그 컷 수에서 복제를 막는다", () => {
    expect(duplicateButton(5, 6).disabled).toBe(false);
    cleanup();
    expect(duplicateButton(6, 6).disabled).toBe(true);
  });

  it("상한을 주지 않으면 기존 12컷에서 막는다", () => {
    expect(duplicateButton(11).disabled).toBe(false);
    cleanup();
    expect(duplicateButton(12).disabled).toBe(true);
  });
});
