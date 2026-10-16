// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openStudioLocalDatabase,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  createStudioTranslationMemoryEntry,
} from "./studio-translation-memory";
import { createStudioTranslationMemorySqlitePersistence } from "./studio-translation-memory-sqlite-persistence";
import { StudioDialogueTranslatePanel } from "./StudioDialogueTranslatePanel";
import { updateStudioLocalizationCharacterCards } from "./studio-localization-project-store";
import {
  addManualStudioTranslationCard,
  patchStudioTranslationCard,
  setStudioTranslationSpeaker,
} from "./lettering/studio-translation-character-card-edit";

import type { BubbleTextMeasurer } from "./lettering/studio-bubble-text-fit";

const databaseRuntime = vi.hoisted(() => ({ acquire: vi.fn() }));

vi.mock("./studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: databaseRuntime.acquire,
}));

const pages = [
  {
    id: "page-1",
    elements: [
      {
        id: "bubble-1",
        type: "bubble",
        text: "다시 만나서 반가워.",
        x: 20,
        y: 40,
      },
    ],
  },
] as const;

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof StudioDialogueTranslatePanel>> = {}
) {
  const onDraftChange = vi.fn();
  render(
    <StudioDialogueTranslatePanel
      pages={pages}
      configured
      activeLocale="source"
      availableLocales={[]}
      coverageFor={() => ({ total: 1, translated: 0 })}
      targetLocale="en-US"
      onTargetLocaleChange={vi.fn()}
      glossary=""
      onGlossaryChange={vi.fn()}
      busy={false}
      progress={null}
      error={null}
      draft={new Map([["bubble-1", "Good to see you again."]])}
      onGenerate={vi.fn()}
      onDraftChange={onDraftChange}
      onApplyDraft={vi.fn()}
      onDiscardDraft={vi.fn()}
      onSwitchLocale={vi.fn()}
      onClose={vi.fn()}
      workScope="work-translation-1"
      {...overrides}
    />
  );
  return { onDraftChange };
}

let database: StudioLocalDatabase;

beforeEach(async () => {
  localStorage.clear();
  database = await openStudioLocalDatabase({ vfs: "memory" });
  databaseRuntime.acquire.mockResolvedValue(database);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  databaseRuntime.acquire.mockReset();
  await database.close();
});

describe("StudioDialogueTranslatePanel translation-memory bridge", () => {
  it("opens a local translation-memory surface from each draft row", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "메모리" }));

    expect(
      await screen.findByRole("heading", { name: "번역 메모리" })
    ).toBeTruthy();
    expect(screen.getByText("작품 work-translation-1")).toBeTruthy();
    expect(screen.getByText("source → en-US")).toBeTruthy();
    expect(screen.getByText("다시 만나서 반가워.")).toBeTruthy();
  });

  it("reuses an explicitly approved match without applying it to the canvas", async () => {
    const created = createStudioTranslationMemoryEntry({
      workScope: "work-translation-1",
      sourceText: "다시 만나서 반가워.",
      sourceLocale: "source",
      targetLocale: "en-US",
      sourceRevision: "page-1:bubble-1:다시 만나서 반가워.",
      translation: "It is good to see you again.",
      status: "approved",
      now: 1,
    });
    if (!created.ok) throw new Error(created.error);
    const persistence = createStudioTranslationMemorySqlitePersistence({
      acquireDatabase: async () => database,
    });
    await expect(persistence.save([created.entry])).resolves.toEqual({ ok: true });
    const { onDraftChange } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "메모리" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "번역 재사용" })
    );

    expect(onDraftChange).toHaveBeenCalledWith(
      "bubble-1",
      "It is good to see you again."
    );
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
  });
});

// ── 현지화 QA 화면 ──────────────────────────────────────────────────────────

/** 결정적 측정기 — 글자 하나를 fontPx×0.6 폭으로 센다(캔버스 없이 넘침 판정을 재현한다). */
const qaMeasurer: BubbleTextMeasurer = {
  measureWidth: (text, fontPx) => text.length * fontPx * 0.6,
};

