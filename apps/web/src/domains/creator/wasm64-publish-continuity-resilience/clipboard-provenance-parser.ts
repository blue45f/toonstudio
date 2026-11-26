/**
 * 클립보드·드롭 외부 이미지 에셋의 바이너리 메타데이터(PNG tEXt/iTXt/eXIf/caBX ·
 * JPEG APP1 Exif/XMP · APP11 C2PA · WebP EXIF/XMP/C2PA) 로컬 파서 및 저작권·AI 학습 금지 가드.
 */

export type AssetBinaryFormat = "png" | "jpeg" | "webp" | "unknown";
export type ProvenanceGuardDecision = "allow" | "warn" | "block";

export type ProvenanceRiskCode =
  | "unrecognized-binary-format"
  | "missing-license-attribution"
  | "do-not-train-prohibited"
  | "restricted-commercial-use"
  | "creator-digest-mismatch";

export interface ProvenanceRiskFinding {
  readonly code: ProvenanceRiskCode;
  readonly severity: "warning" | "blocking";
  readonly messageKo: string;
  readonly evidence?: string;
}

export interface ParsedAssetProvenanceMetadata {
  readonly chunksInspected: readonly string[];
  readonly creator: string | null;
  readonly rights: string | null;
  readonly licenseCode: string | null;
  readonly usageTerms: string | null;
  readonly embeddedCreatorDigest: string | null;
  readonly doNotTrainMarkers: readonly string[];
  readonly restrictedCommercialMarkers: readonly string[];
  readonly c2paManifestDetected: boolean;
  readonly rawEntries: Readonly<Record<string, string>>;
}

export interface ClipboardGuardPolicy {
  readonly commercialProject?: boolean;
  readonly requireLicenseAttribution?: boolean;
  readonly blockOnMissingAttribution?: boolean;
  readonly respectDoNotTrain?: boolean;
  readonly expectedCreatorDigest?: string;
}

export interface ClipboardAssetProvenanceReport {
  readonly format: AssetBinaryFormat;
  readonly byteLength: number;
  readonly contentFnv1aHex: string;
  readonly decision: ProvenanceGuardDecision;
  readonly safeToIngest: boolean;
  readonly parsedMetadata: ParsedAssetProvenanceMetadata;
  readonly findings: readonly ProvenanceRiskFinding[];
  readonly aiTokensUsed: 0;
  readonly serverCostKrw: 0;
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const LATIN1_DECODER = new TextDecoder("latin1", { fatal: false });

function fnv1a32Hex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function detectBinaryFormat(bytes: Uint8Array): AssetBinaryFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "unknown";
}

function readAsciiTag(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function parsePngChunks(
  bytes: Uint8Array,
  chunksInspected: string[],
  rawEntries: Record<string, string>,
  textBlobs: string[],
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = readAsciiTag(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    chunksInspected.push(`PNG:${type}`);
    const chunkData = bytes.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const zeroIdx = chunkData.indexOf(0);
      if (zeroIdx > 0) {
        const key = LATIN1_DECODER.decode(chunkData.subarray(0, zeroIdx)).trim();
        const value = LATIN1_DECODER.decode(chunkData.subarray(zeroIdx + 1)).trim();
        rawEntries[key] = value;
        textBlobs.push(`${key}=${value}`);
      }
    } else if (type === "iTXt") {
      const keyEnd = chunkData.indexOf(0);
      if (keyEnd > 0 && keyEnd + 3 < chunkData.length) {
        const key = LATIN1_DECODER.decode(chunkData.subarray(0, keyEnd)).trim();
        const compressionFlag = chunkData[keyEnd + 1];
        const langEnd = chunkData.indexOf(0, keyEnd + 3);
        const transEnd = langEnd >= 0 ? chunkData.indexOf(0, langEnd + 1) : -1;
        if (compressionFlag === 0 && transEnd >= 0) {
          const value = UTF8_DECODER.decode(chunkData.subarray(transEnd + 1)).trim();
          rawEntries[key] = value;
          textBlobs.push(`${key}=${value}`);
        }
      }
    } else if (type === "eXIf" || type === "caBX" || type === "c2pa") {
      const decoded = UTF8_DECODER.decode(chunkData);
      rawEntries[`png:${type}`] = decoded;
      textBlobs.push(decoded);
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
}

function parseJpegSegments(
  bytes: Uint8Array,
  chunksInspected: string[],
  rawEntries: Record<string, string>,
  textBlobs: string[],
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

    const payload = bytes.subarray(offset + 4, offset + 2 + segLen);
    if (marker === 0xe1) {
      const prefix = readAsciiTag(payload, 0, Math.min(29, payload.length));
      if (prefix.indexOf("http://ns.adobe.com/xap/1.0/") === 0) {
        chunksInspected.push("JPEG:APP1-XMP");
        const xmpStr = UTF8_DECODER.decode(payload.subarray(29));
        rawEntries["jpeg:xmp"] = xmpStr;
        textBlobs.push(xmpStr);
      } else if (prefix.indexOf("Exif\0\0") === 0) {
        chunksInspected.push("JPEG:APP1-EXIF");
        const exifStr = LATIN1_DECODER.decode(payload.subarray(6));
        rawEntries["jpeg:exif"] = exifStr;
        textBlobs.push(exifStr);
      } else {
        chunksInspected.push("JPEG:APP1");
        textBlobs.push(UTF8_DECODER.decode(payload));
      }
    } else if (marker === 0xeb) {
      chunksInspected.push("JPEG:APP11-JUMBF");
      const jumbStr = UTF8_DECODER.decode(payload);
      rawEntries["jpeg:app11"] = jumbStr;
      textBlobs.push(jumbStr);
    } else if (marker === 0xfe) {
      chunksInspected.push("JPEG:COM");
      const comment = UTF8_DECODER.decode(payload);
      rawEntries["jpeg:comment"] = comment;
      textBlobs.push(comment);
    }

    offset += 2 + segLen;
  }
}

function parseWebpChunks(
  bytes: Uint8Array,
  chunksInspected: string[],
  rawEntries: Record<string, string>,
  textBlobs: string[],
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourCc = readAsciiTag(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > bytes.length) break;

    chunksInspected.push(`WEBP:${fourCc.trim()}`);
    if (fourCc === "XMP " || fourCc === "EXIF" || fourCc === "C2PA" || fourCc === "JUMB") {
      const text = UTF8_DECODER.decode(bytes.subarray(dataStart, dataEnd));
      rawEntries[`webp:${fourCc.trim()}`] = text;
      textBlobs.push(text);
    }
    offset = dataEnd + (chunkSize % 2);
  }
}

