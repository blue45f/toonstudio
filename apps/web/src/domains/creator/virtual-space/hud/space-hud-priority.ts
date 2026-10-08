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
