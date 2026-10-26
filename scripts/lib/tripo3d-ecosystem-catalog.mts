/**
 * 2026-10-27 REA(Reverse-Engineer-Anything) 역공학 기반 3D 생태계 통합 카탈로그 및 플래너/검증 엔진.
 *
 * 근거 아티팩트 (REA Evidence):
 * - studio.tripo3d.ai 웹 워크스페이스 (CDP & Web Bundle):
 *   - ev_6487907c76df34db51e8dbe0f43d394a3d4171d591352685e244753beedf37a7 (/ko localStorage 45키)
 *   - ev_753d835fcf08b13ec795f411d76e6ab028927b23790b1ae46b320dabb9b5b7d8 (analyze_web_bundle)
 *   - ev_2b781791cb50fbb9689176162a95defd0c20c51164f31c3c26a9794f09da1705 (/ko/workspace)
 *   - ev_7b583bf707d10b3ef1e4cb746784c84b746784c84b4a261e873398f7748a54bc755848da5e (/ko/workspace/generate: H3.1 & Smart Mesh P2.0)
 *   - ev_923cecb15741de1d45fb3d32c60af0dc96555430c7ac67062b3c2338f442eb82 (/ko/workspace/texture-edit: 매직 브러시)
 *   - ev_67e95cd84edb74b81236aaf90b21431154f6c2cf0e018038747a1aa775cb2e4e (/ko/workspace/animate: 텍스트를 동작으로)
 *   - ev_6858a268f7b805309411911cc9e3ddac4f503d8a815ceeded5bfa681b257159c (/ko/workspace/smart-uv: 80k Tri / 40k Quad)
 *   - ev_126d01d7e2ddcc195ccddea67672cfaecfc96f9be8042de41a675bd30e5102f2 (/ko/workspace/segmentation: 40크레딧, 150MB 상한)
 * - @glbforge/core@0.4.0 & @glbforge/mcp@0.4.1:
 *   - ev_238693ba315199ddc55df0bf5b06f4d2e20a5d2ceaee7936d8748eb159c0570a
 *   - ev_9ebefe304dc4e3fe5bc3fe77ced2c1e4c41f1613719801b667c87cafdaf99fec
 * - @meshy-ai/meshy-mcp-server@0.5.2:
 *   - ev_b3ae03ba1166a7d6cd69fe23d66ce93d3521d753ff5257ab5920d1e9e7c6ed5a
 * - @hyper3d/cli (https://api.hyper3d.com/api/mcp):
 *   - ev_fd211a7f75b88ab05328751ea650b0b1f1272625bcaaa24dfc7880b201587872
 * - vrm-toolkit-mcp@0.1.1:
 *   - ev_61baa84cd7c9b3740f1230d171d8e5b5bdd4f86cb8488b698a20f5a07a47b13f
 */

export interface TripoStudioWorkspaceSpec {
  readonly id: string;
  readonly route: string;
  readonly titleKo: string;
  readonly category: "generation" | "topology" | "texture" | "animation";
  readonly badgeKo?: string;
  readonly creditCost: number;
  readonly trialQuotaLabelKo?: string;
  readonly constraintsKo: readonly string[];
  readonly highlightsKo: readonly string[];
}

