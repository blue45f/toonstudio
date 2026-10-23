/**
 * reducer가 거부한 명령의 오류. `recipe-reducer.ts`와 v3 커스터마이즈 reducer(`customize-reducer.ts`)가 같이 쓰므로 따로 둔다
 * (2026-10-23 CORE-1, 순환 import 방지). 기존 경로(`recipe-reducer.ts`)에서도 다시 내보낸다.
 */

/** reducer가 거부한 명령. `code`는 kebab-case, `message`는 사용자에게 보여줄 한글 사유다. */
export class RecipeCommandError extends Error {
  readonly code: string;

  constructor(code: string, reasonKo: string) {
    super(reasonKo);
    this.name = "RecipeCommandError";
    this.code = code;
  }
}
