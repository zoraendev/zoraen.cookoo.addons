/** @odoo-module **/

import { TagsList } from "@web/core/tags_list/tags_list";
import { SelectMenu } from "@web/core/select_menu/select_menu";
import { registry } from "@web/core/registry";
import { download } from "@web/core/network/download";
import { useService } from "@web/core/utils/hooks";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
import { ExportDataDialog } from "@web/views/view_dialogs/export_data_dialog";
import {
  Component,
  onMounted,
  onPatched,
  onWillStart,
  onWillUnmount,
  useRef,
  useState,
} from "@odoo/owl";

const HUBS = [
  { key: "commercial", label: "Comercial" },
  { key: "financial", label: "Financiero" },
  { key: "operations", label: "Operaciones" },
  { key: "pdv", label: "PDV / Cobertura" },
  { key: "rrhh", label: "RRHH" },
];

const COMMERCIAL_TABS = [
  { key: "overview", label: "Overview", icon: "fa-home" },
  { key: "portafolio", label: "Portafolio", icon: "fa-archive" },
  { key: "cobertura", label: "Cobertura", icon: "fa-crosshairs" },
  { key: "canal", label: "Por Canal", icon: "fa-sitemap" },
  { key: "cliente", label: "Por Cliente / PDV", icon: "fa-users" },
  { key: "rfm", label: "Clientes RFM", icon: "fa-line-chart" },
  { key: "insights", label: "Cliente Insights", icon: "fa-lightbulb-o" },
  { key: "producto", label: "Por Producto", icon: "fa-cube" },
  { key: "tendencias", label: "Tendencias", icon: "fa-area-chart" },
  { key: "gap", label: "Sell-in vs Sell-out", icon: "fa-exchange" },
  { key: "bcg", label: "Matriz BCG", icon: "fa-th-large" },
];

const FINANCIAL_TABS = [
  { key: "overview", label: "Resumen", icon: "fa-line-chart" },
  { key: "producto", label: "Por Producto", icon: "fa-cube" },
  { key: "canal", label: "Por Canal", icon: "fa-sitemap" },
  { key: "marca", label: "Por Marca", icon: "fa-tags" },
  { key: "portafolio", label: "Portafolio", icon: "fa-archive" },
];

const OPERATIONS_TABS = [
  { key: "overview", label: "Resumen", icon: "fa-home" },
  { key: "demanda", label: "Demanda", icon: "fa-industry" },
  { key: "abc", label: "Rotacion & ABC", icon: "fa-signal" },
  { key: "portafolio", label: "Portafolio", icon: "fa-sitemap" },
  { key: "tendencias", label: "Tendencias", icon: "fa-line-chart" },
  { key: "forecast", label: "Forecast", icon: "fa-area-chart" },
  { key: "inventarios", label: "Inventarios", icon: "fa-cubes" },
  { key: "compras", label: "Compras", icon: "fa-shopping-cart" },
];

const PDV_TABS = [
  { key: "overview", label: "Overview", icon: "fa-home" },
  { key: "ranking", label: "Ranking PDVs", icon: "fa-list-ol" },
  { key: "canales", label: "Canales PDV", icon: "fa-exchange" },
  { key: "otros", label: "Otras cadenas", icon: "fa-sitemap" },
  { key: "alertas", label: "Alertas", icon: "fa-bell-o" },
];

const RRHH_TABS = [
  { key: "overview", label: "Resumen", icon: "fa-home" },
  { key: "predictor", label: "Predictor", icon: "fa-balance-scale" },
  { key: "patrones", label: "Patrones Validados", icon: "fa-check-circle-o" },
  { key: "checklist", label: "Checklist Entrevista", icon: "fa-list-ul" },
  { key: "historico", label: "Historico", icon: "fa-table" },
];

