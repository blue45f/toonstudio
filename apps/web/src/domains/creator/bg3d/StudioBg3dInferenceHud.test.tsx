// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dInferenceHud } from "./StudioBg3dInferenceHud";
import { StudioBg3dInferenceKeyboardPicker } from "./StudioBg3dInferenceKeyboardPicker";
import { StudioBg3dInferenceMarker } from "./StudioBg3dInferenceMarker";
import { StudioBg3dLengthField } from "./StudioBg3dLengthField";
import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_KINDS,
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import { attachStudioBg3dInferenceKeyboard } from "./studio-bg3d-inference-keyboard";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type { StudioBg3dInferenceApplyLengthRequest } from "./studio-bg3d-inference-service";
import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceCursor } from "./studio-bg3d-inference-types";

const detachers: Array<() => void> = [];

afterEach(() => {
  cleanup();
  for (const detach of detachers.splice(0)) detach();
});

/** 창 리스너는 테스트가 끝나면 반드시 해제한다 — 이전 테스트의 서비스가 키를 가로채지 않게. */
function attachKeys(service: ReturnType<typeof createService>): () => void {
  const detach = attachStudioBg3dInferenceKeyboard({ window, document, service });
  detachers.push(detach);
  return detach;
}

/** 64px = 1m (이진 분수라 px 경계 비교가 정확하다). */
const WPP = 1 / 64;

type Vec = readonly [number, number, number];

function box(id: string, position: Vec): StudioBg3dInferenceSceneEntity {
  return { id, kind: "box", label: `상자 ${id}`, position, rotation: [0, 0, 0], scale: [1, 1, 1] };
}

function pointCursor(point: Vec): StudioBg3dInferenceCursor {
  return { kind: "point", point, worldPerPixel: WPP };
}

function createService() {
  return createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
}

describe("StudioBg3dInferenceMarker — 모양+색 이중 인코딩과 접근성 이름", () => {
  it("모든 추론 종류가 role=img 와 한국어 접근성 이름을 가진다", () => {
    for (const kind of STUDIO_BG3D_INFERENCE_KINDS) {
      const { unmount } = render(<StudioBg3dInferenceMarker kind={kind} />);
      const marker = screen.getByRole("img", { name: studioBg3dInferenceKindLabel(kind) });
      expect(marker.getAttribute("data-kind")).toBe(kind);
      expect(marker.getAttribute("data-shape")).toBe(STUDIO_BG3D_INFERENCE_KIND_STYLE[kind].shape);
      unmount();
    }
  });

  it("점 계열(끝점·중간점·교차점·중심)은 서로 다른 모양을 쓴다 — 색에만 의존하지 않는다", () => {
    const shapes = (["endpoint", "midpoint", "intersection", "center"] as const).map(
      (kind) => STUDIO_BG3D_INFERENCE_KIND_STYLE[kind].shape,
    );
    expect(new Set(shapes).size).toBe(shapes.length);
    // 정렬 계열도 서로 다른 모양이다.
    const alignShapes = (["axis", "from-point", "parallel", "perpendicular"] as const).map(
      (kind) => STUDIO_BG3D_INFERENCE_KIND_STYLE[kind].shape,
    );
    expect(new Set(alignShapes).size).toBe(alignShapes.length);
  });

  it("축 정렬은 X·Y·Z 이름과 축 색 토큰(빨강·초록·파랑)을 쓴다", () => {
    const expectedTone = { x: "text-bad", y: "text-good", z: "text-cool" } as const;
    for (const axis of ["x", "y", "z"] as const) {
      const { unmount } = render(<StudioBg3dInferenceMarker kind="axis" axis={axis} />);
      const marker = screen.getByRole("img", { name: `${STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].label} 정렬` });
      expect(marker.className).toContain(expectedTone[axis]);
      expect(marker.getAttribute("data-axis")).toBe(axis);
      unmount();
    }
  });

  it("기준점에서 연장은 축 이름을 접근성 이름에 담는다", () => {
    render(<StudioBg3dInferenceMarker kind="from-point" axis="z" />);
    expect(screen.getByRole("img", { name: "기준점에서 Z축 연장" })).toBeTruthy();
  });

  it("showLabel은 보이는 툴팁을 더하되 스크린리더에는 중복해 읽히지 않는다", () => {
    render(<StudioBg3dInferenceMarker kind="endpoint" showLabel />);
    const marker = screen.getByRole("img", { name: "끝점" });
    const pill = within(marker).getByText("끝점");
    expect(pill.getAttribute("aria-hidden")).toBe("true");
  });

  it("직접 준 label이 접근성 이름이 된다", () => {
    render(<StudioBg3dInferenceMarker kind="on-face" label="면 위 — 상자 1" />);
    expect(screen.getByRole("img", { name: "면 위 — 상자 1" })).toBeTruthy();
  });
});

