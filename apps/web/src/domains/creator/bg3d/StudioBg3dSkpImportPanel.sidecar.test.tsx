// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBg3dSkpImportPanel } from "./StudioBg3dSkpImportPanel";
import { createStudioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

afterEach(() => {
  cleanup();
});

// 이름만 잇는다는 범위 안내는 가져오기 전(안내)과 가져온 뒤(보고서 자세히 보기) 같은 말로 보여야 한다.
const SCOPE_SENTENCE =
  "가져온 컴포넌트·태그·장면 이름은 배치한 모델에 이름으로만 연결돼요. 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라)은 되살리지 않고, 장면 이름은 메모 후보로만 보여 줘요.";

describe("StudioBg3dSkpImportPanel 의 SKP 이름 연결 범위 안내", () => {
  it("가져오기 안내에서 계층·표시 상태·카메라를 되살리지 않는다고 미리 알린다", () => {
    render(<StudioBg3dSkpImportPanel session={createStudioBg3dSkpImportSession()} />);
    const guide = screen.getByText("SketchUp(.skp) 가져오기 안내").closest("details");
    expect(guide).not.toBeNull();
    expect(within(guide as HTMLElement).getByText(SCOPE_SENTENCE)).toBeTruthy();
  });

  it("가져온 모델의 보고서 자세히 보기에도 같은 말로 알린다", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([
        { sourceName: "room.skp", report: createSkpReportFixture(), status: "imported", reason: null, metadata: "saved" },
      ]);
    });
    const card = screen.getByRole("article", { name: "room.skp" });
    expect(within(card).getByText(SCOPE_SENTENCE)).toBeTruthy();
  });

  it("가져오지 못한 결과에는 연결이 일어나지 않았으므로 범위 안내를 붙이지 않는다", () => {
    const session = createStudioBg3dSkpImportSession();
    render(<StudioBg3dSkpImportPanel session={session} />);
    act(() => {
      session.publishResults([
        {
          sourceName: "big.skp",
          report: createSkpReportFixture(),
          status: "not-imported",
          reason: "삼각형 예산을 넘었습니다.",
          metadata: "skipped",
        },
      ]);
    });
    const card = screen.getByRole("article", { name: "big.skp" });
    expect(within(card).queryByText(SCOPE_SENTENCE)).toBeNull();
  });
});
