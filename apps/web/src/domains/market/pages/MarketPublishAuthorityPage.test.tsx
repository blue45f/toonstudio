// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketPublishAuthorityPage } from "./MarketPublishAuthorityPage";

import type { CreatorMarketplaceResourceIdentity, CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buildCreatorMarketplaceAuthoringManifest, createCreatorMarketplaceAuthoringDraft } from "@/shared/lib/creator-marketplace-authoring-workshop";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";
import { useI18n } from "@/shared/lib/i18n";

const mocks = vi.hoisted(() => ({ session: vi.fn(), identity: vi.fn(), publish: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: mocks.session }));
vi.mock("@/platform/creator-marketplace-client", () => ({
  getCreatorMarketplaceResourceIdentity: mocks.identity,
  publishCreatorMarketplaceResource: mocks.publish,
}));
vi.mock("../components/MarketplaceAuthoringWorkshop", () => ({ MarketplaceAuthoringWorkshop: () => <input aria-label="테스트 워크숍 초안" /> }));

const FIRST_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_ID = "20000000-0000-4000-8000-000000000002";
function parent(id = FIRST_ID, publisherId = "owner-a"): CreatorMarketplaceResourceIdentity {
  return { id, publisherId, packageId: `community/brush/parent-${id}`, kind: "brush", availability: "listed" };
}
function session(userId = "owner-a") {
  return { ready: true, status: "authenticated", data: { user: { id: userId } } };
}
function source(previousResourceId: string | null = FIRST_ID, license = "free") {
  const draft = createCreatorMarketplaceAuthoringDraft("brush");
  return JSON.stringify(buildCreatorMarketplaceAuthoringManifest({ ...draft,
    title: "이름을 바꾼 브러시", summary: "마켓 게시 동선 검증",
    rights: { ...draft.rights, license, originalWorkAttested: true, previewRightsAttested: true },
    release: { ...draft.release, mode: previousResourceId ? "update" : "new", previousResourceId: previousResourceId ?? undefined },
  }));
}
function view() { return <MemoryRouter initialEntries={["/market/publish?section=publish"]}><MarketPublishAuthorityPage /></MemoryRouter>; }
function enter(value: string) { fireEvent.change(screen.getByLabelText("공개 Manifest JSON"), { target: { value } }); }
function submit() { return screen.getByRole("button", { name: "서버에 검수·게시" }) as HTMLButtonElement; }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockReturnValue(session());
  mocks.publish.mockResolvedValue(CREATOR_MARKETPLACE_STARTER_RECORDS[0]!);
});
afterEach(cleanup);

