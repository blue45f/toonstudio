/**
 * @file csp-material-boot-placement.ts
 * @description Clip Studio Paint 1.5 (v5.1.5) 소재 패키지(`Paint001`..`Paint112`, `CatalogMaterial.cmdb`),
 *              `InstallPathToCatalogId.dat` 매핑 테이블, Celsys C2F(`\x89C2F\r\n\x1a\n`) 청크 컨테이너,
 *              `catalog.xml`/`info.xml`/`icedata/layerData.xml`/`catalogMaterial.cac` 및
 *              Application Support(`SubToolPreview.sqlite`, `WorkFolder.sqlite`, `placement.sqlite`,
 *              `Config.sqlite`, `CreatorStudioInfo.stup`) 바이너리/SQLite 코덱 모듈 (Pass 5)
 */

// ---------------------------------------------------------------------------
// 1. InstallPathToCatalogId.dat (64-bit BE 개수 + 32-bit BE 길이 프리픽스 UTF-8 쌍)
// ---------------------------------------------------------------------------

export interface CspInstallPathToCatalogIdEntry {
	readonly installPath: string;
	readonly catalogTargetPath: string;
	readonly packageFolder: string;
	readonly catalogUuid: string;
	readonly relativeDataPath: string;
}

export interface CspInstallPathToCatalogIdTable {
	readonly entryCount: number;
	readonly byteLength: number;
	readonly entries: readonly CspInstallPathToCatalogIdEntry[];
}

export const CSP_INSTALL_PATH_TO_CATALOG_ID_PRESETS: readonly CspInstallPathToCatalogIdEntry[] = [
	{ installPath: ".:15_brush_pattern:04_plant:twig01.layer", catalogTargetPath: ".:Paint001:3bbbb1e12e-6541-9094-80da-3bfda8e93f:data:material.layer", packageFolder: "Paint001", catalogUuid: "3bbbb1e12e-6541-9094-80da-3bfda8e93f", relativeDataPath: "data:material.layer" },
	{ installPath: ".:15_brush_pattern:04_plant:twig03.layer", catalogTargetPath: ".:Paint001:3babd3ee3a-6646-fbaa-f1ad-7e921804c1:data:material.layer", packageFolder: "Paint001", catalogUuid: "3babd3ee3a-6646-fbaa-f1ad-7e921804c1", relativeDataPath: "data:material.layer" },
	{ installPath: ".:15_brush_pattern:03_picture:keepout.layer", catalogTargetPath: ".:Paint003:147304e413-0f4e-9686-766d-e4d2701879:data:material.layer", packageFolder: "Paint003", catalogUuid: "147304e413-0f4e-9686-766d-e4d2701879", relativeDataPath: "data:material.layer" },
	{ installPath: ".:15_brush_pattern:04_plant:maple_A.layer", catalogTargetPath: ".:Paint004:bd6a5d9a5d-e241-de86-b060-861cb25dc6:data:material.layer", packageFolder: "Paint004", catalogUuid: "bd6a5d9a5d-e241-de86-b060-861cb25dc6", relativeDataPath: "data:material.layer" },
	{ installPath: ".:15_brush_pattern:02_effect:heart.layer", catalogTargetPath: ".:Paint002:41ce580f27-c140-408b-c39e-010c8713bb:data:material.layer", packageFolder: "Paint002", catalogUuid: "41ce580f27-c140-408b-c39e-010c8713bb", relativeDataPath: "data:material.layer" },
] as const;

