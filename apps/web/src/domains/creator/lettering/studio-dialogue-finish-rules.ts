/**
 * 최종 원고 검사(studio-finish-quality)의 대사 텍스트 판정 규칙 — 치환되지 않은 임시 문구 패턴과
 * 복사·붙여넣기로 섞여 든 보이지 않는 제어 문자 판정을 한곳에 둔다.
 */

export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\{\{[^{}]+\}\}/u,
  /\$\{[^{}]+\}/u,
  /%(?:[A-Z][A-Z0-9_]*|\d+\$?[a-z])%/iu,
  /\b(?:TODO|TBD|FIXME|LOREM\s+IPSUM)\b/iu,
  /(?:대사|텍스트|문구)\s*(?:입력|예정|작성)/u,
];

export function hasControlCharacter(text: string): boolean {
  return Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}
