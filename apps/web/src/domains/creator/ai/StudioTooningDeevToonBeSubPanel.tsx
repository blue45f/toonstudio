/**
 * StudioTooningDeevToonBeSubPanel.tsx
 *
 * 투닝 플러스 통합 워크스페이스의 DV(디브 AI 캐릭터 6단계·로어북·17종 챗 모드·5종 대화중 이미지 재생성) 및
 * TB(툰비 웹툰 700px/5MB/50MB 원고 검증기·10종 작가 크레딧·웹소설 15,000자 검증 및 뷰어) 전용 서브 패널.
 */
import { CheckCircle2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  buildDvInChatImageRegenPrompt,
  DV_CHARACTER_WIZARD_STEPS,
  DV_CHAT_MODES,
  DV_IN_CHAT_IMAGE_REGEN_PRESETS,
  DV_PROMPT_TEMPLATE_CATEGORIES,
  matchDvLorebookEntriesForMessage,
  TB_CREATOR_CREDIT_ROLES,
  TB_NOVEL_VIEWER_FONT_SIZES,
  validateDvMediaTriggerCode,
  validateTbNovelEpisodeContent,
  validateTbWebtoonEpisodeManuscripts,
  type DvCharacterWizardStep,
  type DvInChatImageRegenPreset,
  type DvLorebookEntry,
  type ShChatMode,
  type TbNovelFontFamily,
  type TbNovelFontSizeCode,
  type TbNovelViewerMode,
  type TbUserWorkRoleType,
} from "./tooning-deev-toonbe-suite";

export interface StudioTooningDeevToonBeSubPanelProps {
  readonly mode: "DV" | "TB";
  readonly novelSampleText: string;
}

