# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ZrnCommercialChannel(models.Model):
    _name = 'zrn_commercial.commercial.channel'
    _description = 'Canal comercial'
    _order = 'business_unit_id, name, id'

    name = fields.Char(string='Canal comercial', required=True)
    code = fields.Char(string='Codigo')
    active = fields.Boolean(string='Activo', default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        required=True,
        default=lambda self: self.env.company,
    )
    business_unit_id = fields.Many2one(
        'zrn_commercial.business.unit',
        string='Unidad de negocio',
        ondelete='restrict',
    )
    description = fields.Text(string='Descripcion')
    notes = fields.Text(string='Notas internas')
    owner_user_id = fields.Many2one(
        'res.users',
        string='Responsable comercial',
    )
    category_ids = fields.One2many(
        'zrn_commercial.commercial.channel.category',
        'channel_id',
        string='Categorias',
    )
    partner_link_ids = fields.One2many(
        'zrn_commercial.commercial.channel.partner',
        'channel_id',
        string='Clientes / PDVs / personas',
    )
    category_count = fields.Integer(
        string='Total categorias',
        compute='_compute_channel_counts',
        store=False,
    )
    partner_count = fields.Integer(
        string='Total registros',
        compute='_compute_channel_counts',
        store=False,
    )

    _sql_constraints = [
        (
            'company_code_uniq',
            'unique(company_id, code)',
            'El codigo de canal debe ser unico por compania.',
        ),
        (
            'company_name_uniq',
            'unique(company_id, name)',
            'El nombre de canal debe ser unico por compania.',
        ),
    ]

    @api.depends('category_ids', 'partner_link_ids')
    def _compute_channel_counts(self):
        for channel in self:
            channel.category_count = len(channel.category_ids)
            channel.partner_count = len(channel.partner_link_ids)


class ZrnCommercialBusinessUnit(models.Model):
    _name = 'zrn_commercial.business.unit'
    _description = 'Unidad de negocio comercial'
    _order = 'name, id'

    name = fields.Char(string='Unidad de negocio', required=True)
    code = fields.Char(string='Codigo')
    active = fields.Boolean(string='Activo', default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        required=True,
        default=lambda self: self.env.company,
    )
    description = fields.Text(string='Descripcion')
    channel_ids = fields.One2many(
        'zrn_commercial.commercial.channel',
        'business_unit_id',
        string='Canales',
    )
    brand_ids = fields.One2many(
        'zrn_commercial.commercial.brand',
        'business_unit_id',
        string='Marcas',
    )
    channel_count = fields.Integer(
        string='Total canales',
        compute='_compute_commercial_counts',
        store=False,
    )
    brand_count = fields.Integer(
        string='Total marcas',
        compute='_compute_commercial_counts',
        store=False,
    )

    _sql_constraints = [
        (
            'company_name_uniq',
            'unique(company_id, name)',
            'La unidad de negocio debe ser unica por compania.',
        ),
        (
            'company_code_uniq',
            'unique(company_id, code)',
            'El codigo de unidad de negocio debe ser unico por compania.',
        ),
    ]

    @api.depends('channel_ids', 'brand_ids')
    def _compute_commercial_counts(self):
        for unit in self:
            unit.channel_count = len(unit.channel_ids)
            unit.brand_count = len(unit.brand_ids)


