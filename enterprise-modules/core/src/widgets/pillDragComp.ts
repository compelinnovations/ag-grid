import type {
    AgEvent,
    BeanCollection,
    ComponentClass,
    DragItem,
    DragSource,
    DragSourceType,
    DropTarget,
} from '@ag-grid-community/core';
import {
    Component,
    DragAndDropService,
    Events,
    KeyCode,
    RefPlaceholder,
    TouchListener,
    _createIconNoSpan,
    _escapeString,
    _setAriaLabel,
    _setDisplayed,
} from '@ag-grid-community/core';

export abstract class PillDragComp<TItem> extends Component {
    private dragAndDropService: DragAndDropService;

    public wireBeans(beans: BeanCollection) {
        this.dragAndDropService = beans.dragAndDropService;
    }

    public static EVENT_COLUMN_REMOVE = 'columnRemove';

    private static TEMPLATE /* html */ = `<span role="option">
          <span data-ref="eDragHandle" class="ag-drag-handle ag-column-drop-cell-drag-handle" role="presentation"></span>
          <span data-ref="eText" class="ag-column-drop-cell-text" aria-hidden="true"></span>
          <span data-ref="eButton" class="ag-column-drop-cell-button" role="presentation"></span>
        </span>`;

    private readonly eText: HTMLElement = RefPlaceholder;
    private readonly eDragHandle: HTMLElement = RefPlaceholder;
    private readonly eButton: HTMLElement = RefPlaceholder;

    public abstract getItem(): TItem;
    protected abstract getDisplayName(): string;
    protected abstract getAriaDisplayName(): string;
    protected abstract getTooltip(): string | null | undefined;
    protected abstract createGetDragItem(): () => DragItem<TItem>;
    protected abstract getDragSourceType(): DragSourceType;

    constructor(
        private dragSourceDropTarget: DropTarget,
        private ghost: boolean,
        private horizontal: boolean,
        private template?: string,
        private agComponents?: ComponentClass[]
    ) {
        super();
    }

    public postConstruct(): void {
        this.setTemplate(this.template ?? PillDragComp.TEMPLATE, this.agComponents);
        const eGui = this.getGui();

        this.addElementClasses(eGui);
        this.addElementClasses(this.eDragHandle, 'drag-handle');
        this.addElementClasses(this.eText, 'text');
        this.addElementClasses(this.eButton, 'button');

        this.eDragHandle.appendChild(_createIconNoSpan('columnDrag', this.gos)!);

        this.eButton.appendChild(_createIconNoSpan('cancel', this.gos)!);

        this.setupComponents();

        if (!this.ghost && this.isDraggable()) {
            this.addDragSource();
        }

        this.setupAria();

        this.setupTooltip();
        this.activateTabIndex();

        this.refreshDraggable();
    }

    protected isDraggable(): boolean {
        return true;
    }

    protected refreshDraggable(): void {
        this.eDragHandle.classList.toggle('ag-column-select-column-readonly', !this.isDraggable());
    }

    protected setupAria() {
        const translate = this.localeService.getLocaleTextFunc();

        const ariaInstructions = [this.getAriaDisplayName()];

        this.addAdditionalAriaInstructions(ariaInstructions, translate);

        _setAriaLabel(this.getGui(), ariaInstructions.join('. '));
    }

    protected addAdditionalAriaInstructions(
        ariaInstructions: string[],
        translate: (key: string, defaultValue: string) => string
    ): void {
        if (this.isRemovable()) {
            const deleteAria = translate('ariaDropZoneColumnComponentDescription', 'Press DELETE to remove');
            ariaInstructions.push(deleteAria);
        }
    }

    private setupTooltip(): void {
        const refresh = () => {
            const newTooltipText = this.getTooltip();
            this.setTooltip({ newTooltipText });
        };

        refresh();

        this.addManagedListener(this.eventService, Events.EVENT_NEW_COLUMNS_LOADED, refresh);
    }

    protected getDragSourceId(): string | undefined {
        return undefined;
    }

    protected getDefaultIconName(): string {
        return DragAndDropService.ICON_NOT_ALLOWED;
    }

    private addDragSource(): void {
        const { dragAndDropService, eDragHandle } = this;
        const getDragItem = this.createGetDragItem();
        const defaultIconName = this.getDefaultIconName();
        const dragSource: DragSource = {
            type: this.getDragSourceType(),
            sourceId: this.getDragSourceId(),
            eElement: eDragHandle,
            getDefaultIconName: () => defaultIconName,
            getDragItem,
            dragItemName: this.getDisplayName(),
        };

        dragAndDropService.addDragSource(dragSource, true);
        this.addDestroyFunc(() => dragAndDropService.removeDragSource(dragSource));
    }

    protected setupComponents(): void {
        this.setTextValue();
        this.setupRemove();

        if (this.ghost) {
            this.addCssClass('ag-column-drop-cell-ghost');
        }
    }

    protected isRemovable(): boolean {
        return true;
    }

    protected refreshRemove(): void {
        _setDisplayed(this.eButton, this.isRemovable());
    }

    private setupRemove(): void {
        this.refreshRemove();

        const agEvent: AgEvent = { type: PillDragComp.EVENT_COLUMN_REMOVE };

        this.addGuiEventListener('keydown', (e: KeyboardEvent) => this.onKeyDown(e));

        this.addManagedListener(this.eButton, 'click', (mouseEvent: MouseEvent) => {
            this.dispatchEvent(agEvent);
            mouseEvent.stopPropagation();
        });

        const touchListener = new TouchListener(this.eButton);
        this.addManagedListener(touchListener, TouchListener.EVENT_TAP, () => {
            this.dispatchEvent(agEvent);
        });
        this.addDestroyFunc(touchListener.destroy.bind(touchListener));
    }

    protected onKeyDown(e: KeyboardEvent): void {
        const isDelete = e.key === KeyCode.DELETE;

        if (isDelete) {
            if (this.isRemovable()) {
                e.preventDefault();
                this.dispatchEvent({ type: PillDragComp.EVENT_COLUMN_REMOVE });
            }
        }
    }

    protected getDisplayValue(): string {
        return this.getDisplayName();
    }

    private setTextValue(): void {
        const displayValue = this.getDisplayValue();
        const displayValueSanitised: any = _escapeString(displayValue);

        this.eText.innerHTML = displayValueSanitised;
    }

    private addElementClasses(el: HTMLElement, suffix?: string) {
        suffix = suffix ? `-${suffix}` : '';
        const direction = this.horizontal ? 'horizontal' : 'vertical';
        el.classList.add(`ag-column-drop-cell${suffix}`, `ag-column-drop-${direction}-cell${suffix}`);
    }

    public override destroy(): void {
        super.destroy();
        (this.dragSourceDropTarget as any) = null;
    }
}
