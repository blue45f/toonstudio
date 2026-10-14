import { FileText, Plus, Presentation, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  PITCH_CHARACTER_DESCRIPTION_MAX_LENGTH,
  PITCH_CHARACTER_NAME_MAX_LENGTH,
  PITCH_CHARACTER_ROLE_MAX_LENGTH,
  PITCH_LOGLINE_MAX_LENGTH,
  PITCH_MAX_CHARACTERS,
  PITCH_PLAN_CADENCE_MAX_LENGTH,
  PITCH_PLAN_EPISODE_COUNT_MAX_LENGTH,
  PITCH_PLAN_OUTLINE_MAX_LENGTH,
  PITCH_SYNOPSIS_MAX_LENGTH,
  pitchDocumentCompletion,
  pitchDocumentHasContent,
  type ProductionPitchCharacter,
  type ProductionPitchDocument,
} from "./studio-pitch-document";

import { buttonClass } from "@/shared/components/ui/button-utils";

function createCharacterId(sequence: number): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12);
  return `pitch-character-${random ?? `${Date.now().toString(36)}-${sequence}`}`;
}

function normalizedDocument(draft: ProductionPitchDocument): ProductionPitchDocument | null {
  const characters: ProductionPitchCharacter[] = [];
  for (const character of draft.characters) {
    const name = character.name.trim();
    const role = character.role.trim();
    const description = character.description.trim();
    if (!name && !role && !description) continue;
    if (!name) return null;
    characters.push({ id: character.id, name, role, description });
  }
  return {
    logline: draft.logline.trim(),
    synopsis: draft.synopsis.trim(),
    characters,
    serializationPlan: {
      cadence: draft.serializationPlan.cadence.trim(),
      episodeCount: draft.serializationPlan.episodeCount.trim(),
      outline: draft.serializationPlan.outline.trim(),
    },
  };
}

const inputClass = "mt-1 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent";
const labelClass = "block text-xs font-semibold text-fg-2";

/**
 * 기획서 작성 표면. 로그라인·시놉시스·주요 캐릭터·연재 계획을 구조화해 쓰고,
 * 저장한 기획서를 아래 PowerPoint 편집본(StudioPitchPptxCard)의 슬라이드로
 * 반영해 PPTX로 내보내는 한 동선을 제공한다.
 */
