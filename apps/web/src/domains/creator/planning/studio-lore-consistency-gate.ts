/**
 * 설정 일관성 게이트 — 선점(claim) 규칙과 상태별 판정 분기.
 *
 * 근거·원칙:
 * - 선점 규칙 (루카스필름 홀로크론): 새 설정은 출간·연재 뒤가 아니라 기획
 *   단계에서 먼저 허브에 등록한다. 먼저 등록한 항목이 그 이름의 선점자이고,
 *   등록 시점에 기존 설정과의 충돌이 바로 드러난다. 이 모듈의
 *   stakeLoreClaim 이 그 등록 경로다 — 게이트를 통과해야만 항목이 생긴다.
 * - 상태별 판정 분기 (Halo 스토리 바이블 — 추측 명시·빈칸 보존):
 *   · 확정(confirmed)과 충돌 → 차단(block). 이미 정본인 설정을 조용히
 *     덮어쓰게 두지 않는다.
 *   · 추측(speculative)과 충돌 → 통과(pass-with-nudge). 다만 어느 쪽을
 *     확정할지 정하라는 안내를 반드시 붙인다.
 *   · 의도적 빈칸(intentional-gap)과 겹침 → 통과(pass-with-nudge). 빈칸을
 *     채우는 새 설정은 환영하되, 빈칸을 채웠다는 사실을 허브에 먼저
 *     등록하라는 안내를 붙인다.
 *   · 폐기·격리(deprecated·quarantined) 항목과의 겹침 → 통과(pass).
 *     격리된 설정은 이름 공간을 점유하지 않으므로(Legends 분리) 같은
 *     이름을 새 정본으로 다시 세울 수 있다. 겹침 사실은 note 로만 남긴다.
 *   · 사전에 아예 없는 새 이름 → 통과(pass-with-nudge). 허브 선등록이
 *     곧 이 게이트의 통과 기록이 되도록, 등록을 유도한다.
 * - 적용 범위가 겹치지 않으면 충돌이 아니다: 시즌 1 전용 확정 설정을
 *   시즌 2 전용 새 설정이 막지 않는다. 범위를 생략한 제안은 전 범위로
 *   보아 보수적으로 판정한다(조기 노출 우선).
 *
 * 이 모듈은 판정만 한다. 실제 등록은 stakeLoreClaim 이 upsert 경로로
 * 수행하고, 차단된 제안은 어떤 상태로도 저장하지 않는다.
 */
import {
  isLoreEntryActive,
  loreEntryScopesOverlap,
  nextLoreEntryId,
  upsertLoreEntry,
  withLoreEntryDefaults,
  STUDIO_LORE_STATUS_LABELS,
  type StudioLoreEntry,
  type StudioLoreEntryKind,
  type StudioWorldLore,
} from "./studio-world-lore";

export type LoreGateVerdict = "block" | "pass" | "pass-with-nudge";

export interface LoreClaimProposal {
  /** 제안하는 항목 id — 편집 판정일 때만. 신규 등록이면 생략한다. */
  readonly entryId?: string | null;
  readonly kind: StudioLoreEntryKind;
  readonly name: string;
  readonly aliases?: readonly string[];
  /** 제안의 적용 범위. 생략·빈 배열 = 전 범위. */
  readonly appliesToWorkIds?: readonly string[];
  readonly appliesToSeasonLabels?: readonly string[];
}

export interface LoreGateReason {
  readonly code:
    | "confirmed-conflict"
    | "speculative-overlap"
    | "gap-fill"
    | "retired-name-reuse"
    | "unregistered-name";
  /** 관련된 기존 항목 id. 미등록 이름이면 null. */
  readonly entryId: string | null;
  /** 그 항목의 버전 — 어느 버전과 겹쳤는지 기록한다. */
  readonly entryVersion: number | null;
  readonly message: string;
}

export interface LoreGateResult {
  readonly verdict: LoreGateVerdict;
  readonly reasons: readonly LoreGateReason[];
  /** 차단 여부 요약 — UI가 버튼을 막을 때 쓰는 단일 판정. */
  readonly blocked: boolean;
}

