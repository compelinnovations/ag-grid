import type { UserCompDetails } from '../../../components/framework/userComponentFactory';
import { _setDisplayed } from '../../../utils/dom';
import { RefPlaceholder } from '../../../widgets/component';
import { AbstractHeaderCellComp } from '../abstractCell/abstractHeaderCellComp';
import type { HeaderGroupCellCtrl, IHeaderGroupCellComp } from './headerGroupCellCtrl';
import type { IHeaderGroupComp } from './headerGroupComp';

export class HeaderGroupCellComp extends AbstractHeaderCellComp<HeaderGroupCellCtrl> {
    private static TEMPLATE /* html */ = `<div class="ag-header-group-cell" role="columnheader">
            <div data-ref="eResize" class="ag-header-cell-resize" role="presentation"></div>
        </div>`;

    private eResize: HTMLElement = RefPlaceholder;

    private headerGroupComp: IHeaderGroupComp | undefined;

    constructor(ctrl: HeaderGroupCellCtrl) {
        super(HeaderGroupCellComp.TEMPLATE, ctrl);
    }

    public postConstruct(): void {
        const eGui = this.getGui();

        const setAttribute = (key: string, value: string | undefined) =>
            value != undefined ? eGui.setAttribute(key, value) : eGui.removeAttribute(key);

        eGui.setAttribute('col-id', this.ctrl.getColId());

        const compProxy: IHeaderGroupCellComp = {
            addOrRemoveCssClass: (cssClassName, on) => this.addOrRemoveCssClass(cssClassName, on),
            setResizableDisplayed: (displayed) => _setDisplayed(this.eResize, displayed),
            setWidth: (width) => (eGui.style.width = width),
            setAriaExpanded: (expanded: 'true' | 'false' | undefined) => setAttribute('aria-expanded', expanded),
            setUserCompDetails: (details) => this.setUserCompDetails(details),
            getUserCompInstance: () => this.headerGroupComp,
        };

        this.ctrl.setComp(compProxy, eGui, this.eResize);
    }

    private setUserCompDetails(details: UserCompDetails): void {
        details.newAgStackInstance()!.then((comp) => this.afterHeaderCompCreated(comp));
    }

    private afterHeaderCompCreated(headerGroupComp: IHeaderGroupComp): void {
        const destroyFunc = () => this.destroyBean(headerGroupComp);

        if (!this.isAlive()) {
            destroyFunc();
            return;
        }

        const eGui = this.getGui();
        const eHeaderGroupGui = headerGroupComp.getGui();

        eGui.appendChild(eHeaderGroupGui);
        this.addDestroyFunc(destroyFunc);

        this.headerGroupComp = headerGroupComp;
        this.ctrl.setDragSource(eGui);
    }
}
