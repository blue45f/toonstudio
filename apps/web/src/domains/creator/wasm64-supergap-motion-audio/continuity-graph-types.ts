/**
 * #13 다회차(100+화) 캐릭터 관계 그래프 · 복선(Chekhov's Gun) 추적기 타입 계약 및 로컬 2-gram 토크나이저.
 */

export type CharacterStatus = "alive" | "deceased" | "missing" | "unknown";

export type RelationshipKind =
  | "ally"
  | "rival"
  | "family"
  | "mentor"
  | "betrayal"
  | "secret"
  | "romance"
  | "neutral";

export type PropStatus = "active" | "lost" | "destroyed" | "sealed";

export type ForeshadowStatus = "planted" | "callback" | "resolved" | "abandoned";

export type ForeshadowImportance = "minor" | "major" | "arc-critical";

export type ContinuityEntityType = "character" | "relationship" | "prop" | "foreshadow";

export interface CharacterRecord {
  readonly characterId: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly status: CharacterStatus;
  readonly firstAppearanceEpisode: number;
  readonly lastAppearanceEpisode: number;
  readonly deathEpisode?: number;
  readonly appearanceEpisodes: readonly number[];
  readonly flashbackEpisodes: readonly number[];
  readonly traits: readonly string[];
  readonly arcSummary: string;
}

export interface CharacterUpsertInput {
  readonly characterId: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly status?: CharacterStatus;
  readonly firstAppearanceEpisode: number;
  readonly lastAppearanceEpisode?: number;
  readonly deathEpisode?: number;
  readonly appearanceEpisodes?: readonly number[];
  readonly flashbackEpisodes?: readonly number[];
  readonly traits?: readonly string[];
  readonly arcSummary?: string;
}

export interface RelationshipEdge {
  readonly edgeId: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly kind: RelationshipKind;
  readonly startEpisode: number;
  readonly endEpisode?: number;
  readonly strength: number;
  readonly evidenceEpisodes: readonly number[];
  readonly notes: string;
}

export interface PropOwnershipEvent {
  readonly episode: number;
  readonly holderCharacterId?: string;
  readonly location: string;
  readonly status: PropStatus;
  readonly isExplicitHandoff?: boolean;
  readonly notes?: string;
}

export interface KeyPropRecord {
  readonly propId: string;
  readonly name: string;
  readonly category: string;
  readonly introducedEpisode: number;
  readonly currentStatus: PropStatus;
  readonly ownerHistory: readonly PropOwnershipEvent[];
  readonly description: string;
}

export interface ForeshadowHookRecord {
  readonly hookId: string;
  readonly title: string;
  readonly summary: string;
  readonly plantedEpisode: number;
  readonly callbackEpisodes: readonly number[];
  readonly resolvedEpisode?: number;
  readonly expectedPayoffByEpisode?: number;
  readonly status: ForeshadowStatus;
  readonly importance: ForeshadowImportance;
  readonly involvedCharacterIds: readonly string[];
  readonly involvedPropIds: readonly string[];
  readonly payoffSummary?: string;
}

export interface PlantForeshadowInput {
  readonly hookId: string;
  readonly title: string;
  readonly summary: string;
  readonly plantedEpisode: number;
  readonly expectedPayoffByEpisode?: number;
  readonly importance?: ForeshadowImportance;
  readonly involvedCharacterIds?: readonly string[];
  readonly involvedPropIds?: readonly string[];
}

export interface ContinuitySearchOptions {
  readonly entityTypes?: readonly ContinuityEntityType[];
  readonly minEpisode?: number;
  readonly maxEpisode?: number;
  readonly limit?: number;
}

export interface ContinuitySearchHit {
  readonly entityType: ContinuityEntityType;
  readonly entityId: string;
  readonly title: string;
  readonly episodeSpan: readonly [number, number];
  readonly score: number;
  readonly matchedTerms: readonly string[];
}

export type ContinuityDiagnosticSeverity = "error" | "warning" | "info";

export type ContinuityDiagnosticKind =
  | "unresolved-chekhov-gun"
  | "deceased-character-reappearance"
  | "relationship-before-first-appearance"
  | "prop-custody-conflict"
  | "resolved-before-planted"
  | "orphaned-hook-entity";

export interface ContinuityDiagnostic {
  readonly diagnosticId: string;
  readonly kind: ContinuityDiagnosticKind;
  readonly severity: ContinuityDiagnosticSeverity;
  readonly entityType: ContinuityEntityType;
  readonly entityId: string;
  readonly episode: number;
  readonly messageKo: string;
}

export interface ContinuityAuditOptions {
  readonly staleGapEpisodes?: number;
}

export interface ContinuityAuditReport {
  readonly currentEpisode: number;
  readonly characterCount: number;
  readonly relationshipCount: number;
  readonly propCount: number;
  readonly hookCount: number;
  readonly unresolvedHookCount: number;
  readonly resolvedHookCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly healthScore: number;
  readonly indexedTermCount: number;
  readonly unresolvedHooks: readonly ForeshadowHookRecord[];
  readonly diagnostics: readonly ContinuityDiagnostic[];
  readonly elapsedMs: number;
  readonly aiTokensUsed: 0;
}

export interface CharacterGraphNeighborhood {
  readonly centerCharacterId: string;
  readonly visitedCharacterIds: readonly string[];
  readonly distanceByCharacterId: Readonly<Record<string, number>>;
  readonly edges: readonly RelationshipEdge[];
  readonly linkedProps: readonly KeyPropRecord[];
  readonly linkedHooks: readonly ForeshadowHookRecord[];
}

export interface IndexedDocumentMeta {
  readonly docKey: string;
  readonly entityType: ContinuityEntityType;
  readonly entityId: string;
  readonly title: string;
  readonly minEpisode: number;
  readonly maxEpisode: number;
  readonly termWeights: Map<string, number>;
}

export function dedupeSortedNumbers(values: readonly number[]): readonly number[] {
  const seen = new Set<number>();
  for (let i = 0; i < values.length; i += 1) {
    seen.add(values[i]);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export function tokenizeContinuityText(raw: string): Map<string, number> {
  const weights = new Map<string, number>();
  const normalized = raw.toLowerCase().trim();
  if (normalized.length === 0) return weights;

  const words = normalized.split(/[\s,.;:!?()[\]{}"'`/\\|<>~@#$%^&*+=_-]+/);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word.length === 0) continue;
    weights.set(word, (weights.get(word) ?? 0) + 2.0);
    if (word.length >= 2) {
      for (let j = 0; j < word.length - 1; j += 1) {
        const gram = word.slice(j, j + 2);
        weights.set(gram, (weights.get(gram) ?? 0) + 0.75);
      }
    }
  }
  return weights;
}
