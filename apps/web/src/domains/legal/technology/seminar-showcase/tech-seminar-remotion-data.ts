/**
 * 기술 세미나 Remotion 모션 도식 플레이어의 타임라인·챕터·단계 단일 진실 원본.
 *
 * 5개 핵심 아키텍처 주제를 각 12초(360프레임 @ 30fps), 총 60초(1,800프레임) 시퀀스로 구성한다.
 * 모든 `sourcePaths`와 심볼 이름은 저장소에 실재하는 파일만 참조하며 Vitest에서 존재 여부를 검증한다.
 */

export const SEMINAR_REMOTION_FPS = 30 as const;
export const SEMINAR_STAGES_PER_CHAPTER = 4 as const;
export const SEMINAR_FRAMES_PER_STAGE = 90 as const;
export const SEMINAR_CHAPTER_DURATION_FRAMES =
  SEMINAR_STAGES_PER_CHAPTER * SEMINAR_FRAMES_PER_STAGE; // 360 frames (12s)

export type TechSeminarChapterId =
  | "webgpu-km7-binning"
  | "wasm64-opfs-crdt"
  | "oauth-pkce-unlink"
  | "pointer-dnd-60fps"
  | "zero-won-hybrid-deploy";

export type TechSeminarLinkedRecipeId =
  | "kakao-oauth-unlink"
  | "google-oauth-state-cookie"
  | "pointer-dnd-a11y"
  | "production-core-libraries"
  | "webgpu-wgsl-cpu-parity"
  | "offline-idempotent-zero-deploy";

export interface TechSeminarMotionStage {
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly role: string;
  readonly metric: string;
  readonly codeRef: string;
  readonly arrowLabel: string;
  readonly speakerCue: string;
}

export interface TechSeminarMotionChapter {
  readonly id: TechSeminarChapterId;
  readonly order: number;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly shortLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly accentHex: string;
  readonly accentSoftHex: string;
  readonly presenterOneLiner: string;
  readonly invariantBadge: string;
  readonly relatedRecipeId: TechSeminarLinkedRecipeId;
  readonly sourcePaths: readonly string[];
  readonly stages: readonly [
    TechSeminarMotionStage,
    TechSeminarMotionStage,
    TechSeminarMotionStage,
    TechSeminarMotionStage,
  ];
}

