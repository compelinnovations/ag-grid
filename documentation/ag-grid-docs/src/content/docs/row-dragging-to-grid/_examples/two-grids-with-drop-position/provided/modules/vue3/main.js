import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { ModuleRegistry } from '@ag-grid-community/core';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';
import { AgGridVue } from '@ag-grid-community/vue3';
import { createApp } from 'vue';

import './styles.css';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

let rowIdSequence = 100;

function createDataItem(color) {
    const obj = {
        id: rowIdSequence++,
        color: color,
        value1: Math.floor(Math.random() * 100),
        value2: Math.floor(Math.random() * 100),
    };

    return obj;
}

const createRowBlock = (blocks) =>
    Array.apply(null, Array(blocks || 1))
        .map(() => ['Red', 'Green', 'Blue'].map((color) => createDataItem(color)))
        .reduce((prev, curr) => prev.concat(curr), []);

const VueExample = {
    /* html */
    template: `<div class="example-wrapper">

            <div class="inner-col">
                <div class="toolbar">
                    <button class="factory factory-red" data-color="Red" data-side="left" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Red
                    </button>
                    <button class="factory factory-green" data-color="Green" data-side="left" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Green
                    </button>
                    <button class="factory factory-blue" data-color="Blue" data-side="left" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Blue
                    </button>
                </div>
                <div style="height: 100%;" class="inner-col" ref="eLeftGrid">
                    <ag-grid-vue
                        style="height: 100%;"
                        :class="themeClass"
                        :defaultColDef="defaultColDef"
                        :getRowId="getRowId"
                        :rowClassRules="rowClassRules"
                        :rowDragManaged="true"
                        :suppressMoveWhenRowDragging="true"
                        :rowData="leftRowData"
                        :columnDefs="columns"
                        @grid-ready="onGridReady($event, 'Left')"
                        >
                    </ag-grid-vue>
                </div>
            </div>

            <div class="inner-col vertical-toolbar">
                <span class="bin" ref="eBin">
                    <i class="far fa-trash-alt fa-3x" ref="eBinIcon"></i>
                </span>
            </div>

            <div class="inner-col">
                <div class="toolbar">
                    <button class="factory factory-red" data-color="Red" data-side="right" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Red
                    </button>
                    <button class="factory factory-green" data-color="Green" data-side="right" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Green
                    </button>
                    <button class="factory factory-blue" data-color="Blue" data-side="right" @click="onFactoryButtonClick($event)">
                        <i class="far fa-plus-square"></i>Add Blue
                    </button>
                </div>
                <div style="height: 100%;" class="inner-col" ref="eRightGrid">
                    <ag-grid-vue
                        style="height: 100%;"
                        :class="themeClass"
                        :defaultColDef="defaultColDef"
                        :getRowId="getRowId"
                        :rowClassRules="rowClassRules"
                        :rowDragManaged="true"
                        :suppressMoveWhenRowDragging="true"
                        :rowData="rightRowData"
                        :columnDefs="columns"
                        @grid-ready="onGridReady($event, 'Right')"
                        >
                    </ag-grid-vue>
                </div>
            </div>
        </div>
    `,
    components: {
        'ag-grid-vue': AgGridVue,
    },
    data: function () {
        return {
            leftRowData: [],
            rightRowData: [],
            leftApi: null,
            rightApi: null,
            rowClassRules: {
                'red-row': 'data.color == "Red"',
                'green-row': 'data.color == "Green"',
                'blue-row': 'data.color == "Blue"',
            },
            defaultColDef: {
                flex: 1,
                minWidth: 100,
                filter: true,
            },
            columns: [{ field: 'id', rowDrag: true }, { field: 'color' }, { field: 'value1' }, { field: 'value2' }],
            themeClass:
                /** DARK MODE START **/ document.documentElement.dataset.defaultTheme ||
                'ag-theme-quartz' /** DARK MODE END **/,
        };
    },
    beforeMount() {
        this.leftRowData = createRowBlock(2);
        this.rightRowData = createRowBlock(2);
    },
    methods: {
        getRowId(params) {
            return params.data.id;
        },

        onGridReady(params, side) {
            const api = params.api;
            if (side === 'Left') {
                this.leftApi = api;
            } else {
                this.rightApi = api;
            }

            if (this.leftApi && this.rightApi) {
                this.addBinZone(this.leftApi);
                this.addBinZone(this.rightApi);
                this.addGridDropZone('Left', this.leftApi);
                this.addGridDropZone('Right', this.rightApi);
            }
        },

        addRecordToGrid(side, data) {
            // if data missing or data has no it, do nothing
            if (!data || data.id == null) {
                return;
            }

            const api = side === 'left' ? this.leftApi : this.rightApi;
            // do nothing if row is already in the grid, otherwise we would have duplicates
            const rowAlreadyInGrid = !!api.getRowNode(data.id);
            let transaction;

            if (rowAlreadyInGrid) {
                console.log('not adding row to avoid duplicates in the grid');
                return;
            }

            transaction = {
                add: [data],
            };

            api.applyTransaction(transaction);
        },

        onFactoryButtonClick(e) {
            var button = e.currentTarget,
                buttonColor = button.getAttribute('data-color'),
                side = button.getAttribute('data-side'),
                data = createDataItem(buttonColor);

            this.addRecordToGrid(side, data);
        },

        binDrop(data) {
            // if data missing or data has no id, do nothing
            if (!data || data.id == null) {
                return;
            }

            var transaction = {
                remove: [data],
            };

            [this.leftApi, this.rightApi].forEach((api) => {
                var rowsInGrid = !!api.getRowNode(data.id);

                if (rowsInGrid) {
                    api.applyTransaction(transaction);
                }
            });
        },

        addBinZone(api) {
            const dropZone = {
                getContainer: () => this.$refs.eBinIcon,
                onDragEnter: () => {
                    this.$refs.eBin.style.color = 'blue';
                    this.$refs.eBinIcon.style.transform = 'scale(1.5)';
                },
                onDragLeave: () => {
                    this.$refs.eBin.style = '';
                    this.$refs.eBinIcon.style.transform = 'scale(1)';
                },
                onDragStop: (params) => {
                    this.binDrop(params.node.data);
                    this.$refs.eBin.style = '';
                    this.$refs.eBinIcon.style.transform = 'scale(1)';
                },
            };

            api.addRowDropZone(dropZone);
        },

        addGridDropZone(side, api) {
            const dropApi = side === 'Left' ? this.rightApi : this.leftApi;
            const dropZone = dropApi.getRowDropZoneParams();

            api.addRowDropZone(dropZone);
        },
    },
};

createApp(VueExample).mount('#app');
