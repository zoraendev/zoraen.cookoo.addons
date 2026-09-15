/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onPatched, onWillUnmount, useState } from "@odoo/owl";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";

const DATASETS = {
  channelRevenue: {
    label: "Resumen por canal",
    variants: [
      {
        key: "channel_income",
        label: "Ingresos del canal",
        chartLabel: "Ingresos por canal",
        metrics: [
          { key: "revenue", label: "Ingresos", format: "money" },
          { key: "margin", label: "Margen", format: "money" },
          { key: "ticket", label: "Ticket promedio", format: "money" },
        ],
        columns: [["Canal", "name"], ["Ingresos", "revenue", "money"], ["Costo teórico", "cost", "money"], ["Margen", "margin", "money"], ["Margen %", "margin_pct", "percent"], ["Pedidos", "orders"], ["Unidades", "units"], ["Ticket", "ticket", "money"]],
      },
      {
        key: "channel_cost",
        label: "Egresos del canal",
        chartLabel: "Costo teórico por canal",
        metrics: [
          { key: "cost", label: "Costo teórico", format: "money" },
          { key: "margin", label: "Margen", format: "money" },
          { key: "margin_pct", label: "Margen %", format: "percent" },
        ],
        columns: [["Canal", "name"], ["Costo teórico", "cost", "money"], ["Ingresos", "revenue", "money"], ["Margen", "margin", "money"], ["Margen %", "margin_pct", "percent"], ["SKUs", "skus"], ["Unidades", "units"]],
      },
      {
        key: "channel_production",
        label: "Fabricación / demanda del canal",
        chartLabel: "Unidades por canal",
        metrics: [
          { key: "units", label: "Unidades" },
          { key: "skus", label: "SKUs vendidos" },
          { key: "orders", label: "Pedidos" },
        ],
        columns: [["Canal", "name"], ["Unidades", "units"], ["SKUs vendidos", "skus"], ["Pedidos", "orders"], ["Ingresos", "revenue", "money"], ["Costo teórico", "cost", "money"]],
      },
    ],
  },
  channelCategoryRevenue: {
    label: "Categorías de canal",
    variants: [
      {
        key: "channel_category_income",
        label: "Ingresos por categoría de canal",
        chartLabel: "Ingresos por categoría de canal",
        metrics: [
          { key: "revenue", label: "Ingresos", format: "money" },
          { key: "ticket", label: "Ticket promedio", format: "money" },
          { key: "orders", label: "Pedidos" },
        ],
        columns: [["Categoría", "category"], ["Canal", "channel"], ["Ingresos", "revenue", "money"], ["Pedidos", "orders"], ["Unidades", "units"], ["Ticket", "ticket", "money"]],
      },
      {
        key: "channel_category_cost",
        label: "Egresos por categoría de canal",
        chartLabel: "Costo teórico por categoría",
        metrics: [
          { key: "cost", label: "Costo teórico", format: "money" },
          { key: "margin", label: "Margen", format: "money" },
          { key: "margin_pct", label: "Margen %", format: "percent" },
        ],
        columns: [["Categoría", "category"], ["Canal", "channel"], ["Costo teórico", "cost", "money"], ["Ingresos", "revenue", "money"], ["Margen", "margin", "money"], ["Margen %", "margin_pct", "percent"]],
      },
      {
        key: "channel_category_volume",
        label: "Volumen por categoría de canal",
        chartLabel: "Unidades por categoría",
        metrics: [
          { key: "units", label: "Unidades" },
          { key: "skus", label: "SKUs vendidos" },
          { key: "orders", label: "Pedidos" },
        ],
        columns: [["Categoría", "category"], ["Canal", "channel"], ["Unidades", "units"], ["SKUs vendidos", "skus"], ["Pedidos", "orders"], ["Ingresos", "revenue", "money"]],
      },
    ],
  },
  categoryProducts: {
    label: "Categorías de marca",
    variants: [
      {
        key: "brand_category_portfolio",
        label: "Portafolio por categoría de marca",
        chartLabel: "Productos por categoría",
        metrics: [{ key: "products", label: "Productos" }],
        columns: [["Categoría", "category"], ["Marca", "brand"], ["Productos", "products"], ["SKUs vendidos", "skus"]],
      },
      {
        key: "brand_category_sales",
        label: "Ingresos por categoría de marca",
        chartLabel: "Ingresos por categoría de marca",
        metrics: [
          { key: "revenue", label: "Ingresos", format: "money" },
          { key: "units", label: "Unidades" },
          { key: "orders", label: "Pedidos" },
        ],
        columns: [["Categoría", "category"], ["Marca", "brand"], ["Ingresos", "revenue", "money"], ["Unidades", "units"], ["Pedidos", "orders"], ["Productos", "products"]],
      },
      {
        key: "brand_category_margin",
        label: "Margen por categoría de marca",
        chartLabel: "Margen por categoría de marca",
        metrics: [
          { key: "margin", label: "Margen", format: "money" },
          { key: "margin_pct", label: "Margen %", format: "percent" },
          { key: "cost", label: "Costo teórico", format: "money" },
        ],
        columns: [["Categoría", "category"], ["Marca", "brand"], ["Ingresos", "revenue", "money"], ["Costo teórico", "cost", "money"], ["Margen", "margin", "money"], ["Margen %", "margin_pct", "percent"]],
      },
    ],
  },
  brandProducts: {
    label: "Marcas",
    variants: [
      {
        key: "brand_portfolio",
        label: "Portafolio por marca",
        chartLabel: "Productos por marca",
        metrics: [
          { key: "products", label: "Productos" },
          { key: "categories", label: "Categorías" },
        ],
        columns: [["Marca", "name"], ["Categorías", "categories"], ["Productos", "products"], ["SKUs vendidos", "skus"]],
      },
      {
        key: "brand_sales",
        label: "Ingresos por marca",
        chartLabel: "Ingresos por marca",
        metrics: [
          { key: "revenue", label: "Ingresos", format: "money" },
          { key: "units", label: "Unidades" },
          { key: "orders", label: "Pedidos" },
        ],
        columns: [["Marca", "name"], ["Ingresos", "revenue", "money"], ["Unidades", "units"], ["Pedidos", "orders"], ["Categorías", "categories"], ["Productos", "products"]],
      },
      {
        key: "brand_margin",
        label: "Margen por marca",
        chartLabel: "Margen por marca",
        metrics: [
          { key: "margin", label: "Margen", format: "money" },
          { key: "margin_pct", label: "Margen %", format: "percent" },
          { key: "cost", label: "Costo teórico", format: "money" },
        ],
        columns: [["Marca", "name"], ["Ingresos", "revenue", "money"], ["Costo teórico", "cost", "money"], ["Margen", "margin", "money"], ["Margen %", "margin_pct", "percent"], ["Productos", "products"]],
      },
    ],
  },
};

