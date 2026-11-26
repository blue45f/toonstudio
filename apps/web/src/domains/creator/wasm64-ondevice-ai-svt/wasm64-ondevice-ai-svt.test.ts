import { describe, expect, it } from "vitest";
import { buildVelloPhase1OverlayScene } from "../canvas/studio-vello-phase1-overlay-adapter";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { packetizeWave3StereoPcm } from "../wasm64-gpu-media-pipeline/webcodecs-audiotoon-timeline-mux";
import {
  AdaptiveStrokeGeometryCache,
  OnDeviceSpeechSynthEngine,
  SVT_UNIFORM_BYTES,
  SparseVirtualTextureSystem,
  WGSL_SVT_PAGE_RESOLVE,
  analyzePanelComposition,
  buildCompositionOverlayState,
  compressSkeletalClip,
  computeSvtMemoryBudget,
  createBrowserOpfsStrokeStore,
  createOpfsStrokeStore,
  decompressSkeletalClip,
  deserializeStrokeGeometry,
  detectSpeechLanguage,
  encodeMonoPcm16Wav,
  hashStrokeControlPointsFnv64,
  normalizeQuat,
  packFeedbackPageId,
  packPageTableEntry,
  packSmallestThree48,
  probeOnDeviceSpeechProviders,
  probeWebNnCompositionProvider,
  quantizeZoomLodBucket,
  quaternionAngularErrorDeg,
  rectIntersectionArea,
  sampleVisemeWeightsAtMs,
  serializeStrokeGeometry,
  subdivideAdaptiveStroke,
  unpackFeedbackPageId,
  unpackPageTableEntry,
  unpackSmallestThree48,
  validateSvtWgslShader,
  type AdaptiveStrokeInput,
  type SkeletalAnimationClip,
  type SkeletalBoneTrack,
  type SvtGpuBufferLike,
  type SvtGpuDeviceLike,
} from "./index";

function axisAngleQuat(ax: number, ay: number, az: number, angleRad: number): [number, number, number, number] {
  const len = Math.max(1e-8, Math.hypot(ax, ay, az));
  const half = angleRad * 0.5;
  const s = Math.sin(half) / len;
  return normalizeQuat(ax * s, ay * s, az * s, Math.cos(half));
}

function buildSyntheticSkeletalClip(boneCount: number, frameCount: number, fps = 30): SkeletalAnimationClip {
  const tracks: SkeletalBoneTrack[] = [];
  for (let b = 0; b < boneCount; b += 1) {
    const times = new Float32Array(frameCount);
    const rotations = new Float32Array(frameCount * 4);
    const includePos = b === 0;
    const positions = includePos ? new Float32Array(frameCount * 3) : undefined;
    const isStaticBone = b % 4 === 3;
    const freq = 0.6 + (b % 5) * 0.25;
    const amp = isStaticBone ? 0 : 0.42 + (b % 3) * 0.18;
    const ax = b % 3 === 0 ? 1 : 0.2;
    const ay = b % 3 === 1 ? 1 : 0.3;
    const az = b % 3 === 2 ? 1 : 0.15;

    for (let f = 0; f < frameCount; f += 1) {
      const t = f / fps;
      times[f] = t;
      const u = f / Math.max(1, frameCount - 1);
      const angle = amp * Math.sin(u * Math.PI * 2 * freq) + (b === 1 ? 0.15 * Math.cos(u * Math.PI * 3) : 0);
      const q = axisAngleQuat(ax, ay, az, angle);
      rotations[f * 4] = q[0];
      rotations[f * 4 + 1] = q[1];
      rotations[f * 4 + 2] = q[2];
      rotations[f * 4 + 3] = q[3];
      if (positions) {
        positions[f * 3] = 0.45 * Math.sin(u * Math.PI);
        positions[f * 3 + 1] = 1.0 + 0.08 * Math.sin(u * Math.PI * 2);
        positions[f * 3 + 2] = u * 1.2;
      }
    }
    tracks.push({ boneName: `bone_${b}`, times, rotations, positions });
  }
  return { clipId: "hero-walk-gesture", fps, durationSec: frameCount / fps, tracks };
}

