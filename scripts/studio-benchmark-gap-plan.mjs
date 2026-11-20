#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const STUDIO_BENCHMARK_GAP_PLAN_VERSION = 1;

export const DEFAULT_STUDIO_BENCHMARK_REGISTRY_PATHS = Object.freeze([
  "docs/benchmarks/studio-competitor-registry.json",
  "docs/benchmarks/studio-emerging-product-registry.json",
  "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
  "docs/benchmarks/studio-research-registry.json",
]);

const PRIORITY_WEIGHT = Object.freeze({
  P0: 3,
  P1: 2,
  P2: 1,
});

const TOKEN_ALIASES = Object.freeze({
  // 말풍선·대사·다국어·타이포
  "speech-bubble": ["balloon", "bubble", "lettering", "text"],
  "speech-bubbles": ["balloon", "bubble", "lettering", "text"],
  "automatic-speech-bubbles": ["balloon", "bubble", "lettering", "text"],
  "multi-language": ["text", "lettering", "translation", "typography"],
  "multi-language-translation": ["text", "lettering", "translation", "typography"],
  "multi-language-publishing": ["text", "lettering", "export", "delivery"],
  "contextual-glossary-translation": ["text", "lettering", "translation", "typography"],
  "kinetic-type": ["typography", "text", "animation", "timeline"],
  "cjk-aware-word-budget": ["text", "lettering", "typography", "balloon"],
  "markdown": ["text", "storyboard", "storage", "local-first"],
  // 컷·페이지·스토리보드·기획
  "vertical-scroll": ["comic", "episode", "page", "panel", "pagination"],
  "panel-layout": ["comic", "page", "panel", "gutter", "layout"],
  "automatic-panel-layout": ["comic", "page", "panel", "gutter", "layout"],
  "eight-portal-slice-profiles": ["export", "comic", "episode", "pagination", "delivery"],
  "safe-slice-interval-finder": ["comic", "panel", "pagination", "export"],
  "script": ["storyboard", "shot", "text", "episode"],
  "script-adaptation": ["storyboard", "shot", "ai", "episode"],
  "script-to-cuts": ["storyboard", "shot", "panel", "comic", "episode"],
  "script-to-staged-vertical-strip": ["storyboard", "comic", "panel", "episode"],
  "beat-sheet": ["storyboard", "shot", "episode", "revision"],
  "manuscript": ["episode", "page", "storyboard", "text"],
  "worldbuilding": ["storyboard", "episode", "reference", "asset"],
  "previsualization": ["storyboard", "shot", "camera", "three-d"],
  "multi-scene": ["storyboard", "shot", "camera", "three-d"],
  "scene": ["three-d", "camera", "render", "storyboard"],
  "moodboard": ["reference", "asset", "canvas", "collaboration"],
  "visual-notes": ["reference", "canvas", "storyboard", "collaboration"],
  "story-map": ["storyboard", "episode", "collaboration", "canvas"],
  "three-view-live-story-conti-sync": ["storyboard", "shot", "episode", "collaboration", "panel"],
  "ai-proposal-diff-gate": ["ai", "proposal", "revision", "history", "review"],
  "six-perspective-incremental-review": ["review", "diagnostic", "quality", "storyboard", "collaboration"],
  "cut-drift-detection": ["revision", "diagnostic", "storyboard", "conflict", "sync"],
  "cut-approval-share": ["collaboration", "review", "revision", "export"],
  // 캐릭터·에셋·일관성·소재 마켓
  "character": ["pose", "rig", "humanoid", "morph"],
  "character-consistency": ["character", "continuity", "variant", "revision", "asset"],
  "consistent-characters": ["variant", "revision", "asset", "ai"],
  "character-sheet": ["asset", "revision", "storyboard", "reference"],
  "shared-character-briefs": ["asset", "collaboration", "revision", "reference"],
  "photo-to-manga-character-cast-lock": ["asset", "variant", "ai", "revision"],
  "consistency-asset-strip": ["asset", "variant", "reference", "library", "reuse"],
  "style": ["variant", "filter", "toon", "render"],
  "style-consistency": ["continuity", "variant", "revision", "asset"],
  "style-variants": ["variant", "revision", "asset"],
  "brand-kit": ["asset", "palette", "material", "library", "reuse"],
  "component": ["asset", "reuse", "library", "three-d"],
  "components": ["asset", "reuse", "variant", "library"],
  "symbols": ["asset", "reuse", "variant", "vector"],
  "design-tokens": ["color", "palette", "asset", "property"],
  "warehouse": ["marketplace", "library", "material", "asset"],
  "three-d-asset-warehouse": ["material", "asset", "library", "marketplace", "three", "model"],
  "asset-library-search": ["asset", "library", "material", "search"],
  "license": ["marketplace", "asset", "provenance", "material"],
  "rating": ["marketplace", "material", "library", "search"],
  "revenue-share": ["marketplace", "delivery", "asset", "quality"],
  "tutorial": ["material", "library", "marketplace", "workspace"],
  "download": ["import", "export", "asset", "marketplace"],
  // 3D·포즈·리깅·렌더
  "pose-capture": ["pose", "rig", "ik", "humanoid", "retarget"],
  "camera-pose-capture": ["pose", "rig", "ik", "humanoid", "camera"],
  "auto-posing": ["pose", "rig", "ik", "humanoid"],
  "posing": ["pose", "rig", "ik", "humanoid"],
  "avatar": ["rig", "pose", "humanoid", "morph"],
  "bone": ["rig", "skeleton", "pose", "animation"],
  "deformer": ["morph", "rig", "warp", "animation"],
  "deformers": ["morph", "rig", "warp", "animation"],
  "parameter": ["property", "inspector", "morph", "rig"],
  "motion-capture": ["animation", "pose", "rig", "retarget", "timeline"],
  "single-camera-motion-capture": ["animation", "pose", "rig", "retarget", "timeline"],
  "architecture": ["three-d", "model", "render", "scene"],
  "background": ["three-d", "render", "scene", "material"],
  "sculpt": ["three-d", "surface", "model", "brush"],
  "remesh": ["three-d", "model", "surface", "compression"],
  "surface-direct-drawing": ["surface", "uv", "texture", "paint"],
  "multi-view": ["camera", "render", "viewport", "three-d"],
  "viewer": ["viewport", "three-d", "render", "material"],
  "preview": ["viewport", "render", "material", "asset"],
  "depth-of-field": ["camera", "render", "filter", "effect"],
  "sketchup-direct-import": ["import", "glb", "gltf", "model", "validation"],
  "three-d-camera-and-pose-presets": ["three-d", "camera", "pose", "rig", "render"],
  "three-d-background-line-extraction": ["three-d", "render", "line", "toon", "capture"],
  "time-of-day-lighting-presets": ["lighting", "shadow", "render", "three-d", "tone"],
  "auto-wall-culling-section-plane": ["three-d", "camera", "render", "viewport"],
  "multi-shot-batch-render": ["render", "batch", "shot", "camera", "three-d"],
  "inline-character-background-quick-edit": ["edit", "panel", "character", "three-d", "workspace"],
  // 브러시·자연매체·벡터·래스터·효과
  "thin-film": ["watercolor", "pigment", "fluid", "wet"],
  "dripping": ["watercolor", "fluid", "wet", "pigment"],
  "reverse-drift": ["fluid", "pigment", "mixing", "watercolor"],
  "resolution-independent": ["vector", "rasterizer", "brush", "canvas"],
  "bitmap-primitives": ["rasterizer", "layer", "brush", "canvas"],
  "differentiable-rendering": ["render", "rasterizer", "gpu", "vector"],
  "gaussian-splatting": ["rasterizer", "webgpu", "render", "bezier"],
  "fast-optimization": ["performance", "rasterizer", "webgpu", "bezier"],
  "nurbs": ["bezier", "vector", "path", "rasterizer"],
  "closed-fill": ["vector", "path", "shape", "rasterizer"],
  "visibility": ["rasterizer", "layer", "compositor", "vector"],
  "boolean-operations": ["shape", "vector", "path", "node"],
  "corner-rounding": ["shape", "vector", "path", "node"],
  "diagram": ["shape", "vector", "canvas", "collaboration"],
  "nudge-slice": ["selection", "transform", "vector", "path"],
  "precision": ["snap", "align", "vector", "transform"],
  "perspective": ["snap", "transform", "camera", "canvas"],
  "grease-pencil": ["brush", "vector", "stroke", "animation"],
  "hand-drawn": ["stroke", "brush", "vector", "shape"],
  "fast-sketch": ["brush", "stroke", "storyboard", "canvas"],
  "pixel-art": ["canvas", "brush", "layer", "palette"],
  "wraparound": ["canvas", "surface", "texture", "tile"],
  "plotter": ["vector", "path", "stroke", "export"],
  "hmm": ["stroke", "brush", "assist", "proposal"],
  "sketch-simplification": ["line", "vector", "stroke", "ai"],
  "sketch-synthesis": ["stroke", "proposal", "cocreation", "ai"],
  "differential-query": ["proposal", "stroke", "ai", "assist"],
  "evolution-strategy": ["proposal", "alternative", "stroke", "cocreation"],
  "small-data": ["ai", "generation", "stroke", "brush"],
  "appearance": ["effect", "filter", "layer", "non-destructive"],
  "compositing": ["compositor", "layer", "blend", "render"],
  "glare": ["glow", "effect", "filter", "non-destructive"],
  "halation": ["glow", "effect", "filter", "non-destructive"],
  "kuwahara": ["filter", "effect", "non-destructive", "watercolor"],
  "enhance": ["filter", "effect", "ai", "render"],
  "scan-cleanup": ["filter", "line", "layer", "import"],
  "three-layer-underpainting-marking": ["layer", "mask", "color", "ai", "blend"],
  "auto-coloring": ["color", "layer", "ai", "mask", "assist"],
  // 애니메이션·타임라인·비디오
  "animated-svg": ["animation", "vector", "timeline", "export"],
  "auto-animate": ["animation", "keyframe", "timeline", "playback"],
  "clip-trimming": ["timeline", "frame", "playback", "animation"],
  "data-driven": ["asset", "batch", "variant", "animation"],
  "easing": ["keyframe", "animation", "timeline", "playback"],
  "fast-preview": ["playback", "timeline", "performance", "viewport"],
  "lottie": ["animation", "vector", "export", "timeline"],
  "performing": ["animation", "keyframe", "playback", "touch"],
  "physics": ["animation", "rig", "fluid", "simulation"],
  "state-machine": ["animation", "timeline", "keyframe", "constraint"],
  "timelapse": ["history", "snapshot", "playback", "export"],
  "trajectory": ["animation", "keyframe", "pose", "path"],
  "transparent-video": ["export", "animation", "timeline", "render"],
  "video": ["animation", "timeline", "export", "render"],
  "xsheet": ["exposure", "animation", "timeline", "cel"],
  "speaker-tts": ["audio", "dialogue", "storyboard", "timeline"],
  // AI·코크리에이션
  "agent-automation": ["ai", "proposal", "assist", "batch", "workflow"],
  "diffusion": ["ai", "generation", "control", "mask"],
  "generative-fill": ["ai", "generation", "mask", "edit"],
  "regional-prompt": ["ai", "mask", "selection", "control"],
  "stage-by-stage-regeneration": ["structured", "layer", "mask", "control", "proposal", "alternative"],
  "selection-reactive-ai-canvas": ["ai", "selection", "canvas", "mask", "edit"],
  "one-click-resource-cut-generation": ["ai", "generation", "asset", "panel", "comic"],
  // 입출력·호환성·저장·복구(storage-recovery)
  "layered-psd": ["psd", "import", "export", "interchange", "layer"],
  "layered-psd-export": ["psd", "import", "export", "interchange", "layer"],
  "psd-layer-export": ["psd", "import", "export", "interchange", "layer"],
  "multi-pass-psd-export": ["psd", "export", "render", "layer", "line"],
  "unreal-maya-blender-export": ["export", "interchange", "model", "animation"],
  "browser-full-resolution-export": ["export", "quality", "delivery", "browser"],
  "transparent-background": ["export", "layer", "mask", "render"],
  "raw": ["import", "format", "color", "hdr"],
  "offline-first": ["offline", "storage", "recovery", "autosave", "opfs", "persistence"],
  "offline-first-conti": ["offline", "storage", "recovery", "autosave", "storyboard"],
  "local-first": ["storage", "recovery", "opfs", "autosave", "offline", "local-first"],
  "local-first-file": ["storage", "recovery", "opfs", "autosave", "codec", "local-first"],
  "local-processing": ["storage", "recovery", "wasm", "worker", "offline"],
  "local-autosave-recovery": ["storage", "autosave", "recovery", "opfs", "journal"],
  "local-revision-recovery": ["storage", "recovery", "revision", "autosave", "journal"],
  "persistence": ["storage", "recovery", "autosave", "opfs", "persistence"],
  "source-control-files": ["storage", "recovery", "revision", "codec", "journal"],
  "single-project-data-model": ["storage", "recovery", "codec", "migration", "autosave"],
  "cloud-project": ["storage", "recovery", "collaboration", "sync"],
  "open-format": ["import", "export", "format", "codec", "storage"],
  "file-format": ["import", "export", "format", "codec", "storage"],
  // 협업·작업공간·성능·배포·품질
  "creator-analytics": ["quality", "delivery", "diagnostic", "publication", "analytics"],
  "community-management": ["collaboration", "comment", "review", "publication"],
  "collaborative-panel-editor": ["collaboration", "panel", "comic", "realtime"],
  "cycle-planning": ["episode", "revision", "collaboration", "workspace"],
  "department-role": ["collaboration", "presence", "review", "workspace"],
  "production-tracker": ["collaboration", "revision", "episode", "diagnostic"],
  "task-queue": ["collaboration", "episode", "revision", "workspace"],
  "issue-tracking": ["collaboration", "revision", "review", "diagnostic"],
  "triage": ["diagnostic", "collaboration", "revision", "workspace"],
  "dev-mode": ["inspector", "property", "export", "diagnostic"],
  "extension": ["workspace", "command", "import", "asset"],
  "plugin": ["workspace", "command", "import", "export"],
  "python-extension": ["command", "workspace", "batch", "export"],
  "scripting": ["command", "animation", "workspace", "timeline"],
  "personas": ["workspace", "panel", "toolbar", "dock"],
  "minimal-ui": ["workspace", "viewport", "mobile", "responsive"],
  "simple-ui": ["workspace", "panel", "toolbar", "responsive"],
  "interaction": ["viewport", "input", "pointer", "three-d"],
  "interactive": ["viewport", "input", "timeline", "playback"],
  "lightweight": ["performance", "startup", "memory", "latency"],
  "real-time": ["performance", "latency", "webgpu", "fluid"],
  "speed": ["performance", "latency", "startup", "brush"],
  "global-distribution": ["export", "delivery", "episode", "offline"],
  "publishing": ["export", "episode", "delivery", "comic"],
  "open-source": ["codec", "format", "diagnostic", "quality"],
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/3d/gu, "three-d")
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/(?:^-+|-+$)/gu, "");
}

