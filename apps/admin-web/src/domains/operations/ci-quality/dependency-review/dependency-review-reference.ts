import type { DependencyRow, PrComparison, ValidationCommand } from "./dependency-review-types";

export const dependencyReviewDependencies: DependencyRow[] = [
  {
    "name": "@remotion/player",
    "workspace": ".",
    "declared": "4.0.543",
    "resolved": "4.0.543(react-dom@19.3.1(react@19.3.1))(react@19.3.1)",
    "expected": "4.0.543; 동일 React peer 조합 1개",
    "interpretation": "7db0437b root importer와 React 19.3.1 peer 조합으로 해석되며 player snapshot은 1개입니다. 실제 설치·실행 결과는 미확인입니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/package.json"
  },
  {
    "name": "remotion",
    "workspace": ".",
    "declared": "4.0.543",
    "resolved": "4.0.543(react-dom@19.3.1(react@19.3.1))(react@19.3.1)",
    "expected": "4.0.543; 동일 React peer 조합 1개",
    "interpretation": "7db0437b root importer와 제품 투어 peer가 .543으로 수렴하며 .541 package/snapshot은 없습니다. 현재 빌드 결과와 구분합니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/package.json"
  },
  {
    "name": "@toonstudio/product-tour-film",
    "workspace": ". → packages/product-tour-film",
    "declared": "workspace:*",
    "resolved": "link:packages/product-tour-film",
    "expected": "로컬 workspace 링크",
    "interpretation": "7db0437b의 workspace:*는 link:packages/product-tour-film으로 연결됩니다. manifest와 lock에 기록된 로컬 workspace 해석입니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/package.json"
  },
  {
    "name": "remotion peer",
    "workspace": "packages/product-tour-film",
    "declared": "4.0.543",
    "resolved": "4.0.543(react-dom@19.3.1(react@19.3.1))(react@19.3.1)",
    "expected": "root와 동일 4.0.543",
    "interpretation": "#2797 당시 .541 고정 peer가 남았고 #2803에서 .543으로 맞췄습니다. 7db0437b 소스에도 유지되며 현재 실행은 미확인입니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/packages/product-tour-film/package.json"
  },
  {
    "name": "nestjs-zod",
    "workspace": "apps/api",
    "declared": "^5.6.0",
    "resolved": "5.6.0(@nestjs/common@12.5.0(reflect-metadata@0.2.2)(rxjs@7.8.2))(rxjs@7.8.2)(zod@4.6.7)",
    "expected": "lock consumer graph 확인; deepmerge 직접 의존 전제 없음",
    "interpretation": "7db0437b의 5.6.0 snapshot에는 @nestjs/common·rxjs·zod만 있고 deepmerge는 없습니다. 소비 그래프 확인과 실제 설치 검증을 구분합니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/apps/api/package.json"
  },
  {
    "name": "deepmerge",
    "workspace": "patches/deepmerge / 소비 경로 apps/api→nestjs-zod",
    "declared": "4.3.1+toonstudio.1 (로컬 포크); root 직접 의존성 없음",
    "resolved": "현재 package/snapshot 없음; override만 file:patches/deepmerge 보존",
    "expected": "필요 소비 경로가 있으면 보안 포크, 없으면 강제 설치 전제 금지",
    "interpretation": "7db0437b에 로컬 보안 포크 4.3.1+toonstudio.1과 override는 보존되고 lock package/snapshot은 없습니다. 71cfafae의 강화 가드가 소비 snapshot의 deepmerge 요구 여부를 확인합니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/patches/deepmerge/package.json"
  },
  {
    "name": "@remotion/cli + remotion",
    "workspace": "tools/media/brand-film (root workspace 밖)",
    "declared": "4.0.514",
    "resolved": "root pnpm-lock 대상 아님; 별도 lock/실행 미확인",
    "expected": "이번 중복 추적에서 분리",
    "interpretation": "7db0437b tools/media/brand-film 선언은 4.0.514입니다. 현행 workspace patterns 밖이고 root lock importer에도 없어 이번 .541/.543 중복 집계에서 제외합니다. 별도 설치·실행은 미확인입니다.",
    "url": "https://github.com/blue45f/toonstudio/blob/7db0437b0cfe6e0ec9f8bbc946d624f3c2019d0d/tools/media/brand-film/package.json"
  }
];