export const TRIPO3D_STUDIO_WEB_WORKSPACES: readonly TripoStudioWorkspaceSpec[] = [
  {
    id: "generate-image",
    route: "/ko/workspace/generate-image",
    titleKo: "3D용 이미지 생성",
    category: "generation",
    creditCost: 5,
    constraintsKo: ["전면/4-View 멀티뷰 레퍼런스 시트 생성 지원"],
    highlightsKo: ["T-Pose/A-Pose 전신 캐릭터 보완", "배경 투명화 알파 실루엣 추출"],
  },
  {
    id: "generate",
    route: "/ko/workspace/generate",
    titleKo: "3D 모델 생성 (H3.1 & 스마트 메시 P2.0)",
    category: "generation",
    badgeKo: "H3.1 / P2.0",
    creditCost: 65,
    trialQuotaLabelKo: "생성 65 -> 0 (체험 크레딧)",
    constraintsKo: [
      "HD 모델(H3.1): 최고 품질(~1,748,418 삼각형 / 981,375 버텍스), 대기 시간 증가",
      "스마트 메시(P2.0): 깔끔한 쿼드(Quad) 토폴로지 & 부분별 편집 지원",
    ],
    highlightsKo: [
      "부분별 생성(Generate in Parts) 체험 ×1",
      "8K 텍스처(8K Texture) 체험 ×1",
      "깔끔한 토폴로지(Clean Topology) 체험 ×2",
    ],
  },
  {
    id: "segmentation",
    route: "/ko/workspace/segmentation",
    titleKo: "시맨틱 파츠 분할 (Segmentation)",
    category: "topology",
    creditCost: 40,
    trialQuotaLabelKo: "분할 시작 40 -> 0",
    constraintsKo: [
      "쿼드(Quad) 모델 및 리깅(Rigged) 완료 모델에서는 사용 불가",
      "외부 업로드 허용 포맷: OBJ, FBX, STL, GLB (크기 ≤ 150MB)",
    ],
    highlightsKo: ["브러시 스트로크 파츠 병합/분리", "파츠 계층 분리 후 파트 보완(Fill Parts) 직결"],
  },
  {
    id: "fill-parts",
    route: "/ko/workspace/fill-parts",
    titleKo: "파트 보완 (Fill Parts)",
    category: "topology",
    creditCost: 20,
    constraintsKo: ["시맨틱 분할(Segmentation) 직후 서브메시에만 적용 가능"],
    highlightsKo: ["분할된 파츠 내부의 가려진 단면을 방수(Watertight) 지오메트리로 복원"],
  },
  {
    id: "retopology",
    route: "/ko/workspace/retopology",
    titleKo: "리토폴로지 (Retopology)",
    category: "topology",
    creditCost: 10,
    constraintsKo: ["Smart Mesh P2.0 쿼드/삼각 타깃 폴리곤 지정 (48~150,000면)"],
    highlightsKo: ["하이폴리 H3.1 모델을 애니메이션/게임용 균일 쿼드 메시로 경량화"],
  },
  {
    id: "smart-uv",
    route: "/ko/workspace/smart-uv",
    titleKo: "스마트 UV (AI 자동 언랩)",
    category: "topology",
    badgeKo: "NEW",
    creditCost: 0,
    trialQuotaLabelKo: "무료 사용해 보기",
    constraintsKo: [
      "폴리곤 상한: 삼각형 면(Triangles) ≤ 80,000개",
      "폴리곤 상한: 사각형 면(Quads) ≤ 40,000개",
    ],
    highlightsKo: ["AI 시맨틱 재봉선(Seam) 탐색", "텍스처 왜곡 최소화 및 아틀라스 자동 패킹"],
  },
  {
    id: "texture",
    route: "/ko/workspace/texture",
    titleKo: "AI 텍스처 생성 (v3.5 Delight)",
    category: "texture",
    creditCost: 10,
    constraintsKo: ["텍스트/참조 이미지 기반 알베도 및 그림자 제거(Delight) 생성"],
    highlightsKo: ["웹툰 툰셰이더와 충돌하는 베이킹 그림자 제거(Delight)"],
  },
  {
    id: "texture-edit",
    route: "/ko/workspace/texture-edit",
    titleKo: "매직 브러시 (Magic Brush 로컬 텍스처 편집)",
    category: "texture",
    badgeKo: "Magic Brush",
    creditCost: 5,
    constraintsKo: ["3D 뷰포트 마스킹 영역 + 프롬프트 기반 국소 인페인팅"],
    highlightsKo: ["의상 문양·간판 로고·얼굴 데칼 등 특정 부위만 무손실 부분 리텍스처링"],
  },
  {
    id: "texture-upscale",
    route: "/ko/workspace/texture-upscale",
    titleKo: "텍스처 업스케일 (4K / 8K)",
    category: "texture",
    badgeKo: "8K",
    creditCost: 15,
    trialQuotaLabelKo: "8K 텍스처 체험 ×1",
    constraintsKo: ["2K 표준 맵을 4K(4096px) 또는 8K(8192px) 초고해상도 맵으로 업스케일"],
    highlightsKo: ["웹툰 표지/근접 클로즈업 컷에서 픽셀 깨짐 방지"],
  },
  {
    id: "texture-pbr",
    route: "/ko/workspace/texture-pbr",
    titleKo: "PBR 재질 맵 생성",
    category: "texture",
    creditCost: 10,
    constraintsKo: ["BaseColor, Normal, Metallic, Roughness, AO 5채널 동기화"],
    highlightsKo: ["금속·유리·가죽·네온 등 물리 기반 반사 질감 합성"],
  },
  {
    id: "rigging",
    route: "/ko/workspace/rigging",
    titleKo: "3D 자동 리깅 (Auto-Rig v3.0)",
    category: "animation",
    creditCost: 15,
    constraintsKo: ["8종 체형(biped/quadruped 등) × 6종 스펙(VRM/Mixamo/Unity/Unreal/ActorCore/Tripo)"],
    highlightsKo: ["사전 rig-check 게이트로 비리깅 형상 크레딧 낭비 차단"],
  },
  {
    id: "animate",
    route: "/ko/workspace/animate",
    titleKo: "애니메이션 & 텍스트를 동작으로 (Text-to-Motion)",
    category: "animation",
    badgeKo: "Text-to-Motion",
    creditCost: 10,
    constraintsKo: ["휴머노이드 리깅 완료 모델 대상 프리셋 및 자연어 모션 생성"],
    highlightsKo: ["자연어 프롬프트('검을 휘두르며 점프') 기반 모션 생성 및 FBX/GLB 리타게팅"],
  },
] as const;

