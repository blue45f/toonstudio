/**
 * 한국어/영어 자연어 음성·텍스트 명령 캔버스 파서 및 브라우저 SpeechRecognition 래퍼.
 *
 * - 오프라인·테스트 100% 결정론적 파싱(한/영 12종 명령 + 1클릭 실행취소 토큰)
 * - 오인식·모호 입력 시 비파괴 안전 후보 3개 자동 추천
 */

import {
  VOICE_COMMAND_RULES,
  type StarterCanvasSnapshot,
  type StarterPanelItem,
  type VoiceCommandActionId,
  type VoiceCommandRule,
  type WorkspaceProficiencyMode,
} from "./zero-barrier-catalog";

export interface VoiceCommandCandidate {
  readonly actionId: VoiceCommandActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly exampleKo: string;
  readonly exampleEn: string;
  readonly score: number;
}

export interface VoiceCommandParseResult {
  readonly rawInput: string;
  readonly normalizedInput: string;
  readonly matched: boolean;
  readonly actionId: VoiceCommandActionId | null;
  readonly actionLabelKo: string | null;
  readonly actionLabelEn: string | null;
  readonly confidence: number;
  readonly detectedLanguage: "ko" | "en" | "mixed" | "unknown";
  readonly undoToken: string | null;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly fallbackCandidates: readonly VoiceCommandCandidate[];
}

export interface VoiceCommandApplyResult {
  readonly applied: boolean;
  readonly nextSnapshot: StarterCanvasSnapshot;
  readonly nextMode: WorkspaceProficiencyMode | null;
  readonly undoToken: string | null;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence?: number;
}

export interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

export interface SpeechRecognitionEventLike {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike | undefined;
  };
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike;

export interface BrowserVoiceSessionOptions {
  readonly lang?: "ko-KR" | "en-US";
  readonly recognitionCtor?: SpeechRecognitionConstructorLike | null;
  readonly onTranscriptResult: (result: VoiceCommandParseResult) => void;
  readonly onStatusChange?: (
    status: "idle" | "listening" | "unsupported" | "error",
    messageKo: string,
  ) => void;
}

export interface BrowserVoiceSessionHandle {
  readonly supported: boolean;
  start(): boolean;
  stop(): void;
}

const DEFAULT_SAFE_FALLBACK_IDS: readonly VoiceCommandActionId[] = [
  "auto-color",
  "insert-background",
  "add-speech-bubble",
];

function detectLanguage(text: string): "ko" | "en" | "mixed" | "unknown" {
  const hasKo = /[가-힣]/.test(text);
  const hasEn = /[a-zA-Z]/.test(text);
  if (hasKo && hasEn) return "mixed";
  if (hasKo) return "ko";
  if (hasEn) return "en";
  return "unknown";
}

