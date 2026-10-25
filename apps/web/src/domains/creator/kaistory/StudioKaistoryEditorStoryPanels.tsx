/**
 * StudioKaistoryEditorStoryPanels.tsx — KAISTORY `editor`(렌더·그래픽노블·다화자 TTS) 및
 * `story`(독자 노출 기간·학습카드 폴백·앱 버전 정책) 탭 패널 서브컴포넌트.
 */

import { Volume2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  KAISTORY_LANG_CODES,
  type KaistoryContiDialogue,
  type KaistoryLangCode,
  type KaistorySpeakerDisplayMode,
} from "./kaistory-conti-model";
import {
  buildBubbleTailGeometry,
  KAISTORY_FOREGROUND_EFFECT_CATALOG,
  KAISTORY_SFX_STYLE_PRESETS,
  KAISTORY_TAIL_PROFILE_LABELS,
  type KaistoryBubbleTailProfile,
  type KaistoryFiveLangDialogueRow,
  type KaistoryKontiRelinkCandidate,
  type KaistorySpeakerVisualStyle,
} from "./kaistory-design-engine";
import {
  fitBubbleFontSizeToBounds,
  KAISTORY_A4_HEIGHT_PT,
  KAISTORY_A4_WIDTH_PT,
  type KaistoryEditorBubbleBox,
  type KaistoryFiveLangQaCutSheet,
  type KaistoryOrderedExportAsset,
} from "./kaistory-editor-compositor";
import type {
  evaluateStudentExposureStatus,
  resolveStudyCardForViewer,
  validateAppVersionPolicy,
} from "./kaistory-story-platform";

type KaistoryBubbleTailGeometry = ReturnType<typeof buildBubbleTailGeometry>;
type KaistoryExposureEvaluation = ReturnType<typeof evaluateStudentExposureStatus>;
type KaistoryResolvedStudyCard = ReturnType<typeof resolveStudyCardForViewer>;
type KaistoryVersionPolicyValidation = ReturnType<typeof validateAppVersionPolicy>;

