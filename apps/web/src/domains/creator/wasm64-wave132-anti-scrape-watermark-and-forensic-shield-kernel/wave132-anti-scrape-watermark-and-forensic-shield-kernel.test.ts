import { describe, expect, it } from "vitest";
import {
  ForensicWatermarkError,
  MID_BAND_DCT_PAIRS,
  SYNC_PREAMBLE_BITS,
  buildForensicWatermarkWgsl,
  buildJpegLumaQuantTable,
  canonicalizeJsonForHash,
  compileAntiScrapeRightsManifest,
  computeForensicCrc8,
  createSyntheticWebtoonTile,
  detectInvisibleDctWatermark,
  embedInvisibleDctWatermark,
  encodeForensicPayloadBits,
  escapeSvgXml,
  forwardDct8x8,
  inverseDct8x8,
  matchDetectedPayloadToRecipients,
  renderForensicWatermarkShieldSvg,
  sha256Hex,
  simulatePiracyAttack,
  simulatePiracyAttackAndDetectWatermark,
  summarizeForensicWatermarkShieldKo,
  validateForensicWatermarkWgsl,
  verifyDct8x8RoundTrip,
  type BitValue,
  type WatermarkTileImage,
} from "./index";

const DEFAULT_SECRET_KEY = "toonstudio-wave132-master-forensic-key-2026";
const DEFAULT_PAYLOAD = {
  creatorId: "artist-han-jiwon",
  episodeId: "ep-042-rooftop-duel",
  recipientId: "advance-reviewer-seoul-07",
};

function makeSolidGrayTile(width: number, height: number, value: number): WatermarkTileImage {
  const data = new Uint8Array(width * height);
  data.fill(value);
  return { width, height, format: "luma-u8", data };
}

function makeWebtoonLineartTile(width: number, height: number): WatermarkTileImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isInk = (x % 23 === 0 && y > 8 && y < height - 8) || Math.abs((x - y) % 31) === 0;
      const tone = isInk ? 36 : Math.round(205 - (y / height) * 32 - (x / width) * 18);
      const off = (y * width + x) * 4;
      data[off] = tone;
      data[off + 1] = Math.max(24, tone - 6);
      data[off + 2] = Math.max(20, tone - 12);
      data[off + 3] = 255;
    }
  }
  return { width, height, format: "rgba-u8", data };
}

function maskOuter8pxZero(tile: WatermarkTileImage): WatermarkTileImage {
  const out = new Uint8Array(tile.data);
  const channels = tile.format === "rgba-u8" ? 4 : 1;
  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      if (x < 8 || y < 8 || x >= tile.width - 8 || y >= tile.height - 8) {
        const off = (y * tile.width + x) * channels;
        for (let c = 0; c < (channels === 4 ? 3 : 1); c += 1) out[off + c] = 0;
      }
    }
  }
  return { width: tile.width, height: tile.height, format: tile.format, data: out };
}

