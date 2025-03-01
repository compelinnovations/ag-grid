import { KeyCode } from '../../constants/keyCode';
import type { BeanCollection } from '../../context/context';
import type { AgColumn } from '../../entities/agColumn';
import type { ICellEditorComp, ICellEditorParams } from '../../interfaces/iCellEditor';
import { _missing } from '../../utils/generic';
import type { ValueService } from '../../valueService/valueService';
import type { ListOption } from '../../widgets/agList';
import { AgSelect } from '../../widgets/agSelect';
import { RefPlaceholder } from '../../widgets/component';
import { PopupComponent } from '../../widgets/popupComponent';
import type { ISelectCellEditorParams } from './iSelectCellEditor';

interface SelectCellEditorParams<TData = any, TValue = any, TContext = any>
    extends ISelectCellEditorParams<TValue>,
        ICellEditorParams<TData, TValue, TContext> {}

export class SelectCellEditor extends PopupComponent implements ICellEditorComp {
    private focusAfterAttached: boolean;

    private valueService: ValueService;

    public wireBeans(beans: BeanCollection): void {
        this.valueService = beans.valueService;
    }

    private readonly eSelect: AgSelect = RefPlaceholder;

    private startedByEnter: boolean = false;

    constructor() {
        super(
            /* html */
            `<div class="ag-cell-edit-wrapper">
                <ag-select class="ag-cell-editor" data-ref="eSelect"></ag-select>
            </div>`,
            [AgSelect]
        );
    }

    public init(params: SelectCellEditorParams): void {
        this.focusAfterAttached = params.cellStartedEdit;

        const { eSelect, valueService, gos } = this;
        const { values, value, eventKey } = params;

        if (_missing(values)) {
            console.warn('AG Grid: no values found for select cellEditor');
            return;
        }

        this.startedByEnter = eventKey != null ? eventKey === KeyCode.ENTER : false;

        let hasValue = false;
        values.forEach((currentValue: any) => {
            const option: ListOption = { value: currentValue };
            const valueFormatted = valueService.formatValue(params.column as AgColumn, null, currentValue);
            const valueFormattedExits = valueFormatted !== null && valueFormatted !== undefined;
            option.text = valueFormattedExits ? valueFormatted : currentValue;

            eSelect.addOption(option);
            hasValue = hasValue || value === currentValue;
        });

        if (hasValue) {
            eSelect.setValue(params.value, true);
        } else if (params.values.length) {
            eSelect.setValue(params.values[0], true);
        }

        const { valueListGap, valueListMaxWidth, valueListMaxHeight } = params;

        if (valueListGap != null) {
            eSelect.setPickerGap(valueListGap);
        }

        if (valueListMaxHeight != null) {
            eSelect.setPickerMaxHeight(valueListMaxHeight);
        }

        if (valueListMaxWidth != null) {
            eSelect.setPickerMaxWidth(valueListMaxWidth);
        }

        // we don't want to add this if full row editing, otherwise selecting will stop the
        // full row editing.
        if (gos.get('editType') !== 'fullRow') {
            this.addManagedListener(this.eSelect, AgSelect.EVENT_ITEM_SELECTED, () => params.stopEditing());
        }
    }

    public afterGuiAttached() {
        if (this.focusAfterAttached) {
            this.eSelect.getFocusableElement().focus();
        }

        if (this.startedByEnter) {
            setTimeout(() => {
                if (this.isAlive()) {
                    this.eSelect.showPicker();
                }
            });
        }
    }

    public focusIn(): void {
        this.eSelect.getFocusableElement().focus();
    }

    public getValue(): any {
        return this.eSelect.getValue();
    }

    public override isPopup() {
        return false;
    }
}
