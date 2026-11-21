import {
  isStudioAiSkill,
  transitionStudioAiJob,
  type StudioAiJob,
  type StudioAiJobPreview,
  type StudioAiJobStatus,
  type StudioAiSkillId,
} from "../studio-ai-job";

export interface StudioAiQueueArtifact {
  readonly previewId: string;
  readonly kind: "image" | "text";
  readonly title: string;
  readonly dataUrl?: string;
  readonly textDraft?: string;
  readonly width?: number;
  readonly height?: number;
  readonly notes?: readonly string[];
}

export interface StudioAiQueueRunOutput {
  readonly preview: StudioAiJobPreview;
  readonly artifact: StudioAiQueueArtifact;
}

export interface PersistedQueuePayload {
  readonly schemaVersion: 1;
  readonly jobs: readonly StudioAiJob[];
  readonly artifacts: Readonly<Record<string, StudioAiQueueArtifact>>;
}

export const MAX_STORED_AI_QUEUE_JOBS = 24;

const VALID_STATUSES: ReadonlySet<StudioAiJobStatus> = new Set([
  "draft",
  "awaiting-confirmation",
  "queued",
  "running",
  "preview-ready",
  "approved",
  "applied",
  "failed",
  "cancelled",
]);

const TEXT_SKILLS: ReadonlySet<StudioAiSkillId> = new Set([
  "story-outline",
  "dialogue-rewrite",
  "storyboard",
  "localization",
  "voice",
  "publishing-copy",
]);

export const STUDIO_AI_QUEUE_SKILL_META: Readonly<
  Record<
    StudioAiSkillId,
    {
      readonly labelKo: string;
      readonly outputKind: "image" | "text";
      readonly defaultCredits: number;
      readonly placeholderKo: string;
    }
  >
> = Object.freeze({
  "line-cleanup": {
    labelKo: "선화 정리",
    outputKind: "image",
    defaultCredits: 1,
    placeholderKo: "예: 거친 연필 선을 깔끔한 웹툰 펜선으로 정리",
  },
  "flat-color": {
    labelKo: "밑색 채색",
    outputKind: "image",
    defaultCredits: 1,
    placeholderKo: "예: 교복 상의 남색, 머리카락 따뜻한 밤색으로 밑색 초안",
  },
  "image-fill": {
    labelKo: "영역 채우기",
    outputKind: "image",
    defaultCredits: 2,
    placeholderKo: "예: 창밖 노을 하늘과 구름 배경 채우기",
  },
  "image-expand": {
    labelKo: "캔버스 확장",
    outputKind: "image",
    defaultCredits: 2,
    placeholderKo: "예: 위아래 여백을 교실 복도 원근에 맞춰 자연스럽게 확장",
  },
  relight: {
    labelKo: "조명 보정",
    outputKind: "image",
    defaultCredits: 1,
    placeholderKo: "예: 왼쪽 위 석양 역광과 부드러운 림라이트 추가",
  },
  "character-consistency": {
    labelKo: "캐릭터 일관성",
    outputKind: "image",
    defaultCredits: 2,
    placeholderKo: "예: 주인공 정면 시트 기준으로 측면 놀란 표정 초안",
  },
  "dialogue-rewrite": {
    labelKo: "대사 다듬기",
    outputKind: "text",
    defaultCredits: 0,
    placeholderKo: "예: 어색한 존댓말을 긴박한 현장감 있는 짧은 대사로 다듬기",
  },
  storyboard: {
    labelKo: "콘티 구성",
    outputKind: "text",
    defaultCredits: 0,
    placeholderKo: "예: 옥상 대치 장면 4컷 카메라 구도와 감정선 배치",
  },
  "story-outline": {
    labelKo: "스토리 개요",
    outputKind: "text",
    defaultCredits: 0,
    placeholderKo: "예: 12화 반전 도입부 3단계 사건 흐름 정리",
  },
  localization: {
    labelKo: "현지화 번역",
    outputKind: "text",
    defaultCredits: 0,
    placeholderKo: "예: 의성어·말투 뉘앙스를 살린 자연스러운 번역 초안",
  },
  voice: {
    labelKo: "음성 연출",
    outputKind: "text",
    defaultCredits: 1,
    placeholderKo: "예: 내레이션 호흡과 강조 지점 스크립트 정리",
  },
  animatic: {
    labelKo: "애니매틱",
    outputKind: "image",
    defaultCredits: 2,
    placeholderKo: "예: 컷 전환 타이밍 키프레임 초안",
  },
  "promotion-design": {
    labelKo: "홍보 디자인",
    outputKind: "image",
    defaultCredits: 2,
    placeholderKo: "예: 썸네일용 대비 강한 타이틀 구도 초안",
  },
  "publishing-copy": {
    labelKo: "연재 소개문",
    outputKind: "text",
    defaultCredits: 0,
    placeholderKo: "예: 첫 화 독자 유입용 2문장 작품 소개 초안",
  },
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * 외부 API 미연결·오프라인 검토 시에도 비파괴 초안 레이어 삽입 계약을 검증할 수 있도록
 * 결정적 SVG 초안 썸네일(또는 텍스트 초안)을 생성한다.
 */
export function synthesizeNonDestructiveDraftArtifact(
  job: StudioAiJob,
): StudioAiQueueRunOutput {
  const meta = STUDIO_AI_QUEUE_SKILL_META[job.skill];
  const previewId = `preview-${job.id}`;

  if (TEXT_SKILLS.has(job.skill)) {
    const cleanPrompt = job.request.prompt.trim();
    const textDraft = [
      `[${meta.labelKo} 초안]`,
      `요청: ${cleanPrompt}`,
      "제안: 원고 흐름을 해치지 않도록 핵심 장면과 대사를 2단계로 정리한 검토용 사본입니다.",
    ].join("\n");

    return {
      preview: {
        previewId,
        outputRefs: [`draft-text-${job.id}`],
        estimatedCreditsUsed: job.estimatedCredits,
        warnings:
          job.privacy === "local"
            ? ["기기 내 비파괴 초안으로 생성했습니다. 적용 전 내용을 확인해 주세요."]
            : [],
      },
      artifact: {
        previewId,
        kind: "text",
        title: `${meta.labelKo} 초안`,
        textDraft,
        notes: ["적용 시 새 메모/대사 초안 요소로 삽입되며 기존 원고를 덮어쓰지 않습니다."],
      },
    };
  }

  const width = 512;
  const height = 512;
  const promptExcerpt = escapeXml(job.request.prompt.trim().slice(0, 34));
  const label = escapeXml(meta.labelKo);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" rx="20" fill="oklch(0.22 0.015 270)" fill-opacity="0.92"/>`,
    `<rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="14" fill="none" stroke="oklch(0.72 0.16 48)" stroke-width="3" stroke-dasharray="10 8"/>`,
    `<circle cx="256" cy="212" r="78" fill="oklch(0.72 0.16 48)" fill-opacity="0.22" stroke="oklch(0.8 0.14 54)" stroke-width="2.5"/>`,
    `<path d="M196 244 Q256 154 316 244" fill="none" stroke="oklch(0.95 0.015 80)" stroke-width="4" stroke-linecap="round"/>`,
    `<text x="256" y="346" text-anchor="middle" fill="oklch(0.95 0.015 80)" font-family="sans-serif" font-size="22" font-weight="700">${label} 비파괴 초안</text>`,
    `<text x="256" y="382" text-anchor="middle" fill="oklch(0.78 0.02 76)" font-family="sans-serif" font-size="14">${promptExcerpt}</text>`,
    `</svg>`,
  ].join("");
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return {
    preview: {
      previewId,
      outputRefs: [`draft-layer-${job.id}`],
      estimatedCreditsUsed: job.estimatedCredits,
      warnings:
        job.privacy === "local"
          ? ["기기 내 비파괴 초안 미리보기입니다. 승인 후 새 사본 레이어로 삽입됩니다."]
          : [],
    },
    artifact: {
      previewId,
      kind: "image",
      title: `${meta.labelKo} 초안 레이어`,
      dataUrl,
      width,
      height,
      notes: ["승인 후 적용하면 원본 위에 새 사본 레이어로 추가됩니다."],
    },
  };
}

function isValidPersistedJob(value: unknown): value is StudioAiJob {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioAiJob>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    isStudioAiSkill(candidate.skill) &&
    typeof candidate.providerId === "string" &&
    typeof candidate.status === "string" &&
    VALID_STATUSES.has(candidate.status as StudioAiJobStatus) &&
    typeof candidate.progress === "number" &&
    Number.isFinite(candidate.progress) &&
    candidate.request !== undefined &&
    typeof candidate.request.prompt === "string" &&
    typeof candidate.request.inputSnapshotId === "string" &&
    Array.isArray(candidate.audit)
  );
}

