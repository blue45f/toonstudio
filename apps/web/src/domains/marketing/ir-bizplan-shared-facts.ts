/**
 * IR 피치(/ir), IR 발표 플레이어(/ir/present), 사업계획서(/business-plan) 3개 페이지의
 * 2026-11-22 기준 단일 검증 사실 정본.
 *
 * 원칙:
 * - 현재 구현·실측(current)과 협약·검증 목표(target), 시뮬레이션 가정(assumption)을 절대 섞지 않는다.
 * - 모든 실측 수치는 저장소 파일·감사 스크립트·인프라 지도에서 직접 확인된 값만 기록한다.
 * - 가짜 투자 실적·미확인 설문 수치·확정되지 않은 팀 단가를 지어내지 않는다.
 */

import type { UnitEconomicsInput } from "./ir-bizplan-km7-math";

export const IR_SHARED_VERIFIED_DATE = "2026-11-22" as const;

export type EvidenceTier = "current" | "target" | "assumption";

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export interface SharedVerifiedMetric {
  readonly id: string;
  readonly tier: EvidenceTier;
  readonly valueKo: string;
  readonly valueEn: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly sourceKo: string;
  readonly sourceEn: string;
}

export interface CleanroomEngineItem {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly specKo: string;
  readonly specEn: string;
}

export interface InfraComparisonRow {
  readonly id: string;
  readonly tier: "current" | "estimate";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly monthlyCostKrw: number;
  readonly displayCostKo: string;
  readonly displayCostEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface EconomicsScenarioPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly noteKo: string;
  readonly noteEn: string;
  readonly input: UnitEconomicsInput;
}

export interface DefenseQaItem {
  readonly id: string;
  readonly pillarKo: string;
  readonly pillarEn: string;
  readonly evidenceTagKo: string;
  readonly evidenceTagEn: string;
  readonly ko: { readonly question: string; readonly answer: string };
  readonly en: { readonly question: string; readonly answer: string };
}

export interface LicenseIntegrityCheck {
  readonly id: string;
  readonly statusKo: string;
  readonly statusEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly tone: "good" | "warn";
}

/** 2026-11-22 저장소·운영 실측 핵심 지표 (현재 구현 vs 검증 목표 명확 구분). */
export const IR_SHARED_VERIFIED_METRICS: readonly SharedVerifiedMetric[] = [
  {
    id: "db-migrations",
    tier: "current",
    valueKo: "0133",
    valueEn: "0133",
    labelKo: "PostgreSQL 17 스키마 원장",
    labelEn: "PostgreSQL 17 migration ledger",
    detailKo: "저장소 SQL 133개(0133_production_division_os 포함). 운영 DB 113/113 체크섬 일치, 0114~0133 20건 승인 대기.",
    detailEn: "133 SQL files in repo (up to 0133_production_division_os). 113/113 checksum-matched in prod; 20 pending approval.",
    sourceKo: "실측 · apps/api migrations & infrastructure-map",
    sourceEn: "Measured · apps/api migrations & infrastructure-map",
  },
  {
    id: "beta-infra-zero",
    tier: "current",
    valueKo: "₩0 / 월",
    valueEn: "KRW 0 / mo",
    labelKo: "베타 인프라 월 고정비",
    labelEn: "Beta monthly infra fixed cost",
    detailKo: "Cloudflare Static + R2($0.00) + Realtime + 서울 onpod 무료 티어(₩0). 도메인 연간 갱신비 별도, 확장 시 유료 전환.",
    detailEn: "Cloudflare Static + R2 ($0.00) + Realtime + Seoul onpod free tier (KRW 0). Domain renewal separate; paid scaling later.",
    sourceKo: "실측 · deploy/DEPLOY_MANIFEST.json",
    sourceEn: "Measured · deploy/DEPLOY_MANIFEST.json",
  },
  {
    id: "local-gpu-wasm64",
    tier: "current",
    valueKo: "1 GiB · 7밴드",
    valueEn: "1 GiB · 7-band",
    labelKo: "브라우저 로컬 3D & 분광 안료",
    labelEn: "Local browser 3D & spectral pigment",
    detailKo: "Wasm64 로컬 3D 단일 모델 1 GiB(일괄 2 GiB) + WebGPU 7밴드 KM 안료 · 자체 클린룸 8종으로 서버 GPU 비용 차단.",
    detailEn: "Wasm64 local 3D up to 1 GiB/model (2 GiB batch) + WebGPU 7-band KM pigment & 8 cleanroom engines with zero GPU server cost.",
    sourceKo: "실측 · studio-3d-upload-limit-policy & km7-core",
    sourceEn: "Measured · studio-3d-upload-limit-policy & km7-core",
  },
  {
    id: "license-audit",
    tier: "current",
    valueKo: "590 통과 · 0 차단",
    valueEn: "590 passed · 0 blocked",
    labelKo: "1인 기업 상용 라이선스 감사",
    labelEn: "Solo commercial license audit",
    detailKo: "pnpm audit:licenses 590개 통과, Mixbox(CC-BY-NC)·GPL·AGPL·SSPL 0건, OpenSSF ready, 크로스-LLM 배포 매니페스트.",
    detailEn: "590 pnpm entries audited, 0 Mixbox(CC-BY-NC)/GPL/AGPL/SSPL blockers, OpenSSF ready, cross-LLM deploy manifest.",
    sourceKo: "실측 · audit:licenses & solo-commercial-readiness",
    sourceEn: "Measured · audit:licenses & solo-commercial-readiness",
  },
] as const;

