// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioOpenStandardsPublishPanel } from "./StudioOpenStandardsPublishPanel";
import {
  autoTagExternalAssetReceipts,
  buildC2paProvenanceManifest,
  canonicalizeJson,
  convertColorBetweenSpaces,
  createDemoC2paInput,
  createDemoCloudMirrorFixture,
  createDemoOpenRasterDocument,
  generateOcioConfigYaml,
  parseOpenRasterStackXml,
  planCloudStorageMirrorSync,
  serializeOpenRasterStackXml,
  sha256Hex,
  verifyC2paManifestIntegrity,
  type CloudMirrorProvider,
  type OpenRasterDocument,
} from "./c2pa-provenance-and-standards";
import {
  buildPlatformSubmissionPackage,
  createDemoPlatformCuts,
  createDemoScriptUnits,
  createDemoTranslationsForLocale,
  exportScriptToTmsPackage,
  importTmsTranslationsWithFitCheck,
  type PublishPlatformId,
  type ScriptBalloonUnit,
} from "./global-tms-and-platform-packager";

afterEach(cleanup);

const MIB = 1024 * 1024;

describe("C2PA Content Credentials v2.1 · SHA-256 체인 · Anti-AI · Rights BOM", () => {
  it("FIPS 180-4 SHA-256 표준 벡터와 키 정렬 직렬화가 결정론적으로 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalizeJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("유효한 C2PA 매니페스트를 생성·검증하고 제목·레이어·Anti-AI·봉인해시·Rights BOM 위변조를 전수 탐지한다", () => {
    const manifest = buildC2paProvenanceManifest(createDemoC2paInput());
    const validCheck = verifyC2paManifestIntegrity(manifest);

    expect(manifest.specVersion).toBe("2.1");
    expect(manifest.jumbfBoxes.map((b) => b.boxType)).toEqual(["c2pa", "c2ma", "c2as", "c2cl"]);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.intactChain).toBe(true);
    expect(validCheck.antiAiDeclared).toBe(true);
    expect(validCheck.rightsClearForCommercial).toBe(true);
    expect(validCheck.rightsClearForGlobal).toBe(true);
    expect(validCheck.rightsClearForDerivative).toBe(true);
    expect(validCheck.rightsClearForPrint).toBe(true);
    expect(validCheck.checkedLinkCount).toBe(manifest.layers.length + manifest.ingredients.length + 4);

    // 1) 제목 변조 -> CLAIM_HASH_MISMATCH
    const tamperedTitle = verifyC2paManifestIntegrity({ ...manifest, title: "Hijacked Episode" });
    expect(tamperedTitle.valid).toBe(false);
    expect(tamperedTitle.failures.some((f) => f.code === "CLAIM_HASH_MISMATCH")).toBe(true);

    // 2) 레이어 해시 변조 -> HASH_CHAIN_BROKEN
    const firstLayer = manifest.layers[0];
    if (!firstLayer) throw new Error("Expected at least one layer in demo manifest");
    const tamperedLayers = verifyC2paManifestIntegrity({
      ...manifest,
      layers: [{ ...firstLayer, contentSha256: sha256Hex("forged-layer") }, ...manifest.layers.slice(1)],
    });
    expect(tamperedLayers.intactChain).toBe(false);
    expect(tamperedLayers.failures.some((f) => f.code === "HASH_CHAIN_BROKEN")).toBe(true);

    // 3) Anti-AI(c2pa.training-mining) 우회 변조 -> ANTI_AI_NOT_DECLARED
    const tamperedAntiAi = verifyC2paManifestIntegrity({
      ...manifest,
      assertions: {
        ...manifest.assertions,
        trainingMining: {
          label: "c2pa.training-mining",
          data: {
            entries: {
              ...manifest.assertions.trainingMining.data.entries,
              "c2pa.ai_generative_training": { use: "allowed" },
            },
          },
        },
      },
    });
    expect(tamperedAntiAi.antiAiDeclared).toBe(false);
    expect(tamperedAntiAi.failures.some((f) => f.code === "ANTI_AI_NOT_DECLARED")).toBe(true);

    // 4) 최종 manifestSha256 위조 -> MANIFEST_HASH_MISMATCH
    const tamperedSeal = verifyC2paManifestIntegrity({ ...manifest, manifestSha256: "f".repeat(64) });
    expect(tamperedSeal.failures.some((f) => f.code === "MANIFEST_HASH_MISMATCH")).toBe(true);

    // 5) Rights BOM 요약 불일치 -> RIGHTS_BOM_MISMATCH
    const tamperedRights = verifyC2paManifestIntegrity({
      ...manifest,
      assertions: {
        ...manifest.assertions,
        rightsBom: {
          label: "toonstudio.rights-bom.v1",
          data: { ...manifest.assertions.rightsBom.data, totalAssets: 99 },
        },
      },
    });
    expect(tamperedRights.failures.some((f) => f.code === "RIGHTS_BOM_MISMATCH")).toBe(true);
  });

  it("외부 영수증 자동 태깅은 ACON3D/Sketchfab/폰트/브러시 분류 및 비상업·국내전용·웹전용 제한을 정확히 반영한다", () => {
    const tagged = autoTagExternalAssetReceipts([
      { receiptId: "r1", assetName: "Castle Kit", vendorHint: "ACON3D", filename: "castle.skp", licenseText: "Personal Only Korea Only Web Only" },
      { receiptId: "r2", assetName: "Street Lamp", vendorHint: "Sketchfab", filename: "lamp.glb", licenseText: "Commercial CC-BY Global Print", orderNumber: "SKFB-2026-0012" },
      { receiptId: "r3", assetName: "Comic Bold", vendorHint: "FontLab", filename: "comic.otf", licenseText: "Commercial Global No Derivatives", orderNumber: "FNT-2026-881" },
      { receiptId: "r4", assetName: "Ink Nib", vendorHint: "BrushHub", filename: "ink.sut", licenseText: "Commercial Global Print", orderNumber: "BR-2026-772" },
    ]);

    expect(tagged.map((t) => t.detectedSourceKind)).toEqual(["acon3d", "sketchfab", "font", "brush"]);
    expect(tagged[0]?.warnings.length).toBeGreaterThanOrEqual(4);
    expect(tagged[0]?.rightsEntry.permissions.commercialUse).toBe(false);
    expect(tagged[0]?.rightsEntry.permissions.globalDistribution).toBe(false);
    expect(tagged[0]?.rightsEntry.permissions.printPublication).toBe(false);
    expect(tagged[1]?.rightsEntry.attributionRequired).toBe(true);
    expect(tagged[2]?.rightsEntry.permissions.derivativeWorks).toBe(false);

    const restrictedManifest = buildC2paProvenanceManifest({
      ...createDemoC2paInput(),
      rightsBom: tagged.map((t) => t.rightsEntry),
    });
    const check = verifyC2paManifestIntegrity(restrictedManifest);
    expect(check.valid).toBe(true);
    expect(check.rightsClearForCommercial).toBe(false);
    expect(check.rightsClearForGlobal).toBe(false);
    expect(check.rightsClearForDerivative).toBe(false);
    expect(check.rightsClearForPrint).toBe(false);
  });
});

