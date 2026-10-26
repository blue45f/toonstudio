/**
 * Tripo 3D V3 (https://studio.tripo3d.ai / https://openapi.tripo3d.ai / https://platform.tripo3d.ai)
 * 및 글로벌 3D 생성 AI 경쟁사(Hyper3D Rodin, Meshy AI, VARCO 3D, Sloyd AI, CSM Cube) REA 역공학 카탈로그.
 *
 * 근거 아티팩트 (REA Evidence):
 * - tripo-cli@0.7.3: ev_df8868fdd94e82d702e70c0edfdce8d7b3c132ce99032cd119abf4fd87f809e9
 * - platform.tripo3d.ai root: ev_d4aca6fc9709e118c8b41675d03af4f9337b1e3d6a56022172369ef182ebc3c7
 * - platform.tripo3d.ai views: ev_507efe1a786787b5ce5abeb9460f69d547b5602a40fea72c7098ce17da186178
 * - hyper3d.ai (Rodin Gen-2.5): ev_3f0f37982a54ee2e3df8746fe1f9cb7415d21cdd0a5e512408ca2e60520b6f33
 * - tripo_3d Blender Addon v0.7.7 + tripo-mcp v0.1.2 + tripo3d Python SDK v0.3.6
 */

export const TRIPO3D_API_KEY_NAMES = [
  "TRIPO_API_KEY",
  "TRIPO3D_API_KEY",
  "TRIPO_SECRET_KEY",
] as const;

export const TRIPO3D_REGIONS = {
  ov: {
    id: "ov",
    label: "Global Overseas (OV)",
    apiBase: "https://openapi.tripo3d.ai",
    legacyV2Base: "https://api.tripo3d.ai/v2/openapi",
    platformApiBase: "https://api.tripo3d.ai/v2/platform",
    studioUrl: "https://studio.tripo3d.ai",
    platformUrl: "https://platform.tripo3d.ai",
    authUrl: "https://auth.tripo3d.ai",
  },
  cn: {
    id: "cn",
    label: "China Mainland (CN / rg2)",
    apiBase: "https://openapi.tripo3d.com",
    legacyV2Base: "https://api.tripo3d.com/v2/openapi",
    platformApiBase: "https://api.tripo3d.com/v2/platform",
    studioUrl: "https://studio.tripo3d.com",
    platformUrl: "https://platform.tripo3d.com",
    authUrl: "https://auth.tripo3d.com",
    regionHeader: { "X-Tripo-Region": "rg2" },
  },
} as const;

export type Tripo3dRegionId = keyof typeof TRIPO3D_REGIONS;

export const TRIPO3D_WIRE_MODELS = {
  H31: "H3.1-20260901",
  V31: "v3.1-20260211",
  P1: "P1-20260311",
  P2: "P2-20260801",
  V30: "v3.0-20250812",
  V25: "v2.5-20250123",
  V20: "v2.0-20240919",
  TURBO_V10: "Turbo-v1.0-20250506",
  TEXTURE_V35: "v3.5-20260815",
} as const;

export type Tripo3dWireModel =
  (typeof TRIPO3D_WIRE_MODELS)[keyof typeof TRIPO3D_WIRE_MODELS];

