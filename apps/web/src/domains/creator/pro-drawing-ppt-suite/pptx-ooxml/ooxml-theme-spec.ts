/**
 * 순수 OOXML (ECMA-376 PresentationML / DrawingML) 스펙 · 테마 팔레트 · 마스터/레이아웃 XML 생성기.
 * UI 컴포넌트가 아닌 PowerPoint 바이너리 `<a:srgbClr val="..."/>` 규격 전용 데이터만 보관한다.
 */

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export const OOXML_NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  p159: "http://schemas.microsoft.com/office/powerpoint/2015/09/main",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  pkgRel: "http://schemas.openxmlformats.org/package/2006/relationships",
  cp: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
  dc: "http://purl.org/dc/elements/1.1/",
  dcterms: "http://purl.org/dc/terms/",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  ep: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
  vt: "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
} as const;

export const OOXML_REL_TYPES = {
  officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  coreProperties: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  extendedProperties: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  slideMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
  slideLayout: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
  notesMaster: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster",
  notesSlide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
  slide: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  theme: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
  presProps: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps",
  viewProps: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps",
  tableStyles: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles",
} as const;

export type PptxSlideSizePreset = "16:9" | "4:3" | "a4";

export interface PptxSlideDimensions {
  readonly preset: PptxSlideSizePreset;
  readonly label: string;
  readonly cxEmu: number;
  readonly cyEmu: number;
  readonly aspectRatio: string;
  readonly ooxmlTypeAttr?: string;
}

export const PPTX_SLIDE_SIZES: Readonly<Record<PptxSlideSizePreset, PptxSlideDimensions>> = {
  "16:9": {
    preset: "16:9",
    label: "와이드 16:9",
    cxEmu: 12192000,
    cyEmu: 6858000,
    aspectRatio: "16 / 9",
  },
  "4:3": {
    preset: "4:3",
    label: "클래식 4:3",
    cxEmu: 9144000,
    cyEmu: 6858000,
    aspectRatio: "4 / 3",
    ooxmlTypeAttr: "screen4x3",
  },
  a4: {
    preset: "a4",
    label: "인쇄 A4 가로",
    cxEmu: 10692000,
    cyEmu: 7560000,
    aspectRatio: "297 / 210",
  },
};

export type OoxmlThemeId =
  | "atelier-ink"
  | "midnight-studio"
  | "editorial-sage"
  | "pitch-cobalt";

export interface OoxmlThemePalette {
  readonly canvas: string;
  readonly surface: string;
  readonly textPrimary: string;
  readonly textMuted: string;
  readonly accent1: string;
  readonly accent2: string;
  readonly accent3: string;
  readonly accent4: string;
  readonly accent5: string;
  readonly accent6: string;
  readonly border: string;
  readonly tableHeaderBg: string;
  readonly tableHeaderText: string;
  readonly tableBandBg: string;
}

export interface OoxmlThemeSpec {
  readonly id: OoxmlThemeId;
  readonly label: string;
  readonly description: string;
  readonly majorFontLatin: string;
  readonly majorFontEastAsian: string;
  readonly minorFontLatin: string;
  readonly minorFontEastAsian: string;
  readonly palette: OoxmlThemePalette;
}

