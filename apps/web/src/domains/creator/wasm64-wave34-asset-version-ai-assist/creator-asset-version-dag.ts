/**
 * Wasm64 Wave 34: 크리에이터 공유 에셋 콘텐츠 주소(FNV-1a 64-bit) 기반 불변 스냅샷 DAG,
 * 회차별 Lockfile 버전 핀 고정·롤백 및 출고 전 Rights BOM 계보 검증 엔진 (`creator-asset-version-dag`).
 *
 * - 객체 속성 순서에 무관한 구조적 정규화 문자열 위에 표준 64-bit FNV-1a 해시를 계산해
 *   불변 콘텐츠 주소(`cas-fnv64:<16자리-hex>`)를 부여하고 `Object.freeze`로 변조를 봉쇄한다.
 * - 회차(Episode)별 Lockfile 의미론으로 공용 캐릭터 의상이 `2.0.0`으로 갱신되어도 기존 마감 회차는
 *   `1.0.0` 스냅샷을 유지하고 신규 회차만 선택 마이그레이션한다.
 * - 최소 공통 조상(LCA) 기반 3-way 병합과 출고 전 하위 의존성·조상 파생 계보 Rights BOM을 전수 검증한다.
 */

export type CreatorSharedAssetKind =
  | "character-sheet"
  | "background-prop"
  | "custom-brush-pack"
  | "lettering-style";

export type AssetAttributePrimitive = string | number | boolean | null;
export type AssetAttributeValue =
  | AssetAttributePrimitive
  | readonly AssetAttributeValue[]
  | { readonly [key: string]: AssetAttributeValue };

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface AssetDependencyPin {
  readonly assetId: string;
  readonly pinnedAddress: string;
  readonly semver: string;
}

export type CommercialUseRight = "allowed" | "prohibited" | "unknown";

/** 에셋 스냅샷에 결합되는 권리·라이선스 명세 (Rights BOM 원천 레코드). */
export interface AssetRightsRecord {
  readonly licenseId: string;
  readonly rightsholder: string;
  readonly commercialUse: CommercialUseRight;
  readonly attributionRequired: boolean;
  readonly attributionText?: string;
  readonly derivativeAllowed?: boolean;
  readonly expiresAtIso?: string;
}

/** 불변 에셋 스냅샷 DAG 노드. */
export interface CreatorAssetSnapshot {
  readonly contentAddress: string;
  readonly assetId: string;
  readonly kind: CreatorSharedAssetKind;
  readonly semver: string;
  readonly parentAddresses: readonly string[];
  readonly authorId: string;
  readonly createdAtIso: string;
  readonly summaryKo: string;
  readonly attributes: Readonly<Record<string, AssetAttributeValue>>;
  readonly dependencies: readonly AssetDependencyPin[];
  readonly rights: AssetRightsRecord;
}

export interface CommitAssetSnapshotInput {
  readonly assetId: string;
  readonly kind: CreatorSharedAssetKind;
  readonly semver: string;
  readonly parentAddresses?: readonly string[];
  readonly authorId: string;
  readonly createdAtIso: string;
  readonly summaryKo: string;
  readonly attributes: Readonly<Record<string, AssetAttributeValue>>;
  readonly dependencies?: readonly AssetDependencyPin[];
  readonly rights: AssetRightsRecord;
}

export type EpisodeUpgradePolicy = "frozen" | "patch-only" | "minor-compatible";
export type EpisodePublicationState = "in-progress" | "locked-published";

export interface EpisodeAssetPin {
  readonly assetId: string;
  readonly contentAddress: string;
  readonly semver: string;
  readonly upgradePolicy: EpisodeUpgradePolicy;
  readonly previousAddresses: readonly string[];
}

export interface EpisodeAssetLockfile {
  readonly episodeId: string;
  readonly state: EpisodePublicationState;
  readonly updatedAtIso: string;
  readonly pins: Readonly<Record<string, EpisodeAssetPin>>;
  readonly lockfileDigest: string;
}

