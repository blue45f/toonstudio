/**
 * 생성 VRM 의 **아바타 정보·이용 조건·썸네일**.
 *
 * VRoid Studio 공개 가이드의 VRM 내보내기 흐름(아바타 이름·제작자 필수, 버전·연락처·참조,
 * 이용 조건, 추가 라이선스 URL)을 같은 항목으로 받는 폼 모델이다. 값은 VRM 1.0 `VRMC_vrm.meta`
 * 필드로 그대로 나간다.
 *
 * - 라이선스 URL 자체는 고정이다. 이 앱의 로더(@pixiv/three-vrm)가 VRM 퍼블릭 라이선스 1.0 URL 만
 *   받아들이므로, 추가 조건은 사양이 정한 자리인 `otherLicenseUrl` 에 둔다.
 * - 폼을 한 번도 건드리지 않으면 생성기는 예전 기본 메타를 그대로 쓴다(바이트 동일).
 * - 제작자·연락처·이용 조건은 캐릭터마다 다시 치지 않도록 이 기기에 기억할 수 있다
 *   ({@link StudioVrmExportProfile}). 아바타 이름·버전·참조는 캐릭터마다 다르므로 기억하지 않는다.
 */

import {
  STUDIO_VRM_EXPORT_LICENSE_URL,
  type StudioVrmExportAvatarPermission,
  type StudioVrmExportCommercialUsage,
  type StudioVrmExportCreditNotation,
  type StudioVrmExportMeta,
  type StudioVrmExportModification,
} from "./studio-vrm-export-vrm-extension";

export type StudioVrmUsageConditions = {
  readonly avatarPermission: StudioVrmExportAvatarPermission;
  readonly commercialUsage: StudioVrmExportCommercialUsage;
  readonly allowExcessivelyViolentUsage: boolean;
  readonly allowExcessivelySexualUsage: boolean;
  readonly allowPoliticalOrReligiousUsage: boolean;
  readonly allowAntisocialOrHateUsage: boolean;
  readonly creditNotation: StudioVrmExportCreditNotation;
  readonly allowRedistribution: boolean;
  readonly modification: StudioVrmExportModification;
};

export type StudioVrmGenerateExportMetaDraft = StudioVrmUsageConditions & {
  readonly avatarName: string;
  /** 쉼표나 줄바꿈으로 여러 명을 적는다. */
  readonly authors: string;
  readonly version: string;
  readonly copyrightInformation: string;
  readonly contactInformation: string;
  /** 원작·참고 자료. 한 줄에 하나. */
  readonly references: string;
  /** 추가 라이선스 정보 URL. 비우면 내보내지 않는다. */
  readonly otherLicenseUrl: string;
};

export type StudioVrmGenerateExportMetaField = keyof StudioVrmGenerateExportMetaDraft;

/** 이 기기에 기억하는 값. 캐릭터마다 다른 이름·버전·참조는 뺀다. */
export type StudioVrmExportProfile = Omit<StudioVrmGenerateExportMetaDraft, "avatarName" | "version" | "references">;

export const STUDIO_VRM_AVATAR_PERMISSION_OPTIONS: readonly {
  readonly id: StudioVrmExportAvatarPermission;
  readonly label: string;
}[] = Object.freeze([
  { id: "onlyAuthor", label: "제작자만" },
  { id: "onlySeparatelyLicensedPerson", label: "따로 허락받은 사람" },
  { id: "everyone", label: "누구나" },
]);

export const STUDIO_VRM_COMMERCIAL_USAGE_OPTIONS: readonly {
  readonly id: StudioVrmExportCommercialUsage;
  readonly label: string;
}[] = Object.freeze([
  { id: "personalNonProfit", label: "개인 비영리만" },
  { id: "personalProfit", label: "개인 영리까지" },
  { id: "corporation", label: "법인·단체까지" },
]);

export const STUDIO_VRM_MODIFICATION_OPTIONS: readonly {
  readonly id: StudioVrmExportModification;
  readonly label: string;
}[] = Object.freeze([
  { id: "prohibited", label: "개변 금지" },
  { id: "allowModification", label: "개변 허용" },
  { id: "allowModificationRedistribution", label: "개변·개변물 재배포 허용" },
]);

