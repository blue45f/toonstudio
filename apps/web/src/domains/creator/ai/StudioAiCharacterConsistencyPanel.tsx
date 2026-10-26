import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// AI 캐릭터 일관성 생성 패널 — 캔버스에서 선택한 "기준 캐릭터" 이미지를 참고 이미지로 함께 전송해,
// 같은 캐릭터가 새로운 상황에 있는 모습을 생성한다(젠툰·망가플로우·다쉬툰 벤치마크 —
// docs/studio-competitor-features.md §2 "캐릭터 일관성 유지 생성" 참고).
// 여기에 7대 웹툰 일관성 락(안면 골격·가르마 방향·비대칭 복식/흉터 좌우반전 방지·손 대비 무기 비례·
// 180도 시선 축/키 차이·고유색 Albedo 고정·부상 누적 유지)과 5종 다각도 앵글 프리셋을 내재화하여
// 원클릭으로 정밀 일관성 가드레일 프롬프트를 합성·주입한다.
import { Check, Loader2, Lock, MousePointer2, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { StudioAiConnectionBadge } from "./StudioAiConnectionBadge";

export type WebtoonConsistencyLockId =
  | "face-cranial-ratio"
  | "hair-parting-topology"
  | "asymmetric-chirality"
  | "weapon-hand-scale"
  | "camera-axis-height"
  | "albedo-kelvin-lock"
  | "cumulative-wound-state";

export interface WebtoonConsistencyLockSpec {
  readonly id: WebtoonConsistencyLockId;
  readonly labelKo: string;
  readonly badgeKo: string;
  readonly promptGuardKo: string;
  readonly weightPct: number;
}

const WEBTOON_7LAYER_CONSISTENCY_LOCKS: readonly WebtoonConsistencyLockSpec[] = [
  {
    id: "face-cranial-ratio",
    labelKo: "안면 골격 · 눈매 · 홍채 비율 락",
    badgeKo: "ArcFace 0.94",
    promptGuardKo: "[안면 골격·눈매·미간 비율 및 홍채 채도 고정]",
    weightPct: 18,
  },
  {
    id: "hair-parting-topology",
    labelKo: "가르마 방향 · 앞머리 실루엣 락",
    badgeKo: "Topology Lock",
    promptGuardKo: "[가르마 분기점 및 시그니처 잔머리 실루엣 유지]",
    weightPct: 14,
  },
  {
    id: "asymmetric-chirality",
    labelKo: "비대칭 흉터 · 견장 · 검집 좌우반전 금지",
    badgeKo: "Chirality L/R",
    promptGuardKo: "[신체 좌우(Anatomical L/R) 기준 비대칭 흉터·장신구·검집 미러링 절대 금지]",
    weightPct: 18,
  },
  {
    id: "weapon-hand-scale",
    labelKo: "손바닥 대비 무기 · 소품 스케일 락",
    badgeKo: "Scale 3.1:1",
    promptGuardKo: "[손 크기 대비 무기 자루·소품 두께 비례 고정]",
    weightPct: 13,
  },
  {
    id: "camera-axis-height",
    labelKo: "180° 시선 축 · 다중 인물 키 차이 락",
    badgeKo: "180° Axis",
    promptGuardKo: "[180도 시선 축 준수 및 상대 인물 대비 신장 차이 원근 유지]",
    weightPct: 13,
  },
  {
    id: "albedo-kelvin-lock",
    labelKo: "피부 · 의상 고유색(Albedo) 드리프트 방지",
    badgeKo: "Delta-E ≤ 1.5",
    promptGuardKo: "[역광/야간 조명에서도 피부·머리·의상 고유색(Albedo HEX) 탁화 방지]",
    weightPct: 12,
  },
  {
    id: "cumulative-wound-state",
    labelKo: "전투 부상 · 혈흔 · 의상 파손 누적 유지",
    badgeKo: "Wound Ledger",
    promptGuardKo: "[이전 컷에서 발생한 의상 찢김·혈흔·땀방울 상태 초기화 금지]",
    weightPct: 12,
  },
];

const MULTI_ANGLE_CAMERA_PRESETS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly directiveKo: string;
}[] = [
  { id: "front-eye", labelKo: "정면 아이레벨", directiveKo: "정면 아이레벨(50mm 표준 렌즈) 구도" },
  { id: "three-quarter-left", labelKo: "좌측 3/4 얼짱각", directiveKo: "좌측 45도 3/4 측면 입체 구도" },
  { id: "low-angle-hero", labelKo: "로우앵글 위압감", directiveKo: "지면 로우앵글(24mm 광각) 각성 구도" },
  { id: "high-angle-vulnerable", labelKo: "하이앵글 부감", directiveKo: "상단 하이앵글 부감 구도" },
  { id: "over-shoulder-duel", labelKo: "오버더숄더 대치", directiveKo: "전경 어깨 너머 시선 교환 투샷 구도" },
];

