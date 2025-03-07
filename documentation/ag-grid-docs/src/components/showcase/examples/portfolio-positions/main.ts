import {
    calculate52wChange,
    costCalculator,
    currencyFormatter,
    percentageFormatter,
    pnlCalculator,
    pnlPercentCalculator,
    valueCalculator,
} from './calculations';
import { getData } from './data';
import { renderPdfLink } from './pdfRenderer';

let gridApi;

const columnDefs = [
    {
        headerName: 'Ticker',
        field: 'ticker',
        cellDataType: 'text',
        pinned: 'left',
        width: 100,
    },
    { headerName: 'Name', field: 'name', cellDataType: 'text', width: 220 },
    {
        headerName: 'CCY',
        field: 'ccy',
        cellDataType: 'text',
        enableRowGroup: true,
        width: 80,
    },
    {
        headerName: 'Instrument',
        field: 'instrument',
        cellDataType: 'text',
        enableRowGroup: true,
        width: 150,
    },
    {
        headerName: 'Quantity',
        field: 'quantity',
        cellDataType: 'number',
        width: 120,
    },
    {
        headerName: 'Purchase Date',
        field: 'buyDate',
        cellDataType: 'dateString',
        width: 150,
    },
    {
        headerName: 'Cost Price',
        field: 'buyPrice',
        cellDataType: 'number',
        valueFormatter: currencyFormatter,
        width: 120,
        aggFunc: 'avg',
    },
    {
        headerName: 'Total Cost',
        cellDataType: 'number',
        valueGetter: costCalculator,
        valueFormatter: currencyFormatter,
        width: 150,
        aggFunc: 'sum',
    },
    {
        headerName: 'Price',
        cellDataType: 'number',
        field: 'currentPrice',
        valueFormatter: currencyFormatter,
        width: 100,
        aggFunc: 'avg',
    },
    {
        headerName: 'Total Value',
        cellDataType: 'number',
        valueGetter: valueCalculator,
        valueFormatter: currencyFormatter,
        width: 150,
        aggFunc: 'sum',
    },
    {
        headerName: 'P/L',
        valueGetter: pnlCalculator,
        cellDataType: 'number',
        cellStyle: (params) => {
            if (params.value > 0) {
                return { color: 'green' };
            } else {
                return { color: 'red' };
            }
        },
        valueFormatter: currencyFormatter,
        width: 150,
        pivot: true,
        aggFunc: 'sum',
    },
    {
        headerName: 'P/L %',
        valueGetter: pnlPercentCalculator,
        valueFormatter: percentageFormatter,
        width: 100,
        cellStyle: (params) => {
            if (params.value > 0) {
                return { color: 'green' };
            } else {
                return { color: 'red' };
            }
        },
        aggFunc: 'avg',
    },
    {
        headerName: '52w Change %',
        valueGetter: calculate52wChange,
        valueFormatter: percentageFormatter,
        width: 150,
        cellStyle: (params) => {
            if (params.value > 0) {
                return { color: 'green' };
            } else {
                return { color: 'red' };
            }
        },
        aggFunc: 'avg',
    },
    {
        headerName: '52w Sparkline',
        field: 'change',
        cellRenderer: 'agSparklineCellRenderer',
        cellRendererParams: {
            sparklineOptions: {
                type: 'area',
                fill: 'rgba(185,173,77,0.3)',
                line: {
                    stroke: 'rgb(185,173,77)',
                },
                highlightStyle: {
                    size: 4,
                    stroke: 'rgb(185,173,77)',
                    fill: 'rgb(185,173,77)',
                },
                crosshairs: {
                    xLine: {
                        enabled: true,
                        lineDash: 'dash',
                        stroke: '#999',
                    },
                    yLine: {
                        enabled: true,
                        lineDash: 'dash',
                        stroke: '#999',
                    },
                },
            },
        },
    },
    { headerName: 'Trading Advice', cellRenderer: renderPdfLink, width: 150 },
];

const gridOptions = {
    rowData: getData(),
    columnDefs: columnDefs,
    defaultColDef: {
        filter: true,
        resizable: true,
    },
    sideBar: true,
    rowGroupPanelShow: 'always',
    enableRangeSelection: true,
    enableAdvancedFilter: true,
    enableCharts: true,
    rowSelection: 'multiple',
    statusBar: {
        statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent' },
            { statusPanel: 'agTotalRowCountComponent' },
            { statusPanel: 'agFilteredRowCountComponent' },
            { statusPanel: 'agSelectedRowCountComponent' },
            { statusPanel: 'agAggregationComponent' },
        ],
    },
};

function onBtExport() {
    gridApi.exportDataAsExcel();
}

// setup the grid after the page has finished loading
document.addEventListener('DOMContentLoaded', function () {
    const gridDiv = document.querySelector('#myGrid');
    gridApi = agGrid.createGrid(gridDiv, gridOptions);

    const button = document.getElementById('export-to-excel');
    button.addEventListener('click', () => {
        onBtExport();
    });
});
