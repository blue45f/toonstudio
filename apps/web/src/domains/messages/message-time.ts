/** 메시지군 시간 표기 — 목록 미리보기와 대화 본문이 같은 문법을 쓰도록 한곳에 모은다. */

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("ko-KR", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

export function messageDayKey(value: string): string {
  return new Date(value).toDateString();
}

/** 날짜 구분선 라벨: 오늘·어제는 상대 표기, 그 외는 날짜+요일. */
export function messageDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "오늘";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "어제";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
