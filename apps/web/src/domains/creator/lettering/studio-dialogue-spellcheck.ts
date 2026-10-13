/**
 * Studio Dialogue Spellcheck — 대사 맞춤법·띄어쓰기 1차 검사(순수 코어, 초안).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * `studio-dialogue-batch.ts`는 배치된 대사를 읽기 순서로 수집하는 일까지 책임지고,
 * `studio-finish-quality.ts`는 내보내기 게이트에서 문서 전체를 판정한다. 그 사이에
 * "대사를 읽고 오탈자를 의심하는" 단계가 없었다 — 실무에서 가장 흔한 반려 사유가
 * 대사 오탈자인데 자동 검사가 전무했다(전 공정 완결성 감사 후보 1).
 *
 * 이 모듈이 추가하는 것:
 *  · 수집된 대사 목록(DialogueBatchItem[]) 위에 얹는 로컬 규칙 기반 검사.
 *    외부 API·네트워크·유료 사전 없이, 정밀도가 확인된 패턴만으로 판정한다.
 *  · 결과는 "의심" 목록이다. 자동 수정은 하지 않는다 — fix는 고치기 후보(스팬+교체안)를
 *    제시만 하고, 적용 여부는 사람이 패널에서 결정한다(대사는 사투리·의성어·캐릭터
 *    말투처럼 "일부러 틀린" 표기가 정상인 영역이다).
 *  · 요약(summary)은 QC 체크리스트(production-episode-qc)가 구조적으로 받아
 *    "대사 맞춤법 검사" 항목으로 합류시킬 수 있는 형태(errorCount/warningCount)를 제공한다.
 *
 * 정직성 규칙:
 *  · 이 검사는 맞춤법 검사기가 아니다. 형태소 분석을 하지 않으므로 조사·어미의
 *    문맥 판단(안/않, 이/가, 로서/로써, 던지/든지 등)은 다루지 않는다 — 다루는 척
 *    거짓 양성(precision 낮은 지적)을 내는 것보다 비워 두는 쪽을 택했다.
 *  · 모든 지적 문구는 "의심"으로 표현한다. 확신이 없는 규칙은 severity를 낮춘다.
 *  · 잠긴 대사도 검사한다(읽기는 잠금과 무관). 숨김 대사는 기본 제외다.
 *
 * 규칙(studio-dialogue-batch.ts와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다.
 */

import { dialogueExcerpt, type DialogueBatchItem } from "./studio-dialogue-batch";

// ── 데이터 모델 ─────────────────────────────────────────────────────────────

export type DialogueSpellSeverity = "error" | "warning" | "info";

export type DialogueSpellRuleId =
  | "empty-dialogue"
  | "common-misspelling"
  | "spacing-dependent-noun"
  | "space-before-punctuation"
  | "double-space"
  | "missing-space-after-sentence"
  | "excess-blank-lines"
  | "edge-space"
  | "duplicate-dialogue"
  | "repeated-word"
  | "bubble-too-long"
  | "bubble-line-too-long"
  | "many-sentences"
  | "repeated-punctuation";

/** 고치기 후보 — 원문 text 안의 [start, end) 구간을 replacement로 바꾸면 되는 형태.
 *  v1 패널은 이 후보를 보여 주기만 하고 자동 적용하지 않는다. */