export const TECH_SEMINAR_MOTION_CHAPTERS: readonly TechSeminarMotionChapter[] = Object.freeze([
  {
    id: "webgpu-km7-binning",
    order: 1,
    startFrame: 0,
    durationFrames: SEMINAR_CHAPTER_DURATION_FRAMES,
    shortLabel: "WebGPU 7밴드",
    title: "WebGPU 7밴드 분광 안료 & 타일 비닝 Compute 파이프라인",
    subtitle: "Dab 스팬 산출 → CSR Prefix Scan → 공유 메모리 8×8 워크그룹 → 7밴드 KM 감산 혼색",
    accentHex: "#e09f3e",
    accentSoftHex: "rgba(224, 159, 62, 0.16)",
    presenterOneLiner:
      "브러시 스탬프를 타일별 CSR 버퍼로 먼저 묶어 두고, 8×8 워크그룹이 공유 메모리에서 7밴드 물리 안료를 한 번에 섞습니다.",
    invariantBadge: "CPU Math.fround ↔ WGSL f32 동등성 검증",
    relatedRecipeId: "webgpu-wgsl-cpu-parity",
    sourcePaths: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-dab-tile-binning-compute.ts",
    ],
    stages: [
      {
        id: "dab-span",
        index: 0,
        label: "1. Dab 타일 스팬 산출",
        role: "CPU 경계 판정",
        metric: "최대 16,384 dabs",
        codeRef: "StudioWebGpuDabTileSpanPlan",
        arrowLabel: "min/max Col·Row (Uint32Array)",
        speakerCue: "CPU는 각 브러시 Dab이 걸치는 타일 범위 정수 4개만 계산해 GPU로 넘깁니다.",
      },
      {
        id: "csr-scan",
        index: 1,
        label: "2. Count → Prefix Scan → CSR",
        role: "GPU 비닝 3패스",
        metric: "최대 4,096 tiles",
        codeRef: "tile_offsets · dab_indices",
        arrowLabel: "결정론적 CSR 참조 테이블",
        speakerCue: "타일별 개수를 센 뒤 Exclusive Prefix Scan과 Stable Scatter로 원순서를 보존합니다.",
      },
      {
        id: "workgroup-shared",
        index: 2,
        label: "3. 8×8 공유 메모리 배치",
        role: "Compute 커널",
        metric: "64 dabs/배치",
        codeRef: "@workgroup_size(8, 8, 1)",
        arrowLabel: "workgroupBarrier() 동기화",
        speakerCue: "64개 스레드가 var<workgroup>에 Dab 64개를 협업 로딩해 전역 메모리 읽기를 줄입니다.",
      },
      {
        id: "km7-spectral",
        index: 3,
        label: "4. 7밴드 KM 분광 + CPU 폴백",
        role: "안료 물리 혼색",
        metric: "vec4<f32> × 2",
        codeRef: "mixKm7SpectralSrgbF32Mirror",
        arrowLabel: "선형 sRGB 복원 출력",
        speakerCue: "파랑+노랑을 섞으면 초록이 나오는 7밴드 KM 수식을 CPU f32 미러와 1:1로 맞춥니다.",
      },
    ],
  },
  {
    id: "wasm64-opfs-crdt",
    order: 2,
    startFrame: SEMINAR_CHAPTER_DURATION_FRAMES,
    durationFrames: SEMINAR_CHAPTER_DURATION_FRAMES,
    shortLabel: "OPFS · CRDT",
    title: "Wasm64 + OPFS SQLite 로컬-퍼스트 & Yjs CRDT 동기화",
    subtitle: "전용 Worker 단일 쓰기 → SQLite opfs-sahpool + SHA-256 CAS → Y.Doc 병합 → 멱등 큐 압축",
    accentHex: "#2a9d8f",
    accentSoftHex: "rgba(42, 157, 143, 0.16)",
    presenterOneLiner:
      "창(Window)은 SQLite를 직접 열지 않고 단일 Worker의 OPFS SAH-Pool에 맡겨, 오프라인 편집 뒤에도 유실 없이 합칩니다.",
    invariantBadge: "단일 Worker 쓰기 권위 · Web Locks 직렬화",
    relatedRecipeId: "offline-idempotent-zero-deploy",
    sourcePaths: [
      "apps/web/src/domains/creator/studio-local-database-runtime.ts",
      "apps/web/src/domains/creator/studio-local-database-worker-sqlite-loader.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-libraries-sqlite-opfs-authority.ts",
      "apps/web/src/domains/creator/live/studio-crdt-document-host.ts",
      "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
    ],
    stages: [
      {
        id: "worker-authority",
        index: 0,
        label: "1. DedicatedWorker 단일 진입",
        role: "쓰기 잠금 경계",
        metric: "opfs-sahpool 전용",
        codeRef: "loadStudioLocalDatabaseWorkerSqlite",
        arrowLabel: "불필요한 proxy VFS 차단",
        speakerCue: "Window에는 createSyncAccessHandle이 없으므로 Worker 하나가 DB 연결을 독점합니다.",
      },
      {
        id: "sqlite-opfs-cas",
        index: 1,
        label: "2. SQLite 메타 + OPFS CAS",
        role: "구조·바이너리 분리",
        metric: "sha256:64hex CAS",
        codeRef: "StudioBg3dLibrariesAuthority",
        arrowLabel: "manifest 커밋 + 참조 GC",
        speakerCue: "작은 매니페스트는 SQLite 표에, 큰 3D·이미지는 SHA-256 내용 주소 OPFS에 따로 저장합니다.",
      },
      {
        id: "yjs-crdt-doc",
        index: 2,
        label: "3. Yjs CRDT 인과 상태 병합",
        role: "실시간 동시 편집",
        metric: "Y.Map · Y.Array",
        codeRef: "StudioCrdtDocumentHost",
        arrowLabel: "deletionOps · deletionAcks",
        speakerCue: "스트로크·컷 순서·삭제 툼스톤을 Y.Doc 트랜잭션으로 추적해 동시 편집 충돌을 흡수합니다.",
      },
      {
        id: "idempotent-queue",
        index: 3,
        label: "4. 오프라인 멱등 큐 압축",
        role: "재접속 안전 반영",
        metric: "FNV-1a 멱등 키",
        codeRef: "mergeOfflineSyncQueue",
        arrowLabel: "modify-after-delete 보류",
        speakerCue: "재접속 시 이미 반영된 키를 버리고, 삭제 뒤 수정 충돌은 덮어쓰지 않고 사용자에게 알립니다.",
      },
    ],
  },
  {
    id: "oauth-pkce-unlink",
    order: 3,
    startFrame: SEMINAR_CHAPTER_DURATION_FRAMES * 2,
    durationFrames: SEMINAR_CHAPTER_DURATION_FRAMES,
    shortLabel: "OAuth · Unlink",
    title: "카카오·구글 OAuth PKCE + Signed HttpOnly State Cookie + Unlink Webhook",
    subtitle: "HMAC State·__Host- 쿠키 발급 → 상수 시간 대조 → 구글 GIS 서버 검증 → 카카오 Unlink 세션 선폐기",
    accentHex: "#4f86c6",
    accentSoftHex: "rgba(79, 134, 198, 0.16)",
    presenterOneLiner:
      "브라우저 쿠키와 서명된 state를 상수 시간으로 맞춰 CSRF를 막고, 자동 이메일 병합 없이 명시적 연동만 허용합니다.",
    invariantBadge: "timingSafeEqual · 자동 이메일 병합 전면 금지",
    relatedRecipeId: "kakao-oauth-unlink",
    sourcePaths: [
      "apps/api/src/server/oauth.ts",
      "apps/api/src/oauth-state-cookie.ts",
      "apps/api/src/modules/auth/auth.controller.ts",
      "apps/api/src/modules/auth/kakao-unlink-webhook.ts",
      "apps/api/src/modules/auth/kakao-unlink-webhook.controller.ts",
    ],
    stages: [
      {
        id: "issue-state-pkce",
        index: 0,
        label: "1. HMAC State + __Host- 쿠키",
        role: "로그인 시작 가드",
        metric: "TTL 10분 · S256",
        codeRef: "issueState · oauthStateCookieName",
        arrowLabel: "HttpOnly; Secure; SameSite",
        speakerCue: "프로덕션에서는 __Host- 접두사 쿠키에 서명 state와 PKCE verifier를 10분 동안만 묶어 둡니다.",
      },
      {
        id: "callback-verify",
        index: 1,
        label: "2. 콜백 상수 시간 검증",
        role: "CSRF · 리플레이 차단",
        metric: "timingSafeEqual",
        codeRef: "verifyBrowserBoundState",
        arrowLabel: "소유 확인 후 즉시 쿠키 삭제",
        speakerCue: "URL state와 쿠키 state가 1바이트라도 다르면 거절하고, 소유가 확인된 뒤에만 쿠키를 지웁니다.",
      },
      {
        id: "google-gis-verify",
        index: 2,
        label: "3. 구글 GIS ID 토큰 검증",
        role: "서명·aud·iss·email",
        metric: "canAutoLink = false",
        codeRef: "verifyGoogleIdToken",
        arrowLabel: "409 ACCOUNT_LINK_REQUIRED",
        speakerCue: "이메일이 같아도 자동 병합하지 않습니다. 기존 계정은 로그인 뒤 명시적으로 연결하게 유도합니다.",
      },
      {
        id: "kakao-unlink",
        index: 3,
        label: "4. 카카오 Unlink 웹훅 처리",
        role: "계정 해제 동기화",
        metric: "KakaoAK 검증 · 200 OK",
        codeRef: "parseKakaoUnlinkWebhook · processKakaoUnlink",
        arrowLabel: "세션 선폐기 → 연동 삭제/탈퇴",
        speakerCue: "카카오 앱에서 연결을 끊으면 세션을 먼저 폐기하고, 유일한 로그인 수단이면 안전하게 소프트 삭제합니다.",
      },
    ],
  },
  {
    id: "pointer-dnd-60fps",
    order: 4,
    startFrame: SEMINAR_CHAPTER_DURATION_FRAMES * 3,
    durationFrames: SEMINAR_CHAPTER_DURATION_FRAMES,
    shortLabel: "60fps 포인터 DnD",
    title: "포인터 캡처 기반 60fps 드래그 앤 드롭(레이어·컷 스트립·칸반 보드)",
    subtitle: "5px 임계치·터치 손잡이 분리 → GPU 고스트·자동 스크롤 → 순수 드롭 의도 판정 → 오클릭 차단·키보드 동등성",
    accentHex: "#d96b43",
    accentSoftHex: "rgba(217, 107, 67, 0.16)",
    presenterOneLiner:
      "무거운 외부 DnD 라이브러리 대신 Pointer Events와 순수 슬롯 계산 함수로 마우스·터치·키보드를 60fps로 통합했습니다.",
    invariantBadge: "외부 DnD 의존 0 · 키보드 Space/방향키 동등 지원",
    relatedRecipeId: "pointer-dnd-a11y",
    sourcePaths: [
      "apps/web/src/domains/creator/production-hub/board/use-board-dnd.ts",
      "apps/web/src/domains/creator/layer/studio-layer-drag.ts",
      "apps/web/src/domains/creator/page/studio-page-strip-dnd.ts",
    ],
    stages: [
      {
        id: "pointer-threshold",
        index: 0,
        label: "1. 5px 임계치 · 터치 분리",
        role: "오동작 방지 진입",
        metric: "START_DISTANCE = 5px",
        codeRef: "useBoardDnd (onPointerDown)",
        arrowLabel: "터치는 손잡이 touch-action:none",
        speakerCue: "마우스는 5px 넘게 끌 때만 시작하고, 모바일 터치는 손잡이에서만 끌어 본문 스크롤을 지킵니다.",
      },
      {
        id: "ghost-autoscroll",
        index: 1,
        label: "2. GPU 고스트 & 엣지 스크롤",
        role: "60fps 시각 피드백",
        metric: "rAF · will-change",
        codeRef: "createGhost · edgeStep",
        arrowLabel: "56px/80px 가장자리 가속",
        speakerCue: "복제 카드 고스트는 transform만 이동시키고, 보드 가장자리 56px 안쪽에서는 rAF로 부드럽게 스크롤합니다.",
      },
      {
        id: "pure-drop-intent",
        index: 2,
        label: "3. 순수 함수 드롭 의도 계산",
        role: "레이어·스트립·열 판정",
        metric: "0.28~0.72 그룹 중앙",
        codeRef: "resolveStudioLayerGroupDropIntent",
        arrowLabel: "RTL 반전 · 제자리 드롭 무시",
        speakerCue: "DOM에 손대지 않는 순수 함수가 앞/뒤 절반, 그룹 중앙(28~72%), RTL 방향을 결정론적으로 판정합니다.",
      },
      {
        id: "commit-and-a11y",
        index: 3,
        label: "4. 드롭 커밋 + 오클릭 차단",
        role: "권위 위임 & 접근성",
        metric: "Space · ←↑↓→ · Enter",
        codeRef: "suppressNextClick · onDrop",
        arrowLabel: "blur/hidden 시 즉시 취소",
        speakerCue: "드롭 직후 발생하는 click 이벤트를 1회 막고, 탭 전환이나 키보드 Esc 시 고스트를 깨끗이 정리합니다.",
      },
    ],
  },
  {
    id: "zero-won-hybrid-deploy",
    order: 5,
    startFrame: SEMINAR_CHAPTER_DURATION_FRAMES * 4,
    durationFrames: SEMINAR_CHAPTER_DURATION_FRAMES,
    shortLabel: "₩0 하이브리드 배포",
    title: "1인 기업 ₩0 하이브리드 배포(Cloudflare Static + R2 + 서울 onpod)",
    subtitle: "Cloudflare Edge 정적·헬스 즉시 응답 → R2 대형 자산 → Origin Secret 서울 onpod → 스마트 SHA 배포",
    accentHex: "#5a9a6e",
    accentSoftHex: "rgba(90, 154, 110, 0.16)",
    presenterOneLiner:
      "정적 앱과 3.5GB 3D 자산은 Cloudflare 무료 한도에서 내주고, Core API·PG 17만 서울 onpod 무료 티어로 분리해 월 ₩0을 유지합니다.",
    invariantBadge: "40자리 SHA 고정 · onpod 명시 승인(--confirm-onpod)",
    relatedRecipeId: "offline-idempotent-zero-deploy",
    sourcePaths: [
      "scripts/dispatch-cloud-deploy.mjs",
      "deploy/STANDING_APPROVAL.json",
      "deploy/cloudflare-static/bundle-v2-deploy-manifest.json",
      "docs/operations/infrastructure-map.md",
    ],
    stages: [
      {
        id: "cf-edge-static",
        index: 0,
        label: "1. Cloudflare 정적 + 엣지 분기",
        role: "toonspectrum-web",
        metric: "₩0 · Workers Free",
        codeRef: "deploy/cloudflare-static",
        arrowLabel: "/api/health/live 엣지 즉시 200",
        speakerCue: "브라우저 첫 요청은 Cloudflare Worker가 정적 앱을 내려주고, 헬스체크는 API를 깨우지 않고 엣지에서 끝냅니다.",
      },
      {
        id: "cf-r2-assets",
        index: 1,
        label: "2. R2 대형 3D·텍스처 오프로드",
        role: "25 MiB 초과 분리",
        metric: "7,258개 · $0.00",
        codeRef: "bundle-v2-deploy-manifest.json",
        arrowLabel: "Static 20,000파일 한도 회피",
        speakerCue: "25MiB가 넘는 3D·캐릭터 자산 7,258개는 R2에 두어 Static 파일 수 한도와 송신 요금을 피했습니다.",
      },
      {
        id: "seoul-onpod-origin",
        index: 2,
        label: "3. 서울 onpod Core API + PG 17",
        role: "x-toonstudio-origin-secret",
        metric: "₩0 티어 · PG 17",
        codeRef: "docs/operations/infrastructure-map.md",
        arrowLabel: "미서명 직접 호출 403 차단",
        speakerCue: "Worker가 origin-secret 헤더를 붙여 서울 onpod로 넘기며, 헤더 없는 직접 접속은 403으로 차단합니다.",
      },
      {
        id: "smart-sha-deploy",
        index: 3,
        label: "4. 크로스-LLM 스마트 SHA 배포",
        role: "승인 경계 자동 검증",
        metric: "--smart · 40자 SHA",
        codeRef: "scripts/dispatch-cloud-deploy.mjs",
        arrowLabel: "onpod 변경 시 --confirm-onpod 필수",
        speakerCue: "로컬 .env 없이도 변경된 단위만 선별 배포하고, 서울 onpod 이미지 교체는 명시적 승인 플래그로 잠급니다.",
      },
    ],
  },
]);

