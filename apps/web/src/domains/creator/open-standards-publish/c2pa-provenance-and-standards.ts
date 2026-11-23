/**
 * C2PA Content Credentials(v2.1 JSON-LD/JUMBF) 저작권·Anti-AI 프로비넌스,
 * OpenRaster(.ora stack.xml 0.0.5) · OpenColorIO(OCIO v2) 색공간 변환,
 * 클라우드 스토리지 해시 차분 미러링 및 외부 에셋 영수증 자동 태깅 엔진.
 */

// === 1. FIPS 180-4 SHA-256 (동기 결정론적 구현 · 브라우저/Node 동일 출력) ===

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr32 = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
const encodeUtf8Bytes = (input: string): Uint8Array => new TextEncoder().encode(input);

/** UTF-8 문자열의 FIPS 180-4 SHA-256 64자리 소문자 16진 해시를 반환한다. */
export function sha256Hex(input: string): string {
  const bytes = encodeUtf8Bytes(input);
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor((bytes.length * 8) / 0x100000000), false);
  view.setUint32(paddedLen - 4, (bytes.length * 8) >>> 0, false);

  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      w[i] = ((w[i - 16] ?? 0) + (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) + (w[i - 7] ?? 0) + (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + ((e & f) ^ (~e & g)) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const t2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const delta = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) state[i] = ((state[i] ?? 0) + (delta[i] ?? 0)) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** 객체 키 순서를 재귀 정렬해 결정론적 JSON 문자열을 생성한다. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJson(item)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const entries = Object.keys(rec).sort().filter((k) => rec[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalizeJson(rec[k])}`);
  return `{${entries.join(",")}}`;
}

// === 2. C2PA Content Credentials(v2.1 JSON-LD/JUMBF) 빌더 & 검증기 ===

export type ExternalAssetSourceKind = "acon3d" | "sketchfab" | "font" | "brush" | "texture" | "original";
export type C2paTrainingMiningUse = "notAllowed" | "constrained" | "allowed";
export type C2paVerificationIssueCode =
  | "CLAIM_HASH_MISMATCH" | "MANIFEST_HASH_MISMATCH" | "HASH_CHAIN_BROKEN"
  | "ANTI_AI_NOT_DECLARED" | "RIGHTS_BOM_MISMATCH" | "JUMBF_BOX_MISMATCH";

export interface RightsPermissionScope {
  readonly commercialUse: boolean; readonly globalDistribution: boolean;
  readonly derivativeWorks: boolean; readonly printPublication: boolean; readonly aiTrainingAllowed: boolean;
}
export interface RightsBomAssetEntry {
  readonly assetId: string; readonly name: string; readonly vendor: string; readonly sourceKind: ExternalAssetSourceKind;
  readonly licenseName: string; readonly receiptRef: string; readonly contentSha256: string;
  readonly permissions: RightsPermissionScope; readonly attributionRequired: boolean; readonly expiresAtIso?: string;
}
export interface ProvenanceLayerDigest {
  readonly layerId: string; readonly name: string; readonly kind: "raster" | "vector" | "text" | "3d-bg" | "tone";
  readonly contentSha256: string; readonly authoredBy: string; readonly toolName: string;
}
export interface C2paProvenanceInput {
  readonly workId: string; readonly episodeTitle: string; readonly creatorName: string; readonly creatorHandle: string;
  readonly softwareAgent?: string; readonly createdAtIso?: string;
  readonly aiTrainingPolicy?: C2paTrainingMiningUse; readonly dataMiningPolicy?: C2paTrainingMiningUse;
  readonly layers: readonly ProvenanceLayerDigest[]; readonly rightsBom: readonly RightsBomAssetEntry[];
  readonly parentManifestSha256?: string;
}
export interface C2paHashChainLink {
  readonly index: number; readonly label: string; readonly prevHash: string; readonly payloadHash: string; readonly linkHash: string;
}
export interface C2paTrainingMiningAssertion {
  readonly label: "c2pa.training-mining";
  readonly data: {
    readonly entries: {
      readonly "c2pa.ai_training": { readonly use: C2paTrainingMiningUse; readonly constraintInfo?: string };
      readonly "c2pa.ai_generative_training": { readonly use: C2paTrainingMiningUse; readonly constraintInfo?: string };
      readonly "c2pa.ai_inference": { readonly use: C2paTrainingMiningUse };
      readonly "c2pa.data_mining": { readonly use: C2paTrainingMiningUse };
    };
  };
}
export interface C2paActionsAssertion {
  readonly label: "c2pa.actions";
  readonly data: {
    readonly actions: readonly {
      readonly action: "c2pa.created" | "c2pa.edited" | "c2pa.placed";
      readonly softwareAgent: string; readonly when: string; readonly parameters: Readonly<Record<string, string | number | boolean>>;
    }[];
  };
}
export interface C2paCreativeWorkAssertion {
  readonly label: "stds.schema-org.CreativeWork";
  readonly data: {
    readonly "@context": "https://schema.org"; readonly "@type": "CreativeWork";
    readonly identifier: string; readonly name: string; readonly dateCreated: string;
    readonly author: readonly { readonly "@type": "Person"; readonly name: string; readonly alternateName: string }[];
  };
}
export interface C2paRightsBomAssertion {
  readonly label: "toonstudio.rights-bom.v1";
  readonly data: {
    readonly totalAssets: number; readonly commercialCleared: boolean; readonly globalCleared: boolean;
    readonly derivativeCleared: boolean; readonly printCleared: boolean;
    readonly blockedCommercialIds: readonly string[]; readonly blockedGlobalIds: readonly string[];
    readonly blockedDerivativeIds: readonly string[]; readonly blockedPrintIds: readonly string[];
    readonly bomDigestSha256: string;
  };
}
export interface C2paJumbfBoxDescriptor {
  readonly boxType: "jumb" | "c2pa" | "c2ma" | "c2as" | "c2cl";
  readonly uuid: string; readonly label: string; readonly byteLength: number; readonly contentSha256: string;
}
export interface C2paProvenanceManifest {
  readonly "@context": readonly ["https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html", "https://schema.org"];
  readonly "@type": "c2pa:Manifest"; readonly specVersion: "2.1";
  readonly claimGenerator: string; readonly instanceId: string; readonly workId: string; readonly title: string;
  readonly creatorName: string; readonly creatorHandle: string; readonly createdAtIso: string; readonly parentManifestSha256: string;
  readonly layers: readonly ProvenanceLayerDigest[]; readonly ingredients: readonly RightsBomAssetEntry[];
  readonly assertions: {
    readonly actions: C2paActionsAssertion; readonly trainingMining: C2paTrainingMiningAssertion;
    readonly creativeWork: C2paCreativeWorkAssertion; readonly rightsBom: C2paRightsBomAssertion;
  };
  readonly hashChain: readonly C2paHashChainLink[]; readonly jumbfBoxes: readonly C2paJumbfBoxDescriptor[];
  readonly claimSha256: string; readonly manifestSha256: string;
}
export interface C2paVerificationIssue {
  readonly code: C2paVerificationIssueCode; readonly messageKo: string; readonly messageEn: string;
}
export interface C2paIntegrityVerificationResult {
  readonly valid: boolean; readonly intactChain: boolean; readonly antiAiDeclared: boolean;
  readonly rightsClearForCommercial: boolean; readonly rightsClearForGlobal: boolean;
  readonly rightsClearForDerivative: boolean; readonly rightsClearForPrint: boolean;
  readonly recomputedClaimSha256: string; readonly recomputedManifestSha256: string;
  readonly checkedLinkCount: number; readonly failures: readonly C2paVerificationIssue[];
}

const GENESIS_HASH = "0".repeat(64);
const DEFAULT_CREATED_ISO = "2026-11-23T00:00:00Z";
const DEFAULT_AGENT = "ToonStudio/2.4 C2PA-2.1";

function evaluateRightsBomSummary(ingredients: readonly RightsBomAssetEntry[]): C2paRightsBomAssertion["data"] {
  const blockedCommercialIds = ingredients.filter((i) => !i.permissions.commercialUse).map((i) => i.assetId);
  const blockedGlobalIds = ingredients.filter((i) => !i.permissions.globalDistribution).map((i) => i.assetId);
  const blockedDerivativeIds = ingredients.filter((i) => !i.permissions.derivativeWorks).map((i) => i.assetId);
  const blockedPrintIds = ingredients.filter((i) => !i.permissions.printPublication).map((i) => i.assetId);
  return {
    totalAssets: ingredients.length,
    commercialCleared: blockedCommercialIds.length === 0, globalCleared: blockedGlobalIds.length === 0,
    derivativeCleared: blockedDerivativeIds.length === 0, printCleared: blockedPrintIds.length === 0,
    blockedCommercialIds, blockedGlobalIds, blockedDerivativeIds, blockedPrintIds,
    bomDigestSha256: sha256Hex(canonicalizeJson(ingredients)),
  };
}

function buildHashChain(parentHash: string, layers: readonly ProvenanceLayerDigest[], ingredients: readonly RightsBomAssetEntry[], assertions: C2paProvenanceManifest["assertions"]): readonly C2paHashChainLink[] {
  const links: C2paHashChainLink[] = [];
  let prevHash = parentHash;
  const push = (label: string, payload: unknown): void => {
    const payloadHash = sha256Hex(canonicalizeJson(payload));
    const linkHash = sha256Hex(`${prevHash}|${label}|${payloadHash}`);
    links.push({ index: links.length, label, prevHash, payloadHash, linkHash });
    prevHash = linkHash;
  };
  for (const layer of layers) push(`layer:${layer.layerId}`, layer);
  for (const asset of ingredients) push(`ingredient:${asset.assetId}`, asset);
  push("assertion:c2pa.actions", assertions.actions);
  push("assertion:c2pa.training-mining", assertions.trainingMining);
  push("assertion:stds.schema-org.CreativeWork", assertions.creativeWork);
  push("assertion:toonstudio.rights-bom.v1", assertions.rightsBom);
  return links;
}

function computeClaimPayload(m: Omit<C2paProvenanceManifest, "jumbfBoxes" | "claimSha256" | "manifestSha256">): string {
  return canonicalizeJson({
    specVersion: m.specVersion, claimGenerator: m.claimGenerator, instanceId: m.instanceId,
    workId: m.workId, title: m.title, creatorName: m.creatorName, creatorHandle: m.creatorHandle,
    createdAtIso: m.createdAtIso, parentManifestSha256: m.parentManifestSha256,
    layers: m.layers, ingredients: m.ingredients, assertions: m.assertions,
    hashChainTip: m.hashChain[m.hashChain.length - 1]?.linkHash ?? GENESIS_HASH,
  });
}

function buildJumbfBoxes(assertions: C2paProvenanceManifest["assertions"], claimSha256: string, claimPayload: string): readonly C2paJumbfBoxDescriptor[] {
  const assertionsJson = canonicalizeJson(assertions);
  const aBytes = encodeUtf8Bytes(assertionsJson).length;
  const cBytes = encodeUtf8Bytes(claimPayload).length;
  return [
    { boxType: "c2pa", uuid: "63327061-0011-0010-8000-00aa00389b71", label: "c2pa", byteLength: aBytes + cBytes + 96, contentSha256: sha256Hex(`${claimSha256}:store`) },
    { boxType: "c2ma", uuid: "63326d61-0011-0010-8000-00aa00389b71", label: "c2pa.manifest", byteLength: aBytes + cBytes + 48, contentSha256: claimSha256 },
    { boxType: "c2as", uuid: "63326173-0011-0010-8000-00aa00389b71", label: "c2pa.assertions", byteLength: aBytes, contentSha256: sha256Hex(assertionsJson) },
    { boxType: "c2cl", uuid: "6332636c-0011-0010-8000-00aa00389b71", label: "c2pa.claim", byteLength: cBytes, contentSha256: claimSha256 },
  ];
}

/** C2PA v2.1 호환 프로비넌스 매니페스트(SHA-256 체인 · Anti-AI · Rights BOM · JUMBF)를 생성한다. */
export function buildC2paProvenanceManifest(input: C2paProvenanceInput): C2paProvenanceManifest {
  const createdAtIso = input.createdAtIso ?? DEFAULT_CREATED_ISO;
  const claimGenerator = input.softwareAgent ?? DEFAULT_AGENT;
  const aiPolicy = input.aiTrainingPolicy ?? "notAllowed";
  const miningPolicy = input.dataMiningPolicy ?? "notAllowed";
  const parentManifestSha256 = input.parentManifestSha256 ?? GENESIS_HASH;
  const assertions: C2paProvenanceManifest["assertions"] = {
    actions: {
      label: "c2pa.actions",
      data: {
        actions: [
          { action: "c2pa.created", softwareAgent: claimGenerator, when: createdAtIso, parameters: { workId: input.workId, layerCount: input.layers.length } },
          ...input.rightsBom.map((asset) => ({
            action: "c2pa.placed" as const, softwareAgent: claimGenerator, when: createdAtIso,
            parameters: { assetId: asset.assetId, vendor: asset.vendor, sourceKind: asset.sourceKind, commercialUse: asset.permissions.commercialUse },
          })),
        ],
      },
    },
    trainingMining: {
      label: "c2pa.training-mining",
      data: {
        entries: {
          "c2pa.ai_training": { use: aiPolicy, constraintInfo: aiPolicy === "notAllowed" ? "No AI/ML model training permitted." : undefined },
          "c2pa.ai_generative_training": { use: aiPolicy, constraintInfo: aiPolicy === "notAllowed" ? "No generative AI training permitted." : undefined },
          "c2pa.ai_inference": { use: aiPolicy === "notAllowed" ? "notAllowed" : "constrained" },
          "c2pa.data_mining": { use: miningPolicy },
        },
      },
    },
    creativeWork: {
      label: "stds.schema-org.CreativeWork",
      data: {
        "@context": "https://schema.org", "@type": "CreativeWork",
        identifier: input.workId, name: input.episodeTitle, dateCreated: createdAtIso,
        author: [{ "@type": "Person", name: input.creatorName, alternateName: input.creatorHandle }],
      },
    },
    rightsBom: { label: "toonstudio.rights-bom.v1", data: evaluateRightsBomSummary(input.rightsBom) },
  };
  const hashChain = buildHashChain(parentManifestSha256, input.layers, input.rightsBom, assertions);
  const instanceId = `urn:uuid:${sha256Hex(`${input.workId}|${createdAtIso}|${input.creatorHandle}`).slice(0, 32)}`;
  const base = {
    "@context": ["https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html", "https://schema.org"] as const,
    "@type": "c2pa:Manifest" as const, specVersion: "2.1" as const,
    claimGenerator, instanceId, workId: input.workId, title: input.episodeTitle,
    creatorName: input.creatorName, creatorHandle: input.creatorHandle, createdAtIso, parentManifestSha256,
    layers: [...input.layers], ingredients: [...input.rightsBom], assertions, hashChain,
  };
  const claimPayload = computeClaimPayload(base);
  const claimSha256 = sha256Hex(claimPayload);
  const jumbfBoxes = buildJumbfBoxes(assertions, claimSha256, claimPayload);
  const manifestSha256 = sha256Hex(canonicalizeJson({ claimSha256, hashChain, jumbfBoxes }));
  return { ...base, jumbfBoxes, claimSha256, manifestSha256 };
}

/** C2PA 매니페스트의 SHA-256 해시 체인·클레임·JUMBF 박스·Anti-AI 선언·Rights BOM 일관성을 검증한다. */
export function verifyC2paManifestIntegrity(manifest: C2paProvenanceManifest): C2paIntegrityVerificationResult {
  const failures: C2paVerificationIssue[] = [];
  const fail = (code: C2paVerificationIssueCode, messageKo: string, messageEn: string): void => { failures.push({ code, messageKo, messageEn }); };
  const expectedChain = buildHashChain(manifest.parentManifestSha256, manifest.layers, manifest.ingredients, manifest.assertions);
  const intactChain = manifest.hashChain.length === expectedChain.length && manifest.hashChain.every((link, idx) => {
    const ref = expectedChain[idx];
    return ref !== undefined && link.index === ref.index && link.label === ref.label &&
      link.prevHash === ref.prevHash && link.payloadHash === ref.payloadHash && link.linkHash === ref.linkHash;
  });
  if (!intactChain) fail("HASH_CHAIN_BROKEN", "SHA-256 프로비넌스 해시 체인이 끊어졌거나 레이어/에셋이 변조되었습니다.", "SHA-256 provenance hash chain is broken or a payload was tampered.");

  const claimPayload = computeClaimPayload(manifest);
  const recomputedClaimSha256 = sha256Hex(claimPayload);
  if (recomputedClaimSha256 !== manifest.claimSha256) fail("CLAIM_HASH_MISMATCH", "C2PA 클레임 다이제스트가 기록된 claimSha256과 불일치합니다.", "C2PA claim digest mismatches recorded claimSha256.");

  const expectedJumbf = buildJumbfBoxes(manifest.assertions, recomputedClaimSha256, claimPayload);
  const jumbfOk = manifest.jumbfBoxes.length === expectedJumbf.length && manifest.jumbfBoxes.every((box, idx) => {
    const ref = expectedJumbf[idx];
    return ref !== undefined && box.boxType === ref.boxType && box.contentSha256 === ref.contentSha256;
  });
  if (!jumbfOk) fail("JUMBF_BOX_MISMATCH", "JUMBF 컨테이너 박스 무결성 해시가 불일치합니다.", "JUMBF container box digests do not match expected manifest payload.");

  const recomputedManifestSha256 = sha256Hex(canonicalizeJson({ claimSha256: manifest.claimSha256, hashChain: manifest.hashChain, jumbfBoxes: manifest.jumbfBoxes }));
  if (recomputedManifestSha256 !== manifest.manifestSha256) fail("MANIFEST_HASH_MISMATCH", "최종 C2PA 매니페스트 봉인 해시(manifestSha256)가 변조되었습니다.", "Final sealed manifestSha256 does not match recomputed digest.");

  const tm = manifest.assertions.trainingMining.data.entries;
  const antiAiDeclared = tm["c2pa.ai_training"].use === "notAllowed" && tm["c2pa.ai_generative_training"].use === "notAllowed" && tm["c2pa.data_mining"].use === "notAllowed";
  if (!antiAiDeclared) fail("ANTI_AI_NOT_DECLARED", "c2pa.training-mining(AI 비학습) 선언이 notAllowed가 아닙니다.", "c2pa.training-mining assertion does not strictly declare notAllowed.");

  const expectedRights = evaluateRightsBomSummary(manifest.ingredients);
  if (canonicalizeJson(expectedRights) !== canonicalizeJson(manifest.assertions.rightsBom.data)) {
    fail("RIGHTS_BOM_MISMATCH", "Rights BOM 요약이 포함된 외부 에셋 목록과 불일치합니다.", "Rights BOM summary disagrees with embedded ingredient licenses.");
  }

  return {
    valid: failures.length === 0, intactChain, antiAiDeclared,
    rightsClearForCommercial: expectedRights.commercialCleared, rightsClearForGlobal: expectedRights.globalCleared,
    rightsClearForDerivative: expectedRights.derivativeCleared, rightsClearForPrint: expectedRights.printCleared,
    recomputedClaimSha256, recomputedManifestSha256, checkedLinkCount: manifest.hashChain.length, failures,
  };
}

// === 3. OpenRaster (.ora stack.xml 0.0.5) & OpenColorIO (OCIO v2) 변환기 ===

export type OraBlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "color" | "luminosity" | "add";
export type ColorSpaceProfileId = "sRGB" | "Display-P3" | "CMYK-FOGRA39";

export interface OraLayerLeaf {
  readonly type: "layer"; readonly name: string; readonly src: string;
  readonly x: number; readonly y: number; readonly opacity: number;
  readonly visibility: "visible" | "hidden"; readonly blendMode: OraBlendMode; readonly editLocked?: boolean;
}
export interface OraLayerStack {
  readonly type: "stack"; readonly name: string; readonly opacity: number;
  readonly visibility: "visible" | "hidden"; readonly blendMode: OraBlendMode;
  readonly isolation: "auto" | "isolate"; readonly children: readonly OraLayerNode[];
}
export type OraLayerNode = OraLayerLeaf | OraLayerStack;
export interface OpenRasterDocument {
  readonly version: "0.0.5"; readonly width: number; readonly height: number;
  readonly xres: number; readonly yres: number; readonly colorSpace: ColorSpaceProfileId;
  readonly rootStack: readonly OraLayerNode[];
}

const BLEND_TO_ORA_OP: Record<OraBlendMode, string> = {
  normal: "svg:src-over", multiply: "svg:multiply", screen: "svg:screen", overlay: "svg:overlay",
  darken: "svg:darken", lighten: "svg:lighten", "color-dodge": "svg:color-dodge", "color-burn": "svg:color-burn",
  "hard-light": "svg:hard-light", "soft-light": "svg:soft-light", difference: "svg:difference",
  color: "svg:color", luminosity: "svg:luminosity", add: "krita:addition",
};
const ORA_OP_TO_BLEND: Record<string, OraBlendMode> = Object.fromEntries(
  Object.entries(BLEND_TO_ORA_OP).map(([blend, op]) => [op, blend as OraBlendMode]),
);
const escapeXmlAttr = (raw: string): string => raw.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const unescapeXmlAttr = (raw: string): string => raw.replaceAll("&quot;", "\"").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const formatOpacity = (opacity: number): string => Number(Math.min(1, Math.max(0, opacity)).toFixed(4)).toString();

function serializeOraNodes(nodes: readonly OraLayerNode[], indent: string): string {
  return nodes.map((node) => {
    const common = `name="${escapeXmlAttr(node.name)}" opacity="${formatOpacity(node.opacity)}" visibility="${node.visibility}" composite-op="${BLEND_TO_ORA_OP[node.blendMode]}"`;
    if (node.type === "layer") {
      return `${indent}<layer ${common} src="${escapeXmlAttr(node.src)}" x="${Math.round(node.x)}" y="${Math.round(node.y)}"${node.editLocked ? ' edit-locked="true"' : ""} />`;
    }
    const inner = serializeOraNodes(node.children, `${indent}  `);
    return `${indent}<stack ${common} isolation="${node.isolation}">${inner.length > 0 ? `\n${inner}\n${indent}` : ""}</stack>`;
  }).join("\n");
}

/** OpenRaster 0.0.5 표준 stack.xml 문자열을 생성한다(Krita/GIMP/CSP/Photoshop 무손실 교환). */
export function serializeOpenRasterStackXml(doc: OpenRasterDocument): string {
  const icc = doc.colorSpace === "Display-P3" ? "DisplayP3.icc" : doc.colorSpace === "CMYK-FOGRA39" ? "ISOcoated_v2_300_eci.icc" : "sRGB2014.icc";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<image version="${doc.version}" w="${Math.round(doc.width)}" h="${Math.round(doc.height)}" xres="${Math.round(doc.xres)}" yres="${Math.round(doc.yres)}" color-space="${doc.colorSpace}" icc-profile="${icc}">`,
    '  <stack name="root" opacity="1" visibility="visible" composite-op="svg:src-over" isolation="auto">',
    serializeOraNodes(doc.rootStack, "    "),
    "  </stack>",
    "</image>",
  ].join("\n");
}