/** 캐릭터(피부 얼굴 + 몸통), 기존 말풍선+텍스트, 반대편 여백을 포함한 합성 웹툰 패널 RGBA8을 생성한다. */
function buildSyntheticWebtoonPanel(width: number, height: number): {
  readonly rgba: Uint8ClampedArray;
  readonly trueFaceRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly trueBalloonRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
} {
  const rgba = new Uint8ClampedArray(width * height * 4);
  // 밝은 종이 배경
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = 246;
    rgba[i * 4 + 1] = 244;
    rgba[i * 4 + 2] = 238;
    rgba[i * 4 + 3] = 255;
  }

  const paintPixel = (x: number, y: number, r: number, g: number, b: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  };

  // 1) 캐릭터 상반신 (좌하~중앙 좌측)
  const bodyX0 = Math.round(width * 0.16);
  const bodyX1 = Math.round(width * 0.46);
  const bodyY0 = Math.round(height * 0.56);
  const bodyY1 = Math.round(height * 0.94);
  for (let y = bodyY0; y <= bodyY1; y += 1) {
    for (let x = bodyX0; x <= bodyX1; x += 1) {
      const border = x - bodyX0 < 4 || bodyX1 - x < 4 || y - bodyY0 < 4 || bodyY1 - y < 4;
      paintPixel(x, y, border ? 24 : 52, border ? 26 : 86, border ? 32 : 124);
    }
  }

  // 2) 얼굴 타원 (따뜻한 피부색 + 양측 대칭 눈/입)
  const faceCx = Math.round(width * 0.31);
  const faceCy = Math.round(height * 0.42);
  const faceRx = Math.round(width * 0.095);
  const faceRy = Math.round(height * 0.115);
  for (let y = faceCy - faceRy - 4; y <= faceCy + faceRy + 4; y += 1) {
    for (let x = faceCx - faceRx - 4; x <= faceCx + faceRx + 4; x += 1) {
      const nx = (x - faceCx) / faceRx;
      const ny = (y - faceCy) / faceRy;
      const d = nx * nx + ny * ny;
      if (d <= 1.0) {
        paintPixel(x, y, 240, 198, 168);
      } else if (d <= 1.14) {
        paintPixel(x, y, 28, 24, 24);
      }
    }
  }
  // 대칭 눈
  for (const side of [-1, 1]) {
    const ex = faceCx + side * Math.round(faceRx * 0.38);
    const ey = faceCy - Math.round(faceRy * 0.12);
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        paintPixel(ex + dx, ey + dy, 26, 28, 34);
      }
    }
  }

  // 3) 기존 말풍선 (우하단): 검은 외곽선 + 흰 내부 + 텍스트 잉크 줄
  const balX0 = Math.round(width * 0.56);
  const balY0 = Math.round(height * 0.62);
  const balW = Math.round(width * 0.32);
  const balH = Math.round(height * 0.22);
  for (let y = balY0; y < balY0 + balH; y += 1) {
    for (let x = balX0; x < balX0 + balW; x += 1) {
      const isBorder = x - balX0 < 5 || balX0 + balW - 1 - x < 5 || y - balY0 < 5 || balY0 + balH - 1 - y < 5;
      paintPixel(x, y, isBorder ? 18 : 255, isBorder ? 20 : 255, isBorder ? 24 : 255);
    }
  }
  // 말풍선 내부 텍스트 2줄
  for (const rowOff of [0.36, 0.62]) {
    const ty = balY0 + Math.round(balH * rowOff);
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let x = balX0 + 18; x < balX0 + balW - 18; x += 1) {
        if ((x - balX0) % 10 < 6) paintPixel(x, ty + dy, 20, 22, 26);
      }
    }
  }

  return {
    rgba,
    trueFaceRect: { x: faceCx - faceRx, y: faceCy - faceRy, width: faceRx * 2, height: faceRy * 2 },
    trueBalloonRect: { x: balX0, y: balY0, width: balW, height: balH },
  };
}