export interface DialogueSpellFix {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

export interface DialogueSpellFinding {
  readonly id: string;
  /** DialogueBatchItem.id */
  readonly itemId: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  readonly ruleId: DialogueSpellRuleId;
  readonly severity: DialogueSpellSeverity;
  /** 사용자에게 보여 줄 한 줄 설명 — 전부 "의심" 어조. */
  readonly message: string;
  /** 대사 한 줄 미리보기(패널 행 식별용). */
  readonly excerpt: string;
  /** 지적한 원문 구간. 대사 전체를 가리키는 규칙(빈 대사·길이 등)이면 없음. */
  readonly matchText?: string;
  readonly fix?: DialogueSpellFix;
}

export interface DialogueSpellcheckOptions {
  /** 숨김 대사도 검사(기본 false — 화면에 안 보이는 대사는 게시물에 없다). */
  readonly includeHidden?: boolean;
  /** 말풍선 대사 글자 수(공백·개행 제외) 경고 기준. 기본 60. */
  readonly maxBubbleChars?: number;
  /** 말풍선 한 줄 글자 수 경고 기준. 기본 20. */
  readonly maxBubbleLineChars?: number;
  /** 텍스트 요소 글자 수 참고 기준. 기본 140. */
  readonly maxTextChars?: number;
  /** 끄는 규칙. 말투·연출상 의도된 표기가 많은 작품에서 규칙 단위로 끌 수 있게 한다. */
  readonly disabledRules?: readonly DialogueSpellRuleId[];
}

/** QC 체크리스트 합류용 요약 — production-episode-qc의 extras 입력과 구조가 같다. */
export interface DialogueSpellcheckSummary {
  readonly totalItemCount: number;
  readonly checkedItemCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly findingCount: number;
  readonly byRule: Readonly<Partial<Record<DialogueSpellRuleId, number>>>;
}

// ── 규칙 1: 자주 틀리는 표기 사전 ──────────────────────────────────────────
// 정밀도 우선으로 고른 항목만 둔다. 문맥 판단이 필요한 쌍(안/않·던지/든지·
// 로서/로써·이/히 부사 전반)은 넣지 않았다 — 거짓 지적이 쌓이면 검사가 버려진다.

interface MisspellingEntry {
  readonly pattern: RegExp;
  /** 매치 구간을 이 문자열로 바꾸는 후보. $1 같은 캡처 참조를 쓸 수 있다. */
  readonly replacement: string;
  readonly message: string;
  readonly severity: DialogueSpellSeverity;
}

const MISSPELLINGS: readonly MisspellingEntry[] = [
  {
    pattern: /됬/g,
    replacement: "됐",
    message: "'됬'은 없는 표기예요. '됐'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /됀/g,
    replacement: "된",
    message: "'됀'은 없는 표기예요. '된'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /되요/g,
    replacement: "돼요",
    message: "'되요'는 줄인 말 '돼요'로 써요.",
    severity: "warning",
  },
  {
    pattern: /몇일/g,
    replacement: "며칠",
    message: "'몇일'이 아니라 '며칠'이 표준 표기예요.",
    severity: "warning",
  },
  {
    pattern: /오랫만/g,
    replacement: "오랜만",
    message: "'오랫만'이 아니라 '오랜만'으로 써요.",
    severity: "warning",
  },
  {
    pattern: /금새/g,
    replacement: "금세",
    message: "'금새'는 '금세'의 잘못 알려진 표기예요.",
    severity: "warning",
  },
  {
    pattern: /어의없/g,
    replacement: "어이없",
    message: "'어의없다'가 아니라 '어이없다'예요.",
    severity: "warning",
  },
  {
    pattern: /희안/g,
    replacement: "희한",
    message: "'희안하다'가 아니라 '희한하다'예요.",
    severity: "warning",
  },
  {
    pattern: /설겆이/g,
    replacement: "설거지",
    message: "'설겆이'가 아니라 '설거지'예요.",
    severity: "warning",
  },
  {
    pattern: /깨끗히/g,
    replacement: "깨끗이",
    message: "'깨끗히'가 아니라 '깨끗이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /일일히/g,
    replacement: "일일이",
    message: "'일일히'가 아니라 '일일이'로 써요.",
    severity: "warning",
  },
  {
    pattern: /어떻해/g,
    replacement: "어떡해",
    message: "'어떻해'가 아니라 '어떡해'예요.",
    severity: "warning",
  },
  {
    pattern: /께요/g,
    replacement: "게요",
    message: "약속·의지의 말끝은 '할게요'처럼 '게요'로 써요. (존댓말 조사 '께'와 다릅니다)",
    severity: "warning",
  },
  {
    pattern: /웬지/g,
    replacement: "왠지",
    message: "'웬지'가 아니라 '왠지'예요.",
    severity: "warning",
  },
  {
    pattern: /왠만/g,
    replacement: "웬만",
    message: "'왠만하면'이 아니라 '웬만하면'이에요.",
    severity: "warning",
  },
  {
    pattern: /뭐에요/g,
    replacement: "뭐예요",
    message: "'뭐에요'가 아니라 '뭐예요'예요.",
    severity: "warning",
  },
  {
    pattern: /슴니다/g,
    replacement: "습니다",
    message: "'있슴니다' 같은 표기는 '있습니다'로 써요.",
    severity: "warning",
  },
  {
    pattern: /읍니다/g,
    replacement: "습니다",
    message: "'읍니다'는 옛 표기예요. 지금은 '습니다'로 써요.",
    severity: "info",
  },
  {
    pattern: /바램/g,
    replacement: "바람",
    message: "소망의 뜻이면 '바램'이 아니라 '바람'이 표준이에요.",
    severity: "info",
  },
];

// ── 규칙 2: 띄어쓰기 휴리스틱 ──────────────────────────────────────────────
// 의존명사가 앞말에 붙은 대표 형태만 본다. 조사가 붙는 것은 정상이므로 건드리지 않는다.

interface SpacingEntry {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly message: string;
}

const SPACING_PATTERNS: readonly SpacingEntry[] = [
  {
    pattern: /것같(다|아|요|네|은|고|지)/g,
    replacement: "것 같$1",
    message: "'것 같다'는 의존명사 '것'을 띄어 써요.",
  },
  {
    pattern: /수있(다|어|는|을|고|네)/g,
    replacement: "수 있$1",
    message: "'할 수 있다'처럼 의존명사 '수'를 띄어 써요.",
  },
  {
    pattern: /수없(다|어|는|을|고|네)/g,
    replacement: "수 없$1",
    message: "'할 수 없다'처럼 의존명사 '수'를 띄어 써요.",
  },
];

// ── 내부 유틸 ──────────────────────────────────────────────────────────────

function normalizeForDuplicate(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function countNonSpaceChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

/** 의성어·의태어처럼 같은 글자를 겹쳐 만든 어절인지 — 반복 지적에서 제외한다. */
function looksLikeSoundWord(word: string): boolean {
  if (word.length <= 1) return true;
  const chars = Array.from(word);
  return chars.every((ch) => ch === chars[0]);
}

// ── 검사 본체 ──────────────────────────────────────────────────────────────

/**
 * 수집된 대사 목록을 검사해 의심 목록을 돌려준다.
 * 정렬은 결정적이다: 목록 순서 → 원문 위치 → 규칙 선언 순서.
 */
export function checkDialogueSpelling(
  items: readonly DialogueBatchItem[],
  options: DialogueSpellcheckOptions = {},
): DialogueSpellFinding[] {
  const includeHidden = options.includeHidden ?? false;
  const maxBubbleChars = options.maxBubbleChars ?? 60;
  const maxBubbleLineChars = options.maxBubbleLineChars ?? 20;
  const maxTextChars = options.maxTextChars ?? 140;
  const disabled = new Set(options.disabledRules ?? []);

  const findings: DialogueSpellFinding[] = [];
  const seenTexts = new Map<string, DialogueBatchItem>();

  const push = (
    item: DialogueBatchItem,
    ruleId: DialogueSpellRuleId,
    severity: DialogueSpellSeverity,
    message: string,
    extra?: { matchText?: string; fix?: DialogueSpellFix },
  ) => {
    if (disabled.has(ruleId)) return;
    findings.push({
      id: `${item.id}:${ruleId}:${extra?.fix?.start ?? findings.length}`,
      itemId: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      ruleId,
      severity,
      message,
      excerpt: dialogueExcerpt(item.text),
      ...(extra?.matchText !== undefined ? { matchText: extra.matchText } : {}),
      ...(extra?.fix ? { fix: extra.fix } : {}),
    });
  };

  for (const item of items) {
    if (item.hidden && !includeHidden) continue;
    const text = item.text;

    // 빈 대사 — 최종 검사(studio-finish-quality)의 DIALOGUE_EMPTY와 같은 판정을
    // 식자 단계에서 먼저 보여 주는 것이라 심각도를 맞췄다.
    if (!text.trim()) {
      push(
        item,
        "empty-dialogue",
        item.elType === "bubble" ? "error" : "warning",
        item.elType === "bubble"
          ? "말풍선 내용이 비어 있어요. 의도한 빈 말풍선인지 확인해 주세요."
          : "텍스트 내용이 비어 있어요. 불필요한 요소라면 지워 주세요.",
      );
      continue;
    }

    // 자주 틀리는 표기
    for (const entry of MISSPELLINGS) {
      for (const match of text.matchAll(entry.pattern)) {
        const start = match.index ?? 0;
        push(item, "common-misspelling", entry.severity, entry.message, {
          matchText: match[0],
          fix: {
            start,
            end: start + match[0].length,
            replacement: match[0].replace(entry.pattern, entry.replacement),
          },
        });
      }
    }

    // 띄어쓰기 — 의존명사 붙음
    for (const entry of SPACING_PATTERNS) {
      for (const match of text.matchAll(entry.pattern)) {
        const start = match.index ?? 0;
        push(item, "spacing-dependent-noun", "warning", entry.message, {
          matchText: match[0],
          fix: {
            start,
            end: start + match[0].length,
            replacement: match[0].replace(entry.pattern, entry.replacement),
          },
        });
      }
    }

    // 띄어쓰기 — 문장부호 앞 공백
    for (const match of text.matchAll(/\s+([.,!?…~])/g)) {
      const start = match.index ?? 0;
      push(item, "space-before-punctuation", "warning", "문장부호 앞에는 공백을 두지 않아요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: match[1] ?? "" },
      });
    }

    // 띄어쓰기 — 연속 공백(줄바꿈 제외)
    for (const match of text.matchAll(/ {2,}/g)) {
      const start = match.index ?? 0;
      push(item, "double-space", "info", "공백이 여러 개 이어졌어요. 붙여넣기 흔적일 수 있어요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: " " },
      });
    }

    // 띄어쓰기 — 문장이 붙음(부호 뒤 공백 없음)
    for (const match of text.matchAll(/([.!?…])([가-힣A-Za-z0-9])/g)) {
      const start = match.index ?? 0;
      push(
        item,
        "missing-space-after-sentence",
        "info",
        "문장이 끝난 뒤 공백 없이 다음 문장이 붙어 있어요.",
        {
          matchText: match[0],
          fix: { start, end: start + match[0].length, replacement: `${match[1]} ${match[2]}` },
        },
      );
    }

    // 빈 줄 과다
    for (const match of text.matchAll(/\n{3,}/g)) {
      const start = match.index ?? 0;
      push(item, "excess-blank-lines", "info", "빈 줄이 세 줄 이상 이어졌어요.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: "\n\n" },
      });
    }

