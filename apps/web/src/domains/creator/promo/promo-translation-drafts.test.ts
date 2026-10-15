import { describe, expect, it } from "vitest";

import {
  CREATOR_ECOSYSTEM_MAX_BYTES,
  CREATOR_ECOSYSTEM_STORAGE_KEY,
  EMPTY_CREATOR_ECOSYSTEM_STATE,
  setDialogueTranslation,
  translationStatus,
  upsertDialogueSource,
  type CreatorEcosystemState,
  type DialogueRecord,
} from "../ecosystem/creator-ecosystem-model";
import { translationState } from "../ecosystem/ecosystem-workflow";
import {
  isPromoLocaleCode,
  parsePromoTranslationBundle,
  PROMO_ECOSYSTEM_PAGE_ID,
  PROMO_TRANSLATION_DRAFTS_KIND,
  PROMO_TRANSLATION_DRAFTS_MAX,
  promoTranslationBundleFromEcosystem,
  promoTranslationLocales,
  promoTranslationState,
  readPromoEcosystemTranslations,
  readPromoTranslationBundle,
} from "./promo-translation-drafts";

import type { TranslationDraft } from "../ecosystem/ecosystem-record";
import type { PromoTranslationDraft } from "./promo-translation-drafts";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 15, 9, minute)).toISOString();
function draft(extra: Partial<PromoTranslationDraft> = {}): PromoTranslationDraft {
  return { id: "d1", pageId: "p1", elementId: "e1", source: "어서 와", locale: "en", text: "Welcome.", approved: true, updatedAt: at(0), ...extra };
}
const kindFile = (drafts: unknown, extra: Record<string, unknown> = {}) => ({ kind: PROMO_TRANSLATION_DRAFTS_KIND, version: 1, drafts, ...extra });

describe("번역 초안 상태 판정", () => {
  it("창작 생태계의 translationState와 모든 조합에서 같은 결과를 낸다", () => {
    const sources = ["어서 와", "어서 와!", ""];
    const record = (extra: Partial<TranslationDraft> = {}): TranslationDraft => ({ id: "d1", pageId: "p1", elementId: "e1", source: "어서 와", locale: "en", text: "Welcome.", approved: true, updatedAt: at(0), ...extra });
    const drafts: (TranslationDraft | undefined)[] = [undefined, record(), record({ approved: false }), record({ source: "어서 와!" }), record({ source: "", approved: false })];
    for (const source of sources) {
      for (const value of drafts) {
        const row = { pageId: "p1", elementId: "e1", source, name: "e1" };
        expect(promoTranslationState(row, value)).toBe(translationState(row, value));
      }
    }
  });

  it("원문이 다르면 승인 여부와 상관없이 오래됨이다", () => {
    expect(promoTranslationState({ source: "새 원문" }, draft({ source: "옛 원문", approved: true }))).toBe("stale");
    expect(promoTranslationState({ source: "옛 원문" }, draft({ source: "옛 원문", approved: false }))).toBe("draft");
    expect(promoTranslationState({ source: "옛 원문" }, draft({ source: "옛 원문", approved: true }))).toBe("approved");
    expect(promoTranslationState({ source: "x" }, undefined)).toBe("missing");
  });
});

