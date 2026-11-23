import assert from "node:assert/strict";
import { createHash } from "node:crypto";


import { openStudioMainMenu } from "../../../scripts/lib/studio-shell-interactions.ts";
import { readDurableStudioAutosaveDocument } from "../../../scripts/lib/studio-verify-durable-autosave.mts";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const visible = (locator) => locator.filter({ visible: true }).first();
const altRoot = (page) => page.locator("[data-claude-alt-text-root]");
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const canvas = (page) => visible(page.locator(".konvajs-content"));
const documentAI = /QA-(?:(?:A|B)-(?!synthetic)|TRUNCATED-)/u;

async function dismissCoach(page) {
  for (const [selector, control] of [
    ['[data-studio-creative-starter="true"]', '[data-studio-quickstart-dismiss="true"]'],
    ['[data-studio-cinematic-canvas-welcome="true"]', null],
  ]) {
    const coach = visible(page.locator(selector));
    if (await coach.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
      const target = control ? coach.locator(control) : coach.getByRole("button", { name: /시작 안내 닫기|빈 캔버스로 그대로 시작|Close.*guide|blank canvas/i });
      await visible(target).click();
      await coach.waitFor({ state: "hidden" });
    }
  }
}

async function openFeature(page, id) {
  const entry = visible(page.locator('[data-ai-assist="' + id + '"]'));
  const menu = visible(page.locator('[data-ai-assist="menu"]'));
  if (!await entry.isVisible()) {
    if (await menu.isVisible()) {
      await menu.click();
    } else {
      const direct = visible(page.locator('[data-studio-main-menu="true"] [data-studio-main-menu-trigger="ai"]'));
      let panel;
      if (await direct.isVisible()) {
        await direct.focus();
        await direct.press("ArrowDown");
        panel=visible(page.locator('[data-studio-main-menu-panel="true"] [role="menu"]'));
      } else {
        panel=await openStudioMainMenu(page,"ai");
      }
      const assist = panel.locator('[data-studio-menu-item-id="ai-assist"]');
      if (!await assist.isVisible()) await panel.getByRole("menuitem", { name: /^고급 도구 펼치기|Show advanced/i }).click();
      await assist.click();
    }
  }
  await entry.click({timeout:90000});
}

async function fixture(page, stage) {
  const base64 = await page.evaluate((s) => {
    const c = document.createElement("canvas");
    c.width = s === "A" ? 96 : 112;
    c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = s === "A" ? "#bd251a" : "#196a58";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff";
    g.fillRect(8, 10, s === "A" ? 18 : 36, 25);
    return c.toDataURL("image/png").split(",")[1];
  }, stage);
  return { name: "QA-" + stage + "-synthetic.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

async function waitUntil(test, description, timeout = 12000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await test();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 180));
  } while (Date.now() < deadline);
  throw new Error(description);
}

async function currentDocument(page) {
  const key = await page.evaluate(async () => {
    const path = location.pathname.match(/\/studio\/p\/[^/]+\/d\/([^/]+)/u);
    const params = new URL(location.href).searchParams;
    const session = JSON.parse(sessionStorage.getItem("toonstudio-auth-session") ?? "null");
    const { studioAutosaveKey } = await import("/src/domains/creator/studio-autosave.ts");
    return studioAutosaveKey({
      userId: session?.user?.id,
      workId: params.get("workId") || (path ? decodeURIComponent(path[1]) : (params.get("draft") ? "draft:" + params.get("draft") : null)),
      remixId: params.get("remixId"),
    });
  });
  const snapshot = await readDurableStudioAutosaveDocument(page, key, {
    moduleUrl: new URL("/src/domains/creator/studio-autosave-opfs-session.ts", page.url()).href,
    sqliteModuleUrl: new URL("/src/domains/creator/studio-autosave-sqlite-store.ts", page.url()).href,
  });
  if (!snapshot) return null;
  const draws = snapshot.pagesList.flatMap((p) => (p.elements ?? []).filter((el) => el.type === "draw"));
  return { key, savedAt: snapshot.savedAt, drawCount: draws.length, drawIds: draws.map((s) => s.id),
    pageDigest: hash(JSON.stringify(snapshot.pagesList)), containsAorB: documentAI.test(snapshot.raw) };
}

async function captureArtwork(page, dialog) {
  await button(dialog, "캔버스에서 가져오기").click();
  const preview = dialog.locator("img");
  await preview.waitFor({ state: "visible" });
  const stat = await preview.evaluate(async (img) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const bytes = g.getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return { width: c.width, height: c.height, rgbaHash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("") };
  });
  return stat;
}


export { openFeature, fixture, currentDocument, captureArtwork, dismissCoach, waitUntil, button, altRoot, visible };
export async function prepareDrawing(page) {
  await page.locator('[data-studio-canvas-viewport="true"]').first().waitFor({state:"visible",timeout:600000});
  await dismissCoach(page);
      const pen = visible(page.locator('[data-studio-rail-tool-id="pen"]'));
      if (await pen.isVisible()) await pen.click();
      else await page.keyboard.press("b");
      await page.waitForFunction(() => Boolean(JSON.parse(sessionStorage.getItem("toonstudio-auth-session") ?? "null")?.user?.id), {}, {timeout:30000});
      await currentDocument(page); // 영속 저장소 읽기가 끝난 뒤 검증용 획을 그린다.
      await dismissCoach(page);
      await page.waitForTimeout(1600);
      const stage = await canvas(page).boundingBox();
      const win = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert(stage, "원고 캔버스 측정");
      const left = Math.max(0, stage.x), right = Math.min(win.width, stage.x + stage.width);
      const top = Math.max(0, stage.y), bottom = Math.min(win.height, stage.y + stage.height);
      assert(right > left + 40 && bottom > top + 60, "편집 가능한 원고 면적");
      const y = await waitUntil(async () => {
        for (const ratio of [.46,.54,.36,.61,.29,.68]) {
          const py = top + (bottom-top)*ratio;
          const usable = await page.evaluate(({x1,x2,y}) => [0,.5,1].every(t => {
            const el = document.elementFromPoint(x1+(x2-x1)*t,y+27*t);
            return el?.closest("[data-studio-canvas-viewport]") && !el.closest("button,input,select,[role=dialog],[role=button]");
          }), {x1:left + (right-left)*.36,x2:left + (right-left)*.63,y:py});
          if (usable) return py;
        }
        return false;
      }, "화면에서 가려지지 않은 실제 원고를 찾지 못함", 20000);
      await page.mouse.move(left + (right-left) * 0.36, y);
      await page.mouse.down();
      try { await page.mouse.move(left + (right-left) * 0.63, y + 27, { steps: 18 }); }
      finally { await page.mouse.up(); }
      await page.mouse.move(0, 0);
      const data = await waitUntil(async () => {
        const found = await currentDocument(page);
        return found?.drawCount > 0 && found;
      }, "합성 획이 있는 영속 문서를 읽지 못함", 60000);

  return data;
}
