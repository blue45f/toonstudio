import { describe, expect, it } from "vitest";
import {
  CentennialArchiveError,
  DETERMINISTIC_ARITHMETIC_CONTRACT,
  TSVA_HEADER_LENGTH,
  TSVA_MAGIC_ASCII,
  appendC2paAssertion,
  auditCentennialPreservationReadiness,
  buildCentennialChunkMerkleLeaf,
  buildCentennialMerkleTree,
  buildEmbeddedFontSubsetForText,
  canonicalSerializeCentennial,
  crc32Centennial,
  createC2paProvenanceChain,
  createEmbeddedIccColorProfile,
  createSealedCentennialEpisodeArchive,
  decodeCentennialArchive,
  decodeUtf8Centennial,
  encodeCentennialArchive,
  encodeUtf8Centennial,
  generateCentennialMerkleProof,
  hmacSha256CentennialHex,
  renderCentennialArchiveCertificateSvg,
  renderDeterministicReferencePanelRgba,
  sha256CentennialHex,
  summarizeCentennialArchiveKo,
  verifyC2paProvenanceChain,
  verifyCentennialDeterministicReplay,
  verifyCentennialMerkleProof,
  type C2paAiDisclosureData,
  type C2paCreatorIdentity,
  type C2paProvenanceChain,
  type CentennialArchiveChunkInput,
  type CentennialArchiveErrorCode,
  type DeterministicPanelSpec,
  type RightsBomArchivalSnapshot,
  type SealedPanelLayerPayload,
  type WasmRendererPinManifest,
} from "./index";

const TEST_SIGNING_KEY = "toonstudio-centennial-signing-key-2026-vault-seal";
const TEST_CREATOR: C2paCreatorIdentity = {
  creatorId: "creator-han-seoyeon",
  displayNameKo: "한서연",
  studioNameKo: "스튜디오 묵향",
  keyId: "urn:toonstudio:key:han-seoyeon:2026-v1",
};
const TEST_WASM_PIN: WasmRendererPinManifest = {
  engineName: "toonstudio-deterministic-raster-wasm64",
  engineVersion: "2.0.0-centennial",
  arithmeticContract: DETERMINISTIC_ARITHMETIC_CONTRACT,
  wasmBinarySha256: sha256CentennialHex("toonstudio-wasm64-raster-kernel-v2.0.0"),
};

function expectArchiveErrorCode(fn: () => void, expectedCode: CentennialArchiveErrorCode): void {
  try {
    fn();
    expect.unreachable(`예외(${expectedCode})가 발생해야 합니다.`);
  } catch (err) {
    expect(err).toBeInstanceOf(CentennialArchiveError);
    expect((err as CentennialArchiveError).code).toBe(expectedCode);
  }
}

