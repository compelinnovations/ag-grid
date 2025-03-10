import type { ISideBar, ISideBarService, NamedBean } from '@ag-grid-community/core';
import { BeanStub } from '@ag-grid-community/core';

export class SideBarService extends BeanStub implements NamedBean, ISideBarService {
    beanName = 'sideBarService' as const;

    private sideBarComp: ISideBar;

    public registerSideBarComp(sideBarComp: ISideBar): void {
        this.sideBarComp = sideBarComp;
    }

    public getSideBarComp(): ISideBar {
        return this.sideBarComp;
    }
}
