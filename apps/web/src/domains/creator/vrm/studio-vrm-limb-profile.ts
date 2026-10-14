// 부위별(팔다리) 메시 둘레 실측 — 몸통 실루엣(studio-vrm-body-silhouette)이 몸통만 재던 자리를 메운다.
//
// 왜 필요한가: 소매·바짓단 반경은 지금까지 뼈 길이 비례식(윗팔 길이 × 0.19, 허벅지 길이 × 0.175)으로만
// 정해졌다. 뼈 길이가 같아도 근육량·체형 모프에 따라 실제 팔·다리 둘레는 크게 달라지므로, 볼륨이
// 커지는 체형 변경에서는 옷이 살을 파고들고 마른 체형에서는 옷만 떠 보였다. 여기서는 스킨 메시에서
// 세그먼트 축 기준 반경(둘레)을 직접 재어 링 목록으로 만들고, 재단은 그 위에 여유분만 얹는다.
//
// 설계 원칙:
//  - three 의존 0. 샘플 배열 → 링 목록 순수 함수라 노드 단위 테스트가 가능하다.
//    실제 정점 수집·좌표 변환은 StudioVrmWardrobePropsProjection이 수행한다.
//  - 이상치에 강해야 한다. 몸통 실측과 같은 이유로 반경은 최대값이 아니라 상위 분위수를 쓴다.
//  - 측정이 불가능하면 조용히 폴백한다. 프로파일이 없으면 기존 뼈 길이 재단이 그대로 쓰인다.

export const STUDIO_VRM_LIMB_PROFILE_VERSION = 1 as const;

/** 둘레를 재는 팔다리 세그먼트. 손·발은 신발/장갑 재단이 따로 있어 제외한다. */
export type LimbSegmentId = "upperArm" | "lowerArm" | "upperLeg" | "lowerLeg";

export type LimbSide = "left" | "right";

export const LIMB_SEGMENT_IDS: readonly LimbSegmentId[] = [
  "upperArm",
  "lowerArm",
  "upperLeg",
  "lowerLeg",
] as const;

export const LIMB_SIDES: readonly LimbSide[] = ["left", "right"] as const;

/** 링을 만들기 위해 필요한 최소 샘플 수. 몸통 실측과 같은 기준을 쓴다. */
const MIN_RING_SAMPLES = 6;

/** 프로파일 하나를 신뢰하기 위한 최소 실측 링 수. */
const MIN_VALID_RINGS = 2;

/** 반경 분위수. 몸통 실측과 같은 값 — 이물 하나에 링 전체가 끌려가지 않게 상위 8%를 잘라낸다. */
const RADIUS_PERCENTILE = 0.92;

const MIN_RADIUS_M = 0.01;
const MAX_RADIUS_M = 0.6;

/**
 * 세그먼트 한 위치의 단면. s는 관절(몸쪽 0) → 자식 관절(말단 1) 정규화 위치이고,
 * radiusM은 세그먼트 축에서 표면까지의 거리다. 단면이 타원이면 소매(원형 실린더)가
 * 반드시 감싸야 하므로 긴쪽 반경을 잰 값이 들어온다(측정 지점의 책임).
 */
export interface LimbProfileRing {
  s: number;
  radiusM: number;
}

/** 링 하나를 만들기 위해 넘기는 정점 하나. 세그먼트 본 로컬 좌표를 축 투영으로 바꾼 값이다. */
export interface LimbProfileSample {
  /** 관절 → 자식 관절 정규화 위치(0..1). */
  s: number;
  /** 축에서 표면까지의 거리(미터). */
  radialM: number;
}

export interface LimbSegmentProfile {
  version: typeof STUDIO_VRM_LIMB_PROFILE_VERSION;
  source: "measured";
  /** s 오름차순 링. 항상 MIN_VALID_RINGS 이상. */
  rings: readonly LimbProfileRing[];
  /** 실제로 링을 만든 정점 수. */
  sampleCount: number;
  /** rings 중 실측으로 만들어진 개수. 나머지는 이웃에서 보간한 것이다. */
  measuredRingCount: number;
}

/** 좌우 × 세그먼트 프로파일 묶음. 잴 수 없었던 세그먼트는 null이다(부분 실측 허용). */
export type LimbProfiles = Record<LimbSide, Record<LimbSegmentId, LimbSegmentProfile | null>>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampRadius(value: number): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, value));
}

function percentileOfSorted(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const p = Number.isNaN(percentile) ? 0.5 : Math.min(1, Math.max(0, percentile));
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const ratio = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * ratio;
}

