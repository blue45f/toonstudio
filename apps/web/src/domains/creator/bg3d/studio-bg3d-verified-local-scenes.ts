import { LOCAL_BG3D_SCENES } from "./studio-bg3d-local-scene-catalog";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
  type StudioBg3dVec3,
} from "./studio-bg3d-scene-document";

export interface StudioBg3dVerifiedLocalScene {
  readonly id: string;
  readonly name: string;
  readonly usage: string;
  readonly fileName: string;
  readonly hash: string;
  readonly byteSize: number;
  readonly cameraPosition: StudioBg3dVec3;
  readonly cameraTarget: StudioBg3dVec3;
  readonly modelPosition: StudioBg3dVec3;
  readonly rightsNote: string;
  readonly attributionText: string | null;
}

const TRIPO_API_RIGHTS_NOTE = "Tripo API로 생성한 모델입니다. 로컬 개발용으로 검토했으며 원본 파일의 재배포 권리는 미확인입니다.";
const VARCO_RIGHTS_NOTE = "CC BY 4.0은 원안 이미지에 적용됩니다. 3D 개발 사본은 경량화했으며 파일 재배포 권리는 미확인입니다.";

/** 전체 모형이 보이는 검증 원고에서 카메라 위치와 주시점, 모델 배치를 옮겼다. */
const bundledScenes: readonly StudioBg3dVerifiedLocalScene[] = [
  {
    id: "apartment-lobby",
    name: "아파트 로비",
    usage: "공동 현관과 대기 공간을 함께 담는 배경 전경",
    fileName: "webtoon_apartment_lobby_module.glb",
    hash: "sha256:12bb5e578e8a2872b2a89be084ab5be4c458fd18021bab6c830c1d9aa1de01e4",
    byteSize: 385_340,
    cameraPosition: [3.999999999999999, 3, 6],
    cameraTarget: [0, 0.6, 0],
    modelPosition: [0, 0, 0],
    rightsNote: TRIPO_API_RIGHTS_NOTE,
    attributionText: null,
  },
  {
    id: "food-cart",
    name: "골목 포장마차",
    usage: "거리 장면에서 포장마차를 가까이 잡는 소품 컷",
    fileName: "webtoon_alley_food_cart.glb",
    hash: "sha256:0a13d34e593a66bb8c6f6d23607c81f9734f2bfe02bd8cb3f71eec6c3f1f9176",
    byteSize: 507_984,
    cameraPosition: [2.399381113676025, 3.073778503530768, 4.536268589575051],
    cameraTarget: [-0.44910949411282997, 1.3646841388574549, 0.263532677891767],
    modelPosition: [0, 0, 0],
    rightsNote: TRIPO_API_RIGHTS_NOTE,
    attributionText: null,
  },
  {
    id: "one-room",
    name: "원룸 가구",
    usage: "가구 배치를 한눈에 볼 수 있는 실내 장면 템플릿",
    fileName: "webtoon_one_room_furniture_cluster.glb",
    hash: "sha256:953c7e60731da5a44788b803aa7216d017e931ea95773bcda22c2dc793558306",
    byteSize: 372_552,
    cameraPosition: [3.006402270777495, 3.4657244870055557, 5.9106171610970515],
    cameraTarget: [-0.6713728067465763, 1.259059440491113, 0.39395454481094355],
    modelPosition: [0, 0, 0],
    rightsNote: TRIPO_API_RIGHTS_NOTE,
    attributionText: null,
  },
  {
    id: "park-bench",
    name: "공원 벤치",
    usage: "야외 장면의 벤치 전경",
    fileName: "varco-wooden-park-bench-dev.glb",
    hash: "sha256:5c4ca9e58f643d01f6458013e7870e439820dd7045705d2204d618c9a3aad070",
    byteSize: 1_242_864,
    cameraPosition: [1.254457220419841, 1.5308218638712403, 2.4284045463772443],
    cameraTarget: [-0.26199034239301816, 0.6209533261835248, 0.15373320215795497],
    modelPosition: [0, 0, 0],
    rightsNote: VARCO_RIGHTS_NOTE,
    attributionText: "blue45f, Wooden Park Bench, VARCO 3D, CC BY 4.0; 경량화",
  },
  {
    id: "coffee-shop",
    name: "카페 실내",
    usage: "가게 안을 내려다보는 아이소메트릭 배경",
    fileName: "varco-isometric-coffee-shop-dev.glb",
    hash: "sha256:56debed8be02cb00b6d5ad87bb2cb983fc7569aee2f4332281baa6dabbab0a2c",
    byteSize: 1_554_700,
    cameraPosition: [1.9062550217078673, 5.030913763837987, 6.2401125239148],
    cameraTarget: [0, 2.467914342880249, 0],
    modelPosition: [0, 0, 0],
    rightsNote: VARCO_RIGHTS_NOTE,
    attributionText: "blue45f, Isometric Coffee Shop, VARCO 3D, CC BY 4.0; 경량화",
  },
  {
    id: "knight-crest",
    name: "기사 문장 방패",
    usage: "벽에 걸린 문장 방패를 담는 실내 장식 컷",
    fileName: "tripo_studio_h31_knight_crest.glb",
    hash: "sha256:629985a1385119d3c4424bb9e5340f6d734f46547f80f8aa0a9f10a0d7442bca",
    byteSize: 1_845_340,
    cameraPosition: [1.2748518276825422, 2.470417149310795, 1.117787655224906],
    cameraTarget: [-0.19535975104438724, 1.5882902020746374, -1.0875297128654886],
    modelPosition: [0, 1.55, -1.2],
    rightsNote: "Tripo Studio 유료 플랜에서 텍스트로 생성한 장식 소품입니다. 이용 범위는 연결한 파일의 권리 기록을 따릅니다.",
    attributionText: null,
  },
];

export const STUDIO_BG3D_VERIFIED_LOCAL_SCENES: readonly StudioBg3dVerifiedLocalScene[] = [
  ...bundledScenes,
  ...LOCAL_BG3D_SCENES.filter(local => !bundledScenes.some(scene => scene.id === local.id || scene.hash === local.hash)),
];

/** 해시·크기가 일치하는 기기 라이브러리 첨부의 권리 기록을 그대로 사용한다. */
export function createStudioBg3dVerifiedLocalScene(
  preset: StudioBg3dVerifiedLocalScene,
  attachment: StudioBg3dModelAttachment,
): StudioBg3dSceneDocument | null {
  if (
    attachment.source !== "local-library" ||
    attachment.mime !== STUDIO_BG3D_GLB_MIME ||
    attachment.hash !== preset.hash ||
    attachment.byteSize !== preset.byteSize
  ) return null;

  return {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    camera: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      position: preset.cameraPosition,
      target: preset.cameraTarget,
      fovDegrees: 50,
      projection: "perspective",
      zoom: 1,
      nearClip: 0.1,
      up: [0, 1, 0],
    },
    attachments: [attachment],
    nodes: [{
      id: `local-${preset.id}`,
      kind: "model",
      name: preset.name,
      attachmentId: attachment.id,
      parentId: null,
      transform: { position: preset.modelPosition, rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
    }],
  };
}
