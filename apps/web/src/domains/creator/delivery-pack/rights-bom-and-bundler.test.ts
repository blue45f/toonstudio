import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildEpisodeDeliveryPack,
  createEpisodeDeliveryPackZip,
  DELIVERY_MANIFEST_PATH,
  RIGHTS_BOM_CERTIFICATE_PATH,
} from "./delivery-pack-bundler";
import {
  mapWorkspaceDiagnosticAssetsToDeliveryBom,
  validateDeliveryRightsBom,
  type DeliveryRightsBomAsset,
} from "./rights-bom-validator";

const FIXED_TIME = "2026-11-22T03:30:00.000Z";
const textDecoder = new TextDecoder();

function clearedAssets(): DeliveryRightsBomAsset[] {
  return [
    {
      id: "font-pretendard",
      name: "Pretendard",
      category: "font",
      licenseStatus: "commercial-allowed",
      licenseCode: "OFL-1.1",
      creatorOrVendor: "Kil Hyung-jin",
      requiresAttribution: false,
      licenseProofRef: "OFL-OPEN",
    },
    {
      id: "brush-gpen-pro",
      name: "스튜디오 G펜 브러시",
      category: "brush",
      licenseStatus: "commercial-allowed",
      licenseCode: "COMMERCIAL-PAID",
      creatorOrVendor: "ToonStudio Market",
      requiresAttribution: false,
      licenseProofRef: "ORD-2026-0041",
    },
    {
      id: "bg3d-cafe-interior",
      name: "도심 카페 3D 배경",
      category: "bg3d",
      licenseStatus: "commercial-attribution",
      licenseCode: "CC-BY-4.0",
      creatorOrVendor: "Atelier3D",
      requiresAttribution: true,
      attributionText: "3D 배경: 도심 카페 (Atelier3D / CC-BY 4.0)",
      sourceUrl: "https://example.invalid/assets/cafe-3d",
    },
    {
      id: "fx-speedlines",
      name: "집중선 효과팩",
      category: "effect",
      licenseStatus: "commercial-allowed",
      licenseCode: "CC0-1.0",
      creatorOrVendor: "Public Domain",
      requiresAttribution: false,
    },
  ];
}