function matchFirstTag(text: string, patterns: readonly RegExp[]): string | null {
  for (let i = 0; i < patterns.length; i += 1) {
    const match = patterns[i].exec(text);
    if (match && match[1] && match[1].trim().length > 0) return match[1].trim();
  }
  return null;
}

const DO_NOT_TRAIN_PATTERNS: readonly { readonly token: string; readonly label: string }[] = [
  { token: "dmi-prohibited", label: "PLUS DMI-PROHIBITED" },
  { token: "donottrain", label: "DoNotTrain" },
  { token: "do-not-train", label: "DoNotTrain" },
  { token: "c2pa.training-mining", label: "C2PA training-mining restriction" },
  { token: "noai", label: "NoAI" },
  { token: "noimageai", label: "NoImageAI" },
  { token: 'tdm:reservation="1"', label: "W3C TDM Reservation" },
];

const COMMERCIAL_RESTRICT_PATTERNS: readonly { readonly token: string; readonly label: string }[] = [
  { token: "cc-by-nc", label: "CC-BY-NC (비상업)" },
  { token: "non-commercial", label: "Non-Commercial" },
  { token: "noncommercial", label: "NonCommercial" },
  { token: "editorial-only", label: "Editorial Only" },
  { token: "personal-use-only", label: "Personal Use Only" },
];

/**
 * 붙여넣기·드롭된 외부 이미지 에셋의 바이너리 메타데이터(PNG/JPEG/WebP XMP·EXIF·C2PA)를
 * 프로젝트 진입 전에 로컬 검증해 저작권·AI 학습 금지·창작자 다이제스트 위험을 차단한다.
 */
