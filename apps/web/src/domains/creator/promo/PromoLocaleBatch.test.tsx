// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CREATOR_ECOSYSTEM_STORAGE_KEY,
  EMPTY_CREATOR_ECOSYSTEM_STATE,
  setDialogueTranslation,
  upsertDialogueSource,
  type CreatorEcosystemState,
} from "../ecosystem/creator-ecosystem-model";
import { emptyPromoProject } from "./promo-model";
import { PromoLocaleBatch } from "./PromoLocaleBatch";

import type { PromoLocaleBatchResult } from "./promo-locale-batch";
import type { PromoPanel, PromoProject } from "./promo-model";

const hoisted = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("./promo-locale-downloads", () => ({ downloadPromoLocaleBatch: hoisted.download }));
// jsdom에는 2D 캔버스가 없어 글자 폭 측정만 결정적인 값으로 바꾼다.
vi.mock("../lettering/studio-bubble-text-fit", async (original) => ({
  ...(await original<typeof import("../lettering/studio-bubble-text-fit")>()),
  createCanvasBubbleTextMeasurer: () => ({ measureWidth: (text: string, fontPx: number) => Array.from(text).length * fontPx * 0.6 }),
}));

const PNG = "data:image/png;base64,aGVsbG8=";
const panel = (id: string, caption: string): PromoPanel => ({ id, src: PNG, description: "", caption, motion: "still", fit: "contain", weight: 1 });
function projectOf(captions: readonly string[] = ["어서 와", "오랜만이야", "또 만나"]): PromoProject {
  return { ...emptyPromoProject(), panels: captions.map((caption, index) => panel(`cut-${index}`, caption)) };
}

const rows = [
  { pageId: "p1", elementId: "e1", source: "어서 와" },
  { pageId: "p1", elementId: "e2", source: "오랜만이야" },
  { pageId: "p2", elementId: "e3", source: "또 만나" },
];
const at = "2026-10-15T09:00:00.000Z";
function draft(elementId: string, locale: string, text: string, approved: boolean, source?: string) {
  const row = rows.find((value) => value.elementId === elementId);
  return { id: `${elementId}-${locale}`, pageId: row?.pageId ?? "p1", elementId, source: source ?? row?.source ?? "", locale, text, approved, updatedAt: at };
}
/** en은 전부 승인, ja는 승인 1·초안 1·없음 1, de는 오래됨 1·없음 2. */
function draftsFile(extra: Record<string, unknown> = {}, name = "drafts.json"): File {
  const content = {
    kind: "toonstudio-translation-drafts", version: 1, documentId: "work-1", rows,
    drafts: [
      draft("e1", "en", "Welcome.", true), draft("e2", "en", "Long time no see.", true), draft("e3", "en", "See you.", true),
      draft("e1", "ja", "ようこそ", true), draft("e2", "ja", "久しぶり", false),
      draft("e1", "de", "Willkommen.", true, "어서 와!"),
    ],
    ...extra,
  };
  return new File([JSON.stringify(content)], name, { type: "application/json" });
}

function fileInput(): HTMLInputElement {
  const input = screen.getByLabelText("번역 초안 JSON");
  if (!(input instanceof HTMLInputElement)) throw new Error("파일 입력이 아니에요.");
  return input;
}
function load(file: File): void {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}
async function loaded(file: File = draftsFile()) {
  load(file);
  await screen.findByRole("list", { name: "번역 로케일" });
}
function localeBox(label: RegExp): HTMLInputElement {
  const box = screen.getByRole("checkbox", { name: label });
  if (!(box instanceof HTMLInputElement)) throw new Error("체크박스가 아니에요.");
  return box;
}
/** 로케일 체크박스가 속한 행. */
function rowOf(label: RegExp): HTMLElement {
  const row = localeBox(label).closest("li");
  if (!row) throw new Error("로케일 행을 찾지 못했어요.");
  return row;
}
const exportButton = () => screen.getByRole("button", { name: /ZIP으로 내보내기/u });

class FakeUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(readonly text: string) {}
}
function installSpeech(voices: Array<{ name: string; lang: string; localService: boolean }>) {
  const spoken: FakeUtterance[] = [];
  const synthesis = {
    getVoices: () => voices.map((voice) => ({ ...voice, voiceURI: voice.name, default: false })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => spoken.push(utterance)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: FakeUtterance });
  return { spoken, synthesis };
}

const batchResult = (warningCount = 2): PromoLocaleBatchResult => ({ files: {}, plans: [], warningCount });

