import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import {
    ColDef,
    GetRowIdParams,
    GridApi,
    GridOptions,
    ValueFormatterParams,
    ValueGetterParams,
    createGrid,
} from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { RowGroupingModule } from '@ag-grid-enterprise/row-grouping';

import { getData } from './data';

ModuleRegistry.registerModules([ClientSideRowModelModule, RowGroupingModule]);

var callCount = 1;

const columnDefs: ColDef[] = [
    { field: 'q1', type: 'quarterFigure' },
    { field: 'q2', type: 'quarterFigure' },
    { field: 'q3', type: 'quarterFigure' },
    { field: 'q4', type: 'quarterFigure' },
    { field: 'year', rowGroup: true, hide: true },
    {
        headerName: 'Total',
        colId: 'total',
        cellClass: ['number-cell', 'total-col'],
        aggFunc: 'sum',
        valueFormatter: formatNumber,
        valueGetter: (params: ValueGetterParams) => {
            var q1 = params.getValue('q1');
            var q2 = params.getValue('q2');
            var q3 = params.getValue('q3');
            var q4 = params.getValue('q4');
            var result = q1 + q2 + q3 + q4;
            console.log(
                `Total Value Getter (${callCount}, ${params.column.getId()}): ${[q1, q2, q3, q4].join(', ')} =  ${result}`
            );
            callCount++;
            return result;
        },
    },
];

let gridApi: GridApi;

const gridOptions: GridOptions = {
    columnDefs: columnDefs,
    defaultColDef: {
        flex: 1,
        enableCellChangeFlash: true,
    },
    autoGroupColumnDef: {
        minWidth: 140,
    },
    // we set the value cache in the function createGrid below
    // valueCache = true / false;
    columnTypes: {
        quarterFigure: {
            cellClass: 'number-cell',
            aggFunc: 'sum',
            valueFormatter: formatNumber,
            valueParser: function numberParser(params) {
                return Number(params.newValue);
            },
        },
    },
    rowData: getData(),
    suppressAggFuncInHeader: true,
    groupDefaultExpanded: 1,
    getRowId: (params: GetRowIdParams) => {
        return params.data.id;
    },
    onCellValueChanged: () => {
        console.log('onCellValueChanged');
    },
};

function formatNumber(params: ValueFormatterParams) {
    var number = params.value;
    return Math.floor(number).toLocaleString();
}

function onValueCache(valueCacheOn: boolean) {
    destroyOldGridIfExists();
    makeGrid(valueCacheOn);
}

function destroyOldGridIfExists() {
    if (gridApi!) {
        console.log('==========> destroying old grid');
        gridApi!.destroy();
    }
}

function makeGrid(valueCacheOn: boolean) {
    console.log('==========> creating grid');
    callCount = 1;
    gridOptions.valueCache = valueCacheOn;

    // then similar to all the other examples, create the grid
    var gridDiv = document.querySelector<HTMLElement>('#myGrid')!;
    gridApi = createGrid(gridDiv, gridOptions);
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', function () {
    onValueCache(false);
});
