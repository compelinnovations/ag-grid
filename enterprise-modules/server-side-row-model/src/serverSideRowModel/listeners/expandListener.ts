import type {
    BeanCollection,
    NamedBean,
    RowGroupOpenedEvent,
    StoreUpdatedEvent,
    WithoutGridCommon,
} from '@ag-grid-community/core';
import { BeanStub, Events, RowNode, _exists, _missing } from '@ag-grid-community/core';

import type { ServerSideRowModel } from '../serverSideRowModel';
import type { StoreFactory } from '../stores/storeFactory';

export class ExpandListener extends BeanStub implements NamedBean {
    beanName = 'ssrmExpandListener' as const;

    private serverSideRowModel: ServerSideRowModel;
    private storeFactory: StoreFactory;
    private beans: BeanCollection;

    public wireBeans(beans: BeanCollection) {
        this.serverSideRowModel = beans.rowModel as ServerSideRowModel;
        this.storeFactory = beans.ssrmStoreFactory;
        this.beans = beans;
    }

    public postConstruct(): void {
        // only want to be active if SSRM active, otherwise would be interfering with other row models
        if (!this.gos.isRowModelType('serverSide')) {
            return;
        }

        this.addManagedListener(this.eventService, Events.EVENT_ROW_GROUP_OPENED, this.onRowGroupOpened.bind(this));
    }

    private onRowGroupOpened(event: RowGroupOpenedEvent): void {
        const rowNode = event.node as RowNode;

        if (rowNode.expanded) {
            if (rowNode.master) {
                this.createDetailNode(rowNode);
            } else if (_missing(rowNode.childStore)) {
                const storeParams = this.serverSideRowModel.getParams();
                rowNode.childStore = this.createBean(this.storeFactory.createStore(storeParams, rowNode));
            }
        } else if (this.gos.get('purgeClosedRowNodes') && _exists(rowNode.childStore)) {
            rowNode.childStore = this.destroyBean(rowNode.childStore)!;
        }

        const storeUpdatedEvent: WithoutGridCommon<StoreUpdatedEvent> = { type: Events.EVENT_STORE_UPDATED };
        this.eventService.dispatchEvent(storeUpdatedEvent);
    }

    private createDetailNode(masterNode: RowNode): RowNode {
        if (_exists(masterNode.detailNode)) {
            return masterNode.detailNode;
        }

        const detailNode = new RowNode(this.beans);

        detailNode.detail = true;
        detailNode.selectable = false;
        detailNode.parent = masterNode;

        if (_exists(masterNode.id)) {
            detailNode.id = 'detail_' + masterNode.id;
        }

        detailNode.data = masterNode.data;
        detailNode.level = masterNode.level + 1;

        const defaultDetailRowHeight = 200;
        const rowHeight = this.gos.getRowHeightForNode(detailNode).height;

        detailNode.rowHeight = rowHeight ? rowHeight : defaultDetailRowHeight;
        masterNode.detailNode = detailNode;

        return detailNode;
    }
}
