// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  parseStudioExportFocusHandoff,
  useStudioExportUrlHandoffSync,
} from "../export/studio-export-url-handoff";
import { studioAutosaveKey, writeStudioLifecycleAutosave } from "../studio-autosave";
import { StudioExportPreflightReturnBanner } from "../studio-cuttoon-editor/StudioExportPreflightReturnBanner";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";
import type { El } from "../studio-element-model";
import { createStudioProjectDocument } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import * as manuscriptFacts from "./studio-manuscript-export-facts";
import { StudioExportPanel } from "./StudioExportPanel";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

function seedThreePageManuscript(options: { readonly fixedOnPage2: boolean }): void {
  writeStudioLifecycleAutosave(
    window.localStorage,
    studioAutosaveKey({ userId: null, workId: "doc-roundtrip-28" }),
    {
      version: 6,
      savedAt: options.fixedOnPage2
        ? "2026-11-15T07:10:00.000Z"
        : "2026-11-15T07:00:00.000Z",
      title: "1화",
      currentPageId: "p-1",
      pagesList: [
        {
          id: "p-1",
          name: "1페이지",
          bg: "#ffffff",
          bgGrad: null,
          canvasH: 1280,
          groups: [],
          elements: [
            {
              id: "cut-1a",
              type: "frame",
              x: 24,
              y: 24,
              width: 672,
              height: 600,
              stroke: "#111",
              fill: "#fff",
            },
            {
              id: "img-outside-range",
              type: "image",
              x: 60,
              y: 80,
              width: 240,
              height: 180,
              src: "",
              name: "1페이지외부누락.png",
            },
          ],
        },
        {
          id: "p-2",
          name: "2페이지",
          bg: "#ffffff",
          bgGrad: null,
          canvasH: 1280,
          groups: [],
          elements: [
            {
              id: "cut-2a",
              type: "frame",
              x: 24,
              y: 24,
              width: 672,
              height: 560,
              stroke: "#111",
              fill: "#fff",
            },
            {
              id: "cut-2b",
              type: "frame",
              x: 24,
              y: 620,
              width: 672,
              height: 600,
              stroke: "#111",
              fill: "#fff",
            },
            {
              id: "img-missing-2b",
              type: "image",
              x: 80,
              y: 680,
              width: 320,
              height: 240,
              src: options.fixedOnPage2 ? "data:image/png;base64,iVBORw0KGgo=" : "",
              name: "배경소품.png",
            },
            {
              id: "bub-missing-font-2b",
              type: "bubble",
              x: 100,
              y: 960,
              width: 260,
              height: 90,
              text: "미설치 서체 대사",
              font: options.fixedOnPage2 ? "Pretendard, sans-serif" : "MissingCustomFont2026",
              fontSize: 22,
            },
          ],
        },
        {
          id: "p-3",
          name: "3페이지",
          bg: "#ffffff",
          bgGrad: null,
          canvasH: 1280,
          groups: [],
          elements: [
            {
              id: "cut-3a",
              type: "frame",
              x: 24,
              y: 24,
              width: 672,
              height: 600,
              stroke: "#111",
              fill: "#fff",
            },
          ],
        },
      ],
    } as never,
    { preservePrimary: false },
  );
}

