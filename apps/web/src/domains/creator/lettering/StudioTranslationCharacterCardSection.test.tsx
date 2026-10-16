// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readStudioLocalizationCharacterCards,
  updateStudioLocalizationCharacterCards,
} from "../studio-localization-project-store";
import { readStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-store";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";

import { StudioTranslationCharacterCardSection } from "./StudioTranslationCharacterCardSection";
import { STUDIO_TRANSLATION_CARD_LIMITS } from "./studio-translation-character-card";
import { addManualStudioTranslationCard } from "./studio-translation-character-card-edit";
import { useStudioTranslationCards } from "./use-studio-translation-cards";

import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";
import type { DialogueBatchItem } from "./studio-dialogue-batch";

const PROJECT = "project-1";

const bible: StudioStoryBible = {
  projectId: PROJECT,
  characters: [
    { id: "yuna", name: "유나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "minho", name: "민호", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};

const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "yuna",
      personality: "",
      speechStyle: "존댓말, 끝을 흐린다",
      background: "",
      motivation: "",
      signatureLines: [],
      appearanceNotes: "",
    },
  ],
  relations: [
    { id: "r1", fromCharacterId: "yuna", toCharacterId: "minho", kind: "mentor", label: "선후배", note: "" },
  ],
};

const items: DialogueBatchItem[] = [
  { id: "b1", pageId: "p1", pageIndex: 0, elType: "bubble", text: "안녕하세요, 선배.", hidden: false, locked: false },
  { id: "b2", pageId: "p1", pageIndex: 0, elType: "bubble", text: "왔냐.", hidden: false, locked: false },
];

function seedBible() {
  updateStudioProjectStory(localStorage, PROJECT, { bible, states: [], transitions: [], narrative });
}

function Harness({
  withBible = true,
  onReveal,
}: {
  readonly withBible?: boolean;
  readonly onReveal?: (pageId: string, elId: string) => void;
}) {
  const controller = useStudioTranslationCards({
    scopeKey: PROJECT,
    bibleProjectId: withBible ? PROJECT : null,
  });
  return (
    <StudioTranslationCharacterCardSection
      controller={controller}
      items={items}
      targetLocale="en"
      defaultOpen
      {...(onReveal ? { onRevealCue: onReveal } : {})}
    />
  );
}

function storedCards() {
  return readStudioLocalizationCharacterCards(localStorage, PROJECT);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioTranslationCharacterCardSection — 구역 헤더", () => {
  it("접힌 채 시작하는 구역은 요약을 보여 주고, 헤더 버튼(aria-expanded)으로 펼친다", () => {
    seedBible();
    function Collapsed() {
      const controller = useStudioTranslationCards({ scopeKey: PROJECT, bibleProjectId: PROJECT });
      return <StudioTranslationCharacterCardSection controller={controller} items={items} targetLocale="en" />;
    }
    render(<Collapsed />);
    const toggle = screen.getByRole("button", { name: /인물 카드 · 2명 · 화자 지정 0\/2/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("인물")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(screen.getByLabelText("인물")).toBeTruthy();
  });
});

describe("StudioTranslationCharacterCardSection — 빈 상태와 직접 추가", () => {
  it("바이블도 카드도 없으면 빈 상태를 안내하고 직접 추가할 수 있다", () => {
    render(<Harness withBible={false} />);
    expect(screen.getByText("인물 카드가 아직 없어요")).toBeTruthy();
    expect(screen.getByText(/연결된 스토리 바이블이 없어요/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "인물 추가" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("인물 직접 추가"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "인물 추가" }));

    expect(screen.queryByText("인물 카드가 아직 없어요")).toBeNull();
    expect(screen.getByRole("button", { name: /인물 카드 · 1명/ })).toBeTruthy();
    expect(storedCards().cards).toMatchObject([{ origin: "manual", name: "Emma" }]);
  });
});

describe("StudioTranslationCharacterCardSection — 시트는 읽기 전용, 번역용 값은 따로 저장", () => {
  it("시트의 말투를 읽기 전용으로 보여 주고, 비어 있는 필드는 '미입력' 글자 표지로 드러낸다", () => {
    seedBible();
    render(<Harness />);
    expect(screen.getByText(/캐릭터 시트\(읽기 전용\):/).parentElement?.textContent).toContain("존댓말, 끝을 흐린다");
    // 말투는 시트에 있어 채워졌지만, 존대 단계·호칭은 시트가 모른다 — 지어내지 않고 미입력이다.
    expect(screen.getAllByText("미입력").length).toBeGreaterThanOrEqual(2);
    expect((screen.getByLabelText("기본 존대/반말 단계") as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/아직 호칭이 없어요/)).toBeTruthy();
  });

  it("번역용 말투 메모와 존대 단계를 저장하지만 시트 원본은 건드리지 않는다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("말투 메모"), { target: { value: "정중하지만 친근하게" } });
    fireEvent.change(screen.getByLabelText("기본 존대/반말 단계"), { target: { value: "polite" } });

    expect(storedCards().cards[0]).toMatchObject({
      characterId: "yuna",
      origin: "story-bible",
      name: "유나",
      speechNote: "정중하지만 친근하게",
      register: "polite",
    });
    const source = readStudioProjectDiagnosticSource(localStorage, PROJECT);
    expect(source?.story.narrative.profiles[0]?.speechStyle).toBe("존댓말, 끝을 흐린다");
    // 말투 메모를 비우면 시트 값으로 돌아가고, 다른 값이 없으면 저장소에서 카드가 사라진다.
    fireEvent.change(screen.getByLabelText("말투 메모"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("기본 존대/반말 단계"), { target: { value: "" } });
    expect(storedCards().cards).toEqual([]);
  });

  it("인물 선택 목록은 이름과 미입력 개수를 함께 보여 준다", () => {
    seedBible();
    render(<Harness />);
    const options = within(screen.getByLabelText("인물")).getAllByRole("option").map((option) => option.textContent);
    // 유나: 말투는 시트에 있어 존대 단계·호칭 2개가 미입력, 민호: 말투까지 3개가 미입력. 고정어·금지어는 선택 목록이라 세지 않는다.
    expect(options).toEqual(["유나 · 미입력 2", "민호 · 미입력 3"]);
  });
});

describe("StudioTranslationCharacterCardSection — 호칭·고정어·금지어 편집", () => {
  it("호칭 행을 추가하면 번역 호칭 입력으로 포커스가 가고, 입력값이 저장된다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "호칭 추가" }));

    const row = within(screen.getByRole("group", { name: /^호칭 1/ }));
    const target = row.getByLabelText("번역 호칭");
    expect(document.activeElement).toBe(target);
    fireEvent.change(row.getByLabelText("청자"), { target: { value: "minho" } });
    fireEvent.change(row.getByLabelText("원문 호칭"), { target: { value: "선배" } });
    fireEvent.change(target, { target: { value: "Senpai" } });
    fireEvent.change(row.getByLabelText("쓰지 않을 다른 표기(쉼표로 구분)"), { target: { value: "Sunbae, Senior," } });
    fireEvent.change(row.getByLabelText("이 청자에게 쓰는 단계"), { target: { value: "formal" } });
    fireEvent.change(row.getByLabelText("대상 언어(비우면 모든 언어)"), { target: { value: "en" } });

    expect(storedCards().cards[0]?.addressTerms).toEqual([
      {
        listenerId: "minho",
        sourceTerm: "선배",
        targetTerm: "Senpai",
        locale: "en",
        register: "formal",
        avoidTerms: ["Sunbae", "Senior"],
      },
    ]);
    // 입력창은 방금 친 쉼표를 지우지 않는다.
    expect((row.getByLabelText("쓰지 않을 다른 표기(쉼표로 구분)") as HTMLInputElement).value).toBe("Sunbae, Senior,");
  });

  it("시트의 관계는 호칭이 아니라 '행 추가 단축'으로만 쓰이고, 청자가 미리 채워진다", () => {
    seedBible();
    render(<Harness />);
    const shortcut = screen.getByRole("button", { name: /민호.*선후배/ });
    fireEvent.click(shortcut);
    const row = within(screen.getByRole("group", { name: /^호칭 1/ }));
    expect((row.getByLabelText("청자") as HTMLSelectElement).value).toBe("minho");
    expect((row.getByLabelText("번역 호칭") as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/시트 관계: 선후배/)).toBeTruthy();
    // 이미 행이 있는 청자는 단축이 사라진다.
    expect(screen.queryByRole("button", { name: /민호.*선후배/ })).toBeNull();
  });

  it("호칭 행을 지우면 포커스가 '호칭 추가' 버튼으로 돌아온다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "호칭 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "호칭 1 삭제" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "호칭 추가" }));
    expect(storedCards().cards).toEqual([]);
  });

  it("고정어와 금지어를 추가·삭제하고 저장한다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "고정어 추가" }));
    fireEvent.change(screen.getByLabelText("고정어 1 원문"), { target: { value: "나만 믿어" } });
    fireEvent.change(screen.getByLabelText("고정어 1 번역"), { target: { value: "Leave it to me" } });
    fireEvent.click(screen.getByRole("button", { name: "금지어 추가" }));
    fireEvent.change(screen.getByLabelText("금지어 1"), { target: { value: "dude" } });

    expect(storedCards().cards[0]?.fixedTerms).toEqual([{ source: "나만 믿어", target: "Leave it to me", locale: "" }]);
    expect(storedCards().cards[0]?.bannedTerms).toEqual([{ term: "dude", locale: "" }]);

    fireEvent.click(screen.getByRole("button", { name: "고정어 1 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "금지어 1 삭제" }));
    expect(storedCards().cards).toEqual([]);
  });

  it("언어 코드 형식이 아니면 aria-invalid 와 안내를 보여 준다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "금지어 추가" }));
    const locale = screen.getByLabelText("대상 언어(비우면 모든 언어)");
    fireEvent.change(locale, { target: { value: "영어" } });
    expect(locale.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/언어 코드 형식이 아니에요/)).toBeTruthy();
    fireEvent.change(locale, { target: { value: "en" } });
    expect(locale.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("StudioTranslationCharacterCardSection — 직접 추가한 카드와 사라진 인물", () => {
  it("직접 추가한 카드는 두 단계 확인 뒤에 지워지고, 그 카드로 지정한 화자도 풀린다", () => {
    render(<Harness withBible={false} />);
    fireEvent.change(screen.getByLabelText("인물 직접 추가"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "인물 추가" }));
    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 화자"), {
      target: { value: storedCards().cards[0]?.characterId ?? "" },
    });
    expect(Object.keys(storedCards().speakers)).toEqual(["b1"]);

    fireEvent.click(screen.getByRole("button", { name: "이 카드 삭제" }));
    expect(storedCards().cards).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
    expect(storedCards().cards).toEqual([]);
    expect(storedCards().speakers).toEqual({});
    expect(screen.getByText("인물 카드가 아직 없어요")).toBeTruthy();
    // 눌린 버튼이 사라져도 포커스는 직접 추가 입력으로 이어진다.
    expect(document.activeElement).toBe(screen.getByLabelText("인물 직접 추가"));
  });

  it("시트에서 사라진 인물의 카드는 지우지 않고 보관 안내와 함께 보여 준다", () => {
    seedBible();
    const { unmount } = render(<Harness />);
    fireEvent.change(screen.getByLabelText("기본 존대/반말 단계"), { target: { value: "casual" } });
    unmount();
    // 이후 바이블에서 유나가 지워졌다.
    const minho = bible.characters.find((character) => character.id === "minho");
    if (!minho) throw new Error("fixture");
    updateStudioProjectStory(localStorage, PROJECT, {
      bible: { ...bible, characters: [minho] },
      states: [],
      transitions: [],
      narrative: { profiles: [], relations: [] },
    });
    render(<Harness />);
    // 사라진 인물의 카드는 목록 끝에 보관돼 있다.
    fireEvent.change(screen.getByLabelText("인물"), { target: { value: "yuna" } });
    expect(screen.getByText(/스토리 바이블에서 이 인물을 찾지 못했어요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 카드 삭제" })).toBeTruthy();
  });
});

describe("StudioTranslationCharacterCardSection — 삭제 확인의 포커스", () => {
  it("'이 카드 삭제'를 누르면 포커스가 '취소'로 옮겨지고, 취소하면 '이 카드 삭제'로 돌아온다", () => {
    render(<Harness withBible={false} />);
    fireEvent.change(screen.getByLabelText("인물 직접 추가"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "인물 추가" }));

    fireEvent.click(screen.getByRole("button", { name: "이 카드 삭제" }));
    // 누른 버튼은 사라진다 — 포커스가 문서 맨 앞으로 날아가지 않고 되돌리기 쉬운 '취소'에 놓인다.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "이 카드 삭제" }));
    expect(storedCards().cards).toHaveLength(1);
  });
});

describe("StudioTranslationCharacterCardSection — 카드 수 상한", () => {
  const limitText = new RegExp(`최대 ${STUDIO_TRANSLATION_CARD_LIMITS.cards}장까지 저장할 수 있어요`, "u");

  function fillToLimit() {
    updateStudioLocalizationCharacterCards(localStorage, PROJECT, (cards) => {
      let next = cards;
      for (let index = 0; index < STUDIO_TRANSLATION_CARD_LIMITS.cards; index += 1) {
        next = addManualStudioTranslationCard(next, { id: `m${index}`, name: `인물 ${index}` });
      }
      return next;
    });
  }

  it("상한에 닿으면 추가 버튼을 막고 이유를 말하며, 입력한 이름은 지우지 않는다", () => {
    fillToLimit();
    render(<Harness withBible={false} />);
    const input = screen.getByLabelText("인물 직접 추가") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Emma" } });

    expect((screen.getByRole("button", { name: "인물 추가" }) as HTMLButtonElement).disabled).toBe(true);
    const note = screen.getByText(limitText);
    expect(note.getAttribute("role")).toBe("note");
    expect(input.getAttribute("aria-describedby")).toBe(note.id);

    // 엔터(폼 제출)로도 조용히 비우거나 선택을 바꾸지 않는다.
    fireEvent.submit(input.form as HTMLFormElement);
    expect(input.value).toBe("Emma");
    expect(storedCards().cards).toHaveLength(STUDIO_TRANSLATION_CARD_LIMITS.cards);
  });

  it("상한에 닿았는데 아직 저장된 적 없는 시트 인물은 편집을 막고 이유를 보여 준다 — 저장된 카드는 계속 편집된다", () => {
    seedBible();
    fillToLimit();
    render(<Harness />);

    // 시트 인물(유나)은 저장된 카드가 없고 상한이라 첫 편집이 저장될 수 없다: 입력이 조용히 무시되지 않는다.
    fireEvent.change(screen.getByLabelText("인물"), { target: { value: "yuna" } });
    // 편집 표면 전체가 비활성 fieldset 안에 있어 모든 입력이 막힌다(자식 컨트롤의 .disabled 속성이 아니라 :disabled 로 본다).
    const locked = screen.getByRole("group", { name: "유나 번역 카드 편집" }) as HTMLFieldSetElement;
    expect(locked.disabled).toBe(true);
    expect(screen.getByLabelText("말투 메모").matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("기본 존대/반말 단계").matches(":disabled")).toBe(true);
    expect(screen.getAllByText(limitText)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("인물"), { target: { value: "m0" } });
    expect((screen.getByRole("group", { name: "인물 0 번역 카드 편집" }) as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.getByLabelText("말투 메모").matches(":disabled")).toBe(false);
    expect(screen.getAllByText(limitText)).toHaveLength(1);
  });
});

describe("StudioTranslationCharacterCardSection — 저장 오류", () => {
  it("저장이 실패하면 오류 상태와 다시 시도를 보여 주고, 편집은 화면에 남는다", () => {
    render(<Harness withBible={false} />);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    fireEvent.change(screen.getByLabelText("인물 직접 추가"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "인물 추가" }));

    expect(screen.getByRole("alert").textContent).toContain("인물 카드를 저장하지 못했어요");
    expect(screen.getByRole("button", { name: /저장 문제/ })).toBeTruthy();
    expect(screen.getByLabelText("인물")).toBeTruthy();

    setItem.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(storedCards().cards).toMatchObject([{ name: "Emma" }]);
  });
});

describe("StudioTranslationCharacterCardSection — 대사 화자 지정", () => {
  it("대사마다 화자·청자를 고르면 저장되고 지정 수가 갱신된다 — 청자는 화자를 먼저 골라야 한다", () => {
    seedBible();
    render(<Harness />);
    const listener = screen.getByLabelText("1페이지 1번째 대사 청자") as HTMLSelectElement;
    expect(listener.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 화자"), { target: { value: "yuna" } });
    expect((screen.getByLabelText("1페이지 1번째 대사 청자") as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 청자"), { target: { value: "minho" } });

    expect(storedCards().speakers).toEqual({ b1: { speakerId: "yuna", listenerId: "minho" } });
    expect(screen.getByText("지정 1/2")).toBeTruthy();
    expect(screen.getByRole("button", { name: /화자 지정 1\/2/ })).toBeTruthy();
  });

  it("'미지정 대사만 보기'로 남은 대사만 추리고, 모두 지정하면 완료 안내를 보여 준다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 화자"), { target: { value: "yuna" } });
    fireEvent.click(screen.getByLabelText("미지정 대사만 보기"));
    expect(screen.queryByLabelText("1페이지 1번째 대사 화자")).toBeNull();
    expect(screen.getByLabelText("1페이지 2번째 대사 화자")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("1페이지 2번째 대사 화자"), { target: { value: "minho" } });
    expect(screen.getByText("모든 대사에 화자가 지정돼 있어요.")).toBeTruthy();
  });

  it("'미지정 대사만 보기'에서 방금 지정한 행은 남아 있어 키보드로 고르던 포커스가 날아가지 않는다", () => {
    seedBible();
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("미지정 대사만 보기"));
    const speaker = screen.getByLabelText("1페이지 1번째 대사 화자") as HTMLSelectElement;
    speaker.focus();
    fireEvent.change(speaker, { target: { value: "yuna" } });

    // 지정한 뒤에도 같은 요소가 남고 포커스가 그대로다.
    expect(screen.getByLabelText("1페이지 1번째 대사 화자")).toBe(speaker);
    expect(document.activeElement).toBe(speaker);
    expect(screen.getByLabelText("1페이지 2번째 대사 화자")).toBeTruthy();

    // 필터를 껐다 다시 켜면 지정된 행이 정리된다.
    fireEvent.click(screen.getByLabelText("미지정 대사만 보기"));
    fireEvent.click(screen.getByLabelText("미지정 대사만 보기"));
    expect(screen.queryByLabelText("1페이지 1번째 대사 화자")).toBeNull();
    expect(screen.getByLabelText("1페이지 2번째 대사 화자")).toBeTruthy();
  });

  it("대사가 많으면 30줄씩 나눠 보이고, '더 보기' 뒤 포커스는 새로 나타난 첫 행으로 이어진다", () => {
    seedBible();
    const many: DialogueBatchItem[] = Array.from({ length: 35 }, (_, index) => ({
      id: `m${index}`,
      pageId: "p1",
      pageIndex: 0,
      elType: "bubble",
      text: `대사 ${index}`,
      hidden: false,
      locked: false,
    }));
    function Many() {
      const controller = useStudioTranslationCards({ scopeKey: PROJECT, bibleProjectId: PROJECT });
      return <StudioTranslationCharacterCardSection controller={controller} items={many} targetLocale="en" defaultOpen />;
    }
    render(<Many />);
    expect(screen.getByLabelText("1페이지 30번째 대사 화자")).toBeTruthy();
    expect(screen.queryByLabelText("1페이지 31번째 대사 화자")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "5개 더 보기" }));
    expect(document.activeElement).toBe(screen.getByLabelText("1페이지 31번째 대사 화자"));
    expect(screen.queryByRole("button", { name: /더 보기/ })).toBeNull();
  });

  it("대사가 사라진 뒤 남은 지정은 '정리' 버튼으로 걷어낸다 — 자동으로 지우지 않는다", () => {
    seedBible();
    const { unmount } = render(<Harness />);
    fireEvent.change(screen.getByLabelText("1페이지 1번째 대사 화자"), { target: { value: "yuna" } });
    unmount();
    // 같은 저장소에 문서에 없는 대사의 지정을 하나 더 넣는다.
    function OneItem() {
      const controller = useStudioTranslationCards({ scopeKey: PROJECT, bibleProjectId: PROJECT });
      return (
        <StudioTranslationCharacterCardSection controller={controller} items={items.slice(1)} targetLocale="en" defaultOpen />
      );
    }
    render(<OneItem />);
    fireEvent.click(screen.getByRole("button", { name: /문서에 없는 대사 1개의 지정 정리/ }));
    expect(storedCards().speakers).toEqual({});
  });

  it("캔버스 이동 버튼은 콜백이 있을 때만 그리고, 누르면 페이지와 요소를 넘긴다", () => {
    seedBible();
    const onReveal = vi.fn();
    const { unmount } = render(<Harness />);
    expect(screen.queryByRole("button", { name: /캔버스에서 보기/ })).toBeNull();
    unmount();
    render(<Harness onReveal={onReveal} />);
    fireEvent.click(screen.getByRole("button", { name: "1페이지 2번째 대사 캔버스에서 보기" }));
    expect(onReveal).toHaveBeenCalledWith("p1", "b2");
  });

  it("인물 카드가 없으면 화자를 지정할 수 없다는 안내를 보여 준다", () => {
    render(<Harness withBible={false} />);
    expect(screen.getByText("인물 카드를 하나 이상 만들어야 화자를 지정할 수 있어요.")).toBeTruthy();
    expect(screen.queryByLabelText("1페이지 1번째 대사 화자")).toBeNull();
  });
});
