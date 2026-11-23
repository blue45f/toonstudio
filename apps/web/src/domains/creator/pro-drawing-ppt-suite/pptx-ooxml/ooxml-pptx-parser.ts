/**
 * OOXML `.pptx` 바이너리 가져오기 파서 (`parsePptxArchive` / `parsePptxArchiveAsync`).
 * `ppt/slides/slide*.xml`의 제목·부제목·글머리·벡터 도형·표(<a:tbl>)·전환효과 및
 * `ppt/notesSlides/notesSlide*.xml` 발표자 노트를 편집 가능한 `ParsedPptxDeck`으로 복원한다.
 */

import type {
  ParsedPptxDeck,
  PptxShapeKind,
  PptxSlideInput,
  PptxTableModel,
  PptxTransitionKind,
  PptxVectorShape,
} from "./ooxml-pptx-types";
import {
  OOXML_THEMES,
  PPTX_SLIDE_SIZES,
  unescapeXml,
  type OoxmlThemeId,
  type PptxSlideDimensions,
  type PptxSlideSizePreset,
} from "./ooxml-theme-spec";
import {
  decodeUtf8,
  readZipArchive,
  readZipArchiveAsync,
  type ZipArchiveEntry,
} from "./ooxml-zip-codec";

function ooxmlPresetToShapeKind(prst: string): PptxShapeKind | null {
  if (prst === "rect") return "rect";
  if (prst === "roundRect") return "roundRect";
  if (prst === "ellipse") return "ellipse";
  if (prst === "rightArrow" || prst === "leftArrow" || prst === "upArrow" || prst === "downArrow") {
    return "arrow";
  }
  return null;
}

function extractTagTexts(xml: string, tagName: string): readonly string[] {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "g");
  const results: string[] = [];
  for (const match of xml.matchAll(regex)) {
    results.push(unescapeXml(match[1]));
  }
  return results;
}

function extractParagraphTexts(xmlFragment: string): readonly string[] {
  const pRegex = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g;
  const paragraphs: string[] = [];
  for (const match of xmlFragment.matchAll(pRegex)) {
    const joined = extractTagTexts(match[1], "a:t").join("");
    if (joined.trim().length > 0) {
      paragraphs.push(joined);
    }
  }
  return paragraphs;
}

function detectSlideSizeFromPresentationXml(xml: string | undefined): PptxSlideSizePreset {
  if (!xml) return "16:9";
  const match = xml.match(/<p:sldSz\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!match) return "16:9";
  const cx = Number.parseInt(match[1], 10);
  const cy = Number.parseInt(match[2], 10);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || cy === 0) return "16:9";
  const ratio = cx / cy;
  if (Math.abs(ratio - 4 / 3) < 0.06) return "4:3";
  if (Math.abs(ratio - 297 / 210) < 0.06) return "a4";
  return "16:9";
}

function detectThemeFromXml(xml: string | undefined): OoxmlThemeId {
  if (!xml) return "atelier-ink";
  const match = xml.match(/<a:clrScheme\s[^>]*name="([^"]+)"/);
  const name = match?.[1];
  const matched = OOXML_THEMES.find((theme) => theme.id === name);
  return matched ? matched.id : "atelier-ink";
}

function detectTransitionFromSlideXml(slideXml: string): PptxTransitionKind {
  if (/<p159:morph\b/.test(slideXml)) return "morph";
  if (/<p:push\b/.test(slideXml)) return "push";
  if (/<p:wipe\b/.test(slideXml)) return "wipe";
  if (/<p:zoom\b/.test(slideXml)) return "zoom";
  if (/<p:fade\b/.test(slideXml)) return "fade";
  return "none";
}

