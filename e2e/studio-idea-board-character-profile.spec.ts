import { expect, test } from "@playwright/test";

import { createInitialStudioProjectDiagnosticSource } from "../apps/web/src/domains/creator/studio-project-diagnostic-source-defaults";
import { studioProjectDiagnosticSourceStorageKey } from "../apps/web/src/domains/creator/studio-project-diagnostic-source-store";

test("인물 메모를 미리 보고 한 작품의 기존 시트에만 저장한 뒤 게스트 탭을 다시 연다", async ({ page, context }, info) => {
  test.setTimeout(180_000);
  const project = "idea-profile-qa";
  const other = "idea-profile-other";
  const original = {
    characterId: "yuri", background: "비가 많은 도시에 살았다.", personality: "신중함",
    speechStyle: "반말", motivation: "귀환", signatureLines: ["기다려."], appearanceNotes: "은색 안경",
  };
  const sources = [project, other].map(projectId => {
    const initial = createInitialStudioProjectDiagnosticSource(projectId, "2026-01-01T00:00:00.000Z");
    const character = { id: "yuri", name: "유리", aliases: [], defaultCostumeId: null, defaultAppearanceId: null };
    return {
      key: studioProjectDiagnosticSourceStorageKey(projectId), value: {
        ...initial, story: { ...initial.story, bible: { ...initial.story.bible, characters: [character, { ...character, id: "gaon", name: "가온" }] },
          narrative: { relations: [], profiles: [original, { ...original, characterId: "gaon", personality: "호기심" }] } },
      },
    };
  });
  // 기존 캐릭터가 등록된 두 작품이 사전 조건이다. 보드 메모는 아래 정식 입력으로 만든다.
  await context.addInitScript(seeds => { for (const seed of seeds) {
    if (!localStorage.getItem(seed.key)) localStorage.setItem(seed.key, JSON.stringify(seed.value));
  } }, sources);
  const href = `/studio/p/${project}/story?view=references&uiMode=focus`;
  await page.goto(href, { waitUntil: "domcontentloaded" });
  const board = page.getByRole("region", { name: "기획 무드보드" });
  const form = board.getByRole("form", { name: "카드 더하기" }).first();
  const memo = "비가 오면 안경을 여섯 번 닦는다.";
  await form.getByLabel("내용").fill(memo);
  await form.getByRole("button", { name: "카드 더하기", exact: true }).click();
  await board.getByRole("checkbox", { name: new RegExp(memo) }).check();
  await board.getByLabel("이 작품의 인물").selectOption("yuri");
  const preview = board.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" });
  await preview.click();
  const group = board.getByRole("group", { name: "인물 시트 미리 보기" });
  const result = original.background + "\n" + memo;
  await expect(group).toContainText(result);
  await group.getByRole("button", { name: "미리 보기 닫기" }).click();
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).story.narrative.profiles[0].background, sources[0]!.key);
  expect(before).toBe(original.background);
  await preview.click();
  await info.attach("적용할 메모", { body: await group.screenshot(), contentType: "image/png" });
  await group.getByRole("button", { name: "인물 시트에 추가" }).click();
  await expect(board.getByRole("status").filter({ hasText: /유리의 인물 시트를 이 기기에 저장/ })).toBeVisible();
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto(`/studio/p/${project}/story?view=characters&uiMode=focus`, { waitUntil: "domcontentloaded" });
  await expect(reopened.getByRole("textbox", { name: "배경 이야기" })).toHaveValue(result);
  await expect(reopened.getByRole("textbox", { name: "성격" })).toHaveValue(original.personality);
  const after = await reopened.evaluate(keys => keys.map(key => JSON.parse(localStorage.getItem(key)!).story.narrative.profiles), sources.map(source => source.key));
  expect(after[0]).toEqual([{ ...original, background: result }, sources[0]!.value.story.narrative.profiles[1]]);
  expect(after[1]).toEqual(sources[1]!.value.story.narrative.profiles);
  await info.attach("다시 연 유리의 인물 시트", { body: await reopened.getByRole("article", { name: "유리 시트" }).screenshot(), contentType: "image/png" });
  await reopened.goto(href, { waitUntil: "domcontentloaded" });
  await reopened.getByRole("checkbox", { name: new RegExp(memo) }).check();
  await reopened.getByLabel("이 작품의 인물").selectOption("yuri");
  await reopened.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }).click();
  await expect(reopened.getByText("선택한 카드 내용이 이미 시트에 있어요.")).toBeVisible();
});