function getDefaultDateFrom() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-01`;
}

function getDefaultDateTo() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const DEFAULT_FILTERS = Object.freeze({
  date_from: getDefaultDateFrom(),
  date_to: getDefaultDateTo(),
  business_unit_ids: [],
  channel_ids: [],
  brand_ids: [],
  category_ids: [],
  channel_category_ids: [],
  product_ids: [],
  partner_ids: [],
  search: "",
  order_type: "sale",
  order_status: "confirmed",
  invoiced_only: false,
});

function cloneDefaultFilters() {
  return {
    ...DEFAULT_FILTERS,
    date_from: getDefaultDateFrom(),
    date_to: getDefaultDateTo(),
    business_unit_ids: [],
    channel_ids: [],
    brand_ids: [],
    category_ids: [],
    channel_category_ids: [],
    product_ids: [],
    partner_ids: [],
    order_type: "sale",
    order_status: "confirmed",
    invoiced_only: false,
  };
}

function normalizeCommercialFilterValue(key, value) {
  if ([
    "business_unit_ids",
    "channel_ids",
    "brand_ids",
    "category_ids",
    "channel_category_ids",
    "product_ids",
    "partner_ids",
  ].includes(key)) {
    return normalizeFilterIds(value);
  }
  if (key === "invoiced_only") {
    return Boolean(value);
  }
  return value ?? "";
}

const OPERATIONS_DEFAULT_FILTERS = Object.freeze({
  date_from: getDefaultDateFrom(),
  date_to: getDefaultDateTo(),
  channel_ids: [],
  product_channel_ids: [],
  brand_ids: [],
  abc_class: "",
  rotation_key: "",
  search: "",
});

function cloneOperationsDefaultFilters() {
  return {
    ...OPERATIONS_DEFAULT_FILTERS,
    date_from: getDefaultDateFrom(),
    date_to: getDefaultDateTo(),
    channel_ids: [],
    product_channel_ids: [],
    brand_ids: [],
  };
}

function cloneRrhhPredictorForm() {
  return {
    evaluation_date: "",
    notes: "",
    family_structure: "",
    family_contact: "",
    asset_congruence: "",
    income_gaps: "",
    living_context: "",
    tattoo_visibility: "",
    job_count: "",
    conflict_history: "",
    recent_alcohol: "",
    sleep_condition: "",
    breakfast_condition: "",
  };
}

function cloneRrhhChecklistForm() {
  return {
    interview_date: "",
    observations: "",
    family_parents: false,
    family_legal_issues: false,
    family_living: false,
    finance_assets: false,
    finance_story: false,
    finance_gaps: false,
    work_job_count: false,
    work_exit_reason: false,
    work_tattoos: false,
    exam_rest_food: false,
    exam_alcohol: false,
  };
}

function normalizeFilterIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )];
}

class ZrnRelationalMultiSelect extends Component {
  setup() {
    this.orm = useService("orm");
  }

  get activeActions() {
    return {
      type: "many2many",
      create: false,
      createEdit: false,
      delete: false,
      link: true,
      unlink: true,
      write: false,
    };
  }

  get tags() {
    return (this.props.records || []).map((record) => ({
      id: record.id,
      text: record.display_name,
      onDelete: () => this.removeRecord(record.id),
    }));
  }

  getDomain() {
    const baseDomain = [...(this.props.domain || [])];
    const currentIds = (this.props.records || [])
      .map((record) => record.id)
      .filter((id) => Number.isInteger(id));
    if (currentIds.length) {
      baseDomain.push(["id", "not in", currentIds]);
    }
    return baseDomain;
  }

  async resolveRecords(records) {
    const currentRecords = this.props.records || [];
    const orderedIds = [];
    const labelsById = new Map();

    [...currentRecords, ...(records || [])].forEach((record) => {
      const id = Number(record?.id);
      if (!Number.isInteger(id) || id <= 0 || orderedIds.includes(id)) {
        return;
      }
      orderedIds.push(id);
      const label =
        record.display_name || record.displayName || record.name || "";
      if (label) {
        labelsById.set(id, label);
      }
    });

    const missingIds = orderedIds.filter((id) => !labelsById.has(id));
    if (missingIds.length) {
      const nameRows = await this.orm.call(
        this.props.resModel,
        "name_get",
        [missingIds],
        { context: this.props.context || {} },
      );
      nameRows.forEach(([id, label]) => {
        labelsById.set(id, label || "");
      });
    }

    return orderedIds.map((id) => ({
      id,
      display_name: labelsById.get(id) || String(id),
    }));
  }

  async addRecords(records) {
    if (!records || !records.length) {
      return;
    }
    const nextRecords = await this.resolveRecords(records);
    this.props.onChange(nextRecords);
  }

  removeRecord(recordId) {
    const nextRecords = (this.props.records || []).filter(
      (record) => record.id !== recordId,
    );
    this.props.onChange(nextRecords);
  }
}
ZrnRelationalMultiSelect.template = "zrn_analitics.RelationalMultiSelect";
ZrnRelationalMultiSelect.components = {
  Many2XAutocomplete,
  TagsList,
};
ZrnRelationalMultiSelect.props = {
  records: { type: Array, optional: true },
  domain: { type: Array, optional: true },
  resModel: String,
  fieldString: String,
  placeholder: { type: String, optional: true },
  context: { type: Object, optional: true },
  onChange: Function,
};
ZrnRelationalMultiSelect.defaultProps = {
  records: [],
  domain: [],
  placeholder: "",
  context: {},
};

class ZrnRelationalSingleSelect extends Component {
  setup() {
    this.orm = useService("orm");
  }

  get activeActions() {
    return {};
  }

  getDomain() {
    return [...(this.props.domain || [])];
  }

  async resolveRecord(record) {
    const id = Number(record?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }
    const label =
      record.display_name || record.displayName || record.name || "";
    if (label) {
      return {
        id,
        display_name: label,
      };
    }
    const nameRows = await this.orm.call(
      this.props.resModel,
      "name_get",
      [[id]],
      { context: this.props.context || {} },
    );
    const [, resolvedLabel] = nameRows[0] || [id, String(id)];
    return {
      id,
      display_name: resolvedLabel || String(id),
    };
  }

  async updateRecord(records) {
    const [record] = records || [];
    const nextRecord = await this.resolveRecord(record);
    this.props.onChange(nextRecord);
  }

  clearSelection() {
    this.props.onChange(null);
  }
}
ZrnRelationalSingleSelect.template = "zrn_analitics.RelationalSingleSelect";
ZrnRelationalSingleSelect.components = {
  Many2XAutocomplete,
};
ZrnRelationalSingleSelect.props = {
  record: { type: Object, optional: true },
  domain: { type: Array, optional: true },
  resModel: String,
  fieldString: String,
  placeholder: { type: String, optional: true },
  context: { type: Object, optional: true },
  canClear: { type: Boolean, optional: true },
  onChange: Function,
};
ZrnRelationalSingleSelect.defaultProps = {
  record: null,
  domain: [],
  placeholder: "",
  context: {},
  canClear: true,
};

class ZrnAnalyticsHubAction extends Component {
  setup() {
    this.actionService = useService("action");
    this.dialogService = useService("dialog");
    this.orm = useService("orm");
    this.rpc = useService("rpc");
    this.rootRef = useRef("hubRoot");
    this.hubs = HUBS;
    this.commercialTabs = COMMERCIAL_TABS;
    this.financialTabs = FINANCIAL_TABS;
    this.operationsTabs = OPERATIONS_TABS;
    this.pdvTabs = PDV_TABS;
    this.rrhhTabs = RRHH_TABS;
    this._charts = new Map();
    this._chartRenderTimeouts = [];
    this._chartRenderFrame = 0;
    this._resizeObserver = null;
    this._pendingTextInputFocus = null;
    this._chartResizeHandler = () => {
      this.syncResponsivePanels();
      this.resizeCharts();
    };
    this._rootInputHandler = (ev) => {
      this.capturePendingTextInputFocus(ev.target);
    };
    this.state = useState({
      activeHub: "commercial",
      commercialTab: "overview",
      financialTab: "overview",
      operationsTab: "overview",
      pdvTab: "overview",
      rrhhTab: "overview",
      commercialSidebarOpen: false,
      commercialFiltersOpen: false,
      financialFiltersOpen: false,
      operationsFiltersOpen: false,
      pdvFiltersOpen: false,
      commercialExportMenu: null,
      hubMenuOpen: false,
      overviewRevenueChartType: "line",
      overviewBrandMixChartType: "doughnut",
      overviewCustomersChartType: "bar",
      commercialPanelViews: {
        channel_main: "table",
        coverage_channel: "table",
        coverage_sku: "table",
        product_main: "table",
        client_main: "table",
        trends_growers: "table",
        trends_decliners: "table",
        insights_market_basket: "table",
        insights_ltv: "table",
        financial_products: "table",
        financial_channels: "table",
        financial_brands: "table",
        financial_product_channel: "table",
        financial_portfolio_drill: "table",
        financial_modal_channels: "table",
        financial_modal_secondary: "table",
        operations_top_skus: "table",
        operations_demanda: "table",
        operations_abc: "table",
        operations_trends: "table",
        pdv_ranking: "table",
        financial_overview: "chart",
        financial_brand_overview: "chart",
        financial_channel_overview: "chart",
        operations_overview_monthly: "chart",
        operations_brand_mix: "chart",
        operations_overview_abc: "chart",
        operations_overview_rotation: "chart",
        operations_portfolio_units: "chart",
        operations_trends_summary: "chart",
        operations_forecast: "chart",
        operations_inventory_coverage: "chart",
        operations_inventory_brand_mix: "chart",
        operations_purchase_spend: "chart",
        operations_purchase_suppliers: "chart",
        pdv_overview_revenue: "chart",
        pdv_overview_coverage: "chart",
        pdv_overview_top: "chart",
      },
      analyticsChartConfigOpen: null,
      analyticsChartSettings: {
        financial_products: { metric: "margin", type: "bar" },
        financial_channels: { metric: "margin_pct", type: "bar" },
        financial_brands: { metric: "margin", type: "bar" },
        financial_product_channel: { metric: "margin", type: "bar" },
        financial_portfolio_drill: { metric: "margin", type: "bar" },
        financial_modal_channels: { metric: "revenue", type: "bar" },
        financial_modal_secondary: { metric: "revenue", type: "bar" },
        operations_top_skus: { metric: "units", type: "bar" },
        operations_demanda: { metric: "units_per_month", type: "bar" },
        operations_abc: { metric: "revenue", type: "bar" },
        operations_trends: { metric: "trend_pct", type: "bar" },
        pdv_ranking: { metric: "rev", type: "bar" },
      },
      channelChartConfigOpen: false,
      channelChartMetric: "revenue",
      channelChartType: "bar",
      clientChartConfigOpen: false,
      clientChartMetric: "rev",
      clientChartType: "bar",
      coverageChannelChartType: "bar",
      coverageSkuChartConfigOpen: false,
      coverageSkuChartMetric: "pdv_pct",
      coverageSkuChartType: "bar",
      pdvSidebarOpen: false,
      commercialPayload: null,
      commercialFilterOptions: {},
      commercialLoading: false,
      financialPayload: null,
      financialLoading: false,
      operationsPayload: null,
      operationsLoading: false,
      pdvPayload: null,
      pdvLoading: false,
      rrhhPayload: null,
      rrhhLoading: false,
      coveragePayload: null,
      coverageLoading: false,
      channelPayload: null,
      channelLoading: false,
      pdvFilters: cloneDefaultFilters(),
      financialFilters: cloneDefaultFilters(),
      operationsFilters: cloneOperationsDefaultFilters(),
      selectedPortfolioUnit: "",
      portfolioExpanded: {},
      selectedFinancialUnit: "",
      financialPortfolioExpanded: {},
      operationsPortfolioExpanded: {},
      overviewFilters: cloneDefaultFilters(),
      portfolioFilters: cloneDefaultFilters(),
      coverageFilters: cloneDefaultFilters(),
      channelFilters: cloneDefaultFilters(),
      channelModalRow: null,
      analyticsDetailModal: null,
      analyticsDetailHistory: [],
      sellinChain: "walmart",
      rfmFilterSegment: "",
      rfmFilterAbc: "",
      rfmFilterSearch: "",
      bcgFilter: "all",
      productChartType: "bar",
      productChartMetric: "rev",
      productChartConfigOpen: false,
      rrhhPredictorForm: cloneRrhhPredictorForm(),
      rrhhChecklistForm: cloneRrhhChecklistForm(),
      rrhhPredictorDirty: false,
      rrhhChecklistDirty: false,
      rrhhHistorySearch: "",
      rrhhHistoryRisk: "",
      sorts: {
        top_products: { column: "sales_amount", order: "desc" },
        coverage_by_channel: { column: "revenue", order: "desc" },
        sku_distribution: { column: "revenue", order: "desc" },
        portfolio_holes: { column: "gap_count", order: "desc" },
        clients_at_risk: { column: "days_since_last", order: "desc" },
        financial_products: { column: "margin", order: "desc" },
        financial_channels: { column: "margin", order: "desc" },
        financial_brands: { column: "margin", order: "desc" },
        financial_product_channel: { column: "margin", order: "desc" },
        operations_top_skus: { column: "units", order: "desc" },
        operations_demanda: { column: "units_per_month", order: "desc" },
        operations_abc: { column: "revenue", order: "desc" },
        operations_portfolio: { column: "revenue", order: "desc" },
        operations_trends: { column: "trend_pct", order: "desc" },
        operations_forecast_channels: { column: "total_ytd", order: "desc" },
        operations_inventory_risk: { column: "coverage_days", order: "asc" },
        operations_inventory_overstock: { column: "coverage_days", order: "desc" },
        operations_inventory_rotation: { column: "days_since_last", order: "desc" },
        operations_purchase_suppliers: { column: "spend", order: "desc" },
        operations_purchase_orders: { column: "open_amount", order: "desc" },
        operations_purchase_backlog: { column: "open_amount", order: "desc" },
        operations_purchase_leadtime: { column: "avg_lead_time_days", order: "desc" },
        pdv_ranking: { column: "rev", order: "desc" },
        pdv_chain: { column: "rev", order: "desc" },
        pdv_alerts: { column: "days_since_last", order: "desc" },
        all_clients: { column: "rev", order: "desc" },
        rfm_clients: { column: "rev", order: "desc" },
        market_basket: { column: "lift", order: "desc" },
        cadence: { column: "rev", order: "desc" },
        ltv_forecast: { column: "forecast_total_3m", order: "desc" },
        all_products: { column: "rev", order: "desc" },
        growers: { column: "trend", order: "desc" },
        decliners: { column: "trend", order: "asc" },
        bcg_skus: { column: "r", order: "desc" },
        sellin_pdv: { column: "sellin_q", order: "desc" },
        sellin_sku: { column: "sellin_q", order: "desc" },
        rrhh_historical: { column: "created_at", order: "desc" },
      },
    });
    onWillStart(async () => {
      await Promise.all([
        this.loadCommercialPayload(),
        this.loadCoveragePayload(),
        this.loadPdvPayload(),
      ]);
    });
    onMounted(() => {
      window.addEventListener("resize", this._chartResizeHandler);
      this.syncResponsivePanels();
      if (this.rootElement) {
        this.rootElement.addEventListener("input", this._rootInputHandler, true);
      }
      if (window.ResizeObserver && this.rootElement) {
        this._resizeObserver = new window.ResizeObserver(() =>
          this.resizeCharts(),
        );
        this._resizeObserver.observe(this.rootElement);
      }
      this.queueChartRender();
    });
    onPatched(() => {
      this.restorePendingTextInputFocus();
      this.queueChartRender();
    });
    onWillUnmount(() => {
      window.removeEventListener("resize", this._chartResizeHandler);
      if (this.rootElement) {
        this.rootElement.removeEventListener("input", this._rootInputHandler, true);
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
      if (this._chartRenderFrame) {
        cancelAnimationFrame(this._chartRenderFrame);
      }
      this._chartRenderTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this.disposeCharts();
    });
  }

  toggleSort(tableName, columnName) {
    const sort = this.state.sorts[tableName];
    if (!sort) {
      return;
    }
    if (sort.column === columnName) {
      sort.order = sort.order === "asc" ? "desc" : "asc";
    } else {
      sort.column = columnName;
      sort.order = "desc";
    }
  }

  sortData(list, col, order) {
    const sorted = [...(list || [])];
    sorted.sort((a, b) => {
      let valA = a?.[col];
      let valB = b?.[col];

      if (valA === undefined || valA === null) {
        valA = "";
      }
      if (valB === undefined || valB === null) {
        valB = "";
      }

      if (typeof valA === "string" || typeof valB === "string") {
        const strA = String(valA);
        const strB = String(valB);
        return order === "asc"
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      }
      return order === "asc" ? valA - valB : valB - valA;
    });
    return sorted;
  }

  downloadCsv(filename, columns, rows) {
    const escapeCell = (value) => {
      const text = value === undefined || value === null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [
      columns.map((column) => escapeCell(column.label)).join(","),
      ...(rows || []).map((row) =>
        columns.map((column) => escapeCell(row[column.key])).join(","),
      ),
    ].join("\r\n");
    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportCommercialDataset(datasetKey) {
    this.openNativeCommercialExport(datasetKey);
    return;
    // Kept below as a fallback reference for the computed datasets while the
    // native exporter resolves the model fields and formats.
    const symbol = this.commercialPayload.summary?.currency_symbol || "$";
    if (datasetKey === "overview_summary") {
      const summary = this.commercialPayload.summary || {};
      this.downloadCsv(
        "zrn_comercial_resumen",
        [
          { key: "metric", label: "Metrica" },
          { key: "value", label: "Valor" },
        ],
        [
          { metric: "Venta total", value: `${symbol} ${this.formatMoney(summary.total_amount)}` },
          { metric: "Pedidos", value: this.formatCount(summary.order_count) },
          { metric: "Cuentas", value: this.formatCount(summary.customer_count) },
          { metric: "PDVs", value: this.formatCount(summary.point_count) },
          { metric: "Ticket promedio", value: `${symbol} ${this.formatMoney(summary.average_ticket)}` },
        ],
      );
      return;
    }
    if (datasetKey === "revenue_series") {
      this.downloadCsv(
        "zrn_comercial_venta_por_mes",
        [
          { key: "period", label: "Periodo" },
          { key: "revenue", label: "Venta" },
        ],
        (this.commercialPayload.revenue_series || []).map((row) => ({
          period: row.label,
          revenue: row.value,
        })),
      );
      return;
    }
    if (datasetKey === "brand_mix") {
      this.downloadCsv(
        "zrn_comercial_mix_por_marca",
        [
          { key: "brand", label: "Marca" },
          { key: "revenue", label: "Venta" },
          { key: "percentage", label: "% Mix" },
          { key: "products", label: "Productos" },
        ],
        (this.commercialPayload.brand_mix || []).map((row) => ({
          brand: row.name,
          revenue: row.value,
          percentage: row.percentage,
          products: row.product_count,
        })),
      );
      return;
    }
    if (datasetKey === "top_customers") {
      this.downloadCsv(
        "zrn_comercial_top_clientes",
        [
          { key: "customer", label: "Cliente / PDV" },
          { key: "orders", label: "Pedidos" },
          { key: "revenue", label: "Venta" },
        ],
        (this.commercialPayload.top_customers || []).map((row) => ({
          customer: row.name,
          orders: row.order_count,
          revenue: row.total_amount,
        })),
      );
      return;
    }
    if (datasetKey === "top_products") {
      this.downloadCsv(
        "zrn_comercial_top_productos",
        [
          { key: "product", label: "Producto" },
          { key: "code", label: "Codigo" },
          { key: "category", label: "Categoria" },
          { key: "units", label: "Unidades" },
          { key: "revenue", label: "Venta" },
        ],
        this.sortedTopProducts.map((row) => ({
          product: row.name,
          code: row.default_code,
          category: row.category_name,
          units: row.quantity_sold,
          revenue: row.sales_amount,
        })),
      );
      return;
    }
    if (datasetKey === "portfolio_drill") {
      this.downloadCsv(
        "zrn_comercial_drill_portafolio",
        [
          { key: "level", label: "Nivel" },
          { key: "business_unit", label: "Unidad de negocio" },
          { key: "brand", label: "Marca" },
          { key: "category", label: "Categoria de marca" },
          { key: "sku", label: "SKU" },
          { key: "revenue", label: "Ingreso" },
          { key: "mix", label: "% Mix" },
          { key: "units", label: "Unidades" },
          { key: "skus", label: "SKUs" },
        ],
        (this.commercialPortfolio.drillRows || []).map((row) => ({
          level: row.level_label || row.level,
          business_unit: row.business_unit_name || "",
          brand: row.brand_name || "",
          category: row.category_name || "",
          sku: row.sku_name || "",
          revenue: row.revenue,
          mix: row.mix_percentage,
          units: row.units_sold,
          skus: row.sku_count,
        })),
      );
      return;
    }
    if (datasetKey === "all_products") {
      this.downloadCsv(
        "zrn_comercial_productos",
        [
          { key: "product", label: "Producto" },
          { key: "brand", label: "Marca" },
          { key: "category", label: "Categoria" },
          { key: "revenue", label: "Venta" },
          { key: "units", label: "Unidades" },
          { key: "lines", label: "Lineas" },
          { key: "channels", label: "Canales" },
          { key: "avg_price", label: "Precio real prom." },
        ],
        this.sortedAllProducts.map((row) => ({
          product: row.name,
          brand: row.brand,
          category: row.category,
          revenue: row.rev,
          units: row.units,
          lines: row.n_lines,
          channels: row.channels,
          avg_price: row.avg_unit_price_real,
        })),
      );
      return;
    }
    if (datasetKey === "all_clients") {
      this.downloadCsv(
        "zrn_comercial_clientes_pdv",
        [
          { key: "customer", label: "Cliente / PDV" },
          { key: "channel", label: "Canal" },
          { key: "revenue", label: "Facturado" },
          { key: "units", label: "Unidades" },
          { key: "invoices", label: "Facturas" },
          { key: "first", label: "Primera compra" },
          { key: "last", label: "Ultima compra" },
          { key: "days_since", label: "Dias sin facturar" },
        ],
        this.sortedAllClients.map((row) => ({
          customer: row.name,
          channel: row.channel,
          revenue: row.rev,
          units: row.units,
          invoices: row.invoices,
          first: row.first,
          last: row.last,
          days_since: row.days_since,
        })),
      );
      return;
    }
    if (datasetKey === "channels") {
      this.downloadCsv(
        "zrn_comercial_canales",
        [
          { key: "channel", label: "Canal" },
          { key: "customers", label: "Clientes" },
          { key: "pdvs", label: "PDVs" },
          { key: "orders", label: "Pedidos" },
          { key: "units", label: "Unidades" },
          { key: "revenue", label: "Revenue" },
          { key: "mix", label: "% Mix" },
          { key: "ticket", label: "Ticket" },
          { key: "brands", label: "Marcas" },
          { key: "last_order", label: "Ultima venta" },
        ],
        (this.channelPayload.rows || []).map((row) => ({
          channel: row.channel,
          customers: row.customer_count,
          pdvs: row.point_count,
          orders: row.order_count,
          units: row.units,
          revenue: row.revenue,
          mix: row.mix_pct,
          ticket: row.average_ticket,
          brands: row.brand_count,
          last_order: row.last_order_label,
        })),
      );
      return;
    }
    if (datasetKey === "trends") {
      this.downloadCsv(
        "zrn_comercial_tendencias",
        [
          { key: "type", label: "Tipo" },
          { key: "product", label: "Producto" },
          { key: "historic_pace", label: "Pace historico/dia" },
          { key: "recent_pace", label: "Pace reciente/dia" },
          { key: "trend", label: "Cambio %" },
        ],
        [
          ...this.sortedGrowers.map((row) => ({
            type: "Crecimiento",
            product: row.name,
            historic_pace: row.pace_q1_u,
            recent_pace: row.pace_abr_u,
            trend: row.trend,
          })),
          ...this.sortedDecliners.map((row) => ({
            type: "Caida",
            product: row.name,
            historic_pace: row.pace_q1_u,
            recent_pace: row.pace_abr_u,
            trend: row.trend,
          })),
        ],
      );
      return;
    }
    if (datasetKey === "bcg") {
      this.downloadCsv(
        "zrn_comercial_bcg",
        [
          { key: "product", label: "Producto" },
          { key: "quadrant", label: "Cuadrante" },
          { key: "revenue", label: "Venta" },
          { key: "margin", label: "Margen %" },
        ],
        (this.commercialPayload.bcg_data?.skus || []).map((row) => ({
          product: row.n,
          quadrant: row.q,
          revenue: row.r,
          margin: row.m,
        })),
      );
    }
  }

  async openNativeCommercialExport(datasetKey) {
    if (datasetKey === "portfolio_drill") {
      return this.downloadCommercialPortfolioDrillExcel();
    }
    const config = {
      channels: {
        model: "zrn_commercial.commercial.channel",
        ids: [],
        names: (this.channelPayload.rows || []).map((row) => row.channel),
      },
      all_products: {
        model: "product.product",
        ids: this.sortedAllProducts.map((row) => row.product_id || row.id).filter(Boolean),
      },
      top_products: {
        model: "product.product",
        ids: this.sortedTopProducts.map((row) => row.product_id || row.id).filter(Boolean),
      },
      all_clients: {
        model: "res.partner",
        ids: this.sortedAllClients.map((row) => row.id || row.partner_id).filter(Boolean),
      },
      top_customers: {
        model: "res.partner",
        ids: (this.commercialPayload.top_customers || [])
          .map((row) => row.partner_id)
          .filter(Boolean),
      },
      brand_mix: {
        model: "zrn_commercial.commercial.brand",
        ids: (this.commercialPayload.brand_mix || [])
          .map((row) => row.brand_id || row.id)
          .filter(Boolean),
      },
      bcg: {
        model: "product.product",
        ids: (this.commercialPayload.bcg_data?.skus || [])
          .map((row) => row.product_id || row.id)
          .filter(Boolean),
      },
      revenue_series: { model: "sale.order.line", ids: [] },
      trends: { model: "product.product", ids: [] },
      overview_summary: { model: "sale.order", ids: [] },
    }[datasetKey];
    if (!config) {
      return;
    }
    if (config.names?.length) {
      config.ids = await this.orm.search(config.model, [["name", "in", config.names]]);
    }
    const root = {
      resModel: config.model,
      domain: config.ids.length ? [["id", "in", config.ids]] : [],
      groupBy: [],
      context: {},
      ids: config.ids.length ? config.ids : false,
    };
    return this.openNativeExportDialog(config.model, root.ids, datasetKey, root);
  }

  async downloadCommercialPortfolioDrillExcel() {
    const rows = (this.commercialPortfolio.drillRows || []).map((row) => ({
      level: row.level || "",
      level_label: row.level_label || "",
      label: row.label || "",
      business_unit_name: row.business_unit_name || "",
      brand_name: row.brand_name || "",
      category_name: row.category_name || "",
      sku_name: row.sku_name || "",
      revenue: Number(row.revenue || 0),
      mix_percentage: Number(row.mix_percentage || 0),
      units_sold: Number(row.units_sold || 0),
      billed_lines: Number(row.billed_lines || 0),
      sku_count: Number(row.sku_count || 0),
      margin_amount: Number(row.margin_amount || 0),
      margin_pct: Number(row.margin_pct || 0),
    }));
    if (!rows.length) {
      return;
    }
    await download({
      data: {
        rows: JSON.stringify(rows),
        currency_symbol: this.commercialPortfolio.currencySymbol || "$",
      },
      url: "/zrn_analitics/commercial/portfolio_drill/export_excel",
    });
  }

  exportCommercialVisibleContent(ev, options = {}) {
    if (!options.format) {
      const panel = ev?.currentTarget?.closest?.(".zrn_analitics_hub_panel") || this._commercialExportPanel;
      const filename = options.filename || "zrn_comercial_export";
      const chartKey = options.chartKey;
      const chartEl = chartKey
        ? panel?.querySelector?.(`[data-zrn-chart="${chartKey}"]`)
        : panel?.querySelector?.("[data-zrn-chart]");
      if (chartEl && this.isCommercialNodeVisible(chartEl)) {
        this.downloadChartImage(chartKey || chartEl.dataset.zrnChart, filename);
        return;
      }
      this.openCommercialExportMenu(ev, options);
      return;
    }
    const panel = ev?.currentTarget?.closest?.(".zrn_analitics_hub_panel") || this._commercialExportPanel;
    const filename = options.filename || "zrn_comercial_export";
    const chartKey = options.chartKey;
    const format = options.format || "xlsx";
    const chartEl = chartKey
      ? panel?.querySelector?.(`[data-zrn-chart="${chartKey}"]`)
      : panel?.querySelector?.("[data-zrn-chart]");
    if (chartEl && this.isCommercialNodeVisible(chartEl)) {
      this.downloadChartImage(chartKey || chartEl.dataset.zrnChart, filename);
      return;
    }
    const tables = Array.from(panel?.querySelectorAll?.("table") || []).filter((table) =>
      this.isCommercialNodeVisible(table),
    );
    if (tables.length) {
      const title = options.title || this.getCommercialPanelTitle(panel) || "Exportacion comercial";
      if (format === "xml") {
        this.downloadCommercialTablesXml(filename, title, tables);
      } else if (format === "csv") {
        this.downloadCommercialTablesCsv(filename, title, tables);
      } else if (format === "json") {
        this.downloadCommercialTablesJson(filename, title, tables);
      } else {
        this.downloadCommercialTablesExcel(filename, title, tables);
      }
    }
  }

  openCommercialExportMenu(ev, options = {}) {
    ev?.stopPropagation?.();
    const panel = ev?.currentTarget?.closest?.(".zrn_analitics_hub_panel");
    if (!panel) {
      return;
    }
    const chartKey = options.chartKey;
    const chartEl = chartKey
      ? panel.querySelector(`[data-zrn-chart="${chartKey}"]`)
      : panel.querySelector("[data-zrn-chart]");
    const hasVisibleChart = chartEl && this.isCommercialNodeVisible(chartEl);
    const rect = ev.currentTarget.getBoundingClientRect();
    const menuWidth = 188;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    const top = Math.min(rect.bottom + 4, window.innerHeight - 180);
    this._commercialExportPanel = panel;
    this._commercialExportOptions = { ...options };
    this.state.commercialExportMenu = {
      left,
      top,
      options: hasVisibleChart
        ? [{ key: "png", label: "Imagen PNG", icon: "fa-image" }]
        : [
            { key: "xlsx", label: "Excel (.xls)", icon: "fa-file-excel-o" },
            { key: "xml", label: "XML", icon: "fa-code" },
            { key: "csv", label: "CSV", icon: "fa-file-text-o" },
            { key: "json", label: "JSON", icon: "fa-file-code-o" },
          ],
    };
  }

  closeCommercialExportMenu() {
    this.state.commercialExportMenu = null;
    this._commercialExportPanel = null;
    this._commercialExportOptions = null;
  }

  selectCommercialExportFormat(format) {
    const panel = this._commercialExportPanel;
    const options = this._commercialExportOptions;
    if (!panel || !options) {
      this.closeCommercialExportMenu();
      return;
    }
    this.closeCommercialExportMenu();
    this.exportCommercialVisibleContent({ currentTarget: panel }, { ...options, format });
  }

  isCommercialNodeVisible(node) {
    return Boolean(node && node.offsetParent !== null && node.getClientRects().length);
  }

  getCommercialPanelTitle(panel) {
    return (
      panel?.querySelector?.(".zrn_analitics_commercial_panel_head span")?.textContent?.trim() ||
      panel?.querySelector?.(".zrn_analitics_financial_panel_head span")?.textContent?.trim() ||
      panel?.querySelector?.(".zrn_analitics_operations_panel_head span")?.textContent?.trim() ||
      panel?.querySelector?.(".zrn_analitics_pdv_panel_head span")?.textContent?.trim() ||
      panel?.querySelector?.(".zrn_analitics_hub_panel_title")?.textContent?.trim() ||
      this.commercialTabs.find((tab) => tab.id === this.state.commercialTab)?.label ||
      ""
    );
  }

  downloadCommercialTablesExcel(filename, title, tables) {
    const tableHtml = tables
      .map((table, index) => {
        const clone = table.cloneNode(true);
        clone.querySelectorAll("button, .fa, .o_optional_columns_dropdown").forEach((node) =>
          node.remove(),
        );
        clone.querySelectorAll("[style]").forEach((node) => {
          const style = node.getAttribute("style") || "";
          const keep = style
            .split(";")
            .map((rule) => rule.trim())
            .filter((rule) => /^text-align/i.test(rule) || /^font-weight/i.test(rule))
            .join("; ");
          if (keep) {
            node.setAttribute("style", keep);
          } else {
            node.removeAttribute("style");
          }
        });
        const sectionTitle =
          tables.length > 1
            ? `<div class="zrn_sheet_section">Tabla ${index + 1}</div>`
            : "";
        return `${sectionTitle}${clone.outerHTML}`;
      })
      .join('<div class="zrn_sheet_gap"></div>');
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="Generator" content="Odoo ZRN Analitica" />
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #1f2937; margin: 24px; }
    .zrn_sheet_title { font-size: 20px; font-weight: 700; margin-bottom: 14px; }
    .zrn_sheet_section { font-size: 13px; font-weight: 700; color: #1f4e8c; margin: 12px 0 6px; }
    .zrn_sheet_gap { height: 18px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
    th, td { border: 1px solid #d7d8ea; padding: 8px 10px; vertical-align: middle; }
    thead th { background: #1f4e8c; color: #ffffff; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #f6f8fb; }
    .is-unit td, .zrn_level_unit td { background: #eaf1fb !important; font-weight: 700; }
    .is-brand td, .zrn_level_brand td { background: #f2f6fc !important; font-weight: 600; }
  </style>
</head>
<body>
  <div class="zrn_sheet_title">${this.escapeHtml(title)}</div>
  ${tableHtml || '<div>No hay datos para exportar.</div>'}
</body>
</html>`;
    const blob = new Blob(["\ufeff", html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.sanitizeCommercialFilename(filename)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  extractCommercialTables(tables) {
    return tables.map((table) => {
      const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
        Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent.trim()),
      );
      return {
        columns: rows.shift() || [],
        rows,
      };
    });
  }

  downloadCommercialTablesCsv(filename, title, tables) {
    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [`"${String(title || "").replace(/"/g, '""')}"`];
    this.extractCommercialTables(tables).forEach((table, index) => {
      if (tables.length > 1) {
        lines.push(`"Tabla ${index + 1}"`);
      }
      lines.push(table.columns.map(escapeCell).join(","));
      table.rows.forEach((row) => lines.push(row.map(escapeCell).join(",")));
      lines.push("");
    });
    this.downloadTextFile(filename, `\ufeff${lines.join("\r\n")}`, "text/csv;charset=utf-8;");
  }

  downloadCommercialTablesJson(filename, title, tables) {
    const payload = {
      title: title || "Exportacion comercial",
      tables: this.extractCommercialTables(tables),
    };
    this.downloadTextFile(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8;");
  }

  downloadCommercialTablesXml(filename, title, tables) {
    const escapeXml = (value) => this.escapeHtml(value).replace(/`/g, "&#96;");
    const sheets = this.extractCommercialTables(tables).map((table, index) => `
      <Worksheet ss:Name="Tabla ${index + 1}">
        <Table>
          <Row>${table.columns.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>
          ${table.rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`).join("")}
        </Table>
      </Worksheet>`).join("");
    const xml = `<?xml version="1.0"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${escapeXml(title)}</Title></DocumentProperties>
        ${sheets}
      </Workbook>`;
    this.downloadTextFile(filename, xml, "application/xml;charset=utf-8;");
  }

  downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.sanitizeCommercialFilename(filename)}.${type.includes("json") ? "json" : type.includes("xml") ? "xml" : "csv"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  sanitizeCommercialFilename(filename) {
    return String(filename || "zrn_comercial_export")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  openNativeExportDialog(model, ids, filename, root = {}) {
    const exportRoot = {
      resModel: model,
      domain: ids ? [["id", "in", ids]] : [],
      groupBy: [],
      context: {},
      ids: ids || false,
      ...root,
    };
    this.dialogService.add(ExportDataDialog, {
      context: exportRoot.context,
      defaultExportList: [],
      download: (fields, importCompat, format) =>
        this.downloadOdooExport(exportRoot, fields, importCompat, format),
      getExportedFields: (model, importCompat, parentParams) =>
        this.rpc("/web/export/get_fields", {
          ...parentParams,
          model,
          import_compat: importCompat,
        }),
      root: exportRoot,
    });
  }

  async downloadOdooExport(root, fields, importCompat, format) {
    const exportedFields = fields.map((field) => ({
      name: field.name || field.id,
      label: field.label || field.string,
      store: field.store,
      type: field.field_type || field.type,
    }));
    if (importCompat) {
      exportedFields.unshift({ name: "id", label: "External ID" });
    }
    await download({
      data: {
        data: JSON.stringify({
          import_compat: importCompat,
          context: root.context,
          domain: root.domain,
          fields: exportedFields,
          groupby: root.groupBy,
          ids: root.ids,
          model: root.resModel,
        }),
      },
      url: `/web/export/${format}`,
    });
  }

  exportCommercialPanel(panelKey, datasetKey, chartKey, filename) {
    if (this.getCommercialPanelView(panelKey) === "chart") {
      this.downloadChartImage(chartKey, filename);
      return;
    }
    const chart = document.querySelector(`[data-zrn-chart="${chartKey}"]`);
    const panel = chart?.closest?.(".zrn_analitics_hub_panel");
    const tables = Array.from(panel?.querySelectorAll?.("table") || []).filter((table) =>
      this.isCommercialNodeVisible(table),
    );
    if (tables.length) {
      this.downloadCommercialTablesExcel(
        filename || datasetKey,
        this.getCommercialPanelTitle(panel) || filename || datasetKey,
        tables,
      );
      return;
    }
    this.exportCommercialDataset(datasetKey);
  }

  downloadChartImage(chartKey, filename) {
    const chart = this._charts.get(chartKey) || this.getChart(chartKey);
    if (!chart) {
      return;
    }
    const link = document.createElement("a");
    link.href = chart.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    link.download = `${filename || chartKey}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  get sortedTopProducts() {
    const sort = this.state.sorts.top_products;
    return this.sortData(this.commercialPayload.top_products || [], sort.column, sort.order);
  }

  get sortedCoverageByChannel() {
    const sort = this.state.sorts.coverage_by_channel;
    return this.sortData(this.coveragePayload.coverage_by_channel || [], sort.column, sort.order);
  }

  get sortedSkuDistribution() {
    const sort = this.state.sorts.sku_distribution;
    return this.sortData(this.coveragePayload.sku_distribution || [], sort.column, sort.order);
  }

  get sortedPortfolioHoles() {
    const sort = this.state.sorts.portfolio_holes;
    return this.sortData(
      this.coveragePayload.portfolio_holes?.rows || [],
      sort.column,
      sort.order,
    );
  }

  get sortedClientsAtRisk() {
    const sort = this.state.sorts.clients_at_risk;
    return this.sortData(this.coveragePayload.clients_at_risk || [], sort.column, sort.order);
  }

  isRestorableTextInput(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (element.tagName === "TEXTAREA") {
      return true;
    }
    if (element.tagName !== "INPUT") {
      return false;
    }
    const type = String(element.getAttribute("type") || "text").toLowerCase();
    return [
      "text",
      "search",
      "email",
      "number",
      "url",
      "tel",
      "password",
      "date",
      "datetime-local",
      "time",
      "month",
      "week",
    ].includes(type);
  }

  buildElementPath(element) {
    if (!this.rootElement || !this.rootElement.contains(element)) {
      return null;
    }
    const path = [];
    let current = element;
    while (current && current !== this.rootElement) {
      const parent = current.parentElement;
      if (!parent) {
        return null;
      }
      path.unshift(Array.prototype.indexOf.call(parent.children, current));
      current = parent;
    }
    return current === this.rootElement ? path : null;
  }

  resolveElementPath(path) {
    if (!this.rootElement || !Array.isArray(path)) {
      return null;
    }
    let current = this.rootElement;
    for (const index of path) {
      current = current?.children?.[index] || null;
      if (!current) {
        return null;
      }
    }
    return current;
  }

  capturePendingTextInputFocus(element) {
    if (!this.isRestorableTextInput(element)) {
      this._pendingTextInputFocus = null;
      return;
    }
    const path = this.buildElementPath(element);
    if (!path) {
      return;
    }
    this._pendingTextInputFocus = {
      path,
      tagName: element.tagName,
      type: element.tagName === "INPUT"
        ? String(element.getAttribute("type") || "text").toLowerCase()
        : "",
      selectionStart: typeof element.selectionStart === "number"
        ? element.selectionStart
        : null,
      selectionEnd: typeof element.selectionEnd === "number"
        ? element.selectionEnd
        : null,
    };
  }

  restorePendingTextInputFocus() {
    const pending = this._pendingTextInputFocus;
    if (!pending) {
      return;
    }
    this._pendingTextInputFocus = null;
    if (this.rootElement?.contains(document.activeElement)) {
      return;
    }
    const element = this.resolveElementPath(pending.path);
    if (!this.isRestorableTextInput(element)) {
      return;
    }
    if (element.tagName !== pending.tagName) {
      return;
    }
    if (element.tagName === "INPUT") {
      const type = String(element.getAttribute("type") || "text").toLowerCase();
      if (type !== pending.type) {
        return;
      }
    }
    element.focus({ preventScroll: true });
    if (
      typeof pending.selectionStart === "number" &&
      typeof pending.selectionEnd === "number" &&
      typeof element.setSelectionRange === "function"
    ) {
      element.setSelectionRange(pending.selectionStart, pending.selectionEnd);
    }
  }

  get sortedFinancialProducts() {
    const sort = this.state.sorts.financial_products;
    return this.sortData(this.financialPayload.top_products || [], sort.column, sort.order);
  }

  get sortedFinancialChannels() {
    const sort = this.state.sorts.financial_channels;
    return this.sortData(this.financialPayload.channel_margin_rows || [], sort.column, sort.order);
  }

  get sortedFinancialBrands() {
    const sort = this.state.sorts.financial_brands;
    return this.sortData(this.financialPayload.brand_rows || [], sort.column, sort.order);
  }

  get sortedFinancialProductChannel() {
    const sort = this.state.sorts.financial_product_channel;
    return this.sortData(this.financialPayload.product_channel_matrix || [], sort.column, sort.order);
  }

  get sortedOperationsTopSkus() {
    const sort = this.state.sorts.operations_top_skus;
    return this.sortData(this.operationsPayload.top_skus || [], sort.column, sort.order);
  }

  get sortedOperationsDemanda() {
    const sort = this.state.sorts.operations_demanda;
    return this.sortData(this.operationsPayload.production_suggestions || [], sort.column, sort.order);
  }

  get sortedOperationsAbc() {
    const sort = this.state.sorts.operations_abc;
    return this.sortData(this.operationsPayload.top_skus || [], sort.column, sort.order);
  }

  get sortedOperationsPortfolioRows() {
    return this.operationsPayload.portfolio?.rows || [];
  }

  get sortedOperationsTrends() {
    const sort = this.state.sorts.operations_trends;
    return this.sortData(this.operationsPayload.trend_rows || [], sort.column, sort.order);
  }

  get sortedOperationsForecastChannels() {
    const sort = this.state.sorts.operations_forecast_channels;
    return this.sortData(this.operationsPayload.forecast?.channel_pace || [], sort.column, sort.order);
  }

  get sortedOperationsInventoryRisk() {
    const sort = this.state.sorts.operations_inventory_risk;
    return this.sortData(this.operationsPayload.inventory?.risk_rows || [], sort.column, sort.order);
  }

  get sortedOperationsInventoryOverstock() {
    const sort = this.state.sorts.operations_inventory_overstock;
    return this.sortData(this.operationsPayload.inventory?.overstock_rows || [], sort.column, sort.order);
  }

  get sortedOperationsInventoryRotation() {
    const sort = this.state.sorts.operations_inventory_rotation;
    return this.sortData(this.operationsPayload.inventory?.rotation_rows || [], sort.column, sort.order);
  }

  get sortedOperationsPurchaseSuppliers() {
    const sort = this.state.sorts.operations_purchase_suppliers;
    return this.sortData(this.operationsPayload.purchases?.supplier_rows || [], sort.column, sort.order);
  }

  get sortedOperationsPurchaseOrders() {
    const sort = this.state.sorts.operations_purchase_orders;
    return this.sortData(this.operationsPayload.purchases?.open_orders || [], sort.column, sort.order);
  }

  get sortedOperationsPurchaseBacklog() {
    const sort = this.state.sorts.operations_purchase_backlog;
    return this.sortData(this.operationsPayload.purchases?.backlog_rows || [], sort.column, sort.order);
  }

  get sortedOperationsPurchaseLeadtime() {
    const sort = this.state.sorts.operations_purchase_leadtime;
    return this.sortData(this.operationsPayload.purchases?.leadtime_rows || [], sort.column, sort.order);
  }

  get sortedAllClients() {
    const sort = this.state.sorts.all_clients;
    return this.sortData(this.commercialPayload?.all_clients || [], sort.column, sort.order);
  }

  get sortedRfmClients() {
    const sort = this.state.sorts.rfm_clients;
    let list = this.commercialPayload?.clients_rfm?.clients || [];
    if (this.state.rfmFilterSegment) {
      list = list.filter((c) => c.segment_key === this.state.rfmFilterSegment);
    }
    if (this.state.rfmFilterAbc) {
      list = list.filter((c) => c.abc === this.state.rfmFilterAbc);
    }
    if (this.state.rfmFilterSearch) {
      const q = this.state.rfmFilterSearch.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return this.sortData(list, sort.column, sort.order);
  }

  get sortedMarketBasket() {
    const sort = this.state.sorts.market_basket;
    return this.sortData(this.commercialPayload?.market_basket?.pairs || [], sort.column, sort.order);
  }

  get sortedCadence() {
    const sort = this.state.sorts.cadence;
    return this.sortData(this.commercialPayload?.cadence?.clients || [], sort.column, sort.order);
  }

  get sortedLtvForecast() {
    const sort = this.state.sorts.ltv_forecast;
    return this.sortData(this.commercialPayload?.ltv_forecast?.clients || [], sort.column, sort.order);
  }

  get sortedAllProducts() {
    const sort = this.state.sorts.all_products;
    return this.sortData(this.commercialPayload?.all_products || [], sort.column, sort.order);
  }

  get sortedGrowers() {
    const sort = this.state.sorts.growers;
    return this.sortData(this.commercialPayload?.growers || [], sort.column, sort.order);
  }

  get sortedDecliners() {
    const sort = this.state.sorts.decliners;
    return this.sortData(this.commercialPayload?.decliners || [], sort.column, sort.order);
  }

  get sortedBcgSkus() {
    const sort = this.state.sorts.bcg_skus;
    let list = this.commercialPayload?.bcg_data?.skus || [];
    if (this.state.bcgFilter && this.state.bcgFilter !== "all") {
      list = list.filter((s) => s.q === this.state.bcgFilter);
    }
    return this.sortData(list, sort.column, sort.order);
  }

  get sortedSellinPdv() {
    const sort = this.state.sorts.sellin_pdv;
    const chain = this.state.sellinChain || "walmart";
    const data = this.commercialPayload?.sellin_vs_sellout?.[chain] || {};
    return this.sortData(data.by_pdv || [], sort.column, sort.order);
  }

  get sortedSellinSku() {
    const sort = this.state.sorts.sellin_sku;
    const chain = this.state.sellinChain || "walmart";
    const data = this.commercialPayload?.sellin_vs_sellout?.[chain] || {};
    return this.sortData(data.by_sku || [], sort.column, sort.order);
  }

  get sortedPdvRanking() {
    const sort = this.state.sorts.pdv_ranking;
    return this.sortData(this.pdvPayload.ranking_rows || [], sort.column, sort.order);
  }

  get sortedPdvChannelRows() {
    const sort = this.state.sorts.pdv_chain;
    return this.sortData(this.pdvPayload.channel_compare?.rows || [], sort.column, sort.order);
  }

  get sortedPdvOtrosRows() {
    const sort = this.state.sorts.pdv_chain;
    return this.sortData(this.pdvPayload.otros?.rows || [], sort.column, sort.order);
  }

  get sortedPdvAlerts() {
    const sort = this.state.sorts.pdv_alerts;
    return this.sortData(this.pdvPayload.alerts?.rows || [], sort.column, sort.order);
  }

  get sortedRrhhHistorical() {
    const sort = this.state.sorts.rrhh_historical;
    let list = this.sortData(this.rrhhPayload.historical_rows || [], sort.column, sort.order);
    if (this.state.rrhhHistoryRisk) {
      list = list.filter((row) => row.predictor_risk_level === this.state.rrhhHistoryRisk);
    }
    if (this.state.rrhhHistorySearch) {
      const query = this.state.rrhhHistorySearch.toLowerCase();
      list = list.filter((row) =>
        [row.name, row.job_name, row.stage_name, row.pattern_labels]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      );
    }
    return list;
  }

  async setActiveHub(hubKey) {
    this.state.activeHub = hubKey;
    this.state.hubMenuOpen = false;
    this.state.channelModalRow = null;
    this.closeCommercialFilters();
    this.closeFinancialFilters();
    this.closeOperationsFilters();
    this.closePdvFilters();
    this.clearAnalyticsDetailModals();
    if (hubKey === "pdv") {
      await this.loadPdvPayload();
      this.queueChartRender();
      return;
    }
    if (hubKey === "financial") {
      await this.loadFinancialPayload();
      this.queueChartRender();
      return;
    }
    if (hubKey === "operations") {
      await this.loadOperationsPayload();
      this.syncOperationsStateFromPayload();
      this.queueChartRender();
      return;
    }
    if (hubKey === "rrhh") {
      await this.loadRrhhPayload();
      this.queueChartRender();
      return;
    }
    if (hubKey !== "commercial") {
      return;
    }
    await Promise.all([
      this.loadCommercialPayload(),
      this.loadCoveragePayload(),
    ]);
    if (this.state.commercialTab === "canal") {
      await this.loadChannelPayload();
    }
    this.queueChartRender();
  }

  async setCommercialTab(tabKey) {
    if (!this.hasCommercialBrands && tabKey !== "overview") {
      tabKey = "overview";
    }
    this.state.commercialTab = tabKey;
    this.closeCommercialSidebar();
    this.closeCommercialFilters();
    this.state.channelModalRow = null;
    this.clearAnalyticsDetailModals();
    if (tabKey === "cobertura") {
      await this.loadCoveragePayload();
    } else if (tabKey === "canal") {
      await this.loadChannelPayload();
    } else {
      await this.loadCommercialPayload();
      this.state.commercialFilterOptions = this.commercialPayload?.filter_options || {};
    }
    this.queueChartRender();
  }

  async setFinancialTab(tabKey) {
    this.state.financialTab = tabKey;
    this.closeCommercialSidebar();
    this.closeFinancialFilters();
    this.clearAnalyticsDetailModals();
    await this.loadFinancialPayload();
    this.queueChartRender();
  }

  async setOperationsTab(tabKey) {
    if (!this.operationsTabs.some((tab) => tab.key === tabKey)) {
      tabKey = this.operationsTabs[0]?.key || "overview";
    }
    this.state.operationsTab = tabKey;
    this.closeCommercialSidebar();
    this.closeOperationsFilters();
    this.clearAnalyticsDetailModals();
    await this.loadOperationsPayload();
    this.queueChartRender();
  }

  async setPdvTab(tabKey) {
    this.state.pdvTab = tabKey;
    this.closePdvSidebar();
    this.closePdvFilters();
    this.clearAnalyticsDetailModals();
    await this.loadPdvPayload();
    this.queueChartRender();
  }

  async setRrhhTab(tabKey) {
    if (tabKey !== "overview" && !this.hasRrhhApplicant) {
      this.state.rrhhTab = "overview";
      return;
    }
    this.state.rrhhTab = tabKey;
    this.closeCommercialSidebar();
    this.clearAnalyticsDetailModals();
    await this.loadRrhhPayload();
    this.queueChartRender();
  }

  syncResponsivePanels() {
    if (window.innerWidth > 1200 && this.state.commercialSidebarOpen) {
      this.state.commercialSidebarOpen = false;
    }
    if (window.innerWidth > 1200 && this.state.pdvSidebarOpen) {
      this.state.pdvSidebarOpen = false;
    }
  }

  toggleCommercialSidebar() {
    this.state.commercialSidebarOpen = !this.state.commercialSidebarOpen;
  }

  closeCommercialSidebar() {
    this.state.commercialSidebarOpen = false;
  }

  toggleCommercialFilters() {
    this.state.commercialFiltersOpen = !this.state.commercialFiltersOpen;
  }

  closeCommercialFilters() {
    this.state.commercialFiltersOpen = false;
  }

  toggleFinancialFilters() {
    this.state.financialFiltersOpen = !this.state.financialFiltersOpen;
  }

  closeFinancialFilters() {
    this.state.financialFiltersOpen = false;
  }

  toggleOperationsFilters() {
    this.state.operationsFiltersOpen = !this.state.operationsFiltersOpen;
  }

  closeOperationsFilters() {
    this.state.operationsFiltersOpen = false;
  }

  togglePdvFilters() {
    this.state.pdvFiltersOpen = !this.state.pdvFiltersOpen;
  }

  closePdvFilters() {
    this.state.pdvFiltersOpen = false;
  }

  async refreshCommercialFilterOptions() {
    const options = await this.orm.call(
      "zrn_analitics.home",
      "get_commercial_filter_options",
      [this.activeCommercialFilters, this.state.commercialTab],
    );
    this.state.commercialFilterOptions = options || {};
  }

  toggleHubMenu() {
    this.state.hubMenuOpen = !this.state.hubMenuOpen;
  }

  closeHubMenu() {
    this.state.hubMenuOpen = false;
  }

  toggleOverviewChart(chartKey) {
    if (chartKey === "revenue") {
      this.state.overviewRevenueChartType =
        this.state.overviewRevenueChartType === "line" ? "bar" : "line";
    } else if (chartKey === "brandMix") {
      this.state.overviewBrandMixChartType =
        this.state.overviewBrandMixChartType === "doughnut" ? "pie" : "doughnut";
    } else if (chartKey === "customers") {
      this.state.overviewCustomersChartType =
        this.state.overviewCustomersChartType === "bar" ? "line" : "bar";
    }
    this.queueChartRender();
  }

  getCommercialPanelView(panelKey) {
    return this.state.commercialPanelViews?.[panelKey] || "table";
  }

  setCommercialPanelView(panelKey, viewMode) {
    this.state.commercialPanelViews = {
      ...(this.state.commercialPanelViews || {}),
      [panelKey]: viewMode,
    };
    this.queueChartRender();
  }

  toggleAnalyticsChartConfig(panelKey) {
    this.state.analyticsChartConfigOpen =
      this.state.analyticsChartConfigOpen === panelKey ? null : panelKey;
  }

  closeAnalyticsChartConfig() {
    this.state.analyticsChartConfigOpen = null;
  }

  getAnalyticsChartSetting(panelKey) {
    const options = this.getAnalyticsChartMetricOptions(panelKey);
    const fallbackMetric = options[0]?.key || "value";
    return {
      metric: fallbackMetric,
      type: "bar",
      ...(this.state.analyticsChartSettings?.[panelKey] || {}),
    };
  }

  setAnalyticsChartMetric(panelKey, ev) {
    this.state.analyticsChartSettings = {
      ...(this.state.analyticsChartSettings || {}),
      [panelKey]: {
        ...this.getAnalyticsChartSetting(panelKey),
        metric: ev.target.value,
      },
    };
    this.queueChartRender();
  }

  setAnalyticsChartType(panelKey, type) {
    this.state.analyticsChartSettings = {
      ...(this.state.analyticsChartSettings || {}),
      [panelKey]: {
        ...this.getAnalyticsChartSetting(panelKey),
        type: type || "bar",
      },
    };
    this.queueChartRender();
  }

  toggleChannelChartConfig() {
    this.state.channelChartConfigOpen = !this.state.channelChartConfigOpen;
  }

  closeChannelChartConfig() {
    this.state.channelChartConfigOpen = false;
  }

  setChannelChartMetric(ev) {
    this.state.channelChartMetric = ev.target.value || "revenue";
    this.queueChartRender();
  }

  setChannelChartType(chartType) {
    this.state.channelChartType = chartType || "bar";
    this.queueChartRender();
  }

  toggleClientChartConfig() {
    this.state.clientChartConfigOpen = !this.state.clientChartConfigOpen;
  }

  closeClientChartConfig() {
    this.state.clientChartConfigOpen = false;
  }

  setClientChartMetric(ev) {
    this.state.clientChartMetric = ev.target.value || "rev";
    this.queueChartRender();
  }

  setClientChartType(chartType) {
    this.state.clientChartType = chartType || "bar";
    this.queueChartRender();
  }

  setCoverageChannelChartType(chartType) {
    this.state.coverageChannelChartType = chartType || "bar";
    this.queueChartRender();
  }

  toggleCoverageSkuChartConfig() {
    this.state.coverageSkuChartConfigOpen = !this.state.coverageSkuChartConfigOpen;
  }

  closeCoverageSkuChartConfig() {
    this.state.coverageSkuChartConfigOpen = false;
  }

  setCoverageSkuChartMetric(ev) {
    this.state.coverageSkuChartMetric = ev.target.value || "pdv_pct";
    this.queueChartRender();
  }

  setCoverageSkuChartType(chartType) {
    this.state.coverageSkuChartType = chartType || "bar";
    this.queueChartRender();
  }

  toggleProductChartConfig() {
    this.state.productChartConfigOpen = !this.state.productChartConfigOpen;
  }

  closeProductChartConfig() {
    this.state.productChartConfigOpen = false;
  }

  setProductChartMetric(ev) {
    this.state.productChartMetric = ev.target.value || "rev";
    this.queueChartRender();
  }

  togglePdvSidebar() {
    this.state.pdvSidebarOpen = !this.state.pdvSidebarOpen;
  }

  closePdvSidebar() {
    this.state.pdvSidebarOpen = false;
  }

  async loadCommercialPayload(force = false) {
    if (this.state.commercialPayload && !force) {
      return;
    }
    this.state.commercialLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_commercial_hub_payload",
        [this.getCurrentCommercialFilters()],
      );
      const normalizedPayload = this.normalizeCommercialPayload(payload);
      this.state.commercialPayload = normalizedPayload;
      if (
        !normalizedPayload.has_brands &&
        Number(normalizedPayload.summary?.brand_count || 0) <= 0
      ) {
        this.state.commercialTab = "overview";
      }
      this.syncCommercialFiltersFromPayload(normalizedPayload);
      this.syncPortfolioStateFromPayload();
    } finally {
      this.state.commercialLoading = false;
    }
  }

  async loadFinancialPayload(force = false) {
    if (this.state.financialPayload && !force) {
      return;
    }
    this.state.financialLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_financial_hub_payload",
        [this.state.financialFilters],
      );
      this.state.financialPayload = payload;
      this.syncFinancialFiltersFromPayload(payload);
      this.syncFinancialStateFromPayload();
    } finally {
      this.state.financialLoading = false;
    }
  }

  async loadOperationsPayload(force = false) {
    if (this.state.operationsPayload && !force) {
      return;
    }
    this.state.operationsLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_operations_hub_payload",
        [this.state.operationsFilters],
      );
      this.state.operationsPayload = payload;
      this.syncOperationsFiltersFromPayload(payload);
      this.syncOperationsStateFromPayload();
    } finally {
      this.state.operationsLoading = false;
    }
  }

  async loadPdvPayload(force = false) {
    if (this.state.pdvPayload && !force) {
      return;
    }
    this.state.pdvLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_pdv_hub_payload",
        [this.state.pdvFilters],
      );
      this.state.pdvPayload = payload;
      this.syncPdvFiltersFromPayload(payload);
    } finally {
      this.state.pdvLoading = false;
    }
  }

  async loadRrhhPayload(force = false, filters = null) {
    if (this.state.rrhhPayload && !force && !filters) {
      return;
    }
    this.state.rrhhLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_rrhh_hub_payload",
        [filters || this.state.rrhhPayload?.active_filters || {}],
      );
      this.state.rrhhPayload = payload;
      this.syncRrhhFormsFromPayload(payload);
      if (!payload?.current_applicant && this.state.rrhhTab !== "overview") {
        this.state.rrhhTab = "overview";
      }
    } finally {
      this.state.rrhhLoading = false;
    }
  }

  async loadCoveragePayload(force = false) {
    if (this.state.coveragePayload && !force) {
      return;
    }
    this.state.coverageLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_coverage_dashboard_data",
        [this.state.coverageFilters],
      );
      this.state.coveragePayload = payload;
      this.syncCoverageFiltersFromPayload(payload);
    } finally {
      this.state.coverageLoading = false;
    }
  }

  async loadChannelPayload(force = false) {
    if (this.state.channelPayload && !force) {
      return;
    }
    this.state.channelLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "get_channel_dashboard_data",
        [this.state.channelFilters],
      );
      this.state.channelPayload = payload;
      this.syncChannelFiltersFromPayload(payload);
    } finally {
      this.state.channelLoading = false;
    }
  }

  getCurrentCommercialFilters() {
    if (this.state.commercialTab === "portafolio") {
      return this.state.portfolioFilters;
    }
    return this.state.overviewFilters;
  }

  syncCommercialFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    const nextFilters = {
      date_from: activeFilters.date_from || DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || DEFAULT_FILTERS.date_to,
      business_unit_ids: normalizeFilterIds(activeFilters.business_unit_ids),
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      category_ids: normalizeFilterIds(activeFilters.category_ids),
      channel_category_ids: normalizeFilterIds(activeFilters.channel_category_ids),
      product_ids: normalizeFilterIds(activeFilters.product_ids),
      partner_ids: normalizeFilterIds(activeFilters.partner_ids),
      search: activeFilters.search || "",
      order_type: activeFilters.order_type || DEFAULT_FILTERS.order_type,
      order_status: activeFilters.order_status || DEFAULT_FILTERS.order_status,
      invoiced_only: Boolean(activeFilters.invoiced_only),
    };
    this.state.overviewFilters = { ...nextFilters };
    this.state.portfolioFilters = { ...nextFilters };
    this.state.commercialFilterOptions = payload?.filter_options || {};
  }

  syncCoverageFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    this.state.coverageFilters = {
      date_from: activeFilters.date_from || DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || DEFAULT_FILTERS.date_to,
      business_unit_ids: normalizeFilterIds(activeFilters.business_unit_ids),
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      category_ids: normalizeFilterIds(activeFilters.category_ids),
      channel_category_ids: normalizeFilterIds(activeFilters.channel_category_ids),
      product_ids: normalizeFilterIds(activeFilters.product_ids),
      partner_ids: normalizeFilterIds(activeFilters.partner_ids),
      search: activeFilters.search || "",
      order_type: activeFilters.order_type || DEFAULT_FILTERS.order_type,
      order_status: activeFilters.order_status || DEFAULT_FILTERS.order_status,
      invoiced_only: Boolean(activeFilters.invoiced_only),
    };
  }

  syncChannelFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    this.state.channelFilters = {
      date_from: activeFilters.date_from || DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || DEFAULT_FILTERS.date_to,
      business_unit_ids: normalizeFilterIds(activeFilters.business_unit_ids),
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      category_ids: normalizeFilterIds(activeFilters.category_ids),
      channel_category_ids: normalizeFilterIds(activeFilters.channel_category_ids),
      product_ids: normalizeFilterIds(activeFilters.product_ids),
      partner_ids: normalizeFilterIds(activeFilters.partner_ids),
      search: activeFilters.search || "",
      order_type: activeFilters.order_type || DEFAULT_FILTERS.order_type,
      order_status: activeFilters.order_status || DEFAULT_FILTERS.order_status,
      invoiced_only: Boolean(activeFilters.invoiced_only),
    };
  }

  syncFinancialFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    this.state.financialFilters = {
      date_from: activeFilters.date_from || DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || DEFAULT_FILTERS.date_to,
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      category_ids: normalizeFilterIds(activeFilters.category_ids),
      search: activeFilters.search || "",
    };
  }

  syncOperationsFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    this.state.operationsFilters = {
      date_from: activeFilters.date_from || OPERATIONS_DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || OPERATIONS_DEFAULT_FILTERS.date_to,
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      product_channel_ids: normalizeFilterIds(activeFilters.product_channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      abc_class: activeFilters.abc_class || "",
      rotation_key: activeFilters.rotation_key || "",
      search: activeFilters.search || "",
    };
  }

  syncPdvFiltersFromPayload(payload) {
    const activeFilters = payload?.active_filters || {};
    this.state.pdvFilters = {
      date_from: activeFilters.date_from || DEFAULT_FILTERS.date_from,
      date_to: activeFilters.date_to || DEFAULT_FILTERS.date_to,
      channel_ids: normalizeFilterIds(activeFilters.channel_ids),
      brand_ids: normalizeFilterIds(activeFilters.brand_ids),
      category_ids: normalizeFilterIds(activeFilters.category_ids),
      search: activeFilters.search || "",
    };
  }

  syncRrhhFormsFromPayload(payload, options = {}) {
    const {
      resetPredictor = true,
      resetChecklist = true,
    } = options;
    const predictor = payload?.current_predictor;
    const checklist = payload?.current_checklist;
    if (resetPredictor) {
      this.state.rrhhPredictorForm = {
        ...cloneRrhhPredictorForm(),
        evaluation_date: predictor?.evaluation_date || "",
        notes: predictor?.notes || "",
        ...(predictor?.answers || {}),
      };
      this.state.rrhhPredictorDirty = false;
    }
    if (resetChecklist) {
      this.state.rrhhChecklistForm = {
        ...cloneRrhhChecklistForm(),
        interview_date: checklist?.interview_date || "",
        observations: checklist?.observations || "",
        ...(checklist?.answers || {}),
      };
      this.state.rrhhChecklistDirty = false;
    }
  }

  syncPortfolioStateFromPayload() {
    const units = this.commercialPortfolio.units || [];
    const defaultUnit = units[0]?.key || "";
    this.state.selectedPortfolioUnit =
      units.find((unit) => unit.key === this.state.selectedPortfolioUnit)?.key ||
      defaultUnit;
    if (defaultUnit && this.state.portfolioExpanded[defaultUnit] === undefined) {
      this.state.portfolioExpanded = {
        ...this.state.portfolioExpanded,
        [defaultUnit]: true,
      };
    }
  }

  syncFinancialStateFromPayload() {
    const units = this.financialPortfolio.units || [];
    const defaultUnit = units[0]?.key || "";
    this.state.selectedFinancialUnit =
      units.find((unit) => unit.key === this.state.selectedFinancialUnit)?.key ||
      defaultUnit;
    if (
      defaultUnit &&
      this.state.financialPortfolioExpanded[defaultUnit] === undefined
    ) {
      this.state.financialPortfolioExpanded = {
        ...this.state.financialPortfolioExpanded,
        [defaultUnit]: true,
      };
    }
  }

  syncOperationsStateFromPayload() {
    const units = this.operationsPayload.portfolio?.units || [];
    const defaultUnit = units[0]?.key || "";
    if (
      defaultUnit &&
      this.state.operationsPortfolioExpanded[defaultUnit] === undefined
    ) {
      this.state.operationsPortfolioExpanded = {
        ...this.state.operationsPortfolioExpanded,
        [defaultUnit]: true,
      };
    }
  }

  updateOverviewFilter(key, value) {
    this.state.overviewFilters = {
      ...this.state.overviewFilters,
      [key]: normalizeCommercialFilterValue(key, value),
    };
  }

  updatePortfolioFilter(key, value) {
    this.state.portfolioFilters = {
      ...this.state.portfolioFilters,
      [key]: normalizeCommercialFilterValue(key, value),
    };
  }

  updateCoverageFilter(key, value) {
    this.state.coverageFilters = {
      ...this.state.coverageFilters,
      [key]: normalizeCommercialFilterValue(key, value),
    };
  }

  updateChannelFilter(key, value) {
    this.state.channelFilters = {
      ...this.state.channelFilters,
      [key]: normalizeCommercialFilterValue(key, value),
    };
  }

  updateCommercialFilter(key, value) {
    if (this.state.commercialTab === "portafolio") {
      this.updatePortfolioFilter(key, value);
      return;
    }
    if (this.state.commercialTab === "cobertura") {
      this.updateCoverageFilter(key, value);
      return;
    }
    if (this.state.commercialTab === "canal") {
      this.updateChannelFilter(key, value);
      return;
    }
    this.updateOverviewFilter(key, value);
  }

  updateFinancialFilter(key, value) {
    this.state.financialFilters = {
      ...this.state.financialFilters,
      [key]:
        key === "channel_ids" || key === "brand_ids" || key === "category_ids"
          ? normalizeFilterIds(value)
          : value ?? "",
    };
  }

  updateOperationsFilter(key, value) {
    this.state.operationsFilters = {
      ...this.state.operationsFilters,
      [key]:
        key === "channel_ids" || key === "product_channel_ids" || key === "brand_ids"
          ? normalizeFilterIds(value)
          : value ?? "",
    };
  }

  updatePdvFilter(key, value) {
    this.state.pdvFilters = {
      ...this.state.pdvFilters,
      [key]:
        key === "channel_ids" || key === "brand_ids" || key === "category_ids"
          ? normalizeFilterIds(value)
          : value ?? "",
    };
  }

  onOverviewDateFromInput(ev) {
    this.updateOverviewFilter("date_from", ev.target.value);
  }

  onOverviewDateToInput(ev) {
    this.updateOverviewFilter("date_to", ev.target.value);
  }

  onOverviewBrandsChange(records) {
    this.updateOverviewFilter("brand_ids", records.map((r) => r.id));
  }

  onOverviewCategoriesChange(records) {
    this.updateOverviewFilter("category_ids", records.map((r) => r.id));
  }

  onOverviewChannelsChange(records) {
    this.updateOverviewFilter("channel_ids", records.map((r) => r.id));
  }

  onPortfolioDateFromInput(ev) {
    this.updatePortfolioFilter("date_from", ev.target.value);
  }

  onPortfolioDateToInput(ev) {
    this.updatePortfolioFilter("date_to", ev.target.value);
  }

  onPortfolioBrandsChange(records) {
    this.updatePortfolioFilter("brand_ids", records.map((r) => r.id));
  }

  onPortfolioCategoriesChange(records) {
    this.updatePortfolioFilter("category_ids", records.map((r) => r.id));
  }

  onPortfolioChannelsChange(records) {
    this.updatePortfolioFilter("channel_ids", records.map((r) => r.id));
  }

  onCoverageDateFromInput(ev) {
    this.updateCoverageFilter("date_from", ev.target.value);
  }

  onCoverageDateToInput(ev) {
    this.updateCoverageFilter("date_to", ev.target.value);
  }

  onCoverageChannelsChange(records) {
    this.updateCoverageFilter("channel_ids", records.map((r) => r.id));
  }

  onCoverageBrandsChange(records) {
    this.updateCoverageFilter("brand_ids", records.map((r) => r.id));
  }

  onCoverageCategoriesChange(records) {
    this.updateCoverageFilter("category_ids", records.map((r) => r.id));
  }

  onChannelDateFromInput(ev) {
    this.updateChannelFilter("date_from", ev.target.value);
  }

  onChannelDateToInput(ev) {
    this.updateChannelFilter("date_to", ev.target.value);
  }

  onChannelChannelsChange(records) {
    this.updateChannelFilter("channel_ids", records.map((r) => r.id));
  }

  onChannelBrandsChange(records) {
    this.updateChannelFilter("brand_ids", records.map((r) => r.id));
  }

  onChannelCategoriesChange(records) {
    this.updateChannelFilter("category_ids", records.map((r) => r.id));
  }

  onFinancialDateFromInput(ev) {
    this.updateFinancialFilter("date_from", ev.target.value);
  }

  onFinancialDateToInput(ev) {
    this.updateFinancialFilter("date_to", ev.target.value);
  }

  onFinancialChannelsChange(records) {
    this.updateFinancialFilter("channel_ids", records.map((r) => r.id));
  }

  onFinancialBrandsChange(records) {
    this.updateFinancialFilter("brand_ids", records.map((r) => r.id));
  }

  onFinancialCategoriesChange(records) {
    this.updateFinancialFilter("category_ids", records.map((r) => r.id));
  }

  onOperationsDateFromInput(ev) {
    this.updateOperationsFilter("date_from", ev.target.value);
  }

  onOperationsDateToInput(ev) {
    this.updateOperationsFilter("date_to", ev.target.value);
  }

  onOperationsChannelsChange(records) {
    this.updateOperationsFilter("channel_ids", records.map((r) => r.id));
  }

  onOperationsProductChannelsChange(records) {
    this.updateOperationsFilter("product_channel_ids", records.map((r) => r.id));
  }

  onOperationsBrandsChange(records) {
    this.updateOperationsFilter("brand_ids", records.map((r) => r.id));
  }

  onOperationsAbcSelect(value) {
    this.updateOperationsFilter("abc_class", value);
  }

  onOperationsRotationSelect(value) {
    this.updateOperationsFilter("rotation_key", value);
  }

  onPdvDateFromInput(ev) {
    this.updatePdvFilter("date_from", ev.target.value);
  }

  onPdvDateToInput(ev) {
    this.updatePdvFilter("date_to", ev.target.value);
  }

  onPdvChannelsChange(records) {
    this.updatePdvFilter("channel_ids", records.map((r) => r.id));
  }

  onPdvBrandsChange(records) {
    this.updatePdvFilter("brand_ids", records.map((r) => r.id));
  }

  onPdvCategoriesChange(records) {
    this.updatePdvFilter("category_ids", records.map((r) => r.id));
  }

  onCommercialDateFromInput(ev) {
    this.updateCommercialFilter("date_from", ev.target.value);
  }

  onCommercialDateToInput(ev) {
    this.updateCommercialFilter("date_to", ev.target.value);
  }

  onCommercialOrderTypeChange(ev) {
    this.updateCommercialFilter("order_type", ev.target.value);
    this.updateCommercialFilter("order_status", "confirmed");
    if (ev.target.value === "purchase") {
      this.updateCommercialFilter("invoiced_only", false);
    }
  }

  onCommercialBrandsChange(records) {
    this.updateCommercialFilter("brand_ids", records.map((r) => r.id));
    this.updateCommercialFilter("category_ids", []);
    this.updateCommercialFilter("product_ids", []);
    return this.refreshCommercialFilterOptions();
  }

  onCommercialCategoriesChange(records) {
    this.updateCommercialFilter("category_ids", records.map((r) => r.id));
    this.updateCommercialFilter("product_ids", []);
    return this.refreshCommercialFilterOptions();
  }

  onCommercialChannelsChange(records) {
    this.updateCommercialFilter("channel_ids", records.map((r) => r.id));
    this.updateCommercialFilter("channel_category_ids", []);
    this.updateCommercialFilter("partner_ids", []);
    return this.refreshCommercialFilterOptions();
  }

  onCommercialBusinessUnitsChange(records) {
    this.updateCommercialFilter("business_unit_ids", records.map((r) => r.id));
    this.updateCommercialFilter("brand_ids", []);
    this.updateCommercialFilter("category_ids", []);
    this.updateCommercialFilter("product_ids", []);
    this.updateCommercialFilter("channel_ids", []);
    this.updateCommercialFilter("channel_category_ids", []);
    this.updateCommercialFilter("partner_ids", []);
    return this.refreshCommercialFilterOptions();
  }

  onCommercialProductsChange(records) {
    this.updateCommercialFilter("product_ids", records.map((r) => r.id));
    return this.refreshCommercialFilterOptions();
  }

  onCommercialChannelCategoriesChange(records) {
    this.updateCommercialFilter("channel_category_ids", records.map((r) => r.id));
    this.updateCommercialFilter("partner_ids", []);
    return this.refreshCommercialFilterOptions();
  }

  onCommercialPartnersChange(records) {
    this.updateCommercialFilter("partner_ids", records.map((r) => r.id));
    return this.refreshCommercialFilterOptions();
  }

  getOptionDomain(options) {
    const ids = (options || [])
      .map((option) => Number(option.id))
      .filter((id) => Number.isInteger(id));
    return ids.length ? [["id", "in", ids]] : [["id", "=", 0]];
  }

  getSelectedOptionRecords(options, selectedIds) {
    const selectedSet = new Set(normalizeFilterIds(selectedIds));
    return (options || [])
      .filter((option) => selectedSet.has(Number(option.id)))
      .map((option) => ({
        id: Number(option.id),
        display_name: option.name,
      }));
  }

  async applyOverviewFilters() {
    await this.loadCommercialPayload(true);
  }

  async applyPortfolioFilters() {
    await this.loadCommercialPayload(true);
  }

  async applyCoverageFilters() {
    await this.loadCoveragePayload(true);
  }

  async applyChannelFilters() {
    await this.loadChannelPayload(true);
  }

  async applyFinancialFilters() {
    await this.loadFinancialPayload(true);
    this.closeFinancialFilters();
  }

  async applyOperationsFilters() {
    await this.loadOperationsPayload(true);
    this.closeOperationsFilters();
  }

  async applyPdvFilters() {
    await this.loadPdvPayload(true);
    this.closePdvFilters();
  }

  async applyCommercialFilters() {
    if (this.state.commercialTab === "cobertura") {
      await this.applyCoverageFilters();
    } else if (this.state.commercialTab === "canal") {
      await this.applyChannelFilters();
    } else if (this.state.commercialTab === "portafolio") {
      await this.applyPortfolioFilters();
    } else {
      await this.applyOverviewFilters();
    }
    this.closeCommercialFilters();
  }

  async clearOverviewFilters() {
    this.state.overviewFilters = cloneDefaultFilters();
    await this.loadCommercialPayload(true);
  }

  async clearPortfolioFilters() {
    this.state.portfolioFilters = cloneDefaultFilters();
    await this.loadCommercialPayload(true);
  }

  async clearCoverageFilters() {
    this.state.coverageFilters = cloneDefaultFilters();
    await this.loadCoveragePayload(true);
  }

  async clearChannelFilters() {
    this.state.channelFilters = cloneDefaultFilters();
    await this.loadChannelPayload(true);
  }

  async clearFinancialFilters() {
    this.state.financialFilters = cloneDefaultFilters();
    await this.loadFinancialPayload(true);
    this.closeFinancialFilters();
  }

  async clearOperationsFilters() {
    this.state.operationsFilters = cloneOperationsDefaultFilters();
    await this.loadOperationsPayload(true);
    this.closeOperationsFilters();
  }

  async clearPdvFilters() {
    this.state.pdvFilters = cloneDefaultFilters();
    await this.loadPdvPayload(true);
    this.closePdvFilters();
  }

  async clearCommercialFilters() {
    if (this.state.commercialTab === "cobertura") {
      await this.clearCoverageFilters();
    } else if (this.state.commercialTab === "canal") {
      await this.clearChannelFilters();
    } else if (this.state.commercialTab === "portafolio") {
      await this.clearPortfolioFilters();
    } else {
      await this.clearOverviewFilters();
    }
    this.closeCommercialFilters();
  }

  normalizeRrhhApplicantId(value) {
    const rawValue =
      value && typeof value === "object"
        ? value.id
        : Array.isArray(value)
          ? value[0]?.id
          : value;
    const applicantId = Number(rawValue);
    return Number.isInteger(applicantId) && applicantId > 0 ? applicantId : false;
  }

  confirmRrhhApplicantChange() {
    if (!this.hasPendingRrhhChanges) {
      return true;
    }
    return window.confirm(
      "Hay cambios sin guardar en RRHH. Si cambia de solicitud, se descartaran. Desea continuar?",
    );
  }

  async selectRrhhApplicant(applicantValue) {
    const applicantId = this.normalizeRrhhApplicantId(applicantValue);
    const currentApplicantId = this.normalizeRrhhApplicantId(
      this.state.rrhhPayload?.active_filters?.selected_applicant_id,
    );
    if (applicantId === currentApplicantId) {
      return true;
    }
    if (!this.confirmRrhhApplicantChange()) {
      return false;
    }
    if (!applicantId) {
      this.state.rrhhTab = "overview";
    }
    await this.loadRrhhPayload(true, { selected_applicant_id: applicantId || false });
    return true;
  }

  onRrhhHistoryRiskSelect(value) {
    this.state.rrhhHistoryRisk = value;
  }

  updateRrhhPredictorValue(key, value) {
    this.state.rrhhPredictorForm = {
      ...this.state.rrhhPredictorForm,
      [key]: value,
    };
    this.state.rrhhPredictorDirty = true;
  }

  updateRrhhChecklistValue(key, value) {
    this.state.rrhhChecklistForm = {
      ...this.state.rrhhChecklistForm,
      [key]: value,
    };
    this.state.rrhhChecklistDirty = true;
  }

  async saveRrhhPredictor() {
    const applicantId = this.state.rrhhPayload?.active_filters?.selected_applicant_id;
    if (!applicantId) {
      return;
    }
    this.state.rrhhLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "upsert_rrhh_predictor",
        [applicantId, this.state.rrhhPredictorForm],
      );
      this.state.rrhhPayload = payload;
      this.syncRrhhFormsFromPayload(payload, {
        resetPredictor: true,
        resetChecklist: false,
      });
    } finally {
      this.state.rrhhLoading = false;
    }
  }

  async saveRrhhChecklist() {
    const applicantId = this.state.rrhhPayload?.active_filters?.selected_applicant_id;
    if (!applicantId) {
      return;
    }
    this.state.rrhhLoading = true;
    try {
      const payload = await this.orm.call(
        "zrn_analitics.home",
        "upsert_rrhh_checklist",
        [applicantId, this.state.rrhhChecklistForm],
      );
      this.state.rrhhPayload = payload;
      this.syncRrhhFormsFromPayload(payload, {
        resetPredictor: false,
        resetChecklist: true,
      });
    } finally {
      this.state.rrhhLoading = false;
    }
  }

  async useRrhhHistoricalApplicant(applicantId) {
    const changed = await this.selectRrhhApplicant(applicantId);
    if (!changed) {
      return;
    }
    this.state.rrhhTab = "predictor";
  }

  openRrhhApplicant(applicantId) {
    if (!applicantId) {
      return;
    }
    this.openRecordModal("hr.applicant", applicantId);
  }

  onOverviewSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyOverviewFilters();
    }
  }

  onPortfolioSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyPortfolioFilters();
    }
  }

  onCoverageSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyCoverageFilters();
    }
  }

  onChannelSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyChannelFilters();
    }
  }

  onCommercialSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyCommercialFilters();
    }
  }

  onFinancialSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyFinancialFilters();
    }
  }

  onOperationsSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyOperationsFilters();
    }
  }

  onPdvSearchKeydown(ev) {
    if (ev.key === "Enter") {
      this.applyPdvFilters();
    }
  }

  openRecordModal(model, resId) {
    if (!resId) {
      return;
    }
    this.actionService.doAction({
      type: "ir.actions.act_window",
      res_model: model,
      res_id: resId,
      views: [[false, "form"]],
      target: "new",
      context: {},
    });
  }

  openAnalyticsDetailModal(detail) {
    if (!detail) {
      return;
    }
    if (this.state.analyticsDetailModal) {
      this.state.analyticsDetailHistory = [
        ...this.state.analyticsDetailHistory,
        this.state.analyticsDetailModal,
      ];
    }
    this.state.analyticsDetailModal = detail;
  }

  openPdvRow(row) {
    if (!row) {
      return;
    }
    if (row.detail) {
      this.openAnalyticsDetailModal(row.detail);
      return;
    }
    this.openRecordModal("res.partner", row.partner_id);
  }

  openCustomerDetailById(partnerId) {
    if (!partnerId) {
      return;
    }
    const client = this.commercialPayload?.all_clients?.find(c => c.id === partnerId);
    if (client && client.detail) {
      this.openAnalyticsDetailModal(client.detail);
    } else {
      this.openRecordModal("res.partner", partnerId);
    }
  }

  closeAnalyticsDetailModal() {
    const history = [...this.state.analyticsDetailHistory];
    this.state.analyticsDetailModal = history.pop() || null;
    this.state.analyticsDetailHistory = history;
  }

  clearAnalyticsDetailModals() {
    this.state.analyticsDetailModal = null;
    this.state.analyticsDetailHistory = [];
  }

  formatDetailCard(detail, card) {
    if (!card) {
      return "";
    }
    if (card.format === "money") {
      return `${detail.currency_symbol || "$"} ${this.formatMoney(card.value)}`;
    }
    if (card.format === "text") {
      return String(card.value || "");
    }
    return this.formatCount(card.value);
  }

  onPortfolioRowClick(row) {
    if (row.level === "brand" || row.level === "line" || row.level === "sku") {
      this.openAnalyticsDetailModal(row.detail);
    }
  }

  openChannelModal(row) {
    this.state.channelModalRow = row;
  }

  openFinancialProduct(row) {
    if (!row) {
      return;
    }
    if (row.detail) {
      this.openAnalyticsDetailModal(row.detail);
      return;
    }
    this.openRecordModal("product.product", row.id);
  }

  openFinancialChannel(row) {
    if (row?.detail) {
      this.openAnalyticsDetailModal(row.detail);
    }
  }

  openFinancialBrand(row) {
    if (row?.detail) {
      this.openAnalyticsDetailModal(row.detail);
    }
  }

  openFinancialPortfolioRow(row) {
    if (!row) {
      return;
    }
    if (row.level === "sku" && row.resId) {
      this.openRecordModal("product.product", row.resId);
      return;
    }
    if (row.level === "brand" && row.resId) {
      this.openRecordModal("zrn_commercial.commercial.brand", row.resId);
      return;
    }
    if (row.detail) {
      this.openAnalyticsDetailModal(row.detail);
    }
  }

  openOperationsProduct(row) {
    if (row?.detail) {
      this.openAnalyticsDetailModal(row.detail);
    } else if (row?.id) {
      this.openRecordModal("product.product", row.id);
    } else if (row?.resId) {
      this.openRecordModal("product.product", row.resId);
    }
  }

  openOperationsProductChannel(row) {
    if (row?.product_channel_id) {
      this.openRecordModal("zrn_commercial.product.channel", row.product_channel_id);
    }
  }

  openOperationsSupplier(row) {
    if (row?.partner_id) {
      this.openRecordModal("res.partner", row.partner_id);
    }
  }

  openOperationsPurchaseOrder(row) {
    if (row?.order_id) {
      this.openRecordModal("purchase.order", row.order_id);
    }
  }

  openOperationsPortfolioRow(row) {
    if (!row) {
      return;
    }
    if (row.level === "brand" && row.resId) {
      this.openRecordModal("zrn_commercial.commercial.brand", row.resId);
      return;
    }
    if (row.level === "sku" && row.resId) {
      this.openRecordModal("product.product", row.resId);
    }
  }

  toggleOperationsPortfolioRow(rowKey) {
    this.state.operationsPortfolioExpanded = {
      ...this.state.operationsPortfolioExpanded,
      [rowKey]: !this.isOperationsPortfolioRowExpanded(rowKey),
    };
  }

  isOperationsPortfolioRowExpanded(rowKey) {
    if (this.state.operationsPortfolioExpanded[rowKey] !== undefined) {
      return Boolean(this.state.operationsPortfolioExpanded[rowKey]);
    }
    return rowKey === this.operationsPayload.portfolio?.units?.[0]?.key;
  }

  isOperationsPortfolioRowVisible(row) {
    return (row.ancestor_keys || []).every((key) =>
      this.isOperationsPortfolioRowExpanded(key),
    );
  }

  closeChannelModal() {
    this.state.channelModalRow = null;
    this.clearAnalyticsDetailModals();
  }

  openHome() {
    return this.actionService.doAction(
      "zrn_analitics.action_zrn_analitics_home",
    );
  }

  get activeHub() {
    return (
      this.hubs.find((hub) => hub.key === this.state.activeHub) || this.hubs[0]
    );
  }

  get activeCommercialTab() {
    return (
      this.commercialTabs.find((tab) => tab.key === this.state.commercialTab) ||
      this.commercialTabs[0]
    );
  }

  get visibleCommercialTabs() {
    if (!this.hasCommercialBrands) {
      return this.commercialTabs.filter((tab) => tab.key === "overview");
    }
    return this.commercialTabs;
  }

  get activeCommercialFilters() {
    if (this.state.commercialTab === "portafolio") {
      return this.state.portfolioFilters;
    }
    if (this.state.commercialTab === "cobertura") {
      return this.state.coverageFilters;
    }
    if (this.state.commercialTab === "canal") {
      return this.state.channelFilters;
    }
    return this.state.overviewFilters;
  }

  get activeCommercialFilterOptions() {
    if (this.state.commercialTab === "cobertura") {
      return this.coveragePayload.filter_options || {};
    }
    if (this.state.commercialTab === "canal") {
      return this.channelPayload.filter_options || {};
    }
    return this.state.commercialFilterOptions || this.commercialPayload.filter_options || {};
  }

  get activeFinancialTab() {
    return (
      this.financialTabs.find((tab) => tab.key === this.state.financialTab) ||
      this.financialTabs[0]
    );
  }

  get activeOperationsTab() {
    return (
      this.operationsTabs.find((tab) => tab.key === this.state.operationsTab) ||
      this.operationsTabs[0]
    );
  }

  get activePdvTab() {
    return (
      this.pdvTabs.find((tab) => tab.key === this.state.pdvTab) ||
      this.pdvTabs[0]
    );
  }

  get activeRrhhTab() {
    return (
      this.visibleRrhhTabs.find((tab) => tab.key === this.state.rrhhTab) ||
      this.visibleRrhhTabs[0]
    );
  }

  get hasPendingRrhhChanges() {
    return this.state.rrhhPredictorDirty || this.state.rrhhChecklistDirty;
  }

  get hasRrhhApplicant() {
    return Boolean(this.state.rrhhPayload?.current_applicant);
  }

  get visibleRrhhTabs() {
    if (!this.hasRrhhApplicant) {
      return this.rrhhTabs.filter((tab) => tab.key === "overview");
    }
    return this.rrhhTabs;
  }

  get rrhhCurrentApplicantRecord() {
    const currentApplicant = this.state.rrhhPayload?.current_applicant;
    if (!currentApplicant) {
      return null;
    }
    return {
      id: currentApplicant.id,
      display_name: currentApplicant.job_name
        ? `${currentApplicant.name} · ${currentApplicant.job_name}`
        : currentApplicant.name,
    };
  }

  get activeHubSummary() {
    if (this.state.activeHub === "pdv") {
      return this.pdvPayload.summary || {};
    }
    if (this.state.activeHub === "rrhh") {
      return this.rrhhPayload.summary || {};
    }
    if (this.state.activeHub === "operations") {
      return this.operationsPayload.summary || {};
    }
    if (this.state.activeHub === "financial") {
      return this.financialPayload.summary || {};
    }
    if (this.state.commercialTab === "cobertura") {
      return this.coveragePayload.summary || {};
    }
    if (this.state.commercialTab === "canal") {
      return this.channelPayload.summary || {};
    }
    return this.commercialPayload.summary || {};
  }

  get commercialPayload() {
    return this.normalizeCommercialPayload(this.state.commercialPayload);
  }

  getDefaultCommercialPayload() {
    const rfmSegments = [
      { key: "champion", name: "Campeon" },
      { key: "loyal", name: "Leal" },
      { key: "cant_lose", name: "No perderlo" },
      { key: "at_risk", name: "En riesgo" },
      { key: "promising", name: "Prometedor" },
      { key: "need_attention", name: "Atender" },
      { key: "new", name: "Nuevo" },
      { key: "hibernating", name: "Hibernando" },
      { key: "sporadic", name: "Esporadico" },
    ];
    const segments = Object.fromEntries(
      rfmSegments.map((segment) => [
        segment.key,
        {
          name: segment.name,
          count: 0,
          revenue: 0,
          revenue_pct: 0,
          top_clients: [],
        },
      ])
    );
    const emptySellin = { summary: {}, by_pdv: [], by_sku: [] };
    return {
      summary: {
        sync_label: "",
        period_label: "",
        total_amount: 0,
        order_count: 0,
        customer_count: 0,
        point_count: 0,
        product_count: 0,
        brand_count: 0,
        average_ticket: 0,
        currency_symbol: "$",
      },
      active_filters: cloneDefaultFilters(),
      filter_options: {
        periods: [],
        channels: [],
        brands: [],
        categories: [],
      },
      has_brands: false,
      empty_message: "",
      revenue_series: [],
      brand_mix: [],
      brand_catalog: [],
      top_customers: [],
      top_channels: [],
      top_products: [],
      portfolio_rows: [],
      all_clients: [],
      clients_rfm: {
        meta: { today: "", current_month_key: "", n_clients: 0, pipeline: "" },
        segments_order: rfmSegments,
        segments,
        abc: { a_count: 0, b_count: 0, c_count: 0, a_rev: 0, b_rev: 0, c_rev: 0 },
        rf_matrix: {},
        concentration: { top5_pct: 0, top10_pct: 0, a_pct: 0 },
        exec: {
          champions_loyal_count: 0,
          champions_loyal_pct: 0,
          at_risk_count: 0,
          at_risk_rev: 0,
          at_risk_rev_pct: 0,
        },
        pareto: [],
        clients: [],
      },
      cohort_retention: { months: [], matrix: [] },
      market_basket: { pairs: [] },
      cadence: { clients: [], segments: {}, fugados_top: [] },
      ltv_forecast: { months_observed: [], project_months: ["", "", ""], clients: [] },
      all_products: [],
      growers: [],
      decliners: [],
      sellin_vs_sellout: {
        walmart: { ...emptySellin },
        puma: { ...emptySellin },
      },
      bcg_data: {
        skus: [],
        mr: 0,
        mm: 0,
        tr: 0,
        cov: 0,
        sum: {
          S: { n: 0, r: 0, g: 0, am: 0 },
          C: { n: 0, r: 0, g: 0, am: 0 },
          I: { n: 0, r: 0, g: 0, am: 0 },
          D: { n: 0, r: 0, g: 0, am: 0 },
        },
      },
    };
  }

  normalizeCommercialPayload(payload = {}) {
    const defaults = this.getDefaultCommercialPayload();
    const incoming = payload || {};
    const asArray = (value, fallback = []) => Array.isArray(value) ? value : fallback;
    const incomingRfm = incoming.clients_rfm || {};
    const incomingSegments = incomingRfm.segments || {};
    const normalizedSegments = Object.fromEntries(
      Object.entries(defaults.clients_rfm.segments).map(([key, segment]) => [
        key,
        {
          ...segment,
          ...(incomingSegments[key] || {}),
          top_clients: asArray(incomingSegments[key]?.top_clients),
        },
      ])
    );
    for (const [key, segment] of Object.entries(incomingSegments)) {
      if (!normalizedSegments[key]) {
        normalizedSegments[key] = {
          name: segment?.name || key,
          count: segment?.count || 0,
          revenue: segment?.revenue || 0,
          revenue_pct: segment?.revenue_pct || 0,
          top_clients: asArray(segment?.top_clients),
        };
      }
    }
    const incomingBcgSum = incoming.bcg_data?.sum || {};
    const normalizedBcgSum = Object.fromEntries(
      Object.entries(defaults.bcg_data.sum).map(([key, quadrant]) => [
        key,
        { ...quadrant, ...(incomingBcgSum[key] || {}) },
      ])
    );
    return {
      ...defaults,
      ...incoming,
      summary: { ...defaults.summary, ...(incoming.summary || {}) },
      active_filters: { ...defaults.active_filters, ...(incoming.active_filters || {}) },
      filter_options: { ...defaults.filter_options, ...(incoming.filter_options || {}) },
      revenue_series: asArray(incoming.revenue_series),
      brand_mix: asArray(incoming.brand_mix),
      brand_catalog: asArray(incoming.brand_catalog),
      top_customers: asArray(incoming.top_customers),
      top_channels: asArray(incoming.top_channels),
      top_products: asArray(incoming.top_products),
      portfolio_rows: asArray(incoming.portfolio_rows),
      all_clients: asArray(incoming.all_clients),
      clients_rfm: {
        ...defaults.clients_rfm,
        ...incomingRfm,
        meta: { ...defaults.clients_rfm.meta, ...(incomingRfm.meta || {}) },
        abc: { ...defaults.clients_rfm.abc, ...(incomingRfm.abc || {}) },
        concentration: {
          ...defaults.clients_rfm.concentration,
          ...(incomingRfm.concentration || {}),
        },
        exec: { ...defaults.clients_rfm.exec, ...(incomingRfm.exec || {}) },
        rf_matrix: { ...defaults.clients_rfm.rf_matrix, ...(incomingRfm.rf_matrix || {}) },
        segments_order: asArray(incomingRfm.segments_order, defaults.clients_rfm.segments_order),
        segments: normalizedSegments,
        pareto: asArray(incomingRfm.pareto),
        clients: asArray(incomingRfm.clients),
      },
      cohort_retention: {
        ...defaults.cohort_retention,
        ...(incoming.cohort_retention || {}),
        months: asArray(incoming.cohort_retention?.months),
        matrix: asArray(incoming.cohort_retention?.matrix),
      },
      market_basket: {
        ...defaults.market_basket,
        ...(incoming.market_basket || {}),
        pairs: asArray(incoming.market_basket?.pairs),
      },
      cadence: {
        ...defaults.cadence,
        ...(incoming.cadence || {}),
        clients: asArray(incoming.cadence?.clients),
        fugados_top: asArray(incoming.cadence?.fugados_top),
      },
      ltv_forecast: {
        ...defaults.ltv_forecast,
        ...(incoming.ltv_forecast || {}),
        months_observed: asArray(incoming.ltv_forecast?.months_observed),
        project_months: asArray(incoming.ltv_forecast?.project_months, defaults.ltv_forecast.project_months),
        clients: asArray(incoming.ltv_forecast?.clients),
      },
      all_products: asArray(incoming.all_products),
      growers: asArray(incoming.growers),
      decliners: asArray(incoming.decliners),
      sellin_vs_sellout: {
        ...defaults.sellin_vs_sellout,
        ...(incoming.sellin_vs_sellout || {}),
      },
      bcg_data: {
        ...defaults.bcg_data,
        ...(incoming.bcg_data || {}),
        skus: asArray(incoming.bcg_data?.skus),
        sum: normalizedBcgSum,
      },
    };
  }

  get rrhhPayload() {
    return (
      this.state.rrhhPayload || {
        summary: {
          sync_label: "",
          applicant_count: 0,
          predictor_count: 0,
          checklist_count: 0,
          pattern_count: 0,
          high_risk_count: 0,
          pending_count: 0,
        },
        active_filters: { selected_applicant_id: false },
        applicant_options: [],
        current_applicant: null,
        current_predictor: null,
        current_checklist: null,
        current_patterns: {
          matched_pattern_count: 0,
          severity_level: "low",
          summary_text: "",
          patterns: [],
          current_patterns: [],
        },
        overview: {
          risk_distribution: [],
          stage_distribution: [],
          job_distribution: [],
          latest_rows: [],
        },
        predictor_config: { questions: [], thresholds: [] },
        checklist_template: { sections: [] },
        validated_patterns: { non_predictive_factors: [], library: [] },
        historical_rows: [],
        notes_sources: [],
        empty_message: "",
      }
    );
  }

  get rrhhPredictorFactors() {
    const groups = new Map();
    (this.rrhhPayload.predictor_config?.questions || []).forEach((question) => {
      if (!groups.has(question.factor_key)) {
        groups.set(question.factor_key, {
          key: question.factor_key,
          label: question.factor,
          badge: question.badge,
          questions: [],
        });
      }
      groups.get(question.factor_key).questions.push(question);
    });
    return [...groups.values()];
  }

  get operationsPayload() {
    return (
      this.state.operationsPayload || {
        summary: {
          sync_label: "",
          period_label: "",
          currency_symbol: "$",
          total_units: 0,
          total_revenue: 0,
          order_count: 0,
          point_count: 0,
          product_count: 0,
          brand_count: 0,
          avg_units_day: 0,
          period_days: 0,
        },
        active_filters: cloneOperationsDefaultFilters(),
        filter_options: {
          periods: [],
          channels: [],
          product_channels: [],
          brands: [],
          abc_choices: [],
          rotation_choices: [],
        },
        empty_message: "",
        kpis: [],
        monthly_demand_series: [],
        brand_units_mix: [],
        abc_distribution: [],
        rotation_distribution: [],
        top_skus: [],
        production_suggestions: [],
        portfolio: { units: [], rows: [] },
        trend_rows: [],
        growers: [],
        decliners: [],
        missing_recent_sales: [],
        forecast: { monthly: [], channel_pace: [], next_month_label: "", next_month_blend: 0, runrate_annual: 0 },
        inventory: {
          summary: {
            on_hand_units: 0,
            available_units: 0,
            reserved_units: 0,
            inventory_value: 0,
            risk_count: 0,
            overstock_count: 0,
            avg_coverage_days: 0,
            dormant_pct: 0,
          },
          coverage_distribution: [],
          brand_stock_mix: [],
          product_channel_mix: [],
          risk_rows: [],
          overstock_rows: [],
          rotation_rows: [],
        },
        purchases: {
          summary: {
            open_orders: 0,
            open_amount: 0,
            period_spend: 0,
            avg_lead_time_days: 0,
            late_lines: 0,
            supplier_concentration_pct: 0,
          },
          spend_series: [],
          supplier_rows: [],
          open_orders: [],
          backlog_rows: [],
          leadtime_rows: [],
        },
        alerts: [],
        notes_sources: [],
      }
    );
  }

  get financialPayload() {
    return (
      this.state.financialPayload || {
        summary: {
          sync_label: "",
          period_label: "",
          currency_symbol: "$",
          revenue: 0,
          matched_revenue: 0,
          coverage_pct: 0,
          cost: 0,
          margin: 0,
          margin_pct: 0,
        },
        active_filters: cloneDefaultFilters(),
        filter_options: {
          periods: [],
          channels: [],
          brands: [],
          categories: [],
        },
        empty_message: "",
        revenue_series: [],
        brand_margin_mix: [],
        channel_margin_rows: [],
        top_products: [],
        product_channel_matrix: [],
        brand_rows: [],
        portfolio: { units: [], rows: [] },
        alerts: [],
        notes_sources: [],
      }
    );
  }

  get coveragePayload() {
    return (
      this.state.coveragePayload || {
        summary: {
          sync_label: "",
          period_label: "",
          currency_symbol: "$",
        },
        active_filters: cloneDefaultFilters(),
        filter_options: {
          periods: [],
          channels: [],
          brands: [],
          categories: [],
        },
        summary_cards: [],
        coverage_by_channel: [],
        pdv_universe: { total: 0, channel_rows: [], municipio_rows: [] },
        channel_brand_matrix: { brands: [], rows: [] },
        sku_distribution: [],
        portfolio_holes: { core_skus: [], rows: [] },
        clients_at_risk: [],
        notes_sources: [],
      }
    );
  }

  get channelPayload() {
    return (
      this.state.channelPayload || {
        summary: {
          sync_label: "",
          period_label: "",
          currency_symbol: "$",
        },
        active_filters: cloneDefaultFilters(),
        filter_options: {
          periods: [],
          channels: [],
          brands: [],
          categories: [],
        },
        summary_cards: [],
        rows: [],
        empty_message: "",
      }
    );
  }

  get pdvPayload() {
    return (
      this.state.pdvPayload || {
        summary: {
          sync_label: "",
          period_label: "",
          currency_symbol: "$",
          total_pdvs: 0,
          total_revenue: 0,
          order_count: 0,
          avg_ticket: 0,
          active_channel_count: 0,
          new_count: 0,
          dormant_count: 0,
          low_st_count: 0,
          alert_count: 0,
          top_pdv_name: "",
          top_pdv_revenue: 0,
        },
        active_filters: cloneDefaultFilters(),
        filter_options: {
          periods: [],
          channels: [],
          brands: [],
          categories: [],
        },
        empty_message: "",
        revenue_series: [],
        channel_coverage: [],
        top_pdvs: [],
        ranking_rows: [],
        new_pdvs: [],
        dormant_pdvs: [],
        otros: { channels: [], rows: [] },
        walmart: { summary: {}, by_month: [], rows: [] },
        puma: { summary: {}, by_month: [], rows: [] },
        alerts: { rows: [] },
        notes_sources: [],
      }
    );
  }

  get hasCommercialRevenueSeries() {
    return Boolean((this.commercialPayload.revenue_series || []).length);
  }

  get hasCommercialBrands() {
    return Boolean(
      this.commercialPayload.has_brands ||
        Number(this.commercialPayload.summary?.brand_count || 0) > 0,
    );
  }

  get hasCommercialBrandMix() {
    return Boolean((this.commercialPayload.brand_mix || []).length);
  }

  get hasCommercialTopCustomers() {
    return Boolean((this.commercialPayload.top_customers || []).length);
  }

  get hasChannelRows() {
    return Boolean((this.channelPayload.rows || []).length);
  }

  get channelChartMetricOptions() {
    return [
      { key: "revenue", label: "Ingreso", format: "money" },
      { key: "order_count", label: "Pedidos", format: "count" },
      { key: "units", label: "Unidades", format: "count" },
      { key: "average_ticket", label: "Ticket promedio", format: "money" },
      { key: "customer_count", label: "Clientes", format: "count" },
      { key: "point_count", label: "PDVs", format: "count" },
      { key: "brand_count", label: "Marcas", format: "count" },
    ];
  }

  get activeChannelChartMetric() {
    return (
      this.channelChartMetricOptions.find(
        (metric) => metric.key === this.state.channelChartMetric,
      ) || this.channelChartMetricOptions[0]
    );
  }

  get clientChartMetricOptions() {
    return [
      { key: "rev", label: "Facturado", format: "money" },
      { key: "units", label: "Unidades", format: "count" },
      { key: "invoices", label: "Facturas", format: "count" },
      { key: "days_since", label: "Dias sin facturar", format: "count" },
    ];
  }

  get activeClientChartMetric() {
    return (
      this.clientChartMetricOptions.find(
        (metric) => metric.key === this.state.clientChartMetric,
      ) || this.clientChartMetricOptions[0]
    );
  }

  get productChartMetricOptions() {
    return [
      { key: "rev", label: "Venta", format: "money" },
      { key: "units", label: "Unidades", format: "count" },
      { key: "n_lines", label: "Lineas", format: "count" },
      { key: "channels", label: "Canales", format: "count" },
      { key: "avg_unit_price_real", label: "Precio real prom.", format: "money" },
    ];
  }

  get activeProductChartMetric() {
    return (
      this.productChartMetricOptions.find(
        (metric) => metric.key === this.state.productChartMetric,
      ) || this.productChartMetricOptions[0]
    );
  }

  get coverageSkuChartMetricOptions() {
    return [
      { key: "pdv_pct", label: "% PDVs", format: "percent" },
      { key: "pdv_count", label: "# PDVs", format: "count" },
      { key: "revenue", label: "Ingreso", format: "money" },
      { key: "channels", label: "Canales", format: "count" },
    ];
  }

  get activeCoverageSkuChartMetric() {
    return (
      this.coverageSkuChartMetricOptions.find(
        (metric) => metric.key === this.state.coverageSkuChartMetric,
      ) || this.coverageSkuChartMetricOptions[0]
    );
  }

  getAnalyticsChartMetricOptions(panelKey) {
    const metricSets = {
      financial_products: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "matched_revenue", label: "Rev. matcheado", format: "money" },
        { key: "cost", label: "Costo", format: "money" },
        { key: "margin", label: "Margen", format: "money" },
        { key: "margin_pct", label: "Margen %", format: "percent" },
        { key: "channel_count", label: "Canales", format: "count" },
      ],
      financial_channels: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "matched_revenue", label: "Rev. matcheado", format: "money" },
        { key: "cost", label: "Costo", format: "money" },
        { key: "margin", label: "Margen", format: "money" },
        { key: "margin_pct", label: "Margen %", format: "percent" },
        { key: "product_count", label: "Productos", format: "count" },
      ],
      financial_brands: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "matched_revenue", label: "Rev. matcheado", format: "money" },
        { key: "cost", label: "Costo", format: "money" },
        { key: "margin", label: "Margen", format: "money" },
        { key: "margin_pct", label: "Margen %", format: "percent" },
        { key: "product_count", label: "Productos", format: "count" },
      ],
      financial_product_channel: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "margin", label: "Margen", format: "money" },
        { key: "margin_pct", label: "Margen %", format: "percent" },
      ],
      financial_portfolio_drill: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "matched_revenue", label: "Rev. matcheado", format: "money" },
        { key: "cost", label: "Costo", format: "money" },
        { key: "margin", label: "Margen", format: "money" },
        { key: "margin_pct", label: "Margen %", format: "percent" },
        { key: "sku_count", label: "SKUs", format: "count" },
      ],
      financial_modal_channels: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "units", label: "Unidades", format: "count" },
        { key: "order_count", label: "Pedidos", format: "count" },
        { key: "pdv_count", label: "PDVs", format: "count" },
      ],
      financial_modal_secondary: [
        { key: "revenue", label: "Ingreso", format: "money" },
        { key: "units", label: "Unidades", format: "count" },
        { key: "order_count", label: "Pedidos", format: "count" },
      ],
      operations_top_skus: [
        { key: "units", label: "Unidades", format: "count" },
        { key: "revenue", label: "Revenue", format: "money" },
      ],
      operations_demanda: [
        { key: "units_per_month", label: "Unid/mes", format: "count" },
        { key: "units_per_day", label: "Unid/dia", format: "count" },
        { key: "weekly_suggestion", label: "Semanal", format: "count" },
        { key: "biweekly_suggestion", label: "Quincenal", format: "count" },
      ],
      operations_abc: [
        { key: "units", label: "Unidades", format: "count" },
        { key: "revenue", label: "Revenue", format: "money" },
        { key: "days_active", label: "Dias activos", format: "count" },
      ],
      operations_trends: [
        { key: "trend_pct", label: "Trend %", format: "percent" },
        { key: "revenue", label: "Revenue", format: "money" },
      ],
      pdv_ranking: [
        { key: "rev", label: "Revenue", format: "money" },
        { key: "invoices", label: "Pedidos", format: "count" },
        { key: "avg_ticket", label: "Ticket", format: "money" },
        { key: "days_since_last", label: "Recencia", format: "count" },
      ],
    };
    return metricSets[panelKey] || [{ key: "value", label: "Valor", format: "count" }];
  }

  getAnalyticsChartRows(panelKey) {
    const rowSets = {
      financial_products: (this.sortedFinancialProducts || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      financial_channels: (this.sortedFinancialChannels || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      financial_brands: (this.sortedFinancialBrands || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      financial_product_channel: (this.sortedFinancialProductChannel || []).slice(0, 10).map((row) => ({
        ...row,
        label: `${row.channel} - ${row.product_name}`,
      })),
      financial_portfolio_drill: (this.financialPortfolio.rows || [])
        .filter((row) => row.level === "unit" || this.isFinancialPortfolioRowVisible(row))
        .slice(0, 12)
        .map((row) => ({ ...row, label: row.label })),
      financial_modal_channels: (this.state.analyticsDetailModal?.channel_rows || [])
        .slice(0, 10)
        .map((row) => ({ ...row, label: row.name })),
      financial_modal_secondary: (
        this.state.analyticsDetailModal?.secondary_rows ||
        this.state.analyticsDetailModal?.customer_rows ||
        []
      )
        .slice(0, 10)
        .map((row) => ({ ...row, label: row.name })),
      operations_top_skus: (this.sortedOperationsTopSkus || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      operations_demanda: (this.sortedOperationsDemanda || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      operations_abc: (this.sortedOperationsAbc || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      operations_trends: (this.sortedOperationsTrends || []).slice(0, 10).map((row) => ({ ...row, label: row.name })),
      pdv_ranking: (this.sortedPdvRanking || []).slice(0, 12).map((row) => ({ ...row, label: row.name_short || row.client_full })),
    };
    return rowSets[panelKey] || [];
  }

  getAnalyticsChartMetric(panelKey) {
    const setting = this.getAnalyticsChartSetting(panelKey);
    return (
      this.getAnalyticsChartMetricOptions(panelKey).find((metric) => metric.key === setting.metric) ||
      this.getAnalyticsChartMetricOptions(panelKey)[0]
    );
  }

  get hasFinancialRevenueSeries() {
    return Boolean((this.financialPayload.revenue_series || []).length);
  }

  get hasFinancialBrandMix() {
    return Boolean((this.financialPayload.brand_margin_mix || []).length);
  }

  get hasFinancialChannels() {
    return Boolean((this.financialPayload.channel_margin_rows || []).length);
  }

  get hasOperationsMonthlySeries() {
    return Boolean((this.operationsPayload.monthly_demand_series || []).length);
  }

  get hasOperationsBrandMix() {
    return Boolean((this.operationsPayload.brand_units_mix || []).length);
  }

  get hasEchartsLibrary() {
    return Boolean(window.echarts);
  }

  get coverageMatrixMax() {
    const values = [];
    (this.coveragePayload.channel_brand_matrix.rows || []).forEach((row) => {
      (row.cells || []).forEach((cell) =>
        values.push(Number(cell.revenue || 0)),
      );
    });
    return Math.max(...values, 0);
  }

  getCoverageBarStyle(value, total) {
    const base = total || 1;
    const width = Math.max((Number(value || 0) / base) * 100, 4);
    return `width: ${width}%;`;
  }

  getCoverageMatrixCellStyle(value) {
    const max = this.coverageMatrixMax || 1;
    const ratio = Number(value || 0) / max;
    const opacity = Math.min(0.9, Math.max(0.08, ratio));
    const color = opacity >= 0.45 ? "#ffffff" : "#12365f";
    return `background: rgba(31, 78, 140, ${opacity}); color: ${color}; font-weight: 700;`;
  }

  get commercialPortfolio() {
    const rows = this.commercialPayload.portfolio_rows || [];
    const currencySymbol = this.commercialPayload.summary?.currency_symbol || "$";
    const brandCatalog = new Map(
      (this.commercialPayload.brand_catalog || []).map((brand) => [
        brand.name,
        brand.id,
      ]),
    );
    if (!rows.length) {
      return {
        hasBrands: false,
        hasRevenue: false,
        currencySymbol,
        totalRevenue: 0,
        units: [],
        drillRows: [],
      };
    }

    const totalRevenue = rows.reduce(
      (sum, row) => sum + Number(row.revenue || 0),
      0,
    );
    const brands = rows.map((brand) => {
      const categories = (brand.categories || []).map((category) => {
        const products = (category.products || []).map((product) => ({
          key: product.key,
          resId: this.extractNumericKey(product.key),
          name: product.name,
          revenue: Number(product.revenue || 0),
          mix_percentage: totalRevenue
            ? (Number(product.revenue || 0) / totalRevenue) * 100
            : 0,
          units_sold: Number(product.quantity_sold || 0),
          detail: product.detail || null,
        }));
        return {
          key: category.key,
          name: category.name,
          revenue: Number(category.revenue || 0),
          mix_percentage: totalRevenue
            ? (Number(category.revenue || 0) / totalRevenue) * 100
            : 0,
          units_sold: Number(category.quantity_sold || 0),
          billed_lines: 0,
          sku_count: Number(category.product_count || 0),
          margin_amount: 0,
          margin_pct: 0,
          skus: products,
          detail: category.detail || null,
        };
      });
      return {
        key: brand.key,
        resId: brandCatalog.get(brand.name) || false,
        name: brand.name,
        revenue: Number(brand.revenue || 0),
        mix_percentage: totalRevenue
          ? (Number(brand.revenue || 0) / totalRevenue) * 100
          : 0,
        units_sold: Number(brand.quantity_sold || 0),
        billed_lines: 0,
        sku_count: Number(brand.product_count || 0),
        margin_amount: 0,
        margin_pct: 0,
        lines: categories,
        detail: brand.detail || null,
        business_unit_id: brand.business_unit_id || false,
        business_unit_name: brand.business_unit_name || "Sin unidad de negocio",
      };
    });

    const unitColors = ["#1f4e8c", "#bd1730", "#2f6f5e", "#7a5ea8", "#8a5a1f"];
    const unitMap = new Map();
    brands.forEach((brand) => {
      const unitId = brand.business_unit_id || 0;
      const unitKey = `unit_${unitId || brand.business_unit_name}`;
      if (!unitMap.has(unitKey)) {
        unitMap.set(unitKey, {
          key: unitKey,
          name: brand.business_unit_name,
          business_unit_id: unitId,
          color: unitColors[unitMap.size % unitColors.length],
          brands: [],
          revenue: 0,
          mix_percentage: 0,
          sku_count: 0,
          brand_count: 0,
          units_sold: 0,
          billed_lines: 0,
          margin_amount: 0,
          margin_pct: 0,
        });
      }
      const unit = unitMap.get(unitKey);
      unit.brands.push(brand);
      unit.revenue += Number(brand.revenue || 0);
      unit.sku_count += Number(brand.sku_count || 0);
      unit.units_sold += Number(brand.units_sold || 0);
      unit.brand_count += 1;
    });
    const units = Array.from(unitMap.values()).map((unit) => ({
      ...unit,
      mix_percentage: totalRevenue ? (Number(unit.revenue || 0) / totalRevenue) * 100 : 0,
    }));

    const drillRows = [];

    units.forEach((unit) => {
      drillRows.push({
        key: unit.key,
        ancestor_keys: [],
        level: "unit",
        level_label: "Unidad de negocio",
        label: unit.name,
        business_unit_name: unit.name,
        brand_name: "",
        category_name: "",
        sku_name: "",
        revenue: unit.revenue,
        mix_percentage: unit.mix_percentage,
        units_sold: unit.units_sold,
        billed_lines: unit.billed_lines,
        sku_count: unit.sku_count,
        margin_amount: 0,
        margin_pct: 0,
        color: unit.color,
        detail: null,
      });
    });

    units.forEach((unit) => {
      unit.brands.forEach((brand) => {
      drillRows.push({
        key: brand.key,
        resId: brand.resId,
        ancestor_keys: [unit.key],
        level: "brand",
        level_label: "Marca",
        label: brand.name,
        business_unit_name: unit.name,
        brand_name: brand.name,
        category_name: "",
        sku_name: "",
        revenue: brand.revenue,
        mix_percentage: brand.mix_percentage,
        units_sold: brand.units_sold,
        billed_lines: 0,
        sku_count: brand.sku_count,
        margin_amount: 0,
        margin_pct: 0,
        detail: brand.detail,
      });
      (brand.lines || []).forEach((line) => {
        drillRows.push({
          key: line.key,
          ancestor_keys: [unit.key, brand.key],
          level: "line",
          level_label: "Categoria de marca",
          label: line.name,
          business_unit_name: unit.name,
          brand_name: brand.name,
          category_name: line.name,
          sku_name: "",
          revenue: line.revenue,
          mix_percentage: line.mix_percentage,
          units_sold: line.units_sold,
          billed_lines: 0,
          sku_count: line.sku_count,
          margin_amount: 0,
          margin_pct: 0,
          detail: line.detail,
        });
        (line.skus || []).forEach((sku) => {
          drillRows.push({
            key: sku.key,
            resId: sku.resId,
            ancestor_keys: [unit.key, brand.key, line.key],
            level: "sku",
            level_label: "SKU",
            label: sku.name,
            business_unit_name: unit.name,
            brand_name: brand.name,
            category_name: line.name,
            sku_name: sku.name,
            revenue: sku.revenue,
            mix_percentage: sku.mix_percentage,
            units_sold: sku.units_sold,
            billed_lines: 0,
            sku_count: 1,
            margin_amount: 0,
            margin_pct: 0,
            detail: sku.detail,
          });
        });
      });
      });
    });

    return {
      hasBrands: true,
      hasRevenue: totalRevenue > 0,
      currencySymbol,
      totalRevenue,
      units,
      drillRows,
    };
  }

  get financialPortfolio() {
    return this.financialPayload.portfolio || { units: [], rows: [] };
  }

  get activeFinancialUnit() {
    const units = this.financialPortfolio.units || [];
    if (!units.length) {
      return null;
    }
    return (
      units.find((unit) => unit.key === this.state.selectedFinancialUnit) ||
      units[0]
    );
  }

  selectFinancialUnit(unitKey) {
    this.state.selectedFinancialUnit = unitKey;
  }

  toggleFinancialPortfolioRow(rowKey) {
    this.state.financialPortfolioExpanded = {
      ...this.state.financialPortfolioExpanded,
      [rowKey]: !this.isFinancialPortfolioRowExpanded(rowKey),
    };
  }

  isFinancialPortfolioRowExpanded(rowKey) {
    if (this.state.financialPortfolioExpanded[rowKey] !== undefined) {
      return Boolean(this.state.financialPortfolioExpanded[rowKey]);
    }
    return rowKey === this.financialPortfolio.units?.[0]?.key;
  }

  isFinancialPortfolioRowVisible(row) {
    return (row.ancestor_keys || []).every((key) =>
      this.isFinancialPortfolioRowExpanded(key),
    );
  }

  get activePortfolioUnit() {
    const units = this.commercialPortfolio.units || [];
    if (!units.length) {
      return null;
    }
    return units.find((unit) => unit.key === this.state.selectedPortfolioUnit) || units[0];
  }

  selectPortfolioUnit(unitKey) {
    this.state.selectedPortfolioUnit = unitKey;
  }

  togglePortfolioRow(rowKey) {
    this.state.portfolioExpanded = {
      ...this.state.portfolioExpanded,
      [rowKey]: !this.isPortfolioRowExpanded(rowKey),
    };
  }

  isPortfolioRowExpanded(rowKey) {
    if (this.state.portfolioExpanded[rowKey] !== undefined) {
      return Boolean(this.state.portfolioExpanded[rowKey]);
    }
    return rowKey === this.commercialPortfolio.units?.[0]?.key;
  }

  isPortfolioRowVisible(row) {
    return (row.ancestor_keys || []).every((key) =>
      this.isPortfolioRowExpanded(key),
    );
  }

  getSelectChoices(options, emptyLabel) {
    const choices = [{ value: "", label: emptyLabel }];
    (options || []).forEach((option) => {
      choices.push({
        value: option,
        label: option,
      });
    });
    return choices;
  }

  getRrhhApplicantChoices(options) {
    return [
      { value: "", label: "Seleccionar solicitud" },
      ...(options || []).map((option) => ({
        value: option.id,
        label: option.job_name ? `${option.name} · ${option.job_name}` : option.name,
      })),
    ];
  }

  getRrhhApplicantDomain(options) {
    const ids = (options || [])
      .map((option) => Number(option.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    return ids.length ? [["id", "in", ids]] : [["id", "=", 0]];
  }

  getRrhhRiskChoices(options) {
    return [
      { value: "", label: "Todos los riesgos" },
      ...(options || []).map((option) => ({
        value: option.key,
        label: option.label,
      })),
    ];
  }

  getPeriodChoices(options) {
    // FIX: El backend en Python envía las opciones de periodo usando la estructura {'value': ..., 'label': ...}.
    // Se mapea con option.value y se mantiene fallback a option.key para compatibilidad.
    return (options || []).map((option) => ({
      value: option.value || option.key,
      label: option.label,
    }));
  }

  extractNumericKey(value) {
    const match = String(value || "").match(/(\d+)$/);
    return match ? Number(match[1]) : false;
  }

  queueChartRender() {
    if (this._chartRenderFrame) {
      cancelAnimationFrame(this._chartRenderFrame);
    }
    this._chartRenderTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this._chartRenderTimeouts = [];
    this._chartRenderFrame = requestAnimationFrame(() => {
      this._chartRenderFrame = 0;
      this.renderCharts();
      this.resizeCharts();
      this._chartRenderTimeouts.push(setTimeout(() => this.resizeCharts(), 80));
      this._chartRenderTimeouts.push(
        setTimeout(() => this.resizeCharts(), 220),
      );
    });
  }

  renderCharts() {
    if (!window.echarts || !this.rootElement) {
      return;
    }
    if (this.state.activeHub === "commercial") {
      try {
        this.renderOverviewLineChart();
        this.renderOverviewDonutChart();
        this.renderOverviewCustomersChart();
        this.renderChannelChart();
        this.renderPortfolioUnitsChart();
        this.renderPortfolioBrandsChart();
        this.renderCoverageChannelChart();
        this.renderCoverageSkuChart();
        this.renderRfmParetoChart();
        this.renderInsightsCadenceChart();
        this.renderInsightsMarketBasketChart();
        this.renderInsightsLtvChart();
        this.renderSellinSelloutChart();
        this.renderClientChart();
        this.renderProductChart();
        this.renderTrendsGrowersChart();
        this.renderTrendsDeclinersChart();
      } catch (error) {
        console.error("ZRN commercial chart error", error);
      }
    }
    if (this.state.activeHub === "financial") {
      try {
        this.renderFinancialOverviewChart();
        this.renderFinancialBrandChart();
        this.renderFinancialChannelChart();
        this.renderFinancialProductChart();
        this.renderFinancialProductMarginPctChart();
        this.renderFinancialPortfolioUnitChart();
        this.renderFinancialPortfolioBrandChart();
        this.renderAnalyticsPanelCharts();
      } catch (error) {
        console.error("ZRN financial chart error", error);
      }
    }
    if (this.state.activeHub === "operations") {
      try {
        this.renderOperationsMonthlyChart();
        this.renderOperationsBrandMixChart();
        this.renderOperationsAbcChart();
        this.renderOperationsRotationChart();
        this.renderOperationsPortfolioUnitsChart();
        this.renderOperationsTrendsChart();
        this.renderOperationsForecastChart();
        this.renderOperationsInventoryCoverageChart();
        this.renderOperationsInventoryBrandMixChart();
        this.renderOperationsPurchaseSpendChart();
        this.renderOperationsPurchaseSupplierChart();
        this.renderAnalyticsPanelCharts();
      } catch (error) {
        console.error("ZRN operations chart error", error);
      }
    }
    if (this.state.activeHub === "pdv") {
      try {
        this.renderPdvOverviewRevenueChart();
        this.renderPdvOverviewCoverageChart();
        this.renderPdvOverviewTopPdvChart();
        this.renderPdvChannelChart();
        this.renderPdvOtrosChannelsChart();
        this.renderAnalyticsPanelCharts();
      } catch (error) {
        console.error("ZRN pdv chart error", error);
      }
    }
    if (this.state.activeHub === "rrhh") {
      try {
        this.renderRrhhRiskChart();
        this.renderRrhhStageChart();
      } catch (error) {
        console.error("ZRN rrhh chart error", error);
      }
    }
  }

  getChart(themeKey) {
    const element = this.rootElement?.querySelector(
      `[data-zrn-chart="${themeKey}"]`,
    );
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect?.() || {
      width: 0,
      height: 0,
    };
    const width = Math.round(rect.width || parentRect.width || 0);
    const height = Math.round(rect.height || parentRect.height || 0);
    if (width < 80 || height < 80) {
      return null;
    }
    const existing = this._charts.get(themeKey);
    if (existing && existing.getDom() === element) {
      existing.resize({ width, height });
      return existing;
    }
    if (existing) {
      existing.dispose();
    }
    const chart =
      window.echarts.getInstanceByDom(element) ||
      window.echarts.init(element, null, {
        renderer: "canvas",
        width,
        height,
      });
    chart.resize({ width, height });
    this._charts.set(themeKey, chart);
    return chart;
  }

  renderAnalyticsPanelCharts() {
    const panelKeys = Object.keys(this.state.analyticsChartSettings || {});
    panelKeys.forEach((panelKey) => {
      if (this.getCommercialPanelView(panelKey) !== "chart") {
        return;
      }
      const rows = this.getAnalyticsChartRows(panelKey);
      if (!rows.length) {
        return;
      }
      const chartKey = `analytics-panel-${panelKey}`;
      const chart = this.getChart(chartKey);
      if (!chart) {
        return;
      }
      const setting = this.getAnalyticsChartSetting(panelKey);
      const metric = this.getAnalyticsChartMetric(panelKey);
      const chartType = setting.type || "bar";
      const currencySymbol =
        this.state.activeHub === "financial"
          ? this.financialPayload.summary.currency_symbol
          : this.state.activeHub === "pdv"
            ? this.pdvPayload.summary.currency_symbol
            : this.operationsPayload.summary.currency_symbol;
      const formatValue = (value) => {
        if (metric.format === "money") {
          return `${currencySymbol} ${this.formatMoney(value)}`;
        }
        if (metric.format === "percent") {
          return `${Number(value || 0).toFixed(1)}%`;
        }
        return this.formatCount(value);
      };
      const orderedRows = chartType === "bar" ? [...rows].reverse() : rows;
      const values = orderedRows.map((row) => Number(row[metric.key] || 0));
      const labels = orderedRows.map((row) => row.label || row.name || "");

      if (chartType === "pie") {
        chart.setOption({
          animationDuration: 650,
          color: ["#1f4e8c", "#2f65ad", "#78a7df", "#a9c7eb", "#d6e6f8", "#bd1730", "#0f766e"],
          tooltip: {
            trigger: "item",
            formatter: ({ name, value, percent }) => `${name}<br/>${formatValue(value)}<br/>${percent}%`,
          },
          legend: {
            orient: "vertical",
            right: 0,
            top: "middle",
            textStyle: { color: "#5f6b7a", fontSize: 11 },
          },
          series: [{
            type: "pie",
            radius: ["46%", "72%"],
            center: ["34%", "50%"],
            itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
            label: { show: false },
            data: orderedRows.map((row) => ({
              name: row.label || row.name || "",
              value: Number(row[metric.key] || 0),
            })),
          }],
        }, true);
        return;
      }

      chart.setOption({
        animationDuration: 650,
        grid: chartType === "line"
          ? { top: 18, right: 20, bottom: 34, left: 36, containLabel: true }
          : { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: chartType === "bar" ? "shadow" : "line" },
          valueFormatter: formatValue,
        },
        xAxis: chartType === "line"
          ? {
              type: "category",
              data: labels,
              axisTick: { show: false },
              axisLine: { lineStyle: { color: "#d6deea" } },
              axisLabel: { color: "#5f6b7a", fontSize: 11, interval: 0, rotate: labels.length > 6 ? 20 : 0 },
            }
          : {
              type: "value",
              splitLine: { lineStyle: { color: "#edf2f8" } },
              axisLabel: {
                color: "#5f6b7a",
                fontSize: 11,
                formatter: metric.format === "percent" ? (value) => `${value}%` : undefined,
              },
            },
        yAxis: chartType === "line"
          ? {
              type: "value",
              splitLine: { lineStyle: { color: "#edf2f8" } },
              axisLabel: {
                color: "#5f6b7a",
                fontSize: 11,
                formatter: metric.format === "percent" ? (value) => `${value}%` : undefined,
              },
            }
          : {
              type: "category",
              data: labels,
              axisTick: { show: false },
              axisLine: { show: false },
              axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
            },
        series: [{
          name: metric.label,
          type: chartType,
          smooth: chartType === "line" ? 0.2 : false,
          symbolSize: chartType === "line" ? 7 : undefined,
          data: values,
          barWidth: chartType === "bar" ? 18 : undefined,
          lineStyle: { color: "#bd1730", width: 3 },
          itemStyle: {
            color: "#bd1730",
            borderRadius: chartType === "bar" ? [0, 6, 6, 0] : 0,
          },
        }],
      }, true);
    });
  }

  renderOverviewLineChart() {
    if (this.state.commercialTab !== "overview") {
      return;
    }
    const series = this.commercialPayload.revenue_series || [];
    if (!series.length) {
      return;
    }
    const chart = this.getChart("overview-line");
    if (!chart) {
      return;
    }
    const chartType = this.state.overviewRevenueChartType || "line";
    chart.setOption(
      {
        animationDuration: 650,
        animationEasing: "cubicOut",
        grid: { top: 16, right: 20, bottom: 26, left: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: chartType === "bar" ? "shadow" : "line" },
          valueFormatter: (value) =>
            `${this.commercialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "category",
          data: series.map((item) => item.label),
          boundaryGap: chartType === "bar",
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisTick: { show: false },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: (value) => this.formatMoney(value),
          },
        },
        series: [
          {
            type: chartType,
            smooth: chartType === "line" ? 0.25 : false,
            symbol: chartType === "line" ? "circle" : "none",
            symbolSize: 8,
            data: series.map((item) => Number(item.value || 0)),
            lineStyle: { color: "#bd1730", width: 3 },
            barWidth: chartType === "bar" ? 28 : undefined,
            itemStyle: {
              color: "#bd1730",
              borderColor: "#ffffff",
              borderWidth: 2,
              borderRadius: chartType === "bar" ? [4, 4, 0, 0] : 0,
            },
            areaStyle: chartType === "line" ? {
              color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(31, 78, 140, 0.22)" },
                { offset: 1, color: "rgba(31, 78, 140, 0.04)" },
              ]),
            } : undefined,
          },
        ],
      },
      true,
    );
  }

  renderOverviewDonutChart() {
    if (this.state.commercialTab !== "overview") {
      return;
    }
    const mix = (this.commercialPayload.brand_mix || []).slice(0, 5);
    if (!mix.length) {
      return;
    }
    const chart = this.getChart("overview-donut");
    if (!chart) {
      return;
    }
    const chartType = this.state.overviewBrandMixChartType || "doughnut";
    chart.setOption(
      {
        animationDuration: 700,
        animationEasing: "cubicOut",
        color: ["#1f4e8c", "#2f65ad", "#78a7df", "#a9c7eb", "#d6e6f8"],
        tooltip: {
          trigger: "item",
          formatter: ({ name, value, percent }) =>
            `${name}<br/>${this.commercialPayload.summary.currency_symbol} ${this.formatMoney(value)}<br/>${percent}% del mix`,
        },
        legend: {
          orient: "vertical",
          right: 0,
          top: "middle",
          icon: "roundRect",
          itemWidth: 14,
          itemHeight: 10,
          textStyle: { color: "#5f6b7a", fontSize: 11 },
        },
        series: [
          {
            type: "pie",
            radius: chartType === "pie" ? "72%" : ["48%", "72%"],
            center: ["32%", "50%"],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 7 },
            data: mix.map((item) => ({
              name: item.name,
              value: Number(item.value || 0),
            })),
          },
        ],
      },
      true,
    );
  }

  renderOverviewCustomersChart() {
    if (this.state.commercialTab !== "overview") {
      return;
    }
    const customers = this.commercialPayload.top_customers || [];
    if (!customers.length) {
      return;
    }
    const chart = this.getChart("overview-customers");
    if (!chart) {
      return;
    }
    const chartType = this.state.overviewCustomersChartType || "bar";
    const reversed = [...customers].reverse();
    const values = reversed.map((item) => Number(item.total_amount || 0));
    chart.setOption(
      {
        animationDuration: 700,
        animationEasing: "cubicOut",
        grid:
          chartType === "line"
            ? { top: 16, right: 18, bottom: 36, left: 24, containLabel: true }
            : { top: 8, right: 16, bottom: 8, left: 120, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: chartType === "line" ? "line" : "shadow" },
          valueFormatter: (value) =>
            `${this.commercialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: chartType === "line" ? "category" : "value",
          data: chartType === "line" ? reversed.map((item) => item.name) : undefined,
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: chartType === "line" ? undefined : (value) => this.formatMoney(value),
          },
        },
        yAxis: {
          type: chartType === "line" ? "value" : "category",
          data: chartType === "line" ? undefined : reversed.map((item) => item.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: "#334155",
            fontSize: 11,
            width: 110,
            overflow: "truncate",
            formatter: chartType === "line" ? (value) => this.formatMoney(value) : undefined,
          },
        },
        series: [
          {
            type: chartType,
            smooth: chartType === "line" ? 0.25 : false,
            symbol: chartType === "line" ? "circle" : "none",
            data: values,
            barWidth: chartType === "bar" ? 18 : undefined,
            itemStyle: {
              borderRadius: chartType === "bar" ? [0, 6, 6, 0] : 0,
              color: new window.echarts.graphic.LinearGradient(1, 0, 0, 0, [
                { offset: 0, color: "#e34c62" },
                { offset: 1, color: "#bd1730" },
              ]),
            },
            emphasis: { focus: "series" },
          },
        ],
      },
      true,
    );
  }

  renderPortfolioUnitsChart() {
    if (this.state.commercialTab !== "portafolio") {
      return;
    }
    const units = this.commercialPortfolio.units || [];
    if (!units.length) {
      return;
    }
    const chart = this.getChart("portfolio-units");
    if (!chart) {
      return;
    }
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 30, right: 20, bottom: 54, left: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) =>
            `${this.commercialPortfolio.currencySymbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "category",
          data: units.map((unit) => unit.name),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: (value) => this.formatMoney(value),
          },
        },
        series: [
          {
            type: "bar",
            data: units.map((unit) => Number(unit.revenue || 0)),
            barMaxWidth: 56,
            itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          },
        ],
      },
      true,
    );
  }

  renderPortfolioBrandsChart() {
    if (this.state.commercialTab !== "portafolio") {
      return;
    }
    const brands = this.activePortfolioUnit?.brands || [];
    if (!brands.length) {
      return;
    }
    const chart = this.getChart("portfolio-brands");
    if (!chart) {
      return;
    }
    const reversed = [...brands].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 8, right: 16, bottom: 8, left: 140, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) =>
            `${this.commercialPortfolio.currencySymbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: (value) => this.formatMoney(value),
          },
        },
        yAxis: {
          type: "category",
          data: reversed.map((brand) => brand.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: "#334155",
            fontSize: 11,
            width: 130,
            overflow: "truncate",
          },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((brand) => Number(brand.revenue || 0)),
            barWidth: 18,
            itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderCoverageChannelChart() {
    if (this.state.commercialTab !== "cobertura") {
      return;
    }
    const rows = this.coveragePayload.coverage_by_channel || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("coverage-channel");
    if (!chart) {
      return;
    }
    const chartType = this.state.coverageChannelChartType || "bar";
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 18, right: 20, bottom: 30, left: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
        },
        legend: {
          data: ["Activos", "Red total"],
          bottom: 0,
          textStyle: { color: "#5f6b7a", fontSize: 11 },
        },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.channel),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        series: [
          {
            name: "Activos",
            type: chartType,
            data: rows.map((row) => Number(row.active || 0)),
            itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          },
          {
            name: "Red total",
            type: chartType,
            data: rows.map((row) => Number(row.network_total || 0)),
            itemStyle: { color: "#a9c7eb", borderRadius: [6, 6, 0, 0] },
          },
        ],
      },
      true,
    );
  }

  renderChannelChart() {
    if (
      this.state.commercialTab !== "canal" ||
      this.getCommercialPanelView("channel_main") !== "chart"
    ) {
      return;
    }
    const rows = this.channelPayload.rows || [];
    const chart = this.getChart("channel-main");
    if (!chart || !rows.length) {
      return;
    }
    const metric = this.activeChannelChartMetric;
    const values = rows.map((row) => Number(row[metric.key] || 0));
    const chartType = this.state.channelChartType || "bar";
    const formatter = (value) =>
      metric.format === "money"
        ? `${this.channelPayload.summary.currency_symbol} ${this.formatMoney(value)}`
        : this.formatCount(value);
    const common = {
      animationDuration: 450,
      tooltip: {
        trigger: chartType === "pie" ? "item" : "axis",
        valueFormatter: chartType === "pie" ? formatter : undefined,
      },
    };
    if (chartType === "pie") {
      chart.setOption(
        {
          ...common,
          legend: { type: "scroll", bottom: 0, textStyle: { color: "#5f6b7a" } },
          series: [
            {
              name: metric.label,
              type: "pie",
              radius: ["42%", "70%"],
              data: rows.map((row, index) => ({ name: row.channel, value: values[index] })),
              label: { color: "#334155" },
            },
          ],
        },
        true,
      );
      return;
    }
    chart.setOption(
      {
        ...common,
        grid: { top: 24, right: 20, bottom: 42, left: 52, containLabel: true },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.channel),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
          splitLine: { lineStyle: { color: "#edf2f8" } },
        },
        series: [
          {
            name: metric.label,
            type: chartType,
            data: values,
            smooth: chartType === "line",
            itemStyle: { color: "#1f4e8c" },
            lineStyle: { color: "#1f4e8c", width: 3 },
          },
        ],
      },
      true,
    );
  }

  renderCoverageSkuChart() {
    if (
      this.state.commercialTab !== "cobertura" ||
      this.getCommercialPanelView("coverage_sku") !== "chart"
    ) {
      return;
    }
    const rows = (this.sortedSkuDistribution || []).slice(0, 10);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("coverage-sku");
    if (!chart) {
      return;
    }
    const metric = this.activeCoverageSkuChartMetric;
    const chartType = this.state.coverageSkuChartType || "bar";
    const values = rows.map((row) => Number(row[metric.key] || 0));
    const formatter = (value) => {
      if (metric.format === "money") {
        return `${this.commercialPayload.summary.currency_symbol} ${this.formatMoney(value)}`;
      }
      if (metric.format === "percent") {
        return `${Number(value || 0).toFixed(1)}%`;
      }
      return this.formatCount(value);
    };
    const common = {
      animationDuration: 650,
      tooltip: {
        trigger: chartType === "pie" ? "item" : "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: chartType === "pie" ? undefined : formatter,
      },
    };
    if (chartType === "pie") {
      chart.setOption(
        {
          ...common,
          legend: { type: "scroll", bottom: 0, textStyle: { color: "#5f6b7a" } },
          series: [
            {
              name: metric.label,
              type: "pie",
              radius: ["42%", "70%"],
              data: rows.map((row, index) => ({ name: row.sku, value: values[index] })),
              label: { color: "#334155", formatter: "{b}" },
            },
          ],
        },
        true,
      );
      return;
    }
    const reversed = [...rows].reverse();
    const reversedValues = [...values].reverse();
    if (chartType === "line") {
      chart.setOption(
        {
          ...common,
          grid: { top: 24, right: 20, bottom: 44, left: 54, containLabel: true },
          xAxis: {
            type: "category",
            data: rows.map((row) => row.sku),
            axisTick: { show: false },
            axisLine: { lineStyle: { color: "#d6deea" } },
            axisLabel: { color: "#5f6b7a", fontSize: 11, width: 110, overflow: "truncate" },
          },
          yAxis: {
            type: "value",
            max: metric.format === "percent" ? 100 : undefined,
            splitLine: { lineStyle: { color: "#edf2f8" } },
            axisLabel: {
              color: "#5f6b7a",
              fontSize: 11,
              formatter: metric.format === "percent" ? (value) => `${value}%` : undefined,
            },
          },
          series: [
            {
              name: metric.label,
              type: "line",
              smooth: true,
              data: values,
              itemStyle: { color: "#bd1730" },
              lineStyle: { color: "#bd1730", width: 3 },
            },
          ],
        },
        true,
      );
      return;
    }
    chart.setOption(
      {
        ...common,
        grid: { top: 8, right: 16, bottom: 8, left: 180, containLabel: false },
        xAxis: {
          type: "value",
          max: metric.format === "percent" ? 100 : undefined,
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: metric.format === "percent" ? (value) => `${value}%` : undefined,
          },
        },
        yAxis: {
          type: "category",
          data: reversed.map((row) => row.sku),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: {
            color: "#334155",
            fontSize: 11,
            width: 170,
            overflow: "truncate",
          },
        },
        series: [
          {
            name: metric.label,
            type: "bar",
            data: reversedValues,
            barWidth: 18,
            itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderOperationsMonthlyChart() {
    if (this.state.operationsTab !== "overview") {
      return;
    }
    const series = this.operationsPayload.monthly_demand_series || [];
    if (!series.length) {
      return;
    }
    const chart = this.getChart("operations-overview-monthly");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: series.map((item) => item.label),
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisTick: { show: false },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatCount(value) },
      },
      series: [
        {
          name: "Unidades",
          type: "bar",
          data: series.map((item) => Number(item.projected_units || item.units || 0)),
          itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 44,
        },
      ],
    }, true);
  }

  renderOperationsBrandMixChart() {
    if (this.state.operationsTab !== "overview") {
      return;
    }
    const mix = (this.operationsPayload.brand_units_mix || []).slice(0, 6);
    if (!mix.length) {
      return;
    }
    const chart = this.getChart("operations-overview-brand-mix");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      color: ["#1f4e8c", "#2f65ad", "#78a7df", "#a9c7eb", "#d6e6f8", "#bd1730"],
      tooltip: { trigger: "item" },
      legend: {
        orient: "vertical",
        right: 0,
        top: "middle",
        textStyle: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["46%", "72%"],
          center: ["34%", "50%"],
          itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
          label: { show: false },
          data: mix.map((item) => ({ name: item.name, value: Number(item.value || 0) })),
        },
      ],
    }, true);
  }

  renderOperationsAbcChart() {
    if (this.state.operationsTab !== "overview" && this.state.operationsTab !== "abc") {
      return;
    }
    const rows = this.operationsPayload.abc_distribution || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-overview-abc");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: rows.map((item) => Number(item.value || 0)),
        itemStyle: { color: "#bd1730", borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 36,
      }],
    }, true);
  }

  renderOperationsRotationChart() {
    if (this.state.operationsTab !== "overview" && this.state.operationsTab !== "abc") {
      return;
    }
    const rows = this.operationsPayload.rotation_distribution || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-overview-rotation");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: rows.map((item) => Number(item.value || 0)),
        itemStyle: { color: "#0f766e", borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 36,
      }],
    }, true);
  }

  renderOperationsPortfolioUnitsChart() {
    if (this.state.operationsTab !== "portafolio") {
      return;
    }
    const rows = this.operationsPayload.portfolio?.units || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-portfolio-units");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatCount(value) },
      },
      series: [{
        type: "bar",
        data: rows.map((item) => Number(item.units || 0)),
        itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 44,
      }],
    }, true);
  }

  renderOperationsTrendsChart() {
    if (this.state.operationsTab !== "tendencias") {
      return;
    }
    const rows = (this.sortedOperationsTrends || []).slice(0, 10);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-trends");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%` },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => `${value}%` },
      },
      yAxis: {
        type: "category",
        data: [...rows].reverse().map((item) => item.name),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
      },
      series: [{
        type: "bar",
        data: [...rows].reverse().map((item) => ({
          value: Number(item.trend_pct || 0),
          itemStyle: { color: Number(item.trend_pct || 0) >= 0 ? "#0f766e" : "#bd1730" },
        })),
        barWidth: 18,
      }],
    }, true);
  }

  renderOperationsForecastChart() {
    if (this.state.operationsTab !== "forecast") {
      return;
    }
    const rows = this.operationsPayload.forecast?.monthly || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-forecast");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      legend: {
        data: ["Actual Q", "Proyectado Q"],
        top: 0,
        right: 16,
        textStyle: { color: "#5f6b7a", fontSize: 11 },
      },
      grid: { top: 46, right: 24, bottom: 34, left: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${this.operationsPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, margin: 14 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
      },
      series: [
        {
          name: "Actual Q",
          type: "bar",
          data: rows.map((item) => Number(item.revenue || 0)),
          itemStyle: { color: "#a9c7eb", borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 28,
        },
        {
          name: "Proyectado Q",
          type: "line",
          smooth: 0.2,
          symbolSize: 7,
          data: rows.map((item) => Number(item.projected_revenue || 0)),
          lineStyle: { color: "#0f766e", width: 3 },
          itemStyle: { color: "#0f766e" },
        },
      ],
    }, true);
  }

  renderOperationsInventoryCoverageChart() {
    if (this.state.operationsTab !== "inventarios") {
      return;
    }
    const rows = this.operationsPayload.inventory?.coverage_distribution || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-inventory-coverage");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [{
        type: "bar",
        data: rows.map((item) => Number(item.value || 0)),
        itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 40,
      }],
    }, true);
  }

  renderOperationsInventoryBrandMixChart() {
    if (this.state.operationsTab !== "inventarios") {
      return;
    }
    const mix = (this.operationsPayload.inventory?.brand_stock_mix || []).slice(0, 8);
    if (!mix.length) {
      return;
    }
    const chart = this.getChart("operations-inventory-brand-mix");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      color: ["#1f4e8c", "#2f65ad", "#78a7df", "#a9c7eb", "#d6e6f8", "#bd1730", "#0f766e", "#94a3b8"],
      tooltip: { trigger: "item" },
      legend: {
        orient: "vertical",
        right: 0,
        top: "middle",
        textStyle: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [{
        type: "pie",
        radius: ["46%", "72%"],
        center: ["34%", "50%"],
        itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
        label: { show: false },
        data: mix.map((item) => ({ name: item.name, value: Number(item.value || 0) })),
      }],
    }, true);
  }

  renderOperationsPurchaseSpendChart() {
    if (this.state.operationsTab !== "compras") {
      return;
    }
    const rows = this.operationsPayload.purchases?.spend_series || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-purchases-spend");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => `${this.operationsPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "category",
        data: rows.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
      },
      series: [{
        type: "bar",
        data: rows.map((item) => Number(item.value || 0)),
        itemStyle: { color: "#0f766e", borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 40,
      }],
    }, true);
  }

  renderOperationsPurchaseSupplierChart() {
    if (this.state.operationsTab !== "compras") {
      return;
    }
    const rows = (this.operationsPayload.purchases?.supplier_rows || []).slice(0, 8);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("operations-purchases-suppliers");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption({
      animationDuration: 650,
      grid: { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value) => `${this.operationsPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
      },
      yAxis: {
        type: "category",
        data: reversed.map((row) => row.supplier),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
      },
      series: [{
        type: "bar",
        data: reversed.map((row) => Number(row.spend || 0)),
        barWidth: 18,
        itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
      }],
    }, true);
  }

  renderFinancialOverviewChart() {
    if (this.state.financialTab !== "overview") {
      return;
    }
    const series = this.financialPayload.revenue_series || [];
    if (!series.length) {
      return;
    }
    const chart = this.getChart("financial-overview");
    if (!chart) {
      return;
    }
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 28, right: 20, bottom: 26, left: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          valueFormatter: (value) =>
            `${this.financialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        legend: {
          data: ["Revenue", "Costo", "Margen"],
          textStyle: { color: "#5f6b7a", fontSize: 11 },
        },
        xAxis: {
          type: "category",
          data: series.map((item) => item.label),
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisTick: { show: false },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: (value) => this.formatMoney(value),
          },
        },
        series: [
          {
            name: "Revenue",
            type: "bar",
            data: series.map((item) => Number(item.revenue || 0)),
            itemStyle: { color: "#0f766e", borderRadius: [6, 6, 0, 0] },
            barMaxWidth: 28,
          },
          {
            name: "Costo",
            type: "bar",
            data: series.map((item) => Number(item.cost || 0)),
            itemStyle: { color: "#c2410c", borderRadius: [6, 6, 0, 0] },
            barMaxWidth: 28,
          },
          {
            name: "Margen",
            type: "line",
            smooth: 0.2,
            symbolSize: 8,
            data: series.map((item) => Number(item.margin || 0)),
            lineStyle: { color: "#bd1730", width: 3 },
            itemStyle: { color: "#bd1730" },
          },
        ],
      },
      true,
    );
  }

  renderFinancialBrandChart() {
    if (this.state.financialTab !== "overview" && this.state.financialTab !== "marca") {
      return;
    }
    const rows =
      this.state.financialTab === "overview"
        ? (this.financialPayload.brand_margin_mix || []).slice(0, 8)
        : (this.sortedFinancialBrands || []).slice(0, 8);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart(
      this.state.financialTab === "overview"
        ? "financial-brand-overview"
        : "financial-brand-detail",
    );
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 12, right: 16, bottom: 12, left: 140, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) =>
            `${this.financialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
        },
        yAxis: {
          type: "category",
          data: reversed.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 11, width: 130, overflow: "truncate" },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((row) => Number(row.margin || 0)),
            barWidth: 18,
            itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderFinancialChannelChart() {
    if (this.state.financialTab !== "overview" && this.state.financialTab !== "canal") {
      return;
    }
    const rows = (this.sortedFinancialChannels || []).slice(0, 8);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart(
      this.state.financialTab === "overview"
        ? "financial-channel-overview"
        : "financial-channel-detail",
    );
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 12, right: 16, bottom: 12, left: 150, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => `${value}%` },
        },
        yAxis: {
          type: "category",
          data: reversed.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 11, width: 140, overflow: "truncate" },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((row) => Number(row.margin_pct || 0)),
            barWidth: 18,
            itemStyle: { color: "#0f766e", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderFinancialProductChart() {
    if (this.state.financialTab !== "producto") {
      return;
    }
    const rows = (this.sortedFinancialProducts || []).slice(0, 10);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("financial-product-margin");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 12, right: 16, bottom: 12, left: 220, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) =>
            `${this.financialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
        },
        yAxis: {
          type: "category",
          data: reversed.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 11, width: 210, overflow: "truncate" },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((row) => Number(row.margin || 0)),
            barWidth: 18,
            itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderFinancialProductMarginPctChart() {
    if (this.state.financialTab !== "producto") {
      return;
    }
    const rows = (this.sortedFinancialProducts || []).slice(0, 10);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("financial-product-margin-pct");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 12, right: 16, bottom: 12, left: 220, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => `${value}%` },
        },
        yAxis: {
          type: "category",
          data: reversed.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 11, width: 210, overflow: "truncate" },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((row) => Number(row.margin_pct || 0)),
            barWidth: 18,
            itemStyle: { color: "#0f766e", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderFinancialPortfolioUnitChart() {
    if (this.state.financialTab !== "portafolio") {
      return;
    }
    const units = this.financialPortfolio.units || [];
    if (!units.length) {
      return;
    }
    const chart = this.getChart("financial-portfolio-units");
    if (!chart) {
      return;
    }
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 18, right: 20, bottom: 30, left: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) =>
            `${this.financialPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
        },
        xAxis: {
          type: "category",
          data: units.map((unit) => unit.name),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
        },
        series: [
          {
            type: "bar",
            data: units.map((unit) => Number(unit.margin || 0)),
            barMaxWidth: 56,
            itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          },
        ],
      },
      true,
    );
  }

  renderFinancialPortfolioBrandChart() {
    if (this.state.financialTab !== "portafolio") {
      return;
    }
    const brands = this.activeFinancialUnit?.brands || [];
    if (!brands.length) {
      return;
    }
    const chart = this.getChart("financial-portfolio-brands");
    if (!chart) {
      return;
    }
    const reversed = [...brands].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 8, right: 16, bottom: 8, left: 160, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => `${value}%` },
        },
        yAxis: {
          type: "category",
          data: reversed.map((brand) => brand.name),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 11, width: 150, overflow: "truncate" },
        },
        series: [
          {
            type: "bar",
            data: reversed.map((brand) => Number(brand.margin_pct || 0)),
            barWidth: 18,
            itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
          },
        ],
      },
      true,
    );
  }

  renderPdvOverviewRevenueChart() {
    if (this.state.pdvTab !== "overview") {
      return;
    }
    const series = this.pdvPayload.revenue_series || [];
    if (!series.length) {
      return;
    }
    const chart = this.getChart("pdv-overview-revenue");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      grid: { top: 18, right: 20, bottom: 26, left: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) =>
          `${this.pdvPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "category",
        data: series.map((item) => item.label),
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisTick: { show: false },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: {
          color: "#5f6b7a",
          fontSize: 11,
          formatter: (value) => this.formatMoney(value),
        },
      },
      series: [
        {
          type: "line",
          smooth: 0.25,
          symbolSize: 7,
          data: series.map((item) => Number(item.value || 0)),
          lineStyle: { color: "#1f4e8c", width: 3 },
          itemStyle: { color: "#1f4e8c" },
          areaStyle: {
            color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(31, 78, 140, 0.18)" },
              { offset: 1, color: "rgba(31, 78, 140, 0.03)" },
            ]),
          },
        },
      ],
    }, true);
  }

  renderPdvOverviewCoverageChart() {
    if (this.state.pdvTab !== "overview") {
      return;
    }
    const rows = this.pdvPayload.channel_coverage || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("pdv-overview-coverage");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      legend: {
        data: ["Activos", "Red total"],
        textStyle: { color: "#5f6b7a", fontSize: 11 },
      },
      grid: { top: 30, right: 20, bottom: 30, left: 24, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "category",
        data: rows.map((row) => row.channel),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [
        {
          name: "Activos",
          type: "bar",
          data: rows.map((row) => Number(row.active || 0)),
          itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 28,
        },
        {
          name: "Red total",
          type: "bar",
          data: rows.map((row) => Number(row.network_total || 0)),
          itemStyle: { color: "#a9c7eb", borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 28,
        },
      ],
    }, true);
  }

  renderPdvOverviewTopPdvChart() {
    if (this.state.pdvTab !== "overview") {
      return;
    }
    const rows = (this.pdvPayload.top_pdvs || []).slice(0, 8);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("pdv-overview-top");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption({
      animationDuration: 650,
      grid: { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value) =>
          `${this.pdvPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
      },
      yAxis: {
        type: "category",
        data: reversed.map((row) => row.name_short),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: reversed.map((row) => Number(row.rev || 0)),
          barWidth: 18,
          itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
        },
      ],
    }, true);
  }

  renderPdvChannelChart() {
    if (this.state.pdvTab !== "canales") {
      return;
    }
    const rows = this.pdvPayload.channel_compare?.by_month || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("pdv-channel-monthly");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 600,
      grid: { top: 35, right: 20, bottom: 25, left: 35, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value) =>
          `${this.pdvPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      legend: {
        data: ["Sell-in", "Sell-out"],
        textStyle: { color: "#5f6b7a" },
      },
      xAxis: {
        type: "category",
        data: rows.map((row) => row.label),
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", formatter: (value) => this.formatMoney(value) },
      },
      series: [
        {
          name: "Sell-in",
          type: "bar",
          data: rows.map((row) => Number(row.sellin_q || 0)),
          color: "#2563eb",
          barMaxWidth: 24,
        },
        {
          name: "Sell-out",
          type: "bar",
          data: rows.map((row) => Number(row.sellout_q || 0)),
          color: "#16a34a",
          barMaxWidth: 24,
        },
      ],
    }, true);
  }

  renderPdvOtrosChannelsChart() {
    if (this.state.pdvTab !== "otros") {
      return;
    }
    const rows = this.pdvPayload.otros?.channels || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("pdv-otros-channels");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption({
      animationDuration: 650,
      grid: { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value) =>
          `${this.pdvPayload.summary.currency_symbol} ${this.formatMoney(value)}`,
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (value) => this.formatMoney(value) },
      },
      yAxis: {
        type: "category",
        data: reversed.map((row) => row.channel),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: reversed.map((row) => Number(row.revenue || 0)),
          barWidth: 18,
          itemStyle: { color: "#475569", borderRadius: [0, 6, 6, 0] },
        },
      ],
    }, true);
  }

  renderRrhhRiskChart() {
    if (this.state.rrhhTab !== "overview") {
      return;
    }
    const rows = this.rrhhPayload.overview?.risk_distribution || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("rrhh-risk-distribution");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 650,
      color: ["#16a34a", "#f59e0b", "#ea580c", "#dc2626"],
      tooltip: { trigger: "item" },
      legend: {
        orient: "vertical",
        right: 0,
        top: "middle",
        textStyle: { color: "#5f6b7a", fontSize: 11 },
      },
      series: [{
        type: "pie",
        radius: ["48%", "74%"],
        center: ["34%", "50%"],
        itemStyle: { borderColor: "#ffffff", borderWidth: 2 },
        label: { show: false },
        data: rows.map((row) => ({ name: row.label, value: Number(row.value || 0) })),
      }],
    }, true);
  }

  renderRrhhStageChart() {
    if (this.state.rrhhTab !== "overview") {
      return;
    }
    const rows = this.rrhhPayload.overview?.stage_distribution || [];
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("rrhh-stage-distribution");
    if (!chart) {
      return;
    }
    const reversed = [...rows].slice(0, 8).reverse();
    chart.setOption({
      animationDuration: 650,
      grid: { top: 12, right: 16, bottom: 12, left: 180, containLabel: false },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: reversed.map((row) => row.label),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#334155", fontSize: 11, width: 170, overflow: "truncate" },
      },
      series: [{
        type: "bar",
        data: reversed.map((row) => Number(row.value || 0)),
        barWidth: 18,
        itemStyle: { color: "#bd1730", borderRadius: [0, 6, 6, 0] },
      }],
    }, true);
  }

  resizeCharts() {
    this._charts.forEach((chart) => chart.resize());
  }

  disposeCharts() {
    this._charts.forEach((chart) => chart.dispose());
    this._charts.clear();
  }

  get rootElement() {
    return this.rootRef?.el instanceof Element ? this.rootRef.el : null;
  }

  formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("es-GT", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  formatCount(value) {
    return new Intl.NumberFormat("es-GT", {
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  formatChannelCardValue(card) {
    if (card?.type === "currency") {
      return `${this.channelPayload.summary.currency_symbol} ${this.formatMoney(card.value)}`;
    }
    return this.formatCount(card?.value);
  }

  onRfmFilterSegmentSelect(ev) {
    this.state.rfmFilterSegment = ev.target.value;
  }

  onRfmFilterAbcSelect(ev) {
    this.state.rfmFilterAbc = ev.target.value;
  }

  onRfmFilterSearchInput(ev) {
    this.state.rfmFilterSearch = ev.target.value;
  }

  setBcgFilter(q) {
    this.state.bcgFilter = q;
  }

  setSellinChain(chain) {
    this.state.sellinChain = chain;
    this.queueChartRender();
  }

  renderRfmParetoChart() {
    if (this.state.commercialTab !== "rfm") {
      return;
    }
    const rfm = this.commercialPayload?.clients_rfm || {};
    const pareto = rfm.pareto || [];
    if (!pareto.length) {
      return;
    }
    const chart = this.getChart("rfm-pareto");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 600,
      grid: { top: 30, right: 30, bottom: 40, left: 45, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const pt = pareto[idx];
          return `Top ${pt.x} clientes (${pt.x_pct}%)<br/>% Rev acum: <b>${pt.cum_pct}%</b>`;
        }
      },
      xAxis: {
        type: "category",
        name: "% Clientes",
        nameLocation: "middle",
        nameGap: 24,
        data: pareto.map((p) => `${Math.round(p.x_pct)}%`),
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a", fontSize: 10 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", formatter: "{value}%" },
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          data: pareto.map((p) => p.cum_pct),
          lineStyle: { color: "#22c55e", width: 2.5 },
          areaStyle: {
            color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(34, 197, 94, 0.25)" },
              { offset: 1, color: "rgba(34, 197, 94, 0.03)" },
            ]),
          },
        }
      ]
    });
  }

  renderInsightsCadenceChart() {
    if (this.state.commercialTab !== "insights") {
      return;
    }
    const cadence = this.commercialPayload?.cadence || {};
    const segments = cadence.segments || {};
    const chart = this.getChart("insights-cadence");
    if (!chart) {
      return;
    }
    const data = [
      { value: segments.regular?.count || 0, name: "Regular" },
      { value: segments.bimensual?.count || 0, name: "Bimensual" },
      { value: segments.esporádico?.count || 0, name: "Esporádico" },
      { value: segments.único?.count || 0, name: "Único" },
    ];
    chart.setOption({
      animationDuration: 600,
      tooltip: {
        trigger: "item",
        formatter: "{b}: <b>{c} clientes</b> ({d}%)"
      },
      legend: {
        orient: "horizontal",
        bottom: 0,
        left: "center",
        textStyle: { color: "#5f6b7a", fontSize: 11 }
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: "#fff",
            borderWidth: 2
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: "bold"
            }
          },
          data: data,
          color: ["#16a34a", "#2563eb", "#eab308", "#64748b"]
        }
      ]
    });
  }

  renderSellinSelloutChart() {
    if (this.state.commercialTab !== "gap") {
      return;
    }
    const chain = this.state.sellinChain || "walmart";
    const data = this.commercialPayload?.sellin_vs_sellout?.[chain] || {};
    const byMonth = data.by_month || [];
    if (!byMonth.length) {
      return;
    }
    const chart = this.getChart("sellin-sellout");
    if (!chart) {
      return;
    }
    chart.setOption({
      animationDuration: 600,
      grid: { top: 35, right: 20, bottom: 25, left: 35, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value) =>
          `${this.commercialPayload.summary.currency_symbol} ${this.formatMoney(value)}`
      },
      legend: {
        data: ["Sell-in (Facturado)", "Sell-out (Simulado)"],
        textStyle: { color: "#5f6b7a" }
      },
      xAxis: {
        type: "category",
        data: byMonth.map((m) => m.label),
        axisLine: { lineStyle: { color: "#d6deea" } },
        axisLabel: { color: "#5f6b7a" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf2f8" } },
        axisLabel: { color: "#5f6b7a", formatter: (val) => this.formatMoney(val) },
      },
      series: [
        {
          name: "Sell-in (Facturado)",
          type: "bar",
          data: byMonth.map((m) => m.sellin_q),
          color: "#2563eb",
          barMaxWidth: 24,
        },
        {
          name: "Sell-out (Simulado)",
          type: "bar",
          data: byMonth.map((m) => m.sellout_q),
          color: "#16a34a",
          barMaxWidth: 24,
        }
      ]
    });
  }

  renderClientChart() {
    if (
      this.state.commercialTab !== "cliente" ||
      this.getCommercialPanelView("client_main") !== "chart"
    ) {
      return;
    }
    const rows = (this.sortedAllClients || []).slice(0, 12);
    const chart = this.getChart("client-main");
    if (!chart || !rows.length) {
      return;
    }
    const metric = this.activeClientChartMetric;
    const type = this.state.clientChartType || "bar";
    const symbol = this.commercialPayload.summary?.currency_symbol || "$";
    const values = rows.map((row) => Number(row[metric.key] || 0));
    const formatter = (value) =>
      metric.format === "money" ? `${symbol} ${this.formatMoney(value)}` : this.formatCount(value);
    if (type === "pie") {
      chart.setOption(
        {
          tooltip: { trigger: "item", valueFormatter: formatter },
          legend: { type: "scroll", bottom: 0, textStyle: { color: "#5f6b7a", fontSize: 11 } },
          series: [
            {
              name: metric.label,
              type: "pie",
              radius: ["42%", "70%"],
              data: rows.map((row, index) => ({ name: row.name, value: values[index] })),
              label: { show: false },
            },
          ],
        },
        true,
      );
      return;
    }
    chart.setOption(
      {
        animationDuration: 600,
        grid: { top: 24, right: 24, bottom: 50, left: 62, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: formatter },
        xAxis: {
          type: "category",
          data: rows.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 10, interval: 0, rotate: 18, width: 110, overflow: "truncate" },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: metric.format === "money" ? (val) => this.formatMoney(val) : undefined },
        },
        series: [
          {
            name: metric.label,
            type,
            smooth: type === "line",
            data: values,
            barMaxWidth: 30,
            itemStyle: { color: "#1f4e8c", borderRadius: [4, 4, 0, 0] },
            lineStyle: { color: "#1f4e8c", width: 3 },
          },
        ],
      },
      true,
    );
  }

  renderTrendsGrowersChart() {
    this.renderTrendChart("trends-growers", this.sortedGrowers || [], "Crecimiento", "#16a34a");
  }

  renderTrendsDeclinersChart() {
    this.renderTrendChart("trends-decliners", this.sortedDecliners || [], "Caida", "#bd1730");
  }

  renderTrendChart(chartKey, rows, label, color) {
    const panelKey = chartKey === "trends-growers" ? "trends_growers" : "trends_decliners";
    if (
      this.state.commercialTab !== "tendencias" ||
      this.getCommercialPanelView(panelKey) !== "chart"
    ) {
      return;
    }
    const chart = this.getChart(chartKey);
    const data = (rows || []).slice(0, 10);
    if (!chart || !data.length) {
      return;
    }
    chart.setOption(
      {
        animationDuration: 600,
        grid: { top: 22, right: 18, bottom: 42, left: 46, containLabel: true },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (val) => `${val}%` },
        xAxis: {
          type: "category",
          data: data.map((row) => row.name),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisLabel: { color: "#5f6b7a", fontSize: 10, interval: 0, rotate: 18, width: 110, overflow: "truncate" },
        },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf2f8" } }, axisLabel: { color: "#5f6b7a", fontSize: 11, formatter: (val) => `${val}%` } },
        series: [{ name: label, type: "bar", data: data.map((row) => Number(row.trend || 0)), barMaxWidth: 30, itemStyle: { color, borderRadius: [4, 4, 0, 0] } }],
      },
      true,
    );
  }

  renderInsightsMarketBasketChart() {
    if (
      this.state.commercialTab !== "insights" ||
      this.getCommercialPanelView("insights_market_basket") !== "chart"
    ) {
      return;
    }
    const rows = (this.sortedMarketBasket || []).slice(0, 10);
    const chart = this.getChart("insights-market-basket");
    if (!chart || !rows.length) {
      return;
    }
    chart.setOption(
      {
        animationDuration: 600,
        grid: { top: 20, right: 18, bottom: 8, left: 220, containLabel: false },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        xAxis: { type: "value", splitLine: { lineStyle: { color: "#edf2f8" } }, axisLabel: { color: "#5f6b7a" } },
        yAxis: {
          type: "category",
          data: [...rows].reverse().map((row) => `${row.a} + ${row.b}`),
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: "#334155", fontSize: 10, width: 210, overflow: "truncate" },
        },
        series: [{ name: "Lift", type: "bar", data: [...rows].reverse().map((row) => Number(row.lift || 0)), barMaxWidth: 22, itemStyle: { color: "#1f4e8c", borderRadius: [0, 4, 4, 0] } }],
      },
      true,
    );
  }

  renderInsightsLtvChart() {
    if (
      this.state.commercialTab !== "insights" ||
      this.getCommercialPanelView("insights_ltv") !== "chart"
    ) {
      return;
    }
    const rows = (this.sortedLtvForecast || []).slice(0, 8);
    const chart = this.getChart("insights-ltv");
    if (!chart || !rows.length) {
      return;
    }
    const months = this.commercialPayload.ltv_forecast?.project_months || ["M+1", "M+2", "M+3"];
    const symbol = this.commercialPayload.summary?.currency_symbol || "$";
    chart.setOption(
      {
        animationDuration: 600,
        tooltip: { trigger: "axis", valueFormatter: (val) => `${symbol} ${this.formatMoney(val)}` },
        legend: { type: "scroll", bottom: 0, textStyle: { color: "#5f6b7a", fontSize: 11 } },
        grid: { top: 24, right: 20, bottom: 56, left: 64, containLabel: true },
        xAxis: { type: "category", data: months, axisTick: { show: false }, axisLine: { lineStyle: { color: "#d6deea" } }, axisLabel: { color: "#5f6b7a" } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: "#edf2f8" } }, axisLabel: { color: "#5f6b7a", formatter: (val) => this.formatMoney(val) } },
        series: rows.map((row) => ({ name: row.client, type: "line", smooth: true, data: row.forecast || [], symbolSize: 5 })),
      },
      true,
    );
  }

  setProductChartType(type) {
    this.state.productChartType = type;
    this.queueChartRender();
  }

  renderProductChart() {
    if (
      this.state.commercialTab !== "producto" ||
      this.getCommercialPanelView("product_main") !== "chart"
    ) {
      return;
    }
    const products = this.commercialPayload?.all_products || [];
    if (!products.length) {
      return;
    }
    const chart = this.getChart("product-chart");
    if (!chart) {
      return;
    }
    // Take top 10 products
    const top10 = products.slice(0, 10);
    const chartType = this.state.productChartType || "bar";
    const metric = this.activeProductChartMetric;
    const symbol = this.commercialPayload.summary?.currency_symbol || "$";
    const valueFormatter = (value) =>
      metric.format === "money" ? `${symbol} ${this.formatMoney(value)}` : this.formatCount(value);

    if (chartType === "pie") {
      const pieData = top10.map((p) => ({
        name: p.name,
        value: Number(p[metric.key] || 0),
      }));
      chart.setOption({
        animationDuration: 600,
        tooltip: {
          trigger: "item",
          formatter: ({ name, value, percent }) =>
            `${name}<br/>${valueFormatter(value)}<br/>${percent}% del Top 10`,
        },
        legend: {
          orient: "vertical",
          right: 10,
          top: "center",
          type: "scroll",
          textStyle: { color: "#5f6b7a", fontSize: 11 },
        },
        series: [
          {
            type: "pie",
            radius: ["40%", "70%"],
            center: ["40%", "50%"],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: "#ffffff", borderWidth: 2 },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 6 },
            data: pieData,
            color: ["#bd1730", "#1f4e8c", "#16a34a", "#eab308", "#64748b", "#3b82f6", "#10b981", "#8b5cf6", "#f43f5e", "#f59e0b"]
          }
        ]
      }, true);
    } else {
      // Bar or Line
      const categories = top10.map((p) => p.name);
      const data = top10.map((p) => Number(p[metric.key] || 0));

      chart.setOption({
        animationDuration: 600,
        grid: { top: 35, right: 30, bottom: 40, left: 55, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter,
        },
        xAxis: {
          type: "category",
          data: categories,
          axisLine: { lineStyle: { color: "#d6deea" } },
          axisTick: { show: false },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 10,
            interval: 0,
            rotate: 20,
            width: 100,
            overflow: "truncate"
          },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 10,
            formatter: metric.format === "money" ? (val) => this.formatMoney(val) : undefined
          },
        },
        series: [
          {
            name: metric.label,
            type: chartType,
            data: data,
            barMaxWidth: 30,
            smooth: chartType === "line" ? 0.25 : false,
            symbol: chartType === "line" ? "circle" : "none",
            symbolSize: 6,
            itemStyle: {
              color: "#bd1730",
              borderRadius: chartType === "bar" ? [4, 4, 0, 0] : [0, 0, 0, 0]
            },
            areaStyle: chartType === "line" ? {
              color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(189, 23, 48, 0.2)" },
                { offset: 1, color: "rgba(189, 23, 48, 0.02)" },
              ]),
            } : null
          }
        ]
      }, true);
    }
  }
}

ZrnAnalyticsHubAction.template = "zrn_analitics.HubAction";
ZrnAnalyticsHubAction.components = {
  Many2XAutocomplete,
  SelectMenu,
  TagsList,
  ZrnRelationalMultiSelect,
  ZrnRelationalSingleSelect,
};

registry.category("actions").add("zrn_analitics.hubs", ZrnAnalyticsHubAction);
