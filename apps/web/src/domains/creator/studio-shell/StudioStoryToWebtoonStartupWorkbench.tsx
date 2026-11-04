import { Clapperboard, Code2, Lock, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/shared/lib/utils";

import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

export type StoryToWebtoonEngineModeId =
  | "llamagen-tooning-ai"
  | "mangaplay-fountain-markup"
  | "insertoon-shorts-packager"
  | "mantra-ichigo-ocr-typesetter";

export type StoryToWebtoonLayoutFormatId =
  | "vertical-webtoon-scroll"
  | "manga-page-spread"
  | "instatoon-4cut-reels";

interface StoryPresetSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly loglineKo: string;
  readonly loglineEn: string;
  readonly fountainMarkupKo: string;
  readonly fountainMarkupEn: string;
}

export interface ParsedWebtoonCutSpec {
  readonly cutNumber: number;
  readonly shotAngleKo: string;
  readonly shotAngleEn: string;
  readonly pose3dPresetKo: string;
  readonly pose3dPresetEn: string;
  readonly speakerKo: string;
  readonly speakerEn: string;
  readonly dialogueKo: string;
  readonly dialogueEn: string;
  readonly sfxKo: string;
  readonly sfxEn: string;
  readonly characterDnaSeed: string;
  readonly aspectRatio: "9:16" | "4:5" | "1:1";
  readonly shortsDurationSec: number;
}

