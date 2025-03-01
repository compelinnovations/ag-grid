import type { VisibleColsService } from '../columns/visibleColsService';
import type { BeanCollection } from '../context/context';
import type { CtrlsService } from '../ctrlsService';
import type { EventsType } from '../eventKeys';
import { Events } from '../eventKeys';
import type { PinnedRowModel } from '../pinnedRowModel/pinnedRowModel';
import { _getScrollLeft, _isVisible, _setFixedHeight, _setFixedWidth, _setScrollLeft } from '../utils/dom';
import type { AgComponentSelector } from '../widgets/component';
import { RefPlaceholder } from '../widgets/component';
import { AbstractFakeScrollComp } from './abstractFakeScrollComp';
import { CenterWidthFeature } from './centerWidthFeature';
import type { ScrollVisibleService } from './scrollVisibleService';

export class FakeHScrollComp extends AbstractFakeScrollComp {
    static readonly selector: AgComponentSelector = 'AG-FAKE-HORIZONTAL-SCROLL';

    private static TEMPLATE /* html */ = `<div class="ag-body-horizontal-scroll" aria-hidden="true">
            <div class="ag-horizontal-left-spacer" data-ref="eLeftSpacer"></div>
            <div class="ag-body-horizontal-scroll-viewport" data-ref="eViewport">
                <div class="ag-body-horizontal-scroll-container" data-ref="eContainer"></div>
            </div>
            <div class="ag-horizontal-right-spacer" data-ref="eRightSpacer"></div>
        </div>`;

    private visibleColsService: VisibleColsService;
    private pinnedRowModel: PinnedRowModel;
    private ctrlsService: CtrlsService;
    private scrollVisibleService: ScrollVisibleService;

    public override wireBeans(beans: BeanCollection): void {
        super.wireBeans(beans);
        this.visibleColsService = beans.visibleColsService;
        this.pinnedRowModel = beans.pinnedRowModel;
        this.ctrlsService = beans.ctrlsService;
        this.scrollVisibleService = beans.scrollVisibleService;
    }

    private readonly eLeftSpacer: HTMLElement = RefPlaceholder;
    private readonly eRightSpacer: HTMLElement = RefPlaceholder;

    private enableRtl: boolean;

    constructor() {
        super(FakeHScrollComp.TEMPLATE, 'horizontal');
    }

    public override postConstruct(): void {
        super.postConstruct();

        // When doing printing, this changes whether cols are pinned or not
        const spacerWidthsListener = this.setFakeHScrollSpacerWidths.bind(this);

        this.addManagedListeners<EventsType>(this.eventService, {
            [Events.EVENT_DISPLAYED_COLUMNS_CHANGED]: spacerWidthsListener,
            [Events.EVENT_DISPLAYED_COLUMNS_WIDTH_CHANGED]: spacerWidthsListener,
            [Events.EVENT_PINNED_ROW_DATA_CHANGED]: this.onPinnedRowDataChanged.bind(this),
        });

        this.addManagedPropertyListener('domLayout', spacerWidthsListener);

        this.ctrlsService.register('fakeHScrollComp', this);
        this.createManagedBean(new CenterWidthFeature((width) => (this.eContainer.style.width = `${width}px`)));

        this.addManagedPropertyListeners(['suppressHorizontalScroll'], this.onScrollVisibilityChanged.bind(this));
    }

    protected override initialiseInvisibleScrollbar(): void {
        if (this.invisibleScrollbar !== undefined) {
            return;
        }

        this.enableRtl = this.gos.get('enableRtl');
        super.initialiseInvisibleScrollbar();

        if (this.invisibleScrollbar) {
            this.refreshCompBottom();
        }
    }

    private onPinnedRowDataChanged(): void {
        this.refreshCompBottom();
    }

    private refreshCompBottom(): void {
        if (!this.invisibleScrollbar) {
            return;
        }
        const bottomPinnedHeight = this.pinnedRowModel.getPinnedBottomTotalHeight();

        this.getGui().style.bottom = `${bottomPinnedHeight}px`;
    }

    protected override onScrollVisibilityChanged(): void {
        super.onScrollVisibilityChanged();
        this.setFakeHScrollSpacerWidths();
    }

    private setFakeHScrollSpacerWidths(): void {
        const vScrollShowing = this.scrollVisibleService.isVerticalScrollShowing();

        // we pad the right based on a) if cols are pinned to the right and
        // b) if v scroll is showing on the right (normal position of scroll)
        let rightSpacing = this.visibleColsService.getDisplayedColumnsRightWidth();
        const scrollOnRight = !this.enableRtl && vScrollShowing;
        const scrollbarWidth = this.gos.getScrollbarWidth();

        if (scrollOnRight) {
            rightSpacing += scrollbarWidth;
        }
        _setFixedWidth(this.eRightSpacer, rightSpacing);
        this.eRightSpacer.classList.toggle('ag-scroller-corner', rightSpacing <= scrollbarWidth);

        // we pad the left based on a) if cols are pinned to the left and
        // b) if v scroll is showing on the left (happens in LTR layout only)
        let leftSpacing = this.visibleColsService.getColsLeftWidth();
        const scrollOnLeft = this.enableRtl && vScrollShowing;

        if (scrollOnLeft) {
            leftSpacing += scrollbarWidth;
        }

        _setFixedWidth(this.eLeftSpacer, leftSpacing);
        this.eLeftSpacer.classList.toggle('ag-scroller-corner', leftSpacing <= scrollbarWidth);
    }

    protected setScrollVisible(): void {
        const hScrollShowing = this.scrollVisibleService.isHorizontalScrollShowing();
        const invisibleScrollbar = this.invisibleScrollbar;
        const isSuppressHorizontalScroll = this.gos.get('suppressHorizontalScroll');
        const scrollbarWidth = hScrollShowing ? this.gos.getScrollbarWidth() || 0 : 0;
        const adjustedScrollbarWidth = scrollbarWidth === 0 && invisibleScrollbar ? 16 : scrollbarWidth;
        const scrollContainerSize = !isSuppressHorizontalScroll ? adjustedScrollbarWidth : 0;

        this.addOrRemoveCssClass('ag-scrollbar-invisible', invisibleScrollbar);
        _setFixedHeight(this.getGui(), scrollContainerSize);
        _setFixedHeight(this.eViewport, scrollContainerSize);
        _setFixedHeight(this.eContainer, scrollContainerSize);
        this.setDisplayed(hScrollShowing, { skipAriaHidden: true });
    }

    public getScrollPosition(): number {
        return _getScrollLeft(this.getViewport(), this.enableRtl);
    }

    public setScrollPosition(value: number): void {
        if (!_isVisible(this.getViewport())) {
            this.attemptSettingScrollPosition(value);
        }
        _setScrollLeft(this.getViewport(), value, this.enableRtl);
    }
}
