/**
 * 거대 스튜디오 모놀리스 분해 분석기 및 레거시 의존성 래칫 감사기의 도메인 모델·타입 정의.
 */

export const LEGACY_WASM64_RATCHET_PACKAGES = [
  "bezier-js",
  "lazy-brush",
  "simplify-js",
  "fit-curve",
  "colormix",
  "colorjs.io",
  "rbush",
] as const;

export type LegacyWasm64PackageName = (typeof LEGACY_WASM64_RATCHET_PACKAGES)[number];

export interface LegacyPackageTargetMeta {
  readonly wave: 1 | 2;
  readonly rustTarget: string;
  readonly domainKo: string;
}

export const LEGACY_WASM64_PACKAGE_TARGETS: Readonly<
  Record<LegacyWasm64PackageName, LegacyPackageTargetMeta>
> = {
  "bezier-js": {
    wave: 1,
    rustTarget: "studio-wasm64-drawing-core::vector_psd_tile_kernel",
    domainKo: "3차 베지어 곡선 기하·분할",
  },
  "lazy-brush": {
    wave: 1,
    rustTarget: "studio-wasm64-drawing-core::brush_kernel",
    domainKo: "가상 현 포인터 손떨림 보정",
  },
  "simplify-js": {
    wave: 1,
    rustTarget: "studio-wasm64-drawing-core::vector_psd_tile_kernel",
    domainKo: "Ramer-Douglas-Peucker 폴리라인 단순화",
  },
  "fit-curve": {
    wave: 1,
    rustTarget: "studio-wasm64-drawing-core::vector_psd_tile_kernel",
    domainKo: "Schneider 최소제곱 베지어 피팅",
  },
  colormix: {
    wave: 1,
    rustTarget: "studio-wasm64-drawing-core::spectral_km_kernel",
    domainKo: "Kubelka-Munk 분광 안료 혼색",
  },
  "colorjs.io": {
    wave: 1,
    rustTarget: "culori + studio-wasm64-drawing-core::oklch_gamut",
    domainKo: "OKLCH 색공간·대비율 연산",
  },
  rbush: {
    wave: 2,
    rustTarget: "studio-wasm64-drawing-core::simd_bvh_skinning_kernel",
    domainKo: "2D AABB 공간 색인(Morton BVH)",
  },
};

export type MonolithDomainId =
  | "brush-ink"
  | "canvas-viewport"
  | "layers-document-history"
  | "persistence-recovery"
  | "collab-live"
  | "ai-assist"
  | "spatial-3d-dcc"
  | "lettering-color-export"
  | "workspace-shell-i18n";

export interface MonolithDomainDescriptor {
  readonly id: MonolithDomainId;
  readonly labelKo: string;
  readonly hookStem: string;
  readonly keywords: readonly string[];
}

export const STUDIO_MONOLITH_DOMAINS: readonly MonolithDomainDescriptor[] = [
  {
    id: "brush-ink",
    labelKo: "브러시·잉킹·필압 엔진",
    hookStem: "BrushInk",
    keywords: [
      "brush", "stroke", "ink", "eraser", "stamp", "pressure", "stabiliz",
      "hokusai", "bristle", "symmetry", "wet", "mypaint", "draw", "pen",
    ],
  },
  {
    id: "canvas-viewport",
    labelKo: "캔버스 뷰포트·선택·변형",
    hookStem: "CanvasViewport",
    keywords: [
      "canvas", "viewport", "zoom", "pan", "grid", "ruler", "snap", "minimap",
      "pointer", "gesture", "selection", "resize", "transform", "lasso", "smartshape", "stage",
    ],
  },
  {
    id: "layers-document-history",
    labelKo: "레이어·문서 모델·실행취소 이력",
    hookStem: "LayersHistory",
    keywords: [
      "layer", "page", "pages", "history", "undo", "redo", "filter", "raster",
      "blend", "mask", "clip", "group", "master", "adjustment",
    ],
  },
  {
    id: "persistence-recovery",
    labelKo: "로컬 영속성·자동저장·복구",
    hookStem: "PersistenceRecovery",
    keywords: [
      "autosave", "save", "recovery", "backup", "hydrat", "persist", "opfs",
      "sqlite", "checkpoint", "tombstone", "package", "seed",
    ],
  },
  {
    id: "collab-live",
    labelKo: "실시간 협업·CRDT·코멘트",
    hookStem: "CollabLive",
    keywords: [
      "live", "crdt", "yjs", "room", "comment", "collab", "peer", "huddle",
      "presence", "transport", "leader",
    ],
  },
  {
    id: "ai-assist",
    labelKo: "AI 보조·채색·프로비넌스",
    hookStem: "AiAssist",
    keywords: [
      "ai", "colorize", "prompt", "provenance", "scenario", "writerroom",
      "assistant", "supersuite", "reference",
    ],
  },
  {
    id: "spatial-3d-dcc",
    labelKo: "3D 배경·VRM·하이브리드 DCC",
    hookStem: "Spatial3dDcc",
    keywords: [
      "bg3d", "scene3d", "vrm", "pose", "shaper", "dcc", "glb", "three",
      "camera", "mannequin",
    ],
  },
  {
    id: "lettering-color-export",
    labelKo: "식자·색교정·출판 내보내기",
    hookStem: "LetteringColorExport",
    keywords: [
      "bubble", "letter", "text", "font", "sfx", "color", "palette", "proof",
      "export", "publish", "publication", "review", "episode", "timelapse", "macro",
    ],
  },
  {
    id: "workspace-shell-i18n",
    labelKo: "워크스페이스 셸·메뉴·다국어",
    hookStem: "WorkspaceShell",
    keywords: [
      "workspace", "inspector", "menu", "panel", "rail", "shortcut", "tutorial",
      "i18n", "locale", "translate", "mobile", "companion", "route", "session", "density",
    ],
  },
];

