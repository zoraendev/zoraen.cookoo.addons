# -*- coding: utf-8 -*-

from odoo.tests.common import TransactionCase
from odoo.fields import Date


class TestCommercialHome(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super(TestCommercialHome, cls).setUpClass()
        cls.home_model = cls.env['zrn_commercial.home']
        cls.lead_model = cls.env['crm.lead']
        cls.brand_model = cls.env['zrn_commercial.commercial.brand']
        cls.channel_model = cls.env['zrn_commercial.commercial.channel']

        # Crear registros de prueba para Leads (tipo 'lead') - creamos 8 para validar el límite de 7
        for i in range(8):
            cls.lead_model.create({
                'name': f'Prospecto de Prueba {i}',
                'type': 'lead',
                'active': True,
            })

        # Crear registros de prueba para Oportunidades (tipo 'opportunity') - creamos 8
        for i in range(8):
            cls.lead_model.create({
                'name': f'Oportunidad de Prueba {i}',
                'type': 'opportunity',
                'active': True,
            })

        # Crear registros de prueba para Marcas - creamos 8
        for i in range(8):
            cls.brand_model.create({
                'name': f'Marca de Prueba {i}',
                'active': True,
            })

        # Crear registros de prueba para Canales - creamos 8
        for i in range(8):
            cls.channel_model.create({
                'name': f'Canal de Prueba {i}',
                'active': True,
            })

        # Obtener el registro por defecto del Home
        cls.home_record = cls.home_model.search([], limit=1)
        if not cls.home_record:
            cls.home_record = cls.home_model.create({
                'name': 'Test (ZRN) Manejo Comercial Home',
                'page_key': 'overview',
            })

    def test_01_compute_home_panels_limit(self):
        """Valida que los registros recientes se limiten exactamente a 7"""
        self.home_record._compute_home_panels()

        # Prospectos
        self.assertEqual(len(self.home_record.recent_prospect_ids), 7)
        self.assertEqual(self.home_record.recent_prospect_count, 7)

        # Oportunidades
        self.assertEqual(len(self.home_record.recent_opportunity_ids), 7)
        self.assertEqual(self.home_record.recent_opportunity_count, 7)

        # Marcas
        self.assertEqual(len(self.home_record.recent_brand_ids), 7)
        self.assertEqual(self.home_record.recent_brand_count, 7)

        # Canales
        self.assertEqual(len(self.home_record.recent_channel_ids), 7)
        self.assertEqual(self.home_record.recent_channel_count, 7)

    def test_02_get_home_chart_payload_structure(self):
        """Valida la estructura y coherencia del payload para ECharts"""
        payload = self.home_record.get_home_chart_payload()

        # Verificar claves principales del payload
        self.assertIn('prospects', payload)
        self.assertIn('opportunities', payload)
        self.assertIn('brands', payload)
        self.assertIn('channels', payload)

        # Validar estructura de Prospectos (Serie simple)
        self.assertIn('labels', payload['prospects'])
        self.assertIn('values', payload['prospects'])
        self.assertIn('series_label', payload['prospects'])
        self.assertEqual(payload['prospects']['series_label'], 'Prospectos')

        # Validar estructura de Oportunidades (Serie simple)
        self.assertIn('labels', payload['opportunities'])
        self.assertIn('values', payload['opportunities'])
        self.assertIn('series_label', payload['opportunities'])
        self.assertEqual(payload['opportunities']['series_label'], 'Oportunidades')

        # Validar estructura de Marcas (Multiserie / Series duales)
        self.assertIn('labels', payload['brands'])
        self.assertIn('series', payload['brands'])
        self.assertTrue(len(payload['brands']['series']) >= 2)
        self.assertEqual(payload['brands']['series'][0]['name'], 'Oportunidades')
        self.assertEqual(payload['brands']['series'][1]['name'], 'Cotizaciones')

        # Validar estructura de Canales (Multiserie / Series duales)
        self.assertIn('labels', payload['channels'])
        self.assertIn('series', payload['channels'])
        self.assertTrue(len(payload['channels']['series']) >= 2)
        self.assertEqual(payload['channels']['series'][0]['name'], 'Oportunidades')
        self.assertEqual(payload['channels']['series'][1]['name'], 'Clientes')
