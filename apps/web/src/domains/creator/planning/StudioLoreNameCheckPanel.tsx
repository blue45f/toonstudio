/**
 * 설정 이름 일관성 검사 패널 — 세계관 허브 하단에 장착되는 표시 표면.
 *
 * 흐름: 회차 줄거리·대사를 붙여 넣거나(또는 preset 으로 불러와) 검사하면,
 * 표기 흔들림·정본/별칭 혼용·미등록 고유명사 후보를 목록으로 보여준다.
 * 대사 preset(dialoguePreset)으로 불러온 글은 결과마다 원본 컷 위치
 * (페이지·대사 순번·화자)가 함께 표시되고, onLocateDialogueItem이 있으면
 * "컷 위치 보기"로 원본 말풍선까지 되돌아갈 수 있다.
 * - 흔들림: "정본으로 바꾸기"를 누르면 이 패널의 글에만 적용한다(원본 데이터는
 *   건드리지 않는다 — 맞춤법 검사가 자동 수정을 하지 않는 것과 같은 원칙).
 * - 미등록 후보: "설정으로 등록"으로 세계관 항목을 바로 만들 수 있다.
 *   흔들림 표기는 "별칭으로 등록"해 허용 표기로 흡수할 수도 있다.
 *   등록 콜백이 없는 표면(읽기 전용)에서는 버튼 자체를 숨긴다.
 * 사전이 비어 있으면 검사가 아니라 "먼저 설정·캐릭터가 필요하다"를 안내한다.
 */
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import {
  STUDIO_LORE_ENTRY_KINDS,
  STUDIO_LORE_KIND_LABELS,
  type StudioLoreEntryKind,
} from "./studio-world-lore";
import {
  checkLoreNames,
  summarizeLoreNameCheck,
  type LoreNameDictionary,
  type LoreNameFinding,
} from "./studio-lore-name-check";
import {
  dialogueLineLocationLabel,
  locateDialogueFinding,
  retargetDialogueNameCheckPreset,
  type DialogueNameCheckPreset,
} from "./studio-lore-name-check-dialogue";

export interface LoreNameCheckPreset {
  readonly label: string;
  readonly text: string;
}

export interface StudioLoreNameCheckPanelProps {
  readonly dictionary: LoreNameDictionary;
  /** "회차 줄거리 전체"처럼 한 번에 불러올 수 있는 글 묶음. */
  readonly presets?: readonly LoreNameCheckPreset[];
  /**
   * 대사 일괄 수집(studio-dialogue-batch) 출력으로 만든 회차 대사 preset.
   * 있으면 붙여넣기 없이 버튼 한 번으로 회차 대사 전체를 검사할 수 있고,
   * 결과마다 원본 컷 위치(페이지·대사 순번·화자)가 함께 표시된다.
   * 없으면 기존 붙여넣기 동선만 동작한다(기존 표면 무변경).
   */
  readonly dialoguePreset?: DialogueNameCheckPreset | null;
  /** 결과의 "컷 위치 보기" — 호스트가 해당 말풍선을 선택·이동한다. */
  readonly onLocateDialogueItem?: (itemId: string, pageId: string) => void;
  /** 흔들림 표기를 그 항목의 별칭으로 등록 (lore 항목만; 없으면 버튼 숨김). */
  readonly onRegisterAlias?: (sourceId: string, alias: string) => void;
  /** 미등록 후보를 새 설정 항목으로 등록 (없으면 버튼 숨김). */
  readonly onRegisterNewEntry?: (name: string, kind: StudioLoreEntryKind) => void;
}

const CODE_LABELS: Readonly<Record<LoreNameFinding["code"], string>> = {
  "name-variant": "표기 흔들림",
  "name-alias-mix": "정본·별칭 혼용",
  "unregistered-name": "미등록 이름 후보",
};

