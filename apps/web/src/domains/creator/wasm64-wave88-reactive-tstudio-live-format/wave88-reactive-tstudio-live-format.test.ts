import { describe, expect, it } from "vitest";
import {
  MAX_REDUCED_MOTION_SHIMMER_INTENSITY,
  TARGET_60FPS_FRAME_BUDGET_MS,
  TSTUDIO_LIVE_FILE_EXTENSION,
  TSTUDIO_LIVE_FORMAT_VERSION,
  TSTUDIO_LIVE_HEADER_BYTE_LENGTH,
  TSTUDIO_LIVE_MAGIC,
  TSTUDIO_LIVE_MIME_TYPE,
  TstudioLiveCodecError,
  auditReactiveWebtoonPerformanceBudget,
  buildReactiveWebtoonPlayerManifest,
  compareTstudioLiveVsStaticJpegBudget,
  computeCrc32,
  computeOverscanSafeParallaxOffset,
  computeSha256Hex,
  decodeTstudioLivePackage,
  dequantizeDepthU16ToMeters,
  encodeTstudioLivePackage,
  evaluateReactiveWebtoonFrame,
  quantizeDepthMetersToU16,
  utf8Encode,
  type DecodedTstudioLivePackage,
  type ReactiveEmitterSpec,
  type ReactiveReaderState,
  type TstudioLiveEpisodeInput,
  type TstudioLiveLayerInput,
  type TstudioLivePanelFallbackInput,
  type TstudioLivePanelInput,
} from "./index";

function createAsset(seed: number, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < byteLength; i += 1) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

function makeEmitter(id: string, kind: ReactiveEmitterSpec["kind"], overrides: Partial<ReactiveEmitterSpec>): ReactiveEmitterSpec {
  return {
    id,
    kind,
    particleCount: 36,
    baseSpeedPxPerSec: 90,
    gravityPxPerSec2: 0,
    windDriftPxPerSec: 0,
    tiltCoupling: 0.6,
    scrollVelocityCoupling: 0.8,
    turbulence: 0.4,
    reducedMotionStaticCount: 6,
    depthMeters: 1.5,
    region: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    ...overrides,
  };
}

function makeLayer(
  id: string,
  name: string,
  role: TstudioLiveLayerInput["role"],
  payloadBytes: Uint8Array,
  depthMeters: number,
  extra?: Partial<TstudioLiveLayerInput>,
): TstudioLiveLayerInput {
  return {
    id,
    name,
    role,
    encoding: "webp",
    widthPx: 800,
    heightPx: 760,
    payloadBytes,
    depthMeters,
    fullBleed: role === "backdrop" || role === "midground" || role === "foreground-fx",
    overscanMarginPx: 18,
    ...extra,
  };
}

