import type { UserComponentFactory } from '../components/framework/userComponentFactory';
import { KeyCode } from '../constants/keyCode';
import type { NamedBean } from '../context/bean';
import { BeanStub } from '../context/beanStub';
import type { CoreBeanCollection } from '../context/context';
import type { AgColumn } from '../entities/agColumn';
import type { CellPosition } from '../entities/cellPositionUtils';
import type { RowNode } from '../entities/rowNode';
import type { CellEditingStartedEvent, CellEditingStoppedEvent } from '../events';
import { Events } from '../events';
import type { NavigationService } from '../gridBodyComp/navigationService';
import type { ICellEditorParams } from '../interfaces/iCellEditor';
import type { CellCtrl, ICellComp } from '../rendering/cell/cellCtrl';
import type { ValueService } from '../valueService/valueService';
import { PopupEditorWrapper } from './cellEditors/popupEditorWrapper';

export class EditService extends BeanStub implements NamedBean {
    beanName = 'editService' as const;

    private navigationService: NavigationService;
    private userComponentFactory: UserComponentFactory;
    private valueService: ValueService;

    public wireBeans(beans: CoreBeanCollection): void {
        this.navigationService = beans.navigationService;
        this.userComponentFactory = beans.userComponentFactory;
        this.valueService = beans.valueService;
    }

    public startEditing(
        cellCtrl: CellCtrl,
        key: string | null = null,
        cellStartedEdit = false,
        event: KeyboardEvent | MouseEvent | null = null
    ): void {
        const editorParams = this.createCellEditorParams(cellCtrl, key, cellStartedEdit);
        const colDef = cellCtrl.getColumn().getColDef();
        const compDetails = this.userComponentFactory.getCellEditorDetails(colDef, editorParams);

        // if cellEditorSelector was used, we give preference to popup and popupPosition from the selector
        const popup = compDetails?.popupFromSelector != null ? compDetails.popupFromSelector : !!colDef.cellEditorPopup;
        const position: 'over' | 'under' | undefined =
            compDetails?.popupPositionFromSelector != null
                ? compDetails.popupPositionFromSelector
                : colDef.cellEditorPopupPosition;

        cellCtrl.setEditing(true, compDetails);
        cellCtrl.getComp().setEditDetails(compDetails, popup, position, this.gos.get('reactiveCustomComponents'));

        const e: CellEditingStartedEvent = cellCtrl.createEvent(event, Events.EVENT_CELL_EDITING_STARTED);
        this.eventService.dispatchEvent(e);
    }

    public stopEditing(cellCtrl: CellCtrl, cancel: boolean): boolean {
        const cellComp = cellCtrl.getComp();
        const { newValue, newValueExists } = this.takeValueFromCellEditor(cancel, cellComp);
        const rowNode = cellCtrl.getRowNode();
        const column = cellCtrl.getColumn();
        const oldValue = rowNode.getValueFromValueService(column);
        let valueChanged = false;

        if (newValueExists) {
            valueChanged = this.saveNewValue(cellCtrl, oldValue, newValue, rowNode, column);
        }

        cellCtrl.setEditing(false, undefined);
        cellComp.setEditDetails(); // passing nothing stops editing

        cellCtrl.updateAndFormatValue(false);
        cellCtrl.refreshCell({ forceRefresh: true, suppressFlash: true });

        const event: CellEditingStoppedEvent = {
            ...cellCtrl.createEvent(null, Events.EVENT_CELL_EDITING_STOPPED),
            oldValue,
            newValue,
            valueChanged,
        };
        this.eventService.dispatchEvent(event);

        return valueChanged;
    }

    public handleColDefChanged(cellCtrl: CellCtrl): void {
        const cellEditor = cellCtrl.getCellEditor();
        if (cellEditor?.refresh) {
            const { eventKey, cellStartedEdit } = cellCtrl.getEditCompDetails()!.params;
            const editorParams = this.createCellEditorParams(cellCtrl, eventKey, cellStartedEdit);
            const colDef = cellCtrl.getColumn().getColDef();
            const compDetails = this.userComponentFactory.getCellEditorDetails(colDef, editorParams);
            cellEditor.refresh(compDetails!.params);
        }
    }

