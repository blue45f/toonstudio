// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublishCenterPage } from "./PublishCenterPage";

const mocks = vi.hoisted(() => ({
  lang: "ko",
  catalog: vi.fn(),
  buildPublishPackage: vi.fn(),
  buildFeedPreview: vi.fn(),
}));

vi.mock("./integration-platform-client", () => ({
  integrationPlatformClient: mocks,
}));

vi.mock("@/shared/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // 상태 문구 사전 모듈이 import 시점에 등록 함수를, 렌더 중에는 번역 해석 함수를 쓴다 — 번역기만 바꾸고 나머지는 실제 모듈을 쓴다.
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: mocks.lang }),
  // 공용 LoadingState가 useT를 쓴다 — 라벨을 명시 전달하므로 키 반환 스텁으로 충분하다.
  useT: () => (key: string) => key,
}));

const catalogFixture = {
  generatedAt: "2026-10-02T00:00:00.000Z",
  categories: ["publishing"],
  providers: [
    {
      id: "external-webtoon-platforms",
      name: "외부 웹툰 플랫폼",
      category: "publishing",
      summary: "승인 API가 없는 플랫폼용 규격 검사와 업로드 패키지를 준비합니다.",
      capabilities: ["규격 검사"],
      connectionMode: "manual-upload",
      activation: "none",
      configured: true,
      executable: false,
      status: "manual",
      statusReason: "공급자 승인 API가 없어 직접 업로드용 패키지로 종료합니다.",
    },
    {
      id: "rss-json-feed",
      name: "RSS · JSON Feed",
      category: "publishing",
      summary: "내 도메인에서 바로 구독할 수 있는 공개 피드를 생성합니다.",
      capabilities: ["RSS 2.0"],
      connectionMode: "public-feed",
      activation: "none",
      configured: true,
      executable: true,
      status: "ready",
      statusReason: "외부 계정 없이 바로 생성할 수 있습니다.",
    },
  ],
};

const packageFixture = {
  schema: "toonstudio.publish-package/v1",
  createdAt: "2026-10-02T10:00:00.000Z",
  projectId: "demo-project",
  title: "별빛 항해자",
  description: "",
  canonicalUrl: "https://example.com/showcase",
  channels: [
    {
      id: "external-webtoon-platforms",
      name: "외부 웹툰 플랫폼",
      valid: true,
      executable: false,
      mode: "manual-upload",
      status: "manual",
      reason: "규격 검사를 통과했습니다. 플랫폼 업로드 화면에서 패키지 ZIP을 직접 올려 주세요.",
    },
    {
      id: "rss-json-feed",
      name: "RSS · JSON Feed",
      valid: true,
      executable: true,
      mode: "public-feed",
      status: "ready",
      reason: "피드 파일을 바로 배포할 수 있습니다.",
    },
  ],
  tags: [],
  packageDigest: "9f2c1ab47de3058192aa",
  ready: true,
  directlyExecutable: false,
  notices: ["수동 업로드 채널은 플랫폼 화면에서 최종 확인을 마쳐야 발행이 끝납니다."],
};

function renderPage(initialPath = "/publish") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PublishCenterPage />
    </MemoryRouter>,
  );
}

