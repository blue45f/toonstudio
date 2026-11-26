/**
 * #13 다회차(100+화) 캐릭터 관계 그래프 · 복선(Chekhov's Gun) 추적기 + Pillar C 통합 진입점 (₩0 로컬 · 0 AI 토큰).
 *
 * 캐릭터·관계·핵심 소품·복선/회수 이력을 로컬 역색인(Inverted Index)으로 색인하고,
 * 미회수 복선·사망 캐릭터 재등장·소품 소유권 충돌·시계열 모순을 오프라인에서 진단한다.
 */

import {
  dedupeSortedNumbers,
  tokenizeContinuityText,
  type CharacterGraphNeighborhood,
  type CharacterRecord,
  type CharacterUpsertInput,
  type ContinuityAuditOptions,
  type ContinuityAuditReport,
  type ContinuityDiagnostic,
  type ContinuityDiagnosticKind,
  type ContinuityDiagnosticSeverity,
  type ContinuityEntityType,
  type ContinuitySearchHit,
  type ContinuitySearchOptions,
  type ForeshadowHookRecord,
  type IndexedDocumentMeta,
  type KeyPropRecord,
  type PlantForeshadowInput,
  type PropOwnershipEvent,
  type RelationshipEdge,
} from "./continuity-graph-types";

export {
  analyzeMobileRetentionHeatmap,
  MOBILE_VIEWPORT_PRESETS,
  type BalloonLayoutMetric,
  type CutShotScale,
  type EpisodeCutMetricsInput,
  type MobileRetentionHeatmapOptions,
  type MobileRetentionHeatmapReport,
  type MobileViewportPresetId,
  type MobileViewportSpec,
  type RetentionDropoffSpan,
  type RetentionRiskFlag,
  type RetentionRiskKind,
  type ThumbScrollRhythmSample,
  type ViewportScreenSample,
} from "./mobile-retention-heatmap";

export {
  computeLocalizedBalloonReflow,
  EpisodeDialogueSpreadsheetBinder,
  type BalloonReflowBox,
  type BalloonWritingDirection,
  type BatchDiffEntry,
  type BatchDiffRecord,
  type BoundBalloonStateSnapshot,
  type CanvasBalloonMutation,
  type CanvasBalloonNode,
  type DialogueBinderOptions,
  type DialogueCellPatch,
  type DialogueRowInit,
  type DialogueSpreadsheetRow,
  type DialogueSyncEvent,
  type DialogueSyncListener,
  type LocalizedTextMap,
  type ReflowSizingOptions,
  type SupportedDialogueLocale,
  type VoiceCueOverlap,
  type VoiceEmotionTag,
  type VoiceTimingCue,
} from "./dialogue-spreadsheet-binder";

export type {
  CharacterGraphNeighborhood,
  CharacterRecord,
  CharacterStatus,
  CharacterUpsertInput,
  ContinuityAuditOptions,
  ContinuityAuditReport,
  ContinuityDiagnostic,
  ContinuityDiagnosticKind,
  ContinuityDiagnosticSeverity,
  ContinuityEntityType,
  ContinuitySearchHit,
  ContinuitySearchOptions,
  ForeshadowHookRecord,
  ForeshadowImportance,
  ForeshadowStatus,
  KeyPropRecord,
  PlantForeshadowInput,
  PropOwnershipEvent,
  PropStatus,
  RelationshipEdge,
  RelationshipKind,
} from "./continuity-graph-types";

/**
 * 100화 이상 장기 연재 웹툰의 캐릭터 그래프·소품·복선(Chekhov's Gun) 연속성 로컬 DB.
 */
export class EpisodeContinuityGraphDb {
  private readonly characters = new Map<string, CharacterRecord>();
  private readonly relationships = new Map<string, RelationshipEdge>();
  private readonly props = new Map<string, KeyPropRecord>();
  private readonly hooks = new Map<string, ForeshadowHookRecord>();

  private readonly docMeta = new Map<string, IndexedDocumentMeta>();
  private readonly invertedIndex = new Map<string, Set<string>>();

