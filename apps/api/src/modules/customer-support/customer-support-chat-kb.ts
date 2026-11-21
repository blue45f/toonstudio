export type SupportChatTopicId =
  | "local-backup-opfs"
  | "wasm-webgpu-perf"
  | "bg3d-vrm-composite"
  | "photoshop-pro-lab"
  | "collab-os-locks"
  | "free-ai-zero-bill"
  | "rights-bom-license"
  | "export-billing"
  | "general";

export type CreatorSupportBriefCategory =
  | "story"
  | "production"
  | "staffing"
  | "rights"
  | "localization"
  | "environment";

export type SupportTicketUrgency = "high" | "normal" | "low";

export interface SupportActionLink {
  readonly id: string;
  readonly label: string;
  readonly to: string;
  readonly kind: "primary" | "secondary";
}

export interface SupportChatQuickPrompt {
  readonly id: string;
  readonly label: string;
  readonly topicId: SupportChatTopicId;
  readonly prompt: string;
}

export interface SupportKnowledgeEntry {
  readonly topicId: SupportChatTopicId;
  readonly labelKo: string;
  readonly creatorSupportCategory: CreatorSupportBriefCategory;
  readonly defaultUrgency: SupportTicketUrgency;
  readonly keywords: readonly string[];
  readonly replyKo: string;
  readonly followUpReplyKo: string;
  readonly steps: readonly string[];
  readonly followUpSteps: readonly string[];
  readonly actionLinks: readonly SupportActionLink[];
  readonly followUpPrompts: readonly string[];
  readonly diagnosticChecklist: readonly string[];
}

export interface MaskSensitiveResult {
  readonly masked: string;
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
}

export const SUPPORT_CHAT_QUICK_PROMPTS: readonly SupportChatQuickPrompt[] = Object.freeze([
  {
    id: "quick-recovery",
    label: "작업 파일 복구",
    topicId: "local-backup-opfs",
    prompt: "작업하던 원고 파일이 안 보여요. 로컬 백업과 OPFS에서 복구하는 방법을 알려주세요.",
  },
  {
    id: "quick-bg3d-vrm",
    label: "3D 배경·캐릭터 합성",
    topicId: "bg3d-vrm-composite",
    prompt: "3D 배경과 VRM 캐릭터를 자연스럽게 합성하고 선화를 맞추는 방법이 궁금해요.",
  },
  {
    id: "quick-perf",
    label: "느림/성능 개선",
    topicId: "wasm-webgpu-perf",
    prompt: "브러시가 끊기거나 캔버스가 느려요. Wasm64와 WebGPU 성능 점검 방법을 알려주세요.",
  },
  {
    id: "quick-free-ai",
    label: "무료 AI 한도 안내",
    topicId: "free-ai-zero-bill",
    prompt: "무료 AI ₩0 한도는 어떻게 작동하나요? 자동으로 유료 결제되지는 않나요?",
  },
  {
    id: "quick-collab-lock",
    label: "분업 잠금 해제",
    topicId: "collab-os-locks",
    prompt: "분업 OS에서 컷 슬라이스가 잠겨서 편집이 안 돼요. 잠금 해제 방법을 알려주세요.",
  },
  {
    id: "quick-export",
    label: "내보내기 오류",
    topicId: "export-billing",
    prompt: "원고를 이미지나 PDF로 내보낼 때 오류가 나요. 점검 순서와 해결 방법을 알려주세요.",
  },
]);