/** 2026-11-22 기준 검증 목표 (성과가 아님을 명시). */
export const IR_SHARED_TARGET_SUMMARY: BilingualText = {
  ko: "검증 목표(미달성): IR 1차 코호트 무료 베타 30명 · 직무별 인터뷰 10명+ · 유료 의사 검증 3~6개월 / 사업계획서 중기 목표 작가 5,000명 · MAU 20,000명 · 구독자 1,000명",
  en: "Validation targets (unachieved): IR cohort 30 beta creators · 10+ role interviews · 3–6 mo willingness-to-pay / mid-term plan targets 5,000 creators · 20,000 MAU · 1,000 paid subscribers",
};

/** 2026-11-22 메인 브랜치에 병합된 자체 클린룸 엔진 8종. */
export const CLEANROOM_EIGHT_ENGINES: readonly CleanroomEngineItem[] = [
  {
    id: "km7-spectral",
    nameKo: "1. WebGPU 7밴드 KM 분광 안료",
    nameEn: "1. WebGPU 7-Band KM Spectral Pigment",
    specKo: "420~670nm 감산 혼색·글레이징·임파스토 WGSL (Mixbox 미사용, ₩0 IP)",
    specEn: "420–670 nm subtractive mixing, glazing & impasto WGSL (zero Mixbox, KRW 0 IP)",
  },
  {
    id: "knuth-plass",
    nameKo: "2. Knuth-Plass 타원 말풍선 조판",
    nameEn: "2. Knuth-Plass Oval Balloon Typesetting",
    specKo: "타원 내부 폭 동적 줄바꿈 + 세로쓰기·루비 엔진",
    specEn: "Dynamic optimal line-breaking inside oval balloons with vertical text & ruby",
  },
  {
    id: "vector-csp-core",
    nameKo: "3. 벡터 교차점 지우개 · 틈새닫기 · QuickShape",
    nameEn: "3. Vector Intersection Eraser · Close-Gap Fill · QuickShape",
    specKo: "선화 교차점 정리, 열린 선 틈새닫기 채우기, 듀얼 브러시, 도형 스냅",
    specEn: "Intersection cleanup, close-gap flood fill, dual brush & stroke-to-shape snap",
  },
  {
    id: "3d-vector-lineart",
    nameKo: "4. 3D 벡터 강약선 추출기",
    nameEn: "4. 3D Vector Weighted Lineart Extractor",
    specKo: "3D 배경·인물 실루엣·크리즈를 가변 필압 2D 벡터 선화로 추출",
    specEn: "Extracts 3D silhouettes & creases into variable-pressure 2D vector lines",
  },
  {
    id: "pbd-cloth",
    nameKo: "5. PBD 의상 주름·드레이프 솔버",
    nameEn: "5. PBD Cloth Fold & Drape Solver",
    specKo: "브라우저 로컬 Position-Based Dynamics 의상 주름 시뮬레이션",
    specEn: "Local browser Position-Based Dynamics cloth folding and drape simulation",
  },
  {
    id: "manga-rulers",
    nameKo: "6. 절차적 만화 효과선 & 다점 투시·대칭자",
    nameEn: "6. Procedural Manga Effect Lines & Perspective/Symmetry Rulers",
    specKo: "집중선·스피드선 생성기 + 다점·어안 투시자 및 대칭자 펜 스냅",
    specEn: "Focus/speed line generator with multi-point/fisheye perspective & symmetry snap",
  },
  {
    id: "sfx-angles-deadline",
    nameKo: "7. SFX 타이포 · 3D 앵글 12종 · 마감 계측기",
    nameEn: "7. SFX Typo Stamps · 12 3D Angles · Deadline Meter",
    specKo: "효과음 스탬프, 웹툰 연출 카메라 앵글 12종 북마크, 1인 공정 마감 계측",
    specEn: "Sound-effect typography stamps, 12 webtoon camera presets & solo deadline meter",
  },
  {
    id: "timelapse-bom-light",
    nameKo: "8. 로컬 타임랩스 · Rights BOM · 3D→2D 광원 동기화",
    nameEn: "8. Local Timelapse · Rights BOM · 3D→2D Light Sync",
    specKo: "WebCodecs 숏폼 플래너, 플랫폼 화수 납품 슬라이스 + 권리 증명서, 림라이트 동기화",
    specEn: "Local timelapse planner, platform delivery slicing with Rights BOM & rim-light sync",
  },
] as const;

