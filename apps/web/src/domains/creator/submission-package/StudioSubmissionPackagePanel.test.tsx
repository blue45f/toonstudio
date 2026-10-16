// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { unzipSync } from "fflate";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { upsertStoryCharacterProfile } from "../planning/studio-character-profile";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import { createStudioProjectDocument, markStudioProjectDocumentOpened } from "../studio-project-document-store";
import { createStudioProject } from "../studio-project-library-store";
import { updateStudioProjectWorkspaceState } from "../studio-project-workspace-store";
import type * as workspaceHookModule from "../studio-shell/useStudioProjectWorkspace";
import type { StudioProjectWorkspaceController } from "../studio-shell/useStudioProjectWorkspace";
import { StudioSubmissionPackagePanel } from "./StudioSubmissionPackagePanel";
import type { SubmissionCoverInput } from "./submission-package-cover";
import {
  EMPTY_SUBMISSION_DRAFT_TEXT,
  submissionDraftStorageKey,
  writeSubmissionDraftText,
  type SubmissionDraftStorage,
} from "./submission-package-draft-store";
import { gifBytes, imageFile, pngBytes } from "./submission-package.test-fixture";
import type { SubmissionBuildDeps, SubmissionSaveOutcome } from "./use-submission-package-build";

// 캐릭터 시트 불러오기의 '불러오는 중'·'실패' 화면은 실제 훅으로는 만들기 어려워 시험 중에만 훅의 결과를 바꿔 끼운다.
// 평소(override 가 null)에는 실제 훅 결과를 그대로 쓴다.
const workspaceOverride: { current: StudioProjectWorkspaceController | null } = vi.hoisted(() => ({ current: null }));

vi.mock("../studio-shell/useStudioProjectWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof workspaceHookModule>();
  return {
    ...actual,
    useStudioProjectWorkspace: (projectId: string, locale: string) => {
      const real = actual.useStudioProjectWorkspace(projectId, locale);
      return workspaceOverride.current ?? real;
    },
  };
});

const PROJECT_ID = "proj-1";
const FIXED_NOW = new Date("2026-10-15T09:30:00.000Z");
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
const decoder = new TextDecoder();

let previousLanguage = "ko";

beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  act(() => useI18n.setState({ lang: "ko" }));
  window.localStorage.clear();
  workspaceOverride.current = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  workspaceOverride.current = null;
  act(() => useI18n.setState({ lang: previousLanguage }));
  window.localStorage.clear();
});

interface PanelOptions {
  readonly buildDeps?: SubmissionBuildDeps;
  readonly draftStorage?: SubmissionDraftStorage | null;
}

function renderPanel(options: PanelOptions = {}) {
  return render(
    <MemoryRouter>
      <StudioSubmissionPackagePanel
        projectId={PROJECT_ID}
        locale="ko"
        draftStorage={options.draftStorage}
        buildDeps={{ crc32ExecutionMode: "direct-bounded", now: () => FIXED_NOW, renderCoverPdf: async () => PDF_BYTES, ...options.buildDeps }}
      />
    </MemoryRouter>,
  );
}

function seedProject(): void {
  createStudioProject(window.localStorage, {
    id: PROJECT_ID,
    title: "달빛 아래 편의점",
    kind: "webtoon",
    description: "야간 편의점에 찾아오는 손님들의 사연을 듣는 이야기.",
  });
  createStudioProjectDocument(window.localStorage, PROJECT_ID, { id: "doc-1", title: "첫 손님", kind: "webtoon", width: 690, height: 8_000, pageCount: 2 });
}

interface SeedDocument {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly pageCount?: number;
}

/** 실제 저장소 모듈로 프로젝트와 여러 웹툰 문서를 만든다(문서 목록 순서를 직접 흉내 내지 않는다). */
function seedEpisodeDocuments(documents: readonly SeedDocument[]): void {
  createStudioProject(window.localStorage, { id: PROJECT_ID, title: "달빛 아래 편의점", kind: "webtoon", description: "" });
  for (const document of documents) {
    createStudioProjectDocument(window.localStorage, PROJECT_ID, {
      id: document.id,
      title: document.title,
      kind: "webtoon",
      width: 690,
      height: 8_000,
      pageCount: document.pageCount ?? 1,
      createdAt: document.createdAt,
    });
  }
}

