import type { ColumnModel } from '../columns/columnModel';
import type { NamedBean } from '../context/bean';
import { BeanStub } from '../context/beanStub';
import type { BeanCollection } from '../context/context';
import type { CtrlsService } from '../ctrlsService';
import type { AgColumn } from '../entities/agColumn';
import type { CellPosition, CellPositionUtils } from '../entities/cellPositionUtils';
import type { RowPosition, RowPositionUtils } from '../entities/rowPositionUtils';
import { Events } from '../eventKeys';
import type { EventsType } from '../eventKeys';
import type {
    CellEditingStartedEvent,
    CellEditingStoppedEvent,
    CellValueChangedEvent,
    FillEndEvent,
    RedoEndedEvent,
    RedoStartedEvent,
    RowEditingStartedEvent,
    UndoEndedEvent,
    UndoStartedEvent,
} from '../events';
import type { FocusService } from '../focusService';
import type { GridBodyCtrl } from '../gridBodyComp/gridBodyCtrl';
import type { CellRange, CellRangeParams, IRangeService } from '../interfaces/IRangeService';
import type { WithoutGridCommon } from '../interfaces/iCommon';
import type { CellValueChange, LastFocusedCell } from './iUndoRedo';
import { RangeUndoRedoAction, UndoRedoAction, UndoRedoStack } from './undoRedoStack';

export class UndoRedoService extends BeanStub implements NamedBean {
    beanName = 'undoRedoService' as const;

    private focusService: FocusService;
    private ctrlsService: CtrlsService;
    private cellPositionUtils: CellPositionUtils;
    private rowPositionUtils: RowPositionUtils;
    private columnModel: ColumnModel;
    private rangeService?: IRangeService;

    public wireBeans(beans: BeanCollection): void {
        this.focusService = beans.focusService;
        this.ctrlsService = beans.ctrlsService;
        this.cellPositionUtils = beans.cellPositionUtils;
        this.rowPositionUtils = beans.rowPositionUtils;
        this.columnModel = beans.columnModel;
        this.rangeService = beans.rangeService;
    }

    private gridBodyCtrl: GridBodyCtrl;

    private cellValueChanges: CellValueChange[] = [];

    private undoStack: UndoRedoStack;
    private redoStack: UndoRedoStack;

    private activeCellEdit: CellPosition | null = null;
    private activeRowEdit: RowPosition | null = null;

    private isPasting = false;
    private isRangeInAction = false;

