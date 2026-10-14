/**
 * 작업 화면 설정 참조 패널 — 에디터·콘티 작업 중 현재 장면과 이어진 설정을
 * 캔버스 곁에 띄우는 읽기 전용 참조 표면.
 *
 * 원칙:
 * - 도출은 전부 studio-scene-setting-reference 모델이 한다. 이 표면은
 *   표시와 접기 상태만 들고, 설정을 여기서 고치지 않는다(수정은 설정 허브).
 * - 레이아웃 충돌 방지: 캔버스를 덮지 않는다. position 고정·오버레이를 쓰지
 *   않고 flex 행의 형제로 들어가 자리를 차지하므로, 패널이 열리면 캔버스가
 *   좁아질 뿐 가려지지 않는다. 접으면 얇은 띠(2.5rem)만 남는다.
 * - 빈 상태는 세 경우를 구분한다: 장면 미선택 / 설정 자체가 없음(허브 유도) /
 *   장면은 골랐지만 이어진 설정이 없음(메타 지정 유도). 전부 다음 행동을 말한다.
 * - 끊긴 참조(삭제된 캐릭터·장소 id)는 숨기지 않고 한 줄로 알린다.
 */
import { useState } from "react";

import { STUDIO_LORE_KIND_LABELS } from "./studio-world-lore";
import {
  SCENE_SETTING_REFERENCE_REASON_LABELS,
  type SceneSettingReference,
} from "./studio-scene-setting-reference";

export interface StudioSceneSettingReferencePanelProps {
  /** 현재 장면의 도출 결과. 장면을 고르지 않았으면 null. */
  readonly reference: SceneSettingReference | null;
  /** 작품에 설정 항목이 하나라도 있는지 — 빈 상태 문구 분기용. */
  readonly hasAnyLoreEntries: boolean;
  /** 설정 허브로 가는 링크. 없으면 유도 버튼을 렌더하지 않는다. */
  readonly loreHubHref?: string;
  /** 항목을 눌렀을 때 (허브에서 열기 등). 없으면 버튼이 아닌 텍스트로 보인다. */
  readonly onOpenEntry?: (entryId: string) => void;
  readonly defaultCollapsed?: boolean;
}

export function StudioSceneSettingReferencePanel({
  reference,
  hasAnyLoreEntries,
  loreHubHref,
  onOpenEntry,
  defaultCollapsed = false,
}: StudioSceneSettingReferencePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (collapsed) {
    return (
      <aside
        aria-label="장면 설정 참조"
        style={{ flexShrink: 0, width: "2.5rem", overflowY: "auto" }}
      >
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setCollapsed(false)}
          title="이 장면의 설정 열기"
        >
          설정
        </button>
      </aside>
    );
  }

  const directEntries = reference?.entries.filter((item) => item.direct) ?? [];
  const relatedEntries = reference?.entries.filter((item) => !item.direct) ?? [];

  const entryCard = (item: SceneSettingReference["entries"][number]) => (
    <li key={item.entry.id}>
      <article aria-label={item.entry.name}>
        <h4>
          {onOpenEntry ? (
            <button type="button" onClick={() => onOpenEntry(item.entry.id)}>
              {item.entry.name}
            </button>
          ) : (
            item.entry.name
          )}
          {item.entry.origin === "example" ? " (예시)" : ""}
        </h4>
        <p>
          {STUDIO_LORE_KIND_LABELS[item.entry.kind].ko} ·{" "}
          {item.reasons
            .map((reason) => SCENE_SETTING_REFERENCE_REASON_LABELS[reason].ko)
            .join(" · ")}
        </p>
        {item.entry.aliases.length > 0 && <p>다른 표기: {item.entry.aliases.join(", ")}</p>}
        {item.entry.kind === "event" && item.entry.eraLabel && (
          <p>시기: {item.entry.eraLabel}</p>
        )}
        {item.entry.summary && <p>{item.entry.summary}</p>}
        {item.entry.details && <p>{item.entry.details}</p>}
      </article>
    </li>
  );

  return (
    <aside
      aria-label="장면 설정 참조"
      style={{ flexShrink: 0, width: "19rem", maxWidth: "40vw", overflowY: "auto" }}
    >
      <header>
        <h3>이 장면의 설정</h3>
        <button
          type="button"
          aria-expanded={true}
          onClick={() => setCollapsed(true)}
          title="설정 참조 접기"
        >
          접기
        </button>
        <p>지금 장면의 장소·등장 캐릭터와 이어진 설정만 모았어요. 고치려면 설정 허브에서.</p>
      </header>

      {reference === null ? (
        <p>장면이나 컷을 고르면, 그 장면과 이어진 설정이 여기에 나타나요.</p>
      ) : reference.isEmpty ? (
        <div>
          {hasAnyLoreEntries ? (
            <p>
              이 장면과 이어진 설정이 아직 없어요. 장면에 장소와 등장 캐릭터를 지정하면
              연결된 설정이 자동으로 모입니다.
            </p>
          ) : (
            <>
              <p>
                아직 적어 둔 설정이 없어요. 세계관 설정을 먼저 세워 두면, 작업 화면에서
                장면마다 이어진 설정이 자동으로 곁에 나타납니다.
              </p>
              {loreHubHref && (
                <p>
                  <a href={loreHubHref}>설정 허브에서 첫 설정 만들기</a>
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          {(reference.location !== null || reference.unknownLocationId !== null) && (
            <section aria-label="장면 장소">
              <h4>장소</h4>
              {reference.location !== null ? (
                <p>
                  {reference.location.name}
                  {reference.locationEntry === null
                    ? " — 이 장소의 상세 설정은 아직 없어요."
                    : ""}
                </p>
              ) : (
                <p>장소 참조가 끊겼어요 (삭제된 장소). 장면 메타를 확인해 주세요.</p>
              )}
            </section>
          )}

          {reference.characters.length > 0 && (
            <section aria-label="등장 캐릭터">
              <h4>등장 캐릭터</h4>
              <ul>
                {reference.characters.map(({ character, linkedEntryCount }) => (
                  <li key={character.id}>
                    {character.name}
                    {character.aliases.length > 0
                      ? ` (${character.aliases.join(", ")})`
                      : ""}
                    {linkedEntryCount > 0 ? ` · 연결된 설정 ${linkedEntryCount}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {reference.unknownCharacterIds.length > 0 && (
            <p>
              등장 캐릭터 참조 {reference.unknownCharacterIds.length}개가 끊겼어요
              (삭제된 캐릭터). 장면 메타를 확인해 주세요.
            </p>
          )}

          {directEntries.length > 0 && (
            <section aria-label="직접 연결된 설정">
              <h4>이어진 설정 {directEntries.length}</h4>
              <ul>{directEntries.map(entryCard)}</ul>
            </section>
          )}

          {relatedEntries.length > 0 && (
            <section aria-label="함께 보면 좋은 설정">
              <h4>함께 보면 좋은 설정 {relatedEntries.length}</h4>
              <ul>{relatedEntries.map(entryCard)}</ul>
            </section>
          )}

          {reference.truncatedEntryCount > 0 && (
            <p>
              관련 설정 {reference.truncatedEntryCount}개는 자리 관계로 접었어요. 전체는
              설정 허브에서 볼 수 있어요.
            </p>
          )}

          {reference.facts.length > 0 && (
            <section aria-label="확인할 사실">
              <h4>확인할 사실</h4>
              <ul>
                {reference.facts.map((fact) => (
                  <li key={fact.id}>{fact.label}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
