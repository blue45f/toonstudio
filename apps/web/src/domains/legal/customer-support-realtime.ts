/**
 * AI 고객센터 · 1:1 실시간 채팅 문의 고도화 모듈.
 *
 * - 빠른 문의 템플릿 & AI 자동 의도 분류(결제/권한/원고복구/에셋라이선스/구인분쟁/MCP)
 * - 실시간 WebSocket/폴링 하이브리드 연결 상태 및 상담원 대기열 모델
 * - 스크린샷/이미지 첨부 검증(MIME·크기) 및 안전한 메시지 포맷터
 */

export type SupportIntentCategory =
  | "manuscript-recovery"
  | "billing-refund"
  | "rights-license"
  | "rbac-security"
  | "recruitment-dispute"
  | "mcp-cli-api"
  | "general";

export type RealtimeChannelState = "connected" | "reconnecting" | "polling-fallback";

export interface SupportQuickTemplate {
  readonly id: string;
  readonly category: SupportIntentCategory;
  readonly labelKo: string;
  readonly subjectKo: string;
  readonly starterMessageKo: string;
}

export interface SupportAiTriageResult {
  readonly category: SupportIntentCategory;
  readonly confidence: number;
  readonly instantChecklistKo: readonly string[];
  readonly suggestHumanEscalation: boolean;
  readonly estimatedQueueMinutes: number;
}

export interface SupportImageAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  readonly sizeBytes: number;
  readonly dataUrl: string;
}

export const SUPPORT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MiB
export const SUPPORT_MAX_ATTACHMENTS = 4;

const ALLOWED_IMAGE_MIMES = new Set<SupportImageAttachment["mimeType"]>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export const SUPPORT_QUICK_TEMPLATES: readonly SupportQuickTemplate[] = Object.freeze([
  {
    id: "tpl-recovery",
    category: "manuscript-recovery",
    labelKo: "원고/OPFS 저장 복구",
    subjectKo: "원고 자동저장 복구 문의",
    starterMessageKo: "작업 중이던 에피소드 원고의 로컬 OPFS 스냅샷 복구 방법을 안내해 주세요.",
  },
  {
    id: "tpl-rights",
    category: "rights-license",
    labelKo: "에셋/IP 상업 라이선스",
    subjectKo: "3D 에셋·폰트 Rights BOM 검증 문의",
    starterMessageKo: "상업 연재 및 2차 IP 확장 전 Rights BOM 라이선스 충돌 해결 방법을 알고 싶어요.",
  },
  {
    id: "tpl-rbac",
    category: "rbac-security",
    labelKo: "팀 보안·역할 권한",
    subjectKo: "스튜디오 역할별 권한(RBAC) 설정 문의",
    starterMessageKo: "어시스턴트별 레이어 쓰기 권한과 외부 반출 워터마크 설정을 확인하고 싶어요.",
  },
  {
    id: "tpl-dispute",
    category: "recruitment-dispute",
    labelKo: "구인 광장·외주 정산",
    subjectKo: "구인 광장 매칭 및 표준계약서 문의",
    starterMessageKo: "구인 광장 매칭 후 초과 컷 정산과 표준계약서 보호 절차를 확인하고 싶어요.",
  },
  {
    id: "tpl-mcp",
    category: "mcp-cli-api",
    labelKo: "MCP / CLI 연동",
    subjectKo: "ToonStudio MCP 서버 및 CLI 연동 문의",
    starterMessageKo: "외부 AI 에이전트에서 MCP/CLI로 드로잉 및 컷 생성을 자동화하는 방법을 알려주세요.",
  },
]);