    public postConstruct(): void {
        if (!this.gos.get('undoRedoCellEditing')) {
            return;
        }

        const undoRedoLimit = this.gos.get('undoRedoCellEditingLimit');

        if (undoRedoLimit <= 0) {
            return;
        }

        this.undoStack = new UndoRedoStack(undoRedoLimit);
        this.redoStack = new UndoRedoStack(undoRedoLimit);

        this.addRowEditingListeners();
        this.addCellEditingListeners();
        this.addPasteListeners();
        this.addFillListeners();
        this.addCellKeyListeners();

        const listener = this.clearStacks.bind(this);
        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_CELL_VALUE_CHANGED]: this.onCellValueChanged.bind(this),
            // undo / redo is restricted to actual editing so we clear the stacks when other operations are
            // performed that change the order of the row / cols.
            [Events.EVENT_MODEL_UPDATED]: (e) => {
                if (!e.keepUndoRedoStack) {
                    this.clearStacks();
                }
            },
            [Events.EVENT_COLUMN_PIVOT_MODE_CHANGED]: listener,
            [Events.EVENT_NEW_COLUMNS_LOADED]: listener,
            [Events.EVENT_COLUMN_GROUP_OPENED]: listener,
            [Events.EVENT_COLUMN_ROW_GROUP_CHANGED]: listener,
            [Events.EVENT_COLUMN_MOVED]: listener,
            [Events.EVENT_COLUMN_PINNED]: listener,
            [Events.EVENT_COLUMN_VISIBLE]: listener,
            [Events.EVENT_ROW_DRAG_END]: listener,
        });

        this.ctrlsService.whenReady((p) => {
            this.gridBodyCtrl = p.gridBodyCtrl;
        });
    }

    private onCellValueChanged = (event: CellValueChangedEvent): void => {
        const eventCell: CellPosition = { column: event.column, rowIndex: event.rowIndex!, rowPinned: event.rowPinned };
        const isCellEditing =
            this.activeCellEdit !== null && this.cellPositionUtils.equals(this.activeCellEdit, eventCell);
        const isRowEditing =
            this.activeRowEdit !== null && this.rowPositionUtils.sameRow(this.activeRowEdit, eventCell);

        const shouldCaptureAction = isCellEditing || isRowEditing || this.isPasting || this.isRangeInAction;

        if (!shouldCaptureAction) {
            return;
        }

        const { rowPinned, rowIndex, column, oldValue, value } = event;

        const cellValueChange: CellValueChange = {
            rowPinned,
            rowIndex: rowIndex!,
            columnId: column.getColId(),
            newValue: value,
            oldValue,
        };

        this.cellValueChanges.push(cellValueChange);
    };

    private clearStacks = () => {
        this.undoStack.clear();
        this.redoStack.clear();
    };

    public getCurrentUndoStackSize(): number {
        return this.undoStack ? this.undoStack.getCurrentStackSize() : 0;
    }

    public getCurrentRedoStackSize(): number {
        return this.redoStack ? this.redoStack.getCurrentStackSize() : 0;
    }

    public undo(source: 'api' | 'ui'): void {
        const startEvent: WithoutGridCommon<UndoStartedEvent> = {
            type: Events.EVENT_UNDO_STARTED,
            source,
        };
        this.eventService.dispatchEvent(startEvent);

        const operationPerformed = this.undoRedo(this.undoStack, this.redoStack, 'initialRange', 'oldValue', 'undo');

        const endEvent: WithoutGridCommon<UndoEndedEvent> = {
            type: Events.EVENT_UNDO_ENDED,
            source,
            operationPerformed,
        };
        this.eventService.dispatchEvent(endEvent);
    }

    public redo(source: 'api' | 'ui'): void {
        const startEvent: WithoutGridCommon<RedoStartedEvent> = {
            type: Events.EVENT_REDO_STARTED,
            source,
        };
        this.eventService.dispatchEvent(startEvent);

        const operationPerformed = this.undoRedo(this.redoStack, this.undoStack, 'finalRange', 'newValue', 'redo');

        const endEvent: WithoutGridCommon<RedoEndedEvent> = {
            type: Events.EVENT_REDO_ENDED,
            source,
            operationPerformed,
        };
        this.eventService.dispatchEvent(endEvent);
    }

    private undoRedo(
        undoRedoStack: UndoRedoStack,
        opposingUndoRedoStack: UndoRedoStack,
        rangeProperty: 'initialRange' | 'finalRange',
        cellValueChangeProperty: 'oldValue' | 'newValue',
        source: 'undo' | 'redo'
    ): boolean {
        if (!undoRedoStack) {
            return false;
        }

        const undoRedoAction: UndoRedoAction | undefined = undoRedoStack.pop();

        if (!undoRedoAction || !undoRedoAction.cellValueChanges) {
            return false;
        }

        this.processAction(
            undoRedoAction,
            (cellValueChange: CellValueChange) => cellValueChange[cellValueChangeProperty],
            source
        );

        if (undoRedoAction instanceof RangeUndoRedoAction) {
            this.processRange(this.rangeService!, undoRedoAction.ranges || [undoRedoAction[rangeProperty]]);
        } else {
            this.processCell(undoRedoAction.cellValueChanges);
        }

        opposingUndoRedoStack.push(undoRedoAction);

        return true;
    }

    private processAction(
        action: UndoRedoAction,
        valueExtractor: (cellValueChange: CellValueChange) => any,
        source: string
    ) {
        action.cellValueChanges.forEach((cellValueChange) => {
            const { rowIndex, rowPinned, columnId } = cellValueChange;
            const rowPosition: RowPosition = { rowIndex, rowPinned };
            const currentRow = this.rowPositionUtils.getRowNode(rowPosition);

            // checks if the row has been filtered out
            if (!currentRow!.displayed) {
                return;
            }

            currentRow!.setDataValue(columnId, valueExtractor(cellValueChange), source);
        });
    }

    private processRange(rangeService: IRangeService, ranges: (CellRange | undefined)[]) {
        let lastFocusedCell: LastFocusedCell;

        rangeService.removeAllCellRanges(true);
        ranges.forEach((range, idx) => {
            if (!range) {
                return;
            }

            const startRow = range.startRow;
            const endRow = range.endRow;

            if (idx === ranges.length - 1) {
                lastFocusedCell = {
                    rowPinned: startRow!.rowPinned,
                    rowIndex: startRow!.rowIndex,
                    columnId: range.startColumn.getColId(),
                };

                this.setLastFocusedCell(lastFocusedCell);
            }

            const cellRangeParams: CellRangeParams = {
                rowStartIndex: startRow!.rowIndex,
                rowStartPinned: startRow!.rowPinned,
                rowEndIndex: endRow!.rowIndex,
                rowEndPinned: endRow!.rowPinned,
                columnStart: range.startColumn,
                columns: range.columns,
            };

            rangeService.addCellRange(cellRangeParams);
        });
    }

    private processCell(cellValueChanges: CellValueChange[]) {
        const cellValueChange = cellValueChanges[0];
        const { rowIndex, rowPinned } = cellValueChange;
        const rowPosition: RowPosition = { rowIndex, rowPinned };
        const row = this.rowPositionUtils.getRowNode(rowPosition);

        const lastFocusedCell: LastFocusedCell = {
            rowPinned: cellValueChange.rowPinned,
            rowIndex: row!.rowIndex!,
            columnId: cellValueChange.columnId,
        };

        // when single cells are being processed, they should be considered
        // as ranges when the rangeService is present (singleCellRanges).
        // otherwise focus will be restore but the range will not.
        this.setLastFocusedCell(lastFocusedCell, this.rangeService);
    }

    private setLastFocusedCell(lastFocusedCell: LastFocusedCell, rangeService?: IRangeService) {
        const { rowIndex, columnId, rowPinned } = lastFocusedCell;
        const scrollFeature = this.gridBodyCtrl.getScrollFeature();

        const column: AgColumn | null = this.columnModel.getCol(columnId);

        if (!column) {
            return;
        }

        scrollFeature.ensureIndexVisible(rowIndex);
        scrollFeature.ensureColumnVisible(column);

        const cellPosition: CellPosition = { rowIndex, column, rowPinned };
        this.focusService.setFocusedCell({ ...cellPosition, forceBrowserFocus: true });

        rangeService?.setRangeToCell(cellPosition);
    }

    private addRowEditingListeners(): void {
        this.addManagedListener(this.eventService, Events.EVENT_ROW_EDITING_STARTED, (e: RowEditingStartedEvent) => {
            this.activeRowEdit = { rowIndex: e.rowIndex!, rowPinned: e.rowPinned };
        });

        this.addManagedListener(this.eventService, Events.EVENT_ROW_EDITING_STOPPED, () => {
            const action = new UndoRedoAction(this.cellValueChanges);
            this.pushActionsToUndoStack(action);
            this.activeRowEdit = null;
        });
    }

    private addCellEditingListeners(): void {
        this.addManagedListener(this.eventService, Events.EVENT_CELL_EDITING_STARTED, (e: CellEditingStartedEvent) => {
            this.activeCellEdit = { column: e.column, rowIndex: e.rowIndex!, rowPinned: e.rowPinned };
        });

        this.addManagedListener(this.eventService, Events.EVENT_CELL_EDITING_STOPPED, (e: CellEditingStoppedEvent) => {
            this.activeCellEdit = null;

            const shouldPushAction = e.valueChanged && !this.activeRowEdit && !this.isPasting && !this.isRangeInAction;

            if (shouldPushAction) {
                const action = new UndoRedoAction(this.cellValueChanges);
                this.pushActionsToUndoStack(action);
            }
        });
    }

    private addPasteListeners(): void {
        this.addManagedListener(this.eventService, Events.EVENT_PASTE_START, () => {
            this.isPasting = true;
        });

        this.addManagedListener(this.eventService, Events.EVENT_PASTE_END, () => {
            const action = new UndoRedoAction(this.cellValueChanges);
            this.pushActionsToUndoStack(action);
            this.isPasting = false;
        });
    }

    private addFillListeners(): void {
        this.addManagedListener(this.eventService, Events.EVENT_FILL_START, () => {
            this.isRangeInAction = true;
        });

        this.addManagedListener(this.eventService, Events.EVENT_FILL_END, (event: FillEndEvent) => {
            const action = new RangeUndoRedoAction(this.cellValueChanges, event.initialRange, event.finalRange);
            this.pushActionsToUndoStack(action);
            this.isRangeInAction = false;
        });
    }

    private addCellKeyListeners(): void {
        this.addManagedListener(this.eventService, Events.EVENT_KEY_SHORTCUT_CHANGED_CELL_START, () => {
            this.isRangeInAction = true;
        });

        this.addManagedListener(this.eventService, Events.EVENT_KEY_SHORTCUT_CHANGED_CELL_END, () => {
            let action: UndoRedoAction;
            if (this.rangeService && this.gos.get('enableRangeSelection')) {
                action = new RangeUndoRedoAction(this.cellValueChanges, undefined, undefined, [
                    ...this.rangeService.getCellRanges(),
                ]);
            } else {
                action = new UndoRedoAction(this.cellValueChanges);
            }
            this.pushActionsToUndoStack(action);
            this.isRangeInAction = false;
        });
    }

    private pushActionsToUndoStack(action: UndoRedoAction) {
        this.undoStack.push(action);

        this.cellValueChanges = [];
        this.redoStack.clear();
    }
}