/**
 * 정점 샘플 → 위치별 링. 링 수(`ringCount`)만큼 s를 균등 분할하고 각 구간의 반경은 상위 분위수로
 * 잡는다. 샘플이 부족한 구간은 이웃 링에서 채운다. 유효 링이 MIN_VALID_RINGS 미만이면 실측 실패로
 * 보고 null을 돌려준다 — 없는 둘레를 지어내느니 뼈 길이 재단이 낫다.
 */
export function buildLimbSegmentProfile(
  samples: readonly LimbProfileSample[],
  ringCount = 4,
): LimbSegmentProfile | null {
  const rings = Math.min(8, Math.max(MIN_VALID_RINGS, Math.trunc(ringCount) || 4));
  const buckets: number[][] = Array.from({ length: rings }, () => []);

  for (const sample of samples) {
    if (!isFiniteNumber(sample.s) || !isFiniteNumber(sample.radialM)) continue;
    if (sample.s < 0 || sample.s > 1 || sample.radialM < 0) continue;
    const index = Math.min(rings - 1, Math.floor(sample.s * rings));
    buckets[index].push(sample.radialM);
  }

  const measured: (LimbProfileRing | null)[] = buckets.map((bucket, index) => {
    if (bucket.length < MIN_RING_SAMPLES) return null;
    const sorted = [...bucket].sort((a, b) => a - b);
    return {
      s: (index + 0.5) / rings,
      radiusM: clampRadius(percentileOfSorted(sorted, RADIUS_PERCENTILE)),
    };
  });

  const measuredRingCount = measured.filter(Boolean).length;
  if (measuredRingCount < MIN_VALID_RINGS) return null;
  const used = buckets.reduce(
    (total, bucket) => total + (bucket.length >= MIN_RING_SAMPLES ? bucket.length : 0),
    0,
  );

  const filled: LimbProfileRing[] = measured.map((ring, index) => {
    if (ring) return ring;
    let before: LimbProfileRing | null = null;
    let after: LimbProfileRing | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (measured[i]) {
        before = measured[i];
        break;
      }
    }
    for (let i = index + 1; i < measured.length; i += 1) {
      if (measured[i]) {
        after = measured[i];
        break;
      }
    }
    const s = (index + 0.5) / rings;
    const source = before && after
      ? {
          s,
          radiusM: before.radiusM
            + (after.radiusM - before.radiusM)
              * ((s - before.s) / Math.max(1e-6, after.s - before.s)),
        }
      : (before ?? after);
    // measured가 MIN_VALID_RINGS 이상임을 위에서 확인했으므로 source는 항상 존재한다.
    return { ...source!, s };
  });

  return {
    version: STUDIO_VRM_LIMB_PROFILE_VERSION,
    source: "measured",
    rings: filled,
    sampleCount: used,
    measuredRingCount,
  };
}

/**
 * 세그먼트 본 로컬 점 하나를 둘레 샘플로 바꾼다. 축 투영 위치(s)가 구간을 조금 벗어난 정점은
 * 관절구처럼 다음 구간과 겹치는 표면이라 끝 링 재료로만 쓰고(클램프), 멀리 벗어난 정점은
 * 손·발·몸통 표면이므로 버린다 — 엉뚱한 부위가 팔 둘레를 부풀리지 않게 하는 필터다.
 * axis는 해당 본 로컬 공간의 단위 축(관절 → 자식 관절)이다.
 */
export function projectLimbSample(
  axis: readonly [number, number, number],
  len: number,
  x: number,
  y: number,
  z: number,
): LimbProfileSample | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (!(len > 0) || !Number.isFinite(len)) return null;
  const along = axis[0] * x + axis[1] * y + axis[2] * z;
  const s = along / len;
  if (!(s >= -0.05 && s <= 1.05)) return null;
  const radialSq = x * x + y * y + z * z - along * along;
  return {
    s: Math.min(1, Math.max(0, s)),
    radialM: Math.sqrt(Math.max(0, radialSq)),
  };
}

function mixRings(a: LimbProfileRing, b: LimbProfileRing, ratio: number): LimbProfileRing {
  const k = Math.min(1, Math.max(0, ratio));
  return { s: a.s + (b.s - a.s) * k, radiusM: a.radiusM + (b.radiusM - a.radiusM) * k };
}

/**
 * 임의 위치 s의 반경을 링 사이 선형 보간으로 얻는다. 범위 밖 s는 양 끝 링으로 고정(클램프)한다 —
 * 소매 끝이 실측 구간 밖으로 나가도 갑자기 0으로 수축하지 않게 한다.
 */
