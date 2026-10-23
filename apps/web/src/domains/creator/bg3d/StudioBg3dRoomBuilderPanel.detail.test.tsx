// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import {
  buildStudioBg3dRoomParts,
  clampStudioBg3dRoomSpec,
  getStudioBg3dRoomPreset,
  type StudioBg3dRoomSpec,
} from "./studio-bg3d-room-builder";

afterEach(cleanup);

// 방 만들기 패널의 문·창 모양·열림·세부 설정과 천장·몰딩 컨트롤(2026-10-23). 패널은 무상태라 바뀐 스펙을 부모에 올리는지만 본다.

const cafe = getStudioBg3dRoomPreset("cafe")!.spec;

function renderPanel(spec: StudioBg3dRoomSpec = cafe, disabled = false) {
  const onSpecChange = vi.fn();
  const view = render(
    <StudioBg3dRoomBuilderPanel spec={spec} disabled={disabled} onSpecChange={onSpecChange} onApplyPreset={vi.fn()} onInsert={vi.fn()} />,
  );
  /** 마지막으로 올린 스펙(부모처럼 clamp 해서 본다). */
  const last = (): StudioBg3dRoomSpec => clampStudioBg3dRoomSpec(onSpecChange.mock.lastCall![0]);
  return { ...view, onSpecChange, last };
}

const styled = (patch: Partial<StudioBg3dRoomSpec>) => clampStudioBg3dRoomSpec({ ...cafe, ...patch });

describe("문·창 모양", () => {
  it("오프닝마다 모양 선택이 있고 문·창 종류에 맞는 모양만 고를 수 있다", () => {
    renderPanel();
    // 카페: 문 1 · 창 2.
    const door = screen.getByRole("combobox", { name: "오프닝 1 모양" }) as HTMLSelectElement;
    expect([...door.options].map((option) => option.textContent)).toEqual(["빈 구멍", "여닫이문", "미닫이문", "유리문", "셔터"]);
    const window = screen.getByRole("combobox", { name: "오프닝 2 모양" }) as HTMLSelectElement;
    expect([...window.options].map((option) => option.textContent)).toEqual(["빈 구멍", "미서기 창", "여닫이 창", "롤스크린 창", "셔터"]);
    // 모양을 고르지 않은 기존 오프닝은 빈 구멍이다.
    expect(door.value).toBe("hole");
  });

  it("모양을 바꾸면 그 오프닝만 바뀐 스펙을 올리고, 빈 구멍에는 열림 조절이 없다", () => {
    const { onSpecChange, last } = renderPanel();
    expect(screen.queryByRole("slider", { name: /오프닝 1 열림/u })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "오프닝 1 모양" }), { target: { value: "hinged-door" } });
    expect(onSpecChange).toHaveBeenCalledTimes(1);
    expect(last().openings.map((opening) => opening.style)).toEqual(["hinged-door", undefined, undefined]);
  });

  it("열림·올림 슬라이더는 퍼센트를 읽어 주고 값을 바꾸면 openRatio 를 올린다", () => {
    const spec = styled({
      openings: [
        { ...cafe.openings[0]!, style: "hinged-door", openRatio: 0.25 },
        { ...cafe.openings[1]!, style: "roller-blind" },
        cafe.openings[2]!,
      ],
    });
    const { last } = renderPanel(spec);
    const open = screen.getByRole("slider", { name: "오프닝 1 열림 정도" });
    expect(open.getAttribute("aria-valuetext")).toBe("25%");
    // 롤스크린은 "올림"으로 읽고 기본값(50%)을 보여 준다.
    expect(screen.getByRole("slider", { name: "오프닝 2 올림 정도" }).getAttribute("aria-valuetext")).toBe("50%");
    fireEvent.change(open, { target: { value: "0.6" } });
    expect(last().openings[0]!.openRatio).toBeCloseTo(0.6, 10);
  });

  it("세부 설정은 접혀 있다가 펼치면 경첩 쪽·짝 수를 고르고, '폭에 맞춤'은 짝 수를 지운다", () => {
    const spec = styled({ openings: [{ ...cafe.openings[0]!, style: "sliding-door", divisions: 1 }, cafe.openings[1]!, cafe.openings[2]!] });
    const { last } = renderPanel(spec);
    const toggle = screen.getByRole("button", { name: "오프닝 1 세부 설정" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(region.hidden).toBe(false);
    // 미닫이문의 경첩 자리는 "들어가는 쪽"이다.
    fireEvent.change(within(region).getByRole("combobox", { name: "오프닝 1 들어가는 쪽" }), { target: { value: "right" } });
    expect(last().openings[0]!.hinge).toBe("right");
    const leaves = within(region).getByRole("combobox", { name: "오프닝 1 짝 수" }) as HTMLSelectElement;
    expect(leaves.value).toBe("1");
    fireEvent.change(leaves, { target: { value: "2" } });
    expect(last().openings[0]!.divisions).toBe(2);
    fireEvent.change(leaves, { target: { value: "auto" } });
    expect(last().openings[0]).not.toHaveProperty("divisions");
  });

  it("새 문·창은 틀과 짝이 있는 모양으로 시작하고, 추가 버튼의 개수가 실제 파츠 수와 같다", () => {
    const { last, rerender, onSpecChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "문" }));
    expect(last().openings.at(-1)?.style).toBe("hinged-door");
    fireEvent.click(screen.getByRole("button", { name: "창" }));
    expect(last().openings.at(-1)?.style).toBe("window-sliding");
    const next = last();
    rerender(<StudioBg3dRoomBuilderPanel spec={next} onSpecChange={onSpecChange} onApplyPreset={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByRole("button", { name: /방 추가/u }).textContent).toContain(`오브젝트 ${buildStudioBg3dRoomParts(next).length}개`);
  });
});

