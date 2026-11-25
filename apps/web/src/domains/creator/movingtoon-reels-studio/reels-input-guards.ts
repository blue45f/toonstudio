import type { SubtitleCueInput, SubtitleExportOptions, SubtitleTimingIssue } from "./reels-audio-beat-master";

/** 잘못된 숫자를 보정 완료로 숨기거나 무한 반복에 넘기지 않는다. */
export function requireFinite(value: number, label: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}: 유한한 ${min}~${max} 값이 필요합니다.`);
}

/** 예제 계산의 메모리 사용량에 상한을 둔다. 실제 미디어 처리 용량을 뜻하지 않는다. */
export function requireSampleBudget(count: number): void {
  requireFinite(count, "예제 표본 수", 0, 100000);
}

/** 지원하지 않는 블록·마크업은 원문을 고치지 않고 명시적으로 거부한다. */
export function subtitleContentIssues(cues: readonly SubtitleCueInput[], options?: SubtitleExportOptions): SubtitleTimingIssue[] {
  const issues: SubtitleTimingIssue[] = [];
  const seen = new Set<string>();
  const hasControl = (text: string): boolean => Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
  const unsafeBody = (text: string): boolean => text.split(/\r\n|\r|\n/).some((line) => !line.trim()) || /-->|[<>]|&[\w#]+;/.test(text) || hasControl(text);
  const addIssue = (cueId: string): void => {
    issues.push({ cueId, kind: "unsupported-content", messageKo: `${cueId}: 지원하지 않는 자막 블록·식별자·문자가 있어 생성을 중단했습니다. 원문은 유지됩니다.`, messageEn: `${cueId}: Unsupported subtitle block, identifier, or text. Source is unchanged.` });
  };
  for (const cue of cues) {
    if (!cue.id.trim() || hasControl(cue.id) || /[\r\n]|-->|^(?:NOTE(?:[ \t].*)?|STYLE|REGION)$/.test(cue.id) || seen.has(cue.id) || unsafeBody(cue.text) || (options?.includeSpeakerLabel && cue.speaker && (/[\r\n<>]|-->|&[\w#]+;/.test(cue.speaker) || hasControl(cue.speaker)))) addIssue(cue.id);
    seen.add(cue.id);
  }
  if ((options?.title && (/[\r\n]|-->/.test(options.title) || hasControl(options.title))) || (options?.safeZoneLinePct !== undefined && !Number.isFinite(options.safeZoneLinePct))) addIssue("header");
  return issues;
}
