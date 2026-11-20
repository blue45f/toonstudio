// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioMenubarContent } from "../StudioMenubarContent";
import { createProps } from "../StudioMenubarContent.test-fixture";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("../StudioWorkspaceMenuGate", () => ({
  StudioWorkspaceMenuGate: () => <button type="button">작업공간 관리</button>,
}));

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(cleanup);

describe("원고 프로젝트 도구의 작업공간 관리 진입", () => {
  it.each([false, true])("몰입 모드 %s에서도 요청한 프로젝트 도구에 경량 관리 진입점 하나를 제공한다", (mobileImmersive) => {
    const { container } = render(<StudioMenubarContent {...createProps({ drawingToolsOnly: true, mobileImmersive })} />);

    expect(screen.getAllByRole("button", { name: "작업공간 관리" })).toHaveLength(1);
    expect(container.querySelector('[data-studio-menubar-primary="true"]')).toBeNull();
  });

  it.each([false, true])("그리기 전용 %s에서도 소유자 전환 중에는 이전 관리 상태와 동기화 안내를 노출하지 않는다", (drawingToolsOnly) => {
    const props = createProps({ drawingToolsOnly, workspaceSyncNotice: "이 기기 배치 저장 완료" });
    const { rerender } = render(<StudioMenubarContent {...props} />);
    expect(screen.getAllByRole("button", { name: "작업공간 관리" })).toHaveLength(1);
    expect(screen.getByText("이 기기 배치 저장 완료")).not.toBeNull();

    rerender(<StudioMenubarContent {...props} currentWorkspaceOwnerScope="next-owner" />);
    expect(screen.queryByRole("button", { name: "작업공간 관리" })).toBeNull();
    expect(screen.queryByText("이 기기 배치 저장 완료")).toBeNull();
    expect(screen.getByText("전환 중…")).not.toBeNull();
  });
});
