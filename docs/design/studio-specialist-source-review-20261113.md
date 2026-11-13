# Studio 전문 화면 소스 판정 · 2026-11-13

- 상태: **migration** — 2차 후보 소스의 정보 구조 판정이다. 전체 운영 기능 완료 보고가 아니다.
- 정본: 443 경로 소비지도 중 `studio_audit` 소유 108 URL을 빠짐없이 판정했다. 시안 editor 51분류를 실제 변경 경로 수로 사용하지 않는다.
- 방법: 실제 page source·router kind와 하위 mode·activeTab·section·view·hidden·details 분기를 확인했다. 소스 적합과 계정/API503/placeholder/GPU 제약을 구분한다.
- 변경 대상은 도구 메뉴·브러시·정밀 3D·tablet 캐릭터와 과밀 정문이다. document/command/history/ACL/GPU/persistence authority는 유지한다.

## 경로별 판정

| URL | 소스 판정 | 실제 소유자 | 실행 경계 |
| --- | --- | --- | --- |
| `/brush-lab` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/create` | 1차 재구성 | `CreateStartPage` · `CreateStartPage.tsx` | guest |
| `/create/challenges` | 별칭 정문 | `ShowcaseRedirect` · `creator-showcase-redirects.tsx` | redirect |
| `/create/promo` | 별칭 정문 | `ShowcaseRedirect` · `creator-showcase-redirects.tsx` | redirect |
| `/create/series/visual-audit` | 별칭 정문 | `ShowcaseDetailRedirect` · `creator-showcase-redirects.tsx` | redirect |
| `/create/visual-audit` | 별칭 정문 | `ShowcaseDetailRedirect` · `creator-showcase-redirects.tsx` | redirect |
| `/music` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/shaper` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio` | 1차 재구성 | `StudioHomeEntryRoute` · `StudioHomeEntryRoute.tsx` | local-project |
| `/studio/ai-lab` | 기존 분리 적합 | `PersonalInferencePage` · `PersonalInferencePage.tsx` | local-runner/API |
| `/studio/ai-runtime` | 별칭 정문 | `CreatorInferencePage` · `CreatorInferencePage.tsx` | redirect |
| `/studio/ai-settings` | 별칭 정문 | `StudioAiSettingsPage` · `StudioAiSettingsPage.tsx` | redirect/account |
| `/studio/analytics` | 기존 단일 목적 적합 | `CreatorAnalyticsPage` · `CreatorAnalyticsPage.tsx` | account/API/sample |
| `/studio/anchor-lab` | 2차 직접 재구성 | `AnchorLabPage` · `AnchorLabPage.tsx` | local-image/export |
| `/studio/animation` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/assets` | 기존 분리 적합 | `StudioAssetHubPage` · `StudioAssetHubPage.tsx` | account/project/API |
| `/studio/assets/3d` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/assets/audio` | 기존 순차 작업 적합 | `StudioMusicPage` · `StudioMusicPage.tsx` | account/music-service/local-import |
| `/studio/assets/brushes` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/assets/brushes/new` | 2차 직접 재구성 | `StudioBrushLabPage` · `StudioBrushLabPage.tsx` | local/brush-library |
| `/studio/assets/brushes/visual-audit/edit` | 2차 직접 재구성 | `StudioBrushLabPage` · `StudioBrushLabPage.tsx` | local/brush-library |
| `/studio/assets/characters/new` | 기존 분리 적합 | `CharacterShaperLandingPage` · `CharacterShaperLandingPage.tsx` | GPU |
| `/studio/bg3d` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/branching-cuttoon` | 2차 직접 재구성 | `BranchingCuttoonLabPage` · `BranchingCuttoonLabPage.tsx` | local-draft |
| `/studio/brush-lab` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/brushes` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/canvas` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/character` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/character-convert` | 기존 순차 작업 적합 | `StudioCharacterConversionPage` · `StudioCharacterConversionPage.tsx` | AI-service/GPU |
| `/studio/comic` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/companion/navigator` | 기존 분리 적합 | `companion` · `StudioToolsCompanionPage.tsx` | window/session |
| `/studio/companion/reference` | 기존 분리 적합 | `companion` · `StudioToolsCompanionPage.tsx` | window/session |
| `/studio/companion/review` | 기존 분리 적합 | `companion` · `StudioToolsCompanionPage.tsx` | window/session |
| `/studio/companion/workspace` | 기존 분리 적합 | `companion` · `StudioToolsCompanionPage.tsx` | window/session |
| `/studio/compose/visual-audit` | 기존 분리 적합 | `composition` · `StudioAiComicDirectorRoute.tsx` | session/account/API |
| `/studio/draft/visual-audit` | 2차 공유 도구 재구성 | `StudioDocumentWorkspaceRoute` · `StudioDocumentWorkspaceRoute.tsx` | document/ACL |
| `/studio/ecosystem` | 기존 분리 적합 | `CreatorEcosystemPage` · `CreatorEcosystemPage.tsx` | local-file/API |
| `/studio/ecosystem/viewer` | 기존 분리 적합 | `CreatorEcosystemViewerPage` · `CreatorEcosystemViewerPage.tsx` | local-file |
| `/studio/engines` | 2차 보조 구조 재구성 | `StudioEngineCenterPage` · `StudioProductionToolchainPage.tsx` | local-runner/API/license |
| `/studio/environment` | 기존 단일 목적 적합 | `CreatorEnvironmentGuidePage` · `CreatorEnvironmentGuidePage.tsx` | browser-capabilities |
| `/studio/generate` | 기존 순차 작업 적합 | `StudioGenerativePage` · `StudioGenerativePage.tsx` | AI-provider/account/API |
| `/studio/growth` | 기존 단일 목적 적합 | `CreatorGrowthLabPage` · `CreatorGrowthLabPage.tsx` | account/API |
| `/studio/growth-ip` | 기존 분리 적합 | `CreatorGrowthIpPage` · `CreatorGrowthIpPage.tsx` | account/API |
| `/studio/immersive` | 2차 직접 재구성 | `StudioImmersiveHubPage` · `StudioImmersiveHubPage.tsx` | GPU/XR/device |
| `/studio/import` | 기존 단일 목적 적합 | `StudioImportIntegratedPage` · `StudioImportIntegratedPage.tsx` | local-file/format |
| `/studio/jobs` | 2차 보조 구조 재구성 | `StudioProductionJobsPage` · `StudioProductionToolchainPage.tsx` | local-runner/API/license |
| `/studio/join` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/lift3d` | 기존 순차 작업 적합 | `lift3d` · `StudioLift3dPage.tsx` | local-image/GPU |
| `/studio/manual` | 기존 분리 적합 | `StudioManualPage` · `StudioManualPage.tsx` | static-content |
| `/studio/manual/visual-audit` | 기존 분리 적합 | `StudioManualPage` · `StudioManualPage.tsx` | static-content |
| `/studio/motion-webtoon` | 2차 직접 재구성 | `MotionWebtoonPage` · `MotionWebtoonPage.tsx` | local-document/GPU |
| `/studio/new` | 기존 순차 작업 적합 | `StudioNewIntegratedPage` · `StudioNewIntegratedPage.tsx` | local-project |
| `/studio/p/visual-audit` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/p/visual-audit/assets` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/d/visual-audit` | 2차 공유 도구 재구성 | `StudioDocumentWorkspaceRoute` · `StudioDocumentWorkspaceRoute.tsx` | document/ACL |
| `/studio/p/visual-audit/export` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/overview` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/production` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/review` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/settings` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/p/visual-audit/space` | 기존 캔버스 우선 적합 | `StudioVirtualSpacePage` · `StudioVirtualSpacePageRoot.tsx` | GPU/project/ACL |
| `/studio/p/visual-audit/story` | 기존 분리 적합 | `StudioProjectIntegratedPage` · `StudioProjectIntegratedPage.tsx` | project/ACL/API |
| `/studio/pdf-workbench` | 2차 직접 재구성 | `PdfWorkbenchPage` · `PdfWorkbenchPage.tsx` | local-PDF |
| `/studio/poser` | 기존 캔버스 우선 적합 | `StudioPoserPage` · `StudioPoserPage.tsx` | GPU |
| `/studio/present` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/projects` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/publish` | 기존 단일 목적 적합 | `publish` · `StudioPublishRoute.tsx` | document/ACL/API |
| `/studio/recovery` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/remix/visual-audit` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/animation` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/assets` | 기존 분리 적합 | `assets` · `StudioWorkAssetsRoute.tsx` | work/remix/API |
| `/studio/remix/visual-audit/bg3d` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/brush-lab` | 2차 직접 재구성 | `StudioBrushLabPage` · `StudioBrushLabPage.tsx` | local/brush-library |
| `/studio/remix/visual-audit/brushes` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/canvas` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/character` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/comic` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/compose/visual-audit` | 기존 분리 적합 | `composition` · `StudioAiComicDirectorRoute.tsx` | session/account/API |
| `/studio/remix/visual-audit/poser` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/remix/visual-audit/present` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/remix/visual-audit/review` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/remix/visual-audit/storyworld` | 기존 분리 적합 | `storyworld` · `StudioStoryworldRoute.tsx` | local-project/API |
| `/studio/remix/visual-audit/versions` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/review` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/share` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/space` | 기존 캔버스 우선 적합 | `StudioVirtualSpacePage` · `StudioVirtualSpacePageRoot.tsx` | GPU/project/ACL |
| `/studio/storyworld` | 기존 분리 적합 | `storyworld` · `StudioStoryworldRoute.tsx` | local-project/API |
| `/studio/support` | 2차 직접 재구성 | `StudioCreatorSupportPage` · `StudioCreatorSupportPage.tsx` | local-draft/export |
| `/studio/templates` | 기존 단일 목적 적합 | `StudioTemplatesPage` · `StudioTemplatesPage.tsx` | template/local-project |
| `/studio/toolchain` | 2차 보조 구조 재구성 | `StudioProductionToolchainPage` · `StudioProductionToolchainPage.tsx` | local-runner/API/license |
| `/studio/trash` | 별칭 정문 | `redirect` · `creator.routes.tsx` | redirect |
| `/studio/versions` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/work/visual-audit` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/animation` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/assets` | 기존 분리 적합 | `assets` · `StudioWorkAssetsRoute.tsx` | work/remix/API |
| `/studio/work/visual-audit/bg3d` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/brush-lab` | 2차 직접 재구성 | `StudioBrushLabPage` · `StudioBrushLabPage.tsx` | local/brush-library |
| `/studio/work/visual-audit/brushes` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/canvas` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/character` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/comic` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/compose/visual-audit` | 기존 분리 적합 | `composition` · `StudioAiComicDirectorRoute.tsx` | session/account/API |
| `/studio/work/visual-audit/poser` | 2차 공유 도구 재구성 | `editor` · `StudioEditorRoute.tsx` | local-project/GPU |
| `/studio/work/visual-audit/present` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/work/visual-audit/publish` | 기존 단일 목적 적합 | `publish` · `StudioPublishRoute.tsx` | document/ACL/API |
| `/studio/work/visual-audit/review` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |
| `/studio/work/visual-audit/storyworld` | 기존 분리 적합 | `storyworld` · `StudioStoryworldRoute.tsx` | local-project/API |
| `/studio/work/visual-audit/versions` | 기존 분리 적합 | `production` · `StudioProductionRoute.tsx` | account/API/review-token |

## 실제 소스의 정보 구조

| 소유 소스 | 판정 근거 |
| --- | --- |
| [creator-showcase-redirects.tsx](../../apps/web/src/app/routes/groups/creator-showcase-redirects.tsx) | Showcase 정문으로 전달하는 호환 화면이다. |
| [CharacterShaperLandingPage.tsx](../../apps/web/src/domains/creator/CharacterShaperLandingPage.tsx) | 공개 안내/editor=open을 분리한다. PC·모바일 기존6카테고리를 유지하며 새3분류 rail은 tablet 분기다. |
| [CreateStartPage.tsx](../../apps/web/src/domains/creator/CreateStartPage.tsx) | 두 핵심 선택과 section별 별도 시작 화면이다. |
| [StudioToolsCompanionPage.tsx](../../apps/web/src/domains/creator/StudioToolsCompanionPage.tsx) | effectiveSurface·mode로 작업/내비게이터/검수/참고를 hidden 분기한다. 창 배치는 details다. |
| [CreatorInferencePage.tsx](../../apps/web/src/domains/creator/ai/CreatorInferencePage.tsx) | 개인 AI Runtime 정문으로 넘기는 호환 표면이다. |
| [PersonalInferencePage.tsx](../../apps/web/src/domains/creator/ai/PersonalInferencePage.tsx) | 제작 공정 필터로 도구를 고르고 runtime 설정을 details로 연다. 실제 실행 연결과 구분한다. |
| [StudioAiSettingsPage.tsx](../../apps/web/src/domains/creator/ai/StudioAiSettingsPage.tsx) | 설정 정문으로 넘기는 호환 표면이다. |
| [CreatorAnalyticsPage.tsx](../../apps/web/src/domains/creator/analytics/CreatorAnalyticsPage.tsx) | 조회/유입/리텐션은 동일 분석 결과다. 로그인/오류/예시 opt-in을 분기한다. |
| [AnchorLabPage.tsx](../../apps/web/src/domains/creator/anchor-consistency/ui/AnchorLabPage.tsx) | 기본 입력·후보 검토 앞 비교 알고리즘을 고급 설정으로 접었다. 실제 열기·선택을 확인했다. |
| [BranchingCuttoonLabPage.tsx](../../apps/web/src/domains/creator/branching-cuttoon/BranchingCuttoonLabPage.tsx) | edit/play 분기를 유지하며 분기 검증을 별도 disclosure로 옮겼다. |
| [StudioBrushLabPage.tsx](../../apps/web/src/domains/creator/brush-lab/StudioBrushLabPage.tsx) | 고르기/조절/입력·엔진/질감·톤 4 URL과 미저장 인스턴스·recipe 재선택 경계 회귀를 추가했다. |
| [StudioCharacterConversionPage.tsx](../../apps/web/src/domains/creator/character-conversion/StudioCharacterConversionPage.tsx) | 변환 방향→원본→설정→미리보기·실행의 한 작업이다. 렌더 패스는 결과 안에서 선택한다. |
| [CreatorEcosystemPage.tsx](../../apps/web/src/domains/creator/ecosystem/CreatorEcosystemPage.tsx) | 11 topic panel은 active·hidden으로 하나씩 읽으며 SectionTabs/footer로 이동한다. |
| [CreatorEcosystemViewerPage.tsx](../../apps/web/src/domains/creator/ecosystem/CreatorEcosystemViewerPage.tsx) | loaded.kind별 beta 검토/review/제작 과정을 상호배타 렌더한다. 파일 전에는 빈 상태다. |
| [StudioGenerativePage.tsx](../../apps/web/src/domains/creator/generative/StudioGenerativePage.tsx) | 선택한 capability의 입력→결과 흐름이다. 선택적 설정은 details, 결과는 상태별 분기다. |
| [CreatorEnvironmentGuidePage.tsx](../../apps/web/src/domains/creator/growth-ip/CreatorEnvironmentGuidePage.tsx) | 현재 환경 진단·PWA·권장 조건을 한 진단 목적으로 읽고 추가 안내는 링크다. |
| [CreatorGrowthIpPage.tsx](../../apps/web/src/domains/creator/growth-ip/CreatorGrowthIpPage.tsx) | GrowthSectionTabs의 active pane 하나만 보여주며 성장·IP 작업을 나눈다. |
| [StudioLift3dPage.tsx](../../apps/web/src/domains/creator/lift3d/StudioLift3dPage.tsx) | 원화→피사체→형상→내보내기 한 작업, 원본/3D preview 탭이다. 권리·저장 경계를 유지한다. |
| [StudioManualPage.tsx](../../apps/web/src/domains/creator/manual/StudioManualPage.tsx) | articleId URL·검색·분류·목차 닫기·인쇄 경계를 제공하며 한 기사를 읽는다. |
| [MotionWebtoonPage.tsx](../../apps/web/src/domains/creator/motion-webtoon/MotionWebtoonPage.tsx) | 실제 모션 편집을 먼저 두고 scroll/depth 프리셋을 고급 설정으로 접었다. |
| [StudioMusicPage.tsx](../../apps/web/src/domains/creator/music/StudioMusicPage.tsx) | 보컬/BGM→브리프→결과·보관함이 한 저작 흐름이다. 고급 details와 생성 장애 시 음원 가져오기를 제공한다. |
| [PdfWorkbenchPage.tsx](../../apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx) | PDF 가져오기·페이지 조작을 먼저 두고 인쇄·색상을 disclosure로 분리했다. |
| [StudioPoserPage.tsx](../../apps/web/src/domains/creator/scene-3d/StudioPoserPage.tsx) | 정문에서 mannequin dialog가 즉시 열린다. 뒷면 benchmark 접기 시도는 실소비가 없어 철회했다. |
| [StudioImmersiveHubPage.tsx](../../apps/web/src/domains/creator/spatial/StudioImmersiveHubPage.tsx) | 3목적→읽기/제작흐름/키트/XR/기기 5 hash 화면이다. runtime·파일 선택과 legacy hash를 유지한다. |
| [StudioHomeEntryRoute.tsx](../../apps/web/src/domains/creator/studio-router/StudioHomeEntryRoute.tsx) | 작업 보관함 정문과 구주소 편집기 컨텍스트를 분리한다. |
| [StudioRouter.tsx](../../apps/web/src/domains/creator/studio-router/StudioRouter.tsx) | kind별 소유자에게 위임하며 자체 편집 본문으로 집계하지 않는다. |
| [StudioAiComicDirectorRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioAiComicDirectorRoute.tsx) | automationOpen·session.stage가 이야기/연출/제작/검수를 상호배타 렌더한다. 승인 revision을 유지한다. |
| [StudioEditorRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioEditorRoute.tsx) | 기존 adapter/workspace→LeftToolRail 전체도구 분류를 소비한다. canvas/comic clarity eligibility는 기존 조건이다. |
| [StudioProductionRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioProductionRoute.tsx) | HubPage→V2가 surface별 projects/review/versions/present/share/join을 상호배타 표시한다. |
| [StudioPublishRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioPublishRoute.tsx) | 문서 검수·게시 command center다. 외부 배포 패키지 /publish와 별도 소유다. |
| [StudioStoryworldRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioStoryworldRoute.tsx) | LabPage activeTab으로 대시보드/설정/이슈/개연성/데이터를 하나씩 연다. |
| [StudioWorkAssetsRoute.tsx](../../apps/web/src/domains/creator/studio-router/routes/StudioWorkAssetsRoute.tsx) | work/remix scope를 소재 허브로 넘기며 허브 view는 상호배타다. |
| [StudioAssetHubPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.tsx) | overview/essentials/series-kit/library/market/safety/seller를 URL view로 나누며 안내는 details다. |
| [StudioCreatorSupportPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioCreatorSupportPage.tsx) | 지원 영역을 먼저 두고 도움말·영상·브리프를 disclosure로 분리했다. 접어도 입력은 mounted 유지하며 전송하지 않는다. |
| [StudioDocumentWorkspaceRoute.tsx](../../apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceRoute.tsx) | project/document·draft/document를 통합 편집기로 연결한다. placeholder는 실문서 성공이 아니다. |
| [StudioImportIntegratedPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioImportIntegratedPage.tsx) | PanelImportEntry를 재사용하는 파일 가져오기 정문이다. 형식·오류 authority는 유지한다. |
| [StudioNewIntegratedPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioNewIntegratedPage.tsx) | /create의 lane을 받는 다음 단계 생성 양식이다. 선택 요약과 프로젝트 생성에 집중한다. |
| [StudioProjectIntegratedPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx) | section+view workflow다. pipeline 도구·export secondary checks·도움말은 details, 이야기 focus는 보조 안내를 접는다. |
| [StudioProjectLibraryPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx) | URL view로 보관함 화면을 나누고 새 작업을 /create로 통일했다. |
| [StudioTemplatesPage.tsx](../../apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx) | 검색·분류·규격으로 하나를 고르고 선택 미리보기에서 시작한다. |
| [StudioProductionToolchainPage.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx) | toolchain/engines/jobs mode는 별도 본문이다. 개요 전문 execution/receipt만 접어 실제3단계를 우선한다. |
| [StudioVirtualSpacePageRoot.tsx](../../apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePageRoot.tsx) | 프로젝트 scope 확인 후 공간 runtime을 연다. 일반 안내와 별도 공간·선택 속성 UI를 유지한다. |
| [CreatorGrowthLabPage.tsx](../../apps/web/src/domains/engagement/CreatorGrowthLabPage.tsx) | 한 프로젝트의 지표와 A/B 실험 저작·상태 관리다. 계정·실제 집계 검증과 구분한다. |

## 검증과 한계

- 전체 경로 게스트 관측과 별도로 실제 UI를 클릭했다. API503·동적 placeholder를 실제 계정/리소스 기능 성공으로 세지 않는다.
- 통합 편집기는 `/create`의 실제 버튼으로 로컬 문서를 만들고 390/1440에서 펜·지우개·전체 도구·화면 이동·레이어 로드·저장 선택 화면까지 확인했다. 파일 저장 완료와 구분한다.
- 브러시는 4 URL, query/hash·뒤로·포커스·이름 편집 및 DOM 인스턴스 보존을 확인했다. `applyRecipe` 명시 재선택 시 초기화하는 기존 회귀도 유지한다.
- 실제 캐릭터 PC/모바일 6카테고리는 기존 적합 구조다. 새 3분류 15슬롯 rail은 tablet 분기다. BG3D 3목적은 정밀 편집이며 기존 4단계 간편 화면과 구분한다.
- 각 source SHA-256·판정·실행 경계는 `.qa/studio-ux-phase2/studio-source-decisions.json`에 있다. 이 해시는 작업 후보 시점이며 최종 커밋 SHA와 별도로 확인한다.
