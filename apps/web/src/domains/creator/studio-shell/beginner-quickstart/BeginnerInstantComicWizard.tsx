import { ArrowRight, Check, Palette, RefreshCw, RotateCcw, Sparkles, UserRound, Wand2 } from "lucide-react";
import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./beginner-instant-wizard.css";

type BeginnerMoodId = "daily" | "romance" | "comedy" | "fantasy";
type BiText = readonly [ko: string, en: string];

interface FourPanelTemplate {
  readonly id: string;
  readonly title: BiText;
  readonly lines: readonly [BiText, BiText, BiText, BiText];
}

interface BeginnerMoodPreset {
  readonly id: BeginnerMoodId;
  readonly paletteId: string;
  readonly label: BiText;
  readonly hint: BiText;
  readonly paletteName: BiText;
  readonly spriteSrc: string;
  readonly fallbackSrc: string;
  readonly templates: readonly [FourPanelTemplate, FourPanelTemplate];
}

const SPRITE_BASE = "/assets/studio/vibrant-sprites";
const SWATCH_INDICES = [1, 2, 3, 4] as const;

const STEP_PILLS: readonly [BiText, BiText, BiText] = [
  ["분위기 고르기", "Pick vibe"],
  ["안심 보정", "Auto helpers"],
  ["4컷 미리보기", "4-panel preview"],
];

const PANEL_BEATS: readonly [BiText, BiText, BiText, BiText] = [
  ["도입", "Setup"],
  ["전개", "Build"],
  ["반전", "Twist"],
  ["여운", "Beat"],
];

