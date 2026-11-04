/**
 * Clip Studio Paint 1.5 출판·인쇄소(`PrintCoInfo.xml`), 전자책 디바이스(`EPUBDeviceInfo.xml` /
 * `KindleDeviceInfo.xml`), 3D 카탈로그 바이너리(`CLIP_STUDIO_3D_DATA2` / `bonescale_preset*.3dp`),
 * Celsys 인덱스 리소스 아카이브(`742DEA58-ED6B-4402-BC11-20DFC6D08040`), ICC 컬러 프로파일 코덱.
 */

export interface CspPrintCompanyPaperThickness {
  readonly id: number;
  readonly name: string;
  readonly thicknessMm: number;
}

export interface CspPrintCompanyCourse {
  readonly id: number;
  readonly name: string;
  readonly defaultPaperId: number;
  readonly paperIds: readonly number[];
  readonly minPageCount: number;
  readonly maxPageCount: number;
  readonly pageStep: number;
}

export type CspSpineWidthType = "main" | "cover";
export type CspSpineWidthDesignate = "normal" | "auto";
export type CspCoverMakeType = "normal" | "double";

export interface CspPrintCompanyPreset {
  readonly id: number;
  readonly name: string;
  readonly url: string;
  readonly coverPaperThicknesses: readonly CspPrintCompanyPaperThickness[];
  readonly mainPaperThicknesses: readonly CspPrintCompanyPaperThickness[];
  readonly courses: readonly CspPrintCompanyCourse[];
  readonly defaultCourseId: number;
  readonly ditchWidthMm: number;
  readonly spineWidthType: CspSpineWidthType;
  readonly spineWidthDesignate: CspSpineWidthDesignate;
  readonly coverMakeType: CspCoverMakeType;
}

export interface CspParsedPrintCoInfo {
  readonly version: number;
  readonly companies: readonly CspPrintCompanyPreset[];
}

export interface CspBookSpineAndSpreadInput {
  readonly company: CspPrintCompanyPreset;
  readonly bodyPageCount: number;
  readonly mainPaperId?: number;
  readonly coverPaperId?: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly dpi: number;
}

export interface CspBookSpineAndSpreadSpec {
  readonly spineWidthMm: number;
  readonly spineWidthPx: number;
  readonly ditchWidthMm: number;
  readonly ditchWidthPx: number;
  readonly spreadWidthMm: number;
  readonly spreadHeightMm: number;
  readonly spreadWidthPx: number;
  readonly spreadHeightPx: number;
  readonly mainPaperThicknessMm: number;
  readonly coverPaperThicknessMm: number;
}