function parseXmlAttrs(attrSource: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let match = regex.exec(attrSource);
  while (match !== null) {
    if (match[1] !== undefined && match[2] !== undefined) attrs[match[1]] = unescapeXmlAttr(match[2]);
    match = regex.exec(attrSource);
  }
  return attrs;
}

/** OpenRaster stack.xml을 중첩 스택 트리·블렌드 모드·색공간까지 무손실 파싱한다. */
export function parseOpenRasterStackXml(xml: string): OpenRasterDocument {
  const tagRegex = /<\s*(\/?)\s*([a-zA-Z0-9_:-]+)([^>]*?)(\/?)\s*>/g;
  let width = 800; let height = 1280; let xres = 300; let yres = 300;
  let colorSpace: ColorSpaceProfileId = "sRGB";
  interface Frame {
    readonly isRoot: boolean; readonly name: string; readonly opacity: number;
    readonly visibility: "visible" | "hidden"; readonly blendMode: OraBlendMode;
    readonly isolation: "auto" | "isolate"; readonly children: OraLayerNode[];
  }
  const toStackNode = (f: Frame): OraLayerStack => ({
    type: "stack", name: f.name, opacity: f.opacity, visibility: f.visibility,
    blendMode: f.blendMode, isolation: f.isolation, children: f.children,
  });
  const frames: Frame[] = [];
  let rootChildren: OraLayerNode[] = [];
  let match = tagRegex.exec(xml);
  while (match !== null) {
    const isClose = match[1] === "/"; const tag = match[2] ?? "";
    const attrPart = match[3] ?? ""; const isSelfClose = match[4] === "/";
    if (tag === "image" && !isClose) {
      const a = parseXmlAttrs(attrPart);
      width = Number.parseInt(a.w ?? "800", 10) || 800; height = Number.parseInt(a.h ?? "1280", 10) || 1280;
      xres = Number.parseInt(a.xres ?? "300", 10) || 300; yres = Number.parseInt(a.yres ?? "300", 10) || 300;
      if (a["color-space"] === "sRGB" || a["color-space"] === "Display-P3" || a["color-space"] === "CMYK-FOGRA39") colorSpace = a["color-space"];
    } else if (tag === "stack" && !isClose) {
      const a = parseXmlAttrs(attrPart);
      const frame: Frame = {
        isRoot: frames.length === 0, name: a.name ?? "Group", opacity: Number.parseFloat(a.opacity ?? "1"),
        visibility: a.visibility === "hidden" ? "hidden" : "visible",
        blendMode: ORA_OP_TO_BLEND[a["composite-op"] ?? "svg:src-over"] ?? "normal",
        isolation: a.isolation === "isolate" ? "isolate" : "auto", children: [],
      };
      if (isSelfClose) frames[frames.length - 1]?.children.push(toStackNode(frame));
      else frames.push(frame);
    } else if (tag === "stack" && isClose) {
      const closed = frames.pop();
      if (closed) {
        if (closed.isRoot) rootChildren = closed.children;
        else frames[frames.length - 1]?.children.push(toStackNode(closed));
      }
    } else if (tag === "layer" && !isClose) {
      const a = parseXmlAttrs(attrPart);
      frames[frames.length - 1]?.children.push({
        type: "layer", name: a.name ?? "Layer", src: a.src ?? "data/layer.png",
        x: Number.parseInt(a.x ?? "0", 10) || 0, y: Number.parseInt(a.y ?? "0", 10) || 0,
        opacity: Number.parseFloat(a.opacity ?? "1"), visibility: a.visibility === "hidden" ? "hidden" : "visible",
        blendMode: ORA_OP_TO_BLEND[a["composite-op"] ?? "svg:src-over"] ?? "normal",
        ...(a["edit-locked"] === "true" ? { editLocked: true } : {}),
      });
    }
    match = tagRegex.exec(xml);
  }
  return { version: "0.0.5", width, height, xres, yres, colorSpace, rootStack: rootChildren };
}