function tokenWords(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return [];
  return normalized.split("-").filter(Boolean);
}

function expandedWords(value) {
  const normalized = normalizeToken(value);
  const words = new Set(tokenWords(normalized));
  for (const alias of TOKEN_ALIASES[normalized] ?? []) {
    for (const word of tokenWords(alias)) words.add(word);
  }
  return words;
}

function registryRecords(document) {
  for (const key of ["products", "items", "papers", "research", "sources", "entries"]) {
    if (Array.isArray(document?.[key])) return document[key];
  }
  return [];
}

function normalizeProduct(raw, registryId) {
  const id = normalizeToken(raw?.id || raw?.slug || raw?.name);
  if (!id) return null;
  const focus = asArray(raw?.focus).map(cleanString).filter(Boolean);
  const laneHints = asArray(raw?.laneHints).map(normalizeToken).filter(Boolean);
  return {
    id,
    name: cleanString(raw?.name) || id,
    category: cleanString(raw?.category) || "unspecified",
    priority: Object.hasOwn(PRIORITY_WEIGHT, raw?.priority) ? raw.priority : "P2",
    focus,
    laneHints,
    registryIds: [registryId],
    officialUrl: cleanString(raw?.officialUrl),
    watchUrl: cleanString(raw?.watchUrl),
    region: cleanString(raw?.region),
    stage: cleanString(raw?.stage),
  };
}

