import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	CSP_APPLICATION_SUPPORT_SQLITE_SCHEMAS,
	CSP_CATALOG_MATERIAL_CMDB_SCHEMA,
	CSP_INSTALL_PATH_TO_CATALOG_ID_PRESETS,
	CSP_WORK_FOLDER_KEYS,
	computeCspC2fChunkCrc32,
	encodeCspC2fContainer,
	encodeCspInstallPathToCatalogIdDat,
	parseCspC2fContainer,
	parseCspCatalogMaterialCacHeader,
	parseCspInstallPathToCatalogIdDat,
	parseCspMaterialPackageXmlBundle,
	resolveCspMaterialSearchQuery,
} from "../csp-material-boot-placement";

describe("CSP 1.5 Material Package, C2F Container & Application Support Schemas (Pass 5)", () => {
	it("parses and round-trips InstallPathToCatalogId.dat binary mapping table", () => {
		const encoded = encodeCspInstallPathToCatalogIdDat(
			CSP_INSTALL_PATH_TO_CATALOG_ID_PRESETS,
		);
		const parsed = parseCspInstallPathToCatalogIdDat(encoded);
		expect(parsed.entryCount).toBe(CSP_INSTALL_PATH_TO_CATALOG_ID_PRESETS.length);
		expect(parsed.entries).toEqual(CSP_INSTALL_PATH_TO_CATALOG_ID_PRESETS);

		const realPath =
			"/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Material/InstallPathToCatalogId.dat";
		if (existsSync(realPath)) {
			const rawBytes = new Uint8Array(readFileSync(realPath));
			const realTable = parseCspInstallPathToCatalogIdDat(rawBytes);
			expect(realTable.entryCount).toBe(208);
			expect(realTable.entries.length).toBe(208);
			expect(realTable.entries[0]?.installPath).toBe(
				".:15_brush_pattern:04_plant:twig01.layer",
			);
			expect(realTable.entries[0]?.packageFolder).toBe("Paint001");
			const reEncoded = encodeCspInstallPathToCatalogIdDat(realTable.entries);
			expect(reEncoded.byteLength).toBe(rawBytes.byteLength);
			expect(Buffer.from(reEncoded).equals(Buffer.from(rawBytes))).toBe(true);
		}
	});

	it("computes IEEE 802.3 CRC-32 and parses/encodes Celsys C2F (\\x89C2F\\r\\n\\x1a\\n) containers", () => {
		const emptyPayload = new Uint8Array(0);
		expect(computeCspC2fChunkCrc32("HEAD", emptyPayload)).toBe(0x9166_1b28);
		expect(computeCspC2fChunkCrc32("TAIL", emptyPayload)).toBe(0x4aa2_59e9);

		const samplePayload = new Uint8Array([0x01, 0x00, 0x7f, 0x9e, 0xbc, 0x16]);
		const c2fBytes = encodeCspC2fContainer([
			{ chunkType: "HEAD", payload: emptyPayload },
			{ chunkType: "dATA", payload: samplePayload },
			{ chunkType: "TAIL", payload: emptyPayload },
		]);
		const doc = parseCspC2fContainer(c2fBytes);
		expect(doc.validMagic).toBe(true);
		expect(doc.allCrcsValid).toBe(true);
		expect(doc.hasHeadChunk).toBe(true);
		expect(doc.hasTailChunk).toBe(true);
		expect(doc.dataChunkCount).toBe(1);
		expect(doc.totalPayloadBytes).toBe(samplePayload.byteLength);
		expect(doc.chunks[1]?.streamVersionFlags).toBe(1);

		const realC2fFiles = [
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint001/004e7b2591-6f43-b1bc-cd4f-8b9d6efca2/data/material.layer",
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint016/da1f5ca92c-8f43-abae-76de-c3aa156ee6/data/material_0.dessindollhead",
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint018/24a9b2bc6c-2a4e-e6ae-c73f-f9ad0d5a3d/data/material_0.dessindollhand",
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint107/0ada4ad020-ef43-c9ba-7561-67ccd5e325/data/material_0.bodyproportion",
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint111/05d6cf1c1c-5344-96a0-01f4-1bc3b6c0bb/data/material_0.3dprimitive",
		];
		for (const filePath of realC2fFiles) {
			if (existsSync(filePath)) {
				const realDoc = parseCspC2fContainer(new Uint8Array(readFileSync(filePath)));
				expect(realDoc.validMagic).toBe(true);
				expect(realDoc.allCrcsValid).toBe(true);
				expect(realDoc.hasHeadChunk).toBe(true);
				expect(realDoc.hasTailChunk).toBe(true);
				expect(realDoc.dataChunkCount).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it("parses Paint001 catalog.xml, info.xml, icedata/layerData.xml, and catalogMaterial.cac", () => {
		const pkgDir =
			"/Library/Application Support/CELSYS/CLIPStudio/Common/Material/Install/Paint001/004e7b2591-6f43-b1bc-cd4f-8b9d6efca2";
		if (existsSync(`${pkgDir}/catalog.xml`)) {
			const descriptor = parseCspMaterialPackageXmlBundle({
				catalogXml: readFileSync(`${pkgDir}/catalog.xml`, "utf-8"),
				infoXml: readFileSync(`${pkgDir}/info.xml`, "utf-8"),
				layerDataXml: readFileSync(`${pkgDir}/icedata/layerData.xml`, "utf-8"),
			});
			expect(descriptor.catalogUuid).toBe("004e7b2591-6f43-b1bc-cd4f-8b9d6efca2");
			expect(descriptor.catalogName).toBe("レースリボン");
			expect(descriptor.itemType).toBe("image");
			expect(descriptor.tags).toEqual(["装飾", "レース", "単色"]);
			expect(descriptor.files.length).toBe(3);
			expect(descriptor.layerData?.systemTags).toEqual(["Resizable", "BrushPattern"]);
			expect(descriptor.layerData?.toneLines).toBe(60);

			const cacSummary = parseCspCatalogMaterialCacHeader(
				new Uint8Array(readFileSync(`${pkgDir}/catalogMaterial.cac`)),
			);
			expect(cacSummary.cacheSchemaVersion).toBe("1.0.1.6");
			expect(cacSummary.archiveVersion).toBe("2.0.0");
			expect(cacSummary.catalogUuid).toBe("004e7b2591-6f43-b1bc-cd4f-8b9d6efca2");
		} else {
			const fallbackDescriptor = parseCspMaterialPackageXmlBundle({
				catalogXml: `<archive><version>2.0.0</version><catalog uuid="004e7b2591-6f43-b1bc-cd4f-8b9d6efca2"><tool company="celsys" name="paint" version="1.1.0"/><name>レースリボン</name><groups><group uuid="7ba5445ffb-bb4f-9696-c41d-fc2de825c3"><items><item uuid="a9b3bc1351-d249-f190-867d-1e5ad9040b"><type>image</type><name>レースリボン</name></item></items></group></groups></catalog><files><file id="1" mime="application/octet-stream" encrypt="true"><path>data/material.layer</path></file></files></archive>`,
				infoXml: `<infolist><info uuid="a9b3bc1351-d249-f190-867d-1e5ad9040b"><datalist key="tag"><data>装飾</data></datalist></info></infolist>`,
			});
			expect(fallbackDescriptor.catalogName).toBe("レースリボン");
			expect(fallbackDescriptor.tags).toEqual(["装飾"]);
		}
	});

	it("exposes CatalogMaterial.cmdb (394 materials) and Application Support SQLite schemas", () => {
		expect(CSP_CATALOG_MATERIAL_CMDB_SCHEMA.totalInstalledMaterials).toBe(394);
		const sumByFolder = Object.values(
			CSP_CATALOG_MATERIAL_CMDB_SCHEMA.packageFolderCounts,
		).reduce((acc, n) => acc + n, 0);
		expect(sumByFolder).toBe(394);

		const sumByKind = Object.values(
			CSP_CATALOG_MATERIAL_CMDB_SCHEMA.materialKindCounts,
		).reduce((acc, n) => acc + n, 0);
		expect(sumByKind).toBe(394);

		expect(CSP_WORK_FOLDER_KEYS.length).toBe(26);
		expect(
			CSP_APPLICATION_SUPPORT_SQLITE_SCHEMAS.creatorStudioInfoStup.defaultAppVersion,
		).toBe("5.1.5");

		const frameMatches = resolveCspMaterialSearchQuery("frame_template");
		expect(frameMatches.length).toBe(1);
		expect(frameMatches[0]?.materialName).toBe("3段6コマ3");
	});
});