export interface CspEpubDevicePreset {
  readonly name: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CspKindleDevicePreset {
  readonly name: string;
  readonly abbreviation?: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly orientation: "portrait" | "landscape";
  readonly countries: readonly string[];
}

export interface CspCs3oCatalogDataHeader {
  readonly formatMagic: string;
  readonly chunkType: string;
  readonly payloadOffset: number;
  readonly payloadByteLength: number;
  readonly versionMajor: number;
  readonly versionMinor: number;
}

export interface CspBoneScale3dpPreset {
  readonly presetId: string;
  readonly labelKo: string;
  readonly version: string;
  readonly boneScales: Readonly<Record<string, readonly [number, number, number]>>;
}

export interface CspIndexedResourceSubEntry {
  readonly entryId: number;
  readonly absoluteOffset: number;
  readonly byteLength: number;
  readonly payload: Uint8Array;
}

export interface CspIndexedResourceSection {
  readonly sectionId: number;
  readonly offset: number;
  readonly byteLength: number;
  readonly subEntries: readonly CspIndexedResourceSubEntry[];
  readonly rawData: Uint8Array;
}

export interface CspIndexedResourceArchive {
  readonly sectionCount: number;
  readonly sections: readonly CspIndexedResourceSection[];
}

export interface CspIccColorProfileSpec {
  readonly id: string;
  readonly fileName: string;
  readonly displayNameKo: string;
  readonly colorSpace: "RGB" | "CMYK";
  readonly region: "Global" | "Japan" | "US" | "Europe";
  readonly medium: "Display" | "Coated" | "Uncoated" | "Newspaper" | "WebCoated";
  readonly tacLimitPercent: number;
  readonly blackGenerationStrength: number;
}

export interface CspCmykSoftProofResult {
  readonly cPercent: number;
  readonly mPercent: number;
  readonly yPercent: number;
  readonly kPercent: number;
  readonly totalAreaCoveragePercent: number;
  readonly exceedsTacLimit: boolean;
  readonly softProofRgb: readonly [number, number, number];
}

export interface CspBuiltinColorSetArchiveMeta {
  readonly fileName: string;
  readonly displayNameKo: string;
  readonly swatchCount: number;
  readonly byteLength: number;
}

function makeStdPrintCompany(
  id: number,
  name: string,
  url: string,
  maxPageCount = 260,
): CspPrintCompanyPreset {
  return {
    id,
    name,
    url,
    coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.2 }],
    mainPaperThicknesses: [{ id: 0, name: "上質 90kg", thicknessMm: 0.125 }],
    courses: [
      { id: 0, name: "標準セット", defaultPaperId: 0, paperIds: [0], minPageCount: 16, maxPageCount, pageStep: 4 },
    ],
    defaultCourseId: 0,
    ditchWidthMm: 5.0,
    spineWidthType: "main",
    spineWidthDesignate: "normal",
    coverMakeType: "normal",
  };
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/PrintCoInfo/PrintCoInfo.xml` (v117) 25개 인쇄소 카탈로그.
 */
export const CSP_PRINT_COMPANY_PRESETS: readonly CspPrintCompanyPreset[] = [
  {
    id: 0,
    name: "緑陽社",
    url: "http://www.ryokuyou.co.jp/doujin/index.html",
    coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.2 }],
    mainPaperThicknesses: [
      { id: 0, name: "上質 90kg", thicknessMm: 0.125 },
      { id: 1, name: "コミック紙", thicknessMm: 0.14 },
      { id: 2, name: "b7バルキー", thicknessMm: 0.12 },
    ],
    courses: [{ id: 0, name: "スタンダードコース", defaultPaperId: 0, paperIds: [0, 1, 2], minPageCount: 16, maxPageCount: 300, pageStep: 4 }],
    defaultCourseId: 0,
    ditchWidthMm: 5.0,
    spineWidthType: "main",
    spineWidthDesignate: "normal",
    coverMakeType: "normal",
  },
  {
    id: 1,
    name: "日光企画",
    url: "http://www.nikko-pc.com/",
    coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.22 }],
    mainPaperThicknesses: [
      { id: 0, name: "上質90kg", thicknessMm: 0.12 },
      { id: 1, name: "美弾紙ノベルズ", thicknessMm: 0.13 },
    ],
    courses: [{ id: 0, name: "フルカラー表紙セット", defaultPaperId: 0, paperIds: [0, 1], minPageCount: 12, maxPageCount: 300, pageStep: 4 }],
    defaultCourseId: 0,
    ditchWidthMm: 5.0,
    spineWidthType: "main",
    spineWidthDesignate: "normal",
    coverMakeType: "normal",
  },
  {
    id: 2,
    name: "サンライズ",
    url: "http://www.sunrisep.co.jp/",
    coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.13 }],
    mainPaperThicknesses: [
      { id: 0, name: "上質 90kg", thicknessMm: 0.13 },
      { id: 1, name: "ラフクリーム琥珀", thicknessMm: 0.14 },
    ],
    courses: [{ id: 0, name: "フルカラーコミックセット", defaultPaperId: 0, paperIds: [0, 1], minPageCount: 16, maxPageCount: 260, pageStep: 4 }],
    defaultCourseId: 0,
    ditchWidthMm: 5.0,
    spineWidthType: "cover",
    spineWidthDesignate: "normal",
    coverMakeType: "double",
  },
  makeStdPrintCompany(3, "くりえい社", "http://www.kurieisha.co.jp/"),
  makeStdPrintCompany(4, "コーシン出版", "http://www.kohshin.co.jp/", 240),
  makeStdPrintCompany(5, "ねこのしっぽ", "http://www.shippo.co.jp/neko/"),
  makeStdPrintCompany(6, "金沢印刷", "http://www.kanazawa-p.co.jp/"),
  makeStdPrintCompany(7, "栄光", "http://www.eikou.com/"),
  makeStdPrintCompany(8, "シメケン", "http://shimeken.com/print/"),
  makeStdPrintCompany(9, "しまや出版", "http://www.shimaya.net/"),
  makeStdPrintCompany(10, "大陽出版", "http://www.taiyo-shuppan.co.jp/doujin/"),
  makeStdPrintCompany(11, "ポプルス", "http://www.inv.co.jp/~popls/"),
  makeStdPrintCompany(12, "関西美術印刷", "http://www.kanbi.co.jp/"),
  makeStdPrintCompany(13, "PICO", "http://www.pico-net.com/doujinshi/"),
  makeStdPrintCompany(14, "pixivFACTORY", "https://factory.pixiv.net/books", 240),
  makeStdPrintCompany(15, "プリントオン", "http://www.print-on.jp/doujin/doujin_index.htm"),
  makeStdPrintCompany(16, "アクシス", "https://www.axis-ss.com"),
  makeStdPrintCompany(17, "サングループ", "http://www.sungroup.co.jp/top.htm"),
  makeStdPrintCompany(18, "ブックネクスト", "https://booknext.jp/"),
  makeStdPrintCompany(19, "テイズプリント", "https://www.t-s-print.com/"),
  makeStdPrintCompany(20, "オレンジ工房.com", "https://www.orangekoubou.com/"),
  makeStdPrintCompany(21, "株式会社BRO'S", "https://www.bros-comic.co.jp/"),
  makeStdPrintCompany(22, "株式会社ホープツーワン", "https://www.hope21.jp/"),
  makeStdPrintCompany(23, "EditNetプリンテック", "http://www.editnet.co.jp/"),
  {
    id: 99999999,
    name: "汎用設定",
    url: "",
    coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.2 }],
    mainPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: 0.1 }],
    courses: [
      { id: 0, name: "標準", defaultPaperId: 0, paperIds: [0], minPageCount: 8, maxPageCount: 500, pageStep: 2 },
    ],
    defaultCourseId: 0,
    ditchWidthMm: 3.0,
    spineWidthType: "main",
    spineWidthDesignate: "normal",
    coverMakeType: "double",
  },
] as const;

function extractXmlAttrValue(openTag: string, attrName: string): string {
  const needle = `${attrName.toLowerCase()}="`;
  const startIdx = openTag.toLowerCase().indexOf(needle);
  if (startIdx < 0) return "";
  const valStart = startIdx + needle.length;
  const valEnd = openTag.indexOf('"', valStart);
  return valEnd >= 0 ? openTag.slice(valStart, valEnd) : "";
}