export const TRIPO3D_MODEL_ALIASES: Readonly<Record<string, Tripo3dWireModel>> = {
  "tripo-h3.1": TRIPO3D_WIRE_MODELS.H31,
  "h3.1": TRIPO3D_WIRE_MODELS.H31,
  "h3.1-20260901": TRIPO3D_WIRE_MODELS.H31,
  "H3.1-20260901": TRIPO3D_WIRE_MODELS.H31,
  "tripo-v3.1": TRIPO3D_WIRE_MODELS.V31,
  "v3.1": TRIPO3D_WIRE_MODELS.V31,
  "v3.1-20260211": TRIPO3D_WIRE_MODELS.V31,
  "tripo-p1": TRIPO3D_WIRE_MODELS.P1,
  p1: TRIPO3D_WIRE_MODELS.P1,
  "p1-20260311": TRIPO3D_WIRE_MODELS.P1,
  "P1-20260311": TRIPO3D_WIRE_MODELS.P1,
  "tripo-p2": TRIPO3D_WIRE_MODELS.P2,
  p2: TRIPO3D_WIRE_MODELS.P2,
  "p2-20260801": TRIPO3D_WIRE_MODELS.P2,
  "P2-20260801": TRIPO3D_WIRE_MODELS.P2,
  "tripo-v3.0": TRIPO3D_WIRE_MODELS.V30,
  "v3.0": TRIPO3D_WIRE_MODELS.V30,
  "v3.0-20250812": TRIPO3D_WIRE_MODELS.V30,
  "tripo-v2.5": TRIPO3D_WIRE_MODELS.V25,
  "v2.5": TRIPO3D_WIRE_MODELS.V25,
  "v2.5-20250123": TRIPO3D_WIRE_MODELS.V25,
  "v2.0": TRIPO3D_WIRE_MODELS.V20,
  "v2.0-20240919": TRIPO3D_WIRE_MODELS.V20,
  turbo: TRIPO3D_WIRE_MODELS.TURBO_V10,
  "Turbo-v1.0-20250506": TRIPO3D_WIRE_MODELS.TURBO_V10,
};

export const TRIPO3D_LOW_POLY_PATTERNS: readonly RegExp[] = [
  /low[\s_-]?poly/iu,
  /voxel/iu,
  /低模/u,
  /低面/u,
  /低多边形/u,
  /手游/u,
  /像素风/u,
  /로우[\s_-]?폴리/u,
  /저폴리/u,
  /복셀/u,
  /모바일[\s_-]?게임/u,
];

export const TRIPO3D_GENERATION_ENDPOINTS = {
  text_to_model: "/v3/generation/text-to-model",
  image_to_model: "/v3/generation/image-to-model",
  multiview_to_model: "/v3/generation/multiview-to-model",
  text_to_image: "/v3/generation/text-to-image",
  generate_image: "/v3/generation/image-to-image",
  generate_multiview_image: "/v3/generation/image-to-multiview",
  edit_multiview_image: "/v3/generation/edit-multiview",
  image_to_splat: "/v3/generation/image-to-splat",
} as const;

export const TRIPO3D_IMAGE_MODELS = [
  "seedream_v4",
  "seedream_v5",
  "banana",
  "banana_pro",
  "banana2",
  "chat_image_1",
  "chat_image_1.5",
  "chat_image_2.5_flash",
  "chat_image_2.5_pro",
  "chat_image_2.5_sunburst",
] as const;

export const TRIPO3D_IMAGE_TEMPLATES = {
  text_to_image: [
    "asset_extraction",
    "character_completion",
    "t_pose",
    "variants",
    "figure",
  ] as const,
  generate_image: [
    "t_pose",
    "character_completion",
    "3d_enhance",
    "variants",
    "figure",
  ] as const,
} as const;

export const TRIPO3D_MODEL_STYLES = [
  "person:person2cartoon",
  "animal:venom",
  "object:clay",
  "object:steampunk",
  "object:christmas",
  "object:barbie",
  "gold",
  "ancient_bronze",
] as const;

export const TRIPO3D_POST_STYLES = [
  "lego",
  "voxel",
  "voronoi",
  "minecraft",
] as const;

export const TRIPO3D_RIG_TYPES = [
  "biped",
  "quadruped",
  "hexapod",
  "octopod",
  "avian",
  "serpentine",
  "aquatic",
  "others",
] as const;

export type Tripo3dRigType = (typeof TRIPO3D_RIG_TYPES)[number];

export const TRIPO3D_RIG_SPECS = [
  "tripo",
  "mixamo",
  "actorcore",
  "unity",
  "unreal",
  "vrm",
] as const;

export type Tripo3dRigSpec = (typeof TRIPO3D_RIG_SPECS)[number];

export const TRIPO3D_RIG_VERSIONS = {
  "v1.0": "v1.0-20240301",
  "v2.5": "v2.5-20260210",
  "v3.0": "v3.0-20260909",
} as const;

