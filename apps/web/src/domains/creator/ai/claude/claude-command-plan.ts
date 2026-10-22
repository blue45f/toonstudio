/**
 * AI 명령 팔레트 — 자연어 요청을 스튜디오 명령 순서로 바꾸는 순수 로직.
 *
 * 벤치마크 근거: Photoshop Actions 패널의 "제안 → 미리보기 → 실행", Figma Make의 "스테이징 후 적용",
 * Claude Code·Cursor의 "계획 승인 후 실행"처럼 **제안(propose)과 실행(commit)을 분리**한다. 모델은
 * 명령 id의 순서만 제안하고, 아무것도 실행하지 않는다. 사용자가 단계별로 확인한 뒤 눌러야 실행된다.
 *
 * 안전 경계 — 새 실행기·새 정책을 만들지 않는다.
 * - 후보는 호스트가 이미 설치한 `StudioCommandExecutionBinding`뿐이다. 이 바인딩은 검색에서 직접 실행해도
 *   된다고 검토된 명령(보기·도구·선택·색상·창 계열)만 담고, 저장·게시·삭제·변형·`danger`는 애초에 없다.
 * - 모델 출력은 후보 허용목록으로 다시 검증한다(모르는 id·중복·비활성·초과 단계는 버린다).
 * - 실행은 단계마다 라이브 바인딩을 다시 읽고, 중단 신호를 확인하며, 한 단계가 실패해도 이어서 알린다.
 * - 이 모듈은 네트워크를 쓰지 않는다. 전송은 `claudeParse`가 맡는다.
 */
import { z } from "zod";

import { claudeModelSupportsEffort } from "@/shared/ai/claude/claude-models";
import { cleanSingleLineText } from "@/shared/ai/claude/claude-text";

import type Anthropic from "@anthropic-ai/sdk";

/** 한 번의 계획이 쓸 수 있는 출력 토큰 상한. 요청과 비용 상한 계산이 같은 값을 쓴다. */
export const COMMAND_PLAN_MAX_OUTPUT_TOKENS = 3_000;

export const COMMAND_PLAN_LIMITS = Object.freeze({
  /** 프롬프트에 싣는 후보 상한(카탈로그가 이보다 크면 id 순으로 자른다). */
  maxCandidates: 400,
  maxSteps: 8,
  maxQuestions: 3,
  maxRequestChars: 400,
  /** 단계 사이에 UI가 상태를 반영할 시간(ms). */
  stepSettleMs: 60,
});

export interface AiCommandCandidate {
  readonly commandId: string;
  readonly label: string;
  /** 카탈로그의 한 줄 설명(있으면). 모델이 비슷한 명령을 구분하는 근거다. */
  readonly description?: string;
  /** 다른 앱 용어(Photoshop·CSP·Krita·Procreate)로 찾는 사용자를 위한 별칭. */
  readonly aliases?: readonly string[];
  /** 카탈로그가 정한 단축키(화면 표기 그대로). 방법을 묻는 질문에 정확히 답하고 화면에도 보여 주려고 싣는다. */
  readonly shortcut?: string;
  /** 도우미가 직접 실행할 수 있는 명령인가(라이브 실행 바인딩이 있는가). 없으면 메뉴에서 직접 해야 하는 기능이다. 기본은 true. */
  readonly executable?: boolean;
  readonly disabled: boolean;
  readonly unavailableReason?: string;
}

export const CommandPlanSchema = z.object({
  intent: z.string(),
  steps: z.array(z.object({
    commandId: z.string(),
    reason: z.string(),
  })),
  questions: z.array(z.string()),
});
export type CommandPlanRaw = z.infer<typeof CommandPlanSchema>;

export interface PlannedCommandStep {
  readonly commandId: string;
  readonly label: string;
  readonly reason: string;
}

export type CommandPlanRejection = "unknown" | "duplicate" | "disabled" | "over_limit";

export interface CommandPlan {
  readonly intent: string;
  readonly steps: readonly PlannedCommandStep[];
  readonly questions: readonly string[];
  readonly rejected: ReadonlyArray<{ readonly commandId: string; readonly why: CommandPlanRejection }>;
}