function parseCatalogTargetPathComponents(catalogTargetPath: string): {
	readonly packageFolder: string;
	readonly catalogUuid: string;
	readonly relativeDataPath: string;
} {
	const trimmed = catalogTargetPath.startsWith(".:")
		? catalogTargetPath.slice(2)
		: catalogTargetPath;
	const parts = trimmed.split(":");
	return {
		packageFolder: parts[0] ?? "",
		catalogUuid: parts[1] ?? "",
		relativeDataPath: parts.slice(2).join(":"),
	};
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Material/InstallPathToCatalogId.dat`
 * 바이너리 매핑 테이블 파서 (Big-Endian uint64 개수 + Big-Endian uint32 길이 프리픽스 UTF-8 문자열 쌍)
 */
export function parseCspInstallPathToCatalogIdDat(
	buffer: Uint8Array,
): CspInstallPathToCatalogIdTable {
	if (buffer.byteLength < 8) {
		throw new Error("InstallPathToCatalogId.dat 버퍼가 최소 헤더 크기(8바이트)보다 작습니다.");
	}
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const highCount = view.getUint32(0, false);
	const lowCount = view.getUint32(4, false);
	const entryCount = highCount * 0x1_0000_0000 + lowCount;
	const decoder = new TextDecoder("utf-8");

	const entries: CspInstallPathToCatalogIdEntry[] = [];
	let offset = 8;

	for (let i = 0; i < entryCount && offset + 4 <= buffer.byteLength; i += 1) {
		const len1 = view.getUint32(offset, false);
		offset += 4;
		if (offset + len1 > buffer.byteLength) {
			break;
		}
		const installPath = decoder.decode(buffer.subarray(offset, offset + len1));
		offset += len1;

		if (offset + 4 > buffer.byteLength) {
			break;
		}
		const len2 = view.getUint32(offset, false);
		offset += 4;
		if (offset + len2 > buffer.byteLength) {
			break;
		}
		const catalogTargetPath = decoder.decode(buffer.subarray(offset, offset + len2));
		offset += len2;

		const { packageFolder, catalogUuid, relativeDataPath } =
			parseCatalogTargetPathComponents(catalogTargetPath);
		entries.push({
			installPath,
			catalogTargetPath,
			packageFolder,
			catalogUuid,
			relativeDataPath,
		});
	}

	return {
		entryCount,
		byteLength: buffer.byteLength,
		entries,
	};
}

/**
 * `InstallPathToCatalogId.dat` 바이너리 인코더 (100% 바이트 왕복 호환)
 */
export function encodeCspInstallPathToCatalogIdDat(
	entries: readonly Pick<
		CspInstallPathToCatalogIdEntry,
		"installPath" | "catalogTargetPath"
	>[],
): Uint8Array {
	const encoder = new TextEncoder();
	const encodedPairs: { readonly s1: Uint8Array; readonly s2: Uint8Array }[] = [];
	let totalBytes = 8;

	for (const entry of entries) {
		const s1 = encoder.encode(entry.installPath);
		const s2 = encoder.encode(entry.catalogTargetPath);
		encodedPairs.push({ s1, s2 });
		totalBytes += 8 + s1.byteLength + s2.byteLength;
	}

	const out = new Uint8Array(totalBytes);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
	view.setUint32(0, 0, false);
	view.setUint32(4, encodedPairs.length, false);

	let offset = 8;
	for (const pair of encodedPairs) {
		view.setUint32(offset, pair.s1.byteLength, false);
		offset += 4;
		out.set(pair.s1, offset);
		offset += pair.s1.byteLength;

		view.setUint32(offset, pair.s2.byteLength, false);
		offset += 4;
		out.set(pair.s2, offset);
		offset += pair.s2.byteLength;
	}

	return out;
}

// ---------------------------------------------------------------------------
// 2. Celsys C2F (`\x89C2F\r\n\x1a\n`) 소재 컨테이너 코덱
//    (.layer, .dessindollhead, .dessindollhand, .bodyproportion, .3dprimitive)
// ---------------------------------------------------------------------------

export const CSP_C2F_MAGIC_BYTES: readonly number[] = [
	0x89, 0x43, 0x32, 0x46, 0x0d, 0x0a, 0x1a, 0x0a,
] as const;

export type CspC2fChunkType = "HEAD" | "dATA" | "TAIL" | string;

export interface CspC2fChunk {
	readonly offset: number;
	readonly chunkType: CspC2fChunkType;
	readonly dataLength: number;
	readonly payload: Uint8Array;
	readonly storedCrc32Le: number;
	readonly computedCrc32: number;
	readonly crcValid: boolean;
	readonly streamVersionFlags: number | null;
}

export interface CspC2fContainerDocument {
	readonly validMagic: boolean;
	readonly byteLength: number;
	readonly chunks: readonly CspC2fChunk[];
	readonly allCrcsValid: boolean;
	readonly hasHeadChunk: boolean;
	readonly hasTailChunk: boolean;
	readonly dataChunkCount: number;
	readonly totalPayloadBytes: number;
}

const CRC32_TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) {
			c = (c & 1) !== 0 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
})();

/**
 * Celsys C2F 청크 IEEE 802.3 CRC-32 계산 (`type[4] + payload[length]`)
 * - `"HEAD"` (길이 0) -> `0x91661b28`
 * - `"TAIL"` (길이 0) -> `0x4aa259e9`
 */
export function computeCspC2fChunkCrc32(
	chunkTypeAscii: string,
	payload: Uint8Array,
): number {
	let crc = 0xffff_ffff;
	for (let i = 0; i < 4; i += 1) {
		const code = chunkTypeAscii.charCodeAt(i) & 0xff;
		crc = (CRC32_TABLE[(crc ^ code) & 0xff] ?? 0) ^ (crc >>> 8);
	}
	for (let i = 0; i < payload.byteLength; i += 1) {
		const byte = payload[i] ?? 0;
		crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
	}
	return (crc ^ 0xffff_ffff) >>> 0;
}

/**
 * Celsys C2F (`\x89C2F\r\n\x1a\n`) 컨테이너 바이너리 파서
 */
export function parseCspC2fContainer(buffer: Uint8Array): CspC2fContainerDocument {
	if (buffer.byteLength < 8) {
		throw new Error("C2F 컨테이너 버퍼가 8바이트 매직 헤더보다 작습니다.");
	}
	let validMagic = true;
	for (let i = 0; i < 8; i += 1) {
		if (buffer[i] !== CSP_C2F_MAGIC_BYTES[i]) {
			validMagic = false;
			break;
		}
	}
	if (!validMagic) {
		throw new Error("유효한 Celsys C2F 매직 헤더(\\x89C2F\\r\\n\\x1a\\n)가 아닙니다.");
	}

	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const chunks: CspC2fChunk[] = [];
	let offset = 8;
	let allCrcsValid = true;
	let hasHeadChunk = false;
	let hasTailChunk = false;
	let dataChunkCount = 0;
	let totalPayloadBytes = 0;

	while (offset + 12 <= buffer.byteLength) {
		const dataLength = view.getUint32(offset, true);
		const chunkType = String.fromCharCode(
			buffer[offset + 4] ?? 0,
			buffer[offset + 5] ?? 0,
			buffer[offset + 6] ?? 0,
			buffer[offset + 7] ?? 0,
		);
		const payloadStart = offset + 8;
		const payloadEnd = payloadStart + dataLength;
		if (payloadEnd + 4 > buffer.byteLength) {
			break;
		}
		const payload = buffer.subarray(payloadStart, payloadEnd);
		const storedCrc32Le = view.getUint32(payloadEnd, true);
		const computedCrc32 = computeCspC2fChunkCrc32(chunkType, payload);
		const crcValid = storedCrc32Le === computedCrc32;
		if (!crcValid) {
			allCrcsValid = false;
		}
		if (chunkType === "HEAD") {
			hasHeadChunk = true;
		} else if (chunkType === "TAIL") {
			hasTailChunk = true;
		} else if (chunkType === "dATA") {
			dataChunkCount += 1;
			totalPayloadBytes += dataLength;
		}

		const streamVersionFlags =
			chunkType === "dATA" && payload.byteLength >= 2
				? (payload[0] ?? 0) | ((payload[1] ?? 0) << 8)
				: null;

		chunks.push({
			offset,
			chunkType,
			dataLength,
			payload,
			storedCrc32Le,
			computedCrc32,
			crcValid,
			streamVersionFlags,
		});

		offset = payloadEnd + 4;
	}

	return {
		validMagic,
		byteLength: buffer.byteLength,
		chunks,
		allCrcsValid,
		hasHeadChunk,
		hasTailChunk,
		dataChunkCount,
		totalPayloadBytes,
	};
}

/**
 * Celsys C2F (`\x89C2F\r\n\x1a\n`) 컨테이너 인코더
 */
export function encodeCspC2fContainer(
	chunks: readonly { readonly chunkType: CspC2fChunkType; readonly payload: Uint8Array }[],
): Uint8Array {
	let totalBytes = 8;
	for (const chunk of chunks) {
		totalBytes += 12 + chunk.payload.byteLength;
	}

	const out = new Uint8Array(totalBytes);
	out.set(CSP_C2F_MAGIC_BYTES, 0);
	const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

	let offset = 8;
	for (const chunk of chunks) {
		const typeStr = chunk.chunkType.padEnd(4, " ").slice(0, 4);
		view.setUint32(offset, chunk.payload.byteLength, true);
		for (let i = 0; i < 4; i += 1) {
			out[offset + 4 + i] = typeStr.charCodeAt(i) & 0xff;
		}
		out.set(chunk.payload, offset + 8);
		const crc = computeCspC2fChunkCrc32(typeStr, chunk.payload);
		view.setUint32(offset + 8 + chunk.payload.byteLength, crc, true);
		offset += 12 + chunk.payload.byteLength;
	}

	return out;
}

// ---------------------------------------------------------------------------
// 3. 소재 패키지 XML (`catalog.xml`, `info.xml`, `icedata/layerData.xml`) 및
//    `catalogMaterial.cac` 바이너리 캐시 파서
// ---------------------------------------------------------------------------

export type CspMaterialItemType =
	| "image"
	| "frame_template"
	| "3dhead"
	| "3dhand"
	| "proportion"
	| "3dprimitive"
	| string;

export interface CspMaterialFileRef {
	readonly id: string;
	readonly mime: string;
	readonly encrypt: boolean;
	readonly relativePath: string;
}

export interface CspMaterialLayerDataSpec {
	readonly infoUuid: string;
	readonly systemTags: readonly string[];
	readonly folderTags: readonly string[];
	readonly scaling: number;
	readonly isTiling: boolean;
	readonly howTiling: number;
	readonly directionTiling: number;
	readonly superPosition: number;
	readonly tone: boolean;
	readonly toneLines: number;
	readonly concentration: number;
	readonly toneKind: number;
	readonly toneAngle: number;
	readonly noiseSize: number;
	readonly noiseCoefficient: number;
}

export interface CspMaterialPackageDescriptor {
	readonly archiveVersion: string;
	readonly catalogUuid: string;
	readonly catalogName: string;
	readonly groupUuid: string;
	readonly itemUuid: string;
	readonly itemType: CspMaterialItemType;
	readonly toolName: string;
	readonly toolCompany: string;
	readonly toolVersion: string;
	readonly tags: readonly string[];
	readonly files: readonly CspMaterialFileRef[];
	readonly layerData: CspMaterialLayerDataSpec | null;
}

export interface CspCatalogMaterialCacSummary {
	readonly cacheSchemaVersion: string;
	readonly archiveVersion: string;
	readonly catalogUuid: string;
	readonly extractedStrings: readonly string[];
}

function extractXmlTagText(xml: string, tagName: string): string {
	const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
	const match = regex.exec(xml);
	return match?.[1]?.trim() ?? "";
}

function extractDatalistValues(xml: string, key: string): string[] {
	const blockRegex = new RegExp(
		`<datalist\\s+key=["']${key}["'][^>]*>([\\s\\S]*?)<\\/datalist>`,
		"i",
	);
	const blockMatch = blockRegex.exec(xml);
	if (!blockMatch?.[1]) {
		return [];
	}
	const values: string[] = [];
	const dataRegex = /<data(?:\s[^>]*)?>([\s\S]*?)<\/data>/gi;
	let match = dataRegex.exec(blockMatch[1]);
	while (match !== null) {
		const text = (match[1] ?? "").trim();
		if (text.length > 0) {
			values.push(text);
		}
		match = dataRegex.exec(blockMatch[1]);
	}
	return values;
}

