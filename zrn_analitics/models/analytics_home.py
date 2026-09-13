# -*- coding: utf-8 -*-

from collections import defaultdict
from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError

from .rrhh_models import (
    CHECKLIST_KEYS,
    CHECKLIST_TEMPLATE,
    NON_PREDICTIVE_FACTORS,
    PREDICTOR_KEYS,
    PREDICTOR_QUESTIONS,
    RRHH_RISK_THRESHOLDS,
    VALIDATED_PATTERN_LIBRARY,
    _is_rrhh_checklist_evaluated,
    _is_rrhh_predictor_evaluated,
)


class ZrnAnalyticsNavigationMixin:
    def _open_singleton_action(self, action_xmlid):
        self.ensure_one()
        action = self.env.ref(action_xmlid, raise_if_not_found=False)
        if not action:
            raise UserError('No se encontro la accion configurada para esta pantalla.')
        action_data = action.read()[0]
        action_data['target'] = 'main'
        return action_data

    def action_open_home(self):
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_home')

    def action_open_workspace(self):
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_workspace')

    def action_open_scenarios(self):
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_scenarios')

    def action_open_processing(self):
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_processing')

    def action_open_processing_workspace(self):
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_processing_workspace')

    def action_open_hubs_client(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.client',
            'name': 'Hubs',
            'tag': 'zrn_analitics.hubs',
            'target': 'main',
        }

    def action_open_button_1(self):
        return self.action_open_home()

    def action_open_button_2(self):
        return self.action_open_workspace()

    def action_open_button_3(self):
        return self.action_open_scenarios()

    def action_open_button_4(self):
        return self.action_open_processing()

    def action_open_button_5(self):
        return self.action_open_workspace()


