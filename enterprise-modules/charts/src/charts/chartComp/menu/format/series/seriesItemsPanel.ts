import type { AgSelectParams, BeanCollection, ListOption } from '@ag-grid-community/core';
import { AgSelect, Component, RefPlaceholder, _removeFromParent } from '@ag-grid-community/core';
import type { AgGroupComponentParams } from '@ag-grid-enterprise/core';
import { AgGroupComponent } from '@ag-grid-enterprise/core';

import { AgSlider } from '../../../../../widgets/agSlider';
import type { ChartTranslationKey, ChartTranslationService } from '../../../services/chartTranslationService';
import type { ChartMenuParamsFactory } from '../../chartMenuParamsFactory';
import { FontPanel } from '../fontPanel';

type SeriesItemType = 'positive' | 'negative';

export class SeriesItemsPanel extends Component {
    public static TEMPLATE /* html */ = `<div>
            <ag-group-component data-ref="seriesItemsGroup">
                <ag-select data-ref="seriesItemSelect"></ag-select>
            </ag-group-component>
        </div>`;

    private readonly seriesItemsGroup: AgGroupComponent = RefPlaceholder;

    private chartTranslationService: ChartTranslationService;

    public wireBeans(beans: BeanCollection): void {
        this.chartTranslationService = beans.chartTranslationService;
    }
    private activePanels: Component[] = [];

    constructor(private readonly chartMenuUtils: ChartMenuParamsFactory) {
        super();
    }

    public postConstruct() {
        const seriesItemsGroupParams: AgGroupComponentParams = {
            cssIdentifier: 'charts-format-sub-level',
            direction: 'vertical',
            title: this.chartTranslationService.translate('seriesItems'),
            enabled: true,
            suppressOpenCloseIcons: true,
            suppressEnabledCheckbox: true,
        };
        this.setTemplate(SeriesItemsPanel.TEMPLATE, [AgGroupComponent, AgSelect], {
            seriesItemsGroup: seriesItemsGroupParams,
            seriesItemSelect: this.getSeriesItemsParams(),
        });

        this.initSeriesControls();
    }

    private getSeriesItemsParams(): AgSelectParams {
        const options: ListOption<SeriesItemType>[] = [
            { value: 'positive', text: this.chartTranslationService.translate('seriesItemPositive') },
            { value: 'negative', text: this.chartTranslationService.translate('seriesItemNegative') },
        ];

        const seriesItemChangedCallback = (newValue: SeriesItemType) => {
            this.destroyActivePanels();
            this.initSeriesControls(newValue as SeriesItemType);
        };

        return this.chartMenuUtils.getDefaultSelectParamsWithoutValueParams(
            'seriesItemType',
            options,
            'positive',
            seriesItemChangedCallback
        );
    }

    private initSeriesControls(itemType: SeriesItemType = 'positive') {
        this.initSlider('strokeWidth', 10, `item.${itemType}.strokeWidth`);
        this.initSlider('lineDash', 30, `item.${itemType}.lineDash`, 1, true);
        this.initSlider('strokeOpacity', 1, `item.${itemType}.strokeOpacity`, 0.05, false);
        this.initSlider('fillOpacity', 1, `item.${itemType}.fillOpacity`, 0.05, false);
        this.initItemLabels(itemType);
    }

    private initSlider(
        labelKey: ChartTranslationKey,
        maxValue: number,
        seriesOptionKey: string,
        step: number = 1,
        isArray: boolean = false
    ) {
        const params = this.chartMenuUtils.getDefaultSliderParams(seriesOptionKey, labelKey, maxValue, isArray);
        params.step = step;

        const itemSlider = this.seriesItemsGroup.createManagedBean(new AgSlider(params));

        this.seriesItemsGroup.addItem(itemSlider);
        this.activePanels.push(itemSlider);
    }

    private initItemLabels(itemType: 'positive' | 'negative') {
        const sectorParams = this.chartMenuUtils.getDefaultFontPanelParams(
            `item.${itemType}.label`,
            'seriesItemLabels'
        );

        const labelPanelComp = this.createBean(new FontPanel(sectorParams));
        this.seriesItemsGroup.addItem(labelPanelComp);
        this.activePanels.push(labelPanelComp);
    }

    private destroyActivePanels(): void {
        this.activePanels.forEach((panel) => {
            _removeFromParent(panel.getGui());
            this.destroyBean(panel);
        });
    }

    public override destroy(): void {
        this.destroyActivePanels();
        super.destroy();
    }
}
