/**
 * Wave 30B 홈(`/`) · `/tech` 최첨단 기술 실물 증명 스트립 정본 데이터 및
 * 인브라우저 실시간 하드웨어 벤치마크 엔진(마케팅 도메인 자기 완결 모듈).
 *
 * 외부 `domains/creator` 비공개 모듈에 의존하지 않으며,
 * 원시 hex/rgb/hsl 없이 OKLCH 토큰과 실측 데이터만 사용한다.
 */
import type { BilingualText } from "./flagship-showcase-data";

export type LiveTechProofId = "wasm64" | "webgpu" | "km-foley" | "bvh-npr" | "byot-c2pa";

export interface LiveTechProofMetric {
  readonly label: BilingualText;
  readonly value: BilingualText;
}

export interface LiveTechProofSpec {
  readonly id: LiveTechProofId;
  readonly index: string;
  readonly chipTitle: BilingualText;
  readonly chipStat: BilingualText;
  readonly headline: BilingualText;
  readonly measuredBasis: BilingualText;
  readonly metrics: readonly [LiveTechProofMetric, LiveTechProofMetric, LiveTechProofMetric];
  readonly ctaLabel: BilingualText;
  readonly href: string;
}

export interface ProofGallerySheetSpec {
  readonly id: "media-12" | "tips-8-km";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly badge: BilingualText;
  readonly title: BilingualText;
  readonly caption: BilingualText;
  readonly alt: BilingualText;
}

export interface BrowserTechBenchmarkResult {
  readonly wasm64: {
    readonly supported: boolean;
    readonly label: BilingualText;
  };
  readonly webgpu: {
    readonly status: "adapter" | "api-only" | "fallback";
    readonly label: BilingualText;
  };
  readonly displayP3: {
    readonly supported: boolean;
    readonly label: BilingualText;
  };
  readonly kubelkaMunk: {
    readonly elapsedMs: number;
    readonly iterations: number;
    readonly mixedOklch: string;
    readonly greenDominant: boolean;
    readonly peakWavelengthNm: number;
  };
}

