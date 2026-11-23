import { STUDIO_RAIL_TOOL_CATALOG } from "../../apps/web/src/domains/creator/studio-app-settings";

import { studioMenuVerifierRail } from "./studio-menu-verifier-surface";
import { pinStudioRailToolFromCatalog } from "./studio-rail-tool-catalog-pin";
import { visibleStudioControl } from "./studio-shell-interactions";

import type { StudioRailToolId } from "../../apps/web/src/domains/creator/studio-app-settings";
import type { Page } from "playwright";

const log = (message: string) => console.log(`[verify-menus] ${message}`);

/** Pin the shipped first-run contract independently of the settings implementation. */
export const FIRST_RUN_RAIL_TOOL_IDS = [
  "select", "pen", "eraser", "fill", "marquee-rect", "smart-shape", "text", "image", "transform", "lasso",
] as const satisfies readonly StudioRailToolId[];

/** 현재 원고 셸은 고정한 도구와 별도로 이 여덟 명령 및 색상·레이어 진입을 표시한다. */
export const CLARITY_RAIL_TOOL_IDS = ["select", "pen", "eraser", "fill", "cut-split", "bubble", "bg3d", "pin-comment"] as const;

export const IMAGE_RAIL_ENTRY = { id: "image", label: "이미지·소재" } as const;

/** Every first-run tool and the specialized tools added below must remain reachable. */
const PERSISTENT_RAIL_TOOLS = [
  "선택 (V)",
  "펜 (B)",
  "지우개 (E)",
  // Fill: when no raster is selected the aria-label becomes the guard reason (still exposed).
  { anyOf: ["색 채우기 (G)", "래스터 이미지 레이어를 먼저 선택하세요."] },
  "사각 선택 (M)",
  "스마트 도형",
  "색 가져오기 (I / Alt+클릭)",
  "텍스트",
  "말풍선",
  IMAGE_RAIL_ENTRY.label,
] as const;

/** More uses catalogue names; the exposed rail also preserves its shortcut suffix. */
export const OPTIONAL_RAIL_TOOLS = [
  { id: "eyedropper", moreLabel: "색 가져오기", railLabel: "색 가져오기 (I / Alt+클릭)" },
  { id: "bubble", moreLabel: "말풍선", railLabel: "말풍선" },
  { id: "smart-shape", moreLabel: "스마트 도형", railLabel: "스마트 도형" },
  { id: "shape-rect", moreLabel: "사각형 도형", railLabel: "사각형 도형" },
  { id: "shape-ellipse", moreLabel: "타원 도형", railLabel: "타원 도형" },
  { id: "reference", moreLabel: "참고 이미지", railLabel: "참고 이미지" },
] as const satisfies readonly { id: StudioRailToolId; moreLabel: string; railLabel: string }[];