describe("MarketPublishAuthorityPage authoring release identity", () => {
  it("waits for the server identity and publishes the existing package after a rename", async () => {
    const pending = Promise.withResolvers<CreatorMarketplaceResourceIdentity>();
    mocks.identity.mockReturnValue(pending.promise);
    render(view()); enter(source());
    expect(submit().disabled).toBe(true);
    expect(mocks.identity).toHaveBeenCalledWith(FIRST_ID, expect.any(AbortSignal));
    expect(mocks.publish).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(parent()); await pending.promise; });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await screen.findByRole("heading", { name: "서버 게시가 완료되었습니다" });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({
      packageId: parent().packageId, name: "이름을 바꾼 브러시", license: "toonspectrum-standard",
    }), expect.any(AbortSignal));
  });

  it("keeps failed lookups unpublished and allows an explicit retry", async () => {
    mocks.identity.mockRejectedValueOnce(new Error("연결 끊김")).mockResolvedValue(parent());
    render(view()); enter(source());
    expect((await screen.findByRole("alert")).textContent).toContain("연결 끊김");
    expect(submit().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "업데이트 대상 다시 확인" }));
    await waitFor(() => expect(submit().disabled).toBe(false));
    expect(mocks.identity).toHaveBeenCalledTimes(2);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("discards a late response for a previously selected update target", async () => {
    const first = Promise.withResolvers<CreatorMarketplaceResourceIdentity>();
    const second = Promise.withResolvers<CreatorMarketplaceResourceIdentity>();
    mocks.identity.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(view()); enter(source());
    const firstSignal = mocks.identity.mock.calls[0]?.[1] as AbortSignal;
    enter(source(SECOND_ID));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => { first.resolve(parent()); await first.promise; });
    expect(submit().disabled).toBe(true);
    await act(async () => { second.resolve(parent(SECOND_ID)); await second.promise; });
    fireEvent.click(submit());
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ packageId: parent(SECOND_ID).packageId }), expect.any(AbortSignal)));
  });

  it("rejects another publisher's target", async () => {
    mocks.identity.mockResolvedValue(parent(FIRST_ID, "owner-b"));
    render(view()); enter(source());
    expect((await screen.findByRole("alert")).textContent).toContain("본인이 게시한 에셋");
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("invalidates a previously verified parent when the active account changes", async () => {
    mocks.identity.mockResolvedValue(parent());
    const { rerender } = render(view()); enter(source());
    await waitFor(() => expect(submit().disabled).toBe(false));
    mocks.session.mockReturnValue(session("owner-b")); rerender(view());
    expect(submit().disabled).toBe(true);
    await screen.findByRole("alert");
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each(["personal", "custom"])("blocks unsupported %s rights in the actual form", (license) => {
    render(view()); enter(source(null, license));
    expect(submit().disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("사용권");
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("publishes an explicit new standard draft without fetching an update parent", async () => {
    render(view()); enter(source(null));
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await screen.findByRole("heading", { name: "서버 게시가 완료되었습니다" });
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ packageId: expect.stringMatching(/^community\/brush\/[0-9a-f]{32}$/u) }), expect.any(AbortSignal));
  });

  it("keeps a new source editable when an older publication finishes", async () => {
    const pending = Promise.withResolvers<CreatorMarketplaceResourceRecord>();
    mocks.publish.mockReturnValue(pending.promise);
    render(view()); enter(source(null)); fireEvent.click(submit());
    const signal = mocks.publish.mock.calls[0]?.[1] as AbortSignal;
    const next = source(null);
    enter(next);
    expect(signal.aborted).toBe(true);
    expect(submit().disabled).toBe(false);
    await act(async () => { pending.resolve(CREATOR_MARKETPLACE_STARTER_RECORDS[0]!); await pending.promise; });
    expect(screen.queryByRole("heading", { name: "서버 게시가 완료되었습니다" })).toBeNull();
    expect((screen.getByLabelText("공개 Manifest JSON") as HTMLTextAreaElement).value).toBe(next);
  });

  it("releases the form on account change and ignores the previous account's publication", async () => {
    const pending = Promise.withResolvers<CreatorMarketplaceResourceRecord>();
    mocks.publish.mockReturnValue(pending.promise);
    const page = render(view()); enter(source(null)); fireEvent.click(submit());
    const signal = mocks.publish.mock.calls[0]?.[1] as AbortSignal;
    mocks.session.mockReturnValue(session("owner-b")); page.rerender(view());
    expect(signal.aborted).toBe(true);
    expect(submit().disabled).toBe(false);
    await act(async () => { pending.resolve(CREATOR_MARKETPLACE_STARTER_RECORDS[0]!); await pending.promise; });
    expect(screen.queryByRole("heading", { name: "서버 게시가 완료되었습니다" })).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it("does not let stale errors or finally clear a newer publication", async () => {
    const first = Promise.withResolvers<CreatorMarketplaceResourceRecord>();
    const second = Promise.withResolvers<CreatorMarketplaceResourceRecord>();
    mocks.publish.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(view()); enter(source(null)); fireEvent.click(submit());
    enter(source(null)); fireEvent.click(submit());
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    await act(async () => { first.reject(new Error("old request failed")); await first.promise.catch(() => undefined); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "서버에서 검증·게시 중" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { second.resolve(CREATOR_MARKETPLACE_STARTER_RECORDS[0]!); await second.promise; });
    expect(screen.getByRole("heading", { name: "서버 게시가 완료되었습니다" })).toBeTruthy();
  });

  it("keeps the latest selected file when an older read resolves last", async () => {
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    const older = new File([], "older.json", { type: "application/json" });
    const newer = new File([], "newer.json", { type: "application/json" });
    Object.defineProperty(older, "text", { value: () => first.promise });
    Object.defineProperty(newer, "text", { value: () => second.promise });
    const page = render(view());
    const input = page.container.querySelector<HTMLInputElement>("#market-authority-manifest-file")!;
    fireEvent.change(input, { target: { files: [older] } });
    fireEvent.change(input, { target: { files: [newer] } });
    const next = source(null);
    await act(async () => { second.resolve(next); await second.promise; });
    await act(async () => { first.resolve(source(null)); await first.promise; });
    expect((screen.getByLabelText("공개 Manifest JSON") as HTMLTextAreaElement).value).toBe(next);
    expect(screen.getByText("newer.json")).toBeTruthy();
  });

  it("ignores a file read error after the user edits the source", async () => {
    const pending = Promise.withResolvers<string>();
    const file = new File([], "older.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => pending.promise });
    const page = render(view());
    fireEvent.change(page.container.querySelector("#market-authority-manifest-file")!, { target: { files: [file] } });
    const next = source(null); enter(next);
    await act(async () => { pending.reject(new Error("old file failed")); await pending.promise.catch(() => undefined); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("공개 Manifest JSON") as HTMLTextAreaElement).value).toBe(next);
  });

  it("renders the REA preflight simulator and switches validation tracks and license tiers in ko and en", () => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
    render(view());

    const bar = screen.getByTestId("market-publish-rea-preflight-bar");
    expect(bar).toBeTruthy();

    expect(screen.getByTestId("market-publish-rea-track-csp-layer-lt-compat").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("market-publish-rea-tier-indie-single").getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("market-publish-rea-preflight-status");
    expect(status.textContent).toContain("CLIP STUDIO ASSETS");
    expect(status.textContent).toContain("Unity Publisher Validator");
    expect(status.textContent).toContain("Fab");
    expect(status.textContent).toContain("BOOTH");
    expect(status.textContent).toContain("C2PA");

    fireEvent.click(screen.getByTestId("market-publish-rea-track-unity-fab-package-hash"));
    expect(screen.getByTestId("market-publish-rea-track-unity-fab-package-hash").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("market-publish-rea-track-csp-layer-lt-compat").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("Unity Publisher Validator·Fab 텍스처 압축 규격");

    fireEvent.click(screen.getByTestId("market-publish-rea-tier-studio-team-5seat"));
    expect(screen.getByTestId("market-publish-rea-tier-studio-team-5seat").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("market-publish-rea-tier-indie-single").getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toContain("스튜디오·어시 협업 5인권");

    act(() => {
      useI18n.getState().setLang("en");
    });

    expect(status.textContent).toContain("Unity & Fab Package SHA-256 Check");
    expect(status.textContent).toContain("Studio Team 5-Seat License");
    expect(bar.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    act(() => {
      useI18n.getState().setLang("ko");
    });
  });
});


function PublishRouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="publish-route">{location.pathname}{location.search}{location.hash}</output><output data-testid="publish-state">{JSON.stringify(location.state)}</output><button type="button" onClick={() => navigate(-1)}>테스트 뒤로</button><button type="button" onClick={() => navigate(1)}>테스트 앞으로</button></>;
}

it("등록 정문은 두 목적을 먼저 고르고 워크숍·서버 게시를 동시에 노출하지 않는다", () => {
  const { container } = render(<MemoryRouter initialEntries={["/market/publish"]}><MarketPublishAuthorityPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1, name: "에셋 등록" })).toBeTruthy();
  expect(container.querySelector("#market-workshop-task")?.hasAttribute("hidden")).toBe(true);
  expect(container.querySelector("#market-publish-task")?.hasAttribute("hidden")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기 · 이어서 편집" }));
  expect(container.querySelector("#market-workshop-task")?.hasAttribute("hidden")).toBe(false);
  expect(container.querySelector("#market-publish-task")?.hasAttribute("hidden")).toBe(true);
  expect(screen.queryByRole("button", { name: "서버에 검수·게시" })).toBeNull();
});

it("목적 URL과 Back/Forward가 미저장 워크숍·manifest와 query·hash·state를 보존한다", () => {
  render(<MemoryRouter initialEntries={[{ pathname: "/market/publish", search: "?section=publish&x=1&x=2", hash: "#draft", state: { source: "seller" } }]}><MarketPublishAuthorityPage /><PublishRouteProbe /></MemoryRouter>);
  const manifest = screen.getByLabelText("공개 Manifest JSON") as HTMLTextAreaElement;
  enter(source(null));
  const original = manifest.value;
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기 · 이어서 편집" }));
  const draft = screen.getByLabelText("테스트 워크숍 초안") as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "미저장 초안" } });
  expect(screen.getByTestId("publish-route").textContent).toBe("/market/publish?section=workshop&x=1&x=2#draft");
  expect(screen.getByTestId("publish-state").textContent).toBe('{"source":"seller"}');
  fireEvent.click(screen.getByRole("button", { name: "테스트 뒤로" }));
  expect(manifest.value).toBe(original);
  expect(screen.getByRole("button", { name: "서버에 검수·게시" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByTestId("publish-route").textContent).toBe("/market/publish?section=publish&x=1&x=2#draft");
  fireEvent.click(screen.getByRole("button", { name: "테스트 앞으로" }));
  expect(screen.getByLabelText("테스트 워크숍 초안")).toBe(draft);
  expect(draft.value).toBe("미저장 초안");
  expect(manifest.value).toBe(original);
  expect(mocks.publish).not.toHaveBeenCalled();
});

it.each(["/market/publish?source=brush-studio&resume=resume-1", "/market/publish?resume=resume-1"])("기존 저작 handoff 주소 %s는 워크숍으로 이어진다", (entry) => {
  const { container } = render(<MemoryRouter initialEntries={[entry]}><MarketPublishAuthorityPage /></MemoryRouter>);
  expect(container.querySelector("#market-workshop-task")?.hasAttribute("hidden")).toBe(false);
  expect(container.querySelector("#market-publish-task")?.hasAttribute("hidden")).toBe(true);
});


it("판매자 센터의 명세서 만들기 링크는 게시 준비 도구를 펼쳐 열고 게시 권한을 바꾸지 않는다", () => {
  const { container } = render(<MemoryRouter initialEntries={["/market/publish?section=publish#market-publish-preparation"]}><MarketPublishAuthorityPage /></MemoryRouter>);
  expect(container.querySelector<HTMLDetailsElement>("#market-publish-preparation")?.open).toBe(true);
  expect(container.querySelector("#market-publish-task")?.hasAttribute("hidden")).toBe(false);
  expect(submit().disabled).toBe(true);
  expect(mocks.publish).not.toHaveBeenCalled();
});