export function StudioKaistoryDesignTabPanel({
  tailProfile,
  onChangeTailProfile,
  speakerDisplayMode,
  onChangeSpeakerDisplayMode,
  tailGeometry,
  speakerVisuals,
  secondBubbleX,
  onSnapSecondBubble,
  selectedEffectId,
  onChangeSelectedEffectId,
  effectRotationDeg,
  onRotateEffectBy15,
  selectedSfxPresetId,
  onChangeSelectedSfxPresetId,
  relinkPreview,
  fiveLangRows,
}: {
  readonly tailProfile: KaistoryBubbleTailProfile;
  readonly onChangeTailProfile: (next: KaistoryBubbleTailProfile) => void;
  readonly speakerDisplayMode: KaistorySpeakerDisplayMode;
  readonly onChangeSpeakerDisplayMode: (next: KaistorySpeakerDisplayMode) => void;
  readonly tailGeometry: KaistoryBubbleTailGeometry;
  readonly speakerVisuals: KaistorySpeakerVisualStyle;
  readonly secondBubbleX: number;
  readonly onSnapSecondBubble: () => void;
  readonly selectedEffectId: string;
  readonly onChangeSelectedEffectId: (next: string) => void;
  readonly effectRotationDeg: number;
  readonly onRotateEffectBy15: () => void;
  readonly selectedSfxPresetId: string;
  readonly onChangeSelectedSfxPresetId: (next: string) => void;
  readonly relinkPreview: readonly KaistoryKontiRelinkCandidate[];
  readonly fiveLangRows: readonly KaistoryFiveLangDialogueRow[];
}) {
  return (
    <div
      role="tabpanel"
      id="kaistory-panel-design"
      aria-labelledby="kaistory-tab-design"
      className="mt-4 grid gap-4 lg:grid-cols-2"
    >
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="text-sm font-bold text-fg">
          6종 말풍선 꼬리 이진 탐색 기하 & 이웃 말풍선 연결·스냅
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-fg-2">
            꼬리 프로파일
            <select
              aria-label="꼬리 프로파일"
              value={tailProfile}
              onChange={(e) => onChangeTailProfile(e.target.value as KaistoryBubbleTailProfile)}
              className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              {(
                Object.entries(KAISTORY_TAIL_PROFILE_LABELS) as [
                  KaistoryBubbleTailProfile,
                  string,
                ][]
              ).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-fg-2">
            웹툰 화자 표시 방식
            <select
              aria-label="웹툰 화자 표시 방식"
              value={speakerDisplayMode}
              onChange={(e) =>
                onChangeSpeakerDisplayMode(e.target.value as KaistorySpeakerDisplayMode)
              }
              className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              <option value="name">이름표 배지 (명도 대비 자동)</option>
              <option value="color">말풍선 면+테두리 자동 색</option>
              <option value="outline">말풍선 테두리만 자동 색</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
          <p>
            교차점 루트 좌표: ({Math.round(tailGeometry.rootX)}, {Math.round(tailGeometry.rootY)}) ·{" "}
            {tailGeometry.profile === "thought"
              ? `생각 원 ${tailGeometry.thoughtDots.length}개`
              : `폴리곤 꼭짓점 ${tailGeometry.polygonPoints.length}개`}
          </p>
          <p className="mt-1">
            화자 스타일: 배지={speakerVisuals.showSpeakerBadge ? "표시" : "숨김"} · 면=
            {speakerVisuals.bubbleFillHex} · 선={speakerVisuals.bubbleStrokeHex}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onSnapSecondBubble}
              className="min-h-9 rounded-xl bg-accent px-3 text-xs font-bold text-on-accent"
            >
              앞 말풍선에 살짝 겹치도록 옮기기 (현재 X={secondBubbleX}px)
            </button>
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <h4 className="text-xs font-bold text-fg">
            전경 효과 카탈로그 (15° 회전) & SFX 다중 외곽선 프리셋
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="전경 효과"
              value={selectedEffectId}
              onChange={(e) => onChangeSelectedEffectId(e.target.value)}
              className="min-h-9 rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              {KAISTORY_FOREGROUND_EFFECT_CATALOG.map((fx) => (
                <option key={fx.id} value={fx.id}>
                  [{fx.categoryLabelKo}] {fx.labelKo}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRotateEffectBy15}
              className="min-h-9 rounded-xl border border-line bg-card px-2.5 text-xs font-bold text-fg"
            >
              +15° 회전 ({effectRotationDeg}°)
            </button>
            <select
              aria-label="SFX 프리셋"
              value={selectedSfxPresetId}
              onChange={(e) => onChangeSelectedSfxPresetId(e.target.value)}
              className="min-h-9 rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            >
              {KAISTORY_SFX_STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  SFX: {preset.labelKo}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="text-sm font-bold text-fg">
          끊어진 kontiRef Levenshtein(≥0.8) 복원 & 5개국어 대사 시트(_대사.xlsx)
        </h3>
        <p className="rounded-xl border border-line bg-card p-2.5 text-xs text-fg-2">
          자동 재연결 상태: <strong>{relinkPreview[0]?.status}</strong> (유사도{" "}
          {Math.round((relinkPreview[0]?.similarity ?? 0) * 100)}% → 연결 대사 ID:{" "}
          <code>{relinkPreview[0]?.linkedDialogueId}</code>)
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-left text-[0.7rem]">
            <thead className="border-b border-line bg-panel text-fg-2">
              <tr>
                <th className="px-2 py-1.5">쪽/순서</th>
                <th className="px-2 py-1.5">화자</th>
                <th className="px-2 py-1.5">KO</th>
                <th className="px-2 py-1.5">EN</th>
                <th className="px-2 py-1.5">JA</th>
                <th className="px-2 py-1.5">ZH</th>
                <th className="px-2 py-1.5">RU</th>
              </tr>
            </thead>
            <tbody>
              {fiveLangRows.map((row) => (
                <tr key={`${row.pageNumber}-${row.order}`} className="border-b border-line/50">
                  <td className="px-2 py-1.5">
                    {row.pageNumber}-{row.order}
                  </td>
                  <td className="px-2 py-1.5 font-semibold">{row.speaker}</td>
                  <td className="px-2 py-1.5">{row.KO}</td>
                  <td className="px-2 py-1.5">{row.EN}</td>
                  <td className="px-2 py-1.5">{row.JA}</td>
                  <td className="px-2 py-1.5">{row.ZH}</td>
                  <td className="px-2 py-1.5">{row.RU}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function StudioKaistoryEditorTabPanel({
  activeLang,
  naverAlternatingApplied,
  onToggleNaverAlternating,
  editorBubbles,
  initialDialogues,
  qaSheets,
  dialogueReport,
  editorMode,
  onChangeEditorMode,
  graphicNovelManuscript,
  exportPlan,
  ttsVoiceAssignments,
  ttsManifest,
}: {
  readonly activeLang: KaistoryLangCode;
  readonly naverAlternatingApplied: boolean;
  readonly onToggleNaverAlternating: () => void;
  readonly editorBubbles: readonly KaistoryEditorBubbleBox[];
  readonly initialDialogues: readonly KaistoryContiDialogue[];
  readonly qaSheets: readonly KaistoryFiveLangQaCutSheet[];
  readonly dialogueReport: { readonly fileName: string; readonly reportText: string };
  readonly editorMode: "webtoon_manga" | "graphic_novel";
  readonly onChangeEditorMode: (mode: "webtoon_manga" | "graphic_novel") => void;
  readonly graphicNovelManuscript: string;
  readonly exportPlan: readonly KaistoryOrderedExportAsset[];
  readonly ttsVoiceAssignments: Readonly<Record<string, string>>;
  readonly ttsManifest: string;
}) {
  return (
    <div
      role="tabpanel"
      id="kaistory-panel-editor"
      aria-labelledby="kaistory-tab-editor"
      className="mt-4 grid gap-4 lg:grid-cols-2"
    >
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-fg">
            네이버 문법 좌/우 배치 & 5언어 비교 시트 ([glyph] · [fallback] · [overflow])
          </h3>
          <button
            type="button"
            onClick={onToggleNaverAlternating}
            className="min-h-9 rounded-xl bg-accent px-3 text-xs font-bold text-on-accent"
          >
            {naverAlternatingApplied ? "원래 배치로 복귀" : "네이버 문법 좌/우 번갈아 배치"}
          </button>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
          <p className="font-bold text-fg">
            컷 #1 말풍선 X 좌표:{" "}
            {editorBubbles.map((b) => `${b.speakerName}(X=${b.x}px)`).join(" · ")}
          </p>
          <p className="mt-1 text-[0.7rem] text-fg-3">
            말풍선 넘침 자동 줄이기(fontfit) 예시: 26px →{" "}
            {
              fitBubbleFontSizeToBounds({
                text: initialDialogues[0]!.translations[activeLang] ?? initialDialogues[0]!.text,
                bubbleWidth: 160,
                bubbleHeight: 80,
                initialFontSizePx: 26,
              }).fittedFontSizePx
            }
            px
          </p>
          <ul className="mt-2 space-y-1 text-[0.7rem]">
            {KAISTORY_LANG_CODES.map((lang) => (
              <li key={lang}>
                <strong>{lang.toUpperCase()}</strong>:{" "}
                {qaSheets[0]?.byLang[lang].map((d) => d.summaryKo).join(" / ")}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 text-xs">
          <p className="font-bold text-fg">{dialogueReport.fileName}</p>
          <pre className="mt-1 whitespace-pre-wrap text-[0.7rem] text-fg-2">
            {dialogueReport.reportText}
          </pre>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Volume2 size={15} className="text-accent" aria-hidden="true" />
            그래픽노블(소설) A4 전환 · 학습카드 인터리빙 · 다화자 TTS WAV
          </h3>
          <div className="flex gap-1">
            <button
              type="button"
              aria-pressed={editorMode === "webtoon_manga"}
              onClick={() => onChangeEditorMode("webtoon_manga")}
              className={cn(
                "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                editorMode === "webtoon_manga"
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2",
              )}
            >
              웹툰/만화
            </button>
            <button
              type="button"
              aria-pressed={editorMode === "graphic_novel"}
              onClick={() => onChangeEditorMode("graphic_novel")}
              className={cn(
                "min-h-8 rounded-lg border px-2.5 text-xs font-bold",
                editorMode === "graphic_novel"
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2",
              )}
            >
              소설(그래픽노블)
            </button>
          </div>
        </div>

        {editorMode === "graphic_novel" ? (
          <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
            <p className="font-bold text-fg">
              그래픽노블 A4 조판 설정 ({KAISTORY_A4_WIDTH_PT} × {KAISTORY_A4_HEIGHT_PT} pt) 원고 (
              {activeLang.toUpperCase()})
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap text-[0.72rem]">
              {graphicNovelManuscript}
            </pre>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
            <p className="font-bold text-fg">
              학습카드 자동 끼워넣기 내보내기 순서 ({activeLang.toUpperCase()})
            </p>
            <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-[0.72rem]">
              {exportPlan.map((asset) => (
                <li key={asset.fileName}>
                  [{asset.kind}] <code>{asset.fileName}</code>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
          <p className="font-bold text-fg">
            등장인물 + 나레이터 TTS 자동 배정 (지수={ttsVoiceAssignments["char-1"]}, 민준=
            {ttsVoiceAssignments["char-2"]}, 나레이터={ttsVoiceAssignments["narrator"]})
          </p>
          <pre className="mt-1.5 overflow-x-auto whitespace-pre text-[0.68rem] text-fg-3">
            {ttsManifest}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function StudioKaistoryStoryTabPanel({
  activeLang,
  exposedToStudents,
  onChangeExposedToStudents,
  serviceStartDate,
  onChangeServiceStartDate,
  serviceEndDate,
  onChangeServiceEndDate,
  exposureEval,
  viewerMode,
  onChangeViewerMode,
  studyCardResolution,
  latestVersion,
  onChangeLatestVersion,
  minVersion,
  onChangeMinVersion,
  versionPolicy,
}: {
  readonly activeLang: KaistoryLangCode;
  readonly exposedToStudents: boolean;
  readonly onChangeExposedToStudents: (next: boolean) => void;
  readonly serviceStartDate: string;
  readonly onChangeServiceStartDate: (next: string) => void;
  readonly serviceEndDate: string;
  readonly onChangeServiceEndDate: (next: string) => void;
  readonly exposureEval: KaistoryExposureEvaluation;
  readonly viewerMode: "webtoon" | "manga";
  readonly onChangeViewerMode: (next: "webtoon" | "manga") => void;
  readonly studyCardResolution: KaistoryResolvedStudyCard;
  readonly latestVersion: string;
  readonly onChangeLatestVersion: (next: string) => void;
  readonly minVersion: string;
  readonly onChangeMinVersion: (next: string) => void;
  readonly versionPolicy: KaistoryVersionPolicyValidation;
}) {
  return (
    <div
      role="tabpanel"
      id="kaistory-panel-story"
      aria-labelledby="kaistory-tab-story"
      className="mt-4 grid gap-4 lg:grid-cols-2"
    >
      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="text-sm font-bold text-fg">
          학생 노출 설정 & 언어별 서비스 기간 · 학습카드 폴백 해석기
        </h3>
        <label className="flex items-center gap-2 text-xs font-semibold text-fg">
          <input
            type="checkbox"
            checked={exposedToStudents}
            onChange={(e) => onChangeExposedToStudents(e.target.checked)}
            className="size-4 accent-accent"
          />
          학생에게 노출 (노출을 켜면 아래 서비스 기간 동안 학생에게 표시됩니다)
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-fg-2">
            서비스 시작일
            <input
              type="date"
              value={serviceStartDate}
              onChange={(e) => onChangeServiceStartDate(e.target.value)}
              className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>
          <label className="text-xs font-semibold text-fg-2">
            서비스 종료일
            <input
              type="date"
              value={serviceEndDate}
              onChange={(e) => onChangeServiceEndDate(e.target.value)}
              className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>
        </div>
        <p className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg">
          현재 노출 판정 ({activeLang.toUpperCase()}): {exposureEval.labelKo}
        </p>

        <div className="border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-fg">학습카드 뷰어 폴백 & 교과과정 QR 링크</h4>
            <select
              aria-label="독자 뷰어 모드"
              value={viewerMode}
              onChange={(e) => onChangeViewerMode(e.target.value as "webtoon" | "manga")}
              className="min-h-8 rounded-lg border border-line bg-card px-2 text-xs text-fg"
            >
              <option value="webtoon">웹툰보기</option>
              <option value="manga">만화보기</option>
            </select>
          </div>
          <p className="mt-1.5 rounded-xl border border-line bg-card p-2.5 text-xs text-fg-2">
            상태: <strong>{studyCardResolution.fallbackNoticeKo}</strong> · 이미지:{" "}
            <code>{studyCardResolution.imageUrl ?? "없음"}</code> · QR:{" "}
            <code>{studyCardResolution.qrLink ?? "없음"}</code>
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4">
        <h3 className="text-sm font-bold text-fg">
          앱 버전 정책 검증기 (최신 버전 vs 최소 강제 업데이트 버전)
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-fg-2">
            최신 버전 (latestVersion)
            <input
              type="text"
              value={latestVersion}
              onChange={(e) => onChangeLatestVersion(e.target.value)}
              className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>
          <label className="text-xs font-semibold text-fg-2">
            최소 버전 (minVersion · 0.0.0=강제 없음)
            <input
              type="text"
              value={minVersion}
              onChange={(e) => onChangeMinVersion(e.target.value)}
              className="mt-1 min-h-9 w-full rounded-xl border border-line bg-card px-2.5 text-xs text-fg"
            />
          </label>
        </div>
        <div
          className={cn(
            "rounded-xl border p-3 text-xs",
            versionPolicy.canSave
              ? "border-line bg-card text-fg-2"
              : "border-danger/40 bg-danger-soft/20 text-danger",
          )}
        >
          <p className="font-bold">
            {versionPolicy.canSave ? "영향 미리보기 (저장 가능)" : "저장할 수 없는 설정"}
          </p>
          <p className="mt-1">{versionPolicy.impactSummaryKo}</p>
        </div>
      </div>
    </div>
  );
}
