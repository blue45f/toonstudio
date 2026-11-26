/**
 * 외부 AI 모델 전송 전 창작자 원고·메모·캐릭터 바이블에 섞여 들어간 개인정보(비밀키, 주민·외국인등록번호,
 * 카드번호, 이메일, SNS 링크·아이디·핸들, 혼합 전화번호, 한국 은행 계좌번호, 한국 도로명·지번·아파트·건물명 주소)를
 * 마스킹하는 순수·무의존성 공용 모듈.
 *
 * API 서버(`studio-openai-guardrails.ts`)와 웹 클라이언트(`studio-writer-room-ai.ts`,
 * `studio-scenario-scenes.ts`)가 단일 기준을 공유한다.
 */

export interface RedactedCreatorText {
  readonly sanitizedText: string;
  readonly redactedCount: number;
}

// 모듈 로드 시 1회 컴파일해 요청당 정규식 재생성 비용을 없앤다.
const SECRET_KEY_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/gu;

// 주민·외국인등록번호: 하이픈·공백·가운뎃점·유니코드 대시·무구분자 모두 대응 (월 01~12, 일 01~31 검증)
const RESIDENT_ID_PATTERN =
  /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:\s*[-–—−·]\s*|\s+)?[1-8]\d{6}(?!\d)/gu;

// 신용·체크카드 번호 (16자리 4-4-4-4 또는 아멕스 4-6-5, 유니코드 대시 포함)
const CARD_NUMBER_PATTERN =
  /\b(?:\d{4}[-–—−\s]?){3}\d{4}\b|\b\d{4}[-–—−\s]?\d{6}[-–—−\s]?\d{5}\b/gu;

// 이메일 주소
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu;

// 카카오톡 오픈채팅·인스타그램·텔레그램 등 SNS 직접 링크
const SOCIAL_URL_PATTERN =
  /https?:\/\/(?:(?:open|pf|qr)\.kakao\.com|(?:www\.)?(?:instagram\.com|instagr\.am|t\.me|twitter\.com|x\.com|threads\.net))\/[^\s,)"'<>]+/giu;

// 한국 전화번호 (국제 +82, 괄호 지역/휴대폰 번호, 050x 안심번호, 070, 유니코드 대시, 무구분자 휴대폰·유선·070·050x 포함)
const PHONE_PATTERN =
  /(?:(?<![\w(])\+82[\s.\-–—−]*\(?(?:\(0\)|0)?(?:1[016789]|2|[3-6][1-5]|70|50\d)\)?[\s.\-–—−~]*|\(0(?:1[016789]|2|[3-6][1-5]|70|50\d)\)[\s.\-–—−~]*|(?<!\d)0(?:1[016789]|2|[3-6][1-5]|70|50\d)\)?[\s.\-–—−~]*)\d{3,4}[\s.\-–—−~]*\d{4}(?!\d)/gu;

// 라벨 탐색에는 고정 문자열만 사용한다. 공백은 아래 단방향 스캐너에서 처리해
// 계좌·SNS 라벨의 선택적 필드 사이에서 같은 공백을 반복 분할하는 역추적을 막는다.
const BANK_ACCOUNT_LABEL_PATTERN =
  /국민|KB|신한|우리|하나|농협|NH|기업|IBK|카카오|카뱅|토스|케이|우체국|새마을(?:금고)?|수협|신협|SC제일|씨티|부산|대구|광주|전북|경남|제주|산업|수출입|저축|계좌/giu;
const BANK_ACCOUNT_VALUE_PATTERN = /(?:\d{2,6}(?:[-–—−\s]\d{2,7}){1,3}|\d{10,14})(?!\d)/uy;

// 라벨 없는 3~4구간 하이픈 한국 은행 계좌번호 (예: 123401-04-123456, 110-423-891234, 302-1234-5678-91)
// 전화번호(이미 마스킹됨)·날짜(YYYY-MM-DD는 3번째 구간이 2자리)는 제외한다.
const UNLABELED_KOREAN_BANK_ACCOUNT_PATTERN =
  /(?<!\d)\d{3,6}[-–—−]\d{2,6}[-–—−]\d{4,7}(?:[-–—−]\d{1,3})?(?!\d)/gu;

const SNS_LABEL_PATTERN =
  /카카오|카톡|Kakao|인스타(?:그램)?|Instagram|IG|텔레그램|Telegram|라인|LINE|트위터|스레드|Threads/giu;
const SNS_FIELD_PATTERN = /아이디|ID|계정|핸들/iy;
const SNS_VALUE_PATTERN = /@?[A-Za-z0-9][A-Za-z0-9._-]{2,29}(?![/\w])/uy;

