// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublishCenterPage } from "./PublishCenterPage";
import type { PublishPackageRequest } from "./integration-platform-types";

import { useApp } from "@/shared/lib/store";

const mocks = vi.hoisted(() => ({
  lang: "ko", catalog: vi.fn(), buildPublishPackage: vi.fn(), buildFeedPreview: vi.fn(),
  getProject: vi.fn(), listProjects: vi.fn(), downloadJson: vi.fn(), downloadText: vi.fn(),
}));
vi.mock("./integration-platform-client", () => ({ integrationPlatformClient: mocks }));
vi.mock("./integration-platform-storage", () => ({ downloadIntegrationJson: mocks.downloadJson, downloadIntegrationText: mocks.downloadText }));
vi.mock("@/domains/creator/public/production-projects", () => ({ getProductionProject: mocks.getProject, listProductionProjects: mocks.listProjects }));
vi.mock("@/shared/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: mocks.lang }),
  useT: () => (key: string) => key,
}));

const catalogFixture = {
  generatedAt: "2026-10-02T00:00:00.000Z", categories: ["publishing"],
  providers: [
    { id: "external-webtoon-platforms", name: "외부 웹툰 플랫폼", category: "publishing", summary: "외부 플랫폼 수동 전달 정보", capabilities: ["publish.manual"], connectionMode: "manual", activation: "none", configured: true, executable: false, status: "manual", statusReason: "플랫폼에서 업로드 결과를 확인하세요." },
    { id: "rss-json-feed", name: "RSS · JSON Feed", category: "publishing", summary: "피드 파일 미리보기", capabilities: ["feed.generate"], connectionMode: "public-feed", activation: "none", configured: true, executable: true, status: "ready", statusReason: "피드 파일을 준비할 수 있습니다." },
  ],
};
const packageFixture = {
  schema: "toonstudio.publish-package/1", createdAt: "2026-10-02T10:00:00.000Z", projectId: "project-1",
  title: "별빛 항해자", description: "", canonicalUrl: "https://example.com/works/one", scheduledAt: null,
  channels: [
    { id: "external-webtoon-platforms", name: "외부 웹툰 플랫폼", valid: true, executable: false, mode: "manual-handoff", status: "manual", reason: "플랫폼에서 업로드 결과를 확인하세요." },
    { id: "rss-json-feed", name: "RSS · JSON Feed", valid: true, executable: true, mode: "provider-api", status: "ready", reason: "피드 파일을 준비할 수 있습니다." },
  ],
  tags: [], packageDigest: "9f2c1ab47de3058192aa", ready: true, directlyExecutable: false,
  notices: ["Manual channels require a human confirmation receipt after upload."],
};
const projectSummary = {
  projectId: "project-1", workId: "work-1", title: "별빛 항해자", coverImageUrl: null,
  collaborationModel: "solo", revision: 1, updatedAt: "2026-10-02T00:00:00.000Z",
  access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
  healthScore: 80, activeEpisodeCount: 1, readyBufferCount: 0, criticalRiskCount: 0, overdueTaskCount: 0,
  blockedTaskCount: 0, unassignedTaskCount: 0, reviewTaskCount: 0, nextReleaseAt: null,
  forecastFinishAt: null, scheduleConfidencePercent: null,
};
const projectRecord = (projectId: string) => ({ aggregate: { projectId, title: projectId === "project-2" ? "다음 작품" : "별빛 항해자", episodes: [], episodePlans: [] } });

function NavigateProject() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button type="button" onClick={() => navigate("/publish?projectId=project-2")}>다른 작품 주소로 이동</button>
    <button type="button" onClick={() => navigate(-1)}>브라우저 뒤로</button><button type="button" onClick={() => navigate(1)}>브라우저 앞으로</button>
    <button type="button" onClick={() => navigate("/elsewhere")}>화면 떠나기</button><output aria-label="현재 게시 준비 주소">{location.pathname}{location.search}</output></>;
}
function renderPage(initialPath = "/publish?projectId=project-1", navigation = false) {
  return render(<MemoryRouter initialEntries={[initialPath]}><Routes><Route path="/publish" element={<PublishCenterPage />} /><Route path="/elsewhere" element={<h1>다른 화면</h1>} /></Routes>{navigation ? <NavigateProject /> : null}</MemoryRouter>);
}
async function prepareInputs() {
  await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" });
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "별빛 항해자" } });
  fireEvent.change(screen.getByLabelText("작품 대표 주소"), { target: { value: "https://example.com/works/one" } });
}
const prepareButton = () => screen.getByRole("button", { name: "파일 준비하기" });
const stepButton = (number: 1 | 2 | 3) => within(screen.getByRole("navigation", { name: "게시 정보 준비 단계" })).getByRole("button", { name: new RegExp(`^${number}\\.`) });
const preparedFiles = () => screen.findByRole("heading", { name: "파일 결과를 확인하세요" });

