import { useT } from "@/shared/lib/i18n";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Palette,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  createStudioAiProjectHandoff,
  writeStudioAiProjectHandoff,
} from "../ai/studio-ai-project-handoff";
import {
  productionAiAssistDisclosure,
  type ProductionAiAssistPlan,
} from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import {
  buildShadingDownloadManifest,
  computeMultiplyShadedColor,
  recommendShadingResolution,
  SHADING_LIGHT_DIRECTIONS,
  type ShadingAmount,
  type ShadingDownloadPackaging,
  type ShadingDownloadScope,
  type ShadingEdgeStyle,
  type ShadingLightDirection,
  type ShadingRegionCandidate,
} from "./production-shading-assistant-model";

const lightingLabels = {
  soft: "부드러운 확산광",
  dramatic: "명암 대비가 큰 극적 조명",
  backlight: "역광",
  night: "야간 조명",
} as const;
const colorLabels = {
  preserve: "기존 색을 유지",
  warm: "따뜻한 색온도",
  cool: "차가운 색온도",
  monochrome: "단색 명암",
} as const;

function planPrompt(plan: ProductionAiAssistPlan, process: ProductionManuscriptProcess): string {
  const scope = plan.scope === "selection"
    ? "현재 선택 영역"
    : plan.scope === "active-panel" ? "현재 컷" : "현재 페이지";
  const output = plan.output === "new-layer"
    ? "원본을 덮지 말고 새 음영 레이어"
    : "원본을 덮지 말고 새 revision 후보";
  return [
    `대상 원고: ${process.artifact.title}`,
    `${scope}에 ${lightingLabels[plan.lighting]} 기준의 음영·광원 보조를 제안해줘.`,
    `${colorLabels[plan.color]} 원칙을 지키고 캐릭터 선과 말풍선은 훼손하지 마.`,
    `결과는 ${output}로 적용할 수 있게 미리보기와 마스크 경계를 제공해줘.`,
    "실행 전 처리 범위·공급자·예상 비용·외부 전송 여부를 다시 확인해.",
    "사용자가 명시적으로 승인하기 전에는 문서를 변경하지 마.",
  ].join("\n");
}

