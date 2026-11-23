/**
 * 양방향 IP 변환 파이프라인 정본 카탈로그 및 타입 정의.
 * 6방향 변환 메타데이터·4대 게임 엔진(Unity/Unreal/Godot/Phaser) 프로파일·Rights BOM 샘플·단계별 파이프라인 정의를 보관한다.
 */

export type CrossMediaTransformDirection =
  | "webtoon-to-novel"
  | "novel-to-webtoon"
  | "webtoon-to-drama-previz"
  | "webtoon-to-remotion-anime"
  | "webtoon-to-game-assets"
  | "webtoon-to-visual-novel-playable";

export type GameEngineTarget = "unity" | "unreal" | "godot" | "phaser";

export type DialogueExportFormat = "ink" | "yarn" | "unity-localization";

export type GameAssetLicenseScope =
  | "commercial-game-ok"
  | "editorial-only"
  | "non-commercial"
  | "missing";

export interface GameAssetRightsEntry {
  readonly id: string;
  readonly assetTitle: string;
  readonly category: "3d-model" | "shader" | "font" | "sprite" | "audio" | "script";
  readonly licenseScope: GameAssetLicenseScope;
  readonly attributionRequired: boolean;
  readonly redistributableInBinary: boolean;
  readonly authorName: string;
}

export interface CrossMediaDirectionMeta {
  readonly direction: CrossMediaTransformDirection;
  readonly labelKo: string;
  readonly shortBadgeKo: string;
  readonly sourceMediumKo: string;
  readonly targetMediumKo: string;
  readonly summaryKo: string;
  readonly spritePath: string;
  readonly primaryDeliverableKo: string;
}

export interface GameEngineProfile {
  readonly engine: GameEngineTarget;
  readonly labelKo: string;
  readonly coordinateSystem: string;
  readonly unitScale: string;
  readonly assetPackageFormat: string;
  readonly shaderTarget: string;
  readonly recommendedDialogueFormat: DialogueExportFormat;
}

export interface TransformPipelineStage {
  readonly order: number;
  readonly id: string;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly artifactKo: string;
  readonly automatedRatioPercent: number;
}

export const GAME_ENGINE_PROFILES: Readonly<Record<GameEngineTarget, GameEngineProfile>> = {
  unity: {
    engine: "unity",
    labelKo: "Unity (URP · glTFast)",
    coordinateSystem: "Left-handed Y-up",
    unitScale: "1 unit = 1m",
    assetPackageFormat: "GLB + SpriteAtlas2D + Unity Localization JSON",
    shaderTarget: "URP Toon Lit / ShaderGraph",
    recommendedDialogueFormat: "unity-localization",
  },
  unreal: {
    engine: "unreal",
    labelKo: "Unreal Engine 5 (Interchange GLB)",
    coordinateSystem: "Left-handed Z-up (자동 축 보정)",
    unitScale: "100 uu = 1m",
    assetPackageFormat: "GLB(Interchange) + Paper2D Flipbook + StringTable JSON",
    shaderTarget: "UE5 Cel Post-Process Material",
    recommendedDialogueFormat: "yarn",
  },
  godot: {
    engine: "godot",
    labelKo: "Godot 4.4 (Native glTF 2.0)",
    coordinateSystem: "Right-handed Y-up (glTF 원형)",
    unitScale: "1 unit = 1m",
    assetPackageFormat: "GLB + SpriteFrames Atlas + Ink/Yarn JSON",
    shaderTarget: "Godot Spatial / CanvasItem Toon Shader",
    recommendedDialogueFormat: "ink",
  },
  phaser: {
    engine: "phaser",
    labelKo: "Phaser 3 (웹 2D 아틀라스)",
    coordinateSystem: "2D Top-Left Screen Space",
    unitScale: "px (256px 캐릭터 기준)",
    assetPackageFormat: "WebP Atlas + JSON Hash + Ink/Yarn 대사 번들",
    shaderTarget: "WebGL2 Pipeline Tint/Outline",
    recommendedDialogueFormat: "ink",
  },
};