export const TRIPO3D_STUDIO_ASSET_FILTERS = {
  assetType: ["model", "image"] as const,
  ownership: ["my_assets", "collected"] as const,
  meshState: ["all", "smart_mesh", "untextured", "textured", "rigged"] as const,
  modelActions: ["free_retry", "share_for_coupon", "recommend_my_model", "export", "reference_view"] as const,
} as const;

export interface GlbForgePerformanceBudget {
  readonly id: "mobile-hero" | "desktop-hero" | "product-configurator" | "webtoon-scene-cluster";
  readonly labelKo: string;
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxTextureSize: number;
  readonly maxTextureBytes: number;
  readonly maxTextureVramBytes: number;
  readonly maxFileBytes: number;
  readonly maxMaterials: number;
}

export const GLBFORGE_PERFORMANCE_PROFILES: Readonly<
  Record<GlbForgePerformanceBudget["id"], GlbForgePerformanceBudget>
> = {
  "mobile-hero": {
    id: "mobile-hero",
    labelKo: "모바일 히어로 에셋 (4G / 미드레인지 GPU)",
    maxTriangles: 150_000,
    maxDrawCalls: 4,
    maxTextureSize: 2048,
    maxTextureBytes: 4 * 1024 * 1024,
    maxTextureVramBytes: 128 * 1024 * 1024,
    maxFileBytes: 6 * 1024 * 1024,
    maxMaterials: 2,
  },
  "desktop-hero": {
    id: "desktop-hero",
    labelKo: "데스크톱 히어로 에셋 (고해상도 쇼케이스)",
    maxTriangles: 500_000,
    maxDrawCalls: 8,
    maxTextureSize: 4096,
    maxTextureBytes: 12 * 1024 * 1024,
    maxTextureVramBytes: 256 * 1024 * 1024,
    maxFileBytes: 20 * 1024 * 1024,
    maxMaterials: 4,
  },
  "product-configurator": {
    id: "product-configurator",
    labelKo: "다중 소품 컨피규레이터 / 인터랙티브 뷰어",
    maxTriangles: 250_000,
    maxDrawCalls: 12,
    maxTextureSize: 2048,
    maxTextureBytes: 8 * 1024 * 1024,
    maxTextureVramBytes: 128 * 1024 * 1024,
    maxFileBytes: 12 * 1024 * 1024,
    maxMaterials: 8,
  },
  "webtoon-scene-cluster": {
    id: "webtoon-scene-cluster",
    labelKo: "웹툰 3D 배경 클러스터 (MCP Free Pack 표준)",
    maxTriangles: 40_000,
    maxDrawCalls: 2,
    maxTextureSize: 1024,
    maxTextureBytes: 2 * 1024 * 1024,
    maxTextureVramBytes: 32 * 1024 * 1024,
    maxFileBytes: 2 * 1024 * 1024,
    maxMaterials: 3,
  },
} as const;

export const GLBFORGE_LINT_RULES = [
  { ruleId: "perf/triangles", severity: "error", resolvesBy: "optimize_glb (Meshopt ratchet [0.001, 0.01, 0.05, 0.1])" },
  { ruleId: "perf/draw-calls", severity: "error", resolvesBy: "optimize_glb (palette + flatten + join)" },
  { ruleId: "perf/file-size", severity: "error", resolvesBy: "optimize_glb (WebP quality 82 + meshopt medium)" },
  { ruleId: "perf/materials", severity: "warn", resolvesBy: "optimize_glb (palette min:5 + material merge)" },
  { ruleId: "tex/oversize", severity: "error", resolvesBy: "optimize_glb (Lanczos3 textureResize)" },
  { ruleId: "tex/total-bytes", severity: "warn", resolvesBy: "optimize_glb (WebP / KTX2 UASTC + ETC1S)" },
  { ruleId: "tex/vram-budget", severity: "error", resolvesBy: "optimize_glb (KTX2 Basis Universal GPU supercompression)" },
  { ruleId: "tex/uncompressed-png", severity: "warn", resolvesBy: "optimize_glb (PNG > 100KB → WebP nearLossless for normalMap)" },
  { ruleId: "tex/non-pot", severity: "info", resolvesBy: "optimize_glb (Power-of-Two 밉맵 리샘플링)" },
  { ruleId: "geo/uncompressed", severity: "warn", resolvesBy: "optimize_glb (EXT_meshopt_compression)" },
  { ruleId: "mat/unused", severity: "info", resolvesBy: "optimize_glb (dedup + prune)" },
  { ruleId: "topo/non-manifold", severity: "warn", resolvesBy: "Blender/DCC non-manifold repair (3+ 공유 엣지 정리)" },
  { ruleId: "topo/open-boundary", severity: "info", resolvesBy: "Tripo fill-parts 또는 STL 바닥/뒷면 캡핑" },
  { ruleId: "topo/degenerate-tris", severity: "warn", resolvesBy: "optimize_glb (weld + zero-area 삼각형 제거)" },
  { ruleId: "topo/unwelded-seams", severity: "info", resolvesBy: "optimize_glb (weld + 면적 가중 스무스 노멀 재계산)" },
  { ruleId: "topo/redundant-verts", severity: "warn", resolvesBy: "optimize_glb (weld)" },
  { ruleId: "scene/scale-sanity", severity: "warn", resolvesBy: "미터(m) 단위 정규화 (0.01m ~ 100m 범위 보정)" },
] as const;

