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
        { name: "Unidades", type: "bar", barMaxWidth: 26, data: rows.map(row => row.units) },
        { name: "Pendientes", type: "bar", barMaxWidth: 26, data: rows.map(row => row.pending) },
      ],
    }, true);
    this.reportChart.resize();
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
