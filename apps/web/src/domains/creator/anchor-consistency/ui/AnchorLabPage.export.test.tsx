// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { readStudioZipArchive } from "../../studio-zip-reader";
import { fakePngFile } from "../anchor-test-kit";
import { AnchorLabPage } from "./AnchorLabPage";
import {
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

function renderPage() {
  const decoder = createFakeDecoder();
  const exporter = createFakeExport();
  render(<AnchorLabPage deps={{ candidates: decoder.deps, export: exporter.deps }} />);
  return { decoder, exporter };
}

const zipButton = (): HTMLButtonElement => screen.getByRole("button", { name: /^ZIP (내려받기|만드는 중)/u }) as HTMLButtonElement;

describe("내려받기와 참조 팩", () => {
  it("세트가 갖춰지면 참조 팩 미리보기와 내려받기 버튼이 켜진다", async () => {
    renderPage();
    await prepareFullSet();
    expect(zipButton().disabled).toBe(false);
    expect(screen.getByText(tk("pack.usage", { character: 6, method: 0, total: 6, max: 16 }))).toBeTruthy();
    expect(screen.queryByText(tk("export.needIdentity"))).toBeNull();
  });

  it("ZIP 을 만들어 내려받고 완료를 알린다. ZIP 에는 이미지와 안내 파일이 들어 있다", async () => {
    const { exporter } = renderPage();
    await prepareFullSet();
    fireEvent.click(zipButton());
    await waitFor(() => { expect(screen.getByText(tk("export.done", { count: 10 }))).toBeTruthy(); });
    expect(exporter.buildZip).toHaveBeenCalledTimes(1);
    expect(exporter.download).toHaveBeenCalledTimes(1);
    const [blob, fileName] = exporter.download.mock.calls[0] ?? [];
    expect(fileName).toMatch(/^hero-01\.anchor-set\.[0-9a-f]{8}\.zip$/u);
    expect(blob).toBeInstanceOf(Blob);
    const archive = await readStudioZipArchive(blob as Blob);
    const paths = archive.entries.map((entry) => entry.path);
    expect(paths.filter((path) => path.startsWith("images/"))).toHaveLength(6);
    expect(paths).toEqual(expect.arrayContaining(["anchor-set.json", "rights.json", "reference-pack.json", "README.txt"]));
    const rights = JSON.parse(new TextDecoder().decode(await archive.readEntry("rights.json"))) as { confirmed: boolean; anchorId: string; sourceCharacterId: string };
    expect(rights).toMatchObject({ confirmed: true, anchorId: "hero-01", sourceCharacterId: "char-7" });
  });

  it("ZIP 을 만들지 못하면 다음 행동을 알리고 다시 시도할 수 있다", async () => {
    const { exporter } = renderPage();
    await prepareFullSet();
    exporter.buildZip.mockRejectedValueOnce(new Error("디스크 가득"));
    fireEvent.click(zipButton());
    await waitFor(() => { expect(screen.getByRole("alert").textContent).toBe(tk("export.error")); });
    expect(zipButton().disabled).toBe(false);
    fireEvent.click(zipButton());
    await waitFor(() => { expect(screen.getByText(tk("export.done", { count: 10 }))).toBeTruthy(); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("만드는 중에 취소하면 취소했다고 알리고 내려받지 않는다", async () => {
    const { exporter } = renderPage();
    await prepareFullSet();
    exporter.buildZip.mockImplementationOnce((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => { reject(new DOMException("중단", "AbortError")); });
    }));
    fireEvent.click(zipButton());
    const cancel = await screen.findByRole("button", { name: tk("export.cancel") });
    fireEvent.click(cancel);
    await waitFor(() => { expect(screen.getByText(tk("export.cancelled"))).toBeTruthy(); });
    expect(exporter.download).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: tk("export.cancel") })).toBeNull();
  });

  it("정면이 없으면 참조 팩 경고를 보여 준다", async () => {
    renderPage();
    await fillIdentity();
    confirmRights();
    fireEvent.change(screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.left") })), {
      target: { files: [fakePngFile("hero-01.left.0000000a.png", 768, 1152, 5)] },
    });
    await waitFor(() => { expect(screen.getAllByText(tk("slot.status.done"))).toHaveLength(1); });
    fireEvent.change(screen.getByLabelText(tk("slot.inputLabel", { angle: tk("angle.right") })), {
      target: { files: [fakePngFile("hero-01.right.0000000b.png", 768, 1152, 6)] },
    });
    await waitFor(() => { expect(screen.getByText(tk("pack.usage", { character: 2, method: 0, total: 2, max: 16 }))).toBeTruthy(); });
    expect(screen.getByText(tk("pack.warning.missingFront"))).toBeTruthy();
  });
});

describe("샷 포즈·구도 이미지", () => {
  it("샷 id 를 입력하기 전에는 이미지를 받지 않는다", async () => {
    renderPage();
    await prepareFullSet();
    expect((screen.getByLabelText(tk("shot.inputLabel", { kind: tk("shot.pose") })) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(tk("shot.needId"))).toBeTruthy();
  });

  it("올바르지 않은 샷 id 는 이유를 알린다", async () => {
    renderPage();
    await prepareFullSet();
    const input = screen.getByLabelText(tk("shot.id.label")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "../s1" } });
    expect(screen.getByRole("alert").textContent).toBe(tk("shot.id.error"));
    fireEvent.change(input, { target: { value: "s1" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("포즈·구도 이미지를 method 참조로 더하고 ZIP 의 shots 에 담는다", async () => {
    const { exporter } = renderPage();
    await prepareFullSet();
    fireEvent.change(screen.getByLabelText(tk("shot.id.label")), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText(tk("shot.inputLabel", { kind: tk("shot.pose") })), {
      target: { files: [fakePngFile("pose.png", 1024, 1024, 31)] },
    });
    fireEvent.change(screen.getByLabelText(tk("shot.inputLabel", { kind: tk("shot.composition") })), {
      target: { files: [fakePngFile("layout.png", 1024, 1024, 32)] },
    });
    await waitFor(() => { expect(screen.getByText(tk("pack.usage", { character: 6, method: 2, total: 8, max: 16 }))).toBeTruthy(); });
    fireEvent.click(zipButton());
    await waitFor(() => { expect(screen.getByText(tk("export.done", { count: 12 }))).toBeTruthy(); });
    const [blob] = exporter.download.mock.calls[0] ?? [];
    const archive = await readStudioZipArchive(blob as Blob);
    expect(archive.entries.filter((entry) => entry.path.startsWith("shots/")).map((entry) => entry.path.replace(/\.[0-9a-f]{8}\./u, "."))).toEqual([
      "shots/s1-pose.pose.png",
      "shots/s1-composition.composition.png",
    ]);
  });

  it("읽지 못한 샷 이미지는 이유를 알리고 비울 수 있다", async () => {
    renderPage();
    await prepareFullSet();
    fireEvent.change(screen.getByLabelText(tk("shot.id.label")), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText(tk("shot.inputLabel", { kind: tk("shot.pose") })), {
      target: { files: [new File([new Uint8Array(40)], "pose.png", { type: "image/png" })] },
    });
    const region = screen.getByRole("region", { name: tk("shot.title") });
    await waitFor(() => { expect(within(region).getByRole("alert").textContent).toBe(tk("captureError.unsupportedFormat")); });
    fireEvent.click(within(region).getByRole("button", { name: tk("shot.clearLabel", { kind: tk("shot.pose") }) }));
    expect(within(region).queryByRole("alert")).toBeNull();
  });
});