function buildSampleEpisode(panelCount = 6): TstudioLiveEpisodeInput {
  const sharedSky = createAsset(101, 24_576);
  const sharedCastle = createAsset(202, 20_480);
  const sharedHeroBlade = createAsset(303, 18_432);
  const sharedBalloon = createAsset(404, 2_048);
  const posterBytes = createAsset(505, 8_192);
  const bladeMetallicMask = new Uint8Array([0, 64, 192, 255, 255, 220, 80, 0, 16]);
  const bladeRoughnessMask = new Uint8Array([220, 140, 48, 24, 20, 36, 130, 210, 200]);

  const panelHeight = 760;
  const panels: TstudioLivePanelInput[] = [];
  const panelFallbacks: TstudioLivePanelFallbackInput[] = [];

  for (let i = 0; i < panelCount; i += 1) {
    const pid = `panel-${i + 1}`;
    const emitters: ReactiveEmitterSpec[] =
      i === 0
        ? [
            makeEmitter(`rain-${i + 1}`, "rain", { particleCount: 48, baseSpeedPxPerSec: 680, gravityPxPerSec2: 240, tiltCoupling: 1.0, scrollVelocityCoupling: 0.4, turbulence: 0.35, reducedMotionStaticCount: 8 }),
            makeEmitter(`embers-${i + 1}`, "embers", { baseSpeedPxPerSec: 95, windDriftPxPerSec: 12, scrollVelocityCoupling: 0.9, turbulence: 0.55 }),
          ]
        : i === 1
          ? [
              makeEmitter(`petals-${i + 1}`, "petals", { particleCount: 32, baseSpeedPxPerSec: 70, windDriftPxPerSec: 18, scrollVelocityCoupling: 0.85 }),
              makeEmitter(`ripples-${i + 1}`, "ripples", { particleCount: 16, baseSpeedPxPerSec: 50, scrollVelocityCoupling: 0.4, reducedMotionStaticCount: 3 }),
            ]
          : [makeEmitter(`smoke-${i + 1}`, "smoke", { particleCount: 20, baseSpeedPxPerSec: 45, windDriftPxPerSec: 8 })];

    panels.push({
      id: pid,
      yPx: i * panelHeight,
      heightPx: panelHeight,
      altText: `폭풍우 속 성채 ${i + 1}번째 컷 장면`,
      captionText: `제${i + 1}컷 대사`,
      layers: [
        makeLayer(`${pid}-backdrop`, "먹구름 밤하늘", "backdrop", sharedSky, 14.0, { overscanMarginPx: 24, material: { metallic: 0, roughness: 0.92, specularStrength: 0.08 } }),
        makeLayer(`${pid}-midground`, "빗속 성벽 실루엣", "midground", sharedCastle, 5.5, { material: { metallic: 0.1, roughness: 0.78, specularStrength: 0.18 } }),
        makeLayer(`${pid}-character-blade`, "강철 검과 주인공", "character", sharedHeroBlade, 2.5, {
          widthPx: 640,
          heightPx: 720,
          overscanMarginPx: 12,
          material: { metallic: 0.95, roughness: 0.12, specularStrength: 0.92, specularTintLinearRgb: [0.92, 0.96, 1.0], maskGridWidth: 3, maskGridHeight: 3, metallicMaskBytes: bladeMetallicMask, roughnessMaskBytes: bladeRoughnessMask },
        }),
        makeLayer(`${pid}-foreground-fx`, "근경 빗물 번짐", "foreground-fx", createAsset(700 + i, 3_072), 1.2, { overscanMarginPx: 14, material: { metallic: 0.2, roughness: 0.35, specularStrength: 0.4 } }),
        makeLayer(`${pid}-balloon`, "대사 말풍선", "speech-balloon", sharedBalloon, 1.9, { encoding: "png", widthPx: 320, heightPx: 140, overscanMarginPx: 0, lockToViewportFrame: true }),
      ],
      emitters,
    });

    panelFallbacks.push({ panelId: pid, readingOrder: i, altText: `정적 폴백: 폭풍우 성채 ${i + 1}컷`, captionText: `제${i + 1}컷`, compositeEncoding: "webp", widthPx: 800, heightPx: 760, compositeBytes: sharedSky });
  }

  return {
    episode: {
      episodeId: "ep-01-storm-citadel",
      seriesId: "series-iron-rain",
      title: "강철비의 성채 — 1화 <살아있는 지면>",
      author: "윤서진",
      locale: "ko-KR",
      canvasWidthPx: 800,
      totalHeightPx: panelCount * panelHeight,
      targetFps: 60,
      createdAtIso: "2026-11-28T03:52:20Z",
    },
    panels,
    audioTracks: [
      { trackId: "bgm-storm-intro", title: "빗소리와 낮은 현악", loop: true, baseGain: 0.85, startYPx: 0, endYPx: 2400, crossfadeMarginPx: 420, spatialPanBias: -0.1, resourceUri: "/audio/ep-01/storm-intro.opus" },
      { trackId: "bgm-blade-clash", title: "검극 타악 테마", loop: true, baseGain: 0.9, startYPx: 1800, endYPx: panelCount * panelHeight, crossfadeMarginPx: 420, spatialPanBias: 0.1, resourceUri: "/audio/ep-01/blade-clash.opus" },
    ],
    staticFallback: { renderMode: "vertical-strip-jpeg-compat", posterAltText: "강철비의 성채 1화 대표 포스터", posterEncoding: "webp", posterWidthPx: 800, posterHeightPx: 1200, posterBytes, panelFallbacks },
  };
}

