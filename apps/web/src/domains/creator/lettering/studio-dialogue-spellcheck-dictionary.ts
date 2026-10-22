/**
 * Studio Dialogue Spellcheck — 자주 틀리는 표기 사전(규칙 1 데이터).
 *
 * `studio-dialogue-spellcheck.ts`의 검사 본체에서 분리한 순수 데이터 계층이다.
 * 정밀도 우선으로 고른 항목만 둔다 — 항목 추가·수정은 이 파일에서만 한다.
 */

import type { DialogueSpellSeverity } from "./studio-dialogue-spellcheck";

import { MISSPELLING_ENTRIES_A } from "./studio-dialogue-spellcheck-dictionary-a";
import { MISSPELLING_ENTRIES_B } from "./studio-dialogue-spellcheck-dictionary-b";

// ── 규칙 1: 자주 틀리는 표기 사전 ──────────────────────────────────────────
// 정밀도 우선으로 고른 항목만 둔다. 문맥 판단이 필요한 쌍(안/않·던지/든지·
// 로서/로써·이/히 부사 전반)은 넣지 않았다 — 거짓 지적이 쌓이면 검사가 버려진다.

export interface MisspellingEntry {
  readonly pattern: RegExp;
  /** 매치 구간을 이 문자열로 바꾸는 후보. $1 같은 캡처 참조를 쓸 수 있다. */
  readonly replacement: string;
  readonly message: string;
  readonly severity: DialogueSpellSeverity;
}


export const MISSPELLINGS: readonly MisspellingEntry[] = [
  ...MISSPELLING_ENTRIES_A,
  ...MISSPELLING_ENTRIES_B,
];