describe("번역 초안 파일 읽기", () => {
  it("전용 형식을 읽고 문서 ID·revision·원문 행을 함께 돌려준다", () => {
    const parsed = parsePromoTranslationBundle(kindFile([draft(), draft({ id: "d2", elementId: "e2", locale: "ja", text: "ようこそ" })], {
      documentId: "doc-9", revision: 7, rows: [{ pageId: "p1", elementId: "e1", source: "어서 와" }, { pageId: "p1", elementId: "e2", source: "오랜만" }],
    }));
    expect(parsed.documentId).toBe("doc-9");
    expect(parsed.revision).toBe(7);
    expect(parsed.rows).toHaveLength(2);
    expect(promoTranslationLocales(parsed)).toEqual(["en", "ja"]);
  });

  it("창작 생태계 제작 기록(translations)과 초안 배열도 읽는다", () => {
    expect(parsePromoTranslationBundle({ version: 1, documentId: "doc", revision: 3, translations: [draft()], worldChanges: [] })).toMatchObject({ documentId: "doc", revision: 3, rows: [] });
    expect(parsePromoTranslationBundle([draft()])).toMatchObject({ documentId: null, revision: null });
  });

  it("같은 대사·로케일의 초안이 여럿이면 가장 늦게 갱신된 하나만 남긴다", () => {
    const parsed = parsePromoTranslationBundle([
      draft({ id: "old", text: "Old", updatedAt: at(1) }),
      draft({ id: "new", text: "New", updatedAt: at(5) }),
      draft({ id: "older", text: "Older", updatedAt: at(2) }),
    ]);
    expect(parsed.drafts.map((value) => value.id)).toEqual(["new"]);
  });

  it.each([
    ["문자열", "x"],
    ["숫자", 3],
    ["초안 목록 없음", { version: 1 }],
    ["다른 종류", { kind: "other", drafts: [] }],
    ["버전 불일치", kindFile([], { version: 2 })],
    ["revision이 음수", kindFile([], { revision: -1 })],
    ["revision이 소수", kindFile([], { revision: 1.5 })],
    ["문서 ID가 빈 문자열", kindFile([], { documentId: "" })],
    ["초안이 객체가 아님", kindFile(["text"])],
    ["로케일 대문자", kindFile([draft({ locale: "EN" })])],
    ["로케일 경로 문자", kindFile([draft({ locale: "../x" })])],
    ["로케일이 긴 단어", kindFile([draft({ locale: "english" })])],
    ["승인 여부가 문자열", kindFile([{ ...draft(), approved: "yes" }])],
    ["갱신 시각이 날짜가 아님", kindFile([draft({ updatedAt: "어제" })])],
    ["ID 누락", kindFile([{ ...draft(), id: undefined }])],
    ["번역문이 너무 김", kindFile([draft({ text: "a".repeat(12_001) })])],
    ["원문 행 형식 오류", kindFile([draft()], { rows: ["x"] })],
    ["원문 행 중복", kindFile([draft()], { rows: [{ pageId: "p", elementId: "e", source: "a" }, { pageId: "p", elementId: "e", source: "b" }] })],
    ["원문 행이 배열이 아님", kindFile([draft()], { rows: {} })],
  ])("거절한다: %s", (_label, input) => {
    expect(() => parsePromoTranslationBundle(input)).toThrow();
  });

  it("컷 묶음 파일을 잘못 고르면 어디서 불러올지 알려 준다", () => {
    expect(() => parsePromoTranslationBundle({ kind: "toonstudio-document-cuts", version: 1, cuts: [] })).toThrow("컷 묶음 파일");
  });

  it("초안 수 상한을 넘기면 거절한다", () => {
    const many = Array.from({ length: PROMO_TRANSLATION_DRAFTS_MAX + 1 }, (_, index) => draft({ id: `d${index}`, elementId: `e${index}` }));
    expect(() => parsePromoTranslationBundle(many)).toThrow();
  });

  it("로케일 코드는 경로에 안전한 모양만 받는다", () => {
    for (const code of ["en", "ja", "zh-Hans", "pt-BR", "fil"]) expect(isPromoLocaleCode(code)).toBe(true);
    for (const code of ["", "EN", "e", "english", "en_US", "en/US", "../en", "en-", "zh-Hans-CN"]) expect(isPromoLocaleCode(code)).toBe(false);
  });

  it("파일에서 읽을 때 빈 파일·JSON이 아닌 파일을 구분한다", async () => {
    await expect(readPromoTranslationBundle(new File([], "e.json"))).rejects.toThrow("빈 파일");
    await expect(readPromoTranslationBundle(new File(["{"], "bad.json"))).rejects.toThrow("JSON으로 읽을 수 없는");
    const ok = await readPromoTranslationBundle(new File([JSON.stringify([draft()])], "ok.json"));
    expect(ok.drafts).toHaveLength(1);
  });
});

// ── 창작 생태계 작업대(/studio/ecosystem): 원문 개정(sourceRevision)에 묶인 번역 ──────────────────────