function inputValue(element: HTMLElement): string {
  return element instanceof HTMLInputElement ? element.value : "";
}

/** 화면에 놓인 순서대로 [회차 번호, 제목] 을 읽는다. */
function episodeRows(): Array<readonly [string, string]> {
  const numbers = screen.getAllByLabelText("회차 번호").map(inputValue);
  const titles = screen.getAllByLabelText("제목").map(inputValue);
  return numbers.map((number, index): readonly [string, string] => [number, titles[index] ?? ""]);
}

function seedCharacters(): void {
  updateStudioProjectWorkspaceState(window.localStorage, PROJECT_ID, (current) => ({
    ...current,
    story: {
      ...current.story,
      bible: {
        ...current.story.bible,
        characters: [
          { id: "hero", name: "한도깨", aliases: ["도깨"], defaultCostumeId: null, defaultAppearanceId: null },
          { id: "extra", name: "행인", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
        ],
      },
      narrative: upsertStoryCharacterProfile(current.story.narrative, {
        characterId: "hero",
        personality: "겁이 많지만 책임감으로 버틴다.",
        speechStyle: "",
        background: "",
        motivation: "",
        signatureLines: ["오늘 밤만 버티자."],
        appearanceNotes: "",
      }),
    },
  }));
}

function png(name: string, width = 690, totalBytes = 2_000): File {
  return imageFile(pngBytes(width, 4_000, totalBytes), name, "image/png");
}

function episodeCard(label: RegExp): HTMLElement {
  return screen.getByRole("region", { name: label });
}

async function addImages(label: RegExp, files: readonly File[]): Promise<HTMLElement> {
  const input = within(episodeCard(label)).getByLabelText(/원고 이미지 추가/u);
  fireEvent.change(input, { target: { files: [...files] } });
  const firstName = files[0]?.name ?? "";
  await waitFor(() => expect(within(episodeCard(label)).getByText(firstName)).toBeTruthy());
  await waitFor(() => expect(within(episodeCard(label)).queryByText(/읽는 중/u)).toBeNull());
  return episodeCard(label);
}

function fillStory(): void {
  fireEvent.change(screen.getByLabelText("작품 제목"), { target: { value: "달빛 아래 편의점" } });
  fireEvent.change(screen.getByLabelText("로그라인"), { target: { value: "야간 편의점 알바생이 밤마다 찾아오는 손님들의 사연을 듣는다." } });
  fireEvent.change(screen.getByLabelText("시놉시스"), { target: { value: "첫 손님은 길을 잃은 도깨비다.\n\n두 번째 손님은 시간을 파는 상인이다." } });
}

async function fillEverything(): Promise<void> {
  fillStory();
  await addImages(/^1화/u, [png("01.png"), png("02.png")]);
  await addImages(/^2화/u, [png("01.png")]);
  await addImages(/^3화/u, [png("01.png")]);
}

function buildButton(): HTMLElement {
  return screen.getByRole("button", { name: "투고 패키지 만들기" });
}

async function buildAndWaitDone(): Promise<void> {
  await waitFor(() => expect(buildButton().hasAttribute("disabled")).toBe(false));
  fireEvent.click(buildButton());
  await screen.findByText("투고 패키지를 만들었어요.");
}

function fixedSave(outcome: SubmissionSaveOutcome = "download") {
  return vi.fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => outcome);
}

/** 표지 PDF 단계에서 멈춰 세우는 장치. 취소 신호를 받으면 AbortError 로 끝나고, release 하면 PDF 를 돌려준다. */
function pausedCoverPdf() {
  const signals: AbortSignal[] = [];
  const pending: Array<(bytes: Uint8Array) => void> = [];
  const render = vi.fn(
    (_input: SubmissionCoverInput, signal?: AbortSignal) =>
      new Promise<Uint8Array>((resolve, reject) => {
        pending.push(resolve);
        if (signal) {
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new DOMException("취소", "AbortError")), { once: true });
        }
      }),
  );
  const release = (index = 0): void => {
    const resolve = pending[index];
    if (!resolve) throw new Error("멈춰 있는 표지 그리기가 없어요.");
    resolve(PDF_BYTES);
  };
  return { render, release, signals };
}

