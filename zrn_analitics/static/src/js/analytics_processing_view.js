/** @odoo-module **/

import {
  QUERY_RESULT_LIMIT,
  SQL_TYPES,
  READ_ONLY_SQL_PATTERN,
  FORBIDDEN_SQL_PATTERN,
  aggregateValues,
  escapeHtml,
  getColumnLabel,
  quoteSqlIdentifier,
  sanitizeIdentifier,
  toChartNumber,
} from "./analytics_processing_utils";
import {
  fetchGoogleSheetSheet,
  normalizeGoogleSheetUrl,
  parseGoogleSheetSource,
  parseLocalSource,
} from "./analytics_processing_sources";
import {
  buildDatasetRecords,
  buildTableStructure,
  createDeferredSheetState,
  createSheetState,
  createTableState,
  getEffectiveEndRowIndex,
  validateTableStructure,
} from "./analytics_processing_tables";

export class ZrnAnalyticsProcessingView {
  constructor() {
    this.root = null;
    this.listenersAttached = false;
    this.boundHandleRootEvent = this.handleRootEvent.bind(this);
    this.boundBeforeUnload = this.handleBeforeUnload.bind(this);
    this.boundDocumentClick = this.handleDocumentClick.bind(this);
    this.chartInstance = null;
    this.chartRenderToken = 0;
    this.scenarioChartInstance = null;
    this.scenarioChartRenderToken = 0;
    this.registeredTableName = "";
    this.lastRegisteredSignature = "";
    this.navigationHandlers = {};
    this.orm = null;
    this.preserveStateOnUnmount = false;
    this.state = this.getInitialState();
  }

  setServices(services = {}) {
    this.orm = services.orm || this.orm;
  }

  setNavigationHandlers(handlers) {
    this.navigationHandlers = handlers || {};
  }

  async openWorkspaceRoute() {
    if (this.navigationHandlers.openWorkspace) {
      await this.navigationHandlers.openWorkspace();
      return;
    }
    const trigger = document.querySelector(".zrn_processing_workspace_trigger");
    if (trigger instanceof HTMLElement) {
      trigger.click();
      return;
    }
  }

  preserveStateOnce() {
    this.preserveStateOnUnmount = true;
  }

  cancelPreserveState() {
    this.preserveStateOnUnmount = false;
  }

  consumePreserveState() {
    const value = this.preserveStateOnUnmount;
    this.preserveStateOnUnmount = false;
    return value;
  }

  getInitialState() {
    return {
      sourceMeta: {
        type: "",
        name: "",
        extension: "",
        sizeLabel: "",
        iconClass: "fa-database",
        totalSheets: 0,
        loaded: false,
        url: "",
      },
      sourceInput: {
        googleSheetUrl: "",
        googleSheetDraft: "",
        googleSheetError: "",
        googleSheetModalOpen: false,
        mode: "",
        loading: false,
      },
      datasetConfig: {
        sheets: [],
        selectedSheetId: "",
        loadingSheetId: "",
        structureReady: false,
        structureDirty: false,
        statusLabel: "Sin origen",
      },
      queryState: {
        sql: "",
        running: false,
        error: "",
        columns: [],
        rows: [],
        json: "",
        totalRows: 0,
        activeView: "table",
        tableName: "",
      },
      queryBuilder: {
        selectedColumns: [],
        filters: [],
        limit: 20,
      },
      chartState: {
        type: "bar",
        categoryColumn: "",
        valueColumn: "",
        aggregate: "sum",
        error: "",
      },
      scenarioState: {
        groupByColumn: "",
        metricColumn: "",
        calculatedColumns: [],
        rules: [],
        activeView: "table",
        chartType: "bar",
        textDelimiter: "|",
      },
      sellInOutConfig: {
        matchColumn: "",
        matchTarget: "product",
        matchAttribute: "barcode",
        sellInColumn: "",
        sellOutColumn: "",
        quantityColumn: "",
        dateColumn: "",
        groupColumn: "",
      },
      matchState: {
        loading: false,
        error: "",
        records: [],
        totalRows: 0,
        matchedRows: 0,
        unmatchedRows: 0,
        targetLabel: "",
      },
      globalError: "",
    };
  }

  mount(root) {
    if (this.root !== root) {
      this.unmount();
      this.root = root;
      this.attachListeners();
    }
    this.render();
  }

  unmount() {
    if (!this.root) {
      return;
    }
    this.detachListeners();
    this.disposeChart();
    this.disposeScenarioChart();
    this.root.innerHTML = "";
    this.root = null;
  }

  destroy() {
    this.unmount();
    this.dropRegisteredTable();
    this.state = this.getInitialState();
  }

  attachListeners() {
    if (!this.root || this.listenersAttached) {
      return;
    }
    this.root.addEventListener("change", this.boundHandleRootEvent);
    this.root.addEventListener("input", this.boundHandleRootEvent);
    this.root.addEventListener("click", this.boundHandleRootEvent);
    window.addEventListener("beforeunload", this.boundBeforeUnload);
    document.addEventListener("click", this.boundDocumentClick, true);
    this.listenersAttached = true;
  }

  detachListeners() {
    if (!this.listenersAttached || !this.root) {
      return;
    }
    this.root.removeEventListener("change", this.boundHandleRootEvent);
    this.root.removeEventListener("input", this.boundHandleRootEvent);
    this.root.removeEventListener("click", this.boundHandleRootEvent);
    window.removeEventListener("beforeunload", this.boundBeforeUnload);
    document.removeEventListener("click", this.boundDocumentClick, true);
    this.listenersAttached = false;
  }

  get hasTransientData() {
    return Boolean(
      this.state.sourceMeta.loaded ||
        this.state.queryState.sql.trim() ||
        this.state.queryState.rows.length ||
        this.state.datasetConfig.sheets.length,
    );
  }

  get selectedSheet() {
    return (
      this.state.datasetConfig.sheets.find(
        (sheet) => sheet.id === this.state.datasetConfig.selectedSheetId,
      ) || null
    );
  }

  get selectedTable() {
    const sheet = this.selectedSheet;
    if (!sheet) {
      return null;
    }
    return sheet.tables.find((table) => table.id === sheet.selectedTableId) || null;
  }

  get activeTableName() {
    return this.selectedTable?.tableName || "dataset";
  }

