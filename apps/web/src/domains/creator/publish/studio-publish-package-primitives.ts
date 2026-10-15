/**
 * 게시 패키지 planner(`studio-publish-package.ts`)가 쓰는 순수 입력 정리 함수.
 *
 * planner에서 동작 변경 없이 그대로 옮겼다. planner가 파일 크기 래칫 천장에 닿아 있어, 새 필드를
 * 더하려면 같은 변경 안에서 줄어들어야 했기 때문이다. 부수효과·의존성이 없는 leaf 모듈이라
 * planner와 순환하지 않는다.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUnsafeCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      continue;
    }
    output += character;
  }
  return output;
}

/** 제어·양방향 서식 문자를 제거하고 NFKC 정규화·공백 정리·길이 제한을 적용한 문자열. */
export function normalizeText(value: unknown, maxCodeUnits: number): string {
  if (typeof value !== "string") return "";
  return stripUnsafeCharacters(value).normalize("NFKC").trim().slice(0, maxCodeUnits);
}