// 독립 @SNS 핸들 (이메일 앞부분은 이미 마스킹됨, npm 스코프 `@pkg/name` 및 `@cf/...` 는 `/` 후행 제외)
const STANDALONE_SNS_HANDLE_PATTERN =
  /(?<![A-Za-z0-9._%+-])@[A-Za-z][A-Za-z0-9._-]{2,29}(?![/\w])/gu;

const BUILDING_KEYWORD =
  "(?:아파트|오피스텔|빌라|타워|파이낸스센터|트레이드센터|비즈니스센터|테크노밸리|센터|빌딩|플라자|스퀘어|팰리스|파크|맨션|하우스|하이츠|푸르지오|자이|래미안|힐스테이트|아이파크|더샵|롯데캐슬|e편한세상|호반써밋|포레나|아크로|트리지움|엘스|리센츠|파크리오)";

const ADDRESS_DETAIL_UNIT =
  `(?:(?:지하\\s*)?\\d{1,3}층|[A-Za-z가-힣0-9-]{1,6}동(?:\\s*\\d{1,5}(?:-\\d{1,4})?호)?|(?:지하\\s*|[A-Za-z])?\\d{1,5}(?:-\\d{1,4})?호)`;

const ADDRESS_TRAILING_DETAIL =
  `(?:(?:,\\s*|\\s+)(?:[가-힣A-Za-z0-9·-]{1,18}${BUILDING_KEYWORD}|${ADDRESS_DETAIL_UNIT})){0,4}(?:\\s*\\([^()]{2,60}\\))?`;

const ADDRESS_NUMBER_GUARD =
  "(?!(?:\\d|분|초|시|일|월|년|살|세|명|개|번(?!지)|회|차|원|호선|역|출구|길|(?<=[^0-9][1-9])가|[A-Za-z]))";

const PROVINCE_PREFIX =
  "(?:세종(?:특별자치시|시)?(?:\\s+[가-힣]{1,8}(?:읍|면))?|(?:서울|부산|대구|인천|광주|대전|울산|경기|강원|충청북|충청남|충북|충남|전라북|전라남|전북|전남|경상북|경상남|경북|경남|제주)(?:특별자치도|특별시|광역시|도|시)?(?:\\s+[가-힣]{1,8}(?:시|군|구)){1,2}(?:\\s+[가-힣]{1,8}(?:읍|면))?)";

// 시/도를 생략하고 구·군·시로 시작하는 실무 주소 (예: 강남구 테헤란로 152 ..., 마포구 서교동 395-11 302호)
const DISTRICT_ONLY_PREFIX =
  "(?:[가-힣]{2,6}시\\s+)?[가-힣]{2,6}(?:구|군)(?:\\s+[가-힣]{1,8}(?:읍|면))?";

const ROAD_OR_LOT_WITH_NUM =
  `(?:[가-힣]{1,12}(?:\\s*\\d{1,2}(?:·\\d{1,2})?)?(?:동|가|리)|[가-힣]{1,12}(?:(?<!으)로|대로)(?:\\s*\\d{1,3}[가-힣]?길)?|[가-힣]{1,12}\\d{1,3}[가-힣]?길|[가-힣]{1,12}길)\\s*\\d{1,5}(?:-\\d{1,5})?(?:번지)?${ADDRESS_NUMBER_GUARD}${ADDRESS_TRAILING_DETAIL}`;

// 지번 번호 없이 동·가·리 + 아파트/건물명 + 동/호/층으로 이어지는 한국 주소 (예: 서울 강남구 대치동 은마아파트 12동 804호)
const DONG_WITH_BUILDING =
  `[가-힣]{1,12}(?:\\s*\\d{1,2}(?:·\\d{1,2})?)?(?:동|가|리)\\s+[가-힣A-Za-z0-9·-]{1,18}${BUILDING_KEYWORD}(?:(?:,\\s*|\\s+)${ADDRESS_DETAIL_UNIT}){0,3}(?:\\s*\\([^()]{2,60}\\))?`;

const KOREAN_ADDRESS_PATTERN = new RegExp(
  `(?<![가-힣A-Za-z0-9])(?:${PROVINCE_PREFIX}|${DISTRICT_ONLY_PREFIX})\\s+(?:${DONG_WITH_BUILDING}|${ROAD_OR_LOT_WITH_NUM})`,
  "gu",
);

function skipWhitespace(input: string, start: number): number {
  let cursor = start;
  while (cursor < input.length && /\s/u.test(input.charAt(cursor))) cursor += 1;
  return cursor;
}

function skipLabelSeparator(input: string, start: number): number {
  const separator = skipWhitespace(input, start);
  return input[separator] === ":" || input[separator] === "："
    ? skipWhitespace(input, separator + 1)
    : separator;
}

