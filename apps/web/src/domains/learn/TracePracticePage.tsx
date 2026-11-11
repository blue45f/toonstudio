import { ArrowRight, Eye, FlipHorizontal2, ImagePlus, Layers3, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration, MotionStepFlow, MotionReveal, type MotionIllustrationName } from "@/shared/motion-assets";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const PRACTICE_FOCUS = [
  { id: "gesture", ko: "30초 동세 연습", en: "30-second gesture practice", tipKo: "짧게 연습할 때는 세부 묘사보다 큰 동작을 그려 보세요. 시간은 별도 타이머로 확인하세요.", tipEn: "Focus on the overall gesture rather than details. Use a separate timer to track the time." },
  { id: "anatomy", ko: "2분 형태 연습", en: "2-minute form practice", tipKo: "몸통과 팔다리의 방향을 먼저 잡고 형태를 더해 보세요. 시간은 별도 타이머로 확인하세요.", tipEn: "Start with the direction of the torso and limbs, then add form. Use a separate timer to track the time." },
  { id: "perspective", ko: "투시 확인", en: "Check perspective", tipKo: "참고 이미지의 수평선과 소실 방향을 살펴보고 직접 선을 그어 비교하세요.", tipEn: "Look for the horizon and vanishing directions, then draw your own lines to compare." },
  { id: "clean-lines", ko: "선 정리", en: "Refine your lines", tipKo: "큰 형태부터 선을 정리하고 가이드를 숨겨 내 선만으로도 형태가 읽히는지 확인하세요.", tipEn: "Refine the larger shapes first, then hide the guide to check whether your own lines read clearly." },
] as const;

const GUIDE_CHECKS = [
  { id: "light", ko: "옅은 가이드", en: "Faint guide", tipKo: "Studio에서 불투명도를 낮춰 내 선이 잘 보이도록 조절하세요.", tipEn: "Lower the guide opacity in Studio so your own lines remain visible." },
  { id: "balanced", ko: "반투명 가이드", en: "Translucent guide", tipKo: "Studio에서 가이드와 내 선을 함께 보기 편한 불투명도를 직접 고르세요.", tipEn: "Choose an opacity in Studio that lets you compare the guide and your own lines." },
  { id: "contrast", ko: "흑백·반전 비교", en: "Grayscale and flip comparison", tipKo: "Studio의 흑백·반전 도구로 형태를 확인하고 원래 보기로 돌아와 비교하세요.", tipEn: "Use Studio's grayscale and flip tools to check the forms, then return to the original view to compare." },
] as const;

const STEPS: readonly {
  readonly icon: typeof ImagePlus;
  readonly illustration: MotionIllustrationName;
  readonly title: string;
  readonly body: string;
  readonly bodyEn: string;
}[] = [
  {
    icon: ImagePlus,
    illustration: "camera",
    title: "레퍼런스를 선택해 가이드 시작",
    body: "Studio 레퍼런스에서 이미지를 선택하고 ‘이 이미지로 따라 그리기’를 누르세요. 선택한 이미지는 참고용 가이드로 표시되며 내보내는 결과에는 포함되지 않습니다.",
    bodyEn: "Choose an image in Studio references and select ‘Trace this image’. The image is displayed as a reference guide and is excluded from exports.",
  },
  {
    icon: Eye,
    illustration: "eye",
    title: "겹쳐 보고 선을 익히기",
    body: "겹쳐 보기와 옆에 보기를 전환하고 불투명도·흑백·반전을 조절하세요. 잠긴 가이드는 펜 입력을 받지 않아 그대로 그릴 수 있습니다.",
    bodyEn: "Switch between overlay and side-by-side views, and adjust opacity, grayscale, and flipping. A locked guide does not receive pen input, so you can draw over it.",
  },
  {
    icon: Layers3,
    illustration: "drawing-hand",
    title: "내 원고에서 직접 그리기",
    body: "실제 획은 현재 원고의 일반 드로잉 도구로 기록됩니다. 참고판을 숨기거나 닫아도 원고 획은 그대로 유지됩니다.",
    bodyEn: "Your strokes are recorded on the current manuscript using the normal drawing tools. Hiding or closing the reference keeps your manuscript strokes intact.",
  },
] as const;