describe("OpenRaster(.ora stack.xml) 무손실 왕복 · OpenColorIO v2 · 클라우드 해시 차분 미러링", () => {
  it("중첩 스택·XML 특수문자·블렌드 모드·불투명도·색공간을 OpenRaster 0.0.5 stack.xml로 무손실 왕복한다", () => {
    const doc: OpenRasterDocument = {
      ...createDemoOpenRasterDocument(),
      colorSpace: "CMYK-FOGRA39",
      rootStack: [
        {
          type: "stack",
          name: 'SFX & "Impact" <Top>',
          opacity: 0.85,
          visibility: "visible",
          blendMode: "overlay",
          isolation: "isolate",
          children: [
            { type: "layer", name: "Glow", src: "data/glow.png", x: 12, y: 34, opacity: 0.5, visibility: "hidden", blendMode: "add" },
          ],
        },
        ...createDemoOpenRasterDocument().rootStack,
      ],
    };

    const xml = serializeOpenRasterStackXml(doc);
    expect(xml).toContain('composite-op="krita:addition"');
    expect(xml).toContain('color-space="CMYK-FOGRA39"');
    const parsed = parseOpenRasterStackXml(xml);
    expect(parsed).toEqual(doc);
  });

  it("OpenColorIO v2 YAML과 sRGB <-> Display-P3 <-> CMYK-FOGRA39 변환(TAC <= 300%)을 정확히 계산한다", () => {
    const ocio = generateOcioConfigYaml("Display-P3", "CMYK-FOGRA39", "krita");
    expect(ocio.yaml).toContain("ocio_profile_version: 2.2");
    expect(ocio.yaml).toContain("colorspace: CMYK-FOGRA39");
    expect(ocio.configSha256).toHaveLength(64);

    // sRGB -> Display-P3 -> sRGB 왕복 오차 < 0.002
    const src: readonly [number, number, number] = [0.72, 0.35, 0.21];
    const toP3 = convertColorBetweenSpaces(src, "sRGB", "Display-P3");
    const backSrgb = convertColorBetweenSpaces(toP3.channels, "Display-P3", "sRGB");
    expect(backSrgb.channels[0] ?? 0).toBeCloseTo(src[0], 2);
    expect(backSrgb.channels[1] ?? 0).toBeCloseTo(src[1], 2);
    expect(backSrgb.channels[2] ?? 0).toBeCloseTo(src[2], 2);

    // 순수 광색역 Display-P3 빨강 -> sRGB 가멋 초과 탐지
    const wideRed = convertColorBetweenSpaces([1, 0, 0], "Display-P3", "sRGB");
    expect(wideRed.outOfGamut).toBe(true);

    // CMYK FOGRA39 TAC <= 300% 보장
    const darkCmyk = convertColorBetweenSpaces([0.05, 0.05, 0.05], "sRGB", "CMYK-FOGRA39");
    expect(darkCmyk.channels).toHaveLength(4);
    expect(darkCmyk.totalAreaCoveragePercent ?? 999).toBeLessThanOrEqual(300);
  });

  it("5대 클라우드 스토리지 대상 SHA-256 차분 미러링은 동일 파일 생략·충돌 감지·고아 정리를 정확히 계획한다", () => {
    const providers: readonly CloudMirrorProvider[] = ["google-drive", "dropbox", "onedrive", "webdav-nas", "s3-r2"];
    const fixture = createDemoCloudMirrorFixture();

    for (const provider of providers) {
      const plan = planCloudStorageMirrorSync(fixture.localFiles, fixture.remoteFiles, {
        provider,
        remoteRoot: `/${provider}/toonstudio`,
      });
      expect(plan.skippedCount).toBe(1);
      expect(plan.uploadCount).toBe(2);
      expect(plan.bandwidthSavingsRatio).toBeGreaterThan(0.95);
    }

    // 양방향 해시 분기 충돌 + 원격 고아 파일 prune 검증
    const conflictPlan = planCloudStorageMirrorSync(
      [{ relativePath: "ep24/ink.ora", sizeBytes: 12 * MIB, contentSha256: sha256Hex("local-v2"), lastSyncedSha256: sha256Hex("base-v1") }],
      [
        { relativePath: "ep24/ink.ora", sizeBytes: 12 * MIB, contentSha256: sha256Hex("remote-v2") },
        { relativePath: "ep24/old.tmp", sizeBytes: 1024, contentSha256: sha256Hex("orphan") },
      ],
      { provider: "s3-r2", remoteRoot: "s3://archive", deleteOrphans: true },
    );
    expect(conflictPlan.conflictCount).toBe(1);
    expect(conflictPlan.orphanCount).toBe(1);
    expect(conflictPlan.actions.some((a) => a.action === "prune-orphan")).toBe(true);
  });
});

