import { errors, type Locator, type Page } from "playwright";

type PrepareStudioDrawingTarget = (timeoutMs: number) => Promise<void>;

interface DrawingReadinessOptions {
  /** 픽셀 증거에서만 접힌 안내의 그림자도 제외한다. 일반 조작 검증은 안내를 유지한다. */
  dismissCollapsedWelcome?: boolean;
  /** 빈 문서 진입/초기화에서는 지연 마운트될 안내의 실제 닫기까지 기다린다. */
  requireWelcome?: boolean;
  timeoutMs?: number;
}

async function reachDrawingUi(
  page: Page,
  { requireWelcome = false, timeoutMs = 60_000, dismissCollapsedWelcome = false }: DrawingReadinessOptions,
  target?: Locator,
  prepareTarget?: PrepareStudioDrawingTarget,
): Promise<{ welcomeDismissed: boolean }> {
  const deadline = Date.now() + timeoutMs;
  const welcome = page.locator(dismissCollapsedWelcome
    ? '[data-studio-cinematic-canvas-welcome]'
    : '[data-studio-cinematic-canvas-welcome="true"]');
  const beta = page.locator('[data-studio-beta-notice="true"]');
  const comic = page.locator('[data-studio-quick-comic-overlay="true"]');
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  // 요약·상세 안내만 정상 닫기 버튼으로 접는다. 남아 있는 작은 재진입 버튼은 작업을 막는 안내가 아니다.
  // compact 전환이 실제로 반영돼야 이 locator에서 사라지므로 클릭 성공만으로 준비 완료를 선언하지 않는다.
  const mobileNotice = page.locator('[data-testid="mobile-full-edit-notice"][data-studio-mobile-notice-compact="false"]');
  const overlays = [
    { surface: comic, close: comic.getByRole("button", { name: "빠른 웹툰 조립 취소", exact: true }) },
    { surface: mobileNotice, close: mobileNotice.getByRole("button", { name: "모바일 편집 안내 닫기", exact: true }) },
    { surface: beta, close: beta.locator('[data-studio-beta-notice-acknowledge="true"]') },
    { surface: welcome, close: welcome.getByRole("button", { name: "시작 안내 닫기", exact: true }) },
    { surface: quickstart, close: quickstart.locator('[data-studio-quickstart-dismiss="true"]') },
  ];
  const viewport = page.locator('[data-studio-canvas-viewport="true"]').first();
  const stage = page.locator(".konvajs-content").first();
  let welcomeDismissed = false;
  let welcomeCloseAttempted = false;
  let lastTimeout: Error | undefined;

  while (Date.now() < deadline) {
    try {
      // 위쪽 모달부터 한 번씩 처리하고 다시 조회한다. 클릭 중 나타난 안내도 다음 회차에 닫는다.
      let overlayVisible = false;
      for (const { surface, close } of overlays) {
        const visible = await surface.isVisible();
        // 정상 닫기 클릭 뒤 실제 숨김 전환을 확인한다. 응답 timeout만으로
        // 이미 닫힌 안내의 증거를 잃거나 처음부터 없는 안내를 성공 처리하지 않는다.
        if (surface === welcome && welcomeCloseAttempted && !visible) welcomeDismissed = true;
        if (!visible) continue;
        overlayVisible = true;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        if (surface === welcome) welcomeCloseAttempted = true;
        await close.click({ timeout: Math.min(1_000, remaining) });
        break;
      }
      if (
        !overlayVisible && (!requireWelcome || welcomeDismissed)
        && await viewport.isVisible() && await stage.isVisible()
      ) {
        // 가시성 조회 사이에 마운트된 안내를 놓치지 않는다.
        const blocked = await Promise.all(overlays.map(({ surface }) => surface.isVisible()));
        const remaining = deadline - Date.now();
        if (!blocked.some(Boolean) && remaining > 0) {
          if (target) {
            // 안내를 닫는 정상 클릭이 도크 메뉴도 접을 수 있어 매 시도마다 같은 예산 안에서 복구한다.
            if (prepareTarget) await prepareTarget(Math.min(1_000, remaining));
            const clickRemaining = deadline - Date.now();
            if (clickRemaining <= 0) break;
            await target.click({ timeout: Math.min(1_000, clickRemaining) });
          }
          if (Date.now() < deadline) return { welcomeDismissed };
        }
      }
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      lastTimeout = error;
      // 클릭은 처리됐지만 후속 탐색 대기만 timeout일 수 있다. 실제로 본 안내의 소멸만 인정한다.
      if (welcomeCloseAttempted && !(await welcome.isVisible())) welcomeDismissed = true;
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) await page.waitForTimeout(Math.min(100, remaining));
  }

  throw new Error(
    `Studio 그리기 UI 준비 시간 ${timeoutMs}ms 초과: 시작 안내 닫기와 캔버스 표시를 확인하세요. `
    + `안내 닫기=${welcomeDismissed}, 필수=${requireWelcome}`
    + (lastTimeout ? `, 마지막 UI 대기 오류: ${lastTimeout.message}` : "")
    + "\n복구 후 같은 verify:studio-brushes 또는 verify:studio-filter-dialog 명령을 다시 실행하세요.",
    { cause: lastTimeout },
  );
}

/** 호출마다 새 문서의 닫기 증거를 수집하며 이전 문서의 성공을 재사용하지 않는다. */
export async function waitForStudioDrawingReady(
  page: Page,
  options: DrawingReadinessOptions = {},
): Promise<{ welcomeDismissed: boolean }> {
  return reachDrawingUi(page, options);
}

/** 복구 정리가 문서를 바꿨다면 초기 안내의 닫기 증거를 폐기하고 같은 deadline 안에서 다시 닫는다. */
export async function prepareStudioDrawingUi(
  page: Page,
  clearRecovery: (timeoutMs: number) => Promise<boolean>,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const { welcomeDismissed } = await waitForStudioDrawingReady(page, { timeoutMs });
  const documentReset = await clearRecovery(Math.max(0, deadline - Date.now()));
  await waitForStudioDrawingReady(page, {
    requireWelcome: documentReset || !welcomeDismissed,
    timeoutMs: Math.max(0, deadline - Date.now()),
  });
}

/** 버튼이 새 안내에 가로막혀도 전체 deadline은 유지하며 정상 클릭만 재시도한다. */
export async function clickStudioControlAfterReadiness(
  page: Page,
  target: Locator,
  timeoutMs = 60_000,
  prepareTarget?: PrepareStudioDrawingTarget,
): Promise<void> {
  await reachDrawingUi(page, { timeoutMs }, target, prepareTarget);
}