export function parsePersistedQueuePayload(
  raw: string | null,
  now: () => string,
): PersistedQueuePayload {
  if (!raw) {
    return { schemaVersion: 1, jobs: [], artifacts: {} };
  }
  const parsed = JSON.parse(raw) as Partial<PersistedQueuePayload>;
  const rawJobs = Array.isArray(parsed.jobs) ? parsed.jobs.filter(isValidPersistedJob) : [];
  const recoveredAt = now();
  const jobs = rawJobs.slice(0, MAX_STORED_AI_QUEUE_JOBS).map((job) => {
    if (job.status === "running") {
      return transitionStudioAiJob(job, {
        type: "fail",
        at: recoveredAt,
        code: "SESSION_INTERRUPTED",
        message: "이전 세션이 종료되어 작업이 중단되었습니다. 다시 생성으로 이어갈 수 있어요.",
      });
    }
    return job;
  });

  const validIds = new Set(jobs.map((job) => job.id));
  const rawArtifacts =
    parsed.artifacts && typeof parsed.artifacts === "object" ? parsed.artifacts : {};
  const artifacts: Record<string, StudioAiQueueArtifact> = {};
  for (const [jobId, artifact] of Object.entries(rawArtifacts)) {
    if (!validIds.has(jobId) || !artifact || typeof artifact !== "object") continue;
    const candidate = artifact as Partial<StudioAiQueueArtifact>;
    if (
      typeof candidate.previewId === "string" &&
      (candidate.kind === "image" || candidate.kind === "text") &&
      typeof candidate.title === "string"
    ) {
      artifacts[jobId] = {
        previewId: candidate.previewId,
        kind: candidate.kind,
        title: candidate.title,
        ...(typeof candidate.dataUrl === "string" ? { dataUrl: candidate.dataUrl } : {}),
        ...(typeof candidate.textDraft === "string" ? { textDraft: candidate.textDraft } : {}),
        ...(typeof candidate.width === "number" ? { width: candidate.width } : {}),
        ...(typeof candidate.height === "number" ? { height: candidate.height } : {}),
        ...(Array.isArray(candidate.notes)
          ? { notes: candidate.notes.filter((n): n is string => typeof n === "string") }
          : {}),
      };
    }
  }
  return { schemaVersion: 1, jobs, artifacts };
}