describe("천장·몰딩", () => {
  it("천장은 네 가지 중 하나를 고르는 라디오이고, 고르면 ceiling 을 올린다", () => {
    const { last } = renderPanel();
    const group = screen.getByRole("group", { name: "천장" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual(["없음", "평천장", "서까래", "우물반자"]);
    expect(radios.find((radio) => radio.checked)?.value).toBe("none");
    fireEvent.click(within(group).getByRole("radio", { name: "서까래" }));
    expect(last().ceiling).toBe("rafter");
  });

  it("몰딩 세부 설정은 접혀 있고 요약을 보여 주며, 걸레받이를 켜면 나머지는 꺼진 몰딩 설정을 올린다", () => {
    const { last } = renderPanel();
    const toggle = screen.getByRole("button", { name: /몰딩 세부 설정/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("걸레받이 끔 · 크라운 없음 · 징두리 끔 · 의자 레일 끔");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    fireEvent.click(toggle);
    fireEvent.click(within(region).getByRole("switch", { name: "걸레받이" }));
    expect(last().trims).toEqual({
      baseboard: { enabled: true, heightM: 0.08, depthM: 0.015 },
      crown: { style: "none", heightM: 0.1 },
      wainscot: { enabled: false, heightM: 0.9 },
      chairRail: false,
    });
  });

  it("켠 몰딩만 높이 조절을 보이고, 크라운 모양을 고르면 그 높이 조절이 나타난다", () => {
    const spec = styled({ trims: { baseboard: { enabled: true, heightM: 0.1, depthM: 0.015 }, crown: { style: "none", heightM: 0.1 }, wainscot: { enabled: false, heightM: 0.9 }, chairRail: false } });
    const { last } = renderPanel(spec);
    fireEvent.click(screen.getByRole("button", { name: /몰딩 세부 설정/u }));
    expect(screen.getByRole("slider", { name: /걸레받이 높이/u }).getAttribute("aria-valuetext")).toBe("10cm");
    expect(screen.queryByRole("slider", { name: /크라운 높이/u })).toBeNull();
    expect(screen.queryByRole("slider", { name: /징두리 높이/u })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "크라운 몰딩" }), { target: { value: "cove" } });
    expect(last().trims?.crown.style).toBe("cove");
  });

  it("비활성 상태면 새 컨트롤도 모두 잠긴다", () => {
    renderPanel(styled({ openings: [{ ...cafe.openings[0]!, style: "hinged-door" }, cafe.openings[1]!, cafe.openings[2]!] }), true);
    expect((screen.getByRole("combobox", { name: "오프닝 1 모양" }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("slider", { name: "오프닝 1 열림 정도" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "오프닝 1 세부 설정" }) as HTMLButtonElement).disabled).toBe(true);
    for (const radio of within(screen.getByRole("group", { name: "천장" })).getAllByRole("radio")) {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByRole("button", { name: /몰딩 세부 설정/u }) as HTMLButtonElement).disabled).toBe(true);
  });
});