function buildStandardEpisodeFixture(episodeId = "ep-042-midnight-lantern") {
  const panels: DeterministicPanelSpec[] = [
    {
      panelId: "cut-01",
      width: 48,
      height: 32,
      backgroundRgba: [248, 245, 238, 255],
      rectFills: [{ x: 4, y: 4, width: 40, height: 12, rgba: [232, 226, 214, 255] }],
      inkStrokes: [
        { x0: 4, y0: 4, x1: 43, y1: 4, thicknessPx: 1, rgba: [24, 30, 38, 255] },
        { x0: 6, y0: 26, x1: 42, y1: 18, thicknessPx: 2, rgba: [32, 48, 42, 220] },
      ],
      dialogueRuns: [
        { fontId: "font-atelier-gothic", text: "밤안개 너머, 2126!", x: 2, y: 6, scale: 1, rgba: [18, 22, 26, 255] },
      ],
    },
    {
      panelId: "cut-02",
      width: 48,
      height: 32,
      backgroundRgba: [240, 238, 232, 255],
      rectFills: [{ x: 8, y: 6, width: 32, height: 20, rgba: [215, 224, 218, 200] }],
      inkStrokes: [{ x0: 8, y0: 6, x1: 39, y1: 25, thicknessPx: 1, rgba: [20, 25, 30, 255] }],
      dialogueRuns: [
        { fontId: "font-atelier-gothic", text: "약속은 남는다.", x: 4, y: 12, scale: 1, rgba: [20, 24, 28, 255] },
      ],
    },
  ];
  const allTexts = panels.flatMap((p) => p.dialogueRuns.map((r) => r.text));
  const embeddedFont = buildEmbeddedFontSubsetForText("font-atelier-gothic", "Atelier Gothic Centennial", allTexts);
  const iccProfile = createEmbeddedIccColorProfile({
    profileId: "icc-srgb-2026-centennial",
    colorSpace: "sRGB-IEC61966-2.1",
    channelGainQ8: [256, 256, 256],
  });
  const rightsBom: RightsBomArchivalSnapshot = {
    snapshotId: `bom-${episodeId}`,
    episodeId,
    assets: [
      { assetId: "font-atelier-gothic", assetKind: "font", licenseId: "OFL-1.1-EMBED-PERPETUAL", archivalPreservationAllowed: true, commercialDistributionStatus: "cleared", expirationYear: null },
      { assetId: "brush-gpen-ink", assetKind: "brush", licenseId: "STUDIO-OWNED-PERPETUAL", archivalPreservationAllowed: true, commercialDistributionStatus: "cleared", expirationYear: null },
    ],
  };

  let chain = createC2paProvenanceChain(episodeId, TEST_CREATOR, TEST_SIGNING_KEY);
  chain = appendC2paAssertion(chain, {
    label: "c2pa.created",
    timestampIso: "2026-11-28T05:00:00Z",
    softwareAgent: "ToonStudio/2.0-wasm64",
    summaryKo: "스튜디오 묵향 원고 컷 선화·채색 원본 생성",
    data: { origin: "human-drawn-stylus", canvasDpi: 350, cutCount: panels.length },
  }, TEST_SIGNING_KEY);
  chain = appendC2paAssertion(chain, {
    label: "c2pa.edited",
    timestampIso: "2026-11-28T06:15:00Z",
    softwareAgent: "ToonStudio/2.0-wasm64",
    summaryKo: "말풍선 조판 및 sRGB ICC 프로파일 고정",
    data: { editedLayers: ["ink", "lettering"], iccProfileId: iccProfile.profileId },
  }, TEST_SIGNING_KEY);
  chain = appendC2paAssertion(chain, {
    label: "toonstudio.rights-bom.v1",
    timestampIso: "2026-11-28T06:30:00Z",
    softwareAgent: "ToonStudio/2.0-preflight",
    summaryKo: "Rights BOM 영구 보존 라이선스 2건 확인 완료",
    data: { snapshotId: rightsBom.snapshotId, assetCount: rightsBom.assets.length },
  }, TEST_SIGNING_KEY);
  const aiDisclosure: C2paAiDisclosureData = {
    humanDrawnRatioPercent: 100,
    assistiveToolsUsed: ["deterministic-perspective-ruler"],
    generativeFillUsed: false,
    disclosureStatementKo: "전 컷 수작업 작화, 생성형 이미지 미사용(투시 보조자만 활용).",
  };
  chain = appendC2paAssertion(chain, {
    label: "toonstudio.ai-disclosure.v1",
    timestampIso: "2026-11-28T06:40:00Z",
    softwareAgent: "ToonStudio/2.0-provenance",
    summaryKo: "수작업 작화 100% 및 보조 도구 사용 내역 정직 고지",
    data: { ...aiDisclosure },
  }, TEST_SIGNING_KEY);

  return { panels, embeddedFont, iccProfile, rightsBom, chain };
}

function sealFixture(fixture: ReturnType<typeof buildStandardEpisodeFixture>) {
  return createSealedCentennialEpisodeArchive({
    panels: fixture.panels,
    embeddedFonts: [fixture.embeddedFont],
    iccProfile: fixture.iccProfile,
    wasmRendererPin: TEST_WASM_PIN,
    rightsBom: fixture.rightsBom,
    c2paChain: fixture.chain,
  });
}

