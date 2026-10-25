/**
 * studio-settings-handover.ts — 샘플·템플릿 설정 이관 (순수 모듈, fetch 없음).
 *
 * 템플릿·샘플 시작 시 넘기는 것은 칸·레이어·비트 구조뿐이고 작품 설정
 * (바이블·화풍·줄거리)은 이관하지 않았다. 이 모듈은 시작 시 설정을
 * 함께 가져오는 규칙과 계보 기록만 담당한다. 원본 설정을 바꾸지 않고
 * 사본으로 넘기며, 이관한 필드 목록을 계보에 남겨 나중에 차이를
 * 추적할 수 있게 한다.
 */

export interface StudioSettingsSource {
  readonly workId: string;
  readonly bibleSummary: string | null;
  readonly styleDnaProfileId: string | null;
  readonly palette: readonly string[];
  readonly synopsis: string | null;
}

export interface StudioSettingsHandover {
  readonly fromWorkId: string;
  readonly toWorkId: string;
  readonly bibleSummary: string | null;
  readonly styleDnaProfileId: string | null;
  readonly palette: readonly string[];
  readonly synopsis: string | null;
  readonly copiedFields: readonly string[];
  readonly copiedAt: number;
}

/** 원본 설정을 새 작품용 사본으로 이관하고 계보를 남긴다. */
export function copySettingsToNewWork(input: {
  readonly source: StudioSettingsSource;
  readonly toWorkId: string;
  readonly includeBible: boolean;
  readonly includeStyle: boolean;
  readonly includeSynopsis: boolean;
  readonly now?: number;
}): StudioSettingsHandover | null {
  if (!input.toWorkId.trim()) return null;
  const copiedFields: string[] = [];
  const bibleSummary = input.includeBible ? input.source.bibleSummary : null;
  if (input.includeBible && bibleSummary) copiedFields.push("bible");
  const styleDnaProfileId = input.includeStyle
    ? input.source.styleDnaProfileId
    : null;
  if (input.includeStyle && styleDnaProfileId) copiedFields.push("styleDna");
  const palette = input.includeStyle
    ? Object.freeze([...input.source.palette])
    : Object.freeze([]);
  if (input.includeStyle && palette.length > 0) copiedFields.push("palette");
  const synopsis = input.includeSynopsis ? input.source.synopsis : null;
  if (input.includeSynopsis && synopsis) copiedFields.push("synopsis");
  return {
    fromWorkId: input.source.workId,
    toWorkId: input.toWorkId,
    bibleSummary,
    styleDnaProfileId,
    palette,
    synopsis,
    copiedFields: Object.freeze(copiedFields),
    copiedAt: input.now ?? Date.now(),
  };
}
