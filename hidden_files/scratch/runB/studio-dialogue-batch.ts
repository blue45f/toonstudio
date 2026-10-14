// Harness stub — main 실물 studio-dialogue-batch.ts에서 spellcheck가 쓰는
// dialogueExcerpt 구현과 DialogueBatchItem 타입만 그대로 옮긴 것(검증 전용).
export type DialogueBatchItem = {
  id: string;
  pageId: string;
  pageIndex: number;
  elType: "bubble" | "text";
  variant?: string;
  text: string;
  hidden: boolean;
  locked: boolean;
};

export function dialogueExcerpt(text: string, max = 24): string {
  const oneLine = text.replace(/\s*\n+\s*/g, " / ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