describe("1. 온디바이스 오프라인 TTS · 립싱크 비젬 · 48-bit 스켈레탈 애니메이션 코덱", () => {
  it("한국어·영어·일본어 문장을 ₩0 오프라인 포먼트 PCM 16-bit/Float32 및 Wave-3 스테레오 버스로 합성한다", async () => {
    const engine = new OnDeviceSpeechSynthEngine();
    const koResult = await engine.synthesize({
      text: "안녕하세요! 오늘 웹툰 마감이 코앞이에요?",
      sampleRate: 48_000,
      voicePresetId: "heroine-bright",
      emotion: "bright",
    });

    expect(koResult.serverCostKrw).toBe(0);
    expect(koResult.provider).toBe("local-formant-pcm");
    expect(koResult.language).toBe("ko");
    expect(koResult.frameCount).toBeGreaterThan(24_000);
    expect(koResult.pcmInt16.length).toBe(koResult.pcmFloat32.length);
    expect(koResult.peakLinear).toBeGreaterThan(0.2);
    expect(koResult.peakLinear).toBeLessThanOrEqual(1.0);
    expect(koResult.rmsLinear).toBeGreaterThan(0.01);

    // Wave-3 / WebCodecs 로컬 오디오툰 패킷화기 직접 호환 검증
    const packetized = packetizeWave3StereoPcm(koResult.stereoBus, 1024);
    expect(packetized.packetCount).toBeGreaterThan(20);
    expect(packetized.overallPeakLinear).toBeGreaterThan(0.1);

    // 표준 RIFF/WAVE 인코딩 검증
    const wav = encodeMonoPcm16Wav(koResult.pcmInt16, koResult.sampleRate);
    expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe("RIFF");
    expect(String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!)).toBe("WAVE");
    expect(wav.byteLength).toBe(44 + koResult.pcmInt16.length * 2);

    // 6-비젬 립싱크 타임라인 및 동시조음 블렌드 샘플러 검증
    const visemeSet = new Set(koResult.visemes.map((v) => v.viseme));
    expect(visemeSet.has("A")).toBe(true);
    expect(visemeSet.has("I")).toBe(true);
    expect(visemeSet.has("O")).toBe(true);
    expect(visemeSet.has("E")).toBe(true);
    expect(visemeSet.has("closed")).toBe(true);
    for (let i = 1; i < koResult.visemes.length; i += 1) {
      expect(koResult.visemes[i]!.startMs).toBeGreaterThanOrEqual(koResult.visemes[i - 1]!.endMs - 0.01);
    }

    const midSample = sampleVisemeWeightsAtMs(koResult.visemes, koResult.durationMs * 0.35);
    const sumW = midSample.A + midSample.I + midSample.U + midSample.E + midSample.O + midSample.closed;
    expect(sumW).toBeCloseTo(1.0, 2);

    // 의문문 끝상승 vs 평서문 운율 피치 비교
    const statement = await engine.synthesize({ text: "오늘 웹툰 마감이 코앞이에요.", sampleRate: 24_000 });
    const question = await engine.synthesize({ text: "오늘 웹툰 마감이 코앞이에요?", sampleRate: 24_000 });
    const lastVoicedPitch = (res: typeof statement): number => {
      for (let i = res.visemes.length - 1; i >= 0; i -= 1) {
        if (res.visemes[i]!.viseme !== "closed") return res.visemes[i]!.pitchHz;
      }
      return 0;
    };
    expect(lastVoicedPitch(question)).toBeGreaterThan(lastVoicedPitch(statement));

    // 영어 & 일본어 분해·합성 검증
    expect(detectSpeechLanguage("Hello world! Ready to draw?")).toBe("en");
    expect(detectSpeechLanguage("こんにちは、ウェブトゥーン！")).toBe("ja");
    const enResult = await engine.synthesize({ text: "Hello world, ready to draw!", sampleRate: 24_000 });
    const jaResult = await engine.synthesize({ text: "こんにちは、ウェブトゥーン！", sampleRate: 24_000 });
    expect(enResult.language).toBe("en");
    expect(enResult.visemes.some((v) => v.viseme === "O" || v.viseme === "E")).toBe(true);
    expect(jaResult.language).toBe("ja");
    expect(jaResult.visemes.some((v) => v.viseme === "U" || v.viseme === "I")).toBe(true);
  });

  it("WebNN ONNX Kokoro/VITS 및 Web Speech API 프로바이더 라우팅·폴백을 검증한다", async () => {
    const fallbackProbe = probeOnDeviceSpeechProviders({ navigatorMl: null, speechSynthesis: null, webNnRunner: null });
    expect(fallbackProbe.selectedProvider).toBe("local-formant-pcm");
    expect(fallbackProbe.pcmAlwaysAvailable).toBe(true);
    expect(fallbackProbe.serverCostKrw).toBe(0);

    let runnerCalled = false;
    const engine = new OnDeviceSpeechSynthEngine({
      navigatorMl: { createContext: async () => ({ mock: true }) },
      webNnRunner: {
        modelKind: "webnn-onnx-kokoro",
        supportedLanguages: ["ko", "en", "ja"],
        synthesizePcm: async ({ sampleRate }) => {
          runnerCalled = true;
          const out = new Float32Array(Math.floor(sampleRate * 0.2));
          for (let i = 0; i < out.length; i += 1) out[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
          return out;
        },
      },
    });
    expect(engine.probeProviders().selectedProvider).toBe("webnn-onnx-kokoro");
    const res = await engine.synthesize({ text: "테스트 음성", sampleRate: 24_000 });
    expect(runnerCalled).toBe(true);
    expect(res.provider).toBe("webnn-onnx-kokoro");
    expect(res.frameCount).toBe(4800);
  });

  it("48-bit Smallest-Three 쿼터니언 라운드트립(<0.01°) 및 스켈레탈 클립 압축(>=75% 절감, <=0.5° 오차)을 달성한다", () => {
    const testQuats: readonly [number, number, number, number][] = [
      axisAngleQuat(1, 0, 0, 0.7),
      axisAngleQuat(0, 1, 0, 2.2),
      axisAngleQuat(0, 0, 1, -1.8),
      normalizeQuat(-0.82, 0.31, -0.44, -0.19),
      normalizeQuat(0.11, -0.91, 0.25, 0.31),
      normalizeQuat(0.28, 0.14, -0.94, 0.13),
    ];
    const scratch = new Uint8Array(6);
    for (const q of testQuats) {
      packSmallestThree48(q, scratch, 0);
      const restored = unpackSmallestThree48(scratch, 0);
      expect(quaternionAngularErrorDeg(q, restored)).toBeLessThan(0.01);
    }

    const clip = buildSyntheticSkeletalClip(16, 120, 30);
    let latentHookCalls = 0;
    const compressed = compressSkeletalClip(clip, {
      maxAngularErrorDeg: 0.45,
      maxPositionError: 0.002,
      latentPoseHook: {
        providerName: "webnn-mock-latent",
        encodeLatentPose: (pose) => {
          latentHookCalls += 1;
          return new Float32Array([pose.length, pose[0] ?? 0, pose[3] ?? 1]);
        },
        decodeLatentPose: (_lat, len) => new Float32Array(len),
      },
    });

    expect(latentHookCalls).toBe(1);
    expect(compressed.metrics.latentPoseHookUsed).toBe(true);
    expect(compressed.metrics.savingsPct).toBeGreaterThanOrEqual(75);
    expect(compressed.metrics.maxAngularErrorDeg).toBeLessThanOrEqual(0.5);
    expect(compressed.binaryPayload[0]).toBe(0x54); // 'T'
    expect(compressed.binaryPayload[1]).toBe(0x53); // 'S'
    expect(compressed.binaryPayload[2]).toBe(0x41); // 'A'
    expect(compressed.binaryPayload[3]).toBe(0x4b); // 'K'

    const restored = decompressSkeletalClip(compressed);
    expect(restored.tracks.length).toBe(clip.tracks.length);

    let verifiedMaxDeg = 0;
    for (let t = 0; t < clip.tracks.length; t += 1) {
      const orig = clip.tracks[t]!;
      const dec = restored.tracks[t]!;
      expect(dec.times.length).toBe(orig.times.length);
      for (let f = 0; f < orig.times.length; f += 1) {
        const o = f * 4;
        const errDeg = quaternionAngularErrorDeg(
          [orig.rotations[o]!, orig.rotations[o + 1]!, orig.rotations[o + 2]!, orig.rotations[o + 3]!],
          [dec.rotations[o]!, dec.rotations[o + 1]!, dec.rotations[o + 2]!, dec.rotations[o + 3]!],
        );
        if (errDeg > verifiedMaxDeg) verifiedMaxDeg = errDeg;
      }
    }
    expect(verifiedMaxDeg).toBeLessThanOrEqual(0.5);
  });
});

