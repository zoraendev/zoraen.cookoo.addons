/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";

const HOME_METRICS = [
  { key: "orders_generated", label: "Ordenes generadas" },
  { key: "orders_completed", label: "Ordenes finalizadas" },
  { key: "progress", label: "Avance %" },
  { key: "lines", label: "Lineas" },
];

class ZrnPlanningFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this._chartPayload = null;
    this._chartInstances = new Map();
    this._homePanelViews = { production: "table", supply: "table" };
    this._homeConfig = {};
    this._homeExportPanel = null;
    this._homeExportOptions = null;
    this._homeExportMenu = null;
    this._homeChartResizeHandler = () => this.resizeHomeCharts();
    this._boundHomeClick = (event) => this.onHomeClick(event);
    this._boundFilterClick = (event) => this.onPlanningFilterClick(event);
    this._boundReconciliationHeaderClick = (event) => this.onReconciliationHeaderClick(event);
    this._currentHomeResId = null;

    onMounted(() => {
      if (this.isPlanningHome) {
        window.addEventListener("resize", this._homeChartResizeHandler);
        this.rootRef.el?.addEventListener("click", this._boundHomeClick);
        this.loadAndRenderHomeCharts();
      }
      if (this.isPlanningFilter) this.rootRef.el?.addEventListener("click", this._boundFilterClick);
      if (this.isInventoryReconciliation) {
        this.rootRef.el?.addEventListener("click", this._boundReconciliationHeaderClick);
        this.renderSelectAllHeaderCheckbox();
        this._reconciliationCheckboxInterval = setInterval(() => {
          if (this.rootRef.el?.querySelector("th[data-name='is_selected']")) {
            this.renderSelectAllHeaderCheckbox();
          }
        }, 100);
      }
    });

    onPatched(() => {
      if (this.isPlanningHome) this.loadAndRenderHomeCharts();
      if (this.isInventoryReconciliation) this.renderSelectAllHeaderCheckbox();
    });

    onWillUnmount(() => {
      if (this.isPlanningHome) {
        window.removeEventListener("resize", this._homeChartResizeHandler);
        this.rootRef.el?.removeEventListener("click", this._boundHomeClick);
        this.closeHomeExportMenu();
        this.disposeHomeCharts();
      }
      if (this.isPlanningFilter) this.rootRef.el?.removeEventListener("click", this._boundFilterClick);
      if (this.isInventoryReconciliation) {
        this.rootRef.el?.removeEventListener("click", this._boundReconciliationHeaderClick);
        if (this._reconciliationCheckboxInterval) clearInterval(this._reconciliationCheckboxInterval);
      }
    });
  }

  get modelParams() {
    const modelParams = super.modelParams;
    const multiRecordModels = ["zrn_planning.home", "zrn_planning.production.planning"];
    if (multiRecordModels.includes(this.props.resModel)) {
      const activeIds = this.props.context?.active_ids || [];
      if (activeIds.length > 1) {
        modelParams.config.resIds = activeIds;
        modelParams.config.resId = this.props.resId || this.props.context?.active_id || activeIds[0];
      }
    }
    return modelParams;
  }

  get isPlanningHome() {
    return this.props.resModel === "zrn_planning.home";
  }

  get isInventoryReconciliation() {
    return this.props.resModel === "zrn_planning.inventory.reconciliation";
  }

  get isPlanningFilter() {
    return [
      "zrn_planning.production.planning.wizard",
      "zrn_planning.purchase.planning.wizard",
    ].includes(this.props.resModel) && Boolean(this.rootRef.el?.querySelector("[data-zrn-planning-filter-modal]"));
  }

  onPlanningFilterClick(event) {
    const toggle = event.target.closest?.("[data-zrn-planning-filter-toggle]");
    const close = event.target.closest?.("[data-zrn-planning-filter-close]");
    if (!toggle && !close) return;
    event.preventDefault();
    event.stopPropagation();
    const modal = this.rootRef.el?.querySelector("[data-zrn-planning-filter-modal]");
    if (modal) modal.classList.toggle("d-none", Boolean(close) || !modal.classList.contains("d-none"));
  }

  renderSelectAllHeaderCheckbox() {
    const headerCell = this.rootRef.el?.querySelector("th[data-name='is_selected']");
    if (!headerCell) return;
    const selectedCount = this.model?.root?.data?.selected_line_count || 0;
    const existing = headerCell.querySelector(".zrn_select_all_header_wrapper");
    if (existing) {
      const icon = existing.querySelector("i");
      if (icon) icon.className = selectedCount > 0 ? "fa fa-check-square-o" : "fa fa-square-o";
      return;
    }
    headerCell.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "zrn_select_all_header_wrapper";
    const icon = document.createElement("i");
    icon.className = selectedCount > 0 ? "fa fa-check-square-o" : "fa fa-square-o";
    wrapper.appendChild(icon);
    headerCell.appendChild(wrapper);
  }

  async onReconciliationHeaderClick(event) {
    const wrapper = event.target.closest(".zrn_select_all_header_wrapper");
    if (!wrapper) return;
    event.preventDefault();
    const resId = this.model?.root?.resId;
    if (!resId) return;
    const selectedCount = this.model.root.data.selected_line_count || 0;
    try {
      await this.orm.call("zrn_planning.inventory.reconciliation", selectedCount === 0 ? "action_select_visible_lots" : "action_deselect_all_lots", [[resId]]);
      await this.model.root.load();
    } catch (err) {
      console.error("Error toggling reconciliation selection:", err);
    }
  }

  async loadAndRenderHomeCharts() {
    const resId = this.model?.root?.resId;
    if (!resId || !this.isPlanningHome) return;
    if (this._currentHomeResId !== resId || !this._chartPayload) {
      this._currentHomeResId = resId;
      this._chartPayload = await this.orm.call("zrn_planning.home", "get_home_chart_payload", [[resId]]);
    }
    window.requestAnimationFrame(() => this.renderHomeDashboard());
  }

  onHomeClick(event) {
    const viewButton = event.target.closest?.("[data-zrn-planning-home-view]");
    if (viewButton) {
      event.preventDefault();
      event.stopPropagation();
      const [key, view] = viewButton.dataset.zrnPlanningHomeView.split(":");
      this._homePanelViews[key] = view;
      this.closeHomeConfig();
      this.closeHomeExportMenu();
      this.renderHomeDashboard();
      return;
    }
    const configButton = event.target.closest?.("[data-zrn-planning-home-config]");
    if (configButton) {
      event.preventDefault();
      event.stopPropagation();
      this.openHomeConfig(configButton.dataset.zrnPlanningHomeConfig);
      return;
    }
    const exportButton = event.target.closest?.("[data-zrn-planning-home-export]");
    if (exportButton) {
      event.preventDefault();
      event.stopPropagation();
      this.openHomeExportMenu(event, exportButton.dataset.zrnPlanningHomeExport);
      return;
    }
    if (event.target.closest?.("[data-zrn-planning-home-config-close]")) {
      event.preventDefault();
      event.stopPropagation();
      this.closeHomeConfig();
      return;
    }
    if (event.target.closest?.("[data-zrn-planning-home-config-apply]")) {
      event.preventDefault();
      event.stopPropagation();
      this.applyHomeConfig();
    }
  }

  openHomeConfig(key) {
    const current = this._homeConfig[key] || { metric: "orders_generated", type: "bar", limit: 7 };
    this._homeConfig[key] = { ...current, key };
    const modal = this.rootRef.el?.querySelector("[data-zrn-planning-home-config-modal]");
    if (!modal) return;
    modal.dataset.zrnPlanningHomeConfigKey = key;
    const metric = modal.querySelector('[data-zrn-planning-home-config-field="metric"]');
    metric.innerHTML = HOME_METRICS.map(item => `<option value="${item.key}">${item.label}</option>`).join("");
    metric.value = current.metric;
    modal.querySelector('[data-zrn-planning-home-config-field="type"]').value = current.type;
    modal.querySelector('[data-zrn-planning-home-config-field="limit"]').value = current.limit;
    modal.classList.remove("d-none");
  }

  closeHomeConfig() {
    this.rootRef.el?.querySelector("[data-zrn-planning-home-config-modal]")?.classList.add("d-none");
  }

  applyHomeConfig() {
    const modal = this.rootRef.el?.querySelector("[data-zrn-planning-home-config-modal]");
    const key = modal?.dataset?.zrnPlanningHomeConfigKey;
    if (modal && key) {
      this._homeConfig[key] = {
        ...this._homeConfig[key],
        metric: modal.querySelector('[data-zrn-planning-home-config-field="metric"]').value,
        type: modal.querySelector('[data-zrn-planning-home-config-field="type"]').value,
        limit: Math.max(1, Math.min(30, Number(modal.querySelector('[data-zrn-planning-home-config-field="limit"]').value) || 7)),
      };
      this._homePanelViews[key] = "chart";
    }
    this.closeHomeConfig();
    this.renderHomeDashboard();
  }

  getHomeConfig(key) {
    return this._homeConfig[key] || { key, metric: "orders_generated", type: "bar", limit: 7 };
  }

  getHomeRows(key) {
    const rows = [...(this._chartPayload?.[key]?.rows || [])];
    const config = this.getHomeConfig(key);
    rows.sort((a, b) => Number(b[config.metric] || 0) - Number(a[config.metric] || 0));
    return rows.slice(0, config.limit || 7);
  }

  renderHomeDashboard() {
    if (!this.isPlanningHome || !this.rootRef.el) return;
    ["production", "supply"].forEach((key) => {
      const payload = this._chartPayload?.[key] || {};
      const rows = this.getHomeRows(key);
      const metrics = payload.metrics || {};
      const table = this.rootRef.el.querySelector(`[data-zrn-planning-home-table="${key}"]`);
      const metricsMount = this.rootRef.el.querySelector(`[data-zrn-planning-home-metrics="${key}"]`);
      const chart = this.rootRef.el.querySelector(`[data-zrn-planning-home-chart="${key}"]`);
      const empty = this.rootRef.el.querySelector(`[data-zrn-planning-home-empty="${key}"]`);
      if (metricsMount) {
        const orderLabel = payload.order_label || "Ordenes";
        metricsMount.innerHTML = [
          ["Planes", metrics.plans || 0, "fa-list-alt"],
          [orderLabel, metrics.orders_generated || 0, key === "production" ? "fa-industry" : "fa-shopping-cart"],
          ["Finalizadas", metrics.orders_completed || 0, "fa-check-square-o"],
          ["Avance", `${metrics.progress || 0}%`, "fa-line-chart"],
        ].map(([label, value, icon]) => `<div class="zrn_planning_home_summary_cell"><span class="zrn_planning_home_summary_label"><i class="fa ${icon}"/>${this.escapeHtml(label)}</span><strong class="zrn_planning_home_summary_value">${this.escapeHtml(value)}</strong></div>`).join("");
      }
      if (table) {
        table.classList.toggle("d-none", this._homePanelViews[key] === "chart");
        table.innerHTML = `<div class="zrn_planning_home_table_surface"><table><thead><tr><th>Plan</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Generadas</th><th>Finalizadas</th><th>Avance</th></tr></thead><tbody>${rows.length ? rows.map(row => `<tr><td>${this.escapeHtml(row.name)}</td><td>${this.escapeHtml(row.date_start)}</td><td>${this.escapeHtml(row.date_end)}</td><td>${this.escapeHtml(row.state_label)}</td><td>${row.orders_generated}</td><td>${row.orders_completed}</td><td>${row.progress}%</td></tr>`).join("") : `<tr><td colspan="7" class="zrn_planning_home_empty_cell">Sin registros.</td></tr>`}</tbody></table></div>`;
      }
      if (!chart) return;
      const visible = this._homePanelViews[key] === "chart";
      chart.classList.toggle("d-none", !visible);
      empty?.classList.toggle("d-none", !visible || rows.length > 0);
      if (!visible || !rows.length || !window.echarts) {
        this.disposeHomeChart(key);
        return;
      }
      let instance = this._chartInstances.get(key);
      if (!instance) {
        instance = window.echarts.init(chart);
        this._chartInstances.set(key, instance);
      }
      instance.setOption(this.buildHomeChartOption(key, rows), true);
      instance.resize();
    });
  }

  buildHomeChartOption(key, rows) {
    const config = this.getHomeConfig(key);
    const payload = this._chartPayload[key];
    const labels = rows.map(row => row.name);
    const values = rows.map(row => Number(row[config.metric] || 0));
    const format = value => config.metric === "progress" ? `${value}%` : Number(value).toLocaleString();
    if (config.type === "pie") {
      return { color: ["#315f98", "#4a78ad", "#6f5d9a", "#2f8f6f", "#c58b2b"], tooltip: { trigger: "item", formatter: item => `${item.name}<br/>${format(item.value)}` }, legend: { bottom: 0, type: "scroll" }, series: [{ type: "pie", radius: ["42%", "70%"], data: labels.map((name, index) => ({ name, value: values[index] })) }] };
    }
    return { color: ["#315f98"], tooltip: { trigger: "axis", valueFormatter: format }, grid: { top: 22, right: 20, bottom: labels.length > 4 ? 80 : 52, left: 52, containLabel: true }, xAxis: { type: "category", data: labels, axisLabel: { interval: 0, rotate: labels.length > 4 ? 24 : 0 } }, yAxis: { type: "value", minInterval: 1 }, series: [{ name: HOME_METRICS.find(item => item.key === config.metric)?.label || payload.order_label, type: config.type === "line" ? "line" : "bar", smooth: config.type === "line", barMaxWidth: 30, data: values }] };
  }

  openHomeExportMenu(event, key) {
    const panel = event.currentTarget.closest(".zrn_planning_home_panel");
    if (!panel) return;
    const chart = panel.querySelector(`[data-zrn-planning-home-chart="${key}"]`);
    const rect = event.currentTarget.getBoundingClientRect();
    this._homeExportPanel = panel;
    this._homeExportOptions = { key, filename: `zrn_planning_${key}`, isChart: chart && chart.offsetParent !== null };
    const menu = document.createElement("div");
    menu.className = "zrn_planning_home_export_menu_wrap";
    menu.innerHTML = `<div class="zrn_planning_home_export_backdrop"></div><div class="zrn_planning_home_export_menu" style="left:${Math.max(8, Math.min(rect.left, window.innerWidth - 188))}px;top:${Math.min(rect.bottom + 4, window.innerHeight - 180)}px"><strong>Exportar como</strong>${this._homeExportOptions.isChart ? '<button type="button" data-format="png"><i class="fa fa-image"></i><span>Imagen PNG</span></button>' : '<button type="button" data-format="xls"><i class="fa fa-file-excel-o"></i><span>Excel (.xls)</span></button><button type="button" data-format="xml"><i class="fa fa-code"></i><span>XML</span></button><button type="button" data-format="csv"><i class="fa fa-file-text-o"></i><span>CSV</span></button><button type="button" data-format="json"><i class="fa fa-file-code-o"></i><span>JSON</span></button>'}</div>`;
    menu.querySelector(".zrn_planning_home_export_backdrop").addEventListener("click", () => this.closeHomeExportMenu());
    menu.querySelectorAll("[data-format]").forEach(button => button.addEventListener("click", () => this.exportHomeFormat(button.dataset.format)));
    document.body.appendChild(menu);
    this._homeExportMenu = menu;
  }

  closeHomeExportMenu() {
    this._homeExportMenu?.remove();
    this._homeExportMenu = null;
    this._homeExportPanel = null;
    this._homeExportOptions = null;
  }

  exportHomeFormat(format) {
    const panel = this._homeExportPanel;
    const options = this._homeExportOptions;
    this.closeHomeExportMenu();
    if (!panel || !options) return;
    if (format === "png") {
      const chart = this._chartInstances.get(options.key);
      if (chart) {
        const link = document.createElement("a");
        link.href = chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
        link.download = `${options.filename}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      return;
    }
    const table = panel.querySelector("table");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr")).map(row => Array.from(row.querySelectorAll("th,td")).map(cell => cell.textContent.trim()));
    const content = format === "json" ? JSON.stringify(rows.slice(1).map(row => Object.fromEntries(rows[0].map((head, index) => [head, row[index] || ""]))), null, 2) : format === "csv" ? rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n") : `<table border="1">${rows.map(row => `<tr>${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const type = format === "json" ? "application/json;charset=utf-8" : format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.ms-excel";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
    link.download = `${options.filename}.${format === "xls" ? "xls" : format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  resizeHomeCharts() {
    this._chartInstances.forEach(chart => chart.resize());
  }

  disposeHomeChart(key) {
    const chart = this._chartInstances.get(key);
    if (chart) { chart.dispose(); this._chartInstances.delete(key); }
  }

  disposeHomeCharts() {
    this._chartInstances.forEach(chart => chart.dispose());
    this._chartInstances.clear();
  }
}

ZrnPlanningFormController.template = "web.FormView";
registry.category("views").add("zrn_planning_form", { ...formView, Controller: ZrnPlanningFormController });