function splitXmlElementBlocks(xmlText: string, tagName: string): { readonly openTag: string; readonly body: string }[] {
  const results: { readonly openTag: string; readonly body: string }[] = [];
  const openNeedle = `<${tagName.toLowerCase()}`;
  for (const segment of xmlText.split(new RegExp(`<\\/${tagName}>`, "i"))) {
    const lowerSeg = segment.toLowerCase();
    const openIdx = lowerSeg.lastIndexOf(openNeedle);
    const afterName = openIdx >= 0 ? lowerSeg[openIdx + openNeedle.length] : undefined;
    if (openIdx < 0 || (afterName !== undefined && afterName !== ">" && !/\s/.test(afterName))) continue;
    const gtIdx = segment.indexOf(">", openIdx + openNeedle.length);
    if (gtIdx >= 0) results.push({ openTag: segment.slice(openIdx, gtIdx + 1), body: segment.slice(gtIdx + 1) });
  }
  return results;
}

/**
 * `PrintCoInfo.xml` 문자열을 파싱하여 인쇄소 프리셋 목록을 반환한다.
 */
export function parseCspPrintCoInfoXml(xmlText: string): CspParsedPrintCoInfo {
  const versionMatch = /<printcoinfo(?:root)?\s+version="(\d+)"/i.exec(xmlText);
  const version = versionMatch ? Number.parseInt(versionMatch[1] ?? "117", 10) : 117;
  const companies: CspPrintCompanyPreset[] = [];

  for (const { openTag, body } of splitXmlElementBlocks(xmlText, "printingcompanyinfo")) {
    const name = extractXmlAttrValue(openTag, "name").trim();
    const idRaw = extractXmlAttrValue(openTag, "id").trim();
    if (!idRaw) continue;
    const id = Number.parseInt(idRaw, 10);
    const url = extractXmlAttrValue(openTag, "url").trim();
    const coverThickness = Number.parseFloat(
      /<coverpaper>\s*<thickness>([\d.]+)<\/thickness>\s*<\/coverpaper>/i.exec(body)?.[1] ?? "0.2",
    );
    const mainThickness = Number.parseFloat(
      /<mainpaper>\s*<thickness>([\d.]+)<\/thickness>\s*<\/mainpaper>/i.exec(body)?.[1] ?? "0.13",
    );
    const ditchWidthMm = Number.parseFloat(/<ditchwidth>([\d.]+)<\/ditchwidth>/i.exec(body)?.[1] ?? "3.0");
    const minPageCount = Number.parseInt(/<minimum>(\d+)<\/minimum>/i.exec(body)?.[1] ?? "8", 10);
    const maxPageCount = Number.parseInt(/<maximum>(\d+)<\/maximum>/i.exec(body)?.[1] ?? "1000", 10);
    const spineWidthTypeRaw = /<spinewidthtype>(\w+)<\/spinewidthtype>/i.exec(body)?.[1]?.trim();
    const spineWidthType: CspSpineWidthType = spineWidthTypeRaw === "cover" ? "cover" : "main";
    const spineWidthDesignateRaw = /<spinewidthdesignate>(\w+)<\/spinewidthdesignate>/i.exec(body)?.[1]?.trim();
    const spineWidthDesignate: CspSpineWidthDesignate = spineWidthDesignateRaw === "auto" ? "auto" : "normal";
    const coverMakeTypeRaw = /<covertype>(\w+)<\/covertype>/i.exec(body)?.[1]?.trim();
    const coverMakeType: CspCoverMakeType = coverMakeTypeRaw === "double" ? "double" : "normal";

    companies.push({
      id,
      name,
      url,
      coverPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: coverThickness }],
      mainPaperThicknesses: [{ id: 0, name: "標準", thicknessMm: mainThickness }],
      courses: [
        {
          id: 0,
          name: "標準",
          defaultPaperId: 0,
          paperIds: [0],
          minPageCount,
          maxPageCount,
          pageStep: 2,
        },
      ],
      defaultCourseId: 0,
      ditchWidthMm,
      spineWidthType,
      spineWidthDesignate,
      coverMakeType,
    });
  }

  return { version, companies };
}