export interface GlbAuditInputMetrics {
  readonly profile?: GlbForgePerformanceBudget["id"];
  readonly triangles: number;
  readonly vertices: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly fileBytes: number;
  readonly maxTextureDimension: number;
  readonly textureBytesTotal: number;
  readonly textureVramTotal?: number;
  readonly nonManifoldEdges?: number;
  readonly degenerateTriangles?: number;
  readonly maxExtentMeters?: number;
}

export interface GlbAuditFinding {
  readonly ruleId: string;
  readonly severity: "error" | "warn" | "info";
  readonly messageKo: string;
  readonly suggestionKo: string;
}

export interface GlbAuditReport {
  readonly profile: GlbForgePerformanceBudget["id"];
  readonly score: number;
  readonly passed: boolean;
  readonly findings: readonly GlbAuditFinding[];
  readonly optimizationStages: readonly string[];
  readonly lodTargets: {
    readonly lod0Triangles: number;
    readonly lod1Triangles: number;
    readonly lod2Triangles: number;
  };
}

export function auditGlbAssetAgainstProfile(input: GlbAuditInputMetrics): GlbAuditReport {
  const profileId = input.profile ?? "mobile-hero";
  const budget = GLBFORGE_PERFORMANCE_PROFILES[profileId];
  const findings: GlbAuditFinding[] = [];

  if (input.triangles > budget.maxTriangles) {
    findings.push({
      ruleId: "perf/triangles",
      severity: "error",
      messageKo: `삼각형 수(${input.triangles.toLocaleString()})가 '${budget.labelKo}' 예산(${budget.maxTriangles.toLocaleString()})을 초과합니다.`,
      suggestionKo: "Meshopt 4단계 오차 래칫([0.001, 0.01, 0.05, 0.1]) 데시메이션을 실행하세요.",
    });
  }
  if (input.drawCalls > budget.maxDrawCalls) {
    findings.push({
      ruleId: "perf/draw-calls",
      severity: "error",
      messageKo: `드로우콜(${input.drawCalls})이 예산(${budget.maxDrawCalls})을 초과합니다.`,
      suggestionKo: "단색 머티리얼 팔레트 병합(palette min:5) 및 flatten + join을 실행하세요.",
    });
  }
  if (input.fileBytes > budget.maxFileBytes) {
    findings.push({
      ruleId: "perf/file-size",
      severity: "error",
      messageKo: `파일 크기(${(input.fileBytes / (1024 * 1024)).toFixed(2)} MiB)가 예산(${(budget.maxFileBytes / (1024 * 1024)).toFixed(2)} MiB)을 초과합니다.`,
      suggestionKo: "WebP(quality:82, 노멀맵 nearLossless) + Meshopt(level:medium) 압축을 적용하세요.",
    });
  }
  if (input.materials > budget.maxMaterials) {
    findings.push({
      ruleId: "perf/materials",
      severity: "warn",
      messageKo: `머티리얼 수(${input.materials})가 권장 상한(${budget.maxMaterials})을 초과합니다.`,
      suggestionKo: "텍스처 아틀라스 패킹 또는 팔레트 머티리얼 통합을 수행하세요.",
    });
  }
  if (input.maxTextureDimension > budget.maxTextureSize) {
    findings.push({
      ruleId: "tex/oversize",
      severity: "error",
      messageKo: `최대 텍스처 해상도(${input.maxTextureDimension}px)가 예산(${budget.maxTextureSize}px)을 초과합니다.`,
      suggestionKo: `Lanczos3 리샘플링으로 ${budget.maxTextureSize}px 이하로 축소하세요.`,
    });
  }
  if (input.textureBytesTotal > budget.maxTextureBytes) {
    findings.push({
      ruleId: "tex/total-bytes",
      severity: "warn",
      messageKo: `총 텍스처 용량이 예산(${(budget.maxTextureBytes / (1024 * 1024)).toFixed(1)} MiB)을 초과합니다.`,
      suggestionKo: "PNG를 WebP 또는 KTX2(UASTC 노멀 / ETC1S 컬러)로 변환하세요.",
    });
  }
  if ((input.textureVramTotal ?? 0) > budget.maxTextureVramBytes) {
    findings.push({
      ruleId: "tex/vram-budget",
      severity: "error",
      messageKo: "GPU 언압축 텍스처 VRAM 추정치가 예산을 초과합니다.",
      suggestionKo: "KTX2 GPU 슈퍼컴프레션 또는 해상도 다운스케일을 적용하세요.",
    });
  }
  if ((input.nonManifoldEdges ?? 0) > 0) {
    findings.push({
      ruleId: "topo/non-manifold",
      severity: "warn",
      messageKo: `비다양체(Non-manifold) 엣지 ${input.nonManifoldEdges}개가 감지되었습니다.`,
      suggestionKo: "렌더링에는 무해하나 3D 프린팅/불리언 연산 시 아티팩트가 발생할 수 있습니다.",
    });
  }
  if ((input.degenerateTriangles ?? 0) > 0) {
    findings.push({
      ruleId: "topo/degenerate-tris",
      severity: "warn",
      messageKo: `면적 0인 퇴화 삼각형 ${input.degenerateTriangles}개가 감지되었습니다.`,
      suggestionKo: "weld 및 퇴화 폴리곤 정리 패스를 적용하세요.",
    });
  }
  if (
    typeof input.maxExtentMeters === "number" &&
    (input.maxExtentMeters < 0.01 || input.maxExtentMeters > 100)
  ) {
    findings.push({
      ruleId: "scene/scale-sanity",
      severity: "warn",
      messageKo: `바운딩 박스 최대 치수(${input.maxExtentMeters}m)가 표준 미터 스케일(0.01m~100m)을 벗어났습니다.`,
      suggestionKo: "cm/mm 단위로 익스포트된 에셋인지 확인하고 1m 기준으로 정규화하세요.",
    });
  }

  let penalty = 0;
  for (const f of findings) {
    if (f.severity === "error") penalty += 20;
    else if (f.severity === "warn") penalty += 7;
    else penalty += 2;
  }
  const score = Math.max(0, 100 - penalty);
  const passed = !findings.some((f) => f.severity === "error");

  return {
    profile: profileId,
    score,
    passed,
    findings,
    optimizationStages: [
      "1. dedup + prune (중복 버퍼/미사용 머티리얼 제거)",
      "2. palette(min:5) + flatten + join (드로우콜 병합)",
      "3. weld (중복 정점 병합)",
      "4. meshoptSimplifier 4단계 오차 래칫 ([0.001, 0.01, 0.05, 0.1])",
      "5. recomputeSmoothNormals (면적 가중 정점 노멀 재계산)",
      `6. textureResize (≤ ${budget.maxTextureSize}px Lanczos3) + WebP(quality:82, normal nearLossless)`,
      "7. meshopt(level:'medium') 지오메트리 압축",
      "8. LOD 체인 생성 (.lod1.glb 25% 에러 0.05 / .lod2.glb 6% 에러 0.2, 텍스처 스트립)",
    ],
    lodTargets: {
      lod0Triangles: Math.min(input.triangles, budget.maxTriangles),
      lod1Triangles: Math.max(100, Math.round(Math.min(input.triangles, budget.maxTriangles) * 0.25)),
      lod2Triangles: Math.max(48, Math.round(Math.min(input.triangles, budget.maxTriangles) * 0.06)),
    },
  };
}

