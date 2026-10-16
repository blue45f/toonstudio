/**
 * scripts/lib/studio-verify-render-settle.ts
 *
 * 브라우저 검증기가 "긴 세로 문서를 다시 그리는" 제품 동작(플랫폼 규격 적용·실행취소)과 그 직후의 입력을 기다리는 방법을
 * 한곳에 둔다.
 *
 * 왜 필요한가 (프로덕션 번들을 GPU 없는 헤드리스 Chromium 샌드박스에서 직접 쟀다)
 * - 캔버스 ▸ 현재 캔버스 · 네이버를 누르면 문서 높이가 1080px → 8348px 이 된다. 제품은 클릭 이벤트 안에서 React 커밋을 끝내고
 *   이어지는 requestAnimationFrame 에서 Konva 레이어를 다시 그린다. CPU 프로파일에서 시간 대부분이 캔버스 2D 의
 *   `restore`·`scale`·`drawImage` 호출(소프트웨어 래스터)이고 앱 코드는 1초도 안 쓴다. 렌더러 CPU 시간은 한 번 적용에
 *   6.6~9.1초(2026-10-16, 부하 평균 7), 18~20초(2026-10-15, 부하 평균 12~14)였고 대부분 메인 스레드다.
 * - 화면 이동은 없다. 클릭 구간의 CDP 탐색 이벤트(frameRequestedNavigation·frameNavigated·navigatedWithinDocument)는 0건이고
 *   URL 도 그대로다.
 * - Playwright(1.62.1)의 기본 click 은 입력을 보낸 뒤 (1) 페이지 안 hit-target 해제 evaluate 와 (2) Page.enable 왕복을 같은
 *   클릭 예산 안에서 기다린다. 로그에는 "waiting for scheduled navigations to finish" 로 보이지만 탐색이 아니라 메인
 *   스레드가 풀리기를 기다리는 것이라, 재렌더 시간이 4초 클릭 예산을 그대로 소진한다(같은 샌드박스에서 기본 click 이
 *   4.8~5.4초 뒤에야 돌아왔다). noWaitAfter 로 (1)(2)를 빼도 입력 확인 자체가 동기 렌더 뒤에 오므로(1.6~2.4초, 부하가 큰 날은
 *   2.5~13초) 클릭 예산을 재렌더 시간에 맞춰야 한다.
 * - GitHub 호스티드 러너에서는 같은 단계(메뉴 열기·네이버·카카오·실행취소 전체)가 13.4~14.7초에 끝나(실행 38754717566,
 *   38775768639, 38779668525) 4초 예산으로도 통과한다. 그 안에 재렌더가 세 번 들어 있어 예산에 거의 맞닿아 있고, 러너가 느린
 *   날이나 로컬·샌드박스처럼 렌더가 느린 환경에서만 `Timeout 4000ms exceeded` 로 드러난다.
 * - 문서가 8348px 로 남으면 이후 입력(도구 선택 등)도 같은 재그리기를 불러 4초 예산을 넘긴다. 그래서 이 단계는 검증의
 *   마지막에 두고, 입력 뒤마다 메인 스레드가 잠잠해지기를 기다린다.
 * 결과(문서 높이·거절 안내)·URL·실행취소 판정은 그대로이고, 기다리는 방법만 바뀐다. 현재 드로잉 유지와 한 번의 실행취소 복원
 * 계약은 느슨해지지 않는다. 눌러야 할 항목이 없으면 짧은 대기 뒤에 바로 실패한다(느린 입력 확인 예산을 쓰지 않는다).
 */
import type { Locator, Page } from "playwright";

/** 입력 확인·결과 대기·잠잠해짐 대기에 각각 쓰는 상한. 정상 흐름은 일부만 쓰고 실패할 때만 소진한다. */
export const STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS = 60_000;

/** 메뉴 클릭(지연 패널 마운트 등) 뒤 잠잠해지기를 기다리는 상한. 평소엔 1초 안팎이고, 계속 바쁜 러너에서는 이 한도까지만 쓰고 넘어간다. */
const MENU_CLICK_QUIET_TIMEOUT_MS = 15_000;

/**
 * 눌러야 할 항목이 보이기를 기다리는 상한. 항목의 유무는 렌더 비용과 무관하므로 입력 확인 예산(60초)과 따로 짧게 둔다.
 * 항목 이름이 바뀌거나 사라졌을 때 느린 클릭 예산을 통째로 쓰지 않고 곧바로 실패해 원인을 읽을 수 있게 한다.
 */
const TARGET_APPEAR_TIMEOUT_MS = 15_000;

/** 페이지 안 타이머를 이 주기로 돌려, 예정보다 늦게 도는 것으로 메인 스레드 점유를 알아챈다. */
const QUIET_POLL_INTERVAL_MS = 40;
/** 타이머 간격이 이 값을 넘으면 그 사이 메인 스레드가 막혀 있었던 것으로 본다. */
const BLOCKED_TICK_GAP_MS = 120;
/** 페이지가 한도까지 응답하지 않을 때 검증기가 멈추지 않도록 Node 쪽에서 덧붙이는 여유. */
const NODE_SIDE_GRACE_MS = 5_000;