const BEGINNER_MOOD_PRESETS: readonly BeginnerMoodPreset[] = [
  {
    id: "daily",
    paletteId: "warm-butter",
    label: ["일상 공감툰", "Everyday Slice of Life"],
    hint: ["출근·카페·하루의 소소한 공감", "Coffee runs & relatable daily life"],
    paletteName: ["따뜻한 크림 4색", "Warm Cream 4-Tone"],
    spriteSrc: `${SPRITE_BASE}/beginner-1-story.webp`,
    fallbackSrc: `${SPRITE_BASE}/tool-bubble-sfx.webp`,
    templates: [
      {
        id: "daily-coffee",
        title: ["월요일 카페 첫 모금", "First Monday Sip"],
        lines: [
          ["오늘만큼은 여유롭게 출근해야지!", "Today I am starting the morning calm and early!"],
          ["아이스 커피 한 잔 들고 당당히 출발.", "Grabbed my iced coffee and stepped out strong."],
          ["어... 잠깐, 나 슬리퍼 신고 나왔네?", "Wait... why am I still wearing house slippers?"],
          ["일단 커피가 맛있으니 오늘은 이긴 걸로.", "Coffee tastes great, so today still counts as a win."],
        ],
      },
      {
        id: "daily-nap",
        title: ["퇴근 후 5분만 눕기", "Just Five Minutes to Rest"],
        lines: [
          ["집 도착! 옷 갈아입고 바로 운동 가야지.", "Home at last! Quick change, then straight to exercise."],
          ["가기 전에 딱 5분만 침대에 기대 볼까?", "Maybe I will rest my eyes for five tiny minutes."],
          ["눈 떠 보니 창밖이 벌써 새벽 2시...", "Blink once and suddenly it is 2 AM outside..."],
          ["숨쉬기 운동도 전신 운동이니까 괜찮아.", "Deep breathing counts as cardio, right?"],
        ],
      },
    ],
  },
  {
    id: "romance",
    paletteId: "blossom-peach",
    label: ["설렘 로맨스", "Heart-Flutter Romance"],
    hint: ["우산·눈빛·두근거리는 첫 만남", "Shared umbrellas & quiet heartbeats"],
    paletteName: ["복숭아 로즈 4색", "Blossom Peach 4-Tone"],
    spriteSrc: `${SPRITE_BASE}/beginner-2-pose.webp`,
    fallbackSrc: `${SPRITE_BASE}/tool-vrm.webp`,
    templates: [
      {
        id: "romance-rain",
        title: ["갑작스런 소나기와 우산", "Sudden Rain, One Umbrella"],
        lines: [
          ["일기예보엔 맑음이라더니 갑자기 소나기라니.", "The forecast promised sun, yet rain poured down."],
          ["뛰어가려는데 머리 위로 툭, 우산이 씌워졌다.", "Right as I ran, an umbrella tilted over my head."],
          ["돌아보니 평소엔 말도 없던 옆자리 선배.", "I turned around—it was the quiet senior next door."],
          ["역까지 5분 거리가 유난히 길게 느껴졌다.", "A five-minute walk to the station felt so warm."],
        ],
      },
      {
        id: "romance-note",
        title: ["도서관 책상 위 쪽지", "A Note on the Library Desk"],
        lines: [
          ["졸린 오후, 늘 앉던 창가 자리에서 책을 폈다.", "Sleepy afternoon—I opened my sketchbook by the window."],
          ["책장 사이에서 접힌 노란 쪽지가 툭 떨어졌다.", "A folded yellow note slipped out between the pages."],
          ["'항상 멋진 그림 잘 보고 있어요!' 짧은 한 줄.", "'Always love seeing your sketches!' one bright line."],
          ["글씨체만 봐도 누군지 알 것 같아 웃음이 났다.", "I knew the handwriting at once and could not stop smiling."],
        ],
      },
    ],
  },
  {
    id: "comedy",
    paletteId: "citrus-pop",
    label: ["유쾌한 개그 짤툰", "Playful Gag Comic"],
    hint: ["예상 밖 반전으로 빵 터지는 4컷", "Punchy timing & wild plot twists"],
    paletteName: ["상큼 시트러스 4색", "Citrus Pop 4-Tone"],
    spriteSrc: `${SPRITE_BASE}/beginner-3-brush.webp`,
    fallbackSrc: `${SPRITE_BASE}/tool-watercolor.webp`,
    templates: [
      {
        id: "comedy-diet",
        title: ["다이어트 첫날의 결심", "Day One of My New Diet"],
        lines: [
          ["오늘부터 야식 끊는다! 샐러드만 먹을 거야.", "No more midnight snacks! Only salads from today."],
          ["냉장고를 열었는데 샐러드가 유난히 평화롭다.", "Opened the fridge to a suspiciously peaceful salad."],
          ["딩동—'어제 예약하신 치킨 도착했습니다!'", "Ding-dong—'Your pre-ordered fried chicken is here!'"],
          ["과거의 나에게 감사하며 내일부터 다시 1일차.", "Thanking past-me now. Day one resumes tomorrow."],
        ],
      },
      {
        id: "comedy-cat",
        title: ["고양이의 완벽한 협조", "My Cat's Co-Author Assist"],
        lines: [
          ["드디어 첫 4컷 웹툰에 집중해 볼까!", "Time to focus completely on my first 4-panel comic!"],
          ["펜을 들자마자 우리 집 고양이가 다가왔다.", "The second I lifted the pen, my cat strolled over."],
          ["키보드 위에 털썩 앉아 단축키를 꾹 눌렀다.", "Plopped onto the keyboard and hit every key at once."],
          ["이 선은 공동 작가님 서명으로 그대로 두기로.", "Keeping that stroke as my cat's official signature."],
        ],
      },
    ],
  },
  {
    id: "fantasy",
    paletteId: "starlight-teal",
    label: ["판타지 첫 장면", "Fantasy First Scene"],
    hint: ["평범한 방에서 열리는 마법 세계", "A portal opening in an ordinary room"],
    paletteName: ["별빛 에메랄드 4색", "Starlight Teal 4-Tone"],
    spriteSrc: `${SPRITE_BASE}/beginner-4-publish.webp`,
    fallbackSrc: `${SPRITE_BASE}/emblem-studio.webp`,
    templates: [
      {
        id: "fantasy-subway",
        title: ["막차 역의 숨겨진 문", "Hidden Door on the Last Train"],
        lines: [
          ["밤 11시 59분, 늘 지나던 지하철 4번 출구 앞.", "11:59 PM at my usual quiet subway exit."],
          ["벽돌 벽에 못 보던 황동 손잡이가 빛난다.", "An unfamiliar brass handle glowed on the brick wall."],
          ["살짝 돌리자 구름 위 별빛 항구가 펼쳐졌다.", "One turn opened onto a starlit harbor in the clouds."],
          ["주머니 속 교통카드가 마법 탑승권으로 변했다.", "My transit pass had turned into a golden ticket."],
        ],
      },
      {
        id: "fantasy-bird",
        title: ["낡은 스케치북의 비밀", "Secret of the Old Sketchbook"],
        lines: [
          ["헌책방 구석에서 오래된 스케치북을 주웠다.", "Found a worn sketchbook in a quiet corner bookshop."],
          ["첫 장에 작은 종이새 한 마리를 쓱쓱 그렸다.", "Sketched a tiny paper bird on the opening page."],
          ["잉크가 마르자 종이새가 펄럭이며 날아올랐다!", "As the ink dried, the paper bird lifted off the page!"],
          ["평범한 오후는 아무래도 여기서 끝난 모양이다.", "Looks like my ordinary afternoon just ended right here."],
        ],
      },
    ],
  },
];