/** 작업대 화면과 같은 함수(upsertDialogueSource·setDialogueTranslation)로 만든 실제 상태. */
function ecosystemState(): CreatorEcosystemState {
  let state = structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE);
  state = upsertDialogueSource(state, "line-1", "내일도 여기서 만날래?");
  state = setDialogueTranslation(state, "line-1", "en", "Shall we meet here again tomorrow?", true);
  state = setDialogueTranslation(state, "line-1", "ja", "明日もここで会う?", false);
  state = upsertDialogueSource(state, "line-2", "응, 좋아");
  state = setDialogueTranslation(state, "line-2", "en", "Sure.", false);
  state = upsertDialogueSource(state, "line-3", "잘 가");
  state = setDialogueTranslation(state, "line-3", "en", "Bye.", true);
  // 번역을 승인한 뒤 원문을 고쳤다: 개정이 올라가 기존 번역은 오래된 번역이다.
  state = upsertDialogueSource(state, "line-3", "잘 가요");
  state = upsertDialogueSource(state, "line-4", "번역 없는 대사");
  return state;
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  constructor(initial: Record<string, string> = {}, private readonly failReads = false) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null {
    if (this.failReads) throw new DOMException("차단됨", "SecurityError");
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("원문 개정에 묶인 번역 판정", () => {
  it("창작 생태계의 translationStatus와 모든 개정·승인 조합에서 같은 결과를 낸다", () => {
    for (const rowRevision of [0, 1, 2]) {
      for (const translationRevision of [undefined, 0, 1, 2]) {
        for (const approved of [true, false]) {
          const row = { pageId: PROMO_ECOSYSTEM_PAGE_ID, elementId: "l", source: "원문", revision: rowRevision };
          const value = translationRevision === undefined ? undefined : { id: "l:en", pageId: PROMO_ECOSYSTEM_PAGE_ID, elementId: "l", source: "원문", locale: "en", text: "T", approved, sourceRevision: translationRevision };
          const record: DialogueRecord = { id: "l", source: "원문", sourceRevision: rowRevision, translations: translationRevision === undefined ? {} : { en: { text: "T", sourceRevision: translationRevision, approved } } };
          expect(promoTranslationState(row, value)).toBe(translationStatus(record, "en"));
        }
      }
    }
  });

  it("개정 번호가 양쪽에 있으면 원문 글자가 같아도 개정이 다르면 오래됨이다", () => {
    const base = { id: "d", pageId: "p", elementId: "e", locale: "en", text: "T", approved: true };
    expect(promoTranslationState({ source: "같은 글", revision: 2 }, { ...base, source: "같은 글", sourceRevision: 1 })).toBe("stale");
    expect(promoTranslationState({ source: "다른 글", revision: 1 }, { ...base, source: "옛 글", sourceRevision: 1 })).toBe("approved");
  });

  it("한쪽에만 개정 번호가 있으면 원문 글자로 비교한다", () => {
    const base = { id: "d", pageId: "p", elementId: "e", locale: "en", text: "T", approved: false };
    expect(promoTranslationState({ source: "글" }, { ...base, source: "글", sourceRevision: 3 })).toBe("draft");
    expect(promoTranslationState({ source: "새 글", revision: 3 }, { ...base, source: "글" })).toBe("stale");
  });

  it("창작 생태계 제작 기록의 TranslationDraft를 그대로 받을 수 있다", () => {
    const record: TranslationDraft = { id: "d", pageId: "p", elementId: "e", source: "원문", locale: "en", text: "T", approved: true, updatedAt: at(0) };
    const accepted: PromoTranslationDraft = record;
    expect(promoTranslationState({ source: "원문" }, accepted)).toBe("approved");
  });
});

describe("창작 생태계 대사 → 번역 초안 묶음", () => {
  it("대사마다 현재 개정의 행을, 번역마다 번역한 개정이 붙은 초안을 만든다", () => {
    const bundle = promoTranslationBundleFromEcosystem(ecosystemState());
    expect(bundle).toMatchObject({ documentId: null, revision: null });
    expect(bundle.rows).toEqual([
      { pageId: "ecosystem", elementId: "line-1", source: "내일도 여기서 만날래?", revision: 0 },
      { pageId: "ecosystem", elementId: "line-2", source: "응, 좋아", revision: 0 },
      { pageId: "ecosystem", elementId: "line-3", source: "잘 가요", revision: 1 },
      { pageId: "ecosystem", elementId: "line-4", source: "번역 없는 대사", revision: 0 },
    ]);
    expect(bundle.drafts.map((value) => `${value.elementId}/${value.locale}/r${value.sourceRevision}/${value.approved}`)).toEqual([
      "line-1/en/r0/true", "line-1/ja/r0/false", "line-2/en/r0/false", "line-3/en/r0/true",
    ]);
    expect(promoTranslationLocales(bundle)).toEqual(["en", "ja"]);
  });

  it("행마다 판정하면 창작 생태계 화면의 상태와 같다(승인·초안·오래됨·번역 없음)", () => {
    const state = ecosystemState();
    const bundle = promoTranslationBundleFromEcosystem(state);
    for (const record of state.dialogue) {
      const row = bundle.rows.find((value) => value.elementId === record.id);
      const value = bundle.drafts.find((draft) => draft.elementId === record.id && draft.locale === "en");
      expect(row).toBeDefined();
      if (row) expect(promoTranslationState(row, value)).toBe(translationStatus(record, "en"));
    }
    expect(state.dialogue.map((record) => translationStatus(record, "en"))).toEqual(["approved", "draft", "stale", "missing"]);
  });

  it("같은 ID의 대사가 둘이면 뒤의 것을 쓰고, 입력 상태를 바꾸지 않는다", () => {
    const state = ecosystemState();
    const duplicated: CreatorEcosystemState = { ...state, dialogue: [...state.dialogue, { id: "line-1", source: "고쳐 쓴 대사", sourceRevision: 4, translations: {} }] };
    const before = JSON.stringify(duplicated);
    const bundle = promoTranslationBundleFromEcosystem(duplicated);
    expect(bundle.rows.filter((row) => row.elementId === "line-1")).toEqual([{ pageId: "ecosystem", elementId: "line-1", source: "고쳐 쓴 대사", revision: 4 }]);
    expect(bundle.drafts.some((value) => value.elementId === "line-1")).toBe(false);
    expect(JSON.stringify(duplicated)).toBe(before);
  });

  it("경로에 쓸 수 없는 로케일 코드의 번역은 초안으로 만들지 않는다", () => {
    const state: CreatorEcosystemState = { ...EMPTY_CREATOR_ECOSYSTEM_STATE, dialogue: [{ id: "a", source: "가", sourceRevision: 0, translations: { en: { text: "A", sourceRevision: 0, approved: true }, "../x": { text: "X", sourceRevision: 0, approved: true } } }] };
    expect(promoTranslationBundleFromEcosystem(state).drafts.map((value) => value.locale)).toEqual(["en"]);
  });
});

describe("이 브라우저의 창작 생태계 기록 읽기", () => {
  const stored = (state: CreatorEcosystemState) => new MemoryStorage({ [CREATOR_ECOSYSTEM_STORAGE_KEY]: JSON.stringify(state) });

  it("저장된 대사 번역을 읽는다", () => {
    const result = readPromoEcosystemTranslations(stored(ecosystemState()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.rows).toHaveLength(4);
      expect(promoTranslationLocales(result.bundle)).toEqual(["en", "ja"]);
    }
  });

  it("저장소를 쓸 수 없으면(없음·차단) 쓸 수 없다고 구분한다", () => {
    expect(readPromoEcosystemTranslations(null)).toEqual({ ok: false, reason: "unavailable" });
    expect(readPromoEcosystemTranslations(undefined)).toEqual({ ok: false, reason: "unavailable" });
    expect(readPromoEcosystemTranslations(new MemoryStorage({}, true))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("기록이 없거나 대사가 없으면 비어 있다고, 대사만 있고 번역이 없으면 번역이 없다고 구분한다", () => {
    expect(readPromoEcosystemTranslations(new MemoryStorage())).toEqual({ ok: false, reason: "empty" });
    expect(readPromoEcosystemTranslations(stored(EMPTY_CREATOR_ECOSYSTEM_STATE))).toEqual({ ok: false, reason: "empty" });
    const onlySource = upsertDialogueSource(structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE), "line-1", "원문만");
    expect(readPromoEcosystemTranslations(stored(onlySource))).toEqual({ ok: false, reason: "no-translations" });
  });

  it("깨진 JSON이나 너무 큰 기록은 깨졌다고 알리고 아무것도 쓰지 않는다", () => {
    expect(readPromoEcosystemTranslations(new MemoryStorage({ [CREATOR_ECOSYSTEM_STORAGE_KEY]: "{ 깨짐" }))).toEqual({ ok: false, reason: "corrupt" });
    expect(readPromoEcosystemTranslations(new MemoryStorage({ [CREATOR_ECOSYSTEM_STORAGE_KEY]: "x".repeat(CREATOR_ECOSYSTEM_MAX_BYTES + 1) }))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("검증을 거쳐 읽는다: 형식이 틀린 대사·번역은 버리고 로케일 모양이 틀린 번역은 뺀다", () => {
    const raw = JSON.stringify({
      version: 1,
      dialogue: [
        { id: "ok", source: "정상", sourceRevision: 0, translations: { en: { text: "OK", sourceRevision: 0, approved: true }, EN: { text: "bad", sourceRevision: 0, approved: true }, ja: { text: "", sourceRevision: 0, approved: true } } },
        { id: "한 글 id", source: "ID 모양이 틀림", sourceRevision: 0, translations: {} },
        "문자열",
      ],
    });
    const result = readPromoEcosystemTranslations(new MemoryStorage({ [CREATOR_ECOSYSTEM_STORAGE_KEY]: raw }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.rows.map((row) => row.elementId)).toEqual(["ok"]);
      expect(result.bundle.drafts.map((value) => value.locale)).toEqual(["en"]);
    }
  });
});

describe("창작 생태계 기록 파일", () => {
  it("{ version: 1, dialogue } 모양 파일도 같은 방식으로 읽는다", () => {
    const parsed = parsePromoTranslationBundle(ecosystemState());
    expect(parsed.rows.map((row) => [row.elementId, row.revision])).toEqual([["line-1", 0], ["line-2", 0], ["line-3", 1], ["line-4", 0]]);
    expect(parsed.drafts.every((value) => typeof value.sourceRevision === "number")).toBe(true);
  });

  it("개정 번호가 있는 전용 형식 파일(rows[].revision, drafts[].sourceRevision)도 읽는다", () => {
    const parsed = parsePromoTranslationBundle(kindFile(
      [{ ...draft(), sourceRevision: 2 }],
      { rows: [{ pageId: "p1", elementId: "e1", source: "어서 와", revision: 3 }] },
    ));
    expect(parsed.rows[0]?.revision).toBe(3);
    expect(parsed.drafts[0]?.sourceRevision).toBe(2);
    expect(promoTranslationState(parsed.rows[0] ?? { source: "" }, parsed.drafts[0])).toBe("stale");
  });

  it.each([
    ["초안의 개정이 음수", kindFile([{ ...draft(), sourceRevision: -1 }])],
    ["초안의 개정이 소수", kindFile([{ ...draft(), sourceRevision: 1.5 }])],
    ["초안의 개정이 문자열", kindFile([{ ...draft(), sourceRevision: "1" }])],
    ["행의 개정이 음수", kindFile([draft()], { rows: [{ pageId: "p", elementId: "e", source: "a", revision: -1 }] })],
  ])("거절한다: %s", (_label, input) => {
    expect(() => parsePromoTranslationBundle(input)).toThrow();
  });

  it("version이 1이 아닌 { dialogue } 객체는 번역 초안 파일로 받지 않는다", () => {
    expect(() => parsePromoTranslationBundle({ version: 2, dialogue: [] })).toThrow();
    expect(() => parsePromoTranslationBundle({ dialogue: [] })).toThrow();
  });
});