describe("Rights BOM 상업 라이선스 fail-closed 검증", () => {
  it("상업 허용 및 출처 표기가 충족된 폰트·브러시·3D 배경·효과 목록을 통과시킨다", () => {
    const report = validateDeliveryRightsBom(clearedAssets(), { evaluatedAt: FIXED_TIME });
    expect(report.clearedForDelivery).toBe(true);
    expect(report.totalAssetCount).toBe(4);
    expect(report.clearedAssetCount).toBe(4);
    expect(report.blockedAssetCount).toBe(0);
    expect(report.attributionRequiredCount).toBe(1);
    expect(report.attributionLines).toEqual(["3D 배경: 도심 카페 (Atelier3D / CC-BY 4.0)"]);
    expect(report.categoryCounts).toEqual({
      font: 1,
      brush: 1,
      bg3d: 1,
      effect: 1,
      audio: 0,
      reference: 0,
    });
  });

  it("비상업 전용(non-commercial), 제한(restricted), 미확인(unknown), GPL/NC 코드가 있으면 즉시 차단한다", () => {
    const report = validateDeliveryRightsBom(
      [
        {
          id: "font-nc",
          name: "비상업 손글씨체",
          category: "font",
          licenseStatus: "non-commercial",
          licenseCode: "CC-BY-NC-4.0",
          creatorOrVendor: "HobbyFont",
          requiresAttribution: false,
        },
        {
          id: "bg3d-restricted",
          name: "평가판 학교 3D 세트",
          category: "bg3d",
          licenseStatus: "restricted",
          licenseCode: "TRIAL-ONLY",
          creatorOrVendor: "Demo3D",
          requiresAttribution: false,
        },
        {
          id: "brush-gpl",
          name: "외부 브러시 팩",
          category: "brush",
          licenseStatus: "commercial-allowed",
          licenseCode: "GPL-3.0",
          creatorOrVendor: "ThirdParty",
          requiresAttribution: false,
        },
        {
          id: "fx-unknown",
          name: "출처 미확인 톤",
          category: "effect",
          licenseStatus: "unknown",
          licenseCode: "",
          creatorOrVendor: "Unknown",
          requiresAttribution: false,
        },
      ],
      { evaluatedAt: FIXED_TIME },
    );

    expect(report.clearedForDelivery).toBe(false);
    expect(report.blockedAssetCount).toBe(4);
    expect(report.blockers.map((b) => b.code)).toEqual([
      "NON_COMMERCIAL_LICENSE",
      "RESTRICTED_LICENSE",
      "RESTRICTED_LICENSE",
      "UNKNOWN_LICENSE",
    ]);
  });

  it("출처 표기 필수 소재(CC-BY / commercial-attribution)의 출처 문구가 비어 있으면 fail-closed 차단한다", () => {
    const report = validateDeliveryRightsBom(
      [
        {
          id: "bg3d-ccby-empty",
          name: "지하철역 3D 배경",
          category: "bg3d",
          licenseStatus: "commercial-attribution",
          licenseCode: "CC-BY-4.0",
          creatorOrVendor: "StationCreator",
          requiresAttribution: true,
          attributionText: "   ",
        },
      ],
      { evaluatedAt: FIXED_TIME },
    );

    expect(report.clearedForDelivery).toBe(false);
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0]?.code).toBe("ATTRIBUTION_MISSING");
  });

  it("라이선스 만료 소재는 차단하고 30일 이내 만료 임박 소재는 경고로 보고한다", () => {
    const report = validateDeliveryRightsBom(
      [
        {
          id: "font-expired",
          name: "만료된 구독 폰트",
          category: "font",
          licenseStatus: "commercial-allowed",
          licenseCode: "SUBSCRIPTION-PRO",
          creatorOrVendor: "TypeCloud",
          requiresAttribution: false,
          expiresAt: "2026-11-01T00:00:00.000Z",
        },
        {
          id: "font-expiring-soon",
          name: "갱신 임박 폰트",
          category: "font",
          licenseStatus: "commercial-allowed",
          licenseCode: "SUBSCRIPTION-PRO",
          creatorOrVendor: "TypeCloud",
          requiresAttribution: false,
          expiresAt: "2026-12-05T00:00:00.000Z",
        },
      ],
      { evaluatedAt: FIXED_TIME },
    );

    expect(report.clearedForDelivery).toBe(false);
    expect(report.blockers.map((b) => b.code)).toEqual(["LICENSE_EXPIRED"]);
    expect(report.warnings.map((w) => w.code)).toEqual(["LICENSE_EXPIRING_SOON"]);
  });

  it("워크스페이스 진단 자산을 보수적(blocked→restricted, warning→출처 확인 필수)으로 매핑한다", () => {
    const mapped = mapWorkspaceDiagnosticAssetsToDeliveryBom([
      { id: "font-main", status: "allowed" },
      { id: "bg3d-school", status: "warning" },
      { id: "brush-trial", status: "blocked" },
    ]);
    expect(mapped.map((m) => [m.id, m.category, m.licenseStatus])).toEqual([
      ["font-main", "font", "commercial-allowed"],
      ["bg3d-school", "bg3d", "commercial-attribution"],
      ["brush-trial", "brush", "restricted"],
    ]);

    const audit = validateDeliveryRightsBom(mapped, { evaluatedAt: FIXED_TIME });
    expect(audit.clearedForDelivery).toBe(false);
    expect(audit.blockers.map((b) => b.code)).toContain("ATTRIBUTION_MISSING");
    expect(audit.blockers.map((b) => b.code)).toContain("RESTRICTED_LICENSE");
  });
});

