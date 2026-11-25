import type { DemoCinematographyScene } from "./cinematography-camera-engine";

export const DEMO_CINEMATOGRAPHY_SCENES: readonly DemoCinematographyScene[] = [
  {
    sceneId: "rooftop-confrontation",
    titleKo: "옥상 대치 · 180도 축 위반 진단",
    titleEn: "Rooftop Standoff (Axis Violation)",
    descriptionKo: "3번째 리액션 컷에서 카메라가 시선 축을 넘어 인물 좌우가 뒤바뀌는 실수를 진단·자동 보정합니다.",
    descriptionEn: "Shot 3 crosses the Line-of-Action and flips actor screen order; mirror-fix in one click.",
    actorA: { id: "seo-jin", nameKo: "서진", nameEn: "Seojin", position: { x: -2.4, z: 0 } },
    actorB: { id: "do-yoon", nameKo: "도윤", nameEn: "Doyoon", position: { x: 2.4, z: 0 } },
    shots: [
      { shotId: "cut-01-master", labelKo: "컷 1 · 투샷 마스터", labelEn: "Cut 1 · Two-Shot", cameraPosition: { x: 0.0, z: 4.4 }, focalLengthMm: 35 },
      { shotId: "cut-02-ots-a", labelKo: "컷 2 · 서진 어깨너머", labelEn: "Cut 2 · OTS Seojin", cameraPosition: { x: -3.2, z: 2.5 }, focalLengthMm: 85, targetActorId: "do-yoon" },
      { shotId: "cut-03-cross-error", labelKo: "컷 3 · 도윤 반격 (축 넘침!)", labelEn: "Cut 3 · Counter (Crossed!)", cameraPosition: { x: 3.1, z: -2.6 }, focalLengthMm: 85, targetActorId: "seo-jin" },
      { shotId: "cut-04-closeup-a", labelKo: "컷 4 · 서진 클로즈업", labelEn: "Cut 4 · Seojin Close-Up", cameraPosition: { x: 1.4, z: 2.3 }, focalLengthMm: 135, targetActorId: "seo-jin" },
    ],
    defaultApertureFStop: 2.0, defaultFocusDistanceM: 3.2, defaultBackgroundDistanceM: 12.0,
    defaultComposition: { subjectFocalPoint: { x: 0.84, y: 0.48 }, headTopY: 0.02, gazeDirection: "right", shotScale: "medium", goldenSpiralCorner: "auto" },
  },
  {
    sceneId: "cafe-dialogue-ots",
    titleKo: "카페 OTS 대화 · 정석 180도",
    titleEn: "Cafe OTS Dialogue (Compliant)",
    descriptionKo: "85mm·50mm 정석 180도 반구 안에서 시선 여백과 황금나선 구도를 안정적으로 유지합니다.",
    descriptionEn: "Textbook 180° hemisphere coverage with balanced 50mm/85mm separation and clean lookroom.",
    actorA: { id: "ha-na", nameKo: "하나", nameEn: "Hana", position: { x: -1.8, z: -0.4 } },
    actorB: { id: "min-jae", nameKo: "민재", nameEn: "Minjae", position: { x: 1.8, z: 0.4 } },
    shots: [
      { shotId: "cafe-01-est", labelKo: "컷 1 · 카페 테이블 설정", labelEn: "Cut 1 · Establishing", cameraPosition: { x: -0.4, z: 4.1 }, focalLengthMm: 35 },
      { shotId: "cafe-02-hana", labelKo: "컷 2 · 하나 리액션", labelEn: "Cut 2 · Hana Medium", cameraPosition: { x: 2.3, z: 2.4 }, focalLengthMm: 50, targetActorId: "ha-na" },
      { shotId: "cafe-03-minjae", labelKo: "컷 3 · 민재 클로즈업", labelEn: "Cut 3 · Minjae Close-Up", cameraPosition: { x: -2.4, z: 2.1 }, focalLengthMm: 85, targetActorId: "min-jae" },
    ],
    defaultApertureFStop: 1.8, defaultFocusDistanceM: 2.4, defaultBackgroundDistanceM: 8.5,
    defaultComposition: { subjectFocalPoint: { x: 0.34, y: 0.33 }, headTopY: 0.12, gazeDirection: "right", shotScale: "medium", goldenSpiralCorner: "top-left" },
  },
  {
    sceneId: "alley-chase-wide",
    titleKo: "골목 24mm 광각 추격 액션",
    titleEn: "Alley 24mm Wide Action Chase",
    descriptionKo: "24mm 광각의 극적 원근 과장과 고속 전환 중 발생하는 축 넘침을 점검하는 액션 시퀀스입니다.",
    descriptionEn: "High-energy 24mm wide pursuit sequence auditing directional clarity and wide distortion.",
    actorA: { id: "runner", nameKo: "추격자", nameEn: "Pursuer", position: { x: -3.0, z: -1.0 } },
    actorB: { id: "target", nameKo: "도주자", nameEn: "Target", position: { x: 3.0, z: 1.0 } },
    shots: [
      { shotId: "chase-01-wide", labelKo: "컷 1 · 골목 광각 질주", labelEn: "Cut 1 · Wide Sprint", cameraPosition: { x: -1.1, z: 3.6 }, focalLengthMm: 24 },
      { shotId: "chase-02-flip", labelKo: "컷 2 · 반대측 로우앵글 (축 넘침!)", labelEn: "Cut 2 · Low Angle (Crossed!)", cameraPosition: { x: 1.6, z: -3.2 }, focalLengthMm: 24 },
      { shotId: "chase-03-tele", labelKo: "컷 3 · 135mm 망원 정면 압박", labelEn: "Cut 3 · 135mm Compression", cameraPosition: { x: 2.6, z: 3.5 }, focalLengthMm: 135 },
    ],
    defaultApertureFStop: 4.0, defaultFocusDistanceM: 3.8, defaultBackgroundDistanceM: 18.0,
    defaultComposition: { subjectFocalPoint: { x: 0.66, y: 0.35 }, headTopY: 0.16, gazeDirection: "left", shotScale: "wide", goldenSpiralCorner: "top-right" },
  },
];
