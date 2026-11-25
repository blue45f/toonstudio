import { expect, test } from "@playwright/test";

test("/create: local blueprint makes no AI requests; malformed mock stays local and preserves edits", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: {method: string; path: string; idempotency: string | undefined}[] = [];
  const unexpected: string[] = [];
  await context.route(url => /^https?:$/.test(url.protocol), async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.origin !== origin) {
      unexpected.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/api/studio-ai/chat" && method === "POST") {
      requests.push({method,path:url.pathname,idempotency:route.request().headers()["idempotency-key"]});
      return route.fulfill({ status: 200, json: {} });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({status: 503, json:{message:"local test; API blocked"}});
    return route.continue();
  });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  const disclosure = page.getByTestId("create-ai-blueprint-disclosure");
  await disclosure.locator("summary").click();
  await disclosure.getByRole("textbox", {name:"웹툰 아이디어 한 줄 입력"}).fill("새벽에 텅 빈 역에서 초록색 수첩을 발견한다");
  await disclosure.getByTestId("ai-blueprint-generate-btn").click();
  const result = disclosure.getByTestId("ai-blueprint-result-panel");
  await expect(result).toBeVisible();
  const title = result.getByRole("textbox", {name:/자동 제안 작품 제목/});
  await title.fill("합성 검수 원고 제목");
  await expect(title).toHaveValue("합성 검수 원고 제목");
  expect(requests).toHaveLength(0);
  const polish = result.getByRole("button", {name:"클라우드 AI 문장 윤문", exact:true});
  await polish.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(polish).toBeEnabled();
  await expect(title).toHaveValue("합성 검수 원고 제목");
  expect(requests).toHaveLength(1);
  expect(requests[0].idempotency).toBeTruthy();
  await expect(result.getByRole("status")).not.toContainText("클라우드 AI 윤문 적용됨");
  await test.info().attach("mock-network-record.json", {body:JSON.stringify({requests:requests.map(x=>({method:x.method,path:x.path,idempotencyPresent:!!x.idempotency})),externalBlocked: [...new Set(unexpected)], persisted: "not tested"},null,2),contentType:"application/json"});
});

for (const editDuringRequest of [true, false]) {
test(editDuringRequest
  ? "/create: 진행 중 바꾼 제목·대사와 새 컷을 늦은 윤문 응답이 덮지 않는다"
  : "/create: 요청 후 수정하지 않은 초안에는 정상 윤문을 적용한다",
async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  let requests = 0;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await context.route(url => /^https?:$/.test(url.protocol), async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/studio-ai/chat" && route.request().method() === "POST") {
      requests += 1;
      await blocked;
      return route.fulfill({ json: { provider: "anthropic", model: "mock-test-model", content: JSON.stringify({
        title: "늦은 응답의 제목", logline: "격리 브라우저 시험", cuts: [],
      }) } });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({status: 503, json:{message:"local test; API blocked"}});
    return route.continue();
  });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  const disclosure = page.getByTestId("create-ai-blueprint-disclosure");
  await disclosure.locator("summary").click();
  await disclosure.getByRole("textbox", {name:"웹툰 아이디어 한 줄 입력"}).fill("새벽에 텅 빈 역에서 초록색 수첩을 발견한다");
  await disclosure.getByTestId("ai-blueprint-generate-btn").click();
  const result = disclosure.getByTestId("ai-blueprint-result-panel");
  const title = result.getByRole("textbox", {name:/자동 제안 작품 제목/});
  const cuts = result.getByRole("list", {name:"생성된 컷 콘티 목록"});
  const dialogue = cuts.getByLabel("말풍선 대사").first();
  await title.fill("요청을 시작할 때의 제목");
  await result.getByRole("button", {name:"클라우드 AI 문장 윤문", exact:true}).click();
  try {
    await expect.poll(() => requests).toBe(1);
    if (editDuringRequest) {
      await title.fill("응답을 기다리면서 쓴 제목");
      await dialogue.fill("기다리면서 수정한 합성 대사");
      await result.getByRole("button", {name:"컷 추가", exact:true}).click();
      await expect(title).toHaveValue("응답을 기다리면서 쓴 제목");
      await expect(cuts.getByRole("listitem")).toHaveCount(5);
    }
  } finally {
    release?.();
  }
  await expect(result.getByRole("button", {name:"클라우드 AI 문장 윤문", exact:true})).toBeEnabled({timeout:5000});
  await test.info().attach("delayed-mock-title.json", {body: JSON.stringify({
    requests, editDuringRequest, actualTitle: await title.inputValue(),
    dialogue: await dialogue.inputValue(), cuts: await cuts.getByRole("listitem").count(),
  }, null, 2), contentType:"application/json"});
  if (editDuringRequest) {
    await expect(title).toHaveValue("응답을 기다리면서 쓴 제목", {timeout:3500});
    await expect(dialogue).toHaveValue("기다리면서 수정한 합성 대사");
    await expect(cuts.getByRole("listitem")).toHaveCount(5);
    await expect(result.getByRole("status")).toContainText("지금 작성한 내용을 유지했어요.");
  } else {
    await expect(title).toHaveValue("늦은 응답의 제목");
    await expect(cuts.getByRole("listitem")).toHaveCount(4);
  }
  expect(requests).toBe(1);
});
}
