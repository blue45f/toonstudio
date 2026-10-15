/**
 * 개연성 점검 화면이 쓰는 이름표와 브라우저 도우미(컴포넌트가 아닌 것들).
 */
import type { PlausibilityEvidenceKind, PlausibilitySourceModule } from "./studio-story-plausibility-types";

export const PLAUSIBILITY_SOURCE_LABELS: Readonly<Record<PlausibilitySourceModule, string>> = {
  causality: "인과 점검",
  continuity: "설정·연속성 검사",
  "foreshadow-ledger": "복선 장부",
  "promise-ledger": "약속·회수 장부",
  "episode-timeline": "회차 시간 태그",
  lore: "세계관 설정 검증",
  "name-check": "이름 표기 검사",
  plausibility: "개연성 규칙",
};

export const PLAUSIBILITY_EVIDENCE_KIND_LABELS: Readonly<Record<PlausibilityEvidenceKind, string>> = {
  scene: "장면",
  episode: "회차",
  fact: "설정",
  character: "인물",
  location: "장소",
  setup: "복선",
  ledger: "장부",
  note: "메모",
};

/** "10월 15일 오전 9:30" 처럼 사람이 읽는 점검 시각. 읽을 수 없으면 원문을 그대로 돌려준다. */
export function formatCheckedAt(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(time));
}

/** 텍스트를 파일로 내려받는다. 브라우저가 막으면 false. */
export function downloadTextFile(filename: string, mime: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** 클립보드에 복사한다. 막히면 false를 돌려주고, 부르는 쪽이 직접 복사할 글을 보여 준다. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