function bankAccountPrefixEnd(input: string, start: number, label: string): number | null {
  let cursor = skipWhitespace(input, start);
  if (label === "계좌") {
    return input.startsWith("번호", cursor) ? cursor + 2 : cursor;
  }
  if (label === "카카오" || label === "토스" || label === "케이") {
    if (!input.startsWith("뱅크", cursor)) return null;
    cursor = skipWhitespace(input, cursor + 2);
  }
  if (!input.startsWith("은", cursor)) return null;
  return cursor + (input.startsWith("은행", cursor) ? 2 : 1);
}

function snsPrefixEnd(input: string, start: number, label: string): number | null {
  let cursor = skipWhitespace(input, start);
  if (label === "카카오" && input.startsWith("톡", cursor)) cursor += 1;
  if (label.toLowerCase() === "kakao") {
    if (input.slice(cursor, cursor + 4).toLowerCase() !== "talk") return null;
    cursor += 4;
  }
  cursor = skipWhitespace(input, cursor);
  SNS_FIELD_PATTERN.lastIndex = cursor;
  if (!SNS_FIELD_PATTERN.test(input)) return cursor;

  // ID가 짧은 아이디 자체의 일부일 수 있다. 필드 뒤에 값이 있을 때만 필드로 확정한다.
  const fieldEnd = SNS_FIELD_PATTERN.lastIndex;
  SNS_VALUE_PATTERN.lastIndex = skipLabelSeparator(input, fieldEnd);
  return SNS_VALUE_PATTERN.test(input) ? fieldEnd : cursor;
}

/**
 * 외부 AI 전송 전 원고·메모에 섞여 들어간 개인정보(비밀키, 주민·외국인등록번호, 카드번호,
 * 이메일, SNS 링크·아이디·핸들, 전화번호, 은행 계좌번호, 한국 도로명·지번·아파트·건물명 주소)를 마스킹한다.
 */
export function redactCreatorSensitiveText(raw: string): RedactedCreatorText {
  if (!raw) return { sanitizedText: raw, redactedCount: 0 };

  let redactedCount = 0;
  const replaceCounted = (input: string, pattern: RegExp, token: string): string =>
    input.replace(pattern, () => {
      redactedCount += 1;
      return token;
    });

  const replaceKeepingPrefix = (
    input: string,
    labelPattern: RegExp,
    prefixEnd: (input: string, start: number, label: string) => number | null,
    valuePattern: RegExp,
    token: string,
  ): string => {
    const chunks: string[] = [];
    let copiedUntil = 0;
    labelPattern.lastIndex = 0;
    let label: RegExpExecArray | null;
    while ((label = labelPattern.exec(input)) !== null) {
      const end = prefixEnd(input, labelPattern.lastIndex, label[0]);
      if (end === null) continue;
      const valueStart = skipLabelSeparator(input, end);
      // sticky 모드와 유한 길이 값 규칙으로 라벨 직후 한 위치만 검사한다.
      valuePattern.lastIndex = valueStart;
      if (!valuePattern.exec(input)) continue;
      chunks.push(input.slice(copiedUntil, valueStart), token);
      copiedUntil = valuePattern.lastIndex;
      labelPattern.lastIndex = copiedUntil;
      redactedCount += 1;
    }
    if (chunks.length === 0) return input;
    chunks.push(input.slice(copiedUntil));
    return chunks.join("");
  };

  let current = raw;
  current = replaceCounted(current, SECRET_KEY_PATTERN, "[비밀키 마스킹됨]");
  current = replaceCounted(current, RESIDENT_ID_PATTERN, "[주민번호 비공개]");
  current = replaceCounted(current, CARD_NUMBER_PATTERN, "[카드번호 비공개]");
  current = replaceCounted(current, EMAIL_PATTERN, "[이메일 비공개]");
  current = replaceCounted(current, SOCIAL_URL_PATTERN, "[SNS 링크 비공개]");
  current = replaceCounted(current, PHONE_PATTERN, "[연락처 비공개]");
  current = replaceKeepingPrefix(current, BANK_ACCOUNT_LABEL_PATTERN, bankAccountPrefixEnd, BANK_ACCOUNT_VALUE_PATTERN, "[계좌번호 비공개]");
  current = replaceCounted(current, UNLABELED_KOREAN_BANK_ACCOUNT_PATTERN, "[계좌번호 비공개]");
  current = replaceKeepingPrefix(current, SNS_LABEL_PATTERN, snsPrefixEnd, SNS_VALUE_PATTERN, "[계정 비공개]");
  current = replaceCounted(current, STANDALONE_SNS_HANDLE_PATTERN, "[계정 비공개]");
  current = replaceCounted(current, KOREAN_ADDRESS_PATTERN, "[주소 비공개]");

  return {
    sanitizedText: current,
    redactedCount,
  };
}