export function sampleLimbRadius(profile: LimbSegmentProfile, s: number): number {
  const rings = profile.rings;
  const target = isFiniteNumber(s) ? Math.min(1, Math.max(0, s)) : 0;
  if (rings.length === 0) return MIN_RADIUS_M;
  if (target <= rings[0].s) return rings[0].radiusM;
  const last = rings[rings.length - 1];
  if (target >= last.s) return last.radiusM;
  for (let index = 1; index < rings.length; index += 1) {
    const previous = rings[index - 1];
    const current = rings[index];
    if (target <= current.s) {
      const ratio = (target - previous.s) / Math.max(1e-6, current.s - previous.s);
      return mixRings(previous, current, ratio).radiusM;
    }
  }
  return last.radiusM;
}

/**
 * 구간 [fromS, toS]에서 가장 큰 반경. 소매·바짓단은 덮는 구간 전체를 감싸야 하므로 평균이 아니라
 * 최대값을 쓴다 — 가는 위치에 맞추면 굵은 위치에서 반드시 관통한다.
 */
export function maxLimbRadiusBetween(
  profile: LimbSegmentProfile,
  fromS: number,
  toS: number,
): number {
  const low = Math.min(fromS, toS);
  const high = Math.max(fromS, toS);
  let widest = Math.max(sampleLimbRadius(profile, low), sampleLimbRadius(profile, high));
  for (const ring of profile.rings) {
    if (ring.s < low || ring.s > high) continue;
    widest = Math.max(widest, ring.radiusM);
  }
  return widest;
}

/** 세그먼트 전체에서 가장 굵은 위치의 둘레(미터). 실측 영수증·핏 리포트 표기용이다. */
export function maxLimbCircumferenceM(profile: LimbSegmentProfile): number {
  if (profile.rings.length === 0) return 0;
  const widest = profile.rings.reduce((max, ring) => Math.max(max, ring.radiusM), 0);
  return 2 * Math.PI * widest;
}

function sanitizeSegmentProfile(raw: unknown): LimbSegmentProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<LimbSegmentProfile>;
  if (candidate.source !== "measured") return null;
  if (candidate.version !== STUDIO_VRM_LIMB_PROFILE_VERSION) return null;
  if (!Array.isArray(candidate.rings)) return null;
  const rings = candidate.rings
    .map((ring): LimbProfileRing | null => {
      if (!ring || typeof ring !== "object") return null;
      if (!isFiniteNumber(ring.s) || !isFiniteNumber(ring.radiusM)) return null;
      return {
        s: Math.min(1, Math.max(0, ring.s)),
        radiusM: clampRadius(ring.radiusM),
      };
    })
    .filter((ring): ring is LimbProfileRing => ring !== null)
    .sort((a, b) => a.s - b.s);
  if (rings.length < MIN_VALID_RINGS) return null;
  for (let index = 1; index < rings.length; index += 1) {
    if (rings[index].s - rings[index - 1].s < 1e-6) return null;
  }
  return {
    version: STUDIO_VRM_LIMB_PROFILE_VERSION,
    source: "measured",
    rings,
    sampleCount: isFiniteNumber(candidate.sampleCount)
      ? Math.max(0, Math.trunc(candidate.sampleCount))
      : 0,
    measuredRingCount: isFiniteNumber(candidate.measuredRingCount)
      ? Math.min(rings.length, Math.max(0, Math.trunc(candidate.measuredRingCount)))
      : rings.length,
  };
}

/**
 * 저장·전달된 프로파일 묶음을 안전 범위로 정규화한다. 세그먼트 단위로 fail-soft다 — 한쪽 팔이
 * 깨졌다고 반대쪽 다리 실측까지 버릴 이유는 없다. 잰 세그먼트가 하나도 없으면 null이다.
 */
export function sanitizeLimbProfiles(raw: unknown): LimbProfiles | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<Record<LimbSide, Partial<Record<LimbSegmentId, unknown>>>>;
  const result = {} as LimbProfiles;
  let measuredSegments = 0;
  for (const side of LIMB_SIDES) {
    const bySegment = {} as Record<LimbSegmentId, LimbSegmentProfile | null>;
    for (const segment of LIMB_SEGMENT_IDS) {
      bySegment[segment] = sanitizeSegmentProfile(candidate[side]?.[segment]);
      if (bySegment[segment]) measuredSegments += 1;
    }
    result[side] = bySegment;
  }
  return measuredSegments > 0 ? result : null;
}

/** 프로파일 묶음의 결정론적 서명 — 체형·모프 재측정 시 핏 리포트 캐시 무효화에 쓴다. */
export function limbProfilesSignature(profiles: LimbProfiles | null): string {
  if (!profiles) return "none";
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  const parts: string[] = [];
  for (const side of LIMB_SIDES) {
    for (const segment of LIMB_SEGMENT_IDS) {
      const profile = profiles[side][segment];
      parts.push(profile
        ? profile.rings.map((ring) => `${round(ring.s)}:${round(ring.radiusM)}`).join(",")
        : "-");
    }
  }
  const payload = parts.join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `limb1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
