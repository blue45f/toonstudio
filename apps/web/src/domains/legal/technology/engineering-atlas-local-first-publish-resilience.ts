import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · local-first · ₩0 로컬 CMYK PDF/X-4·EPUB3·CBZ·4대 플랫폼 패키저 &
 * 발열/배터리 4단계 페이서 · A/B 이중 저널 0.116ms 복구 · 비추출 키 볼트 · 12차원 잉크 인증 ·
 * 3-Way 충돌 해결 · 마감 ETA · 글로벌 심볼 · XOR+RLE 타임랩스 · 콜드부트 감사 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_LOCAL_FIRST_PUBLISH_RESILIENCE: readonly EngineeringAtlasEntry[] = [
  {
    id: "local-cmyk-pdfx4-epub3-cbz-platform-packager",
    category: "local-first",
    name: "Local CMYK PDF/X-4 · EPUB3 · CBZ · 4-Platform Packager",
    title: t("₩0 로컬 CMYK PDF/X-4 · EPUB3 · CBZ · 4대 플랫폼 패키저", "₩0 local CMYK PDF/X-4, EPUB3, CBZ & 4-platform packager"),
    status: "experimental",
    tagline: t(
      "서버 변환 없이 네이버·카카오·라인·타파스 규격 검사와 TAC≤300% CMYK PDF/X-4·EPUB3·CBZ 를 로컬 패키징합니다.",
      "Packages Naver/Kakao/LINE/Tapas slices, TAC<=300% CMYK PDF/X-4, EPUB3 and CBZ with Rights BOM locally at ₩0.",
    ),
    background: [
      t(
        "웹툰 원고를 국내외 연재 플랫폼과 단행본 인쇄소·전자책으로 내보낼 때 매번 유료 변환 서버나 별도 DTP 프로그램을 거치면 마감 지연과 규격 반려(가로 폭 불일치, 300 DPI 미달, 3mm 도련 누락, 총잉크량 TAC 300% 초과로 인한 뒷묻음)가 잦습니다.",
        "Exporting webtoons to serial platforms, print houses and e-book stores often trips over paid conversion servers or spec rejections—wrong widths, sub-300 DPI art, missing 3 mm bleed or >300% CMYK ink coverage.",
      ),
      t(
        "wasm64-publish-continuity-resilience 의 publish-spec-and-cmyk-softproof.ts 와 cmyk-pdfx4-epub3-print-packager.ts 는 모든 프리플라이트와 패키징을 브라우저 로컬 ₩0 로 실행합니다. 네이버(690/800px)·카카오(720px)·라인(800×1280px)·타파스(940px) 4대 플랫폼의 규격 위반을 사전 차단하고 정상 원고를 플랫폼 슬라이스 매니페스트로 묶습니다.",
        "publish-spec-and-cmyk-softproof.ts and cmyk-pdfx4-epub3-print-packager.ts run preflight and packaging locally at ₩0, validating Naver (690/800), Kakao (720), LINE (800×1280) and Tapas (940) specs before bundling slices.",
      ),
      t(
        "단행본 인쇄용 CMYK PDF/X-4 경로는 300 DPI·3mm 도련(bleed)·재단선/레지스트레이션 마크·종이 프로파일별 소프트프루핑과 총잉크량 TAC ≤ 300% 클램프 및 핫스팟 셀 감사를 함께 돌립니다. 전자책용 고정 레이아웃 EPUB3 매니페스트와 무압축 ZIP 바이너리 기반 CBZ 아카이브에도 Rights BOM 이 자동 동봉됩니다.",
        "The print CMYK PDF/X-4 pipeline checks 300 DPI, 3 mm bleed, crop/registration marks, paper soft-proofing and TAC <= 300% clamping with hotspot auditing. Fixed-layout EPUB3 and raw-ZIP CBZ packages bundle the Rights BOM automatically.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): 4대 플랫폼 프리플라이트 게이트, CMYK TAC ≤ 300% 소프트프루핑·PDF/X-4 구조, 고정 레이아웃 EPUB3·CBZ ZIP 바이트 생성은 wasm64-publish-continuity-resilience.test.ts 에서 검증됐습니다. 스튜디오 본편 내보내기 모달과의 기본 연결 및 실제 인쇄소 ICC 프로파일 검수는 다음 단계입니다.",
        "Current vs Roadmap: 4-platform preflight, TAC <= 300% CMYK soft-proofing, PDF/X-4 geometry and EPUB3/CBZ ZIP packaging pass unit tests. Main export-modal wiring and print-house ICC proof validation follow next.",
      ),
    ],
    keyPoints: [
      t("4대 플랫폼 규격 게이트: 네이버(690/800)·카카오(720)·라인·타파스", "4-platform preflight: Naver 690/800, Kakao 720, LINE & Tapas"),
      t("인쇄 CMYK PDF/X-4: 300 DPI · 3mm 도련 · TAC ≤ 300% 클램프", "Print CMYK PDF/X-4: 300 DPI, 3 mm bleed & TAC <= 300% clamp"),
      t("고정 레이아웃 EPUB3 · 무압축 ZIP CBZ 아카이브(Rights BOM 포함)", "Fixed-layout EPUB3 & ZIP-byte CBZ archive with Rights BOM"),
      t("외부 변환 서버 ₩0 · 지연 로드(0B 초기 번들 영향) 로컬 완결", "₩0 server conversion cost & 0 B eager bundle impact"),
    ],
    diagram: {
      id: "local-cmyk-pdfx4-epub3-cbz-platform-packager-diagram",
      kind: "graph",
      title: t("₩0 브라우저 로컬 출판 프리플라이트 · 4종 패키징 파이프라인", "₩0 browser-local preflight & 4-format publishing pipeline"),
      caption: t(
        "원고와 Rights BOM 이 프리플라이트 게이트를 통과하면 플랫폼·인쇄·전자책 4종 패키지로 서버 없이 변환됩니다.",
        "Once manuscripts and Rights BOM pass preflight, four serial, print and e-book bundles emit locally without a server.",
      ),
      alt: t(
        "왼쪽에서 원고 슬라이스와 Rights BOM 이 입력되면 프리플라이트 게이트가 해상도(300 DPI)·3mm 도련·TAC 300% 이하·플랫폼 폭·상업 라이선스를 검사합니다. 통과한 원고는 4대 웹툰 플랫폼 패키지, CMYK PDF/X-4 소프트프루핑 패키지, 고정 레이아웃 EPUB3, Rights BOM 포함 CBZ ZIP 아카이브 네 갈래로 로컬 생성됩니다.",
        "Manuscript slices and Rights BOM enter the local preflight gate checking 300 DPI, 3 mm bleed, TAC <= 300%, platform widths and licenses, then branch into 4-platform webtoon slices, CMYK PDF/X-4 soft-proof bundles, fixed-layout EPUB3 and CBZ ZIP archives.",
      ),
      nodes: [
        { id: "src", label: t("원고 · Rights BOM", "Manuscript & BOM"), sub: t("컷 슬라이스 · 라이선스", "Cut slices, licenses"), tone: "local", at: [0, 1] },
        { id: "gate", label: t("프리플라이트", "Preflight"), sub: t("도련·TAC≤300%", "Bleed, TAC≤300%"), tone: "warn", shape: "diamond", at: [1, 1] },
        { id: "plat", label: t("4대 플랫폼 팩", "4-platform pack"), sub: t("네이버·카카오·라인·타파스", "Naver/Kakao/LINE/Tapas"), tone: "good", at: [2, 0] },
        { id: "pdf", label: t("CMYK PDF/X-4", "CMYK PDF/X-4"), sub: t("3mm 도련 · 소프트프루프", "3 mm bleed, soft-proof"), tone: "good", at: [2, 1] },
        { id: "book", label: t("EPUB3 · CBZ", "EPUB3 & CBZ"), sub: t("ZIP 바이트 · BOM 동봉", "ZIP bytes + Rights BOM"), tone: "good", at: [2, 2] },
      ],
      edges: [
        { from: "src", to: "gate" },
        { from: "gate", to: "plat", label: t("규격 통과", "Spec OK") },
        { from: "gate", to: "pdf", label: t("TAC 클램프", "TAC clamp") },
        { from: "gate", to: "book", label: t("BOM 봉인", "BOM seal") },
      ],
      groups: [
        { id: "out", label: t("서버 비용 ₩0 로컬 출력", "₩0 local export outputs"), tone: "local", nodeIds: ["plat", "pdf", "book"] },
      ],
    },
    usage: [
      {
        feature: t("4대 플랫폼 · CMYK PDF/X-4 · EPUB3 · CBZ 로컬 패키저", "4-platform, CMYK PDF/X-4, EPUB3 & CBZ local packager"),
        role: t(
          "네이버·카카오·라인·타파스 규격 검수, 300 DPI·3mm 도련·TAC ≤ 300% 소프트프루핑, 고정 레이아웃 EPUB3·CBZ ZIP 생성을 수행합니다.",
          "Audits 4 serial specs, runs 300 DPI / 3 mm bleed / TAC <= 300% soft-proofing, and builds EPUB3/CBZ ZIP bytes.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/cmyk-pdfx4-epub3-print-packager.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/publish-spec-and-cmyk-softproof.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/wasm64-publish-continuity-resilience.test.ts",
        ],
        route: "/studio",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("인쇄용 sRGB→CMYK 변환과 TAC ≤ 300% 총잉크량 클램프", "Print sRGB→CMYK conversion with TAC <= 300% clamp"),
        language: "ts",
        ...sampleSource([
          ["export interface CmykPercent { readonly c: number; readonly m: number; readonly y: number; readonly k: number; readonly tac: number; }"],
          [""],
          ["export function srgbToCmykTac300(r255: number, g255: number, b255: number, maxTac = 300): CmykPercent {"],
          ["  const r = r255 / 255, g = g255 / 255, b = b255 / 255;"],
          ["  const k = 1 - Math.max(r, g, b);"],
          ["  const denom = 1 - k;"],
          ["  let c = denom > 1e-6 ? ((1 - r - k) / denom) * 100 : 0;"],
          ["  let m = denom > 1e-6 ? ((1 - g - k) / denom) * 100 : 0;"],
          ["  let y = denom > 1e-6 ? ((1 - b - k) / denom) * 100 : 0;"],
          ["  const kPct = k * 100;"],
          ["  const sum = c + m + y + kPct;"],
          ["  if (sum > maxTac && c + m + y > 0) {"],
          ["    const scale = Math.max(0, maxTac - kPct) / (c + m + y);", "K 유지하며 CMY 비율 축소", "preserve K while scaling CMY"],
          ["    c *= scale; m *= scale; y *= scale;"],
          ["  }"],
          ["  return { c, m, y, k: kPct, tac: c + m + y + kPct };"],
          ["}"],
        ]),
        explain: t(
          "실제 srgbToPrintCmyk 와 auditAndSoftProofRgbaBuffer 는 블랙 생성(GCR), 용지 백색점 소프트프루핑, TAC 300% 초과 핫스팟 격자 좌표까지 함께 산출합니다.",
          "srgbToPrintCmyk and auditAndSoftProofRgbaBuffer add GCR black generation, paper-profile soft-proofing and per-cell TAC > 300% hotspot maps.",
        ),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/publish-spec-and-cmyk-softproof.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "ISO 15930-7 · PDF/X-4 Graphic Technology Prepress Data Exchange",
        url: "https://www.iso.org/standard/55844.html",
        kind: "spec",
        note: t("단행본 인쇄용 PDF/X-4 도련·재단선·색공간 국제 표준", "International PDF/X-4 prepress standard for trim, bleed and CMYK"),
      },
      {
        title: "W3C · EPUB 3.3 Fixed-Layout Documents Specification",
        url: "https://www.w3.org/TR/epub-33/#sec-fixed-layouts",
        kind: "spec",
        note: t("만화·웹툰 전자책용 고정 레이아웃 EPUB3 패키징 표준", "W3C EPUB 3.3 fixed-layout standard for digital comic packaging"),
      },
    ],
    chapterIds: ["storage", "licenses", "cost-engineering"],
    talk: {
      pitch: t(
        "네이버(690/800)·카카오(720)·라인(800×1280)·타파스(940) 규격 검수부터 300 DPI·3mm 도련·TAC ≤ 300% CMYK PDF/X-4, 고정 레이아웃 EPUB3, Rights BOM 포함 CBZ ZIP 생성까지 서버 비용 ₩0 으로 브라우저 안에서 끝냅니다.",
        "Preflight for Naver, Kakao, LINE and Tapas plus 300 DPI / 3 mm bleed / TAC <= 300% CMYK PDF/X-4, fixed-layout EPUB3 and Rights-BOM CBZ archives all run locally in the browser at ₩0.",
      ),
      analogy: t(
        "연재 플랫폼 검수관과 인쇄소 감리 기사, 전자책 제본기를 내 노트북 안에 넣어 두고 서버 업로드 없이 4종 규격을 한 번에 찍어 내는 출판 데스크입니다.",
        "Like keeping a platform QA checker, pressroom preflight technician and e-book binder right inside your laptop with zero server uploads.",
      ),
      questions: [
        {
          question: t("왜 인쇄용 CMYK 에서 총잉크량(TAC)을 300% 이하로 제한하나요?", "Why clamp print CMYK Total Area Coverage (TAC) to 300%?"),
          answer: t(
            "4개 채널 합이 300% 를 넘으면 종이가 잉크를 흡수하지 못해 건조 불량과 뒷묻음(set-off)이 생깁니다. 블랙(K)을 유지하며 CMY 를 비율 축소해 인쇄 반려를 미리 막습니다.",
            "Exceeding 300% total ink causes slow drying and paper set-off on press; preserving K while scaling CMY avoids press rejections.",
          ),
        },
        {
          question: t("4대 플랫폼 규격이 바뀌면 어떻게 대응하나요?", "How does the packager adapt if platform pixel specs change?"),
          answer: t(
            "플랫폼 폭·높이·최대 용량 규칙이 PLATFORM_PUBLISH_SPECS 단일 상수 테이블에 선언돼 있어 규격 개정 시 한 곳만 갱신하고 프리플라이트 테스트로 검증합니다.",
            "All width, slice-height and file-size rules live in one PLATFORM_PUBLISH_SPECS constant table for single-point updates and test verification.",
          ),
        },
      ],
      pitfall: t(
        "브라우저 소프트프루핑은 표준 수학적 sRGB→CMYK 변환과 용지 시뮬레이션이며, 상업 인쇄소 납품 전에는 인쇄소 지정 공식 ICC 프로파일(예: Japan Color 2001 Coated) 교정 확인이 필요합니다.",
        "Browser soft-proofing uses deterministic math transforms; commercial print runs still warrant proofing against the print house's official ICC profile.",
      ),
    },
    technologies: ["CMYK PDF/X-4", "EPUB 3.3", "CBZ ZIP", "Rights BOM"],
    facts: [
      {
        value: "690/800 · 720 · 800 · 940",
        label: t("네이버·카카오·라인(800×1280)·타파스 4대 플랫폼 프리플라이트 규격", "Naver, Kakao, LINE (800×1280) & Tapas preflight specs"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/publish-spec-and-cmyk-softproof.ts",
      },
      {
        value: "300 DPI · 3mm · TAC≤300%",
        label: t("단행본 인쇄 CMYK PDF/X-4 도련·총잉크량 클램프·소프트프루핑", "Print CMYK PDF/X-4 bleed, TAC <= 300% clamp & soft-proofing"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/cmyk-pdfx4-epub3-print-packager.ts",
      },
      {
        value: "EPUB3 + CBZ (₩0)",
        label: t("고정 레이아웃 EPUB3·무압축 ZIP CBZ 및 Rights BOM 로컬 패키징", "Fixed-layout EPUB3, raw-ZIP CBZ & Rights BOM local packaging"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/wasm64-publish-continuity-resilience.test.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "thermal-pacer-dual-journal-vault-biometric-coldboot",
    category: "local-first",
    name: "Thermal Pacer · A/B Journal · Zero-Trust Vault · Cold-Boot",
    title: t("발열 4단계 페이서 · A/B 저널 0.116ms · 비추출 키 볼트 · 콜드부트", "4-tier thermal pacer, 0.116 ms A/B journal, key vault & cold-boot"),
    status: "experimental",
    tagline: t(
      "발열 페이서, A/B 손상 복구(0.116ms), 비추출 키 볼트, 12D 잉크 인증, 3-Way 병합, 타임랩스(97.01%)·콜드부트.",
      "Thermal pacer, 0.116 ms A/B restore, non-extractable vault, 12D ink auth, 3-way merge, 97.01% timelapse & cold-boot.",
    ),
    background: [
      t(
        "장시간 태블릿·노트북 작업에서는 발열 스로틀링, 크래시 중 저널 절단, 로컬 키 탈취, 원고 본인 확인, 오프라인/클라우드 동시 수정 충돌, 마감 병목과 비행기 모드 콜드부트 실패가 창작 흐름을 끊습니다.",
        "Long tablet/laptop sessions face thermal throttling, mid-write journal corruption, key theft, authorship disputes, offline/cloud merge conflicts, deadline surprises and airplane-mode cold-boot failures.",
      ),
      t(
        "wasm64-publish-continuity-resilience 는 5대 복원·보안 코어를 제공합니다. ① ThermalBatteryAdaptivePacer 는 프레임 드리프트·발열·저전력 신호에 따라 VRS·SVT·XPBD 품질을 4단계로 자동 하향하고 냉각 뒤 복구합니다. ② DualJournalSessionRestorer 는 Journal B 가 비트 반전·절단으로 손상돼도 FNV-1a32 로 탐지해 유효한 Journal A 로 0.116ms 만에 자동 복구합니다.",
        "wasm64-publish-continuity-resilience adds five resilience cores: ThermalBatteryAdaptivePacer steps VRS/SVT/XPBD across 4 thermal/battery tiers, and DualJournalSessionRestorer detects corrupted Journal B via FNV-1a32 to restore intact Journal A in 0.116 ms.",
      ),
      t(
        "③ ZeroTrustKeyVault(zero-trust-key-vault.ts)는 WebCrypto extractable: false AES-GCM/ECDSA 키를 격리해 스크립트의 원시 키 추출 자체를 차단합니다. ④ StylusBiometricInkProfiler 는 필압·속도·기울기·리듬 12차원 스타일러스 운동 특징으로 본인(authentic)과 사칭(imposter-suspected)을 로컬 판별하고, resolveStudioDocumentConflict 는 비겹침 편집을 자동 병합하되 실제 충돌만 3-Way 명시 선택지로 띄웁니다.",
        "ZeroTrustKeyVault enforces WebCrypto extractable: false AES-GCM/ECDSA keys blocking raw export. StylusBiometricInkProfiler classifies authentic vs imposter-suspected strokes across 12 kinematic dimensions, while resolveStudioDocumentConflict auto-merges disjoint edits and flags true 3-way conflicts explicitly.",
      ),
      t(
        "wasm64-supergap-security-ops-hw 의 Pillars G·H 는 여기에 ① MAD 이상치 억제 스트로크 이력 마감 ETA/병목 예측, ② 2D 호모그래피 원근 변환·로컬 오버라이드 보존 다중 에피소드 글로벌 스마트 심볼, ③ 무손실 XOR+RLE Undo 타임랩스 릴스(97.01% 압축 · 15s/30s 60fps 스케줄), ④ 제로-네트워크 콜드부트 준비 감사기(coldboot-readiness-auditor.ts)를 더했습니다. 현재 구현·실측 완료(Current): 전 모듈 단위 테스트 통과. 로드맵(Target): 앱 셸 복구 화면·오프라인 대시보드 통합은 단계별로 연결합니다.",
        "Pillars G & H add MAD-robust deadline ETA prediction, 2D homography global smart symbols, lossless XOR+RLE undo-log timelapse reels (97.01% compression, 15s/30s 60fps schedules) and a zero-network cold-boot readiness auditor. Current vs Roadmap: all modules pass unit tests; app-shell dashboard wiring is staged.",
      ),
    ],
    keyPoints: [
      t("발열·배터리 4단계 페이서 & A/B 이중 저널 손상 복구(0.116ms)", "4-tier thermal/battery pacer & 0.116 ms A/B journal restore"),
      t("WebCrypto extractable:false 키 볼트 · 12차원 스타일러스 잉크 인증", "WebCrypto extractable:false key vault & 12D biometric ink auth"),
      t("3-Way 문서 충돌 해결기 · 마감 ETA(MAD) · 호모그래피 글로벌 심볼", "3-way merge resolver, MAD deadline ETA & homography symbols"),
      t("XOR+RLE Undo 타임랩스 릴스(97.01% 압축) & 제로-네트워크 콜드부트 감사", "97.01% XOR+RLE undo timelapse reels & offline cold-boot audit"),
    ],
    diagram: {
      id: "thermal-pacer-dual-journal-vault-biometric-coldboot-diagram",
      kind: "layers",
      title: t("로컬 복원력 · 제로트러스트 보안 · 운영 생산성 4계층", "Four-layer local resilience, zero-trust security & creator ops"),
      caption: t(
        "발열 제어·0.116ms 저널 복구·비추출 키·12D 잉크 인증·3-Way 병합·97.01% 타임랩스·콜드부트 감사를 기기 안에서 완결합니다.",
        "Thermal pacing, 0.116 ms restore, non-extractable keys, 12D ink auth, 3-way merge, 97.01% timelapse and cold-boot audit all run locally.",
      ),
      alt: t(
        "1층 발열·배터리 4단계 페이서(VRS·SVT·XPBD 하향/복구), 2층 A/B 이중 저널 0.116ms 손상 복구와 제로-네트워크 콜드부트 준비 감사, 3층 WebCrypto extractable:false 키 볼트와 12차원 스타일러스 생체 잉크 인증, 4층 3-Way 문서 충돌 해결·마감 ETA·호모그래피 글로벌 심볼·97.01% 압축 XOR+RLE 타임랩스 릴스입니다.",
        "Four local resilience layers: (1) 4-tier thermal/battery pacer, (2) 0.116 ms A/B dual-journal recovery & offline cold-boot audit, (3) extractable:false WebCrypto vault & 12D biometric ink profiler, and (4) 3-way merge, MAD deadline ETA, homography symbols & 97.01% XOR+RLE timelapse.",
      ),
      layers: [
        {
          id: "therm",
          label: t("1. 발열·배터리 4단계 페이서", "1. 4-tier thermal/battery pacer"),
          sub: t("프레임 드리프트·발열 감지 시 VRS·SVT·XPBD 하향 및 냉각 복구", "Steps VRS/SVT/XPBD down on heat/drift and recovers on cool"),
          tone: "warn",
          chips: ["4 Tiers", "VRS/SVT/XPBD", "Hysteresis"],
        },
        {
          id: "journal",
          label: t("2. A/B 이중 저널 & 콜드부트 감사", "2. A/B journal & cold-boot audit"),
          sub: t("Journal B 손상 시 FNV-1a32 검출 → Journal A 0.116ms 즉시 복구", "Detects corrupt slot B via FNV-1a32; restores A in 0.116 ms"),
          tone: "good",
          chips: ["0.116 ms", "FNV-1a32", "Cold-Boot"],
        },
        {
          id: "vault",
          label: t("3. 비추출 키 볼트 & 12D 잉크 인증", "3. Non-extractable vault & 12D auth"),
          sub: t("extractable:false AES-GCM/ECDSA 격리 + 12차원 필압 운동 진위 판별", "extractable:false keys + 12D kinematic stylus authorship check"),
          tone: "edge",
          chips: ["extractable:false", "12D Ink Auth", "Zero-Trust"],
        },
        {
          id: "ops",
          label: t("4. 3-Way 병합 · ETA · 심볼 · 타임랩스", "4. 3-way, ETA, symbols & timelapse"),
          sub: t("필드 자동 병합 · MAD 마감 예측 · 2D 호모그래피 · 97.01% 릴스 압축", "Field 3-way merge, MAD ETA, homography & 97.01% reel ratio"),
          tone: "local",
          chips: ["3-Way Merge", "MAD ETA", "97.01% RLE"],
        },
      ],
      brackets: [
        { label: t("오프라인 무중단 작업실 안전망", "Offline continuous studio safety net"), layerIds: ["therm", "journal", "vault", "ops"] },
      ],
    },
    usage: [
      {
        feature: t("발열 4단계 페이서 · A/B 이중 저널 · 비추출 키 볼트 · 12D 잉크 인증 · 3-Way 병합", "Thermal pacer, A/B journal, key vault, 12D ink auth & 3-way merge"),
        role: t(
          "VRS/SVT/XPBD 발열 제어, 0.116ms 저널 복구, extractable:false 키 격리, 12차원 스타일러스 진위 판별, 3-Way 병합을 수행합니다.",
          "Handles thermal step-down, 0.116 ms A/B restore, non-extractable WebCrypto keys, 12D ink auth and 3-way merges.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/thermal-pacer-and-instant-restore.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/zero-trust-key-vault.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/biometric-ink-auth-and-conflict-resolver.ts",
          "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/studio-document-conflict-resolver.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("마감 ETA · 글로벌 호모그래피 심볼 · XOR+RLE 타임랩스 · 콜드부트 감사", "Deadline ETA, global homography symbols, XOR+RLE timelapse & cold-boot"),
        role: t(
          "MAD 이상치 억제 마감 예측, 다중 회차 원근 심볼 전파, 97.01% 압축 타임랩스 릴스, 완전 오프라인 콜드부트 감사를 실행합니다.",
          "Runs MAD deadline ETA, multi-episode homography symbols, 97.01% XOR+RLE timelapse reels and cold-boot checks.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/deadline-eta-predictor.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/global-smart-symbols.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/timelapse-undo-reels.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/coldboot-readiness-auditor.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("A/B 이중 저널 체크섬 검증과 손상 슬롯 즉시 폴백 선택", "A/B dual-journal checksum verification & instant fallback"),
        language: "ts",
        ...sampleSource([
          ["export interface JournalSlot { readonly slot: \"A\" | \"B\"; readonly seq: number; readonly checksumOk: boolean; }"],
          [""],
          ["export function pickLatestValidJournal(slotA: JournalSlot, slotB: JournalSlot): JournalSlot | null {"],
          ["  const valid = [slotA, slotB].filter((item) => item.checksumOk);", "FNV-1a32 불일치·절단 슬롯 제외", "drop checksum-failed or truncated slots"],
          ["  if (valid.length === 0) return null;"],
          ["  valid.sort((a, b) => b.seq - a.seq);", "정상 슬롯 중 최신 세대 번호 선택", "pick highest sequence among intact slots"],
          ["  return valid[0] ?? null;"],
          ["}"],
        ]),
        explain: t(
          "실제 DualJournalSessionRestorer 는 A/B 두 슬롯에 번갈아 원자 기록하고 FNV-1a32 검증으로 최신 슬롯 손상 시 직전 온전한 슬롯을 0.116ms 만에 되살립니다.",
          "DualJournalSessionRestorer alternates writes across slots A and B with FNV-1a32 checksums, restoring the intact previous slot in 0.116 ms on corruption.",
        ),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/thermal-pacer-and-instant-restore.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · Web Cryptography API (Non-Extractable CryptoKey)",
        url: "https://www.w3.org/TR/WebCryptoAPI/#cryptokey-interface",
        kind: "spec",
        note: t("extractable: false 로 JS 메모리에서 원시 키 추출을 차단하는 WebCrypto 규격", "WebCrypto CryptoKey specification enforcing extractable: false"),
      },
      {
        title: "W3C · Compute Pressure API (Thermal & System Load Signals)",
        url: "https://www.w3.org/TR/compute-pressure/",
        kind: "spec",
        note: t("발열·시스템 부하 상태에 따른 적응형 프레임 페이싱 설계 참고 표준", "W3C Compute Pressure reference for thermal-aware frame pacing"),
      },
    ],
    chapterIds: ["storage", "pwa-continuity", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "발열·배터리 4단계 페이서, 0.116ms A/B 이중 저널 손상 복구, extractable:false 키 볼트, 12차원 스타일러스 생체 잉크 인증, 3-Way 문서 충돌 해결에 더해 마감 ETA·호모그래피 글로벌 심볼·97.01% 압축 XOR+RLE 타임랩스·제로-네트워크 콜드부트 감사까지 로컬로 검증했습니다.",
        "Four-tier thermal pacing, 0.116 ms A/B journal recovery, non-extractable WebCrypto vaults, 12D biometric ink auth, 3-way conflict resolution, MAD deadline ETA, homography symbols, 97.01% timelapse reels and offline cold-boot audits are verified locally.",
      ),
      analogy: t(
        "과열되면 기어를 자동으로 낮추고(페이서), 예비 기록장(A/B 저널)과 금고 속 복제 불가 열쇠(extractable:false), 필체 감정사(12D 잉크 인증), 비행기 모드 이륙 전 점검표(콜드부트 감사)까지 갖춘 작업실입니다.",
        "Like a studio desk with auto thermal downshifting, a backup flight recorder, non-exportable vault keys, handwriting verification and a pre-flight offline checklist.",
      ),
      questions: [
        {
          question: t("extractable: false 키 볼트는 XSS 공격에서도 완전히 안전한가요?", "Does an extractable: false vault make XSS harmless?"),
          answer: t(
            "원시 키 바이트 추출과 외부 복사는 차단하지만, 동일 오리진에서 실행된 악성 스크립트가 서명·복호화 API 를 대리 호출하는 것까지 막지는 못하므로 엄격한 CSP 와 함께 운용해야 합니다.",
            "It blocks exporting raw key bytes, yet same-origin XSS could still invoke CryptoKey operations as an oracle, so strict CSP remains mandatory.",
          ),
        },
        {
          question: t("12차원 스타일러스 생체 잉크 인증 결과는 법적 본인 인증 수단인가요?", "Is 12D stylus biometric ink auth a legal identity credential?"),
          answer: t(
            "아닙니다. 원고 작성 패턴의 급격한 이탈(사칭 의심)을 로컬에서 조기 경고하는 창작 보조·감사 신호이며, 계정의 정식 본인 인증은 WebAuthn·OAuth 를 따릅니다.",
            "No—it is a local authoring-anomaly and audit signal, while formal account authentication stays on WebAuthn/OAuth.",
          ),
        },
      ],
      pitfall: t(
        "Compute Pressure API 와 Battery Status API 는 브라우저별 지원 편차가 크므로 프레임 드리프트 기반 자율 폴백이 기본 신호로 함께 동작합니다.",
        "Browser support for Compute Pressure and Battery Status APIs varies, so measured frame-time drift serves as the universal fallback signal.",
      ),
    },
    technologies: ["WebCrypto", "A/B Dual Journal", "Thermal Pacer", "3-Way Merge", "XOR+RLE"],
    facts: [
      {
        value: "0.116 ms (A/B Journal)",
        label: t("Journal B 비트 반전·절단 손상 시 FNV-1a32 검출 및 Journal A 복구", "FNV-1a32 corrupt slot B detection & instant slot A restore"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/thermal-pacer-and-instant-restore.ts",
      },
      {
        value: "extractable: false · 12D",
        label: t("WebCrypto 비추출 AES-GCM/ECDSA 키 볼트 & 12차원 잉크 진위 판별", "Non-extractable WebCrypto key vault & 12D stylus ink profiler"),
        source: "apps/web/src/domains/creator/wasm64-publish-continuity-resilience/zero-trust-key-vault.ts",
      },
      {
        value: "97.01% (XOR+RLE)",
        label: t("무손실 Undo-Log 타임랩스 릴스 압축률 및 15s/30s 60fps 스케줄", "Lossless XOR+RLE undo-log timelapse compression & 60 fps schedule"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/timelapse-undo-reels.ts",
      },
      {
        value: "4 Thermal Tiers + Cold-Boot",
        label: t("발열/배터리 4단계 페이서 · MAD ETA · 호모그래피 심볼 · 콜드부트 감사", "4 thermal tiers, MAD ETA, homography symbols & cold-boot audit"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/coldboot-readiness-auditor.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