export const STUDIO_VRM_USAGE_FLAG_OPTIONS: readonly {
  readonly id: keyof Pick<
    StudioVrmUsageConditions,
    | "allowExcessivelyViolentUsage"
    | "allowExcessivelySexualUsage"
    | "allowPoliticalOrReligiousUsage"
    | "allowAntisocialOrHateUsage"
    | "allowRedistribution"
  >;
  readonly label: string;
}[] = Object.freeze([
  { id: "allowRedistribution", label: "원본 재배포 허용" },
  { id: "allowExcessivelyViolentUsage", label: "과도한 폭력 표현 허용" },
  { id: "allowExcessivelySexualUsage", label: "과도한 성적 표현 허용" },
  { id: "allowPoliticalOrReligiousUsage", label: "정치·종교 목적 허용" },
  { id: "allowAntisocialOrHateUsage", label: "반사회·혐오 목적 허용" },
]);

export type StudioVrmUsagePresetId = "author-only" | "collaborators" | "community" | "open";

const RESTRICTED_FLAGS = {
  allowExcessivelyViolentUsage: false,
  allowExcessivelySexualUsage: false,
  allowPoliticalOrReligiousUsage: false,
  allowAntisocialOrHateUsage: false,
} as const;

/**
 * 자주 쓰는 이용 조건 묶음. 민감한 용도(폭력·성적·정치·반사회) 허용은 어떤 묶음도 켜지 않는다 —
 * 작가가 직접 하나씩 켜야 한다.
 */
export const STUDIO_VRM_USAGE_PRESETS: readonly {
  readonly id: StudioVrmUsagePresetId;
  readonly label: string;
  readonly hint: string;
  readonly conditions: StudioVrmUsageConditions;
}[] = Object.freeze([
  {
    id: "author-only",
    label: "제작자 전용",
    hint: "내 작업에만 쓰는 캐릭터(기본값)",
    conditions: {
      ...RESTRICTED_FLAGS,
      avatarPermission: "onlyAuthor",
      commercialUsage: "personalNonProfit",
      creditNotation: "required",
      allowRedistribution: false,
      modification: "allowModification",
    },
  },
  {
    id: "collaborators",
    label: "협업자 허용",
    hint: "허락한 어시스턴트·공동 작가가 유료 작품에도 사용",
    conditions: {
      ...RESTRICTED_FLAGS,
      avatarPermission: "onlySeparatelyLicensedPerson",
      commercialUsage: "personalProfit",
      creditNotation: "required",
      allowRedistribution: false,
      modification: "allowModification",
    },
  },
  {
    id: "community",
    label: "누구나 비영리",
    hint: "팬아트·비영리 창작에 누구나 사용, 크레딧 필요",
    conditions: {
      ...RESTRICTED_FLAGS,
      avatarPermission: "everyone",
      commercialUsage: "personalNonProfit",
      creditNotation: "required",
      allowRedistribution: false,
      modification: "allowModification",
    },
  },
  {
    id: "open",
    label: "자유 이용",
    hint: "상업 이용·재배포·개변까지 허용, 크레딧 불필요",
    conditions: {
      ...RESTRICTED_FLAGS,
      avatarPermission: "everyone",
      commercialUsage: "corporation",
      creditNotation: "unnecessary",
      allowRedistribution: true,
      modification: "allowModificationRedistribution",
    },
  },
]);

const USAGE_KEYS = Object.keys(STUDIO_VRM_USAGE_PRESETS[0].conditions) as (keyof StudioVrmUsageConditions)[];
const PERMISSION_IDS = new Set<string>(STUDIO_VRM_AVATAR_PERMISSION_OPTIONS.map((option) => option.id));
const COMMERCIAL_IDS = new Set<string>(STUDIO_VRM_COMMERCIAL_USAGE_OPTIONS.map((option) => option.id));
const MODIFICATION_IDS = new Set<string>(STUDIO_VRM_MODIFICATION_OPTIONS.map((option) => option.id));

export const STUDIO_VRM_EXPORT_META_LIMITS = Object.freeze({
  avatarName: 128,
  author: 128,
  authors: 16,
  version: 64,
  copyrightInformation: 512,
  contactInformation: 256,
  reference: 512,
  references: 8,
  otherLicenseUrl: 2_048,
});

export function createStudioVrmGenerateExportMetaDraft(input: {
  readonly avatarName: string;
  readonly profile?: StudioVrmExportProfile | null;
}): StudioVrmGenerateExportMetaDraft {
  return {
    ...STUDIO_VRM_USAGE_PRESETS[0].conditions,
    authors: "",
    copyrightInformation: "",
    contactInformation: "",
    otherLicenseUrl: "",
    ...input.profile,
    avatarName: input.avatarName,
    version: "",
    references: "",
  };
}

