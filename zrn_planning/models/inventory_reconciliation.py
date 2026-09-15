# -*- coding: utf-8 -*-

import json
from datetime import datetime, time

from odoo import _, api, fields, models
from odoo.exceptions import UserError

from .planning_models import ZrnPlanningNavigationMixin


class ZrnPlanningInventoryReconciliation(ZrnPlanningNavigationMixin, models.Model):
    _name = 'zrn_planning.inventory.reconciliation'
    _description = 'Cuadre de inventario'

    name = fields.Char(string='Nombre', required=True, default='Cuadre Inventario')
    date_from = fields.Date(string='Fecha desde')
    date_to = fields.Date(string='Fecha hasta')
    lot_name = fields.Char(
        string='Lote',
        compute='_compute_extra_filter_fields',
        inverse='_inverse_extra_filter_fields',
        store=False,
        readonly=False,
    )
    internal_ref = fields.Char(
        string='Referencia interna',
        compute='_compute_extra_filter_fields',
        inverse='_inverse_extra_filter_fields',
        store=False,
        readonly=False,
    )
    product_ids = fields.Many2many(
        'product.product',
        string='Productos',
        compute='_compute_extra_filter_fields',
        inverse='_inverse_extra_filter_fields',
        store=False,
        readonly=False,
    )
    category_ids = fields.Many2many(
        'product.category',
        string='Categorias',
        compute='_compute_extra_filter_fields',
        inverse='_inverse_extra_filter_fields',
        store=False,
        readonly=False,
    )
    location_ids = fields.Many2many(
        'stock.location',
        string='Ubicaciones',
        compute='_compute_extra_filter_fields',
        inverse='_inverse_extra_filter_fields',
        store=False,
        readonly=False,
    )
    only_on_hand = fields.Boolean(string='Solo con stock disponible', default=True)
    show_archived = fields.Boolean(string='Mostrar archivados')
    line_ids = fields.One2many(
        'zrn_planning.inventory.reconciliation.line',
        'reconciliation_id',
        string='Lotes visibles',
    )
    lot_ids = fields.Many2many('stock.lot', string='Lotes filtrados', compute='_compute_lot_ids', readonly=True)
    lot_count = fields.Integer(string='Lotes', compute='_compute_lot_ids', readonly=True)
    active_lot_count = fields.Integer(string='Activos', compute='_compute_lot_ids', readonly=True)
    archived_lot_count = fields.Integer(string='Archivados', compute='_compute_lot_ids', readonly=True)
    stock_qty_total = fields.Float(string='Stock total', compute='_compute_lot_ids', readonly=True)
    selected_line_count = fields.Integer(string='Lotes seleccionados', compute='_compute_selected_line_count', readonly=True)
    date_range_mode = fields.Selection(
        [('range', 'Rango'), ('from', 'Desde'), ('to', 'Hasta'), ('all', 'Todos')],
        compute='_compute_date_range_labels',
        readonly=True,
    )
    date_from_label = fields.Char(string='Fecha desde label', compute='_compute_date_range_labels', readonly=True)
    date_to_label = fields.Char(string='Fecha hasta label', compute='_compute_date_range_labels', readonly=True)
    date_range_label = fields.Char(string='Etiqueta de rango', compute='_compute_date_range_labels', readonly=True)

    def _get_extra_filter_key(self):
        self.ensure_one()
        return 'zrn_planning.inventory_reconciliation.extra_filters.%s' % (self.id or 'default')

    def _read_extra_filter_values(self):
        self.ensure_one()
        raw_values = self.env['ir.config_parameter'].sudo().get_param(self._get_extra_filter_key()) or '{}'
        try:
            values = json.loads(raw_values)
        except json.JSONDecodeError:
            values = {}
        return values if isinstance(values, dict) else {}

    def _compute_extra_filter_fields(self):
        Product = self.env['product.product']
        Category = self.env['product.category']
        Location = self.env['stock.location']
        for record in self:
            values = record._read_extra_filter_values()
            record.lot_name = values.get('lot_name') or False
            record.internal_ref = values.get('internal_ref') or False
            record.product_ids = Product.browse(values.get('product_ids') or [])
            record.category_ids = Category.browse(values.get('category_ids') or [])
            record.location_ids = Location.browse(values.get('location_ids') or [])

    def _inverse_extra_filter_fields(self):
        Config = self.env['ir.config_parameter'].sudo()
        for record in self:
            values = record._read_extra_filter_values()
            cache = record.env.cache
            if cache.contains(record, record._fields['lot_name']):
                values['lot_name'] = record.lot_name or False
            if cache.contains(record, record._fields['internal_ref']):
                values['internal_ref'] = record.internal_ref or False
            if cache.contains(record, record._fields['product_ids']):
                values['product_ids'] = record.product_ids.ids
            if cache.contains(record, record._fields['category_ids']):
                values['category_ids'] = record.category_ids.ids
            if cache.contains(record, record._fields['location_ids']):
                values['location_ids'] = record.location_ids.ids
            Config.set_param(record._get_extra_filter_key(), json.dumps(values))

    @api.depends('date_from', 'date_to')
    def _compute_date_range_labels(self):
        for record in self:
            record.date_from_label = fields.Date.to_string(record.date_from) if record.date_from else False
            record.date_to_label = fields.Date.to_string(record.date_to) if record.date_to else False
            if record.date_from and record.date_to:
                record.date_range_mode = 'range'
                record.date_range_label = False
            elif record.date_from:
                record.date_range_mode = 'from'
                record.date_range_label = False
            elif record.date_to:
                record.date_range_mode = 'to'
                record.date_range_label = False
            else:
                record.date_range_mode = 'all'
                record.date_range_label = 'Todos los lotes vigentes'

    @api.depends(
        'date_from',
        'date_to',
        'lot_name',
        'internal_ref',
        'product_ids',
        'category_ids',
        'location_ids',
        'only_on_hand',
        'show_archived',
    )
    def _compute_lot_ids(self):
        for record in self:
            lots = record._get_filtered_lots()
            record.lot_ids = lots
            record.lot_count = len(lots)
            record.active_lot_count = len(lots.filtered('active'))
            record.archived_lot_count = len(lots.filtered(lambda lot: not lot.active))
            record.stock_qty_total = sum(lots.mapped('product_qty'))

    @api.depends('line_ids.is_selected')
    def _compute_selected_line_count(self):
        for record in self:
            record.selected_line_count = len(record.line_ids.filtered('is_selected'))

    def _get_lot_search_model(self):
        self.ensure_one()
        lot_model = self.env['stock.lot']
        if self.show_archived:
            lot_model = lot_model.with_context(active_test=False)
        return lot_model

    def _get_filtered_lots(self):
        self.ensure_one()
        domain = []
        if self.only_on_hand:
            domain.append(('product_qty', '>', 0))
        if self.date_from:
            date_from = datetime.combine(self.date_from, time.min)
            domain.append(('create_date', '>=', fields.Datetime.to_string(date_from)))
        if self.date_to:
            date_to = datetime.combine(self.date_to, time.max)
            domain.append(('create_date', '<=', fields.Datetime.to_string(date_to)))
        if self.lot_name:
            domain.append(('name', 'ilike', self.lot_name.strip()))
        if self.internal_ref:
            domain.append(('ref', 'ilike', self.internal_ref.strip()))
        if self.product_ids:
            domain.append(('product_id', 'in', self.product_ids.ids))
        if self.category_ids:
            domain.append(('product_id.categ_id', 'child_of', self.category_ids.ids))
        if self.location_ids:
            domain.append(('quant_ids.location_id', 'in', self.location_ids.ids))
        return self._get_lot_search_model().search(domain, order='create_date asc, id asc')

    def _sync_lot_lines(self, lots=None):
        self.ensure_one()
        lots = lots or self._get_filtered_lots()
        existing_lines = {line.lot_id.id: line for line in self.line_ids}
        wanted_ids = set(lots.ids)

        stale_lines = self.line_ids.filtered(lambda line: line.lot_id.id not in wanted_ids)
        if stale_lines:
            stale_lines.unlink()

        create_vals = []
        for sequence, lot in enumerate(lots, start=1):
            line = existing_lines.get(lot.id)
            if line:
                if line.sequence != sequence:
                    line.sequence = sequence
                continue
            create_vals.append({
                'reconciliation_id': self.id,
                'lot_id': lot.id,
                'sequence': sequence,
            })
        if create_vals:
            self.env['zrn_planning.inventory.reconciliation.line'].create(create_vals)

    def _clear_line_selection(self):
        self.ensure_one()
        selected_lines = self.line_ids.filtered('is_selected')
        if selected_lines:
            selected_lines.write({'is_selected': False})

    def _get_selected_lots(self):
        self.ensure_one()
        return self.line_ids.filtered('is_selected').mapped('lot_id')

    def _require_scope_for_mass_action(self):
        self.ensure_one()
        if not self.date_from and not self.date_to:
            raise UserError(_('Defina al menos una fecha antes de ejecutar una accion masiva sobre lotes.'))

    def action_apply_filters(self):
        self.ensure_one()
        self._sync_lot_lines()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_clear_filters(self):
        self.ensure_one()
        self.write({
            'date_from': False,
            'date_to': False,
            'lot_name': False,
            'internal_ref': False,
            'product_ids': [(5, 0, 0)],
            'category_ids': [(5, 0, 0)],
            'location_ids': [(5, 0, 0)],
            'only_on_hand': True,
            'show_archived': False,
        })
        self._clear_line_selection()
        self._sync_lot_lines()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_archive_filtered_lots(self):
        self.ensure_one()
        self._require_scope_for_mass_action()
        lots = self._get_filtered_lots().filtered('active')
        if not lots:
            raise UserError(_('No hay lotes activos dentro del rango seleccionado.'))
        lots.action_archive()
        self._clear_line_selection()
        self._sync_lot_lines()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_archive_selected_lots(self):
        self.ensure_one()
        self._require_scope_for_mass_action()
        selected_lines = self.line_ids.filtered('is_selected')
        if len(selected_lines) > 500:
            raise UserError(_('No puede archivar mas de 500 lotes a la vez para evitar sobrecargar el servidor. Lotes seleccionados actualmente: %s') % len(selected_lines))
        lots = selected_lines.mapped('lot_id').filtered('active')
        if not lots:
            raise UserError(_('Seleccione al menos un lote activo para archivarlo.'))
        lots.action_archive()
        self._clear_line_selection()
        self._sync_lot_lines()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_select_visible_lots(self):
        self.ensure_one()
        # Selecciona las primeras 500 líneas visibles del cuadre
        lines_to_select = self.line_ids[:500]
        if lines_to_select:
            lines_to_select.write({'is_selected': True})
        # Deselecciona el resto si los hubiera
        remaining_lines = self.line_ids[500:]
        if remaining_lines:
            remaining_lines.write({'is_selected': False})
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_deselect_all_lots(self):
        self.ensure_one()
        self._clear_line_selection()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_unarchive_filtered_lots(self):
        self.ensure_one()
        self._require_scope_for_mass_action()
        lots = self.env['stock.lot'].with_context(active_test=False).browse(self._get_filtered_lots().ids).filtered(lambda lot: not lot.active)
        if not lots:
            raise UserError(_('No hay lotes archivados dentro del rango seleccionado.'))
        lots.action_unarchive()
        self._clear_line_selection()
        self._sync_lot_lines()
        return self._open_singleton_action('zrn_planning.action_zrn_planning_inventory_reconciliation')

    def action_open_filtered_lots(self):
        self.ensure_one()
        action = self.env.ref('stock.action_production_lot_form').read()[0]
        action['name'] = _('Lotes filtrados')
        action['domain'] = [('id', 'in', self._get_filtered_lots().ids)]
        action_context = {
            'active_test': False,
            'display_complete': True,
            'search_default_group_by_product': 1,
            'default_company_id': self.env.company.id,
        }
        if self.only_on_hand:
            action_context['search_default_on_hand'] = 1
        action['context'] = action_context
        return action