export interface UpgradeEpisodePinOptions {
  readonly targetSemver?: string;
  readonly allowMajorBreaking?: boolean;
  readonly forceUnlockPublished?: boolean;
  readonly updatedAtIso: string;
}

export interface AssetMergeConflict {
  readonly path: string;
  readonly baseValue: AssetAttributeValue | undefined;
  readonly oursValue: AssetAttributeValue | undefined;
  readonly theirsValue: AssetAttributeValue | undefined;
  readonly reasonKo: string;
}

export type ConflictResolutionChoice =
  | { readonly strategy: "ours" }
  | { readonly strategy: "theirs" }
  | { readonly strategy: "custom"; readonly value: AssetAttributeValue };

export interface ThreeWayMergeReport {
  readonly assetId: string;
  readonly baseAddress: string | null;
  readonly oursAddress: string;
  readonly theirsAddress: string;
  readonly canAutoCommit: boolean;
  readonly mergedAttributes: Readonly<Record<string, AssetAttributeValue>>;
  readonly mergedDependencies: readonly AssetDependencyPin[];
  readonly conflicts: readonly AssetMergeConflict[];
  readonly summaryKo: string;
}

export type RightsBomViolationKind =
  | "commercial-use-prohibited"
  | "unverified-commercial-rights"
  | "missing-required-attribution"
  | "unauthorized-derivative-work"
  | "expired-license"
  | "missing-snapshot-node";

export interface RightsBomViolation {
  readonly rootAssetId: string;
  readonly offendingAssetId: string;
  readonly offendingAddress: string;
  readonly offendingSemver: string;
  readonly relation: "direct-pin" | "transitive-dependency" | "ancestor-lineage";
  readonly violationKind: RightsBomViolationKind;
  readonly licenseId: string;
  readonly messageKo: string;
}

export interface EpisodeRightsBomReport {
  readonly episodeId: string;
  readonly readyForCommercialRelease: boolean;
  readonly scannedSnapshotCount: number;
  readonly requiredAttributions: readonly string[];
  readonly violations: readonly RightsBomViolation[];
  readonly bomDigest: string;
  readonly summaryKo: string;
}

const FNV1A_64_OFFSET_BASIS = BigInt("0xcbf29ce484222325");
const FNV1A_64_PRIME = BigInt("0x00000100000001b3");
const FNV1A_64_MASK = BigInt("0xffffffffffffffff");
const UTF8_ENCODER = new TextEncoder();

/** UTF-8 바이트 열에 대한 표준 64-bit FNV-1a 해시를 16자리 소문자 16진수로 반환한다. */
export function computeFnv1a64Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? UTF8_ENCODER.encode(input) : input;
  let hash = FNV1A_64_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i] ?? 0);
    hash = (hash * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 객체 키 사전순 정렬, `-0` 정규화, 배열 순서 보존으로 결정론적 JSON 문자열을 생성한다. */
export function canonicalizeStructure(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`정규화 해시에 비유한 수치(${String(value)}) 불가`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeStructure(item)).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeStructure(rec[k])}`).join(",")}}`;
  }
  throw new Error(`지원하지 않는 정규화 대상 타입: ${typeof value}`);
}

