"""Monthly family finance report — a comprehensive PDF for the Daixu household.

Compares the selected month against the previous month across four entities:
Babu (personal), Mamu (personal), the Daixu shared pool, and the Family total.
Renders charts + tables and rule-based financial advice, styled in the
Soviet-constructivist palette used by the web app.

Pure server-side (reportlab); no external services or LLM required.
"""
from __future__ import annotations
from io import BytesIO
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import User, Account, Category
from api.transactions import _compute_month_summary

# Soviet-constructivist palette (mirrors the frontend theme).
RED = "#a01410"
GOLD = "#c8901a"
INK = "#1a1512"
PAPER = "#f4efe6"
GREEN = "#2f6b2f"
GREY = "#6b625a"

_MONTHS = ["", "January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"]

# Discretionary categories used for advice heuristics.
_DISCRETIONARY = {"Food", "Entertainment", "Shopping", "Tourism", "Subscriptions"}

_SYMBOLS = {"GBP": "£", "USD": "$"}


def _prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def money(amount: float, currency: str) -> str:
    sym = _SYMBOLS.get(currency, "")
    return f"{sym}{amount:,.2f}"


def month_label(year: int, month: int) -> str:
    return f"{_MONTHS[month]} {year}"


def pct_change(cur: float, prev: float) -> float | None:
    """Percentage change prev->cur, or None when prev is ~0 (undefined)."""
    if abs(prev) < 0.005:
        return None
    return (cur - prev) / abs(prev) * 100.0


def _net(s: dict) -> float:
    return s["total_income"] - s["spending"]


def _savings_rate(s: dict) -> float | None:
    """Net as a share of income, or None when there's no income to save from."""
    inc = s["total_income"]
    if inc < 0.005:
        return None
    return _net(s) / inc * 100.0


async def gather_report_data(
    db: AsyncSession, year: int, month: int, currency: str
) -> dict:
    """Build every summary the report needs, for this month and the previous one.

    Entities:
      - one per real user (Babu, Mamu, ...) over their PERSONAL accounts
      - "Daixu (Shared)" over the shared pool
      - "Family Total" over every account (personal + shared), counted once
    """
    py, pm = _prev_month(year, month)

    users = (await db.execute(select(User).order_by(User.id))).scalars().all()
    all_accounts = (await db.execute(select(Account))).scalars().all()

    shared_ids = [a.id for a in all_accounts if a.is_shared]
    all_ids = [a.id for a in all_accounts]

    async def summ(ids: list[int], yr: int, mo: int) -> dict:
        return await _compute_month_summary(db, ids, yr, mo, currency)

    # Each person owns only their SHARE of the shared (Daixu) pool: 1/N of it,
    # where N is the number of people. Folding that share into each personal
    # summary makes the report reconcile with the web app — the people's nets
    # sum to the family net (which counts the whole pool once). The standalone
    # "Daixu (Shared)" section below still shows the pool in full.
    share_factor = 1.0 / max(1, len(users))
    shared_cur = await summ(shared_ids, year, month)
    shared_prev = await summ(shared_ids, py, pm)

    people = []
    for u in users:
        personal_ids = [a.id for a in all_accounts if a.user_id == u.id and not a.is_shared]
        people.append({
            "name": u.name,
            "cur": _blend(await summ(personal_ids, year, month), shared_cur, share_factor),
            "prev": _blend(await summ(personal_ids, py, pm), shared_prev, share_factor),
            "share_factor": share_factor,
        })

    shared = {
        "name": "Daixu (Shared)",
        "cur": shared_cur,
        "prev": shared_prev,
    }
    family = {
        "name": "Daixu Family",
        "cur": await summ(all_ids, year, month),
        "prev": await summ(all_ids, py, pm),
    }

    return {
        "currency": currency,
        "year": year, "month": month,
        "prev_year": py, "prev_month": pm,
        "generated_at": datetime.utcnow(),
        "people": people,
        "shared": shared,
        "family": family,
    }


def _cat_map(s: dict) -> dict[str, float]:
    return {c["category"]: c["total"] for c in s["by_category"]}