describe("PublishCenterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lang = "ko";
    mocks.catalog.mockResolvedValue(catalogFixture);
    mocks.buildPublishPackage.mockResolvedValue(packageFixture);
    mocks.buildFeedPreview.mockResolvedValue({
      rss: "<rss/>",
      jsonFeed: {},
      activityPub: [],
      digest: "77aa10bc",
    });
  });

  it("플랫폼 카드에 상태 배지와 수동 업로드 정직 표기가 렌더링된다", async () => {
    const { container } = renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    expect(screen.getByText("수동 완주 가능")).toBeTruthy();
    expect(screen.getByText("직접 업로드용 패키지로 준비돼요")).toBeTruthy();
    expect(screen.getByText("사용 가능")).toBeTruthy();
    // 기본 선택 채널 2개가 체크된 상태로 시작한다 (기존 기본값 계약).
    const webtoon = container.querySelector<HTMLInputElement>("#publish-channel-external-webtoon-platforms");
    const feed = container.querySelector<HTMLInputElement>("#publish-channel-rss-json-feed");
    expect(webtoon?.checked).toBe(true);
    expect(feed?.checked).toBe(true);
  });

  it("제목이 비어 있으면 만들 수 없고, 입력하면 작품 히어로와 버튼이 함께 바뀐다", async () => {
    renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    const buildButton = screen.getByRole("button", { name: /패키지 만들기/ });
    expect((buildButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("제목만 채우면 만들 수 있어요.")).toBeTruthy();

    const titleInput = screen.getByLabelText("제목");
    fireEvent.change(titleInput, { target: { value: "별빛 항해자" } });
    expect(screen.getByRole("heading", { name: "별빛 항해자" })).toBeTruthy();
    expect((buildButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("채널을 모두 해제하면 다시 만들 수 없게 된다", async () => {
    const { container } = renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "별빛 항해자" } });
    const buildButton = screen.getByRole("button", { name: /패키지 만들기/ });
    expect((buildButton as HTMLButtonElement).disabled).toBe(false);

    for (const id of ["external-webtoon-platforms", "rss-json-feed"]) {
      const checkbox = container.querySelector<HTMLInputElement>(`#publish-channel-${id}`);
      expect(checkbox).not.toBeNull();
      fireEvent.click(checkbox as HTMLInputElement);
    }
    expect((buildButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/채널 한 곳만 채우면 만들 수 있어요/)).toBeTruthy();
  });

  it("패키지를 만들면 채널별 검사 사유와 안내가 체크리스트로 보인다", async () => {
    renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "별빛 항해자" } });
    fireEvent.click(screen.getByRole("button", { name: /패키지 만들기/ }));

    await waitFor(() => {
      expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1);
    });
    const request = mocks.buildPublishPackage.mock.calls[0]?.[0] as { channels: string[] };
    expect(request.channels).toEqual(["external-webtoon-platforms", "rss-json-feed"]);
    await screen.findByText("규격 검사를 통과했습니다. 플랫폼 업로드 화면에서 패키지 ZIP을 직접 올려 주세요.");
    expect(screen.getByText("수동 업로드 채널은 플랫폼 화면에서 최종 확인을 마쳐야 발행이 끝납니다.")).toBeTruthy();
    expect(screen.getByText("패키지 준비 완료")).toBeTruthy();
  });

  it("?projectId=·?title= 쿼리로 들어오면 작품이 미리 채워지고 그 프로젝트로 패키지를 만든다", async () => {
    renderPage("/publish?projectId=project-hdtxl4&title=%EB%B3%84%EB%B9%9B%20%ED%95%AD%ED%95%B4%EC%9E%90");
    await screen.findByText("외부 웹툰 플랫폼");
    // 내부 식별자는 입력欄으로 노출하지 않는다 — 선택한 작품은 제목으로만 확인한다.
    expect(screen.queryByLabelText("프로젝트 ID")).toBeNull();
    expect(screen.getByText(/선택한 작품 · 별빛 항해자/)).toBeTruthy();
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("별빛 항해자");
    const buildButton = screen.getByRole("button", { name: /패키지 만들기/ });
    expect((buildButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(buildButton);
    await waitFor(() => {
      expect(mocks.buildPublishPackage).toHaveBeenCalledTimes(1);
    });
    const request = mocks.buildPublishPackage.mock.calls[0]?.[0] as { projectId: string };
    expect(request.projectId).toBe("project-hdtxl4");
  });

  it("REA 멀티플랫폼 컷 분할·발행 창구 워크벤치를 렌더링하고 양방향 상태를 전환한다", async () => {
    renderPage();
    await screen.findByText("외부 웹툰 플랫폼");

    const bar = screen.getByTestId("publish-center-rea-multispec-bar");
    expect(bar.textContent).toContain("Naver Webtoon(690px) · Kakao Webtoon(720px) · WEBTOON Global(800px) · Piccoma");

    const sliceNaver = screen.getByTestId("publish-rea-slice-naver-690px-smart");
    const sliceKakao = screen.getByTestId("publish-rea-slice-kakao-720px-alive");
    const sliceGlobal = screen.getByTestId("publish-rea-slice-global-800px-2mb");

    expect(sliceNaver.getAttribute("aria-pressed")).toBe("true");
    expect(sliceKakao.getAttribute("aria-pressed")).toBe("false");
    expect(sliceGlobal.getAttribute("aria-pressed")).toBe("false");

    const winKst = screen.getByTestId("publish-rea-window-kst-2300-prime");
    const winGlobal = screen.getByTestId("publish-rea-window-global-6tz-simulcast");
    const winEmbargo = screen.getByTestId("publish-rea-window-embargo-preview-holdback");

    expect(winKst.getAttribute("aria-pressed")).toBe("true");
    expect(winGlobal.getAttribute("aria-pressed")).toBe("false");
    expect(winEmbargo.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("publish-center-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("네이버 690px 스마트 컷분할");
    expect(status.textContent).toContain("KST 23:00 프라임 예약");

    fireEvent.click(sliceKakao);
    expect(sliceKakao.getAttribute("aria-pressed")).toBe("true");
    expect(sliceNaver.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("카카오 720px 얼라이브 규격");

    fireEvent.click(winGlobal);
    expect(winGlobal.getAttribute("aria-pressed")).toBe("true");
    expect(winKst.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("글로벌 6개 시간대 동시 연재");

    fireEvent.click(sliceGlobal);
    fireEvent.click(winEmbargo);
    expect(sliceGlobal.getAttribute("aria-pressed")).toBe("true");
    expect(winEmbargo.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("글로벌 800px · 2MB 슬라이스");
    expect(status.textContent).toContain("유료 미리보기 엠바고 홀드백");
  });

  it("영어 로케일(en)에서 REA 워크벤치에 한글이 섞이지 않는다", async () => {
    mocks.lang = "en";
    renderPage();
    await screen.findByText("외부 웹툰 플랫폼");

    const bar = screen.getByTestId("publish-center-rea-multispec-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("publish-rea-slice-global-800px-2mb"));
    fireEvent.click(screen.getByTestId("publish-rea-window-embargo-preview-holdback"));
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("publish-center-rea-status").textContent).toContain("Global 800px 2MB Slice");
    expect(screen.getByTestId("publish-center-rea-status").textContent).toContain("Preview Embargo Holdback");
  });

  it("시안 P 스튜디오 원고 출고·기술 아틀라스·신뢰 허브 교차 브리지를 한·영 무혼용으로 렌더링한다", async () => {
    const { unmount } = renderPage();
    await screen.findByText("외부 웹툰 플랫폼");

    const koBridge = screen.getByTestId("publish-surface-cross-bridge");
    expect(koBridge.querySelector('a[href="/studio/publish"]')).not.toBeNull();
    expect(koBridge.querySelector('a[href="/about/technology/architecture"]')).not.toBeNull();
    expect(koBridge.querySelector('a[href="/creator-support"]')).not.toBeNull();
    expect(koBridge.querySelector('a[href="/accessibility"]')).not.toBeNull();

    unmount();
    mocks.lang = "en";
    renderPage();
    await screen.findByText("외부 웹툰 플랫폼");
    const enBridge = screen.getByTestId("publish-surface-cross-bridge");
    expect(enBridge.textContent).not.toMatch(/[가-힣]/u);
  });
});