describe("Wave 132 — 8x8 DCT-II/IDCT-II 수학적 정확도 및 직교성", () => {
  it("부드러운 그라데이션 블록의 8x8 DCT-II -> IDCT-II 왕복 오차가 1e-4 미만이다", () => {
    const block = new Float64Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) block[y * 8 + x] = 24 + x * 18.5 + y * 11.25;
    }
    const maxErr = verifyDct8x8RoundTrip(block);
    expect(maxErr).toBeLessThan(1e-4);
    expect(maxErr).toBeLessThan(1e-10);
  });

  it("고대비 선화·체커보드 및 음수 실수 블록에서도 DCT-II -> IDCT-II 왕복 오차가 1e-4 미만이다", () => {
    const block = new Float64Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) block[y * 8 + x] = (x + y) % 2 === 0 ? 127.5 : -128.25;
    }
    expect(verifyDct8x8RoundTrip(block)).toBeLessThan(1e-4);
  });

  it("직교 2D DCT-II는 Parseval 에너지 보존 법칙을 만족한다", () => {
    const block = new Float64Array(64);
    let spatialEnergy = 0;
    for (let i = 0; i < 64; i += 1) {
      const v = Math.sin(i * 0.73) * 110 + 128;
      block[i] = v;
      spatialEnergy += v * v;
    }
    const dct = forwardDct8x8(block);
    let freqEnergy = 0;
    for (let i = 0; i < 64; i += 1) freqEnergy += dct[i] * dct[i];
    expect(Math.abs(spatialEnergy - freqEnergy)).toBeLessThan(1e-6);
  });

  it("단일 DC 블록은 (0,0) 계수에만 8*value 에너지가 집중되고 나머지 AC 계수는 0이다", () => {
    const dct = forwardDct8x8(new Float64Array(64).fill(100));
    expect(Math.abs(dct[0] - 800)).toBeLessThan(1e-9);
    for (let i = 1; i < 64; i += 1) expect(Math.abs(dct[i])).toBeLessThan(1e-9);
  });

  it("길이가 64가 아니거나 비유한 값이 섞인 DCT/IDCT 블록을 fail-closed 거부한다", () => {
    expect(() => forwardDct8x8(new Float64Array(63))).toThrow(ForensicWatermarkError);
    expect(() => inverseDct8x8(new Float64Array(65))).toThrow(ForensicWatermarkError);
    const bad = new Float64Array(64).fill(10);
    bad[17] = Number.NaN;
    expect(() => forwardDct8x8(bad)).toThrow(ForensicWatermarkError);
    bad[17] = Number.POSITIVE_INFINITY;
    expect(() => inverseDct8x8(bad)).toThrow(ForensicWatermarkError);
  });

  it("JPEG Q=75 표준 휘도 양자화 테이블의 중주파 스텝이 MID_BAND_DCT_PAIRS 사양과 일치한다", () => {
    const q75 = buildJpegLumaQuantTable(75);
    for (let i = 0; i < MID_BAND_DCT_PAIRS.length; i += 1) {
      const pair = MID_BAND_DCT_PAIRS[i];
      const qA = q75[pair.first.v * 8 + pair.first.u];
      const qB = q75[pair.second.v * 8 + pair.second.u];
      expect(qA).toBe(pair.jpegQ75Steps[0]);
      expect(qB).toBe(pair.jpegQ75Steps[1]);
      expect(pair.baseMargin).toBeGreaterThan((qA + qB) / 2);
    }
  });
});