describe("투고 패키지 화면 — 처음 모습", () => {
  it("로컬 처리 안내, 빈 회차 3칸, 막힌 만들기 버튼과 그 이유를 보여 준다", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "투고 패키지 내보내기" })).toBeTruthy();
    expect(screen.getByText(/모든 처리는 이 브라우저 안에서만 해요/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: "웹툰 계약서 검토 체크리스트" }).getAttribute("href")).toBe("/learn/contract-checklist");
    for (const label of [/^1화$/u, /^2화$/u, /^3화$/u]) expect(episodeCard(label)).toBeTruthy();
    // 이어진 문서가 없으면 번호를 어떻게 붙였는지 알릴 일이 없다.
    expect(screen.queryByText(/회차 번호는 스튜디오 문서 제목의 숫자/u)).toBeNull();
    expect(screen.getByText("이미지가 담긴 회차 0화 / 투고에는 최소 3화가 필요해요.")).toBeTruthy();
    expect(screen.getByText("필수 구성 0 / 5")).toBeTruthy();

    const build = buildButton();
    expect(build.hasAttribute("disabled")).toBe(true);
    const reason = document.getElementById(build.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toMatch(/막는 문제 \d+건을 먼저 고쳐 주세요/u);
  });

  it("프로젝트의 이름·설명·웹툰 문서를 출발점으로 쓰고, 문서가 모자라면 빈 칸을 이어 둔다", () => {
    seedProject();
    renderPanel();

    expect(screen.getByLabelText("작품 제목")).toHaveProperty("value", "달빛 아래 편의점");
    const first = episodeCard(/^1화/u);
    expect(within(first).getByLabelText("제목")).toHaveProperty("value", "첫 손님");
    expect(within(first).getByText(/연결된 스튜디오 문서: 690 × 8000px · 2쪽/u)).toBeTruthy();
    expect(episodeCard(/^2화$/u)).toBeTruthy();
    expect(episodeCard(/^3화$/u)).toBeTruthy();

    const synopsis = screen.getByLabelText("시놉시스");
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 설명 넣기" }));
    expect(synopsis).toHaveProperty("value", "야간 편의점에 찾아오는 손님들의 사연을 듣는 이야기.");
    expect(screen.getByRole("button", { name: "프로젝트 설명 넣기" }).hasAttribute("disabled")).toBe(true);
  });

  it("1·2·3화 문서를 순서대로 만든 프로젝트는 최근에 연 순이 아니라 1·2·3 번호 칸으로 담는다", () => {
    seedEpisodeDocuments([
      { id: "doc-1", title: "1화 편의점의 밤", createdAt: "2026-10-15T09:00:00.000Z", pageCount: 2 },
      { id: "doc-2", title: "2화 도깨비 손님", createdAt: "2026-10-15T09:01:00.000Z", pageCount: 3 },
      { id: "doc-3", title: "3화 시간 상인", createdAt: "2026-10-15T09:02:00.000Z", pageCount: 4 },
    ]);
    // 문서 목록은 '최근에 연 순(내림차순)'이다. 이 전제가 바뀌면 아래 시험이 무엇을 막는지 알 수 없으므로 함께 못 박아 둔다.
    expect(readStudioProjectDocuments(window.localStorage, PROJECT_ID).documents.map((document) => document.id)).toEqual(["doc-3", "doc-2", "doc-1"]);

    renderPanel();

    expect(episodeRows()).toEqual([
      ["1", "1화 편의점의 밤"],
      ["2", "2화 도깨비 손님"],
      ["3", "3화 시간 상인"],
    ]);
    // 칸마다 이어진 문서의 기록도 같은 문서의 것이다(번호만 맞고 문서가 어긋나지 않는다).
    expect(within(episodeCard(/^1화/u)).getByText(/연결된 스튜디오 문서: 690 × 8000px · 2쪽/u)).toBeTruthy();
    expect(within(episodeCard(/^3화/u)).getByText(/연결된 스튜디오 문서: 690 × 8000px · 4쪽/u)).toBeTruthy();
  });

  it("회차 숫자가 없는 제목은 마지막에 연 문서와 상관없이 만든 순서대로 번호를 붙이고, 번호를 붙인 방식을 알린다", () => {
    seedEpisodeDocuments([
      { id: "doc-1", title: "첫 손님", createdAt: "2026-10-15T09:00:00.000Z" },
      { id: "doc-2", title: "두 번째 손님", createdAt: "2026-10-15T09:01:00.000Z" },
      { id: "doc-3", title: "세 번째 손님", createdAt: "2026-10-15T09:02:00.000Z" },
    ]);
    markStudioProjectDocumentOpened(window.localStorage, PROJECT_ID, "doc-2", undefined, { at: "2026-10-15T10:00:00.000Z" });
    expect(readStudioProjectDocuments(window.localStorage, PROJECT_ID).documents.map((document) => document.id)).toEqual(["doc-2", "doc-3", "doc-1"]);

    renderPanel();

    expect(episodeRows()).toEqual([
      ["1", "첫 손님"],
      ["2", "두 번째 손님"],
      ["3", "세 번째 손님"],
    ]);
    expect(screen.getByText(/회차 번호는 스튜디오 문서 제목의 숫자.*만든 순서로 붙였어요/u)).toBeTruthy();
  });

  it("모든 문서 제목에 회차 숫자가 있으면 만든 순서와 달라도 제목의 숫자를 번호로 쓴다", () => {
    seedEpisodeDocuments([
      { id: "doc-a", title: "3화 시간 상인", createdAt: "2026-10-15T09:00:00.000Z" },
      { id: "doc-b", title: "1화 편의점의 밤", createdAt: "2026-10-15T09:01:00.000Z" },
      { id: "doc-c", title: "2화 도깨비 손님", createdAt: "2026-10-15T09:02:00.000Z" },
    ]);

    renderPanel();

    expect(episodeRows()).toEqual([
      ["1", "1화 편의점의 밤"],
      ["2", "2화 도깨비 손님"],
      ["3", "3화 시간 상인"],
    ]);
  });

  it("같은 시각에 만들어진 문서(가져온 프로젝트)는 제목의 숫자 크기 순으로 놓는다(10화가 2화 앞에 오지 않는다)", () => {
    const at = "2026-10-15T09:00:00.000Z";
    seedEpisodeDocuments([
      { id: "doc-x", title: "10화 마지막 손님", createdAt: at },
      { id: "doc-y", title: "2화 도깨비 손님", createdAt: at },
      { id: "doc-z", title: "1화 편의점의 밤", createdAt: at },
    ]);

    renderPanel();

    expect(episodeRows()).toEqual([
      ["1", "1화 편의점의 밤"],
      ["2", "2화 도깨비 손님"],
      ["10", "10화 마지막 손님"],
    ]);
  });

  it("지난번에 적은 글은 복원하고 이미지는 다시 고르라고 알린다", () => {
    writeSubmissionDraftText(window.localStorage, PROJECT_ID, {
      ...EMPTY_SUBMISSION_DRAFT_TEXT,
      title: "저장된 제목",
      targetWidth: "kakao",
      episodes: [{ id: "saved-1", number: 4, title: "넷째 손님", note: "메모" }],
    });
    renderPanel();

    expect(screen.getByLabelText("작품 제목")).toHaveProperty("value", "저장된 제목");
    expect(screen.getByLabelText("가로 폭 점검 기준")).toHaveProperty("value", "kakao");
    expect(episodeCard(/^4화/u)).toBeTruthy();
    expect(screen.getByText(/이미지 파일은 저장하지 않으므로 다시 골라 주세요/u)).toBeTruthy();
  });

  it("글만 이 브라우저에 저장하고 이미지 내용은 저장하지 않는다", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("작품 제목"), { target: { value: "저장될 제목" } });
    await addImages(/^1화/u, [png("01.png")]);

    const key = submissionDraftStorageKey(PROJECT_ID);
    await waitFor(() => expect(window.localStorage.getItem(key)).toContain("저장될 제목"), { timeout: 3_000 });
    const stored = window.localStorage.getItem(key) ?? "";
    expect(stored).not.toContain("01.png");
    expect(stored).not.toContain("PNG");
  });

  it("저장소를 쓸 수 없으면 사라질 수 있다고 알린다", () => {
    renderPanel({ draftStorage: null });
    expect(screen.getByText("이 브라우저에서는 쓰던 글을 저장할 수 없어요. 이 화면을 닫으면 적은 내용이 사라져요.")).toBeTruthy();
  });
});