export function StudioTooningDeevToonBeSubPanel({
  mode,
  novelSampleText,
}: StudioTooningDeevToonBeSubPanelProps): ReactElement {
  // DV State
  const [dvStep, setDvStep] = useState<DvCharacterWizardStep>("Lorebook");
  const [dvChatMode, setDvChatMode] = useState<ShChatMode>("ClaudeSonnet4_6");
  const [dvRegenPreset, setDvRegenPreset] = useState<DvInChatImageRegenPreset>("expression");
  const [dvTriggerCode, setDvTriggerCode] = useState("smile_blush_01");
  const [dvTestMessage, setDvTestMessage] = useState("북부 성채의 봉인 유물에 대해 알려줘.");
  const [dvLoreEntries] = useState<readonly DvLorebookEntry[]>([
    {
      entryId: "lore-1",
      title: "북부 설원 성채 (윈터펠 요새)",
      keywords: ["북부", "성채", "요새"],
      content: "만년설로 뒤덮인 대공가의 본성. 고대 마법 방어벽이 작동 중이다.",
      enabled: true,
    },
    {
      entryId: "lore-2",
      title: "봉인 유물 (크로노스의 시계)",
      keywords: ["봉인", "유물", "시계"],
      content: "소유자의 생명을 대가로 시간을 5년 되돌리는 황실 비보.",
      enabled: true,
    },
  ]);

  // TB State
  const [tbRole, setTbRole] = useState<TbUserWorkRoleType>("Main");
  const [tbTestWidthPx, setTbTestWidthPx] = useState<number>(700);
  const [tbNovelMode, setTbNovelMode] = useState<TbNovelViewerMode>("scroll");
  const [tbNovelFont, setTbNovelFont] = useState<TbNovelFontFamily>("Pretendard");
  const [tbNovelSize, setTbNovelSize] = useState<TbNovelFontSizeCode>("MB");

  const matchedLore = useMemo(
    () => matchDvLorebookEntriesForMessage(dvTestMessage, dvLoreEntries),
    [dvTestMessage, dvLoreEntries],
  );
  const triggerCodeValidation = useMemo(
    () => validateDvMediaTriggerCode(dvTriggerCode, ["emotion", "positive"]),
    [dvTriggerCode],
  );
  const dvRegenPrompt = useMemo(
    () =>
      buildDvInChatImageRegenPrompt({
        characterName: "강하준 대공",
        dialogueLine: dvTestMessage,
        preset: dvRegenPreset,
      }),
    [dvTestMessage, dvRegenPreset],
  );

  const tbManuscriptReport = useMemo(
    () =>
      validateTbWebtoonEpisodeManuscripts([
        {
          fileName: "episode_01_cut_01.jpg",
          mimeType: "image/jpeg",
          widthPx: tbTestWidthPx,
          heightPx: 2000,
          sizeBytes: 1_800_000,
        },
        {
          fileName: "episode_01_cut_02.jpg",
          mimeType: "image/jpeg",
          widthPx: tbTestWidthPx,
          heightPx: 2000,
          sizeBytes: 2_100_000,
        },
      ]),
    [tbTestWidthPx],
  );

  const tbNovelValidation = useMemo(
    () => validateTbNovelEpisodeContent(novelSampleText),
    [novelSampleText],
  );

  if (mode === "DV") {
    return (
      <div className="flex flex-col gap-2" data-testid="tooning-pillar-dv">
        <div className="flex flex-wrap gap-1" role="group" aria-label="디브 캐릭터 제작 6단계">
          {DV_CHARACTER_WIZARD_STEPS.map((st) => (
            <button
              key={st.step}
              type="button"
              aria-pressed={dvStep === st.step}
              onClick={() => setDvStep(st.step)}
              className={`rounded border px-2 py-0.5 text-[0.58rem] font-bold ${
                dvStep === st.step
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {st.labelKo}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
            <strong className="block text-fg">
              17종 AI 챗 모드 & 7종 프롬프트 템플릿 ({DV_PROMPT_TEMPLATE_CATEGORIES.length}종)
            </strong>
            <select
              aria-label="디브 AI 챗 모드"
              value={dvChatMode}
              onChange={(e) => setDvChatMode(e.target.value as ShChatMode)}
              className="mt-1 w-full rounded border border-line bg-field px-1.5 py-0.5"
            >
              {DV_CHAT_MODES.map((m) => (
                <option key={m.mode} value={m.mode}>
                  [{m.providerGroup}] {m.labelKo}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center gap-1">
              <span>미디어 트리거 코드:</span>
              <input
                type="text"
                aria-label="미디어 트리거 코드 입력"
                value={dvTriggerCode}
                onChange={(e) => setDvTriggerCode(e.target.value)}
                className="flex-1 rounded border border-line bg-field px-1.5 py-0.5 font-mono"
              />
              <span className={triggerCodeValidation.valid ? "text-good" : "text-bad"}>
                {triggerCodeValidation.valid ? "유효" : "오류"}
              </span>
            </div>
          </div>

          <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
            <strong className="block text-fg">
              키워드 반응형 로어북 매칭 ({matchedLore.length}건 발동) & 대화 중 이미지 재생성(5종)
            </strong>
            <input
              type="text"
              aria-label="로어북 테스트 메시지"
              value={dvTestMessage}
              onChange={(e) => setDvTestMessage(e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-1.5 py-0.5"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {DV_IN_CHAT_IMAGE_REGEN_PRESETS.map((p) => (
                <button
                  key={p.preset}
                  type="button"
                  aria-pressed={dvRegenPreset === p.preset}
                  onClick={() => setDvRegenPreset(p.preset)}
                  className={`rounded border px-1.5 py-0.5 text-[0.56rem] font-bold ${
                    dvRegenPreset === p.preset
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-3"
                  }`}
                >
                  {p.labelKo}
                </button>
              ))}
            </div>
            <p className="mt-1 truncate font-mono text-[0.55rem] text-fg-3">{dvRegenPrompt}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="tooning-pillar-tb">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
          <div className="flex items-center justify-between">
            <strong className="text-fg">웹툰 원고 규격 검증기 (JPG · 최대 700px · 5MB/50MB)</strong>
            <span
              className={`inline-flex items-center gap-0.5 font-bold ${
                tbManuscriptReport.valid ? "text-good" : "text-bad"
              }`}
            >
              <CheckCircle2 size={11} aria-hidden />
              {tbManuscriptReport.valid ? "규격 통과" : `오류 ${tbManuscriptReport.errors.length}건`}
            </span>
          </div>
          <label className="mt-1 flex items-center justify-between gap-2">
            <span>원고 가로 폭 테스트 ({tbTestWidthPx}px):</span>
            <input
              type="range"
              min={500}
              max={900}
              step={10}
              value={tbTestWidthPx}
              onChange={(e) => setTbTestWidthPx(Number(e.target.value))}
            />
          </label>
          {!tbManuscriptReport.valid && tbManuscriptReport.errors[0] ? (
            <p className="mt-1 text-[0.58rem] font-semibold text-bad">
              {tbManuscriptReport.errors[0].messageKo}
            </p>
          ) : null}
          <label className="mt-1.5 block">
            작가 크레딧 롤 (10종):
            <select
              aria-label="툰비 작가 크레딧 역할"
              value={tbRole}
              onChange={(e) => setTbRole(e.target.value as TbUserWorkRoleType)}
              className="ml-1 rounded border border-line bg-field px-1.5 py-0.5"
            >
              {TB_CREATOR_CREDIT_ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.labelKo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded border border-line bg-card p-2 text-[0.6rem]">
          <strong className="block text-fg">
            웹소설 회차 검증 ({tbNovelValidation.charCount.toLocaleString()} / 15,000자) & 뷰어 설정
          </strong>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <select
              aria-label="웹소설 뷰어 읽기 방식"
              value={tbNovelMode}
              onChange={(e) => setTbNovelMode(e.target.value as TbNovelViewerMode)}
              className="rounded border border-line bg-field px-1.5 py-0.5"
            >
              <option value="scroll">스크롤 모드 (scroll)</option>
              <option value="tap">페이지 탭 모드 (tap)</option>
            </select>
            <select
              aria-label="웹소설 뷰어 서체"
              value={tbNovelFont}
              onChange={(e) => setTbNovelFont(e.target.value as TbNovelFontFamily)}
              className="rounded border border-line bg-field px-1.5 py-0.5"
            >
              {(["SansSerif", "Serif", "Pretendard", "Nanum"] as const).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              aria-label="웹소설 뷰어 글자 크기"
              value={tbNovelSize}
              onChange={(e) => setTbNovelSize(e.target.value as TbNovelFontSizeCode)}
              className="rounded border border-line bg-field px-1.5 py-0.5"
            >
              {(["SS", "SM", "MB", "BB"] as const).map((sz) => (
                <option key={sz} value={sz}>
                  {sz} ({TB_NOVEL_VIEWER_FONT_SIZES[sz]}px)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
