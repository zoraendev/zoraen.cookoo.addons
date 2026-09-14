# -*- coding: utf-8 -*-
{
    'name': '(ZRN) Manejo Comercial',
    'summary': 'Capa comercial operativa independiente para Zoraen',
    'description': """
(ZRN) Manejo Comercial
======================

Addon dedicado a la capa comercial operativa:
- marcas comerciales propias con categorias
- canales comerciales propios
- importacion de marcas desde catalogos existentes de Odoo
    """,
    'author': 'Zoraen Corporation',
    'website': 'https://www.zoraen.com',
    'category': 'Sales',
    'version': '0.1.2',
    'license': 'LGPL-3',
    'application': True,
    'depends': ['base', 'product', 'contacts', 'sale_management'],
    'data': [
        'security/ir.model.access.csv',
        'views/commercial_brand_import_views.xml',
        'views/commercial_brand_views.xml',
        'views/commercial_channel_views.xml',
        'views/commercial_home_views.xml',
        'views/commercial_hub_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'zrn_commercial/static/lib/echarts/echarts.min.js',
            'zrn_commercial/static/src/js/commercial_home_dashboard.js',
            'zrn_commercial/static/src/scss/commercial_home_dashboard.scss',
            'zrn_commercial/static/src/js/commercial_hub_action.js',
            'zrn_commercial/static/src/scss/commercial_hub_action.scss',
            'zrn_commercial/static/src/xml/commercial_hub_action.xml',
            'zrn_commercial/static/src/xml/hubs/*.xml',
        ],
    },
    'installable': True,
}
