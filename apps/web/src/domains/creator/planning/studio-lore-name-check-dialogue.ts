/**
 * 이름 일관성 검사 × 대사 일괄 수집 연결 — 회차 대사를 붙여넣기 없이 검사로.
 *
 * 문제: 이름 검사(StudioLoreNameCheckPanel)는 평문 preset({label, text})만 받아서,
 * 회차 대사를 검사하려면 작가가 캔버스 대사를 일일이 복사해 붙여 넣어야 했다.
 * 붙여넣는 순간 ①어느 페이지·어느 말풍선에서 온 대사인지(컷 위치) ②누구의 대사인지
 * (화자)가 사라져, 검사 결과를 봐도 원본 컷으로 되돌아갈 수 없었다.
 *
 * 이 모듈은 대사 일괄 수집(studio-dialogue-batch)의 DialogueBatchItem[]을
 * 이름 검사가 그대로 먹을 수 있는 preset으로 바꾸되, 줄마다 원본 역참조
 * (itemId·pageId·페이지·페이지 안 대사 순번)와 화자 귀속을 함께 실어 둔다.
 * 검사 finding은 평문 오프셋(start·end)을 가지므로, preset의 줄 오프셋 맵으로
 * finding → 원본 대사 항목 → 컷 위치를 역으로 찾을 수 있다.
 *
 * 화자 귀속의 정직성 (말투 지문 레인과 같은 규율):
 * - DialogueBatchItem 자체에는 화자 필드가 없다. 그래서 귀속은 호출부가 주는
 *   명시 맵(attributionByItemId: 항목 id → 캐릭터 id)으로만 받는다.
 * - 맵에 없는 대사는 speakerId=null 로 두고 귀속률 분모에 그대로 드러낸다.
 *   화자를 지어내지 않는다 — "화자 미지정"으로 표시되는 것이 정직한 동작이다.
 *
 * 컷 위치의 정직성:
 * - batch 항목은 컷(frame) 순위를 노출하지 않는다(수집 내부 정렬에만 쓰인다).
 *   그래서 역참조는 "페이지 + 페이지 안 대사 순번 + 요소 id"로 제공한다.
 *   요소 id·pageId가 있으면 호스트가 기존 선택 동선(onSelectElement(pageId, elId)
 *   패턴)으로 정확한 말풍선까지 이동할 수 있다.
 */
import type { DialogueBatchItem } from "../lettering/studio-dialogue-batch";
import type { LoreNameFinding } from "./studio-lore-name-check";

/** preset의 한 줄 — 원본 대사 항목 1개와 1:1. */
export interface DialogueNameCheckLine {
  /** 원본 DialogueBatchItem.id — 컷 역참조의 핵심 키. */
  readonly itemId: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번 (표시는 +1). */
  readonly pageIndex: number;
  /** preset 안 전역 줄 순번 (0 기준). */
  readonly lineIndex: number;
  /** 같은 페이지 안에서의 대사 순번 (0 기준, 표시는 +1) — 컷 위치 설명용. */
  readonly lineIndexInPage: number;
  /** 귀속 맵이 준 캐릭터 id. 없으면 null (지어내지 않는다). */
  readonly speakerId: string | null;
  /** characters에서 id로 찾은 화자 이름. 귀속은 됐지만 이름을 못 찾으면 null. */
  readonly speakerName: string | null;
  readonly text: string;
  /** preset.text 안에서의 시작 오프셋 (포함). */
  readonly start: number;
  /** preset.text 안에서의 끝 오프셋 (미포함). text.slice(start, end) === text. */
  readonly end: number;
}

export interface DialogueNameCheckPreset {
  readonly label: string;
  /** 이름 검사에 그대로 넣는 평문 — 줄을 "\n"으로 이은 것. */
  readonly text: string;
  readonly lines: readonly DialogueNameCheckLine[];
  /** 검사에 들어간 대사 수 (lines.length와 같다). */
  readonly itemCount: number;
  /** 대사가 있는 페이지 수. */
  readonly pageCount: number;
  /** 화자가 귀속된 줄 수. */
  readonly attributedCount: number;
  /** attributedCount / itemCount. 대사가 없으면 0. */
  readonly attributionRate: number;
  /** 숨김이라 기본 제외된 대사 수 (포함 옵션으로 넣을 수 있다). */
  readonly skippedHiddenCount: number;
  /** 빈 대사라 제외된 수. */
  readonly skippedEmptyCount: number;
}

export interface BuildDialogueNameCheckPresetOptions {
  /** preset 버튼 라벨. 기본 "회차 대사 전체". */
  readonly label?: string;
  /** 항목 id → 캐릭터 id 명시 귀속 맵. Map·Record 모두 받는다. */
  readonly attributionByItemId?:
    | ReadonlyMap<string, string>
    | Readonly<Record<string, string>>;
  /** 화자 이름표 정본 — 바이블 캐릭터의 {id, name} 최소 형태. */
  readonly characters?: readonly { readonly id: string; readonly name: string }[];
  /** 숨긴 대사도 검사에 포함 (기본 false — 맞춤법·말투 검수와 같은 규율). */
  readonly includeHidden?: boolean;
}

