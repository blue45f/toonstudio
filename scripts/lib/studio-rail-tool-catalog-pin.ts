import type { Locator, Page } from "playwright";

/** 이미 열린 분류 정문에서 ID로 검색하고 같은 행만 고정한다. 고정된 도구는 해제하지 않는다. */
export async function pinStudioRailToolInCatalog(catalog: Locator, id: string, entryTimeoutMs?: number): Promise<void> {
  await catalog.getByRole("searchbox", { name: "전체 도구 검색", exact: true }).fill(id);
  const entry = catalog.locator(`button[data-studio-catalog-tool-id="${id}"]`);
  if (entryTimeoutMs !== undefined) await entry.waitFor({ state: "visible", timeout: entryTimeoutMs });
  const pin = entry.locator("..").locator("button[aria-pressed]");
  if (await pin.getAttribute("aria-pressed") !== "true") await pin.click();
}

/** 분류 정문에서 실제 검색을 거쳐 도구 실행 없이 고정 상태만 바꾼다. */
export async function pinStudioRailToolFromCatalog(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "전체 도구", exact: true }).click();
  const catalog = page.getByRole("dialog", { name: "전체 도구", exact: true });
  await catalog.getByRole("searchbox", { name: "전체 도구 검색", exact: true }).fill(label);
  await catalog.getByRole("button", { name: `${label} 고정`, exact: true }).click();
  await catalog.getByRole("button", { name: "전체 도구 닫기", exact: true }).click();
  await catalog.waitFor({ state: "hidden", timeout: 5_000 });
}