export const OOXML_THEMES: readonly OoxmlThemeSpec[] = [
  {
    id: "atelier-ink",
    label: "아틀리에 잉크",
    description: "따뜻한 지면 바탕과 딥 슬레이트 잉크·코발트 포인트",
    majorFontLatin: "Calibri",
    majorFontEastAsian: "Malgun Gothic",
    minorFontLatin: "Calibri",
    minorFontEastAsian: "Malgun Gothic",
    palette: {
      canvas: "FAF8F5",
      surface: "F1ECE4",
      textPrimary: "1B202C",
      textMuted: "525C6E",
      accent1: "2D5BFF",
      accent2: "D95338",
      accent3: "1E8E68",
      accent4: "C98A1A",
      accent5: "6F4BD8",
      accent6: "2A7F9E",
      border: "D5CEC2",
      tableHeaderBg: "1B202C",
      tableHeaderText: "FAF8F5",
      tableBandBg: "F3EFE8",
    },
  },
  {
    id: "midnight-studio",
    label: "미드나잇 스튜디오",
    description: "암실 발표용 딥 차콜 배경과 선명한 스카이·앰버 강조",
    majorFontLatin: "Calibri",
    majorFontEastAsian: "Malgun Gothic",
    minorFontLatin: "Calibri",
    minorFontEastAsian: "Malgun Gothic",
    palette: {
      canvas: "141822",
      surface: "1E2433",
      textPrimary: "F4F6FA",
      textMuted: "B1BACB",
      accent1: "5EA8FF",
      accent2: "F59E42",
      accent3: "45C996",
      accent4: "B889FF",
      accent5: "F26B6B",
      accent6: "54C4D8",
      border: "343D52",
      tableHeaderBg: "283349",
      tableHeaderText: "F4F6FA",
      tableBandBg: "1B212F",
    },
  },
  {
    id: "editorial-sage",
    label: "에디토리얼 세이지",
    description: "차분한 스톤 페이퍼와 포레스트 그린·테라코타 조합",
    majorFontLatin: "Georgia",
    majorFontEastAsian: "Malgun Gothic",
    minorFontLatin: "Calibri",
    minorFontEastAsian: "Malgun Gothic",
    palette: {
      canvas: "F6F7F4",
      surface: "E9EDE5",
      textPrimary: "1F2A22",
      textMuted: "4E5D52",
      accent1: "2B6E4F",
      accent2: "C8613C",
      accent3: "3C7A89",
      accent4: "B88928",
      accent5: "5D5A88",
      accent6: "7D8F4B",
      border: "CBD3C4",
      tableHeaderBg: "2B6E4F",
      tableHeaderText: "F6F7F4",
      tableBandBg: "EEF2EA",
    },
  },
  {
    id: "pitch-cobalt",
    label: "IR 피치 코발트",
    description: "투자 심사·사업계획서용 고대비 화이트와 네이비·에메랄드",
    majorFontLatin: "Calibri",
    majorFontEastAsian: "Malgun Gothic",
    minorFontLatin: "Calibri",
    minorFontEastAsian: "Malgun Gothic",
    palette: {
      canvas: "FFFFFF",
      surface: "F2F5FA",
      textPrimary: "101D34",
      textMuted: "46556E",
      accent1: "1D4ED8",
      accent2: "0E9F6E",
      accent3: "D97706",
      accent4: "DC2626",
      accent5: "4F46E5",
      accent6: "0284C7",
      border: "D2DCEB",
      tableHeaderBg: "101D34",
      tableHeaderText: "FFFFFF",
      tableBandBg: "F4F7FC",
    },
  },
];

export function getOoxmlThemeSpec(themeId: OoxmlThemeId): OoxmlThemeSpec {
  return OOXML_THEMES.find((item) => item.id === themeId) ?? OOXML_THEMES[0];
}

/**
 * XML 1.0 유효 문자만 보존하고 특수 문자를 이스케이프한다(한글 UTF-8 완전 보존).
 */
export function escapeXml(raw: string): string {
  let result = "";
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    const isValidXmlChar =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      (code >= 0xe000 && code <= 0xfffd);
    if (!isValidXmlChar) continue;

    if (code === 0x26) result += "&amp;";
    else if (code === 0x3c) result += "&lt;";
    else if (code === 0x3e) result += "&gt;";
    else if (code === 0x22) result += "&quot;";
    else if (code === 0x27) result += "&apos;";
    else result += raw[i];
  }
  return result;
}

export function unescapeXml(escaped: string): string {
  return escaped.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,
    (match, token: string) => {
      if (token === "amp") return "&";
      if (token === "lt") return "<";
      if (token === "gt") return ">";
      if (token === "quot") return '"';
      if (token === "apos") return "'";
      if (token.startsWith("#x") || token.startsWith("#X")) {
        const cp = Number.parseInt(token.slice(2), 16);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
      }
      if (token.startsWith("#")) {
        const cp = Number.parseInt(token.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
      }
      return match;
    },
  );
}

