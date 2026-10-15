/**
 * 기획 저장소와 원고에서 온 결과를 개연성 리포트의 말로 옮기는 어댑터.
 *
 * 복선 장부, 약속·회수 장부, 회차 타임라인, 세계관 설정 검증, 고유명사(이름 표기) 검사가 이미 낸 결과를
 * 받는다. 새 탐지기를 만들지 않는다. 처리 기록의 열쇠는 원래 이슈 id를 그대로 쓴다.
 */
import type { ForeshadowSeed } from "../../planning/studio-foreshadow-ledger";
import type { ContinuityTimelineCandidate } from "../../planning/studio-episode-continuity-timeline";
import type { LoreNameFinding } from "../../planning/studio-lore-name-check";
import { STUDIO_LORE_KIND_LABELS, type StudioLoreEntryKind, type StudioWorldLoreIssue } from "../../planning/studio-world-lore";
import type { StudioPromisePayoffWarning } from "../../studio-promise-payoff-ledger";
import { josa } from "./studio-story-plausibility-text";
import {
  createPlausibilityFinding,
  optionCopyAdvice,
  optionInfo,
  type PlausibilityContext,
} from "./studio-story-plausibility-context";
import type {
  PlausibilityEvidence,
  PlausibilityFinding,
} from "./studio-story-plausibility-types";

// ── 복선 장부 · 약속·회수 장부 · 회차 타임라인 ─────────────────────────

export interface PlausibilityEpisodeRef {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
}

export interface PlausibilityForeshadowInput {
  readonly overdue: readonly ForeshadowSeed[];
  readonly dueSoon: readonly ForeshadowSeed[];
  readonly episodes: readonly PlausibilityEpisodeRef[];
  /** 장부에 있는 복선 전체 수. 0이면 "비어 있음"으로 표시한다. */
  readonly totalCount: number;
}

function episodeScenes(ctx: PlausibilityContext, episodeNumber: number | undefined): readonly string[] {
  if (episodeNumber === undefined) return [];
  return ctx.activeScenes.filter((scene) => scene.episodeNumber === episodeNumber).map((scene) => scene.id);
}

export function adaptForeshadowLedger(
  ctx: PlausibilityContext,
  input: PlausibilityForeshadowInput,
): readonly PlausibilityFinding[] {
  const episodeById = new Map(input.episodes.map((episode) => [episode.episodeId, episode]));
  const findings: PlausibilityFinding[] = [];
  const describe = (seed: ForeshadowSeed) => {
    const planted = episodeById.get(seed.plantedIn.episodeId);
    const payoffEnd = seed.expectedPayoff?.toEpisodeId ? episodeById.get(seed.expectedPayoff.toEpisodeId) : undefined;
    return { planted, payoffEnd };
  };
  for (const [list, kind] of [[input.overdue, "overdue"], [input.dueSoon, "due-soon"]] as const) {
    for (const seed of list) {
      const { planted, payoffEnd } = describe(seed);
      const sceneIds = episodeScenes(ctx, planted?.episodeNumber);
      const episodeLabel = (episode: PlausibilityEpisodeRef | undefined) => (episode ? `${episode.episodeNumber}화` : "?화");
      const evidence: PlausibilityEvidence[] = [
        { kind: "ledger", id: seed.id, label: seed.title, detail: `복선 장부 · ${seed.status === "growing" ? "자라는 중" : "심음"}` },
        ...(planted ? [{ kind: "episode" as const, id: planted.episodeId, label: `${planted.episodeNumber}화 ${planted.title}`, detail: "복선을 심은 회차" }] : []),
        ...(payoffEnd ? [{ kind: "episode" as const, id: payoffEnd.episodeId, label: `${payoffEnd.episodeNumber}화 ${payoffEnd.title}`, detail: "회수 예정 마지막 회차" }] : []),
      ];
      findings.push(createPlausibilityFinding(ctx, {
        source: { module: "foreshadow-ledger", code: kind, originalId: seed.id },
        idParts: [kind, seed.id],
        category: "foreshadowing",
        ...(kind === "overdue"
          ? { severity: "warning" as const, confidence: "certain" as const }
          : { severity: "suggestion" as const, confidence: "certain" as const }),
        title: kind === "overdue" ? "회수하기로 한 구간이 지났어요" : "복선을 거둘 구간이 되었어요",
        message: kind === "overdue"
          ? `‘${seed.title}’ 복선을 ${episodeLabel(payoffEnd)}까지 거두기로 했는데 아직 회수하지 않았어요.`
          : `‘${seed.title}’ 복선을 거두기로 한 구간에 들어왔어요. ${episodeLabel(planted)}에 심은 복선이에요.`,
        question: kind === "overdue"
          ? "이 복선은 곧 거둘까요, 아니면 접을까요? 복선 장부에서 상태를 바꿔 주세요."
          : "이번 구간에서 이 복선을 거둘 장면이 있나요?",
        evidence,
        options: [optionInfo("ledger", "복선 장부에서 상태 바꾸기", "복선의 회수 여부는 작가가 직접 정합니다. 이 허브는 상태를 바꾸지 않습니다.")],
        sceneIds,
      }));
    }
  }
  return findings;
}

