/**
 * studio-ai-bgm-plan.ts — BGM·효과음 배치 계획 프롬프트 (순수 모듈, fetch 없음).
 *
 * 주 스튜디오 제작 흐름(WorkFx)에는 자동 배치 연결이 없고 수동 선택만
 * 있었다. 이 모듈은 컷별 분위기·대사를 BGM 무드·효과음 배치 계획 JSON으로
 * 바꾸는 프롬프트와 결과 검증을 담당한다. 실제 호출은 서버 게이트 +
 * 크레딧 차감 경유로 호출부가 수행한다. 실제 음원 재생은 기존 BGM
 * 엔진·SFX 스팅어 기반을 재사용하며, 이 모듈은 배치 계획까지만 다룬다.
 */

export interface StudioAiBgmCutInput {
  readonly cutId: string;
  readonly moodHint: string;
  readonly dialogues: readonly string[];
}

export interface StudioAiBgmPlacement {
  readonly cutId: string;
  readonly bgmMood: string;
  readonly sfxCues: readonly string[];
}

const BGM_MOODS = new Set(["daily", "tension", "romance", "battle"]);

/** 컷 목록을 BGM·효과음 배치 계획 JSON 프롬프트로 만든다. */
export function buildBgmPlacementPrompt(
  cuts: readonly StudioAiBgmCutInput[],
): string {
  return [
    "다음 웹툰 컷 목록마다 BGM 무드와 효과음 배치를 JSON으로만 답하라.",
    "형식: {\"placements\": [{\"cutId\": \"cut-1\", \"bgmMood\": \"daily\", \"sfxCues\": [\"soft\"]}]}",
    "bgmMood는 daily, tension, romance, battle 중 하나. sfxCues는 효과음 종류 문자열 배열(없으면 빈 배열).",
    `컷: ${JSON.stringify(cuts)}`,
  ].join("\n");
}

/** 배치 계획 결과를 검증한다. 형식이 아니면 null이다. */
export function parseBgmPlacement(
  text: string,
): readonly StudioAiBgmPlacement[] | null {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record["placements"])) return null;
    const placements: StudioAiBgmPlacement[] = [];
    for (const item of record["placements"] as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const placement = item as Record<string, unknown>;
      if (
        typeof placement["cutId"] !== "string" ||
        typeof placement["bgmMood"] !== "string" ||
        !BGM_MOODS.has(placement["bgmMood"] as string) ||
        !Array.isArray(placement["sfxCues"]) ||
        (placement["sfxCues"] as unknown[]).some((cue) => typeof cue !== "string")
      ) {
        return null;
      }
      placements.push({
        cutId: placement["cutId"] as string,
        bgmMood: placement["bgmMood"] as string,
        sfxCues: Object.freeze([...(placement["sfxCues"] as string[])]),
      });
    }
    return Object.freeze(placements);
  } catch {
    return null;
  }
}