function attributionFor(
  attribution: BuildDialogueNameCheckPresetOptions["attributionByItemId"],
  itemId: string,
): string | null {
  if (!attribution) return null;
  // ReadonlyMap 인터페이스는 instanceof 좁히기가 인덱싱에 닿지 않아 분기를 명시한다.
  const value =
    attribution instanceof Map
      ? attribution.get(itemId)
      : (attribution as Readonly<Record<string, string>>)[itemId];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * 대사 일괄 수집 출력을 이름 검사 preset으로 만든다.
 * 입력 순서를 그대로 존중한다 — collectDialogueItems가 이미 읽기 순서로
 * 정렬해 두므로 여기서 다시 정렬하지 않는다(순서가 곧 컷 순서다).
 */
export function buildDialogueNameCheckPreset(
  items: readonly DialogueBatchItem[],
  options: BuildDialogueNameCheckPresetOptions = {},
): DialogueNameCheckPreset {
  const includeHidden = options.includeHidden ?? false;
  const nameByCharacterId = new Map(
    (options.characters ?? []).map((character) => [character.id, character.name]),
  );

  const lines: DialogueNameCheckLine[] = [];
  const perPageCount = new Map<string, number>();
  let skippedHiddenCount = 0;
  let skippedEmptyCount = 0;
  let offset = 0;

  for (const item of items) {
    if (item.hidden && !includeHidden) {
      skippedHiddenCount += 1;
      continue;
    }
    if (!item.text.trim()) {
      skippedEmptyCount += 1;
      continue;
    }
    const speakerId = attributionFor(options.attributionByItemId, item.id);
    const lineIndexInPage = perPageCount.get(item.pageId) ?? 0;
    perPageCount.set(item.pageId, lineIndexInPage + 1);
    const start = offset;
    const end = start + item.text.length;
    lines.push({
      itemId: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      lineIndex: lines.length,
      lineIndexInPage,
      speakerId,
      speakerName: speakerId ? (nameByCharacterId.get(speakerId) ?? null) : null,
      text: item.text,
      start,
      end,
    });
    offset = end + 1; // "\n" 구분자 1자
  }

  const attributedCount = lines.filter((line) => line.speakerId !== null).length;
  return Object.freeze({
    label: options.label ?? "회차 대사 전체",
    text: lines.map((line) => line.text).join("\n"),
    lines: Object.freeze(lines),
    itemCount: lines.length,
    pageCount: new Set(lines.map((line) => line.pageId)).size,
    attributedCount,
    attributionRate: lines.length > 0 ? attributedCount / lines.length : 0,
    skippedHiddenCount,
    skippedEmptyCount,
  });
}

/** 화자 표시 라벨 — 귀속이 없으면 "화자 미지정", 이름표가 없으면 "이름 미상 화자". */
export function dialogueLineSpeakerLabel(line: DialogueNameCheckLine): string {
  if (line.speakerId === null) return "화자 미지정";
  return line.speakerName ?? "이름 미상 화자";
}

/** 컷 위치 라벨 — "2페이지 · 3번째 대사 · 화자 민준" 형태. */
export function dialogueLineLocationLabel(line: DialogueNameCheckLine): string {
  return `${line.pageIndex + 1}페이지 · ${line.lineIndexInPage + 1}번째 대사 · ${dialogueLineSpeakerLabel(line)}`;
}

export interface DialogueFindingLocation {
  readonly line: DialogueNameCheckLine;
  /** finding 시작점의 줄 안 상대 오프셋. */
  readonly localStart: number;
  /** finding 끝점의 줄 안 상대 오프셋 (줄 길이를 넘으면 줄 길이로 자른다). */
  readonly localEnd: number;
  readonly label: string;
}

/**
 * 평문 finding의 오프셋을 preset 줄 맵으로 역참조한다.
 * finding 시작점이 속한 줄을 위치로 삼는다(흔들림 finding은 토큰 단위라 한 줄 안).
 * 어떤 줄에도 속하지 않으면(구분자 위치 등) null — 위치를 지어내지 않는다.
 */
export function locateDialogueFinding(
  preset: DialogueNameCheckPreset,
  finding: Pick<LoreNameFinding, "start" | "end">,
): DialogueFindingLocation | null {
  const line = preset.lines.find(
    (candidate) => finding.start >= candidate.start && finding.start < candidate.end,
  );
  if (!line) return null;
  return Object.freeze({
    line,
    localStart: finding.start - line.start,
    localEnd: Math.min(finding.end, line.end) - line.start,
    label: dialogueLineLocationLabel(line),
  });
}

export interface LocatedDialogueFinding {
  readonly finding: LoreNameFinding;
  readonly location: DialogueFindingLocation | null;
}

/** 검사 결과 전체에 컷 위치를 붙인다 — 결과 목록 표시가 그대로 쓴다. */
export function attachDialogueLocations(
  preset: DialogueNameCheckPreset,
  findings: readonly LoreNameFinding[],
): readonly LocatedDialogueFinding[] {
  return Object.freeze(
    findings.map((finding) =>
      Object.freeze({ finding, location: locateDialogueFinding(preset, finding) }),
    ),
  );
}

/**
 * 패널 안에서 "정본으로 바꾸기"처럼 글 길이가 바뀌는 편집이 일어난 뒤,
 * 새 평문을 preset 줄 구조에 다시 맞춘다.
 * 줄 수가 그대로면(일반적인 표기 교체) 항목·페이지·화자 귀속을 유지한 채
 * 오프셋만 다시 계산한다. 줄 수가 달라지면 매핑을 신뢰할 수 없어 null —
 * 호출부는 대사 preset 모드를 해제하고 일반 붙여넣기 검사로 정직하게 돌아간다.
 */
export function retargetDialogueNameCheckPreset(
  preset: DialogueNameCheckPreset,
  nextText: string,
): DialogueNameCheckPreset | null {
  if (preset.lines.length === 0) return null;
  const chunks = nextText.split("\n");
  if (chunks.length !== preset.lines.length) return null;
  let offset = 0;
  const lines = preset.lines.map((line, index) => {
    const text = chunks[index] ?? "";
    const start = offset;
    const end = start + text.length;
    offset = end + 1;
    return Object.freeze({ ...line, text, start, end });
  });
  return Object.freeze({ ...preset, text: nextText, lines: Object.freeze(lines) });
}
