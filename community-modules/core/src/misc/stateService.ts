import type { ColumnApplyStateService, ColumnState, ColumnStateParams } from '../columns/columnApplyStateService';
import type { ColumnGetStateService } from '../columns/columnGetStateService';
import type { ColumnGroupStateService } from '../columns/columnGroupStateService';
import type { ColumnModel } from '../columns/columnModel';
import type { PivotResultColsService } from '../columns/pivotResultColsService';
import type { VisibleColsService } from '../columns/visibleColsService';
import type { NamedBean } from '../context/bean';
import { BeanStub } from '../context/beanStub';
import type { BeanCollection } from '../context/context';
import type { CtrlsService } from '../ctrlsService';
import type { AgColumn } from '../entities/agColumn';
import { Events } from '../eventKeys';
import type { EventsType } from '../eventKeys';
import type {
    NewColumnsLoadedEvent,
    PaginationChangedEvent,
    RangeSelectionChangedEvent,
    StateUpdatedEvent,
} from '../events';
import type { FilterManager } from '../filter/filterManager';
import type { FocusService } from '../focusService';
import type { CellRange, IRangeService } from '../interfaces/IRangeService';
import type { AdvancedFilterModel } from '../interfaces/advancedFilterModel';
import type {
    AggregationColumnState,
    AggregationState,
    ColumnGroupState,
    ColumnOrderState,
    ColumnPinningState,
    ColumnSizeState,
    ColumnSizingState,
    ColumnVisibilityState,
    FilterState,
    FocusedCellState,
    GridState,
    PaginationState,
    PivotState,
    RangeSelectionState,
    RowGroupExpansionState,
    RowGroupState,
    ScrollState,
    SideBarState,
    SortState,
} from '../interfaces/gridState';
import type { WithoutGridCommon } from '../interfaces/iCommon';
import type { IExpansionService } from '../interfaces/iExpansionService';
import type { FilterModel } from '../interfaces/iFilter';
import type { IRowModel } from '../interfaces/iRowModel';
import type { ISelectionService } from '../interfaces/iSelectionService';
import type { ISideBarService } from '../interfaces/iSideBar';
import type { ServerSideRowGroupSelectionState, ServerSideRowSelectionState } from '../interfaces/selectionState';
import type { PaginationService } from '../pagination/paginationService';
import type { ColumnAnimationService } from '../rendering/columnAnimationService';
import type { SortModelItem } from '../sortController';
import { _debounce } from '../utils/function';
import { _jsonEquals } from '../utils/generic';

export class StateService extends BeanStub implements NamedBean {
    beanName = 'stateService' as const;

    private filterManager?: FilterManager;
    private ctrlsService: CtrlsService;
    private pivotResultColsService: PivotResultColsService;
    private focusService: FocusService;
    private columnModel: ColumnModel;
    private visibleColsService: VisibleColsService;
    private columnGroupStateService: ColumnGroupStateService;
    private columnGetStateService: ColumnGetStateService;
    private paginationService?: PaginationService;
    private rowModel: IRowModel;
    private selectionService: ISelectionService;
    private expansionService: IExpansionService;
    private columnAnimationService: ColumnAnimationService;
    private columnApplyStateService: ColumnApplyStateService;
    private sideBarService?: ISideBarService;
    private rangeService?: IRangeService;

    public wireBeans(beans: BeanCollection): void {
        this.filterManager = beans.filterManager;
        this.ctrlsService = beans.ctrlsService;
        this.pivotResultColsService = beans.pivotResultColsService;
        this.focusService = beans.focusService;
        this.columnModel = beans.columnModel;
        this.visibleColsService = beans.visibleColsService;
        this.columnGroupStateService = beans.columnGroupStateService;
        this.columnGetStateService = beans.columnGetStateService;
        this.paginationService = beans.paginationService;
        this.rowModel = beans.rowModel;
        this.selectionService = beans.selectionService;
        this.expansionService = beans.expansionService;
        this.columnAnimationService = beans.columnAnimationService;
        this.columnApplyStateService = beans.columnApplyStateService;
        this.sideBarService = beans.sideBarService;
        this.rangeService = beans.rangeService;
    }