describe("Wave 132 — 비가시 중주파 워터마크 삽입 및 블라인드 복원", () => {
  it("64x64 RGBA 웹툰 타일에 기본 강도 삽입 시 PSNR >= 40.0 dB, 비유한/이탈 채널 0건, 알파 100% 보존된다", () => {
    const src = createSyntheticWebtoonTile(64, 64, "rgba-u8", 132);
    const res = embedInvisibleDctWatermark(src, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD });
    expect(res.psnrDb).toBeGreaterThanOrEqual(40.0);
    expect(res.nonFiniteChannelCount).toBe(0);
    expect(res.outOfRangeChannelCount).toBe(0);
    expect(res.totalBlocks).toBe(64);
    expect(res.copiesPerBit).toBe(8);
    expect(res.averageDctAbsEnergy).toHaveLength(64);
    for (let i = 3; i < src.data.length; i += 4) expect(res.watermarkedTile.data[i]).toBe(src.data[i]);
  });

  it("128x128 RGBA 및 64x64 Luma-u8 타일에서도 PSNR >= 40.0 dB로 무공격 100% 블라인드 복원된다", () => {
    const embedRgba = embedInvisibleDctWatermark(createSyntheticWebtoonTile(128, 128, "rgba-u8", 404), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
    });
    expect(embedRgba.psnrDb).toBeGreaterThanOrEqual(40.0);
    const detRgba = detectInvisibleDctWatermark(embedRgba.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedRgba.encodedPayload.payloadBits,
    });
    expect(detRgba.detected).toBe(true);
    expect(detRgba.bitErrorRate).toBe(0);
    expect(detRgba.crcValid).toBe(true);
    expect(detRgba.normalizedCorrelation).toBeGreaterThanOrEqual(0.85);

    const embedLuma = embedInvisibleDctWatermark(createSyntheticWebtoonTile(64, 64, "luma-u8", 77), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
    });
    expect(embedLuma.psnrDb).toBeGreaterThanOrEqual(40.0);
    const detLuma = detectInvisibleDctWatermark(embedLuma.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedLuma.encodedPayload.payloadBits,
    });
    expect(detLuma.detected).toBe(true);
    expect(detLuma.bitErrorRate).toBe(0);
    expect(detLuma.recoveredPayloadCode).toBe(embedLuma.encodedPayload.payloadCode);
  });

  it("고대비 선화(ink lineart) 타일과 단색 회색 타일에서도 PSNR >= 40.0 dB 및 무오류 복원을 만족한다", () => {
    const embedLineart = embedInvisibleDctWatermark(makeWebtoonLineartTile(96, 96), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
    });
    expect(embedLineart.psnrDb).toBeGreaterThanOrEqual(40.0);
    const detLineart = detectInvisibleDctWatermark(embedLineart.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedLineart.encodedPayload.payloadBits,
    });
    expect(detLineart.detected).toBe(true);
    expect(detLineart.bitErrorRate).toBe(0);

    const embedSolid = embedInvisibleDctWatermark(makeSolidGrayTile(64, 64, 128), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
    });
    expect(embedSolid.psnrDb).toBeGreaterThanOrEqual(40.0);
    const detSolid = detectInvisibleDctWatermark(embedSolid.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedSolid.encodedPayload.payloadBits,
    });
    expect(detSolid.detected).toBe(true);
    expect(detSolid.bitErrorRate).toBe(0);
  });

  it("명시적 16비트 payloadBits 및 정수 payloadCode 입력을 정확히 삽입·복원한다", () => {
    const tile = createSyntheticWebtoonTile(64, 64, "rgba-u8", 9);
    const explicitBits: readonly BitValue[] = [1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1];
    const embedA = embedInvisibleDctWatermark(tile, {
      secretKey: DEFAULT_SECRET_KEY,
      payload: { ...DEFAULT_PAYLOAD, payloadBits: explicitBits },
    });
    expect(embedA.encodedPayload.payloadHex).toBe("a6c3");
    const detA = detectInvisibleDctWatermark(embedA.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: explicitBits,
    });
    expect(detA.detected).toBe(true);
    expect(detA.recoveredPayloadBits).toEqual(explicitBits);
    expect(detA.bitErrorRate).toBe(0);

    const embedB = embedInvisibleDctWatermark(tile, {
      secretKey: DEFAULT_SECRET_KEY,
      payload: { ...DEFAULT_PAYLOAD, payloadCode: 0x3b7e },
    });
    const detB = detectInvisibleDctWatermark(embedB.watermarkedTile, { secretKey: DEFAULT_SECRET_KEY });
    expect(detB.detected).toBe(true);
    expect(detB.recoveredPayloadCode).toBe(0x3b7e);
    expect(detB.bitErrorRate).toBeNull();
  });

  it("워터마크 강도를 상향(1.25x)해도 PSNR >= 38.0 dB 불변식을 지킨다", () => {
    const embed = embedInvisibleDctWatermark(createSyntheticWebtoonTile(64, 64, "rgba-u8", 11), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
      strength: 1.25,
    });
    expect(embed.psnrDb).toBeGreaterThanOrEqual(38.0);
    const det = detectInvisibleDctWatermark(embed.watermarkedTile, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embed.encodedPayload.payloadBits,
    });
    expect(det.detected).toBe(true);
    expect(det.bitErrorRate).toBe(0);
  });
});