export const dependencyReviewPrs: PrComparison[] = [
  {
    "number": 2797,
    "title": "33개 의존성 갱신",
    "mergedAt": "2026-11-16T14:57:45Z",
    "sha": "53dcba5f5b0bc050dc56d93247c2f624ea0a78cf",
    "url": "https://github.com/blue45f/toonstudio/pull/2797",
    "commitUrl": "https://github.com/blue45f/toonstudio/commit/53dcba5f5b0bc050dc56d93247c2f624ea0a78cf",
    "changes": [
      "루트 remotion과 @remotion/player를 4.0.541 → 4.0.543으로 변경",
      "product-tour-film의 peer 4.0.541은 변경하지 않아 lock에 541/543이 공존",
      "API nestjs-zod 5.5.0 → 5.6.0 전환으로 lock 소비 그래프의 deepmerge 의존성이 사라짐",
      "PR은 루트·서브앱 manifest 6개와 pnpm-lock.yaml을 변경"
    ],
    "judgement": "두 원인의 소비 그래프 변화가 확인됩니다. #2802 이전 main b8429be8에서 두 실패가 관측되어 #2802의 신규 도입으로 분류하지 않습니다. 최초 실패 run 전체 이력을 주장하지 않습니다.",
    "files": "PR 변경 7파일",
    "role": "의존성 변화",
    "baseSha": "60384ae44bdb3c572ffbbfd5397c5f59d411d47d",
    "headSha": "10a57c8b5a525952c231b9de6f7200b96e513bdc",
    "ciLinks": [
      {
        "label": "#2797 이후·#2802 이전 main b8429be8 CI",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885"
      },
      {
        "label": "같은 main의 Remotion 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791200"
      },
      {
        "label": "같은 main의 deepmerge 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791087"
      }
    ]
  },
  {
    "number": 2802,
    "title": "전사 UI·접근성 고도화",
    "mergedAt": "2026-11-16T17:06:16Z",
    "sha": "2e8498cea4bc71ebd8cc2cac4bd0f10781353596",
    "url": "https://github.com/blue45f/toonstudio/pull/2802",
    "commitUrl": "https://github.com/blue45f/toonstudio/commit/2e8498cea4bc71ebd8cc2cac4bd0f10781353596",
    "changes": [
      "UI·접근성·스타일·문서·관련 테스트 60파일 변경",
      "package manifest와 pnpm-lock.yaml 직접 변경 없음",
      "지정 CI head는 6d783058이며 실제 PR 합성 checkout은 7898f087",
      "병합 커밋 2e8498ce와 기준 main 7db0437b 및 과거 성공 SHA a2cf3525를 구분"
    ],
    "judgement": "#2802 이전 main b8429be8에서도 Remotion·deepmerge가 동일하게 실패했습니다. 두 의존성 원인은 기존 문제이며 discovery timeout의 원인·회귀 여부는 미확인입니다.",
    "files": "60파일",
    "role": "비교 대상",
    "baseSha": "b8429be8ef243b2961638b08962944a765a9adb2",
    "headSha": "6d7830581811679b0122bdf6f006827426f9daa3",
    "checkoutSha": "7898f08708bdaf1fecfcb27eb832ff84e92430c6",
    "ciLinks": [
      {
        "label": "PR CI · run cancelled / 개별 build·product failure",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171654"
      },
      {
        "label": "PR Marketplace·Player 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921"
      },
      {
        "label": "PR discovery 브라우저 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171390/job/133455937271"
      }
    ]
  },
  {
    "number": 2803,
    "title": "통합 CI·WebSocket 및 의존성 정합화",
    "mergedAt": "2026-11-16T21:31:50Z",
    "sha": "a0d4b367c3be2c66c85770d25bb509b74ef1d821",
    "url": "https://github.com/blue45f/toonstudio/pull/2803",
    "commitUrl": "https://github.com/blue45f/toonstudio/commit/a0d4b367c3be2c66c85770d25bb509b74ef1d821",
    "changes": [
      "수정 105dae4f에서 product-tour-film peer와 lock을 .543으로 수렴",
      "deepmerge 설치 소비 경로를 조건부 검증하고 로컬 보안 포크 검증 유지",
      "기준 7db0437b는 merge a0d4b367을 포함하며 후속 71cfafae의 잠금 그래프 가드도 보존",
      "별도 Three·WebSocket·브라우저·출고 패널 변경은 두 원인의 최소 수정 파일과 구분"
    ],
    "judgement": "기존 수정이 기준 main 소스에 있어 재적용하지 않습니다. 아래 빌드·product 성공은 병합 이후 과거 a2cf3525 결과이며 현재 7db0437b 실행 결과는 미확인입니다.",
    "files": "46파일; 이번 두 원인의 핵심은 peer/lock 2파일 + 보안 테스트 1파일",
    "role": "기존 해결",
    "baseSha": "2e8498cea4bc71ebd8cc2cac4bd0f10781353596",
    "headSha": "7b5d5027146a64fa261192a323adedbab3856873",
    "ciLinks": [
      {
        "label": "병합 이후 과거 main a2cf3525 CI",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681"
      },
      {
        "label": "과거 a2cf3525 빌드 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666091980"
      },
      {
        "label": "과거 a2cf3525 product 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666092221"
      }
    ]
  },
  {
    "number": 2789,
    "title": "기존 Studio exhaustive 복구",
    "mergedAt": "2026-11-16T12:01:36Z",
    "sha": "60384ae44bdb3c572ffbbfd5397c5f59d411d47d",
    "url": "https://github.com/blue45f/toonstudio/pull/2789",
    "commitUrl": "https://github.com/blue45f/toonstudio/commit/60384ae44bdb3c572ffbbfd5397c5f59d411d47d",
    "changes": [
      "Studio helper·browser 진입 경로·GPU 응답 복구",
      "과거 e603f4ec focused 로그의 11 gate 및 당시 필수 CI 13 job 성공 확인",
      "미확정 SW·WebKit 신호와 전체 exhaustive 61명령은 완료 범위로 확장하지 않음"
    ],
    "judgement": "별도 완료 보관 항목입니다. 이번 의존성 원인·검증 집계에서 제외합니다.",
    "files": "72파일",
    "role": "기존 완료",
    "baseSha": "e430b9fbf637819517859eb813732eb76384da13",
    "headSha": "e603f4ec40cd5415fcf193fe631069c2c4251ac3",
    "ciLinks": [
      {
        "label": "과거 e603f4ec focused 11 gate 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43855142501/job/133257374234"
      },
      {
        "label": "과거 e603f4ec 필수 CI 13 job 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43855142599"
      }
    ]
  }
];