export type ImportCategory = "relative" | "workspace-alias" | "external-package" | "node-builtin";

export interface MonolithImportNode {
  readonly specifier: string;
  readonly domainId: MonolithDomainId;
  readonly importCategory: ImportCategory;
  readonly valueBindings: readonly string[];
  readonly typeBindings: readonly string[];
  readonly fanInUsageCount: number;
  readonly line: number;
}

export interface HookGroupCluster {
  readonly domainId: MonolithDomainId;
  readonly domainLabelKo: string;
  readonly suggestedHookName: string;
  readonly totalHookCalls: number;
  readonly stateCellCount: number;
  readonly refCellCount: number;
  readonly effectCount: number;
  readonly memoAndCallbackCount: number;
  readonly customHookNames: readonly string[];
  readonly ownedStateNames: readonly string[];
  readonly estimatedLineLoad: number;
}

export interface StateTransitionCluster {
  readonly clusterId: string;
  readonly domainId: MonolithDomainId;
  readonly domainLabelKo: string;
  readonly stateVariables: readonly string[];
  readonly setterNames: readonly string[];
  readonly mutatedRefNames: readonly string[];
  readonly transitionUnitNames: readonly string[];
  readonly intraDomainTransitions: number;
  readonly crossDomainFanIn: number;
  readonly cohesionScore: number;
  readonly recommendedPattern:
    | "reducer-state-machine"
    | "domain-runtime-hook"
    | "pure-transition-helper";
}

export type PureHelperPurityTier = "zero-capture-pure" | "read-only-parameterizable";

export interface PureHelperCandidate {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly scopeDepth: 0 | 1;
  readonly domainId: MonolithDomainId;
  readonly purityTier: PureHelperPurityTier;
  readonly capturedReadOnlyBindings: readonly string[];
  readonly importedDependencies: readonly string[];
  readonly extractionScore: number;
  readonly rationaleKo: string;
}

export interface DomainClusterSummary {
  readonly domainId: MonolithDomainId;
  readonly labelKo: string;
  readonly unitCount: number;
  readonly importCount: number;
  readonly totalLineSpan: number;
  readonly intraClusterEdges: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly instabilityIndex: number;
  readonly modularityContribution: number;
}

export type StranglerExtractionPhase =
  | "phase-1-pure-helpers"
  | "phase-2-leaf-state-clusters"
  | "phase-3-domain-hook-facades";

export interface StranglerFigExtractionStep {
  readonly stepOrder: number;
  readonly phase: StranglerExtractionPhase;
  readonly domainId: MonolithDomainId;
  readonly targetModulePath: string;
  readonly symbolNames: readonly string[];
  readonly estimatedLinesExtracted: number;
  readonly crossClusterFanIn: number;
  readonly crossClusterFanOut: number;
  readonly riskLevel: "low" | "medium";
  readonly runtimePreservationNoteKo: string;
}

export interface MonolithSourceInput {
  readonly filePath: string;
  readonly sourceText: string;
}