beforeEach(() => {
  hoisted.download.mockReset();
  hoisted.download.mockImplementation(() => batchResult());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  Reflect.deleteProperty(window, "speechSynthesis");
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
});

describe("처음 상태", () => {
  it("파일을 고르라는 안내와 초안을 만들지 않는다는 말을 보여 주고 내보내기는 아직 없다", () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    expect(screen.getByRole("heading", { name: "로케일별 자막 일괄 출력 · 음성 미리듣기" })).toBeTruthy();
    expect(screen.getByText(/아직 불러온 번역 초안이 없어요/u)).toBeTruthy();
    expect(screen.getByText(/이 화면에서는 초안을 만들지 않아요/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ZIP으로 내보내기/u })).toBeNull();
    expect(fileInput().accept).toContain(".json");
  });
});

describe("번역 초안 불러오기", () => {
  it("로케일을 가나다·알파벳 순으로 나열하고 승인으로 다 채워지는 로케일만 기본 선택한다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    expect(screen.getByText(/drafts\.json · 초안 6건 · 로케일 3개/u).textContent).toContain("work-1");
    const list = screen.getByRole("list", { name: "번역 로케일" });
    expect(within(list).getAllByRole("checkbox").map((box) => (box as HTMLInputElement).checked)).toEqual([false, true, false]);
    expect(localeBox(/독일어/u).checked).toBe(false);
    expect(localeBox(/영어/u).checked).toBe(true);
    expect(localeBox(/일본어/u).checked).toBe(false);
    expect(exportButton().textContent).toBe("로케일 1개 ZIP으로 내보내기");
  });

  it("로케일마다 승인·초안·오래됨·번역 없음 칩으로 상태를 보여 준다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    const chips = (label: string) => within(screen.getByRole("list", { name: `${label} 번역 상태` })).getAllByRole("listitem").map((item) => item.textContent);
    expect(chips("영어")).toEqual(["승인 3/3컷"]);
    expect(chips("일본어")).toEqual(["승인 1/3컷", "승인 전 초안 1", "번역 없음 1"]);
    expect(chips("독일어")).toEqual(["승인 0/3컷", "오래됨 1", "번역 없음 2"]);
  });

  it("선택한 로케일마다 제목·안내 입력과 경고 요약을 보여 준다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    expect(screen.getByLabelText(/제목 \(비우면 원문\)/u)).toBeTruthy();
    expect(screen.getByLabelText(/마지막 2초 안내 \(비우면 원문\)/u)).toBeTruthy();
    expect(screen.getByText("경고 0건 · 안내 2건")).toBeTruthy();
    fireEvent.click(localeBox(/일본어/u));
    expect(exportButton().textContent).toBe("로케일 2개 ZIP으로 내보내기");
    expect(screen.getByText("경고 1건 · 안내 3건")).toBeTruthy();
    // 번역하지 않은 컷의 이유가 컷 번호와 함께 나온다.
    const details = screen.getAllByText(/경고 1건 · 안내 3건/u)[0]?.closest("details");
    expect(details?.textContent).toContain("컷 3: 이 로케일 번역이 없어 한국어 원문 자막을 썼어요.");
    expect(details?.textContent).toContain("컷 2: 승인되지 않은 초안이라 한국어 원문 자막을 썼어요.");
  });

  it("사용 기준을 켜면 초안·오래된 번역을 쓰고 그 경고가 승격된다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(localeBox(/일본어/u));
    fireEvent.click(screen.getByRole("checkbox", { name: "승인 전 초안도 사용 (경고 표시)" }));
    expect(screen.getByText("경고 2건 · 안내 2건")).toBeTruthy();
    expect(screen.getByText(/컷 2: 승인되지 않은 초안을 썼어요\. 공개 전에 검토·승인하세요\./u)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "오래된 번역도 사용 (경고 표시)" }));
    fireEvent.click(localeBox(/독일어/u));
    expect(screen.getByText(/컷 1: 번역 초안이 이전 원문 기준이라 오래되었어요\. 그대로 썼으니 의미가 맞는지 확인하세요\./u)).toBeTruthy();
  });

  it("현재 원문(rows)이 없는 파일은 오래됨을 판정할 수 없다고 알린다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded(draftsFile({ rows: undefined }));
    expect(screen.getByText(/오래된 번역\(stale\)을 판정할 수 없어요/u)).toBeTruthy();
  });

  it("컷이 없으면 내보낼 수 없다고 알린다", async () => {
    render(<PromoLocaleBatch project={projectOf([])} disabled={false} />);
    await loaded();
    expect(screen.getByText(/컷이 없어요\. 컷을 먼저 추가하면/u)).toBeTruthy();
    expect(exportButton().hasAttribute("disabled")).toBe(true);
  });

  it("컷은 있어도 자막이 하나도 없으면 바꿀 자막이 없다고 알린다", async () => {
    render(<PromoLocaleBatch project={projectOf(["", "  "])} disabled={false} />);
    await loaded();
    expect(screen.getByText(/컷에 자막이 하나도 없어요/u)).toBeTruthy();
    expect(screen.queryByText(/컷이 없어요\. 컷을 먼저 추가하면/u)).toBeNull();
  });

  it("고르지 않은 로케일은 내보내기 대상에서 빠지고, 하나도 안 고르면 내보낼 수 없다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(localeBox(/영어/u));
    expect(exportButton().textContent).toBe("로케일 0개 ZIP으로 내보내기");
    expect(exportButton().hasAttribute("disabled")).toBe(true);
    expect(screen.queryByLabelText(/제목 \(비우면 원문\)/u)).toBeNull();
  });

  it("읽지 못하면 이유와 함께 다시 시도·다른 파일 선택을 주고, 다시 시도하면 같은 파일을 다시 읽는다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    const bad = new File(["{ 이건 JSON이 아니에요"], "bad.json", { type: "application/json" });
    const read = vi.spyOn(bad, "text");
    await load(bad);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("JSON으로 읽을 수 없는 파일이에요");
    expect(within(alert).getByRole("button", { name: "다른 파일 선택" })).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /ZIP으로 내보내기/u })).toBeNull();
  });

  it("초안이 한 건도 없거나 형식이 틀린 파일은 거절하고 이전에 불러온 내용을 지운다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    await load(draftsFile({ drafts: [] }, "empty.json"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("번역 초안이 한 건도 없는 파일이에요."));
    expect(screen.queryByRole("list", { name: "번역 로케일" })).toBeNull();
    await load(new File([JSON.stringify({ kind: "toonstudio-document-cuts", version: 1, cuts: [] })], "cuts.json"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("컷 묶음 파일이에요"));
  });
});

