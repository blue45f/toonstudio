/**
 * Round 4 통합 보존 읽기 전용 감사 기준 데이터 및 합성 검증 픽스처 생성기
 *
 * 본 모듈은 origin/main HEAD 보존 감사 대상 5개 커밋, 세션별 원격 미보존 브랜치,
 * 진행 중 병렬 세션, 원격 오픈 브랜치/PR #2740, CI 실패 경계, 순차 병합 계획 및
 * 브라우저 뷰포트 검증용 합성 HTML 픽스처 생성기를 제공한다.
 */

export const EXPECTED_MAIN_HEAD = {
  shortSha: '354af37a',
  fullSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
  committedAtUtc: '2026-11-07T09:39:18Z',
  subject: 'Merge branch feat/character-reuse-round2-20261107',
};

export const PRESERVED_FEATURES = Object.freeze([
  {
    id: 'drawing',
    label: '드로잉 (Drawing UI 밀도·작업 집중도)',
    shortSha: '3363492c',
    fullSha: '3363492c7ad1fa245d4e4303f9408d57f792845b',
    featureParentShortSha: 'e6fd98fe',
    featureParentFullSha: 'e6fd98fe0e9465e000bc12c2389a34c10c5a5308',
    committedAtUtc: '2026-11-07T07:15:48Z',
    sourceBranch: 'feat/toon-drawing-ui-density-20261107',
    sourceSessionId: '7d851db3-f1eb-457b-9d16-8df8b8eb060f',
    commitSubject:
      "Merge branch 'feat/toon-drawing-ui-density-20261107': 드로잉 페이지 로컬 UI 작업영역 확보 및 메뉴 밀도·포커스 개선 통합",
    requiredPaths: [
      'apps/web/src/domains/creator/StudioMobileEditingDock.test.tsx',
      'apps/web/src/domains/creator/StudioMobileEditingDock.tsx',
      'apps/web/src/domains/creator/brush/StudioDrawOptionsBar.test.tsx',
      'apps/web/src/domains/creator/brush/StudioDrawOptionsBar.tsx',
      'apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.test.tsx',
      'apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.tsx',
      'docs/parallel-toon-drawing-20261107/README.md',
      'docs/parallel-toon-drawing-20261107/browser-verification.json',
      'docs/parallel-toon-drawing-20261107/verify-drawing-ui.mjs',
    ],
  },
  {
    id: 'brush',
    label: '브러시 (Brush Labs 연속 흐름·UI)',
    shortSha: '5dcfe58d',
    fullSha: '5dcfe58dc00fd4de377e43235f05f3133b7796c4',
    featureParentShortSha: 'a37ee654',
    featureParentFullSha: 'a37ee65444a27ccf1d5ddd16f8ee881051778a07',
    committedAtUtc: '2026-11-07T07:32:42Z',
    sourceBranch: 'brush-journey-round2-20261107',
    sourceSessionId: 'dfdfe8db-da85-443d-b472-b1c959b1d4a0',
    commitSubject:
      'merge: Brush Labs 연속 사용자 흐름 회귀 및 로컬 UI 마감 병합 (brush-journey-round2-20261107)',
    requiredPaths: [
      'apps/brush-lab/src/app/styles/brush-lab.css',
      'apps/brush-lab/src/app/ui/BrushParamPanel.tsx',
      'apps/brush-lab/src/app/ui/DrawBrushPicker.tsx',
      'apps/brush-lab/src/app/ui/DrawParamPanel.tsx',
      'apps/brush-lab/src/app/ui/FamilyGallery.tsx',
      'apps/brush-lab/src/app/ui/RecommendedCombos.tsx',
      'apps/brush-lab/src/app/views/DrawView.test.tsx',
      'apps/brush-lab/src/app/views/DrawView.tsx',
      'apps/brush-lab/src/app/views/GalleryView.test.tsx',
      'apps/brush-lab/src/app/views/GalleryView.tsx',
      'docs/brush-journey-round2-20261107/README.md',
      'docs/brush-journey-round2-20261107/browser-verification.json',
    ],
  },
  {
    id: 'discovery',
    label: '탐색 (Discovery 카탈로그 오프라인·손상 데이터 복원력)',
    shortSha: '4c108a65',
    fullSha: '4c108a65cd70f5a14f850005a90f830b18adcd5e',
    featureParentShortSha: '58ffe587',
    featureParentFullSha: '58ffe587643bd13408479a8e231e1b853bf608d9',
    committedAtUtc: '2026-11-07T08:39:46Z',
    sourceBranch: 'feat/catalog-resilience-round2-20261107',
    sourceSessionId: '341b9f1e-1d06-44eb-8267-a169a3ff9aa9',
    commitSubject:
      'fix(catalog): 로컬 크롤링 카탈로그 오프라인·손상 데이터 회귀 및 TS2551 계약 정합 병합 (Round 2)',
    requiredPaths: [
      'apps/web/src/domains/catalog/AuthorPage.tsx',
      'apps/web/src/domains/catalog/AuthorsPage.tsx',
      'apps/web/src/domains/catalog/DiscoverHubPage.tsx',
      'apps/web/src/domains/catalog/DiscoverShelves.tsx',
      'apps/web/src/domains/catalog/DiscoverSpotlight.tsx',
      'apps/web/src/domains/catalog/ExplorePage.tsx',
      'apps/web/src/domains/catalog/SearchPage.tsx',
      'apps/web/src/domains/catalog/TagsPage.tsx',
      'apps/web/src/domains/catalog/discover-home.ts',
      'apps/web/src/domains/catalog/discover-shelf-copy.ts',
      'apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx',
      'apps/web/src/domains/catalog/local-catalog-fallback.ts',
      'apps/web/src/domains/catalog/local-catalog-sanitize.ts',
      'apps/web/src/domains/catalog/tag-directory.ts',
      'docs/catalog-resilience-round2-20261107/README.md',
    ],
  },
  {
    id: 'accessibility',
    label: '접근성 (Accessibility 미해결 갭 GAP-A11Y-01~05 해소)',
    shortSha: '1692360d',
    fullSha: '1692360dbcd7dd89491fbd20021ee9c7da8da332',
    featureParentShortSha: '1692360d',
    featureParentFullSha: '1692360dbcd7dd89491fbd20021ee9c7da8da332',
    committedAtUtc: '2026-11-07T09:24:12Z',
    sourceBranch: 'fix/accessibility-fixes-round2-20261107',
    sourceSessionId: '888069cd-fb24-46da-bd5f-17a3dd63307c',
    commitSubject:
      'fix(a11y): 접근성 회귀 결함(gap-a11y-01~05) 키보드 포커스·200% 배율·스위치·랜드마크·스킵링크 최소 수정 및 검증',
    requiredPaths: [
      'apps/web/src/domains/creator/studio-chrome-ui.tsx',
      'apps/web/src/domains/creator/studio-cuttoon-editor/studio-chrome-ui.test.tsx',
      'apps/web/src/domains/legal/AccessibilityLab.tsx',
      'apps/web/src/domains/legal/AccessibilityPage.test.tsx',
      'apps/web/src/shared/components/FloatingControls.test.tsx',
      'apps/web/src/shared/components/FloatingControls.tsx',
      'apps/web/src/shared/components/LanguagePicker.test.tsx',
      'apps/web/src/shared/components/LanguagePicker.tsx',
      'apps/web/src/shared/components/appearance/AppearanceSettings.test.tsx',
      'apps/web/src/shared/components/appearance/AppearanceTrigger.tsx',
      'docs/accessibility-fixes-round2-20261107/README.md',
      'docs/accessibility-fixes-round2-20261107/screenshots/fix-gap-a11y-01-language-picker-close-focus.png',
      'docs/accessibility-fixes-round2-20261107/screenshots/fix-gap-a11y-02-mobile-390-floating-tab.png',
      'docs/accessibility-fixes-round2-20261107/screenshots/fix-gap-a11y-03-accessibility-lab-200.png',
      'docs/accessibility-fixes-round2-20261107/screenshots/fix-gap-a11y-04-appearance-trigger.png',
      'docs/accessibility-fixes-round2-20261107/screenshots/fix-gap-a11y-05-studio-skiplink.png',
      'docs/accessibility-fixes-round2-20261107/verification-report.json',
      'docs/accessibility-fixes-round2-20261107/verify-fixes-browser.mjs',
    ],
  },
  {
    id: 'character',
    label: 'Character (Character Lab R&D 실험실 안전 재사용 흐름)',
    shortSha: '354af37a',
    fullSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    featureParentShortSha: '511fd1f8',
    featureParentFullSha: '511fd1f8d60e69b21a6e67bb4d85bf3535c668a0',
    committedAtUtc: '2026-11-07T09:39:18Z',
    sourceBranch: 'feat/character-reuse-round2-20261107',
    sourceSessionId: 'e4e67646-ae06-4410-9a77-8353a2a190fe',
    commitSubject:
      "Merge branch 'feat/character-reuse-round2-20261107': 캐릭터랩 R&D 실험 결과 안전 재사용 흐름(내보내기·재가져오기·패키지 복구) 로컬 UI 개선 통합",
    requiredPaths: [
      'apps/character-lab/src/app/shell/panels/ExportPanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/ExportPanel.tsx',
      'apps/character-lab/src/app/shell/panels/PackagePanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
      'apps/character-lab/src/app/shell/panels/PosePanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/PosePanel.tsx',
      'apps/character-lab/src/app/styles/character-lab.css',
      'docs/character-reuse-round2-20261107/README.md',
      'docs/character-reuse-round2-20261107/export-mobile-320.png',
      'docs/character-reuse-round2-20261107/export-mobile-390.png',
      'docs/character-reuse-round2-20261107/export-pc-1440-zoom200.png',
      'docs/character-reuse-round2-20261107/export-pc-1440.png',
      'docs/character-reuse-round2-20261107/export-tablet-768.png',
      'docs/character-reuse-round2-20261107/journey-1-saved-export-pc-1440.png',
      'docs/character-reuse-round2-20261107/journey-2-corrupt-error-pc-1440.png',
      'docs/character-reuse-round2-20261107/journey-3-restored-longname-pc-1440.png',
      'docs/character-reuse-round2-20261107/package-mobile-320.png',
      'docs/character-reuse-round2-20261107/package-mobile-390.png',
      'docs/character-reuse-round2-20261107/package-pc-1440-zoom200.png',
      'docs/character-reuse-round2-20261107/package-pc-1440.png',
      'docs/character-reuse-round2-20261107/package-tablet-768.png',
      'docs/character-reuse-round2-20261107/pose-mobile-320.png',
      'docs/character-reuse-round2-20261107/pose-mobile-390.png',
      'docs/character-reuse-round2-20261107/pose-pc-1440-zoom200.png',
      'docs/character-reuse-round2-20261107/pose-pc-1440.png',
      'docs/character-reuse-round2-20261107/pose-tablet-768.png',
      'docs/character-reuse-round2-20261107/verification-report.json',
    ],
  },
]);

