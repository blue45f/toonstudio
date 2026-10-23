/**
 * VARCO 3D (https://3d.varco.ai & https://openapi.ai.nc.com) 카탈로그, MCP Flow 도구 명세,
 * 애니메이션 프리셋, DCC 브리지 플러그인 메타데이터 정의.
 */

export const VARCO3D_DEFAULT_NC_OPENAPI_BASE = "https://openapi.ai.nc.com";
export const VARCO3D_DEFAULT_STUDIO_API_BASE = "https://3d.varco.ai/api/external-api";
export const VARCO3D_DEFAULT_API_BASE = VARCO3D_DEFAULT_STUDIO_API_BASE;
export const VARCO3D_DEFAULT_MCP_URL = "https://3d.varco.ai/api/mcp";
export const VARCO3D_MCP_SETUP_DOC_URL = "https://3d.varco.ai/mcp/setup.md";
export const VARCO3D_CLAUDE_APP_BLOG_URL =
  "https://3d.varco.ai/blog/ko/2026-07-14-connect-varco-3d-mcp-to-claude-app";
export const VARCO3D_ONE_PROMPT_BLOG_URL =
  "https://3d.varco.ai/blog/ko/2026-07-14-connect-varco-3d-to-codex-or-claude-with-one-prompt";

export const VARCO3D_API_KEY_NAMES = [
  "VARCO_3D_API_KEY",
  "VARCO3D_API_KEY",
  "NC_OPENAPI_KEY",
  "OPENAPI_KEY",
] as const;

export const VARCO3D_DCC_BRIDGES = {
  blender: 5324,
  unreal: 5325,
  unity: 5326,
  "3dsmax": 5327,
  maya: 5328,
} as const;

export type DccBridgeName = keyof typeof VARCO3D_DCC_BRIDGES;
export type Varco3dApiProvider = "nc-openapi" | "studio";

export interface DccBridgePluginInfo {
  readonly dcc: DccBridgeName;
  readonly label: string;
  readonly port: number;
  readonly statusEndpoint: string;
  readonly importEndpoint: string;
  readonly pluginDownloadUrl: string;
  readonly guideBlogUrl: string;
}

export const VARCO3D_DCC_BRIDGE_PLUGINS: Readonly<Record<DccBridgeName, DccBridgePluginInfo>> = {
  blender: {
    dcc: "blender",
    label: "Blender",
    port: 5324,
    statusEndpoint: "http://127.0.0.1:5324/status",
    importEndpoint: "http://127.0.0.1:5324/import",
    pluginDownloadUrl:
      "https://3d.varco.ai/api/objects/named/18e9593c2d3ac3361a7de38c4f5734d7.zip/VARCO3D-Bridge-for-Blender-v1.1.2.zip",
    guideBlogUrl:
      "https://3d.varco.ai/blog/ko/2026-06-11-send-3d-assets-directly-to-blender-from-varco-3d",
  },
  unreal: {
    dcc: "unreal",
    label: "Unreal Engine",
    port: 5325,
    statusEndpoint: "http://127.0.0.1:5325/status",
    importEndpoint: "http://127.0.0.1:5325/import",
    pluginDownloadUrl:
      "https://3d.varco.ai/api/objects/named/e8145bc737907a2988e254d85e19ef1f.zip/VARCO3DPlugin-1.1.1-Win64-UE5.8.zip",
    guideBlogUrl:
      "https://3d.varco.ai/blog/ko/2026-06-19-import-3d-assets-into-unreal-engine-in-one-click-with-varco-3d",
  },
  unity: {
    dcc: "unity",
    label: "Unity",
    port: 5326,
    statusEndpoint: "http://127.0.0.1:5326/status",
    importEndpoint: "http://127.0.0.1:5326/import",
    pluginDownloadUrl:
      "https://3d.varco.ai/api/objects/named/a4c93f773cb1c6c25e2d02d61065af46.zip/VARCO3D-Bridge-for-Unity-v1.1.0.zip",
    guideBlogUrl:
      "https://3d.varco.ai/blog/ko/2026-06-15-send-3d-models-from-varco-3d-to-unity-with-one-click",
  },
  "3dsmax": {
    dcc: "3dsmax",
    label: "Autodesk 3ds Max",
    port: 5327,
    statusEndpoint: "http://127.0.0.1:5327/status",
    importEndpoint: "http://127.0.0.1:5327/import",
    pluginDownloadUrl:
      "https://3d.varco.ai/api/objects/named/56b4c2847fc9b9075ba0b954e0e135da.msi/VARCO3D-Bridge-for-3ds-Max-2026-v1.1.1.msi",
    guideBlogUrl:
      "https://3d.varco.ai/blog/ko/2026-06-22-import-3d-models-into-3ds-max-in-one-click-with-varco-3d",
  },
  maya: {
    dcc: "maya",
    label: "Autodesk Maya",
    port: 5328,
    statusEndpoint: "http://127.0.0.1:5328/status",
    importEndpoint: "http://127.0.0.1:5328/import",
    pluginDownloadUrl:
      "https://3d.varco.ai/api/objects/named/4d714259859536968ce92ebfd929750f.msi/VARCO3D-Bridge-for-Maya-2026-v1.1.0.msi",
    guideBlogUrl:
      "https://3d.varco.ai/blog/ko/2026-06-25-send-3d-models-directly-to-maya-with-varco-3d",
  },
};

