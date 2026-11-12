// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { verifyStudioServiceStatusAccess } from "./studio-drawing-readiness-service-status";

import type { Page } from "playwright";

afterEach(() => document.body.replaceChildren());

function fixture({ tone = "warming", visible = false, missing = false, localState = "empty", receipt = null, restoreFocus = true }:
  { tone?: string; visible?: boolean; missing?: boolean; localState?: string; receipt?: string | null; restoreFocus?: boolean } = {}) {
  const actions: string[] = [];
  document.body.innerHTML = `<button data-studio-drawing-save-summary="true" aria-expanded="false"></button>
    <dialog hidden data-studio-drawing-save-dialog="true" aria-label="저장과 복구"><button aria-label="저장 상태 닫기"></button></dialog>`;
  const trigger = document.querySelector("button")!;
  trigger.setAttribute("data-studio-local-save-state", localState);
  if (receipt) {
    const span = document.createElement("span"); span.dataset.studioClarityReceipt = "true";
    const time = document.createElement("time"); time.dateTime = receipt; span.append(time); trigger.append(span);
  }
  const dialog = document.querySelector("dialog")!;
  const close = dialog.querySelector("button")!;
  const notice = document.createElement("div"); notice.dataset.serviceDegradedBanner = tone;
  notice.textContent = tone === "warming" ? "온라인 기능을 연결하는 중이에요."
    : tone === "degraded" ? "일부 온라인 기능을 잠시 사용할 수 없습니다."
      : "온라인 기능이 복구되었습니다.";
  if (tone === "degraded") {
    const retry = document.createElement("button"); retry.textContent = "다시 확인"; notice.append(retry);
  }
  if (visible) document.body.append(notice);
  else if (!missing) { notice.dataset.serviceStatusPlacement = "editor-details"; dialog.append(notice); }
  trigger.onclick = () => {
    actions.push("open"); dialog.hidden = false; dialog.open = true; dialog.setAttribute("aria-modal", "true");
    trigger.setAttribute("aria-expanded", "true"); notice.dataset.serviceStatusPlacement = "modal-slot"; close.focus();
  };
  close.onclick = () => {
    actions.push("close"); dialog.hidden = true; dialog.open = false; trigger.setAttribute("aria-expanded", "false");
    notice.dataset.serviceStatusPlacement = "editor-details";
    if (restoreFocus) trigger.focus();
  };
  const isVisible = (node: Element | null) => Boolean(node?.isConnected && !node.closest("[hidden]"));
  // 실제 click만 slot 전이와 닫기를 일으킨다. DOM 주입/강제 클릭/API 재시도 메서드는 제공하지 않는다.
  const locator = (find: () => HTMLElement | null): object => ({
    first: () => locator(find),
    isVisible: async () => isVisible(find()),
    waitFor: async ({ state }: { state: string }) => {
      expect(["visible", "hidden"]).toContain(state);
      if (isVisible(find()) !== (state === "visible")) throw new Error(`visibility:${state}`);
    },
    click: async (options: { timeout: number }) => {
      expect(Object.keys(options)).toEqual(["timeout"]);
      if (!isVisible(find())) throw new Error("hidden-click");
      find()!.click();
    },
    getAttribute: async (name: string) => find()?.getAttribute(name) ?? null,
    innerText: async () => find()?.textContent ?? "",
    evaluate: async (callback: (node: HTMLElement) => unknown) => callback(find()!),
    scrollIntoViewIfNeeded: async () => { expect(isVisible(find())).toBe(true); actions.push("read-connection"); },
    locator: (selector: string) => locator(() => find()?.querySelector<HTMLElement>(selector) ?? null),
    getByRole: (role: string, { name }: { name: string | RegExp }) => {
      expect(role).toBe("button");
      return locator(() => Array.from(find()?.querySelectorAll("button") ?? []).find((button) => {
        const label = button.getAttribute("aria-label") ?? button.textContent ?? "";
        return typeof name === "string" ? label === name : name.test(label);
      }) ?? null);
    },
  });
  const page = { locator: (selector: string) => locator(() => {
    if (selector.endsWith(":visible")) return Array.from(document.querySelectorAll<HTMLElement>(selector.slice(0, -8))).find(isVisible) ?? null;
    return document.querySelector<HTMLElement>(selector);
  }) } as unknown as Page;
  return { page, actions, trigger, dialog, notice };
}

