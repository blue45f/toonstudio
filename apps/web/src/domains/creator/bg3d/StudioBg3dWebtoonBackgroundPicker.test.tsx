// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dWebtoonBackgroundPicker,
  type StudioBg3dWebtoonBackgroundPickerProps,
  type StudioBg3dWebtoonBuildParts,
  type StudioBg3dWebtoonCameraView,
} from "./StudioBg3dWebtoonBackgroundPicker";
import { studioBg3dRoomFurnitureParts } from "./studio-bg3d-room-furniture";
import { STUDIO_BG3D_WEBTOON_BACKGROUNDS } from "./studio-bg3d-webtoon-background-templates";

import type { BgPrimitive } from "../studio-background-3d-metadata";

afterEach(cleanup);

const OUTSIDE_SOUTH: StudioBg3dWebtoonCameraView = { position: [0, 2, 14], target: [0, 1, 0] };
const INSIDE: StudioBg3dWebtoonCameraView = { position: [0, 1.6, 0], target: [1, 1.4, -2] };

/** 호스트 대역: buildParts 를 실제로 호출해 결과를 기록하고, accepted 로 커밋 성공 여부를 흉내 낸다. */
function renderPicker(
  options: {
    view?: StudioBg3dWebtoonCameraView;
    accepted?: boolean;
    existingCount?: number;
  } & Partial<StudioBg3dWebtoonBackgroundPickerProps> = {},
) {
  const { view = OUTSIDE_SOUTH, accepted = true, existingCount = 0, ...props } = options;
  const committed: BgPrimitive[][] = [];
  const onBuild = vi.fn((buildParts: StudioBg3dWebtoonBuildParts) => {
    const parts = buildParts(existingCount, view);
    if (accepted) committed.push(parts);
    return accepted;
  });
  const onAutoCutawayChange = vi.fn();
  const utils = render(
    <StudioBg3dWebtoonBackgroundPicker
      autoCutaway={false}
      onAutoCutawayChange={onAutoCutawayChange}
      onBuild={onBuild}
      {...props}
    />,
  );
  return { ...utils, onBuild, onAutoCutawayChange, committed };
}

