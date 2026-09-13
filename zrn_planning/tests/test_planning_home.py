# -*- coding: utf-8 -*-

from odoo.tests.common import TransactionCase


class TestPlanningHome(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestPlanningHome, cls).setUpClass()
        cls.home_model = cls.env['zrn_planning.home']
        cls.plan_model = cls.env['zrn_planning.mfg.plan']
        cls.initial_active_plan_count = cls.plan_model.search_count([
            ('company_id', '=', cls.env.company.id),
            ('active', '=', True),
            ('state', 'in', ['draft', 'pending_confirmation', 'approved', 'released']),
        ])

        # Crear planes de fabricación de prueba (planning_basis = 'sale') - creamos 8 para validar el límite de 7
        for i in range(8):
            cls.plan_model.create({
                'name': f'Plan Producción {i}',
                'planning_basis': 'sale',
                'state': 'draft',
                'active': True,
                'company_id': cls.env.company.id,
            })

        # Crear planes de abastecimiento de prueba (planning_basis = 'mixed') - creamos 8
        for i in range(8):
            cls.plan_model.create({
                'name': f'Plan Abastecimiento {i}',
                'planning_basis': 'mixed',
                'state': 'pending_confirmation',
                'active': True,
                'company_id': cls.env.company.id,
            })

        # Obtener el registro por defecto del Home
        cls.home_record = cls.home_model.search([], limit=1)
        if not cls.home_record:
            cls.home_record = cls.home_model.create({
                'name': 'Test (ZRN) Planeacion Home',
                'page_key': 'overview',
            })

    def test_01_compute_home_dashboard_limit(self):
        """Valida que los planes recientes se limiten exactamente a 7"""
        self.home_record._compute_home_dashboard()

        # Los 16 planes de la prueba se suman a los que ya existan en la base.
        self.assertEqual(
            self.home_record.active_plan_count,
            self.initial_active_plan_count + 16,
        )

        # Planes de fabricación
        self.assertEqual(len(self.home_record.recent_production_plan_ids), 7)
        self.assertEqual(self.home_record.recent_production_plan_count, 7)

        # Planes de abastecimiento
        self.assertEqual(len(self.home_record.recent_supply_plan_ids), 7)
        self.assertEqual(self.home_record.recent_supply_plan_count, 7)

    def test_02_get_home_chart_payload(self):
        """Valida que el payload para ECharts contenga la estructura correcta"""
        payload = self.home_record.get_home_chart_payload()

        self.assertIn('production', payload)
        self.assertIn('supply', payload)

        # Validar sección producción
        self.assertIn('labels', payload['production'])
        self.assertIn('orders_generated', payload['production'])
        self.assertIn('orders_completed', payload['production'])
        self.assertEqual(payload['production']['order_label'], 'OFs')

        # Validar sección abastecimiento
        self.assertIn('labels', payload['supply'])
        self.assertIn('orders_generated', payload['supply'])
        self.assertIn('orders_completed', payload['supply'])
        self.assertEqual(payload['supply']['order_label'], 'OCs')
