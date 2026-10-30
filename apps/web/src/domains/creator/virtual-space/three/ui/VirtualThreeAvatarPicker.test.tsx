// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { BUNDLED_VRM_RIGHTS_BLOCKS, SAMPLE_VRMS } from "../../../vrm/vrm-library";
import { isStudioVrmProductionThumbnailUrl } from "../../../vrm/studio-vrm-thumbnail-quality";
import { STUDIO_THREE_VRM_URLS } from "../studio-virtual-space-three-scene";
import { VirtualThreeAvatarPicker } from "./VirtualThreeAvatarPicker";

const gate = vi.hoisted(() => ({ denied: new Set<string>(), extraUrls: new Set<string>() }));
vi.mock("../studio-virtual-space-three-scene", async importOriginal => {
  const actual = await importOriginal<typeof import("../studio-virtual-space-three-scene")>();
  return {
    ...actual,
    get STUDIO_THREE_VRM_URLS() { return [...actual.STUDIO_THREE_VRM_URLS, ...gate.extraUrls]; },
    isVerifiedStudioThreeVrmUrl: (value: unknown) => actual.isVerifiedStudioThreeVrmUrl(value) && !gate.denied.has(value),
  };
});
beforeEach(() => { gate.denied.clear(); gate.extraUrls.clear(); useI18n.getState().setLang("ko"); });
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

function nameFor(index: number): string {
  const name = SAMPLE_VRMS.find(sample => sample.url === STUDIO_THREE_VRM_URLS[index])?.name;
  if (!name) throw new Error("기존 3D 슬롯의 metadata 이름이 없습니다.");
  return name;
}

describe("독립 3D 아바타 선택기", () => {
  it("실제 Scene의 9개 슬롯 이름과 검증된 thumbnail만 쓰며 렌더만으로 선택을 바꾸지 않는다", () => {
    const onSelect = vi.fn();
    const view = render(<VirtualThreeAvatarPicker avatarIndex={0} onSelect={onSelect} />);
    const group = screen.getByRole("group", { name: "3D 아바타" });
    expect(within(group).getAllByRole("button")).toHaveLength(9);
    for (let index = 0; index < 9; index += 1) {
      const button = within(group).getByRole("button", { name: nameFor(index) });
      expect(button.getAttribute("data-three-avatar-index")).toBe(String(index));
      expect(button.getAttribute("aria-pressed")).toBe(String(index === 0));
      const image = button.querySelector("img");
      if (image) expect(isStudioVrmProductionThumbnailUrl(image.getAttribute("src"))).toBe(true);
    }
    expect(view.container.querySelector("svg")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("선택 callback은 필터된 화면 순번이 아닌 기존 avatarIndex 슬롯을 전달한다", () => {
    const onSelect = vi.fn();
    const first = STUDIO_THREE_VRM_URLS[0];
    if (!first) throw new Error("첫 3D 모델이 없습니다.");
    gate.denied.add(first);
    render(<VirtualThreeAvatarPicker avatarIndex={8} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    const last = screen.getByRole("button", { name: nameFor(8) });
    expect(last.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(last);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(8);
  });

  it("기존 modulo avatarIndex 표시를 따르되 명시적 선택만 기존 onSelect로 보낸다", () => {
    const onSelect = vi.fn();
    const view = render(<VirtualThreeAvatarPicker avatarIndex={9} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: nameFor(0) }).getAttribute("aria-pressed")).toBe("true");
    view.rerender(<VirtualThreeAvatarPicker avatarIndex={-1} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: nameFor(8) }).getAttribute("aria-pressed")).toBe("true");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("권리 blocked·조건부·외부 모델을 추가하지 않고 클릭 시점의 gate도 다시 확인한다", () => {
    const onSelect = vi.fn();
    for (const blocked of BUNDLED_VRM_RIGHTS_BLOCKS) gate.extraUrls.add(blocked.url);
    gate.extraUrls.add("/vrm/AliciaSolid.vrm"); gate.extraUrls.add("https://example.com/avatar.vrm");
    render(<VirtualThreeAvatarPicker avatarIndex={0} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
    const first = STUDIO_THREE_VRM_URLS[0];
    if (!first) throw new Error("첫 3D 모델이 없습니다.");
    gate.denied.add(first);
    fireEvent.click(screen.getByRole("button", { name: nameFor(0) }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("thumbnail 실패는 합성 preview 대신 모델 이름만 남기며 선택 기능을 유지한다", () => {
    const onSelect = vi.fn();
    render(<VirtualThreeAvatarPicker avatarIndex={0} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: nameFor(1) });
    const image = button.querySelector("img");
    if (!image) throw new Error("기존 모델 thumbnail이 없습니다.");
    fireEvent.error(image);
    expect(button.querySelector("img")).toBeNull();
    expect(button.textContent).toContain(nameFor(1));
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("키보드 포커스·activation click을 지원하고 이동 키는 월드로 전파하지 않는다", () => {
    const onSelect = vi.fn(); const onKeyDown = vi.fn(); const onKeyUp = vi.fn();
    const ancestor = document.body;
    ancestor.addEventListener("keydown", onKeyDown);
    ancestor.addEventListener("keyup", onKeyUp);
    try {
      render(<VirtualThreeAvatarPicker avatarIndex={0} onSelect={onSelect} />);
      const button = screen.getByRole("button", { name: nameFor(1) });
      button.focus();
      expect(document.activeElement).toBe(button);
      expect(button.getAttribute("type")).toBe("button");
      fireEvent.keyDown(button, { key: "ArrowUp" });
      fireEvent.keyUp(button, { key: "ArrowUp" });
      expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
      expect(fireEvent.keyUp(button, { key: " " })).toBe(true);
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(onKeyUp).not.toHaveBeenCalled();
      fireEvent.click(button, { detail: 0 });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
      for (const key of ["Escape", "Tab"]) {
        expect(fireEvent.keyDown(button, { key })).toBe(true);
        expect(fireEvent.keyUp(button, { key })).toBe(true);
      }
      expect(onKeyDown).toHaveBeenCalledTimes(2);
      expect(onKeyUp).toHaveBeenCalledTimes(2);
    } finally {
      ancestor.removeEventListener("keydown", onKeyDown);
      ancestor.removeEventListener("keyup", onKeyUp);
    }
  });

  it("공통 i18n으로 안내를 바꾸고 metadata 모델명은 그대로 사용한다", () => {
    act(() => { useI18n.getState().setLang("en"); });
    render(<VirtualThreeAvatarPicker avatarIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByRole("group", { name: "3D avatar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: nameFor(0) })).toBeTruthy();
    expect(screen.getByText("Choose a model to update your avatar in the current 3D space.")).toBeTruthy();
  });
});
