import type { AgComponentSelector, AgPickerFieldParams } from '@ag-grid-community/core';
import { AgPickerField } from '@ag-grid-community/core';
import { AgDialog } from '@ag-grid-enterprise/core';
import { _Util } from 'ag-charts-community';

import { AgColorPanel } from './agColorPanel';

export interface AgColorPickerParams
    extends Omit<AgPickerFieldParams, 'pickerType' | 'pickerAriaLabelKey' | 'pickerAriaLabelValue'> {
    pickerType?: string;
    pickerAriaLabelKey?: string;
    pickerAriaLabelValue?: string;
}

export class AgColorPicker extends AgPickerField<string, AgColorPickerParams & AgPickerFieldParams, AgDialog> {
    static readonly selector: AgComponentSelector = 'AG-COLOR-PICKER';

    private isDestroyingPicker: boolean;
    private eDisplayFieldColor: HTMLElement;
    private eDisplayFieldText: HTMLElement;

    constructor(config?: AgColorPickerParams) {
        super({
            pickerAriaLabelKey: 'ariaLabelColorPicker',
            pickerAriaLabelValue: 'Color Picker',
            pickerType: 'ag-list',
            className: 'ag-color-picker',
            pickerIcon: 'smallDown',
            ...config,
        });
    }

    public override postConstruct() {
        const eDocument = this.gos.getDocument();
        this.eDisplayFieldColor = eDocument.createElement('span');
        this.eDisplayFieldColor.classList.add('ag-color-picker-color');
        this.eDisplayFieldText = eDocument.createElement('span');
        this.eDisplayFieldText.classList.add('ag-color-picker-value');
        this.eDisplayField.appendChild(this.eDisplayFieldColor);
        this.eDisplayField.appendChild(this.eDisplayFieldText);

        super.postConstruct();

        if (this.value) {
            this.setValue(this.value);
        }
    }

    protected createPickerComponent() {
        const eGuiRect = this.eWrapper.getBoundingClientRect();

        const colorDialog = this.createBean(
            new AgDialog({
                closable: false,
                modal: true,
                hideTitleBar: true,
                minWidth: 190,
                width: 190,
                height: 250,
                x: eGuiRect.right - 190,
                y: eGuiRect.top - 250 - (this.config.pickerGap ?? 0),
            })
        );

        return colorDialog;
    }

    protected override renderAndPositionPicker(): () => void {
        const pickerComponent = this.pickerComponent!;
        const colorPanel = this.createBean(new AgColorPanel({ picker: this }));

        pickerComponent.addCssClass('ag-color-dialog');

        colorPanel.addDestroyFunc(() => {
            if (pickerComponent.isAlive()) {
                this.destroyBean(pickerComponent);
            }
        });

        pickerComponent.setParentComponent(this);
        pickerComponent.setBodyComponent(colorPanel);
        colorPanel.setValue(this.getValue());
        colorPanel.getGui().focus();

        pickerComponent.addDestroyFunc(() => {
            // here we check if the picker was already being
            // destroyed to avoid a stack overflow
            if (!this.isDestroyingPicker) {
                this.beforeHidePicker();
                this.isDestroyingPicker = true;

                if (colorPanel.isAlive()) {
                    this.destroyBean(colorPanel);
                }

                if (this.isAlive()) {
                    this.getFocusableElement().focus();
                }
            } else {
                this.isDestroyingPicker = false;
            }
        });

        return () => this.pickerComponent?.close();
    }

    public override setValue(color: string): this {
        if (this.value === color) {
            return this;
        }

        this.eDisplayFieldColor.style.backgroundColor = color;
        this.eDisplayFieldText.textContent = _Util.Color.fromString(color).toHexString().toUpperCase();

        return super.setValue(color);
    }

    public override getValue(): string {
        return this.value;
    }
}
