# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError


class ZrnCommercialNavigationMixin:
    def _open_singleton_action(self, action_xmlid):
        self.ensure_one()
        action = self.env.ref(action_xmlid, raise_if_not_found=False)
        if not action:
            raise UserError('No se encontro la accion configurada para esta pantalla.')
        action_data = action.read()[0]
        action_data['target'] = 'main'
        return action_data

    def action_open_home(self):
        return self._open_singleton_action('zrn_commercial.action_zrn_commercial_home')


class ZrnCommercialHome(ZrnCommercialNavigationMixin, models.Model):
    _name = 'zrn_commercial.home'
    _description = 'Inicio de Manejo Comercial Zoraen'
    _order = 'sequence, id'

    name = fields.Char(string='Nombre', required=True, default='(ZRN) Manejo Comercial')
    sequence = fields.Integer(string='Secuencia', default=10)
    page_key = fields.Selection(
        [
            ('overview', 'Resumen'),
        ],
        string='Pagina',
        required=True,
        default='overview',
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Moneda',
        compute='_compute_dashboard_metrics',
    )
    brand_count = fields.Integer(
        string='Marcas',
        compute='_compute_dashboard_metrics',
    )
    business_unit_count = fields.Integer(
        string='Unidades de negocio',
        compute='_compute_dashboard_metrics',
    )
    category_count = fields.Integer(
        string='Categorias',
        compute='_compute_dashboard_metrics',
    )
    mapped_product_count = fields.Integer(
        string='Productos mapeados',
        compute='_compute_dashboard_metrics',
    )
    channel_count = fields.Integer(
        string='Canales',
        compute='_compute_dashboard_metrics',
    )
    confirmed_order_count = fields.Integer(
        string='Ordenes confirmadas',
        compute='_compute_dashboard_metrics',
    )
    confirmed_revenue = fields.Monetary(
        string='Ingresos confirmados',
        currency_field='currency_id',
        compute='_compute_dashboard_metrics',
    )

    @api.depends_context('company')
    def _compute_dashboard_metrics(self):
        Brand = self.env['zrn_commercial.commercial.brand'].sudo()
        Category = self.env['zrn_commercial.commercial.brand.category'].sudo()
        BusinessUnit = self.env['zrn_commercial.business.unit'].sudo()
        Channel = self.env['zrn_commercial.commercial.channel'].sudo()
        SaleOrder = self.env['sale.order'].sudo()

        company = self.env.company
        categories = Category.search([('company_id', '=', company.id)])
        sale_domain = self._get_confirmed_sale_order_domain()
        confirmed_orders = SaleOrder.search(sale_domain)

        for record in self:
            record.currency_id = company.currency_id
            record.brand_count = Brand.search_count([('company_id', '=', company.id)])
            record.business_unit_count = BusinessUnit.search_count([('company_id', '=', company.id)])
            record.category_count = len(categories)
            record.mapped_product_count = len(categories.mapped('product_ids'))
            record.channel_count = Channel.search_count([('company_id', '=', company.id)])
            record.confirmed_order_count = len(confirmed_orders)
            record.confirmed_revenue = sum(confirmed_orders.mapped('amount_untaxed'))

    def action_open_brands(self):
        return self._open_singleton_action('zrn_commercial.action_zrn_commercial_brands')

    def action_open_channels(self):
        return self._open_singleton_action('zrn_commercial.action_zrn_commercial_channels')

    def action_open_business_units(self):
        return self._open_singleton_action('zrn_commercial.action_zrn_commercial_business_units')

    def action_open_categories(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Categorias de marca',
            'res_model': 'zrn_commercial.commercial.brand.category',
            'view_mode': 'tree,form',
            'domain': [('company_id', '=', self.env.company.id)],
            'context': dict(self.env.context),
            'target': 'current',
        }

    def action_open_mapped_products(self):
        self.ensure_one()
        category_model = self.env['zrn_commercial.commercial.brand.category'].sudo()
        categories = category_model.search([('company_id', '=', self.env.company.id)])
        return {
            'type': 'ir.actions.act_window',
            'name': 'Productos mapeados',
            'res_model': 'product.product',
            'view_mode': 'tree,form',
            'domain': [('id', 'in', categories.mapped('product_ids').ids)],
            'context': dict(self.env.context),
            'target': 'current',
        }

    def action_open_sales_orders(self):
        self.ensure_one()
        action = self.env['ir.actions.actions']._for_xml_id('sale.action_orders')
        action['domain'] = self._get_confirmed_sale_order_domain()
        action['context'] = dict(self.env.context)
        return action

    def _get_confirmed_sale_order_domain(self):
        return [
            ('company_id', '=', self.env.company.id),
            ('state', 'in', ['sale', 'done']),
        ]

    def get_dashboard_payload(self):
        self.ensure_one()
        company = self.env.company
        categories = self.env['zrn_commercial.commercial.brand.category'].sudo().search([
            ('company_id', '=', company.id),
        ])
        channels = self.env['zrn_commercial.commercial.channel'].sudo().search([
            ('company_id', '=', company.id),
        ], order='name')
        SaleOrder = self.env['sale.order'].sudo()

        def order_metrics(orders):
            revenue = sum(orders.mapped('amount_untaxed'))
            units = sum(orders.mapped('order_line.product_uom_qty'))
            count = len(orders)
            return {
                'revenue': revenue,
                'orders': count,
                'units': units,
                'ticket': revenue / count if count else 0,
            }

        channel_items = []
        channel_category_items = []
        for channel in channels:
            partner_ids = channel.partner_link_ids.mapped('partner_id').ids
            domain = self._get_confirmed_sale_order_domain()
            if partner_ids:
                domain.append(('partner_id', 'child_of', partner_ids))
            else:
                domain.append(('id', '=', 0))
            orders = SaleOrder.search(domain)
            metrics = order_metrics(orders)
            channel_items.append({
                'name': channel.name,
                'value': metrics['revenue'],
                'revenue': metrics['revenue'],
                'count': metrics['orders'],
                'orders': metrics['orders'],
                'units': metrics['units'],
                'ticket': metrics['ticket'],
            })

            assigned_partner_ids = set(partner_ids)
            categorized_partner_ids = set()
            for category in channel.category_ids:
                category_partner_ids = list(
                    set(category.partner_link_ids.mapped('partner_id').ids) & assigned_partner_ids
                )
                categorized_partner_ids.update(category_partner_ids)
                category_domain = self._get_confirmed_sale_order_domain()
                category_domain.append(
                    ('partner_id', 'child_of', category_partner_ids)
                    if category_partner_ids
                    else ('id', '=', 0)
                )
                category_metrics = order_metrics(SaleOrder.search(category_domain))
                channel_category_items.append({
                    'name': category.name,
                    'category': category.name,
                    'channel': channel.name,
                    'value': category_metrics['revenue'],
                    **category_metrics,
                })
            uncategorized_partner_ids = list(assigned_partner_ids - categorized_partner_ids)
            if uncategorized_partner_ids:
                uncategorized_domain = self._get_confirmed_sale_order_domain()
                uncategorized_domain.append(('partner_id', 'child_of', uncategorized_partner_ids))
                uncategorized_metrics = order_metrics(SaleOrder.search(uncategorized_domain))
                channel_category_items.append({
                    'name': 'Sin categoria',
                    'category': 'Sin categoria',
                    'channel': channel.name,
                    'value': uncategorized_metrics['revenue'],
                    **uncategorized_metrics,
                })

        category_items = [
            {
                'name': '%s / %s' % (category.brand_id.name, category.name),
                'value': len(category.product_ids),
                'products': len(category.product_ids),
                'brand': category.brand_id.name,
                'category': category.name,
            }
            for category in categories
        ]
        brand_items = [
            {
                'name': brand.name,
                'value': brand.product_count,
                'products': brand.product_count,
                'categories': brand.category_count,
            }
            for brand in self.env['zrn_commercial.commercial.brand'].sudo().search([
                ('company_id', '=', company.id),
            ], order='name')
        ]
        channel_items = sorted(channel_items, key=lambda item: item['value'], reverse=True)[:8]
        channel_category_items = sorted(
            channel_category_items,
            key=lambda item: item['value'],
            reverse=True,
        )[:24]
        category_items = sorted(category_items, key=lambda item: item['value'], reverse=True)[:10]
        brand_items = sorted(brand_items, key=lambda item: item['value'], reverse=True)[:8]

        category_labels = sorted({item['category'] for item in channel_category_items})
        channel_labels = sorted({item['channel'] for item in channel_category_items})
        category_series = []
        for channel_name in channel_labels:
            values = []
            for category_name in category_labels:
                matching = next(
                    (
                        item for item in channel_category_items
                        if item['channel'] == channel_name and item['category'] == category_name
                    ),
                    None,
                )
                values.append(matching['revenue'] if matching else 0)
            category_series.append({'name': channel_name, 'values': values})

        return {
            'currency': company.currency_id.symbol or '',
            'channelRevenue': {
                'labels': [item['name'] for item in channel_items],
                'values': [item['value'] for item in channel_items],
                'counts': [item['count'] for item in channel_items],
                'rows': channel_items,
            },
            'channelCategoryRevenue': {
                'labels': category_labels,
                'values': [
                    sum(item['revenue'] for item in channel_category_items if item['category'] == label)
                    for label in category_labels
                ],
                'series': category_series,
                'rows': channel_category_items,
            },
            'categoryProducts': {
                'labels': [item['name'] for item in category_items],
                'values': [item['value'] for item in category_items],
                'rows': category_items,
            },
            'brandProducts': {
                'labels': [item['name'] for item in brand_items],
                'values': [item['value'] for item in brand_items],
                'rows': brand_items,
            },
        }