export const UNPRESERVED_SESSION_BRANCHES = Object.freeze([
  {
    sessionId: '86ad871b-d3dd-4bab-9b02-1f641ef2267f',
    branch: 'qa/responsive-audit-20261107',
    localCommits: [
      {
        shortSha: 'd0f9aa0b',
        subject: 'docs(qa): 2026-11-07 전 앱 반응형 레이아웃 및 오버플로우 감사 보고서 추가',
      },
      {
        shortSha: 'abebd404',
        subject: 'Merge branch qa/responsive-audit-20261107: 전 앱 반응형 레이아웃 및 오버플로우 감사 보고서',
      },
      {
        shortSha: '2466becc',
        subject: 'fix(web): 카탈로그 툴바 320px 오버플로우 해소 및 반응형 감사 보고서 병합',
      },
      {
        shortSha: '129fd16c',
        subject: 'fix(web): 320px/200% 배율 전 앱 반응형 가로 오버플로우 해소 및 감사 보고서 추가',
      },
    ],
    lastSessionActivityUtc: '2026-11-07T03:42:46Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    classification: 'UNPRESERVED_LOCAL_ONLY',
    rootCause:
      '세션 내부에서 로컬 main 병합 및 커밋 후 git push origin main을 시도했으나 .husky/pre-push의 typecheck-shards.mjs(--heap-mb 8192) 8GB uVM OOM(exit 137)으로 푸시가 실패하여 원격에 보존되지 않음',
    recommendedAction:
      '카탈로그/전 앱 320px 반응형 수정은 이후 origin/main에 병합된 4c108a65(탐색), 1692360d(접근성), ea1202e6(홈)과 일부 영역이 겹치므로 로컬 메인 강제 병합 금지. 필요 시 보고서 문서만 별도 추출 검토',
  },
  {
    sessionId: '516daae4-99c9-4240-9146-9c80fc92c1fb',
    branch: 'fix/studio-document-persistence-data-paths',
    localCommits: [
      {
        shortSha: '1e7fbb0f',
        subject: 'fix(creator): 스튜디오 문서 저장/복원 데이터 경로 무결성 보강',
      },
      {
        shortSha: 'a9c8a001',
        subject: 'Merge branch fix/studio-document-persistence-data-paths',
      },
      {
        shortSha: '904208d0',
        subject: 'Merge branch fix/studio-document-persistence-data-paths (rebased)',
      },
    ],
    lastSessionActivityUtc: '2026-11-07T04:15:43Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    supersededByMainCommits: ['e2584127', '55335f50', '04935cbd', '83611f23'],
    classification: 'PARTIALLY_SUPERSEDED_BY_FOLLOWUP_MAIN_MERGES',
    rootCause:
      '동일 세션의 후속 라운드 브랜치 fix/studio-storage-resilience-20261107(e2584127 -> 55335f50) 및 fix/studio-autosave-20261107(04935cbd -> 83611f23)는 origin/main에 정상 병합·푸시되었으나 초기 1e7fbb0f 브랜치 커밋은 원격에 푸시되지 않음',
    recommendedAction:
      '후속 커밋(55335f50, 83611f23)이 이미 origin/main에 포함되어 있으므로 1e7fbb0f의 누락 테스트/경로 유무만 통합 담당이 대조 후 결정',
  },
  {
    sessionId: '1f27490a-679c-49e8-84af-cb2e95206dc7',
    branch: 'main (session-local)',
    localCommits: [
      {
        shortSha: '90d388f3',
        subject: 'fix(creator): 작업실 인스펙터 레이어 선택과 캔버스 변형 기즈모 동기화',
      },
      {
        shortSha: '95069a90',
        subject: 'fix(creator): 작업실 인스펙터 레이어 선택과 캔버스 변형 기즈모 동기화 (rebased)',
      },
    ],
    lastSessionActivityUtc: '2026-11-06T22:53:48Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    classification: 'UNPRESERVED_LOCAL_ONLY',
    rootCause: '세션 내 로컬 커밋만 생성되고 원격 브랜치 또는 origin/main 푸시 이전에 세션이 종료됨',
    recommendedAction: '필요 시 별도 복구 브랜치로 체리픽 검증 후 PR로 분리 상정',
  },
  {
    sessionId: 'd35c7d79-ca14-4d62-a2a0-49d72364a81f',
    branch: 'main (session-local)',
    localCommits: [
      {
        shortSha: '85651398',
        subject: 'fix(creator): 콘티/원고 컷 카드 및 스튜디오 인스펙터 문맥 액션 직관화',
      },
      {
        shortSha: '36baced5',
        subject: 'fix(creator): 콘티/원고 컷 카드 및 스튜디오 인스펙터 문맥 액션 직관화 (rebased)',
      },
    ],
    lastSessionActivityUtc: '2026-11-06T08:49:29Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    classification: 'UNPRESERVED_LOCAL_ONLY',
    rootCause: '세션 내 로컬 커밋 생성 후 원격 푸시 미완료 상태에서 종료됨',
    recommendedAction: '드로잉/작업실 최신 UI(3363492c, 37775f18)와 충돌 여부를 별도 브랜치에서 대조 후 선별 반영',
  },
  {
    sessionId: '9ad1e287-a8de-403e-be6c-e7dc7ed6d704',
    branch: 'main (session-local)',
    localCommits: [
      {
        shortSha: '0798e876',
        subject: 'fix(creator): 3D 뷰어/배경 홀드아웃 마스크 편집 및 렌더 프리뷰 상태 동기화 개선',
      },
    ],
    lastSessionActivityUtc: '2026-11-06T07:21:05Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    classification: 'UNPRESERVED_LOCAL_ONLY',
    rootCause: '세션 내 로컬 커밋 생성 후 원격 푸시 미수행',
    recommendedAction: '3D 배경/뷰어 담당 세션에서 재검증 후 독립 브랜치 PR로 분리',
  },
  {
    sessionId: 'b0194216-94fb-4dc7-b8ae-d5044d38daed',
    branch: 'main (session-local)',
    localCommits: [
      {
        shortSha: '301b6708',
        subject: 'fix(web): 비로그인/게스트 상태에서 제작·유통 스튜디오 진입 시 명확한 안내 배너 및 읽기 전용 탐색 제공',
      },
      {
        shortSha: '585700f2',
        subject: 'fix(web): 비로그인/게스트 상태에서 제작·유통 스튜디오 진입 시 명확한 안내 배너 및 읽기 전용 탐색 제공 (rebased)',
      },
    ],
    lastSessionActivityUtc: '2026-11-06T05:54:37Z',
    remotePreserved: false,
    ancestorOfOriginMain: false,
    classification: 'UNPRESERVED_LOCAL_ONLY',
    rootCause: '세션 내 로컬 커밋 생성 후 원격 푸시 미수행',
    recommendedAction: '인증/게스트 가드 최신 변경분(5f51aa97 등)과 대조 후 필요 시 독립 브랜치로 재검증',
  },
]);

