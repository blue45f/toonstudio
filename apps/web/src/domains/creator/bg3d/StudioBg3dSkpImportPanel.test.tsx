// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBg3dSkpImportPanel } from "./StudioBg3dSkpImportPanel";
import { createStudioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { assessStudioBg3dSkpSize } from "./studio-bg3d-skp-unit";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

import type { StudioBg3dSkpUnitDecision } from "./studio-bg3d-skp-import";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";

// <details>(안내)도 group 역할이라 이름 없이 찾으면 둘이 섞인다. 질문 카드는 항상 제목으로 찾는다.
const QUESTION_TITLE = "모델 크기를 확인해 주세요";

afterEach(() => {
  cleanup();
});

function tinyReport(): StudioBg3dSkpImportReport {
  return createSkpReportFixture({
    size: {
      openSkpMeters: [0.00508, 0, 0.00508],
      meters: [0.00508, 0, 0.00508],
      maxExtentMeters: 0.00508,
      level: "too-small",
      recommendedUnit: "m",
    },
  });
}

function openQuestion(session: ReturnType<typeof createStudioBg3dSkpImportSession>, signal?: AbortSignal) {
  const report = tinyReport();
  return session.requestUnit(
    { sourceName: "tiny.skp", report, assessment: assessStudioBg3dSkpSize([0.00508, 0, 0.00508], null) },
    signal,
  );
}

describe("StudioBg3dSkpImportPanel", () => {
  it("shows only the guide while idle, with the support limits and the unofficial-parser notice", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    const guide = screen.getByText("SketchUp(.skp) 가져오기 안내").closest("details");
    expect(guide).not.toBeNull();
    expect(within(guide as HTMLElement).getByText(/데스크톱 32MiB·모바일 16MiB/u)).toBeTruthy();
    expect(within(guide as HTMLElement).getByText(/Trimble과 관련 없는 비공식/u)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("group", { name: QUESTION_TITLE })).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("tells the store a screen is present while mounted, and that it left when unmounted", () => {
    const session = createStudioBg3dSkpImportSession();
    expect(session.hasHost()).toBe(false);
    const view = render(<StudioBg3dSkpImportPanel session={session} />);
    expect(session.hasHost()).toBe(true);
    view.unmount();
    expect(session.hasHost()).toBe(false);
  });

  it("announces the conversion stage in a polite status region", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.setActivity({
        sourceName: "room.skp",
        progress: { stage: "building-scene", fraction: null, execution: "worker" },
      });
    });
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("room.skp");
    expect(status.textContent).toContain("4/6 · 모델 구조 만들기 · 별도 Worker");
    act(() => session.setActivity(null));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks for the unit with every candidate and its resulting size, recommends one, and moves focus to the question", async () => {
    const session = createStudioBg3dSkpImportSession();
    const view = render(<StudioBg3dSkpImportPanel session={session} />);
    let pending: Promise<StudioBg3dSkpUnitDecision> | undefined;
    act(() => {
      pending = openQuestion(session);
    });

    const group = screen.getByRole("group", { name: QUESTION_TITLE });
    expect(document.activeElement).toBe(within(group).getByRole("heading", { name: QUESTION_TITLE }));
    expect(group.textContent).toContain("tiny.skp");
    expect(group.textContent).toContain("수 mm 수준으로 매우 작음");
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("미터(m)로 해석 → 너비 20cm × 높이 0m × 깊이 20cm"),
      expect.stringContaining("센티미터(cm)로 해석"),
      expect.stringContaining("밀리미터(mm)로 해석"),
      expect.stringContaining("인치(in) · 지금 크기 그대로 → 너비 5.1mm"),
      "가져오기 취소",
    ]);
    expect(buttons[0].textContent).toContain("추천");
    expect(buttons[2].textContent).toContain("비현실적 크기");

    fireEvent.click(buttons[0]);
    await expect(pending).resolves.toEqual({ kind: "unit", unit: "m" });
    expect(screen.queryByRole("group", { name: QUESTION_TITLE })).toBeNull();
    // 질문이 닫힌 뒤에도 키보드 초점이 이 영역에 남는다.
    expect(document.activeElement).toBe(view.container.firstElementChild);
  });

  it("lets the user cancel the question with the button or the Escape key", async () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);

    let first: Promise<StudioBg3dSkpUnitDecision> | undefined;
    act(() => {
      first = openQuestion(session);
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 취소" }));
    await expect(first).resolves.toEqual({ kind: "cancel" });

    let second: Promise<StudioBg3dSkpUnitDecision> | undefined;
    act(() => {
      second = openQuestion(session);
    });
    fireEvent.keyDown(screen.getByRole("group", { name: QUESTION_TITLE }), { key: "Escape" });
    await expect(second).resolves.toEqual({ kind: "cancel" });
  });

  it("cancels on Escape pressed anywhere inside the question, keeps other keys, and hides Escape from outer handlers", async () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    const seenOutside: string[] = [];
    const outside = (event: KeyboardEvent): void => {
      seenOutside.push(event.key);
    };
    document.addEventListener("keydown", outside);
    try {
      let pending: Promise<StudioBg3dSkpUnitDecision> | undefined;
      act(() => {
        pending = openQuestion(session);
      });
      const group = screen.getByRole("group", { name: QUESTION_TITLE });
      const firstButton = within(group).getAllByRole("button")[0];

      fireEvent.keyDown(firstButton, { key: "Enter" });
      expect(screen.queryByRole("group", { name: QUESTION_TITLE })).not.toBeNull();

      fireEvent.keyDown(firstButton, { key: "Escape" });
      await expect(pending).resolves.toEqual({ kind: "cancel" });
      expect(screen.queryByRole("group", { name: QUESTION_TITLE })).toBeNull();
      // Escape 는 질문 안에서 처리가 끝나 편집기 전역 핸들러로 번지지 않는다. 다른 키는 그대로 지나간다.
      expect(seenOutside).toEqual(["Enter"]);
    } finally {
      document.removeEventListener("keydown", outside);
    }
  });

  it("does not show the activity line underneath an open question", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.setActivity({
        sourceName: "tiny.skp",
        progress: { stage: "writing-glb", fraction: null, execution: "worker" },
      });
      void openQuestion(session);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("group", { name: QUESTION_TITLE })).toBeTruthy();
  });

  it("shows an imported model's unit, size, counts and warnings, and the details on request", () => {
    const session = createStudioBg3dSkpImportSession();
    const report = createSkpReportFixture({
      units: { appliedUnit: "m", scaleFactor: 1 / 0.0254, userSelected: true },
      warnings: [
        { code: "flipped-faces", severity: "warning", count: 4, detail: null },
        { code: "main-thread-fallback", severity: "info", count: null, detail: null },
      ],
    });
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([{ sourceName: "room.skp", report, status: "imported", reason: null, metadata: "saved" }]);
    });

    const card = screen.getByRole("article", { name: "room.skp" });
    expect(card.textContent).toContain("가져옴");
    expect(card.textContent).toContain("미터(m)로 해석 · 크기 ×39.3701 보정(직접 선택)");
    expect(card.textContent).toContain("너비 2.54m × 높이 1.27m × 깊이 2.54m");
    expect(card.textContent).toContain("삼각형 80");
    const warnings = within(card).getByRole("list", { name: "변환 경고" });
    expect(within(warnings).getAllByRole("listitem")).toHaveLength(2);
    expect(warnings.textContent).toContain("면 방향이 어긋난 경계가 4곳");
    expect(card.textContent).toContain("컴포넌트 1개: Chair");
    expect(card.textContent).toContain("태그 2개: Layer0, Furniture");
    expect(card.textContent).toContain("변환 보고서를 자산 정보에 저장했습니다.");
  });

  it("says plainly that a converted model was not imported, and why", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([{
        sourceName: "big.skp",
        report: createSkpReportFixture(),
        status: "not-imported",
        reason: "삼각형 예산을 넘었습니다.",
        metadata: "skipped",
      }]);
    });
    const card = screen.getByRole("article", { name: "big.skp" });
    expect(card.textContent).toContain("가져오지 못함 · 삼각형 예산을 넘었습니다.");
    expect(card.textContent).not.toContain("자산 정보에 저장했습니다");
  });

  it("reports a failed metadata write instead of hiding it", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([{ sourceName: "room.skp", report: createSkpReportFixture(), status: "imported", reason: null, metadata: "failed" }]);
    });
    expect(screen.getByRole("article", { name: "room.skp" }).textContent).toContain("저장하지 못했습니다");
  });

  it("closes one result or all of them", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([
        { sourceName: "a.skp", report: createSkpReportFixture(), status: "imported", reason: null, metadata: "saved" },
        { sourceName: "b.skp", report: createSkpReportFixture(), status: "imported", reason: null, metadata: "saved" },
      ]);
    });
    expect(screen.getAllByRole("article")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "a.skp 변환 결과 닫기" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "변환 결과 모두 지우기" })).toBeNull();

    act(() => {
      session.publishResults([{ sourceName: "c.skp", report: createSkpReportFixture(), status: "imported", reason: null, metadata: "saved" }]);
    });
    fireEvent.click(screen.getByRole("button", { name: "변환 결과 모두 지우기" }));
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("renders file-supplied names as text, never as markup", () => {
    const session = createStudioBg3dSkpImportSession();
    const report = createSkpReportFixture({
      names: {
        components: { available: true, items: ["<img src=x onerror=alert(1)>"], total: 1, truncated: false },
        tags: { available: true, items: [], total: 0, truncated: false },
        scenes: { available: false, items: [], total: 0, truncated: false },
      },
    });
    const { container } = render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([{ sourceName: "<b>evil</b>.skp", report, status: "imported", reason: null, metadata: "saved" }]);
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByRole("article", { name: "<b>evil</b>.skp" })).toBeTruthy();
  });
});
