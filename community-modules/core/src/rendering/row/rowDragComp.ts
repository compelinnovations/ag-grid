import { BeanStub } from '../../context/beanStub';
import type { BeanCollection } from '../../context/context';
import type { DragItem, DragSource } from '../../dragAndDrop/dragAndDropService';
import { DragSourceType } from '../../dragAndDrop/dragAndDropService';
import type { AgColumn } from '../../entities/agColumn';
import { RowNode } from '../../entities/rowNode';
import { Events } from '../../eventKeys';
import type { EventsType } from '../../eventKeys';
import { _isFunction, _warnOnce } from '../../utils/function';
import { _createIconNoSpan } from '../../utils/icon';
import { Component } from '../../widgets/component';

export interface IRowDragItem extends DragItem {
    /** The default text that would be applied to this Drag Element */
    defaultTextValue: string;
}

export class RowDragComp extends Component {
    private dragSource: DragSource | null = null;

    private beans: BeanCollection;

    public wireBeans(beans: BeanCollection): void {
        this.beans = beans;
    }

    constructor(
        private readonly cellValueFn: () => string,
        private readonly rowNode: RowNode,
        private readonly column?: AgColumn,
        private readonly customGui?: HTMLElement,
        private readonly dragStartPixels?: number,
        private readonly suppressVisibilityChange?: boolean
    ) {
        super();
    }

    public isCustomGui(): boolean {
        return this.customGui != null;
    }

    public postConstruct(): void {
        if (!this.customGui) {
            this.setTemplate(/* html */ `<div class="ag-drag-handle ag-row-drag" aria-hidden="true"></div>`);
            this.getGui().appendChild(_createIconNoSpan('rowDrag', this.gos, null)!);
            this.addDragSource();
        } else {
            this.setDragElement(this.customGui, this.dragStartPixels);
        }

        this.checkCompatibility();

        if (!this.suppressVisibilityChange) {
            const strategy = this.gos.get('rowDragManaged')
                ? new ManagedVisibilityStrategy(this, this.beans, this.rowNode, this.column)
                : new NonManagedVisibilityStrategy(this, this.beans, this.rowNode, this.column);

            this.createManagedBean(strategy, this.beans.context);
        }
    }

    public setDragElement(dragElement: HTMLElement, dragStartPixels?: number) {
        this.setTemplateFromElement(dragElement);
        this.addDragSource(dragStartPixels);
    }

    private getSelectedNodes(): RowNode[] {
        const isRowDragMultiRow = this.gos.get('rowDragMultiRow');
        if (!isRowDragMultiRow) {
            return [this.rowNode];
        }

        const selection = this.beans.selectionService.getSelectedNodes();

        return selection.indexOf(this.rowNode) !== -1 ? selection : [this.rowNode];
    }

    // returns true if all compatibility items work out
    private checkCompatibility(): void {
        const managed = this.gos.get('rowDragManaged');
        const treeData = this.gos.get('treeData');

        if (treeData && managed) {
            _warnOnce('If using row drag with tree data, you cannot have rowDragManaged=true');
        }
    }

    private getDragItem(): IRowDragItem {
        return {
            rowNode: this.rowNode,
            rowNodes: this.getSelectedNodes(),
            columns: this.column ? [this.column] : undefined,
            defaultTextValue: this.cellValueFn(),
        };
    }

    private getRowDragText(column?: AgColumn) {
        if (column) {
            const colDef = column.getColDef();
            if (colDef.rowDragText) {
                return colDef.rowDragText;
            }
        }
        return this.gos.get('rowDragText');
    }

    private addDragSource(dragStartPixels: number = 4): void {
        // if this is changing the drag element, delete the previous dragSource
        if (this.dragSource) {
            this.removeDragSource();
        }

        const translate = this.localeService.getLocaleTextFunc();

        this.dragSource = {
            type: DragSourceType.RowDrag,
            eElement: this.getGui(),
            dragItemName: () => {
                const dragItem = this.getDragItem();
                const dragItemCount = dragItem.rowNodes?.length || 1;

                const rowDragText = this.getRowDragText(this.column);
                if (rowDragText) {
                    return rowDragText(dragItem, dragItemCount);
                }

                return dragItemCount === 1
                    ? this.cellValueFn()
                    : `${dragItemCount} ${translate('rowDragRows', 'rows')}`;
            },
            getDragItem: () => this.getDragItem(),
            dragStartPixels,
            dragSourceDomDataKey: this.gos.getDomDataKey(),
        };

        this.beans.dragAndDropService.addDragSource(this.dragSource, true);
    }

    public override destroy(): void {
        this.removeDragSource();
        super.destroy();
    }

    private removeDragSource() {
        if (this.dragSource) {
            this.beans.dragAndDropService.removeDragSource(this.dragSource);
        }
        this.dragSource = null;
    }
}