describe("StudioExportPanel ↔ 편집기 경고 위치 직행 및 동일 범위 재검사 (Item 28)", () => {
  it("선택 범위(2–3페이지) 안의 누락 소재·미설치 글꼴만 컷 위치와 함께 검출하고, 수정 후 복귀 시 동일 범위를 자동 재검사한다", async () => {
    createStudioProject(window.localStorage, {
      id: "proj-roundtrip-28",
      title: "경고 직행 검증작",
      kind: "webtoon",
    });
    createStudioProjectDocument(window.localStorage, "proj-roundtrip-28", {
      id: "doc-roundtrip-28",
      title: "1화",
      kind: "webtoon",
      width: 720,
      height: 3840,
      pageCount: 3,
    });
    seedThreePageManuscript({ fixedOnPage2: false });

    const load = vi.spyOn(manuscriptFacts, "loadPersistedManuscriptExportFacts");
    const firstRender = render(
      <MemoryRouter initialEntries={["/studio/p/proj-roundtrip-28/export"]}>
        <Routes>
          <Route
            path="/studio/p/:projectId/export"
            element={<StudioExportPanel projectId="proj-roundtrip-28" locale="ko" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      const snapshot = await load.mock.results.at(-1)?.value;
      expect(snapshot?.sourceAuthority).toBe("manuscript-snapshot");
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-export-scope-summary").textContent).toContain(
        "실제 편집 원고 연결됨",
      );
    });

    fireEvent.click(screen.getByTestId("studio-export-reset-recommended"));
    fireEvent.click(screen.getByTestId("studio-export-scope-select-custom"));
    fireEvent.change(screen.getByTestId("studio-export-scope-page-input"), {
      target: { value: "2-3" },
    });

    fireEvent.click(screen.getByRole("button", { name: "현재 상태 검사" }));

    expect(screen.getByText(/꼭 고칠 항목 2건/u)).toBeTruthy();
    const assetJump = screen.getByTestId("studio-export-finding-jump-missing-assets-0");
    const fontJump = screen.getByTestId("studio-export-finding-jump-missing-fonts-0");

    expect(assetJump.textContent).toContain("2페이지 · 2컷으로 이동 (배경소품.png)");
    expect(fontJump.textContent).toContain("2페이지 · 2컷으로 이동 (MissingCustomFont2026)");
    // 선택 범위 밖(1페이지)의 누락 소재는 섞이지 않는다.
    expect(screen.getByTestId("studio-export-preflight-findings").textContent).not.toContain(
      "1페이지외부누락.png",
    );

    const jumpHref = assetJump.getAttribute("href") ?? "";
    expect(jumpHref).toContain("/studio/p/proj-roundtrip-28/d/doc-roundtrip-28");
    const [, jumpQuery = ""] = jumpHref.split("?", 2);
    const parsedFocus = parseStudioExportFocusHandoff(`?${jumpQuery}`);
    expect(parsedFocus).toMatchObject({
      focusPageId: "p-2",
      focusPageNumber: 2,
      focusCutId: "cut-2b",
      focusCutNumber: 2,
      focusElementId: "img-missing-2b",
      findingCode: "missing-assets",
    });
    expect(parsedFocus?.returnToExport).toContain(
      "/studio/p/proj-roundtrip-28/export?exportTarget=webtoon-platform",
    );
    expect(parsedFocus?.returnToExport).toContain("exportSelection=custom");
    expect(parsedFocus?.returnToExport).toContain("exportPages=2-3");
    expect(parsedFocus?.returnToExport).toContain("autoRecheck=1");

    firstRender.unmount();

    // 편집기에서 2페이지 2컷의 누락 소재와 글꼴을 수정해 저장한 뒤 returnToExport로 복귀
    seedThreePageManuscript({ fixedOnPage2: true });

    render(
      <MemoryRouter initialEntries={[parsedFocus!.returnToExport!]}>
        <Routes>
          <Route
            path="/studio/p/:projectId/export"
            element={<StudioExportPanel projectId="proj-roundtrip-28" locale="ko" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      const snapshot = await load.mock.results.at(-1)?.value;
      expect(snapshot?.sourceAuthority).toBe("manuscript-snapshot");
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "편집기에서 돌아와 이전과 같은 범위를 최신 원고 기준으로 다시 검사했어요",
      );
    });

    // 이전 선택 범위(2–3페이지)가 그대로 유지되고 경고 해소가 즉시 반영된다(1페이지의 미수정 이슈는 여전히 범위 밖).
    expect(
      (screen.getByTestId("studio-export-scope-page-input") as HTMLInputElement).value,
    ).toBe("2-3");
    expect(screen.getByText(/꼭 고칠 항목 0건/u)).toBeTruthy();
  });

  it("편집기 포커스 핸드오프가 대상 페이지·컷·요소를 선택하고 수정 후 복귀 시 저장 플러시를 호출한다", async () => {
    const setCurrentPageId = vi.fn();
    const setSelectedId = vi.fn();
    const onScopedWriteLayer = vi.fn();
    const commit = vi.fn(() => true);
    const requestSaveFlush = vi.fn();

    const editorSearch =
      "?focusPageId=p-2&focusPageNumber=2&focusCutId=cut-2b&focusCutNumber=2&focusElementId=bub-missing-font-2b&findingCode=missing-fonts&findingLabel=MissingCustomFont2026&returnToExport=%2Fstudio%2Fp%2Fproj-roundtrip-28%2Fexport%3FexportSelection%3Dcustom%26exportPages%3D2-3%26autoRecheck%3D1";
    window.history.replaceState(null, "", `/studio/p/proj-roundtrip-28/d/doc-roundtrip-28${editorSearch}`);

    function FocusHarness() {
      useStudioExportUrlHandoffSync({
        pages: [{ id: "p-1" }, { id: "p-2" }, { id: "p-3" }],
        currentPageId: "p-2",
        exportMenuOpen: false,
        workHydrated: true,
        setExportFormat: vi.fn(),
        setExportScale: vi.fn(),
        setExportPresetId: vi.fn(),
        setExportMenuOpen: vi.fn(),
        setCurrentPageId,
        setSelectedId,
        onScopedWriteLayer,
      });
      return null;
    }

    const fakeSession = {
      currentPageId: "p-2",
      collaborationReadOnly: false,
      pageEditLocked: false,
      activeSurfaceReviewLocked: false,
      elements: [
        {
          id: "bub-missing-font-2b",
          type: "bubble",
          variant: "speech",
          text: "미설치 서체",
          x: 100,
          y: 960,
          width: 260,
          height: 90,
          fill: "#fff",
          textFill: "#111",
          rotation: 0,
          font: "MissingCustomFont2026",
          fontSize: 22,
        } satisfies El,
      ],
      setCurrentPageId,
      setSelectedId,
      onScopedWriteLayer,
      commit,
      requestSaveFlush,
    } as unknown as StudioCuttoonEditorViewSession;

    render(
      <MemoryRouter
        initialEntries={[`/studio/p/proj-roundtrip-28/d/doc-roundtrip-28${editorSearch}`]}
      >
        <Routes>
          <Route
            path="/studio/p/:projectId/d/:documentId"
            element={
              <>
                <FocusHarness />
                <StudioExportPreflightReturnBanner session={fakeSession} />
              </>
            }
          />
          <Route path="/studio/p/:projectId/export" element={<div data-testid="returned-export-route" />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(setCurrentPageId).toHaveBeenCalledWith("p-2");
      expect(onScopedWriteLayer).toHaveBeenCalledWith("bub-missing-font-2b", "cut-2b");
      expect(setSelectedId).toHaveBeenCalledWith("bub-missing-font-2b");
    });

    fireEvent.click(screen.getByTestId("studio-preflight-fix-safe-font"));
    expect(commit).toHaveBeenCalledOnce();
    expect(requestSaveFlush).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("studio-export-return-to-preflight"));
    await waitFor(() => {
      expect(screen.getByTestId("returned-export-route")).toBeTruthy();
    });
    expect(requestSaveFlush).toHaveBeenCalledTimes(2);
  });
});
