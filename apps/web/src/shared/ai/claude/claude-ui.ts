/** Claude 어시스트 화면이 함께 쓰는 입력·버튼 스타일(통합 AI 설정과 같은 토큰). */
export const CLAUDE_INPUT =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// 버튼 변형은 색·여백 클래스가 서로 겹치지 않도록 공통 뼈대에 색을 두지 않는다. 겹치면(예: 기본 버튼의 hover:bg-raised가 주 버튼의
// hover:bg-accent/90을 이긴다) 마우스를 올리는 순간 글자색은 그대로인데 배경만 바뀌어 읽을 수 없게 된다.
const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

export const CLAUDE_BUTTON = `${BUTTON_BASE} border-line px-4 py-2 text-fg hover:bg-raised`;

export const CLAUDE_PRIMARY_BUTTON = `${BUTTON_BASE} border-accent bg-accent px-4 py-2 text-on-accent hover:bg-accent/90`;

export const CLAUDE_QUIET_BUTTON = `${BUTTON_BASE} border-transparent px-3 py-2 text-fg-2 hover:border-line hover:bg-raised`;

export const CLAUDE_CARD = "rounded-2xl border border-line bg-panel/70 p-4 sm:p-5";