function parseTableFromSlideXml(slideXml: string): PptxTableModel | null {
  const tblMatch = slideXml.match(/<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/);
  if (!tblMatch) return null;
  const tblBody = tblMatch[1];
  const prMatch = tblBody.match(/<a:tblPr\b([^>]*)\/>/);
  const prAttrs = prMatch?.[1] ?? "";
  const showHeaderRow = !prAttrs.includes('firstRow="0"');
  const bandedRows = !prAttrs.includes('bandRow="0"');

  const trRegex = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
  const parsedRows: (readonly string[])[] = [];
  for (const trMatch of tblBody.matchAll(trRegex)) {
    const tcRegex = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
    const cells: string[] = [];
    for (const tcMatch of trMatch[1].matchAll(tcRegex)) {
      cells.push(extractParagraphTexts(tcMatch[1]).join(" "));
    }
    if (cells.length > 0) parsedRows.push(cells);
  }
  if (parsedRows.length === 0) return null;

  return {
    id: "imported-table",
    title: "가져온 표",
    headers: parsedRows[0],
    rows: parsedRows.slice(1),
    showHeaderRow,
    bandedRows,
  };
}

function parseNotesFromXml(notesXml: string | undefined): string {
  if (!notesXml) return "";
  const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
  for (const spMatch of notesXml.matchAll(spRegex)) {
    const spContent = spMatch[1];
    if (/<p:ph\b[^>]*type="body"/.test(spContent)) {
      return extractParagraphTexts(spContent).join("\n");
    }
  }
  return extractParagraphTexts(notesXml).join("\n");
}

function parseSlideFromEntries(
  slideNumber: number,
  slideXml: string,
  notesXml: string | undefined,
  dims: PptxSlideDimensions,
): { readonly slide: PptxSlideInput; readonly rawTexts: readonly string[] } {
  const rawTexts = extractTagTexts(slideXml, "a:t");
  const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;

  let title = "";
  let subtitle = "";
  const bullets: string[] = [];
  const shapes: PptxVectorShape[] = [];

  for (const spMatch of slideXml.matchAll(spRegex)) {
    const spXml = spMatch[1];
    const nameMatch = spXml.match(/<p:cNvPr\b[^>]*name="([^"]*)"/);
    const name = nameMatch ? unescapeXml(nameMatch[1]) : "";
    const phMatch = spXml.match(/<p:ph\b[^>]*type="([^"]+)"/);
    const phType = phMatch?.[1] ?? "";
    const paragraphs = extractParagraphTexts(spXml);

    if (name.startsWith("SmartArt:") || name.startsWith("Chart:")) continue;

    if ((phType === "title" || phType === "ctrTitle" || name === "Title") && paragraphs.length > 0 && !title) {
      title = paragraphs.join(" ");
      continue;
    }
    if ((phType === "subTitle" || name === "Subtitle") && paragraphs.length > 0 && !subtitle) {
      subtitle = paragraphs.join(" ");
      continue;
    }
    if (phType === "body" || name === "Bullets" || /<a:buChar\b|<a:buAutoNum\b/.test(spXml)) {
      bullets.push(...paragraphs);
      continue;
    }

    const prstMatch = spXml.match(/<a:prstGeom\b[^>]*prst="([^"]+)"/);
    const shapeKind = prstMatch ? ooxmlPresetToShapeKind(prstMatch[1]) : null;
    const isExplicitShape =
      name.startsWith("Shape:") || (shapeKind !== null && phType === "" && /<a:solidFill>/.test(spXml));

    if (isExplicitShape && shapeKind) {
      const offMatch = spXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
      const extMatch = spXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
      const xPct = offMatch ? Math.round((Number.parseInt(offMatch[1], 10) / dims.cxEmu) * 100) : 65;
      const yPct = offMatch ? Math.round((Number.parseInt(offMatch[2], 10) / dims.cyEmu) * 100) : 72;
      const wPct = extMatch ? Math.round((Number.parseInt(extMatch[1], 10) / dims.cxEmu) * 100) : 22;
      const hPct = extMatch ? Math.round((Number.parseInt(extMatch[2], 10) / dims.cyEmu) * 100) : 12;
      shapes.push({
        id: `imported-shape-${slideNumber}-${shapes.length + 1}`,
        kind: shapeKind,
        label: paragraphs.join(" ") || name || "도형",
        xPct: Math.min(90, Math.max(0, xPct)),
        yPct: Math.min(90, Math.max(0, yPct)),
        wPct: Math.min(80, Math.max(8, wPct)),
        hPct: Math.min(80, Math.max(6, hPct)),
        tone: "accent",
      });
      continue;
    }

    if (paragraphs.length > 0) {
      if (!title) {
        title = paragraphs[0];
        if (paragraphs.length > 1) bullets.push(...paragraphs.slice(1));
      } else {
        bullets.push(...paragraphs);
      }
    }
  }

  return {
    rawTexts,
    slide: {
      id: `imported-slide-${slideNumber}`,
      title: title || `슬라이드 ${slideNumber}`,
      subtitle: subtitle || undefined,
      bullets,
      shapes,
      table: parseTableFromSlideXml(slideXml),
      smartArt: null,
      chart: null,
      speakerNotes: parseNotesFromXml(notesXml),
      transition: detectTransitionFromSlideXml(slideXml),
    },
  };
}

