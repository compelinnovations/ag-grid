import { Events } from '../eventKeys';
import type { AgFieldParams } from '../interfaces/agFieldParams';
import { _getAriaLabel, _setAriaLabel, _setAriaLabelledBy } from '../utils/aria';
import { _setFixedWidth } from '../utils/dom';
import { AgAbstractLabel } from './agAbstractLabel';
import type { ComponentClass } from './component';

export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export abstract class AgAbstractField<
    TValue,
    TConfig extends AgFieldParams = AgFieldParams,
> extends AgAbstractLabel<TConfig> {
    protected previousValue: TValue | null | undefined;
    protected value: TValue | null | undefined;

    constructor(
        config?: TConfig,
        template?: string,
        components?: ComponentClass[],
        protected readonly className?: string
    ) {
        super(config, template, components);
    }

    public override postConstruct(): void {
        super.postConstruct();

        const { width, value, onValueChange } = this.config;
        if (width != null) {
            this.setWidth(width);
        }
        if (value != null) {
            this.setValue(value);
        }
        if (onValueChange != null) {
            this.onValueChange(onValueChange);
        }

        if (this.className) {
            this.addCssClass(this.className);
        }

        this.refreshAriaLabelledBy();
    }

    protected refreshAriaLabelledBy() {
        const ariaEl = this.getAriaElement();
        const labelId = this.getLabelId();

        if (_getAriaLabel(ariaEl) !== null) {
            _setAriaLabelledBy(ariaEl, '');
        } else {
            _setAriaLabelledBy(ariaEl, labelId ?? '');
        }
    }

    public setAriaLabel(label?: string | null): this {
        _setAriaLabel(this.getAriaElement(), label);
        this.refreshAriaLabelledBy();

        return this;
    }

    public onValueChange(callbackFn: (newValue?: TValue | null) => void) {
        this.addManagedListener(this, Events.EVENT_FIELD_VALUE_CHANGED, () => callbackFn(this.getValue()));

        return this;
    }

    public getWidth(): number {
        return this.getGui().clientWidth;
    }

    public setWidth(width: number): this {
        _setFixedWidth(this.getGui(), width);

        return this;
    }

    public getPreviousValue(): TValue | null | undefined {
        return this.previousValue;
    }

    public getValue(): TValue | null | undefined {
        return this.value;
    }

    public setValue(value?: TValue | null, silent?: boolean): this {
        if (this.value === value) {
            return this;
        }

        this.previousValue = this.value;
        this.value = value;

        if (!silent) {
            this.dispatchEvent({ type: Events.EVENT_FIELD_VALUE_CHANGED });
        }

        return this;
    }
}