/** `"v1.2.3"` 또는 `"1.2.3"` 문자열을 파싱한다. */
export function parseSemVer(raw: string): ParsedSemVer {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim().replace(/^v/i, ""));
  if (!match) throw new Error(`유효하지 않은 시맨틱 버전 형식입니다: ${raw}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** 시맨틱 버전을 표준 `"major.minor.patch"` 형식으로 정규화한다. */
export function normalizeSemVerString(raw: string): string {
  const p = parseSemVer(raw);
  return `${p.major}.${p.minor}.${p.patch}`;
}

/** 두 시맨틱 버전을 비교한다 (`a < b` 음수, 동일 `0`, `a > b` 양수). */
export function compareSemVer(a: string, b: string): number {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  return pa.major !== pb.major ? pa.major - pb.major : pa.minor !== pb.minor ? pa.minor - pb.minor : pa.patch - pb.patch;
}

/** 에셋의 본질적 콘텐츠로부터 불변 콘텐츠 주소를 계산한다. */
export function computeAssetContentAddress(input: {
  readonly assetId: string;
  readonly kind: CreatorSharedAssetKind;
  readonly semver: string;
  readonly parentAddresses: readonly string[];
  readonly attributes: Readonly<Record<string, AssetAttributeValue>>;
  readonly dependencies: readonly AssetDependencyPin[];
  readonly rights: AssetRightsRecord;
}): string {
  const sortedDeps = [...input.dependencies].sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
  const payload = canonicalizeStructure({
    schema: "toonstudio-cas-v1",
    assetId: input.assetId,
    kind: input.kind,
    semver: normalizeSemVerString(input.semver),
    parentAddresses: [...input.parentAddresses],
    attributes: input.attributes,
    dependencies: sortedDeps,
    rights: {
      licenseId: input.rights.licenseId,
      rightsholder: input.rights.rightsholder,
      commercialUse: input.rights.commercialUse,
      attributionRequired: input.rights.attributionRequired,
      attributionText: input.rights.attributionText ?? "",
      derivativeAllowed: input.rights.derivativeAllowed ?? true,
      expiresAtIso: input.rights.expiresAtIso ?? "",
    },
  });
  return `cas-fnv64:${computeFnv1a64Hex(payload)}`;
}

function deepCloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCloneAndFreeze(item))) as unknown as T;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (src[key] !== undefined) out[key] = deepCloneAndFreeze(src[key]);
  }
  return Object.freeze(out) as T;
}

function computeLockfileDigest(
  episodeId: string,
  state: EpisodePublicationState,
  pins: Readonly<Record<string, EpisodeAssetPin>>,
): string {
  return `lock-fnv64:${computeFnv1a64Hex(canonicalizeStructure({ episodeId, state, pins }))}`;
}

function isPlainRecord(val: AssetAttributeValue | undefined): val is { readonly [key: string]: AssetAttributeValue } {
  return val !== null && val !== undefined && typeof val === "object" && !Array.isArray(val);
}

function mergeAttributeObjectsThreeWay(
  baseObj: Readonly<Record<string, AssetAttributeValue>>,
  oursObj: Readonly<Record<string, AssetAttributeValue>>,
  theirsObj: Readonly<Record<string, AssetAttributeValue>>,
  prefix: string,
  conflicts: AssetMergeConflict[],
  resolutions: Readonly<Record<string, ConflictResolutionChoice>>,
): Readonly<Record<string, AssetAttributeValue>> {
  const allKeys = [...new Set([...Object.keys(baseObj), ...Object.keys(oursObj), ...Object.keys(theirsObj)])].sort();
  const merged: Record<string, AssetAttributeValue> = {};

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const baseVal = baseObj[key];
    const oursVal = oursObj[key];
    const theirsVal = theirsObj[key];
    const baseC = baseVal === undefined ? "__U__" : canonicalizeStructure(baseVal);
    const oursC = oursVal === undefined ? "__U__" : canonicalizeStructure(oursVal);
    const theirsC = theirsVal === undefined ? "__U__" : canonicalizeStructure(theirsVal);

    if (oursC === theirsC || theirsC === baseC) {
      if (oursVal !== undefined) merged[key] = deepCloneAndFreeze(oursVal);
      continue;
    }
    if (oursC === baseC) {
      if (theirsVal !== undefined) merged[key] = deepCloneAndFreeze(theirsVal);
      continue;
    }
    if (isPlainRecord(oursVal) && isPlainRecord(theirsVal) && (baseVal === undefined || isPlainRecord(baseVal))) {
      merged[key] = mergeAttributeObjectsThreeWay(baseVal ?? {}, oursVal, theirsVal, path, conflicts, resolutions);
      continue;
    }

    const manual = resolutions[path];
    if (manual) {
      const chosen = manual.strategy === "ours" ? oursVal : manual.strategy === "theirs" ? theirsVal : manual.value;
      if (chosen !== undefined) merged[key] = deepCloneAndFreeze(chosen);
      continue;
    }

    conflicts.push({
      path,
      baseValue: baseVal,
      oursValue: oursVal,
      theirsValue: theirsVal,
      reasonKo: `속성 '${path}'가 양쪽 브랜치에서 상이한 값으로 동시 변경되었습니다.`,
    });
    if (oursVal !== undefined) merged[key] = deepCloneAndFreeze(oursVal);
  }
  return Object.freeze(merged);
}

/** 크리에이터 공유 에셋의 불변 스냅샷 DAG 저장소 및 회차 Lockfile·Rights BOM 관리 엔진. */
export class CreatorAssetVersionDag {
  private readonly snapshotsByAddress = new Map<string, CreatorAssetSnapshot>();
  private readonly addressesByAssetSemver = new Map<string, Map<string, string>>();

  /** 새로운 불변 에셋 스냅샷을 검증·동결하여 DAG에 커밋한다. */
  public commitSnapshot(input: CommitAssetSnapshotInput): CreatorAssetSnapshot {
    const normalizedSemver = normalizeSemVerString(input.semver);
    const parents = [...(input.parentAddresses ?? [])];
    const dependencies = [...(input.dependencies ?? [])].sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));

    for (const parentAddr of parents) {
      const pSnap = this.snapshotsByAddress.get(parentAddr);
      if (!pSnap) throw new Error(`존재하지 않는 부모 스냅샷 주소입니다: ${parentAddr}`);
      if (pSnap.assetId !== input.assetId) {
        throw new Error(`부모 스냅샷(${pSnap.assetId})과 자식 에셋(${input.assetId})의 식별자가 다릅니다.`);
      }
    }
    for (const dep of dependencies) {
      const dSnap = this.snapshotsByAddress.get(dep.pinnedAddress);
      if (!dSnap || dSnap.assetId !== dep.assetId) {
        throw new Error(`유효하지 않은 하위 의존성 스냅샷 참조입니다: ${dep.assetId}@${dep.pinnedAddress}`);
      }
    }

    const contentAddress = computeAssetContentAddress({
      assetId: input.assetId,
      kind: input.kind,
      semver: normalizedSemver,
      parentAddresses: parents,
      attributes: input.attributes,
      dependencies,
      rights: input.rights,
    });
    if (parents.includes(contentAddress)) {
      throw new Error(`자기 자신을 부모로 참조하는 순환 스냅샷은 허용되지 않습니다: ${contentAddress}`);
    }

    let versionMap = this.addressesByAssetSemver.get(input.assetId);
    if (!versionMap) {
      versionMap = new Map<string, string>();
      this.addressesByAssetSemver.set(input.assetId, versionMap);
    }
    const existingAddr = versionMap.get(normalizedSemver);
    if (existingAddr && existingAddr !== contentAddress) {
      throw new Error(`에셋 '${input.assetId}' 버전 ${normalizedSemver}은 이미 다른 주소(${existingAddr})로 잠겨 있습니다.`);
    }
    const existingSnapshot = this.snapshotsByAddress.get(contentAddress);
    if (existingSnapshot) return existingSnapshot;

    const frozen = deepCloneAndFreeze<CreatorAssetSnapshot>({
      contentAddress,
      assetId: input.assetId,
      kind: input.kind,
      semver: normalizedSemver,
      parentAddresses: parents,
      authorId: input.authorId,
      createdAtIso: input.createdAtIso,
      summaryKo: input.summaryKo,
      attributes: input.attributes,
      dependencies,
      rights: { ...input.rights, derivativeAllowed: input.rights.derivativeAllowed ?? true },
    });
    this.snapshotsByAddress.set(contentAddress, frozen);
    versionMap.set(normalizedSemver, contentAddress);
    return frozen;
  }

  public getSnapshotByAddress(contentAddress: string): CreatorAssetSnapshot | undefined {
    return this.snapshotsByAddress.get(contentAddress);
  }

  public getSnapshotByVersion(assetId: string, semver: string): CreatorAssetSnapshot | undefined {
    const addr = this.addressesByAssetSemver.get(assetId)?.get(normalizeSemVerString(semver));
    return addr ? this.snapshotsByAddress.get(addr) : undefined;
  }

  public listAssetVersions(assetId: string): readonly CreatorAssetSnapshot[] {
    const versionMap = this.addressesByAssetSemver.get(assetId);
    if (!versionMap) return [];
    return [...versionMap.entries()]
      .sort(([vA], [vB]) => compareSemVer(vA, vB))
      .map(([, addr]) => this.snapshotsByAddress.get(addr))
      .filter((s): s is CreatorAssetSnapshot => s !== undefined);
  }

  /** 두 스냅샷 주소 간의 최소 공통 조상(LCA) 주소를 탐색한다. */
  public findLowestCommonAncestor(addressA: string, addressB: string): string | null {
    if (!this.snapshotsByAddress.has(addressA) || !this.snapshotsByAddress.has(addressB)) return null;
    if (addressA === addressB) return addressA;

    const distA = new Map<string, number>();
    const qA: Array<readonly [string, number]> = [[addressA, 0]];
    while (qA.length > 0) {
      const [addr, d] = qA.shift()!;
      if (distA.has(addr)) continue;
      distA.set(addr, d);
      for (const p of this.snapshotsByAddress.get(addr)?.parentAddresses ?? []) qA.push([p, d + 1]);
    }

    let bestLca: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const seenB = new Set<string>();
    const qB: Array<readonly [string, number]> = [[addressB, 0]];
    while (qB.length > 0) {
      const [addr, dB] = qB.shift()!;
      if (seenB.has(addr)) continue;
      seenB.add(addr);
      const dA = distA.get(addr);
      if (dA !== undefined && dA + dB < bestScore) {
        bestScore = dA + dB;
        bestLca = addr;
      }
      for (const p of this.snapshotsByAddress.get(addr)?.parentAddresses ?? []) qB.push([p, dB + 1]);
    }
    return bestLca;
  }

  /** 회차별 에셋 버전 잠금(Lockfile)을 생성한다. */
  public createEpisodeLockfile(
    episodeId: string,
    requests: readonly { readonly assetId: string; readonly semver: string; readonly upgradePolicy?: EpisodeUpgradePolicy }[],
    state: EpisodePublicationState,
    updatedAtIso: string,
  ): EpisodeAssetLockfile {
    const pins: Record<string, EpisodeAssetPin> = {};
    for (const req of requests) {
      const snap = this.getSnapshotByVersion(req.assetId, req.semver);
      if (!snap) throw new Error(`에셋 '${req.assetId}' 버전 ${req.semver} 스냅샷을 찾을 수 없습니다.`);
      pins[req.assetId] = {
        assetId: req.assetId,
        contentAddress: snap.contentAddress,
        semver: snap.semver,
        upgradePolicy: req.upgradePolicy ?? (state === "locked-published" ? "frozen" : "minor-compatible"),
        previousAddresses: [],
      };
    }
    return deepCloneAndFreeze({
      episodeId,
      state,
      updatedAtIso,
      pins,
      lockfileDigest: computeLockfileDigest(episodeId, state, pins),
    });
  }

  public resolveLockedSnapshot(lockfile: EpisodeAssetLockfile, assetId: string): CreatorAssetSnapshot {
    const pin = lockfile.pins[assetId];
    if (!pin) throw new Error(`회차 '${lockfile.episodeId}' Lockfile에 에셋 '${assetId}' 핀이 없습니다.`);
    const snap = this.snapshotsByAddress.get(pin.contentAddress);
    if (!snap) throw new Error(`잠긴 콘텐츠 주소(${pin.contentAddress}) 스냅샷이 손실되었습니다.`);
    return snap;
  }

  /** 회차 Lockfile 내 특정 에셋 핀을 정책 및 메이저 호환성 규칙에 따라 선택 업그레이드한다. */
  public upgradeEpisodeAssetPin(
    lockfile: EpisodeAssetLockfile,
    assetId: string,
    options: UpgradeEpisodePinOptions,
  ): EpisodeAssetLockfile {
    const currentPin = lockfile.pins[assetId];
    if (!currentPin) throw new Error(`회차 '${lockfile.episodeId}'에 에셋 '${assetId}'가 없습니다.`);
    if (lockfile.state === "locked-published" && !options.forceUnlockPublished) {
      throw new Error(`마감 완료된 회차('${lockfile.episodeId}')의 에셋 핀은 잠금 해제 승인 없이 변경할 수 없습니다.`);
    }

    const currentVer = parseSemVer(currentPin.semver);
    const candidate = options.targetSemver
      ? this.getSnapshotByVersion(assetId, options.targetSemver)
      : [...this.listAssetVersions(assetId)].reverse().find((snap) => {
          if (compareSemVer(snap.semver, currentPin.semver) <= 0) return false;
          const cv = parseSemVer(snap.semver);
          if (currentPin.upgradePolicy === "frozen" && !options.allowMajorBreaking) return false;
          if (currentPin.upgradePolicy === "patch-only" && !options.allowMajorBreaking) {
            return cv.major === currentVer.major && cv.minor === currentVer.minor;
          }
          return cv.major === currentVer.major || Boolean(options.allowMajorBreaking);
        });

    if (options.targetSemver && !candidate) {
      throw new Error(`목표 버전 ${options.targetSemver} 스냅샷이 존재하지 않습니다.`);
    }
    if (!candidate || candidate.contentAddress === currentPin.contentAddress) return lockfile;
    if (parseSemVer(candidate.semver).major !== currentVer.major && !options.allowMajorBreaking) {
      throw new Error(`메이저 버전 변경(${currentPin.semver} → ${candidate.semver})은 allowMajorBreaking 승인이 필요합니다.`);
    }

    const nextPins: Record<string, EpisodeAssetPin> = {
      ...lockfile.pins,
      [assetId]: {
        assetId,
        contentAddress: candidate.contentAddress,
        semver: candidate.semver,
        upgradePolicy: currentPin.upgradePolicy,
        previousAddresses: [...currentPin.previousAddresses, currentPin.contentAddress],
      },
    };
    return deepCloneAndFreeze({
      episodeId: lockfile.episodeId,
      state: lockfile.state,
      updatedAtIso: options.updatedAtIso,
      pins: nextPins,
      lockfileDigest: computeLockfileDigest(lockfile.episodeId, lockfile.state, nextPins),
    });
  }

  /** 회차 Lockfile의 에셋 핀을 직전 잠금 스냅샷(또는 지정 주소)으로 롤백한다. */
  public rollbackEpisodeAssetPin(
    lockfile: EpisodeAssetLockfile,
    assetId: string,
    updatedAtIso: string,
    targetAddress?: string,
  ): EpisodeAssetLockfile {
    const currentPin = lockfile.pins[assetId];
    if (!currentPin) throw new Error(`회차 '${lockfile.episodeId}'에 에셋 '${assetId}' 핀이 없습니다.`);
    const history = [...currentPin.previousAddresses];
    const restoreAddr = targetAddress ?? history.pop();
    if (!restoreAddr) throw new Error(`에셋 '${assetId}'에 롤백 가능한 이전 이력이 없습니다.`);
    const targetSnap = this.snapshotsByAddress.get(restoreAddr);
    if (!targetSnap || targetSnap.assetId !== assetId) {
      throw new Error(`유효하지 않은 롤백 대상 주소입니다: ${restoreAddr}`);
    }

    const nextPins: Record<string, EpisodeAssetPin> = {
      ...lockfile.pins,
      [assetId]: {
        assetId,
        contentAddress: targetSnap.contentAddress,
        semver: targetSnap.semver,
        upgradePolicy: currentPin.upgradePolicy,
        previousAddresses: targetAddress ? currentPin.previousAddresses.filter((a) => a !== targetAddress) : history,
      },
    };
    return deepCloneAndFreeze({
      episodeId: lockfile.episodeId,
      state: lockfile.state,
      updatedAtIso,
      pins: nextPins,
      lockfileDigest: computeLockfileDigest(lockfile.episodeId, lockfile.state, nextPins),
    });
  }

  /** 최소 공통 조상(LCA) 기준 3-way 속성·의존성 병합을 수행한다. */
  public mergeSnapshotsThreeWay(
    oursAddress: string,
    theirsAddress: string,
    resolutions: Readonly<Record<string, ConflictResolutionChoice>> = {},
    explicitBaseAddress?: string,
  ): ThreeWayMergeReport {
    const ours = this.snapshotsByAddress.get(oursAddress);
    const theirs = this.snapshotsByAddress.get(theirsAddress);
    if (!ours || !theirs) throw new Error("병합 대상 스냅샷 주소를 찾을 수 없습니다.");
    if (ours.assetId !== theirs.assetId) throw new Error("서로 다른 에셋 간에는 병합할 수 없습니다.");

    const baseAddress = explicitBaseAddress ?? this.findLowestCommonAncestor(oursAddress, theirsAddress);
    const baseSnap = baseAddress ? this.snapshotsByAddress.get(baseAddress) : undefined;
    const conflicts: AssetMergeConflict[] = [];
    const mergedAttributes = mergeAttributeObjectsThreeWay(
      baseSnap?.attributes ?? {},
      ours.attributes,
      theirs.attributes,
      "",
      conflicts,
      resolutions,
    );

    const bMap = new Map((baseSnap?.dependencies ?? []).map((d) => [d.assetId, d]));
    const oMap = new Map(ours.dependencies.map((d) => [d.assetId, d]));
    const tMap = new Map(theirs.dependencies.map((d) => [d.assetId, d]));
    const mergedDeps: AssetDependencyPin[] = [];

    for (const depId of [...new Set([...bMap.keys(), ...oMap.keys(), ...tMap.keys()])].sort()) {
      const bA = bMap.get(depId)?.pinnedAddress ?? "";
      const oDep = oMap.get(depId);
      const tDep = tMap.get(depId);
      const oA = oDep?.pinnedAddress ?? "";
      const tA = tDep?.pinnedAddress ?? "";

      if (oA === tA || tA === bA) {
        if (oDep) mergedDeps.push(oDep);
      } else if (oA === bA) {
        if (tDep) mergedDeps.push(tDep);
      } else {
        const depPath = `$dependencies.${depId}`;
        const res = resolutions[depPath];
        if (res?.strategy === "theirs") {
          if (tDep) mergedDeps.push(tDep);
        } else if (res?.strategy === "ours") {
          if (oDep) mergedDeps.push(oDep);
        } else {
          conflicts.push({
            path: depPath,
            baseValue: bA || null,
            oursValue: oA || null,
            theirsValue: tA || null,
            reasonKo: `하위 의존성 '${depId}' 잠금 주소가 양쪽에서 상이하게 변경되었습니다.`,
          });
          if (oDep) mergedDeps.push(oDep);
        }
      }
    }

    const canAutoCommit = conflicts.length === 0;
    return {
      assetId: ours.assetId,
      baseAddress: baseAddress ?? null,
      oursAddress,
      theirsAddress,
      canAutoCommit,
      mergedAttributes,
      mergedDependencies: Object.freeze(mergedDeps),
      conflicts: Object.freeze(conflicts),
      summaryKo: canAutoCommit
        ? `'${ours.assetId}' 3-way 무충돌 병합 완료`
        : `'${ours.assetId}' 병합 충돌 ${conflicts.length}건 검출`,
    };
  }

  /** 회차 출고 전 직접 핀·하위 의존성·조상 파생 계보의 Rights BOM을 전수 감사한다. */
  public verifyEpisodeRightsBom(
    lockfile: EpisodeAssetLockfile,
    options: { readonly providedCredits: readonly string[]; readonly auditTimestampIso: string },
  ): EpisodeRightsBomReport {
    const violations: RightsBomViolation[] = [];
    const requiredCreditSet = new Set<string>();
    const visited = new Set<string>();
    const credits = options.providedCredits.map((c) => c.trim());
    const auditMs = Date.parse(options.auditTimestampIso);

    const inspect = (
      rootAssetId: string,
      address: string,
      relation: RightsBomViolation["relation"],
      hasDerivedChild: boolean,
    ): void => {
      const key = `${rootAssetId}|${address}|${relation}|${hasDerivedChild ? 1 : 0}`;
      if (visited.has(key)) return;
      visited.add(key);

      const snap = this.snapshotsByAddress.get(address);
      if (!snap) {
        violations.push({
          rootAssetId,
          offendingAssetId: rootAssetId,
          offendingAddress: address,
          offendingSemver: "0.0.0",
          relation,
          violationKind: "missing-snapshot-node",
          licenseId: "UNKNOWN",
          messageKo: `검증 대상 스냅샷(${address})을 찾을 수 없습니다.`,
        });
        return;
      }

      const { rights } = snap;
      const pushViolation = (violationKind: RightsBomViolationKind, messageKo: string): void => {
        violations.push({
          rootAssetId,
          offendingAssetId: snap.assetId,
          offendingAddress: snap.contentAddress,
          offendingSemver: snap.semver,
          relation,
          violationKind,
          licenseId: rights.licenseId,
          messageKo,
        });
      };

      if (rights.commercialUse === "prohibited") {
        pushViolation("commercial-use-prohibited", `에셋 '${snap.assetId}'(${snap.semver})는 상업적 출고가 금지되어 있습니다.`);
      } else if (rights.commercialUse === "unknown") {
        pushViolation("unverified-commercial-rights", `에셋 '${snap.assetId}'(${snap.semver}) 상업적 권리 증빙이 미확인입니다.`);
      }
      if (hasDerivedChild && rights.derivativeAllowed === false) {
        pushViolation("unauthorized-derivative-work", `원본 '${snap.assetId}'(${snap.semver})는 개작·파생 생성이 금지되어 있습니다.`);
      }
      if (rights.expiresAtIso && Number.isFinite(auditMs) && Date.parse(rights.expiresAtIso) < auditMs) {
        pushViolation("expired-license", `에셋 '${snap.assetId}'(${snap.semver}) 사용권이 만료되었습니다.`);
      }
      if (rights.attributionRequired) {
        const expected = (rights.attributionText ?? `${rights.rightsholder} (${rights.licenseId})`).trim();
        requiredCreditSet.add(expected);
        if (!credits.some((entry) => entry.includes(expected))) {
          pushViolation("missing-required-attribution", `필수 출처 표기 누락: '${expected}'`);
        }
      }

      for (const dep of snap.dependencies) inspect(rootAssetId, dep.pinnedAddress, "transitive-dependency", false);
      for (const parentAddr of snap.parentAddresses) inspect(rootAssetId, parentAddr, "ancestor-lineage", true);
    };

    for (const pin of Object.values(lockfile.pins)) inspect(pin.assetId, pin.contentAddress, "direct-pin", false);
    const uniqueAddresses = new Set([...visited].map((k) => k.split("|")[1]).filter(Boolean));
    const requiredAttributions = [...requiredCreditSet].sort();
    const readyForCommercialRelease = violations.length === 0;
    const bomDigest = `bom-fnv64:${computeFnv1a64Hex(
      canonicalizeStructure({
        episodeId: lockfile.episodeId,
        lockfileDigest: lockfile.lockfileDigest,
        readyForCommercialRelease,
        requiredAttributions,
        violationCount: violations.length,
      }),
    )}`;

    return {
      episodeId: lockfile.episodeId,
      readyForCommercialRelease,
      scannedSnapshotCount: uniqueAddresses.size,
      requiredAttributions,
      violations,
      bomDigest,
      summaryKo: readyForCommercialRelease
        ? `회차 '${lockfile.episodeId}' Rights BOM 통과 (${uniqueAddresses.size}개 스냅샷 확인)`
        : `회차 '${lockfile.episodeId}' 출고 차단: 위반 ${violations.length}건`,
    };
  }
}