function parsePptxEntries(entries: readonly ZipArchiveEntry[]): ParsedPptxDeck {
  const entryMap = new Map<string, string>();
  for (const entry of entries) {
    if (entry.path.endsWith(".xml") || entry.path.endsWith(".rels")) {
      entryMap.set(entry.path, decodeUtf8(entry.data));
    }
  }

  const warnings: string[] = [];
  const presentationXml = entryMap.get("ppt/presentation.xml");
  if (!presentationXml) {
    warnings.push("ppt/presentation.xml을 찾지 못해 기본 16:9 규격으로 복원했습니다.");
  }

  const slideSize = detectSlideSizeFromPresentationXml(presentationXml);
  const dims = PPTX_SLIDE_SIZES[slideSize];
  const themeId = detectThemeFromXml(entryMap.get("ppt/theme/theme1.xml"));
  const coreXml = entryMap.get("docProps/core.xml") ?? "";
  const deckTitle = extractTagTexts(coreXml, "dc:title")[0] ?? "가져온 PowerPoint 덱";
  const author = extractTagTexts(coreXml, "dc:creator")[0] ?? "ToonStudio";

  const slideFiles = [...entryMap.keys()]
    .map((path) => {
      const match = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      return match ? { path, num: Number.parseInt(match[1], 10) } : null;
    })
    .filter((item): item is { readonly path: string; readonly num: number } => item !== null)
    .sort((a, b) => a.num - b.num);

  if (slideFiles.length === 0) {
    throw new Error("유효한 `.pptx` 슬라이드(`ppt/slides/slide*.xml`)를 찾을 수 없습니다.");
  }

  const slides: PptxSlideInput[] = [];
  const rawSlideTexts: (readonly string[])[] = [];

  for (const sf of slideFiles) {
    const slideXml = entryMap.get(sf.path) ?? "";
    const relsXml = entryMap.get(`ppt/slides/_rels/slide${sf.num}.xml.rels`) ?? "";
    const notesRelMatch = relsXml.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/);
    const notesPath = notesRelMatch
      ? `ppt/notesSlides/${notesRelMatch[1]}`
      : `ppt/notesSlides/notesSlide${sf.num}.xml`;
    const parsed = parseSlideFromEntries(sf.num, slideXml, entryMap.get(notesPath), dims);
    slides.push(parsed.slide);
    rawSlideTexts.push(parsed.rawTexts);
  }

  return {
    deck: { title: deckTitle, author, slideSize, themeId, slides },
    slideCount: slides.length,
    warnings,
    rawSlideTexts,
  };
}

/**
 * 무압축(Store) `.pptx` 바이너리를 동기 파싱해 편집 가능한 `ParsedPptxDeck`으로 복원한다.
 */
export function parsePptxArchive(bytes: Uint8Array): ParsedPptxDeck {
  return parsePptxEntries(readZipArchive(bytes, { verifyCrc: true }));
}

/**
 * Store 및 Deflate 압축 `.pptx` 바이너리(PowerPoint·Keynote·LibreOffice 저장 파일 포함)를 비동기 파싱한다.
 */
export async function parsePptxArchiveAsync(bytes: Uint8Array): Promise<ParsedPptxDeck> {
  return parsePptxEntries(await readZipArchiveAsync(bytes, { verifyCrc: true }));
}