describe("2. WebNN / 오프라인 구도·객체 검출기 및 Vello Phase1 오버레이 연동", () => {
  it("얼굴·캐릭터·말풍선·텍스트를 오프라인 검출하고 겹침 0인 안전 말풍선 슬롯과 Vello 오버레이를 생성한다", async () => {
    const width = 320;
    const height = 400;
    const { rgba, trueFaceRect, trueBalloonRect } = buildSyntheticWebtoonPanel(width, height);
    const analysis = await analyzePanelComposition(rgba, width, height, {
      env: { navigatorMl: null, webNnExecutor: null },
      maxSafeBalloonSlots: 4,
    });

    expect(analysis.providerReport.selectedProvider).toBe("offline-integral-hog-cc");
    expect(analysis.providerReport.serverCostKrw).toBe(0);
    expect(analysis.faces.length).toBeGreaterThanOrEqual(1);
    expect(analysis.characters.length).toBeGreaterThanOrEqual(1);
    expect(analysis.speechBalloons.length).toBeGreaterThanOrEqual(1);
    expect(analysis.textBlocks.length).toBeGreaterThanOrEqual(1);

    // 검출된 얼굴·말풍선이 실제 합성 영역과 겹침 확인
    expect(analysis.faces.some((f) => rectIntersectionArea(f.rect, trueFaceRect) > 0)).toBe(true);
    expect(analysis.speechBalloons.some((b) => rectIntersectionArea(b.rect, trueBalloonRect) > 0)).toBe(true);

    // 3분할·황금비 앵커 및 충돌 회피 말풍선 슬롯 검증
    expect(analysis.ruleOfThirdsAnchors.length).toBe(4);
    expect(analysis.goldenRatioAnchors.length).toBe(4);
    expect(analysis.safeBalloonSlots.length).toBeGreaterThanOrEqual(1);
    for (const slot of analysis.safeBalloonSlots) {
      expect(slot.overlapWithFaces).toBe(0);
      expect(slot.overlapWithExistingBalloons).toBe(0);
      for (const f of analysis.faces) expect(rectIntersectionArea(slot.rect, f.rect)).toBe(0);
      for (const b of analysis.speechBalloons) expect(rectIntersectionArea(slot.rect, b.rect)).toBe(0);
    }

    // `studio-vello-phase1-overlay-adapter` 직접 전달 호환성 검증
    const overlayState = buildCompositionOverlayState(analysis, { guidePreset: "both" });
    expect(overlayState.guides?.length).toBe(12); // 4 rule-of-thirds + 4 golden-ratio + 4 safe-gutter
    expect(overlayState.marqueeRect).not.toBeNull();
    const velloOutput = buildVelloPhase1OverlayScene(overlayState, {
      width: 640,
      height: 800,
      scale: 2,
      offsetX: 0,
      offsetY: 0,
      dpr: 2,
    });
    expect(velloOutput.stats.guideCount).toBe(12);
    expect(velloOutput.stats.snapLineCount).toBeGreaterThanOrEqual(2);
    expect(velloOutput.stats.nodeCount).toBeGreaterThan(0);
  });

  it("WebNN NPU 프로바이더 감지 시 자동 라우팅하고 미지원 시 안전 폴백한다", async () => {
    const npuReport = await probeWebNnCompositionProvider({
      navigatorMl: {
        createContext: async (opts) => {
          if (opts?.deviceType === "npu") return { device: "apple-ane" };
          throw new Error("not used");
        },
      },
      webNnExecutor: {
        modelId: "webtoon-comp-det-v1",
        detect: async () => [],
      },
    });
    expect(npuReport.webNnSupported).toBe(true);
    expect(npuReport.availableDeviceTypes).toContain("npu");
    expect(npuReport.selectedProvider).toBe("webnn-npu");

    const fallbackReport = await probeWebNnCompositionProvider({
      navigatorMl: {
        createContext: async () => {
          throw new Error("WebNN unavailable");
        },
      },
    });
    expect(fallbackReport.webNnSupported).toBe(false);
    expect(fallbackReport.selectedProvider).toBe("offline-integral-hog-cc");
  });
});