describe("ZIP 내보내기", () => {
  it("선택한 로케일과 입력한 제목·안내, 사용 기준을 넘기고 결과를 알린다", async () => {
    const project = projectOf();
    render(<PromoLocaleBatch project={project} disabled={false} />);
    await loaded();
    fireEvent.click(localeBox(/일본어/u));
    fireEvent.click(screen.getByRole("checkbox", { name: "승인 전 초안도 사용 (경고 표시)" }));
    fireEvent.change(within(rowOf(/영어/u)).getByLabelText(/제목 \(비우면 원문\)/u), { target: { value: "Under the Stars" } });
    fireEvent.change(within(rowOf(/일본어/u)).getByLabelText(/마지막 2초 안내/u), { target: { value: "いますぐ読む" } });
    fireEvent.click(exportButton());
    expect(screen.getByRole("button", { name: /ZIP으로 내보내기/u }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    const [sentProject, sentBundle, requests] = hoisted.download.mock.calls[0] ?? [];
    expect(sentProject).toBe(project);
    expect(sentBundle).toMatchObject({ documentId: "work-1" });
    expect(requests).toEqual([
      { locale: "en", title: "Under the Stars", cta: "", policy: { includeDrafts: true, includeStale: false } },
      { locale: "ja", title: "", cta: "いますぐ読む", policy: { includeDrafts: true, includeStale: false } },
    ]);
    await waitFor(() => expect(screen.getByText(/로케일 2개의 SRT·VTT·프로젝트 JSON을 ZIP 하나로 저장했어요\. 경고 2건은 manifest\.json에도 적었어요\. 오디오는 만들지 않았어요\./u)).toBeTruthy());
    expect(exportButton().hasAttribute("disabled")).toBe(false);
  });

  it("만드는 동안 진행 안내를 보여 주고 입력을 잠갔다가 끝나면 푼다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(exportButton());
    expect(screen.getByText(/로케일별 파일을 만들고 ZIP으로 묶는 중이에요/u)).toBeTruthy();
    expect(screen.getByRole("region", { name: "로케일별 자막 일괄 출력 · 음성 미리듣기" }).getAttribute("aria-busy")).toBe("true");
    expect(fileInput().disabled).toBe(true);
    expect(localeBox(/영어/u).disabled).toBe(true);
    await waitFor(() => expect(fileInput().disabled).toBe(false));
    expect(hoisted.download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "로케일별 자막 일괄 출력 · 음성 미리듣기" }).getAttribute("aria-busy")).toBe("false");
  });

  it("실패하면 이유를 알리고 파일을 다시 읽지 않고 다시 내보낼 수 있다", async () => {
    hoisted.download.mockImplementationOnce(() => { throw new Error("로케일 묶음이 200MB를 넘어요. 아무 파일도 저장하지 않았어요."); });
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(exportButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("200MB를 넘어요");
    expect(within(alert).queryByRole("button", { name: "다른 파일 선택" })).toBeNull();
    expect(within(alert).queryByRole("button", { name: "다시 시도" })).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 내보내기" }));
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText(/ZIP 하나로 저장했어요/u)).toBeTruthy();
    // 불러온 번역 초안과 선택은 그대로 남아 있다.
    expect(localeBox(/영어/u).checked).toBe(true);
  });

  it("바깥에서 잠그면 모든 입력과 버튼이 잠긴다", async () => {
    const { rerender } = render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    rerender(<PromoLocaleBatch project={projectOf()} disabled />);
    expect(fileInput().disabled).toBe(true);
    expect(localeBox(/일본어/u).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "오래된 번역도 사용 (경고 표시)" }) as HTMLInputElement).disabled).toBe(true);
    expect(exportButton().hasAttribute("disabled")).toBe(true);
  });
});

