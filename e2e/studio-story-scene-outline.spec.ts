import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`${width}px 대본에서 장면을 쓰고 둘째 회차를 다시 열어 작가실로 내보낸다`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto(`/studio/p/scene-outline-${width}/story?view=script&uiMode=focus`, { waitUntil: "domcontentloaded" });
    const script = page.getByRole("textbox", { name: "대본", exact: true });
    const panel = page.getByRole("region", { name: "내 대본" });
    const summary = (text: string) => panel.locator("summary").filter({ hasText: text });
    const saved = panel.getByText("이 기기에 대본 저장됨", { exact: true });
    const original = "첫 배가 떠나기 전에 돌아오겠다고 약속한다.";
    const synopsis = "사라진 배의 마지막 항로를 따라간다.";
    const title = "둘째 화 · 밀물";
    const scenes = [
      { title: "방파제 · 새벽", body: "해나가 사다리를 내린다.\n\n“지금이야.”" },
      { title: "무전실 · 아침", body: "무전기에서 잡음이 들린다." },
    ];
    await script.fill(original);
    await summary("작품 정보·줄거리 수정").click();
    await panel.getByLabel("시놉시스", { exact: true }).fill(synopsis);
    await panel.getByRole("button", { name: "회차 추가", exact: true }).click();
    await panel.getByLabel("회차 제목").fill(title);
    const preamble = "새벽 기록.";
    await script.fill(preamble);
    await summary("장면 구성").click();
    let expected = preamble;
    const headings = [];
    for (const [index, scene] of scenes.entries()) {
      const heading = `장면 ${index + 1} — ${scene.title}`;
      headings.push(heading);
      await panel.getByLabel("장면 제목 또는 장소·시간").fill(scene.title);
      await panel.getByLabel("행동·대사·연출 메모").fill(scene.body);
      await panel.getByRole("button", { name: "대본 끝에 장면 추가" }).click();
      expected += "\n\n" + heading + "\n" + scene.body;
      await expect(script).toHaveValue(expected);
      const link = panel.getByRole("button", { name: heading });
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await link.click();
      await expect(script).toBeFocused();
      expect(await script.evaluate(node => {
        const area = node as HTMLTextAreaElement;
        return area.value.slice(area.selectionStart, area.selectionEnd);
      })).toBe(heading);
    }
    await expect(saved).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(panel.getByLabel("회차 제목")).toHaveValue(title);
    await expect(script).toHaveValue(expected);
    await summary("장면 구성").click();
    await expect(panel.getByRole("list", { name: "대본의 장면 순서" }).getByRole("button")).toHaveCount(2);
    await info.attach("저장 후 다시 연 장면 구성", { body: await panel.getByRole("list", { name: "대본의 장면 순서" }).screenshot(), contentType: "image/png" });
    await summary("대본을 새 컷 계획으로 나누기 (선택)").click();
    const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Writer Room JSON" }).click()]);
    const file = await download.path();
    if (!file) throw new Error("작가실 JSON을 저장하지 못했습니다.");
    const exported = JSON.parse(await readFile(file, "utf8"));
    expect(exported.stages["episode-outline"].title).toBe(title);
    expect(exported.stages.synopsis.text).toBe(synopsis);
    expect(exported.stages.scenes.items.map((item: { heading: string }) => item.heading)).toEqual(["Scene 1", ...headings]);
    expect(exported.stages["dialogue-sfx"].dialogue).toContainEqual(expect.objectContaining({ text: "지금이야." }));
    await panel.getByLabel("회차 상태").selectOption("locked");
    await expect(panel.getByRole("button", { name: "대본 끝에 장면 추가" })).toBeDisabled();
    await panel.getByRole("button", { name: /^1화/u }).click();
    await expect(script).toHaveValue(original);
    await expect(saved).toBeVisible();
  });
}