export const LIVE_TECH_PROOFS: readonly LiveTechProofSpec[] = [
  {
    id: "wasm64",
    index: "01",
    chipTitle: { ko: "Rust + Wasm64 (memory64)", en: "Rust + Wasm64 (memory64)" },
    chipStat: { ko: "512² 언샤프 2.80ms · >4GiB 타일", en: "512² Unsharp 2.80ms · >4GiB Tiles" },
    headline: {
      ko: "512² 언샤프 2.80ms · >4GiB 가상 타일 · 30× 베지어 벡터라이징",
      en: "512² Unsharp 2.80ms · >4GiB Virtual Tiles · 30× Bézier Vectorizing",
    },
    measuredBasis: {
      ko: "브라우저 내 64비트 메모리 공간(memory64)으로 초대형 세로 스크롤 원고와 다중 레이어를 끊김 없이 연산합니다.",
      en: "Runs 64-bit in-browser memory64 virtual tiles so massive tall webtoon scrolls stay fast without paging stalls.",
    },
    metrics: [
      { label: { ko: "512² 언샤프 필터", en: "512² Unsharp Filter" }, value: { ko: "2.80ms", en: "2.80ms" } },
      { label: { ko: "memory64 가상 타일", en: "memory64 Virtual Tile" }, value: { ko: ">4GiB", en: ">4GiB" } },
      { label: { ko: "베지어 벡터라이징", en: "Bézier Vectorizing" }, value: { ko: "30× 가속", en: "30× Faster" } },
    ],
    ctaLabel: { ko: "Wasm64 아키텍처 보기", en: "Inspect Wasm64 Architecture" },
    href: "/tech",
  },
  {
    id: "webgpu",
    index: "02",
    chipTitle: { ko: "WebGPU 제로카피 4셰이더", en: "WebGPU Zero-Copy 4 Shaders" },
    chipStat: { ko: "p95 <= 2.59ms · 복사 0회", en: "p95 <= 2.59ms · 0 Copies" },
    headline: {
      ko: "12종 혼합·10필터·500오브젝트·8인 CRDT p95 <= 2.59ms · 복사 0회",
      en: "12 Blends · 10 Filters · 500 Objects · 8-User CRDT p95 <= 2.59ms · 0 Copies",
    },
    measuredBasis: {
      ko: "4개 WGSL 셰이더 패스가 GPU 스토리지 버퍼를 CPU 복귀 없이 직접 공유해 고부하 다인 협업 프레임도 2.59ms 이내로 마감합니다.",
      en: "Four WGSL passes share GPU storage buffers with zero CPU readback copies, holding p95 <= 2.59ms under full 8-user CRDT load.",
    },
    metrics: [
      { label: { ko: "복합 워크로드 p95", en: "Composite Workload p95" }, value: { ko: "<= 2.59ms", en: "<= 2.59ms" } },
      { label: { ko: "CPU↔GPU 버퍼 복사", en: "CPU↔GPU Buffer Copy" }, value: { ko: "복사 0회", en: "0 Copies" } },
      { label: { ko: "동시 파이프라인", en: "Concurrent Pipeline" }, value: { ko: "12혼합·10필터·500개·8인", en: "12 Blends · 10 Filters · 500 Obj · 8 CRDT" } },
    ],
    ctaLabel: { ko: "WebGPU 파이프라인 보기", en: "Inspect WebGPU Pipeline" },
    href: "/tech",
  },
  {
    id: "km-foley",
    index: "03",
    chipTitle: { ko: "Kubelka-Munk & 슥삭 Foley", en: "Kubelka-Munk & Nib Foley" },
    chipStat: { ko: "16파장 초록 혼색 · 오차 0.0000", en: "16-Band Green Mix · Error 0.0000" },
    headline: {
      ko: "16파장 파랑+노랑=선명한 초록 · 1,200획 라이브=커밋 오차 0.0000",
      en: "16-Band Blue+Yellow=Vivid Green · 1,200 Strokes Live=Commit Error 0.0000",
    },
    measuredBasis: {
      ko: "400–700nm 16파장 분광 반사율 계산과 속도 감응 슥삭 필기음(Foley)을 결합했고, 1,200획 연속 테스트에서 실시간·커밋 픽셀 오차 0.0000을 실측했습니다.",
      en: "Combines 16-band (400–700nm) optical reflectance mixing with velocity-reactive nib Foley, proven at 0.0000 live-vs-commit pixel error across 1,200 strokes.",
    },
    metrics: [
      { label: { ko: "분광 광학 혼색", en: "Spectral Optical Mix" }, value: { ko: "16파장 초록", en: "16-Band Green" } },
      { label: { ko: "1,200획 라이브=커밋", en: "1,200-Stroke Parity" }, value: { ko: "오차 0.0000", en: "Error 0.0000" } },
      { label: { ko: "30× 4,000px 피크 메모리", en: "30× 4,000px Peak RAM" }, value: { ko: "64.0 MiB", en: "64.0 MiB" } },
    ],
    ctaLabel: { ko: "실물 브러시 캔버스 열기", en: "Open Physical Brush Canvas" },
    href: "/studio/canvas",
  },
  {
    id: "bvh-npr",
    index: "04",
    chipTitle: { ko: "3D Wasm64 BVH · NPR", en: "3D Wasm64 BVH · NPR" },
    chipStat: { ko: "1,000소품 → 10콜 · ΔE 0.60", en: "1,000 Props → 10 Calls · ΔE 0.60" },
    headline: {
      ko: "1,000소품 → 10 드로우콜(99% 절감) · 2D↔3D 색감 ΔE 54.35 → 0.60",
      en: "1,000 Props → 10 Draw Calls (99% Cut) · 2D↔3D Color ΔE 54.35 → 0.60",
    },
    measuredBasis: {
      ko: "Wasm64 BVH 가속·인스턴싱으로 1,000개 배경 소품을 10회 드로우콜로 압축하고, 2D 원고 팔레트 정합으로 색감 오차를 ΔE 0.60까지 낮춥니다.",
      en: "Wasm64 BVH culling and instancing collapse 1,000 scene props into 10 draw calls while palette calibration tightens 2D↔3D color match to ΔE 0.60.",
    },
    metrics: [
      { label: { ko: "1,000소품 드로우콜", en: "1,000-Prop Draw Calls" }, value: { ko: "10회 (99% 절감)", en: "10 Calls (99% Cut)" } },
      { label: { ko: "2D↔3D 색감 오차", en: "2D↔3D Color Distance" }, value: { ko: "ΔE 54.35 → 0.60", en: "ΔE 54.35 → 0.60" } },
      { label: { ko: "가변 윤곽선 NPR", en: "Variable Ink NPR" }, value: { ko: "Wasm64 BVH", en: "Wasm64 BVH" } },
    ],
    ctaLabel: { ko: "3D NPR 장면 시작하기", en: "Start 3D NPR Scene" },
    href: "/create",
  },
  {
    id: "byot-c2pa",
    index: "05",
    chipTitle: { ko: "BYOT · C2PA · 7대 출고", en: "BYOT · C2PA · 7-Platform Export" },
    chipStat: { ko: "양방향 연동 · C2PA 2.1 · 7대 플랫폼", en: "Round-Trip · C2PA 2.1 · 7 Platforms" },
    headline: {
      ko: "CSP/Photoshop/Jira/Slack 양방향 · C2PA 2.1 · 7대 플랫폼 원클릭",
      en: "CSP/Photoshop/Jira/Slack Round-Trip · C2PA 2.1 · 7-Platform One-Click",
    },
    measuredBasis: {
      ko: "기존 작화·일정 도구를 강제로 버리지 않고 양방향으로 연결하며, C2PA 2.1 창작 진위 서명과 7대 연재 플랫폼 규격 슬라이스를 한 번에 마칩니다.",
      en: "Bridges Clip Studio Paint, Photoshop, Jira, and Slack bidirectionally, then signs C2PA 2.1 provenance and slices for 7 platforms in one click.",
    },
    metrics: [
      { label: { ko: "개방형 양방향 BYOT", en: "Open BYOT Round-Trip" }, value: { ko: "CSP·PSD·Jira·Slack", en: "CSP · PSD · Jira · Slack" } },
      { label: { ko: "창작 진위 서명", en: "Provenance Signing" }, value: { ko: "C2PA 2.1", en: "C2PA 2.1" } },
      { label: { ko: "원클릭 규격 출고", en: "One-Click Export" }, value: { ko: "7대 플랫폼", en: "7 Platforms" } },
    ],
    ctaLabel: { ko: "도구 비교·호환 보기", en: "Compare Tools & BYOT" },
    href: "/compare/studio",
  },
] as const;