export const TRIPO3D_BIPED_ANIMATION_PRESETS = [
  "preset:idle",
  "preset:walk",
  "preset:run",
  "preset:dive",
  "preset:climb",
  "preset:jump",
  "preset:slash",
  "preset:shoot",
  "preset:hurt",
  "preset:fall",
  "preset:turn",
  "preset:relax",
  "preset:dane",
  "preset:magic",
  "preset:boxing",
  "preset:cheer",
  "preset:afraid",
  "preset:cry",
  "preset:Bow",
  "preset:clap",
  "preset:cast",
] as const;

export const TRIPO3D_NON_BIPED_ANIMATION_MAP: Readonly<
  Record<Exclude<Tripo3dRigType, "biped" | "avian" | "others">, string>
> = {
  quadruped: "preset:quadruped:walk",
  hexapod: "preset:hexapod:walk",
  octopod: "preset:octopod:walk",
  serpentine: "preset:serpentine:march",
  aquatic: "preset:aquatic:march",
} as const;

export interface Tripo3dChainStepDefinition {
  readonly step: string;
  readonly taskType: string;
  readonly endpoint: string;
  readonly descriptionKo: string;
  readonly acceptedUpstreamTypes: readonly string[] | "ANY_MODEL";
  readonly producesRigged?: boolean;
  readonly passthrough?: boolean;
}

