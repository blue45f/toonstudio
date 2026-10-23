/**
 * 구도 제안(콘티→연출 조언) 응답 정규화 — 순수·결정적. fetch 없음.
 *
 * 시스템 프롬프트는 "한국어 불릿 3~5개" 텍스트를 요구하지만, 일부 모델은 지시를 어기고 JSON
 * 객체/배열을 그대로 반환한다. 그대로 UI에 노출하면 원시 JSON 덤프가 그대로 사용자에게 보이므로
 * (studio-ai-client.suggestSceneComposition이 기존에 content를 그대로 반환), 문자열 리프 값만 뽑아
 * 읽을 수 있는 불릿 텍스트로 되돌린다. 코드펜스·설명 문장이 섞여 있어도 첫 JSON 리터럴을 방어적으로
 * 찾아낸다(studio-dialogue-suggest.extractJsonArrayLiteral과 동일 발상).
 *
 * JSON이 아니거나 문자열을 하나도 못 뽑으면 **원문을 그대로 반환**한다 — 정규화 실패가 사용자에게
 * 도달할 내용을 잃지 않게(정직성 규약). 파싱 상한은 studio-dialogue-suggest의 MAX_PARSED와 같은
 * "앞에서부터만" 정책으로 UI 폭주를 막는다.
 */

export const STUDIO_AI_COMPOSITION_SUGGESTION_NORMALIZE_LIMITS = Object.freeze({
  /** 이 개수까지만 문자열 리프를 취한다(UI 과다 방어). */
  maxStrings: 12,
  /** 문자열 하나의 최대 길이(환각 폭주 절단). */
  maxStringLength: 400,
  /** 전체 출력 바이트 예산. */
  maxTotalLength: 2_000,
});

export function normalizeStudioAiCompositionSuggestion(raw: string): string {
  const literalStart = raw.search(/[{[]/);
  if (literalStart === -1) return raw;
  const openChar = raw[literalStart]!;
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  for (let i = literalStart; i < raw.length; i += 1) {
    if (raw[i] === openChar) depth += 1;
    else if (raw[i] === closeChar) {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(literalStart, end));
  } catch {
    return raw;
  }
  const strings: string[] = [];
  let totalLength = 0;
  const visit = (value: unknown): void => {
    if (strings.length >= STUDIO_AI_COMPOSITION_SUGGESTION_NORMALIZE_LIMITS.maxStrings) return;
    if (typeof value === "string") {
      const text = value.trim().slice(0, STUDIO_AI_COMPOSITION_SUGGESTION_NORMALIZE_LIMITS.maxStringLength);
      if (
        text.length < 2 ||
        totalLength + text.length > STUDIO_AI_COMPOSITION_SUGGESTION_NORMALIZE_LIMITS.maxTotalLength
      ) {
        return;
      }
      strings.push(text);
      totalLength += text.length;
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  visit(parsed);
  if (strings.length === 0) return raw;
  return strings.map((text) => `- ${text}`).join("\n");
}

/**
 * BYOK/서버 AI 미연결 상태에서도 즉시 웹툰 장면 구도·카메라·말풍선·세로 스크롤 연출 가이드를 생성한다.
 */
export function buildLocalSceneCompositionSuggestion(sceneText: string): string {
  const trimmed = sceneText.trim();
  if (!trimmed) return "";

  const isAction = /달리|충돌|폭발|베다|공격|추격|문을 벌컥|뛰어|검|칼|휘두르|돌진|결투|액션/u.test(trimmed);
  const isCloseEmotion = /눈물|침묵|속삭|떨리|독백|눈이 마주|바라보/u.test(trimmed);
  const isWideEntry = /전학|교실|거리|광장|왕궁|옥상|복도|들어와/u.test(trimmed);
  const hasDialogue = /["“”'‘’]|:/u.test(trimmed);

  const shotBullet = isAction
    ? "- 샷/카메라 앵글: 로우 앵글(Low Angle) + 더치 틸트(12°)로 역동적 운동감과 압박감을 강조하세요."
    : isCloseEmotion
      ? "- 샷/카메라 앵글: 바스트 샷에서 익스트림 클로즈업(ECU)으로 2단 컷 분할해 눈빛과 미세한 표정 변화를 포착하세요."
      : isWideEntry
        ? "- 샷/카메라 앵글: 전경 아웃포커싱 인물을 걸친 미디엄 와이드 샷(Establishing + Over-the-Shoulder)으로 공간감과 시선 집중을 동시에 잡으세요."
        : "- 샷/카메라 앵글: 아이레벨 미디엄 샷(Medium Shot)을 기준으로 인물 상반신과 손동작 연기가 한눈에 읽히도록 프레이밍하세요.";

  const stagingBullet = isAction
    ? "- 인물·동선 배치: 좌상단→우하단 대각선 액션 축을 따라 주동 인물을 배치하고, 배경 투시선을 소실점으로 수렴시키세요."
    : "- 인물·동선 배치: 삼분할 교차점(상단 1/3 지점)에 핵심 인물의 눈높이를 맞추고, 시선 방향 쪽에 여백(Lead Room)을 35% 이상 확보하세요.";

  const scrollBullet = isCloseEmotion
    ? "- 세로 스크롤 호흡: 컷 위아래에 180~240px의 세로 여백(Gutter)을 두어 독자의 스크롤 속도를 늦추고 감정 잔향을 만드세요."
    : "- 세로 스크롤 호흡: 상단 도입 컷(상황 제시) → 하단 리액션 컷으로 시선이 수직 낙하하도록 Z-패턴 구도를 설계하세요.";

  const bubbleBullet = hasDialogue
    ? "- 말풍선 세이프존·타이포 배치: 첫 발화는 좌상단, 응답 발화는 우하단 대각선에 배치하되 얼굴과 핵심 손동작을 가리지 않는 상단 여백(25%)을 비워두세요."
    : "- 말풍선 세이프존·이펙트 연출: 상단 20% 말풍선 세이프존을 확보하고, 조명 대비(역광/림라이트)와 환경 파티클(먼지·빛망울)로 공간 밀도를 채우세요.";

  return [
    shotBullet,
    stagingBullet,
    scrollBullet,
    bubbleBullet,
    `- 핵심 연출 포인트: "${trimmed.slice(0, 48)}${trimmed.length > 48 ? "…" : ""}" 장면의 감정 전환이 한 컷 안에서 명확한 실루엣 대비로 읽히도록 명암을 분리하세요.`,
  ].join("\n");
}

