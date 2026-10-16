// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRuntimeTranslationPendingKeys,
  loadRuntimeTranslationBundle,
  useI18n,
  useT,
} from "@/shared/lib/i18n";

import { fakePngFile } from "../panel-detect-test-doubles";
import { PANEL_IMPORT_RIGHTS_STATEMENT_KO } from "../panel-import-rights";
import { PanelSourceError, type PanelSourceImage } from "../panel-source-image";

import { PanelCardFlow } from "./PanelCardFlow";
import { PanelImportEnvironmentContext } from "./panel-import-env";
import { PanelSourceStep } from "./PanelSourceStep";
import { createKit, fakePanelSource, renderWithEnv, sampleReady, samplePage, sampleStrip } from "./panel-ui-test-kit";

import type { ReactElement } from "react";

/**
 * 번역 서비스(MyMemory)로 사용자 값이 나가지 않는다.
 *
 * ko·en 이외의 언어에서는 화면 문구의 영어 원문이 런타임 번역 원문으로 등록되고, 번역 적재가 그 원문을 `q=` 로 번역 서비스에
 * 보낸다. 원문에 파일 이름·행 번호·컷 번호 같은 값이 섞여 있으면 사용자 값이 제3자 서비스로 나가고, 값마다 새 원문(요청)이
 * 생긴다. 그래서 화면 문구의 원문은 값이 빠진 정적 문장이어야 한다(값은 자리표시로 두었다가 번역된 문장에 끼운다).
 *
 * 실행 중 네트워크를 쓰지 않도록 `fetch` 를 가짜로 바꾼다. 번역 서비스 요청은 URL 만 기록하고 받은 원문을 그대로 돌려준다.
 */

const TRANSLATION_HOST = "https://api.mymemory.translated.net/";
const SECRET_FILE = "secret-episode-ja-draft.png";
/**
 * 번역 적재는 언어마다 "이미 시도한 원문"을 모듈 안에 기억한다. 앞선 시험이 같은 언어의 정적 원문을 이미 보냈다면 뒤 시험의 기준 요청 수가
 * 0 이 되어 아무것도 보지 못한 시험과 구별되지 않으므로, 시험마다 서로 다른 언어를 쓴다.
 */
const LANGUAGE = { sourceStep: "ja", cardFlow: "de", rightsAndSize: "fr" } as const;

interface Recorded {
  readonly url: string;
  readonly source: string;
}

const requests: Recorded[] = [];

function installFetch(): void {
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn((input: unknown) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : "";
    if (url.startsWith(TRANSLATION_HOST)) {
      const source = new URL(url).searchParams.get("q") ?? "";
      requests.push({ url, source });
      // 번역된 척 원문을 그대로 돌려준다(자리표시 토큰이 그대로 남아 복원도 통과한다).
      return Promise.resolve(new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: source } }), { status: 200 }));
    }
    // 언어 자산(/i18n/app/…): 이 시험에서는 게시된 번역이 없는 것으로 본다. 영어 원문이 그대로 보인다.
    return Promise.resolve(new Response("", { status: 404 }));
  }));
}

/** 앱에서는 머리글 같은 곳의 useT() 가 번역 적재를 되풀이해 깨운다. 그 역할을 하는 구경꾼. */
function AppShellStandIn(): ReactElement {
  useT();
  return <span data-testid="shell-stand-in" />;
}

/** 번역 적재가 더 할 일이 없어질 때까지 기다린다(새 원문이 등록되면 한 바퀴 더). 시간이 아니라 상태로 기다린다. */
async function settleTranslations(language: string): Promise<void> {
  for (let round = 0; round < 12; round += 1) {
    await act(async () => {
      await loadRuntimeTranslationBundle(language);
      await Promise.resolve();
    });
    if (getRuntimeTranslationPendingKeys(language).length === 0) return;
  }
  throw new Error("번역 적재가 끝나지 않았어요.");
}