def _blend(personal: dict, shared: dict, factor: float) -> dict:
    """Personal summary plus `factor` of the shared pool (income, spending, and
    each spending category). Used so a person carries their 1/N slice of the
    shared household, keeping the report consistent with the web app's tabs."""
    cats: dict[str, dict] = {}
    for c in personal["by_category"]:
        cats[c["category"]] = {"category": c["category"], "total": c["total"], "count": c["count"]}
    for c in shared["by_category"]:
        row = cats.setdefault(c["category"], {"category": c["category"], "total": 0.0, "count": 0})
        row["total"] += c["total"] * factor
        # counts aren't scaled (a fractional count is meaningless) — informational only.
        row["count"] += c["count"]
    salary = personal["salary"] + shared["salary"] * factor
    additional = personal["additional_income"] + shared["additional_income"] * factor
    return {
        "salary": salary,
        "additional_income": additional,
        "total_income": salary + additional,
        "spending": personal["spending"] + shared["spending"] * factor,
        "by_category": list(cats.values()),
        "currency": personal.get("currency", shared.get("currency")),
    }


def build_advice(entity: dict, currency: str) -> list[str]:
    """Rule-based recommendations derived from the entity's own numbers.

    Looks at net position, savings rate, month-over-month spend growth, the
    biggest category shifts, and discretionary share. Returns human-readable
    lines; deterministic, no external calls.
    """
    cur, prev = entity["cur"], entity["prev"]
    tips: list[str] = []

    net = _net(cur)
    spend = cur["spending"]
    income = cur["total_income"]

    # 1. Net position.
    if income < 0.005 and spend > 0.005:
        tips.append(
            f"No income was recorded here this month against {money(spend, currency)} "
            f"of spending — if income lands elsewhere, that's fine; otherwise this "
            f"pool is running purely on reserves."
        )
    elif net < 0:
        tips.append(
            f"Spending exceeded income by {money(-net, currency)}. Trim the largest "
            f"discretionary categories or move some costs to next month to get back "
            f"into surplus."
        )
    else:
        tips.append(
            f"Ended the month {money(net, currency)} in surplus. Consider routing it "
            f"into savings or investments rather than letting it sit idle."
        )

    # 2. Savings rate.
    sr = _savings_rate(cur)
    if sr is not None:
        if sr < 0:
            tips.append("Savings rate is negative — the priority is stopping the drawdown.")
        elif sr < 10:
            tips.append(
                f"Savings rate is only {sr:.0f}%. Aiming for 20%+ of income would "
                f"build a healthier buffer."
            )
        elif sr < 20:
            tips.append(f"Savings rate is {sr:.0f}% — solid; nudging toward 20%+ is a good stretch goal.")
        else:
            tips.append(f"Strong {sr:.0f}% savings rate — keep it up.")

    # 3. Spend growth vs last month.
    ch = pct_change(spend, prev["spending"])
    if ch is not None and ch >= 15 and spend > prev["spending"]:
        tips.append(
            f"Total spending rose {ch:.0f}% versus {money(prev['spending'], currency)} "
            f"last month — worth checking whether that's one-off or a new baseline."
        )
    elif ch is not None and ch <= -15:
        tips.append(f"Spending fell {abs(ch):.0f}% from last month — good discipline.")

    # 4. Biggest category increase.
    cur_cats, prev_cats = _cat_map(cur), _cat_map(prev)
    deltas = sorted(
        ((c, cur_cats.get(c, 0) - prev_cats.get(c, 0)) for c in cur_cats),
        key=lambda kv: kv[1], reverse=True,
    )
    if deltas and deltas[0][1] > max(20.0, 0.1 * spend):
        cat, d = deltas[0]
        tips.append(
            f"{cat} grew the most this month (+{money(d, currency)}). If it isn't "
            f"essential, that's the first place to look for savings."
        )

    # 5. Discretionary share.
    disc = sum(v for k, v in cur_cats.items() if k in _DISCRETIONARY)
    if spend > 0.005 and disc / spend > 0.4:
        tips.append(
            f"Discretionary categories (food out, entertainment, tourism, "
            f"subscriptions) are {disc / spend * 100:.0f}% of spending — a natural "
            f"target for a monthly cap."
        )

    # 6. Subscriptions creep.
    subs = cur_cats.get("Subscriptions", 0)
    if subs > 0 and spend > 0.005 and subs / spend > 0.1:
        tips.append(
            f"Subscriptions are {money(subs, currency)} — review for services no "
            f"longer used; they add up quietly."
        )

    if not tips:
        tips.append("Nothing notable this month — the numbers look steady.")
    return tips