export const VARCO3D_MCP_FLOW_TOOLS = [
  {
    name: "get_node_catalog",
    category: "discovery",
    description:
      "Custom Workflow(Flow)에서 사용 가능한 Input/Action 노드 목록과 포트·파라미터 명세를 조회합니다.",
  },
  {
    name: "get_animation_catalog",
    category: "discovery",
    description:
      "Animate 노드에 지정 가능한 휴머노이드·4족보행 애니메이션 카테고리 및 클립 키(_loop 포함)를 조회합니다.",
  },
  {
    name: "get_flow_graph",
    category: "graph-read",
    description: "열려 있는 Flow 캔버스의 현재 노드·엣지 그래프 상태를 조회합니다.",
  },
  {
    name: "create_node",
    category: "graph-edit",
    description:
      "Flow 캔버스에 새 노드(GenerateImage, EditImage, Generate3D, Rig, Animate 등)를 추가합니다.",
  },
  {
    name: "connect_edge",
    category: "graph-edit",
    description:
      "소스 노드의 출력 포트(outputPort)를 타깃 노드의 입력 포트(inputPort)에 연결합니다.",
  },
  {
    name: "move_node",
    category: "graph-edit",
    description: "Flow 캔버스 내 노드의 2D 좌표(x, y)를 이동해 레이아웃을 정렬합니다.",
  },
  {
    name: "delete_node",
    category: "graph-edit",
    description: "Flow 캔버스에서 노드와 연결된 엣지를 삭제합니다.",
  },
  {
    name: "set_node_input",
    category: "graph-edit",
    description:
      "노드의 입력 파라미터(프롬프트, polygonCount, useAlpha, animation, inPlaceAnimation 등)를 설정합니다.",
  },
  {
    name: "estimate_run",
    category: "execution",
    description:
      "실행 예정인 노드(및 상위 의존 노드)의 예상 크레딧 소모량을 사전 계산합니다.",
  },
  {
    name: "run_flow",
    category: "execution",
    description:
      "전체 Flow 그래프 또는 특정 대상 노드까지의 하위 그래프 실행을 시작합니다 (크레딧 차감).",
  },
  {
    name: "wait_for_run",
    category: "execution",
    description: "실행 중인 Flow 작업이 완료될 때까지 대기합니다 (최대 600초).",
  },
  {
    name: "get_output_downloads",
    category: "output",
    description:
      "완료된 노드의 출력 에셋(GLB 3D 모델, 리깅·애니메이션 GLB/FBX, 프리뷰 이미지) 다운로드 URL을 반환합니다.",
  },
] as const;

export const VARCO3D_FLOW_NODE_CATALOG = [
  {
    type: "GenerateImage",
    kind: "action",
    stage: "1-concept-2d",
    summary: "텍스트 프롬프트로 3D 변환에 최적화된 2D 캐릭터(T-pose/A-pose)·오브젝트 이미지를 생성합니다.",
  },
  {
    type: "EditImage",
    kind: "action",
    stage: "2-preprocess-2d",
    summary: "배경 제거, 포즈 교정(T-pose 변환), 조명 균일화, 스타일 변경 등 2D 이미지를 편집합니다.",
  },
  {
    type: "Generate3D",
    kind: "action",
    stage: "3-mesh-generation",
    summary:
      "단일 또는 멀티뷰 이미지에서 텍스처가 입혀진 3D 메시(GLB)를 생성합니다 (Tri/Quad, 1,000~1,000,000 폴리곤).",
  },
  {
    type: "Rig",
    kind: "action",
    stage: "4-auto-rigging",
    summary: "3D 메시에 휴머노이드 또는 4족보행 스켈레톤과 스키닝 웨이트를 자동 바인딩합니다.",
  },
  {
    type: "Animate",
    kind: "action",
    stage: "5-motion-retarget",
    summary:
      "리깅된 캐릭터에 180종 이상의 휴머노이드·4족보행 모션 프리셋(루프 및 제자리 옵션 포함)을 적용합니다.",
  },
] as const;