export const PROOF_GALLERY_SHEETS: readonly ProofGallerySheetSpec[] = [
  {
    id: "media-12",
    src: "/showcase/brush-12media-proof.webp",
    width: 1660,
    height: 1546,
    badge: { ko: "실물 렌더링 · 12대 매체 · 194종 검증", en: "Real Engine Render · 12 Media · 194 Audited" },
    title: {
      ko: "12대 매체 필압(0.22 / 0.55 / 0.92) · 갈필(0→2,400px) 검증 시트",
      en: "12-Media Pressure (0.22 / 0.55 / 0.92) & Dryout (0→2,400px) Proof Sheet",
    },
    caption: {
      ko: "연필·크레파스·목탄·파스텔·G펜·수채·48돈모 유화·아크릴 과슈·마커·에어브러시·찰필·떡지우개 12대 매체를 엔진으로 직접 뽑은 필압·갈필 실측 시트입니다.",
      en: "Direct engine output across 12 physical media — graphite pencil, wax crayon, charcoal, pastel, G-pen, watercolor, 48-bristle oil, gouache, marker, airbrush, stump, and kneaded eraser.",
    },
    alt: {
      ko: "ToonStudio 12대 매체 브러시 저·중·고 필압 및 갈필 실물 렌더링 검증 시트",
      en: "ToonStudio 12-media physical brush pressure and dryout verification sheet",
    },
  },
  {
    id: "tips-8-km",
    src: "/showcase/brush-8tips-km-proof.webp",
    width: 1280,
    height: 940,
    badge: { ko: "128×128 8종 팁 아틀라스 · 16파장 광학 혼색", en: "128×128 8-Tip Atlas · 16-Band Optical Mix" },
    title: {
      ko: "실물 8종 128×128 팁 아틀라스 · Kubelka-Munk 16파장 vs sRGB 혼색 시트",
      en: "Real-Media 8-Tip 128×128 Atlas & 16-Band Kubelka-Munk vs sRGB Sheet",
    },
    caption: {
      ko: "1,200획 연속 테스트(피크 64.0 MiB · 오차 0.0000)와 16파장 Kubelka-Munk 파랑+노랑=초록 광학 혼색 대 일반 sRGB 겹침 비교를 실물로 증명합니다.",
      en: "Verifies 8 mipmapped physical tips over 1,200 strokes (64.0 MiB peak, 0.0000 parity error) alongside 16-band Kubelka-Munk blue+yellow emerald mix vs muddy sRGB overlap.",
    },
    alt: {
      ko: "ToonStudio 실물 8종 128x128 팁 아틀라스와 Kubelka-Munk 16파장 광학 혼색 비교 시트",
      en: "ToonStudio real-media 8-tip 128x128 atlas and Kubelka-Munk 16-band spectral mix proof sheet",
    },
  },
] as const;