/**
 * 베타 인프라 비용 비교 (실측 vs 클라우드 GPU 중심 SaaS 일반 추정 참고치).
 * 경쟁사 개별 청구서를 사칭하지 않고 일반 클라우드 리소스 구성의 공개 단가 범위를 참고치로 표기한다.
 */
export const INFRA_COST_COMPARISON: readonly InfraComparisonRow[] = [
  {
    id: "cloud-gpu-saas",
    tier: "estimate",
    labelKo: "클라우드 GPU 추론 + 상시 서버 SaaS (일반 구성 추정치)",
    labelEn: "Cloud GPU inference + always-on SaaS (generic benchmark estimate)",
    monthlyCostKrw: 1_800_000,
    displayCostKo: "약 ₩180만 / 월 (추정)",
    displayCostEn: "~KRW 1.8M / mo (est.)",
    detailKo: "상시 GPU 인스턴스 1노드 + 관리형 DB + 파일 스토리지 + 대역폭(일반 클라우드 단가 참고치)",
    detailEn: "1 always-on GPU node + managed DB + object storage + egress (generic public cloud reference)",
  },
  {
    id: "cloud-standard-saas",
    tier: "estimate",
    labelKo: "일반 관리형 API + DB 협업 SaaS (일반 구성 추정치)",
    labelEn: "Standard managed API + DB SaaS (generic benchmark estimate)",
    monthlyCostKrw: 420_000,
    displayCostKo: "약 ₩42만 / 월 (추정)",
    displayCostEn: "~KRW 420K / mo (est.)",
    detailKo: "상시 컨테이너 2노드 + 관리형 PostgreSQL + CDN·객체 스토리지(일반 클라우드 단가 참고치)",
    detailEn: "2 always-on containers + managed PostgreSQL + CDN/storage (generic public cloud reference)",
  },
  {
    id: "toonstudio-beta-actual",
    tier: "current",
    labelKo: "ToonStudio 베타 운영 실측 (브라우저 로컬 + 엣지)",
    labelEn: "ToonStudio beta actual (browser-local + edge)",
    monthlyCostKrw: 0,
    displayCostKo: "₩0 / 월 (실측)",
    displayCostEn: "KRW 0 / mo (actual)",
    detailKo: "WebGPU·Wasm64(1 GiB 3D)·OPFS 로컬 처리 + Cloudflare Static·R2($0.00) + 서울 onpod(₩0) · 도메인 갱신비 별도",
    detailEn: "Local WebGPU/Wasm64(1 GiB 3D)/OPFS + Cloudflare Static/R2 ($0.00) + Seoul onpod (KRW 0); domain renewal separate",
  },
] as const;