export interface RendererQuietOptions {
  /** 점유가 없어야 하는 연속 구간(ms). 재그리기 사이의 짧은 틈(수십~200ms)을 넘겨 끝까지 기다리도록 1초를 기본으로 한다. */
  readonly quietMs?: number;
  /** 이 안에 잠잠해지지 않으면 false 로 돌아간다. 실패로 만들지 않고 다음 단계가 스스로 판정한다. */
  readonly timeoutMs?: number;
}

/**
 * 렌더러 메인 스레드가 `quietMs` 동안 막히지 않을 때까지 기다린다. 잠잠해졌으면 true, 한도를 넘겼으면 false.
 * 페이지 안에서 도는 콜백이므로 외부 값을 닫지 않고 인자로만 받는다(Playwright 가 소스 텍스트로 직렬화한다).
 * 페이지가 아예 응답하지 않아도 `timeoutMs` 에 Node 쪽 여유를 더한 시점에 false 로 돌아가, 검증기가 끝없이 멈추지 않는다.
 */
export async function waitForRendererQuiet(
  page: Page,
  { quietMs = 1_000, timeoutMs = STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS }: RendererQuietOptions = {},
): Promise<boolean> {
  const settled = page.evaluate(
    ({ quiet, timeout, interval, blockedGap }) => new Promise<boolean>((resolve) => {
      const startedAt = performance.now();
      let previousTickAt = startedAt;
      let lastBlockedAt = startedAt;
      const timer = setInterval(() => {
        const now = performance.now();
        if (now - previousTickAt > blockedGap) lastBlockedAt = now;
        previousTickAt = now;
        const quietSince = now - lastBlockedAt;
        if (quietSince >= quiet || now - startedAt >= timeout) {
          clearInterval(timer);
          resolve(quietSince >= quiet);
        }
      }, interval);
    }),
    { quiet: quietMs, timeout: timeoutMs, interval: QUIET_POLL_INTERVAL_MS, blockedGap: BLOCKED_TICK_GAP_MS },
  );
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const unresponsive = new Promise<boolean>((resolve) => {
    giveUp = setTimeout(() => resolve(false), timeoutMs + NODE_SIDE_GRACE_MS);
  });
  try {
    return await Promise.race([settled, unresponsive]);
  } finally {
    clearTimeout(giveUp);
  }
}

/**
 * 메뉴 항목처럼 눌러서 지연 패널 마운트·재렌더가 따라오는 대상을 누른다. 항목이 보이는지는 짧게 먼저 확인하고, 입력만 보낸 뒤
 * (noWaitAfter) 클릭 예산을 그 시간에 맞추고, 다음 대기·입력이 밀리지 않도록 메인 스레드가 잠잠해지기를 짧게 기다린다.
 * 기본 click 은 입력 뒤 렌더러 왕복을 같은 예산에서 기다려, 부하가 있으면 4초 예산이 `waiting for scheduled navigations to
 * finish` 단계에서 소진된다.
 */
export async function clickAndWaitForRenderer(page: Page, target: Locator): Promise<void> {
  await target.waitFor({ state: "visible", timeout: TARGET_APPEAR_TIMEOUT_MS });
  await target.click({ timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS, noWaitAfter: true });
  await waitForRendererQuiet(page, { timeoutMs: MENU_CLICK_QUIET_TIMEOUT_MS });
}

/**
 * 캔버스 메뉴의 플랫폼 규격 행을 눌러 "결과"를 기다린다: 문서 높이 표시가 목표값이 되거나(적용) 거절 안내가
 * 뜰 때까지. 결과가 끝내 없어도 여기서는 던지지 않는다. 호출자가 높이·안내·URL 을 읽어 판정한다.
 * 마지막에는 재렌더가 끝나 다음 입력과 URL 읽기가 밀리지 않도록 메인 스레드가 잠잠해지기를 기다린다.
 */
export async function selectCanvasResizeRow(
  page: Page,
  row: Locator,
  expectedHeight: number,
  authorityMessage: string,
): Promise<void> {
  await row.waitFor({ state: "visible", timeout: TARGET_APPEAR_TIMEOUT_MS });
  await row.click({ timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS, noWaitAfter: true });
  await page.waitForFunction(
    ({ height, message }) =>
      Boolean(document.querySelector(`span[aria-label="높이 ${height}px"]`))
      || [...document.querySelectorAll('[role="alert"]')].some((alert) => alert.textContent?.includes(message)),
    { height: expectedHeight, message: authorityMessage },
    { timeout: STUDIO_HEAVY_RENDER_SETTLE_TIMEOUT_MS },
  ).catch(() => undefined);
  await waitForRendererQuiet(page);
}