/** 현재 이용 조건과 정확히 같은 묶음. 하나라도 바꿨다면 `null`(직접 설정). */
export function matchStudioVrmUsagePreset(conditions: StudioVrmUsageConditions): StudioVrmUsagePresetId | null {
  const match = STUDIO_VRM_USAGE_PRESETS.find((preset) =>
    USAGE_KEYS.every((key) => preset.conditions[key] === conditions[key]));
  return match?.id ?? null;
}

export function applyStudioVrmUsagePreset(
  draft: StudioVrmGenerateExportMetaDraft,
  presetId: StudioVrmUsagePresetId,
): StudioVrmGenerateExportMetaDraft {
  const preset = STUDIO_VRM_USAGE_PRESETS.find((entry) => entry.id === presetId);
  return preset ? { ...draft, ...preset.conditions } : draft;
}

/** 이용 조건을 한 줄로 요약한다(접힌 폼의 미리보기). */
export function describeStudioVrmUsageConditions(conditions: StudioVrmUsageConditions): string {
  const label = <T extends string>(options: readonly { id: T; label: string }[], id: T) =>
    options.find((option) => option.id === id)?.label ?? id;
  return [
    `${label(STUDIO_VRM_AVATAR_PERMISSION_OPTIONS, conditions.avatarPermission)} 사용`,
    label(STUDIO_VRM_COMMERCIAL_USAGE_OPTIONS, conditions.commercialUsage),
    conditions.creditNotation === "required" ? "크레딧 필요" : "크레딧 불필요",
    conditions.allowRedistribution ? "재배포 허용" : "재배포 불가",
    label(STUDIO_VRM_MODIFICATION_OPTIONS, conditions.modification),
  ].join(" · ");
}

/* -------------------------------------------------------------------------- */
/* 검증 → VRM 메타                                                              */
/* -------------------------------------------------------------------------- */

export type StudioVrmGenerateExportMetaIssue = {
  readonly field: StudioVrmGenerateExportMetaField;
  readonly message: string;
};

export type StudioVrmGenerateExportMetaValidation =
  | { readonly ok: true; readonly meta: StudioVrmExportMeta; readonly issues: readonly [] }
  | { readonly ok: false; readonly meta: null; readonly issues: readonly StudioVrmGenerateExportMetaIssue[] };

// 줄바꿈(\n)은 목록을 나누는 데 쓰므로 남기고 나머지 제어 문자를 지운다.
// eslint-disable-next-line no-control-regex -- 제어 문자를 걸러 내는 것이 이 정규식의 목적이다.
const CONTROL_CHARACTERS = /[\u0000-\u0009\u000b-\u001f\u007f]/gu;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(CONTROL_CHARACTERS, " ").normalize("NFC").trim() : "";
}