export const SUPPORT_CHAT_KNOWLEDGE_BASE: Readonly<Record<SupportChatTopicId, SupportKnowledgeEntry>> = {
  "local-backup-opfs": {
    topicId: "local-backup-opfs",
    labelKo: "로컬 백업·OPFS 복구",
    creatorSupportCategory: "production",
    defaultUrgency: "high",
    keywords: [
      "복구", "백업", "opfs", "sqlite", "저장", "사라졌", "날아갔", "휴지통",
      "임시", "버전", "원본", "유실", "안 보여", "초안", "로컬",
    ],
    replyKo:
      "원본 파일이 갑자기 보이지 않아도 브라우저 로컬 저장소(SQLite + OPFS)와 보관함에 기록이 남아 있는 경우가 많아요. 브라우저 캐시·사이트 데이터를 지우기 전에 아래 순서대로 복구 화면부터 확인해 주세요.",
    followUpReplyKo:
      "아직 원하는 시점이 보이지 않는다면 브라우저의 다른 프로필이나 시크릿 창 여부, 저장소 잔여 용량을 함께 확인해 주세요. 추가 데이터 덮어쓰기를 막기 위해 지금 상태에서 JSON 초안을 먼저 내보낸 뒤 담당자 연결을 권장해요.",
    steps: [
      "먼저 브라우저 캐시 삭제나 새로고침 반복을 멈춰 로컬 OPFS 원본을 보존하세요.",
      "복구 화면(/studio/recovery)과 휴지통(/studio/trash)에서 최근 자동 저장 스냅샷을 확인하세요.",
      "환경 진단(/studio/environment)에서 브라우저 저장소(OPFS) 쓰기 권한과 남은 용량을 점검하세요.",
    ],
    followUpSteps: [
      "같은 기기의 다른 브라우저(Chrome/Edge/Safari)나 다른 계정에 저장돼 있지 않은지 확인하세요.",
      "디스크 여유 공간이 1GB 미만이면 브라우저가 로컬 쓰기를 중단할 수 있어요.",
      "현재 프로젝트명·마지막 저장 시각을 적어 담당자 연결로 넘기시면 복구 가능 경로를 함께 확인해 드려요.",
    ],
    actionLinks: [
      { id: "act-recovery", label: "복구 화면 열기", to: "/studio/recovery", kind: "primary" },
      { id: "act-trash", label: "휴지통 확인", to: "/studio/trash", kind: "secondary" },
      { id: "act-env-storage", label: "저장소 상태 진단", to: "/studio/environment", kind: "secondary" },
    ],
    followUpPrompts: [
      "휴지통에도 없는데 복구할 수 있나요?",
      "로컬 백업 파일을 다른 기기로 옮기고 싶어요",
    ],
    diagnosticChecklist: [
      "복구 화면(/studio/recovery) 및 휴지통(/studio/trash) 확인 완료",
      "브라우저 종류·버전 및 시크릿 모드 여부 확인",
      "마지막으로 정상 저장된 시각과 작업 파일명 기록",
      "환경 진단에서 OPFS 저장소 권한·잔여 용량 확인",
    ],
  },
  "wasm-webgpu-perf": {
    topicId: "wasm-webgpu-perf",
    labelKo: "Wasm64·WebGPU 성능",
    creatorSupportCategory: "environment",
    defaultUrgency: "normal",
    keywords: [
      "느림", "느려", "끊김", "끊겨", "렉", "버벅", "성능", "webgpu", "wasm",
      "wasm64", "gpu", "메모리", "프레임", "지연", "크래시", "멈춤", "무거",
    ],
    replyKo:
      "브러시 지연이나 캔버스 끊김은 대부분 WebGPU 하드웨어 가속 비활성화, 고해상도 레이어 과다, 또는 Wasm64 메모리 한도 근접 때문에 생겨요. 환경 진단에서 GPU 상태를 먼저 확인하면 원인을 빠르게 좁힐 수 있어요.",
    followUpReplyKo:
      "하드웨어 가속을 켠 뒤에도 계속 버벅인다면 백그라운드 탭·화면 녹화 앱이 GPU 메모리를 점유하고 있을 가능성이 높아요. 캔버스 배율과 엔진 설정을 확인한 뒤 기기 사양과 함께 담당자 연결로 넘겨 주세요.",
    steps: [
      "사용 환경 진단(/studio/environment)에서 WebGPU·WebGL 가속 및 메모리 경고를 확인하세요.",
      "브라우저 설정에서 '가능한 경우 그래픽 가속 사용'을 켜고 탭을 새로 열어 주세요.",
      "안 쓰는 3D 뷰포트나 무거운 필터 레이어를 일시 숨김 처리하고 Wasm64 엔진 상태를 점검하세요.",
    ],
    followUpSteps: [
      "브라우저 작업 관리자에서 메모리 사용량이 높은 다른 탭을 닫아 주세요.",
      "모바일·태블릿이라면 캔버스 해상도를 1600px 이하 웹툰 표준 폭으로 테스트해 보세요.",
      "계속 멈춤이 반복되면 사용 기기·OS·브라우저 정보와 함께 담당자 연결을 이용해 주세요.",
    ],
    actionLinks: [
      { id: "act-env-perf", label: "환경·GPU 진단 실행", to: "/studio/environment", kind: "primary" },
      { id: "act-engines", label: "엔진 상태 확인", to: "/studio/engines", kind: "secondary" },
      { id: "act-manual-perf", label: "성능 가이드 보기", to: "/studio/manual", kind: "secondary" },
    ],
    followUpPrompts: [
      "모바일에서 브러시 지연이 심해요",
      "WebGPU가 지원 안 된다고 나오면 어떻게 하나요?",
    ],
    diagnosticChecklist: [
      "환경 진단(/studio/environment) WebGPU·WebGL 상태 확인",
      "브라우저 그래픽(하드웨어) 가속 활성화 확인",
      "캔버스 해상도(px) 및 레이어 개수 기록",
      "사용 중인 OS·브라우저·GPU(또는 모바일 기기명) 확인",
    ],
  },
  "bg3d-vrm-composite": {
    topicId: "bg3d-vrm-composite",
    labelKo: "3D 배경·VRM 합성",
    creatorSupportCategory: "production",
    defaultUrgency: "normal",
    keywords: [
      "3d", "배경", "vrm", "합성", "캐릭터", "포즈", "카메라", "원근",
      "선화", "npr", "렌더", "bg3d", "glb", "스케치업", "조명", "셰이퍼",
    ],
    replyKo:
      "3D 배경과 VRM 캐릭터를 한 컷에 자연스럽게 합치려면 카메라 초점거리(FOV)와 바닥 높이(Y=0)를 먼저 맞춘 뒤, NPR 선화·그림자 패스를 별도 레이어로 받아 채색하는 흐름이 가장 안정적이에요.",
    followUpReplyKo:
      "캐릭터가 바닥에서 뜨거나 선화가 깨져 보인다면 VRM 모델의 발 접지 기준점과 카메라 근접 클리핑(Near) 값을 확인해 보세요. 특정 파일에서만 오류가 나면 파일 형식(VRM/GLB)과 용량을 담아 담당자에게 넘길 수 있어요.",
    steps: [
      "3D 배경 작업실(/studio/bg3d)에서 컷 구도에 맞는 카메라 화각(FOV)과 광원 방향을 고정하세요.",
      "포즈 스튜디오(/studio/poser) 또는 캐릭터 셰이퍼에서 VRM 포즈를 맞춘 뒤 같은 화각으로 합성하세요.",
      "선화 추출(NPR)과 음영 레이어를 분리해 2D 캔버스에 올리면 말풍선·톤 보정이 쉬워져요.",
    ],
    followUpSteps: [
      "VRM 0.x/1.0 규격과 텍스처 해상도(4K 초과 여부)를 확인해 메모리 초과를 방지하세요.",
      "WebGL 컨텍스트가 초기화되면 다른 3D 탭을 닫고 작업실을 다시 열어 주세요.",
      "특정 GLB/VRM 파일 불러오기 실패는 파일 포맷·용량과 함께 담당자 연결로 제보해 주세요.",
    ],
    actionLinks: [
      { id: "act-bg3d", label: "3D 배경 작업실", to: "/studio/bg3d", kind: "primary" },
      { id: "act-poser", label: "포즈 스튜디오 열기", to: "/studio/poser", kind: "secondary" },
      { id: "act-shaper", label: "캐릭터 셰이퍼", to: "/studio/assets/characters/new", kind: "secondary" },
    ],
    followUpPrompts: [
      "VRM 모델이 불러와지지 않아요",
      "3D 선화 두께가 너무 굵게 나와요",
    ],
    diagnosticChecklist: [
      "사용 중인 3D 모델 포맷(VRM/GLB/SKP) 및 파일 용량 확인",
      "3D 배경과 VRM 카메라 화각(FOV)·바닥 기준 일치 여부 확인",
      "환경 진단(/studio/environment) 3D·WebGL 지원 여부 확인",
      "오류 발생 화면 단계(불러오기/포즈/선화 추출) 기록",
    ],
  },
  "photoshop-pro-lab": {
    topicId: "photoshop-pro-lab",
    labelKo: "포토샵 프로 랩·PSD/브러시",
    creatorSupportCategory: "production",
    defaultUrgency: "normal",
    keywords: [
      "포토샵", "psd", "psb", "브러시", "abr", "레이어", "마스크", "블렌드",
      "톤커브", "보정", "필터", "단축키", "프로 랩", "필압", "펜",
    ],
    replyKo:
      "포토샵 PSD 원고와 커스텀 브러시는 전용 가져오기·브러시 랩에서 그대로 이어서 작업할 수 있어요. 레이어 마스크·블렌드 모드가 다르게 보일 때는 색상 모드(RGB 8bit)와 클리핑 구조를 먼저 점검해 주세요.",
    followUpReplyKo:
      "특수 스마트 오브젝트나 CMYK PSD는 웹 캔버스에서 래스터화되거나 색감이 달라질 수 있어요. 가져오기 전 RGB 8bit 변환 여부를 확인하시고, 반복 변환 오류가 있으면 담당자 연결로 호환성 점검을 요청해 주세요.",
    steps: [
      "원고 가져오기(/studio/import)에서 PSD 파일을 RGB 8bit 기준으로 불러와 레이어 구조를 확인하세요.",
      "커스텀 브러시 감도·필압 곡선은 브러시 랩(/studio/assets/brushes/new)에서 조정할 수 있어요.",
      "단축키·레이어 보정 기능의 상세 안내가 필요하면 공식 가이드(/studio/manual)를 바로 열어 보세요.",
    ],
    followUpSteps: [
      "PSD 내 스마트 오브젝트·텍스트 레이어는 호환을 위해 사본 병합 여부를 먼저 확인하세요.",
      "태블릿 필압이 안 먹히면 브라우저 포인터 이벤트와 펜 드라이버(Windows Ink 등)를 점검하세요.",
      "문제가 남으면 PSD 크기·레이어 수와 함께 담당자 연결로 전달해 주세요.",
    ],
    actionLinks: [
      { id: "act-import-psd", label: "PSD·원고 가져오기", to: "/studio/import", kind: "primary" },
      { id: "act-brush-lab", label: "브러시 랩 열기", to: "/studio/assets/brushes/new", kind: "secondary" },
      { id: "act-manual-ps", label: "단축키·도구 가이드", to: "/studio/manual", kind: "secondary" },
    ],
    followUpPrompts: [
      "펜 필압이 적용되지 않아요",
      "PSD 블렌드 모드가 다르게 보여요",
    ],
    diagnosticChecklist: [
      "PSD 파일 색상 모드(RGB 8bit 여부) 및 파일 용량 확인",
      "레이어 마스크·클리핑·스마트 오브젝트 포함 여부 확인",
      "사용 중인 펜 태블릿 모델 및 OS 드라이버 설정 확인",
      "브러시 랩(/studio/assets/brushes/new) 테스트 스트로크 결과 기록",
    ],
  },
  "collab-os-locks": {
    topicId: "collab-os-locks",
    labelKo: "분업 OS 컷 슬라이스·잠금",
    creatorSupportCategory: "staffing",
    defaultUrgency: "high",
    keywords: [
      "분업", "잠금", "락", "lock", "슬라이스", "컷", "협업", "어시스트",
      "동시", "충돌", "권한", "팀원", "인계", "동기화", "배정",
    ],
    replyKo:
      "분업 OS에서 컷 슬라이스가 잠겨 편집되지 않는 것은 다른 팀원이 해당 컷을 점유 중이거나, 비정상 종료된 이전 세션의 잠금이 아직 남아 있기 때문이에요. 프로덕션 허브에서 점유자를 확인하고 안전하게 해제할 수 있어요.",
    followUpReplyKo:
      "점유 중인 팀원이 이미 작업을 끝냈는데도 잠금이 풀리지 않는다면, 프로젝트 관리자(PD/작가) 권한으로 잠금 인계를 실행하거나 처리 중 작업 대기열을 새로고침해 주세요. 권한 충돌이 계속되면 담당자 연결로 프로젝트 ID를 남겨 주세요.",
    steps: [
      "프로덕션 허브(/production)에서 해당 회차의 컷 슬라이스 담당자와 잠금 소유자를 확인하세요.",
      "이전 브라우저 탭이 열려 있다면 닫고 10~15초 뒤 자동 해제되는지 먼저 확인하세요.",
      "작업 중 충돌이 있다면 변경 사본을 로컬 저장한 뒤 프로젝트 관리자 권한으로 잠금을 인계받으세요.",
    ],
    followUpSteps: [
      "처리 중 작업(/studio/jobs)에 멈춘 동기화 작업이 없는지 확인하세요.",
      "협업 팀원의 초대 역할(편집자/뷰어)이 변경되지 않았는지 프로젝트 설정에서 확인하세요.",
      "계속 잠금이 고정돼 있으면 프로젝트명·컷 번호와 함께 담당자 연결로 요청해 주세요.",
    ],
    actionLinks: [
      { id: "act-production", label: "분업·프로덕션 허브", to: "/production", kind: "primary" },
      { id: "act-jobs", label: "처리 중 작업 확인", to: "/studio/jobs", kind: "secondary" },
      { id: "act-ecosystem", label: "협업 생태계 열기", to: "/studio/ecosystem", kind: "secondary" },
    ],
    followUpPrompts: [
      "팀원이 나갔는데 잠금이 안 풀려요",
      "컷 슬라이스 역할을 다시 배정하고 싶어요",
    ],
    diagnosticChecklist: [
      "프로덕션 허브(/production)에서 현재 잠금 점유자 확인",
      "본인 또는 팀원의 중복 열린 탭 종료 여부 확인",
      "처리 중 작업(/studio/jobs) 대기·오류 항목 확인",
      "문제가 발생한 프로젝트명·회차·컷 번호 기록",
    ],
  },
  "free-ai-zero-bill": {
    topicId: "free-ai-zero-bill",
    labelKo: "무료 AI ₩0 한도·안전 차단",
    creatorSupportCategory: "environment",
    defaultUrgency: "low",
    keywords: [
      "무료", "ai", "0원", "₩0", "한도", "할당량", "과금", "요금", "토큰",
      "쿼터", "90%", "초기화", "자정", "무료 ai", "유료 전환",
    ],
    replyKo:
      "ToonStudio의 무료 AI 경로는 ₩0 Fail-Closed 원칙으로 동작해요. 무료 공급자 일일 한도의 90% 안전선에 도달하면 다음 무료 공급자로 자동 전환되거나 로컬 모드로 전환되며, 사용자의 동의 없이 자동으로 유료 과금되지 않아요.",
    followUpReplyKo:
      "일일 무료 할당량은 다음 UTC 자정(한국 시간 오전 9시)에 자동 초기화돼요. 그전에도 로컬 결정론적 보조 기능과 오프라인 도구는 ₩0으로 계속 쓰실 수 있어요. 현재 설정 상태는 AI 설정 화면에서 직접 확인할 수 있어요.",
    steps: [
      "AI 설정(/settings/ai?source=studio)에서 현재 연결된 무료 AI 상태와 한도 정책을 확인하세요.",
      "무료 할당량이 90% 안전선에 도달해도 유료 자동 결제는 차단(₩0)되며 한국 시간 오전 9시에 초기화돼요.",
      "즉시 작업이 필요하면 생성형 제작(/studio/generate)의 로컬·기본 보조 모드로 이어서 작업하세요.",
    ],
    followUpSteps: [
      "개인 외부 API 키를 직접 연결한 경우에는 해당 외부 서비스의 과금 정책이 별도로 적용될 수 있어요.",
      "AI 고객센터 자체는 항상 ₩0 무료 경로와 로컬 가이드만 사용합니다.",
      "계정별 별도 플랜이나 할당량 문의가 필요하면 담당자 연결로 남겨 주세요.",
    ],
    actionLinks: [
      { id: "act-ai-settings", label: "AI 설정·한도 확인", to: "/settings/ai?source=studio", kind: "primary" },
      { id: "act-generate", label: "AI 제작 보조 열기", to: "/studio/generate", kind: "secondary" },
      { id: "act-pricing-ai", label: "요금·플랜 안내", to: "/pricing", kind: "secondary" },
    ],
    followUpPrompts: [
      "무료 한도는 몇 시에 초기화되나요?",
      "내 개인 API 키를 쓰면 과금되나요?",
    ],
    diagnosticChecklist: [
      "AI 설정(/settings/ai?source=studio) 현재 모드 확인",
      "일일 무료 한도 초기화 시각(한국 오전 9시 / UTC 00:00) 확인",
      "외부 개인 API 키 입력 여부 구분",
      "사용하려던 AI 기능명과 화면 경로 기록",
    ],
  },
  "rights-bom-license": {
    topicId: "rights-bom-license",
    labelKo: "라이선스·Rights BOM·권리",
    creatorSupportCategory: "rights",
    defaultUrgency: "normal",
    keywords: [
      "라이선스", "bom", "rights", "저작권", "판권", "상업", "폰트", "출처",
      "에셋", "권리", "계약", "프리플라이트", "소재", "사용 허가",
    ],
    replyKo:
      "연재·출판·상업 배포 전에는 작품에 쓰인 브러시·폰트·3D 배경·에셋의 라이선스를 Rights BOM(권리 목록)으로 한 번에 점검해야 해요. 내보내기 전 권리 경고가 뜬 항목은 에셋 보관함과 라이선스 화면에서 출처를 확인할 수 있어요.",
    followUpReplyKo:
      "특정 외부 소재의 상업적 이용 범위나 계약·분쟁 판단은 AI가 법률 자문을 대신할 수 없어요. 문제가 된 에셋명과 사용 목적을 정리해 담당자 연결로 넘기시면 권리 확인 절차를 안내해 드려요.",
    steps: [
      "설치·라이선스(/studio/engines)와 에셋 보관함(/studio/assets)에서 사용 중인 소재의 상업 이용 조건을 확인하세요.",
      "출처 미확인 또는 비상업 전용 소재는 내보내기 전 대체 에셋으로 교체하세요.",
      "저작권·권리 기준은 저작권 안내(/copyright)에서 공식 정책을 확인할 수 있어요.",
    ],
    followUpSteps: [
      "외부에서 직접 가져온 폰트·3D 모델은 원작자 라이선스 문서를 프로젝트 폴더에 함께 보관하세요.",
      "판권·영상화 계약이나 분쟁 관련 문의는 담당자 연결로 비공개 접수해 주세요.",
    ],
    actionLinks: [
      { id: "act-licenses", label: "설치·라이선스 확인", to: "/studio/engines", kind: "primary" },
      { id: "act-assets", label: "에셋 보관함 열기", to: "/studio/assets", kind: "secondary" },
      { id: "act-copyright", label: "저작권·권리 안내", to: "/copyright", kind: "secondary" },
    ],
    followUpPrompts: [
      "상업 연재에 무료 폰트를 써도 되나요?",
      "내보내기 전 권리 경고를 어떻게 해소하나요?",
    ],
    diagnosticChecklist: [
      "경고가 표시된 에셋·폰트·3D 소재 이름 확인",
      "배포 목적(무료 공개 / 유료 연재 / 출판 / 2차 사업) 정리",
      "에셋 보관함(/studio/assets) 라이선스 태그 확인",
      "외부 구매·다운로드 영수증 또는 라이선스 URL 확보 여부 확인",
    ],
  },
  "export-billing": {
    topicId: "export-billing",
    labelKo: "내보내기 오류·결제/멤버십",
    creatorSupportCategory: "production",
    defaultUrgency: "high",
    keywords: [
      "내보내기", "export", "익스포트", "pdf", "png", "jpg", "슬라이스", "용량",
      "해상도", "결제", "환불", "구독", "멤버십", "영수증", "취소", "카드",
    ],
    replyKo:
      "원고 내보내기(세로 스크롤 이미지·PDF·PSD)가 중간에 멈추거나 실패한다면 캔버스 세로 길이 초과, 미해결 권리 경고, 또는 브라우저 메모리 부족이 주원인이에요. 결제·환불·멤버십 변경은 AI가 직접 처리할 수 없으므로 안전하게 담당자 연결로 안내해 드려요.",
    followUpReplyKo:
      "구간 분할 내보내기나 PDF 워크벤치에서도 같은 오류가 반복되거나 결제·환불 확인이 필요하다면, 아래 '담당자 연결'로 한 줄 문의만 남겨 주세요. 결제 수단 번호나 비밀번호는 절대 입력하지 마세요.",
    steps: [
      "내보내기 전 Rights BOM 권리 경고가 없는지, 세로 이미지 높이가 플랫폼 권장 규격(예: 분할 슬라이스)인지 확인하세요.",
      "PDF 병합·재배열 작업은 PDF 워크벤치(/studio/pdf-workbench)에서 페이지 단위로 나눠 시도해 보세요.",
      "구독·결제·환불 확인은 멤버십 화면(/membership)을 확인한 뒤 담당자 1:1 문의(/support)로 접수해 주세요.",
    ],
    followUpSteps: [
      "브라우저 팝업·다운로드 차단이 켜져 있으면 파일 저장이 조용히 막힐 수 있어요.",
      "환불·결제 오류는 주문 시각과 증상 한 줄만 적어 담당자 연결로 남겨 주세요(카드번호 입력 금지).",
    ],
    actionLinks: [
      { id: "act-pdf-workbench", label: "PDF 워크벤치 열기", to: "/studio/pdf-workbench", kind: "primary" },
      { id: "act-membership", label: "멤버십·구독 확인", to: "/membership", kind: "secondary" },
      { id: "act-support-desk", label: "1:1 고객센터 이동", to: "/support", kind: "secondary" },
    ],
    followUpPrompts: [
      "세로 웹툰 분할 내보내기 권장 규격이 궁금해요",
      "결제 취소나 환불을 요청하고 싶어요",
    ],
    diagnosticChecklist: [
      "내보내기 형식(PNG/JPG/PDF/PSD) 및 세로 길이·용량 확인",
      "브라우저 파일 다운로드 차단 해제 여부 확인",
      "내보내기 전 Rights BOM 라이선스 경고 여부 확인",
      "결제/환불 문의 시 카드번호 제외하고 결제 일시·증상만 기록",
    ],
  },
  general: {
    topicId: "general",
    labelKo: "일반 이용 안내",
    creatorSupportCategory: "story",
    defaultUrgency: "low",
    keywords: [],
    replyKo:
      "안녕하세요! ToonStudio AI 고객센터예요. 작업 파일 복구, 3D 배경·VRM 합성, 성능 개선, 포토샵 PSD/브러시, 분업 잠금 해제, 무료 AI ₩0 한도, 라이선스(Rights BOM), 내보내기까지 바로 안내해 드릴 수 있어요. 지금 막힌 상황을 편하게 한 문장으로 적어 주세요.",
    followUpReplyKo:
      "말씀해 주신 내용을 더 정확히 도와드리기 위해 어떤 화면(예: 에디터, 3D 배경, 내보내기, 분업 허브)에서 어떤 증상이 나타나는지 한 줄만 덧붙여 주세요. 바로 담당자와 연결하고 싶으시면 아래 '담당자 연결' 버튼을 눌러 주세요.",
    steps: [
      "상단의 6개 빠른 질문 칩을 누르면 자주 겪는 문제를 바로 해결할 수 있어요.",
      "사용법 전체가 궁금하다면 공식 가이드(/studio/manual)나 도움말 센터(/help)를 열어 보세요.",
      "직접 확인이 필요한 계정·결제·긴급 오류는 언제든 '담당자 연결'로 넘길 수 있어요.",
    ],
    followUpSteps: [
      "화면 주소나 눈에 보이는 오류 문구를 한 줄로 알려주시면 맞춤 해결 버튼을 띄워 드려요.",
      "사람 담당자 답변이 필요하면 '담당자 연결'에서 문의 한 줄만 확인해 주세요.",
    ],
    actionLinks: [
      { id: "act-manual", label: "공식 가이드 열기", to: "/studio/manual", kind: "primary" },
      { id: "act-help", label: "도움말 센터", to: "/help", kind: "secondary" },
      { id: "act-env", label: "사용 환경 진단", to: "/studio/environment", kind: "secondary" },
    ],
    followUpPrompts: [
      "작업 파일 복구 방법이 궁금해요",
      "무료 AI ₩0 한도를 확인하고 싶어요",
    ],
    diagnosticChecklist: [
      "문제가 발생한 화면 경로 확인",
      "원하는 결과와 실제 증상 1~2줄 정리",
      "브라우저·기기 환경 확인",
    ],
  },
};