describe("TMS 양방향 대사 시트 (CSV / XLIFF 2.0) · 다국어 말풍선 오버플로·JA 세로쓰기 검사", () => {
  it("Google Sheets CSV(쉼표·따옴표·줄바꿈 포함) 및 Crowdin/Lokalise XLIFF 2.0 추출·역삽입이 정확히 왕복한다", () => {
    const units = createDemoScriptUnits();
    const specialEn: Readonly<Record<string, string>> = {
      "dlg-001": '5 AM, "Euljiro"\nMist settles.',
      "dlg-002": "Hashes verified, ship now.",
      "sfx-003": "CLACK!",
    };

    const csvPkg = exportScriptToTmsPackage({
      workId: "ep024", sourceLocale: "ko", targetLocale: "en", format: "google-sheets-csv", units, existingTranslations: specialEn,
    });
    expect(csvPkg.filename).toContain(".csv");
    const csvImport = importTmsTranslationsWithFitCheck(units, csvPkg.payload, "google-sheets-csv", "en");
    expect(csvImport.allSafe).toBe(true);
    expect(csvImport.appliedTranslations["dlg-001"]?.text).toBe('5 AM, "Euljiro"\nMist settles.');

    const xliffPkg = exportScriptToTmsPackage({
      workId: "ep024", sourceLocale: "ko", targetLocale: "en", format: "crowdin-xliff-2.0", units, existingTranslations: specialEn,
    });
    expect(xliffPkg.payload).toContain('xmlns="urn:oasis:names:tc:xliff:document:2.0"');
    const xliffImport = importTmsTranslationsWithFitCheck(units, xliffPkg.payload, "crowdin-xliff-2.0", "en");
    expect(xliffImport.allSafe).toBe(true);
    expect(xliffImport.appliedTranslations["dlg-002"]?.text).toBe("Hashes verified, ship now.");
  });

  it("일본어(JA) 세로쓰기(vertical-rl)·태국어(TH)·인니어(ID)·긴 번역문 오버플로를 감지하고 안전 축소 또는 차단한다", () => {
    const narrowJaUnit: ScriptBalloonUnit = {
      unitId: "ja-narrow", cutIndex: 1, speaker: "서연", kind: "dialogue",
      sourceText: "짧은 대사", boxWidthPx: 72, boxHeightPx: 140, paddingPx: 12, fontSizePx: 16, lineHeightRatio: 1.35,
    };
    const wideJaUnit: ScriptBalloonUnit = { ...narrowJaUnit, unitId: "ja-wide", boxWidthPx: 220 };

    const longJaText = "午前五時、乙支路の屋上に深い朝霧が静かに降りてきて街全体が銀色に包まれていく。";
    const xliff = exportScriptToTmsPackage({
      workId: "ep024-ja", sourceLocale: "ko", targetLocale: "ja", format: "lokalise-xliff-2.0",
      units: [narrowJaUnit, wideJaUnit],
      existingTranslations: { "ja-narrow": longJaText, "ja-wide": longJaText },
    });
    const jaReport = importTmsTranslationsWithFitCheck([narrowJaUnit, wideJaUnit], xliff.payload, "lokalise-xliff-2.0", "ja");
    const narrowItem = jaReport.items.find((i) => i.unitId === "ja-narrow");
    const wideItem = jaReport.items.find((i) => i.unitId === "ja-wide");

    expect(narrowItem?.writingMode).toBe("vertical-rl");
    expect(narrowItem?.status).toBe("overflow-blocked");
    expect(narrowItem?.safeToInsert).toBe(false);
    expect(jaReport.appliedTranslations["ja-narrow"]).toBeUndefined();
    expect(wideItem?.writingMode).toBe("vertical-rl");
    expect(wideItem?.safeToInsert).toBe(true);

    // TH / ID 정상 회수 검증
    const demoUnits = createDemoScriptUnits();
    for (const loc of ["th", "id"] as const) {
      const pkg = exportScriptToTmsPackage({
        workId: "ep024", sourceLocale: "ko", targetLocale: loc, format: "google-sheets-csv",
        units: demoUnits, existingTranslations: createDemoTranslationsForLocale(loc, false),
      });
      const report = importTmsTranslationsWithFitCheck(demoUnits, pkg.payload, "google-sheets-csv", loc);
      expect(report.allSafe).toBe(true);
    }
  });
});

