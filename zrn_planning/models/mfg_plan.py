# -*- coding: utf-8 -*-

from datetime import timedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class ZrnPlanningMfgPlan(models.Model):
    _name = 'zrn_planning.mfg.plan'
    _description = 'Plan maestro de fabricacion y abastecimiento'
    _order = 'date_start desc, id desc'
    _table = 'zrn_planning_mfg_plan'

    name = fields.Char(
        string='Nombre',
        required=True,
        default='Nuevo plan de fabricacion',
    )
    active = fields.Boolean(string='Activo', default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        required=True,
        default=lambda self: self.env.company,
    )
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Bodega',
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)],
            limit=1,
        ),
    )
    date_start = fields.Date(string='Fecha inicio')
    date_end = fields.Date(string='Fecha fin')
    planning_basis = fields.Selection(
        [
            ('sale', 'Ordenes de venta'),
            ('mrp', 'Ordenes de fabricacion'),
            ('mixed', 'Mixto'),
        ],
        string='Base de planeacion',
        required=True,
        default='sale',
    )
    state = fields.Selection(
        [
            ('draft', 'Borrador'),
            ('pending_confirmation', 'Pendiente de confirmar'),
            ('approved', 'Aprobado'),
            ('released', 'Liberado'),
            ('done', 'Finalizado'),
            ('cancel', 'Cancelado'),
        ],
        string='Estado',
        required=True,
        default='draft',
    )
    notes = fields.Text(string='Notas')
    approved_at = fields.Datetime(string='Aprobado el')
    approved_by = fields.Many2one('res.users', string='Aprobado por')
    released_at = fields.Datetime(string='Liberado el')
    released_by = fields.Many2one('res.users', string='Liberado por')
    line_ids = fields.One2many(
        'zrn_planning.mfg.plan.line',
        'plan_id',
        string='Lineas del plan',
    )
    source_ids = fields.One2many(
        'zrn_planning.mfg.plan.source',
        'plan_id',
        string='Origenes del plan',
    )
    line_count = fields.Integer(
        string='Lineas',
        compute='_compute_counts',
        store=False,
    )
    source_count = fields.Integer(
        string='Origenes',
        compute='_compute_counts',
        store=False,
    )
    supply_count = fields.Integer(
        string='Insumos',
        compute='_compute_counts',
        store=False,
    )
    production_ids = fields.Many2many(
        'mrp.production',
        string='Ordenes de fabricacion',
        compute='_compute_counts',
        store=False,
    )
    production_count = fields.Integer(
        string='OFs',
        compute='_compute_counts',
        store=False,
    )
    completed_production_count = fields.Integer(
        string='OFs finalizadas',
        compute='_compute_counts',
        store=False,
    )
    purchase_ids = fields.Many2many(
        'purchase.order',
        string='Ordenes de compra',
        compute='_compute_purchase_links',
        readonly=True,
    )
    purchase_count = fields.Integer(
        string='OCs',
        compute='_compute_counts',
        store=False,
    )
    completed_purchase_count = fields.Integer(
        string='OCs finalizadas',
        compute='_compute_counts',
        store=False,
    )

    @api.depends('line_ids', 'line_ids.supply_ids', 'line_ids.production_ids', 'source_ids')
    def _compute_counts(self):
        has_plan_link = self._column_exists('purchase_order', 'zrn_planning_plan_id')
        for plan in self:
            productions = plan.line_ids.mapped('production_ids')
            plan.line_count = len(plan.line_ids)
            plan.source_count = len(plan.source_ids)
            plan.supply_count = len(plan.line_ids.mapped('supply_ids'))
            plan.production_ids = [(6, 0, productions.ids)]
            plan.production_count = len(productions)
            plan.completed_production_count = len(productions.filtered(lambda production: production.state == 'done'))
            if has_plan_link:
                purchases = self.env['purchase.order'].search([
                    ('zrn_planning_plan_id', '=', plan.id),
                ])
                plan.purchase_count = len(purchases)
                plan.completed_purchase_count = len(
                    purchases.filtered(lambda purchase: purchase.state in ('purchase', 'done'))
                )
            else:
                plan.purchase_count = 0
                plan.completed_purchase_count = 0

    @api.model
    def _column_exists(self, table_name, column_name):
        self.env.cr.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = %s
              AND column_name = %s
            LIMIT 1
            """,
            (table_name, column_name),
        )
        return bool(self.env.cr.fetchone())

    @api.depends('line_ids')
    def _compute_purchase_links(self):
        has_plan_link = self._column_exists('purchase_order', 'zrn_planning_plan_id')
        for plan in self:
            if has_plan_link:
                purchase_orders = self.env['purchase.order'].search([
                    ('zrn_planning_plan_id', '=', plan.id),
                ])
                plan.purchase_ids = [(6, 0, purchase_orders.ids)]
            else:
                plan.purchase_ids = [(6, 0, [])]

    def _create_draft_mrp_productions(self, mark_released=False):
        Production = self.env['mrp.production']
        created_productions = Production

        for plan in self:
            for line in plan.line_ids:
                if not line.product_id:
                    continue

                qty_planned = float(line.qty_planned or 0.0)
                if qty_planned <= 0:
                    continue

                production_start = line.production_date or fields.Date.context_today(self)
                production_deadline = line.delivery_date - timedelta(days=1) if line.delivery_date else production_start
                if production_deadline and production_deadline < production_start:
                    production_deadline = production_start

                if not line.production_ids:
                    bom = line.bom_id
                    if not bom:
                        bom = self.env['mrp.bom'].search([('product_id', '=', line.product_id.id)], limit=1)
                    if not bom:
                        bom = self.env['mrp.bom'].search(
                            [('product_tmpl_id', '=', line.product_id.product_tmpl_id.id)],
                            limit=1,
                        )

                    production_vals = {
                        'product_id': line.product_id.id,
                        'product_uom_id': line.product_id.uom_id.id,
                        'product_qty': qty_planned,
                        'bom_id': bom.id if bom else False,
                        'date_start': production_start,
                        'date_deadline': production_deadline,
                        'origin': plan.name,
                        'company_id': plan.company_id.id,
                        'location_src_id': (
                            plan.warehouse_id.lot_stock_id.id
                            if plan.warehouse_id and plan.warehouse_id.lot_stock_id
                            else False
                        ),
                        'location_dest_id': (
                            bom.picking_type_id.default_location_dest_id.id
                            if bom and bom.picking_type_id and bom.picking_type_id.default_location_dest_id
                            else (
                                plan.warehouse_id.manu_type_id.default_location_dest_id.id
                                if plan.warehouse_id and plan.warehouse_id.manu_type_id
                                and plan.warehouse_id.manu_type_id.default_location_dest_id
                                else False
                            )
                        ),
                        'picking_type_id': (
                            bom.picking_type_id.id
                            if bom and bom.picking_type_id
                            else (
                                plan.warehouse_id.manu_type_id.id
                                if plan.warehouse_id and plan.warehouse_id.manu_type_id
                                else False
                            )
                        ),
                        'zrn_planning_plan_id': plan.id,
                        'zrn_planning_plan_line_id': line.id,
                    }
                    production = Production.create(production_vals)
                    created_productions |= production

                if mark_released:
                    if not line.production_date:
                        line.production_date = production_start
                    line.qty_released = qty_planned
                    line.state = 'released'

        return created_productions

    def _get_default_purchase_picking_type(self):
        self.ensure_one()
        picking_type = False
        if self.warehouse_id and self.warehouse_id.in_type_id:
            picking_type = self.warehouse_id.in_type_id
        if not picking_type:
            picking_type = self.env['stock.picking.type'].search(
                [
                    ('code', '=', 'incoming'),
                    ('warehouse_id.company_id', '=', self.company_id.id),
                ],
                limit=1,
            )
        if not picking_type:
            picking_type = self.env['stock.picking.type'].search(
                [('code', '=', 'incoming'), ('company_id', '=', self.company_id.id)],
                limit=1,
            )
        return picking_type

    def _get_supply_seller(self, product, quantity, schedule_date=False):
        seller = product._select_seller(
            quantity=quantity,
            date=schedule_date,
            uom_id=product.uom_po_id,
        )
        if not seller and product.seller_ids:
            seller = product.seller_ids.sorted(lambda item: item.sequence or 0)[0]
        return seller

    def _create_draft_purchase_orders(self):
        PurchaseOrder = self.env['purchase.order']
        created_orders = PurchaseOrder
        has_plan_link = self._column_exists('purchase_order', 'zrn_planning_plan_id')
        has_plan_line_link = self._column_exists('purchase_order_line', 'zrn_planning_plan_line_id')

        for plan in self:
            if plan.purchase_ids or plan.planning_basis != 'mixed':
                continue

            grouped_lines = {}
            missing_supplier_products = set()
            for line in plan.line_ids:
                for supply in line.supply_ids.filtered(lambda item: float(item.qty_to_buy or 0.0) > 0.0):
                    product = supply.component_id
                    if not product:
                        continue

                    schedule_date = line.delivery_date or line.production_date or plan.date_start
                    seller = plan._get_supply_seller(
                        product=product,
                        quantity=supply.qty_to_buy,
                        schedule_date=schedule_date,
                    )
                    if not seller or not seller.partner_id:
                        missing_supplier_products.add(product.display_name or product.name)
                        continue

                    partner = seller.partner_id
                    grouped_lines.setdefault(partner.id, {
                        'partner': partner,
                        'seller': seller,
                        'lines': [],
                    })
                    grouped_lines[partner.id]['lines'].append({
                        'plan_line': line,
                        'supply': supply,
                        'product': product,
                        'seller': seller,
                    })

            if missing_supplier_products:
                missing_list = ', '.join(sorted(missing_supplier_products))
                raise UserError(_(
                    'No se pudieron generar las ordenes de compra del planning porque estos insumos no tienen proveedor configurado: %s'
                ) % missing_list)

            if not grouped_lines:
                continue

            picking_type = plan._get_default_purchase_picking_type()
            for group in grouped_lines.values():
                partner = group['partner']
                order_vals = {
                    'partner_id': partner.id,
                    'company_id': plan.company_id.id,
                    'origin': plan.name,
                    'date_order': fields.Datetime.now(),
                }
                if has_plan_link:
                    order_vals['zrn_planning_plan_id'] = plan.id
                if picking_type:
                    order_vals['picking_type_id'] = picking_type.id
                purchase_order = PurchaseOrder.create(order_vals)

                line_commands = []
                for item in group['lines']:
                    supply = item['supply']
                    product = item['product']
                    seller = item['seller']
                    plan_line = item['plan_line']
                    line_commands.append((0, 0, {
                        'order_id': purchase_order.id,
                        'product_id': product.id,
                        'name': product.display_name or product.name,
                        'product_qty': supply.qty_to_buy,
                        'product_uom': product.uom_po_id.id,
                        'price_unit': seller.price or 0.0,
                        'date_planned': fields.Datetime.to_string(
                            fields.Datetime.now() if not (plan_line.delivery_date or plan_line.production_date)
                            else fields.Datetime.from_string(
                                f"{(plan_line.delivery_date or plan_line.production_date).strftime('%Y-%m-%d')} 00:00:00"
                            )
                        ),
                        'taxes_id': [(6, 0, product.supplier_taxes_id.ids)],
                    }))
                    if has_plan_line_link:
                        line_commands[-1][2]['zrn_planning_plan_line_id'] = plan_line.id
                purchase_order.write({'order_line': line_commands})
                created_orders |= purchase_order

        return created_orders

    def action_set_pending_plan(self):
        for plan in self:
            if plan.state != 'draft':
                raise UserError(_('Solo los planings en borrador pueden pasar a pendiente.'))
            if not plan.line_ids:
                raise UserError(_('El planning no tiene lineas para pasar a pendiente.'))
            plan.write({'state': 'pending_confirmation'})
        return True

    def action_confirm_plan(self):
        for plan in self:
            if plan.state != 'pending_confirmation':
                raise UserError(_('Solo los planings pendientes pueden confirmarse.'))
            if not plan.line_ids:
                raise UserError(_('El planning no tiene lineas para confirmar.'))

            plan.write({
                'state': 'approved',
                'approved_at': fields.Datetime.now(),
                'approved_by': self.env.user.id,
            })
        return True

    def action_release_plan(self):
        for plan in self:
            if plan.state != 'approved':
                raise UserError(_('Solo los planings aprobados pueden liberarse.'))
            if not plan.line_ids:
                raise UserError(_('El planning no tiene lineas para liberar.'))

            if plan.planning_basis == 'mixed':
                plan._create_draft_purchase_orders()
            else:
                plan._create_draft_mrp_productions(mark_released=True)
            plan.line_ids.filtered(lambda line: line.state not in ('done', 'cancel')).write({
                'state': 'released',
            })
            plan.write({
                'state': 'released',
                'released_at': fields.Datetime.now(),
                'released_by': self.env.user.id,
            })
        return True

    def action_done_plan(self):
        for plan in self:
            if plan.state != 'released':
                raise UserError(_('Solo los planings liberados pueden finalizarse.'))

            plan.line_ids.filtered(lambda line: line.state not in ('done', 'cancel')).write({
                'state': 'done',
            })
            plan.write({'state': 'done'})
        return True

    def action_cancel_plan(self):
        for plan in self:
            if plan.state not in ('pending_confirmation', 'approved'):
                raise UserError(_('Solo los planings pendientes o aprobados pueden cancelarse.'))

            plan.line_ids.filtered(lambda line: line.state != 'done').write({
                'state': 'cancel',
            })
            plan.write({'state': 'cancel'})
        return True


class ZrnPlanningMfgPlanLine(models.Model):
    _name = 'zrn_planning.mfg.plan.line'
    _description = 'Linea del plan maestro de fabricacion'
    _order = 'production_date asc, sequence asc, id asc'
    _table = 'zrn_planning_mfg_plan_line'

    plan_id = fields.Many2one(
        'zrn_planning.mfg.plan',
        string='Plan',
        required=True,
        ondelete='cascade',
    )
    sequence = fields.Integer(string='Secuencia', default=10)
    company_id = fields.Many2one(
        related='plan_id.company_id',
        string='Compania',
        store=True,
        readonly=True,
    )
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Bodega',
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)],
            limit=1,
        ),
    )
    responsible_id = fields.Many2one('res.users', string='Responsable')
    product_id = fields.Many2one(
        'product.product',
        string='Producto terminado',
        required=True,
        domain=[('detailed_type', 'in', ['product', 'consu'])],
    )
    bom_id = fields.Many2one(
        'mrp.bom',
        string='Receta',
        domain="[('product_tmpl_id', '=', product_id.product_tmpl_id)]",
    )
    production_date = fields.Date(string='Fecha de produccion')
    delivery_date = fields.Date(string='Fecha de entrega objetivo')
    qty_planned = fields.Float(string='Cantidad planeada', digits='Product Unit of Measure', default=0.0)
    qty_released = fields.Float(string='Cantidad liberada', digits='Product Unit of Measure', default=0.0)
    qty_executed = fields.Float(
        string='Cantidad ejecutada',
        digits='Product Unit of Measure',
        compute='_compute_qty_executed',
    )
    state = fields.Selection(
        [
            ('draft', 'Borrador'),
            ('ready', 'Lista'),
            ('released', 'Liberada'),
            ('in_progress', 'En proceso'),
            ('done', 'Finalizada'),
            ('cancel', 'Cancelada'),
        ],
        string='Estado',
        required=True,
        default='draft',
    )
    notes = fields.Text(string='Notas')
    supply_ids = fields.One2many(
        'zrn_planning.mfg.plan.supply',
        'plan_line_id',
        string='Insumos',
    )
    supply_count = fields.Integer(
        string='Cantidad de insumos',
        compute='_compute_supply_count',
        store=False,
    )
    production_ids = fields.One2many(
        'mrp.production',
        'zrn_planning_plan_line_id',
        string='Ordenes de fabricacion',
        readonly=True,
    )
    production_count = fields.Integer(
        string='Cantidad de OFs',
        compute='_compute_supply_count',
        store=False,
    )
    purchase_line_ids = fields.Many2many(
        'purchase.order.line',
        string='Lineas de compra',
        compute='_compute_purchase_links',
        readonly=True,
    )
    purchase_count = fields.Integer(
        string='Cantidad de OCs',
        compute='_compute_supply_count',
        store=False,
    )

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        lines.filtered(lambda line: line.plan_id.planning_basis != 'mixed')._sync_supplies_from_bom()
        return lines

    def write(self, vals):
        result = super().write(vals)
        if {'product_id', 'bom_id', 'qty_planned', 'warehouse_id'} & set(vals):
            self.filtered(lambda line: line.plan_id.planning_basis != 'mixed')._sync_supplies_from_bom()
        return result

    @api.depends(
        'production_ids.qty_produced',
        'production_ids.product_uom_id',
        'production_ids.state',
    )
    def _compute_qty_executed(self):
        for line in self:
            executed_qty = 0.0
            for production in line.production_ids.filtered(lambda production: production.state != 'cancel'):
                executed_qty += production.product_uom_id._compute_quantity(
                    production.qty_produced,
                    line.product_id.uom_id,
                    round=False,
                )
            line.qty_executed = executed_qty

    def _sync_supplies_from_bom(self):
        Supply = self.env['zrn_planning.mfg.plan.supply']
        for line in self:
            line.supply_ids.unlink()
            if not line.product_id or not line.bom_id or line.qty_planned <= 0:
                continue

            planned_qty = line.product_id.uom_id._compute_quantity(
                line.qty_planned,
                line.bom_id.product_uom_id,
                round=False,
            )
            factor = planned_qty / line.bom_id.product_qty
            _boms, bom_lines = line.bom_id.explode(
                line.product_id,
                factor,
                picking_type=line.bom_id.picking_type_id,
            )

            required_by_product = {}
            for bom_line, bom_data in bom_lines:
                component = bom_line.product_id
                required_qty = bom_line.product_uom_id._compute_quantity(
                    bom_data['qty'],
                    component.uom_id,
                    round=False,
                )
                required_by_product[component] = required_by_product.get(component, 0.0) + required_qty

            location = line.warehouse_id.lot_stock_id
            for component, required_qty in required_by_product.items():
                stock_product = component.with_context(location=location.id) if location else component
                qty_on_hand = stock_product.qty_available
                qty_forecast = stock_product.virtual_available
                qty_to_buy = max(required_qty - max(qty_forecast, 0.0), 0.0)
                Supply.create({
                    'plan_line_id': line.id,
                    'component_id': component.id,
                    'qty_per_unit': required_qty / line.qty_planned,
                    'qty_required': required_qty,
                    'qty_on_hand': qty_on_hand,
                    'qty_forecast': qty_forecast,
                    'qty_to_buy': qty_to_buy,
                    'qty_to_produce': 0.0,
                    'supply_status': (
                        'covered_stock'
                        if qty_to_buy <= 0
                        else ('to_buy' if qty_to_buy >= required_qty else 'mixed')
                    ),
                })

    @api.depends('supply_ids', 'production_ids')
    def _compute_supply_count(self):
        has_plan_line_link = self.env['zrn_planning.mfg.plan']._column_exists(
            'purchase_order_line',
            'zrn_planning_plan_line_id',
        )
        for line in self:
            line.supply_count = len(line.supply_ids)
            line.production_count = len(line.production_ids)
            if has_plan_line_link:
                purchase_lines = self.env['purchase.order.line'].search([
                    ('zrn_planning_plan_line_id', '=', line.id),
                ])
                line.purchase_count = len(purchase_lines.mapped('order_id'))
            else:
                line.purchase_count = 0

    @api.depends('plan_id')
    def _compute_purchase_links(self):
        has_plan_line_link = self.env['zrn_planning.mfg.plan']._column_exists(
            'purchase_order_line',
            'zrn_planning_plan_line_id',
        )
        for line in self:
            if has_plan_line_link:
                purchase_lines = self.env['purchase.order.line'].search([
                    ('zrn_planning_plan_line_id', '=', line.id),
                ])
                line.purchase_line_ids = [(6, 0, purchase_lines.ids)]
            else:
                line.purchase_line_ids = [(6, 0, [])]


class ZrnPlanningMfgPlanSupply(models.Model):
    _name = 'zrn_planning.mfg.plan.supply'
    _description = 'Insumo requerido por una linea de plan maestro'
    _order = 'component_id, id'
    _table = 'zrn_planning_mfg_plan_supply'

    plan_line_id = fields.Many2one(
        'zrn_planning.mfg.plan.line',
        string='Linea del plan',
        required=True,
        ondelete='cascade',
    )
    company_id = fields.Many2one(
        related='plan_line_id.company_id',
        string='Compania',
        store=True,
        readonly=True,
    )
    component_id = fields.Many2one(
        'product.product',
        string='Insumo',
        required=True,
        domain=[('detailed_type', 'in', ['product', 'consu'])],
    )
    qty_per_unit = fields.Float(string='Cantidad por unidad', digits='Product Unit of Measure', default=0.0)
    qty_required = fields.Float(string='Cantidad requerida', digits='Product Unit of Measure', default=0.0)
    qty_on_hand = fields.Float(string='Stock actual', digits='Product Unit of Measure', default=0.0)
    qty_forecast = fields.Float(string='Stock proyectado', digits='Product Unit of Measure', default=0.0)
    qty_to_buy = fields.Float(string='Cantidad a comprar', digits='Product Unit of Measure', default=0.0)
    qty_to_produce = fields.Float(string='Cantidad a producir', digits='Product Unit of Measure', default=0.0)
    supply_status = fields.Selection(
        [
            ('pending', 'Pendiente'),
            ('covered_stock', 'Cubierto con stock'),
            ('to_buy', 'Comprar'),
            ('to_produce', 'Producir'),
            ('mixed', 'Mixto'),
        ],
        string='Estado de abastecimiento',
        required=True,
        default='pending',
    )


class ZrnPlanningMfgPlanSource(models.Model):
    _name = 'zrn_planning.mfg.plan.source'
    _description = 'Documento origen del plan maestro'
    _order = 'source_date asc, id asc'
    _table = 'zrn_planning_mfg_plan_source'

    plan_id = fields.Many2one(
        'zrn_planning.mfg.plan',
        string='Plan',
        required=True,
        ondelete='cascade',
    )
    source_model = fields.Char(string='Modelo origen', required=True)
    source_id = fields.Integer(string='ID origen', required=True)
    source_ref = fields.Char(string='Referencia')
    customer_id = fields.Many2one('res.partner', string='Cliente / punto de venta')
    source_date = fields.Date(string='Fecha origen')
    source_state = fields.Char(string='Estado origen')


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    zrn_planning_plan_id = fields.Many2one(
        'zrn_planning.mfg.plan',
        string='Planning Zoraen',
        readonly=True,
        copy=False,
    )
    zrn_planning_plan_line_id = fields.Many2one(
        'zrn_planning.mfg.plan.line',
        string='Linea de planning Zoraen',
        readonly=True,
        copy=False,
    )

    def _get_backorder_mo_vals(self):
        values = super()._get_backorder_mo_vals()
        values.update({
            'zrn_planning_plan_id': self.zrn_planning_plan_id.id,
            'zrn_planning_plan_line_id': self.zrn_planning_plan_line_id.id,
        })
        return values


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    zrn_planning_plan_id = fields.Many2one(
        'zrn_planning.mfg.plan',
        string='Planning Zoraen',
        readonly=True,
        copy=False,
    )


class PurchaseOrderLine(models.Model):
    _inherit = 'purchase.order.line'

    zrn_planning_plan_line_id = fields.Many2one(
        'zrn_planning.mfg.plan.line',
        string='Linea de planning Zoraen',
        readonly=True,
        copy=False,
    )


class StockMoveLine(models.Model):
    """Herencia de stock.move.line para validar lotes archivados.

    Esta validacion SOLO se aplica a movimientos de materia prima
    vinculados a ordenes de fabricacion generadas desde el planeador
    de abastecimiento de (ZRN) Planeacion (zrn_planning_plan_id).
    No afecta movimientos de stock nativos ni OFs creadas manualmente.
    """
    _inherit = 'stock.move.line'

    @api.constrains('lot_id')
    def _check_lot_not_archived(self):
        for line in self:
            if not line.lot_id or line.lot_id.active:
                continue
            # Solo validamos en movimientos de materia prima de una OF de (ZRN) Planeacion
            production = line.move_id.raw_material_production_id
            if production and production.zrn_planning_plan_id:
                raise ValidationError(_(
                    "El lote '%s' esta archivado y no puede utilizarse en una orden de "
                    "fabricacion generada por el planeador de (ZRN) Planeacion."
                ) % line.lot_id.name)