// 16파장(400~700nm, 20nm 간격) CIE D65 및 코발트 블루·카드뮴 옐로 반사율 곡선
const KM_BANDS = 16;
const KM_WAVELENGTH_START_NM = 400;
const KM_WAVELENGTH_STEP_NM = 20;
const CIE_XBAR = [0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544, 0.4479, 0.1649, 0.0468, 0.0114];
const CIE_YBAR = [0.0004, 0.004, 0.023, 0.06, 0.139, 0.323, 0.71, 0.954, 0.995, 0.87, 0.631, 0.381, 0.175, 0.061, 0.017, 0.0041];
const CIE_ZBAR = [0.0679, 0.6456, 1.7471, 1.6692, 0.813, 0.272, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002, 0, 0, 0, 0];
const CIE_D65 = [82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 107.69, 104.05, 96.33, 90.01, 87.7, 83.7, 80.03, 78.28, 71.61];
const COBALT_BLUE_R = [0.8, 0.88, 0.92, 0.86, 0.48, 0.3, 0.22, 0.12, 0.032, 0.018, 0.016, 0.016, 0.018, 0.02, 0.022, 0.025];
const CADMIUM_YELLOW_R = [0.022, 0.022, 0.024, 0.028, 0.052, 0.48, 0.9, 0.96, 0.97, 0.97, 0.97, 0.97, 0.96, 0.96, 0.95, 0.95];
const SCATTER_BLUE = 0.65;
const SCATTER_YELLOW = 1.05;

function buildAbsorptionK(reflectance: readonly number[], scatter: number): Float64Array {
  const out = new Float64Array(KM_BANDS);
  for (let i = 0; i < KM_BANDS; i += 1) {
    const r = reflectance[i] ?? 0.5;
    out[i] = (scatter * (1 - r) * (1 - r)) / (2 * r);
  }
  return out;
}

const K_BLUE = buildAbsorptionK(COBALT_BLUE_R, SCATTER_BLUE);
const K_YELLOW = buildAbsorptionK(CADMIUM_YELLOW_R, SCATTER_YELLOW);
const SPEC_TO_LIN_R = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_G = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_B = new Float64Array(KM_BANDS);

(function initSpectralWeights(): void {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    sx += (CIE_XBAR[i] ?? 0) * d;
    sy += (CIE_YBAR[i] ?? 0) * d;
    sz += (CIE_ZBAR[i] ?? 0) * d;
  }
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    const wx = ((CIE_XBAR[i] ?? 0) * d * 0.95047) / sx;
    const wy = ((CIE_YBAR[i] ?? 0) * d) / sy;
    const wz = ((CIE_ZBAR[i] ?? 0) * d * 1.08883) / sz;
    SPEC_TO_LIN_R[i] = 3.2404542 * wx - 1.5371385 * wy - 0.4985314 * wz;
    SPEC_TO_LIN_G[i] = -0.969266 * wx + 1.8760108 * wy + 0.041556 * wz;
    SPEC_TO_LIN_B[i] = 0.0556434 * wx - 0.2040259 * wy + 1.0572252 * wz;
  }
})();

function linearTripletToOklch(rIn: number, gIn: number, bIn: number): string {
  const r = Math.max(0, Math.min(1, rIn));
  const g = Math.max(0, Math.min(1, gIn));
  const b = Math.max(0, Math.min(1, bIn));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bAxis);
  const hue = ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360;
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