function normalizeUtterance(raw: string): { readonly compact: string; readonly spaced: string } {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[!?.~,·"'`()[\]]+/g, " ")
    .replace(/\b(please|pls|now|can you|could you)\b/g, " ")
    .replace(/(해주세요|해 주세요|해 줘요|해줘요|해 줘|해줘|좀|바로)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { compact: cleaned.replace(/\s+/g, ""), spaced: cleaned };
}

function scoreRule(rule: VoiceCommandRule, rawLower: string, compact: string, spaced: string): number {
  const rawCompact = rawLower.replace(/[!?.~,·"'`()[\]\s]+/g, "");
  if (rule.phrases.some((phrase) => rawCompact === phrase || compact === phrase)) return 1.0;
  if (rule.phrases.some((phrase) => rawCompact.includes(phrase) || compact.includes(phrase))) return 0.92;
  let keywordHits = 0;
  for (const keyword of rule.keywords) {
    if (rawCompact.includes(keyword) || spaced.includes(keyword)) keywordHits += 1;
  }
  if (keywordHits >= 2) return 0.86;
  if (keywordHits === 1) return compact.length <= 16 ? 0.78 : 0.72;
  return 0;
}

function buildFallbackCandidates(
  scored: readonly { readonly rule: VoiceCommandRule; readonly score: number }[],
): readonly VoiceCommandCandidate[] {
  const picked: VoiceCommandCandidate[] = [];
  const seen = new Set<VoiceCommandActionId>();

  for (const entry of scored) {
    if (entry.score > 0 && !seen.has(entry.rule.actionId) && picked.length < 3) {
      seen.add(entry.rule.actionId);
      picked.push({
        actionId: entry.rule.actionId,
        labelKo: entry.rule.labelKo,
        labelEn: entry.rule.labelEn,
        exampleKo: entry.rule.exampleKo,
        exampleEn: entry.rule.exampleEn,
        score: entry.score,
      });
    }
  }

  for (const fallbackId of DEFAULT_SAFE_FALLBACK_IDS) {
    if (picked.length >= 3) break;
    if (seen.has(fallbackId)) continue;
    const rule = VOICE_COMMAND_RULES.find((item) => item.actionId === fallbackId);
    if (!rule) continue;
    seen.add(fallbackId);
    picked.push({
      actionId: rule.actionId,
      labelKo: rule.labelKo,
      labelEn: rule.labelEn,
      exampleKo: rule.exampleKo,
      exampleEn: rule.exampleEn,
      score: 0.25,
    });
  }

  return picked;
}

export function parseVoiceCanvasCommand(
  rawInput: string,
  options?: { readonly commandSeq?: number },
): VoiceCommandParseResult {
  const trimmed = rawInput.trim();
  const detectedLanguage = detectLanguage(trimmed);
  const { compact, spaced } = normalizeUtterance(trimmed);
  const seq = options?.commandSeq ?? 1;

  if (!trimmed || compact.length === 0) {
    return {
      rawInput,
      normalizedInput: "",
      matched: false,
      actionId: null,
      actionLabelKo: null,
      actionLabelEn: null,
      confidence: 0,
      detectedLanguage: "unknown",
      undoToken: null,
      messageKo: "원하는 작업을 짧게 말하거나 아래 안전한 추천 버튼 3개 중 하나를 눌러 보세요.",
      messageEn: "Speak a short command or pick one of the 3 safe suggestions below.",
      fallbackCandidates: buildFallbackCandidates([]),
    };
  }

  const rawLower = trimmed.toLowerCase();
  const scored = VOICE_COMMAND_RULES.map((rule) => ({
    rule,
    score: scoreRule(rule, rawLower, compact, spaced),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score >= 0.7) {
    return {
      rawInput,
      normalizedInput: spaced,
      matched: true,
      actionId: best.rule.actionId,
      actionLabelKo: best.rule.labelKo,
      actionLabelEn: best.rule.labelEn,
      confidence: best.score,
      detectedLanguage,
      undoToken: `undo-cmd-${seq}-${best.rule.actionId}`,
      messageKo: `'${best.rule.labelKo}' 명령을 바로 실행했어요. 마음에 들지 않으면 1클릭으로 되돌릴 수 있어요.`,
      messageEn: `Executed '${best.rule.labelEn}'. Use 1-click undo anytime.`,
      fallbackCandidates: [],
    };
  }

  return {
    rawInput,
    normalizedInput: spaced,
    matched: false,
    actionId: null,
    actionLabelKo: null,
    actionLabelEn: null,
    confidence: best?.score ?? 0,
    detectedLanguage,
    undoToken: null,
    messageKo: "정확히 알아듣지 못했어요. 실수 없이 실행할 수 있는 안전한 후보 3개를 골라 드렸어요.",
    messageEn: "Could not match confidently. Pick one of 3 safe candidate actions below.",
    fallbackCandidates: buildFallbackCandidates(scored),
  };
}

export function applyVoiceCommandToSnapshot(
  snapshot: StarterCanvasSnapshot,
  parsed: VoiceCommandParseResult,
  options?: { readonly timestampMs?: number; readonly seq?: number },
): VoiceCommandApplyResult {
  if (!parsed.matched || !parsed.actionId) {
    return {
      applied: false,
      nextSnapshot: snapshot,
      nextMode: null,
      undoToken: null,
      summaryKo: parsed.messageKo,
      summaryEn: parsed.messageEn,
    };
  }

  const timestampMs = options?.timestampMs ?? snapshot.updatedAtMs + 500;
  const seq = options?.seq ?? 2;
  const nextSnapshotId = `${snapshot.kitId}-step-${seq}`;
  const finish = (
    patch: Partial<StarterCanvasSnapshot>,
    summaryKo: string,
    summaryEn: string,
    nextMode: WorkspaceProficiencyMode | null = null,
  ): VoiceCommandApplyResult => ({
    applied: true,
    nextSnapshot: { ...snapshot, snapshotId: nextSnapshotId, updatedAtMs: timestampMs, ...patch },
    nextMode,
    undoToken: parsed.undoToken,
    summaryKo,
    summaryEn,
  });

  switch (parsed.actionId) {
    case "auto-color":
      return finish(
        {
          panels: snapshot.panels.map((panel) => ({ ...panel, isColored: true })),
          lastChangeSummaryKo: "모든 컷에 자동 밑색과 분위기 채색을 입혔어요.",
        },
        "모든 컷을 깔끔하게 채색했어요.",
        "Auto-colored all panels.",
      );
    case "insert-background": {
      const updatedBackdrop = `${snapshot.activeBackdropKo} (강조 조명 배경)`;
      return finish(
        {
          activeBackdropKo: updatedBackdrop,
          panels: snapshot.panels.map((panel, index) =>
            index === 0 ? { ...panel, backgroundPresetKo: updatedBackdrop } : { ...panel },
          ),
          lastChangeSummaryKo: "장면에 어울리는 강조 배경을 넣었어요.",
        },
        "현재 장면에 맞춤 배경을 바로 넣었어요.",
        "Inserted matching scene backdrop.",
      );
    }
    case "add-speech-bubble": {
      const lastIndex = Math.max(0, snapshot.panels.length - 1);
      return finish(
        {
          panels: snapshot.panels.map((panel, index) =>
            index === lastIndex
              ? { ...panel, dialogueKo: `${panel.dialogueKo} (새 말풍선 대사 추가)` }
              : { ...panel },
          ),
          lastChangeSummaryKo: `${lastIndex + 1}번 컷에 새 말풍선을 추가했어요.`,
        },
        `${lastIndex + 1}번 컷에 말풍선을 추가했어요.`,
        `Added a speech bubble to panel ${lastIndex + 1}.`,
      );
    }
    case "clean-lineart":
      return finish(
        {
          panels: snapshot.panels.map((panel) => ({ ...panel, lineCleaned: true })),
          lastChangeSummaryKo: "떨린 펜선을 매끈하게 자동 보정했어요.",
        },
        "전체 컷의 선을 깔끔하게 정리했어요.",
        "Smoothed and cleaned line art across panels.",
      );
    case "save-project":
      return finish(
        {
          savedCount: snapshot.savedCount + 1,
          lastChangeSummaryKo: `현재 작업을 안전하게 저장했어요 (총 ${snapshot.savedCount + 1}회 저장).`,
        },
        "현재 작업을 안전하게 저장했어요.",
        "Saved current project safely.",
      );
    case "place-character":
      return finish(
        {
          panels: snapshot.panels.map((panel, index) =>
            index === 0
              ? { ...panel, characterPoseKo: "정면을 향해 자신 있게 웃는 주인공 포즈" }
              : { ...panel },
          ),
          lastChangeSummaryKo: "1번 컷에 주인공 새 포즈를 배치했어요.",
        },
        "주인공 캐릭터를 컷 안에 배치했어요.",
        "Placed protagonist pose into panel 1.",
      );
    case "split-panel": {
      const nextIndex = snapshot.panels.length + 1;
      const newPanel: StarterPanelItem = {
        panelIndex: nextIndex,
        framingKo: "추가 반응 컷",
        framingEn: "Added reaction cut",
        backgroundPresetKo: snapshot.activeBackdropKo,
        characterPoseKo: "상황에 반응하는 자연스러운 클로즈업",
        dialogueKo: "잠깐, 방금 그 말 진심이야?",
        sfxKo: "움찔",
        isColored: true,
        lineCleaned: true,
      };
      return finish(
        {
          panels: [...snapshot.panels, newPanel],
          lastChangeSummaryKo: `${nextIndex}번 새 컷 칸을 나눴어요.`,
        },
        `${nextIndex}번 새 컷을 자연스럽게 추가했어요.`,
        `Added panel ${nextIndex}.`,
      );
    }
    case "add-sfx":
      return finish(
        {
          panels: snapshot.panels.map((panel, index) =>
            index === 0 ? { ...panel, sfxKo: "두근두근!" } : { ...panel },
          ),
          lastChangeSummaryKo: "1번 컷에 '두근두근!' 효과음을 넣었어요.",
        },
        "장면에 효과음을 넣었어요.",
        "Added sound effect to panel 1.",
      );
    case "export-webtoon":
      return finish(
        {
          exportReady: true,
          lastChangeSummaryKo: "세로 웹툰 완성 내보내기 패키지를 준비했어요.",
        },
        "연재용 웹툰 완성 내보내기를 준비했어요.",
        "Prepared vertical webtoon export package.",
      );
    case "switch-beginner-mode":
      return finish(
        { lastChangeSummaryKo: "핵심 4버튼만 보이는 초보 쉬움 화면으로 바꿨어요." },
        "초보 쉬움 모드로 전환했어요.",
        "Switched to Beginner Easy mode.",
        "beginner-easy",
      );
    case "switch-pro-mode":
      return finish(
        { lastChangeSummaryKo: "모든 전문 도구가 열리는 프로 스튜디오로 확장했어요." },
        "프로 스튜디오 모드로 확장했어요.",
        "Expanded to Pro Studio mode.",
        "pro-studio",
      );
    case "undo-last":
      return {
        applied: true,
        nextSnapshot: snapshot,
        nextMode: null,
        undoToken: parsed.undoToken,
        summaryKo: "1초 안전 복구로 방금 전 상태로 되돌립니다.",
        summaryEn: "Reverting to previous safe checkpoint.",
      };
  }
}

export function resolveBrowserSpeechRecognitionCtor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    readonly SpeechRecognition?: SpeechRecognitionConstructorLike;
    readonly webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function createBrowserVoiceCommandSession(
  options: BrowserVoiceSessionOptions,
): BrowserVoiceSessionHandle {
  const ctor =
    options.recognitionCtor !== undefined
      ? options.recognitionCtor
      : resolveBrowserSpeechRecognitionCtor();

  if (!ctor) {
    return {
      supported: false,
      start() {
        options.onStatusChange?.(
          "unsupported",
          "이 브라우저는 마이크 음성 인식을 지원하지 않아 아래 입력창이나 빠른 버튼으로 바로 실행할 수 있어요.",
        );
        return false;
      },
      stop() {
        options.onStatusChange?.("idle", "음성 입력을 마쳤어요.");
      },
    };
  }

  let instance: SpeechRecognitionInstanceLike | null = null;
  let seq = 1;

  return {
    supported: true,
    start() {
      try {
        instance = new ctor();
        instance.lang = options.lang ?? "ko-KR";
        instance.interimResults = false;
        instance.maxAlternatives = 1;
        instance.onresult = (event) => {
          const firstAlt = event.results[0]?.[0];
          const parsed = parseVoiceCanvasCommand(firstAlt?.transcript ?? "", { commandSeq: seq });
          seq += 1;
          options.onTranscriptResult(parsed);
        };
        instance.onerror = (errorEvent) => {
          options.onStatusChange?.(
            "error",
            `마이크 인식 중 잠시 멈췄어요(${errorEvent.error}). 빠른 버튼이나 직접 입력으로 이어서 작업하세요.`,
          );
        };
        instance.onend = () => {
          options.onStatusChange?.("idle", "음성 듣기를 마쳤어요.");
        };
        instance.start();
        options.onStatusChange?.(
          "listening",
          "듣고 있어요! '채색해 줘'나 '말풍선 추가'처럼 말씀해 보세요.",
        );
        return true;
      } catch {
        options.onStatusChange?.(
          "error",
          "마이크 권한을 확인할 수 없어요. 아래 빠른 명령 버튼을 눌러 바로 실행해 보세요.",
        );
        return false;
      }
    },
    stop() {
      instance?.stop();
      instance = null;
      options.onStatusChange?.("idle", "음성 듣기를 멈췄어요.");
    },
  };
}
