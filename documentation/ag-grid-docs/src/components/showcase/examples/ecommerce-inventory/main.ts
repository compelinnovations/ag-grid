import { ButtonCellRenderer } from './buttonCellRenderer';
import { getData } from './data';
import { imageCellRenderer } from './imageCellRenderer';

let gridApi;

const whenSoldOut = ['Discontinued', 'Back order', 'Email when available'];

const quantityCalculator = (params) => {
    return params.data.available + params.data.unavailable;
};

const gridOptions = {
    rowData: getData(),
    // Columns to be displayed (Should match rowData properties)
    columnDefs: [
        {
            headerCheckboxSelection: true,
            checkboxSelection: true,
            field: 'imageURL',
            headerName: 'Product Image',
            cellRenderer: imageCellRenderer,
            autoHeight: true,
        },
        { field: 'product', wrapText: true, filter: true },
        { field: 'sku', headerName: 'SKU' },
        { field: 'status', cellClass: cellClass },
        {
            field: 'whenSoldOut',
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: whenSoldOut,
            },
            editable: true,
        },
        {
            field: 'available',
            cellEditor: 'agNumberCellEditor',
            filter: 'agNumberColumnFilter',
            cellEditorParams: {
                precision: 0,
                step: 1,
                showStepperButtons: true,
            },
            editable: true,
        },
        {
            field: 'unavailable',
            cellEditor: 'agNumberCellEditor',
            filter: 'agNumberColumnFilter',
            cellEditorParams: {
                precision: 0,
                step: 1,
                showStepperButtons: true,
            },
            editable: true,
        },
        { field: 'onHand', valueGetter: quantityCalculator, filter: 'agNumberColumnFilter' },
        {
            field: 'incoming',
            cellEditor: 'agNumberCellEditor',
            filter: 'agNumberColumnFilter',
            cellEditorParams: {
                precision: 0,
                step: 1,
                showStepperButtons: true,
            },
            editable: true,
        },
        { field: 'actions', cellRenderer: ButtonCellRenderer },
    ],
    defaultColDef: {
        flex: 1,
    },
    rowSelection: 'multiple',
    autoSizeStrategy: {
        type: 'fitCellContents',
    },
    pagination: true,
    paginationPageSize: 10,
    paginationPageSizeSelector: [10, 20, 50],
};

function cellClass(params) {
    if (params.value === 'Active') {
        return 'rag-green';
    } else if (params.value === 'Out of Stock') {
        return 'rag-red';
    } else if (params.value === 'Paused') {
        return 'rag-amber';
    }
}
// Create Grid: Create new grid within the #myGrid div, using the Grid Options object
gridApi = agGrid.createGrid(document.querySelector('#myGrid'), gridOptions);

// Register the custom cell renderer
agGrid.Grid.registerCellRenderer('buttonRenderer', ButtonCellRenderer);
