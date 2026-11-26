import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops · 창작자 저작권 방어(DM-QIM 워터마크 · 고주파 스크래핑 방어막 ·
 * 가스비 ₩0 Merkle 감사 원장 · WOTS++ECDSA 포스트-양자 봉인) &
 * 스마트 라이선스 가디언 · Zero-Trust 서브캔버스 위임 · 원클릭 IP 2차 저작 파생 스튜디오 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const PLATFORM_OPS_CREATOR_DEFENSE_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "webgpu-watermark-merkle-ledger-pq-seal",
    category: "platform-ops",
    name: "DM-QIM Watermark · Merkle Ledger · PQ WOTS+ Seal",
    title: t("DM-QIM 비가시 워터마크 · ₩0 Merkle 원장 · 포스트-양자 봉인", "DM-QIM invisible watermark, ₩0 Merkle ledger & PQ WOTS+ seal"),
    status: "experimental",
    tagline: t(
      "PSNR 46.58 dB 워터마크, 3.065ms ₩0 Merkle 원장, 2,144B WOTS++ECDSA 봉인, 44.85 dB 방어막을 검증했습니다.",
      "Combines 46.58 dB DM-QIM watermarking, a 3.065 ms ₩0 Merkle ledger, 2,144 B PQ WOTS++ECDSA seals and a 44.85 dB shield.",
    ),
    background: [
      t(
        "웹툰 이미지가 공개되는 순간 무단 스크래핑·AI 학습 도용·원본 출처 위변조 위험에 노출됩니다. 기존 블록체인 공증은 매 거래마다 가스비와 외부 노드가 필요하고, 단순 가시 워터마크는 작품 감상을 해치며 쉽게 잘려 나갑니다.",
        "Published webtoons face unauthorized scraping, AI training ingestion and provenance tampering. On-chain notarization incurs gas fees and node dependencies, while visible watermarks degrade artwork and are trivially cropped.",
      ),
      t(
        "WebGpuWatermarkImprinter(webgpu-invisible-watermark-imprinter.ts)는 8×8 블록 Haar-Walsh 변환과 DM-QIM(Dither-Modulated Quantization Index Modulation) 대역확산으로 작가 ID·원고 다이제스트·키드 CRC-16 의 64비트 페이로드를 각인합니다. 실측에서 PSNR 46.58 dB 비가시성을 지키면서도 손실 양자화·밝기 이동·가산 잡음 섭동 뒤 100% 비트 복원과 오키 거부를 검증했습니다.",
        "WebGpuWatermarkImprinter embeds a 64-bit payload (creator ID, digest, keyed CRC-16) using 8×8 Haar-Walsh DM-QIM spread-spectrum modulation. Benchmarks verified 46.58 dB PSNR with 100% bit recovery after lossy quantization, brightness shifts and noise while rejecting wrong keys.",
      ),
      t(
        "ImmutableProvenanceLedger(immutable-provenance-audit-ledger.ts)는 가스비 ₩0 로컬 해시 체인 + SHA-256 머클 트리 + WebCrypto ECDSA 서명으로 전체 체인 무결성 검증 3.065ms 와 단 1바이트 위변조의 블록·필드 특정을 수행합니다. 여기에 RFC-8391 스타일 SHA-256 WOTS+(w=16, len=67, 2,144 B) + ECDSA P-256 하이브리드 봉인(16ms)과 텍스트 영역 변형 0·PSNR 44.85 dB 고주파 무단 스크래핑 방어막(adversarial-shield.ts)을 더했습니다.",
        "ImmutableProvenanceLedger delivers a zero-gas local hash chain, SHA-256 Merkle tree and ECDSA signing with 3.065 ms full verification and 1-byte tamper localization. Pillar D adds an RFC-8391-style SHA-256 WOTS+ (w=16, len=67, 2,144 B) + ECDSA P-256 hybrid seal (16 ms) and a 44.85 dB text-preserving high-frequency scraping shield.",
      ),
      t(
        "현재 구현·실측 완료(Current)와 확장 로드맵(Target): 4개 암호·신호처리 모듈은 WebCrypto 표준 API 와 WGSL 정적 검증·단위 테스트(0B 초기 번들 영향)를 통과했습니다. 출판 내보내기 다이얼로그의 기본 봉인 파이프라인 연결과 외부 공개 검증 페이지는 운영 보안 리뷰 후 순차 반영합니다.",
        "Current vs Roadmap: all four cryptographic and signal-processing modules pass WebCrypto, WGSL and unit tests with 0 B eager impact. Wiring them as default export seals and public verifier pages follows operational security review.",
      ),
    ],
    keyPoints: [
      t("8×8 Haar-Walsh DM-QIM 워터마크: PSNR 46.58 dB · 섭동 후 100% 복원", "8×8 Haar-Walsh DM-QIM watermark: 46.58 dB PSNR, 100% recovery"),
      t("가스비 ₩0 ECDSA+SHA-256 Merkle 감사 원장: 검증 3.065ms · 1B 특정", "Zero-gas ECDSA+SHA-256 Merkle ledger: 3.065 ms, 1-byte locate"),
      t("RFC-8391 스타일 SHA-256 WOTS++ECDSA 하이브리드 봉인: 2,144B · 16ms", "RFC-8391-style SHA-256 WOTS++ECDSA hybrid seal: 2,144 B, 16 ms"),
      t("고주파 무단 스크래핑 방어막: 텍스트 변형 0 · PSNR 44.85 dB", "High-frequency scraping shield: 0 text distortion, 44.85 dB PSNR"),
    ],
    diagram: {
      id: "webgpu-watermark-merkle-ledger-pq-seal-diagram",
      kind: "layers",
      title: t("창작자 저작권 · 출처 보호 4중 암호 방어 계층", "Four-layer creator provenance & copyright defense stack"),
      caption: t(
        "픽셀 워터마크·고주파 방어막으로 시각 에셋을 지키고, ₩0 Merkle 원장과 포스트-양자 WOTS+ 봉인으로 이력을 증명합니다.",
        "Visual assets gain DM-QIM watermarks and high-frequency shields while history is sealed by a ₩0 Merkle ledger and PQ WOTS+.",
      ),
      alt: t(
        "1층은 8×8 Haar-Walsh DM-QIM 비가시 암호화 워터마크(PSNR 46.58 dB·섭동 후 100% 복원), 2층은 텍스트 무변형 고주파 무단 스크래핑 방어막(PSNR 44.85 dB), 3층은 가스비 ₩0 ECDSA+SHA-256 Merkle 감사 원장(전체 검증 3.065ms), 4층은 RFC-8391 스타일 SHA-256 WOTS++ECDSA P-256 포스트-양자 하이브리드 봉인(2,144 B·16ms)입니다.",
        "Four layered defenses: (1) 8×8 Haar-Walsh DM-QIM invisible watermark (46.58 dB PSNR, 100% recovery), (2) text-preserving high-frequency scraping shield (44.85 dB PSNR), (3) zero-gas ECDSA+SHA-256 Merkle audit ledger (3.065 ms verification), and (4) RFC-8391-style SHA-256 WOTS++ECDSA P-256 post-quantum hybrid seal (2,144 B, 16 ms).",
      ),
      layers: [
        {
          id: "wm",
          label: t("1. Haar-Walsh DM-QIM 워터마크", "1. Haar-Walsh DM-QIM watermark"),
          sub: t("8×8 블록 64b 페이로드 · PSNR 46.58 dB · 섭동 후 100% 복원", "8×8 block 64b payload, 46.58 dB PSNR, 100% recovery"),
          tone: "local",
          chips: ["WGSL", "46.58 dB", "CRC-16"],
        },
        {
          id: "shield",
          label: t("2. 고주파 스크래핑 방어막", "2. High-freq scraping shield"),
          sub: t("말풍선 텍스트 변형 0 · 비가시 PSNR 44.85 dB 스펙트럼 섭동", "0 text distortion, 44.85 dB PSNR spectral perturbation"),
          tone: "warn",
          chips: ["44.85 dB", "Text Safe", "0 Tokens"],
        },
        {
          id: "merkle",
          label: t("3. ₩0 ECDSA+Merkle 감사 원장", "3. ₩0 ECDSA+Merkle ledger"),
          sub: t("전체 검증 3.065ms · 단일 이벤트 포함 증명 · 1바이트 변조 특정", "3.065 ms verify, inclusion proofs & 1-byte tamper pinpoint"),
          tone: "good",
          chips: ["₩0 Gas", "SHA-256", "3.065 ms"],
        },
        {
          id: "pq",
          label: t("4. WOTS++ECDSA 포스트-양자 봉인", "4. PQ WOTS++ECDSA hybrid seal"),
          sub: t("RFC-8391 스타일 w=16 len=67 (2,144 B) · 서명/검증 16ms", "RFC-8391 style w=16 len=67 (2,144 B), 16 ms seal"),
          tone: "edge",
          chips: ["WOTS+ 2,144 B", "ECDSA P-256", "16 ms"],
        },
      ],
      brackets: [
        { label: t("무가스 로컬 창작자 권리 증빙", "Zero-gas local creator proof"), layerIds: ["wm", "shield", "merkle", "pq"] },
      ],
    },
    usage: [
      {
        feature: t("WebGPU 8×8 Haar-Walsh DM-QIM 비가시 암호화 워터마크", "WebGPU 8×8 Haar-Walsh DM-QIM invisible watermark"),
        role: t(
          "64비트 창작자 페이로드와 키드 CRC-16 을 비가시 대역확산으로 각인하고 손실 섭동 뒤 복원·오키 거부를 수행합니다.",
          "Imprints a 64-bit creator payload + keyed CRC-16 with spread-spectrum DM-QIM and verifies recovery after perturbations.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/webgpu-invisible-watermark-imprinter.ts",
          "apps/web/src/domains/creator/wasm64-creator-defense-healer/wasm64-creator-defense-healer.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("가스비 ₩0 ECDSA+SHA-256 Merkle 불변 감사 원장", "Zero-gas ECDSA+SHA-256 Merkle provenance audit ledger"),
        role: t(
          "로컬 해시 체인·머클 포함 증명·ECDSA 서명과 1바이트 위변조의 블록·필드 단위 진단을 수행합니다.",
          "Maintains a local hash chain, Merkle inclusion proofs, ECDSA signatures and 1-byte tamper pinpointing.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/immutable-provenance-audit-ledger.ts",
          "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/wasm64-multipass-copilot-ledger.test.ts",
        ],
      },
      {
        feature: t("포스트-양자 SHA-256 WOTS++ECDSA 봉인 & 고주파 방어막", "Post-quantum SHA-256 WOTS++ECDSA seal & scraping shield"),
        role: t(
          "2,144 B WOTS+ 일회성 해시 서명과 ECDSA 하이브리드 봉인, 텍스트 보호 고주파 스크래핑 방어막을 제공합니다.",
          "Provides 2,144 B WOTS+ hash-based signatures paired with ECDSA and a text-safe high-frequency scraping shield.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/pq-hash-signature.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/adversarial-shield.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/wasm64-supergap-security-ops-hw.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("RFC-8391 WOTS+(w=16) 니블 분해 · 체크섬과 2,144 B 서명 크기 계산", "RFC-8391 WOTS+ (w=16) base-16 digits, checksum & 2,144 B sizing"),
        language: "ts",
        ...sampleSource([
          ["export const WOTS_N = 32; // SHA-256 digest bytes"],
          ["export const WOTS_LEN1 = 64; // 32 bytes * 2 nibbles"],
          ["export const WOTS_LEN2 = 3; // base-16 checksum digits"],
          [""],
          ["export function wotsPlusBase16Digits(digest32: Uint8Array): readonly number[] {"],
          ["  const digits: number[] = [];"],
          ["  let checksum = 0;"],
          ["  for (let i = 0; i < WOTS_N; i += 1) {"],
          ["    const byte = digest32[i] ?? 0;"],
          ["    const hi = (byte >>> 4) & 0x0f;"],
          ["    const lo = byte & 0x0f;"],
          ["    digits.push(hi, lo);"],
          ["    checksum += (15 - hi) + (15 - lo);", "위조 하향 이동을 막는 체크섬", "checksum blocks forging shorter chains"],
          ["  }"],
          ["  digits.push((checksum >>> 8) & 0x0f, (checksum >>> 4) & 0x0f, checksum & 0x0f);"],
          ["  return digits; // len = 67 -> 67 * 32 = 2,144 bytes"],
          ["}"],
        ]),
        explain: t(
          "SHA-256 32바이트를 4비트 니블 64개와 체크섬 3개(총 len=67)로 쪼개 각 32바이트 해시 체인을 밟아 2,144 B 양자내성 서명을 만들고 ECDSA P-256 서명과 함께 봉인합니다.",
          "Splits a 32-byte SHA-256 digest into 64 base-16 digits plus 3 checksum digits (len=67 × 32 B = 2,144 B) to build a hash-based WOTS+ signature paired with ECDSA P-256.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/pq-hash-signature.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "IETF RFC 8391 · XMSS: eXtended Merkle Signature Scheme (WOTS+)",
        url: "https://datatracker.ietf.org/doc/html/rfc8391",
        kind: "spec",
        note: t("해시 기반 포스트-양자 일회성 서명(WOTS+, w=16, len=67) 국제 표준", "IETF standard for hash-based post-quantum WOTS+ signatures"),
      },
      {
        title: "W3C · Web Cryptography API (ECDSA P-256 & SHA-256)",
        url: "https://www.w3.org/TR/WebCryptoAPI/",
        kind: "spec",
        note: t("무가스 로컬 감사 원장 서명과 다이제스트에 쓰는 브라우저 표준 암호 API", "Browser standard cryptographic API used for zero-gas ECDSA & SHA-256"),
      },
    ],
    chapterIds: ["licenses", "content-addressing", "troubleshooting-evidence"],
    talk: {
      pitch: t(
        "PSNR 46.58 dB 8×8 Haar-Walsh DM-QIM 비가시 워터마크, PSNR 44.85 dB 텍스트 보호 고주파 방어막, 3.065ms ₩0 ECDSA+Merkle 감사 원장, 2,144 B·16ms WOTS++ECDSA 포스트-양자 하이브리드 봉인으로 가스비 없이 창작자 권리를 입체적으로 증빙합니다.",
        "A 46.58 dB DM-QIM invisible watermark, 44.85 dB text-safe scraping shield, 3.065 ms zero-gas Merkle ledger and 2,144 B / 16 ms WOTS++ECDSA post-quantum seal prove creator provenance locally.",
      ),
      analogy: t(
        "지폐의 숨은 그림(DM-QIM 워터마크), 복사 방지 미세 패턴(고주파 방어막), 등기부 일련번호(Merkle 원장), 양자 시대 대비 이중 인감(WOTS++ECDSA)을 한 작품에 함께 찍는 보안 체계입니다.",
        "Like combining banknote hidden ink, anti-copy micro-patterns, a tamper-evident registry and dual post-quantum seals on one artwork.",
      ),
      questions: [
        {
          question: t("WOTS+ 일회성 키는 왜 같은 키로 두 번 서명하면 안 되나요?", "Why must a WOTS+ key never sign two different messages?"),
          answer: t(
            "일회성 해시 서명(OTS) 특성상 키를 재사용하면 해시 체인 중간값이 노출됩니다. 그래서 각 봉인마다 새 일회성 WOTS+ 키쌍을 생성하고 공개키 다이제스트를 ECDSA 하이브리드 봉인에 묶습니다.",
            "Reusing a one-time signature reveals intermediate hash-chain values, so each seal derives a fresh WOTS+ keypair bound into the ECDSA hybrid envelope.",
          ),
        },
        {
          question: t("고주파 방어막과 비가시 워터마크는 법적 효력이나 스크래핑 100% 차단을 보장하나요?", "Do the shield and watermark guarantee legal proof or stop all scraping?"),
          answer: t(
            "기술적 억지력과 무결성 증빙을 크게 높이지만, 강한 재압축·크롭 공격이나 법적 다툼은 별도 원본 프로젝트 보관·저작권 등록과 함께 운용해야 합니다.",
            "They raise deterrence and tamper evidence substantially, yet severe re-encoding or legal claims still require keeping original project archives and formal copyright registration.",
          ),
        },
      ],
      pitfall: t(
        "로컬 원장과 WOTS+ 봉인은 기기 안에서 위변조를 탐지하지만, 제3자 시점 증명(TSA)이나 외부 공개 신뢰 앵커가 필요하면 별도 공증 서비스와 결합해야 합니다.",
        "Local Merkle chains and WOTS+ seals prove internal integrity, whereas third-party timestamping (TSA) requires anchoring digests externally.",
      ),
    },
    technologies: ["WebCrypto", "WOTS+ (RFC 8391)", "Merkle Tree", "WebGPU WGSL"],
    facts: [
      {
        value: "46.58 dB / 100%",
        label: t("Haar-Walsh DM-QIM 비가시 워터마크 PSNR 및 섭동 후 복원율", "Haar-Walsh DM-QIM watermark PSNR & post-perturbation recovery"),
        source: "apps/web/src/domains/creator/wasm64-creator-defense-healer/webgpu-invisible-watermark-imprinter.ts",
      },
      {
        value: "3.065 ms (₩0 gas)",
        label: t("ECDSA+SHA-256 Merkle 원장 전체 무결성 검증 및 1바이트 특정", "Zero-gas ECDSA+SHA-256 Merkle ledger full check & 1-byte locate"),
        source: "apps/web/src/domains/creator/wasm64-multipass-copilot-ledger/immutable-provenance-audit-ledger.ts",
      },
      {
        value: "2,144 B / 16 ms",
        label: t("RFC-8391 스타일 SHA-256 WOTS+(w=16, len=67)+ECDSA 하이브리드 봉인", "RFC-8391-style SHA-256 WOTS+ (2,144 B) + ECDSA hybrid seal"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/pq-hash-signature.ts",
      },
      {
        value: "44.85 dB (0 text diff)",
        label: t("텍스트 영역 무변형 고주파 무단 스크래핑 방어막 실측 PSNR", "Text-preserving high-frequency scraping shield measured PSNR"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/adversarial-shield.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
  {
    id: "smart-license-guardian-subcanvas-delegation-ip-studio",
    category: "platform-ops",
    name: "License Guardian · Sub-Canvas Delegation · IP Derivative Studio",
    title: t("스마트 라이선스 가디언 · 서브캔버스 위임 · IP 2차 파생 스튜디오", "Smart license guardian, sub-canvas delegation & IP derivative studio"),
    status: "experimental",
    tagline: t(
      "권리 하드 차단·메타 주입, Zero-Trust 어시스턴트 위임·정산 BOM, 원클릭 4종 IP 굿즈 패키징을 로컬로 완결합니다.",
      "Combines hard license blocking, zero-trust sub-canvas delegation/BOM and 1-click 4-artifact IP derivative packaging locally.",
    ),
    background: [
      t(
        "스튜디오 팀이 어시스턴트에게 채색·배경을 외주 맡기거나 웹툰 IP 로 아크릴 스탠디·스프라이트·3D 턴테이블·트레일러를 파생 제작할 때, 전체 원고 유출·권한 밖 레이어 수정·만료/비상업 에셋 혼입·로열티 분배 누락이 법적·운영 분쟁으로 번집니다.",
        "When studios outsource coloring/backgrounds or spin off acrylic standees, sprites, 3D turntables and trailers, leaking full manuscripts, unauthorized layer edits, expired/NC assets and missing royalty splits spark disputes.",
      ),
      t(
        "SubCanvasDelegationManager(subcanvas-delegation.ts)는 마스터 문서에서 어시스턴트에게 허용된 컷과 레이어 역할만 AES-GCM 암호화 패키지로 떼어 내어 위임하고, 반납 병합 시 허용 범위 밖 컷·레이어 변조를 즉시 거부하며 작업량 기반 정산 BOM(AssistantSettlementBom)을 자동 산출합니다.",
        "SubCanvasDelegationManager exports only authorized cuts and layer roles into an AES-GCM package, rejects out-of-scope edits on merge, and computes a layer-level AssistantSettlementBom automatically.",
      ),
      t(
        "SmartLicenseGuardian(narrative-eye-flow-and-license-guardian.ts)은 유료 미리보기·EPUB·상업 내보내기 직전에 만료·비상업(NC)·좌석 초과·폰트 임베딩 금지 에셋을 하드 차단하고, 통과한 산출물에는 XMP·PNG iTXt(CRC-32 + IEND 직전 삽입)·EPUB OPF·C2PA 헤더를 자동 주입합니다.",
        "SmartLicenseGuardian blocks expired, non-commercial, over-seat and non-embeddable font assets prior to commercial export, injecting XMP, PNG iTXt (with CRC-32 before IEND), EPUB OPF and C2PA headers when cleared.",
      ),
      t(
        "packageCreatorIpDerivatives(creator-ip-derivative-studio.ts)는 원클릭으로 ① 아크릴 스탠디·굿즈 인쇄 CMYK(TAC ≤ 300% · 도련/칼선), ② 알파 크롭 캐릭터 스프라이트 매니페스트, ③ glTF Y-up 360° 턴테이블 키프레임, ④ 15초 AudioToon 트레일러 큐시트·WebVTT 자막을 생성하고 SHA-256 Rights BOM 봉인(1바이트 변조 즉시 감지)으로 묶습니다. 현재 구현·실측 완료(Current): 전 모듈 단위 테스트 통과. 로드맵(Target): 스튜디오 팀 정산 UI 및 굿즈 내보내기 마법사 연결이 예정돼 있습니다.",
        "packageCreatorIpDerivatives bundles four artifacts in one click—CMYK TAC<=300% print standee specs, alpha-cropped sprites, 360° glTF Y-up turntable keyframes and a 15 s AudioToon trailer cue sheet—sealed with a tamper-evident SHA-256 Rights BOM. Current vs Roadmap: all modules pass tests; team payout UI and wizard wiring are phased.",
      ),
    ],
    keyPoints: [
      t("스마트 라이선스 가디언: 만료·NC·좌석·폰트 하드 차단 + XMP/iTXt/C2PA", "Smart license guardian: hard blocks NC/expired/fonts + XMP/iTXt"),
      t("Zero-Trust 서브캔버스 위임: 미허용 컷·레이어 변조 거부 + 정산 BOM", "Zero-trust sub-canvas delegation: rejects scope drift + payout BOM"),
      t("원클릭 IP 4종 파생: CMYK 스탠디·스프라이트·360° 턴테이블·15초 트레일러", "1-click 4 IP outputs: CMYK standee, sprites, 360° rig, 15s trailer"),
      t("SHA-256 Rights BOM 로열티 봉인(1바이트 변조 즉시 검증 실패)", "SHA-256 Rights BOM & royalty seal fails on any 1-byte tamper"),
    ],
    diagram: {
      id: "smart-license-guardian-subcanvas-delegation-ip-studio-diagram",
      kind: "sequence",
      title: t("서브캔버스 위임 · 라이선스 하드 차단 · IP 4종 파생 봉인 흐름", "Sub-canvas delegation, license hard-block & 4-way IP sealing"),
      caption: t(
        "위임 범위·상업 라이선스·로열티 합계를 모두 통과한 원고만 4종 IP 파생 번들과 SHA-256 봉인으로 나갑니다.",
        "Only work clearing delegation scope, commercial rights and royalty splits is packaged into sealed 4-way IP derivatives.",
      ),
      alt: t(
        "마스터 작가가 허용 컷·레이어만 AES-GCM 으로 어시스턴트에게 위임하고 병합 시 범위 밖 변조를 차단하며 정산 BOM 을 계산합니다. 이어서 스마트 라이선스 가디언이 만료·비상업·좌석초과·폰트 임베딩 위반을 하드 차단하고 XMP·PNG iTXt·C2PA 를 주입한 뒤, IP 파생 스튜디오가 CMYK 아크릴 스탠디·스프라이트·360도 턴테이블·15초 AudioToon 트레일러와 SHA-256 Rights BOM 봉인을 출력합니다.",
        "The lead artist delegates scoped cuts/layers via AES-GCM, validates returns while computing a settlement BOM, runs SmartLicenseGuardian to hard-block expired/NC/font violations and inject XMP/iTXt/C2PA, and outputs a SHA-256 sealed 4-way IP bundle (CMYK standee, sprites, 360° turntable and 15 s AudioToon trailer).",
      ),
      actors: [
        { id: "lead", label: t("마스터 작가", "Lead creator"), sub: t("원본 마스터 캔버스", "Master document"), tone: "local" },
        { id: "sub", label: t("서브캔버스 위임", "Sub-canvas"), sub: t("AES-GCM · 정산 BOM", "AES-GCM, payout BOM"), tone: "warn" },
        { id: "guard", label: t("라이선스 가디언", "License guard"), sub: t("만료·NC·폰트 차단", "Blocks NC/expired"), tone: "good" },
        { id: "ip", label: t("IP 파생 스튜디오", "IP studio"), sub: t("4종 산출물·SHA-256", "4 artifacts, SHA-256"), tone: "edge" },
      ],
      messages: [
        { from: "lead", to: "sub", label: t("허용 컷·레이어만 암호화 위임", "Delegate scoped cuts & layers") },
        { from: "sub", to: "lead", label: t("범위 검사 후 병합 + 정산 BOM", "Verify scope, merge & emit BOM"), style: "dashed" },
        { from: "lead", to: "guard", label: t("상업 권리·폰트·좌석 전수 심사", "Audit commercial rights & fonts") },
        { from: "guard", to: "ip", label: t("통과 시 XMP·iTXt·C2PA 주입", "Inject XMP/iTXt/C2PA on pass") },
        { from: "ip", to: "lead", label: t("CMYK·스프라이트·360°·15s 봉인", "Emit sealed 4-way IP bundle"), style: "dashed", note: t("1B 변조 즉시 감지", "detects 1B tamper") },
      ],
    },
    usage: [
      {
        feature: t("스마트 라이선스 가디언 & XMP/PNG iTXt/EPUB/C2PA 주입기", "Smart license guardian & XMP/PNG iTXt/EPUB/C2PA injector"),
        role: t(
          "유료 연재·EPUB 내보내기 직전 만료·비상업·좌석초과·폰트 임베딩 금지 에셋을 차단하고 출판 메타데이터를 삽입합니다.",
          "Hard-blocks invalid asset licenses before export and injects CRC-32 PNG iTXt, XMP, EPUB OPF and C2PA headers.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/narrative-eye-flow-and-license-guardian.ts",
          "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/wasm64-foveated-haptic-narrative.test.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("Zero-Trust 서브캔버스 부분 위임 & 정산 BOM", "Zero-trust sub-canvas delegation & settlement BOM"),
        role: t(
          "허용 컷·레이어만 AES-GCM 으로 위임하고 미허용 변조를 거부하며 어시스턴트 정산 BOM 을 산출합니다.",
          "Scopes delegated workspaces with AES-GCM, blocks unauthorized edits on merge and outputs settlement BOMs.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/subcanvas-delegation.ts",
          "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/wasm64-supergap-security-ops-hw.test.ts",
        ],
      },
      {
        feature: t("원클릭 창작자 IP 2차 저작 파생 스튜디오 (4종 + SHA-256 봉인)", "One-click creator IP derivative studio (4 outputs + SHA-256 seal)"),
        role: t(
          "아크릴 스탠디 CMYK(TAC ≤ 300%)·알파 크롭 스프라이트·360° 턴테이블·15초 AudioToon 트레일러와 Rights BOM 봉인을 생성합니다.",
          "Packages CMYK standee specs, alpha-cropped sprites, 360° turntables and 15 s AudioToon trailers with SHA-256 Rights BOM seals.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/creator-ip-derivative-studio.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/ip-derivative-print-and-sprite.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/ip-derivative-turntable-and-trailer.ts",
          "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/wasm64-supergap-global-ip-branch.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("서브캔버스 위임 범위 검사와 상업 라이선스 하드 차단", "Scoped sub-canvas authorization & commercial license hard gate"),
        language: "ts",
        ...sampleSource([
          ["export interface AssetLicense { readonly id: string; readonly commercialOk: boolean; readonly expiresAtMs: number; }"],
          [""],
          ["export function assertExportScopeAndRights("],
          ["  allowedCutIds: ReadonlySet<string>,"],
          ["  editedCutIds: readonly string[],", "어시스턴트가 제출한 수정 컷 목록", "cuts modified by assistant"],
          ["  assets: readonly AssetLicense[],"],
          ["  nowMs: number,"],
          ["): readonly string[] {"],
          ["  const errors: string[] = [];"],
          ["  for (const cutId of editedCutIds) if (!allowedCutIds.has(cutId)) errors.push(`scope:${cutId}`);"],
          ["  for (const asset of assets) {"],
          ["    if (!asset.commercialOk || asset.expiresAtMs < nowMs) errors.push(`license:${asset.id}`);"],
          ["  }"],
          ["  return errors;", "오류가 1건이라도 있으면 내보내기 차단", "non-empty array blocks export"],
          ["}"],
        ]),
        explain: t(
          "서브캔버스 위임 병합과 상업 IP 파생 패키징 모두 허용 범위 밖 수정이나 만료·비상업 에셋이 1건이라도 섞이면 결과를 만들지 않고 위반 사유를 구체적으로 돌려줍니다.",
          "Both sub-canvas merge and IP derivative packaging refuse output and report exact violation codes if any out-of-scope edit or expired/NC asset is detected.",
        ),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/subcanvas-delegation.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "W3C · PNG Specification (iTXt International Textual Data Chunk)",
        url: "https://www.w3.org/TR/png-3/#11iTXt",
        kind: "spec",
        note: t("PNG IEND 직전에 CRC-32 와 함께 삽입하는 라이선스·XMP iTXt 청크 규격", "PNG iTXt chunk format with CRC-32 inserted before IEND"),
      },
      {
        title: "W3C · WebVTT: The Web Video Text Tracks Format",
        url: "https://www.w3.org/TR/webvtt1/",
        kind: "spec",
        note: t("15초 AudioToon 트레일러 큐시트가 함께 생성하는 자막 트랙 표준", "Subtitle track standard emitted by the 15-second AudioToon trailer"),
      },
    ],
    chapterIds: ["licenses", "share-distribution-boundary", "content-addressing"],
    talk: {
      pitch: t(
        "스마트 라이선스 가디언이 만료·비상업·좌석초과·폰트 임베딩 위반을 내보내기 직전 하드 차단하고, Zero-Trust 서브캔버스 위임이 어시스턴트 수정 범위와 정산 BOM 을 자동 검증하며, 원클릭 IP 스튜디오가 CMYK 스탠디·스프라이트·360° 턴테이블·15초 트레일러를 SHA-256 봉인으로 묶습니다.",
        "SmartLicenseGuardian hard-blocks expired/NC/font violations, SubCanvasDelegation enforces assistant scope with payout BOMs, and the 1-click IP studio outputs 4 sealed commercial derivative bundles.",
      ),
      analogy: t(
        "어시스턴트에게는 자기 담당 페이지 복사본만 봉인해 건네고(서브캔버스), 출고 직전에는 세관원(라이선스 가디언)이 전수 검사한 뒤 굿즈·트레일러 4종 포장 상자에 봉인 테이프(SHA-256 Rights BOM)를 붙이는 공정입니다.",
        "Like handing assistants sealed copies of only their pages, clearing customs with a license inspector, and sealing four merch/trailer boxes with tamper-evident tape.",
      ),
      questions: [
        {
          question: t("IP 파생 스튜디오가 실제 인쇄용 PDF 나 MP4 영상을 바로 렌더링해 주나요?", "Does the IP studio directly render press PDFs or MP4 videos?"),
          answer: t(
            "현재 모듈은 인쇄 도련·칼선·CMYK TAC ≤ 300% 규격, 알파 크롭 스프라이트 좌표, glTF 360° 카메라 키프레임, 15초 WebVTT·AudioToon 큐시트와 SHA-256 Rights BOM 봉인까지 결정론적으로 산출하며, 실제 인코더 결합은 다음 단계입니다.",
            "The verified module deterministically generates print bleed/cutline CMYK specs, alpha-cropped sprite manifests, 360° glTF camera keyframes, 15 s AudioToon/WebVTT cue sheets and SHA-256 seals; media encoder wiring follows next.",
          ),
        },
        {
          question: t("로열티 분배 합계가 100% 를 넘거나 모자라면 어떻게 되나요?", "What happens if royalty splits do not sum to 100%?"),
          answer: t(
            "packageCreatorIpDerivatives 가 로열티 합계 오류와 NC·오디오·3D 라이선스 위반을 즉시 규정 위반 항목으로 보고하고 봉인을 차단합니다.",
            "packageCreatorIpDerivatives flags royalty-sum mismatches alongside NC, audio and 3D license violations before sealing.",
          ),
        },
      ],
      pitfall: t(
        "라이선스 가디언은 등록된 Rights BOM 메타데이터를 정확히 집행하지만, 계약서 법률 해석 자체를 대신하지 않으므로 상업 계약 최종 확인은 권리 당사자가 직접 검토해야 합니다.",
        "License guardians enforce declared Rights BOM metadata strictly, not legal counsel; commercial contracts still require human legal review.",
      ),
    },
    technologies: ["Rights BOM", "AES-GCM", "PNG iTXt / C2PA", "CMYK TAC 300%"],
    facts: [
      {
        value: "XMP · iTXt · OPF · C2PA",
        label: t("라이선스 심사 통과 시 출판 메타데이터 자동 주입(위반 시 하드 차단)", "Auto-injected compliance metadata on pass; hard block on violation"),
        source: "apps/web/src/domains/creator/wasm64-foveated-haptic-narrative/narrative-eye-flow-and-license-guardian.ts",
      },
      {
        value: "AES-GCM + Payout BOM",
        label: t("Zero-Trust 서브캔버스 허용 컷·레이어 부분 위임 및 정산 BOM", "Zero-trust AES-GCM sub-canvas delegation & assistant payout BOM"),
        source: "apps/web/src/domains/creator/wasm64-supergap-security-ops-hw/subcanvas-delegation.ts",
      },
      {
        value: "4 IP Bundles + SHA-256",
        label: t("CMYK 스탠디(TAC≤300%) · 스프라이트 · 360° 턴테이블 · 15s 트레일러", "CMYK standee (TAC<=300%), sprites, 360° rig & 15 s trailer"),
        source: "apps/web/src/domains/creator/wasm64-supergap-global-ip-branch/creator-ip-derivative-studio.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
