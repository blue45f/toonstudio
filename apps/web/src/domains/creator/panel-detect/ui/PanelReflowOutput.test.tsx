// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  STUDIO_IMPORT_HANDOFF_QUERY_KEY,
  clearStudioImportHandoffsForTests,
  consumeStudioImportHandoff,
} from "../../studio-import-handoff";
import { parseStudioProjectFile } from "../../studio-project-file";
import { readStudioZipArchive } from "../../studio-zip-reader";
import { fakeCanvasWorld } from "../panel-detect-test-doubles";
import { PanelRenderError } from "../panel-render-core";

import { PanelReflowFlow } from "./PanelReflowFlow";
import { createKit, renderWithEnv, sampleReady, type Kit, type KitOverrides } from "./panel-ui-test-kit";

const CONFIRM = /위 변경 사항을 확인했고/;

function renderFlow(overrides: KitOverrides = {}): { readonly kit: Kit } {
  const kit = createKit(overrides);
  renderWithEnv(<PanelReflowFlow ready={sampleReady()} previewUrl="blob:preview" />, kit.env);
  return { kit };
}

const button = (name: string | RegExp): HTMLButtonElement => {
  const element = screen.getByRole("button", { name });
  if (!(element instanceof HTMLButtonElement)) throw new Error("단추가 아니에요.");
  return element;
};

/** 감지를 마치고 재배열 설정 화면(3단계)까지 간다. */
async function openReflowStep(overrides: KitOverrides = {}): Promise<{ readonly kit: Kit; readonly heading: HTMLElement }> {
  const { kit } = renderFlow(overrides);
  await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
  fireEvent.click(button(/다음: 세로 재배열 설정/));
  const heading = await screen.findByRole("heading", { name: "3. 세로 스트립으로 재배열" });
  return { kit, heading };
}

function totalHeight(): number {
  const text = screen.getAllByRole("status").map((node) => node.textContent ?? "").find((value) => value.includes("총 높이")) ?? "";
  const match = /총 높이 ([\d,]+)px/u.exec(text);
  if (!match?.[1]) throw new Error(`총 높이를 읽지 못했어요: ${text}`);
  return Number(match[1].replaceAll(",", ""));
}

const confirmBox = (): HTMLInputElement => {
  const element = screen.getByRole("checkbox", { name: CONFIRM });
  if (!(element instanceof HTMLInputElement)) throw new Error("체크박스가 아니에요.");
  return element;
};

function locationText(): string {
  return screen.getByTestId("location").textContent ?? "";
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => {
  vi.restoreAllMocks();
  clearStudioImportHandoffsForTests();
  useI18n.getState().setLang("ko");
});

