/**
 * 웹소설 → 동기화 스토리보드 디렉터 & 실시간 옴니버스 가상 스튜디오 프리셋 브리지.
 *
 * 100% 결정론적 · 무과금(₩0) 순수 계산 모듈이며 모든 조명 색상은 OKLCH 토큰으로만 표현한다.
 */

export type StoryboardDirectorStyle =
  | "cinematic-drama"
  | "action-shonen"
  | "romance-soft"
  | "noir-thriller";

export type StoryboardCameraFraming =
  | "high-angle"
  | "low-angle"
  | "over-shoulder"
  | "close-up"
  | "eye-level-wide"
  | "dutch-tilt";

export type RecommendedLensMm = 24 | 28 | 35 | 50 | 85;

export interface Vec3Meters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StoryboardLightingSpec {
  readonly moodLabelKo: string;
  readonly kelvin: number;
  readonly keyLightOklch: string;
  readonly fillLightOklch: string;
  readonly rimLightOklch: string;
  readonly contrastRatio: string;
  readonly exposureEv: number;
  readonly shadowSoftness: number;
}

export interface Storyboard3dCameraBlocking {
  readonly position: Vec3Meters;
  readonly target: Vec3Meters;
  readonly focalLengthMm: RecommendedLensMm;
  readonly fovDeg: number;
  readonly apertureFStop: number;
  readonly rollDeg: number;
  readonly dollySpeedMps: number;
}

export interface DirectedStoryboardShot {
  readonly shotId: string;
  readonly sceneNumber: number;
  readonly cutNumber: number;
  readonly beatTypeKo: string;
  readonly sourceExcerpt: string;
  readonly lensMm: RecommendedLensMm;
  readonly lensLabelKo: string;
  readonly framing: StoryboardCameraFraming;
  readonly framingLabelKo: string;
  readonly lighting: StoryboardLightingSpec;
  readonly camera3d: Storyboard3dCameraBlocking;
  readonly directionNoteKo: string;
}

export interface StoryboardDirectionPlan {
  readonly episodeLabel: string;
  readonly directorStyle: StoryboardDirectorStyle;
  readonly directorStyleLabelKo: string;
  readonly totalScenes: number;
  readonly totalCuts: number;
  readonly shots: readonly DirectedStoryboardShot[];
}

export interface OmnibusBlockingActorSlot {
  readonly slotId: string;
  readonly roleKo: string;
  readonly position: Vec3Meters;
  readonly facingDeg: number;
}

export interface OmnibusVirtualStudioPresetPayload {
  readonly protocolVersion: "toonstudio.omnibus.v1";
  readonly syncChannel: "toonstudio:omnibus-virtual-studio-preset";
  readonly presetId: string;
  readonly episodeLabel: string;
  readonly shotId: string;
  readonly sceneNumber: number;
  readonly cutNumber: number;
  readonly directorStyle: StoryboardDirectorStyle;
  readonly cameraRig: Storyboard3dCameraBlocking & {
    readonly framing: StoryboardCameraFraming;
    readonly framingLabelKo: string;
  };
  readonly lightingRig: StoryboardLightingSpec;
  readonly blockingActors: readonly OmnibusBlockingActorSlot[];
  readonly syncSequence: number;
}

export const OMNIBUS_VIRTUAL_STUDIO_EVENT = "toonstudio:omnibus-virtual-studio-preset";

export const DIRECTOR_STYLE_OPTIONS: readonly {
  readonly id: StoryboardDirectorStyle;
  readonly labelKo: string;
  readonly summaryKo: string;
}[] = [
  { id: "cinematic-drama", labelKo: "시네마틱 드라마", summaryKo: "35~85mm 균형 구도 · 부드러운 콘트라스트" },
  { id: "action-shonen", labelKo: "액션·역동 연출", summaryKo: "24~28mm 광각 로우앵글 · 강한 림라이트" },
  { id: "romance-soft", labelKo: "로맨스·감성 인물", summaryKo: "50~85mm 인물 망원 · 따뜻한 색온도" },
  { id: "noir-thriller", labelKo: "누아르·미스터리", summaryKo: "하이/더치 앵글 · 고대비 쿨 톤" },
];