# ---------------------------------------------------------------------------
# Charts (reportlab.graphics — vector, no matplotlib needed)
# ---------------------------------------------------------------------------
from reportlab.lib.colors import HexColor
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend

_PIE_COLORS = [
    "#a01410", "#c8901a", "#7d0f0c", "#e0a92a", "#5c0b09",
    "#8a6d3b", "#c1201a", "#a67214", "#3d0706", "#d23f3f",
    "#6b4f1d", "#835811", "#b0522b", "#1a1512",
]


def spending_pie(by_category: list[dict], currency: str) -> Drawing | None:
    """Pie of spending by category (largest first, small tail merged to Other)."""
    rows = sorted((r for r in by_category if r["total"] > 0.01),
                  key=lambda r: r["total"], reverse=True)
    if not rows:
        return None
    top, tail = rows[:9], rows[9:]
    data = [(r["category"], r["total"]) for r in top]
    if tail:
        data.append(("Other", sum(r["total"] for r in tail)))
    total = sum(v for _, v in data) or 1.0

    d = Drawing(460, 220)
    pie = Pie()
    pie.x, pie.y = 10, 15
    pie.width = pie.height = 190
    pie.data = [v for _, v in data]
    pie.labels = [f"{100 * v / total:.0f}%" for _, v in data]
    pie.slices.strokeColor = HexColor(PAPER)
    pie.slices.strokeWidth = 1.5
    for i in range(len(data)):
        pie.slices[i].fillColor = HexColor(_PIE_COLORS[i % len(_PIE_COLORS)])
    d.add(pie)

    legend = Legend()
    legend.x, legend.y = 235, 195
    legend.dx = legend.dy = 8
    legend.fontName = "Helvetica"
    legend.fontSize = 8
    legend.deltay = 13
    legend.columnMaximum = 10
    legend.colorNamePairs = [
        (HexColor(_PIE_COLORS[i % len(_PIE_COLORS)]),
         f"{name}  {money(val, currency)}")
        for i, (name, val) in enumerate(data)
    ]
    d.add(legend)
    return d


def compare_bar(cur: dict, prev: dict, cur_label: str, prev_label: str) -> Drawing | None:
    """Grouped bars: this month vs last for the top spending categories."""
    cur_cats = _cat_map(cur)
    prev_cats = _cat_map(prev)
    names = sorted(set(cur_cats) | set(prev_cats),
                   key=lambda n: cur_cats.get(n, 0) + prev_cats.get(n, 0),
                   reverse=True)[:7]
    if not names:
        return None

    d = Drawing(460, 240)
    chart = VerticalBarChart()
    chart.x, chart.y = 30, 60
    chart.width, chart.height = 400, 155
    chart.data = [
        [round(prev_cats.get(n, 0), 2) for n in names],
        [round(cur_cats.get(n, 0), 2) for n in names],
    ]
    chart.bars[0].fillColor = HexColor(GOLD)
    chart.bars[1].fillColor = HexColor(RED)
    chart.categoryAxis.categoryNames = names
    chart.categoryAxis.labels.angle = 25
    chart.categoryAxis.labels.dy = -14
    chart.categoryAxis.labels.fontSize = 7
    chart.valueAxis.valueMin = 0
    chart.groupSpacing = 12
    chart.barSpacing = 1
    d.add(chart)

    legend = Legend()
    legend.x, legend.y = 60, 232
    legend.dx = legend.dy = 8
    legend.fontName = "Helvetica"
    legend.fontSize = 8
    legend.deltay = 0
    legend.deltax = 150
    legend.columnMaximum = 1   # single row: place items side by side via deltax
    legend.alignment = "right"
    legend.colorNamePairs = [
        (HexColor(GOLD), prev_label),
        (HexColor(RED), cur_label),
    ]
    d.add(legend)
    return d


