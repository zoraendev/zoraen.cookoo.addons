/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { getSharedProcessingView } from "./analytics_processing_view";

class ZrnAnalyticsFormController extends FormController {
  setup() {
    super.setup();
    this.orm = useService("orm");
    this.processingView = getSharedProcessingView();
    this.processingView.setServices({ orm: this.orm });
    this.processingView.setNavigationHandlers({
      openWorkspace: () =>
        this.openAnalyticsAction("action_open_processing_workspace", {
          preserveProcessingState: true,
          skipDiscardConfirm: true,
        }),
      openLanding: () =>
        this.openAnalyticsAction("action_open_processing", {
          preserveProcessingState: true,
          skipDiscardConfirm: true,
        }),
    });
    onMounted(() => this.syncProcessingView());
    onPatched(() => this.syncProcessingView());
    onWillUnmount(() => {
      if (this.processingView.consumePreserveState()) {
        this.processingView.unmount();
        return;
      }
      this.processingView.destroy();
    });
  }

  get modelParams() {
    const modelParams = super.modelParams;
    if (this.props.resModel === "zrn_analitics.home") {
      const activeIds = this.props.context?.active_ids || [];
      if (activeIds.length > 1) {
        modelParams.config.resIds = activeIds;
        modelParams.config.resId =
          this.props.resId || this.props.context?.active_id || activeIds[0];
      }
    }
    return modelParams;
  }

  async openAnalyticsAction(methodName, options = {}) {
    if (!options.skipDiscardConfirm) {
      const canLeave = await this.processingView.confirmDiscardIfNeeded();
      if (!canLeave) {
        return;
      }
    }
    if (options.preserveProcessingState) {
      this.processingView.preserveStateOnce();
    }
    const action = await this.orm.call(this.props.resModel, methodName, [
      [this.model.root.resId],
    ]);
    try {
      await this.actionService.doAction(action);
    } catch (error) {
      if (options.preserveProcessingState) {
        this.processingView.cancelPreserveState();
      }
      throw error;
    }
  }

  syncProcessingView() {
    const root = this.el?.querySelector("[data-zrn-processing-root='1']");
    if (root) {
      this.processingView.mount(root);
      return;
    }
    this.processingView.unmount();
  }

  openButton1() {
    return this.openAnalyticsAction("action_open_button_1");
  }

  openButton2() {
    return this.openAnalyticsAction("action_open_button_2");
  }

  openButton3() {
    return this.openAnalyticsAction("action_open_button_3");
  }

  openButton4() {
    return this.openAnalyticsAction("action_open_button_4");
  }

  openButton5() {
    return this.openAnalyticsAction("action_open_button_5");
  }

  openHome() {
    return this.openAnalyticsAction("action_open_home");
  }

  get currentPageKey() {
    return this.model?.root?.data?.page_key || "";
  }

  get showHeaderBackButton() {
    return ["processing", "processing_workspace"].includes(this.currentPageKey);
  }

  get headerBackLabel() {
    return this.currentPageKey === "processing_workspace"
      ? "Volver a carga"
      : "Volver al centro";
  }

  openHeaderBack() {
    if (this.currentPageKey === "processing_workspace") {
      return this.openAnalyticsAction("action_open_processing");
    }
    return this.openAnalyticsAction("action_open_home");
  }
}

ZrnAnalyticsFormController.template = "zrn_analitics.FormView";

export const ZrnAnalyticsFormView = {
  ...formView,
  Controller: ZrnAnalyticsFormController,
};

registry.category("views").add("zrn_analitics_form", ZrnAnalyticsFormView);
