import type {
    BeanCollection,
    ColumnModel,
    ColumnPanelItemDragEndEvent,
    ColumnPanelItemDragStartEvent,
    DragItem,
    DragSource,
    ITooltipParams,
    WithoutGridCommon,
} from '@ag-grid-community/core';
import {
    AgCheckbox,
    AgColumn,
    Component,
    CssClassApplier,
    DragAndDropService,
    DragSourceType,
    Events,
    KeyCode,
    RefPlaceholder,
    _createIconNoSpan,
    _escapeString,
    _setAriaDescribedBy,
    _setAriaLabel,
    _setDisplayed,
} from '@ag-grid-community/core';

import type { ColumnModelItem } from './columnModelItem';
import type { ModelItemUtils } from './modelItemUtils';
import { ToolPanelContextMenu } from './toolPanelContextMenu';

export class ToolPanelColumnComp extends Component {
    private static TEMPLATE /* html */ = `<div class="ag-column-select-column" aria-hidden="true">
            <ag-checkbox data-ref="cbSelect" class="ag-column-select-checkbox"></ag-checkbox>
            <span class="ag-column-select-column-label" data-ref="eLabel"></span>
        </div>`;

    private columnModel: ColumnModel;
    private dragAndDropService: DragAndDropService;
    private modelItemUtils: ModelItemUtils;

    public wireBeans(beans: BeanCollection) {
        this.columnModel = beans.columnModel;
        this.dragAndDropService = beans.dragAndDropService;
        this.modelItemUtils = beans.modelItemUtils;
    }

    private readonly eLabel: HTMLElement = RefPlaceholder;
    private readonly cbSelect: AgCheckbox = RefPlaceholder;

    private column: AgColumn;
    private columnDept: number;
    private eDragHandle: Element;
    private displayName: string | null;
    private processingColumnStateChange = false;

    constructor(
        modelItem: ColumnModelItem,
        private readonly allowDragging: boolean,
        private readonly groupsExist: boolean,
        private readonly focusWrapper: HTMLElement
    ) {
        super();
        this.column = modelItem.getColumn();
        this.columnDept = modelItem.getDept();
        this.displayName = modelItem.getDisplayName();
    }

    public postConstruct(): void {
        this.setTemplate(ToolPanelColumnComp.TEMPLATE, [AgCheckbox]);
        this.eDragHandle = _createIconNoSpan('columnDrag', this.gos)!;
        this.eDragHandle.classList.add('ag-drag-handle', 'ag-column-select-column-drag-handle');

        const checkboxGui = this.cbSelect.getGui();
        const checkboxInput = this.cbSelect.getInputElement();

        checkboxGui.insertAdjacentElement('afterend', this.eDragHandle);
        checkboxInput.setAttribute('tabindex', '-1');

        const displayNameSanitised: any = _escapeString(this.displayName);
        this.eLabel.innerHTML = displayNameSanitised;

        // if grouping, we add an extra level of indent, to cater for expand/contract icons we need to indent for
        const indent = this.columnDept;
        if (this.groupsExist) {
            this.addCssClass('ag-column-select-add-group-indent');
        }
        this.addCssClass(`ag-column-select-indent-${indent}`);
        this.getGui().style.setProperty('--ag-indentation-level', String(indent));

        this.setupDragging();

        this.addManagedListener(
            this.eventService,
            Events.EVENT_COLUMN_PIVOT_MODE_CHANGED,
            this.onColumnStateChanged.bind(this)
        );
        this.addManagedListener(this.column, AgColumn.EVENT_VALUE_CHANGED, this.onColumnStateChanged.bind(this));
        this.addManagedListener(this.column, AgColumn.EVENT_PIVOT_CHANGED, this.onColumnStateChanged.bind(this));
        this.addManagedListener(this.column, AgColumn.EVENT_ROW_GROUP_CHANGED, this.onColumnStateChanged.bind(this));
        this.addManagedListener(this.column, AgColumn.EVENT_VISIBLE_CHANGED, this.onColumnStateChanged.bind(this));
        this.addManagedListener(this.focusWrapper, 'keydown', this.handleKeyDown.bind(this));
        this.addManagedListener(this.focusWrapper, 'contextmenu', this.onContextMenu.bind(this));

        this.addManagedPropertyListener('functionsReadOnly', this.onColumnStateChanged.bind(this));

        this.addManagedListener(this.cbSelect, Events.EVENT_FIELD_VALUE_CHANGED, this.onCheckboxChanged.bind(this));
        this.addManagedListener(this.eLabel, 'click', this.onLabelClicked.bind(this));

        this.onColumnStateChanged();
        this.refreshAriaLabel();

        this.setupTooltip();

        const classes = CssClassApplier.getToolPanelClassesFromColDef(
            this.column.getColDef(),
            this.gos,
            this.column,
            null
        );
        classes.forEach((c) => this.addOrRemoveCssClass(c, true));
    }

