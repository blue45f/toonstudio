// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import { CreatorEcosystemViewerPage } from "./CreatorEcosystemViewerPage";
import { downloadEcosystemJson } from "./ecosystem-preview";
import { parseReaderFeedbackText } from "./reader-feedback-io";

vi.mock("./ecosystem-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ecosystem-preview")>()),
  downloadEcosystemJson: vi.fn(),
}));

const download = vi.mocked(downloadEcosystemJson);
const PREVIEW = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TIMESTAMP = new Date(0).toISOString();

const REVIEW_PACKAGE = {
  kind: "toonstudio-beta-review", version: 1, packageId: "pkg-review-1", title: "새 연재작 1화",
  pages: ["도입", "갈등", "반전", "마무리"].map((label, index) => ({ id: `page-${index + 1}`, label })),
  questions: ["장면이 이해됐나요?", "대사를 읽기 편했나요?", "다음 장면이 궁금한가요?"],
};

const BETA_PACKAGE = {
  kind: "toonstudio-beta", version: 1, id: "beta-pkg-1", documentId: "document", title: "이미지 검토본",
  createdAt: TIMESTAMP, rightsAcknowledged: true,
  pages: [
    { id: "page-a", image: PREVIEW, fingerprint: "v1-1-a", panels: [{ id: "p1", label: "1컷" }, { id: "p2", label: "2컷" }], dialogue: [] },
    { id: "page-b", image: PREVIEW, fingerprint: "v1-1-b", panels: [{ id: "p3", label: "1컷" }], dialogue: [] },
  ],
};

const PROCESS_PACKAGE = {
  kind: "toonstudio-process", version: 1, title: "제작 과정", credit: "자체 제작", rightsAcknowledged: true, sampleId: null,
  checkpoints: [{ id: "stage", pageId: "page", label: "콘티", preview: PREVIEW, fingerprint: "v1-1-a", createdAt: TIMESTAMP }],
};

function renderViewer() {
  return render(<MemoryRouter><CreatorEcosystemViewerPage /></MemoryRouter>);
}

function openPackage(value: unknown) {
  const file = new File([typeof value === "string" ? value : JSON.stringify(value)], "package.json", { type: "application/json" });
  fireEvent.change(screen.getByLabelText(/검토·제작 과정 JSON 열기/u), { target: { files: [file] } });
}

beforeEach(() => {
  download.mockClear();
});

afterEach(cleanup);

describe("CreatorEcosystemViewerPage: 회차 피드백", () => {
  it("패키지를 열지 않아도 직접 적는 방식으로 피드백 폼을 펼칠 수 있다", () => {
    renderViewer();
    const toggle = screen.getByRole("button", { name: "패키지 없이 회차 피드백만 남기기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "회차 피드백 남기기" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.getByLabelText("작품 이름")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByLabelText("작품 이름")).toBeNull();
  });

  it("텍스트 검토 패키지를 열면 구성을 보여 주고, 폼은 그 패키지를 대상으로 컷 수를 안다", async () => {
    renderViewer();
    openPackage(REVIEW_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "새 연재작 1화" });
    const section = screen.getByRole("heading", { level: 2, name: "새 연재작 1화" }).closest("section")!;
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "1. 도입", "2. 갈등", "3. 반전", "4. 마무리", "장면이 이해됐나요?", "대사를 읽기 편했나요?", "다음 장면이 궁금한가요?",
    ]);
    expect(screen.queryByRole("button", { name: "패키지 없이 회차 피드백만 남기기" })).toBeNull();
    expect(screen.queryByLabelText("작품 이름")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "중간에 멈췄어요" }));
    expect(screen.getByText("이 회차는 모두 4컷이에요.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("몇 번째 컷에서 멈췄나요?"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("radio", { name: "헷갈렸어요" }));
    fireEvent.click(screen.getByRole("button", { name: "파일로 저장" }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const parsed = parseReaderFeedbackText(JSON.stringify(download.mock.calls[0]![1]));
    expect(parsed.ok && parsed.file.responses[0]).toMatchObject({
      target: { kind: "package", id: "pkg-review-1", title: "새 연재작 1화", episode: null },
      ratings: { fun: null, understanding: 1 },
      reading: { status: "left", point: { mode: "cut", cut: 3, cutCount: 4 } },
    });
  });

  it("이미지 검토 패키지는 기존 페이지별 검토 폼을 그대로 두고, 컷 수는 모든 페이지의 컷을 합한다", async () => {
    renderViewer();
    openPackage(BETA_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "이미지 검토본" });
    expect(screen.getByRole("heading", { level: 2, name: "독자 검토" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검토 응답 저장" }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![0]).toBe("beta-pkg-1-feedback.json");
    expect(download.mock.calls[0]![1]).toMatchObject({ kind: "toonstudio-beta-feedback", packageId: "beta-pkg-1" });

    fireEvent.click(screen.getByRole("radio", { name: "중간에 멈췄어요" }));
    expect(screen.getByText("이 회차는 모두 3컷이에요.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("몇 번째 컷에서 멈췄나요?"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "파일로 저장" }));
    expect(screen.getAllByText("컷 번호는 1~3 사이의 숫자로 적어 주세요.").length).toBeGreaterThanOrEqual(1);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("제작 과정 패키지에는 피드백 폼을 두지 않는다", async () => {
    renderViewer();
    openPackage(PROCESS_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "제작 과정" });
    expect(screen.queryByRole("heading", { name: "회차 피드백 남기기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "패키지 없이 회차 피드백만 남기기" })).toBeNull();
  });

  it("지원하지 않는 파일은 오류로 알리고 직접 적는 방식으로 돌아간다", async () => {
    renderViewer();
    openPackage(BETA_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "이미지 검토본" });
    openPackage({ kind: "toonstudio-reader-feedback", version: 1 });
    await screen.findByText("지원하는 베타 검토 또는 제작 과정 패키지가 아닙니다.");
    expect(screen.getByRole("alert").textContent).toContain("지원하는 베타 검토 또는 제작 과정 패키지가 아닙니다.");
    expect(screen.queryByRole("heading", { name: "이미지 검토본" })).toBeNull();
    expect(screen.getByRole("button", { name: "패키지 없이 회차 피드백만 남기기" })).toBeTruthy();
  });

  it("다른 패키지를 열면 폼을 새로 시작해 이전 패키지의 입력이 섞이지 않는다", async () => {
    renderViewer();
    openPackage(REVIEW_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "새 연재작 1화" });
    fireEvent.change(screen.getByLabelText("자유 의견 (선택)"), { target: { value: "이전 패키지 의견" } });
    openPackage(BETA_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "이미지 검토본" });
    expect((screen.getByLabelText("자유 의견 (선택)") as HTMLTextAreaElement).value).toBe("");
  });
});

describe("CreatorEcosystemViewerPage: 영어 화면", () => {
  const originalLanguage = useI18n.getState().lang;
  afterEach(() => useI18n.setState({ lang: originalLanguage }));

  it("이번에 더한 문구(텍스트 검토 패키지 안내, 패키지 없이 남기기)도 폼처럼 영어로 보인다", async () => {
    useI18n.setState({ lang: "en" });
    renderViewer();
    const toggle = screen.getByRole("button", { name: "Leave episode feedback without a package" });
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Story title")).toBeTruthy();

    openPackage(REVIEW_PACKAGE);
    await screen.findByRole("heading", { level: 2, name: "새 연재작 1화" });
    expect(screen.getByText(/This is a text review package/u)).toBeTruthy();
    expect(screen.queryByText(/텍스트 검토 패키지입니다/u)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Leave feedback on an episode" })).toBeTruthy();
  });
});
