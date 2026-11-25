interface MacroDocumentHeaderInput {
  readonly macroId?: unknown;
  readonly descriptionKo?: unknown;
  readonly createdAtIso?: unknown;
}

/** 단계 체크섬에 포함되지 않는 필수 헤더도 런타임에서 검사한다. */
export function validateMacroDocumentHeader(header: MacroDocumentHeaderInput): string[] {
  const errors: string[] = [];
  if (typeof header.macroId !== "string" || header.macroId.trim().length === 0) {
    errors.push("매크로 식별자(macroId)는 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof header.descriptionKo !== "string" || header.descriptionKo.trim().length === 0) {
    errors.push("매크로 설명(descriptionKo)은 비어 있지 않은 문자열이어야 합니다.");
  }
  if (typeof header.createdAtIso !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(header.createdAtIso)
    || !Number.isFinite(Date.parse(header.createdAtIso))) {
    errors.push("생성 시각(createdAtIso)은 유효한 ISO 날짜·시간 문자열이어야 합니다.");
  }
  return errors;
}