export interface MonolithDecompositionReport {
  readonly filePath: string;
  readonly totalLines: number;
  readonly isHostComponentMonolith: boolean;
  readonly hostEntryName: string | null;
  readonly staticImportCount: number;
  readonly extractedUnitCount: number;
  readonly totalHookCallCount: number;
  readonly directedEdgeCount: number;
  readonly modularityScoreQ: number;
  readonly imports: readonly MonolithImportNode[];
  readonly domainClusters: readonly DomainClusterSummary[];
  readonly hookGroups: readonly HookGroupCluster[];
  readonly stateTransitionClusters: readonly StateTransitionCluster[];
  readonly pureHelperCandidates: readonly PureHelperCandidate[];
  readonly stranglerFigOrder: readonly StranglerFigExtractionStep[];
  readonly planDeterminismDigest: string;
}

export type SourceFileRole = "production" | "test" | "ambient-dts";

export type ImportSyntaxKind =
  | "static-import"
  | "static-type-import"
  | "side-effect-import"
  | "re-export"
  | "dynamic-import"
  | "commonjs-require";

export interface ExtractedImportRecord {
  readonly specifier: string;
  readonly importKind: ImportSyntaxKind;
  readonly valueBindings: readonly string[];
  readonly typeBindings: readonly string[];
  readonly line: number;
}

export interface SourceFileEntry {
  readonly filePath: string;
  readonly content: string;
}

export interface PackageManifestInput {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export interface DependencyImportFinding {
  readonly packageName: LegacyWasm64PackageName;
  readonly specifier: string;
  readonly filePath: string;
  readonly fileRole: SourceFileRole;
  readonly line: number;
  readonly importKind: ImportSyntaxKind;
}

export interface PackageRatchetAuditStatus {
  readonly packageName: LegacyWasm64PackageName;
  readonly cutoverWave: 1 | 2;
  readonly rustTarget: string;
  readonly domainKo: string;
  readonly manifestSection: "dependencies" | "devDependencies" | "unlisted";
  readonly manifestVersion: string | null;
  readonly prodImportCount: number;
  readonly prodImportFiles: readonly string[];
  readonly testImportCount: number;
  readonly testImportFiles: readonly string[];
  readonly readyForManifestRemoval: boolean;
  readonly ratchetClean: boolean;
}

export interface DependencyRatchetAuditInput {
  readonly files: Iterable<SourceFileEntry>;
  readonly manifest?: PackageManifestInput;
  readonly targetPackages?: readonly LegacyWasm64PackageName[];
}

export interface DependencyRatchetAuditReport {
  readonly scannedFileCount: number;
  readonly productionFileCount: number;
  readonly testFileCount: number;
  readonly ambientDtsFileCount: number;
  readonly targetPackages: readonly LegacyWasm64PackageName[];
  readonly totalProdImports: number;
  readonly totalTestImports: number;
  readonly ratchetPassed: boolean;
  readonly packages: readonly PackageRatchetAuditStatus[];
  readonly prodRegressions: readonly DependencyImportFinding[];
  readonly auditDeterminismDigest: string;
}

export function computeFnv1a32Hex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function splitIdentifierSubtokens(text: string): readonly string[] {
  const words: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isUpper) {
      if (current.length > 0) {
        const prevCode = text.charCodeAt(i - 1);
        const prevLowerOrDigit = (prevCode >= 97 && prevCode <= 122) || (prevCode >= 48 && prevCode <= 57);
        if (prevLowerOrDigit) {
          words.push(current);
          current = "";
        }
      }
      current += String.fromCharCode(code + 32);
    } else if (isLower || isDigit) {
      current += text[i] ?? "";
    } else if (current.length > 0) {
      words.push(current);
      current = "";
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

export function scoreDomainByText(text: string): MonolithDomainId {
  const subtokens = splitIdentifierSubtokens(text);
  const subtokenSet = new Set(subtokens);
  let bestId: MonolithDomainId = "workspace-shell-i18n";
  let bestScore = 0;
  for (const domain of STUDIO_MONOLITH_DOMAINS) {
    let score = 0;
    for (const kw of domain.keywords) {
      if (subtokenSet.has(kw)) {
        score += kw.length >= 5 ? 4 : 3;
      } else if (kw.length >= 5) {
        for (const tok of subtokens) {
          if (tok.startsWith(kw)) {
            score += 3;
            break;
          }
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = domain.id;
    }
  }
  return bestId;
}
