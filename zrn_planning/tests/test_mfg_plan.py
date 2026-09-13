# -*- coding: utf-8 -*-

from odoo.addons.mrp.tests.common import TestMrpCommon


class TestZrnPlanningMfgPlan(TestMrpCommon):

    def _create_plan_line(self, product, bom, quantity):
        plan = self.env['zrn_planning.mfg.plan'].create({
            'name': 'Planning con ejecucion real',
            'planning_basis': 'sale',
            'company_id': self.env.company.id,
        })
        return self.env['zrn_planning.mfg.plan.line'].create({
            'plan_id': plan.id,
            'product_id': product.id,
            'bom_id': bom.id,
            'qty_planned': quantity,
        })

    def test_supplies_are_calculated_from_bom(self):
        _production, bom, product, component_1, component_2 = self.generate_mo(qty_final=3)

        line = self._create_plan_line(product, bom, 3)

        self.assertEqual(line.supply_count, 2)
        supplies = {supply.component_id: supply for supply in line.supply_ids}
        self.assertEqual(supplies[component_1].qty_required, 12)
        self.assertEqual(supplies[component_2].qty_required, 3)
        self.assertEqual(supplies[component_1].qty_per_unit, 4)
        self.assertEqual(supplies[component_2].qty_per_unit, 1)

        line.qty_planned = 2

        self.assertEqual(line.supply_count, 2)
        supplies = {supply.component_id: supply for supply in line.supply_ids}
        self.assertEqual(supplies[component_1].qty_required, 8)
        self.assertEqual(supplies[component_2].qty_required, 2)

    def test_executed_quantity_uses_linked_manufacturing_orders(self):
        production, bom, product, _component_1, _component_2 = self.generate_mo(qty_final=4)
        line = self._create_plan_line(product, bom, 4)
        production.write({
            'zrn_planning_plan_id': line.plan_id.id,
            'zrn_planning_plan_line_id': line.id,
        })
        production.move_finished_ids.filtered(
            lambda move: move.product_id == product
        ).write({
            'quantity': 1.5,
            'picked': True,
        })

        self.assertEqual(line.qty_executed, 1.5)

        split_productions = production._split_productions({
            production: [1.5, 2.5],
        })
        backorder = split_productions - production

        self.assertEqual(backorder.zrn_planning_plan_id, line.plan_id)
        self.assertEqual(backorder.zrn_planning_plan_line_id, line)

    def test_supply_plan_uses_adjusted_purchase_quantity(self):
        finished_1, finished_2, component = self.env['product.product'].create([
            {'name': 'Producto terminado A'},
            {'name': 'Producto terminado B'},
            {'name': 'Insumo compartido'},
        ])
        purchase_wizard = self.env['zrn_planning.purchase.planning.wizard'].create({
            'fecha_desde': '2026-07-01',
            'fecha_hasta': '2026-07-01',
        })
        Requirement = self.env['zrn_planning.purchase.planning.wizard.report.requirement.line']
        Requirement.create([
            {
                'wizard_id': purchase_wizard.id,
                'schedule_date': '2026-07-01',
                'finished_product_id': finished_1.id,
                'component_id': component.id,
                'planned_qty': 1,
                'required_qty': 6,
                'stock_initial': 0,
                'stock_free': 0,
                'suggested_purchase_qty': 6,
            },
            {
                'wizard_id': purchase_wizard.id,
                'schedule_date': '2026-07-01',
                'finished_product_id': finished_2.id,
                'component_id': component.id,
                'planned_qty': 1,
                'required_qty': 4,
                'stock_initial': 0,
                'stock_free': 0,
                'suggested_purchase_qty': 4,
            },
        ])
        ProductSummary = self.env['zrn_planning.purchase.planning.wizard.report.product.line']
        ProductSummary.create([
            {
                'wizard_id': purchase_wizard.id,
                'product_id': finished_1.id,
                'planned_qty': 1,
                'first_required_date': '2026-07-01',
                'last_required_date': '2026-07-01',
            },
            {
                'wizard_id': purchase_wizard.id,
                'product_id': finished_2.id,
                'planned_qty': 1,
                'first_required_date': '2026-07-01',
                'last_required_date': '2026-07-01',
            },
        ])
        self.env['zrn_planning.purchase.planning.wizard.report.supply.line'].create({
            'wizard_id': purchase_wizard.id,
            'component_id': component.id,
            'total_required_qty': 10,
            'stock_free': 0,
            'suggested_purchase_qty': 10,
            'first_required_date': '2026-07-01',
            'last_required_date': '2026-07-01',
        })

        modal = self.env['zrn_planning.purchase.planning.create.plan.wizard'].create({
            'purchase_wizard_id': purchase_wizard.id,
        })
        self.assertEqual(len(modal.planning_line_ids), 1)
        self.assertEqual(modal.planning_line_ids.suggested_purchase_qty, 10)

        modal.planning_line_ids.purchase_qty = 5
        action = modal.action_save_plan()
        plan = self.env['zrn_planning.mfg.plan'].browse(action['res_id'])
        supplies = plan.line_ids.mapped('supply_ids')

        self.assertEqual(sum(supplies.mapped('qty_to_buy')), 5)
        qty_by_product = {
            supply.plan_line_id.product_id: supply.qty_to_buy
            for supply in supplies
        }
        self.assertEqual(qty_by_product[finished_1], 3)
        self.assertEqual(qty_by_product[finished_2], 2)
