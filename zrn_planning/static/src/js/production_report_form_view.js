/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { formView } from "@web/views/form/form_view";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { FormController } from "@web/views/form/form_controller";

class ZrnPlanningProductionReportFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this.reportChart = null;
    this.reportView = "table";
    this.reportDataset = "demand";
    this.reportChartType = "bar";
    this.reportLimit = 12;
    this.reportExportMenu = null;
    this.resizeReportChart = () => this.reportChart?.resize();
    this.handleReportClick = (ev) => this.onReportClick(ev);
    onMounted(() => {
      window.addEventListener("resize", this.resizeReportChart);
      this.rootRef.el?.addEventListener("click", this.handleReportClick);
      this.renderReportView();
    });
    onPatched(() => this.renderReportView());
    onWillUnmount(() => {
      window.removeEventListener("resize", this.resizeReportChart);
      this.rootRef.el?.removeEventListener("click", this.handleReportClick);
      this.closeReportExportMenu();
      this.closeReportConfig();
      this.reportChart?.dispose();
      this.reportChart = null;
    });
  }

  onReportClick(ev) {
    const viewButton = ev.target.closest?.("[data-zrn-planning-report-view]");
    if (viewButton) {
      ev.preventDefault();
      this.reportView = viewButton.dataset.zrnPlanningReportView || "table";
      this.renderReportView();
      return;
    }
    const configButton = ev.target.closest?.("[data-zrn-planning-report-config]");
    if (configButton) {
      ev.preventDefault();
      this.openReportConfig();
      return;
    }
    const exportButton = ev.target.closest?.("[data-zrn-planning-report-export]");
    if (exportButton) {
      ev.preventDefault();
      this.openReportExportMenu(exportButton);
    }
  }

  getReportRows() {
    const raw = this.model.root.data.report_chart_data || "[]";
    let rows;
    try {
      rows = JSON.parse(raw);
    } catch {
      rows = [];
    }
    return rows.map((row) => {
      const units = Number(row.units || 0);
      const pending = Number(row.pending || 0);
      const delivered = Math.max(units - pending, 0);
      return {
        name: row.name || "Sin producto",
        units,
        delivered,
        pending,
        completion: units ? (delivered / units) * 100 : 0,
      };
    });
  }

  getReportVariant() {
    const variants = {
      demand: {
        label: "Demanda por producto",
        series: [["Unidades demandadas", "units"]],
      },
      pending: {
        label: "Pendientes por producto",
        series: [["Unidades pendientes", "pending"]],
      },
      completion: {
        label: "Avance por producto",
        series: [["Avance %", "completion"]],
      },
      balance: {
        label: "Demandadas vs pendientes",
        series: [["Demandadas", "units"], ["Pendientes", "pending"]],
      },
    };
    return variants[this.reportDataset] || variants.demand;
  }

  renderReportView() {
    const root = this.rootRef.el;
    if (!root) return;
    const chartMount = root.querySelector("[data-zrn-planning-report-chart]");
    const tableMount = root.querySelector("[data-zrn-planning-report-table]");
    root.querySelectorAll("[data-zrn-planning-report-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.zrnPlanningReportView === this.reportView);
    });
    if (chartMount) chartMount.classList.toggle("d-none", this.reportView !== "chart");
    if (tableMount) tableMount.classList.toggle("d-none", this.reportView !== "table");
    if (this.reportView === "chart") {
      this.renderReportChart();
    } else {
      this.reportChart?.resize();
    }
  }

  renderReportChart() {
    const mount = this.rootRef.el?.querySelector("[data-zrn-planning-report-chart]");
    if (!mount || !window.echarts) return;
    const rows = this.getReportRows().slice(0, Math.max(Number(this.reportLimit || 12), 1));
    if (!rows.length) return;
    const variant = this.getReportVariant();
    if (!this.reportChart) this.reportChart = window.echarts.init(mount);
    this.reportChart.setOption({
      color: ["#315f98", "#c58b2b", "#168173"],
      tooltip: { trigger: "axis" },
      legend: { top: 0, left: "right" },
      grid: { top: 36, right: 18, bottom: 78, left: 56, containLabel: true },
      xAxis: { type: "category", data: rows.map(row => row.name), axisLabel: { interval: 0, rotate: rows.length > 4 ? 24 : 0, hideOverlap: true } },
      yAxis: { type: "value", minInterval: this.reportDataset === "completion" ? 10 : 1 },
      series: variant.series.map(([name, field]) => ({
        name,
        type: this.reportChartType,
        barMaxWidth: 28,
        smooth: true,
        data: rows.map(row => Number(row[field] || 0).toFixed(field === "completion" ? 1 : 0)),
      })),
    }, true);
    this.reportChart.resize();
  }

  openReportConfig() {
    this.closeReportConfig();
    const modal = document.createElement("div");
    modal.className = "zrn_planning_report_config";
    modal.innerHTML = `
      <div class="zrn_planning_report_config_backdrop"></div>
      <div class="zrn_planning_report_config_dialog">
        <div class="zrn_planning_report_config_head">
          <strong>Configurar contenido</strong>
          <button type="button" class="btn zrn_planning_report_config_close" aria-label="Cerrar"><i class="fa fa-times"></i></button>
        </div>
        <div class="zrn_planning_report_config_body">
          <label>Dataset</label>
          <select class="form-select" data-field="dataset">
            <option value="demand">Demanda por producto</option>
            <option value="pending">Pendientes por producto</option>
            <option value="completion">Avance por producto</option>
            <option value="balance">Demandadas vs pendientes</option>
          </select>
          <label>Tipo de grafica</label>
          <select class="form-select" data-field="chartType">
            <option value="bar">Barras</option>
            <option value="line">Linea</option>
          </select>
          <label>Limite de registros</label>
          <input class="form-control" type="number" min="1" max="50" data-field="limit"/>
        </div>
        <div class="zrn_planning_report_config_footer">
          <button type="button" class="btn btn-primary" data-apply="1">Aplicar</button>
        </div>
      </div>`;
    modal.querySelector('[data-field="dataset"]').value = this.reportDataset;
    modal.querySelector('[data-field="chartType"]').value = this.reportChartType;
    modal.querySelector('[data-field="limit"]').value = String(this.reportLimit);
    modal.querySelector(".zrn_planning_report_config_backdrop").addEventListener("click", () => this.closeReportConfig());
    modal.querySelector(".zrn_planning_report_config_close").addEventListener("click", () => this.closeReportConfig());
    modal.querySelector("[data-apply]").addEventListener("click", () => {
      this.reportDataset = modal.querySelector('[data-field="dataset"]').value || "demand";
      this.reportChartType = modal.querySelector('[data-field="chartType"]').value || "bar";
      this.reportLimit = Number(modal.querySelector('[data-field="limit"]').value || 12);
      this.reportView = "chart";
      this.closeReportConfig();
      this.renderReportView();
    });
    document.body.appendChild(modal);
    this.reportConfig = modal;
  }

  closeReportConfig() {
    this.reportConfig?.remove();
    this.reportConfig = null;
  }

  openReportExportMenu(button) {
    this.closeReportExportMenu();
    const rect = button.getBoundingClientRect();
    const hasChart = this.reportView === "chart" && this.reportChart;
    const options = [
      ...(hasChart ? [{ key: "png", label: "Imagen PNG", icon: "fa-image" }] : []),
      { key: "xls", label: "Excel (.xls)", icon: "fa-file-excel-o" },
      { key: "xml", label: "XML", icon: "fa-code" },
      { key: "csv", label: "CSV", icon: "fa-file-text-o" },
      { key: "json", label: "JSON", icon: "fa-file-code-o" },
    ];
    const menu = document.createElement("div");
    menu.className = "zrn_planning_export_menu_wrap";
    menu.innerHTML = `<div class="zrn_planning_export_backdrop"></div><div class="zrn_planning_export_menu" style="left: ${Math.max(8, Math.min(rect.left, window.innerWidth - 188))}px; top: ${Math.min(rect.bottom + 4, window.innerHeight - 180)}px;"><div class="zrn_planning_export_menu_title">Exportar como</div>${options.map((option) => `<button type="button" class="btn zrn_planning_export_menu_item" data-format="${option.key}"><i class="fa ${option.icon}"></i><span>${option.label}</span></button>`).join("")}</div>`;
    menu.querySelector(".zrn_planning_export_backdrop").addEventListener("click", () => this.closeReportExportMenu());
    menu.querySelectorAll("[data-format]").forEach((item) => item.addEventListener("click", () => this.exportReportDataset(item.dataset.format)));
    document.body.appendChild(menu);
    this.reportExportMenu = menu;
  }

  closeReportExportMenu() {
    this.reportExportMenu?.remove();
    this.reportExportMenu = null;
  }

  exportReportDataset(format) {
    const variant = this.getReportVariant();
    const filename = `zrn_planning_reporte_${this.reportDataset}`.replace(/[^a-zA-Z0-9_]+/g, "_");
    this.closeReportExportMenu();
    if (format === "png") {
      const link = document.createElement("a");
      link.href = this.reportChart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
      link.download = `${filename}.png`;
      link.click();
      return;
    }
    const rows = this.getExportRows(variant);
    const content = format === "xls" ? this.tableToExcel(variant.label, rows) : format === "csv" ? rows.map((row) => row.map((cell) => this.csvCell(cell)).join(",")).join("\r\n") : format === "json" ? this.tableToJson(rows) : this.tableToXml(variant.label, rows);
    const type = format === "xls" ? "application/vnd.ms-excel" : format === "csv" ? "text/csv;charset=utf-8" : format === "json" ? "application/json;charset=utf-8" : "application/xml;charset=utf-8";
    this.downloadText(filename, content, type, format);
  }

  getExportRows(variant) {
    const rows = this.getReportRows().slice(0, Math.max(Number(this.reportLimit || 12), 1));
    return [
      ["Producto", ...variant.series.map(([label]) => label), "Entregadas", "Pendientes", "Avance %"],
      ...rows.map((row) => [
        row.name,
        ...variant.series.map(([, field]) => this.numberCell(row[field], field === "completion" ? 1 : 0)),
        this.numberCell(row.delivered, 0),
        this.numberCell(row.pending, 0),
        this.numberCell(row.completion, 1),
      ]),
    ];
  }

  numberCell(value, decimals = 0) {
    return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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

  escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  async downloadReportExcel() {
    if (!this.model.root.resId) {
      return;
    }
    const action = await this.orm.call(
      this.props.resModel,
      "action_download_report_excel",
      [[this.model.root.resId]],
    );
    await this.actionService.doAction(action);
  }

  async openManufactureTable() {
    if (!this.model.root.resId) {
      return;
    }
    const action = await this.orm.call(
      this.props.resModel,
      "action_open_manufacture_table",
      [[this.model.root.resId]],
    );
    await this.actionService.doAction(action);
  }
}

class ZrnPlanningProductionManufactureFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
  }

  async createMfgPlan() {
    if (!this.model.root.resId) {
      return;
    }
    const action = await this.orm.call(
      this.props.resModel,
      "action_open_create_mfg_plan_modal",
      [[this.model.root.resId]],
    );
    await this.actionService.doAction(action);
  }
}

class ZrnPlanningPurchaseReportFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this.reportChart = null;
    this.resizeReportChart = () => this.reportChart?.resize();
    onMounted(() => {
      window.addEventListener("resize", this.resizeReportChart);
      this.renderReportChart();
    });
    onPatched(() => this.renderReportChart());
    onWillUnmount(() => {
      window.removeEventListener("resize", this.resizeReportChart);
      this.reportChart?.dispose();
      this.reportChart = null;
    });
  }

  renderReportChart() {
    const mount = this.rootRef.el?.querySelector("[data-zrn-planning-report-chart]");
    if (!mount || !window.echarts) return;
    const raw = this.model.root.data.report_chart_data || "[]";
    let rows;
    try {
      rows = JSON.parse(raw);
    } catch {
      rows = [];
    }
    if (!rows.length) return;
    if (!this.reportChart) this.reportChart = window.echarts.init(mount);
    this.reportChart.setOption({
      color: ["#315f98", "#c58b2b"],
      tooltip: { trigger: "axis" },
      legend: { top: 0, left: "right" },
      grid: { top: 32, right: 18, bottom: 68, left: 52, containLabel: true },
      xAxis: { type: "category", data: rows.map(row => row.name), axisLabel: { rotate: rows.length > 4 ? 24 : 0 } },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        { name: "Requerido", type: "bar", barMaxWidth: 26, data: rows.map(row => row.required) },
        { name: "Compra sugerida", type: "bar", barMaxWidth: 26, data: rows.map(row => row.suggested) },
      ],
    }, true);
    this.reportChart.resize();
  }

  async createSupplyPlan() {
    if (!this.model.root.resId) {
      return;
    }
    const action = await this.orm.call(
      this.props.resModel,
      "action_open_create_supply_plan_modal",
      [[this.model.root.resId]],
    );
    await this.actionService.doAction(action);
  }
}

ZrnPlanningProductionReportFormController.template =
  "zrn_planning.ProductionReportFormView";
ZrnPlanningProductionManufactureFormController.template =
  "zrn_planning.ProductionManufactureFormView";
ZrnPlanningPurchaseReportFormController.template =
  "zrn_planning.PurchaseReportFormView";

registry.category("views").add("zrn_planning_production_report_form", {
  ...formView,
  Controller: ZrnPlanningProductionReportFormController,
});

registry.category("views").add("zrn_planning_production_manufacture_form", {
  ...formView,
  Controller: ZrnPlanningProductionManufactureFormController,
});

registry.category("views").add("zrn_planning_purchase_report_form", {
  ...formView,
  Controller: ZrnPlanningPurchaseReportFormController,
});