    private isClientSideRowModel: boolean;
    private cachedState: GridState;
    private suppressEvents = true;
    private queuedUpdateSources: Set<keyof GridState | 'gridInitializing'> = new Set();
    private dispatchStateUpdateEventDebounced = _debounce(() => this.dispatchQueuedStateUpdateEvents(), 0);
    // If user is doing a manual expand all node by node, we don't want to process one at a time.
    // EVENT_ROW_GROUP_OPENED is already async, so no impact of making the state async here.
    private onRowGroupOpenedDebounced = _debounce(
        () => this.updateCachedState('rowGroupExpansion', this.getRowGroupExpansionState()),
        0
    );
    // similar to row expansion, want to debounce. However, selection is synchronous, so need to mark as stale in case `getState` is called.
    private onRowSelectedDebounced = _debounce(() => {
        this.staleStateKeys.delete('rowSelection');
        this.updateCachedState('rowSelection', this.getRowSelectionState());
    }, 0);
    private columnStates?: ColumnState[];
    private columnGroupStates?: { groupId: string; open: boolean | undefined }[];
    private staleStateKeys: Set<keyof GridState> = new Set();

    public postConstruct(): void {
        this.isClientSideRowModel = this.rowModel.getType() === 'clientSide';

        this.cachedState = this.gos.get('initialState') ?? {};

        this.ctrlsService.whenReady(() => this.suppressEventsAndDispatchInitEvent(() => this.setupStateOnGridReady()));

        const newColumnsLoadedDestroyFunc = this.addManagedListener(
            this.eventService,
            Events.EVENT_NEW_COLUMNS_LOADED,
            ({ source }: NewColumnsLoadedEvent) => {
                if (source === 'gridInitializing') {
                    newColumnsLoadedDestroyFunc?.();
                    this.suppressEventsAndDispatchInitEvent(() => this.setupStateOnColumnsInitialised());
                }
            }
        );
        const rowCountReadyDestroyFunc = this.addManagedListener(
            this.eventService,
            Events.EVENT_ROW_COUNT_READY,
            () => {
                rowCountReadyDestroyFunc?.();
                this.suppressEventsAndDispatchInitEvent(() => this.setupStateOnRowCountReady());
            }
        );
        const firstDataRenderedDestroyFunc = this.addManagedListener(
            this.eventService,
            Events.EVENT_FIRST_DATA_RENDERED,
            () => {
                firstDataRenderedDestroyFunc?.();
                this.suppressEventsAndDispatchInitEvent(() => this.setupStateOnFirstDataRendered());
            }
        );
    }

    public getState(): GridState {
        if (this.staleStateKeys.size) {
            this.refreshStaleState();
        }
        return this.cachedState;
    }

