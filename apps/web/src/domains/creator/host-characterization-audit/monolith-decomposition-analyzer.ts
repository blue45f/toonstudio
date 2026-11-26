/**
 * 거대 스튜디오 모놀리스 정적 경계 분해 분석기 및 레거시 npm 의존성 래칫 감사기.
 */

import {
  computeFnv1a32Hex,
  LEGACY_WASM64_PACKAGE_TARGETS,
  LEGACY_WASM64_RATCHET_PACKAGES,
  scoreDomainByText,
  STUDIO_MONOLITH_DOMAINS,
  type DependencyImportFinding,
  type DependencyRatchetAuditInput,
  type DependencyRatchetAuditReport,
  type DomainClusterSummary,
  type HookGroupCluster,
  type LegacyWasm64PackageName,
  type MonolithDecompositionReport,
  type MonolithDomainId,
  type MonolithImportNode,
  type MonolithSourceInput,
  type PackageRatchetAuditStatus,
  type PureHelperCandidate,
  type PureHelperPurityTier,
  type StateTransitionCluster,
  type StranglerFigExtractionStep,
} from "./monolith-audit-types";
import {
  classifyImportCategory,
  classifySourceFileRole,
  countSourceLines,
  extractImportsFromTokens,
  extractModuleImportRecords,
  normalizeBarePackageName,
  tokenizeSource,
} from "./ts-lexical-tokenizer";
import {
  extractScopeUnits,
  type ExtractedUnit,
} from "./ts-scope-unit-extractor";

export * from "./monolith-audit-types";
export {
  classifyImportCategory,
  classifySourceFileRole,
  countSourceLines,
  extractModuleImportRecords,
  normalizeBarePackageName,
} from "./ts-lexical-tokenizer";

