/** 실시간 협업 참여자 표시 이름 정규화 리프 모듈. */
export const STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH = 80;

function sanitizeDisplayNamePart(value: unknown): string {
  if (typeof value !== "string") return "";
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitized += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  return sanitized.replace(/\s+/gu, " ").trim();
}

function truncateWithoutSplittingSurrogate(value: string, maximumCodeUnits: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maximumCodeUnits) break;
    result += character;
  }
  return result.trim();
}

/** Safely adapts profile copy to the stricter ephemeral participant-name contract. */
export function studioLiveDisplayName(
  value: unknown,
  options: { suffix?: string; fallback?: string } = {}
): string {
  const suffix = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(options.suffix),
    STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH
  );
  const separator = suffix ? " " : "";
  const maximumBaseLength =
    STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH - suffix.length - separator.length;
  const preferred = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(value),
    maximumBaseLength
  );
  const fallback = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(options.fallback) || "팀원",
    maximumBaseLength
  );
  const base = preferred || fallback;
  if (base) return `${base}${separator}${suffix}`;
  return suffix || "팀원";
}