export type GlbForgeExtrudeMaterialPresetId =
  | "enamel"
  | "chrome"
  | "rubber"
  | "neon"
  | "acrylic";

export interface GlbForgeExtrudeMaterialSpec {
  readonly id: GlbForgeExtrudeMaterialPresetId;
  readonly labelKo: string;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly emissiveBoost: number;
  readonly transmissionFactor: number;
  readonly descriptionKo: string;
}

export const GLBFORGE_EXTRUDE_MATERIAL_PRESETS: Readonly<
  Record<GlbForgeExtrudeMaterialPresetId, GlbForgeExtrudeMaterialSpec>
> = {
  enamel: {
    id: "enamel",
    labelKo: "칠보 / 에나멜 배지 (Enamel Pin)",
    metallicFactor: 0.1,
    roughnessFactor: 0.18,
    emissiveBoost: 0,
    transmissionFactor: 0,
    descriptionKo: "배경 레이어(Layer 0) 황동/금속 림(metallic=1, roughness=0.35) + 상단 유광 에나멜(metallic=0.1, roughness=0.18)",
  },
  chrome: {
    id: "chrome",
    labelKo: "크롬 메탈 엠블럼 (Chrome)",
    metallicFactor: 1.0,
    roughnessFactor: 0.08,
    emissiveBoost: 0,
    transmissionFactor: 0,
    descriptionKo: "고반사 거울형 금속 간판 및 무기 장식(metallic=1.0, roughness=0.08)",
  },
  rubber: {
    id: "rubber",
    labelKo: "매트 PVC / 실리콘 키링 (Rubber)",
    metallicFactor: 0.0,
    roughnessFactor: 0.95,
    emissiveBoost: 0,
    transmissionFactor: 0,
    descriptionKo: "무광 소프트 러버 굿즈 및 스탬프 소품(metallic=0.0, roughness=0.95)",
  },
  neon: {
    id: "neon",
    labelKo: "웹툰 야경 네온사인 (Neon Sign)",
    metallicFactor: 0.0,
    roughnessFactor: 0.2,
    emissiveBoost: 1.0,
    transmissionFactor: 0,
    descriptionKo: "emissiveFactor=레이어 컬러 100%, baseColor=15% 감쇠로 야경 골목 간판 자체 발광 구현",
  },
  acrylic: {
    id: "acrylic",
    labelKo: "투명 아크릴 스탠드 / 키링 (Acrylic)",
    metallicFactor: 0.0,
    roughnessFactor: 0.1,
    emissiveBoost: 0,
    transmissionFactor: 0.85,
    descriptionKo: "KHR_materials_transmission(factor=0.85, roughness=0.1) 반투명 캐릭터 스탠드",
  },
} as const;