    public getColumn(): AgColumn {
        return this.column;
    }

    private setupTooltip(): void {
        const isTooltipWhenTruncated = this.gos.get('tooltipShowMode') === 'whenTruncated';
        let shouldDisplayTooltip: (() => boolean) | undefined;

        if (isTooltipWhenTruncated) {
            shouldDisplayTooltip = () => this.eLabel.scrollWidth > this.eLabel.clientWidth;
        }
        const refresh = () => {
            const newTooltipText = this.column.getColDef().headerTooltip;
            this.setTooltip({ newTooltipText, location: 'columnToolPanelColumn', shouldDisplayTooltip });
        };

        refresh();

        this.addManagedListener(this.eventService, Events.EVENT_NEW_COLUMNS_LOADED, refresh);
    }

    public override getTooltipParams(): WithoutGridCommon<ITooltipParams> {
        const res = super.getTooltipParams();
        res.location = 'columnToolPanelColumn';
        res.colDef = this.column.getColDef();
        return res;
    }

    private onContextMenu(e: MouseEvent): void {
        const { column, gos } = this;

        if (gos.get('functionsReadOnly')) {
            return;
        }

        const contextMenu = this.createBean(new ToolPanelContextMenu(column, e, this.focusWrapper));
        this.addDestroyFunc(() => {
            if (contextMenu.isAlive()) {
                this.destroyBean(contextMenu);
            }
        });
    }

    protected handleKeyDown(e: KeyboardEvent): void {
        if (e.key === KeyCode.SPACE) {
            e.preventDefault();
            if (this.isSelectable()) {
                this.onSelectAllChanged(!this.isSelected());
            }
        }
    }

    private onLabelClicked(): void {
        if (this.gos.get('functionsReadOnly')) {
            return;
        }

        const nextState = !this.cbSelect.getValue();
        this.onChangeCommon(nextState);
    }

    private onCheckboxChanged(event: any): void {
        this.onChangeCommon(event.selected);
    }

    private onChangeCommon(nextState: boolean): void {
        // ignore lock visible columns
        if (this.cbSelect.isReadOnly()) {
            return;
        }

        this.refreshAriaLabel();

        // only want to action if the user clicked the checkbox, not if we are setting the checkbox because
        // of a change in the model
        if (this.processingColumnStateChange) {
            return;
        }

        this.modelItemUtils.setColumn(this.column, nextState, 'toolPanelUi');
    }

    private refreshAriaLabel(): void {
        const translate = this.localeService.getLocaleTextFunc();
        const columnLabel = translate('ariaColumn', 'Column');
        const state = this.cbSelect.getValue()
            ? translate('ariaVisible', 'visible')
            : translate('ariaHidden', 'hidden');
        const visibilityLabel = translate('ariaToggleVisibility', 'Press SPACE to toggle visibility');

        _setAriaLabel(this.focusWrapper, `${this.displayName} ${columnLabel}`);
        this.cbSelect.setInputAriaLabel(`${visibilityLabel} (${state})`);
        _setAriaDescribedBy(this.focusWrapper, this.cbSelect.getInputElement().id);
    }