export interface PlausibilityPromiseInput {
  readonly warnings: readonly StudioPromisePayoffWarning[];
  /** entryId → 약속 제목 */
  readonly entryTitles: Readonly<Record<string, string>>;
  /** 장부에 있는 약속 전체 수. */
  readonly totalCount: number;
}

export function adaptPromiseLedger(
  ctx: PlausibilityContext,
  input: PlausibilityPromiseInput,
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  for (const warning of input.warnings) {
    const title = input.entryTitles[warning.entryId] ?? warning.entryId;
    const evidence: PlausibilityEvidence[] = [{ kind: "ledger", id: warning.entryId, label: title, detail: "약속·회수 장부" }];
    const base = {
      source: { module: "promise-ledger" as const, code: warning.code, originalId: `${warning.entryId}:${warning.code}` },
      idParts: [warning.code, warning.entryId, warning.message],
      category: "foreshadowing" as const,
      message: warning.message,
      evidence,
      options: [optionInfo("promise-ledger", "제작 바이블에서 약속 고치기", "편집기의 제작 바이블 대화상자 '약속·회수' 패널에서 연결과 마감을 고칩니다.")],
      sceneIds: [] as readonly string[],
    };
    switch (warning.code) {
      case "PAYOFF_BEFORE_SEED":
        findings.push(createPlausibilityFinding(ctx, {
          ...base, severity: "error", confidence: "certain",
          title: "회수가 첫 약속보다 앞서 있어요",
          question: "첫 약속과 회수 회차 중 어느 쪽이 잘못 연결됐나요?",
        }));
        break;
      case "OVERDUE":
        findings.push(createPlausibilityFinding(ctx, {
          ...base, severity: "warning", confidence: "certain",
          title: "회수 마감이 지났어요",
          question: "이 약속은 언제 거둘까요? 마감을 늘리거나 의도적 미회수로 기록할 수 있어요.",
        }));
        break;
      case "FORESHADOW_BEFORE_SEED":
      case "FORESHADOW_AFTER_PAYOFF":
        findings.push(createPlausibilityFinding(ctx, {
          ...base, severity: "warning", confidence: "certain",
          title: "단서의 위치가 약속 순서와 맞지 않아요",
          question: "이 단서는 첫 약속과 회수 사이에 놓여야 하지 않나요?",
        }));
        break;
      case "MISSING_PAYOFF":
        findings.push(createPlausibilityFinding(ctx, {
          ...base, severity: "warning", confidence: "certain",
          title: "회수했다고 했는데 회수 위치가 없어요",
          question: "회수한 회차와 컷을 연결해 주세요.",
        }));
        break;
      case "MISSING_SEED":
      case "MISSING_FORESHADOW":
      case "MISSING_INTENTIONAL_REASON":
      case "DUE_NOW":
      case "DUE_SOON":
        findings.push(createPlausibilityFinding(ctx, {
          ...base, severity: "suggestion", confidence: "certain",
          title: warning.code === "DUE_NOW" || warning.code === "DUE_SOON" ? "회수 마감이 다가왔어요" : "약속 기록이 덜 채워져 있어요",
          question: warning.code === "DUE_NOW" || warning.code === "DUE_SOON"
            ? "이번 회차에서 이 약속을 거둘 수 있나요?"
            : "빠진 연결이나 이유를 채워 둘까요?",
        }));
        break;
      default:
        break;
    }
  }
  return findings;
}

