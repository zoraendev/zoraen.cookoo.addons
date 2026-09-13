# -*- coding: utf-8 -*-

import base64
import binascii

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools.image import ImageProcess
from odoo.tools.mimetypes import guess_mimetype


class ZrnCommercialBrand(models.Model):
    _name = 'zrn_commercial.commercial.brand'
    _description = 'Marca comercial'
    _order = 'business_unit_id, name, id'

    _LOGO_MAX_FILE_SIZE = 5 * 1024 * 1024
    _LOGO_ALLOWED_MIMETYPES = {
        'image/jpeg',
        'image/png',
        'image/webp',
    }

    name = fields.Char(string='Marca', required=True)
    code = fields.Char(string='Codigo')
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
    logo = fields.Image(string='Logo', max_width=512, max_height=512, attachment=False)
    source_model = fields.Char(string='Modelo origen', readonly=True, copy=False)
    source_model_name = fields.Char(string='Nombre del modelo origen', readonly=True, copy=False)
    source_record_id = fields.Integer(string='ID origen', readonly=True, copy=False)
    source_record_name = fields.Char(string='Registro origen', readonly=True, copy=False)
    source_sync_date = fields.Datetime(string='Ultima sincronizacion', readonly=True, copy=False)
    category_ids = fields.One2many(
        'zrn_commercial.commercial.brand.category',
        'brand_id',
        string='Categorias',
    )
    category_count = fields.Integer(
        string='Total categorias',
        compute='_compute_category_stats',
        store=False,
    )
    product_count = fields.Integer(
        string='Total productos',
        compute='_compute_category_stats',
        store=False,
    )

    _sql_constraints = [
        (
            'company_code_uniq',
            'unique(company_id, code)',
            'El codigo de marca debe ser unico por compania.',
        ),
    ]

    @api.depends('category_ids', 'category_ids.product_ids')
    def _compute_category_stats(self):
        for brand in self:
            brand.category_count = len(brand.category_ids)
            brand.product_count = len(brand.category_ids.mapped('product_ids'))

    @api.constrains('logo')
    def _check_logo_file(self):
        for brand in self:
            if not brand.logo:
                continue

            try:
                logo_binary = base64.b64decode(brand.logo, validate=True)
            except (binascii.Error, ValueError):
                raise ValidationError('El logo no tiene un formato de archivo valido.')

            if len(logo_binary) > self._LOGO_MAX_FILE_SIZE:
                raise ValidationError(
                    'El logo excede el tamano permitido de 5 MB. Usa una imagen mas liviana.'
                )

            mimetype = guess_mimetype(logo_binary, default='application/octet-stream')
            if mimetype not in self._LOGO_ALLOWED_MIMETYPES:
                raise ValidationError('El logo debe estar en formato PNG, JPG/JPEG o WEBP.')

            try:
                ImageProcess(logo_binary, verify_resolution=True)
            except Exception as error:
                raise ValidationError(
                    f'No se pudo validar la imagen del logo: {error}'
                ) from error

    @api.model
    def _get_available_source_model_ids(self):
        model_ids = []
        candidate_models = self.env['ir.model'].sudo().search([('transient', '=', False)])
        for model in candidate_models:
            haystack = '%s %s' % (model.model or '', model.name or '')
            haystack = haystack.lower()
            if 'brand' not in haystack and 'marca' not in haystack:
                continue
            if model.model not in self.env:
                continue
            model_obj = self.env[model.model]
            if 'name' not in model_obj._fields:
                continue
            model_ids.append(model.id)
        return model_ids

    @api.model
    def _extract_source_brand_values(self, source_record, company=None):
        def _get_scalar(field_names):
            for field_name in field_names:
                if field_name not in source_record._fields:
                    continue
                value = source_record[field_name]
                if not value:
                    continue
                if isinstance(value, models.BaseModel):
                    return value.display_name
                return value
            return False

        image_value = False
        for image_field in ('logo', 'image_1920', 'image_1024', 'image_512', 'image_256', 'image_128', 'image'):
            if image_field in source_record._fields and source_record[image_field]:
                image_value = source_record[image_field]
                break

        company_record = company
        if not company_record and 'company_id' in source_record._fields:
            company_record = source_record.company_id

        return {
            'name': _get_scalar(('name', 'display_name')),
            'code': _get_scalar(('code', 'default_code', 'short_name')),
            'logo': image_value,
            'company_id': company_record.id if company_record else self.env.company.id,
            'source_model': source_record._name,
            'source_model_name': source_record._description or source_record._name,
            'source_record_id': source_record.id,
            'source_record_name': source_record.display_name,
        }

    @api.model
    def _find_existing_brand_from_source(self, source_model, source_record_id, source_values, company=None):
        company = company or self.env.company
        brand = self.search([
            ('source_model', '=', source_model),
            ('source_record_id', '=', source_record_id),
            ('company_id', '=', company.id),
        ], limit=1)
        if brand:
            return brand
        if source_values.get('code'):
            brand = self.search([
                ('company_id', '=', company.id),
                ('code', '=', source_values['code']),
            ], limit=1)
            if brand:
                return brand
        return self.search([
            ('company_id', '=', company.id),
            ('name', '=', source_values.get('name')),
        ], limit=1)

    @api.model
    def import_from_source_records(self, source_model, source_record_ids, company=None):
        if not source_model or not source_record_ids:
            return self.browse()

        if source_model not in self.env:
            raise UserError(_('El modelo origen seleccionado ya no esta disponible para importar marcas.'))

        company = company or self.env.company
        imported_brands = self.browse()
        source_records = self.env[source_model].sudo().browse(source_record_ids).exists()
        for source_record in source_records:
            source_values = self._extract_source_brand_values(source_record, company=company)
            existing_brand = self._find_existing_brand_from_source(
                source_model,
                source_record.id,
                source_values,
                company=company,
            )
            if existing_brand:
                sync_values = {
                    'source_model': source_values['source_model'],
                    'source_model_name': source_values['source_model_name'],
                    'source_record_id': source_values['source_record_id'],
                    'source_record_name': source_values['source_record_name'],
                    'source_sync_date': fields.Datetime.now(),
                }
                if not existing_brand.code and source_values.get('code'):
                    sync_values['code'] = source_values['code']
                if not existing_brand.logo and source_values.get('logo'):
                    sync_values['logo'] = source_values['logo']
                existing_brand.write(sync_values)
                imported_brands |= existing_brand
                continue

            imported_brands |= self.create({
                'name': source_values['name'],
                'code': source_values.get('code'),
                'logo': source_values.get('logo'),
                'company_id': company.id,
                'source_model': source_values['source_model'],
                'source_model_name': source_values['source_model_name'],
                'source_record_id': source_values['source_record_id'],
                'source_record_name': source_values['source_record_name'],
                'source_sync_date': fields.Datetime.now(),
            })
        return imported_brands

    def action_open_import_wizard(self):
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'zrn_commercial.brand.import.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_company_id': self.env.company.id,
            },
        }

    def action_sync_from_source(self):
        self.ensure_one()
        if not self.source_model or not self.source_record_id:
            raise UserError('Esta marca no tiene un origen registrado para sincronizar.')
        self.import_from_source_records(
            self.source_model,
            [self.source_record_id],
            company=self.company_id,
        )
        return True


