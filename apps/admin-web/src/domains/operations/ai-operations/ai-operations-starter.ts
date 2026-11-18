import type { BoardItem, BoardSnapshot, BoardSource } from "@toonstudio/contracts/ai-operations";

// 공개 공지와 고정된 소스만 포함한다. 메일·운영 관측·비밀값은 인증 후 가져온다.
const MAIN_SHA = "45dbe47d7cc86b238054df608d5bff5757e8afab";
const OBSERVED_AT = "2026-11-18T04:30:40Z";
const NOTICE = "https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/";
const COMMIT = `https://github.com/blue45f/toonstudio/commit/${MAIN_SHA}`;
const field = (key: string, label: string, value = "미확인") => ({ key, label, value });
const code = (id: string, title: string, path: string): BoardSource => ({
  id, title, kind: "코드", url: `https://github.com/blue45f/toonstudio/blob/${MAIN_SHA}/${path}`,
  observedAt: OBSERVED_AT, scope: "고정된 main 소스 확인. 운영 배포·환경·호출 성공의 증거가 아님.",
});
const sources: BoardSource[] = [
  { id: "cf-notice", title: "Cloudflare 모델 종료 공식 공지", url: NOTICE, kind: "공식 문서", observedAt: "2026-11-18T04:12:34Z", scope: "2026-11-20 종료 대상과 대체 권고. 정확한 종료 시각·시간대는 미공지." },
  { id: "main-commit", title: "공개 기준 자료의 main 커밋", url: COMMIT, kind: "커밋", observedAt: OBSERVED_AT, scope: "자료 기준 커밋이며 보드 구현의 병합·배포 증거가 아님." },
  code("provider", "AI 제공자 모델과 오류 처리", "apps/api/src/modules/studio-ai/studio-ai-provider.ts"),
  code("capability", "이미지·임베딩 모델 구성", "apps/api/src/modules/studio-ai/studio-ai-capabilities.ts"),
  code("chat-route", "AI chat·messages 호출 경로", "apps/api/src/modules/studio-ai/studio-ai.controller.ts"),
  code("media-route", "운영 미디어 추론 비활성 경로", "apps/api/src/modules/studio-ai/studio-media-inference.controller.ts"),
  code("provider-test", "제공자 오류 회귀 검사", "apps/api/src/modules/studio-ai/studio-ai-provider.test.ts"),
  code("usage", "AI 사용 원장 저장", "apps/api/src/modules/studio-ai/studio-ai-usage.repository.ts"),
  code("auth-rate", "인증 rate limit 설정", "apps/api/src/modules/auth/auth-rate-limit.config.ts"),
  code("live-cluster", "실시간 클러스터 설정", "apps/api/src/realtime/studio-postgres-io.adapter.ts"),
  code("onpod-example", "Onpod 참조 환경 설정", "deploy/onpod/runtime.env.example"),
  code("onpod-deploy", "Onpod 배포·롤백 계약", "scripts/cloud-deploy-onpod.mjs"),
];

