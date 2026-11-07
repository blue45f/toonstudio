/**
 * Round 5 통합 보존 후속 읽기 전용 감사 기준 데이터 및 합성 검증 픽스처 생성기
 *
 * 본 모듈은 최신 origin/main(65da4036), 신규 확인 대상 4개 커밋(65da4036, 4b1be6d4, 01d8f995, 75f34f8d),
 * PR #2740 최신 상태(c4fce43c), 최신 CI(Run 42375861658 vs Run 42375379091) 및 담당 범위를 정의한다.
 */

export const ROUND5_MAIN_HEAD = Object.freeze({
  shortSha: '65da4036',
  fullSha: '65da4036cec52f1d5b048855a51085c9b7503264',
  committedAtUtc: '2026-11-07T13:11:54+00:00',
  subject:
    "Merge branch 'feat/character-keyboard-fixes-round5-20261107': Character Lab Round 5 KBD-01/02/04/05 keyboard & viewport fixes",
});

export const ROUND5_TARGET_COMMITS = Object.freeze([
  {
    id: 'character-keyboard',
    label: 'Character 키보드 (Round 5 KBD-01/02/04/05 키보드 포커스·뷰포트·미로드 안내)',
    shortSha: '65da4036',
    fullSha: '65da4036cec52f1d5b048855a51085c9b7503264',
    featureParentShortSha: '7b2db38b',
    featureParentFullSha: '7b2db38b2d7050b5aebc0d206952662b97e4e7f7',
    committedAtUtc: '2026-11-07T13:11:54+00:00',
    featureParentCommittedAtUtc: '2026-11-07T13:11:40+00:00',
    sourceBranch: 'feat/character-keyboard-fixes-round5-20261107',
    expectedInMainAncestry: true,
    ownerScope: [
      'apps/character-lab/src/app/shell/',
      'docs/character-keyboard-fixes-round5-20261107/',
    ],
    requiredPaths: [
      'apps/character-lab/src/app/shell/InspectorTabs.test.tsx',
      'apps/character-lab/src/app/shell/InspectorTabs.tsx',
      'apps/character-lab/src/app/shell/TopBar.test.tsx',
      'apps/character-lab/src/app/shell/TopBar.tsx',
      'apps/character-lab/src/app/shell/panels/ExportPanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/ExportPanel.tsx',
      'apps/character-lab/src/app/shell/panels/PosePanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/PosePanel.tsx',
      'apps/character-lab/src/app/shell/panels/SlotPanel.test.tsx',
      'apps/character-lab/src/app/shell/panels/SlotPanel.tsx',
      'apps/character-lab/src/app/styles/character-lab.css',
      'docs/character-keyboard-fixes-round5-20261107/README.md',
      'docs/character-keyboard-fixes-round5-20261107/kbd05-unloaded-rig-guidance.png',
      'docs/character-keyboard-fixes-round5-20261107/keyboard-step1-pose-preset.png',
      'docs/character-keyboard-fixes-round5-20261107/keyboard-step2-joint-ik-edit.png',
      'docs/character-keyboard-fixes-round5-20261107/keyboard-step3-undo-redo.png',
      'docs/character-keyboard-fixes-round5-20261107/keyboard-step4-export-and-cancel.png',
      'docs/character-keyboard-fixes-round5-20261107/verification-report.json',
      'docs/character-keyboard-fixes-round5-20261107/viewport-1024x768-landscape.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-1440x900-desktop.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-1440x900-zoom200.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-320x640-portrait.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-390x844-portrait.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-640x320-landscape.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-768x1024-portrait.png',
      'docs/character-keyboard-fixes-round5-20261107/viewport-844x390-landscape.png',
    ],
  },
  {
    id: 'home-200-works',
    label: '홈 200작품 (Home 200작품 대규모 목록·성능 개선)',
    shortSha: '4b1be6d4',
    fullSha: null,
    featureParentShortSha: null,
    featureParentFullSha: null,
    committedAtUtc: null,
    featureParentCommittedAtUtc: null,
    sourceBranch: '미푸시 로컬 브랜치 (원격 origin/main 및 origin refs 미존재)',
    expectedInMainAncestry: false,
    missingStatus: 'MISSING_FROM_ORIGIN_MAIN_AND_REMOTE_REFS',
    ownerRole: '홈 200작품 담당 세션 (Home 도메인)',
    ownerScope: [
      'apps/web/src/domains/home/',
      'scripts/bench-toon-home-200.mjs',
    ],
    requiredPaths: [],
  },
  {
    id: 'brush-comparison',
    label: '브러시 (Brush Lab 동일 샘플 획 프리셋 A/B 비교 가독성·결과 보존)',
    shortSha: '01d8f995',
    fullSha: '01d8f99569ddc3fe0029dba504f37ac487427790',
    featureParentShortSha: '69008b4d',
    featureParentFullSha: '69008b4dcf1c22cb7880f59c7f469d2c5491982b',
    committedAtUtc: '2026-11-07T11:57:43+00:00',
    featureParentCommittedAtUtc: '2026-11-07T11:57:31+00:00',
    sourceBranch: 'feat/brush-comparison-round4-20261107',
    expectedInMainAncestry: true,
    ownerScope: [
      'apps/brush-lab/src/app/',
      'docs/brush-comparison-round4-20261107/',
    ],
    requiredPaths: [
      'apps/brush-lab/src/app/styles/brush-lab.css',
      'apps/brush-lab/src/app/ui/FamilyGallery.tsx',
      'apps/brush-lab/src/app/ui/LaneCanvas.tsx',
      'apps/brush-lab/src/app/ui/PresetCard.tsx',
      'apps/brush-lab/src/app/ui/PresetComparisonBar.tsx',
      'apps/brush-lab/src/app/ui/RecommendedCombos.tsx',
      'apps/brush-lab/src/app/views/CompareView.test.tsx',
      'apps/brush-lab/src/app/views/CompareView.tsx',
      'apps/brush-lab/src/app/views/GalleryView.test.tsx',
      'docs/brush-comparison-round4-20261107/README.md',
      'docs/brush-comparison-round4-20261107/browser-verification.json',
    ],
  },
  {
    id: 'catalog-provenance',
    label: '카탈로그 (탐색 크롤링 데이터 출처·수집시점·누락정보 및 작가·플랫폼 복원력)',
    shortSha: '75f34f8d',
    fullSha: '75f34f8dbf4a454ce0418c88c24700fa2523e3c9',
    featureParentShortSha: '0bc10e55',
    featureParentFullSha: '0bc10e551e99bd4e11b56ab525fff48cfd7e6161',
    committedAtUtc: '2026-11-07T12:25:40+00:00',
    featureParentCommittedAtUtc: '2026-11-07T12:17:58+00:00',
    sourceBranch: 'feat/catalog-provenance-round4-20261107',
    expectedInMainAncestry: true,
    ownerScope: [
      'apps/web/src/domains/catalog/',
      'docs/catalog-provenance-round4-20261107/',
    ],
    requiredPaths: [
      'apps/web/src/domains/catalog/AuthorPage.tsx',
      'apps/web/src/domains/catalog/AuthorsPage.tsx',
      'apps/web/src/domains/catalog/ExplorePage.tsx',
      'apps/web/src/domains/catalog/TagsPage.tsx',
      'apps/web/src/domains/catalog/TitleDetailHero.test.tsx',
      'apps/web/src/domains/catalog/TitleDetailHero.tsx',
      'apps/web/src/domains/catalog/TitleDetailPage.tsx',
      'apps/web/src/domains/catalog/TitleEpisodeSection.tsx',
      'apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx',
      'apps/web/src/domains/catalog/local-catalog-fallback.ts',
      'apps/web/src/domains/catalog/local-catalog-sanitize.ts',
      'docs/catalog-provenance-round4-20261107/README.md',
    ],
  },
]);