# ---------------------------------------------------------------------------
# PDF assembly (platypus)
# ---------------------------------------------------------------------------
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    ListFlowable, ListItem, PageBreak, KeepTogether,
)


def _styles() -> dict:
    ss = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("t", parent=ss["Title"], fontName="Helvetica-Bold",
                                 fontSize=26, textColor=HexColor(RED), spaceAfter=4,
                                 alignment=TA_CENTER),
        "subtitle": ParagraphStyle("st", parent=ss["Normal"], fontSize=12,
                                    textColor=HexColor(INK), alignment=TA_CENTER,
                                    spaceAfter=2),
        "meta": ParagraphStyle("m", parent=ss["Normal"], fontSize=8,
                               textColor=HexColor(GREY), alignment=TA_CENTER),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                             fontSize=15, textColor=HexColor(RED), spaceBefore=14,
                             spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                             fontSize=11.5, textColor=HexColor(INK), spaceBefore=8,
                             spaceAfter=4),
        "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5,
                               textColor=HexColor(INK), leading=13),
        "advice": ParagraphStyle("a", parent=ss["Normal"], fontSize=9.5,
                                  textColor=HexColor(INK), leading=13, spaceAfter=3),
        "caption": ParagraphStyle("c", parent=ss["Normal"], fontSize=8,
                                   textColor=HexColor(GREY), alignment=TA_CENTER),
    }
    return styles


def _delta_str(cur: float, prev: float, currency: str) -> str:
    ch = pct_change(cur, prev)
    diff = cur - prev
    arrow = "▲" if diff > 0.005 else ("▼" if diff < -0.005 else "—")
    pct = "n/a" if ch is None else f"{ch:+.0f}%"
    return f"{arrow} {money(diff, currency)} ({pct})"


def _overview_table(data: dict) -> Table:
    """This-month vs last-month for each entity: income, spending, net."""
    cur_lbl = month_label(data["year"], data["month"])
    prev_lbl = month_label(data["prev_year"], data["prev_month"])
    ccy = data["currency"]

    header = ["Entity", f"Income\n{cur_lbl}", f"Spending\n{cur_lbl}",
              f"Net\n{cur_lbl}", f"Net\n{prev_lbl}", "Net change"]
    rows = [header]

    # People each already include their share of the pool, so people + family
    # reconcile. The shared pool is shown as a memo row (its total is split
    # across the people above, not added again) and the family total is the sum
    # of the people.
    n_people = len(data["people"])
    share_lbl = "½" if n_people == 2 else f"1/{n_people}"
    labelled = [
        {**p, "name": f"{p['name']} (+{share_lbl} shared)"} for p in data["people"]
    ] + [
        {**data["shared"], "name": "Daixu Pool (memo)"},
        data["family"],
    ]
    for e in labelled:
        cur, prev = e["cur"], e["prev"]
        rows.append([
            e["name"],
            money(cur["total_income"], ccy),
            money(cur["spending"], ccy),
            money(_net(cur), ccy),
            money(_net(prev), ccy),
            _delta_str(_net(cur), _net(prev), ccy),
        ])

    t = Table(rows, repeatRows=1, colWidths=[70, 78, 78, 72, 72, 92])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(RED)),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor(PAPER)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor(GREY)),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    # Memo row (shared pool) sits just above the total — greyed + italic so it
    # reads as informational, not another addend.
    memo = len(rows) - 2
    style.append(("TEXTCOLOR", (0, memo), (-1, memo), HexColor(GREY)))
    style.append(("FONTNAME", (0, memo), (-1, memo), "Helvetica-Oblique"))
    # Shade the Family total row (last).
    style.append(("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), HexColor("#f0e4c8")))
    style.append(("FONTNAME", (0, len(rows) - 1), (-1, len(rows) - 1), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def _category_table(entity: dict, currency: str) -> Table:
    """Category-by-category spending, this month vs last, with change."""
    cur_cats = _cat_map(entity["cur"])
    prev_cats = _cat_map(entity["prev"])
    names = sorted(set(cur_cats) | set(prev_cats),
                   key=lambda n: cur_cats.get(n, 0), reverse=True)

    rows = [["Category", "This month", "Last month", "Change"]]
    for n in names:
        c, p = cur_cats.get(n, 0), prev_cats.get(n, 0)
        rows.append([n, money(c, currency), money(p, currency), _delta_str(c, p, currency)])
    rows.append([
        "TOTAL",
        money(entity["cur"]["spending"], currency),
        money(entity["prev"]["spending"], currency),
        _delta_str(entity["cur"]["spending"], entity["prev"]["spending"], currency),
    ])

    t = Table(rows, repeatRows=1, colWidths=[120, 90, 90, 110])
    n_rows = len(rows)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(INK)),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor(PAPER)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor(GREY)),
        ("ROWBACKGROUNDS", (0, 1), (-1, n_rows - 2), [HexColor("#ffffff"), HexColor(PAPER)]),
        ("BACKGROUND", (0, n_rows - 1), (-1, n_rows - 1), HexColor("#f0e4c8")),
        ("FONTNAME", (0, n_rows - 1), (-1, n_rows - 1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _stat_cards(entity: dict, currency: str, styles: dict) -> Table:
    """Four headline stats as a row of cards."""
    cur = entity["cur"]
    sr = _savings_rate(cur)
    sr_txt = "n/a" if sr is None else f"{sr:.0f}%"
    cells = [
        ("Total Income", money(cur["total_income"], currency), GREEN),
        ("Total Spending", money(cur["spending"], currency), RED),
        ("Net", money(_net(cur), currency), INK if _net(cur) >= 0 else RED),
        ("Savings Rate", sr_txt, GOLD),
    ]
    label_st = ParagraphStyle("cl", fontSize=7.5, textColor=HexColor(GREY),
                              alignment=TA_CENTER)
    data_row = []
    for label, value, color in cells:
        val_st = ParagraphStyle("cv", fontSize=13, fontName="Helvetica-Bold",
                                textColor=HexColor(color), alignment=TA_CENTER)
        data_row.append([Paragraph(label.upper(), label_st),
                         Spacer(1, 3), Paragraph(value, val_st)])
    t = Table([data_row], colWidths=[125] * 4)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor(GREY)),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, HexColor(GREY)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEABOVE", (0, 0), (-1, 0), 3, HexColor(RED)),
    ]))
    return t


