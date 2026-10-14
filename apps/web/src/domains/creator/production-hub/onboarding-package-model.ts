import type { ProductionRolePreset } from "./production-manuscript-competitive-model";

/**
 * 외주·어시 온보딩 패키지 (REPORT T-3) — 순수 모델.
 *
 * 초대 프리셋(역할)을 고르면 그 역할로 합류하는 사람이 처음에 읽어야 할 것을
 * 한 패키지로 조립한다: ① 역할 규칙(프리셋 허용/차단 + 역할별 작업 규칙)
 * ② 참조 컷 안내(역할별 대표 컷 체크리스트 + 실제로 연결된 컷이 있으면 그 목록)
 * ③ 일정 규칙(역할별 기본 규칙) ④ 첫 작업 브리프(채울 칸 + 제작 보드 링크).
 *
 * 정직성 규칙:
 * - 허용/차단은 프리셋 계약 문자열을 그대로 옮긴다 — 새 권한 판정을 만들지 않는다.
 * - 참조 컷은 "어떤 컷을 먼저 볼지"의 안내 목록이다. 실제 컷이 연결되지 않았으면
 *   있는 것처럼 꾸미지 않고 suppliedCuts 빈 배열 + missing 플래그로 드러낸다.
 * - 일정 규칙은 작품 일정이 아니라 패키지 기본 규칙이다. 실제 마감은 브리프 칸에서
 *   작품 제작 보드로 확인하게 한다.
 * - 브리프 링크는 작품이 정해졌을 때만 만든다. 없으면 null — 지어내지 않는다.
 */

export interface OnboardingPackageCopy {
  readonly ko: string;
  readonly en: string;
}

export interface OnboardingPackageReferenceCut {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
}

export interface OnboardingPackageInput {
  readonly preset: ProductionRolePreset;
  /** 함께 초대(또는 입장 안내)하는 작품 이름. 없으면 브리프 칸에 "작품 선택 후 확정"으로 남긴다. */
  readonly projectTitle?: string | null;
  /** 브리프가 이어질 작품의 상세 id(/production/projects/<id>/production 의 id). workId가 아니다. */
  readonly briefProjectId?: string | null;
  /** 실제로 연결된 참조 컷. 없으면 안내 체크리스트만 보여 준다. */
  readonly referenceCuts?: readonly OnboardingPackageReferenceCut[];
}

export interface OnboardingPackage {
  readonly presetId: ProductionRolePreset["id"];
  readonly roleLabel: OnboardingPackageCopy;
  readonly processScope: OnboardingPackageCopy;
  readonly projectTitle: string | null;
  /** 역할 규칙: 프리셋 허용/차단(계약 그대로) + 역할별 작업 규칙. */
  readonly allowedActions: readonly string[];
  readonly blockedActions: readonly string[];
  readonly workingRules: readonly OnboardingPackageCopy[];
  /** 참조 컷: 먼저 볼 대표 컷 안내 + 실제 연결된 컷(있으면). */
  readonly referenceGuide: readonly OnboardingPackageCopy[];
  readonly suppliedCuts: readonly OnboardingPackageReferenceCut[];
  readonly referenceCutsMissing: boolean;
  /** 일정 규칙(패키지 기본값). */
  readonly scheduleRules: readonly OnboardingPackageCopy[];
  /** 첫 작업 브리프 칸. 값은 아는 것만 채우고 모르면 빈 문자열로 남긴다. */
  readonly briefFields: readonly { readonly label: OnboardingPackageCopy; readonly value: string }[];
  readonly briefHref: string | null;
  /** 합류 직후 확인할 순서. 최대 4개, 첫 항목이 브리프 열기다(briefHref가 있을 때). */
  readonly firstSteps: readonly OnboardingPackageCopy[];
}