export interface ReliefExtrusionPlanInput {
  readonly mode?: "alpha" | "luma";
  readonly threshold?: number;
  readonly depthCm?: number;
  readonly bevelCm?: number;
  readonly bevelSteps?: number;
  readonly layers?: number;
  readonly layerStepCm?: number;
  readonly pillowCm?: number;
  readonly embossCm?: number;
  readonly preset?: GlbForgeExtrudeMaterialPresetId;
  readonly sharpCornerDeg?: number;
}

export interface ReliefExtrusionPlanResult {
  readonly mode: "alpha" | "luma";
  readonly threshold: number;
  readonly depthMeters: number;
  readonly bevelMeters: number;
  readonly bevelSteps: number;
  readonly layers: number;
  readonly layerStepMeters: number;
  readonly pillowMeters: number;
  readonly embossMeters: number;
  readonly sharpCornerDeg: number;
  readonly materialSpec: GlbForgeExtrudeMaterialSpec;
  readonly algorithmPipelineKo: readonly string[];
  readonly stlWatertightReady: boolean;
}

export function plan2dTo3dReliefExtrusion(
  input: ReliefExtrusionPlanInput = {},
): ReliefExtrusionPlanResult {
  const mode = input.mode ?? "alpha";
  const threshold = Math.max(1, Math.min(254, Math.round(input.threshold ?? 128)));
  const depthCm = Math.max(0.2, Math.min(20, input.depthCm ?? 1.2));
  const bevelCm = Math.max(0, Math.min(depthCm * 0.45, input.bevelCm ?? 0.15));
  const bevelSteps = Math.max(1, Math.min(8, Math.round(input.bevelSteps ?? 3)));
  const layers = Math.max(1, Math.min(6, Math.round(input.layers ?? 1)));
  const layerStepCm = Math.max(0.05, Math.min(2.0, input.layerStepCm ?? 0.25));
  const pillowCm = Math.max(0, Math.min(3.0, input.pillowCm ?? 0.2));
  const embossCm = Math.max(0, Math.min(1.0, input.embossCm ?? 0.08));
  const sharpCornerDeg = Math.max(15, Math.min(85, input.sharpCornerDeg ?? 42));
  const preset = input.preset ?? "enamel";
  const materialSpec = GLBFORGE_EXTRUDE_MATERIAL_PRESETS[preset];

  return {
    mode,
    threshold,
    depthMeters: Number((depthCm / 100).toFixed(4)),
    bevelMeters: Number((bevelCm / 100).toFixed(4)),
    bevelSteps,
    layers,
    layerStepMeters: Number((layerStepCm / 100).toFixed(4)),
    pillowMeters: Number((pillowCm / 100).toFixed(4)),
    embossMeters: Number((embossCm / 100).toFixed(4)),
    sharpCornerDeg,
    materialSpec,
    algorithmPipelineKo: [
      `1. 실루엣 추적 (${mode === "alpha" ? "알파 채널" : "루마 휘도"} 임계값 ${threshold}, 최대 1024px 격자, 4방향 바운더리 스티칭)`,
      `2. Chaikin 코너 커팅 스무딩 (꼭짓점 꺾임각 > ${sharpCornerDeg}° 날카로운 모서리 보존)`,
      "3. Earcut 홀(Hole) 브리지 폴리곤 삼각분할 + 쿼터 원호(Quarter-circle) 다단계 베벨 링 생성",
      `4. Felzenszwalb-Huttenlocher 2D 유클리드 거리 변환(EDT) 돔 팽창 (pillow=${pillowCm}cm) + 3×3 박스 블러 루마 미세 엠보싱(${embossCm}cm)`,
      layers > 1
        ? `5. K-Means ${layers}색 클러스터링 다층 적층 (계단 높이 ${layerStepCm}cm, 후면 공면 정렬)`
        : "5. 단일 솔리드 레이어 + 전면 평면 UV 프로젝션(PNG 텍스처 매핑)",
      `6. PBR 재질 프리셋('${materialSpec.labelKo}') + 방수(Watertight) 바이너리 STL/GLB 듀얼 출력`,
    ],
    stlWatertightReady: layers === 1 || layerStepCm > 0,
  };
}