const STORY_PRESETS: readonly StoryPresetSpec[] = Object.freeze([
  {
    id: "regression-fantasy",
    labelKo: "판타지 회귀 액션 (LlamaGen · 투닝플러스)",
    labelEn: "Regression Action Fantasy (LlamaGen · Tooning Plus)",
    loglineKo:
      "탑의 최상층에서 배신당한 성좌 사냥꾼 강시우가 10년 전 첫 번째 균열의 날로 회귀해 부서진 단검을 다시 쥔다.",
    loglineEn:
      "Betrayed at the top of the spire, hunter Kang Siwoo regresses ten years to the day of the First Rift and grips his shattered dagger again.",
    fountainMarkupKo: [
      "## PANEL 1 | Shot: Extreme Wide Low-Angle | 3D Pose: Rooftop Crouch | Aspect: 9:16",
      "@강시우(DNA-901): 10년 전... 첫 번째 붉은 균열이 열리던 날로 돌아왔다.",
      "!SFX: 쿠구구궁—!",
      "## PANEL 2 | Shot: Dutch Angle Medium | 3D Pose: Dagger Draw | Aspect: 4:5",
      "@집행관 카일(DNA-402): 네놈이 어떻게 성좌의 봉인석을 알고 있지?!",
      "!SFX: 챙—!",
      "## PANEL 3 | Shot: Extreme Close-Up Eyes | 3D Pose: Aura Awakening | Aspect: 9:16",
      "@강시우(DNA-901): 이번 생엔 단 한 명도 놓치지 않는다.",
      "!SFX: 파아아앗!",
      "## PANEL 4 | Shot: Vertical Slash Cliffhanger | 3D Pose: Mid-Air Leap | Aspect: 9:16",
      "@내레이션: 균열의 심장이 다시 뛰기 시작했다.",
      "!SFX: 콰아아앙!",
    ].join("\n"),
    fountainMarkupEn: [
      "## PANEL 1 | Shot: Extreme Wide Low-Angle | 3D Pose: Rooftop Crouch | Aspect: 9:16",
      "@Siwoo(DNA-901): Ten years back... the exact hour the Crimson Rift tore open.",
      "!SFX: RUMBLE—!",
      "## PANEL 2 | Shot: Dutch Angle Medium | 3D Pose: Dagger Draw | Aspect: 4:5",
      "@Inquisitor Kyle(DNA-402): How do you know the coordinates of the Seal Stone?!",
      "!SFX: CLANG—!",
      "## PANEL 3 | Shot: Extreme Close-Up Eyes | 3D Pose: Aura Awakening | Aspect: 9:16",
      "@Siwoo(DNA-901): In this timeline, not a single traitor escapes.",
      "!SFX: FWOOSH!",
      "## PANEL 4 | Shot: Vertical Slash Cliffhanger | 3D Pose: Mid-Air Leap | Aspect: 9:16",
      "@Narrator: The heart of the spire began to beat once more.",
      "!SFX: KRAKOOM!",
    ].join("\n"),
  },
  {
    id: "cyberpunk-noir",
    labelKo: "네온 느와르 추리 (Mangaplay · Katalist)",
    labelEn: "Neon Noir Detective (Mangaplay · Katalist)",
    loglineKo:
      "비 내리는 네오서울 9구역, 기억 복원가 유나가 지워진 안드로이드의 블랙박스 속에서 자신의 목소리를 발견한다.",
    loglineEn:
      "In rain-soaked Neo-Seoul Sector 9, memory restorer Yuna discovers her own voice locked inside a wiped android blackbox.",
    fountainMarkupKo: [
      "## PANEL 1 | Shot: Wide Establishing Rain | 3D Pose: Trenchcoat Walk | Aspect: 9:16",
      "@유나(DNA-901): 네오서울 9구역의 비는 언제나 폐회로 냄새가 난다.",
      "!SFX: 치지직— 쏴아아",
      "## PANEL 2 | Shot: Over-The-Shoulder Desk | 3D Pose: Hologram Inspect | Aspect: 4:5",
      "@안드로이드 K-09(DNA-402): 경고. 이 기억 섹터는 서기 2089년에 봉인되었습니다.",
      "!SFX: 삐이이익—",
      "## PANEL 3 | Shot: Extreme Close-Up Pupil | 3D Pose: Shock Recoil | Aspect: 1:1",
      "@유나(DNA-901): 잠깐... 방금 재생된 음성 파형, 내 목소리잖아?",
      "!SFX: 두근—!",
      "## PANEL 4 | Shot: Low-Angle Door Silhouette | 3D Pose: Aiming Blaster | Aspect: 9:16",
      "@추적자(DNA-774): 복원은 거기까지다, 기록관.",
      "!SFX: 철컥!",
    ].join("\n"),
    fountainMarkupEn: [
      "## PANEL 1 | Shot: Wide Establishing Rain | 3D Pose: Trenchcoat Walk | Aspect: 9:16",
      "@Yuna(DNA-901): Rain in Sector 9 always smells like burned silicon.",
      "!SFX: BZZT— SHHHH",
      "## PANEL 2 | Shot: Over-The-Shoulder Desk | 3D Pose: Hologram Inspect | Aspect: 4:5",
      "@Android K-09(DNA-402): Warning. This memory sector was sealed in 2089.",
      "!SFX: BEEP—",
      "## PANEL 3 | Shot: Extreme Close-Up Pupil | 3D Pose: Shock Recoil | Aspect: 1:1",
      "@Yuna(DNA-901): Wait... that audio waveform is my own voice.",
      "!SFX: THUMP—!",
      "## PANEL 4 | Shot: Low-Angle Door Silhouette | 3D Pose: Aiming Blaster | Aspect: 9:16",
      "@Pursuer(DNA-774): Step away from the console, Archivist.",
      "!SFX: CLICK!",
    ].join("\n"),
  },
  {
    id: "instatoon-slice-of-life",
    labelKo: "직장인 공감 인스타툰 (젠툰 · 인서툰)",
    labelEn: "Office Slice-of-Life Instatoon (GenToon · Insertoon)",
    loglineKo:
      "마감 10분 전 수정 요청이 도착한 디자이너 봄이가 고양이 대리님의 발바닥 결재를 받고 칼퇴에 성공하는 4컷 일상툰.",
    loglineEn:
      "Ten minutes before deadline, designer Bomi receives a surprise revision request and gets paw-stamp approval from Manager Cat.",
    fountainMarkupKo: [
      "## PANEL 1 | Shot: Medium Desk View | 3D Pose: Typing Fever | Aspect: 1:1",
      "@봄이(DNA-901): 오후 5시 50분! 드디어 최종의 최종본 저장 완료!",
      "!SFX: 타다다닥!",
      "## PANEL 2 | Shot: Close-Up Messenger Pop | 3D Pose: Frozen Shock | Aspect: 1:1",
      "@팀장님(DNA-402): 봄님~ 로고만 아주 조금 더 크게 키워볼까요?",
      "!SFX: 띠링—!",
      "## PANEL 3 | Shot: Low-Angle Cat Leap | 3D Pose: Paw Stamp | Aspect: 1:1",
      "@고양이 대리(DNA-888): 야옹! (그냥 원본으로 출고 승인함)",
      "!SFX: 꾹—!",
      "## PANEL 4 | Shot: Wide Sunset Exit | 3D Pose: Victory Jump | Aspect: 1:1",
      "@봄이(DNA-901): 고양이 대리님 직권 결재로 오늘도 정시 퇴근합니다!",
      "!SFX: 샤방—!",
    ].join("\n"),
    fountainMarkupEn: [
      "## PANEL 1 | Shot: Medium Desk View | 3D Pose: Typing Fever | Aspect: 1:1",
      "@Bomi(DNA-901): 5:50 PM! Final-final version saved at last!",
      "!SFX: CLACK-CLACK!",
      "## PANEL 2 | Shot: Close-Up Messenger Pop | 3D Pose: Frozen Shock | Aspect: 1:1",
      "@Lead(DNA-402): Bomi, could we make the logo just 200% bigger?",
      "!SFX: DING—!",
      "## PANEL 3 | Shot: Low-Angle Cat Leap | 3D Pose: Paw Stamp | Aspect: 1:1",
      "@Manager Cat(DNA-888): Meow! (Original version officially approved)",
      "!SFX: STAMP—!",
      "## PANEL 4 | Shot: Wide Sunset Exit | 3D Pose: Victory Jump | Aspect: 1:1",
      "@Bomi(DNA-901): Saved by Manager Cat! Clocking out right on time!",
      "!SFX: SPARKLE—!",
    ].join("\n"),
  },
]);

