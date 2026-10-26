/**
 * @file csp-c2fr-c3dd-psd-pdfx.ts
 * @description Clip Studio Paint 5.1.5 3D 캐릭터 아카이브(`.c2fr` POSIX ustar TAR / `<CelsysCharacterInfo>` / `<Celsys_Ninin-Baori_Info>`),
 * 3D 데생 인형 데이터베이스(`.c3dd` `CLIP_STUDIO_3D_DATA`/`CLIP_STUDIO_3D_DATA2` `catalog_dessindoll`),
 * 그리고 6종 FormatPlugIn(`ExportPSD`, `ExportPSB`, `ExportPDFX`, `ImportPSD`, `ImportPSB`, `ImportPDFX`) `PsDescriptor` 바이너리 코덱.
 */

export * from "./csp-hand-setup-pad";

// ============================================================================
// 1. Celsys .c2fr (POSIX ustar TAR + CelsysCharacterInfo + Ninin-Baori .nnb)
// ============================================================================

export interface CspC2frTarEntryMeta {
  readonly name: string;
  readonly sizeBytes: number;
  readonly modeOctal: number;
  readonly uid: number;
  readonly gid: number;
  readonly mtimeUnixSec: number;
  readonly typeFlag: string;
  readonly dataOffset: number;
}

export interface CspC2frTarManifest {
  readonly totalByteLength: number;
  readonly entries: readonly CspC2frTarEntryMeta[];
  readonly hasFbxModel: boolean;
  readonly hasNnbRigging: boolean;
  readonly hasCharacterInfoXml: boolean;
}

export interface CspC2frTarInputEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly modeOctal?: number;
  readonly mtimeUnixSec?: number;
}

