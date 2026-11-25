import type { ExternalBridgeSpec, RoundtripFidelityStatus, RoundtripFieldMapping } from "./visual-pin-review-engine";

function mapRow(
  id: string, status: RoundtripFidelityStatus, featureKo: string, featureEn: string,
  detailKo: string, detailEn: string, workaroundKo: string, workaroundEn: string,
): RoundtripFieldMapping {
  return { id, status, featureKo, featureEn, detailKo, detailEn, workaroundKo, workaroundEn };
}

export const EXTERNAL_BRIDGE_SPECS: readonly [ExternalBridgeSpec, ...ExternalBridgeSpec[]] = [
  {
    id: "csp-psd-layers", toolNameKo: "클립스튜디오 (CSP)", toolNameEn: "Clip Studio Paint", shortNameKo: "클립스튜디오", shortNameEn: "CSP",
    openStandardFormatKo: "공개 표준 .psd (레이어 계층) + .pins.json 사이드카", openStandardFormatEn: "Open Standard .psd (Layer Stack) + .pins.json Sidecar",
    fileExtension: ".psd", mimeType: "image/vnd.adobe.photoshop", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유 바이너리 .clip 포맷 역공학·우회 없음", avoidedProprietaryFormatEn: "No proprietary .clip binary reverse-engineering or bypass",
    summaryKo: "래스터 레이어·폴더·블렌드 모드를 공개 .psd로 넘기고 컷 핀 좌표를 JSON으로 동반 저장합니다.",
    summaryEn: "Exchanges raster layers, folders, and blend modes via standard .psd with a pin-coordinate JSON sidecar.",
    mappings: [
      mapRow("csp-layers", "preserved", "래스터 레이어 · 폴더 계층 · 불투명도", "Raster Layers, Folders & Opacity", "01_LINE~07_TEXT 구조와 잠금·표시 상태를 1:1로 유지합니다.", "Preserves 01_LINE..07_TEXT folder hierarchy, visibility, and opacity 1:1.", "CSP에서 바로 열어 추가 정리 없이 작업", "Open directly in CSP with no manual restacking"),
      mapRow("csp-blends", "preserved", "표준 블렌드 모드 (곱하기·스크린·오버레이)", "Standard Blend Modes (Multiply / Screen / Overlay)", "PSD 공통 블렌드 키로 매핑되어 색 변화 없이 열립니다.", "Maps cleanly to shared PSD blend keys without tonal shift.", "CSP 전용 Add(Glow) 사용 시 발광 메모 병기", "Add note when substituting CSP-only Add(Glow)"),
      mapRow("csp-pins", "preserved", "캔버스 검수 핀 좌표 · 6종 도장 메타", "Canvas Pin Coordinates & 6 Stamp Metadata", "동반 .pins.json 파일과 가이드 레이어 라벨로 위치를 유지합니다.", "Preserved via .pins.json sidecar plus optional top guide layer.", "수정본 .psd 재가져오기 시 기존 핀 그대로 비교", "Re-import updated .psd into ToonStudio to compare against pins"),
      mapRow("csp-vector", "flattened", "CSP 벡터 선화 · 스크린톤 파라미터", "CSP Vector Ink & Screentone Parameters", "공개 .psd 한계로 벡터 제어점과 톤 주파수는 래스터로 평탄화됩니다.", "Open .psd flattens vector control points and live screentone frequencies.", "재편집용 마스터 벡터는 ToonStudio 스냅샷에 보관", "Keep master vector snapshot inside ToonStudio for re-inking"),
      mapRow("csp-3d", "approximated", "3D 소재 · 포즈 레이어 연동", "3D Pose & Asset Layers", "2D 투영 기준선 래스터로 변환하고 카메라 FOV를 JSON에 기록합니다.", "Exported as 2D reference raster while preserving camera FOV in JSON.", "3D 구도 수정은 Blender .glb 브리지와 병행", "Pair with Blender .glb bridge when camera edits are needed"),
    ],
  },
  {
    id: "photoshop-psd-cmyk", toolNameKo: "포토샵 (CMYK 인쇄)", toolNameEn: "Adobe Photoshop (CMYK)", shortNameKo: "포토샵", shortNameEn: "Photoshop",
    openStandardFormatKo: "공개 표준 .psd + ICC 프로파일 메타 + 대사 JSON", openStandardFormatEn: "Open Standard .psd + ICC Profile Metadata + Script JSON",
    fileExtension: ".psd", mimeType: "image/vnd.adobe.photoshop", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유 클라우드 .psdc 프로토콜 우회 없음", avoidedProprietaryFormatEn: "No proprietary .psdc cloud protocol bypass",
    summaryKo: "단행본·굿즈 인쇄용 300/350 DPI 분리 레이어와 CMYK 색역 주의 항목을 공개 .psd로 묶습니다.",
    summaryEn: "Packages print-ready 300/350 DPI separated layers and CMYK gamut notes via standard .psd.",
    mappings: [
      mapRow("ps-masks", "preserved", "레이어 그룹 · 클리핑 마스크 · 알파 채널", "Layer Groups, Clipping Masks & Alpha", "단행본 표지·내지 후가공 분리 작업에 필요한 마스크를 유지합니다.", "Maintains mask hierarchy required for print finishing separation.", "출판사 도련 3mm 안전선 체크리스트 동봉", "Include 3mm bleed checklist for print vendor handoff"),
      mapRow("ps-dpi", "preserved", "300/350 DPI 해상도 · 재단선 가이드", "300/350 DPI Resolution & Trim Guides", "인쇄 해상도 헤더와 안전선 좌표를 정확히 기록합니다.", "Writes exact print DPI header and safe-area guide coordinates.", "웹 연재용 sRGB 원본과 단행본 폴더 분리", "Keep web sRGB master separate from print folder"),
      mapRow("ps-cmyk", "approximated", "sRGB → CMYK 색역 변환 (Japan Color 2001 기준)", "sRGB to CMYK Gamut Mapping", "고채도 형광·네온 발광색은 인쇄 가능한 CMYK 색역으로 완만히 조정됩니다.", "High-chroma neon tones compress to printable CMYK gamut.", "sRGB 마스터 보관 후 소프트 프루핑으로 톤 보정", "Retain sRGB master and tune midtones with soft proofing"),
      mapRow("ps-text", "approximated", "말풍선 · 효과음 식자 레이어", "Balloon & SFX Typography Layers", "폰트 깨짐 방지를 위해 위치 가이드 + UTF-8 대사 JSON을 병행합니다.", "Pairs guide placement with UTF-8 script JSON to prevent font drift.", "외주처 설치 폰트 목록을 브리프에 함께 기입", "List licensed studio font families in the handoff brief"),
      mapRow("ps-smart", "flattened", "외부 링크 스마트 오브젝트 · 라이브 필터", "Linked Smart Objects & Live Filters", "인쇄 오차 방지를 위해 비표준 필터 체인은 픽셀 베이크로 내보냅니다.", "Non-standard live filter chains bake to pixels for deterministic output.", "원본 이펙트 파라미터는 매니페스트 JSON에 참고 기록", "Effect parameters stay documented in the manifest JSON"),
    ],
  },
  {
    id: "blender-glb-camera", toolNameKo: "블렌더 (3D 배경)", toolNameEn: "Blender (3D Scene)", shortNameKo: "블렌더", shortNameEn: "Blender",
    openStandardFormatKo: "Khronos 공개 표준 glTF 2.0 (.glb) + 카메라·투시 핀 JSON", openStandardFormatEn: "Khronos Open Standard glTF 2.0 (.glb) + Camera & Pin JSON",
    fileExtension: ".glb", mimeType: "model/gltf-binary", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유/내부 .blend DNA 바이너리 직접 파싱 우회 없음", avoidedProprietaryFormatEn: "No proprietary .blend internal DNA binary bypass",
    summaryKo: "3D 배경 메시·미터 스케일·카메라 FOV와 투시 수정 핀을 Khronos glTF 2.0 표준으로 왕복합니다.",
    summaryEn: "Round-trips 3D set geometry, meter scale, camera FOV, and perspective pins via Khronos glTF 2.0.",
    mappings: [
      mapRow("bl-mesh", "preserved", "메시 토폴로지 · 1m 스케일 · 바닥 접지(Y=0)", "Mesh Topology, 1m Scale & Y=0 Grounding", "Blender Z-Up ↔ glTF Y-Up 축 변환과 실측 미터 단위를 정규화합니다.", "Normalizes Z-Up to glTF Y-Up coordinates with exact 1.0 = 1m scale.", "Blender 내보내기 시 Apply Transform · +Y Up 유지", "Keep Apply Transform and +Y Up enabled on Blender export"),
      mapRow("bl-camera", "preserved", "컷 카메라 FOV · 아이레벨 · 투시 핀 좌표", "Cut Camera FOV, Eye-Level & Perspective Pins", "glTF 카메라 노드와 bg-perspective 핀 좌표를 동기화해 재촬영 오차를 막습니다.", "Syncs glTF camera node with bg-perspective pin coordinates.", "배경 어시가 JSON FOV 값만 맞춰 동일 화각 재렌더", "Set assistants match FOV from JSON to re-render exact framing"),
      mapRow("bl-pbr", "preserved", "PBR 기본 머티리얼 (BaseColor·Roughness·Normal)", "PBR Materials (BaseColor / Roughness / Normal)", "Principled BSDF 표준 슬롯이 glTF 2.0 Metallic-Roughness와 직접 호환됩니다.", "Principled BSDF channels map directly to glTF Metallic-Roughness.", "텍스처는 .glb 내부 임베드로 경로 깨짐 방지", "Embed textures inside .glb to avoid broken relative links"),
      mapRow("bl-nodes", "flattened", "절차적 셰이더 그래프 · 지오메트리 노드", "Procedural Shader & Geometry Nodes", "Blender 고유 노드 트리는 .glb 반출 전 베이크된 메시·텍스처로 평탄화됩니다.", "Blender-specific node graphs flatten into baked meshes and textures.", "노드 편집용 .blend 마스터는 팀 폴더에서 별도 버전 관리", "Version-control master .blend graphs alongside baked .glb"),
      mapRow("bl-freestyle", "approximated", "Freestyle / Grease Pencil 윤곽선 패스", "Freestyle / Grease Pencil Outline Pass", "ToonStudio 2D 선화 추출(LT) 파라미터 힌트로 근사 치환됩니다.", "Approximated via ToonStudio 2D line-extraction (LT) pass hints.", "05_BG3D 임포트 후 스튜디오 툰 라인 강도로 미세 조정", "Fine-tune line weight inside ToonStudio after importing 05_BG3D"),
    ],
  },
  {
    id: "figma-tokens-json", toolNameKo: "피그마 (UI · 타이포 토큰)", toolNameEn: "Figma (Design Tokens)", shortNameKo: "피그마", shortNameEn: "Figma",
    openStandardFormatKo: "W3C Design Tokens JSON (.tokens.json) + 프레임 주석 좌표", openStandardFormatEn: "W3C Design Tokens JSON (.tokens.json) + Frame Pin Coordinates",
    fileExtension: ".tokens.json", mimeType: "application/json", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "비공개 .fig 바이너리 파싱·우회 없음", avoidedProprietaryFormatEn: "No private .fig binary parsing or bypass",
    summaryKo: "타이틀 로고·말풍선 타이포·시맨틱 색 역할과 검수 핀 좌표를 W3C 표준 JSON 토큰으로 교환합니다.",
    summaryEn: "Exchanges typography scales, semantic color roles, and review pin coordinates via W3C Design Tokens JSON.",
    mappings: [
      mapRow("fg-tokens", "preserved", "말풍선 타이포 스케일 · 여백 · 라운드 토큰", "Balloon Typography, Spacing & Radius Tokens", "W3C DTCG JSON 키-값 규격으로 썸네일·편집 팀과 오차 없이 공유합니다.", "Shares exact W3C DTCG JSON keys with thumbnail and editorial teams.", "Figma Variables Import 또는 공개 토큰 플러그인으로 반영", "Import directly into Figma Variables or open token plugins"),
      mapRow("fg-pins", "preserved", "컷 상대 좌표(0..100%) 검수 핀 주석", "Normalized (0..100%) Review Pin Annotations", "해상도가 달라도 컷 비율 기준 백분율 좌표로 정확히 같은 지점을 가리킵니다.", "Percentage coordinates stay aligned across desktop and mobile frames.", "썸네일 A/B 피드백도 동일 핀 번호로 추적", "Track thumbnail A/B feedback with the exact same pin numbers"),
      mapRow("fg-semantic", "preserved", "시맨틱 색상 역할 (accent·good·warn·bad)", "Semantic Color Roles (accent / good / warn / bad)", "원시 코드 하드코딩 대신 의미 역할명으로 매핑해 테마 일관성을 지킵니다.", "Maps semantic roles rather than hardcoded swatches for theme parity.", "OKLCH 팔레트 기준 문서와 함께 관리", "Reference OKLCH palette specification on theme updates"),
      mapRow("fg-autolayout", "approximated", "Figma Auto Layout · 컴포넌트 배리언트", "Figma Auto Layout & Component Variants", "프레임 폭·간격 토큰과 컷 순서 메타데이터로 근사 매핑됩니다.", "Approximated as frame dimension tokens and ordered cut metadata.", "반응형 규칙은 피그마 컴포넌트 세트에서 유지", "Keep responsive rules authored inside Figma component sets"),
      mapRow("fg-proto", "flattened", "인터랙티브 프로토타입 플로우 링크", "Interactive Prototype Flow Links", "정적 컷 시퀀스 및 6단계 바통 상태 체크리스트로 단순화됩니다.", "Flattens into ordered cut sequence and 6-stage baton status.", "독자 스크롤 연출은 ToonStudio 모바일 뷰어에서 검증", "Verify reader scroll pacing in ToonStudio mobile preview"),
    ],
  },
  {
    id: "slack-notion-digest", toolNameKo: "슬랙 · 노션 (협업 요약)", toolNameEn: "Slack & Notion Digest", shortNameKo: "슬랙·노션", shortNameEn: "Slack / Notion",
    openStandardFormatKo: "CommonMark Markdown (.md) + 1줄 바통 요약 JSON", openStandardFormatEn: "CommonMark Markdown (.md) + 1-Line Baton Summary JSON",
    fileExtension: ".md", mimeType: "text/markdown", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "외부 OAuth 강제·비공개 API 스크래핑 우회 없음", avoidedProprietaryFormatEn: "No forced external OAuth scraping or private API bypass",
    summaryKo: "장황한 글 대신 1줄 바통 상태·번호 핀 표·담당자 할 일을 복사 1번으로 슬랙·노션에 붙여넣습니다.",
    summaryEn: "Generates paste-ready 1-line baton alerts and numbered pin tables for Slack and Notion with zero auth friction.",
    mappings: [
      mapRow("sn-oneline", "preserved", "바통터치 승계·차단 1줄 요약 알림", "1-Line Baton Gate Notification", "현재 공정·미해결 핀 번호·다음 담당자를 한 줄로 압축해 채널 노이즈를 줄입니다.", "Compresses stage, blocking pin numbers, and next owner into one line.", "슬랙 스레드 제목 또는 노션 회차 보드 상태 줄에 즉시 붙여넣기", "Paste directly into Slack thread header or Notion episode status"),
      mapRow("sn-table", "preserved", "번호 핀 좌표 · 도장 · 1줄 코멘트 체크표", "Numbered Pin, Stamp & Comment Checklist Table", "CommonMark 체크박스와 표 문법으로 노션·슬랙에서 깨지지 않습니다.", "Uses standard CommonMark checkboxes and tables compatible with Notion.", "해결 핀은 [x], 미해결 핀은 [ ]로 한눈에 구분", "Resolved pins render as [x] and open pins as [ ]"),
      mapRow("sn-owners", "preserved", "공정·담당자별 남은 작업 집계", "Per-Stage & Assignee Open Count", "어시스턴트·식자·PD별로 자신이 해결할 핀만 빠르게 추려냅니다.", "Groups remaining pins by stage owner for fast handoff triage.", "마감 전 1줄 요약 복사로 일일 공유 대체", "Use 1-line copy as a lightweight daily standup update"),
      mapRow("sn-sync", "approximated", "실시간 양방향 댓글 동기화", "Live Two-Way Thread Sync", "무인증·오프라인 환경 보호를 위해 단방향 스냅샷 복사 및 JSON으로 동작합니다.", "Operates as offline-safe one-way snapshot copy and JSON export.", "실제 해결 토글은 ToonStudio 핀 보드를 단일 기준으로 유지", "Keep ToonStudio pin board as single source of truth for status"),
      mapRow("sn-image", "flattened", "원본 컷 고해상도 이미지 바이트", "High-Res Cut Image Payload", "메신저 용량 부담을 줄이기 위해 컷 ID와 백분율 좌표 (x%, y%)로 요약합니다.", "Replaces heavy image blobs with cut IDs and (x%, y%) coordinate refs.", "이미지가 필요할 때만 .psd / PNG 컷 캡처를 별도 첨부", "Attach cut preview PNG separately only when visual context is needed"),
    ],
  },
];

