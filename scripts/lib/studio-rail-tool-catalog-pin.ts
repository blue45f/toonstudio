import type { Locator, Page } from "playwright";

/** 실패한 도구의 공개 DOM만 보존한다. 텍스트·문서·저장 상태는 읽거나 바꾸지 않는다. */
export async function studioRailToolDiagnosticError(page: Page, id: string, error: unknown, catalogPinConfirmed = false): Promise<Error> {
  if (error instanceof Error && error.name === "StudioRailToolDiagnosticError") return error;
  let dom: unknown;
  try {
    dom = { catalogPinConfirmed, current: await page.evaluate((toolId) => {
      const states = [];
      for (const element of document.querySelectorAll<HTMLElement>(
        '[data-studio-tool-rail], [data-studio-catalog-tool-id], [data-studio-rail-tool-id]',
      )) {
        const catalogId = element.getAttribute("data-studio-catalog-tool-id");
        const railId = element.getAttribute("data-studio-rail-tool-id");
        if (catalogId && catalogId !== toolId) continue;
        const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
        states.push({ catalogId, railId, rail: element.hasAttribute("data-studio-tool-rail"),
          connected: element.isConnected, hidden: element.hidden, display: style.display, visibility: style.visibility,
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          pressed: element.getAttribute("aria-pressed"), disabled: element.getAttribute("aria-disabled"),
          pinPressed: catalogId ? element.parentElement?.querySelector('button[aria-pressed]')?.getAttribute("aria-pressed") ?? null : null });
        if (states.length >= 80) break;
      }
      return { toolId, states };
    }, id) };
  } catch (diagnosticError) { dom = { catalogPinConfirmed, unavailable: String(diagnosticError) }; }
  const failure = new Error(`${error instanceof Error ? error.message : String(error)}\n도구 고정 DOM: ${JSON.stringify(dom)}`, { cause: error });
  failure.name = "StudioRailToolDiagnosticError";
  return failure;
}

/** 이미 열린 분류 정문에서 ID로 검색하고 같은 행만 고정한다. 고정된 도구는 해제하지 않는다. */
export async function pinStudioRailToolInCatalog(catalog: Locator, id: string, entryTimeoutMs?: number): Promise<void> {
  try {
    await catalog.getByRole("searchbox", { name: "전체 도구 검색", exact: true }).fill(id);
    const entry = catalog.locator(`button[data-studio-catalog-tool-id="${id}"]`);
    if (entryTimeoutMs !== undefined) await entry.waitFor({ state: "visible", timeout: entryTimeoutMs });
    const row = entry.locator(".."), pin = row.locator("button[aria-pressed]");
    if (await pin.getAttribute("aria-pressed") !== "true") await pin.click();
    await row.locator('button[aria-pressed="true"]').waitFor({ state: "visible", timeout: entryTimeoutMs ?? 10_000 });
  } catch (error) { throw await studioRailToolDiagnosticError(catalog.page(), id, error); }
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