function mergeProducts(products) {
  const byId = new Map();
  for (const product of products) {
    const existing = byId.get(product.id);
    if (!existing) {
      byId.set(product.id, {
        ...product,
        focus: [...new Set(product.focus)],
        laneHints: [...new Set(product.laneHints)],
        registryIds: [...new Set(product.registryIds)],
      });
      continue;
    }
    const priority =
      PRIORITY_WEIGHT[product.priority] > PRIORITY_WEIGHT[existing.priority]
        ? product.priority
        : existing.priority;
    byId.set(product.id, {
      ...existing,
      name: existing.name || product.name,
      category: existing.category === "unspecified" ? product.category : existing.category,
      priority,
      focus: [...new Set([...existing.focus, ...product.focus])],
      laneHints: [...new Set([...existing.laneHints, ...product.laneHints])],
      registryIds: [...new Set([...existing.registryIds, ...product.registryIds])],
      officialUrl: existing.officialUrl || product.officialUrl,
      watchUrl: existing.watchUrl || product.watchUrl,
      region: existing.region || product.region,
      stage: existing.stage || product.stage,
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeLane(raw) {
  const id = normalizeToken(raw?.id);
  if (!id) return null;
  const searchable = [
    id,
    cleanString(raw?.title),
    ...asArray(raw?.focusTerms),
    ...asArray(raw?.fallbackTracks),
    ...asArray(raw?.pathHints),
  ].filter(Boolean);
  const words = new Set();
  const phrases = new Set();
  for (const token of searchable) {
    const normalized = normalizeToken(token);
    if (normalized) phrases.add(normalized);
    for (const word of expandedWords(token)) words.add(word);
  }
  return {
    id,
    title: cleanString(raw?.title) || id,
    issueQueue: asArray(raw?.issueQueue).filter((value) => Number.isInteger(value)),
    searchable,
    phrases,
    words,
  };
}

export function scoreStudioBenchmarkProductAgainstLane(product, lane) { // NOSONAR javascript:S3776
  let score = product.laneHints.includes(lane.id) ? 50 : 0;
  const matchedFocus = [];

  for (const focus of product.focus) {
    const normalizedFocus = normalizeToken(focus);
    const focusWords = expandedWords(focus);
    let focusScore = 0;

    if (lane.phrases.has(normalizedFocus)) focusScore += 12;
    if (
      [...lane.phrases].some(
        (phrase) => phrase.includes(normalizedFocus) || normalizedFocus.includes(phrase),
      )
    ) {
      focusScore += 5;
    }

    let overlap = 0;
    for (const word of focusWords) {
      if (word.length <= 1) continue;
      if (lane.words.has(word)) overlap += 1;
    }
    focusScore += overlap * 2;

    if (focusScore > 0) {
      score += focusScore;
      matchedFocus.push(focus);
    }
  }

  score += PRIORITY_WEIGHT[product.priority] ?? 1;
  return {
    laneId: lane.id,
    laneTitle: lane.title,
    score,
    matchedFocus: [...new Set(matchedFocus)],
    issueQueue: lane.issueQueue,
  };
}

/**
 * 상위 3개 레인을 기본으로 채택하되, 명시적 `laneHints`와 나머지 매칭된 focus를
 * 커버하는 최소 집합 레인을 추가해 다중 도메인 제품이 거짓 unmappedFocus를 남기지 않게 한다.
 * 어떤 레인에도 매칭되지 않은 focus는 여전히 `unmappedFocus`에 정직하게 남는다.
 */
function selectProductLanes(product, ranked) {
  const minScore = PRIORITY_WEIGHT[product.priority] ?? 1;
  const eligible = ranked.filter((candidate) => candidate.score > minScore);
  if (eligible.length === 0) return [];

  const selected = [];
  const selectedIds = new Set();
  const coveredFocus = new Set();

  const addCandidate = (candidate) => {
    if (selectedIds.has(candidate.laneId)) return;
    selectedIds.add(candidate.laneId);
    selected.push(candidate);
    for (const focus of candidate.matchedFocus) coveredFocus.add(focus);
  };

  for (const candidate of eligible.slice(0, 3)) addCandidate(candidate);

  if (product.laneHints.length > 0) {
    for (const candidate of eligible) {
      if (product.laneHints.includes(candidate.laneId)) addCandidate(candidate);
    }
  }

  while (coveredFocus.size < product.focus.length) {
    let bestCandidate = null;
    let bestNewCoverage = 0;
    for (const candidate of eligible) {
      if (selectedIds.has(candidate.laneId)) continue;
      let newCoverage = 0;
      for (const focus of candidate.matchedFocus) {
        if (!coveredFocus.has(focus)) newCoverage += 1;
      }
      if (
        newCoverage > bestNewCoverage ||
        (newCoverage > 0 &&
          newCoverage === bestNewCoverage &&
          bestCandidate &&
          (candidate.score > bestCandidate.score ||
            (candidate.score === bestCandidate.score &&
              candidate.laneId.localeCompare(bestCandidate.laneId) < 0)))
      ) {
        bestCandidate = candidate;
        bestNewCoverage = newCoverage;
      }
    }
    if (!bestCandidate) break;
    addCandidate(bestCandidate);
  }

  return selected.sort((a, b) => b.score - a.score || a.laneId.localeCompare(b.laneId));
}

export function buildStudioBenchmarkGapPlan({ // NOSONAR javascript:S3776
  campaign,
  registries,
  generatedAt = new Date().toISOString(),
}) {
  const lanes = asArray(campaign?.lanes).map(normalizeLane).filter(Boolean);
  if (lanes.length === 0) throw new Error("Campaign has no valid lanes");

  const registryMeta = [];
  const rawProducts = [];
  for (const registry of registries) {
    const registryId = normalizeToken(
      registry?.id || registry?.name || registry?.path || `registry-${registryMeta.length + 1}`,
    );
    const document = registry?.document ?? registry;
    const records = registryRecords(document);
    registryMeta.push({
      id: registryId,
      updatedAt: cleanString(document?.updatedAt),
      productCount: records.length,
    });
    for (const raw of records) {
      const normalized = normalizeProduct(raw, registryId);
      if (normalized) rawProducts.push(normalized);
    }
  }

  const products = mergeProducts(rawProducts).map((product) => {
    const ranked = lanes
      .map((lane) => scoreStudioBenchmarkProductAgainstLane(product, lane))
      .sort((a, b) => b.score - a.score || a.laneId.localeCompare(b.laneId));
    const topScore = ranked[0]?.score ?? 0;
    const topLanes = selectProductLanes(product, ranked);
    const matchedFocus = new Set(topLanes.flatMap((candidate) => candidate.matchedFocus));
    return {
      ...product,
      topScore,
      topLanes,
      unmappedFocus: product.focus.filter((focus) => !matchedFocus.has(focus)),
    };
  });

  const lanePlans = lanes.map((lane) => {
    const assignments = products
      .flatMap((product) =>
        product.topLanes
          .filter((candidate) => candidate.laneId === lane.id)
          .map((candidate) => ({
            productId: product.id,
            productName: product.name,
            priority: product.priority,
            score: candidate.score,
            matchedFocus: candidate.matchedFocus,
            registryIds: product.registryIds,
          })),
      )
      .sort(
        (a, b) =>
          (PRIORITY_WEIGHT[b.priority] ?? 1) - (PRIORITY_WEIGHT[a.priority] ?? 1) ||
          b.score - a.score ||
          a.productId.localeCompare(b.productId),
      );
    return {
      id: lane.id,
      title: lane.title,
      issueQueue: lane.issueQueue,
      assignmentCount: assignments.length,
      priorityScore: assignments.reduce(
        (sum, assignment) => sum + (PRIORITY_WEIGHT[assignment.priority] ?? 1),
        0,
      ),
      assignments,
    };
  }).sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      b.assignmentCount - a.assignmentCount ||
      a.id.localeCompare(b.id),
  );

  const unmappedProducts = products
    .filter((product) => product.topLanes.length === 0)
    .map((product) => product.id);

  return {
    schemaVersion: STUDIO_BENCHMARK_GAP_PLAN_VERSION,
    generatedAt,
    campaignId: cleanString(campaign?.campaignId),
    sourceRegistries: registryMeta,
    stats: {
      laneCount: lanes.length,
      productCount: products.length,
      mappedProductCount: products.length - unmappedProducts.length,
      unmappedProductCount: unmappedProducts.length,
      focusTermCount: products.reduce((sum, product) => sum + product.focus.length, 0),
      unmappedFocusTermCount: products.reduce(
        (sum, product) => sum + product.unmappedFocus.length,
        0,
      ),
    },
    lanePlans,
    products,
    unmappedProducts,
  };
}

export function renderStudioBenchmarkGapPlanMarkdown(plan) {
  const lines = [
    "# Studio benchmark → implementation lane plan",
    "",
    `- Generated: ${plan.generatedAt}`,
    `- Campaign: ${plan.campaignId || "unspecified"}`,
    `- Products: ${plan.stats.productCount}`,
    `- Mapped products: ${plan.stats.mappedProductCount}`,
    `- Unmapped focus terms: ${plan.stats.unmappedFocusTermCount}`,
    "",
    "## Highest-pressure lanes",
    "",
  ];

  for (const lane of plan.lanePlans.filter((item) => item.assignmentCount > 0).slice(0, 15)) {
    const issueList = lane.issueQueue.map((issue) => "#" + issue).join(", ");
    const issues = lane.issueQueue.length > 0 ? ` · ${issueList}` : "";
    lines.push(`### ${lane.id}${issues}`);
    lines.push("");
    for (const assignment of lane.assignments.slice(0, 8)) {
      const focus = assignment.matchedFocus.slice(0, 5).join(", ") || "explicit lane hint";
      lines.push(
        `- **${assignment.productName}** (${assignment.priority}, score ${assignment.score}) — ${focus}`,
      );
    }
    lines.push("");
  }

  const unmapped = plan.products.filter((product) => product.unmappedFocus.length > 0);
  lines.push("## Unmapped or weakly mapped focus");
  lines.push("");
  if (unmapped.length === 0) {
    lines.push("- None");
  } else {
    for (const product of unmapped.slice(0, 30)) {
      lines.push(`- **${product.name}** — ${product.unmappedFocus.join(", ")}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  const options = {
    campaignPath: "docs/automation/studio-seven-day-campaign.json",
    registryPaths: [],
    jsonOutput: null,
    markdownOutput: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--campaign") {
      options.campaignPath = value;
      index += 1; // NOSONAR javascript:S2310
    } else if (argument === "--registry") {
      options.registryPaths.push(value);
      index += 1; // NOSONAR javascript:S2310
    } else if (argument === "--json-output") {
      options.jsonOutput = value;
      index += 1; // NOSONAR javascript:S2310
    } else if (argument === "--markdown-output") {
      options.markdownOutput = value;
      index += 1; // NOSONAR javascript:S2310
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function generatedAtFromEnvironment() {
  const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(sourceDateEpoch) && sourceDateEpoch >= 0) {
    return new Date(sourceDateEpoch * 1000).toISOString();
  }
  return new Date().toISOString();
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const registryPaths =
    options.registryPaths.length > 0
      ? options.registryPaths
      : DEFAULT_STUDIO_BENCHMARK_REGISTRY_PATHS;
  const campaign = readJson(options.campaignPath);
  const registries = registryPaths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({
      id: path.basename(filePath, path.extname(filePath)),
      path: filePath,
      document: readJson(filePath),
    }));
  if (registries.length === 0) throw new Error("No benchmark registries were found");

  const plan = buildStudioBenchmarkGapPlan({
    campaign,
    registries,
    generatedAt: generatedAtFromEnvironment(),
  });
  const markdown = renderStudioBenchmarkGapPlanMarkdown(plan);
  const json = `${JSON.stringify(plan, null, 2)}\n`;

  if (options.jsonOutput) {
    ensureParent(options.jsonOutput);
    fs.writeFileSync(options.jsonOutput, json, "utf8");
  }
  if (options.markdownOutput) {
    ensureParent(options.markdownOutput);
    fs.writeFileSync(options.markdownOutput, markdown, "utf8");
  }

  if (!options.jsonOutput && !options.markdownOutput) process.stdout.write(json);
  process.stderr.write(
    `studio benchmark gap plan: ${plan.stats.mappedProductCount}/${plan.stats.productCount} products mapped across ${plan.stats.laneCount} lanes\n`,
  );
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`studio benchmark gap planning failed: ${message}`);
    process.exitCode = 1;
  }
}