export interface PlausibilityTimelineInput {
  readonly candidates: readonly ContinuityTimelineCandidate[];
  readonly episodes: readonly PlausibilityEpisodeRef[];
  /** 시간 태그가 기록된 회차 수. 0이면 "기록 없음"으로 표시한다. */
  readonly recordedCount: number;
}

export function adaptEpisodeTimeline(
  ctx: PlausibilityContext,
  input: PlausibilityTimelineInput,
): readonly PlausibilityFinding[] {
  const episodeById = new Map(input.episodes.map((episode) => [episode.episodeId, episode]));
  const findings: PlausibilityFinding[] = [];
  for (const candidate of input.candidates) {
    const episodes = candidate.episodeIds.map((id) => episodeById.get(id));
    const sceneIds = episodes.flatMap((episode) => episodeScenes(ctx, episode?.episodeNumber));
    const evidence: PlausibilityEvidence[] = candidate.episodeIds.map((id, index) => {
      const episode = episodes[index];
      return { kind: "episode", id, label: episode ? `${episode.episodeNumber}화 ${episode.title}` : id };
    });
    const common = {
      source: { module: "episode-timeline" as const, code: candidate.code, originalId: candidate.id },
      idParts: [candidate.id],
      category: "time-place" as const,
      message: candidate.messageKo,
      evidence,
      options: [optionInfo("timeline", "회차 시간 태그 확인", "회차의 이야기 일차와 장소 태그를 확인합니다. 회상이나 병행 장면이면 의도로 기록하세요.")],
      sceneIds,
    };
    if (candidate.code === "invalid-range") {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, severity: "error", confidence: "certain",
        title: "회차 시간 태그가 스스로 어긋나요",
        question: "시작과 끝 일차가 바뀌어 적혔나요?",
      }));
    } else if (candidate.code === "time-regression") {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, severity: "warning", confidence: "certain",
        title: "회차의 이야기 시간이 앞 회차보다 앞서요",
        question: "회상이나 과거 회차인가요? 그렇다면 의도된 설정으로 기록해 주세요.",
      }));
    } else if (candidate.code === "parallel-place") {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, severity: "suggestion", confidence: "heuristic",
        title: "시간이 겹치는 두 회차의 장소가 달라요",
        question: "두 장면이 같은 시간에 다른 곳에서 벌어지는 게 맞나요?",
      }));
    } else {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, severity: "suggestion", confidence: "heuristic",
        title: "두 회차의 이야기 시간이 겹쳐요",
        question: "같은 시간대를 다른 시점으로 보여 주는 병행 구성인가요?",
      }));
    }
  }
  return findings;
}

// ── 설정 검증 · 고유명사 검사 ──────────────────────────────────────────