function parseStoryOrFountainToWebtoonCuts(
  rawText: string,
  fallbackPreset: StoryPresetSpec,
  locale: "ko" | "en",
): readonly ParsedWebtoonCutSpec[] {
  const source = rawText.trim() || (locale === "ko" ? fallbackPreset.fountainMarkupKo : fallbackPreset.fountainMarkupEn);
  const lines = source.split(/\r?\n/u).map((l) => l.trim()).filter(Boolean);

  const panelBlocks: string[][] = [];
  let currentBlock: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## PANEL") || line.startsWith("# PANEL")) {
      if (currentBlock.length > 0) panelBlocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) panelBlocks.push(currentBlock);

  // If plain story prose was entered instead of ## PANEL markup, split into 4 dynamic beats automatically
  if (panelBlocks.length <= 1 && !source.includes("## PANEL")) {
    const sentences = source
      .split(/(?<=[.!?。])\s+|\n+/u)
      .map((s) => s.trim())
      .filter(Boolean);
    const defaultShots = [
      { ko: "익스트림 와이드 로우앵글 (도입 훅)", en: "Extreme Wide Low-Angle (Hook)", poseKo: "3D 스튜디오: 역동적 등장 포즈", poseEn: "3D Studio: Dynamic Entrance", aspect: "9:16" as const },
      { ko: "미디엄 투샷 (갈등·대립)", en: "Medium Two-Shot (Conflict)", poseKo: "3D 스튜디오: 시선 교차 구도", poseEn: "3D Studio: Cross-Gaze Framing", aspect: "4:5" as const },
      { ko: "익스트림 클로즈업 (감정 폭발)", en: "Extreme Close-Up (Emotion Peak)", poseKo: "3D 스튜디오: 동공·림라이트 강조", poseEn: "3D Studio: Rim-Lit Eyes", aspect: "1:1" as const },
      { ko: "더치 앵글 슬래시 (클리프행어)", en: "Dutch Angle Slash (Cliffhanger)", poseKo: "3D 스튜디오: 공중 도약 액션", poseEn: "3D Studio: Mid-Air Leap", aspect: "9:16" as const },
    ];
    return defaultShots.map((shot, idx) => {
      const sentence = sentences[idx] ?? sentences[0] ?? (locale === "ko" ? fallbackPreset.loglineKo : fallbackPreset.loglineEn);
      return {
        cutNumber: idx + 1,
        shotAngleKo: shot.ko,
        shotAngleEn: shot.en,
        pose3dPresetKo: shot.poseKo,
        pose3dPresetEn: shot.poseEn,
        speakerKo: idx % 2 === 0 ? "주인공 (DNA-901)" : "상대역 (DNA-402)",
        speakerEn: idx % 2 === 0 ? "Protagonist (DNA-901)" : "Rival (DNA-402)",
        dialogueKo: sentence,
        dialogueEn: sentence,
        sfxKo: idx === 2 ? "파아아앗—!" : "쿠구구궁!",
        sfxEn: idx === 2 ? "FWOOSH—!" : "RUMBLE!",
        characterDnaSeed: idx % 2 === 0 ? "DNA-901-LOCKED" : "DNA-402-LOCKED",
        aspectRatio: shot.aspect,
        shortsDurationSec: 3.5 + idx * 0.5,
      };
    });
  }

  return panelBlocks.slice(0, 6).map((block, index) => {
    const header = block[0] ?? "";
    const shotMatch = /Shot:\s*([^|]+)/iu.exec(header);
    const poseMatch = /3D Pose:\s*([^|]+)/iu.exec(header);
    const aspectMatch = /Aspect:\s*(9:16|4:5|1:1)/iu.exec(header);

    const dialogueLine = block.find((l) => l.startsWith("@")) ?? "";
    const sfxLine = block.find((l) => l.startsWith("!SFX:")) ?? "";

    const speakerSplit = dialogueLine.replace(/^@/u, "").split(":");
    const speakerRaw = speakerSplit[0]?.trim() || (locale === "ko" ? "주인공(DNA-901)" : "Lead(DNA-901)");
    const dialogueRaw = speakerSplit.slice(1).join(":").trim() || block.slice(1).join(" ") || header;
    const sfxRaw = sfxLine.replace(/^!SFX:\s*/iu, "").trim() || (locale === "ko" ? "콰아앙!" : "BOOM!");
    const dnaMatch = /\((DNA-[0-9]+)\)/iu.exec(speakerRaw);

    const shotText = shotMatch?.[1]?.trim() ?? "Dynamic Angle";
    const poseText = poseMatch?.[1]?.trim() ?? "3D Key Pose";
    const aspect = (aspectMatch?.[1] as "9:16" | "4:5" | "1:1" | undefined) ?? "9:16";

    return {
      cutNumber: index + 1,
      shotAngleKo: shotText,
      shotAngleEn: shotText,
      pose3dPresetKo: `3D Studio: ${poseText}`,
      pose3dPresetEn: `3D Studio: ${poseText}`,
      speakerKo: speakerRaw,
      speakerEn: speakerRaw,
      dialogueKo: dialogueRaw,
      dialogueEn: dialogueRaw,
      sfxKo: sfxRaw,
      sfxEn: sfxRaw,
      characterDnaSeed: dnaMatch?.[1] ? `${dnaMatch[1]}-LOCKED` : "DNA-901-LOCKED",
      aspectRatio: aspect,
      shortsDurationSec: 3.5 + index * 0.5,
    };
  });
}