  public upsertCharacter(input: CharacterUpsertInput): CharacterRecord {
    const appearances = dedupeSortedNumbers([
      input.firstAppearanceEpisode,
      ...(input.appearanceEpisodes ?? []),
      ...(input.lastAppearanceEpisode !== undefined ? [input.lastAppearanceEpisode] : []),
    ]);
    const flashbacks = dedupeSortedNumbers(input.flashbackEpisodes ?? []);
    const lastAppearance =
      input.lastAppearanceEpisode ??
      (appearances.length > 0 ? appearances[appearances.length - 1] : input.firstAppearanceEpisode);

    const record: CharacterRecord = {
      characterId: input.characterId,
      name: input.name,
      aliases: (input.aliases ?? []).slice(),
      status: input.status ?? (input.deathEpisode !== undefined ? "deceased" : "alive"),
      firstAppearanceEpisode: input.firstAppearanceEpisode,
      lastAppearanceEpisode: lastAppearance,
      deathEpisode: input.deathEpisode,
      appearanceEpisodes: appearances,
      flashbackEpisodes: flashbacks,
      traits: (input.traits ?? []).slice(),
      arcSummary: input.arcSummary ?? "",
    };

    this.characters.set(record.characterId, record);
    this.reindexDocument(
      "character",
      record.characterId,
      record.name,
      record.firstAppearanceEpisode,
      record.lastAppearanceEpisode,
      [record.name, ...record.aliases, ...record.traits, record.arcSummary, record.status].join(" "),
    );
    return record;
  }

  public recordCharacterAppearance(
    characterId: string,
    episode: number,
    options: { readonly isFlashback?: boolean } = {},
  ): CharacterRecord | undefined {
    const existing = this.characters.get(characterId);
    if (!existing) return undefined;

    const nextAppearances = dedupeSortedNumbers([...existing.appearanceEpisodes, episode]);
    const nextFlashbacks = options.isFlashback
      ? dedupeSortedNumbers([...existing.flashbackEpisodes, episode])
      : existing.flashbackEpisodes;

    return this.upsertCharacter({
      ...existing,
      firstAppearanceEpisode: Math.min(existing.firstAppearanceEpisode, episode),
      lastAppearanceEpisode: Math.max(existing.lastAppearanceEpisode, episode),
      appearanceEpisodes: nextAppearances,
      flashbackEpisodes: nextFlashbacks,
    });
  }

  public upsertRelationship(edge: RelationshipEdge): RelationshipEdge {
    const stored: RelationshipEdge = {
      ...edge,
      strength: Math.max(-1, Math.min(1, edge.strength)),
      evidenceEpisodes: dedupeSortedNumbers([edge.startEpisode, ...edge.evidenceEpisodes]),
    };
    this.relationships.set(stored.edgeId, stored);

    const fromName = this.characters.get(stored.fromCharacterId)?.name ?? stored.fromCharacterId;
    const toName = this.characters.get(stored.toCharacterId)?.name ?? stored.toCharacterId;
    const maxEp = stored.endEpisode ?? stored.evidenceEpisodes[stored.evidenceEpisodes.length - 1];

    this.reindexDocument(
      "relationship",
      stored.edgeId,
      `${fromName} ↔ ${toName} (${stored.kind})`,
      stored.startEpisode,
      maxEp,
      [fromName, toName, stored.kind, stored.notes].join(" "),
    );
    return stored;
  }

  public upsertKeyProp(prop: KeyPropRecord): KeyPropRecord {
    const sortedHistory = prop.ownerHistory.slice().sort((a, b) => a.episode - b.episode);
    const stored: KeyPropRecord = { ...prop, ownerHistory: sortedHistory };
    this.props.set(stored.propId, stored);

    const maxEp =
      sortedHistory.length > 0
        ? Math.max(stored.introducedEpisode, sortedHistory[sortedHistory.length - 1].episode)
        : stored.introducedEpisode;
    const holderTerms = sortedHistory
      .map((ev) => `${ev.location} ${ev.notes ?? ""} ${ev.holderCharacterId ?? ""}`)
      .join(" ");

    this.reindexDocument(
      "prop",
      stored.propId,
      stored.name,
      stored.introducedEpisode,
      maxEp,
      [stored.name, stored.category, stored.description, stored.currentStatus, holderTerms].join(" "),
    );
    return stored;
  }

