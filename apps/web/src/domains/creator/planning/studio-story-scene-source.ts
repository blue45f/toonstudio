/** 번호가 있는 장면 제목과 영화 대본의 내·외부 헤딩만 일반 산문과 구분한다. */
const NUMBERED_HEADING = /^(?:S#\s*|#\s*|(?:씬|장면|SCENE)\s*#?\s*)(\d{1,4})(?=$|[\s.):：\-–—])\s*[.):：\-–—]?\s*(.*)$/iu;
const SCREEN_HEADING = /^(?:INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s+(.+)$/iu;

export function matchNamedStudioScene(line: string) {
  const heading = line.trim();
  if (!heading || heading.length > 240) return null;
  const numbered = NUMBERED_HEADING.exec(heading);
  if (numbered) return { heading, number: Number(numbered[1]), location: numbered[2]?.trim() || undefined };
  const screenplay = SCREEN_HEADING.exec(heading);
  return screenplay ? { heading, number: null, location: screenplay[1]?.trim() } : null;
}

export function readStudioStorySceneSources(body: string) {
  const source = body.replace(/\r\n?/gu, "\n");
  const headings: { heading: string; number: number | null; start: number; end: number }[] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    const parsed = matchNamedStudioScene(line);
    if (parsed) headings.push({ heading: parsed.heading, number: parsed.number, start: offset + line.indexOf(parsed.heading), end: offset + line.indexOf(parsed.heading) + parsed.heading.length });
    offset += line.length + 1;
  }
  const unheaded = headings[0] ? source.slice(0, headings[0].start) : source;
  const paragraphs = unheaded.split(/\n\s*\n+/gu).map(text => text.trim()).filter(Boolean);
  return {
    headings,
    scenes: [
      ...paragraphs.map(text => ({ heading: null, text })),
      ...headings.map((scene, index) => ({ heading: scene.heading, text: source.slice(scene.end, headings[index + 1]?.start).trim() })),
    ],
  };
}
