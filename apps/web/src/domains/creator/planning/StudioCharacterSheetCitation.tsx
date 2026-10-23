/**
 * 캐릭터 시트 인용 표시 — 비트 작성(콘티)·대사 입력(식자) 표면 공용.
 *
 * 캐릭터를 고르거나(선택 prop) 비트에 등장하는 캐릭터가 정해지면, 그 캐릭터의
 * 시트 말투·대표 대사·외형 메모를 그 자리에서 인용해 보여준다. 읽기 전용 표시이며
 * 대사를 대신 써 주거나 고치지 않는다 — 작가가 말투를 눈으로 맞추는 기준점이다.
 *
 * characterIds 가 비어 있거나 전부 모르는 캐릭터면 아무것도 그리지 않는다.
 * 시트가 비어 있는 캐릭터만 있으면 "시트 쓰기" 유도 문구만 보여준다.
 */
import type { StudioStoryBible } from "../studio-story-bible";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import {
  characterSheetCitations,
  type StudioStoryBibleNarrative,
} from "./studio-character-profile";

export interface StudioCharacterSheetCitationProps {
  readonly bible: StudioStoryBible;
  readonly narrative: StudioStoryBibleNarrative;
  /** 인용할 캐릭터 id 목록 — 선택된 캐릭터 1개든, 비트 등장 캐릭터 여럿이든 같은 모양. */
  readonly characterIds: readonly string[];
}

export function StudioCharacterSheetCitation({
  bible,
  narrative,
  characterIds,
}: StudioCharacterSheetCitationProps) {
  const citations = characterSheetCitations(bible, narrative, characterIds);
  if (citations.length === 0) return null;
  const citable = citations.filter((citation) => citation.hasCitation);

  return (
    <section aria-label="캐릭터 시트 인용">
      <h3>캐릭터 시트에서 가져왔어요</h3>
      {citable.length === 0 ? (
        <p>{r3c04StatusText("studio.r3c04Status.planning.sheetCitation.empty", "아직 이 캐릭터의 시트가 비어 있어요. 캐릭터 시트에 말투와 대표 대사를 적어 두면 여기에 바로 보여요.")}</p>
      ) : (
        citable.map((citation) => (
          <article key={citation.characterId} aria-label={`${citation.characterName} 시트 인용`}>
            <h4>{citation.characterName}</h4>
            {citation.speechStyle && (
              <p>
                말투: {citation.speechStyle}
              </p>
            )}
            {citation.signatureLines.length > 0 && (
              <>
                <p>대표 대사</p>
                <ul>
                  {citation.signatureLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {citation.appearanceNotes && (
              <p>
                외형 메모: {citation.appearanceNotes}
              </p>
            )}
          </article>
        ))
      )}
    </section>
  );
}