function readerState(overrides?: Partial<ReactiveReaderState>): ReactiveReaderState {
  return {
    scrollY: 0,
    scrollVelocityPxPerSec: 0,
    gyroBetaDeg: 0,
    gyroGammaDeg: 0,
    elapsedTimeMs: 500,
    viewportWidthPx: 390,
    viewportHeightPx: 844,
    prefersReducedMotion: false,
    batterySaverMode: false,
    ...overrides,
  };
}

function decodeFixture(): { readonly input: TstudioLiveEpisodeInput; readonly bytes: Uint8Array; readonly decoded: DecodedTstudioLivePackage } {
  const input = buildSampleEpisode(6);
  const encoded = encodeTstudioLivePackage(input);
  return { input, bytes: encoded.bytes, decoded: decodeTstudioLivePackage(encoded.bytes) };
}

describe("Wave 88: .tstudio-live 바이너리 컨테이너 코덱 및 무결성", () => {
  it("표준 테스트 벡터로 순수 동기 SHA-256과 IEEE CRC-32를 정확히 계산한다", () => {
    expect(computeSha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(computeCrc32(utf8Encode("123456789"))).toBe(0xcbf43926);
  });

  it("TSLV v1 컨테이너를 비트 단위 정확하게 인코딩·복호화하고 재인코딩 결정성을 보존한다", () => {
    const { input, bytes, decoded } = decodeFixture();
    expect(encodeTstudioLivePackage(input).bytes).toEqual(bytes);
    expect(decoded.header.magic).toBe(TSTUDIO_LIVE_MAGIC);
    expect(decoded.header.version).toBe(TSTUDIO_LIVE_FORMAT_VERSION);
    expect(decoded.header.headerLength).toBe(TSTUDIO_LIVE_HEADER_BYTE_LENGTH);
    expect(decoded.header.totalLength).toBe(bytes.byteLength);
    expect(decoded.integrity.verified).toBe(true);
    expect(decoded.panels).toHaveLength(6);
    const assetIdx = decoded.panels[0]?.layers[0]?.assetIndex ?? -1;
    expect(decoded.assets[assetIdx]?.payloadBytes).toEqual(input.panels[0]?.layers[0]?.payloadBytes);
  });

  it("양자화 깊이 평면(depthQ16)과 금속성·거칠기 8비트 마스크를 정확히 왕복 복원한다", () => {
    expect(dequantizeDepthU16ToMeters(quantizeDepthMetersToU16(2.5))).toBe(2.5);
    expect(dequantizeDepthU16ToMeters(quantizeDepthMetersToU16(14.0))).toBe(14.0);
    const { decoded } = decodeFixture();
    const blade = decoded.panels[0]?.layers.find((l) => l.role === "character");
    expect(blade?.depthQ16).toBe(2500);
    expect(blade?.depthMeters).toBe(2.5);
    expect(blade?.material.metallic).toBe(0.95);
    expect(blade?.material.roughness).toBe(0.12);
    expect(blade?.material.metallicMaskBytes).toEqual(new Uint8Array([0, 64, 192, 255, 255, 220, 80, 0, 16]));
  });

  it("헤더 매직 1바이트 변조를 INVALID_MAGIC으로 즉시 차단한다", () => {
    const { bytes } = decodeFixture();
    const tampered = new Uint8Array(bytes);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    try {
      decodeTstudioLivePackage(tampered);
      expect.unreachable("변조된 매직이 통과하면 안 된다");
    } catch (err) {
      expect(err).toBeInstanceOf(TstudioLiveCodecError);
      expect((err as TstudioLiveCodecError).code).toBe("INVALID_MAGIC");
    }
  });

  it("헤더·CRC·SHA-256·청크 테이블·페이로드 어디서든 1바이트가 변조되면 fail-closed로 거부한다", () => {
    const { bytes } = decodeFixture();
    const offsets = [4, 6, 13, 20, 33, 42, 69, TSTUDIO_LIVE_HEADER_BYTE_LENGTH + 2, Math.floor(bytes.length * 0.5), bytes.length - 1];
    for (const offset of offsets) {
      const tampered = new Uint8Array(bytes);
      tampered[offset] = ((tampered[offset] ?? 0) ^ 0x80) & 0xff;
      expect(() => decodeTstudioLivePackage(tampered)).toThrow(TstudioLiveCodecError);
    }
  });

  it("잘린 컨테이너와 뒤에 불순 바이트가 붙은 컨테이너를 모두 거부한다", () => {
    const { bytes } = decodeFixture();
    expect(() => decodeTstudioLivePackage(bytes.subarray(0, 32))).toThrow(TstudioLiveCodecError);
    expect(() => decodeTstudioLivePackage(bytes.subarray(0, bytes.length - 4))).toThrow(TstudioLiveCodecError);
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes, 0);
    padded[bytes.length] = 0xaa;
    expect(() => decodeTstudioLivePackage(padded)).toThrow(TstudioLiveCodecError);
  });

  it("필수 정적 폴백 서술자 또는 패널 매핑이 빠진 패키지는 인코딩 단계에서 차단한다", () => {
    const input = buildSampleEpisode(3);
    expect(() => encodeTstudioLivePackage({ ...input, staticFallback: { ...input.staticFallback, panelFallbacks: input.staticFallback.panelFallbacks.slice(0, 2) } })).toThrow(TstudioLiveCodecError);
    expect(() => encodeTstudioLivePackage({ ...input, staticFallback: { ...input.staticFallback, posterBytes: new Uint8Array(0) } })).toThrow(TstudioLiveCodecError);
  });

  it("정적 폴백 포스터와 전 패널 폴백 서술자가 복호화 후에도 완전하게 보존된다", () => {
    const { decoded } = decodeFixture();
    expect(decoded.staticFallback.schemaVersion).toBe(1);
    expect(decoded.staticFallback.panelFallbacks).toHaveLength(decoded.panels.length);
    for (const fb of decoded.staticFallback.panelFallbacks) {
      expect(decoded.assets[fb.compositeAssetIndex]).toBeDefined();
      expect(fb.altText.length).toBeGreaterThan(0);
    }
  });
});