export function inspectClipboardAssetProvenance(
  bytes: Uint8Array,
  policy?: ClipboardGuardPolicy,
): ClipboardAssetProvenanceReport {
  const commercialProject = policy?.commercialProject ?? true;
  const requireLicenseAttribution = policy?.requireLicenseAttribution ?? true;
  const blockOnMissingAttribution = policy?.blockOnMissingAttribution ?? false;
  const respectDoNotTrain = policy?.respectDoNotTrain ?? true;

  const format = detectBinaryFormat(bytes);
  const contentFnv1aHex = fnv1a32Hex(bytes);
  const chunksInspected: string[] = [];
  const rawEntries: Record<string, string> = {};
  const textBlobs: string[] = [];
  const findings: ProvenanceRiskFinding[] = [];

  if (format === "png") {
    parsePngChunks(bytes, chunksInspected, rawEntries, textBlobs);
  } else if (format === "jpeg") {
    parseJpegSegments(bytes, chunksInspected, rawEntries, textBlobs);
  } else if (format === "webp") {
    parseWebpChunks(bytes, chunksInspected, rawEntries, textBlobs);
  } else {
    findings.push({
      code: "unrecognized-binary-format",
      severity: "blocking",
      messageKo: "지원하지 않는 바이너리 형식(PNG/JPEG/WebP 아님)으로 출처 메타데이터를 검증할 수 없습니다.",
    });
  }

  const combined = textBlobs.join("\n");
  const lowerCombined = combined.toLowerCase();

  const creator =
    rawEntries.Author ??
    rawEntries.Artist ??
    matchFirstTag(combined, [/<dc:creator[^>]*>(?:[\s\S]*?<rdf:li[^>]*>)?([^<]+)/i, /Artist=([^\n\0]+)/i, /Creator=([^\n\0]+)/i]);
  const rights =
    rawEntries.Copyright ??
    rawEntries.Rights ??
    matchFirstTag(combined, [/<dc:rights[^>]*>(?:[\s\S]*?<rdf:li[^>]*>)?([^<]+)/i, /Copyright=([^\n\0]+)/i]);
  const licenseCode =
    rawEntries.License ??
    rawEntries["xmpRights:WebStatement"] ??
    matchFirstTag(combined, [/xmpRights:WebStatement="([^"]+)"/i, /<xmpRights:WebStatement[^>]*>([^<]+)/i, /License=([^\n\0]+)/i]);
  const usageTerms =
    rawEntries.UsageTerms ??
    matchFirstTag(combined, [/<xmpRights:UsageTerms[^>]*>(?:[\s\S]*?<rdf:li[^>]*>)?([^<]+)/i, /UsageTerms=([^\n\0]+)/i]);
  const embeddedCreatorDigest =
    rawEntries["toonstudio:creator-digest"] ??
    rawEntries.CreatorDigest ??
    matchFirstTag(combined, [/toonstudio:creator-digest="([^"]+)"/i, /<toonstudio:creator-digest[^>]*>([^<]+)/i, /CreatorDigest=([^\n\0]+)/i]);

  const doNotTrainMarkers: string[] = [];
  for (let i = 0; i < DO_NOT_TRAIN_PATTERNS.length; i += 1) {
    const p = DO_NOT_TRAIN_PATTERNS[i];
    if (lowerCombined.indexOf(p.token) >= 0 && !doNotTrainMarkers.includes(p.label)) {
      doNotTrainMarkers.push(p.label);
    }
  }

  const restrictedCommercialMarkers: string[] = [];
  for (let i = 0; i < COMMERCIAL_RESTRICT_PATTERNS.length; i += 1) {
    const p = COMMERCIAL_RESTRICT_PATTERNS[i];
    if (lowerCombined.indexOf(p.token) >= 0) restrictedCommercialMarkers.push(p.label);
  }
  if (lowerCombined.indexOf("all rights reserved") >= 0 && !licenseCode && restrictedCommercialMarkers.length === 0) {
    restrictedCommercialMarkers.push("All Rights Reserved (상업 허가 미확인)");
  }

  const c2paManifestDetected =
    chunksInspected.some((c) => c.indexOf("caBX") >= 0 || c.indexOf("C2PA") >= 0 || c.indexOf("JUMB") >= 0) ||
    lowerCombined.indexOf("urn:c2pa") >= 0 ||
    lowerCombined.indexOf("c2pa.assertions") >= 0 ||
    lowerCombined.indexOf("c2pa.actions") >= 0;

  if (format !== "unknown") {
    if (requireLicenseAttribution && !rights && !licenseCode && !usageTerms) {
      findings.push({
        code: "missing-license-attribution",
        severity: blockOnMissingAttribution ? "blocking" : "warning",
        messageKo: "이미지 메타데이터에 라이선스·저작권자 표기가 누락되어 있습니다.",
      });
    }
    if (respectDoNotTrain && doNotTrainMarkers.length > 0) {
      findings.push({
        code: "do-not-train-prohibited",
        severity: "blocking",
        messageKo: `AI 학습·데이터 마이닝 금지 마커(${doNotTrainMarkers.join(", ")})가 감지되었습니다.`,
        evidence: doNotTrainMarkers.join(", "),
      });
    }
    if (commercialProject && restrictedCommercialMarkers.length > 0) {
      findings.push({
        code: "restricted-commercial-use",
        severity: "blocking",
        messageKo: `상업적 사용 제한 조항(${restrictedCommercialMarkers.join(", ")})이 포함되어 프로젝트 유입을 차단합니다.`,
        evidence: restrictedCommercialMarkers.join(", "),
      });
    }
    if (policy?.expectedCreatorDigest && embeddedCreatorDigest !== policy.expectedCreatorDigest) {
      findings.push({
        code: "creator-digest-mismatch",
        severity: "blocking",
        messageKo: "내장된 창작자 다이제스트가 기대값과 일치하지 않습니다.",
        evidence: embeddedCreatorDigest ?? "none",
      });
    }
  }

  const hasBlocking = findings.some((f) => f.severity === "blocking");
  return {
    format,
    byteLength: bytes.length,
    contentFnv1aHex,
    decision: hasBlocking ? "block" : findings.length > 0 ? "warn" : "allow",
    safeToIngest: !hasBlocking,
    parsedMetadata: {
      chunksInspected,
      creator,
      rights,
      licenseCode,
      usageTerms,
      embeddedCreatorDigest,
      doNotTrainMarkers,
      restrictedCommercialMarkers,
      c2paManifestDetected,
      rawEntries,
    },
    findings,
    aiTokensUsed: 0,
    serverCostKrw: 0,
  };
}