/** 프리셋별 담당 공정. TeamWorkspacePage의 PRESET_PROCESS_SCOPE와 같은 사실(페이지 표기)을 패키지에서도 쓴다. */
const PROCESS_SCOPE: Record<ProductionRolePreset["id"], OnboardingPackageCopy> = {
  "invite-producer": { ko: "전체 공정", en: "Full pipeline" },
  "invite-story-writer": { ko: "대본 공정", en: "Script stage" },
  "invite-storyboard": { ko: "콘티·연출 공정", en: "Storyboard & directing" },
  "invite-line-art": { ko: "선화 공정", en: "Line-art stage" },
  "invite-color": { ko: "채색 공정", en: "Coloring stage" },
  "invite-lettering": { ko: "식자·현지화 공정", en: "Lettering & localization" },
  "invite-external-reviewer": { ko: "고정 검수본", en: "Fixed review copy" },
};

const ROLE_LABELS_EN: Record<ProductionRolePreset["id"], string> = {
  "invite-producer": "PD · Editor",
  "invite-story-writer": "Story writer",
  "invite-storyboard": "Storyboard artist",
  "invite-line-art": "Line artist",
  "invite-color": "Colorist",
  "invite-lettering": "Lettering & localization",
  "invite-external-reviewer": "External reviewer",
};

/** 역할별 작업 규칙 — 허용/차단으로 다 못 적는 "이 팀에서 이 역할이 일하는 방식"의 기본값. */
const WORKING_RULES: Record<ProductionRolePreset["id"], readonly OnboardingPackageCopy[]> = {
  "invite-producer": [
    { ko: "일정·담당 변경은 제작 보드에서만 확정하고, 채팅으로 정한 내용은 보드에 옮겨 적습니다.", en: "Schedule and assignment changes are final only on the production board — copy anything agreed in chat onto the board." },
    { ko: "최종 승인·공식 전달 전에는 검수 핀이 모두 닫혔는지 확인합니다.", en: "Before final approval or official delivery, check that every review pin is closed." },
  ],
  "invite-story-writer": [
    { ko: "대본은 회차 단위로 제출하고, 제출 후 수정은 검수 의견에 답하는 방식으로 진행합니다.", en: "Submit scripts per episode; after submitting, revise by replying to review comments." },
    { ko: "설정과 어긋나는 전개가 필요하면 임의로 바꾸지 말고 먼저 의견으로 남깁니다.", en: "If a story beat must break established canon, leave a comment first instead of changing it silently." },
  ],
  "invite-storyboard": [
    { ko: "콘티는 컷 번호 기준으로 제출하고, 컷 추가·삭제는 검수 제출 메모에 적습니다.", en: "Submit storyboards by cut number and note added or removed cuts in the submission memo." },
    { ko: "연출 의도가 갈릴 장면은 비교 확인으로 이전 회차 컷과 나란히 보고 결정합니다.", en: "For debatable staging, compare side by side with earlier-episode cuts before deciding." },
  ],
  "invite-line-art": [
    { ko: "선 굵기·마감 방식은 참조 컷의 대표 선화와 맞춥니다. 기준이 없으면 첫 컷에서 먼저 확인받습니다.", en: "Match line weight and finishing to the reference line-art cuts. If unsure, get the first cut checked before continuing." },
    { ko: "수정 요청은 핀이 달린 컷 단위로 처리하고, 처리하면 검수 제출로 돌려줍니다.", en: "Handle revision requests per pinned cut and send them back as a review submission when done." },
  ],
  "invite-color": [
    { ko: "채색은 작품 팔레트와 참조 컷의 톤을 기준으로 합니다. 새 색을 쓰면 팔레트에 먼저 등록합니다.", en: "Color against the project palette and reference-cut tones. Register any new color in the palette first." },
    { ko: "장면별 시간대(낮·밤) 톤 차이는 참조 컷 안내를 따릅니다.", en: "Follow the reference-cut guide for per-scene time-of-day tone differences." },
  ],
  "invite-lettering": [
    { ko: "말풍선·효과음 표기는 참조 컷의 식자 예시와 맞춥니다.", en: "Match balloon and SFX lettering to the reference-cut lettering examples." },
    { ko: "대사가 말풍선에 넘치면 임의로 줄이지 말고 핏 경고를 확인해 의견으로 남깁니다.", en: "If dialogue overflows a balloon, don't shorten it silently — check the fit warning and leave a comment." },
  ],
  "invite-external-reviewer": [
    { ko: "검토는 고정 검수본만 대상으로 합니다. 최신 원본과의 차이는 의견으로 묻습니다.", en: "Review only the fixed review copy. Ask about differences from the latest original in comments." },
    { ko: "의견은 컷·장면 위치를 특정해서 남깁니다.", en: "Pin every comment to a specific cut or scene." },
  ],
};