export function TracePracticePage() {
  const t = useBilingual("domains.learn.TracePracticePage");
  const [practiceFocus, setPracticeFocus] = useState<(typeof PRACTICE_FOCUS)[number]>(PRACTICE_FOCUS[0]);
  const [guideCheck, setGuideCheck] = useState<(typeof GUIDE_CHECKS)[number]>(GUIDE_CHECKS[1]);
  useDocumentTitle("따라 그리기 연습");
  return <Container size="wide" className="py-7 sm:py-10 lg:py-12">
    <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <p className="eyebrow text-accent">ACADEMY · TRACE PRACTICE</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">참고 이미지는 가이드로, 내 선은 원고에.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
        {t("연습을 시작해 참고 이미지를 고른 뒤 ‘이 이미지로 따라 그리기’를 누르세요. 이미지를 가이드로 보며 내 원고에 직접 그릴 수 있습니다.", "Start practicing, choose a reference image, then select ‘Trace this image’. Draw on your own manuscript while using the image as a guide.")}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/studio/canvas?practice=trace" className={buttonClass({ size: "lg" })}>
          따라 그리기 시작 <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link to="/learn/recipes" className={buttonClass({ size: "lg", variant: "outline" })}>다른 실습 보기</Link>
      </div>
    </header>
    {/* 10초 이해 원칙 — 연습 흐름을 한 눈에 보여주는 단계 다이어그램. */}
    <MotionReveal className="mt-6">
      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-label="따라 그리기 흐름 한눈에 보기">
        <MotionStepFlow
          steps={STEPS.map((step, index) => ({
            title: `STEP ${index + 1} · ${step.title}`,
            description: t(step.body, step.bodyEn),
            icon: <MotionIllustration name={step.illustration} size="lg" />,
          }))}
        />
      </section>
    </MotionReveal>
    <details className="mt-6 rounded-2xl border border-line bg-panel p-5">
      <summary className="min-h-11 cursor-pointer py-3 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {t("연습 방법과 가이드 도구 알아보기", "Explore practice methods and guide tools")}
      </summary>
      <section className="mt-4" aria-label={t("연습 방법 참고", "Practice suggestions")}>
        <p className="text-sm leading-7 text-fg-2">
          {t("아래 선택은 참고 설명만 바꿉니다. Studio 설정은 자동으로 바뀌지 않으며, 타이머도 실행되지 않습니다.", "These choices only change the suggestions below. They do not change Studio settings or start a timer.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("연습 목표 참고", "Suggested practice focus")}>
          {PRACTICE_FOCUS.map((item) => <button
            key={item.id} type="button" aria-pressed={practiceFocus.id === item.id}
            onClick={() => setPracticeFocus(item)}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${practiceFocus.id === item.id ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50"}`}
          >{t(item.ko, item.en)}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("가이드 보기 참고", "Suggested guide checks")}>
          {GUIDE_CHECKS.map((item) => <button
            key={item.id} type="button" aria-pressed={guideCheck.id === item.id}
            onClick={() => setGuideCheck(item)}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${guideCheck.id === item.id ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50"}`}
          >{t(item.ko, item.en)}</button>)}
        </div>
        <div role="status" className="mt-4 rounded-xl bg-card p-4 text-sm leading-7 text-fg-2">
          <p>{t(practiceFocus.tipKo, practiceFocus.tipEn)}</p>
          <p className="mt-2">{t(guideCheck.tipKo, guideCheck.tipEn)}</p>
        </div>
      </section>
    <MotionReveal className="mt-6">
    <section className="grid gap-3 lg:grid-cols-3" aria-label="따라 그리기 흐름">
      {STEPS.map(({ icon: Icon, illustration, title, body, bodyEn }, index) => <article key={title} className="rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
          <MotionIllustration name={illustration} size="md" animated={false} />
        </div>
        <p className="mt-4 text-xs font-bold tracking-[0.14em] text-fg-3">STEP {index + 1}</p>
        <h2 className="mt-2 text-lg font-bold text-fg">{title}</h2>
        <p className="mt-2 text-sm leading-7 text-fg-2">{t(body, bodyEn)}</p>
      </article>)}
    </section>
    </MotionReveal>
    <section className="mt-6 rounded-2xl border border-line bg-panel p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><FlipHorizontal2 size={18} className="text-accent" />연습 도구</h2>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-fg-2">
          <li>겹쳐 보기와 레퍼런스 창 보기 전환</li>
          <li>불투명도·흑백·좌우/상하 반전과 배치 잠금</li>
          <li>원본 숨기기·비교·다시 연습·완료 상태</li>
          <li>가이드는 결과 이미지·썸네일·타임랩스에서 제외</li>
        </ul>
      </div>
    </section>
    </details>
    <section className="mt-6 rounded-2xl border border-line bg-panel p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} className="text-accent" />공개·권리 확인</h2>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          참고 이미지를 볼 수 있다는 사실이 재배포 권한을 뜻하지 않습니다. 공개·내보내기 전에 원본의 이용 조건을 직접 확인하세요.
          이 실습은 다른 사람의 원본 이미지를 자동 게시하거나 학습 데이터로 전송하지 않습니다.
        </p>
      </div>
    </section>
    <aside className="mt-6 rounded-2xl border border-warn/35 bg-warn/10 p-4 text-sm leading-7 text-fg-2">
      화면 공유 중이라면 개인 사진이나 비공개 참고자료가 보이지 않는지 먼저 확인하세요.
      브라우저가 운영체제 전체 화면 공유의 내용을 자동으로 숨겨준다고 가정하지 않습니다.
    </aside>
  </Container>;
}