class ZrnPlanningInventoryReconciliationLine(models.Model):
    _name = 'zrn_planning.inventory.reconciliation.line'
    _description = 'Linea visible de cuadre de inventario'
    _order = 'sequence, id'

    sequence = fields.Integer(string='Secuencia', default=10)
    reconciliation_id = fields.Many2one(
        'zrn_planning.inventory.reconciliation',
        string='Cuadre',
        required=True,
        ondelete='cascade',
    )
    lot_id = fields.Many2one('stock.lot', string='Lote', required=True, ondelete='cascade')
    is_selected = fields.Boolean(string='Seleccionar')
    lot_state = fields.Selection(
        [
            ('active', 'Activo'),
            ('archived', 'Archivado'),
        ],
        string='Estado',
        compute='_compute_lot_state',
        readonly=True,
    )
    name = fields.Char(related='lot_id.name', string='Codigo lote', readonly=True)
    product_id = fields.Many2one(related='lot_id.product_id', string='Producto', readonly=True)
    ref = fields.Char(related='lot_id.ref', string='Referencia interna', readonly=True)
    create_date = fields.Datetime(related='lot_id.create_date', string='Fecha lote', readonly=True)
    zrn_oldest_in_date = fields.Datetime(related='lot_id.zrn_oldest_in_date', string='Primera entrada', readonly=True)
    product_qty = fields.Float(related='lot_id.product_qty', string='Stock disponible', readonly=True)
    zrn_location_names = fields.Char(related='lot_id.zrn_location_names', string='Ubicaciones', readonly=True)
    company_id = fields.Many2one(related='lot_id.company_id', string='Compania', readonly=True)

    @api.depends('lot_id.active')
    def _compute_lot_state(self):
        for line in self:
            line.lot_state = 'active' if line.lot_id.active else 'archived'