  captureFocusedField() {
    if (!this.root || typeof document === "undefined") {
      return null;
    }
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement) || !this.root.contains(activeElement)) {
      return null;
    }
    if (!activeElement.matches("input, textarea, select")) {
      return null;
    }

    const action = activeElement.dataset.action || "";
    const selectorParts = [activeElement.tagName.toLowerCase()];
    if (action) {
      selectorParts.push(`[data-action="${this.escapeSelectorValue(action)}"]`);
    }

    for (const [key, value] of Object.entries(activeElement.dataset)) {
      if (key === "action" || !value) {
        continue;
      }
      selectorParts.push(
        `[data-${this.datasetKeyToAttribute(key)}="${this.escapeSelectorValue(value)}"]`,
      );
    }

    if (!action) {
      if (activeElement.id) {
        selectorParts.push(`#${this.escapeSelectorValue(activeElement.id)}`);
      } else if (activeElement.getAttribute("name")) {
        selectorParts.push(
          `[name="${this.escapeSelectorValue(activeElement.getAttribute("name"))}"]`,
        );
      } else {
        return null;
      }
    }

    const focusState = {
      selector: selectorParts.join(""),
      scrollLeft: activeElement.scrollLeft || 0,
      scrollTop: activeElement.scrollTop || 0,
      value: "value" in activeElement ? activeElement.value : "",
    };

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    ) {
      focusState.selectionStart = activeElement.selectionStart;
      focusState.selectionEnd = activeElement.selectionEnd;
      focusState.selectionDirection = activeElement.selectionDirection;
    }

    return focusState;
  }

  restoreFocusedField(focusState) {
    if (!this.root || !focusState?.selector) {
      return;
    }
    const target = this.root.querySelector(focusState.selector);
    if (!(target instanceof HTMLElement)) {
      return;
    }
    target.focus({ preventScroll: true });
    if (
      "value" in target &&
      target.value === focusState.value &&
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    ) {
      const selectionStart =
        typeof focusState.selectionStart === "number" ? focusState.selectionStart : null;
      const selectionEnd =
        typeof focusState.selectionEnd === "number" ? focusState.selectionEnd : null;
      if (selectionStart !== null && selectionEnd !== null) {
        target.setSelectionRange(
          selectionStart,
          selectionEnd,
          focusState.selectionDirection || "none",
        );
      }
    }
    if (typeof focusState.scrollLeft === "number") {
      target.scrollLeft = focusState.scrollLeft;
    }
    if (typeof focusState.scrollTop === "number") {
      target.scrollTop = focusState.scrollTop;
    }
  }

  datasetKeyToAttribute(key) {
    return key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }

  escapeSelectorValue(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(String(value));
    }
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  async confirmDiscardIfNeeded() {
    if (!this.hasTransientData) {
      return true;
    }
    return window.confirm(
      "El origen temporal, el mapeo y el trabajo de esta sesion se perderan al salir. Deseas continuar?",
    );
  }

  handleBeforeUnload(event) {
    if (!this.hasTransientData) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  }

  handleDocumentClick(event) {
    if (!this.root || !this.hasTransientData || !(event.target instanceof Element)) {
      return;
    }
    const target = event.target.closest("button, a");
    if (!target) {
      return;
    }
    if (target.closest("[data-zrn-processing-root='1']")) {
      if (!target.closest(".zrn_processing_leave_btn")) {
        return;
      }
    } else if (
      !target.closest(
        ".zrn_processing_leave_btn, .o_control_panel, .o_main_navbar, .o_menu_sections, .o_breadcrumb, .o_pager",
      )
    ) {
      return;
    }

    const canLeave = window.confirm(
      "El origen temporal y el mapeo se perderan si sales de Procesamiento. Deseas continuar?",
    );
    if (!canLeave) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  handleRootEvent(event) {
    const source = event.target.closest("[data-action]");
    const action = source?.dataset.action;
    if (!action) {
      return;
    }

    if (action === "file" && event.type === "change") {
      this.handleFileSelection(source);
      return;
    }
    if (action === "source-mode" && event.type === "click") {
      event.preventDefault();
      this.state.sourceInput.mode = source.dataset.mode || "";
      if (this.state.sourceInput.mode === "google_sheet") {
        this.openGoogleSheetModal();
        return;
      }
      this.render();
      return;
    }
    if (action === "google-sheet-url" && event.type === "input") {
      this.state.sourceInput.googleSheetDraft = source.value;
      this.state.sourceInput.googleSheetError = "";
      return;
    }
    if (action === "google-sheet-connect" && event.type === "click") {
      event.preventDefault();
      this.handleGoogleSheetConnect();
      return;
    }
    if (action === "google-sheet-close" && event.type === "click") {
      event.preventDefault();
      this.closeGoogleSheetModal();
      return;
    }
    if (action === "back-to-processing" && event.type === "click") {
      event.preventDefault();
      if (this.navigationHandlers.openLanding) {
        this.navigationHandlers.openLanding();
      }
      return;
    }
    if (action === "sheet-select" && event.type === "change") {
      this.selectSheet(source.value);
      return;
    }
    if (action === "table-select" && (event.type === "change" || event.type === "click")) {
      this.selectTable(source.value);
      return;
    }
    if (action === "table-add" && event.type === "click") {
      event.preventDefault();
      this.addTableDefinition();
      return;
    }
    if (action === "table-remove" && event.type === "click") {
      event.preventDefault();
      this.removeTableDefinition(source.dataset.tableId);
      return;
    }
    if (action === "table-name" && event.type === "input") {
      this.updateTableMeta("name", source.value);
      return;
    }
    if (action === "table-sql-name" && event.type === "input") {
      this.updateTableMeta("tableName", source.value);
      return;
    }
    if (action === "table-start-row" && event.type === "change") {
      this.updateTableRange("tableStartRowIndex", Number(source.value || 1) - 1);
      return;
    }
    if (action === "table-end-row" && event.type === "change") {
      this.updateTableRange("tableEndRowIndex", Number(source.value || 1) - 1);
      return;
    }
    if (action === "table-toggle-end" && event.type === "change") {
      this.updateTableFlag("hasEndRow", Boolean(source.checked));
      return;
    }
    if (action === "table-header-axis" && event.type === "change") {
      this.updateTableFlag("headerAxis", source.checked ? "column" : "row");
      return;
    }
    if (action === "table-start-column" && event.type === "change") {
      this.updateTableRange("tableStartColumnIndex", Number(source.value || 0));
      return;
    }
    if (action === "table-end-column" && event.type === "change") {
      this.updateTableRange("tableEndColumnIndex", Number(source.value || 0));
      return;
    }
    if (action === "apply-structure" && event.type === "click") {
      event.preventDefault();
      this.applyStructure();
      return;
    }
    if (action === "reset-source" && event.type === "click") {
      event.preventDefault();
      this.resetAll();
      return;
    }
    if (action === "sellio-config" && event.type === "change") {
      this.updateSellInOutConfig(source.dataset.field || "", source.value);
      return;
    }
    if (action === "sellio-match" && event.type === "click") {
      event.preventDefault();
      this.refreshSellInOutMatch();
      return;
    }
    if (action === "builder-column" && event.type === "change") {
      this.toggleBuilderColumn(source.value, Boolean(source.checked));
      return;
    }
    if (action === "builder-add-filter" && event.type === "click") {
      event.preventDefault();
      this.addBuilderFilter();
      return;
    }
    if (action === "builder-remove-filter" && event.type === "click") {
      event.preventDefault();
      this.removeBuilderFilter(source.dataset.filterId);
      return;
    }
    if (action === "builder-filter-column" && event.type === "change") {
      this.updateBuilderFilter(source.dataset.filterId, "column", source.value);
      return;
    }
    if (action === "builder-filter-operator" && event.type === "change") {
      this.updateBuilderFilter(source.dataset.filterId, "operator", source.value);
      return;
    }
    if (action === "builder-filter-value" && event.type === "input") {
      this.updateBuilderFilter(source.dataset.filterId, "value", source.value);
      return;
    }
    if (action === "builder-filter-value-to" && event.type === "input") {
      this.updateBuilderFilter(source.dataset.filterId, "valueTo", source.value);
      return;
    }
    if (action === "builder-limit" && event.type === "input") {
      const nextLimit = Number(source.value || 20);
      this.state.queryBuilder.limit =
        Number.isFinite(nextLimit) && nextLimit > 0 ? nextLimit : 20;
      return;
    }
    if (action === "builder-generate" && event.type === "click") {
      event.preventDefault();
      this.applyNoCodeQuery();
      return;
    }
    if (action === "builder-clear" && event.type === "click") {
      event.preventDefault();
      this.resetNoCodeQuery();
      return;
    }
    if (action === "sql-input" && event.type === "input") {
      this.state.queryState.sql = source.value;
      return;
    }
    if (action === "run-query" && event.type === "click") {
      event.preventDefault();
      this.runQuery();
      return;
    }
    if (action === "column-use" && event.type === "change") {
      this.updateColumnSetting(Number(source.dataset.columnIndex), "use", Boolean(source.checked));
      return;
    }
    if (action === "column-alias" && event.type === "input") {
      this.updateColumnSetting(Number(source.dataset.columnIndex), "alias", source.value);
      return;
    }
    if (action === "column-type" && event.type === "change") {
      this.updateColumnSetting(Number(source.dataset.columnIndex), "type", source.value);
      return;
    }
    if (action === "result-view" && event.type === "click") {
      event.preventDefault();
      this.state.queryState.activeView = source.dataset.view || "table";
      this.render();
      return;
    }
    if (action === "chart-type" && event.type === "change") {
      this.state.chartState.type = source.value;
      this.render();
      return;
    }
    if (action === "chart-category" && event.type === "change") {
      this.state.chartState.categoryColumn = source.value;
      this.render();
      return;
    }
    if (action === "chart-value" && event.type === "change") {
      this.state.chartState.valueColumn = source.value;
      this.render();
      return;
    }
    if (action === "chart-aggregate" && event.type === "change") {
      this.state.chartState.aggregate = source.value;
      this.render();
      return;
    }
    if (action === "scenario-group-column" && event.type === "change") {
      this.state.scenarioState.groupByColumn = source.value;
      this.render();
      return;
    }
    if (action === "scenario-metric-column" && event.type === "change") {
      this.state.scenarioState.metricColumn = source.value;
      this.render();
      return;
    }
    if (action === "scenario-view" && event.type === "click") {
      this.state.scenarioState.activeView = source.dataset.view || "table";
      this.render();
      return;
    }
    if (action === "scenario-chart-type" && event.type === "click") {
      this.state.scenarioState.activeView = "chart";
      this.state.scenarioState.chartType = source.dataset.chartType || "bar";
      this.render();
      return;
    }
    if (action === "scenario-text-delimiter" && event.type === "input") {
      this.state.scenarioState.textDelimiter = String(source.value || "|").slice(0, 1) || "|";
      return;
    }
    if (action === "scenario-export" && event.type === "click") {
      this.exportScenarioData(source.dataset.format || "");
      return;
    }
    if (action === "scenario-add-formula" && event.type === "click") {
      this.state.scenarioState.calculatedColumns.push(this.createScenarioCalculatedColumn());
      this.render();
      return;
    }
    if (action === "scenario-remove-formula" && event.type === "click") {
      const formulaId = source.dataset.formulaId || "";
      this.state.scenarioState.calculatedColumns =
        this.state.scenarioState.calculatedColumns.filter((item) => item.id !== formulaId);
      this.render();
      return;
    }
    if (action === "scenario-formula-field" && (event.type === "change" || event.type === "input")) {
      const formulaId = source.dataset.formulaId || "";
      const field = source.dataset.field || "";
      const formula = this.state.scenarioState.calculatedColumns.find((item) => item.id === formulaId);
      if (formula && field) {
        formula[field] = source.type === "checkbox" ? source.checked : source.value;
        this.syncScenarioDefaults();
        this.render();
      }
      return;
    }
    if (action === "scenario-add-rule" && event.type === "click") {
      this.state.scenarioState.rules.push(this.createScenarioRule());
      this.render();
      return;
    }
    if (action === "scenario-remove-rule" && event.type === "click") {
      const ruleId = source.dataset.ruleId || "";
      this.state.scenarioState.rules = this.state.scenarioState.rules.filter((item) => item.id !== ruleId);
      this.syncScenarioDefaults();
      this.render();
      return;
    }
    if (action === "scenario-rule-field" && (event.type === "change" || event.type === "input")) {
      const ruleId = source.dataset.ruleId || "";
      const field = source.dataset.field || "";
      const rule = this.state.scenarioState.rules.find((item) => item.id === ruleId);
      if (rule && field) {
        rule[field] = source.type === "checkbox" ? source.checked : source.value;
        this.syncScenarioDefaults();
        this.render();
      }
    }
  }

  async handleFileSelection(input) {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (this.state.sourceMeta.loaded) {
      const shouldReplace = window.confirm(
        "Cargar un nuevo origen reemplazara el dataset temporal actual. Deseas continuar?",
      );
      if (!shouldReplace) {
        input.value = "";
        return;
      }
    }
    try {
      await this.loadParsedSource(await parseLocalSource(file));
    } catch (error) {
      this.setErrorState(error);
    } finally {
      input.value = "";
    }
  }

  async handleGoogleSheetConnect() {
    if (this.state.sourceMeta.loaded) {
      const shouldReplace = window.confirm(
        "Conectar un Google Sheet reemplazara el dataset temporal actual. Deseas continuar?",
      );
      if (!shouldReplace) {
        return;
      }
    }
    try {
      const normalized = normalizeGoogleSheetUrl(this.state.sourceInput.googleSheetDraft);
      this.state.sourceInput.loading = true;
      this.state.globalError = "";
      this.state.sourceInput.googleSheetError = "";
      this.state.sourceInput.googleSheetUrl = normalized.cleanUrl;
      this.render();
      await this.loadParsedSource(
        await parseGoogleSheetSource(normalized.cleanUrl),
      );
    } catch (error) {
      this.state.sourceInput.googleSheetError =
        error.message || "No se pudo validar el Google Sheet.";
      this.render();
    } finally {
      this.state.sourceInput.loading = false;
      this.render();
    }
  }

  openGoogleSheetModal() {
    this.state.sourceInput.googleSheetModalOpen = true;
    this.state.sourceInput.googleSheetDraft =
      this.state.sourceInput.googleSheetUrl || this.state.sourceMeta.url || "";
    this.state.sourceInput.googleSheetError = "";
    this.render();
  }

  closeGoogleSheetModal() {
    if (this.state.sourceInput.loading) {
      return;
    }
    this.state.sourceInput.googleSheetModalOpen = false;
    this.state.sourceInput.googleSheetError = "";
    this.state.sourceInput.mode = "";
    this.render();
  }

  async loadParsedSource(parsedSource) {
    this.dropRegisteredTable();
    this.disposeChart();
    const sheets = (parsedSource.sheets || []).map((sheet, index) =>
      sheet.rawRows ? createSheetState(sheet, index) : createDeferredSheetState(sheet, index),
    );
    if (!sheets.length) {
      throw new Error("El origen no genero hojas utilizables.");
    }
    this.state = this.getInitialState();
    this.state.sourceMeta = {
      type: parsedSource.sourceType,
      name: parsedSource.sourceLabel,
      extension: parsedSource.sourceMeta.extension,
      sizeLabel: parsedSource.sourceMeta.sizeLabel,
      iconClass: parsedSource.sourceMeta.iconClass,
      totalSheets: parsedSource.sourceMeta.totalSheets,
      loaded: true,
      url: parsedSource.sourceMeta.url || "",
    };
    this.state.sourceInput.googleSheetUrl = parsedSource.sourceMeta.url || "";
    this.state.sourceInput.googleSheetDraft = parsedSource.sourceMeta.url || "";
    this.state.sourceInput.googleSheetError = "";
    this.state.sourceInput.googleSheetModalOpen = false;
    this.state.datasetConfig.sheets = sheets;
    this.state.datasetConfig.selectedSheetId = sheets[0].id;
    this.state.datasetConfig.loadingSheetId = sheets[0].loaded ? "" : sheets[0].id;
    this.state.datasetConfig.statusLabel = "Origen cargado";
    await this.ensureSelectedSheetLoaded();
    this.state.datasetConfig.loadingSheetId = "";
    this.state.queryState.tableName = this.selectedTable?.tableName || "";
    this.syncQueryStateWithTable(true);
    if (this.screenMode === "landing") {
      try {
        await this.openWorkspaceRoute();
      } catch (error) {
        console.warn("No se pudo abrir la vista workspace de procesamiento.", error);
      }
      if (this.root && this.screenMode === "landing") {
        this.root.dataset.zrnProcessingScreen = "workspace";
        this.render();
      }
      return;
    }
    this.render();
  }

  setErrorState(error) {
    this.state.globalError = error.message || "No se pudo cargar el origen.";
    this.render();
  }

  async selectSheet(sheetId) {
    this.state.datasetConfig.selectedSheetId = sheetId;
    const sheet = this.selectedSheet;
    if (!sheet) {
      return;
    }
    this.state.datasetConfig.loadingSheetId = sheet.loaded ? "" : sheet.id;
    this.render();
    await this.ensureSelectedSheetLoaded();
    this.state.datasetConfig.loadingSheetId = "";
    if (!sheet.selectedTableId && sheet.tables[0]) {
      sheet.selectedTableId = sheet.tables[0].id;
    }
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable();
    this.render();
  }

  async ensureSelectedSheetLoaded() {
    const sheet = this.selectedSheet;
    if (!sheet || sheet.loaded || this.state.sourceMeta.type !== "google_sheet") {
      return;
    }
    const loadedSheet = await fetchGoogleSheetSheet(
      this.state.sourceInput.googleSheetUrl || this.state.sourceMeta.url,
      sheet.remoteIndex || 0,
    );
    const hydrated = createSheetState(loadedSheet, sheet.remoteIndex || 0);
    hydrated.id = sheet.id;
    hydrated.remoteIndex = sheet.remoteIndex;
    hydrated.loaded = true;
    const index = this.state.datasetConfig.sheets.findIndex((item) => item.id === sheet.id);
    if (index >= 0) {
      this.state.datasetConfig.sheets[index] = hydrated;
    }
  }

  selectTable(tableId) {
    const sheet = this.selectedSheet;
    if (!sheet) {
      return;
    }
    sheet.selectedTableId = tableId;
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable(true);
    this.render();
  }

  addTableDefinition() {
    const sheet = this.selectedSheet;
    if (!sheet) {
      return;
    }
    const index = sheet.tables.length;
    const baseTable = this.selectedTable;
    const newTable = createTableState(
      sheet.rawRows,
      sheet.name,
      {
        name: `tabla_${index + 1}`,
        tableStartRowIndex: baseTable?.tableStartRowIndex || 0,
        tableEndRowIndex: baseTable?.tableEndRowIndex || Math.max(1, sheet.rawRows.length - 1),
        tableStartColumnIndex: baseTable?.tableStartColumnIndex || 0,
        tableEndColumnIndex: baseTable?.tableEndColumnIndex || 0,
        hasEndRow: baseTable?.hasEndRow ?? true,
        headerAxis: baseTable?.headerAxis || "row",
      },
      index,
    );
    sheet.tables.push(newTable);
    sheet.selectedTableId = newTable.id;
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable(true);
    this.render();
  }

  removeTableDefinition(tableId) {
    const sheet = this.selectedSheet;
    if (!sheet || sheet.tables.length <= 1) {
      return;
    }
    const currentTable = this.selectedTable;
    if (
      currentTable?.id === tableId &&
      !window.confirm("Se eliminara la definicion de tabla seleccionada. Deseas continuar?")
    ) {
      return;
    }
    sheet.tables = sheet.tables.filter((table) => table.id !== tableId);
    if (!sheet.tables.some((table) => table.id === sheet.selectedTableId)) {
      sheet.selectedTableId = sheet.tables[0]?.id || "";
    }
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable(true);
    this.render();
  }

  updateTableMeta(key, value) {
    const table = this.selectedTable;
    if (!table) {
      return;
    }
    if (key === "tableName") {
      table.tableName = sanitizeIdentifier(value, "dataset");
    } else {
      table[key] = value;
    }
    table.errors = validateTableStructure(table, this.selectedSheet?.rawRows || []);
    table.structureDirty = true;
    table.structureApplied = false;
    this.refreshDatasetStatus();
    this.syncQueryStateWithTable();
    this.render();
  }

  updateTableRange(key, value) {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows;
    if (!table || !rawRows) {
      return;
    }
    table[key] = value;
    if (key === "tableStartColumnIndex" && table.tableEndColumnIndex < value) {
      table.tableEndColumnIndex = value;
    }
    if (key === "tableEndColumnIndex" && value < table.tableStartColumnIndex) {
      table.tableStartColumnIndex = value;
    }
    if (key === "tableStartRowIndex" && table.tableEndRowIndex <= value) {
      table.tableEndRowIndex = Math.min(rawRows.length - 1, value + 1);
    }
    if (key === "tableEndRowIndex" && value <= table.tableStartRowIndex) {
      table.tableStartRowIndex = Math.max(0, value - 1);
    }
    buildTableStructure(table, rawRows, { keepAliases: false });
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable();
    this.render();
  }

  updateTableFlag(key, value) {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows;
    if (!table || !rawRows) {
      return;
    }
    table[key] = value;
    if (key === "hasEndRow" && !value) {
      table.tableEndRowIndex = rawRows.length - 1;
    }
    if (key === "headerAxis") {
      if (value === "column" && table.tableEndColumnIndex <= table.tableStartColumnIndex) {
        table.tableEndColumnIndex = Math.min(
          Math.max(table.tableStartColumnIndex + 1, table.tableEndColumnIndex + 1),
          Math.max(...rawRows.map((row) => row.length), 1) - 1,
        );
      }
    }
    buildTableStructure(table, rawRows, { keepAliases: false });
    this.refreshDatasetStatus();
    this.clearQueryResults();
    this.syncQueryStateWithTable(true);
    this.render();
  }

  updateColumnSetting(index, key, value) {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows;
    if (!table || !rawRows) {
      return;
    }
    const column = table.columns[index];
    if (!column) {
      return;
    }
    column[key] = value;
    table.errors = validateTableStructure(table, rawRows);
    table.structureDirty = true;
    table.structureApplied = false;
    this.refreshDatasetStatus();
    this.syncNoCodeQueryBuilder();
    if (key !== "alias") {
      this.render();
    }
  }

  refreshDatasetStatus() {
    const table = this.selectedTable;
    const ready = Boolean(
      table && table.structureApplied && !table.structureDirty && !table.errors.length,
    );
    this.state.datasetConfig.structureReady = ready;
    this.state.datasetConfig.structureDirty = Boolean(table?.structureDirty);
    this.state.datasetConfig.statusLabel = table?.errors.length
      ? "Requiere ajustes"
      : ready
        ? "Dataset listo"
        : this.state.sourceMeta.loaded
          ? "Pendiente de aplicar"
          : "Sin origen";
  }

  buildDatasetSignature(table) {
    return JSON.stringify({
      id: table.id,
      name: table.name,
      tableName: table.tableName,
      tableStartRowIndex: table.tableStartRowIndex,
      tableEndRowIndex: table.tableEndRowIndex,
      tableStartColumnIndex: table.tableStartColumnIndex,
      tableEndColumnIndex: table.tableEndColumnIndex,
      hasEndRow: table.hasEndRow,
      headerAxis: table.headerAxis,
      columns: table.columns.map((column) => ({
        use: column.use,
        alias: sanitizeIdentifier(column.alias, `column_${column.index + 1}`),
        type: column.type,
      })),
    });
  }

  dropRegisteredTable() {
    if (!window.alasql || !this.registeredTableName) {
      this.registeredTableName = "";
      this.lastRegisteredSignature = "";
      return;
    }
    try {
      window.alasql(`DROP TABLE IF EXISTS ${quoteSqlIdentifier(this.registeredTableName)}`);
    } catch {
      // Ignore stale temporary table errors.
    }
    this.registeredTableName = "";
    this.lastRegisteredSignature = "";
  }

  registerSelectedTable() {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows;
    if (!table || !rawRows) {
      return;
    }
    if (!window.alasql) {
      throw new Error("La libreria SQL no esta disponible.");
    }
    const signature = this.buildDatasetSignature(table);
    if (this.registeredTableName === table.tableName && this.lastRegisteredSignature === signature) {
      return;
    }
    this.dropRegisteredTable();
    const records = buildDatasetRecords(table, rawRows);
    window.alasql(`CREATE TABLE ${quoteSqlIdentifier(table.tableName)}`);
    window.alasql.tables[table.tableName].data = records;
    this.registeredTableName = table.tableName;
    this.lastRegisteredSignature = signature;
  }

  validateReadOnlyQuery(sql) {
    const normalized = String(sql || "").trim();
    if (!normalized) {
      return "Escribe una consulta SQL para ejecutar.";
    }
    if (!READ_ONLY_SQL_PATTERN.test(normalized)) {
      return "Solo se permiten consultas SELECT en esta version.";
    }
    if (FORBIDDEN_SQL_PATTERN.test(normalized)) {
      return "La consulta contiene instrucciones no soportadas. Usa solo SQL de lectura.";
    }
    return "";
  }

  buildSampleQuery(tableName) {
    return `SELECT *\nFROM ${quoteSqlIdentifier(tableName)}\nLIMIT 20;`;
  }

  getBuilderColumns() {
    const table = this.selectedTable;
    return table?.columns.filter((column) => column.use) || [];
  }

  getBuilderColumnByAlias(alias) {
    return this.getBuilderColumns().find(
      (column) => sanitizeIdentifier(column.alias, `column_${column.index + 1}`) === alias,
    );
  }

  getBuilderOperators(type) {
    if (type === "number" || type === "date") {
      return [
        ["eq", "Igual"],
        ["gt", "Mayor que"],
        ["gte", "Mayor o igual"],
        ["lt", "Menor que"],
        ["lte", "Menor o igual"],
        ["between", "Entre"],
      ];
    }
    if (type === "boolean") {
      return [["eq", "Igual"]];
    }
    return [
      ["eq", "Igual"],
      ["like", "Contiene"],
      ["starts", "Empieza con"],
      ["ends", "Termina con"],
    ];
  }

  buildBuilderValue(column, value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      return "";
    }
    if (column?.type === "number") {
      const parsed = Number(normalized.replace(/,/g, ""));
      return Number.isFinite(parsed) ? String(parsed) : "";
    }
    if (column?.type === "boolean") {
      return /^(true|si|yes|1)$/i.test(normalized) ? "true" : "false";
    }
    return `'${normalized.replace(/'/g, "''")}'`;
  }

  syncNoCodeQueryBuilder() {
    const columns = this.getBuilderColumns();
    const allowedAliases = new Set(
      columns.map((column) => sanitizeIdentifier(column.alias, `column_${column.index + 1}`)),
    );
    const currentSelected = this.state.queryBuilder.selectedColumns.filter((alias) =>
      allowedAliases.has(alias),
    );
    this.state.queryBuilder.selectedColumns = currentSelected.length
      ? currentSelected
      : Array.from(allowedAliases);

    this.state.queryBuilder.filters = this.state.queryBuilder.filters
      .filter((filter) => allowedAliases.has(filter.column))
      .map((filter) => {
        const column = this.getBuilderColumnByAlias(filter.column);
        const operators = this.getBuilderOperators(column?.type);
        const hasOperator = operators.some(([operator]) => operator === filter.operator);
        return {
          ...filter,
          operator: hasOperator ? filter.operator : operators[0][0],
        };
      });
  }

  toggleBuilderColumn(alias, checked) {
    const current = new Set(this.state.queryBuilder.selectedColumns);
    if (checked) {
      current.add(alias);
    } else {
      current.delete(alias);
    }
    this.state.queryBuilder.selectedColumns = Array.from(current);
  }

  addBuilderFilter() {
    const firstColumn = this.getBuilderColumns()[0];
    if (!firstColumn) {
      return;
    }
    const alias = sanitizeIdentifier(firstColumn.alias, `column_${firstColumn.index + 1}`);
    const operator = this.getBuilderOperators(firstColumn.type)[0][0];
    this.state.queryBuilder.filters.push({
      id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      column: alias,
      operator,
      value: "",
      valueTo: "",
    });
    this.render();
  }

  removeBuilderFilter(filterId) {
    this.state.queryBuilder.filters = this.state.queryBuilder.filters.filter(
      (filter) => filter.id !== filterId,
    );
    this.render();
  }

  updateBuilderFilter(filterId, key, value) {
    const filter = this.state.queryBuilder.filters.find((item) => item.id === filterId);
    if (!filter) {
      return;
    }
    filter[key] = value;
    if (key === "column") {
      const column = this.getBuilderColumnByAlias(value);
      filter.operator = this.getBuilderOperators(column?.type)[0][0];
      filter.value = "";
      filter.valueTo = "";
    }
    this.render();
  }

  buildNoCodeQuery() {
    const columns = this.getBuilderColumns();
    const selectedColumns = this.state.queryBuilder.selectedColumns.length
      ? this.state.queryBuilder.selectedColumns
      : columns.map((column) => sanitizeIdentifier(column.alias, `column_${column.index + 1}`));
    const selectSql = selectedColumns.length
      ? selectedColumns.map((alias) => quoteSqlIdentifier(alias)).join(", ")
      : "*";

    const whereParts = this.state.queryBuilder.filters
      .map((filter) => {
        const column = this.getBuilderColumnByAlias(filter.column);
        if (!column) {
          return "";
        }
        const identifier = quoteSqlIdentifier(filter.column);
        const valueSql = this.buildBuilderValue(column, filter.value);
        const valueToSql = this.buildBuilderValue(column, filter.valueTo);
        if (!valueSql && filter.operator !== "between") {
          return "";
        }
        if (filter.operator === "eq") {
          return `${identifier} = ${valueSql}`;
        }
        if (filter.operator === "gt") {
          return `${identifier} > ${valueSql}`;
        }
        if (filter.operator === "gte") {
          return `${identifier} >= ${valueSql}`;
        }
        if (filter.operator === "lt") {
          return `${identifier} < ${valueSql}`;
        }
        if (filter.operator === "lte") {
          return `${identifier} <= ${valueSql}`;
        }
        if (filter.operator === "between") {
          if (!valueSql || !valueToSql) {
            return "";
          }
          return `${identifier} BETWEEN ${valueSql} AND ${valueToSql}`;
        }
        const rawValue = String(filter.value ?? "").trim().replace(/'/g, "''");
        if (!rawValue) {
          return "";
        }
        if (filter.operator === "starts") {
          return `${identifier} LIKE '${rawValue}%'`;
        }
        if (filter.operator === "ends") {
          return `${identifier} LIKE '%${rawValue}'`;
        }
        return `${identifier} LIKE '%${rawValue}%'`;
      })
      .filter(Boolean);

    const whereSql = whereParts.length ? `\nWHERE ${whereParts.join("\n  AND ")}` : "";
    const limitSql =
      this.state.queryBuilder.limit > 0 ? `\nLIMIT ${this.state.queryBuilder.limit};` : ";";
    return `SELECT ${selectSql}\nFROM ${quoteSqlIdentifier(this.activeTableName)}${whereSql}${limitSql}`;
  }

  applyNoCodeQuery() {
    this.state.queryState.sql = this.buildNoCodeQuery();
    this.runQuery();
  }

  resetNoCodeQuery() {
    this.state.queryBuilder.filters = [];
    this.state.queryBuilder.limit = 20;
    this.syncNoCodeQueryBuilder();
    this.state.queryState.sql = this.buildSampleQuery(this.activeTableName);
    this.render();
  }

  syncQueryStateWithTable(forceSql = false) {
    const table = this.selectedTable;
    this.state.queryState.tableName = table?.tableName || "";
    if (
      forceSql ||
      !this.state.queryState.sql.trim() ||
      this.state.queryState.sql.includes("FROM [")
    ) {
      this.state.queryState.sql = table ? this.buildSampleQuery(table.tableName) : "";
    }
    this.syncNoCodeQueryBuilder();
  }

  clearQueryResults() {
    this.state.queryState.error = "";
    this.state.queryState.columns = [];
    this.state.queryState.rows = [];
    this.state.queryState.json = "";
    this.state.queryState.totalRows = 0;
    this.state.chartState.error = "";
    this.state.scenarioState.groupByColumn = "";
    this.state.scenarioState.metricColumn = "";
    this.state.scenarioState.calculatedColumns = [];
    this.state.scenarioState.rules = [];
    this.state.scenarioState.activeView = "table";
    this.state.scenarioState.chartType = "bar";
    this.state.matchState.error = "";
    this.state.matchState.records = [];
    this.state.matchState.totalRows = 0;
    this.state.matchState.matchedRows = 0;
    this.state.matchState.unmatchedRows = 0;
    this.disposeChart();
    this.disposeScenarioChart();
  }

  applyStructure(silent = false) {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows;
    if (!table || !rawRows) {
      return;
    }
    try {
      table.errors = validateTableStructure(table, rawRows);
      if (table.errors.length) {
        this.refreshDatasetStatus();
        if (!silent) {
          this.render();
        }
        return;
      }
      this.registerSelectedTable();
      table.structureApplied = true;
      table.structureDirty = false;
      this.refreshDatasetStatus();
      this.syncSellInOutDefaults(true);
      this.state.matchState.records = [];
      this.state.matchState.totalRows = 0;
      this.state.matchState.matchedRows = 0;
      this.state.matchState.unmatchedRows = 0;
      this.state.queryState.tableName = table.tableName;
      if (!this.state.queryState.sql.trim()) {
        this.state.queryState.sql = this.buildSampleQuery(table.tableName);
      }
      if (!silent) {
        this.render();
      }
    } catch (error) {
      this.state.queryState.error = error.message || "No se pudo preparar el dataset temporal.";
      this.refreshDatasetStatus();
      if (!silent) {
        this.render();
      }
    }
  }

  runQuery() {
    const queryError = this.validateReadOnlyQuery(this.state.queryState.sql);
    if (queryError) {
      this.clearQueryResults();
      this.state.queryState.error = queryError;
      this.render();
      return;
    }

    try {
      this.state.queryState.running = true;
      this.state.queryState.error = "";
      this.applyStructure(true);
      if (!this.state.datasetConfig.structureReady) {
        return;
      }
      const rawResult = window.alasql(this.state.queryState.sql);
      const resultRows = Array.isArray(rawResult) ? rawResult : [{ resultado: rawResult }];
      const previewRows = resultRows.slice(0, QUERY_RESULT_LIMIT);
      const previousColumns = [...this.state.queryState.columns];
      this.state.queryState.columns = previewRows.length ? Object.keys(previewRows[0]) : [];
      this.state.queryState.rows = previewRows;
      this.state.queryState.json = JSON.stringify(previewRows, null, 2);
      this.state.queryState.totalRows = Array.isArray(rawResult) ? rawResult.length : 1;
      this.state.queryState.activeView = this.state.queryState.activeView || "table";
      this.syncChartDefaults();
      this.syncScenarioDefaults(previousColumns);
      this.state.chartState.error = "";
    } catch (error) {
      this.clearQueryResults();
      this.state.queryState.error = error.message || "La consulta no pudo ejecutarse.";
    } finally {
      this.state.queryState.running = false;
      this.render();
    }
  }

  syncChartDefaults() {
    const chartColumns = this.state.queryState.columns;
    const numericColumns = chartColumns.filter((column) =>
      this.state.queryState.rows.some((row) => toChartNumber(row[column]) !== null),
    );
    if (!chartColumns.length || !numericColumns.length) {
      this.state.chartState.categoryColumn = "";
      this.state.chartState.valueColumn = "";
      return;
    }
    if (!chartColumns.includes(this.state.chartState.categoryColumn)) {
      this.state.chartState.categoryColumn = chartColumns[0];
    }
    if (!numericColumns.includes(this.state.chartState.valueColumn)) {
      this.state.chartState.valueColumn = numericColumns[0];
    }
  }

  createScenarioCalculatedColumn() {
    return {
      id: `scenario_formula_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enabled: true,
      name: `calculo_${this.state.scenarioState.calculatedColumns.length + 1}`,
      leftColumn: "",
      operator: "*",
      rightColumn: "",
    };
  }

  createScenarioRule() {
    return {
      id: `scenario_rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      enabled: true,
      name: `Regla ${this.state.scenarioState.rules.length + 1}`,
      conditionColumn: "",
      conditionOperator: "eq",
      conditionValue: "",
      targetColumn: "",
      actionType: "add",
      actionValue: "",
      outputColumnMode: "replace",
      outputColumnName: "",
    };
  }

  getQueryNumericColumns(rows = this.state.queryState.rows, columns = this.state.queryState.columns) {
    return columns.filter((column) => rows.some((row) => toChartNumber(row[column]) !== null));
  }

  getScenarioOptionSets() {
    const resultColumns = this.state.queryState.columns;
    const numericColumns = this.getQueryNumericColumns();
    const calculatedColumns = [];
    const usedCalculated = new Set();
    this.state.scenarioState.calculatedColumns.forEach((item) => {
      const name = String(item.name || "").trim();
      if (name && !usedCalculated.has(name)) {
        usedCalculated.add(name);
        calculatedColumns.push(name);
      }
    });
    const ruleOutputColumns = [];
    const usedRuleOutputs = new Set();
    this.state.scenarioState.rules.forEach((item) => {
      const name =
        item.outputColumnMode === "new_column" ? String(item.outputColumnName || "").trim() : "";
      if (name && !usedRuleOutputs.has(name)) {
        usedRuleOutputs.add(name);
        ruleOutputColumns.push(name);
      }
    });
    return {
      resultColumns,
      numericColumns,
      groupColumns: resultColumns,
      conditionColumns: [...resultColumns, ...calculatedColumns, ...ruleOutputColumns],
      metricColumns: [...numericColumns, ...calculatedColumns, ...ruleOutputColumns],
      targetColumns: [...numericColumns, ...calculatedColumns, ...ruleOutputColumns],
    };
  }

  syncScenarioDefaults() {
    const optionSets = this.getScenarioOptionSets();
    if (!this.state.queryState.rows.length || !optionSets.resultColumns.length) {
      this.state.scenarioState.groupByColumn = "";
      this.state.scenarioState.metricColumn = "";
      this.state.scenarioState.calculatedColumns = [];
      this.state.scenarioState.rules = [];
      return;
    }

    if (!optionSets.groupColumns.includes(this.state.scenarioState.groupByColumn)) {
      this.state.scenarioState.groupByColumn = optionSets.groupColumns[0] || "";
    }
    if (!optionSets.metricColumns.includes(this.state.scenarioState.metricColumn)) {
      this.state.scenarioState.metricColumn = optionSets.metricColumns[0] || "";
    }

    this.state.scenarioState.calculatedColumns.forEach((item) => {
      if (!optionSets.numericColumns.includes(item.leftColumn)) {
        item.leftColumn = "";
      }
      if (!optionSets.numericColumns.includes(item.rightColumn)) {
        item.rightColumn = "";
      }
    });

    const liveOptions = this.getScenarioOptionSets();
    this.state.scenarioState.rules.forEach((item) => {
      if (!liveOptions.conditionColumns.includes(item.conditionColumn)) {
        item.conditionColumn = "";
      }
      if (!liveOptions.targetColumns.includes(item.targetColumn)) {
        item.targetColumn = "";
      }
      if (item.outputColumnMode !== "new_column") {
        item.outputColumnName = "";
      }
    });

    const refreshedOptions = this.getScenarioOptionSets();
    if (!refreshedOptions.metricColumns.includes(this.state.scenarioState.metricColumn)) {
      this.state.scenarioState.metricColumn = refreshedOptions.metricColumns[0] || "";
    }
  }

  formatMetric(value, decimals = 2) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return new Intl.NumberFormat("es-GT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  evaluateScenarioFormula(operator, leftValue, rightValue) {
    switch (operator) {
      case "+":
        return leftValue + rightValue;
      case "-":
        return leftValue - rightValue;
      case "*":
        return leftValue * rightValue;
      case "/":
        return rightValue === 0 ? null : leftValue / rightValue;
      default:
        return null;
    }
  }

  evaluateScenarioCondition(row, rule) {
    const currentValue = row?.[rule.conditionColumn];
    const compareValue = rule.conditionValue;
    const numericCurrent = toChartNumber(currentValue);
    const numericCompare = toChartNumber(compareValue);

    switch (rule.conditionOperator) {
      case "eq":
        if (numericCurrent !== null && numericCompare !== null) {
          return numericCurrent === numericCompare;
        }
        return String(currentValue ?? "").toLowerCase() === String(compareValue ?? "").toLowerCase();
      case "neq":
        if (numericCurrent !== null && numericCompare !== null) {
          return numericCurrent !== numericCompare;
        }
        return String(currentValue ?? "").toLowerCase() !== String(compareValue ?? "").toLowerCase();
      case "contains":
        return String(currentValue ?? "").toLowerCase().includes(String(compareValue ?? "").toLowerCase());
      case "gt":
        return numericCurrent !== null && numericCompare !== null && numericCurrent > numericCompare;
      case "gte":
        return numericCurrent !== null && numericCompare !== null && numericCurrent >= numericCompare;
      case "lt":
        return numericCurrent !== null && numericCompare !== null && numericCurrent < numericCompare;
      case "lte":
        return numericCurrent !== null && numericCompare !== null && numericCurrent <= numericCompare;
      default:
        return false;
    }
  }

  applyScenarioAction(currentValue, actionType, actionValue) {
    const currentNumber = toChartNumber(currentValue);
    const deltaNumber = toChartNumber(actionValue);
    if (currentNumber === null || deltaNumber === null) {
      return null;
    }

    switch (actionType) {
      case "add":
        return currentNumber + deltaNumber;
      case "subtract":
        return currentNumber - deltaNumber;
      case "multiply":
        return currentNumber * deltaNumber;
      case "set":
        return deltaNumber;
      case "percent_delta":
        return currentNumber * (1 + deltaNumber / 100);
      default:
        return null;
    }
  }

  getScenarioPanelData() {
    const rows = this.state.queryState.rows;
    if (!rows.length) {
      return { error: "Ejecuta una consulta para habilitar escenarios sobre ese resultado." };
    }

    const warnings = [];
    const baseRows = rows.map((row) => ({ ...row }));
    const duplicateNames = new Set();
    const usedNames = new Set(this.state.queryState.columns);
    const numericSourceColumns = this.getQueryNumericColumns();

    this.state.scenarioState.calculatedColumns.forEach((formula) => {
      if (!formula.enabled) {
        return;
      }
      const formulaName = String(formula.name || "").trim();
      if (!formulaName || !formula.leftColumn || !formula.rightColumn) {
        warnings.push(`La columna calculada "${formula.name || "sin nombre"}" esta incompleta.`);
        return;
      }
      if (usedNames.has(formulaName)) {
        if (!duplicateNames.has(formulaName)) {
          warnings.push(`La columna calculada "${formulaName}" esta duplicada y se omitio.`);
          duplicateNames.add(formulaName);
        }
        return;
      }
      if (
        !numericSourceColumns.includes(formula.leftColumn) ||
        !numericSourceColumns.includes(formula.rightColumn)
      ) {
        warnings.push(`La columna calculada "${formulaName}" referencia columnas no numericas.`);
        return;
      }
      let divisionByZero = false;
      baseRows.forEach((row) => {
        const leftValue = toChartNumber(row[formula.leftColumn]) || 0;
        const rightValue = toChartNumber(row[formula.rightColumn]) || 0;
        const result = this.evaluateScenarioFormula(formula.operator, leftValue, rightValue);
        if (result === null && formula.operator === "/") {
          divisionByZero = true;
        }
        row[formulaName] = result;
      });
      if (divisionByZero) {
        warnings.push(`La columna calculada "${formulaName}" encontro divisiones entre cero.`);
      }
      usedNames.add(formulaName);
    });

    const scenarioRows = baseRows.map((row) => ({ ...row }));
    this.state.scenarioState.rules.forEach((rule) => {
      if (!rule.enabled) {
        return;
      }
      const ruleName = String(rule.name || "Regla").trim();
      if (!rule.conditionColumn || !rule.targetColumn || !String(rule.actionValue || "").trim()) {
        warnings.push(`${ruleName} esta incompleta y no se aplico.`);
        return;
      }
      const targetOnNewColumn = rule.outputColumnMode === "new_column";
      const outputColumnName = String(rule.outputColumnName || "").trim();
      const targetColumnName = targetOnNewColumn ? outputColumnName : rule.targetColumn;
      if (targetOnNewColumn && !outputColumnName) {
        warnings.push(`${ruleName} necesita un nombre de columna de salida.`);
        return;
      }
      const targetIsNumeric = scenarioRows.some((row) => toChartNumber(row[rule.targetColumn]) !== null);
      if (!targetIsNumeric) {
        warnings.push(`${ruleName} apunta a una columna no numerica.`);
        return;
      }
      if (targetOnNewColumn) {
        baseRows.forEach((row) => {
          row[targetColumnName] = toChartNumber(row[rule.targetColumn]);
        });
        scenarioRows.forEach((row) => {
          row[targetColumnName] = toChartNumber(row[rule.targetColumn]);
        });
      }
      scenarioRows.forEach((row) => {
        if (!this.evaluateScenarioCondition(row, rule)) {
          return;
        }
        const nextValue = this.applyScenarioAction(row[targetColumnName], rule.actionType, rule.actionValue);
        if (nextValue !== null) {
          row[targetColumnName] = nextValue;
        }
      });
    });

    const optionSets = this.getScenarioOptionSets();
    const groupByColumn = optionSets.groupColumns.includes(this.state.scenarioState.groupByColumn)
      ? this.state.scenarioState.groupByColumn
      : optionSets.groupColumns[0] || "";
    const metricColumn = optionSets.metricColumns.includes(this.state.scenarioState.metricColumn)
      ? this.state.scenarioState.metricColumn
      : optionSets.metricColumns[0] || "";

    if (!metricColumn) {
      return {
        error: "Necesitas al menos una columna numerica para correr escenarios.",
        warnings,
        optionSets,
      };
    }

    const summaryMap = new Map();
    baseRows.forEach((baseRow, index) => {
      const scenarioRow = scenarioRows[index] || {};
      const label = String(baseRow[groupByColumn] ?? "(sin valor)");
      const entry = summaryMap.get(label) || { label, baseTotal: 0, scenarioTotal: 0 };
      entry.baseTotal += toChartNumber(baseRow[metricColumn]) || 0;
      entry.scenarioTotal += toChartNumber(scenarioRow[metricColumn]) || 0;
      summaryMap.set(label, entry);
    });

    const totalBase = baseRows.reduce((sum, row) => sum + (toChartNumber(row[metricColumn]) || 0), 0);
    const totalScenario = scenarioRows.reduce(
      (sum, row) => sum + (toChartNumber(row[metricColumn]) || 0),
      0,
    );
    const deltaValue = totalScenario - totalBase;
    const deltaPercent = totalBase !== 0 ? (deltaValue / totalBase) * 100 : null;
    const summaryByGroup = Array.from(summaryMap.values())
      .map((item) => {
        const difference = item.scenarioTotal - item.baseTotal;
        return {
          ...item,
          difference,
          changePct: item.baseTotal !== 0 ? (difference / item.baseTotal) * 100 : null,
          baseSharePct: totalBase !== 0 ? (item.baseTotal / totalBase) * 100 : 0,
          scenarioSharePct: totalScenario !== 0 ? (item.scenarioTotal / totalScenario) * 100 : 0,
        };
      })
      .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));

    return {
      baseRows,
      scenarioRows,
      summaryByGroup,
      totalBase,
      totalScenario,
      deltaValue,
      deltaPercent,
      groupByColumn,
      metricColumn,
      warnings,
      optionSets,
    };
  }

  getScenarioChartData() {
    const scenarioData = this.getScenarioPanelData();
    if (scenarioData.error) {
      return { error: scenarioData.error };
    }
    if (!scenarioData.summaryByGroup.length) {
      return { error: "El escenario actual no tiene datos para graficar." };
    }
    return {
      categories: scenarioData.summaryByGroup.map((item) => item.label),
      baseValues: scenarioData.summaryByGroup.map((item) => item.baseTotal),
      scenarioValues: scenarioData.summaryByGroup.map((item) => item.scenarioTotal),
      differenceValues: scenarioData.summaryByGroup.map((item) => item.difference),
      groupByColumn: scenarioData.groupByColumn,
      metricColumn: scenarioData.metricColumn,
    };
  }

  triggerDownload(content, filename, mimeType = "application/octet-stream") {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }

  buildScenarioExportRows(scenarioData) {
    return scenarioData.summaryByGroup.map((item) => ({
      [scenarioData.groupByColumn || "grupo"]: item.label,
      base: item.baseTotal,
      escenario: item.scenarioTotal,
      diferencia: item.difference,
      porcentaje_cambio: item.changePct,
      porcentaje_base: item.baseSharePct,
      porcentaje_escenario: item.scenarioSharePct,
    }));
  }

  exportScenarioTable(format, scenarioData) {
    if (!scenarioData || scenarioData.error || !scenarioData.summaryByGroup?.length) {
      return;
    }
    const exportRows = this.buildScenarioExportRows(scenarioData);
    const fileBase = `escenario_${sanitizeIdentifier(scenarioData.metricColumn || "resumen")}`;
    if (format === "xlsx") {
      if (!window.XLSX) {
        window.alert("La libreria XLSX no esta disponible para exportar Excel.");
        return;
      }
      const worksheet = window.XLSX.utils.json_to_sheet(exportRows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, "Escenario");
      window.XLSX.writeFile(workbook, `${fileBase}.xlsx`);
      return;
    }

    const headers = Object.keys(exportRows[0] || {});
    if (format === "xml") {
      const xmlRows = exportRows
        .map(
          (row) => `
  <row>
${headers
  .map((header) => `    <${sanitizeIdentifier(header, "col")}>${escapeHtml(row[header] ?? "")}</${sanitizeIdentifier(header, "col")}>`)
  .join("\n")}
  </row>`,
        )
        .join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<scenario>\n${xmlRows}\n</scenario>`;
      this.triggerDownload(xml, `${fileBase}.xml`, "application/xml;charset=utf-8");
      return;
    }

    const delimiter = format === "txt" ? this.state.scenarioState.textDelimiter || "|" : ",";
    const lines = [
      headers.join(delimiter),
      ...exportRows.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            const safe = String(value ?? "");
            if (safe.includes(delimiter) || safe.includes('"') || safe.includes("\n")) {
              return `"${safe.replace(/"/g, '""')}"`;
            }
            return safe;
          })
          .join(delimiter),
      ),
    ].join("\n");
    const extension = format === "txt" ? "txt" : "csv";
    const mimeType = format === "txt" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8";
    this.triggerDownload(lines, `${fileBase}.${extension}`, mimeType);
  }

  exportScenarioChart(format, scenarioData) {
    if (!scenarioData || scenarioData.error) {
      return;
    }
    const chartHost = this.root?.querySelector("[data-zrn-scenario-chart-root='1']");
    if (!chartHost || !this.scenarioChartInstance) {
      return;
    }
    const fileBase = `escenario_${sanitizeIdentifier(scenarioData.metricColumn || "grafica")}`;
    const dataUrl = this.scenarioChartInstance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    if (format === "png") {
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${fileBase}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    if (format === "pdf") {
      const printWindow = window.open("", "_blank", "width=1200,height=800");
      if (!printWindow) {
        window.alert("No se pudo abrir la ventana para exportar PDF.");
        return;
      }
      printWindow.document.write(`
        <html>
          <head>
            <title>${escapeHtml(fileBase)}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; color: #1f2d3d; }
              h1 { font-size: 18px; margin: 0 0 16px; }
              img { width: 100%; max-width: 1100px; display: block; }
            </style>
          </head>
          <body>
            <h1>Escenario: ${escapeHtml(scenarioData.metricColumn || "comparativo")}</h1>
            <img src="${dataUrl}" alt="Grafica de escenario" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  }

  exportScenarioData(format) {
    const scenarioData = this.getScenarioPanelData();
    if (scenarioData.error) {
      window.alert(scenarioData.error);
      return;
    }
    if (["xlsx", "csv", "xml", "txt"].includes(format)) {
      this.exportScenarioTable(format, scenarioData);
      return;
    }
    if (["png", "pdf"].includes(format)) {
      this.exportScenarioChart(format, scenarioData);
    }
  }

  getChartData() {
    if (!this.state.queryState.rows.length) {
      return { error: "Ejecuta una consulta para generar la grafica." };
    }
    const { categoryColumn, valueColumn, aggregate } = this.state.chartState;
    if (!categoryColumn || !valueColumn) {
      return { error: "Selecciona las columnas para configurar la grafica." };
    }
    const grouped = new Map();
    this.state.queryState.rows.forEach((row) => {
      const key = String(row[categoryColumn] ?? "(sin valor)");
      const current = grouped.get(key) || [];
      current.push(aggregate === "count" ? 1 : toChartNumber(row[valueColumn]));
      grouped.set(key, current);
    });
    const categories = [];
    const values = [];
    grouped.forEach((rawValues, key) => {
      categories.push(key);
      values.push(aggregateValues(rawValues, aggregate));
    });
    if (!categories.length) {
      return { error: "El resultado actual no contiene datos graficables." };
    }
    return { categories, values };
  }

  ensureChartRendered() {
    if (!this.root || this.state.queryState.activeView !== "chart") {
      this.disposeChart();
      return;
    }
    const chartHost = this.root.querySelector("[data-zrn-chart-root='1']");
    if (!chartHost || !window.echarts) {
      return;
    }
    const chartData = this.getChartData();
    this.state.chartState.error = chartData.error || "";
    if (chartData.error) {
      this.disposeChart();
      return;
    }

    const renderToken = ++this.chartRenderToken;
    window.requestAnimationFrame(() => {
      if (renderToken !== this.chartRenderToken || !this.root) {
        return;
      }
      this.chartInstance =
        window.echarts.getInstanceByDom(chartHost) ||
        window.echarts.init(chartHost, null, { renderer: "canvas" });
      this.chartInstance.setOption(this.buildChartOption(chartData), true);
      this.chartInstance.resize();
    });
  }

  buildChartOption(chartData, config = {}) {
    const palette = ["#355d9a", "#5d8bd4", "#7aa9d8", "#6b8e5a", "#cf8d43", "#8f5d8a"];
    const type = config.type || this.state.chartState.type;
    const categoryColumn = config.categoryColumn || this.state.chartState.categoryColumn;
    const valueColumn = config.valueColumn || this.state.chartState.valueColumn;
    const aggregate = config.aggregate || this.state.chartState.aggregate;
    const series = config.series;
    if (type === "pie") {
      const pieData = series
        ? chartData.categories.map((category, index) => ({
            name: category,
            value: series[0]?.data?.[index] || 0,
          }))
        : chartData.categories.map((category, index) => ({
            name: category,
            value: chartData.values[index],
          }));
      return {
        color: palette,
        tooltip: { trigger: "item" },
        legend: { bottom: 0 },
        series: [
          {
            type: "pie",
            radius: ["35%", "70%"],
            itemStyle: { borderRadius: 4 },
            data: pieData,
          },
        ],
      };
    }

    return {
      color: palette,
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 18, top: 20, bottom: 40, containLabel: true },
      xAxis: {
        type: "category",
        data: chartData.categories,
        axisLabel: { color: "#58709a" },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#58709a" },
      },
      series:
        series ||
        [
          {
            name: `${aggregate.toUpperCase()} ${valueColumn}`,
            type,
            smooth: type === "line",
            data: chartData.values,
            barMaxWidth: 42,
          },
        ],
      toolbox: { right: 0, feature: { saveAsImage: {} } },
      title: {
        text: config.title || `${categoryColumn} vs ${aggregate.toUpperCase()} ${valueColumn}`,
        textStyle: { fontSize: 12, fontWeight: 700, color: "#355d9a" },
      },
    };
  }

  disposeChart() {
    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = null;
    }
    this.chartRenderToken += 1;
  }

  ensureScenarioChartRendered() {
    if (!this.root || this.state.scenarioState.activeView !== "chart") {
      this.disposeScenarioChart();
      return;
    }
    const chartHost = this.root.querySelector("[data-zrn-scenario-chart-root='1']");
    if (!chartHost || !window.echarts) {
      return;
    }
    const chartData = this.getScenarioChartData();
    if (chartData.error) {
      this.disposeScenarioChart();
      return;
    }
    const renderToken = ++this.scenarioChartRenderToken;
    window.requestAnimationFrame(() => {
      if (renderToken !== this.scenarioChartRenderToken || !this.root) {
        return;
      }
      this.scenarioChartInstance =
        window.echarts.getInstanceByDom(chartHost) ||
        window.echarts.init(chartHost, null, { renderer: "canvas" });
      const type = this.state.scenarioState.chartType || "bar";
      const isPie = type === "pie";
      const option = this.buildChartOption(
        {
          categories: chartData.categories,
          values: chartData.scenarioValues,
        },
        {
          type,
          categoryColumn: chartData.groupByColumn,
          valueColumn: chartData.metricColumn,
          aggregate: "sum",
          title: `${chartData.groupByColumn} vs escenario ${chartData.metricColumn}`,
          series: isPie
            ? [
                {
                  name: `Escenario ${chartData.metricColumn}`,
                  type: "pie",
                  radius: ["35%", "70%"],
                  itemStyle: { borderRadius: 4 },
                  data: chartData.categories.map((category, index) => ({
                    name: category,
                    value: chartData.scenarioValues[index],
                  })),
                },
              ]
            : [
                {
                  name: "Base",
                  type,
                  smooth: type === "line",
                  data: chartData.baseValues,
                  barMaxWidth: 32,
                },
                {
                  name: "Escenario",
                  type,
                  smooth: type === "line",
                  data: chartData.scenarioValues,
                  barMaxWidth: 32,
                },
              ],
        },
      );
      if (!isPie) {
        option.legend = { top: 0 };
      }
      this.scenarioChartInstance.setOption(option, true);
      this.scenarioChartInstance.resize();
    });
  }

  disposeScenarioChart() {
    if (this.scenarioChartInstance) {
      this.scenarioChartInstance.dispose();
      this.scenarioChartInstance = null;
    }
    this.scenarioChartRenderToken += 1;
  }

  resetAll() {
    if (
      this.hasTransientData &&
      !window.confirm("Se eliminara el origen temporal, el mapeo y los resultados. Deseas continuar?")
    ) {
      return;
    }
    this.disposeChart();
    this.disposeScenarioChart();
    this.dropRegisteredTable();
    this.state = this.getInitialState();
    this.render();
  }

  get screenMode() {
    return this.root?.dataset?.zrnProcessingScreen || "workspace";
  }

  get activeColumns() {
    return (this.selectedTable?.columns || []).filter((column) => column.use);
  }

  getSellInOutColumnOptions(selectedValue = "", includeBlank = true) {
    const options = includeBlank ? ['<option value="">Selecciona</option>'] : [];
    this.activeColumns.forEach((column) => {
      const alias = sanitizeIdentifier(column.alias, `column_${column.index + 1}`);
      const label = `${column.originalLabel || alias} (${alias})`;
      options.push(
        `<option value="${escapeHtml(alias)}" ${selectedValue === alias ? "selected" : ""}>${escapeHtml(label)}</option>`,
      );
    });
    return options.join("");
  }

  getMatchAttributeOptions(target = this.state.sellInOutConfig.matchTarget) {
    const options =
      target === "customer"
        ? [
            ["ref", "Referencia interna"],
            ["vat", "NIT / identificacion fiscal"],
            ["email", "Correo"],
            ["name", "Nombre del cliente"],
          ]
        : [
            ["barcode", "Codigo de barras"],
            ["default_code", "Referencia interna"],
            ["name", "Nombre del producto"],
          ];
    return options
      .map(
        ([value, label]) =>
          `<option value="${value}" ${this.state.sellInOutConfig.matchAttribute === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
      )
      .join("");
  }

  pickColumnByKeywords(keywords = [], used = new Set()) {
    const columns = this.activeColumns;
    const normalizedKeywords = keywords.map((keyword) => sanitizeIdentifier(keyword));
    const found = columns.find((column) => {
      const alias = sanitizeIdentifier(column.alias, `column_${column.index + 1}`);
      const label = sanitizeIdentifier(column.originalLabel || "");
      const combined = `${alias} ${label}`;
      return !used.has(alias) && normalizedKeywords.some((keyword) => combined.includes(keyword));
    });
    return found ? sanitizeIdentifier(found.alias, `column_${found.index + 1}`) : "";
  }

  syncSellInOutDefaults(force = false) {
    const config = this.state.sellInOutConfig;
    const aliases = new Set(this.activeColumns.map((column) => sanitizeIdentifier(column.alias, `column_${column.index + 1}`)));
    Object.keys(config).forEach((key) => {
      if (key.endsWith("Column") && config[key] && !aliases.has(config[key])) {
        config[key] = "";
      }
    });
    const used = new Set();
    const assign = (key, keywords) => {
      if (!force && config[key] && aliases.has(config[key])) {
        used.add(config[key]);
        return;
      }
      const picked = this.pickColumnByKeywords(keywords, used);
      config[key] = picked;
      if (picked) used.add(picked);
    };
    assign("matchColumn", ["barcode", "codigo_barras", "cod_barras", "ean", "upc", "sku", "codigo", "item", "producto", "cliente", "customer"]);
    assign("sellInColumn", ["sell_in", "sellin", "revenue", "ingreso", "facturado", "venta_neta", "importe", "monto"]);
    assign("sellOutColumn", ["sell_out", "sellout", "pos", "retail", "venta", "vendido", "scan", "unidades"]);
    assign("quantityColumn", ["cantidad", "quantity", "qty", "unidades", "units"]);
    assign("dateColumn", ["fecha", "date", "mes", "month", "semana", "week"]);
    assign("groupColumn", ["tienda", "store", "canal", "channel", "marca", "brand", "categoria", "category"]);
  }

  updateSellInOutConfig(field, value) {
    if (!field || !(field in this.state.sellInOutConfig)) {
      return;
    }
    this.state.sellInOutConfig[field] = value;
    if (field === "matchTarget") {
      this.state.sellInOutConfig.matchAttribute = value === "customer" ? "ref" : "barcode";
    }
    this.state.matchState.error = "";
    this.state.matchState.records = [];
    this.state.matchState.totalRows = 0;
    this.state.matchState.matchedRows = 0;
    this.state.matchState.unmatchedRows = 0;
    this.render();
  }

  normalizeMatchValue(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  parseMetricValue(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    const normalized = String(value)
      .replace(/[$Q€£]/g, "")
      .replace(/\s/g, "")
      .replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  formatDashboardNumber(value, decimals = 2) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  getCurrentDatasetRecords() {
    const table = this.selectedTable;
    const rawRows = this.selectedSheet?.rawRows || [];
    if (!table || table.errors?.length) {
      return [];
    }
    return buildDatasetRecords(table, rawRows);
  }

  async refreshSellInOutMatch() {
    const config = this.state.sellInOutConfig;
    const rows = this.getCurrentDatasetRecords();
    if (!rows.length) {
      this.state.matchState.error = "Aplica una estructura de tabla con filas de datos antes de hacer match.";
      this.render();
      return;
    }
    if (!config.matchColumn || !config.matchAttribute) {
      this.state.matchState.error = "Selecciona la columna del archivo y el atributo de Odoo para el match.";
      this.render();
      return;
    }
    if (!this.orm) {
      this.state.matchState.error = "No se pudo acceder al servicio de Odoo para consultar datos.";
      this.render();
      return;
    }
    const rawValues = Array.from(
      new Set(rows.map((row) => String(row[config.matchColumn] ?? "").trim()).filter(Boolean)),
    );
    if (!rawValues.length) {
      this.state.matchState.error = "La columna seleccionada para match no contiene valores utilizables.";
      this.render();
      return;
    }
    const model = config.matchTarget === "customer" ? "res.partner" : "product.product";
    const fields =
      config.matchTarget === "customer"
        ? ["display_name", "ref", "vat", "email", "name"]
        : ["display_name", "barcode", "default_code", "name"];
    this.state.matchState.loading = true;
    this.state.matchState.error = "";
    this.render();
    try {
      const odooRows = await this.orm.searchRead(
        model,
        [[config.matchAttribute, "in", rawValues]],
        fields,
        { limit: Math.max(rawValues.length + 20, 80) },
      );
      const byMatchValue = new Map();
      odooRows.forEach((record) => {
        const key = this.normalizeMatchValue(record[config.matchAttribute]);
        if (key && !byMatchValue.has(key)) {
          byMatchValue.set(key, record);
        }
      });
      const matchedRecords = [];
      let unmatchedRows = 0;
      rows.forEach((row) => {
        const matchValue = this.normalizeMatchValue(row[config.matchColumn]);
        const odooRecord = byMatchValue.get(matchValue);
        if (!odooRecord) {
          unmatchedRows += 1;
          return;
        }
        const sellIn = this.parseMetricValue(row[config.sellInColumn]);
        const sellOut = this.parseMetricValue(row[config.sellOutColumn]);
        matchedRecords.push({
          ...row,
          __match_value: row[config.matchColumn],
          __sell_in: sellIn,
          __sell_out: sellOut,
          __gap: sellIn - sellOut,
          __quantity: this.parseMetricValue(row[config.quantityColumn]),
          __date: config.dateColumn ? row[config.dateColumn] : "",
          __group: config.groupColumn ? row[config.groupColumn] : "",
          __odoo_id: odooRecord.id,
          __odoo_name: odooRecord.display_name || odooRecord.name || "",
          __odoo_ref: odooRecord.default_code || odooRecord.ref || "",
        });
      });
      this.state.matchState = {
        loading: false,
        error: "",
        records: matchedRecords,
        totalRows: rows.length,
        matchedRows: matchedRecords.length,
        unmatchedRows,
        targetLabel: config.matchTarget === "customer" ? "clientes" : "productos",
      };
      this.render();
    } catch (error) {
      this.state.matchState.loading = false;
      this.state.matchState.error = error.message || "No se pudo realizar el match contra Odoo.";
      this.render();
    }
  }

  getSellInOutDashboardData() {
    const rows = this.state.matchState.records || [];
    const totalSellIn = rows.reduce((total, row) => total + Number(row.__sell_in || 0), 0);
    const totalSellOut = rows.reduce((total, row) => total + Number(row.__sell_out || 0), 0);
    const totalGap = totalSellIn - totalSellOut;
    const byGroup = new Map();
    rows.forEach((row) => {
      const label = String(row.__group || row.__odoo_name || row.__match_value || "Sin grupo").trim();
      if (!byGroup.has(label)) {
        byGroup.set(label, { label, sellIn: 0, sellOut: 0, gap: 0, rows: 0 });
      }
      const item = byGroup.get(label);
      item.sellIn += Number(row.__sell_in || 0);
      item.sellOut += Number(row.__sell_out || 0);
      item.gap = item.sellIn - item.sellOut;
      item.rows += 1;
    });
    const groups = Array.from(byGroup.values())
      .sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))
      .slice(0, 8);
    return { rows, totalSellIn, totalSellOut, totalGap, groups };
  }

  renderSellInOutMappingPanel(table) {
    this.syncSellInOutDefaults();
    const config = this.state.sellInOutConfig;
    const targetOptions = [
      ["product", "Productos"],
      ["customer", "Clientes"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${config.matchTarget === value ? "selected" : ""}>${label}</option>`,
      )
      .join("");
    const selected = (field) => this.getSellInOutColumnOptions(config[field]);
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Mapeo sell-in / sell-out</strong>
          <span>${table ? `${table.dataRowsCount} filas disponibles` : "Sin tabla activa"}</span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_field_grid zrn_processing_match_grid">
            <div class="zrn_processing_field">
              <label>Columna para match</label>
              <select class="form-select" data-action="sellio-config" data-field="matchColumn">${selected("matchColumn")}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Matchear contra</label>
              <select class="form-select" data-action="sellio-config" data-field="matchTarget">${targetOptions}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Atributo de Odoo</label>
              <select class="form-select" data-action="sellio-config" data-field="matchAttribute">${this.getMatchAttributeOptions()}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Sell-in</label>
              <select class="form-select" data-action="sellio-config" data-field="sellInColumn">${selected("sellInColumn")}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Sell-out</label>
              <select class="form-select" data-action="sellio-config" data-field="sellOutColumn">${selected("sellOutColumn")}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Unidades</label>
              <select class="form-select" data-action="sellio-config" data-field="quantityColumn">${selected("quantityColumn")}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Fecha o periodo</label>
              <select class="form-select" data-action="sellio-config" data-field="dateColumn">${selected("dateColumn")}</select>
            </div>
            <div class="zrn_processing_field">
              <label>Grupo visual</label>
              <select class="form-select" data-action="sellio-config" data-field="groupColumn">${selected("groupColumn")}</select>
            </div>
          </div>
          <div class="zrn_processing_actions">
            <button type="button" class="btn btn-primary" data-action="sellio-match" ${this.state.matchState.loading ? "disabled" : ""}>
              ${this.state.matchState.loading ? "Matcheando..." : "Matchear con Odoo"}
            </button>
          </div>
          ${
            this.state.matchState.error
              ? `<div class="zrn_processing_query_error">${escapeHtml(this.state.matchState.error)}</div>`
              : ""
          }
          <div class="zrn_processing_hint_strip">
            Solo las filas matcheadas contra Odoo entran al dashboard. Las no matcheadas quedan fuera para evitar mezclar Retail Link con registros sin referencia interna.
          </div>
        </div>
      </section>
    `;
  }

  renderSellInOutDashboard() {
    const dashboard = this.getSellInOutDashboardData();
    const match = this.state.matchState;
    const maxBar = Math.max(...dashboard.groups.map((item) => Math.max(item.sellIn, item.sellOut)), 1);
    const barRows = dashboard.groups.length
      ? dashboard.groups
          .map((item) => {
            const inWidth = Math.max(3, Math.round((item.sellIn / maxBar) * 100));
            const outWidth = Math.max(3, Math.round((item.sellOut / maxBar) * 100));
            return `
              <div class="zrn_processing_sellio_bar_row">
                <strong>${escapeHtml(item.label)}</strong>
                <div class="zrn_processing_sellio_bar_track"><span class="is-sell-in" style="width:${inWidth}%"></span></div>
                <div class="zrn_processing_sellio_bar_track"><span class="is-sell-out" style="width:${outWidth}%"></span></div>
                <small>${this.formatDashboardNumber(item.gap)}</small>
              </div>
            `;
          })
          .join("")
      : `<div class="zrn_processing_result_empty">Ejecuta el match para ver comparativos.</div>`;
    const tableRows = dashboard.rows.slice(0, 80).map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.__odoo_name)}</strong><br/><span class="zrn_processing_helper">${escapeHtml(row.__odoo_ref || row.__match_value)}</span></td>
        <td>${escapeHtml(row.__date || "-")}</td>
        <td>${escapeHtml(row.__group || "-")}</td>
        <td class="text-end">${this.formatDashboardNumber(row.__sell_in)}</td>
        <td class="text-end">${this.formatDashboardNumber(row.__sell_out)}</td>
        <td class="text-end">${this.formatDashboardNumber(row.__gap)}</td>
      </tr>
    `).join("");
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Dashboard sell-in / sell-out</strong>
          <span>${match.matchedRows || 0} filas matcheadas</span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_totals_kpis">
            <div class="zrn_processing_total_kpi"><span>Sell-in</span><strong>${this.formatDashboardNumber(dashboard.totalSellIn)}</strong></div>
            <div class="zrn_processing_total_kpi"><span>Sell-out</span><strong>${this.formatDashboardNumber(dashboard.totalSellOut)}</strong></div>
            <div class="zrn_processing_total_kpi"><span>Diferencia</span><strong>${this.formatDashboardNumber(dashboard.totalGap)}</strong></div>
            <div class="zrn_processing_total_kpi"><span>Match</span><strong>${match.totalRows ? `${Math.round((match.matchedRows / match.totalRows) * 100)}%` : "0%"}</strong></div>
          </div>
          <div class="zrn_processing_sellio_dashboard_grid">
            <div class="zrn_processing_sellio_chart">
              <div class="zrn_processing_sellio_legend">
                <span><i class="is-sell-in"></i>Sell-in</span>
                <span><i class="is-sell-out"></i>Sell-out</span>
                <span>Diferencia</span>
              </div>
              ${barRows}
            </div>
            <div class="zrn_processing_status_grid">
              <div class="zrn_processing_status_item"><small>Total archivo</small><strong>${match.totalRows || 0}</strong></div>
              <div class="zrn_processing_status_item"><small>Matcheadas</small><strong>${match.matchedRows || 0}</strong></div>
              <div class="zrn_processing_status_item"><small>Sin match</small><strong>${match.unmatchedRows || 0}</strong></div>
              <div class="zrn_processing_status_item"><small>Destino</small><strong>${escapeHtml(match.targetLabel || "-")}</strong></div>
            </div>
          </div>
          <div class="zrn_processing_result_wrap zrn_processing_sellio_table_wrap">
            <table class="o_list_table table table-sm zrn_processing_result_table">
              <thead>
                <tr>
                  <th>Registro Odoo</th>
                  <th>Periodo</th>
                  <th>Grupo</th>
                  <th class="text-end">Sell-in</th>
                  <th class="text-end">Sell-out</th>
                  <th class="text-end">Diferencia</th>
                </tr>
              </thead>
              <tbody>${tableRows || '<tr><td colspan="6">Sin datos matcheados.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  renderLanding() {
    const isLoadingGoogle = Boolean(this.state.sourceInput.loading);
    return `
      <div class="zrn_processing_landing">
        ${
          this.state.globalError
            ? `<div class="zrn_processing_global_error">${escapeHtml(this.state.globalError)}</div>`
            : ""
        }
        <section class="zrn_processing_panel">
          <div class="zrn_processing_panel_head">
            <strong>Fuente sell-in / sell-out</strong>
            <span>Archivo local o Google Sheets publico</span>
          </div>
          <div class="zrn_processing_panel_body">
            <div class="zrn_processing_source_cards">
              <label class="zrn_processing_source_card zrn_processing_source_card_file">
                <input type="file" data-action="file" accept=".csv,.json,.xml,.xls,.xlsx,.xlsm" />
                <span class="zrn_processing_source_card_icon"><i class="fa fa-upload"></i></span>
                <div class="zrn_processing_source_card_copy">
                  <strong>Archivo</strong>
                  <small>CSV, JSON, XML y Excel</small>
                </div>
                <span class="zrn_processing_source_card_action">Abrir explorador</span>
              </label>
              <button
                type="button"
                class="zrn_processing_source_card zrn_processing_source_card_sheet"
                data-action="source-mode"
                data-mode="google_sheet"
              >
                <span class="zrn_processing_source_card_icon"><i class="fa fa-table"></i></span>
                <div class="zrn_processing_source_card_copy">
                  <strong>Google Sheets</strong>
                  <small>URL publica validada por sesion</small>
                </div>
                <span class="zrn_processing_source_card_action">Agregar enlace</span>
              </button>
            </div>
            <div class="zrn_processing_hint_strip">
              ${
                isLoadingGoogle
                  ? "Leyendo hojas publicas del Google Sheet..."
                  : "Carga Retail Link o un archivo sell-out para matchearlo con productos o clientes de Odoo."
              }
            </div>
          </div>
        </section>
        ${
          this.state.sourceInput.googleSheetModalOpen
            ? `
              <div class="modal-backdrop fade show zrn_processing_modal_backdrop" data-action="google-sheet-close"></div>
              <div class="zrn_processing_modal_shell">
                <section class="zrn_processing_modal">
                  <div class="zrn_processing_modal_head">
                    <div>
                      <strong>Conectar Google Sheets</strong>
                      <span>Valida el enlace antes de abrir el workspace.</span>
                    </div>
                    <button type="button" class="btn zrn_processing_modal_close" data-action="google-sheet-close" ${
                      isLoadingGoogle ? "disabled" : ""
                    }>
                      <i class="fa fa-times"></i>
                    </button>
                  </div>
                  <div class="zrn_processing_modal_body">
                    <div class="zrn_processing_field">
                      <label>URL publica</label>
                      <input
                        type="url"
                        class="form-control"
                        data-action="google-sheet-url"
                        value="${escapeHtml(this.state.sourceInput.googleSheetDraft)}"
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        ${isLoadingGoogle ? "disabled" : ""}
                      />
                    </div>
                    ${
                      this.state.sourceInput.googleSheetError
                        ? `<div class="zrn_processing_global_error">${escapeHtml(this.state.sourceInput.googleSheetError)}</div>`
                        : ""
                    }
                    <div class="zrn_processing_modal_hint">
                      <span>Se valida que el enlace pertenezca a Google Sheets y que tenga hojas publicas utilizables.</span>
                    </div>
                    <div class="zrn_processing_modal_actions">
                      <button type="button" class="btn btn-secondary" data-action="google-sheet-close" ${
                        isLoadingGoogle ? "disabled" : ""
                      }>Cancelar</button>
                      <button type="button" class="btn btn-primary" data-action="google-sheet-connect" ${
                        isLoadingGoogle ? "disabled" : ""
                      }>${isLoadingGoogle ? "Validando..." : "Validar y continuar"}</button>
                    </div>
                  </div>
                </section>
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  renderOverviewPanel(sheet, table) {
    const sourceTypeLabel =
      this.state.sourceMeta.type === "google_sheet" ? "Google Sheets publico" : "Archivo local";
    const tableCount = sheet?.tables.length || 0;
    return `
      <section class="zrn_processing_panel zrn_processing_overview_panel">
        <div class="zrn_processing_panel_head">
          <strong>Origen activo</strong>
          <span>${sourceTypeLabel}</span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_overview_top">
            <div class="zrn_processing_file_overview">
              <div class="zrn_processing_file_icon">
                <i class="fa ${escapeHtml(this.state.sourceMeta.iconClass)}"></i>
              </div>
              <div class="zrn_processing_file_copy">
                <div class="zrn_processing_file_name">${escapeHtml(this.state.sourceMeta.name)}</div>
                <div class="zrn_processing_helper">
                  ${escapeHtml(sourceTypeLabel)} / ${escapeHtml(this.state.sourceMeta.sizeLabel)} / ${this.state.sourceMeta.totalSheets} hoja(s)
                </div>
              </div>
            </div>
            <div class="zrn_processing_file_actions">
              <label class="btn btn-secondary zrn_processing_replace_btn">
                Reemplazar archivo
                <input type="file" data-action="file" accept=".csv,.json,.xml,.xls,.xlsx,.xlsm" />
              </label>
              <button type="button" class="btn btn-secondary" data-action="back-to-processing">Volver a carga</button>
              <button type="button" class="btn btn-secondary" data-action="reset-source">Limpiar sesion</button>
            </div>
          </div>
          <div class="zrn_processing_field_grid zrn_processing_overview_controls">
            <div class="zrn_processing_field">
              <label>Hoja activa</label>
              <select class="form-select" data-action="sheet-select">
                ${this.state.datasetConfig.sheets
                  .map(
                    (currentSheet) => `
                      <option value="${currentSheet.id}" ${this.state.datasetConfig.selectedSheetId === currentSheet.id ? "selected" : ""}>
                        ${escapeHtml(currentSheet.name)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Tabla activa</label>
              <select class="form-select" data-action="table-select">
                ${(sheet?.tables || [])
                  .map(
                    (currentTable) => `
                      <option value="${currentTable.id}" ${sheet.selectedTableId === currentTable.id ? "selected" : ""}>
                        ${escapeHtml(currentTable.name)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Clave del dataset</label>
              <input type="text" class="form-control" value="${escapeHtml(table?.tableName || "")}" disabled="disabled" />
            </div>
          </div>
          <div class="zrn_processing_file_details_wrap">
            <table class="o_list_table table table-sm zrn_processing_file_details_table">
              <tbody>
                <tr><th>Origen</th><td>${escapeHtml(this.state.sourceMeta.name)}</td></tr>
                <tr><th>Tipo</th><td>${escapeHtml(sourceTypeLabel)}</td></tr>
                <tr><th>Hoja</th><td>${escapeHtml(sheet?.name || "-")}</td></tr>
                <tr><th>Tablas detectadas</th><td>${tableCount}</td></tr>
                <tr><th>Tabla activa</th><td>${escapeHtml(table?.name || "-")}</td></tr>
                <tr><th>Estado</th><td>${escapeHtml(this.state.datasetConfig.statusLabel)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  renderDatasetPanel(sheet, table) {
    const tableErrors = table?.errors || [];
    const overviewStatusClass = tableErrors.length
      ? "is-danger"
      : this.state.datasetConfig.structureReady
        ? "is-ready"
        : this.state.sourceMeta.loaded
          ? "is-pending"
          : "";
    const maxSheetColumns = sheet
      ? Math.max(...sheet.rawRows.map((row) => row.length), 0)
      : 0;
    const startColumnOptions = table
      ? Array.from({ length: maxSheetColumns }, (_, index) => {
          const rowLabel = sheet.rawRows[table.tableStartRowIndex]?.[index];
          const optionLabel = rowLabel
            ? `${getColumnLabel(index)} / ${String(rowLabel).trim().slice(0, 36)}`
            : getColumnLabel(index);
          return `<option value="${index}" ${index === table.tableStartColumnIndex ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
        }).join("")
      : "";
    const endColumnOptions = table
      ? Array.from({ length: maxSheetColumns }, (_, index) => {
          const rowLabel = sheet.rawRows[table.tableStartRowIndex]?.[index];
          const optionLabel = rowLabel
            ? `${getColumnLabel(index)} / ${String(rowLabel).trim().slice(0, 36)}`
            : getColumnLabel(index);
          return `<option value="${index}" ${index === table.tableEndColumnIndex ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
        }).join("")
      : "";
    const tableList = (sheet?.tables || [])
      .map(
        (currentTable) => `
          <div class="zrn_processing_table_card ${currentTable.id === sheet.selectedTableId ? "is-active" : ""}">
            <button type="button" class="zrn_processing_table_card_main" data-action="table-select" value="${currentTable.id}">
              <strong>${escapeHtml(currentTable.name)}</strong>
              <small>${escapeHtml(currentTable.tableName)} · ${currentTable.dataRowsCount} filas</small>
            </button>
            ${
              sheet.tables.length > 1
                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="table-remove" data-table-id="${currentTable.id}">Quitar</button>`
                : ""
            }
          </div>
        `,
      )
      .join("");
    const columnRows = table
      ? table.columns
          .map(
            (column, index) => `
              <tr>
                <td><input type="checkbox" data-action="column-use" data-column-index="${index}" ${column.use ? "checked" : ""} /></td>
                <td>${escapeHtml(column.columnLabel)} / ${escapeHtml(column.originalLabel)}</td>
                <td>
                  <input type="text" class="form-control" data-action="column-alias" data-column-index="${index}" value="${escapeHtml(column.alias)}" />
                </td>
                <td>
                  <select class="form-select" data-action="column-type" data-column-index="${index}">
                    ${SQL_TYPES.map(
                      (type) =>
                        `<option value="${type}" ${column.type === type ? "selected" : ""}>${type}</option>`,
                    ).join("")}
                  </select>
                </td>
              </tr>
            `,
          )
          .join("")
      : "";
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Estructura del archivo</strong>
          <span>${table ? `${table.dataRowsCount} filas detectadas` : "Sin estructura"}</span>
        </div>
        <div class="zrn_processing_panel_body">
          ${
            table
              ? `
                ${tableErrors.length ? `<div class="zrn_processing_sheet_errors">${tableErrors.map((error) => escapeHtml(error)).join("<br/>")}</div>` : ""}
                <div class="zrn_processing_table_stack">
                  <div class="zrn_processing_table_stack_head">
                    <strong>Tablas de la hoja</strong>
                    <button type="button" class="btn btn-secondary" data-action="table-add">Crear tabla</button>
                  </div>
                  <div class="zrn_processing_table_list">${tableList}</div>
                </div>
                <div class="zrn_processing_range_grid zrn_processing_range_grid_extended">
                  <div class="zrn_processing_field">
                    <label>Nombre visible</label>
                    <input type="text" class="form-control" data-action="table-name" value="${escapeHtml(table.name)}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Clave del dataset</label>
                    <input type="text" class="form-control" data-action="table-sql-name" value="${escapeHtml(table.tableName)}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Fila de encabezado</label>
                    <input type="number" min="1" max="${sheet.rawRows.length || 1}" class="form-control" data-action="table-start-row" value="${table.tableStartRowIndex + 1}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Fila final</label>
                    <input type="number" min="1" max="${sheet.rawRows.length || 1}" class="form-control" data-action="table-end-row" value="${table.tableEndRowIndex + 1}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Columna inicial</label>
                    <select class="form-select" data-action="table-start-column">${startColumnOptions}</select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Columna final</label>
                    <select class="form-select" data-action="table-end-column">${endColumnOptions}</select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Estado</label>
                    <div class="zrn_processing_status_inline ${overviewStatusClass}">${escapeHtml(this.state.datasetConfig.statusLabel)}</div>
                  </div>
                </div>
                <div class="zrn_processing_actions">
                  <button type="button" class="btn btn-primary" data-action="apply-structure">Aplicar estructura</button>
                </div>
                <div class="zrn_processing_columns_wrap">
                  <table class="o_list_table table table-sm zrn_processing_columns">
                    <thead>
                      <tr>
                        <th>Usar</th>
                        <th>Origen</th>
                        <th>Alias de columna</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>${columnRows}</tbody>
                  </table>
                </div>
              `
              : '<div class="zrn_processing_empty">Carga un origen para definir tablas y columnas.</div>'
          }
        </div>
      </section>
    `;
  }

  renderDatasetPanelEnhanced(sheet, table) {
    const isSheetLoading =
      Boolean(sheet) && this.state.datasetConfig.loadingSheetId === sheet?.id;
    const tableErrors = table?.errors || [];
    const overviewStatusClass = tableErrors.length
      ? "is-danger"
      : this.state.datasetConfig.structureReady
        ? "is-ready"
        : this.state.sourceMeta.loaded
          ? "is-pending"
          : "";
    const maxSheetColumns = sheet
      ? Math.max(...sheet.rawRows.map((row) => row.length), 0)
      : 0;
    const effectiveEndRowIndex = table ? getEffectiveEndRowIndex(table, sheet.rawRows) : 0;
    const isColumnHeader = table?.headerAxis === "column";
    const startColumnOptions = table
      ? Array.from({ length: maxSheetColumns }, (_, index) => {
          const rowLabel = !isColumnHeader ? sheet.rawRows[table.tableStartRowIndex]?.[index] : "";
          const optionLabel = rowLabel
            ? `${getColumnLabel(index)} / ${String(rowLabel).trim().slice(0, 36)}`
            : getColumnLabel(index);
          return `<option value="${index}" ${index === table.tableStartColumnIndex ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
        }).join("")
      : "";
    const endColumnOptions = table
      ? Array.from({ length: maxSheetColumns }, (_, index) => {
          const rowLabel = !isColumnHeader ? sheet.rawRows[table.tableStartRowIndex]?.[index] : "";
          const optionLabel = rowLabel
            ? `${getColumnLabel(index)} / ${String(rowLabel).trim().slice(0, 36)}`
            : getColumnLabel(index);
          return `<option value="${index}" ${index === table.tableEndColumnIndex ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`;
        }).join("")
      : "";
    const tableList = (sheet?.tables || [])
      .map((currentTable) => {
        const activeClass = currentTable.id === sheet.selectedTableId ? "is-active" : "";
        const title = escapeHtml(currentTable.name);
        const removeButton =
          sheet.tables.length > 1
            ? `
                <button
                  type="button"
                  class="zrn_processing_table_tab_remove"
                  data-action="table-remove"
                  data-table-id="${currentTable.id}"
                  title="Quitar tabla"
                  aria-label="Quitar tabla"
                >
                  <i class="fa fa-times"></i>
                </button>
              `
            : "";
        return `
          <div class="zrn_processing_table_tab ${activeClass}">
            <button
              type="button"
              class="zrn_processing_table_tab_main"
              data-action="table-select"
              value="${currentTable.id}"
              title="${title}"
              aria-label="${title}"
            >
              <strong>${title}</strong>
            </button>
            ${removeButton}
          </div>
        `;
      })
      .join("");
    const columnRows = table
      ? table.columns
          .map(
            (column, index) => `
              <tr>
                <td><input type="checkbox" data-action="column-use" data-column-index="${index}" ${column.use ? "checked" : ""} /></td>
                <td>${escapeHtml(column.columnLabel)} / ${escapeHtml(column.originalLabel)}</td>
                <td>
                  <input type="text" class="form-control" data-action="column-alias" data-column-index="${index}" value="${escapeHtml(column.alias)}" />
                </td>
                <td>
                  <select class="form-select" data-action="column-type" data-column-index="${index}">
                    ${SQL_TYPES.map(
                      (type) =>
                        `<option value="${type}" ${column.type === type ? "selected" : ""}>${type}</option>`,
                    ).join("")}
                  </select>
                </td>
              </tr>
            `,
          )
          .join("")
      : "";
    const bodyContent = isSheetLoading
      ? `
          <div class="zrn_processing_dataset_loader" aria-live="polite">
            <div class="zrn_processing_dataset_spinner" aria-hidden="true"></div>
            <div class="zrn_processing_dataset_loader_text">
              Cargando estructura de la hoja <strong>${escapeHtml(sheet?.name || "")}</strong>...
            </div>
          </div>
        `
      : table
        ? `
            ${tableErrors.length ? `<div class="zrn_processing_sheet_errors">${tableErrors.map((error) => escapeHtml(error)).join("<br/>")}</div>` : ""}
            <div class="zrn_processing_dataset_layout">
              <div class="zrn_processing_table_sidebar">
                <div class="zrn_processing_table_stack_head">
                  <strong>Tablas</strong>
                  <button type="button" class="btn btn-secondary" data-action="table-add">Crear tabla</button>
                </div>
                <div class="zrn_processing_table_tabs">${tableList}</div>
              </div>
              <div class="zrn_processing_table_editor">
                <div class="zrn_processing_range_grid zrn_processing_range_grid_extended">
                  <div class="zrn_processing_field">
                    <label>Nombre visible</label>
                    <input type="text" class="form-control" data-action="table-name" value="${escapeHtml(table.name)}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Clave del dataset</label>
                    <input type="text" class="form-control" data-action="table-sql-name" value="${escapeHtml(table.tableName)}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>${isColumnHeader ? "Fila inicial" : "Fila de encabezado"}</label>
                    <input type="number" min="1" max="${sheet.rawRows.length || 1}" class="form-control" data-action="table-start-row" value="${table.tableStartRowIndex + 1}" />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Fila final</label>
                    <div class="zrn_processing_inline_toggle">
                      <label class="form-check">
                        <input type="checkbox" class="form-check-input" data-action="table-toggle-end" ${table.hasEndRow ? "checked" : ""} />
                        <span class="form-check-label">Usar fila final</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      min="${table.tableStartRowIndex + 1}"
                      max="${sheet.rawRows.length || 1}"
                      class="form-control"
                      data-action="table-end-row"
                      value="${effectiveEndRowIndex + 1}"
                      ${table.hasEndRow ? "" : "disabled"}
                    />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Encabezado</label>
                    <div class="zrn_processing_inline_toggle">
                      <label class="form-check">
                        <input type="checkbox" class="form-check-input" data-action="table-header-axis" ${isColumnHeader ? "checked" : ""} />
                        <span class="form-check-label">Por columna</span>
                      </label>
                    </div>
                  </div>
                  <div class="zrn_processing_field">
                    <label>${isColumnHeader ? "Columna de encabezado" : "Columna inicial"}</label>
                    <select class="form-select" data-action="table-start-column">${startColumnOptions}</select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>${isColumnHeader ? "Columna final de datos" : "Columna final"}</label>
                    <select class="form-select" data-action="table-end-column">${endColumnOptions}</select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Estado</label>
                    <div class="zrn_processing_status_inline ${overviewStatusClass}">${escapeHtml(this.state.datasetConfig.statusLabel)}</div>
                  </div>
                </div>
                <div class="zrn_processing_actions">
                  <button type="button" class="btn btn-primary" data-action="apply-structure">Aplicar estructura</button>
                </div>
                <div class="zrn_processing_columns_wrap">
                  <table class="o_list_table table table-sm zrn_processing_columns">
                    <thead>
                      <tr>
                        <th>Usar</th>
                        <th>Origen</th>
                        <th>Alias de columna</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>${columnRows}</tbody>
                  </table>
                </div>
              </div>
            </div>
          `
        : '<div class="zrn_processing_empty">Carga un origen para definir tablas y columnas.</div>';
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Estructura del archivo</strong>
          <span>${isSheetLoading ? "Cargando hoja..." : table ? `${table.dataRowsCount} filas detectadas` : "Sin estructura"}</span>
        </div>
        <div class="zrn_processing_panel_body">${bodyContent}</div>
      </section>
    `;
  }

  renderQueryPanel(table) {
    const builderColumns = this.getBuilderColumns();
    const builderColumnItems = builderColumns
      .map((column) => {
        const alias = sanitizeIdentifier(column.alias, `column_${column.index + 1}`);
        const checked = this.state.queryBuilder.selectedColumns.includes(alias);
        return `
          <label class="zrn_processing_builder_column">
            <input type="checkbox" data-action="builder-column" value="${escapeHtml(alias)}" ${checked ? "checked" : ""} />
            <span>${escapeHtml(alias)}</span>
            <small>${escapeHtml(column.originalLabel)}</small>
          </label>
        `;
      })
      .join("");
    const builderFilterRows = this.state.queryBuilder.filters
      .map((filter) => {
        const column = this.getBuilderColumnByAlias(filter.column) || builderColumns[0];
        const operators = this.getBuilderOperators(column?.type);
        const needsRange = filter.operator === "between";
        const valueInputType =
          column?.type === "number" ? "number" : column?.type === "date" ? "date" : "text";
        return `
          <div class="zrn_processing_builder_filter_row">
            <select class="form-select" data-action="builder-filter-column" data-filter-id="${filter.id}">
              ${builderColumns
                .map((item) => {
                  const alias = sanitizeIdentifier(item.alias, `column_${item.index + 1}`);
                  return `<option value="${escapeHtml(alias)}" ${filter.column === alias ? "selected" : ""}>${escapeHtml(alias)}</option>`;
                })
                .join("")}
            </select>
            <select class="form-select" data-action="builder-filter-operator" data-filter-id="${filter.id}">
              ${operators
                .map(
                  ([operator, label]) =>
                    `<option value="${operator}" ${filter.operator === operator ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
            <input type="${valueInputType}" class="form-control" data-action="builder-filter-value" data-filter-id="${filter.id}" value="${escapeHtml(filter.value)}" placeholder="Valor" />
            ${
              needsRange
                ? `<input type="${valueInputType}" class="form-control" data-action="builder-filter-value-to" data-filter-id="${filter.id}" value="${escapeHtml(filter.valueTo)}" placeholder="Hasta" />`
                : '<div class="zrn_processing_builder_filter_spacer"></div>'
            }
            <button type="button" class="btn btn-secondary" data-action="builder-remove-filter" data-filter-id="${filter.id}">Quitar</button>
          </div>
        `;
      })
      .join("");
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Consulta</strong>
          <span class="zrn_processing_head_meta">
            Constructor no-code y editor SQL
            <details class="zrn_processing_sql_help">
              <summary class="zrn_processing_sql_help_toggle" aria-label="Guia SQL">
                <span class="zrn_processing_sql_help_icon"><i class="oi oi-info"></i></span>
                <span class="zrn_processing_sql_help_label">Guia SQL</span>
              </summary>
              <div class="zrn_processing_sql_help_popover">
                <strong>SQL permitido</strong>
                <span><code>SELECT</code>, <code>WHERE</code>, <code>GROUP BY</code>, <code>ORDER BY</code>, <code>LIMIT</code></span>
                <span>Una tabla activa por consulta en esta version.</span>
                <span>No se permiten <code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code>, <code>DROP</code>, <code>CREATE</code>, <code>ALTER</code>.</span>
              </div>
            </details>
          </span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_query_workspace">
            <div class="zrn_processing_query_builder">
              <div class="zrn_processing_builder_section">
                <div class="zrn_processing_builder_title">Columnas a mostrar</div>
                <div class="zrn_processing_builder_columns">
                  ${builderColumnItems || '<div class="zrn_processing_empty">No hay columnas activas disponibles.</div>'}
                </div>
              </div>
              <div class="zrn_processing_builder_section">
                <div class="zrn_processing_builder_title">Filtros</div>
                <div class="zrn_processing_builder_filters">
                  ${builderFilterRows || '<div class="zrn_processing_empty">No hay filtros agregados.</div>'}
                </div>
                <div class="zrn_processing_actions">
                  <button type="button" class="btn btn-secondary" data-action="builder-add-filter">Agregar filtro</button>
                </div>
              </div>
              <div class="zrn_processing_builder_footer">
                <div class="zrn_processing_field">
                  <label>Limite</label>
                  <input type="number" min="1" class="form-control" data-action="builder-limit" value="${escapeHtml(this.state.queryBuilder.limit)}" />
                </div>
                <div class="zrn_processing_actions">
                  <button type="button" class="btn btn-primary" data-action="builder-generate">Construir y ejecutar</button>
                  <button type="button" class="btn btn-secondary" data-action="builder-clear">Limpiar builder</button>
                </div>
              </div>
            </div>
            <div class="zrn_processing_query_editor">
              <div class="zrn_processing_query_toolbar">
                <button
                  type="button"
                  class="btn btn-primary zrn_processing_query_play"
                  data-action="run-query"
                  ${this.state.sourceMeta.loaded ? "" : "disabled"}
                  aria-label="${this.state.queryState.running ? "Ejecutando" : "Ejecutar SQL"}"
                  title="${this.state.queryState.running ? "Ejecutando" : "Ejecutar SQL"}"
                >
                  <i class="fa fa-play"></i>
                </button>
              </div>
              <textarea class="zrn_processing_query_area" data-action="sql-input" placeholder="SELECT * FROM [dataset] LIMIT 20;">${escapeHtml(
                this.state.queryState.sql,
              )}</textarea>
              ${
                this.state.queryState.error
                  ? `<div class="zrn_processing_query_error">${escapeHtml(this.state.queryState.error)}</div>`
                  : ""
              }
            </div>
          </div>
        </div>
      </section>
    `;
  }

  renderResultPanel() {
    const resultColumns = this.state.queryState.columns;
    const resultRows = this.state.queryState.rows;
    const numericResultColumns = resultColumns.filter((column) =>
      resultRows.some((row) => toChartNumber(row[column]) !== null),
    );
    const resultTabs = [
      ["table", "Tabla"],
      ["json", "JSON"],
      ["chart", "Grafica"],
    ];
    const resultHead = resultColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
    const resultBody = resultRows
      .map((row) => {
        const cells = resultColumns
          .map((column) => `<td>${escapeHtml(row[column] ?? "")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const resultTabButtons = resultTabs
      .map(
        ([key, label]) => `
          <button
            type="button"
            class="btn zrn_processing_result_tab ${this.state.queryState.activeView === key ? "is-active" : ""}"
            data-action="result-view"
            data-view="${key}"
            ${key === "chart" && !resultRows.length ? "disabled" : ""}
          >
            ${label}
          </button>
        `,
      )
      .join("");
    const chartConfig = resultRows.length
      ? `
          <div class="zrn_processing_chart_form">
            <div class="zrn_processing_field">
              <label>Tipo</label>
              <select class="form-select" data-action="chart-type">
                <option value="bar" ${this.state.chartState.type === "bar" ? "selected" : ""}>Barra</option>
                <option value="line" ${this.state.chartState.type === "line" ? "selected" : ""}>Linea</option>
                <option value="pie" ${this.state.chartState.type === "pie" ? "selected" : ""}>Pie</option>
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Eje X</label>
              <select class="form-select" data-action="chart-category">
                ${resultColumns
                  .map(
                    (column) =>
                      `<option value="${escapeHtml(column)}" ${this.state.chartState.categoryColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Metrica Y</label>
              <select class="form-select" data-action="chart-value">
                ${numericResultColumns
                  .map(
                    (column) =>
                      `<option value="${escapeHtml(column)}" ${this.state.chartState.valueColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Agregacion</label>
              <select class="form-select" data-action="chart-aggregate">
                ${["sum", "avg", "count", "min", "max"]
                  .map(
                    (aggregate) =>
                      `<option value="${aggregate}" ${this.state.chartState.aggregate === aggregate ? "selected" : ""}>${aggregate.toUpperCase()}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
        `
      : "";
    const chartPreview = this.state.queryState.activeView === "chart" ? this.getChartData() : null;
    this.state.chartState.error = chartPreview?.error || "";
    const resultContent =
      this.state.queryState.activeView === "json"
        ? this.state.queryState.json
          ? `<div class="zrn_processing_result_json_wrap"><pre class="zrn_processing_result_json">${escapeHtml(this.state.queryState.json)}</pre></div>`
          : '<div class="zrn_processing_result_empty">Ejecuta una consulta para ver el JSON.</div>'
        : this.state.queryState.activeView === "chart"
          ? `
              ${chartConfig}
              ${chartPreview?.error ? `<div class="zrn_processing_query_error">${escapeHtml(chartPreview.error)}</div>` : ""}
              ${chartPreview?.error ? "" : '<div class="zrn_processing_chart_canvas" data-zrn-chart-root="1"></div>'}
            `
          : resultColumns.length
            ? `
                <div class="zrn_processing_result_wrap">
                  <table class="o_list_table table table-sm zrn_processing_result_table">
                    <thead><tr>${resultHead}</tr></thead>
                    <tbody>${resultBody}</tbody>
                  </table>
                </div>
              `
            : '<div class="zrn_processing_result_empty">Ejecuta una consulta para ver resultados.</div>';
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Resultados</strong>
          <span>${this.state.queryState.totalRows} fila(s) / preview maximo ${QUERY_RESULT_LIMIT}</span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_result_tabs">${resultTabButtons}</div>
          <div class="zrn_processing_result_stage">${resultContent}</div>
        </div>
      </section>
    `;
  }

  renderScenarioToolbar(scenarioData) {
    const activeView = this.state.scenarioState.activeView || "table";
    const chartType = this.state.scenarioState.chartType || "bar";
    const hasData = !scenarioData.error && scenarioData.summaryByGroup?.length;
    const exportButtons =
      activeView === "table"
        ? `
            <div class="zrn_processing_scenario_exports">
              <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="xlsx" ${hasData ? "" : "disabled"}>
                <i class="fa fa-file-excel-o"></i>
                Excel
              </button>
              <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="csv" ${hasData ? "" : "disabled"}>
                <i class="fa fa-file-text-o"></i>
                CSV
              </button>
              <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="xml" ${hasData ? "" : "disabled"}>
                <i class="fa fa-code"></i>
                XML
              </button>
              <div class="zrn_processing_scenario_text_export">
                <input
                  type="text"
                  class="form-control"
                  maxlength="1"
                  aria-label="Separador TXT"
                  value="${escapeHtml(this.state.scenarioState.textDelimiter || "|")}"
                  data-action="scenario-text-delimiter"
                  ${hasData ? "" : "disabled"}
                />
                <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="txt" ${hasData ? "" : "disabled"}>
                  <i class="fa fa-file-o"></i>
                  TXT
                </button>
              </div>
            </div>
          `
        : `
            <div class="zrn_processing_scenario_exports">
              <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="png" ${hasData ? "" : "disabled"}>
                <i class="fa fa-picture-o"></i>
                PNG
              </button>
              <button type="button" class="btn zrn_processing_scenario_export_btn" data-action="scenario-export" data-format="pdf" ${hasData ? "" : "disabled"}>
                <i class="fa fa-file-pdf-o"></i>
                PDF
              </button>
            </div>
          `;
    const viewButtons = [
      ["table", "table", "fa-table", "Tabla"],
      ["chart", "bar", "fa-bar-chart", "Barras"],
      ["chart", "line", "fa-line-chart", "Linea"],
      ["chart", "pie", "fa-pie-chart", "Pie"],
    ]
      .map(([view, type, icon, label]) => {
        const isActive = view === "table" ? activeView === "table" : activeView === "chart" && chartType === type;
        const action = view === "table" ? "scenario-view" : "scenario-chart-type";
        const attrs =
          view === "table"
            ? `data-action="${action}" data-view="table"`
            : `data-action="${action}" data-chart-type="${type}"`;
        return `
          <button
            type="button"
            class="btn zrn_processing_scenario_view_btn ${isActive ? "is-active" : ""}"
            ${attrs}
            ${hasData ? "" : "disabled"}
            aria-label="${escapeHtml(label)}"
            title="${escapeHtml(label)}"
          >
            <i class="fa ${icon}"></i>
          </button>
        `;
      })
      .join("");
    return `
      <div class="zrn_processing_scenario_toolbar">
        <div class="zrn_processing_scenario_toolbar_start">
          ${exportButtons}
        </div>
        <div class="zrn_processing_scenario_toolbar_end">
          <div class="zrn_processing_scenario_view_group">${viewButtons}</div>
        </div>
      </div>
    `;
  }

  renderTotalsPanel() {
    const scenarioData = this.getScenarioPanelData();
    const optionSets = scenarioData.optionSets || this.getScenarioOptionSets();
    const groupOptions = optionSets.groupColumns
      .map(
        (column) =>
          `<option value="${escapeHtml(column)}" ${this.state.scenarioState.groupByColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
      )
      .join("");
    const metricOptions = optionSets.metricColumns
      .map(
        (column) =>
          `<option value="${escapeHtml(column)}" ${this.state.scenarioState.metricColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
      )
      .join("");
    const formulaRows = this.state.scenarioState.calculatedColumns.length
      ? this.state.scenarioState.calculatedColumns
          .map(
            (formula) => `
              <div class="zrn_processing_scenario_row">
                <div class="zrn_processing_scenario_row_head">
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      data-action="scenario-formula-field"
                      data-formula-id="${escapeHtml(formula.id)}"
                      data-field="enabled"
                      ${formula.enabled ? "checked" : ""}
                    />
                    <label class="form-check-label">Activa</label>
                  </div>
                  <button type="button" class="btn btn-link zrn_processing_scenario_remove" data-action="scenario-remove-formula" data-formula-id="${escapeHtml(formula.id)}">
                    <i class="fa fa-times"></i>
                  </button>
                </div>
                <div class="zrn_processing_scenario_grid zrn_processing_scenario_grid_formula">
                  <div class="zrn_processing_field">
                    <label>Nombre calculado</label>
                    <input
                      type="text"
                      class="form-control"
                      value="${escapeHtml(formula.name)}"
                      data-action="scenario-formula-field"
                      data-formula-id="${escapeHtml(formula.id)}"
                      data-field="name"
                    />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Columna A</label>
                    <select
                      class="form-select"
                      data-action="scenario-formula-field"
                      data-formula-id="${escapeHtml(formula.id)}"
                      data-field="leftColumn"
                    >
                      <option value="">Selecciona</option>
                      ${optionSets.numericColumns
                        .map(
                          (column) =>
                            `<option value="${escapeHtml(column)}" ${formula.leftColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Operacion</label>
                    <select
                      class="form-select"
                      data-action="scenario-formula-field"
                      data-formula-id="${escapeHtml(formula.id)}"
                      data-field="operator"
                    >
                      ${["+", "-", "*", "/"]
                        .map(
                          (operator) =>
                            `<option value="${operator}" ${formula.operator === operator ? "selected" : ""}>${escapeHtml(operator)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Columna B</label>
                    <select
                      class="form-select"
                      data-action="scenario-formula-field"
                      data-formula-id="${escapeHtml(formula.id)}"
                      data-field="rightColumn"
                    >
                      <option value="">Selecciona</option>
                      ${optionSets.numericColumns
                        .map(
                          (column) =>
                            `<option value="${escapeHtml(column)}" ${formula.rightColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                </div>
              </div>
            `,
          )
          .join("")
      : `<div class="zrn_processing_result_empty">No hay columnas calculadas. Crea una para revenue, porcentajes u otros derivados.</div>`;

    const ruleRows = this.state.scenarioState.rules.length
      ? this.state.scenarioState.rules
          .map(
            (rule) => `
              <div class="zrn_processing_scenario_row">
                <div class="zrn_processing_scenario_row_head">
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="enabled"
                      ${rule.enabled ? "checked" : ""}
                    />
                    <label class="form-check-label">Activa</label>
                  </div>
                  <button type="button" class="btn btn-link zrn_processing_scenario_remove" data-action="scenario-remove-rule" data-rule-id="${escapeHtml(rule.id)}">
                    <i class="fa fa-times"></i>
                  </button>
                </div>
                <div class="zrn_processing_scenario_grid zrn_processing_scenario_grid_rule">
                  <div class="zrn_processing_field">
                    <label>Nombre</label>
                    <input
                      type="text"
                      class="form-control"
                      value="${escapeHtml(rule.name)}"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="name"
                    />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Si columna</label>
                    <select
                      class="form-select"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="conditionColumn"
                    >
                      <option value="">Selecciona</option>
                      ${optionSets.conditionColumns
                        .map(
                          (column) =>
                            `<option value="${escapeHtml(column)}" ${rule.conditionColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Operador</label>
                    <select
                      class="form-select"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="conditionOperator"
                    >
                      ${[
                        ["eq", "="],
                        ["neq", "!="],
                        ["contains", "contiene"],
                        ["gt", ">"],
                        ["gte", ">="],
                        ["lt", "<"],
                        ["lte", "<="],
                      ]
                        .map(
                          ([value, label]) =>
                            `<option value="${value}" ${rule.conditionOperator === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Valor condicion</label>
                    <input
                      type="text"
                      class="form-control"
                      value="${escapeHtml(rule.conditionValue)}"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="conditionValue"
                    />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Columna objetivo</label>
                    <select
                      class="form-select"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="targetColumn"
                    >
                      <option value="">Selecciona</option>
                      ${optionSets.targetColumns
                        .map(
                          (column) =>
                            `<option value="${escapeHtml(column)}" ${rule.targetColumn === column ? "selected" : ""}>${escapeHtml(column)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Accion</label>
                    <select
                      class="form-select"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="actionType"
                    >
                      ${[
                        ["add", "Sumar valor"],
                        ["subtract", "Restar valor"],
                        ["multiply", "Multiplicar factor"],
                        ["set", "Reemplazar valor"],
                        ["percent_delta", "% sobre valor actual"],
                      ]
                        .map(
                          ([value, label]) =>
                            `<option value="${value}" ${rule.actionType === value ? "selected" : ""}>${escapeHtml(label)}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Valor accion</label>
                    <input
                      type="number"
                      step="0.01"
                      class="form-control"
                      value="${escapeHtml(rule.actionValue)}"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="actionValue"
                    />
                  </div>
                  <div class="zrn_processing_field">
                    <label>Salida</label>
                    <select
                      class="form-select"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="outputColumnMode"
                    >
                      <option value="replace" ${rule.outputColumnMode === "replace" ? "selected" : ""}>Sobrescribir objetivo</option>
                      <option value="new_column" ${rule.outputColumnMode === "new_column" ? "selected" : ""}>Nueva columna</option>
                    </select>
                  </div>
                  <div class="zrn_processing_field">
                    <label>Nombre salida</label>
                    <input
                      type="text"
                      class="form-control"
                      value="${escapeHtml(rule.outputColumnName)}"
                      data-action="scenario-rule-field"
                      data-rule-id="${escapeHtml(rule.id)}"
                      data-field="outputColumnName"
                      ${rule.outputColumnMode === "new_column" ? "" : "disabled"}
                    />
                  </div>
                </div>
              </div>
            `,
          )
          .join("")
      : `<div class="zrn_processing_result_empty">No hay reglas cargadas. Agrega una para simular aumentos, descuentos o reemplazos por fila.</div>`;

    const warningHtml = scenarioData.warnings?.length
      ? `
          <div class="zrn_processing_scenario_warnings">
            ${scenarioData.warnings
              .map((warning) => `<div class="zrn_processing_scenario_warning">${escapeHtml(warning)}</div>`)
              .join("")}
          </div>
        `
      : "";
    const scenarioChartData = this.state.scenarioState.activeView === "chart" ? this.getScenarioChartData() : null;
    const tableRows = scenarioData.error
      ? ""
      : scenarioData.summaryByGroup
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.label)}</td>
                <td>${this.formatMetric(item.baseTotal)}</td>
                <td>${this.formatMetric(item.scenarioTotal)}</td>
                <td>${this.formatMetric(item.difference)}</td>
                <td>${item.changePct === null ? "-" : `${this.formatMetric(item.changePct, 2)}%`}</td>
                <td>${this.formatMetric(item.baseSharePct, 2)}%</td>
                <td>${this.formatMetric(item.scenarioSharePct, 2)}%</td>
              </tr>
            `,
          )
          .join("");
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Totales y escenarios</strong>
          <span>Simulacion temporal por fila sobre el query actual</span>
        </div>
        <div class="zrn_processing_panel_body">
          <div class="zrn_processing_totals_grid">
            <div class="zrn_processing_field">
              <label>Agrupar por</label>
              <select class="form-select" data-action="scenario-group-column" ${optionSets.groupColumns.length ? "" : "disabled"}>
                ${groupOptions || '<option value="">Sin columnas</option>'}
              </select>
            </div>
            <div class="zrn_processing_field">
              <label>Columna a resumir</label>
              <select class="form-select" data-action="scenario-metric-column" ${optionSets.metricColumns.length ? "" : "disabled"}>
                ${metricOptions || '<option value="">Sin metricas</option>'}
              </select>
            </div>
            <div class="zrn_processing_scenario_hint">
              <strong>Flujo</strong>
              <span>1. Calcula columnas. 2. Aplica reglas por fila. 3. Compara base vs escenario.</span>
            </div>
          </div>
          <div class="zrn_processing_scenario_section">
            <div class="zrn_processing_scenario_section_head">
              <strong>Columnas calculadas</strong>
              <button type="button" class="btn btn-secondary" data-action="scenario-add-formula">Crear columna</button>
            </div>
            ${formulaRows}
          </div>
          <div class="zrn_processing_scenario_section">
            <div class="zrn_processing_scenario_section_head">
              <strong>Reglas del escenario</strong>
              <button type="button" class="btn btn-secondary" data-action="scenario-add-rule">Agregar regla</button>
            </div>
            ${ruleRows}
          </div>
          ${warningHtml}
          ${
            scenarioData.error
              ? `<div class="zrn_processing_result_empty">${escapeHtml(scenarioData.error)}</div>`
              : `
                  <div class="zrn_processing_totals_kpis">
                    <div class="zrn_processing_total_kpi">
                      <span>Total base</span>
                      <strong>${this.formatMetric(scenarioData.totalBase)}</strong>
                    </div>
                    <div class="zrn_processing_total_kpi">
                      <span>Total escenario</span>
                      <strong>${this.formatMetric(scenarioData.totalScenario)}</strong>
                    </div>
                    <div class="zrn_processing_total_kpi">
                      <span>Delta absoluto</span>
                      <strong>${this.formatMetric(scenarioData.deltaValue)}</strong>
                    </div>
                    <div class="zrn_processing_total_kpi">
                      <span>Delta porcentual</span>
                      <strong>${scenarioData.deltaPercent === null ? "-" : `${this.formatMetric(scenarioData.deltaPercent, 2)}%`}</strong>
                    </div>
                  </div>
                  ${this.renderScenarioToolbar(scenarioData)}
                  ${
                    this.state.scenarioState.activeView === "chart"
                      ? `
                          ${scenarioChartData?.error ? `<div class="zrn_processing_query_error">${escapeHtml(scenarioChartData.error)}</div>` : ""}
                          ${scenarioChartData?.error ? "" : '<div class="zrn_processing_chart_canvas" data-zrn-scenario-chart-root="1"></div>'}
                        `
                      : `
                          <div class="zrn_processing_result_wrap zrn_processing_totals_table_wrap">
                            <table class="o_list_table table table-sm zrn_processing_result_table">
                              <thead>
                                <tr>
                                  <th>${escapeHtml(scenarioData.groupByColumn || "Grupo")}</th>
                                  <th>Base</th>
                                  <th>Escenario</th>
                                  <th>Diferencia</th>
                                  <th>% cambio</th>
                                  <th>% base</th>
                                  <th>% escenario</th>
                                </tr>
                              </thead>
                              <tbody>${tableRows}</tbody>
                            </table>
                          </div>
                        `
                  }
                `
          }
        </div>
      </section>
    `;
  }

  renderHelpPanel() {
    return `
      <section class="zrn_processing_panel">
        <div class="zrn_processing_panel_head">
          <strong>Ayuda SQL</strong>
          <span>Referencia rapida</span>
        </div>
        <div class="zrn_processing_panel_body">
          <ul class="zrn_processing_table_list_plain">
            <li><strong>Tabla:</strong> <code>${escapeHtml(this.state.queryState.tableName || "dataset")}</code></li>
            <li><strong>Permitido:</strong> SELECT, WHERE, GROUP BY, ORDER BY, LIMIT</li>
            <li><strong>Agregados:</strong> COUNT, SUM, AVG, MIN, MAX</li>
            <li><strong>No permitido:</strong> INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, ATTACH</li>
          </ul>
        </div>
      </section>
    `;
  }

  render() {
    if (!this.root) {
      return;
    }
    const focusState = this.captureFocusedField();
    if (this.screenMode === "landing") {
      this.root.innerHTML = this.renderLanding();
      this.disposeChart();
      this.disposeScenarioChart();
      this.restoreFocusedField(focusState);
      return;
    }

    const sheet = this.selectedSheet;
    const table = this.selectedTable;
    const scenarioData = this.getScenarioPanelData();
    this.root.innerHTML = `
      <div class="zrn_processing_app">
        ${this.state.globalError ? `<div class="zrn_processing_global_error">${escapeHtml(this.state.globalError)}</div>` : ""}
        ${
          !this.state.sourceMeta.loaded
            ? `
              <section class="zrn_processing_panel">
                <div class="zrn_processing_panel_head">
                  <strong>Origen pendiente</strong>
                  <span>Sin dataset activo</span>
                </div>
                <div class="zrn_processing_panel_body">
                  <div class="zrn_processing_empty_state">
                    <div class="zrn_processing_empty">No hay origen temporal cargado en esta sesion.</div>
                    <div class="zrn_processing_actions">
                      <button type="button" class="btn btn-secondary" data-action="back-to-processing">Volver a carga</button>
                    </div>
                  </div>
                </div>
              </section>
            `
            : `
              ${this.renderOverviewPanel(sheet, table)}
              ${this.renderDatasetPanelEnhanced(sheet, table)}
              ${this.renderSellInOutMappingPanel(table)}
              ${this.renderSellInOutDashboard()}
            `
        }
      </div>
    `;

    this.restoreFocusedField(focusState);
  }
}

let sharedProcessingView = null;

export function getSharedProcessingView() {
  if (!sharedProcessingView) {
    sharedProcessingView = new ZrnAnalyticsProcessingView();
  }
  return sharedProcessingView;
}

function syncStandaloneProcessingRoot() {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.querySelector("[data-zrn-processing-root='1']");
  const view = getSharedProcessingView();
  if (root && view.root !== root) {
    view.mount(root);
    return;
  }
  if (!root && view.root) {
    view.unmount();
  }
}

function bootstrapStandaloneProcessingRoot() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  let scheduled = false;
  const scheduleSync = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      syncStandaloneProcessingRoot();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSync, { once: true });
  } else {
    scheduleSync();
  }

  const observerTarget = document.body || document.documentElement;
  if (!observerTarget) {
    return;
  }
  const observer = new MutationObserver(() => {
    scheduleSync();
  });
  observer.observe(observerTarget, { childList: true, subtree: true });
}

bootstrapStandaloneProcessingRoot();