describe("Wave 88: 콘텐츠 주소 중복 제거 및 >= 50% 용량 절감", () => {
  it("6컷 반복 배경·캐릭터 스프라이트를 단일 저장해 비중복 정적 기준 대비 50% 이상 절감한다", () => {
    const { decoded } = decodeFixture();
    expect(decoded.deduplicationStats.uniqueAssetCount).toBeLessThan(decoded.deduplicationStats.totalAssetReferenceCount);
    expect(decoded.deduplicationStats.deduplicationSavingsRatio).toBeGreaterThanOrEqual(0.5);
    const comparison = compareTstudioLiveVsStaticJpegBudget(decoded);
    expect(comparison.baselineSource).toBe("derived-non-deduplicated-layers");
    expect(comparison.meetsFiftyPercentSavingsTarget).toBe(true);
    expect(comparison.savingsPercent).toBeGreaterThanOrEqual(50);
    expect(comparison.assetReuseFactor).toBeGreaterThan(2.5);
  });

  it("실측 정적 JPEG 컷 스택 바이트를 주입하면 measured-static-jpeg 기준선으로 정확히 비교한다", () => {
    const { decoded } = decodeFixture();
    const measured = decoded.header.totalLength * 3;
    const comparison = compareTstudioLiveVsStaticJpegBudget(decoded, { measuredStaticJpegStackBytes: measured });
    expect(comparison.baselineSource).toBe("measured-static-jpeg");
    expect(comparison.savingsRatio).toBeCloseTo(2 / 3, 5);
    expect(comparison.meetsFiftyPercentSavingsTarget).toBe(true);
  });
});