export const CROSS_MEDIA_DIRECTION_CATALOG: readonly CrossMediaDirectionMeta[] = [
  {
    direction: "webtoon-to-novel",
    labelKo: "웹툰 → 웹소설",
    shortBadgeKo: "컷→산문",
    sourceMediumKo: "웹툰 컷·말풍선",
    targetMediumKo: "연재 웹소설 회차",
    summaryKo: "컷별 대사·행동·장면 전환 비트를 추출해 화당 5,000자 안팎의 연재 회차 초고와 장면 지문으로 재구성합니다.",
    spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp",
    primaryDeliverableKo: "회차별 마크다운 원고 · 화자별 대사 로그 · 감정선 요약",
  },
  {
    direction: "novel-to-webtoon",
    labelKo: "웹소설 → 웹툰",
    shortBadgeKo: "산문→콘티",
    sourceMediumKo: "웹소설 원고",
    targetMediumKo: "세로 스크롤 컷 콘티",
    summaryKo: "서술 문단을 세로 스크롤 호흡에 맞는 컷 리스트, 말풍선 3줄 제한, 카메라 앵글과 3D 배경 힌트로 분할합니다.",
    spritePath: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
    primaryDeliverableKo: "컷 분할 스토리보드 JSON · 말풍선 레이어 시트 · 3D 배경 추천표",
  },
  {
    direction: "webtoon-to-drama-previz",
    labelKo: "웹툰 → 드라마 프리비즈",
    shortBadgeKo: "컷→샷리스트",
    sourceMediumKo: "웹툰 원고·3D 스테이지",
    targetMediumKo: "실사 드라마/영화 프리비즈",
    summaryKo: "웹툰 장면을 S# 씬 넘버, 카메라 워킹, 렌즈 초점거리, 조명 색온도, 초 단위 러닝타임 샷 리스트로 변환합니다.",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    primaryDeliverableKo: "S# 샷 리스트 CSV/JSON · 카메라 블로킹 노트 · 조명 무드보드",
  },
  {
    direction: "webtoon-to-remotion-anime",
    labelKo: "웹툰 → Remotion 숏폼 애니",
    shortBadgeKo: "컷→쇼츠영상",
    sourceMediumKo: "웹툰 레이어·대사",
    targetMediumKo: "Remotion 9:16/16:9 애니매틱",
    summaryKo: "분리된 캐릭터·배경·말풍선 레이어를 패럴랙스 카메라, 키네틱 자막, 오디오 비트싱크 마커가 포함된 Remotion 컴포지션으로 묶습니다.",
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
    primaryDeliverableKo: "Remotion 컴포지션 JSON · 자막 타임코드 · 9:16 쇼츠 렌더 스펙",
  },
  {
    direction: "webtoon-to-game-assets",
    labelKo: "웹툰 → 게임 에셋",
    shortBadgeKo: "IP→엔진패키지",
    sourceMediumKo: "웹툰 캐릭터·3D 배경·대사",
    targetMediumKo: "Unity/Unreal/Godot/Phaser 패키지",
    summaryKo: "3단계 LOD GLB, 4/8방향 2D 스프라이트 아틀라스, Ink/Yarn/Unity 대사 JSON과 상업 Rights BOM 검증표를 한 번에 패키징합니다.",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    primaryDeliverableKo: "LOD 3종 GLB · 4/8방향 아틀라스 · 대사 JSON · Rights BOM 증명서",
  },
  {
    direction: "webtoon-to-visual-novel-playable",
    labelKo: "웹툰 → 비주얼 노벨",
    shortBadgeKo: "웹툰→플레이어블",
    sourceMediumKo: "웹툰 회차·표정 스탠딩",
    targetMediumKo: "웹 플레이어블 비주얼 노벨",
    summaryKo: "웹툰 화차의 갈등 구간을 분기 선택지와 호감도 변수로 재구성해 8종 표정 스프라이트와 Ink/Yarn 대사 스크립트로 바로 실행합니다.",
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
    primaryDeliverableKo: "분기 그래프 JSON · 8표정 스탠딩 세트 · 플레이어블 HTML 번들",
  },
];