describe("Wave 132 — 4종 불법 복제 공격 내성 검증", () => {
  const embedded64 = embedInvisibleDctWatermark(createSyntheticWebtoonTile(64, 64, "rgba-u8", 2026), {
    secretKey: DEFAULT_SECRET_KEY,
    payload: DEFAULT_PAYLOAD,
  });
  const embedded128 = embedInvisibleDctWatermark(createSyntheticWebtoonTile(128, 128, "rgba-u8", 2026), {
    secretKey: DEFAULT_SECRET_KEY,
    payload: DEFAULT_PAYLOAD,
  });

  it("공격 1 (jpeg-quantization-q75): JPEG Q=75 양자화 후에도 페이로드를 100% 복원한다", () => {
    const det = detectInvisibleDctWatermark(
      simulatePiracyAttack(embedded64.watermarkedTile, "jpeg-quantization-q75"),
      { secretKey: DEFAULT_SECRET_KEY, expectedPayloadBits: embedded64.encodedPayload.payloadBits },
    );
    expect(det.detected).toBe(true);
    expect(det.bitErrorRate).toBe(0);
    expect(det.normalizedCorrelation).toBeGreaterThanOrEqual(0.65);
    expect(det.recoveredPayloadHex).toBe(embedded64.encodedPayload.payloadHex);
  });

  it("공격 2 (brightness-contrast-shift): 밝기 +8% · 대비 1.06x 변조 후에도 페이로드를 100% 복원한다", () => {
    const det = detectInvisibleDctWatermark(
      simulatePiracyAttack(embedded64.watermarkedTile, "brightness-contrast-shift"),
      { secretKey: DEFAULT_SECRET_KEY, expectedPayloadBits: embedded64.encodedPayload.payloadBits },
    );
    expect(det.detected).toBe(true);
    expect(det.bitErrorRate).toBe(0);
    expect(det.normalizedCorrelation).toBeGreaterThanOrEqual(0.65);
  });

  it("공격 3 (additive-noise): 결정론적 ±4 잡음 주입 후에도 페이로드를 100% 복원한다", () => {
    const det = detectInvisibleDctWatermark(
      simulatePiracyAttack(embedded64.watermarkedTile, "additive-noise"),
      { secretKey: DEFAULT_SECRET_KEY, expectedPayloadBits: embedded64.encodedPayload.payloadBits },
    );
    expect(det.detected).toBe(true);
    expect(det.bitErrorRate).toBe(0);
    expect(det.normalizedCorrelation).toBeGreaterThanOrEqual(0.65);
  });

  it("공격 4 (border-crop-12pct): 외곽 8px 물리 크롭 후 위상 (1,1)을 자동 정렬해 100% 복원한다", () => {
    const cropped64 = simulatePiracyAttack(embedded64.watermarkedTile, "border-crop-12pct");
    expect(cropped64.width).toBe(48);
    expect(cropped64.height).toBe(48);
    const det = detectInvisibleDctWatermark(cropped64, {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedded64.encodedPayload.payloadBits,
    });
    expect(det.detected).toBe(true);
    expect(det.bitErrorRate).toBe(0);
    expect(det.normalizedCorrelation).toBeGreaterThanOrEqual(0.65);
    expect(det.phaseShiftX).toBe(1);
    expect(det.phaseShiftY).toBe(1);
  });

  it("외곽 8px 0-마스킹 변조에서도 비활성 블록을 자동 제외하고 페이로드를 100% 복원한다", () => {
    const det = detectInvisibleDctWatermark(maskOuter8pxZero(embedded64.watermarkedTile), {
      secretKey: DEFAULT_SECRET_KEY,
      expectedPayloadBits: embedded64.encodedPayload.payloadBits,
    });
    expect(det.detected).toBe(true);
    expect(det.activeBlockCount).toBe(36);
    expect(det.totalBlockCount).toBe(64);
    expect(det.bitErrorRate).toBe(0);
    expect(det.normalizedCorrelation).toBeGreaterThanOrEqual(0.65);
  });

  it("simulatePiracyAttackAndDetectWatermark 스위트가 64x64와 128x128 모두 4종 공격 전수 통과한다", () => {
    const suite64 = simulatePiracyAttackAndDetectWatermark(embedded64, DEFAULT_SECRET_KEY);
    expect(suite64.allAttacksPassed).toBe(true);
    expect(suite64.attacks).toHaveLength(4);
    expect(suite64.minCorrelationAcrossAttacks).toBeGreaterThanOrEqual(0.65);
    expect(suite64.maxBitErrorRateAcrossAttacks).toBeLessThan(0.05);

    const suite128 = simulatePiracyAttackAndDetectWatermark(embedded128, DEFAULT_SECRET_KEY);
    expect(suite128.allAttacksPassed).toBe(true);
    expect(suite128.minCorrelationAcrossAttacks).toBeGreaterThanOrEqual(0.75);
    expect(suite128.maxBitErrorRateAcrossAttacks).toBe(0);
  });
});