export function ProductionFocusedAiWorkflow({
  workId,
  process,
  editorHref,
}: {
  readonly workId: string;
  readonly process: ProductionManuscriptProcess | null;
  readonly editorHref: string | null;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<ProductionAiAssistPlan>({
    scope: "selection",
    lighting: "soft",
    color: "preserve",
    provider: "project-default",
    output: "new-layer",
  });
  const [notice, setNotice] = useState("");
  const [lightDirection, setLightDirection] = useState<ShadingLightDirection>("top-left");
  const [edgeStyle, setEdgeStyle] = useState<ShadingEdgeStyle>("hard");
  const [shadowAmount, setShadowAmount] = useState<ShadingAmount>("normal");
  const [cropWidthPx, setCropWidthPx] = useState<number>(1680);
  const [cropHeightPx, setCropHeightPx] = useState<number>(1920);
  const [shadowHex, setShadowHex] = useState<string>("#5c5470");
  const [opacityPercent, setOpacityPercent] = useState<number>(72);
  const [downloadScope, setDownloadScope] = useState<ShadingDownloadScope>("all");
  const [downloadPackaging, setDownloadPackaging] = useState<ShadingDownloadPackaging>("merged");
  const [regions, setRegions] = useState<readonly ShadingRegionCandidate[]>([
    {
      id: "reg-cut12-hero",
      pageNumber: 1,
      label: "12컷 주인공 상반신",
      widthPx: 1680,
      heightPx: 1920,
      lightDirection: "top-left",
      edgeStyle: "hard",
      shadowAmount: "normal",
      resolution: "2K",
      shadowHex: "#5c5470",
      opacityPercent: 72,
      visible: true,
    },
    {
      id: "reg-cut14-cape",
      pageNumber: 1,
      label: "14컷 망토 역광 실루엣",
      widthPx: 2400,
      heightPx: 2800,
      lightDirection: "backlight",
      edgeStyle: "soft",
      shadowAmount: "backlight",
      resolution: "4K",
      shadowHex: "#3b4268",
      opacityPercent: 80,
      visible: true,
    },
    {
      id: "reg-cut21-corridor",
      pageNumber: 2,
      label: "21컷 성벽 복도 측면광",
      widthPx: 1440,
      heightPx: 1600,
      lightDirection: "right",
      edgeStyle: "hard",
      shadowAmount: "narrow",
      resolution: "2K",
      shadowHex: "#4e5266",
      opacityPercent: 65,
      visible: true,
    },
  ]);

  const resolutionRecommendation = useMemo(
    () => recommendShadingResolution(cropWidthPx, cropHeightPx),
    [cropWidthPx, cropHeightPx],
  );
  const multiplyPreview = useMemo(
    () =>
      computeMultiplyShadedColor({
        baseRgb: { r: 244, g: 222, b: 205 },
        shadowHex,
        maskStrength: 0.78,
        opacityPercent,
      }),
    [shadowHex, opacityPercent],
  );
  const downloadManifest = useMemo(
    () =>
      buildShadingDownloadManifest({
        regions,
        scope: downloadScope,
        packaging: downloadPackaging,
        targetPageNumber: 1,
        targetRegionId: "reg-cut12-hero",
      }),
    [regions, downloadScope, downloadPackaging],
  );
  const disclosures = useMemo(() => productionAiAssistDisclosure(plan), [plan]);
  const prompt = process ? planPrompt(plan, process) : "";

  const launch = () => {
    if (!process || !editorHref) return;
    try {
      const handoff = createStudioAiProjectHandoff({
        projectId: workId,
        documentId: process.artifact.id,
        tool: "palette",
        prompt,
        source: "review",
      });
      writeStudioAiProjectHandoff(window.sessionStorage, handoff);
      setNotice("편집기에서 선택 영역과 실행 조건을 다시 확인합니다. 아직 생성이나 과금은 시작되지 않았습니다.");
      navigate(editorHref);
    } catch {
      setNotice(t("productionHub.status.aiAssistHandoffFailed", "AI 보조 요청을 안전하게 전달하지 못했어요. 편집기에서 AI 메뉴를 눌러 직접 시작해 주세요."));
    }
  };
  return <section className="rounded-3xl border border-accent/30 bg-card p-4 sm:p-6" aria-labelledby="focused-ai-title" data-production-focused-ai="">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">
          <Sparkles className="size-4" aria-hidden="true" /> FOCUSED AI ASSIST
        </p>
        <h2 id="focused-ai-title" className="mt-2 text-xl font-black text-fg">선택 영역 음영·광원 보조를 끝까지 안내합니다</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">범용 AI 메뉴가 아니라 반복 작업 하나를 준비합니다. Production에서는 실행하지 않고, 편집기에서 대상 픽셀·공급자·비용·외부 전송을 다시 확인한 뒤 새 레이어나 revision으로 적용합니다.</p>
      </div>
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-good/30 bg-good/10 px-3 text-xs font-bold text-good">
        <CheckCircle2 className="size-4" aria-hidden="true" /> 원본 비파괴
      </span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs font-bold text-fg-2">처리 범위
        <select value={plan.scope} onChange={(event) => setPlan({ ...plan, scope: event.target.value as ProductionAiAssistPlan["scope"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="selection">선택 영역</option><option value="active-panel">현재 컷</option><option value="active-page">현재 페이지</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">조명
        <select value={plan.lighting} onChange={(event) => setPlan({ ...plan, lighting: event.target.value as ProductionAiAssistPlan["lighting"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="soft">부드러운 확산광</option><option value="dramatic">극적 대비</option><option value="backlight">역광</option><option value="night">야간</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">색상
        <select value={plan.color} onChange={(event) => setPlan({ ...plan, color: event.target.value as ProductionAiAssistPlan["color"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="preserve">기존 색 유지</option><option value="warm">따뜻하게</option><option value="cool">차갑게</option><option value="monochrome">단색 명암</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">처리 방식
        <select value={plan.provider} onChange={(event) => setPlan({ ...plan, provider: event.target.value as ProductionAiAssistPlan["provider"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="project-default">프로젝트 기본</option><option value="local">로컬 우선</option><option value="external">외부 공급자</option>
        </select>
      </label>
      <label className="text-xs font-bold text-fg-2">적용 결과
        <select value={plan.output} onChange={(event) => setPlan({ ...plan, output: event.target.value as ProductionAiAssistPlan["output"] })} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
          <option value="new-layer">새 레이어</option><option value="new-revision">새 revision 후보</option>
        </select>
      </label>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <article className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2"><Palette className="size-4 text-accent" aria-hidden="true" /><h3 className="font-black text-fg">편집기로 전달할 작업 지시</h3></div>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-card p-3 text-xs leading-5 text-fg-2">{prompt || "이미지 원고를 선택하면 작업 지시가 만들어집니다."}</pre>
      </article>
      <article className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2"><ExternalLink className="size-4 text-accent" aria-hidden="true" /><h3 className="font-black text-fg">실행 전 공개 사항</h3></div>
        <ul className="mt-3 space-y-2">{disclosures.map((item) => <li key={item} className="flex items-start gap-2 text-xs leading-5 text-fg-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />{item}</li>)}</ul>
      </article>
    </div>

    <div className="mt-4 rounded-2xl border border-line bg-panel p-4" data-testid="shading-assistant-detail-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-fg">
          AI 음영 어시스턴트 세부 파라미터 (11종 광원 · 엣지 스타일 · 음영 양 · 2K/4K 토큰 추정 · Multiply 블렌딩)
        </h3>
        <span
          data-testid="shading-resolution-recommendation-badge"
          className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-bold text-accent"
        >
          추천 해상도: {resolutionRecommendation.resolution} (예상 {resolutionRecommendation.estimatedTokens}토큰)
        </span>
      </div>

      {/* 11종 광원 위치 선택기 */}
      <div className="mt-3">
        <p className="text-xs font-bold text-fg-2">광원 방향 (8방위 + 정면 / 역광 / 최적 자동)</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SHADING_LIGHT_DIRECTIONS.map((dir) => (
            <button
              key={dir.id}
              type="button"
              data-testid={`shading-light-dir-${dir.id}`}
              aria-pressed={lightDirection === dir.id}
              onClick={() => setLightDirection(dir.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                lightDirection === dir.id
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-card text-fg-2"
              }`}
            >
              {dir.badge} {dir.labelKo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-fg-2">
          음영 엣지 스타일
          <select
            aria-label="음영 엣지 스타일"
            data-testid="shading-edge-style-select"
            value={edgeStyle}
            onChange={(e) => setEdgeStyle(e.target.value as ShadingEdgeStyle)}
            className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
          >
            <option value="hard">하드 엣지 (셀 채색 스타일)</option>
            <option value="soft">소프트 엣지 (브러시 채색 스타일)</option>
          </select>
        </label>

        <label className="text-xs font-bold text-fg-2">
          음영 양 (Shadow Amount)
          <select
            aria-label="음영 양"
            data-testid="shading-amount-select"
            value={shadowAmount}
            onChange={(e) => setShadowAmount(e.target.value as ShadingAmount)}
            className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
          >
            <option value="backlight">역광 (넓고 깊은 음영)</option>
            <option value="normal">보통 (표준 인물·배경 음영)</option>
            <option value="narrow">좁음 (외곽선 포인트 음영)</option>
          </select>
        </label>

        <label className="text-xs font-bold text-fg-2">
          크롭 영역 가로(px)
          <input
            type="number"
            aria-label="크롭 영역 가로 픽셀"
            data-testid="shading-crop-width-input"
            min={256}
            max={4096}
            value={cropWidthPx}
            onChange={(e) => setCropWidthPx(Number(e.target.value) || 1024)}
            className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
          />
        </label>

        <label className="text-xs font-bold text-fg-2">
          크롭 영역 세로(px)
          <input
            type="number"
            aria-label="크롭 영역 세로 픽셀"
            data-testid="shading-crop-height-input"
            min={256}
            max={4096}
            value={cropHeightPx}
            onChange={(e) => setCropHeightPx(Number(e.target.value) || 1024)}
            className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
          />
        </label>
      </div>

      {/* 실시간 RGB/Hex 곱하기(Multiply) 블렌딩 미리보기 & 투명 PNG 다운로드 패키징 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 font-bold text-fg-2">
            음영 색상(Hex):
            <input
              type="text"
              aria-label="음영 Hex 색상"
              data-testid="shading-hex-input"
              value={shadowHex}
              onChange={(e) => setShadowHex(e.target.value)}
              className="w-24 rounded border border-line bg-panel px-2 py-1 text-xs text-fg"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 font-bold text-fg-2">
            불투명도({opacityPercent}%):
            <input
              type="range"
              aria-label="음영 불투명도"
              min={10}
              max={100}
              value={opacityPercent}
              onChange={(e) => setOpacityPercent(Number(e.target.value))}
            />
          </label>
          <span data-testid="shading-multiply-preview-readout" className="font-bold text-fg">
            Multiply 합성 결과: <code>{multiplyPreview.hex}</code> (RGB {multiplyPreview.r}, {multiplyPreview.g}, {multiplyPreview.b})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="음영 다운로드 범위"
            data-testid="shading-download-scope-select"
            value={downloadScope}
            onChange={(e) => setDownloadScope(e.target.value as ShadingDownloadScope)}
            className="rounded border border-line bg-panel px-2 py-1 text-xs"
          >
            <option value="all">전체 다운로드</option>
            <option value="page">페이지별 다운로드</option>
            <option value="region">선택 영역만 다운로드</option>
          </select>

          <select
            aria-label="음영 다운로드 패키징 방식"
            data-testid="shading-download-packaging-select"
            value={downloadPackaging}
            onChange={(e) => setDownloadPackaging(e.target.value as ShadingDownloadPackaging)}
            className="rounded border border-line bg-panel px-2 py-1 text-xs"
          >
            <option value="merged">합쳐진 결과물 (페이지당 1장 병합 PNG)</option>
            <option value="separated">분리된 결과물 (영역별 개별 투명 PNG)</option>
          </select>

          <span data-testid="shading-download-manifest-count" className="text-fg-2">
            출력 파일: <strong>{downloadManifest.length}개</strong> ({downloadManifest.map((f) => f.fileName).join(", ")})
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {regions.map((region) => (
          <label
            key={region.id}
            data-testid={`shading-region-item-${region.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg-2"
          >
            <input
              type="checkbox"
              checked={region.visible}
              onChange={(e) =>
                setRegions((prev) =>
                  prev.map((item) => (item.id === region.id ? { ...item, visible: e.target.checked } : item)),
                )
              }
            />
            <span>
              {region.pageNumber}P · {region.label} ({region.resolution})
            </span>
          </label>
        ))}
      </div>
    </div>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-3">{t("productionHub.status.aiWorkflowFailurePolicyNote", "실패·취소·재시도와 중복 청구 방지는 실제 편집기 실행 경계에서 확인해요.")}</p>
      <button type="button" disabled={!process || !editorHref} onClick={launch} className={buttonClass({ className: "min-h-11 gap-2" })}>
        <WandSparkles className="size-4" aria-hidden="true" /> 편집기에서 미리보기·비용 확인 <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
    {notice ? <p className="mt-3 text-xs text-fg-2" role="status">{notice}</p> : null}
  </section>;
}