const card = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label} 만들기`, "u") });

describe("StudioBg3dWebtoonBackgroundPicker", () => {
  it("교실·복도·거리 카드를 카탈로그 설명과 함께 보여 준다", () => {
    renderPicker();
    expect(screen.getByRole("heading", { name: "원클릭 웹툰 배경" })).toBeTruthy();
    for (const entry of STUDIO_BG3D_WEBTOON_BACKGROUNDS) {
      expect(card(entry.label).textContent).toContain(entry.description);
    }
    expect(screen.getAllByRole("button").filter((button) => /만들기/u.test(button.textContent ?? ""))).toHaveLength(3);
  });

  it("안내문의 수치는 카탈로그가 실제로 만드는 값과 같다", () => {
    renderPicker();
    const intro = screen.getByText(/사람 키 기준 실제 크기/u).textContent ?? "";
    const classroom = STUDIO_BG3D_WEBTOON_BACKGROUNDS.find((entry) => entry.id === "classroom")!;
    const street = STUDIO_BG3D_WEBTOON_BACKGROUNDS.find((entry) => entry.id === "street")!;
    if (classroom.kind !== "room" || street.kind !== "street") throw new Error("카탈로그 종류가 바뀌었습니다");
    const doorHeights = classroom.spec.openings.filter((opening) => opening.type === "door").map((door) => door.height);
    const desk = studioBg3dRoomFurnitureParts("deskSet", classroom.spec.wallHeight).find((part) => part.name === "책상 상판")!;
    expect(intro).toContain(`문 ${doorHeights[0]}m`);
    expect(intro).toContain(`책상 윗면 ${Number((desk.offset[1] + desk.scale[1] / 2).toFixed(2))}m`);
    expect(intro).toContain(`층고 ${street.spec.floorHeight}m`);
  });

  it("카드를 누르면 호스트에 도형 묶음 만들기 함수를 한 번 넘긴다", () => {
    const { onBuild, committed } = renderPicker();
    fireEvent.click(card("교실"));
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(1);
    expect(committed[0]).toHaveLength(99);
    expect(committed[0].every((item) => typeof item.id === "string" && item.id.length > 0)).toBe(true);
  });

  it.each([
    ["교실", 99],
    ["복도", 39],
    ["거리", 96],
  ] as const)("%s: 호스트가 넘긴 기존 도형 수와 카메라 뷰로 %i개 도형을 만든다", (label, count) => {
    const { committed } = renderPicker({ existingCount: 7 });
    fireEvent.click(card(label));
    expect(committed[0]).toHaveLength(count);
    // 기존 도형이 7개면 X 로 밀려 첫 도형이 원점에 있지 않다.
    expect(committed[0][0].position[0]).not.toBe(0);
  });

  it("자동 단면이 꺼져 있으면 아무 벽도 숨기지 않고 안내에도 숨김 문구가 없다", () => {
    const { committed } = renderPicker({ autoCutaway: false });
    fireEvent.click(card("교실"));
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("교실 추가 완료 · 오브젝트 99개");
  });

  it("자동 단면이 켜져 있고 카메라가 방 밖이면 카메라 쪽 벽을 숨기고 그 사실을 알린다", () => {
    const { committed } = renderPicker({ autoCutaway: true });
    fireEvent.click(card("교실"));
    const hidden = committed[0].filter((item) => item.visible === false);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((item) => item.name === "앞벽 벽체")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "교실 추가 완료 · 오브젝트 99개 · 앞벽을 카메라에 맞춰 숨겼어요(레이어 목록에서 다시 켤 수 있어요)",
    );
  });

  it("카메라가 방 안이면 단면을 켜도 숨기지 않는다", () => {
    const { committed } = renderPicker({ autoCutaway: true, view: INSIDE });
    fireEvent.click(card("복도"));
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("복도 추가 완료 · 오브젝트 39개");
  });

  it("거리에는 벽이 없어 단면이 켜져 있어도 그대로 만든다", () => {
    const { committed } = renderPicker({ autoCutaway: true });
    fireEvent.click(card("거리"));
    expect(committed[0]).toHaveLength(96);
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("거리 추가 완료 · 오브젝트 96개");
  });

  it("호스트가 받아들이지 않으면(한도·준비 중) 실패를 알린다", () => {
    renderPicker({ accepted: false });
    fireEvent.click(card("교실"));
    expect(screen.getByRole("status").textContent).toContain("지금은 추가하지 못했어요");
  });

  it("호스트가 undefined 를 돌려줘도 성공으로 보지 않는다", () => {
    const onBuild = vi.fn((buildParts: StudioBg3dWebtoonBuildParts) => {
      buildParts(0, OUTSIDE_SOUTH);
      return undefined;
    });
    render(<StudioBg3dWebtoonBackgroundPicker autoCutaway={false} onAutoCutawayChange={vi.fn()} onBuild={onBuild} />);
    fireEvent.click(card("복도"));
    expect(screen.getByRole("status").textContent).toContain("지금은 추가하지 못했어요");
  });

  it("두 번째 추가는 첫 번째 안내를 새 안내로 바꾼다", () => {
    renderPicker();
    fireEvent.click(card("교실"));
    fireEvent.click(card("거리"));
    expect(screen.getByRole("status").textContent).toBe("거리 추가 완료 · 오브젝트 96개");
  });

  it("자동 단면 스위치는 현재 값을 보여 주고 누르면 반대 값을 알린다", () => {
    const { onAutoCutawayChange, rerender, onBuild } = renderPicker({ autoCutaway: false });
    const off = screen.getByRole("switch", { name: "자동 단면 (카메라 쪽 벽 숨김)" });
    expect(off.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(off);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(true);
    rerender(<StudioBg3dWebtoonBackgroundPicker autoCutaway onAutoCutawayChange={onAutoCutawayChange} onBuild={onBuild} />);
    const on = screen.getByRole("switch", { name: "자동 단면 (카메라 쪽 벽 숨김)" });
    expect(on.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(on);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(false);
    expect(onBuild).not.toHaveBeenCalled();
  });

  it("비활성 상태에서는 카드와 스위치가 모두 잠긴다", () => {
    const { onBuild, onAutoCutawayChange } = renderPicker({ disabled: true });
    for (const label of ["교실", "복도", "거리"]) {
      const button = card(label) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    const toggle = screen.getByRole("switch") as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(onBuild).not.toHaveBeenCalled();
    expect(onAutoCutawayChange).not.toHaveBeenCalled();
  });
});