describe("Wave 132 — 불변식 2 (오탐 0건) 및 유출자 ID 구별", () => {
  it("워터마크가 없는 원본 웹툰 타일 5종에서 모두 detected === false를 보장한다", () => {
    const tiles: readonly WatermarkTileImage[] = [
      createSyntheticWebtoonTile(64, 64, "rgba-u8", 1),
      createSyntheticWebtoonTile(64, 64, "luma-u8", 42),
      createSyntheticWebtoonTile(128, 128, "rgba-u8", 99),
      makeSolidGrayTile(64, 64, 180),
      makeWebtoonLineartTile(64, 64),
    ];
    for (let i = 0; i < tiles.length; i += 1) {
      const det = detectInvisibleDctWatermark(tiles[i], { secretKey: DEFAULT_SECRET_KEY });
      expect(det.detected).toBe(false);
      expect(det.rejectionReason).not.toBeNull();
    }
  });

  it("전부 0으로 채워진 빈 타일은 유효 블록 부족으로 detected === false를 반환한다", () => {
    const det = detectInvisibleDctWatermark(makeSolidGrayTile(64, 64, 0), { secretKey: DEFAULT_SECRET_KEY });
    expect(det.detected).toBe(false);
    expect(det.activeBlockCount).toBe(0);
  });

  it("틀린 비밀 키 5종으로 워터마크 이미지를 검출하면 모두 detected === false를 보장한다", () => {
    const embed = embedInvisibleDctWatermark(createSyntheticWebtoonTile(96, 96, "rgba-u8", 55), {
      secretKey: DEFAULT_SECRET_KEY,
      payload: DEFAULT_PAYLOAD,
    });
    const wrongKeys = [
      "wrong-forensic-key-alpha",
      "wrong-forensic-key-beta",
      "toonstudio-wave132-master-forensic-key-2025",
      "other-studio-secret-9999",
      "completely-unrelated-seed",
    ];
    for (let i = 0; i < wrongKeys.length; i += 1) {
      const det = detectInvisibleDctWatermark(embed.watermarkedTile, { secretKey: wrongKeys[i] });
      expect(det.detected).toBe(false);
      expect(det.rejectionReason).not.toBeNull();
    }
  });

  it("서로 다른 유출자 ID 4명을 삽입하고 JPEG/크롭 공격 후에도 유출자를 정확히 식별한다", () => {
    const src = createSyntheticWebtoonTile(96, 96, "rgba-u8", 88);
    const recipients = ["reviewer-seoul-01", "translator-tokyo-02", "platform-qa-03", "press-embargo-04"];
    const seenHex = new Set<string>();

    for (let i = 0; i < recipients.length; i += 1) {
      const recipientId = recipients[i];
      const embed = embedInvisibleDctWatermark(src, {
        secretKey: DEFAULT_SECRET_KEY,
        payload: { creatorId: DEFAULT_PAYLOAD.creatorId, episodeId: DEFAULT_PAYLOAD.episodeId, recipientId },
      });
      seenHex.add(embed.encodedPayload.payloadHex);
      const attacked = simulatePiracyAttack(
        simulatePiracyAttack(embed.watermarkedTile, "jpeg-quantization-q75"),
        "border-crop-12pct",
      );
      const det = detectInvisibleDctWatermark(attacked, { secretKey: DEFAULT_SECRET_KEY });
      expect(det.detected).toBe(true);
      expect(
        matchDetectedPayloadToRecipients(det, DEFAULT_PAYLOAD.creatorId, DEFAULT_PAYLOAD.episodeId, recipients),
      ).toBe(recipientId);
    }
    expect(seenHex.size).toBe(recipients.length);
  });

  it("CRC-8 체크섬이 페이로드 1비트 변경을 결정론적으로 감지한다", () => {
    const base = 0x5a3c;
    const baseCrc = computeForensicCrc8(base);
    for (let bit = 0; bit < 16; bit += 1) {
      expect(computeForensicCrc8(base ^ (1 << bit))).not.toBe(baseCrc);
    }
    expect(SYNC_PREAMBLE_BITS).toHaveLength(8);
  });
});