    public setFocusOutOnEditor(cellCtrl: CellCtrl): void {
        const cellEditor = cellCtrl.getComp().getCellEditor();

        if (cellEditor && cellEditor.focusOut) {
            cellEditor.focusOut();
        }
    }

    public setFocusInOnEditor(cellCtrl: CellCtrl): void {
        const cellEditor = cellCtrl.getComp().getCellEditor();

        if (cellEditor && cellEditor.focusIn) {
            // if the editor is present, then we just focus it
            cellEditor.focusIn();
        } else {
            // if the editor is not present, it means async cell editor (eg React fibre)
            // and we are trying to set focus before the cell editor is present, so we
            // focus the cell instead
            cellCtrl.focusCell(true);
        }
    }

    public stopEditingAndFocus(cellCtrl: CellCtrl, suppressNavigateAfterEdit = false, shiftKey: boolean = false): void {
        cellCtrl.stopRowOrCellEdit();
        cellCtrl.focusCell(true);

        if (!suppressNavigateAfterEdit) {
            this.navigateAfterEdit(shiftKey, cellCtrl.getCellPosition());
        }
    }

    public createPopupEditorWrapper(params: ICellEditorParams): PopupEditorWrapper {
        return new PopupEditorWrapper(params);
    }

    private takeValueFromCellEditor(cancel: boolean, cellComp: ICellComp): { newValue?: any; newValueExists: boolean } {
        const noValueResult = { newValueExists: false };

        if (cancel) {
            return noValueResult;
        }

        const cellEditor = cellComp.getCellEditor();

        if (!cellEditor) {
            return noValueResult;
        }

        const userWantsToCancel = cellEditor.isCancelAfterEnd && cellEditor.isCancelAfterEnd();

        if (userWantsToCancel) {
            return noValueResult;
        }

        const newValue = cellEditor.getValue();

        return {
            newValue: newValue,
            newValueExists: true,
        };
    }

    /**
     * @returns `True` if the value changes, otherwise `False`.
     */
    private saveNewValue(
        cellCtrl: CellCtrl,
        oldValue: any,
        newValue: any,
        rowNode: RowNode,
        column: AgColumn
    ): boolean {
        if (newValue === oldValue) {
            return false;
        }

        // we suppressRefreshCell because the call to rowNode.setDataValue() results in change detection
        // getting triggered, which results in all cells getting refreshed. we do not want this refresh
        // to happen on this call as we want to call it explicitly below. otherwise refresh gets called twice.
        // if we only did this refresh (and not the one below) then the cell would flash and not be forced.
        cellCtrl.setSuppressRefreshCell(true);
        const valueChanged = rowNode.setDataValue(column, newValue, 'edit');
        cellCtrl.setSuppressRefreshCell(false);

        return valueChanged;
    }

    private createCellEditorParams(
        cellCtrl: CellCtrl,
        key: string | null,
        cellStartedEdit: boolean
    ): ICellEditorParams {
        const column = cellCtrl.getColumn();
        const rowNode = cellCtrl.getRowNode();
        return this.gos.addGridCommonParams({
            value: rowNode.getValueFromValueService(column),
            eventKey: key,
            column: column,
            colDef: column.getColDef(),
            rowIndex: cellCtrl.getCellPosition().rowIndex,
            node: rowNode,
            data: rowNode.data,
            cellStartedEdit: cellStartedEdit,
            onKeyDown: cellCtrl.onKeyDown.bind(cellCtrl),
            stopEditing: cellCtrl.stopEditingAndFocus.bind(cellCtrl),
            eGridCell: cellCtrl.getGui(),
            parseValue: (newValue: any) => this.valueService.parseValue(column, rowNode, newValue, cellCtrl.getValue()),
            formatValue: cellCtrl.formatValue.bind(cellCtrl),
        });
    }

    private navigateAfterEdit(shiftKey: boolean, cellPosition: CellPosition): void {
        const enterNavigatesVerticallyAfterEdit = this.gos.get('enterNavigatesVerticallyAfterEdit');

        if (enterNavigatesVerticallyAfterEdit) {
            const key = shiftKey ? KeyCode.UP : KeyCode.DOWN;
            this.navigationService.navigateToNextCell(null, key, cellPosition, false);
        }
    }
}
