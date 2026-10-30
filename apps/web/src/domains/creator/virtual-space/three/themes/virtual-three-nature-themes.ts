import { VIRTUAL_THREE_THEME_MODEL_IDS as M } from './virtual-three-theme-models';
import { VIRTUAL_THREE_NATURE_MODEL_IDS as N } from './virtual-three-nature-theme-models';
import type { VirtualThreeAssetRecipeTheme, VirtualThreeLayoutRole, VirtualThreeLayoutRoleKind } from './virtual-three-theme-types';

const role = (id: string, kind: VirtualThreeLayoutRoleKind, modelAssetId: string, count: number, ko: string, en: string): VirtualThreeLayoutRole => ({
  id, kind, modelAssetId, count, intent: { ko, en },
});
const forestRoles = [
  role('forest-edge-trees', 'botanical', N.natureTree, 3, '수목이 둘러싼 가장자리', 'Trees around the perimeter'),
  role('forest-understory', 'botanical', N.natureBush, 3, '수목 아래 관목 군집', 'Shrubs below the tree canopy'),
  role('forest-stones', 'accent', N.natureRock, 2, '숲바닥의 암석 관찰 자료', 'Rock references on the forest floor'),
  role('forest-mushrooms', 'botanical', N.natureMushroom, 3, '가까이 관찰할 버섯 군집', 'Mushroom clusters for close observation'),
  role('forest-drawing-station', 'workstation', M.artistEasel, 1, '숲을 관찰하는 작화 작업점', 'Drawing station for forest observation'),
] as const;
const gardenRoles = [
  role('garden-tropical-plants', 'botanical', N.natureBanana, 2, '키 큰 열대 식물 관찰 구역', 'Tall tropical plant references'),
  role('garden-growing-beds', 'botanical', N.natureField, 2, '식물 재배 모듈', 'Cultivation modules'),
  role('garden-seedlings', 'botanical', N.natureLettuce, 6, '잎채소 형태와 생장 관찰', 'Leafy vegetable observation'),
  role('garden-flowers', 'botanical', N.natureFlower, 3, '꽃 형태와 색채 관찰', 'Flower shape and color references'),
  role('garden-study-desk', 'workstation', M.referenceDesk, 1, '식물 관찰 자료 작업점', 'Plant study reference workstation'),
] as const;

/** 기존 작업 동선 위에 역할만 선언한다. 실제 유리 온실 mesh·충돌체·스폰을 생성하지 않는다. */
export const VIRTUAL_THREE_NATURE_THEMES: readonly VirtualThreeAssetRecipeTheme[] = [
  {
    id: 'forestretreat', kind: 'asset-recipe', version: 1,
    copy: {
      ko: { name: '숲속 관찰 작업실', description: '나무와 관목, 바위와 버섯을 가까이 관찰하고 이젤에서 장면을 그리는 숲속 작업실입니다.' },
      en: { name: 'Forest Observation Studio', description: 'Observe trees, shrubs, rocks and mushrooms, then sketch the scene at an easel.' },
    },
    surfacePBR: {
      floor: { baseColor: '#5d6451', roughness: 0.95, metalness: 0 },
      wall: { baseColor: '#68725d', roughness: 0.94, metalness: 0 },
      trim: { baseColor: '#7e654c', roughness: 0.87, metalness: 0 },
    },
    lighting: {
      ambientIlluminanceLux: 95,
      key: { illuminanceLux: 520, temperatureKelvin: 5200, azimuthDegrees: -50, elevationDegrees: 55 },
      fill: { illuminanceLux: 150, temperatureKelvin: 6500 },
    },
    modelAssetIds: [...new Set(forestRoles.map(item => item.modelAssetId))], layoutRoles: forestRoles,
  },
  {
    id: 'gardenstudy', kind: 'asset-recipe', version: 1,
    copy: {
      ko: { name: '정원 관찰 작업실', description: '바나나나무와 재배 모듈, 잎채소와 꽃을 배치한 밝은 식물 관찰 공간입니다. 자료 책상에서 형태와 색을 연구합니다.' },
      en: { name: 'Garden Study Studio', description: 'Study banana plants, cultivation beds, leafy vegetables and flowers beside a reference desk.' },
    },
    surfacePBR: {
      floor: { baseColor: '#bcbd9c', roughness: 0.84, metalness: 0 },
      wall: { baseColor: '#bcc9b8', roughness: 0.88, metalness: 0 },
      trim: { baseColor: '#617763', roughness: 0.68, metalness: 0.08 },
    },
    lighting: {
      ambientIlluminanceLux: 150,
      key: { illuminanceLux: 680, temperatureKelvin: 5600, azimuthDegrees: 20, elevationDegrees: 58 },
      fill: { illuminanceLux: 250, temperatureKelvin: 6500 },
    },
    modelAssetIds: [...new Set(gardenRoles.map(item => item.modelAssetId))], layoutRoles: gardenRoles,
  },
];