export async function assertRailTools(page: Page): Promise<string[]> {
  const rail = await studioMenuVerifierRail(page);
  const failures: string[] = [];
  const editor = await visibleStudioControl(page.locator('[data-studio-editor="true"]'), "Studio 편집기");
  const project = await editor.getAttribute("data-studio-drawing-clarity") === "true";
  // 여덟 명령과 별도 색상·레이어 진입을 모두 정확한 초기 재고와 누적 보존 검사에 포함한다.
  const firstRunIds = project
    ? [...CLARITY_RAIL_TOOL_IDS, "color", "layers"]
    : FIRST_RUN_RAIL_TOOL_IDS;

  const initialIds = await rail.locator("[data-studio-rail-tool-id]")
    .evaluateAll((tools) => tools.map((tool) => tool.getAttribute("data-studio-rail-tool-id")));
  if (initialIds.length !== firstRunIds.length || firstRunIds.some((id) => !initialIds.includes(id))) {
    failures.push(`좌측 레일 기본 도구 불일치: 기대 ${firstRunIds.join(", ")} / 실제 ${initialIds.join(", ")}`);
  }

  // Add through the actual More picker and retain every previous choice, including defaults.
  const expectedIds = new Set<string>(firstRunIds);
  if (project) {
    for (const label of ["색상", "레이어"]) {
      if (!await rail.getByRole("button", { name: label, exact: true }).isVisible()) failures.push(`기본 그리기 진입 누락: ${label}`);
    }
    // 이전 셸의 기본 열 도구도 생략하지 않는다. 현재 셸에서는 실제 분류 정문에서 고정해 계속 검증한다.
    for (const id of FIRST_RUN_RAIL_TOOL_IDS) {
      const tool = rail.locator(`[data-studio-rail-tool-id="${id}"]`);
      try {
        if (!await tool.isVisible()) {
          const entry = STUDIO_RAIL_TOOL_CATALOG.find(candidate => candidate.id === id);
          if (!entry) throw new Error(`도구 분류에 ${id}가 없습니다.`);
          await pinStudioRailToolFromCatalog(page, entry.label);
          await tool.waitFor({ state: "visible", timeout: 5_000 });
        }
      } catch (error) {
        failures.push(`기존 기본 도구 활성화 실패: ${id} (${error instanceof Error ? error.message : String(error)})`);
      }
      expectedIds.add(id);
    }
  }
  for (const { id, moreLabel, railLabel } of OPTIONAL_RAIL_TOOLS) {
    const tool = rail.locator(`[data-studio-rail-tool-id="${id}"]`);
    try {
      if (!(await tool.isVisible().catch(() => false))) {
        await pinStudioRailToolFromCatalog(page, moreLabel);
        await tool.waitFor({ state: "visible", timeout: 5_000 });
      }
      const exposedLabel = await tool.getAttribute("aria-label") ?? (await tool.innerText()).trim();
      if (exposedLabel !== railLabel) {
        failures.push(`좌측 레일 추가 도구 라벨 불일치: ${railLabel} / 실제: ${exposedLabel ?? "없음"}`);
      }
    } catch (error) {
      failures.push(
        `좌측 레일 추가 도구 활성화 실패: ${railLabel} (${error instanceof Error ? error.message : String(error)})`,
      );
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    expectedIds.add(id);
    for (const retainedId of expectedIds) {
      if (!(await rail.locator(`[data-studio-rail-tool-id="${retainedId}"]`).isVisible().catch(() => false))) {
        failures.push(`좌측 레일 도구가 ${moreLabel} 추가 뒤 사라짐: ${retainedId}`);
      }
    }
  }

  const expectedToolCount = expectedIds.size;
  const actualToolCount = await rail.locator("[data-studio-rail-tool-id]").count();
  if (actualToolCount < expectedToolCount) {
    failures.push(`좌측 레일 도구 누적 실패: 기대 최소 ${expectedToolCount} / 실제 ${actualToolCount}`);
  }
  for (const { id, railLabel } of OPTIONAL_RAIL_TOOLS) {
    const retained = await rail
      .locator(`[data-studio-rail-tool-id="${id}"]`)
      .isVisible()
      .catch(() => false);
    if (!retained) failures.push(`좌측 레일 추가 도구가 다음 선택 뒤 사라짐: ${railLabel}`);
  }

  const persistentTools = project
    ? ["선택", "펜", "지우개", "채우기", ...PERSISTENT_RAIL_TOOLS.slice(4)]
    : PERSISTENT_RAIL_TOOLS;
  for (const entry of persistentTools) {
    if (typeof entry === "string") {
      const byLabel = rail.getByRole("button", { name: entry, exact: true }).first();
      const byTitle = rail.locator(`[title="${entry}"]`).first();
      const visible =
        (await byLabel.isVisible().catch(() => false)) ||
        (await byTitle.isVisible().catch(() => false));
      if (!visible) {
        failures.push(`좌측 레일 도구 미노출: ${entry}`);
      }
      continue;
    }
    const ok = await Promise.any(
      entry.anyOf.map(async (label) => {
        const visible =
          (await rail.getByRole("button", { name: label, exact: true }).first().isVisible().catch(() => false)) ||
          (await rail.locator(`[title="${label}"]`).first().isVisible().catch(() => false));
        if (!visible) throw new Error("miss");
        return true;
      })
    ).catch(() => false);
    if (!ok) failures.push(`좌측 레일 도구 미노출: ${entry.anyOf.join(" | ")}`);
  }
  // Verify the real image action, not a hidden legacy label. An empty selection leaves the document unchanged.
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }),
      rail.locator(`[data-studio-rail-tool-id="${IMAGE_RAIL_ENTRY.id}"]`).click(),
    ]);
    await chooser.setFiles([]);
    log("  image rail action ok: real file chooser opens without changing the document");
  } catch (error) {
    failures.push(`이미지 도구 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}