export const PR_2740_LATEST_STATUS = Object.freeze({
  prNumber: 2740,
  state: 'OPEN',
  branch: 'codex/character-package-panel-modules-20261107',
  title: 'fix(ci): 패키지 모듈 분리와 피드·태그 회귀 보정',
  initialHeadShortSha: 'f508de8f',
  initialHeadFullSha: 'f508de8fd00b9bb6bb40efa85751c90a9dfd62b6',
  latestHeadShortSha: 'c4fce43c',
  latestHeadFullSha: 'c4fce43c307fa5f124105e8cfb4719c1b9998d93',
  latestCommittedAt: '2026-11-07T21:41:36+09:00',
  prUpdatedAtUtc: '2026-11-07T13:07:25Z',
  mergeBaseWithMain: '9e85ad9b69fd5d820704fa32f66aa660fd40d0b4',
  aheadOfMain: 6,
  behindMain: 2,
  ciConclusion: 'SUCCESS',
  ciWorkflows: [
    {
      name: 'CI',
      runId: 42375379091,
      conclusion: 'SUCCESS',
      completedAtUtc: '2026-11-07T13:36:08Z',
      url: 'https://github.com/blue45f/toonstudio/actions/runs/42375379091',
    },
    {
      name: 'Architecture boundaries',
      runId: 42375379137,
      conclusion: 'SUCCESS',
      completedAtUtc: '2026-11-07T13:15:50Z',
      url: 'https://github.com/blue45f/toonstudio/actions/runs/42375379137',
    },
    {
      name: 'CodeQL',
      runId: 42375379077,
      conclusion: 'SUCCESS',
      completedAtUtc: '2026-11-07T13:32:08Z',
      url: 'https://github.com/blue45f/toonstudio/actions/runs/42375379077',
    },
    {
      name: 'Lighthouse CI',
      runId: 42375379078,
      conclusion: 'SUCCESS',
      completedAtUtc: '2026-11-07T13:16:08Z',
      url: 'https://github.com/blue45f/toonstudio/actions/runs/42375379078',
    },
  ],
  commitsSince354af37a: [
    {
      shortSha: 'f508de8f',
      fullSha: 'f508de8fd00b9bb6bb40efa85751c90a9dfd62b6',
      committedAt: '2026-11-07T19:47:42+09:00',
      subject: 'refactor(character-lab): 패키지 상세 표시를 독립 모듈로 분리한다',
      targetFiles: [
        'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
        'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx',
        'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.test.tsx',
      ],
    },
    {
      shortSha: '45f35ec2',
      fullSha: '45f35ec29b790457ec94263c4555a2465d512436',
      committedAt: '2026-11-07T21:23:18+09:00',
      subject: 'test(cuts): 피드 하이드레이션 경계를 결정적으로 검증한다',
      targetFiles: ['apps/web/src/domains/cuts/'],
    },
    {
      shortSha: '0474e1dc',
      fullSha: '0474e1dc5f7e7d271758a9079087c06b3271f981',
      committedAt: '2026-11-07T21:24:36+09:00',
      subject: 'chore(sync): 최신 main 변경을 CI 수정 브랜치에 반영한다',
      targetFiles: [],
    },
    {
      shortSha: 'abb378f1',
      fullSha: 'abb378f1dc62ac9aff9f578f08e8e9a6e05f9c98',
      committedAt: '2026-11-07T21:29:47+09:00',
      subject: 'chore(sync): 최신 카탈로그와 접근성 감사 변경을 반영한다',
      targetFiles: [],
    },
    {
      shortSha: '5a077ae0',
      fullSha: '5a077ae0a3999c12fc313cdb2cfb534c358e41b7',
      committedAt: '2026-11-07T21:36:11+09:00',
      subject: 'fix(catalog): 태그 목록 빈 상태의 한국어와 영어 번역을 등록한다',
      targetFiles: [
        'apps/web/src/domains/catalog/TagsPage.tsx',
        'apps/web/src/domains/catalog/catalog-status-i18n-r3c08.test.ts',
        'apps/web/src/domains/catalog/catalog-status-i18n.ts',
      ],
    },
    {
      shortSha: 'c4fce43c',
      fullSha: 'c4fce43c307fa5f124105e8cfb4719c1b9998d93',
      committedAt: '2026-11-07T21:41:36+09:00',
      subject: 'docs(character-lab): 키보드 감사 증거 링크를 저장소 상대경로로 수정한다',
      targetFiles: ['docs/character-keyboard-round4-20261107/README.md'],
    },
  ],
});

