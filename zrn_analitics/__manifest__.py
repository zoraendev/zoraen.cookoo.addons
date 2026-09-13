# -*- coding: utf-8 -*-
{
    'name': '(ZRN) Analitica',
    'summary': 'Centro base para hubs, reporteria y analisis de datos de Zoraen',
    'description': """
(ZRN) Analitica
===============

Addon base para la capa analitica:
- hubs ejecutivos y operativos
- reporteria y analisis
- dashboards dinamicos
- procesamiento de datos para metricas
    """,
    'author': 'Zoraen Corporation',
    'website': 'https://www.zoraen.com',
    'category': 'Reporting',
    'version': '0.1.1',
    'license': 'LGPL-3',
    'application': True,
    'depends': ['base', 'web', 'sale', 'stock', 'purchase', 'hr', 'hr_recruitment', 'zrn_commercial'],
    'data': [
        'security/ir.model.access.csv',
        'views/analytics/placeholders/analytics_hub_views.xml',
        'views/analytics/analytics_home_views.xml',
        'views/analytics/placeholders/analytics_overview_views.xml',
        'views/analytics/placeholders/analytics_workspace_views.xml',
        'views/analytics/placeholders/analytics_processing_views.xml',
        'views/analytics/placeholders/analytics_scenarios_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'zrn_analitics/static/lib/echarts/echarts.min.js',
            'zrn_analitics/static/lib/xlsx/xlsx.full.min.js',
            'zrn_analitics/static/lib/alasql/alasql.min.js',
            'zrn_analitics/static/src/js/analytics_processing_utils.js',
            'zrn_analitics/static/src/js/analytics_processing_sources.js',
            'zrn_analitics/static/src/js/analytics_processing_tables.js',
            'zrn_analitics/static/src/js/analytics_processing_view.js',
            'zrn_analitics/static/src/js/dark_mode_bridge.js',
            'zrn_analitics/static/src/js/analytics_form_view.js',
            'zrn_analitics/static/src/js/analytics_hub_action.js',
            'zrn_analitics/static/src/xml/analytics_form_view.xml',
            'zrn_analitics/static/src/xml/analytics_hub_action.xml',
            'zrn_analitics/static/src/xml/hubs/hub_direction.xml',
            'zrn_analitics/static/src/xml/hubs/hub_commercial.xml',
            'zrn_analitics/static/src/xml/hubs/hub_financial.xml',
            'zrn_analitics/static/src/xml/hubs/hub_operations.xml',
            'zrn_analitics/static/src/xml/hubs/hub_pdv.xml',
            'zrn_analitics/static/src/xml/hubs/hub_rrhh.xml',
            'zrn_analitics/static/zrn/css/colors.css',
            'zrn_analitics/static/zrn/css/lib.css',
        ],
    },
    'installable': True,
}
