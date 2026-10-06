// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceNavigation } from "./WorkspaceNavigation";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
});

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <WorkspaceNavigation />
    </MemoryRouter>,
  );
}

describe("WorkspaceNavigation 좌측 메뉴", () => {
  it("주 메뉴 다섯 목적지는 그대로 유지한다", () => {
    renderAt("/home");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/home",
      "/studio",
      "/discover",
      "/community",
      "/sitemap",
    ]);
  });

  it("제작 바로가기는 시안의 제작 하위 목적지를 별도 묶음으로 제공한다", () => {
    renderAt("/home");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    const links = within(shortcuts).getAllByRole("link");
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
      ["새 작품", "/studio/new"],
      ["캐릭터 만들기", "/studio/assets/characters/new"],
      ["배경 · 3D", "/studio/bg3d"],
      ["작품 재료", "/studio/assets"],
      ["가상 스튜디오", "/studio/space"],
      ["팀", "/team"],
    ]);
  });

  it("주 메뉴와 제작 바로가기 전원에 아트 타일 이미지를 붙인다", () => {
    renderAt("/home");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const primaryArt = within(nav).getAllByRole("link").map((link) =>
      link.querySelector("img")?.getAttribute("src"));
    expect(primaryArt).toEqual([
      "/brand/toonstudio-premium-icons/home.webp",
      "/brand/toonstudio-premium-icons/canvas.webp",
      "/brand/toonstudio-premium-icons/assets.webp",
      "/brand/toonstudio-premium-icons/community.webp",
      "/brand/toonstudio-premium-icons/settings.webp",
    ]);
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    const shortcutArt = within(shortcuts).getAllByRole("link").map((link) =>
      link.querySelector("img")?.getAttribute("src"));
    expect(shortcutArt).toEqual([
      "/brand/toonstudio-premium-icons/create.webp",
      "/brand/toonstudio-premium-icons/character.webp",
      "/brand/toonstudio-premium-icons/background.webp",
      "/brand/toonstudio-premium-icons/materials.webp",
      "/brand/toonstudio-premium-icons/space.webp",
      "/brand/toonstudio-premium-icons/team.webp",
    ]);
  });

  it("아트 로드에 실패하면 이미지만 물러나고 줄 아이콘이 남는다", () => {
    renderAt("/home");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    const link = within(shortcuts).getByRole("link", { name: "가상 스튜디오" });
    const art = link.querySelector("img");
    expect(art).not.toBeNull();
    fireEvent.error(art as HTMLImageElement);
    expect(link.querySelector("img")).toBeNull();
    // 타일이 물러나도 목적지 이름과 줄 아이콘(svg)은 그대로다.
    expect(link.textContent).toContain("가상 스튜디오");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("배경·3D 경로에서는 바로가기가 현재 위치이고 주 메뉴 제작은 물러난다", () => {
    renderAt("/studio/bg3d");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "배경 · 3D" }).getAttribute("aria-current")).toBe("page");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "제작" }).getAttribute("aria-current")).toBeNull();
  });

  it("캐릭터 경로는 작품 재료보다 구체적인 캐릭터 바로가기를 현재로 표시한다", () => {
    renderAt("/studio/assets/characters/new");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "캐릭터 만들기" }).getAttribute("aria-current")).toBe("page");
    expect(within(shortcuts).getByRole("link", { name: "작품 재료" }).getAttribute("aria-current")).toBeNull();
  });

  it("제작 홈에서는 주 메뉴 제작만 현재 위치다", () => {
    renderAt("/studio");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "제작" }).getAttribute("aria-current")).toBe("page");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    for (const link of within(shortcuts).getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });

  it("가상 스튜디오에서는 내 홈 대신 가상 스튜디오 바로가기가 현재 위치다", () => {
    renderAt("/studio/space");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "가상 스튜디오" }).getAttribute("aria-current")).toBe("page");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "내 홈" }).getAttribute("aria-current")).toBeNull();
  });

  it("팀 경로에서는 커뮤니티 대신 팀 바로가기가 현재 위치다", () => {
    renderAt("/team/people");
    const shortcuts = screen.getByRole("navigation", { name: "제작 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "팀" }).getAttribute("aria-current")).toBe("page");
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "커뮤니티" }).getAttribute("aria-current")).toBeNull();
  });
});