describe("브러시 검증의 실제 연결 안내 진입", () => {
  it("보이는 안내가 있으면 저장 창을 불필요하게 열지 않는다", async () => {
    const f = fixture({ visible: true, tone: "degraded" });
    expect(await verifyStudioServiceStatusAccess(f.page)).toMatchObject({ surface: "visible-notice", connection: { tone: "degraded" }, localSave: null });
    expect(f.actions).toEqual([]);
  });

  it.each(["warming", "degraded", "recovered"])("%s는 실제 저장 창의 modal-slot을 읽고 닫아 초점을 복구한다", async (tone) => {
    const f = fixture({ tone });
    expect(await verifyStudioServiceStatusAccess(f.page)).toMatchObject({ surface: "save-dialog", connection: { tone, placement: "modal-slot" }, localSave: { state: "empty", receiptDateTime: null } });
    expect(f.actions).toEqual(["open", "read-connection", "close"]);
    expect(document.activeElement).toBe(f.trigger);
    expect(f.dialog.isConnected).toBe(true);
    expect(f.dialog.hidden).toBe(true);
  });

  it.each(["pending", "failed", "readonly"])("온라인 복구를 기기 저장 %s의 성공으로 바꾸지 않는다", async (localState) => {
    const f = fixture({ tone: "recovered", localState });
    expect(await verifyStudioServiceStatusAccess(f.page)).toMatchObject({ connection: { tone: "recovered" }, localSave: { state: localState, receiptDateTime: null } });
  });

  it("실제 완료 시각이 있는 기기 저장은 온라인 연결 중과 병존한다", async () => {
    const receipt = "2026-11-12T16:00:00.000Z";
    const f = fixture({ localState: "saved", receipt });
    expect(await verifyStudioServiceStatusAccess(f.page)).toMatchObject({ connection: { tone: "warming" }, localSave: { state: "saved", receiptDateTime: receipt } });
  });

  it.each([null, "not-a-date"])("완료 시각 %s만으로 저장 성공을 인정하지 않는다", async (receipt) => {
    const f = fixture({ localState: "saved", receipt });
    await expect(verifyStudioServiceStatusAccess(f.page)).rejects.toThrow("실제 완료 시각이 없음");
    expect(f.actions).toEqual([]);
  });

  it("상세 안내가 사라졌으면 실패하며 열린 창은 실제 닫기로 정리한다", async () => {
    const f = fixture({ missing: true });
    await expect(verifyStudioServiceStatusAccess(f.page)).rejects.toThrow("visibility:visible");
    expect(f.actions).toEqual(["open", "close"]);
  });

  it("저하 상태의 다시 확인 행동이 없으면 안내 문구만으로 통과하지 않는다", async () => {
    const f = fixture({ tone: "degraded" }); f.notice.querySelector("button")!.remove();
    await expect(verifyStudioServiceStatusAccess(f.page)).rejects.toThrow("visibility:visible");
    expect(f.actions.at(-1)).toBe("close");
  });

  it("알 수 없는 상태나 문구가 다른 안내는 통과하지 않는다", async () => {
    const unknown = fixture({ tone: "other", visible: true });
    await expect(verifyStudioServiceStatusAccess(unknown.page)).rejects.toThrow("알 수 없음");
    const wrong = fixture(); wrong.notice.textContent = "이 기기에 저장됨";
    await expect(verifyStudioServiceStatusAccess(wrong.page)).rejects.toThrow("실제 문구가 없음");
    expect(wrong.actions.at(-1)).toBe("close");
  });

  it("닫기 뒤 초점 복귀 실패를 안내 확인 성공으로 덮지 않는다", async () => {
    const f = fixture({ restoreFocus: false });
    await expect(verifyStudioServiceStatusAccess(f.page)).rejects.toThrow("초점이 돌아오지 않음");
  });

  it("안내 확인과 닫기 초점이 함께 실패해도 최초 원인과 정리 오류를 모두 보존한다", async () => {
    const f = fixture({ missing: true, restoreFocus: false });
    const failure = await verifyStudioServiceStatusAccess(f.page).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toMatchObject({ errors: [
      { message: expect.stringContaining("visibility:visible") },
      { message: expect.stringContaining("초점이 돌아오지 않음") },
    ] });
    expect(failure).toMatchObject({ message: expect.stringMatching(/visibility:visible[\s\S]*초점이 돌아오지 않음/u) });
    expect(f.actions).toEqual(["open", "close"]);
    expect(f.dialog.hidden).toBe(true);
  });

  it("새 helper와 test는 기존 PR/main 경로 범위에 들어가며 원래 브러시 gate가 호출한다", () => {
    const workflow: unknown = parse(readFileSync(resolve(__dirname, "../../.github/workflows/studio-brush-filter-stability.yml"), "utf8"));
    expect(workflow).toMatchObject({ on: {
      pull_request: { paths: expect.arrayContaining(["scripts/lib/studio-drawing-readiness*"]) },
      push: { paths: expect.arrayContaining(["scripts/lib/studio-drawing-readiness*"]) },
    } });
    const source = readFileSync(resolve(__dirname, "../verify-studio-brushes.mts"), "utf8");
    expect(source).toContain("await verifyStudioServiceStatusAccess(page)");
    expect(source).not.toContain('page.locator("[data-service-degraded-banner]").first().waitFor');
  });
});
