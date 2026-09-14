# -*- coding: utf-8 -*-
import json
from datetime import datetime
from html import escape as html_escape

from odoo import http
from odoo.http import request


class ZrnAnaliticsCommercialExportController(http.Controller):
    @http.route('/zrn_analitics/commercial/portfolio_drill/export_excel', type='http', auth='user')
    def export_portfolio_drill_excel(self, **kwargs):
        rows = self._load_rows(kwargs.get('rows'))
        currency_symbol = kwargs.get('currency_symbol') or '$'
        document = self._build_portfolio_drill_document(rows, currency_symbol)
        filename = f"zrn_comercial_drill_portafolio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xls"
        return request.make_response(document.encode('utf-8'), headers=[
            ('Content-Type', 'application/vnd.ms-excel; charset=utf-8'),
            ('Content-Disposition', f'attachment; filename="{filename}"'),
        ])

    def _load_rows(self, rows_json):
        if not rows_json:
            return []
        try:
            rows = json.loads(rows_json)
        except json.JSONDecodeError:
            return []
        if not isinstance(rows, list):
            return []
        return rows

    def _build_portfolio_drill_document(self, rows, currency_symbol):
        table_rows = ''.join(self._build_portfolio_drill_row(row, currency_symbol) for row in rows)
        if not table_rows:
            table_rows = '<tr><td colspan="8" class="zrn_empty">No hay datos para exportar.</td></tr>'
        return f"""<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <meta name="Generator" content="Odoo ZRN Analitica" />
    <style>
        body {{
            font-family: Calibri, Arial, sans-serif;
            color: #1f2937;
            margin: 24px;
        }}
        .zrn_title {{
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
        }}
        .zrn_subtitle {{
            font-size: 13px;
            margin-bottom: 18px;
            color: #53657d;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
        }}
        th, td {{
            border: 1px solid #d7d8ea;
            padding: 8px 10px;
            vertical-align: middle;
        }}
        thead th {{
            background: #1f4e8c;
            color: #ffffff;
            text-align: left;
            font-weight: 700;
        }}
        tbody tr:nth-child(odd) td {{
            background: #ffffff;
        }}
        tbody tr:nth-child(even) td {{
            background: #f6f8fb;
        }}
        .zrn_level_unit td {{
            background: #eaf1fb !important;
            font-weight: 700;
        }}
        .zrn_level_brand td {{
            background: #f2f6fc !important;
            font-weight: 600;
        }}
        .zrn_indent_0 {{ padding-left: 10px; }}
        .zrn_indent_1 {{ padding-left: 26px; }}
        .zrn_indent_2 {{ padding-left: 42px; }}
        .zrn_indent_3 {{ padding-left: 58px; }}
        .zrn_num {{
            text-align: right;
            mso-number-format: "#,##0.00";
        }}
        .zrn_int {{
            text-align: right;
            mso-number-format: "#,##0";
        }}
        .zrn_percent {{
            text-align: right;
            mso-number-format: "0.0%";
        }}
        .zrn_empty {{
            text-align: center;
            color: #53657d;
        }}
    </style>
</head>
<body>
    <div class="zrn_title">Drill UN - marca - categoria - SKU</div>
    <div class="zrn_subtitle">(ZRN) Manejo Comercial</div>
    <table>
        <thead>
            <tr>
                <th>Nivel</th>
                <th>Ingreso</th>
                <th>% Mix</th>
                <th>Unidades</th>
                <th>Lineas fact.</th>
                <th>SKUs</th>
                <th>Margen Q</th>
                <th>Margen %</th>
            </tr>
        </thead>
        <tbody>
            {table_rows}
        </tbody>
    </table>
</body>
</html>"""

    def _build_portfolio_drill_row(self, row, currency_symbol):
        level = row.get('level') or ''
        indent = {'unit': 0, 'brand': 1, 'line': 2, 'sku': 3}.get(level, 0)
        css_level = f'zrn_level_{html_escape(level)}' if level in ('unit', 'brand') else ''
        label = html_escape(row.get('label') or '')
        revenue = self._number(row.get('revenue'))
        mix_percentage = self._number(row.get('mix_percentage')) / 100.0
        units = self._number(row.get('units_sold'))
        billed_lines = self._number(row.get('billed_lines'))
        sku_count = self._number(row.get('sku_count'))
        margin_amount = self._number(row.get('margin_amount'))
        margin_pct = self._number(row.get('margin_pct')) / 100.0
        currency = html_escape(currency_symbol)
        billed_display = f'{billed_lines:.0f}' if billed_lines else '-'
        margin_amount_display = f'{currency} {margin_amount:.2f}' if margin_amount else '-'
        margin_pct_display = f'{margin_pct:.4f}' if margin_amount else '-'
        return f"""<tr class="{css_level}">
            <td class="zrn_indent_{indent}">{label}</td>
            <td class="zrn_num">{currency} {revenue:.2f}</td>
            <td class="zrn_percent">{mix_percentage:.4f}</td>
            <td class="zrn_int">{units:.0f}</td>
            <td class="zrn_int">{billed_display}</td>
            <td class="zrn_int">{sku_count:.0f}</td>
            <td class="zrn_num">{margin_amount_display}</td>
            <td class="zrn_percent">{margin_pct_display}</td>
        </tr>"""

    def _number(self, value):
        try:
            return float(value or 0.0)
        except (TypeError, ValueError):
            return 0.0