const LORE_ISSUE_TEXT: Readonly<Record<string, { readonly title: string; readonly question: string }>> = {
  "lore-name-collision": { title: "설정 이름이 서로 겹쳐요", question: "겹친 이름 중 어느 쪽이 정본인가요?" },
  "lore-id": { title: "설정 항목의 id가 비었거나 겹쳐요", question: "항목 id를 고쳐야 해요." },
  "lore-name-empty": { title: "이름 없는 설정 항목이 있어요", question: "이름을 적거나 항목을 지워 주세요." },
  "lore-version-invalid": { title: "설정 항목의 버전이 올바르지 않아요", question: "버전 번호를 확인해 주세요." },
  "lore-relation-reference": { title: "없는 설정으로 이어진 연결이 있어요", question: "연결을 지우거나 대상 설정을 만들어 주세요." },
  "lore-character-reference": { title: "없는 인물로 이어진 설정이 있어요", question: "연결을 지우거나 인물을 만들어 주세요." },
  "lore-retired-link": { title: "폐기된 설정과 아직 이어져 있어요", question: "연결을 새 설정으로 옮겨야 하나요?" },
  "lore-event-undated": { title: "시기가 없는 사건이 있어요", question: "사건이 언제 일어났는지 연표에 적어 둘까요?" },
};

const isLoreKind = (value: string): value is StudioLoreEntryKind => Object.prototype.hasOwnProperty.call(STUDIO_LORE_KIND_LABELS, value);

/** 설정 검증이 영문으로 적은 소유자 표기(`place "기억 시장"`)를 작가의 말(`장소 ‘기억 시장’`)로 바꾼다. */
function loreOwner(raw: string): { readonly text: string; readonly name: string } {
  const match = /^([a-z]+) "(.*)"$/u.exec(raw.trim());
  if (!match) return { text: raw, name: raw };
  const kind = match[1] ?? "";
  const name = match[2] ?? "";
  if (kind === "character") return { text: `인물 ‘${name}’`, name };
  return isLoreKind(kind) ? { text: `${STUDIO_LORE_KIND_LABELS[kind].ko} ‘${name}’`, name } : { text: raw, name: raw };
}

export function adaptLoreIssues(
  ctx: PlausibilityContext,
  issues: readonly StudioWorldLoreIssue[],
  entryNames: Readonly<Record<string, string>> = {},
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const nameOf = (id: string): string => entryNames[id] ?? id;
  for (const issue of issues) {
    const text = LORE_ISSUE_TEXT[issue.code];
    if (!text) continue;
    const collision = issue.code === "lore-name-collision"
      ? /The name "(.+)" is used by both (.+) and (.+)\./u.exec(issue.message)
      : null;
    const first = loreOwner(collision?.[2] ?? "");
    const second = loreOwner(collision?.[3] ?? "");
    const message = collision
      ? `이름 ‘${collision[1]}’${josa(collision[1] ?? "", "이", "가")} ${first.text}${josa(first.name, "과", "와")} ${second.text}에 함께 쓰이고 있어요.`
      : `${text.title}. (${issue.affectedIds.slice(0, 3).map(nameOf).join(", ") || issue.code})`;
    findings.push(createPlausibilityFinding(ctx, {
      source: { module: "lore", code: issue.code, originalId: `${issue.code}:${issue.affectedIds.join("+")}` },
      idParts: [issue.code, issue.message, ...issue.affectedIds],
      category: "setting-rules",
      ...(issue.code === "lore-event-undated"
        ? { severity: "suggestion" as const, confidence: "certain" as const }
        : issue.severity === "error"
          ? { severity: "error" as const, confidence: "certain" as const }
          : { severity: "warning" as const, confidence: "certain" as const }),
      title: text.title,
      message,
      question: text.question,
      evidence: issue.affectedIds.slice(0, 4).map((id) => ({ kind: "note" as const, id, label: `설정 항목: ${nameOf(id)}` })),
      options: [optionInfo("lore", "세계관 설정에서 고치기", "세계관 설정 항목을 열어 이름과 연결을 정리합니다.")],
      sceneIds: [],
    }));
  }
  return findings;
}

