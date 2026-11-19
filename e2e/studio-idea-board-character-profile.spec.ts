import { expect, test, type Page } from "@playwright/test";

import { createInitialStudioProjectDiagnosticSource } from "../apps/web/src/domains/creator/studio-project-diagnostic-source-defaults";
import { studioProjectDiagnosticSourceStorageKey } from "../apps/web/src/domains/creator/studio-project-diagnostic-source-store";

test("인물 메모를 미리 보고 한 작품의 기존 시트에만 저장한 뒤 게스트 탭을 다시 연다", async ({ page, context, baseURL }, info) => {
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
  await context.addInitScript(({ origin, seeds }) => {
    if (location.origin !== origin) return;
    for (const seed of seeds) {
      if (!localStorage.getItem(seed.key)) localStorage.setItem(seed.key, JSON.stringify(seed.value));
    }
  }, { origin: new URL(baseURL!).origin, seeds: sources });
  const href = `/studio/p/${project}/story?view=references&uiMode=focus`;
  await page.goto(href, { waitUntil: "domcontentloaded" });
  const board = page.getByRole("region", { name: "아이디어 보드" });
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
  const openCharacters = (tab: Page, projectId: string) =>
    tab.goto(`/studio/p/${projectId}/story?view=characters&uiMode=focus`, { waitUntil: "domcontentloaded" });
  const verifyProfile = async (tab: Page, name: string, profile: typeof original) => {
    await tab.getByRole("list", { name: "캐릭터 목록" }).getByRole("button", { name, exact: true }).click();
    const sheet = tab.getByRole("article", { name: name + " 시트" });
    await expect(sheet.getByLabel("배경 이야기")).toHaveValue(profile.background);
    await expect(sheet.getByLabel("성격")).toHaveValue(profile.personality);
    await expect(sheet.getByLabel("말투")).toHaveValue(profile.speechStyle);
    await expect(sheet.getByLabel(/바라는 것/)).toHaveValue(profile.motivation);
    await expect(sheet.getByLabel(/대표 대사/)).toHaveValue(profile.signatureLines.join("\n"));
    await expect(sheet.getByLabel("외형 메모")).toHaveValue(profile.appearanceNotes);
  };
  await openCharacters(page, project);
  await verifyProfile(page, "유리", original);
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await board.getByRole("checkbox", { name: new RegExp(memo) }).check();
  await board.getByLabel("이 작품의 인물").selectOption("yuri");
  await preview.click();
  await info.attach("적용할 메모", { body: await group.screenshot(), contentType: "image/png" });
  await group.getByRole("button", { name: "인물 시트에 추가" }).click();
  await expect(board.getByRole("status").filter({ hasText: /유리의 인물 시트를 이 기기에 저장/ })).toBeVisible();
  const reopened = await context.newPage();
  await page.close();
  await openCharacters(reopened, project);
  await verifyProfile(reopened, "유리", { ...original, background: result });
  await info.attach("다시 연 유리의 인물 시트", { body: await reopened.getByRole("article", { name: "유리 시트" }).screenshot(), contentType: "image/png" });
  await verifyProfile(reopened, "가온", { ...original, personality: "호기심" });
  await openCharacters(reopened, other);
  await verifyProfile(reopened, "유리", original);
  await verifyProfile(reopened, "가온", { ...original, personality: "호기심" });
  await reopened.goto(href, { waitUntil: "domcontentloaded" });
  await reopened.getByRole("checkbox", { name: new RegExp(memo) }).check();
  await reopened.getByLabel("이 작품의 인물").selectOption("yuri");
  await reopened.getByRole("button", { name: "고른 카드로 인물 시트 미리 보기" }).click();
  await expect(reopened.getByText("선택한 카드 내용이 이미 시트에 있어요.")).toBeVisible();
});
