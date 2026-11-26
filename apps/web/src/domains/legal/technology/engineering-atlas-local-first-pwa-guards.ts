import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · local-first · PWA 베이스 에셋 피너 5대 프로덕션 안전장치 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_LOCAL_FIRST_PWA_GUARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "pwa-base-asset-pinner-5-guards",
    category: "local-first",
    name: "PWA Base Asset Pinner (5 Safety Guards)",
    title: t("PWA 베이스 에셋 피너 5대 프로덕션 안전장치", "PWA base asset pinner with five production safety guards"),
    status: "experimental",
    tagline: t(
      "쿼터 20%/48 MiB·SRI 원자 스왑·미저장 캔버스 보호·ITP 자가치유·킬스위치 5대 가드를 넣었습니다.",
      "Protects offline WASM and starter caches with 5 guards: quota cap, SRI atomic swap, unsaved gate, ITP self-heal and kill-switch.",
    ),
    background: [
      t(
        "WASM64 바이너리와 오프라인 AI 스타터 매니페스트·256차원 색인을 CacheStorage 에 미리 고정(pin)해 두면 재방문과 오프라인 작업이 빨라지지만, 검증 없는 캐시는 치명적인 장애로 이어집니다. 깨진 HTML 오류 페이지가 .wasm 자리에 캐시되거나, 작업 중인 캔버스가 업데이트에 밀려 초기화되거나, 모바일 저장소 쿼터를 다 써 버리는 사고가 실제로 벌어집니다.",
        "Pinning WASM64 binaries, offline AI starter manifests and 256D semantic indices in CacheStorage speeds up repeat and offline sessions, but naive caching causes severe failures: HTML error pages cached as .wasm, mid-edit reloads wiping drafts, or mobile quota exhaustion.",
      ),
      t(
        "apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner.ts 와 pwa-base-asset-pinner-guards.ts 는 이를 막는 5대 프로덕션 안전장치를 하나의 컨트롤러로 묶었습니다. ① 저장소 쿼터 가드: navigator.storage.estimate() 로 가용 쿼터의 20% 와 48 MiB 상한을 동시에 지키고, QuotaExceededError 발생 시 크래시 없이 스테이징을 롤백합니다. ② 원자적 세대 스왑: toonstudio-base-staging-<buildHash> 에 먼저 받아 HTTP 200·MIME·.wasm 매직 바이트(\\0asm v1)·SHA-256 SRI 를 100% 통과한 뒤에만 활성 세대를 교체합니다.",
        "pwa-base-asset-pinner.ts and pwa-base-asset-pinner-guards.ts bundle five production guards: (1) quota cap enforcing both 20% of available quota and 48 MiB with crash-free QuotaExceededError rollback, and (2) staging into toonstudio-base-staging-<buildHash> with HTTP 200, MIME, .wasm magic bytes and SHA-256 SRI verification before atomic generation swap.",
      ),
      t(
        "③ 미저장 캔버스 보호 게이트: hasUnsavedCanvasEdits() 가 true 이면 새 세대를 pendingActivationVersion 으로 보류하고, 저장이 끝난 뒤 flushPendingActivation() 으로 비파괴 전환합니다. ④ Safari 7일 ITP 퇴거 자가 치유: navigator.storage.persist() 를 기회적으로 요청하고, verifyAndSelfHealPinnedAssets() 가 누락·손상된 캐시를 자동 복구합니다. ⑤ 비상 킬스위치: ?reset-pwa-cache=1 쿼리, x-toonstudio-pwa-kill-switch / x-toonstudio-pwa-purge-before 헤더, purgeAllPinnedCaches() 로 오염 캐시를 즉시 비웁니다.",
        "(3) Unsaved-canvas gate: when hasUnsavedCanvasEdits() is true, activation defers into pendingActivationVersion until flushPendingActivation(). (4) Safari 7-day ITP self-heal: requests navigator.storage.persist() and repairs evicted or corrupted entries via verifyAndSelfHealPinnedAssets(). (5) Emergency kill-switch: ?reset-pwa-cache=1, kill-switch/purge-before headers and purgeAllPinnedCaches().",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target): 5대 안전장치와 인메모리 캐시 더블 기반 전체 시나리오(쿼터 초과·손상 .wasm 차단·미저장 보류·ITP 퇴거 복구·URL/헤더 킬스위치)는 wasm64-offline-pwa.test.ts 에서 2026-11-26 검증됐습니다. 본편 앱 셸 Service Worker 의 기본 프리캐시 라이프사이클에 연결하는 작업은 실브라우저 업데이트 회귀 테스트를 거쳐 단계적으로 진행합니다.",
        "Current vs Roadmap: all five guards and failure scenarios (quota overflow, corrupt .wasm rejection, deferred activation, ITP self-heal, URL/header kill-switch) pass wasm64-offline-pwa.test.ts (2026-11-26). Wiring into the main app-shell Service Worker lifecycle is phased pending browser update regression checks.",
      ),
    ],
    keyPoints: [
      t("1. 쿼터 가드: 가용 쿼터 20% · 48 MiB 상한 + 무충돌 롤백", "1. Quota guard: 20% available / 48 MiB cap + safe rollback"),
      t("2. 스테이징 + .wasm 매직/SHA-256 SRI 검증 후 원자 스왑", "2. Staging + .wasm magic & SHA-256 SRI atomic swap"),
      t("3. hasUnsavedCanvasEdits 미저장 캔버스 비파괴 활성화 보류", "3. Non-destructive activation gate for unsaved canvas edits"),
      t("4. Safari 7일 ITP 자가 치유 · 5. ?reset-pwa-cache=1 킬스위치", "4. Safari 7-day ITP self-heal & 5. ?reset-pwa-cache=1 kill-switch"),
    ],
    diagram: {
      id: "pwa-base-asset-pinner-5-guards-diagram",
      kind: "layers",
      title: t("PWA 베이스 에셋 피너 5대 프로덕션 안전장치 계층", "Five production safety guards in the PWA base asset pinner"),
      caption: t(
        "수신·검증·활성화·유지·비상 복구의 다섯 관문을 모두 통과해야 오프라인 베이스 캐시가 세대 교체됩니다.",
        "Offline base caches rotate generations only after passing quota, integrity, unsaved-work, self-heal and kill-switch gates.",
      ),
      alt: t(
        "위에서부터 1층 저장소 쿼터 가드(20% 및 48 MiB 상한), 2층 스테이징 무결성 검증(HTTP 200·MIME·wasm 매직·SHA-256 SRI 원자 스왑), 3층 미저장 캔버스 보호 게이트(hasUnsavedCanvasEdits 보류), 4층 Safari 7일 ITP 퇴거 자가 치유(persist 및 verifyAndSelfHeal), 5층 비상 킬스위치(?reset-pwa-cache=1 및 서버 퍼지 헤더)가 순서대로 캐시를 보호합니다.",
        "Five stacked guard layers protect pinned offline caches: (1) 20% / 48 MiB quota guard, (2) staging HTTP 200/MIME/.wasm magic/SHA-256 SRI atomic swap, (3) unsaved canvas deferral gate, (4) Safari 7-day ITP eviction self-healing, and (5) URL and header emergency kill-switch.",
      ),
      layers: [
        {
          id: "g1",
          label: t("1. 저장소 쿼터 상한", "1. Quota ceiling guard"),
          sub: t("가용 쿼터 20% · 최대 48 MiB · 초과 시 무충돌 롤백", "20% free quota & 48 MiB cap; crash-free rollback"),
          tone: "local",
          chips: ["storage.estimate()", "48 MiB Cap", "20% Limit"],
        },
        {
          id: "g2",
          label: t("2. 스테이징 · SRI 원자 스왑", "2. Staging & SRI atomic swap"),
          sub: t("HTTP 200 · MIME · \\0asm 매직 · SHA-256 100% 검증", "HTTP 200, MIME, \\0asm magic & SHA-256 SRI check"),
          tone: "good",
          chips: ["Staging Cache", "WASM Magic", "SHA-256 SRI"],
        },
        {
          id: "g3",
          label: t("3. 미저장 캔버스 보호", "3. Unsaved-canvas gate"),
          sub: t("hasUnsavedCanvasEdits 시 보류 후 저장 완료 시 교체", "Defers swap while edits are unsaved"),
          tone: "warn",
          chips: ["pendingActivation", "flushPendingActivation"],
        },
        {
          id: "g4",
          label: t("4. Safari ITP 자가 치유", "4. Safari ITP self-heal"),
          sub: t("7일 퇴거 감지 · persist() 요청 · 손상 파일 재고정", "Detects 7-day eviction, requests persist & repairs"),
          tone: "local",
          chips: ["storage.persist()", "verifyAndSelfHeal"],
        },
        {
          id: "g5",
          label: t("5. 비상 킬스위치 퍼지", "5. Emergency kill-switch"),
          sub: t("?reset-pwa-cache=1 · 킬스위치 헤더 · 일괄 퍼지", "?reset-pwa-cache=1, kill-switch header & purge"),
          tone: "edge",
          chips: ["reset-pwa-cache=1", "x-toonstudio-pwa-kill-switch"],
        },
      ],
      brackets: [
        { label: t("오염·유실 차단 5중 안전망", "5-layer cache safety net"), layerIds: ["g1", "g2", "g3", "g4", "g5"] },
      ],
    },
    usage: [
      {
        feature: t("PWA 베이스 에셋 피너 컨트롤러", "PWA base asset pinner controller"),
        role: t(
          "스테이징 캐시 기록, 미저장 캔버스 보류, Safari ITP 자가 치유, 비상 퍼지를 단일 상태 머신으로 실행합니다.",
          "Runs staging writes, unsaved-canvas deferral, Safari ITP self-healing and emergency purges in one state machine.",
        ),
        paths: ["apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner.ts"],
        route: "/studio",
      },
      {
        feature: t("무결성·쿼터·킬스위치 가드 모듈 & 테스트", "Integrity, quota & kill-switch guards & tests"),
        role: t(
          "48 MiB/20% 상한 상수, \\0asm 매직·SHA-256 SRI 검증, URL·헤더 킬스위치 파서와 전체 장애 시나리오를 검증합니다.",
          "Defines the 48 MiB/20% limits, \\0asm magic and SHA-256 SRI validators, URL/header kill-switch parsers and failure tests.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner-guards.ts",
          "apps/web/src/domains/creator/wasm64-offline-pwa/wasm64-offline-pwa.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t(".wasm 매직 바이트와 쿼터 상한(20% / 48 MiB) 검사", "Checking .wasm magic bytes and the 20% / 48 MiB quota cap"),
        language: "ts",
        ...sampleSource([
          ["const MAX_PIN_BYTES = 48 * 1024 * 1024;"],
          ["const MAX_QUOTA_FRACTION = 0.2;"],
          [""],
          ["export function hasValidWasmMagic(bytes: Uint8Array): boolean {"],
          ["  return bytes.byteLength >= 8 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;"],
          ["}"],
          [""],
          ["export function withinPinBudget(payloadBytes: number, freeQuotaBytes: number): boolean {"],
          ["  const ceiling = Math.min(MAX_PIN_BYTES, Math.floor(freeQuotaBytes * MAX_QUOTA_FRACTION));", "48 MiB 와 가용 쿼터 20% 중 작은 값", "smaller of 48 MiB and 20% free quota"],
          ["  return payloadBytes <= ceiling;"],
          ["}"],
        ]),
        explain: t(
          "실제 pwa-base-asset-pinner-guards.ts 는 WASM 버전 1 바이트(0x01 0x00 0x00 0x00), MIME 검사, WebCrypto SHA-256 SRI 대조, JSON 구문 검사까지 모두 통과해야 스테이징을 허용합니다.",
          "The real pwa-base-asset-pinner-guards.ts also verifies WASM v1 bytes, MIME headers, WebCrypto SHA-256 SRI digests and JSON syntax before accepting a staged asset.",
        ),
        source: "apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner-guards.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Storage quotas and eviction criteria",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria",
        kind: "docs",
        note: t("StorageManager.estimate()·persist() 와 브라우저 캐시 퇴거 정책", "StorageManager.estimate(), persist() and browser eviction rules"),
      },
      {
        title: "WebKit · Full Third-Party Cookie Blocking & 7-Day Script-Writable Storage Cap",
        url: "https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/",
        kind: "article",
        note: t("Safari 7일 ITP 비활동 저장소 퇴거 정책 배경", "Background on Safari's 7-day ITP eviction of script-writable storage"),
      },
    ],
    chapterIds: ["pwa-continuity", "storage", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "WASM64 와 오프라인 스타터 캐시가 오히려 장애 원인이 되지 않도록, 20%/48 MiB 쿼터 가드·스테이징 + .wasm 매직/SHA-256 SRI 원자 스왑·미저장 캔버스 보호 게이트·Safari 7일 ITP 자가 치유·?reset-pwa-cache=1 비상 킬스위치 5대 프로덕션 안전장치를 구현하고 테스트했습니다.",
        "To ensure pinned WASM64 and starter caches never brick users, we built and tested five production guards: 20%/48 MiB quota cap, staging + .wasm magic/SHA-256 SRI atomic swap, unsaved-canvas deferral, Safari 7-day ITP self-heal and ?reset-pwa-cache=1 emergency purge.",
      ),
      analogy: t(
        "비행기 부품을 갈아 끼울 때 새 부품을 창고(스테이징)에서 엑스레이(SRI·매직)로 다 검사하고, 비행 중(미저장 작업)에는 교체하지 않고 착륙 뒤에만 갈아 끼우며, 비상 탈출 레버(킬스위치)까지 달아 둔 정비 절차입니다.",
        "Like X-raying spare parts in a hangar (staging + SRI), refusing to swap while airborne (unsaved edits), and keeping a manual reset lever (kill-switch).",
      ),
      questions: [
        {
          question: t("왜 .wasm 매직 바이트까지 직접 검사하나요?", "Why inspect .wasm magic bytes directly?"),
          answer: t(
            "CDN 장애나 SPA 폴백이 HTTP 200 으로 index.html 을 돌려주는 사고가 흔합니다. \\0asm 매직 바이트와 MIME·SHA-256 을 같이 확인하면 오염된 응답이 캐시 세대에 아예 들어오지 못합니다.",
            "CDNs or SPA fallbacks sometimes serve index.html with HTTP 200; checking \\0asm magic bytes, MIME and SHA-256 keeps poisoned payloads out of CacheStorage.",
          ),
        },
        {
          question: t("Safari 에서 7일간 접속하지 않아 캐시가 지워지면 원고도 날아가나요?", "If Safari evicts caches after 7 days, are drafts lost?"),
          answer: t(
            "베이스 에셋 피너는 정적 WASM·스타터 캐시를 verifyAndSelfHealPinnedAssets() 로 자동 복구합니다. 다만 브라우저 저장소 자체가 영구 백업은 아니므로 중요 원고는 별도 내보내기·개인 클라우드 백업을 권장합니다.",
            "verifyAndSelfHealPinnedAssets() re-pins evicted static WASM and starter assets automatically, while users should still back up manuscripts externally because browser storage is never permanent backup.",
          ),
        },
      ],
      pitfall: t(
        "navigator.storage.persist() 는 브라우저마다 허락 기준이 달라 항상 granted 가 되지 않으며, 본편 Service Worker 기본 라이프사이클 연결은 회귀 검증을 거쳐 단계적으로 진행합니다.",
        "navigator.storage.persist() is granted heuristically by browsers and never guaranteed; wiring into the main app-shell Service Worker proceeds in verified stages.",
      ),
    },
    technologies: ["Cache API", "Service Worker", "StorageManager", "WebAssembly"],
    facts: [
      {
        value: "20% / 48 MiB",
        label: t("가용 쿼터 비율 · 절대 바이트 이중 상한 가드", "Dual quota guard: 20% available quota & 48 MiB ceiling"),
        source: "apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner-guards.ts",
      },
      {
        value: "\\0asm + SHA-256",
        label: t("스테이징 무결성 100% 통과 후 원자적 세대 스왑", "Atomic generation swap after \\0asm magic & SHA-256 SRI checks"),
        source: "apps/web/src/domains/creator/wasm64-offline-pwa/pwa-base-asset-pinner.ts",
      },
      {
        value: "5 Safety Guards",
        label: t("쿼터·SRI 스왑·미저장 보호·ITP 자가치유·?reset-pwa-cache=1", "Quota, SRI swap, unsaved gate, ITP self-heal & kill-switch"),
        source: "apps/web/src/domains/creator/wasm64-offline-pwa/wasm64-offline-pwa.test.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
