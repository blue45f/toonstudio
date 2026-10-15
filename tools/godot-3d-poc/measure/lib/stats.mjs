/** 측정값 요약: 중앙값과 편차(MAD, 최소·최대)를 함께 낸다. 반복이 적어서 평균·표준편차 대신 중앙값 기준으로 보고한다. */
export function summarize(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  const n = numbers.length;
  if (n === 0) return { n: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  const mad = n % 2 ? deviations[(n - 1) / 2] : (deviations[n / 2 - 1] + deviations[n / 2]) / 2;
  return {
    n,
    median: round(median),
    mad: round(mad),
    min: round(sorted[0]),
    max: round(sorted[n - 1]),
  };
}

export function round(value, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 객체 배열에서 경로(점 표기)로 값을 뽑아 요약한다. */
export function summarizeBy(rows, selectors) {
  const out = {};
  for (const [name, select] of Object.entries(selectors)) {
    out[name] = summarize(rows.map((row) => select(row)));
  }
  return out;
}