export const LATEST_MAIN_CI_STATUS = Object.freeze({
  mainHeadSha: '65da4036cec52f1d5b048855a51085c9b7503264',
  ciRunId: 42375861658,
  ciRunUrl: 'https://github.com/blue45f/toonstudio/actions/runs/42375861658',
  startedAtUtc: '2026-11-07T13:11:57Z',
  completedAtUtc: '2026-11-07T13:24:27Z',
  conclusion: 'failure',
  passingWorkflowsOn65da4036: [
    {
      name: 'Architecture boundaries',
      runId: 42375861677,
      conclusion: 'success',
      completedAtUtc: '2026-11-07T13:19:16Z',
    },
    {
      name: 'Market CC0 delivery',
      runId: 42375861657,
      conclusion: 'success',
      completedAtUtc: '2026-11-07T13:18:01Z',
    },
    {
      name: 'Cleanup merged branches and stale Actions runs',
      runId: 42375861596,
      conclusion: 'success',
      completedAtUtc: '2026-11-07T13:13:55Z',
    },
  ],
  failedItemsAndOwnership: [
    {
      id: 'ci-fail-1-package-panel-size',
      jobId: 128413172981,
      jobName: 'Core preflight and application typecheck',
      stepName: 'Source file size ratchet (no build, dependency-free)',
      status: 'failure (840줄 > 상한 800줄, 초과 +40줄)',
      targetFiles: [
        'apps/character-lab/src/app/shell/panels/PackagePanel.tsx',
        'apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx',
      ],
      ownerScope: 'PR #2740 (codex/character-package-panel-modules-20261107 @ f508de8f..c4fce43c)',
      resolutionStatusInOwnerScope:
        'PR #2740 커밋 f508de8f에서 PackageDetail.tsx(161줄) 분리로 PackagePanel.tsx를 708줄로 축소하여 PR CI(42375379091) 통과 완료 — 중복 수정 금지',
      duplicateFixForbidden: true,
    },
    {
      id: 'ci-fail-2-doc-links-round4-keyboard',
      jobId: 128413173274,
      jobName: 'Core regression shard / product',
      stepName: 'Run semantic regression shard (validate:documentation)',
      status: 'failure (문서 검증 실패: 63건 — file:/// 절대 경로 링크)',
      targetFiles: ['docs/character-keyboard-round4-20261107/README.md'],
      ownerScope:
        '문서 링크 CI 별도 담당 및 PR #2740 커밋 c4fce43c307fa5f124105e8cfb4719c1b9998d93',
      resolutionStatusInOwnerScope:
        'PR #2740 커밋 c4fce43c에서 docs/character-keyboard-round4-20261107/README.md의 링크를 저장소 상대 경로로 수정하여 PR CI(42375379091) 통과 완료 — 중복 보정 금지',
      duplicateFixForbidden: true,
    },
    {
      id: 'ci-fail-3-catalog-tags-empty-i18n',
      jobId: 128413173274,
      jobName: 'Core regression shard / product',
      stepName: 'Run semantic regression shard (catalog i18n contract)',
      status: '보정 완료 대기 (75f34f8d/0bc10e55 이후 태그 목록 빈 상태 한·영 번역 키 정합)',
      targetFiles: [
        'apps/web/src/domains/catalog/TagsPage.tsx',
        'apps/web/src/domains/catalog/catalog-status-i18n.ts',
        'apps/web/src/domains/catalog/catalog-status-i18n-r3c08.test.ts',
      ],
      ownerScope:
        '카탈로그 i18n 별도 담당 및 PR #2740 커밋 5a077ae0a3999c12fc313cdb2cfb534c358e41b7',
      resolutionStatusInOwnerScope:
        'PR #2740 커밋 5a077ae0에서 태그 목록 빈 상태 한국어·영어 번역을 등록하여 PR CI(42375379091) 통과 완료 — 중복 보정 금지',
      duplicateFixForbidden: true,
    },
  ],
});