export function singleLine(value: string, maxLength: number): string {
  return cleanSingleLineText(value, maxLength);
}

/** 후보를 id 순으로 고정해 직렬화한다. 같은 후보 집합은 항상 같은 문자열이라 프롬프트 캐시가 유지된다. */
export function buildCommandCatalogText(candidates: readonly AiCommandCandidate[]): string {
  return [...candidates]
    .filter((candidate) => !candidate.disabled)
    .sort((left, right) => (left.commandId < right.commandId ? -1 : left.commandId > right.commandId ? 1 : 0))
    .slice(0, COMMAND_PLAN_LIMITS.maxCandidates)
    .map((candidate) => {
      const parts = [candidate.commandId, singleLine(candidate.label, 60)];
      const description = candidate.description ? singleLine(candidate.description, 90) : "";
      if (description) parts.push(description);
      const aliases = (candidate.aliases ?? []).map((alias) => singleLine(alias, 30)).filter(Boolean).slice(0, 4);
      if (aliases.length > 0) parts.push(`별칭: ${aliases.join(", ")}`);
      const shortcut = candidate.shortcut ? singleLine(candidate.shortcut, 20) : "";
      if (shortcut) parts.push(`단축키: ${shortcut}`);
      return parts.join(" | ");
    })
    .join("\n");
}

const PLAN_RULES = [
  "당신은 웹툰 스튜디오의 명령 도우미입니다. 사용자의 요청을 아래 '사용 가능한 명령' 목록의 명령 id 순서로 바꿔 JSON으로 답하세요.",
  "",
  "규칙",
  "- steps의 commandId는 반드시 목록에 있는 id 그대로여야 합니다. 목록에 없는 명령을 만들어내지 마세요.",
  `- 단계는 최대 ${COMMAND_PLAN_LIMITS.maxSteps}개이고, 같은 명령을 두 번 넣지 마세요. 꼭 필요한 단계만 넣으세요.`,
  "- 각 단계는 앞 단계가 끝난 뒤 순서대로 실행됩니다. reason에는 그 명령이 요청의 어느 부분을 해결하는지 한 줄로 적으세요.",
  "- 요청에 맞는 명령이 목록에 없거나 요청이 모호하면 steps를 비우고, questions에 사용자가 답할 질문을 최대 3개 적으세요.",
  "- 저장·내보내기·삭제·게시처럼 되돌리기 어려운 작업은 목록에 없으면 계획하지 마세요. 대신 questions에서 직접 하도록 안내하세요.",
  "- intent는 요청을 한 줄로 요약한 문장입니다. 모든 문장은 한국어 해요체로 간결하게 쓰세요.",
].join("\n");