/**
 * `Paint001`..`Paint112` 소재 폴더 내부의 `catalog.xml`, `info.xml`, `icedata/layerData.xml` 통합 파서
 */
export function parseCspMaterialPackageXmlBundle(input: {
	readonly catalogXml: string;
	readonly infoXml?: string;
	readonly layerDataXml?: string;
}): CspMaterialPackageDescriptor {
	const { catalogXml, infoXml, layerDataXml } = input;
	const archiveVersion = extractXmlTagText(catalogXml, "version") || "2.0.0";
	const catalogUuidMatch = /<catalog[^>]*\buuid=["']([^"']+)["']/i.exec(catalogXml);
	const groupUuidMatch = /<group[^>]*\buuid=["']([^"']+)["']/i.exec(catalogXml);
	const itemBlockMatch = /<item\b([^>]*)>([\s\S]*?)<\/item>/i.exec(catalogXml);
	const itemUuidMatch = itemBlockMatch?.[1]
		? /\buuid=["']([^"']+)["']/i.exec(itemBlockMatch[1])
		: null;
	const itemInner = itemBlockMatch?.[2] ?? "";
	const itemType = (extractXmlTagText(itemInner, "type") || "image") as CspMaterialItemType;
	const catalogName =
		extractXmlTagText(itemInner, "name") || extractXmlTagText(catalogXml, "name");

	const toolMatch =
		/<tool[^>]*\bcompany=["']([^"']+)["'][^>]*\bname=["']([^"']+)["'][^>]*\bversion=["']([^"']+)["']/i.exec(
			catalogXml,
		);

	const files: CspMaterialFileRef[] = [];
	const fileRegex = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi;
	let fileMatch = fileRegex.exec(catalogXml);
	while (fileMatch !== null) {
		const attrs = fileMatch[1] ?? "";
		const body = fileMatch[2] ?? "";
		const id = /\bid=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
		const mime = /\bmime=["']([^"']+)["']/i.exec(attrs)?.[1] ?? "application/octet-stream";
		const encrypt = /\bencrypt=["']true["']/i.test(attrs);
		const relativePath = extractXmlTagText(body, "path");
		files.push({ id, mime, encrypt, relativePath });
		fileMatch = fileRegex.exec(catalogXml);
	}

	const tags = infoXml ? extractDatalistValues(infoXml, "tag") : [];

	let layerData: CspMaterialLayerDataSpec | null = null;
	if (layerDataXml) {
		const infoUuid = /<info[^>]*\buuid=["']([^"']+)["']/i.exec(layerDataXml)?.[1] ?? "";
		const firstNum = (key: string, fallback: number): number => {
			const raw = extractDatalistValues(layerDataXml, key)[0];
			const parsed = raw !== undefined ? Number(raw) : Number.NaN;
			return Number.isFinite(parsed) ? parsed : fallback;
		};
		layerData = {
			infoUuid,
			systemTags: extractDatalistValues(layerDataXml, "systemtag"),
			folderTags: extractDatalistValues(layerDataXml, "foldertag"),
			scaling: firstNum("scaling", 0),
			isTiling: firstNum("isTiling", 0) !== 0,
			howTiling: firstNum("howTiling", 0),
			directionTiling: firstNum("directionTiling", 0),
			superPosition: firstNum("superPosition", 0),
			tone: firstNum("tone", 0) !== 0,
			toneLines: firstNum("toneLines", 60),
			concentration: firstNum("concentration", 20),
			toneKind: firstNum("toneKind", 1),
			toneAngle: firstNum("toneAngle", 45),
			noiseSize: firstNum("noizeSize", 10),
			noiseCoefficient: firstNum("noizeCoefficient", 0),
		};
	}

	return {
		archiveVersion,
		catalogUuid: catalogUuidMatch?.[1] ?? "",
		catalogName,
		groupUuid: groupUuidMatch?.[1] ?? "",
		itemUuid: itemUuidMatch?.[1] ?? "",
		itemType,
		toolCompany: toolMatch?.[1] ?? "celsys",
		toolName: toolMatch?.[2] ?? "paint",
		toolVersion: toolMatch?.[3] ?? "1.1.0",
		tags,
		files,
		layerData,
	};
}

/**
 * `catalogMaterial.cac` 바이너리 캐시 파일 파서 (Little-Endian uint16 길이 프리픽스 UTF-8 토큰 스트림)
 */
export function parseCspCatalogMaterialCacHeader(
	buffer: Uint8Array,
): CspCatalogMaterialCacSummary {
	if (buffer.byteLength < 16) {
		throw new Error("catalogMaterial.cac 버퍼가 최소 크기(16바이트)보다 작습니다.");
	}
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const decoder = new TextDecoder("utf-8", { fatal: false });
	const extractedStrings: string[] = [];

	let offset = 0;
	while (offset + 2 <= buffer.byteLength) {
		const strLen = view.getUint16(offset, true);
		if (
			strLen >= 1 &&
			strLen <= 128 &&
			offset + 2 + strLen <= buffer.byteLength
		) {
			const slice = buffer.subarray(offset + 2, offset + 2 + strLen);
			let printable = true;
			for (let i = 0; i < slice.byteLength; i += 1) {
				const b = slice[i] ?? 0;
				if (b < 0x20 && b !== 0x09) {
					printable = false;
					break;
				}
			}
			if (printable) {
				const decoded = decoder.decode(slice).trim();
				if (decoded.length > 0) {
					extractedStrings.push(decoded);
					offset += 2 + strLen;
					continue;
				}
			}
		}
		offset += 1;
	}

	const uuidRegex =
		/^[0-9a-f]{8,10}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{10,12}$/i;
	const catalogUuid = extractedStrings.find((s) => uuidRegex.test(s)) ?? "";

	return {
		cacheSchemaVersion: extractedStrings[0] ?? "1.0.1.6",
		archiveVersion: extractedStrings[1] ?? "2.0.0",
		catalogUuid,
		extractedStrings,
	};
}

// ---------------------------------------------------------------------------
// 4. CatalogMaterial.cmdb (394개 기본 설치 소재) 및 Application Support SQLite 스키마
// ---------------------------------------------------------------------------

export interface CspInstalledMaterialSummary {
	readonly id: number;
	readonly packageFolder: string;
	readonly catalogUuid: string;
	readonly materialUuid: string;
	readonly materialName: string;
	readonly materialKind: CspMaterialItemType;
	readonly folderTag: string;
	readonly systemTags: readonly string[];
	readonly userTags: readonly string[];
}

export const CSP_CATALOG_MATERIAL_CMDB_SCHEMA = {
	databaseFileName: "CatalogMaterial.cmdb",
	totalInstalledMaterials: 394,
	packageFolderCounts: {
		Paint001: 53,
		Paint002: 47,
		Paint003: 49,
		Paint004: 50,
		Paint005: 45,
		Paint016: 1,
		Paint017: 17,
		Paint018: 2,
		Paint106: 8,
		Paint107: 2,
		Paint108: 1,
		Paint109: 3,
		Paint110: 110,
		Paint111: 5,
		Paint112: 1,
	},
	materialKindCounts: {
		image: 331,
		frame_template: 36,
		"3dhead": 18,
		"3dprimitive": 5,
		"3dhand": 2,
		proportion: 2,
	},
	tables: [
		"MaterialModifier", "MaterialInterpret", "CatalogMetaData",
		"Tag", "TableTagElementMap", "SystemTag", "TableSystemTagElementMap",
		"FolderTag", "TableFolderTagElementMap",
	],
	systemTags: [
		"Resizable", "BrushPattern", "LayerFolder", "VectorLayer", "Panel",
		"LayerMaskClipping", "OtherLayer", "MultiLayer", "PageTemplate",
		"PaperTexture", "3DDessindollHead", "3DBodyProportion", "3DPrimitive", "3DDessindollHand",
	],
	folderTags: [
		"画像素材:ブラシ", "漫画素材:コマ割りテンプレート", "単色パターン:テクスチャ",
		"3D:頭部", "3D:体型", "3D:プリミティブ", "3D:ハンドモデル",
	],
	representativeMaterials: [
		{ id: 1, packageFolder: "Paint001", catalogUuid: "004e7b2591-6f43-b1bc-cd4f-8b9d6efca2", materialUuid: "a9b3bc1351-d249-f190-867d-1e5ad9040b", materialName: "レースリボン", materialKind: "image", folderTag: "画像素材:ブラシ",
			systemTags: ["Resizable", "BrushPattern"],
			userTags: ["装飾", "レース", "単色"],
		},
		{ id: 15, packageFolder: "Paint001", catalogUuid: "2cbbe2ae4e-d345-85aa-86c7-f7a84c4d92", materialUuid: "7a1d88bc14-4d4a-8c9a-9120-2cbbe2ae4e01", materialName: "3段6コマ3", materialKind: "frame_template", folderTag: "漫画素材:コマ割りテンプレート",
			systemTags: ["Resizable", "LayerFolder", "VectorLayer", "Panel"],
			userTags: ["6コマ", "漫画素材"],
		},
		{ id: 245, packageFolder: "Paint016", catalogUuid: "da1f5ca92c-8f43-abae-76de-c3aa156ee6", materialUuid: "da1f5ca92c-8f43-abae-76de-c3aa156ee601", materialName: "新規3D頭部モデル_9", materialKind: "3dhead", folderTag: "3D:頭部",
			systemTags: ["3DDessindollHead"],
			userTags: ["3D", "頭部"],
		},
		{ id: 263, packageFolder: "Paint018", catalogUuid: "24a9b2bc6c-2a4e-e6ae-c73f-f9ad0d5a3d", materialUuid: "24a9b2bc6c-2a4e-e6ae-c73f-f9ad0d5a3d01", materialName: "新規3Dハンドモデル_0", materialKind: "3dhand", folderTag: "3D:ハンドモデル",
			systemTags: ["3DDessindollHand"],
			userTags: ["3D", "ハンドモデル", "手"],
		},
		{ id: 273, packageFolder: "Paint107", catalogUuid: "0ada4ad020-ef43-c9ba-7561-67ccd5e325", materialUuid: "0ada4ad020-ef43-c9ba-7561-67ccd5e32501", materialName: "新規3Dデッサン人形_0", materialKind: "proportion", folderTag: "3D:体型",
			systemTags: ["3DBodyProportion"],
			userTags: ["3D"],
		},
		{ id: 389, packageFolder: "Paint111", catalogUuid: "05d6cf1c1c-5344-96a0-01f4-1bc3b6c0bb", materialUuid: "05d6cf1c1c-5344-96a0-01f4-1bc3b6c0bb01", materialName: "新規3Dプリミティブ_0", materialKind: "3dprimitive", folderTag: "3D:プリミティブ",
			systemTags: ["3DPrimitive"],
			userTags: ["3D", "プリミティブ"],
		},
	] satisfies readonly CspInstalledMaterialSummary[],
} as const;

export const CSP_WORK_FOLDER_KEYS = [
	"CanvasDocument", "Export3DTexture", "PageDocument", "ImportFileObject",
	"ExportMovie", "AnimationCelsExport", "ImportMaterial", "ImportMovie",
	"ExportColorSet", "ImportImage", "ExportImageSeries", "Action",
	"PageExport", "ImportAudio", "CollaborationCommon", "ImportIconImage",
	"Gradation", "TimeLapseExport", "AddItemBank", "ImportFontFile",
	"LayerCompExport", "ImportModel", "ImportColorSet", "ExportForOpenToonz",
	"WebtoonExport", "SubTool",
] as const;

export type CspWorkFolderKey = (typeof CSP_WORK_FOLDER_KEYS)[number];

export const CSP_APPLICATION_SUPPORT_SQLITE_SCHEMAS = {
	subToolPreview: {
		fileName: "CacheData/SubToolPreview.sqlite",
		tables: {
			CacheManager: [
				"_PW_ID", "Version", "MaxOffscreenIndex", "AreaWidth", "AreaHeight",
				"DrawByWhite", "CacheOffscreenWidth", "CacheOffscreenExpandHeight",
			],
			CacheOffscreenInfo: ["_PW_ID", "OffscreenIndex", "ToolNodeUuid", "AreaData"],
			Offscreen: ["_PW_ID", "MainId", "Attribute", "BlockData"],
		},
		defaultCacheManagerRow: {
			version: 157, maxOffscreenIndex: 1, areaWidth: 254, areaHeight: 46,
			drawByWhite: 1, cacheOffscreenWidth: 512, cacheOffscreenExpandHeight: 256,
		},
	},
	workFolder: {
		fileName: "Placement/WorkFolder.sqlite",
		table: "FolderPath",
		columns: ["_PW_ID", "Key", "Path"],
		keys: CSP_WORK_FOLDER_KEYS,
	},
	placement: {
		fileName: "Placement/placement.sqlite",
		table: "Placement",
		columns: [
			"_PW_ID", "Key", "XPos", "YPos", "Width", "Height", "Visible",
			"XScaleDenominator", "XScaleNumerator", "YScaleDenominator", "YScaleNumerator",
		],
		companionSqliteFiles: {
			dock: {
				fileName: "Placement/dock",
				table: "dockplacement",
				columns: ["_PW_ID", "dockplacementbasicdata"],
			},
			shadeFloatingDockWindows: {
				fileName: "Placement/shadefloatingdockwindows",
				table: "windowplacementnames",
				columns: ["_PW_ID", "placementname"],
			},
		},
	},
	bootConfig: {
		fileName: "Boot/Config.sqlite",
		tables: {
			Form: ["_PW_ID", "showExpireLicenseDialog"],
			Launch: ["_PW_ID", "launchWithValidReceipt"],
		},
	},
	creatorStudioInfoStup: {
		fileName: "Boot/CreatorStudioInfo.stup",
		table: "PW_PREFERENCE",
		columns: ["_PW_ID", "serial_c", "version_c"],
		defaultAppVersion: "5.1.5",
	},
} as const;

/**
 * `CatalogMaterial.cmdb`의 `MaterialInterpret.FreeWord` (`\t` 구분 검색어) 및 태그 기반 소재 필터링
 */
export function resolveCspMaterialSearchQuery(
	query: string,
	materials: readonly CspInstalledMaterialSummary[] = CSP_CATALOG_MATERIAL_CMDB_SCHEMA.representativeMaterials,
): readonly CspInstalledMaterialSummary[] {
	const normalized = query.trim().toLowerCase();
	if (normalized.length === 0) {
		return materials;
	}
	return materials.filter((item) => {
		const freeWord = [
			item.materialName,
			item.materialKind,
			item.folderTag,
			...item.systemTags,
			...item.userTags,
		]
			.join("\t")
			.toLowerCase();
		return freeWord.includes(normalized);
	});
}