export interface OcioColorPipelineConfig {
  readonly ocioProfileVersion: "2.2"; readonly sourceSpace: ColorSpaceProfileId; readonly targetSpace: ColorSpaceProfileId;
  readonly targetDcc: "krita" | "gimp" | "csp" | "photoshop"; readonly yaml: string; readonly configSha256: string;
}

/** OpenColorIO v2 YAML 파이프라인 설정을 생성한다(sRGB · Display-P3 · CMYK-FOGRA39). */
export function generateOcioConfigYaml(
  sourceSpace: ColorSpaceProfileId, targetSpace: ColorSpaceProfileId, targetDcc: "krita" | "gimp" | "csp" | "photoshop" = "krita",
): OcioColorPipelineConfig {
  const yaml = [
    "ocio_profile_version: 2.2",
    `description: ToonStudio OpenColorIO interchange (${sourceSpace} -> ${targetSpace} for ${targetDcc})`,
    "roles:", `  default: ${sourceSpace}`, "  scene_linear: Linear-Rec709", `  color_picking: ${targetSpace}`,
    "displays:", "  StudioDisplay:",
    `    - !<View> {name: Working, colorspace: ${sourceSpace}}`,
    `    - !<View> {name: Delivery, colorspace: ${targetSpace}}`,
    "colorspaces:",
    "  - !<ColorSpace> {name: sRGB, family: Display, bitdepth: 32f, encoding: sdr-video}",
    "  - !<ColorSpace> {name: Display-P3, family: Display, bitdepth: 32f, encoding: sdr-video}",
    "  - !<ColorSpace> {name: CMYK-FOGRA39, family: Print, bitdepth: 16ui, encoding: print-cmyk, description: ISO 12647-2 FOGRA39 TAC<=300%}",
  ].join("\n");
  return { ocioProfileVersion: "2.2", sourceSpace, targetSpace, targetDcc, yaml, configSha256: sha256Hex(yaml) };
}

