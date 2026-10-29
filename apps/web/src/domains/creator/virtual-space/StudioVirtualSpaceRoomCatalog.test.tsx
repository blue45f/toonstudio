// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_OFFICE_ENVIRONMENTS, studioOfficeEnvironment } from "./studio-virtual-space-office-environments";
import { StudioVirtualSpaceRoomCatalog } from "./StudioVirtualSpaceRoomCatalog";
import { STUDIO_SPACE_MODULES } from "./studio-virtual-space-room-catalog";

afterEach(() => cleanup());

function mount(projectAvailable: boolean) {
  const onPanel = vi.fn();
  const onZone = vi.fn();
  const onTemplate = vi.fn();
  render(<MemoryRouter><StudioVirtualSpaceRoomCatalog
    projectAvailable={projectAvailable}
    onPanel={onPanel}
    onZone={onZone}
    onTemplate={onTemplate}
  /></MemoryRouter>);
  return { onPanel, onZone, onTemplate };
}

describe("StudioVirtualSpaceRoomCatalog", () => {
  it("opens project P2P modules through the existing panel contract", () => {
    const { onPanel } = mount(true);
    fireEvent.click(screen.getByRole("button", { name: /P2P 화이트보드/u }));
    expect(onPanel).toHaveBeenCalledWith("board");
  });
  it("does not advertise project-only rooms in a personal space", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: /빠른 P2P 허들/u })).toBeNull();
    expect(screen.queryByText(/프로젝트 공간에서 사용할 수 있어요/u)).toBeNull();
  });

  it("links interview waiting to the existing hiring room authority", () => {
    mount(false);
    const link = screen.getByRole("link", { name: /면접·협업 대기실/u });
    expect(link.getAttribute("href")).toBe("/team/recruiting?panel=rooms");
  });

  it("walks to the authored lounge rather than changing presence authority", () => {
    const { onZone } = mount(false);
    fireEvent.click(screen.getByRole("button", { name: /조용한 휴게 라운지/u }));
    expect(onZone).toHaveBeenCalledWith("lounge");
  });

  it("creates theme spaces through the template contract", () => {
    const { onTemplate } = mount(true);
    fireEvent.click(screen.getByRole("button", { name: "템플릿" }));
    fireEvent.click(screen.getByRole("button", { name: /콘티룸 만들기/u }));
    expect(onTemplate).toHaveBeenCalledWith("storyboard-room");
    fireEvent.click(screen.getByRole("button", { name: /녹음부스 만들기/u }));
    expect(onTemplate).toHaveBeenCalledWith("recording-booth");
    fireEvent.click(screen.getByRole("button", { name: /전시관 만들기/u }));
    expect(onTemplate).toHaveBeenCalledWith("gallery");
  });

  it("does not advertise template creation in a personal space", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: /콘티룸 만들기/u })).toBeNull();
  });

  it("각 공간 모듈에 실제 환경 미리보기와 진행자 이미지를 표시한다", () => {
    const publicDir = existsSync(resolve(process.cwd(), "public"))
      ? resolve(process.cwd(), "public")
      : resolve(process.cwd(), "apps/web/public");

    mount(true);
    for (const module of STUDIO_SPACE_MODULES) {
      const roomImg = screen.getByTestId(`space-module-room-preview-${module.id}`);
      const hostImg = screen.getByTestId(`space-module-host-sprite-${module.id}`);
      const roomSrc = roomImg.getAttribute("src") ?? "";
      const hostSrc = hostImg.getAttribute("src") ?? "";
      const environment = studioOfficeEnvironment(module.id);
      if (environment) expect(roomSrc).toBe(environment.previewUrl);
      else expect(roomSrc).toContain("/assets/virtual-studio/studio-art-");
      expect(hostSrc).toContain("/assets/virtual-studio/studio-art-");
      expect(existsSync(resolve(publicDir, `.${roomSrc}`))).toBe(true);
      expect(existsSync(resolve(publicDir, `.${hostSrc}`))).toBe(true);
    }
  });
  it("세 새 사무실 카드를 기존 장소 이동 계약으로 연다", () => {
    const { onZone } = mount(false);
    for (const environment of STUDIO_OFFICE_ENVIRONMENTS) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(environment.labelKo) }));
      expect(onZone).toHaveBeenLastCalledWith(environment.key);
    }
  });

});