const OVERFLOWING = "THIS SENTENCE IS FAR TOO LONG FOR THE TINY BALLOON IT WAS PLACED INTO.";

const qaPages = [
  {
    id: "page-1",
    elements: [
      { id: "bubble-1", type: "bubble", text: "안녕, 오랜만이야.", x: 20, y: 40, width: 400, height: 200, fontSize: 14 },
      { id: "bubble-2", type: "bubble", text: "정말 반가워.", x: 20, y: 260, width: 60, height: 30, fontSize: 24 },
    ],
  },
] as const;

function qaPanel(
  overrides: Partial<React.ComponentProps<typeof StudioDialogueTranslatePanel>> = {}
) {
  return (
    <StudioDialogueTranslatePanel
      pages={qaPages}
      configured
      activeLocale="source"
      availableLocales={[]}
      coverageFor={() => ({ total: 2, translated: 0 })}
      targetLocale="en"
      onTargetLocaleChange={vi.fn()}
      glossary=""
      onGlossaryChange={vi.fn()}
      busy={false}
      progress={null}
      error={null}
      draft={
        new Map([
          ["bubble-1", "Long time no see."],
          ["bubble-2", OVERFLOWING],
        ])
      }
      onGenerate={vi.fn()}
      onDraftChange={vi.fn()}
      onApplyDraft={vi.fn()}
      onDiscardDraft={vi.fn()}
      onSwitchLocale={vi.fn()}
      onClose={vi.fn()}
      measurer={qaMeasurer}
      {...overrides}
    />
  );
}