  public transferPropCustody(propId: string, event: PropOwnershipEvent): KeyPropRecord | undefined {
    const existing = this.props.get(propId);
    if (!existing) return undefined;
    return this.upsertKeyProp({
      ...existing,
      currentStatus: event.status,
      ownerHistory: [...existing.ownerHistory, event],
    });
  }

  public plantForeshadowHook(input: PlantForeshadowInput): ForeshadowHookRecord {
    const record: ForeshadowHookRecord = {
      hookId: input.hookId,
      title: input.title,
      summary: input.summary,
      plantedEpisode: input.plantedEpisode,
      callbackEpisodes: [],
      expectedPayoffByEpisode: input.expectedPayoffByEpisode,
      status: "planted",
      importance: input.importance ?? "major",
      involvedCharacterIds: (input.involvedCharacterIds ?? []).slice(),
      involvedPropIds: (input.involvedPropIds ?? []).slice(),
    };
    this.hooks.set(record.hookId, record);
    this.indexForeshadowHook(record);
    return record;
  }

  public addHookCallback(hookId: string, episode: number): ForeshadowHookRecord | undefined {
    const existing = this.hooks.get(hookId);
    if (!existing) return undefined;
    const updated: ForeshadowHookRecord = {
      ...existing,
      callbackEpisodes: dedupeSortedNumbers([...existing.callbackEpisodes, episode]),
      status: existing.status === "resolved" ? "resolved" : "callback",
    };
    this.hooks.set(hookId, updated);
    this.indexForeshadowHook(updated);
    return updated;
  }

  public resolveForeshadowHook(
    hookId: string,
    resolvedEpisode: number,
    payoffSummary = "",
  ): ForeshadowHookRecord | undefined {
    const existing = this.hooks.get(hookId);
    if (!existing) return undefined;
    const updated: ForeshadowHookRecord = {
      ...existing,
      resolvedEpisode,
      status: "resolved",
      payoffSummary,
    };
    this.hooks.set(hookId, updated);
    this.indexForeshadowHook(updated);
    return updated;
  }

  public getCharacter(characterId: string): CharacterRecord | undefined {
    return this.characters.get(characterId);
  }

  public getForeshadowHook(hookId: string): ForeshadowHookRecord | undefined {
    return this.hooks.get(hookId);
  }

  public getIndexedTermCount(): number {
    return this.invertedIndex.size;
  }

