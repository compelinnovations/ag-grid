import type {
    BeanCollection,
    ICellRenderer,
    ISparklineCellRendererParams,
    ResizeObserverService,
} from '@ag-grid-community/core';
import { Component, RefPlaceholder } from '@ag-grid-community/core';

import type { SparklineFactoryOptions } from './sparkline/agSparkline';
import { AgSparkline } from './sparkline/agSparkline';
import type { SparklineTooltipSingleton } from './tooltip/sparklineTooltipSingleton';

export class SparklineCellRenderer extends Component implements ICellRenderer {
    private resizeObserverService!: ResizeObserverService;
    private sparklineTooltipSingleton!: SparklineTooltipSingleton;

    public wireBeans(beans: BeanCollection) {
        this.resizeObserverService = beans.resizeObserverService;
        this.sparklineTooltipSingleton = beans.sparklineTooltipSingleton;
    }

    private static TEMPLATE /* html */ = `<div class="ag-sparkline-wrapper">
            <span data-ref="eSparkline"></span>
        </div>`;

    private readonly eSparkline: HTMLElement = RefPlaceholder;

    private sparkline?: any;

    constructor() {
        super(SparklineCellRenderer.TEMPLATE);
    }

    public init(params: ISparklineCellRendererParams): void {
        let firstTimeIn = true;
        const updateSparkline = () => {
            const { clientWidth, clientHeight } = this.getGui();
            if (clientWidth === 0 || clientHeight === 0) {
                return;
            }

            if (firstTimeIn) {
                const options: SparklineFactoryOptions = {
                    data: params.value,
                    width: clientWidth,
                    height: clientHeight,
                    context: {
                        data: params.data,
                    },
                    ...params.sparklineOptions,
                };

                // create new instance of sparkline
                this.sparkline = AgSparkline.create(options, this.sparklineTooltipSingleton.getSparklineTooltip());

                // append sparkline canvas to cell renderer element
                this.eSparkline!.appendChild(this.sparkline.canvasElement);

                firstTimeIn = false;
            } else {
                this.sparkline.width = clientWidth;
                this.sparkline.height = clientHeight;
            }
        };

        const unsubscribeFromResize = this.resizeObserverService.observeResize(this.getGui(), updateSparkline);
        this.addDestroyFunc(() => unsubscribeFromResize());
    }

    public refresh(params: ISparklineCellRendererParams): boolean {
        if (this.sparkline) {
            this.sparkline.data = params.value;
            return true;
        }
        return false;
    }

    public override destroy() {
        if (this.sparkline) {
            this.sparkline.destroy();
        }
        super.destroy();
    }
}
