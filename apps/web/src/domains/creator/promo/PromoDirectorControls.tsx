import { directPromo, PROMO_DEFAULT_PRESENTATION, PROMO_DIRECTOR_TEMPLATES, PROMO_ENDING_SECONDS, PROMO_SHORT_MAX_PANELS, PROMO_SHORT_SECONDS, promoMaxPanels, type PromoProject } from "./promo-model";
import { subStatusText } from "../status-i18n/studio-sub-status-i18n";

export function PromoDirectorControls({ project, disabled, onApply, onShortPreset, onPatch }: {
  project: PromoProject; disabled: boolean; onApply: (project: PromoProject) => void;
  /** 10초 쇼츠 프리셋 — 길이·비율까지 바꾸므로 다른 연출 템플릿과 달리 호출자가 길이 변경 규칙(컷 수 상한 등)을 적용한다. */
  onShortPreset: () => void;
  /** field는 브랜드 문구·강조색 같은 연속 입력만 넘긴다. 선택 상자·체크박스는 생략해 실행 취소 한 단계로 남긴다. */
  onPatch: (patch: Partial<PromoProject>, field?: keyof typeof PROMO_DEFAULT_PRESENTATION) => void;
}) {
  const options = { ...PROMO_DEFAULT_PRESENTATION, ...project.presentation };
  const patch = (value: Partial<typeof options>, field?: keyof typeof options) => onPatch({ presentation: { ...options, ...value } }, field);
  const shortOverCap = project.panels.length > promoMaxPanels(PROMO_SHORT_SECONDS);
  return <fieldset className="promo-card" disabled={disabled}>
    <legend>연출 감독 · 무료 로컬 엔진</legend>
    <p className="promo-muted">목적에 맞는 카메라·전환·효과·읽기 시간을 한 번에 적용합니다. 컷 순서와 입력한 대사는 유지하며, 장면을 새로 생성하는 AI는 아닙니다.</p>
    <div className="promo-template-grid">{PROMO_DIRECTOR_TEMPLATES.map((template) => template.id === "short10"
      ? <button type="button" key={template.id} data-promo-short-preset disabled={shortOverCap} aria-describedby="promo-short-preset-note" onClick={onShortPreset}>
        <strong>{template.label}</strong><span>{template.description}</span>
      </button>
      : <button type="button" key={template.id} disabled={!project.panels.length} onClick={() => onApply(directPromo(project, template.id))}>
        <strong>{template.label}</strong><span>{template.description}</span>
      </button>)}</div>
    {shortOverCap
      ? <p id="promo-short-preset-note" className="promo-error" role="alert">{subStatusText("studio.subStatus.director.shortOverCap", { max: PROMO_SHORT_MAX_PANELS, current: project.panels.length }, "10초 쇼츠 프리셋은 컷 {max}개까지만 쓸 수 있어요. 지금은 {current}개라서 적용할 수 없어요. 컷은 지우지 않았어요.")}</p>
      : <p id="promo-short-preset-note" className="promo-muted">10초 쇼츠 트레일러는 전체 길이를 {PROMO_SHORT_SECONDS}초(본편 {PROMO_SHORT_SECONDS - PROMO_ENDING_SECONDS}초 + 마지막 {PROMO_ENDING_SECONDS}초), 화면 비율을 세로 9:16으로 맞추고 컷을 최대 {PROMO_SHORT_MAX_PANELS}개로 제한해요. 컷마다 읽기 시간을 계산해 상대 길이를 다시 맞춥니다.</p>}
    <div className="promo-inline-grid">
      <label htmlFor="promo-caption-style">자막 스타일<select id="promo-caption-style" value={options.captionStyle} onChange={(event) => patch({ captionStyle: event.target.value as typeof options.captionStyle })}><option value="classic">시네마틱</option><option value="boxed">가독성 박스</option><option value="typewriter">타자 등장</option></select></label>
      <label htmlFor="promo-caption-position">자막 위치<select id="promo-caption-position" value={options.captionPosition} onChange={(event) => patch({ captionPosition: event.target.value as typeof options.captionPosition })}><option value="bottom">하단</option><option value="center">중앙</option><option value="top">상단</option></select></label>
      <label htmlFor="promo-brand-color">브랜드 강조색<input id="promo-brand-color" type="color" value={options.brandColor} onChange={(event) => patch({ brandColor: event.target.value }, "brandColor")} /></label>
    </div>
    <label htmlFor="promo-brand-text">엔딩 브랜드 문구<input id="promo-brand-text" maxLength={50} value={options.brandText} onChange={(event) => patch({ brandText: event.target.value }, "brandText")} /></label>
    <label className="promo-toggle"><input type="checkbox" checked={options.safeArea} onChange={(event) => patch({ safeArea: event.target.checked })} />세로 영상 자막 여백 확보 · 앱별 UI 안전영역은 업로드 전 확인</label>
    <label className="promo-toggle"><input type="checkbox" checked={options.reducedMotion} onChange={(event) => patch({ reducedMotion: event.target.checked })} />저자극 연출 · 카메라·입자·타자 효과 없이 저장</label>
  </fieldset>;
}
