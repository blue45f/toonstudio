# -*- coding: utf-8 -*-
import re, json, os
S = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(S, 'entries.json'), encoding='utf-8'))
GROUP_COMMENT = {
 "려고": "  // -려고 오용 — ㄹ어간 정형(살려고·만들려고)은 넣지 않았다.",
 "께": "  // '-께' 말끝 추가분 — 위 1차분과 같은 규약(동사 어간 한정).",
 "드러": "  // 드러나다 계열 — '들어-'로 시작하는 정형은 없다.",
 "요새웬": "  // 요새·웬일 — '왠지'는 정형이라 건드리지 않는다.",
 "명사": "  // 명사 오기 — 정형과 음절이 겹치지 않는 것만.",
 "히이부사": "  // 부사 '-이' 정형인데 '-히'로 잘못 쓰는 경우.",
 "이히부사": "  // 부사 '-히' 정형인데 '-이'로 잘못 쓰는 경우(솔직히·꼼꼼히 부류).",
 "기타명사": "  // 기타 명사·부사 어간 오기.",
 "부사": "  // 부사·연결 표현 오기.",
 "설렘헤매": "  // 설렘·헤매 계열 — '헤메'는 '헤메다·헤메이다'의 어간 오기를 함께 잡는다.",
 "외래어": "  // 외래어 표기 오기 — 표준 표기가 하나로 정해진 것만.",
 "활용": "  // 불규칙 활용 오기 — 활용형 자체가 존재하지 않는 형태만.",
 "형용사": "  // 형용사 어간 오기.",
 "대로": "  // '-대로' 오기 — 장소 '데'와 문맥 판별이 필요한 경우는 넣지 않았다.",
 "기타": "  // 기타 무모호 오기.",
 "에요": "  // '-에요' 오용 — 앞말이 정해진 고정 형태만.",
 "어떡": "  // 어떡·어쨌든 계열.",
 "붇": "  // 붓다 활용 오기.",
}
blocks = []
prev = None
for e in E:
    if e["group"] != prev:
        blocks.append(GROUP_COMMENT[e["group"]])
        prev = e["group"]
    msg = f"'{e['wrong']}'이 아니라 '{e['right']}'로 써요."
    blocks.append("  {\n    pattern: /%s/g,\n    replacement: \"%s\",\n    message: \"%s\",\n    severity: \"warning\",\n  }," % (e["pattern"], e["repl"], msg))
insert = "\n  // ── 사전 확장(2차): 무모호 오기 100+ 목표분 ──────────────────────────\n  // 문맥 판별이 필요한 항목(안/않·던지/든지·맞히다/맡기다 식 교정 방향이\n  // 갈리는 경우)은 계속 제외한다. 오탐 0이 검출률보다 우선이다.\n" + "\n".join(blocks) + "\n"
src = open(os.path.join(S, 'main-spellcheck.ts'), encoding='utf-8').read()
anchor = '    message: "소망의 뜻이면 \'바램\'이 아니라 \'바람\'이 표준이에요.",\n    severity: "info",\n  },\n];'
assert anchor in src, "anchor missing"
src2 = src.replace(anchor, anchor[:-2] + insert + "];")
open(os.path.join(S, 'patched.ts'), 'w', encoding='utf-8').write(src2)
m = re.search(r'const MISSPELLINGS.*?^\];', src2, re.S | re.M)
print("new entries:", len(E), "| total MISSPELLINGS:", m.group(0).count('pattern:'), "| lines:", src2.count("\n") + 1)