export function buildRound5VerificationFixtureHtml(reportPayload) {
  const serialized = JSON.stringify(reportPayload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Round 5 통합 보존 후속 감사 대시보드</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #cbd5e1;
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
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Round 5 통합 보존 후속 감사 대시보드</h1>
      <p class="meta" id="head-summary"></p>
      <div class="toolbar" role="toolbar" aria-label="Round 5 감사 보기 전환">
        <button type="button" id="btn-commits" aria-pressed="true">신규 4개 커밋 Ancestry (3 포함 / 1 누락)</button>
        <button type="button" id="btn-pr2740" aria-pressed="false">PR #2740 최신 상태 (c4fce43c)</button>
        <button type="button" id="btn-ci" aria-pressed="false">최신 CI 및 담당 경계</button>
      </div>
    </header>
    <section aria-labelledby="commits-heading">
      <h2 id="commits-heading">1. 신규 4개 커밋(65da4036, 4b1be6d4, 01d8f995, 75f34f8d) Ancestry 검증</h2>
      <div class="grid" id="commit-grid"></div>
    </section>
    <section aria-labelledby="detail-heading">
      <h2 id="detail-heading">2. 상태·대상 파일·담당 범위 상세</h2>
      <div id="detail-panel" class="card" aria-live="polite"></div>
    </section>
  </main>
  <script>
    const REPORT = ${serialized};
    document.getElementById('head-summary').textContent =
      \`origin/main HEAD: \${REPORT.mainHead.fullSha} | PR #2740 HEAD: \${REPORT.pr2740Status.latestHeadFullSha} | 검증 시각: \${REPORT.verifiedAtUtc}\`;

    const grid = document.getElementById('commit-grid');
    REPORT.targetCommits.forEach((c) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.setAttribute('data-commit-id', c.id);
      card.innerHTML = \`
        <div><strong>\${c.label}</strong></div>
        <div class="meta">요청 SHA: <code>\${c.shortSha}</code></div>
        <div class="\${c.inMainAncestry ? 'badge-ok' : 'badge-warn'}">
          \${c.inMainAncestry ? 'ANCESTOR_TRUE (' + c.presentFileCount + '/' + c.requiredFileCount + ' files)' : 'ANCESTOR_FALSE (원격 미보존·누락)'}
        </div>
      \`;
      grid.appendChild(card);
    });

    const detailPanel = document.getElementById('detail-panel');
    function renderDetail(mode) {
      if (mode === 'pr2740') {
        detailPanel.innerHTML = \`<strong>PR #2740 (\${REPORT.pr2740Status.latestHeadShortSha}) — CI \${REPORT.pr2740Status.ciConclusion}</strong><p class="meta">f508de8f(PackageDetail 분리) + 5a077ae0(카탈로그 태그 빈 상태 i18n) + c4fce43c(키보드 문서 상대링크 수정) 포함. origin/main(65da4036) 대비 ahead \${REPORT.pr2740Status.aheadOfMain}, behind \${REPORT.pr2740Status.behindMain}.</p>\`;
      } else if (mode === 'ci') {
        detailPanel.innerHTML = \`<strong>origin/main(65da4036) CI Run \${REPORT.latestMainCi.ciRunId}: \${REPORT.latestMainCi.conclusion}</strong><p class="meta">차단 요인(PackagePanel.tsx 840줄, docs/character-keyboard-round4-20261107/README.md 절대링크 63건, 카탈로그 태그 빈 상태 i18n)은 모두 별도 담당 및 PR #2740(c4fce43c) 범위에서 이미 보정 및 CI 통과 완료. 중복 수정 금지.</p>\`;
      } else {
        detailPanel.innerHTML = \`<strong>포함 3건 (65da4036, 01d8f995, 75f34f8d) / 누락 1건 (4b1be6d4 홈 200작품)</strong><p class="meta">4b1be6d4는 origin/main 및 원격 브랜치에 푸시되지 않은 로컬 전용 상태이며, 대상 범위는 apps/web/src/domains/home/ 및 scripts/bench-toon-home-200.mjs(홈 200작품 담당)입니다.</p>\`;
      }
    }
    renderDetail('commits');

    const buttons = [
      ['btn-commits', 'commits'],
      ['btn-pr2740', 'pr2740'],
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
