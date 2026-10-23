// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dWebtoonBackgroundPicker,
  type StudioBg3dWebtoonBackgroundPickerProps,
  type StudioBg3dWebtoonBuildParts,
  type StudioBg3dWebtoonCameraView,
} from "./StudioBg3dWebtoonBackgroundPicker";
import {
  STUDIO_BG3D_BUILD_FAILED_NOTICE,
  STUDIO_BG3D_FOCUS_BUILT_LABEL,
  STUDIO_BG3D_RESTORE_WALLS_LABEL,
} from "./studio-bg3d-build-notice";
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
const restoreButton = () => screen.queryByRole("button", { name: STUDIO_BG3D_RESTORE_WALLS_LABEL });
const focusButton = () => screen.queryByRole("button", { name: STUDIO_BG3D_FOCUS_BUILT_LABEL });
const CORNER_OUTSIDE: StudioBg3dWebtoonCameraView = { position: [12, 2, 6], target: [0, 1, 0] };

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
    // 교실은 미닫이문·미서기 창·평천장·걸레받이를 쓴다(2026-10-23, 99 → 134).
    expect(committed[0]).toHaveLength(134);
    expect(committed[0].every((item) => typeof item.id === "string" && item.id.length > 0)).toBe(true);
  });

  it.each([
    ["교실", 134],
    ["복도", 100],
    ["거리", 96],
  ] as const)("%s: 호스트가 넘긴 기존 도형 수와 카메라 뷰로 %i개 도형을 만든다", (label, count) => {
    const { committed } = renderPicker({ existingCount: 7 });
    fireEvent.click(card(label));
    expect(committed[0]).toHaveLength(count);
    // 기존 도형이 7개면 X 로 밀려 첫 도형이 원점에 있지 않다.
    expect(committed[0][0].position[0]).not.toBe(0);
  });

  it("자동 단면이 꺼져 있으면 아무 벽도 숨기지 않고 안내에도 숨김 문구와 되돌리기 버튼이 없다", () => {
    const { committed } = renderPicker({ autoCutaway: false, onShowParts: vi.fn() });
    fireEvent.click(card("교실"));
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("교실 추가 완료 · 오브젝트 134개.");
    expect(restoreButton()).toBeNull();
  });

  it("자동 단면이 켜져 있고 카메라가 방 밖이면 카메라 쪽 벽 조각 수와 되돌리는 길을 알린다", () => {
    const { committed } = renderPicker({ autoCutaway: true, onShowParts: vi.fn() });
    fireEvent.click(card("교실"));
    const hidden = committed[0].filter((item) => item.visible === false);
    expect(hidden.length).toBeGreaterThan(0);
    // 숨긴 벽에 붙은 걸레받이도 함께 숨고, 안내는 벽 이름표(앞벽)로 묶어 센다.
    expect(hidden.every((item) => item.name?.startsWith("앞벽 "))).toBe(true);
    expect(hidden.some((item) => item.name === "앞벽 벽체")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      `교실 추가 완료 · 오브젝트 134개. 시선을 가리는 앞벽 ${hidden.length}조각을 숨겼어요. 아래 '숨긴 벽 되돌리기'나 레이어 목록의 눈 아이콘으로 다시 켤 수 있어요.`,
    );
    expect(restoreButton()).toBeTruthy();
  });

  it("벽이 둘 이상 숨겨지면 벽마다 조각 수를 나눠 알린다(복도 앞벽은 조각이 많다)", () => {
    const { committed } = renderPicker({ autoCutaway: true, view: CORNER_OUTSIDE, onShowParts: vi.fn() });
    fireEvent.click(card("복도"));
    const count = (name: string) => committed[0].filter((item) => item.visible === false && item.name === name).length;
    // 벽 이름표로 묶은 수: 벽체 조각 + 그 벽의 창틀·창짝·문틀·걸레받이.
    const group = (wall: string) => committed[0].filter((item) => item.visible === false && item.name?.startsWith(`${wall} `)).length;
    expect(count("앞벽 벽체")).toBeGreaterThan(1);
    expect(count("오른벽 벽체")).toBeGreaterThan(0);
    expect(group("앞벽")).toBeGreaterThan(count("앞벽 벽체"));
    expect(screen.getByRole("status").textContent).toContain(
      `시선을 가리는 앞벽 ${group("앞벽")}조각·오른벽 ${group("오른벽")}조각을 숨겼어요.`,
    );
  });

  it("숨긴 벽 되돌리기: 방금 숨긴 조각의 id 만 호스트에 넘기고, 안내가 바뀌며 버튼이 사라진다", () => {
    const onShowParts = vi.fn();
    const { committed } = renderPicker({ autoCutaway: true, onShowParts });
    fireEvent.click(card("교실"));
    const hiddenIds = committed[0].filter((item) => item.visible === false).map((item) => item.id);
    fireEvent.click(restoreButton()!);
    expect(onShowParts).toHaveBeenCalledTimes(1);
    expect(onShowParts).toHaveBeenCalledWith(hiddenIds);
    expect(screen.getByRole("status").textContent).toBe(
      `교실 추가 완료 · 오브젝트 134개. 숨겼던 앞벽 ${hiddenIds.length}조각을 다시 보이게 했어요.`,
    );
    expect(restoreButton()).toBeNull();
  });

  it("호스트 콜백을 주지 않으면 되돌리기 버튼을 그리지 않는다", () => {
    renderPicker({ autoCutaway: true });
    fireEvent.click(card("교실"));
    expect(restoreButton()).toBeNull();
  });

  it("새 배경을 만들면 이전 배경의 되돌리기 버튼은 새 배경 기준으로 바뀐다", () => {
    const onShowParts = vi.fn();
    const { committed } = renderPicker({ autoCutaway: true, onShowParts });
    fireEvent.click(card("교실"));
    fireEvent.click(card("거리"));
    expect(restoreButton()).toBeNull();
    fireEvent.click(card("교실"));
    fireEvent.click(restoreButton()!);
    expect(onShowParts).toHaveBeenCalledTimes(1);
    expect(onShowParts).toHaveBeenCalledWith(committed[2].filter((item) => item.visible === false).map((item) => item.id));
  });

  it("비활성 상태에서는 되돌리기 버튼도 잠긴다", () => {
    const { rerender, onBuild } = renderPicker({ autoCutaway: true, onShowParts: vi.fn() });
    fireEvent.click(card("교실"));
    rerender(
      <StudioBg3dWebtoonBackgroundPicker autoCutaway onAutoCutawayChange={vi.fn()} onBuild={onBuild} onShowParts={vi.fn()} disabled />,
    );
    expect((restoreButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("카메라가 방 안이면 단면을 켜도 숨기지 않는다", () => {
    const { committed } = renderPicker({ autoCutaway: true, view: INSIDE, onShowParts: vi.fn() });
    fireEvent.click(card("복도"));
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("복도 추가 완료 · 오브젝트 100개.");
    expect(restoreButton()).toBeNull();
  });

  it("거리에는 벽이 없어 단면이 켜져 있어도 그대로 만든다", () => {
    const { committed } = renderPicker({ autoCutaway: true, onShowParts: vi.fn() });
    fireEvent.click(card("거리"));
    expect(committed[0]).toHaveLength(96);
    expect(committed[0].some((item) => item.visible === false)).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("거리 추가 완료 · 오브젝트 96개.");
    expect(restoreButton()).toBeNull();
  });

  it("처음 만드는 배경은 원점에 놓이므로 위치 안내와 이동 버튼이 없다", () => {
    renderPicker({ existingCount: 0, onFocusBuilt: vi.fn() });
    fireEvent.click(card("교실"));
    expect(screen.getByRole("status").textContent).not.toContain("떨어진 곳");
    expect(focusButton()).toBeNull();
  });

  it("기존 도형이 있어 옆으로 밀린 새 배경은 얼마나 떨어졌는지 알리고 '새로 만든 곳 보기'로 화면을 맞춘다", () => {
    const onFocusBuilt = vi.fn();
    const { committed } = renderPicker({ existingCount: 99, onFocusBuilt });
    fireEvent.click(card("교실"));
    const shift = committed[0][0].position[0] - 0; // 첫 도형(바닥)의 중심 X = 오프셋
    expect(shift).toBeCloseTo(99 * (9 / 6), 10);
    expect(screen.getByRole("status").textContent).toContain(
      "기존 오브젝트와 겹치지 않게 +X 방향으로 148.5m 떨어진 곳에 만들었어요. 화면에 보이지 않으면 '새로 만든 곳 보기'를 눌러 주세요.",
    );
    fireEvent.click(focusButton()!);
    expect(onFocusBuilt).toHaveBeenCalledTimes(1);
    // 안내는 그대로 남는다(되돌리기 버튼 등 다른 버튼이 있어도 영향이 없다).
    expect(screen.getByRole("status").textContent).toContain("148.5m");
  });

  it("이동 콜백을 주지 않으면 위치 안내 문장은 있어도 버튼은 그리지 않는다", () => {
    renderPicker({ existingCount: 12 });
    fireEvent.click(card("거리"));
    expect(screen.getByRole("status").textContent).toContain("떨어진 곳에 만들었어요");
    expect(focusButton()).toBeNull();
  });

  it("호스트가 받아들이지 않으면(한도·준비 중) 원인과 다음 행동을 알린다", () => {
    renderPicker({ accepted: false });
    fireEvent.click(card("교실"));
    expect(screen.getByRole("status").textContent).toBe(STUDIO_BG3D_BUILD_FAILED_NOTICE);
    expect(screen.getByRole("status").textContent).toContain("지금은 추가하지 못했어요");
    expect(screen.getByRole("status").textContent).toContain("다시 시도");
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

  it("호스트가 더한 도형 목록을 돌려줘도 성공으로 본다(실제 호스트의 반환값)", () => {
    const onBuild = vi.fn((buildParts: StudioBg3dWebtoonBuildParts) => buildParts(0, OUTSIDE_SOUTH));
    render(<StudioBg3dWebtoonBackgroundPicker autoCutaway={false} onAutoCutawayChange={vi.fn()} onBuild={onBuild} />);
    fireEvent.click(card("복도"));
    expect(screen.getByRole("status").textContent).toBe("복도 추가 완료 · 오브젝트 100개.");
  });

  it("두 번째 추가는 첫 번째 안내를 새 안내로 바꾼다", () => {
    renderPicker();
    fireEvent.click(card("교실"));
    fireEvent.click(card("거리"));
    expect(screen.getByRole("status").textContent).toBe("거리 추가 완료 · 오브젝트 96개.");
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