def _advice_block(entity: dict, currency: str, styles: dict) -> ListFlowable:
    items = [ListItem(Paragraph(tip, styles["advice"]), leftIndent=6)
             for tip in build_advice(entity, currency)]
    return ListFlowable(items, bulletType="bullet", bulletColor=HexColor(RED),
                        bulletFontSize=8, start="•")


def render_report_pdf(data: dict) -> bytes:
    """Assemble the full multi-page PDF and return its bytes."""
    styles = _styles()
    ccy = data["currency"]
    cur_lbl = month_label(data["year"], data["month"])
    prev_lbl = month_label(data["prev_year"], data["prev_month"])

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18 * mm, bottomMargin=16 * mm,
        leftMargin=16 * mm, rightMargin=16 * mm,
        title=f"Daixu Family Finance Report — {cur_lbl}",
        author="Ministry of Finance",
    )
    story: list = []

    # --- Cover / header ---
    story.append(Spacer(1, 6))
    story.append(Paragraph("MINISTRY OF FINANCE", styles["subtitle"]))
    story.append(Paragraph("Daixu Family Finance Report", styles["title"]))
    story.append(Paragraph(f"{cur_lbl} &nbsp;·&nbsp; compared with {prev_lbl}", styles["subtitle"]))
    story.append(Paragraph(
        f"Generated {data['generated_at'].strftime('%Y-%m-%d %H:%M UTC')} &nbsp;·&nbsp; "
        f"amounts in {ccy}", styles["meta"]))
    story.append(Spacer(1, 14))

    # --- Executive summary (family) ---
    fam = data["family"]
    story.append(Paragraph("Executive Summary", styles["h2"]))
    story.append(_exec_summary_para(data, styles))
    story.append(Spacer(1, 8))
    story.append(_stat_cards(fam, ccy, styles))
    story.append(Spacer(1, 14))

    # --- Household overview table ---
    story.append(Paragraph("Household Overview", styles["h2"]))
    story.append(_overview_table(data))
    story.append(Spacer(1, 14))

    # --- Family spending charts ---
    pie = spending_pie(fam["cur"]["by_category"], ccy)
    if pie:
        story.append(KeepTogether([
            Paragraph(f"Family Spending by Category — {cur_lbl}", styles["h3"]), pie]))
    bar = compare_bar(fam["cur"], fam["prev"], cur_lbl, prev_lbl)
    if bar:
        story.append(KeepTogether([
            Paragraph("Top Categories — This Month vs Last", styles["h3"]), bar,
            Paragraph("Family spending, all accounts (personal + shared).", styles["caption"])]))

    # --- Family category table + advice ---
    story.append(Spacer(1, 10))
    story.append(Paragraph("Family Category Detail", styles["h3"]))
    story.append(_category_table(fam, ccy))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Advice for the Daixu Family", styles["h3"]))
    story.append(_advice_block(fam, ccy, styles))

    # --- Shared pool section ---
    story.append(PageBreak())
    _entity_section(story, data["shared"], data, styles,
                    "Shared Household (Daixu Pool)")

    # --- Per-person sections (personal + this person's share of the pool) ---
    n_people = len(data["people"])
    share_note = (
        "Includes this person's half of the shared Daixu pool."
        if n_people == 2 else
        f"Includes this person's 1/{n_people} share of the shared Daixu pool."
    )
    for person in data["people"]:
        story.append(PageBreak())
        _entity_section(story, person, data, styles,
                        f"{person['name']} — Personal + Shared Split", intro=share_note)

    doc.build(story)
    return buf.getvalue()


