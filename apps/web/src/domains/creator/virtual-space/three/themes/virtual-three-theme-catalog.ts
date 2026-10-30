import { VIRTUAL_THREE_THEME_MODEL_IDS as M } from './virtual-three-theme-models';
import { VIRTUAL_THREE_NATURE_THEMES } from './virtual-three-nature-themes';
import type { VirtualThreeTheme, VirtualThreeAssetRecipeTheme, VirtualThreeAssetRecipeThemeId, VirtualThreePreservedBaselineTheme, VirtualThreeLayoutRole, VirtualThreeLayoutRoleKind } from './virtual-three-theme-types';

/** renderer 초기 선택 전용이다. store의 null/notice를 덮어쓰거나 자동 저장하지 않는다. */
export const DEFAULT_VIRTUAL_THREE_THEME_ID = 'creator-campus';

export const DEFAULT_VIRTUAL_THREE_THEME: VirtualThreePreservedBaselineTheme = {
  id: DEFAULT_VIRTUAL_THREE_THEME_ID, kind: 'preserved-baseline', version: 1,
  copy: {
    ko: { name: '기존 크리에이터 캠퍼스', description: '익숙한 건축과 작업 장비, 작업대와 이동 동선을 유지하는 기본 3D 공간입니다.' },
    en: { name: 'Original Creator Campus', description: 'The familiar 3D space, keeping its architecture, equipment, workstations and walking routes.' },
  },
  preservedAdapter: {
    id: 'existing-creator-world-3d-v1', manifestPolicy: 'preserve-current-manifest',
    campus: { architecture: 'existing-campus-architecture-v1', dioramas: 'existing-campus-10-v1',
      equipment: 'existing-campus-props-v1', generatedProps: 'preserve-existing', workstations: 'existing-campus-interactions-v1' },
    otherWorlds: 'existing-manifest-architecture-and-workstations-v1',
    coordinates: 'preserve-logical-world', runtimeState: 'preserve-camera-presence-actors',
  },
};

const role = (id: string, kind: VirtualThreeLayoutRoleKind, modelAssetId: string, count: number, ko: string, en: string): VirtualThreeLayoutRole => ({ id, kind, modelAssetId, count, intent: { ko, en } });
const surface = (baseColor: `#${string}`, roughness: number, metalness: number) => ({ baseColor, roughness, metalness });
const lighting = (ambient: number, key: number, temperature: number, azimuth: number, fill: number): VirtualThreeAssetRecipeTheme['lighting'] => ({
  ambientIlluminanceLux: ambient,
  key: { illuminanceLux: key, temperatureKelvin: temperature, azimuthDegrees: azimuth, elevationDegrees: 48 },
  fill: { illuminanceLux: fill, temperatureKelvin: 6500 },
});
function theme(id: VirtualThreeAssetRecipeThemeId, ko: { name: string; description: string }, en: { name: string; description: string },
  surfacePBR: VirtualThreeAssetRecipeTheme['surfacePBR'], lights: VirtualThreeAssetRecipeTheme['lighting'], roles: readonly VirtualThreeLayoutRole[]): VirtualThreeAssetRecipeTheme {
  return { id, kind: 'asset-recipe', version: 1, copy: { ko, en }, surfacePBR, lighting: lights,
    modelAssetIds: [...new Set(roles.map(item => item.modelAssetId))], layoutRoles: roles };
}