/**
 * 인쇄소 프리셋, 본문 페이지 수, 용지 두께, 판형/재단선/DPI를 기반으로 책등 폭(`背幅`)과 양면 표지 스프레드 규격을 계산한다.
 */
export function computeCspBookSpineAndSpreadSpec(
  input: CspBookSpineAndSpreadInput,
): CspBookSpineAndSpreadSpec {
  const mainPaper =
    input.company.mainPaperThicknesses.find((p) => p.id === input.mainPaperId) ??
    input.company.mainPaperThicknesses[0] ?? { id: 0, name: "標準", thicknessMm: 0.12 };
  const coverPaper =
    input.company.coverPaperThicknesses.find((p) => p.id === input.coverPaperId) ??
    input.company.coverPaperThicknesses[0] ?? { id: 0, name: "標準", thicknessMm: 0.2 };

  const sheetCount = Math.max(1, Math.ceil(input.bodyPageCount / 2));
  const rawMainSpineMm = sheetCount * mainPaper.thicknessMm;
  const spineWidthMm =
    input.company.spineWidthType === "cover"
      ? Number((rawMainSpineMm + 2 * coverPaper.thicknessMm).toFixed(3))
      : Number(rawMainSpineMm.toFixed(3));

  const mmToPx = (mm: number): number => Math.round((mm / 25.4) * input.dpi);
  const spreadWidthMm = Number((input.trimWidthMm * 2 + spineWidthMm + input.bleedMm * 2).toFixed(3));
  const spreadHeightMm = Number((input.trimHeightMm + input.bleedMm * 2).toFixed(3));

  return {
    spineWidthMm,
    spineWidthPx: mmToPx(spineWidthMm),
    ditchWidthMm: input.company.ditchWidthMm,
    ditchWidthPx: mmToPx(input.company.ditchWidthMm),
    spreadWidthMm,
    spreadHeightMm,
    spreadWidthPx: mmToPx(spreadWidthMm),
    spreadHeightPx: mmToPx(spreadHeightMm),
    mainPaperThicknessMm: mainPaper.thicknessMm,
    coverPaperThicknessMm: coverPaper.thicknessMm,
  };
}

/**
 * `EPUBDeviceInfo.xml` 9종 해상도 프리셋.
 */
export const CSP_EPUB_DEVICE_PRESETS: readonly CspEpubDevicePreset[] = [
  { name: "HD", widthPx: 720, heightPx: 1280 },
  { name: "XGA", widthPx: 768, heightPx: 1024 },
  { name: "WXGA", widthPx: 800, heightPx: 1280 },
  { name: "FHD", widthPx: 1080, heightPx: 1920 },
  { name: "WUXGA", widthPx: 1200, heightPx: 1920 },
  { name: "QHD", widthPx: 1440, heightPx: 2160 },
  { name: "WQHD", widthPx: 1440, heightPx: 2560 },
  { name: "QXGA", widthPx: 1536, heightPx: 2048 },
  { name: "WQXGA", widthPx: 1600, heightPx: 2560 },
] as const;

/**
 * `KindleDeviceInfo.xml` 8종 Kindle 단말기 프리셋.
 */
export const CSP_KINDLE_DEVICE_PRESETS: readonly CspKindleDevicePreset[] = [
  { name: "Kindle", widthPx: 560, heightPx: 734, orientation: "portrait", countries: ["au", "br", "ca", "de", "es", "fr", "in", "it", "mx", "uk", "us"] },
  { name: "Kindle Paperwhite", widthPx: 758, heightPx: 1024, orientation: "portrait", countries: ["au", "br", "ca", "cn", "de", "es", "fr", "in", "it", "jp", "mx", "uk", "us"] },
  { name: 'Kindle Fire HD 7" Tablet', abbreviation: "Fire HD", widthPx: 800, heightPx: 1280, orientation: "landscape", countries: ["au", "ca", "cn", "de", "es", "fr", "in", "it", "uk", "us"] },
  { name: "Kindle Voyage", widthPx: 1072, heightPx: 1448, orientation: "portrait", countries: ["au", "br", "cn", "de", "es", "fr", "in", "it", "jp", "uk", "us"] },
  { name: "Kindle Paperwhite(300ppi)", widthPx: 1072, heightPx: 1448, orientation: "portrait", countries: ["au", "br", "cn", "de", "es", "fr", "in", "it", "jp", "uk", "us"] },
  { name: 'Kindle Fire HD 8.9" Tablet', abbreviation: 'Fire HD 8.9"', widthPx: 1200, heightPx: 1920, orientation: "landscape", countries: ["in", "us"] },
  { name: 'Kindle Fire HDX 7" Tablet', abbreviation: "Fire HDX", widthPx: 1200, heightPx: 1920, orientation: "landscape", countries: ["au", "ca", "cn", "de", "es", "fr", "it", "jp", "uk", "us"] },
  { name: 'Kindle Fire HDX 8.9" Tablet', abbreviation: 'Fire HDX 8.9"', widthPx: 1600, heightPx: 2560, orientation: "landscape", countries: ["au", "ca", "cn", "de", "es", "fr", "it", "jp", "uk", "us"] },
] as const;

