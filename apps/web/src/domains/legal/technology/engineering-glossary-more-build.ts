import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/**
 * 확장 용어집 · 프런트와 백엔드의 빌드·배포·버전 맞추기. 기술 도감 platform-ops 의 빌드·릴리스 정합 카드와 짝을 이룬다.
 * 사실은 2026-10-08 기준 코드·시험·문서로 확인했고, 운영 대시보드와 운영 응답 헤더는 열람하지 않았다.
 */
export const GLOSSARY_MORE_BUILD: readonly GlossaryTerm[] = [
  {
    id: "build-fingerprint",
    category: "craft",
    term: t("빌드 지문 (buildId)", "Build fingerprint (buildId)"),
    definition: t(
      "빌드 결과물의 파일 목록과 내용을 해시로 눌러 만든 짧은 id입니다. 내용이 같으면 같고, 달라지면 바뀝니다.",
      "A short id made by hashing the list and contents of a build's files: it stays the same while the content is the same and changes when it differs.",
    ),
    analogy: t(
      "책 내용을 요약한 바코드와 같습니다. 표지만 새로 찍고 내용이 같으면 바코드도 같아서 서점이 재고를 바꾸지 않습니다.",
      "Like a barcode summarizing a book's content: if only the cover is reprinted, the barcode stays the same and the shop changes nothing.",
    ),
    inToonstudio: t(
      "서비스 워커 플러그인(vite.config.ts)이 앱 셸 파일 목록과 각 파일의 SHA-256, 예열 사전과 오프라인 그리기 팩의 경로 목록을 이어 해시해 앞 12자리를 buildId로 sw.js에 박고, 이 id가 precache 저장소 이름에 들어갑니다. 커밋 SHA는 번들에도 API 헬스 응답에도 없습니다.",
      "The service-worker plugin (vite.config.ts) chains the app-shell file list, each file's SHA-256, and the path lists of the warm dictionaries and the offline-drawing pack into one hash and bakes its first 12 characters into sw.js as the buildId, which also goes into the precache bucket name. No commit SHA is in the bundle or in the API health replies.",
    ),
    chapters: ["pwa-continuity", "delivery"],
    atlasIds: ["build-fingerprint-map"],
  },
  {
    id: "version-skew",
    category: "craft",
    term: t("버전 스큐 (버전 어긋남)", "Version skew"),
    definition: t(
      "새로 배포된 서버나 파일과, 오래 열려 있던 옛 탭이 서로 다른 버전으로 만나는 상황입니다.",
      "The situation where a newly deployed server or file set meets a tab that has been open for long and still runs an older version.",
    ),
    analogy: t(
      "지난주 메뉴판을 든 손님이 오늘 바뀐 주방에 주문하는 것과 같습니다.",
      "Like a guest holding last week's menu ordering from a kitchen that changed today.",
    ),
    inToonstudio: t(
      "사라진 청크 오류(chunk_load)는 자동 새로고침을 한 번만 시도해 복구하고(오류 경계는 세션당, import 래퍼는 청크당), Socket.IO 실시간 서버는 CRDT 프로토콜 버전 8이 아닌 메시지를 거절합니다. 서버를 먼저 바꿀 때의 expand/contract 순서는 문서 정책이며 코드가 강제하지는 않습니다.",
      "A vanished-chunk error (chunk_load) is recovered with a single automatic reload attempt (per session at the error boundary, per chunk at the import wrappers), and the Socket.IO realtime server refuses CRDT messages that are not protocol version 8. The expand/contract order for changing the server first is a documented policy that code does not enforce.",
    ),
    chapters: ["pwa-continuity", "delivery"],
    atlasIds: ["version-skew-chunk-reload-recovery"],
  },
  {
    id: "contract-test",
    category: "craft",
    term: t("계약 테스트 (교차 시험)", "Contract test"),
    definition: t(
      "두 쪽이 서로 다른 곳에 가진 약속(값이나 모양)이 같은지를 시험으로 대조하는 방법입니다.",
      "A way of testing that the promise (a value or a shape) that two sides hold in different places is the same.",
    ),
    analogy: t(
      "주방과 홀이 각자 베낀 메뉴판을 마감 때 맞춰 보는 점검과 같습니다.",
      "Like comparing, at closing time, the menus that the kitchen and the dining room each copied.",
    ),
    inToonstudio: t(
      "tests/integration/api-web 의 시험이 웹과 API가 따로 선언한 CRDT 프로토콜 버전(8)이 같은지 단언하고, wrangler 계약 시험은 실시간 Worker의 발급자·수신자 이름을 설정 파일과 환경 예시 5곳과 대조합니다. Pact 같은 도구는 찾지 못했고, capabilities 응답 모양처럼 교차 시험이 없는 곳도 있습니다.",
      "A test in tests/integration/api-web asserts that the CRDT protocol version (8) the web and the API declare separately is equal, and the wrangler contract test compares the realtime Worker's issuer and audience names with five config and env files. No tool like Pact was found, and some places, such as the capabilities reply shape, have no cross test.",
    ),
    chapters: ["architecture", "quality"],
    atlasIds: ["shared-contract-patterns"],
  },
  {
    id: "expand-contract",
    category: "data",
    term: t("expand / contract (확장 후 수축)", "Expand / contract"),
    definition: t(
      "옛 버전과 새 버전이 함께 쓸 수 있는 추가를 먼저 내고, 옛 버전이 사라진 뒤에 삭제를 따로 내는 두 단계 변경 방식입니다.",
      "A two-step way of changing: first ship additions that old and new versions can both use, and ship deletions separately once the old version is gone.",
    ),
    analogy: t(
      "다리를 바꿀 때 새 다리를 옆에 먼저 놓고, 차들이 옮겨 간 뒤에 옛 다리를 철거하는 것과 같습니다.",
      "Like replacing a bridge: build the new one alongside first, and demolish the old one after the traffic has moved.",
    ),
    inToonstudio: t(
      "DEPLOY.md는 마이그레이션이 있는 릴리스를 검토된 병합 두 번으로 나눕니다. expand 단계에는 삭제·이름 변경·더 엄격한 제약을 넣지 않고, contract는 옛 바이너리가 사라진 뒤 별도 릴리스로 냅니다. 순서를 어기면 막는 코드는 찾지 못했습니다.",
      "DEPLOY.md splits a release with a migration into two reviewed merges. The expand step holds no deletions, renames or stricter constraints, and contract ships as its own release after the old binary is gone. No code that blocks a wrong order was found.",
    ),
    chapters: ["delivery", "infrastructure"],
    atlasIds: ["release-order-expand-contract-rollback"],
  },
  {
    id: "hashed-name-immutable-cache",
    category: "web",
    term: t("해시 이름과 immutable 캐시", "Hashed names and immutable caching"),
    definition: t(
      "파일 이름에 내용 해시를 넣어, 이름이 같으면 같은 파일이므로 오래 보관하고 이름이 바뀌면 새 파일로 받게 하는 방식입니다.",
      "Putting a content hash in a file name so that the same name means the same file and can be kept long, while a new name means a new file to fetch.",
    ),
    analogy: t(
      "도서관 청구기호와 같습니다. 번호가 같으면 같은 책이라 다시 확인하지 않고, 새 판은 새 번호를 답니다.",
      "Like a library call number: the same number is the same book, so no recheck, and a new edition gets a new number.",
    ),
    inToonstudio: t(
      "/assets/* 는 public, max-age=31536000, immutable, /sw.js 는 no-cache 이고 HTML 은 Static Assets 기본값(매번 재확인)입니다. 서비스 워커도 /assets 는 cache-first, HTML 은 network-first 로 같은 구분을 따릅니다. 해시 없는 public 파일은 폴더 이름의 날짜·버전에 기댑니다.",
      "/assets/* gets public, max-age=31536000, immutable, /sw.js gets no-cache and HTML uses the Static Assets default (rechecked every time). The service worker follows the same split: cache-first for /assets and network-first for HTML. Public files without a hash rely on a date or version in the folder name.",
    ),
    chapters: ["delivery", "performance"],
    atlasIds: ["hashed-assets-cache-contract"],
  },
];