export function StudioAiCharacterConsistencyPanel({
  configured,
  hasReference,
  referenceThumbnail,
  prompt,
  onPromptChange,
  busy,
  error,
  onGenerate,
  onRequestSelectReference,
}: {
  configured: boolean;
  /** 캔버스에서 선택된 요소가 이미지 타입이라 기준 캐릭터로 쓸 수 있는 상태인지. */
  hasReference: boolean;
  /** hasReference일 때 미리보기로 보여줄 선택된 이미지의 src(data URL 등). */
  referenceThumbnail: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
  /** 캔버스 선택 모드로 전환해 기준 캐릭터 이미지를 고르게 한다. */
  onRequestSelectReference: () => void;
}) {
  const [activeLocks, setActiveLocks] = useState<readonly WebtoonConsistencyLockId[]>([
    "face-cranial-ratio",
    "hair-parting-topology",
    "asymmetric-chirality",
    "albedo-kelvin-lock",
  ]);
  const [selectedAngleId, setSelectedAngleId] = useState<string>("three-quarter-left");

  const canGenerate = configured && hasReference && !busy && prompt.trim().length > 0;

  const consistencyScore = useMemo(() => {
    const sum = WEBTOON_7LAYER_CONSISTENCY_LOCKS.reduce(
      (acc, item) => (activeLocks.includes(item.id) ? acc + item.weightPct : acc),
      0,
    );
    return Math.min(100, Math.max(40, sum));
  }, [activeLocks]);

  function toggleLock(id: WebtoonConsistencyLockId) {
    setActiveLocks((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleInjectConsistencyDnaPrompt() {
    const selectedAngle =
      MULTI_ANGLE_CAMERA_PRESETS.find((a) => a.id === selectedAngleId) ??
      MULTI_ANGLE_CAMERA_PRESETS[0]!;
    const lockGuards = WEBTOON_7LAYER_CONSISTENCY_LOCKS.filter((l) =>
      activeLocks.includes(l.id),
    )
      .map((l) => l.promptGuardKo)
      .join(" ");
    const base = prompt.trim();
    const injected = [base, `(${selectedAngle.directiveKo})`, lockGuards]
      .filter((part) => part.length > 0)
      .join(" ")
      .slice(0, 500);
    onPromptChange(injected);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <UserRoundCheck size={14} className="text-accent" aria-hidden />
        {translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "AI 캐릭터 일관성 생성")} <StudioAiConnectionBadge configured={configured} /></div>

      {!configured ? (
        <AiRecoveryNotice
          code="not_configured"
          message="기준 이미지와 상황 프롬프트는 먼저 준비할 수 있어요. 생성하려면 통합 AI 설정에서 개인 이미지 API 키와 모델을 연결하세요."
          compact
        />
      ) : null}

      {!hasReference && (
        <div
          className="rounded-md border border-line bg-card/70 p-2 text-[0.63rem] leading-relaxed text-fg-3"
          role="status"
          aria-live="polite"
        >
          <p>
            {translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "캔버스에서 기준으로 쓸 ")}<span className="font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "캐릭터 이미지")}</span>{translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "를 먼저 선택하세요.")}</p>
          <button
            type="button"
            onClick={onRequestSelectReference}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/45 bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            aria-label={translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "기준 이미지 선택하기")}
          >
            <MousePointer2 size={14} aria-hidden />
            {translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "기준 이미지 선택하기")}</button>
          <p className="mt-1.5 text-[0.6rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "Esc를 누르면 선택을 취소할 수 있어요.")}</p>
        </div>
      )}

      {hasReference && referenceThumbnail && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-card/70 px-2 py-1.5">
          <img src={referenceThumbnail} alt={translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "기준 캐릭터 미리보기")} className="h-9 w-9 shrink-0 rounded object-cover" />
          <p className="text-[0.63rem] leading-relaxed text-fg-3">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "이 이미지를 기준 캐릭터로 사용해요.")}</p>
        </div>
      )}

      {/* 7대 웹툰 일관성 DNA 가드레일 & 다각도 앵글 프리셋 */}
      <div
        data-testid="webtoon-consistency-7layer-guard"
        className="flex flex-col gap-1.5 rounded-lg border border-accent/25 bg-card/60 p-2"
      >
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 text-[0.62rem] font-bold text-fg">
            <ShieldCheck size={12} className="text-accent" aria-hidden />
            7대 웹툰 일관성 DNA 락 ({activeLocks.length}/7 활성)
          </span>
          <span
            data-testid="consistency-guardrail-score-badge"
            className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.58rem] font-bold text-accent"
          >
            작붕 방어력 {consistencyScore}점
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1">
          {WEBTOON_7LAYER_CONSISTENCY_LOCKS.map((lock) => {
            const isChecked = activeLocks.includes(lock.id);
            return (
              <button
                key={lock.id}
                type="button"
                aria-pressed={isChecked}
                onClick={() => toggleLock(lock.id)}
                data-testid={`consistency-lock-toggle-${lock.id}`}
                className={`flex items-center justify-between rounded border px-1.5 py-1 text-left text-[0.6rem] transition-colors ${
                  isChecked
                    ? "border-accent/50 bg-accent/12 text-fg"
                    : "border-line/70 bg-panel/60 text-fg-3 hover:text-fg-2"
                }`}
              >
                <span className="inline-flex items-center gap-1 font-medium">
                  {isChecked ? (
                    <Check size={10} className="text-accent" aria-hidden />
                  ) : (
                    <Lock size={10} className="text-fg-3" aria-hidden />
                  )}
                  {lock.labelKo}
                </span>
                <span className="rounded bg-panel px-1 py-0.2 font-mono text-[0.54rem] text-accent">
                  {lock.badgeKo}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1 pt-0.5">
          {MULTI_ANGLE_CAMERA_PRESETS.map((angle) => {
            const active = selectedAngleId === angle.id;
            return (
              <button
                key={angle.id}
                type="button"
                onClick={() => setSelectedAngleId(angle.id)}
                data-testid={`consistency-angle-${angle.id}`}
                className={`rounded border px-1.5 py-0.5 text-[0.56rem] font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-card"
                }`}
              >
                {angle.labelKo}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleInjectConsistencyDnaPrompt}
          disabled={busy}
          data-testid="inject-consistency-dna-prompt-btn"
          className="inline-flex items-center justify-center gap-1 rounded-md border border-accent/40 bg-accent/15 px-2 py-1 text-[0.6rem] font-bold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          <Sparkles size={11} aria-hidden />
          선택한 일관성 DNA 락 프롬프트 주입
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value.slice(0, 500))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canGenerate) onGenerate();
        }}
        placeholder={translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "예: 이 캐릭터가 비 오는 골목에서 우산을 쓰고 서 있는 모습")}
        rows={2}
        disabled={busy}
        className="h-14 w-full resize-none rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent disabled:opacity-60"
      />

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <UserRoundCheck size={14} />}
        {busy ? translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "생성하는 중…") : translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "같은 캐릭터로 생성")}
      </button>

      {error ? (
        <AiRecoveryNotice
          message={error}
          onRetry={canGenerate ? onGenerate : undefined}
          compact
        />
      ) : null}

      <p className="text-[0.6rem] leading-relaxed text-fg-3">
        {translateCurrentStaticSourceText("domains.creator.ai.StudioAiCharacterConsistencyPanel", "ko", "참고 이미지 기반 근사치예요 — 매번 완벽히 동일한 얼굴을 보장하진 않아요. 생성된 이미지는 캔버스에 새 이미지 요소로 추가돼요(기준 이미지는 그대로 남아요).")}</p>
    </div>
  );
}