/**
 * `EPUBDeviceInfo.xml` 및 `KindleDeviceInfo.xml` 파서.
 */
export function parseCspEpubAndKindleDeviceXml(
  epubXml: string,
  kindleXml: string,
): {
  readonly epubDevices: readonly CspEpubDevicePreset[];
  readonly kindleDevices: readonly CspKindleDevicePreset[];
} {
  const epubDevices: CspEpubDevicePreset[] = [];
  for (const { body } of splitXmlElementBlocks(epubXml, "device")) {
    const name = (/<name\s+value="([^"]*)"/i.exec(body)?.[1] ?? "").replaceAll("&quot;", '"').trim();
    const resMatch = /<resolution\s+shortside="(\d+)"\s+longside="(\d+)"/i.exec(body);
    const widthPx = Number.parseInt(resMatch?.[1] ?? "0", 10);
    const heightPx = Number.parseInt(resMatch?.[2] ?? "0", 10);
    if (name && widthPx > 0 && heightPx > 0) {
      epubDevices.push({ name, widthPx, heightPx });
    }
  }

  const kindleDevices: CspKindleDevicePreset[] = [];
  for (const { body } of splitXmlElementBlocks(kindleXml, "device")) {
    const nameMatch = /<name\s+value="([^"]*)"(?:\s+abbreviation="([^"]*)")?/i.exec(body);
    const name = (nameMatch?.[1] ?? "").replaceAll("&quot;", '"').trim();
    const abbreviation = nameMatch?.[2] ? nameMatch[2].replaceAll("&quot;", '"').trim() : undefined;
    const resMatch = /<resolution\s+shortside="(\d+)"\s+longside="(\d+)"/i.exec(body);
    const widthPx = Number.parseInt(resMatch?.[1] ?? "0", 10);
    const heightPx = Number.parseInt(resMatch?.[2] ?? "0", 10);
    const orientationRaw = /<orientation\s+value="(portrait|landscape)"/i.exec(body)?.[1];
    const orientation: "portrait" | "landscape" = orientationRaw === "landscape" ? "landscape" : "portrait";
    const countriesRaw = /<countries\s+value="([^"]*)"/i.exec(body)?.[1] ?? "";
    const countries = countriesRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (name && widthPx > 0 && heightPx > 0) {
      kindleDevices.push({ name, abbreviation, widthPx, heightPx, orientation, countries });
    }
  }

  return { epubDevices, kindleDevices };
}

/**
 * `.cs3o` / `.c3dd` `object3d.catalog_data` 바이너리 헤더(`CLIP_STUDIO_3D_DATA2` + `catalog_object`) 파서.
 */
