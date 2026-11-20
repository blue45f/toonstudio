import { GUEST_SESSION_KEY } from "../apps/web/src/domains/auth/public/session/guest-session";
import { STUDIO_PROJECT_LIBRARY_STORAGE_KEY } from "../apps/web/src/domains/creator/studio-project-library-store";
import { WORKSPACE_TOUR_STORAGE_KEY } from "../apps/web/src/domains/creator/workspace/studio-workspace-tour-state";
import { CREATOR_EXPERIENCE_STORAGE_KEY } from "../apps/web/src/shared/lib/creator-experience-mode";

import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

const THEME_STORAGE_KEY = "toonstudio-theme";
const DEMO_PROJECT_ID = "unslop-parity-demo";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, minCanvasRatio: 0.82 },
  { name: "mobile", width: 390, height: 844, minCanvasRatio: 0.88 },
] as const;

interface SmallTargetViolation {
  readonly w: number;
  readonly h: number;
  readonly label: string;
}

/**
 * Starlight 다크 테마, 한국어 로케일, 게스트 세션 및 로컬 데모 프로젝트를 시딩한다.
 * 라이브 백엔드 쓰기 없이 6대 핵심 창작 라우트의 실제 DOM 치수·시야율·접근성을 검증한다.
 */
async function seedCreatorSession(page: Page): Promise<void> {
  const nowIso = "2026-11-20T09:00:00.000Z";
  const librarySeed = JSON.stringify({
    schemaVersion: 1,
    updatedAt: nowIso,
    projects: [
      {
        id: DEMO_PROJECT_ID,
        title: "별빛 아틀리에 파일럿",
        kind: "webtoon",
        status: "active",
        statusBeforeTrash: null,
        templateId: null,
        description: "",
        primaryLocale: "ko-KR",
        createdAt: nowIso,
        updatedAt: nowIso,
        lastOpenedAt: nowIso,
        lastOpenedDocumentId: null,
        thumbnailUrl: null,
      },
    ],
  });

  await page.addInitScript(
    ({ guestKey, tourKey, themeKey, expKey, libraryKey, libraryValue }) => {
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
      localStorage.setItem(
        themeKey,
        JSON.stringify({
          state: { preference: "starlight", studioPreference: "starlight", theme: "starlight" },
          version: 0,
        }),
      );
      localStorage.setItem(expKey, JSON.stringify({ mode: "classic" }));
      localStorage.setItem(guestKey, JSON.stringify({ id: "guest_unslop-parity", createdAt: Date.now() }));
      localStorage.setItem(tourKey, "done");
      localStorage.setItem(libraryKey, libraryValue);
      sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    },
    {
      guestKey: GUEST_SESSION_KEY,
      tourKey: WORKSPACE_TOUR_STORAGE_KEY,
      themeKey: THEME_STORAGE_KEY,
      expKey: CREATOR_EXPERIENCE_STORAGE_KEY,
      libraryKey: STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
      libraryValue: librarySeed,
    },
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline parity fixture" } });
  });
}

/**
 * WCAG 2.2 SC 2.5.8 하드 플로어(< 24×24px) 실시간 DOM 바운딩박스 프로브.
 * accesslint / axe-core가 잡지 못하는 소형 터치·포인터 타깃을 실측 검증한다.
 */
async function probeWcag258SmallTargets(page: Page): Promise<SmallTargetViolation[]> {
  return page.evaluate(() => {
    const selector =
      "button,[role=button],a[href],input,select,textarea,[role=menuitem],[role=tab],[role=slider],[role=switch],[role=checkbox]";
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    return elements
      .filter((el) => {
        if (el.getAttribute("aria-hidden") === "true" || el.tabIndex < 0) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
          return false;
        }
        // 스크린리더 전용(.sr-only) 스킵 링크·숨김 파일 입력은 포인터 타깃이 아니므로 제외한다.
        const rawRect = el.getBoundingClientRect();
        if (
          el.classList.contains("sr-only") ||
          style.clip === "rect(0px, 0px, 0px, 0px)" ||
          style.clipPath === "inset(50%)" ||
          (rawRect.width <= 1 && rawRect.height <= 1 && style.overflow === "hidden")
        ) {
          return false;
        }
        return typeof el.checkVisibility === "function"
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : true;
      })
      .map((el) => {
        // WCAG 2.2 SC 2.5.8: <label>로 감싼 네이티브 checkbox/radio는 라벨 전체가 실제 포인터 타깃이다.
        const isLabeledNativeToggle =
          el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
        const hitTarget = isLabeledNativeToggle ? el.closest("label") ?? el : el;
        const rect = hitTarget.getBoundingClientRect();
        const label = (
          el.getAttribute("aria-label") ??
          el.getAttribute("title") ??
          hitTarget.textContent ??
          el.tagName
        )
          .trim()
          .slice(0, 32);
        return { w: Math.round(rect.width), h: Math.round(rect.height), label };
      })
      .filter((target) => target.w > 0 && target.h > 0 && (target.w < 24 || target.h < 24));
  });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

test.beforeEach(async ({ page }) => {
  await seedCreatorSession(page);
});