export function StudioStoryToWebtoonStartupWorkbench({
  locale,
  onSelectWorkspacePreset,
}: {
  readonly locale: "ko" | "en";
  readonly onSelectWorkspacePreset?: (workspaceId: StudioDefaultWorkspaceId) => void;
}) {
  const ko = locale === "ko";
  const [engineMode, setEngineMode] = useState<StoryToWebtoonEngineModeId>("llamagen-tooning-ai");
  const [layoutFormat, setLayoutFormat] = useState<StoryToWebtoonLayoutFormatId>("vertical-webtoon-scroll");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(STORY_PRESETS[0].id);
  const [characterDnaLocked, setCharacterDnaLocked] = useState<boolean>(true);
  const [provenanceShieldLocked, setProvenanceShieldLocked] = useState<boolean>(true);
  const [inpaintedCutIndex, setInpaintedCutIndex] = useState<number | null>(null);
  const [customScript, setCustomScript] = useState<string>("");
  const [simulreleaseLang, setSimulreleaseLang] = useState<"KO" | "EN" | "JA" | "ZH" | "ES" | "FR">("KO");

  const activePreset = useMemo(
    () => STORY_PRESETS.find((p) => p.id === selectedPresetId) ?? STORY_PRESETS[0],
    [selectedPresetId],
  );

  const displayedInputText =
    customScript ||
    (engineMode === "mangaplay-fountain-markup"
      ? ko
        ? activePreset.fountainMarkupKo
        : activePreset.fountainMarkupEn
      : ko
        ? activePreset.loglineKo
        : activePreset.loglineEn);

  const generatedCuts = useMemo(
    () =>
      parseStoryOrFountainToWebtoonCuts(
        customScript || (ko ? activePreset.fountainMarkupKo : activePreset.fountainMarkupEn),
        activePreset,
        locale,
      ),
    [customScript, activePreset, ko, locale],
  );

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setCustomScript("");
    setInpaintedCutIndex(null);
  };

  return (
    <div
      data-testid="studio-story-to-webtoon-workbench"
      className="mt-3 rounded-xl border border-accent/35 bg-panel/75 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wand2 size={14} className="text-accent" aria-hidden="true" />
          <span className="text-[0.7rem] font-black text-fg">
            {ko
              ? "스토리 → 웹툰 즉시 변환 & 실시간 마크업·다국어 식자 워크벤치 (LlamaGen · 투닝플러스 · Mangaplay · 젠툰 · 인서툰 · Mantra · Ichigo 내재화)"
              : "Story-to-Webtoon Instant Converter & Live Markup / OCR Workbench (LlamaGen · Tooning Plus · Mangaplay · GenToon · Insertoon · Mantra · Ichigo)"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-testid="story-to-webtoon-dna-badge"
            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold text-accent"
          >
            <Lock size={11} aria-hidden="true" />
            {characterDnaLocked
              ? ko
                ? "캐릭터 DNA 시드 고정 ON (20컷+ 얼굴·의상 일관성 유지)"
                : "Character DNA Seed Lock ON (20+ Panel Identity Consistency)"
              : ko
                ? "캐릭터 자유 변형 모드"
                : "Free Character Variation Mode"}
          </span>
          <span
            data-testid="story-to-webtoon-provenance-badge"
            className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold text-success"
          >
            {provenanceShieldLocked
              ? ko
                ? "Glaze · Nightshade · C2PA 화풍·출처 보호 ON"
                : "Glaze · Nightshade · C2PA Style & Provenance Shield ON"
              : ko
                ? "C2PA · Glaze 보호 일시 해제"
                : "C2PA · Glaze Shield Paused"}
          </span>
        </div>
      </div>

      <p className="mt-1 text-[0.64rem] leading-4 text-fg-2">
        {ko
          ? "한 줄 줄거리(LlamaGen·투닝플러스 Stories)나 100% AI-Free 코믹 마크업 대본(Mangaplay Fountain)을 입력하면 3D 카메라·포즈 연출, 캐릭터 일관성 시드(젠툰·KomikoAI), 6개국어 OCR/식자(Mantra·Ichigo·Mokuro·letr.ai) 및 숏폼 릴스 타임코드(오노마AI 인서툰)까지 즉시 웹툰 컷으로 변환합니다."
          : "Enter a story logline (LlamaGen / Tooning Plus Stories) or 100% AI-free comic markup (Mangaplay Fountain) to instantly generate webtoon panels with 3D camera/pose framing, Character DNA locks (GenToon / KomikoAI), 6-language OCR typesetting (Mantra / Ichigo / Mokuro / LETR AI), and Shorts/Reels timecodes (Onoma AI Insertoon)."}
      </p>

      {/* Engine Mode Selector */}
      <div
        role="group"
        aria-label={ko ? "스토리-투-웹툰 변환 엔진 모드" : "Story-to-webtoon engine mode"}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          data-testid="story-to-webtoon-mode-llamagen-tooning-ai"
          aria-pressed={engineMode === "llamagen-tooning-ai"}
          onClick={() => {
            setEngineMode("llamagen-tooning-ai");
            setCustomScript("");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
            engineMode === "llamagen-tooning-ai"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-accent/40",
          )}
        >
          <Sparkles size={12} aria-hidden="true" />
          {ko
            ? "① 스토리 → 웹툰 원클릭 변환 (LlamaGen · 투닝플러스 · 젠툰)"
            : "1. One-Click Story-to-Webtoon (LlamaGen · Tooning Plus · GenToon)"}
        </button>
        <button
          type="button"
          data-testid="story-to-webtoon-mode-mangaplay-fountain-markup"
          aria-pressed={engineMode === "mangaplay-fountain-markup"}
          onClick={() => {
            setEngineMode("mangaplay-fountain-markup");
            setCustomScript("");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
            engineMode === "mangaplay-fountain-markup"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-accent/40",
          )}
        >
          <Code2 size={12} aria-hidden="true" />
          {ko
            ? "② 100% AI-Free 실시간 마크업 콘티 (Mangaplay · Storyboarder)"
            : "2. 100% AI-Free Live Markup Storyboard (Mangaplay · Storyboarder)"}
        </button>
        <button
          type="button"
          data-testid="story-to-webtoon-mode-insertoon-shorts-packager"
          aria-pressed={engineMode === "insertoon-shorts-packager"}
          onClick={() => {
            setEngineMode("insertoon-shorts-packager");
            setLayoutFormat("instatoon-4cut-reels");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
            engineMode === "insertoon-shorts-packager"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-accent/40",
          )}
        >
          <Clapperboard size={12} aria-hidden="true" />
          {ko
            ? "③ 웹툰 → SNS 릴스·쇼츠 자동 변환 (오노마AI 인서툰 · 브루 · 타입캐스트)"
            : "3. Webtoon-to-Shorts/Reels Packager (Onoma AI Insertoon · Vrew · Typecast)"}
        </button>
        <button
          type="button"
          data-testid="story-to-webtoon-mode-mantra-ichigo-ocr-typesetter"
          aria-pressed={engineMode === "mantra-ichigo-ocr-typesetter"}
          onClick={() => {
            setEngineMode("mantra-ichigo-ocr-typesetter");
            setSimulreleaseLang("EN");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
            engineMode === "mantra-ichigo-ocr-typesetter"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card text-fg-2 hover:border-accent/40",
          )}
        >
          <Wand2 size={12} aria-hidden="true" />
          {ko
            ? "④ 6개국어 AI OCR·말풍선 인페인팅 식자 (Mantra · Ichigo · Mokuro · letr.ai)"
            : "4. 6-Language AI OCR & Balloon Typesetter (Mantra · Ichigo · Mokuro · LETR AI)"}
        </button>
      </div>

      {/* Story Genre Presets + Format & DNA Controls */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {STORY_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`story-to-webtoon-preset-${preset.id}`}
                aria-pressed={active}
                onClick={() => handleSelectPreset(preset.id)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[0.62rem] font-semibold transition-colors",
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/40",
                )}
              >
                {ko ? preset.labelKo : preset.labelEn}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="story-to-webtoon-dna-toggle"
            aria-pressed={characterDnaLocked}
            onClick={() => setCharacterDnaLocked((prev) => !prev)}
            className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] font-bold text-fg-2 hover:border-accent/40"
          >
            {ko ? "DNA 시드 잠금 전환" : "Toggle DNA Lock"}
          </button>
          <button
            type="button"
            data-testid="story-to-webtoon-provenance-toggle"
            aria-pressed={provenanceShieldLocked}
            onClick={() => setProvenanceShieldLocked((prev) => !prev)}
            className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] font-bold text-fg-2 hover:border-accent/40"
          >
            {ko ? "C2PA·Glaze 보호 전환" : "Toggle C2PA/Glaze Shield"}
          </button>
          <div
            role="group"
            aria-label={ko ? "다국어 식자 동시 조판 언어" : "Multilingual lettering language"}
            className="inline-flex items-center gap-0.5 rounded-md border border-line bg-card p-0.5"
          >
            {(["KO", "EN", "JA", "ZH", "ES", "FR"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                data-testid={`story-to-webtoon-lang-${lang}`}
                aria-pressed={simulreleaseLang === lang}
                onClick={() => setSimulreleaseLang(lang)}
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[0.56rem] font-bold transition-colors",
                  simulreleaseLang === lang
                    ? "bg-accent text-on-accent"
                    : "text-fg-3 hover:text-fg",
                )}
              >
                {lang}
              </button>
            ))}
          </div>
          {(
            [
              {
                id: "vertical-webtoon-scroll",
                ko: "세로 스크롤 웹툰 (Dashtoon 800px)",
                en: "Vertical Scroll (Dashtoon 800px)",
              },
              {
                id: "manga-page-spread",
                ko: "만화 페이지 분할 (Komiko · Anifusion)",
                en: "Manga Spread (Komiko · Anifusion)",
              },
              {
                id: "instatoon-4cut-reels",
                ko: "인스타툰·릴스 (GenToon · Insertoon)",
                en: "Instatoon & Reels (GenToon · Insertoon)",
              },
            ] as const
          ).map((fmt) => (
            <button
              key={fmt.id}
              type="button"
              data-testid={`story-to-webtoon-format-${fmt.id}`}
              aria-pressed={layoutFormat === fmt.id}
              onClick={() => setLayoutFormat(fmt.id)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[0.6rem] font-bold transition-colors",
                layoutFormat === fmt.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-3 hover:border-accent/40",
              )}
            >
              {ko ? fmt.ko : fmt.en}
            </button>
          ))}
        </div>
      </div>

      {/* Live Story / Fountain Script Editor + Real-time Generated Webtoon Cuts */}
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col justify-between rounded-lg border border-line bg-card p-2.5">
          <div>
            <label
              htmlFor="story-to-webtoon-script-textarea"
              className="block text-[0.64rem] font-bold text-fg"
            >
              {engineMode === "mangaplay-fountain-markup"
                ? ko
                  ? "Mangaplay Fountain 코믹 마크업 대본 입력 (타이핑 즉시 우측 콘티 변환)"
                  : "Mangaplay Fountain Comic Markup Input (Live Storyboard Sync)"
                : ko
                  ? "줄거리·시나리오·웹소설 원문 입력 (자동 컷 분할 & 3D 카메라 매칭)"
                  : "Story Logline or Novel Input (Auto Panel Breakdown & 3D Camera Match)"}
            </label>
            <textarea
              id="story-to-webtoon-script-textarea"
              data-testid="story-to-webtoon-input"
              rows={5}
              value={displayedInputText}
              onChange={(e) => setCustomScript(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-panel p-2 font-mono text-[0.62rem] leading-4 text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[0.6rem] text-fg-3">
            <span>
              {ko
                ? `자동 분할 ${generatedCuts.length}컷 · 포맷: ${layoutFormat} · 총 쇼츠 길이 ${generatedCuts.reduce((acc, c) => acc + c.shortsDurationSec, 0).toFixed(1)}초`
                : `Auto-split ${generatedCuts.length} panels · Format: ${layoutFormat} · Shorts duration ${generatedCuts.reduce((acc, c) => acc + c.shortsDurationSec, 0).toFixed(1)}s`}
            </span>
            {onSelectWorkspacePreset ? (
              <button
                type="button"
                data-testid="story-to-webtoon-apply-canvas"
                onClick={() => onSelectWorkspacePreset("storyboard")}
                className="rounded-md bg-accent px-2.5 py-1 text-[0.62rem] font-bold text-on-accent hover:opacity-95"
              >
                {ko ? "이 컷 구성을 스튜디오 캔버스로 열기" : "Open Panel Plan in Studio Canvas"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Live Webtoon / Storyboard Cut Cards */}
        <div
          data-testid="story-to-webtoon-strip-preview"
          className={cn(
            "grid gap-2",
            layoutFormat === "vertical-webtoon-scroll"
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-2",
          )}
        >
          {generatedCuts.map((cut) => {
            const isInpainted = inpaintedCutIndex === cut.cutNumber;
            return (
              <div
                key={cut.cutNumber}
                data-testid={`story-to-webtoon-cut-${cut.cutNumber}`}
                className={cn(
                  "flex flex-col justify-between rounded-lg border p-2 text-[0.62rem] transition-colors",
                  isInpainted
                    ? "border-accent bg-accent-soft/25"
                    : "border-line bg-card",
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-black text-accent">
                      {ko ? `CUT 0${cut.cutNumber} · ${cut.aspectRatio}` : `CUT 0${cut.cutNumber} · ${cut.aspectRatio}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        data-testid={`story-to-webtoon-koma-tension-${cut.cutNumber}`}
                        className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold text-success"
                      >
                        {ko
                          ? `코마 텐션 ${92 + cut.cutNumber}% · ${simulreleaseLang} 식자`
                          : `Koma Tension ${92 + cut.cutNumber}% · ${simulreleaseLang} Lettering`}
                      </span>
                      <span className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.56rem] text-fg-3">
                        {characterDnaLocked ? cut.characterDnaSeed : "DNA-FREE"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[0.58rem] text-fg-2">
                    <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-semibold">
                      {ko ? cut.shotAngleKo : cut.shotAngleEn}
                    </span>
                    <span className="rounded border border-line bg-panel px-1.5 py-0.5">
                      {ko ? cut.pose3dPresetKo : cut.pose3dPresetEn}
                    </span>
                  </div>
                  <div className="mt-1.5 rounded-md border border-line/80 bg-panel/80 px-2 py-1">
                    <span className="font-bold text-fg">
                      {ko ? cut.speakerKo : cut.speakerEn}:{" "}
                    </span>
                    <span className="text-fg-2">
                      {ko ? cut.dialogueKo : cut.dialogueEn}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 pt-1">
                  <span className="font-mono text-[0.58rem] font-extrabold text-accent">
                    SFX: {ko ? cut.sfxKo : cut.sfxEn} · {cut.shortsDurationSec.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    data-testid={`story-to-webtoon-inpaint-cut-${cut.cutNumber}`}
                    onClick={() => setInpaintedCutIndex(cut.cutNumber)}
                    className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.56rem] font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
                  >
                    {isInpainted
                      ? ko
                        ? "Komiko 부분 인페인팅 완료"
                        : "Komiko Inpaint Applied"
                      : ko
                        ? "부분 인페인팅 보정"
                        : "Inpaint Region"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