function StepHead({ step, title, hint }: { readonly step: string; readonly title: string; readonly hint: string }) {
  return (
    <div className="biw-step-head">
      <h3 className="biw-step-title">
        <span className="biw-step-tag biw-num">{step}</span>
        <span>{title}</span>
      </h3>
      <p className="biw-step-hint">{hint}</p>
    </div>
  );
}

export function BeginnerInstantComicWizard() {
  const bt = useBilingual("BeginnerInstantComicWizard");
  const baseId = useId();
  const [moodId, setMoodId] = useState<BeginnerMoodId>("daily");
  const [templateIndex, setTemplateIndex] = useState<0 | 1>(0);
  const [stabilizeOn, setStabilizeOn] = useState(true);
  const [pose3dOn, setPose3dOn] = useState(true);
  const [paletteOn, setPaletteOn] = useState(true);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [lineOverrides, setLineOverrides] = useState<Readonly<Record<number, string>>>({});
  const [failedSprites, setFailedSprites] = useState<Readonly<Record<string, boolean>>>({});

  const activeMood = BEGINNER_MOOD_PRESETS.find((item) => item.id === moodId) ?? BEGINNER_MOOD_PRESETS[0];
  const activeTemplate = activeMood.templates[templateIndex];
  const effectiveTitle = titleOverride ?? bt(activeTemplate.title[0], activeTemplate.title[1]);
  const hasEdits = titleOverride !== null || Object.keys(lineOverrides).length > 0;

  const clearEdits = () => {
    setTitleOverride(null);
    setLineOverrides({});
  };

  const handleSelectMood = (nextMoodId: BeginnerMoodId) => {
    setMoodId(nextMoodId);
    setTemplateIndex(0);
    clearEdits();
  };

  const handleCycleTemplate = () => {
    setTemplateIndex((prev) => (prev === 0 ? 1 : 0));
    clearEdits();
  };

  const launchParams = new URLSearchParams({
    lane: "blank",
    preset: "instatoon-square",
    beginner: "1",
    mood: activeMood.id,
    stabilize: stabilizeOn ? "70" : "0",
    pose3d: pose3dOn ? "1" : "0",
    palette: paletteOn ? activeMood.paletteId : "custom",
  });
  if (effectiveTitle.trim().length > 0) launchParams.set("title", effectiveTitle.trim());
  const launchHref = `/studio/new?${launchParams.toString()}`;

  const assistSwitches = [
    { id: "stabilize", icon: Wand2, checked: stabilizeOn, toggle: () => setStabilizeOn((p) => !p), label: bt("손떨림 70% 자동 보정", "70% Auto Stroke Smoothing"), desc: bt("마우스나 손가락으로 대충 그어도 선이 매끈하게 잡혀요", "Turns quick mouse or finger strokes into smooth, clean lines"), showSwatches: false },
    { id: "pose3d", icon: UserRound, checked: pose3dOn, toggle: () => setPose3dOn((p) => !p), label: bt("3D 인형 자동 포즈 배치", "3D Mannequin Auto Pose"), desc: bt("인체 비율 고민 없이 인형을 끌어다 놓으면 구도가 잡혀요", "Drop a 3D pose figure onto panels with zero anatomy guesswork"), showSwatches: false },
    { id: "palette", icon: Palette, checked: paletteOn, toggle: () => setPaletteOn((p) => !p), label: bt("원클릭 추천 색감 팔레트", "1-Click Recommended Palette"), desc: bt("색 조합 몰라도 어울리는 4색 팔레트를 자동 세팅해요", "Pre-loads a balanced 4-color mood palette automatically"), showSwatches: true },
  ] as const;

  const summaryChips = [
    { id: "mood", text: bt(activeMood.label[0], activeMood.label[1]), checkedIcon: true },
    { id: "stabilize", text: stabilizeOn ? bt("손떨림 70%", "Smooth 70%") : bt("손떨림 꺼짐", "Smooth Off"), checkedIcon: false },
    { id: "pose", text: pose3dOn ? bt("3D 인형 ON", "3D Pose ON") : bt("3D 인형 OFF", "3D Pose OFF"), checkedIcon: false },
    { id: "palette", text: paletteOn ? bt(activeMood.paletteName[0], activeMood.paletteName[1]) : bt("직접 색 선택", "Custom Colors"), checkedIcon: false },
  ] as const;

  const titleInputId = `${baseId}-title`;
  const headingId = `${baseId}-heading`;

  return (
    <section aria-labelledby={headingId} data-testid="beginner-instant-comic-wizard" data-mood={activeMood.id} className="biw-shell">
      <header className="biw-header">
        <div className="biw-heading-group">
          <p className="biw-kicker">
            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{bt("그림 처음이어도 30초 시작", "Start in 30 seconds · Zero jargon")}</span>
          </p>
          <h2 id={headingId} className="biw-title">
            {bt("딱 3번만 누르면 내 첫 4컷 웹툰이 시작돼요", "Launch your first 4-panel comic in 3 quick taps")}
          </h2>
          <p className="biw-subtitle">
            {bt("분위기 고르고 안심 보정만 켜면 4컷 칸과 어울리는 색감까지 한 번에 준비해 드려요.", "Pick a vibe, keep the drawing helpers on, and open a ready-made 4-panel canvas right away.")}
          </p>
        </div>
        <ol className="biw-step-rail" aria-label={bt("30초 시작 3단계", "3-step quick start")}>
          {STEP_PILLS.map(([ko, en], idx) => (
            <li key={en} className="biw-step-pill" data-ready="true">
              <span className="biw-step-index biw-num" aria-hidden="true">{idx + 1}</span>
              <span>{bt(ko, en)}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="biw-step-block" data-testid="biw-step-mood">
        <StepHead
          step="STEP 1"
          title={bt("어떤 분위기로 그려 볼까요?", "Which vibe fits your comic?")}
          hint={bt("1번만 누르면 어울리는 4컷 대사와 색감이 바로 바뀌어요", "One click switches the 4-panel script and matching colors")}
        />
        <div className="biw-mood-grid" role="group" aria-label={bt("4컷 웹툰 분위기 선택", "Choose 4-panel comic mood")}>
          {BEGINNER_MOOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.id === activeMood.id}
              data-testid={`biw-mood-${preset.id}`}
              onClick={() => handleSelectMood(preset.id)}
              className="biw-mood-btn"
            >
              <span className="biw-mood-sprite-wrap" aria-hidden="true">
                <img
                  src={failedSprites[preset.id] ? preset.fallbackSrc : preset.spriteSrc}
                  alt=""
                  width={44}
                  height={44}
                  loading="lazy"
                  decoding="async"
                  onError={() => setFailedSprites((prev) => (prev[preset.id] ? prev : { ...prev, [preset.id]: true }))}
                  className="biw-mood-sprite"
                />
              </span>
              <span className="biw-mood-copy">
                <strong className="biw-mood-name">{bt(preset.label[0], preset.label[1])}</strong>
                <span className="biw-mood-desc">{bt(preset.hint[0], preset.hint[1])}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="biw-step-block" data-testid="biw-step-assists">
        <StepHead
          step="STEP 2"
          title={bt("초보자 자동 안심 보정", "Beginner auto-assist switches")}
          hint={bt("처음 시작하기 좋게 3가지 모두 켜 두었어요 · 언제든 끌 수 있어요", "All three helpers start on for an easy first draw—toggle anytime")}
        />
        <div className="biw-assist-grid">
          {assistSwitches.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" role="switch" aria-checked={item.checked} data-testid={`biw-switch-${item.id}`} onClick={item.toggle} className="biw-switch-card">
                <span className="biw-switch-copy">
                  <span className="biw-switch-label biw-num">
                    <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  <span className="biw-switch-desc">{item.desc}</span>
                  {item.showSwatches ? (
                    <span className="biw-swatch-row" data-muted={item.checked ? "false" : "true"} aria-hidden="true">
                      {SWATCH_INDICES.map((dot) => <span key={dot} className={`biw-swatch-dot biw-swatch-dot--${dot}`} />)}
                    </span>
                  ) : null}
                </span>
                <span className="biw-switch-right" aria-hidden="true">
                  <span className="biw-switch-track"><span className="biw-switch-thumb" /></span>
                  <span className="biw-switch-state">{item.checked ? bt("켜짐", "ON") : bt("꺼짐", "OFF")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="biw-step-block" data-testid="biw-step-preview">
        <StepHead
          step="STEP 3"
          title={bt("4컷 예시 대사 미리보기", "Live 4-panel dialogue preview")}
          hint={bt("도입→전개→반전→여운 흐름을 그대로 쓰거나 한 줄만 살짝 고쳐 보세요", "Use the 4-beat flow as-is or tweak any title and line")}
        />
        <div className="biw-story-controls">
          <label htmlFor={titleInputId} className="biw-title-field">
            <span>{bt("내 첫 4컷 제목 (1줄)", "Your 4-panel title (1 line)")}</span>
            <input id={titleInputId} type="text" value={effectiveTitle} maxLength={60} onChange={(e) => setTitleOverride(e.target.value)} className="biw-text-input" />
          </label>
          <div className="biw-template-actions">
            <button type="button" data-testid="biw-cycle-template" onClick={handleCycleTemplate} className="biw-template-btn">
              <RefreshCw size={15} strokeWidth={1.7} aria-hidden="true" />
              <span>{bt("다른 추천 대사 보기", "Try another script")}</span>
            </button>
            {hasEdits ? (
              <button type="button" data-testid="biw-reset-edits" onClick={clearEdits} className="biw-template-btn">
                <RotateCcw size={15} strokeWidth={1.7} aria-hidden="true" />
                <span>{bt("기본 대사로 되돌리기", "Reset edits")}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="biw-preview-grid" data-testid="biw-preview-board">
          {activeTemplate.lines.map((line, index) => {
            const beat = PANEL_BEATS[index];
            const panelInputId = `${baseId}-panel-${index + 1}`;
            return (
              <article key={`${activeTemplate.id}-${index}`} className="biw-panel-card" data-testid={`biw-panel-${index + 1}`}>
                <div className="biw-panel-top">
                  <span className="biw-panel-beat">
                    <span className="biw-panel-num biw-num">{index + 1}</span>
                    <span>{bt(beat[0], beat[1])}</span>
                  </span>
                  <span className="biw-step-hint biw-num">{bt(`${index + 1}컷`, `Cut ${index + 1}`)}</span>
                </div>
                <div className="biw-panel-stage" data-palette-on={paletteOn ? "true" : "false"}>
                  <span className="biw-stage-badges">
                    {stabilizeOn ? <span className="biw-stage-chip biw-num">{bt("선 보정 70%", "Smooth 70%")}</span> : null}
                    {pose3dOn ? <span className="biw-stage-chip">{bt("3D 인형", "3D Pose")}</span> : null}
                    {!stabilizeOn && !pose3dOn ? <span className="biw-stage-chip">{bt("자유 스케치", "Free sketch")}</span> : null}
                  </span>
                  {paletteOn ? (
                    <span className="biw-swatch-row" aria-hidden="true">
                      <span className="biw-swatch-dot biw-swatch-dot--1" />
                      <span className="biw-swatch-dot biw-swatch-dot--2" />
                    </span>
                  ) : null}
                </div>
                <label htmlFor={panelInputId} className="sr-only">
                  {bt(`${index + 1}컷 ${beat[0]} 대사`, `Panel ${index + 1} ${beat[1]} line`)}
                </label>
                <input
                  id={panelInputId}
                  type="text"
                  value={lineOverrides[index] ?? bt(line[0], line[1])}
                  maxLength={90}
                  onChange={(e) => setLineOverrides((prev) => ({ ...prev, [index]: e.target.value }))}
                  className="biw-bubble-input"
                />
              </article>
            );
          })}
        </div>
      </div>

      <footer className="biw-footer">
        <ul className="biw-summary-list" aria-label={bt("선택한 초보자 캔버스 세팅", "Selected beginner canvas setup")}>
          {summaryChips.map((chip) => (
            <li key={chip.id} className="biw-summary-chip biw-num">
              {chip.checkedIcon ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : null}
              <span>{chip.text}</span>
            </li>
          ))}
        </ul>
        <Link href={launchHref} data-testid="biw-launch-cta" className="biw-launch-cta">
          <span>{bt("이 세팅 그대로 30초 만에 캔버스 열기", "Open canvas with this setup in 30s")}</span>
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}
