/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeOneDrive,
  downloadFromGoogleDrive,
  downloadFromOneDrive,
  listGoogleDriveFiles,
  uploadToOneDrive,
} from "./cloud-storage-adapter";

/** 팝업 창 대역. location.hash 는 테스트가 바꿔 가며 OAuth 응답 도착을 흉내 낸다. */
function fakePopup() {
  const state = { hash: "", closed: false };
  const popup = {
    get closed() { return state.closed; },
    close: vi.fn(() => { state.closed = true; }),
    get location() { return { hash: state.hash }; },
  };
  return { popup, state };
}

function openedAuthUrl(open: ReturnType<typeof vi.spyOn>): URL {
  const first = open.mock.calls[0]?.[0];
  return new URL(String(first));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OneDrive 암시적 인증 응답 검증", () => {
  it("state 가 일치하지 않는 응답의 토큰은 받아들이지 않고 팝업을 닫는다", async () => {
    const { popup, state } = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const pending = authorizeOneDrive("client-id");
    const rejection = expect(pending).rejects.toThrow("state");
    // 공격자가 끼워 넣은 응답: 우리가 발급하지 않은 state 로 온 토큰.
    state.hash = "#access_token=attacker-token&token_type=Bearer&expires_in=3600&state=attacker-state";
    await vi.advanceTimersByTimeAsync(400);
    await rejection;
    expect(popup.close).toHaveBeenCalled();
  });

  it("state 가 아예 없는 응답도 거부한다", async () => {
    const { popup, state } = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const pending = authorizeOneDrive("client-id");
    const rejection = expect(pending).rejects.toThrow("state");
    state.hash = "#access_token=attacker-token&token_type=Bearer&expires_in=3600";
    await vi.advanceTimersByTimeAsync(400);
    await rejection;
    expect(popup.close).toHaveBeenCalled();
  });

  it("발급한 state 와 일치하는 응답의 토큰만 받는다", async () => {
    const { popup, state } = fakePopup();
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const pending = authorizeOneDrive("client-id");
    const issuedState = openedAuthUrl(open).searchParams.get("state");
    expect(issuedState).toMatch(/^[0-9a-f-]{36}$/u);
    state.hash = `#access_token=good-token&token_type=Bearer&expires_in=1800&state=${issuedState}`;
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toMatchObject({ provider: "onedrive", accessToken: "good-token" });
    expect(popup.close).toHaveBeenCalled();
  });

  it("공급자가 오류를 돌려주면 토큰 없이 그 오류로 실패한다", async () => {
    const { popup, state } = fakePopup();
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const pending = authorizeOneDrive("client-id");
    const issuedState = openedAuthUrl(open).searchParams.get("state");
    const rejection = expect(pending).rejects.toThrow("access_denied");
    state.hash = `#error=access_denied&state=${issuedState}`;
    await vi.advanceTimersByTimeAsync(400);
    await rejection;
  });
});

describe("클라우드 API 요청 URL 구성", () => {
  it("Google Drive 폴더 이름의 따옴표·역슬래시는 질의 문법에서 이스케이프한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listGoogleDriveFiles("token", "Evil' or name contains '\\");
    const firstUrl = new URL(String((fetchMock.mock.calls as unknown[][])[0]?.[0]));
    expect(firstUrl.searchParams.get("q")).toBe(
      "mimeType='application/vnd.google-apps.folder' and name='Evil\\' or name contains \\'\\\\' and trashed=false",
    );
  });

  it("파일 ID 는 경로 구분자·질의 문자를 인코딩해 다른 API 경로로 새지 않게 한다", async () => {
    const fetchMock = vi.fn(async () => new Response("data", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await downloadFromGoogleDrive("token", "abc/../../upload?x=1");
    await downloadFromOneDrive("token", "abc/../../drives?x=1");
    const urls = (fetchMock.mock.calls as unknown[][]).map((call) => String(call[0]));
    expect(urls[0]).toBe("https://www.googleapis.com/drive/v3/files/abc%2F..%2F..%2Fupload%3Fx%3D1?alt=media");
    expect(urls[1]).toBe("https://graph.microsoft.com/v1.0/me/drive/items/abc%2F..%2F..%2Fdrives%3Fx%3D1/content");
  });

  it("OneDrive 업로드 폴더 경로의 각 구간도 인코딩한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1", webUrl: "https://x.test" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadToOneDrive("token", "a b.png", new Blob(["x"], { type: "image/png" }), "/ToonStudio/내 폴더?x#y");
    const url = String((fetchMock.mock.calls as unknown[][])[0]?.[0]);
    expect(url).toBe(
      "https://graph.microsoft.com/v1.0/me/drive/root:/ToonStudio/%EB%82%B4%20%ED%8F%B4%EB%8D%94%3Fx%23y/a%20b.png:/content",
    );
  });
});
