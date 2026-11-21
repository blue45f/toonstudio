#!/usr/bin/env python3
"""웹 발표 정본에서 편집 가능한 24장 PPTX와 PDF를 생성한다.

필요 도구: Node/tsx(저장소 의존성), python-pptx, lxml, PyMuPDF, LibreOffice,
Noto Sans CJK KR 글꼴. --check는 산출물을 바꾸지 않고 정본·산출물 해시를 확인한다.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import fitz
from lxml import html
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public"
DEFAULT_OUTPUT = PUBLIC / "brand"
MANIFEST_NAME = "toonstudio-ir-deck.manifest.json"
FONT = "Noto Sans CJK KR"
WIDTH, HEIGHT = 13.333333, 7.5
BG, PANEL, INK, MUTED, ACCENT = "071D2B", "102E3F", "F0F6FA", "A9BECD", "30D5C8"
ORIGIN = "https://toonstudio.cloud"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_data(directory: Path) -> dict:
    output = directory / "ir-source.json"
    subprocess.run(
        ["node", "--import", "tsx", str(ROOT / "scripts/export-ir-deck-data.mts"), "--output", str(output)],
        cwd=ROOT, check=True,
    )
    return json.loads(output.read_text())


def text(node) -> str:
    return " ".join(" ".join(node.itertext()).split())


def class_nodes(node, name: str):
    return node.xpath(f'.//*[contains(concat(" ",normalize-space(@class)," ")," {name} ")]')


def first_text(node, name: str) -> str:
    matches = class_nodes(node, name)
    if not matches:
        raise ValueError(f"웹 발표 정본에 {name} 요소가 없습니다. 생성기를 확인해 주세요.")
    return text(matches[0])


class Deck:
    def __init__(self, data: dict):
        self.data = data
        self.prs = Presentation()
        self.prs.slide_width = Inches(WIDTH)
        self.prs.slide_height = Inches(HEIGHT)
        self.prs.core_properties.title = f"ToonStudio IR — {data['basis']} 검토본"
        self.prs.core_properties.author = "김희준"
        self.prs.core_properties.subject = "웹 발표 24개 장면과 같은 순서의 최신 근거 반영 검토본"
        self.prs.core_properties.created = datetime.fromisoformat(data["basis"]).replace(tzinfo=timezone.utc)
        self.prs.core_properties.modified = self.prs.core_properties.created
        self.slide = None

    def box(self, x, y, w, h, fill=PANEL):
        shape = self.slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor.from_string(fill)
        shape.line.fill.background()
        shape.adjustments[0] = 0.05
        return shape

    def label(self, value, x, y, w, h, size=18, color=INK, bold=False, url=None):
        shape = self.slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        frame = shape.text_frame
        frame.word_wrap = True
        frame.margin_left = frame.margin_right = 0
        frame.margin_top = frame.margin_bottom = 0
        frame.vertical_anchor = MSO_ANCHOR.TOP
        for index, line in enumerate(value.split("\n")):
            p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
            p.text = line
            p.font.name = FONT
            p.font.size = Pt(size)
            p.font.bold = bold
            p.font.color.rgb = RGBColor.from_string(color)
            p.space_after = Pt(size * 0.22)
            p.line_spacing = 1.18
        if url:
            # 텍스트 런 링크는 일부 변환기에서 강제로 파란색이 되어 대비가 낮아진다.
            # 도형 클릭 링크를 써서 같은 목적지와 읽을 수 있는 본문 색을 유지한다.
            shape.click_action.hyperlink.address = url
        return shape

    def page(self, index, title, subtitle=""):
        self.slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self.slide.background.fill.solid()
        self.slide.background.fill.fore_color.rgb = RGBColor.from_string(BG)
        meta = self.data["scenes"][index - 1]
        kicker = meta["kicker"] or "ToonStudio"
        self.label(f"{index:02d}  /  {kicker}", .55, .35, 12.1, .3, 12, ACCENT, True)
        self.label(title, .55, .92, 12.1, .85, 30, INK, True)
        if subtitle:
            self.label(subtitle, .56, 1.79, 12.05, .48, 14, MUTED)
        self.label(f"ToonStudio  ·  {self.data['basis']} 검토본  ·  기능·계획·검증 범위를 구분합니다", .55, 7.14, 11.35, .22, 9, MUTED)
        self.label(f"{index:02d} / {len(self.data['scenes']):02d}", 12.0, 7.14, .8, .22, 9, MUTED)
        notes = self.slide.notes_slide.notes_text_frame
        notes.text = f"웹 발표 {index}번 장면: {meta['title']}\n기준일: {self.data['basis']}\n\n발표 대본\n{self.data['narration'][index-1]['text']}\n\n정본: apps/web/src/domains/marketing/ir-present-scene-data.ts 및 ir-present-scenes-a/b.tsx\n실제 사용 범위와 운영 상태는 제품에서 확인합니다. 가격·도입 규모·로드맵은 검증 목표입니다.\n웹 발표: {ORIGIN}/ir/present"
        return self.slide

    def cards(self, cards, y=2.5, height=3.9, columns=None, size=19):
        columns = columns or len(cards)
        gap, width = .22, (12.23 - .22 * (columns - 1)) / columns
        rows = (len(cards) + columns - 1) // columns
        row_h = (height - .22 * (rows - 1)) / rows
        for i, (title, body) in enumerate(cards):
            x, top = .55 + (i % columns) * (width + gap), y + (i // columns) * (row_h + .22)
            self.box(x, top, width, row_h)
            title_size = 18 if columns >= 3 and len(title) > 14 else 20
            self.label(title, x + .23, top + .21, width - .46, .65, title_size, ACCENT, True)
            body_offset = .86 if rows > 1 else 1.02
            self.label(body, x + .23, top + body_offset, width - .46, row_h - body_offset - .15, size)

    def rows(self, rows, y=2.45, height=4.1, title_width=2.5, size=18):
        row_h = height / len(rows)
        for index, (title, body) in enumerate(rows):
            top = y + index * row_h
            self.box(.55, top, 12.23, row_h - .1)
            self.label(title, .77, top + .17, title_width - .25, row_h - .25, size, ACCENT, True)
            self.label(body, .77 + title_width, top + .17, 11.7 - title_width, row_h - .25, size)

    def note(self, value, y=6.68):
        self.label(value, .58, y, 12.15, .35, 10, MUTED)

    def screenshot(self, source, x, y, w, h):
        path = PUBLIC / source.lstrip("/")
        if not path.is_file():
            raise FileNotFoundError(f"제품 캡처가 없습니다: {path}. 저장소의 해당 파일을 복원해 주세요.")
        image = fitz.Pixmap(str(path))
        ratio = min(w / image.width, h / image.height)
        iw, ih = image.width * ratio, image.height * ratio
        self.slide.shapes.add_picture(str(path), Inches(x + (w - iw) / 2), Inches(y + (h - ih) / 2), width=Inches(iw), height=Inches(ih))

    def build(self):
        d = self.data
        caps = {item["id"]: item for item in d["capabilities"]}
        dom = [html.fromstring(item["html"]) for item in d["scenes"]]
        self.page(1, "ToonStudio", "웹툰의 기획부터 연재·운영까지 연결하는 브라우저 기반 제작 공간")
        self.label("흩어진 제작 도구와\n협업 과정을\n하나의 작품 흐름으로", .6, 2.7, 6.1, 2.5, 34, INK, True)
        self.cards([(f"{d['basis']} 검토본", "베타 제품 소개\n작가 지망생 이상 전문가·제작팀\n\n김희준 · 예비 창업 도전자")], y=2.5, height=3.7)
        # 표지의 오른쪽 카드만 별도 배치한다.
        for shape in list(self.slide.shapes)[-3:]:
            shape.left += Inches(6.7)
            shape.width = Inches(5.1 if shape.shape_type == 1 else 4.65)
        self.note("이 자료는 최신 문안 반영 검토본입니다. 멘토 전달·기관 제출·운영 검증 완료를 뜻하지 않습니다.")

        self.page(2, "만든 사람 — 김희준", "예비 창업 도전자 · 제품 설계·개발을 담당하는 1인 창업자")
        self.rows([(line.split(" — ")[0], line.split(" — ")[1]) for line in d["founder"]], size=15, height=4.25)
        self.note("경력 출처: 창업자 공개 포트폴리오 heejun.cloud · 경력 수치는 본인 소개 기준", y=6.83)

        self.page(3, "문제는 제작 흐름이 끊기는 데 있습니다", "대본, 작화, 파일 공유와 일정이 서로 다른 작업 공간에 흩어져 있습니다.")
        self.cards([(p["title"], p["body"]) for p in d["problems"]])

        self.page(4, "기획에서 연재 운영까지, 같은 작품 맥락으로", "각 단계의 산출물·담당자·피드백을 이어 가는 제작 흐름")
        self.label("기획  →  대본  →  콘티  →  드로잉  →  검수  →  연재·운영", .65, 2.55, 12.0, .65, 23, ACCENT, True)
        self.cards([("제작", "대본·컷·작화·3D 장면을 작품 문맥 안에서 다룹니다."), ("협업·검수", "담당과 피드백, 수정 요청과 승인 기록을 작업물에 연결합니다."), ("운영", "회차 일정과 제작 상태를 살피고 게시 이후의 연재 흐름을 관리합니다.")], y=3.5, height=2.9, size=18)

        self.page(5, "현재 기능은 수량보다 작업 흐름으로 설명합니다", "기본 도구·실험 기능·소재별 이용 조건을 구분합니다.")
        self.cards([(caps[k]["title"], caps[k]["body"]) for k in ["drawing", "three-d", "ai"]], size=18)
        self.note("자산·브러시의 현재 수량, 전체 기능의 안정성, 제작 효과는 별도 검증 대상입니다.")

        self.page(6, "역할마다 필요한 작업을 가까이에", "대상: 작가 지망생 이상 전문가와 제작팀")
        self.cards([("글작가·기획자", "세계관·회차 대본·장면 목적을 정리하고 다음 제작 단계의 맥락을 만듭니다."), ("그림작가·어시스턴트", "브러시·레이어·컷·3D 구도를 원고 제작 과정에서 활용합니다."), ("프로듀서", "담당자·공정·수정 요청·검수·마감 상태를 작품 단위로 확인합니다.")])

        self.page(7, "국내 웹툰 산업 — 과거 실적을 기준으로 봅니다", "2024년 실적 · 2025 웹툰산업 실태조사 인용 · 제작 도구 시장 매출과는 구분")
        domestic = class_nodes(dom[6], "market-stat")
        self.cards([(first_text(dom[6], "market-big"), first_text(dom[6], "market-caption")), (f"일본 {first_text(domestic[0], 'v')}", "국내 웹툰 수출의 지역별 비중\n2024년 실적 기준"), (f"북미 {first_text(domestic[1], 'v')}", "국내 웹툰 수출의 지역별 비중\n2024년 실적 기준")], height=3.5)
        self.note(first_text(dom[6], "source-line"))

        self.page(8, "글로벌 시장 전망과 해외 확장 조건", "시장조사 기관의 추정치이며 실현된 성과가 아닙니다.")
        global_stats = class_nodes(dom[7], "g-stat")
        self.cards([("2024년 추정", f"글로벌 웹툰 시장 {first_text(global_stats[0], 'v')}"), ("2030년 전망", f"{first_text(global_stats[1], 'v')}\n기관별 시장 정의·추정 방식이 다릅니다."), ("해외 확장 계획", "번역된 언어를 기준으로 확대를 검토합니다. 유료 기능은 결제·세금·지원·법규 검토 이후 엽니다.")], height=3.6)
        self.note("출처: Research and Markets · Grand View Research · Global Industry Analysts의 기존 2030년 전망 인용")

        self.page(9, "제작 도구의 축적 자산과 전환 과제", "대표 도구의 보급 수치와 실제 시장 점유율을 구분합니다.")
        celsys = class_nodes(dom[8], "core-stat")
        self.cards([("기존 작업 자산", "브러시·단축키·파일·작업 습관이 도구에 쌓이므로 전환에는 학습과 호환성 검증이 필요합니다."), ("셀시스의 과거 발표", f"클립스튜디오 누적 이용 {first_text(celsys[0], 'v')}\n2025년 4월 발표 기준\n현재 점유율로 환산하지 않습니다."), ("ToonStudio의 검증 과제", "기존 도구를 사용하던 전문가가 실제 원고를 완성하고 협업할 수 있는지 검증합니다.")], size=18)
        self.note("보급량·구독 매출·언어 수는 서로 다른 지표입니다. 국산·외산 점유율 수치를 확정하지 않습니다.")

        self.page(10, "분야별 도구를 오가는 제작 현장", "제품 지형을 설명하는 사례이며 기능 우열이나 독점률의 정량 평가가 아닙니다.")
        self.rows([(x["category"], x["tools"]) for x in d["landscape"]], size=19)

        self.page(11, "줄이려는 비용 — 파일과 맥락의 반복 전달", "실제 절감 효과는 제작팀 사용 검증에서 확인합니다.")
        self.cards([("파일 이동", "내보내기·변환·업로드를 반복하며 작업이 끊기는 구간"), ("맥락 재설명", "장면 목적과 피드백을 다른 도구에서 다시 설명하는 구간"), ("최종본 확인", "파일명·메신저·드라이브에서 버전과 승인 여부를 다시 찾는 구간")])

        self.page(12, "공정 연결을 제품의 중심에 둡니다", "개별 기능의 제공과 전 공정의 현장 검증 완료를 구분합니다.")
        self.rows([("기획·대본·콘티", "이야기 구조와 컷 구성을 같은 작품 문맥으로 연결"), ("드로잉·3D", "작화 도구와 배경·캐릭터·카메라 구도 탐색"), ("협업·검수", "담당·수정 요청·피드백·승인 기록"), ("연재·운영", "원고 규격 확인·내보내기·회차 일정 관리")], size=19)
        self.note("상세 기능 제공 범위와 실행 조건은 현재 제품에서 확인합니다.")

        self.page(13, "비교의 기준 — 협업이 놓이는 위치", "비교 내용은 제품의 접근 방식을 설명하며 경쟁사의 현행 세부 기능은 별도 확인 대상입니다.")
        self.cards([("결과물 관리 허브", "각 도구에서 만든 파일을 모아 버전·피드백·권한을 관리하는 접근입니다. 웹 발표의 비교 사례는 크레코(CRECO)입니다."), ("ToonStudio의 접근", "제작 도구와 공정 안에 담당·피드백·검수 기록을 연결합니다. 실제 작업 효율과 도입 조건은 전문가·제작팀 베타에서 검증합니다.")], size=21)

        self.page(14, "차별화 가설 — 브라우저에서 제작과 협업을 연결", "제품 방향과 개발 범위를 설명합니다.")
        self.cards([("브라우저 제작 공간", "설치 없이 기획·작화·3D·협업 공간에 접근"), ("작화 도구", "필압·질감·레이어와 WebGPU 렌더링을 활용"), ("구조화된 제작", "프로젝트·회차·공정·담당·승인 기록 연결"), ("같은 작업 맥락", "작업물 가까이에서 피드백과 검토 수행")], columns=2, size=17)

        self.page(15, "규모를 넓히기 전에 실제 사용을 검증합니다", "제공 범위·지원 설계·실사용 검증 목표를 서로 구분합니다.")
        self.cards([("1인 전문 창작자", "제품의 기본 제작 흐름을 검증하는 대상입니다. 기존 작업물과 원본 저장·복구를 확인합니다."), ("소규모 제작팀", "역할·공정·검수·파일 전달 흐름을 실제 공동 작업에서 확인합니다."), ("대규모 스튜디오", "다작품·권한·승인 구조는 지원 설계 범위입니다. 현장 실사용 검증 완료로 표시하지 않습니다.")], size=18)

        self.page(16, "제품 심층 ① — 작화와 장면 구성", "영상 제작 시점의 제품 화면 · 현재 제공 상태는 서비스에서 확인")
        self.screenshot(caps["drawing"]["image"], .6, 2.4, 7.2, 3.9)
        self.label(caps["drawing"]["title"], 8.1, 2.65, 4.55, .55, 23, ACCENT, True)
        self.label(caps["drawing"]["body"], 8.1, 3.5, 4.55, 2.3, 20)
        self.note("실제 제품 캡처: 드로잉 스튜디오 · 촬영 시점 이후 화면은 변경될 수 있습니다.")

        self.page(17, "제품 심층 ② — 3D 구도와 제작 관리", "각 소재의 이용 조건과 참여자의 권한·연결 상태를 확인합니다.")
        self.screenshot(caps["three-d"]["image"], .6, 2.35, 5.9, 3.0)
        self.screenshot(caps["collaboration"]["image"], 6.85, 2.35, 5.9, 3.0)
        self.label("3D 배경·캐릭터·카메라 구도", .7, 5.6, 5.7, .6, 22, ACCENT, True)
        self.label("담당자·수정 요청·검수 기록", 6.95, 5.6, 5.7, .6, 22, ACCENT, True)
        self.note("제품 투어 제작 시점의 캡처입니다. 실제 공동 작업과 저장·복구는 별도로 검증합니다.")

        self.page(18, f"전체 제품 투어 — {d['tour']['durationLabel']} · {len(d['tour']['chapters'])}개 챕터", "챕터 제목을 누르면 해당 장면에서 시작합니다. CH4·CH6은 개념 도해입니다.")
        for i, ch in enumerate(d["tour"]["chapters"]):
            x, y = .55 + (i // 5) * 6.22, 2.4 + (i % 5) * .79
            self.box(x, y, 6.0, .69)
            label = f"{ch['number']:02d}  {ch['time']}  {ch['title']}"
            if ch["visual"] == "concept":
                label += " · 개념"
            self.label(label, x + .18, y + .2, 5.65, .4, 15.5, ACCENT if ch["visual"] == "concept" else INK, url=ORIGIN + ch["href"])
        chapter_times = {c["title"]: c["time"] for c in d["tour"]["chapters"]}
        self.note(f"AI 보조 {chapter_times['AI 보조와 반복 작업']} · 프로젝트·협업·검토 {chapter_times['프로젝트·협업·검토']} · 제품 화면과 개념 도해를 구분합니다.")

        self.page(19, "문서 모델 아래에서 조합하는 기술 구조", "개발 구조의 설명이며 모든 실행 환경에서 같은 결과를 보증하는 표시는 아닙니다.")
        self.cards([("WebGPU · Vello", "픽셀 처리·벡터 렌더링·필압 스트로크"), ("CanvasKit · Skia", "정밀한 패스·텍스트·출판 렌더링"), ("OPFS · IndexedDB", "기기 내 임시 보관과 원본 파일 저장을 구분"), ("Yjs · 제작 결과 검사", "동시 편집과 권리·원고 검토 흐름 개발")], columns=2, size=18)

        self.page(20, "AI는 보조하고, 최종 결정은 창작자가 합니다", "AI 실행 조건과 비용, 결과와 권리를 확인합니다.")
        self.cards([("실행 전", "제공자·모델·실행 환경·비용을 확인합니다. AI는 크레딧 범위에서 사용합니다."), ("실행 후", "표현의 일관성·읽기 편함·이용 권한을 사람이 검토합니다."), ("선택과 보관", "지원되는 BYOK·로컬 실행 방식을 확인하고, 중요한 원본은 파일이나 개인 드라이브에 별도로 저장합니다.")], size=19)
        self.note(caps["local-first"]["body"])

        self.page(21, "비즈니스 모델 — 기본 무료 + AI 크레딧", "개인 Pro 월 19,900원은 예시·미확정 · 팀 가격 미정 · 마켓은 향후 계획")
        self.cards([(x["tier"], x["body"]) for x in d["businessModel"]], columns=2, height=4.3, size=15.5)

        self.page(22, "고객 검증은 전문가·제작팀부터 시작합니다", "도입 실적이 아닌 계획이며, 교육기관은 확대 검토 단계입니다.")
        self.cards([(x["title"], x["body"]) for x in d["gtm"]], height=3.0, size=17)
        for i, goal in enumerate(d["goals"]):
            x = .65 + 4.1 * i
            self.label(f"{goal['value']}  ·  목표", x, 5.9, 3.9, .45, 23, ACCENT, True)
            self.label(goal["label"], x, 6.43, 3.9, .35, 15)

        self.page(23, "지금 필요한 도움 — 초기 검증을 함께할 연결", "1인 창업자 김희준 · 투자 유치·인력 채용의 확정 실적으로 표시하지 않습니다.")
        self.rows([(f"0{i+1}", item) for i, item in enumerate(d["asks"])], title_width=.8, size=22)
        self.note("검증 이후의 팀 확장·투자 시나리오는 가정입니다. 현재 계약·채용·투자 확정으로 해석하지 않습니다.")

        self.page(24, "ToonStudio — 실제 제작 흐름으로 검증하겠습니다", "현재 집중: 제작과 협업 · 장기 확장은 추진 계획")
        self.cards([("제품 투어", f"기획·작화·3D·AI·협업·게시까지\n{d['tour']['durationLabel']}, {len(d['tour']['chapters'])}개 챕터"), ("검증할 질문", "실제 원고를 완성할 수 있는가?\n협업의 누락을 줄이는가?\n도입과 결제 의사가 있는가?"), ("함께 확인하기", "toonstudio.cloud\ngithub.com/blue45f/toonstudio\nheejun.cloud")], size=20)
        self.note(f"공개 제품과 웹 발표: https://toonstudio.cloud/ir/present · 이 파일은 {d['basis']} 문안 기준 검토본입니다.")
        if len(self.prs.slides) != len(d["scenes"]):
            raise ValueError("웹 발표와 정적 덱의 장면 수가 다릅니다.")
        return self.prs


def verify_layout(prs):
    for index, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if shape.left < 0 or shape.top < 0 or shape.left + shape.width > prs.slide_width + 50 or shape.top + shape.height > prs.slide_height + 50:
                raise ValueError(f"{index}번 슬라이드에 경계 밖 도형이 있습니다.")


def normalize_artifacts(pptx: Path, pdf: Path, data: dict):
    """실행 시각 대신 문안 기준일을 써서 같은 입력의 불필요한 이진 diff를 줄인다."""
    fixed = datetime.fromisoformat(data["basis"])
    with ZipFile(pptx) as archive:
        entries = [(item, archive.read(item.filename)) for item in archive.infolist()]
    with ZipFile(pptx, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for item, payload in sorted(entries, key=lambda entry: entry[0].filename):
            info = ZipInfo(item.filename, (fixed.year, fixed.month, fixed.day, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = item.external_attr
            archive.writestr(info, payload)
    normalized_pdf = pdf.with_suffix(".normalized.pdf")
    with fitz.open(pdf) as document:
        date = f"D:{fixed:%Y%m%d}000000Z"
        document.set_metadata({**document.metadata, "creationDate": date, "modDate": date})
        document_id = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:32]
        document.xref_set_key(-1, "ID", f"[<{document_id}><{document_id}>]")
        document.save(normalized_pdf, garbage=4, deflate=True, no_new_id=True)
    normalized_pdf.replace(pdf)


def check_output(output: Path, data: dict):
    manifest_path = output / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text())
    for source in manifest["sources"]:
        if digest(ROOT / source["path"]) != source["sha256"]:
            raise ValueError(f"정본이 바뀌어 재생성이 필요합니다: {source['path']}")
    if manifest["basis"] != data["basis"] or manifest["status"] != data["status"] or manifest["slides"] != len(data["scenes"]):
        raise ValueError("덱 기준일 또는 장면 수가 정본과 다릅니다.")
    for item in manifest["outputs"]:
        if digest(output / item["file"]) != item["sha256"]:
            raise ValueError(f"산출물 해시가 다릅니다: {item['file']}")
    prs = Presentation(output / "toonstudio-ir-deck.pptx")
    verify_layout(prs)
    if len(prs.slides) != 24:
        raise ValueError("정적 발표는 웹 발표와 같은 24개 장면이어야 합니다.")
    with fitz.open(output / "toonstudio-ir-deck.pdf") as pdf:
        if len(pdf) != len(prs.slides):
            raise ValueError("PDF와 PPTX 장면 수가 다릅니다.")
        joined = "\n".join(page.get_text() for page in pdf)
        for token in [data["basis"], "19,900", "미확정", "5:54", "6:48", "검증", "개념"]:
            if token not in joined:
                raise ValueError(f"필수 설명이 PDF에서 추출되지 않습니다: {token}")
        for token in ["226종", "14,665", "14,928", "42개", "10월 22일 대면", "11/22 사전 제출"]:
            if token in joined:
                raise ValueError(f"지난 일정·수량 문구가 남았습니다: {token}")
        normalized = lambda value: re.sub(r"\s+", "", value)
        for index, slide in enumerate(prs.slides):
            actual = normalized(pdf[index].get_text())
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        if normalized(paragraph.text) not in actual:
                            raise ValueError(f"{index+1}번 장면의 텍스트가 PDF에서 누락됐습니다: {paragraph.text[:45]}")
            if data["narration"][index]["text"] not in slide.notes_slide.notes_text_frame.text:
                raise ValueError(f"{index+1}번 장면의 발표 대본이 최신 대본과 다릅니다.")
        expected_links = {ORIGIN + c["href"] for c in data["tour"]["chapters"]}
        actual_links = {link.get("uri") for link in pdf[17].get_links()}
        if expected_links != actual_links:
            raise ValueError("투어 PDF의 챕터 링크가 정본과 다릅니다.")
    print(f"정적 IR 검증 통과: {len(prs.slides)}장 · 정본/산출물 해시 · 링크 · 최신 문안")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="파일을 바꾸지 않고 최신 정본과 산출물을 확인")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    with tempfile.TemporaryDirectory(prefix="toonstudio-ir-") as directory:
        temp = Path(directory)
        data = source_data(temp)
        if args.check:
            check_output(output, data)
            return
        prs = Deck(data).build()
        verify_layout(prs)
        pptx = temp / "toonstudio-ir-deck.pptx"
        prs.save(pptx)
        converter = shutil.which("libreoffice") or shutil.which("soffice")
        if not converter:
            raise RuntimeError("LibreOffice가 없습니다. 설치 후 같은 명령을 다시 실행해 주세요.")
        subprocess.run([converter, "--headless", f"-env:UserInstallation={temp.as_uri()}/lo-profile", "--convert-to", "pdf", "--outdir", str(temp), str(pptx)], check=True, timeout=120)
        pdf = temp / "toonstudio-ir-deck.pdf"
        if not pdf.exists():
            raise RuntimeError("PDF 변환 결과가 없습니다. LibreOffice 출력과 글꼴 설치를 확인해 주세요.")
        normalize_artifacts(pptx, pdf, data)
        output.mkdir(parents=True, exist_ok=True)
        files = [pptx, pdf]
        sources = data["sources"] + [
            {"path": path, "sha256": digest(ROOT / path)}
            for path in ["scripts/export-ir-deck-data.mts", "scripts/generate-ir-deck.py"]
        ]
        manifest = {
            "schemaVersion": 1, "basis": data["basis"], "status": data["status"], "slides": len(prs.slides),
            "sources": sources,
            "outputs": [{"file": p.name, "sha256": digest(p), "bytes": p.stat().st_size} for p in files],
            "tour": {"durationSeconds": data["tour"]["duration"], "chapterCount": len(data["tour"]["chapters"]), "conceptChapters": [c["number"] for c in data["tour"]["chapters"] if c["visual"] == "concept"]},
            "notes": ["편집 가능한 텍스트·도형 PPTX", "웹 발표와 동일한 24개 주제·순서", "기존 촬영 시점의 제품 캡처 사용", "운영 배포·고객 실증·멘토 전달 완료를 의미하지 않음"],
        }
        # 생성·변환·검증이 모두 성공한 뒤에만 기존 배포 자산을 교체한다.
        (temp / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        check_output(temp, data)
        for path in files:
            shutil.copyfile(path, output / path.name)
        shutil.copyfile(temp / MANIFEST_NAME, output / MANIFEST_NAME)
        check_output(output, data)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        raise SystemExit(f"IR 생성/검증 실패: {exc}\n의존성과 정본을 확인한 뒤 python scripts/generate-ir-deck.py 를 다시 실행해 주세요.") from exc