/** 단위경제성 시뮬레이터 프리셋 (전부 가정 시뮬레이션 — 확정 가격·실적이 아님). */
export const UNIT_ECONOMICS_PRESETS: readonly EconomicsScenarioPreset[] = [
  {
    id: "beta-lean",
    labelKo: "베타 ₩0 고정비 (보수적 가정)",
    labelEn: "Beta KRW 0 fixed (conservative assumption)",
    noteKo: "개인 예시 단가 ₩19,900(미확정) · 유료 50명 가정 · AI 크레딧 상한으로 인당 변동비 ₩2,500 제한",
    noteEn: "Unconfirmed example price KRW 19,900 · 50 paid users assumed · AI credit cap holds variable cost at KRW 2,500",
    input: {
      monthlyArpuKrw: 19_900,
      paidSubscribers: 50,
      monthlyChurnPct: 7,
      cacKrw: 35_000,
      variableCostPerUserKrw: 2_500,
      fixedMonthlyInfraKrw: 0,
    },
  },
  {
    id: "early-growth",
    labelKo: "유료 인프라 전환기 (가정)",
    labelEn: "Early paid infra phase (assumption)",
    noteKo: "유료 300명 가정 · 월 고정 인프라 ₩45만 승급 반영 · 1인+AI 운영 체계 유지",
    noteEn: "300 paid users assumed · includes KRW 450K/mo upgraded infra fixed cost under lean operation",
    input: {
      monthlyArpuKrw: 19_900,
      paidSubscribers: 300,
      monthlyChurnPct: 5,
      cacKrw: 45_000,
      variableCostPerUserKrw: 2_800,
      fixedMonthlyInfraKrw: 450_000,
    },
  },
  {
    id: "studio-mix",
    labelKo: "스튜디오 혼합 검증안 (가정)",
    labelEn: "Studio mix test case (assumption)",
    noteKo: "팀 가격은 미결정 상태이며, 좌석 혼합 평균 단가 ₩32,000을 단순 감도 분석 입력값으로 가정",
    noteEn: "Team pricing is undecided; KRW 32,000 blended ARPU is used strictly for sensitivity analysis",
    input: {
      monthlyArpuKrw: 32_000,
      paidSubscribers: 1_000,
      monthlyChurnPct: 4,
      cacKrw: 90_000,
      variableCostPerUserKrw: 4_000,
      fixedMonthlyInfraKrw: 1_800_000,
    },
  },
] as const;

/** 1인 기업 상용 라이선스 무결성 실측 항목 (2026-11-22 실행 결과). */
export const SOLO_LICENSE_INTEGRITY_CHECKS: readonly LicenseIntegrityCheck[] = [
  {
    id: "pnpm-590",
    statusKo: "통과 · 590건",
    statusEn: "Passed · 590",
    titleKo: "전체 의존성 라이선스 고지 자동 감사",
    titleEn: "Full dependency license notice audit",
    detailKo: "pnpm audit:licenses 기준 590개 pnpm 항목 · 90/147 Vello 크레이트 · 439건 라이선스 원문 검증 통과.",
    detailEn: "pnpm audit:licenses verified 590 pnpm entries, 90/147 Vello crates, and 439 license texts.",
    tone: "good",
  },
  {
    id: "zero-blocked",
    statusKo: "차단 위반 0건",
    statusEn: "0 blockers",
    titleKo: "Mixbox(CC-BY-NC) · GPL · AGPL · SSPL 유입 차단",
    titleEn: "Mixbox (CC-BY-NC) · GPL · AGPL · SSPL blocked",
    detailKo: "verify-solo-commercial-readiness.mjs가 매 빌드에서 비상업·카피레프트 패키지 유입을 자동 거부합니다.",
    detailEn: "verify-solo-commercial-readiness.mjs blocks non-commercial and strong copyleft packages in CI.",
    tone: "good",
  },
  {
    id: "lgpl-boundary",
    statusKo: "동적 경계 2건 추적",
    statusEn: "2 dynamic boundaries",
    titleKo: "LGPL-2.1 런타임 분리 유지 (opencascade.js · p5)",
    titleEn: "LGPL-2.1 dynamic isolation (opencascade.js · p5)",
    detailKo: "정적 링크를 금지하고 선택적 지연 로드 WASM/원본 무수정 번들 경계와 고지 문서를 유지합니다.",
    detailEn: "Static linking forbidden; kept behind lazy WASM/unmodified boundaries with explicit notices.",
    tone: "warn",
  },
  {
    id: "remotion-openssf",
    statusKo: "1인 무료 경계 · OpenSSF ready",
    statusEn: "Solo free tier · OpenSSF ready",
    titleKo: "Remotion 3인 경계 추적 & OpenSSF 보안 태세",
    titleEn: "Remotion 3-seat tracker & OpenSSF posture",
    detailKo: "현재 1인 무료 경계(4인 확장 전 상용 라이선스 또는 로컬 WebCodecs 전환) + OpenSSF 최소권한·SHA 고정 통과.",
    detailEn: "Within 3-seat free tier (commercial license or local WebCodecs before 4th seat) + OpenSSF pinned SHA checks.",
    tone: "good",
  },
] as const;

