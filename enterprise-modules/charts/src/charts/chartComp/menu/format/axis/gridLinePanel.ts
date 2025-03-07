import type { BeanCollection } from '@ag-grid-community/core';
import { Component } from '@ag-grid-community/core';
import type { AgGroupComponentParams } from '@ag-grid-enterprise/core';
import { AgGroupComponent } from '@ag-grid-enterprise/core';
import type { AgAxisGridLineOptions } from 'ag-charts-community';

import type { AgColorPickerParams } from '../../../../../widgets/agColorPicker';
import { AgColorPicker } from '../../../../../widgets/agColorPicker';
import type { AgSliderParams } from '../../../../../widgets/agSlider';
import { AgSlider } from '../../../../../widgets/agSlider';
import type { ChartOptionsProxy } from '../../../services/chartOptionsService';
import type { ChartTranslationKey, ChartTranslationService } from '../../../services/chartTranslationService';
import type { ChartMenuParamsFactory } from '../../chartMenuParamsFactory';

export class GridLinePanel extends Component {
    public static TEMPLATE = /* html */ `<div>
            <ag-group-component data-ref="gridLineGroup">
                <ag-color-picker data-ref="gridLineColorPicker"></ag-color-picker>
                <ag-slider data-ref="gridLineWidthSlider"></ag-slider>
                <ag-slider data-ref="gridLineLineDashSlider"></ag-slider>
            </ag-group-component>
        </div>`;

    private chartTranslationService: ChartTranslationService;

    public wireBeans(beans: BeanCollection): void {
        this.chartTranslationService = beans.chartTranslationService;
    }
    private readonly chartOptions: ChartOptionsProxy;

    constructor(private readonly chartMenuUtils: ChartMenuParamsFactory) {
        super();
        this.chartOptions = chartMenuUtils.getChartOptions();
    }

    public postConstruct() {
        const gridLineGroupParams = this.chartMenuUtils.addEnableParams<AgGroupComponentParams>('gridLine.enabled', {
            cssIdentifier: 'charts-format-sub-level',
            direction: 'vertical',
            suppressOpenCloseIcons: true,
            title: this.chartTranslationService.translate('gridLines'),
            suppressEnabledCheckbox: true,
            useToggle: true,
        });
        const gridLineColorPickerParams = this.getGridLineColorPickerParams('color');
        const gridLineWidthSliderParams = this.getGridLineWidthSliderParams('thickness');
        const gridLineLineDashSliderParams = this.getGridLineDashSliderParams('lineDash');
        this.setTemplate(GridLinePanel.TEMPLATE, [AgGroupComponent, AgColorPicker, AgSlider], {
            gridLineGroup: gridLineGroupParams,
            gridLineColorPicker: gridLineColorPickerParams,
            gridLineWidthSlider: gridLineWidthSliderParams,
            gridLineLineDashSlider: gridLineLineDashSliderParams,
        });
    }

    private getGridLineColorPickerParams(labelKey: ChartTranslationKey): AgColorPickerParams {
        return this.chartMenuUtils.getDefaultColorPickerParams('gridLine.style', labelKey, {
            formatInputValue: (value: AgAxisGridLineOptions['style']) => {
                return value?.[0]?.stroke;
            },
            parseInputValue: (value: string) => {
                const styles = this.chartOptions.getValue<AgAxisGridLineOptions['style']>('gridLine.style') ?? [];
                if (styles.length === 0) return [{ stroke: value, lineDash: [] }];
                return [{ ...styles[0], stroke: value }];
            },
        });
    }

    private getGridLineWidthSliderParams(labelKey: ChartTranslationKey) {
        return this.chartMenuUtils.getDefaultSliderParams('gridLine.width', labelKey, 10);
    }

    private getGridLineDashSliderParams(labelKey: ChartTranslationKey): AgSliderParams {
        const initialStyles = this.chartOptions.getValue<AgAxisGridLineOptions['style']>('gridLine.style');
        const initialValue = initialStyles?.[0]?.lineDash?.[0];
        const params = this.chartMenuUtils.getDefaultSliderParamsWithoutValueParams(initialValue ?? 0, labelKey, 30);
        params.onValueChange = (value: number): void => {
            const stroke = this.chartOptions.getValue('gridLine.style.0.stroke');
            this.chartOptions.setValue<AgAxisGridLineOptions['style']>('gridLine.style', [
                { lineDash: [value], stroke },
            ]);
        };
        return params;
    }
}
