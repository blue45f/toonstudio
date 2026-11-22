/**
 * 서술형 캐릭터 시트 + 관계 보기.
 *
 * 원칙:
 * - 캐릭터 본체(연속성 레코드)는 읽기 전용으로만 보여준다. 이름·별칭·기본 의상은
 *   연속성 엔진의 정본이라 이 표면에서 고치지 않는다.
 * - 편집 대상은 시트(profile)와 관계(relation)뿐. 저장 콜백으로 올린다.
 * - 관계도는 1차에서 "관계 목록"으로 시작한다 (그래프 캔버스는 후속; 간선 데이터는
 *   studio-character-profile.ts 의 characterGraphEdges 가 이미 같은 모양을 낸다).
 * - 모델 시트 패널은 optional 장착이다: 호스트가 modelSheets 를 넘길 때만
 *   붙는다(안 넘기면 화면은 기존과 동일). 레코드의 정본은 바이블의 optional
 *   컬렉션(production-hub/model-sheet-storage.ts 저장 계약)이고, 동결·영향
 *   확인 결과는 콜백으로 올려 호스트가 withModelSheet 로 다시 저장한다.
 */
import { Suspense, lazy, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import type { StudioStoryBible } from "../studio-story-bible";
import { ModelSheetFreezePanel } from "../production-hub/ModelSheetFreezePanel";
import type {
  CharacterModelSheet,
  ModelSheetImpact,
} from "../production-hub/model-sheet-freeze-model";
import {
  characterSheetView,
  type StudioStoryBibleNarrative,
  type StudioStoryCharacterProfile,
  type StudioStoryCharacterRelation,
} from "./studio-character-profile";

export interface StudioCharacterSheetPanelProps {
  readonly bible: StudioStoryBible;
  readonly narrative: StudioStoryBibleNarrative;
  readonly onSaveProfile: (profile: StudioStoryCharacterProfile) => void;
  readonly onSaveRelation: (relation: StudioStoryCharacterRelation) => void;
  /**
   * 모델 시트 패널 장착 (optional). 보통 bible.modelSheets 를
   * modelSheetsFromBible 로 읽어 그대로 넘긴다. undefined 면 패널을
   * 붙이지 않는다 — 기존 화면과 렌더가 동일하다.
   */
  readonly modelSheets?: readonly CharacterModelSheet[];
  /** 캐릭터별 영향 분석. 없으면 패널이 변경 경고를 계산하지 않는다. */
  readonly modelSheetImpacts?: ReadonlyMap<string, ModelSheetImpact>;
  readonly onFreezeModelSheet?: (characterId: string) => void;
  readonly onAcknowledgeModelSheetImpact?: (characterId: string, episodeId: string) => void;
}

const LazyStudioContinuityBiblePanel = lazy(() =>
  import("../continuity-bible/StudioContinuityBiblePanel").then((m) => ({
    default: m.StudioContinuityBiblePanel,
  })),
);

const FIELD_INPUT_CLASS =
  "mt-1.5 min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FIELD_TEXTAREA_CLASS =
  "mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioCharacterSheetPanel({
  bible,
  narrative,
  onSaveProfile,
  onSaveRelation,
  modelSheets,
  modelSheetImpacts,
  onFreezeModelSheet,
  onAcknowledgeModelSheetImpact,
}: StudioCharacterSheetPanelProps) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(bible.characters[0]?.id ?? null);
  const [continuityBibleOpen, setContinuityBibleOpen] = useState(false);
  const sheet = selectedId ? characterSheetView(bible, narrative, selectedId) : null;
  const nameOf = (id: string) => bible.characters.find((c) => c.id === id)?.name ?? id;

  return (
    <section aria-label="캐릭터 시트" className="space-y-4 text-fg">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-4 sm:p-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-fg">캐릭터 시트</h1>
          <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            어떤 인물인지 적어 두면, 대사와 행동이 흔들리지 않아요.
          </p>
        </div>
        <button
          type="button"
          data-testid="character-sheet-continuity-bible-toggle"
          aria-expanded={continuityBibleOpen}
          onClick={() => setContinuityBibleOpen((prev) => !prev)}
          className="inline-flex min-h-11 items-center rounded-lg border border-accent/45 bg-accent-soft px-3.5 text-xs font-semibold text-accent transition-colors duration-150 hover:border-accent motion-reduce:transition-none [word-break:keep-all] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {continuityBibleOpen ? "연재 작화 바이블 접기" : "연재 작화 바이블 열기"}
        </button>
      </header>

      {continuityBibleOpen ? (
        <Suspense
          fallback={
            <p role="status" className="rounded-xl border border-line bg-panel p-4 text-xs text-fg-2">
              {t("studio.canvas.shell.loadingPanel", "패널을 여는 중...")}
            </p>
          }
        >
          <LazyStudioContinuityBiblePanel
            projectId={bible.projectId}
            characters={bible.characters}
            selectedCharacterId={selectedId}
          />
        </Suspense>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
        <ul
          aria-label="캐릭터 목록"
          className="space-y-1.5 rounded-xl border border-line bg-panel p-3"
        >
          {bible.characters.map((character) => {
            const isSelected = character.id === selectedId;
            return (
              <li key={character.id}>
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => setSelectedId(character.id)}
                  className={`flex min-h-11 w-full items-center rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isSelected
                      ? "border-accent/55 bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                      : "border-transparent bg-card text-fg-2 hover:border-line hover:bg-raised hover:text-fg"
                  }`}
                >
                  <span className="truncate">
                    {character.name}
                    {character.aliases.length > 0 ? ` (${character.aliases.join(", ")})` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {sheet && (
          <article
            aria-label={`${sheet.character.name} 시트`}
            className="space-y-5 rounded-xl border border-line bg-panel p-4 sm:p-5"
          >
            <header className="border-b border-line pb-3">
              <h2 className="text-base font-semibold text-fg">{sheet.character.name}</h2>
              {sheet.needsProfile && (
                <p className="mt-1 text-xs text-fg-3">
                  {r3c04StatusText("studio.r3c04Status.planning.sheetPanel.emptyProfile", "아직 시트가 비어 있어요. 성격 한 줄부터 시작해 보세요.")}
                </p>
              )}
            </header>

            <ProfileForm
              key={sheet.character.id}
              characterId={sheet.character.id}
              profile={sheet.profile}
              onSaveProfile={onSaveProfile}
            />

            <section aria-label="관계" className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-fg">관계</h3>
              <ul className="space-y-2">
                {sheet.outgoing.map((rel) => (
                  <li
                    key={rel.id}
                    className="rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg"
                  >
                    {nameOf(rel.toCharacterId)} — {rel.label || rel.kind}
                    {rel.note ? ` · ${rel.note}` : ""}
                  </li>
                ))}
                {sheet.incoming.map((rel) => (
                  <li
                    key={rel.id}
                    className="rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg"
                  >
                    {nameOf(rel.fromCharacterId)} — {rel.label || rel.kind}
                    {rel.note ? ` · ${rel.note}` : ""}
                  </li>
                ))}
                {sheet.outgoing.length === 0 && sheet.incoming.length === 0 && (
                  <li className="rounded-lg border border-dashed border-line bg-card/50 px-3 py-4 text-center text-xs text-fg-3">
                    {r3c04StatusText("studio.r3c04Status.planning.sheetPanel.emptyRelations", "아직 적힌 관계가 없어요.")}
                  </li>
                )}
              </ul>
              <RelationForm
                key={`rel-${sheet.character.id}`}
                fromCharacterId={sheet.character.id}
                characters={bible.characters}
                onSaveRelation={onSaveRelation}
              />
            </section>
          </article>
        )}
      </div>

      {modelSheets !== undefined && (
        <ModelSheetFreezePanel
          characters={bible.characters.map((character) => ({
            characterId: character.id,
            characterName: character.name,
          }))}
          sheets={modelSheets}
          impacts={modelSheetImpacts}
          onFreeze={onFreezeModelSheet}
          onAcknowledgeImpact={onAcknowledgeModelSheetImpact}
        />
      )}
    </section>
  );
}

function ProfileForm({
  characterId,
  profile,
  onSaveProfile,
}: {
  readonly characterId: string;
  readonly profile: StudioStoryCharacterProfile | null;
  readonly onSaveProfile: (profile: StudioStoryCharacterProfile) => void;
}) {
  const [personality, setPersonality] = useState(profile?.personality ?? "");
  const [speechStyle, setSpeechStyle] = useState(profile?.speechStyle ?? "");
  const [background, setBackground] = useState(profile?.background ?? "");
  const [motivation, setMotivation] = useState(profile?.motivation ?? "");
  const [signatureLines, setSignatureLines] = useState((profile?.signatureLines ?? []).join("\n"));
  const [appearanceNotes, setAppearanceNotes] = useState(profile?.appearanceNotes ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSaveProfile({
          characterId,
          personality,
          speechStyle,
          background,
          motivation,
          signatureLines: signatureLines.split("\n").map((line) => line.trim()).filter(Boolean),
          appearanceNotes,
        });
      }}
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-fg-2">
          성격
          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={2}
            placeholder="예: 겁이 많지만 책임감 하나로 버틴다"
            className={FIELD_TEXTAREA_CLASS}
          />
        </label>
        <label className="block text-xs font-semibold text-fg-2">
          말투
          <textarea
            value={speechStyle}
            onChange={(e) => setSpeechStyle(e.target.value)}
            rows={2}
            placeholder="예: 존댓말, 말이 짧고 끝에 '요'를 붙인다"
            className={FIELD_TEXTAREA_CLASS}
          />
        </label>
      </div>
      <label className="block text-xs font-semibold text-fg-2">
        배경 이야기
        <textarea
          value={background}
          onChange={(e) => setBackground(e.target.value)}
          rows={3}
          placeholder="과거, 상처, 비밀이 있으면"
          className={FIELD_TEXTAREA_CLASS}
        />
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-fg-2">
          바라는 것 (욕망·목표)
          <input
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder="예: 동생을 지키는 것"
            className={FIELD_INPUT_CLASS}
          />
        </label>
        <label className="block text-xs font-semibold text-fg-2">
          외형 메모
          <textarea
            value={appearanceNotes}
            onChange={(e) => setAppearanceNotes(e.target.value)}
            rows={2}
            placeholder="인상, 자주 입는 옷, 표정 버릇"
            className={FIELD_TEXTAREA_CLASS}
          />
        </label>
      </div>
      <label className="block text-xs font-semibold text-fg-2">
        대표 대사 (한 줄에 하나씩)
        <textarea
          value={signatureLines}
          onChange={(e) => setSignatureLines(e.target.value)}
          rows={2}
          className={FIELD_TEXTAREA_CLASS}
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        시트 저장
      </button>
    </form>
  );
}

function RelationForm({
  fromCharacterId,
  characters,
  onSaveRelation,
}: {
  readonly fromCharacterId: string;
  readonly characters: StudioStoryBible["characters"];
  readonly onSaveRelation: (relation: StudioStoryCharacterRelation) => void;
}) {
  const others = characters.filter((c) => c.id !== fromCharacterId);
  const [toId, setToId] = useState(others[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  if (others.length === 0) return null;

  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-card/55 p-3.5 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!toId) return;
        onSaveRelation({
          id: `relation:${fromCharacterId}:${toId}:${label.trim() || "other"}`,
          fromCharacterId,
          toCharacterId: toId,
          kind: "other",
          label: label.trim(),
          note: note.trim(),
        });
        setLabel("");
        setNote("");
      }}
    >
      <label className="block text-xs font-semibold text-fg-2">
        누구와
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className={FIELD_INPUT_CLASS}
        >
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-fg-2">
        어떤 사이
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="예: 형·동생, 짝사랑, 라이벌"
          className={FIELD_INPUT_CLASS}
        />
      </label>
      <label className="block text-xs font-semibold text-fg-2">
        메모
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="관계가 변하는 지점이 있으면"
          className={FIELD_INPUT_CLASS}
        />
      </label>
      <div className="sm:col-span-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-4 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          관계 적기
        </button>
      </div>
    </form>
  );
}