describe("Wave 98: 순수 ES2017 암호 기본 연산 (NIST SHA-256 · RFC 4231 HMAC · CRC-32 · 정규 JSON)", () => {
  it("1. NIST FIPS 180-4 SHA-256 공식 테스트 벡터(빈 문자열, abc, 2블록)와 일치한다", () => {
    expect(sha256CentennialHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256CentennialHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256CentennialHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("2. NIST FIPS 180-4 SHA-256 1,000,000바이트 'a' 반복 벡터와 일치한다", () => {
    const millionA = new Uint8Array(1_000_000);
    millionA.fill(0x61);
    expect(sha256CentennialHex(millionA)).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });

  it("3. RFC 4231 HMAC-SHA256 공식 테스트 케이스 1·2·3과 일치한다", () => {
    expect(hmacSha256CentennialHex(new Uint8Array(20).fill(0x0b), "Hi There")).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
    expect(hmacSha256CentennialHex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
    expect(hmacSha256CentennialHex(new Uint8Array(20).fill(0xaa), new Uint8Array(50).fill(0xdd))).toBe(
      "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
    );
  });

  it("4. RFC 4231 테스트 케이스 6(블록 크기 64바이트 초과 키)을 정확히 처리한다", () => {
    expect(
      hmacSha256CentennialHex(new Uint8Array(131).fill(0xaa), "Test Using Larger Than Block-Size Key - Hash Key First"),
    ).toBe("60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
  });

  it("5. IEEE 802.3 CRC-32 표준 체크 벡터('123456789' -> 0xcbf43926)와 일치한다", () => {
    expect(crc32Centennial("123456789")).toBe(0xcbf43926);
    expect(crc32Centennial("")).toBe(0x00000000);
  });

  it("6. 정규 JSON 직렬화는 키 순서에 무관하게 동일 문자열을 생성하고 NaN/Infinity를 거부한다", () => {
    const a = canonicalSerializeCentennial({ z: 1, a: { d: -0, b: "한글" }, u: undefined });
    const b = canonicalSerializeCentennial({ a: { b: "한글", d: 0 }, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"b":"한글","d":0},"z":1}');
    expectArchiveErrorCode(() => canonicalSerializeCentennial({ bad: Number.NaN }), "NON_FINITE_NUMBER");
    expectArchiveErrorCode(() => canonicalSerializeCentennial({ bad: Number.POSITIVE_INFINITY }), "NON_FINITE_NUMBER");
  });

  it("7. 순수 UTF-8 코덱은 한글·이모지 서로게이트 쌍을 무손실 왕복한다", () => {
    const sample = "웹툰 100년 보존 · 2026↔2126 🖋️";
    expect(decodeUtf8Centennial(encodeUtf8Centennial(sample))).toBe(sample);
  });
});

describe("Wave 98: 이진 Merkle 트리 포함 증명", () => {
  it("8. 짝수(4개)·홀수(5개, 7개)·단일(1개) 리프 트리에서 모든 리프의 포함 증명이 통과한다", () => {
    for (const count of [1, 4, 5, 7]) {
      const leaves = Array.from({ length: count }, (_, idx) => encodeUtf8Centennial(`chunk-leaf-${idx}`));
      const tree = buildCentennialMerkleTree(leaves);
      expect(tree.leafCount).toBe(count);
      expect(tree.rootHex).toHaveLength(64);
      for (let i = 0; i < count; i += 1) {
        expect(verifyCentennialMerkleProof(leaves[i], generateCentennialMerkleProof(tree, i), tree.rootHex)).toBe(true);
      }
    }
  });

  it("9. Merkle 포함 증명의 형제 해시를 1바이트만 변조해도 즉시 검증 실패한다", () => {
    const leaves = ["a", "b", "c", "d", "e"].map((s) => encodeUtf8Centennial(s));
    const tree = buildCentennialMerkleTree(leaves);
    const proof = generateCentennialMerkleProof(tree, 2);
    const first = proof.steps[0];
    const flipped = (first.siblingHashHex[0] === "0" ? "1" : "0") + first.siblingHashHex.slice(1);
    expect(
      verifyCentennialMerkleProof(leaves[2], { ...proof, steps: [{ ...first, siblingHashHex: flipped }, ...proof.steps.slice(1)] }, tree.rootHex),
    ).toBe(false);
  });

  it("10. Merkle 리프 원본 데이터의 1바이트를 변조하면 포함 증명이 즉시 실패한다", () => {
    const leaves = ["alpha", "beta", "gamma", "delta"].map((s) => encodeUtf8Centennial(s));
    const tree = buildCentennialMerkleTree(leaves);
    const proof = generateCentennialMerkleProof(tree, 1);
    const mutated = leaves[1].slice();
    mutated[0] ^= 0x01;
    expect(verifyCentennialMerkleProof(mutated, proof, tree.rootHex)).toBe(false);
  });
});

describe("Wave 98: TSVA v1 바이너리 컨테이너 결정론 및 fail-closed 변조 차단", () => {
  function buildMinimalChunks(): CentennialArchiveChunkInput[] {
    const fixture = buildStandardEpisodeFixture();
    return [
      { kind: "embedded-font-subset", chunkId: "font/main", mediaType: "application/vnd.toonstudio.bitmap-font+json", encoding: "canonical-json-utf8", payload: encodeUtf8Centennial(canonicalSerializeCentennial(fixture.embeddedFont)) },
      { kind: "icc-color-profile", chunkId: "icc/srgb", mediaType: "application/vnd.toonstudio.icc-q8+json", encoding: "canonical-json-utf8", payload: encodeUtf8Centennial(canonicalSerializeCentennial(fixture.iccProfile)) },
      { kind: "wasm-renderer-pin", chunkId: "renderer/pin", mediaType: "application/vnd.toonstudio.wasm-pin+json", encoding: "canonical-json-utf8", payload: encodeUtf8Centennial(canonicalSerializeCentennial(TEST_WASM_PIN)) },
    ];
  }

  it("11. TSVA v1 인코딩은 청크 입력 순서가 바뀌어도 비트 단위 동일한 바이트를 생성한다", () => {
    const chunks = buildMinimalChunks();
    const forward = encodeCentennialArchive(chunks);
    const reversed = encodeCentennialArchive(chunks.slice().reverse());
    expect(sha256CentennialHex(forward)).toBe(sha256CentennialHex(reversed));
    const decoded = decodeCentennialArchive(forward);
    expect(decoded.magic).toBe(TSVA_MAGIC_ASCII);
    expect(decoded.headerLength).toBe(TSVA_HEADER_LENGTH);
    expect(decoded.chunkCount).toBe(3);
  });

  it("12. 헤더·Merkle 루트·CRC·TOC·페이로드 전반 10개 오프셋의 1바이트 비트 반전을 전수 거부한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture());
    const offsets = [0, 5, 10, 20, 58, 62, 70, 120, Math.floor(archiveBytes.length * 0.5), archiveBytes.length - 1];
    expect(offsets).toHaveLength(10);
    for (const off of offsets) {
      const corrupted = archiveBytes.slice();
      corrupted[off] ^= 0x01;
      expect(() => decodeCentennialArchive(corrupted)).toThrow(CentennialArchiveError);
    }
  });

  it("13. 절단된 아카이브(헤더 미달, 1바이트 절단, 16바이트 절단)는 TRUNCATED_ARCHIVE로 거부한다", () => {
    const archive = encodeCentennialArchive(buildMinimalChunks());
    expectArchiveErrorCode(() => decodeCentennialArchive(archive.subarray(0, 32)), "TRUNCATED_ARCHIVE");
    expectArchiveErrorCode(() => decodeCentennialArchive(archive.subarray(0, archive.length - 1)), "TRUNCATED_ARCHIVE");
    expectArchiveErrorCode(() => decodeCentennialArchive(archive.subarray(0, archive.length - 16)), "TRUNCATED_ARCHIVE");
  });

  it("14. 아카이브 뒤에 1바이트라도 추가되면 TRAILING_BYTES로 즉시 거부한다", () => {
    const archive = encodeCentennialArchive(buildMinimalChunks());
    const withTrail = new Uint8Array(archive.length + 1);
    withTrail.set(archive, 0);
    expectArchiveErrorCode(() => decodeCentennialArchive(withTrail), "TRAILING_BYTES");
  });

  it("15. 중복된 청크 식별자는 DUPLICATE_CHUNK_ID로 거부한다", () => {
    const chunks = buildMinimalChunks();
    chunks.push(chunks[0]);
    expectArchiveErrorCode(() => encodeCentennialArchive(chunks), "DUPLICATE_CHUNK_ID");
  });

  it("16. 필수 보존 청크(embedded-font-subset, icc-color-profile, wasm-renderer-pin) 누락 시 거부한다", () => {
    const base = buildMinimalChunks();
    for (const dropKind of ["embedded-font-subset", "icc-color-profile", "wasm-renderer-pin"] as const) {
      expectArchiveErrorCode(() => encodeCentennialArchive(base.filter((c) => c.kind !== dropKind)), "MISSING_MANDATORY_ASSET");
    }
  });

  it("17. 외부 HTTPS URL이 페이로드에 포함된 청크는 인코딩 단계에서 즉시 차단한다", () => {
    const chunks = buildMinimalChunks();
    chunks.push({
      kind: "rights-bom-snapshot",
      chunkId: "rights/external-leak",
      mediaType: "application/json",
      encoding: "canonical-json-utf8",
      payload: encodeUtf8Centennial('{"fontSource":"https://cdn.example.invalid/font.woff2"}'),
    });
    expectArchiveErrorCode(() => encodeCentennialArchive(chunks), "EXTERNAL_URL_FORBIDDEN");
  });

  it("18. HTTP 평문 URL이 청크 ID 메타데이터에 들어가도 EXTERNAL_URL_FORBIDDEN으로 차단한다", () => {
    const chunks = buildMinimalChunks();
    chunks.push({
      kind: "rights-bom-snapshot",
      chunkId: "http://legacy-host.invalid/bom",
      mediaType: "application/json",
      encoding: "canonical-json-utf8",
      payload: encodeUtf8Centennial('{"ok":true}'),
    });
    expectArchiveErrorCode(() => encodeCentennialArchive(chunks), "EXTERNAL_URL_FORBIDDEN");
  });
});

describe("Wave 98: C2PA 서명 출처 체인 검증 및 변조 탐지", () => {
  it("19. 4단계 C2PA 서명 체인(created → edited → rights-bom → ai-disclosure)을 무결하게 검증한다", () => {
    const { chain } = buildStandardEpisodeFixture();
    const result = verifyC2paProvenanceChain(chain, TEST_SIGNING_KEY);
    expect(result.valid).toBe(true);
    expect(result.verifiedClaimCount).toBe(4);
    expect(result.failureIndex).toBeNull();
  });

  it("20. C2PA 클레임 본문 1글자만 수정해도 PAYLOAD_HASH_MISMATCH로 즉시 거부한다", () => {
    const { chain } = buildStandardEpisodeFixture();
    const tampered: C2paProvenanceChain = {
      ...chain,
      entries: chain.entries.map((entry, idx) => (idx === 1 ? { ...entry, summaryKo: `${entry.summaryKo}!` } : entry)),
    };
    const result = verifyC2paProvenanceChain(tampered, TEST_SIGNING_KEY);
    expect(result.valid).toBe(false);
    expect(result.failureIndex).toBe(1);
    expect(result.failureReasonCode).toBe("PAYLOAD_HASH_MISMATCH");
  });

  it("21. 중간 클레임을 삭제하면 인덱스·이전 해시 체인이 끊어져 검증 실패한다", () => {
    const { chain } = buildStandardEpisodeFixture();
    const result = verifyC2paProvenanceChain(
      { ...chain, entries: [chain.entries[0], chain.entries[2], chain.entries[3]] },
      TEST_SIGNING_KEY,
    );
    expect(result.valid).toBe(false);
    expect(result.failureReasonCode).toBe("INDEX_SEQUENCE_BROKEN");
  });

  it("22. 두 클레임의 순서를 맞바꾸면 즉시 검증 실패한다", () => {
    const { chain } = buildStandardEpisodeFixture();
    const result = verifyC2paProvenanceChain(
      { ...chain, entries: [chain.entries[0], chain.entries[2], chain.entries[1], chain.entries[3]] },
      TEST_SIGNING_KEY,
    );
    expect(result.valid).toBe(false);
    expect(result.failureIndex).toBe(1);
  });

  it("23. 잘못된 서명 키로 검증하면 fail-closed 거부한다", () => {
    const { chain } = buildStandardEpisodeFixture();
    const result = verifyC2paProvenanceChain(chain, "wrong-signing-key-2126");
    expect(result.valid).toBe(false);
    expect(result.failureReasonCode).toBe("INVALID_GENESIS_ANCHOR");
  });

  it("24. C2PA 클레임 데이터에 외부 URL을 추가하려 하면 EXTERNAL_URL_FORBIDDEN 예외를 던진다", () => {
    const chain = createC2paProvenanceChain("ep-url-check", TEST_CREATOR, TEST_SIGNING_KEY);
    expectArchiveErrorCode(
      () =>
        appendC2paAssertion(
          chain,
          { label: "c2pa.created", timestampIso: "2026-11-28T05:00:00Z", softwareAgent: "ToonStudio/2.0", summaryKo: "외부 링크", data: { ref: "https://external.example.invalid/a.png" } },
          TEST_SIGNING_KEY,
        ),
      "EXTERNAL_URL_FORBIDDEN",
    );
  });
});

describe("Wave 98: 2026↔2076↔2126 결정론적 픽셀 재생 오라클 및 100년 보존 준비도 감사", () => {
  it("25. 순수 정수 패널 렌더러는 반복 실행 시 비트 동일 RGBA·해시를 내며 ICC 게인 차이를 반영한다", () => {
    const { panels, embeddedFont, iccProfile } = buildStandardEpisodeFixture();
    const warmIcc = createEmbeddedIccColorProfile({ profileId: "icc-warm-p3", colorSpace: "Display-P3-D65", channelGainQ8: [256, 248, 232] });
    const run1 = renderDeterministicReferencePanelRgba(panels[0], [embeddedFont], iccProfile);
    const run2 = renderDeterministicReferencePanelRgba(panels[0], [embeddedFont], iccProfile);
    const runWarm = renderDeterministicReferencePanelRgba(panels[0], [embeddedFont], warmIcc);
    expect(run1.missingGlyphs).toEqual([]);
    expect(run1.frameSha256).toBe(run2.frameSha256);
    expect(run1.frameSha256).not.toBe(runWarm.frameSha256);
  });

  it("26. 2026 ↔ 2076 ↔ 2126 재생 오라클은 pixelDiffCount === 0과 동일 frameSha256을 입증한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture());
    const replay = verifyCentennialDeterministicReplay(decodeCentennialArchive(archiveBytes), [2026, 2076, 2126]);
    expect(replay.allPanelsBitIdentical).toBe(true);
    expect(replay.totalPixelDiffCount).toBe(0);
    expect(replay.hostReports).toHaveLength(3);
    const [r2026, r2076, r2126] = replay.hostReports.map((h) => h.panels.map((p) => p.replayedFrameSha256));
    expect(r2026).toEqual(r2076);
    expect(r2026).toEqual(r2126);
  });

  it("27. 봉인된 패널 픽셀을 단 1픽셀만 변조하면 재생 오라클이 픽셀 오차 1px 및 해시 불일치를 검출한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture());
    const decoded = decodeCentennialArchive(archiveBytes);
    const mutatedChunks: CentennialArchiveChunkInput[] = decoded.chunks
      .filter((c) => c.kind !== "parity-ecc-block")
      .map((c) => {
        if (c.chunkId !== "panel/cut-01") {
          return { kind: c.kind, chunkId: c.chunkId, mediaType: c.mediaType, encoding: c.encoding, payload: c.payload };
        }
        const parsed = JSON.parse(decodeUtf8Centennial(c.payload)) as SealedPanelLayerPayload;
        const flippedHex = (parseInt(parsed.sealedRgbaHex.slice(0, 2), 16) ^ 0x01).toString(16).padStart(2, "0");
        const mutated: SealedPanelLayerPayload = { ...parsed, sealedRgbaHex: flippedHex + parsed.sealedRgbaHex.slice(2) };
        return { kind: c.kind, chunkId: c.chunkId, mediaType: c.mediaType, encoding: c.encoding, payload: encodeUtf8Centennial(canonicalSerializeCentennial(mutated)) };
      });
    const reDecoded = decodeCentennialArchive(encodeCentennialArchive(mutatedChunks));
    const replay = verifyCentennialDeterministicReplay(reDecoded, [2026, 2076, 2126]);
    expect(replay.allPanelsBitIdentical).toBe(false);
    expect(replay.totalPixelDiffCount).toBe(1);
    expect(replay.mismatchedPanelIds).toEqual(["cut-01"]);

    const audit = auditCentennialPreservationReadiness(reDecoded, TEST_SIGNING_KEY);
    expect(audit.readyForCentennialSeal).toBe(false);
    expect(audit.badges.bitExact2126).toBe(false);
  });

  it("28. 내장 폰트 서브셋에서 대사 문자 1글자가 빠지면 보존 감사기가 fail-closed 차단한다", () => {
    const fixture = buildStandardEpisodeFixture();
    const incompleteFont = buildEmbeddedFontSubsetForText("font-atelier-gothic", "Incomplete", ["안개 너머, 2126! 약속은 남는다."]);
    const { archiveBytes } = createSealedCentennialEpisodeArchive({
      panels: fixture.panels,
      embeddedFonts: [incompleteFont],
      iccProfile: fixture.iccProfile,
      wasmRendererPin: TEST_WASM_PIN,
      rightsBom: fixture.rightsBom,
      c2paChain: fixture.chain,
    });
    const report = auditCentennialPreservationReadiness(decodeCentennialArchive(archiveBytes), TEST_SIGNING_KEY);
    expect(report.readyForCentennialSeal).toBe(false);
    expect(report.badges.glyphComplete).toBe(false);
    expect(report.glyphAudit.missingGlyphs).toContain("밤");
    expect(report.blockers.some((b) => b.code === "MISSING_DIALOGUE_GLYPHS")).toBe(true);
  });

  it("29. Rights BOM에서 영구 보존이 차단된 에셋이 있으면 봉인을 차단한다", () => {
    const fixture = buildStandardEpisodeFixture();
    const blockedBom: RightsBomArchivalSnapshot = {
      ...fixture.rightsBom,
      assets: [
        ...fixture.rightsBom.assets,
        { assetId: "bg-3d-rental-pack", assetKind: "background-3d", licenseId: "RENTAL-2030", archivalPreservationAllowed: false, commercialDistributionStatus: "restricted", expirationYear: 2030 },
      ],
    };
    const { archiveBytes } = createSealedCentennialEpisodeArchive({
      panels: fixture.panels,
      embeddedFonts: [fixture.embeddedFont],
      iccProfile: fixture.iccProfile,
      wasmRendererPin: TEST_WASM_PIN,
      rightsBom: blockedBom,
      c2paChain: fixture.chain,
    });
    const report = auditCentennialPreservationReadiness(decodeCentennialArchive(archiveBytes), TEST_SIGNING_KEY);
    expect(report.readyForCentennialSeal).toBe(false);
    expect(report.rightsBomAudit.blockedAssetIds).toEqual(["bg-3d-rental-pack"]);
  });

  it("30. 완전 봉인 아카이브는 4대 보존 배지·Merkle 전수 증명·XOR 패리티 ECC를 모두 통과한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture());
    const decoded = decodeCentennialArchive(archiveBytes);
    for (let i = 0; i < decoded.chunks.length; i += 1) {
      expect(
        verifyCentennialMerkleProof(buildCentennialChunkMerkleLeaf(decoded.chunks[i]), generateCentennialMerkleProof(decoded.merkleTree, i), decoded.merkleRootHex),
      ).toBe(true);
    }
    const report = auditCentennialPreservationReadiness(decoded, TEST_SIGNING_KEY, {
      simulatedHostYears: [2026, 2076, 2126],
      expectedRendererSha256: TEST_WASM_PIN.wasmBinarySha256,
    });
    expect(report.readyForCentennialSeal).toBe(true);
    expect(report.parityEccVerified).toBe(true);
    expect(report.badges).toEqual({ selfContained: true, glyphComplete: true, zeroCloudDeps: true, bitExact2126: true });
    expect(report.blockers).toEqual([]);
  });
});

describe("Wave 98: 인쇄 안전 OKLCH 봉인 인증서 SVG 및 한국어 감사 보고서", () => {
  it("31. 인증서 SVG는 OKLCH 전용 팔레트, 4대 배지, C2PA 타임라인, NaN 0건, XML 이스케이프를 보장한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture('ep-099-<dawn>&"seal"'));
    const report = auditCentennialPreservationReadiness(decodeCentennialArchive(archiveBytes), TEST_SIGNING_KEY);
    const cert = renderCentennialArchiveCertificateSvg(report);
    expect(cert.containsNaN).toBe(false);
    expect(cert.badgeCount).toBe(4);
    expect(cert.timelineNodeCount).toBe(4);
    expect(cert.svg).toContain("SELF-CONTAINED");
    expect(cert.svg).toContain("GLYPH-COMPLETE");
    expect(cert.svg).toContain("ZERO-CLOUD-DEPS");
    expect(cert.svg).toContain("BIT-EXACT-2126");
    expect(cert.svg).toContain("ep-099-&lt;dawn&gt;&amp;&quot;seal&quot;");
    expect(cert.svg).not.toContain("<dawn>");
    expect(cert.svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cert.svg).not.toMatch(/\brgba?\(/);
  });

  it("32. 한국어 보존 보고서는 통과 상태와 차단 상태 모두 자연스러운 한국어와 정확한 수치를 출력한다", () => {
    const { archiveBytes } = sealFixture(buildStandardEpisodeFixture());
    const decoded = decodeCentennialArchive(archiveBytes);
    const passText = summarizeCentennialArchiveKo(auditCentennialPreservationReadiness(decoded, TEST_SIGNING_KEY));
    expect(passText).toContain("통과 (2026↔2126 비트 일치 봉인 완료)");
    expect(passText).toContain("대사 글리프 내장률: 100%");
    expect(passText).toContain("외부 네트워크 의존: 0건");
    expect(passText).toContain("픽셀 오차 0px");
    expect(passText).not.toContain("가능하게 합니다");
    expect(passText).not.toContain("제공합니다");

    const failText = summarizeCentennialArchiveKo(auditCentennialPreservationReadiness(decoded, "wrong-key-audit"));
    expect(failText).toContain("보류 (차단 사유");
    expect(failText).toContain("C2PA_INVALID_GENESIS_ANCHOR");
  });
});
