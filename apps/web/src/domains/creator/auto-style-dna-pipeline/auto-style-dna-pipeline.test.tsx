// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  autoHarmonizeFrameToStyleDna,
  computeOklabDeltaE100,
  createSyntheticStyleFrame,
  DEMO_MULTILINGUAL_DIALOGUES,
  DEMO_WEBTOON_SCRIPTS,
  detectCrossBrowserCryptoCapabilities,
  detectStyleDrift,
  extractAutoStyleMetricsFromRgba,
  generateEpisode3dStagingPlan,
  InMemorySandboxedBackend,
  lintGlobalContentRating,
  LocalStyleDnaLibrary,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  parseWebtoonScript,
  SandboxedVfsContainer,
  srgbToOklab,
  StudioAutoStyleDnaPipelinePanel,
  typesetBalloonAcrossLanguages,
  typesetMultilingualBalloon,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("1. 완전 자동화 로컬 스타일 DNA 화풍 유지 파이프라인 (auto-style-dna-library)", () => {
  it("sRGB ↔ Oklab ↔ OKLCH 왕복 변환이 ±1 채널 오차 내에서 정확히 수렴한다", () => {
    const samples: readonly (readonly [number, number, number])[] = [
      [24, 32, 64],
      [238, 178, 146],
      [64, 128, 218],
      [246, 244, 240],
      [128, 128, 128],
    ];
    for (const [r, g, b] of samples) {
      const lab = srgbToOklab(r, g, b);
      const lch = oklabToOklch(lab);
      const roundLab = oklchToOklab(lch);
      const [rr, rg, rb] = oklabToSrgb(roundLab.L, roundLab.a, roundLab.b);
      expect(Math.abs(rr - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(rg - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(rb - b)).toBeLessThanOrEqual(1);
      expect(computeOklabDeltaE100(lab, roundLab)).toBeLessThan(0.05);
    }
  });

  it("완성 컷 RGBA 버퍼에서 선화 굵기·OKLCH 팔레트·그림자 색온도·명암 대비·스크린톤 밀도를 자동 추출한다", () => {
    const noirCut = createSyntheticStyleFrame({
      frameId: "ep01-c01",
      preset: "cool-noir-atelier",
      variant: "master",
    });
    const sunsetCut = createSyntheticStyleFrame({
      frameId: "ep01-c02",
      preset: "sunset-romance-pastel",
      variant: "master",
    });

    const noirMetrics = extractAutoStyleMetricsFromRgba(noirCut);
    const sunsetMetrics = extractAutoStyleMetricsFromRgba(sunsetCut);

    expect(noirMetrics.linework.sampledLinePixels).toBeGreaterThan(100);
    expect(noirMetrics.linework.meanPx).toBeGreaterThan(sunsetMetrics.linework.meanPx);
    expect(noirMetrics.dominantPalette.length).toBeGreaterThanOrEqual(3);
    expect(noirMetrics.dominantPalette[0]?.cssOklch).toMatch(/^oklch\(/);
    // 쿨 느와르 그림자는 차가운 색온도(높은 Kelvin), 노을 로맨스는 따뜻한 색온도(낮은 Kelvin)
    expect(noirMetrics.shadowTemperature.estimatedKelvin).toBeGreaterThan(sunsetMetrics.shadowTemperature.estimatedKelvin);
    expect(noirMetrics.contrast.dynamicRange).toBeGreaterThan(0.45);
    expect(noirMetrics.contrast.detectedToneSteps).toBeGreaterThanOrEqual(2);
    expect(noirMetrics.screentone.coverageRatio).toBeGreaterThan(0.04);
    expect(noirMetrics.screentone.patternKind).toBe("halftone-dot");
  });

  it("로컬 DNA 라이브러리에 버전을 누적 기록하고 체크섬 스냅샷 왕복 및 롤백을 지원한다", () => {
    const lib = new LocalStyleDnaLibrary();
    const v1 = lib.ingestCompletedFrame(
      "moonlit-atelier",
      createSyntheticStyleFrame({ frameId: "ep01-c01", preset: "cool-noir-atelier", variant: "master" }),
      { seriesTitle: "자정의 아틀리에", artistName: "Kim" },
    );
    const v2 = lib.ingestCompletedFrame(
      "moonlit-atelier",
      createSyntheticStyleFrame({ frameId: "ep02-c05", preset: "cool-noir-atelier", variant: "aligned" }),
    );
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.profile.sampleCount).toBe(2);
    expect(lib.getVersionHistory("moonlit-atelier")).toHaveLength(2);

    const snapshot = lib.exportSnapshotJson();
    const restored = LocalStyleDnaLibrary.fromSnapshotJson(snapshot);
    expect(restored.getLatestDna("moonlit-atelier")?.dnaFingerprint).toBe(v2.profile.dnaFingerprint);

    // 체크섬 위변조 시 즉시 차단
    const tampered = snapshot.replace("자정의 아틀리에", "변조된 작품명");
    expect(() => LocalStyleDnaLibrary.fromSnapshotJson(tampered)).toThrow(/checksum mismatch/i);

    const rolled = restored.rollbackToVersion("moonlit-atelier", 1);
    expect(rolled?.version).toBe(3);
    expect(rolled?.profile.linework.meanPx).toBe(v1.profile.linework.meanPx);
  });

  it("새 컷 화풍 이탈을 감지하고 원클릭 autoHarmonizeFrameToStyleDna가 ΔE·그림자 이탈을 실제로 크게 낮춘다", () => {
    const lib = new LocalStyleDnaLibrary();
    const record = lib.ingestCompletedFrame(
      "noir-series",
      createSyntheticStyleFrame({ frameId: "master-01", preset: "cool-noir-atelier", variant: "master" }),
    );
    const dna = record.profile;

    const aligned = createSyntheticStyleFrame({ frameId: "ep04-ok", preset: "cool-noir-atelier", variant: "aligned" });
    const drifted = createSyntheticStyleFrame({ frameId: "ep04-bad", preset: "cool-noir-atelier", variant: "drifted" });

    const alignedReport = detectStyleDrift(dna, aligned);
    const driftedReport = detectStyleDrift(dna, drifted);
    expect(alignedReport.consistencyScore).toBeGreaterThan(driftedReport.consistencyScore);
    expect(driftedReport.needsAutoFix).toBe(true);
    expect(driftedReport.alerts.length).toBeGreaterThanOrEqual(2);

    const harmonized = autoHarmonizeFrameToStyleDna(dna, drifted, { strength: 0.95 });
    expect(harmonized.modifiedPixelCount).toBeGreaterThan(500);
    expect(harmonized.afterDrift.paletteDeltaE).toBeLessThan(harmonized.beforeDrift.paletteDeltaE);
    expect(harmonized.afterDrift.shadowDeltaE).toBeLessThan(harmonized.beforeDrift.shadowDeltaE);
    expect(harmonized.scoreImprovement).toBeGreaterThan(10);
    // 알파 채널 무결성 유지
    for (let i = 3; i < harmonized.harmonizedFrame.rgba.length; i += 4) {
      expect(harmonized.harmonizedFrame.rgba[i]).toBe(drifted.rgba[i]);
    }
  });
});

describe("2. 한국어/영어 대본 → 3D 장면·소품·조명·카메라 자동 스테이징 (script-to-3d-staging-engine)", () => {
  it("한국어 옥상 대치 대본과 노을 카페 고백 대본을 정확히 분류하고 24~85mm 충돌 없는 3D 블루프린트를 생성한다", () => {
    const rooftopPlan = generateEpisode3dStagingPlan(DEMO_WEBTOON_SCRIPTS[0]?.scriptText ?? "");
    const bp1 = rooftopPlan.blueprints[0];
    expect(bp1).toBeDefined();
    expect(bp1?.parsed.location).toBe("rooftop");
    expect(bp1?.parsed.emotion).toBe("tension");
    expect(bp1?.parsed.characterCount).toBe(2);
    expect(bp1?.parsed.mentionedPropKeys).toEqual(expect.arrayContaining(["umbrella", "smartphone", "letter"]));
    expect(bp1?.camera.focalLengthMm).toBeGreaterThanOrEqual(24);
    expect(bp1?.camera.focalLengthMm).toBeLessThanOrEqual(85);
    expect(bp1?.validation.overlapCount).toBe(0);
    expect(bp1?.validation.allPropsGrounded).toBe(true);
    expect(bp1?.validation.characterClearanceOk).toBe(true);

    const cafePlan = generateEpisode3dStagingPlan(DEMO_WEBTOON_SCRIPTS[1]?.scriptText ?? "");
    const bp2 = cafePlan.blueprints[0];
    expect(bp2?.parsed.location).toBe("cafe");
    expect(bp2?.parsed.timeOfDay).toBe("sunset");
    expect(bp2?.parsed.emotion).toBe("romance");
    // 노을 로맨스는 따뜻한 색온도 + 망원 압축(65~85mm)
    expect(bp2?.lighting.keyLightKelvin).toBeLessThan(4000);
    expect(bp2?.camera.focalLengthMm).toBeGreaterThanOrEqual(65);
    expect(bp2?.camera.focalLengthMm).toBeLessThanOrEqual(85);
  });

  it("영어 다중 씬 대본을 씬별로 분리하고 각 씬에 맞는 배경·조명·화각(24~85mm)을 생성한다", () => {
    const enScript = DEMO_WEBTOON_SCRIPTS[2]?.scriptText ?? "";
    const parsed = parseWebtoonScript(enScript);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.language).toBe("en");
    expect(parsed[0]?.location).toBe("alley_night");
    expect(parsed[0]?.emotion).toBe("action");
    expect(parsed[1]?.location).toBe("fantasy_throne");
    expect(parsed[1]?.timeOfDay).toBe("dawn");
    expect(parsed[1]?.emotion).toBe("melancholy");

    const plan = generateEpisode3dStagingPlan(enScript);
    expect(plan.totalScenes).toBe(2);
    expect(plan.uniquePresetIds).toHaveLength(2);
    // 액션 추격전은 광각(24~32mm), 모든 씬 겹침 0건
    expect(plan.blueprints[0]?.camera.focalLengthMm).toBeLessThanOrEqual(32);
    for (const bp of plan.blueprints) {
      expect(bp.validation.focalLengthInRange).toBe(true);
      expect(bp.validation.overlapCount).toBe(0);
      expect(bp.lighting.ambientOklch).toMatch(/^oklch\(/);
    }
  });
});

describe("3. 다국어 말풍선 자동 조판 · 4권역 심의 린터 · WebCrypto AES-GCM 컨테이너 (global-balloon-rating-linter)", () => {
  it("5개 언어(KO/EN/JA/ZH/ES) 말풍선 자동 줄바꿈·폰트 최적화와 금칙 처리(JA/ZH)를 수행한다", () => {
    const layouts = typesetBalloonAcrossLanguages(DEMO_MULTILINGUAL_DIALOGUES, {
      shape: "ellipse",
      widthPx: 230,
      heightPx: 155,
      paddingPx: 14,
    });
    expect(layouts).toHaveLength(5);
    for (const layout of layouts) {
      expect(layout.overflow).toBe(false);
      expect(layout.optimalFontSizePx).toBeGreaterThanOrEqual(11);
      expect(layout.optimalFontSizePx).toBeLessThanOrEqual(24);
      expect(layout.lines.length).toBeGreaterThanOrEqual(2);
      expect(layout.kinsokuViolations).toBe(0);
    }

    // 극단적으로 작은 말풍선에서는 overflow=true와 권장 확대 배율을 반환
    const cramped = typesetMultilingualBalloon({
      language: "en",
      text: DEMO_MULTILINGUAL_DIALOGUES.en,
      shape: "ellipse",
      widthPx: 96,
      heightPx: 64,
      minFontSizePx: 12,
      maxFontSizePx: 20,
    });
    expect(cramped.overflow).toBe(true);
    expect(cramped.recommendedBalloonScale).toBeGreaterThan(1.08);
  });

  it("4개 권역(KR·JP·US·EU) 등급 심의 린터가 권역별 차등 규정을 정확히 판정한다", () => {
    const safeReport = lintGlobalContentRating({
      episodeTitle: "EP.01 일상",
      targetTier: "all",
      dialogues: [{ language: "ko", text: "오늘 날씨가 맑다." }],
      bloodLevel: 0,
      weaponProminence: 0,
      nudityExposure: 0,
      substanceUse: "none",
      gamblingDepiction: false,
      selfHarmTheme: false,
      flashingStrobeHz: 0,
    });
    expect(safeReport.allRegionsCompliant).toBe(true);
    expect(safeReport.assessments).toHaveLength(4);

    // 도박 + 6Hz 점멸 → EU는 PEGI 18, JP/EU는 3Hz 초과 광과민성 차단
    const strictReport = lintGlobalContentRating({
      episodeTitle: "EP.19 카지노",
      targetTier: "15+",
      dialogues: [{ language: "en", text: "All in under strobe lights." }],
      bloodLevel: 0,
      weaponProminence: 0,
      nudityExposure: 0,
      substanceUse: "none",
      gamblingDepiction: true,
      selfHarmTheme: false,
      flashingStrobeHz: 6,
    });
    expect(strictReport.allRegionsCompliant).toBe(false);
    const eu = strictReport.assessments.find((a) => a.region === "EU");
    const jp = strictReport.assessments.find((a) => a.region === "JP");
    expect(eu?.computedLabel).toBe("PEGI 18");
    expect(eu?.compliant).toBe(false);
    expect(jp?.compliant).toBe(false);
    expect(jp?.findings.some((f) => f.category === "photosensitivity")).toBe(true);
  });

  it("SandboxedVfsContainer가 WebCrypto AES-256-GCM 무손실 라운드트립·오암호/변조/경로이탈 차단을 수행한다", async () => {
    const caps = detectCrossBrowserCryptoCapabilities();
    expect(caps.hasWebCryptoSubtle).toBe(true);
    expect(caps.usesWebStorage).toBe(false);

    const container = await SandboxedVfsContainer.create({
      passphrase: "studio-master-key-2026",
      backend: new InMemorySandboxedBackend(),
      pbkdf2Iterations: 4000,
    });
    const binaryFixture = new Uint8Array([0, 17, 42, 127, 128, 200, 255, 9, 63]);
    await container.writeEntry("dna/profile.json", JSON.stringify({ ok: true, version: 3 }), "application/json");
    await container.writeEntry("tiles/cut-01.bin", binaryFixture, "application/octet-stream");

    // 경로 이탈 공격 차단
    await expect(container.writeEntry("../escape.txt", "bad")).rejects.toThrow(/traversal/i);

    const archive = await container.exportEncryptedArchive("archive-secret-pass");
    expect(archive.byteLength).toBeGreaterThan(64);

    // 정상 복호화 라운드트립 무손실 확인
    const restored = await SandboxedVfsContainer.importEncryptedArchive(archive, "archive-secret-pass");
    const restoredJson = new TextDecoder().decode(await restored.readEntry("dna/profile.json"));
    const restoredBin = await restored.readEntry("tiles/cut-01.bin");
    expect(JSON.parse(restoredJson)).toEqual({ ok: true, version: 3 });
    expect(Array.from(restoredBin)).toEqual(Array.from(binaryFixture));

    // 잘못된 암호문 거부
    await expect(SandboxedVfsContainer.importEncryptedArchive(archive, "wrong-passphrase")).rejects.toThrow();

    // 1비트 변조 즉시 거부 (AES-GCM 인증 태그 실패)
    const tampered = new Uint8Array(archive);
    tampered[tampered.byteLength - 4] = (tampered[tampered.byteLength - 4] ?? 0) ^ 0x01;
    await expect(SandboxedVfsContainer.importEncryptedArchive(tampered, "archive-secret-pass")).rejects.toThrow();
  });
});

describe("4. StudioAutoStyleDnaPipelinePanel 단독 렌더링 · 4탭 상호작용 · 코드 위생 계약", () => {
  it("props 없이 단독 렌더되며 4개 탭(자동 화풍 DNA · 대본 3D · 다국어/심의 · AES-GCM)이 모두 동작한다", async () => {
    const onHarmonize = vi.fn();
    const onCrypto = vi.fn();
    render(<StudioAutoStyleDnaPipelinePanel onHarmonizeComplete={onHarmonize} onCryptoVerified={onCrypto} />);

    // 1) 자동 화풍 DNA 탭: 초기 메트릭 + 원클릭 보정
    expect(screen.getByTestId("style-dna-metrics-grid")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /원클릭 자동 화풍 보정 실행/ }));
    expect(screen.getByTestId("harmonize-result-banner")).toBeTruthy();
    expect(onHarmonize).toHaveBeenCalledTimes(1);

    // 2) 대본→3D 스테이징 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: /대본→3D 스테이징/ }));
    expect(screen.getByTestId("staging-blueprint-summary")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /노을 카페 고백/ }));
    expect(screen.getByTestId("staging-blueprint-summary").textContent).toContain("bg3d-cafe-atelier-v2");

    // 3) 다국어 조판·4권역 심의 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: /다국어 조판·심의/ }));
    expect(screen.getByTestId("multilingual-balloon-grid").children).toHaveLength(5);
    expect(screen.getByTestId("global-rating-grid").children).toHaveLength(4);

    // 4) AES-GCM 샌드박스 탭 전환 + 라이브 암호화 봉인/변조 검증
    fireEvent.click(screen.getByRole("tab", { name: /AES-GCM 샌드박스/ }));
    fireEvent.click(screen.getByRole("button", { name: /AES-GCM 봉인 · 무손실 왕복 검증/ }));
    await waitFor(() => {
      expect(screen.getByTestId("crypto-vfs-report")).toBeTruthy();
    });
    expect(screen.getByTestId("crypto-vfs-report").textContent).toContain("lossless=true");
    expect(screen.getByTestId("crypto-vfs-report").textContent).toContain("tamperRejected=true");
    expect(onCrypto).toHaveBeenCalledTimes(1);
  });

  it("완전 무인자(<StudioAutoStyleDnaPipelinePanel />) 영문 모드 렌더링을 지원한다", () => {
    useI18n.setState({ lang: "en" });
    render(<StudioAutoStyleDnaPipelinePanel />);
    expect(screen.getByRole("heading", { name: /Automated Style DNA/i })).toBeTruthy();
  });

  it("모듈 내 모든 소스 파일이 800줄 이하이며 패널에 원시 색상·Web Storage·transition-all·Sparkles가 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(6);

    for (const file of files) {
      const content = readFileSync(path.join(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
      if (!file.endsWith(".test.tsx")) {
        expect(content).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/);
      }
    }

    const panelSource = readFileSync(path.join(dir, "StudioAutoStyleDnaPipelinePanel.tsx"), "utf8");
    expect(panelSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSource).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/);
    expect(panelSource).not.toMatch(/\btransition-all\b/);
    expect(panelSource).not.toMatch(/\bSparkles\b/);
  });
});