    private setupDragging(): void {
        if (!this.allowDragging) {
            _setDisplayed(this.eDragHandle, false);
            return;
        }

        let hideColumnOnExit = !this.gos.get('suppressDragLeaveHidesColumns');
        const dragSource: DragSource = {
            type: DragSourceType.ToolPanel,
            eElement: this.eDragHandle,
            dragItemName: this.displayName,
            getDefaultIconName: () =>
                hideColumnOnExit ? DragAndDropService.ICON_HIDE : DragAndDropService.ICON_NOT_ALLOWED,
            getDragItem: () => this.createDragItem(),
            onDragStarted: () => {
                hideColumnOnExit = !this.gos.get('suppressDragLeaveHidesColumns');
                const event: WithoutGridCommon<ColumnPanelItemDragStartEvent> = {
                    type: Events.EVENT_COLUMN_PANEL_ITEM_DRAG_START,
                    column: this.column,
                };
                this.eventService.dispatchEvent(event);
            },
            onDragStopped: () => {
                const event: WithoutGridCommon<ColumnPanelItemDragEndEvent> = {
                    type: Events.EVENT_COLUMN_PANEL_ITEM_DRAG_END,
                };
                this.eventService.dispatchEvent(event);
            },
            onGridEnter: (dragItem: DragItem | null) => {
                if (hideColumnOnExit) {
                    // when dragged into the grid, restore the state that was active pre-drag
                    this.modelItemUtils.updateColumns({
                        columns: [this.column],
                        visibleState: dragItem?.visibleState,
                        pivotState: dragItem?.pivotState,
                        eventType: 'toolPanelUi',
                    });
                }
            },
            onGridExit: () => {
                if (hideColumnOnExit) {
                    // when dragged outside of the grid, mimic what happens when checkbox is disabled
                    // this handles the behaviour for pivot which is different to just hiding a column.
                    this.onChangeCommon(false);
                }
            },
        };

        this.dragAndDropService.addDragSource(dragSource, true);
        this.addDestroyFunc(() => this.dragAndDropService.removeDragSource(dragSource));
    }

    private createDragItem() {
        const colId = this.column.getColId();
        const visibleState = { [colId]: this.column.isVisible() };
        const pivotState = { [colId]: this.modelItemUtils.createPivotState(this.column) };
        return {
            columns: [this.column],
            visibleState,
            pivotState,
        };
    }

    private onColumnStateChanged(): void {
        this.processingColumnStateChange = true;
        const isPivotMode = this.columnModel.isPivotMode();
        if (isPivotMode) {
            // if reducing, checkbox means column is one of pivot, value or group
            const anyFunctionActive = this.column.isAnyFunctionActive();
            this.cbSelect.setValue(anyFunctionActive);
        } else {
            // if not reducing, the checkbox tells us if column is visible or not
            this.cbSelect.setValue(this.column.isVisible());
        }

        let canBeToggled = true;
        let canBeDragged = true;
        if (isPivotMode) {
            // when in pivot mode, the item should be read only if:
            //  a) gui is not allowed make any changes
            const functionsReadOnly = this.gos.get('functionsReadOnly');
            //  b) column is not allow any functions on it
            const noFunctionsAllowed = !this.column.isAnyFunctionAllowed();
            canBeToggled = !functionsReadOnly && !noFunctionsAllowed;
            canBeDragged = canBeToggled;
        } else {
            const { enableRowGroup, enableValue, lockPosition, suppressMovable, lockVisible } = this.column.getColDef();
            const forceDraggable = !!enableRowGroup || !!enableValue;
            const disableDraggable = !!lockPosition || !!suppressMovable;
            canBeToggled = !lockVisible;
            canBeDragged = forceDraggable || !disableDraggable;
        }

        this.cbSelect.setReadOnly(!canBeToggled);
        this.eDragHandle.classList.toggle('ag-column-select-column-readonly', !canBeDragged);
        this.addOrRemoveCssClass('ag-column-select-column-readonly', !canBeDragged && !canBeToggled);

        this.cbSelect.setPassive(false);

        this.processingColumnStateChange = false;
    }

    public getDisplayName(): string | null {
        return this.displayName;
    }

    public onSelectAllChanged(value: boolean): void {
        if (value !== this.cbSelect.getValue()) {
            if (!this.cbSelect.isReadOnly()) {
                this.cbSelect.toggle();
            }
        }
    }

    public isSelected(): boolean | undefined {
        return this.cbSelect.getValue();
    }

    public isSelectable(): boolean {
        return !this.cbSelect.isReadOnly();
    }

    public isExpandable(): boolean {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public setExpanded(_value: boolean): void {
        console.warn('AG Grid: can not expand a column item that does not represent a column group header');
    }
}