/** 요청 생성. 규칙과 카탈로그는 system(캐시 대상), 사용자 요청만 user에 둔다. */
export function buildCommandPlanRequest(
  model: string,
  userRequest: string,
  candidates: readonly AiCommandCandidate[],
): Anthropic.MessageCreateParamsNonStreaming {
  const request = singleLine(userRequest, COMMAND_PLAN_LIMITS.maxRequestChars);
  return {
    model,
    max_tokens: COMMAND_PLAN_MAX_OUTPUT_TOKENS,
    system: [
      { type: "text", text: PLAN_RULES },
      {
        type: "text",
        text: `사용 가능한 명령(id | 이름 | 설명 | 별칭 | 단축키)\n${buildCommandCatalogText(candidates)}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: request }],
    // `effort`를 모르는 모델(구형 Sonnet·Haiku)에 보내면 400이라 지원이 확인된 모델에만 싣는다.
    ...(claudeModelSupportsEffort(model) ? { output_config: { effort: "medium" as const } } : {}),
  };
}

/**
 * 모델이 돌려준 계획을 허용목록으로 검증한다. 모르는 id·중복·비활성·초과 단계는 버리고 사유를 남긴다.
 * 순서는 모델이 준 순서를 유지한다(앞 단계가 뒤 단계의 전제일 수 있다).
 */
export function validateCommandPlan(
  raw: CommandPlanRaw,
  candidates: readonly AiCommandCandidate[],
): CommandPlan {
  const byId = new Map(candidates.map((candidate) => [candidate.commandId, candidate]));
  const seen = new Set<string>();
  const steps: PlannedCommandStep[] = [];
  const rejected: Array<{ commandId: string; why: CommandPlanRejection }> = [];

  for (const step of raw.steps) {
    const commandId = step.commandId.trim();
    const candidate = byId.get(commandId);
    if (!candidate) {
      rejected.push({ commandId: singleLine(commandId, 80), why: "unknown" });
    } else if (seen.has(commandId)) {
      rejected.push({ commandId, why: "duplicate" });
    } else if (candidate.disabled) {
      rejected.push({ commandId, why: "disabled" });
    } else if (steps.length >= COMMAND_PLAN_LIMITS.maxSteps) {
      rejected.push({ commandId, why: "over_limit" });
    } else {
      seen.add(commandId);
      steps.push({
        commandId,
        label: candidate.label,
        reason: singleLine(step.reason, 160),
      });
    }
  }

  return {
    intent: singleLine(raw.intent, 160),
    steps,
    questions: raw.questions
      .map((question) => singleLine(question, 200))
      .filter(Boolean)
      .slice(0, COMMAND_PLAN_LIMITS.maxQuestions),
    rejected,
  };
}

export interface LiveCommandBinding {
  readonly execute: () => void;
  readonly disabled: boolean;
  readonly unavailableReason?: string;
}

export type CommandStepStatus = "executed" | "skipped" | "failed";

export interface CommandStepResult {
  readonly commandId: string;
  readonly status: CommandStepStatus;
  /** skipped·failed일 때 사용자에게 보일 사유. */
  readonly reason?: string;
}

export interface ExecuteCommandPlanOptions {
  readonly signal?: AbortSignal;
  /** 단계 사이 대기. 테스트에서 즉시 반환하도록 주입한다. */
  readonly settle?: () => Promise<void>;
  /** 각 단계가 끝날 때마다 호출된다(진행 표시용). */
  readonly onStep?: (result: CommandStepResult, index: number) => void;
}

const defaultSettle = () => new Promise<void>((resolve) => {
  setTimeout(resolve, COMMAND_PLAN_LIMITS.stepSettleMs);
});

/**
 * 선택된 단계를 순서대로 실행한다. 매 단계 직전에 `lookup`으로 라이브 바인딩을 다시 읽어, 그 사이
 * 사라지거나 비활성이 된 명령은 실행하지 않고 건너뛴다. 중단 신호가 오면 남은 단계는 실행하지 않는다.
 * 한 단계가 던져도 나머지를 계속 시도하지 않고 멈춘다 — 앞 단계가 뒤 단계의 전제이기 때문이다.
 */
export async function executeCommandPlanSteps(
  steps: readonly PlannedCommandStep[],
  lookup: (commandId: string) => LiveCommandBinding | undefined,
  options: ExecuteCommandPlanOptions = {},
): Promise<CommandStepResult[]> {
  const settle = options.settle ?? defaultSettle;
  const results: CommandStepResult[] = [];
  const record = (result: CommandStepResult) => {
    results.push(result);
    options.onStep?.(result, results.length - 1);
  };

  for (const [index, step] of steps.entries()) {
    if (options.signal?.aborted) {
      for (const remaining of steps.slice(index)) {
        record({ commandId: remaining.commandId, status: "skipped", reason: "stopped" });
      }
      break;
    }
    const binding = lookup(step.commandId);
    if (!binding) {
      record({ commandId: step.commandId, status: "skipped", reason: "missing" });
      continue;
    }
    if (binding.disabled) {
      record({ commandId: step.commandId, status: "skipped", reason: binding.unavailableReason ?? "disabled" });
      continue;
    }
    try {
      binding.execute();
    } catch (error) {
      record({
        commandId: step.commandId,
        status: "failed",
        reason: error instanceof Error ? singleLine(error.message, 160) : "failed",
      });
      for (const remaining of steps.slice(index + 1)) {
        record({ commandId: remaining.commandId, status: "skipped", reason: "previous_failed" });
      }
      break;
    }
    record({ commandId: step.commandId, status: "executed" });
    if (index < steps.length - 1) await settle();
  }
  return results;
}
