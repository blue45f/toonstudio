import type { Locator, Page } from "playwright";

const SAVE_TRIGGER = 'button[data-studio-drawing-save-summary="true"]';
const SAVE_DIALOG = 'dialog[data-studio-drawing-save-dialog="true"]';
const NOTICE = "[data-service-degraded-banner]";
const MODAL_NOTICE = '[data-service-status-placement="modal-slot"][data-service-degraded-banner]';
const titles = {
  warming: /온라인 기능을 연결하는 중이에요\.|Connecting online features\./u,
  degraded: /일부 온라인 기능을 잠시 사용할 수 없습니다\.|온라인 연결 상태를 다시 확인하고 있습니다\.|Some online features are temporarily unavailable\.|Rechecking the online connection\./u,
  recovered: /온라인 기능이 복구되었습니다\.|Online features are back\./u,
};

function requireEvidence(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`연결 안내 확인 실패: ${message}. 같은 verify:studio-brushes 명령으로 재검증하세요.`);
}

async function readLocalSave(trigger: Locator) {
  // 서버 연결과 별개인 실제 저장 authority를 읽는다. 과거 복구 시각을 현재 저장 성공으로 쓰지 않는다.
  const observation = await trigger.evaluate((node) => ({
    state: node.getAttribute("data-studio-local-save-state"),
    receiptDateTime: node.querySelector("[data-studio-clarity-receipt] time[datetime]")?.getAttribute("datetime") ?? null,
  }));
  requireEvidence(["saved", "pending", "failed", "empty", "readonly"].includes(observation.state ?? ""), "기기 저장 상태를 읽을 수 없음");
  if (observation.state === "saved") {
    requireEvidence(observation.receiptDateTime && Number.isFinite(Date.parse(observation.receiptDateTime))
      && Date.parse(observation.receiptDateTime) > 0, "저장됨 표시의 실제 완료 시각이 없음");
  }
  return observation;
}

async function readNotice(notice: Locator, timeout: number) {
  await notice.waitFor({ state: "visible", timeout });
  // 웜업→저하→복구 중에도 서로 다른 렌더의 종류와 문구를 섞지 않는다.
  const { tone, text, placement } = await notice.evaluate((node) => ({
    tone: node.getAttribute("data-service-degraded-banner"),
    text: node.textContent ?? "",
    placement: node.getAttribute("data-service-status-placement"),
  }), undefined, { timeout });
  requireEvidence(tone === "warming" || tone === "degraded" || tone === "recovered", "안내 종류가 없거나 알 수 없음");
  requireEvidence(titles[tone].test(text), "안내 종류에 맞는 실제 문구가 없음");
  return { tone, placement };
}

/** 접힌 연결 안내도 실제 저장 창으로 확인한다. 편집 모드·서비스 상태·문서는 바꾸지 않는다. */
export async function verifyStudioServiceStatusAccess(page: Page, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const value = deadline - Date.now();
    requireEvidence(value > 0, "안내 진입 시간 초과");
    return value;
  };
  // 기존 화면에 이미 보이는 안내를 우선한다. 숨겨진 상세 DOM의 존재만으로 통과하지 않는다.
  const visibleNotice = page.locator(`${NOTICE}:visible`).first();
  if (await visibleNotice.isVisible()) {
    return { surface: "visible-notice" as const, connection: await readNotice(visibleNotice, remaining()), localSave: null };
  }

  const trigger = page.locator(SAVE_TRIGGER);
  await trigger.waitFor({ state: "visible", timeout: remaining() });
  const localSaveBefore = await readLocalSave(trigger);
  await trigger.click({ timeout: remaining() });
  const dialog = page.locator(SAVE_DIALOG);
  let interactionFailed = false;
  let interactionFailure: unknown;
  let connection: Awaited<ReturnType<typeof readNotice>> | undefined;
  let localSave: Awaited<ReturnType<typeof readLocalSave>> | undefined;
  try {
    await dialog.waitFor({ state: "visible", timeout: remaining() });
    requireEvidence(/^(저장과 복구|Save and recovery)$/u.test(await dialog.getAttribute("aria-label") ?? ""), "저장과 복구 창이 아님");
    requireEvidence(await dialog.getAttribute("aria-modal") === "true", "실제 모달 진입을 확인할 수 없음");
    // native dialog를 열면 같은 host도 editor-details가 아닌 modal-slot으로 전환된다.
    const notice = dialog.locator(MODAL_NOTICE);
    await notice.waitFor({ state: "visible", timeout: remaining() });
    await notice.scrollIntoViewIfNeeded({ timeout: remaining() });
    connection = await readNotice(notice, remaining());
    if (connection.tone === "degraded") {
      await notice.getByRole("button", { name: /^(다시 확인|Check again|확인 중|Checking)$/u })
        .waitFor({ state: "visible", timeout: remaining() });
    }
    localSave = await readLocalSave(trigger);
  } catch (error) {
    interactionFailed = true;
    interactionFailure = error;
  }

  // 안내 오류와 별도로 실제 닫기를 시도하고 결과를 모은다. finally의 throw로 최초 오류를 덮지 않는다.
  let cleanupFailed = false;
  let cleanupFailure: unknown;
  try {
    if (await dialog.isVisible()) {
      await dialog.getByRole("button", { name: "저장 상태 닫기", exact: true }).click({ timeout: 5_000 });
      await dialog.waitFor({ state: "hidden", timeout: 5_000 });
      requireEvidence(await trigger.getAttribute("aria-expanded") === "false", "저장 상태 버튼이 열린 상태로 남음");
      requireEvidence(await trigger.evaluate((node) => node === node.ownerDocument.activeElement), "닫기 뒤 원래 저장 상태 버튼으로 초점이 돌아오지 않음");
    }
  } catch (error) {
    cleanupFailed = true;
    cleanupFailure = error;
  }
  if (interactionFailed && cleanupFailed) {
    const failures = [interactionFailure, cleanupFailure];
    // 최상위 verifier가 error.stack만 기록해도 두 원인이 보이도록 메시지에도 남긴다.
    const messages = failures.map((error) => error instanceof Error ? error.message : String(error)).join("\n");
    throw new AggregateError(failures, `연결 안내 확인과 저장 창 정리가 모두 실패했습니다.\n${messages}`, { cause: interactionFailure });
  }
  if (interactionFailed) throw interactionFailure;
  if (cleanupFailed) throw cleanupFailure;
  requireEvidence(connection && localSave, "안내 또는 기기 저장 관측 결과가 없음");
  return { surface: "save-dialog" as const, connection, localSaveBefore, localSave };
}