describe("Wave 132 — AI 무단 학습 거부(TDM / C2PA) 매니페스트 및 FIPS 180-4 SHA-256", () => {
  it("순수 ES2017 동기 SHA-256이 공식 NIST FIPS 180-4 테스트 벡터 3종과 정확히 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("UTF-8 한글 및 이모지(서로게이트 쌍) 입력에 대해 결정론적 64자리 SHA-256 해시를 산출한다", () => {
    const h1 = sha256Hex("툰스튜디오 저작권 보호 🛡️");
    expect(h1).toBe(sha256Hex("툰스튜디오 저작권 보호 🛡️"));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compileAntiScrapeRightsManifest가 TDM=1, C2PA notAllowed, HTTP·PNG·WebP 메타데이터를 완비한다", () => {
    const src = createSyntheticWebtoonTile(64, 64, "rgba-u8", 301);
    const embed = embedInvisibleDctWatermark(src, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD });
    const manifest = compileAntiScrapeRightsManifest({
      workTitle: "옥상 결투 <제42화> & 외전",
      creatorId: DEFAULT_PAYLOAD.creatorId,
      episodeId: DEFAULT_PAYLOAD.episodeId,
      recipientId: DEFAULT_PAYLOAD.recipientId,
      rightsHolder: "ToonStudio Original Lab",
      issuedDate: "2026-11-28",
      watermarkPayloadHex: embed.encodedPayload.payloadHex,
      policyUrl: "https://www.toonstudio.cloud/legal/tdm-policy.json",
      originalPixels: src.data,
      watermarkedPixels: embed.watermarkedTile.data,
    });

    expect(manifest.tdmReservation).toBe(1);
    expect(manifest.c2paTrainingMining.label).toBe("c2pa.training-mining");
    expect(manifest.c2paTrainingMining.summaryPolicy).toBe("notAllowed");
    expect(manifest.c2paTrainingMining.entries["c2pa.ai_generative_training"].use).toBe("notAllowed");
    expect(manifest.httpHeaders["TDM-Reservation"]).toBe("1");
    expect(manifest.httpHeaders["C2PA-Training-Mining"]).toBe("notAllowed");
    expect(manifest.httpHeaders["X-Robots-Tag"]).toBe("noai, noimageai");
    expect(manifest.httpHeaders["X-ToonStudio-Manifest-SHA256"]).toBe(manifest.manifestSha256Hex);
    expect(manifest.pngMetadataChunks.map((c) => c.keyword)).toContain("XML:com.adobe.xmp");
    expect(manifest.webpMetadata.chunkFourCC).toBe("XMP ");
    expect(manifest.webpMetadata.xmpPacket).toContain("&lt;제42화&gt; &amp; 외전");
    expect(manifest.originalAssetSha256Hex).not.toBe(manifest.watermarkedAssetSha256Hex);
  });

  it("매니페스트 SHA-256은 입력 태그·객체 키 순서와 무관하게 100% 결정론적이며 1바이트 변조에 민감하다", () => {
    const src = createSyntheticWebtoonTile(64, 64, "luma-u8", 15);
    const embed = embedInvisibleDctWatermark(src, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD });

    const m1 = compileAntiScrapeRightsManifest({
      workTitle: "회차 42",
      creatorId: DEFAULT_PAYLOAD.creatorId,
      episodeId: DEFAULT_PAYLOAD.episodeId,
      recipientId: DEFAULT_PAYLOAD.recipientId,
      rightsHolder: "Studio A",
      issuedDate: "2026-11-28",
      watermarkPayloadHex: embed.encodedPayload.payloadHex,
      originalPixels: src.data,
      watermarkedPixels: embed.watermarkedTile.data,
      additionalTags: { z_region: "KR", a_tier: "embargo", m_channel: "preview" },
    });
    const m2 = compileAntiScrapeRightsManifest({
      rightsHolder: "Studio A",
      episodeId: DEFAULT_PAYLOAD.episodeId,
      workTitle: "회차 42",
      watermarkPayloadHex: embed.encodedPayload.payloadHex.toUpperCase(),
      issuedDate: "2026-11-28",
      creatorId: DEFAULT_PAYLOAD.creatorId,
      recipientId: DEFAULT_PAYLOAD.recipientId,
      originalPixels: src.data,
      watermarkedPixels: embed.watermarkedTile.data,
      additionalTags: { m_channel: "preview", z_region: "KR", a_tier: "embargo" },
    });
    expect(m1.canonicalManifestJson).toBe(m2.canonicalManifestJson);
    expect(m1.manifestSha256Hex).toBe(m2.manifestSha256Hex);

    const tampered = new Uint8Array(embed.watermarkedTile.data);
    tampered[0] = (tampered[0] + 1) & 0xff;
    const m3 = compileAntiScrapeRightsManifest({
      workTitle: "회차 42",
      creatorId: DEFAULT_PAYLOAD.creatorId,
      episodeId: DEFAULT_PAYLOAD.episodeId,
      recipientId: DEFAULT_PAYLOAD.recipientId,
      rightsHolder: "Studio A",
      issuedDate: "2026-11-28",
      watermarkPayloadHex: embed.encodedPayload.payloadHex,
      originalPixels: src.data,
      watermarkedPixels: tampered,
    });
    expect(m3.manifestSha256Hex).not.toBe(m1.manifestSha256Hex);
  });

  it("canonicalizeJsonForHash는 비유한 숫자(NaN/Infinity)를 fail-closed 거부한다", () => {
    expect(() => canonicalizeJsonForHash({ bad: Number.NaN })).toThrow(ForensicWatermarkError);
    expect(() => canonicalizeJsonForHash([1, Number.POSITIVE_INFINITY])).toThrow(ForensicWatermarkError);
  });
});

