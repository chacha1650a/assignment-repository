"""
논문(김대훈).md 를 논문(김대훈).pdf 로 변환하는 스크립트.
Malgun Gothic 폰트로 한글을 지원하며, 가독성(줄간격·여백·정렬·표 스타일)을 우선한다.
"""

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
)

BASE_DIR = Path(__file__).resolve().parent.parent
MD_PATH = BASE_DIR / "논문(김대훈).md"
PDF_PATH = BASE_DIR / "논문(김대훈).pdf"

FONT_DIR = Path(r"C:\Windows\Fonts")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_DIR / "malgun.ttf")))
pdfmetrics.registerFont(TTFont("Malgun-Bold", str(FONT_DIR / "malgunbd.ttf")))

ACCENT = colors.HexColor("#2c5f8a")
TEXT_DARK = colors.HexColor("#1f1f1f")
TEXT_MUTED = colors.HexColor("#5a5a5a")

PAGE_W, PAGE_H = A4
MARGIN_L = 26 * mm
MARGIN_R = 26 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

STYLES = {
    "title": ParagraphStyle(
        "title", fontName="Malgun-Bold", fontSize=21, leading=30,
        spaceBefore=60, spaceAfter=14, alignment=TA_LEFT, textColor=TEXT_DARK,
    ),
    "meta": ParagraphStyle(
        "meta", fontName="Malgun", fontSize=11, leading=17,
        textColor=TEXT_MUTED, spaceAfter=3,
    ),
    "abstract_label": ParagraphStyle(
        "abstract_label", fontName="Malgun-Bold", fontSize=12.5, leading=18,
        spaceBefore=26, spaceAfter=8, textColor=ACCENT, keepWithNext=1,
    ),
    "h1": ParagraphStyle(
        "h1", fontName="Malgun-Bold", fontSize=15.5, leading=22,
        spaceBefore=22, spaceAfter=10, textColor=TEXT_DARK, keepWithNext=1,
    ),
    "h2": ParagraphStyle(
        "h2", fontName="Malgun-Bold", fontSize=12.5, leading=19,
        spaceBefore=16, spaceAfter=7, textColor=ACCENT, keepWithNext=1,
    ),
    "body": ParagraphStyle(
        "body", fontName="Malgun", fontSize=11, leading=19,
        spaceAfter=11, alignment=TA_LEFT, textColor=TEXT_DARK,
    ),
    "abstract_body": ParagraphStyle(
        "abstract_body", fontName="Malgun", fontSize=10.7, leading=18.5,
        spaceAfter=8, alignment=TA_LEFT, textColor=colors.HexColor("#333333"),
        leftIndent=2,
    ),
    "quote": ParagraphStyle(
        "quote", fontName="Malgun", fontSize=11.3, leading=18,
        textColor=TEXT_DARK, leftIndent=4, rightIndent=4,
    ),
    "li": ParagraphStyle(
        "li", fontName="Malgun", fontSize=11, leading=18, spaceAfter=7,
        textColor=TEXT_DARK,
    ),
    "cell": ParagraphStyle(
        "cell", fontName="Malgun", fontSize=9.8, leading=14.5, textColor=TEXT_DARK,
    ),
    "cellhead": ParagraphStyle(
        "cellhead", fontName="Malgun-Bold", fontSize=9.8, leading=14.5,
        textColor=colors.white,
    ),
}


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(
        r"`([^`]+)`",
        r'<font face="Malgun" color="#a0304a" backColor="#f3eef0">\1</font>',
        text,
    )
    return text


def parse_table(lines, start):
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        if not re.match(r"^\|[\s:-]+\|", lines[i].strip()):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows.append(cells)
        i += 1
    return rows, i


def make_table(rows):
    header = [Paragraph(inline(c), STYLES["cellhead"]) for c in rows[0]]
    body_rows = [[Paragraph(inline(c), STYLES["cell"]) for c in r] for r in rows[1:]]
    data = [header] + body_rows
    ncols = len(rows[0])

    if ncols == 2:
        col_widths = [CONTENT_W * 0.26, CONTENT_W * 0.74]
    elif ncols == 4:
        col_widths = [CONTENT_W * 0.30, CONTENT_W * 0.16, CONTENT_W * 0.30, CONTENT_W * 0.24]
    else:
        col_widths = [CONTENT_W / ncols] * ncols

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("LINEBELOW", (0, 0), (-1, 0), 1, ACCENT),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#d5d5d5")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f8fa")]),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def make_quote(text: str):
    cell = Paragraph(inline(text), STYLES["quote"])
    t = Table([[cell]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, 0), 2.6, ACCENT),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#eef3f7")),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