export const TRIPO3D_CHAIN_STEPS: Readonly<Record<string, Tripo3dChainStepDefinition>> = {
  texture: {
    step: "texture",
    taskType: "texture_model",
    endpoint: "/v3/models/texture",
    descriptionKo: "AI 텍스처/PBR 생성 및 v3.5 Delight(조명 그림자 제거) 리텍스처링",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  convert: {
    step: "convert",
    taskType: "convert_model",
    endpoint: "/v3/models/convert",
    descriptionKo: "포맷 변환(GLTF/USDZ/FBX/OBJ/STL/3MF), 피벗 정렬, 바닥 평탄화, FBX 프리셋",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  import: {
    step: "import",
    taskType: "import_model",
    endpoint: "/v3/models/import",
    descriptionKo: "외부 3D 메시 파일(.glb/.fbx/.obj) Tripo 태스크 체인으로 임포트",
    acceptedUpstreamTypes: [],
  },
  "rig-check": {
    step: "rig-check",
    taskType: "animate_prerigcheck",
    endpoint: "/v3/animations/rig-check",
    descriptionKo: "리깅 가능 여부(riggable) 및 골격 타입(rig_type) 사전 검사 게이트 (크레딧 보호)",
    acceptedUpstreamTypes: "ANY_MODEL",
    passthrough: true,
  },
  rig: {
    step: "rig",
    taskType: "animate_rig",
    endpoint: "/v3/animations/rig",
    descriptionKo: "자동 리깅 v3.0 (8종 체형 · VRM/Mixamo/Unity/Unreal/ActorCore/Tripo 스펙)",
    acceptedUpstreamTypes: "ANY_MODEL",
    producesRigged: true,
  },
  retarget: {
    step: "retarget",
    taskType: "animate_retarget",
    endpoint: "/v3/animations/retarget",
    descriptionKo: "리깅 완료 모델에 모션 프리셋 리타게팅 (태스크당 최대 5개 클립)",
    acceptedUpstreamTypes: ["animate_rig"],
  },
  segment: {
    step: "segment",
    taskType: "mesh_segmentation",
    endpoint: "/v3/mesh/segment",
    descriptionKo: "시맨틱 파츠 분할 (v1.0 / v2.0 서브메시 분리)",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  complete: {
    step: "complete",
    taskType: "mesh_completion",
    endpoint: "/v3/mesh/complete",
    descriptionKo: "분할된 파츠의 가려진 내부 지오메트리 보완 (segment 직후 필수)",
    acceptedUpstreamTypes: ["mesh_segmentation"],
  },
  decimate: {
    step: "decimate",
    taskType: "highpoly_to_lowpoly",
    endpoint: "/v3/mesh/decimate",
    descriptionKo: "스마트 리토폴로지/데시메이션 (v3.0 Smart UV 연동, 쿼드/트라이 토폴로지)",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  uv: {
    step: "uv",
    taskType: "mesh_uv",
    endpoint: "/v3/mesh/uv",
    descriptionKo: "전용 UV 언랩 및 아틀라스 패킹",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  edit: {
    step: "edit",
    taskType: "mesh_edit",
    endpoint: "/v3/mesh/edit",
    descriptionKo: "P2 모델 기반 로컬 바운딩 박스(BBox) 영역 부분 재생성",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
  smartsegment: {
    step: "smartsegment",
    taskType: "smart_mesh_segmentation",
    endpoint: "/v3/mesh/smartsegment",
    descriptionKo: "4x4 변환 행렬 기반 스마트 파츠 분할 (model / image 기준)",
    acceptedUpstreamTypes: "ANY_MODEL",
  },
};

export interface Tripo3dScenarioPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly category: "game" | "film" | "print" | "ar" | "animation" | "toy" | "webtoon";
  readonly descriptionKo: string;
  readonly generationDefaults: Readonly<Record<string, unknown>>;
  readonly defaultChain: readonly string[];
}

export const TRIPO3D_SCENARIO_PRESETS: Readonly<Record<string, Tripo3dScenarioPreset>> = {
  "game-mobile": {
    id: "game-mobile",
    labelKo: "모바일 게임 로우폴리 (P1)",
    category: "game",
    descriptionKo: "P1 네이티브 로우폴리(15k 트라이앵글) + 2K 텍스처 FBX 게임 엔진 익스포트",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.P1,
      face_limit: 15000,
      texture: true,
      pbr: true,
      texture_quality: "standard",
    },
    defaultChain: ["convert:format=FBX,texture_size=2048,fbx_preset=unity"],
  },
  "game-pc": {
    id: "game-pc",
    labelKo: "PC/콘솔 고품질 에셋 (v3.1)",
    category: "game",
    descriptionKo: "v3.1 정밀 지오메트리 + 4K Detailed PBR + FBX(Unreal/Blender 프리셋)",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      texture: true,
      pbr: true,
      geometry_quality: "detailed",
      texture_quality: "detailed",
    },
    defaultChain: ["convert:format=FBX,texture_size=4096,fbx_preset=blender"],
  },
  film: {
    id: "film",
    labelKo: "영상/VFX 쿼드 하이폴리 (v3.1)",
    category: "film",
    descriptionKo: "서브디비전 호환 Quad 메시 + Detailed 지오메트리/4K PBR",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      quad: true,
      geometry_quality: "detailed",
      texture_quality: "detailed",
      pbr: true,
    },
    defaultChain: [],
  },
  print: {
    id: "print",
    labelKo: "3D 프린팅 (STL + 바닥 평탄화)",
    category: "print",
    descriptionKo: "텍스처 미생성 순수 지오메트리 + 바닥 평탄화(flatten_bottom) + STL 변환",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      texture: false,
      pbr: false,
      geometry_quality: "detailed",
      auto_size: true,
    },
    defaultChain: ["convert:format=STL,flatten_bottom=true,pivot_to_center_bottom=true"],
  },
  "ar-web": {
    id: "ar-web",
    labelKo: "웹뷰어 / iOS AR Quick Look (USDZ)",
    category: "ar",
    descriptionKo: "v3.1 생성 후 20k 데시메이션(Smart UV) 및 USDZ/GLTF 경량 변환",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      texture: true,
      pbr: true,
    },
    defaultChain: [
      "decimate:face_limit=20000,model_version=v3.0,smart_uv=true",
      "convert:format=USDZ,texture_size=2048",
    ],
  },
  anim: {
    id: "anim",
    labelKo: "캐릭터 자동 리깅 & 모션 (v3.0 Rig)",
    category: "animation",
    descriptionKo: "v3.1 캐릭터 생성 → rig-check → rig(v3.0) → retarget(idle,walk)",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      texture: true,
      pbr: true,
      texture_quality: "detailed",
    },
    defaultChain: [
      "rig-check",
      "rig:model_version=v3.0,spec=vrm",
      "retarget:animations=preset:idle|preset:walk",
    ],
  },
  toy: {
    id: "toy",
    labelKo: "아트토이 / 피규어 (P1 20k)",
    category: "toy",
    descriptionKo: "P1 20k 깔끔한 토폴로지 + 피규어 바닥 중심 피벗 정렬",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.P1,
      face_limit: 20000,
      texture: true,
      pbr: true,
    },
    defaultChain: ["convert:format=GLTF,pivot_to_center_bottom=true"],
  },
  "webtoon-background": {
    id: "webtoon-background",
    labelKo: "웹툰 3D 배경 클러스터 (모듈러 파츠 + Delight)",
    category: "webtoon",
    descriptionKo:
      "웹툰 툰셰이딩/선화 추출에 최적화된 모듈러 파츠 분리(segment → complete) 및 그림자 제거(delight=true)",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      generate_parts: true,
      geometry_quality: "detailed",
      texture_quality: "detailed",
      pbr: true,
      auto_size: true,
    },
    defaultChain: [
      "segment:model_version=v2.0-20260430",
      "complete",
      "texture:model_version=v3.5-20260815,texture_quality=detailed,delight=true",
      "convert:format=GLTF,pivot_to_center_bottom=true",
    ],
  },
  "webtoon-character": {
    id: "webtoon-character",
    labelKo: "웹툰 3D 캐릭터 마네킹 (T-Pose + VRM 리깅)",
    category: "webtoon",
    descriptionKo:
      "T-Pose 비율 제어 + v3.5 Delight 무광 알베도 + VRM/Mixamo 호환 리깅 및 포즈 리타게팅",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.V31,
      geometry_quality: "detailed",
      texture_quality: "detailed",
      pbr: true,
    },
    defaultChain: [
      "texture:model_version=v3.5-20260815,texture_quality=detailed,delight=true",
      "rig-check",
      "rig:model_version=v3.0,spec=vrm,rig_type=biped",
      "retarget:animations=preset:idle|preset:walk|preset:slash",
    ],
  },
  "webtoon-prop": {
    id: "webtoon-prop",
    labelKo: "웹툰 3D 소품/무기 (쿼드 + Smart UV)",
    category: "webtoon",
    descriptionKo: "P2 쿼드 토폴로지(25k) + Smart UV 언랩 + 캐릭터 손 소켓 어태치먼트용 피벗 정렬",
    generationDefaults: {
      model_version: TRIPO3D_WIRE_MODELS.P2,
      quad: true,
      face_limit: 25000,
      texture: true,
      pbr: true,
    },
    defaultChain: [
      "uv",
      "convert:format=GLTF,pivot_to_center_bottom=true,force_symmetry=true",
    ],
  },
};