export const HYPER3D_RODIN_MCP_TOOLS = [
  {
    name: "rodin_create_uploads",
    summaryKo: "1~5개 참조 이미지용 Presigned PUT 업로드 슬롯 발급 (13종 MIME 지원)",
  },
  {
    name: "rodin_import_images",
    summaryKo: "공개 이미지 URL을 Rodin 에셋 스토어로 직접 임포트",
  },
  {
    name: "rodin_generate",
    summaryKo: "Gen-2.5 3D 생성 (Raw/Quad, Medium/High/Extreme-Low, texture_delight, quality_override)",
  },
  {
    name: "rodin_generate_bang",
    summaryKo: "Deemos BANG 시맨틱 파츠 분해 생성 (strength 1..12, explode_strength, escore, reference_scale)",
  },
  {
    name: "rodin_get_status",
    summaryKo: "스테이지 진행률(stage.name, current, total) 단건 조회",
  },
  {
    name: "rodin_wait",
    summaryKo: "1~45초 서버 블로킹 폴링 대기",
  },
  {
    name: "rodin_get_result",
    summaryKo: "최종 GLB/USDZ/FBX/OBJ/STL 다운로드 URL 및 텍스처/사이드카 조회",
  },
] as const;

export interface RodinBangDecompositionInput {
  readonly assetId?: string;
  readonly instruction?: string;
  readonly strength?: number;
  readonly explodeStrength?: number;
  readonly escore?: number;
  readonly referenceScale?: number;
  readonly resolution?: "Basic" | "High";
  readonly seed?: number;
}

export function planRodinBangDecomposition(input: RodinBangDecompositionInput = {}) {
  const strength = Math.max(1, Math.min(12, Math.round(input.strength ?? 5)));
  const explodeStrength = Math.max(0, Number((input.explodeStrength ?? 1.0).toFixed(2)));
  const resolution = input.resolution ?? "High";
  const seed = Math.max(0, Math.min(65535, Math.round(input.seed ?? 42)));
  return {
    tool: "rodin_generate_bang" as const,
    endpoint: "https://api.hyper3d.com/api/mcp",
    payload: {
      asset_id: input.assetId ?? "asset_webtoon_prop_01",
      ...(input.instruction ? { instruction: input.instruction } : {}),
      strength,
      explode_strength: explodeStrength,
      ...(typeof input.escore === "number" ? { escore: input.escore } : {}),
      ...(typeof input.referenceScale === "number" ? { reference_scale: input.referenceScale } : {}),
      resolution,
      seed,
    },
    estimatedSubparts: Math.min(24, Math.max(2, strength * 2)),
    summaryKo: `Deemos BANG 파츠 분해 강도 ${strength}/12 (폭발 간격 ${explodeStrength}x, 해상도 ${resolution}) → 예상 서브파츠 ~${Math.min(24, Math.max(2, strength * 2))}개`,
  };
}

export const MESHY_CREATIVE_LAB_PRODUCTS = [
  { id: "figure", labelKo: "캐릭터 피규어 (스탠드 베이스 포함)", stages: ["prototype", "build"] },
  { id: "lamp", labelKo: "무드 램프 (내부 LED 광확산 쉘)", stages: ["prototype", "build"] },
  { id: "keychain", labelKo: "키체인 (상단 고리 링 지오메트리 일체형)", stages: ["prototype", "build"] },
  { id: "fridge-magnet", labelKo: "냉장고 자석 (후면 평탄화 + 자석 홈)", stages: ["prototype", "build"] },
  { id: "vinyl-figure", labelKo: "바이닐 아트토이 (SD 비율 스타일라이즈)", stages: ["prototype", "build"] },
  { id: "brick-figure", labelKo: "브릭 피규어 (블록 조립형 토폴로지)", stages: ["prototype", "build"] },
  { id: "keycap", labelKo: "기계식 키캡 (cherry-mx-1x1-r1 십자 스템 내장)", stages: ["prototype", "build"] },
] as const;

export const MESHY_MULTI_COLOR_SLICERS = [
  "auto",
  "bambu",
  "orcaslicer",
  "creality_print",
  "elegoo_slicer",
  "anycubic_slicer",
  "prusaslicer",
  "cura",
] as const;

export const VRM0_REQUIRED_BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
] as const;

export const VRM1_REQUIRED_BONES = [
  "hips",
  "spine",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
] as const;

export const VRM_CAMERA_FRAMING_PRESETS = {
  front: { id: "front", labelKo: "전신 정면 (Full Front)", yawDeg: 0, pitchDeg: 4, fovDeg: 28, focusRatioHeight: 0.52 },
  three_quarter: { id: "three_quarter", labelKo: "3/4 쿼터뷰 (Three-Quarter)", yawDeg: 32, pitchDeg: 8, fovDeg: 30, focusRatioHeight: 0.54 },
  side: { id: "side", labelKo: "측면 실루엣 (Profile Side)", yawDeg: 90, pitchDeg: 2, fovDeg: 26, focusRatioHeight: 0.52 },
  face: { id: "face", labelKo: "얼굴 클로즈업 (Face Portrait)", yawDeg: 8, pitchDeg: 3, fovDeg: 20, focusRatioHeight: 0.86 },
} as const;