def _exec_summary_para(data: dict, styles: dict) -> Paragraph:
    fam = data["family"]
    ccy = data["currency"]
    cur, prev = fam["cur"], fam["prev"]
    net = _net(cur)
    ch = pct_change(cur["spending"], prev["spending"])
    spend_phrase = (
        "flat versus last month" if ch is None or abs(ch) < 1
        else f"{'up' if ch > 0 else 'down'} {abs(ch):.0f}% versus last month"
    )
    net_phrase = (f"a surplus of {money(net, ccy)}" if net >= 0
                  else f"a deficit of {money(-net, ccy)}")
    sr = _savings_rate(cur)
    sr_phrase = "" if sr is None else f" The household savings rate was {sr:.0f}%."
    txt = (
        f"In {month_label(data['year'], data['month'])} the Daixu family took in "
        f"{money(cur['total_income'], ccy)} and spent {money(cur['spending'], ccy)} "
        f"({spend_phrase}), leaving {net_phrase}.{sr_phrase} "
        f"The sections below break the picture down for the shared household pool "
        f"and for each family member individually."
    )
    return Paragraph(txt, styles["body"])


def _entity_section(story: list, entity: dict, data: dict, styles: dict, title: str,
                    intro: str | None = None):
    """One full section: heading, stat cards, charts, category table, advice."""
    ccy = data["currency"]
    cur_lbl = month_label(data["year"], data["month"])
    prev_lbl = month_label(data["prev_year"], data["prev_month"])

    story.append(Paragraph(title, styles["h2"]))
    if intro:
        story.append(Paragraph(intro, styles["caption"]))
        story.append(Spacer(1, 4))
    story.append(_stat_cards(entity, ccy, styles))
    story.append(Spacer(1, 10))

    pie = spending_pie(entity["cur"]["by_category"], ccy)
    if pie:
        story.append(KeepTogether([
            Paragraph(f"Spending by Category — {cur_lbl}", styles["h3"]), pie]))
    else:
        story.append(Paragraph("No spending recorded this month.", styles["body"]))

    bar = compare_bar(entity["cur"], entity["prev"], cur_lbl, prev_lbl)
    if bar:
        story.append(KeepTogether([Paragraph("This Month vs Last", styles["h3"]), bar]))

    story.append(Spacer(1, 8))
    story.append(KeepTogether([
        Paragraph("Category Detail", styles["h3"]), _category_table(entity, ccy)]))
    story.append(Spacer(1, 8))
    story.append(KeepTogether([
        Paragraph(f"Advice for {entity['name']}", styles["h3"]),
        _advice_block(entity, ccy, styles),
    ]))