class ZrnCommercialChannelCategory(models.Model):
    _name = 'zrn_commercial.commercial.channel.category'
    _description = 'Categoria de canal comercial'
    _order = 'sequence, name, id'

    sequence = fields.Integer(string='Secuencia', default=10)
    channel_id = fields.Many2one(
        'zrn_commercial.commercial.channel',
        string='Canal',
        required=True,
        ondelete='cascade',
    )
    business_unit_id = fields.Many2one(
        'zrn_commercial.business.unit',
        string='Unidad de negocio',
        related='channel_id.business_unit_id',
        store=True,
        readonly=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        related='channel_id.company_id',
        store=True,
        readonly=True,
    )
    name = fields.Char(string='Categoria de canal', required=True)
    code = fields.Char(string='Codigo')
    description = fields.Text(string='Descripcion')
    partner_link_ids = fields.One2many(
        'zrn_commercial.commercial.channel.partner',
        'category_id',
        string='Clientes / PDVs / personas',
    )
    partner_count = fields.Integer(
        string='Registros',
        compute='_compute_partner_count',
        store=False,
    )

    _sql_constraints = [
        (
            'channel_name_uniq',
            'unique(channel_id, name)',
            'La categoria debe ser unica dentro del canal.',
        ),
        (
            'channel_code_uniq',
            'unique(channel_id, code)',
            'El codigo de categoria debe ser unico dentro del canal.',
        ),
    ]

    @api.depends('partner_link_ids')
    def _compute_partner_count(self):
        for category in self:
            category.partner_count = len(category.partner_link_ids)


class ZrnCommercialChannelPartner(models.Model):
    _name = 'zrn_commercial.commercial.channel.partner'
    _description = 'Cliente, PDV o persona asignada a canal comercial'
    _order = 'sequence, id'

    sequence = fields.Integer(string='Secuencia', default=10)
    channel_id = fields.Many2one(
        'zrn_commercial.commercial.channel',
        string='Canal comercial',
        required=True,
        ondelete='cascade',
    )
    category_id = fields.Many2one(
        'zrn_commercial.commercial.channel.category',
        string='Categoria de canal',
        ondelete='restrict',
        domain="[('channel_id', '=', channel_id)]",
    )
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        related='channel_id.company_id',
        store=True,
        readonly=True,
    )
    available_partner_ids = fields.Many2many(
        'res.partner',
        string='Contactos disponibles',
        compute='_compute_available_partner_ids',
        store=False,
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Cliente / PDV / persona',
        required=True,
        ondelete='restrict',
        domain="[('id', 'in', available_partner_ids)]",
    )
    commercial_partner_id = fields.Many2one(
        'res.partner',
        string='Cliente comercial',
        related='partner_id.commercial_partner_id',
        store=True,
        readonly=True,
    )
    vat = fields.Char(
        string='NIT',
        related='partner_id.vat',
        store=True,
        readonly=True,
    )
    city = fields.Char(
        string='Ciudad',
        related='partner_id.city',
        store=True,
        readonly=True,
    )
    state_id = fields.Many2one(
        'res.country.state',
        string='Departamento',
        related='partner_id.state_id',
        store=True,
        readonly=True,
    )
    country_id = fields.Many2one(
        'res.country',
        string='Pais',
        related='partner_id.country_id',
        store=True,
        readonly=True,
    )
    active = fields.Boolean(string='Activo', default=True)
    notes = fields.Text(string='Notas')

    _sql_constraints = [
        (
            'partner_uniq',
            'unique(partner_id)',
            'El cliente o PDV ya fue asignado a un canal comercial.',
        ),
    ]

    @api.depends('channel_id', 'partner_id')
    def _compute_available_partner_ids(self):
        Partner = self.env['res.partner']
        assigned_partner_ids = self.search([]).mapped('partner_id').ids
        for record in self:
            current_partner_ids = record.partner_id.ids
            blocked_partner_ids = list(set(assigned_partner_ids) - set(current_partner_ids))
            available_partners = Partner.search([
                ('type', '!=', 'private'),
                ('id', 'not in', blocked_partner_ids),
            ])
            record.available_partner_ids = available_partners

    @api.onchange('category_id')
    def _onchange_category_id(self):
        for record in self:
            if record.category_id:
                record.channel_id = record.category_id.channel_id

    @api.constrains('partner_id')
    def _check_customer_partner(self):
        for record in self:
            partner = record.partner_id
            if not partner:
                continue
            if partner.type == 'private':
                raise ValidationError('No se pueden asignar contactos privados a un canal comercial.')

    @api.constrains('channel_id', 'category_id')
    def _check_category_channel(self):
        for record in self:
            if record.category_id and record.category_id.channel_id != record.channel_id:
                raise ValidationError('La categoria debe pertenecer al canal seleccionado.')
