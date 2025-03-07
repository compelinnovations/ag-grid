import type { Module } from '@ag-grid-community/core';
import { ColumnFilterModule, ModuleNames, ReadOnlyFloatingFilterModule } from '@ag-grid-community/core';
import { AgMenuItemRenderer, EnterpriseCoreModule } from '@ag-grid-enterprise/core';

import { MultiFilter } from './multiFilter/multiFilter';
import { MultiFloatingFilterComp } from './multiFilter/multiFloatingFilter';
import { VERSION } from './version';

export const MultiFilterCoreModule: Module = {
    version: VERSION,
    moduleName: '@ag-grid-enterprise/multi-filter-core',
    userComponents: [
        { name: 'agMultiColumnFilter', classImp: MultiFilter },
        {
            name: 'agMenuItem',
            classImp: AgMenuItemRenderer,
        },
    ],
    dependantModules: [EnterpriseCoreModule, ColumnFilterModule],
};

const MultiFloatingFilterModule: Module = {
    version: VERSION,
    moduleName: '@ag-grid-enterprise/multi-floating-filter',
    userComponents: [{ name: 'agMultiColumnFloatingFilter', classImp: MultiFloatingFilterComp }],
    dependantModules: [MultiFilterCoreModule, ReadOnlyFloatingFilterModule],
};

export const MultiFilterModule: Module = {
    version: VERSION,
    moduleName: ModuleNames.MultiFilterModule,
    dependantModules: [MultiFilterCoreModule, MultiFloatingFilterModule],
};