export const ACTIVE_ROUND4_SESSIONS = Object.freeze([
  {
    sessionId: 'e4e67646-ae06-4410-9a77-8353a2a190fe',
    branch: 'docs/character-keyboard-round4-20261107',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:56Z',
    scopePaths: [
      'apps/character-lab/src/app/shell/CharacterLabShell.tsx',
      'apps/character-lab/src/app/shell/ShellHeader.tsx',
      'apps/character-lab/src/app/shell/panels/ExpressionPanel.tsx',
      'apps/character-lab/src/app/shell/panels/ WardrobePanel.tsx',
      'docs/character-keyboard-round4-20261107/',
    ],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: 'PackagePanel/PackageDetail 수정 금지 준수 중, 독립 브랜치 작업 진행 중',
  },
  {
    sessionId: '888069cd-fb24-46da-bd5f-17a3dd63307c',
    branch: 'audit/a11y-uncovered-round4-20261107',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:56Z',
    scopePaths: [
      'apps/web/src/domains/inbox/',
      'apps/web/src/domains/community/',
      'docs/a11y-uncovered-round4-20261107/',
    ],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: '메시지함(/inbox)·커뮤니티(/community) 미커버 라우트 접근성 전수 감사 진행 중',
  },
  {
    sessionId: '44c559e8-27a6-4090-a7d0-f12d6847bc41',
    branch: 'feat/production-schedule-views-round4 (session working tree)',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:55Z',
    scopePaths: [
      'apps/web/src/domains/creator/ProductionScheduleViews.tsx',
      'apps/web/src/domains/creator/production-schedule/',
    ],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: 'ProductionScheduleViews.tsx 파일 크기 분해 및 일정 보드 작업 진행 중',
  },
  {
    sessionId: 'dfdfe8db-da85-443d-b472-b1c959b1d4a0',
    branch: 'feat/brush-compare-round4 (session working tree)',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:53Z',
    scopePaths: ['apps/brush-lab/src/app/PresetComparisonBar.tsx'],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: '브러시 실험실 프리셋 비교 바 추가 개선 작업 진행 중',
  },
  {
    sessionId: '341b9f1e-1d06-44eb-8267-a169a3ff9aa9',
    branch: 'feat/author-page-resilience-round4 (session working tree)',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:56Z',
    scopePaths: ['apps/web/src/domains/catalog/AuthorPage.tsx'],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: '작가 상세(AuthorPage.tsx) 오프라인/손상 데이터 복원력 확장 진행 중',
  },
  {
    sessionId: 'c1295b93-dd7f-4a1c-a3ac-097538ff1022',
    branch: 'perf/toon-home-round4 (session working tree)',
    baseSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
    lastActiveUtc: '2026-11-07T11:36:50Z',
    scopePaths: ['scripts/bench-toon-home-200.mjs', 'apps/web/src/domains/home/'],
    status: 'IN_PROGRESS_ACTIVE_SESSION',
    notes: '홈 200개 시리즈 카드 렌더링 벤치마크 및 가상화 검증 진행 중',
  },
]);

