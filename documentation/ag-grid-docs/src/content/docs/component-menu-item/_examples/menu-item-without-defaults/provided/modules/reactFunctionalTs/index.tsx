'use strict';

import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { ColDef, GetMainMenuItemsParams, GridReadyEvent } from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { AgGridReact } from '@ag-grid-community/react';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { ExcelExportModule } from '@ag-grid-enterprise/excel-export';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import React, { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { IOlympicData } from './interfaces';
import MenuItem from './menuItem';
import './style.css';

ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    MenuModule,
    ExcelExportModule,
    RangeSelectionModule,
    ClipboardModule,
]);

const GridExample = () => {
    const containerStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);
    const gridStyle = useMemo(() => ({ height: '100%', width: '100%' }), []);
    const [rowData, setRowData] = useState<IOlympicData[]>();
    const [columnDefs, setColumnDefs] = useState<ColDef[]>([
        { field: 'athlete' },
        { field: 'country' },
        { field: 'sport' },
        { field: 'year' },
        { field: 'gold' },
        { field: 'silver' },
        { field: 'bronze' },
    ]);
    const defaultColDef = useMemo<ColDef>(() => {
        return {
            flex: 1,
            minWidth: 100,
            filter: true,
            menuTabs: ['generalMenuTab'],
        };
    }, []);

    const onGridReady = useCallback((params: GridReadyEvent) => {
        fetch('https://www.ag-grid.com/example-assets/olympic-winners.json')
            .then((resp) => resp.json())
            .then((data: IOlympicData[]) => {
                setRowData(data);
            });
    }, []);

    const getMainMenuItems = useCallback((params: GetMainMenuItemsParams) => {
        return [
            ...params.defaultItems,
            'separator',
            {
                name: 'Filter',
                menuItem: MenuItem,
                menuItemParams: {
                    column: params.column,
                },
            },
        ];
    }, []);

    return (
        <div style={containerStyle}>
            <div
                style={gridStyle}
                className={
                    /** DARK MODE START **/ document.documentElement?.dataset.defaultTheme ||
                    'ag-theme-quartz' /** DARK MODE END **/
                }
            >
                <AgGridReact<IOlympicData>
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    getMainMenuItems={getMainMenuItems}
                    suppressMenuHide
                    reactiveCustomComponents
                    onGridReady={onGridReady}
                />
            </div>
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <StrictMode>
        <GridExample />
    </StrictMode>
);