export function runKubelkaMunk16BandBenchmark(iterations = 2000): BrowserTechBenchmarkResult["kubelkaMunk"] {
  const safeIters = Math.max(1, Math.floor(iterations));
  const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
  const startMs = now();
  let lastR = 0;
  let lastG = 0;
  let lastB = 0;
  let peakBand = 6;

  for (let iter = 0; iter < safeIters; iter += 1) {
    const ratio = 0.5 + ((iter % 7) - 3) * 0.001;
    const wBlue = 1 - ratio;
    const wYellow = ratio;
    const invS = 1 / (wBlue * SCATTER_BLUE + wYellow * SCATTER_YELLOW);
    let linR = 0;
    let linG = 0;
    let linB = 0;
    let maxRefl = -1;
    let maxIdx = 0;
    for (let i = 0; i < KM_BANDS; i += 1) {
      const u = (wBlue * (K_BLUE[i] ?? 0) + wYellow * (K_YELLOW[i] ?? 0)) * invS;
      const refl = 1 + u - Math.sqrt(u * u + 2 * u + 1e-12);
      if (refl > maxRefl) {
        maxRefl = refl;
        maxIdx = i;
      }
      linR += (SPEC_TO_LIN_R[i] ?? 0) * refl;
      linG += (SPEC_TO_LIN_G[i] ?? 0) * refl;
      linB += (SPEC_TO_LIN_B[i] ?? 0) * refl;
    }
    lastR = linR;
    lastG = linG;
    lastB = linB;
    peakBand = maxIdx;
  }

  const elapsedMs = Math.max(0.01, Number((now() - startMs).toFixed(2)));
  return {
    elapsedMs,
    iterations: safeIters,
    mixedOklch: linearTripletToOklch(lastR, lastG, lastB),
    greenDominant: lastG > lastR && lastG > lastB,
    peakWavelengthNm: KM_WAVELENGTH_START_NM + peakBand * KM_WAVELENGTH_STEP_NM,
  };
}

function probeWasm64Support(): boolean {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.Memory !== "function" || typeof BigInt !== "function") {
    return false;
  }
  try {
    const MemoryCtor = WebAssembly.Memory as unknown as new (descriptor: {
      readonly initial: bigint;
      readonly maximum: bigint;
      readonly address: "i64";
    }) => WebAssembly.Memory;
    const memory = new MemoryCtor({ initial: BigInt(1), maximum: BigInt(2), address: "i64" });
    return Boolean(memory && memory.buffer && memory.buffer.byteLength >= 65536);
  } catch {
    return false;
  }
}

interface WebGpuCapableNavigator {
  readonly gpu?: {
    readonly requestAdapter?: () => Promise<unknown>;
  };
}

async function probeWebGpuSupport(): Promise<"adapter" | "api-only" | "fallback"> {
  if (typeof navigator === "undefined") return "fallback";
  const nav: WebGpuCapableNavigator = navigator;
  const gpu = nav.gpu;
  if (!gpu) return "fallback";
  if (typeof gpu.requestAdapter !== "function") return "api-only";
  try {
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((resolve) => {
        globalThis.setTimeout(() => resolve(null), 900);
      }),
    ]);
    return adapter ? "adapter" : "api-only";
  } catch {
    return "api-only";
  }
}

function probeDisplayP3Support(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(color-gamut: p3)").matches;
  } catch {
    return false;
  }
}

export async function runLiveBrowserTechBenchmark(): Promise<BrowserTechBenchmarkResult> {
  const wasm64Supported = probeWasm64Support();
  const displayP3Supported = probeDisplayP3Support();
  const kubelkaMunk = runKubelkaMunk16BandBenchmark(2000);
  const webgpuStatus = await probeWebGpuSupport();

  return {
    wasm64: {
      supported: wasm64Supported,
      label: wasm64Supported
        ? { ko: "네이티브 memory64 지원", en: "Native memory64 Ready" }
        : { ko: "32-bit Wasm 안전 폴백", en: "32-bit Wasm Safe Fallback" },
    },
    webgpu: {
      status: webgpuStatus,
      label:
        webgpuStatus === "adapter"
          ? { ko: "WebGPU GPU 어댑터 활성", en: "WebGPU Adapter Active" }
          : webgpuStatus === "api-only"
            ? { ko: "WebGPU API 감지 (폴백)", en: "WebGPU API Present (Fallback)" }
            : { ko: "Canvas2D / WebGL2 폴백", en: "Canvas2D / WebGL2 Fallback" },
    },
    displayP3: {
      supported: displayP3Supported,
      label: displayP3Supported
        ? { ko: "Display-P3 광색역 활성", en: "Display-P3 Wide Gamut" }
        : { ko: "sRGB 표준 색역", en: "Standard sRGB Gamut" },
    },
    kubelkaMunk,
  };
}
