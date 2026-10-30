import { ChevronDown, Download, Sparkles, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { frozenStatus5Text } from "../status-i18n/studio-frozen5-status-i18n";
import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import { readAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import {
  createStudioVrmExportProfileStore,
  type StudioVrmExportProfileStore,
} from "./studio-vrm-export-profile-store";
import {
  createStudioVrmGenerateExportMetaDraft,
  describeStudioVrmUsageConditions,
  inspectStudioVrmThumbnailBytes,
  STUDIO_VRM_THUMBNAIL_MAX_BYTES,
  STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON,
  studioVrmExportProfileFromDraft,
  studioVrmGenerateFileName,
  validateStudioVrmGenerateExportMeta,
  type StudioVrmGenerateExportMetaDraft,
  type StudioVrmGenerateExportMetaIssue,
  type StudioVrmThumbnailImage,
} from "./studio-vrm-generate-export-meta";
import { countStudioVrmEditedExpressions } from "./studio-vrm-generate-expressions";
import {
  countStudioVrmHairSwayScopes,
  matchStudioVrmHairSwayPreset,
  STUDIO_VRM_HAIR_SWAY_PRESETS,
} from "./studio-vrm-generate-hair-sway";
import { generateStudioVrmCharacter, type StudioVrmGenerateResult } from "./studio-vrm-generate-mcp";
import { createStudioVrmGenerateRecipe } from "./studio-vrm-generate-recipe";
import { rasterizeStudioVrmSvgThumbnail, squareStudioVrmThumbnailImage } from "./studio-vrm-generate-thumbnail";
import { formatStudioVrmHeadUnits, resolveStudioVrmProportionMetrics } from "./studio-vrm-proportion-core";
import { describeStudioVrmAvatarForgeState, StudioVrmAvatarForgePreview } from "./StudioVrmAvatarForgePreview";
import {
  StudioVrmGenerateExportInfoForm,
  type StudioVrmExportProfileStatus,
  type StudioVrmThumbnailMode,
} from "./StudioVrmGenerateExportInfoForm";
import { StudioVrmGenerateExpressionEditor } from "./StudioVrmGenerateExpressionEditor";
import { StudioVrmGenerateHairSwayControls } from "./StudioVrmGenerateHairSwayControls";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";
import type { StudioVrmExportMeta } from "./studio-vrm-export-vrm-extension";

type GenerateOption = "expressions" | "hairSway" | "exportInfo";


type GeneratedVrm = {
  readonly result: Extract<StudioVrmGenerateResult, { status: "ok" }>;
  readonly name: string;
  readonly fileName: string;
};

function OptionDisclosure({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  readonly id: GenerateOption;
  readonly title: string;
  readonly summary: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  const regionId = `${useId()}-${id}`;
  return (
    <div className="rounded-xl border border-line bg-card/55" data-studio-vrm-generate-option={id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 truncate text-[0.66rem] font-extrabold text-fg-2">{title}</span>
        <span className="max-w-[55%] shrink-0 truncate text-[0.58rem] font-bold text-fg-3">{summary}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div id={regionId} role="region" aria-label={title} className="border-t border-line/60 p-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface StudioVrmAvatarForgeGenerateSectionProps {
  readonly state: AvatarForgeState;
  /**
   * 조형 대상(불러온 모델)의 신원. 바뀌면 조형이 새로 시작되므로 캐릭터마다 다른 입력(이름·버전·참조·
   * 직접 고른 썸네일)을 비운다. 제작자·연락처·이용 조건은 작가 단위라 그대로 둔다.
   */
  readonly sessionKey?: string;
  /** 헤어 실루엣을 직접 고르지 않았을 때만 순정 상태를 기본 스타일로 바꿔 생성한다. */
  readonly allowDefaultPreset: boolean;
  readonly disabled?: boolean;
  readonly onChange: (state: AvatarForgeState) => void;
  readonly onGeneratedFile?: (file: File) => void;
  /** 테스트·호스트가 저장소를 주입할 수 있다. 생략하면 Studio 로컬 SQLite 를 쓴다. */
  readonly exportProfileStore?: StudioVrmExportProfileStore;
}

/**
 * 조형 패널의 "새 VRM 캐릭터" 구역. 조형 상태를 레시피로 휴머노이드 VRM 을 만들고, VRoid Studio 의
 * 내보내기 흐름처럼 표정·헤어 흔들림·아바타 정보(이용 조건·썸네일)를 정한 뒤 내보낸다.
 */
export function StudioVrmAvatarForgeGenerateSection({
  state,
  sessionKey,
  allowDefaultPreset,
  disabled = false,
  onChange,
  onGeneratedFile,
  exportProfileStore,
}: StudioVrmAvatarForgeGenerateSectionProps) {
  const [generated, setGenerated] = useState<GeneratedVrm | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [openOption, setOpenOption] = useState<GenerateOption | null>(null);
  const [draft, setDraft] = useState<StudioVrmGenerateExportMetaDraft>(() =>
    createStudioVrmGenerateExportMetaDraft({ avatarName: "" }));
  const [nameEdited, setNameEdited] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [issues, setIssues] = useState<readonly StudioVrmGenerateExportMetaIssue[]>([]);
  const [profileStatus, setProfileStatus] = useState<StudioVrmExportProfileStatus>("loading");
  // 제작자 정보를 이 기기에 기억할지. 기억한 정보를 지우면 함께 꺼져 다음 생성에서 다시 저장하지 않는다.
  const [rememberProfile, setRememberProfile] = useState(true);
  const [thumbnailMode, setThumbnailMode] = useState<StudioVrmThumbnailMode>("auto");
  const [customThumbnail, setCustomThumbnail] = useState<{
    readonly image: StudioVrmThumbnailImage;
    readonly fileName: string;
  } | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [seenSessionKey, setSeenSessionKey] = useState(sessionKey);
  if (seenSessionKey !== sessionKey) {
    // 렌더 중에 이전 값과 비교해 바로 비운다. 효과로 미루면 이전 캐릭터의 이름이 한 번 그려진다.
    setSeenSessionKey(sessionKey);
    setNameEdited(false);
    setDraft((current) => createStudioVrmGenerateExportMetaDraft({
      avatarName: "",
      profile: studioVrmExportProfileFromDraft(current),
    }));
    setIssues([]);
    setThumbnailMode((mode) => (mode === "file" ? "auto" : mode));
    setCustomThumbnail(null);
    setThumbnailError(null);
    setUnavailableMessage(null);
  }
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const touchedRef = useRef(false);
  const store = useMemo(
    () => exportProfileStore ?? createStudioVrmExportProfileStore(),
    [exportProfileStore],
  );

  // 기억해 둔 제작자 정보를 한 번 불러온다. 그 사이 작가가 폼을 고쳤다면 작가의 입력이 이긴다.
  useEffect(() => {
    let cancelled = false;
    void store.load().then((profile) => {
      if (cancelled) return;
      // 불러오기 전에 작가가 이미 폼을 고쳤다면 기억한 값을 덮어쓰지 않는다(다음 생성 때 새 값으로 바뀐다).
      if (!profile || touchedRef.current) {
        setProfileStatus("none");
        return;
      }
      setProfileStatus("remembered");
      setDraft((current) => ({ ...current, ...profile }));
      setCustomized(true);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // 폼을 칠 때마다 레시피를 새로 만들면 미리보기·묶음 계산이 매번 새 상태를 받는다. 조형이 바뀔 때만 만든다.
  const previewRecipe = useMemo(
    () => createStudioVrmGenerateRecipe({ presetId: state.presetId, state, allowDefaultPreset }),
    [state, allowDefaultPreset],
  );
  const describedPreview = describeStudioVrmAvatarForgeState(previewRecipe.state);
  const effectiveDraft: StudioVrmGenerateExportMetaDraft = {
    ...draft,
    avatarName: nameEdited ? draft.avatarName : previewRecipe.label,
  };

  const updateDraft = (patch: Partial<StudioVrmGenerateExportMetaDraft>) => {
    touchedRef.current = true;
    if (patch.avatarName !== undefined) setNameEdited(true);
    setDraft((current) => ({ ...current, ...patch }));
    setCustomized(true);
    setIssues([]);
  };

  const toggle = (option: GenerateOption) => setOpenOption((current) => (current === option ? null : option));

  const resolveThumbnail = async (): Promise<StudioVrmThumbnailImage | null> => {
    if (thumbnailMode === "none") return null;
    if (thumbnailMode === "file") return customThumbnail?.image ?? null;
    const svg = previewRef.current?.querySelector("svg");
    return svg ? rasterizeStudioVrmSvgThumbnail(svg) : null;
  };

  const handleGenerate = async () => {
    // "내 이미지"를 골라 놓고 이미지가 없으면 썸네일 없이 조용히 내보내지 않는다.
    if (thumbnailMode === "file" && !customThumbnail) {
      setThumbnailError(vrmGenerateStatusText(
        "studio.vrmGenerateStatus.thumbnailMissing",
        "썸네일로 쓸 이미지를 아직 고르지 않았어요. 이미지를 고르거나 자동·넣지 않음을 골라 주세요.",
      ));
      setOpenOption("exportInfo");
      return;
    }
    let exportMeta: StudioVrmExportMeta | undefined;
    if (customized) {
      const validation = validateStudioVrmGenerateExportMeta(effectiveDraft);
      if (!validation.ok) {
        setIssues(validation.issues);
        setOpenOption("exportInfo");
        return;
      }
      exportMeta = validation.meta;
    }
    setGenerateBusy(true);
    try {
      const thumbnail = await resolveThumbnail();
      const result = await generateStudioVrmCharacter({
        presetId: state.presetId,
        state,
        allowDefaultPreset,
        ...(exportMeta ? { exportMeta } : {}),
        ...(thumbnail ? { thumbnail } : {}),
      });
      if (result.status !== "ok") {
        setGenerated(null);
        setUnavailableMessage(result.message);
        return;
      }
      const name = exportMeta?.name ?? result.recipe.label;
      const fileName = studioVrmGenerateFileName(name);
      setUnavailableMessage(null);
      setGenerated({ result, name, fileName });
      onGeneratedFile?.(new File([result.bytes], fileName, { type: "model/gltf-binary" }));
      if (customized && rememberProfile) {
        const saved = await store.save(studioVrmExportProfileFromDraft(effectiveDraft));
        setProfileStatus(saved ? "remembered" : "memory-only");
      }
    } finally {
      setGenerateBusy(false);
    }
  };

  const handleThumbnailFile = async (file: File) => {
    setThumbnailError(null);
    // 새로 고른 이미지가 쓸 수 없으면 이전 이미지로 몰래 내보내지 않도록 먼저 비운다.
    setCustomThumbnail(null);
    // 큰 파일은 메모리로 읽기 전에 거른다.
    if (file.size > STUDIO_VRM_THUMBNAIL_MAX_BYTES) {
      setThumbnailError(STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON);
      return;
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      setThumbnailError(vrmGenerateStatusText(
        "studio.vrmGenerateStatus.thumbnailUnreadable",
        "이미지를 읽지 못했어요. 다른 PNG·JPEG 이미지를 골라 주세요.",
      ));
      return;
    }
    const inspection = inspectStudioVrmThumbnailBytes(bytes);
    if (!inspection.ok) {
      setThumbnailError(inspection.reason);
      return;
    }
    const squared = await squareStudioVrmThumbnailImage(inspection.image);
    if (!squared) {
      setThumbnailError(vrmGenerateStatusText(
        "studio.vrmGenerateStatus.thumbnailSquareFailed",
        "정사각형으로 자르지 못했어요. 정사각형 이미지를 골라 주세요.",
      ));
      return;
    }
    setCustomThumbnail({ image: squared, fileName: file.name });
  };

  const authoring = readAvatarForgeVrmAuthoring(state);
  const expressionCount = countStudioVrmEditedExpressions(authoring?.expressions);
  const swayPreset = matchStudioVrmHairSwayPreset(authoring?.hairSway);
  const swayGroups = countStudioVrmHairSwayScopes(authoring?.hairSway) - (authoring?.hairSway?.global ? 1 : 0);
  const swaySummary = `${swayPreset ? STUDIO_VRM_HAIR_SWAY_PRESETS.find((preset) => preset.id === swayPreset)?.label : "직접 조정"}${
    swayGroups > 0 ? ` · 묶음·가닥 ${swayGroups}곳` : ""
  }`;

  return (
    <div data-studio-vrm-generate="" className="space-y-2.5 border-t border-line/70 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-extrabold text-fg">
            <UserPlus size={14} className="text-accent" aria-hidden />
            새 VRM 캐릭터
          </p>
          <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
            위 프리셋·슬라이더를 레시피로 써서 휴머노이드 VRM을 생성합니다. 불러온 모델을 덮어쓰지 않아요.
          </p>
        </div>
        <span
          data-studio-vrm-generate-preset={previewRecipe.presetId ?? "custom"}
          className="shrink-0 rounded-full border border-line bg-card px-2 py-0.5 text-[0.6rem] font-bold text-fg-2"
        >
          {previewRecipe.label}
        </span>
      </div>

      {/* 미리보기는 편집 중인 상태가 아니라 **실제로 생성될 상태**를 보여준다. 아무것도 고르지
          않았을 때 기본 프리셋이 대신 들어가므로 둘이 갈릴 수 있다. 자동 썸네일도 이 그림이다. */}
      <div
        data-studio-vrm-generate-preview=""
        className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-xl border border-line bg-card/70 p-2.5"
      >
        <span ref={previewRef} className="block h-20 overflow-hidden rounded-lg border border-line/70 bg-panel/60 px-1">
          <StudioVrmAvatarForgePreview
            state={previewRecipe.state}
            variant="compact"
            label={`${previewRecipe.label} 생성 결과 미리보기`}
          />
        </span>
        <span className="min-w-0 text-[0.62rem] leading-relaxed text-fg-3">
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full border border-line shrink-0"
              style={{ background: previewRecipe.state.hair.baseColor }}
              aria-hidden
            />
            <span className="truncate text-[0.69rem] font-extrabold text-fg-2">{previewRecipe.label}</span>
          </span>
          <span className="mt-0.5 block">{describedPreview.face} · {describedPreview.hair}</span>
          <span className="block">{formatStudioVrmHeadUnits(resolveStudioVrmProportionMetrics(previewRecipe.state.proportions).headUnits)} · {describedPreview.body}</span>
          <span className="mt-1 flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full border border-line/70 shadow-inner"
              style={{ backgroundColor: previewRecipe.state.hair.baseColor }}
            />
            <span className="truncate">헤어 컬러 {previewRecipe.state.hair.baseColor.toUpperCase()}</span>
          </span>
        </span>
      </div>

      {previewRecipe.appliedDefaultPresetId ? (
        <p
          data-studio-vrm-generate-default-preset={previewRecipe.appliedDefaultPresetId}
          className="rounded-xl border border-line bg-raised/60 px-3 py-2 text-[0.66rem] leading-relaxed text-fg-3"
        >
          아직 고른 스타일이 없어 기본 스타일 <b className="text-fg-2">{previewRecipe.label}</b>로
          생성됩니다. 위에서 다른 스타일을 고르거나 슬라이더를 조절하면 그 설정이 그대로 쓰입니다.
        </p>
      ) : null}

      <div className="space-y-1.5" data-studio-vrm-generate-options="">
        <OptionDisclosure
          id="expressions"
          title="표정 편집"
          summary={expressionCount > 0 ? `편집 ${expressionCount}개` : "기본 표정"}
          open={openOption === "expressions"}
          onToggle={() => toggle("expressions")}
        >
          <StudioVrmGenerateExpressionEditor
            state={state}
            previewState={previewRecipe.state}
            disabled={disabled}
            onChange={onChange}
          />
        </OptionDisclosure>
        <OptionDisclosure
          id="hairSway"
          title="헤어 흔들림"
          summary={swaySummary}
          open={openOption === "hairSway"}
          onToggle={() => toggle("hairSway")}
        >
          <StudioVrmGenerateHairSwayControls
            state={state}
            previewState={previewRecipe.state}
            disabled={disabled}
            onChange={onChange}
          />
        </OptionDisclosure>
        <OptionDisclosure
          id="exportInfo"
          title="아바타 정보·이용 조건"
          summary={customized ? `${effectiveDraft.avatarName} · ${describeStudioVrmUsageConditions(effectiveDraft)}` : "기본 정보"}
          open={openOption === "exportInfo"}
          onToggle={() => toggle("exportInfo")}
        >
          <StudioVrmGenerateExportInfoForm
            draft={effectiveDraft}
            customized={customized}
            issues={issues}
            disabled={disabled || generateBusy}
            profileStatus={profileStatus}
            rememberProfile={rememberProfile}
            thumbnailMode={thumbnailMode}
            thumbnailFileName={customThumbnail?.fileName ?? null}
            thumbnailError={thumbnailError}
            onDraftChange={updateDraft}
            onUseDefaults={() => {
              setCustomized(false);
              setIssues([]);
            }}
            onRememberProfileChange={setRememberProfile}
            onForgetProfile={() => {
              setRememberProfile(false);
              void store.clear().then((cleared) => setProfileStatus(cleared ? "none" : "memory-only"));
            }}
            onThumbnailModeChange={(mode) => {
              setThumbnailMode(mode);
              setThumbnailError(null);
            }}
            onThumbnailFile={(file) => void handleThumbnailFile(file)}
          />
        </OptionDisclosure>
      </div>

      {issues.length > 0 ? (
        <p data-studio-vrm-generate-meta-invalid="" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[0.66rem] leading-relaxed text-danger">
          {vrmGenerateStatusText(
            "studio.vrmGenerateStatus.metaInvalid",
            { count: issues.length },
            "아바타 정보에 고칠 항목이 {count}개 있어요. 위 폼에서 표시된 칸을 채워 주세요.",
          )}
        </p>
      ) : null}

      {unavailableMessage ? (
        <p
          data-studio-vrm-generate-unavailable=""
          data-studio-vrm-generate-status="unavailable"
          role="status"
          className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[0.66rem] leading-relaxed text-danger"
        >
          {unavailableMessage}
        </p>
      ) : null}

      {generated ? (
        <p
          data-studio-vrm-generate-status="ok"
          role="status"
          className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[0.66rem] text-accent"
        >
          {vrmGenerateStatusText(
            "studio.vrmGenerateStatus.generated",
            { name: generated.name },
            "{name} VRM을 만들었습니다. 라이브러리에 넣고 뷰포트에서 미리볼 수 있어요.",
          )}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-studio-vrm-generate-submit=""
          disabled={generateBusy}
          onClick={() => void handleGenerate()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-2 text-[0.7rem] font-extrabold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
        >
          <Sparkles size={14} aria-hidden />
          {generateBusy ? frozenStatus5Text("studio.frozenStatus5.forge.generating", "생성 중…") : "VRM 생성"}
        </button>
        <button
          type="button"
          data-studio-vrm-generate-export=""
          disabled={generateBusy || !generated}
          onClick={() => {
            if (!generated) return;
            const blob = new Blob([generated.result.bytes], { type: "model/gltf-binary" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = generated.fileName;
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2 text-[0.7rem] font-extrabold text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
        >
          <Download size={14} aria-hidden />
          VRM 내보내기
        </button>
      </div>
    </div>
  );
}
