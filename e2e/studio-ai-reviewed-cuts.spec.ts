import { readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { encryptUserAiVault } from "../apps/web/src/shared/ai/user-ai-crypto";
import { DEFAULT_USER_AI_ROUTING, EMPTY_AI_CONFIGURATION, EMPTY_AI_CONNECTION, USER_AI_VAULT_KEY } from "../apps/web/src/shared/ai/user-ai-types";

const fixtureOrigin = "https://storyboard-fixture.example.test";
const sessionId = "director-reviewed-fixture";
const passphrase = "local-fixture-unlock";
const routePath = `/studio/compose/${sessionId}`;

async function fixtureVault() {
  const connection = {
    ...EMPTY_AI_CONNECTION,
    id: "storyboard-fixture", label: "콘티 테스트 공급자", baseUrl: fixtureOrigin + "/v1",
    costPolicy: "user-funded-byok" as const,
    textModel: "", imageModel: "fixture-image", apiKey: "local-test-only",
    apiKeys: [{ id: "fixture-key", label: "로컬 대역", apiKey: "local-test-only", enabled: true, priority: 10 }],
    models: [{ id: "fixture-model", label: "테스트 이미지", model: "fixture-image", capability: "image" as const, enabled: true, priority: 10 }],
  };
  return encryptUserAiVault({
    ...EMPTY_AI_CONFIGURATION,
    connections: [connection], assignments: { ...EMPTY_AI_CONFIGURATION.assignments, image: connection.id },
    routing: { ...DEFAULT_USER_AI_ROUTING, mode: "manual" },
  }, passphrase);
}

test("기존 승인 컷을 보존하고 지정한 빈 컷만 참조 이미지로 제작한 뒤 취소·재시도한다", async ({ page, baseURL }, info) => {
  test.setTimeout(180_000);
  const original = await readFile("apps/web/public/favicon-32.png");
  const generated = await readFile("apps/web/public/favicon-96.png");
  const originalUrl = `data:image/png;base64,${original.toString("base64")}`;
  const scenes = ["APPROVED_A", "EMPTY_B", "SELECTED_C"].map((prompt, index) => ({
    frame: { x: 0, y: index * 210, width: 320, height: 196 }, bubbles: [],
    beatType: "escalation", summary: `역 플랫폼 ${index + 1}`, imagePrompt: prompt, aspect: "landscape", dialogue: "",
    continuity: { sceneId: prompt, characterNames: ["해온"], location: "폐역", props: { 수첩: "오른손" } },
    ...(index === 0 ? {
      imageDataUrl: originalUrl, selectedImageCandidateId: "approved", approvedImageCandidateId: "approved",
      imageCandidates: [{ id: "approved", imageDataUrl: originalUrl, inputFingerprint: "earlier-input", createdAt: "2026-01-01T00:00:00Z" }],
    } : {}),
  }));
  await page.addInitScript(({ vault, vaultKey, id, scenes, origin }) => {
    if (location.origin !== origin || localStorage.getItem(vaultKey)) return;
    localStorage.setItem(vaultKey, vault);
    localStorage.setItem("toonspectrum:studio-ai-comic-director:" + id, JSON.stringify({
      version: 1, id, title: "폐역의 수첩", stage: "direction", status: "ready", revision: 1,
      storyText: "세 컷으로 보여주는 폐역의 만남", characterDescription: "해온의 짙은 앞머리", scenes,
    }));
  }, { vault: await fixtureVault(), vaultKey: USER_AI_VAULT_KEY, id: sessionId, scenes, origin: new URL(baseURL!).origin });

  const requests: { prompt: string; originalReference: boolean }[] = [];
  let holdNext = false;
  let release: (() => void) | undefined;
  const appOrigin = new URL(baseURL!).origin;
  await page.route(url => ["http:", "https:"].includes(url.protocol) && url.origin !== appOrigin, async route => {
    const url = new URL(route.request().url());
    if (url.origin !== fixtureOrigin) return route.abort();
    const headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(url.pathname).toBe("/v1/images/edits");
    const data = await new Response(new Uint8Array(route.request().postDataBuffer()!), {
      headers: { "content-type": route.request().headers()["content-type"]! },
    }).formData();
    const blob = [...data.values()].find(value => typeof value !== "string");
    const reference = blob && Buffer.from(await blob.arrayBuffer());
    requests.push({ prompt: String(data.get("prompt")), originalReference: !!reference?.equals(original) });
    if (holdNext) {
      holdNext = false;
      await new Promise<void>(resolve => { release = resolve; });
    }
    await route.fulfill({ headers, json: { data: [{ b64_json: generated.toString("base64") }] } });
  });

  await page.goto("/settings/ai", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "고급 설정", exact: true }).click();
  await page.getByLabel("보관함 비밀번호 (12자 이상)").fill(passphrase);
  await page.getByRole("button", { name: "잠금 해제", exact: true }).click();
  await expect(page.getByText(/보관함 잠금을 해제했습니다/).first()).toBeVisible();
  // 새 문서 로드는 개인 키 보관함을 잠근다. 준비한 저장 세션은 같은 문서의 앱 라우터로 연다.
  await page.evaluate(path => {
    history.pushState({ ...history.state, idx: (history.state?.idx ?? 0) + 1 }, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, routePath);
  await page.getByRole("button", { name: "Studio에서 제작 계속" }).click();
  const dialog = page.getByRole("dialog", { name: "AI 코믹 디렉터", exact: true });
  const direction = dialog.getByRole("button", { name: /컷 연출/ });
  const checkbox = (n: number) => dialog.getByRole("checkbox", { name: `컷 ${n} 제작 선택` });
  const generate = dialog.getByRole("button", { name: "선택한 1컷 제작하기" });
  await direction.click();
  const vaultPassword = dialog.getByLabel("AI 보관함 비밀번호");
  if (await vaultPassword.isVisible()) {
    await vaultPassword.fill("incorrect-fixture-passphrase");
    await dialog.getByRole("button", { name: "이 원고에서 잠금 해제" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "비밀번호를 확인하세요" })).toBeVisible();
    expect(requests).toHaveLength(0);
    await vaultPassword.fill(passphrase);
    await dialog.getByRole("button", { name: "이 원고에서 잠금 해제" }).click();
    await expect(vaultPassword).toBeHidden();
  }
  await expect(checkbox(1)).not.toBeChecked();
  await expect(checkbox(2)).toBeChecked();
  await expect(checkbox(3)).toBeChecked();
  await dialog.getByRole("button", { name: "선택 해제" }).click();
  await checkbox(3).check();
  await generate.click();
  const confirm = page.getByRole("button", { name: "이해했어요, 생성하기" });
  await confirm.click();
  await expect.poll(() => requests.length).toBe(2);
  const cancel = dialog.getByRole("button", { name: "취소", exact: true });
  await expect(cancel).toBeHidden();
  expect(requests.every(item => item.originalReference && item.prompt.includes("SELECTED_C")
    && item.prompt.includes("폐역") && item.prompt.includes("해온") && item.prompt.includes("수첩 (오른손)"))).toBe(true);

  await direction.click();
  await dialog.getByRole("button", { name: "그림 없는 컷 선택" }).click();
  await expect(checkbox(2)).toBeChecked();
  await expect(checkbox(3)).not.toBeChecked();
  holdNext = true;
  await generate.click();
  if (await confirm.isVisible()) await confirm.click();
  try {
    await expect.poll(() => requests.length).toBe(3);
    await cancel.click();
  } finally {
    release?.();
  }
  await expect(cancel).toBeHidden();
  await direction.click();
  await expect(checkbox(2)).toBeChecked();
  await expect(checkbox(1)).not.toBeChecked();
  await generate.click();
  if (await confirm.isVisible()) await confirm.click();
  await expect.poll(() => requests.length).toBe(5);
  await expect(cancel).toBeHidden();
  await direction.click();
  await expect(dialog.getByRole("button", { name: "그림 없는 컷 선택" })).toBeDisabled();
  expect(requests.slice(2).every(item => item.prompt.includes("EMPTY_B") && item.originalReference)).toBe(true);
  await expect(dialog.getByRole("list", { name: "컷 구성" }).locator("li").first().locator("img").first()).toHaveAttribute("src", originalUrl);
  const screenshot = info.outputPath("reviewed-cuts.png");
  const evidence = info.outputPath("generation-requests.json");
  await dialog.screenshot({ path: screenshot });
  await writeFile(evidence, JSON.stringify({
    cuts: requests.map(item => item.prompt.includes("SELECTED_C") ? 3 : 2),
    approvedReferenceMatches: requests.map(item => item.originalReference),
    completed: { approved: 1, generated: 2 }, cancelledRequest: 3,
  }, null, 2));
  await info.attach("reviewed-cuts.png", { path: screenshot, contentType: "image/png" });
  await info.attach("generation-requests.json", { path: evidence, contentType: "application/json" });
});