describe("3. 곡률·줌·필압 적응형 스트로크 세분화기 및 64-bit FNV-1a LRU/OPFS 캐시", () => {
  it("직선 구간 정점 수를 대폭 절감하면서 급곡선·코너는 평탄도 오차 이내로 부드럽게 세분화한다", () => {
    const straightStroke: AdaptiveStrokeInput = {
      strokeId: "straight-1",
      baseWidthPx: 12,
      points: [
        { x: 0, y: 100, pressure: 0.6 },
        { x: 150, y: 100, pressure: 0.6 },
        { x: 300, y: 100, pressure: 0.6 },
        { x: 450, y: 100, pressure: 0.6 },
      ],
    };
    const curvedStroke: AdaptiveStrokeInput = {
      strokeId: "curve-s-1",
      baseWidthPx: 12,
      points: [
        { x: 0, y: 100, pressure: 0.2 },
        { x: 90, y: 10, pressure: 0.95 },
        { x: 180, y: 190, pressure: 0.3 },
        { x: 270, y: 15, pressure: 0.9 },
      ],
    };

    const flatGeom = subdivideAdaptiveStroke(straightStroke, { zoom: 1, flatnessTolerancePx: 0.35 });
    const curveGeom = subdivideAdaptiveStroke(curvedStroke, { zoom: 1, flatnessTolerancePx: 0.35 });
    const curveZoom4 = subdivideAdaptiveStroke(curvedStroke, { zoom: 4, flatnessTolerancePx: 0.35 });

    // 직선은 균일 16분할 기준 대비 정점 70% 이상 절감, 급곡선보다 훨씬 적은 샘플 사용
    expect(flatGeom.centerlineSampleCount).toBe(4);
    expect(flatGeom.vertexReductionVsUniformPct).toBeGreaterThan(70);
    expect(curveGeom.centerlineSampleCount).toBeGreaterThan(flatGeom.centerlineSampleCount * 4);
    expect(curveGeom.maxScreenFlatnessErrorPx).toBeLessThanOrEqual(0.36);
    expect(curveZoom4.centerlineSampleCount).toBeGreaterThan(curveGeom.centerlineSampleCount);
    expect(curveGeom.triangleCount).toBeGreaterThan(0);
    expect(curveGeom.verticesXy.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("64-bit FNV-1a 캐시가 팬/동일 줌 재렌더에서 0 재계산 적중하고 LRU 축출 및 OPFS 백킹 복원을 수행한다", async () => {
    const strokeA: AdaptiveStrokeInput = {
      strokeId: "sA",
      baseWidthPx: 10,
      points: [
        { x: 10, y: 20, pressure: 0.3 },
        { x: 80, y: 95, pressure: 0.85 },
        { x: 160, y: 30, pressure: 0.4 },
      ],
    };
    const strokeB: AdaptiveStrokeInput = {
      strokeId: "sB",
      baseWidthPx: 14,
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 120, y: 160, pressure: 0.9 },
        { x: 240, y: 10, pressure: 0.2 },
      ],
    };

    const { bucket: zBucket } = quantizeZoomLodBucket(1.0);
    const h1 = hashStrokeControlPointsFnv64(strokeA, zBucket);
    const h2 = hashStrokeControlPointsFnv64(strokeA, zBucket);
    const hDiff = hashStrokeControlPointsFnv64(strokeB, zBucket);
    expect(h1.hash64).toBe(h2.hash64);
    expect(h1.cacheKey).not.toBe(hDiff.cacheKey);

    const backingStore = createOpfsStrokeStore(createStudioOpfsMemoryFileSystem());
    const cache = new AdaptiveStrokeGeometryCache({ maxEntries: 2, maxBytes: 1024 * 1024, backingStore });
    const first = await cache.getOrSubdivideAsync(strokeA, { zoom: 1.0 });
    expect(first.cacheHit).toBe(false);
    expect(first.source).toBe("computed");

    // 미세 줌 변동(동일 LOD 버킷) 및 팬 이동 후 재렌더 → 0 재계산 메모리 LRU 적중
    const second = cache.getOrSubdivide(strokeA, { zoom: 1.03 });
    expect(second.cacheHit).toBe(true);
    expect(second.source).toBe("memory-lru");
    expect(cache.getMetrics().recomputeCount).toBe(1);

    // 바이너리 직렬화/역직렬화 무결성과 메모리 초기화 후 OPFS 백킹 복원
    const roundTrip = deserializeStrokeGeometry(first.geometry.cacheKey, serializeStrokeGeometry(first.geometry));
    expect(roundTrip?.vertexCount).toBe(first.geometry.vertexCount);
    expect(roundTrip?.hash64).toBe(first.geometry.hash64);

    cache.clearMemory();
    const hydrated = await cache.getOrSubdivideAsync(strokeA, { zoom: 1.0 });
    expect(hydrated.cacheHit).toBe(true);
    expect(hydrated.source).toBe("opfs-backing");
    expect(hydrated.geometry.verticesXy).toEqual(first.geometry.verticesXy);
    expect(cache.getMetrics().recomputeCount).toBe(1);

    const lowerDepth = await cache.getOrSubdivideAsync(strokeA, { zoom: 1.0, maxSubdivisionDepth: 1 });
    expect(lowerDepth.cacheHit).toBe(false);
    expect(lowerDepth.geometry.centerlineSampleCount).toBeLessThan(first.geometry.centerlineSampleCount);

    // maxEntries=2 LRU 축출 검증
    cache.getOrSubdivide(strokeB, { zoom: 1.0 });
    cache.getOrSubdivide(strokeB, { zoom: 4.0 });
    expect(cache.getMetrics().evictions).toBeGreaterThanOrEqual(1);
    expect(cache.getMetrics().entryCount).toBeLessThanOrEqual(2);
  });

  it("OPFS 캐시의 128개 슬롯 상한을 유지하며 교체된 키와 잘못된 레코드를 캐시 미스로 처리한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const store = createOpfsStrokeStore(fs);
    const geometry = subdivideAdaptiveStroke({ baseWidthPx: 4, points: [{ x: 0, y: 0, pressure: 1 }, { x: 20, y: 9, pressure: 1 }] });
    const keyAt = (index: number) => `stk64_${index.toString(16).padStart(16, "0")}_z0`;
    const serializeAt = (index: number) => serializeStrokeGeometry({
      ...geometry, hash64: BigInt(index), cacheKey: keyAt(index),
    });

    for (let index = 0; index < 129; index += 1) {
      expect(await store.write(keyAt(index), serializeAt(index))).toBe(true);
    }
    expect(await fs.list()).toHaveLength(128);
    expect(await store.read(keyAt(0))).toBeNull();
    await store.remove(keyAt(0));
    expect(await store.read(keyAt(128))).toEqual(serializeAt(128));
    expect(await store.write(keyAt(128), serializeAt(0))).toBe(false);
    expect(await store.write(keyAt(128), new Uint8Array(256 * 1024 + 1))).toBe(false);
    expect(await store.write("../document", serializeAt(128))).toBe(false);

    await fs.write("geometry/0.bin", Uint8Array.of(5));
    expect(await store.read(keyAt(128))).toBeNull();
    await fs.write("geometry/999.bin", Uint8Array.of(7));
    await fs.write("manuscript.bin", Uint8Array.of(9));
    await store.clear?.();
    expect(await fs.list()).toEqual(["geometry/999.bin", "manuscript.bin"]);
  });

  it("OPFS를 열거나 캐시를 쓰고 읽지 못해도 같은 지오메트리를 계산해 메모리에서 재사용한다", async () => {
    expect(await createBrowserOpfsStrokeStore({})).toBeNull();
    expect(await createBrowserOpfsStrokeStore({
      navigator: { storage: { async getDirectory() { throw new DOMException("Blocked", "SecurityError"); } } },
    })).toBeNull();

    const fs = createStudioOpfsMemoryFileSystem({ failReadAfter: 1, failWriteAfter: 1 });
    const cache = new AdaptiveStrokeGeometryCache({ backingStore: createOpfsStrokeStore(fs) });
    const stroke = { baseWidthPx: 4, points: [{ x: 0, y: 0, pressure: 1 }, { x: 20, y: 9, pressure: 1 }] };
    const expected = subdivideAdaptiveStroke(stroke);
    const computed = await cache.getOrSubdivideAsync(stroke);
    expect(computed).toMatchObject({ geometry: expected, cacheHit: false, source: "computed" });
    expect(fs.counts.write).toBe(1);
    fs.restart({ failReadAfter: 1 });
    const store = createOpfsStrokeStore(fs);
    await expect(store.write(expected.cacheKey, serializeStrokeGeometry(expected))).resolves.toBe(true);
    cache.clearMemory();
    expect(await cache.getOrSubdivideAsync(stroke)).toMatchObject({ geometry: expected, source: "computed" });
    expect(fs.counts.read).toBe(1);
    expect(await cache.getOrSubdivideAsync(stroke)).toMatchObject({ geometry: expected, source: "memory-lru" });
  });
});

