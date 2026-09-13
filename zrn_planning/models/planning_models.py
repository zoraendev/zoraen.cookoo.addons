# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError


class ZrnPlanningNavigationMixin:
    def _open_singleton_action(self, action_xmlid):
        self.ensure_one()
        action = self.env.ref(action_xmlid, raise_if_not_found=False)
        if not action:
            raise UserError('No se encontro la accion configurada para esta pantalla.')
        action_data = action.read()[0]
        action_data['target'] = 'main'
        return action_data

    def action_open_home(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_home')

    def action_open_button_1(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_home')

    def action_open_button_2(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_home')

    def action_open_button_3(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_home')

    def action_open_button_4(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_home')

    def action_open_button_5(self):
        return self._open_singleton_action('zrn_planning.action_zrn_planning_delivery_planning')


class ZrnPlanningHome(ZrnPlanningNavigationMixin, models.Model):
    _name = 'zrn_planning.home'
    _description = 'Centro principal de Planeacion Zoraen'
    _order = 'sequence, id'

    name = fields.Char(string='Nombre', required=True, default='(ZRN) Planeacion')
    sequence = fields.Integer(string='Secuencia', default=10)
    page_key = fields.Selection(
        [
            ('overview', 'Resumen'),
        ],
        string='Pagina',
        required=True,
        default='overview',
    )
    active_plan_count = fields.Integer(
        string='Planes activos',
        compute='_compute_home_dashboard',
        readonly=True,
    )
    recent_production_plan_count = fields.Integer(
        string='Cantidad planes de fabricacion',
        compute='_compute_home_dashboard',
        readonly=True,
    )
    recent_production_plan_ids = fields.Many2many(
        'zrn_planning.mfg.plan',
        string='Ultimos planes de fabricacion',
        compute='_compute_home_dashboard',
        readonly=True,
    )
    recent_supply_plan_count = fields.Integer(
        string='Cantidad planes de abastecimiento',
        compute='_compute_home_dashboard',
        readonly=True,
    )
    recent_supply_plan_ids = fields.Many2many(
        'zrn_planning.mfg.plan',
        string='Ultimos planes de abastecimiento',
        compute='_compute_home_dashboard',
        readonly=True,
    )

    @api.depends_context('company')
    def _compute_home_dashboard(self):
        plan_model = self.env['zrn_planning.mfg.plan'].with_context(active_test=False)
        base_domain = [
            ('company_id', '=', self.env.company.id),
            ('active', '=', True),
        ]
        active_states = ['draft', 'pending_confirmation', 'approved', 'released']
        active_plan_count = plan_model.search_count(base_domain + [('state', 'in', active_states)])
        production_plans = plan_model.search(
            base_domain + [('planning_basis', '=', 'sale')],
            order='create_date desc, id desc',
            limit=7,
        )
        supply_plans = plan_model.search(
            base_domain + [('planning_basis', '=', 'mixed')],
            order='create_date desc, id desc',
            limit=7,
        )
        for record in self:
            record.active_plan_count = active_plan_count
            record.recent_production_plan_count = len(production_plans)
            record.recent_production_plan_ids = [(6, 0, production_plans.ids)]
            record.recent_supply_plan_count = len(supply_plans)
            record.recent_supply_plan_ids = [(6, 0, supply_plans.ids)]

    def _build_home_chart_payload(self, plans, order_field, completed_field, order_label):
        return {
            'labels': plans.mapped('name'),
            'plan_count': len(plans),
            'orders_generated': [plan[order_field] for plan in plans],
            'orders_completed': [plan[completed_field] for plan in plans],
            'order_label': order_label,
        }

    def get_home_chart_payload(self):
        self.ensure_one()
        plan_model = self.env['zrn_planning.mfg.plan'].with_context(active_test=False)
        base_domain = [
            ('company_id', '=', self.env.company.id),
            ('active', '=', True),
        ]
        production_plans = plan_model.search(
            base_domain + [('planning_basis', '=', 'sale')],
            order='create_date desc, id desc',
            limit=7,
        )
        supply_plans = plan_model.search(
            base_domain + [('planning_basis', '=', 'mixed')],
            order='create_date desc, id desc',
            limit=7,
        )
        return {
            'production': self._build_home_chart_payload(
                production_plans,
                'production_count',
                'completed_production_count',
                'OFs',
            ),
            'supply': self._build_home_chart_payload(
                supply_plans,
                'purchase_count',
                'completed_purchase_count',
                'OCs',
            ),
        }

    def action_open_production_planning(self):
        self.ensure_one()
        wizard = self.env['zrn_planning.production.planning.wizard'].create({})
        return wizard.action_open_filters()

    def action_open_supply_planning(self):
        self.ensure_one()
        wizard = self.env['zrn_planning.purchase.planning.wizard'].create({})
        return wizard.action_open_filters()

    def action_open_logistics_planning(self):
        self.ensure_one()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_delivery_planning')

    def action_open_inventory_reconciliation(self):
        self.ensure_one()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')


class ZrnPlanningProductionPlanning(ZrnPlanningNavigationMixin, models.Model):
    _name = 'zrn_planning.production.planning'
    _description = 'Planeacion de produccion y fabricacion'
    _order = 'sequence, id'

    name = fields.Char(string='Nombre', required=True, default='Planeacion de produccion/fabricacion')
    sequence = fields.Integer(string='Secuencia', default=10)
    page_key = fields.Selection(
        [
            ('overview', 'Resumen'),
            ('workspace', 'Workspace'),
        ],
        string='Pagina',
        required=True,
        default='overview',
    )

    def action_open_sale_order_filters(self):
        self.ensure_one()
        wizard = self.env['zrn_planning.production.planning.wizard'].create({})
        return wizard.action_open_filters()

    def action_open_supply_filters(self):
        self.ensure_one()
        wizard = self.env['zrn_planning.purchase.planning.wizard'].create({})
        return wizard.action_open_filters()


class ZrnPlanningPurchasePlanning(ZrnPlanningNavigationMixin, models.Model):
    _name = 'zrn_planning.purchase.planning'
    _description = 'Planeacion de insumos y compras'

    name = fields.Char(string='Nombre', required=True, default='Planeacion de Abastecimiento')


class ZrnPlanningDeliveryPlanning(ZrnPlanningNavigationMixin, models.Model):
    _name = 'zrn_planning.delivery.planning'
    _description = 'Planeacion de entregas'

    name = fields.Char(string='Nombre', required=True, default='Planeacion Logistica')
