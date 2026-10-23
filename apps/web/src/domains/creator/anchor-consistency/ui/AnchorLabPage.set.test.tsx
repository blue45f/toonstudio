// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { fakePngFile } from "../anchor-test-kit";
import { AnchorLabPage } from "./AnchorLabPage";
import {
  anchorFiles,
  confirmRights,
  createFakeDecoder,
  createFakeExport,
  fillIdentity,
  prepareFullSet,
  stubObjectUrls,
  tk,
} from "./anchor-lab-test-kit";

let urls: ReturnType<typeof stubObjectUrls>;
let previousLanguage = "";

beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  useI18n.setState({ lang: "ko" });
  urls = stubObjectUrls();
});

afterEach(() => {
  cleanup();
  urls.restore();
  useI18n.setState({ lang: previousLanguage });
});

function renderPage(options: { readonly strict?: boolean } = {}) {
  const decoder = createFakeDecoder();
  const exporter = createFakeExport();
  const page = <AnchorLabPage deps={{ candidates: decoder.deps, export: exporter.deps }} />;
  render(options.strict ? <StrictMode>{page}</StrictMode> : page);
  return { decoder, exporter };
}

const slotOf = (angle: string): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`[data-anchor-slot="${angle}"]`);
  if (!node) throw new Error(`${angle} 칸이 없어요`);
  return node;
};

describe("캐릭터 앵커 연구실 — 첫 화면과 한계 안내", () => {
  it("제목과 한계 안내를 접지 않고 보여 준다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: tk("header.title") })).toBeTruthy();
    const notice = screen.getByRole("complementary", { name: tk("limits.title") });
    expect(within(notice).getByText(tk("limits.score"))).toBeTruthy();
    expect(within(notice).getByText(tk("limits.noGuarantee"))).toBeTruthy();
    expect(within(notice).getByText(tk("limits.local"))).toBeTruthy();
    expect(within(notice).getByText(tk("limits.virtualOnly"))).toBeTruthy();
    expect(within(notice).getByText(tk("limits.stage"))).toBeTruthy();
  });

  it("화면 어디에도 일관성 보장이나 동일인 판정을 말하는 문구가 없다", () => {
    renderPage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/동일인|같은 캐릭터임을|일관성을 보장해요|일관성이 보장/u);
  });

  it("권리 확인 전에는 이미지를 받지 않고 이유를 알린다", () => {
    renderPage();
    const input = screen.getByLabelText(tk("set.dropAll.inputLabel"));
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText(tk("rights.locked")).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: tk("export.zip") }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(tk("export.needIdentity"))).toBeTruthy();
  });

  it("권리를 확인하면 이미지를 받을 수 있다", () => {
    renderPage();
    confirmRights();
    expect((screen.getByLabelText(tk("set.dropAll.inputLabel")) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.front") })) as HTMLInputElement).disabled).toBe(false);
  });
});