describe("4. WebGPU 희소 가상 텍스처링(SVT) 16K/64K 스트리밍 · LRU · WGSL 검증", () => {
  it("16K 및 64K 가상 텍스처에서 고정 물리 아틀라스로 90% 이상 VRAM 절감을 달성한다", () => {
    const budget16k = computeSvtMemoryBudget({
      virtualWidth: 16_384,
      virtualHeight: 16_384,
      tileSize: 256,
      tileBorderPx: 2,
      physicalAtlasTilesX: 8,
      physicalAtlasTilesY: 8,
    });
    expect(budget16k.fullResidentBaseBytes).toBe(16_384 * 16_384 * 4);
    expect(budget16k.vramReductionVsBasePct).toBeGreaterThan(98);
    expect(budget16k.vramReductionVsMipChainPct).toBeGreaterThan(98);

    const budget64k = computeSvtMemoryBudget({
      virtualWidth: 65_536,
      virtualHeight: 65_536,
      tileSize: 256,
      tileBorderPx: 2,
      physicalAtlasTilesX: 16,
      physicalAtlasTilesY: 16,
    });
    expect(budget64k.vramReductionVsMipChainPct).toBeGreaterThan(99);

    // 페이지 ID & 페이지 테이블 비트 패킹 라운드트립
    const pid = packFeedbackPageId(53, 61, 3);
    expect(unpackFeedbackPageId(pid)).toEqual({ tileX: 53, tileY: 61, mipLevel: 3 });
    const entry = packPageTableEntry(7, 5, 2, true, false, 42);
    expect(unpackPageTableEntry(entry)).toEqual({
      physTileX: 7,
      physTileY: 5,
      residentMip: 2,
      resident: true,
      pinned: false,
      epoch: 42,
    });
  });

  it("초기 페이지 폴트 → 루트 밉 폴백 → 스트리밍 적재 → 재프레임 0 폴트 및 예산 초과 시 LRU 축출을 수행한다", () => {
    const svt = new SparseVirtualTextureSystem({
      virtualWidth: 16_384,
      virtualHeight: 16_384,
      tileSize: 256,
      tileBorderPx: 2,
      physicalAtlasTilesX: 4,
      physicalAtlasTilesY: 4, // 총 16 물리 슬롯 (슬롯 0 = 루트 밉 핀, 15개 스트리밍 풀)
      feedbackWidth: 32,
      feedbackHeight: 32,
      pinRootMip: true,
    });

    const viewportA = {
      minU: 0.1,
      minV: 0.1,
      spanU: 0.04,
      spanV: 0.04,
      screenWidthPx: 1024,
      screenHeightPx: 1024,
    };

    // 프레임 1: 미적재 타일 폴트 발생하되 핀된 루트 밉으로 유효한 물리 UV [0..1] 폴백
    const frame1 = svt.streamResolveFrame(viewportA, { maxUploadsPerFrame: 16 });
    expect(frame1.resolvePass.outOfBoundsUvCount).toBe(0);
    expect(frame1.resolvePass.fallbackSamples).toBe(frame1.resolvePass.totalSamples);
    expect(frame1.feedback.faultPages).toBeGreaterThan(0);
    expect(frame1.uploads.length).toBe(frame1.feedback.faultPages);

    // 프레임 2: 동일 뷰포트 재렌더 → 0 폴트, 100% 정확한 밉 히트
    const frame2 = svt.streamResolveFrame(viewportA, { maxUploadsPerFrame: 16 });
    expect(frame2.resolvePass.outOfBoundsUvCount).toBe(0);
    expect(frame2.resolvePass.exactHitSamples).toBe(frame2.resolvePass.totalSamples);
    expect(frame2.feedback.faultPages).toBe(0);
    expect(frame2.uploads.length).toBe(0);

    // 16슬롯 물리 예산을 초과하도록 여러 위치로 팬 이동 → 엄격한 LRU 축출 + 핀된 루트 밉 보존
    for (let step = 0; step < 6; step += 1) {
      svt.streamResolveFrame(
        {
          minU: 0.05 + step * 0.14,
          minV: 0.05 + step * 0.14,
          spanU: 0.045,
          spanV: 0.045,
          screenWidthPx: 1024,
          screenHeightPx: 1024,
        },
        { maxUploadsPerFrame: 16 },
      );
    }

    const metrics = svt.getMetrics();
    expect(metrics.residentSlots).toBeLessThanOrEqual(metrics.capacitySlots);
    expect(metrics.pinnedSlots).toBe(1);
    expect(metrics.cumulativeEvictions).toBeGreaterThan(0);
    const rootSlot = svt.getPhysicalSlots().find((s) => s.pinned);
    expect(rootSlot?.mipLevel).toBe(svt.maxMipLevel);
  });

  it("WGSL_SVT_PAGE_RESOLVE 셰이더 정적 검증, 64B 유니폼 패킹, WebGPU 리소스 생성을 통과한다", () => {
    const validation = validateSvtWgslShader(WGSL_SVT_PAGE_RESOLVE);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.entryPoint).toBe("svt_page_resolve_main");
    expect(validation.workgroupSize).toEqual([8, 8, 1]);
    expect(validation.hasPageTableFallbackLoop).toBe(true);
    expect(validation.hasFeedbackEmission).toBe(true);
    expect(validation.hasBorderGutterTranslation).toBe(true);

    const svt = new SparseVirtualTextureSystem({ virtualWidth: 16_384, virtualHeight: 16_384 });
    const packed = svt.packUniforms({
      minU: 0,
      minV: 0,
      spanU: 0.25,
      spanV: 0.25,
      screenWidthPx: 1024,
      screenHeightPx: 1024,
    });
    expect(packed.byteLength).toBe(SVT_UNIFORM_BYTES);
    expect(packed.desiredMip).toBe(2);

    const createdBuffers: SvtGpuBufferLike[] = [];
    const mockDevice: SvtGpuDeviceLike = {
      createShaderModule: (d) => ({ label: d.label }),
      createBuffer: (d) => {
        const b: SvtGpuBufferLike = { size: d.size, usage: d.usage, destroy: () => undefined };
        createdBuffers.push(b);
        return b;
      },
    };
    const setup = svt.createWebGpuPipelineResources(mockDevice);
    expect(createdBuffers.length).toBe(5);
    expect(setup.workgroups[0]).toBeGreaterThan(0);
    expect(setup.workgroups[1]).toBeGreaterThan(0);
  });
});
