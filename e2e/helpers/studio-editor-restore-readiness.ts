import { expect, type Page } from "@playwright/test";

export interface StudioPageReadinessExpectation {
  readonly pageId: string;
  readonly elementCount: number;
  readonly renderedElementIds: readonly string[];
}

/** 접힌 그룹은 원고를 변경해 펼치지 않는다. 전체 내용은 기존 제품 JSON 검증이 확인한다. */
export function studioPageReadinessExpectation(page: Record<string, unknown>): StudioPageReadinessExpectation {
  if (typeof page.id !== "string" || !page.id || !Array.isArray(page.elements)) {
    throw new Error("복원 준비 검사의 페이지 식별자·요소가 없습니다.");
  }
  const collapsed = new Set<string>();
  for (const group of Array.isArray(page.groups) ? page.groups : []) {
    if (group && typeof group === "object" && typeof group.id === "string" && group.collapsed === true) {
      collapsed.add(group.id);
    }
  }
  const ids: string[] = [];
  const renderedElementIds: string[] = [];
  for (const element of page.elements) {
    if (!element || typeof element !== "object" || typeof element.id !== "string" || !element.id) {
      throw new Error("복원 준비 검사의 요소 식별자가 없습니다.");
    }
    ids.push(element.id);
    if (!collapsed.has(element.groupId)) renderedElementIds.push(element.id);
  }
  if (new Set(ids).size !== ids.length) throw new Error("복원 준비 검사의 요소 식별자가 중복됩니다.");
  return { pageId: page.id, elementCount: ids.length, renderedElementIds: renderedElementIds.sort() };
}

/** 실제 Host의 currentPageId와 activePage.elements에서 렌더된 DOM만 읽는다. 저장소는 읽지 않는다. */
export function readStudioPageReadiness() {
  // 안내 유무와 메모리 DOM을 같은 관측에서 읽어 두 evaluate 사이의 복원 시작 경합도 막는다.
  if (document.querySelector("[data-studio-recovery-notice]")) return [];
  return Array.from(document.querySelectorAll('[aria-label="전문 레이어 내비게이터"][data-page-key]'), (panel) => ({
    pageKey: panel.getAttribute("data-page-key"),
    heading: panel.querySelector('[data-studio-layer-list-header] h3')?.textContent?.trim() ?? null,
    renderedElementIds: Array.from(panel.querySelectorAll('[data-studio-layer-row="true"]'), (row) => row.id).sort(),
  }));
}

export function studioPageIsApplied(
  observed: ReturnType<typeof readStudioPageReadiness>,
  expected: StudioPageReadinessExpectation,
): boolean {
  if (observed.length !== 1) return false;
  const panel = observed[0];
  if (!panel) return false;
  // pageId 자체의 ':'를 보존한다. 실제 두 레이어 패널 suffix만 정확히 허용한다.
  if (panel.pageKey !== `${expected.pageId}:layers` && panel.pageKey !== `${expected.pageId}:split`) return false;
  if (panel.heading !== `레이어 ${expected.elementCount.toLocaleString("ko-KR")}`) return false;
  const ids = expected.renderedElementIds.map((id) => `studio-layer-${id}`).sort();
  return panel.renderedElementIds.length === ids.length
    && panel.renderedElementIds.every((id, index) => id === ids[index]);
}

export function readStudioRecoveryStatus() {
  const notices = document.querySelectorAll("[data-studio-recovery-notice]");
  const notice = notices[0];
  if (!notice) return { phase: "absent" as const, error: null };
  const error = notice.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
  if (notices.length !== 1) return { phase: "blocked" as const, error };
  if (notice.getAttribute("aria-busy") === "true") return { phase: "pending" as const, error };
  const restore = Array.from(notice.querySelectorAll("button")).find((button) =>
    /^(이어서 그리기|다시 이어 열기)$/u.test(button.textContent?.trim() ?? ""));
  return { phase: restore && !restore.disabled ? "manual" as const : "blocked" as const, error };
}

export function studioRecoveryStep(status: ReturnType<typeof readStudioRecoveryStatus>, manualRequested: boolean) {
  if (status.phase !== "manual") return status.phase;
  if (!manualRequested) return "request-manual";
  return status.error ? "manual-failed" : "manual-not-applied";
}

/** 자동 복원에는 버튼이 없다. 실패 후 명시 복원은 한 번만 요청하고, 거부·취소를 성공으로 보지 않는다. */
export async function restoreIfPrompted(page: Page, ready: () => Promise<boolean>): Promise<void> {
  let manualRequested = false;
  await expect.poll(async () => {
    const status = await page.evaluate(readStudioRecoveryStatus);
    const step = studioRecoveryStep(status, manualRequested);
    if (step === "request-manual") {
      manualRequested = true;
      await page.locator("[data-studio-recovery-notice]")
        .getByRole("button", { name: /^(이어서 그리기|다시 이어 열기)$/u }).click();
      return { phase: "manual-requested" };
    }
    if (step !== "absent") return { phase: step, error: status.error };
    return { phase: await ready() ? "ready" : "memory-pending" };
  }, { timeout: 60_000, message: "복원 안내가 끝나고 대상 원고가 편집기에 적용되어야 합니다." }).toEqual({ phase: "ready" });
}

export async function waitForStudioPageRestored(page: Page, expectedPage: Record<string, unknown>): Promise<void> {
  const expected = studioPageReadinessExpectation(expectedPage);
  await restoreIfPrompted(page, async () => studioPageIsApplied(await page.evaluate(readStudioPageReadiness), expected));
}
