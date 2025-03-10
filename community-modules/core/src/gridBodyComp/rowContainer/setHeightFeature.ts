import { BeanStub } from '../../context/beanStub';
import type { BeanCollection } from '../../context/context';
import { Events } from '../../eventKeys';
import type { RowContainerHeightService } from '../../rendering/rowContainerHeightService';

export class SetHeightFeature extends BeanStub {
    private maxDivHeightScaler: RowContainerHeightService;

    public wireBeans(beans: BeanCollection) {
        this.maxDivHeightScaler = beans.rowContainerHeightService;
    }

    private eContainer: HTMLElement;
    private eViewport: HTMLElement | undefined;

    constructor(eContainer: HTMLElement, eViewport?: HTMLElement) {
        super();
        this.eContainer = eContainer;
        this.eViewport = eViewport;
    }

    public postConstruct(): void {
        this.addManagedListener(
            this.eventService,
            Events.EVENT_ROW_CONTAINER_HEIGHT_CHANGED,
            this.onHeightChanged.bind(this)
        );
    }

    private onHeightChanged(): void {
        const height = this.maxDivHeightScaler.getUiContainerHeight();
        const heightString = height != null ? `${height}px` : ``;

        this.eContainer.style.height = heightString;
        if (this.eViewport) {
            this.eViewport.style.height = heightString;
        }
    }
}
