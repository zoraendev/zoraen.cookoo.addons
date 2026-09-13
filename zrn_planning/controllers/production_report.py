# -*- coding: utf-8 -*-
from datetime import datetime
from html import escape as html_escape

from odoo import http
from odoo.http import request


class ZrnPlanningProductionReportController(http.Controller):
    @http.route('/zrn_planning/report/export_excel/<int:wizard_id>', type='http', auth='user')
    def export_current_report_excel(self, wizard_id, **kwargs):
        wizard = request.env['zrn_planning.production.planning.wizard'].sudo().browse(wizard_id).exists()
        if not wizard:
            return request.not_found()

        document = self._build_excel_html_document(wizard)
        filename = f"detalle_operativo_fabricacion_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xls"
        return request.make_response(document.encode('utf-8'), headers=[
            ('Content-Type', 'application/vnd.ms-excel; charset=utf-8'),
            ('Content-Disposition', f'attachment; filename="{filename}"'),
        ])

    def _build_excel_html_document(self, wizard):
        range_label = html_escape(wizard.report_date_range_label or '')
        report_html = wizard.report_html or '<div>No hay datos para exportar.</div>'
        return f"""<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <meta name="Generator" content="Odoo ZRN Planeacion" />
    <style>
        body {{
            font-family: Calibri, Arial, sans-serif;
            color: #1f2937;
            margin: 24px;
        }}
        .zrn_planning_export_title {{
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
        }}
        .zrn_planning_export_subtitle {{
            font-size: 13px;
            margin-bottom: 18px;
        }}
        .zrn_am_report_matrix_wrap {{
            overflow: visible !important;
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
            background: #857194;
            color: #ffffff;
            text-align: center;
            font-weight: 700;
        }}
        tbody tr:nth-child(odd) td {{
            background: #ffffff;
        }}
        tbody tr:nth-child(even) td {{
            background: #f6f3fa;
        }}
        thead .zrn_am_sticky_col,
        thead .zrn_am_sticky_col_2,
        thead .zrn_am_sticky_col_3 {{
            background: #857194;
            color: #ffffff;
            font-weight: 700;
        }}
        tbody .zrn_am_sticky_col,
        tbody .zrn_am_sticky_col_2,
        tbody .zrn_am_sticky_col_3 {{
            background: #eef1f7;
            color: #1f2937;
            font-weight: 600;
        }}
        .zrn_am_num {{
            text-align: right;
            mso-number-format: "0.00";
        }}
        .zrn_am_num_zero {{
            color: #c9ced8;
        }}
        .zrn_am_day_total,
        .zrn_am_day_total_head,
        .zrn_am_day_total_subhead {{
            background: #ddd2ee !important;
            font-weight: 700;
        }}
        .zrn_am_week_total,
        .zrn_am_week_total_head,
        .zrn_am_week_total_title,
        .zrn_am_week_total_subhead {{
            background: #d7e8d5 !important;
            font-weight: 700;
        }}
        .zrn_am_month_total,
        .zrn_am_month_total_head,
        .zrn_am_month_total_title,
        .zrn_am_month_total_subhead {{
            background: #f4e3ae !important;
            font-weight: 700;
        }}
        .zrn_am_stock_shortage {{
            background: #fde8e8 !important;
            color: #dc2626;
            font-weight: 700;
        }}
        .zrn_am_stock_surplus {{
            background: #e8f5e9 !important;
            color: #166534;
            font-weight: 700;
        }}
        .zrn_am_stock_zero {{
            background: #f3f4f6 !important;
            color: #374151;
            font-weight: 700;
        }}
        .zrn_am_product_name {{
            min-width: 220px;
        }}
        .zrn_am_day_heading {{
            display: block;
            font-weight: 700;
        }}
        .zrn_am_day_heading_date {{
            display: block;
            font-size: 12px;
            margin-top: 4px;
        }}
    </style>
</head>
<body>
    <div class="zrn_planning_export_title">Detalle operativo de fabricacion</div>
    <div class="zrn_planning_export_subtitle">{range_label}</div>
    {report_html}
</body>
</html>"""
