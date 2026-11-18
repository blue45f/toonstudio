import { dependencyReviewCommands, dependencyReviewDependencies, dependencyReviewPrs } from "./dependency-review-reference";
import { recordDefinitions } from "./dependency-review-types";

import type {
  DependencyReviewBoard, ReviewRecord, ReviewSnapshot,
} from "./dependency-review-types";

type RecordSeed = Omit<ReviewRecord,
  "id" | "category" | "snapshotSha" | "causeIds" | "provenance" | "sourceStatus" | "sourceResult"
  | "verificationSha" | "recordedResult" | "revision" | "updatedAt" | "edited"
> & { id: keyof typeof recordDefinitions };

/** 고정 SHA를 읽은 관측 기록이다. 화면을 열거나 보드를 새로 만들어도 시각을 갱신하지 않는다. */
const snapshot: ReviewSnapshot = {
  "sha": "45dbe47d7cc86b238054df608d5bff5757e8afab",
  "checkedAt": "2026-11-18T04:29:07Z",
  "commitAt": "2026-11-18T04:14:49Z",
  "commitUrl": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab",
  "ciUrl": "",
  "summary": "기준 main 45dbe47d의 manifest·lock에는 #2803의 두 원인 수정과 후속 deepmerge 강화 가드가 포함되어 있습니다. 기록된 빌드·Core product 성공은 과거 a2cf3525의 결과입니다. 현재 45dbe47d의 5개 검사 결과는 모두 미확인입니다."
};