export interface PlausibilityNameCheckBatch {
  readonly sceneId: string;
  /** 점검한 장면 원문. 근거 인용을 만들 때만 쓰고 리포트에 통째로 담지 않는다. */
  readonly text: string;
  readonly findings: readonly LoreNameFinding[];
}

function quoteAround(text: string, start: number, end: number): { text: string; highlightStart: number; highlightEnd: number } {
  const chars = Array.from(text);
  const prefixChars = Array.from(text.slice(0, start)).length;
  const foundChars = Array.from(text.slice(start, end)).length;
  const from = Math.max(0, prefixChars - 24);
  const to = Math.min(chars.length, prefixChars + foundChars + 24);
  const lead = from > 0 ? "…" : "";
  const tail = to < chars.length ? "…" : "";
  const snippet = chars.slice(from, to).join("");
  const highlightStart = lead.length + (prefixChars - from);
  return {
    text: `${lead}${snippet}${tail}`,
    highlightStart,
    highlightEnd: highlightStart + foundChars,
  };
}

const NAME_CHECK_PER_REPORT_LIMIT = 40;

/** 이름 표기 발견은 경고(표기 흔들림) → 혼용 → 미등록 후보 순으로 먼저 담아, 상한이 걸려도 중요한 것이 남는다. */
const NAME_CHECK_PRIORITY: Readonly<Record<string, number>> = { "name-variant": 0, "name-alias-mix": 1, "unregistered-name": 2 };

export function adaptNameChecks(
  ctx: PlausibilityContext,
  batches: readonly PlausibilityNameCheckBatch[],
): readonly PlausibilityFinding[] {
  const findings: PlausibilityFinding[] = [];
  const ordered = batches
    .flatMap((batch) => batch.findings.map((found) => ({ batch, found })))
    .sort((a, b) => (NAME_CHECK_PRIORITY[a.found.code] ?? 3) - (NAME_CHECK_PRIORITY[b.found.code] ?? 3));
  for (const { batch, found } of ordered.slice(0, NAME_CHECK_PER_REPORT_LIMIT)) {
    const quote = quoteAround(batch.text, found.start, found.end);
    const evidence: PlausibilityEvidence[] = [{
      kind: "scene",
      id: batch.sceneId,
      label: ctx.sceneTitle(batch.sceneId),
      sceneId: batch.sceneId,
      quote,
    }];
    const common = {
      source: { module: "name-check" as const, code: found.code, originalId: found.id },
      idParts: [found.code, batch.sceneId, found.found, found.start],
      message: found.message,
      evidence,
      options: [
        ...(found.suggestion
          ? [optionCopyAdvice(`name:${batch.sceneId}:${found.start}`, "정본 표기 복사", found.suggestion)]
          : []),
        optionInfo("name-check", "원고에서 표기 확인", "원고에서 해당 표기를 찾아 같은 대상이면 정본 표기로 통일합니다."),
      ],
      sceneIds: [batch.sceneId],
    };
    if (found.code === "name-variant") {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, category: "character-consistency", severity: "warning", confidence: "heuristic",
        title: "이름 표기가 달라 보여요",
        question: `‘${found.found}’${josa(found.found, "은", "는")} 같은 대상인가요? 같다면 표기를 통일해야 해요.`,
      }));
    } else if (found.code === "name-alias-mix") {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, category: "character-consistency", severity: "suggestion", confidence: "heuristic",
        title: "정본 이름과 별칭이 함께 쓰여요",
        question: "한 글 안에서는 하나로 통일하는 편이 좋아요. 의도한 호칭인가요?",
      }));
    } else {
      findings.push(createPlausibilityFinding(ctx, {
        ...common, category: "setting-rules", severity: "suggestion", confidence: "heuristic",
        title: "등록되지 않은 이름 후보가 있어요",
        question: "고유명사라면 설정에 등록할까요?",
      }));
    }
  }
  return findings;
}
