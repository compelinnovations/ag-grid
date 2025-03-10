import type { BeanCollection } from '@ag-grid-community/core';
import { Component, RefPlaceholder } from '@ag-grid-community/core';
import type { AgGroupComponentParams } from '@ag-grid-enterprise/core';
import { AgGroupComponent } from '@ag-grid-enterprise/core';

import type { ChartTranslationService } from '../../../services/chartTranslationService';
import type { FormatPanelOptions } from '../formatPanel';
import { BackgroundPanel } from './backgroundPanel';
import { PaddingPanel } from './paddingPanel';

export class ChartPanel extends Component {
    private static TEMPLATE /* html */ = `<div>
            <ag-group-component data-ref="chartGroup"></ag-group-component>
        </div>`;

    private chartTranslationService: ChartTranslationService;

    public wireBeans(beans: BeanCollection): void {
        this.chartTranslationService = beans.chartTranslationService;
    }
    private readonly chartGroup: AgGroupComponent = RefPlaceholder;

    constructor(private readonly options: FormatPanelOptions) {
        super();
    }

    public postConstruct() {
        const {
            chartController,
            chartMenuParamsFactory,
            isExpandedOnInit: expanded,
            registerGroupComponent,
        } = this.options;

        const chartGroupParams: AgGroupComponentParams = {
            cssIdentifier: 'charts-format-top-level',
            direction: 'vertical',
            title: this.chartTranslationService.translate('chartStyle'),
            expanded,
            suppressEnabledCheckbox: true,
            items: [
                this.createManagedBean(new PaddingPanel(chartMenuParamsFactory, chartController)),
                this.createManagedBean(new BackgroundPanel(chartMenuParamsFactory)),
            ],
        };
        this.setTemplate(ChartPanel.TEMPLATE, [AgGroupComponent], { chartGroup: chartGroupParams });
        registerGroupComponent(this.chartGroup);
    }
}