describe("Wave 88: 2.5D 자이로 시차, 0px 검은 여백 안전 및 정반사 광택 이동", () => {
  it("gyroGammaDeg(-20° -> +20°) 변화에 따라 근경 시차 변위가 단조 증가한다", () => {
    const { decoded } = decodeFixture();
    const shifts = [-20, -10, 0, 10, 20].map((gamma) => evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: gamma })).panels[0]?.layers.find((l) => l.role === "foreground-fx")?.parallaxXPx ?? Number.NaN);
    for (let i = 1; i < shifts.length; i += 1) expect(shifts[i]).toBeGreaterThan(shifts[i - 1] ?? Number.NEGATIVE_INFINITY);
    expect(shifts[2]).toBe(0);
  });

  it("같은 기울기(+20°)에서 근경(1.2m)이 중경(5.5m)과 원경(14.0m)보다 더 크게 이동한다", () => {
    const { decoded } = decodeFixture();
    const layers = evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: 20 })).panels[0]?.layers ?? [];
    const shiftOf = (role: string): number => Math.abs(layers.find((l) => l.role === role)?.parallaxXPx ?? 0);
    expect(shiftOf("foreground-fx")).toBeGreaterThan(shiftOf("character"));
    expect(shiftOf("character")).toBeGreaterThan(shiftOf("midground"));
    expect(shiftOf("midground")).toBeGreaterThan(shiftOf("backdrop"));
    expect(shiftOf("backdrop")).toBeGreaterThan(0);
  });

  it("극단 기울기(±45°)와 오버스캔 여백 0px에서도 전면 채움 레이어의 검은 여백 노출이 정확히 0px이다", () => {
    const extreme = computeOverscanSafeParallaxOffset({
      depthMeters: 0.8, fullBleed: true, lockToViewportFrame: false, overscanMarginPx: 0,
      effectiveGammaDeg: 45, effectiveBetaDeg: -45, viewportWidthPx: 390, panelHeightPx: 760,
      prefersReducedMotion: false, baseParallaxWidthRatio: 0.25, maxAutoOverscanScale: 1.25,
    });
    expect(extreme.exposedBlackBorderPx).toBe(0);
    expect(extreme.overscanScale).toBeGreaterThan(1);
    const { decoded } = decodeFixture();
    for (const gamma of [-45, -20, 20, 45]) {
      expect(evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: gamma, gyroBetaDeg: -gamma })).metrics.maxExposedBlackBorderPx).toBe(0);
    }
  });

  it("뷰포트 고정 말풍선(lockToViewportFrame: true)은 기울기 변화에도 시차 변위가 0px이다", () => {
    const { decoded } = decodeFixture();
    const balloon = evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: 25, gyroBetaDeg: 18 })).panels[0]?.layers.find((l) => l.role === "speech-balloon");
    expect(balloon?.parallaxXPx).toBe(0);
    expect(balloon?.parallaxYPx).toBe(0);
  });

  it("좌우 기울기(-20° -> +20°)에 따라 금속 검날 정반사 각도와 하이라이트 U 좌표가 부드럽게 이동한다", () => {
    const { decoded } = decodeFixture();
    const states = [-20, -10, 0, 10, 20].map((gamma) => {
      const layers = evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: gamma })).panels[0]?.layers ?? [];
      return { blade: layers.find((l) => l.role === "character")?.specular, sky: layers.find((l) => l.role === "backdrop")?.specular };
    });
    for (let i = 1; i < states.length; i += 1) {
      expect(states[i]?.blade?.highlightAngleDeg).toBeGreaterThan(states[i - 1]?.blade?.highlightAngleDeg ?? -999);
      expect(states[i]?.blade?.highlightU).toBeGreaterThan(states[i - 1]?.blade?.highlightU ?? -1);
    }
    expect(states[4]?.blade?.shimmerIntensity).toBeGreaterThan(states[4]?.sky?.shimmerIntensity ?? 1);
  });

  it("빗줄기 방출기의 기울기 각도와 수평 속도가 휴대폰 기울기 tan(gamma)에 따라 단조 굴절된다", () => {
    const { decoded } = decodeFixture();
    const rains = [-20, -10, 0, 10, 20].map((gamma) => evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: gamma })).panels[0]?.emitters.find((e) => e.kind === "rain"));
    for (let i = 1; i < rains.length; i += 1) {
      expect(rains[i]?.slantAngleDeg).toBeGreaterThan(rains[i - 1]?.slantAngleDeg ?? -999);
      expect(rains[i]?.meanVelocityXPxPerSec).toBeGreaterThan(rains[i - 1]?.meanVelocityXPxPerSec ?? -9999);
    }
    expect(rains[2]?.slantAngleDeg).toBe(0);
    expect(rains[4]?.slantAngleDeg).toBeCloseTo(20, 1);
  });
});