export const dependencyReviewCommands: ValidationCommand[] = [
  {
    "title": "Remotion 소스·잠금파일 검사",
    "command": "node scripts/check-product-tour-remotion-chunks.mjs --json",
    "scope": "dedupe 선언 및 lock snapshot",
    "cost": "기존 Node 환경에서 소스·lock 파일 확인",
    "limitations": "manifest가 없으면 산출물 검사는 skipped입니다. 전체 빌드 통과로 표시하지 않습니다. 현재 7db0437b의 실행 증빙은 미확인입니다."
  },
  {
    "title": "workspace importer 정합성",
    "command": "node scripts/verify-pnpm-lockfile.mjs",
    "scope": "workspace importer 누락·중복·잔재 확인",
    "cost": "기존 도구 환경에서 workspace·lock 파일 검사",
    "limitations": "패키지 API·peer 호환성 전체를 보증하지 않습니다. 현재 7db0437b에서 이 명령을 실행한 결과를 제공하는 기록이 아닙니다."
  },
  {
    "title": "deepmerge 보안 계약 단독 검사",
    "command": "node --test scripts/deepmerge-security-compat.test.mjs",
    "scope": "소비 snapshot·누락 허용 조건 및 로컬 보안 포크 계약",
    "cost": "기존 설치가 있는 격리 checkout에서 소규모",
    "limitations": "과거 a2cf3525 통과 이후 71cfafae에서 가드가 강화됐습니다. 현재 7db0437b의 강화된 검사 결과는 미확인이며 이 명령 표시는 실행 결과가 아닙니다."
  },
  {
    "title": "ProductTourPlayer 단일 파일",
    "command": "pnpm exec vitest run apps/web/src/domains/marketing/ProductTourPlayer.test.tsx --maxWorkers=1",
    "scope": "제품 투어 UI 단위 계약",
    "cost": "기존 설치를 사용하는 단일 파일",
    "limitations": "현재 7db0437b 실행은 미확인입니다. @remotion/player mock이 있어 이 단위 검사 결과가 실제 브라우저 재생 검증을 대신하지 않습니다."
  },
  {
    "title": "product 샤드 대상 확인",
    "command": "node scripts/ci-core-regression-shards.mjs --list",
    "scope": "실행 대상 목록 확인",
    "cost": "명세 읽기",
    "limitations": "대상 목록을 표시하는 명령이며 검사를 실행하지 않습니다. 목록 확인을 product 샤드 통과로 기록하지 않습니다."
  },
  {
    "title": "기존 빌드 manifest 확인",
    "command": "node scripts/check-product-tour-remotion-chunks.mjs --require-manifest --json",
    "scope": "같은 SHA로 생성된 기존 산출물과 잠금파일",
    "cost": "기존 정확한 SHA artifact 재사용 시 새 빌드 없음",
    "limitations": "과거 a2cf3525 빌드 성공만 확인했습니다. 현재 7db0437b와 다른 SHA의 dist를 가져와 최신 결과로 표시하지 않습니다."
  },
  {
    "title": "Studio discovery 브라우저 한정 검사",
    "command": "pnpm exec tsx scripts/verify-studio-discovery-ux.mts",
    "scope": "팔레트 준비·반응형 키보드·편집 통합",
    "cost": "브라우저 실행이 필요한 전용 검사",
    "limitations": "현재 7db0437b 결과와 원인은 미확인입니다. 먼저 과거 실패 screenshot·error-context를 확인하고 전체 exhaustive 실행으로 확대하지 않습니다."
  }
];
