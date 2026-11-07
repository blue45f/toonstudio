import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/non-studio-test";

const DATE = "2026-11-07T00:00:00.000Z";
const PROJECT_ID = "temporary-00";
const DOCUMENT_ID = "document-fixture";
const DOCUMENT_KEY = `toonspectrum:studio-project-documents:v1:${PROJECT_ID}`;
const RESUME_KEY = `toonspectrum:studio:exact-resume:v1:${PROJECT_ID}:${DOCUMENT_ID}`;

for (const { width, zoom } of [{ width: 320, zoom: 1 }, { width: 390, zoom: 1 }, { width: 768, zoom: 1 }, { width: 1440, zoom: 1 }, { width: 1440, zoom: 2 }]) {
  for (const theme of ["starlight", "light", "contrast"]) {
    test(`${width}px reflow${zoom * 100}% ${theme}: 이어하기 갱신과 확장 초점`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // 200% 브라우저 확대에 해당하는 CSS viewport로 검사한다. CSS zoom은 media query를 바꾸지 않는다.
      await page.setViewportSize({ width: Math.round(width / zoom), height: Math.round(1000 / zoom) });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(({ theme, date, projectId, documentId, documentKey }) => {
        localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: theme, studioPreference: "inherit" }, version: 0 }));
        sessionStorage.setItem("toonstudio-compat-dismissed", "true");
        const projects = [];
        const profiles: Record<string, unknown> = {};
        for (const kind of ["temporary", "saved", "archived"]) {
          for (let i = 0; i < (kind === "archived" ? 50 : 38); i += 1) {
            const id = `${kind}-${String(i).padStart(2, "0")}`;
            projects.push({ id, title: `가상 작업 ${id}`, kind: "webtoon", status: kind === "archived" ? "archived" : "active", statusBeforeTrash: null, templateId: null, description: "회귀 검증용 합성 프로젝트", primaryLocale: "ko-KR", createdAt: date, updatedAt: date, lastOpenedAt: date, lastOpenedDocumentId: id === projectId ? documentId : null, thumbnailUrl: null });
            if (kind === "saved") {
              profiles[id] = { schemaVersion: 1, projectId: id, accessMode: "owner-only", storageMode: "hybrid", distributionState: "none", autoSave: true, createVersions: true, revision: 1, bindings: [{ id: `file-${id}`, provider: "local-file", role: "canonical", label: `${id}.toonstudio`, syncState: "synced", lastSyncedAt: date }], lastManualSaveAt: date, lastExportAt: null, lastSubmissionAt: null, lastPublicationAt: null, updatedAt: date };
            }
          }
        }
        localStorage.setItem("toonspectrum:studio-project-library:v1", JSON.stringify({ schemaVersion: 1, projects, updatedAt: date }));
        localStorage.setItem("toonstudio.save-profiles.v1", JSON.stringify({ schemaVersion: 1, profiles, updatedAt: date }));
        localStorage.setItem(documentKey, JSON.stringify({ schemaVersion: 1, projectId, documents: [{ id: documentId, projectId, title: "가상 문서", kind: "webtoon", status: "active", statusBeforeTrash: null, defaultWorkspace: "comic", allowedWorkspaces: ["comic", "draw"], width: 800, height: 1200, pageCount: 1, createdAt: date, updatedAt: date, lastOpenedAt: date }], updatedAt: date }));
      }, { theme, date: DATE, projectId: PROJECT_ID, documentId: DOCUMENT_ID, documentKey: DOCUMENT_KEY });
      await page.route("**/api/**", async (route) => {
        await route.fulfill(new URL(route.request().url()).pathname.endsWith("/auth/session")
          ? { json: { authenticated: false, user: null } }
          : { status: 503, json: { message: "로컬 합성 홈 회귀 검증" } });
      });
      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      const search = page.getByRole("textbox", { name: "프로젝트 검색", exact: true });
      await search.fill("가상 작업");
      await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
      const card = page.locator('[data-studio-project-card="true"]').filter({ has: page.getByRole("heading", { name: `가상 작업 ${PROJECT_ID}`, exact: true }) });
      const continueLink = card.locator("[data-studio-card-continue]");
      await expect(continueLink).toHaveAttribute("href", /workspace=comic/);
      await page.evaluate(({ projectId, documentId, resumeKey, date }) => {
        const context = { schemaVersion: 1, projectId, documentId, workspace: "comic", pageId: "page-new", selectedElementIds: [], zoom: 1.5, scrollLeft: 0, scrollTop: 0, tool: "select", drawMode: "pen", focus: "cut:new", language: null, sourceVersion: null, updatedAt: date };
        localStorage.setItem(resumeKey, JSON.stringify(context));
        window.dispatchEvent(new CustomEvent("toonspectrum:studio-exact-resume-updated", { detail: context }));
      }, { projectId: PROJECT_ID, documentId: DOCUMENT_ID, resumeKey: RESUME_KEY, date: DATE });
      await expect(continueLink).toHaveAttribute("href", /focus=cut%3Anew/);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText("page-new · 확대 150%", { exact: true })).toBeVisible();
      await page.evaluate(({ projectId, documentKey }) => {
        const state = JSON.parse(localStorage.getItem(documentKey) ?? "{}");
        state.documents[0].defaultWorkspace = "draw";
        state.documents[0].allowedWorkspaces = ["draw"];
        localStorage.setItem(documentKey, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent("toonspectrum:studio-project-documents-updated", { detail: { projectId } }));
      }, { projectId: PROJECT_ID, documentKey: DOCUMENT_KEY });
      await expect(continueLink).toHaveAttribute("href", /workspace=draw/);
      await expect(continueLink).not.toHaveAttribute("href", /focus=/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      for (const section of ["temporary", "saved"]) {
        const list = page.locator(`[data-studio-project-grid="${section}"]`);
        const more = page.locator(`[data-studio-load-more="${section}"]`);
        for (const count of [12, 36]) {
          await expect(list.getByRole("checkbox")).toHaveCount(count);
          await more.focus();
          await more.press(count === 12 ? "Enter" : "Space");
          await expect(list.getByRole("checkbox").nth(count)).toBeFocused();
          await page.keyboard.press("Tab");
          await expect(list.locator("[data-studio-card-title-link]").nth(count)).toBeFocused();
        }
        await expect(more).toHaveCount(0);
        await expect(list.getByRole("checkbox")).toHaveCount(38);
      }
      const focused = page.locator(":focus");
      await focused.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("expanded-project-focus.png") });
      const a11y = await new AxeBuilder({ page }).include('[data-studio-project-sections]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(a11y.violations).toEqual([]);
      await page.locator('a[href="/studio?view=archived"]').first().click();
      await expect(page).toHaveURL(/view=archived/);
      await search.fill("가상 작업");
      const recovery = page.locator("[data-studio-recovery-list]");
      const more = page.locator('[data-studio-load-more="recovery"]');
      for (const count of [24, 48]) {
        await expect(recovery.getByRole("checkbox")).toHaveCount(count);
        await more.focus();
        await more.press("Enter");
        await expect(recovery.getByRole("checkbox").nth(count)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(recovery.locator("article").nth(count).getByRole("button", { name: "복원", exact: true })).toBeFocused();
      }
      await expect(more).toHaveCount(0);
      await page.goBack();
      await expect(search).toBeVisible();
      await page.goForward();
      await expect(recovery).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
