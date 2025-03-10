import type { Module } from '@ag-grid-community/core';
import { ModuleNames } from '@ag-grid-community/core';

import { ClientSideRowModel } from './clientSideRowModel/clientSideRowModel';
import { FilterStage } from './clientSideRowModel/filterStage';
import { FlattenStage } from './clientSideRowModel/flattenStage';
import { ImmutableService } from './clientSideRowModel/immutableService';
import { SortService } from './clientSideRowModel/sortService';
import { SortStage } from './clientSideRowModel/sortStage';
import { VERSION } from './version';

export const ClientSideRowModelModule: Module = {
    version: VERSION,
    moduleName: ModuleNames.ClientSideRowModelModule,
    rowModel: 'clientSide',
    beans: [ClientSideRowModel, FilterStage, SortStage, FlattenStage, SortService, ImmutableService],
};