export const SEMINAR_TOTAL_DURATION_FRAMES =
  TECH_SEMINAR_MOTION_CHAPTERS.length * SEMINAR_CHAPTER_DURATION_FRAMES; // 1800 frames (60s)

/** 프레임 번호를 유효한 타임라인 구간 [0, total - 1]로 고정한다. */
export function clampSeminarFrame(frame: number): number {
  if (!Number.isFinite(frame) || frame <= 0) return 0;
  return Math.min(SEMINAR_TOTAL_DURATION_FRAMES - 1, Math.floor(frame));
}

/** 주어진 프레임이 속한 모션 도식 챕터를 돌려준다. */
export function seminarChapterAtFrame(frame: number): TechSeminarMotionChapter {
  const safe = clampSeminarFrame(frame);
  const index = Math.min(
    TECH_SEMINAR_MOTION_CHAPTERS.length - 1,
    Math.floor(safe / SEMINAR_CHAPTER_DURATION_FRAMES),
  );
  return TECH_SEMINAR_MOTION_CHAPTERS[index] ?? TECH_SEMINAR_MOTION_CHAPTERS[0];
}

/** 챕터 내 로컬 프레임(0..359)으로 현재 강조할 단계 인덱스(0..3)를 계산한다. */
export function seminarStageIndexInChapter(
  localFrame: number,
  stageCount: number = SEMINAR_STAGES_PER_CHAPTER,
): number {
  const safeCount = Math.max(1, stageCount);
  const safeFrame = Math.max(0, Number.isFinite(localFrame) ? localFrame : 0);
  const framesPerStage = SEMINAR_CHAPTER_DURATION_FRAMES / safeCount;
  return Math.min(safeCount - 1, Math.floor(safeFrame / framesPerStage));
}