describe("납품 증명서(Markdown/JSON) 및 ZIP 매니페스트 번들러", () => {
  it("상업 불가 소재가 1건이라도 있으면 증명서·매니페스트·ZIP 생성을 fail-closed로 차단한다", () => {
    const blockedPack = buildEpisodeDeliveryPack({
      projectId: "proj-delivery-blocked",
      seriesTitle: "달빛 편의점",
      authorName: "김작가",
      platformId: "naver_webtoon",
      episodes: [{ episodeNumber: 1, sourceWidthPx: 690, sourceHeightPx: 3200 }],
      rightsBomAssets: [
        ...clearedAssets(),
        {
          id: "font-personal",
          name: "개인용 비상업 폰트",
          category: "font",
          licenseStatus: "non-commercial",
          licenseCode: "PERSONAL-ONLY",
          creatorOrVendor: "FreeFont",
          requiresAttribution: false,
        },
      ],
      generatedAt: FIXED_TIME,
    });

    expect(blockedPack.ok).toBe(false);
    expect(blockedPack.blocked).toBe(true);
    expect(blockedPack.certificateMarkdown).toBeNull();
    expect(blockedPack.manifest).toBeNull();
    expect(blockedPack.files).toEqual([]);
    expect(blockedPack.blockReasons.some((r) => r.includes("개인용 비상업 폰트"))).toBe(true);
    expect(() => createEpisodeDeliveryPackZip(blockedPack)).toThrow(/차단된 납품 패키지/u);
  });

  it("모든 검증 통과 시 RIGHTS-BOM-CERTIFICATE.md, delivery-manifest.json, 파일 목록과 결정적 ZIP을 생성한다", () => {
    const pack = buildEpisodeDeliveryPack({
      projectId: "proj-delivery-ok",
      seriesTitle: "달빛 편의점",
      authorName: "김작가",
      platformId: "naver_webtoon",
      format: "jpg",
      episodes: [
        {
          episodeNumber: 1,
          episodeTitle: "1화 첫 손님",
          sourceWidthPx: 690,
          sourceHeightPx: 3200,
          protectedZones: [{ id: "bubble-1", kind: "speech-bubble", topY: 1550, bottomY: 1650 }],
        },
        {
          episodeNumber: 2,
          episodeTitle: "2화 새벽 손님",
          sourceWidthPx: 690,
          sourceHeightPx: 1600,
        },
      ],
      rightsBomAssets: clearedAssets(),
      generatedAt: FIXED_TIME,
    });

    expect(pack.ok).toBe(true);
    if (!pack.ok) throw new Error("expected cleared pack");

    expect(pack.digest).toMatch(/^tsbom-[0-9a-f]{16}$/u);
    expect(pack.certificateMarkdown).toContain("# 상업 납품 Rights BOM 증명서");
    expect(pack.certificateMarkdown).toContain("달빛 편의점");
    expect(pack.certificateMarkdown).toContain("네이버 웹툰");
    expect(pack.certificateMarkdown).toContain("Pretendard");
    expect(pack.certificateMarkdown).toContain("3D 배경: 도심 카페 (Atelier3D / CC-BY 4.0)");

    expect(pack.manifest.schemaVersion).toBe(1);
    expect(pack.manifest.platform.id).toBe("naver_webtoon");
    expect(pack.manifest.platform.targetWidthPx).toBe(690);
    expect(pack.manifest.rightsCertification.clearedForDelivery).toBe(true);
    expect(pack.manifest.rightsCertification.certificatePath).toBe(RIGHTS_BOM_CERTIFICATE_PATH);
    expect(pack.manifest.summary.episodeCount).toBe(2);
    expect(pack.manifest.summary.totalAdjustedCutCount).toBe(1);

    const fileNames = pack.files.map((file) => file.fileName);
    expect(fileNames[0]).toBe(RIGHTS_BOM_CERTIFICATE_PATH);
    expect(fileNames[1]).toBe(DELIVERY_MANIFEST_PATH);
    expect(fileNames).toContain("EP01_001.jpg");
    expect(fileNames).toContain("EP02_001.jpg");

    const fakeSlicePath = pack.files.find((f) => f.fileName === "EP01_001.jpg")?.zipPath;
    expect(fakeSlicePath).toBeTruthy();

    const sampleJpgHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const zipBytesA = createEpisodeDeliveryPackZip(pack, {
      [fakeSlicePath!]: sampleJpgHeader,
    });
    const zipBytesB = createEpisodeDeliveryPackZip(pack, {
      [fakeSlicePath!]: sampleJpgHeader,
    });
    // 동일 입력은 바이트 단위까지 결정적으로 동일한 ZIP을 생성한다.
    expect(zipBytesA).toEqual(zipBytesB);

    const unpacked = unzipSync(zipBytesA);
    expect(Object.keys(unpacked).sort()).toEqual(
      [DELIVERY_MANIFEST_PATH, RIGHTS_BOM_CERTIFICATE_PATH, fakeSlicePath!].sort(),
    );
    expect(textDecoder.decode(unpacked[RIGHTS_BOM_CERTIFICATE_PATH])).toBe(
      pack.certificateMarkdown,
    );
    expect(JSON.parse(textDecoder.decode(unpacked[DELIVERY_MANIFEST_PATH]))).toEqual(pack.manifest);
    expect(unpacked[fakeSlicePath!]).toEqual(sampleJpgHeader);

    // 매니페스트에 선언되지 않은 임의 경로 주입을 차단한다.
    expect(() =>
      createEpisodeDeliveryPackZip(pack, { "../escape.jpg": sampleJpgHeader }),
    ).toThrow(/선언되지 않은 슬라이스 경로/u);
  });
});