describe("Wave 132 — 잘못된 타일·크기·파라미터 fail-closed 검증", () => {
  it("64x64 미만 또는 8의 배수가 아닌 타일·버퍼 길이 불일치를 fail-closed 거부한다", () => {
    const badTiles: readonly WatermarkTileImage[] = [
      { width: 56, height: 56, format: "luma-u8", data: new Uint8Array(56 * 56) },
      { width: 70, height: 64, format: "luma-u8", data: new Uint8Array(70 * 64) },
      { width: 64, height: 64, format: "rgba-u8", data: new Uint8Array(64 * 64) },
    ];
    for (let i = 0; i < badTiles.length; i += 1) {
      expect(() =>
        embedInvisibleDctWatermark(badTiles[i], { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD }),
      ).toThrow(ForensicWatermarkError);
    }
  });

  it("범위 밖 strength, 짧은 키, 잘못된 payloadBits/manifest 날짜·URL을 fail-closed 거부한다", () => {
    const tile = createSyntheticWebtoonTile(64, 64, "luma-u8", 1);
    expect(() =>
      embedInvisibleDctWatermark(tile, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD, strength: 0.1 }),
    ).toThrow(ForensicWatermarkError);
    expect(() =>
      embedInvisibleDctWatermark(tile, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD, strength: Number.NaN }),
    ).toThrow(ForensicWatermarkError);
    expect(() =>
      embedInvisibleDctWatermark(tile, { secretKey: "123", payload: DEFAULT_PAYLOAD }),
    ).toThrow(ForensicWatermarkError);
    expect(() => encodeForensicPayloadBits({ ...DEFAULT_PAYLOAD, payloadBits: [1, 0, 1] })).toThrow(
      ForensicWatermarkError,
    );
    expect(() =>
      compileAntiScrapeRightsManifest({
        workTitle: "Test", creatorId: "c", episodeId: "e", recipientId: "r", rightsHolder: "h",
        issuedDate: "2026/11/28", watermarkPayloadHex: "abcd",
      }),
    ).toThrow(ForensicWatermarkError);
    expect(() =>
      compileAntiScrapeRightsManifest({
        workTitle: "Test", creatorId: "c", episodeId: "e", recipientId: "r", rightsHolder: "h",
        issuedDate: "2026-11-28", watermarkPayloadHex: "abcd", policyUrl: "http://insecure.example/policy",
      }),
    ).toThrow(ForensicWatermarkError);
  });
});

describe("Wave 132 — WebGPU WGSL 생성·구조 검증·손상/GLSL 거부", () => {
  it("buildForensicWatermarkWgsl 산출물이 64B 16바이트 정렬·4바인딩·컴퓨트 검증을 통과한다", () => {
    const artifact = buildForensicWatermarkWgsl();
    expect(artifact.uniformBufferByteLength).toBe(64);
    expect(artifact.uniformBufferByteLength % 16).toBe(0);
    expect(artifact.workgroupSize).toEqual([8, 8, 1]);
    expect(artifact.bindings).toHaveLength(4);
    const validation = validateForensicWatermarkWgsl(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.bindingCount).toBe(4);
  });

  it("괄호 불균형, 바인딩 누락, 비정렬 유니폼, NaN 오염 WGSL을 거부한다", () => {
    const artifact = buildForensicWatermarkWgsl();
    expect(validateForensicWatermarkWgsl(`${artifact.wgsl}\n{`).valid).toBe(false);
    expect(
      validateForensicWatermarkWgsl(artifact.wgsl.replace("@group(0) @binding(3)", "@group(0) @binding(9)")).valid,
    ).toBe(false);
    expect(validateForensicWatermarkWgsl({ ...artifact, uniformBufferByteLength: 48 }).valid).toBe(false);
    expect(
      validateForensicWatermarkWgsl(artifact.wgsl.replace("var row_sum = 0.0;", "var row_sum = NaN;")).valid,
    ).toBe(false);
  });

  it("GLSL 금지 토큰(gl_GlobalInvocationID, texture2D, layout() 등) 혼입을 거부한다", () => {
    const artifact = buildForensicWatermarkWgsl();
    const glslSamples = [
      `${artifact.wgsl}\n// gl_GlobalInvocationID`,
      `${artifact.wgsl}\n// texture2D`,
      `${artifact.wgsl}\n// layout(binding = 0)`,
      `${artifact.wgsl}\n// shared float tile[64];`,
    ];
    for (let i = 0; i < glslSamples.length; i += 1) {
      const check = validateForensicWatermarkWgsl(glslSamples[i]);
      expect(check.valid).toBe(false);
      expect(check.errors.some((e) => e.includes("forbidden GLSL"))).toBe(true);
    }
  });
});