/** 현재 단계 안에서의 진행 비율(0..1)을 계산한다. 화살표·진행 바 애니메이션에 사용한다. */
export function seminarStageProgress(
  localFrame: number,
  stageCount: number = SEMINAR_STAGES_PER_CHAPTER,
): number {
  const safeCount = Math.max(1, stageCount);
  const safeFrame = Math.max(0, Number.isFinite(localFrame) ? localFrame : 0);
  const framesPerStage = SEMINAR_CHAPTER_DURATION_FRAMES / safeCount;
  const stageIdx = seminarStageIndexInChapter(safeFrame, safeCount);
  const offset = safeFrame - stageIdx * framesPerStage;
  return Math.max(0, Math.min(1, offset / framesPerStage));
}

/** 특정 챕터·단계의 시작 프레임을 계산한다(발표 중 단계 점프용). */
export function seminarFrameForChapterStage(
  chapterId: TechSeminarChapterId,
  stageIndex = 0,
): number {
  const chapter = TECH_SEMINAR_MOTION_CHAPTERS.find((item) => item.id === chapterId);
  if (!chapter) return 0;
  const boundedStage = Math.max(0, Math.min(chapter.stages.length - 1, Math.floor(stageIndex)));
  return chapter.startFrame + boundedStage * SEMINAR_FRAMES_PER_STAGE;
}

/** 프레임 번호를 `MM:SS` 형식으로 바꾼다. */
export function formatSeminarTimestamp(frame: number, fps: number = SEMINAR_REMOTION_FPS): string {
  const safeFps = fps > 0 ? fps : SEMINAR_REMOTION_FPS;
  const totalSeconds = Math.max(0, Math.floor(clampSeminarFrame(frame) / safeFps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