export const REMOTE_OPEN_BRANCHES = Object.freeze([
  {
    branch: 'origin/codex/character-package-panel-modules-20261107',
    shortSha: 'f508de8f',
    fullSha: 'f508de8fd00b9bb6bb40efa85751c90a9dfd62b6',
    committedAtUtc: '2026-11-07T10:31:59Z',
    prNumber: 2740,
    prState: 'OPEN',
    prTitle: 'refactor(character-lab): extract package detail view module',
    aheadOfMain: 1,
    behindMain: 4,
    mergeBaseWithMain: '1692360dbcd7dd89491fbd20021ee9c7da8da332',
    patchEquivalentOnMain: false,
    touchedFiles: [
      'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
      'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx',
    ],
    ciStatus: 'SUCCESS',
    ciRunIds: [42366301686, 42366301620, 42366301688],
    disposition: 'MERGE_FIRST_AFTER_REBASE_ON_354AF37A',
  },
  {
    branch: 'origin/audit/accessibility-sweep-20261107',
    shortSha: 'a8614c5f',
    fullSha: 'a8614c5f37bfe928566f3458f76860b8c795feec',
    committedAtUtc: '2026-11-07T02:27:43Z',
    prNumber: null,
    prState: 'NONE',
    prTitle: 'fix(a11y): resolve mobile zoom viewport, skip link, and aria labels across apps',
    aheadOfMain: 1,
    behindMain: 36,
    mergeBaseWithMain: '5f51aa9714d3d5646f0e4ff334b6087b1caaa9fd',
    patchEquivalentOnMain: true,
    equivalentMainCommit: '5eb3810b90837e5e02baddf4b0880acdad1d76e8',
    touchedFiles: [
      'apps/admin-web/index.html',
      'apps/admin-web/src/components/AdminHeader.tsx',
      'apps/admin-web/src/layouts/AdminLayout.tsx',
      'apps/brush-lab/index.html',
      'apps/character-lab/index.html',
      'apps/character-lab/src/app/shell/CharacterLabShell.tsx',
      'apps/web/index.html',
      'apps/web/src/app/layout/Header.tsx',
      'apps/web/src/domains/catalog/CatalogPage.tsx',
      'apps/web/src/domains/creator/components/StudioCanvasHudCluster.tsx',
      'docs/accessibility-sweep-20261107/README.md',
    ],
    ciStatus: 'SUPERSEDED_BY_MAIN_5EB3810B',
    ciRunIds: [],
    disposition: 'DO_NOT_MERGE_ALREADY_IN_MAIN_AS_5EB3810B',
  },
]);

