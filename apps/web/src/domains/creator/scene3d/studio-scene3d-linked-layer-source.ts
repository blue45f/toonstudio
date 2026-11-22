/**
 * Studio Scene3D 링크드 레이어 편집 원본 읽기 모델 재수출 창구.
 * 정본 계약은 `../contracts/studio-scene3d-linked-layer-source` 에 두어
 * 초기 진입 그래프가 scene3d 금지 도메인으로 정적 엣지를 만들지 않도록 격리한다.
 */
export {
  describeStudioScene3dLinkedLayerReview,
  resolveCanonicalStudioBg3dSceneForBundle,
  resolveStudioScene3dLinkedLayerEditSource,
  snapshotStudioScene3dLinkedLayerEditSource,
  type StudioScene3dCanonicalSceneLookup,
  type StudioScene3dLinkedLayerReviewState,
} from "../contracts/studio-scene3d-linked-layer-source";