export function buildThemeXml(theme: OoxmlThemeSpec): string {
  const p = theme.palette;
  return `${XML_DECL}
<a:theme xmlns:a="${OOXML_NS.a}" name="${escapeXml(theme.label)}">
  <a:themeElements>
    <a:clrScheme name="${escapeXml(theme.id)}">
      <a:dk1><a:srgbClr val="${p.textPrimary}"/></a:dk1>
      <a:lt1><a:srgbClr val="${p.canvas}"/></a:lt1>
      <a:dk2><a:srgbClr val="${p.textMuted}"/></a:dk2>
      <a:lt2><a:srgbClr val="${p.surface}"/></a:lt2>
      <a:accent1><a:srgbClr val="${p.accent1}"/></a:accent1>
      <a:accent2><a:srgbClr val="${p.accent2}"/></a:accent2>
      <a:accent3><a:srgbClr val="${p.accent3}"/></a:accent3>
      <a:accent4><a:srgbClr val="${p.accent4}"/></a:accent4>
      <a:accent5><a:srgbClr val="${p.accent5}"/></a:accent5>
      <a:accent6><a:srgbClr val="${p.accent6}"/></a:accent6>
      <a:hlink><a:srgbClr val="${p.accent1}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${p.accent5}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="ToonStudioKorean">
      <a:majorFont>
        <a:latin typeface="${escapeXml(theme.majorFontLatin)}"/>
        <a:ea typeface="${escapeXml(theme.majorFontEastAsian)}"/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="${escapeXml(theme.minorFontLatin)}"/>
        <a:ea typeface="${escapeXml(theme.minorFontEastAsian)}"/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="ToonStudioFormat">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="28575" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`;
}

export function buildSlideMasterXml(theme: OoxmlThemeSpec): string {
  return `${XML_DECL}
<p:sldMaster xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}">
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill><a:srgbClr val="${theme.palette.canvas}"/></a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr algn="l"><a:defRPr sz="3200" b="1"><a:solidFill><a:srgbClr val="${theme.palette.textPrimary}"/></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr algn="l"><a:defRPr sz="1800"><a:solidFill><a:srgbClr val="${theme.palette.textPrimary}"/></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:defPPr><a:defRPr lang="ko-KR"/></a:defPPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;
}

export function buildSlideMasterRelsXml(): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="${OOXML_REL_TYPES.theme}" Target="../theme/theme1.xml"/>
</Relationships>`;
}

export function buildSlideLayoutXml(): string {
  return `${XML_DECL}
<p:sldLayout xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

export function buildSlideLayoutRelsXml(): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.slideMaster}" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

export function buildNotesMasterXml(): string {
  return `${XML_DECL}
<p:notesMaster xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:notesMaster>`;
}

export function buildNotesMasterRelsXml(): string {
  return `${XML_DECL}
<Relationships xmlns="${OOXML_NS.pkgRel}">
  <Relationship Id="rId1" Type="${OOXML_REL_TYPES.theme}" Target="../theme/theme1.xml"/>
</Relationships>`;
}

export function buildPresPropsXml(): string {
  return `${XML_DECL}
<p:presentationPr xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}"/>`;
}

export function buildViewPropsXml(): string {
  return `${XML_DECL}
<p:viewPr xmlns:a="${OOXML_NS.a}" xmlns:r="${OOXML_NS.r}" xmlns:p="${OOXML_NS.p}">
  <p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:cSldViewPr></p:slideViewPr>
</p:viewPr>`;
}

export function buildTableStylesXml(): string {
  return `${XML_DECL}
<a:tblStyleLst xmlns:a="${OOXML_NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`;
}

export function buildCorePropsXml(title: string, author: string): string {
  const iso = "2026-01-01T00:00:00Z";
  return `${XML_DECL}
<cp:coreProperties xmlns:cp="${OOXML_NS.cp}" xmlns:dc="${OOXML_NS.dc}" xmlns:dcterms="${OOXML_NS.dcterms}" xmlns:xsi="${OOXML_NS.xsi}">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(author)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
}

export function buildAppPropsXml(slideCount: number): string {
  return `${XML_DECL}
<Properties xmlns="${OOXML_NS.ep}" xmlns:vt="${OOXML_NS.vt}">
  <Application>ToonStudio PPTX OOXML Engine</Application>
  <Slides>${slideCount}</Slides>
  <Notes>${slideCount}</Notes>
  <HiddenSlides>0</HiddenSlides>
</Properties>`;
}