const COLORS = ["#315f98", "#4a78ad", "#6f5d9a", "#2f8f6f", "#c58b2b", "#9a5f6d"];

class ZrnCommercialHomeDashboardController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this.payload = null;
    this.currentResId = null;
    this.charts = new Map();
    this._tableSort = {};
    this._panelConfig = {};
    this._exportPanel = null;
    this._exportOptions = null;
    this._exportMenuEl = null;
    this._rootClickHandler = (ev) => this.handleRootClick(ev);
    this._rootChangeHandler = (ev) => this.handleRootChange(ev);
    this.state = useState({
      panelViews: Object.fromEntries(Object.keys(DATASETS).map((key) => [key, "table"])),
      chartConfig: null,
      exportMenu: null,
    });
    this.resizeCharts = () => this.charts.forEach((chart) => chart.resize());

    onMounted(() => {
      window.addEventListener("resize", this.resizeCharts);
      this.rootRef.el?.addEventListener("click", this._rootClickHandler);
      this.rootRef.el?.addEventListener("change", this._rootChangeHandler);
      this.loadDashboard();
    });
    onPatched(() => this.loadDashboard());
    onWillUnmount(() => {
      window.removeEventListener("resize", this.resizeCharts);
      this.rootRef.el?.removeEventListener("click", this._rootClickHandler);
      this.rootRef.el?.removeEventListener("change", this._rootChangeHandler);
      this.charts.forEach((chart) => chart.dispose());
      this.charts.clear();
      this.closeExportMenu();
    });
  }

  async loadDashboard() {
    const resId = this.model?.root?.resId;
    if (!resId || !window.echarts) {
      return;
    }
    if (this.currentResId !== resId || !this.payload) {
      this.currentResId = resId;
      this.payload = await this.orm.call("zrn_commercial.home", "get_dashboard_payload", [[resId]]);
    }
    window.requestAnimationFrame(() => this.renderCharts());
  }

  handleRootClick(ev) {
    const sortButton = ev.target.closest?.("[data-zrn-commercial-sort]");
    if (sortButton) {
      ev.preventDefault();
      ev.stopPropagation();
      const key = sortButton.dataset.zrnCommercialSort;
      const field = sortButton.dataset.zrnCommercialSortField;
      const current = this._tableSort[key];
      this._tableSort[key] = {
        field,
        direction: current?.field === field && current.direction === "asc" ? "desc" : "asc",
      };
      this.renderTables();
      return;
    }
    const viewButton = ev.target.closest?.("[data-zrn-commercial-view]");
    if (viewButton) {
      ev.preventDefault();
      ev.stopPropagation();
      const [key, view] = viewButton.dataset.zrnCommercialView.split(":");
      this.setPanelView(key, view);
      return;
    }
    const configButton = ev.target.closest?.("[data-zrn-commercial-config]");
    if (configButton) {
      ev.preventDefault();
      ev.stopPropagation();
      this.openChartConfig(configButton.dataset.zrnCommercialConfig);
      this.renderConfigModal();
      return;
    }
    const exportButton = ev.target.closest?.("[data-zrn-commercial-export]");
    if (exportButton) {
      ev.preventDefault();
      ev.stopPropagation();
      this.openExportMenu(ev, exportButton.dataset.zrnCommercialExport, exportButton);
      return;
    }
    if (ev.target.closest?.("[data-zrn-commercial-config-close]")) {
      ev.preventDefault();
      ev.stopPropagation();
      this.closeChartConfig();
      return;
    }
    if (ev.target.closest?.("[data-zrn-commercial-config-apply]")) {
      ev.preventDefault();
      ev.stopPropagation();
      this.applyChartConfig();
    }
  }

  handleRootChange(ev) {
    const field = ev.target.closest?.("[data-zrn-commercial-config-field]");
    if (field) {
      this.updateChartConfig(field.dataset.zrnCommercialConfigField, field.value);
      return;
    }
  }

  renderConfigModal() {
    const modal = this.rootRef.el?.querySelector("[data-zrn-commercial-config-modal]");
    const config = this.state.chartConfig;
    if (!modal || !config) {
      return;
    }
    modal.classList.remove("d-none");
    const definition = DATASETS[config.key];
    const variant = this.getVariant(config.key, config.variant);
    modal.querySelector('[data-zrn-commercial-config-field="variant"]').innerHTML = definition.variants
      .map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
    modal.querySelector('[data-zrn-commercial-config-field="variant"]').value = variant.key;
    modal.querySelector('[data-zrn-commercial-config-field="metric"]').innerHTML = variant.metrics
      .map((metric) => `<option value="${metric.key}">${metric.label}</option>`).join("");
    modal.querySelector('[data-zrn-commercial-config-field="metric"]').value = config.metric;
    modal.querySelector('[data-zrn-commercial-config-field="type"]').value = config.type;
    modal.querySelector('[data-zrn-commercial-config-field="limit"]').value = config.limit;
    const channelWrap = modal.querySelector("[data-zrn-commercial-channel-filter-wrap]");
    channelWrap.classList.toggle("d-none", config.key !== "channelCategoryRevenue");
    if (config.key === "channelCategoryRevenue") {
      const channels = [...new Set(this.getDataset(config.key).rows.map((row) => row.channel))].sort();
      const select = modal.querySelector('[data-zrn-commercial-config-field="channel"]');
      select.innerHTML = `<option value="all">Todos los canales</option>${channels.map((channel) => `<option value="${this.escapeHtml(channel)}">${this.escapeHtml(channel)}</option>`).join("")}`;
      select.value = config.channel || "all";
    }
  }

  getTableRows(key) {
    const rows = this.getRowsForDataset(key);
    const sort = this._tableSort[key];
    if (!sort) {
      return rows;
    }
    rows.sort((left, right) => {
      const leftNumber = Number(left[sort.field]);
      const rightNumber = Number(right[sort.field]);
      let result;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        result = leftNumber - rightNumber;
      } else {
        result = String(left[sort.field] ?? "").localeCompare(
          String(right[sort.field] ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      }
      return sort.direction === "desc" ? -result : result;
    });
    return rows;
  }

  getRowsForDataset(key) {
    const rows = [...(this.getDataset(key).rows || [])];
    const config = this.getConfig(key);
    if (key === "channelCategoryRevenue" && config.channel !== "all") {
      return rows.filter((row) => row.channel === config.channel);
    }
    return rows;
  }

  renderTables() {
    Object.keys(DATASETS).forEach((key) => {
      const mount = this.rootRef.el?.querySelector(`[data-zrn-commercial-table="${key}"]`);
      if (!mount) {
        return;
      }
      const rows = this.getTableRows(key);
      const columns = this.getVariant(key).columns;
      const sort = this._tableSort[key];
      const head = columns.map(([label, field]) => {
        const active = sort?.field === field;
        const icon = active ? (sort.direction === "asc" ? "fa-sort-asc" : "fa-sort-desc") : "fa-sort";
        return `<th><span class="zrn_commercial_sort_header" data-zrn-commercial-sort="${key}" data-zrn-commercial-sort-field="${field}" role="button" tabindex="0">${label}<i class="fa ${icon}" aria-hidden="true"></i></span></th>`;
      }).join("");
      const body = rows.length
        ? rows.map((row) => `<tr>${columns.map(([, field, format]) => `<td>${this.formatCell(row[field], format)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${columns.length}" class="zrn_commercial_table_empty">Sin datos para mostrar.</td></tr>`;
      mount.innerHTML = `<div class="zrn_commercial_table_surface"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    });
  }

  getDataset(key) {
    return this.payload?.[key] || { labels: [], values: [], rows: [], series: [] };
  }

  getPanelView(key) {
    return this.state.panelViews[key] || "table";
  }

  getVariant(key, variantKey = null) {
    const definition = DATASETS[key];
    const config = this.getConfig(key);
    const selectedKey = variantKey || config.variant;
    return definition.variants.find((variant) => variant.key === selectedKey) || definition.variants[0];
  }

  setPanelView(key, view) {
    this.state.panelViews[key] = view;
    this.closeChartConfig();
    this.closeExportMenu();
    requestAnimationFrame(() => this.renderCharts());
  }

  getConfig(key) {
    if (this.state.chartConfig?.key === key) {
      return this.state.chartConfig;
    }
    if (this._panelConfig[key]) {
      return this._panelConfig[key];
    }
    const variant = DATASETS[key].variants[0];
    return { key, variant: variant.key, metric: variant.metrics[0].key, type: "bar", limit: 10, channel: "all" };
  }

  openChartConfig(key) {
    this.state.chartConfig = { ...this.getConfig(key) };
  }

  closeChartConfig() {
    this.state.chartConfig = null;
    this.rootRef.el?.querySelector("[data-zrn-commercial-config-modal]")?.classList.add("d-none");
  }

  updateChartConfig(field, value) {
    if (!this.state.chartConfig) {
      return;
    }
    if (field === "variant") {
      const variant = this.getVariant(this.state.chartConfig.key, value);
      this.state.chartConfig.variant = variant.key;
      this.state.chartConfig.metric = variant.metrics[0].key;
      this.renderConfigModal();
      return;
    }
    this.state.chartConfig[field] = field === "limit"
      ? Math.max(1, Math.min(30, Number(value) || 10))
      : value;
  }

  applyChartConfig() {
    if (!this.state.chartConfig) {
      return;
    }
    this._panelConfig[this.state.chartConfig.key] = { ...this.state.chartConfig };
    this.state.panelViews[this.state.chartConfig.key] = "chart";
    this.closeChartConfig();
    requestAnimationFrame(() => this.renderCharts());
  }

  getRowsForChart(key) {
    const config = this.getConfig(key);
    const rows = this.getRowsForDataset(key);
    rows.sort((left, right) => Number(right[config.metric] || 0) - Number(left[config.metric] || 0));
    return rows.slice(0, config.limit || 10);
  }

  getChartData(key) {
    const config = this.getConfig(key);
    const rows = this.getRowsForChart(key);
    return {
      labels: rows.map((row) => this.getChartLabel(key, row, config)),
      values: rows.map((row) => Number(row[config.metric] || 0)),
    };
  }

  getChartLabel(key, row, config) {
    if (key === "channelCategoryRevenue" && config.channel === "all") {
      return `${row.channel || "Sin canal"} / ${row.category || row.name || "Sin categoria"}`;
    }
    return row.name || row.category || row.brand || "Sin nombre";
  }

  renderCharts() {
    this.renderTables();
    this.updateActionStates();
    if (this.state.chartConfig) {
      this.renderConfigModal();
    }
    Object.keys(DATASETS).forEach((key) => {
      const chartEl = this.rootRef.el?.querySelector(`[data-zrn-commercial-chart="${key}"]`);
      const tableMount = this.rootRef.el?.querySelector(`[data-zrn-commercial-table="${key}"]`);
      const chartVisible = this.getPanelView(key) === "chart";
      chartEl?.classList.toggle("d-none", !chartVisible);
      tableMount?.classList.toggle("d-none", chartVisible);
      if (!chartEl || !chartVisible) {
        this.disposeChart(key);
        return;
      }
      const data = this.getChartData(key);
      const hasData = data.values.some((value) => value > 0);
      this.toggleEmpty(key, !hasData);
      if (!hasData) {
        this.disposeChart(key);
        return;
      }
      const chart = this.getChart(key, chartEl);
      chart.setOption(this.buildChartOption(key, data), true);
      chart.resize();
    });
  }

  updateActionStates() {
    Object.keys(DATASETS).forEach((key) => {
      const view = this.getPanelView(key);
      this.rootRef.el?.querySelectorAll(`[data-zrn-commercial-view^="${key}:"]`).forEach((button) => {
        button.classList.toggle("is-active", button.dataset.zrnCommercialView === `${key}:${view}`);
      });
      this.rootRef.el?.querySelector(`[data-zrn-commercial-config="${key}"]`)?.classList.toggle(
        "is-active",
        Boolean(this._panelConfig[key]),
      );
    });
  }

  buildChartOption(key, data) {
    const config = this.getConfig(key);
    const variant = this.getVariant(key);
    const currency = this.payload?.currency || "";
    const metric = variant.metrics.find((item) => item.key === config.metric);
    const formatValue = (value) => metric?.format === "money"
      ? `${currency} ${Number(value).toLocaleString()}`
      : metric?.format === "percent"
        ? `${Number(value || 0).toLocaleString()}%`
      : Number(value).toLocaleString();
    if (config.type === "pie") {
      return {
        color: COLORS,
        tooltip: { trigger: "item", formatter: (item) => `${item.name}<br/>${formatValue(item.value)}` },
        legend: { bottom: 0, left: "center", type: "scroll" },
        series: [{ type: "pie", radius: ["42%", "70%"], data: data.labels.map((label, index) => ({ name: label, value: data.values[index] })) }],
      };
    }
    return {
      color: [COLORS[0]],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: formatValue },
      grid: { top: 18, right: 24, bottom: 54, left: 54, containLabel: true },
      xAxis: { type: "category", data: data.labels, axisLabel: { interval: 0, rotate: data.labels.length > 4 ? 24 : 0 } },
      yAxis: { type: "value", minInterval: 1 },
      series: [{ name: variant.chartLabel || variant.label || DATASETS[key].label, type: config.type === "line" ? "line" : "bar", smooth: config.type === "line", barMaxWidth: 28, data: data.values }],
    };
  }

  getChart(key, chartEl) {
    if (!this.charts.has(key)) {
      this.charts.set(key, window.echarts.init(chartEl));
    }
    return this.charts.get(key);
  }

  disposeChart(key) {
    const chart = this.charts.get(key);
    if (chart) {
      chart.dispose();
      this.charts.delete(key);
    }
  }

  toggleEmpty(key, isEmpty) {
    const chartEl = this.rootRef.el?.querySelector(`[data-zrn-commercial-chart="${key}"]`);
    const emptyEl = this.rootRef.el?.querySelector(`[data-zrn-commercial-chart-empty="${key}"]`);
    chartEl?.classList.toggle("d-none", isEmpty);
    emptyEl?.classList.toggle("d-none", !isEmpty);
  }

  openExportMenu(ev, key, button) {
    ev.stopPropagation();
    const panel = button.closest(".zrn_commercial_panel");
    if (!panel) {
      return;
    }
    const chart = panel.querySelector(`[data-zrn-commercial-chart="${key}"]`);
    const rect = button.getBoundingClientRect();
    const hasChart = chart && this.isVisible(chart);
    this._exportPanel = panel;
    this._exportOptions = { key, filename: `zrn_commercial_${key}` };
    const dataOptions = [
      { key: "xls", label: "Excel (.xls)", icon: "fa-file-excel-o" },
      { key: "xml", label: "XML", icon: "fa-code" },
      { key: "csv", label: "CSV", icon: "fa-file-text-o" },
      { key: "json", label: "JSON", icon: "fa-file-code-o" },
    ];
    this.state.exportMenu = {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 188)),
      top: Math.min(rect.bottom + 4, window.innerHeight - 180),
      options: hasChart
        ? [{ key: "png", label: "Imagen PNG", icon: "fa-image" }, ...dataOptions]
        : dataOptions,
    };
    this.renderExportMenu();
  }

  closeExportMenu() {
    this.state.exportMenu = null;
    this._exportMenuEl?.remove();
    this._exportMenuEl = null;
    this._exportPanel = null;
    this._exportOptions = null;
  }

  renderExportMenu() {
    this._exportMenuEl?.remove();
    const menu = document.createElement("div");
    menu.className = "zrn_commercial_export_menu_wrap";
    menu.innerHTML = `<div class="zrn_commercial_export_backdrop"></div><div class="zrn_commercial_export_menu" style="left: ${this.state.exportMenu.left}px; top: ${this.state.exportMenu.top}px;"><div class="zrn_commercial_export_menu_title">Exportar como</div>${this.state.exportMenu.options.map((option) => `<button type="button" class="btn zrn_commercial_export_menu_item" data-format="${option.key}"><i class="fa ${option.icon}"></i><span>${option.label}</span></button>`).join("")}</div>`;
    menu.querySelector(".zrn_commercial_export_backdrop").addEventListener("click", () => this.closeExportMenu());
    menu.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => this.selectExportFormat(button.dataset.format)));
    document.body.appendChild(menu);
    this._exportMenuEl = menu;
  }

  selectExportFormat(format) {
    const panel = this._exportPanel;
    const options = this._exportOptions;
    this.closeExportMenu();
    if (!panel || !options) {
      return;
    }
    if (format === "png") {
      const chart = this.charts.get(options.key);
      if (chart) {
        const link = document.createElement("a");
        link.href = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
        link.download = `${options.filename}.png`;
        link.click();
      }
      return;
    }
    const table = panel.querySelector("table");
    if (!table) {
      return;
    }
    const rows = Array.from(table.querySelectorAll("tr")).map((row) => Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent.trim()));
    const title = this.getVariant(options.key).label || DATASETS[options.key].label;
    const content = format === "xls" ? this.tableToExcel(title, rows) : format === "csv" ? rows.map((row) => row.map((cell) => this.csvCell(cell)).join(",")).join("\r\n") : format === "json" ? this.tableToJson(rows) : this.tableToXml(title, rows);
    const type = format === "xls" ? "application/vnd.ms-excel" : format === "csv" ? "text/csv;charset=utf-8" : format === "json" ? "application/json;charset=utf-8" : "application/xml;charset=utf-8";
    this.downloadText(options.filename, content, type, format);
  }

  csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  tableToJson(rows) {
    const [headers = [], ...dataRows] = rows;
    return JSON.stringify(dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))), null, 2);
  }

  tableToExcel(title, rows) {
    const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${this.escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${this.escapeHtml(title)}</title></head><body><h2>${this.escapeHtml(title)}</h2><table border="1">${body}</table></body></html>`;
  }

  tableToXml(title, rows) {
    const body = rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${this.escapeHtml(cell)}</Data></Cell>`).join("")}</Row>`).join("");
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${this.escapeHtml(title).slice(0, 31)}"><Table>${body}</Table></Worksheet></Workbook>`;
  }

  downloadText(filename, content, type, extension) {
    const blob = new Blob(["\ufeff", content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  formatCell(value, format = null) {
    const number = Number(value || 0);
    if (format === "money") {
      return `${this.escapeHtml(this.payload?.currency || "")} ${number.toLocaleString()}`;
    }
    if (format === "percent") {
      return `${number.toLocaleString()}%`;
    }
    return Number.isFinite(Number(value)) && value !== ""
      ? Number(value).toLocaleString()
      : this.escapeHtml(value || "");
  }

  escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  isVisible(node) {
    return Boolean(node && node.offsetParent !== null && node.getClientRects().length);
  }
}

ZrnCommercialHomeDashboardController.template = "web.FormView";

registry.category("views").add("zrn_commercial_home_dashboard", {
  ...formView,
  Controller: ZrnCommercialHomeDashboardController,
});
