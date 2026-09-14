import json
from collections import OrderedDict
from datetime import datetime, timedelta

def escape(s):
    if not isinstance(s, str):
        s = str(s)
    return (
        s.replace('&', '&amp;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
         .replace('"', '&quot;')
         .replace("'", '&#39;')
     )


from odoo import _, api, fields, models
from odoo.exceptions import UserError


class ZrnPlanningProductionPlanningWizard(models.TransientModel):
    _name = 'zrn_planning.production.planning.wizard'
    _description = 'Filtros de planeacion de produccion'
    _rec_name = 'name'

    name = fields.Char(string='Titulo', default='Planeacion de fabricacion')
    fecha_entrega_desde = fields.Date(string='Fecha de entrega desde')
    fecha_entrega_hasta = fields.Date(string='Fecha de entrega hasta')
    cliente_ids = fields.Many2many(
        'res.partner',
        string='Puntos de venta',
    )
    contact_ids = fields.Many2many(
        'res.partner',
        'zrn_planning_production_wizard_contact_rel',
        'wizard_id',
        'contact_id',
        string='Personas y contactos',
    )
    product_ids = fields.Many2many(
        'product.product',
        string='Productos',
    )
    product_categ_ids = fields.Many2many(
        'product.category',
        'zrn_planning_production_wizard_category_rel',
        'wizard_id',
        'category_id',
        string='Categorias de producto',
    )
    order_state = fields.Selection(
        [
            ('sale', 'Confirmados'),
            ('done', 'Bloqueados'),
            ('sale_done', 'Confirmados y bloqueados'),
        ],
        string='Estado del pedido',
        default='sale_done',
    )
    available_cliente_ids = fields.Many2many(
        'res.partner',
        string='Puntos de venta disponibles',
        compute='_compute_filter_data',
        readonly=True,
    )
    available_product_ids = fields.Many2many(
        'product.product',
        string='Productos disponibles',
        compute='_compute_filter_data',
        readonly=True,
    )
    available_contact_ids = fields.Many2many(
        'res.partner',
        string='Personas disponibles',
        compute='_compute_filter_data',
        readonly=True,
    )
    available_product_categ_ids = fields.Many2many(
        'product.category',
        string='Categorias disponibles',
        compute='_compute_filter_data',
        readonly=True,
    )
    preview_cliente_count = fields.Integer(
        string='Cantidad de puntos de venta',
        compute='_compute_filter_data',
        readonly=True,
    )
    preview_product_count = fields.Integer(
        string='Cantidad de productos',
        compute='_compute_filter_data',
        readonly=True,
    )
    preview_order_count = fields.Integer(
        string='Cantidad de pedidos de venta',
        compute='_compute_filter_data',
        readonly=True,
    )
    planning_record_count = fields.Integer(
        string='Planings creados',
        compute='_compute_planning_record_ids',
        readonly=True,
    )
    planning_record_ids = fields.Many2many(
        'zrn_planning.mfg.plan',
        string='Planings creados',
        compute='_compute_planning_record_ids',
        readonly=True,
    )
    report_customer_line_ids = fields.One2many(
        'zrn_planning.production.planning.wizard.report.customer.line',
        'wizard_id',
        string='Clientes del reporte',
    )
    report_product_line_ids = fields.One2many(
        'zrn_planning.production.planning.wizard.report.product.line',
        'wizard_id',
        string='Productos del reporte',
    )
    report_order_line_ids = fields.One2many(
        'zrn_planning.production.planning.wizard.report.order.line',
        'wizard_id',
        string='OVs del reporte',
    )
    report_ready = fields.Boolean(string='Reporte listo', default=False)
    report_active_tab = fields.Selection(
        [
            ('overview', 'Reporte'),
            ('customers', 'Clientes'),
            ('products', 'Productos'),
            ('orders', 'OVs'),
        ],
        string='Vista activa del reporte',
        default='overview',
        readonly=True,
    )
    report_row_count = fields.Integer(string='Lineas del reporte', readonly=True)
    report_order_count = fields.Integer(string='Ordenes consideradas', readonly=True)
    report_customer_count = fields.Integer(string='Clientes en reporte', readonly=True)
    report_product_count = fields.Integer(string='Productos en reporte', readonly=True)
    report_total_units = fields.Float(string='Unidades demandadas', readonly=True)
    report_delivered_units = fields.Float(string='Unidades entregadas', readonly=True)
    report_pending_units = fields.Float(string='Unidades pendientes', readonly=True)
    report_completion_pct = fields.Float(string='Avance de entrega', readonly=True)
    report_chart_data = fields.Text(string='Datos de avance', readonly=True)
    report_date_range_label = fields.Char(string='Rango consultado', readonly=True)
    report_html = fields.Html(
        string='Detalle del reporte',
        sanitize=False,
        readonly=True,
    )
    report_date_from_label = fields.Char(string='Fecha inicial del reporte', readonly=True)
    report_date_to_label = fields.Char(string='Fecha final del reporte', readonly=True)
    report_date_range_mode = fields.Selection(
        [
            ('all', 'Todas las fechas'),
            ('from', 'Desde'),
            ('to', 'Hasta'),
            ('range', 'Rango'),
        ],
        string='Modo del rango del reporte',
        default='all',
        readonly=True,
    )
    pending_plan_state = fields.Selection(
        [
            ('draft', 'Borrador'),
            ('pending_confirmation', 'Pendiente de confirmar'),
            ('approved', 'Confirmado'),
        ],
        string='Estado sugerido del planning',
        default='draft',
    )

    @api.model
    def _coerce_to_date(self, value):
        if not value:
            return False
        if isinstance(value, str):
            return fields.Date.from_string(value)
        if hasattr(value, 'date'):
            return value.date()
        return value

    def _get_effective_line_date(self, line):
        effective_date = line.order_id.commitment_date or line.order_id.date_order
        return self._coerce_to_date(effective_date)

    def _get_line_filter_partner(self, line):
        return line.order_id.partner_id or line.order_partner_id

    @api.model
    def _line_matches_filter_dates(self, line, fecha_desde=False, fecha_hasta=False):
        effective_date = self._get_effective_line_date(line)
        if not effective_date:
            return False
        if fecha_desde and effective_date < fecha_desde:
            return False
        if fecha_hasta and effective_date > fecha_hasta:
            return False
        return True

    def _get_filter_values(self, include_selected=True):
        self.ensure_one()
        values = {
            'fecha_entrega_desde': fields.Date.to_string(self.fecha_entrega_desde) if self.fecha_entrega_desde else False,
            'fecha_entrega_hasta': fields.Date.to_string(self.fecha_entrega_hasta) if self.fecha_entrega_hasta else False,
        }
        if include_selected:
            values.update({
                'cliente_ids': self.cliente_ids.ids,
                'contact_ids': self.contact_ids.ids,
                'product_ids': self.product_ids.ids,
                'product_categ_ids': self.product_categ_ids.ids,
                'order_state': self.order_state or 'sale_done',
            })
        return values

    @api.model
    def _search_sale_lines_from_filters(self, filters=None, limit=None):
        filters = filters or {}
        if 'sale.order.line' not in self.env:
            return self.env['sale.order.line']

        fecha_desde = self._coerce_to_date(filters.get('fecha_entrega_desde'))
        fecha_hasta = self._coerce_to_date(filters.get('fecha_entrega_hasta'))
        cliente_ids = [int(partner_id) for partner_id in filters.get('cliente_ids') or [] if partner_id]
        contact_ids = [int(partner_id) for partner_id in filters.get('contact_ids') or [] if partner_id]
        product_ids = [int(product_id) for product_id in filters.get('product_ids') or [] if product_id]
        product_categ_ids = [int(category_id) for category_id in filters.get('product_categ_ids') or [] if category_id]
        order_state = filters.get('order_state') or 'sale_done'
        order_states = ['sale', 'done'] if order_state == 'sale_done' else [order_state]

        domain = [
            ('order_id.state', 'in', order_states),
            ('display_type', '=', False),
            ('product_id', '!=', False),
        ]

        if cliente_ids:
            domain.append(('order_id.partner_id', 'in', cliente_ids))
        if contact_ids:
            domain.append(('order_id.partner_id', 'in', contact_ids))
        if product_ids:
            domain.append(('product_id', 'in', product_ids))
        if product_categ_ids:
            domain.append(('product_id.categ_id', 'child_of', product_categ_ids))

        sale_lines = self.env['sale.order.line'].search(domain, order='id asc')
        sale_lines = sale_lines.filtered(
            lambda line: float(line.qty_delivered or 0.0) < float(line.product_uom_qty or 0.0)
        )
        if fecha_desde or fecha_hasta:
            sale_lines = sale_lines.filtered(
                lambda line: self._line_matches_filter_dates(
                    line,
                    fecha_desde=fecha_desde,
                    fecha_hasta=fecha_hasta,
                )
            )

        safe_limit = min(limit or 10000, 10000)
        return sale_lines[:safe_limit]

    @api.depends(
        'fecha_entrega_desde', 'fecha_entrega_hasta', 'cliente_ids', 'contact_ids',
        'product_ids', 'product_categ_ids', 'order_state',
    )
    def _compute_filter_data(self):
        for wizard in self:
            available_lines = wizard._search_sale_lines_from_filters(
                wizard._get_filter_values(include_selected=False)
            )
            candidate_lines = wizard._search_sale_lines_from_filters(
                wizard._get_filter_values(include_selected=True)
            )

            available_partner_ids = [
                partner.id for partner in available_lines.mapped(lambda line: wizard._get_line_filter_partner(line)) if partner
            ]
            candidate_partner_ids = [
                partner.id for partner in candidate_lines.mapped(lambda line: wizard._get_line_filter_partner(line)) if partner
            ]
            wizard.available_cliente_ids = [(6, 0, available_partner_ids)]
            wizard.available_product_ids = [(6, 0, available_lines.mapped('product_id').ids)]
            wizard.available_contact_ids = [(6, 0, available_partner_ids)]
            wizard.available_product_categ_ids = [(6, 0, available_lines.mapped('product_id.categ_id').ids)]
            wizard.preview_cliente_count = len(set(candidate_partner_ids))
            wizard.preview_product_count = len(candidate_lines.mapped('product_id'))
            wizard.preview_order_count = len(candidate_lines.mapped('order_id'))

    @api.onchange(
        'fecha_entrega_desde', 'fecha_entrega_hasta', 'cliente_ids', 'contact_ids',
        'product_ids', 'product_categ_ids', 'order_state',
    )
    def _onchange_filters_refresh_data(self):
        self._compute_filter_data()

    def _compute_planning_record_ids(self):
        for wizard in self:
            domain = [
                ('company_id', '=', self.env.company.id),
                ('line_ids.supply_ids', '=', False),
            ]
            plans = self.env['zrn_planning.mfg.plan'].search(
                domain,
                order='create_date desc, id desc',
                limit=15,
            )
            wizard.planning_record_count = self.env['zrn_planning.mfg.plan'].search_count(domain)
            wizard.planning_record_ids = [(6, 0, plans.ids)]

    def action_open_existing_plans(self):
        self.ensure_one()
        tree_view = self.env.ref('zrn_planning.view_zrn_planning_mfg_plan_tree')
        form_view = self.env.ref('zrn_planning.view_zrn_planning_mfg_plan_form')
        domain = [
            ('company_id', '=', self.env.company.id),
            ('line_ids.supply_ids', '=', False),
        ]
        return {
            'type': 'ir.actions.act_window',
            'name': 'Planings de fabricacion creados',
            'res_model': 'zrn_planning.mfg.plan',
            'view_mode': 'tree,form',
            'views': [(tree_view.id, 'tree'), (form_view.id, 'form')],
            'domain': domain,
            'context': {
                'search_default_active': 1,
                'create': False,
            },
            'target': 'current',
        }

    def action_clear_filters(self):
        self.ensure_one()
        self.write({
            'fecha_entrega_desde': False,
            'fecha_entrega_hasta': False,
            'cliente_ids': [(5, 0, 0)],
            'contact_ids': [(5, 0, 0)],
            'product_ids': [(5, 0, 0)],
            'product_categ_ids': [(5, 0, 0)],
            'order_state': 'sale_done',
        })
        self._reset_report_payload()
        self._compute_filter_data()
        return self.action_open_filters()

    def action_open_filters(self):
        self.ensure_one()
        filter_view = self.env.ref('zrn_planning.view_zrn_planning_production_planning_filter_form')
        return {
            'type': 'ir.actions.act_window',
            'name': 'Planeacion de fabricacion',
            'res_model': 'zrn_planning.production.planning.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': filter_view.id,
            'views': [(filter_view.id, 'form')],
            'target': 'main',
        }

    def action_back_to_production_planning(self):
        self.ensure_one()
        action = self.env.ref('zrn_planning.action_zrn_planning_home').read()[0]
        action['target'] = 'main'
        return action

    def _reset_report_payload(self):
        for wizard in self:
            wizard.report_customer_line_ids.unlink()
            wizard.report_product_line_ids.unlink()
            wizard.report_order_line_ids.unlink()
            wizard.report_ready = False
            wizard.report_active_tab = 'overview'
            wizard.report_row_count = 0
            wizard.report_order_count = 0
            wizard.report_customer_count = 0
            wizard.report_product_count = 0
            wizard.report_total_units = 0
            wizard.report_delivered_units = 0
            wizard.report_pending_units = 0
            wizard.report_completion_pct = 0
            wizard.report_chart_data = False
            wizard.report_date_range_label = False
            wizard.report_date_from_label = False
            wizard.report_date_to_label = False
            wizard.report_date_range_mode = 'all'
            wizard.report_html = False

    def _get_effective_report_date_range(self, candidate_lines):
        self.ensure_one()
        line_dates = [
            wizard_date
            for wizard_date in (
                self._get_effective_line_date(line) for line in candidate_lines
            )
            if wizard_date
        ]
        if line_dates:
            return min(line_dates), max(line_dates)
        return self.fecha_entrega_desde, self.fecha_entrega_hasta

    def _get_report_date_range_payload(self, candidate_lines):
        self.ensure_one()
        date_from, date_to = self._get_effective_report_date_range(candidate_lines)
        if date_from and date_to:
            return {
                'label': f'{date_from.strftime("%d/%m/%Y")} al {date_to.strftime("%d/%m/%Y")}',
                'from_label': date_from.strftime("%d/%m/%Y"),
                'to_label': date_to.strftime("%d/%m/%Y"),
                'mode': 'range',
            }
        if date_from:
            return {
                'label': f'desde {date_from.strftime("%d/%m/%Y")}',
                'from_label': date_from.strftime("%d/%m/%Y"),
                'to_label': False,
                'mode': 'from',
            }
        if date_to:
            return {
                'label': f'hasta {date_to.strftime("%d/%m/%Y")}',
                'from_label': False,
                'to_label': date_to.strftime("%d/%m/%Y"),
                'mode': 'to',
            }
        return {
            'label': 'todas las fechas disponibles',
            'from_label': False,
            'to_label': False,
            'mode': 'all',
        }

    def _sync_report_customer_lines(self, candidate_lines):
        SummaryLine = self.env['zrn_planning.production.planning.wizard.report.customer.line']
        for wizard in self:
            wizard.report_customer_line_ids.unlink()
            grouped_lines = {}
            for line in candidate_lines.sorted(
                key=lambda item: (
                    (wizard._get_line_filter_partner(item).display_name if wizard._get_line_filter_partner(item) else '') or '',
                    item.id,
                )
            ):
                partner = wizard._get_line_filter_partner(line)
                if not partner:
                    continue
                grouped_lines.setdefault(partner.id, self.env['sale.order.line'])
                grouped_lines[partner.id] |= line

            summary_values = []
            for partner_id, lines in grouped_lines.items():
                partner = self.env['res.partner'].browse(partner_id)
                order_ids = lines.mapped('order_id')
                product_ids = lines.mapped('product_id')
                delivery_dates = [
                    effective_date for effective_date in
                    (wizard._get_effective_line_date(line) for line in lines)
                    if effective_date
                ]
                summary_values.append({
                    'wizard_id': wizard.id,
                    'partner_id': partner.id,
                    'customer_id': (partner.parent_id or partner.commercial_partner_id).id,
                    'city': partner.city or '',
                    'order_count': len(order_ids),
                    'line_count': len(lines),
                    'product_count': len(product_ids),
                    'total_units': sum(lines.mapped('product_uom_qty')),
                    'first_delivery_date': min(delivery_dates) if delivery_dates else False,
                    'last_delivery_date': max(delivery_dates) if delivery_dates else False,
                })
            if summary_values:
                SummaryLine.create(summary_values)

    def _sync_report_product_lines(self, candidate_lines):
        SummaryLine = self.env['zrn_planning.production.planning.wizard.report.product.line']
        StockQuant = self.env['stock.quant'] if 'stock.quant' in self.env else False
        for wizard in self:
            wizard.report_product_line_ids.unlink()
            grouped_lines = {}
            for line in candidate_lines.sorted(
                key=lambda item: (
                    item.product_id.display_name or '',
                    item.id,
                )
            ):
                product = line.product_id
                if not product:
                    continue
                grouped_lines.setdefault(product.id, self.env['sale.order.line'])
                grouped_lines[product.id] |= line

            stock_data = {}
            product_ids = list(grouped_lines.keys())
            if product_ids and StockQuant:
                grouped_quants = StockQuant.read_group(
                    [('product_id', 'in', product_ids), ('location_id.usage', '=', 'internal')],
                    ['product_id', 'available_quantity:sum', 'quantity:sum'],
                    ['product_id'],
                )
                stock_data = {
                    item['product_id'][0]: {
                        'stock_initial': item.get('quantity', 0.0),
                        'stock_free': item.get('available_quantity', 0.0),
                    }
                    for item in grouped_quants
                    if item.get('product_id')
                }

            summary_values = []
            for product_id, lines in grouped_lines.items():
                product = self.env['product.product'].browse(product_id)
                order_ids = lines.mapped('order_id')
                customer_ids = lines.mapped(lambda line: wizard._get_line_filter_partner(line))
                total_units = sum(lines.mapped('product_uom_qty'))
                delivery_dates = [
                    effective_date for effective_date in
                    (wizard._get_effective_line_date(line) for line in lines)
                    if effective_date
                ]
                stock_info = stock_data.get(product.id, {})
                stock_initial = stock_info.get('stock_initial', 0.0)
                stock_free = stock_info.get('stock_free', 0.0)
                summary_values.append({
                    'wizard_id': wizard.id,
                    'product_id': product.id,
                    'default_code': product.default_code or '',
                    'categ_name': product.categ_id.display_name or '',
                    'customer_count': len(customer_ids),
                    'order_count': len(order_ids),
                    'line_count': len(lines),
                    'total_units': total_units,
                    'stock_initial': stock_initial,
                    'stock_free': stock_free,
                    'suggested_production': max(total_units - stock_free, 0.0),
                    'projected_balance': stock_initial - total_units,
                    'first_delivery_date': min(delivery_dates) if delivery_dates else False,
                    'last_delivery_date': max(delivery_dates) if delivery_dates else False,
                })
            if summary_values:
                SummaryLine.create(summary_values)

    def _sync_report_order_lines(self, candidate_lines):
        SummaryLine = self.env['zrn_planning.production.planning.wizard.report.order.line']
        order_state_labels = {
            'draft': 'Presupuesto',
            'sent': 'Presupuesto enviado',
            'sale': 'Pedido de venta',
            'done': 'Bloqueado',
            'cancel': 'Cancelado',
        }
        for wizard in self:
            wizard.report_order_line_ids.unlink()
            grouped_lines = {}
            for line in candidate_lines.sorted(
                key=lambda item: (
                    item.order_id.name or '',
                    item.id,
                )
            ):
                order = line.order_id
                if not order:
                    continue
                grouped_lines.setdefault(order.id, self.env['sale.order.line'])
                grouped_lines[order.id] |= line

            summary_values = []
            for order_id, lines in grouped_lines.items():
                order = self.env['sale.order'].browse(order_id)
                delivery_dates = [
                    effective_date for effective_date in
                    (wizard._get_effective_line_date(line) for line in lines)
                    if effective_date
                ]
                summary_values.append({
                    'wizard_id': wizard.id,
                    'order_id': order.id,
                    'customer_id': order.partner_id.id,
                    'state': order.state or '',
                    'state_label': order_state_labels.get(order.state or '', order.state or ''),
                    'product_count': len(lines.mapped('product_id')),
                    'line_count': len(lines),
                    'total_units': sum(lines.mapped('product_uom_qty')),
                    'first_delivery_date': min(delivery_dates) if delivery_dates else False,
                    'last_delivery_date': max(delivery_dates) if delivery_dates else False,
                })
            if summary_values:
                SummaryLine.create(summary_values)

    def action_open_report(self):
        self.ensure_one()
        report_view = self.env.ref('zrn_planning.view_zrn_planning_production_planning_report_form')
        return {
            'type': 'ir.actions.act_window',
            'name': 'Resumen de fabricacion',
            'res_model': 'zrn_planning.production.planning.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': report_view.id,
            'views': [(report_view.id, 'form')],
            'target': 'main',
        }

    def action_open_manufacture_table(self):
        self.ensure_one()
        manufacture_view = self.env.ref(
            'zrn_planning.view_zrn_planning_production_planning_manufacture_form'
        )
        return {
            'type': 'ir.actions.act_window',
            'name': 'Tabla para fabricar',
            'res_model': 'zrn_planning.production.planning.wizard',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': manufacture_view.id,
            'views': [(manufacture_view.id, 'form')],
            'target': 'main',
        }

    def action_download_report_excel(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url': f'/zrn_planning/report/export_excel/{self.id}',
            'target': 'self',
        }

    def action_open_create_mfg_plan_modal(self):
        self.ensure_one()
        if not self.report_product_line_ids:
            raise UserError(_('No hay datos en la tabla para crear el planning.'))

        modal = self.env['zrn_planning.production.planning.create.plan.wizard'].create({
            'production_wizard_id': self.id,
            'plan_state': self.pending_plan_state or 'draft',
        })
        form_view = self.env.ref('zrn_planning.view_zrn_planning_create_mfg_plan_modal_form')
        return {
            'type': 'ir.actions.act_window',
            'name': _('Crear planning de fabricacion'),
            'res_model': 'zrn_planning.production.planning.create.plan.wizard',
            'res_id': modal.id,
            'view_mode': 'form',
            'view_id': form_view.id,
            'views': [(form_view.id, 'form')],
            'target': 'new',
        }

    def action_open_mrp_production_create(self, product_id, suggested_qty=0.0):
        self.ensure_one()

        product = self.env['product.product'].browse(int(product_id or 0)).exists()
        if not product:
            return False

        action = self.env['ir.actions.actions']._for_xml_id('mrp.action_mrp_production_form')
        action_context = dict(self.env.context)
        action_context.update({
            'default_product_id': product.id,
            'default_product_uom_id': product.uom_id.id,
            'default_company_id': self.env.company.id,
            'allowed_company_ids': self.env.companies.ids,
        })

        quantity = float(suggested_qty or 0.0)
        if quantity > 0:
            action_context['default_product_qty'] = quantity

        action.update({
            'name': _('Nueva orden de fabricacion'),
            'view_mode': 'form',
            'views': [(False, 'form')],
            'target': 'current',
            'context': action_context,
        })
        return action

    def _create_mfg_plan(self, target_state='draft', notes=False, plan_name=False, planning_line_payload=None):
        self.ensure_one()
        if not self.report_product_line_ids:
            raise UserError(_('No hay datos en la tabla para crear el planning.'))

        planning_line_payload = planning_line_payload or []
        if not planning_line_payload:
            raise UserError(_('No hay lineas configuradas para crear el planning.'))

        warehouse = self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)],
            limit=1,
        )
        payload_delivery_dates = [item.get('delivery_date') for item in planning_line_payload if item.get('delivery_date')]
        date_start = self.fecha_entrega_desde or (min(payload_delivery_dates) if payload_delivery_dates else False)
        date_end = self.fecha_entrega_hasta or (max(payload_delivery_dates) if payload_delivery_dates else False)
        plan = self.env['zrn_planning.mfg.plan'].create({
            'name': plan_name or (_('Planning de fabricacion %s') % fields.Date.today().strftime('%d/%m/%Y')),
            'company_id': self.env.company.id,
            'warehouse_id': warehouse.id if warehouse else False,
            'planning_basis': 'sale',
            'state': target_state,
            'date_start': date_start,
            'date_end': date_end,
            'notes': notes or _('Planning generado desde Planeacion de fabricacion.'),
        })

        bom_model = self.env['mrp.bom']
        line_values = []
        sale_line_ids_for_sources = set()
        for sequence, line_payload in enumerate(
            sorted(
                planning_line_payload,
                key=lambda item: (
                    item.get('delivery_date') or fields.Date.today(),
                    item.get('order_name') or '',
                    item.get('product_name') or '',
                    item.get('sale_line_id') or 0,
                ),
            ),
            start=1,
        ):
            sale_line = self.env['sale.order.line'].browse(line_payload['sale_line_id']).exists()
            if not sale_line:
                continue
            product = sale_line.product_id
            bom = bom_model.search([('product_id', '=', product.id)], limit=1)
            if not bom:
                bom = bom_model.search(
                    [('product_tmpl_id', '=', product.product_tmpl_id.id)],
                    limit=1,
                )
            planned_qty = float(line_payload.get('planned_qty') or 0.0)
            if planned_qty <= 0:
                continue
            sale_line_ids_for_sources.add(sale_line.id)
            line_values.append({
                'plan_id': plan.id,
                'sequence': sequence * 10,
                'warehouse_id': warehouse.id if warehouse else False,
                'product_id': product.id,
                'bom_id': bom.id if bom else False,
                'production_date': line_payload.get('production_date') or False,
                'delivery_date': line_payload.get('delivery_date') or False,
                'qty_planned': planned_qty,
                'state': 'draft',
            })
        if line_values:
            self.env['zrn_planning.mfg.plan.line'].create(line_values)

        source_values = []
        source_sale_lines = self.env['sale.order.line'].browse(list(sale_line_ids_for_sources))
        grouped_orders = {}
        for sale_line in source_sale_lines.sorted(
            key=lambda line: (
                self._get_effective_line_date(line) or fields.Date.today(),
                line.order_id.name or '',
                line.id,
            )
        ):
            grouped_orders.setdefault(sale_line.order_id.id, self.env['sale.order.line'])
            grouped_orders[sale_line.order_id.id] |= sale_line
        for order_lines in grouped_orders.values():
            order = order_lines[0].order_id
            delivery_dates = [
                effective_date
                for effective_date in (self._get_effective_line_date(line) for line in order_lines)
                if effective_date
            ]
            source_values.append({
                'plan_id': plan.id,
                'source_model': 'sale.order',
                'source_id': order.id,
                'source_ref': order.name or '',
                'customer_id': order.partner_id.id,
                'source_date': min(delivery_dates) if delivery_dates else False,
                'source_state': order.state or '',
            })
        if source_values:
            self.env['zrn_planning.mfg.plan.source'].create(source_values)

        self.pending_plan_state = target_state

        if target_state == 'approved':
            plan.action_confirm_plan()

        form_view = self.env.ref('zrn_planning.view_zrn_planning_mfg_plan_form')
        return {
            'type': 'ir.actions.act_window',
            'name': _('Planning de fabricacion'),
            'res_model': 'zrn_planning.mfg.plan',
            'res_id': plan.id,
            'view_mode': 'form',
            'view_id': form_view.id,
            'views': [(form_view.id, 'form')],
            'target': 'current',
        }

    def _open_report_tab(self, tab_name):
        self.ensure_one()
        self.report_active_tab = tab_name
        return self.action_open_report()

    def _open_summary_list_action(self, action_xmlid, tab_name):
        self.ensure_one()
        action = self.env.ref(action_xmlid).read()[0]
        action['domain'] = [('wizard_id', '=', self.id)]
        action['context'] = {
            'active_id': self.id,
            'default_wizard_id': self.id,
            'zrn_planning_origin_view': 'report',
            'zrn_planning_summary_tab': tab_name,
            'zrn_planning_clean_export_fields': True,
            'zrn_planning_wizard_model': 'zrn_planning.production.planning.wizard',
        }
        action['target'] = 'current'
        return action

    def action_open_report_overview(self):
        self.ensure_one()
        return self._open_report_tab('overview')

    def action_back_to_report(self):
        self.ensure_one()
        self.report_active_tab = 'overview'
        return self.action_open_report()

    def action_back_to_filters(self):
        self.ensure_one()
        return self.action_open_filters()

    def action_open_report_customers(self):
        self.ensure_one()
        return self._open_report_tab('customers')

    def action_open_report_customers_list(self):
        self.ensure_one()
        return self._open_summary_list_action(
            'zrn_planning.action_zrn_planning_production_report_customers',
            'customers',
        )

    def action_open_report_products(self):
        self.ensure_one()
        return self._open_report_tab('products')

    def action_open_report_products_list(self):
        self.ensure_one()
        return self._open_summary_list_action(
            'zrn_planning.action_zrn_planning_production_report_products',
            'products',
        )

    def action_open_report_orders(self):
        self.ensure_one()
        return self._open_report_tab('orders')

    def action_open_report_orders_list(self):
        self.ensure_one()
        return self._open_summary_list_action(
            'zrn_planning.action_zrn_planning_production_report_orders',
            'orders',
        )

    @api.model
    def action_back_to_report_from_context(self, wizard_id, summary_tab='overview'):
        wizard = self.browse(wizard_id).exists()
        if not wizard:
            return False
        wizard.report_active_tab = summary_tab or 'overview'
        return wizard.action_open_report()

    def _get_inventory_snapshot_label(self):
        snapshot_date = fields.Date.context_today(self)
        if not snapshot_date:
            return False
        return snapshot_date.strftime('%d/%m/%Y')

    def _get_planning_range_label(self, candidate_lines):
        self.ensure_one()
        date_from, date_to = self._get_effective_report_date_range(candidate_lines)
        if date_from and date_to:
            return f'{date_from.strftime("%d/%m/%Y")} al {date_to.strftime("%d/%m/%Y")}'
        if date_from:
            return f'desde {date_from.strftime("%d/%m/%Y")}'
        if date_to:
            return f'hasta {date_to.strftime("%d/%m/%Y")}'
        return 'todas las fechas'

    def _format_report_number(self, value):
        value = float(value or 0.0)
        if value.is_integer():
            return f'{int(value):,}'
        return f'{value:,.2f}'

    def _get_report_week_group_key(self, fecha_entrega=False):
        fecha_value = self._coerce_to_date(fecha_entrega)
        if not fecha_value:
            return False
        week_of_month = ((fecha_value.day - 1) // 7) + 1
        return (fecha_value.year, fecha_value.month, week_of_month)

    def _get_report_month_group_key(self, fecha_entrega=False):
        fecha_value = self._coerce_to_date(fecha_entrega)
        if not fecha_value:
            return False
        return (fecha_value.year, fecha_value.month)

    def _format_report_week_label(self, week_key):
        if not week_key:
            return 'Semana'
        year, month, week_of_month = week_key
        month_names = {
            1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
            7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
        }
        return f'Semana {week_of_month} {month_names.get(month, "")} {year}'.strip()

    def _format_report_month_label(self, month_key):
        if not month_key:
            return 'Total mes'
        year, month = month_key
        month_names = {
            1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
            7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
        }
        return f'Total {month_names.get(month, "")} {year}'.strip()

    def _format_report_day_label(self, day_name, fecha_entrega=False):
        if not fecha_entrega:
            return escape(day_name or '')
        fecha_value = self._coerce_to_date(fecha_entrega)
        if not fecha_value:
            return escape(day_name or '')
        return (
            f'<span class="zrn_am_day_heading">{escape(day_name or "")}</span>'
            f'<span class="zrn_am_day_heading_date">Fecha de entrega: {escape(fecha_value.strftime("%d/%m/%Y"))}</span>'
        )

    def _get_report_group_sort_key(self, group_key, group_meta=None):
        fecha_value = self._coerce_to_date((group_meta or {}).get('fecha_entrega') or group_key)
        if fecha_value:
            return (0, fecha_value)
        order_map = {
            'Lunes': 0, 'Martes': 1, 'Miercoles': 2, 'Jueves': 3, 'Viernes': 4, 'Sabado': 5, 'Domingo': 6,
        }
        day_name = (group_meta or {}).get('day_name') or group_key
        return (1, order_map.get(day_name or '', 99), day_name or '')

    def _build_report_matrix_payload(self, candidate_lines):
        day_client_order = OrderedDict()
        day_meta_map = {}
        product_buckets = OrderedDict()

        # Let's get stock data for products in advance
        product_ids = candidate_lines.mapped('product_id').ids
        stock_data = {}
        StockQuant = self.env['stock.quant'] if 'stock.quant' in self.env else False
        if product_ids and StockQuant:
            grouped_quants = StockQuant.read_group(
                [('product_id', 'in', product_ids), ('location_id.usage', '=', 'internal')],
                ['product_id', 'available_quantity:sum', 'quantity:sum'],
                ['product_id'],
            )
            stock_data = {
                item['product_id'][0]: {
                    'stock_initial': item.get('quantity', 0.0),
                    'stock_free': item.get('available_quantity', 0.0),
                }
                for item in grouped_quants
                if item.get('product_id')
            }

        # Day names array in Spanish indexed by weekday() (0=Lunes, 6=Domingo)
        day_names_es_arr = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

        for line in candidate_lines:
            fecha_entrega = self._get_effective_line_date(line)
            if not fecha_entrega:
                continue
            day_date = fields.Date.to_string(fecha_entrega)
            weekday_idx = fecha_entrega.weekday()
            day_name = day_names_es_arr[weekday_idx] if 0 <= weekday_idx < 7 else 'Desconocido'
            day_key = day_date or day_name or ''
            
            client_name = line.order_id.partner_id.name or 'Punto de venta sin nombre'
            day_clients = day_client_order.setdefault(day_key, [])
            if client_name not in day_clients:
                day_clients.append(client_name)
            if day_key and day_key not in day_meta_map:
                day_meta_map[day_key] = {
                    'day_name': day_name,
                    'fecha_entrega': day_date,
                }

            product = line.product_id
            product_key = product.id or 0
            stock_info = stock_data.get(product.id, {})
            product_bucket = product_buckets.setdefault(product_key, {
                'barcode': product.barcode or '',
                'item_vm': product.default_code or '',
                'name': product.display_name or 'Producto sin nombre',
                'initial_inventory': float(stock_info.get('stock_initial', 0.0)),
                'week_total': 0.0,
                'by_day': {},
            })
            product_bucket['week_total'] += float(line.product_uom_qty or 0.0)

            day_bucket = product_bucket['by_day'].setdefault(day_key, {})
            day_bucket[client_name] = day_bucket.get(client_name, 0.0) + float(line.product_uom_qty or 0.0)

        sorted_days = sorted(
            day_client_order.keys(),
            key=lambda group_key: self._get_report_group_sort_key(group_key, day_meta_map.get(group_key)),
        )
        week_day_order = OrderedDict()
        for day_key in sorted_days:
            week_key = self._get_report_week_group_key((day_meta_map.get(day_key) or {}).get('fecha_entrega') or day_key)
            week_day_order.setdefault(week_key, []).append(day_key)

        month_week_order = OrderedDict()
        for week_key, week_days in week_day_order.items():
            month_key = False
            for day_key in week_days:
                month_key = self._get_report_month_group_key((day_meta_map.get(day_key) or {}).get('fecha_entrega') or day_key)
                if month_key:
                    break
            month_week_order.setdefault(month_key, []).append(week_key)

        week_display_meta = {
            week_key: {
                'days': week_days,
                'show_total': len(week_days) > 1,
            }
            for week_key, week_days in week_day_order.items()
        }
        month_display_meta = {
            month_key: {
                'weeks': month_weeks,
                'show_total': len(month_weeks) > 1,
            }
            for month_key, month_weeks in month_week_order.items()
        }

        return {
            'day_client_order': day_client_order,
            'day_meta_map': day_meta_map,
            'product_buckets': product_buckets,
            'week_day_order': week_day_order,
            'month_week_order': month_week_order,
            'week_display_meta': week_display_meta,
            'month_display_meta': month_display_meta,
        }

    def _build_report_html(self, candidate_lines):
        if not candidate_lines:
            return '<div class="zrn_am_report_empty">No hay ordenes de venta para mostrar con la seleccion actual.</div>'
        matrix = self._build_report_matrix_payload(candidate_lines)
        day_client_order = matrix['day_client_order']
        day_meta_map = matrix['day_meta_map']
        product_buckets = matrix['product_buckets']
        week_day_order = matrix['week_day_order']
        month_week_order = matrix['month_week_order']
        week_display_meta = matrix['week_display_meta']
        month_display_meta = matrix['month_display_meta']

        parts = [
            '<div class="zrn_am_report_matrix_wrap">',
            '<table class="zrn_am_report_matrix">',
            '<thead>',
            '<tr>',
            '<th class="zrn_am_sticky_col" rowspan="3">Cod. barra</th>',
            '<th class="zrn_am_sticky_col zrn_am_sticky_col_2" rowspan="3">Item MV</th>',
            '<th class="zrn_am_sticky_col zrn_am_sticky_col_3" rowspan="3">Producto</th>',
            f'<th colspan="3">Inventario al {escape(self._get_inventory_snapshot_label() or "")}</th>',
        ]

        for month_key, month_weeks in month_week_order.items():
            for week_key in month_weeks:
                week_days = week_day_order.get(week_key, [])
                for day_key in week_days:
                    day_meta = day_meta_map.get(day_key, {})
                    parts.append(
                        f'<th colspan="{len(day_client_order.get(day_key, [])) + 1}">{self._format_report_day_label(day_meta.get("day_name") or day_key, day_meta.get("fecha_entrega"))}</th>'
                    )
                if week_display_meta.get(week_key, {}).get('show_total'):
                    parts.append(f'<th class="zrn_am_week_total_head">{escape(self._format_report_week_label(week_key))}</th>')
            if month_display_meta.get(month_key, {}).get('show_total'):
                parts.append(f'<th class="zrn_am_month_total_head">{escape(self._format_report_month_label(month_key))}</th>')

        parts.extend([
            '</tr>',
            '<tr>',
            f'<th rowspan="2">Stock inicial al {escape(self._get_inventory_snapshot_label() or "")}</th>',
            f'<th rowspan="2">Total rango {escape(self._get_planning_range_label(candidate_lines))}</th>',
            f'<th rowspan="2">Stock final proyectado del rango</th>',
        ])

        for month_key, month_weeks in month_week_order.items():
            for week_key in month_weeks:
                week_days = week_day_order.get(week_key, [])
                for day_key in week_days:
                    for client_name in day_client_order.get(day_key, []):
                        parts.append(f'<th>{escape(client_name)}</th>')
                    parts.append('<th class="zrn_am_day_total_head">Ventas dia</th>')
                if week_display_meta.get(week_key, {}).get('show_total'):
                    parts.append('<th class="zrn_am_week_total_head zrn_am_week_total_title">Ventas semana</th>')
            if month_display_meta.get(month_key, {}).get('show_total'):
                parts.append('<th class="zrn_am_month_total_head zrn_am_month_total_title">Ventas mes</th>')

        parts.extend(['</tr>', '<tr>'])

        for month_key, month_weeks in month_week_order.items():
            for week_key in month_weeks:
                week_days = week_day_order.get(week_key, [])
                for day_key in week_days:
                    for _client_name in day_client_order.get(day_key, []):
                        parts.append('<th>OC</th>')
                    parts.append('<th class="zrn_am_day_total_head zrn_am_day_total_subhead">OC</th>')
                if week_display_meta.get(week_key, {}).get('show_total'):
                    parts.append('<th class="zrn_am_week_total_head zrn_am_week_total_subhead">OC</th>')
            if month_display_meta.get(month_key, {}).get('show_total'):
                parts.append('<th class="zrn_am_month_total_head zrn_am_month_total_subhead">OC</th>')

        parts.extend(['</tr>', '</thead>', '<tbody>'])

        for product_data in product_buckets.values():
            final_inventory = product_data['initial_inventory'] - product_data['week_total']
            
            # Formato condicional del inventario proyectado final
            if final_inventory < 0:
                final_class = 'zrn_am_num zrn_am_stock_shortage'
            elif final_inventory > 0:
                final_class = 'zrn_am_num zrn_am_stock_surplus'
            else:
                final_class = 'zrn_am_num zrn_am_stock_zero'
            
            # Atenuar stock inicial y total del rango si son cero
            initial_class = 'zrn_am_num zrn_am_num_zero' if product_data['initial_inventory'] == 0.0 else 'zrn_am_num'
            range_total_class = 'zrn_am_num zrn_am_num_zero' if product_data['week_total'] == 0.0 else 'zrn_am_num'

            parts.extend([
                '<tr>',
                f'<td class="zrn_am_sticky_col">{escape(product_data["barcode"])}</td>',
                f'<td class="zrn_am_sticky_col zrn_am_sticky_col_2">{escape(product_data["item_vm"])}</td>',
                f'<td class="zrn_am_sticky_col zrn_am_sticky_col_3 zrn_am_product_name">{escape(product_data["name"])}</td>',
                f'<td class="{initial_class}">{self._format_report_number(product_data["initial_inventory"])}</td>',
                f'<td class="{range_total_class}">{self._format_report_number(product_data["week_total"])}</td>',
                f'<td class="{final_class}">{self._format_report_number(final_inventory)}</td>',
            ])

            for month_key, month_weeks in month_week_order.items():
                month_total_oc = 0.0

                for week_key in month_weeks:
                    week_days = week_day_order.get(week_key, [])
                    week_total_oc = 0.0

                    for day_key in week_days:
                        day_total_oc = 0.0
                        day_values = product_data['by_day'].get(day_key, {})

                        for client_name in day_client_order.get(day_key, []):
                            sale_qty = float(day_values.get(client_name, 0.0))
                            day_total_oc += sale_qty
                            qty_class = 'zrn_am_num zrn_am_num_zero' if sale_qty == 0.0 else 'zrn_am_num'
                            parts.append(f'<td class="{qty_class}">{self._format_report_number(sale_qty)}</td>')

                        week_total_oc += day_total_oc
                        day_total_class = 'zrn_am_num zrn_am_day_total zrn_am_num_zero' if day_total_oc == 0.0 else 'zrn_am_num zrn_am_day_total'
                        parts.append(f'<td class="{day_total_class}">{self._format_report_number(day_total_oc)}</td>')

                    month_total_oc += week_total_oc
                    if week_display_meta.get(week_key, {}).get('show_total'):
                        week_total_class = 'zrn_am_num zrn_am_week_total zrn_am_num_zero' if week_total_oc == 0.0 else 'zrn_am_num zrn_am_week_total'
                        parts.append(f'<td class="{week_total_class}">{self._format_report_number(week_total_oc)}</td>')

                if month_display_meta.get(month_key, {}).get('show_total'):
                    month_total_class = 'zrn_am_num zrn_am_month_total zrn_am_num_zero' if month_total_oc == 0.0 else 'zrn_am_num zrn_am_month_total'
                    parts.append(f'<td class="{month_total_class}">{self._format_report_number(month_total_oc)}</td>')

            parts.append('</tr>')

        parts.extend(['</tbody>', '</table>', '</div>'])
        return ''.join(parts)


    def action_continue(self):
        self.ensure_one()
        candidate_lines = self._search_sale_lines_from_filters(
            self._get_filter_values(include_selected=True)
        )
        self._reset_report_payload()
        self._sync_report_customer_lines(candidate_lines)
        self._sync_report_product_lines(candidate_lines)
        self._sync_report_order_lines(candidate_lines)
        self.write({
            'report_ready': True,
            'report_active_tab': 'overview',
            'report_row_count': len(candidate_lines),
            'report_order_count': len(candidate_lines.mapped('order_id')),
            'report_customer_count': len(set(
                partner.id
                for partner in candidate_lines.mapped(lambda line: self._get_line_filter_partner(line))
                if partner
            )),
            'report_product_count': len(candidate_lines.mapped('product_id')),
            'report_total_units': sum(candidate_lines.mapped('product_uom_qty')),
            'report_delivered_units': sum(candidate_lines.mapped('qty_delivered')),
            'report_pending_units': sum(
                max(float(line.product_uom_qty or 0.0) - float(line.qty_delivered or 0.0), 0.0)
                for line in candidate_lines
            ),
            'report_completion_pct': (
                sum(candidate_lines.mapped('qty_delivered'))
                / sum(candidate_lines.mapped('product_uom_qty'))
                * 100
                if sum(candidate_lines.mapped('product_uom_qty'))
                else 0
            ),
            'report_chart_data': json.dumps([
                {
                    'name': line.product_id.display_name or 'Sin producto',
                    'units': line.total_units,
                    'pending': max(line.total_units - line.stock_free, 0.0),
                }
                for line in self.report_product_line_ids.sorted(
                    key=lambda item: item.total_units,
                    reverse=True,
                )[:12]
            ]),
            'report_html': self._build_report_html(candidate_lines),
        })
        date_range_payload = self._get_report_date_range_payload(candidate_lines)
        self.write({
            'report_date_range_label': date_range_payload['label'],
            'report_date_from_label': date_range_payload['from_label'],
            'report_date_to_label': date_range_payload['to_label'],
            'report_date_range_mode': date_range_payload['mode'],
        })
        return self.action_open_report()


class ZrnPlanningProductionPlanningCreatePlanWizard(models.TransientModel):
    _name = 'zrn_planning.production.planning.create.plan.wizard'
    _description = 'Confirmacion para crear planning de fabricacion'

    production_wizard_id = fields.Many2one(
        'zrn_planning.production.planning.wizard',
        string='Wizard de produccion',
        required=True,
        ondelete='cascade',
    )
    plan_name = fields.Char(
        string='Nombre del planning',
        default=lambda self: _('Planning de fabricacion %s') % fields.Date.today().strftime('%d/%m/%Y'),
        required=True,
    )
    plan_state = fields.Selection(
        [
            ('draft', 'Borrador'),
            ('pending_confirmation', 'Pendiente de confirmar'),
            ('approved', 'Confirmado'),
        ],
        string='Estado inicial',
        required=True,
        default='draft',
    )
    notes = fields.Text(string='Notas')
    report_date_range_label = fields.Char(
        string='Rango consultado',
        related='production_wizard_id.report_date_range_label',
        readonly=True,
    )
    report_date_from_label = fields.Char(
        string='Fecha inicial',
        related='production_wizard_id.report_date_from_label',
        readonly=True,
    )
    report_date_to_label = fields.Char(
        string='Fecha final',
        related='production_wizard_id.report_date_to_label',
        readonly=True,
    )
    report_date_range_mode = fields.Selection(
        related='production_wizard_id.report_date_range_mode',
        readonly=True,
    )
    report_customer_count = fields.Integer(
        string='Clientes',
        related='production_wizard_id.report_customer_count',
        readonly=True,
    )
    report_product_count = fields.Integer(
        string='Productos',
        related='production_wizard_id.report_product_count',
        readonly=True,
    )
    report_order_count = fields.Integer(
        string='OVs',
        related='production_wizard_id.report_order_count',
        readonly=True,
    )
    report_row_count = fields.Integer(
        string='Lineas',
        related='production_wizard_id.report_row_count',
        readonly=True,
    )
    planning_line_ids = fields.One2many(
        'zrn_planning.production.planning.create.plan.wizard.line',
        'wizard_id',
        string='Lineas del planning',
    )
    report_product_line_ids = fields.Many2many(
        'zrn_planning.production.planning.wizard.report.product.line',
        string='Productos del planning',
        compute='_compute_report_product_line_ids',
        readonly=True,
    )

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._sync_planning_line_ids()
        return records

    @api.depends('production_wizard_id', 'production_wizard_id.report_product_line_ids')
    def _compute_report_product_line_ids(self):
        for wizard in self:
            wizard.report_product_line_ids = [(6, 0, wizard.production_wizard_id.report_product_line_ids.ids)]

    def _sync_planning_line_ids(self):
        for wizard in self:
            wizard.planning_line_ids.unlink()
            if not wizard.production_wizard_id:
                continue
            candidate_lines = wizard.production_wizard_id._search_sale_lines_from_filters(
                wizard.production_wizard_id._get_filter_values(include_selected=True)
            )
            values = []
            for sequence, sale_line in enumerate(
                candidate_lines.sorted(
                    key=lambda line: (
                        wizard.production_wizard_id._get_effective_line_date(line) or fields.Date.today(),
                        line.order_id.name or '',
                        line.product_id.display_name or '',
                        line.id,
                    )
                ),
                start=1,
            ):
                delivery_date = wizard.production_wizard_id._get_effective_line_date(sale_line)
                planned_qty = max(float(sale_line.product_uom_qty or 0.0) - float(sale_line.qty_delivered or 0.0), 0.0)
                if planned_qty <= 0:
                    continue
                values.append({
                    'wizard_id': wizard.id,
                    'sequence': sequence * 10,
                    'sale_line_id': sale_line.id,
                    'order_id': sale_line.order_id.id,
                    'customer_id': (wizard.production_wizard_id._get_line_filter_partner(sale_line) or sale_line.order_id.partner_id).id,
                    'product_id': sale_line.product_id.id,
                    'default_code': sale_line.product_id.default_code or '',
                    'line_description': sale_line.name or sale_line.product_id.display_name or '',
                    'planned_qty': planned_qty,
                    'delivery_date': delivery_date,
                })
            if values:
                self.env['zrn_planning.production.planning.create.plan.wizard.line'].create(values)

    def action_save_plan(self):
        self.ensure_one()
        return self.production_wizard_id._create_mfg_plan(
            target_state=self.plan_state,
            notes=self.notes or False,
            plan_name=self.plan_name or False,
            planning_line_payload=[
                {
                    'sale_line_id': line.sale_line_id.id,
                    'order_name': line.order_id.name or '',
                    'product_name': line.product_id.display_name or '',
                    'planned_qty': line.planned_qty,
                    'production_date': line.production_date,
                    'delivery_date': line.delivery_date,
                }
                for line in self.planning_line_ids.sorted(key=lambda item: (item.sequence, item.id))
            ],
        )


class ZrnPlanningProductionPlanningCreatePlanWizardLine(models.TransientModel):
    _name = 'zrn_planning.production.planning.create.plan.wizard.line'
    _description = 'Linea operativa para crear planning de fabricacion'
    _order = 'sequence asc, id asc'

    wizard_id = fields.Many2one(
        'zrn_planning.production.planning.create.plan.wizard',
        string='Wizard',
        required=True,
        ondelete='cascade',
    )
    sequence = fields.Integer(string='Secuencia', default=10)
    sale_line_id = fields.Many2one('sale.order.line', string='Linea de venta', required=True)
    order_id = fields.Many2one('sale.order', string='OV', required=True)
    customer_id = fields.Many2one('res.partner', string='Punto de venta')
    product_id = fields.Many2one('product.product', string='Producto', required=True)
    default_code = fields.Char(string='Referencia')
    line_description = fields.Char(string='Descripcion')
    planned_qty = fields.Float(string='Cantidad planeada')
    delivery_date = fields.Date(string='Fecha de entrega')
    production_deadline = fields.Date(
        string='Fecha limite OF',
        compute='_compute_production_deadline',
        readonly=True,
    )
    production_date = fields.Date(string='Inicio OF')

    @api.depends('delivery_date')
    def _compute_production_deadline(self):
        for line in self:
            line.production_deadline = line.delivery_date - timedelta(days=1) if line.delivery_date else False


class ZrnPlanningProductionPlanningWizardReportCustomerLine(models.TransientModel):
    _name = 'zrn_planning.production.planning.wizard.report.customer.line'
    _description = 'Resumen de cliente del reporte de fabricacion'
    _order = 'first_delivery_date asc, partner_id'

    wizard_id = fields.Many2one(
        'zrn_planning.production.planning.wizard',
        string='Wizard',
        required=True,
        ondelete='cascade',
    )
    partner_id = fields.Many2one('res.partner', string='Punto de venta', required=True)
    customer_id = fields.Many2one('res.partner', string='Cliente')
    city = fields.Char(string='Ciudad')
    order_count = fields.Integer(string='OVs')
    line_count = fields.Integer(string='Lineas')
    product_count = fields.Integer(string='Productos')
    total_units = fields.Float(string='Unidades')
    first_delivery_date = fields.Date(string='Primera entrega')
    last_delivery_date = fields.Date(string='Ultima entrega')
    partner_image_1920 = fields.Binary(related='partner_id.image_1920', readonly=True)
    report_detail_sale_line_ids = fields.Many2many(
        'sale.order.line',
        string='Lineas incluidas',
        compute='_compute_report_detail_sale_line_ids',
        readonly=True,
    )

    @api.model
    def fields_get(self, allfields=None, attributes=None):
        fields_info = super().fields_get(allfields=allfields, attributes=attributes)
        if (
            not self.env.context.get('zrn_planning_clean_export_fields')
            or allfields not in (None, [])
        ):
            return fields_info
        allowed_fields = {
            'first_delivery_date',
            'last_delivery_date',
            'partner_id',
            'customer_id',
            'city',
            'order_count',
            'line_count',
            'product_count',
            'total_units',
        }
        return {
            field_name: field_data
            for field_name, field_data in fields_info.items()
            if field_name in allowed_fields
        }

    @api.depends('wizard_id', 'partner_id')
    def _compute_report_detail_sale_line_ids(self):
        for line in self:
            detail_lines = self.env['sale.order.line']
            if line.wizard_id and line.partner_id:
                candidate_lines = line.wizard_id._search_sale_lines_from_filters(
                    line.wizard_id._get_filter_values(include_selected=True)
                )
                detail_lines = candidate_lines.filtered(
                    lambda sale_line: line.wizard_id._get_line_filter_partner(sale_line) == line.partner_id
                )
            line.report_detail_sale_line_ids = [(6, 0, detail_lines.ids)]

    def action_return_to_report(self):
        self.ensure_one()
        return self.wizard_id.action_open_report()


class ZrnPlanningProductionPlanningWizardReportProductLine(models.TransientModel):
    _name = 'zrn_planning.production.planning.wizard.report.product.line'
    _description = 'Resumen de producto del reporte de fabricacion'
    _order = 'first_delivery_date asc, product_id'

    wizard_id = fields.Many2one(
        'zrn_planning.production.planning.wizard',
        string='Wizard',
        required=True,
        ondelete='cascade',
    )
    product_id = fields.Many2one('product.product', string='Producto', required=True)
    default_code = fields.Char(string='Referencia')
    categ_name = fields.Char(string='Categoria')
    customer_count = fields.Integer(string='Clientes')
    order_count = fields.Integer(string='OVs')
    line_count = fields.Integer(string='Lineas')
    total_units = fields.Float(string='Demanda total')
    stock_initial = fields.Float(string='Stock inicial')
    stock_free = fields.Float(string='Stock libre')
    suggested_production = fields.Float(string='Sugerido fabricar')
    projected_balance = fields.Float(string='Saldo proyectado')
    first_delivery_date = fields.Date(string='Primera entrega')
    last_delivery_date = fields.Date(string='Ultima entrega')
    product_image_1920 = fields.Binary(related='product_id.image_1920', readonly=True)
    report_detail_sale_line_ids = fields.Many2many(
        'sale.order.line',
        string='Lineas incluidas',
        compute='_compute_report_detail_sale_line_ids',
        readonly=True,
    )

    @api.model
    def fields_get(self, allfields=None, attributes=None):
        fields_info = super().fields_get(allfields=allfields, attributes=attributes)
        if (
            not self.env.context.get('zrn_planning_clean_export_fields')
            or allfields not in (None, [])
        ):
            return fields_info
        allowed_fields = {
            'first_delivery_date',
            'last_delivery_date',
            'product_id',
            'default_code',
            'categ_name',
            'customer_count',
            'order_count',
            'line_count',
            'total_units',
            'stock_initial',
            'stock_free',
            'suggested_production',
            'projected_balance',
        }
        return {
            field_name: field_data
            for field_name, field_data in fields_info.items()
            if field_name in allowed_fields
        }

    @api.depends('wizard_id', 'product_id')
    def _compute_report_detail_sale_line_ids(self):
        for line in self:
            detail_lines = self.env['sale.order.line']
            if line.wizard_id and line.product_id:
                candidate_lines = line.wizard_id._search_sale_lines_from_filters(
                    line.wizard_id._get_filter_values(include_selected=True)
                )
                detail_lines = candidate_lines.filtered(
                    lambda sale_line: sale_line.product_id == line.product_id
                )
            line.report_detail_sale_line_ids = [(6, 0, detail_lines.ids)]

    def action_return_to_report(self):
        self.ensure_one()
        return self.wizard_id.action_open_report()

    def action_open_mrp_production_create(self):
        self.ensure_one()
        return self.wizard_id.action_open_mrp_production_create(
            self.product_id.id,
            self.suggested_production,
        )


class ZrnPlanningProductionPlanningWizardReportOrderLine(models.TransientModel):
    _name = 'zrn_planning.production.planning.wizard.report.order.line'
    _description = 'Resumen de OV del reporte de fabricacion'
    _order = 'first_delivery_date asc, order_id'

    wizard_id = fields.Many2one(
        'zrn_planning.production.planning.wizard',
        string='Wizard',
        required=True,
        ondelete='cascade',
    )
    order_id = fields.Many2one('sale.order', string='Orden de venta', required=True)
    customer_id = fields.Many2one('res.partner', string='Punto de venta')
    state = fields.Char(string='Estado tecnico')
    state_label = fields.Char(string='Estado')
    product_count = fields.Integer(string='Productos')
    line_count = fields.Integer(string='Lineas')
    total_units = fields.Float(string='Unidades')
    first_delivery_date = fields.Date(string='Primera entrega')
    last_delivery_date = fields.Date(string='Ultima entrega')
    report_detail_sale_line_ids = fields.Many2many(
        'sale.order.line',
        string='Lineas incluidas',
        compute='_compute_report_detail_sale_line_ids',
        readonly=True,
    )

    @api.model
    def fields_get(self, allfields=None, attributes=None):
        fields_info = super().fields_get(allfields=allfields, attributes=attributes)
        if (
            not self.env.context.get('zrn_planning_clean_export_fields')
            or allfields not in (None, [])
        ):
            return fields_info
        allowed_fields = {
            'first_delivery_date',
            'last_delivery_date',
            'order_id',
            'customer_id',
            'state_label',
            'product_count',
            'line_count',
            'total_units',
        }
        return {
            field_name: field_data
            for field_name, field_data in fields_info.items()
            if field_name in allowed_fields
        }

    @api.depends('wizard_id', 'order_id')
    def _compute_report_detail_sale_line_ids(self):
        for line in self:
            detail_lines = self.env['sale.order.line']
            if line.wizard_id and line.order_id:
                candidate_lines = line.wizard_id._search_sale_lines_from_filters(
                    line.wizard_id._get_filter_values(include_selected=True)
                )
                detail_lines = candidate_lines.filtered(
                    lambda sale_line: sale_line.order_id == line.order_id
                )
            line.report_detail_sale_line_ids = [(6, 0, detail_lines.ids)]

    def action_return_to_report(self):
        self.ensure_one()
        return self.wizard_id.action_open_report()
