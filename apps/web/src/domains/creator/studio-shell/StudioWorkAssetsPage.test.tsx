// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installStudioAssetLibraryPortForTest,
  type StudioAsset,
  type StudioAssetLibraryPort,
} from "../studio-asset-library";
import { STUDIO_PROJECT_LIBRARY_STORAGE_KEY } from "../studio-project-library-reader";

import { useI18n } from "@/shared/lib/i18n";

import { StudioWorkAssetsPage } from "./StudioWorkAssetsPage";

vi.mock("../StudioUnifiedAssetPreviewSurface", () => ({
  StudioUnifiedAssetPreviewSurface: ({
    preview,
  }: {
    preview: { kind: string; src?: string };
  }) => (
    <div data-preview-kind={preview.kind}>
      {preview.kind === "image" && preview.src ? <img src={preview.src} alt="" /> : null}
    </div>
  ),
}));

const LOCAL_ASSET: StudioAsset = {
  id: "asset-1",
  name: "주인공 기본 표정",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  width: 800,
  height: 600,
  createdAt: 1_700_000_000_000,
};

function fakePort(list: () => Promise<StudioAsset[]>): StudioAssetLibraryPort {
  return {
    save: () => Promise.reject(new Error("unused")),
    list,
    findByContentIdentities: () => Promise.resolve(new Map()),
    delete: () => Promise.resolve(),
    deleteIfIdentityMatches: () => Promise.resolve(false),
    rename: () => Promise.resolve(),
  };
}

function seedProjectLibrary() {
  const timestamp = "2026-10-05T00:00:00.000Z";
  window.localStorage.setItem(
    STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: timestamp,
      projects: [
        {
          id: "work-1",
          title: "회색의 도시",
          kind: "webtoon",
          status: "active",
          statusBeforeTrash: null,
          templateId: null,
          description: "",
          primaryLocale: "ko-KR",
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: timestamp,
          lastOpenedDocumentId: null,
        },
      ],
    }),
  );
}

function renderWorkPage() {
  return render(
    <MemoryRouter>
      <StudioWorkAssetsPage
        editorHref="/studio/work/work-1/canvas"
        remixSourceWorkId={null}
        workId="work-1"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  installStudioAssetLibraryPortForTest(null);
  window.localStorage.clear();
});

describe("StudioWorkAssetsPage", () => {
  it("shows the work title and both route exits while assets load", async () => {
    seedProjectLibrary();
    installStudioAssetLibraryPortForTest(fakePort(() => Promise.resolve([LOCAL_ASSET])));
    renderWorkPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("회색의 도시");
    expect(document.querySelector('[data-studio-route-exit="editor"]')?.getAttribute("href"))
      .toBe("/studio/work/work-1/canvas");
    expect(document.querySelector('[data-studio-route-exit="site"]')?.getAttribute("href"))
      .toBe("/showcase");
    expect(await screen.findByRole("list", { name: "에셋 목록" })).toBeTruthy();
  });

  it("renders saved library assets as tiles with their real thumbnails under 내 에셋", async () => {
    installStudioAssetLibraryPortForTest(fakePort(() => Promise.resolve([LOCAL_ASSET])));
    renderWorkPage();

    fireEvent.click(await screen.findByRole("button", { name: /내 에셋/u }));
    const grid = await screen.findByRole("list", { name: "에셋 목록" });
    const tile = within(grid).getByRole("link", { name: /주인공 기본 표정/u });
    expect(tile.getAttribute("href")).toBe("/studio/work/work-1/canvas");
    expect(within(grid).getAllByRole("link")).toHaveLength(1);
    expect(grid.querySelector(`img[src="${LOCAL_ASSET.dataUrl}"]`)).toBeTruthy();
  });

  it("shows the mockup empty state with a hub link when the work scope has no saved assets", async () => {
    installStudioAssetLibraryPortForTest(fakePort(() => Promise.resolve([])));
    renderWorkPage();

    fireEvent.click(await screen.findByRole("button", { name: /내 에셋/u }));
    expect(await screen.findByRole("heading", { name: "아직 저장한 에셋이 없습니다" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "에셋 허브 열기" }).getAttribute("href"))
      .toBe("/studio/assets");
  });

  it("offers a retry when the asset library cannot be read, then recovers", async () => {
    let attempts = 0;
    installStudioAssetLibraryPortForTest(fakePort(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("storage unavailable"))
        : Promise.resolve([LOCAL_ASSET]);
    }));
    renderWorkPage();

    expect(await screen.findByRole("heading", { name: "내 에셋을 불러오지 못했습니다" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/u }));
    expect(await screen.findByRole("list", { name: "에셋 목록" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("reports an empty search honestly and resets filters", async () => {
    installStudioAssetLibraryPortForTest(fakePort(() => Promise.resolve([LOCAL_ASSET])));
    renderWorkPage();

    const searchbox = await screen.findByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "zxqwv없는검색어" } });
    expect(await screen.findByRole("heading", { name: "조건에 맞는 에셋이 없습니다" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(await screen.findByRole("list", { name: "에셋 목록" })).toBeTruthy();
  });

  it("labels remix scopes and targets the remix editor", async () => {
    installStudioAssetLibraryPortForTest(fakePort(() => Promise.resolve([])));
    render(
      <MemoryRouter>
        <StudioWorkAssetsPage
          editorHref="/studio/remix/source-9/canvas"
          remixSourceWorkId="source-9"
          workId={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("리믹스 source-9");
    expect(document.querySelector('[data-studio-route-exit="editor"]')?.getAttribute("href"))
      .toBe("/studio/remix/source-9/canvas");
    expect(await screen.findByRole("list", { name: "에셋 목록" })).toBeTruthy();
  });
});