/** 역할별 참조 컷 안내 — 합류 첫날 먼저 열어 볼 대표 컷의 종류. 실제 파일이 아니라 안내 체크리스트다. */
const REFERENCE_GUIDE: Record<ProductionRolePreset["id"], readonly OnboardingPackageCopy[]> = {
  "invite-producer": [
    { ko: "최근 회차 완성본 1화 (최종 전달 형태 확인)", en: "One recent finished episode (the final delivery form)" },
    { ko: "검수 승인된 대표 컷 3장", en: "Three approved representative cuts" },
  ],
  "invite-story-writer": [
    { ko: "지난 회차 대본 1화분 (형식·분량 기준)", en: "One previous episode's script (format & length reference)" },
    { ko: "주요 등장인물 설정 컷", en: "Main character reference cuts" },
  ],
  "invite-storyboard": [
    { ko: "대표 액션 장면 콘티 컷", en: "Representative action-scene storyboard cuts" },
    { ko: "대표 감정 장면 콘티 컷", en: "Representative emotional-scene storyboard cuts" },
    { ko: "자주 쓰는 배경 투시 기준 컷", en: "Frequently used background perspective reference cuts" },
  ],
  "invite-line-art": [
    { ko: "대표 선화 컷 3장 (얼굴 클로즈업·전신·배경)", en: "Three representative line-art cuts (face close-up, full body, background)" },
    { ko: "주인공 표정·손 동작 기준 컷", en: "Lead character expression & hand reference cuts" },
  ],
  "invite-color": [
    { ko: "대표 채색 컷 3장 (낮·실내·밤)", en: "Three representative colored cuts (day, interior, night)" },
    { ko: "주요 등장인물 확정 색상 컷", en: "Finalized character color cuts" },
  ],
  "invite-lettering": [
    { ko: "식자 완료 컷 3장 (대사·나레이션·효과음)", en: "Three finished lettering cuts (dialogue, narration, SFX)" },
    { ko: "말풍선 꼬리·강조 표기 예시 컷", en: "Balloon tail & emphasis style example cuts" },
  ],
  "invite-external-reviewer": [
    { ko: "이번 고정 검수본 전체", en: "The full fixed review copy for this round" },
    { ko: "지난 회차 검수에서 승인된 컷 (톤 기준)", en: "Cuts approved in the previous review round (tone reference)" },
  ],
};

