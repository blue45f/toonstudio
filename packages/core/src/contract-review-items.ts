/**
 * 계약서 검토 체크리스트 — 출처·분류·항목 데이터.
 *
 * 쓰는 규칙:
 * - 항목의 `standard` 문장은 아래 `CONTRACT_REVIEW_SOURCES` 문서를 직접 읽고 확인한 내용만 적는다.
 *   조항 번호는 해설집(PDF 99쪽)에 실린 표준계약서 전문과 해설을, 쪽수는 그 문서 하단에 인쇄된
 *   쪽 번호를 기준으로 한다(2026-10-15 PDF 본문을 글자 단위로 추출해 조항·쪽을 대조했다).
 * - 확인하지 못한 법률 사실, 특정 계약서에 대한 판단, 효력 단정은 쓰지 않는다.
 * - 이 목록은 2024년 6월 13일 고시본과 2025년 해설집 기준이다. 이후 개정은 확인하지 못했다.
 */
import type {
  ContractReviewCategory,
  ContractReviewCategoryId,
  ContractReviewItem,
  ContractReviewReference,
  ContractReviewSource,
  ContractReviewSourceId,
  ContractReviewText,
} from "./contract-review-types";

function t(ko: string, en: string): ContractReviewText {
  return Object.freeze({ ko, en });
}

/** 이 저장소 작업에서 원문을 확인한 날짜. 출처마다 같은 값을 쓴다. */
export const CONTRACT_REVIEW_CHECKED_ON = "2026-10-15";

export const CONTRACT_REVIEW_SOURCES: readonly ContractReviewSource[] = Object.freeze([
  Object.freeze<ContractReviewSource>({
    id: "mcst-standard-contracts",
    title: t(
      "만화 분야 표준계약서(8종) — 2024년 6월 13일 개정, 고시 제2024-0032호",
      "Standard contracts for the comics field (8 types) — revised 13 June 2024, MCST Notice No. 2024-0032",
    ),
    publisher: t("문화체육관광부 법령자료실", "Ministry of Culture, Sports and Tourism (MCST), legal materials"),
    url: "https://www.mcst.go.kr/web/s_data/generalData/dataView.jsp?pMenuCD=0405050000&pSeq=51",
    documentDate: "2024-06-24",
    checkedOn: CONTRACT_REVIEW_CHECKED_ON,
    note: t(
      "자료실 게시물 제목은 「[만화] 만화 분야 표준계약서('24.6. 개정)」이고 게시일은 2024-06-24다. 계약서 본문은 HWP·ZIP 첨부파일로 제공된다.",
      "The archive post is titled “[Comics] Standard contracts for the comics field (revised June 2024)” and dated 2024-06-24. The contract text is provided as HWP and ZIP attachments.",
    ),
  }),
  Object.freeze<ContractReviewSource>({
    id: "standard-contracts-commentary",
    title: t(
      "표준계약서 해설집 — 만화·웹툰 분야 공정환경 조성 위한 만화 분야 표준계약서 개정안 6종과 신규 제정안 2종 및 해설서",
      "Commentary on the standard contracts — 6 revised and 2 new standard contracts for a fair comics and webtoon environment",
    ),
    publisher: t(
      "문화체육관광부·한국만화영상진흥원 제작, 한국콘텐츠진흥원 누리집 게시 PDF",
      "Produced by MCST and the Korea Manhwa Contents Agency; PDF hosted on the KOCCA website",
    ),
    url: "https://www.kocca.kr/about/laws/rule/standard_20250616_0402_02.pdf",
    documentDate: "2025-06-13",
    checkedOn: CONTRACT_REVIEW_CHECKED_ON,
    note: t(
      "PDF 99쪽(펼침면 구성이라 한 PDF 쪽에 인쇄 쪽 두 개가 담겨 있다). 이 체크리스트의 ‘해설집 N쪽’은 문서 하단에 인쇄된 쪽 번호이고, 조항 번호는 이 문서에 실린 표준계약서 전문과 해설을 기준으로 한다. 날짜는 문체부가 이 날부터 배포한다고 알린 것으로 보도된 날(2025-05-29 보도)이다.",
      "99 PDF pages laid out as two-page spreads, so each PDF page holds two printed pages. “Commentary p. N” in this checklist is the page number printed at the foot of the page, and article numbers follow the full contract text and commentary in the document. The date is the distribution start date that MCST was reported to have announced (press report of 2025-05-29).",
    ),
  }),
  Object.freeze<ContractReviewSource>({
    id: "mcst-press-2018-fair-council",
    title: t(
      "보도자료 「민관 합동 ‘웹툰 공정상생협의체’ 출범」",
      "Press release: public-private “Webtoon Fair Coexistence Council” launched",
    ),
    publisher: t("문화체육관광부 대중문화산업과", "MCST, Popular Culture Industry Division"),
    url: "https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=16571",
    documentDate: "2018-02-12",
    checkedOn: CONTRACT_REVIEW_CHECKED_ON,
    note: t(
      "작가들이 제기한 고충으로 ‘원고 지연에 대한 과도한 과금(패널티)’ 등이 언급된 문장을 확인했다.",
      "We confirmed the sentence listing complaints raised by creators, including “excessive charges (penalties) for late manuscripts”.",
    ),
  }),
  Object.freeze<ContractReviewSource>({
    id: "korea-kr-2024-changes",
    title: t(
      "정책브리핑 「‘웹툰 만화 분야 표준계약서’ 이렇게 달라집니다」",
      "Policy briefing: “How the webtoon and comics standard contracts change”",
    ),
    publisher: t("문화체육관광부(정책브리핑 게재)", "MCST (published on the Korea Policy Briefing site)"),
    url: "https://www.korea.kr/policy/civilView.do?newsId=148930625",
    documentDate: "2024-06-24",
    checkedOn: CONTRACT_REVIEW_CHECKED_ON,
    note: t(
      "수익 정산서 제공, 50회당 2회 휴재, 2차적저작물작성권 계약서 2종 신규 마련을 확인했다.",
      "We confirmed the revenue statement, two rest weeks per 50 episodes, and the two new secondary-works contracts.",
    ),
  }),
]);

export const CONTRACT_REVIEW_CATEGORIES: readonly ContractReviewCategory[] = Object.freeze([
  Object.freeze<ContractReviewCategory>({
    id: "period-scope",
    title: t("기간과 권리 범위", "Term and scope of rights"),
    description: t(
      "언제까지, 어디서, 어떤 권리를 넘기는지 먼저 확인합니다.",
      "Start with how long, where, and which rights you are granting.",
    ),
  }),
  Object.freeze<ContractReviewCategory>({
    id: "schedule",
    title: t("일정과 분량", "Schedule and volume"),
    description: t(
      "원고를 넘기는 일정, 회차 분량, 늦어질 때의 책임, 쉬어 갈 권리를 봅니다.",
      "Delivery schedule, episode volume, responsibility for delays, and the right to rest.",
    ),
  }),
  Object.freeze<ContractReviewCategory>({
    id: "money",
    title: t("대가와 정산", "Payment and settlement"),
    description: t(
      "연재료, 수익 배분(RS), 공제 방식, 정산 주기와 자료를 따져 봅니다.",
      "Per-episode fee, revenue share (RS), deductions, settlement cycle and records.",
    ),
  }),
  Object.freeze<ContractReviewCategory>({
    id: "rights",
    title: t("2차 저작과 작품 통제", "Secondary works and creative control"),
    description: t(
      "영상화·게임화·상품화 같은 2차 저작 권리와 작품을 바꾸는 권한을 확인합니다.",
      "Rights to adaptations such as film, games and merchandise, and who may change the work.",
    ),
  }),
  Object.freeze<ContractReviewCategory>({
    id: "exit",
    title: t("종료와 반환", "Ending the contract and getting rights back"),
    description: t(
      "계약을 끝내는 조건과 끝난 뒤 권리·원고가 돌아오는 방식을 봅니다.",
      "Conditions for ending the contract and how rights and manuscripts come back.",
    ),
  }),
  Object.freeze<ContractReviewCategory>({
    id: "process",
    title: t("검토 절차와 분쟁", "Review process and disputes"),
    description: t(
      "서명 전 검토 시간, 상담 가능 여부, 분쟁이 생겼을 때의 절차를 확인합니다.",
      "Time to review before signing, whether you may consult advisers, and how disputes are handled.",
    ),
  }),
]);

