import type { AgEvent, Component, DragSourceType, IEventEmitter } from '@ag-grid-community/core';

export interface VirtualListDragItem<R extends Component> {
    rowIndex: number;
    position: 'top' | 'bottom';
    component: R;
}

export interface VirtualListDragParams<C extends Component, R extends Component, V, E extends AgEvent> {
    eventSource: Window | HTMLElement | IEventEmitter;
    listItemDragStartEvent: string;
    listItemDragEndEvent: string;
    dragSourceType: DragSourceType;
    getCurrentDragValue: (listItemDragStartEvent: E) => V;
    isMoveBlocked: (currentDragValue: V | null) => boolean;
    getNumRows: (comp: C) => number;
    moveItem: (currentDragValue: V | null, lastHoveredListItem: VirtualListDragItem<R> | null) => void;
}