/** 역할별 일정 규칙(기본값). 실제 날짜는 작품 제작 보드의 회차 마감이 정본이다. */
const SCHEDULE_RULES: Record<ProductionRolePreset["id"], readonly OnboardingPackageCopy[]> = {
  "invite-producer": [
    { ko: "회차 마감과 공정별 기한은 제작 보드에서 확정합니다.", en: "Episode and per-stage deadlines are set on the production board." },
    { ko: "기한 변경은 영향받는 공정 담당자에게 먼저 알립니다.", en: "Notify affected stage owners before changing a deadline." },
  ],
  "invite-story-writer": [
    { ko: "대본 마감은 다음 공정(콘티)이 시작되기 전입니다 — 정확한 날짜는 브리프에서 확인합니다.", en: "The script is due before the next stage (storyboard) starts — check the exact date in the brief." },
    { ko: "지연이 예상되면 마감 당일이 아니라 알자마자 알립니다.", en: "If you'll be late, say so as soon as you know — not on the due day." },
  ],
  "invite-storyboard": [
    { ko: "콘티 마감은 선화 시작 전입니다 — 정확한 날짜는 브리프에서 확인합니다.", en: "Storyboards are due before line art starts — check the exact date in the brief." },
    { ko: "분량이 큰 회차는 절반 지점에서 중간 제출로 방향을 먼저 확인합니다.", en: "For long episodes, submit a halfway checkpoint to confirm direction early." },
  ],
  "invite-line-art": [
    { ko: "첫 컷은 전체 마감보다 먼저 확인받습니다(방향이 어긋난 채 전량을 그리는 일을 막기 위해).", en: "Get the first cut checked well before the full deadline, so a wrong direction never reaches the whole batch." },
    { ko: "지연이 예상되면 마감 당일이 아니라 알자마자 알립니다.", en: "If you'll be late, say so as soon as you know — not on the due day." },
  ],
  "invite-color": [
    { ko: "채색은 선화 확정본에서만 시작합니다. 미확정 컷을 먼저 칠하지 않습니다.", en: "Start coloring only from finalized line art. Don't color unconfirmed cuts ahead of time." },
    { ko: "지연이 예상되면 마감 당일이 아니라 알자마자 알립니다.", en: "If you'll be late, say so as soon as you know — not on the due day." },
  ],
  "invite-lettering": [
    { ko: "식자는 채색 확정본 기준으로 진행합니다.", en: "Letter against finalized colored cuts." },
    { ko: "플랫폼 출력 확인까지가 마감에 포함됩니다.", en: "The deadline includes the platform output check." },
  ],
  "invite-external-reviewer": [
    { ko: "검토 기한은 검수본을 받은 날이 아니라 초대·브리프에 적힌 날짜 기준입니다.", en: "The review deadline is the date in the invite/brief, not the day the copy arrives." },
    { ko: "기한 안에 못 보면 의견을 못 남긴 채 마감되지 않게 미리 알립니다.", en: "If you can't review in time, say so early so the round doesn't close without your comments." },
  ],
};

export function buildOnboardingPackage(input: OnboardingPackageInput): OnboardingPackage {
  const { preset } = input;
  const projectTitle = input.projectTitle?.trim() ? input.projectTitle.trim() : null;
  const suppliedCuts = Object.freeze([...(input.referenceCuts ?? [])]);
  const briefHref = input.briefProjectId
    ? `/production/projects/${encodeURIComponent(input.briefProjectId)}/production`
    : null;
  const briefFields = Object.freeze([
    {
      label: { ko: "작품", en: "Project" } satisfies OnboardingPackageCopy,
      value: projectTitle ?? "",
    },
    {
      label: { ko: "담당 공정", en: "Your stage" } satisfies OnboardingPackageCopy,
      value: PROCESS_SCOPE[preset.id].ko,
    },
    {
      label: { ko: "역할", en: "Role" } satisfies OnboardingPackageCopy,
      value: preset.label,
    },
    {
      label: { ko: "첫 작업", en: "First task" } satisfies OnboardingPackageCopy,
      value: "",
    },
    {
      label: { ko: "마감", en: "Deadline" } satisfies OnboardingPackageCopy,
      value: "",
    },
  ]);
  const firstSteps: OnboardingPackageCopy[] = [];
  if (briefHref) {
    firstSteps.push({ ko: "이 패키지를 끝까지 읽고, 브리프에서 첫 작업과 마감을 확인합니다.", en: "Read this package, then open the brief to check your first task and deadline." });
  } else {
    firstSteps.push({ ko: "이 패키지를 끝까지 읽습니다. 작품이 정해지면 브리프가 이어집니다.", en: "Read this package. Once a project is assigned, the brief follows from it." });
  }
  firstSteps.push({ ko: "참조 컷 안내의 컷부터 열어 봅니다.", en: "Start by opening the reference cuts in the guide." });
  firstSteps.push({ ko: "막히는 규칙이 있으면 작업 전에 의견으로 묻습니다.", en: "Ask about any unclear rule in comments before starting work." });
  return Object.freeze({
    presetId: preset.id,
    roleLabel: Object.freeze({ ko: preset.label, en: ROLE_LABELS_EN[preset.id] }),
    processScope: PROCESS_SCOPE[preset.id],
    projectTitle,
    allowedActions: preset.allowedActions,
    blockedActions: preset.blockedActions,
    workingRules: WORKING_RULES[preset.id],
    referenceGuide: REFERENCE_GUIDE[preset.id],
    suppliedCuts,
    referenceCutsMissing: suppliedCuts.length === 0,
    scheduleRules: SCHEDULE_RULES[preset.id],
    briefFields,
    briefHref,
    firstSteps: Object.freeze(firstSteps),
  });
}