describe("앵커 식별자 입력", () => {
  it("올바르지 않은 id 는 입력란 아래에 이유와 예시를 알리고 입력은 그대로 둔다", () => {
    renderPage();
    const input = screen.getByLabelText(tk("identity.anchorId.label")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hero 01!" } });
    expect(input.value).toBe("Hero 01!");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe(tk("identity.anchorId.error"));
    fireEvent.change(input, { target: { value: "hero-01" } });
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("앵커 세트 만들기", () => {
  it("여섯 각도 파일을 한꺼번에 놓으면 각 칸에 읽혀 세트 해시가 나온다", async () => {
    renderPage();
    await prepareFullSet();
    expect(screen.getByText(tk("capture.finishedOk", { count: 6 }))).toBeTruthy();
    expect(screen.getByText(tk("completeness.clean"))).toBeTruthy();
    expect(screen.getByText(tk("completeness.usable"))).toBeTruthy();
    expect(screen.getByText(/세트 해시 [0-9a-f]{64}/u)).toBeTruthy();
    for (const angle of ["front", "left-34", "left", "back", "right", "right-34"]) {
      await waitFor(() => { expect(within(slotOf(angle)).getByRole("img").getAttribute("src")).toMatch(/^blob:anchor-test-/u); });
    }
    expect(screen.queryByText(tk("set.guessed", { count: 1 }))).toBeNull();
  });

  it("StrictMode(개발 모드 효과 재실행)에서도 읽기와 미리보기가 정상이다", async () => {
    renderPage({ strict: true });
    await prepareFullSet();
    await waitFor(() => { expect(within(slotOf("back")).getByRole("img").getAttribute("src")).toMatch(/^blob:anchor-test-/u); });
    expect(screen.getByText(tk("completeness.clean"))).toBeTruthy();
  });

  it("같은 파일을 같은 순서로 다시 놓아도 세트 해시가 같다", async () => {
    renderPage();
    await prepareFullSet();
    const first = screen.getByText(/세트 해시 [0-9a-f]{64}/u).textContent;
    fireEvent.change(screen.getByLabelText(tk("set.dropAll.inputLabel")), { target: { files: anchorFiles() } });
    await waitFor(() => { expect(screen.getByText(tk("capture.finishedOk", { count: 6 }))).toBeTruthy(); });
    expect(screen.getByText(/세트 해시 [0-9a-f]{64}/u).textContent).toBe(first);
  });

  it("파일 이름으로 각도를 짐작하면 확인을 요청하고, 정하지 못한 파일은 넣지 않고 개수를 알린다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const files = [
      fakePngFile("hero_front.png", 768, 1152, 1),
      fakePngFile("hero_back.png", 768, 1152, 2),
      fakePngFile("무제.png", 768, 1152, 3),
      fakePngFile("hero_front_copy.png", 768, 1152, 4),
    ];
    fireEvent.change(screen.getByLabelText(tk("set.dropAll.inputLabel")), { target: { files } });
    await waitFor(() => { expect(screen.getAllByText(tk("slot.status.done"))).toHaveLength(2); });
    expect(screen.getByText(tk("set.guessed", { count: 2 }))).toBeTruthy();
    expect(screen.getByText(tk("set.unassigned", { count: 2 }))).toBeTruthy();
    expect(within(slotOf("front")).getByText(tk("slot.status.done"))).toBeTruthy();
    expect(within(slotOf("left")).getByText(tk("slot.status.idle"))).toBeTruthy();
  });

  it("일부 각도만 있으면 빠진 각도와 짝 경고를 알리고, 정면이 없으면 참조 팩에 못 쓴다고 알린다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const left = fakePngFile("hero-01.left.0000000a.png", 768, 1152, 5);
    fireEvent.change(screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.left") })), { target: { files: [left] } });
    await waitFor(() => { expect(within(slotOf("left")).getByText(tk("slot.status.done"))).toBeTruthy(); });
    expect(screen.getByText(tk("completeness.partial", { present: 1, total: 6 }))).toBeTruthy();
    expect(screen.getByText(tk("completeness.notUsable"))).toBeTruthy();
    expect(screen.getByText(tk("completeness.issue.missingAngle", { angle: tk("angle.front") }))).toBeTruthy();
    expect(screen.getByText(tk("completeness.issue.missingMirrorPair", { angle: tk("angle.left"), related: tk("angle.right") }))).toBeTruthy();
  });

  it("읽지 못한 파일은 이유와 다음 행동을 알리고 칸을 비울 수 있다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const notImage = new File([new Uint8Array(80)], "메모.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.front") })), { target: { files: [notImage] } });
    const front = slotOf("front");
    await waitFor(() => { expect(within(front).getByRole("alert")).toBeTruthy(); });
    expect(within(front).getByRole("alert").textContent).toBe(tk("captureError.unsupportedFormat"));
    expect(within(front).getByText(tk("slot.status.failed"))).toBeTruthy();
    expect(screen.getByText(tk("capture.finishedPartial", { done: 0, failed: 1 }))).toBeTruthy();
    expect(screen.getByRole("button", { name: tk("capture.retryFailed") })).toBeTruthy();
    fireEvent.click(within(front).getByRole("button", { name: tk("slot.clearLabel", { angle: tk("angle.front") }) }));
    expect(within(front).getByText(tk("slot.status.idle"))).toBeTruthy();
    expect(within(front).queryByRole("alert")).toBeNull();
  });

  it("읽는 동안에는 새 파일을 받지 않고 진행을 알리며, 취소하면 그 칸이 취소 상태가 되어 다시 시도할 수 있다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const slow = fakePngFile("hero-01.front.0000000a.png", 768, 1152, 1);
    Object.defineProperty(slow, "arrayBuffer", { value: () => new Promise<ArrayBuffer>(() => undefined) });
    const frontInput = screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.front") })) as HTMLInputElement;
    fireEvent.change(frontInput, { target: { files: [slow] } });
    const cancel = await screen.findByRole("button", { name: tk("capture.cancel") });
    expect(screen.getByRole("progressbar", { name: tk("capture.progressLabel") })).toBeTruthy();
    expect(screen.getByText(tk("capture.running", { done: 0, total: 1 }))).toBeTruthy();
    expect(within(slotOf("front")).getByText(tk("slot.status.capturing"))).toBeTruthy();
    expect(frontInput.disabled).toBe(true);
    expect((screen.getByLabelText(tk("set.dropAll.inputLabel")) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(cancel);
    await waitFor(() => { expect(within(slotOf("front")).getByText(tk("slot.status.cancelled"))).toBeTruthy(); });
    expect(screen.getByText(tk("capture.cancelledNote", { done: 0 }))).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(frontInput.disabled).toBe(false);
    expect(screen.getByRole("button", { name: tk("capture.retryFailed") })).toBeTruthy();
    // 취소는 오류가 아니라서 경고(alert)가 아닌 안내(status)로 알린다.
    expect(within(slotOf("front")).queryByRole("alert")).toBeNull();
    expect(within(slotOf("front")).getByRole("status").textContent).toBe(tk("captureError.cancelled"));
  });

  it("실패한 칸만 다시 시도한다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const files = [fakePngFile("hero-01.front.0000000a.png", 768, 1152, 1), new File([new Uint8Array(80)], "hero-01.back.0000000b.png", { type: "image/png" })];
    fireEvent.change(screen.getByLabelText(tk("set.dropAll.inputLabel")), { target: { files } });
    await waitFor(() => { expect(screen.getByText(tk("capture.finishedPartial", { done: 1, failed: 1 }))).toBeTruthy(); });
    fireEvent.click(screen.getByRole("button", { name: tk("capture.retryFailed") }));
    await waitFor(() => { expect(screen.getByText(tk("capture.finishedPartial", { done: 0, failed: 1 }))).toBeTruthy(); });
    expect(within(slotOf("front")).getByText(tk("slot.status.done"))).toBeTruthy();
  });

  it("칸의 파일을 바꾸면 그 칸만 다시 읽는다", async () => {
    renderPage();
    await prepareFullSet();
    const before = within(slotOf("front")).getByRole("img").getAttribute("src");
    fireEvent.change(screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.front") })), {
      target: { files: [fakePngFile("hero-01.front.0000000a.png", 900, 1350, 77)] },
    });
    await waitFor(() => { expect(screen.getByText(tk("capture.finishedOk", { count: 1 }))).toBeTruthy(); });
    expect(within(slotOf("front")).getByText(tk("slot.meta", { width: 900, height: 1350, size: "1KB" }))).toBeTruthy();
    await waitFor(() => {
      const after = within(slotOf("front")).getByRole("img").getAttribute("src");
      expect(after).toMatch(/^blob:anchor-test-/u);
      expect(after).not.toBe(before);
    });
    expect(screen.getAllByText(tk("slot.status.done"))).toHaveLength(6);
  });

  it("같은 이미지가 두 칸에 있으면 확인 경고를 낸다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    const same = (name: string) => fakePngFile(name, 768, 1152, 9);
    fireEvent.change(screen.getByLabelText(tk("set.dropAll.inputLabel")), {
      target: { files: [same("hero-01.front.0000000a.png"), same("hero-01.back.0000000b.png")] },
    });
    await waitFor(() => { expect(screen.getAllByText(tk("slot.status.done"))).toHaveLength(2); });
    expect(screen.getByText(tk("completeness.issue.duplicateImage", { angle: tk("angle.back"), related: tk("angle.front") }))).toBeTruthy();
  });

  it("권리 확인을 해제하면 다시 이미지를 받지 않는다", async () => {
    renderPage();
    await prepareFullSet();
    confirmRights();
    expect((screen.getByLabelText(tk("set.dropAll.inputLabel")) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: tk("export.zip") }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(tk("export.needRights"))).toBeTruthy();
  });

  it("화면을 떠나면 만든 미리보기 URL 을 모두 해제한다", async () => {
    renderPage();
    await prepareFullSet();
    cleanup();
    expect(urls.revoked.length).toBeGreaterThanOrEqual(6);
  });
});