describe("글로벌 7대 웹툰·출판 플랫폼 원클릭 출고 패키저 (buildPlatformSubmissionPackage)", () => {
  it("7대 플랫폼 전수(네이버·카카오·레진·WEBTOON·Piccoma 세로/가로·Tapas·PDF/X-4)에서 정상 규격 시 위반 0건 + C2PA/Rights BOM 자동 동봉을 통과한다", () => {
    const manifest = buildC2paProvenanceManifest(createDemoC2paInput());
    const platforms: readonly PublishPlatformId[] = [
      "naver-webtoon", "kakao-page", "lezhin-comics", "webtoon-canvas", "piccoma-jp", "tapas", "print-pdf-x4",
    ];

    for (const platform of platforms) {
      const pkg = buildPlatformSubmissionPackage({
        platform, episodeCode: "ep024", cuts: createDemoPlatformCuts(platform), c2paManifest: manifest, autoSlice: true,
      });
      expect(pkg.readyForSubmission).toBe(true);
      expect(pkg.violationCount).toBe(0);
      expect(pkg.attachedCredentials.c2paManifestSha256).toBe(manifest.manifestSha256);
      expect(pkg.attachedCredentials.antiAiDeclared).toBe(true);
      expect(pkg.attachedCredentials.rightsClearedForPlatform).toBe(true);
      if (platform === "webtoon-canvas") {
        // 2560 -> 2타일, 3840 -> 3타일 => 총 5타일, 각 타일 <= 1280px
        expect(pkg.slices).toHaveLength(5);
        expect(pkg.slices.every((s) => s.widthPx === 800 && s.heightPx <= 1280)).toBe(true);
      }
    }

    // 네이버 690px 및 Piccoma 가로 RTL 규격도 통과 확인
    const naver690 = buildPlatformSubmissionPackage({
      platform: "naver-webtoon", episodeCode: "ep024", c2paManifest: manifest,
      cuts: [{ cutId: "n1", cutIndex: 1, widthPx: 690, heightPx: 12000, format: "jpeg", byteSize: 8 * MIB, colorSpace: "sRGB" }],
    });
    expect(naver690.readyForSubmission).toBe(true);

    const piccomaRtl = buildPlatformSubmissionPackage({
      platform: "piccoma-jp", episodeCode: "ep024", piccomaOrientation: "horizontal-spread", c2paManifest: manifest,
      cuts: createDemoPlatformCuts("piccoma-jp", "horizontal-spread"),
    });
    expect(piccomaRtl.readyForSubmission).toBe(true);
    expect(piccomaRtl.readingDirection).toBe("rtl-page");
  });

  it("플랫폼별 규격 위반(폭·20MB 초과·슬라이스 미분할·300DPI/CMYK/3mm 도련·위변조 C2PA·권리 미충족)을 정확히 차단한다", () => {
    const manifest = buildC2paProvenanceManifest(createDemoC2paInput());

    // 네이버: 잘못된 폭(900px) + 컷당 25MB 초과
    const badNaver = buildPlatformSubmissionPackage({
      platform: "naver-webtoon", episodeCode: "ep024", c2paManifest: manifest,
      cuts: [{ cutId: "c1", cutIndex: 1, widthPx: 900, heightPx: 2000, format: "jpeg", byteSize: 25 * MIB, colorSpace: "sRGB" }],
    });
    expect(badNaver.readyForSubmission).toBe(false);
    expect(badNaver.violations.map((v) => v.code)).toEqual(expect.arrayContaining(["WIDTH_MISMATCH", "FILE_SIZE_EXCEEDED"]));

    // WEBTOON Canvas: 자동 슬라이스 OFF 시 1280px 초과 & 2MB 초과 차단
    const badCanvas = buildPlatformSubmissionPackage({
      platform: "webtoon-canvas", episodeCode: "ep024", c2paManifest: manifest, autoSlice: false,
      cuts: [{ cutId: "w1", cutIndex: 1, widthPx: 800, heightPx: 2560, format: "png", byteSize: 3 * MIB, colorSpace: "sRGB" }],
    });
    expect(badCanvas.violations.map((v) => v.code)).toEqual(expect.arrayContaining(["HEIGHT_EXCEEDED", "FILE_SIZE_EXCEEDED"]));

    // PDF/X-4: 72DPI · sRGB · 1mm 도련 · TAC 340% · 폰트 미임베드 · 포맷 오류 모두 차단
    const badPrint = buildPlatformSubmissionPackage({
      platform: "print-pdf-x4", episodeCode: "book-v1", c2paManifest: manifest,
      cuts: [{ cutId: "p1", cutIndex: 1, widthPx: 1200, heightPx: 1800, format: "jpeg", byteSize: 4 * MIB, colorSpace: "sRGB", dpi: 72, bleedMm: 1, tacPercent: 340, fontsEmbedded: false }],
    });
    expect(badPrint.readyForSubmission).toBe(false);
    expect(badPrint.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(["FORMAT_UNSUPPORTED", "COLOR_SPACE_MISMATCH", "DPI_TOO_LOW", "BLEED_INSUFFICIENT", "TAC_LIMIT_EXCEEDED", "FONTS_NOT_EMBEDDED"]),
    );

    // 위변조된 C2PA 매니페스트 또는 국내전용 Rights BOM -> Tapas 글로벌 출고 차단
    const tamperedPkg = buildPlatformSubmissionPackage({
      platform: "tapas", episodeCode: "ep024", cuts: createDemoPlatformCuts("tapas"),
      c2paManifest: { ...manifest, title: "Tampered" },
    });
    expect(tamperedPkg.readyForSubmission).toBe(false);
    expect(tamperedPkg.violations.some((v) => v.code === "C2PA_INTEGRITY_FAILED")).toBe(true);

    const krOnlyReceipt = autoTagExternalAssetReceipts([
      { receiptId: "kr1", assetName: "KR Font", vendorHint: "Foundry", filename: "kr.otf", licenseText: "Commercial Korea Only Web Only", orderNumber: "KR-2026-100" },
    ]);
    const krManifest = buildC2paProvenanceManifest({ ...createDemoC2paInput(), rightsBom: krOnlyReceipt.map((r) => r.rightsEntry) });
    const blockedGlobal = buildPlatformSubmissionPackage({ platform: "tapas", episodeCode: "ep024", cuts: createDemoPlatformCuts("tapas"), c2paManifest: krManifest });
    expect(blockedGlobal.violations.some((v) => v.code === "RIGHTS_BOM_BLOCKED")).toBe(true);
  });
});