function item(id: string, type: BoardItem["type"], provider: BoardItem["provider"], title: string, fields: BoardItem["fields"], sourceIds: string[], extra: Partial<BoardItem> = {}): BoardItem {
  return { id, type, provider, title, description: "근거를 추가하고 검토 상태를 기록하세요.", status: "미확인", priority: "P1", assurance: "미확인", fields, sourceIds,
    owner: "", nextAction: "실제 관측과 증빙을 기록합니다.", notes: "", verifiedAt: null, verificationNote: "", mainSha: null, tags: [], approvalRequired: false, ...extra };
}
const models: [string, string, string, string][] = [
  ["gemma", "@cf/google/gemma-4-26b-a4b-it", "기본 텍스트 모델", "@cf/zai-org/glm-4.7-flash (기존 허용목록, 전환 검토 필요)"],
  ["glm", "@cf/zai-org/glm-4.7-flash", "텍스트 허용목록 후보", "@cf/google/gemma-4-26b-a4b-it (기존 기본값, 전환 검토 필요)"],
  ["flux", "@cf/black-forest-labs/flux-1-schnell", "이미지 어댑터 기본값", "공식 이미지 대체 권고 flux-2-klein-9b의 요금·허용목록·입출력 호환성 검토 필요"],
  ["bge", "@cf/baai/bge-m3", "임베딩 어댑터 기본값", "현 모델 유지 여부부터 확인. 새 후보의 차원·한국어 품질·재색인 비용 미확인"],
];
const currentModels = models.map(([id, model, purpose, replacement]) => {
  const media = id === "flux" || id === "bge";
  const file = media ? "studio-ai-capabilities.ts" : "studio-ai-provider.ts";
  return item(`cf-${id}`, "model", "Cloudflare", model, [
    field("modelId", "모델 ID", model),
    field("currentModelStatus", "현재 상태", `${purpose}. 코드 구성 확인 / 실제 운영 활성화 미확인`),
    field("retirementDate", "종료 예정일", "이번 공식 종료 목록에 없음. 향후 공지 여부는 별도 확인"),
    field("candidate", "대체 후보", replacement),
    field("callPath", "호출 경로", media ? "capability 어댑터 구성. /api/studio-ai/media/jobs는 운영 추론 비활성(503)" : "POST /api/studio-ai/chat 또는 /messages → StudioAiService → Cloudflare provider"),
    field("affectedFeatures", "영향받는 기능", purpose), field("frequency", "호출 빈도", "미확인. 사용 원장의 최종 처리 건수와 외부 호출 횟수는 다름"),
    field("userImpact", "장애 시 사용자 영향", media ? "운영 미디어 jobs는 이미 개인 Creator Runtime 안내를 반환. 실제 활성 경로 영향은 추가 확인" : "Cloudflare 경로가 선택된 AI 응답 실패 가능. 실제 사용자 영향·범위 미확인"),
    field("errorHandling", "404/model_not_found · 410 대응", "Cloudflare 404·410은 request_rejected. 유료 failover 대상으로 자동 분류하지 않음. 실제 장애 재현 미실행"),
    field("minimalFiles", "최소 변경 파일", `apps/api/src/modules/studio-ai/${file}, 관련 제공자 회귀 검사. 실제 수정은 승인 대기`),
    field("rollback", "롤백 방법", "검증된 이전 코드·이미지 SHA 기록 후 복구 검토. 환경변수는 이전 키 값을 별도로 복구해야 함"),
    field("cheapValidation", "저비용 검증", "공급자 호출 없이 404·410 합성 응답과 allowlist 단위 검사. 실제 추론은 별도 검토"),
    field("costImpact", "비용·무료 한도", "코드 허용목록만 확인. 계정 플랜·가용 쿼터·운영 비용은 미확인"),
  ], ["cf-notice", media ? "capability" : "provider", media ? "media-route" : "chat-route", "provider-test", "usage"], {
    status: "검토 필요", assurance: "부분 확인", description: "소스에 존재하는 모델과 실제 사용 중인 모델을 구분해 기록합니다.",
    nextAction: "배포 SHA·운영 모델 선택·관측 구간을 연결하고 미확인 항목을 보완합니다.", tags: ["현재 코드", media ? "어댑터" : "텍스트"],
  });
});

