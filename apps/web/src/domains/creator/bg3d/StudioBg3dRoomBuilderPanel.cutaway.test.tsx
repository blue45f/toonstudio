// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dRoomBuilderPanel, type StudioBg3dRoomBuilderPanelProps } from "./StudioBg3dRoomBuilderPanel";
import { STUDIO_BG3D_BUILD_FAILED_NOTICE, STUDIO_BG3D_RESTORE_WALLS_LABEL } from "./studio-bg3d-build-notice";
import { getStudioBg3dRoomPreset, planStudioBg3dRoomBuild } from "./studio-bg3d-room-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

afterEach(cleanup);

const cafeSpec = getStudioBg3dRoomPreset("cafe")!.spec;

function renderPanel(overrides: Partial<StudioBg3dRoomBuilderPanelProps> = {}) {
  const handlers = {
    onSpecChange: vi.fn(),
    onApplyPreset: vi.fn(),
    onInsert: vi.fn(),
  };
  const view = render(<StudioBg3dRoomBuilderPanel spec={cafeSpec} {...handlers} {...overrides} />);
  return { ...handlers, ...view };
}

function cutawaySwitch(): HTMLElement | null {
  return screen.queryByRole("switch", { name: "자동 단면 (카메라 쪽 벽 숨김)" });
}

