import datetime as dt
import unittest
from collections import Counter
from pathlib import Path

import openpyxl


WORKBOOK_PATH = Path(__file__).parent.parent / "data" / "20251229_LSP管理.xlsx"


def get_col(headers, keywords):
    for index, cell in enumerate(headers):
        if cell is None:
            continue
        normalized = str(cell).replace(" ", "").replace("\u00a0", "").replace("\t", "").replace("\n", "").lower()
        if any(keyword.lower() in normalized for keyword in keywords):
            return index
    return -1


def old_parse_date(value):
    if not value:
        return ""
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (int, float)):
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=value)).strftime("%Y-%m-%d")
    text = str(value).replace(" ", "").replace("\u00a0", "")
    parts = text.split("-")
    if len(parts) >= 3 and len(parts[0]) == 4 and parts[1].isdigit() and parts[2][:2].isdigit():
        return f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2][:2]):02d}"
    return ""


def current_parse_date(value):
    if value is None or value == "":
        return ""
    if isinstance(value, (dt.datetime, dt.date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (int, float)):
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=round(value))).strftime("%Y-%m-%d")
    text = str(value).replace(" ", "").replace("\u00a0", "")
    if "まで" in text:
        return ""
    for separator in ("-", "/"):
        parts = text.split(separator)
        if len(parts) == 3 and len(parts[0]) == 4 and all(part.isdigit() for part in parts):
            try:
                return dt.date(int(parts[0]), int(parts[1]), int(parts[2])).isoformat()
            except ValueError:
                return ""
    return ""


def old_int(value):
    text = str(value or "").replace(",", "").replace(" ", "")
    return int(float(text)) if text.replace(".", "", 1).lstrip("-").isdigit() else 0


def current_number(value):
    if value is None or str(value).strip() == "":
        return 0
    text = str(value).translate(str.maketrans("０１２３４５６７８９．－", "0123456789.-")).replace(",", "").replace(" ", "")
    return float(text)


def completed(status, current):
    if current:
        return status in {"済", "済み", "搭乗済", "搭乗済み", "完了"}
    return status == "済"


def parse_workbook(current):
    workbook = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True)
    data = {"miles": [], "lsp": [], "plans": []}
    parse_date = current_parse_date if current else old_parse_date

    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        key = sheet.title.lower()
        if "lsp" in key:
            header_row = next(index for index, row in enumerate(rows) if any("積算日" in str(cell) for cell in row if cell is not None))
            headers = rows[header_row]
            date_col = get_col(headers, ["積算日", "日付"])
            total_col = get_col(headers, ["累積ポイント", "累積", "累計"])
            for index, row in enumerate(rows[header_row + 1:]):
                if not (row[date_col] or row[total_col]):
                    continue
                date = parse_date(row[date_col])
                total = current_number(row[total_col]) if current else old_int(row[total_col])
                if (date if current else (date or total > 0)):
                    data["lsp"].append({"date": date, "total": total, "index": index})
        elif "マイル" in key:
            header_row = next(index for index, row in enumerate(rows) if any(any(keyword in str(cell) for keyword in ["有効マイル", "内容", "日付"]) for cell in row if cell is not None))
            headers = rows[header_row]
            date_col = get_col(headers, ["日付", "年月日", "積算日"])
            total_col = get_col(headers, ["有効マイル", "残高", "合計マイル"])
            content_col = get_col(headers, ["内容", "詳細", "説明"])
            for index, row in enumerate(rows[header_row + 1:]):
                if not (row[date_col] or row[content_col]):
                    continue
                date = parse_date(row[date_col]) or parse_date(row[content_col])
                if date:
                    total = current_number(row[total_col]) if current else old_int(row[total_col])
                    data["miles"].append({"date": date, "total": total, "index": index})
        elif "計画" in key:
            header_row = next(index for index, row in enumerate(rows) if any(any(keyword in str(cell) for keyword in ["出発地", "到着地"]) for cell in row if cell is not None))
            headers = rows[header_row]
            date_col = get_col(headers, ["日付", "年月日"])
            from_col = get_col(headers, ["出発地", "from"])
            to_col = get_col(headers, ["到着地", "to"])
            status_col = get_col(headers, ["結果", "状態", "status"])
            for row in rows[header_row + 1:]:
                if not (row[date_col] or row[from_col]):
                    continue
                date = parse_date(row[date_col])
                if date:
                    data["plans"].append({"date": date, "from": str(row[from_col] or ""), "to": str(row[to_col] or ""), "status": str(row[status_col] or "予定").strip() or "予定"})
    return data


def summarize(data, current):
    latest = lambda rows: sorted(rows, key=lambda row: (row["date"], row["index"]), reverse=True)[0]["total"]
    completed_plans = [plan for plan in data["plans"] if completed(plan["status"], current)]
    planned_plans = [plan for plan in data["plans"] if not completed(plan["status"], current)]
    return {
        "total_miles": latest(data["miles"]),
        "total_lsp": latest(data["lsp"]),
        "completed_flights": len(completed_plans),
        "planned_flights": len(planned_plans),
        "route_counts": dict(sorted(Counter(f"{plan['from']}→{plan['to']}" for plan in completed_plans).items())),
        "airport_counts": dict(sorted(Counter(airport for plan in completed_plans for airport in (plan["from"], plan["to"])).items())),
    }


class WorkbookRegressionTest(unittest.TestCase):
    def test_current_parser_keeps_existing_workbook_aggregates(self):
        old_summary = summarize(parse_workbook(current=False), current=False)
        current_summary = summarize(parse_workbook(current=True), current=True)
        self.assertEqual(old_summary, current_summary)


if __name__ == "__main__":
    unittest.main()