describe("StudioOpenStandardsPublishPanel UI · 3탭 · KO/EN · Calm Atelier 위생 계약", () => {
  it("props 없이 마운트되며 3개 탭(7대 플랫폼 · TMS 대사 브리지 · C2PA/OpenRaster/스토리지)이 인터랙티브하게 동작한다", () => {
    const onPackageBuilt = vi.fn();
    const onTmsExport = vi.fn();
    const onC2paVerified = vi.fn();

    render(
      <StudioOpenStandardsPublishPanel
        locale="ko"
        onPackageBuilt={onPackageBuilt}
        onTmsExport={onTmsExport}
        onC2paVerified={onC2paVerified}
      />,
    );

    // 탭 1: 7대 플랫폼 출고
    expect(screen.getByTestId("platform-verdict-card").textContent).toContain("위반 0건");
    fireEvent.click(screen.getByRole("button", { name: "WEBTOON Canvas" }));
    expect(screen.getByTestId("platform-slice-summary").textContent).toContain("5장");
    fireEvent.click(screen.getByRole("button", { name: /원클릭 출고 패키지 검사·생성/i }));
    expect(onPackageBuilt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("WEBTOON Canvas");

    // 탭 2: TMS 다국어 대사 브리지
    fireEvent.click(screen.getByRole("tab", { name: /TMS 다국어 대사 브리지/i }));
    expect(screen.getByTestId("tms-payload-preview").textContent).toContain("urn:oasis:names:tc:xliff:document:2.0");
    expect(screen.getByTestId("tms-fit-dlg-001").textContent).toContain("vertical-rl");
    fireEvent.click(screen.getByRole("button", { name: /오버플로 검사 시뮬레이션/i }));
    expect(screen.getByTestId("tms-fit-summary").textContent).toContain("차단 1");
    fireEvent.click(screen.getByRole("button", { name: /TMS 번역 패키지 추출/i }));
    expect(onTmsExport).toHaveBeenCalledTimes(1);

    // 탭 3: C2PA 저작권 증명 · OpenRaster/스토리지
    fireEvent.click(screen.getByRole("tab", { name: /C2PA 저작권 증명/i }));
    expect(screen.getByTestId("c2pa-integrity-badge").textContent).toContain("검증 통과");
    expect(screen.getByTestId("ora-roundtrip-badge").textContent).toContain("1600×2560");
    fireEvent.click(screen.getByRole("button", { name: /위변조 탐지 테스트/i }));
    expect(screen.getByTestId("c2pa-integrity-badge").textContent).toContain("위변조 탐지");
    fireEvent.click(screen.getByRole("button", { name: /SHA-256 해시 체인 검증/i }));
    expect(onC2paVerified).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
  });

  it("영어(en) 로케일 렌더링 및 폴더 전체 Calm Atelier·배럴 금지·파일 크기·localStorage 금지 위생 계약을 지킨다", () => {
    render(<StudioOpenStandardsPublishPanel locale="en" />);
    expect(screen.getByRole("tab", { name: "Global 7 Platforms" })).toBeTruthy();
    expect(screen.getByTestId("platform-verdict-card").textContent).toContain("0 Violations");

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/open-standards-publish");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const files = [
      { name: "c2pa-provenance-and-standards.ts", maxLines: 700 },
      { name: "global-tms-and-platform-packager.ts", maxLines: 700 },
      { name: "StudioOpenStandardsPublishPanel.tsx", maxLines: 460 },
      { name: "open-standards-publish.test.tsx", maxLines: 750 },
    ] as const;

    for (const file of files) {
      const source = readFileSync(resolve(dir, file.name), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(file.maxLines);
      if (file.name !== "open-standards-publish.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
      }
      if (file.name === "StudioOpenStandardsPublishPanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
      }
    }
  });
});