export function analyzeMonolithDecomposition(
  input: MonolithSourceInput,
): MonolithDecompositionReport {
  const totalLines = countSourceLines(input.sourceText);
  const tokens = tokenizeSource(input.sourceText);
  const rawImports = extractImportsFromTokens(tokens);

  const importBindingToDomain = new Map<string, MonolithDomainId>();
  const importBindingToSpecIdx = new Map<string, number>();
  const importUsageCounts = new Int32Array(rawImports.length);
  const importDomains: MonolithDomainId[] = [];

  for (let i = 0; i < rawImports.length; i += 1) {
    const imp = rawImports[i];
    if (imp === undefined) continue;
    const dom = scoreDomainByText(`${imp.specifier} ${imp.valueBindings.join(" ")}`);
    importDomains.push(dom);
    const isGenericFramework = imp.specifier === "react" || imp.specifier === "react-dom" || imp.specifier === "lucide-react";
    for (const vb of imp.valueBindings) {
      if (!isGenericFramework) importBindingToDomain.set(vb, dom);
      importBindingToSpecIdx.set(vb, i);
    }
  }

  const statePairs = new Map<string, string>();
  const refNames = new Set<string>();
  const topBindings = new Set<string>();
  const topUnits = extractScopeUnits(tokens, 0, tokens.length - 1, 0, statePairs, refNames, topBindings);

  let hostEntry: ExtractedUnit | null = null;
  for (const u of topUnits) {
    if (
      u.kind === "function"
      && !u.isAsync
      && u.invokedHooks.length > 0
      && u.lineCount >= 200
      && (hostEntry === null || u.lineCount > hostEntry.lineCount)
    ) {
      hostEntry = u;
    }
  }

  const hostBindings = new Set<string>();
  let innerUnits: ExtractedUnit[] = [];
  if (hostEntry !== null) {
    for (const p of hostEntry.paramNames) hostBindings.add(p);
    innerUnits = extractScopeUnits(
      tokens,
      hostEntry.bodyStartTokenIdx,
      hostEntry.bodyEndTokenIdx,
      1,
      statePairs,
      refNames,
      hostBindings,
    );
  }

  const activeUnits = hostEntry !== null
    ? [...topUnits.filter((u) => u.id !== hostEntry.id), ...innerUnits]
    : topUnits;

  const unitNameMap = new Map<string, ExtractedUnit>();
  for (const u of activeUnits) {
    const votes = new Map<MonolithDomainId, number>();
    votes.set(u.domainId, 3);
    for (const ref of u.referencedIdents) {
      const impDom = importBindingToDomain.get(ref);
      if (impDom !== undefined) votes.set(impDom, (votes.get(impDom) ?? 0) + 2);
      const specIdx = importBindingToSpecIdx.get(ref);
      if (specIdx !== undefined) importUsageCounts[specIdx] += 1;
    }
    let winner = u.domainId;
    let maxVote = -1;
    for (const d of STUDIO_MONOLITH_DOMAINS) {
      const v = votes.get(d.id) ?? 0;
      if (v > maxVote) {
        maxVote = v;
        winner = d.id;
      }
    }
    u.domainId = winner;
    if (!unitNameMap.has(u.name)) unitNameMap.set(u.name, u);
  }

  const imports: MonolithImportNode[] = rawImports.map((imp, idx) => ({
    specifier: imp.specifier,
    domainId: importDomains[idx] ?? "workspace-shell-i18n",
    importCategory: classifyImportCategory(imp.specifier),
    valueBindings: imp.valueBindings,
    typeBindings: imp.typeBindings,
    fanInUsageCount: importUsageCounts[idx] ?? 0,
    line: imp.line,
  }));

  const domainIntraEdges = new Map<MonolithDomainId, number>();
  const domainFanIn = new Map<MonolithDomainId, number>();
  const domainFanOut = new Map<MonolithDomainId, number>();
  let totalEdges = 0;

  const recordDirectedEdge = (srcDomain: MonolithDomainId, dstDomain: MonolithDomainId): void => {
    totalEdges += 1;
    domainFanOut.set(srcDomain, (domainFanOut.get(srcDomain) ?? 0) + 1);
    domainFanIn.set(dstDomain, (domainFanIn.get(dstDomain) ?? 0) + 1);
    if (srcDomain === dstDomain) {
      domainIntraEdges.set(srcDomain, (domainIntraEdges.get(srcDomain) ?? 0) + 1);
    }
  };

  for (const u of activeUnits) {
    const seenSpecs = new Set<number>();
    for (const ref of u.referencedIdents) {
      if (ref === u.name || u.paramNames.has(ref) || u.localDeclaredNames.has(ref)) continue;
      const specIdx = importBindingToSpecIdx.get(ref);
      if (specIdx !== undefined && !seenSpecs.has(specIdx)) {
        seenSpecs.add(specIdx);
        recordDirectedEdge(u.domainId, importDomains[specIdx] ?? u.domainId);
      }
      const targetUnit = unitNameMap.get(ref);
      if (targetUnit !== undefined && targetUnit.id !== u.id) {
        recordDirectedEdge(u.domainId, targetUnit.domainId);
      }
    }
  }

  let modularityQ = 0;
  const domainClusters: DomainClusterSummary[] = [];
  for (const desc of STUDIO_MONOLITH_DOMAINS) {
    const domUnits = activeUnits.filter((u) => u.domainId === desc.id);
    const domImports = imports.filter((im) => im.domainId === desc.id);
    const intra = domainIntraEdges.get(desc.id) ?? 0;
    const fIn = domainFanIn.get(desc.id) ?? 0;
    const fOut = domainFanOut.get(desc.id) ?? 0;
    const contrib = totalEdges > 0 ? intra / totalEdges - (fOut / totalEdges) * (fIn / totalEdges) : 0;
    modularityQ += contrib;
    const degreeSum = fIn + fOut;
    domainClusters.push({
      domainId: desc.id,
      labelKo: desc.labelKo,
      unitCount: domUnits.length,
      importCount: domImports.length,
      totalLineSpan: domUnits.reduce((acc, u) => acc + u.lineCount, 0),
      intraClusterEdges: intra,
      fanIn: fIn,
      fanOut: fOut,
      instabilityIndex: degreeSum > 0 ? Number((fOut / degreeSum).toFixed(4)) : 0,
      modularityContribution: Number(contrib.toFixed(6)),
    });
  }
  const roundedModularityQ = Number(modularityQ.toFixed(6));

  let totalHookCallCount = 0;
  const hookGroups: HookGroupCluster[] = [];
  for (const desc of STUDIO_MONOLITH_DOMAINS) {
    const domUnits = activeUnits.filter((u) => u.domainId === desc.id && u.invokedHooks.length > 0);
    if (domUnits.length === 0) continue;
    let hookCalls = 0;
    let stateCells = 0;
    let refCells = 0;
    let effects = 0;
    let memoCallbacks = 0;
    const customHooks = new Set<string>();
    const ownedStates: string[] = [];

    for (const u of domUnits) {
      for (const h of u.invokedHooks) {
        hookCalls += 1;
        totalHookCallCount += 1;
        if (h === "useState" || h === "useReducer") {
          stateCells += 1;
          ownedStates.push(u.name);
        } else if (h === "useRef") refCells += 1;
        else if (h === "useEffect" || h === "useLayoutEffect" || h === "useEffectEvent") effects += 1;
        else if (h === "useMemo" || h === "useCallback") memoCallbacks += 1;
        else customHooks.add(h);
      }
    }
    hookGroups.push({
      domainId: desc.id,
      domainLabelKo: desc.labelKo,
      suggestedHookName: `useStudio${desc.hookStem}Cluster`,
      totalHookCalls: hookCalls,
      stateCellCount: stateCells,
      refCellCount: refCells,
      effectCount: effects,
      memoAndCallbackCount: memoCallbacks,
      customHookNames: [...customHooks].sort(),
      ownedStateNames: ownedStates.sort(),
      estimatedLineLoad: domUnits.reduce((acc, u) => acc + u.lineCount, 0),
    });
  }

  const setterToDomain = new Map<string, MonolithDomainId>();
  for (const [setter, valName] of statePairs) {
    const owner = unitNameMap.get(valName);
    setterToDomain.set(setter, owner?.domainId ?? scoreDomainByText(`${valName}_${setter}`));
  }

  const stateTransitionClusters: StateTransitionCluster[] = [];
  for (const desc of STUDIO_MONOLITH_DOMAINS) {
    const stateVars = new Set<string>();
    const setters = new Set<string>();
    const mutatedRefs = new Set<string>();
    const transitionUnits = new Set<string>();
    let intraTransitions = 0;
    let crossFanIn = 0;

    for (const [setter, valName] of statePairs) {
      if (setterToDomain.get(setter) === desc.id) {
        stateVars.add(valName);
        setters.add(setter);
      }
    }
    for (const u of activeUnits) {
      let touchesCluster = false;
      for (const ref of u.referencedIdents) {
        if (setters.has(ref)) {
          touchesCluster = true;
          if (u.domainId === desc.id) intraTransitions += 1;
          else crossFanIn += 1;
        }
      }
      if (u.domainId === desc.id && u.mutatedRefs.length > 0) {
        touchesCluster = true;
        for (const mr of u.mutatedRefs) mutatedRefs.add(mr);
        intraTransitions += u.mutatedRefs.length;
      }
      if (touchesCluster && u.kind !== "state-binding") transitionUnits.add(u.name);
    }

    if (stateVars.size === 0 && mutatedRefs.size === 0) continue;
    const totalTrans = intraTransitions + crossFanIn;
    const cohesion = totalTrans > 0 ? Number((intraTransitions / totalTrans).toFixed(4)) : 1;
    const recommendedPattern: StateTransitionCluster["recommendedPattern"] =
      stateVars.size >= 4 && cohesion >= 0.65
        ? "reducer-state-machine"
        : mutatedRefs.size > stateVars.size ? "domain-runtime-hook" : "pure-transition-helper";

    stateTransitionClusters.push({
      clusterId: `state-cluster:${desc.id}`,
      domainId: desc.id,
      domainLabelKo: desc.labelKo,
      stateVariables: [...stateVars].sort(),
      setterNames: [...setters].sort(),
      mutatedRefNames: [...mutatedRefs].sort(),
      transitionUnitNames: [...transitionUnits].sort(),
      intraDomainTransitions: intraTransitions,
      crossDomainFanIn: crossFanIn,
      cohesionScore: cohesion,
      recommendedPattern,
    });
  }

  const pureHelperCandidates: PureHelperCandidate[] = [];
  for (const u of activeUnits) {
    if ((u.kind !== "function" && u.kind !== "arrow-fn") || u.lineCount < 3 || u.isAsync) continue;
    if (u.invokedHooks.length > 0 || u.mutatedRefs.length > 0 || u.touchesAmbientGlobal) continue;

    let callsStateSetter = false;
    const capturedHost: string[] = [];
    const importedDeps: string[] = [];

    for (const ref of u.referencedIdents) {
      if (ref === u.name || u.paramNames.has(ref) || u.localDeclaredNames.has(ref)) continue;
      if (statePairs.has(ref) || refNames.has(ref)) {
        callsStateSetter = true;
        break;
      }
      if (importBindingToDomain.has(ref)) importedDeps.push(ref);
      else if (u.scopeDepth === 1 && hostBindings.has(ref)) capturedHost.push(ref);
    }
    if (callsStateSetter || capturedHost.length > 3) continue;

    const sortedCaptured = [...new Set(capturedHost)].sort();
    const sortedImported = [...new Set(importedDeps)].sort();
    const purityTier: PureHelperPurityTier = sortedCaptured.length === 0 ? "zero-capture-pure" : "read-only-parameterizable";
    const extractionScore = Number(
      (u.lineCount * (purityTier === "zero-capture-pure" ? 2.0 : 1.25) - sortedCaptured.length * 2).toFixed(2),
    );
    pureHelperCandidates.push({
      name: u.name,
      startLine: u.startLine,
      endLine: u.endLine,
      lineCount: u.lineCount,
      scopeDepth: u.scopeDepth,
      domainId: u.domainId,
      purityTier,
      capturedReadOnlyBindings: sortedCaptured,
      importedDependencies: sortedImported,
      extractionScore,
      rationaleKo:
        purityTier === "zero-capture-pure"
          ? "컴포넌트 상태·Ref·브라우저 전역 캡처가 0건이어서 시그니처 변경 없이 즉시 독립 모듈로 분리 가능"
          : `상태·Ref 변이가 없고 읽기 전용 바인딩(${sortedCaptured.join(", ")})만 명시 인자로 승격하면 무부작용 분리 가능`,
    });
  }
  pureHelperCandidates.sort(
    (a, b) => b.extractionScore - a.extractionScore || a.startLine - b.startLine || a.name.localeCompare(b.name),
  );

  const rawSteps: Omit<StranglerFigExtractionStep, "stepOrder">[] = [];
  for (const desc of STUDIO_MONOLITH_DOMAINS) {
    const domPure = pureHelperCandidates.filter((p) => p.domainId === desc.id);
    if (domPure.length > 0) {
      rawSteps.push({
        phase: "phase-1-pure-helpers",
        domainId: desc.id,
        targetModulePath: `./extracted/${desc.id}-pure-helpers.ts`,
        symbolNames: domPure.slice(0, 12).map((p) => p.name),
        estimatedLinesExtracted: domPure.reduce((acc, p) => acc + p.lineCount, 0),
        crossClusterFanIn: 0,
        crossClusterFanOut: domPure.reduce((acc, p) => acc + p.importedDependencies.length, 0),
        riskLevel: "low",
        runtimePreservationNoteKo: "렌더 주기·훅 호출 순서와 무관한 순수 계산 함수만 선행 추출해 단위 테스트로 고정",
      });
    }
  }

  const sortedStateClusters = [...stateTransitionClusters].sort(
    (a, b) => a.crossDomainFanIn - b.crossDomainFanIn || b.cohesionScore - a.cohesionScore || a.domainId.localeCompare(b.domainId),
  );
  for (const sc of sortedStateClusters) {
    const clusterSummary = domainClusters.find((c) => c.domainId === sc.domainId);
    rawSteps.push({
      phase: "phase-2-leaf-state-clusters",
      domainId: sc.domainId,
      targetModulePath: `./extracted/${sc.domainId}-state-transitions.ts`,
      symbolNames: [...sc.setterNames, ...sc.transitionUnitNames].slice(0, 12),
      estimatedLinesExtracted: Math.max(24, sc.transitionUnitNames.length * 14),
      crossClusterFanIn: sc.crossDomainFanIn,
      crossClusterFanOut: clusterSummary?.fanOut ?? 0,
      riskLevel: sc.crossDomainFanIn <= 2 ? "low" : "medium",
      runtimePreservationNoteKo: "상태 전이 규칙을 순수 리듀서/전이 어댑터로 위임하고 호스트 JSX 바인딩 계약은 동일하게 유지",
    });
  }

  const sortedHookGroups = [...hookGroups].sort((a, b) => {
    const ca = domainClusters.find((c) => c.domainId === a.domainId);
    const cb = domainClusters.find((c) => c.domainId === b.domainId);
    return (ca?.fanIn ?? 0) - (cb?.fanIn ?? 0) || b.estimatedLineLoad - a.estimatedLineLoad || a.domainId.localeCompare(b.domainId);
  });
  for (const hg of sortedHookGroups) {
    const cs = domainClusters.find((c) => c.domainId === hg.domainId);
    rawSteps.push({
      phase: "phase-3-domain-hook-facades",
      domainId: hg.domainId,
      targetModulePath: `./extracted/${hg.suggestedHookName}.ts`,
      symbolNames: [hg.suggestedHookName, ...hg.customHookNames.slice(0, 8)],
      estimatedLinesExtracted: hg.estimatedLineLoad,
      crossClusterFanIn: cs?.fanIn ?? 0,
      crossClusterFanOut: cs?.fanOut ?? 0,
      riskLevel: (cs?.fanIn ?? 0) <= 10 ? "low" : "medium",
      runtimePreservationNoteKo: "동일한 React 훅 호출 순서와 반환 슬롯 계약을 유지하는 파사드 훅으로 감싸 점진 교체",
    });
  }

  const stranglerFigOrder: StranglerFigExtractionStep[] = rawSteps.map((step, index) => ({
    stepOrder: index + 1,
    ...step,
  }));

  const canonicalSummary = JSON.stringify({
    filePath: input.filePath,
    totalLines,
    staticImportCount: imports.length,
    extractedUnitCount: activeUnits.length,
    modularityScoreQ: roundedModularityQ,
    clusters: domainClusters.map((c) => [c.domainId, c.unitCount, c.importCount, c.fanIn, c.fanOut]),
    steps: stranglerFigOrder.map((s) => [s.stepOrder, s.phase, s.domainId, s.targetModulePath]),
  });

  return {
    filePath: input.filePath,
    totalLines,
    isHostComponentMonolith: hostEntry !== null,
    hostEntryName: hostEntry?.name ?? null,
    staticImportCount: imports.length,
    extractedUnitCount: activeUnits.length,
    totalHookCallCount,
    directedEdgeCount: totalEdges,
    modularityScoreQ: roundedModularityQ,
    imports,
    domainClusters,
    hookGroups,
    stateTransitionClusters,
    pureHelperCandidates,
    stranglerFigOrder,
    planDeterminismDigest: computeFnv1a32Hex(canonicalSummary),
  };
}