export function classifySupportIntent(text: string): SupportAiTriageResult {
  const normalized = text.trim().toLowerCase();

  if (/(저장|복구|날아|opfs|크래시|백업|스냅샷)/u.test(normalized)) {
    return {
      category: "manuscript-recovery",
      confidence: 0.92,
      instantChecklistKo: [
        "스튜디오 우측 상단 [버전 기록]에서 OPFS 자동 체크포인트를 확인하세요.",
        "다른 탭이 열려 있으면 리더 잠금을 해제한 뒤 새로고침하세요.",
      ],
      suggestHumanEscalation: false,
      estimatedQueueMinutes: 2,
    };
  }

  if (/(결제|환불|영수증|구독|정산|세금|카드)/u.test(normalized)) {
    return {
      category: "billing-refund",
      confidence: 0.94,
      instantChecklistKo: [
        "결제 내역은 [계정 > 결제 및 정산]에서 영수증과 상태를 바로 확인할 수 있습니다.",
        "중복 결제나 환불은 주문번호와 함께 1:1 상담원 연결을 눌러 주세요.",
      ],
      suggestHumanEscalation: true,
      estimatedQueueMinutes: 4,
    };
  }

  if (/(권한|보안|역할|rbac|유출|워터마크|초대|차단)/u.test(normalized)) {
    return {
      category: "rbac-security",
      confidence: 0.9,
      instantChecklistKo: [
        "프로젝트 설정의 [보안 역할/RBAC]에서 직군별 최소 권한 프리셋을 점검하세요.",
        "계정 침해가 의심되면 즉시 모든 세션을 로그아웃하고 상담원에게 알려주세요.",
      ],
      suggestHumanEscalation: true,
      estimatedQueueMinutes: 3,
    };
  }

  if (/(라이선스|저작권|bom|상업|에셋|ip|스핀오프)/u.test(normalized)) {
    return {
      category: "rights-license",
      confidence: 0.88,
      instantChecklistKo: [
        "출고 프리플라이트의 [Rights BOM] 탭에서 NC/GPL 충돌 항목을 확인할 수 있습니다.",
        "2차 IP 확장 계약 검토는 IP 확장 스튜디오의 피치 바이블을 첨부해 주세요.",
      ],
      suggestHumanEscalation: false,
      estimatedQueueMinutes: 5,
    };
  }

  if (/(구인|어시|보조작가|매칭|외주|계약|분쟁|대타)/u.test(normalized)) {
    return {
      category: "recruitment-dispute",
      confidence: 0.9,
      instantChecklistKo: [
        "구인 광장 공고의 만화인 헬프데스크 6대 안전 점검 항목을 먼저 확인하세요.",
        "정산·계약 분쟁은 증빙 스크린샷을 첨부해 1:1 운영자에게 접수할 수 있습니다.",
      ],
      suggestHumanEscalation: true,
      estimatedQueueMinutes: 4,
    };
  }

  if (/(mcp|cli|터미널|api|토큰|toonbridge|자동화)/u.test(normalized)) {
    return {
      category: "mcp-cli-api",
      confidence: 0.93,
      instantChecklistKo: [
        "로컬에서 `node tools/toonstudio-mcp/cli.mjs list`로 사용 가능한 도구를 확인하세요.",
        "MCP 클라이언트는 stdio 모드로 `node tools/toonstudio-mcp/server.mjs`를 등록합니다.",
      ],
      suggestHumanEscalation: false,
      estimatedQueueMinutes: 3,
    };
  }

  return {
    category: "general",
    confidence: 0.65,
    instantChecklistKo: [
      "증상이 발생한 화면 경로와 스크린샷을 함께 남겨주시면 더 빠르게 도와드릴 수 있습니다.",
    ],
    suggestHumanEscalation: false,
    estimatedQueueMinutes: 5,
  };
}

export function validateSupportImageAttachment(input: {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly existingCount: number;
}): { readonly ok: true; readonly attachment: SupportImageAttachment } | { readonly ok: false; readonly reasonKo: string } {
  if (input.existingCount >= SUPPORT_MAX_ATTACHMENTS) {
    return { ok: false, reasonKo: `이미지는 최대 ${SUPPORT_MAX_ATTACHMENTS}장까지 첨부할 수 있습니다.` };
  }
  if (!ALLOWED_IMAGE_MIMES.has(input.mimeType as SupportImageAttachment["mimeType"])) {
    return { ok: false, reasonKo: "PNG, JPG, WebP, GIF 이미지만 첨부할 수 있습니다." };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > SUPPORT_MAX_ATTACHMENT_BYTES) {
    return { ok: false, reasonKo: "이미지 크기는 5MB 이하여야 합니다." };
  }
  if (!input.dataUrl.startsWith("data:image/")) {
    return { ok: false, reasonKo: "올바른 이미지 데이터 형식이 아닙니다." };
  }
  return {
    ok: true,
    attachment: {
      id: `att-${input.existingCount + 1}-${input.fileName.replaceAll(/[^a-zA-Z0-9._-]/gu, "_")}`,
      fileName: input.fileName,
      mimeType: input.mimeType as SupportImageAttachment["mimeType"],
      sizeBytes: input.sizeBytes,
      dataUrl: input.dataUrl,
    },
  };
}

export function formatSupportMessageWithAttachments(
  text: string,
  attachments: readonly SupportImageAttachment[],
): string {
  const clean = text.trim();
  if (attachments.length === 0) return clean;
  const attachmentLines = attachments.map(
    (att) => `[첨부 이미지: ${att.fileName} (${Math.max(1, Math.round(att.sizeBytes / 1024))}KB)]`,
  );
  return clean ? `${clean}\n\n${attachmentLines.join("\n")}` : attachmentLines.join("\n");
}