export const BLEND_AI_SCALE_REFERENCE_METERS = {
  adult_human: { id: "adult_human", labelKo: "성인 캐릭터 표준 신장", meters: 1.75 },
  eye_level: { id: "eye_level", labelKo: "성인 눈높이 카메라 기준선", meters: 1.6 },
  door_frame: { id: "door_frame", labelKo: "실내 방문 높이 (폭 0.9m)", meters: 2.1 },
  desk_table: { id: "desk_table", labelKo: "책상 / 식탁 상판 높이", meters: 0.75 },
  chair_seat: { id: "chair_seat", labelKo: "의자 좌판 높이 (전체 0.9m)", meters: 0.45 },
  room_ceiling: { id: "room_ceiling", labelKo: "표준 아파트/교실 천장고", meters: 2.4 },
} as const;

export const BLEND_AI_THREE_POINT_LIGHTING_RATIO = {
  key: 3.0,
  fill: 1.0,
  rim: 1.5,
  descriptionKo: "Blender MCP 표준 3점 조명 비율 (Key : Fill : Rim = 3 : 1 : 1.5)",
} as const;

export interface VrmValidationInput {
  readonly specVersion: "0.x" | "1.0";
  readonly presentBones: readonly string[];
  readonly duplicateBones?: readonly string[];
  readonly hasTitle?: boolean;
  readonly hasAuthor?: boolean;
  readonly hasLicense?: boolean;
  readonly hasThumbnail?: boolean;
  readonly triangleCount: number;
  readonly fileSizeBytes: number;
  readonly maxTextureSize: number;
  readonly materialCount: number;
}

export interface VrmValidationIssue {
  readonly code: string;
  readonly severity: "error" | "warn";
  readonly messageKo: string;
}

export function validateVrmAssetSummary(input: VrmValidationInput) {
  const required = input.specVersion === "1.0" ? VRM1_REQUIRED_BONES : VRM0_REQUIRED_BONES;
  const presentSet = new Set(input.presentBones);
  const missingBones = required.filter((b) => !presentSet.has(b));
  const issues: VrmValidationIssue[] = [];

  if (missingBones.length > 0) {
    issues.push({
      code: "HUMANOID_REQUIRED_BONE_MISSING",
      severity: "error",
      messageKo: `필수 휴머노이드 본 누락 (${missingBones.length}개): ${missingBones.join(", ")}`,
    });
  }
  if ((input.duplicateBones?.length ?? 0) > 0) {
    issues.push({
      code: "HUMANOID_DUPLICATE_BONE",
      severity: "error",
      messageKo: `중복 매핑된 휴머노이드 본 감지: ${input.duplicateBones?.join(", ")}`,
    });
  }
  if (input.hasTitle === false) {
    issues.push({ code: "META_NAME_MISSING", severity: "error", messageKo: "VRM 메타데이터 모델 이름(name/title)이 비어 있습니다." });
  }
  if (input.hasAuthor === false) {
    issues.push({ code: "META_AUTHOR_MISSING", severity: "error", messageKo: "VRM 메타데이터 제작자(author) 정보가 비어 있습니다." });
  }
  if (input.hasLicense === false) {
    issues.push({ code: "META_LICENSE_MISSING", severity: "error", messageKo: "VRM 라이선스(licenseUrl/version) 정보가 비어 있습니다." });
  }
  if (input.hasThumbnail === false) {
    issues.push({ code: "META_THUMBNAIL_MISSING", severity: "warn", messageKo: "VRM 내장 썸네일 이미지가 없습니다." });
  }
  if (input.triangleCount > 70_000) {
    issues.push({
      code: "TRIANGLE_BUDGET_EXCEEDED",
      severity: "warn",
      messageKo: `삼각형 수(${input.triangleCount.toLocaleString()})가 VRM 권장 상한(70,000)을 초과합니다.`,
    });
  }
  if (input.fileSizeBytes > 50 * 1024 * 1024) {
    issues.push({
      code: "FILE_SIZE_LIMIT_EXCEEDED",
      severity: "warn",
      messageKo: "파일 크기가 VRM 권장 상한(50 MB)을 초과합니다.",
    });
  }
  if (input.maxTextureSize > 4096) {
    issues.push({
      code: "TEXTURE_SIZE_LIMIT_EXCEEDED",
      severity: "warn",
      messageKo: `최대 텍스처 크기(${input.maxTextureSize}px)가 4096px을 초과합니다.`,
    });
  }
  if (input.materialCount > 16) {
    issues.push({
      code: "MATERIAL_BUDGET_EXCEEDED",
      severity: "warn",
      messageKo: `머티리얼 수(${input.materialCount})가 VRM 권장 상한(16개)을 초과합니다.`,
    });
  }

  return {
    specVersion: input.specVersion,
    valid: !issues.some((i) => i.severity === "error"),
    requiredBoneCount: required.length,
    mappedRequiredBoneCount: required.length - missingBones.length,
    missingBones,
    issues,
  };
}