const retiredText = [
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "@cf/nvidia/nemotron-3-120b-a12b", "@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/qwen/qwq-32b", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/moonshotai/kimi-k2.6", "@cf/moonshotai/kimi-k2.7-code", "@cf/zai-org/glm-5.2", "@cf/zai-org/glm-5.3-flash",
  "@cf/meta-llama/llama-2-7b-chat-hf-lora", "@cf/google/gemma-2b-it-lora", "@cf/google/gemma-7b-it-lora", "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.2-1b-instruct", "@cf/meta/llama-3.2-3b-instruct",
];
const retiredOther = [
  ["@cf/myshell-ai/melotts", "@cf/deepgram/aura-2-en"],
  ["@cf/stabilityai/stable-diffusion-xl-base-1.0", "@cf/black-forest-labs/flux-2-klein-9b"],
  ["@cf/runwayml/stable-diffusion-v1-5-inpainting", "@cf/black-forest-labs/flux-2-klein-9b"],
  ["@cf/bytedance/stable-diffusion-xl-lightning", "@cf/black-forest-labs/flux-2-klein-9b"],
  ["@cf/lykon/dreamshaper-8-lcm", "@cf/black-forest-labs/flux-2-klein-9b"],
  ["@cf/openai/whisper-tiny-en", "@cf/deepgram/nova-3"],
  ["@cf/llava-hf/llava-1.5-7b-hf", "@cf/moondream/moondream3.1-9B-A2B"],
  ["@cf/google/embeddinggemma-300m", "@cf/google/embeddinggemma-2 (공지는 available soon으로 안내)"],
];
const retirements = [...retiredText.map((model) => [model, "Gemma 4 / Qwen3.8-27B 또는 DeepSeek-v4.1-flash-1017 / GLM-5.3. 요금·허용목록 검토 필요"]), ...retiredOther].map(([model, replacement], index) =>
  item(`cf-retired-${index + 1}`, "retired-model", "Cloudflare", model, [
    field("modelId", "모델 ID", model),
    field("currentModelStatus", "현재 상태", "공식 종료 대상. 위 네 가지 코드 기본값·허용목록 모델과 다름"),
    field("retirementDate", "종료 예정일", "2026-11-20 (정확한 시각·시간대 미공지)"), field("candidate", "대체 후보", replacement),
    field("callPath", "호출 경로", "환경·개인 런타임·별도 작업의 잔존 참조는 미확인"), field("affectedFeatures", "영향받는 기능"), field("frequency", "호출 빈도"),
    field("userImpact", "장애 시 사용자 영향", "해당 ID를 호출하는 경로가 있으면 실패 가능. 실제 호출 여부 미확인"),
    field("errorHandling", "404/model_not_found · 410 대응", "공식 공지: HTTP 410 Gone / 5028. 메일 오류 표현은 원문 근거를 별도 가져와 비교"),
    field("minimalFiles", "최소 변경 파일", "잔존 참조 확인 후 결정"), field("rollback", "롤백 방법", "종료된 ID로 복귀하면 복구를 보장할 수 없음. 검증된 대체 설정의 이전 버전 기록"),
    field("cheapValidation", "저비용 검증", "고정된 소스 검색·오류 응답 모의 검사. 외부 추론 호출 없음"),
    field("costImpact", "비용 영향", "미확인. 공식 대체 권고는 무료 사용 보장이 아님"),
  ], ["cf-notice", "provider", "capability"], { status: "검토 필요", assurance: "부분 확인", nextAction: "실제 호출·잔존 설정 근거를 확인하고 사용 중인 경우 승인 대기 변경안을 기록합니다.", tags: ["종료 공지"] }));

const hypotheses = [
  ["throughput", "처리량", "요청 증가와 알림 측정 구간의 상관관계", "구간별 요청 로그·요청 ID·응답 코드", "중복 상태 조회·불필요한 백그라운드 요청 감소안을 검토"],
  ["concurrency", "동시성", "겹친 처리로 단일 인스턴스 자원 한계 도달", "진행 중 요청·시작/종료 시각·인스턴스 수", "전역·경로별 동시성 상한 후보를 오프라인으로 비교"],
  ["retries", "재시도", "오류 뒤 재시도가 실제 처리량을 증폭", "원본 요청과 시도별 ID·간격·중단 조건", "재시도 예산·중복 억제·backoff를 합성 오류로 검토"],
  ["long-requests", "장시간 요청", "긴 요청이 자원을 오래 점유", "요청별 처리 시간·취소·timeout·연결 종료", "timeout·취소 전파·작업 분할 후보를 기존 로그로 검토"],
  ["duplicates", "중복 실행", "여러 탭·스케줄·작업자가 같은 작업을 중복 실행", "idempotency key·작업 ID·스케줄·배포 실행 SHA", "실행 중 요청 공유와 멱등성 경계 검토"],
].map(([id, label, claim, evidence, mitigation]) => item(`onpod-${id}`, "hypothesis", "Onpod", `무료 한도 원인 가설 · ${label}`, [
  field("category", "원인 분류", label), field("hypothesis", "원인 가설", claim), field("evidence", "관측 근거", "미확인. 가설을 원인으로 확정하지 않음"),
  field("requiredEvidence", "필요한 비교 근거", evidence), field("measurementWindow", "측정 구간"), field("reproduction", "재현 여부", "미실행"),
  field("cheapValidation", "저비용 검증", `추가 부하를 만들지 않고 기존 ${evidence}를 같은 측정 구간으로 비교`),
  field("costImpact", "비용 영향"), field("mitigation", "무료 한도 내 완화안", mitigation), field("counterEvidence", "반증·제외 조건"),
], ["auth-rate", "live-cluster", "usage"], { assurance: "가설", description: claim, nextAction: "알림 시각과 동일한 측정 구간의 증거를 연결한 뒤 가설을 비교합니다.", tags: ["원인 미확인", label] }));

