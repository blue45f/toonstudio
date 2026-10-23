/**
 * Studio 진입 그래프 가드레일 — 정책 상수.
 *
 * 숫자(현재 도달 수)는 scripts/studio-eager-graph-baseline.json 에 기록되고, "무엇을 막는가"는 여기서 코드 리뷰를 받는다.
 * 금지 도메인은 "Studio 첫 화면의 정적 그래프에 들어오면 안 되는" 폴더다. 현재 도달 수가 0이 아닌 도메인도
 * 기준선에 그 수를 기록해 두고 늘 수 없게 한다 — 줄이는 방향(지연 로딩 전환)은 `--tighten` 으로 잠근다.
 */

/** 총 정적 도달 원본 크기가 기준선보다 이 비율을 넘어 커지면 실패한다. */
export const TOTAL_BYTES_TOLERANCE = 0.01;

const CREATOR = "apps/web/src/domains/creator";
const DOMAINS = "apps/web/src/domains";

/**
 * 금지 도메인. 사유 분류:
 * - runtime-3d: 3D·캐릭터 런타임. 도구를 고르거나 패널을 연 시점에 지연 로드한다(번들 게이트의 엔진 격리와 같은 방향).
 * - own-surface: 자체 라우트를 가진 제품 표면. 에디터 첫 화면에 필요 없다.
 * - export-publish: 내보내기·게시·검수 공유. 실행 시점에 지연 로드한다.
 * - app-domain: 에디터와 무관한 앱 도메인(시장·커뮤니티·운영 등).
 */
export const FORBIDDEN_DOMAINS = Object.freeze([
  ...[
    "vrm", "bg3d", "scene3d", "scene-3d", "lift3d", "character-platform", "character-shaper", "hybrid-dcc", "xr-webtoon",
  ].map((name) => ({ prefix: `${CREATOR}/${name}`, reason: "runtime-3d" })),
  ...[
    "virtual-space", "storyworld", "planning", "production-hub", "spatial-reader", "spatial", "series-launch",
    "growth-ip", "promo", "animatic", "motion-webtoon", "music", "pdf-workbench",
  ].map((name) => ({ prefix: `${CREATOR}/${name}`, reason: "own-surface" })),
  ...["publish", "review-export", "review-share", "review-production", "timelapse-share"]
    .map((name) => ({ prefix: `${CREATOR}/${name}`, reason: "export-publish" })),
  ...[
    "market", "community", "admin", "fortune", "play", "promotion", "monetization", "messages", "engagement",
    "integrations", "creator-ecosystem", "creator-resources", "creator-mentor-chat", "character-interview",
  ].map((name) => ({ prefix: `${DOMAINS}/${name}`, reason: "app-domain" })),
]);

const WEB_SRC = "apps/web/src";

/**
 * 지연 고정 파일. 진입 그래프(앱 셸·Studio 어댑터)에 정적으로 닿으면 안 되는 개별 파일이다.
 * 폴더 단위인 금지 도메인과 달리 파일 하나씩 고정하고, 기준선에 도달 수를 기록하지 않는다 — 항상 0 이어야 한다.
 * - status-dictionary-body: 상태 문구 사전 중 "지연 표면 전용 키"를 등록하는 본문 모듈. 진입 그래프에 닿는 소비 파일은
 *   같은 이름에 `-core` 가 붙은 모듈(진입 그래프 소비 파일이 쓰는 키와 해석 헬퍼만 등록)만 import 하고, 본문 모듈은
 *   지연 표면이 import 한다. 본문 모듈은 `-core` 를 함께 불러오므로 지연 소비 파일의 import 는 그대로다.
 */
export const PINNED_LAZY_FILES = Object.freeze([
  `${WEB_SRC}/shared/rest-status-i18n.ts`,
  `${WEB_SRC}/domains/auth/components/auth-rest-status-i18n.ts`,
  `${WEB_SRC}/domains/creator/studio-panel-status-i18n-r3c06.ts`,
  `${WEB_SRC}/domains/creator/studio-panel-status-i18n-r3c07.ts`,
  `${WEB_SRC}/domains/creator/studio-vrm-panel-status-i18n.ts`,
  `${WEB_SRC}/domains/creator/ai/studio-ai-error-i18n-t4t5.ts`,
].map((file) => ({ file, reason: "status-dictionary-body" })));