export interface ColorConversionResult {
  readonly from: ColorSpaceProfileId; readonly to: ColorSpaceProfileId;
  readonly channels: readonly number[]; readonly outOfGamut: boolean; readonly totalAreaCoveragePercent?: number;
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number): number => { const v = Math.min(1, Math.max(0, c)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
const mulMat3 = (m: readonly number[], v: readonly [number, number, number]): readonly [number, number, number] => [
  (m[0] ?? 0) * v[0] + (m[1] ?? 0) * v[1] + (m[2] ?? 0) * v[2],
  (m[3] ?? 0) * v[0] + (m[4] ?? 0) * v[1] + (m[5] ?? 0) * v[2],
  (m[6] ?? 0) * v[0] + (m[7] ?? 0) * v[1] + (m[8] ?? 0) * v[2],
];
const MAT_SRGB_TO_P3: readonly number[] = [0.822462, 0.177538, 0, 0.033194, 0.966806, 0, 0.017083, 0.072397, 0.91052];
const MAT_P3_TO_SRGB: readonly number[] = [1.22494, -0.22494, 0, -0.042057, 1.042057, 0, -0.019638, -0.078636, 1.098274];

/** sRGB · Display-P3 · CMYK-FOGRA39 간 정규화(0..1) 색공간 변환 및 가멋/TAC(잉크 총량)를 계산한다. */
export function convertColorBetweenSpaces(inputChannels: readonly number[], from: ColorSpaceProfileId, to: ColorSpaceProfileId): ColorConversionResult {
  let linSrgb: readonly [number, number, number];
  if (from === "CMYK-FOGRA39") {
    const [c, m, y, k] = [0, 1, 2, 3].map((i) => Math.min(1, Math.max(0, inputChannels[i] ?? 0))) as [number, number, number, number];
    linSrgb = [srgbToLinear((1 - c) * (1 - k)), srgbToLinear((1 - m) * (1 - k)), srgbToLinear((1 - y) * (1 - k))];
  } else {
    const lin: readonly [number, number, number] = [srgbToLinear(inputChannels[0] ?? 0), srgbToLinear(inputChannels[1] ?? 0), srgbToLinear(inputChannels[2] ?? 0)];
    linSrgb = from === "Display-P3" ? mulMat3(MAT_P3_TO_SRGB, lin) : lin;
  }
  if (to === "CMYK-FOGRA39") {
    const [r, g, b] = [linearToSrgb(linSrgb[0]), linearToSrgb(linSrgb[1]), linearToSrgb(linSrgb[2])];
    const k = 1 - Math.max(r, g, b);
    const denom = 1 - k;
    let c = denom > 1e-6 ? (1 - r - k) / denom : 0;
    let m = denom > 1e-6 ? (1 - g - k) / denom : 0;
    let y = denom > 1e-6 ? (1 - b - k) / denom : 0;
    const rawTac = (c + m + y + k) * 100;
    const outOfGamut = rawTac > 300 || linSrgb.some((v) => v < -0.001 || v > 1.001);
    if (rawTac > 300) {
      const cmySum = c + m + y;
      const scale = cmySum > 1e-6 ? Math.min(1, Math.max(0, 3 - k) / cmySum) : 1;
      c *= scale; m *= scale; y *= scale;
    }
    return { from, to, outOfGamut, channels: [Number(c.toFixed(4)), Number(m.toFixed(4)), Number(y.toFixed(4)), Number(k.toFixed(4))], totalAreaCoveragePercent: Number(((c + m + y + k) * 100).toFixed(1)) };
  }
  const targetLin = to === "Display-P3" ? mulMat3(MAT_SRGB_TO_P3, linSrgb) : linSrgb;
  return { from, to, channels: targetLin.map((v) => Number(linearToSrgb(v).toFixed(4))), outOfGamut: targetLin.some((v) => v < -0.001 || v > 1.001) };
}

// === 4. 클라우드 스토리지 해시 차분 미러링 & 외부 에셋 영수증 자동 태깅 ===

export type CloudMirrorProvider = "google-drive" | "dropbox" | "onedrive" | "webdav-nas" | "s3-r2";
export interface LocalMirrorFileEntry { readonly relativePath: string; readonly sizeBytes: number; readonly contentSha256: string; readonly lastSyncedSha256?: string; }
export interface RemoteMirrorFileEntry { readonly relativePath: string; readonly sizeBytes: number; readonly contentSha256: string; }
export interface CloudMirrorTargetConfig { readonly provider: CloudMirrorProvider; readonly remoteRoot: string; readonly deleteOrphans?: boolean; }
export interface CloudMirrorSyncAction {
  readonly relativePath: string; readonly remotePath: string;
  readonly action: "upload" | "skip-identical" | "conflict" | "prune-orphan" | "retain-remote";
  readonly transferBytes: number; readonly useMultipart: boolean; readonly reason: string;
}
export interface CloudMirrorSyncPlan {
  readonly provider: CloudMirrorProvider;
  readonly protocol: "REST-Resumable" | "Chunked-Upload-v2" | "Graph-UploadSession" | "WebDAV-PUT" | "S3-Multipart";
  readonly actions: readonly CloudMirrorSyncAction[];
  readonly uploadCount: number; readonly skippedCount: number; readonly conflictCount: number; readonly orphanCount: number;
  readonly totalLocalBytes: number; readonly transferBytes: number; readonly deduplicatedBytes: number; readonly bandwidthSavingsRatio: number;
}

const PROVIDER_PROTOCOL: Record<CloudMirrorProvider, CloudMirrorSyncPlan["protocol"]> = {
  "google-drive": "REST-Resumable", dropbox: "Chunked-Upload-v2", onedrive: "Graph-UploadSession", "webdav-nas": "WebDAV-PUT", "s3-r2": "S3-Multipart",
};
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

/** 콘텐츠 SHA-256 해시 차분 기반 클라우드 미러링 동기화 계획을 산출한다. */
export function planCloudStorageMirrorSync(
  localFiles: readonly LocalMirrorFileEntry[], remoteFiles: readonly RemoteMirrorFileEntry[], target: CloudMirrorTargetConfig,
): CloudMirrorSyncPlan {
  const remoteMap = new Map(remoteFiles.map((r) => [r.relativePath, r]));
  const localPaths = new Set<string>();
  const rootPrefix = target.remoteRoot.replace(/\/+$/, "");
  const actions: CloudMirrorSyncAction[] = [];
  let uploadCount = 0; let skippedCount = 0; let conflictCount = 0; let orphanCount = 0;
  let totalLocalBytes = 0; let transferBytes = 0;
  for (const local of localFiles) {
    localPaths.add(local.relativePath);
    totalLocalBytes += local.sizeBytes;
    const remotePath = `${rootPrefix}/${local.relativePath.replace(/^\/+/, "")}`;
    const remote = remoteMap.get(local.relativePath);
    if (remote && remote.contentSha256 === local.contentSha256) {
      skippedCount += 1;
      actions.push({ relativePath: local.relativePath, remotePath, action: "skip-identical", transferBytes: 0, useMultipart: false, reason: "SHA-256 identical on remote" });
    } else if (remote && local.lastSyncedSha256 !== undefined && remote.contentSha256 !== local.lastSyncedSha256 && local.contentSha256 !== local.lastSyncedSha256) {
      conflictCount += 1;
      actions.push({ relativePath: local.relativePath, remotePath, action: "conflict", transferBytes: 0, useMultipart: false, reason: "Diverged local and remote SHA-256 since last sync" });
    } else {
      uploadCount += 1; transferBytes += local.sizeBytes;
      actions.push({ relativePath: local.relativePath, remotePath, action: "upload", transferBytes: local.sizeBytes, useMultipart: local.sizeBytes >= MULTIPART_THRESHOLD_BYTES, reason: remote ? "Local SHA-256 changed" : "New file absent on remote" });
    }
  }
  for (const remote of remoteFiles) {
    if (localPaths.has(remote.relativePath)) continue;
    orphanCount += 1;
    actions.push({ relativePath: remote.relativePath, remotePath: `${rootPrefix}/${remote.relativePath.replace(/^\/+/, "")}`, action: target.deleteOrphans ? "prune-orphan" : "retain-remote", transferBytes: 0, useMultipart: false, reason: target.deleteOrphans ? "Orphan remote object scheduled for prune" : "Retained remote archive" });
  }
  const deduplicatedBytes = Math.max(0, totalLocalBytes - transferBytes);
  return {
    provider: target.provider, protocol: PROVIDER_PROTOCOL[target.provider], actions,
    uploadCount, skippedCount, conflictCount, orphanCount, totalLocalBytes, transferBytes, deduplicatedBytes,
    bandwidthSavingsRatio: totalLocalBytes > 0 ? Number((deduplicatedBytes / totalLocalBytes).toFixed(4)) : 1,
  };
}

export interface ExternalAssetReceiptInput {
  readonly receiptId: string; readonly assetName: string; readonly vendorHint: string;
  readonly filename: string; readonly licenseText: string; readonly orderNumber?: string;
}
export interface TaggedExternalAssetReceipt {
  readonly receiptId: string; readonly detectedSourceKind: ExternalAssetSourceKind;
  readonly normalizedVendor: string; readonly tags: readonly string[];
  readonly warnings: readonly string[]; readonly rightsEntry: RightsBomAssetEntry;
}

/** 외부 구매 에셋 영수증(ACON3D/Sketchfab/폰트/브러시)을 자동 분류·태깅해 Rights BOM 항목으로 정규화한다. */
export function autoTagExternalAssetReceipts(receipts: readonly ExternalAssetReceiptInput[]): readonly TaggedExternalAssetReceipt[] {
  return receipts.map((r) => {
    const hay = `${r.vendorHint} ${r.filename} ${r.assetName}`.toLowerCase();
    const lic = r.licenseText.toLowerCase();
    let detectedSourceKind: ExternalAssetSourceKind = "texture";
    let normalizedVendor = r.vendorHint.trim() || "Unknown Vendor";
    if (hay.includes("acon3d") || hay.includes(".skp")) { detectedSourceKind = "acon3d"; normalizedVendor = "ACON3D"; }
    else if (hay.includes("sketchfab") || hay.includes(".glb") || hay.includes(".gltf")) { detectedSourceKind = "sketchfab"; normalizedVendor = "Sketchfab"; }
    else if (hay.includes("font") || hay.includes(".otf") || hay.includes(".ttf") || hay.includes(".woff")) { detectedSourceKind = "font"; }
    else if (hay.includes("brush") || hay.includes(".sut") || hay.includes(".abr") || hay.includes(".brushset")) { detectedSourceKind = "brush"; }

    const nonCommercial = lic.includes("non-commercial") || lic.includes("비상업") || lic.includes("personal only");
    const domesticOnly = lic.includes("korea only") || lic.includes("국내 전용");
    const noDerivatives = lic.includes("no derivatives") || lic.includes("2차 수정 금지") || /\bcc-by-nd\b/.test(lic);
    const noPrint = lic.includes("web only") || lic.includes("인쇄 불가");
    const attributionRequired = lic.includes("cc-by") || lic.includes("출처 표기");

    const warnings: string[] = [];
    if (!r.orderNumber || r.orderNumber.trim().length < 4) warnings.push("Missing verified order/invoice number");
    if (nonCommercial) warnings.push("Non-commercial license restricts monetization");
    if (domesticOnly) warnings.push("Domestic-only license restricts global platform release");
    if (noPrint) warnings.push("Web-only license restricts PDF/X-4 print book");

    const tags = [`source:${detectedSourceKind}`, nonCommercial ? "rights:non-commercial" : "rights:commercial-ok", domesticOnly ? "region:kr-only" : "region:global-ok", noPrint ? "media:web-only" : "media:print-ok"];
    const rightsEntry: RightsBomAssetEntry = {
      assetId: `asset-${r.receiptId}`, name: r.assetName, vendor: normalizedVendor, sourceKind: detectedSourceKind,
      licenseName: r.licenseText.trim() || "Standard Commercial License", receiptRef: r.orderNumber?.trim() || `UNVERIFIED-${r.receiptId}`,
      contentSha256: sha256Hex(`${r.receiptId}|${r.filename}|${r.licenseText}`),
      permissions: { commercialUse: !nonCommercial, globalDistribution: !domesticOnly, derivativeWorks: !noDerivatives, printPublication: !noPrint, aiTrainingAllowed: false },
      attributionRequired,
    };
    return { receiptId: r.receiptId, detectedSourceKind, normalizedVendor, tags, warnings, rightsEntry };
  });
}

// === 5. 데모 픽스처 ===

export function createDemoC2paInput(): C2paProvenanceInput {
  const tagged = autoTagExternalAssetReceipts([
    { receiptId: "rcpt-01", assetName: "Seoul Rooftop Cafe 3D Set", vendorHint: "ACON3D", filename: "seoul_rooftop_cafe.skp", licenseText: "ACON3D Standard Commercial Global Print License", orderNumber: "ACON-2026-88412" },
    { receiptId: "rcpt-02", assetName: "Cyber Alley Props Pack", vendorHint: "Sketchfab", filename: "cyber_alley_props.glb", licenseText: "Sketchfab Standard Commercial CC-BY Attribution", orderNumber: "SKFB-2026-44109" },
    { receiptId: "rcpt-03", assetName: "KoPubWorld Batang Bold", vendorHint: "KPPA Foundry", filename: "KoPubWorldBatangBold.otf", licenseText: "Commercial Global Web & Print Embedded Font License", orderNumber: "FONT-2026-10291" },
    { receiptId: "rcpt-04", assetName: "G-Pen Master Ink Brush", vendorHint: "ToonStudio Official", filename: "gpen_master_ink.sut", licenseText: "Royalty-Free Commercial Global Print License", orderNumber: "BRSH-2026-99021" },
  ]);
  return {
    workId: "toon-ep024-seoul-dawn", episodeTitle: "Episode 24: Dawn Over Euljiro",
    creatorName: "Han Seoyeon", creatorHandle: "@seoyeon.studio",
    createdAtIso: DEFAULT_CREATED_ISO, aiTrainingPolicy: "notAllowed", dataMiningPolicy: "notAllowed",
    layers: [
      { layerId: "lyr-bg3d", name: "3D Rooftop Line & Tone", kind: "3d-bg", contentSha256: sha256Hex("bg3d-ep24-v3"), authoredBy: "Han Seoyeon", toolName: "ToonStudio 3D NPR" },
      { layerId: "lyr-ink", name: "Character Master Ink", kind: "vector", contentSha256: sha256Hex("ink-ep24-v9"), authoredBy: "Han Seoyeon", toolName: "ToonStudio Vector Ink" },
      { layerId: "lyr-color", name: "Cel Shade & Rim Light", kind: "raster", contentSha256: sha256Hex("color-ep24-v5"), authoredBy: "Han Seoyeon", toolName: "ToonStudio Canvas2D" },
      { layerId: "lyr-letter", name: "Dialogue & SFX Master", kind: "text", contentSha256: sha256Hex("letter-ep24-v2"), authoredBy: "Han Seoyeon", toolName: "ToonStudio Lettering" },
    ],
    rightsBom: tagged.map((item) => item.rightsEntry),
  };
}

export function createDemoOpenRasterDocument(): OpenRasterDocument {
  return {
    version: "0.0.5", width: 1600, height: 2560, xres: 300, yres: 300, colorSpace: "Display-P3",
    rootStack: [
      {
        type: "stack", name: "Dialogue & Effects", opacity: 1, visibility: "visible", blendMode: "normal", isolation: "isolate",
        children: [
          { type: "layer", name: "Balloon Text", src: "data/layer_001_text.png", x: 120, y: 180, opacity: 1, visibility: "visible", blendMode: "normal" },
          { type: "layer", name: "Rim Glow", src: "data/layer_002_glow.png", x: 0, y: 0, opacity: 0.65, visibility: "visible", blendMode: "screen" },
        ],
      },
      { type: "layer", name: "Character Ink & Line", src: "data/layer_003_ink.png", x: 0, y: 0, opacity: 1, visibility: "visible", blendMode: "multiply", editLocked: true },
      { type: "layer", name: "Base Flat Color", src: "data/layer_004_base.png", x: 0, y: 0, opacity: 1, visibility: "visible", blendMode: "normal" },
    ],
  };
}

export function createDemoCloudMirrorFixture(): { readonly localFiles: readonly LocalMirrorFileEntry[]; readonly remoteFiles: readonly RemoteMirrorFileEntry[] } {
  const hashA = sha256Hex("ep24-master-ora-v3");
  const hashB = sha256Hex("ep24-c2pa-manifest-v3");
  const hashC = sha256Hex("ep24-xliff-ja-v1");
  const hashOldB = sha256Hex("ep24-c2pa-manifest-v2");
  return {
    localFiles: [
      { relativePath: "episodes/ep024/master.ora", sizeBytes: 18_400_000, contentSha256: hashA, lastSyncedSha256: hashA },
      { relativePath: "episodes/ep024/provenance.c2pa.json", sizeBytes: 14_200, contentSha256: hashB, lastSyncedSha256: hashOldB },
      { relativePath: "episodes/ep024/localization/ja.xlf", sizeBytes: 42_500, contentSha256: hashC },
    ],
    remoteFiles: [
      { relativePath: "episodes/ep024/master.ora", sizeBytes: 18_400_000, contentSha256: hashA },
      { relativePath: "episodes/ep024/provenance.c2pa.json", sizeBytes: 13_900, contentSha256: hashOldB },
    ],
  };
}
