/**
 * 화면 위쪽에 한꺼번에 쌓이는 안내의 우선순위.
 *
 * 첫 방문 휴대폰에서는 미니 투어 카드(약 170px)·환영 배너·NPC 카드가 화면 높이의 43%를 덮어 정작 내 캐릭터가
 * 카드에 가까이 붙어 보였다. 투어가 열려 있는 동안에는 환영 배너를 접는다(배너는 자기 타이머로 사라지므로
 * 투어가 길어지면 환영 배너는 건너뛴다 — 투어가 곧 환영 안내다). 데스크톱은 칸이 넓어 둘 다 보인다.
 */
export function spaceHudShowsEventBanner(input: { readonly desktop: boolean; readonly coachOpen: boolean }): boolean {
  return input.desktop || !input.coachOpen;
}

/**
 * 가벼운 말풍선 입력("Enter 채팅하기" 힌트)을 열 수 없는 상황.
 * - 대화·패널 같은 다른 표면이 열려 있을 때.
 * - 채팅 패널이 이미 열려 있을 때: 입력이 둘 겹치고, 힌트는 같은 입구를 한 번 더 보여 주는 것뿐이다.
 * - 좁은 화면(터치 배치): 같은 자리에 "말 걸기" 버튼이 있어 힌트가 그 밑에 가려진다(실측 390·820 폭 모두 겹침, 눌림은 말 걸기 버튼이 받는다).
 *   보이지 않는데 탭 순서에만 남는 버튼을 없애고, Enter는 채팅 패널을 연다.
 */
export function spaceHudChatHintBlocked(input: {
  readonly surfaceOpen: boolean;
  readonly chatPanelOpen: boolean;
  readonly touch: boolean;
}): boolean {
  return input.surfaceOpen || input.chatPanelOpen || input.touch;
}