const FOLLOW_UP_PATTERN =
  /(그래도|여전히|계속|해결\s*안|안\s*돼|안돼|안\s*풀|더\s*자세|다음\s*단계|어떻게\s*해|모바일|다시\s*시도|실패)/iu;

const HUMAN_ESCALATION_PATTERN =
  /(환불|결제\s*취소|계정\s*삭제|탈퇴|상담원|사람\s*담당|담당자\s*연결|법적|분쟁|해킹|도용|청구\s*오류)/iu;

const HIGH_URGENCY_PATTERN =
  /(유실|사라졌|날아갔|복구|잠금|락|결제|환불|오류|실패|크래시|멈춤|안\s*열려|긴급|마감)/iu;

interface MaskRule {
  readonly kind: string;
  readonly pattern: RegExp;
  readonly replace: string | ((match: string, ...groups: string[]) => string);
}

const SENSITIVE_MASK_RULES: readonly MaskRule[] = [
  {
    kind: "api_key",
    pattern:
      /\b(?:sk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16})\b/gu,
    replace: "[비밀키 마스킹됨]",
  },
  {
    kind: "auth_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/giu,
    replace: "Bearer [인증토큰 마스킹됨]",
  },
  {
    kind: "jwt_token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
    replace: "[인증토큰 마스킹됨]",
  },
  {
    kind: "resident_id",
    pattern: /\b\d{6}-[1-4]\d{6}\b/gu,
    replace: "[주민번호 마스킹됨]",
  },
  {
    kind: "card_number",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/gu,
    replace: "[카드번호 마스킹됨]",
  },
  {
    kind: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu,
    replace: "[이메일 마스킹됨]",
  },
  {
    kind: "phone",
    pattern: /(?<!\d)(?:01[016789]|02|0[3-6]\d)[-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/gu,
    replace: "[연락처 마스킹됨]",
  },
  {
    kind: "password",
    pattern: /((?:비밀번호|패스워드|password|passwd|pw)\s*[:=]\s*)(\S+)/giu,
    replace: (_match: string, prefix: string) => `${prefix}[비밀번호 마스킹됨]`,
  },
];