export const CI_FAILURE_ANALYSIS = Object.freeze({
  mainHeadSha: '354af37afeb3feb0f700b5a472fcfb0e31292ae0',
  mainWorkflowRunId: 42360644304,
  mainWorkflowUrl: 'https://github.com/blue45f/toonstudio/actions/runs/42360644304',
  startedAtUtc: '2026-11-07T09:39:21Z',
  completedAtUtc: '2026-11-07T10:05:56Z',
  conclusion: 'failure',
  failedJobs: [
    {
      jobId: 128370368308,
      name: 'Core preflight and application typecheck',
      failedStep: 'Enforce 800-line ceiling on source files',
      violatingFile: 'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
      lineCount: 840,
      ceiling: 800,
      excessLines: 40,
    },
    {
      jobId: 128370368255,
      name: 'Core regression shard / product',
      failedStep: 'Run assigned unit/contract shard',
      violatingFile: 'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
      lineCount: 840,
      ceiling: 800,
      excessLines: 40,
    },
  ],
  ownedByOpenPr: 2740,
  openPrBranch: 'codex/character-package-panel-modules-20261107',
  openPrHeadSha: 'f508de8fd00b9bb6bb40efa85751c90a9dfd62b6',
  openPrWorkflowRunId: 42366301686,
  openPrConclusion: 'success',
  openPrPackagePanelLinesAfterSplit: 708,
  openPrExtractedFile: 'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx',
  openPrExtractedFileLines: 161,
  duplicateFixForbidden: true,
});