describe("StudioDialogueTranslatePanel 현지화 QA 화면", () => {
  it("메뉴에서 QA 화면으로 열리면 초안을 자동 검사하고, 발견이 초안 행과 캔버스로 되짚는다", () => {
    const onQaOpenChange = vi.fn();
    const onRevealCue = vi.fn();
    render(qaPanel({ qaOpen: true, onQaOpenChange, onRevealCue }));

    expect(screen.getByRole("button", { name: "현지화 QA" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByText(/번역 초안\(적용 전\)/)).toBeTruthy();
    // 60×30 상자에 든 긴 영문 초안은 중대(Major) 넘침 — 점수와 무관하게 글자 라벨로 읽힌다.
    expect(screen.getByText("미달")).toBeTruthy();
    expect(screen.getAllByText("중대").length).toBeGreaterThan(0);
    expect(screen.getByText(/검사한 대사/).parentElement?.textContent).toContain("2개");

    // 같은 대사에 넘침 + 문체 발견이 함께 붙어 캡션이 발견마다 한 번씩 그려진다 — 첫 발견을 잡는다.
    const caption = screen.getAllByText(/1페이지 · THIS SENTENCE/)[0];
    fireEvent.click(
      within(caption.parentElement as HTMLElement).getByRole("button", { name: "초안에서 고치기" })
    );

    expect(onRevealCue).toHaveBeenCalledWith("page-1", "bubble-2");
    expect(onQaOpenChange).toHaveBeenCalledWith(false);
  });

  it("깨끗한 초안은 통과 + 빈 상태로 그린다", () => {
    render(
      qaPanel({
        qaOpen: true,
        pages: [{ id: "page-1", elements: [qaPages[0].elements[0]] }],
        draft: new Map([["bubble-1", "ALL GOOD."]]),
      })
    );

    expect(screen.getByText("통과")).toBeTruthy();
    expect(screen.getByText("지적할 곳이 없어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "초안에서 고치기" })).toBeNull();
  });

  it("qaOpen 을 넘기지 않은 기존 호출부에서는 헤더 토글이 화면을 스스로 전환한다", () => {
    render(qaPanel());

    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현지화 QA" }));
    expect(screen.getByText(/번역 초안\(적용 전\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "적용" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "현지화 QA" }));
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
  });

  it("검사 뒤 초안이 바뀌면 낡은 점수를 그대로 두지 않고 다시 검사를 요구한다", () => {
    const view = render(qaPanel({ qaOpen: true }));
    const banner = "검사 뒤 대사나 인물 카드가 바뀌었어요. 다시 검사해 주세요.";
    expect(screen.queryByText(banner)).toBeNull();

    view.rerender(
      qaPanel({
        qaOpen: true,
        draft: new Map([
          ["bubble-1", "Long time no see!"],
          ["bubble-2", OVERFLOWING],
        ]),
      })
    );
    expect(screen.getByText(banner)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    expect(screen.queryByText(banner)).toBeNull();
  });
});

// ── 생성 화면 대상 언어 검증 ──────────────────────────────────────────────────

function generatePanel(
  overrides: Partial<React.ComponentProps<typeof StudioDialogueTranslatePanel>> = {}
) {
  const onGenerate = vi.fn();
  render(
    <StudioDialogueTranslatePanel
      pages={pages}
      configured
      activeLocale="source"
      availableLocales={[]}
      coverageFor={() => ({ total: 1, translated: 0 })}
      targetLocale="en"
      onTargetLocaleChange={vi.fn()}
      glossary=""
      onGlossaryChange={vi.fn()}
      busy={false}
      progress={null}
      error={null}
      draft={null}
      onGenerate={onGenerate}
      onDraftChange={vi.fn()}
      onApplyDraft={vi.fn()}
      onDiscardDraft={vi.fn()}
      onSwitchLocale={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  );
  return { onGenerate };
}

function generateButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "번역 생성" }) as HTMLButtonElement;
}

describe("StudioDialogueTranslatePanel 생성 화면 대상 언어 검증", () => {
  it("대상 언어가 비어 있으면 생성을 막고 입력 안내를 보여준다", () => {
    generatePanel({ targetLocale: "" });

    expect(generateButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("번역할 대상 언어를 입력하세요.");
  });

  it("대상 언어가 원문 예약어이면 생성을 막고 변경 안내를 보여준다", () => {
    generatePanel({ targetLocale: "source" });

    expect(generateButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("대상 언어는 원문과 달라야 해요.");
  });

  it("유효한 대상 언어에서는 안내 없이 생성이 가능하다", () => {
    const { onGenerate } = generatePanel({ targetLocale: "en" });

    expect(generateButton().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(generateButton());
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

// ── 번역 대조 검수 화면 ──────────────────────────────────────────────────

const reviewPages = [
  {
    id: "page-1",
    elements: [
      { id: "bubble-1", type: "bubble", text: "다시 만나서 반가워.", x: 20, y: 40 },
      { id: "bubble-2", type: "bubble", text: "민수야, 안녕?", x: 20, y: 120 },
      { id: "bubble-3", type: "bubble", text: "아직 번역 없는 대사", x: 20, y: 200 },
    ],
    dialogueI18n: {
      "bubble-1": { source: "다시 만나서 반가워.", "en-US": "Good to see you again." },
      "bubble-2": { source: "민수야, 안녕?", "en-US": "Hi, Minsu?" },
    },
    dialogueReview: { "bubble-1": { "en-US": "approved" as const } },
  },
];

function renderReview(
  overrides: Partial<React.ComponentProps<typeof StudioDialogueTranslatePanel>> = {}
) {
  const onReviewTextChange = vi.fn();
  const onReviewStatusChange = vi.fn();
  render(
    <StudioDialogueTranslatePanel
      pages={reviewPages}
      configured
      activeLocale="source"
      availableLocales={["en-US"]}
      coverageFor={() => ({ total: 3, translated: 2 })}
      targetLocale="en-US"
      onTargetLocaleChange={vi.fn()}
      glossary=""
      onGlossaryChange={vi.fn()}
      busy={false}
      progress={null}
      error={null}
      draft={null}
      onGenerate={vi.fn()}
      onDraftChange={vi.fn()}
      onApplyDraft={vi.fn()}
      onDiscardDraft={vi.fn()}
      onSwitchLocale={vi.fn()}
      onClose={vi.fn()}
      workScope="work-review-1"
      reviewOpen
      onReviewOpenChange={vi.fn()}
      onReviewTextChange={onReviewTextChange}
      onReviewStatusChange={onReviewStatusChange}
      {...overrides}
    />
  );
  return { onReviewTextChange, onReviewStatusChange };
}

describe("StudioDialogueTranslatePanel 번역 대조 검수 화면", () => {
  it("적용된 번역을 원문과 나란히 보여 주고 상태와 진척을 표시한다", () => {
    renderReview();

    expect(screen.getByText("원문: 다시 만나서 반가워.")).toBeTruthy();
    expect(screen.getByText("원문: 민수야, 안녕?")).toBeTruthy();
    const textareas = screen.getAllByLabelText("1페이지 대사 번역") as HTMLTextAreaElement[];
    expect(textareas.map((t) => t.value)).toEqual([
      "Good to see you again.",
      "Hi, Minsu?",
      "",
    ]);
    expect(screen.getByText("승인됨")).toBeTruthy();
    expect(screen.getByText("미번역")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("번역 2/3");
    expect(screen.getByRole("status").textContent).toContain("미번역 1");
    // 미번역 행은 승인할 수 없다.
    const approveButtons = screen.getAllByRole("button", { name: "승인" }) as HTMLButtonElement[];
    expect(approveButtons[2].disabled).toBe(true);
  });

  it("승인·수정 필요 버튼이 상태 변경 콜백을 부르고, 승인된 행은 다시 누르면 해제된다", () => {
    const { onReviewStatusChange } = renderReview();

    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[1]);
    expect(onReviewStatusChange).toHaveBeenCalledWith("page-1", "bubble-2", "en-US", "approved");

    fireEvent.click(screen.getAllByRole("button", { name: "수정 필요" })[1]);
    expect(onReviewStatusChange).toHaveBeenCalledWith("page-1", "bubble-2", "en-US", "needs-edit");

    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[0]);
    expect(onReviewStatusChange).toHaveBeenCalledWith("page-1", "bubble-1", "en-US", null);
  });

  it("번역문을 고쳐 저장하면 콜백으로 나가고, 용어집 위반이 행에 표시된다", () => {
    const { onReviewTextChange } = renderReview({ glossary: "민수: Min-su" });

    // 원문에 "민수"가 있는데 번역에 정본 "Min-su"가 없다 — 행 단위 위반 표시.
    expect(screen.getByText(/규칙과 일치하지 않습니다/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("용어집 위반 1행");

    const textareas = screen.getAllByLabelText("1페이지 대사 번역") as HTMLTextAreaElement[];
    fireEvent.change(textareas[0], { target: { value: "Great to see you again." } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onReviewTextChange).toHaveBeenCalledWith(
      "page-1",
      "bubble-1",
      "en-US",
      "Great to see you again."
    );
  });

  it("번역된 언어가 없으면 빈 상태를 안내한다", () => {
    renderReview({ availableLocales: [] });
    expect(screen.getByText(/아직 적용된 번역이 없어요/)).toBeTruthy();
  });
});

// ── 용어집 작품별 저장·규칙 행 편집 ─────────────────────────────────────

describe("StudioDialogueTranslatePanel 용어집", () => {
  it("작품에 저장된 용어집을 열 때 빈 용어집에 채워 넣는다", async () => {
    localStorage.setItem(
      "toonstudio-studio-dialogue-glossary:v1:work-glossary-1",
      "민수: Minsu"
    );
    const onGlossaryChange = vi.fn();
    generatePanel({ workScope: "work-glossary-1", onGlossaryChange });

    // 용어집 정본이 IndexedDB로 옮겨가 읽기가 비동기가 됐다 — 채워 넣기는
    // 첫 읽기가 끝난 뒤 일어난다.
    await waitFor(() =>
      expect(onGlossaryChange).toHaveBeenCalledWith("민수: Minsu")
    );
  });

  it("사용자가 입력한 용어집은 작품 키로 저장돼 다음에 다시 열린다", async () => {
    generatePanel({ workScope: "work-glossary-2", glossary: "지연: Jiyeon" });

    // 이 테스트 환경에는 IndexedDB가 없어 저장이 localStorage 폴백으로 떨어진다.
    await waitFor(() =>
      expect(
        localStorage.getItem("toonstudio-studio-dialogue-glossary:v1:work-glossary-2")
      ).toBe("지연: Jiyeon")
    );
  });

  it("규칙 행 모드에서 정본을 고치면 같은 용어집 텍스트로 되돌려 준다", () => {
    const onGlossaryChange = vi.fn();
    generatePanel({ glossary: "민수: Minsu\n# 주인공 메모", onGlossaryChange });

    fireEvent.click(screen.getByRole("button", { name: "규칙 행" }));
    const targetInput = screen.getByLabelText("1번째 규칙 정본 표기") as HTMLInputElement;
    expect(targetInput.value).toBe("Minsu");
    expect(screen.getByText(/메모 줄 1개/)).toBeTruthy();

    fireEvent.change(targetInput, { target: { value: "Min-su" } });
    expect(onGlossaryChange).toHaveBeenLastCalledWith("민수: Min-su\n# 주인공 메모");
  });
});

// ── 현지화 QA 용어집 검사 주입 ───────────────────────────────────────────

describe("StudioDialogueTranslatePanel 현지화 QA 용어집 검사", () => {
  it("용어집 규칙을 어긴 초안은 QA 보고서에 용어집 위반으로 나타난다", () => {
    render(
      qaPanel({
        qaOpen: true,
        pages: [{ id: "page-1", elements: [qaPages[0].elements[0]] }],
        draft: new Map([["bubble-1", "Long time no see."]]),
        glossary: "오랜만: It's been a while",
      })
    );

    expect(screen.queryByText("지적할 곳이 없어요")).toBeNull();
    expect(screen.getByText(/규칙과 일치하지 않습니다/)).toBeTruthy();
  });

  it("용어집 규칙을 지킨 초안은 위반 없이 통과한다", () => {
    render(
      qaPanel({
        qaOpen: true,
        pages: [{ id: "page-1", elements: [qaPages[0].elements[0]] }],
        draft: new Map([["bubble-1", "LONG TIME NO SEE."]]),
        glossary: "오랜만: LONG TIME",
      })
    );

    expect(screen.getByText("지적할 곳이 없어요")).toBeTruthy();
    expect(screen.queryByText(/규칙과 일치하지 않습니다/)).toBeNull();
  });
});

// ── 번역 인물 카드 ────────────────────────────────────────────────────────────

/** 번역 프로젝트 문서(작품 범위 키)에 카드를 미리 저장한다 — 패널이 같은 저장소에서 읽는다. */
function seedCards(scope: string, speakerIds: readonly string[]) {
  updateStudioLocalizationCharacterCards(localStorage, scope, (cards) => {
    let next = addManualStudioTranslationCard(cards, { id: "yuna", name: "유나" });
    next = addManualStudioTranslationCard(next, { id: "minho", name: "민호" });
    next = patchStudioTranslationCard(next, "yuna", {
      register: "polite",
      bannedTerms: [{ term: "dude", locale: "" }],
      addressTerms: [
        { listenerId: "minho", sourceTerm: "선배", targetTerm: "Senpai", locale: "en", register: null, avoidTerms: ["Sunbae"] },
      ],
    });
    for (const id of speakerIds) {
      next = setStudioTranslationSpeaker(next, id, { speakerId: "yuna", listenerId: "minho" });
    }
    return next;
  });
}

describe("StudioDialogueTranslatePanel 인물 카드 — 번역 요청 문맥", () => {
  it("생성 화면에 접힌 인물 카드 구역이 있고, 화자가 지정된 대사의 문맥을 번역 생성으로 넘긴다", () => {
    seedCards("work-cards-1", ["bubble-1"]);
    const { onGenerate } = generatePanel({ workScope: "work-cards-1", projectId: null });

    const toggle = screen.getByRole("button", { name: /인물 카드 · 2명 · 화자 지정 1\/1/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(generateButton());
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const contexts = onGenerate.mock.calls[0]?.[0] as Record<string, { speaker: { name: string; banned?: string[] }; addressTerm?: string }>;
    expect(Object.keys(contexts)).toEqual(["bubble-1"]);
    expect(contexts["bubble-1"]?.speaker).toMatchObject({ name: "유나", banned: ["dude"] });
    expect(contexts["bubble-1"]?.addressTerm).toBe("Senpai");
    // 생성 버튼 위 한 줄이 이번 요청에 카드가 실제로 쓰인다고 말한다.
    expect(screen.getByText("인물 카드 문맥이 붙는 대사 1/1개")).toBeTruthy();
  });

  it("카드는 있는데 화자를 지정한 대사가 없으면, 카드가 이번 요청에 쓰이지 않는다고 생성 버튼 위에서 알린다", () => {
    seedCards("work-cards-nospeaker", []);
    const { onGenerate } = generatePanel({ workScope: "work-cards-nospeaker", projectId: null });
    expect(screen.getByText("화자를 지정한 대사가 없어 인물 카드는 이번 번역 요청에 쓰이지 않아요.")).toBeTruthy();
    fireEvent.click(generateButton());
    expect(onGenerate).toHaveBeenCalledWith({});
  });

  it("카드나 화자 지정이 없으면 빈 문맥을 넘긴다 — 요청은 예전과 같다", () => {
    const { onGenerate } = generatePanel({ workScope: "work-cards-empty", projectId: null });
    // 카드를 쓰지 않는 사용자의 화면에는 인물 카드 안내 줄이 없다.
    expect(screen.queryByText(/이번 번역 요청에 쓰이지 않아요|문맥이 붙는 대사/)).toBeNull();
    fireEvent.click(generateButton());
    expect(onGenerate).toHaveBeenCalledWith({});
  });

  it("대상 언어가 바뀌면 그 언어에 맞는 문맥만 넘긴다(en 호칭 규칙은 ja 요청에 나가지 않는다)", () => {
    seedCards("work-cards-2", ["bubble-1"]);
    const { onGenerate } = generatePanel({ workScope: "work-cards-2", projectId: null, targetLocale: "ja" });
    fireEvent.click(generateButton());
    const contexts = onGenerate.mock.calls[0]?.[0] as Record<string, { addressTerm?: string }>;
    expect(contexts["bubble-1"]?.addressTerm).toBeUndefined();
  });

  it("검수 화면(초안이 있는 화면)에서도 같은 구역을 펼쳐 카드를 고칠 수 있다", () => {
    renderPanel({ workScope: "work-cards-3", projectId: null });
    const toggle = screen.getByRole("button", { name: /인물 카드 · 0명/ });
    fireEvent.click(toggle);
    expect(screen.getByText("인물 카드가 아직 없어요")).toBeTruthy();
  });
});

describe("StudioDialogueTranslatePanel 인물 카드 — 현지화 QA", () => {
  const widePages = [
    {
      id: "page-1",
      elements: [
        { id: "bubble-1", type: "bubble", text: "고마워요, 선배.", x: 20, y: 40, width: 500, height: 200, fontSize: 14 },
        { id: "bubble-2", type: "bubble", text: "정말 고마워요, 선배.", x: 20, y: 260, width: 500, height: 200, fontSize: 14 },
      ],
    },
  ] as const;

  it("카드 규칙을 어긴 초안은 Terminology 발견으로 나타나고, 근거 대사로 이동할 수 있다", () => {
    seedCards("work-qa-cards", ["bubble-1", "bubble-2"]);
    const onRevealCue = vi.fn();
    const onQaOpenChange = vi.fn();
    render(
      qaPanel({
        qaOpen: true,
        onQaOpenChange,
        onRevealCue,
        workScope: "work-qa-cards",
        projectId: null,
        pages: widePages,
        draft: new Map([
          ["bubble-1", "Thank you, Senpai."],
          ["bubble-2", "Thank you so much, Sunbae."],
        ]),
      })
    );

    expect(screen.getByText(/호칭이 인물 카드\(“Senpai”\)와 달라요/)).toBeTruthy();
    expect(screen.getByText(/기대:/).parentElement?.textContent).toContain("Senpai");
    expect(screen.getByText(/근거 대사 · 1페이지 · Thank you, Senpai\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "근거 대사로 이동: 1페이지" }));
    expect(onRevealCue).toHaveBeenCalledWith("page-1", "bubble-1");
    // 초안 화면으로 돌아가 그 행에 포커스를 둔다.
    expect(onQaOpenChange).toHaveBeenCalledWith(false);
  });

  it("카드는 있는데 화자가 지정된 대사가 없으면, 오류 0건을 통과로 읽지 말라는 안내를 보여 준다", () => {
    seedCards("work-qa-unassigned", []);
    render(
      qaPanel({
        qaOpen: true,
        workScope: "work-qa-unassigned",
        projectId: null,
        pages: widePages,
        draft: new Map([["bubble-1", "Thank you, dude."]]),
      })
    );
    expect(screen.getByText(/화자가 지정된 대사가 없어 인물 카드 규칙을 한 건도 검사하지 못했어요/)).toBeTruthy();
    expect(screen.queryByText(/금지어/)).toBeNull();
  });

  it("검사 뒤 인물 카드가 바뀌면 낡은 보고서로 보고 다시 검사를 요구한다", () => {
    seedCards("work-qa-stale", ["bubble-1"]);
    render(
      qaPanel({
        qaOpen: true,
        workScope: "work-qa-stale",
        projectId: null,
        pages: widePages,
        draft: new Map([["bubble-1", "Thank you, Senpai."]]),
      })
    );
    const banner = "검사 뒤 대사나 인물 카드가 바뀌었어요. 다시 검사해 주세요.";
    expect(screen.queryByText(banner)).toBeNull();

    // 다른 곳(인물 카드 편집)에서 같은 문서의 카드를 고친 상황 — 갱신 이벤트가 패널에 도달한다.
    act(() => {
      updateStudioLocalizationCharacterCards(
        localStorage,
        "work-qa-stale",
        (cards) => patchStudioTranslationCard(cards, "yuna", { bannedTerms: [{ term: "senpai", locale: "" }] }),
        window
      );
    });
    expect(screen.getByText(banner)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    expect(screen.queryByText(banner)).toBeNull();
    expect(screen.getByText(/금지어 “senpai”/)).toBeTruthy();
  });

  it("원문을 알 수 없는 초안(번역 로케일을 보는 중)은 고정어 검사를 건너뛴 대사 수를 알린다 — 0건을 통과로 읽지 않게", () => {
    updateStudioLocalizationCharacterCards(localStorage, "work-qa-nosource", (cards) => {
      const added = addManualStudioTranslationCard(cards, { id: "yuna", name: "유나" });
      const withTerm = patchStudioTranslationCard(added, "yuna", {
        fixedTerms: [{ source: "고마워", target: "Thank you", locale: "" }],
      });
      return setStudioTranslationSpeaker(withTerm, "bubble-1", { speakerId: "yuna", listenerId: null });
    });
    render(
      qaPanel({
        qaOpen: true,
        activeLocale: "ja",
        workScope: "work-qa-nosource",
        projectId: null,
        pages: widePages,
        draft: new Map([["bubble-1", "Thanks."]]),
      })
    );
    expect(screen.getByText(/원문을 알 수 없는 1개 대사는 고정어·원문 호칭 검사를 건너뛰었어요/)).toBeTruthy();
    expect(screen.queryByText(/고정어 “고마워”/)).toBeNull();
  });
});
