import type { BilingualCopy, ComparisonAxis } from "./competitor-comparison-profiles";

const bi = (ko: string, en: string): BilingualCopy => ({ ko, en });

export const COMPARISON_AXES_WORKFLOW: readonly ComparisonAxis[] = [
  {
    id: "lettering-delivery",
    order: 3,
    tabLabel: bi("③ 식자·연출·납품", "3. Lettering & Delivery"),
    title: bi("웹툰 식자 · 연출 · Rights BOM 납품 패키지", "Webtoon Lettering, Pacing & Rights BOM Delivery"),
    subtitle: bi(
      "타원 말풍선 최적 줄나눔, 세로쓰기·루비, 상업 저작권 검증(Fail-Closed), 플랫폼 규격 분할 출고 비교",
      "Comparing elliptical balloon typesetting, vertical ruby text, fail-closed Rights BOM & platform slice export",
    ),
    whenToUseGuide: bi(
      "단행본 CMYK 인쇄 마스터링은 Photoshop·InDesign, 일본 잡지형 전통 식자 관행은 CSP EX가 익숙합니다. ToonStudio는 한국어 어절 무결성 타원 말풍선 조판(Knuth-Plass DP)부터 4대 플랫폼(네이버·카카오·레진·글로벌) 안전 슬라이스 및 상업 저작권 차단(Rights BOM)까지 출고 직전 사고를 자동 차단합니다.",
      "Use Photoshop/InDesign for CMYK print mastering or CSP EX for traditional manga print habits. Use ToonStudio to automate Korean elliptical balloon typesetting (Knuth-Plass DP), 4-platform safe slicing & fail-closed commercial Rights BOM audits.",
    ),
    criteria: [
      {
        id: "knuth-plass-balloon",
        title: bi("타원 말풍선 최적 조판 (Knuth-Plass 2D DP)", "Elliptical Balloon Typesetting (Knuth-Plass 2D DP)"),
        summary: bi(
          "말풍선 곡률에 맞춘 자동 줄나눔, 한국어 keep-all 어절 보호, 광학 커닝·고아줄 억제",
          "Curvature-aware line breaking, Korean keep-all word integrity, optical kerning & widow prevention",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "클린룸 2D Knuth-Plass 타원 현(chord) DP 엔진 + 행두·행말 금칙·단독 조사 분리 방지·문장부호 광학 커닝 구현 및 단위 테스트 통과",
            "Clean-room 2D Knuth-Plass elliptical chord DP engine with Korean kinsoku, bound particle guards & optical kerning verified by tests",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/typesetting-pro/studio-knuth-plass-balloon-typeset.ts",
            "apps/web/src/domains/creator/typesetting-pro/studio-knuth-plass-balloon-typeset.test.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("타원 현 2D DP 조판", "Elliptical 2D DP"),
            detail: bi("한국어 keep-all·조사 보호·광학 여백 자동 계산", "Korean keep-all, particle guards & optical margin"),
          },
          csp: {
            status: "limited",
            label: bi("수동 엔터·기본 래핑", "Manual breaks / box wrap"),
            detail: bi("말풍선 자동 연계는 우수하나 타원 곡률 DP 줄나눔은 수동", "Good balloon tools, but line shaping is mostly manual"),
          },
          procreate: {
            status: "limited",
            label: bi("기본 텍스트 박스", "Basic text box"),
            detail: bi("만화 말풍선 전용 식자·금칙 처리 부재", "No comic balloon typesetting or kinsoku rules"),
          },
          photoshop: {
            status: "limited",
            label: bi("문단 컴포저(사각 중심)", "Paragraph composer"),
            detail: bi("영문 타이포 강력, 타원 말풍선 자동 조판은 패스 수작업", "Strong typography, requires manual shape paths for balloons"),
          },
          rebelle: { status: "none", label: bi("식자 미제공", "No lettering"), detail: bi("텍스트 조판 기능 없음", "No text layout engine") },
          blender: { status: "none", label: bi("웹툰 식자 영역 외", "Out of scope"), detail: bi("3D 텍스트 오브젝트 전용", "3D text meshes only") },
          creco: { status: "none", label: bi("대사 메모·검수만", "Review comments only"), detail: bi("캔버스 직접 식자 아님", "No canvas typesetting") },
          acon3d: { status: "none", label: bi("미제공", "None"), detail: bi("3D 소재 마켓", "3D marketplace") },
        },
      },
      {
        id: "tategaki-ruby",
        title: bi("세로쓰기(Tategaki) · 루비(후리가나) 충돌 회피", "Vertical Text (Tategaki) & Ruby Collision Avoidance"),
        summary: bi(
          "일본·글로벌 수출용 우→좌 세로쓰기, 2자리 숫자 세로중가로, 루비 겹침 자동 해소",
          "Right-to-left vertical columns, tate-chu-yoko digits & PAVA ruby non-overlap for JP/global export",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "우→좌 열 배치, 괄호·장음부호 90° 회전, 세로중가로(tate-chu-yoko), PAVA O(m) 루비 비겹침 엔진 및 검증기 구현 완료",
            "RTL vertical columns, 90° punctuation rotation, tate-chu-yoko & PAVA O(m) ruby overlap solver implemented and tested",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/typesetting-pro/studio-tategaki-ruby-layout.ts",
            "apps/web/src/domains/creator/typesetting-pro/studio-tategaki-ruby-layout.test.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("세로쓰기 + PAVA 루비", "Tategaki + PAVA ruby"),
            detail: bi("인라인 루비 파싱·세로중가로·열 피치 자동 확장", "Inline ruby parser, tate-chu-yoko & auto column pitch"),
          },
          csp: {
            status: "native-strength",
            label: bi("일본 만화 식자 표준", "JP manga standard"),
            detail: bi("세로쓰기·루비·스토리 에디터 일괄 관리 매우 성숙", "Mature vertical text, ruby & Story Editor batch text"),
          },
          procreate: { status: "none", label: bi("세로쓰기·루비 약함", "No ruby/tategaki"), detail: bi("CJK 출판 조판 미지원", "Lacks CJK comic typography") },
          photoshop: {
            status: "native-strength",
            label: bi("CJK 타이포 엔진 내장", "CJK type engine"),
            detail: bi("동아시아 세로쓰기·루비·합자 제어 정밀", "Precise East Asian vertical text & ruby controls"),
          },
          rebelle: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          blender: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          creco: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          acon3d: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
        },
      },
      {
        id: "rights-bom-preflight",
        title: bi("출고 전 Rights BOM 상업 저작권 자동 감사", "Fail-Closed Rights BOM Commercial Audit"),
        summary: bi(
          "원고에 쓰인 폰트·브러시·3D 배경·오디오의 비상업(NC)·만료·출처 누락을 출고 전 차단",
          "Blocking NC, expired, unknown, or missing-attribution fonts, brushes, 3D sets & audio before delivery",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "6대 자산(폰트·브러시·3D·효과·오디오·참고) Fail-Closed Rights BOM 검증기 + 출처 고지 자동 생성 + 3D 임포트 영수증 연결 완료",
            "Fail-closed Rights BOM validator across 6 asset categories with automatic attribution lists & 3D import receipts",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts",
            "apps/web/src/domains/creator/delivery-pack/rights-bom-and-bundler.test.ts",
            "apps/web/src/domains/creator/delivery-pack/StudioEpisodeDeliveryPackPanel.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("Fail-Closed 자동 차단", "Fail-closed auto gate"),
            detail: bi("NC·만료·미확인 1건이라도 상업 납품 전 경고·차단", "Blocks commercial pack if any NC/expired/unknown asset exists"),
          },
          csp: { status: "none", label: bi("수동 확인", "Manual check"), detail: bi("소재 라이선스 자동 출고 차단 기능 없음", "No automated license BOM audit on export") },
          procreate: { status: "none", label: bi("수동 확인", "Manual check"), detail: bi("브러시·폰트 저작권 추적 없음", "No asset license tracking") },
          photoshop: { status: "limited", label: bi("Content Credentials", "Content Credentials"), detail: bi("C2PA 메타 서명 지원, 웹툰 3D/폰트 상업 BOM 차단은 별도", "C2PA provenance; no webtoon multi-asset BOM gate") },
          rebelle: { status: "none", label: bi("수동 확인", "Manual check"), detail: bi("해당 없음", "Not applicable") },
          blender: { status: "none", label: bi("수동 확인", "Manual check"), detail: bi("에셋 출처 관리는 외부 툴 의존", "External license tracking required") },
          creco: { status: "none", label: bi("문서 메모 수준", "Manual notes"), detail: bi("원고 레이어 단위 자산 BOM 자동 추출 없음", "No layer-level asset BOM extraction") },
          acon3d: {
            status: "limited",
            label: bi("구매 내역 영수증", "Purchase receipts"),
            detail: bi("자사 구매 라이선스만 조회 가능(폰트·타사 모델 미포함)", "Tracks ACON3D orders only, not fonts or external assets"),
          },
        },
      },
      {
        id: "platform-safe-slice",
        title: bi("4대 웹툰 플랫폼 안전 슬라이스 납품 패키지", "4-Platform Safe Slice Delivery Pack"),
        summary: bi(
          "말풍선·대사를 자르지 않고 네이버(690px)·카카오(720px)·레진(800px)·글로벌 규격 ZIP 일괄 생성",
          "Slicing episodes for Naver (690px), Kakao (720px), Lezhin (800px) & Global without cutting balloons",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "네이버 690px·카카오 720px·레진 800px·글로벌 프리셋 + 말풍선 보호 안전 절단 플래너 + 표준 파일명(EP01_001.jpg) ZIP 번들러 구현 완료",
            "Naver/Kakao/Lezhin/Global presets + balloon-safe cut planner + standardized ZIP bundler implemented and tested",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/delivery-pack/platform-delivery-specs.ts",
            "apps/web/src/domains/creator/delivery-pack/safe-slice-planner.ts",
            "apps/web/src/domains/creator/delivery-pack/safe-slice-planner.test.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("4대 플랫폼 안전 절단 ZIP", "4-platform safe slice ZIP"),
            detail: bi("말풍선 침범 회피 + 용량 상한 + Rights BOM 동봉", "Avoids balloon cuts + checks size caps + bundles Rights BOM"),
          },
          csp: {
            status: "native-strength",
            label: bi("웹툰 분할 내보내기", "Webtoon slice export"),
            detail: bi("세로 높이 분할·미리보기 지원(플랫폼 용량·BOM 검증은 수동)", "Vertical slice & preview; BOM/cap checks are manual"),
          },
          procreate: { status: "none", label: bi("분할 내보내기 미지원", "No vertical slicer"), detail: bi("별도 슬라이서 앱·스크립트 필요", "Needs external slicing tool") },
          photoshop: {
            status: "limited",
            label: bi("슬라이스 툴/액션", "Slice tool / Actions"),
            detail: bi("액션 자동화 가능하나 말풍선 보호 절단은 수작업", "Scriptable, but balloon-aware safe slicing is manual"),
          },
          rebelle: { status: "none", label: bi("미지원", "None"), detail: bi("단일 이미지 내보내기", "Single-image export") },
          blender: { status: "none", label: bi("미지원", "None"), detail: bi("렌더 프레임 출력 전용", "Render frame output") },
          creco: { status: "limited", label: bi("검수본 뷰어·파일 관리", "Preview & file storage"), detail: bi("슬라이스 이미지 생성 자체는 드로잉 툴 의존", "Relies on external drawing tools for slicing") },
          acon3d: { status: "none", label: bi("미지원", "None"), detail: bi("3D 소재 마켓", "3D marketplace") },
        },
      },
    ],
  },
  {
    id: "collab-offline",
    order: 4,
    tabLabel: bi("④ 협업·분업 OS·OPFS", "4. Collab & Offline OPFS"),
    title: bi("실시간 협업 · 분업 프로덕션 OS · 로컬 OPFS 내구성", "Real-Time Collaboration, Division OS & Local OPFS Durability"),
    subtitle: bi(
      "동시 편집, 역할별 권한·분업 일정·AD 레드라인·로열티 정산, 오프라인 저장 및 충돌 방지 비교",
      "Comparing live co-editing, role RBAC, multi-episode scheduling, AD redline QA, royalty ledgers & offline sync",
    ),
    whenToUseGuide: bi(
      "이미 대규모 제작사 ERP/PD 운영 체계에 Creco를 안착시킨 팀이라면 기존 워크플로를 유지할 이유가 충분합니다. ToonStudio는 1인 작가에서 2~6인 어시스턴트 분업으로 넘어갈 때 드로잉 캔버스·컷 분할 리스·AD 검수·정산·로컬 오프라인 복구를 메신저 없이 한 공간에서 묶어 쓸 때 강합니다.",
      "Established studios already standardized on Creco may prefer keeping their existing PM ops. ToonStudio excels when solo creators or 2–6 person teams want drawing, cut-slice leases, AD redline review, royalty tracking & offline recovery unified without chat-file chaos.",
    ),
    criteria: [
      {
        id: "division-os-rbac",
        title: bi("웹툰 분업 OS (레이어 RBAC · 컷 리스 · 5주 스케줄러)", "Webtoon Division OS (Layer RBAC, Cut Leases & 5-Week Scheduler)"),
        summary: bi(
          "콘티·선화·밑색·배경·식자 담당자별 쓰기 권한, 컷 분할 반출·자동 병합, 지연 파급 시뮬레이션",
          "Role-scoped layer locks, episode cut partitioning/auto-stitching & delay ripple simulation",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "분업 OS 허브(레이어 RBAC · 컷 분할 리스/자동 병합 · 5주 다회차 스케줄러 · AD 레드라인/규제 QA · 포렌식 워터마크 · 로열티 정산) 구현 완료(실제 팀 실증은 베타 검증 대상)",
            "Division OS hub (layer RBAC, cut-slice lease/stitch, 5-week scheduler, AD redline QA, forensic watermark & royalty ledger) implemented; studio pilot validation is ongoing",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx",
            "apps/web/src/domains/creator/production-hub/division-os/studio-division-os.test.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("캔버스 직결 분업 OS", "Canvas-native Division OS"),
            detail: bi("역할 권한·컷 리스·AD 검수·워터마크·정산 한 화면(베타 검증 중)", "Role RBAC, cut leases, AD QA & settlement in-app (beta validation)"),
          },
          csp: {
            status: "limited",
            label: bi("팀워크 클라우드 체크아웃", "Teamwork checkout"),
            detail: bi("EX 페이지 단위 체크아웃 지원, 공정 스케줄·정산·AD QA 부재", "EX page checkout; no pipeline scheduler or settlement"),
          },
          procreate: { status: "none", label: bi("개인 작업 전용", "Solo only"), detail: bi("협업·권한·공정 관리 없음", "No collaboration or workflow features") },
          photoshop: {
            status: "limited",
            label: bi("클라우드 공유·코멘트", "Cloud review links"),
            detail: bi("웹 링크 코멘트 가능, 웹툰 분업 공정·정산 기능 없음", "Link comments only; no webtoon division pipeline"),
          },
          rebelle: { status: "none", label: bi("개인 작업 전용", "Solo only"), detail: bi("협업 기능 없음", "No collaboration") },
          blender: { status: "limited", label: bi("파일 링크·외부 파이프라인", "File linking / add-ons"), detail: bi("USD/라이브러리 링크 지원, 제작 PM은 외부 툴 필요", "USD/library linking; PM relies on external tools") },
          creco: {
            status: "native-strength",
            label: bi("웹툰 제작사 협업 전문", "Dedicated webtoon PM"),
            detail: bi("현업 에이전시 검증된 회차 일정·피드백·파일 이력 관리", "Agency-proven webtoon scheduling, review & version tracking"),
          },
          acon3d: {
            status: "limited",
            label: bi("팀 좌석 라이선스", "Team seat licenses"),
            detail: bi("소재 라이선스 공유만 해당, 제작 공정 관리는 영역 외", "Asset license seating only, not workflow ops"),
          },
        },
      },
      {
        id: "realtime-crdt-canvas",
        title: bi("실시간 공동 캔버스 & 방 단위 동기화", "Real-Time Co-Editing Canvas & Room Sync"),
        summary: bi(
          "브라우저에서 여러 작업자가 같은 회차를 열고 커서·코멘트·컷 편집 상태를 동기화",
          "Multi-user browser sessions syncing presence, comments & cut edits cleanly",
        ),
        toonStudioEvidence: {
          maturity: "partial",
          summary: bi(
            "Yjs CRDT + Cloudflare Durable Objects 실시간 조정 워커(`realtime.toonstudio.cloud`) 가동 중(실험 경계 고지 유지)",
            "Yjs CRDT + Cloudflare Durable Objects coordination worker (`realtime.toonstudio.cloud`) deployed; labeled experimental where multi-author semantics evolve",
          ),
          repoPaths: [
            "docs/operations/infrastructure-map.md",
            "apps/web/src/domains/creator/live/StudioLiveLayerSeatDivisionBench.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "partial",
            label: bi("Yjs CRDT + Durable Objects", "Yjs CRDT + Durable Objects"),
            detail: bi("실시간 세션·역할 시트 분담 구현(대규모 팀 부하 검증 진행 중)", "Live sessions & seat division ready; large-team load testing ongoing"),
          },
          csp: { status: "none", label: bi("비동기 파일 동기화", "Async file sync"), detail: bi("실시간 동시 드로잉 미지원", "No live simultaneous co-drawing") },
          procreate: { status: "none", label: bi("미지원", "None"), detail: bi("단일 기기 작업", "Single-device editing") },
          photoshop: { status: "limited", label: bi("초대 편집(비동기)", "Async invite-to-edit"), detail: bi("한 번에 1명 편집 방식", "One editor at a time") },
          rebelle: { status: "none", label: bi("미지원", "None"), detail: bi("단일 데스크톱 작업", "Single desktop session") },
          blender: { status: "limited", label: bi("멀티유저 애드온(실험)", "Multi-user add-ons"), detail: bi("공식 내장 실시간 편집은 아님", "Not built-in natively") },
          creco: {
            status: "native-strength",
            label: bi("실시간 검수·알림", "Live review & alerts"),
            detail: bi("피드백·승인 상태 실시간 공유 우수(드로잉 동시 편집은 영역 외)", "Strong live review sync; not a drawing canvas"),
          },
          acon3d: { status: "none", label: bi("해당 없음", "N/A"), detail: bi("소재 마켓", "Marketplace") },
        },
      },
      {
        id: "local-opfs-durability",
        title: bi("로컬-퍼스트 SQLite OPFS & 오프라인 멱등 동기화", "Local-First SQLite OPFS & Idempotent Offline Sync"),
        summary: bi(
          "네트워크가 끊겨도 기기 내 DB에 즉시 저장하고, 재접속 시 충돌 없이 압축·동기화",
          "Saving directly to in-browser SQLite OPFS offline and compacting/merging idempotently on reconnect",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "SQLite WASM + OPFS 로컬 권위 + 오프라인 동기화 큐 멱등 병합기(삭제 후 수정 충돌 명시 반환) + OPFS 자가 복구 패널 구현 완료",
            "SQLite WASM + OPFS local authority + idempotent offline sync queue merger (explicit modify-after-delete conflicts) + OPFS self-heal panel",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/live/studio-offline-sync-queue-merger.ts",
            "apps/web/src/domains/creator/storage/StudioOpfsSelfHealPanel.tsx",
            "apps/web/src/domains/creator/bg3d/studio-bg3d-libraries-sqlite-opfs-authority.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("SQLite OPFS + 멱등 큐", "SQLite OPFS + idempotent queue"),
            detail: bi("로컬 우선 저장·자가 복구 + 원본 백업 명시 안내", "Local-first save, self-heal & explicit file backup prompts"),
          },
          csp: {
            status: "native-strength",
            label: bi("네이티브 로컬 디스크", "Native local disk"),
            detail: bi("OS 파일 시스템 직접 저장·복구 안정성 최상", "Direct OS filesystem persistence & recovery"),
          },
          procreate: {
            status: "native-strength",
            label: bi("iPad 로컬 저장", "iPad local storage"),
            detail: bi("완전 오프라인 작동(단 기기 분실 대비 백업은 사용자 책임)", "Full offline reliability; manual backup advised"),
          },
          photoshop: {
            status: "native-strength",
            label: bi("로컬 + CC 클라우드", "Local + CC Cloud"),
            detail: bi("로컬 PSD와 Creative Cloud 버전 기록 병행", "Local PSD plus Creative Cloud version history"),
          },
          rebelle: {
            status: "native-strength",
            label: bi("네이티브 로컬 디스크", "Native local disk"),
            detail: bi("로컬 .reb 파일 완전 오프라인", "Fully offline native .reb files"),
          },
          blender: {
            status: "native-strength",
            label: bi("네이티브 .blend + 자동저장", "Native .blend + autosave"),
            detail: bi("로컬 파일·Git/SVN 파이프라인 친화", "Native .blend files & VCS-friendly workflows"),
          },
          creco: { status: "limited", label: bi("온라인 SaaS 중심", "Online SaaS"), detail: bi("네트워크 연결 기반 협업", "Requires network connectivity") },
          acon3d: { status: "limited", label: bi("다운로드 후 로컬 보관", "Download to local"), detail: bi("구매 파일 내려받아 보관", "Downloaded archives stored locally") },
        },
      },
      {
        id: "forensic-outsource-security",
        title: bi("외주 유출 방지 (범위 제한 링크 · 포렌식 워터마크)", "Leak Prevention (Scoped Links & Forensic Watermarks)"),
        summary: bi(
          "외주 담당자에게 필요한 컷만 기간·권한 제한으로 열고 비가시 LSB 워터마크 삽입",
          "Issuing scoped cut links for freelancers with embedded invisible LSB forensic watermarks",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "분업 OS 내부에 바이너리 자산 잠금·범위 제한 외주 링크·비가시 LSB 포렌식 워터마크 삽입/추출 모듈 구현 완료",
            "Binary asset checkout locks, scoped outsource links & invisible LSB forensic watermark embed/extract built into Division OS",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx",
            "apps/web/src/domains/creator/production-hub/division-os/studio-division-os.test.tsx",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("범위 링크 + LSB 워터마크", "Scoped link + LSB watermark"),
            detail: bi("담당 컷 격리 반출 + 포렌식 워터마크 내장", "Cut-scoped outsource links + forensic watermark embed/extract"),
          },
          csp: { status: "none", label: bi("미제공", "None"), detail: bi("파일 전송 시 외부 DRM 필요", "Requires external DRM") },
          procreate: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          photoshop: { status: "limited", label: bi("수동 워터마크", "Manual watermarks"), detail: bi("액션/플러그인으로 수동 적용", "Manual or plugin-based") },
          rebelle: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          blender: { status: "none", label: bi("미제공", "None"), detail: bi("해당 없음", "Not applicable") },
          creco: {
            status: "native-strength",
            label: bi("제작사 보안 뷰어", "Studio security viewer"),
            detail: bi("권한별 열람 통제·보안 뷰어 실무 강점", "Proven permissioned viewer & studio access control"),
          },
          acon3d: { status: "none", label: bi("해당 없음", "N/A"), detail: bi("에셋 마켓", "Marketplace") },
        },
      },
    ],
  },
  {
    id: "ux-cost",
    order: 5,
    tabLabel: bi("⑤ UX 디자인·비용(₩0)", "5. UX Design & Cost (₩0)"),
    title: bi("Calm Atelier UX · 접근성 · 구독 비용(₩0 베타) · 상용 라이선스", "Calm Atelier UX, Accessibility, Cost (₩0 Beta) & Commercial Safety"),
    subtitle: bi(
      "캔버스 시야율, 설치 없는 진입, 인체공학(왼손잡이·야간 보호), 과금 구조 및 1인 기업 상용 준비도 비교",
      "Comparing canvas viewport ratio, zero-install onboarding, ergonomics, pricing models & solo-founder commercial readiness",
    ),
    whenToUseGuide: bi(
      "네이티브 OS 전용 단축키와 오프라인 영구 소유가 최우선이라면 Blender(무료)·Procreate(1회 구매)·CSP 영구판이 합리적입니다. ToonStudio는 현재 베타 기간 전 기능 ₩0으로 4~6개 구독·구매 툴을 오가는 비용과 설치 장벽을 없애며, 향후 유료 전환 시에도 사전에 투명하게 고지합니다.",
      "If native OS permanence is your top priority, Blender (free), Procreate (one-time) or CSP perpetual are strong fits. ToonStudio removes multi-tool subscription friction at KRW 0 during beta with transparent advance notice before any future billing.",
    ),
    criteria: [
      {
        id: "calm-atelier-viewport",
        title: bi("Calm Atelier 82%+ 캔버스 시야 & 점진적 노출", "Calm Atelier 82%+ Canvas Viewport & Progressive Disclosure"),
        summary: bi(
          "복잡한 팝업·중첩 패널 대신 집중/심플/프로 3단계와 44px 상단바 설계로 원고에 집중",
          "Three disclosure tiers (focus/simple/full) and single 44px top bar target keeping 82%+ canvas clear",
        ),
        toonStudioEvidence: {
          maturity: "partial",
          summary: bi(
            "DESIGN.md · PRODUCT.md 정본 규격(82%+ 캔버스 · 단일 44px 바 · 7대 메뉴 · ≥44×44px 터치 타깃) 확정 및 집중/심플/프로 3단계 동작 중(전수 7대 메뉴 압축은 마이그레이션 진행 중)",
            "DESIGN.md & PRODUCT.md contracts (82%+ canvas, 44px top bar, 7-menu budget, ≥44×44px targets) active with focus/simple/full modes; full 18→7 menu consolidation in progress",
          ),
          repoPaths: ["DESIGN.md", "PRODUCT.md"],
        },
        cells: {
          toonstudio: {
            status: "partial",
            label: bi("82%+ 설계 · 3단계 밀도", "82%+ spec · 3 density tiers"),
            detail: bi("집중/심플/프로 동작 · 44px 단일바·7메뉴 통합은 단계적 반영 중", "Focus/simple/full live; full 44px/7-menu convergence rolling out"),
          },
          csp: {
            status: "limited",
            label: bi("고밀도 전문가 패널", "Dense pro palettes"),
            detail: bi("심플 모드(태블릿) 추가됐으나 데스크톱 기본 화면은 학습 곡선 높음", "Tablet Simple Mode added, desktop default remains dense"),
          },
          procreate: {
            status: "native-strength",
            label: bi("최소 크롬·최상 몰입감", "Minimal-chrome benchmark"),
            detail: bi("캔버스 중심 UI와 직관적 제스처의 업계 기준", "Industry benchmark for distraction-free canvas UX"),
          },
          photoshop: {
            status: "limited",
            label: bi("다목적 전문가 UI", "Multi-discipline dense UI"),
            detail: bi("사진·인쇄·UI 기능 혼재로 웹툰 초심자 장벽 존재", "Broad photo/print UI creates overhead for webtoon beginners"),
          },
          rebelle: {
            status: "limited",
            label: bi("회화 도구 패널 중심", "Traditional studio panels"),
            detail: bi("물감·용지·건조 패널이 풍성하나 모바일/터치 대응 제한", "Rich pigment panels; limited mobile/touch layout"),
          },
          blender: {
            status: "limited",
            label: bi("고난도 3D 워크스페이스", "Steep 3D workspace"),
            detail: bi("강력한 커스텀 레이아웃이지만 입문 학습 비용이 큼", "Very flexible layouts, steep learning curve"),
          },
          creco: {
            status: "native-strength",
            label: bi("제작 관리 특화 대시보드", "Clean PM dashboard"),
            detail: bi("작가·PD가 일정과 피드백을 한눈에 파악하도록 설계", "Purpose-built UI for schedules & review tracking"),
          },
          acon3d: {
            status: "native-strength",
            label: bi("장르별 소재 검색 UX", "Genre-tuned catalog UX"),
            detail: bi("웹툰 배경 탐색·미리보기 최적화", "Tailored for browsing webtoon 3D sets"),
          },
        },
      },
      {
        id: "ergonomics-zero-install",
        title: bi("설치 없는 3초 진입 · 왼손잡이 미러 · 야간 보호", "Zero-Install Entry, Left-Handed Mirror & Night Guard"),
        summary: bi(
          "기기 제약 없는 브라우저 즉시 실행과 장시간 연재 작가를 위한 인체공학 보호",
          "Instant browser launch on any device plus ergonomics for long serialization sessions",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "게스트 비차단 진입 + 왼손잡이 UI 미러 + 야간 색온도 가드(원고 색 비오염) + 휴식 알림 타이머 구현 완료",
            "Non-blocking guest entry + left-handed UI mirror + night comfort guard (canvas-color-safe) + rest nudge timer",
          ),
          repoPaths: [
            "apps/web/src/domains/creator/ergonomics/studio-night-comfort-guard.ts",
            "apps/web/src/domains/creator/ergonomics/studio-rest-nudge-timer.ts",
            "PRODUCT.md",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("브라우저 즉시 + 인체공학 3종", "Instant web + 3 ergonomics"),
            detail: bi("무설치 3초 진입 · 왼손 미러 · 야간 보호 · 휴식 타이머", "Zero install · lefty mirror · night guard · rest timer"),
          },
          csp: { status: "limited", label: bi("앱 설치·라이선스 인증", "Install + license login"), detail: bi("OS별 설치 필요, 기기 수 인증 제한 존재", "Requires install & per-device license activation") },
          procreate: { status: "limited", label: bi("iPad 하드웨어 필수", "iPad hardware required"), detail: bi("Windows/macOS/Android 미지원(왼손 인터페이스는 지원)", "iPad-only hardware lock-in (has right/left hand toggle)") },
          photoshop: { status: "limited", label: bi("Creative Cloud 설치", "Creative Cloud install"), detail: bi("대용량 데스크톱 설치 필수(웹판은 기능 제한)", "Heavy desktop install; web version is limited") },
          rebelle: { status: "limited", label: bi("데스크톱 설치 필수", "Desktop install required"), detail: bi("Windows/macOS 전용", "Windows/macOS only") },
          blender: { status: "limited", label: bi("데스크톱 설치 필수", "Desktop install required"), detail: bi("태블릿·브라우저 미지원", "Desktop-only") },
          creco: { status: "native-strength", label: bi("웹 즉시 접속", "Instant web access"), detail: bi("브라우저 기반 팀 협업 진입 장벽 낮음", "Low-friction browser access for teams") },
          acon3d: { status: "native-strength", label: bi("웹 스토어 즉시 탐색", "Instant web browsing"), detail: bi("실제 사용에는 별도 3D 뷰어/SketchUp 설치 필요", "Web browsing; usage requires SketchUp or viewer") },
        },
      },
      {
        id: "beta-pricing-tco",
        title: bi("구독 비용 · 베타 ₩0 정책 · 운영 인프라 구조", "Cost Structure, Beta ₩0 Policy & Infrastructure Efficiency"),
        summary: bi(
          "1인 작가·예비 창작자 기준 초기 비용 부담과 향후 과금 투명성",
          "Upfront cost burden for solo/emerging creators and transparent billing roadmap",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "베타 전 기능 ₩0(결제 모듈 비활성) · Cloudflare Static+R2+Durable Objects+서울 onpod 무료 티어로 인프라 고정비 ₩0(도메인 갱신비 제외) 달성 · 정식 요금은 검증 후 사전 고지",
            "KRW 0 across all tiers in beta (billing disabled); KRW 0 cloud infrastructure fixed cost via Cloudflare Static/R2/DO + Seoul onpod free tier (domain renewal only)",
          ),
          repoPaths: [
            "apps/web/src/app/routes/pricing-page.tsx",
            "docs/operations/infrastructure-map.md",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("베타 전 기능 ₩0", "KRW 0 in beta"),
            detail: bi("결제 비활성 · 향후 개인/팀 유료화는 사전 공지 후 단계 도입", "Billing off in beta; future paid tiers announced in advance"),
          },
          csp: {
            status: "limited",
            label: bi("구독 또는 영구(업데이트 유료)", "Subscription or perpetual"),
            detail: bi("멀티 기기(iPad+PC) 병행 시 월·연 구독 플랜 필요", "Cross-device (iPad+PC) workflows require subscription"),
          },
          procreate: {
            status: "native-strength",
            label: bi("1회 구매 · 구독 없음", "One-time purchase"),
            detail: bi("소프트웨어 비용 매우 낮음(단 iPad+Pencil 기기 비용 별도)", "Very affordable app; requires iPad + Apple Pencil hardware"),
          },
          photoshop: {
            status: "limited",
            label: bi("지속 월·연 구독 필수", "Recurring subscription"),
            detail: bi("영구 라이선스 없음, 장기 연재 시 고정비 누적", "Subscription-only; ongoing fixed monthly cost"),
          },
          rebelle: {
            status: "limited",
            label: bi("영구 라이선스(버전 업 유료)", "Perpetual + paid upgrades"),
            detail: bi("Pro 에디션(안료·NanoPixel) 별도 상위 가격", "Pro edition required for Pigments & NanoPixel"),
          },
          blender: {
            status: "native-strength",
            label: bi("영구 ₩0 오픈소스", "Forever KRW 0 OSS"),
            detail: bi("비용 0원, 상용 작품 제한 없음", "Free forever with unrestricted commercial renders"),
          },
          creco: {
            status: "limited",
            label: bi("팀 좌석 SaaS 구독", "Seat-based SaaS"),
            detail: bi("협업 인원 증가에 따라 좌석별 월 비용 발생", "Recurring per-seat team cost"),
          },
          acon3d: {
            status: "limited",
            label: bi("에셋 건별 구매·좌석 차등", "Per-asset + seat tiers"),
            detail: bi("작품 장르·배경 수에 비례해 소재 구매비 누적", "Asset costs scale with genre & scene count"),
          },
        },
      },
      {
        id: "solo-commercial-license",
        title: bi("1인 기업 상용화 라이선스 투명성", "Solo-Founder Commercial License Readiness"),
        summary: bi(
          "비상업(NC)·GPL 혼입 차단, 자동 제3자 고지서 생성, 성장 단계별 전환 조건 공개",
          "Automated blocking of NC/GPL packages, generated notices & explicit scaling triggers",
        ),
        toonStudioEvidence: {
          maturity: "current",
          summary: bi(
            "`pnpm run audit:licenses` 590개 의존성 매 빌드 검증 · mixbox(CC BY-NC) 완전 제거 · Rapier Apache-2.0 · Remotion 3인 이하 무료 경계(4인+ 전환 조건) 및 OCCT LGPL 동적 분리 투명 공개",
            "`pnpm run audit:licenses` verifies 590 entries every build; mixbox removed; Rapier Apache-2.0; Remotion ≤3-seat boundary & OCCT LGPL isolation publicly documented",
          ),
          repoPaths: [
            "docs/legal/solo-founder-commercial-license-audit-20261122.md",
            "apps/brush-lab/src/license-policy.test.ts",
          ],
        },
        cells: {
          toonstudio: {
            status: "current",
            label: bi("자동 감사 + 경계 공개", "Automated audit + open ledger"),
            detail: bi("mixbox 0건 · Rapier Apache-2.0 · 4인+ Remotion 전환 조건 명시", "0 mixbox · Apache-2.0 Rapier · clear 4+ team trigger"),
          },
          csp: { status: "native-strength", label: bi("상용 작품 제작 완전 허용", "Full commercial art rights"), detail: bi("개별 ASSETS 소재 약관은 별도 확인 필요", "Commercial art permitted; check per-asset TERMS") },
          procreate: { status: "native-strength", label: bi("상용 작품 제작 완전 허용", "Full commercial art rights"), detail: bi("기본 브러시·작품 상업 이용 자유", "Free commercial use of artwork & default brushes") },
          photoshop: { status: "native-strength", label: bi("기업 상용 표준", "Enterprise commercial standard"), detail: bi("구독 유지 시 상업 이용·Adobe Fonts 범위 준수", "Commercial standard under active CC & Adobe Fonts terms") },
          rebelle: { status: "native-strength", label: bi("상용 작품 제작 허용", "Commercial art allowed"), detail: bi("1인/기업 상용 라이선스 명확", "Clear individual & studio commercial terms") },
          blender: { status: "native-strength", label: bi("출력물 라이선스 자유", "Unrestricted render output"), detail: bi("소프트웨어 수정 재배포 시 GPL 적용, 렌더 산출물은 100% 작가 소유", "Software is GPL; rendered art is 100% creator-owned") },
          creco: { status: "native-strength", label: bi("B2B 기업 계약 표준", "B2B enterprise contract"), detail: bi("제작사 보안·계약 체계 지원", "Enterprise studio agreements") },
          acon3d: { status: "limited", label: bi("1인/다인/기업 등급 엄격", "Strict seat-tier terms"), detail: bi("어시스턴트 공유·외주 시 상위 라이선스 확인 필수", "Strict personal vs multi-seat vs corporate license tiers") },
        },
      },
    ],
  },
];
