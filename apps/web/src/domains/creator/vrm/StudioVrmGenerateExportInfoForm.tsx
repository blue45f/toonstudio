import { ImagePlus, RotateCcw } from "lucide-react";
import { useId, type ReactNode } from "react";

import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import {
  applyStudioVrmUsagePreset,
  matchStudioVrmUsagePreset,
  STUDIO_VRM_AVATAR_PERMISSION_OPTIONS,
  STUDIO_VRM_COMMERCIAL_USAGE_OPTIONS,
  STUDIO_VRM_MODIFICATION_OPTIONS,
  STUDIO_VRM_USAGE_FLAG_OPTIONS,
  STUDIO_VRM_USAGE_PRESETS,
  type StudioVrmGenerateExportMetaDraft,
  type StudioVrmGenerateExportMetaField,
  type StudioVrmGenerateExportMetaIssue,
} from "./studio-vrm-generate-export-meta";

export type StudioVrmThumbnailMode = "auto" | "file" | "none";
export type StudioVrmExportProfileStatus = "loading" | "remembered" | "none" | "memory-only";

const INPUT_CLASS =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-panel px-2.5 text-[0.66rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-[invalid=true]:border-danger";

function chipClass(selected: boolean): string {
  return `min-h-9 rounded-lg border px-2.5 text-left text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
    selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
  }`;
}

export interface StudioVrmGenerateExportInfoFormProps {
  readonly draft: StudioVrmGenerateExportMetaDraft;
  /** `false` 면 아직 폼을 쓰지 않아 예전 기본 정보(제작: ToonStudio)로 내보낸다. */
  readonly customized: boolean;
  readonly issues: readonly StudioVrmGenerateExportMetaIssue[];
  readonly disabled?: boolean;
  readonly profileStatus: StudioVrmExportProfileStatus;
  /** 생성에 성공하면 제작자 정보·이용 조건을 이 기기에 기억할지. */
  readonly rememberProfile: boolean;
  readonly thumbnailMode: StudioVrmThumbnailMode;
  readonly thumbnailFileName: string | null;
  readonly thumbnailError: string | null;
  readonly onDraftChange: (patch: Partial<StudioVrmGenerateExportMetaDraft>) => void;
  readonly onUseDefaults: () => void;
  readonly onRememberProfileChange: (remember: boolean) => void;
  readonly onForgetProfile: () => void;
  readonly onThumbnailModeChange: (mode: StudioVrmThumbnailMode) => void;
  readonly onThumbnailFile: (file: File) => void;
}

/**
 * 생성 VRM 의 아바타 정보와 이용 조건. VRoid Studio 내보내기 화면의 항목(아바타 이름·제작자 필수,
 * 이용 조건, 추가 라이선스 URL)을 같은 순서로 받고, 썸네일을 고른다.
 */
export function StudioVrmGenerateExportInfoForm({
  draft,
  customized,
  issues,
  disabled = false,
  profileStatus,
  rememberProfile,
  thumbnailMode,
  thumbnailFileName,
  thumbnailError,
  onDraftChange,
  onUseDefaults,
  onRememberProfileChange,
  onForgetProfile,
  onThumbnailModeChange,
  onThumbnailFile,
}: StudioVrmGenerateExportInfoFormProps) {
  const id = useId();
  const usagePreset = matchStudioVrmUsagePreset(draft);
  const issueOf = (field: StudioVrmGenerateExportMetaField) => issues.find((issue) => issue.field === field);

  const textField = (
    field: StudioVrmGenerateExportMetaField & ("avatarName" | "authors" | "version" | "copyrightInformation" | "contactInformation" | "references" | "otherLicenseUrl"),
    label: ReactNode,
    options: { readonly multiline?: boolean; readonly placeholder?: string; readonly required?: boolean } = {},
  ) => {
    const issue = issueOf(field);
    const inputId = `${id}-${field}`;
    const errorId = `${inputId}-error`;
    const common = {
      id: inputId,
      value: draft[field],
      disabled,
      required: options.required,
      placeholder: options.placeholder,
      "aria-invalid": issue ? true : undefined,
      "aria-describedby": issue ? errorId : undefined,
      className: INPUT_CLASS,
    };
    return (
      <div className="min-w-0 space-y-1">
        <label htmlFor={inputId} className="block text-[0.6rem] font-bold text-fg-2">
          {label}
          {options.required ? <span className="text-danger"> *</span> : null}
        </label>
        {options.multiline ? (
          <textarea
            {...common}
            rows={2}
            className={`${INPUT_CLASS} py-2`}
            onChange={(event) => onDraftChange({ [field]: event.currentTarget.value })}
          />
        ) : (
          <input
            {...common}
            type={field === "otherLicenseUrl" ? "url" : "text"}
            onChange={(event) => onDraftChange({ [field]: event.currentTarget.value })}
          />
        )}
        {issue ? (
          <p id={errorId} className="text-[0.58rem] font-bold text-danger">
            {issue.message}
          </p>
        ) : null}
      </div>
    );
  };

  const selectField = <T extends string>(
    field: "avatarPermission" | "commercialUsage" | "modification",
    label: string,
    options: readonly { readonly id: T; readonly label: string }[],
  ) => (
    <label className="min-w-0 space-y-1">
      <span className="block text-[0.6rem] font-bold text-fg-2">{label}</span>
      <select
        value={draft[field]}
        disabled={disabled}
        className={INPUT_CLASS}
        onChange={(event) => onDraftChange({ [field]: event.currentTarget.value })}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-3" data-studio-vrm-export-info="">
      <p className="rounded-lg border border-line/70 bg-card/55 px-2.5 py-2 text-[0.6rem] leading-relaxed text-fg-3">
        {profileStatus === "memory-only"
          ? vrmGenerateStatusText(
            "studio.vrmGenerateStatus.profileMemoryOnly",
            "기기에 저장할 수 없어 제작자 정보를 이번 화면에서만 유지해요. 닫거나 새로고침하기 전에 내보내기 내용을 확인해 주세요.",
          )
          : !customized
            ? vrmGenerateStatusText(
              "studio.vrmGenerateStatus.profileDefaults",
              "폼을 쓰지 않으면 기본 정보(제작: ToonStudio, 제작자 전용)로 내보냅니다.",
            )
            : profileStatus === "remembered"
              ? vrmGenerateStatusText(
                "studio.vrmGenerateStatus.profileRemembered",
                "이 기기에 기억해 둔 제작자 정보와 이용 조건을 쓰고 있어요.",
              )
              : rememberProfile
                ? vrmGenerateStatusText(
                  "studio.vrmGenerateStatus.profileWillRemember",
                  "VRM 을 만들면 제작자 정보와 이용 조건을 이 기기에 기억해 다음 캐릭터에도 씁니다.",
                )
                : vrmGenerateStatusText(
                  "studio.vrmGenerateStatus.profileNotRemembered",
                  "제작자 정보를 이 기기에 기억하지 않아요. 이번에 만드는 VRM 에만 들어갑니다.",
                )}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {textField("avatarName", "아바타 이름", { required: true })}
        {textField("authors", "제작자(쉼표로 여러 명)", { required: true, placeholder: "예: 하늘 작가" })}
        {textField("version", "버전", { placeholder: "예: 1.0" })}
        {textField("copyrightInformation", "저작권 표기", { placeholder: "예: © 2026 하늘" })}
        {textField("contactInformation", "연락처", { placeholder: "메일 주소나 SNS" })}
        {textField("otherLicenseUrl", "추가 라이선스 정보 URL", { placeholder: "https://" })}
      </div>
      {textField("references", "참조(원작·참고 자료, 한 줄에 하나)", { multiline: true })}

      <fieldset className="space-y-2">
        <legend className="text-[0.62rem] font-extrabold text-fg-2">이용 조건</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {STUDIO_VRM_USAGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              aria-pressed={usagePreset === preset.id}
              data-studio-vrm-usage-preset={preset.id}
              className={chipClass(usagePreset === preset.id)}
              onClick={() => onDraftChange(applyStudioVrmUsagePreset(draft, preset.id))}
            >
              <span className="block">{preset.label}</span>
              <span className="block truncate text-[0.55rem] font-semibold text-fg-3">{preset.hint}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {selectField("avatarPermission", "아바타로 연기할 수 있는 사람", STUDIO_VRM_AVATAR_PERMISSION_OPTIONS)}
          {selectField("commercialUsage", "상업 이용", STUDIO_VRM_COMMERCIAL_USAGE_OPTIONS)}
          {selectField("modification", "개변", STUDIO_VRM_MODIFICATION_OPTIONS)}
        </div>
        <label className="flex min-h-9 items-center gap-2 text-[0.62rem] font-bold text-fg-2">
          <input
            type="checkbox"
            checked={draft.creditNotation === "required"}
            disabled={disabled}
            className="size-4 accent-accent"
            onChange={(event) => onDraftChange({ creditNotation: event.currentTarget.checked ? "required" : "unnecessary" })}
          />
          크레딧(제작자 표기) 필요
        </label>
        <div className="grid gap-1 sm:grid-cols-2">
          {STUDIO_VRM_USAGE_FLAG_OPTIONS.map((option) => (
            <label key={option.id} className="flex min-h-9 items-center gap-2 text-[0.62rem] font-bold text-fg-2">
              <input
                type="checkbox"
                checked={draft[option.id]}
                disabled={disabled}
                className="size-4 accent-accent"
                onChange={(event) => onDraftChange({ [option.id]: event.currentTarget.checked })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[0.62rem] font-extrabold text-fg-2">썸네일</legend>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["auto", "조형 미리보기로 자동"],
            ["file", "내 이미지"],
            ["none", "넣지 않음"],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-pressed={thumbnailMode === mode}
              className={chipClass(thumbnailMode === mode)}
              onClick={() => onThumbnailModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        {thumbnailMode === "file" ? (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-card/55 px-2.5 text-[0.62rem] font-bold text-fg-2">
            <ImagePlus size={14} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{thumbnailFileName ?? "PNG·JPEG 이미지 고르기(정사각형이 아니면 가운데를 잘라요)"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onThumbnailFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
        {thumbnailError ? <p className="text-[0.58rem] font-bold text-danger">{thumbnailError}</p> : null}
      </fieldset>

      <label className="flex min-h-9 items-center gap-2 text-[0.62rem] font-bold text-fg-2">
        <input
          type="checkbox"
          checked={rememberProfile}
          disabled={disabled}
          className="size-4 accent-accent"
          onChange={(event) => onRememberProfileChange(event.currentTarget.checked)}
        />
        다음 캐릭터에도 이 제작자 정보 쓰기(이 기기에 기억)
      </label>

      <div className="flex flex-wrap justify-end gap-1.5">
        {profileStatus === "remembered" ? (
          <button type="button" disabled={disabled} className={chipClass(false)} onClick={onForgetProfile}>
            기억한 제작자 정보 지우기
          </button>
        ) : null}
        {customized ? (
          <button
            type="button"
            disabled={disabled}
            className={`${chipClass(false)} inline-flex items-center gap-1`}
            onClick={onUseDefaults}
          >
            <RotateCcw size={12} aria-hidden />
            기본 정보로 내보내기
          </button>
        ) : null}
      </div>
    </div>
  );
}
