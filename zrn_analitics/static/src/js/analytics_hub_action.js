/** @odoo-module **/

import { TagsList } from "@web/core/tags_list/tags_list";
import { SelectMenu } from "@web/core/select_menu/select_menu";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
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
  { key: "alertas", label: "Alertas", icon: "fa-bell-o" },
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
  { key: "alertas", label: "Alertas", icon: "fa-bell-o" },
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
    return {};
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
    this.orm = useService("orm");
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
      hubMenuOpen: false,
      overviewRevenueChartType: "line",
      overviewBrandMixChartType: "doughnut",
      overviewCustomersChartType: "bar",
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
    this.clearAnalyticsDetailModals();
    await this.loadFinancialPayload();
    this.queueChartRender();
  }

  async setOperationsTab(tabKey) {
    this.state.operationsTab = tabKey;
    this.closeCommercialSidebar();
    this.clearAnalyticsDetailModals();
    await this.loadOperationsPayload();
    this.queueChartRender();
  }

  async setPdvTab(tabKey) {
    this.state.pdvTab = tabKey;
    this.closePdvSidebar();
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
  }

  async applyOperationsFilters() {
    await this.loadOperationsPayload(true);
  }

  async applyPdvFilters() {
    await this.loadPdvPayload(true);
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
  }

  async clearOperationsFilters() {
    this.state.operationsFilters = cloneOperationsDefaultFilters();
    await this.loadOperationsPayload(true);
  }

  async clearPdvFilters() {
    this.state.pdvFilters = cloneDefaultFilters();
    await this.loadPdvPayload(true);
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
    if (row?.id) {
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
      { key: "champion", name: "Campeon", emoji: "" },
      { key: "loyal", name: "Leal", emoji: "" },
      { key: "cant_lose", name: "No perderlo", emoji: "" },
      { key: "at_risk", name: "En riesgo", emoji: "" },
      { key: "promising", name: "Prometedor", emoji: "" },
      { key: "need_attention", name: "Atender", emoji: "" },
      { key: "new", name: "Nuevo", emoji: "" },
      { key: "hibernating", name: "Hibernando", emoji: "" },
      { key: "sporadic", name: "Esporadico", emoji: "" },
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
    return `background: rgba(31, 78, 140, ${opacity});`;
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
      };
    });

    const unit = {
      key: "portfolio_general",
      name: "Portafolio Comercial",
      color: "#1f4e8c",
      brands,
      revenue: totalRevenue,
      mix_percentage: totalRevenue ? 100 : 0,
      sku_count: brands.reduce((sum, brand) => sum + Number(brand.sku_count || 0), 0),
      brand_count: brands.length,
      billed_lines: 0,
      margin_amount: 0,
      margin_pct: 0,
    };

    const drillRows = [
      {
        key: unit.key,
        ancestor_keys: [],
        level: "unit",
        label: unit.name,
        revenue: unit.revenue,
        mix_percentage: unit.mix_percentage,
        units_sold: 0,
        billed_lines: unit.billed_lines,
        sku_count: unit.sku_count,
        margin_amount: 0,
        margin_pct: 0,
        color: unit.color,
        detail: null,
      },
    ];

    brands.forEach((brand) => {
      drillRows.push({
        key: brand.key,
        resId: brand.resId,
        ancestor_keys: [unit.key],
        level: "brand",
        label: brand.name,
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
          label: line.name,
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
            label: sku.name,
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

    return {
      hasBrands: true,
      hasRevenue: totalRevenue > 0,
      currencySymbol,
      totalRevenue,
      units: [unit],
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
        this.renderPortfolioUnitsChart();
        this.renderPortfolioBrandsChart();
        this.renderCoverageChannelChart();
        this.renderCoverageSkuChart();
        this.renderRfmParetoChart();
        this.renderInsightsCadenceChart();
        this.renderSellinSelloutChart();
        this.renderProductChart();
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
        grid: { top: 18, right: 20, bottom: 30, left: 24, containLabel: true },
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
            type: "bar",
            data: rows.map((row) => Number(row.active || 0)),
            itemStyle: { color: "#1f4e8c", borderRadius: [6, 6, 0, 0] },
          },
          {
            name: "Red total",
            type: "bar",
            data: rows.map((row) => Number(row.network_total || 0)),
            itemStyle: { color: "#a9c7eb", borderRadius: [6, 6, 0, 0] },
          },
        ],
      },
      true,
    );
  }

  renderCoverageSkuChart() {
    if (this.state.commercialTab !== "cobertura") {
      return;
    }
    const rows = (this.coveragePayload.sku_distribution || []).slice(0, 8);
    if (!rows.length) {
      return;
    }
    const chart = this.getChart("coverage-sku");
    if (!chart) {
      return;
    }
    const reversed = [...rows].reverse();
    chart.setOption(
      {
        animationDuration: 650,
        grid: { top: 8, right: 16, bottom: 8, left: 180, containLabel: false },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
        },
        xAxis: {
          type: "value",
          max: 100,
          splitLine: { lineStyle: { color: "#edf2f8" } },
          axisLabel: {
            color: "#5f6b7a",
            fontSize: 11,
            formatter: (value) => `${value}%`,
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
            type: "bar",
            data: reversed.map((row) => Number(row.pdv_pct || 0)),
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
      legend: { data: ["Actual Q", "Proyectado Q"], textStyle: { color: "#5f6b7a", fontSize: 11 } },
      grid: { top: 28, right: 20, bottom: 26, left: 24, containLabel: true },
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
          symbolSize: 8,
          data: rows.map((item) => Number(item.projected_revenue || 0)),
          lineStyle: { color: "#bd1730", width: 3 },
          itemStyle: { color: "#bd1730" },
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

  setProductChartType(type) {
    this.state.productChartType = type;
    this.queueChartRender();
  }

  renderProductChart() {
    if (this.state.commercialTab !== "producto") {
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
    const symbol = this.commercialPayload.summary?.currency_symbol || "$";

    if (chartType === "pie") {
      const pieData = top10.map((p) => ({
        name: p.name,
        value: p.rev,
      }));
      chart.setOption({
        animationDuration: 600,
        tooltip: {
          trigger: "item",
          formatter: ({ name, value, percent }) =>
            `${name}<br/>${symbol} ${this.formatMoney(value)}<br/>${percent}% del Top 10`,
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
      const data = top10.map((p) => p.rev);

      chart.setOption({
        animationDuration: 600,
        grid: { top: 35, right: 30, bottom: 40, left: 55, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (val) => `${symbol} ${this.formatMoney(val)}`
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
            formatter: (val) => this.formatMoney(val)
          },
        },
        series: [
          {
            name: "Revenue",
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
