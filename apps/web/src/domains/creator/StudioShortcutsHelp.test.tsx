// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings, loadStudioAppSettings } from "./studio-app-settings";
import { StudioShortcutsHelp } from "./StudioShortcutsHelp";

import { useI18n } from "@/shared/lib/i18n";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown, _container: unknown) => children),
}));

vi.mock("react-dom", async () => ({
  ...(await vi.importActual<typeof import("react-dom")>("react-dom")),
  createPortal: createPortalMock,
}));

describe("StudioShortcutsHelp", () => {
  afterEach(() => {
    cleanup();
    createPortalMock.mockClear();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    globalThis.localStorage?.clear();
    useI18n.getState().setLang("ko");
  });

  it("드로잉 단축키와 모달 단축키 경계를 함께 안내한다", () => {
    const html = renderToStaticMarkup(<StudioShortcutsHelp open onClose={() => undefined} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-studio-shortcut-boundary="true"');
    expect(html).toContain("펜으로 전환");
    expect(html).toContain("펜·지우개 전환");
    expect(html).toContain("브러시 크기 ±5px");
    expect(html).toContain("불투명도 ±5%");
    expect(html).toContain("대화상자·검토 또는 협업 잠금");
  });

  it("픽셀 보정·선택 신규 단축키(N·⇧N·O·Q)를 안내한다", () => {
    const html = renderToStaticMarkup(<StudioShortcutsHelp open onClose={() => undefined} />);
    expect(html).toContain("혼합(스머지) · 혼색 브러시");
    expect(html).toContain("닷지/번/스펀지");
    expect(html).toContain("퀵 마스크 켬 · 선택 영역으로 완료");
  });

  it("접근 가능한 제목을 가진 고정 모달과 44px 이상 닫기 타깃을 유지한다", () => {
    const html = renderToStaticMarkup(<StudioShortcutsHelp open onClose={() => undefined} />);

    expect(html).toContain('class="fixed inset-0');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="studio-shortcuts-title"');
    expect(html).toContain('id="studio-shortcuts-title"');
    expect(html).toMatch(
      /<button[^>]*aria-label="닫기"[^>]*class="[^"]*\bsize-11\b[^"]*\bmin-h-11\b[^"]*\bmin-w-11\b[^"]*"/,
    );
    expect(html).not.toContain("sm:size-9");
  });

  it("브라우저 렌더에서는 도움말을 document.body 포털에 배치한다", () => {
    const body = { nodeName: "BODY" };
    vi.stubGlobal("document", { body });
    createPortalMock.mockClear();

    const html = renderToStaticMarkup(<StudioShortcutsHelp open onClose={() => undefined} />);

    expect(createPortalMock).toHaveBeenCalledOnce();
    expect(createPortalMock.mock.calls[0]?.[1]).toBe(body);
    expect(html).toContain('role="dialog"');
  });

  it("닫힌 상태에서는 아무것도 렌더하지 않는다", () => {
    expect(renderToStaticMarkup(<StudioShortcutsHelp open={false} onClose={() => undefined} />)).toBe("");
  });

  it("optional shortcuts prop이 있으면 리맵된 코드를 formatStudioShortcutChord로 표시한다", () => {
    const shortcuts = {
      ...defaultStudioAppSettings().shortcuts,
      "tool-pen": "K",
      "flip-canvas": "Mod+H",
      "swap-colors": "",
    };
    const html = renderToStaticMarkup(
      <StudioShortcutsHelp open onClose={() => undefined} shortcuts={shortcuts} />
    );
    expect(html).toContain("펜으로 전환");
    expect(html).toContain(">K<");
    expect(html).toContain("⌘·H");
    expect(html).toContain("없음");
    // Unrelated static rows stay as documented defaults.
    expect(html).toContain("1–6");
  });

  it("입문자 필수 단축키 Top 8 치트시트와 클립스튜디오·프로크리에이트·포토샵 이주 팁을 표시한다", () => {
    const html = renderToStaticMarkup(<StudioShortcutsHelp open onClose={() => undefined} />);
    expect(html).toContain("입문자 필수 단축키 Top 8 치트시트");
    for (const label of [
      "브러시",
      "지우개",
      "선택/이동",
      "대사/말풍선",
      "캔버스 이동",
      "스포이트",
      "브러시 크기",
      "입문/프로 화면 전환",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Ctrl+Shift+M");
    expect(html).toContain("클립스튜디오·프로크리에이트·포토샵 사용자 이주 팁");
    expect(html).toContain("QuickShape");
    expect(html).toContain("클리핑 마스크");
    expect(html).toContain("손떨림 보정");
    expect(html).toContain("⌘K");
  });

  it("경쟁사 호환 단축키 프리셋 1클릭 전환 필(min-h-11)이 상태를 저장하고 실시간 표시에 반영한다", () => {
    render(<StudioShortcutsHelp open onClose={() => undefined} />);

    const tipBox = document.querySelector('[data-studio-competitor-alias-tip="true"]');
    expect(tipBox).not.toBeNull();

    const defaultBtn = screen.getByRole("button", { name: "ToonStudio 기본" });
    const cspBtn = screen.getByRole("button", { name: "클립스튜디오 호환" });
    const psBtn = screen.getByRole("button", { name: "포토샵 호환" });
    const procreateBtn = screen.getByRole("button", { name: "프로크리에이트·웹 호환" });

    for (const btn of [defaultBtn, cspBtn, psBtn, procreateBtn]) {
      expect(btn.className).toContain("min-h-11");
      expect(tipBox?.contains(btn)).toBe(true);
    }

    expect(defaultBtn.getAttribute("aria-pressed")).toBe("true");
    expect(cspBtn.getAttribute("aria-pressed")).toBe("false");

    // 클립스튜디오 호환 전환 -> 펜 단축키 P 저장 및 즉시 반영
    fireEvent.click(cspBtn);
    expect(cspBtn.getAttribute("aria-pressed")).toBe("true");
    expect(defaultBtn.getAttribute("aria-pressed")).toBe("false");
    expect(globalThis.localStorage.getItem("toonstudio-studio-shortcut-preset:v1")).toBe("clip-studio");
    expect(loadStudioAppSettings(globalThis.localStorage).shortcuts["tool-pen"]).toBe("P");

    // 포토샵 호환 전환 -> 캔버스 좌우 반전 Shift+H 반영
    fireEvent.click(psBtn);
    expect(psBtn.getAttribute("aria-pressed")).toBe("true");
    expect(globalThis.localStorage.getItem("toonstudio-studio-shortcut-preset:v1")).toBe("photoshop");
    expect(loadStudioAppSettings(globalThis.localStorage).shortcuts["flip-canvas"]).toBe("Shift+H");

    // 프로크리에이트·웹 호환 전환 -> 퀵 HUD Space 반영
    fireEvent.click(procreateBtn);
    expect(procreateBtn.getAttribute("aria-pressed")).toBe("true");
    expect(globalThis.localStorage.getItem("toonstudio-studio-shortcut-preset:v1")).toBe("procreate-web");
    expect(loadStudioAppSettings(globalThis.localStorage).shortcuts["quick-hud"]).toBe("Space");

    // 검색 지우기·전체 보기 복구 버튼도 모두 44px(min-h-11) 이상을 유지한다
    const searchInput = screen.getByRole("searchbox", { name: "단축키와 조작 검색" });
    fireEvent.change(searchInput, { target: { value: "__no_match_query__" } });
    expect(screen.getByRole("button", { name: "검색어 지우기" }).className).toContain("size-11");
    expect(screen.getByRole("button", { name: "전체 단축키 보기" }).className).toContain("min-h-11");
  });

  it("영문 로케일에서 저장된 경쟁사 단축키 프리셋 상태를 복원하고 전환한다", () => {
    useI18n.getState().setLang("en");
    globalThis.localStorage.setItem("toonstudio-studio-shortcut-preset:v1", "clip-studio");

    render(<StudioShortcutsHelp open onClose={() => undefined} />);

    expect(screen.getByRole("button", { name: "ToonStudio Default" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Clip Studio Compatible" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Photoshop Compatible" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Procreate & Web Compatible" })).toBeTruthy();
  });
});