export const VARCO3D_ANIMATION_CATALOG = {
  studioApiCorePresets: ["walk", "run", "idle", "jump", "dance", "attack"] as const,
  humanoid: {
    WALK: [
      "walk",
      "walk_loop",
      "run",
      "run_loop",
      "walk_forward",
      "walk_backward",
      "jog_forward",
      "sprint",
      "sneak_walk",
    ],
    IDLE: ["idle", "idle_loop", "breathing_idle", "look_around_idle", "combat_idle"],
    ACTION: ["jump", "jump_loop", "climb", "dodge", "roll", "pick_up", "throw"],
    COMBAT: [
      "attack",
      "attack_loop",
      "sword_slash",
      "punch_combo",
      "kick",
      "block",
      "hit_reaction",
      "knockdown",
    ],
    GESTURE: ["wave_hand", "clap", "bow", "nod", "shake_head", "point", "salute", "cheer"],
    POSE: ["t_pose", "a_pose", "hero_pose", "sit_pose", "kneel_pose"],
    INTERACTION: ["talk", " sit_chair", "open_door", "push_object", "type_keyboard"],
    EMOTION: ["dance", "dance_loop", "happy_jump", "angry_stomp", "sad_walk", "surprised", "laugh"],
  },
  quadruped: {
    speciesPrefixes: ["cat", "dog", "horse", "deer"] as const,
    categories: {
      WALK: ["cat_walk", "cat_walk_loop", "dog_walk", "dog_walk_loop", "horse_walk", "deer_walk"],
      TROT: ["cat_trot", "cat_trot_loop", "dog_trot", "dog_trot_loop", "horse_trot", "deer_trot"],
      CANTER: ["cat_canter", "dog_canter", "horse_canter", "horse_canter_loop", "deer_canter"],
      GALLOP: [
        "cat_gallop",
        "dog_gallop",
        "dog_gallop_loop",
        "horse_gallop",
        "horse_gallop_loop",
        "deer_gallop",
      ],
      IDLE: ["cat_idle", "cat_idle_loop", "dog_idle", "dog_idle_loop", "horse_idle", "deer_idle"],
      ACTION: ["cat_jump", "dog_jump", "dog_bark", "dog_sit", "horse_rear", "deer_leap"],
    },
  },
} as const;

export const VARCO3D_CLAUDE_APP_CONNECTOR_GUIDE = {
  title: "Claude 데스크톱 앱에 VARCO 3D MCP 연결하기 (Custom Connector)",
  blogUrl: VARCO3D_CLAUDE_APP_BLOG_URL,
  onePromptBlogUrl: VARCO3D_ONE_PROMPT_BLOG_URL,
  connectorName: "VARCO 3D",
  remoteMcpServerUrl: VARCO3D_DEFAULT_MCP_URL,
  steps: [
    "1. Claude 데스크톱 앱 실행 후 채팅 입력창 왼쪽 하단 [+] 버튼 → [Connectors] → [Manage Connectors] 선택",
    "2. Connectors 섹션 우측의 [Add] 버튼 → [Add custom connector] 클릭",
    "3. Name에 'VARCO 3D', Remote MCP server URL에 'https://3d.varco.ai/api/mcp' 입력 후 [Add] 클릭",
    "4. 생성된 VARCO 3D 항목의 [Connect] 버튼 클릭 → 브라우저에서 VARCO 3D 로그인 및 [Authorize] 승인",
    "5. 브라우저에서 VARCO 3D Custom Workflow(https://3d.varco.ai/flow) 새 캔버스를 열고 Claude에 자연어로 2D→3D→리깅→애니메이션 파이프라인 지시",
  ],
} as const;