export const DEFAULT_WEBNOVEL_SAMPLE = [
  "비 내리는 새벽, 젖은 아스팔트 위로 낡은 가로등 불빛이 길게 번졌다. 텅 빈 골목 끝에서 우체국 시계탑이 두 시를 알렸다.",
  "\"이 편지는 오늘 밤이 지나기 전에 반드시 전해야 합니다.\" 하윤은 빗물에 젖은 봉투를 쥔 채 떨리는 눈빛으로 상대를 바라보았다.",
  "그 순간 어둠 속에서 검은 코트를 입은 그림자가 튀어나와 가로막았고, 하윤은 재빨리 가방을 끌어안으며 뒤로 뛰어 물러났다!",
  "잠시 뒤 붉은 석양의 기억이 스쳐 지나갔다. 오래전 편지를 건네주던 할아버지의 따뜻한 미소가 촛불처럼 떠올랐다.",
].join("\n\n");

function deterministicFnv1aHex(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function lensVerticalFovDeg(lensMm: RecommendedLensMm): number {
  const sensorHeightMm = 24;
  const radians = 2 * Math.atan(sensorHeightMm / (2 * lensMm));
  return Math.round(((radians * 180) / Math.PI) * 10) / 10;
}

function lensLabelKo(lensMm: RecommendedLensMm): string {
  switch (lensMm) {
    case 24:
      return "24mm 초광각 (공간·역동)";
    case 28:
      return "28mm 광각 (현장감)";
    case 35:
      return "35mm 시네마 표준";
    case 50:
      return "50mm 인물·대화 표준";
    case 85:
      return "85mm 인물 망원 (감정 집중)";
  }
}

function framingLabelKo(framing: StoryboardCameraFraming): string {
  switch (framing) {
    case "high-angle":
      return "하이앵글 (부감)";
    case "low-angle":
      return "로우앵글 (앙각)";
    case "over-shoulder":
      return "오버숄더 (OTS)";
    case "close-up":
      return "클로즈업 (CU)";
    case "eye-level-wide":
      return "아이레벨 와이드";
    case "dutch-tilt":
      return "더치 틸트 (긴장 경사)";
  }
}

function detectLighting(paragraph: string, style: StoryboardDirectorStyle): StoryboardLightingSpec {
  if (/폭발|화염|불길|분노|피/u.test(paragraph)) {
    return {
      moodLabelKo: "크림슨 엠버 화염광",
      kelvin: 2600,
      keyLightOklch: "oklch(0.65 0.19 28)",
      fillLightOklch: "oklch(0.32 0.06 20)",
      rimLightOklch: "oklch(0.82 0.16 55)",
      contrastRatio: "6:1",
      exposureEv: -0.2,
      shadowSoftness: 0.25,
    };
  }
  if (/석양|노을|촛불|따뜻|미소|기억|벽난로/u.test(paragraph) || style === "romance-soft") {
    return {
      moodLabelKo: "골든 아워 웜 텅스텐",
      kelvin: 3200,
      keyLightOklch: "oklch(0.79 0.13 62)",
      fillLightOklch: "oklch(0.56 0.06 45)",
      rimLightOklch: "oklch(0.88 0.10 78)",
      contrastRatio: "2.5:1",
      exposureEv: 0.3,
      shadowSoftness: 0.72,
    };
  }
  if (/네온|사이버|번개|마법|전격|푸른빛/u.test(paragraph)) {
    return {
      moodLabelKo: "사이버 네온 림라이트",
      kelvin: 7600,
      keyLightOklch: "oklch(0.71 0.16 250)",
      fillLightOklch: "oklch(0.34 0.09 285)",
      rimLightOklch: "oklch(0.78 0.15 198)",
      contrastRatio: "5:1",
      exposureEv: -0.3,
      shadowSoftness: 0.35,
    };
  }
  if (/새벽|밤|비|빗물|어둠|그림자|가로등|달빛/u.test(paragraph) || style === "noir-thriller") {
    return {
      moodLabelKo: "새벽 문라이트 쿨 키",
      kelvin: 6500,
      keyLightOklch: "oklch(0.67 0.11 245)",
      fillLightOklch: "oklch(0.30 0.04 252)",
      rimLightOklch: "oklch(0.80 0.09 220)",
      contrastRatio: "4.5:1",
      exposureEv: -0.4,
      shadowSoftness: 0.42,
    };
  }
  return {
    moodLabelKo: "스튜디오 내추럴 데이라이트",
    kelvin: 5400,
    keyLightOklch: "oklch(0.86 0.04 95)",
    fillLightOklch: "oklch(0.64 0.03 220)",
    rimLightOklch: "oklch(0.92 0.03 90)",
    contrastRatio: "3:1",
    exposureEv: 0,
    shadowSoftness: 0.6,
  };
}

function buildCameraBlocking(
  framing: StoryboardCameraFraming,
  lensMm: RecommendedLensMm,
  cutIndex: number,
): Storyboard3dCameraBlocking {
  const fovDeg = lensVerticalFovDeg(lensMm);
  const s = cutIndex % 2 === 0 ? 1 : -1;
  switch (framing) {
    case "high-angle":
      return { position: { x: 0, y: 4.8, z: 6.2 }, target: { x: 0, y: 1.1, z: 0 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 5.6, rollDeg: 0, dollySpeedMps: 0.4 };
    case "low-angle":
      return { position: { x: s * 0.9, y: 0.65, z: 3.1 }, target: { x: 0, y: 1.65, z: 0 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 2.8, rollDeg: 0, dollySpeedMps: 1.4 };
    case "over-shoulder":
      return { position: { x: s * 0.72, y: 1.56, z: 2.05 }, target: { x: -s * 0.18, y: 1.54, z: -0.45 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 2.0, rollDeg: 0, dollySpeedMps: 0.15 };
    case "close-up":
      return { position: { x: s * 0.18, y: 1.62, z: 1.35 }, target: { x: 0, y: 1.6, z: 0 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 1.8, rollDeg: 0, dollySpeedMps: 0.1 };
    case "dutch-tilt":
      return { position: { x: s * 1.1, y: 1.35, z: 2.85 }, target: { x: 0, y: 1.5, z: 0 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 2.8, rollDeg: s * 11, dollySpeedMps: 0.9 };
    case "eye-level-wide":
      return { position: { x: 0, y: 1.55, z: 5.4 }, target: { x: 0, y: 1.4, z: 0 }, focalLengthMm: lensMm, fovDeg, apertureFStop: 4.0, rollDeg: 0, dollySpeedMps: 0.35 };
  }
}

export function directNovelToStoryboard(input: {
  readonly episodeLabel: string;
  readonly novelText: string;
  readonly directorStyle: StoryboardDirectorStyle;
}): StoryboardDirectionPlan {
  const styleOption =
    DIRECTOR_STYLE_OPTIONS.find((item) => item.id === input.directorStyle) ??
    DIRECTOR_STYLE_OPTIONS[0];
  const paragraphs = input.novelText
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const normalizedParagraphs =
    paragraphs.length > 0
      ? paragraphs
      : ["빈 원고입니다. 웹소설 문단을 입력하면 씬과 컷별 카메라·조명 프리셋을 산출합니다."];

  let sceneNumber = 1;
  const shots: DirectedStoryboardShot[] = normalizedParagraphs.map((paragraph, index) => {
    const isAction = /튀어나|뛰어|부딪|검|폭발|공격|질주|충격|가로막|!/u.test(paragraph);
    const isDialogue = /["“”'‘’]|말했|속삭|물었|대답|외쳤/u.test(paragraph);
    const isEmotion = /눈물|미소|눈빛|표정|떨리|기억|바라보|숨을/u.test(paragraph);
    const isEstablishing = /골목|거리|하늘|도시|새벽|시계탑|광장|성|숲|창밖|아스팔트|건물/u.test(paragraph);

    if (index > 0 && (isEstablishing || /잠시 뒤|다음 날|그때|한편/u.test(paragraph))) {
      sceneNumber += 1;
    }

    let lensMm: RecommendedLensMm;
    let framing: StoryboardCameraFraming;
    let beatTypeKo: string;
    let directionNoteKo: string;

    if (isAction) {
      lensMm = input.directorStyle === "action-shonen" ? 24 : 28;
      framing = input.directorStyle === "noir-thriller" ? "dutch-tilt" : "low-angle";
      beatTypeKo = "액션·충돌 비트";
      directionNoteKo = "광각 원근 왜곡과 로우앵글로 움직임 속도와 위압감을 강조합니다.";
    } else if (isDialogue) {
      lensMm = input.directorStyle === "romance-soft" ? 85 : 50;
      framing = "over-shoulder";
      beatTypeKo = "대사·시선 교차 비트";
      directionNoteKo = "어깨 너머 시선축을 고정하고 얕은 심도로 화자의 대사 몰입도를 높입니다.";
    } else if (isEmotion) {
      lensMm = 85;
      framing = "close-up";
      beatTypeKo = "감정 클로즈업 비트";
      directionNoteKo = "85mm 인물 망원 압축과 f/1.8 보케로 미세한 표정과 눈빛 변화를 포착합니다.";
    } else if (isEstablishing || index === 0) {
      lensMm = 24;
      framing = "high-angle";
      beatTypeKo = "공간 확립(Establishing) 비트";
      directionNoteKo = "24mm 광각 하이앵글로 공간 규모와 시간대 분위기를 한 컷에 제시합니다.";
    } else {
      lensMm = 35;
      framing = "eye-level-wide";
      beatTypeKo = "서사 전개 비트";
      directionNoteKo = "35mm 시네마 표준 화각으로 인물 동선과 주변 배경을 균형 있게 연결합니다.";
    }

    const lighting = detectLighting(paragraph, input.directorStyle);
    const camera3d = buildCameraBlocking(framing, lensMm, index);
    const cutNumber = index + 1;

    return {
      shotId: `S${String(sceneNumber).padStart(2, "0")}-C${String(cutNumber).padStart(2, "0")}`,
      sceneNumber,
      cutNumber,
      beatTypeKo,
      sourceExcerpt: paragraph.length > 96 ? `${paragraph.slice(0, 95)}…` : paragraph,
      lensMm,
      lensLabelKo: lensLabelKo(lensMm),
      framing,
      framingLabelKo: framingLabelKo(framing),
      lighting,
      camera3d,
      directionNoteKo,
    };
  });

  return {
    episodeLabel: input.episodeLabel.trim() || "12화",
    directorStyle: input.directorStyle,
    directorStyleLabelKo: styleOption.labelKo,
    totalScenes: sceneNumber,
    totalCuts: shots.length,
    shots,
  };
}

export function buildOmnibusVirtualStudioPreset(params: {
  readonly episodeLabel: string;
  readonly directorStyle: StoryboardDirectorStyle;
  readonly shot: DirectedStoryboardShot;
  readonly syncSequence: number;
}): OmnibusVirtualStudioPresetPayload {
  const { episodeLabel, directorStyle, shot, syncSequence } = params;
  const presetHash = deterministicFnv1aHex(
    `${episodeLabel}|${directorStyle}|${shot.shotId}|${shot.lensMm}|${shot.lighting.kelvin}`,
  ).slice(0, 6);

  const blockingActors: OmnibusBlockingActorSlot[] =
    shot.framing === "over-shoulder"
      ? [
          { slotId: "actor-lead", roleKo: "주연 화자", position: { x: -0.25, y: 0, z: -0.5 }, facingDeg: 15 },
          { slotId: "actor-counter", roleKo: "상대 인물 (전경 어깨)", position: { x: 0.45, y: 0, z: 1.15 }, facingDeg: 195 },
        ]
      : shot.framing === "low-angle" || shot.framing === "dutch-tilt"
        ? [
            { slotId: "actor-lead", roleKo: "주연 (방어/회피)", position: { x: -0.6, y: 0, z: 0.3 }, facingDeg: 35 },
            { slotId: "actor-rival", roleKo: "대치 상대", position: { x: 0.9, y: 0, z: -0.9 }, facingDeg: 215 },
          ]
        : [{ slotId: "actor-lead", roleKo: "주연 인물", position: { x: 0, y: 0, z: 0 }, facingDeg: 0 }];

  return {
    protocolVersion: "toonstudio.omnibus.v1",
    syncChannel: OMNIBUS_VIRTUAL_STUDIO_EVENT,
    presetId: `omni-${shot.shotId.toLowerCase()}-${presetHash.toLowerCase()}`,
    episodeLabel: episodeLabel.trim() || "12화",
    shotId: shot.shotId,
    sceneNumber: shot.sceneNumber,
    cutNumber: shot.cutNumber,
    directorStyle,
    cameraRig: {
      ...shot.camera3d,
      framing: shot.framing,
      framingLabelKo: shot.framingLabelKo,
    },
    lightingRig: shot.lighting,
    blockingActors,
    syncSequence,
  };
}

export function dispatchOmnibusStudioPreset(
  payload: OmnibusVirtualStudioPresetPayload,
): { readonly dispatched: boolean; readonly payload: OmnibusVirtualStudioPresetPayload } {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    const event = new CustomEvent<OmnibusVirtualStudioPresetPayload>(OMNIBUS_VIRTUAL_STUDIO_EVENT, {
      detail: payload,
    });
    window.dispatchEvent(event);
    return { dispatched: true, payload };
  }
  return { dispatched: false, payload };
}
