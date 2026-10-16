/**
 * 번역 인물 카드 한 장의 편집 표면 — 말투 메모 · 존대/반말 단계 · 호칭 맵 · 고정어 · 금지어.
 *
 * 시트에서 온 값은 읽기 전용으로 따로 보여 주고(수정하지 않는다), 번역용 값만 입력받는다. 값이 비어 있으면
 * 채워진 척하지 않고 "미입력"이라는 글자 표지로 드러낸다. 모든 입력은 보이는 라벨을 갖고, 행 추가/삭제 뒤에는
 * 포커스를 다음 작업 지점으로 옮긴다. 변경은 `onPatch` 로만 나간다 — 저장과 상한 처리는 편집 연산 계층의 몫이다.
 */
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DIALOGUE_LOCALE_PRESETS } from "./studio-dialogue-translate";
import {
  CARD_INPUT_CLASS,
  CARD_LABEL_CLASS,
  CARD_MISSING_BADGE_CLASS,
  CARD_SMALL_BUTTON_CLASS,
  splitCardTermList,
} from "./studio-translation-card-ui";
import {
  STUDIO_TRANSLATION_CARD_LIMITS,
  STUDIO_TRANSLATION_REGISTERS,
  STUDIO_TRANSLATION_REGISTER_LABELS,
  isStudioTranslationCardLocaleTag,
} from "./studio-translation-character-card";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { StudioTranslationCardPatch } from "./studio-translation-character-card-edit";
import type {
  StudioTranslationAddressTerm,
  StudioTranslationBannedTerm,
  StudioTranslationEffectiveCard,
  StudioTranslationFixedTerm,
  StudioTranslationRegister,
} from "./studio-translation-character-card";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioTranslationCharacterCard", ko, en);

/** 번호·이름이 들어가는 문구 — 값마다 번역 키가 생기지 않게 템플릿을 번역한 뒤 채운다. */
const biFormat = (ko: string, en: string, value: string | number): string =>
  formatI18nTemplate(bi(ko, en), { v0: value });

function replaceAt<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((item, i) => (i === index ? next : item));
}

function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

function isRegister(value: string): value is StudioTranslationRegister {
  return (STUDIO_TRANSLATION_REGISTERS as readonly string[]).includes(value);
}

/** 쉼표로 구분한 표기 목록 입력 — 타이핑 중 쉼표가 사라지지 않게 원문 문자열을 따로 들고 있는다. */
function TermListInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  readonly id: string;
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly placeholder: string;
}) {
  const [raw, setRaw] = useState(() => value.join(", "));
  // 바깥(다른 탭·재시도)에서 값이 바뀌었을 때만 입력 문자열을 맞춘다 — 내가 친 값의 에코로는 덮지 않는다.
  useEffect(() => {
    setRaw((current) =>
      splitCardTermList(current).join("\u0000") === value.join("\u0000") ? current : value.join(", "),
    );
  }, [value]);
  return (
    <input
      id={id}
      type="text"
      value={raw}
      placeholder={placeholder}
      className={CARD_INPUT_CLASS}
      onChange={(event) => {
        setRaw(event.target.value);
        onChange(splitCardTermList(event.target.value));
      }}
    />
  );
}

export interface StudioTranslationCardEditorProps {
  readonly card: StudioTranslationEffectiveCard;
  /** 청자 후보 — 자기 자신을 뺀 다른 인물 카드. */
  readonly peers: readonly StudioTranslationEffectiveCard[];
  readonly onPatch: (patch: StudioTranslationCardPatch) => void;
  /** 직접 추가한 카드·시트에서 사라진 카드만 지울 수 있다. */
  readonly onRemove?: () => void;
  readonly targetLocale: string;
  /**
   * 값이 있으면 편집을 막고 이유로 보여 준다(저장 상한 때문에 이 편집이 저장되지 않을 때). 입력이 조용히 무시되는 것보다
   * 막힌 이유를 말하는 편이 낫다.
   */
  readonly lockedReason?: string;
}

