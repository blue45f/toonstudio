/**
 * 서술형 캐릭터 시트 + 관계 보기.
 *
 * 원칙:
 * - 캐릭터 본체(연속성 레코드)는 읽기 전용으로만 보여준다. 이름·별칭·기본 의상은
 *   연속성 엔진의 정본이라 이 표면에서 고치지 않는다.
 * - 편집 대상은 시트(profile)와 관계(relation)뿐. 저장 콜백으로 올린다.
 * - 관계도는 1차에서 "관계 목록"으로 시작한다 (그래프 캔버스는 후속; 간선 데이터는
 *   studio-character-profile.ts 의 characterGraphEdges 가 이미 같은 모양을 낸다).
 */
import { useState } from "react";
import type { StudioStoryBible } from "../studio-story-bible";
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
}

export function StudioCharacterSheetPanel({
  bible,
  narrative,
  onSaveProfile,
  onSaveRelation,
}: StudioCharacterSheetPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(bible.characters[0]?.id ?? null);
  const sheet = selectedId ? characterSheetView(bible, narrative, selectedId) : null;
  const nameOf = (id: string) => bible.characters.find((c) => c.id === id)?.name ?? id;

  return (
    <section aria-label="캐릭터 시트">
      <header>
        <h1>캐릭터 시트</h1>
        <p>어떤 인물인지 적어 두면, 대사와 행동이 흔들리지 않아요.</p>
      </header>
      <ul aria-label="캐릭터 목록">
        {bible.characters.map((character) => (
          <li key={character.id}>
            <button type="button" onClick={() => setSelectedId(character.id)}>
              {character.name}
              {character.aliases.length > 0 ? ` (${character.aliases.join(", ")})` : ""}
            </button>
          </li>
        ))}
      </ul>

      {sheet && (
        <article aria-label={`${sheet.character.name} 시트`}>
          <h2>{sheet.character.name}</h2>
          {sheet.needsProfile && <p>아직 시트가 비어 있어요. 성격 한 줄부터 시작해 보세요.</p>}
          <ProfileForm
            key={sheet.character.id}
            characterId={sheet.character.id}
            profile={sheet.profile}
            onSaveProfile={onSaveProfile}
          />
          <section aria-label="관계">
            <h3>관계</h3>
            <ul>
              {sheet.outgoing.map((rel) => (
                <li key={rel.id}>
                  {nameOf(rel.toCharacterId)} — {rel.label || rel.kind}
                  {rel.note ? ` · ${rel.note}` : ""}
                </li>
              ))}
              {sheet.incoming.map((rel) => (
                <li key={rel.id}>
                  {nameOf(rel.fromCharacterId)} — {rel.label || rel.kind}
                  {rel.note ? ` · ${rel.note}` : ""}
                </li>
              ))}
              {sheet.outgoing.length === 0 && sheet.incoming.length === 0 && (
                <li>아직 적힌 관계가 없어요.</li>
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
      <label>
        성격
        <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={2} placeholder="예: 겁이 많지만 책임감 하나로 버틴다" />
      </label>
      <label>
        말투
        <textarea value={speechStyle} onChange={(e) => setSpeechStyle(e.target.value)} rows={2} placeholder="예: 존댓말, 말이 짧고 끝에 '요'를 붙인다" />
      </label>
      <label>
        배경 이야기
        <textarea value={background} onChange={(e) => setBackground(e.target.value)} rows={3} placeholder="과거, 상처, 비밀이 있으면" />
      </label>
      <label>
        바라는 것 (욕망·목표)
        <input value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="예: 동생을 지키는 것" />
      </label>
      <label>
        대표 대사 (한 줄에 하나씩)
        <textarea value={signatureLines} onChange={(e) => setSignatureLines(e.target.value)} rows={2} />
      </label>
      <label>
        외형 메모
        <textarea value={appearanceNotes} onChange={(e) => setAppearanceNotes(e.target.value)} rows={2} placeholder="인상, 자주 입는 옷, 표정 버릇" />
      </label>
      <button type="submit">시트 저장</button>
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
      <label>
        누구와
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        어떤 사이
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 형·동생, 짝사랑, 라이벌" />
      </label>
      <label>
        메모
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="관계가 변하는 지점이 있으면" />
      </label>
      <button type="submit">관계 적기</button>
    </form>
  );
}