    // 앞뒤 공백
    if (text !== text.trim()) {
      push(item, "edge-space", "info", "대사 앞뒤에 공백이 있어요.", {
        fix: { start: 0, end: text.length, replacement: text.trim() },
      });
    }

    // 같은 어절 반복 — 의성어·감탄 반복은 연출일 수 있어 제외하고 본다.
    for (const match of text.matchAll(/(\S+)[ \t]+\1(?=[\s.,!?…~]|$)/g)) {
      const word = match[1] ?? "";
      if (word.length < 2 || looksLikeSoundWord(word)) continue;
      const start = match.index ?? 0;
      push(item, "repeated-word", "warning", `같은 말이 두 번 이어졌어요: "${word}"`, {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: word },
      });
    }

    // 중복 대사 — 짧은 대답("응", "네")의 반복은 자연스러워서 제외한다.
    const normalized = normalizeForDuplicate(text);
    if (normalized.length >= 4) {
      const first = seenTexts.get(normalized);
      if (first) {
        push(
          item,
          "duplicate-dialogue",
          "warning",
          first.pageIndex === item.pageIndex
            ? "이 페이지에 똑같은 대사가 또 있어요. 복사 실수인지 확인해 주세요."
            : `${first.pageIndex + 1}페이지의 대사와 똑같아요. 복사 실수인지 확인해 주세요.`,
        );
      } else {
        seenTexts.set(normalized, item);
      }
    }

    // 말풍선 길이 — 실제 넘침 판정은 최종 검사(BUBBLE_TEXT_OVERFLOW)가 지오메트리로
    // 하고, 여기는 글자 수만으로 "읽기 전에 알아차리는" 경고다.
    const nonSpaceChars = countNonSpaceChars(text);
    if (item.elType === "bubble") {
      if (nonSpaceChars > maxBubbleChars) {
        push(
          item,
          "bubble-too-long",
          "warning",
          `한 말풍선에 대사가 길어요 (${nonSpaceChars}자). 말풍선을 나누면 읽기 쉬워요.`,
        );
      }
      const longestLine = Math.max(...text.split("\n").map((line) => countNonSpaceChars(line)));
      if (longestLine > maxBubbleLineChars) {
        push(
          item,
          "bubble-line-too-long",
          "warning",
          `한 줄이 길어요 (${longestLine}자). 줄바꿈 위치를 조정해 보세요.`,
        );
      }
    } else if (nonSpaceChars > maxTextChars) {
      push(item, "bubble-too-long", "info", `텍스트가 길어요 (${nonSpaceChars}자).`);
    }

    // 문장 수 — 말풍선 하나에 문장이 많으면 독자가 숨을 고르기 어렵다.
    const sentenceCount = text.split(/[.!?…]+/).filter((part) => part.trim().length > 0).length;
    if (item.elType === "bubble" && sentenceCount >= 4) {
      push(
        item,
        "many-sentences",
        "info",
        `한 말풍선에 문장이 ${sentenceCount}개예요. 나누면 호흡이 살아요.`,
      );
    }

    // 구두점 반복 — 만화 연출일 수 있어 참고로만 알린다.
    if (/([!?])\1{2,}|[.]{4,}|~{3,}/.test(text)) {
      push(
        item,
        "repeated-punctuation",
        "info",
        "느낌표·물음표·줄임표가 많이 겹쳤어요. 의도한 연출이면 그대로 두세요.",
      );
    }
  }

  return findings;
}

/** 검사 결과를 QC 합류·패널 요약 표시용으로 집계한다. */
export function summarizeDialogueSpellcheck(
  items: readonly DialogueBatchItem[],
  findings: readonly DialogueSpellFinding[],
  options: DialogueSpellcheckOptions = {},
): DialogueSpellcheckSummary {
  const includeHidden = options.includeHidden ?? false;
  const byRule: Partial<Record<DialogueSpellRuleId, number>> = {};
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
    if (finding.severity === "error") errorCount += 1;
    else if (finding.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }
  return {
    totalItemCount: items.length,
    checkedItemCount: items.filter((item) => includeHidden || !item.hidden).length,
    errorCount,
    warningCount,
    infoCount,
    findingCount: findings.length,
    byRule,
  };
}