function normalizeSurface(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function proposalSurfaces(proposal: LoreClaimProposal): ReadonlySet<string> {
  const surfaces = new Set<string>();
  const name = normalizeSurface(proposal.name);
  if (name) surfaces.add(name);
  for (const alias of proposal.aliases ?? []) {
    const key = normalizeSurface(alias);
    if (key) surfaces.add(key);
  }
  return surfaces;
}

function entrySurfaces(entry: StudioLoreEntry): readonly string[] {
  return [entry.name, ...entry.aliases].map(normalizeSurface).filter(Boolean);
}

function scopeShape(proposal: LoreClaimProposal): {
  appliesToWorkIds: readonly string[];
  appliesToSeasonLabels: readonly string[];
} {
  return {
    appliesToWorkIds: proposal.appliesToWorkIds ?? [],
    appliesToSeasonLabels: proposal.appliesToSeasonLabels ?? [],
  };
}

/**
 * 일관성 게이트 판정 — 제안이 기존 허브와 어떻게 겹치는지 상태별로 가른다.
 * 판정은 entries 배열 순서(=등록·선점 순서)대로 이유를 쌓는다.
 */
export function evaluateLoreClaim(
  lore: StudioWorldLore,
  proposal: LoreClaimProposal,
): LoreGateResult {
  const surfaces = proposalSurfaces(proposal);
  const reasons: LoreGateReason[] = [];
  let sawAnyOverlap = false;

  if (surfaces.size > 0) {
    for (const entry of lore.entries) {
      if (proposal.entryId && entry.id === proposal.entryId) continue;
      const overlapsName = entrySurfaces(entry).some((surface) => surfaces.has(surface));
      if (!overlapsName) continue;
      if (!loreEntryScopesOverlap(entry, scopeShape(proposal))) continue;
      sawAnyOverlap = true;
      const label = STUDIO_LORE_STATUS_LABELS[entry.status].ko;
      if (entry.status === "confirmed") {
        reasons.push({
          code: "confirmed-conflict",
          entryId: entry.id,
          entryVersion: entry.version,
          message:
            `"${proposal.name}"은(는) 이미 확정된 설정 "${entry.name}"(v${entry.version})과 겹쳐요. ` +
            "확정 설정을 바꾸려면 먼저 그 항목을 고치거나 격리한 뒤 다시 시도해 주세요.",
        });
      } else if (entry.status === "speculative") {
        reasons.push({
          code: "speculative-overlap",
          entryId: entry.id,
          entryVersion: entry.version,
          message:
            `"${proposal.name}"은(는) 추측 단계인 "${entry.name}"(v${entry.version})과 겹쳐요. ` +
            "등록은 가능해요. 어느 쪽이 정본인지 정해 한쪽을 확정으로 올려 주세요.",
        });
      } else if (entry.status === "intentional-gap") {
        reasons.push({
          code: "gap-fill",
          entryId: entry.id,
          entryVersion: entry.version,
          message:
            `"${proposal.name}"은(는) 의도적으로 비워 둔 "${entry.name}" 자리를 채우는 설정이에요. ` +
            "등록은 가능해요. 빈칸 항목은 채워진 상태로 상태를 바꿔 주세요.",
        });
      } else {
        // deprecated · quarantined — 이름 공간을 점유하지 않는다.
        reasons.push({
          code: "retired-name-reuse",
          entryId: entry.id,
          entryVersion: entry.version,
          message:
            `"${entry.name}"은(는) ${label} 상태라 이름이 비어 있어요. 새 정본으로 다시 세울 수 있어요.`,
        });
      }
    }
  }

  if (!sawAnyOverlap) {
    reasons.push({
      code: "unregistered-name",
      entryId: null,
      entryVersion: null,
      message:
        `"${proposal.name}"은(는) 아직 허브에 없는 새 이름이에요. 기획 단계에서 먼저 등록해 두면 ` +
        "이후 회차의 충돌을 여기서 바로 잡을 수 있어요.",
    });
  }

  const blocked = reasons.some((reason) => reason.code === "confirmed-conflict");
  const nudged = reasons.some(
    (reason) =>
      reason.code === "speculative-overlap"
      || reason.code === "gap-fill"
      || reason.code === "unregistered-name",
  );
  const verdict: LoreGateVerdict = blocked ? "block" : nudged ? "pass-with-nudge" : "pass";
  return Object.freeze({
    verdict,
    reasons: Object.freeze(reasons),
    blocked,
  });
}

export interface LoreStakeResult {
  readonly ok: boolean;
  readonly gate: LoreGateResult;
  /** 등록된 항목. 차단됐으면 null — 차단된 제안은 저장하지 않는다. */
  readonly entry: StudioLoreEntry | null;
  readonly lore: StudioWorldLore;
}

/**
 * 선점 등록 — 기획 단계에서 새 설정을 허브에 먼저 세우는 단일 경로.
 * 게이트가 차단하면 아무것도 저장하지 않는다. 통과한 새 설정은 기본
 * "추측"으로 선등록된다(기획 단계의 설정은 아직 정본이 아니라는 것이
 * Halo 바이블의 추측 명시 원칙이다) — 명시로 confirmed 를 줄 때만
 * 확정으로 들어간다.
 */
export function stakeLoreClaim(
  lore: StudioWorldLore,
  proposal: LoreClaimProposal & {
    readonly summary?: string;
    readonly details?: string;
    readonly status?: "confirmed" | "speculative";
  },
): LoreStakeResult {
  const gate = evaluateLoreClaim(lore, proposal);
  if (gate.blocked) {
    return Object.freeze({ ok: false, gate, entry: null, lore });
  }
  const entry = withLoreEntryDefaults({
    id: proposal.entryId ?? nextLoreEntryId(lore, proposal.kind),
    kind: proposal.kind,
    name: proposal.name.trim(),
    aliases: Object.freeze([...(proposal.aliases ?? [])]),
    summary: proposal.summary ?? "",
    details: proposal.details ?? "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: Object.freeze([]),
    characterIds: Object.freeze([]),
    origin: "authored",
    status: proposal.status ?? "speculative",
    appliesToWorkIds: Object.freeze([...(proposal.appliesToWorkIds ?? [])]),
    appliesToSeasonLabels: Object.freeze([...(proposal.appliesToSeasonLabels ?? [])]),
  });
  return Object.freeze({
    ok: true,
    gate,
    entry,
    lore: upsertLoreEntry(lore, entry),
  });
}

/** 활성 항목 중 이 이름(또는 별칭)을 선점한 항목 — 배열 순서상 가장 먼저 등록된 것. */
export function findLoreClaimHolder(
  lore: StudioWorldLore,
  name: string,
): StudioLoreEntry | null {
  const key = normalizeSurface(name);
  if (!key) return null;
  for (const entry of lore.entries) {
    if (!isLoreEntryActive(entry)) continue;
    if (entrySurfaces(entry).includes(key)) return entry;
  }
  return null;
}