export interface Tripo3dErrorCatalogEntry {
  readonly code: number;
  readonly exitCode: number;
  readonly category:
    | "FATAL"
    | "USAGE"
    | "AUTH"
    | "BALANCE"
    | "CONTENT_POLICY"
    | "TASK_FAILED"
    | "RATE_LIMIT"
    | "NOT_FOUND";
  readonly messageEn: string;
  readonly remediationKo: string;
}

export const TRIPO3D_ERROR_CATALOG: Readonly<Record<number, Tripo3dErrorCatalogEntry>> = {
  1000: {
    code: 1000,
    exitCode: 1,
    category: "FATAL",
    messageEn: "Server error",
    remediationKo: "Tripo 서버 일시 오류입니다. 지수 백오프 후 재시도하세요.",
  },
  1004: {
    code: 1004,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Parameter error",
    remediationKo: "파라미터 연동 규칙(P1/P2/v3.1 제약 및 face_limit 범위)을 확인하세요.",
  },
  2000: {
    code: 2000,
    exitCode: 9,
    category: "RATE_LIMIT",
    messageEn: "Rate limit exceeded",
    remediationKo: "동시 요청 한도를 초과했습니다. 잠시 대기 후 재시도하세요.",
  },
  2001: {
    code: 2001,
    exitCode: 8,
    category: "NOT_FOUND",
    messageEn: "Task not found",
    remediationKo: "task_id가 정확한지 및 동일한 리전(OV/CN)인지 확인하세요.",
  },
  2002: {
    code: 2002,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Unsupported task type",
    remediationKo: "요청한 엔드포인트 또는 체인 단계(step)가 현재 모델 버전과 호환되는지 확인하세요.",
  },
  2003: {
    code: 2003,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Input file is empty or corrupted",
    remediationKo: "업로드할 이미지(PNG/JPEG/WebP) 또는 3D 파일이 손상되지 않았는지 확인하세요.",
  },
  2004: {
    code: 2004,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Unsupported file type",
    remediationKo: "지원 확장자(PNG, JPG, JPEG, WEBP, GLB, FBX, OBJ)만 업로드할 수 있습니다.",
  },
  2006: {
    code: 2006,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Invalid original task status or type",
    remediationKo: "후처리 체인의 선행 태스크가 success 상태이며 허용된 taskType인지 확인하세요.",
  },
  2007: {
    code: 2007,
    exitCode: 6,
    category: "TASK_FAILED",
    messageEn: "Original task failed",
    remediationKo: "선행 생성 태스크가 실패하여 체인을 이어갈 수 없습니다.",
  },
  2008: {
    code: 2008,
    exitCode: 5,
    category: "CONTENT_POLICY",
    messageEn: "Content policy violation (input banned)",
    remediationKo: "프롬프트 또는 입력 이미지가 콘텐츠 안전 정책에 의해 차단되었습니다.",
  },
  2010: {
    code: 2010,
    exitCode: 4,
    category: "BALANCE",
    messageEn: "Insufficient credit balance",
    remediationKo: "Tripo API 크레딧 잔액이 부족합니다 (https://platform.tripo3d.ai/billing, 100크레딧=$1).",
  },
  2014: {
    code: 2014,
    exitCode: 5,
    category: "CONTENT_POLICY",
    messageEn: "Audit service blocked output",
    remediationKo: "출력 검수 정책에 의해 결과물이 보류되었습니다.",
  },
  2015: {
    code: 2015,
    exitCode: 2,
    category: "USAGE",
    messageEn: "Deprecated model version",
    remediationKo: " 구버전 모델입니다. v3.1-20260211, P1-20260311, P2-20260801을 사용하세요.",
  },
  2018: {
    code: 2018,
    exitCode: 6,
    category: "TASK_FAILED",
    messageEn: "Model is not riggable",
    remediationKo: "해당 메시는 자동 리깅이 불가능한 형상입니다. rig-check 게이트를 먼저 실행하세요.",
  },
  4001: {
    code: 4001,
    exitCode: 3,
    category: "AUTH",
    messageEn: "Unauthorized / Invalid API Key",
    remediationKo: "tsk_ 접두사 API 키가 유효한지 또는 중지(suspended) 상태가 아닌지 확인하세요.",
  },
};