describe("StudioBg3dRoomBuilderPanel 자동 단면 토글", () => {
  it("변경 핸들러를 주지 않으면 토글을 그리지 않는다(단면을 쓰지 않는 화면)", () => {
    renderPanel();
    expect(cutawaySwitch()).toBeNull();
  });

  it("현재 켜짐·꺼짐 상태를 스위치로 보여 주고, 누르면 반대 값을 알린다", () => {
    const onAutoCutawayChange = vi.fn();
    const { rerender, ...rest } = renderPanel({ autoCutaway: false, onAutoCutawayChange });
    const off = cutawaySwitch()!;
    expect(off.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(off);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(true);

    rerender(
      <StudioBg3dRoomBuilderPanel
        spec={cafeSpec}
        onSpecChange={rest.onSpecChange}
        onApplyPreset={rest.onApplyPreset}
        onInsert={rest.onInsert}
        autoCutaway
        onAutoCutawayChange={onAutoCutawayChange}
      />,
    );
    const on = cutawaySwitch()!;
    expect(on.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(on);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(false);
    expect(onAutoCutawayChange).toHaveBeenCalledTimes(2);
  });

  it("토글을 눌러도 방은 추가되지 않고, 방 추가 버튼은 그대로 한 번만 부른다", () => {
    const onAutoCutawayChange = vi.fn();
    const { onInsert } = renderPanel({ autoCutaway: true, onAutoCutawayChange });
    fireEvent.click(cutawaySwitch()!);
    expect(onInsert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /방 추가/u }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    // 삽입 콜백은 단면 값을 인자로 받지 않는다 — 값은 부모가 이미 알고 있다.
    expect(onInsert).toHaveBeenCalledWith();
  });

  it("비활성 상태에서는 토글도 잠긴다", () => {
    const onAutoCutawayChange = vi.fn();
    renderPanel({ disabled: true, autoCutaway: true, onAutoCutawayChange });
    const toggle = cutawaySwitch() as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(onAutoCutawayChange).not.toHaveBeenCalled();
  });

  it("벽을 지우지 않고 숨긴다는 것과 한 번만 판단한다는 것을 설명한다", () => {
    renderPanel({ autoCutaway: true, onAutoCutawayChange: vi.fn() });
    expect(screen.getByText(/레이어 목록의 눈 아이콘으로 다시 켤 수 있어요/u)).toBeTruthy();
    expect(screen.getByText(/한 번만 판단하고/u)).toBeTruthy();
  });
});

/** 호스트 대역: 실제 룸 빌더 계획(카메라 위치로 판정)이 돌려주는 도형 목록을 onInsert 의 반환값으로 쓴다. */
function insertWith(cameraPosition: readonly [number, number, number]) {
  return vi.fn((): BgPrimitive[] =>
    planStudioBg3dRoomBuild(cafeSpec, 0, undefined, {
      autoCutawayCamera: { position: cameraPosition, target: [0, 1, 0] },
    }).primitives,
  );
}

const insertButton = () => screen.getByRole("button", { name: /방 추가/u });
const restoreButton = () => screen.queryByRole("button", { name: STUDIO_BG3D_RESTORE_WALLS_LABEL });

describe("StudioBg3dRoomBuilderPanel 추가 직후 안내와 숨긴 벽 되돌리기", () => {
  it("추가하기 전에는 안내도 되돌리기 버튼도 없다", () => {
    renderPanel({ autoCutaway: true, onAutoCutawayChange: vi.fn(), onShowParts: vi.fn() });
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe("");
    expect(restoreButton()).toBeNull();
  });

  it("벽을 숨기지 않은 추가는 개수만 알리고 되돌리기 버튼을 그리지 않는다", () => {
    const onInsert = insertWith([0, 1.6, 0]); // 방 안
    renderPanel({ onInsert, autoCutaway: true, onAutoCutawayChange: vi.fn(), onShowParts: vi.fn() });
    fireEvent.click(insertButton());
    const added = onInsert.mock.results[0]!.value as BgPrimitive[];
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe(`방 추가 완료 · 오브젝트 ${added.length}개.`);
    expect(restoreButton()).toBeNull();
  });

  it("벽을 숨긴 추가는 벽 이름과 조각 수를 알리고, 되돌리기는 숨긴 조각 id 만 부모에 넘긴다", () => {
    const onShowParts = vi.fn();
    const onInsert = insertWith([0, 2, 14]); // 방 밖 정면
    renderPanel({ onInsert, autoCutaway: true, onAutoCutawayChange: vi.fn(), onShowParts });
    fireEvent.click(insertButton());
    const added = onInsert.mock.results[0]!.value as BgPrimitive[];
    const hidden = added.filter((primitive) => primitive.visible === false);
    expect(hidden.length).toBeGreaterThan(0);
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe(
      `방 추가 완료 · 오브젝트 ${added.length}개. 시선을 가리는 앞벽 ${hidden.length}조각을 숨겼어요. 아래 '숨긴 벽 되돌리기'나 레이어 목록의 눈 아이콘으로 다시 켤 수 있어요.`,
    );
    fireEvent.click(restoreButton()!);
    expect(onShowParts).toHaveBeenCalledTimes(1);
    expect(onShowParts).toHaveBeenCalledWith(hidden.map((primitive) => primitive.id));
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe(
      `방 추가 완료 · 오브젝트 ${added.length}개. 숨겼던 앞벽 ${hidden.length}조각을 다시 보이게 했어요.`,
    );
    expect(restoreButton()).toBeNull();
  });

  it("부모가 되돌리기 콜백을 주지 않으면 버튼을 그리지 않는다(안내는 그대로)", () => {
    renderPanel({ onInsert: insertWith([0, 2, 14]), autoCutaway: true, onAutoCutawayChange: vi.fn() });
    fireEvent.click(insertButton());
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toContain("숨겼어요");
    expect(restoreButton()).toBeNull();
  });

  it("추가하지 못하면(false) 원인과 다음 행동을 알린다", () => {
    renderPanel({ onInsert: vi.fn(() => false) });
    fireEvent.click(insertButton());
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe(STUDIO_BG3D_BUILD_FAILED_NOTICE);
  });

  it("부모가 아무것도 돌려주지 않으면 안내를 만들지 않는다(다른 화면에서 쓰는 패널)", () => {
    renderPanel({ onInsert: vi.fn(() => undefined) });
    fireEvent.click(insertButton());
    expect(screen.getByTestId("studio-bg3d-build-notice").textContent).toBe("");
  });

  it("두 번째 추가는 이전 되돌리기 버튼을 새 결과 기준으로 바꾼다", () => {
    const onShowParts = vi.fn();
    const onInsert = vi.fn()
      .mockImplementationOnce(insertWith([0, 2, 14]))
      .mockImplementationOnce(insertWith([0, 1.6, 0]));
    renderPanel({ onInsert, autoCutaway: true, onAutoCutawayChange: vi.fn(), onShowParts });
    fireEvent.click(insertButton());
    expect(restoreButton()).toBeTruthy();
    fireEvent.click(insertButton());
    expect(restoreButton()).toBeNull();
    expect(onShowParts).not.toHaveBeenCalled();
  });
});
