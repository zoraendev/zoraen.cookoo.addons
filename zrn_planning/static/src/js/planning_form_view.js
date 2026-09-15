/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";

class ZrnPlanningFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this._chartPayload = null;
    this._chartInstances = new Map();
    this._homePanelViews = { production: "table", supply: "table" };
    this._homeTableSort = {};
    this._homeExportPanel = null;
    this._homeExportOptions = null;
    this._homeExportMenu = null;
    this._planExplorerView = "table";
    this._planExplorerDataset = "progress";
    this._planExplorerChartType = "bar";
    this._planExplorerLimit = 20;
    this._planExplorerSort = { field: "date_start", direction: "desc" };
    this._planExplorerChart = null;
    this._planExplorerExportMenu = null;
    this._planExplorerConfig = null;
    this._homeChartResizeHandler = () => this.resizeHomeCharts();
    this._planExplorerResizeHandler = () => this._planExplorerChart?.resize();
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
      if (this.isPlanningFilter) {
        this.rootRef.el?.addEventListener("click", this._boundFilterClick);
        if (this.isProductionPlanningFilter) {
          window.addEventListener("resize", this._planExplorerResizeHandler);
          this.renderProductionPlanExplorer();
        }
      }
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
      if (this.isProductionPlanningFilter) this.renderProductionPlanExplorer();
      if (this.isInventoryReconciliation) this.renderSelectAllHeaderCheckbox();
    });

    onWillUnmount(() => {
      if (this.isPlanningHome) {
        window.removeEventListener("resize", this._homeChartResizeHandler);
        this.rootRef.el?.removeEventListener("click", this._boundHomeClick);
        this.closeHomeExportMenu();
        this.disposeHomeCharts();
      }
      if (this.isPlanningFilter) {
        this.rootRef.el?.removeEventListener("click", this._boundFilterClick);
        window.removeEventListener("resize", this._planExplorerResizeHandler);
        this.closePlanExplorerExportMenu();
        this.closePlanExplorerConfig();
        this._planExplorerChart?.dispose();
        this._planExplorerChart = null;
      }
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

  get isProductionPlanningFilter() {
    return [
      "zrn_planning.production.planning.wizard",
      "zrn_planning.purchase.planning.wizard",
    ].includes(this.props.resModel)
      && Boolean(this.rootRef.el?.querySelector("[data-zrn-planning-plan-table]"));
  }

  get isPurchasePlanningFilter() {
    return this.props.resModel === "zrn_planning.purchase.planning.wizard";
  }

  onPlanningFilterClick(event) {
    const planSort = event.target.closest?.("[data-zrn-planning-plan-sort]");
    if (planSort) {
      event.preventDefault();
      event.stopPropagation();
      const field = planSort.dataset.zrnPlanningPlanSort;
      this._planExplorerSort = {
        field,
        direction: this._planExplorerSort.field === field && this._planExplorerSort.direction === "asc" ? "desc" : "asc",
      };
      this.renderProductionPlanExplorer();
      return;
    }
    const planView = event.target.closest?.("[data-zrn-planning-plan-view]");
    if (planView) {
      event.preventDefault();
      event.stopPropagation();
      this._planExplorerView = planView.dataset.zrnPlanningPlanView || "table";
      this.closePlanExplorerExportMenu();
      this.renderProductionPlanExplorer();
      return;
    }
    const planConfig = event.target.closest?.("[data-zrn-planning-plan-config]");
    if (planConfig) {
      event.preventDefault();
      event.stopPropagation();
      this.openPlanExplorerConfig();
      return;
    }
    const planExport = event.target.closest?.("[data-zrn-planning-plan-export]");
    if (planExport) {
      event.preventDefault();
      event.stopPropagation();
      this.openPlanExplorerExportMenu(planExport);
      return;
    }
    const toggle = event.target.closest?.("[data-zrn-planning-filter-toggle]");
    const close = event.target.closest?.("[data-zrn-planning-filter-close]");
    if (!toggle && !close) return;
    event.preventDefault();
    event.stopPropagation();
    const modal = this.rootRef.el?.querySelector("[data-zrn-planning-filter-modal]");
    if (modal) modal.classList.toggle("d-none", Boolean(close) || !modal.classList.contains("d-none"));
  }

  getProductionPlanRows() {
    try {
      return JSON.parse(this.model?.root?.data?.planning_record_data || "[]");
    } catch {
      return [];
    }
  }

  getProductionPlanColumns() {
    if (this.isPurchasePlanningFilter) {
      return [
        ["Plan", "name"],
        ["Inicio", "date_start"],
        ["Fin", "date_end"],
        ["Estado", "state_label"],
        ["Base", "basis_label"],
        ["Lineas", "line_count"],
        ["Productos", "product_count"],
        ["Insumos", "supply_count"],
        ["Docs.", "source_count"],
        ["Planeadas", "planned_qty"],
        ["Ejecutadas", "executed_qty"],
        ["Pendientes", "pending_qty"],
        ["Avance", "progress"],
        ["OCs", "purchase_count"],
        ["OCs fin.", "completed_purchase_count"],
      ];
    }
    return [
      ["Plan", "name"],
      ["Inicio", "date_start"],
      ["Fin", "date_end"],
      ["Estado", "state_label"],
      ["Base", "basis_label"],
      ["Lineas", "line_count"],
      ["Productos", "product_count"],
      ["OVs", "source_count"],
      ["Planeadas", "planned_qty"],
      ["Ejecutadas", "executed_qty"],
      ["Pendientes", "pending_qty"],
      ["Avance", "progress"],
      ["Productividad", "productivity"],
      ["OFs", "production_count"],
      ["OFs fin.", "completed_production_count"],
      ["OCs", "purchase_count"],
    ];
  }

  getProductionPlanDataset() {
    const datasets = this.isPurchasePlanningFilter
      ? {
        progress: { label: "Avance por plan", series: [["Avance %", "progress"]] },
        units: { label: "Unidades por plan", series: [["Planeadas", "planned_qty"], ["Ejecutadas", "executed_qty"], ["Pendientes", "pending_qty"]] },
        records: { label: "Volumen operativo", series: [["Lineas", "line_count"], ["Productos", "product_count"], ["Insumos", "supply_count"], ["Docs.", "source_count"]] },
        manufacturing: { label: "Ordenes de compra", series: [["OCs", "purchase_count"], ["OCs finalizadas", "completed_purchase_count"]] },
        productivity: { label: "Productividad por plan", series: [["Unidades ejecutadas por linea", "productivity"]] },
      }
      : {
        progress: { label: "Avance por plan", series: [["Avance %", "progress"]] },
        units: { label: "Unidades por plan", series: [["Planeadas", "planned_qty"], ["Ejecutadas", "executed_qty"], ["Pendientes", "pending_qty"]] },
        records: { label: "Volumen operativo", series: [["Lineas", "line_count"], ["Productos", "product_count"], ["OVs", "source_count"]] },
        manufacturing: { label: "Ordenes de fabricacion", series: [["OFs", "production_count"], ["OFs finalizadas", "completed_production_count"]] },
        productivity: { label: "Productividad por plan", series: [["Unidades ejecutadas por linea", "productivity"]] },
      };
    return datasets[this._planExplorerDataset] || datasets.progress;
  }

  getSortedProductionPlanRows() {
    const rows = this.getProductionPlanRows();
    const sort = this._planExplorerSort || {};
    rows.sort((left, right) => {
      const leftNumber = Number(left[sort.field]);
      const rightNumber = Number(right[sort.field]);
      let result;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && String(left[sort.field] ?? "") !== "" && String(right[sort.field] ?? "") !== "") {
        result = leftNumber - rightNumber;
      } else {
        result = String(left[sort.field] ?? "").localeCompare(String(right[sort.field] ?? ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sort.direction === "desc" ? -result : result;
    });
    return rows;
  }

  renderProductionPlanExplorer() {
    if (!this.isProductionPlanningFilter || !this.rootRef.el) return;
    const tableMount = this.rootRef.el.querySelector("[data-zrn-planning-plan-table]");
    const chartMount = this.rootRef.el.querySelector("[data-zrn-planning-plan-chart]");
    const empty = this.rootRef.el.querySelector("[data-zrn-planning-plan-empty]");
    const rows = this.getSortedProductionPlanRows();
    const chartRows = rows.slice(0, Math.max(Number(this._planExplorerLimit || 20), 1));
    this.rootRef.el.querySelectorAll("[data-zrn-planning-plan-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.zrnPlanningPlanView === this._planExplorerView);
    });
    if (tableMount) {
      tableMount.classList.toggle("d-none", this._planExplorerView === "chart");
      if (this._planExplorerView !== "chart") {
        tableMount.innerHTML = this.buildProductionPlanTable(rows);
      }
    }
    if (chartMount) chartMount.classList.toggle("d-none", this._planExplorerView !== "chart");
    empty?.classList.toggle("d-none", this._planExplorerView !== "chart" || chartRows.length > 0);
    if (this._planExplorerView === "chart") {
      this.renderProductionPlanChart(chartRows);
    } else {
      this._planExplorerChart?.resize();
    }
  }

  buildProductionPlanTable(rows) {
    const columns = this.getProductionPlanColumns();
    const sort = this._planExplorerSort || {};
    const headers = columns.map(([label, field]) => {
      const active = sort.field === field;
      const icon = active ? (sort.direction === "asc" ? "fa-sort-asc" : "fa-sort-desc") : "fa-sort";
      return `<th><span class="zrn_planning_sort_header" data-zrn-planning-plan-sort="${field}" role="button" tabindex="0">${this.escapeHtml(label)}<i class="fa ${icon}" aria-hidden="true"></i></span></th>`;
    }).join("");
    const body = rows.length
      ? rows.map(row => `<tr>${columns.map(([label, field]) => `<td class="${field === "name" ? "zrn_planning_plan_name_cell" : ""}">${this.escapeHtml(this.formatProductionPlanCell(row[field], field))}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${columns.length}" class="zrn_planning_home_empty_cell">${this.isPurchasePlanningFilter ? "Sin planings de abastecimiento." : "Sin planings de fabricacion."}</td></tr>`;
    return `<div class="zrn_planning_plan_explorer_scroll"><table class="zrn_planning_plan_explorer_grid"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  formatProductionPlanCell(value, field) {
    if (["planned_qty", "released_qty", "executed_qty", "pending_qty", "productivity"].includes(field)) {
      return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    if (field === "progress") {
      return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    return value ?? "";
  }

  renderProductionPlanChart(rows) {
    const mount = this.rootRef.el?.querySelector("[data-zrn-planning-plan-chart]");
    if (!mount || !window.echarts) return;
    if (!rows.length) {
      this._planExplorerChart?.dispose();
      this._planExplorerChart = null;
      return;
    }
    if (!this._planExplorerChart) this._planExplorerChart = window.echarts.init(mount);
    const dataset = this.getProductionPlanDataset();
    const labels = rows.map(row => row.name);
    this._planExplorerChart.setOption({
      color: ["#315f98", "#168173", "#c34b16", "#9dbfe4"],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: value => Number(value).toLocaleString() },
      legend: { top: 2, left: "right" },
      grid: { top: 42, right: 20, bottom: labels.length > 6 ? 96 : 64, left: 58, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { interval: 0, rotate: labels.length > 4 ? 24 : 0, hideOverlap: true } },
      yAxis: { type: "value", minInterval: this._planExplorerDataset === "progress" ? 10 : 1 },
      series: dataset.series.map(([name, field]) => ({
        name,
        type: this._planExplorerChartType,
        smooth: true,
        barMaxWidth: 28,
        data: rows.map(row => Number(row[field] || 0)),
      })),
    }, true);
    this._planExplorerChart.resize();
  }

  openPlanExplorerConfig() {
    this.closePlanExplorerConfig();
    const recordsOptionLabel = this.isPurchasePlanningFilter ? "Ordenes de compra" : "Ordenes de fabricacion";
    const modal = document.createElement("div");
    modal.className = "zrn_planning_report_config";
    modal.innerHTML = `
      <div class="zrn_planning_report_config_backdrop"></div>
      <div class="zrn_planning_report_config_dialog">
        <div class="zrn_planning_report_config_head">
          <strong>Configurar planes</strong>
          <button type="button" class="btn zrn_planning_report_config_close" aria-label="Cerrar"><i class="fa fa-times"></i></button>
        </div>
        <div class="zrn_planning_report_config_body">
          <label>Dataset</label>
          <select class="form-select" data-field="dataset">
            <option value="progress">Avance por plan</option>
            <option value="units">Unidades por plan</option>
            <option value="records">Volumen operativo</option>
            <option value="manufacturing">${recordsOptionLabel}</option>
            <option value="productivity">Productividad por plan</option>
          </select>
          <label>Tipo de grafica</label>
          <select class="form-select" data-field="chartType">
            <option value="bar">Barras</option>
            <option value="line">Linea</option>
          </select>
          <label>Limite de registros</label>
          <input class="form-control" type="number" min="1" max="100" data-field="limit"/>
        </div>
        <div class="zrn_planning_report_config_footer">
          <button type="button" class="btn btn-primary" data-apply="1">Aplicar</button>
        </div>
      </div>`;
    modal.querySelector('[data-field="dataset"]').value = this._planExplorerDataset;
    modal.querySelector('[data-field="chartType"]').value = this._planExplorerChartType;
    modal.querySelector('[data-field="limit"]').value = String(this._planExplorerLimit);
    modal.querySelector(".zrn_planning_report_config_backdrop").addEventListener("click", () => this.closePlanExplorerConfig());
    modal.querySelector(".zrn_planning_report_config_close").addEventListener("click", () => this.closePlanExplorerConfig());
    modal.querySelector("[data-apply]").addEventListener("click", () => {
      this._planExplorerDataset = modal.querySelector('[data-field="dataset"]').value || "progress";
      this._planExplorerChartType = modal.querySelector('[data-field="chartType"]').value || "bar";
      this._planExplorerLimit = Number(modal.querySelector('[data-field="limit"]').value || 20);
      this._planExplorerView = "chart";
      this.closePlanExplorerConfig();
      this.renderProductionPlanExplorer();
    });
    document.body.appendChild(modal);
    this._planExplorerConfig = modal;
  }

  closePlanExplorerConfig() {
    this._planExplorerConfig?.remove();
    this._planExplorerConfig = null;
  }

  openPlanExplorerExportMenu(button) {
    this.closePlanExplorerExportMenu();
    const rect = button.getBoundingClientRect();
    const hasChart = this._planExplorerView === "chart" && this._planExplorerChart;
    const menuHeight = hasChart ? 230 : 190;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 196));
    const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight));
    const menu = document.createElement("div");
    menu.className = "zrn_planning_home_export_menu_wrap";
    menu.innerHTML = `<div class="zrn_planning_home_export_backdrop"></div><div class="zrn_planning_home_export_menu" style="left:${left}px;top:${top}px"><strong>Exportar como</strong>${hasChart ? '<button type="button" data-format="png"><i class="fa fa-image"></i><span>Imagen PNG</span></button>' : ''}<button type="button" data-format="xls"><i class="fa fa-file-excel-o"></i><span>Excel (.xls)</span></button><button type="button" data-format="xml"><i class="fa fa-code"></i><span>XML</span></button><button type="button" data-format="csv"><i class="fa fa-file-text-o"></i><span>CSV</span></button><button type="button" data-format="json"><i class="fa fa-file-code-o"></i><span>JSON</span></button></div>`;
    menu.querySelector(".zrn_planning_home_export_backdrop").addEventListener("click", () => this.closePlanExplorerExportMenu());
    menu.querySelectorAll("[data-format]").forEach(item => item.addEventListener("click", () => this.exportPlanExplorer(item.dataset.format)));
    document.body.appendChild(menu);
    this._planExplorerExportMenu = menu;
  }

  closePlanExplorerExportMenu() {
    this._planExplorerExportMenu?.remove();
    this._planExplorerExportMenu = null;
  }

  exportPlanExplorer(format) {
    this.closePlanExplorerExportMenu();
    const filename = this.isPurchasePlanningFilter ? "zrn_planning_planes_abastecimiento" : "zrn_planning_planes_fabricacion";
    if (format === "png" && this._planExplorerChart) {
      const link = document.createElement("a");
      link.href = this._planExplorerChart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
      link.download = `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    const columns = this.getProductionPlanColumns();
    const rows = [columns.map(([label]) => label), ...this.getSortedProductionPlanRows().map(row => columns.map(([, field]) => this.formatProductionPlanCell(row[field], field)))];
    const content = format === "json"
      ? JSON.stringify(rows.slice(1).map(row => Object.fromEntries(rows[0].map((head, index) => [head, row[index] || ""]))), null, 2)
      : format === "csv"
        ? rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n")
        : format === "xml"
          ? `<?xml version="1.0"?><Rows>${rows.slice(1).map(row => `<Row>${rows[0].map((head, index) => `<${this.xmlTag(head)}>${this.escapeHtml(row[index] || "")}</${this.xmlTag(head)}>`).join("")}</Row>`).join("")}</Rows>`
          : `<table border="1">${rows.map(row => `<tr>${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const type = format === "json" ? "application/json;charset=utf-8" : format === "csv" ? "text/csv;charset=utf-8" : format === "xml" ? "application/xml;charset=utf-8" : "application/vnd.ms-excel";
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.${format === "xls" ? "xls" : format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    const sortButton = event.target.closest?.("[data-zrn-planning-home-sort]");
    if (sortButton) {
      event.preventDefault();
      event.stopPropagation();
      const key = sortButton.dataset.zrnPlanningHomeSort;
      const field = sortButton.dataset.zrnPlanningHomeSortField;
      const current = this._homeTableSort[key];
      this._homeTableSort[key] = {
        field,
        direction: current?.field === field && current.direction === "asc" ? "desc" : "asc",
      };
      this.renderHomeDashboard();
      return;
    }
    const viewButton = event.target.closest?.("[data-zrn-planning-home-view]");
    if (viewButton) {
      event.preventDefault();
      event.stopPropagation();
      const [key, view] = viewButton.dataset.zrnPlanningHomeView.split(":");
      this._homePanelViews[key] = view;
      this.closeHomeExportMenu();
      this.renderHomeDashboard();
      return;
    }
    const exportButton = event.target.closest?.("[data-zrn-planning-home-export]");
    if (exportButton) {
      event.preventDefault();
      event.stopPropagation();
      this.openHomeExportMenu(event, exportButton.dataset.zrnPlanningHomeExport, exportButton);
      return;
    }
  }

  getHomeRows(key) {
    const rows = [...(this._chartPayload?.[key]?.rows || [])];
    rows.sort((a, b) => Number(b.orders_generated || 0) - Number(a.orders_generated || 0));
    return rows.slice(0, 7);
  }

  getHomeTableRows(key) {
    const rows = [...(this._chartPayload?.[key]?.rows || [])];
    const sort = this._homeTableSort[key];
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

  renderHomeDashboard() {
    if (!this.isPlanningHome || !this.rootRef.el) return;
    ["production", "supply"].forEach((key) => {
      const payload = this._chartPayload?.[key] || {};
      const chartRows = this.getHomeRows(key);
      const tableRows = this.getHomeTableRows(key);
      const metrics = payload.metrics || {};
      const table = this.rootRef.el.querySelector(`[data-zrn-planning-home-table="${key}"]`);
      const metricsMount = this.rootRef.el.querySelector(`[data-zrn-planning-home-metrics="${key}"]`);
      const chart = this.rootRef.el.querySelector(`[data-zrn-planning-home-chart="${key}"]`);
      const empty = this.rootRef.el.querySelector(`[data-zrn-planning-home-empty="${key}"]`);
      if (metricsMount) {
        const orderLabel = payload.order_label || "Ordenes";
        const summaryColumns = [
          ["Planes", metrics.plans || 0],
          [orderLabel, metrics.orders_generated || 0],
          ["Finalizadas", metrics.orders_completed || 0],
          ["Avance", `${metrics.progress || 0}%`],
        ];
        metricsMount.innerHTML = `<table class="zrn_planning_home_summary_table"><thead><tr>${summaryColumns.map(([label]) => `<th>${this.escapeHtml(label)}</th>`).join("")}</tr></thead><tbody><tr>${summaryColumns.map(([, value]) => `<td>${this.escapeHtml(value)}</td>`).join("")}</tr></tbody></table>`;
      }
      if (table) {
        const columns = [["Plan", "name"], ["Inicio", "date_start"], ["Fin", "date_end"], ["Estado", "state_label"], ["Generadas", "orders_generated"], ["Finalizadas", "orders_completed"], ["Avance", "progress"]];
        const sort = this._homeTableSort[key];
        const head = columns.map(([label, field]) => {
          const active = sort?.field === field;
          const icon = active ? (sort.direction === "asc" ? "fa-sort-asc" : "fa-sort-desc") : "fa-sort";
          return `<th><span class="zrn_planning_sort_header" data-zrn-planning-home-sort="${key}" data-zrn-planning-home-sort-field="${field}" role="button" tabindex="0">${label}<i class="fa ${icon}" aria-hidden="true"></i></span></th>`;
        }).join("");
        table.classList.toggle("d-none", this._homePanelViews[key] === "chart");
        table.innerHTML = `<div class="zrn_planning_home_table_surface"><table><thead><tr>${head}</tr></thead><tbody>${tableRows.length ? tableRows.map(row => `<tr><td>${this.escapeHtml(row.name)}</td><td>${this.escapeHtml(row.date_start)}</td><td>${this.escapeHtml(row.date_end)}</td><td>${this.escapeHtml(row.state_label)}</td><td>${row.orders_generated}</td><td>${row.orders_completed}</td><td>${row.progress}%</td></tr>`).join("") : `<tr><td colspan="7" class="zrn_planning_home_empty_cell">Sin registros.</td></tr>`}</tbody></table></div>`;
      }
      if (!chart) return;
      const visible = this._homePanelViews[key] === "chart";
      this.updateHomeActionStates(key);
      chart.classList.toggle("d-none", !visible);
      empty?.classList.toggle("d-none", !visible || chartRows.length > 0);
      if (!visible || !chartRows.length || !window.echarts) {
        this.disposeHomeChart(key);
        return;
      }
      let instance = this._chartInstances.get(key);
      if (!instance) {
        instance = window.echarts.init(chart);
        this._chartInstances.set(key, instance);
      }
      instance.setOption(this.buildHomeChartOption(key, chartRows), true);
      instance.resize();
    });
  }

  buildHomeChartOption(key, rows) {
    const payload = this._chartPayload[key];
    const labels = rows.map(row => row.name);
    const generatedLabel = payload.order_label || "Ordenes";
    const completedLabel = "Finalizadas";
    return {
      color: ["#315f98", "#9dbfe4"],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: value => Number(value).toLocaleString() },
      legend: { bottom: 4, left: "center" },
      grid: { top: 22, right: 20, bottom: labels.length > 4 ? 88 : 62, left: 52, containLabel: true },
      xAxis: { type: "category", data: labels, axisLabel: { interval: 0, rotate: labels.length > 4 ? 24 : 0 } },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        { name: generatedLabel, type: "bar", barMaxWidth: 30, data: rows.map(row => Number(row.orders_generated || 0)) },
        { name: completedLabel, type: "bar", barMaxWidth: 30, data: rows.map(row => Number(row.orders_completed || 0)) },
      ],
    };
  }

  updateHomeActionStates(key) {
    const view = this._homePanelViews[key] || "table";
    this.rootRef.el?.querySelectorAll(`[data-zrn-planning-home-view^="${key}:"]`).forEach(button => {
      button.classList.toggle("is-active", button.dataset.zrnPlanningHomeView === `${key}:${view}`);
    });
  }

  openHomeExportMenu(event, key, button) {
    const panel = button.closest(".zrn_planning_home_panel");
    if (!panel) return;
    this.closeHomeExportMenu();
    const chart = panel.querySelector(`[data-zrn-planning-home-chart="${key}"]`);
    const rect = button.getBoundingClientRect();
    this._homeExportPanel = panel;
    this._homeExportOptions = { key, filename: `zrn_planning_${key}`, isChart: chart && chart.offsetParent !== null };
    const menuHeight = this._homeExportOptions.isChart ? 230 : 190;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 196));
    const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight));
    const dataButtons = '<button type="button" data-format="xls"><i class="fa fa-file-excel-o"></i><span>Excel (.xls)</span></button><button type="button" data-format="xml"><i class="fa fa-code"></i><span>XML</span></button><button type="button" data-format="csv"><i class="fa fa-file-text-o"></i><span>CSV</span></button><button type="button" data-format="json"><i class="fa fa-file-code-o"></i><span>JSON</span></button>';
    const menu = document.createElement("div");
    menu.className = "zrn_planning_home_export_menu_wrap";
    menu.innerHTML = `<div class="zrn_planning_home_export_backdrop"></div><div class="zrn_planning_home_export_menu" style="left:${left}px;top:${top}px"><strong>Exportar como</strong>${this._homeExportOptions.isChart ? '<button type="button" data-format="png"><i class="fa fa-image"></i><span>Imagen PNG</span></button>' : ''}${dataButtons}</div>`;
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
    const table = panel.querySelector(".zrn_planning_home_table_surface table");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr")).map(row => Array.from(row.querySelectorAll("th,td")).map(cell => cell.textContent.trim()));
    const content = format === "json"
      ? JSON.stringify(rows.slice(1).map(row => Object.fromEntries(rows[0].map((head, index) => [head, row[index] || ""]))), null, 2)
      : format === "csv"
        ? rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n")
        : format === "xml"
          ? `<?xml version="1.0"?><Rows>${rows.slice(1).map(row => `<Row>${rows[0].map((head, index) => `<${this.xmlTag(head)}>${this.escapeHtml(row[index] || "")}</${this.xmlTag(head)}>`).join("")}</Row>`).join("")}</Rows>`
          : `<table border="1">${rows.map(row => `<tr>${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
    const type = format === "json" ? "application/json;charset=utf-8" : format === "csv" ? "text/csv;charset=utf-8" : format === "xml" ? "application/xml;charset=utf-8" : "application/vnd.ms-excel";
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${options.filename}.${format === "xls" ? "xls" : format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  xmlTag(value) {
    return String(value || "Campo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^([0-9])/, "_$1") || "Campo";
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