/**
 * VC 투자자 & PSST 정부지원사업 심사위원 핵심 방어 Q&A 5종.
 * IrPitchPage(한/영), BusinessPlanPage(한), IrPresentPage Scene 23(한)에서 동일 정본을 공유한다.
 */
export const INVESTOR_DEFENSE_QA: readonly DefenseQaItem[] = [
  {
    id: "solo-scale",
    pillarKo: "팀 구성 · 실행력",
    pillarEn: "Team & Execution",
    evidenceTagKo: "실측 · 0133 마이그레이션 · 800줄 래칫",
    evidenceTagEn: "Measured · 0133 migrations · 800-line ratchet",
    ko: {
      question: "1인 기업이 어떻게 이 규모(133개 DB 마이그레이션 · 클린룸 8종 엔진)를 유지하고 운영하나요?",
      answer:
        "배달의민족·스마일게이트·삼쩜삼·카카오·엔씨소프트를 거친 18년차 아키텍트가 직접 설계·구현하며, 800줄 파일 크기 래칫·도메인 경계 검사(validate:architecture)·미연결 코드 게이트·단일 에이전트 하네스(AGENTS.md)로 유지보수 비용을 구조적으로 압축했습니다. 팀이 없다는 사실은 숨기지 않으며, 영업·마케팅과 지원 인력은 베타 전환율 검증 뒤 단계적으로 채용합니다.",
    },
    en: {
      question: "How can a solo founder maintain this scope (133 DB migrations and 8 cleanroom engines)?",
      answer:
        "Built directly by an 18-year architect (ex-Baemin, Smilegate, Samjjeomsam, Kakao, NCSOFT) using strict automated guardrails: an 800-line file-size ratchet, architecture boundary checks, unconnected-code gates, and a single AGENTS.md harness. Having no team yet is stated openly; sales/marketing and support hires follow validated beta conversion.",
    },
  },
  {
    id: "license-risk",
    pillarKo: "실현가능성 · 상용 IP",
    pillarEn: "Feasibility & Commercial IP",
    evidenceTagKo: "실측 · 590 감사 통과 · 차단 0건",
    evidenceTagEn: "Measured · 590 audited · 0 blockers",
    ko: {
      question: "Mixbox 같은 비상업 패키지나 오픈소스 라이선스 리스크는 어떻게 막나요?",
      answer:
        "pnpm audit:licenses(590개 항목 통과)와 1인 기업 상용 준비 감사 스크립트로 Mixbox(CC-BY-NC-4.0)·GPL·AGPL·SSPL 유입을 0건으로 차단합니다. 7밴드 KM 분광 안료 등 핵심 8종 엔진은 외부 상용 패키지 없이 자체 수학 클린룸으로 구현해 로열티가 ₩0입니다. LGPL 2건(opencascade.js·p5)은 지연 로드 경계를 유지하고, Remotion은 3인 이하 무료 경계를 추적하며 4인 확장 전 로컬 타임랩스 경로 또는 상용 전환 기준을 명시했습니다.",
    },
    en: {
      question: "How do you prevent commercial license risk from non-commercial packages like Mixbox?",
      answer:
        "pnpm audit:licenses (590 entries passed) and our solo commercial readiness guard enforce 0 blockers for Mixbox (CC-BY-NC-4.0), GPL, AGPL, and SSPL. Our 8 core engines — including the 7-band KM spectral pigment core — are cleanroom math implementations with KRW 0 royalty. Two LGPL libraries (opencascade.js, p5) stay behind lazy dynamic boundaries, and Remotion is tracked inside its <=3-person free tier.",
    },
  },
  {
    id: "gpu-cost-risk",
    pillarKo: "성장전략 · 원가 구조",
    pillarEn: "Growth & Cost Structure",
    evidenceTagKo: "실측 · 베타 ₩0 · Wasm64 1 GiB",
    evidenceTagEn: "Measured · KRW 0 beta · Wasm64 1 GiB",
    ko: {
      question: "AI·3D·드로잉 서비스의 GPU 서버비 폭탄과 무료 구간 적자는 어떻게 막나요?",
      answer:
        "브러시·7밴드 분광 혼색·3D 렌더·최대 1 GiB Wasm64 모델 임포트·기기 내 임시 보관(OPFS)을 전부 사용자 브라우저에서 처리해 서버 GPU 비용이 ₩0입니다. 기기 내 임시 보관과 원본 파일·개인 드라이브 저장을 구분하며, 현재 운영 인프라는 Cloudflare 정적 웹·R2($0.00)와 서울 onpod API·DB(₩0, 도메인 갱신비 별도)입니다. AI는 제공 크레딧 상한과 BYOK·로컬 모델 선택으로 무료 구간 역마진을 막습니다.",
    },
    en: {
      question: "How do you prevent GPU server cost spikes and free-tier burn?",
      answer:
        "Brushes, 7-band spectral mixing, 3D rendering, up to 1 GiB Wasm64 local model imports, and Temporary device storage (OPFS) run on the user's browser so server GPU cost is KRW 0. Temporary device storage is kept distinct from separate file or personal-drive saves. Production runs on Cloudflare Static/R2 ($0.00) and Seoul onpod API/DB (KRW 0, domain renewal separate), while AI uses credit caps, BYOK, and local models.",
    },
  },
  {
    id: "csp-switching",
    pillarKo: "문제인식 · 전환 동기",
    pillarEn: "Problem & Adoption",
    evidenceTagKo: "공존형 진입 · 분업 스튜디오 대표 타깃",
    evidenceTagEn: "Coexistence entry · Studio decision makers",
    ko: {
      question: "클립스튜디오(CSP)·Procreate가 표준인데 작가와 스튜디오가 왜 ToonStudio를 쓰나요?",
      answer:
        "첫날부터 클립스튜디오를 버리게 하는 대체 전략이 아니라, 기존 PSD 원고를 그대로 불러와 핀 검수·승인 기록·3D 앵글 12종·3D→2D 광원 동기화·Rights BOM 납품 슬라이스를 한 브라우저에서 잇는 공존형 협업 OS로 진입합니다. 초기 결제 결정권자는 개인이 아니라 파일 이동·버전 혼란으로 마감이 밀리는 분업 스튜디오 대표이며, 5~10컷 단편 베타에서 실제 시간 절감과 지불 의사를 검증합니다.",
    },
    en: {
      question: "Clip Studio and Procreate are standards — why would creators or studios adopt ToonStudio?",
      answer:
        "Rather than demanding a day-one switch from Clip Studio, ToonStudio enters as a coexisting collaboration OS: import existing PSD manuscripts, run pin review and approval logs, compose 12 webtoon 3D camera angles with 3D-to-2D light sync, and export Rights BOM delivery slices in one browser. Initial buyers are studio decision makers facing handoff bottlenecks, to be validated in 5–10 panel beta tests.",
    },
  },
  {
    id: "cross-llm-deploy",
    pillarKo: "운영 안정성 · 거버넌스",
    pillarEn: "Operations & Governance",
    evidenceTagKo: "실측 · DEPLOY_MANIFEST.json · 수동 승인",
    evidenceTagEn: "Measured · DEPLOY_MANIFEST.json · gated release",
    ko: {
      question: "AI 개발 모델이나 도구가 바뀌어도 배포·운영 안정성이 흔들리지 않나요?",
      answer:
        "배포 규칙을 사람 기억이나 특정 에이전트 프롬프트에 두지 않고 deploy/DEPLOY_MANIFEST.json과 STANDING_APPROVAL.json 단일 정본에 고정했습니다. Claude·Codex·Gemini 어느 도구가 붙어도 deploy:doctor -- --json과 5대 Actions 모드(smart-release·web-only·api-only·dry-run·custom)만 통과하며, DB 비밀번호를 회전시키는 --attach-db나 onpod app rollback, 퇴역 인프라(render·neon 등) 재도입은 정책과 스크립트로 차단합니다.",
    },
    en: {
      question: "Does deployment stability hold if the AI coding model or tooling changes?",
      answer:
        "Deployment rules live in deploy/DEPLOY_MANIFEST.json and STANDING_APPROVAL.json rather than any single model's memory. Whether Claude, Codex, or Gemini operates the repo, every release goes through deploy:doctor -- --json and five GitHub Actions modes, while destructive commands (--attach-db, onpod app rollback) and retired infrastructure are blocked by policy and scripts.",
    },
  },
] as const;