describe("Wave 132 — 순수 OKLCH 포렌식 SVG 시각화 및 한국어 QA 브리프", () => {
  const tile = createSyntheticWebtoonTile(96, 96, "rgba-u8", 321);
  const embed = embedInvisibleDctWatermark(tile, { secretKey: DEFAULT_SECRET_KEY, payload: DEFAULT_PAYLOAD });
  const suite = simulatePiracyAttackAndDetectWatermark(embed, DEFAULT_SECRET_KEY);
  const manifest = compileAntiScrapeRightsManifest({
    workTitle: "옥상 결투 42화",
    creatorId: DEFAULT_PAYLOAD.creatorId,
    episodeId: DEFAULT_PAYLOAD.episodeId,
    recipientId: DEFAULT_PAYLOAD.recipientId,
    rightsHolder: "ToonStudio",
    issuedDate: "2026-11-28",
    watermarkPayloadHex: embed.encodedPayload.payloadHex,
    originalPixels: tile.data,
    watermarkedPixels: embed.watermarkedTile.data,
  });

  const rawHexColorPattern = new RegExp("#[0-9a-f]{3,8}\\b", "i");
  const rawLegacyColorFnPattern = new RegExp("\\b(?:rgb|rgba|hsl|hsla)\\(", "i");

  it("라이트/다크 테마 SVG가 순수 oklch(...)만 사용하고 원시 색상·NaN·Infinity가 0건이다", () => {
    const svgs = [
      renderForensicWatermarkShieldSvg(embed, suite, { theme: "light", manifest }),
      renderForensicWatermarkShieldSvg(embed, suite, { theme: "dark", manifest }),
    ];
    for (const svg of svgs) {
      expect(svg).toContain("<svg ");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("oklch(");
      expect(rawHexColorPattern.test(svg)).toBe(false);
      expect(rawLegacyColorFnPattern.test(svg)).toBe(false);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(svg).toContain("P0A");
      expect(svg).toContain("P3B");
      expect(svg).toContain("JPEG Q=75");
    }
  });

  it("SVG 제목·저작자·대상 필드에 포함된 XML/XSS 특수문자를 안전하게 이스케이프한다", () => {
    const xssEmbed = embedInvisibleDctWatermark(tile, {
      secretKey: DEFAULT_SECRET_KEY,
      payload: { creatorId: "artist<script>alert(1)</script>", episodeId: 'ep-"42"&test', recipientId: "reviewer'&<x>" },
    });
    const xssSuite = simulatePiracyAttackAndDetectWatermark(xssEmbed, DEFAULT_SECRET_KEY);
    const svg = renderForensicWatermarkShieldSvg(xssEmbed, xssSuite, {
      title: `<img src=x onerror="evil()"> & 'quote'`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt; &amp; &apos;quote&apos;");
    expect(escapeSvgXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });

  it("summarizeForensicWatermarkShieldKo가 번역투 없는 자연스러운 한국어 QA 브리프를 생성한다", () => {
    const report = summarizeForensicWatermarkShieldKo(embed, suite, manifest);
    expect(report.verdictKo).toBe("배포 승인");
    expect(report.passedAllGates).toBe(true);
    expect(report.attackResilienceLinesKo).toHaveLength(4);
    expect(report.fullTextKo).toContain("□ 판정 요약: 배포 승인");
    expect(report.fullTextKo).toContain("tdm-reservation=1");
    expect(report.fullTextKo).toContain("c2pa.training-mining=notAllowed");
    expect(report.fullTextKo).toContain(manifest.manifestSha256Hex.slice(0, 16));
    for (const phrase of ["하는 것을 가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우를 보장합니다"]) {
      expect(report.fullTextKo).not.toContain(phrase);
    }
  });

  it("공격 복원이 실패한 스위트에서는 판정을 '재검토 필요' 또는 '차단'으로 정확히 강등한다", () => {
    const degradedSuite = {
      ...suite,
      allAttacksPassed: false,
      attacks: suite.attacks.map((a, idx) => (idx === 0 ? { ...a, passed: false } : a)),
    };
    expect(summarizeForensicWatermarkShieldKo(embed, degradedSuite, manifest).verdictKo).toBe("재검토 필요");
    expect(summarizeForensicWatermarkShieldKo({ ...embed, psnrDb: 34.2 }, degradedSuite, manifest).verdictKo).toBe("차단");
  });
});