describe("음성 미리듣기", () => {
  it("브라우저가 음성 합성을 지원하지 않으면 이유를 말한다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    expect(screen.getByText("이 브라우저는 음성 미리듣기를 지원하지 않아요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /미리듣기/u })).toBeNull();
  });

  it("이 기기에 그 로케일의 설치된 음성이 없으면 미리듣기를 주지 않고 오디오 일괄 생성은 지원하지 않는다고 밝힌다", async () => {
    installSpeech([{ name: "Korean", lang: "ko-KR", localService: true }, { name: "Cloud English", lang: "en-US", localService: false }]);
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    expect(screen.getByText(/이 기기에 영어 음성이 설치되어 있지 않아 미리듣기를 제공하지 않아요\. 오디오 일괄 생성과 외부 음성 합성은 지원하지 않아요\./u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /미리듣기/u })).toBeNull();
  });

  it("설치된 음성이 있으면 번역된 컷을 골라 한 줄씩 미리 들려 주고, 다시 누르면 멈춘다", async () => {
    const { spoken, synthesis } = installSpeech([{ name: "Local English", lang: "en-US", localService: true }]);
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    const select = screen.getByLabelText(/미리 들을 컷/u);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["컷 1 · Welcome.", "컷 2 · Long time no see.", "컷 3 · See you."]);
    fireEvent.change(select, { target: { value: "1" } });
    const play = screen.getByRole("button", { name: "미리듣기 · Local English" });
    expect(play.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(play);
    expect(spoken.map((utterance) => utterance.text)).toEqual(["Long time no see."]);
    expect(spoken[0]?.lang).toBe("en-US");
    const stop = screen.getByRole("button", { name: "미리듣기 정지" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText(/미리 들을 컷/u).hasAttribute("disabled")).toBe(true);
    fireEvent.click(stop);
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "미리듣기 · Local English" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("끝까지 읽으면 버튼이 돌아오고, 재생 오류는 안내한다", async () => {
    const { spoken } = installSpeech([{ name: "Local English", lang: "en-US", localService: true }]);
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "미리듣기 · Local English" }));
    spoken[0]?.onend?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "미리듣기 · Local English" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "미리듣기 · Local English" }));
    spoken[1]?.onerror?.({ error: "audio-busy" } as SpeechSynthesisErrorEvent);
    await waitFor(() => expect(screen.getByText(/시스템 음성 오류: audio-busy/u)).toBeTruthy());
    expect(screen.getByRole("button", { name: "미리듣기 · Local English" })).toBeTruthy();
  });

  it("미리듣기 중에 로케일을 끄거나 내보내거나 화면이 닫히면 소리를 멈춘다", async () => {
    const { synthesis } = installSpeech([{ name: "Local English", lang: "en-US", localService: true }]);
    const view = render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "미리듣기 · Local English" }));
    synthesis.cancel.mockClear();
    fireEvent.click(localeBox(/영어/u));
    expect(synthesis.cancel).toHaveBeenCalled();
    fireEvent.click(localeBox(/영어/u));
    fireEvent.click(screen.getByRole("button", { name: "미리듣기 · Local English" }));
    synthesis.cancel.mockClear();
    view.unmount();
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it("쓸 수 있는 번역 자막이 하나도 없으면 미리 들을 자막이 없다고 말한다", async () => {
    installSpeech([{ name: "Local English", lang: "en-US", localService: true }]);
    // 컷 자막이 원문 대사와 이어지지 않아(연결 안 됨) 번역을 쓸 컷이 없다.
    render(<PromoLocaleBatch project={projectOf(["다른 말 하나", "다른 말 둘"])} disabled={false} />);
    await loaded();
    expect(localeBox(/영어/u).checked).toBe(false);
    fireEvent.click(localeBox(/영어/u));
    expect(screen.getByText("미리 들을 번역 자막이 없어요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /미리듣기/u })).toBeNull();
    expect(within(screen.getByRole("list", { name: "영어 번역 상태" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["승인 0/2컷", "원문과 연결 안 됨 2"]);
  });
});

// ── 이 브라우저의 창작 생태계 작업대에서 바로 불러오기 ───────────────────────────────────────────

/** 작업대 화면과 같은 함수로 만든 상태: en은 승인·초안·오래됨 하나씩, ja는 모두 승인. */
function ecosystemState(): CreatorEcosystemState {
  let state = structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
  state = upsertDialogueSource(state, "line-1", "어서 와");
  state = setDialogueTranslation(state, "line-1", "en", "Welcome.", true);
  state = setDialogueTranslation(state, "line-1", "ja", "ようこそ", true);
  state = upsertDialogueSource(state, "line-2", "오랜만이야");
  state = setDialogueTranslation(state, "line-2", "en", "Long time no see.", false);
  state = setDialogueTranslation(state, "line-2", "ja", "久しぶり", true);
  state = upsertDialogueSource(state, "line-3", "또 보자");
  state = setDialogueTranslation(state, "line-3", "en", "See you.", true);
  // 승인한 뒤 원문을 고쳤다 → 개정이 올라가 en 번역은 오래된 번역이고, 새 원문에 다시 번역한 ja는 최신이다.
  state = upsertDialogueSource(state, "line-3", "또 만나");
  state = setDialogueTranslation(state, "line-3", "ja", "また会おう", true);
  return state;
}
function saveEcosystem(state: CreatorEcosystemState = ecosystemState()): void {
  window.localStorage.setItem(CREATOR_ECOSYSTEM_STORAGE_KEY, JSON.stringify(state));
}
const ecosystemButton = () => screen.getByRole("button", { name: "이 브라우저의 창작 생태계 번역 불러오기" });

describe("창작 생태계 작업대에서 불러오기", () => {
  it("파일 없이 저장된 대사 번역을 읽고, 최신이고 모두 승인된 로케일만 기본 선택한다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    await screen.findByRole("list", { name: "번역 로케일" });
    expect(screen.getByText(/창작 생태계 작업대\(이 브라우저\) · 초안 6건 · 로케일 2개 · 대사 3개/u)).toBeTruthy();
    expect(localeBox(/일본어/u).checked).toBe(true);
    expect(localeBox(/영어/u).checked).toBe(false);
    expect(exportButton().textContent).toBe("로케일 1개 ZIP으로 내보내기");
  });

  it("원문 개정이 달라진 번역은 오래됨, 승인 전은 초안으로 칩과 경고에 나타난다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    await screen.findByRole("list", { name: "번역 로케일" });
    const chips = (label: string) => within(screen.getByRole("list", { name: `${label} 번역 상태` })).getAllByRole("listitem").map((item) => item.textContent);
    expect(chips("영어")).toEqual(["승인 1/3컷", "승인 전 초안 1", "오래됨 1"]);
    expect(chips("일본어")).toEqual(["승인 3/3컷"]);
    // 영어를 켜면 쓰지 못한 이유가 컷 번호와 함께 나온다(오래된 번역·승인 전 초안은 원문 자막으로 되돌린다).
    fireEvent.click(localeBox(/영어/u));
    const details = within(rowOf(/영어/u)).getByText(/경고 1건 · 안내 3건/u).closest("details");
    expect(details?.textContent).toContain("컷 2: 승인되지 않은 초안이라 한국어 원문 자막을 썼어요.");
    expect(details?.textContent).toContain("컷 3: 번역 초안이 이전 원문 기준이라 오래되었어요.");
  });

  it("사용 기준을 켜면 오래된 번역도 쓰되 경고가 남는다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    await screen.findByRole("list", { name: "번역 로케일" });
    fireEvent.click(localeBox(/영어/u));
    fireEvent.click(screen.getByRole("checkbox", { name: "오래된 번역도 사용 (경고 표시)" }));
    expect(screen.getByText(/컷 3: 번역 초안이 이전 원문 기준이라 오래되었어요\. 그대로 썼으니 의미가 맞는지 확인하세요\./u)).toBeTruthy();
  });

  it("원문 개정을 모르는 파일 안내는 보이지 않고, 대사 기록에 맞춘 안내를 보여 준다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    await screen.findByRole("list", { name: "번역 로케일" });
    expect(screen.queryByText(/오래된 번역\(stale\)을 판정할 수 없어요/u)).toBeNull();
    expect(screen.getByText(/컷 자막은 창작 생태계 작업대에 저장한 원문과 글자까지 같을 때/u)).toBeTruthy();
  });

  it("내보내기에는 개정 번호가 붙은 묶음이 넘어간다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    await screen.findByRole("list", { name: "번역 로케일" });
    fireEvent.click(exportButton());
    await waitFor(() => expect(hoisted.download).toHaveBeenCalledTimes(1));
    const [, sentBundle, requests] = hoisted.download.mock.calls[0] ?? [];
    expect(sentBundle).toMatchObject({ documentId: null });
    expect((sentBundle as { rows: { elementId: string; revision?: number }[] }).rows.map((row) => [row.elementId, row.revision])).toEqual([["line-1", 0], ["line-2", 0], ["line-3", 1]]);
    expect(requests).toEqual([{ locale: "ja", title: "", cta: "", policy: { includeDrafts: false, includeStale: false } }]);
  });

  it("작업대 번역 관리를 새 탭으로 여는 링크를 준다", () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    const link = screen.getByRole("link", { name: /번역 관리 열기/u });
    expect(link.getAttribute("href")).toBe("/studio/ecosystem#ecosystem-localization");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("(새 탭)");
  });

  it("저장된 기록이 없으면 이유와 만드는 곳을 알려 주고, 저장한 뒤 다시 불러오면 읽는다", async () => {
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("저장된 대사가 없어요");
    expect(screen.queryByRole("list", { name: "번역 로케일" })).toBeNull();
    saveEcosystem();
    fireEvent.click(within(alert).getByRole("button", { name: "다시 불러오기" }));
    await screen.findByRole("list", { name: "번역 로케일" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("대사만 있고 번역이 없으면 번역이 없다고 구분해서 알린다", async () => {
    saveEcosystem(upsertDialogueSource(structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE), "line-1", "원문만"));
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    expect((await screen.findByRole("alert")).textContent).toContain("번역이 한 건도 없어요");
  });

  it("기록이 깨졌으면 깨졌다고 알리고 파일로 불러오도록 안내하며 기록을 지우지 않는다", async () => {
    window.localStorage.setItem(CREATOR_ECOSYSTEM_STORAGE_KEY, "{ 깨짐");
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("읽을 수 없어요");
    expect(within(alert).getByRole("button", { name: "다른 파일 선택" })).toBeTruthy();
    expect(window.localStorage.getItem(CREATOR_ECOSYSTEM_STORAGE_KEY)).toBe("{ 깨짐");
  });

  it("저장소가 막혀 있으면(시크릿 모드 등) 그 이유를 알린다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("차단됨", "SecurityError"); });
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    fireEvent.click(ecosystemButton());
    expect((await screen.findByRole("alert")).textContent).toContain("저장소를 읽을 수 없어요");
  });

  it("파일로 불러온 뒤 작업대에서 다시 불러오면 내용과 선택이 바뀐다", async () => {
    saveEcosystem();
    render(<PromoLocaleBatch project={projectOf()} disabled={false} />);
    await loaded();
    expect(screen.getByText(/drafts\.json/u)).toBeTruthy();
    fireEvent.click(ecosystemButton());
    await waitFor(() => expect(screen.getByText(/창작 생태계 작업대\(이 브라우저\)/u)).toBeTruthy());
    expect(screen.queryByText(/drafts\.json/u)).toBeNull();
    expect(localeBox(/일본어/u).checked).toBe(true);
  });

  it("바깥에서 잠그면 불러오기 버튼도 잠긴다", () => {
    render(<PromoLocaleBatch project={projectOf()} disabled />);
    expect(ecosystemButton().hasAttribute("disabled")).toBe(true);
  });
});
