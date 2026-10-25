/**
 * studio-ai-colorize-hints.ts — 클라우드(BYOK) 채색용 색 힌트 컴파일러 (순수 모듈, fetch 없음).
 *
 * 배경: 클라우드 채색 경로(colorizeLineArt)는 Images Edits 형태 API에 마스크를
 * 보내지 않는 단순화 버전이라, 캔버스 점·브러시 힌트를 직접 전달할 수 없다.
 * 대신 작가가 고른 색 힌트를 프롬프트 문장으로 컴파일해 기존 프롬프트에 덧붙인다.
 * 기기(ONNX) 경로의 태그 칩과 같은 색 어휘를 써서 두 경로의 UX를 일치시킨다.
 * 프롬프트 길이 상한 300자는 채색 패널 입력 상한과 동일하다.
 */

export interface StudioAiColorizeHintOption {
  readonly id: string;
  readonly label: string;
  readonly fragment: string;
}

export interface StudioAiColorizeHintGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly StudioAiColorizeHintOption[];
}

/** 채색 패널에서 쓰는 색 힌트 그룹. 기기 태그 칩의 큐레이션과 같은 범위이다. */
export const STUDIO_AI_COLORIZE_HINT_GROUPS: readonly StudioAiColorizeHintGroup[] =
  Object.freeze([
    Object.freeze({
      id: "hair",
      label: "머리색",
      options: Object.freeze([
        { id: "black", label: "검정", fragment: "머리색 검정" },
        { id: "brown", label: "갈색", fragment: "머리색 갈색" },
        { id: "blonde", label: "금발", fragment: "머리색 금발" },
        { id: "silver", label: "은색", fragment: "머리색 은색" },
        { id: "red", label: "빨강", fragment: "머리색 빨강" },
        { id: "blue", label: "파랑", fragment: "머리색 파랑" },
        { id: "pink", label: "분홍", fragment: "머리색 분홍" },
        { id: "green", label: "초록", fragment: "머리색 초록" },
      ]),
    }),
    Object.freeze({
      id: "eyes",
      label: "눈색",
      options: Object.freeze([
        { id: "black", label: "검정", fragment: "눈색 검정" },
        { id: "brown", label: "갈색", fragment: "눈색 갈색" },
        { id: "blue", label: "파랑", fragment: "눈색 파랑" },
        { id: "green", label: "초록", fragment: "눈색 초록" },
        { id: "red", label: "빨강", fragment: "눈색 빨강" },
        { id: "purple", label: "보라", fragment: "눈색 보라" },
      ]),
    }),
    Object.freeze({
      id: "skin",
      label: "피부",
      options: Object.freeze([
        { id: "light", label: "밝은 피부", fragment: "밝은 피부" },
        { id: "dark", label: "어두운 피부", fragment: "어두운 피부" },
      ]),
    }),
    Object.freeze({
      id: "background",
      label: "배경",
      options: Object.freeze([
        { id: "white", label: "흰색", fragment: "배경 흰색" },
        { id: "black", label: "검정", fragment: "배경 검정" },
        { id: "blue", label: "파랑", fragment: "배경 파랑" },
        { id: "pink", label: "분홍", fragment: "배경 분홍" },
        { id: "yellow", label: "노랑", fragment: "배경 노랑" },
        { id: "gradient", label: "그라데이션", fragment: "배경 그라데이션" },
      ]),
    }),
  ]);

/** 그룹 id → 선택된 옵션 id (미선택은 null 또는 키 없음). */
export type StudioAiColorizeHintSelection = Readonly<
  Record<string, string | null | undefined>
>;

export const STUDIO_AI_COLORIZE_PROMPT_MAX = 300;

/** 선택에서 실제 프롬프트 문장만 뽑는다. 모르는 그룹·옵션은 무시한다. */
export function selectedColorizeHintFragments(
  selection: StudioAiColorizeHintSelection,
  groups: readonly StudioAiColorizeHintGroup[] = STUDIO_AI_COLORIZE_HINT_GROUPS,
): readonly string[] {
  const fragments: string[] = [];
  for (const group of groups) {
    const selectedId = selection[group.id];
    if (!selectedId) continue;
    const option = group.options.find((candidate) => candidate.id === selectedId);
    if (option) fragments.push(option.fragment);
  }
  return fragments;
}

/**
 * 기본 프롬프트에 힌트 문장을 덧붙인다. 이미 들어 있는 문장은 중복 추가하지
 * 않으며, 상한을 넘기면 뒤쪽 힌트부터 빼서 기본 프롬프트를 지킨다.
 */
export function compileColorizeHintPrompt(
  basePrompt: string,
  selection: StudioAiColorizeHintSelection,
  groups: readonly StudioAiColorizeHintGroup[] = STUDIO_AI_COLORIZE_HINT_GROUPS,
): string {
  const base = basePrompt.trim();
  const fragments = selectedColorizeHintFragments(selection, groups).filter(
    (fragment) => !base.includes(fragment),
  );
  if (fragments.length === 0) return base.slice(0, STUDIO_AI_COLORIZE_PROMPT_MAX);
  const kept: string[] = [];
  for (const fragment of fragments) {
    const candidate = [base, ...kept, fragment].filter(Boolean).join(", ");
    if (candidate.length > STUDIO_AI_COLORIZE_PROMPT_MAX) break;
    kept.push(fragment);
  }
  return [base, ...kept].filter(Boolean).join(", ");
}