export const SEQUENTIAL_MERGE_PLAN = Object.freeze([
  {
    order: 1,
    id: 'step-1-pr-2740-package-panel',
    target: 'PR #2740 (origin/codex/character-package-panel-modules-20261107 @ f508de8f)',
    ownerScope: [
      'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
      'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx',
    ],
    precondition:
      'origin/main(354af37a)의 511fd1f8 커밋이 PackagePanel.tsx를 672줄 -> 840줄로 확장했으므로, PR #2740(기반 1692360d)을 354af37a 위로 리베이스하여 RecentHistoryModal/안전 재사용 훅을 유지한 채 PackageDetail.tsx 분리를 적용하고 PackagePanel.tsx가 800줄 이하인지 확인',
    rationale: '현재 origin/main의 유일한 CI 차단 원인(PackagePanel.tsx 840줄 > 800줄 상한)을 즉시 해소하여 이후 병합 브랜치들의 CI 게이트를 정상화함',
  },
  {
    order: 2,
    id: 'step-2-docs-main-preservation-round4',
    target: 'origin/docs/main-preservation-round4-20261107 (본 읽기 전용 감사 브랜치)',
    ownerScope: [
      'docs/main-preservation-round4-20261107/README.md',
      'docs/main-preservation-round4-20261107/preservation-audit-data.mjs',
      'docs/main-preservation-round4-20261107/verify-main-preservation-round4.mjs',
      'docs/main-preservation-round4-20261107/verify-main-preservation-round4.test.mjs',
      'docs/main-preservation-round4-20261107/verification-report.json',
    ],
    precondition: 'node docs/main-preservation-round4-20261107/verify-main-preservation-round4.mjs 및 문서·린트 검증 통과',
    rationale: '독립 docs/main-preservation-round4-20261107/ 디렉터리만 추가하므로 앱/공유 스토어/라우트와 파일 충돌이 0건임',
  },
  {
    order: 3,
    id: 'step-3-skip-patch-equivalent-a11y-sweep',
    target: 'origin/audit/accessibility-sweep-20261107 (@ a8614c5f) — 병합 제외(Skip)',
    ownerScope: [],
    precondition: 'git cherry origin/main origin/audit/accessibility-sweep-20261107 결과가 "- a8614c5f..."(패치 동등 커밋 5eb3810b 존재)임을 확인',
    rationale:
      '이미 5eb3810b90837e5e02baddf4b0880acdad1d76e8로 origin/main에 반영되었으며, 36커밋 뒤처진 상태에서 재병합 시 CatalogPage.tsx·CharacterLabShell.tsx·StudioCanvasHudCluster.tsx에서 불필요한 역방향 충돌을 유발함',
  },
  {
    order: 4,
    id: 'step-4-isolated-domain-round4-branches',
    target: '활성 Round 4 병렬 세션 중 도메인 격리 브랜치 순차 병합',
    ownerScope: [
      'apps/web/src/domains/catalog/AuthorPage.tsx',
      'apps/brush-lab/src/app/PresetComparisonBar.tsx',
      'apps/web/src/domains/creator/ProductionScheduleViews.tsx',
      'scripts/bench-toon-home-200.mjs',
    ],
    precondition: '각 담당 세션이 독립 브랜치 원격 푸시 및 check:source-file-size(800줄 상한), 관련 테스트, 브라우저 검증을 완료한 뒤 하나씩 fast-forward/merge',
    rationale: '탐색(AuthorPage), 브러시(PresetComparisonBar), 제작 일정(ProductionScheduleViews), 홈 벤치마크는 서로 파일 소유 범위가 완전히 분리되어 있어 순서 간섭이 없음',
  },
  {
    order: 5,
    id: 'step-5-ui-shell-round4-branches',
    target: '활성 Round 4 병렬 세션 중 Shell/라우트 인접 브랜치 (audit/a11y-uncovered-round4-20261107, docs/character-keyboard-round4-20261107)',
    ownerScope: [
      'apps/web/src/domains/inbox/',
      'apps/web/src/domains/community/',
      'apps/character-lab/src/app/shell/CharacterLabShell.tsx',
      'apps/character-lab/src/app/shell/ShellHeader.tsx',
    ],
    precondition:
      'Step 1(PR #2740) 병합 완료 후 최신 origin/main 기준으로 리베이스하고, 메시지함 별도 담당 및 PackagePanel 범위와 파일 교집합이 0건인지 재확인',
    rationale: 'CharacterLabShell 및 메시지함/커뮤니티 인접 파일은 Step 1 이후 최신 main 위에서 검증해야 회귀와 소유권 충돌을 방지할 수 있음',
  },
]);

