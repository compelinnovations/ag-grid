import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { GridApi, GridOptions, createGrid } from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { CsvExportModule } from '@ag-grid-community/csv-export';
import { ExcelExportModule } from '@ag-grid-enterprise/excel-export';
import { MenuModule } from '@ag-grid-enterprise/menu';

ModuleRegistry.registerModules([ClientSideRowModelModule, CsvExportModule, ExcelExportModule, MenuModule]);

let gridApi: GridApi<IOlympicData>;

const gridOptions: GridOptions<IOlympicData> = {
    columnDefs: [
        { field: 'athlete', filter: true },
        { field: 'age' },
        { field: 'country', filter: true },
        { field: 'gold' },
        { field: 'silver' },
        { field: 'bronze' },
        { field: 'total' },
    ],
    defaultColDef: {
        filter: true,
        minWidth: 100,
        flex: 1,
    },
    defaultExcelExportParams: {
        exportAsExcelTable: {
            name: 'Olympic Medals',
            showRowStripes: false,
            showColumnStripes: true,
            showFilterButton: true,
        },
    },
};

function onBtExport() {
    gridApi!.exportDataAsExcel();
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', function () {
    var gridDiv = document.querySelector<HTMLElement>('#myGrid')!;
    gridApi = createGrid(gridDiv, gridOptions);

    fetch('https://www.ag-grid.com/example-assets/small-olympic-winners.json')
        .then((response) => response.json())
        .then(function (data) {
            gridApi!.setGridOption('rowData', data);
        });
});