_in_abstract = False


def build_story(md_text: str):
    """## 초록 다음, 다음 '---' 전까지의 일반 단락은 abstract_body 스타일 사용."""
    global _in_abstract
    lines = md_text.split("\n")
    story = []
    i = 0
    first_h1_done = False
    just_saw_title_block = False

    while i < len(lines):
        stripped = lines[i].strip()

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            i += 1
            if just_saw_title_block:
                story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#cccccc")))
                story.append(Spacer(1, 4))
                just_saw_title_block = False
            _in_abstract = False
            continue

        if stripped.startswith("# "):
            text = inline(stripped[2:])
            if not first_h1_done:
                story.append(Paragraph(text, STYLES["title"]))
                first_h1_done = True
                just_saw_title_block = True
            else:
                story.append(PageBreak())
                story.append(Paragraph(text, STYLES["h1"]))
            i += 1
            continue

        if stripped.startswith("## "):
            heading_text = stripped[3:]
            if "초록" in heading_text:
                story.append(Paragraph(inline(heading_text), STYLES["abstract_label"]))
                _in_abstract = True
            else:
                story.append(Paragraph(inline(heading_text), STYLES["h1"]))
                _in_abstract = False
            i += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), STYLES["h2"]))
            i += 1
            continue

        if stripped.startswith("**작성자**") or stripped.startswith("**작성일**"):
            story.append(Paragraph(inline(stripped), STYLES["meta"]))
            i += 1
            continue

        if stripped.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip().lstrip(">").strip())
                i += 1
            story.append(Spacer(1, 4))
            story.append(make_quote(" ".join(quote_lines)))
            story.append(Spacer(1, 10))
            continue

        if stripped.startswith("|"):
            rows, i = parse_table(lines, i)
            if rows:
                story.append(Spacer(1, 6))
                story.append(make_table(rows))
                story.append(Spacer(1, 14))
            continue

        if re.match(r"^(\-|\*)\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^(\-|\*)\s+", lines[i].strip()):
                item_text = re.sub(r"^(\-|\*)\s+", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline(item_text), STYLES["li"]), leftIndent=8, spaceAfter=4))
                i += 1
            story.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=16, bulletFontSize=11))
            story.append(Spacer(1, 8))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                item_text = re.sub(r"^\d+\.\s+", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline(item_text), STYLES["li"]), leftIndent=8, spaceAfter=4))
                i += 1
            story.append(ListFlowable(items, bulletType="1", leftIndent=16, bulletFontSize=11))
            story.append(Spacer(1, 8))
            continue

        para_lines = [stripped]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|>|\||\-|\*|\d+\.|---)", lines[i].strip()):
            para_lines.append(lines[i].strip())
            i += 1

        style = STYLES["abstract_body"] if _in_abstract else STYLES["body"]
        story.append(Paragraph(inline(" ".join(para_lines)), style))

    return story


def draw_page_furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont("Malgun", 8.5)
    canvas.setFillColor(colors.HexColor("#8a8a8a"))
    canvas.drawCentredString(PAGE_W / 2, 12 * mm, f"{doc.page}")
    if doc.page > 1:
        canvas.setFont("Malgun", 8)
        canvas.drawString(MARGIN_L, PAGE_H - 14 * mm, "지시문의 모호성은 요약 과제의 할루시네이션을 늘리는가")
        canvas.setStrokeColor(colors.HexColor("#dddddd"))
        canvas.line(MARGIN_L, PAGE_H - 16 * mm, PAGE_W - MARGIN_R, PAGE_H - 16 * mm)
    canvas.restoreState()


def main():
    md_text = MD_PATH.read_text(encoding="utf-8")
    story = build_story(md_text)

    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        topMargin=24 * mm,
        bottomMargin=22 * mm,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        title="지시문의 모호성은 요약 과제의 할루시네이션을 늘리는가",
        author="김대훈",
    )
    doc.build(story, onFirstPage=draw_page_furniture, onLaterPages=draw_page_furniture)
    print(f"완료: {PDF_PATH}")


if __name__ == "__main__":
    main()