  public search(
    query: string,
    options: ContinuitySearchOptions = {},
  ): readonly ContinuitySearchHit[] {
    const queryWeights = tokenizeContinuityText(query);
    if (queryWeights.size === 0) return [];

    const allowedTypes = options.entityTypes ? new Set(options.entityTypes) : null;
    const totalDocs = Math.max(1, this.docMeta.size);
    const scoreByDoc = new Map<string, number>();
    const matchedTermsByDoc = new Map<string, Set<string>>();

    queryWeights.forEach((qWeight, term) => {
      const postings = this.invertedIndex.get(term);
      if (!postings || postings.size === 0) return;
      const idf = Math.log(1 + totalDocs / postings.size) + 0.5;

      postings.forEach((docKey) => {
        const meta = this.docMeta.get(docKey);
        if (!meta) return;
        if (allowedTypes && !allowedTypes.has(meta.entityType)) return;
        if (options.minEpisode !== undefined && meta.maxEpisode < options.minEpisode) return;
        if (options.maxEpisode !== undefined && meta.minEpisode > options.maxEpisode) return;

        const tf = meta.termWeights.get(term) ?? 1;
        scoreByDoc.set(docKey, (scoreByDoc.get(docKey) ?? 0) + qWeight * tf * idf);

        let matched = matchedTermsByDoc.get(docKey);
        if (!matched) {
          matched = new Set<string>();
          matchedTermsByDoc.set(docKey, matched);
        }
        matched.add(term);
      });
    });

    const hits: ContinuitySearchHit[] = [];
    scoreByDoc.forEach((score, docKey) => {
      const meta = this.docMeta.get(docKey);
      if (!meta) return;
      hits.push({
        entityType: meta.entityType,
        entityId: meta.entityId,
        title: meta.title,
        episodeSpan: [meta.minEpisode, meta.maxEpisode],
        score: Number(score.toFixed(3)),
        matchedTerms: Array.from(matchedTermsByDoc.get(docKey) ?? []),
      });
    });

    hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.entityId.localeCompare(b.entityId)));
    return hits.slice(0, Math.max(1, options.limit ?? 20));
  }

  public getCharacterNeighborhood(
    characterId: string,
    maxDepth = 2,
  ): CharacterGraphNeighborhood {
    const distanceByCharacterId: Record<string, number> = {};
    const visited = new Set<string>();
    const queue: Array<{ readonly id: string; readonly depth: number }> = [];

    if (this.characters.has(characterId)) {
      visited.add(characterId);
      distanceByCharacterId[characterId] = 0;
      queue.push({ id: characterId, depth: 0 });
    }

    const collectedEdges = new Map<string, RelationshipEdge>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) continue;

      this.relationships.forEach((edge) => {
        const neighbor =
          edge.fromCharacterId === current.id
            ? edge.toCharacterId
            : edge.toCharacterId === current.id
              ? edge.fromCharacterId
              : null;
        if (!neighbor) return;
        collectedEdges.set(edge.edgeId, edge);
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          distanceByCharacterId[neighbor] = current.depth + 1;
          queue.push({ id: neighbor, depth: current.depth + 1 });
        }
      });
    }

    const linkedProps: KeyPropRecord[] = [];
    this.props.forEach((prop) => {
      if (prop.ownerHistory.some((ev) => ev.holderCharacterId !== undefined && visited.has(ev.holderCharacterId))) {
        linkedProps.push(prop);
      }
    });

    const linkedHooks: ForeshadowHookRecord[] = [];
    this.hooks.forEach((hook) => {
      if (hook.involvedCharacterIds.some((cid) => visited.has(cid))) {
        linkedHooks.push(hook);
      }
    });

    return {
      centerCharacterId: characterId,
      visitedCharacterIds: Array.from(visited),
      distanceByCharacterId,
      edges: Array.from(collectedEdges.values()),
      linkedProps,
      linkedHooks,
    };
  }

  public runContinuityAudit(
    currentEpisode: number,
    options: ContinuityAuditOptions = {},
  ): ContinuityAuditReport {
    const startMs = performance.now();
    const staleGap = Math.max(3, options.staleGapEpisodes ?? 20);
    const diagnostics: ContinuityDiagnostic[] = [];
    const unresolvedHooks: ForeshadowHookRecord[] = [];
    let resolvedHookCount = 0;

    const pushDiag = (
      kind: ContinuityDiagnosticKind,
      severity: ContinuityDiagnosticSeverity,
      entityType: ContinuityEntityType,
      entityId: string,
      episode: number,
      messageKo: string,
    ): void => {
      diagnostics.push({
        diagnosticId: `diag-${diagnostics.length + 1}`,
        kind,
        severity,
        entityType,
        entityId,
        episode,
        messageKo,
      });
    };

    // 1. 사망 캐릭터 비회상 재등장 검사
    this.characters.forEach((char) => {
      if (char.deathEpisode === undefined) return;
      const flashbackSet = new Set(char.flashbackEpisodes);
      for (let i = 0; i < char.appearanceEpisodes.length; i += 1) {
        const ep = char.appearanceEpisodes[i];
        if (ep > char.deathEpisode && !flashbackSet.has(ep)) {
          pushDiag(
            "deceased-character-reappearance",
            "error",
            "character",
            char.characterId,
            ep,
            `${char.name}(${char.characterId})이(가) ${char.deathEpisode}화 사망 이후 ${ep}화에 회상 표기 없이 재등장했습니다.`,
          );
        }
      }
    });

    // 2. 관계 시계열 정합성 검사
    this.relationships.forEach((edge) => {
      const fromChar = this.characters.get(edge.fromCharacterId);
      const toChar = this.characters.get(edge.toCharacterId);
      if (fromChar && edge.startEpisode < fromChar.firstAppearanceEpisode) {
        pushDiag(
          "relationship-before-first-appearance",
          "error",
          "relationship",
          edge.edgeId,
          edge.startEpisode,
          `관계(${edge.edgeId}) 시작(${edge.startEpisode}화)이 ${fromChar.name} 첫 등장(${fromChar.firstAppearanceEpisode}화)보다 앞섭니다.`,
        );
      }
      if (toChar && edge.startEpisode < toChar.firstAppearanceEpisode) {
        pushDiag(
          "relationship-before-first-appearance",
          "error",
          "relationship",
          edge.edgeId,
          edge.startEpisode,
          `관계(${edge.edgeId}) 시작(${edge.startEpisode}화)이 ${toChar.name} 첫 등장(${toChar.firstAppearanceEpisode}화)보다 앞섭니다.`,
        );
      }
    });

    // 3. 소품 소유권·파괴 후 사용 충돌 검사
    this.props.forEach((prop) => {
      let destroyedAt: number | null = null;
      const holdersByEpisode = new Map<number, string>();

      for (let i = 0; i < prop.ownerHistory.length; i += 1) {
        const ev = prop.ownerHistory[i];
        if (ev.episode < prop.introducedEpisode) {
          pushDiag(
            "prop-custody-conflict",
            "error",
            "prop",
            prop.propId,
            ev.episode,
            `소품 '${prop.name}'이(가) 최초 등장(${prop.introducedEpisode}화) 이전(${ev.episode}화)에 사용되었습니다.`,
          );
        }
        if (destroyedAt !== null && ev.episode > destroyedAt && ev.status === "active") {
          pushDiag(
            "prop-custody-conflict",
            "error",
            "prop",
            prop.propId,
            ev.episode,
            `소품 '${prop.name}'이(가) ${destroyedAt}화 파괴 이후 ${ev.episode}화에 활성 상태로 재사용되었습니다.`,
          );
        }
        if (ev.status === "destroyed" && destroyedAt === null) {
          destroyedAt = ev.episode;
        }
        if (ev.holderCharacterId) {
          const priorHolder = holdersByEpisode.get(ev.episode);
          if (priorHolder && priorHolder !== ev.holderCharacterId && !ev.isExplicitHandoff) {
            pushDiag(
              "prop-custody-conflict",
              "warning",
              "prop",
              prop.propId,
              ev.episode,
              `소품 '${prop.name}'이(가) ${ev.episode}화에서 인수인계 표기 없이 두 인물(${priorHolder}, ${ev.holderCharacterId})에게 동시 귀속되었습니다.`,
            );
          }
          holdersByEpisode.set(ev.episode, ev.holderCharacterId);
        }
      }
    });

    // 4. 복선(Chekhov's Gun) 미회수·역전·고아 참조 검사
    this.hooks.forEach((hook) => {
      for (let i = 0; i < hook.involvedCharacterIds.length; i += 1) {
        const cid = hook.involvedCharacterIds[i];
        if (!this.characters.has(cid)) {
          pushDiag(
            "orphaned-hook-entity",
            "warning",
            "foreshadow",
            hook.hookId,
            hook.plantedEpisode,
            `복선 '${hook.title}'이(가) 미등록 캐릭터(${cid})를 참조합니다.`,
          );
        }
      }
      for (let i = 0; i < hook.involvedPropIds.length; i += 1) {
        const pid = hook.involvedPropIds[i];
        if (!this.props.has(pid)) {
          pushDiag(
            "orphaned-hook-entity",
            "warning",
            "foreshadow",
            hook.hookId,
            hook.plantedEpisode,
            `복선 '${hook.title}'이(가) 미등록 소품(${pid})을 참조합니다.`,
          );
        }
      }

      if (hook.resolvedEpisode !== undefined && hook.resolvedEpisode < hook.plantedEpisode) {
        pushDiag(
          "resolved-before-planted",
          "error",
          "foreshadow",
          hook.hookId,
          hook.resolvedEpisode,
          `복선 '${hook.title}'의 회수(${hook.resolvedEpisode}화)가 설치(${hook.plantedEpisode}화)보다 앞섭니다.`,
        );
      }

      if (hook.status === "resolved") {
        resolvedHookCount += 1;
        return;
      }
      if (hook.status === "abandoned") return;

      unresolvedHooks.push(hook);
      const lastTouchedEp =
        hook.callbackEpisodes.length > 0
          ? hook.callbackEpisodes[hook.callbackEpisodes.length - 1]
          : hook.plantedEpisode;
      const pastDeadline =
        hook.expectedPayoffByEpisode !== undefined &&
        currentEpisode > hook.expectedPayoffByEpisode;
      const staleEpisodes = currentEpisode - lastTouchedEp;

      if (pastDeadline || staleEpisodes >= staleGap) {
        const severity: ContinuityDiagnosticSeverity =
          pastDeadline && hook.importance === "arc-critical" ? "error" : "warning";
        pushDiag(
          "unresolved-chekhov-gun",
          severity,
          "foreshadow",
          hook.hookId,
          hook.plantedEpisode,
          pastDeadline
            ? `핵심 복선 '${hook.title}'이(가) 목표 회수 시점(${hook.expectedPayoffByEpisode}화)을 지나 ${currentEpisode}화까지 미회수 상태입니다.`
            : `복선 '${hook.title}'이(가) 마지막 언급(${lastTouchedEp}화) 이후 ${staleEpisodes}화 동안 미회수 방치되었습니다.`,
        );
      }
    });

    let errorCount = 0;
    let warningCount = 0;
    for (let i = 0; i < diagnostics.length; i += 1) {
      if (diagnostics[i].severity === "error") errorCount += 1;
      else if (diagnostics[i].severity === "warning") warningCount += 1;
    }

    return {
      currentEpisode,
      characterCount: this.characters.size,
      relationshipCount: this.relationships.size,
      propCount: this.props.size,
      hookCount: this.hooks.size,
      unresolvedHookCount: unresolvedHooks.length,
      resolvedHookCount,
      errorCount,
      warningCount,
      healthScore: Math.max(0, Math.min(100, Math.round(100 - errorCount * 14 - warningCount * 4))),
      indexedTermCount: this.invertedIndex.size,
      unresolvedHooks,
      diagnostics,
      elapsedMs: Number((performance.now() - startMs).toFixed(3)),
      aiTokensUsed: 0,
    };
  }

  private indexForeshadowHook(record: ForeshadowHookRecord): void {
    const maxEp = Math.max(
      record.plantedEpisode,
      record.resolvedEpisode ?? record.plantedEpisode,
      record.callbackEpisodes.length > 0
        ? record.callbackEpisodes[record.callbackEpisodes.length - 1]
        : record.plantedEpisode,
    );
    this.reindexDocument(
      "foreshadow",
      record.hookId,
      record.title,
      record.plantedEpisode,
      maxEp,
      [
        record.title,
        record.summary,
        record.payoffSummary ?? "",
        record.status,
        record.importance,
        ...record.involvedCharacterIds,
        ...record.involvedPropIds,
      ].join(" "),
    );
  }

  private reindexDocument(
    entityType: ContinuityEntityType,
    entityId: string,
    title: string,
    minEpisode: number,
    maxEpisode: number,
    corpusText: string,
  ): void {
    const docKey = `${entityType}:${entityId}`;
    const existing = this.docMeta.get(docKey);
    if (existing) {
      existing.termWeights.forEach((_weight, term) => {
        const postings = this.invertedIndex.get(term);
        if (postings) {
          postings.delete(docKey);
          if (postings.size === 0) this.invertedIndex.delete(term);
        }
      });
    }

    const termWeights = tokenizeContinuityText(corpusText);
    const meta: IndexedDocumentMeta = {
      docKey,
      entityType,
      entityId,
      title,
      minEpisode,
      maxEpisode,
      termWeights,
    };
    this.docMeta.set(docKey, meta);

    termWeights.forEach((_weight, term) => {
      let postings = this.invertedIndex.get(term);
      if (!postings) {
        postings = new Set<string>();
        this.invertedIndex.set(term, postings);
      }
      postings.add(docKey);
    });
  }
}