/** PBR·조명 수치는 설계 제안이다. 실제 배치·광량·가독성·충돌 검수 완료를 뜻하지 않는다. */
export const VIRTUAL_THREE_THEMES: readonly VirtualThreeTheme[] = [
  DEFAULT_VIRTUAL_THREE_THEME,
  theme('parkbotanical',
    { name: '식물 정원 스튜디오', description: '각진 나무와 꽃, 벤치 사이의 이젤에서 그림을 그립니다. 부드러운 초록빛과 목재 질감이 감도는 정원 작업실입니다.' },
    { name: 'Botanical Park Studio', description: 'Draw at an easel among cube trees, flowers and garden benches. Soft greens and warm wood textures set the mood for a garden workspace.' },
    { floor: surface('#b4aa86', 0.94, 0), wall: surface('#768b69', 0.9, 0), trim: surface('#81664d', 0.78, 0.04) }, lighting(100, 650, 5300, -35, 160), [
      role('garden-trees', 'botanical', M.parkTree, 4, '작업 공간 가장자리의 수목', 'Trees around the workspace perimeter'),
      role('flower-clusters', 'botanical', M.parkFlower, 6, '통로 바깥의 꽃 군집', 'Flower clusters outside circulation routes'),
      role('garden-seats', 'seating', M.parkBench, 2, '휴식과 합평용 좌석', 'Rest and review seating'),
      role('easel-workstation', 'workstation', M.artistEasel, 1, '대표 작화 작업점', 'Primary drawing workstation'),
    ]),
  theme('fantasyguild',
    { name: '판타지 길드 작업실', description: '목제 탁자와 의자, 연금술 선반이 둘러싼 아늑한 원고 작업실입니다. 따뜻한 빛 아래 동료들과 이야기를 구상합니다.' },
    { name: 'Fantasy Guild Workshop', description: 'Wooden tables, chairs and alchemy shelves create a cozy manuscript workshop. Plan the next story with your team under warm light.' },
    { floor: surface('#6a4a35', 0.83, 0), wall: surface('#7d786d', 0.96, 0), trim: surface('#a57e42', 0.45, 0.5) }, lighting(80, 420, 3400, -40, 100), [
      role('guild-table', 'workstation', M.dungeonTable, 1, '공동 원고 작업대', 'Shared manuscript table'),
      role('guild-chairs', 'seating', M.dungeonChair, 4, '작업대 주변 좌석', 'Seats around the worktable'),
      role('guild-shelves', 'storage', M.dungeonShelf, 2, '벽면 자료 수납', 'Wall-side reference storage'),
      role('alchemy-reference', 'focal-object', M.referenceShelf, 1, '시선 중심의 연금술 선반', 'Alchemy shelf as a focal point'),
    ]),
  theme('sflab',
    { name: 'SF 제작 실험실', description: '파란 벽 패널과 아케이드 콘솔, 나란한 책상이 미래형 제작 공간을 만듭니다. 차가운 빛과 금속 질감 속에서 새로운 장면을 구상합니다.' },
    { name: 'SF Production Lab', description: 'Blue wall panels, an arcade console and paired desks form a futuristic studio. Imagine new scenes amid cool light and metallic surfaces.' },
    { floor: surface('#354654', 0.56, 0.25), wall: surface('#344f77', 0.66, 0.16), trim: surface('#72b6c2', 0.35, 0.58) }, lighting(120, 600, 6200, 25, 230), [
      role('lab-panels', 'enclosure', M.blueWall, 4, '실험실 경계를 구성할 벽 패널', 'Wall panels defining the lab boundary'),
      role('lab-console', 'focal-object', M.creatorArcade, 1, '아케이드 캐비닛 콘솔', 'Arcade cabinet console'),
      role('lab-desk', 'workstation', M.referenceDesk, 2, '분리된 자료 작업점', 'Separate reference workstations'),
    ]),
  theme('gothicarchive',
    { name: '고딕 자료 보관실', description: '높게 둘러선 자료 선반과 울타리, 십자가 장식이 고요한 서고를 만듭니다. 낮고 따뜻한 빛 아래 어두운 이야기에 몰입합니다.' },
    { name: 'Gothic Reference Archive', description: 'Reference shelves, fences and cross accents form a quiet archive. Low, warm light sets the scene for darker stories.' },
    { floor: surface('#454149', 0.92, 0.02), wall: surface('#625e68', 0.94, 0), trim: surface('#786342', 0.58, 0.34) }, lighting(55, 330, 3000, -55, 115), [
      role('archive-shelves', 'storage', M.dungeonShelf, 3, '벽면 보관 선반', 'Wall-side archive shelving'),
      role('archive-focus', 'focal-object', M.referenceShelf, 1, '자료 선반 중심점', 'Reference shelf focal point'),
      role('archive-fence', 'accent', M.graveFence, 2, '이동 권한을 갖지 않는 장식 역할', 'Decorative role without navigation authority'),
      role('archive-cross', 'accent', M.graveCross, 1, '주제 조형물', 'Thematic sculptural accent'),
    ]),
  theme('vehiclegarage',
    { name: '차량 제작 차고', description: '차량 한 대를 중심으로 벽 패널과 자료 책상을 둔 차고형 작업실입니다. 밝은 작업등과 금속 질감이 기계적인 분위기를 더합니다.' },
    { name: 'Vehicle Production Garage', description: 'A vehicle takes center stage in a garage workspace with wall panels and a reference desk. Bright task lighting and metal surfaces add an industrial feel.' },
    { floor: surface('#53585d', 0.73, 0.12), wall: surface('#64717e', 0.84, 0.1), trim: surface('#a38b47', 0.55, 0.38) }, lighting(140, 720, 5100, 35, 230), [
      role('garage-vehicle', 'focal-object', M.car, 1, '차량 작화 참고 대상', 'Vehicle drawing reference'),
      role('garage-panels', 'enclosure', M.blueWall, 3, '작업 구역의 경계 패널', 'Boundary panels for the work area'),
      role('garage-desk', 'workstation', M.referenceDesk, 1, '자료 작업대', 'Reference workstation'),
    ]),
  theme('cafefood',
    { name: '카페 테이블 스튜디오', description: '컵과 그릇이 놓인 작은 탁자, 목제 의자가 편안한 카페 분위기를 만듭니다. 따뜻한 빛 아래 잠시 쉬거나 아이디어를 나눕니다.' },
    { name: 'Cafe Table Studio', description: 'Small tables with cups and bowls, wooden chairs and warm light create a relaxed cafe setting. Take a break or share the next idea.' },
    { floor: surface('#9d7754', 0.83, 0), wall: surface('#d0bfa5', 0.91, 0), trim: surface('#584438', 0.68, 0.08) }, lighting(110, 480, 3900, -30, 150), [
      role('cafe-table', 'workstation', M.dungeonTable, 2, '작업과 휴식용 탁자', 'Work and rest tables'),
      role('cafe-chairs', 'seating', M.dungeonChair, 4, '탁자 주변 좌석', 'Table seating'),
      role('cafe-cups', 'tabletop', M.dungeonCup, 4, '탁상용 컵 소품', 'Tabletop cup props'),
      role('cafe-bowls', 'tabletop', M.dungeonBowl, 2, '탁상용 그릇 소품', 'Tabletop bowl props'),
    ]),
  ...VIRTUAL_THREE_NATURE_THEMES,
];

export function findVirtualThreeTheme(id: unknown): VirtualThreeTheme | undefined {
  return typeof id === 'string' ? VIRTUAL_THREE_THEMES.find(item => item.id === id) : undefined;
}