class ZrnCommercialBrandCategory(models.Model):
    _name = 'zrn_commercial.commercial.brand.category'
    _description = 'Categoria de marca comercial'
    _order = 'sequence, name, id'

    sequence = fields.Integer(string='Secuencia', default=10)
    brand_id = fields.Many2one(
        'zrn_commercial.commercial.brand',
        string='Marca',
        required=True,
        ondelete='cascade',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Compania',
        related='brand_id.company_id',
        store=True,
        readonly=True,
    )
    name = fields.Char(string='Categoria', required=True)
    code = fields.Char(string='Codigo')
    category_type = fields.Selection(
        [
            ('line', 'Linea'),
            ('family', 'Familia'),
            ('format', 'Formato'),
            ('segment', 'Segmento'),
        ],
        string='Tipo',
        default='line',
        required=True,
    )
    positioning = fields.Char(string='Posicionamiento')
    target_market = fields.Char(string='Mercado objetivo')
    price_tier = fields.Selection(
        [
            ('value', 'Valor'),
            ('standard', 'Estandar'),
            ('premium', 'Premium'),
        ],
        string='Nivel de precio',
        default='standard',
    )
    description = fields.Text(string='Descripcion')
    notes = fields.Text(string='Notas')
    product_ids = fields.Many2many(
        'product.product',
        'zrn_commercial_brand_category_product_rel',
        'category_id',
        'product_id',
        string='Productos',
        domain="[('id', 'in', available_product_ids)]",
    )
    available_product_ids = fields.Many2many(
        'product.product',
        string='Productos disponibles',
        compute='_compute_available_product_ids',
        store=False,
    )
    product_count = fields.Integer(
        string='Total productos',
        compute='_compute_product_count',
        store=False,
    )

    _sql_constraints = [
        (
            'brand_name_uniq',
            'unique(brand_id, name)',
            'La categoria debe ser unica dentro de la marca.',
        ),
        (
            'brand_code_uniq',
            'unique(brand_id, code)',
            'El codigo de categoria debe ser unico dentro de la marca.',
        ),
    ]

    @api.depends('product_ids')
    def _compute_product_count(self):
        for category in self:
            category.product_count = len(category.product_ids)

    @api.depends('product_ids')
    def _compute_available_product_ids(self):
        Product = self.env['product.product']
        assigned_product_ids = set(
            self.env['zrn_commercial.commercial.brand.category']
            .search([])
            .mapped('product_ids')
            .ids
        )
        for category in self:
            blocked_product_ids = list(assigned_product_ids - set(category.product_ids.ids))
            category.available_product_ids = Product.search([
                ('sale_ok', '=', True),
                ('id', 'not in', blocked_product_ids),
            ])

    @api.constrains('product_ids')
    def _check_sale_ok_products(self):
        for category in self:
            invalid_products = category.product_ids.filtered(lambda product: not product.sale_ok)
            if invalid_products:
                raise ValidationError('Solo se pueden asignar productos configurados para venta.')
            duplicated_products = self.search([
                ('id', '!=', category.id),
                ('product_ids', 'in', category.product_ids.ids),
            ], limit=1)
            if duplicated_products:
                raise ValidationError(
                    'Un producto solo puede estar relacionado a una categoria de marca.'
                )