export interface Competitor3dPlatformSpec {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  readonly reaEvidenceId: string;
  readonly coreModels: readonly string[];
  readonly spatialControlModes: readonly string[];
  readonly signatureCapabilities: readonly string[];
  readonly internalizedInToonStudio: readonly string[];
}

export const COMPETITOR_3D_PLATFORM_MATRIX: readonly Competitor3dPlatformSpec[] = [
  {
    id: "tripo-3d-v3",
    name: "Tripo Studio 3D (H3.1 & Smart Mesh P2.0) & OpenAPI V3",
    vendor: "VAST (Tripo)",
    reaEvidenceId: "ev_753d835fcf08b13ec795f411d76e6ab028927b23790b1ae46b320dabb9b5b7d8",
    coreModels: ["H3.1-20260901 (~1.75M Tri HD)", "v3.1-20260211", "P1-20260311", "P2-20260801 (Smart Mesh P2.0)", "v3.5-20260815 (Texture)"],
    spatialControlModes: [
      "T-Pose / A-Pose 5-Ratio Pose Control",
      "4-View Multiview (Front/Left/Back/Right)",
      "P2 Local BBox Region Mesh Redo & Magic Brush Local Texture Inpaint",
      "4x4 Transform SmartSegment & Smart UV (80k Tri / 40k Quad)",
    ],
    signatureCapabilities: [
      "12 Studio Workspaces (generate-image, generate H3.1/P2.0, segmentation, fill-parts, retopology, smart-uv, texture, texture-edit Magic Brush, texture-upscale 8K, texture-pbr, rigging, animate Text-to-Motion)",
      "12-Step Composable Post-Processing Chain (segment → complete → decimate → uv → texture → rig-check → rig → retarget → convert)",
      "Texture v3.5 Delight (Baked Shadow Removal) & Extreme 4K/8K PBR",
      "Auto-Rig v3.0 across 8 Creature Families & 6 Specs + Text-to-Motion ('텍스트를 동작으로')",
    ],
    internalizedInToonStudio: [
      "Tripo V3/H3.1 Provider (apps/api/src/modules/studio-ai/studio-tripo3d-provider.ts)",
      "Tripo 3D CLI & MCP Bridge (scripts/tripo3d-cli.mts)",
      "Tripo V3 + Competitor 3D Engine & Workbench UI (apps/web/src/domains/creator/scene-3d/)",
    ],
  },
  {
    id: "hyper3d-rodin-gen25",
    name: "Hyper3D Rodin Gen-2.5, Official 7-Tool MCP & Deemos BANG",
    vendor: "Deemos",
    reaEvidenceId: "ev_fd211a7f75b88ab05328751ea650b0b1f1272625bcaaa24dfc7880b201587872",
    coreModels: ["Gen-2.5-High", "Gen-2.5-Medium", "Gen-2.5-Extreme-Low", "Deemos BANG"],
    spatialControlModes: [
      "Bounding Box ControlNet ([width, height, depth])",
      "Voxel ControlNet (16³~64³ Occupancy Grid)",
      "PointCloud ControlNet (4096-pt Surface Sampler)",
      "BANG Strength (1..12) & Explode Strength (>=0)",
    ],
    signatureCapabilities: [
      "Official 7-Tool MCP (rodin_create_uploads, rodin_import_images, rodin_generate, rodin_generate_bang, rodin_get_status, rodin_wait, rodin_get_result)",
      "5-Tier Thinking Effort Scheduler (Extreme-Low 4s / Low 9s / Medium 20s / High 40s / Extreme-High 80s)",
      "Deemos BANG Part-Aware Decomposition (strength 1..12, explode_strength, escore, reference_scale)",
    ],
    internalizedInToonStudio: [
      "Rodin ControlNet (BBox / Voxel / PointCloud) & 5-Tier Thinking Effort Planner",
      "Deemos BANG Part-Splitter & Webtoon Background Cluster Builder",
    ],
  },
  {
    id: "meshy-ai-v7",
    name: "Meshy AI Studio v7, Smart Topology (meshy-t2) & Creative Lab",
    vendor: "Meshy",
    reaEvidenceId: "ev_b3ae03ba1166a7d6cd69fe23d66ce93d3521d753ff5257ab5920d1e9e7c6ed5a",
    coreModels: ["meshy-7", "meshy-6", "meshy-t2 (Smart Topology)", "meshy-t1"],
    spatialControlModes: ["Multi-View Reference", "Smart Topology (meshy-t1/t2)", "UV Unwrap (≤40k faces)", "Rigging (≤300k faces)"],
    signatureCapabilities: [
      "AI Texture Delighting & 2K/4K/8K PBR Map Synthesis (ultra_mode +5cr, 8K +15cr)",
      "7 Creative Lab 2-Stage Products (figure, lamp, keychain, fridge-magnet, vinyl-figure, brick-figure, keycap cherry-mx-1x1-r1)",
      "Multi-Color 3D Print across 8 Slicers (bambu, orcaslicer, creality_print, elegoo_slicer, anycubic_slicer, prusaslicer, cura)",
    ],
    internalizedInToonStudio: [
      "Webtoon Toon-Friendly Albedo Delighting & 4-Stage LOD Ladder Calculator",
      "Creative Lab 7-Product & 8-Slicer Multi-Color Merch Planner",
    ],
  },
  {
    id: "varco-3d-studio",
    name: "NC AI VARCO 3D Studio & OpenAPI",
    vendor: "NC AI",
    reaEvidenceId: "shipped-artifact:varco3d-v2-workbench",
    coreModels: ["VARCO 3D v2 Studio", "NC OpenAPI Image-to-3D"],
    spatialControlModes: ["Alpha Silhouette Preflight", "Geodesic ExpMap Decal", "Two-Bone Analytical IK"],
    signatureCapabilities: [
      "CustomWorkflow V2 DAG (Generate3D → Remesh → Rig → Animate)",
      "5-DCC Local Port Bridge (Blender 19731 / Unreal 19732 / Unity 19733 / 3dsMax 19734 / Maya 19735)",
      "Humanoid / Quadruped / Equine Motion Classifier",
    ],
    internalizedInToonStudio: [
      "StudioVarco3dInspectorWorkbench & scripts/varco3d-cli.mts",
      "Unified Tripo + VARCO + Blender MCP Multi-Bridge Orchestrator",
    ],
  },
  {
    id: "sloyd-csm-parametric",
    name: "Sloyd AI & CSM Cube Parametric Studio",
    vendor: "Sloyd / Common Sense Machines",
    reaEvidenceId: "shipped-competitor-synthesis:sloyd-csm-cube",
    coreModels: ["Sloyd Parametric Generator", "CSM Cube Part-Mesh"],
    spatialControlModes: [
      "Architectural & Prop Parametric Sliders (Roof/Wall/Window/Floor/Detail)",
      "Semantic Submesh Part Hierarchy",
    ],
    signatureCapabilities: [
      "Real-time Zero-Latency Parametric Webtoon Background Blockout",
      "Part-Level Material & Snapping Socket Assignment",
    ],
    internalizedInToonStudio: [
      "Parametric 3D Background Cluster & Architectural Slider Engine",
      "Character-to-Prop Attachment Socket & Pose Alignment Solver",
    ],
  },
  {
    id: "glbforge-vrm-blendai",
    name: "GLBForge 0.4, VRM Toolkit 0.1 & Blend-AI 175-Tool MCP",
    vendor: "GLBForge / VRM Consortium / Blender MCP",
    reaEvidenceId: "ev_238693ba315199ddc55df0bf5b06f4d2e20a5d2ceaee7936d8748eb159c0570a",
    coreModels: ["GLBForge 17-Rule Linter", "2D-to-3D EDT Extruder", "VRM 0.x/1.0 + VRMA Inspector"],
    spatialControlModes: [
      "EDT Pillow Dome + Chaikin 42° Relief Extrusion (enamel/chrome/rubber/neon/acrylic)",
      "VRM 4-View Camera Framing (front / three_quarter / side / face)",
      "Blend-AI Real-World Meter Scale (1.75m adult / 2.1m door / 0.75m desk) & 3:1:1.5 Lighting",
    ],
    signatureCapabilities: [
      "3 Performance Budgets (mobile-hero / desktop-hero / product-configurator) & 8-Stage Meshopt Optimization",
      "2D PNG/SVG to Watertight 3D Relief Signage & Prop Extrusion (K-Means 2..6 Stepped Layers)",
      "VRM 0.x (17 Bones) / VRM 1.0 (15 Bones) + VRMA Animation Timing & 13-Rule Package Validator",
    ],
    internalizedInToonStudio: [
      "GLBForge 17-Rule Linter & 2D-to-3D Webtoon Signage/Merch Extruder (scripts/lib/tripo3d-ecosystem-catalog.mts)",
      "VRM/VRMA Validator & Camera Framing Presets in Character Lab & 3D Mannequin Poser",
    ],
  },
] as const;