function readNullTerminatedAscii(bytes: Uint8Array, start: number, length: number): string {
  let end = start;
  const limit = Math.min(bytes.length, start + length);
  while (end < limit && bytes[end] !== 0) {
    end += 1;
  }
  let out = "";
  for (let i = start; i < end; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out.trim();
}

function parseTarOctalField(bytes: Uint8Array, start: number, length: number): number {
  const raw = readNullTerminatedAscii(bytes, start, length).replace(/\0/g, "").trim();
  if (raw.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeAsciiField(target: Uint8Array, offset: number, maxLen: number, text: string): void {
  const len = Math.min(maxLen, text.length);
  for (let i = 0; i < len; i += 1) {
    target[offset + i] = text.charCodeAt(i) & 0xff;
  }
}

function writeOctalField(
  target: Uint8Array,
  offset: number,
  fieldLength: number,
  value: number,
): void {
  const digits = Math.max(0, Math.trunc(value)).toString(8).padStart(fieldLength - 1, "0");
  writeAsciiField(target, offset, fieldLength - 1, digits);
  target[offset + fieldLength - 1] = 0;
}

/**
 * `.c2fr` 아카이브(`default_model_man.c2fr`, `default_model_woman.c2fr`)의
 * 512바이트 블록 POSIX `ustar` TAR 헤더 목록을 파싱합니다.
 */
export function parseCspC2frTarManifest(bytes: Uint8Array): CspC2frTarManifest {
  if (bytes.byteLength < 512) {
    throw new Error(`Invalid .c2fr TAR archive: byteLength=${bytes.byteLength} (< 512)`);
  }
  const entries: CspC2frTarEntryMeta[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.byteLength) {
    let allZero = true;
    for (let i = 0; i < 512; i += 1) {
      if (bytes[offset + i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      break;
    }

    const name = readNullTerminatedAscii(bytes, offset, 100);
    const modeOctal = parseTarOctalField(bytes, offset + 100, 8);
    const uid = parseTarOctalField(bytes, offset + 108, 8);
    const gid = parseTarOctalField(bytes, offset + 116, 8);
    const sizeBytes = parseTarOctalField(bytes, offset + 124, 12);
    const mtimeUnixSec = parseTarOctalField(bytes, offset + 136, 12);
    const typeFlagChar = bytes[offset + 156] ?? 0;
    const typeFlag = typeFlagChar === 0 ? "0" : String.fromCharCode(typeFlagChar);
    const magic = readNullTerminatedAscii(bytes, offset + 257, 6);
    if (magic !== "ustar" && name.length === 0) {
      throw new Error(`Invalid TAR header block at offset ${offset}: missing ustar magic`);
    }

    const prefix = readNullTerminatedAscii(bytes, offset + 345, 155);
    const fullName = prefix.length > 0 ? `${prefix}/${name}` : name;
    const dataOffset = offset + 512;

    entries.push({
      name: fullName,
      sizeBytes,
      modeOctal,
      uid,
      gid,
      mtimeUnixSec,
      typeFlag,
      dataOffset,
    });

    const paddedSize = Math.ceil(sizeBytes / 512) * 512;
    offset = dataOffset + paddedSize;
  }

  return {
    totalByteLength: bytes.byteLength,
    entries,
    hasFbxModel: entries.some((e) => e.name.toLowerCase().endsWith(".fbx")),
    hasNnbRigging: entries.some((e) => e.name.toLowerCase().endsWith(".nnb")),
    hasCharacterInfoXml: entries.some((e) => e.name === "metadata/info.xml"),
  };
}

/**
 * `.c2fr` 아카이브에서 특정 엔트리의 바이트 페이로드를 추출합니다.
 */
export function extractCspC2frTarEntryBytes(
  archiveBytes: Uint8Array,
  entryName: string,
): Uint8Array | null {
  const manifest = parseCspC2frTarManifest(archiveBytes);
  const found = manifest.entries.find((e) => e.name === entryName);
  if (!found) {
    return null;
  }
  return archiveBytes.subarray(found.dataOffset, found.dataOffset + found.sizeBytes);
}

/**
 * 엔트리 목록을 POSIX `ustar\x0000` 512바이트 정렬 `.c2fr` TAR 아카이브로 인코딩합니다.
 */
export function encodeCspC2frTarArchive(entries: readonly CspC2frTarInputEntry[]): Uint8Array {
  let totalSize = 1024;
  for (const entry of entries) {
    totalSize += 512 + Math.ceil(entry.data.byteLength / 512) * 512;
  }

  const out = new Uint8Array(totalSize);
  let offset = 0;

  for (const entry of entries) {
    const header = out.subarray(offset, offset + 512);
    writeAsciiField(header, 0, 100, entry.name);
    writeOctalField(header, 100, 8, entry.modeOctal ?? 0o777);
    writeOctalField(header, 108, 8, 0);
    writeOctalField(header, 116, 8, 0);
    writeOctalField(header, 124, 12, entry.data.byteLength);
    writeOctalField(header, 136, 12, entry.mtimeUnixSec ?? 1352205602);
    for (let i = 148; i < 156; i += 1) {
      header[i] = 0x20;
    }
    header[156] = "0".charCodeAt(0);
    writeAsciiField(header, 257, 6, "ustar");
    header[263] = "0".charCodeAt(0);
    header[264] = "0".charCodeAt(0);

    let checksum = 0;
    for (let i = 0; i < 512; i += 1) {
      checksum += header[i]!;
    }
    writeOctalField(header, 148, 7, checksum);
    header[155] = 0x20;

    offset += 512;
    out.set(entry.data, offset);
    offset += Math.ceil(entry.data.byteLength / 512) * 512;
  }

  return out;
}

export interface CspC2frCharacterInfoMeta {
  readonly version: string;
  readonly tool: string;
  readonly aliasName: string;
  readonly characterType: string;
  readonly plainScaleCm: number;
  readonly partsGroupCount: number;
  readonly modelFilename: string;
  readonly modelUuid: string;
  readonly meshName: string;
  readonly materialName: string;
  readonly diffuseTextureFilename: string;
  readonly nnbFilename: string;
  readonly partsGroups: readonly {
    readonly aliasName: string;
    readonly selectMode: "toggle" | "checkable";
  }[];
}

function readXmlAttribute(tagText: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = regex.exec(tagText);
  return match?.[1] ?? "";
}

/**
 * `.c2fr` 내부 `metadata/info.xml` 및 `metadata/info_parts_0.xml` (`<CelsysCharacterInfo>`)을 파싱합니다.
 */
export function parseCspC2frCharacterInfoXml(xmlText: string): CspC2frCharacterInfoMeta {
  const rootMatch = /<CelsysCharacterInfo[^>]*>/i.exec(xmlText);
  const infoMatch = /<info[^>]*>/i.exec(xmlText);
  const charMatch = /<character[^>]*>/i.exec(xmlText);
  const fileMatch = /<file[^>]*>/i.exec(xmlText);
  const partsMatch = /<parts\s[^>]*>/i.exec(xmlText);
  const meshMatch = /<mesh[^>]*>/i.exec(xmlText);
  const materialMatch = /<material[^>]*>/i.exec(xmlText);
  const textureMatch = /<texture[^>]*>/i.exec(xmlText);

  const partsGroups: { aliasName: string; selectMode: "toggle" | "checkable" }[] = [];
  const groupRegex = /<parts_group\s+([^>]*?)\/?>/gi;
  let groupMatch = groupRegex.exec(xmlText);
  while (groupMatch !== null) {
    const attrs = groupMatch[1] ?? "";
    const aliasName = readXmlAttribute(attrs, "alias_name");
    const selectModeRaw = readXmlAttribute(attrs, "select_mode");
    if (aliasName.length > 0) {
      partsGroups.push({
        aliasName,
        selectMode: selectModeRaw === "checkable" ? "checkable" : "toggle",
      });
    }
    groupMatch = groupRegex.exec(xmlText);
  }

  return {
    version: rootMatch ? readXmlAttribute(rootMatch[0], "version") || "1.0.0" : "1.0.0",
    tool: infoMatch ? readXmlAttribute(infoMatch[0], "tool") : "CHARACTER STDUIO 1.0",
    aliasName: charMatch ? readXmlAttribute(charMatch[0], "alias_name") : "",
    characterType: charMatch ? readXmlAttribute(charMatch[0], "type") || "dessindoll" : "dessindoll",
    plainScaleCm: charMatch
      ? Number.parseFloat(readXmlAttribute(charMatch[0], "plain_scale") || "170")
      : 170,
    partsGroupCount: charMatch
      ? Number.parseInt(readXmlAttribute(charMatch[0], "parts_gourp_count") || "11", 10)
      : partsGroups.length,
    modelFilename: fileMatch
      ? readXmlAttribute(fileMatch[0], "model_filename").replace(/\\/g, "/")
      : "",
    modelUuid: fileMatch ? readXmlAttribute(fileMatch[0], "model_uuid") : "",
    meshName: meshMatch ? readXmlAttribute(meshMatch[0], "mesh_name") : "",
    materialName: materialMatch ? readXmlAttribute(materialMatch[0], "material_name") : "",
    diffuseTextureFilename: textureMatch
      ? readXmlAttribute(textureMatch[0], "texture_filename").replace(/\\/g, "/")
      : "",
    nnbFilename: partsMatch
      ? readXmlAttribute(partsMatch[0], "nnb_filename").replace(/\\/g, "/")
      : "",
    partsGroups,
  };
}

export interface CspNininBaoriBoneLink {
  readonly sourceParentBone: string;
  readonly sourceChildBone: string;
  readonly destinationParentBone: string;
  readonly destinationChildBone: string;
}

export interface CspNininBaoriNnbMeta {
  readonly version: string;
  readonly tool: string;
  readonly nameListFormat: number;
  readonly boneLinks: readonly CspNininBaoriBoneLink[];
}

function decodeXmlCrLfEntities(raw: string): [string, string] {
  const normalized = raw
    .replace(/&#xD;&#xA;/gi, "\n")
    .replace(/&#13;&#10;/g, "\n")
    .replace(/\r\n/g, "\n");
  const parts = normalized.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
  return [parts[0] ?? "", parts[1] ?? parts[0] ?? ""];
}

/**
 * `.c2fr` 내부 `metadata/parts_0000.nnb` (`<Celsys_Ninin-Baori_Info>`) 3D 본 리타겟팅 매핑을 파싱합니다.
 */
export function parseCspNininBaoriNnbXml(xmlText: string): CspNininBaoriNnbMeta {
  const rootMatch = /<Celsys_Ninin-Baori_Info[^>]*>/i.exec(xmlText);
  const infoMatch = /<info[^>]*>/i.exec(xmlText);
  const nnbMatch = /<ninin-baori[^>]*>/i.exec(xmlText);

  const boneLinks: CspNininBaoriBoneLink[] = [];
  const bgRegex = /<bone_group\s+([^>]*?)>/gi;
  let match = bgRegex.exec(xmlText);
  while (match !== null) {
    const attrs = match[1] ?? "";
    const dstRaw = readXmlAttribute(attrs, "destination_name_group");
    const srcRaw = readXmlAttribute(attrs, "source_name_group");
    if (dstRaw.length > 0 && srcRaw.length > 0) {
      const [sourceParentBone, sourceChildBone] = decodeXmlCrLfEntities(srcRaw);
      const [destinationParentBone, destinationChildBone] = decodeXmlCrLfEntities(dstRaw);
      boneLinks.push({
        sourceParentBone,
        sourceChildBone,
        destinationParentBone,
        destinationChildBone,
      });
    }
    match = bgRegex.exec(xmlText);
  }

  return {
    version: rootMatch ? readXmlAttribute(rootMatch[0], "version") || "1.0.0" : "1.0.0",
    tool: infoMatch ? readXmlAttribute(infoMatch[0], "tool") || "NnB_Module 1.0" : "NnB_Module 1.0",
    nameListFormat: nnbMatch
      ? Number.parseInt(readXmlAttribute(nnbMatch[0], "name_list_fmt") || "1", 10)
      : 1,
    boneLinks,
  };
}

export const CSP_DEFAULT_3D_CHARACTER_C2FR_SPECS = [
  {
    fileName: "default_model_man.c2fr",
    archiveSizeBytes: 6_839_808,
    aliasName: "default_model_man",
    plainScaleCm: 170,
    fbxEntryPath: "data/shape_man_07.fbx",
    fbxSizeBytes: 6_295_268,
    modelUuid: "e04dcd8b06-4641-f5bc-d5f4-6d7bbd21a9",
    meshName: "ShapeMan_Average",
    materialName: "shapeman_base_mat",
    diffuseTexturePath: "data/shape_human_tex.jpg",
    nnbEntryPath: "metadata/parts_0000.nnb",
    nnbSizeBytes: 46_105,
  },
  {
    fileName: "default_model_woman.c2fr",
    archiveSizeBytes: 6_375_936,
    aliasName: "default_model_woman",
    plainScaleCm: 160,
    fbxEntryPath: "data/shape_woman_05.fbx",
    fbxSizeBytes: 5_831_508,
    modelUuid: "a27c85c601-1180-c7ba-8455-5ef68bc11f",
    meshName: "ShapeWoman_Average",
    materialName: "shapewoman_base_mat",
    diffuseTexturePath: "data/shape_human_tex.jpg",
    nnbEntryPath: "metadata/parts_0000.nnb",
    nnbSizeBytes: 46_154,
  },
] as const;

// ============================================================================
// 2. Celsys .c3dd (CLIP_STUDIO_3D_DATA / CLIP_STUDIO_3D_DATA2 catalog_dessindoll)
// ============================================================================

export type CspC3ddMagicSignature = "CLIP_STUDIO_3D_DATA" | "CLIP_STUDIO_3D_DATA2";

export interface CspC3ddCatalogDataHeader {
  readonly magicSignature: CspC3ddMagicSignature;
  readonly catalogCategory: "catalog_dessindoll" | "catalog_object";
  readonly uuidHex: string;
  readonly formatVersion: number;
  readonly headerByteLength: number;
  readonly payloadByteLength: number;
}

function bytesToUuidHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push((bytes[i] ?? 0).toString(16).padStart(2, "0"));
  }
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

function uuidHexToBytes(uuidHex: string): Uint8Array {
  const clean = uuidHex.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) & 0xff;
  }
  return out;
}

/**
 * `.c3dd` SQLite `dessindoll.catalog_data` BLOB 헤더(`CLIP_STUDIO_3D_DATA` v1 / `CLIP_STUDIO_3D_DATA2` v2)를 파싱합니다.
 */
export function parseCspC3ddCatalogDataHeader(blob: Uint8Array): CspC3ddCatalogDataHeader {
  if (blob.byteLength < 64) {
    throw new Error(`Invalid .c3dd catalog_data blob: length=${blob.byteLength}`);
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const magicLen = view.getUint32(0, true);
  if (magicLen !== 19 && magicLen !== 20) {
    throw new Error(`Unsupported .c3dd magic length: ${magicLen}`);
  }
  let magic = "";
  for (let i = 0; i < magicLen; i += 1) {
    magic += String.fromCharCode(blob[4 + i]!);
  }
  if (magic !== "CLIP_STUDIO_3D_DATA" && magic !== "CLIP_STUDIO_3D_DATA2") {
    throw new Error(`Invalid .c3dd magic string: ${magic}`);
  }

  let cursor = 4 + magicLen;
  const catLen = view.getUint32(cursor, true);
  cursor += 4;
  if (catLen > 64 || cursor + catLen + 20 > blob.byteLength) {
    throw new Error(`Invalid .c3dd category length: ${catLen}`);
  }
  let category = "";
  for (let i = 0; i < catLen; i += 1) {
    category += String.fromCharCode(blob[cursor + i]!);
  }
  cursor += catLen;

  const uuidHex = bytesToUuidHex(blob.subarray(cursor, cursor + 16));
  cursor += 16;
  const formatVersion = view.getUint32(cursor, true);
  cursor += 4;

  return {
    magicSignature: magic,
    catalogCategory: category === "catalog_object" ? "catalog_object" : "catalog_dessindoll",
    uuidHex,
    formatVersion,
    headerByteLength: cursor,
    payloadByteLength: blob.byteLength - cursor,
  };
}

/**
 * `.c3dd` `catalog_dessindoll` BLOB 헤더와 페이로드를 인코딩합니다.
 */
export function encodeCspC3ddCatalogDataBlob(params: {
  readonly magicSignature: CspC3ddMagicSignature;
  readonly catalogCategory?: "catalog_dessindoll" | "catalog_object";
  readonly uuidHex?: string;
  readonly formatVersion?: number;
  readonly payload?: Uint8Array;
}): Uint8Array {
  const magic = params.magicSignature;
  const category = params.catalogCategory ?? "catalog_dessindoll";
  const uuidBytes = uuidHexToBytes(params.uuidHex ?? "bfec07b0-429c-401d-ad9f-70dcff0b06ef");
  const formatVersion =
    params.formatVersion ?? (magic === "CLIP_STUDIO_3D_DATA" ? 4 : 2);
  const payload = params.payload ?? new Uint8Array(0);

  const headerSize = 4 + magic.length + 4 + category.length + 16 + 4;
  const out = new Uint8Array(headerSize + payload.byteLength);
  const view = new DataView(out.buffer);

  let cursor = 0;
  view.setUint32(cursor, magic.length, true);
  cursor += 4;
  writeAsciiField(out, cursor, magic.length, magic);
  cursor += magic.length;

  view.setUint32(cursor, category.length, true);
  cursor += 4;
  writeAsciiField(out, cursor, category.length, category);
  cursor += category.length;

  out.set(uuidBytes, cursor);
  cursor += 16;

  view.setUint32(cursor, formatVersion, true);
  cursor += 4;

  out.set(payload, cursor);
  return out;
}

export const CSP_DESSIN_DOLL_C3DD_SPECS = [
  {
    fileName: "dessindoll_man_ver1.c3dd",
    sqliteSizeBytes: 5_906_432,
    catalogDataSizeBytes: 5_872_663,
    magicSignature: "CLIP_STUDIO_3D_DATA",
    formatVersion: 4,
    uuidHex: "bfec07b0-429c-401d-ad9f-70dcff0b06ef",
  },
  {
    fileName: "dessindoll_woman_ver1.c3dd",
    sqliteSizeBytes: 6_266_880,
    catalogDataSizeBytes: 6_230_512,
    magicSignature: "CLIP_STUDIO_3D_DATA",
    formatVersion: 4,
    uuidHex: "bfec07b0-429c-401d-ad9f-70dcff0b06ef",
  },
  {
    fileName: "dessindoll_man_ver2.c3dd",
    sqliteSizeBytes: 1_966_080,
    catalogDataSizeBytes: 1_941_747,
    magicSignature: "CLIP_STUDIO_3D_DATA2",
    formatVersion: 2,
    uuidHex: "bfec07b0-429c-401d-ad9f-70dcff0b06ef",
  },
  {
    fileName: "dessindoll_woman_ver2.c3dd",
    sqliteSizeBytes: 1_957_888,
    catalogDataSizeBytes: 1_932_166,
    magicSignature: "CLIP_STUDIO_3D_DATA2",
    formatVersion: 2,
    uuidHex: "bfec07b0-429c-401d-ad9f-70dcff0b06ef",
  },
] as const;

// ============================================================================
// 3. FormatPlugIn (ExportPSD/PSB/PDFX, ImportPSD/PSB/PDFX) & PsDescriptor Codec
// ============================================================================

export interface CspFormatPlugInBundleSpec {
  readonly bundleName: string;
  readonly direction: "export" | "import";
  readonly formatFamily: "PSD" | "PSB" | "PDFX";
  readonly entrySymbol: "_TriglavPlugInMain";
  readonly nativeClasses: readonly string[];
  readonly capabilities: readonly string[];
}

export const CSP_FORMAT_PLUGIN_BUNDLE_SPECS: readonly CspFormatPlugInBundleSpec[] = [
  {
    bundleName: "ExportPSD.bundle",
    direction: "export",
    formatFamily: "PSD",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["PIExportPsDocument", "SPSLayer", "SPSAlphaChannel", "SPSCurves::Record", "PsTypeToolObjectSetting", "PsEngineDataWriter", "PsDescriptor"],
    capabilities: ["cmyk_duotone_rgb_gray", "typetool_engine_data", "adjustment_layers", "alpha_channels"],
  },
  {
    bundleName: "ExportPSB.bundle",
    direction: "export",
    formatFamily: "PSB",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["PIExportPsDocument", "SPSLayer", "SPSChannelInfo::Item", "PsTypeToolObjectSetting", "PsEngineDataWriter", "PsDescriptor"],
    capabilities: ["64bit_large_document_300000px", "typetool_engine_data", "adjustment_layers"],
  },
  {
    bundleName: "ImportPSD.bundle",
    direction: "import",
    formatFamily: "PSD",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["PIImportPsOffscreen", "SPSLayer", "SPSAlphaChannel", "PsTypeToolObjectSetting", "PsDescriptor"],
    capabilities: ["layer_tree_reconstruction", "transparency_mask_import", "typetool_text_bounds"],
  },
  {
    bundleName: "ImportPSB.bundle",
    direction: "import",
    formatFamily: "PSB",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["PIImportPsOffscreen", "SPSLayer", "PsTypeToolObjectSetting", "PsDescriptor"],
    capabilities: ["64bit_large_document_import", "layer_tree_reconstruction"],
  },
  {
    bundleName: "ExportPDFX.bundle",
    direction: "export",
    formatFamily: "PDFX",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["Triglav::PlugIn::ExportPDFX::Module", "Triglav::PlugIn::PDFWriter", "PDF::ExportStream", "JpegCompressor"],
    capabilities: ["pdf_x_1a_x_4_output_intent", "flate_decode_and_dct_jpeg", "icc_profile_embedding", "chacha20_12_document_uuid", "page_spread_direction_binding"],
  },
  {
    bundleName: "ImportPDFX.bundle",
    direction: "import",
    formatFamily: "PDFX",
    entrySymbol: "_TriglavPlugInMain",
    nativeClasses: ["Triglav::PlugIn::ImportPDFX::Module", "Triglav::PlugIn::PDFImportStream"],
    capabilities: ["multi_page_pdf_rasterization", "crop_bleed_trim_box_parsing"],
  },
] as const;

export type CspPsDescriptorValue =
  | { readonly osType: "long"; readonly value: number }
  | { readonly osType: "doub"; readonly value: number }
  | { readonly osType: "bool"; readonly value: boolean }
  | { readonly osType: "TEXT"; readonly value: string }
  | { readonly osType: "UntF"; readonly unitFourCc: string; readonly value: number }
  | { readonly osType: "enum"; readonly typeId: string; readonly enumValue: string };

export interface CspPsDescriptorObject {
  readonly descriptorVersion: number;
  readonly classNameUnicode: string;
  readonly classId: string;
  readonly items: readonly {
    readonly keyId: string;
    readonly data: CspPsDescriptorValue;
  }[];
}

function writePsIdOrFourCc(buf: number[], id: string): void {
  if (id.length === 4) {
    buf.push(0, 0, 0, 0);
    for (let i = 0; i < 4; i += 1) {
      buf.push(id.charCodeAt(i) & 0xff);
    }
  } else {
    const len = id.length;
    buf.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (let i = 0; i < len; i += 1) {
      buf.push(id.charCodeAt(i) & 0xff);
    }
  }
}

function writePsUnicodeString(buf: number[], text: string): void {
  const charCount = text.length + 1;
  buf.push(
    (charCount >>> 24) & 0xff,
    (charCount >>> 16) & 0xff,
    (charCount >>> 8) & 0xff,
    charCount & 0xff,
  );
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    buf.push((code >>> 8) & 0xff, code & 0xff);
  }
  buf.push(0, 0);
}

function writeUint32BE(buf: number[], v: number): void {
  buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

function writeFloat64BE(buf: number[], v: number): void {
  const tmp = new ArrayBuffer(8);
  new DataView(tmp).setFloat64(0, v, false);
  const bytes = new Uint8Array(tmp);
  for (let i = 0; i < 8; i += 1) {
    buf.push(bytes[i]!);
  }
}

/**
 * `ExportPSD.bundle` / `ExportPSB.bundle` 내 `PsDescriptor::Write`와 동일한
 * Big-Endian Photoshop Action Descriptor(`version = 16`) 바이너리 스트림으로 인코딩합니다.
 */
export function encodeCspPsDescriptorStream(descriptor: CspPsDescriptorObject): Uint8Array {
  const buf: number[] = [];
  writeUint32BE(buf, descriptor.descriptorVersion);
  writePsUnicodeString(buf, descriptor.classNameUnicode);
  writePsIdOrFourCc(buf, descriptor.classId);
  writeUint32BE(buf, descriptor.items.length);

  for (const item of descriptor.items) {
    writePsIdOrFourCc(buf, item.keyId);
    const osType = item.data.osType;
    for (let i = 0; i < 4; i += 1) {
      buf.push(osType.charCodeAt(i) & 0xff);
    }
    switch (item.data.osType) {
      case "long":
        writeUint32BE(buf, item.data.value | 0);
        break;
      case "doub":
        writeFloat64BE(buf, item.data.value);
        break;
      case "bool":
        buf.push(item.data.value ? 1 : 0);
        break;
      case "TEXT":
        writePsUnicodeString(buf, item.data.value);
        break;
      case "UntF": {
        const unit = item.data.unitFourCc.padEnd(4, " ").slice(0, 4);
        for (let i = 0; i < 4; i += 1) {
          buf.push(unit.charCodeAt(i) & 0xff);
        }
        writeFloat64BE(buf, item.data.value);
        break;
      }
      case "enum":
        writePsIdOrFourCc(buf, item.data.typeId);
        writePsIdOrFourCc(buf, item.data.enumValue);
        break;
    }
  }

  return new Uint8Array(buf);
}

/**
 * `ImportPSD.bundle` / `ImportPSB.bundle` 내 `PsDescriptor` Big-Endian 바이너리 스트림을 디코딩합니다.
 */
export function parseCspPsDescriptorStream(bytes: Uint8Array): CspPsDescriptorObject {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;

  const readU32 = (): number => {
    const val = view.getUint32(cursor, false);
    cursor += 4;
    return val;
  };
  const readUnicode = (): string => {
    const count = readU32();
    let out = "";
    for (let i = 0; i < count; i += 1) {
      const code = view.getUint16(cursor, false);
      cursor += 2;
      if (code !== 0) {
        out += String.fromCharCode(code);
      }
    }
    return out;
  };
  const readIdOrFourCc = (): string => {
    const len = readU32();
    const actualLen = len === 0 ? 4 : len;
    let out = "";
    for (let i = 0; i < actualLen; i += 1) {
      out += String.fromCharCode(bytes[cursor + i]!);
    }
    cursor += actualLen;
    return out;
  };

  const descriptorVersion = readU32();
  const classNameUnicode = readUnicode();
  const classId = readIdOrFourCc();
  const itemCount = readU32();
  const items: { keyId: string; data: CspPsDescriptorValue }[] = [];

  for (let i = 0; i < itemCount; i += 1) {
    const keyId = readIdOrFourCc();
    const osType = String.fromCharCode(
      bytes[cursor]!,
      bytes[cursor + 1]!,
      bytes[cursor + 2]!,
      bytes[cursor + 3]!,
    );
    cursor += 4;

    if (osType === "long") {
      const value = view.getInt32(cursor, false);
      cursor += 4;
      items.push({ keyId, data: { osType: "long", value } });
    } else if (osType === "doub") {
      const value = view.getFloat64(cursor, false);
      cursor += 8;
      items.push({ keyId, data: { osType: "doub", value } });
    } else if (osType === "bool") {
      const value = bytes[cursor]! !== 0;
      cursor += 1;
      items.push({ keyId, data: { osType: "bool", value } });
    } else if (osType === "TEXT") {
      const value = readUnicode();
      items.push({ keyId, data: { osType: "TEXT", value } });
    } else if (osType === "UntF") {
      const unitFourCc = String.fromCharCode(
        bytes[cursor]!,
        bytes[cursor + 1]!,
        bytes[cursor + 2]!,
        bytes[cursor + 3]!,
      );
      cursor += 4;
      const value = view.getFloat64(cursor, false);
      cursor += 8;
      items.push({ keyId, data: { osType: "UntF", unitFourCc, value } });
    } else if (osType === "enum") {
      const typeId = readIdOrFourCc();
      const enumValue = readIdOrFourCc();
      items.push({ keyId, data: { osType: "enum", typeId, enumValue } });
    } else {
      throw new Error(`Unsupported PsDescriptor OSType: ${osType}`);
    }
  }

  return {
    descriptorVersion,
    classNameUnicode,
    classId,
    items,
  };
}