export const DEFAULT_IP_RIGHTS_BOM: readonly GameAssetRightsEntry[] = [
  {
    id: "bom-hero-vrm",
    assetTitle: "주인공 VRM/GLB 리깅 원본",
    category: "3d-model",
    licenseScope: "commercial-game-ok",
    attributionRequired: false,
    redistributableInBinary: true,
    authorName: "스튜디오 원작팀",
  },
  {
    id: "bom-cel-shader",
    assetTitle: "3단 셀 윤곽선 셰이더 팩",
    category: "shader",
    licenseScope: "commercial-game-ok",
    attributionRequired: true,
    redistributableInBinary: true,
    authorName: "아틀리에 셰이더 랩",
  },
  {
    id: "bom-ko-font",
    assetTitle: "대화체 본문 폰트 (상업 임베드 허용)",
    category: "font",
    licenseScope: "commercial-game-ok",
    attributionRequired: true,
    redistributableInBinary: true,
    authorName: "한글 타이포 길드",
  },
  {
    id: "bom-bg-stage",
    assetTitle: "옥상 노을 3D 스테이지 모듈",
    category: "3d-model",
    licenseScope: "commercial-game-ok",
    attributionRequired: false,
    redistributableInBinary: true,
    authorName: "배경 공방",
  },
];