beforeEach(() => {
  vi.clearAllMocks(); mocks.lang = "ko";
  useApp.setState({ userId: "user-1" });
  mocks.catalog.mockResolvedValue(catalogFixture);
  mocks.getProject.mockImplementation(async (projectId: string) => projectRecord(projectId));
  mocks.listProjects.mockResolvedValue({ projects: [] });
  mocks.buildPublishPackage.mockImplementation(async (request: PublishPackageRequest) => ({ ...packageFixture, projectId: request.projectId, title: request.title, description: request.description, canonicalUrl: request.canonicalUrl, scheduledAt: request.scheduledAt ?? null, tags: request.tags }));
  mocks.buildFeedPreview.mockResolvedValue({ rss: "<rss/>", jsonFeed: {}, activityPub: [], digest: "77aa10bc" });
});
afterEach(() => { cleanup(); useApp.setState({ userId: null }); vi.unstubAllGlobals(); });

describe("PublishCenterPage 게시 준비 계약", () => {
  it("채널의 긴 지원 설명은 따로 열어 확인하고 선택 변경은 준비 파일에 반영한다", async () => {
    renderPage(); await prepareInputs();
    const support = screen.getByRole("group", { name: "채널별 지원 범위" });
    expect((support as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByRole("checkbox", { name: "외부 웹툰 플랫폼" })).toBeTruthy();
    fireEvent.click(within(support).getByText("채널별 지원 범위"));
    expect((support as HTMLDetailsElement).open).toBe(true);
    expect(within(support).getByText("외부 플랫폼 수동 전달 정보")).toBeTruthy();
    expect(within(support).getByText("플랫폼에서 업로드 결과를 확인하세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "외부 웹툰 플랫폼" }));
    fireEvent.click(prepareButton());
    await preparedFiles();
    expect(mocks.buildPublishPackage).toHaveBeenCalledWith(expect.objectContaining({ channels: ["rss-json-feed"] }));
  });

  it("선택 가능한 채널이 없으면 준비를 막고 채널을 다시 불러온 뒤 같은 입력으로 이어간다", async () => {
    mocks.catalog.mockResolvedValueOnce({ ...catalogFixture, providers: [] });
    renderPage(); await prepareInputs();
    await screen.findByText("현재 선택할 수 있는 게시 채널이 없어요.");
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(prepareButton());
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "채널 다시 불러오기" }));
    await screen.findByRole("checkbox", { name: "외부 웹툰 플랫폼" });
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("별빛 항해자");
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("https://example.com/works/one");
    fireEvent.click(prepareButton()); await preparedFiles();
    expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1);
  });

  it("간결한 채널 행에서 지원 상태와 기본 선택을 확인한다", async () => {
    const { container } = renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    expect(screen.getByText("직접 업로드")).toBeTruthy();
    expect(screen.getByText("사용 가능")).toBeTruthy();
    expect(screen.getByText("선택한 채널 정보를 JSON 파일에 담아요. 업로드·예약은 해당 채널에서 진행해 주세요.")).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>("#publish-channel-external-webtoon-platforms")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#publish-channel-rss-json-feed")?.checked).toBe(true);
  });

  it("부모 라벨에 이름 속성을 두지 않아도 checkbox 이름과 라벨 클릭을 유지한다", async () => {
    const { container } = renderPage(); await prepareInputs();
    const checkbox = screen.getByRole<HTMLInputElement>("checkbox", { name: "외부 웹툰 플랫폼" });
    const label = container.querySelector<HTMLLabelElement>('label[for="publish-channel-external-webtoon-platforms"]');
    if (!label) throw new Error("채널 선택 라벨이 필요합니다.");
    expect(label.getAttribute("aria-label")).toBeNull();
    expect(checkbox.checked).toBe(true);
    fireEvent.click(label); expect(checkbox.checked).toBe(false);
    expect(screen.getByRole("checkbox", { name: "외부 웹툰 플랫폼" })).toBe(checkbox);
    fireEvent.click(label); expect(checkbox.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "RSS · JSON Feed" }) as HTMLInputElement).checked).toBe(true);
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("직접 진입에서는 가짜 프로젝트와 갤러리 주소를 만들지 않고 선택을 요구한다", async () => {
    renderPage("/publish"); await screen.findByText("외부 웹툰 플랫폼");
    expect(stepButton(1).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("textbox")).toBeNull();
    const create = await screen.findByRole("link", { name: "제작 프로젝트 만들러 가기" });
    expect(create.getAttribute("href")).toBe("/production/projects");
    expect(document.querySelector("[data-publish-preparation-actions]")).toBeNull();
    expect(screen.queryByRole("button", { name: "정보와 채널 확인" })).toBeNull();
    fireEvent.click(stepButton(2));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "직접 입력" } });
    fireEvent.change(screen.getByLabelText("작품 대표 주소"), { target: { value: "https://example.com/works/one" } });
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(prepareButton());
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
    expect(mocks.getProject).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "제작 프로젝트 목록으로" }).getAttribute("href")).toBe("/production/projects");
    expect(document.querySelector("#publish-project-selection")?.hasAttribute("open")).toBe(true);
    expect(document.body.textContent).not.toContain("demo-project");
  });

  it("로그인 전에는 URL의 프로젝트를 확인하거나 패키지 실행하지 않는다", async () => {
    useApp.setState({ userId: null }); renderPage(); await screen.findByText("외부 웹툰 플랫폼");
    expect(mocks.getProject).not.toHaveBeenCalled();
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(stepButton(1));
    expect(screen.getByRole("link", { name: "로그인하기" })).toBeTruthy();
    expect(document.querySelector("[data-publish-preparation-actions]")).toBeNull();
  });

  it("작품 확인 중·실패에는 선택과 재시도를 열어 두고 확인 뒤에만 이어가기 바를 표시한다", async () => {
    let failVerification: (reason: Error) => void = () => { throw new Error("프로젝트 확인 미시작"); };
    mocks.getProject.mockReturnValueOnce(new Promise<ReturnType<typeof projectRecord>>((_resolve, reject) => { failVerification = reject; }));
    renderPage("/publish?projectId=project-1&step=project");
    await screen.findByText("선택한 제작 프로젝트를 확인하고 있어요.");
    expect(document.querySelector("[data-publish-preparation-actions]")).toBeNull();
    expect(document.querySelector<HTMLDetailsElement>("#publish-project-selection")?.open).toBe(true);
    await act(async () => failVerification(new Error("503")));
    const retry = await screen.findByRole("button", { name: "프로젝트 다시 확인" });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector("[data-publish-preparation-actions]")).toBeNull();
    expect(screen.getByRole("link", { name: "제작 프로젝트 목록으로" }).getAttribute("href")).toBe("/production/projects");
    fireEvent.click(retry);
    await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" });
    const next = screen.getByRole<HTMLButtonElement>("button", { name: "정보와 채널 확인" });
    expect(next.disabled).toBe(false);
    expect(document.querySelector("[data-publish-preparation-actions]")?.classList.contains("sticky")).toBe(true);
    fireEvent.click(next);
    await screen.findByRole("heading", { name: "정보와 채널 확인" });
    expect(document.querySelector("[data-publish-preparation-actions]")?.classList.contains("sticky")).toBe(true);
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("실제 목록에서 고른 프로젝트를 확인하고 그 프로젝트로 정확히 돌아간다", async () => {
    mocks.listProjects.mockResolvedValue({ projects: [projectSummary] }); renderPage("/publish");
    fireEvent.click(await screen.findByRole("button", { name: /이 작품으로 게시 준비/u }));
    const back = await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" });
    expect(back.getAttribute("href")).toBe("/production/projects/project-1/overview");
    expect(mocks.getProject).toHaveBeenCalledWith("project-1");
    expect(document.querySelector("#publish-project-selection")?.hasAttribute("open")).toBe(false);
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("");
  });

  it("제목·실제 대표 주소·채널이 갖춰져야 준비할 수 있다", async () => {
    const { container } = renderPage(); await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" });
    fireEvent.click(prepareButton());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("작품 대표 주소")));
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
    await prepareInputs(); expect((prepareButton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "" } }); fireEvent.click(prepareButton());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("제목")));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "별빛 항해자" } });
    for (const input of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) fireEvent.click(input);
    fireEvent.click(prepareButton()); await waitFor(() => expect(document.activeElement?.id).toBe("publish-channel-list"));
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("희망 시각·태그·설명은 실제 요청에 기록되며 컷 분할·시간대 설정은 전송되지 않는다", async () => {
    renderPage("/publish?projectId=project-real&title=전달한제목"); await prepareInputs();
    fireEvent.change(screen.getByLabelText("게시 희망 시각 · 계획 기록"), { target: { value: "2026-12-01T23:00" } });
    fireEvent.change(screen.getByLabelText("태그(쉼표 구분)"), { target: { value: "웹툰, 모험" } });
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "게시 안내" } });
    fireEvent.click(prepareButton());
    await waitFor(() => expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1));
    expect(mocks.buildPublishPackage).toHaveBeenCalledWith({
      projectId: "project-real", title: "별빛 항해자", description: "게시 안내", canonicalUrl: "https://example.com/works/one",
      scheduledAt: new Date("2026-12-01T23:00").toISOString(), channels: ["external-webtoon-platforms", "rss-json-feed"], tags: ["웹툰", "모험"],
    });
    expect(screen.queryByTestId("publish-center-rea-multispec-bar")).toBeNull();
  });

  it("채널 확인이 성공해도 원고 검증·게시 완료로 표시하지 않고 JSON을 내려받는다", async () => {
    renderPage(); await prepareInputs(); fireEvent.click(prepareButton());
    await preparedFiles();
    expect(document.querySelector("[data-publish-preparation-actions]")?.classList.contains("sticky")).toBe(true);
    expect(screen.getByText("게시 정보 파일이 준비됐어요. 외부 게시와 예약은 아직 실행되지 않았습니다.")).toBeTruthy();
    expect(screen.queryByText("규격 검사를 통과했습니다.")).toBeNull();
    expect(screen.queryByText("바로 실행")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "게시 정보 파일 받기" }));
    expect(mocks.downloadJson).toHaveBeenCalledWith("publish-project-1.json", expect.objectContaining({ schema: "toonstudio.publish-package/1", ready: true, directlyExecutable: false, projectId: "project-1" }));
    expect(mocks.buildFeedPreview).not.toHaveBeenCalled();
  });

  it("유효하지 않은 채널 결과는 준비 성공으로 포장하지 않는다", async () => {
    mocks.buildPublishPackage.mockResolvedValue({ ...packageFixture, ready: false, channels: [{ id: "unknown", valid: false, executable: false, mode: "unsupported", reason: "등록되지 않은 채널" }] });
    renderPage(); await prepareInputs(); fireEvent.click(prepareButton());
    await preparedFiles();
    expect(screen.getByText("채널 정보 확인 필요")).toBeTruthy();
    expect(screen.queryByText("게시 정보 JSON 준비됨")).toBeNull();
    expect(screen.getByText("채널 정보를 확인하세요. 게시가 실행되지 않았습니다.")).toBeTruthy();
  });

  it("실패해도 입력을 유지하고 같은 내용으로 재시도한다", async () => {
    mocks.buildPublishPackage.mockRejectedValueOnce(new Error("offline"));
    renderPage(); await prepareInputs();
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "유지할 설명" } });
    fireEvent.click(prepareButton()); await screen.findByRole("alert");
    expect((screen.getByLabelText("설명") as HTMLTextAreaElement).value).toBe("유지할 설명");
    fireEvent.click(prepareButton()); await preparedFiles();
    expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(2);
    expect(mocks.buildPublishPackage.mock.calls[0]?.[0]).toEqual(mocks.buildPublishPackage.mock.calls[1]?.[0]);
  });

  it("입력을 바꾸면 이전 준비 결과를 현재 입력의 성공처럼 표시하지 않는다", async () => {
    renderPage(); await prepareInputs(); fireEvent.click(prepareButton()); await preparedFiles();
    fireEvent.click(screen.getByRole("button", { name: "입력 내용 수정" }));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "바꾼 제목" } });
    expect(screen.queryByText("게시 정보 JSON 준비됨")).toBeNull();
    expect(screen.queryByRole("button", { name: "게시 정보 파일 받기" })).toBeNull();
  });

  it("프로젝트 확인 실패는 입력을 보존하고 재확인 후 준비할 수 있다", async () => {
    mocks.getProject.mockRejectedValueOnce(new Error("503")); renderPage();
    await screen.findByRole("button", { name: "프로젝트 다시 확인" });
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "유지할 제목" } });
    fireEvent.change(screen.getByLabelText("작품 대표 주소"), { target: { value: "https://example.com/works/one" } });
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 다시 확인" }));
    await waitFor(() => expect((prepareButton() as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("유지할 제목");
  });

  it("프로젝트 응답이 다른 작품이면 준비를 허용하지 않는다", async () => {
    mocks.getProject.mockResolvedValue(projectRecord("project-other")); renderPage();
    await screen.findByRole("button", { name: "프로젝트 다시 확인" });
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("준비 중에는 중복 실행·입력·프로젝트 변경을 막고 새 주소의 결과와 섞지 않는다", async () => {
    let finish: (value: typeof packageFixture) => void = () => { throw new Error("준비 요청이 시작되지 않음"); };
    mocks.buildPublishPackage.mockReturnValue(new Promise<typeof packageFixture>((resolve) => { finish = resolve; }));
    mocks.listProjects.mockResolvedValue({ projects: [projectSummary] }); renderPage(undefined, true); await prepareInputs();
    fireEvent.click(prepareButton());
    expect((screen.getByRole("button", { name: "준비 중" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("제목") as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("#publish-project-choice li button")?.disabled).toBe(true);
    expect(stepButton(1).getAttribute("disabled")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 작품 주소로 이동" }));
    await waitFor(() => expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("다음 작품"));
    await act(async () => finish(packageFixture));
    expect(screen.queryByRole("button", { name: "게시 정보 파일 받기" })).toBeNull();
    expect(screen.getByRole("link", { name: "선택한 프로젝트로 돌아가기" }).getAttribute("href")).toBe("/production/projects/project-2/overview");
  });

  it.each(["준비 중", "준비 완료"])("계정을 바꾸면 이전 계정의 %s 결과와 입력을 새 계정에 섞지 않는다", async (phase) => {
    let finish: (value: typeof packageFixture) => void = () => { throw new Error("준비 요청이 시작되지 않음"); };
    if (phase === "준비 중") {
      mocks.buildPublishPackage.mockReturnValueOnce(new Promise<typeof packageFixture>((resolve) => { finish = resolve; }));
    }
    renderPage(); await prepareInputs();
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "이전 계정의 설명" } });
    fireEvent.click(prepareButton());
    if (phase === "준비 완료") await preparedFiles();
    else await screen.findByRole("button", { name: "준비 중" });
    mocks.getProject.mockRejectedValue(new Error("forbidden"));
    act(() => useApp.setState({ userId: "user-2" }));
    await screen.findByRole("button", { name: "프로젝트 다시 확인" });
    if (phase === "준비 중") await act(async () => finish(packageFixture));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("설명") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "게시 정보 파일 받기" })).toBeNull();
    expect((prepareButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("피드는 계획 날짜를 담은 미리보기 파일이며 게시 요청을 보내지 않는다", async () => {
    renderPage(); await prepareInputs();
    fireEvent.change(screen.getByLabelText("게시 희망 시각 · 계획 기록"), { target: { value: "2026-12-01T23:00" } });
    fireEvent.click(screen.getByRole("button", { name: "피드 파일 미리보기" }));
    await waitFor(() => expect(mocks.buildFeedPreview).toHaveBeenCalledTimes(1));
    expect(mocks.buildFeedPreview.mock.calls[0]?.[0].items[0].datePublished).toBe(new Date("2026-12-01T23:00").toISOString());
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "RSS" }));
    expect(mocks.downloadText).toHaveBeenCalledWith("feed.xml", "<rss/>", "application/rss+xml;charset=utf-8");
  });

  it("390px 조건에서 주 행동을 하나로 유지하고 보조 안내는 접힌 채 실제 목적지를 보존한다", async () => {
    vi.stubGlobal("innerWidth", 390); renderPage(); await prepareInputs();
    expect(screen.getAllByRole("button", { name: "파일 준비하기" })).toHaveLength(1);
    const related = screen.getByRole("navigation", { name: "다른 작업" });
    expect(within(related).getByRole("link", { name: "원고 출력·검수" }).getAttribute("href")).toBe("/studio/publish");
    expect(within(related).getByRole("link", { name: "연동 채널 확인" }).getAttribute("href")).toBe("/settings/integrations");
    expect(document.querySelector("[data-publish-preparation-actions]")?.classList.contains("sticky")).toBe(true);
    expect(stepButton(3).getAttribute("disabled")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "파일 결과를 확인하세요" })).toBeNull();
    const guide = screen.getByRole("group", { name: "원고 출력·게시 계획 안내" });
    expect((guide as HTMLDetailsElement).open).toBe(false);
    expect(within(guide).getByTestId("publish-surface-cross-bridge").querySelector('a[href="/studio/publish"]')).toBeTruthy();
    expect(guide.textContent).not.toContain("RIGHTS BOM READY");
    expect(guide.textContent).not.toContain("스마트 컷분할");
  });

  it("영어 안내와 기존 Studio·기술·신뢰 목적지를 유지한다", async () => {
    mocks.lang = "en"; renderPage(); await screen.findByText("외부 웹툰 플랫폼");
    const guide = screen.getByRole("group", { name: "Manuscript export and publication planning guide" });
    expect(screen.getByRole("button", { name: "Prepare file" })).toBeTruthy();
    const bridge = within(guide).getByTestId("publish-surface-cross-bridge");
    expect(bridge.textContent).not.toMatch(/[가-힣]/u);
    for (const href of ["/studio/publish", "/about/technology/architecture", "/creator-support", "/accessibility"]) expect(bridge.querySelector(`a[href="${href}"]`)).toBeTruthy();
  });
});


