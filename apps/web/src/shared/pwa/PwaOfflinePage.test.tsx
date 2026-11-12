// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceTaskRoute } from "@/shared/components/workspace/workspace-task-route";

import { PwaOfflinePage } from "./PwaOfflinePage";

const locale = vi.hoisted(() => ({ language: "ko" }));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown, en: unknown) => locale.language === "en" ? en : ko,
  useBilingualI18nRevision: () => undefined,
}));

vi.mock("./usePwaOfflineReadiness", () => ({
  usePwaOfflineReadiness: () => ({
    readiness: "partial" as const,
    cachedResources: 12,
    refresh: vi.fn(),
    prepare: vi.fn(),
  }),
}));

vi.mock("./pwa-install-showcase-schedule", () => ({
  openPwaInstallShowcase: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  locale.language = "ko";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PwaOfflinePage", () => {
  it("페이지 고유 문서 제목을 설정한다", async () => {
    render(<PwaOfflinePage />);

    await waitFor(() => {
      expect(document.title).toBe("오프라인 안내 · 툰스튜디오");
    });
  });

  it("오프라인 안내와 긴급 드로잉 보드 링크를 보여준다", () => {
    render(<PwaOfflinePage />);
    expect(screen.getByRole("heading", { name: "오프라인이에요" })).toBeTruthy();
    const drawLink = screen.getByRole("link", { name: "긴급 드로잉 보드 열기" });
    expect(drawLink.getAttribute("href")).toBe("/offline-draw/");
  });

  it("캐시된 리소스 수를 표시한다", () => {
    render(<PwaOfflinePage />);
    expect(screen.getByRole("status").textContent).toContain("12");
  });

  it("앱 설치 안내 링크를 보여준다", () => {
    render(<PwaOfflinePage />);
    expect(
      screen.getByRole("button", { name: /앱으로 설치하면 오프라인이 더 편해져요/ }),
    ).toBeTruthy();
  });

  it("오프라인 팩 준비가 동작하지 않으면 성공처럼 끝내지 않고 안내한다", async () => {
    render(<PwaOfflinePage />);
    fireEvent.click(screen.getByRole("button", { name: /오프라인 팩 준비/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("준비할 수 없어요");
  });

  it("기기에 저장된 콘텐츠가 없으면 확인 중과 구분되는 빈 상태를 보여준다", async () => {
    render(<PwaOfflinePage />);
    expect(
      await screen.findByText(/아직 기기에 저장된 콘텐츠가 없어요/),
    ).toBeTruthy();
  });

  it("기존 주요 행동 뒤에 중복 없는 음악 설정 자리를 제공한다", () => {
    render(<PwaOfflinePage />);

    // 이 경로에 작업 헤더가 함께 생기면 전역 OST가 서로 다른 dock 사이에서 이동할 수 있다.
    expect(workspaceTaskRoute("/offline")).toBeNull();
    const music = screen.getByRole("region", { name: "음악 설정" });
    const dock = document.getElementById("workspace-audio-dock");
    expect(document.querySelectorAll("#workspace-audio-dock")).toHaveLength(1);
    expect(dock && music.contains(dock)).toBe(true);
    const prepare = screen.getByRole("button", { name: "오프라인 팩 준비" });
    expect(prepare.compareDocumentPosition(music) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(["ko", "en"])("%s에서 기기 보관과 재연결 확인을 무손실·자동 업로드 보장과 구분한다", (language) => {
    locale.language = language;
    const { container } = render(<PwaOfflinePage />);

    expect(screen.getByText(language === "ko"
      ? "브라우저에 저장한 작업을 다시 열 수 있어요. 중요한 작업은 파일로도 백업해 주세요."
      : "Reopen work saved in this browser. Keep a file backup of important work.")).toBeTruthy();
    expect(screen.getByText(language === "ko"
      ? "연결이 돌아오면 저장 상태와 필요한 동기화를 확인해 주세요."
      : "When the connection returns, check the save status and any required sync.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/사라지지 않아요|자동으로 올라가요|never lost|uploads automatically/iu);
  });
});