export function buildVerificationFixtureHtml(reportPayload) {
  const serialized = JSON.stringify(reportPayload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Round 4 통합 보존 읽기 전용 감사 검증 대시보드</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #cbd5e1;
      --accent: #38bdf8;
      --ok: #4ade80;
      --warn: #fbbf24;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    header, section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      width: 100%;
      max-width: 100%;
    }
    h1 { font-size: 1.15rem; margin: 0 0 6px 0; overflow-wrap: anywhere; }
    h2 { font-size: 1rem; margin: 0 0 8px 0; overflow-wrap: anywhere; }
    p, li, div, span, code {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .meta { color: var(--muted); font-size: 0.85rem; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    button {
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #38bdf8;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      min-height: 36px;
      max-width: 100%;
      text-align: left;
    }
    button[aria-pressed="true"] {
      background: #0369a1;
      outline: 2px solid var(--ok);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 8px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: #0f172a;
    }
    .badge-ok { color: var(--ok); font-weight: 700; }
    .badge-warn { color: var(--warn); font-weight: 700; }
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Round 4 통합 보존 읽기 전용 감사 검증 도구</h1>
      <p class="meta" id="main-head-summary"></p>
      <div class="toolbar" role="toolbar" aria-label="감사 필터">
        <button type="button" id="btn-all" aria-pressed="true">전체 보존 기능 (5)</button>
        <button type="button" id="btn-unpreserved" aria-pressed="false">원격 미보존 세션 점검</button>
        <button type="button" id="btn-ci" aria-pressed="false">CI #2740 경계 확인</button>
      </div>
    </header>
    <section aria-labelledby="preserved-heading">
      <h2 id="preserved-heading">1. origin/main 기능 커밋 Ancestry 및 파일 트리 보존</h2>
      <div class="grid" id="preserved-grid"></div>
    </section>
    <section aria-labelledby="detail-heading">
      <h2 id="detail-heading">2. 선택된 감사 상세</h2>
      <div id="detail-panel" class="card" aria-live="polite"></div>
    </section>
    <section aria-labelledby="merge-order-heading">
      <h2 id="merge-order-heading">3. 안전한 순차 병합 제안 순서</h2>
      <ol class="step-list" id="merge-order-list"></ol>
    </section>
  </main>
  <script>
    const REPORT = ${serialized};
    const headSummary = document.getElementById('main-head-summary');
    headSummary.textContent = \`origin/main HEAD: \${REPORT.mainHead.fullSha} (검증 시각: \${REPORT.verifiedAtUtc})\`;

    const grid = document.getElementById('preserved-grid');
    REPORT.preservedFeatures.forEach((f) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('data-feature-id', f.id);
      card.innerHTML = \`
        <div><strong>\${f.label}</strong></div>
        <div class="meta">SHA: <code>\${f.shortSha}</code> (parent: <code>\${f.featureParentShortSha}</code>)</div>
        <div class="badge-ok" data-status="\${f.preserved ? 'PASS' : 'FAIL'}">
          \${f.preserved ? 'ANCESTOR & TREE OK' : 'MISSING'} (\${f.presentFileCount}/\${f.requiredFileCount} files)
        </div>
      \`;
      grid.appendChild(card);
    });

    const mergeList = document.getElementById('merge-order-list');
    REPORT.sequentialMergePlan.steps.forEach((step) => {
      const li = document.createElement('li');
      li.className = 'card';
      li.innerHTML = \`<strong>Step \${step.order}: \${step.target}</strong><div class="meta">\${step.rationale}</div>\`;
      mergeList.appendChild(li);
    });

    const detailPanel = document.getElementById('detail-panel');
    function renderDetail(mode) {
      if (mode === 'unpreserved') {
        detailPanel.innerHTML = \`<strong>원격 미보존 로컬 세션 커밋: \${REPORT.branchAudit.unpreservedCount}건</strong><p class="meta">대표: qa/responsive-audit-20261107 (d0f9aa0b, 129fd16c), fix/studio-document-persistence-data-paths (1e7fbb0f). 원격 동등 커밋(a8614c5f == 5eb3810b)은 유실 아님.</p>\`;
      } else if (mode === 'ci') {
        detailPanel.innerHTML = \`<strong>CI 실패 원인: \${REPORT.ciAnalysis.violatingFile} (\${REPORT.ciAnalysis.lineCount}줄 / 상한 \${REPORT.ciAnalysis.ceiling}줄)</strong><p class="meta">PR #\${REPORT.ciAnalysis.ownedByOpenPr} (f508de8f)에서 PackageDetail.tsx 분리로 708줄 축소 및 CI 통과 완료. 중복 수정 금지: \${REPORT.ciAnalysis.duplicateFixForbidden}</p>\`;
      } else {
        detailPanel.innerHTML = \`<strong>보존 확인 완료: 5/5 핵심 기능 커밋이 모두 origin/main(\${REPORT.mainHead.shortSha})의 실제 조상(ancestry)이며 81개 필수 파일이 git tree에 존재합니다.</strong>\`;
      }
    }
    renderDetail('all');

    const buttons = [
      ['btn-all', 'all'],
      ['btn-unpreserved', 'unpreserved'],
      ['btn-ci', 'ci'],
    ];
    buttons.forEach(([id, mode]) => {
      document.getElementById(id).addEventListener('click', () => {
        buttons.forEach(([otherId]) => {
          document.getElementById(otherId).setAttribute('aria-pressed', otherId === id ? 'true' : 'false');
        });
        renderDetail(mode);
      });
    });
  </script>
</body>
</html>`;
}