describe("게시 정보 준비의 단계·복귀 계약", () => {
  it("준비 전 결과는 비활성화하고 직접 파일 단계 주소도 입력 단계로 복구한다", async () => {
    renderPage("/publish?projectId=project-1&step=files"); await prepareInputs();
    expect(stepButton(2).getAttribute("aria-current")).toBe("step");
    expect((stepButton(3) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("heading", { name: "파일 결과를 확인하세요" })).toBeNull();
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("선택·입력 단계와 브라우저 Back·Forward에서 입력·채널·초점을 유지한다", async () => {
    renderPage(undefined, true); await prepareInputs();
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "왕복 후 유지할 설명" } });
    fireEvent.change(screen.getByLabelText("태그(쉼표 구분)"), { target: { value: "유지, 초안" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "RSS · JSON Feed" }));
    fireEvent.click(stepButton(1)); await screen.findByRole("heading", { name: "어떤 작품의 정보를 준비할까요?" });
    fireEvent.click(stepButton(2)); await screen.findByRole("heading", { name: "정보와 채널 확인" });
    fireEvent.click(screen.getByRole("button", { name: "브라우저 뒤로" }));
    await waitFor(() => expect(stepButton(1).getAttribute("aria-current")).toBe("step"));
    expect(document.activeElement?.id).toBe("publish-step-heading-project");
    fireEvent.click(screen.getByRole("button", { name: "브라우저 앞으로" }));
    await waitFor(() => expect(stepButton(2).getAttribute("aria-current")).toBe("step"));
    expect(document.activeElement?.id).toBe("publish-step-heading-details");
    expect((screen.getByLabelText("설명") as HTMLTextAreaElement).value).toBe("왕복 후 유지할 설명");
    expect((screen.getByLabelText("태그(쉼표 구분)") as HTMLInputElement).value).toBe("유지, 초안");
    expect((screen.getByRole("checkbox", { name: "RSS · JSON Feed" }) as HTMLInputElement).checked).toBe(false);
    expect(mocks.getProject).toHaveBeenCalledTimes(1);
  });

  it("처음 선택한 프로젝트가 주소와 Back 목적지에 남고 입력을 잃지 않는다", async () => {
    mocks.listProjects.mockResolvedValue({ projects: [projectSummary] }); renderPage("/publish", true);
    fireEvent.click(await screen.findByRole("button", { name: /이 작품으로 게시 준비/u })); await prepareInputs();
    expect(screen.getByLabelText("현재 게시 준비 주소").textContent).toBe("/publish?projectId=project-1&step=details");
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "고쳐 적은 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "브라우저 뒤로" }));
    await waitFor(() => expect(stepButton(1).getAttribute("aria-current")).toBe("step"));
    expect(screen.getByLabelText("현재 게시 준비 주소").textContent).toBe("/publish?projectId=project-1&step=project");
    fireEvent.click(screen.getByRole("button", { name: "정보와 채널 확인" }));
    await waitFor(() => expect(stepButton(2).getAttribute("aria-current")).toBe("step"));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("고쳐 적은 제목");
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("https://example.com/works/one");
  });

  it("같은 프로젝트를 다시 선택해도 입력을 초기화하지 않는다", async () => {
    mocks.listProjects.mockResolvedValue({ projects: [projectSummary] }); renderPage(); await prepareInputs();
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "동일 작품의 설명" } });
    fireEvent.click(stepButton(1));
    const choices = document.querySelector<HTMLDetailsElement>("#publish-project-selection");
    if (!choices) throw new Error("프로젝트 선택 영역이 필요합니다.");
    const summary = choices.querySelector("summary");
    if (!summary) throw new Error("프로젝트 선택 버튼이 필요합니다.");
    fireEvent.click(summary);
    fireEvent.click(await screen.findByRole("button", { name: /이 작품으로 게시 준비/u }));
    await screen.findByRole("heading", { name: "정보와 채널 확인" });
    expect((screen.getByLabelText("설명") as HTMLTextAreaElement).value).toBe("동일 작품의 설명");
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("https://example.com/works/one");
  });

  it("결과에서 Back하면 파일을 다시 찾을 수 있고 입력 수정 시 이전 결과를 폐기한다", async () => {
    renderPage(undefined, true); await prepareInputs(); fireEvent.click(prepareButton()); await preparedFiles();
    expect(document.activeElement?.id).toBe("publish-step-heading-files");
    fireEvent.click(screen.getByRole("button", { name: "브라우저 뒤로" }));
    await waitFor(() => expect(stepButton(2).getAttribute("aria-current")).toBe("step"));
    expect(screen.getByRole("button", { name: "준비된 파일 다시 보기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "준비된 파일 다시 보기" })); await preparedFiles();
    expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "입력 내용 수정" }));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "수정된 제목" } });
    expect((stepButton(3) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "준비된 파일 다시 보기" })).toBeNull();
    expect(screen.queryByText("게시 정보 JSON 준비됨")).toBeNull();
  });

  it("준비 중 브라우저 Back 뒤 늦은 응답이 사용자의 단계를 바꾸지 않는다", async () => {
    let finish: (value: typeof packageFixture) => void = () => { throw new Error("준비 미시작"); };
    mocks.buildPublishPackage.mockReturnValue(new Promise<typeof packageFixture>((resolve) => { finish = resolve; }));
    renderPage("/publish?projectId=project-1&step=project", true);
    await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" }); fireEvent.click(stepButton(2)); await prepareInputs();
    fireEvent.click(prepareButton()); await screen.findByRole("button", { name: "준비 중" });
    fireEvent.click(screen.getByRole("button", { name: "브라우저 뒤로" }));
    await waitFor(() => expect(stepButton(1).getAttribute("aria-current")).toBe("step"));
    await act(async () => finish(packageFixture));
    expect(stepButton(1).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("button", { name: "게시 정보 파일 받기" })).toBeNull();
    fireEvent.click(stepButton(3)); await preparedFiles();
    expect(screen.getByRole("button", { name: "게시 정보 파일 받기" })).toBeTruthy();
  });

  it("다른 화면으로 떠난 뒤 응답이 도착해도 게시 준비로 돌아오지 않는다", async () => {
    let finish: (value: typeof packageFixture) => void = () => { throw new Error("준비 미시작"); };
    mocks.buildPublishPackage.mockReturnValue(new Promise<typeof packageFixture>((resolve) => { finish = resolve; }));
    renderPage(undefined, true); await prepareInputs(); fireEvent.click(prepareButton());
    fireEvent.click(screen.getByRole("button", { name: "화면 떠나기" })); await screen.findByRole("heading", { name: "다른 화면" });
    await act(async () => finish(packageFixture));
    expect(screen.getByLabelText("현재 게시 준비 주소").textContent).toBe("/elsewhere");
    expect(screen.queryByRole("navigation", { name: "게시 정보 준비 단계" })).toBeNull();
  });

  it("잘못된 URL의 검증 실패는 입력 단계와 해당 필드 초점으로 안내한다", async () => {
    renderPage(); await prepareInputs();
    fireEvent.change(screen.getByLabelText("작품 대표 주소"), { target: { value: "not a url" } }); fireEvent.click(prepareButton());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("작품 대표 주소")));
    expect(screen.getByRole("alert").textContent).toContain("입력한 내용은 유지됩니다");
    expect(mocks.buildPublishPackage).not.toHaveBeenCalled();
  });

  it("작품 선택·파일 준비·단계와 브라우저 이동에서 외부 query·fragment·돌아갈 문맥을 보존한다", async () => {
    const returnContext = { source: "library", scrollY: 420, returnTo: "/my/works" };
    function NavigationContext() {
      const location = useLocation();
      const navigate = useNavigate();
      return <>
        <output aria-label="문맥을 포함한 준비 주소">{location.pathname}{location.search}{location.hash}</output>
        <output aria-label="돌아갈 문맥">{JSON.stringify(location.state)}</output>
        <button type="button" onClick={() => navigate(-1)}>문맥 검증 뒤로</button>
        <button type="button" onClick={() => navigate(1)}>문맥 검증 앞으로</button>
      </>;
    }
    mocks.listProjects.mockResolvedValue({ projects: [projectSummary] });
    render(<MemoryRouter initialEntries={[{
      pathname: "/publish", search: "?source=library&tag=one&tag=two", hash: "#prepare", state: returnContext,
    }]}><PublishCenterPage /><NavigationContext /></MemoryRouter>);
    const expectContext = (step: string) => {
      const url = new URL(screen.getByLabelText("문맥을 포함한 준비 주소").textContent ?? "", "https://example.test");
      expect(url.searchParams.get("source")).toBe("library");
      expect(url.searchParams.getAll("tag")).toEqual(["one", "two"]);
      expect(url.searchParams.get("projectId")).toBe("project-1");
      expect(url.searchParams.get("step")).toBe(step);
      expect(url.hash).toBe("#prepare");
      expect(JSON.parse(screen.getByLabelText("돌아갈 문맥").textContent ?? "null")).toEqual(returnContext);
    };
    fireEvent.click(await screen.findByRole("button", { name: /이 작품으로 게시 준비/u }));
    await screen.findByRole("link", { name: "선택한 프로젝트로 돌아가기" });
    expectContext("details");
    await prepareInputs(); fireEvent.click(prepareButton()); await preparedFiles(); expectContext("files");
    fireEvent.click(screen.getByRole("button", { name: "입력 내용 수정" })); expectContext("details");
    fireEvent.click(stepButton(1)); expectContext("project");
    fireEvent.click(screen.getByRole("button", { name: "문맥 검증 뒤로" }));
    await waitFor(() => expectContext("details"));
    expect((screen.getByLabelText("작품 대표 주소") as HTMLInputElement).value).toBe("https://example.com/works/one");
    fireEvent.click(screen.getByRole("button", { name: "문맥 검증 앞으로" }));
    await waitFor(() => expectContext("project"));
    expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1);
  });
});