describe("Wave 88: 스크롤 속도 연동 파티클 물리 및 오디오 큐 크로스페이드", () => {
  it("스크롤 속도(0 -> 1800 px/s) 증가에 따라 불티와 꽃잎의 이동 속도와 잔상 길이가 단조 가속한다", () => {
    const { decoded } = decodeFixture();
    const speeds = [0, 600, 1200, 1800];
    const embers = speeds.map((v) => evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: 0, scrollVelocityPxPerSec: v })).panels[0]?.emitters.find((e) => e.kind === "embers"));
    const petals = speeds.map((v) => evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: 760, scrollVelocityPxPerSec: v })).panels[1]?.emitters.find((e) => e.kind === "petals"));
    for (let i = 1; i < speeds.length; i += 1) {
      expect(embers[i]?.effectiveSpeedPxPerSec).toBeGreaterThan(embers[i - 1]?.effectiveSpeedPxPerSec ?? 0);
      expect(embers[i]?.streakLengthPx).toBeGreaterThan(embers[i - 1]?.streakLengthPx ?? 0);
      expect(petals[i]?.effectiveSpeedPxPerSec).toBeGreaterThan(petals[i - 1]?.effectiveSpeedPxPerSec ?? 0);
    }
  });

  it("동일 시각·상태 평가 시 꽃잎·수면 파문 입자 좌표가 완전 결정적으로 재현된다", () => {
    const { decoded } = decodeFixture();
    const state = readerState({ scrollY: 760, elapsedTimeMs: 1250, gyroGammaDeg: 12 });
    const frameA = evaluateReactiveWebtoonFrame(decoded, state);
    expect(frameA.panels[1]?.emitters).toEqual(evaluateReactiveWebtoonFrame(decoded, state).panels[1]?.emitters);
    const frameLater = evaluateReactiveWebtoonFrame(decoded, { ...state, elapsedTimeMs: 2500 });
    expect(frameLater.panels[1]?.emitters[0]?.particles[0]?.yNorm).not.toBe(frameA.panels[1]?.emitters[0]?.particles[0]?.yNorm);
  });

  it("화면 밖 패널은 레이어·파티클 연산을 건너뛰어 60fps 예산을 아낀다", () => {
    const { decoded } = decodeFixture();
    const offscreen = evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: 0 })).panels[5];
    expect(offscreen?.visible).toBe(false);
    expect(offscreen?.layers).toHaveLength(0);
    expect(offscreen?.emitters).toHaveLength(0);
  });

  it("스크롤 전 구간에서 오디오 큐 가중치 합은 1.0 이하이고 급격한 점프 없이 크로스페이드된다", () => {
    const { decoded } = decodeFixture();
    let prevGains: number[] | null = null;
    let maxJump = 0;
    for (let y = 0; y <= decoded.episode.totalHeightPx - 844; y += 100) {
      const frame = evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: y }));
      expect(frame.audioCues.reduce((sum, c) => sum + c.normalizedWeight, 0)).toBeLessThanOrEqual(1.0 + 1e-6);
      const gains = frame.audioCues.map((c) => c.effectiveGain);
      if (prevGains) gains.forEach((g, idx) => { maxJump = Math.max(maxJump, Math.abs(g - (prevGains?.[idx] ?? 0))); });
      prevGains = gains;
    }
    expect(maxJump).toBeLessThan(0.25);
    const startFrame = evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: 0 }));
    const endFrame = evaluateReactiveWebtoonFrame(decoded, readerState({ scrollY: 3400 }));
    expect(startFrame.audioCues[0]?.effectiveGain).toBeGreaterThan(0.5);
    expect(startFrame.audioCues[1]?.effectiveGain).toBe(0);
    expect(endFrame.audioCues[0]?.effectiveGain).toBe(0);
    expect(endFrame.audioCues[1]?.effectiveGain).toBeGreaterThan(0.5);
  });
});