function ref(sourceId: ContractReviewSourceId, ko: string, en: string): ContractReviewReference {
  return Object.freeze({ sourceId, locator: t(ko, en) });
}

/** 해설집에 실린 웹툰 연재계약서(별표3) 조항 근거. */
function serial(ko: string, en: string): ContractReviewReference {
  return ref(
    "standard-contracts-commentary",
    `웹툰 연재계약서(별표3) ${ko}`,
    `Webtoon serialization contract (Annex 3) ${en}`,
  );
}

function item(value: ContractReviewItem): ContractReviewItem {
  return Object.freeze({
    ...value,
    lookFor: Object.freeze([...value.lookFor]),
    references: Object.freeze([...value.references]),
  });
}

export const CONTRACT_REVIEW_ITEMS: readonly ContractReviewItem[] = Object.freeze([
  // ── 기간과 권리 범위 ────────────────────────────────────────────────
  item({
    id: "term-and-extension",
    category: "period-scope",
    title: t("계약 기간·연장·권리 허락 기간", "Term, extension and rights-grant period"),
    question: t(
      "계약 기간, 연장 방식, 계약이 끝난 뒤에도 권리가 이어지는 기간이 적혀 있나요?",
      "Does it state the term, how it can be extended, and any period during which rights continue after the term ends?",
    ),
    standard: t(
      "표준 웹툰 연재계약서 제3조는 계약기간을 ‘계약체결일부터 몇 개월 또는 몇 회 연재일까지’로 정하고, 계약 종료일 또는 최종화 연재일부터 몇 개월 동안 서비스 제공업자에게 독점 또는 비독점으로 권리를 허락하는 ‘권리 허락 기간’을 따로 둔다. 연장은 만료일 일정 기간 전까지 서면으로 합의해야 하고, 합의가 없으면 기간 만료로 끝난다. 해설집은 계약이 자동 연장되지 않는 것을 원칙으로 했다고 설명하며, 최종화 연재일은 상호 합의 없이 임의로 바꿀 수 없다.",
      "Article 3 of the standard serialization contract sets the term as “months or number of episodes from signing”, and adds a separate “rights-grant period” of a stated number of months after the term or the final episode, exclusive or non-exclusive. An extension needs a written agreement before expiry; without one the contract ends at expiry. The commentary says automatic renewal is deliberately not the default, and the final episode date cannot be changed unilaterally.",
    ),
    lookFor: [
      t("계약 기간이 개월 수나 연재 회차로 분명히 적혀 있는지", "Is the term stated clearly in months or episode count?"),
      t("계약이 끝난 뒤 권리가 유지되는 기간과 그 기간이 독점인지 비독점인지", "How long do rights continue after the term, and is that period exclusive?"),
      t("자동 연장·자동 갱신 문구가 있는지, 있다면 거부 통보 기한이 언제인지", "Is there automatic renewal wording, and by when must you object?"),
      t("최종화(연재 종료 시점)를 한쪽이 마음대로 바꿀 수 있는지", "Can one side change the final episode date alone?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "기간이 적혀 있지 않으면 권리가 언제까지 묶이는지 알 수 없습니다. 기간과 종료 후 권리 허락 기간을 문서로 확인하세요.",
      "Without a stated term you cannot tell how long your rights are tied up. Ask for the term and any post-term grant period in writing.",
    ),
    standardCore: true,
    references: [serial("제3조 · 해설집 58쪽", "Art. 3 · commentary p. 58")],
  }),
  item({
    id: "grant-scope",
    category: "period-scope",
    title: t("권리의 범위: 연재 사이트·언어·독점 여부", "Scope of the grant: sites, languages, exclusivity"),
    question: t(
      "서비스 제공업자가 쓸 수 있는 권리의 범위(연재 사이트, 언어·지역, 독점 여부)가 구체적으로 적혀 있나요?",
      "Is the scope the service provider may use (serialization sites, languages and regions, exclusivity) spelled out?",
    ),
    standard: t(
      "제4조는 계약기간 중 온라인 서비스 방식으로 연재할 수 있는 권리를 부여하는 구조이고, 독점·배타적으로 하려면 배타적발행권을 설정하기로 합의한다(한국저작권위원회에 등록할 수 있다). 계약이 끝나면 서비스 제공업자가 배타적발행권 말소 등록을 신청하고 증빙을 교부해야 한다. 제5조는 연재할 수 있는 사이트(도메인)를 계약서에 적어 한정하고, 사이트를 더하거나 빼려면 저작권자의 사전 동의를 받게 한다. 제13조는 한국어·명시한 도메인에서의 발행으로 범위를 두고, 한국어 외 언어나 국외 발행은 협의한 뒤 부속합의서나 별도 계약으로 정하게 한다.",
      "Article 4 grants the right to serialize online during the term; for exclusivity the parties agree to set an exclusive publication right (which can be registered with the Korea Copyright Commission). When the contract ends, the service provider must apply to cancel that registration and hand over proof. Article 5 limits serialization to the sites (domains) named in the contract and requires the author’s prior consent to add or remove one. Article 13 limits publication to Korean on the named domains; other languages or regions need a side agreement or separate contract after consultation.",
    ),
    lookFor: [
      t("연재 사이트(도메인)가 계약서에 적혀 있고, 바꾸려면 내 동의가 필요한지", "Are the sites named, and is your consent needed to change them?"),
      t("언어·국가 범위, 번역·해외 서비스를 별도 계약으로 하는지", "Are languages and regions limited, with translation or overseas service in a separate contract?"),
      t("독점(배타적발행권) 여부와 종료 후 등록 말소 조항이 있는지", "Is it exclusive, and is there a clause to cancel the registration at the end?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "범위가 열려 있으면 생각보다 넓은 이용을 허락한 것이 될 수 있습니다. 사이트·언어·지역·독점 여부를 구체적으로 적어 달라고 요청하세요.",
      "An open-ended scope may allow wider use than you intend. Ask for sites, languages, regions and exclusivity to be written explicitly.",
    ),
    standardCore: true,
    references: [
      serial("제4조 · 해설집 59쪽", "Art. 4 · commentary p. 59"),
      serial("제5조 · 해설집 60쪽", "Art. 5 · commentary p. 60"),
      serial("제13조 · 해설집 65쪽", "Art. 13 · commentary p. 65"),
    ],
  }),

  // ── 일정과 분량 ─────────────────────────────────────────────────────
  item({
    id: "delivery-volume",
    category: "schedule",
    title: t("원고 인도 일정과 회차당 분량(컷 수)", "Delivery schedule and volume per episode (panel count)"),
    question: t(
      "원고를 언제까지, 몇 컷 분량으로 넘기는지, 분량이 늘면 추가로 받는 돈이 있는지 적혀 있나요?",
      "Does it say when manuscripts are due, how many panels each episode has, and whether extra volume is paid?",
    ),
    standard: t(
      "제7조는 계약 체결 후 일정 기간 안에 몇 회 분량의 ‘완전원고’(교정·편집만 거치면 연재가 가능한 상태의 원고, 제2조 제13호)를 인도하고, 이후 정한 요일·주기마다 1회 분량을 인도하도록 칸을 둔다. 부득이한 사정이 있으면 서비스 제공업자의 동의를 얻어 인도 기일을 바꿀 수 있다. 회당 최소 컷 수를 정하되 상·하한을 합의로 정할 수 있고, 서비스 제공업자의 요구로 계약한 컷 수보다 일정 컷 이상 늘어나면 컷당 추가금을 지급한다. 서비스 제공업자는 원고를 인도받은 날부터 정한 기간 안에 연재를 시작해야 한다. 해설은 주 1회 연재 기준 통상 50~70컷 내외로 계약한다고 적는다.",
      "Article 7 has blanks for delivering a number of “complete manuscripts” (ready for serialization after proofreading and editing only; Art. 2 no. 13) within a period after signing, then one episode per set weekday or interval. With the service provider’s consent the delivery date can change for unavoidable reasons. A minimum panel count per episode is set, with upper and lower limits by agreement, and if the provider asks for more than the contracted count by a set number, a per-panel fee is paid. The provider must start serialization within a set period after receiving the manuscripts. The commentary notes weekly series are typically contracted at about 50–70 panels.",
    ),
    lookFor: [
      t("‘완전원고’의 뜻과 검수 기준이 정해져 있는지", "Is “complete manuscript” defined, along with the acceptance standard?"),
      t("인도 기한을 바꿀 때 누구의 동의가 필요한지", "Whose consent is needed to move a delivery date?"),
      t("회당 컷 수 기준과 컷이 늘어날 때의 추가금", "The panel count per episode and the extra fee when it grows."),
      t("원고를 받은 뒤 연재를 시작해야 하는 기한", "The deadline for the provider to start serializing after delivery."),
    ],
    attention: "when-absent",
    attentionNote: t(
      "분량 기준이 없으면 요구가 늘어도 보상받을 근거가 약해질 수 있습니다. 컷 수와 초과 분량 보상을 적어 달라고 요청하세요.",
      "Without a volume standard, extra demands may come with no basis for compensation. Ask for the panel count and a fee for extra panels.",
    ),
    standardCore: true,
    references: [
      serial("제2조 제13호 · 해설집 57쪽", "Art. 2 no. 13 · commentary p. 57"),
      serial("제7조 · 해설집 61쪽", "Art. 7 · commentary p. 61"),
    ],
  }),
  item({
    id: "delay-penalty",
    category: "schedule",
    title: t("지체상금(마감 지연 패널티)", "Late-delivery penalties"),
    question: t(
      "원고가 늦어질 때 돈을 물리거나 연재료·수익에서 깎는 조항(지체상금·위약금·패널티)이 있나요?",
      "Is there a clause that charges money or reduces fees or revenue when a manuscript is late (penalty, liquidated damages)?",
    ),
    standard: t(
      "해설집 본문(PDF 99쪽)에는 ‘지체상금’·‘위약금’·‘패널티’라는 표현이 나오지 않고, 표준 웹툰 연재계약서(별표3)에도 마감 지연에 돈을 물리는 조항은 없다. 인도 기일은 제7조 제1항에 따라 서비스 제공업자의 동의를 얻어 바꿀 수 있고, 동의 없이 인도하지 않으면 계약 위반 책임을 질 수 있다고 해설한다. 제6조는 양쪽 모두 정당한 이유 없이 원고 수령·창작·인도를 거부하거나 연재를 지연·중단해서는 안 된다고 정하며, 위반하면 불가항력 등(제24조)에 해당하지 않는 한 계약 위반 책임을 질 수 있다고 해설한다. 위반이 계속될 때는 일정 기간을 정해 이행을 요구한 뒤 해지할 수 있고(제22조), 고의 또는 과실로 계약을 위반하면 손해를 배상한다(제23조). 천재지변 같은 불가항력으로 의무를 이행하지 못하면 서로 책임을 면제한다(제24조). 문화체육관광부 2018-02-12 보도자료는 작가들이 ‘원고 지연에 대한 과도한 과금(패널티)’ 등을 고충으로 제기했다고 적는다.",
      "No wording for liquidated damages for delay, a contract penalty or a penalty appears in the text of the commentary (99 PDF pages), and the standard serialization contract (Annex 3) has no clause charging money for a late manuscript. Under Art. 7(1) the delivery date can move with the service provider’s consent, and failing to deliver without consent can be a breach, the commentary explains. Art. 6 bars both sides from refusing delivery or receipt, or delaying or stopping serialization, without justification, and the commentary says a breach can carry liability unless force majeure or similar (Art. 24) applies. Continued breach leads to a demand to perform within a set period and then termination (Art. 22); a party that breaches intentionally or negligently pays damages (Art. 23); force majeure releases both sides (Art. 24). A 2018-02-12 MCST press release lists “excessive charges (penalties) for late manuscripts” among creators’ complaints.",
    ),
    lookFor: [
      t("지체상금·위약금·패널티·감액 같은 표현이 있는지", "Any wording such as penalty, liquidated damages, deduction or reduction?"),
      t("있다면 금액이나 비율, 지연 일수 기준, 총액 상한이 적혀 있는지", "If so, the amount or rate, how delay days are counted, and a cap."),
      t("서비스 제공업자의 귀책·불가항력·합의된 휴재는 면제되는지", "Are the provider’s own fault, force majeure and agreed rest breaks excluded?"),
      t("서비스 제공업자가 원고를 늦게 받거나 연재를 늦출 때도 같은 수준의 책임이 있는지", "Does the provider carry comparable responsibility if it receives or publishes late?"),
      t("공제가 연재료와 수익 중 어디에서 이뤄지는지", "Is it deducted from the fee or from revenue share?"),
    ],
    attention: "when-present",
    attentionNote: t(
      "표준계약서에 없는 추가 조건입니다. 금액·상한·면책 사유와 상대방의 책임 조항을 꼼꼼히 확인하고, 이해되지 않으면 서명 전에 상담을 받으세요.",
      "This is an extra condition not found in the standard contract. Check the amount, cap, exemptions and the other side’s reciprocal duties, and get advice before signing if anything is unclear.",
    ),
    standardCore: false,
    references: [
      serial("제6조 · 해설집 60쪽", "Art. 6 · commentary p. 60"),
      serial("제7조 · 해설집 61쪽", "Art. 7 · commentary p. 61"),
      serial("제22~24조 · 해설집 70~71쪽", "Arts. 22–24 · commentary pp. 70–71"),
      ref("mcst-press-2018-fair-council", "보도자료 본문(작가 고충 문장)", "Press release body (creators’ complaints)"),
    ],
  }),
  item({
    id: "pause",
    category: "schedule",
    title: t("휴재(쉬어 갈 권리)", "Rest breaks"),
    question: t(
      "휴재할 수 있는 횟수와 조건, 휴재 안내를 누가 맡는지 적혀 있나요?",
      "Does it state how many rest breaks you may take, on what terms, and who announces them?",
    ),
    standard: t(
      "제8조는 연재 주기 기준 50회당 2회씩 휴재할 수 있고, 이때 서비스 제공업자가 조건 없는 휴재를 보장하도록 정한다. 보장된 휴재를 쓰지 않으면 서비스 제공업자가 그만큼 휴재를 권고하고 연재를 중단할 수 있다. 휴재 공지와 안내는 서비스 제공업자가 맡으며 별도 작업을 요구할 수 없고, 그 밖의 불가피한 사유의 휴재는 협의로 정한다. 시즌제·사전제작 작품의 가이드라인도 함께 실려 있다. 해설집은 이 규정을 당사자가 원하지 않으면 제외할 수 있지만 ‘핵심’ 조항으로 표시했다고 설명하고, 정책브리핑도 50회 연재 시 2회 휴재를 안내한다.",
      "Article 8 lets the author rest twice per 50 episodes of the release cycle, with the service provider guaranteeing the break without conditions. If the author does not use the guaranteed breaks, the provider may recommend them and pause serialization for that time. The provider announces breaks and may not demand extra work to announce them; other unavoidable breaks are agreed by consultation. Guidelines for seasonal and pre-produced series are included. The commentary says parties may omit this rule but marks it as a core clause, and the policy briefing also describes two breaks per 50 episodes.",
    ),
    lookFor: [
      t("휴재 횟수와 ‘조건 없음’ 문구가 있는지", "The number of breaks and wording that they come without conditions."),
      t("휴재 때문에 연재료나 수익 배분이 줄어드는 조항이 없는지", "No clause that cuts the fee or revenue share because of a break?"),
      t("시즌제·사전제작 작품이라면 휴재 기준이 따로 있는지", "For seasonal or pre-produced series, a separate rest standard?"),
      t("휴재 공지를 서비스 제공업자가 맡는지", "Does the provider handle the break announcement?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "휴재 규정이 없으면 쉬는 것이 계약 위반이 될 수 있는지 분명하지 않습니다. 휴재 횟수와 조건을 적어 달라고 요청하세요.",
      "Without a rest clause it is unclear whether taking a break could count as a breach. Ask for the number and terms of breaks to be written down.",
    ),
    standardCore: true,
    references: [
      serial("제8조 · 해설집 62쪽", "Art. 8 · commentary p. 62"),
      ref("korea-kr-2024-changes", "본문(휴재권 보장)", "Body (guaranteed rest breaks)"),
    ],
  }),

  // ── 대가와 정산 ─────────────────────────────────────────────────────
  item({
    id: "fee-per-episode",
    category: "money",
    title: t("회차당 대가(연재료·원고료)와 지급 시기", "Fee per episode and when it is paid"),
    question: t(
      "회차당 연재료(원고료) 금액과 지급 시기가 적혀 있나요?",
      "Does it state the per-episode fee and when it is paid?",
    ),
    standard: t(
      "제9조는 서비스 제공업자가 회차 1회 분량의 원고에 대해 연재료를 지급하고, 대가 지급과 정산(제10조)을 매월 한 번 진행해 다음 달 말일까지 저작권자가 지정한 계좌로 지급하도록 정한다. 해설은 연재료를 완전원고를 인도할 때마다 지급되는 창작의 대가로 설명하고, 1회 분량마다 지급함을 원칙으로 규정했다고 적는다.",
      "Article 9 has the service provider pay a fee for each episode of manuscript, with payment and settlement (Art. 10) run once a month and paid by the end of the following month to the account the author designates. The commentary describes the fee as payment for creation each time a complete manuscript is delivered, paid per episode as a rule.",
    ),
    lookFor: [
      t("금액, 통화, 세금 포함 여부", "Amount, currency and whether tax is included."),
      t("지급일(예: 다음 달 말일)과 지연 시 대응", "The payment date (for example the end of the next month) and what happens if it is late."),
      t("연재료가 나중에 수익 정산에서 다시 공제되는지(아래 ‘공제 방식’ 항목)", "Whether the fee is later deducted from revenue (see the deduction item below)."),
    ],
    attention: "when-absent",
    attentionNote: t(
      "금액이나 지급 시기가 없으면 받을 돈을 특정하기 어렵습니다. 회차당 금액과 지급일을 적어 달라고 요청하세요.",
      "Without an amount or payment date it is hard to pin down what you are owed. Ask for the per-episode fee and the payment date.",
    ),
    standardCore: true,
    references: [serial("제9조 · 해설집 62쪽", "Art. 9 · commentary p. 62")],
  }),
  item({
    id: "revenue-share",
    category: "money",
    title: t("수익 배분(RS) 비율과 ‘순 매출액’ 정의", "Revenue share (RS) ratio and the definition of net sales"),
    question: t(
      "수익을 어떤 비율로 나누는지, 그 기준이 되는 매출액이 어떻게 계산되는지 적혀 있나요?",
      "Does it state the revenue split and how the sales figure it applies to is calculated?",
    ),
    standard: t(
      "제10조 제1항은 저작권자와 서비스 제공업자가 순 매출액을 RS(수익분배) 비율(저작권자:서비스 제공업자 ○○%:○○%)에 따라 나누도록 한다. ‘총 매출액’은 작품 이용으로 생긴 금액 전체이고 ‘순 매출액’은 총 매출액에서 세금, 앱마켓 수수료, 결제·환불 수수료 등을 공제한 금액이다(제2조 제14·15호). 해설집은 ‘등’을 지우고 공제 항목을 분명히 적는 것이 분쟁을 줄이며, 공제 범위는 서면 합의로 달리 정할 수 있다고 적는다. 연재 계약이 끝나도 작품이 서비스되는 동안에는 RS 비율에 따라 계속 나눈다(제10조 제4항). 정책브리핑도 계약 체결 당사자가 수익 배분 방식·비율을 명확하게 이해할 수 있게 한다고 안내한다.",
      "Article 10(1) has the parties split net sales by the RS ratio (author : service provider, ○○% : ○○%). “Gross sales” is everything earned from using the work; “net sales” is gross sales minus taxes, app-market fees, payment and refund fees and similar (Art. 2 nos. 14–15). The commentary says deleting the open-ended “etc.” and listing each deduction reduces disputes, and the deductions can be changed by written agreement. Even after serialization ends, revenue keeps being split at the RS ratio while the work is on sale (Art. 10(4)). The policy briefing likewise says the contracting parties should be able to understand the split method and ratio clearly.",
    ),
    lookFor: [
      t("RS 비율 숫자(저작권자:플랫폼)가 분명한지", "Is the RS ratio (author : platform) stated clearly?"),
      t("기준이 총 매출액인지 순 매출액인지", "Is it gross or net sales?"),
      t("공제되는 비용이 하나씩 적혀 있고 ‘등’처럼 열려 있는 표현이 없는지", "Are deductions listed one by one, without open-ended wording like “etc.”?"),
      t("광고료 같은 다른 수입이 총 매출액에 포함되는지", "Is other income, such as advertising revenue, included in gross sales?"),
      t("계약이 끝난 뒤에도 RS가 이어지는지", "Does the RS continue after the contract ends?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "비율이나 매출액 정의가 없으면 정산 결과를 검증할 기준이 없습니다. RS 비율과 공제 항목을 숫자와 목록으로 적어 달라고 요청하세요.",
      "Without a ratio or a definition of sales there is no yardstick to check a settlement. Ask for the RS ratio and the deductions as numbers and a list.",
    ),
    standardCore: true,
    references: [
      serial("제2조 제14·15호 · 해설집 57쪽", "Art. 2 nos. 14–15 · commentary p. 57"),
      serial("제10조 · 해설집 63~64쪽", "Art. 10 · commentary pp. 63–64"),
      ref("korea-kr-2024-changes", "본문(수익·정산 투명성)", "Body (revenue and settlement transparency)"),
    ],
  }),
  item({
    id: "deduction-method",
    category: "money",
    title: t("연재료·비용 공제 방식과 적자 처리(선차감·후차감)", "How fees and costs are deducted, and what happens to a shortfall"),
    question: t(
      "연재료나 비용을 수익에서 어떤 순서로 얼마나 공제하는지, 연재료가 수익보다 클 때(적자) 어떻게 되는지 적혀 있나요?",
      "Does it say in what order fees and costs are deducted from revenue, and what happens when the fee exceeds revenue (a shortfall)?",
    ),
    standard: t(
      "제10조 제2항은 제9조로 지급한 대금의 공제 방식을 비워 두고 당사자가 합의해 적도록 한다. 해설집 부록은 (1) 회차당 대가를 공제하지 않는 방식·수익 분배 비율 적용 전에 공제하는 방식·적용 후에 공제하는 방식, (2) 회차당 비용도 같은 세 가지, (3) 회차당 대가가 수익보다 많을 때 적자를 월말에 탕감·연재 종료 때 탕감·탕감하지 않음으로 나눠 설명하고, ‘선차감 MG·후차감 MG’ 같은 호칭은 지양하며 이 세 요소를 확인하라고 권한다. 예시(연재료 100만 원, 회차 총매출 200만 원, 저작권자 비율 80%, 비용 20만 원)에서는 공제 방식에 따라 244만 원·164만 원·144만 원으로 달라진다. 서비스 제공업자와 저작권자 사이에 중간 유통업자(CP사)가 있으면 계산이 한 단계 늘어나고, 한 단계는 선차감이고 다른 단계는 후차감일 수도 있다고 해설한다.",
      "Article 10(2) leaves the deduction method for the Art. 9 payment blank for the parties to fill in. The commentary’s appendix distinguishes (1) not deducting the per-episode fee, deducting it before applying the revenue-share ratio, or after; (2) the same three options for per-episode costs; and (3) when the fee exceeds revenue, forgiving the shortfall monthly, forgiving it at the end of serialization, or never; it advises avoiding labels like “pre-deduction MG / post-deduction MG” and checking these three factors. In its example (fee 1,000,000 KRW, gross sales 2,000,000, author ratio 80%, costs 200,000) the author’s income differs: 2,440,000, 1,640,000 or 1,440,000 KRW depending on the method. With an intermediary distributor (a “CP company”) between the service provider and the author, the commentary says the calculation gains one more step, and one step may deduct before the split while the other deducts after.",
    ),
    lookFor: [
      t("연재료를 수익 분배 전에 공제하는지, 후에 공제하는지, 공제하지 않는지", "Is the fee deducted before the split, after it, or not at all?"),
      t("수수료·환불 같은 비용이 어느 단계에서 공제되는지", "At which step are costs such as fees and refunds deducted?"),
      t("연재료가 수익보다 많은 달의 적자가 다음 달로 넘어가는지, 언제 없어지는지", "Does a shortfall carry over, and when is it cleared?"),
      t("중간에 CP사(중간 유통업자)가 있다면 단계마다 비율과 공제 순서가 각각 어떻게 되는지", "If an intermediary (CP company) is involved, what are the ratio and the deduction order at each step?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "같은 RS 비율이어도 공제 방식에 따라 실제 수령액이 크게 달라집니다. 공제 순서와 적자 처리 방식을 계산 예시와 함께 적어 달라고 요청하세요.",
      "The same RS ratio can pay out very differently depending on the deduction method. Ask for the order of deduction and the shortfall rule, ideally with a worked example.",
    ),
    standardCore: true,
    references: [
      serial("제10조 제2항 · 해설집 63쪽", "Art. 10(2) · commentary p. 63"),
      ref("standard-contracts-commentary", "부록 ‘완전원고 대가 계산 방식’ · 해설집 76~83쪽(계산 예시는 79쪽)", "Appendix on complete-manuscript fee calculation · commentary pp. 76–83 (worked example on p. 79)"),
    ],
  }),
  item({
    id: "settlement-cycle",
    category: "money",
    title: t("정산 주기와 정산서", "Settlement cycle and statements"),
    question: t(
      "정산(대금 지급) 주기와 정산서를 받는 주기, 정산서에 들어갈 내용이 적혀 있나요?",
      "Does it state the settlement (payment) cycle, how often you get a statement, and what the statement contains?",
    ),
    standard: t(
      "표준 웹툰 연재계약서는 대가 지급과 정산을 매월 한 번 진행해 다음 달 말일까지 지급하도록 하고(제9조 제2항), 서비스 제공업자가 정한 주기(주 또는 개월)마다 1회, 지급할 대가가 없을 때에도 수익 정산서를 제공하도록 한다(제10조 제5항). 정산서에는 총 매출액(대여·소장·이벤트 판매 수량, 스토어별 판매 수량, 유료 판매 비율 등), 회차별 코인 환산 가격과 코인당 단가, 세금·플랫폼 수수료·결제/환불 수수료 등 비용 내역, 순 매출액, 저작권자에게 실제 지급되는 금액(원고료·수익분배금·차감액·이월금 구분)이 들어간다. 회차별 조회 수 정보도 정해진 주기로 제공한다(제11조). 정책브리핑도 정산서에 총 매출액·판매 수량·비용 내역이 담긴다고 안내한다.",
      "The standard serialization contract has payment and settlement run monthly and paid by the end of the next month (Art. 9(2)), and requires the service provider to give a revenue statement every set number of weeks or months, even when nothing is payable (Art. 10(5)). The statement covers gross sales (rental, ownership and event sales volumes, per-store volumes, paid ratio), per-episode coin prices and unit price, costs such as taxes, platform and payment/refund fees, net sales, and the amount actually paid to the author, split into fee, revenue share, deductions and carry-over. Per-episode view counts are provided on a set cycle (Art. 11). The policy briefing also says the statement carries gross sales, sales volume and costs.",
    ),
    lookFor: [
      t("대금 지급일과 정산서 제공 주기", "The payment date and how often you receive a statement."),
      t("정산서에 총 매출·수수료·순 매출·실지급액이 구분돼 있는지", "Does the statement separate gross sales, fees, net sales and the amount paid?"),
      t("지급할 돈이 없는 달에도 정산서를 받는지", "Do you get a statement in months with nothing to pay?"),
      t("회차별 조회 수 정보를 받을 수 있는지", "Can you receive per-episode view counts?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "주기와 정산서 항목이 없으면 정산이 맞는지 확인할 수 없습니다. 지급일, 정산서 주기, 정산서 항목을 적어 달라고 요청하세요.",
      "Without a cycle and statement contents you cannot check that settlement is correct. Ask for the payment date, statement frequency and contents.",
    ),
    standardCore: true,
    references: [
      serial("제9조 · 해설집 62쪽", "Art. 9 · commentary p. 62"),
      serial("제10조 제5항 · 해설집 63쪽", "Art. 10(5) · commentary p. 63"),
      serial("제11조 · 해설집 64쪽", "Art. 11 · commentary p. 64"),
      ref("korea-kr-2024-changes", "본문(수익 정산서)", "Body (revenue statement)"),
    ],
  }),
  item({
    id: "settlement-records",
    category: "money",
    title: t("정산 근거 자료 요구와 보관", "Access to settlement records and how long they are kept"),
    question: t(
      "정산 내용에 이의가 있을 때 근거 자료를 요구할 수 있고, 자료를 얼마나 보관하는지 적혀 있나요?",
      "Can you ask for supporting records if you dispute a settlement, and does it say how long records are kept?",
    ),
    standard: t(
      "제10조 제6~8항은 저작권자가 정산서에 이의를 제기하면 서비스 제공업자가 근거 자료(관련 계약서 포함)를 제공하도록 하고, 제공이 불가능한 객관적 사정이 있을 때에만 별도 합의로 열람하게 한다. 서비스 제공업자는 정산 내역과 근거 자료를 권리 소멸일부터 5년 후까지 보관하고, 그 기간 동안 열람·제공을 요청하면 계약 종료 여부와 관계없이 응해야 한다. 해설은 ‘객관적 사정’을 자료를 물리적으로 보유하지 않거나 법령·계약으로 제공할 수 없는 경우로 설명하며, 제공이 불가능하다고 일방적으로 통보해서는 안 된다고 적는다.",
      "Article 10(6)–(8) requires the service provider to supply supporting records (including the relevant contracts) when the author disputes a statement, and to allow inspection by separate agreement only where providing them is objectively impossible. The provider keeps settlement details and records until five years after the rights expire and must respond to requests during that time, whether or not the contract has ended. The commentary reads “objective circumstances” as the provider not physically holding the records or being barred by law or contract, and says it may not simply declare provision impossible.",
    ),
    lookFor: [
      t("이의 제기 절차와 기한", "The procedure and deadline for raising a dispute."),
      t("근거 자료(계약서 포함)를 받을 수 있는 범위", "What records you can obtain, including contracts."),
      t("자료 보관 기간과 계약 종료 후에도 열람할 수 있는지", "How long records are kept and whether you can inspect them after the contract ends."),
    ],
    attention: "when-absent",
    attentionNote: t(
      "자료를 요구할 권리가 없으면 정산 오류를 확인하기 어렵습니다. 근거 자료 제공과 보관 기간을 계약서에 넣어 달라고 요청하세요.",
      "Without a right to records, errors are hard to spot. Ask for record access and a retention period to be added to the contract.",
    ),
    standardCore: true,
    references: [serial("제10조 제6~8항 · 해설집 63~64쪽", "Art. 10(6)–(8) · commentary pp. 63–64")],
  }),
  item({
    id: "extra-work-costs",
    category: "money",
    title: t("비용 부담과 추가 작업의 대가", "Who bears costs, and pay for extra work"),
    question: t(
      "제작·홍보 비용을 누가 내는지, 예고편·후기 같은 추가 작업을 요청받으면 별도 대가를 받는지 적혀 있나요?",
      "Does it say who pays production and promotion costs, and whether extra work such as trailers is paid separately?",
    ),
    standard: t(
      "제12조는 작품 창작 비용은 저작권자가, 발행 등 제작비와 판매·홍보 비용은 서비스 제공업자가 부담하게 하되, 서비스 제공업자가 협의에 따라 창작 비용을 지원할 수 있다고 한다. 서비스 제공업자의 요구로 별도의 예고편·후기·일러스트레이션 등을 제작하면 서면 합의로 정한 별도 비용을 지급해야 하고, PPL 삽입은 별도 합의에 따른다. 다만 제10조 제3항의 서면 합의로 순 매출액에서 공제하는 항목을 달리 정할 수 있어, 비용 부담이 정산에 어떻게 반영되는지 함께 봐야 한다.",
      "Article 12 has the author bear the cost of creating the work and the service provider bear publishing, sales and promotion costs, although the provider may support creation costs by agreement. If the provider asks for extras such as a trailer, afterword or illustration, a separate fee set in a written agreement is paid, and product placement (PPL) is by separate agreement. Since Art. 10(3) lets the parties change the deductions from net sales by written agreement, check how costs feed into settlement.",
    ),
    lookFor: [
      t("창작 비용(프로그램 이용료 등)을 누가 내는지", "Who pays creation costs such as software?"),
      t("홍보·마케팅 비용이 내 몫에서 공제되는지", "Are promotion costs deducted from your share?"),
      t("예고편·후기 등 추가 작업의 보수가 따로 정해져 있는지", "Is pay for extra work such as trailers set separately?"),
      t("PPL 삽입과 그 대가를 별도 합의로 정하는지", "Are PPL placement and its payment agreed separately?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "비용 부담이 불분명하면 나중에 정산에서 예상 밖의 공제가 생길 수 있습니다. 비용과 추가 작업의 부담 주체를 적어 달라고 요청하세요.",
      "Unclear cost-bearing can lead to unexpected deductions later. Ask who pays which costs and extra work to be written down.",
    ),
    standardCore: false,
    references: [
      serial("제12조 · 해설집 65쪽", "Art. 12 · commentary p. 65"),
      serial("제10조 제3항 · 해설집 63~64쪽", "Art. 10(3) · commentary pp. 63–64"),
    ],
  }),

  // ── 2차 저작과 작품 통제 ─────────────────────────────────────────────
  item({
    id: "secondary-rights-holder",
    category: "rights",
    title: t("2차적저작물작성권의 귀속(영상화·게임화·상품화 등)", "Who holds adaptation rights (film, games, merchandise)"),
    question: t(
      "영상화·게임화·상품화 같은 2차 저작 권리가 누구에게 있는지, 서비스 제공업자가 쓰려면 별도 계약이 필요하다고 적혀 있나요?",
      "Does it say who holds adaptation rights (film, games, merchandise) and that the service provider needs a separate contract to use them?",
    ),
    standard: t(
      "제14조는 서비스 제공업자가 계약에서 명시적으로 허락된 권리만 갖고, 대상 저작물의 2차적저작물작성권은 저작권자에게 있으며 서비스 제공업자가 2차적저작물을 이용하려면 별도 계약을 체결해야 한다고 정한다. 제3자가 2차적저작물 이용을 서비스 제공업자에게 먼저 요청하면 저작권자에게 알려야 한다는 예시 조항도 있다. 해설집은 연재계약이 허락하는 권리는 온라인 서비스 방식의 연재이고 2차적저작물작성권에 관한 규정은 없다고 설명한다. 2024년 6월에는 이 목적의 별도 표준계약서로 ‘2차적저작물작성권 이용허락 계약서’(별표7)와 ‘양도계약서’(별표8)가 새로 만들어졌다.",
      "Article 14 gives the service provider only the rights expressly granted, keeps adaptation rights with the author, and requires a separate contract before the provider uses the work for adaptations. An example clause has the provider tell the author when a third party asks it first about adapting the work. The commentary says the serialization contract grants online serialization only and has no adaptation-rights provisions. In June 2024 two new standard contracts were created for this purpose: a secondary-works license (Annex 7) and an assignment (Annex 8).",
    ),
    lookFor: [
      t("‘2차적저작물’, ‘영상화’, ‘게임화’, ‘상품화’ 같은 표현이 들어간 조항이 있는지", "Is there a clause mentioning adaptations, film, games or merchandise?"),
      t("그 권리가 저작권자에게 남는지, 서비스 제공업자에게 허락되거나 넘어가는지", "Does the right stay with the author, or is it licensed or assigned to the provider?"),
      t("2차 저작 제안이 서비스 제공업자에게 먼저 오면 알려 주는 조항이 있는지", "Is there a duty to tell you when an adaptation offer reaches the provider first?"),
      t("‘기타 일체의 권리’처럼 범위가 열려 있는 표현이 없는지", "No open-ended wording such as “all other rights”?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "2차 저작 권리의 귀속이 적혀 있지 않으면 범위를 두고 다툼이 생기기 쉽습니다. 권리가 저작권자에게 남는다는 점과 별도 계약 원칙을 적어 달라고 요청하세요.",
      "If adaptation rights are not addressed, disputes over scope are likely. Ask for wording that they stay with the author and need a separate contract.",
    ),
    standardCore: true,
    references: [
      serial("제14조 · 해설집 66쪽", "Art. 14 · commentary p. 66"),
      ref("korea-kr-2024-changes", "본문(2종 신규 마련)", "Body (two new contracts)"),
    ],
  }),
  item({
    id: "secondary-rights-license",
    category: "rights",
    title: t("2차 저작 계약의 독점 여부·분야별 범위·분배 비율", "Adaptation deals: exclusivity, scope by medium, revenue split"),
    question: t(
      "계약서가 영상화·게임화 같은 2차 저작을 서비스 제공업자·사업자에게 허락하거나 넘기는 내용을 담고 있나요?",
      "Does the contract license or assign adaptation rights (film, games and so on) to the service provider or a business partner?",
    ),
    standard: t(
      "표준 ‘2차적저작물작성권 이용허락 계약서’ 제4조는 영상화(애니메이션화), 영상화(영화·드라마 등), 공연화, 상품화(유형물), 이모티콘·NFT 등 상품화(무형물), 게임화, 어문·음성·음악저작물 작성, 광고, 번역저작물 같은 항목별로 국내·국외 허락 여부와 분배 비율(저작권자:사업자), 지역 또는 언어를 적고, 독점적·비독점적 중 하나를 고르게 한다(항목별로 달리 정하면 따로 기재). 독점으로 하면 저작권자는 그 계약과 저촉되는 계약·권리 행사를 할 수 없고, 캐릭터 권리와 속편·후속 시즌·스핀오프를 만들 권리는 별도로 정한다. 사업자가 제3자와 계약하려면 저작권자의 사전 서면 동의를 받고 계약서 사본을 제공해야 한다(제7조). 이용허락은 저작재산권이 넘어가지 않지만 양도는 넘어가며, 양도계약서에서 계약기간을 ‘영구’로 하면 계약을 해제하는 등 무효로 돌리지 않는 한 되찾을 수 없다고 해설한다.",
      "Article 4 of the standard secondary-works license lists media (animation, film and drama, stage, physical merchandise, emoticons and NFT-type goods, games, literary, audio and music works, advertising, translation) and, for each, whether domestic and overseas use is permitted, the revenue split (author : business), and the region or language; the grant is either exclusive or non-exclusive (stated per item if they differ). If exclusive, the author may not enter conflicting deals or exercise conflicting rights; rights to characters, sequels, later seasons and spin-offs are decided separately. The business must get the author’s prior written consent and give a copy of any third-party contract (Art. 7). A license does not transfer the copyright but an assignment does, and the commentary warns that a “perpetual” term in the assignment contract cannot be undone unless the contract is rescinded.",
    ),
    lookFor: [
      t("이용허락인지 양도인지(권리가 넘어가는지)", "Is it a license or an assignment (does ownership transfer)?"),
      t("분야별로 허락 여부와 독점·비독점이 갈려 있는지", "Is permission and exclusivity set per medium?"),
      t("분배 비율이 분야별로 적혀 있고, 사업자가 직접 사업화하는 경우와 제3자에게 허락하는 경우가 구분되는지", "Are splits stated per medium, separating direct exploitation from third-party licensing?"),
      t("계약 기간이 있는지(영구인지), 기간이 끝나면 권리가 돌아오는지", "Is there a term (or perpetual), and do rights return at the end?"),
      t("제3자와 계약할 때 사전 서면 동의를 받고 사본을 주는지", "Do they need your written consent and give you a copy of third-party deals?"),
      t("캐릭터·속편·스핀오프가 포함되는지", "Are characters, sequels and spin-offs included?"),
    ],
    attention: "when-present",
    attentionNote: t(
      "2차 저작을 허락하거나 넘기는 내용이 있다면 독점 여부, 분야별 범위, 분배 비율, 기간(영구 여부)을 하나씩 확인하고 서명 전에 상담을 받으세요.",
      "If the contract licenses or assigns adaptation rights, check exclusivity, scope by medium, revenue split and term (perpetual or not) one by one, and get advice before signing.",
    ),
    standardCore: true,
    references: [
      ref("standard-contracts-commentary", "2차적저작물작성권 이용허락 계약서(별표7) 제3·4·7·8조 · 해설집 126~129쪽", "Secondary-works license (Annex 7) Arts. 3, 4, 7, 8 · commentary pp. 126–129"),
      ref("standard-contracts-commentary", "2차적저작물작성권 양도계약서(별표8) 제3·4·6조 · 해설집 137~141쪽", "Secondary-works assignment (Annex 8) Arts. 3, 4, 6 · commentary pp. 137–141"),
    ],
  }),
  item({
    id: "moral-rights-editing",
    category: "rights",
    title: t("저작인격권·제목/내용 변경·교정 및 편집", "Moral rights, changes to the work, proofreading and editing"),
    question: t(
      "작품의 제목·내용·형식을 바꾸거나 교정·편집할 때 내 동의나 확인을 받는다고 적혀 있나요?",
      "Does it say your consent or confirmation is needed to change the title, content or form of the work, or to proofread and edit it?",
    ),
    standard: t(
      "제16조는 서비스 제공업자가 저작자의 저작인격권을 존중하고, 실명 또는 필명 표시를 저작자의 요구에 따르며, 제호·내용·형식을 바꾸려면 저작자의 서면 동의를 얻도록 한다(부득이한 범위의 변경은 가능하지만 본질적 내용은 바꿀 수 없다). 제17조는 교정과 편집을 원칙적으로 서비스 제공업자가 수행하되 결과물에 대해 저작권자의 확인을 받도록 하고, 해설은 교정·편집이 동일성유지권을 침해하지 않는 사소한 수준이어야 한다고 설명한다.",
      "Article 16 has the service provider respect the author’s moral rights, display the real or pen name as the author requires, and obtain the author’s written consent to change the title, content or form (changes unavoidable for the nature or use of the work are allowed, but not to its essence). Article 17 has the provider do proofreading and editing as a rule, with the author confirming the result; the commentary says such edits must be minor enough not to infringe the right of integrity.",
    ),
    lookFor: [
      t("제목·표지·대사·컷 수정 시 동의 절차가 있는지", "Is there a consent step for edits to the title, cover, dialogue or panels?"),
      t("필명 표시를 내가 정할 수 있는지", "Can you choose how your name or pen name appears?"),
      t("서비스 제공업자가 임의로 바꿀 수 있는 범위가 좁게 정해져 있는지", "Is the provider’s freedom to alter the work narrowly limited?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "수정 권한이 불분명하면 작품이 의도와 다르게 바뀔 수 있습니다. 변경 시 서면 동의와 확인 절차를 적어 달라고 요청하세요.",
      "If editing authority is unclear, your work could be changed against your intent. Ask for written consent and a confirmation step for changes.",
    ),
    standardCore: true,
    references: [
      serial("제16조 · 해설집 67쪽", "Art. 16 · commentary p. 67"),
      serial("제17조 · 해설집 68쪽", "Art. 17 · commentary p. 68"),
    ],
  }),

  // ── 종료와 반환 ─────────────────────────────────────────────────────
  item({
    id: "termination",
    category: "exit",
    title: t("해지·해제 조건과 절차", "Conditions and procedure for ending the contract"),
    question: t(
      "어떤 경우에 누가 계약을 끝낼 수 있는지, 끝난 뒤 대금은 어떻게 되는지 적혀 있나요?",
      "Does it say when and by whom the contract can be ended, and what happens to payments afterwards?",
    ),
    standard: t(
      "제22조는 계약을 위반하면 상대방이 일정 기간(○일 이상)을 정해 이행을 요구하고, 이행하지 않으면 연재 시작 전에는 해지·해제, 시작 후에는 해지할 수 있게 한다. 연재 의사가 없다는 서면 통지, 회생·파산 같은 사유, 30일 이상의 고의적 계약 불이행·연락 두절, 표절·범죄가 법원 판결 등으로 입증된 경우에는 서면으로 해지를 통고할 수 있다. 해설은 표절 논란만으로는 해지할 수 없고 법원 판결 등으로 객관적으로 입증돼야 한다고 설명한다. 해지되면 서비스 제공업자는 해지 시점까지 발생한 대금(원고료·RS 등)을 지급하고 즉시 서비스를 중지하되, 이용자를 위해 필요한 범위에서 30일 이내 서비스를 이어 갈 수 있다. 민법 등에 따른 법정 해지·해제와 합의 해지는 배제되지 않는다.",
      "Article 22 lets the other party set a period (○ days or more) to cure a breach, and if it is not cured, end the contract: rescission before serialization starts, termination after. Written notice may end it where one side no longer intends to serialize, on insolvency-type events, on intentional non-performance or loss of contact for 30 days or more, or where plagiarism or crime is proven by a court judgment or similar. The commentary says an accusation of plagiarism alone is not enough; it must be objectively proven. On termination the provider pays everything accrued (fees, RS and so on) up to that point and stops service immediately, though it may continue for readers for up to 30 days where needed. Statutory termination under the Civil Act and termination by agreement remain available.",
    ),
    lookFor: [
      t("해지 사유가 양쪽에 공평하게 적혀 있는지", "Are the grounds for ending the contract balanced between both sides?"),
      t("이행 요구 기간과 서면 통지 방식", "The cure period and how written notice is given."),
      t("해지 후 대금 정산과 서비스 중지 시점(유예 기간 길이)", "Settlement after termination and when service stops (length of any grace period)."),
      t("한쪽만 일방적으로 연재를 끝낼 수 있는 조항이 없는지", "No clause letting only one side end serialization at will?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "해지 조건이 없거나 한쪽에만 유리하면 빠져나오기 어려울 수 있습니다. 이행 요구 기간, 해지 사유, 해지 후 정산 방식을 적어 달라고 요청하세요.",
      "Missing or one-sided exit terms can make it hard to leave. Ask for the cure period, grounds for ending and post-termination settlement to be written down.",
    ),
    standardCore: true,
    references: [serial("제22조 · 해설집 70쪽", "Art. 22 · commentary p. 70")],
  }),
  item({
    id: "rights-return",
    category: "exit",
    title: t("계약 종료 후 권리·원고 반환", "Getting rights and manuscripts back after the contract"),
    question: t(
      "계약이 끝나면 권리와 원고(원본 파일·원화)를 돌려받는 절차가 적혀 있나요?",
      "Does it set out how rights and manuscripts (original files, artwork) come back when the contract ends?",
    ),
    standard: t(
      "표준 웹툰 연재계약서는 계약이 끝나면 서비스 제공업자가 배타적발행권 등록을 지체 없이(또는 정한 기일 안에) 말소 신청하고 증빙을 교부하도록 한다(제4조 제4항). 제18조는 서비스 제공업자가 받은 육필 원고·원화 등 실물 원고와 자료를 반환하고, 전자 파일은 파기한 뒤 파기 확인서를 서면으로 교부하도록 한다. 다만 이미 작품을 구매한 이용자에게 차질 없이 서비스하기 위한 최소한의 자료는 저작권자와 협의해 보존할 수 있고, 해설은 새 이용자에게 대여·판매하는 서비스는 중단을 요구할 수 있다고 설명한다. 훼손·분실하거나 이 의무를 이행하지 않으면 서비스 제공업자가 책임진다(책임 없는 사유 제외). 권리 허락 기간(제3조)과 계약 종료 후에도 이어지는 RS(제10조 제4항)는 따로 확인해야 한다.",
      "The standard serialization contract has the service provider apply to cancel the exclusive-publication registration without delay (or within a set time) after the contract ends and hand over proof (Art. 4(4)). Article 18 requires returning handwritten manuscripts, original artwork and other physical materials, and destroying electronic files with a written confirmation of destruction. The provider may, by consultation, keep the minimum material needed to keep serving readers who already bought the work; the commentary says the author can ask to stop new rentals and sales. The provider is liable for damaged or lost materials or for not complying, unless it is not at fault. Check separately the rights-grant period (Art. 3) and revenue share that continues after the end (Art. 10(4)).",
    ),
    lookFor: [
      t("종료 후 권리가 언제 완전히 돌아오는지(권리 허락 기간 포함)", "When do rights fully return, including any post-term grant period?"),
      t("등록 말소 기한과 증빙 교부", "The deadline to cancel any registration and proof of it."),
      t("원본·파일을 반환하거나 파기하고 확인서를 주는지", "Are originals returned or files destroyed, with written confirmation?"),
      t("이미 구매한 독자를 위해 남기는 자료의 범위와 종료 후에도 이어지는 RS", "What may be retained for existing buyers, and any continuing RS."),
    ],
    attention: "when-absent",
    attentionNote: t(
      "반환 절차가 없으면 계약이 끝난 뒤에도 권리와 원고가 상대방에게 남을 수 있습니다. 권리 반환 시점, 말소 기한, 원고 반환·파기 확인을 적어 달라고 요청하세요.",
      "Without a return procedure, rights and manuscripts may stay with the other side after the end. Ask for the return date, cancellation deadline and return or destruction confirmation.",
    ),
    standardCore: true,
    references: [
      serial("제3조 · 해설집 58쪽", "Art. 3 · commentary p. 58"),
      serial("제4조 제4항 · 해설집 59쪽", "Art. 4(4) · commentary p. 59"),
      serial("제18조 · 해설집 68쪽", "Art. 18 · commentary p. 68"),
    ],
  }),

  // ── 검토 절차와 분쟁 ─────────────────────────────────────────────────
  item({
    id: "review-period-counsel",
    category: "process",
    title: t("설명 의무·검토 기간(15일)·전문가 자문", "Explanation duty, review period (15 days) and advice"),
    question: t(
      "계약 전에 내용을 설명받고, 법률 자문을 받을 충분한 검토 기간과 자문을 허용하는 조항이 있나요?",
      "Does it give you an explanation before signing, enough time to take legal advice, and permission to consult advisers?",
    ),
    standard: t(
      "제31조는 서비스 제공업자가 계약서의 주요 내용과 취지를 설명하고(저작권자의 요청으로 바뀐 내용은 저작권자가 설명), 저작권자가 계약서 전문을 처음 확인한 시점부터 최소 15일의 기간을 보장해 계약 전 법률 자문을 받을 수 있게 하도록 정한다. 제26조 제2항은 계약 체결·검토를 위해 비밀유지 의무를 지는 변호사 등 전문가와 만화·예술·저작권 관련 공공기관, 법령상 절차를 거친 협회·단체·조합의 자문을 받는 경우를 비밀유지 의무의 예외로 둔다. 해설집은 예술인복지재단, 한국만화영상진흥원의 만화인 헬프데스크, 한국저작권위원회의 저작권법률지원센터 등에서 기초적인 법률 자문을 받을 수 있다고 안내한다.",
      "Article 31 has the service provider explain the main terms and purpose (changes made at the author’s request are explained by the author), and guarantees at least 15 days from the author’s first sight of the full text to take legal advice before signing. Article 26(2) exempts consultation with confidentiality-bound lawyers and other experts, public bodies on comics, art or copyright, and lawfully established associations from the confidentiality duty. The commentary says basic legal advice is available from places such as the Korea Artists Welfare Foundation, the Korea Manhwa Contents Agency’s comics helpdesk and the Korea Copyright Commission’s legal support center.",
    ),
    lookFor: [
      t("검토 기간을 보장하는지(표준은 최소 15일)와 계약서를 받은 날짜 기록", "Is a review period guaranteed (the standard says at least 15 days), and is the date you received the contract recorded?"),
      t("비밀유지 조항 때문에 변호사·기관 상담이 막혀 있지 않은지", "Does a confidentiality clause block you from consulting a lawyer or agency?"),
      t("주요 내용을 설명받았는지, 내 요청으로 바뀐 조항은 내가 설명해야 하는지", "Were the main terms explained, and do you explain clauses changed at your request?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "검토 시간이나 상담 허용이 없다면 서명을 서두르지 말고 시간을 요청하세요. 표준계약서는 최소 15일의 검토 기간과 전문가 자문 예외를 둡니다.",
      "If there is no review time or permission to consult, do not rush to sign—ask for time. The standard contract provides at least 15 days and a consultation exception.",
    ),
    standardCore: true,
    references: [
      serial("제26조 제2항 · 해설집 72쪽", "Art. 26(2) · commentary p. 72"),
      serial("제31조 · 해설집 73쪽", "Art. 31 · commentary p. 73"),
      ref("standard-contracts-commentary", "I-1 표준계약서의 개요(자문 기관 안내) · 해설집 10~11쪽", "Part I-1 overview (advice bodies) · commentary pp. 10–11"),
    ],
  }),
  item({
    id: "written-contract-basics",
    category: "process",
    title: t("서면 계약과 기본 기재 사항", "Written contract and the basic terms it should contain"),
    question: t(
      "계약서에 계약금액, 기간·갱신·변경·해지, 권리와 의무, 업무 범위, 수익 배분, 분쟁 해결이 모두 적혀 있나요?",
      "Does the contract cover the amount, term/renewal/change/termination, rights and duties, scope of work, revenue split and dispute resolution?",
    ),
    standard: t(
      "해설집은 문화예술기획업자와 예술인이 문화예술용역 관련 계약을 체결할 때 예술인복지법 제4조의4 제2항에 따라 서면계약에 ① 계약금액, ② 계약기간·갱신·변경 및 해지에 관한 사항, ③ 당사자의 권리 및 의무, ④ 업무·과업의 내용, 시간 및 장소 등 용역의 범위, ⑤ 수익의 배분, ⑥ 분쟁 해결에 관한 사항이 반드시 포함되어야 한다고 안내하고, 문화체육관광부의 표준계약서를 사용하면 서면계약 체결 의무를 이행한 것으로 본다고 적는다. 이 법이 내 계약에 적용되는지는 당사자와 용역의 성격에 따라 달라질 수 있어 전문가에게 확인해야 한다. 표준 연재계약서는 계약서 2통을 작성해 서로 1통씩 보관하도록 한다(제32조).",
      "The commentary says that when a culture-and-arts planner and an artist contract for cultural services, the Artists Welfare Act, Art. 4-4(2), requires the written contract to include (1) the amount, (2) term, renewal, change and termination, (3) rights and duties, (4) scope of the services, (5) revenue split and (6) dispute resolution, and that using MCST’s standard contract is treated as meeting the written-contract duty. Whether that Act applies to your contract depends on the parties and the nature of the services, so confirm with an expert. The standard serialization contract has two copies signed and one kept by each side (Art. 32).",
    ),
    lookFor: [
      t("위 여섯 가지가 모두 계약서에 적혀 있는지", "Are all six items written in the contract?"),
      t("서명·날인한 계약서를 나도 한 부 받아 보관하는지", "Do you keep a signed copy?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "필수로 안내된 기재 사항이 빠져 있다면 서명 전에 채워 달라고 요청하세요. 적용 여부는 전문가에게 확인하세요.",
      "If any of the listed items is missing, ask for it to be added before you sign, and confirm with an expert whether the Act applies.",
    ),
    standardCore: false,
    references: [
      ref("standard-contracts-commentary", "I-1-다 ‘서면계약 체결 의무’ · 해설집 10~11쪽", "Part I-1 on the written-contract duty · commentary pp. 10–11"),
      serial("제32조 · 해설집 74쪽", "Art. 32 · commentary p. 74"),
    ],
  }),
  item({
    id: "dispute-resolution",
    category: "process",
    title: t("분쟁 해결과 관할 법원", "Dispute resolution and court jurisdiction"),
    question: t(
      "분쟁이 생기면 어떻게 해결하는지(조정, 관할 법원)가 적혀 있나요?",
      "Does it say how disputes are handled (mediation, which court)?",
    ),
    standard: t(
      "제30조는 분쟁을 자율적으로 해결하도록 노력하고, 소송에 앞서 한국저작권위원회의 조정을 받을 수 있으며, 소송은 민사소송법상의 관할법원을 제1심 법원으로 한다고 정한다. 해설은 관할법원을 사업자 소재지로 미리 정한 약관 형태 계약서에 공정거래위원회가 시정을 요구한 사례가 있어 이렇게 정했다고 설명하고, 합의로 특정 법원을 정할 수도 있다고 덧붙인다.",
      "Article 30 says the parties try to settle disputes themselves, may use mediation by the Korea Copyright Commission before suing, and that lawsuits go first to the court that has jurisdiction under the Civil Procedure Act. The commentary explains this wording was chosen because the Fair Trade Commission has demanded corrections of form contracts that fix the business’s location as the court, and notes the parties may still agree on a specific court.",
    ),
    lookFor: [
      t("관할 법원이 한쪽 소재지로 고정돼 있는지", "Is the court fixed to one side’s location?"),
      t("소송 전 조정 절차를 언급하는지", "Does it mention mediation before litigation?"),
    ],
    attention: "when-absent",
    attentionNote: t(
      "분쟁 해결 방식이 없거나 한쪽에 치우쳐 있다면 서명 전에 확인을 요청하세요.",
      "If the dispute process is missing or one-sided, ask about it before signing.",
    ),
    standardCore: false,
    references: [serial("제30조 · 해설집 73쪽", "Art. 30 · commentary p. 73")],
  }),
]);

/** 카테고리 id → 카테고리. 데이터 오타를 테스트가 잡도록 조회 함수로만 노출한다. */
export function getContractReviewCategory(id: ContractReviewCategoryId): ContractReviewCategory {
  const category = CONTRACT_REVIEW_CATEGORIES.find((entry) => entry.id === id);
  if (!category) throw new Error(`Unknown contract review category: ${id}`);
  return category;
}

export function getContractReviewSource(id: ContractReviewSourceId): ContractReviewSource {
  const source = CONTRACT_REVIEW_SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown contract review source: ${id}`);
  return source;
}
