// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeveloperPlatformPage } from "./DeveloperPlatformPage";

const mocks = vi.hoisted(() => ({
  lang: "ko",
  developerManifest: vi.fn(),
}));

vi.mock("./integration-platform-client", () => ({
  integrationPlatformClient: mocks,
}));

vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (_reason: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // 상태 문구 사전 모듈이 import 시점에 등록 함수를, 렌더 중에는 번역 해석 함수를 쓴다 — 번역기만 바꾸고 나머지는 실제 모듈을 쓴다.
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: mocks.lang }),
  // 공용 LoadingState가 useT를 쓴다 — 라벨을 명시 전달하므로 키 반환 스텁으로 충분하다.
  // app.name만 실제 브랜드명으로 돌려줘 문서 제목 정규화를 검증할 수 있게 한다.
  useT: () => (key: string) => (key === "app.name" ? "툰스튜디오" : key),
}));

const manifestFixture = {
  schema: "toonstudio.developer/v1",
  providers: 3,
  scopes: ["catalog:read"],
  events: ["project.updated"],
  actions: ["catalog.list"],
  webhook: { version: "2026-10", signature: "hmac-sha256" },
  safety: { rawFilesRequireStrongGrant: true },
};

describe("DeveloperPlatformPage", () => {
  beforeEach(() => {
    mocks.lang = "ko";
    mocks.developerManifest.mockReset();
  });

  it("불러오기에 실패하면 재시도 버튼이 있는 오류를 보여주고, 재시도로 복구한다", async () => {
    mocks.developerManifest
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    const retryButton = await screen.findByRole("button", { name: "다시 확인" });
    expect(screen.getByRole("alert").textContent).toContain("개발자 계약을 불러오지 못했습니다.");

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("toonstudio.developer/v1")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.developerManifest).toHaveBeenCalledTimes(2);
  });

  it("계약 불러오기가 실패해도 시작 안내와 첫 요청은 먼저 읽힌다", async () => {
    mocks.developerManifest.mockRejectedValueOnce(new Error("network"));

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "시작하기" })).toBeTruthy();
    expect(screen.getByText("GET /api/integrations/developer-manifest")).toBeTruthy();
    expect(screen.getByRole("link", { name: "기술 참고 자료" }).getAttribute("href")).toBe("/about/technology/references");
    expect(screen.getByRole("link", { name: "API 키 화면" }).getAttribute("href")).toBe("/settings/api-keys");
    await screen.findByRole("button", { name: "다시 확인" });
  });

  it("페이지 고유 문서 제목을 설정한다", async () => {
    mocks.developerManifest.mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.title).toBe("개발자 플랫폼 · 툰스튜디오");
    });
  });

  it("웹훅 계약을 헤더가 있는 코드 카드로 보여준다", async () => {
    mocks.developerManifest.mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("웹훅 계약 JSON")).toBeTruthy();
    expect(screen.getByText(/"signature": "hmac-sha256"/)).toBeTruthy();
  });

  it("REA 서명 웹훅·플러그인 샌드박스 워크벤치를 렌더링하고 양방향 상태를 전환한다", async () => {
    mocks.developerManifest.mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("developer-platform-rea-webhook-bar");
    expect(bar.textContent).toContain("Figma Plugin API · Blender Python · GitHub Webhooks · Stripe Events");

    const evPublished = screen.getByTestId("dev-platform-rea-event-episode-published-hmac");
    const evAsset = screen.getByTestId("dev-platform-rea-event-asset-bundle-verified");
    const evCrdt = screen.getByTestId("dev-platform-rea-event-crdt-snapshot-sealed");

    expect(evPublished.getAttribute("aria-pressed")).toBe("true");
    expect(evAsset.getAttribute("aria-pressed")).toBe("false");
    expect(evCrdt.getAttribute("aria-pressed")).toBe("false");

    const scopeAst = screen.getByTestId("dev-platform-rea-scope-readonly-canvas-ast");
    const scopeWorker = screen.getByTestId("dev-platform-rea-scope-layer-filter-worker");
    const scopeExport = screen.getByTestId("dev-platform-rea-scope-signed-export-webhook");

    expect(scopeAst.getAttribute("aria-pressed")).toBe("true");
    expect(scopeWorker.getAttribute("aria-pressed")).toBe("false");
    expect(scopeExport.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("developer-platform-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("회차 발행 HMAC 서명 웹훅");
    expect(status.textContent).toContain("읽기 전용 캔버스 AST");

    fireEvent.click(evAsset);
    expect(evAsset.getAttribute("aria-pressed")).toBe("true");
    expect(evPublished.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("에셋 번들 무결성 검증");

    fireEvent.click(scopeWorker);
    expect(scopeWorker.getAttribute("aria-pressed")).toBe("true");
    expect(scopeAst.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("레이어 필터 WebWorker");

    fireEvent.click(evCrdt);
    fireEvent.click(scopeExport);
    expect(evCrdt.getAttribute("aria-pressed")).toBe("true");
    expect(scopeExport.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("CRDT 캔버스 스냅샷 봉인");
    expect(status.textContent).toContain("서명된 내보내기 웹훅");
    await screen.findByText("웹훅 계약 JSON");
  });

  it("영어 로케일(en)에서 REA 워크벤치에 한글이 섞이지 않는다", async () => {
    mocks.lang = "en";
    mocks.developerManifest.mockResolvedValueOnce(manifestFixture);

    render(
      <MemoryRouter>
        <DeveloperPlatformPage />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("developer-platform-rea-webhook-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("dev-platform-rea-event-crdt-snapshot-sealed"));
    fireEvent.click(screen.getByTestId("dev-platform-rea-scope-signed-export-webhook"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("developer-platform-rea-status").textContent).toContain("CRDT Snapshot Sealed");
    expect(screen.getByTestId("developer-platform-rea-status").textContent).toContain("Signed Export Webhook");
    await screen.findByText("Webhook contract JSON");
  });
});