export function auditLegacyDependencyRatchet(
  input: DependencyRatchetAuditInput,
): DependencyRatchetAuditReport {
  const targets = input.targetPackages ?? LEGACY_WASM64_RATCHET_PACKAGES;
  const targetSet = new Set<string>(targets);
  const prodFilesByPkg = new Map<LegacyWasm64PackageName, Set<string>>();
  const testFilesByPkg = new Map<LegacyWasm64PackageName, Set<string>>();
  const prodCountByPkg = new Map<LegacyWasm64PackageName, number>();
  const testCountByPkg = new Map<LegacyWasm64PackageName, number>();
  for (const pkg of targets) {
    prodFilesByPkg.set(pkg, new Set());
    testFilesByPkg.set(pkg, new Set());
    prodCountByPkg.set(pkg, 0);
    testCountByPkg.set(pkg, 0);
  }

  const prodRegressions: DependencyImportFinding[] = [];
  let scannedFileCount = 0;
  let productionFileCount = 0;
  let testFileCount = 0;
  let ambientDtsFileCount = 0;
  const backslashChar = String.fromCharCode(92);

  for (const entry of input.files) {
    scannedFileCount += 1;
    const role = classifySourceFileRole(entry.filePath);
    if (role === "production") productionFileCount += 1;
    else if (role === "test") testFileCount += 1;
    else {
      ambientDtsFileCount += 1;
      continue;
    }

    let mayMatch = entry.content.includes(backslashChar);
    if (!mayMatch) {
      for (const pkg of targets) {
        if (entry.content.includes(pkg)) {
          mayMatch = true;
          break;
        }
      }
    }
    if (!mayMatch) continue;

    const normalizedPath = entry.filePath.split(backslashChar).join("/");
    const imports = extractModuleImportRecords(entry.content);
    for (const imp of imports) {
      const bare = normalizeBarePackageName(imp.specifier);
      if (bare === null || !targetSet.has(bare)) continue;
      const pkgName = bare as LegacyWasm64PackageName;
      if (role === "production") {
        prodCountByPkg.set(pkgName, (prodCountByPkg.get(pkgName) ?? 0) + 1);
        prodFilesByPkg.get(pkgName)?.add(normalizedPath);
        prodRegressions.push({
          packageName: pkgName,
          specifier: imp.specifier,
          filePath: normalizedPath,
          fileRole: role,
          line: imp.line,
          importKind: imp.importKind,
        });
      } else {
        testCountByPkg.set(pkgName, (testCountByPkg.get(pkgName) ?? 0) + 1);
        testFilesByPkg.get(pkgName)?.add(normalizedPath);
      }
    }
  }

  prodRegressions.sort(
    (a, b) => a.packageName.localeCompare(b.packageName) || a.filePath.localeCompare(b.filePath) || a.line - b.line,
  );

  let totalProdImports = 0;
  let totalTestImports = 0;
  const packages: PackageRatchetAuditStatus[] = targets.map((pkg) => {
    const meta = LEGACY_WASM64_PACKAGE_TARGETS[pkg];
    const depVer = input.manifest?.dependencies?.[pkg];
    const devDepVer = input.manifest?.devDependencies?.[pkg];
    const manifestSection: PackageRatchetAuditStatus["manifestSection"] =
      depVer !== undefined ? "dependencies" : devDepVer !== undefined ? "devDependencies" : "unlisted";
    const manifestVersion = depVer ?? devDepVer ?? null;
    const prodCount = prodCountByPkg.get(pkg) ?? 0;
    const testCount = testCountByPkg.get(pkg) ?? 0;
    totalProdImports += prodCount;
    totalTestImports += testCount;
    return {
      packageName: pkg,
      cutoverWave: meta.wave,
      rustTarget: meta.rustTarget,
      domainKo: meta.domainKo,
      manifestSection,
      manifestVersion,
      prodImportCount: prodCount,
      prodImportFiles: [...(prodFilesByPkg.get(pkg) ?? [])].sort(),
      testImportCount: testCount,
      testImportFiles: [...(testFilesByPkg.get(pkg) ?? [])].sort(),
      readyForManifestRemoval: prodCount === 0 && testCount === 0,
      ratchetClean: prodCount === 0,
    };
  });

  const digestPayload = JSON.stringify({
    productionFileCount,
    packages: packages.map((p) => [p.packageName, p.prodImportCount, p.testImportCount, p.manifestSection]),
  });

  return {
    scannedFileCount,
    productionFileCount,
    testFileCount,
    ambientDtsFileCount,
    targetPackages: targets,
    totalProdImports,
    totalTestImports,
    ratchetPassed: totalProdImports === 0,
    packages,
    prodRegressions,
    auditDeterminismDigest: computeFnv1a32Hex(digestPayload),
  };
}