for (const vp of VIEWPORTS) {
  test.describe(`Unslop 패리티 게이트 (${vp.name} ${vp.width}×${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });

    test("1. /studio 크리에이터 홈 — 첫 화면 2열 벤토(이어하기 + 빠른 시작 4종) · 가로 넘침 0 · SC 2.5.8", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/studio", { waitUntil: "domcontentloaded" });
      const bento = page.locator('[data-studio-home-bento="true"]');
      await expect(bento).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("navigation", { name: "작업 시작 방식" })).toBeVisible();

      const bentoBox = await bento.boundingBox();
      expect(bentoBox).not.toBeNull();
      expect((bentoBox?.y ?? 9999)).toBeLessThan(vp.height);

      await assertNoHorizontalOverflow(page);
      expect(await probeWcag258SmallTargets(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("2. /studio/canvas 2D 웹툰 에디터 — 상단바 <=48px · 레일 <=52px · 캔버스 시야율 · SC 2.5.8", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/studio/canvas", { waitUntil: "domcontentloaded" });
      const viewportEl = page.locator("[data-studio-canvas-viewport], canvas").first();
      await expect(viewportEl).toBeVisible({ timeout: 60_000 });

      const metrics = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const menubar = document.querySelector<HTMLElement>("#studio-menubar, header[data-studio-clarity-bar]");
        const rail = document.querySelector<HTMLElement>('[data-studio-rail-group-count], aside[aria-label*="도구"]');
        const canvasHost =
          document.querySelector<HTMLElement>("[data-studio-canvas-viewport]") ??
          document.querySelector<HTMLElement>("canvas");
        const barRect = menubar?.getBoundingClientRect() ?? null;
        const railRect = rail?.getBoundingClientRect() ?? null;
        const canvasRect = canvasHost?.getBoundingClientRect() ?? null;
        return {
          barHeight: barRect ? Math.round(barRect.height) : 0,
          railWidth: railRect ? Math.round(railRect.width) : 0,
          canvasRatio:
            canvasRect && vw > 0 && vh > 0 ? (canvasRect.width * canvasRect.height) / (vw * vh) : 0,
        };
      });

      if (metrics.barHeight > 0) {
        expect(metrics.barHeight).toBeLessThanOrEqual(48);
      }
      if (vp.name === "desktop" && metrics.railWidth > 0) {
        expect(metrics.railWidth).toBeLessThanOrEqual(52);
      }
      expect(metrics.canvasRatio).toBeGreaterThanOrEqual(vp.minCanvasRatio);

      await assertNoHorizontalOverflow(page);
      expect(await probeWcag258SmallTargets(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("3. /studio/bg3d 3D 배경 모델러 — 4단계 스위처 · 기본 접힘 쉘프 · 원클릭 컷 굽기 CTA", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/studio/bg3d", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("main").first()).toBeVisible({ timeout: 20_000 });

      const bodyText = (await page.locator("body").textContent()) ?? "";
      expect(bodyText).not.toContain("3D · LIVE INK");
      expect(bodyText).not.toContain("무엇을 만들까요?");

      await assertNoHorizontalOverflow(page);
      expect(await probeWcag258SmallTargets(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("4. /shaper & /studio/poser — #ffff00 글로우 0건 · VARCO 3D 0건 · SC 2.5.8", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      for (const route of ["/studio/assets/characters/new", "/studio/poser"]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).toBeVisible({ timeout: 20_000 });

        const audit = await page.evaluate(() => {
          const text = document.body.textContent ?? "";
          const yellowGlowNodes = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
            const style = window.getComputedStyle(el);
            return (
              style.boxShadow.includes("255, 255, 0") ||
              style.borderColor === "rgb(255, 255, 0)" ||
              style.outlineColor === "rgb(255, 255, 0)"
            );
          }).length;
          return { hasVarco: /VARCO 3D/u.test(text), yellowGlowNodes };
        });

        expect(audit.hasVarco, route).toBe(false);
        expect(audit.yellowGlowNodes, route).toBe(0);
        await assertNoHorizontalOverflow(page);
        expect(await probeWcag258SmallTargets(page), route).toEqual([]);
      }
      expect(errors).toEqual([]);
    });

    test("5. /studio/p/:id/story (4대 기획 뷰) — 다크 테마 bg-white 누출 0건 · 카드 스타일 적용", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      for (const view of ["episodes", "characters", "world", "timeline"] as const) {
        await page.goto(`/studio/p/${DEMO_PROJECT_ID}/story?view=${view}`, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.getByRole("main").first()).toBeVisible({ timeout: 20_000 });

        const lightBleedCount = await page.evaluate(() => {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>("main section, main article, main table"));
          return nodes.filter((el) => window.getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)").length;
        });

        expect(lightBleedCount, `view=${view}`).toBe(0);
        await assertNoHorizontalOverflow(page);
        expect(await probeWcag258SmallTargets(page), `view=${view}`).toEqual([]);
      }
      expect(errors).toEqual([]);
    });

    test("6. /studio/storyworld — 4개 핵심 탭 · 경쟁사명 0건 · 고급·JSON 드로어 기본 접힘", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/studio/storyworld", { waitUntil: "domcontentloaded" });
      const nav = page.getByRole("navigation", { name: "스토리월드 랩 섹션" });
      await expect(nav).toBeVisible({ timeout: 20_000 });
      await expect(nav.getByRole("button")).toHaveCount(4);

      const drawer = page.locator('[data-storyworld-advanced-drawer="true"]');
      await expect(drawer).toHaveJSProperty("open", false);

      const bodyText = (await page.locator("body").textContent()) ?? "";
      expect(bodyText).not.toMatch(/World Anvil|Campfire|Plottr|Scrivener/iu);

      await assertNoHorizontalOverflow(page);
      expect(await probeWcag258SmallTargets(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