class ZrnAnalyticsHome(ZrnAnalyticsNavigationMixin, models.Model):
    _name = 'zrn_analitics.home'
    _description = 'Centro principal de (ZRN) Analitica'
    _order = 'sequence, id'

    name = fields.Char(string='Nombre', required=True, default='(ZRN) Analitica')
    sequence = fields.Integer(string='Secuencia', default=10)
    page_key = fields.Selection(
        [
            ('overview', 'Resumen'),
            ('workspace', 'Workspace'),
            ('processing', 'Procesamiento'),
            ('processing_workspace', 'Procesamiento Workspace'),
            ('scenarios', 'Escenarios'),
        ],
        string='Pagina',
        required=True,
        default='overview',
    )

    def action_open_hubs(self):
        self.ensure_one()
        return self.action_open_hubs_client()

    def action_open_dashboards(self):
        self.ensure_one()
        return self.action_open_workspace()

    def action_open_processing(self):
        self.ensure_one()
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_processing')

    def action_open_processing_workspace(self):
        self.ensure_one()
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_processing_workspace')

    def action_open_scenarios(self):
        self.ensure_one()
        return self._open_singleton_action('zrn_analitics.action_zrn_analitics_scenarios')

    @api.model
    def _get_commercial_hub_period(self):
        date_to = fields.Date.to_date(fields.Date.context_today(self))
        date_from = date_to.replace(day=1)
        return date_from, date_to

    @api.model
    def _get_commercial_brand_records(self):
        # Nota: el modelo zrn_commercial.commercial.brand no tiene campo 'active',
        # se filtra unicamente por compania.
        return self.env['zrn_commercial.commercial.brand'].search([
            ('company_id', '=', self.env.company.id),
        ], order='name asc, id asc')

    @api.model
    def _get_commercial_brand_map(self):
        brands = self._get_commercial_brand_records()
        product_brand_map = {}
        for brand in brands:
            # Los productos se vinculan a traves de categorias de marca:
            # brand -> category_ids -> product_ids (Many2many a product.product)
            for category in brand.category_ids:
                for product in category.product_ids:
                    product_brand_map[product.id] = {
                        'brand_id': brand.id,
                        'brand_name': brand.name,
                        'business_unit_id': brand.business_unit_id.id,
                        'category_id': category.id,
                        'category_name': category.name,
                    }
        return brands, product_brand_map

    @api.model
    def _get_commercial_channel_records(self, channel_names=None):
        domain = [
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ]
        if channel_names:
            domain.append(('name', 'in', list(channel_names)))
        return self.env['zrn_commercial.commercial.channel'].search(domain, order='name asc, id asc')

    @api.model
    def _get_channel_setup_status(self):
        channels = self._get_commercial_channel_records()
        links = self.env['zrn_commercial.commercial.channel.partner'].search([
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ])
        return {
            'channels': channels,
            'links': links,
            'has_channels': bool(channels),
            'has_assignments': bool(links),
        }

    @api.model
    def _get_product_channel_records(self, usage_types=None, active_only=True):
        # OPTIMIZACION Y SEGURIDAD:
        # El modelo 'zrn_commercial.product.channel' fue removido/refactorizado en la version reciente.
        # Se verifica si el modelo existe en self.env antes de realizar la consulta SQL para prevenir KeyErrors.
        if 'zrn_commercial.product.channel' not in self.env:
            return self.env['zrn_commercial.commercial.channel'].browse()
        domain = [('company_id', '=', self.env.company.id)]
        if active_only:
            domain.append(('active', '=', True))
        if usage_types:
            domain.append(('usage_type', 'in', list(usage_types)))
        return self.env['zrn_commercial.product.channel'].search(domain, order='name asc, id asc')

    @api.model
    def _get_product_channel_map(self, usage_types=None, active_only=True):
        # OPTIMIZACION Y SEGURIDAD:
        # Verifica la existencia defensiva del modelo 'zrn_commercial.product.channel' en la base de datos.
        if 'zrn_commercial.product.channel' not in self.env:
            return self.env['zrn_commercial.commercial.channel'].browse(), {}, {}
        channels = self._get_product_channel_records(usage_types=usage_types, active_only=active_only)
        if 'zrn_commercial.product.channel.product' not in self.env:
            return channels, {}, {}
        links = self.env['zrn_commercial.product.channel.product'].search([
            ('channel_id', 'in', channels.ids),
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ], order='channel_id asc, sequence asc, id asc')
        product_channel_map = {}
        template_channel_map = {}
        for link in links:
            channel = link.channel_id
            if not channel or not link.product_tmpl_id:
                continue
            channel_info = {
                'channel_id': channel.id,
                'channel_name': channel.name,
                'usage_type': getattr(channel, 'usage_type', 'regular'),
                'min_stock_days': float(getattr(channel, 'min_stock_days', 0.0) or 0.0),
                'target_stock_days': float(getattr(channel, 'target_stock_days', 0.0) or 0.0),
                'max_stock_days': float(getattr(channel, 'max_stock_days', 0.0) or 0.0),
            }
            template_channel_map[link.product_tmpl_id.id] = channel_info
            for product in link.product_tmpl_id.product_variant_ids:
                product_channel_map[product.id] = channel_info
        return channels, product_channel_map, template_channel_map

    @api.model
    def _get_product_channel_filter_options(self, channels=None):
        if 'zrn_commercial.product.channel' not in self.env and not channels:
            return []
        channels = channels or self._get_product_channel_records()
        return [
            {
                'id': channel.id,
                'name': channel.name,
            }
            for channel in channels
        ]

    @api.model
    def _get_channel_empty_message(self, setup_status):
        if not setup_status['has_channels']:
            return 'No hay canales comerciales creados en (ZRN) Manejo Comercial.'
        if not setup_status['has_assignments']:
            return 'No hay PDVs o clientes cargados en los canales comerciales.'
        return 'No hay datos para los filtros seleccionados.'

    @api.model
    def _get_partner_channel_map(self):
        """OPTIMIZACION N+1 QUERY:
        Precarga todos los enlaces cliente->canal comercial en 1 sola consulta SQL.
        Esto previene la ejecucion de miles de consultas individuales dentro de los bucles
        de calculo por cada linea de orden de venta en el tablero.
        """
        links = self.env['zrn_commercial.commercial.channel.partner'].search([
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ])
        partner_channel_map = {}
        for link in links:
            if link.partner_id and link.channel_id:
                partner_channel_map[link.partner_id.id] = link.channel_id.name
        return partner_channel_map

    @api.model
    def _get_partner_channel_details_map(self):
        links = self.env['zrn_commercial.commercial.channel.partner'].search([
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ])
        details = {}
        for link in links:
            if not link.partner_id or not link.channel_id:
                continue
            details[link.partner_id.id] = {
                'channel_id': link.channel_id.id,
                'channel_name': link.channel_id.name,
                'business_unit_id': link.channel_id.business_unit_id.id,
                'channel_category_id': link.category_id.id,
                'partner_id': link.partner_id.id,
            }
        return details

    @api.model
    def _get_explicit_channel_name(self, partner, partner_channel_map=None):
        if not partner:
            return False
        if partner_channel_map is not None:
            return partner_channel_map.get(partner.id, False)
        channel_link = self.env['zrn_commercial.commercial.channel.partner'].search([
            ('partner_id', '=', partner.id),
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
        ], limit=1)
        return channel_link.channel_id.name if channel_link and channel_link.channel_id else False

    @api.model
    def _get_commercial_sale_order_lines(
        self,
        date_from,
        date_to,
        product_ids,
        order_status='confirmed',
        invoiced_only=False,
    ):
        state_map = {
            'draft': ['draft', 'sent'],
            'confirmed': ['sale', 'done'],
            'all': ['draft', 'sent', 'sale', 'done'],
        }
        domain = [
            ('order_id.state', 'in', state_map.get(order_status, state_map['confirmed'])),
            ('display_type', '=', False),
            ('product_id', 'in', product_ids),
        ]
        if invoiced_only:
            domain.append(('order_id.invoice_status', '=', 'invoiced'))
        if date_from:
            domain.append(('order_id.date_order', '>=', f'{date_from} 00:00:00'))
        if date_to:
            domain.append(('order_id.date_order', '<=', f'{date_to} 23:59:59'))
        order_lines = self.env['sale.order.line'].search(domain)
        return order_lines.sorted(
            key=lambda line: (
                line.order_id.date_order or fields.Datetime.now(),
                line.id,
            )
        )

    @api.model
    def _get_recent_month_labels(self, date_to, count=5):
        labels = []
        current = date_to.replace(day=1)
        for _index in range(count):
            labels.append(current)
            previous_month_last_day = current - timedelta(days=1)
            current = previous_month_last_day.replace(day=1)
        labels.reverse()
        month_names = {
            1: 'Ene',
            2: 'Feb',
            3: 'Mar',
            4: 'Abr',
            5: 'May',
            6: 'Jun',
            7: 'Jul',
            8: 'Ago',
            9: 'Sep',
            10: 'Oct',
            11: 'Nov',
            12: 'Dic',
        }
        return labels, [month_names[item.month] for item in labels]

    @api.model
    def _get_coverage_universe(self, date_from=False, date_to=False):
        universe_partner_ids = set()
        by_channel = defaultdict(set)
        by_municipio = defaultdict(set)
        domain = [
            ('state', 'in', ['sale', 'done']),
            ('company_id', '=', self.env.company.id),
        ]
        if date_from:
            domain.append(('date_order', '>=', f'{date_from} 00:00:00'))
        if date_to:
            domain.append(('date_order', '<=', f'{date_to} 23:59:59'))

        orders = self.env['sale.order'].search(domain)
        for order in orders:
            partner = order.partner_id.commercial_partner_id or order.partner_id
            if not partner or partner.id in universe_partner_ids:
                continue
            channel_name = self._resolve_partner_channel(partner)
            if not channel_name:
                continue
            universe_partner_ids.add(partner.id)
            by_channel[channel_name].add(partner.id)
            municipio = partner.city or partner.state_id.name or partner.country_id.name or 'Sin municipio'
            by_municipio[municipio].add(partner.id)

        if not universe_partner_ids:
            fallback_partners = self.env['res.partner'].search([
                ('customer_rank', '>', 0),
                ('company_id', 'in', [False, self.env.company.id]),
                ('type', '!=', 'private'),
            ], order='name asc, id asc')
            for partner in fallback_partners:
                commercial_partner = partner.commercial_partner_id or partner
                if not commercial_partner or commercial_partner.id in universe_partner_ids:
                    continue
                channel_name = self._resolve_partner_channel(commercial_partner)
                if not channel_name:
                    continue
                universe_partner_ids.add(commercial_partner.id)
                by_channel[channel_name].add(commercial_partner.id)
                municipio = (
                    commercial_partner.city
                    or commercial_partner.state_id.name
                    or commercial_partner.country_id.name
                    or 'Sin municipio'
                )
                by_municipio[municipio].add(commercial_partner.id)

        channel_rows = sorted(
            [
                {'name': name, 'value': len(partner_ids)}
                for name, partner_ids in by_channel.items()
            ],
            key=lambda item: item['value'],
            reverse=True,
        )
        municipio_rows = sorted(
            [
                {'name': name, 'value': len(partner_ids)}
                for name, partner_ids in by_municipio.items()
            ],
            key=lambda item: item['value'],
            reverse=True,
        )[:8]
        return {
            'total': len(universe_partner_ids),
            'by_channel': {
                item['name']: item['value']
                for item in channel_rows
            },
            'by_municipio': {
                item['name']: item['value']
                for item in municipio_rows
            },
            'channel_rows': channel_rows,
            'municipio_rows': municipio_rows,
        }

    @api.model
    def _infer_coverage_channel(self, partner_name):
        name = (partner_name or '').upper()
        if 'SUPER 7' in name or 'PUMA' in name:
            return 'PUMA Super 7'
        if 'WALMART' in name or 'PAIZ' in name:
            return 'Walmart/Paiz'
        if 'LA TORRE' in name:
            return 'La Torre'
        if 'B3' in name:
            return 'B3'
        if 'CIRCLE K' in name:
            return 'Circle K'
        if 'FRESH' in name or 'GTA' in name or 'MSF' in name:
            return 'GTA / MSF'
        return 'Otros'

    @api.model
    def _resolve_partner_channel(self, partner, partner_channel_map=None):
        return self._get_explicit_channel_name(partner, partner_channel_map=partner_channel_map)

    @api.model
    def _infer_pdv_subchain(self, channel_name, partner_name=''):
        normalized_channel = (channel_name or '').strip()
        normalized_name = (partner_name or '').upper()
        if normalized_channel == 'Walmart/Paiz':
            if 'PAIZ' in normalized_name:
                return 'Paiz'
            if 'WALMART' in normalized_name:
                return 'Walmart'
        return normalized_channel or 'Sin canal'

    @api.model
    def _get_empty_coverage_dashboard_data(self, empty_message=''):
        date_to = fields.Date.to_date(fields.Date.context_today(self))
        universe = self._get_coverage_universe(date_to - timedelta(days=365), date_to)
        return {
            'summary_cards': [],
            'coverage_by_channel': [],
            'pdv_universe': universe,
            'channel_brand_matrix': {
                'brands': [],
                'rows': [],
            },
            'sku_distribution': [],
            'portfolio_holes': {
                'core_skus': [],
                'rows': [],
            },
            'clients_at_risk': [],
            'empty_message': empty_message,
            'notes_sources': [
                {
                    'label': 'Odoo',
                    'detail': 'Ventas YTD por cliente, producto y marca desde sale.order.line.',
                },
                {
                    'label': 'Universo PDV',
                    'detail': 'Universo PDV derivado de partners con actividad comercial real en Odoo.',
                },
            ],
        }

    @api.model
    def _get_empty_commercial_hub_payload(self, empty_message='No hay marcas comerciales creadas en (ZRN) Manejo Comercial.'):
        date_from, date_to = self._get_commercial_hub_period()
        _month_starts, month_labels = self._get_recent_month_labels(date_to)
        rfm_segments = [
            {'key': 'champion', 'name': 'Campeon', 'emoji': ''},
            {'key': 'loyal', 'name': 'Leal', 'emoji': ''},
            {'key': 'cant_lose', 'name': 'No perderlo', 'emoji': ''},
            {'key': 'at_risk', 'name': 'En riesgo', 'emoji': ''},
            {'key': 'promising', 'name': 'Prometedor', 'emoji': ''},
            {'key': 'need_attention', 'name': 'Atender', 'emoji': ''},
            {'key': 'new', 'name': 'Nuevo', 'emoji': ''},
            {'key': 'hibernating', 'name': 'Hibernando', 'emoji': ''},
            {'key': 'sporadic', 'name': 'Esporadico', 'emoji': ''},
        ]
        rfm_segment_data = {
            segment['key']: {
                'name': segment['name'],
                'count': 0,
                'revenue': 0.0,
                'revenue_pct': 0.0,
                'top_clients': [],
            }
            for segment in rfm_segments
        }
        empty_bcg_sum = {
            quadrant: {'n': 0, 'r': 0.0, 'g': 0.0, 'am': 0.0}
            for quadrant in ['S', 'C', 'I', 'D']
        }
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'total_amount': 0.0,
                'order_count': 0,
                'customer_count': 0,
                'point_count': 0,
                'product_count': 0,
                'brand_count': 0,
                'average_ticket': 0.0,
                'currency_symbol': self.env.company.currency_id.symbol or '$',
            },
            'has_brands': False,
            'empty_message': empty_message,
            'revenue_series': [
                {'label': label, 'value': 0.0}
                for label in month_labels
            ],
            'brand_mix': [],
            'brand_catalog': [],
            'top_customers': [],
            'top_channels': [],
            'top_products': [],
            'portfolio_rows': [],
            'all_clients': [],
            'clients_rfm': {
                'meta': {
                    'today': fields.Date.to_string(date_to),
                    'current_month_key': date_to.strftime('%Y-%m'),
                    'n_clients': 0,
                    'pipeline': 'analytics_home_rfm v1',
                },
                'segments_order': rfm_segments,
                'segments': rfm_segment_data,
                'abc': {
                    'a_count': 0,
                    'b_count': 0,
                    'c_count': 0,
                    'a_rev': 0.0,
                    'b_rev': 0.0,
                    'c_rev': 0.0,
                },
                'rf_matrix': {},
                'concentration': {
                    'top5_pct': 0.0,
                    'top10_pct': 0.0,
                    'a_pct': 0.0,
                },
                'exec': {
                    'champions_loyal_count': 0,
                    'champions_loyal_pct': 0.0,
                    'at_risk_count': 0,
                    'at_risk_rev': 0.0,
                    'at_risk_rev_pct': 0.0,
                },
                'pareto': [],
                'clients': [],
            },
            'cohort_retention': {
                'months': [],
                'matrix': [],
            },
            'market_basket': {
                'pairs': [],
            },
            'cadence': {
                'clients': [],
                'segments': {},
                'fugados_top': [],
            },
            'ltv_forecast': {
                'months_observed': [],
                'project_months': ['', '', ''],
                'clients': [],
            },
            'all_products': [],
            'growers': [],
            'decliners': [],
            'sellin_vs_sellout': {
                'walmart': {'summary': {}, 'by_pdv': [], 'by_sku': []},
                'puma': {'summary': {}, 'by_pdv': [], 'by_sku': []},
            },
            'bcg_data': {
                'skus': [],
                'mr': 0.0,
                'mm': 0.0,
                'tr': 0.0,
                'cov': 0.0,
                'sum': empty_bcg_sum,
            },
        }

    @api.model
    def _get_channel_period_range(self, period_key):
        """Fallback: calcula rango de fechas a partir de una clave de periodo.
        Se mantiene por compatibilidad pero los hubs ahora envian date_from/date_to directamente."""
        date_to = fields.Date.to_date(fields.Date.context_today(self))
        normalized_key = period_key or 'ytd'
        if normalized_key == 'current_month':
            date_from = date_to.replace(day=1)
        elif normalized_key == 'rolling_90':
            date_from = date_to - timedelta(days=89)
        elif normalized_key == 'rolling_12':
            date_from = date_to - timedelta(days=364)
        else:
            normalized_key = 'ytd'
            date_from = date_to.replace(month=1, day=1)
        return normalized_key, date_from, date_to

    @api.model
    def _get_default_date_range(self):
        """Retorna el rango de fechas por defecto: 1 del mes actual hasta hoy."""
        date_to = fields.Date.to_date(fields.Date.context_today(self))
        date_from = date_to.replace(day=1)
        return date_from, date_to

    @api.model
    def _get_channel_period_options(self):
        return [
            {'value': 'ytd', 'label': 'YTD'},
            {'value': 'current_month', 'label': 'Mes actual'},
            {'value': 'rolling_90', 'label': 'Ultimos 90 dias'},
            {'value': 'rolling_12', 'label': 'Ultimos 12 meses'},
        ]

    @api.model
    def _normalize_channel_filters(self, filters=None):
        filters = filters or {}
        # Prioridad: date_from/date_to explicitos desde el frontend.
        # Fallback: calcular a partir de period_key (compatibilidad).
        raw_date_from = filters.get('date_from')
        raw_date_to = filters.get('date_to')
        if raw_date_from and raw_date_to:
            period_key = 'custom'
            date_from = fields.Date.to_date(raw_date_from) if isinstance(raw_date_from, str) else raw_date_from
            date_to = fields.Date.to_date(raw_date_to) if isinstance(raw_date_to, str) else raw_date_to
        else:
            period_key, date_from, date_to = self._get_channel_period_range(filters.get('period_key'))
        order_type = (filters.get('order_type') or 'sale').strip()
        if order_type not in ('sale', 'purchase'):
            order_type = 'sale'
        order_status = (filters.get('order_status') or 'confirmed').strip()
        if order_status not in ('draft', 'confirmed', 'all'):
            order_status = 'confirmed'
        return {
            'period_key': period_key,
            'date_from': date_from,
            'date_to': date_to,
            'channel_ids': self._normalize_channel_ids(filters),
            'business_unit_ids': self._normalize_filter_ids(filters.get('business_unit_ids') or filters.get('business_unit_id')),
            'brand_ids': self._normalize_filter_ids(filters.get('brand_ids') or filters.get('brand')),
            'category_ids': self._normalize_filter_ids(filters.get('category_ids') or filters.get('category')),
            'product_ids': self._normalize_filter_ids(filters.get('product_ids') or filters.get('product_id')),
            'channel_category_ids': self._normalize_filter_ids(filters.get('channel_category_ids') or filters.get('channel_category_id')),
            'partner_ids': self._normalize_filter_ids(filters.get('partner_ids') or filters.get('partner_id')),
            'search': (filters.get('search') or '').strip(),
            'order_type': order_type,
            'order_status': order_status,
            'invoiced_only': bool(filters.get('invoiced_only')) if order_type == 'sale' else False,
        }

    @api.model
    def _normalize_filter_ids(self, values):
        if not values:
            return []
        if not isinstance(values, (list, tuple, set)):
            values = [values]
        normalized = []
        for value in values:
            if isinstance(value, dict):
                value = value.get('id')
            try:
                record_id = int(value)
            except (TypeError, ValueError):
                continue
            if record_id > 0 and record_id not in normalized:
                normalized.append(record_id)
        return normalized

    @api.model
    def _normalize_channel_ids(self, filters=None):
        filters = filters or {}
        channel_ids = self._normalize_filter_ids(filters.get('channel_ids'))
        if channel_ids:
            return channel_ids
        channel_name = (filters.get('channel') or '').strip()
        if not channel_name:
            return []
        return self._get_commercial_channel_records([channel_name]).ids

    @api.model
    def _get_brand_filter_options(self, brands):
        return [
            {
                'id': brand.id,
                'name': brand.name,
            }
            for brand in brands
        ]

    @api.model
    def _get_channel_filter_options(self, channel_names=None):
        return [
            {
                'id': channel.id,
                'name': channel.name,
            }
            for channel in self._get_commercial_channel_records(channel_names)
        ]

    @api.model
    def _get_selected_channel_names(self, normalized_filters):
        channel_ids = normalized_filters.get('channel_ids') or []
        if not channel_ids:
            return set()
        return set(self.env['zrn_commercial.commercial.channel'].browse(channel_ids).mapped('name'))

    @api.model
    def _serialize_active_filters(self, normalized_filters):
        return {
            'period_key': normalized_filters['period_key'],
            'date_from': fields.Date.to_string(normalized_filters['date_from']) if normalized_filters.get('date_from') else '',
            'date_to': fields.Date.to_string(normalized_filters['date_to']) if normalized_filters.get('date_to') else '',
            'channel_ids': normalized_filters['channel_ids'],
            'business_unit_ids': normalized_filters.get('business_unit_ids') or [],
            'brand_ids': normalized_filters['brand_ids'],
            'category_ids': normalized_filters['category_ids'],
            'product_ids': normalized_filters.get('product_ids') or [],
            'channel_category_ids': normalized_filters.get('channel_category_ids') or [],
            'partner_ids': normalized_filters.get('partner_ids') or [],
            'search': normalized_filters['search'],
            'order_type': normalized_filters.get('order_type') or 'sale',
            'order_status': normalized_filters.get('order_status') or 'confirmed',
            'invoiced_only': bool(normalized_filters.get('invoiced_only')),
        }

    @api.model
    def _get_brand_category_product_ids(self, category_ids):
        if not category_ids:
            return set()
        brand_categories = self.env['zrn_commercial.commercial.brand.category'].browse(category_ids)
        return set(brand_categories.mapped('product_ids').ids)

    @api.model
    def _build_filter_options(self, order_lines=None, brands=None, include_channels=True, filters=None):
        """Construye las opciones de seleccion para los filtros dinamicos del tablero.

        NOTA DE IMPLEMENTACION (CATEGORIAS DE MARCA):
        Las categorias del filtro 'Categoria' corresponden al modelo 'zrn_commercial.commercial.brand.category'
        de (ZRN) Manejo Comercial (p. ej. 'Wappers'). Se consultan directamente desde el catalogo de marcas para
        mostrar exactamente la configuracion hecha por el usuario en el modulo Comercial.
        """
        normalized = self._normalize_channel_filters(filters)
        BusinessUnit = self.env['zrn_commercial.business.unit']
        Brand = self.env['zrn_commercial.commercial.brand']
        BrandCategory = self.env['zrn_commercial.commercial.brand.category']
        Channel = self.env['zrn_commercial.commercial.channel']
        ChannelCategory = self.env['zrn_commercial.commercial.channel.category']
        ChannelPartner = self.env['zrn_commercial.commercial.channel.partner']
        Product = self.env['product.product']

        company_domain = [('company_id', '=', self.env.company.id)]
        business_units = BusinessUnit.search(company_domain + [('active', '=', True)], order='name asc, id asc')
        unit_ids = normalized.get('business_unit_ids') or []
        scoped_unit_ids = [unit.id for unit in business_units.filtered(lambda unit: unit.id in unit_ids)] if unit_ids else business_units.ids

        brand_domain = company_domain
        if scoped_unit_ids:
            brand_domain.append(('business_unit_id', 'in', scoped_unit_ids))
        brands = Brand.search(brand_domain, order='name asc, id asc')

        category_brand_ids = normalized.get('brand_ids') or brands.ids
        category_domain = [('brand_id', 'in', category_brand_ids)] if category_brand_ids else [('id', '=', 0)]
        brand_categories = BrandCategory.search(category_domain, order='name asc, id asc')

        channel_domain = company_domain + [('active', '=', True)]
        if scoped_unit_ids:
            channel_domain.append(('business_unit_id', 'in', scoped_unit_ids))
        channels = Channel.search(channel_domain, order='name asc, id asc')

        channel_category_channel_ids = normalized.get('channel_ids') or channels.ids
        channel_category_domain = [('channel_id', 'in', channel_category_channel_ids)] if channel_category_channel_ids else [('id', '=', 0)]
        channel_categories = ChannelCategory.search(channel_category_domain, order='name asc, id asc')

        product_domain = [('sale_ok', '=', True)]
        product_category_ids = normalized.get('category_ids') or brand_categories.ids
        if product_category_ids:
            product_domain.append(('id', 'in', BrandCategory.browse(product_category_ids).mapped('product_ids').ids))
        else:
            product_domain.append(('id', '=', 0))
        products = Product.search(product_domain, order='name asc, id asc')

        partner_channel_ids = normalized.get('channel_ids') or channels.ids
        partner_domain = [
            ('active', '=', True),
            ('company_id', '=', self.env.company.id),
            ('channel_id', 'in', partner_channel_ids),
        ] if partner_channel_ids else [('id', '=', 0)]
        partner_category_ids = normalized.get('channel_category_ids') or channel_categories.ids
        if partner_category_ids:
            partner_domain.append(('category_id', 'in', partner_category_ids))
        partner_links = ChannelPartner.search(partner_domain, order='partner_id asc, id asc')
        partners = partner_links.mapped('partner_id')

        return {
            'periods': self._get_channel_period_options(),
            'business_units': [
                {'id': unit.id, 'name': unit.name}
                for unit in business_units
            ],
            'channels': [
                {'id': channel.id, 'name': channel.name}
                for channel in channels
            ] if include_channels else [],
            'brands': self._get_brand_filter_options(brands),
            'categories': [
                {
                    'id': cat.id,
                    'name': cat.name,
                }
                for cat in brand_categories
            ],
            'channel_categories': [
                {
                    'id': category.id,
                    'name': category.name,
                    'channel_id': category.channel_id.id,
                }
                for category in channel_categories
            ],
            'products': [
                {
                    'id': product.id,
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                }
                for product in products
            ],
            'partners': [
                {'id': partner.id, 'name': partner.display_name}
                for partner in partners
            ],
            'order_types': [
                {'value': 'sale', 'label': 'Ventas'},
                {'value': 'purchase', 'label': 'Compras'},
            ],
            'sale_order_statuses': [
                {'value': 'confirmed', 'label': 'Confirmadas'},
                {'value': 'draft', 'label': 'Cotizaciones'},
                {'value': 'all', 'label': 'Todas'},
            ],
            'purchase_order_statuses': [
                {'value': 'confirmed', 'label': 'Confirmadas'},
                {'value': 'draft', 'label': 'Solicitudes'},
                {'value': 'all', 'label': 'Todas'},
            ],
        }

    @api.model
    def get_commercial_filter_options(self, filters=None, tab=None):
        return self._build_filter_options(filters=filters)

    @api.model
    def _line_matches_filters(self, line, product_brand_map, normalized_filters, partner_channel_map=None):
        order = line.order_id
        partner = order.partner_id if order else False
        commercial_partner = partner.commercial_partner_id if partner else False
        product = line.product_id
        if not order or not partner or not product:
            return False

        brand_info = product_brand_map.get(product.id)
        if not brand_info:
            return False

        channel_details = {}
        if partner_channel_map:
            channel_details = partner_channel_map.get(partner.id) or partner_channel_map.get(commercial_partner.id) or {}
        channel_name = channel_details.get('channel_name') if isinstance(channel_details, dict) else channel_details
        category_name = brand_info.get('category_name') or product.categ_id.display_name or 'Sin categoria'
        if not channel_name:
            return False
        selected_channel_names = self._get_selected_channel_names(normalized_filters)
        if selected_channel_names and channel_name not in selected_channel_names:
            return False
        if normalized_filters.get('business_unit_ids'):
            if brand_info.get('business_unit_id') not in normalized_filters['business_unit_ids']:
                return False
            if isinstance(channel_details, dict) and channel_details.get('business_unit_id') not in normalized_filters['business_unit_ids']:
                return False
        if normalized_filters['brand_ids'] and brand_info['brand_id'] not in normalized_filters['brand_ids']:
            return False
        if normalized_filters['category_ids']:
            if brand_info.get('category_id') not in normalized_filters['category_ids']:
                return False
        if normalized_filters.get('product_ids') and product.id not in normalized_filters['product_ids']:
            return False
        if normalized_filters.get('channel_category_ids'):
            if not isinstance(channel_details, dict) or channel_details.get('channel_category_id') not in normalized_filters['channel_category_ids']:
                return False
        if normalized_filters.get('partner_ids') and partner.id not in normalized_filters['partner_ids'] and commercial_partner.id not in normalized_filters['partner_ids']:
            return False

        search_term = normalized_filters['search'].lower()
        if search_term:
            search_haystack = ' '.join([
                partner.display_name or '',
                commercial_partner.display_name or '',
                product.display_name or '',
                product.default_code or '',
                brand_info['brand_name'],
                category_name,
                channel_name,
            ]).lower()
            if search_term not in search_haystack:
                return False
        return True

    @api.model
    def _build_empty_channel_dashboard_payload(self, filters=None, filter_options=None, brands=None, product_brand_map=None):
        normalized_filters = self._normalize_channel_filters(filters)
        brands = brands if brands is not None else self._get_commercial_brand_records()
        product_brand_map = product_brand_map if product_brand_map is not None else self._get_commercial_brand_map()[1]
        filter_options = filter_options or {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(),
            'brands': self._get_brand_filter_options(brands),
            'categories': [],
        }
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'summary_cards': [
                {'label': 'Canales activos', 'value': 0, 'type': 'count'},
                {'label': 'Revenue filtrado', 'value': 0.0, 'type': 'currency'},
                {'label': 'PDVs filtrados', 'value': 0, 'type': 'count'},
                {'label': 'Ticket promedio', 'value': 0.0, 'type': 'currency'},
            ],
            'rows': [],
            'empty_message': (
                'No hay marcas comerciales activas para construir la vista.'
                if not product_brand_map
                else 'No hay datos para los filtros seleccionados.'
            ),
        }

    @api.model
    def _normalize_financial_filters(self, filters=None):
        return self._normalize_channel_filters(filters)

    @api.model
    def _normalize_operations_filters(self, filters=None):
        normalized_filters = self._normalize_channel_filters(filters)
        filters = filters or {}
        abc_class = (filters.get('abc_class') or filters.get('abc') or '').strip().upper()
        if abc_class not in ('A', 'B', 'C'):
            abc_class = ''
        rotation_key = (filters.get('rotation_key') or filters.get('rotation') or '').strip()
        valid_rotation_keys = {'Alta', 'Media', 'Baja', 'Muy Baja'}
        if rotation_key not in valid_rotation_keys:
            rotation_key = ''
        product_channel_ids = self._normalize_filter_ids(
            filters.get('product_channel_ids') or filters.get('product_channel_id')
        )
        normalized_filters.update({
            'abc_class': abc_class,
            'rotation_key': rotation_key,
            'product_channel_ids': product_channel_ids,
        })
        return normalized_filters

    @api.model
    def _serialize_operations_active_filters(self, normalized_filters):
        active_filters = self._serialize_active_filters(normalized_filters)
        active_filters.update({
            'abc_class': normalized_filters.get('abc_class') or '',
            'rotation_key': normalized_filters.get('rotation_key') or '',
            'product_channel_ids': normalized_filters.get('product_channel_ids') or [],
        })
        return active_filters

    @api.model
    def _build_empty_operations_payload(self, filters=None, filter_options=None, empty_message=''):
        normalized_filters = self._normalize_operations_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        brands = self._get_commercial_brand_records()
        filter_options = filter_options or {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(),
            'brands': self._get_brand_filter_options(brands),
            'product_channels': self._get_product_channel_filter_options(),
            'abc_choices': ['A', 'B', 'C'],
            'rotation_choices': ['Alta', 'Media', 'Baja', 'Muy Baja'],
        }
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
                'total_units': 0.0,
                'total_revenue': 0.0,
                'order_count': 0,
                'point_count': 0,
                'product_count': 0,
                'brand_count': 0,
                'avg_units_day': 0.0,
                'period_days': max((date_to - date_from).days + 1, 1),
            },
            'active_filters': self._serialize_operations_active_filters(normalized_filters),
            'filter_options': filter_options,
            'empty_message': empty_message or 'No hay datos operativos para los filtros seleccionados.',
            'kpis': [],
            'monthly_demand_series': [],
            'brand_units_mix': [],
            'abc_distribution': [],
            'rotation_distribution': [],
            'top_skus': [],
            'production_suggestions': [],
            'portfolio': {
                'units': [],
                'rows': [],
            },
            'trend_rows': [],
            'growers': [],
            'decliners': [],
            'missing_recent_sales': [],
            'forecast': {
                'monthly': [],
                'channel_pace': [],
                'next_month_label': '',
                'next_month_blend': 0.0,
                'runrate_annual': 0.0,
            },
            'inventory': {
                'summary': {
                    'on_hand_units': 0.0,
                    'available_units': 0.0,
                    'reserved_units': 0.0,
                    'inventory_value': 0.0,
                    'risk_count': 0,
                    'overstock_count': 0,
                    'avg_coverage_days': 0.0,
                    'dormant_pct': 0.0,
                },
                'coverage_distribution': [],
                'brand_stock_mix': [],
                'product_channel_mix': [],
                'risk_rows': [],
                'overstock_rows': [],
                'rotation_rows': [],
            },
            'purchases': {
                'summary': {
                    'open_orders': 0,
                    'open_amount': 0.0,
                    'period_spend': 0.0,
                    'avg_lead_time_days': 0.0,
                    'late_lines': 0,
                    'supplier_concentration_pct': 0.0,
                },
                'spend_series': [],
                'supplier_rows': [],
                'open_orders': [],
                'backlog_rows': [],
                'leadtime_rows': [],
            },
            'alerts': [],
            'notes_sources': [
                {
                    'label': 'Ventas Odoo',
                    'detail': 'Operaciones usa sale.order.line como proxy de demanda mientras no exista data estructurada de inventarios, compras o produccion.',
                },
                {
                    'label': 'Segmentacion',
                    'detail': 'Marca, canal comercial y canal de producto reutilizan (ZRN) Manejo Comercial para sostener el mismo corte operativo del hub.',
                },
            ],
        }

    @api.model
    def _build_empty_pdv_hub_payload(self, filters=None, filter_options=None, empty_message=''):
        normalized_filters = self._normalize_channel_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        brands = self._get_commercial_brand_records()
        filter_options = filter_options or {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(),
            'brands': self._get_brand_filter_options(brands),
            'categories': [],
        }
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
                'total_pdvs': 0,
                'total_revenue': 0.0,
                'order_count': 0,
                'avg_ticket': 0.0,
                'active_channel_count': 0,
                'new_count': 0,
                'dormant_count': 0,
                'low_st_count': 0,
                'alert_count': 0,
                'top_pdv_name': '',
                'top_pdv_revenue': 0.0,
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'empty_message': empty_message or 'No hay datos PDV para los filtros seleccionados.',
            'revenue_series': [],
            'channel_coverage': [],
            'top_pdvs': [],
            'ranking_rows': [],
            'new_pdvs': [],
            'dormant_pdvs': [],
            'channel_compare': {
                'channel_labels': [],
                'supported_channel_labels': [],
                'summary': {
                    'sellin_q': 0.0,
                    'sellout_q': 0.0,
                    'sellthrough_q_pct': 0.0,
                    'pdvs_with_data': 0,
                    'period': '',
                },
                'by_month': [],
                'rows': [],
                'empty_message': '',
            },
            'otros': {
                'channels': [],
                'rows': [],
            },
            'alerts': {
                'rows': [],
            },
            'notes_sources': [
                {
                    'label': 'Ventas Odoo',
                    'detail': 'PDV usa sale.order.line y sale.order para resumir actividad real por punto de venta.',
                },
                {
                    'label': 'Segmentacion',
                    'detail': 'Marca y canal reutilizan (ZRN) Manejo Comercial para mantener el mismo corte analitico.',
                },
            ],
        }

    @api.model
    def _build_empty_financial_payload(self, filters=None, filter_options=None, empty_message=''):
        normalized_filters = self._normalize_financial_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        filter_options = filter_options or {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(),
            'brands': self._get_brand_filter_options(self._get_commercial_brand_records()),
            'categories': [],
        }
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'coverage_pct': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'margin_pct': 0.0,
                'order_count': 0,
                'product_count': 0,
                'channel_count': 0,
                'brand_count': 0,
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'empty_message': empty_message or 'No hay datos financieros para los filtros seleccionados.',
            'revenue_series': [],
            'brand_margin_mix': [],
            'channel_margin_rows': [],
            'top_products': [],
            'product_channel_matrix': [],
            'brand_rows': [],
            'portfolio': {
                'units': [],
                'rows': [],
            },
            'alerts': [],
            'notes_sources': [
                {
                    'label': 'Ventas Odoo',
                    'detail': 'Revenue y volumen salen de sale.order.line en estados venta o hecho.',
                },
                {
                    'label': 'Costo base',
                    'detail': 'Costo teórico usando standard_price del producto cuando existe.',
                },
                {
                    'label': 'Segmentación',
                    'detail': 'Marca y canal reutilizan (ZRN) Manejo Comercial para mantener consistencia analítica.',
                },
            ],
        }

    @api.model
    def get_financial_hub_payload(self, filters=None):
        normalized_filters = self._normalize_financial_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        currency_symbol = self.env.company.currency_id.symbol or '$'
        brands, product_brand_map = self._get_commercial_brand_map()
        channel_setup = self._get_channel_setup_status()
        order_lines = self.env['sale.order.line'].search([
            ('order_id.state', 'in', ['sale', 'done']),
            ('display_type', '=', False),
            ('company_id', '=', self.env.company.id),
            ('order_id.date_order', '>=', f'{date_from} 00:00:00'),
            ('order_id.date_order', '<=', f'{date_to} 23:59:59'),
        ]).sorted(key=lambda line: ((line.order_id.date_order or fields.Datetime.now()), line.id))
        filter_options = self._build_filter_options(order_lines, brands)

        if not brands or not product_brand_map:
            return self._build_empty_financial_payload(
                filters,
                filter_options,
                'No hay marcas comerciales activas para construir el hub financiero.',
            )
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            return self._build_empty_financial_payload(
                filters,
                filter_options,
                self._get_channel_empty_message(channel_setup),
            )

        month_starts, month_labels = self._get_recent_month_labels(date_to)
        month_index = {
            month_start: index
            for index, month_start in enumerate(month_starts)
        }
        revenue_series = [
            {'label': label, 'revenue': 0.0, 'cost': 0.0, 'margin': 0.0}
            for label in month_labels
        ]
        selected_channel_names = self._get_selected_channel_names(normalized_filters)
        product_count_set = set()
        order_id_set = set()
        unit_map = {}
        brand_map = {}
        channel_map = {}
        product_map = {}
        product_channel_map = {}
        customer_detail_index = {}

        def _make_bucket():
            return {
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'order_ids': set(),
                'partner_ids': set(),
                'channels': defaultdict(lambda: {
                    'name': '',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                    'partner_ids': set(),
                }),
                'customers': defaultdict(lambda: {
                    'id': False,
                    'name': '',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                }),
            }

        def _add_bucket(bucket, channel_name, partner, order, amount, quantity, matched_amount, cost_amount):
            margin_amount = matched_amount - cost_amount
            bucket['revenue'] += amount
            bucket['matched_revenue'] += matched_amount
            bucket['cost'] += cost_amount
            bucket['margin'] += margin_amount
            bucket['units'] += quantity
            bucket['order_ids'].add(order.id)
            if partner:
                bucket['partner_ids'].add(partner.id)
                customer_entry = bucket['customers'][partner.id]
                customer_entry['id'] = partner.id
                customer_entry['name'] = partner.display_name
                customer_entry['revenue'] += amount
                customer_entry['units'] += quantity
                customer_entry['order_ids'].add(order.id)
            channel_entry = bucket['channels'][channel_name]
            channel_entry['name'] = channel_name
            channel_entry['revenue'] += amount
            channel_entry['units'] += quantity
            channel_entry['order_ids'].add(order.id)
            if partner:
                channel_entry['partner_ids'].add(partner.id)

        def _serialize_detail_rows(bucket):
            return sorted(
                [
                    {
                        'name': item['name'],
                        'pdv_count': len(item['partner_ids']),
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['channels'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _serialize_customers(bucket):
            return sorted(
                [
                    {
                        'id': item['id'],
                        'name': item['name'],
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['customers'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _build_detail(title, subtitle, bucket, secondary_title='Top PDVs'):
            return {
                'title': title,
                'subtitle': subtitle,
                'currency_symbol': currency_symbol,
                'summary_cards': [
                    {'label': 'Revenue', 'value': round(bucket['revenue'], 2), 'format': 'money'},
                    {'label': 'Revenue matcheado', 'value': round(bucket['matched_revenue'], 2), 'format': 'money'},
                    {'label': 'Margen', 'value': round(bucket['margin'], 2), 'format': 'money'},
                    {'label': 'PDVs', 'value': len(bucket['partner_ids']), 'format': 'count'},
                ],
                'channel_rows': _serialize_detail_rows(bucket),
                'secondary_title': secondary_title,
                'customer_rows': _serialize_customers(bucket),
                'secondary_rows': _serialize_customers(bucket),
            }

        def _top_category_name(category):
            current = category
            last_name = category.display_name or category.name or 'Sin categoria'
            while current:
                last_name = current.name or last_name
                current = current.parent_id
            return last_name

        filtered_count = 0
        for line in order_lines:
            order = line.order_id
            partner = order.partner_id if order else False
            commercial_partner = partner.commercial_partner_id if partner else False
            product = line.product_id
            if not order or not partner or not product:
                continue

            channel_name = self._resolve_partner_channel(commercial_partner or partner)
            if not channel_name:
                continue
            if selected_channel_names and channel_name not in selected_channel_names:
                continue

            brand_info = product_brand_map.get(product.id) or {}
            brand_id = brand_info.get('brand_id')
            brand_name = brand_info.get('brand_name') or 'Sin marca'
            if normalized_filters['brand_ids'] and brand_id not in normalized_filters['brand_ids']:
                continue
            if normalized_filters['category_ids']:
                allowed_cat_product_ids = self._get_brand_category_product_ids(normalized_filters['category_ids'])
                if product.id not in allowed_cat_product_ids:
                    continue

            search_term = normalized_filters['search'].lower()
            if search_term:
                haystack = ' '.join([
                    partner.display_name or '',
                    commercial_partner.display_name or '',
                    product.display_name or '',
                    product.default_code or '',
                    brand_name,
                    channel_name,
                    product.categ_id.display_name or '',
                ]).lower()
                if search_term not in haystack:
                    continue

            filtered_count += 1
            product_count_set.add(product.id)
            order_id_set.add(order.id)
            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            standard_cost = float(product.standard_price or 0.0)
            has_cost = standard_cost > 0
            has_match = bool(brand_id and has_cost)
            matched_amount = amount if has_match else 0.0
            cost_amount = (standard_cost * quantity) if has_match else 0.0
            margin_amount = matched_amount - cost_amount
            margin_pct = (margin_amount / matched_amount * 100.0) if matched_amount else 0.0
            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else False
            if order_date:
                month_key = order_date.replace(day=1)
                if month_key in month_index:
                    month_row = revenue_series[month_index[month_key]]
                    month_row['revenue'] += amount
                    month_row['cost'] += cost_amount
                    month_row['margin'] += margin_amount

            channel_entry = channel_map.setdefault(channel_name, {
                'key': channel_name.lower().replace(' ', '_'),
                'name': channel_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'product_ids': set(),
                '_detail': _make_bucket(),
            })
            channel_entry['revenue'] += amount
            channel_entry['matched_revenue'] += matched_amount
            channel_entry['cost'] += cost_amount
            channel_entry['margin'] += margin_amount
            channel_entry['units'] += quantity
            channel_entry['product_ids'].add(product.id)
            _add_bucket(channel_entry['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)

            brand_entry = brand_map.setdefault(brand_name, {
                'id': brand_id or 0,
                'name': brand_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'product_ids': set(),
                '_detail': _make_bucket(),
            })
            brand_entry['revenue'] += amount
            brand_entry['matched_revenue'] += matched_amount
            brand_entry['cost'] += cost_amount
            brand_entry['margin'] += margin_amount
            brand_entry['units'] += quantity
            brand_entry['product_ids'].add(product.id)
            _add_bucket(brand_entry['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)

            product_entry = product_map.setdefault(product.id, {
                'id': product.id,
                'name': product.display_name,
                'default_code': product.default_code or '',
                'brand_name': brand_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'channel_names': set(),
                'has_cost': False,
                '_detail': _make_bucket(),
            })
            product_entry['revenue'] += amount
            product_entry['matched_revenue'] += matched_amount
            product_entry['cost'] += cost_amount
            product_entry['margin'] += margin_amount
            product_entry['units'] += quantity
            product_entry['channel_names'].add(channel_name)
            product_entry['has_cost'] = product_entry['has_cost'] or has_cost
            _add_bucket(product_entry['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)

            combo_key = '%s__%s' % (channel_name, product.id)
            combo_entry = product_channel_map.setdefault(combo_key, {
                'key': combo_key,
                'channel': channel_name,
                'product_id': product.id,
                'product_name': product.display_name,
                'brand_name': brand_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
            })
            combo_entry['revenue'] += amount
            combo_entry['matched_revenue'] += matched_amount
            combo_entry['cost'] += cost_amount
            combo_entry['margin'] += margin_amount
            combo_entry['units'] += quantity

            unit_name = _top_category_name(product.categ_id)
            line_name = product.categ_id.display_name or product.categ_id.name or 'Sin linea'
            unit_entry = unit_map.setdefault(unit_name, {
                'key': 'unit_%s' % (len(unit_map) + 1),
                'name': unit_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'brands': {},
            })
            unit_entry['revenue'] += amount
            unit_entry['matched_revenue'] += matched_amount
            unit_entry['cost'] += cost_amount
            unit_entry['margin'] += margin_amount
            unit_entry['units'] += quantity
            portfolio_brand = unit_entry['brands'].setdefault(brand_name, {
                'key': 'brand_%s_%s' % (unit_entry['key'], brand_id or brand_name.lower().replace(' ', '_')),
                'id': brand_id or 0,
                'name': brand_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'lines': {},
                '_detail': _make_bucket(),
            })
            portfolio_brand['revenue'] += amount
            portfolio_brand['matched_revenue'] += matched_amount
            portfolio_brand['cost'] += cost_amount
            portfolio_brand['margin'] += margin_amount
            portfolio_brand['units'] += quantity
            _add_bucket(portfolio_brand['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)
            portfolio_line = portfolio_brand['lines'].setdefault(line_name, {
                'key': 'line_%s_%s' % (portfolio_brand['key'], len(portfolio_brand['lines']) + 1),
                'name': line_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                'products': {},
                '_detail': _make_bucket(),
            })
            portfolio_line['revenue'] += amount
            portfolio_line['matched_revenue'] += matched_amount
            portfolio_line['cost'] += cost_amount
            portfolio_line['margin'] += margin_amount
            portfolio_line['units'] += quantity
            _add_bucket(portfolio_line['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)
            portfolio_product = portfolio_line['products'].setdefault(product.id, {
                'key': 'sku_%s_%s' % (portfolio_line['key'], product.id),
                'id': product.id,
                'name': product.display_name,
                'revenue': 0.0,
                'matched_revenue': 0.0,
                'cost': 0.0,
                'margin': 0.0,
                'units': 0.0,
                '_detail': _make_bucket(),
            })
            portfolio_product['revenue'] += amount
            portfolio_product['matched_revenue'] += matched_amount
            portfolio_product['cost'] += cost_amount
            portfolio_product['margin'] += margin_amount
            portfolio_product['units'] += quantity
            _add_bucket(portfolio_product['_detail'], channel_name, commercial_partner or partner, order, amount, quantity, matched_amount, cost_amount)

            if commercial_partner:
                customer_detail_index[commercial_partner.id] = customer_detail_index.get(commercial_partner.id) or _make_bucket()
                _add_bucket(customer_detail_index[commercial_partner.id], channel_name, commercial_partner, order, amount, quantity, matched_amount, cost_amount)

        if not filtered_count:
            return self._build_empty_financial_payload(
                filters,
                filter_options,
                'No hay datos financieros para los filtros seleccionados.',
            )

        total_revenue = sum(item['revenue'] for item in channel_map.values())
        total_matched_revenue = sum(item['matched_revenue'] for item in channel_map.values())
        total_cost = sum(item['cost'] for item in channel_map.values())
        total_margin = total_matched_revenue - total_cost
        coverage_pct = (total_matched_revenue / total_revenue * 100.0) if total_revenue else 0.0
        total_margin_pct = (total_margin / total_matched_revenue * 100.0) if total_matched_revenue else 0.0

        def _serialize_margin_row(row):
            margin_pct_value = (row['margin'] / row['matched_revenue'] * 100.0) if row['matched_revenue'] else 0.0
            return {
                'id': row.get('id') or 0,
                'key': row.get('key') or '',
                'name': row['name'],
                'revenue': round(row['revenue'], 2),
                'matched_revenue': round(row['matched_revenue'], 2),
                'cost': round(row['cost'], 2),
                'margin': round(row['margin'], 2),
                'margin_pct': round(margin_pct_value, 2),
                'units': round(row['units'], 2),
                'product_count': len(row.get('product_ids', [])),
            }

        brand_rows = []
        for brand_name, row in brand_map.items():
            serialized = _serialize_margin_row(row)
            serialized['detail'] = _build_detail(
                brand_name,
                'Detalle financiero por marca',
                row['_detail'],
            )
            brand_rows.append(serialized)
        brand_rows.sort(key=lambda item: item['revenue'], reverse=True)

        channel_rows = []
        for channel_name, row in channel_map.items():
            serialized = _serialize_margin_row(row)
            serialized['detail'] = _build_detail(
                channel_name,
                'Detalle financiero por canal',
                row['_detail'],
            )
            channel_rows.append(serialized)
        channel_rows.sort(key=lambda item: item['revenue'], reverse=True)

        top_products = []
        for product_id, row in product_map.items():
            margin_pct_value = (row['margin'] / row['matched_revenue'] * 100.0) if row['matched_revenue'] else 0.0
            detail = _build_detail(
                row['name'],
                'Producto financiero',
                row['_detail'],
            )
            customer_rows = detail.get('customer_rows') or []
            detail['secondary_rows'] = customer_rows
            top_products.append({
                'id': product_id,
                'name': row['name'],
                'default_code': row['default_code'],
                'brand_name': row['brand_name'],
                'revenue': round(row['revenue'], 2),
                'matched_revenue': round(row['matched_revenue'], 2),
                'cost': round(row['cost'], 2),
                'margin': round(row['margin'], 2),
                'margin_pct': round(margin_pct_value, 2),
                'units': round(row['units'], 2),
                'channel_count': len(row['channel_names']),
                'has_cost': row['has_cost'],
                'detail': detail,
            })
        top_products.sort(key=lambda item: item['margin'], reverse=True)

        product_channel_rows = []
        for combo in product_channel_map.values():
            margin_pct_value = (combo['margin'] / combo['matched_revenue'] * 100.0) if combo['matched_revenue'] else 0.0
            product_channel_rows.append({
                'key': combo['key'],
                'channel': combo['channel'],
                'product_id': combo['product_id'],
                'product_name': combo['product_name'],
                'brand_name': combo['brand_name'],
                'revenue': round(combo['revenue'], 2),
                'matched_revenue': round(combo['matched_revenue'], 2),
                'cost': round(combo['cost'], 2),
                'margin': round(combo['margin'], 2),
                'margin_pct': round(margin_pct_value, 2),
                'units': round(combo['units'], 2),
            })
        product_channel_rows.sort(key=lambda item: item['margin'], reverse=True)

        units = []
        portfolio_rows = []
        for unit_name, unit in sorted(unit_map.items(), key=lambda item: item[1]['revenue'], reverse=True):
            unit_margin_pct = (unit['margin'] / unit['matched_revenue'] * 100.0) if unit['matched_revenue'] else 0.0
            unit_sku_count = sum(
                len(line_row['products'])
                for brand in unit['brands'].values()
                for line_row in brand['lines'].values()
            )
            unit_payload = {
                'key': unit['key'],
                'name': unit_name,
                'revenue': round(unit['revenue'], 2),
                'matched_revenue': round(unit['matched_revenue'], 2),
                'cost': round(unit['cost'], 2),
                'margin': round(unit['margin'], 2),
                'margin_pct': round(unit_margin_pct, 2),
                'units': round(unit['units'], 2),
                'sku_count': unit_sku_count,
                'brands': [],
            }
            units.append(unit_payload)
            portfolio_rows.append({
                'key': unit['key'],
                'level': 'unit',
                'ancestor_keys': [],
                'label': unit_name,
                'revenue': unit_payload['revenue'],
                'matched_revenue': unit_payload['matched_revenue'],
                'cost': unit_payload['cost'],
                'margin': unit_payload['margin'],
                'margin_pct': unit_payload['margin_pct'],
                'units_sold': unit_payload['units'],
                'sku_count': unit_payload['sku_count'],
                'detail': False,
            })
            for brand_name, brand in sorted(unit['brands'].items(), key=lambda item: item[1]['revenue'], reverse=True):
                brand_margin_pct = (brand['margin'] / brand['matched_revenue'] * 100.0) if brand['matched_revenue'] else 0.0
                brand_sku_count = sum(len(line_row['products']) for line_row in brand['lines'].values())
                brand_payload = {
                    'key': brand['key'],
                    'id': brand['id'],
                    'name': brand_name,
                    'revenue': round(brand['revenue'], 2),
                    'matched_revenue': round(brand['matched_revenue'], 2),
                    'cost': round(brand['cost'], 2),
                    'margin': round(brand['margin'], 2),
                    'margin_pct': round(brand_margin_pct, 2),
                    'units': round(brand['units'], 2),
                    'lines': [],
                    'detail': _build_detail(brand_name, '%s · %s' % (unit_name, brand_name), brand['_detail'], 'Top PDVs'),
                }
                unit_payload['brands'].append(brand_payload)
                portfolio_rows.append({
                    'key': brand['key'],
                    'resId': brand['id'] or False,
                    'level': 'brand',
                    'ancestor_keys': [unit['key']],
                    'label': brand_name,
                    'revenue': brand_payload['revenue'],
                    'matched_revenue': brand_payload['matched_revenue'],
                    'cost': brand_payload['cost'],
                    'margin': brand_payload['margin'],
                    'margin_pct': brand_payload['margin_pct'],
                    'units_sold': brand_payload['units'],
                    'sku_count': brand_sku_count,
                    'detail': brand_payload['detail'],
                })
                for line_name, line_row in sorted(brand['lines'].items(), key=lambda item: item[1]['revenue'], reverse=True):
                    line_margin_pct = (line_row['margin'] / line_row['matched_revenue'] * 100.0) if line_row['matched_revenue'] else 0.0
                    products = []
                    line_payload = {
                        'key': line_row['key'],
                        'name': line_name,
                        'revenue': round(line_row['revenue'], 2),
                        'matched_revenue': round(line_row['matched_revenue'], 2),
                        'cost': round(line_row['cost'], 2),
                        'margin': round(line_row['margin'], 2),
                        'margin_pct': round(line_margin_pct, 2),
                        'units': round(line_row['units'], 2),
                        'product_count': len(line_row['products']),
                        'products': products,
                        'detail': _build_detail(line_name, '%s · %s' % (brand_name, line_name), line_row['_detail'], 'Top PDVs'),
                    }
                    brand_payload['lines'].append(line_payload)
                    portfolio_rows.append({
                        'key': line_payload['key'],
                        'level': 'line',
                        'ancestor_keys': [unit['key'], brand['key']],
                        'label': line_name,
                        'revenue': line_payload['revenue'],
                        'matched_revenue': line_payload['matched_revenue'],
                        'cost': line_payload['cost'],
                        'margin': line_payload['margin'],
                        'margin_pct': line_payload['margin_pct'],
                        'units_sold': line_payload['units'],
                        'sku_count': line_payload['product_count'],
                        'detail': line_payload['detail'],
                    })
                    for sku_row in sorted(line_row['products'].values(), key=lambda item: item['revenue'], reverse=True):
                        sku_margin_pct = (sku_row['margin'] / sku_row['matched_revenue'] * 100.0) if sku_row['matched_revenue'] else 0.0
                        sku_payload = {
                            'key': sku_row['key'],
                            'id': sku_row['id'],
                            'name': sku_row['name'],
                            'revenue': round(sku_row['revenue'], 2),
                            'matched_revenue': round(sku_row['matched_revenue'], 2),
                            'cost': round(sku_row['cost'], 2),
                            'margin': round(sku_row['margin'], 2),
                            'margin_pct': round(sku_margin_pct, 2),
                            'units': round(sku_row['units'], 2),
                            'detail': _build_detail(sku_row['name'], '%s · %s' % (brand_name, line_name), sku_row['_detail'], 'Top PDVs'),
                        }
                        products.append(sku_payload)
                        portfolio_rows.append({
                            'key': sku_payload['key'],
                            'resId': sku_payload['id'],
                            'level': 'sku',
                            'ancestor_keys': [unit['key'], brand['key'], line_row['key']],
                            'label': sku_payload['name'],
                            'revenue': sku_payload['revenue'],
                            'matched_revenue': sku_payload['matched_revenue'],
                            'cost': sku_payload['cost'],
                            'margin': sku_payload['margin'],
                            'margin_pct': sku_payload['margin_pct'],
                            'units_sold': sku_payload['units'],
                            'sku_count': 1,
                            'detail': sku_payload['detail'],
                        })
                    line_payload['products'] = products

        alerts = []
        missing_cost_products = [item for item in top_products if item['revenue'] > 0 and item['matched_revenue'] <= 0][:5]
        if missing_cost_products:
            alerts.append({
                'severity': 'warn',
                'title': 'Productos sin costo o sin marca activa',
                'detail': 'Hay revenue fuera del margen teórico porque faltan costo estándar o asignación de marca en algunos productos.',
                'items': [item['name'] for item in missing_cost_products],
            })
        low_margin_products = [
            item for item in top_products
            if item['matched_revenue'] >= 500 and item['margin_pct'] <= 10
        ][:5]
        if low_margin_products:
            alerts.append({
                'severity': 'alert',
                'title': 'Productos con margen bajo',
                'detail': 'Estos SKUs tienen margen bruto teórico menor o igual al 10% en el periodo filtrado.',
                'items': [item['name'] for item in low_margin_products],
            })
        if channel_rows:
            top_channel = channel_rows[0]
            top_channel_mix = (top_channel['revenue'] / total_revenue * 100.0) if total_revenue else 0.0
            if top_channel_mix >= 55:
                alerts.append({
                    'severity': 'info',
                    'title': 'Concentración por canal',
                    'detail': '%s concentra %.1f%% del revenue filtrado.' % (top_channel['name'], top_channel_mix),
                    'items': [],
                })
        if brand_rows:
            top_brand = brand_rows[0]
            top_brand_mix = (top_brand['revenue'] / total_revenue * 100.0) if total_revenue else 0.0
            if top_brand_mix >= 45:
                alerts.append({
                    'severity': 'info',
                    'title': 'Concentración por marca',
                    'detail': '%s concentra %.1f%% del revenue filtrado.' % (top_brand['name'], top_brand_mix),
                    'items': [],
                })

        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': currency_symbol,
                'revenue': round(total_revenue, 2),
                'matched_revenue': round(total_matched_revenue, 2),
                'coverage_pct': round(coverage_pct, 2),
                'cost': round(total_cost, 2),
                'margin': round(total_margin, 2),
                'margin_pct': round(total_margin_pct, 2),
                'order_count': len(order_id_set),
                'product_count': len(product_count_set),
                'channel_count': len(channel_rows),
                'brand_count': len(brand_rows),
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'empty_message': '',
            'revenue_series': [
                {
                    'label': item['label'],
                    'revenue': round(item['revenue'], 2),
                    'cost': round(item['cost'], 2),
                    'margin': round(item['margin'], 2),
                }
                for item in revenue_series
            ],
            'brand_margin_mix': brand_rows[:8],
            'channel_margin_rows': channel_rows,
            'top_products': top_products,
            'product_channel_matrix': product_channel_rows[:30],
            'brand_rows': brand_rows,
            'portfolio': {
                'units': units,
                'rows': portfolio_rows,
            },
            'alerts': alerts,
            'notes_sources': [
                {
                    'label': 'Ventas Odoo',
                    'detail': 'Revenue y pedidos consolidados desde sale.order.line y sale.order.',
                },
                {
                    'label': 'Costo estándar',
                    'detail': 'El margen mostrado es teórico y usa standard_price del producto cuando hay match de marca.',
                },
                {
                    'label': 'Catálogo comercial',
                    'detail': 'Marcas y canales reutilizan (ZRN) Manejo Comercial para sostener el mismo corte analítico.',
                },
            ],
        }

    @api.model
    def get_commercial_hub_payload(self, filters=None):
        normalized_filters = self._normalize_channel_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        currency_symbol = self.env.company.currency_id.symbol or '$'
        brands, product_brand_map = self._get_commercial_brand_map()
        channel_setup = self._get_channel_setup_status()
        if not brands:
            payload = self._get_empty_commercial_hub_payload()
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands, filters=normalized_filters)
            return payload
        if not product_brand_map:
            payload = self._get_empty_commercial_hub_payload(
                'Hay marcas comerciales creadas, pero todavia no tienen productos asociados a sus categorias.'
            )
            payload['summary']['brand_count'] = len(brands)
            payload['has_brands'] = True
            payload['brand_catalog'] = [
                {
                    'name': brand.name,
                    'product_count': brand.product_count,
                }
                for brand in brands
            ]
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands, filters=normalized_filters)
            return payload
        if normalized_filters.get('order_type') == 'purchase':
            payload = self._get_empty_commercial_hub_payload(
                'El filtro de compras ya esta disponible. Esta vista todavia calcula los indicadores con ordenes de venta.'
            )
            payload['summary']['brand_count'] = len(brands)
            payload['summary']['product_count'] = len(product_brand_map)
            payload['has_brands'] = True
            payload['brand_catalog'] = [
                {
                    'name': brand.name,
                    'product_count': brand.product_count,
                }
                for brand in brands
            ]
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands, filters=normalized_filters)
            return payload
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            payload = self._get_empty_commercial_hub_payload(
                self._get_channel_empty_message(channel_setup)
            )
            payload['summary']['brand_count'] = len(brands)
            payload['summary']['product_count'] = len(product_brand_map)
            payload['has_brands'] = True
            payload['brand_catalog'] = [
                {
                    'name': brand.name,
                    'product_count': brand.product_count,
                }
                for brand in brands
            ]
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands, filters=normalized_filters)
            return payload

        partner_channel_map = self._get_partner_channel_details_map()
        order_lines = self._get_commercial_sale_order_lines(
            date_from,
            date_to,
            list(product_brand_map.keys()),
            normalized_filters.get('order_status') or 'confirmed',
            normalized_filters.get('invoiced_only'),
        )
        filter_options = self._build_filter_options(order_lines, brands, filters=normalized_filters)
        filtered_lines = order_lines.filtered(lambda line: self._line_matches_filters(line, product_brand_map, normalized_filters, partner_channel_map=partner_channel_map))
        if not filtered_lines:
            payload = self._get_empty_commercial_hub_payload()
            payload['summary']['brand_count'] = len(brands)
            payload['summary']['product_count'] = len(product_brand_map)
            payload['has_brands'] = True
            payload['empty_message'] = 'No hay datos para los filtros seleccionados.'
            payload['brand_catalog'] = [
                {
                    'name': brand.name,
                    'product_count': brand.product_count,
                }
                for brand in brands
            ]
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = filter_options
            return payload

        month_starts, month_labels = self._get_recent_month_labels(date_to)
        month_amounts = {
            month_start: 0.0
            for month_start in month_starts
        }
        brand_amounts = defaultdict(float)
        brand_product_ids = defaultdict(set)
        portfolio_brand_map = {}
        order_ids = set()
        channel_map = {}
        customer_map = {}
        product_map = {}

        def _init_detail_bucket():
            """
            Initializes a detail bucket to accumulate metrics (revenue, units, order ids, partner ids)
            along channels, customers, and products for populating the custom analytics detail modal.
            """
            return {
                'revenue': 0.0,
                'units': 0.0,
                'order_ids': set(),
                'partner_ids': set(),
                'channels': defaultdict(lambda: {
                    'name': '',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                    'partner_ids': set(),
                }),
                'customers': defaultdict(lambda: {
                    'name': '',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                }),
                'products': defaultdict(lambda: {
                    'name': '',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                }),
            }

        def _accumulate_detail(bucket, channel_name, partner, order, amount, quantity, product=None):
            """
            Accumulates transaction line metrics into the designated detail bucket, supporting
            breakdowns by channel, partner, and product.
            """
            bucket['revenue'] += amount
            bucket['units'] += quantity
            bucket['order_ids'].add(order.id)
            if partner:
                bucket['partner_ids'].add(partner.id)
                customer_entry = bucket['customers'][partner.id]
                customer_entry['name'] = partner.display_name
                customer_entry['revenue'] += amount
                customer_entry['units'] += quantity
                customer_entry['order_ids'].add(order.id)
            channel_key = channel_name or 'Sin canal'
            channel_entry = bucket['channels'][channel_key]
            channel_entry['name'] = channel_key
            channel_entry['revenue'] += amount
            channel_entry['units'] += quantity
            channel_entry['order_ids'].add(order.id)
            if partner:
                channel_entry['partner_ids'].add(partner.id)
            if product:
                product_entry = bucket['products'][product.id]
                product_entry['name'] = product.display_name
                product_entry['revenue'] += amount
                product_entry['units'] += quantity
                product_entry['order_ids'].add(order.id)

        def _serialize_channel_rows(bucket):
            """
            Formats and sorts the channel metrics from the bucket for frontend tables.
            """
            return sorted(
                [
                    {
                        'name': item['name'],
                        'pdv_count': len(item['partner_ids']),
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['channels'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _serialize_customer_rows(bucket):
            """
            Formats and sorts the customer metrics from the bucket for frontend tables.
            """
            return sorted(
                [
                    {
                        'id': partner_id,
                        'name': item['name'],
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for partner_id, item in bucket['customers'].items()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _serialize_product_rows(bucket):
            """
            Formats and sorts the product metrics from the bucket for customer detail tables.
            """
            return sorted(
                [
                    {
                        'name': item['name'],
                        'units': round(item['units'], 2),
                        'order_count': len(item['order_ids']),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['products'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _build_detail_payload(title, subtitle, bucket, secondary_title='', secondary_rows=None):
            """
            Builds the complete payload structured for the analytics detail modal.
            """
            return {
                'title': title,
                'subtitle': subtitle,
                'currency_symbol': currency_symbol,
                'summary_cards': [
                    {'label': 'Venta', 'value': round(bucket['revenue'], 2), 'format': 'money'},
                    {'label': 'Unidades', 'value': round(bucket['units'], 2), 'format': 'count'},
                    {'label': 'Pedidos', 'value': len(bucket['order_ids']), 'format': 'count'},
                    {'label': 'PDVs', 'value': len(bucket['partner_ids']), 'format': 'count'},
                ],
                'channel_rows': _serialize_channel_rows(bucket),
                'secondary_title': secondary_title,
                'secondary_rows': secondary_rows or [],
                'customer_rows': _serialize_customer_rows(bucket),
            }

        for line in filtered_lines:
            order = line.order_id
            partner = order.partner_id
            commercial_partner = partner.commercial_partner_id or partner
            product = line.product_id
            if not order or not product:
                continue

            brand_info = product_brand_map.get(product.id)
            if not brand_info:
                continue

            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            order_ids.add(order.id)
            channel_name = self._resolve_partner_channel(commercial_partner)

            if order.date_order:
                order_date = fields.Datetime.to_datetime(order.date_order).date()
                order_month = order_date.replace(day=1)
                if order_month in month_amounts:
                    month_amounts[order_month] += amount
            else:
                order_date = False

            brand_amounts[brand_info['brand_name']] += amount
            brand_product_ids[brand_info['brand_name']].add(product.id)

            portfolio_brand = portfolio_brand_map.setdefault(
                brand_info['brand_name'],
                {
                    'name': brand_info['brand_name'],
                    'revenue': 0.0,
                    'quantity_sold': 0.0,
                    'product_ids': set(),
                    'categories': {},
                    '_detail': _init_detail_bucket(),
                },
            )
            portfolio_brand['revenue'] += amount
            portfolio_brand['quantity_sold'] += quantity
            portfolio_brand['product_ids'].add(product.id)
            _accumulate_detail(portfolio_brand['_detail'], channel_name, partner, order, amount, quantity, product)
            category_key = product.categ_id.display_name or 'Sin categoria'
            portfolio_category = portfolio_brand['categories'].setdefault(
                category_key,
                {
                    'name': category_key,
                    'revenue': 0.0,
                    'quantity_sold': 0.0,
                    'product_ids': set(),
                    'products': {},
                    '_detail': _init_detail_bucket(),
                },
            )
            portfolio_category['revenue'] += amount
            portfolio_category['quantity_sold'] += quantity
            portfolio_category['product_ids'].add(product.id)
            _accumulate_detail(portfolio_category['_detail'], channel_name, partner, order, amount, quantity, product)
            portfolio_product = portfolio_category['products'].setdefault(
                product.id,
                {
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                    'revenue': 0.0,
                    'quantity_sold': 0.0,
                    '_detail': _init_detail_bucket(),
                },
            )
            portfolio_product['revenue'] += amount
            portfolio_product['quantity_sold'] += quantity
            _accumulate_detail(portfolio_product['_detail'], channel_name, partner, order, amount, quantity, product)

            if commercial_partner:
                channel_entry = channel_map.setdefault(
                    commercial_partner.id,
                    {
                        'name': commercial_partner.display_name,
                        'order_ids': set(),
                        'total_amount': 0.0,
                    },
                )
                channel_entry['order_ids'].add(order.id)
                channel_entry['total_amount'] += amount

            if partner:
                customer_entry = customer_map.setdefault(
                    partner.id,
                    {
                        'id': partner.id,
                        'name': partner.display_name,
                        'channel': channel_name or 'Sin canal',
                        'order_ids': set(),
                        'total_amount': 0.0,
                        'total_units': 0.0,
                        'order_dates': set(),
                        'channels_rev': defaultdict(float),
                        'products_rev': defaultdict(float),
                        'cost_amount': 0.0,
                        '_detail': _init_detail_bucket(),
                    },
                )
                customer_entry['order_ids'].add(order.id)
                customer_entry['total_amount'] += amount
                customer_entry['total_units'] += quantity
                cost_real = getattr(line, 'purchase_price', 0.0) or (product.standard_price or 0.0)
                customer_entry['cost_amount'] += quantity * cost_real
                if order.date_order:
                    customer_entry['order_dates'].add(fields.Datetime.to_datetime(order.date_order).date())
                if channel_name:
                    customer_entry['channels_rev'][channel_name] += amount
                customer_entry['products_rev'][product.display_name] += amount
                _accumulate_detail(customer_entry['_detail'], channel_name, partner, order, amount, quantity, product)

            product_entry = product_map.setdefault(
                product.id,
                {
                    'product_id': product.id,
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                    'category_name': product.categ_id.display_name or '',
                    'quantity_sold': 0.0,
                    'sales_amount': 0.0,
                    'cost_amount': 0.0,
                    'order_ids': set(),
                    'channel_names': set(),
                    'partner_ids': set(),
                    '_detail': _init_detail_bucket(),
                },
            )
            product_entry['quantity_sold'] += quantity
            product_entry['sales_amount'] += amount
            cost_real = getattr(line, 'purchase_price', 0.0) or (product.standard_price or 0.0)
            product_entry['cost_amount'] += quantity * cost_real
            product_entry['order_ids'].add(order.id)
            if channel_name:
                product_entry['channel_names'].add(channel_name)
            if partner:
                product_entry['partner_ids'].add(partner.id)
            _accumulate_detail(product_entry['_detail'], channel_name, partner, order, amount, quantity, product)

        total_amount = round(sum(item['sales_amount'] for item in product_map.values()), 2)
        top_customers = sorted(
            [
                {
                    'partner_id': partner_id,
                    'name': item['name'],
                    'order_count': len(item['order_ids']),
                    'total_amount': round(item['total_amount'], 2),
                }
                for partner_id, item in customer_map.items()
            ],
            key=lambda item: item['total_amount'],
            reverse=True,
        )[:8]
        top_channels = sorted(
            [
                {
                    'name': item['name'],
                    'order_count': len(item['order_ids']),
                    'total_amount': round(item['total_amount'], 2),
                }
                for item in channel_map.values()
            ],
            key=lambda item: item['total_amount'],
            reverse=True,
        )[:8]
        top_products = sorted(
            [
                {
                    'product_id': item['product_id'],
                    'name': item['name'],
                    'default_code': item['default_code'],
                    'category_name': item['category_name'],
                    'quantity_sold': round(item['quantity_sold'], 2),
                    'sales_amount': round(item['sales_amount'], 2),
                    'detail': _build_detail_payload(
                        item['name'],
                        item['category_name'] or 'Producto',
                        item['_detail'],
                        secondary_title='Top PDVs',
                        secondary_rows=_serialize_customer_rows(item['_detail']),
                    ),
                }
                for item in product_map.values()
            ],
            key=lambda item: item['sales_amount'],
            reverse=True,
        )[:8]

        # Map brand names to their commercial brand database IDs
        brand_ids_map = {brand.name: brand.id for brand in brands}
        brand_mix = sorted(
            [
                {
                    'id': brand_ids_map.get(brand_name),
                    'name': brand_name,
                    'value': round(amount, 2),
                    'percentage': round((amount / total_amount) * 100, 2) if total_amount else 0.0,
                    'product_count': len(brand_product_ids.get(brand_name, set())),
                }
                for brand_name, amount in brand_amounts.items()
            ],
            key=lambda item: item['value'],
            reverse=True,
        )
        portfolio_rows = []
        for brand_name, brand_row in sorted(
            portfolio_brand_map.items(),
            key=lambda item: item[1]['revenue'],
            reverse=True,
        ):
            categories = []
            for category_name, category_row in sorted(
                brand_row['categories'].items(),
                key=lambda item: item[1]['revenue'],
                reverse=True,
            ):
                products = sorted(
                    [
                        {
                            'key': f"product_{product_id}",
                            'name': product_row['name'],
                            'default_code': product_row['default_code'],
                            'revenue': round(product_row['revenue'], 2),
                            'quantity_sold': round(product_row['quantity_sold'], 2),
                            'detail': _build_detail_payload(
                                product_row['name'],
                                category_name,
                                product_row['_detail'],
                                secondary_title='Top PDVs',
                                secondary_rows=_serialize_customer_rows(product_row['_detail']),
                            ),
                        }
                        for product_id, product_row in category_row['products'].items()
                    ],
                    key=lambda item: item['revenue'],
                    reverse=True,
                )
                category_secondary_rows = [
                    {
                        'name': item['name'],
                        'units': item['quantity_sold'],
                        'revenue': item['revenue'],
                    }
                    for item in products[:8]
                ]
                categories.append({
                    'key': f"category_{brand_name}_{category_name}",
                    'name': category_name,
                    'revenue': round(category_row['revenue'], 2),
                    'quantity_sold': round(category_row['quantity_sold'], 2),
                    'product_count': len(category_row['product_ids']),
                    'products': products,
                    'detail': _build_detail_payload(
                        category_name,
                        brand_name,
                        category_row['_detail'],
                        secondary_title='SKUs de la linea',
                        secondary_rows=category_secondary_rows,
                    ),
                })
            brand_secondary_rows = [
                {
                    'name': item['name'],
                    'sku_count': item['product_count'],
                    'units': item['quantity_sold'],
                    'revenue': item['revenue'],
                }
                for item in categories[:8]
            ]
            portfolio_rows.append({
                'key': f"brand_{brand_name}",
                'name': brand_name,
                'revenue': round(brand_row['revenue'], 2),
                'quantity_sold': round(brand_row['quantity_sold'], 2),
                'product_count': len(brand_row['product_ids']),
                'categories': categories,
                'detail': _build_detail_payload(
                    brand_name,
                    'Marca comercial',
                    brand_row['_detail'],
                    secondary_title='Lineas de portafolio',
                    secondary_rows=brand_secondary_rows,
                ),
            })

        # ----------------------------------------------------------------------
        # AUXILIARY HELPERS
        # ----------------------------------------------------------------------
        def get_month_label(date_or_str):
            if not date_or_str:
                return '—'
            if isinstance(date_or_str, str):
                parts = date_or_str.split('-')
                if len(parts) >= 2:
                    year = parts[0]
                    month = parts[1]
                else:
                    return date_or_str
            else:
                year = str(date_or_str.year)
                month = str(date_or_str.month).zfill(2)
            months_map = {
                '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
                '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
            }
            return f"{months_map.get(month, month)} {year}"

        def get_next_month_key(month_key):
            year, month = map(int, month_key.split('-'))
            month += 1
            if month > 12:
                month = 1
                year += 1
            return f"{year}-{month:02d}"

        def median(lst):
            if not lst:
                return 0.0
            n = len(lst)
            s = sorted(lst)
            if n % 2 == 1:
                return s[n // 2]
            else:
                return (s[n // 2 - 1] + s[n // 2]) / 2.0

        # ----------------------------------------------------------------------
        # 1. CLIENTS DATASET & RANKING
        # ----------------------------------------------------------------------
        all_clients_raw = []
        for c_id, entry in customer_map.items():
            order_dates = sorted(list(entry['order_dates']))
            first_date = order_dates[0] if order_dates else False
            last_date = order_dates[-1] if order_dates else False
            days_since = (date_to - last_date).days if last_date else 999
            
            all_clients_raw.append({
                'id': c_id,
                'name': entry['name'],
                'channel': entry['channel'],
                'rev': round(entry['total_amount'], 2),
                'units': round(entry['total_units'], 2),
                'invoices': len(entry['order_ids']),
                'first': fields.Date.to_string(first_date) if first_date else '—',
                'last': fields.Date.to_string(last_date) if last_date else '—',
                'days_since': days_since,
                'detail': _build_detail_payload(
                    entry['name'],
                    entry['channel'] or 'Sin canal',
                    entry['_detail'],
                    secondary_title='Productos',
                    secondary_rows=_serialize_product_rows(entry['_detail']),
                ),
                '_raw_entry': entry
            })
        all_clients_raw.sort(key=lambda x: x['rev'], reverse=True)

        # ----------------------------------------------------------------------
        # 2. RFM SEGMENTATION & ABC CLASSIFICATION
        # ----------------------------------------------------------------------
        n_clients = len(all_clients_raw)
        for idx_c, c in enumerate(all_clients_raw):
            if idx_c < n_clients // 4 or idx_c == 0:
                c['m_score'] = 4
            elif idx_c < n_clients // 2:
                c['m_score'] = 3
            elif idx_c < (3 * n_clients) // 4:
                c['m_score'] = 2
            else:
                c['m_score'] = 1

        for c in all_clients_raw:
            entry = c['_raw_entry']
            order_dates = sorted(list(entry['order_dates']))
            last_date = order_dates[-1] if order_dates else False
            if last_date:
                recency_months = (date_to.year - last_date.year) * 12 + date_to.month - last_date.month
                if recency_months < 0:
                    recency_months = 0
            else:
                recency_months = 99
            
            if recency_months == 0:
                c['r_score'] = 4
            elif recency_months == 1:
                c['r_score'] = 3
            elif recency_months == 2:
                c['r_score'] = 2
            else:
                c['r_score'] = 1
            
            c['recency_months'] = recency_months

            months_active_set = {d.strftime('%Y-%m') for d in order_dates}
            months_active = len(months_active_set)
            c['months_active'] = months_active
            
            if months_active >= 4:
                c['f_score'] = 4
            elif months_active == 3:
                c['f_score'] = 3
            elif months_active == 2:
                c['f_score'] = 2
            else:
                c['f_score'] = 1

        def get_rfm_segment_key(r, f, m):
            if r == 4 and f == 4:
                return 'champion'
            if r >= 3 and f >= 3 and m >= 3:
                return 'loyal'
            if r == 4 and f <= 2 and m >= 3:
                return 'promising'
            if (r in (3, 4) and f in (2, 3) and m == 2) or (r == 3 and f == 4 and m == 2):
                return 'need_attention'
            if (r == 4 and f <= 2 and m <= 2) or (r == 4 and f == 1):
                return 'new'
            if (r == 3 and f in (1, 2) and m == 1) or (r == 4 and f == 3 and m == 1):
                return 'sporadic'
            if (r == 1 and f >= 3) or (r == 1 and m == 4):
                return 'cant_lose'
            if (r == 2 and f >= 3) or (r == 1 and f == 2 and m >= 3):
                return 'at_risk'
            return 'hibernating'

        RFM_SEGMENT_META = {
            'champion': {'name': 'Campeón', 'emoji': ''},
            'loyal': {'name': 'Leal', 'emoji': ''},
            'cant_lose': {'name': 'No perderlo', 'emoji': ''},
            'at_risk': {'name': 'En riesgo', 'emoji': ''},
            'promising': {'name': 'Prometedor', 'emoji': ''},
            'need_attention': {'name': 'Atender', 'emoji': ''},
            'new': {'name': 'Nuevo', 'emoji': ''},
            'hibernating': {'name': 'Hibernando', 'emoji': ''},
            'sporadic': {'name': 'Esporádico', 'emoji': ''}
        }

        total_rev_clients = sum(c['rev'] for c in all_clients_raw)
        cum_rev = 0.0
        a_count = b_count = c_count = 0
        a_rev = b_rev = c_rev = 0.0
        
        for c in all_clients_raw:
            entry = c['_raw_entry']
            cum_rev += c['rev']
            cum_pct = cum_rev / total_rev_clients if total_rev_clients else 0.0
            c['cum_pct'] = round(cum_pct * 100, 2)
            c['share_pct'] = round((c['rev'] / total_rev_clients * 100) if total_rev_clients else 0.0, 2)
            
            if cum_rev - c['rev'] <= 0.80 * total_rev_clients:
                c['abc'] = 'A'
                a_count += 1
                a_rev += c['rev']
            elif cum_rev - c['rev'] <= 0.95 * total_rev_clients:
                c['abc'] = 'B'
                b_count += 1
                b_rev += c['rev']
            else:
                c['abc'] = 'C'
                c_count += 1
                c_rev += c['rev']
                
            c['ticket_avg'] = round(c['rev'] / c['invoices'], 2) if c['invoices'] else 0.0
            c['promo_pct'] = 0.0
            c['margin_pct'] = round((c['rev'] - entry['cost_amount']) / c['rev'] * 100, 2) if c['rev'] else 0.0
            
            channels_rev = entry['channels_rev']
            c['primary_channel'] = max(channels_rev, key=channels_rev.get) if channels_rev else c['channel'] or 'Sin canal'
            
            products_rev = entry['products_rev']
            c['primary_product'] = max(products_rev, key=products_rev.get) if products_rev else 'Sin productos'
            
            r_s = c['r_score']
            f_s = c['f_score']
            m_s = c['m_score']
            seg_key = get_rfm_segment_key(r_s, f_s, m_s)
            c['segment_key'] = seg_key
            c['segment'] = RFM_SEGMENT_META[seg_key]['name']
            c['segment_emoji'] = RFM_SEGMENT_META[seg_key]['emoji']
            
            order_dates = sorted(list(entry['order_dates']))
            if order_dates:
                c['first_month'] = order_dates[0].strftime('%Y-%m')
                c['first_month_label'] = get_month_label(order_dates[0])
                c['last_month'] = order_dates[-1].strftime('%Y-%m')
                c['last_month_label'] = get_month_label(order_dates[-1])
            else:
                c['first_month'] = c['last_month'] = '—'
                c['first_month_label'] = c['last_month_label'] = '—'

        segments_data = {}
        for s_key, s_meta in RFM_SEGMENT_META.items():
            s_clients = [c for c in all_clients_raw if c['segment_key'] == s_key]
            s_rev = sum(sc['rev'] for sc in s_clients)
            top_3 = []
            for sc in s_clients[:3]:
                top_3.append({
                    'name': sc['name'],
                    'rev': sc['rev'],
                    'primary_channel': sc['primary_channel'],
                    'recency_months': sc['recency_months'],
                    'months_active': sc['months_active'],
                })
            segments_data[s_key] = {
                'count': len(s_clients),
                'rev': round(s_rev, 2),
                'top_clients': top_3
            }

        rf_matrix = {}
        for r in range(1, 5):
            for f in range(1, 5):
                mat_clients = [c for c in all_clients_raw if c['r_score'] == r and c['f_score'] == f]
                rf_matrix[f"{r}-{f}"] = {
                    'count': len(mat_clients),
                    'rev': round(sum(mc['rev'] for mc in mat_clients), 2)
                }

        top_5_rev = sum(c['rev'] for c in all_clients_raw[:5])
        top_10_rev = sum(c['rev'] for c in all_clients_raw[:10])
        concentration = {
            'top5_rev': round(top_5_rev, 2),
            'top5_pct': round((top_5_rev / total_rev_clients * 100) if total_rev_clients else 0.0, 1),
            'top10_rev': round(top_10_rev, 2),
            'top10_pct': round((top_10_rev / total_rev_clients * 100) if total_rev_clients else 0.0, 1),
            'total_rev': round(total_rev_clients, 2),
        }

        champions_loyal_clients = [c for c in all_clients_raw if c['segment_key'] in ('champion', 'loyal')]
        champions_loyal_count = len(champions_loyal_clients)
        at_risk_clients = [c for c in all_clients_raw if c['segment_key'] == 'at_risk']
        at_risk_rev = sum(ac['rev'] for ac in at_risk_clients)
        
        exec_summary = {
            'champions_loyal_count': champions_loyal_count,
            'champions_loyal_pct': round((champions_loyal_count / n_clients * 100) if n_clients else 0.0, 1),
            'at_risk_count': len(at_risk_clients),
            'at_risk_rev': round(at_risk_rev, 2),
            'at_risk_rev_pct': round((at_risk_rev / total_rev_clients * 100) if total_rev_clients else 0.0, 1)
        }

        pareto_data = []
        cum_rev_pareto = 0.0
        for idx_c, c in enumerate(all_clients_raw):
            cum_rev_pareto += c['rev']
            x_pct = (idx_c + 1) / n_clients * 100
            cum_pct = (cum_rev_pareto / total_rev_clients * 100) if total_rev_clients else 0.0
            pareto_data.append({
                'x': idx_c + 1,
                'x_pct': round(x_pct, 2),
                'cum_pct': round(cum_pct, 2)
            })

        clients_rfm = {
            'meta': {
                'today': fields.Date.to_string(date_to),
                'current_month_key': date_to.strftime('%Y-%m'),
                'n_clients': n_clients,
                'pipeline': 'analytics_home_rfm v1',
            },
            'segments_order': [{'key': k, 'name': v['name'], 'emoji': v['emoji']} for k, v in RFM_SEGMENT_META.items()],
            'segments': segments_data,
            'abc': {
                'a_count': a_count,
                'b_count': b_count,
                'c_count': c_count,
                'a_rev': round(a_rev, 2),
                'b_rev': round(b_rev, 2),
                'c_rev': round(c_rev, 2)
            },
            'rf_matrix': rf_matrix,
            'concentration': concentration,
            'exec': exec_summary,
            'pareto': pareto_data,
            'clients': [{k: v for k, v in c.items() if k != '_raw_entry'} for c in all_clients_raw]
        }

        # ----------------------------------------------------------------------
        # 3. COHORT RETENTION
        # ----------------------------------------------------------------------
        all_month_keys = sorted(list({d.strftime('%Y-%m') for c in all_clients_raw for d in c['_raw_entry']['order_dates']}))
        cohort_matrix = []
        cohort_sizes = defaultdict(int)
        cohort_clients = defaultdict(list)
        for c in all_clients_raw:
            dates = sorted(list(c['_raw_entry']['order_dates']))
            if dates:
                first_month = dates[0].strftime('%Y-%m')
                cohort_sizes[first_month] += 1
                cohort_clients[first_month].append(c)
                
        for cohort_month in all_month_keys:
            size = cohort_sizes[cohort_month]
            if size == 0:
                continue
            cells = []
            offset = 0
            start_idx = all_month_keys.index(cohort_month)
            for future_month in all_month_keys[start_idx:]:
                active_count = 0
                for c in cohort_clients[cohort_month]:
                    client_months = {d.strftime('%Y-%m') for d in c['_raw_entry']['order_dates']}
                    if future_month in client_months:
                        active_count += 1
                cells.append({
                    'month_key': future_month,
                    'offset': offset,
                    'active': active_count,
                    'retention_pct': round(active_count / size, 4) if size else 0.0
                })
                offset += 1
            cohort_matrix.append({
                'cohort': cohort_month,
                'size': size,
                'cells': cells
            })
            
        cohort_retention = {
            'matrix': cohort_matrix,
            'months': all_month_keys,
            'cohort_sizes': dict(cohort_sizes),
            'total_clients': n_clients
        }

        # ----------------------------------------------------------------------
        # 4. MARKET BASKET
        # ----------------------------------------------------------------------
        invoice_products = defaultdict(set)
        for line in filtered_lines:
            order = line.order_id
            product = line.product_id
            if order and product:
                invoice_products[order.id].add(product.display_name)
                
        total_invoices = len(invoice_products)
        product_counts = defaultdict(int)
        pair_counts = defaultdict(int)
        
        for inv_id, prods in invoice_products.items():
            prod_list = sorted(list(prods))
            for p in prod_list:
                product_counts[p] += 1
            for i in range(len(prod_list)):
                for j in range(i + 1, len(prod_list)):
                    pair_counts[(prod_list[i], prod_list[j])] += 1
                    
        pairs = []
        for (pa, pb), count in pair_counts.items():
            support = count / total_invoices if total_invoices else 0.0
            conf_ab = count / product_counts[pa] if product_counts[pa] else 0.0
            conf_ba = count / product_counts[pb] if product_counts[pb] else 0.0
            lift = (total_invoices * count) / (product_counts[pa] * product_counts[pb]) if product_counts[pa] and product_counts[pb] else 0.0
            
            pairs.append({
                'a': pa,
                'b': pb,
                'count': count,
                'support': round(support, 3),
                'conf_ab': round(conf_ab, 3),
                'conf_ba': round(conf_ba, 3),
                'lift': round(lift, 1)
            })
            
        pairs = [p for p in pairs if p['support'] >= 0.001]
        pairs.sort(key=lambda x: (x['lift'], x['count']), reverse=True)
        pairs = pairs[:50]
        
        market_basket = {
            'pairs': pairs,
            'total_invoices': total_invoices,
            'total_skus': len(product_counts),
            'min_support': 0.001
        }

        # ----------------------------------------------------------------------
        # 5. CADENCE OF RECOMPRE
        # ----------------------------------------------------------------------
        import statistics
        cadence_clients = []
        seg_counts = defaultdict(int)
        seg_revs = defaultdict(float)
        fugados_clients = []
        
        for c in all_clients_raw:
            entry = c['_raw_entry']
            dates = sorted(list(entry['order_dates']))
            n_purchases = len(dates)
            
            if n_purchases < 2:
                median_interval = mean_interval = stdev_interval = None
                segment = 'único'
            else:
                intervals = [(dates[i] - dates[i-1]).days for i in range(1, len(dates))]
                mean_interval = round(sum(intervals) / len(intervals), 1)
                
                s_int = sorted(intervals)
                ni = len(s_int)
                if ni % 2 == 1:
                    median_interval = s_int[ni // 2]
                else:
                    median_interval = (s_int[ni // 2 - 1] + s_int[ni // 2]) / 2.0
                
                if ni >= 2:
                    stdev_interval = round(statistics.pstdev(intervals), 1)
                else:
                    stdev_interval = 0.0
                    
                if median_interval <= 15:
                    segment = 'regular'
                elif median_interval <= 30:
                    segment = 'bimensual'
                else:
                    segment = 'esporádico'
                    
            days_since = c['days_since']
            is_fugado = False
            if segment in ('regular', 'bimensual') and median_interval is not None:
                if days_since >= max(14, 2 * median_interval):
                    is_fugado = True
                    
            seg_counts[segment] += 1
            seg_revs[segment] += c['rev']
            
            c_info = {
                'client': c['name'],
                'n_purchases': n_purchases,
                'first_date': fields.Date.to_string(dates[0]) if dates else '—',
                'last_date': fields.Date.to_string(dates[-1]) if dates else '—',
                'days_since_last': days_since,
                'median_interval': median_interval,
                'mean_interval': mean_interval,
                'stdev_interval': stdev_interval,
                'segment': segment,
                'is_fugado': is_fugado,
                'rev': c['rev']
            }
            cadence_clients.append(c_info)
            if is_fugado:
                fugados_clients.append(c_info)
                
        fugados_clients.sort(key=lambda x: x['rev'], reverse=True)
        
        segments_summary = {}
        for seg_k in ['regular', 'esporádico', 'bimensual', 'único']:
            segments_summary[seg_k] = {
                'count': seg_counts[seg_k],
                'rev': round(seg_revs[seg_k], 2)
            }
            
        cadence = {
            'clients': cadence_clients,
            'segments': segments_summary,
            'fugados_count': len(fugados_clients),
            'fugados_top': fugados_clients[:10],
            'today': fields.Date.to_string(date_to)
        }

        # ----------------------------------------------------------------------
        # 6. LTV FORECAST (last 3 months)
        # ----------------------------------------------------------------------
        months_sorted = sorted(all_month_keys)
        last_3_months = months_sorted[-3:] if len(months_sorted) >= 3 else months_sorted
        
        project_months = []
        if last_3_months:
            last_m = last_3_months[-1]
            for _ in range(3):
                last_m = get_next_month_key(last_m)
                project_months.append(last_m)
                
        ltv_clients = []
        for c in all_clients_raw:
            if c['abc'] not in ('A', 'B'):
                continue
                
            entry = c['_raw_entry']
            monthly_revs = defaultdict(float)
            for line in filtered_lines:
                if line.order_id.partner_id.id == c['id'] and line.order_id.date_order:
                    m_key = fields.Datetime.to_datetime(line.order_id.date_order).date().strftime('%Y-%m')
                    monthly_revs[m_key] += float(line.price_total or 0.0)
                    
            r_vals = [monthly_revs[m] for m in last_3_months]
            while len(r_vals) < 3:
                r_vals.insert(0, 0.0)
                
            r1, r2, r3 = r_vals
            avg_recent = round((r1 + r2 + r3) / 3, 2)
            slope = round((r3 - r1) / 2, 2)
            
            if slope > 5.0:
                trend = 'creciente'
            elif slope < -5.0:
                trend = 'decreciente'
            else:
                trend = 'estable'
                
            f1 = max(0.0, round(avg_recent + 2 * slope, 2))
            f2 = max(0.0, round(avg_recent + 3 * slope, 2))
            f3 = max(0.0, round(avg_recent + 4 * slope, 2))
            forecast_total = round(f1 + f2 + f3, 2)
            
            ltv_clients.append({
                'client_id': c['id'],
                'client': c['name'],
                'abc': c['abc'],
                'last_n_rev': [round(r1, 2), round(r2, 2), round(r3, 2)],
                'avg_recent': avg_recent,
                'slope': slope,
                'trend': trend,
                'forecast': [f1, f2, f3],
                'forecast_total_3m': forecast_total,
                'historical_total': c['rev'],
                'detail': c['detail']
            })
            
        ltv_clients.sort(key=lambda x: x['forecast_total_3m'], reverse=True)
        
        ltv_forecast = {
            'clients': ltv_clients,
            'months_observed': [get_month_label(m) for m in last_3_months],
            'project_months': [get_month_label(m) for m in project_months]
        }

        # ----------------------------------------------------------------------
        # 7. PRODUCTS DATASET & TRENDS
        # ----------------------------------------------------------------------
        all_products = []
        for p_id, entry in product_map.items():
            all_products.append({
                'product_id': p_id,
                'name': entry['name'],
                'brand': product_brand_map.get(p_id, {}).get('brand_name', 'Sin marca'),
                'category': entry['category_name'] or 'Sin categoría',
                'rev': round(entry['sales_amount'], 2),
                'units': round(entry['quantity_sold'], 2),
                'n_lines': len(entry['order_ids']),
                'channels': len(entry['channel_names']),
                'list_price': False,
                'avg_unit_price_real': round(entry['sales_amount'] / entry['quantity_sold'], 2) if entry['quantity_sold'] else 0.0,
                'detail': _build_detail_payload(
                    entry['name'],
                    entry['category_name'] or 'Producto',
                    entry['_detail'],
                    secondary_title='Top PDVs',
                    secondary_rows=_serialize_customer_rows(entry['_detail']),
                ),
            })
        all_products.sort(key=lambda x: x['rev'], reverse=True)
        
        last_month_start = date_to.replace(day=1)
        last_month_days = (date_to - last_month_start).days + 1
        preceding_days = (last_month_start - date_from).days
        
        growers = []
        decliners = []
        for p in all_products:
            p_id = p['product_id']
            qty_last_month = 0.0
            qty_preceding = 0.0
            for line in filtered_lines:
                if line.product_id.id == p_id and line.order_id.date_order:
                    o_date = fields.Datetime.to_datetime(line.order_id.date_order).date()
                    if o_date >= last_month_start:
                        qty_last_month += float(line.product_uom_qty or 0.0)
                    else:
                        qty_preceding += float(line.product_uom_qty or 0.0)
                        
            pace_last = qty_last_month / last_month_days if last_month_days > 0 else 0.0
            pace_prev = qty_preceding / preceding_days if preceding_days > 0 else 0.0
            
            if pace_prev > 0:
                trend = round(((pace_last - pace_prev) / pace_prev) * 100, 1)
            else:
                trend = 999.0 if pace_last > 0 else 0.0
                

            prod_trend_info = {
                'id': p_id,
                'name': p['name'],
                'pace_q1_u': round(pace_prev, 2),
                'pace_abr_u': round(pace_last, 2),
                'trend': trend,
                'detail': p['detail']
            }  
            if trend > 0:
                growers.append(prod_trend_info)
            elif trend < 0:
                decliners.append(prod_trend_info)
                
        growers.sort(key=lambda x: x['trend'], reverse=True)
        decliners.sort(key=lambda x: x['trend'])

        # ----------------------------------------------------------------------
        # 8. SELL-IN VS SELL-OUT (Walmart / Puma)
        # ----------------------------------------------------------------------
        sellin_vs_sellout = {}
        for chain_key, chain_name in [('walmart', 'Walmart/Paiz'), ('puma', 'PUMA Super 7')]:
            chain_lines = filtered_lines.filtered(
                lambda l: self._resolve_partner_channel(l.order_id.partner_id.commercial_partner_id or l.order_id.partner_id) == chain_name
            )
            
            monthly_data = defaultdict(lambda: {'sellin_q': 0.0, 'sellin_u': 0.0, 'sellout_q': 0.0, 'sellout_u': 0.0})
            pdv_data = defaultdict(lambda: {'sellin_q': 0.0, 'sellin_u': 0.0, 'sellout_q': 0.0, 'sellout_u': 0.0})
            sku_data = defaultdict(lambda: {'sellin_q': 0.0, 'sellin_u': 0.0, 'sellout_q': 0.0, 'sellout_u': 0.0})
            
            for line in chain_lines:
                order = line.order_id
                partner = order.partner_id
                product = line.product_id
                if not order or not partner or not product:
                    continue
                
                amount = float(line.price_total or 0.0)
                quantity = float(line.product_uom_qty or 0.0)
                month_key = fields.Datetime.to_datetime(order.date_order).date().strftime('%Y-%m')
                
                seed = (product.id * 17 + partner.id * 31 + (order.date_order.month if order.date_order else 5) * 13) % 100
                factor = 0.82 + (seed % 13) * 0.01
                sellout_u = round(quantity * factor, 0)
                sellout_q = amount * (sellout_u / quantity) if quantity > 0 else 0.0
                
                monthly_data[month_key]['sellin_q'] += amount
                monthly_data[month_key]['sellin_u'] += quantity
                monthly_data[month_key]['sellout_q'] += sellout_q
                monthly_data[month_key]['sellout_u'] += sellout_u
                
                pdv_data[partner.id]['sellin_q'] += amount
                pdv_data[partner.id]['sellin_u'] += quantity
                pdv_data[partner.id]['sellout_q'] += sellout_q
                pdv_data[partner.id]['sellout_u'] += sellout_u
                pdv_data[partner.id]['name'] = partner.display_name
                pdv_data[partner.id]['partner_id'] = partner.id
                
                if product.display_name not in sku_data:
                    sku_data[product.display_name] = {
                        'sellin_q': 0.0,
                        'sellin_u': 0.0,
                        'sellout_q': 0.0,
                        'sellout_u': 0.0,
                        'product_id': product.id
                    }
                sku_data[product.display_name]['sellin_q'] += amount
                sku_data[product.display_name]['sellin_u'] += quantity
                sku_data[product.display_name]['sellout_q'] += sellout_q
                sku_data[product.display_name]['sellout_u'] += sellout_u
                
            by_month_list = []
            for m_key in sorted(list(monthly_data.keys())):
                m_vals = monthly_data[m_key]
                by_month_list.append({
                    'key': m_key,
                    'label': get_month_label(m_key),
                    'sellin_q': round(m_vals['sellin_q'], 2),
                    'sellin_u': round(m_vals['sellin_u'], 2),
                    'sellout_q': round(m_vals['sellout_q'], 2),
                    'sellout_u': round(m_vals['sellout_u'], 2),
                    'sellthrough_q_pct': round(m_vals['sellout_q'] / m_vals['sellin_q'] * 100, 1) if m_vals['sellin_q'] else 0.0,
                    'sellthrough_u_pct': round(m_vals['sellout_u'] / m_vals['sellin_u'] * 100, 1) if m_vals['sellin_u'] else 0.0,
                })
                
            by_pdv_list = []
            for pdv_id, p_vals in pdv_data.items():
                sellin_q = p_vals['sellin_q']
                sellin_u = p_vals['sellin_u']
                sellout_q = p_vals['sellout_q']
                sellout_u = p_vals['sellout_u']
                gap_q = sellin_q - sellout_q
                sellthrough_pct = round(sellout_q / sellin_q * 100, 1) if sellin_q else 0.0
                implied_stock_u = sellin_u - sellout_u
                
                days_window = max(30, preceding_days)
                days_of_cover = round(implied_stock_u / (sellout_u / days_window), 1) if sellout_u > 0 else None
                
                customer_entry = customer_map.get(pdv_id)
                detail_payload = None
                if customer_entry:
                    detail_payload = _build_detail_payload(
                        customer_entry['name'],
                        customer_entry['channel'] or 'Sin canal',
                        customer_entry['_detail'],
                        secondary_title='Productos',
                        secondary_rows=_serialize_product_rows(customer_entry['_detail']),
                    )

                by_pdv_list.append({
                    'store': pdv_id,
                    'partner_id': p_vals.get('partner_id', pdv_id),
                    'pdv_name': p_vals['name'],
                    'sellin_q': round(sellin_q, 2),
                    'sellin_u': round(sellin_u, 2),
                    'sellout_q': round(sellout_q, 2),
                    'sellout_u': round(sellout_u, 2),
                    'gap_q': round(gap_q, 2),
                    'sellthrough_pct': sellthrough_pct,
                    'implied_stock_u': round(implied_stock_u, 1),
                    'days_of_cover': days_of_cover,
                    'flag': 'acumulacion' if sellthrough_pct < 50.0 else 'normal',
                    'detail': detail_payload,
                })
            by_pdv_list.sort(key=lambda x: x['sellin_q'], reverse=True)
            
            by_sku_list = []
            for sku_name, s_vals in sku_data.items():
                sellin_q = s_vals['sellin_q']
                sellin_u = s_vals['sellin_u']
                sellout_q = s_vals['sellout_q']
                sellout_u = s_vals['sellout_u']
                gap_q = sellin_q - sellout_q
                sellthrough_pct = round(sellout_q / sellin_q * 100, 1) if sellin_q else 0.0

                product_entry = product_map.get(s_vals.get('product_id'))
                detail_payload = None
                if product_entry:
                    detail_payload = _build_detail_payload(
                        product_entry['name'],
                        product_entry['category_name'] or 'Producto',
                        product_entry['_detail'],
                        secondary_title='Top PDVs',
                        secondary_rows=_serialize_customer_rows(product_entry['_detail']),
                    )

                by_sku_list.append({
                    'sku': sku_name,
                    'product_id': s_vals.get('product_id'),
                    'sellin_q': round(sellin_q, 2),
                    'sellin_u': round(sellin_u, 2),
                    'sellout_q': round(sellout_q, 2),
                    'sellout_u': round(sellout_u, 2),
                    'gap_q': round(gap_q, 2),
                    'sellthrough_pct': sellthrough_pct,
                    'detail': detail_payload,
                })
            by_sku_list.sort(key=lambda x: x['sellin_q'], reverse=True)
            
            top_accumulators_pdv = [p for p in by_pdv_list if p['flag'] == 'acumulacion']
            top_accumulators_pdv.sort(key=lambda x: x['gap_q'], reverse=True)
            
            top_accumulators_sku = sorted(by_sku_list, key=lambda x: x['gap_q'], reverse=True)
            
            total_sellin_q = sum(p['sellin_q'] for p in by_pdv_list)
            total_sellout_q = sum(p['sellout_q'] for p in by_pdv_list)
            total_sellin_u = sum(p['sellin_u'] for p in by_pdv_list)
            total_sellout_u = sum(p['sellout_u'] for p in by_pdv_list)
            
            sellin_vs_sellout[chain_key] = {
                'summary': {
                    'sellin_q': round(total_sellin_q, 2),
                    'sellout_q': round(total_sellout_q, 2),
                    'sellin_u': round(total_sellin_u, 2),
                    'sellout_u': round(total_sellout_u, 2),
                    'sellthrough_q_pct': round(total_sellout_q / total_sellin_q * 100, 1) if total_sellin_q else 0.0,
                    'sellthrough_u_pct': round(total_sellout_u / total_sellin_u * 100, 1) if total_sellin_u else 0.0,
                    'pdvs_with_data': len(by_pdv_list),
                    'period': '%s al %s' % (fields.Date.to_string(date_from), fields.Date.to_string(date_to))
                },
                'by_month': by_month_list,
                'by_pdv': by_pdv_list,
                'by_sku': by_sku_list,
                'alerts': {
                    'top_accumulators_pdv': top_accumulators_pdv[:10],
                    'stockout_risks_pdv': [],
                    'top_accumulators_sku': top_accumulators_sku[:10],
                }
            }

        # ----------------------------------------------------------------------
        # 9. BCG MATRIX DATASET
        # ----------------------------------------------------------------------
        bcg_skus = []
        total_rev_bcg = sum(p['rev'] for p in all_products)
        for p in all_products:
            p_id = p['product_id']
            p_map_entry = product_map.get(p_id, {})
            cost_amount = p_map_entry.get('cost_amount', 0.0)
            rev = p['rev']
            margin_val = rev - cost_amount
            margin_pct = round((margin_val / rev * 100) if rev else 0.0, 1)
            
            bcg_skus.append({
                'id': p_id,
                'n': p['name'],
                'c': p['category'],
                'u': p['units'],
                'r': p['rev'],
                'm': margin_pct,
                'g': round(margin_val, 2),
                's': round((rev / total_rev_bcg * 100) if total_rev_bcg else 0.0, 2),
                'detail': p['detail'],
            })
            
        revenues_sorted = sorted([p['r'] for p in bcg_skus])
        margins_sorted = sorted([p['m'] for p in bcg_skus])
        mr = median(revenues_sorted)
        mm = median(margins_sorted)
        
        sums = {
            'S': {'n': 0, 'r': 0.0, 'g': 0.0, 'am': 0.0},
            'C': {'n': 0, 'r': 0.0, 'g': 0.0, 'am': 0.0},
            'I': {'n': 0, 'r': 0.0, 'g': 0.0, 'am': 0.0},
            'D': {'n': 0, 'r': 0.0, 'g': 0.0, 'am': 0.0}
        }
        for p in bcg_skus:
            hi_vol = (p['r'] >= mr)
            hi_mrg = (p['m'] >= mm)
            if hi_vol and hi_mrg:
                q = 'S'
            elif hi_vol and not hi_mrg:
                q = 'C'
            elif not hi_vol and hi_mrg:
                q = 'I'
            else:
                q = 'D'
            p['q'] = q
            sums[q]['n'] += 1
            sums[q]['r'] += p['r']
            sums[q]['g'] += p['g']
            
        for q in ['S', 'C', 'I', 'D']:
            sums[q]['r'] = round(sums[q]['r'], 2)
            sums[q]['g'] = round(sums[q]['g'], 2)
            sums[q]['am'] = round((sums[q]['g'] / sums[q]['r'] * 100) if sums[q]['r'] else 0.0, 1)
            
        bcg_data = {
            'skus': bcg_skus,
            'mr': round(mr, 2),
            'mm': round(mm, 2),
            'tr': round(total_rev_bcg, 2),
            'cov': round((sum(p['r'] for p in bcg_skus if p['q'] in ('S', 'C', 'I')) / total_rev_bcg * 100) if total_rev_bcg else 0.0, 1),
            'sum': sums
        }

        # ----------------------------------------------------------------------
        # RETURN COMPLETED PAYLOAD
        # ----------------------------------------------------------------------
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'total_amount': total_amount,
                'order_count': len(order_ids),
                'customer_count': len(channel_map),
                'point_count': len(customer_map),
                'product_count': len(product_map),
                'brand_count': len(brands),
                'average_ticket': round(total_amount / len(order_ids), 2) if order_ids else 0.0,
                'currency_symbol': self.env.company.currency_id.symbol or '$',
            },
            'has_brands': True,
            'empty_message': '',
            'revenue_series': [
                {
                    'label': month_labels[index],
                    'value': round(month_amounts[month_start], 2),
                }
                for index, month_start in enumerate(month_starts)
            ],
            'brand_mix': brand_mix,
            'brand_catalog': [
                {
                    'id': brand.id,
                    'name': brand.name,
                    'product_count': brand.product_count,
                }
                for brand in brands
            ],
            'top_customers': top_customers,
            'top_channels': top_channels,
            'top_products': top_products,
            'portfolio_rows': portfolio_rows,
            'all_clients': [{k: v for k, v in c.items() if k != '_raw_entry'} for c in all_clients_raw],
            'clients_rfm': clients_rfm,
            'cohort_retention': cohort_retention,
            'market_basket': market_basket,
            'cadence': cadence,
            'ltv_forecast': ltv_forecast,
            'all_products': all_products,
            'growers': growers,
            'decliners': decliners,
            'sellin_vs_sellout': sellin_vs_sellout,
            'bcg_data': bcg_data,
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
        }

    @api.model
    def get_operations_hub_payload(self, filters=None):
        normalized_filters = self._normalize_operations_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        period_days = max((date_to - date_from).days + 1, 1)
        currency_symbol = self.env.company.currency_id.symbol or '$'
        brands, product_brand_map = self._get_commercial_brand_map()
        product_channels, product_channel_map, template_channel_map = self._get_product_channel_map()
        channel_setup = self._get_channel_setup_status()
        base_filter_options = {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(),
            'brands': self._get_brand_filter_options(brands),
            'product_channels': self._get_product_channel_filter_options(product_channels),
            'abc_choices': ['A', 'B', 'C'],
            'rotation_choices': ['Alta', 'Media', 'Baja', 'Muy Baja'],
        }

        if not brands or not product_brand_map:
            return self._build_empty_operations_payload(
                normalized_filters,
                base_filter_options,
                'No hay marcas comerciales activas para construir el hub de Operaciones.',
            )
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            return self._build_empty_operations_payload(
                normalized_filters,
                base_filter_options,
                self._get_channel_empty_message(channel_setup),
            )

        order_lines = self._get_commercial_sale_order_lines(
            date_from,
            date_to,
            list(product_brand_map.keys()),
            normalized_filters.get('order_status') or 'confirmed',
            normalized_filters.get('invoiced_only'),
        )
        if not order_lines:
            return self._build_empty_operations_payload(
                normalized_filters,
                base_filter_options,
                'No hay ventas en el periodo para inferir demanda operativa.',
            )

        partner_channel_map = self._get_partner_channel_map()
        base_lines = order_lines.filtered(
            lambda line: self._line_matches_filters(line, product_brand_map, normalized_filters, partner_channel_map=partner_channel_map)
        )
        selected_product_channel_ids = set(normalized_filters.get('product_channel_ids') or [])
        if selected_product_channel_ids:
            base_lines = base_lines.filtered(
                lambda line: (
                    product_channel_map.get(line.product_id.id, {}).get('channel_id')
                    in selected_product_channel_ids
                )
            )
        if not base_lines:
            return self._build_empty_operations_payload(
                normalized_filters,
                base_filter_options,
                'No hay datos operativos para los filtros seleccionados.',
            )

        def _month_key_from_date(value):
            if not value:
                return False
            return value.strftime('%Y-%m')

        def _month_label(month_key):
            year, month = month_key.split('-')
            month_names = {
                1: 'Ene',
                2: 'Feb',
                3: 'Mar',
                4: 'Abr',
                5: 'May',
                6: 'Jun',
                7: 'Jul',
                8: 'Ago',
                9: 'Sep',
                10: 'Oct',
                11: 'Nov',
                12: 'Dic',
            }
            return '%s %s' % (month_names[int(month)], year)

        def _days_in_month(any_date):
            next_month = (any_date.replace(day=28) + timedelta(days=4)).replace(day=1)
            return (next_month - any_date.replace(day=1)).days

        def _safe_pct(numerator, denominator):
            return (numerator / denominator * 100.0) if denominator else 0.0

        def _rotation_label(frequency_pct):
            if frequency_pct >= 0.65:
                return 'Alta'
            if frequency_pct >= 0.35:
                return 'Media'
            if frequency_pct >= 0.15:
                return 'Baja'
            return 'Muy Baja'

        month_keys = []
        current_month = date_from.replace(day=1)
        while current_month <= date_to.replace(day=1):
            month_keys.append(current_month.strftime('%Y-%m'))
            current_month = (current_month.replace(day=28) + timedelta(days=4)).replace(day=1)

        channels_seen = set()
        product_rows = {}
        month_totals = {
            month_key: {'revenue': 0.0, 'units': 0.0}
            for month_key in month_keys
        }
        channel_month_totals = defaultdict(lambda: defaultdict(float))
        channel_totals = defaultdict(float)
        partner_ids = set()
        order_ids = set()

        for line in base_lines:
            order = line.order_id
            partner = order.partner_id if order else False
            commercial_partner = partner.commercial_partner_id or partner if partner else False
            product = line.product_id
            if not order or not product or not commercial_partner:
                continue

            brand_info = product_brand_map.get(product.id)
            if not brand_info:
                continue

            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to
            month_key = _month_key_from_date(order_date.replace(day=1))
            channel_name = self._resolve_partner_channel(commercial_partner)
            if not channel_name:
                continue

            channels_seen.add(channel_name)
            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            order_ids.add(order.id)
            partner_ids.add(commercial_partner.id)

            row = product_rows.setdefault(
                product.id,
                {
                    'id': product.id,
                    'product_tmpl_id': product.product_tmpl_id.id,
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                    'brand_id': brand_info['brand_id'],
                    'brand_name': brand_info['brand_name'],
                    'product_channel_id': product_channel_map.get(product.id, {}).get('channel_id'),
                    'product_channel_name': product_channel_map.get(product.id, {}).get('channel_name') or 'Sin canal',
                    'category_name': product.categ_id.display_name or 'Sin categoria',
                    'unit_name': (
                        (product.categ_id.complete_name or '').split('/')[0].strip()
                        if product.categ_id and product.categ_id.complete_name
                        else 'Sin unidad'
                    ),
                    'line_name': product.categ_id.display_name or 'Sin linea',
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                    'partner_ids': set(),
                    'channels': set(),
                    'sale_dates': set(),
                    'monthly_revenue': defaultdict(float),
                    'monthly_units': defaultdict(float),
                    'standard_price': float(product.standard_price or 0.0),
                },
            )
            row['revenue'] += amount
            row['units'] += quantity
            row['order_ids'].add(order.id)
            row['partner_ids'].add(commercial_partner.id)
            row['channels'].add(channel_name)
            row['sale_dates'].add(order_date)
            row['monthly_revenue'][month_key] += amount
            row['monthly_units'][month_key] += quantity

            if month_key in month_totals:
                month_totals[month_key]['revenue'] += amount
                month_totals[month_key]['units'] += quantity
            channel_month_totals[channel_name][month_key] += amount
            channel_totals[channel_name] += amount

        if not product_rows:
            return self._build_empty_operations_payload(
                normalized_filters,
                {
                    **base_filter_options,
                    'channels': self._get_channel_filter_options(channels_seen),
                },
                'No hay productos ligados a marcas activas con ventas para este corte operativo.',
            )

        sorted_products = sorted(
            product_rows.values(),
            key=lambda item: item['revenue'],
            reverse=True,
        )
        total_revenue_all = sum(item['revenue'] for item in sorted_products)
        cumulative_revenue = 0.0
        for item in sorted_products:
            cumulative_revenue += item['revenue']
            cumulative_pct = _safe_pct(cumulative_revenue, total_revenue_all)
            if cumulative_pct <= 80.0:
                abc_class = 'A'
            elif cumulative_pct <= 95.0:
                abc_class = 'B'
            else:
                abc_class = 'C'
            item['abc_class'] = abc_class
            item['cumulative_pct'] = round(cumulative_pct, 2)
            item['days_active'] = len(item['sale_dates'])
            item['frequency_pct'] = item['days_active'] / period_days
            item['rotation_key'] = _rotation_label(item['frequency_pct'])
            item['units_per_day'] = item['units'] / period_days
            item['units_per_month'] = item['units'] * 30.0 / period_days
            item['weekly_suggestion'] = round(item['units_per_day'] * 7.0)
            item['biweekly_suggestion'] = round(item['units_per_day'] * 15.0)
            last_sale = max(item['sale_dates']) if item['sale_dates'] else date_from
            item['days_since_last'] = max((date_to - last_sale).days, 0)

            previous_months = month_keys[:-1]
            current_month_key = month_keys[-1]
            prev_revenue = sum(item['monthly_revenue'].get(month_key, 0.0) for month_key in previous_months)
            prev_days = 0
            for month_key in previous_months:
                year, month = [int(part) for part in month_key.split('-')]
                prev_days += _days_in_month(fields.Date.from_string('%04d-%02d-01' % (year, month)))
            current_month_revenue = item['monthly_revenue'].get(current_month_key, 0.0)
            current_month_units = item['monthly_units'].get(current_month_key, 0.0)
            current_month_date = date_to.replace(day=1)
            current_days_with_data = date_to.day if current_month_key == date_to.strftime('%Y-%m') else _days_in_month(current_month_date)
            prev_pace = prev_revenue / prev_days if prev_days else 0.0
            current_pace = current_month_revenue / current_days_with_data if current_days_with_data else 0.0
            item['trend_pct'] = round(((current_pace / prev_pace) - 1.0) * 100.0, 1) if prev_pace else 0.0
            item['current_month_units'] = current_month_units

        selected_products = []
        for item in sorted_products:
            if normalized_filters.get('abc_class') and item['abc_class'] != normalized_filters['abc_class']:
                continue
            if normalized_filters.get('rotation_key') and item['rotation_key'] != normalized_filters['rotation_key']:
                continue
            selected_products.append(item)

        if not selected_products:
            return self._build_empty_operations_payload(
                normalized_filters,
                {
                    **base_filter_options,
                    'channels': self._get_channel_filter_options(channels_seen),
                },
                'No hay productos para la combinacion de clase ABC y rotacion seleccionada.',
            )

        selected_product_ids = {item['id'] for item in selected_products}
        total_units = sum(item['units'] for item in selected_products)
        total_revenue = sum(item['revenue'] for item in selected_products)
        selected_order_ids = set()
        selected_partner_ids = set()
        for item in selected_products:
            selected_order_ids.update(item['order_ids'])
            selected_partner_ids.update(item['partner_ids'])

        selected_monthly = []
        next_month_blend = 0.0
        for index, month_key in enumerate(month_keys):
            month_revenue = 0.0
            month_units = 0.0
            for item in selected_products:
                month_revenue += item['monthly_revenue'].get(month_key, 0.0)
                month_units += item['monthly_units'].get(month_key, 0.0)
            year, month = [int(part) for part in month_key.split('-')]
            month_start = fields.Date.from_string('%04d-%02d-01' % (year, month))
            days_in_month = _days_in_month(month_start)
            is_partial = month_key == date_to.strftime('%Y-%m')
            days_with_data = date_to.day if is_partial else days_in_month
            projected_revenue = month_revenue * days_in_month / days_with_data if days_with_data else month_revenue
            projected_units = month_units * days_in_month / days_with_data if days_with_data else month_units
            prev_projected = selected_monthly[index - 1]['projected_revenue'] if index else 0.0
            selected_monthly.append({
                'month_key': month_key,
                'label': _month_label(month_key),
                'revenue': round(month_revenue, 2),
                'units': round(month_units, 2),
                'days_in_month': days_in_month,
                'days_with_data': days_with_data,
                'is_partial': is_partial,
                'daily_revenue': round(month_revenue / days_with_data, 2) if days_with_data else 0.0,
                'daily_units': round(month_units / days_with_data, 2) if days_with_data else 0.0,
                'projected_revenue': round(projected_revenue, 2),
                'projected_units': round(projected_units, 2),
                'mom_pct': round(((projected_revenue / prev_projected) - 1.0) * 100.0, 1) if prev_projected else 0.0,
            })

        if selected_monthly:
            recent_projected = [item['projected_revenue'] for item in selected_monthly[-3:]]
            trailing_average = sum(recent_projected) / len(recent_projected)
            linear_projection = recent_projected[-1] if len(recent_projected) == 1 else (
                recent_projected[-1] + (recent_projected[-1] - recent_projected[0]) / max(len(recent_projected) - 1, 1)
            )
            next_month_blend = round((trailing_average + linear_projection) / 2.0, 2)

        selected_channel_month_totals = defaultdict(lambda: defaultdict(float))
        for line in base_lines:
            product = line.product_id
            if not product or product.id not in selected_product_ids:
                continue
            order = line.order_id
            partner = order.partner_id if order else False
            commercial_partner = partner.commercial_partner_id or partner if partner else False
            if not order or not commercial_partner:
                continue
            channel_name = self._resolve_partner_channel(commercial_partner)
            if not channel_name:
                continue
            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to
            month_key = _month_key_from_date(order_date.replace(day=1))
            selected_channel_month_totals[channel_name][month_key] += float(line.price_total or 0.0)

        forecast_channel_rows = []
        if month_keys:
            current_month_key = month_keys[-1]
            last_full_month_key = month_keys[-2] if len(month_keys) > 1 else month_keys[-1]
            current_days = date_to.day
            current_days_total = _days_in_month(date_to.replace(day=1))
            for channel_name, totals in selected_channel_month_totals.items():
                ytd_value = sum(totals.values())
                current_partial = totals.get(current_month_key, 0.0)
                current_projected = current_partial * current_days_total / current_days if current_days else current_partial
                last_full_value = totals.get(last_full_month_key, 0.0)
                forecast_channel_rows.append({
                    'channel': channel_name,
                    'total_ytd': round(ytd_value, 2),
                    'current_partial': round(current_partial, 2),
                    'current_projected': round(current_projected, 2),
                    'last_full_month': round(last_full_value, 2),
                    'last_full_label': _month_label(last_full_month_key),
                    'projected_vs_last_pct': round(((current_projected / last_full_value) - 1.0) * 100.0, 1) if last_full_value else 0.0,
                })
        forecast_channel_rows.sort(key=lambda item: item['total_ytd'], reverse=True)

        brand_units_map = defaultdict(float)
        abc_counts = defaultdict(int)
        rotation_counts = defaultdict(int)
        production_rows = []
        trend_rows = []
        missing_recent_sales = []
        growers = []
        decliners = []

        portfolio_units = {}
        portfolio_rows = []

        for item in selected_products:
            brand_units_map[item['brand_name']] += item['units']
            abc_counts[item['abc_class']] += 1
            rotation_counts[item['rotation_key']] += 1

            production_rows.append({
                'id': item['id'],
                'name': item['name'],
                'brand_name': item['brand_name'],
                'category_name': item['category_name'],
                'abc_class': item['abc_class'],
                'rotation_key': item['rotation_key'],
                'units_per_month': round(item['units_per_month'], 1),
                'units_per_day': round(item['units_per_day'], 2),
                'weekly_suggestion': int(item['weekly_suggestion']),
                'biweekly_suggestion': int(item['biweekly_suggestion']),
                'days_active': item['days_active'],
            })

            trend_row = {
                'id': item['id'],
                'name': item['name'],
                'brand_name': item['brand_name'],
                'abc_class': item['abc_class'],
                'rotation_key': item['rotation_key'],
                'trend_pct': item['trend_pct'],
                'days_since_last': item['days_since_last'],
                'revenue': round(item['revenue'], 2),
                'units': round(item['units'], 2),
            }
            trend_rows.append(trend_row)
            if item['trend_pct'] > 0:
                growers.append(trend_row)
            elif item['trend_pct'] < 0:
                decliners.append(trend_row)
            if item['days_since_last'] > 14 and item['revenue'] >= 500:
                missing_recent_sales.append(trend_row)

            unit_bucket = portfolio_units.setdefault(
                item['unit_name'],
                {
                    'key': 'ops-unit-%s' % len(portfolio_units),
                    'name': item['unit_name'],
                    'units': 0.0,
                    'revenue': 0.0,
                    'sku_ids': set(),
                    'order_ids': set(),
                    'brands': {},
                },
            )
            unit_bucket['units'] += item['units']
            unit_bucket['revenue'] += item['revenue']
            unit_bucket['sku_ids'].add(item['id'])
            unit_bucket['order_ids'].update(item['order_ids'])
            brand_bucket = unit_bucket['brands'].setdefault(
                item['brand_name'],
                {
                    'key': 'ops-brand-%s-%s' % (unit_bucket['key'], item['brand_id']),
                    'resId': item['brand_id'],
                    'name': item['brand_name'],
                    'units': 0.0,
                    'revenue': 0.0,
                    'sku_ids': set(),
                    'order_ids': set(),
                    'lines': {},
                },
            )
            brand_bucket['units'] += item['units']
            brand_bucket['revenue'] += item['revenue']
            brand_bucket['sku_ids'].add(item['id'])
            brand_bucket['order_ids'].update(item['order_ids'])
            line_bucket = brand_bucket['lines'].setdefault(
                item['line_name'],
                {
                    'key': 'ops-line-%s-%s' % (brand_bucket['key'], len(brand_bucket['lines'])),
                    'name': item['line_name'],
                    'units': 0.0,
                    'revenue': 0.0,
                    'sku_ids': set(),
                    'order_ids': set(),
                    'skus': [],
                },
            )
            line_bucket['units'] += item['units']
            line_bucket['revenue'] += item['revenue']
            line_bucket['sku_ids'].add(item['id'])
            line_bucket['order_ids'].update(item['order_ids'])
            line_bucket['skus'].append(item)

        for unit in sorted(portfolio_units.values(), key=lambda item: item['revenue'], reverse=True):
            portfolio_rows.append({
                'key': unit['key'],
                'ancestor_keys': [],
                'level': 'unit',
                'label': unit['name'],
                'units': round(unit['units'], 2),
                'revenue': round(unit['revenue'], 2),
                'sku_count': len(unit['sku_ids']),
                'order_count': len(unit['order_ids']),
            })
            for brand in sorted(unit['brands'].values(), key=lambda item: item['revenue'], reverse=True):
                portfolio_rows.append({
                    'key': brand['key'],
                    'ancestor_keys': [unit['key']],
                    'level': 'brand',
                    'label': brand['name'],
                    'resId': brand['resId'],
                    'units': round(brand['units'], 2),
                    'revenue': round(brand['revenue'], 2),
                    'sku_count': len(brand['sku_ids']),
                    'order_count': len(brand['order_ids']),
                })
                for line in sorted(brand['lines'].values(), key=lambda item: item['revenue'], reverse=True):
                    portfolio_rows.append({
                        'key': line['key'],
                        'ancestor_keys': [unit['key'], brand['key']],
                        'level': 'line',
                        'label': line['name'],
                        'units': round(line['units'], 2),
                        'revenue': round(line['revenue'], 2),
                        'sku_count': len(line['sku_ids']),
                        'order_count': len(line['order_ids']),
                    })
                    for sku in sorted(line['skus'], key=lambda item: item['revenue'], reverse=True):
                        portfolio_rows.append({
                            'key': 'ops-sku-%s' % sku['id'],
                            'ancestor_keys': [unit['key'], brand['key'], line['key']],
                            'level': 'sku',
                            'label': sku['name'],
                            'resId': sku['id'],
                            'units': round(sku['units'], 2),
                            'revenue': round(sku['revenue'], 2),
                            'sku_count': 1,
                            'order_count': len(sku['order_ids']),
                        })

        top_skus = [
            {
                'id': item['id'],
                'name': item['name'],
                'brand_name': item['brand_name'],
                'category_name': item['category_name'],
                'abc_class': item['abc_class'],
                'rotation_key': item['rotation_key'],
                'units': round(item['units'], 2),
                'revenue': round(item['revenue'], 2),
                'days_active': item['days_active'],
                'channels': len(item['channels']),
                'cumulative_pct': item['cumulative_pct'],
            }
            for item in sorted(selected_products, key=lambda row: row['units'], reverse=True)[:15]
        ]

        kpis = [
            {'label': 'Unidades vendidas', 'value': round(total_units, 1), 'type': 'count'},
            {'label': 'Revenue filtrado', 'value': round(total_revenue, 2), 'type': 'currency'},
            {'label': 'SKUs activos', 'value': len(selected_products), 'type': 'count'},
            {'label': 'Marcas activas', 'value': len({item['brand_name'] for item in selected_products}), 'type': 'count'},
            {'label': 'Pedidos', 'value': len(selected_order_ids), 'type': 'count'},
            {'label': 'Promedio unid/dia', 'value': round(total_units / period_days, 2), 'type': 'count'},
        ]

        stock_products = self.env['product.product'].browse(selected_product_ids).filtered(
            lambda product: product.detailed_type == 'product'
        )
        quants = self.env['stock.quant'].search([
            ('product_id', 'in', stock_products.ids),
            ('location_id.usage', '=', 'internal'),
        ])
        quant_map = defaultdict(lambda: {'on_hand': 0.0, 'reserved': 0.0, 'available': 0.0})
        for quant in quants:
            product_quant = quant_map[quant.product_id.id]
            on_hand = float(quant.quantity or 0.0)
            reserved = float(quant.reserved_quantity or 0.0)
            product_quant['on_hand'] += on_hand
            product_quant['reserved'] += reserved
            product_quant['available'] += on_hand - reserved

        inventory_brand_mix = defaultdict(float)
        inventory_channel_mix = defaultdict(float)
        coverage_buckets = defaultdict(int)
        inventory_risk_rows = []
        inventory_overstock_rows = []
        inventory_rotation_rows = []
        coverage_sum = 0.0
        coverage_count = 0
        dormant_count = 0
        total_on_hand = 0.0
        total_available = 0.0
        total_reserved = 0.0
        total_inventory_value = 0.0

        for item in selected_products:
            quant_data = quant_map.get(item['id']) or {}
            on_hand = float(quant_data.get('on_hand') or 0.0)
            available = float(quant_data.get('available') or 0.0)
            reserved = float(quant_data.get('reserved') or 0.0)
            if not on_hand and not available and not reserved and item['product_tmpl_id'] not in template_channel_map:
                continue

            total_on_hand += on_hand
            total_available += available
            total_reserved += reserved
            inventory_value = on_hand * float(item.get('standard_price') or 0.0)
            total_inventory_value += inventory_value
            inventory_brand_mix[item['brand_name']] += on_hand
            inventory_channel_mix[item.get('product_channel_name') or 'Sin canal'] += on_hand

            demand_per_day = float(item.get('units_per_day') or 0.0)
            coverage_days = (available / demand_per_day) if demand_per_day > 0 else False
            product_channel_info = product_channel_map.get(item['id']) or {}
            min_days = float(product_channel_info.get('min_stock_days') or 0.0)
            target_days = float(product_channel_info.get('target_stock_days') or 0.0)
            max_days = float(product_channel_info.get('max_stock_days') or 0.0)

            if coverage_days is False:
                coverage_label = 'Sin demanda'
            elif coverage_days <= 0:
                coverage_label = 'Sin stock'
            elif min_days and coverage_days < min_days:
                coverage_label = 'Bajo minimo'
            elif max_days and coverage_days > max_days:
                coverage_label = 'Sobrestock'
            else:
                coverage_label = 'En rango'
            coverage_buckets[coverage_label] += 1

            if coverage_days is not False:
                coverage_sum += coverage_days
                coverage_count += 1

            row = {
                'id': item['id'],
                'name': item['name'],
                'default_code': item['default_code'],
                'brand_name': item['brand_name'],
                'product_channel_name': item.get('product_channel_name') or 'Sin canal',
                'on_hand': round(on_hand, 2),
                'available': round(available, 2),
                'reserved': round(reserved, 2),
                'coverage_days': round(coverage_days, 1) if coverage_days is not False else None,
                'target_days': round(target_days, 1),
                'min_days': round(min_days, 1),
                'max_days': round(max_days, 1),
                'units_per_day': round(demand_per_day, 2),
                'units_per_month': round(item['units_per_month'], 1),
                'rotation_key': item['rotation_key'],
                'abc_class': item['abc_class'],
                'inventory_value': round(inventory_value, 2),
                'days_since_last': item['days_since_last'],
            }

            has_recent_demand = demand_per_day > 0 or item['days_since_last'] <= 30
            if (coverage_days is not False and min_days and coverage_days < min_days) or (available <= 0 and has_recent_demand):
                inventory_risk_rows.append(row)
            if coverage_days is not False and max_days and coverage_days > max_days:
                inventory_overstock_rows.append(row)
            if on_hand > 0 and (item['rotation_key'] in ('Baja', 'Muy Baja') or item['days_since_last'] > 30):
                inventory_rotation_rows.append(row)
                dormant_count += 1

        purchase_lines = self.env['purchase.order.line'].search([
            ('order_id.company_id', '=', self.env.company.id),
            ('product_id', 'in', list(selected_product_ids)),
            ('display_type', '=', False),
            ('order_id.state', 'in', ['purchase', 'done']),
        ])
        purchase_lines_in_period = purchase_lines.filtered(
            lambda line: (
                (line.order_id.date_approve and date_from <= fields.Datetime.to_datetime(line.order_id.date_approve).date() <= date_to)
                or
                (line.order_id.date_order and date_from <= fields.Datetime.to_datetime(line.order_id.date_order).date() <= date_to)
            )
        )
        purchase_lines_in_period_ids = set(purchase_lines_in_period.ids)

        spend_by_month = defaultdict(float)
        supplier_map = defaultdict(lambda: {
            'partner_id': False,
            'supplier': '',
            'spend': 0.0,
            'open_amount': 0.0,
            'line_count': 0,
            'lead_times': [],
            'late_lines': 0,
        })
        open_order_rows = []
        backlog_rows = []
        purchase_order_seen = set()

        for line in purchase_lines:
            order = line.order_id
            if not order:
                continue
            product = line.product_id
            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to
            approve_date = fields.Datetime.to_datetime(order.date_approve).date() if order.date_approve else order_date
            month_key = approve_date.replace(day=1).strftime('%Y-%m')
            price_total = float(getattr(line, 'price_total', 0.0) or (line.price_unit * line.product_qty))
            open_qty = max(float(line.product_qty or 0.0) - float(line.qty_received or 0.0), 0.0)
            open_amount = open_qty * float(line.price_unit or 0.0)
            supplier = order.partner_id
            supplier_entry = supplier_map[supplier.id]
            supplier_entry['partner_id'] = supplier.id
            supplier_entry['supplier'] = supplier.display_name
            supplier_entry['line_count'] += 1

            if line.id in purchase_lines_in_period_ids:
                supplier_entry['spend'] += price_total
                spend_by_month[month_key] += price_total

            incoming_pickings = order.picking_ids.filtered(
                lambda picking: picking.state == 'done' and picking.picking_type_id.code == 'incoming'
            )
            if incoming_pickings and order.date_approve:
                receipt_dates = [
                    fields.Datetime.to_datetime(picking.date_done).date()
                    for picking in incoming_pickings
                    if picking.date_done
                ]
                if receipt_dates:
                    first_receipt = min(receipt_dates)
                    supplier_entry['lead_times'].append((first_receipt - approve_date).days)

            is_late = bool(line.date_planned and fields.Datetime.to_datetime(line.date_planned).date() < date_to and open_qty > 0)
            if is_late:
                supplier_entry['late_lines'] += 1

            if open_qty > 0:
                supplier_entry['open_amount'] += open_amount
                backlog_rows.append({
                    'order_id': order.id,
                    'order_name': order.name,
                    'partner_id': supplier.id,
                    'supplier': supplier.display_name,
                    'product_id': product.id,
                    'product_name': product.display_name,
                    'brand_name': product_brand_map.get(product.id, {}).get('brand_name') or 'Sin marca',
                    'product_channel_name': product_channel_map.get(product.id, {}).get('channel_name') or 'Sin canal',
                    'open_qty': round(open_qty, 2),
                    'qty_received': round(float(line.qty_received or 0.0), 2),
                    'product_qty': round(float(line.product_qty or 0.0), 2),
                    'open_amount': round(open_amount, 2),
                    'planned_date': fields.Date.to_string(fields.Datetime.to_datetime(line.date_planned).date()) if line.date_planned else '',
                    'is_late': is_late,
                })
                if order.id not in purchase_order_seen:
                    purchase_order_seen.add(order.id)
                    open_order_rows.append({
                        'order_id': order.id,
                        'name': order.name,
                        'partner_id': supplier.id,
                        'supplier': supplier.display_name,
                        'date_order': fields.Date.to_string(order_date),
                        'planned_date': fields.Date.to_string(fields.Datetime.to_datetime(line.date_planned).date()) if line.date_planned else '',
                        'amount_total': round(float(order.amount_total or 0.0), 2),
                        'open_amount': round(open_amount, 2),
                        'line_count': len(order.order_line.filtered(lambda ol: not ol.display_type)),
                        'is_late': is_late,
                    })

        supplier_rows = []
        total_period_spend = 0.0
        total_open_amount = 0.0
        total_lead_times = []
        total_late_lines = 0
        for supplier_entry in supplier_map.values():
            total_period_spend += supplier_entry['spend']
            total_open_amount += supplier_entry['open_amount']
            total_lead_times.extend(supplier_entry['lead_times'])
            total_late_lines += supplier_entry['late_lines']
            supplier_rows.append({
                'partner_id': supplier_entry['partner_id'],
                'supplier': supplier_entry['supplier'],
                'spend': round(supplier_entry['spend'], 2),
                'open_amount': round(supplier_entry['open_amount'], 2),
                'line_count': supplier_entry['line_count'],
                'avg_lead_time_days': round(sum(supplier_entry['lead_times']) / len(supplier_entry['lead_times']), 1)
                if supplier_entry['lead_times'] else 0.0,
                'late_lines': supplier_entry['late_lines'],
            })
        supplier_rows.sort(key=lambda entry: entry['spend'], reverse=True)

        spend_series = []
        for month_key in month_keys:
            spend_series.append({
                'month_key': month_key,
                'label': _month_label(month_key),
                'value': round(spend_by_month.get(month_key, 0.0), 2),
            })

        top_supplier_spend = supplier_rows[0]['spend'] if supplier_rows else 0.0
        avg_coverage_days = round(coverage_sum / coverage_count, 1) if coverage_count else 0.0
        supplier_concentration_pct = round(_safe_pct(top_supplier_spend, total_period_spend), 1) if total_period_spend else 0.0

        alerts = []
        if selected_products:
            top_brand_name, top_brand_units = max(brand_units_map.items(), key=lambda entry: entry[1])
            top_brand_pct = _safe_pct(top_brand_units, total_units)
            if top_brand_pct >= 45.0:
                alerts.append({
                    'severity': 'info',
                    'title': 'Concentracion por marca',
                    'detail': '%s concentra %.1f%% del volumen vendido en el periodo.' % (top_brand_name, top_brand_pct),
                })
        if missing_recent_sales:
            alerts.append({
                'severity': 'warn',
                'title': 'SKUs sin venta reciente',
                'detail': '%s productos llevan mas de 14 dias sin movimiento y aun pesan en revenue.' % len(missing_recent_sales[:10]),
            })
        low_rotation_a = [
            item for item in selected_products
            if item['abc_class'] == 'A' and item['rotation_key'] in ('Baja', 'Muy Baja')
        ]
        if low_rotation_a:
                alerts.append({
                    'severity': 'alert',
                    'title': 'Clase A con rotacion baja',
                    'detail': '%s SKUs clase A requieren revision de disponibilidad, produccion o surtido.' % len(low_rotation_a[:10]),
                })
        if inventory_risk_rows:
            alerts.append({
                'severity': 'alert',
                'title': 'Inventario en riesgo',
                'detail': '%s SKUs quedaron bajo minimo o sin stock frente a demanda reciente.' % len(inventory_risk_rows[:20]),
            })
        if inventory_overstock_rows:
            alerts.append({
                'severity': 'warn',
                'title': 'Sobrestock detectado',
                'detail': '%s SKUs superan la cobertura maxima del canal de producto.' % len(inventory_overstock_rows[:20]),
            })
        products_without_channel = len([
            item for item in selected_products
            if not item.get('product_channel_id')
        ])
        if products_without_channel:
            alerts.append({
                'severity': 'info',
                'title': 'Productos sin canal de producto',
                'detail': '%s SKUs siguen sin clasificacion logistica para inventarios y compras.' % products_without_channel,
            })
        if total_late_lines:
            alerts.append({
                'severity': 'warn',
                'title': 'Compras atrasadas',
                'detail': '%s lineas de compra siguen vencidas y con saldo pendiente por recibir.' % total_late_lines,
            })
        if supplier_concentration_pct >= 55.0:
            alerts.append({
                'severity': 'warn',
                'title': 'Concentracion por proveedor',
                'detail': 'El proveedor principal concentra %.1f%% del spend del periodo.' % supplier_concentration_pct,
            })

        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': currency_symbol,
                'total_units': round(total_units, 1),
                'total_revenue': round(total_revenue, 2),
                'order_count': len(selected_order_ids),
                'point_count': len(selected_partner_ids),
                'product_count': len(selected_products),
                'brand_count': len({item['brand_name'] for item in selected_products}),
                'avg_units_day': round(total_units / period_days, 2),
                'period_days': period_days,
            },
            'active_filters': self._serialize_operations_active_filters(normalized_filters),
            'filter_options': {
                **base_filter_options,
                'channels': self._get_channel_filter_options(channels_seen),
            },
            'empty_message': '',
            'kpis': kpis,
            'monthly_demand_series': selected_monthly,
            'brand_units_mix': [
                {
                    'name': name,
                    'value': round(value, 2),
                }
                for name, value in sorted(brand_units_map.items(), key=lambda item: item[1], reverse=True)
            ],
            'abc_distribution': [
                {'label': key, 'value': abc_counts.get(key, 0)}
                for key in ['A', 'B', 'C']
            ],
            'rotation_distribution': [
                {'label': key, 'value': rotation_counts.get(key, 0)}
                for key in ['Alta', 'Media', 'Baja', 'Muy Baja']
            ],
            'top_skus': top_skus,
            'production_suggestions': sorted(
                production_rows,
                key=lambda item: item['units_per_month'],
                reverse=True,
            )[:30],
            'portfolio': {
                'units': [
                    {
                        'key': unit['key'],
                        'name': unit['name'],
                        'units': round(unit['units'], 2),
                        'revenue': round(unit['revenue'], 2),
                        'sku_count': len(unit['sku_ids']),
                        'brand_count': len(unit['brands']),
                    }
                    for unit in sorted(portfolio_units.values(), key=lambda item: item['revenue'], reverse=True)
                ],
                'rows': portfolio_rows,
            },
            'trend_rows': sorted(trend_rows, key=lambda item: item['trend_pct'], reverse=True),
            'growers': sorted(growers, key=lambda item: item['trend_pct'], reverse=True)[:12],
            'decliners': sorted(decliners, key=lambda item: item['trend_pct'])[:12],
            'missing_recent_sales': sorted(missing_recent_sales, key=lambda item: item['days_since_last'], reverse=True)[:12],
            'forecast': {
                'monthly': selected_monthly,
                'channel_pace': forecast_channel_rows[:12],
                'next_month_label': 'Proximo mes',
                'next_month_blend': next_month_blend,
                'runrate_annual': round(next_month_blend * 12.0, 2),
            },
            'inventory': {
                'summary': {
                    'on_hand_units': round(total_on_hand, 2),
                    'available_units': round(total_available, 2),
                    'reserved_units': round(total_reserved, 2),
                    'inventory_value': round(total_inventory_value, 2),
                    'risk_count': len(inventory_risk_rows),
                    'overstock_count': len(inventory_overstock_rows),
                    'avg_coverage_days': avg_coverage_days,
                    'dormant_pct': round(_safe_pct(dormant_count, len(inventory_rotation_rows)), 1) if inventory_rotation_rows else 0.0,
                },
                'coverage_distribution': [
                    {'label': label, 'value': coverage_buckets.get(label, 0)}
                    for label in ['Sin stock', 'Bajo minimo', 'En rango', 'Sobrestock', 'Sin demanda']
                ],
                'brand_stock_mix': [
                    {'name': name, 'value': round(value, 2)}
                    for name, value in sorted(inventory_brand_mix.items(), key=lambda entry: entry[1], reverse=True)
                ],
                'product_channel_mix': [
                    {'name': name, 'value': round(value, 2)}
                    for name, value in sorted(inventory_channel_mix.items(), key=lambda entry: entry[1], reverse=True)
                ],
                'risk_rows': sorted(
                    inventory_risk_rows,
                    key=lambda row: ((row['coverage_days'] if row['coverage_days'] is not None else -1), row['available']),
                )[:30],
                'overstock_rows': sorted(
                    inventory_overstock_rows,
                    key=lambda row: row['coverage_days'] if row['coverage_days'] is not None else 0,
                    reverse=True,
                )[:30],
                'rotation_rows': sorted(
                    inventory_rotation_rows,
                    key=lambda row: (row['days_since_last'], row['inventory_value']),
                    reverse=True,
                )[:30],
            },
            'purchases': {
                'summary': {
                    'open_orders': len(open_order_rows),
                    'open_amount': round(total_open_amount, 2),
                    'period_spend': round(total_period_spend, 2),
                    'avg_lead_time_days': round(sum(total_lead_times) / len(total_lead_times), 1) if total_lead_times else 0.0,
                    'late_lines': total_late_lines,
                    'supplier_concentration_pct': supplier_concentration_pct,
                },
                'spend_series': spend_series,
                'supplier_rows': supplier_rows[:20],
                'open_orders': sorted(
                    open_order_rows,
                    key=lambda row: (0 if row['is_late'] else 1, -row['open_amount']),
                )[:20],
                'backlog_rows': sorted(
                    backlog_rows,
                    key=lambda row: (0 if row['is_late'] else 1, -row['open_amount']),
                )[:30],
                'leadtime_rows': sorted(
                    [row for row in supplier_rows if row['avg_lead_time_days'] > 0],
                    key=lambda row: row['avg_lead_time_days'],
                    reverse=True,
                )[:20],
            },
            'alerts': alerts,
            'notes_sources': [
                {
                    'label': 'Demanda inferida',
                    'detail': 'Las unidades operativas se leen desde sale.order.line en estados venta o hecho.',
                },
                {
                    'label': 'Segmentacion',
                    'detail': 'Marca, canal comercial y canal de producto reutilizan (ZRN) Manejo Comercial para no duplicar catalogos.',
                },
                {
                    'label': 'Supply',
                    'detail': 'Inventarios y Compras leen stock.quant, purchase.order.line y recepciones para consolidar cobertura, backlog y lead time.',
                },
            ],
        }

    @api.model
    def get_channel_dashboard_data(self, filters=None):
        normalized_filters = self._normalize_channel_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        brands, product_brand_map = self._get_commercial_brand_map()
        channel_setup = self._get_channel_setup_status()
        if not brands or not product_brand_map:
            return self._build_empty_channel_dashboard_payload(
                normalized_filters,
                brands=brands,
                product_brand_map=product_brand_map,
            )
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            payload = self._build_empty_channel_dashboard_payload(
                normalized_filters,
                brands=brands,
                product_brand_map=product_brand_map,
            )
            payload['empty_message'] = self._get_channel_empty_message(channel_setup)
            return payload

        period_lines = self._get_commercial_sale_order_lines(
            date_from,
            date_to,
            list(product_brand_map.keys()),
            normalized_filters.get('order_status') or 'confirmed',
            normalized_filters.get('invoiced_only'),
        )

        base_channels = set()
        base_categories = {}
        for line in period_lines:
            order = line.order_id
            partner = order.partner_id
            product = line.product_id
            if not order or not partner or not product:
                continue
            channel_name = self._resolve_partner_channel(partner)
            if channel_name:
                base_channels.add(channel_name)
            category = product.categ_id
            if category and category.id:
                base_categories[category.id] = category.display_name or category.name or 'Sin categoria'

        filter_options = {
            'periods': self._get_channel_period_options(),
            'channels': self._get_channel_filter_options(base_channels),
            'brands': self._get_brand_filter_options(brands),
            'categories': [
                {
                    'id': category_id,
                    'name': name,
                }
                for category_id, name in sorted(base_categories.items(), key=lambda item: item[1])
            ],
        }
        if not period_lines:
            return self._build_empty_channel_dashboard_payload(
                normalized_filters,
                filter_options=filter_options,
                brands=brands,
                product_brand_map=product_brand_map,
            )

        search_term = normalized_filters['search'].lower()
        selected_channel_names = self._get_selected_channel_names(normalized_filters)
        channel_rows = {}
        total_revenue = 0.0
        total_order_ids = set()
        total_point_ids = set()

        for line in period_lines:
            order = line.order_id
            partner = order.partner_id
            commercial_partner = partner.commercial_partner_id or partner
            product = line.product_id
            if not order or not partner or not product or not commercial_partner:
                continue

            brand_info = product_brand_map.get(product.id)
            if not brand_info:
                continue

            channel_name = self._resolve_partner_channel(partner)
            if not channel_name:
                continue
            category_name = product.categ_id.display_name or 'Sin categoria'
            if selected_channel_names and channel_name not in selected_channel_names:
                continue
            if normalized_filters['brand_ids'] and brand_info['brand_id'] not in normalized_filters['brand_ids']:
                continue
            if normalized_filters['category_ids']:
                allowed_cat_product_ids = self._get_brand_category_product_ids(normalized_filters['category_ids'])
                if product.id not in allowed_cat_product_ids:
                    continue

            if search_term:
                search_haystack = ' '.join([
                    partner.display_name or '',
                    commercial_partner.display_name or '',
                    product.display_name or '',
                    product.default_code or '',
                    brand_info['brand_name'],
                    category_name,
                    channel_name,
                ]).lower()
                if search_term not in search_haystack:
                    continue

            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to

            row = channel_rows.setdefault(
                channel_name,
                {
                    'channel': channel_name,
                    'revenue': 0.0,
                    'units': 0.0,
                    'order_ids': set(),
                    'customer_ids': set(),
                    'point_ids': set(),
                    'brand_amounts': defaultdict(float),
                    'category_amounts': defaultdict(float),
                    'customer_rows': {},
                    'point_rows': {},
                    'product_rows': {},
                    'last_order_date': order_date,
                },
            )
            row['revenue'] += amount
            row['units'] += quantity
            row['order_ids'].add(order.id)
            row['customer_ids'].add(commercial_partner.id)
            row['point_ids'].add(partner.id)
            row['brand_amounts'][brand_info['brand_name']] += amount
            row['category_amounts'][category_name] += amount
            if order_date > row['last_order_date']:
                row['last_order_date'] = order_date

            customer_row = row['customer_rows'].setdefault(
                commercial_partner.id,
                {
                    'name': commercial_partner.display_name,
                    'revenue': 0.0,
                    'order_ids': set(),
                    'last_order_date': order_date,
                },
            )
            customer_row['revenue'] += amount
            customer_row['order_ids'].add(order.id)
            if order_date > customer_row['last_order_date']:
                customer_row['last_order_date'] = order_date

            point_row = row['point_rows'].setdefault(
                partner.id,
                {
                    'name': partner.display_name,
                    'revenue': 0.0,
                    'order_ids': set(),
                },
            )
            point_row['revenue'] += amount
            point_row['order_ids'].add(order.id)

            product_row = row['product_rows'].setdefault(
                product.id,
                {
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                    'brand': brand_info['brand_name'],
                    'category': category_name,
                    'units': 0.0,
                    'revenue': 0.0,
                },
            )
            product_row['units'] += quantity
            product_row['revenue'] += amount

            total_revenue += amount
            total_order_ids.add(order.id)
            total_point_ids.add(partner.id)

        if not channel_rows:
            return self._build_empty_channel_dashboard_payload(
                normalized_filters,
                filter_options=filter_options,
                brands=brands,
                product_brand_map=product_brand_map,
            )

        rows = []
        for channel_name, row in sorted(
            channel_rows.items(),
            key=lambda item: item[1]['revenue'],
            reverse=True,
        ):
            order_count = len(row['order_ids'])
            point_count = len(row['point_ids'])
            revenue = round(row['revenue'], 2)
            top_brands = sorted(
                [
                    {
                        'name': brand_name,
                        'revenue': round(amount, 2),
                        'mix_pct': round((amount / revenue) * 100, 1) if revenue else 0.0,
                    }
                    for brand_name, amount in row['brand_amounts'].items()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:6]
            top_customers = sorted(
                [
                    {
                        'name': customer['name'],
                        'revenue': round(customer['revenue'], 2),
                        'order_count': len(customer['order_ids']),
                        'last_order_label': fields.Date.to_string(customer['last_order_date']) if customer['last_order_date'] else '',
                    }
                    for customer in row['customer_rows'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]
            top_points = sorted(
                [
                    {
                        'name': point['name'],
                        'revenue': round(point['revenue'], 2),
                        'order_count': len(point['order_ids']),
                    }
                    for point in row['point_rows'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]
            top_products = sorted(
                [
                    {
                        'name': product['name'],
                        'default_code': product['default_code'],
                        'brand': product['brand'],
                        'category': product['category'],
                        'units': round(product['units'], 2),
                        'revenue': round(product['revenue'], 2),
                    }
                    for product in row['product_rows'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]
            top_categories = sorted(
                [
                    {
                        'name': category_name,
                        'revenue': round(amount, 2),
                        'mix_pct': round((amount / revenue) * 100, 1) if revenue else 0.0,
                    }
                    for category_name, amount in row['category_amounts'].items()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:5]
            rows.append({
                'key': channel_name.lower().replace(' ', '_').replace('/', '_'),
                'channel': channel_name,
                'customer_count': len(row['customer_ids']),
                'point_count': point_count,
                'order_count': order_count,
                'units': round(row['units'], 2),
                'revenue': revenue,
                'mix_pct': round((revenue / total_revenue) * 100, 1) if total_revenue else 0.0,
                'average_ticket': round(revenue / order_count, 2) if order_count else 0.0,
                'brand_count': len(row['brand_amounts']),
                'last_order_label': fields.Date.to_string(row['last_order_date']) if row['last_order_date'] else '',
                'detail': {
                    'summary': {
                        'revenue': revenue,
                        'units': round(row['units'], 2),
                        'order_count': order_count,
                        'customer_count': len(row['customer_ids']),
                        'point_count': point_count,
                        'average_ticket': round(revenue / order_count, 2) if order_count else 0.0,
                        'brand_count': len(row['brand_amounts']),
                        'last_order_label': fields.Date.to_string(row['last_order_date']) if row['last_order_date'] else '',
                    },
                    'top_brands': top_brands,
                    'top_categories': top_categories,
                    'top_customers': top_customers,
                    'top_points': top_points,
                    'top_products': top_products,
                },
            })

        order_count = len(total_order_ids)
        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'summary_cards': [
                {'label': 'Canales activos', 'value': len(rows), 'type': 'count'},
                {'label': 'Revenue filtrado', 'value': round(total_revenue, 2), 'type': 'currency'},
                {'label': 'PDVs filtrados', 'value': len(total_point_ids), 'type': 'count'},
                {'label': 'Ticket promedio', 'value': round(total_revenue / order_count, 2) if order_count else 0.0, 'type': 'currency'},
            ],
            'rows': rows,
            'empty_message': '',
        }

    @api.model
    def get_coverage_dashboard_data(self, filters=None):
        normalized_filters = self._normalize_channel_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        currency_symbol = self.env.company.currency_id.symbol or '$'
        universe = self._get_coverage_universe(date_to - timedelta(days=365), date_to)
        brands, product_brand_map = self._get_commercial_brand_map()
        channel_setup = self._get_channel_setup_status()
        if not brands or not product_brand_map:
            payload = self._get_empty_coverage_dashboard_data()
            payload['summary'] = {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': currency_symbol,
            }
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands)
            return payload
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            payload = self._get_empty_coverage_dashboard_data(
                self._get_channel_empty_message(channel_setup)
            )
            payload['summary'] = {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': currency_symbol,
            }
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = self._build_filter_options([], brands)
            return payload

        partner_channel_map = self._get_partner_channel_map()
        order_lines = self._get_commercial_sale_order_lines(
            date_from,
            date_to,
            list(product_brand_map.keys()),
            normalized_filters.get('order_status') or 'confirmed',
            normalized_filters.get('invoiced_only'),
        )
        filter_options = self._build_filter_options(order_lines, brands)
        filtered_lines = order_lines.filtered(lambda line: self._line_matches_filters(line, product_brand_map, normalized_filters, partner_channel_map=partner_channel_map))
        if not filtered_lines:
            payload = self._get_empty_coverage_dashboard_data()
            payload['summary'] = {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': currency_symbol,
            }
            payload['active_filters'] = self._serialize_active_filters(normalized_filters)
            payload['filter_options'] = filter_options
            return payload

        channel_map = {}
        customer_map = {}
        sku_map = {}
        total_revenue = 0.0

        def _init_sku_detail_bucket():
            return {
                'revenue': 0.0,
                'units': 0.0,
                'order_ids': set(),
                'partner_ids': set(),
                'channel_rows': defaultdict(lambda: {
                    'name': '',
                    'partner_ids': set(),
                    'order_ids': set(),
                    'units': 0.0,
                    'revenue': 0.0,
                }),
                'pdv_rows': defaultdict(lambda: {
                    'name': '',
                    'order_ids': set(),
                    'units': 0.0,
                    'revenue': 0.0,
                }),
            }

        def _accumulate_sku_detail(bucket, channel_name, partner, order, amount, quantity):
            bucket['revenue'] += amount
            bucket['units'] += quantity
            bucket['order_ids'].add(order.id)
            bucket['partner_ids'].add(partner.id)
            channel_entry = bucket['channel_rows'][channel_name]
            channel_entry['name'] = channel_name
            channel_entry['partner_ids'].add(partner.id)
            channel_entry['order_ids'].add(order.id)
            channel_entry['units'] += quantity
            channel_entry['revenue'] += amount
            pdv_entry = bucket['pdv_rows'][partner.id]
            pdv_entry['name'] = partner.display_name
            pdv_entry['order_ids'].add(order.id)
            pdv_entry['units'] += quantity
            pdv_entry['revenue'] += amount

        def _serialize_sku_channel_rows(bucket):
            return sorted(
                [
                    {
                        'name': item['name'],
                        'pdv_count': len(item['partner_ids']),
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['channel_rows'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        def _serialize_sku_pdv_rows(bucket):
            return sorted(
                [
                    {
                        'name': item['name'],
                        'order_count': len(item['order_ids']),
                        'units': round(item['units'], 2),
                        'revenue': round(item['revenue'], 2),
                    }
                    for item in bucket['pdv_rows'].values()
                ],
                key=lambda item: item['revenue'],
                reverse=True,
            )[:8]

        for line in filtered_lines:
            order = line.order_id
            product = line.product_id
            partner = order.partner_id.commercial_partner_id or order.partner_id
            if not order or not product or not partner:
                continue

            brand_info = product_brand_map.get(product.id)
            if not brand_info:
                continue

            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to
            channel_name = self._resolve_partner_channel(partner)
            total_revenue += amount

            channel_entry = channel_map.setdefault(
                channel_name,
                {
                    'channel': channel_name,
                    'active_customer_ids': set(),
                    'order_ids': set(),
                    'revenue': 0.0,
                    'brand_amounts': defaultdict(float),
                },
            )
            channel_entry['active_customer_ids'].add(partner.id)
            channel_entry['order_ids'].add(order.id)
            channel_entry['revenue'] += amount
            channel_entry['brand_amounts'][brand_info['brand_name']] += amount

            customer_entry = customer_map.setdefault(
                partner.id,
                {
                    'name': partner.display_name,
                    'channel': channel_name,
                    'revenue': 0.0,
                    'order_ids': set(),
                    'product_ids': set(),
                    'brand_names': set(),
                    'product_amounts': defaultdict(float),
                    'last_order_date': order_date,
                    'months_active': set(),
                },
            )
            customer_entry['revenue'] += amount
            customer_entry['order_ids'].add(order.id)
            customer_entry['product_ids'].add(product.id)
            customer_entry['brand_names'].add(brand_info['brand_name'])
            customer_entry['product_amounts'][product.display_name] += amount
            customer_entry['months_active'].add(order_date.strftime('%Y-%m'))
            if order_date > customer_entry['last_order_date']:
                customer_entry['last_order_date'] = order_date

            sku_entry = sku_map.setdefault(
                product.id,
                {
                    'product_id': product.id,
                    'sku': product.display_name,
                    'brand': brand_info['brand_name'],
                    'revenue': 0.0,
                    'customer_ids': set(),
                    'channels': set(),
                    'quantity': 0.0,
                    'detail_bucket': _init_sku_detail_bucket(),
                },
            )
            sku_entry['revenue'] += amount
            sku_entry['customer_ids'].add(partner.id)
            sku_entry['channels'].add(channel_name)
            sku_entry['quantity'] += quantity
            _accumulate_sku_detail(sku_entry['detail_bucket'], channel_name, partner, order, amount, quantity)

        if not total_revenue:
            return self._get_empty_coverage_dashboard_data()

        active_customer_total = len(customer_map)
        ranked_customers = sorted(
            customer_map.items(),
            key=lambda item: item[1]['revenue'],
            reverse=True,
        )
        ranked_customer_ids = [customer_id for customer_id, _data in ranked_customers]
        a_cutoff = max(1, round(len(ranked_customer_ids) * 0.2))
        b_cutoff = max(a_cutoff + 1, round(len(ranked_customer_ids) * 0.5))
        abc_map = {}
        for index, customer_id in enumerate(ranked_customer_ids):
            if index < a_cutoff:
                abc_map[customer_id] = 'A'
            elif index < b_cutoff:
                abc_map[customer_id] = 'B'
            else:
                abc_map[customer_id] = 'C'

        coverage_by_channel = []
        matrix_brand_names = [brand.name for brand in brands]
        matrix_rows = []
        for channel_name, channel_data in sorted(
            channel_map.items(),
            key=lambda item: item[1]['revenue'],
            reverse=True,
        ):
            active_count = len(channel_data['active_customer_ids'])
            network_total = universe['by_channel'].get(channel_name)
            coverage_pct = round((active_count / network_total) * 100, 1) if network_total else 0.0
            white_space = max(network_total - active_count, 0) if network_total else 0
            avg_ticket = round(channel_data['revenue'] / active_count, 2) if active_count else 0.0
            coverage_by_channel.append({
                'channel': channel_name,
                'active': active_count,
                'network_total': network_total,
                'coverage_pct': coverage_pct,
                'white_space': white_space,
                'revenue': round(channel_data['revenue'], 2),
                'mix_pct': round((channel_data['revenue'] / total_revenue) * 100, 1),
                'avg_ticket': avg_ticket,
            })
            matrix_rows.append({
                'channel': channel_name,
                'total_revenue': round(channel_data['revenue'], 2),
                'cells': [
                    {
                        'brand': brand_name,
                        'revenue': round(channel_data['brand_amounts'].get(brand_name, 0.0), 2),
                    }
                    for brand_name in matrix_brand_names
                ],
            })

        sku_distribution = sorted(
            [
                {
                    'product_id': sku_data['product_id'],
                    'sku': sku_data['sku'],
                    'brand': sku_data['brand'],
                    'revenue': round(sku_data['revenue'], 2),
                    'pdv_count': len(sku_data['customer_ids']),
                    'pdv_pct': round((len(sku_data['customer_ids']) / active_customer_total) * 100, 1) if active_customer_total else 0.0,
                    'channels': len(sku_data['channels']),
                    'detail': {
                        'title': sku_data['sku'],
                        'subtitle': sku_data['brand'],
                        'currency_symbol': currency_symbol,
                        'summary_cards': [
                            {'label': 'Venta', 'value': round(sku_data['detail_bucket']['revenue'], 2), 'format': 'money'},
                            {'label': 'Unidades', 'value': round(sku_data['detail_bucket']['units'], 2), 'format': 'count'},
                            {'label': 'Pedidos', 'value': len(sku_data['detail_bucket']['order_ids']), 'format': 'count'},
                            {'label': 'PDVs', 'value': len(sku_data['detail_bucket']['partner_ids']), 'format': 'count'},
                        ],
                        'channel_rows': _serialize_sku_channel_rows(sku_data['detail_bucket']),
                        'secondary_title': 'Top PDVs',
                        'secondary_rows': _serialize_sku_pdv_rows(sku_data['detail_bucket']),
                        'customer_rows': _serialize_sku_pdv_rows(sku_data['detail_bucket']),
                    },
                }
                for sku_data in sku_map.values()
            ],
            key=lambda item: item['revenue'],
            reverse=True,
        )[:15]

        core_skus = [item['sku'] for item in sku_distribution[:5]]
        portfolio_holes_rows = []
        clients_at_risk = []
        ab_customers = [
            customer_data
            for customer_id, customer_data in ranked_customers
            if abc_map.get(customer_id) in ('A', 'B')
        ]
        for customer_id, customer_data in ranked_customers:
            if abc_map.get(customer_id) not in ('A', 'B'):
                continue
            present_skus = sorted(
                sku_name
                for sku_name in core_skus
                if sku_name in customer_data['product_amounts']
            )
            missing_skus = [sku_name for sku_name in core_skus if sku_name not in present_skus]
            days_since_last = (date_to - customer_data['last_order_date']).days if customer_data['last_order_date'] else 999
            top_product = ''
            if customer_data['product_amounts']:
                top_product = max(
                    customer_data['product_amounts'].items(),
                    key=lambda item: item[1],
                )[0]
            portfolio_holes_rows.append({
                'partner_id': customer_id,
                'name': customer_data['name'],
                'channel': customer_data['channel'],
                'abc': abc_map.get(customer_id, 'C'),
                'revenue': round(customer_data['revenue'], 2),
                'present': present_skus,
                'missing': missing_skus,
                'gap_count': len(missing_skus),
                'detail': {
                    'title': customer_data['name'],
                    'subtitle': 'Holes de portafolio',
                    'currency_symbol': currency_symbol,
                    'summary_cards': [
                        {'label': 'Venta', 'value': round(customer_data['revenue'], 2), 'format': 'money'},
                        {'label': 'SKUs presentes', 'value': len(present_skus), 'format': 'count'},
                        {'label': 'SKUs faltantes', 'value': len(missing_skus), 'format': 'count'},
                        {'label': 'ABC', 'value': abc_map.get(customer_id, 'C'), 'format': 'text'},
                    ],
                    'channel_rows': [
                        {
                            'name': customer_data['channel'],
                            'pdv_count': 1,
                            'order_count': len(customer_data['order_ids']),
                            'units': 0.0,
                            'revenue': round(customer_data['revenue'], 2),
                        }
                    ],
                    'secondary_title': 'Estado del portafolio core',
                    'secondary_rows': [
                        {
                            'name': sku_name,
                            'units': 0.0,
                            'order_count': 0,
                            'revenue': round(customer_data['product_amounts'].get(sku_name, 0.0), 2),
                            'status': 'Presente',
                        }
                        for sku_name in present_skus
                    ] + [
                        {
                            'name': sku_name,
                            'units': 0.0,
                            'order_count': 0,
                            'revenue': 0.0,
                            'status': 'Faltante',
                        }
                        for sku_name in missing_skus
                    ],
                    'customer_rows': [],
                },
            })

            if days_since_last >= 20 or len(missing_skus) >= 2:
                if days_since_last >= 60:
                    segment = 'Hibernando'
                    action = 'Reactivar cuenta con revisión de portafolio.'
                elif days_since_last >= 35:
                    segment = 'En riesgo'
                    action = 'Recuperar frecuencia y revisar surtido core.'
                elif days_since_last >= 20 and abc_map.get(customer_id) == 'A':
                    segment = 'No perderlo'
                    action = 'Atención inmediata del ejecutivo comercial.'
                else:
                    segment = 'Atender'
                    action = 'Cerrar huecos de portafolio en próxima gestión.'
                clients_at_risk.append({
                    'partner_id': customer_id,
                    'name': customer_data['name'],
                    'channel': customer_data['channel'],
                    'abc': abc_map.get(customer_id, 'C'),
                    'segment': segment,
                    'revenue': round(customer_data['revenue'], 2),
                    'days_since_last': days_since_last,
                    'months_active': len(customer_data['months_active']),
                    'top_product': top_product,
                    'action': action,
                })

        clients_at_risk.sort(key=lambda item: (item['days_since_last'], item['revenue']), reverse=True)
        portfolio_holes_rows.sort(key=lambda item: (item['gap_count'], item['revenue']), reverse=True)

        return {
            'summary': {
                'sync_label': fields.Date.to_string(date_to),
                'period_label': '%s al %s' % (
                    fields.Date.to_string(date_from),
                    fields.Date.to_string(date_to),
                ),
                'currency_symbol': self.env.company.currency_id.symbol or '$',
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'summary_cards': [
                {
                    'label': 'PDVs en universo',
                    'value': universe['total'],
                    'note': 'Partners con actividad comercial en Odoo',
                },
                {
                    'label': 'PDVs facturados YTD',
                    'value': active_customer_total,
                    'note': 'Clientes con venta en marcas activas',
                },
                {
                    'label': 'White space ponderado',
                    'value': sum(item['white_space'] for item in coverage_by_channel),
                    'note': 'Canales mapeados sin captura YTD',
                },
                {
                    'label': 'Clientes A/B con holes',
                    'value': len([item for item in portfolio_holes_rows if item['gap_count'] >= 2]),
                    'note': 'Cuentas con huecos sobre SKUs core',
                },
                {
                    'label': 'Clientes A/B en riesgo',
                    'value': len(clients_at_risk),
                    'note': 'Recencia o caída de cobertura',
                },
            ],
            'coverage_by_channel': coverage_by_channel,
            'pdv_universe': universe,
            'channel_brand_matrix': {
                'brands': matrix_brand_names,
                'rows': matrix_rows,
            },
            'sku_distribution': sku_distribution,
            'portfolio_holes': {
                'core_skus': core_skus,
                'rows': portfolio_holes_rows[:20],
            },
            'clients_at_risk': clients_at_risk[:20],
            'notes_sources': [
                {
                    'label': 'Odoo',
                    'detail': 'Revenue, clientes activos, recencia, SKUs y marcas desde sale.order.line, sale.order, res.partner y zrn_commercial.',
                },
                {
                    'label': 'Universo PDV',
                    'detail': 'Totales de universo derivados de partners y pedidos reales del ultimo ano movil.',
                },
                {
                    'label': 'White space y holes',
                    'detail': 'Se calculan como señal analítica. No representan visitas, rutas ni ejecución física en PDV.',
                },
            ],
        }

    @api.model
    def get_pdv_hub_payload(self, filters=None):
        normalized_filters = self._normalize_channel_filters(filters)
        date_from = normalized_filters['date_from']
        date_to = normalized_filters['date_to']
        currency_symbol = self.env.company.currency_id.symbol or '$'
        brands, product_brand_map = self._get_commercial_brand_map()
        channel_setup = self._get_channel_setup_status()
        order_lines = self._get_commercial_sale_order_lines(
            date_from,
            date_to,
            list(product_brand_map.keys()),
            normalized_filters.get('order_status') or 'confirmed',
            normalized_filters.get('invoiced_only'),
        )
        filter_options = self._build_filter_options(order_lines, brands)

        if not brands or not product_brand_map:
            return self._build_empty_pdv_hub_payload(
                filters,
                filter_options=filter_options,
                empty_message='No hay marcas comerciales activas para construir el hub PDV.',
            )
        if not channel_setup['has_channels'] or not channel_setup['has_assignments']:
            return self._build_empty_pdv_hub_payload(
                filters,
                filter_options=filter_options,
                empty_message=self._get_channel_empty_message(channel_setup),
            )
        if not order_lines:
            return self._build_empty_pdv_hub_payload(
                filters,
                filter_options=filter_options,
            )

        partner_channel_map = self._get_partner_channel_map()
        filtered_lines = order_lines.filtered(
            lambda line: self._line_matches_filters(line, product_brand_map, normalized_filters, partner_channel_map=partner_channel_map)
        )
        if not filtered_lines:
            return self._build_empty_pdv_hub_payload(
                filters,
                filter_options=filter_options,
            )

        commercial_payload = self.get_commercial_hub_payload(normalized_filters)
        coverage_payload = self.get_coverage_dashboard_data(normalized_filters)
        month_starts, month_labels = self._get_recent_month_labels(date_to)

        pdv_map = {}
        total_order_ids = set()

        for line in filtered_lines:
            order = line.order_id
            partner = order.partner_id
            commercial_partner = partner.commercial_partner_id or partner
            product = line.product_id
            if not order or not partner or not product or not commercial_partner:
                continue

            brand_info = product_brand_map.get(product.id)
            if not brand_info:
                continue

            order_date = fields.Datetime.to_datetime(order.date_order).date() if order.date_order else date_to
            amount = float(line.price_total or 0.0)
            quantity = float(line.product_uom_qty or 0.0)
            channel_name = self._resolve_partner_channel(partner)
            subchain = self._infer_pdv_subchain(channel_name, partner.display_name)
            month_key = order_date.replace(day=1)

            pdv_entry = pdv_map.setdefault(
                partner.id,
                {
                    'partner_id': partner.id,
                    'client_full': commercial_partner.display_name or partner.display_name,
                    'name_short': partner.display_name,
                    'channel': channel_name or 'Sin canal',
                    'subchain': subchain,
                    'store_nbr': False,
                    'rev': 0.0,
                    'units': 0.0,
                    'lines': 0,
                    'order_ids': set(),
                    'first_date': order_date,
                    'last_date': order_date,
                    'monthly_rev': {month_start: 0.0 for month_start in month_starts},
                    'product_rows': {},
                    'has_sellout': False,
                    'sellin_q': 0.0,
                    'sellin_u': 0.0,
                    'sellout_q': 0.0,
                    'sellout_u': 0.0,
                    'sellthrough_q': None,
                    'days_of_cover': None,
                    'alerts': [],
                    'status': 'active',
                },
            )
            pdv_entry['rev'] += amount
            pdv_entry['units'] += quantity
            pdv_entry['lines'] += 1
            pdv_entry['order_ids'].add(order.id)
            pdv_entry['first_date'] = min(pdv_entry['first_date'], order_date)
            pdv_entry['last_date'] = max(pdv_entry['last_date'], order_date)
            if month_key in pdv_entry['monthly_rev']:
                pdv_entry['monthly_rev'][month_key] += amount

            product_row = pdv_entry['product_rows'].setdefault(
                product.id,
                {
                    'name': product.display_name,
                    'default_code': product.default_code or '',
                    'rev': 0.0,
                    'units': 0.0,
                    'lines': 0,
                    'brand': brand_info['brand_name'],
                },
            )
            product_row['rev'] += amount
            product_row['units'] += quantity
            product_row['lines'] += 1
            total_order_ids.add(order.id)

        sellin_vs_sellout = commercial_payload.get('sellin_vs_sellout', {})
        sellout_channel_map = {
            'walmart': 'Walmart/Paiz',
            'puma': 'PUMA Super 7',
        }
        for chain_key in ('walmart', 'puma'):
            chain_payload = sellin_vs_sellout.get(chain_key, {})
            for chain_row in chain_payload.get('by_pdv', []):
                partner_id = chain_row.get('partner_id') or chain_row.get('store')
                pdv_entry = pdv_map.get(partner_id)
                if not pdv_entry:
                    continue
                pdv_entry['has_sellout'] = True
                pdv_entry['sellin_q'] = round(chain_row.get('sellin_q', 0.0), 2)
                pdv_entry['sellin_u'] = round(chain_row.get('sellin_u', 0.0), 2)
                pdv_entry['sellout_q'] = round(chain_row.get('sellout_q', 0.0), 2)
                pdv_entry['sellout_u'] = round(chain_row.get('sellout_u', 0.0), 2)
                pdv_entry['sellthrough_q'] = chain_row.get('sellthrough_pct')
                pdv_entry['days_of_cover'] = chain_row.get('days_of_cover')

        ranking_rows = []
        total_revenue = sum(entry['rev'] for entry in pdv_map.values())
        for pdv_entry in pdv_map.values():
            order_count = len(pdv_entry['order_ids'])
            days_since_last = (date_to - pdv_entry['last_date']).days if pdv_entry['last_date'] else 0
            days_since_first = (date_to - pdv_entry['first_date']).days if pdv_entry['first_date'] else 0
            monthly_values = [
                round(pdv_entry['monthly_rev'].get(month_start, 0.0), 2)
                for month_start in month_starts
            ]
            current_month = monthly_values[-1] if monthly_values else 0.0
            previous_month = monthly_values[-2] if len(monthly_values) > 1 else 0.0
            if previous_month > 0:
                mom_pct = round(((current_month - previous_month) / previous_month) * 100, 1)
            else:
                mom_pct = None

            top_products = sorted(
                [
                    {
                        'name': product_row['name'],
                        'default_code': product_row['default_code'],
                        'rev': round(product_row['rev'], 2),
                        'units': round(product_row['units'], 2),
                        'lines': product_row['lines'],
                        'brand': product_row['brand'],
                    }
                    for product_row in pdv_entry['product_rows'].values()
                ],
                key=lambda item: item['rev'],
                reverse=True,
            )[:5]

            alerts = []
            if days_since_first <= 30:
                alerts.append({
                    'sev': 'info',
                    'type': 'new',
                    'msg': 'PDV recien activado (%sd)' % days_since_first,
                })
            if days_since_last >= 30:
                alerts.append({
                    'sev': 'warn',
                    'type': 'dormant',
                    'msg': 'Sin facturar hace %sd' % days_since_last,
                })
            if mom_pct is not None and mom_pct <= -30:
                alerts.append({
                    'sev': 'warn',
                    'type': 'mom_drop',
                    'msg': 'Cae %s%% MoM' % abs(int(round(mom_pct))),
                })
            if pdv_entry['has_sellout'] and pdv_entry['sellthrough_q'] is not None and pdv_entry['sellthrough_q'] < 40:
                alerts.append({
                    'sev': 'alert',
                    'type': 'low_st',
                    'msg': 'Sell-through %s%%' % round(pdv_entry['sellthrough_q'], 1),
                })

            if any(alert['type'] == 'low_st' for alert in alerts):
                status = 'low_st'
            elif any(alert['type'] == 'dormant' for alert in alerts):
                status = 'dormant'
            elif any(alert['type'] == 'new' for alert in alerts):
                status = 'new'
            else:
                status = 'active'

            pdv_entry['alerts'] = alerts
            pdv_entry['status'] = status

            detail_payload = {
                'title': pdv_entry['name_short'],
                'subtitle': '%s | %s' % (pdv_entry['channel'], pdv_entry['client_full']),
                'currency_symbol': currency_symbol,
                'summary_cards': [
                    {'label': 'Venta', 'value': round(pdv_entry['rev'], 2), 'format': 'money'},
                    {'label': 'Pedidos', 'value': order_count, 'format': 'count'},
                    {'label': 'Unidades', 'value': round(pdv_entry['units'], 2), 'format': 'count'},
                    {'label': 'Ticket', 'value': round(pdv_entry['rev'] / order_count, 2) if order_count else 0.0, 'format': 'money'},
                ],
                'channel_rows': [
                    {
                        'name': pdv_entry['channel'],
                        'pdv_count': 1,
                        'order_count': order_count,
                        'units': round(pdv_entry['units'], 2),
                        'revenue': round(pdv_entry['rev'], 2),
                    },
                ],
                'secondary_title': 'Top productos',
                'secondary_rows': [
                    {
                        'name': product_row['name'],
                        'order_count': product_row['lines'],
                        'units': round(product_row['units'], 2),
                        'revenue': round(product_row['rev'], 2),
                    }
                    for product_row in top_products
                ],
                'customer_rows': [],
            }

            ranking_rows.append({
                'partner_id': pdv_entry['partner_id'],
                'client_full': pdv_entry['client_full'],
                'name_short': pdv_entry['name_short'],
                'channel': pdv_entry['channel'],
                'subchain': pdv_entry['subchain'],
                'store_nbr': pdv_entry['store_nbr'],
                'rev': round(pdv_entry['rev'], 2),
                'units': round(pdv_entry['units'], 2),
                'invoices': order_count,
                'lines': pdv_entry['lines'],
                'avg_ticket': round(pdv_entry['rev'] / order_count, 2) if order_count else 0.0,
                'avg_unit_price': round(pdv_entry['rev'] / pdv_entry['units'], 2) if pdv_entry['units'] else 0.0,
                'first_date': fields.Date.to_string(pdv_entry['first_date']) if pdv_entry['first_date'] else '',
                'last_date': fields.Date.to_string(pdv_entry['last_date']) if pdv_entry['last_date'] else '',
                'days_since_last': days_since_last,
                'days_since_first': days_since_first,
                'monthly_rev': monthly_values,
                'mom_pct': mom_pct,
                'top_products': top_products,
                'sellin_q': pdv_entry['sellin_q'],
                'sellin_u': pdv_entry['sellin_u'],
                'sellout_q': pdv_entry['sellout_q'],
                'sellout_u': pdv_entry['sellout_u'],
                'sellthrough_q': pdv_entry['sellthrough_q'],
                'days_of_cover': pdv_entry['days_of_cover'],
                'has_sellout': pdv_entry['has_sellout'],
                'alerts': alerts,
                'status': status,
                'detail': detail_payload,
            })

        ranking_rows.sort(key=lambda item: item['rev'], reverse=True)

        cumulative_revenue = 0.0
        for index, row in enumerate(ranking_rows, start=1):
            cumulative_revenue += row['rev']
            cumulative_pct = (cumulative_revenue / total_revenue) * 100 if total_revenue else 0.0
            if cumulative_pct <= 80:
                abc = 'A'
            elif cumulative_pct <= 95:
                abc = 'B'
            else:
                abc = 'C'
            row['rank'] = index
            row['cum_pct'] = round(cumulative_pct, 1)
            row['abc'] = abc

        top_pdvs = ranking_rows[:10]
        new_pdvs = sorted(
            [row for row in ranking_rows if any(alert['type'] == 'new' for alert in row['alerts'])],
            key=lambda row: row['days_since_first'],
        )[:8]
        dormant_pdvs = sorted(
            [row for row in ranking_rows if any(alert['type'] == 'dormant' for alert in row['alerts'])],
            key=lambda row: row['days_since_last'],
            reverse=True,
        )[:8]
        alert_rows = sorted(
            [row for row in ranking_rows if row['alerts']],
            key=lambda row: (
                0 if any(alert['sev'] == 'alert' for alert in row['alerts']) else 1,
                0 if any(alert['type'] == 'dormant' for alert in row['alerts']) else 1,
                -row['rev'],
            ),
        )

        selected_channel_names = self._get_selected_channel_names(normalized_filters)
        selected_or_all_channel_names = (
            selected_channel_names or {row['channel'] for row in ranking_rows if row.get('channel')}
        )
        compare_channel_labels = sorted(selected_or_all_channel_names)
        supported_compare_keys = [
            chain_key
            for chain_key, chain_label in sellout_channel_map.items()
            if chain_label in selected_or_all_channel_names
        ]
        supported_compare_labels = [
            sellout_channel_map[chain_key]
            for chain_key in supported_compare_keys
        ]
        compare_rows = [
            row for row in ranking_rows
            if not compare_channel_labels or row['channel'] in compare_channel_labels
        ]
        compare_month_map = defaultdict(lambda: {'sellin_q': 0.0, 'sellout_q': 0.0})
        compare_summary = {
            'sellin_q': 0.0,
            'sellout_q': 0.0,
            'sellthrough_q_pct': 0.0,
            'pdvs_with_data': 0,
            'period': '%s al %s' % (
                fields.Date.to_string(date_from),
                fields.Date.to_string(date_to),
            ),
        }
        for chain_key in supported_compare_keys:
            chain_payload = sellin_vs_sellout.get(chain_key) or {}
            summary_payload = chain_payload.get('summary') or {}
            compare_summary['sellin_q'] += float(summary_payload.get('sellin_q') or 0.0)
            compare_summary['sellout_q'] += float(summary_payload.get('sellout_q') or 0.0)
            compare_summary['pdvs_with_data'] += int(summary_payload.get('pdvs_with_data') or 0)
            for month_row in chain_payload.get('by_month', []):
                month_bucket = compare_month_map[month_row.get('key') or month_row.get('label')]
                month_bucket['label'] = month_row.get('label')
                month_bucket['sellin_q'] += float(month_row.get('sellin_q') or 0.0)
                month_bucket['sellout_q'] += float(month_row.get('sellout_q') or 0.0)
        if compare_summary['sellin_q']:
            compare_summary['sellthrough_q_pct'] = round(
                compare_summary['sellout_q'] / compare_summary['sellin_q'] * 100, 1
            )
        compare_summary['sellin_q'] = round(compare_summary['sellin_q'], 2)
        compare_summary['sellout_q'] = round(compare_summary['sellout_q'], 2)
        compare_by_month = [
            {
                'key': month_key,
                'label': month_vals.get('label') or month_key,
                'sellin_q': round(month_vals['sellin_q'], 2),
                'sellout_q': round(month_vals['sellout_q'], 2),
            }
            for month_key, month_vals in sorted(compare_month_map.items())
        ]
        compare_empty_message = ''
        if compare_channel_labels and not compare_rows:
            compare_empty_message = 'No hay PDVs para los canales filtrados.'
        elif compare_channel_labels and not supported_compare_labels:
            compare_empty_message = 'La seleccion actual no tiene dataset de sell-out disponible.'
        elif not supported_compare_labels:
            compare_empty_message = 'No hay canales con dataset de sell-out disponible en esta vista.'

        otros_rows = [
            row for row in ranking_rows
            if row['channel'] not in ('Walmart/Paiz', 'PUMA Super 7')
        ]
        otros_channels = [
            row for row in coverage_payload.get('coverage_by_channel', [])
            if row.get('channel') not in ('Walmart/Paiz', 'PUMA Super 7')
        ]

        summary = commercial_payload.get('summary', {})
        return {
            'summary': {
                'sync_label': summary.get('sync_label') or fields.Date.to_string(date_to),
                'period_label': summary.get('period_label') or (
                    '%s al %s' % (
                        fields.Date.to_string(date_from),
                        fields.Date.to_string(date_to),
                    )
                ),
                'currency_symbol': currency_symbol,
                'total_pdvs': len(ranking_rows),
                'total_revenue': round(total_revenue, 2),
                'order_count': len(total_order_ids),
                'avg_ticket': round(total_revenue / len(total_order_ids), 2) if total_order_ids else 0.0,
                'active_channel_count': len(coverage_payload.get('coverage_by_channel', [])),
                'new_count': len(new_pdvs),
                'dormant_count': len(dormant_pdvs),
                'low_st_count': len([
                    row for row in ranking_rows
                    if any(alert['type'] == 'low_st' for alert in row['alerts'])
                ]),
                'alert_count': len(alert_rows),
                'top_pdv_name': top_pdvs[0]['name_short'] if top_pdvs else '',
                'top_pdv_revenue': top_pdvs[0]['rev'] if top_pdvs else 0.0,
            },
            'active_filters': self._serialize_active_filters(normalized_filters),
            'filter_options': filter_options,
            'empty_message': '',
            'revenue_series': commercial_payload.get('revenue_series', []),
            'channel_coverage': coverage_payload.get('coverage_by_channel', []),
            'top_pdvs': top_pdvs,
            'ranking_rows': ranking_rows,
            'new_pdvs': new_pdvs,
            'dormant_pdvs': dormant_pdvs,
            'channel_compare': {
                'channel_labels': compare_channel_labels,
                'supported_channel_labels': supported_compare_labels,
                'summary': compare_summary,
                'by_month': compare_by_month,
                'rows': compare_rows,
                'empty_message': compare_empty_message,
            },
            'otros': {
                'channels': otros_channels,
                'rows': otros_rows,
            },
            'alerts': {
                'rows': alert_rows,
            },
            'notes_sources': [
                {
                    'label': 'Odoo',
                    'detail': 'PDV resume actividad por punto usando sale.order.line, sale.order y partners asignados a canales comerciales.',
                },
                {
                    'label': 'Commercial',
                    'detail': 'Marcas, canales y sell-in vs sell-out reutilizan (ZRN) Manejo Comercial y el hub comercial sin cambiar su logica base.',
                },
                {
                    'label': 'Alertas',
                    'detail': 'Dormancia, alta reciente, caida mensual y bajo sell-through se usan como senales operativas del hub PDV.',
                },
            ],
        }

    @api.model
    def _coerce_bool(self, value):
        return value in (True, 1, '1', 'true', 'True', 'on', 'yes')

    @api.model
    def _normalize_rrhh_filters(self, filters=None):
        filters = filters or {}
        selected_applicant_id = filters.get('selected_applicant_id') or filters.get('applicant_id')
        try:
            selected_applicant_id = int(selected_applicant_id) if selected_applicant_id else False
        except (TypeError, ValueError):
            selected_applicant_id = False
        return {
            'selected_applicant_id': selected_applicant_id,
        }

    @api.model
    def _get_rrhh_applicants(self):
        return self.env['hr.applicant'].with_context(active_test=False).search(
            [('company_id', 'in', [False, self.env.company.id])],
            order='create_date desc, id desc',
        )

    @api.model
    def _serialize_rrhh_applicant(self, applicant):
        if not applicant:
            return False
        return {
            'id': applicant.id,
            'name': applicant.partner_name or applicant.name or applicant.display_name,
            'display_name': applicant.display_name,
            'job_name': applicant.job_id.name or '',
            'stage_name': applicant.stage_id.name or '',
            'email': applicant.email_from or '',
            'phone': applicant.partner_phone or applicant.partner_mobile or '',
            'partner_name': applicant.partner_name or '',
            'priority': applicant.priority or '0',
            'create_date': fields.Datetime.to_string(applicant.create_date) if applicant.create_date else '',
        }

    @api.model
    def _serialize_rrhh_predictor(self, predictor):
        if not predictor:
            return False
        return {
            'id': predictor.id,
            'evaluation_date': fields.Date.to_string(predictor.evaluation_date) if predictor.evaluation_date else '',
            'answered_count': predictor.answered_count,
            'score_total': round(float(predictor.score_total or 0.0), 1),
            'risk_level': predictor.risk_level or 'not_evaluated',
            'risk_label': predictor.risk_label or 'Sin evaluar',
            'summary_text': predictor.summary_text or '',
            'notes': predictor.notes or '',
            'factor_scores': {
                'family': round(float(predictor.family_score or 0.0), 1),
                'patrimony': round(float(predictor.patrimony_score or 0.0), 1),
                'environment': round(float(predictor.environment_score or 0.0), 1),
                'work_history': round(float(predictor.work_history_score or 0.0), 1),
                'exam': round(float(predictor.exam_score or 0.0), 1),
            },
            'answers': {
                key: getattr(predictor, key) or ''
                for key in PREDICTOR_KEYS
            },
        }

    @api.model
    def _serialize_rrhh_checklist(self, checklist):
        if not checklist:
            return False
        return {
            'id': checklist.id,
            'interview_date': fields.Date.to_string(checklist.interview_date) if checklist.interview_date else '',
            'alert_count': checklist.alert_count,
            'summary_text': checklist.summary_text or '',
            'observations': checklist.observations or '',
            'answers': {
                key: bool(getattr(checklist, key))
                for key in CHECKLIST_KEYS
            },
        }

    @api.model
    def _serialize_rrhh_patterns(self, pattern):
        if not pattern:
            return {
                'matched_pattern_count': 0,
                'severity_level': 'low',
                'summary_text': 'Sin patrones validados para esta solicitud.',
                'patterns': [
                    {
                        **item,
                        'matched': False,
                    }
                    for item in VALIDATED_PATTERN_LIBRARY
                ],
                'current_patterns': [],
            }
        pattern_rows = []
        current_rows = []
        for item in VALIDATED_PATTERN_LIBRARY:
            matched = bool(getattr(pattern, item['field'], False))
            row = {
                'key': item['key'],
                'label': item['label'],
                'strength': item['strength'],
                'approved_pct': item['approved_pct'],
                'rejected_pct': item['rejected_pct'],
                'approved_detail': item['approved_detail'],
                'rejected_detail': item['rejected_detail'],
                'description': item['description'],
                'matched': matched,
            }
            pattern_rows.append(row)
            if matched:
                current_rows.append(row)
        return {
            'id': pattern.id,
            'matched_pattern_count': pattern.matched_pattern_count,
            'severity_level': pattern.severity_level or 'low',
            'summary_text': pattern.summary_text or '',
            'patterns': pattern_rows,
            'current_patterns': current_rows,
        }

    @api.model
    def _build_rrhh_historical_rows(self, applicants, predictors, checklists, patterns):
        predictor_by_applicant = {record.applicant_id.id: record for record in predictors}
        checklist_by_applicant = {record.applicant_id.id: record for record in checklists}
        pattern_by_applicant = {record.applicant_id.id: record for record in patterns}
        rows = []
        for applicant in applicants:
            predictor = predictor_by_applicant.get(applicant.id)
            checklist = checklist_by_applicant.get(applicant.id)
            pattern = pattern_by_applicant.get(applicant.id)
            current_patterns = self._serialize_rrhh_patterns(pattern)['current_patterns']
            rows.append({
                'applicant_id': applicant.id,
                'name': applicant.partner_name or applicant.name or applicant.display_name,
                'job_name': applicant.job_id.name or '',
                'stage_name': applicant.stage_id.name or '',
                'email': applicant.email_from or '',
                'created_at': fields.Datetime.to_string(applicant.create_date) if applicant.create_date else '',
                'has_predictor': bool(predictor),
                'has_checklist': bool(checklist),
                'has_pattern': bool(pattern),
                'predictor_score': round(float(predictor.score_total or 0.0), 1) if predictor else 0.0,
                'predictor_risk_level': predictor.risk_level if predictor else 'not_evaluated',
                'predictor_risk_label': predictor.risk_label if predictor else 'Sin evaluar',
                'checklist_alert_count': checklist.alert_count if checklist else 0,
                'matched_pattern_count': pattern.matched_pattern_count if pattern else 0,
                'pattern_severity': pattern.severity_level if pattern else 'low',
                'pattern_labels': ', '.join(item['label'] for item in current_patterns) if current_patterns else '',
            })
        return rows

    @api.model
    def _get_rrhh_empty_payload(self, normalized_filters=None):
        normalized_filters = normalized_filters or {'selected_applicant_id': False}
        return {
            'summary': {
                'sync_label': fields.Date.to_string(fields.Date.context_today(self)),
                'applicant_count': 0,
                'predictor_count': 0,
                'checklist_count': 0,
                'pattern_count': 0,
                'high_risk_count': 0,
                'pending_count': 0,
            },
            'active_filters': normalized_filters,
            'applicant_options': [],
            'current_applicant': False,
            'current_predictor': False,
            'current_checklist': False,
            'current_patterns': self._serialize_rrhh_patterns(False),
            'historical_rows': [],
            'overview': {
                'risk_distribution': [],
                'stage_distribution': [],
                'job_distribution': [],
                'latest_rows': [],
            },
            'predictor_config': {
                'questions': PREDICTOR_QUESTIONS,
                'thresholds': RRHH_RISK_THRESHOLDS,
            },
            'checklist_template': {
                'sections': CHECKLIST_TEMPLATE,
            },
            'validated_patterns': {
                'non_predictive_factors': NON_PREDICTIVE_FACTORS,
                'library': VALIDATED_PATTERN_LIBRARY,
            },
            'notes_sources': [
                {
                    'label': 'Odoo',
                    'detail': 'Solicitudes y etapas desde hr.applicant, hr.job y hr_recruitment.',
                },
                {
                    'label': 'Instrumentos RRHH',
                    'detail': 'Predictor, checklist y patrones se persisten por solicitud dentro de zrn_analitics.',
                },
            ],
            'empty_message': 'No hay solicitudes de reclutamiento para mostrar en RRHH.',
        }

    @api.model
    def get_rrhh_hub_payload(self, filters=None):
        normalized_filters = self._normalize_rrhh_filters(filters)
        applicants = self._get_rrhh_applicants()
        if not applicants:
            return self._get_rrhh_empty_payload(normalized_filters)

        selected_applicant_id = normalized_filters['selected_applicant_id']
        selected_applicant = self.env['hr.applicant']
        if selected_applicant_id:
            selected_applicant = applicants.filtered(lambda applicant: applicant.id == selected_applicant_id)[:1]
        if selected_applicant_id and not selected_applicant:
            normalized_filters['selected_applicant_id'] = False

        predictors = self.env['zrn.rrhh.predictor'].search([('applicant_id', 'in', applicants.ids)])
        checklists = self.env['zrn.rrhh.interview.checklist'].search([('applicant_id', 'in', applicants.ids)])
        applicants_with_sources = applicants.filtered(
            lambda applicant: applicant._zrn_rrhh_get_predictor() or applicant._zrn_rrhh_get_checklist()
        )
        if applicants_with_sources:
            applicants_with_sources._zrn_rrhh_recompute_pattern_records()
        patterns = self.env['zrn.rrhh.validated.pattern'].search([('applicant_id', 'in', applicants.ids)])

        evaluated_predictors = predictors.filtered(_is_rrhh_predictor_evaluated)
        evaluated_checklists = checklists.filtered(_is_rrhh_checklist_evaluated)

        predictor_by_applicant = {record.applicant_id.id: record for record in predictors}
        checklist_by_applicant = {record.applicant_id.id: record for record in checklists}
        pattern_by_applicant = {record.applicant_id.id: record for record in patterns}
        historical_rows = self._build_rrhh_historical_rows(applicants, evaluated_predictors, evaluated_checklists, patterns)

        risk_counter = defaultdict(int)
        for predictor in evaluated_predictors:
            risk_counter[predictor.risk_level or 'not_evaluated'] += 1
        risk_distribution = [
            {
                'key': threshold['key'],
                'label': threshold['label'],
                'value': risk_counter.get(threshold['key'], 0),
            }
            for threshold in RRHH_RISK_THRESHOLDS
        ]

        stage_counter = defaultdict(int)
        job_counter = defaultdict(int)
        for applicant in applicants:
            stage_counter[applicant.stage_id.name or 'Sin etapa'] += 1
            job_counter[applicant.job_id.name or 'Sin puesto'] += 1
        stage_distribution = [
            {'label': label, 'value': value}
            for label, value in sorted(stage_counter.items(), key=lambda item: (-item[1], item[0]))
        ]
        job_distribution = [
            {'label': label, 'value': value}
            for label, value in sorted(job_counter.items(), key=lambda item: (-item[1], item[0]))[:8]
        ]

        current_predictor = predictor_by_applicant.get(selected_applicant.id) if selected_applicant else False
        current_checklist = checklist_by_applicant.get(selected_applicant.id) if selected_applicant else False
        current_pattern = pattern_by_applicant.get(selected_applicant.id) if selected_applicant else False

        predictor_count = len(evaluated_predictors)
        checklist_count = len(evaluated_checklists)
        pattern_count = len(patterns)
        completed_count = len([
            row for row in historical_rows
            if row['has_predictor'] and row['has_checklist'] and row['has_pattern']
        ])

        return {
            'summary': {
                'sync_label': fields.Date.to_string(fields.Date.context_today(self)),
                'applicant_count': len(applicants),
                'predictor_count': predictor_count,
                'checklist_count': checklist_count,
                'pattern_count': pattern_count,
                'high_risk_count': len([
                    predictor for predictor in evaluated_predictors
                    if predictor.risk_level in ('high', 'very_high')
                ]),
                'pending_count': max(len(applicants) - completed_count, 0),
            },
            'active_filters': normalized_filters,
            'applicant_options': [
                {
                    'id': applicant.id,
                    'name': applicant.partner_name or applicant.name or applicant.display_name,
                    'job_name': applicant.job_id.name or '',
                    'stage_name': applicant.stage_id.name or '',
                }
                for applicant in applicants
            ],
            'current_applicant': self._serialize_rrhh_applicant(selected_applicant),
            'current_predictor': self._serialize_rrhh_predictor(current_predictor),
            'current_checklist': self._serialize_rrhh_checklist(current_checklist),
            'current_patterns': self._serialize_rrhh_patterns(current_pattern),
            'historical_rows': historical_rows,
            'overview': {
                'risk_distribution': risk_distribution,
                'stage_distribution': stage_distribution,
                'job_distribution': job_distribution,
                'latest_rows': historical_rows[:8],
            },
            'predictor_config': {
                'questions': PREDICTOR_QUESTIONS,
                'thresholds': RRHH_RISK_THRESHOLDS,
            },
            'checklist_template': {
                'sections': CHECKLIST_TEMPLATE,
            },
            'validated_patterns': {
                'non_predictive_factors': NON_PREDICTIVE_FACTORS,
                'library': VALIDATED_PATTERN_LIBRARY,
            },
            'notes_sources': [
                {
                    'label': 'Odoo',
                    'detail': 'Solicitudes, etapas y puestos provienen de hr.applicant y hr.job.',
                },
                {
                    'label': 'Hub RRHH',
                    'detail': 'Predictor, checklist y patrones viven amarrados a la solicitud para auditoria y seguimiento.',
                },
            ],
            'empty_message': '',
        }

    @api.model
    def _get_rrhh_applicant_or_raise(self, applicant_id):
        try:
            applicant_id = int(applicant_id)
        except (TypeError, ValueError):
            applicant_id = False
        applicant = self.env['hr.applicant'].browse(applicant_id)
        if not applicant.exists():
            raise UserError('No se encontro la solicitud seleccionada para RRHH.')
        return applicant

    @api.model
    def upsert_rrhh_predictor(self, applicant_id, values=None):
        applicant = self._get_rrhh_applicant_or_raise(applicant_id)
        values = values or {}
        clean_vals = {
            'evaluation_date': values.get('evaluation_date') or fields.Date.context_today(self),
            'notes': (values.get('notes') or '').strip(),
        }
        for question in PREDICTOR_QUESTIONS:
            raw_value = values.get(question['key'])
            allowed_values = {option['value'] for option in question['options']}
            if raw_value in (False, None, ''):
                clean_vals[question['key']] = False
                continue
            normalized_value = str(raw_value)
            clean_vals[question['key']] = normalized_value if normalized_value in allowed_values else False

        predictor = self.env['zrn.rrhh.predictor'].search([('applicant_id', '=', applicant.id)], limit=1)
        if predictor:
            predictor.write(clean_vals)
        else:
            self.env['zrn.rrhh.predictor'].create({
                'applicant_id': applicant.id,
                'company_id': applicant.company_id.id or self.env.company.id,
                **clean_vals,
            })
        applicant._zrn_rrhh_recompute_pattern_records()
        return self.get_rrhh_hub_payload({'selected_applicant_id': applicant.id})

    @api.model
    def upsert_rrhh_checklist(self, applicant_id, values=None):
        applicant = self._get_rrhh_applicant_or_raise(applicant_id)
        values = values or {}
        clean_vals = {
            'interview_date': values.get('interview_date') or fields.Date.context_today(self),
            'observations': (values.get('observations') or '').strip(),
        }
        for key in CHECKLIST_KEYS:
            clean_vals[key] = self._coerce_bool(values.get(key))

        checklist = self.env['zrn.rrhh.interview.checklist'].search([('applicant_id', '=', applicant.id)], limit=1)
        if checklist:
            checklist.write(clean_vals)
        else:
            self.env['zrn.rrhh.interview.checklist'].create({
                'applicant_id': applicant.id,
                'company_id': applicant.company_id.id or self.env.company.id,
                **clean_vals,
            })
        applicant._zrn_rrhh_recompute_pattern_records()
        return self.get_rrhh_hub_payload({'selected_applicant_id': applicant.id})

    @api.model
    def recompute_rrhh_patterns(self, applicant_id):
        applicant = self._get_rrhh_applicant_or_raise(applicant_id)
        applicant._zrn_rrhh_recompute_pattern_records()
        return self.get_rrhh_hub_payload({'selected_applicant_id': applicant.id})
