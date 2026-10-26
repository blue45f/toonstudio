import { describe, expect, it } from "vitest";

import {
  ARTCRAFT_SUITE_CATALOG,
  auditPdfCraftRedactions,
  composeDesignCraftParagraphKnuthPlass,
  computeSoundCraftSessionAdcAndTimebase,
  convertWordCraftPoints,
  evaluateEffectCraftExpression,
  evaluateGridCraftEpisodeSettlement,
  evaluateLightCraftDevelopPipeline,
  evaluateVectorCraftPipeline,
  foldGridCraftIdentifier,
  interpolateDeckCraftMorphTransition,
  isConfinedArtCraftReleaseDownloadUrl,
  isSafeArtCraftWebLink,
  isScreenshotWithinArtCraftBudget,
  parseArtCraftPackageVersion,
  parseCadCraftPolarCommand,
  parseJpegSofDimensions,
  parseSha256SumsManifest,
  planPhotoCraftTiledCanvas,
  resolveArtCraftAppById,
  resolveWordCraftTrackChanges,
  routeCraftAiTask,
  simulateAniCraftCelScene,
  solveCadCraftTwoDistanceConstraint,
  solveFigCraftHorizontalAutoLayout,
  splitFilmCraftClipAtOffset,
} from "../index";

describe("ArtCraft Crafting Apps 15-Suite Clean-Room Engines", () => {
  it("[3] ArtCraft Launcher: catalogs all 15 apps, resolves former IDs, and enforces CWE-78/180/789 security", () => {
    expect(ARTCRAFT_SUITE_CATALOG).toHaveLength(15);
    expect(resolveArtCraftAppById("printcraft")?.id).toBe("pdfcraft");
    expect(resolveArtCraftAppById("flimcraft")?.id).toBe("filmcraft");
    expect(resolveArtCraftAppById("anicraft")?.namuSection).toBe("4.1");

    // CWE-78 safe_web_link
    expect(isSafeArtCraftWebLink("https://getartcraft.com/docs")).toBe(true);
    expect(isSafeArtCraftWebLink("https://evil.example/a$(id)")).toBe(false);
    expect(isSafeArtCraftWebLink("https://evil.example/a&calc.exe")).toBe(false);
    expect(isSafeArtCraftWebLink("file:///etc/passwd")).toBe(false);

    // CWE-180 download_url_under
    expect(
      isConfinedArtCraftReleaseDownloadUrl(
        "https://github.com/storytold/photocraft/releases/download/v0.16.0/photocraft-web-0.16.0.zip",
        "https://github.com/storytold/photocraft",
        "photocraft-web-0.16.0.zip",
      ),
    ).toBe(true);
    expect(
      isConfinedArtCraftReleaseDownloadUrl(
        "https://github.com/storytold/photocraft/releases/download/v0.16.0/sub/evil.zip",
        "https://github.com/storytold/photocraft",
      ),
    ).toBe(false);

    // CWE-789 JPEG SOF0 dimension parser & decompression bomb check
    const makeSof0Jpeg = (w: number, h: number) =>
      new Uint8Array([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
        (h >> 8) & 0xff, h & 0xff,
        (w >> 8) & 0xff, w & 0xff,
        0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
        0xff, 0xd9,
      ]);
    expect(parseJpegSofDimensions(makeSof0Jpeg(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(isScreenshotWithinArtCraftBudget(makeSof0Jpeg(1920, 1080)).allowed).toBe(true);
    expect(isScreenshotWithinArtCraftBudget(makeSof0Jpeg(16384, 16384)).allowed).toBe(false);

    // Debian/AUR version parser & SHA256SUMS
    expect(parseArtCraftPackageVersion("1:0.16.0~beta1-1")).toEqual({
      major: 0,
      minor: 16,
      patch: 0,
      preRelease: "beta1",
    });
    const sums = parseSha256SumsManifest(`${"a".repeat(64)} *photocraft.zip`);
    expect(sums.get("photocraft.zip")).toBe("a".repeat(64));

    const aiRoute = routeCraftAiTask("segmentation-sam3", true);
    expect(aiRoute.executionTarget).toBe("local-rust-candle-rten");
  });

  it("[3.1~3.4, 3.6, 4.1] Creative Media & AniCraft engines compute exact metrics and invariants", () => {
    // [3.1] PhotoCraft
    const pcraftPlan = planPhotoCraftTiledCanvas({
      widthPx: 1600,
      heightPx: 24000,
      bitDepth: 16,
      layerCount: 12,
      emptyTileRatio: 0.4,
      duplicateTileRatio: 0.5,
    });
    expect(pcraftPlan.finiteCheckPassed).toBe(true);
    expect(pcraftPlan.savingsPercent).toBeGreaterThan(70);

    // [3.2] VectorCraft
    const vec = evaluateVectorCraftPipeline({
      booleanOp: "divide",
      brushKind: "bristle",
      pathCount: 4,
      anchorCount: 20,
      mode3d: "revolve",
      extrudeDepthPt: 30,
    });
    expect(vec.resultingRegionCount).toBe(12);
    expect(vec.generatedBrushStamps).toBeGreaterThan(100);

    // [3.3] FilmCraft reverse clip split continuity
    const reversedSplit = splitFilmCraftClipAtOffset(
      {
        id: "clip-1",
        name: "reverse-action",
        timelineStartTicks: 100,
        durationTicks: 1000,
        sourceInTicks: 900,
        speed: -1.0,
        syncLocked: true,
      },
      400,
    );
    expect(reversedSplit.leftClip.durationTicks).toBe(400);
    expect(reversedSplit.rightClip.durationTicks).toBe(600);
    expect(reversedSplit.rightClip.sourceInTicks).toBe(500);
    expect(reversedSplit.reverseContinuityPreserved).toBe(true);

    // [3.4] LightCraft
    const lc = evaluateLightCraftDevelopPipeline({
      isRaw: true,
      patch: { exposure: 1.2 },
      enableSam3SubjectMask: true,
      hdrBracketCount: 3,
    });
    expect(lc.settings.sharpenAmount).toBe(40);
    expect(lc.settings.nrColor).toBe(25);
    expect(lc.previewCacheHash).toHaveLength(16);

    // [3.6] EffectCraft
    const expr = evaluateEffectCraftExpression({
      timeSeconds: 0.75,
      baseValue: 50,
      wiggleFreqHz: 4,
      wiggleAmp: 20,
      loopDurationSeconds: 2,
    });
    expect(expr.evaluatedValue).not.toBeNaN();
    expect(expr.lottieKeyframeCount).toBe(48);

    // [4.1] AniCraft
    const ani = simulateAniCraftCelScene({
      durationSeconds: 2,
      fps: 24,
      komaMode: "2k-on-twos",
      prevOnionFrames: 2,
      nextOnionFrames: 2,
      dialogueLine: "아오이",
    });
    expect(ani.uniqueDrawingsRequired).toBe(24);
    expect(ani.onionSkinWeights).toHaveLength(4);
    expect(ani.lipSyncCues.map((c) => c.mouthCode)).toEqual(["D", "F", "C"]);
  });

  it("[3.5, 3.7~3.13] Publishing, Office, DAW, CAD & Spreadsheet engines uphold REA contracts", () => {
    // [3.5] PdfCraft faux-redaction audit
    const audit = auditPdfCraftRedactions([
      {
        pageNumber: 2,
        targetText: "비밀 계약금",
        hasOpaqueOverlayRect: true,
        glyphsRemovedFromContentStream: false,
      },
    ]);
    expect(audit.fauxRedactionCount).toBe(1);
    expect(audit.safeForExternalDistribution).toBe(false);

    // [3.7] DesignCraft Knuth-Plass line breaking
    const kp = composeDesignCraftParagraphKnuthPlass(
      "시계탑 꼭대기에서 내려다본 왕도의 밤하늘에는 열두 개의 붉은 달이 차례대로 떠올랐다.",
      20,
    );
    expect(kp.lines.length).toBeGreaterThanOrEqual(2);
    expect(kp.totalDemerits).toBeLessThanOrEqual(kp.greedyDemerits);

    // [3.8] FigCraft Auto Layout
    const layout = solveFigCraftHorizontalAutoLayout({
      containerWidthPx: 600,
      paddingPx: 20,
      gapPx: 10,
      children: [
        { id: "icon", sizing: "fixed", baseSizePx: 40 },
        { id: "body", sizing: "fill", baseSizePx: 100 },
      ],
    });
    expect(layout.solvedChildren[1]?.widthPx).toBe(510);

    // [3.9] WordCraft Track Changes & units
    expect(
      resolveWordCraftTrackChanges(
        [
          { text: "안녕 ", revision: "unchanged" },
          { text: "구버전", revision: "deleted" },
          { text: "신버전", revision: "inserted" },
        ],
        "accept-all",
      ),
    ).toBe("안녕 신버전");
    expect(convertWordCraftPoints(10)).toEqual({
      points: 10,
      twips: 200,
      emu: 127000,
      millimeters: 3.528,
    });

    // [3.10] SoundCraft ADC & 5 timebases
    const adc = computeSoundCraftSessionAdcAndTimebase({
      positionSamples: 48000 * 2,
      sampleRateHz: 48000,
      tempoBpm: 120,
      tracks: [
        { trackId: "vox", pluginLatencySamples: 64 },
        { trackId: "master", pluginLatencySamples: 512 },
      ],
    });
    expect(adc.maxLatencySamples).toBe(512);
    expect(adc.compensationByTrack.vox).toBe(448);
    expect(adc.timecode24Fps).toBe("00:00:02:00");
    expect(adc.feetAndFrames35mm).toBe("3+00");

    // [3.11] DeckCraft Morph transition
    const morphed = interpolateDeckCraftMorphTransition(
      { matchName: "!!hero", x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, color: [0, 0, 0] },
      { matchName: "!!hero", x: 200, y: 100, width: 300, height: 200, rotationDeg: 90, color: [200, 100, 50] },
      0.5,
    );
    expect(morphed.x).toBe(100);
    expect(morphed.width).toBe(200);

    // [3.12] CADCraft Polar command & Damped Gauss-Newton constraint solver
    expect(parseCadCraftPolarCommand("@100<0", { x: 10, y: 20 })).toEqual({ x: 110, y: 20 });
    const cadSolved = solveCadCraftTwoDistanceConstraint({
      bx: 100,
      targetDistOrigin: 100,
      targetDistB: 100,
    });
    expect(cadSolved.converged).toBe(true);
    expect(cadSolved.x).toBeCloseTo(50, 2);
    expect(cadSolved.y).toBeCloseTo(86.6025, 2);

    // [3.13] GridCraft Unicode case folding & dynamic array spill
    expect(foldGridCraftIdentifier("straße_ς_ſ")).toBe("STRASSE_Σ_S");
    const grid = evaluateGridCraftEpisodeSettlement({
      variableNames: ["maß_1", "bonus_ς"],
      cutCountsPerEpisode: [60, 70],
      feePerCutKrw: 30000,
      platformBonusKrw: 100000,
    });
    expect(grid.foldedVariableKeys).toEqual(["MASS_1", "BONUS_Σ"]);
    expect(grid.spilledCutFeesKrw).toEqual([1900000, 2200000]);
    expect(grid.totalSettlementKrw).toBe(4100000);
  });
});