export function buildPipelineStagesForDirection(
  direction: CrossMediaTransformDirection,
  engineProfile: GameEngineProfile,
): readonly TransformPipelineStage[] {
  switch (direction) {
    case "webtoon-to-novel":
      return [
        { order: 1, id: "extract-panels", titleKo: "컷 대사·감정 비트 추출", detailKo: "말풍선 화자, 독백 박스, 효과음과 컷 간 시간 점프를 구조화합니다.", artifactKo: "scene-beats.json", automatedRatioPercent: 92 },
        { order: 2, id: "weave-prose", titleKo: "장면 지문·서술 초고 전개", detailKo: "배경 3D 카메라 구도와 표정 메타데이터를 묘사 문장으로 옮깁니다.", artifactKo: "chapter-draft.md", automatedRatioPercent: 80 },
        { order: 3, id: "pace-check", titleKo: "회차 분량·대화 비율 조율", detailKo: "플랫폼 연재 기준(화당 4,800~5,500자)에 맞춰 호흡과 절단점을 점검합니다.", artifactKo: "pacing-report.json", automatedRatioPercent: 88 },
      ];
    case "novel-to-webtoon":
      return [
        { order: 1, id: "segment-scenes", titleKo: "문단→세로 스크롤 컷 분할", detailKo: "긴장감 상승 구간은 여백을 늘리고 액션 문단은 대각선 컷으로 배분합니다.", artifactKo: "vertical-storyboard.json", automatedRatioPercent: 86 },
        { order: 2, id: "bubble-budget", titleKo: "말풍선 3줄 제한·화자 배치", detailKo: "모바일 가독성을 해치는 장문 대사를 2~3개 말풍선으로 자동 분할합니다.", artifactKo: "lettering-sheet.json", automatedRatioPercent: 94 },
        { order: 3, id: "bg3d-camera", titleKo: "3D 스테이지·캐릭터 VRM 큐 연결", detailKo: "장면 키워드에 맞는 3D 배경 앵글과 VRM 포즈 프리셋을 각 컷에 연결합니다.", artifactKo: "cut-3d-cues.json", automatedRatioPercent: 84 },
      ];
    case "webtoon-to-drama-previz":
      return [
        { order: 1, id: "scene-breakdown", titleKo: "S# 씬 넘버·로케이션 분해", detailKo: "웹툰 컷을 실사 촬영용 낮/밤·실내/실외 씬 헤더와 동선 메모로 정리합니다.", artifactKo: "drama-scene-breakdown.json", automatedRatioPercent: 89 },
        { order: 2, id: "camera-lens", titleKo: "샷 리스트·렌즈 초점거리 매핑", detailKo: "클로즈업/바스트/풀샷 컷 구도를 24mm·50mm·85mm 렌즈와 카메라 무빙으로 옮깁니다.", artifactKo: "shot-list.csv", automatedRatioPercent: 85 },
        { order: 3, id: "lighting-timing", titleKo: "조명 색온도·러닝타임 추정", detailKo: "컷별 대사 길이를 초 단위 타임코드로 환산해 파일럿 분량을 계산합니다.", artifactKo: "previz-timing-deck.json", automatedRatioPercent: 82 },
      ];
    case "webtoon-to-remotion-anime":
      return [
        { order: 1, id: "layer-depth", titleKo: "전경·캐릭터·배경 패럴랙스 분리", detailKo: "웹툰 레이어를 Z축 깊이 트랙으로 나눠 2.5D 카메라 패닝을 준비합니다.", artifactKo: "parallax-layers.json", automatedRatioPercent: 91 },
        { order: 2, id: "kinetic-caption", titleKo: "키네틱 자막·Foley 비트싱크", detailKo: "효과음 타이포와 WebAudio Foley/BGM 피크 지점을 프레임 단위로 맞춥니다.", artifactKo: "remotion-timeline.json", automatedRatioPercent: 90 },
        { order: 3, id: "shorts-pack", titleKo: "9:16 쇼츠 · 16:9 예고편 컴포지션 생성", detailKo: "결정론적 30/60fps Remotion 컴포지션 규격과 안전 영역을 검증합니다.", artifactKo: "remotion-composition-spec.json", automatedRatioPercent: 95 },
      ];
    case "webtoon-to-game-assets":
      return [
        { order: 1, id: "lod-mesh", titleKo: `${engineProfile.labelKo} 3단계 LOD 변환`, detailKo: `${engineProfile.coordinateSystem} · ${engineProfile.unitScale} 규격으로 High/Mid/Low GLB를 생성합니다.`, artifactKo: "LOD0~2 .glb + 머티리얼 메타", automatedRatioPercent: 93 },
        { order: 2, id: "atlas-dialogue", titleKo: "4/8방향 스프라이트 아틀라스 & 대사 JSON", detailKo: `${engineProfile.shaderTarget} 힌트와 Ink/Yarn/Unity Localization 번들을 묶습니다.`, artifactKo: "atlas.webp + dialogue.json", automatedRatioPercent: 95 },
        { order: 3, id: "rights-bom-gate", titleKo: "Rights BOM 상업 바이너리 라이선스 감사", detailKo: "3D·셰이더·폰트별 재배포 권한과 엔딩 크레딧 표기 의무를 자동 확인합니다.", artifactKo: "rights-bom-certificate.json", automatedRatioPercent: 100 },
      ];
    case "webtoon-to-visual-novel-playable":
      return [
        { order: 1, id: "standing-expressions", titleKo: "캐릭터 8표정 스탠딩·배경 레이어 추출", detailKo: "평온/기쁨/분노/놀람/슬픔/당황/결의/미소 8종 표정 스프라이트를 정규화합니다.", artifactKo: "standing-expressions-8x.webp", automatedRatioPercent: 90 },
        { order: 2, id: "branch-graph", titleKo: "분기 선택지·호감도 플래그 그래프 구성", detailKo: "원작 클리프행어 컷을 2~3갈래 선택지와 엔딩 분기 변수로 확장합니다.", artifactKo: "vn-branch-graph.json", automatedRatioPercent: 86 },
        { order: 3, id: "playable-bundle", titleKo: "브라우저 즉시 실행 비주얼 노벨 패키징", detailKo: "Ink/Yarn 대사 엔진과 Rights BOM 라이선스 증명서를 웹 번들로 묶습니다.", artifactKo: "playable-vn-bundle.html", automatedRatioPercent: 94 },
      ];
  }
}