class VisibilityStrategy extends BeanStub {
    private readonly parent: RowDragComp;
    private readonly column: AgColumn | undefined;
    protected readonly rowNode: RowNode;

    constructor(parent: RowDragComp, rowNode: RowNode, column?: AgColumn) {
        super();
        this.parent = parent;
        this.rowNode = rowNode;
        this.column = column;
    }

    protected setDisplayedOrVisible(neverDisplayed: boolean): void {
        const displayedOptions = { skipAriaHidden: true };
        if (neverDisplayed) {
            this.parent.setDisplayed(false, displayedOptions);
        } else {
            let shown: boolean = true;
            let isShownSometimes: boolean = false;

            if (this.column) {
                shown = this.column.isRowDrag(this.rowNode) || this.parent.isCustomGui();
                isShownSometimes = _isFunction(this.column.getColDef().rowDrag);
            }

            // if shown sometimes, them some rows can have drag handle while other don't,
            // so we use setVisible to keep the handles horizontally aligned (as _setVisible
            // keeps the empty space, whereas setDisplayed looses the space)
            if (isShownSometimes) {
                this.parent.setDisplayed(true, displayedOptions);
                this.parent.setVisible(shown, displayedOptions);
            } else {
                this.parent.setDisplayed(shown, displayedOptions);
                this.parent.setVisible(true, displayedOptions);
            }
        }
    }
}

// when non managed, the visibility depends on suppressRowDrag property only
class NonManagedVisibilityStrategy extends VisibilityStrategy {
    private readonly beans: BeanCollection;

    constructor(parent: RowDragComp, beans: BeanCollection, rowNode: RowNode, column?: AgColumn) {
        super(parent, rowNode, column);
        this.beans = beans;
    }

    public postConstruct(): void {
        this.addManagedPropertyListener('suppressRowDrag', this.onSuppressRowDrag.bind(this));

        // in case data changes, then we need to update visibility of drag item
        const listener = this.workOutVisibility.bind(this);
        this.addManagedListeners(this.rowNode, {
            [RowNode.EVENT_DATA_CHANGED]: listener,
            [RowNode.EVENT_CELL_CHANGED]: listener,
        });

        this.addManagedListener(this.beans.eventService, Events.EVENT_NEW_COLUMNS_LOADED, listener);

        this.workOutVisibility();
    }

    private onSuppressRowDrag(): void {
        this.workOutVisibility();
    }

    private workOutVisibility(): void {
        // only show the drag if both sort and filter are not present
        const neverDisplayed = this.gos.get('suppressRowDrag');
        this.setDisplayedOrVisible(neverDisplayed);
    }
}

// when managed, the visibility depends on sort, filter and row group, as well as suppressRowDrag property
class ManagedVisibilityStrategy extends VisibilityStrategy {
    private readonly beans: BeanCollection;

    constructor(parent: RowDragComp, beans: BeanCollection, rowNode: RowNode, column?: AgColumn) {
        super(parent, rowNode, column);
        this.beans = beans;
    }

    public postConstruct(): void {
        const listener = this.workOutVisibility.bind(this);
        // we do not show the component if sort, filter or grouping is active
        this.addManagedListeners<EventsType>(this.beans.eventService, {
            [Events.EVENT_SORT_CHANGED]: listener,
            [Events.EVENT_FILTER_CHANGED]: listener,
            [Events.EVENT_COLUMN_ROW_GROUP_CHANGED]: listener,
            [Events.EVENT_NEW_COLUMNS_LOADED]: listener,
        });

        // in case data changes, then we need to update visibility of drag item
        this.addManagedListeners(this.rowNode, {
            [RowNode.EVENT_DATA_CHANGED]: listener,
            [RowNode.EVENT_CELL_CHANGED]: listener,
        });

        this.addManagedPropertyListener('suppressRowDrag', this.onSuppressRowDrag.bind(this));

        this.workOutVisibility();
    }

    private onSuppressRowDrag(): void {
        this.workOutVisibility();
    }

    private workOutVisibility(): void {
        // only show the drag if both sort and filter are not present
        const gridBodyCon = this.beans.ctrlsService.getGridBodyCtrl();
        const rowDragFeature = gridBodyCon.getRowDragFeature();
        const shouldPreventRowMove = rowDragFeature && rowDragFeature.shouldPreventRowMove();
        const suppressRowDrag = this.gos.get('suppressRowDrag');
        const hasExternalDropZones = this.beans.dragAndDropService.hasExternalDropZones();
        const neverDisplayed = (shouldPreventRowMove && !hasExternalDropZones) || suppressRowDrag;

        this.setDisplayedOrVisible(neverDisplayed);
    }
}