export function parseCspCs3oCatalogDataHeader(data: Uint8Array): CspCs3oCatalogDataHeader {
  if (data.byteLength < 50) {
    throw new Error("Invalid CS3O catalog_data blob: minimum 50 bytes required.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magicLen = view.getUint32(0, true);
  if (magicLen !== 20 || 4 + magicLen > data.byteLength) {
    throw new Error(`Unsupported CS3O format magic length: ${magicLen}`);
  }
  const decoder = new TextDecoder("ascii");
  const formatMagic = decoder.decode(data.subarray(4, 4 + magicLen));
  if (formatMagic !== "CLIP_STUDIO_3D_DATA2") {
    throw new Error(`Unexpected CS3O format magic: ${formatMagic}`);
  }
  const chunkTypeLen = view.getUint32(24, true);
  if (28 + chunkTypeLen + 14 > data.byteLength) {
    throw new Error("Truncated CS3O chunkType header.");
  }
  const chunkType = decoder.decode(data.subarray(28, 28 + chunkTypeLen));
  const metaOffset = 28 + chunkTypeLen;
  const payloadByteLength = view.getUint32(metaOffset + 2, true);
  const versionMajor = view.getUint32(metaOffset + 6, true);
  const versionMinor = view.getUint32(metaOffset + 10, true);

  return {
    formatMagic,
    chunkType,
    payloadOffset: metaOffset + 14,
    payloadByteLength,
    versionMajor,
    versionMinor,
  };
}

/**
 * `.cs3o` / `.c3dd` `CLIP_STUDIO_3D_DATA2` 헤더와 페이로드를 직렬화한다.
 */
export function encodeCspCs3oCatalogDataHeader(
  chunkType: string,
  versionMajor: number,
  versionMinor: number,
  payload: Uint8Array,
): Uint8Array {
  const encoder = new TextEncoder();
  const magicBytes = encoder.encode("CLIP_STUDIO_3D_DATA2");
  const chunkBytes = encoder.encode(chunkType);
  const out = new Uint8Array(4 + magicBytes.byteLength + 4 + chunkBytes.byteLength + 14 + payload.byteLength);
  const view = new DataView(out.buffer);

  view.setUint32(0, magicBytes.byteLength, true);
  out.set(magicBytes, 4);
  const chunkOffset = 4 + magicBytes.byteLength;
  view.setUint32(chunkOffset, chunkBytes.byteLength, true);
  out.set(chunkBytes, chunkOffset + 4);

  const metaOffset = chunkOffset + 4 + chunkBytes.byteLength;
  view.setUint16(metaOffset, 0, true);
  view.setUint32(metaOffset + 2, payload.byteLength, true);
  view.setUint32(metaOffset + 6, versionMajor, true);
  view.setUint32(metaOffset + 10, versionMinor, true);
  out.set(payload, metaOffset + 14);
  return out;
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/bonescale_preset01.3dp` 및 `bonescale_preset02.3dp` 프리셋.
 */
export const CSP_BONESCALE_3DP_PRESETS: readonly CspBoneScale3dpPreset[] = [
  {
    presetId: "bonescale_preset01",
    labelKo: "8등신 모델 체형 (bonescale_preset01.3dp)",
    version: "1.0.0",
    boneScales: {
      bone_root: [0, 0, 0],
      bone_head: [0, 0, 0],
      bone_neck: [-0.08, 0, 0],
      bone_shoulder: [0, -0.15, 0],
      bone_arm: [0.11, 0, 0],
      bone_forearm: [0.12, 0, 0],
      bone_hand: [-0.04, -0.04, -0.04],
      bone_chest: [-0.04, -0.1, -0.01],
      bone_body: [0.06, 0, 0],
      bone_hips: [-0.08, -0.08, 0],
      bone_leg: [0.21, 0, 0],
      bone_foot: [0.17, 0, 0],
    },
  },
  {
    presetId: "bonescale_preset02",
    labelKo: "SD 데포르메 체형 (bonescale_preset02.3dp)",
    version: "1.0.0",
    boneScales: {
      bone_root: [0, 0, 0],
      bone_head: [0, 0, 0],
      bone_neck: [0, 0, 0],
      bone_shoulder: [0, -0.5, 0],
      bone_arm: [-0.5, -0.5, -0.5],
      bone_forearm: [-0.5, -0.5, -0.5],
      bone_hand: [-0.36, -0.36, -0.36],
      bone_chest: [-0.38, -0.5, -0.44],
      bone_body: [-0.5, -0.44, -0.44],
      bone_hips: [0.3, -0.35, -0.35],
      bone_leg: [-0.5, -0.5, -0.5],
      bone_foot: [-0.5, -0.5, -0.5],
    },
  },
] as const;

/**
 * Celsys 인덱스 리소스 아카이브(`742DEA58-ED6B-4402-BC11-20DFC6D08040` 등) 파서.
 * 상위 디렉터리: `sectionCount: uint32BE`, `[sectionId: uint32BE, offset: uint32BE, byteLength: uint32BE] * sectionCount`.
 * 섹션 1 내부: `entryCount: uint32BE`, `[entryId: uint32BE, absoluteOffset: uint32BE, byteLength: uint32BE] * entryCount`.
 */
export function parseCspIndexedResourceArchive(data: Uint8Array): CspIndexedResourceArchive {
  if (data.byteLength < 16) {
    throw new Error("Invalid Celsys indexed resource archive: minimum 16 bytes required.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sectionCount = view.getUint32(0, false);
  if (sectionCount === 0 || sectionCount > 64 || 4 + sectionCount * 12 > data.byteLength) {
    throw new Error(`Invalid Celsys resource archive sectionCount: ${sectionCount}`);
  }

  const sections: CspIndexedResourceSection[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const dirOffset = 4 + i * 12;
    const sectionId = view.getUint32(dirOffset, false);
    const offset = view.getUint32(dirOffset + 4, false);
    const byteLength = view.getUint32(dirOffset + 8, false);
    if (offset + byteLength > data.byteLength) {
      throw new Error(`Section ${sectionId} exceeds archive byteLength (${offset} + ${byteLength} > ${data.byteLength}).`);
    }

    const rawData = data.subarray(offset, offset + byteLength);
    const subEntries: CspIndexedResourceSubEntry[] = [];
    if (byteLength >= 16) {
      const candidateCount = view.getUint32(offset, false);
      const tableBytes = 4 + candidateCount * 12;
      if (candidateCount > 0 && candidateCount <= 4096 && tableBytes <= byteLength) {
        const firstEntryOffset = view.getUint32(offset + 8, false);
        if (firstEntryOffset === offset + tableBytes) {
          for (let j = 0; j < candidateCount; j++) {
            const subDirOffset = offset + 4 + j * 12;
            const entryId = view.getUint32(subDirOffset, false);
            const absOffset = view.getUint32(subDirOffset + 4, false);
            const len = view.getUint32(subDirOffset + 8, false);
            if (absOffset >= offset && absOffset + len <= offset + byteLength) {
              subEntries.push({
                entryId,
                absoluteOffset: absOffset,
                byteLength: len,
                payload: data.subarray(absOffset, absOffset + len),
              });
            }
          }
        }
      }
    }

    sections.push({
      sectionId,
      offset,
      byteLength,
      subEntries,
      rawData,
    });
  }

  return { sectionCount, sections };
}

/**
 * Celsys 인덱스 리소스 아카이브를 Big-Endian 바이너리로 인코딩한다.
 */
export function encodeCspIndexedResourceArchive(
  sectionsInput: readonly {
    readonly sectionId: number;
    readonly subEntries?: readonly { readonly entryId: number; readonly payload: Uint8Array }[];
    readonly rawPayload?: Uint8Array;
  }[],
): Uint8Array {
  const topDirSize = 4 + sectionsInput.length * 12;
  const encodedSections: Uint8Array[] = [];
  const sectionOffsets: number[] = [];
  let runningOffset = topDirSize;

  for (const sec of sectionsInput) {
    sectionOffsets.push(runningOffset);
    if (sec.subEntries && sec.subEntries.length > 0) {
      const subTableSize = 4 + sec.subEntries.length * 12;
      const totalPayloadSize = sec.subEntries.reduce((acc, e) => acc + e.payload.byteLength, 0);
      const secBuf = new Uint8Array(subTableSize + totalPayloadSize);
      const secView = new DataView(secBuf.buffer);
      secView.setUint32(0, sec.subEntries.length, false);
      let entryAbsOffset = runningOffset + subTableSize;
      let localPayloadCursor = subTableSize;
      for (let j = 0; j < sec.subEntries.length; j++) {
        const item = sec.subEntries[j]!;
        secView.setUint32(4 + j * 12, item.entryId, false);
        secView.setUint32(4 + j * 12 + 4, entryAbsOffset, false);
        secView.setUint32(4 + j * 12 + 8, item.payload.byteLength, false);
        secBuf.set(item.payload, localPayloadCursor);
        entryAbsOffset += item.payload.byteLength;
        localPayloadCursor += item.payload.byteLength;
      }
      encodedSections.push(secBuf);
      runningOffset += secBuf.byteLength;
    } else {
      const raw = sec.rawPayload ?? new Uint8Array(0);
      encodedSections.push(raw);
      runningOffset += raw.byteLength;
    }
  }

  const out = new Uint8Array(runningOffset);
  const view = new DataView(out.buffer);
  view.setUint32(0, sectionsInput.length, false);
  for (let i = 0; i < sectionsInput.length; i++) {
    const sec = sectionsInput[i]!;
    const secBytes = encodedSections[i]!;
    const offset = sectionOffsets[i]!;
    view.setUint32(4 + i * 12, sec.sectionId, false);
    view.setUint32(4 + i * 12 + 4, offset, false);
    view.setUint32(4 + i * 12 + 8, secBytes.byteLength, false);
    out.set(secBytes, offset);
  }
  return out;
}

function makeIccProfile(
  id: string,
  fileName: string,
  displayNameKo: string,
  colorSpace: "RGB" | "CMYK",
  region: "Global" | "Japan" | "US" | "Europe",
  medium: "Display" | "Coated" | "Uncoated" | "Newspaper" | "WebCoated",
  tacLimitPercent: number,
  blackGenerationStrength: number,
): CspIccColorProfileSpec {
  return { id, fileName, displayNameKo, colorSpace, region, medium, tacLimitPercent, blackGenerationStrength };
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ICCProfiles/` 내장 15종 ICC 프로파일 명세.
 */
export const CSP_ICC_COLOR_PROFILES: readonly CspIccColorProfileSpec[] = [
  makeIccProfile("srgb-iec61966-2.1", "sRGB Color Space Profile.icm", "sRGB IEC61966-2.1", "RGB", "Global", "Display", 400, 0),
  makeIccProfile("adobe-rgb-1998", "AdobeRGB1998.icc", "Adobe RGB (1998)", "RGB", "Global", "Display", 400, 0),
  makeIccProfile("apple-rgb", "AppleRGB.icc", "Apple RGB", "RGB", "Global", "Display", 400, 0),
  makeIccProfile("colormatch-rgb", "ColorMatchRGB.icc", "ColorMatch RGB", "RGB", "Global", "Display", 400, 0),
  makeIccProfile("display-p3", "Display P3.icc", "Display P3", "RGB", "Global", "Display", 400, 0),
  makeIccProfile("japan-color-2001-coated", "JapanColor2001Coated.icc", "Japan Color 2001 Coated (일본 상업 인쇄 코트지)", "CMYK", "Japan", "Coated", 350, 0.78),
  makeIccProfile("japan-color-2001-uncoated", "JapanColor2001Uncoated.icc", "Japan Color 2001 Uncoated (일본 상업 인쇄 비코트지)", "CMYK", "Japan", "Uncoated", 310, 0.72),
  makeIccProfile("japan-color-2002-newspaper", "JapanColor2002Newspaper.icc", "Japan Color 2002 Newspaper (일본 신문 인쇄)", "CMYK", "Japan", "Newspaper", 240, 0.65),
  makeIccProfile("japan-web-coated", "JapanWebCoated.icc", "Japan Web Coated (Ad)", "CMYK", "Japan", "WebCoated", 320, 0.75),
  makeIccProfile("us-web-coated-swop", "USWebCoatedSWOP.icc", "U.S. Web Coated (SWOP) v2", "CMYK", "US", "WebCoated", 300, 0.75),
  makeIccProfile("us-web-uncoated", "USWebUncoated.icc", "U.S. Web Uncoated v2", "CMYK", "US", "Uncoated", 260, 0.7),
  makeIccProfile("us-sheetfed-coated", "USSheetfedCoated.icc", "U.S. Sheetfed Coated v2", "CMYK", "US", "Coated", 350, 0.8),
  makeIccProfile("us-sheetfed-uncoated", "USSheetfedUncoated.icc", "U.S. Sheetfed Uncoated v2", "CMYK", "US", "Uncoated", 260, 0.7),
  makeIccProfile("europe-iso-coated-fogra27", "EuropeISOCoatedFOGRA27.icc", "Europe ISO Coated FOGRA27", "CMYK", "Europe", "Coated", 350, 0.78),
  makeIccProfile("euroscale-uncoated", "EuroscaleUncoated.icc", "Euroscale Uncoated v2", "CMYK", "Europe", "Uncoated", 260, 0.7),
] as const;

/**
 * RGB(`0..255`) 색상을 CSP 내장 CMYK 프로파일 기준으로 분판 및 소프트 프루핑(TAC 총 잉크량 제한 포함)한다.
 */
export function convertRgbToCspCmykSoftProof(
  rgb: readonly [number, number, number],
  profileId = "japan-color-2001-coated",
): CspCmykSoftProofResult {
  const profile =
    CSP_ICC_COLOR_PROFILES.find((p) => p.id === profileId) ??
    CSP_ICC_COLOR_PROFILES.find((p) => p.id === "japan-color-2001-coated")!;

  const rNorm = Math.max(0, Math.min(255, rgb[0])) / 255;
  const gNorm = Math.max(0, Math.min(255, rgb[1])) / 255;
  const bNorm = Math.max(0, Math.min(255, rgb[2])) / 255;

  const kRaw = 1 - Math.max(rNorm, gNorm, bNorm);
  const gcrK = kRaw * (profile.blackGenerationStrength || 0.75);
  const denom = Math.max(1e-6, 1 - gcrK);
  let c = Math.max(0, Math.min(1, (1 - rNorm - gcrK) / denom)) * 100;
  let m = Math.max(0, Math.min(1, (1 - gNorm - gcrK) / denom)) * 100;
  let y = Math.max(0, Math.min(1, (1 - bNorm - gcrK) / denom)) * 100;
  const k = Math.max(0, Math.min(1, gcrK)) * 100;

  const rawTac = c + m + y + k;
  const exceedsTacLimit = rawTac > profile.tacLimitPercent;
  if (exceedsTacLimit && c + m + y > 0) {
    const allowedCmy = Math.max(0, profile.tacLimitPercent - k);
    const scale = allowedCmy / (c + m + y);
    c *= scale;
    m *= scale;
    y *= scale;
  }

  const cPercent = Number(c.toFixed(1));
  const mPercent = Number(m.toFixed(1));
  const yPercent = Number(y.toFixed(1));
  const kPercent = Number(k.toFixed(1));
  const totalAreaCoveragePercent = Number((cPercent + mPercent + yPercent + kPercent).toFixed(1));

  const proofR = Math.round(255 * (1 - cPercent / 100) * (1 - kPercent / 100));
  const proofG = Math.round(255 * (1 - mPercent / 100) * (1 - kPercent / 100));
  const proofB = Math.round(255 * (1 - yPercent / 100) * (1 - kPercent / 100));

  return {
    cPercent,
    mPercent,
    yPercent,
    kPercent,
    totalAreaCoveragePercent,
    exceedsTacLimit,
    softProofRgb: [proofR, proofG, proofB],
  };
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/ColorSet/korean/` 기본 내장 컬러 세트 메타데이터.
 */
export const CSP_BUILTIN_COLORSET_ARCHIVES: readonly CspBuiltinColorSetArchiveMeta[] = [
  {
    fileName: "001Start.cls",
    displayNameKo: "시작 컬러 세트",
    swatchCount: 48,
    byteLength: 648,
  },
  {
    fileName: "002.cls",
    displayNameKo: "추가 컬러 세트",
    swatchCount: 371,
    byteLength: 4510,
  },
] as const;
