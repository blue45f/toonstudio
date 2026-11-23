/** 로맨스 판타지 · 현대 판타지 · 무협 장르 서사·캐릭터·OST 팩. */
import {
  IDEA_PROMPT_PRESETS,
  PAL,
  type WebtoonGenreSpec,
} from "./idea-to-episode-catalog-shared";

export const FANTASY_MURIM_GENRE_PACKS: Readonly<Pick<Record<"romance-fantasy" | "modern-fantasy" | "murim", WebtoonGenreSpec>, "romance-fantasy" | "modern-fantasy" | "murim">> = {
  "romance-fantasy": {
    id: "romance-fantasy",
    label: { ko: "로맨스 판타지", en: "Romance Fantasy" },
    tagline: { ko: "회귀·황실 정치·고대 서약", en: "Regression, royal intrigue, sworn vows" },
    defaultLogline: IDEA_PROMPT_PRESETS[0].logline,
    titlePrefix: { ko: "태엽 서약", en: "Clockwork Vow" },
    timeProgression: ["dawn", "morning", "dusk", "night", "midnight"],
    characters: [
      {
        idSuffix: "seraphina",
        role: "protagonist",
        name: { ko: "세라피나 발렌", en: "Seraphina Valen" },
        appearanceAnchors: [
          { ko: "은빛 웨이브 장발 · 왼쪽 쇄골 작은 흉터", en: "Silver waist-length waves, faint collarbone scar" },
          { ko: "금빛 홍채 · 단호한 직선 눈썹", en: "Amber iris, sharp composed brows" },
          { ko: "허리선이 높은 벨벳 망토 실루엣", en: "High-waist velvet cloak silhouette" },
        ],
        lockedOutfitId: "outfit-rofan-velvet-gown-v1",
        lockedOutfitLabel: { ko: "자줏빛 황실 벨벳 코트 드레스", en: "Plum Imperial Velvet Coat Dress" },
        signaturePaletteTokens: [
          PAL.accent("메인 포인트 · 붉은 인장", "Primary · Crimson Wax Seal"),
          PAL.warn("금사 자수 장식", "Gold Thread Trim"),
          PAL.raised("벨벳 암부 톤", "Velvet Shadow Tone"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "정중한 존댓말 기반, 결단 순간만 짧게 단언",
          en: "Composed court formal tone; clipped declarations under pressure",
        },
        propsInventory: [
          { ko: "역행 황금 태엽시계", en: "Reversing Brass Pocket Watch" },
          { ko: "공작가 은인장 반지", en: "Ducal Silver Signet Ring" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "secret-bond", summary: { ko: "전생의 빚을 쥔 계약 동맹", en: "Contract ally bound by prior timeline" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "처형령을 서명한 황실 재상", en: "Chancellor behind the execution decree" } },
        ],
      },
      {
        idSuffix: "cassian",
        role: "deuteragonist",
        name: { ko: "카시안 북부대공", en: "Archduke Cassian" },
        appearanceAnchors: [
          { ko: "흑발 올백 · 왼쪽 귀 은색 체인", en: "Slicked obsidian hair, silver ear chain" },
          { ko: "차가운 청회색 눈동자", en: "Ice-blue steel eyes" },
          { ko: "각진 견장이 선명한 제복 어깨선", en: "Structured military cloak shoulders" },
        ],
        lockedOutfitId: "outfit-rofan-duke-uniform-v1",
        lockedOutfitLabel: { ko: "북부 기사단 흑청 정복", en: "Northern Order Midnight Uniform" },
        signaturePaletteTokens: [
          PAL.cool("서리빛 기사단 포인트", "Frost Knight Accent"),
          PAL.raised("흑청 제복 바탕", "Midnight Coat Base"),
          PAL.fgMuted("은장 견장 하이라이트", "Silver Epaulette Highlight"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "절제된 하오체·존댓말 혼용, 감정 억제",
          en: "Restrained aristocratic phrasing with sparse emotion",
        },
        propsInventory: [
          { ko: "서리 각인 장검", en: "Frost-Engraved Longsword" },
          { ko: "밀랍 봉인 밀서", en: "Wax-Sealed Dispatch" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "ally", summary: { ko: "진실을 의심하면서도 지켜보는 조력자", en: "Guarded protector testing her motive" } },
        ],
      },
      {
        idSuffix: "valerius",
        role: "antagonist",
        name: { ko: "발레리우스 재상", en: "Chancellor Valerius" },
        appearanceAnchors: [
          { ko: "백금 단발 · 단안경 체인", en: "Platinum crop, chained monocle" },
          { ko: "늘 미소 짓는 얇은 입매", en: "Calculated thin smile" },
        ],
        lockedOutfitId: "outfit-rofan-chancellor-robe-v1",
        lockedOutfitLabel: { ko: "금테 황실 재상 예복", en: "Gilded Chancellor Ceremonial Robe" },
        signaturePaletteTokens: [
          PAL.bad("위협적 적색 안감", "Threat Crimson Lining"),
          PAL.warn("황실 금장 브로치", "Imperial Gold Brooch"),
          PAL.raised("예복 흑요석 바탕", "Obsidian Robe Base"),
        ],
        speechRegister: "archaic",
        speechRegisterRule: {
          ko: "위압적인 궁정 고어체와 반어법 사용",
          en: "Elevated archaic court speech laced with irony",
        },
        propsInventory: [
          { ko: "위조된 칙령 두루마리", en: "Forged Imperial Edict Scroll" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "rival", summary: { ko: "가문의 유산을 노리는 배후", en: "Mastermind targeting the ducal vault" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-imperial-ballroom-chandelier", label: { ko: "황궁 샹들리에 연회장 3D", en: "Imperial Chandelier Ballroom 3D" }, lightingMood: { ko: "따뜻한 촛불 역광", en: "Warm candlelight rim" } },
      { presetId: "bg3d-clocktower-vault", label: { ko: "금지된 태엽 시계탑 내부 3D", en: "Forbidden Clocktower Vault 3D" }, lightingMood: { ko: "달빛 청색 샤프트", en: "Cold moonlight shafts" } },
      { presetId: "bg3d-rose-balcony-night", label: { ko: "장미 정원 석조 발코니 3D", en: "Stone Rose Balcony Night 3D" }, lightingMood: { ko: "안개 낀 야간 보케", en: "Misty nocturnal bokeh" } },
    ],
    sfxPool: {
      setup: [{ ko: "째깍…", en: "TICK..." }, { ko: "스르륵", en: "RUSTLE" }],
      development: [{ ko: "달칵", en: "CLICK" }, { ko: "웅성웅성", en: "MURMUR" }],
      turn: [{ ko: "콰직!", en: "CRACK!" }, { ko: "철컥!", en: "CLANK!" }],
      climax: [{ ko: "쿠웅—!", en: "BOOM!" }, { ko: "번쩍!", en: "FLASH!" }],
      cliffhanger: [{ ko: "댕—…", en: "CHIME..." }],
    },
    actDialogues: {
      setup: [
        { ko: "분명 처형대 위였는데… 3년 전 연회장이에요.", en: "I was at the scaffold—now it's 3 years ago." },
        { ko: "이번 생에서는 절대 먼저 무릎 꿇지 않겠어요.", en: "In this life, I will never kneel first." },
      ],
      development: [
        { ko: "공녀님, 시계탑 열쇠를 찾으시는 이유가 뭡니까?", en: "Lady Valen, why seek the tower key?" },
        { ko: "자정이 지나면 황실 금고가 통째로 바뀌니까요.", en: "At midnight, the imperial vault reseals." },
      ],
      turn: [
        { ko: "재상님, 그 인장은 이미 위조된 것 아닌가요?", en: "Chancellor, isn't that seal forged?" },
        { ko: "어린 공녀가 감히 칙령을 의심하느냐.", en: "You dare question the crown's own edict?" },
      ],
      climax: [
        { ko: "지금이에요, 태엽을 반대로 감아 주세요!", en: "Now, wind the main gear backwards!" },
        { ko: "시간의 틈이 열립니다. 물러서십시오!", en: "The time rift opens. Step back now!" },
      ],
      cliffhanger: [
        { ko: "멈춘 시계 뒤편에… 죽은 황태자의 인장이 떴다.", en: "Behind the gears, the dead prince's crest lit." },
      ],
    },
    beatTitles: {
      setup: { ko: "처형 직전 회귀와 연회장의 재개막", en: "Regression Awake in the Ballroom" },
      development: { ko: "북부대공과의 은밀한 거래", en: "Secret Pact with the Archduke" },
      turn: { ko: "위조 칙령 폭로와 시계탑 잠입", en: "Exposed Forgery at the Clocktower" },
      climax: { ko: "금지된 태엽 역행 가동", en: "Reverse Ignition of the Grand Gear" },
      cliffhanger: { ko: "봉인된 황태자 인장의 각성", en: "Awakening of the Sealed Crown Crest" },
    },
    hookQuestion: {
      ko: "태엽이 멈춘 순간 깨어난 진짜 배후는 누구인가?",
      en: "Who truly pulled the strings behind the halted clockwork?",
    },
    ost: {
      baseBpm: 92,
      keysByAct: { setup: "Eb major", development: "C minor", turn: "G minor", climax: "F minor", cliffhanger: "D minor" },
      calmInstruments: [{ ko: "하프시코드", en: "Harpsichord" }, { ko: "솔로 첼로", en: "Solo Cello" }, { ko: "실내 현악", en: "Chamber Strings" }],
      tensionInstruments: [{ ko: "시계 틱 퍼커션", en: "Clockwork Percussion" }, { ko: "스피카토 바이올린", en: "Spiccato Violins" }, { ko: "저음 피아노", en: "Low Piano" }],
      climaxInstruments: [{ ko: "풀 오케스트라", en: "Full Orchestra" }, { ko: "파이프 오르간", en: "Pipe Organ" }, { ko: "팀파니 롤", en: "Timpani Roll" }],
    },
  },

  "modern-fantasy": {
    id: "modern-fantasy",
    label: { ko: "현대 판타지", en: "Modern Fantasy" },
    tagline: { ko: "던전 게이트·헌터 각성·시스템창", en: "Urban rifts, hunter awakening, status UI" },
    defaultLogline: IDEA_PROMPT_PRESETS[1].logline,
    titlePrefix: { ko: "막차 각성자", en: "Last-Train Awakener" },
    timeProgression: ["dusk", "night", "night", "midnight", "midnight"],
    characters: [
      {
        idSuffix: "dohyun",
        role: "protagonist",
        name: { ko: "강도현", en: "Dohyun Kang" },
        appearanceAnchors: [
          { ko: "다크서클이 옅은 검은 숏컷", en: "Tired dark short hair, sharp jawline" },
          { ko: "각성 시 좌안에 뜨는 청색 모래시계 문양", en: "Blue hourglass glyph in left eye on cast" },
          { ko: "구겨진 넥타이와 반코트 실루엣", en: "Loosened tie and trench commuter coat" },
        ],
        lockedOutfitId: "outfit-mf-commuter-trench-v1",
        lockedOutfitLabel: { ko: "차콜 직장인 반코트·사원증", en: "Charcoal Commuter Trench & ID Badge" },
        signaturePaletteTokens: [
          PAL.cool("시간 각성 마나 글로우", "Chrono Mana Glow"),
          PAL.raised("차콜 수트 베이스", "Charcoal Suit Base"),
          PAL.accent("시스템 경고 테두리", "System Alert Trim"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "속마음은 현실적 반말, 대외 상황은 짧은 존댓말",
          en: "Grounded blunt internal voice, pragmatic under crisis",
        },
        propsInventory: [
          { ko: "금 간 스마트폰(시스템 연동)", en: "Cracked Phone Linked to Rift HUD" },
          { ko: "비상 탈출용 방화 망치", en: "Subway Emergency Hammer" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "ally", summary: { ko: "현장 통제팀 에이스 헌터", en: "Field vanguard hunter guiding survival" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "게이트 독점을 노리는 길드 이사", en: "Guild executive seizing rift rights" } },
        ],
      },
      {
        idSuffix: "seohee",
        role: "deuteragonist",
        name: { ko: "윤서희 팀장", en: "Captain Seohee Yoon" },
        appearanceAnchors: [
          { ko: "높게 묶은 다크 포니테일", en: "High dark ponytail, tactical earpiece" },
          { ko: "오른쪽 팔뚝 룬 전술 보호대", en: "Runic tactical brace on right forearm" },
        ],
        lockedOutfitId: "outfit-mf-guild-jacket-v1",
        lockedOutfitLabel: { ko: "특수대응팀 전술 방호 재킷", en: "Rift Response Tactical Jacket" },
        signaturePaletteTokens: [
          PAL.good("전술 스캐너 시그널", "Tactical Scanner Signal"),
          PAL.raised("방호 카본 직물", "Carbon Armor Weave"),
          PAL.cool("룬 에너지 라인", "Rune Conduit Line"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "명료한 지휘체·존댓말, 숫자 기반 상황 보고",
          en: "Crisp tactical commands with numeric status callouts",
        },
        propsInventory: [
          { ko: "고주파 마력 단검", en: "High-Frequency Mana Dagger" },
          { ko: "마력 농도 측정기", en: "Mana Density Meter" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "mentor", summary: { ko: "초보 각성자의 생존을 이끄는 전술가", en: "Tactician training the rookie awakener" } },
        ],
      },
      {
        idSuffix: "jaemin",
        role: "antagonist",
        name: { ko: "백재민 길드장", en: "Guildmaster Jaemin Baek" },
        appearanceAnchors: [
          { ko: "무테 안경과 백금 시계", en: "Rimless glasses and platinum watch" },
          { ko: "냉소적인 미소와 검은 가죽 장갑", en: "Cold smirk and black leather gloves" },
        ],
        lockedOutfitId: "outfit-mf-black-suit-v1",
        lockedOutfitLabel: { ko: "블랙 쓰리피스 수트·길드 배지", en: "Black Three-Piece Guild Suit" },
        signaturePaletteTokens: [
          PAL.bad("적색 보스 경보 톤", "Red Boss Warning Tone"),
          PAL.raised("수트 흑연 톤", "Graphite Suit Base"),
          PAL.warn("금장 길드 배지", "Gold Guild Insignia"),
        ],
        speechRegister: "formal",
        speechRegisterRule: {
          ko: "정중한 비즈니스 존댓말에 서늘한 협박 내포",
          en: "Polite corporate phrasing masking ruthless leverage",
        },
        propsInventory: [
          { ko: "S급 마석 수거 케이스", en: "S-Rank Mana Core Briefcase" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "rival", summary: { ko: "각성 능력을 매수하려는 거대 길드 수장", en: "Corporate lord hunting rare skills" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-seoul-subway-car-rift", label: { ko: "서울 2호선 막차 객실 균열 3D", en: "Seoul Line 2 Subway Rift 3D" }, lightingMood: { ko: "깜빡이는 형광등과 청색 균열광", en: "Flickering fluorescent and rift blue" } },
      { presetId: "bg3d-underground-platform-ruin", label: { ko: "붕괴된 지하철 환승 승강장 3D", en: "Collapsed Metro Platform 3D" }, lightingMood: { ko: "비상등 주홍빛 역광", en: "Emergency amber rim lights" } },
      { presetId: "bg3d-hunter-command-center", label: { ko: "헌터 협회 관제 브리지 3D", en: "Hunter Bureau Command Deck 3D" }, lightingMood: { ko: "홀로그램 계기판 반사광", en: "Holographic telemetry glow" } },
    ],
    sfxPool: {
      setup: [{ ko: "끼이익—", en: "SCREECH!" }, { ko: "지직…", en: "BZZT..." }],
      development: [{ ko: "띠링!", en: "DING!" }, { ko: "쿠르릉", en: "RUMBLE" }],
      turn: [{ ko: "콰아앙!", en: "CRASH!" }, { ko: "파직!", en: "ZAP!" }],
      climax: [{ ko: "우우웅—!", en: "VWOOM!" }, { ko: "쩍!", en: "SHATTER!" }],
      cliffhanger: [{ ko: "경고음—삐익!", en: "ALERT—BEEP!" }],
    },
    actDialogues: {
      setup: [
        { ko: "막차가 터널 한가운데서 멈췄다고?", en: "The last train stalled mid-tunnel?" },
        { ko: "창문 밖 선로가… 아예 사라졌어.", en: "The tracks outside just vanished." },
      ],
      development: [
        { ko: "[시스템] 히든 특성 '3초 되감기'가 각성했습니다.", en: "[SYSTEM] Hidden trait '3-Sec Rewind' unlocked." },
        { ko: "민간인 분, 뒤로 물러나세요. B급 이상 개체입니다!", en: "Civilian, fall back. Class-B entity ahead!" },
      ],
      turn: [
        { ko: "방금 3초 전으로… 탄환 궤도가 보였어!", en: "Three seconds back... I saw the strike path!" },
        { ko: "비각성자가 보스 공격을 맨눈으로 읽었다고요?", en: "An unranked civilian read a boss pattern?" },
      ],
      climax: [
        { ko: "지금 왼쪽 기둥! 2초 뒤에 균열 핵이 열립니다!", en: "Left pillar now! The rift core opens in two!" },
        { ko: "확인했습니다! 전 화력 집중!", en: "Confirmed! Focusing all output!" },
      ],
      cliffhanger: [
        { ko: "S급 게이트 잔여 00:01… 새 알림이 떴다.", en: "S-Rank timer at 00:01... a hidden prompt!" },
      ],
    },
    beatTitles: {
      setup: { ko: "막차 급정거와 검은 균열 출현", en: "Emergency Stop and Black Rift Spawn" },
      development: { ko: "시스템창 개방과 특수팀 합류", en: "System Awakening and Vanguard Entry" },
      turn: { ko: "3초 시간 역행 감각의 첫 발현", en: "First Activation of 3-Second Rewind" },
      climax: { ko: "균열 핵 파괴 협동 타격", en: "Coordinated Strike on the Rift Core" },
      cliffhanger: { ko: "길드장의 제안과 숨겨진 S급 퀘스트", en: "Guild Offer and Hidden S-Rank Quest" },
    },
    hookQuestion: {
      ko: "시간을 되감을 때마다 깎이는 대가는 무엇인가?",
      en: "What hidden price drains with every three-second rewind?",
    },
    ost: {
      baseBpm: 112,
      keysByAct: { setup: "A minor", development: "D minor", turn: "F# minor", climax: "E minor", cliffhanger: "C minor" },
      calmInstruments: [{ ko: "신스 패드", en: "Synth Pad" }, { ko: "서브 베이스", en: "Sub Bass" }, { ko: "일렉 피아노", en: "Electric Piano" }],
      tensionInstruments: [{ ko: "아르페지오 신스", en: "Arpeggio Synth" }, { ko: "브레이크비트 드럼", en: "Breakbeat Drums" }, { ko: "디스토션 베이스", en: "Distorted Bass" }],
      climaxInstruments: [{ ko: "하이브리드 브라스", en: "Hybrid Brass" }, { ko: "더블 타임 드럼", en: "Double-Time Drums" }, { ko: "오케스트라 히트", en: "Orchestra Hits" }],
    },
  },

  murim: {
    id: "murim",
    label: { ko: "무협", en: "Murim Martial Arts" },
    tagline: { ko: "검기·문파 암투·강호 의협", en: "Sword qi, sect intrigue, martial honor" },
    defaultLogline: IDEA_PROMPT_PRESETS[2].logline,
    titlePrefix: { ko: "녹슨 철검록", en: "Chronicle of the Rust Blade" },
    timeProgression: ["dawn", "morning", "noon", "dusk", "night"],
    characters: [
      {
        idSuffix: "yeonho",
        role: "protagonist",
        name: { ko: "진연호", en: "Yeonho Jin" },
        appearanceAnchors: [
          { ko: "질끈 묶은 흑발 상투 · 흩날리는 잔머리", en: "Tied black hair with wind-swept strands" },
          { ko: "오른손 검지에 단단한 검굳은살", en: "Calloused sword grip on right hand" },
          { ko: "삼베 띠로 동여맨 도복 소매", en: "Hemp-bound martial sleeves" },
        ],
        lockedOutfitId: "outfit-murim-ash-dobok-v1",
        lockedOutfitLabel: { ko: "잿빛 무명 무복·삼베 허리띠", en: "Ash Cotton Martial Robe & Hemp Sash" },
        signaturePaletteTokens: [
          PAL.fgMuted("무명 도복 잿빛", "Ash Linen Base"),
          PAL.accent("녹슨 검신 주홍기", "Rust Blade Qi Accent"),
          PAL.raised("먹색 깃·소매", "Ink Collar & Cuffs"),
        ],
        speechRegister: "archaic",
        speechRegisterRule: {
          ko: "담백한 강호 하오체와 간결한 문답",
          en: "Stoic martial register with crisp terse replies",
        },
        propsInventory: [
          { ko: "이 빠진 녹슨 철검", en: "Notched Rusted Iron Blade" },
          { ko: "스승이 남긴 대나무 패", en: "Master's Bamboo Token" },
        ],
        relationToIndex: [
          { targetIdx: 1, relationType: "ally", summary: { ko: "객잔을 지키는 의협 여검사", en: "Wandering swordswoman guarding the inn" } },
          { targetIdx: 2, relationType: "rival", summary: { ko: "문파 배신을 사주한 혈영당주", en: "Blood Shadow captain behind the purge" } },
        ],
      },
      {
        idSuffix: "soran",
        role: "deuteragonist",
        name: { ko: "백소란", en: "Soran Baek" },
        appearanceAnchors: [
          { ko: "붉은 비녀를 꽂은 흑발 반묶음", en: "Half-up black hair with crimson hairpin" },
          { ko: "예리한 봉안과 백색 비단 소매", en: "Sharp phoenix eyes and white silk cuffs" },
        ],
        lockedOutfitId: "outfit-murim-jade-cloak-v1",
        lockedOutfitLabel: { ko: "비취빛 경공 장포", en: "Jade Qinggong Traveling Cloak" },
        signaturePaletteTokens: [
          PAL.good("비취 장포 메인", "Jade Cloak Primary"),
          PAL.warn("황동 검집 장식", "Brass Scabbard Trim"),
          PAL.raised("야행 내피 톤", "Night Inner Lining"),
        ],
        speechRegister: "casual",
        speechRegisterRule: {
          ko: "당당하고 빠른 반말·강호 어조",
          en: "Bold agile banter with confident edge",
        },
        propsInventory: [
          { ko: "청옥 연검", en: "Celadon Flexible Sword" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "ally", summary: { ko: "녹슨 검의 진가를 첫눈에 알아본 동행", en: "Companion who spots the blade's hidden mastery" } },
        ],
      },
      {
        idSuffix: "hyeokryun",
        role: "antagonist",
        name: { ko: "혈영당주 묵천", en: "Captain Mukcheon" },
        appearanceAnchors: [
          { ko: "눈밑 가로 흉터와 흑철 삿갓", en: "Horizontal scar beneath iron bamboo hat" },
          { ko: "왼손에 감긴 붉은 사슬", en: "Crimson iron chain wrapped on left wrist" },
        ],
        lockedOutfitId: "outfit-murim-blood-armor-v1",
        lockedOutfitLabel: { ko: "흑적 야행 자객 복장", en: "Obsidian-Crimson Assassin Garb" },
        signaturePaletteTokens: [
          PAL.bad("혈기 붉은 띠", "Blood Qi Sash"),
          PAL.raised("흑철 삿갓 그림자", "Iron Hat Shadow"),
          PAL.fgMuted("사슬 금속광", "Steel Chain Sheen"),
        ],
        speechRegister: "archaic",
        speechRegisterRule: {
          ko: "오만한 마교 고어체 사용",
          en: "Imperious archaic cult cadence",
        },
        propsInventory: [
          { ko: "쌍혈 철사슬", en: "Twin Crimson Iron Chains" },
        ],
        relationToIndex: [
          { targetIdx: 0, relationType: "rival", summary: { ko: "문파 비급을 노리는 숙적", en: "Nemesis hunting the lost sect manual" } },
        ],
      },
    ],
    bg3dPresets: [
      { presetId: "bg3d-bamboo-mist-bridge", label: { ko: "안개 대숲 석교 3D", en: "Misty Bamboo Stone Bridge 3D" }, lightingMood: { ko: "새벽 청회색 안개광", en: "Dawn slate mist light" } },
      { presetId: "bg3d-wooden-inn-courtyard", label: { ko: "고풍 객잔 중정 3D", en: "Timber Tavern Courtyard 3D" }, lightingMood: { ko: "홍등 따뜻한 측광", en: "Warm paper lantern sidelight" } },
      { presetId: "bg3d-cliff-pavilion-storm", label: { ko: "절벽 정자 뇌우 3D", en: "Cliff Pavilion Thunder 3D" }, lightingMood: { ko: "번개 하이콘트라스트", en: "Lightning high-contrast flash" } },
    ],
    sfxPool: {
      setup: [{ ko: "쏴아아…", en: "WHOOSH..." }, { ko: "사각", en: "RUSTLE" }],
      development: [{ ko: "챙—!", en: "CLANG!" }, { ko: "스릉", en: "SHING" }],
      turn: [{ ko: "카아앙!", en: "RING!" }, { ko: "파앗!", en: "DASH!" }],
      climax: [{ ko: "콰과광!", en: "KRAKOW!" }, { ko: "쩌저적!", en: "SPLIT!" }],
      cliffhanger: [{ ko: "웅—…", en: "HUM..." }],
    },
    actDialogues: {
      setup: [
        { ko: "녹슨 철검이라 비웃어도, 베는 법은 같소.", en: "Mock the rusted blade; the cut stays true." },
        { ko: "대숲 안개가 이상해. 살기가 깔렸어.", en: "The mist shifted. Killing intent is close." },
      ],
      development: [
        { ko: "그 대나무 패를 내놓으면 목숨만은 살려 주마.", en: "Yield that bamboo token to keep breathing." },
        { ko: "사부의 유품을 넘길 뜻은 없소.", en: "I will not surrender my master's keepsake." },
      ],
      turn: [
        { ko: "저건… 실전된 매화삼식 아닌가?!", en: "Wait—is that the lost Third Blossom form?!" },
        { ko: "녹이 벗겨지며 검신이 울기 시작했어!", en: "The rust flakes off—the blade is singing!" },
      ],
      climax: [
        { ko: "일검으로 끝내겠소. 물러서시오!", en: "One strike ends this. Stand clear!" },
        { ko: "감히 말단 따위가 혈영진을 가르다니!", en: "An outcast cleaving our Blood Formation?!" },
      ],
      cliffhanger: [
        { ko: "녹이 떨어진 검신에 천마의 문양이 드러났다.", en: "Beneath the rust, a forbidden seal gleamed." },
      ],
    },
    beatTitles: {
      setup: { ko: "대숲 안개 속 녹슨 검객의 등장", en: "Arrival in the Misty Bamboo Forest" },
      development: { ko: "혈영당 포위와 객잔 대치", en: "Tavern Standoff Against the Cult" },
      turn: { ko: "녹슨 칼날에서 터진 실전 검기", en: "Lost Sword Qi Breaks Through Rust" },
      climax: { ko: "일검파진(一劍破陣) 결투 절정", en: "Single-Strike Formation Shatter" },
      cliffhanger: { ko: "검신에 새겨진 금지된 문양", en: "Forbidden Seal Revealed on the Blade" },
    },
    hookQuestion: {
      ko: "스승이 평생 숨겨 둔 검의 원래 주인은 누구였는가?",
      en: "Who originally forged the sealed blade hidden by his master?",
    },
    ost: {
      baseBpm: 98,
      keysByAct: { setup: "D minor", development: "A minor", turn: "E minor", climax: "B minor", cliffhanger: "D minor" },
      calmInstruments: [{ ko: "대금 솔로", en: "Bamboo Flute" }, { ko: "가야금 아르페지오", en: "Plucked Zither" }, { ko: "바람 앰비언스", en: "Wind Ambience" }],
      tensionInstruments: [{ ko: "장구 리듬", en: "Frame Drum Pulse" }, { ko: "해금 저음선", en: "Bowed Fiddle" }, { ko: "목탁 틱", en: "Woodblock Pulse" }],
      climaxInstruments: [{ ko: "대북 연타", en: "War Taiko Ensemble" }, { ko: "격정 현악 합주", en: "Furious Strings" }, { ko: "징 임팩트", en: "Bronze Gong Impact" }],
    },
  },

};
