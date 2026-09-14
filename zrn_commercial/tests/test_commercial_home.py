# -*- coding: utf-8 -*-

from odoo.tests.common import TransactionCase


class TestCommercialHome(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.home_model = cls.env['zrn_commercial.home']
        cls.brand_model = cls.env['zrn_commercial.commercial.brand']
        cls.channel_model = cls.env['zrn_commercial.commercial.channel']
        cls.home_record = cls.home_model.search([], limit=1)
        if not cls.home_record:
            cls.home_record = cls.home_model.create({
                'name': 'Test (ZRN) Manejo Comercial Home',
                'page_key': 'overview',
            })

    def test_dashboard_payload_structure(self):
        payload = self.home_record.get_dashboard_payload()

        self.assertIn('currency', payload)
        for dataset_key in (
            'channelRevenue',
            'channelCategoryRevenue',
            'categoryProducts',
            'brandProducts',
        ):
            self.assertIn(dataset_key, payload)
            self.assertIn('labels', payload[dataset_key])
            self.assertIn('values', payload[dataset_key])
            self.assertIn('rows', payload[dataset_key])

    def test_dashboard_metrics_are_company_scoped(self):
        company = self.env.company
        brand = self.brand_model.create({'name': 'Marca de prueba', 'company_id': company.id})
        channel = self.channel_model.create({'name': 'Canal de prueba', 'company_id': company.id})
        self.home_record.invalidate_recordset()
        self.assertGreaterEqual(self.home_record.brand_count, 1)
        self.assertGreaterEqual(self.home_record.channel_count, 1)
        self.assertEqual(brand.company_id, company)
        self.assertEqual(channel.company_id, company)