export function StudioPitchDocumentCard({
  document,
  disabled = false,
  onSave,
  onApplyToSlides,
  onNotice,
}: {
  readonly document: ProductionPitchDocument;
  readonly disabled?: boolean;
  readonly onSave: (document: ProductionPitchDocument) => void;
  readonly onApplyToSlides: (document: ProductionPitchDocument) => void;
  readonly onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState<ProductionPitchDocument>(document);
  const [syncedJson, setSyncedJson] = useState(() => JSON.stringify(document));
  const characterSequence = useRef(0);

  // 바깥(다른 탭·슬라이드 복원 등)에서 문서가 바뀌면 초안을 따라잡는다.
  // 슬라이드만 편집한 커밋은 document 참조가 그대로라 이 JSON도 변하지 않는다.
  const documentJson = JSON.stringify(document);
  if (documentJson !== syncedJson) {
    setSyncedJson(documentJson);
    setDraft(document);
  }

  const completion = pitchDocumentCompletion(draft);
  const canApply = !disabled && pitchDocumentHasContent(draft);

  const patchCharacter = (id: string, patch: Partial<ProductionPitchCharacter>) => {
    setDraft((current) => ({
      ...current,
      characters: current.characters.map((character) =>
        character.id === id ? { ...character, ...patch } : character),
    }));
  };

  const addCharacter = () => {
    characterSequence.current += 1;
    setDraft((current) => ({
      ...current,
      characters: [
        ...current.characters,
        { id: createCharacterId(characterSequence.current), name: "", role: "", description: "" },
      ],
    }));
  };

  const removeCharacter = (id: string) => {
    setDraft((current) => ({
      ...current,
      characters: current.characters.filter((character) => character.id !== id),
    }));
  };

  const submit = (apply: boolean) => {
    const normalized = normalizedDocument(draft);
    if (!normalized) {
      onNotice("이름이 비어 있는 캐릭터 행이 있어 기획서를 저장하지 않았습니다.");
      return;
    }
    setDraft(normalized);
    if (apply) onApplyToSlides(normalized);
    else onSave(normalized);
  };

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm" data-studio-pitch-document>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-fg">
            <FileText className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
            기획서 작성
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">
            작품 소개에 필요한 로그라인·시놉시스·주요 캐릭터·연재 계획을 한곳에서 씁니다.
            다 쓴 뒤 “슬라이드로 반영”을 누르면 아래 PowerPoint 편집본에 기획서 슬라이드가 채워져 바로 PPTX로 저장할 수 있습니다.
          </p>
          <p className="mt-2 text-xs font-semibold text-fg-2" aria-live="polite">
            기획서 구성 {completion.totalCount}개 중 {completion.filledCount}개 작성됨
            {completion.missingSections.length > 0
              ? ` · 남은 항목: ${completion.missingSections.join(", ")}`
              : " · 모든 항목을 채웠습니다"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => submit(false)} disabled={disabled}>
            <Save className="size-4" aria-hidden="true" />
            기획서 저장
          </button>
          <button type="button" className={buttonClass({ size: "sm" })} onClick={() => submit(true)} disabled={!canApply}>
            <Presentation className="size-4" aria-hidden="true" />
            슬라이드로 반영
          </button>
        </div>
      </header>

      <div className="space-y-4">
        <label className={labelClass}>
          로그라인 (한 문장)
          <input
            value={draft.logline}
            maxLength={PITCH_LOGLINE_MAX_LENGTH}
            placeholder="예: 기억을 지우는 대가로 타인의 꿈에 들어가는 상담사의 이야기"
            className={`${inputClass} min-h-11 font-bold`}
            disabled={disabled}
            onChange={(event) => setDraft((current) => ({ ...current, logline: event.currentTarget.value }))}
          />
        </label>

        <label className={labelClass}>
          시놉시스
          <textarea
            value={draft.synopsis}
            maxLength={PITCH_SYNOPSIS_MAX_LENGTH}
            rows={5}
            placeholder="세계관, 주인공의 목표와 갈등, 이야기의 큰 흐름을 적어 주세요."
            className={`${inputClass} resize-y py-2 leading-relaxed`}
            disabled={disabled}
            onChange={(event) => setDraft((current) => ({ ...current, synopsis: event.currentTarget.value }))}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-fg-2">주요 캐릭터</legend>
          {draft.characters.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel p-3 text-xs leading-relaxed text-fg-2">
              아직 등록한 캐릭터가 없습니다. “캐릭터 추가”로 주인공부터 적어 보세요.
            </p>
          ) : null}
          {draft.characters.map((character, index) => (
            <article key={character.id} className="grid gap-2 rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg-3">캐릭터 {index + 1}</span>
                <button
                  type="button"
                  className={buttonClass({ variant: "quiet", size: "sm" })}
                  onClick={() => removeCharacter(character.id)}
                  disabled={disabled}
                  aria-label={`캐릭터 ${index + 1} 삭제`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  삭제
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className={labelClass}>
                  이름
                  <input
                    value={character.name}
                    maxLength={PITCH_CHARACTER_NAME_MAX_LENGTH}
                    className={`${inputClass} min-h-11`}
                    disabled={disabled}
                    onChange={(event) => patchCharacter(character.id, { name: event.currentTarget.value })}
                  />
                </label>
                <label className={labelClass}>
                  역할
                  <input
                    value={character.role}
                    maxLength={PITCH_CHARACTER_ROLE_MAX_LENGTH}
                    placeholder="예: 주인공, 라이벌, 조력자"
                    className={`${inputClass} min-h-11`}
                    disabled={disabled}
                    onChange={(event) => patchCharacter(character.id, { role: event.currentTarget.value })}
                  />
                </label>
              </div>
              <label className={labelClass}>
                설명
                <input
                  value={character.description}
                  maxLength={PITCH_CHARACTER_DESCRIPTION_MAX_LENGTH}
                  placeholder="욕망·결핍·관계 변화를 한 줄로"
                  className={`${inputClass} min-h-11`}
                  disabled={disabled}
                  onChange={(event) => patchCharacter(character.id, { description: event.currentTarget.value })}
                />
              </label>
            </article>
          ))}
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            onClick={addCharacter}
            disabled={disabled || draft.characters.length >= PITCH_MAX_CHARACTERS}
          >
            <Plus className="size-4" aria-hidden="true" />
            캐릭터 추가
          </button>
          {draft.characters.length >= PITCH_MAX_CHARACTERS ? (
            <p className="text-xs text-fg-2">기획서에는 주요 캐릭터를 최대 {PITCH_MAX_CHARACTERS}명까지 담습니다.</p>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-fg-2">연재 계획</legend>
          <div className="grid gap-2 md:grid-cols-2">
            <label className={labelClass}>
              연재 주기
              <input
                value={draft.serializationPlan.cadence}
                maxLength={PITCH_PLAN_CADENCE_MAX_LENGTH}
                placeholder="예: 주 1회, 매주 수요일"
                className={`${inputClass} min-h-11`}
                disabled={disabled}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  serializationPlan: { ...current.serializationPlan, cadence: event.currentTarget.value },
                }))}
              />
            </label>
            <label className={labelClass}>
              목표 회차
              <input
                value={draft.serializationPlan.episodeCount}
                maxLength={PITCH_PLAN_EPISODE_COUNT_MAX_LENGTH}
                placeholder="예: 시즌 1 총 24화"
                className={`${inputClass} min-h-11`}
                disabled={disabled}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  serializationPlan: { ...current.serializationPlan, episodeCount: event.currentTarget.value },
                }))}
              />
            </label>
          </div>
          <label className={labelClass}>
            시즌 구성
            <textarea
              value={draft.serializationPlan.outline}
              maxLength={PITCH_PLAN_OUTLINE_MAX_LENGTH}
              rows={3}
              placeholder="시즌별 큰 흐름, 중반 전환점, 시즌 피날레 방향을 적어 주세요."
              className={`${inputClass} resize-y py-2 leading-relaxed`}
              disabled={disabled}
              onChange={(event) => setDraft((current) => ({
                ...current,
                serializationPlan: { ...current.serializationPlan, outline: event.currentTarget.value },
              }))}
            />
          </label>
        </fieldset>
      </div>
    </section>
  );
}