const recordSeeds: RecordSeed[] = [
  {
    "id": "remotion",
    "title": "Remotion 4.0.541 · 4.0.543 중복",
    "group": "Remotion 버전 중복",
    "status": "main 머지 완료",
    "result": "소스 수정 반영",
    "historicalResult": "541/543 중복 실패 → 과거 a2cf3525 빌드 통과",
    "confidence": "원인·수정 소스 확인 / 현재 main 실행 미확인",
    "regression": "#2797 버전 분기 도입 / #2802 이전부터 존재",
    "summary": "루트와 제품 투어 패키지의 Remotion 버전이 갈렸던 문제입니다. #2803의 정렬 수정은 기준 main 45dbe47d에 포함되어 있으며, 과거 a2cf3525 빌드 통과와 현재 실행 미확인을 구분합니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "45dbe47d 소스·lock: remotion / @remotion/player / product-tour-film peer 모두 4.0.543. 실제 설치 상태는 미확인.",
    "expectedVersion": "4.0.543, 동일 React peer 조합의 패키지별 snapshot 1개 및 해당 SHA의 실행 증빙",
    "lockInterpretation": "#2797 전에는 .541 하나였고 #2797 merge에는 .541/.543이 공존했습니다. 기준 45dbe47d lock에는 .541이 없으며 remotion .543 snapshot 1개와 @remotion/player .543 snapshot 1개가 있습니다. workspace 링크는 packages/product-tour-film입니다.",
    "workspace": "루트(.) → packages/product-tour-film / apps/web 제품 투어",
    "impact": "프로덕션 빌드의 Remotion gate, Marketplace integrity 내 ProductTourPlayer suite 로드. Marketplace와 해당 suite는 중첩된 한 실패로 묶습니다.",
    "relatedFiles": "package.json\npackages/product-tour-film/package.json\npnpm-lock.yaml\napps/web/vite.config.ts\nscripts/check-product-tour-remotion-chunks.mjs\napps/web/src/domains/marketing/ProductTourPlayer.test.tsx",
    "testResults": "과거 a2cf3525의 CI 43971954681 production job은 2026-11-16T22:46:54Z에 remotion 1개·@remotion/player 1개를 확인하며 통과했습니다. 현재 45dbe47d의 프로덕션·Marketplace·ProductTourPlayer 실행 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666091980\nhttps://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617538\nhttps://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921\nhttps://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791200",
    "hypothesis": "root 의존성을 .543으로 갱신하면서 제품 투어 패키지의 고정 peer .541을 유지해 peer 그래프가 갈라졌습니다. 소스·lock·로그로 확인한 원인입니다.",
    "evidence": "#2797 root 버전 변경과 남아 있던 product-tour-film peer .541, lock 두 snapshot을 대조했습니다. #2802 이전 main b8429be8의 CI 43891309885에서도 같은 중복이 발생했습니다. #2803 merge a0d4b367은 기준 45dbe47d의 조상이며 현재 manifest·lock에 수정이 남아 있습니다.",
    "minimalFiles": "과거 최소 수정: packages/product-tour-film/package.json\npnpm-lock.yaml\n이미 main 포함 — 현재 추가 변경 필요성 미확인",
    "patchDraft": "과거 적용 패치 · 비교 전용 · 재적용 금지\nPR #2803 / 105dae4f41c16a7833557a6dd10a3bf88269f71e\n\npackages/product-tour-film/package.json\n- \"remotion\": \"4.0.541\"\n+ \"remotion\": \"4.0.543\"\n\npnpm-lock.yaml\n- product-tour-film importer: remotion 4.0.541\n+ product-tour-film importer: remotion 4.0.543\n- remotion@4.0.541 package와 snapshot\n\n기준 main 45dbe47d에 이미 반영되어 있습니다. 잠금파일을 수동 편집하거나 이 과거 패치를 다시 적용하지 않습니다.",
    "validation": "우선 45dbe47d의 기존 job·artifact를 확인합니다. 소스·lock 확인은 node scripts/check-product-tour-remotion-chunks.mjs --json, 정확히 같은 SHA의 기존 빌드 산출물이 있으면 --require-manifest --json을 사용합니다. manifest 없는 검사 결과를 전체 빌드 통과로 해석하지 않습니다.",
    "nextAction": "기존 패치를 재적용하지 않고 현재 45dbe47d의 빌드·Marketplace·ProductTourPlayer 증빙을 각각 연결합니다.",
    "verifiedAt": "2026-11-18T04:29:07Z",
    "notes": "검증일은 고정 SHA의 소스·병합 이력을 읽은 시각입니다. 현재 SHA의 설치·테스트 통과 시각이 아닙니다. Marketplace와 Player는 같은 과거 실패를 공유합니다.",
    "links": [
      {
        "label": "현재 root 선언",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/package.json"
      },
      {
        "label": "현재 제품 투어 peer",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/packages/product-tour-film/package.json"
      },
      {
        "label": "현재 잠금파일",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml"
      },
      {
        "label": "과거 a2cf3525 빌드 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666091980"
      },
      {
        "label": "#2802 이전 b8429be8 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791200"
      },
      {
        "label": "기존 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "deepmerge",
    "title": "deepmerge/package.json 소비 경로 누락",
    "group": "deepmerge 소비 경로",
    "status": "main 머지 완료",
    "result": "소스 수정 반영",
    "historicalResult": "MODULE_NOT_FOUND → 과거 a2cf3525 보안 계약 통과",
    "confidence": "소비 그래프·현재 강화 가드 확인 / 현재 실행 미확인",
    "regression": "#2797 소비 의존성 변경 / #2802 이전부터 존재",
    "summary": "nestjs-zod 5.6.0에서 deepmerge 소비 의존성이 사라졌지만 이전 보안 검사는 설치를 전제했습니다. 기준 main 45dbe47d는 #2803 수정과 후속 71cfafae의 잠금 그래프 확인을 함께 유지합니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "45dbe47d 소스: nestjs-zod ^5.6.0 → lock 5.6.0 / 로컬 deepmerge 포크 4.3.1+toonstudio.1. 실제 설치 상태는 미확인.",
    "expectedVersion": "소비 경로가 있으면 보안 포크 검증, 없으면 강제 설치 전제 없음",
    "lockInterpretation": "nestjs-zod 5.5.0 snapshot에는 deepmerge:file:patches/deepmerge가 있었고 5.6.0에는 없습니다. 기준 45dbe47d의 deepmerge package/snapshot은 없고 보안 override는 보존됩니다. 현재 테스트는 importer·snapshot 존재와 dependencies/optionalDependencies의 deepmerge 부재를 모두 확인해야 누락을 허용합니다.",
    "workspace": "apps/api → nestjs-zod / patches/deepmerge / 루트 보안 계약 검사",
    "impact": "Core regression product의 Node 계약 단계. 애플리케이션 런타임이 누락 모듈을 직접 호출했다는 증거는 아닙니다.",
    "relatedFiles": "apps/api/package.json\npnpm-workspace.yaml\npnpm-lock.yaml\nscripts/deepmerge-security-compat.test.mjs\npatches/deepmerge/package.json",
    "testResults": "과거 a2cf3525 / CI 43971954681 / job 133666092221에서 2026-11-16T22:43:24Z에 보안 소비 계약이 통과했습니다. 해당 Node 단계 29/29 및 이후 Vitest 425파일·4,526검사도 통과했습니다. 현재 45dbe47d 및 후속 강화 가드의 실행 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666092221\nhttps://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617763\nhttps://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791087",
    "hypothesis": "이전 nestjs-zod의 전이 의존성 설치를 무조건 resolve하던 테스트가 갱신된 소비 그래프와 불일치했습니다. Remotion과 독립적인 원인입니다.",
    "evidence": "전후 lock 소비 목록과 b8429be8·PR head 6d783058의 MODULE_NOT_FOUND 로그를 대조했습니다. #2803 수정 105dae4f는 main에 포함됐으며, 2026-11-17T01:12:49Z의 71cfafae24878a0d2c9e24972a7c1133050ab38e가 누락 허용 조건을 잠금 그래프로 강화한 소스도 현재 45dbe47d에 있습니다.",
    "minimalFiles": "과거 최소 수정: scripts/deepmerge-security-compat.test.mjs\n이미 main 포함 — 현행 잠금 그래프 강화 가드 보존",
    "patchDraft": "과거 수정 및 현행 가드 설명 · 재적용 금지\n#2803 / 105dae4f: 소비 경로에서 deepmerge가 있을 때 설치된 보안 포크를 검증하고 로컬 포크 바이트·타입·라이선스 검증은 유지했습니다.\n\n후속 71cfafae24878a0d2c9e24972a7c1133050ab38e의 현재 조건:\n1. 오류 코드가 MODULE_NOT_FOUND인지 확인\n2. lock.importers[\"apps/api\"].dependencies[\"nestjs-zod\"].version 존재 확인\n3. 해당 nestjs-zod lock snapshot 존재 확인\n4. dependencies와 optionalDependencies 모두 deepmerge를 요구하지 않는지 확인\n\n이 조건은 현재 45dbe47d 소스에 반영되어 있습니다. 단순 try/catch만 남긴 초기 패치로 되돌리거나 deepmerge를 근거 없이 강제 설치하지 않습니다.",
    "validation": "현재 SHA의 기존 증빙을 먼저 읽고 필요 시 기존 의존성이 있는 격리 checkout에서 node --test scripts/deepmerge-security-compat.test.mjs를 검증합니다. 과거 a2cf3525의 통과를 45dbe47d 및 강화된 가드의 통과로 승격하지 않습니다.",
    "nextAction": "현재 SHA의 강화된 보안 계약 실행 증빙을 확보합니다. 설치가 필요 없는 소비 그래프를 이유로 deepmerge를 추가하거나 보안 override를 제거하지 않습니다.",
    "verifiedAt": "2026-11-18T04:29:07Z",
    "notes": "원인 확인과 현재 소스 수정 확인만 완료했습니다. 이 기록은 현재 node_modules 설치·재현 결과가 아닙니다. 로컬 보안 포크 검증과 필요한 의존성 누락 차단을 모두 보존합니다.",
    "links": [
      {
        "label": "현재 강화된 보안 테스트",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/scripts/deepmerge-security-compat.test.mjs"
      },
      {
        "label": "현재 API 선언",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/package.json"
      },
      {
        "label": "현재 잠금 그래프",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml"
      },
      {
        "label": "과거 a2cf3525 product 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666092221"
      },
      {
        "label": "#2802 이전 b8429be8 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791087"
      },
      {
        "label": "후속 가드 강화",
        "url": "https://github.com/blue45f/toonstudio/commit/71cfafae24878a0d2c9e24972a7c1133050ab38e"
      },
      {
        "label": "기존 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "build",
    "title": "프로덕션 빌드",
    "group": "Remotion 버전 중복",
    "status": "미확인",
    "result": "미확인",
    "historicalResult": "6d783058 Remotion gate 실패 / a2cf3525 빌드 통과",
    "confidence": "과거 실행 증빙 확인 / 현재 main 실행 미확인",
    "regression": "#2802 이전부터 있던 Remotion 중복 / 현재 소스 수정 포함",
    "summary": "기준 main 45dbe47d의 프로덕션 빌드 결과는 미확인입니다. 과거 a2cf3525 빌드·Remotion gate 성공과 PR head 6d783058의 실패를 나란히 보존합니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "45dbe47d 소스 / Remotion 4.0.543; 빌드 결과 미확인",
    "expectedVersion": "동일 SHA의 프로덕션 빌드·후속 gate 성공",
    "lockInterpretation": "기준 45dbe47d lock은 Remotion과 player의 동일 React 19.3.1 peer snapshot이 각각 1개입니다. 소스 해석이 실제 산출물 검증을 대체하지 않습니다.",
    "workspace": "루트 / apps/api / apps/web",
    "impact": "프로덕션 산출물 생성과 필수 품질 gate",
    "relatedFiles": "package.json\npnpm-lock.yaml\napps/web/vite.config.ts\nscripts/check-product-tour-remotion-chunks.mjs\n.github/workflows/ci.yml",
    "testResults": "과거 a2cf3525 / run 43971954681 / job 133666091980은 성공했고 2026-11-16T22:46:54Z에 Remotion 1개·player 1개를 확인했습니다. 과거 PR head 6d783058 / run 43910171654 / job 133449617538은 2026-11-16T17:02:28Z에 541/543 중복으로 실패했습니다. 45dbe47d 실행 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666091980\nhttps://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617538",
    "hypothesis": "과거 실패는 컴파일 단계와 분리된 Remotion 중복 검사 실패였습니다.",
    "evidence": "a2cf3525 job conclusion=success와 단일 인스턴스 메시지, 6d783058 job conclusion=failure와 중복 메시지를 직접 확인했습니다. PR run 전체는 cancelled이고 빌드 개별 job은 failure입니다. 두 결과 모두 현재 기준 SHA의 실행이 아닙니다.",
    "minimalFiles": "새 변경 없음; Remotion 원인 항목의 기존 2파일 수정 참조",
    "patchDraft": "새 적용 패치 없음. Remotion 원인 카드의 #2803 과거 2파일 수정은 이미 main에 포함되어 재적용하지 않습니다.",
    "validation": "먼저 45dbe47d의 기존 빌드 결과·artifact를 확인합니다. 같은 SHA의 산출물이 있을 때만 --require-manifest --json으로 확인하고 다른 SHA의 dist를 최신 증빙으로 사용하지 않습니다.",
    "nextAction": "현재 45dbe47d production job의 SHA·실행 시각·로그를 확보하고 그때 실행 결과를 기록합니다.",
    "verifiedAt": "",
    "notes": "빌드 성공과 운영 배포를 구분합니다. 이 보드에는 빌드·배포를 실행하는 기능이 없습니다.",
    "links": [
      {
        "label": "과거 a2cf3525 빌드 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666091980"
      },
      {
        "label": "과거 6d783058 빌드 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617538"
      },
      {
        "label": "#2802 이전 b8429be8 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791200"
      },
      {
        "label": "현재 빌드 검사 소스",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/scripts/check-product-tour-remotion-chunks.mjs"
      }
    ]
  },
  {
    "id": "marketplace",
    "title": "Marketplace integrity",
    "group": "Remotion 버전 중복",
    "status": "미확인",
    "result": "미확인",
    "historicalResult": "6d783058: 176파일 통과 · 1파일 수집 실패",
    "confidence": "과거 실패 확인 / 현재 main 실행 미확인",
    "regression": "Remotion 원인과 동일 묶음",
    "summary": "과거 Marketplace 검사에서 ProductTourPlayer suite가 Remotion 중복 때문에 로드되지 않았습니다. 현재 main의 전체 Marketplace 결과는 확인하지 못했습니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "기준 45dbe47d / 과거 실패 PR head 6d783058",
    "expectedVersion": "현재 main SHA의 Marketplace 전체 결과",
    "lockInterpretation": "현재 root lock의 버전 중복은 해소됐지만 이 워크플로 전체의 통과 증빙을 대신하지 않습니다.",
    "workspace": "apps/web 마켓·마케팅 검사",
    "impact": "Marketplace integrity 전체 suite 및 제품 투어 모듈 로드",
    "relatedFiles": "apps/web/src/domains/marketing/ProductTourPlayer.test.tsx\npackages/product-tour-film/package.json\npnpm-lock.yaml",
    "testResults": "과거 PR head 6d783058 / run 43910171513 / job 133449615921에서 2026-11-16T16:45:19Z에 177파일 중 176통과·1실패, 실행된 검사 1,646개 통과를 확인했습니다. ProductTourPlayer는 import 단계에서 중단되어 0 test입니다. 현재 45dbe47d 직접 실행 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921",
    "hypothesis": "과거 실패는 Remotion 중복으로 확정. 현재 성공 여부는 별도 증빙이 필요합니다.",
    "evidence": "6d783058 로그의 Multiple versions of Remotion: 4.0.543 and 4.0.541와 실패 파일명이 일치합니다. 현재 45dbe47d의 Marketplace 실행 증빙은 확보하지 못했습니다.",
    "minimalFiles": "새 변경 없음; 기존 Remotion 수정에 연결",
    "patchDraft": "새 적용 패치 없음. 이미 main에 포함된 Remotion 수정에 연결하며 Marketplace 실패 항목을 별도 원인으로 중복 등록하지 않습니다.",
    "validation": "우선 45dbe47d의 기존 결과·artifact를 확인합니다. 증빙이 없다면 ProductTourPlayer 한 파일과 Marketplace 전체 검증의 범위를 구분해 후속 작업으로 기록합니다.",
    "nextAction": "현재 45dbe47d의 Marketplace job 링크를 확보합니다. 과거 실패를 현재 실패로, 다른 검사의 성공을 이 검사의 성공으로 옮기지 않습니다.",
    "verifiedAt": "",
    "notes": "ProductTourPlayer 행은 이 실패의 하위 검증 항목입니다. 원인 수와 실패 발생 수를 두 번 합산하지 않습니다.",
    "links": [
      {
        "label": "기준 Marketplace run · 과거 6d783058",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171513"
      },
      {
        "label": "과거 Player 수집 실패 job",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921"
      },
      {
        "label": "현재 잠금파일",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/pnpm-lock.yaml"
      }
    ]
  },
  {
    "id": "player",
    "title": "ProductTourPlayer.test.tsx",
    "group": "Remotion 버전 중복",
    "status": "미확인",
    "result": "미확인",
    "historicalResult": "6d783058 import 실패 · 0 test 수집",
    "confidence": "과거 수집 실패·현재 mock 소스 확인 / 현재 실행 미확인",
    "regression": "Marketplace 실패의 하위 항목",
    "summary": "과거에는 Remotion 중복 예외가 import 중 발생해 테스트가 실행되지 않았습니다. 현재 버전 정렬은 확인됐지만 이 파일의 현재 main 결과는 별도로 확인하지 못했습니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "45dbe47d 소스: Remotion / @remotion/player 4.0.543",
    "expectedVersion": "현재 SHA의 단일 파일 결과 + 실제 재생은 별도 검증",
    "lockInterpretation": "root와 product-tour-film peer 모두 .543으로 정렬됨. 단위 테스트 파일은 @remotion/player를 mock합니다.",
    "workspace": "apps/web/src/domains/marketing",
    "impact": "제품 투어 UI 단위 계약; 실제 브라우저 Remotion 재생·컨텍스트 인증은 별도",
    "relatedFiles": "apps/web/src/domains/marketing/ProductTourPlayer.test.tsx\npackages/product-tour-film/package.json\npnpm-lock.yaml",
    "testResults": "과거 6d783058의 Marketplace job 133449615921에서 ProductTourPlayer.test.tsx가 import 중 541/543 중복 예외로 실패하여 0 test였습니다. 과거 a2cf3525 Core product의 425파일 통과로 이 파일의 개별 결과를 추론하지 않습니다. 현재 45dbe47d 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921",
    "hypothesis": "과거 import 오류는 Remotion 중복. 현재 단독 통과 여부는 미확인입니다.",
    "evidence": "6d783058 실패 stack의 ProductTourPlayer.test.tsx·ProductTourRemotionComposition.tsx와 Remotion 버전 예외를 확인했습니다. 현재 45dbe47d 테스트 소스는 @remotion/player를 mock합니다.",
    "minimalFiles": "추가 수정 필요성 미확인",
    "patchDraft": "새 적용 패치 없음. 현재 peer·lock 정렬은 이미 main에 포함되어 있습니다. 단독 실행 증빙 없이 테스트를 고치거나 assertion을 완화하지 않습니다.",
    "validation": "기존 의존성이 있는 동일 SHA의 격리 checkout에서 pnpm exec vitest run apps/web/src/domains/marketing/ProductTourPlayer.test.tsx --maxWorkers=1을 검증할 수 있습니다. mock 결과를 실제 브라우저 재생 결과로 확대하지 않습니다.",
    "nextAction": "현재 45dbe47d의 단독 검사 로그를 연결합니다. 실제 재생은 별도 브라우저 증빙으로 기록합니다.",
    "verifiedAt": "",
    "notes": "Marketplace 항목과 같은 과거 실패입니다. 개별 검사 통계를 다른 suite 합계에 중복 합산하지 않습니다.",
    "links": [
      {
        "label": "현재 단위 테스트 소스",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/web/src/domains/marketing/ProductTourPlayer.test.tsx"
      },
      {
        "label": "과거 6d783058 수집 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171513/job/133449615921"
      },
      {
        "label": "현재 peer 선언",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/packages/product-tour-film/package.json"
      }
    ]
  },
  {
    "id": "core",
    "title": "Core regression product 샤드",
    "group": "deepmerge 소비 경로",
    "status": "미확인",
    "result": "미확인",
    "historicalResult": "6d783058 deepmerge 실패 / a2cf3525 425파일·4,526검사 통과",
    "confidence": "과거 단계별 로그 확인 / 현재 main 실행 미확인",
    "regression": "#2802 이전 deepmerge 계약 불일치 / 현재 소스 수정 포함",
    "summary": "기준 main 45dbe47d의 product 샤드 결과는 미확인입니다. 과거 a2cf3525에서 확인한 Node 계약·Vitest 성공은 이력으로 보존하며 이후 강화된 deepmerge 가드의 실행 증빙과 구분합니다.",
    "owner": "미지정",
    "priority": "P1",
    "currentVersion": "45dbe47d 소스 / nestjs-zod 5.6.0; 실행 결과 미확인",
    "expectedVersion": "Node 계약 단계와 product Vitest 단계 모두 성공",
    "lockInterpretation": "현재 nestjs-zod 소비 그래프에 deepmerge가 없음을 확인하는 강화된 가드가 있습니다. 현재 샤드 실행 결과는 별도로 필요합니다.",
    "workspace": "루트 product shard / scripts / apps/api / apps/web",
    "impact": "API 후속·저장소 계약과 제품 회귀 검사",
    "relatedFiles": "scripts/deepmerge-security-compat.test.mjs\nscripts/ci-core-regression-shards.mjs\nscripts/ci-core-regression-shards-impl.mjs\n.github/workflows/ci.yml",
    "testResults": "과거 a2cf3525 / CI 43971954681 / job 133666092221에서 Node 29/29, Vitest 425파일·4,526검사가 통과했습니다. 과거 6d783058 / CI 43910171654 / job 133449617763은 2026-11-16T16:55:21Z에 deepmerge/package.json resolve에서 실패했습니다. 현재 45dbe47d 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666092221\nhttps://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617763",
    "hypothesis": "과거 Node 계약 단계의 deepmerge resolve 실패가 product 회귀 전체를 차단했습니다.",
    "evidence": "a2cf3525 로그의 2026-11-16T22:43:24Z 보안 소비 계약 성공과 22:46:40Z Vitest 425파일·4,526검사 통과를 확인했습니다. 이 성공은 71cfafae의 후속 가드 강화 이전이며 현재 SHA 검증으로 재사용하지 않습니다.",
    "minimalFiles": "새 변경 없음; deepmerge 원인 항목의 기존 1파일 수정 참조",
    "patchDraft": "새 적용 패치 없음. 현재 deepmerge 원인 카드의 강화된 잠금 그래프 가드를 보존합니다. 과거 #2803 초기 패치로 되돌리지 않습니다.",
    "validation": "현재 45dbe47d의 기존 샤드 증빙을 먼저 확인합니다. 새로운 검증이 필요하면 deepmerge 단독 계약부터 범위를 정하고 남은 위험이 있을 때 product 샤드를 검증합니다.",
    "nextAction": "현재 45dbe47d의 Node 계약 단계와 product Vitest 단계 결과를 각각 확인하여 기록합니다.",
    "verifiedAt": "",
    "notes": "이 샤드 성공은 ProductTourPlayer 파일의 개별 결과나 Studio discovery 브라우저 성공을 대신하지 않습니다.",
    "links": [
      {
        "label": "과거 a2cf3525 product 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43971954681/job/133666092221"
      },
      {
        "label": "과거 6d783058 deepmerge 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171654/job/133449617763"
      },
      {
        "label": "#2802 이전 b8429be8 실패",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43891309885/job/133393791087"
      },
      {
        "label": "현재 강화된 보안 계약",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/scripts/deepmerge-security-compat.test.mjs"
      },
      {
        "label": "현재 샤드 정의",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/scripts/ci-core-regression-shards.mjs"
      }
    ]
  },
  {
    "id": "discovery",
    "title": "Studio discovery UX 브라우저 검사",
    "group": "Studio discovery 준비 상태",
    "status": "미확인",
    "result": "미확인",
    "historicalResult": "6d783058 팔레트 가시성 대기 120초 초과",
    "confidence": "과거 실패 지점 확인 / 근본 원인 미확정",
    "regression": "독립 원인 미확정",
    "summary": "과거 브라우저가 도구 팔레트 표시를 기다리다 120초 후 실패했습니다. 이 신호는 Remotion·deepmerge와 분리하며 현재 main 재검증 결과는 미확인입니다.",
    "owner": "미지정",
    "priority": "P2",
    "currentVersion": "기준 45dbe47d / 과거 실패 PR head 6d783058",
    "expectedVersion": "현재 SHA의 실제 브라우저 준비·키보드·편집 통합 검증",
    "lockInterpretation": "의존성 원인으로 귀속할 근거 없음",
    "workspace": "scripts/verify-studio-discovery-ux.mts / Studio UI",
    "impact": "Studio discovery의 반응형 키보드·편집기 통합. 기존 #2789 exhaustive 완료 건과 별도 추적합니다.",
    "relatedFiles": "scripts/verify-studio-discovery-ux.mts",
    "testResults": "과거 PR head 6d783058 / run 43910171390에서 focused와 build는 성공했지만 browser job 133455937271은 2026-11-16T17:04:25Z에 [data-studio-subtool-palette=\"true\"] 가시성 대기 120000ms를 초과했습니다. 현재 45dbe47d의 이 검사 결과는 미확인입니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43910171390/job/133455937271",
    "hypothesis": "팔레트 준비 상태·진입 경로·선택자 또는 이전 브라우저 오류 가능성이 있으나 근본 원인은 미확정입니다.",
    "evidence": "과거 6d783058 로그의 scripts/verify-studio-discovery-ux.mts:101:19와 TimeoutError를 확인했습니다. 이는 실패 위치 증빙이며 원인이나 신규 회귀 여부를 확정하는 증거는 아닙니다.",
    "minimalFiles": "미확인 — 재현·화면 증빙 확인 전 변경 파일 확정 금지",
    "patchDraft": "현재 적용할 패치 없음. 준비 상태·진입 경로·선택자·선행 오류를 대조하기 전 수정 파일이나 timeout 변경을 확정하지 않습니다.",
    "validation": "기존 실패 artifact의 화면·error-context를 먼저 읽습니다. 필요 시 동일 SHA의 환경에서 pnpm exec tsx scripts/verify-studio-discovery-ux.mts 전용 검사 범위를 정합니다. 전체 exhaustive로 확대하지 않습니다.",
    "nextAction": "현재 45dbe47d 전용 결과와 과거 실패 artifact를 대조해 준비 실패 원인을 분리합니다. Remotion·deepmerge 또는 #2789에 자동 귀속하지 않습니다.",
    "verifiedAt": "",
    "notes": "원인과 회귀 분류는 미확인입니다. 다른 SHA의 Core accessibility 성공이나 #2789 focused 성공을 이 전용 브라우저 검사의 성공으로 대체하지 않습니다.",
    "links": [
      {
        "label": "과거 6d783058 discovery run",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171390"
      },
      {
        "label": "과거 팔레트 timeout job",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43910171390/job/133455937271"
      },
      {
        "label": "현재 전용 검사 소스",
        "url": "https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/scripts/verify-studio-discovery-ux.mts"
      }
    ]
  },
  {
    "id": "approval-code",
    "title": "추가 코드 수정 승인",
    "group": "실행 승인",
    "status": "승인 대기",
    "result": "미실행",
    "historicalResult": "해당 없음",
    "confidence": "초기 승인 대기 기록 / 자동 실행 없음",
    "regression": "해당 없음",
    "summary": "의존성 후속 코드 수정의 대상·범위·패치 검토를 기록합니다.",
    "owner": "미지정",
    "priority": "P2",
    "currentVersion": "기준 main 45dbe47d; 후속 실행 대상은 별도 확정",
    "expectedVersion": "승인한 작업의 정확한 SHA·범위·근거",
    "lockInterpretation": "해당 없음",
    "workspace": "blue45f/toonstudio",
    "impact": "ToonStudio 소스·manifest·lock·테스트 변경",
    "relatedFiles": "추가 변경 범위 미확정",
    "testResults": "이 초기 항목에 후속 작업 실행 결과는 없습니다. 보드 기록 편집이나 완료된 과거 CI는 실행 승인·작업 수행을 의미하지 않습니다.",
    "ciLinks": "",
    "hypothesis": "해당 없음",
    "evidence": "Remotion·deepmerge의 기존 수정은 #2803을 통해 main에 포함되어 있습니다. 새로운 후속 작업은 중복 여부와 정확한 대상·검증·승인 근거를 따로 기록합니다.",
    "minimalFiles": "후속 변경 필요성 미확인",
    "patchDraft": "새 적용 패치 없음. 원인 카드의 과거 적용 패치는 비교용이며 재적용하지 않습니다.",
    "validation": "기존 수정·현재 대상 SHA·증빙·변경 중복을 먼저 확인합니다. 이 보드는 저장소·CI·운영 환경의 작업을 실행하지 않습니다.",
    "nextAction": "추가 수정 필요성이 확인되면 최소 변경 파일과 패치 검토를 기록합니다.",
    "verifiedAt": "",
    "notes": "승인 큐의 초기 상태는 승인 대기입니다. 이 보드의 상태 변경은 ToonStudio 코드 수정·원격 푸시·PR 병합·운영 배포를 실행하지 않습니다.",
    "links": [
      {
        "label": "기준 main 커밋",
        "url": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab"
      },
      {
        "label": "이미 병합된 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "approval-push",
    "title": "ToonStudio 원격 푸시 승인",
    "group": "실행 승인",
    "status": "승인 대기",
    "result": "미실행",
    "historicalResult": "해당 없음",
    "confidence": "초기 승인 대기 기록 / 자동 실행 없음",
    "regression": "해당 없음",
    "summary": "의존성 후속 변경의 원격 푸시 대상·브랜치·검증 근거를 기록합니다.",
    "owner": "미지정",
    "priority": "P2",
    "currentVersion": "기준 main 45dbe47d; 후속 실행 대상은 별도 확정",
    "expectedVersion": "승인한 작업의 정확한 SHA·범위·근거",
    "lockInterpretation": "해당 없음",
    "workspace": "blue45f/toonstudio",
    "impact": "blue45f/toonstudio 브랜치·원격 refs 변경",
    "relatedFiles": "추가 변경 범위 미확정",
    "testResults": "이 초기 항목에 후속 작업 실행 결과는 없습니다. 보드 기록 편집이나 완료된 과거 CI는 실행 승인·작업 수행을 의미하지 않습니다.",
    "ciLinks": "",
    "hypothesis": "해당 없음",
    "evidence": "Remotion·deepmerge의 기존 수정은 #2803을 통해 main에 포함되어 있습니다. 새로운 후속 작업은 중복 여부와 정확한 대상·검증·승인 근거를 따로 기록합니다.",
    "minimalFiles": "후속 변경 필요성 미확인",
    "patchDraft": "새 적용 패치 없음. 원인 카드의 과거 적용 패치는 비교용이며 재적용하지 않습니다.",
    "validation": "기존 수정·현재 대상 SHA·증빙·변경 중복을 먼저 확인합니다. 이 보드는 저장소·CI·운영 환경의 작업을 실행하지 않습니다.",
    "nextAction": "승인된 브랜치와 commit·검증 근거를 기록한 뒤 실제 푸시 결과를 별도 증빙으로 연결합니다.",
    "verifiedAt": "",
    "notes": "승인 큐의 초기 상태는 승인 대기입니다. 이 보드의 상태 변경은 ToonStudio 코드 수정·원격 푸시·PR 병합·운영 배포를 실행하지 않습니다.",
    "links": [
      {
        "label": "기준 main 커밋",
        "url": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab"
      },
      {
        "label": "이미 병합된 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "approval-merge",
    "title": "ToonStudio PR 병합 승인",
    "group": "실행 승인",
    "status": "승인 대기",
    "result": "미실행",
    "historicalResult": "해당 없음",
    "confidence": "초기 승인 대기 기록 / 자동 실행 없음",
    "regression": "해당 없음",
    "summary": "의존성 후속 PR의 병합 대상·head·필수 CI 근거를 기록합니다.",
    "owner": "미지정",
    "priority": "P2",
    "currentVersion": "기준 main 45dbe47d; 후속 실행 대상은 별도 확정",
    "expectedVersion": "승인한 작업의 정확한 SHA·범위·근거",
    "lockInterpretation": "해당 없음",
    "workspace": "blue45f/toonstudio",
    "impact": "blue45f/toonstudio의 신규·기존 PR 병합",
    "relatedFiles": "추가 변경 범위 미확정",
    "testResults": "이 초기 항목에 후속 작업 실행 결과는 없습니다. 보드 기록 편집이나 완료된 과거 CI는 실행 승인·작업 수행을 의미하지 않습니다.",
    "ciLinks": "",
    "hypothesis": "해당 없음",
    "evidence": "Remotion·deepmerge의 기존 수정은 #2803을 통해 main에 포함되어 있습니다. 새로운 후속 작업은 중복 여부와 정확한 대상·검증·승인 근거를 따로 기록합니다.",
    "minimalFiles": "후속 변경 필요성 미확인",
    "patchDraft": "새 적용 패치 없음. 원인 카드의 과거 적용 패치는 비교용이며 재적용하지 않습니다.",
    "validation": "기존 수정·현재 대상 SHA·증빙·변경 중복을 먼저 확인합니다. 이 보드는 저장소·CI·운영 환경의 작업을 실행하지 않습니다.",
    "nextAction": "실제 PR head와 필수 CI 및 중복 변경을 확인하고 병합 승인 근거를 기록합니다.",
    "verifiedAt": "",
    "notes": "승인 큐의 초기 상태는 승인 대기입니다. 이 보드의 상태 변경은 ToonStudio 코드 수정·원격 푸시·PR 병합·운영 배포를 실행하지 않습니다.",
    "links": [
      {
        "label": "기준 main 커밋",
        "url": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab"
      },
      {
        "label": "이미 병합된 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "approval-deploy",
    "title": "ToonStudio 운영 배포 승인",
    "group": "실행 승인",
    "status": "승인 대기",
    "result": "미실행",
    "historicalResult": "해당 없음",
    "confidence": "초기 승인 대기 기록 / 자동 실행 없음",
    "regression": "해당 없음",
    "summary": "운영 배포 대상·검증·롤백 계획을 별도 승인 항목으로 기록합니다.",
    "owner": "미지정",
    "priority": "P2",
    "currentVersion": "기준 main 45dbe47d; 후속 실행 대상은 별도 확정",
    "expectedVersion": "승인한 작업의 정확한 SHA·범위·근거",
    "lockInterpretation": "해당 없음",
    "workspace": "blue45f/toonstudio",
    "impact": "ToonStudio API·web·운영 인프라 배포",
    "relatedFiles": "추가 변경 범위 미확정",
    "testResults": "이 초기 항목에 후속 작업 실행 결과는 없습니다. 보드 기록 편집이나 완료된 과거 CI는 실행 승인·작업 수행을 의미하지 않습니다.",
    "ciLinks": "",
    "hypothesis": "해당 없음",
    "evidence": "Remotion·deepmerge의 기존 수정은 #2803을 통해 main에 포함되어 있습니다. 새로운 후속 작업은 중복 여부와 정확한 대상·검증·승인 근거를 따로 기록합니다.",
    "minimalFiles": "후속 변경 필요성 미확인",
    "patchDraft": "새 적용 패치 없음. 원인 카드의 과거 적용 패치는 비교용이며 재적용하지 않습니다.",
    "validation": "기존 수정·현재 대상 SHA·증빙·변경 중복을 먼저 확인합니다. 이 보드는 저장소·CI·운영 환경의 작업을 실행하지 않습니다.",
    "nextAction": "병합·검사 성공과 운영 배포를 구분합니다. 배포 대상·롤백·현재 운영 버전 및 별도 승인을 확인합니다.",
    "verifiedAt": "",
    "notes": "승인 큐의 초기 상태는 승인 대기입니다. 이 보드의 상태 변경은 ToonStudio 코드 수정·원격 푸시·PR 병합·운영 배포를 실행하지 않습니다.",
    "links": [
      {
        "label": "기준 main 커밋",
        "url": "https://github.com/blue45f/toonstudio/commit/45dbe47d7cc86b238054df608d5bff5757e8afab"
      },
      {
        "label": "이미 병합된 수정 PR #2803",
        "url": "https://github.com/blue45f/toonstudio/pull/2803"
      }
    ]
  },
  {
    "id": "archive2789",
    "title": "기존 Studio exhaustive 복구 · PR #2789",
    "group": "기존 완료",
    "status": "main 머지 완료",
    "result": "과거 범위 완료",
    "historicalResult": "focused·필수 CI 성공",
    "confidence": "병합 및 당시 job 성공 확인",
    "regression": "이번 의존성 원인과 별개",
    "summary": "기존 Studio exhaustive 준비 경로·GPU 응답 복구는 PR #2789에서 완료된 별도 기록으로 보관합니다. 이번 의존성 문제에 중복 등록하지 않습니다.",
    "owner": "미지정",
    "priority": "P3",
    "currentVersion": "병합 60384ae4 / 검증 head e603f4ec",
    "expectedVersion": "과거 검증 범위·증빙 유지",
    "lockInterpretation": "당시 Remotion .541 단일 버전. 이후 #2797 의존성 변경과 구분.",
    "workspace": "Studio helper·GPU·기존 exhaustive 경로",
    "impact": "PR #2789가 명시한 focused 11 gate와 당시 필수 CI 범위",
    "relatedFiles": ".github/workflows/studio-exhaustive-regressions.yml\nscripts/run-studio-exhaustive-regressions.mjs\nPR #2789 변경 72파일",
    "testResults": "과거 검증 head e603f4ec40cd5415fcf193fe631069c2c4251ac3의 focused run 43855142501 / job 133257374234에서 11개 gate 모두 passed, 필수 CI 43855142599의 13개 job 모두 success를 재확인했습니다. 현재 45dbe47d 전체 exhaustive 또는 61명령 성공을 의미하지 않습니다.",
    "ciLinks": "https://github.com/blue45f/toonstudio/actions/runs/43855142501/job/133257374234\nhttps://github.com/blue45f/toonstudio/actions/runs/43855142599",
    "hypothesis": "이전 준비 경로와 독립 GPU 품질 문제를 복구한 과거 완료 건입니다.",
    "evidence": "PR #2789 merged=true, merge 60384ae44bdb3c572ffbbfd5397c5f59d411d47d, mergedAt 2026-11-16T12:01:36Z. 과거 e603f4ec의 focused 로그 11개 gate와 필수 CI 13개 job 성공을 확인했습니다.",
    "minimalFiles": "해당 없음 — 이미 완료된 별도 PR",
    "patchDraft": "현재 작업용 패치 없음. 기존 #2789 변경을 재적용하지 않습니다.",
    "validation": "기존 완료 근거를 참조합니다. 이번 두 의존성 원인 때문에 전체 exhaustive를 중복 실행하지 않습니다.",
    "nextAction": "완료 보관. 새 SHA에서 별도 회귀가 확인될 때만 새 근거와 함께 독립 항목으로 등록합니다.",
    "verifiedAt": "2026-11-16T12:01:36Z",
    "notes": "완료 범위는 #2789의 과거 수정·검증입니다. 당시 미확정 SW reset·WebKit resize/animation 신호나 이후 discovery timeout까지 해결됐다고 확장하지 않습니다. 활성 의존성 원인 집계에서 제외합니다.",
    "links": [
      {
        "label": "완료 PR #2789",
        "url": "https://github.com/blue45f/toonstudio/pull/2789"
      },
      {
        "label": "focused 성공",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43855142501/job/133257374234"
      },
      {
        "label": "당시 필수 CI",
        "url": "https://github.com/blue45f/toonstudio/actions/runs/43855142599"
      },
      {
        "label": "병합 커밋",
        "url": "https://github.com/blue45f/toonstudio/commit/60384ae44bdb3c572ffbbfd5397c5f59d411d47d"
      }
    ]
  }
];

/** 호출 시각은 인터페이스 호환용이며 저장소 증빙의 관측 시각과 구분한다. */
export function createDependencyReviewBoard(_now = Date.now()): DependencyReviewBoard {
  return {
    schemaVersion: 1,
    kind: "toonstudio-dependency-review",
    snapshot: { ...snapshot },
    ttlHours: 24,
    records: recordSeeds.map(record => ({
      ...record,
      category: recordDefinitions[record.id].category,
      causeIds: [...recordDefinitions[record.id].causeIds],
      links: record.links.map(value => ({ ...value })),
      snapshotSha: snapshot.sha,
      provenance: "repository-snapshot",
      sourceStatus: "",
      sourceResult: "",
      verificationSha: "",
      recordedResult: "미확인",
      revision: 0,
      updatedAt: "",
      edited: false,
    })),
    dependencies: dependencyReviewDependencies.map(value => ({ ...value })),
    prs: dependencyReviewPrs.map(value => ({ ...value, changes: [...value.changes], ciLinks: value.ciLinks?.map(item => ({ ...item })) })),
    commands: dependencyReviewCommands.map(value => ({ ...value })),
    history: [],
    imports: [],
  };
}