describe("StudioBg3dLengthField — 정확한 길이 입력", () => {
  function Harness({
    onSubmit,
    error = null,
    initial = "",
  }: {
    readonly onSubmit?: Parameters<typeof StudioBg3dLengthField>[0]["onSubmit"];
    readonly error?: string | null;
    readonly initial?: string;
  }) {
    return (
      <HarnessState onSubmit={onSubmit} error={error} initial={initial} />
    );
  }
  function HarnessState({
    onSubmit,
    error,
    initial,
  }: {
    readonly onSubmit: Parameters<typeof StudioBg3dLengthField>[0]["onSubmit"];
    readonly error: string | null;
    readonly initial: string;
  }) {
    const [text, setText] = useState(initial);
    return (
      <StudioBg3dLengthField
        label="이동 거리"
        id="len"
        text={text}
        onTextChange={setText}
        hint="예: 2.4m, 80cm"
        error={error}
        {...(onSubmit ? { onSubmit } : {})}
        parseOptions={{ allowNegative: true }}
      />
    );
  }

  it("라벨과 입력창이 연결되고 힌트가 설명으로 묶인다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("이동 거리");
    expect(input.getAttribute("aria-describedby")).toContain("len-hint");
    expect(screen.getByText("예: 2.4m, 80cm")).toBeTruthy();
  });

  it("올바른 입력은 환산 미리보기를 보여 주고 Enter로 정확한 미터 값을 전달한다", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("이동 거리");
    fireEvent.change(input, { target: { value: "80cm" } });
    expect(screen.getByTestId("bg3d-length-preview").textContent).toBe("= 0.8 m");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const parsed = onSubmit.mock.calls[0]?.[0];
    expect(parsed.ok).toBe(true);
    expect(parsed.meters).toBeCloseTo(0.8, 12);
  });

  it.each([
    ["2.4m", 2.4],
    ["1200mm", 1.2],
    [`3'6"`, 1.0668],
  ])("%s 도 같은 파서로 해석한다", (text, meters) => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("이동 거리");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit.mock.calls[0]?.[0].meters).toBeCloseTo(meters, 9);
  });

  it("입력 중에는 경고하지 않고, 확정하거나 벗어나면 이유를 role=alert로 알린다", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("이동 거리");
    fireEvent.change(input, { target: { value: "2.4x" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent?.length).toBeGreaterThan(5);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("len-error");
    expect(onSubmit.mock.calls[0]?.[0].ok).toBe(false);
    // 다시 고치면 오류가 사라진다.
    fireEvent.change(input, { target: { value: "2.4m" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("호출자가 준 오류가 형식 오류보다 먼저 보인다", () => {
    render(<Harness error="방향을 정할 수 없습니다." />);
    expect(screen.getByRole("alert").textContent).toBe("방향을 정할 수 없습니다.");
  });

  it("IME 조합 중 Enter는 확정으로 보지 않는다", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} initial="2m" />);
    const input = screen.getByLabelText("이동 거리");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("StudioBg3dInferenceKeyboardPicker — 포인터 없이 점 고르기", () => {
  function setup(entities: StudioBg3dInferenceSceneEntity[] = [box("A", [0, 0.5, 0]), box("B", [6, 0.5, 0])]) {
    const service = createService();
    service.syncScene({ entities });
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const onPick = vi.fn();
    render(<StudioBg3dInferenceKeyboardPicker service={service} unit="m" onPick={onPick} limit={6} />);
    return { service, onPick };
  }

  it("펼치면 가까운 순서로 옵션이 나오고 첫 옵션이 선택된다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    const listbox = screen.getByRole("listbox", { name: "가까운 스냅 점 목록" });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(6);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    expect(options[0]?.textContent).toContain("상자 A");
  });

  it("↓/↑/Home/End 로 이동하고 Enter로 고르면 onPick이 정확한 점으로 호출된다", () => {
    const { service, onPick } = setup();
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe(within(listbox).getAllByRole("option")[1]?.id);
    fireEvent.keyDown(listbox, { key: "End" });
    expect(within(listbox).getAllByRole("option")[5]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(within(listbox).getAllByRole("option")[5]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    const expected = service.listPickCandidates(6)[0];
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toEqual(expected?.point);
    expect(onPick.mock.calls[0]?.[1].sourceIds).toEqual([expected?.sourceId]);
  });

  it("옵션을 클릭해도 같은 결과를 낸다", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    const third = within(screen.getByRole("listbox")).getAllByRole("option")[2];
    expect(third).toBeDefined();
    if (third) fireEvent.click(third);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("목록은 방향키를 스스로 소유한다 (축 잠금 키가 가로채지 않는다)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    expect(screen.getByRole("listbox").getAttribute("data-bg3d-arrow-owner")).toBe("true");
  });

  it("장면이 비어 있으면 안내 문구를 보여 준다", () => {
    setup([]);
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    expect(screen.getByRole("status").textContent).toContain("고를 수 있는 점이 없습니다");
  });

  it("다시 누르면 접힌다", () => {
    setup();
    const toggle = screen.getByRole("button", { name: /키보드로 점 고르기/u });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("StudioBg3dInferenceHud — 잠금·입력·안내", () => {
  function setup(options: { readonly attachKeys?: boolean } = {}) {
    const service = createService();
    service.syncScene({ entities: [box("A", [0, 0.5, 0])] });
    const applied: StudioBg3dInferenceApplyLengthRequest[] = [];
    const cancel = vi.fn();
    const onPickPoint = vi.fn();
    const view = render(<StudioBg3dInferenceHud service={service} onPickPoint={onPickPoint} />);
    const detach = options.attachKeys ? attachKeys(service) : () => undefined;
    return {
      service,
      applied,
      cancel,
      onPickPoint,
      view,
      detach,
      begin(referencePoint: Vec | null = [3, 0, 0]) {
        act(() => {
          service.begin("measure", {
            referencePoint,
            handlers: { applyLength: (request) => applied.push(request), cancel },
          });
        });
      },
    };
  }

  it("세션이 없어도 live region은 마운트되어 있고 HUD 본문은 없다", () => {
    setup();
    expect(screen.getByTestId("bg3d-inference-live").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByTestId("bg3d-inference-live-alert").getAttribute("aria-live")).toBe("assertive");
    expect(screen.queryByTestId("bg3d-inference-hud")).toBeNull();
  });

  it("세션을 시작하면 도구 이름이 붙은 그룹과 잠금 없음 배지가 나타난다", () => {
    const { begin } = setup();
    begin();
    const hud = screen.getByRole("group", { name: "줄자 · 추론과 길이 입력" });
    expect(hud).toBeTruthy();
    expect(within(screen.getByTestId("bg3d-inference-lock-badges")).getByText("잠금 없음")).toBeTruthy();
    expect(screen.getByText("추론 대기")).toBeTruthy();
  });

  it("축 잠금 버튼은 aria-pressed/aria-keyshortcuts 를 가지고 키와 같은 잠금을 건다", () => {
    const { begin, service } = setup();
    begin();
    const x = screen.getByRole("button", { name: "X축 잠금 (X축 · 좌우 · 빨강)" });
    const z = screen.getByRole("button", { name: "Z축 잠금 (Z축 · 앞뒤 · 파랑)" });
    const y = screen.getByRole("button", { name: "Y축 잠금 (Y축 · 상하(높이) · 초록)" });
    expect(x.getAttribute("aria-keyshortcuts")).toBe("ArrowRight");
    expect(z.getAttribute("aria-keyshortcuts")).toBe("ArrowLeft");
    expect(y.getAttribute("aria-keyshortcuts")).toBe("ArrowUp");
    expect(screen.getByRole("button", { name: /평행 또는 수직 잠금/u }).getAttribute("aria-keyshortcuts")).toBe(
      "ArrowDown",
    );
    expect(x.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(x);
    expect(x.getAttribute("aria-pressed")).toBe("true");
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    // 다른 축을 누르면 교체되고, 같은 축을 다시 누르면 해제된다.
    fireEvent.click(y);
    expect(x.getAttribute("aria-pressed")).toBe("false");
    expect(y.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(y);
    expect(y.getAttribute("aria-pressed")).toBe("false");
  });

  it("잠금 배지는 축 이름·의미·색 이름을 문자로 보여 주고 live region이 읽어 준다", () => {
    const { begin } = setup();
    begin();
    fireEvent.click(screen.getByRole("button", { name: /^Y축 잠금/u }));
    const badge = screen.getByTestId("bg3d-inference-badge-lock-axis");
    expect(badge.textContent).toContain("잠금 · Y축 · 상하(높이) · 초록");
    expect(screen.getByTestId("bg3d-inference-live").textContent).toContain("Y축 잠금");
  });

  it("추론 결과가 오면 마커·종류 이름·출처·길이를 보여 준다", () => {
    const { begin, service } = setup();
    begin([3, 0, 0]);
    act(() => {
      service.resolve({ cursor: pointCursor([0.52, 1, 0.5]) });
    });
    const current = screen.getByTestId("bg3d-inference-current");
    expect(within(current).getByRole("img", { name: "끝점" })).toBeTruthy();
    expect(current.textContent).toContain("상자 A");
    expect(screen.getByTestId("bg3d-inference-length").textContent).toMatch(/m$/u);
    expect(screen.getByTestId("bg3d-inference-live").textContent).toContain("끝점");
  });

  it("길이 입력창에 2.4m를 쓰고 적용하면 기준점에서 정확히 그만큼 간다", () => {
    const { begin, applied } = setup();
    begin([1, 0, 1]);
    fireEvent.click(screen.getByRole("button", { name: /^X축 잠금/u }));
    const input = screen.getByLabelText("길이 직접 입력") as HTMLInputElement;
    expect(input.getAttribute("data-bg3d-inference-vcb")).toBe("true");
    fireEvent.change(input, { target: { value: "2.4m" } });
    expect(input.value).toBe("2.4m");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.endPoint[0]).toBeCloseTo(3.4, 12);
    expect(applied[0]?.endPoint[2]).toBe(1);
    expect((screen.getByLabelText("길이 직접 입력") as HTMLInputElement).value).toBe("");
  });

  it("적용 버튼도 같은 일을 한다 (Enter 없이 포인터·터치로)", () => {
    const { begin, applied } = setup();
    begin([0, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: /^Z축 잠금/u }));
    fireEvent.change(screen.getByLabelText("길이 직접 입력"), { target: { value: "80cm" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(applied[0]?.endPoint[2]).toBeCloseTo(0.8, 12);
  });

  it("잘못된 입력은 입력값을 보존하고 role=alert 오류와 assertive 안내를 낸다", () => {
    const { begin, applied } = setup();
    begin([0, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: /^X축 잠금/u }));
    const input = screen.getByLabelText("길이 직접 입력") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "열두자" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(applied).toHaveLength(0);
    expect(input.value).toBe("열두자");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByRole("alert").some((node) => (node.textContent ?? "").length > 3)).toBe(true);
    expect(screen.getByTestId("bg3d-inference-live-alert").textContent).toContain("입력 오류");
    expect(screen.getByTestId("bg3d-inference-live").textContent).toBe("");
  });

  it("방향을 정할 수 없을 때(잠금·커서 결과 없음) 이유를 알린다", () => {
    const { begin } = setup();
    begin([0, 0, 0]);
    const input = screen.getByLabelText("길이 직접 입력");
    fireEvent.change(input, { target: { value: "1m" } });
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain("방향");
  });

  it("Shift로 유지한 추론은 배지에 나타나고 떼면 사라진다", () => {
    const { begin, service } = setup({ attachKeys: true });
    begin([3, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: /^X축 잠금/u }));
    act(() => {
      service.resolve({ cursor: pointCursor([6, 0, 0.02]) });
    });
    fireEvent.keyDown(document.body, { key: "Shift", shiftKey: true });
    expect(screen.getByTestId("bg3d-inference-badge-hold").textContent).toContain("Shift 유지");
    fireEvent.keyUp(document.body, { key: "Shift" });
    expect(screen.queryByTestId("bg3d-inference-badge-hold")).toBeNull();
  });
});

describe("키보드만으로 같은 결과에 도달하는 흐름", () => {
  function setup() {
    const service = createService();
    service.syncScene({ entities: [box("A", [0, 0.5, 0])] });
    const applied: StudioBg3dInferenceApplyLengthRequest[] = [];
    const cancel = vi.fn();
    render(
      <StudioBg3dInferenceHud
        service={service}
        onPickPoint={(point) => {
          service.setReference(point);
        }}
      />,
    );
    const detach = attachKeys(service);
    act(() => {
      service.begin("measure", {
        handlers: { applyLength: (request) => applied.push(request), cancel },
      });
    });
    return { service, applied, cancel, detach };
  }

  it("점 고르기 → 방향키 잠금 → 숫자 입력 → Enter 가 마우스 측정과 같은 끝점을 만든다", () => {
    const { service, applied, detach } = setup();
    // 1) 키보드로 시작점을 고른다.
    fireEvent.click(screen.getByRole("button", { name: /키보드로 점 고르기/u }));
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "Enter" });
    const reference = service.getSnapshot().session.referencePoint;
    expect(reference).not.toBeNull();
    // 2) → 키로 X축을 잠근다 (포커스는 문서 본문).
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
    // 3) 숫자 키로 입력을 시작하면 입력창이 포커스를 받는다.
    fireEvent.keyDown(document.body, { key: "1" });
    const input = screen.getByLabelText("길이 직접 입력") as HTMLInputElement;
    expect(input.value).toBe("1");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "1.5m" } });
    // 4) Enter로 적용한다.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.reference).toEqual(reference);
    expect(applied[0]?.endPoint[0]).toBeCloseTo((reference?.[0] ?? 0) + 1.5, 12);
    expect(applied[0]?.endPoint[1]).toBeCloseTo(reference?.[1] ?? 0, 12);
    detach();
  });

  it("Esc는 입력을 지우고, 한 번 더 누르면 도구 취소 핸들러를 부른다", () => {
    const { service, cancel, detach } = setup();
    act(() => service.setReference([0, 0, 0]));
    act(() => service.setVcbText("2"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(service.getVcbText()).toBe("");
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(cancel).toHaveBeenCalledTimes(1);
    detach();
  });

  it("입력창 안에서 글자가 있을 때 ←/→ 는 커서 이동에 맡기고 ↑/↓ 는 잠금 키로 쓴다", () => {
    const { service, detach } = setup();
    act(() => service.setReference([0, 0, 0]));
    act(() => service.setVcbText("2.4"));
    const input = screen.getByLabelText("길이 직접 입력");
    const right = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    input.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(false);
    expect(service.getSnapshot().session.lock).toEqual({ kind: "none" });
    const up = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    input.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "y" });
    detach();
  });

  it("다른 입력창에서 쓰는 숫자는 길이 입력으로 가로채지 않는다", () => {
    const { service, detach } = setup();
    const other = document.createElement("input");
    other.type = "text";
    document.body.append(other);
    other.focus();
    const event = new KeyboardEvent("keydown", { key: "5", bubbles: true, cancelable: true });
    other.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(service.getVcbText()).toBe("");
    other.remove();
    detach();
  });
});
