/** 보관된 픽셀 정책의 관측 진단이다. 이 기록은 하한 포기의 승인 근거가 아니며 전체 감사의 >1.15 검사는 별도로 유지한다. */
export interface ChemyPressureEnvironment { browser: string; platform: string; architecture: string }
export interface ChemyPressureMark { x: number; y: number; opacity: number; secondaryMix: number }
export interface ChemyPressurePixels {
  rgbaSha256: string; fixturePngSha256: string; histogramSha256: string;
  alphaMass: number; visiblePixels: number; opaquePixels: number; alphaAtLeast95PercentPixels: number;
}
export interface ChemyPressureBaseline {
  policy: string; contractChange: string;
  contract: { originalMinimumExclusive: number; originalMinimumRetained: boolean; approvalStatus: string };
  environment: ChemyPressureEnvironment;
  snapshot: { materialVersion: number; carrier: string; seed: number; sampleCount: number;
    rawPressures: number[]; mappedPressures: number[]; markCount: number; width: number; height: number };
  sourceSha256: { low: string; high: string }; orderedGeometrySha256: string;
  opacitySha256: { low: string; high: string };
  pixels: { low: ChemyPressurePixels; high: ChemyPressurePixels };
}
export interface ChemyPressureObservation {
  environment: ChemyPressureEnvironment; snapshot: ChemyPressureBaseline["snapshot"];
  sourceSha256: { low: string; high: string }; geometrySha256: { low: string; high: string };
  pixels: { low: ChemyPressurePixels; high: ChemyPressurePixels };
  primitive: { countLow: number; countHigh: number; proportionalityViolations: number; invalidMarks: number;
    opacitySha256: { low: string; high: string } };
  alphaMonotonicViolations: number;
}
export async function chemySha256(value: string | Uint8Array | Uint8ClampedArray): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
/** 제품 종이·도포식 복제 없이 절대 지문과 수학적 비례 관계를 별도로 검사한다. */
export async function inspectLegacyChemyPrimitives(low: readonly ChemyPressureMark[], high: readonly ChemyPressureMark[], mapped: readonly number[]) {
  let proportionalityViolations = 0, invalidMarks = 0;
  const mappingValid = Array.isArray(mapped) && mapped.length === 2 && mapped.every((n) => Number.isFinite(n) && n > 0) && mapped[1]! > mapped[0]! && Number.isFinite(mapped[1]! / mapped[0]!);
  if (!mappingValid) invalidMarks++;
  const ratio = mappingValid ? Math.sqrt(mapped[1]! / mapped[0]!) : NaN;
  // 곱셈 결과 두 개를 나누는 IEEE754 경계. 픽셀·절대 opacity 지문에는 오차를 허용하지 않는다.
  const roundoffBound = 4 * Number.EPSILON * ratio;
  for (let i = 0; i < Math.max(low.length, high.length); i++) {
    const a = low[i], b = high[i];
    if (!a || !b || ![a.opacity, b.opacity].every(Number.isFinite) || a.opacity <= 0 || b.opacity <= 0) { invalidMarks++; continue; }
    if (mappingValid && Math.abs(b.opacity / a.opacity - ratio) > roundoffBound) proportionalityViolations++;
  }
  return { countLow: low.length, countHigh: high.length, proportionalityViolations, invalidMarks,
    opacitySha256: { low: await chemySha256(JSON.stringify(low.map((m) => m.opacity))),
      high: await chemySha256(JSON.stringify(high.map((m) => m.opacity))) } };
}
export async function observeChemyPixels(rgba: Uint8ClampedArray, fixturePngSha256: string): Promise<ChemyPressurePixels> {
  if (!rgba.length || rgba.length % 4) throw new Error("matching non-empty RGBA bytes required");
  const histogram = Array<number>(256).fill(0);
  let alphaMass = 0, visiblePixels = 0;
  for (let i = 3; i < rgba.length; i += 4) { const a = rgba[i]!; histogram[a]++; alphaMass += a; if (a > 4) visiblePixels++; }
  return { rgbaSha256: await chemySha256(rgba), fixturePngSha256, histogramSha256: await chemySha256(JSON.stringify(histogram)),
    alphaMass, visiblePixels, opaquePixels: histogram[255]!, alphaAtLeast95PercentPixels: histogram.slice(243).reduce((a, b) => a + b, 0) };
}
/** 환경 미확인은 미평가 실패. 골든을 자동 생성·갱신하는 경로가 없다. */
export function checkLegacyChemyV1Pressure(actual: ChemyPressureObservation, baseline: ChemyPressureBaseline | null) {
  const failures: string[] = [];
  if (!baseline?.environment || !baseline.snapshot || !baseline.pixels?.low || !baseline.pixels?.high
    || !baseline.sourceSha256 || !baseline.opacitySha256 || !baseline.contract) {
    return { ok: false, evaluated: false, failures: ["frozen legacy baseline is missing or malformed"] };
  }
  const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
  const fingerprint = /^[0-9a-f]{64}$/u;
  check(baseline.policy === "legacy-chemy-v1-raster-and-transfer-v1", "unsupported legacy policy");
  check(baseline.contract.originalMinimumExclusive === 1.15 && baseline.contract.originalMinimumRetained === false
    && baseline.contract.approvalStatus === "owner-approved-2026-11-05", "15% waiver and approval requirement must be explicit");
  const verified = (["browser", "platform", "architecture"] as const).every((key) => actual.environment[key] === baseline.environment[key]);
  check(verified, "pixel environment unverified; Linux identity has not been established");
  check(JSON.stringify(actual.snapshot) === JSON.stringify(baseline.snapshot), "input/config/version/seed/count changed");
  check(actual.primitive.countLow === baseline.snapshot.markCount && actual.primitive.countHigh === baseline.snapshot.markCount, "primitive count changed");
  check(actual.primitive.invalidMarks === 0, "invalid primitive");
  check(actual.primitive.proportionalityViolations === 0, "sqrt-pressure relation changed");
  for (const side of ["low", "high"] as const) {
    check(fingerprint.test(baseline.sourceSha256[side]) && actual.sourceSha256[side] === baseline.sourceSha256[side], side + " source fingerprint changed");
    check(fingerprint.test(baseline.orderedGeometrySha256) && actual.geometrySha256[side] === baseline.orderedGeometrySha256, side + " ordered geometry/color changed");
    check(fingerprint.test(baseline.opacitySha256[side]) && actual.primitive.opacitySha256[side] === baseline.opacitySha256[side], side + " absolute opacity changed");
    for (const key of ["rgbaSha256", "fixturePngSha256", "histogramSha256"] as const)
      check(fingerprint.test(baseline.pixels[side][key]) && actual.pixels[side][key] === baseline.pixels[side][key], side + " " + key + " golden missing or changed");
    for (const key of ["alphaMass", "visiblePixels", "opaquePixels", "alphaAtLeast95PercentPixels"] as const)
      check(actual.pixels[side][key] === baseline.pixels[side][key], side + " " + key + " changed");
  }
  check(actual.alphaMonotonicViolations === 0, "high pressure reduced pixel alpha");
  check(actual.pixels.high.alphaMass > actual.pixels.low.alphaMass, "pressure disappeared or inverted");
  check(actual.pixels.high.alphaAtLeast95PercentPixels > actual.pixels.low.alphaAtLeast95PercentPixels, "recorded saturation ordering changed");
  const ratio = actual.pixels.high.alphaMass / Math.max(1, actual.pixels.low.alphaMass);
  return { ok: !failures.length, evaluated: verified, failures, policy: baseline.policy, aggregateRatio: ratio,
    originalMinimumExclusive: 1.15, originalAggregateGateRetained: false, originalAggregatePasses: ratio > 1.15,
    guaranteeChange: baseline.contractChange, approvalStatus: baseline.contract.approvalStatus,
    limitations: "고정 RGBA·단조성 보존이며 독립 coverage/양자화 합성 oracle가 아니다. 15% 하한을 보장하지 않는다." };
}