/**
 * 초대 링크와 함께 직접 전달할 수 있는 평문 패키지.
 * 이메일 자동 발송이 없는 현재 계약("지정한 수신자에게 직접 전달")에서
 * 링크 옆에 붙여 넣는 용도다. locale은 ko 기본.
 */
export function buildOnboardingPackageText(
  pkg: OnboardingPackage,
  locale: "ko" | "en" = "ko",
  inviteLink?: string | null,
): string {
  const pick = (copy: OnboardingPackageCopy) => (locale === "ko" ? copy.ko : copy.en);
  const lines: string[] = [];
  lines.push(locale === "ko" ? `[온보딩 패키지] ${pkg.roleLabel.ko}` : `[Onboarding package] ${pkg.roleLabel.en}`);
  if (inviteLink) lines.push(inviteLink);
  if (pkg.projectTitle) lines.push(`${locale === "ko" ? "작품" : "Project"}: ${pkg.projectTitle}`);
  lines.push(`${locale === "ko" ? "담당 공정" : "Stage"}: ${pick(pkg.processScope)}`);
  lines.push("");
  lines.push(locale === "ko" ? "■ 할 수 있는 일" : "■ What you can do");
  for (const action of pkg.allowedActions) lines.push(`- ${action}`);
  lines.push(locale === "ko" ? "■ 할 수 없는 일·별도 승인" : "■ Not allowed / needs approval");
  for (const action of pkg.blockedActions) lines.push(`- ${action}`);
  lines.push(locale === "ko" ? "■ 작업 규칙" : "■ Working rules");
  for (const rule of pkg.workingRules) lines.push(`- ${pick(rule)}`);
  lines.push(locale === "ko" ? "■ 먼저 볼 참조 컷" : "■ Reference cuts to open first");
  for (const guide of pkg.referenceGuide) lines.push(`- ${pick(guide)}`);
  for (const cut of pkg.suppliedCuts) lines.push(`- ${cut.title}${cut.note ? ` — ${cut.note}` : ""}`);
  if (pkg.referenceCutsMissing) {
    lines.push(locale === "ko"
      ? "(연결된 참조 컷이 아직 없습니다 — 작품 참조 보드에서 위 안내에 맞는 컷을 골라 주세요.)"
      : "(No reference cuts are linked yet — pick cuts matching the guide above from the project reference board.)");
  }
  lines.push(locale === "ko" ? "■ 일정 규칙" : "■ Schedule rules");
  for (const rule of pkg.scheduleRules) lines.push(`- ${pick(rule)}`);
  lines.push(locale === "ko" ? "■ 첫 작업 브리프" : "■ First-task brief");
  for (const field of pkg.briefFields) {
    lines.push(`- ${pick(field.label)}: ${field.value || (locale === "ko" ? "(브리프에서 확인)" : "(see brief)")}`);
  }
  if (pkg.briefHref) lines.push(`${locale === "ko" ? "브리프 열기" : "Open the brief"}: ${pkg.briefHref}`);
  return lines.join("\n");
}
