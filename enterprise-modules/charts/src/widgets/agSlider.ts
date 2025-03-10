import type { AgComponentSelector, AgLabelParams, LabelAlignment } from '@ag-grid-community/core';
import { AgAbstractLabel, AgInputNumberField, Events, RefPlaceholder } from '@ag-grid-community/core';

import { AgInputRange } from './agInputRange';

export interface AgSliderParams extends AgLabelParams {
    minValue?: number;
    maxValue?: number;
    textFieldWidth?: number;
    step?: number;
    value?: string;
    onValueChange?: (newValue: number) => void;
}

export class AgSlider extends AgAbstractLabel<AgSliderParams> {
    static readonly selector: AgComponentSelector = 'AG-SLIDER';

    private static TEMPLATE /* html */ = `<div class="ag-slider">
            <label data-ref="eLabel"></label>
            <div class="ag-wrapper ag-slider-wrapper">
                <ag-input-range data-ref="eSlider"></ag-input-range>
                <ag-input-number-field data-ref="eText"></ag-input-number-field>
            </div>
        </div>`;

    protected readonly eLabel: HTMLElement = RefPlaceholder;
    private readonly eSlider: AgInputRange = RefPlaceholder;
    private readonly eText: AgInputNumberField = RefPlaceholder;

    protected override labelAlignment: LabelAlignment = 'top';

    constructor(config?: AgSliderParams) {
        super(config, AgSlider.TEMPLATE, [AgInputRange, AgInputNumberField]);
    }

    public override postConstruct() {
        super.postConstruct();
        this.eSlider.addCssClass('ag-slider-field');
        const { minValue, maxValue, textFieldWidth, step, value, onValueChange } = this.config;
        if (minValue != null) {
            this.setMinValue(minValue);
        }
        if (maxValue != null) {
            this.setMaxValue(maxValue);
        }
        if (textFieldWidth != null) {
            this.setTextFieldWidth(textFieldWidth);
        }
        if (step != null) {
            this.setStep(step);
        }
        if (value != null) {
            this.setValue(value);
        }
        if (onValueChange != null) {
            this.onValueChange(onValueChange);
        }
    }

    public onValueChange(callbackFn: (newValue: number) => void) {
        const eventChanged = Events.EVENT_FIELD_VALUE_CHANGED;
        this.addManagedListener(this.eText, eventChanged, () => {
            const textValue = parseFloat(this.eText.getValue()!);
            this.eSlider.setValue(textValue.toString(), true);
            callbackFn(textValue || 0);
        });

        this.addManagedListener(this.eSlider, eventChanged, () => {
            const sliderValue = this.eSlider.getValue()!;
            this.eText.setValue(sliderValue, true);
            callbackFn(parseFloat(sliderValue));
        });

        return this;
    }

    public setSliderWidth(width: number): this {
        this.eSlider.setWidth(width);
        return this;
    }

    public setTextFieldWidth(width: number): this {
        this.eText.setWidth(width);
        return this;
    }

    public setMinValue(minValue: number): this {
        this.eSlider.setMinValue(minValue);
        this.eText.setMin(minValue);

        return this;
    }

    public setMaxValue(maxValue: number): this {
        this.eSlider.setMaxValue(maxValue);
        this.eText.setMax(maxValue);
        return this;
    }

    public getValue(): string | null | undefined {
        return this.eText.getValue();
    }

    public setValue(value: string, silent?: boolean): this {
        if (this.getValue() === value) {
            return this;
        }

        this.eText.setValue(value, true);
        this.eSlider.setValue(value, true);

        if (!silent) {
            this.dispatchEvent({ type: Events.EVENT_FIELD_VALUE_CHANGED });
        }

        return this;
    }

    public setStep(step: number): this {
        this.eSlider.setStep(step);
        this.eText.setStep(step);
        return this;
    }
}