describe("투고 패키지 화면 — 캐릭터 시트 상태", () => {
  it("스토리 바이블에 캐릭터가 없으면 빈 상태와 시트 쓰기 링크를 보여 준다", () => {
    renderPanel();
    expect(screen.getByText("스토리 바이블에 캐릭터가 아직 없어요. 캐릭터를 만들고 시트를 적으면 여기에 나타나요.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "스토리 > 캐릭터에서 시트 쓰기" });
    expect(link.getAttribute("href")).toContain(`/studio/p/${PROJECT_ID}/story`);
  });

  it("시트를 쓴 캐릭터만 기본으로 담고, 비어 있는 캐릭터는 이유와 함께 빼 둔다", () => {
    seedCharacters();
    renderPanel();

    const hero = screen.getByRole("checkbox", { name: /한도깨/u });
    const extra = screen.getByRole("checkbox", { name: /행인/u });
    expect(hero).toHaveProperty("checked", true);
    expect(extra).toHaveProperty("checked", false);
    expect(screen.getByText("시트 2칸 작성")).toBeTruthy();
    expect(screen.getByText("시트가 비어 있어요")).toBeTruthy();

    fireEvent.click(extra);
    expect(extra).toHaveProperty("checked", true);
    fireEvent.click(hero);
    expect(hero).toHaveProperty("checked", false);
  });

  it("불러오는 동안은 진행 중임을 알린다", () => {
    workspaceOverride.current = { state: null, error: null, update: () => null, reload: vi.fn() };
    renderPanel();
    const status = screen.getByText("캐릭터 시트를 불러오는 중…").closest("[role='status']");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText(/캐릭터가 아직 없어요/u)).toBeNull();
  });

  it("불러오지 못하면 이유를 알리고 다시 불러오기를 누를 수 있다", () => {
    const reload = vi.fn();
    workspaceOverride.current = { state: null, error: "저장소를 읽지 못했어요.", update: () => null, reload };
    renderPanel();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("캐릭터 시트를 불러오지 못했어요.");
    expect(alert.textContent).toContain("저장소를 읽지 못했어요.");
    fireEvent.click(within(alert).getByRole("button", { name: "다시 불러오기" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("투고 패키지 화면 — 회차 원고", () => {
  it("고른 이미지의 크기를 읽어 보여 주고 순서를 바꾸거나 뺄 수 있다", async () => {
    renderPanel();
    const card = await addImages(/^1화/u, [png("01.png"), png("02.png", 690, 3_000)]);

    const list = within(card).getByRole("list", { name: "1화 원고 이미지 목록" });
    const rows = () => within(list).getAllByRole("listitem");
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.textContent).toContain("01.png");
    expect(rows()[0]?.textContent).toContain("690 × 4000px");
    expect(within(card).getByText(/이미지 2장 · 가로 폭 690px · 합계/u)).toBeTruthy();

    expect(within(card).getByRole("button", { name: "01.png을(를) 위로 옮기기" }).hasAttribute("disabled")).toBe(true);
    expect(within(card).getByRole("button", { name: "02.png을(를) 아래로 옮기기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(card).getByRole("button", { name: "02.png을(를) 위로 옮기기" }));
    expect(rows()[0]?.textContent).toContain("02.png");
    expect(rows()[1]?.textContent).toContain("01.png");

    fireEvent.click(within(card).getByRole("button", { name: "02.png을(를) 목록에서 빼기" }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain("01.png");
  });

  it("담을 수 없는 형식은 읽지 못했다고 이유와 함께 알리고 만들기를 막는다", async () => {
    renderPanel();
    const card = await addImages(/^2화/u, [imageFile(gifBytes(), "anim.gif", "image/gif")]);

    expect(within(card).getByText("읽지 못함")).toBeTruthy();
    expect(within(card).getAllByText("‘anim.gif’은(는) 담을 수 없는 형식이에요").length).toBeGreaterThan(0);
    expect(screen.getAllByText("‘anim.gif’은(는) 담을 수 없는 형식이에요").length).toBeGreaterThan(1);
    expect(buildButton().hasAttribute("disabled")).toBe(true);
  });

  it("점검 기준 폭과 다른 이미지는 경고로 알리고 기준을 바꾸면 다시 계산한다", async () => {
    renderPanel();
    const card = await addImages(/^3화/u, [png("wide.png", 720)]);

    expect(within(card).getByText("폭 기준 690px과 달라요")).toBeTruthy();
    expect(screen.getAllByText("1장이 네이버 690px이 아니에요 (현재 720px)").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("가로 폭 점검 기준"), { target: { value: "kakao" } });
    expect(within(episodeCard(/^3화/u)).queryByText(/폭 기준 .*달라요/u)).toBeNull();
    expect(screen.queryByText("1장이 네이버 690px이 아니에요 (현재 720px)")).toBeNull();

    fireEvent.change(screen.getByLabelText("가로 폭 점검 기준"), { target: { value: "any" } });
    expect(within(episodeCard(/^3화/u)).queryByText(/폭 기준 .*달라요/u)).toBeNull();
  });

  it("회차를 더하고 지울 수 있다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "회차 추가" }));
    expect(episodeCard(/^4화$/u)).toBeTruthy();
    fireEvent.click(within(episodeCard(/^4화$/u)).getByRole("button", { name: "4화 지우기" }));
    expect(screen.queryByRole("region", { name: /^4화$/u })).toBeNull();
  });
});

describe("투고 패키지 화면 — 만들기와 저장", () => {
  it("3화와 캐릭터 시트를 ZIP 으로 묶고 저장한다", async () => {
    seedCharacters();
    const save = fixedSave("download");
    renderPanel({ buildDeps: { save } });
    await fillEverything();
    expect(screen.getByText(/^만들 수 있어요 · 알릴 내용 \d+건$/u)).toBeTruthy();

    await buildAndWaitDone();
    expect(screen.getByText(/달빛 아래 편의점-submission-20261015-093000Z\.zip · 파일 9개 · /u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ZIP 저장" }));
    await screen.findByText("다운로드를 시작했어요. 브라우저의 다운로드 폴더를 확인해 주세요.");
    expect(save).toHaveBeenCalledTimes(1);
    const call = save.mock.calls[0];
    if (!call) throw new Error("저장이 호출돼야 해요.");
    const [blob, fileName] = call;
    expect(fileName).toBe("달빛 아래 편의점-submission-20261015-093000Z.zip");

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(
      [
        "cover.md",
        "cover.pdf",
        "synopsis.md",
        "characters.md",
        "manifest.json",
        "episodes/ep-001/p-001.png",
        "episodes/ep-001/p-002.png",
        "episodes/ep-002/p-001.png",
        "episodes/ep-003/p-001.png",
      ].sort(),
    );
    const characters = decoder.decode(files["characters.md"]);
    expect(characters).toContain("한도깨");
    expect(characters).not.toContain("행인");
    expect(decoder.decode(files["cover.md"])).toContain("달빛 아래 편의점");
    const manifest: unknown = JSON.parse(decoder.decode(files["manifest.json"]));
    expect(manifest).toMatchObject({ schema: "toonstudio.submission-package/v1", totals: { episodes: 3, pages: 4, characterSheets: 1 } });
  });

  it("고른 캐릭터만 characters.md 에 들어간다", async () => {
    seedCharacters();
    const save = fixedSave();
    renderPanel({ buildDeps: { save } });
    fillStory();
    await addImages(/^1화/u, [png("01.png")]);
    await addImages(/^2화/u, [png("01.png")]);
    await addImages(/^3화/u, [png("01.png")]);
    fireEvent.click(screen.getByRole("checkbox", { name: /행인/u }));
    fireEvent.click(screen.getByRole("checkbox", { name: /한도깨/u }));

    await buildAndWaitDone();
    fireEvent.click(screen.getByRole("button", { name: "ZIP 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const call = save.mock.calls[0];
    if (!call) throw new Error("저장이 호출돼야 해요.");
    const files = unzipSync(new Uint8Array(await call[0].arrayBuffer()));
    const characters = decoder.decode(files["characters.md"]);
    expect(characters).toContain("행인");
    expect(characters).not.toContain("한도깨");
  });

  it("표지 PDF 를 그리지 못해도 PDF 없이 만들고 이유를 알린다", async () => {
    renderPanel({
      buildDeps: {
        renderCoverPdf: async () => {
          throw new Error("canvas unavailable");
        },
      },
    });
    await fillEverything();
    await buildAndWaitDone();
    expect(screen.getByText("이 브라우저에서 표지 PDF 를 그리지 못해 PDF 없이 만들었어요. 표지는 cover.md 에 들어 있어요.")).toBeTruthy();
  });

  it("저장 위치를 고르다 취소하거나 저장에 실패해도 만든 패키지는 그대로 두고 알린다", async () => {
    const save = vi
      .fn(async (_blob: Blob, _fileName: string): Promise<SubmissionSaveOutcome> => "cancelled")
      .mockImplementationOnce(async () => "cancelled")
      .mockImplementationOnce(async () => {
        throw new Error("disk full");
      })
      .mockImplementationOnce(async () => "file-handle");
    renderPanel({ buildDeps: { save } });
    await fillEverything();
    await buildAndWaitDone();

    fireEvent.click(screen.getByRole("button", { name: "ZIP 저장" }));
    await screen.findByText("저장을 취소했어요. 만든 패키지는 그대로 있어요.");

    fireEvent.click(screen.getByRole("button", { name: "ZIP 저장" }));
    expect((await screen.findByRole("alert")).textContent).toBe("저장하지 못했어요. 다시 ‘ZIP 저장’을 눌러 주세요.");

    fireEvent.click(screen.getByRole("button", { name: "ZIP 저장" }));
    await screen.findByText("선택한 위치에 저장했어요.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("만든 뒤에 내용을 고치면 ZIP 에 반영되지 않았다고 알리고 새로 만들 수 있다", async () => {
    renderPanel();
    await fillEverything();
    await buildAndWaitDone();
    expect(screen.queryByText(/이 ZIP 을 만든 뒤에 내용을 고쳤어요/u)).toBeNull();

    fireEvent.change(screen.getByLabelText("작품 제목"), { target: { value: "새 제목" } });
    expect(await screen.findByText(/이 ZIP 을 만든 뒤에 내용을 고쳤어요/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "고쳐서 다시 만들기" }));
    expect(buildButton().hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText("투고 패키지를 만들었어요.")).toBeNull();
  });

  it("만드는 중에는 진행을 알리고, 취소하면 아무것도 저장하지 않으며 다시 만들 수 있다", async () => {
    const paused = pausedCoverPdf();
    const save = fixedSave();
    renderPanel({ buildDeps: { renderCoverPdf: paused.render, save } });
    await fillEverything();

    await waitFor(() => expect(buildButton().hasAttribute("disabled")).toBe(false));
    fireEvent.click(buildButton());
    expect(await screen.findByText("점검하고 표지를 만드는 중…")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "패키지 만들기 진행률" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(await screen.findByText("만들기를 취소했어요. 아무것도 저장되지 않았고 다시 만들 수 있어요.")).toBeTruthy();
    expect(paused.signals[0]?.aborted).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).toBeNull();

    paused.render.mockImplementation(async () => PDF_BYTES);
    fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
    expect(await screen.findByText("투고 패키지를 만들었어요.")).toBeTruthy();
  });

  it("읽는 도중 파일을 읽을 수 없게 되면 이유를 알리고, 다시 시도하면 만들어진다", async () => {
    renderPanel();
    await fillEverything();
    await waitFor(() => expect(buildButton().hasAttribute("disabled")).toBe(false));

    const original = Blob.prototype.arrayBuffer;
    let failuresLeft = 1;
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(function (this: Blob) {
      if (failuresLeft > 0 && this instanceof File) {
        failuresLeft -= 1;
        return Promise.reject(new DOMException("gone", "NotReadableError"));
      }
      return original.call(this);
    });

    fireEvent.click(buildButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("고른 파일을 읽는 도중 바뀌었거나 읽을 수 없게 됐어요.");
    expect(alert.textContent).toContain("해당 이미지를 다시 골라 추가한 뒤 다시 시도해 주세요.");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("투고 패키지를 만들었어요.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("투고 패키지 화면 — 초점 이동", () => {
  it("만들기 → 취소 → 저장으로 단계가 바뀔 때마다 새 단계의 주된 단추로 초점이 간다", async () => {
    const paused = pausedCoverPdf();
    renderPanel({ buildDeps: { renderCoverPdf: paused.render } });
    await fillEverything();
    await waitFor(() => expect(buildButton().hasAttribute("disabled")).toBe(false));
    // 처음 그릴 때는 초점을 가져가지 않는다.
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(buildButton());
    const cancel = await screen.findByRole("button", { name: "취소" });
    expect(document.activeElement).toBe(cancel);

    paused.release();
    const save = await screen.findByRole("button", { name: "ZIP 저장" });
    expect(document.activeElement).toBe(save);

    fireEvent.click(screen.getByRole("button", { name: "고쳐서 다시 만들기" }));
    expect(document.activeElement).toBe(buildButton());
  });

  it("오류가 나면 다시 시도 단추로 초점이 간다", async () => {
    renderPanel();
    await fillEverything();
    await waitFor(() => expect(buildButton().hasAttribute("disabled")).toBe(false));
    const original = Blob.prototype.arrayBuffer;
    let failuresLeft = 1;
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(function (this: Blob) {
      if (failuresLeft > 0 && this instanceof File) {
        failuresLeft -= 1;
        return Promise.reject(new DOMException("gone", "NotReadableError"));
      }
      return original.call(this);
    });

    fireEvent.click(buildButton());
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(document.activeElement).toBe(retry);
  });

  it("회차를 더하면 새 회차의 번호 칸으로, 지우면 회차 원고 제목으로 초점이 간다", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "회차 추가" }));
    const added = within(episodeCard(/^4화$/u)).getByLabelText("회차 번호");
    expect(document.activeElement).toBe(added);

    fireEvent.click(within(episodeCard(/^4화$/u)).getByRole("button", { name: "4화 지우기" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "회차 원고" }));
  });

  it("이미지를 빼면 그 회차의 제목으로, 순서를 바꾸면 옮긴 줄의 단추로 초점이 간다", async () => {
    renderPanel();
    const card = await addImages(/^1화/u, [png("01.png"), png("02.png", 690, 3_000)]);

    fireEvent.click(within(card).getByRole("button", { name: "02.png을(를) 위로 옮기기" }));
    // 맨 위로 올라가 '위로' 단추가 꺼졌으므로 같은 줄의 '아래로' 단추가 초점을 받는다.
    expect(document.activeElement).toBe(within(episodeCard(/^1화/u)).getByRole("button", { name: "02.png을(를) 아래로 옮기기" }));

    fireEvent.click(within(episodeCard(/^1화/u)).getByRole("button", { name: "02.png을(를) 목록에서 빼기" }));
    expect(document.activeElement).toBe(within(episodeCard(/^1화/u)).getByRole("heading", { level: 4 }));
  });
});

describe("투고 패키지 화면 — 접근성", () => {
  it("모든 조작이 이름 있는 기본 요소이고 화면 순서대로 키보드로 닿는다", () => {
    renderPanel();
    const controls = [
      screen.getByRole("textbox", { name: "작품 제목" }),
      screen.getByRole("textbox", { name: "작가명 (선택)" }),
      screen.getByRole("textbox", { name: "로그라인" }),
      screen.getByRole("textbox", { name: "시놉시스" }),
      within(episodeCard(/^1화$/u)).getByLabelText("회차 번호"),
      within(episodeCard(/^1화$/u)).getByLabelText(/원고 이미지 추가/u),
      screen.getByRole("button", { name: "회차 추가" }),
      screen.getByRole("combobox", { name: "가로 폭 점검 기준" }),
      screen.getByRole("combobox", { name: "표지 언어" }),
      screen.getByRole("checkbox", { name: "표지 요약 PDF도 넣기" }),
    ];
    controls.forEach((control, index) => {
      control.focus();
      expect(document.activeElement).toBe(control);
      expect(control.getAttribute("tabindex")).toBeNull();
      const previous = controls[index - 1];
      if (previous) expect(previous.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    });
  });

  it("비어 있는 필수 칸은 오류로 표시하고 이유를 연결하며, 채우면 지운다", () => {
    renderPanel();
    const title = screen.getByRole("textbox", { name: "작품 제목" });
    expect(title.getAttribute("aria-invalid")).toBe("true");
    const reasonIds = (title.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(reasonIds.map((id) => document.getElementById(id)?.textContent ?? "").join(" ")).toContain("작품 제목이 비어 있어요");

    fireEvent.change(title, { target: { value: "제목" } });
    expect(title.getAttribute("aria-invalid")).toBeNull();
  });

  it("문제의 심각도를 색이 아니라 글자로도 알린다", () => {
    renderPanel();
    const report = screen.getByRole("region", { name: "만들기 전 점검" });
    expect(within(report).getAllByText("막는 문제").length).toBeGreaterThan(0);
    expect(within(report).getAllByText("알림").length).toBeGreaterThan(0);
  });
});