/**
 * 호출부는 `key={card.characterId}` 로 쓴다 — 인물이 바뀌면 이 컴포넌트가 새로 마운트되어 확인 중이던 삭제 같은
 * 지역 상태가 자연히 초기화된다(prop 변화를 효과로 따라가지 않는다).
 */
export function StudioTranslationCardEditor({
  card,
  peers,
  onPatch,
  onRemove,
  targetLocale,
  lockedReason,
}: StudioTranslationCardEditorProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const localeListId = `${baseId}-locales`;
  const refs = useRef(new Map<string, HTMLElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    if (focusKey === null) return;
    refs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey, card]);

  const bind = (key: string) => (node: HTMLElement | null) => {
    if (node) refs.current.set(key, node);
    else refs.current.delete(key);
  };

  const limits = STUDIO_TRANSLATION_CARD_LIMITS;
  const localeOptions = DIALOGUE_LOCALE_PRESETS.map((preset) => preset.code);
  if (targetLocale.trim() !== "" && !localeOptions.includes(targetLocale)) localeOptions.push(targetLocale);

  const peerName = (id: string) => peers.find((peer) => peer.characterId === id)?.name ?? id;
  const usedListeners = new Set(card.addressTerms.map((row) => row.listenerId));
  const suggestedRelations = card.sheetRelations.filter((relation) => !usedListeners.has(relation.listenerId));

  const registerOptions = (
    <>
      {STUDIO_TRANSLATION_REGISTERS.map((level) => (
        <option key={level} value={level}>
          {bi(STUDIO_TRANSLATION_REGISTER_LABELS[level].ko, STUDIO_TRANSLATION_REGISTER_LABELS[level].en)}
        </option>
      ))}
    </>
  );

  const localeField = (id: string, value: string, onChange: (next: string) => void) => {
    const invalid = !isStudioTranslationCardLocaleTag(value);
    return (
      <div>
        <label htmlFor={id} className={CARD_LABEL_CLASS}>
          {bi("대상 언어(비우면 모든 언어)", "Language (blank = all)")}
        </label>
        <input
          id={id}
          type="text"
          list={localeListId}
          value={value}
          maxLength={limits.localeChars}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-hint` : undefined}
          placeholder="en, ja, zh-Hans"
          className={CARD_INPUT_CLASS}
          onChange={(event) => onChange(event.target.value)}
        />
        {invalid ? (
          <p id={`${id}-hint`} className="mt-0.5 text-[0.58rem] text-warn">
            {bi(
              "언어 코드 형식이 아니에요(예: en, ja, zh-Hans). 이 규칙은 어떤 언어에도 적용되지 않아요.",
              "Not a language code (e.g. en, ja, zh-Hans). This rule will not apply to any language.",
            )}
          </p>
        ) : null}
      </div>
    );
  };

  const addAddressRow = (listenerId: string) => {
    onPatch({
      addressTerms: [
        ...card.addressTerms,
        { listenerId, sourceTerm: "", targetTerm: "", locale: "", register: null, avoidTerms: [] },
      ],
    });
    setFocusKey(`address-${card.addressTerms.length}-target`);
  };

  const patchAddress = (index: number, row: StudioTranslationAddressTerm, next: Partial<StudioTranslationAddressTerm>) =>
    onPatch({ addressTerms: replaceAt(card.addressTerms, index, { ...row, ...next }) });
  const patchFixed = (index: number, row: StudioTranslationFixedTerm, next: Partial<StudioTranslationFixedTerm>) =>
    onPatch({ fixedTerms: replaceAt(card.fixedTerms, index, { ...row, ...next }) });
  const patchBanned = (index: number, row: StudioTranslationBannedTerm, next: Partial<StudioTranslationBannedTerm>) =>
    onPatch({ bannedTerms: replaceAt(card.bannedTerms, index, { ...row, ...next }) });

  const missing = (filled: boolean) =>
    filled ? null : <span className={CARD_MISSING_BADGE_CLASS}>{bi("미입력", "Not set")}</span>;

  return (
    <fieldset disabled={lockedReason !== undefined} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <legend className="sr-only">{biFormat("{v0} 번역 카드 편집", "Edit translation card: {v0}", card.name)}</legend>
      <datalist id={localeListId}>
        {localeOptions.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      {lockedReason !== undefined ? (
        <p role="note" className="rounded-lg border border-warn/35 bg-warn/10 px-2 py-1.5 text-[0.62rem] leading-relaxed text-warn">
          {lockedReason}
        </p>
      ) : null}

      {card.origin === "orphan" ? (
        <p role="note" className="rounded-lg border border-warn/35 bg-warn/10 px-2 py-1.5 text-[0.62rem] leading-relaxed text-warn">
          {bi(
            "스토리 바이블에서 이 인물을 찾지 못했어요. 번역용 값은 보관돼 있으니, 인물이 돌아오거나 필요 없으면 카드를 지우세요.",
            "This character is no longer in the story bible. Its translation values are kept; delete the card if it is no longer needed.",
          )}
        </p>
      ) : null}

      {/* ── 말투 메모 ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${baseId}-note`} className={CARD_LABEL_CLASS}>
            {bi("말투 메모", "Speech note")}
          </label>
          {missing(card.filled.speechNote)}
        </div>
        {card.sheetSpeechNote !== "" ? (
          <p className="rounded-lg border border-line bg-panel px-2 py-1 text-[0.62rem] leading-relaxed text-fg-2">
            <span className="font-semibold">{bi("캐릭터 시트(읽기 전용): ", "Character sheet (read-only): ")}</span>
            {card.sheetSpeechNote}
          </p>
        ) : null}
        <textarea
          id={`${baseId}-note`}
          rows={2}
          maxLength={limits.noteChars}
          value={card.speechNoteOverride ?? ""}
          placeholder={
            card.sheetSpeechNote !== ""
              ? bi("비워 두면 위 시트의 말투를 그대로 써요", "Leave blank to use the sheet's speech style")
              : bi("예: 존댓말, 끝을 흐린다, 사투리", "e.g. polite speech, trails off, dialect")
          }
          className={`${CARD_INPUT_CLASS} resize-y leading-snug`}
          onChange={(event) => onPatch({ speechNote: event.target.value === "" ? null : event.target.value })}
        />
      </div>

      {/* ── 존대/반말 단계 ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${baseId}-register`} className={CARD_LABEL_CLASS}>
            {bi("기본 존대/반말 단계", "Default speech level")}
          </label>
          {missing(card.filled.register)}
        </div>
        <select
          id={`${baseId}-register`}
          value={card.register ?? ""}
          className={CARD_INPUT_CLASS}
          onChange={(event) => onPatch({ register: isRegister(event.target.value) ? event.target.value : null })}
        >
          <option value="">{bi("미입력", "Not set")}</option>
          {registerOptions}
        </select>
        <p className="text-[0.58rem] leading-relaxed text-fg-3">
          {bi(
            "QA는 한국어·일본어 번역에서만 존대/반말을 판정해요. 다른 언어에서는 AI 요청에만 전달돼요.",
            "QA checks speech level only for Korean and Japanese translations; in other languages it is only passed to the AI request.",
          )}
        </p>
      </div>

      {/* ── 호칭 맵 ── */}
      <section aria-labelledby={`${baseId}-address-title`} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 id={`${baseId}-address-title`} className="text-[0.66rem] font-bold text-fg">
            {bi("호칭 맵 (이 인물 → 청자)", "Address terms (this character → listener)")}
          </h4>
          {missing(card.filled.addressTerms)}
        </div>
        {suggestedRelations.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={bi("시트 관계로 호칭 행 추가", "Add an address row from a sheet relation")}>
            {suggestedRelations.map((relation) => (
              <button
                key={relation.listenerId}
                type="button"
                className={CARD_SMALL_BUTTON_CLASS}
                disabled={card.addressTerms.length >= limits.addressTerms}
                onClick={() => addAddressRow(relation.listenerId)}
              >
                <Plus size={11} aria-hidden />
                {relation.listenerName}
                <span className="font-normal text-fg-3">({relation.label})</span>
              </button>
            ))}
          </div>
        ) : null}
        {card.addressTerms.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-2 text-[0.62rem] leading-relaxed text-fg-3">
            {bi(
              "아직 호칭이 없어요. 이 인물이 누구를 어떻게 부르는지 적어 두면 번역과 QA가 같은 호칭을 지키게 해요.",
              "No address terms yet. Record how this character addresses each person so translation and QA keep them consistent.",
            )}
          </p>
        ) : null}
        <ul className="space-y-2">
          {card.addressTerms.map((row, index) => {
            const relation = card.sheetRelations.find((entry) => entry.listenerId === row.listenerId);
            const rowId = `${baseId}-address-${index}`;
            return (
              <li key={index} className="border-t border-line/60 pt-2">
                <fieldset className="min-w-0 space-y-1.5">
                  <legend className="text-[0.62rem] font-semibold text-fg-2">
                    {biFormat("호칭 {v0}", "Address {v0}", index + 1)}
                    {relation ? (
                      <span className="ml-1 font-normal text-fg-3">
                        {biFormat("· 시트 관계: {v0}", "· Sheet relation: {v0}", relation.label)}
                      </span>
                    ) : null}
                  </legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="col-span-2">
                      <label htmlFor={`${rowId}-listener`} className={CARD_LABEL_CLASS}>{bi("청자", "Listener")}</label>
                      <select
                        id={`${rowId}-listener`}
                        ref={bind(`address-${index}-listener`)}
                        value={row.listenerId}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchAddress(index, row, { listenerId: event.target.value })}
                      >
                        <option value="">{bi("청자 선택…", "Choose a listener…")}</option>
                        {peers.map((peer) => (
                          <option key={peer.characterId} value={peer.characterId}>{peer.name}</option>
                        ))}
                        {row.listenerId !== "" && !peers.some((peer) => peer.characterId === row.listenerId) ? (
                          <option value={row.listenerId}>{peerName(row.listenerId)}</option>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${rowId}-source`} className={CARD_LABEL_CLASS}>{bi("원문 호칭", "Source term")}</label>
                      <input
                        id={`${rowId}-source`}
                        type="text"
                        value={row.sourceTerm}
                        maxLength={limits.termChars}
                        placeholder={bi("예: 선배", "e.g. 선배")}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchAddress(index, row, { sourceTerm: event.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${rowId}-target`} className={CARD_LABEL_CLASS}>{bi("번역 호칭", "Translated term")}</label>
                      <input
                        id={`${rowId}-target`}
                        ref={bind(`address-${index}-target`)}
                        type="text"
                        value={row.targetTerm}
                        maxLength={limits.termChars}
                        placeholder="Senpai"
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchAddress(index, row, { targetTerm: event.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor={`${rowId}-avoid`} className={CARD_LABEL_CLASS}>
                        {bi("쓰지 않을 다른 표기(쉼표로 구분)", "Variants to avoid (comma-separated)")}
                      </label>
                      <TermListInput
                        id={`${rowId}-avoid`}
                        value={row.avoidTerms}
                        placeholder="Sunbae, Senior"
                        onChange={(next) => patchAddress(index, row, { avoidTerms: next.slice(0, limits.avoidTerms) })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${rowId}-register`} className={CARD_LABEL_CLASS}>{bi("이 청자에게 쓰는 단계", "Level toward this listener")}</label>
                      <select
                        id={`${rowId}-register`}
                        value={row.register ?? ""}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchAddress(index, row, { register: isRegister(event.target.value) ? event.target.value : null })}
                      >
                        <option value="">{bi("기본 단계를 따름", "Follow the default")}</option>
                        {registerOptions}
                      </select>
                    </div>
                    {localeField(`${rowId}-locale`, row.locale, (next) => patchAddress(index, row, { locale: next }))}
                  </div>
                  <button
                    type="button"
                    className={CARD_SMALL_BUTTON_CLASS}
                    aria-label={biFormat("호칭 {v0} 삭제", "Delete address {v0}", index + 1)}
                    onClick={() => {
                      onPatch({ addressTerms: removeAt(card.addressTerms, index) });
                      setFocusKey("address-add");
                    }}
                  >
                    <Trash2 size={11} aria-hidden />
                    {bi("삭제", "Delete")}
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          ref={bind("address-add")}
          className={CARD_SMALL_BUTTON_CLASS}
          disabled={card.addressTerms.length >= limits.addressTerms}
          onClick={() => addAddressRow("")}
        >
          <Plus size={11} aria-hidden />
          {bi("호칭 추가", "Add address term")}
        </button>
      </section>

      {/* ── 고정어 ── */}
      <section aria-labelledby={`${baseId}-fixed-title`} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 id={`${baseId}-fixed-title`} className="text-[0.66rem] font-bold text-fg">
            {bi("고정어 (원문 표현 → 반드시 이렇게)", "Fixed terms (source → always this)")}
          </h4>
          {card.fixedTerms.length > 0 ? null : <span className="text-[0.58rem] text-fg-3">{bi("없음", "None")}</span>}
        </div>
        <ul className="space-y-2">
          {card.fixedTerms.map((row, index) => {
            const rowId = `${baseId}-fixed-${index}`;
            return (
              <li key={index} className="border-t border-line/60 pt-2">
                <fieldset className="min-w-0 space-y-1.5">
                  <legend className="sr-only">{biFormat("고정어 {v0}", "Fixed term {v0}", index + 1)}</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label htmlFor={`${rowId}-source`} className={CARD_LABEL_CLASS}>{biFormat("고정어 {v0} 원문", "Fixed {v0} source", index + 1)}</label>
                      <input
                        id={`${rowId}-source`}
                        ref={bind(`fixed-${index}-source`)}
                        type="text"
                        value={row.source}
                        maxLength={limits.termChars}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchFixed(index, row, { source: event.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${rowId}-target`} className={CARD_LABEL_CLASS}>{biFormat("고정어 {v0} 번역", "Fixed {v0} translation", index + 1)}</label>
                      <input
                        id={`${rowId}-target`}
                        type="text"
                        value={row.target}
                        maxLength={limits.termChars}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchFixed(index, row, { target: event.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      {localeField(`${rowId}-locale`, row.locale, (next) => patchFixed(index, row, { locale: next }))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={CARD_SMALL_BUTTON_CLASS}
                    aria-label={biFormat("고정어 {v0} 삭제", "Delete fixed term {v0}", index + 1)}
                    onClick={() => {
                      onPatch({ fixedTerms: removeAt(card.fixedTerms, index) });
                      setFocusKey("fixed-add");
                    }}
                  >
                    <Trash2 size={11} aria-hidden />
                    {bi("삭제", "Delete")}
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          ref={bind("fixed-add")}
          className={CARD_SMALL_BUTTON_CLASS}
          disabled={card.fixedTerms.length >= limits.fixedTerms}
          onClick={() => {
            onPatch({ fixedTerms: [...card.fixedTerms, { source: "", target: "", locale: "" }] });
            setFocusKey(`fixed-${card.fixedTerms.length}-source`);
          }}
        >
          <Plus size={11} aria-hidden />
          {bi("고정어 추가", "Add fixed term")}
        </button>
      </section>

      {/* ── 금지어 ── */}
      <section aria-labelledby={`${baseId}-banned-title`} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 id={`${baseId}-banned-title`} className="text-[0.66rem] font-bold text-fg">
            {bi("금지어 (이 인물의 번역 대사에 쓰지 않음)", "Banned terms (never in this character's lines)")}
          </h4>
          {card.bannedTerms.length > 0 ? null : <span className="text-[0.58rem] text-fg-3">{bi("없음", "None")}</span>}
        </div>
        <ul className="space-y-2">
          {card.bannedTerms.map((row, index) => {
            const rowId = `${baseId}-banned-${index}`;
            return (
              <li key={index} className="border-t border-line/60 pt-2">
                <fieldset className="min-w-0 space-y-1.5">
                  <legend className="sr-only">{biFormat("금지어 {v0}", "Banned term {v0}", index + 1)}</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label htmlFor={`${rowId}-term`} className={CARD_LABEL_CLASS}>{biFormat("금지어 {v0}", "Banned {v0}", index + 1)}</label>
                      <input
                        id={`${rowId}-term`}
                        ref={bind(`banned-${index}-term`)}
                        type="text"
                        value={row.term}
                        maxLength={limits.termChars}
                        className={CARD_INPUT_CLASS}
                        onChange={(event) => patchBanned(index, row, { term: event.target.value })}
                      />
                    </div>
                    {localeField(`${rowId}-locale`, row.locale, (next) => patchBanned(index, row, { locale: next }))}
                  </div>
                  <button
                    type="button"
                    className={CARD_SMALL_BUTTON_CLASS}
                    aria-label={biFormat("금지어 {v0} 삭제", "Delete banned term {v0}", index + 1)}
                    onClick={() => {
                      onPatch({ bannedTerms: removeAt(card.bannedTerms, index) });
                      setFocusKey("banned-add");
                    }}
                  >
                    <Trash2 size={11} aria-hidden />
                    {bi("삭제", "Delete")}
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          ref={bind("banned-add")}
          className={CARD_SMALL_BUTTON_CLASS}
          disabled={card.bannedTerms.length >= limits.bannedTerms}
          onClick={() => {
            onPatch({ bannedTerms: [...card.bannedTerms, { term: "", locale: "" }] });
            setFocusKey(`banned-${card.bannedTerms.length}-term`);
          }}
        >
          <Plus size={11} aria-hidden />
          {bi("금지어 추가", "Add banned term")}
        </button>
      </section>

      <p className="text-[0.58rem] leading-relaxed text-fg-3">
        {bi(
          "용어 일치는 형태소 분석 없이 글자 단위로 비교해요. 한글·가나·한자의 짧은 표기는 다른 단어 속에서도 일치할 수 있고(예: ‘야’ → ‘시야’), 영어는 복수형·소유형(-s, ’s)과 하이픈 표기를 같은 말로 봐요.",
          "Terms are matched by characters, without morphological analysis. Short Hangul, kana and kanji terms can also match inside other words (e.g. ‘야’ in ‘시야’); English plurals, possessives (-s, ’s) and hyphenated forms count as the same term.",
        )}
      </p>

      {onRemove ? (
        <div className="border-t border-line/60 pt-2">
          {confirmingRemove ? (
            <div className="flex items-center gap-1.5" role="group" aria-label={bi("카드 삭제 확인", "Confirm card deletion")}>
              <p className="min-w-0 flex-1 text-[0.62rem] text-fg-2" role="status">
                {bi("이 카드와 이 인물의 화자 지정을 지울까요?", "Delete this card and its speaker assignments?")}
              </p>
              {/* 누른 "이 카드 삭제" 버튼은 사라진다 — 확인 단계에서는 되돌리기 쉬운 "취소"로, 취소하면 원래 버튼으로 포커스를 옮긴다. */}
              <button
                type="button"
                ref={bind("remove-cancel")}
                className={CARD_SMALL_BUTTON_CLASS}
                onClick={() => {
                  setConfirmingRemove(false);
                  setFocusKey("remove-open");
                }}
              >
                {bi("취소", "Cancel")}
              </button>
              <button type="button" className={`${CARD_SMALL_BUTTON_CLASS} text-bad`} onClick={onRemove}>
                {bi("삭제 확인", "Delete")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              ref={bind("remove-open")}
              className={CARD_SMALL_BUTTON_CLASS}
              onClick={() => {
                setConfirmingRemove(true);
                setFocusKey("remove-cancel");
              }}
            >
              <Trash2 size={11} aria-hidden />
              {bi("이 카드 삭제", "Delete this card")}
            </button>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
