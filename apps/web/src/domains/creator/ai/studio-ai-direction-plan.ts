/**
 * studio-ai-direction-plan.ts — 음성 웹툰 연출 설계 프롬프트 (순수 모듈, fetch 없음).
 *
 * 모션 웹툰 자동 연출은 규칙 기반 키워드 매칭이었지 LLM이 아니었다.
 * 이 모듈은 컷 목록을 카메라·전환·BGM 무드·효과음 배치 계획 JSON으로
 * 바꾸는 프롬프트와 결과 검증을 담당한다. 실제 호출은 서버 게이트 +
 * 크레딧 차감 경유로 호출부가 수행한다. 음성·영상 생성 자체는
 * 클로드로 할 수 없으므로, 이 모듈은 텍스트 계획까지만 다룬다.
 */

export interface StudioAiDirectionCutInput {
  readonly cutId: string;
  readonly summary: string;
  readonly dialogues: readonly string[];
}

export interface StudioAiDirectionCutPlan {
  readonly cutId: string;
  readonly cameraMove: string;
  readonly transition: string;
  readonly bgmMood: string;
  readonly sfxCues: readonly string[];
}

/** 컷 목록을 연출 설계 JSON 프롬프트로 만든다. */
export function buildDirectionPlanPrompt(
  cuts: readonly StudioAiDirectionCutInput[],
): string {
  return [
    "다음 웹툰 컷 목록마다 연출 설계를 JSON으로만 답하라.",
    "형식: {\"plans\": [{\"cutId\": \"cut-1\", \"cameraMove\": \"zoom-in\", \"transition\": \"fade\", \"bgmMood\": \"daily\", \"sfxCues\": [\"soft\"]}]}",
    "cameraMove는 zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down, shake, static 중 하나.",
    "transition은 cut, fade, wipe-left, wipe-right, blur, flash 중 하나.",
    "bgmMood는 daily, tension, romance, battle 중 하나. sfxCues는 효과음 종류 문자열 배열(없으면 빈 배열).",
    `컷: ${JSON.stringify(cuts)}`,
  ].join("\n");
}

/** 연출 설계 결과를 검증한다. 형식이 아니면 null이다. */
export function parseDirectionPlan(
  text: string,
): readonly StudioAiDirectionCutPlan[] | null {
  const cameraMoves = new Set([
    "zoom-in",
    "zoom-out",
    "pan-left",
    "pan-right",
    "pan-up",
    "pan-down",
    "shake",
    "static",
  ]);
  const transitions = new Set([
    "cut",
    "fade",
    "wipe-left",
    "wipe-right",
    "blur",
    "flash",
  ]);
  const moods = new Set(["daily", "tension", "romance", "battle"]);
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record["plans"])) return null;
    const plans: StudioAiDirectionCutPlan[] = [];
    for (const item of record["plans"] as unknown[]) {
      if (typeof item !== "object" || item === null) return null;
      const plan = item as Record<string, unknown>;
      if (
        typeof plan["cutId"] !== "string" ||
        typeof plan["cameraMove"] !== "string" ||
        !cameraMoves.has(plan["cameraMove"] as string) ||
        typeof plan["transition"] !== "string" ||
        !transitions.has(plan["transition"] as string) ||
        typeof plan["bgmMood"] !== "string" ||
        !moods.has(plan["bgmMood"] as string) ||
        !Array.isArray(plan["sfxCues"]) ||
        (plan["sfxCues"] as unknown[]).some((cue) => typeof cue !== "string")
      ) {
        return null;
      }
      plans.push({
        cutId: plan["cutId"] as string,
        cameraMove: plan["cameraMove"] as string,
        transition: plan["transition"] as string,
        bgmMood: plan["bgmMood"] as string,
        sfxCues: Object.freeze([...(plan["sfxCues"] as string[])]),
      });
    }
    return Object.freeze(plans);
  } catch {
    return null;
  }
}