describe("Wave 88: 전정 보호(prefersReducedMotion), 절전 및 비유한 입력 방어", () => {
  it("prefersReducedMotion: true 시 시차 0px, 난류 0, 빗방울·불티 정적 고정, 반짝임 <= 0.1을 강제한다", () => {
    const { decoded } = decodeFixture();
    const frame = evaluateReactiveWebtoonFrame(decoded, readerState({ scrollVelocityPxPerSec: 2200, gyroGammaDeg: 28, gyroBetaDeg: -22, prefersReducedMotion: true }));
    expect(frame.degradationMode).toBe("reduced-motion-calm");
    expect(frame.effectiveGyroGammaDeg).toBe(0);
    expect(frame.effectiveScrollVelocityPxPerSec).toBe(0);
    for (const panel of frame.panels) {
      for (const l of panel.layers) {
        expect(l.parallaxXPx).toBe(0);
        expect(l.parallaxYPx).toBe(0);
        expect(l.specular.shimmerIntensity).toBeLessThanOrEqual(MAX_REDUCED_MOTION_SHIMMER_INTENSITY);
      }
      for (const em of panel.emitters) {
        expect(em.mode).toBe("static-calm-accent");
        expect(em.effectiveTurbulence).toBe(0);
        expect(em.slantAngleDeg).toBe(0);
        expect(em.effectiveSpeedPxPerSec).toBe(0);
      }
    }
    for (const cue of frame.audioCues) expect(cue.stereoPan).toBe(0);
  });

  it("batterySaverMode: true 시 파티클 수를 절반으로 줄이고 시차 진폭을 완화한다", () => {
    const { decoded } = decodeFixture();
    const full = evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: 20, batterySaverMode: false }));
    const saver = evaluateReactiveWebtoonFrame(decoded, readerState({ gyroGammaDeg: 20, batterySaverMode: true }));
    expect(saver.degradationMode).toBe("battery-saver");
    expect(saver.metrics.activeParticleCount).toBeLessThanOrEqual(Math.ceil(full.metrics.activeParticleCount * 0.5));
    expect(saver.metrics.maxExposedBlackBorderPx).toBe(0);
    const fullFg = Math.abs(full.panels[0]?.layers.find((l) => l.role === "foreground-fx")?.parallaxXPx ?? 0);
    const saverFg = Math.abs(saver.panels[0]?.layers.find((l) => l.role === "foreground-fx")?.parallaxXPx ?? 0);
    expect(saverFg).toBeLessThan(fullFg);
  });

  it("NaN이나 Infinity 센서·뷰포트 입력이 들어와도 출력에 NaN을 전파하지 않는다", () => {
    const { decoded } = decodeFixture();
    const frame = evaluateReactiveWebtoonFrame(decoded, readerState({
      scrollY: Number.NaN, scrollVelocityPxPerSec: Number.POSITIVE_INFINITY, gyroBetaDeg: Number.NEGATIVE_INFINITY,
      gyroGammaDeg: Number.NaN, elapsedTimeMs: Number.NaN, viewportWidthPx: Number.NaN, viewportHeightPx: Number.POSITIVE_INFINITY,
    }));
    expect(JSON.stringify(frame)).not.toContain("null");
    expect(Number.isFinite(frame.metrics.estimatedGpuFrameMs)).toBe(true);
    expect(frame.metrics.maxExposedBlackBorderPx).toBe(0);
  });
});

