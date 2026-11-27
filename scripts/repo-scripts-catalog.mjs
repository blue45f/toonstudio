#!/usr/bin/env node
/**
 * package.json 전체 스크립트(335+)를 10대 한글 그룹으로 자동 분류하고
 * 자주 쓰는 핵심 10줄 퀵스타트와 검색·필터·JSON 출력을 제공하는 DX 가이드 CLI.
 *
 * 사용 예:
 *   pnpm run scripts:help
 *   node scripts/repo-scripts-catalog.mjs --group deploy
 *   node scripts/repo-scripts-catalog.mjs --search deploy
 *   node scripts/repo-scripts-catalog.mjs --all
 *   node scripts/repo-scripts-catalog.mjs --json
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SCRIPT_GROUPS = Object.freeze([
  { index: 1, key: "dev", title: "1. 개발·실행", summary: "로컬 웹·API·실험 앱 실행, 미리보기, 모바일·미디어 도구" },
  { index: 2, key: "build", title: "2. 빌드·번들·프리캐시", summary: "프로덕션 빌드, 번들·Remotion 청크 게이트, 모바일 패키징" },
  { index: 3, key: "deploy", title: "3. 배포·클라우드(1줄 명령)", summary: "Cloudflare·서울 onpod·R2·GitHub Actions 수동 배포 및 상태 진단" },
  { index: 4, key: "lint-arch", title: "4. 타입·린트·아키텍처", summary: "TypeScript 샤드 타입체크, ESLint 무경고, 래칫·경계·데드코드 검증" },
  { index: 5, key: "test-core", title: "5. 핵심 단위/통합 테스트", summary: "Vitest·성능·접근성·마켓 E2E·협업 안정성·CI 통합 게이트" },
  { index: 6, key: "studio-3d", title: "6. 스튜디오·브러시·3D 검증", summary: "WebGPU·Hokusai WASM·Vello·ThorVG·브러시·필터·3D/VRM 벤치/검증" },
  { index: 7, key: "docs-i18n", title: "7. 문서·i18n·카탈로그", summary: "문서 권위/링크 검증, 매뉴얼 생성, 다국어 내장 사전, 작품 카탈로그" },
  { index: 8, key: "security-audit", title: "8. 보안·라이선스·감사", summary: "취약점·시크릿·CSP·제3자 라이선스·에셋 권리·시각 UX·저장소 위생 감사" },
  { index: 9, key: "db-local", title: "9. DB·API·로컬스택", summary: "Drizzle 스키마·시드·PostgreSQL/Redis 통합 테스트·로컬 풀스택" },
  { index: 10, key: "harness-tools", title: "10. 하네스·기타 도구", summary: "에이전트 하네스, Git 훅, ToonBridge, MCP/CLI 및 본 스크립트 카탈로그" },
]);

export const QUICKSTART_COMMANDS = Object.freeze([
  { label: "로컬 개발 서버 실행", command: "pnpm run dev", note: "웹 앱 Vite 개발 서버 실행(자동 카탈로그·i18n 사전 준비 포함)" },
  { label: "배포 상태·범위 JSON 브리핑", command: "pnpm run deploy:doctor -- --json", note: "현역 인프라·변경 범위·다음 1줄 배포 명령 확인(시크릿 미출력)" },
  { label: "클라우드 1줄 스마트 배포", command: "gh workflow run cloud-production-deploy.yml -f mode=smart-release", note: "변경된 웹/API 단위만 자동 선별해 수동 배포(onpod 반영 시 확인 문구 필요)" },
  { label: "로컬 정적 웹 1줄 배포", command: "pnpm run deploy:web", note: "Cloudflare Static+R2 운영 반영(토큰 충돌 시 env -u CLOUDFLARE_API_TOKEN ... --wrangler-oauth)" },
  { label: "프로덕션 전체 빌드", command: "pnpm run build", note: "웹 타입체크 → Vite 번들 빌드 → 제3자 고지서 및 CSP 검증" },
  { label: "빠른 변경 파일 린트", command: "pnpm run lint:quick", note: "현재 변경된 JS/TS 파일만 즉시 ESLint 점검" },
  { label: "전체 타입체크(웹+API)", command: "pnpm run typecheck", note: "워크스페이스 링크 확인 + 웹 샤드 타입체크 + API 타입체크" },
  { label: "아키텍처·문서·래칫 검증", command: "pnpm run validate:architecture", note: "문서 링크·소스 레이아웃·앱 경계·800줄 파일 크기·Studio 진입 그래프 일괄 검사" },
  { label: "핵심 단위 테스트 빠른 실행", command: "pnpm run test:fast", note: "Vitest 단위 테스트 스위트 실행" },
  { label: "에이전트 하네스 변경 검증", command: "pnpm run harness:verify", note: "변경 범위에 맞춰 필수 하네스·검증 게이트 자동 실행" },
]);

const EXACT_DESCRIPTIONS = Object.freeze({
  "scripts:help": "package.json 전체 스크립트를 10대 한글 그룹과 핵심 10줄 퀵스타트로 안내",
  prepare: "Git 훅(Husky pre-commit/commit-msg/pre-push) 초기 설정",
  "harness:doctor": "에이전트 하네스 및 로컬 개발 환경 건강 상태 진단",
  "harness:check": "AGENTS.md·어댑터·하네스 구조 무결성 검증",
  "harness:verify": "변경 범위에 맞춘 빠른 하네스 검증 게이트 실행",
  dev: "웹 앱(apps/web) Vite 로컬 개발 서버 실행",
  predev: "개발 서버 실행 전 워크스페이스 링크·카탈로그·i18n 내장 사전 준비",
  "dev:api": "NestJS Core API(apps/api) 로컬 개발 서버 실행",
  "dev:all": "워크스페이스 전체 앱 병렬 개발 서버 실행",
  preview: "빌드된 웹 프로덕션 번들(dist) 로컬 미리보기 서버 실행",
  start: "빌드된 웹 프로덕션 번들 로컬 서버 시작(preview 별칭)",
  prebuild: "빌드 전 운영 릴리스 호환성·워크스페이스 링크·카탈로그·i18n 준비",
  build: "웹 타입체크 및 프로덕션 Vite 번들 빌드(12 GiB 힙)",
  "build:bundle": "타입체크 없이 웹 프로덕션 Vite 번들만 단독 빌드",
  postbuild: "빌드 산출물 제3자 라이선스 고지서 생성 및 dist/index.html CSP 검증",
  "build:all": "모노레포 전체 워크스페이스 패키지 순차 빌드",
  "build:wasm64:memory64": "Rust studio-wasm64-drawing-core 실물 wasm64(memory64·i64) 바이너리 2종 빌드 및 V8 검증",
  "bundle:visualize": "Rollup/Vite 번들 크기 트리맵 시각화 리포트 생성",
  "check:studio-bundle": "Studio 번들 크기·청크 분리·지연 로딩 예산 게이트 검증",
  "check:product-tour-remotion-chunks": "Remotion 단일 인스턴스 및 제품 투어 청크 무결성(G5-3) 검증",
  "verify:product-tour-live": "운영 /product-tour Remotion 실재생 게이트(G5-1/G5-2) 검증",
  "lhci:autorun": "Lighthouse CI 성능·CLS·LCP 예산 자동 측정",
  "deploy:doctor": "현재 SHA·필수 CI·로컬 Wrangler OAuth·배포 범위 종합 진단",
  "deploy:cloud": "GitHub Actions 수동 클라우드 배포 워크플로 디스패치(--smart/--web/--api-onpod)",
  "deploy:web": "Cloudflare Static Assets + R2 정적 웹 운영 배포(onpod-current 프로필)",
  "deploy:web:dry-run": "Cloudflare 정적 웹 운영 배포 드라이런(실제 반영 없음)",
  "deploy:verify": "무료 인프라 정책 및 Cloudflare 4대 Worker 통합 사전 검증",
  "deploy:preflight": "현재 HEAD SHA 기준 onpod-current 배포 환경 계약 오프라인 점검",
  "deploy:status:origin": "서울 onpod Core API 원점(/api/health/live·ready) 생존·준비성 확인",
  "deploy:auth": "로컬 배포 인증 정보 대화형 설정(.env.infrastructure.local)",
  "deploy:auth:check": "로컬 및 GitHub Actions 배포 인증 상태 점검",
  "deploy:auth:sync": "로컬 .env.infrastructure.local 필수 배포 시크릿을 GitHub Environment로 동기화",
  "deploy:info": "로컬 배포 설정·인증 상태 요약 출력(비밀값 마스킹)",
  lint: "저장소 전체 ESLint 실행(콘텐츠 캐시 사용)",
  "lint:quick": "변경된 파일 대상 빠른 ESLint 실행",
  "lint:quick:fix": "변경된 파일 대상 ESLint 자동 수정 실행",
  "lint:quick:staged": "Git 스테이징 파일 대상 ESLint 실행",
  "lint:strict": "저장소 전체 엄격 ESLint 실행(--max-warnings=1 예산)",
  "lint:ci": "CI 표준 엄격 ESLint 실행(lint:strict 위임)",
  "lint:security": "엄격 린트 + 시크릿 스캔 + 보안 취약점 통합 감사",
  typecheck: "워크스페이스 링크 + 웹 샤드 + Core API 전체 TypeScript 타입체크",
  "typecheck:web": "메모리 분할 샤드 기반 웹 앱 TypeScript 타입체크",
  "validate:architecture": "아키텍처·문서·소스 레이아웃·앱 경계·파일 크기·Studio 진입 그래프 통합 검증",
  "validate:documentation": "1,210+ 관리 문서의 상대 링크·권위 원장·한글·폐기 표현 검증",
  "validate:source-layout": "모노레포 폴더 레이아웃 및 레거시 경로 재유입 차단 래칫 검증",
  "validate:app-boundaries": "앱·패키지·도메인 간 금지된 cross-import 경계 래칫 검증",
  "check:source-file-size": "14,900+ 소스 파일 800줄 상한 및 @ts-nocheck 0건 래칫 검증",
  "check:studio-eager-graph": "Studio 정적 진입 그래프 용량·금지 도메인·지연 무효화 0건 검증",
  "check:unconnected-code": "미연결 고아 모듈 후보 분석 리포트 출력",
  "check:unconnected-code:gate": "신규 미연결 고아 코드 0건 래칫 게이트 검증",
  "quality:imports": "Knip 미선언·미해석 import 검사",
  "quality:deadcode": "Knip 미사용 파일·export·의존성 데드코드 탐지",
  "quality:cycles": "Knip 순환 참조(cycle) 탐지",
  "quality:secrets": "전체 추적 파일 Secretlint 자격증명 유출 검사",
  "quality:secrets:changed": "변경 파일 대상 Secretlint 자격증명 유출 검사",
  test: "루트 Vitest 단위 테스트 + 성능 예산 직렬 테스트 실행",
  "test:root": "워크스페이스 링크 확인 후 Vitest 전체 단위 테스트 실행",
  "test:fast": "사전 링크 검사 없이 Vitest 단위 테스트 즉시 실행",
  "test:perf": "격리 직렬 워커 환경에서 성능 예산 테스트(vitest.perf.config.ts) 실행",
  "test:coverage": "V8 커버리지 리포트 포함 Vitest 전체 테스트 실행",
  "test:full": "타입체크 + 린트 + 전체 테스트 + Studio 번들 게이트 일괄 실행",
  ci: "저장소 표준 전체 CI 파이프라인(lockfile·아키텍처·인프라·린트·타입·테스트·빌드·라이선스)",
  verify: "CI 전체 게이트 실행(ci 별칭)",
  "verify:push": "전체 CI + 보안 취약점 + 제3자 라이선스 감사(푸시 전 완전 보증)",
  sonar: "SonarQube 정적 분석 스캐너 실행",
  "audit:security": "보안 권고 예외 원장 검증 및 pnpm 취약점 감사",
  "audit:licenses": "제3자 오픈소스 라이선스 원장·고지서 및 금지 패키지(mixbox 등) 감사",
  "audit:restricted-models": "재배포 제한 AI/3D 모델 혼입 여부 감사",
  "verify:csp": "apps/web/index.html 정적 CSP 보안 헤더 정책 검증",
  "db:push": "Drizzle Kit으로 PostgreSQL 스키마 푸시(apps/api/drizzle.config.ts)",
  "db:bootstrap:production-empty": "빈 운영 PostgreSQL DB 초기 스키마·마이그레이션 원장 부트스트랩",
  "db:seed": "Core API 로컬 개발용 기본 DB 시드 데이터 주입",
  "seed:market:dev": "마켓플레이스 개발·테스트용 샘플 데이터 시드 주입",
  "db:cleanup-creator-garbage": "테스트 크리에이터 잔여 DB 데이터 정리 대상 드라이런 조회",
  "db:cleanup-creator-garbage:delete": "확인 플래그 포함 테스트 크리에이터 잔여 DB 데이터 실제 삭제",
  "local:test": "로컬 풀스택 테스트 환경(API+웹+DB) 기동",
  "local:test:check": "로컬 풀스택 테스트 환경 준비 상태 점검",
  "local:test:seed": "로컬 풀스택 테스트 환경 시드 데이터 초기화",
  "local:test:smoke": "로컬 풀스택(웹·API·DB) 종단 스모크 테스트 검증",
  "integration:generate-secrets": "로컬 API 통합 테스트용 임시 시크릿 생성",
  "manual:gen": "Studio 사용자 매뉴얼(STUDIO_MANUAL.md 등) 자동 생성",
  "verify:studio-manual-docs": "생성된 Studio 매뉴얼 문서 최신성 동기화 검증",
  "i18n:builtins:gen": "다국어 내장 번역 번들(i18n builtins) 생성",
  "verify:i18n-builtins": "다국어 내장 번역 번들 최신성 일치 검증",
  "catalog:gen": "정적 웹툰 작품 카탈로그 산출물 빌드",
  toonbridge: "로컬 루프백 하드웨어·DCC 브리지 서버(ToonBridge) 실행",
  "toonbridge:probe": "로컬 ToonBridge 서버 연결·상태 프로브 점검",
  "studio:mcp": "ToonStudio 로컬 MCP 서버 실행",
  "studio:cli": "ToonStudio MCP/스튜디오 자동화 CLI 실행",
});

const ACTION_LABELS = Object.freeze({
  verify: "검증", test: "테스트", audit: "감사", check: "게이트 점검", build: "빌드",
  prebuild: "빌드 사전 준비", postbuild: "빌드 사후 검증", generate: "자동 생성", sync: "동기화",
  prepare: "준비", plan: "실행 계획 수립", write: "기록", deploy: "운영 배포",
  repair: "자산 복구", typecheck: "타입체크", bench: "성능 벤치마크", soak: "장시간 내구 테스트",
  experiment: "실험 실행", validate: "구조 검증", dev: "개발 서버 실행", auth: "인증 자격증명 관리",
  visual: "시각 회귀 비교",
});

const TOKEN_LABELS = Object.freeze({
  cloudflare: "Cloudflare", static: "정적 웹", apex: "Apex", redirect: "리다이렉트",
  realtime: "실시간 DO", analytics: "D1 분석", r2: "R2", rules: "규칙",
  gcp: "GCP", free: "무료 티어", data: "데이터", plane: "플레인", federated: "연합",
  infrastructure: "인프라 정책", backend: "백엔드", capability: "역량", worker: "워커",
  render: "원점(onpod)", core: "Core", origin: "오리진", social: "소셜", login: "로그인",
  production: "운영", keychain: "macOS Keychain", cloud: "클라우드", infra: "인프라",
  storage: "스토리지", routing: "라우팅", fingerprint: "핑거프린트",
  studio: "Studio", creator: "크리에이터", bundle: "번들", pack: "팩", rights: "권리",
  hokusai: "Hokusai", wasm: "WASM", natural: "자연매체", media: "미디어", live: "실시간",
  living: "리빙", ink: "잉크", p5: "p5.brush", vello: "Vello", thorvg: "ThorVG",
  canvaskit: "CanvasKit", webgpu: "WebGPU", gpu: "GPU", bg3d: "3D 배경(BG3D)",
  scene3d: "Scene3D", vrm: "VRM", "3d": "3D", brush: "브러시", brushes: "브러시",
  material: "재질", bristle: "강모", dual: "듀얼", tip: "팁", textured: "텍스처",
  filter: "필터", filters: "필터", dialog: "대화상자", candidates: "후보",
  pigment: "안료", latent: "잠재", model: "모델", renderer: "렌더러", roles: "역할 원장",
  tile: "타일", tiled: "타일 분할", opfs: "OPFS", autosave: "자동저장", two: "멀티", tab: "탭",
  collab: "협업", stability: "안정성", drawing: "드로잉", compare: "비교",
  character: "캐릭터", shaper: "셰이퍼", kit: "키트", framing: "프레이밍",
  avatar: "아바타", reference: "레퍼런스", catalogue: "카탈로그", catalog: "카탈로그",
  related: "연관 정보", crawl: "크롤링", update: "갱신", kmas: "KMAS",
  mobile: "모바일", android: "Android", ios: "iOS", native: "네이티브", doctor: "진단",
  admin: "관리자 웹", lab: "실험실", market: "마켓", marketplace: "마켓플레이스", db: "DB",
  postgres: "PostgreSQL", redis: "Redis", integration: "통합", work: "작업", session: "세션",
  workflows: "워크플로", local: "로컬", stack: "스택", a11y: "접근성(WCAG)", editor: "에디터",
  sitewide: "전 페이지", auth: "인증", modal: "모달", visual: "시각", ux: "UX",
  assets: "에셋", asset: "에셋", similarity: "유사도", cc0: "CC0", classification: "분류",
  postcuration: "사후 큐레이션", repo: "저장소", hygiene: "위생", diff: "디프", regression: "회귀",
  toolchain: "툴체인", coverage: "커버리지", type: "타입", trace: "추적", analyze: "분석",
  report: "리포트", code: "코드", structure: "구조", gates: "게이트", unconnected: "미연결 고아",
  workspace: "워크스페이스", package: "패키지", links: "링크", pnpm: "pnpm", lockfile: "락파일",
  lint: "린트", strict: "엄격", budget: "예산", desktop: "데스크톱", release: "릴리스",
  toonbridge: "ToonBridge", mcp: "MCP", agent: "에이전트", harness: "하네스",
  product: "제품", tour: "투어", remotion: "Remotion", music: "음악", providers: "프로바이더",
  handoff: "핸드오프", varco3d: "VARCO 3D", tripo3d: "Tripo 3D", ai: "AI", status: "상태",
  canary: "카나리", virtual: "가상", space: "스튜디오", world: "월드", art: "아트",
  scene: "씬", assistant: "어시스턴트", hybrid: "하이브리드", dcc: "DCC", glb: "GLB",
  export: "내보내기", inapp: "인앱", browser: "브라우저", feature: "기능", sweep: "스윕",
  wiring: "배선", reachability: "도달성", canvas: "캔버스", chrome: "크롬", surfaces: "표면",
  icons: "아이콘", menus: "메뉴", companion: "컴패니언", inspector: "인스펙터",
  walkthrough: "워크스루", logic: "핵심 로직", batch: "배치", upload: "업로드", setup: "초기화",
  manifest: "매니페스트", engine: "엔진", launch: "진입", lifecycle: "수명주기",
  service: "서비스", artist: "작가", journey: "여정", manuscript: "원고", delivery: "출고",
  acceptance: "수용", professional: "전문 제작", validation: "검증", competitor: "경쟁 도구",
  capabilities: "역량", replacement: "대체", program: "프로그램", quality: "품질",
  latency: "지연시간", long: "장시간", stroke: "스트로크", planner: "플래너", selection: "선택",
  perf: "성능", groups: "레이어 그룹", committed: "커밋", parity: "동치성", presentation: "프레젠테이션",
  capture: "캡처", resources: "리소스", raster: "래스터", tools: "도구", physics: "물리",
  console: "콘솔", board: "보드", poll: "투표", team: "팀", cut: "컷", foundation: "기반",
  authoring: "오서링", completion: "완성도", rotation: "회전", thumbnails: "썸네일", refine: "정제",
  specialists: "전문 패스", inplace: "인플레이스", execution: "실행", mark: "자국", distance: "거리",
  preferred: "선호", contrast: "대비", forced: "강제", colors: "색상", all: "전체",
  image: "이미지", references: "레퍼런스", task: "작업", benchmark: "벤치마크", workflow: "워크플로",
  result: "결과", e2e: "E2E", web: "웹",
});

const SUFFIX_LABELS = Object.freeze({
  "dry-run": "드라이런", browser: "브라우저 E2E", check: "상태 점검", write: "자동 갱신",
  rebuild: "재빌드", strict: "엄격 모드", manual: "수동 실행", apply: "적용", plan: "계획",
  deploy: "운영 반영", install: "설치", generate: "생성", dev: "개발 모드", all: "전체 조합",
});

const HARNESS_EXACT = new Set([
  "scripts:help", "prepare", "test:agent-harness", "toonbridge", "toonbridge:probe", "test:toonbridge", "studio:mcp", "studio:cli", "test:studio-mcp",
]);
const DEPLOY_KEYS = [
  "cloudflare", "creator-bundle-deploy", "creator-bundle-release-r2", "cloud-deploy", "free-infrastructure",
  "backend-capability-worker", "render-core-origin", "federated-data-plane", "social-login-production", "auth:social-login",
];
const DB_LOCAL_KEYS = [
  "db:", "seed:", "local:test", "test:local-test-stack", "integration:generate-secrets", "test:postgres:",
  "test:redis:", "verify:creator-marketplace-db", "verify:studio-work-session-workflows",
];
const SECURITY_KEYS = [
  "audit:", "quality:secrets", "lint:security", "verify:csp", "test:repo-hygiene",
  "creator-bundle-pack-rights", "creator-bundle-render-rights", "test:creator-bundle-rights", "verify:asset-postcuration",
];
const DOCS_KEYS = [
  "validate:documentation", "manual:gen", "verify:studio-manual-docs", "i18n:", "verify:i18n-builtins",
  "catalog:", "related:", "kmas:", "studio:avatar-reference-catalogue", "studio:manifest:generate",
];
const BUILD_KEYS = [
  "build", "prebuild", "postbuild", "bundle:visualize", "check:studio-bundle", "product-tour-remotion",
  "verify:product-tour-live", "lhci:autorun", "mobile:assets", "mobile:android:", "mobile:ios:", "mobile:sync", "test:desktop-sync-release",
];
const LINT_ARCH_KEYS = [
  "lint", "typecheck", "validate:architecture", "validate:app-boundaries", "validate:source-layout",
  "check:type-coverage", "check:source-file-size", "check:studio-eager-graph", "check:unconnected-code",
  "test:unconnected-code", "test:code-structure-gates", "quality:imports", "quality:deadcode",
  "quality:cycles", "workspace-package-links", "pnpm-lockfile", "sonar", "test:lint-strict-budget",
];
const DEV_KEYS = ["dev", "predev", "preview", "start", "mobile:doctor", "verify:mobile-native-media", "music:", "varco3d", "tripo3d"];
const TEST_CORE_EXACT = new Set([
  "test", "test:root", "test:fast", "test:full", "test:perf", "test:coverage", "test:admin", "test:admin:e2e",
  "test:brush-lab", "test:market:e2e", "test:market:live", "test:a11y", "test:a11y:editor",
  "test:collab-stability", "verify:collab-stability", "visual:diff", "test:visual-regression", "ci", "verify",
  "verify:push", "verify:toolchain-coverage", "test:production-toolchain", "verify:ai-provider-status-canary",
]);
const STUDIO_HINTS = [
  "studio", "vrm", "bg3d", "scene3d", "hokusai", "vello", "thorvg", "pigment", "brush", "filter", "character", "creator-logic", "bench:", "soak:",
];

function matchAny(name, patterns, exactOrPrefix = false) {
  return patterns.some((p) =>
    p.endsWith(":")
      ? name.startsWith(p)
      : exactOrPrefix
        ? name === p || name.startsWith(`${p}:`)
        : name === p || name.startsWith(`${p}:`) || name.includes(p),
  );
}

export function classifyScript(name) {
  if (HARNESS_EXACT.has(name) || name.startsWith("harness:")) return "harness-tools";
  if (/^(?:deploy|cloudflare|gcp|infra):/u.test(name) || matchAny(name, DEPLOY_KEYS)) return "deploy";
  if (matchAny(name, DB_LOCAL_KEYS)) return "db-local";
  if (matchAny(name, SECURITY_KEYS)) return "security-audit";
  if (matchAny(name, DOCS_KEYS)) return "docs-i18n";
  if (matchAny(name, BUILD_KEYS)) return "build";
  if (matchAny(name, LINT_ARCH_KEYS)) return "lint-arch";
  if (matchAny(name, DEV_KEYS, true)) return "dev";
  if (TEST_CORE_EXACT.has(name)) return "test-core";
  if (matchAny(name, STUDIO_HINTS)) return "studio-3d";
  if (name.startsWith("test:") || name.startsWith("verify:")) return "test-core";
  return "harness-tools";
}

export function describeScript(name) {
  if (EXACT_DESCRIPTIONS[name]) return EXACT_DESCRIPTIONS[name];

  const colonParts = name.split(":");
  const prefix = colonParts[0];
  const hasActionPrefix = Boolean(ACTION_LABELS[prefix]);
  const action = ACTION_LABELS[prefix] ?? "실행";
  const tail = colonParts.length > 1 ? colonParts[colonParts.length - 1] : "";
  const suffixNote = colonParts.length > 2 || (!hasActionPrefix && colonParts.length > 1) ? SUFFIX_LABELS[tail] ?? null : null;

  const bodyParts = colonParts.slice(hasActionPrefix ? 1 : 0, suffixNote ? -1 : colonParts.length);
  const rawTokens = bodyParts.join("-").split("-").filter(Boolean);
  const labels = [];
  for (const token of rawTokens) {
    const mapped = TOKEN_LABELS[token.toLowerCase()];
    if (mapped && !labels.includes(mapped)) labels.push(mapped);
  }
  const subject = labels.length > 0 ? labels.slice(0, 5).join(" ") : `${name} 스크립트`;
  return suffixNote ? `${subject} ${action} (${suffixNote})` : `${subject} ${action}`;
}

export function buildScriptsCatalog({ packageJsonPath = path.join(DEFAULT_ROOT, "package.json") } = {}) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const scripts = pkg.scripts ?? {};
  const buckets = new Map(SCRIPT_GROUPS.map((g) => [g.key, []]));

  for (const [name, command] of Object.entries(scripts)) {
    const groupKey = classifyScript(name);
    (buckets.get(groupKey) ?? buckets.get("harness-tools")).push({
      name,
      command: String(command),
      description: describeScript(name),
    });
  }

  const groups = SCRIPT_GROUPS.map((meta) => {
    const items = buckets.get(meta.key) ?? [];
    return { ...meta, count: items.length, scripts: items };
  });

  return { totalScripts: Object.keys(scripts).length, groupCount: groups.length, quickstart: QUICKSTART_COMMANDS, groups };
}

export function resolveGroupKey(rawGroup) {
  if (!rawGroup) return null;
  const normalized = String(rawGroup).trim().toLowerCase();
  const match = SCRIPT_GROUPS.find(
    (g) => g.key === normalized || String(g.index) === normalized || g.title.toLowerCase().includes(normalized),
  );
  return match ? match.key : null;
}

export function filterCatalog(catalog, { group = null, search = null } = {}) {
  let groups = catalog.groups;
  let resolvedGroup = null;
  if (group) {
    resolvedGroup = resolveGroupKey(group);
    if (!resolvedGroup) {
      const validKeys = SCRIPT_GROUPS.map((g) => `${g.index}:${g.key}`).join(", ");
      throw new Error(`알 수 없는 그룹 "${group}"입니다. 사용 가능한 그룹: ${validKeys}`);
    }
    groups = groups.filter((g) => g.key === resolvedGroup);
  }
  const query = search ? String(search).trim().toLowerCase() : null;
  if (query) {
    groups = groups
      .map((g) => {
        const hitGroup = g.title.toLowerCase().includes(query) || g.key.includes(query);
        const filtered = hitGroup
          ? g.scripts
          : g.scripts.filter(
              (s) =>
                s.name.toLowerCase().includes(query) ||
                s.command.toLowerCase().includes(query) ||
                s.description.toLowerCase().includes(query),
            );
        return { ...g, count: filtered.length, scripts: filtered };
      })
      .filter((g) => g.count > 0);
  }
  const matchedCount = groups.reduce((acc, g) => acc + g.count, 0);
  return { ...catalog, filters: { group: resolvedGroup, search: query }, matchedCount, groups };
}

export function formatCatalogText(result, { showAll = false } = {}) {
  const lines = [];
  const filteredMode = Boolean(result.filters.group || result.filters.search);
  lines.push(`=== ToonStudio package.json 스크립트 카탈로그 (총 ${result.totalScripts}개 · ${result.groupCount}대 그룹) ===`);
  if (!filteredMode) {
    lines.push("", "[자주 쓰는 핵심 10줄 퀵스타트]");
    result.quickstart.forEach((item, i) => {
      lines.push(`  ${String(i + 1).padStart(2, " ")}. ${item.label}: ${item.command}`);
      lines.push(`      -> ${item.note}`);
    });
  } else {
    const parts = [];
    if (result.filters.group) parts.push(`group=${result.filters.group}`);
    if (result.filters.search) parts.push(`search="${result.filters.search}"`);
    lines.push(`필터 적용: ${parts.join(", ")} -> ${result.matchedCount}개 매칭`);
  }

  lines.push("");
  if (result.groups.length === 0) {
    lines.push("일치하는 스크립트가 없습니다. `--search` 키워드를 줄이거나 `--group`을 확인하세요.");
    return `${lines.join("\n")}\n`;
  }

  for (const g of result.groups) {
    lines.push(`[${g.title}] (키: ${g.key} · ${g.count}개) — ${g.summary}`);
    const list = filteredMode || showAll ? g.scripts : g.scripts.slice(0, 6);
    for (const s of list) lines.push(`  - pnpm run ${s.name}  |  ${s.description}`);
    if (!filteredMode && !showAll && g.scripts.length > list.length) {
      lines.push(`    ... 외 ${g.scripts.length - list.length}개 (전체 보기: pnpm run scripts:help -- --group ${g.key})`);
    }
  }
  if (!filteredMode && !showAll) {
    lines.push("", "옵션: --group <키|번호>  --search <검색어>  --all (전체 출력)  --json (JSON 출력)");
  }
  return `${lines.join("\n")}\n`;
}

export function parseCliArgs(argv) {
  const options = { group: null, search: null, json: false, all: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--json") options.json = true;
    else if (arg === "--all" || arg === "--full") options.all = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--group" || arg === "-g") {
      if (i + 1 >= argv.length) throw new Error("--group 옵션에 그룹 키 또는 번호를 지정하세요.");
      options.group = argv[++i];
    } else if (arg.startsWith("--group=")) options.group = arg.slice("--group=".length);
    else if (arg === "--search" || arg === "-s") {
      if (i + 1 >= argv.length) throw new Error("--search 옵션에 검색어를 지정하세요.");
      options.search = argv[++i];
    } else if (arg.startsWith("--search=")) options.search = arg.slice("--search=".length);
    else throw new Error(`알 수 없는 옵션입니다: ${arg} (--help 로 사용법을 확인하세요)`);
  }
  return options;
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    const keys = SCRIPT_GROUPS.map((g) => `  ${g.index}. ${g.key.padEnd(15, " ")} ${g.title}`).join("\n");
    process.stdout.write(
      `사용법: node scripts/repo-scripts-catalog.mjs [--group <키|번호>] [--search <검색어>] [--all] [--json]\n\n그룹 목록:\n${keys}\n`,
    );
    return;
  }
  const filtered = filterCatalog(buildScriptsCatalog(), options);
  process.stdout.write(options.json ? `${JSON.stringify(filtered, null, 2)}\n` : formatCatalogText(filtered, { showAll: options.all }));
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`오류: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