function list(value: string, separator: RegExp): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value.split(separator)) {
    const item = raw.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * 폼을 검증해 VRM 1.0 메타로 바꾼다. 문제는 항목별 한국어 메시지로 모아 돌려준다 —
 * 패널이 어느 칸을 고쳐야 하는지 바로 가리킬 수 있게 한다.
 */
export function validateStudioVrmGenerateExportMeta(
  draft: StudioVrmGenerateExportMetaDraft,
): StudioVrmGenerateExportMetaValidation {
  const issues: StudioVrmGenerateExportMetaIssue[] = [];
  const limits = STUDIO_VRM_EXPORT_META_LIMITS;
  const tooLong = (field: StudioVrmGenerateExportMetaField, value: string, max: number) => {
    if (value.length > max) issues.push({ field, message: `${max}자 이하로 적어 주세요.` });
  };

  const name = clean(draft.avatarName);
  if (!name) issues.push({ field: "avatarName", message: "아바타 이름은 꼭 적어야 합니다." });
  tooLong("avatarName", name, limits.avatarName);

  const authors = list(clean(draft.authors), /[,\n]/u);
  if (authors.length === 0) issues.push({ field: "authors", message: "제작자를 한 명 이상 적어 주세요." });
  if (authors.length > limits.authors) {
    issues.push({ field: "authors", message: `제작자는 ${limits.authors}명까지 적을 수 있습니다.` });
  }
  if (authors.some((author) => author.length > limits.author)) {
    issues.push({ field: "authors", message: `제작자 이름은 한 명당 ${limits.author}자 이하로 적어 주세요.` });
  }

  const version = clean(draft.version);
  tooLong("version", version, limits.version);
  const copyrightInformation = clean(draft.copyrightInformation);
  tooLong("copyrightInformation", copyrightInformation, limits.copyrightInformation);
  const contactInformation = clean(draft.contactInformation);
  tooLong("contactInformation", contactInformation, limits.contactInformation);

  const references = list(clean(draft.references), /\n/u);
  if (references.length > limits.references) {
    issues.push({ field: "references", message: `참조는 ${limits.references}개까지 적을 수 있습니다.` });
  }
  if (references.some((reference) => reference.length > limits.reference)) {
    issues.push({ field: "references", message: `참조는 한 줄에 ${limits.reference}자 이하로 적어 주세요.` });
  }

  const otherLicenseUrl = clean(draft.otherLicenseUrl);
  if (otherLicenseUrl && !isHttpUrl(otherLicenseUrl)) {
    issues.push({ field: "otherLicenseUrl", message: "http:// 또는 https:// 로 시작하는 주소를 적어 주세요." });
  }
  tooLong("otherLicenseUrl", otherLicenseUrl, limits.otherLicenseUrl);

  if (!PERMISSION_IDS.has(draft.avatarPermission)) {
    issues.push({ field: "avatarPermission", message: "아바타 사용 허가 범위를 골라 주세요." });
  }
  if (!COMMERCIAL_IDS.has(draft.commercialUsage)) {
    issues.push({ field: "commercialUsage", message: "상업 이용 범위를 골라 주세요." });
  }
  if (!MODIFICATION_IDS.has(draft.modification)) {
    issues.push({ field: "modification", message: "개변 허용 범위를 골라 주세요." });
  }
  if (draft.creditNotation !== "required" && draft.creditNotation !== "unnecessary") {
    issues.push({ field: "creditNotation", message: "크레딧 표기 여부를 골라 주세요." });
  }

  if (issues.length > 0) return { ok: false, meta: null, issues };
  return {
    ok: true,
    issues: [],
    meta: {
      name,
      authors,
      licenseUrl: STUDIO_VRM_EXPORT_LICENSE_URL,
      ...(version ? { version } : {}),
      ...(copyrightInformation ? { copyrightInformation } : {}),
      ...(contactInformation ? { contactInformation } : {}),
      ...(references.length > 0 ? { references } : {}),
      avatarPermission: draft.avatarPermission,
      allowExcessivelyViolentUsage: draft.allowExcessivelyViolentUsage === true,
      allowExcessivelySexualUsage: draft.allowExcessivelySexualUsage === true,
      commercialUsage: draft.commercialUsage,
      allowPoliticalOrReligiousUsage: draft.allowPoliticalOrReligiousUsage === true,
      allowAntisocialOrHateUsage: draft.allowAntisocialOrHateUsage === true,
      creditNotation: draft.creditNotation,
      allowRedistribution: draft.allowRedistribution === true,
      modification: draft.modification,
      ...(otherLicenseUrl ? { otherLicenseUrl } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 기기에 기억하는 제작자 정보                                                    */
/* -------------------------------------------------------------------------- */

export function studioVrmExportProfileFromDraft(draft: StudioVrmGenerateExportMetaDraft): StudioVrmExportProfile {
  const conditions = Object.fromEntries(USAGE_KEYS.map((key) => [key, draft[key]])) as StudioVrmUsageConditions;
  return {
    ...conditions,
    authors: clean(draft.authors).slice(0, STUDIO_VRM_EXPORT_META_LIMITS.author * STUDIO_VRM_EXPORT_META_LIMITS.authors),
    copyrightInformation: clean(draft.copyrightInformation).slice(0, STUDIO_VRM_EXPORT_META_LIMITS.copyrightInformation),
    contactInformation: clean(draft.contactInformation).slice(0, STUDIO_VRM_EXPORT_META_LIMITS.contactInformation),
    otherLicenseUrl: clean(draft.otherLicenseUrl).slice(0, STUDIO_VRM_EXPORT_META_LIMITS.otherLicenseUrl),
  };
}

/** 저장본을 정규화한다. 형식이 틀리면 버리고 `null`(기본값으로 시작). */
export function sanitizeStudioVrmExportProfile(raw: unknown): StudioVrmExportProfile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const fallback = STUDIO_VRM_USAGE_PRESETS[0].conditions;
  const pick = <T extends string>(value: unknown, allowed: ReadonlySet<string>, otherwise: T): T =>
    typeof value === "string" && allowed.has(value) ? (value as T) : otherwise;
  const flag = (value: unknown, otherwise: boolean) => (typeof value === "boolean" ? value : otherwise);
  return studioVrmExportProfileFromDraft({
    avatarName: "",
    version: "",
    references: "",
    authors: clean(source.authors),
    copyrightInformation: clean(source.copyrightInformation),
    contactInformation: clean(source.contactInformation),
    otherLicenseUrl: clean(source.otherLicenseUrl),
    avatarPermission: pick(source.avatarPermission, PERMISSION_IDS, fallback.avatarPermission),
    commercialUsage: pick(source.commercialUsage, COMMERCIAL_IDS, fallback.commercialUsage),
    modification: pick(source.modification, MODIFICATION_IDS, fallback.modification),
    creditNotation: source.creditNotation === "unnecessary" ? "unnecessary" : "required",
    allowRedistribution: flag(source.allowRedistribution, fallback.allowRedistribution),
    allowExcessivelyViolentUsage: flag(source.allowExcessivelyViolentUsage, false),
    allowExcessivelySexualUsage: flag(source.allowExcessivelySexualUsage, false),
    allowPoliticalOrReligiousUsage: flag(source.allowPoliticalOrReligiousUsage, false),
    allowAntisocialOrHateUsage: flag(source.allowAntisocialOrHateUsage, false),
  });
}

/* -------------------------------------------------------------------------- */
/* 썸네일·파일 이름                                                             */
/* -------------------------------------------------------------------------- */

export type StudioVrmThumbnailImage = {
  readonly mimeType: "image/png" | "image/jpeg";
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
};

export type StudioVrmThumbnailInspection =
  | { readonly ok: true; readonly image: StudioVrmThumbnailImage; readonly square: boolean }
  | { readonly ok: false; readonly reason: string };

export const STUDIO_VRM_THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
/** 파일을 읽기 전에 크기로 거를 때도 같은 문구를 쓴다. */
export const STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON = "썸네일은 4MB 이하 이미지만 넣을 수 있습니다.";
export const STUDIO_VRM_THUMBNAIL_MIN_SIZE = 64;
export const STUDIO_VRM_THUMBNAIL_MAX_SIZE = 4_096;
/** VRM 1.0 이 권장하는 썸네일 크기(정사각형). */
export const STUDIO_VRM_THUMBNAIL_RECOMMENDED_SIZE = 1_024;

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
  // 첫 청크는 반드시 IHDR 이다(길이 13, 타입 "IHDR").
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    // SOF0~SOF15 중 DHT(C4)·JPG(C8)·DAC(CC)를 뺀 것이 프레임 헤더다.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * 썸네일로 넣을 이미지를 확인한다. 디코드하지 않고 헤더만 읽는다(PNG IHDR, JPEG 프레임 헤더).
 * 정사각형이 아니면 `square: false` — VRM 1.0 은 정사각형을 요구하므로 호출자가 잘라서 넣는다.
 */
export function inspectStudioVrmThumbnailBytes(bytes: Uint8Array<ArrayBuffer>): StudioVrmThumbnailInspection {
  if (bytes.byteLength === 0) return { ok: false, reason: "빈 이미지 파일입니다." };
  if (bytes.byteLength > STUDIO_VRM_THUMBNAIL_MAX_BYTES) {
    return { ok: false, reason: STUDIO_VRM_THUMBNAIL_TOO_LARGE_REASON };
  }
  const png = pngSize(bytes);
  const jpeg = png ? null : jpegSize(bytes);
  const size = png ?? jpeg;
  if (!size) return { ok: false, reason: "PNG 또는 JPEG 이미지만 썸네일로 넣을 수 있습니다." };
  const { width, height } = size;
  if (
    Math.min(width, height) < STUDIO_VRM_THUMBNAIL_MIN_SIZE
    || Math.max(width, height) > STUDIO_VRM_THUMBNAIL_MAX_SIZE
  ) {
    return {
      ok: false,
      reason: `썸네일은 가로·세로 ${STUDIO_VRM_THUMBNAIL_MIN_SIZE}~${STUDIO_VRM_THUMBNAIL_MAX_SIZE}px 사이여야 합니다.`,
    };
  }
  return {
    ok: true,
    square: width === height,
    image: { mimeType: png ? "image/png" : "image/jpeg", bytes, width, height },
  };
}

// 파일 이름에 쓸 수 없는 문자(Windows 기준)와 제어 문자.
// eslint-disable-next-line no-control-regex -- 제어 문자를 걸러 내는 것이 이 정규식의 목적이다.
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/gu;

/** 아바타 이름으로 내려받을 파일 이름을 만든다. 쓸 수 없는 문자는 지우고 너무 길면 자른다. */
export function studioVrmGenerateFileName(avatarName: string): string {
  const base = avatarName
    .replace(UNSAFE_FILE_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\.+|\.+$/gu, "")
    .slice(0, 80)
    .trim();
  return `${base || "ToonStudio 캐릭터"}.vrm`;
}
