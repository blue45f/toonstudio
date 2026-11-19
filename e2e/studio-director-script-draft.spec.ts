import { expect, test } from "@playwright/test";

test("게스트가 쓴 대본과 인물 기준을 창을 닫고 다시 열어 계속 편집한다", async ({ page, context }, info) => {
  await page.goto("/studio/compose/new", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/studio\/compose\/(?!new(?:$|\?))[^/?]+/);
  const url = page.url();
  const script = page.getByRole("textbox", { name: "이야기 또는 회차 대본" });
  const character = page.getByRole("textbox", { name: /캐릭터.*설명|인물.*설명|캐릭터.*기준/ }).first();
  const first = "폐역에 남은 두 사람. 해온은 수첩을 펴고 첫차 시간을 적는다.";
  const note = "해온은 귀 옆에 흰 머리핀을 꽂는다.";
  await script.fill(first);
  await character.fill(note);
  await page.getByRole("button", { name: "클라우드 저장", exact: true }).click();
  await expect(page.getByText(/로그인하면 AI 코믹 디렉터 세션을 클라우드에 저장/)).toBeVisible();
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto(url, { waitUntil: "domcontentloaded" });
  const resumed = reopened.getByRole("textbox", { name: "이야기 또는 회차 대본" });
  await expect(resumed).toHaveValue(first);
  await expect(reopened.getByRole("textbox", { name: /캐릭터.*설명|인물.*설명|캐릭터.*기준/ }).first()).toHaveValue(note);
  await resumed.fill(first + "\n복선은 세 번째 컷에서 드러난다.");
  await expect(reopened.getByText("로컬 자동 저장", { exact: true })).toBeVisible();
  await reopened.reload({ waitUntil: "domcontentloaded" });
  await expect(resumed).toHaveValue(first + "\n복선은 세 번째 컷에서 드러난다.");
  const screenshot = info.outputPath("대본-재열기.png");
  await reopened.screenshot({ path: screenshot });
  await info.attach("대본-재열기.png", { path: screenshot, contentType: "image/png" });
  await reopened.getByRole("button", { name: "Studio에서 제작 계속" }).click();
  const director = reopened.getByRole("dialog", { name: "AI 코믹 디렉터" });
  await director.getByRole("button", { name: /이야기·기준/ }).click();
  await expect(director.locator("#comic-director-story")).toHaveValue(first + "\n복선은 세 번째 컷에서 드러난다.");
});

for (const language of ["ko", "en"] as const) {
  test(`기기 저장 실패 후 입력한 대본을 다시 저장한다 (${language})`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(({ lang, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang }, version: 0 }));
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (msg, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (msg?.method === "kvSet" && msg.args[0] === "studio-director-drafts" && !sessionStorage.getItem("qa-director-device-write")) {
          queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: {
            version: msg.version, kind: "failure", requestId: msg.requestId,
            error: { name: "QuotaExceededError", message: "Test quota exceeded" },
          } })));
          return;
        }
        if (Array.isArray(transfer)) post.call(this, msg, { transfer });
        else post.call(this, msg, transfer);
      };
    }, { lang: language, origin: new URL(baseURL!).origin });
    await page.goto("/studio/compose/new", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/studio\/compose\/(?!new(?:$|\?))[^/?]+/);
    const script = page.getByRole("textbox", { name: "이야기 또는 회차 대본" });
    const text = "첫 차가 떠난 뒤, 창에 비친 간판만 남았다.\n다음 컷에는 간판을 가까이 잡는다.";
    await script.fill(text);
    const alert = page.getByRole("alert").filter({ hasText: language === "ko" ? "이 기기에 대본을 저장하지 못했습니다" : "Your script could not be saved on this device" });
    const retry = page.getByRole("button", { name: language === "ko" ? "이 기기에 다시 저장" : "Retry saving on this device" });
    await expect(alert).toBeVisible();
    await expect(page.getByText(language === "ko" ? "기기에 저장 안 됨" : "Not saved on this device", { exact: true })).toBeVisible();
    await retry.click();
    await expect(alert).toBeVisible();
    await expect(script).toHaveValue(text);
    await info.attach(`device-save-${language}.png`, { body: await page.screenshot(), contentType: "image/png" });
    await page.evaluate(() => sessionStorage.setItem("qa-director-device-write", "1"));
    await retry.click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText(language === "ko" ? "이 기기에 대본을 저장했습니다." : "Script saved on this device.", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(script).toHaveValue(text);
    await expect(alert).toHaveCount(0);
  });
}

test("기기 DB를 열 수 없을 때 새 대본만 집필하고 기존 대본은 복구할 때까지 보호한다", async ({ page, baseURL }) => {
  await page.addInitScript(origin => {
    if (location.origin !== origin) return;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, transfer?: Transferable[] | StructuredSerializeOptions) {
      if (msg?.kind === "initialize" && !sessionStorage.getItem("qa-director-open-allowed")) {
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: {
          version: msg.version, kind: "failure", requestId: msg.requestId,
          error: { name: "SqliteUnavailableError", message: "Test device storage unavailable" },
        } })));
        return;
      }
      if (Array.isArray(transfer)) post.call(this, msg, { transfer });
      else post.call(this, msg, transfer);
    };
  }, new URL(baseURL!).origin);
  await page.goto("/studio/compose/new", { waitUntil: "domcontentloaded" });
  const script = page.getByRole("textbox", { name: "이야기 또는 회차 대본" });
  const warning = page.getByRole("alert").filter({ hasText: "이 기기에 대본을 저장하지 못했습니다" });
  await expect(warning).toBeVisible();
  const text = "새 세션의 첫 문장은 저장소가 열리지 않아도 쓸 수 있다.";
  await script.fill(text);
  await page.getByRole("button", { name: "이 기기에 다시 저장" }).click();
  await expect(warning).toBeVisible();
  await expect(script).toHaveValue(text);
  await page.evaluate(() => sessionStorage.setItem("qa-director-open-allowed", "1"));
  await page.getByRole("button", { name: "이 기기에 다시 저장" }).click();
  await expect(page.getByText("이 기기에 대본을 저장했습니다.", { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem("qa-director-open-allowed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert").filter({ hasText: "이 기기의 대본을 열지 못했어요" })).toBeVisible();
  await expect(script).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("qa-director-open-allowed", "1"));
  await page.getByRole("button", { name: "대본 다시 열기", exact: true }).click();
  await expect(script).toHaveValue(text);
});