function sentSources(): string[] {
  return requests.map((request) => request.source);
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  installFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("번역 서비스로 사용자 값이 나가지 않는다 (ko·en 이외의 화면)", () => {
  it("원본 파일 이름이 들어가는 ‘읽는 중’·‘읽었어요’ 문구가 파일 이름을 번역 요청에 싣지 않는다", async () => {
    const language = LANGUAGE.sourceStep;
    act(() => { useI18n.getState().setLang(language); });
    const kit = createKit();
    let finish: (source: PanelSourceImage) => void = () => undefined;
    const env = { ...kit.env, loadSource: () => new Promise<PanelSourceImage>((resolve) => { finish = resolve; }) };
    render(
      <PanelImportEnvironmentContext.Provider value={env}>
        <AppShellStandIn />
        <PanelSourceStep mode="reflow" onReady={() => undefined} />
      </PanelImportEnvironmentContext.Provider>,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("파일 입력칸을 찾지 못했어요.");
    fireEvent.change(input, { target: { files: [fakePngFile(SECRET_FILE, 400, 560)] } });
    // 읽는 동안: "<파일 이름> 읽는 중…"
    expect(await screen.findByText((text) => text.includes(SECRET_FILE))).toBeTruthy();
    await settleTranslations(language);

    // 다 읽은 뒤: "<파일 이름> (400×560px)를 읽었어요…"
    await act(async () => { finish(fakePanelSource(samplePage(), SECRET_FILE)); });
    await waitFor(() => expect(screen.getAllByText((text) => text.includes(SECRET_FILE)).length).toBeGreaterThan(0));
    await settleTranslations(language);

    expect(requests.length, "번역 서비스 요청이 하나도 없으면 시험이 아무것도 보지 못한 것이다").toBeGreaterThan(0);
    const leaked = sentSources().filter((source) => source.includes(SECRET_FILE) || source.includes("secret-episode"));
    expect(leaked).toEqual([]);
  });

  it("절단선 행 번호처럼 값마다 달라지는 문구는 값이 늘어도 번역 요청을 늘리지 않는다", async () => {
    const language = LANGUAGE.cardFlow;
    act(() => { useI18n.getState().setLang(language); });
    const kit = createKit({ image: sampleStrip() });
    renderWithEnv(
      <>
        <AppShellStandIn />
        <PanelCardFlow ready={sampleReady(sampleStrip())} previewUrl="blob:preview" />
      </>,
      kit.env,
    );
    await screen.findByRole("heading", { name: /^2\. / });
    await waitFor(() => expect(screen.getAllByRole("slider").length).toBeGreaterThan(0));
    await settleTranslations(language);
    const baseline = requests.length;
    expect(baseline, "번역 서비스 요청이 하나도 없으면 시험이 아무것도 보지 못한 것이다").toBeGreaterThan(0);

    // 첫 절단선을 한 행씩 30번 옮긴다 — 화면에는 서로 다른 행 번호가 30개 나온다.
    const slider = screen.getAllByRole("slider")[0];
    if (!(slider instanceof HTMLInputElement)) throw new Error("슬라이더를 찾지 못했어요.");
    const start = Number(slider.value);
    const rows: number[] = [];
    for (let step = 1; step <= 30; step += 1) {
      fireEvent.change(slider, { target: { value: String(start + step) } });
      rows.push(start + step);
      await settleTranslations(language);
    }
    expect(Number((screen.getAllByRole("slider")[0] as HTMLInputElement).value)).toBe(start + 30);

    // 값이 30개 늘었어도 번역 서비스에 새로 나간 원문은 없다(문구의 원문은 값이 빠진 정적 문장이다).
    expect(requests.length - baseline).toBe(0);
    // 어떤 요청에도 화면에 나온 행 번호가 숫자로 섞여 있지 않다.
    const withRow = sentSources().filter((source) => rows.some((row) => new RegExp(`(?<![0-9])${row}(?![0-9])`, "u").test(source)));
    expect(withRow).toEqual([]);
  });

  it("해상도 한도처럼 숫자 값이 들어가는 오류 문구도 값 없이 정적 원문만 보낸다", async () => {
    const language = LANGUAGE.rightsAndSize;
    act(() => { useI18n.getState().setLang(language); });
    const kit = createKit();
    // 읽기 실패 문구(해상도 한도: 실제 값 두 개가 들어간다)도 값 없이 정적 원문만 보낸다.
    const env = { ...kit.env, loadSource: () => Promise.reject(new PanelSourceError("too-many-pixels", { megapixels: 16, pixels: 40_123_456 })) };
    render(
      <PanelImportEnvironmentContext.Provider value={env}>
        <AppShellStandIn />
        <PanelSourceStep mode="cards" onReady={() => undefined} />
      </PanelImportEnvironmentContext.Provider>,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("파일 입력칸을 찾지 못했어요.");
    fireEvent.change(input, { target: { files: [fakePngFile("huge.png", 8000, 5000)] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/40\.1.*16/u);
    await settleTranslations(language);
    expect(requests.length, "번역 서비스 요청이 하나도 없으면 시험이 아무것도 보지 못한 것이다").toBeGreaterThan(0);
    expect(sentSources().filter((source) => /40\.1|huge\.png/u.test(source))).toEqual([]);
  });
});

describe("ko·en 화면은 번역 서비스를 부르지 않는다", () => {
  for (const language of ["ko", "en"] as const) {
    it(`${language} 화면에서 읽기·카드 흐름을 그려도 번역 요청이 0건이다`, async () => {
      act(() => { useI18n.getState().setLang(language); });
      const kit = createKit({ image: sampleStrip() });
      renderWithEnv(
        <>
          <AppShellStandIn />
          <PanelSourceStep mode="cards" onReady={() => undefined} />
          <PanelCardFlow ready={sampleReady(sampleStrip())} previewUrl="blob:preview" />
        </>,
        kit.env,
      );
      await screen.findByRole("heading", { name: /^2\. / });
      await settleTranslations(language);
      expect(screen.getByText(language === "ko" ? PANEL_IMPORT_RIGHTS_STATEMENT_KO : /I own this manuscript/)).toBeTruthy();
      expect(requests).toEqual([]);
    });
  }
});