export function maskSensitiveSupportText(input: string): MaskSensitiveResult {
  let current = input;
  const detected = new Set<string>();
  for (const rule of SENSITIVE_MASK_RULES) {
    const next =
      typeof rule.replace === "string"
        ? current.replace(rule.pattern, rule.replace)
        : current.replace(rule.pattern, rule.replace);
    if (next !== current) {
      detected.add(rule.kind);
      current = next;
    }
  }
  return {
    masked: current,
    piiMasked: detected.size > 0,
    maskedKinds: [...detected],
  };
}

export function classifySupportTopic(
  text: string,
  previousTopicId?: SupportChatTopicId,
): {
  readonly topicId: SupportChatTopicId;
  readonly isFollowUp: boolean;
  readonly needsHumanEscalation: boolean;
  readonly urgency: SupportTicketUrgency;
} {
  const normalized = text.toLowerCase();
  let bestTopic: SupportChatTopicId = "general";
  let bestScore = 0;

  for (const entry of Object.values(SUPPORT_CHAT_KNOWLEDGE_BASE)) {
    if (entry.topicId === "general") continue;
    let score = 0;
    for (const keyword of entry.keywords) {
      if (normalized.includes(keyword)) {
        score += keyword.length >= 4 ? 3 : 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = entry.topicId;
    }
  }

  const isFollowUp =
    bestScore === 0
    && Boolean(previousTopicId)
    && previousTopicId !== "general"
    && (FOLLOW_UP_PATTERN.test(text) || text.trim().length <= 80);

  const topicId: SupportChatTopicId =
    bestScore > 0 ? bestTopic : isFollowUp && previousTopicId ? previousTopicId : "general";

  const needsHumanEscalation = HUMAN_ESCALATION_PATTERN.test(text) || isFollowUp;
  const baseUrgency = SUPPORT_CHAT_KNOWLEDGE_BASE[topicId].defaultUrgency;
  const urgency: SupportTicketUrgency =
    HUMAN_ESCALATION_PATTERN.test(text) || HIGH_URGENCY_PATTERN.test(text)
      ? "high"
      : baseUrgency;

  return { topicId, isFollowUp, needsHumanEscalation, urgency };
}

export function urgencyLabelKo(urgency: SupportTicketUrgency): string {
  if (urgency === "high") return "긴급 (작업 차단·유실·결제)";
  if (urgency === "normal") return "보통 (기능·성능 점검)";
  return "여유 (일반 이용 문의)";
}