describe("Wave 88: 오프라인 PWA 플레이어 매니페스트 및 60fps 성능 예산 감사", () => {
  it("오프라인 캐시 키·무결성 해시·HTML 이스케이프된 noscript 정적 폴백 스니펫을 생성한다", () => {
    const { decoded } = decodeFixture();
    const manifest = buildReactiveWebtoonPlayerManifest(decoded, { cacheNamespace: "toonstudio-pwa" });
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.packageFormat.extension).toBe(TSTUDIO_LIVE_FILE_EXTENSION);
    expect(manifest.packageFormat.mimeType).toBe(TSTUDIO_LIVE_MIME_TYPE);
    expect(manifest.integrity.contentSha256Hex).toBe(decoded.integrity.contentSha256Hex);
    expect(manifest.offlinePwa.offlineReady).toBe(true);
    expect(manifest.offlinePwa.cacheKey).toContain("toonstudio-pwa:ep-01-storm-citadel:");
    expect(manifest.capabilities.staticFallbackGuaranteed).toBe(true);
    expect(manifest.accessibility.panelAltTextCoverageRatio).toBe(1);
    expect(manifest.embedHtmlSnippet).toContain("<noscript>");
    expect(manifest.embedHtmlSnippet).toContain("&lt;살아있는 지면&gt;");
  });

  it("60fps 프레임 예산 감사에서 모든 시나리오가 16.67ms·0px 여백·0 NaN·전정 보호를 통과한다", () => {
    const { decoded } = decodeFixture();
    const audit = auditReactiveWebtoonPerformanceBudget(decoded);
    expect(audit.passed).toBe(true);
    expect(audit.sampledScenarioCount).toBe(6);
    expect(audit.within60fpsBudget).toBe(true);
    expect(audit.maxCombinedFrameMs).toBeLessThan(TARGET_60FPS_FRAME_BUDGET_MS);
    expect(audit.zeroBlackBorderViolations).toBe(true);
    expect(audit.zeroNanViolations).toBe(true);
    expect(audit.reducedMotionVerified).toBe(true);
    expect(audit.audioWeightBounded).toBe(true);
    expect(audit.diagnostics).toHaveLength(0);
  });

  it("생성 -> 인코딩 -> 복호화 -> 용량 비교 -> 매니페스트 -> 60fps 감사 전체 파이프라인이 일관되게 동작한다", () => {
    const encoded = encodeTstudioLivePackage(buildSampleEpisode(8));
    const decoded = decodeTstudioLivePackage(encoded.bytes);
    const budget = compareTstudioLiveVsStaticJpegBudget(decoded);
    const manifest = buildReactiveWebtoonPlayerManifest(decoded);
    const audit = auditReactiveWebtoonPerformanceBudget(decoded);
    expect(decoded.integrity.verified).toBe(true);
    expect(budget.meetsFiftyPercentSavingsTarget).toBe(true);
    expect(manifest.episode.panelCount).toBe(8);
    expect(manifest.staticFallback.panelCount).toBe(8);
    expect(audit.passed).toBe(true);
  });
});