    private setupStateOnGridReady(): void {
        // sidebar reads the initial state itself, so don't need to set

        this.updateCachedState('sideBar', this.getSideBarState());
        const stateUpdater = () => this.updateCachedState('sideBar', this.getSideBarState());
        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_TOOL_PANEL_VISIBLE_CHANGED]: stateUpdater,
            [Events.EVENT_SIDE_BAR_UPDATED]: stateUpdater,
        });
    }

    private setupStateOnColumnsInitialised(): void {
        const initialState = this.gos.get('initialState') ?? {};
        this.setColumnState(initialState);
        this.setColumnGroupState(initialState);

        this.updateColumnState([
            'aggregation',
            'columnOrder',
            'columnPinning',
            'columnSizing',
            'columnVisibility',
            'pivot',
            'pivot',
            'rowGroup',
            'sort',
        ]);
        this.updateCachedState('columnGroup', this.getColumnGroupState());

        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_COLUMN_VALUE_CHANGED]: () => this.updateColumnState(['aggregation']),
            [Events.EVENT_COLUMN_MOVED]: () => this.updateColumnState(['columnOrder']),
            [Events.EVENT_COLUMN_PINNED]: () => this.updateColumnState(['columnPinning']),
            [Events.EVENT_COLUMN_RESIZED]: () => this.updateColumnState(['columnSizing']),
            [Events.EVENT_COLUMN_VISIBLE]: () => this.updateColumnState(['columnVisibility']),
            [Events.EVENT_COLUMN_PIVOT_CHANGED]: () => this.updateColumnState(['pivot']),
            [Events.EVENT_COLUMN_PIVOT_MODE_CHANGED]: () => this.updateColumnState(['pivot']),
            [Events.EVENT_COLUMN_ROW_GROUP_CHANGED]: () => this.updateColumnState(['rowGroup']),
            [Events.EVENT_SORT_CHANGED]: () => this.updateColumnState(['sort']),
            [Events.EVENT_NEW_COLUMNS_LOADED]: () =>
                this.updateColumnState([
                    'aggregation',
                    'columnOrder',
                    'columnPinning',
                    'columnSizing',
                    'columnVisibility',
                    'pivot',
                    'rowGroup',
                    'sort',
                ]),
            [Events.EVENT_COLUMN_GROUP_OPENED]: () => this.updateCachedState('columnGroup', this.getColumnGroupState()),
        });
    }

    private setupStateOnRowCountReady(): void {
        const {
            filter: filterState,
            rowGroupExpansion: rowGroupExpansionState,
            rowSelection: rowSelectionState,
            pagination: paginationState,
        } = this.gos.get('initialState') ?? {};
        const advancedFilterModel = this.gos.get('advancedFilterModel');
        if (filterState || advancedFilterModel) {
            this.setFilterState(filterState, advancedFilterModel);
        }
        if (rowGroupExpansionState) {
            this.setRowGroupExpansionState(rowGroupExpansionState);
        }
        if (rowSelectionState) {
            this.setRowSelectionState(rowSelectionState);
        }
        if (paginationState) {
            this.setPaginationState(paginationState);
        }

        this.updateCachedState('filter', this.getFilterState());
        this.updateCachedState('rowGroupExpansion', this.getRowGroupExpansionState());
        this.updateCachedState('rowSelection', this.getRowSelectionState());
        this.updateCachedState('pagination', this.getPaginationState());

        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_FILTER_CHANGED]: () => this.updateCachedState('filter', this.getFilterState()),
            [Events.EVENT_ROW_GROUP_OPENED]: () => this.onRowGroupOpenedDebounced(),
            [Events.EVENT_EXPAND_COLLAPSE_ALL]: () =>
                this.updateCachedState('rowGroupExpansion', this.getRowGroupExpansionState()),
            [Events.EVENT_SELECTION_CHANGED]: () => {
                this.staleStateKeys.add('rowSelection');
                this.onRowSelectedDebounced();
            },
            [Events.EVENT_PAGINATION_CHANGED]: (event: PaginationChangedEvent) => {
                if (event.newPage || event.newPageSize) {
                    this.updateCachedState('pagination', this.getPaginationState());
                }
            },
        });
    }

    private setupStateOnFirstDataRendered(): void {
        const {
            scroll: scrollState,
            rangeSelection: rangeSelectionState,
            focusedCell: focusedCellState,
            columnOrder: columnOrderState,
        } = this.gos.get('initialState') ?? {};
        if (focusedCellState) {
            this.setFocusedCellState(focusedCellState);
        }
        if (rangeSelectionState) {
            this.setRangeSelectionState(rangeSelectionState);
        }
        if (scrollState) {
            this.setScrollState(scrollState);
        }
        this.setColumnPivotState(!!columnOrderState?.orderedColIds);

        // reset sidebar as it could have updated when columns changed
        this.updateCachedState('sideBar', this.getSideBarState());
        this.updateCachedState('focusedCell', this.getFocusedCellState());
        this.updateCachedState('rangeSelection', this.getRangeSelectionState());
        this.updateCachedState('scroll', this.getScrollState());

        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_CELL_FOCUSED]: () => this.updateCachedState('focusedCell', this.getFocusedCellState()),
            [Events.EVENT_RANGE_SELECTION_CHANGED]: (event: RangeSelectionChangedEvent) => {
                if (event.finished) {
                    this.updateCachedState('rangeSelection', this.getRangeSelectionState());
                }
            },
            [Events.EVENT_BODY_SCROLL_END]: () => this.updateCachedState('scroll', this.getScrollState()),
        });
    }

    private getColumnState(): {
        sort?: SortState;
        rowGroup?: RowGroupState;
        aggregation?: AggregationState;
        pivot?: PivotState;
        columnPinning?: ColumnPinningState;
        columnVisibility?: ColumnVisibilityState;
        columnSizing?: ColumnSizingState;
        columnOrder?: ColumnOrderState;
    } {
        const pivotMode = this.columnModel.isPivotMode();
        const sortColumns: SortModelItem[] = [];
        const groupColIds: string[] = [];
        const aggregationColumns: AggregationColumnState[] = [];
        const pivotColIds: string[] = [];
        const leftColIds: string[] = [];
        const rightColIds: string[] = [];
        const hiddenColIds: string[] = [];
        const columnSizes: ColumnSizeState[] = [];
        const columns: string[] = [];

        const columnState = this.columnGetStateService.getColumnState();
        for (let i = 0; i < columnState.length; i++) {
            const {
                colId,
                sort,
                sortIndex,
                rowGroup,
                rowGroupIndex,
                aggFunc,
                pivot,
                pivotIndex,
                pinned,
                hide,
                width,
                flex,
            } = columnState[i];
            columns.push(colId);
            if (sort) {
                sortColumns[sortIndex ?? 0] = { colId, sort };
            }
            if (rowGroup) {
                groupColIds[rowGroupIndex ?? 0] = colId;
            }
            if (typeof aggFunc === 'string') {
                aggregationColumns.push({ colId, aggFunc });
            }
            if (pivot) {
                pivotColIds[pivotIndex ?? 0] = colId;
            }
            if (pinned) {
                (pinned === 'right' ? rightColIds : leftColIds).push(colId);
            }
            if (hide) {
                hiddenColIds.push(colId);
            }
            if (flex || width) {
                columnSizes.push({ colId, flex: flex ?? undefined, width });
            }
        }

        return {
            sort: sortColumns.length ? { sortModel: sortColumns } : undefined,
            rowGroup: groupColIds.length ? { groupColIds } : undefined,
            aggregation: aggregationColumns.length ? { aggregationModel: aggregationColumns } : undefined,
            pivot: pivotColIds.length || pivotMode ? { pivotMode, pivotColIds } : undefined,
            columnPinning: leftColIds.length || rightColIds.length ? { leftColIds, rightColIds } : undefined,
            columnVisibility: hiddenColIds.length ? { hiddenColIds } : undefined,
            columnSizing: columnSizes.length ? { columnSizingModel: columnSizes } : undefined,
            columnOrder: columns.length ? { orderedColIds: columns } : undefined,
        };
    }

    private setColumnState(initialState: GridState): void {
        const {
            sort: sortState,
            rowGroup: groupState,
            aggregation: aggregationState,
            pivot: pivotState,
            columnPinning: columnPinningState,
            columnVisibility: columnVisibilityState,
            columnSizing: columnSizingState,
            columnOrder: columnOrderState,
        } = initialState;
        const columnStateMap: { [colId: string]: ColumnState } = {};
        const getColumnState = (colId: string) => {
            let columnState = columnStateMap[colId];
            if (columnState) {
                return columnState;
            }
            columnState = { colId };
            columnStateMap[colId] = columnState;
            return columnState;
        };
        if (sortState) {
            sortState.sortModel.forEach(({ colId, sort }, sortIndex) => {
                const columnState = getColumnState(colId);
                columnState.sort = sort;
                columnState.sortIndex = sortIndex;
            });
        }
        if (groupState) {
            groupState.groupColIds.forEach((colId, rowGroupIndex) => {
                const columnState = getColumnState(colId);
                columnState.rowGroup = true;
                columnState.rowGroupIndex = rowGroupIndex;
            });
        }
        if (aggregationState) {
            aggregationState.aggregationModel.forEach(({ colId, aggFunc }) => {
                getColumnState(colId).aggFunc = aggFunc;
            });
        }
        if (pivotState) {
            pivotState.pivotColIds.forEach((colId, pivotIndex) => {
                const columnState = getColumnState(colId);
                columnState.pivot = true;
                columnState.pivotIndex = pivotIndex;
            });
            this.gos.updateGridOptions({
                options: { pivotMode: pivotState.pivotMode },
                source: 'gridInitializing' as any,
            });
        }
        if (columnPinningState) {
            columnPinningState.leftColIds.forEach((colId) => {
                getColumnState(colId).pinned = 'left';
            });
            columnPinningState.rightColIds.forEach((colId) => {
                getColumnState(colId).pinned = 'right';
            });
        }
        if (columnVisibilityState) {
            columnVisibilityState.hiddenColIds.forEach((colId) => {
                getColumnState(colId).hide = true;
            });
        }
        if (columnSizingState) {
            columnSizingState.columnSizingModel.forEach(({ colId, flex, width }) => {
                const columnState = getColumnState(colId);
                columnState.flex = flex ?? null;
                columnState.width = width;
            });
        }
        const columns = columnOrderState?.orderedColIds;
        const applyOrder = !!columns?.length;
        const columnStates = applyOrder ? columns.map((colId) => getColumnState(colId)) : Object.values(columnStateMap);

        if (columnStates.length) {
            this.columnStates = columnStates;
            const defaultState: ColumnStateParams = {
                sort: null,
                sortIndex: null,
                rowGroup: null,
                rowGroupIndex: null,
                aggFunc: null,
                pivot: null,
                pivotIndex: null,
                pinned: null,
                hide: null,
                flex: null,
            };
            this.columnApplyStateService.applyColumnState(
                {
                    state: columnStates,
                    applyOrder,
                    defaultState,
                },
                'gridInitializing'
            );
        }
    }

    private setColumnPivotState(applyOrder: boolean): void {
        const columnStates = this.columnStates;
        this.columnStates = undefined;
        const columnGroupStates = this.columnGroupStates;
        this.columnGroupStates = undefined;

        if (!this.pivotResultColsService.isPivotResultColsPresent()) {
            return;
        }

        if (columnStates) {
            const secondaryColumnStates: ColumnState[] = [];
            for (const columnState of columnStates) {
                if (this.pivotResultColsService.getPivotResultCol(columnState.colId)) {
                    secondaryColumnStates.push(columnState);
                }
            }

            this.columnApplyStateService.applyColumnState(
                {
                    state: secondaryColumnStates,
                    applyOrder,
                },
                'gridInitializing'
            );
        }

        if (columnGroupStates) {
            // no easy/performant way of knowing which column groups are pivot column groups
            this.columnGroupStateService.setColumnGroupState(columnGroupStates, 'gridInitializing');
        }
    }

    private getColumnGroupState(): ColumnGroupState | undefined {
        const columnGroupState = this.columnGroupStateService.getColumnGroupState();
        const openColumnGroups: string[] = [];
        columnGroupState.forEach(({ groupId, open }) => {
            if (open) {
                openColumnGroups.push(groupId);
            }
        });
        return openColumnGroups.length ? { openColumnGroupIds: openColumnGroups } : undefined;
    }

    private setColumnGroupState(initialState: GridState): void {
        if (!Object.prototype.hasOwnProperty.call(initialState, 'columnGroup')) {
            return;
        }

        const openColumnGroups = new Set(initialState.columnGroup?.openColumnGroupIds);
        const existingColumnGroupState = this.columnGroupStateService.getColumnGroupState();
        const stateItems = existingColumnGroupState.map(({ groupId }) => {
            const open = openColumnGroups.has(groupId);
            if (open) {
                openColumnGroups.delete(groupId);
            }
            return {
                groupId,
                open,
            };
        });
        // probably pivot cols
        openColumnGroups.forEach((groupId) => {
            stateItems.push({
                groupId,
                open: true,
            });
        });
        if (stateItems.length) {
            this.columnGroupStates = stateItems;
        }
        this.columnGroupStateService.setColumnGroupState(stateItems, 'gridInitializing');
    }

    private getFilterState(): FilterState | undefined {
        let filterModel: FilterModel | undefined = this.filterManager?.getFilterModel();
        if (filterModel && Object.keys(filterModel).length === 0) {
            filterModel = undefined;
        }
        const advancedFilterModel = this.filterManager?.getAdvancedFilterModel() ?? undefined;
        return filterModel || advancedFilterModel ? { filterModel, advancedFilterModel } : undefined;
    }

    private setFilterState(
        filterState?: FilterState,
        gridOptionAdvancedFilterModel?: AdvancedFilterModel | null
    ): void {
        const { filterModel, advancedFilterModel } = filterState ?? {
            advancedFilterModel: gridOptionAdvancedFilterModel,
        };
        if (filterModel) {
            this.filterManager?.setFilterModel(filterModel, 'columnFilter');
        }
        if (advancedFilterModel) {
            this.filterManager?.setAdvancedFilterModel(advancedFilterModel);
        }
    }

    private getRangeSelectionState(): RangeSelectionState | undefined {
        const cellRanges = this.rangeService?.getCellRanges().map((cellRange) => {
            const { id, type, startRow, endRow, columns, startColumn } = cellRange;
            return {
                id,
                type,
                startRow,
                endRow,
                colIds: columns.map((column) => column.getColId()),
                startColId: startColumn.getColId(),
            };
        });
        return cellRanges?.length ? { cellRanges } : undefined;
    }

    private setRangeSelectionState(rangeSelectionState: RangeSelectionState): void {
        if (!this.gos.get('enableRangeSelection') || !this.rangeService) {
            return;
        }
        const cellRanges: CellRange[] = [];
        rangeSelectionState.cellRanges.forEach((cellRange) => {
            const columns: AgColumn[] = [];
            cellRange.colIds.forEach((colId) => {
                const column = this.columnModel.getCol(colId);
                if (column) {
                    columns.push(column);
                }
            });
            if (!columns.length) {
                return;
            }
            let startColumn = this.columnModel.getCol(cellRange.startColId);
            if (!startColumn) {
                // find the first remaining column
                const allColumns = this.visibleColsService.getAllCols();
                const columnSet = new Set(columns);
                startColumn = allColumns.find((column) => columnSet.has(column))!;
            }
            cellRanges.push({
                ...cellRange,
                columns,
                startColumn,
            });
        });
        this.rangeService.setCellRanges(cellRanges);
    }

    private getScrollState(): ScrollState | undefined {
        if (!this.isClientSideRowModel) {
            // can't restore, so don't provide
            return undefined;
        }
        const scrollFeature = this.ctrlsService.getGridBodyCtrl()?.getScrollFeature();
        const { left } = scrollFeature?.getHScrollPosition() ?? { left: 0 };
        const { top } = scrollFeature?.getVScrollPosition() ?? { top: 0 };
        return top || left
            ? {
                  top,
                  left,
              }
            : undefined;
    }

    private setScrollState(scrollState: ScrollState): void {
        if (!this.isClientSideRowModel) {
            return;
        }
        const { top, left } = scrollState;
        this.ctrlsService.getGridBodyCtrl()?.getScrollFeature().setScrollPosition(top, left);
    }

    private getSideBarState(): SideBarState | undefined {
        return this.sideBarService?.getSideBarComp()?.getState();
    }

    private getFocusedCellState(): FocusedCellState | undefined {
        if (!this.isClientSideRowModel) {
            // can't restore, so don't provide
            return undefined;
        }
        const focusedCell = this.focusService.getFocusedCell();
        if (focusedCell) {
            const { column, rowIndex, rowPinned } = focusedCell;
            return {
                colId: column.getColId(),
                rowIndex,
                rowPinned,
            };
        }
        return undefined;
    }

    private setFocusedCellState(focusedCellState: FocusedCellState): void {
        if (!this.isClientSideRowModel) {
            return;
        }
        const { colId, rowIndex, rowPinned } = focusedCellState;
        this.focusService.setFocusedCell({
            column: this.columnModel.getCol(colId),
            rowIndex,
            rowPinned,
            forceBrowserFocus: true,
            preventScrollOnBrowserFocus: true,
        });
    }

    private getPaginationState(): PaginationState | undefined {
        if (!this.paginationService) {
            return undefined;
        }
        const page = this.paginationService.getCurrentPage();
        const pageSize = !this.gos.get('paginationAutoPageSize') ? this.paginationService.getPageSize() : undefined;

        if (!page && !pageSize) {
            return;
        }
        return { page, pageSize };
    }

    private setPaginationState(paginationState: PaginationState): void {
        if (!this.paginationService) {
            return;
        }
        if (paginationState.pageSize && !this.gos.get('paginationAutoPageSize')) {
            this.paginationService.setPageSize(paginationState.pageSize, 'initialState');
        }

        if (typeof paginationState.page === 'number') {
            this.paginationService.setPage(paginationState.page);
        }
    }

    private getRowSelectionState():
        | string[]
        | ServerSideRowSelectionState
        | ServerSideRowGroupSelectionState
        | undefined {
        const selectionState = this.selectionService.getSelectionState();
        const noSelections =
            !selectionState ||
            (!Array.isArray(selectionState) &&
                ((selectionState as ServerSideRowSelectionState).selectAll === false ||
                    (selectionState as ServerSideRowGroupSelectionState).selectAllChildren === false) &&
                !selectionState?.toggledNodes?.length);
        return noSelections ? undefined : selectionState;
    }

    private setRowSelectionState(
        rowSelectionState: string[] | ServerSideRowSelectionState | ServerSideRowGroupSelectionState
    ): void {
        this.selectionService.setSelectionState(rowSelectionState, 'gridInitializing');
    }

    private getRowGroupExpansionState(): RowGroupExpansionState | undefined {
        const expandedRowGroups = this.expansionService.getExpandedRows();
        return expandedRowGroups.length
            ? {
                  expandedRowGroupIds: expandedRowGroups,
              }
            : undefined;
    }

    private setRowGroupExpansionState(rowGroupExpansionState: RowGroupExpansionState): void {
        this.expansionService.expandRows(rowGroupExpansionState.expandedRowGroupIds);
    }

    private updateColumnState(features: (keyof GridState)[]): void {
        const newColumnState = this.getColumnState();
        let hasChanged = false;
        Object.entries(newColumnState).forEach(([key, value]: [keyof GridState, any]) => {
            if (!_jsonEquals(value, this.cachedState[key])) {
                hasChanged = true;
            }
        });
        this.cachedState = {
            ...this.cachedState,
            ...newColumnState,
        };
        if (hasChanged) {
            this.dispatchStateUpdateEvent(features);
        }
    }

    private updateCachedState<K extends keyof GridState>(key: K, value: GridState[K]): void {
        const existingValue = this.cachedState[key];
        this.setCachedStateValue(key, value);
        if (!_jsonEquals(value, existingValue)) {
            this.dispatchStateUpdateEvent([key]);
        }
    }

    private setCachedStateValue<K extends keyof GridState>(key: K, value: GridState[K]): void {
        this.cachedState = {
            ...this.cachedState,
            [key]: value,
        };
    }

    private refreshStaleState(): void {
        this.staleStateKeys.forEach((key) => {
            switch (key) {
                // only row selection supported for now
                case 'rowSelection':
                    this.setCachedStateValue(key, this.getRowSelectionState());
                    break;
            }
        });
        this.staleStateKeys.clear();
    }

    private dispatchStateUpdateEvent(sources: (keyof GridState | 'gridInitializing')[]): void {
        if (this.suppressEvents) {
            return;
        }
        sources.forEach((source) => this.queuedUpdateSources.add(source));
        this.dispatchStateUpdateEventDebounced();
    }

    private dispatchQueuedStateUpdateEvents(): void {
        const sources = Array.from(this.queuedUpdateSources);
        this.queuedUpdateSources.clear();
        const event: WithoutGridCommon<StateUpdatedEvent> = {
            type: Events.EVENT_STATE_UPDATED,
            sources,
            state: this.cachedState,
        };
        this.eventService.dispatchEvent(event);
    }

    private suppressEventsAndDispatchInitEvent(updateFunc: () => void): void {
        this.suppressEvents = true;
        this.columnAnimationService.setSuppressAnimation(true);
        updateFunc();
        // We want to suppress any grid events, but not user events.
        // Using a timeout here captures things like column resizing and emits a single grid initializing event.
        setTimeout(() => {
            this.suppressEvents = false;
            // We only want the grid initializing source.
            this.queuedUpdateSources.clear();
            if (!this.isAlive()) {
                // Ensure the grid is still alive before dispatching the event.
                return;
            }
            this.columnAnimationService.setSuppressAnimation(false);
            this.dispatchStateUpdateEvent(['gridInitializing']);
        });
    }
}