describe("재배열 설정 단계", () => {
  it("제목으로 포커스를 옮기고 기본값(720px·표준 간격 80·폭에 맞춤)과 컷 3개의 결과를 보여 준다", async () => {
    const { heading } = await openReflowStep();
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect((screen.getByRole("radio", { name: "720px" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("spinbutton", { name: /컷 사이 여백\(px\)/ }) as HTMLInputElement).value).toBe("80");
    expect(screen.getByRole("button", { name: "표준 80" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("radio", { name: /폭에 맞춤/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("status").some((node) => /페이지 1개 · 컷 3개/.test(node.textContent ?? ""))).toBe(true);
    expect((screen.getByRole("textbox", { name: "Studio 문서 제목" }) as HTMLInputElement).value).toBe("page-01");
    expect(document.querySelectorAll("[data-reflow-order]")).toHaveLength(3);
    expect(screen.getByRole("list", { name: "재배열 미리보기 페이지" })).toBeTruthy();
  });

  it("미리보기는 스크롤 영역이라 키보드로 포커스를 받고 이름을 읽어 준다(안쪽에 포커스 받는 것이 없으므로)", async () => {
    await openReflowStep();
    const region = screen.getByRole("region", { name: /재배열 미리보기 \(방향키로 스크롤\)/ });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.hasAttribute("data-panel-reflow-preview")).toBe(true);
    region.focus();
    expect(document.activeElement).toBe(region);
  });

  it("원본이 달라지는 점(손실 보고)을 보여 주고, 확인하기 전에는 삽입·내려받기가 닫혀 있다", async () => {
    await openReflowStep();
    expect(screen.getByText("원본과 달라지는 점")).toBeTruthy();
    expect(screen.getByText(/원본 파일은 바꾸거나 덮어쓰지 않아요/)).toBeTruthy();
    expect(screen.getByText(/키워서 흐려질 수 있어요/)).toBeTruthy();
    expect(screen.getByText(/컷 밖 영역\(약 [\d.]+%\)은 결과에 들어가지 않아요/)).toBeTruthy();
    expect(confirmBox().checked).toBe(false);
    expect(button(/Studio 문서로 삽입/).disabled).toBe(true);
    expect(button(/PNG 묶음\(ZIP\) 내려받기/).disabled).toBe(true);
    expect(screen.getByText("변경 사항 확인에 체크하면 버튼이 열려요.")).toBeTruthy();
    fireEvent.click(confirmBox());
    expect(button(/Studio 문서로 삽입/).disabled).toBe(false);
    expect(button(/PNG 묶음\(ZIP\) 내려받기/).disabled).toBe(false);
    expect(screen.queryByText("변경 사항 확인에 체크하면 버튼이 열려요.")).toBeNull();
  });

  it("폭 규격·간격·배율을 바꾸면 계획과 손실 보고가 바로 바뀐다", async () => {
    await openReflowStep();
    const base = totalHeight();
    fireEvent.click(screen.getByRole("radio", { name: "690px" }));
    expect(screen.getByText(/Studio 문서 폭\(720\)보다 좁아 양옆에 15px 씩/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "720px" }));
    expect(screen.queryByText(/Studio 문서 폭\(720\)보다 좁아/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(totalHeight()).toBe(base - 160);
    fireEvent.change(screen.getByRole("spinbutton", { name: /컷 사이 여백\(px\)/ }), { target: { value: "120" } });
    expect(totalHeight()).toBe(base + 80);
    fireEvent.change(screen.getByRole("spinbutton", { name: /컷 사이 여백\(px\)/ }), { target: { value: "9999" } });
    expect((screen.getByRole("spinbutton", { name: /컷 사이 여백\(px\)/ }) as HTMLInputElement).value).toBe("400");

    fireEvent.click(screen.getByRole("radio", { name: /원본 크기 유지/ }));
    expect(screen.queryByText(/키워서 흐려질 수 있어요/)).toBeNull();
  });

  it("손실 확인은 설정이 바뀌어 보고가 달라지면 다시 요구한다", async () => {
    await openReflowStep();
    fireEvent.click(confirmBox());
    expect(button(/Studio 문서로 삽입/).disabled).toBe(false);
    // 간격만 바꾸면 보고 내용이 같아 확인이 유지된다.
    fireEvent.click(screen.getByRole("button", { name: "40" }));
    expect(confirmBox().checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "690px" }));
    expect(confirmBox().checked).toBe(false);
    expect(button(/Studio 문서로 삽입/).disabled).toBe(true);
  });

  it("문서 제목이 비면 삽입할 수 없고, 내려받기는 파일 이름에서 만든 제목을 쓴다", async () => {
    await openReflowStep();
    fireEvent.click(confirmBox());
    const title = screen.getByRole("textbox", { name: "Studio 문서 제목" });
    fireEvent.change(title, { target: { value: "   " } });
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(button(/Studio 문서로 삽입/).disabled).toBe(true);
    expect(button(/PNG 묶음\(ZIP\) 내려받기/).disabled).toBe(false);
    fireEvent.change(title, { target: { value: "12화 컷" } });
    expect(button(/Studio 문서로 삽입/).disabled).toBe(false);
  });

  it("컷 고치기로 돌아가도 편집한 내용이 그대로고 제목으로 포커스가 간다", async () => {
    await openReflowStep();
    fireEvent.click(button("컷 고치기로"));
    const review = await screen.findByRole("heading", { name: "2. 컷 확인과 고치기" });
    await waitFor(() => expect(document.activeElement).toBe(review));
    fireEvent.click(screen.getByRole("button", { name: "컷 2 삭제" }));
    fireEvent.click(button(/다음: 세로 재배열 설정/));
    await screen.findByRole("heading", { name: "3. 세로 스트립으로 재배열" });
    expect(document.querySelectorAll("[data-reflow-order]")).toHaveLength(2);
  });

  it("영문 화면에서는 단계 제목과 단추가 영문이다", async () => {
    useI18n.getState().setLang("en");
    renderFlow();
    await screen.findByRole("heading", { name: "2. Review and fix panels" });
    fireEvent.click(screen.getByRole("button", { name: /Next: vertical strip settings/ }));
    expect(await screen.findByRole("heading", { name: "3. Rearrange into a vertical strip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Insert into a Studio document/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download PNG bundle \(ZIP\)/ })).toBeTruthy();
    expect(screen.getByText("What changes from the original")).toBeTruthy();
  });
});

describe("Studio 문서로 삽입", () => {
  it("컷 이미지를 만들어 프로젝트 파일로 묶고 편집기 가져오기 전달표에 올린 뒤 이동한다", async () => {
    const { kit } = await openReflowStep();
    fireEvent.click(confirmBox());
    fireEvent.click(button(/Studio 문서로 삽입/));
    await waitFor(() => expect(locationText()).toMatch(/^\/studio\/canvas\?importHandoff=/));
    expect(screen.getByText("Studio 편집기로 이동하고 있어요…")).toBeTruthy();

    const token = new URLSearchParams(locationText().split("?")[1] ?? "").get(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
    if (!token) throw new Error("전달 토큰이 주소에 없어요.");
    const handoff = consumeStudioImportHandoff(token);
    expect(handoff?.target).toBe("project-json");
    if (!handoff) throw new Error("전달표에 파일이 없어요.");
    expect(handoff.file.name).toBe("page-01-panels.json");

    const project = parseStudioProjectFile(JSON.parse(await handoff.file.text()));
    expect(project.title).toBe("page-01");
    expect(project.description).toContain("page-01.png");
    expect(project.pagesList).toHaveLength(1);
    const elements = project.pagesList.flatMap((page) => page.elements);
    expect(elements).toHaveLength(6); // 컷마다 프레임 1 + 이미지 1
    const rights = elements.flatMap((element) => (typeof element === "object" && element !== null && "sourceRights" in element ? [JSON.stringify(element.sourceRights)] : []));
    expect(rights).toHaveLength(3);
    for (const record of rights) {
      expect(record).toContain("c".repeat(64));
      expect(record).toContain("owned-or-licensed");
    }
    // 컷마다 만든 그림면은 모두 정리된다.
    expect(kit.world.surfaces).toHaveLength(3);
    expect(kit.world.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("그림면을 만들 수 없으면 이유를 알려 주고, 고친 뒤 다시 시도하면 이어서 된다", async () => {
    let refuse = true;
    const world = fakeCanvasWorld({ refuse: () => refuse });
    await openReflowStep({ canvasDeps: world.deps });
    fireEvent.click(confirmBox());
    fireEvent.click(button(/Studio 문서로 삽입/));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("이 브라우저에서 만들 수 있는 크기를 넘어요");
    expect(locationText()).toBe("/studio/import");
    refuse = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(locationText()).toMatch(/^\/studio\/canvas\?importHandoff=/));
  });

  it("PNG 로 저장하지 못한 컷이 있으면 번호와 함께 알려 준다", async () => {
    const world = fakeCanvasWorld({ failEncodeAt: 1 });
    await openReflowStep({ canvasDeps: world.deps });
    fireEvent.click(confirmBox());
    fireEvent.click(button(/Studio 문서로 삽입/));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/2번째 이미지를 PNG 로 저장하지 못했어요/);
    expect(world.surfaces.every((surface) => surface.disposed)).toBe(true);
    expect(locationText()).toBe("/studio/import");
  });

  it("만드는 도중 취소하면 이동하지 않고 원본·설정이 그대로라고 알려 준다", async () => {
    const { kit } = await openReflowStep();
    fireEvent.click(confirmBox());
    fireEvent.click(button(/Studio 문서로 삽입/));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(await screen.findByText("삽입을 취소했어요. 원본과 컷 설정은 그대로예요.")).toBeTruthy();
    expect(locationText()).toBe("/studio/import");
    expect(kit.world.surfaces.every((surface) => surface.disposed)).toBe(true);
    // 취소 뒤에도 같은 설정으로 다시 시도할 수 있다.
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(locationText()).toMatch(/^\/studio\/canvas\?importHandoff=/));
  });
});

describe("PNG 묶음(ZIP) 내려받기", () => {
  it("페이지 PNG 와 권리 확인 기록을 담은 ZIP 을 내려받는다", async () => {
    const { kit } = await openReflowStep();
    fireEvent.click(confirmBox());
    fireEvent.click(button(/PNG 묶음\(ZIP\) 내려받기/));
    expect(await screen.findByText("ZIP 을 내려받았어요. 브라우저의 다운로드 목록을 확인해 주세요.")).toBeTruthy();
    expect(kit.downloads).toHaveLength(1);
    const [download] = kit.downloads;
    if (!download) throw new Error("내려받기 기록이 없어요.");
    expect(download.fileName).toBe("page-01-strip-bundle.zip");
    const archive = await readStudioZipArchive(download.blob);
    expect(archive.entries.map((entry) => entry.path)).toEqual(["manifest.json", "files/strip-01.png", "files/rights-receipt.txt"]);
    const receipt = new TextDecoder().decode(await archive.readEntry("files/rights-receipt.txt"));
    expect(receipt).toContain('사용자가 "내가 권리를 가진 원고이거나 이용 허락을 받은 원고입니다"에 동의했어요 (2026-10-15)');
    expect(receipt).toContain("원본: page-01.png (400×560px)");
    expect(receipt).toContain(`SHA-256: ${"c".repeat(64)}`);
    expect(receipt).toContain("서버로 보내지 않았어요");
  });

  it("묶음을 만들다 실패하면 이유와 다시 시도를 보여 주고 성공하면 내려받는다", async () => {
    let failing = true;
    const { kit } = await openReflowStep({
      buildReflowBundle: (input) => (failing
        ? Promise.reject(new PanelRenderError("surface-unavailable", 1))
        : Promise.resolve({ blob: new Blob(["zip"], { type: "application/zip" }), fileName: `${input.title}.zip`, manifest: { schema: "toonstudio.download-bundle/v1", title: input.title, generatedAt: "2026-10-15T09:00:00.000Z", integrity: "zip-crc32", fileCount: 1, totalBytes: 3, files: [] } })),
    });
    fireEvent.click(confirmBox());
    fireEvent.click(button(/PNG 묶음\(ZIP\) 내려받기/));
    expect((await screen.findByRole("alert")).textContent).toContain("1번째 이미지가 이 브라우저에서 만들 수 있는 크기를 넘어요");
    expect(kit.downloads).toHaveLength(0);
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(kit.downloads).toHaveLength(1));
    expect(kit.downloads[0]?.fileName).toBe("page-01.zip");
  });
});