const onpod = item("onpod-observation", "config", "Onpod", "최근 24시간 알림·운영 설정 확인", [
  field("notificationTime", "알림 시각"), field("exceededTime", "관측된 초과 시간"), field("measurementWindow", "측정 구간"),
  field("rateLimitConfig", "단일 인스턴스 로컬 rate limit", "예제: single-instance-local. 실제 운영 값 미확인 / 인증 제한은 API 전체 처리량·동시성 제한과 다름"),
  field("clusterConfig", "memory 기반 실시간 클러스터", "코드 기본값·예제: memory. 실제 운영 값·인스턴스 수 미확인"),
  field("recentChange", "최근 변경", "main 커밋·이미지 빌드·운영 적용 여부를 각각 확인"), field("reproduction", "재현 여부", "미실행"),
  field("costImpact", "비용 영향", "미확인. 경고 시간을 장애 시간·과금으로 간주하지 않음"),
  field("mitigation", "무료 한도 내 완화안", "로그 기반 가설 비교 후 불필요한 조회·재시도·중복 실행 감소 검토"),
], ["onpod-example", "auth-rate", "live-cluster", "onpod-deploy"], { description: "실제 알림 기록은 관리자 인증 후 Sites JSON으로 가져오거나 메일 근거와 함께 추가합니다. 이 항목은 알림 발생 건수가 아닙니다.", nextAction: "알림 수집 기준 시각과 구간 시작·끝, 원문이 표현한 초과 시간을 각각 기록합니다.", tags: ["운영 미조회"] });

const approvals = ["코드 수정", "원격 푸시", "PR 병합", "운영 배포", "계정·요금제 변경"].map((title, index) => item(`approval-${index + 1}`, "task", "공통", `${title} · 승인 기록`, [
  field("scope", "대상·영향 범위"), field("evidence", "검토 증빙"), field("rollback", "롤백·철회 방법"), field("costImpact", "비용 영향"),
], [], { status: "승인 대기", approvalRequired: true, description: "보드는 승인 대기 기록만 관리합니다. 기록 저장은 해당 작업의 실행이나 승인 완료가 아닙니다.", nextAction: "구체적인 변경안·검증·비용·롤백 근거를 기록합니다.", tags: ["외부 실행 없음"] }));

export function createAiOperationsStarter(): BoardSnapshot {
  return structuredClone({
    meta: { title: "Cloudflare·Onpod 통합 운영", snapshotAt: OBSERVED_AT, mainSha: MAIN_SHA, mainCommitUrl: COMMIT, deadline: "2026-11-20", noticeUrl: NOTICE,
      caveats: [
        "공개 공지와 고정된 main 소스의 기준 자료입니다. 실제 운영 모델·호출량·환경·배포 상태는 별도 근거가 필요합니다.",
        "공식 공지는 410 Gone / 5028을 안내합니다. 404 / model_not_found 안내는 관련 메일을 가져와 별도 비교합니다.",
        "Onpod 알림 시각, 관측된 초과 시간, 측정 구간을 분리합니다. 여러 알림의 초과 시간을 합산하거나 장애·과금으로 환산하지 않습니다.",
        "원인 가설은 처리량·동시성·재시도·장시간 요청·중복 실행으로 비교하며 근거 없는 수치는 미확인으로 유지합니다.",
        "보드 저장 시각은 자료 관측 시각과 다릅니다. main 반영 기록은 운영 배포 완료를 뜻하지 않습니다.",
      ] },
    items: [...currentModels, ...retirements, onpod, ...hypotheses, ...approvals], sources,
  });
}