export function StudioLoreNameCheckPanel({
  dictionary,
  presets = [],
  dialoguePreset = null,
  onLocateDialogueItem,
  onRegisterAlias,
  onRegisterNewEntry,
}: StudioLoreNameCheckPanelProps) {
  const [text, setText] = useState("");
  const [findings, setFindings] = useState<readonly LoreNameFinding[] | null>(null);
  const [newEntryKind, setNewEntryKind] = useState<StudioLoreEntryKind>("place");
  // 대사 preset으로 불러온 글이면 줄 맵(컷 위치·화자)을 함께 들고 있는다.
  // 글을 직접 고치면 오프셋이 어긋나므로 그 순간 일반 글로 내려간다.
  const [activeDialoguePreset, setActiveDialoguePreset] =
    useState<DialogueNameCheckPreset | null>(null);

  const summary = useMemo(
    () => (findings ? summarizeLoreNameCheck(findings) : null),
    [findings],
  );

  // 사전이 바뀌면(등록 직후 등) 이미 검사한 글을 다시 검사해 결과를 최신으로 유지한다.
  // findings·text는 Effect Event 가 읽는다 — 글을 고칠 때마다 다시 검사하지 않고 사전 변경에만 반응한다.
  const recheckForDictionary = useEffectEvent((nextDictionary: LoreNameDictionary) => {
    if (findings !== null && text.trim()) {
      setFindings(checkLoreNames(text, nextDictionary));
    }
  });
  useEffect(() => {
    recheckForDictionary(dictionary);
  }, [dictionary]);

  const runCheck = () => setFindings(checkLoreNames(text, dictionary));

  const loadDialoguePreset = () => {
    if (!dialoguePreset) return;
    setText(dialoguePreset.text);
    setActiveDialoguePreset(dialoguePreset);
    setFindings(null);
  };

  const applySuggestion = (finding: LoreNameFinding) => {
    if (!finding.suggestion) return;
    const next = text.slice(0, finding.start) + finding.suggestion + text.slice(finding.end);
    setText(next);
    // 표기 교체로 길이가 바뀌어도 줄 수가 같으면 컷 역참조를 유지한다.
    // 줄 구조가 깨지면 맵을 버리고 일반 글로 정직하게 내려간다.
    setActiveDialoguePreset((current) =>
      current ? retargetDialogueNameCheckPreset(current, next) : null,
    );
    setFindings(checkLoreNames(next, dictionary));
  };

  if (dictionary.length === 0) {
    return (
      <section aria-label="설정 이름 일관성 검사">
        <h2>설정 이름 일관성 검사</h2>
        <p>{r3c04StatusText("studio.r3c04Status.planning.loreName.emptyDictionary", "아직 검사할 이름 사전이 비어 있어요. 위에서 세계관 설정을 적거나 캐릭터가 생기면, 그 이름들이 사전이 되어 줄거리·대사의 표기 흔들림을 검사할 수 있어요.")}</p>
      </section>
    );
  }

  return (
    <section aria-label="설정 이름 일관성 검사">
      <h2>설정 이름 일관성 검사</h2>
      <p>
        사전에 등록된 이름 {dictionary.length}개와 대조해요. 회차 줄거리나 대사를
        붙여 넣고 검사하면, 표기가 흔들린 곳과 아직 사전에 없는 이름을 알려줘요.
      </p>
      {(presets.length > 0 || dialoguePreset) && (
        <div role="group" aria-label="글 불러오기">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setText(preset.text);
                setActiveDialoguePreset(null);
                setFindings(null);
              }}
            >
              {preset.label} 불러오기
            </button>
          ))}
          {dialoguePreset && (
            <button
              type="button"
              onClick={loadDialoguePreset}
              disabled={dialoguePreset.itemCount === 0}
            >
              {dialoguePreset.label} 불러오기 (대사 {dialoguePreset.itemCount}개 ·{" "}
              {dialoguePreset.pageCount}페이지)
            </button>
          )}
        </div>
      )}
      {activeDialoguePreset && (
        <div aria-label="회차 대사 목록">
          <p>
            회차 대사 {activeDialoguePreset.itemCount}개를 불러왔어요. 화자가 정해진
            대사는 {activeDialoguePreset.attributedCount}개예요.
            {activeDialoguePreset.skippedHiddenCount > 0 &&
              ` 숨긴 대사 ${activeDialoguePreset.skippedHiddenCount}개는 뺐어요.`}
          </p>
          <ul>
            {activeDialoguePreset.lines.map((line) => (
              <li key={line.itemId}>
                {dialogueLineLocationLabel(line)}: {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label>
        검사할 글{" "}
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            // 직접 고치면 줄 오프셋 맵과 어긋나므로 컷 역참조를 내려놓는다.
            if (activeDialoguePreset && event.target.value !== activeDialoguePreset.text) {
              setActiveDialoguePreset(null);
            }
          }}
          rows={6}
          placeholder="여기에 회차 줄거리나 대사를 붙여 넣으세요"
        />
      </label>
      <button type="button" onClick={runCheck} disabled={!text.trim()}>
        검사하기
      </button>

      {findings !== null && summary && (
        <div>
          {findings.length === 0 ? (
            <p>{r3c04StatusText("studio.r3c04Status.planning.loreName.noFindings", "발견된 흔들림이 없어요. 이름 표기가 사전과 잘 맞고 있어요.")}</p>
          ) : (
            <>
              <p>
                모두 {summary.findingCount}건 — 표기 흔들림 {summary.variantCount}건 ·
                정본·별칭 혼용 {summary.aliasMixCount}건 · 미등록 이름 후보{" "}
                {summary.unregisteredCount}건
              </p>
              <ul>
                {findings.map((finding) => {
                  const location = activeDialoguePreset
                    ? locateDialogueFinding(activeDialoguePreset, finding)
                    : null;
                  return (
                  <li key={finding.id}>
                    <article aria-label={finding.found}>
                      <p>
                        <strong>{CODE_LABELS[finding.code]}</strong> · {finding.message}
                      </p>
                      {location && (
                        <p>
                          위치: {location.label}{" "}
                          {onLocateDialogueItem && (
                            <button
                              type="button"
                              onClick={() =>
                                onLocateDialogueItem(location.line.itemId, location.line.pageId)
                              }
                            >
                              컷 위치 보기
                            </button>
                          )}
                        </p>
                      )}
                      {finding.suggestion && (
                        <button type="button" onClick={() => applySuggestion(finding)}>
                          이 글에서 "{finding.suggestion}"(으)로 바꾸기
                        </button>
                      )}{" "}
                      {finding.code === "name-variant"
                        && finding.sourceId
                        && onRegisterAlias
                        && dictionary.find((entry) => entry.sourceId === finding.sourceId)
                          ?.sourceKind === "lore" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (finding.sourceId) onRegisterAlias(finding.sourceId, finding.found);
                            }}
                          >
                            이 표기를 별칭으로 등록하기
                          </button>
                        )}
                      {finding.code === "unregistered-name" && onRegisterNewEntry && (
                        <>
                          <label>
                            종류{" "}
                            <select
                              value={newEntryKind}
                              onChange={(event) =>
                                setNewEntryKind(event.target.value as StudioLoreEntryKind)
                              }
                            >
                              {STUDIO_LORE_ENTRY_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {STUDIO_LORE_KIND_LABELS[kind].ko}
                                </option>
                              ))}
                            </select>
                          </label>{" "}
                          <button
                            type="button"
                            onClick={() => onRegisterNewEntry(finding.found, newEntryKind)}
                          >
                            "{finding.found}" 설정으로 등록하기
                          </button>
                        </>
                      )}
                    </article>
                  </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
