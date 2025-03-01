import type {
    AgColumn,
    AgColumnGroup,
    BeanCollection,
    ColumnModel,
    IAggFunc,
    IAggregationStage,
    IClientSideRowModel,
    IRowModel,
    PartialCellRange,
    PivotResultColsService,
    RowNode,
    RowNodeSorter,
    SortController,
    ValueService,
} from '@ag-grid-community/core';
import { BeanStub, ModuleNames, ModuleRegistry, _includes, _last, _values } from '@ag-grid-community/core';

import type { ColState } from '../model/chartDataModel';
import { ChartDataModel } from '../model/chartDataModel';

export interface ChartDatasourceParams {
    dimensionCols: ColState[];
    grouping: boolean;
    pivoting: boolean;
    crossFiltering: boolean;
    valueCols: AgColumn[];
    startRow: number;
    endRow: number;
    isScatter: boolean;
    aggFunc?: string | IAggFunc;
    referenceCellRange?: PartialCellRange;
}

interface IData {
    chartData: any[];
    columnNames: { [key: string]: string[] };
    groupChartData?: any[];
}

export class ChartDatasource extends BeanStub {
    private gridRowModel: IRowModel;
    private pivotResultColsService: PivotResultColsService;
    private valueService: ValueService;
    private columnModel: ColumnModel;
    private rowNodeSorter: RowNodeSorter;
    private sortController: SortController;
    private aggregationStage?: IAggregationStage;

    public wireBeans(beans: BeanCollection): void {
        this.sortController = beans.sortController;
        this.gridRowModel = beans.rowModel;
        this.columnModel = beans.columnModel;
        this.valueService = beans.valueService;
        this.pivotResultColsService = beans.pivotResultColsService;
        this.rowNodeSorter = beans.rowNodeSorter;
        this.aggregationStage = beans.aggregationStage;
    }

    public getData(params: ChartDatasourceParams): IData {
        if (params.crossFiltering) {
            if (params.grouping) {
                console.warn('AG Grid: crossing filtering with row grouping is not supported.');
                return { chartData: [], columnNames: {} };
            }

            if (!this.gos.isRowModelType('clientSide')) {
                console.warn('AG Grid: crossing filtering is only supported in the client side row model.');
                return { chartData: [], columnNames: {} };
            }
        }

        const isServerSide = this.gos.isRowModelType('serverSide');
        if (isServerSide && params.pivoting) {
            this.updatePivotKeysForSSRM();
        }

        const result = this.extractRowsFromGridRowModel(params);
        result.chartData = this.aggregateRowsByDimension(params, result.chartData);
        return result;
    }

    private extractRowsFromGridRowModel(params: ChartDatasourceParams): IData {
        const { crossFiltering, startRow, endRow, valueCols, dimensionCols, grouping } = params;
        let extractedRowData: any[] = [];
        const columnNames: { [key: string]: string[] } = {};

        // maps used to keep track of expanded groups that need to be removed
        const groupNodeIndexes: { [key: string]: number } = {};
        const groupsToRemove: { [key: string]: number } = {};

        // only used when cross filtering
        let filteredNodes: { [key: string]: RowNode } = {};
        let allRowNodes: RowNode[] = [];

        let numRows;
        if (crossFiltering) {
            filteredNodes = this.getFilteredRowNodes();
            allRowNodes = this.getAllRowNodes();
            numRows = allRowNodes.length;
        } else {
            // make sure enough rows in range to chart. if user filters and less rows, then end row will be
            // the last displayed row, not where the range ends.
            const modelLastRow = this.gridRowModel.getRowCount() - 1;
            // inclusivity is wrong for end row, so can't detect 0 rows properly
            const hasNoRange =
                startRow === endRow && startRow === 0 && dimensionCols.length === 0 && valueCols.length === 0;
            if (hasNoRange) {
                numRows = 0;
            } else {
                const rangeLastRow = endRow >= 0 ? Math.min(endRow, modelLastRow) : modelLastRow;
                numRows = rangeLastRow - startRow + 1;
            }
        }

        if (numRows > 0) {
            valueCols.forEach((col) => {
                let columnNamesArr: string[] = [];

                // pivot keys should be added first
                const pivotKeys = col.getColDef().pivotKeys;
                if (pivotKeys) {
                    columnNamesArr = pivotKeys.slice();
                }

                // then add column header name to results
                const headerName = col.getColDef().headerName;
                if (headerName) {
                    columnNamesArr.push(headerName);
                }

                // add array of column names to results
                if (columnNamesArr.length > 0) {
                    columnNames[col.getId()] = columnNamesArr;
                }
            });
        }

        let numRemovedNodes = 0;

        for (let i = 0; i < numRows; i++) {
            const rowNode = crossFiltering ? allRowNodes[i] : this.gridRowModel.getRow(i + startRow)!;

            if (rowNode.footer) {
                numRemovedNodes++;
                continue;
            }

            const data: any = {};
            // first get data for dimensions columns
            dimensionCols.forEach((col) => {
                const colId = col.colId;
                const column = this.columnModel.getCol(colId);

                if (column) {
                    const valueObject = this.valueService.getValue(column, rowNode);

                    // when grouping we also need to build up multi category labels for charts
                    if (grouping) {
                        const valueString = valueObject && valueObject.toString ? String(valueObject.toString()) : '';

                        // traverse parents to extract group label path
                        const labels = ChartDatasource.getGroupLabels(rowNode, valueString);

                        data[colId] = {
                            labels,
                            toString: function () {
                                return this.labels
                                    .filter((l: string) => !!l)
                                    .reverse()
                                    .join(' - ');
                            },
                        };

                        // keep track of group node indexes, so they can be padded when other groups are expanded
                        if (rowNode.group) {
                            groupNodeIndexes[labels.toString()] = i - numRemovedNodes;
                        }

                        // if node (group or leaf) has parents then it is expanded and should be removed
                        const groupKey = labels.slice(1, labels.length).toString();

                        if (groupKey) {
                            groupsToRemove[groupKey] = groupNodeIndexes[groupKey];
                        }
                    } else {
                        // leaf nodes can be directly added to dimension columns
                        data[colId] = valueObject;
                    }
                } else {
                    // introduce a default category when no dimensions exist with a value based off row index (+1)
                    data[ChartDataModel.DEFAULT_CATEGORY] = i + 1;
                }
            });

            // then get data for value columns
            valueCols.forEach((col) => {
                const colId = col.getColId();
                if (crossFiltering) {
                    const filteredOutColId = colId + '-filtered-out';

                    // add data value to value column
                    const value = this.valueService.getValue(col, rowNode);
                    const actualValue =
                        value != null && typeof value.toNumber === 'function' ? value.toNumber() : value;

                    if (filteredNodes[rowNode.id as string]) {
                        data[colId] = actualValue;
                        data[filteredOutColId] = params.aggFunc || params.isScatter ? undefined : 0;
                    } else {
                        data[colId] = params.aggFunc || params.isScatter ? undefined : 0;
                        data[filteredOutColId] = actualValue;
                    }
                } else {
                    // add data value to value column
                    let value = this.valueService.getValue(col, rowNode);

                    // aggregated value
                    if (value && Object.prototype.hasOwnProperty.call(value, 'toString')) {
                        value = parseFloat(value.toString());
                    }

                    data[colId] = value != null && typeof value.toNumber === 'function' ? value.toNumber() : value;
                }
            });

            // add data to results
            extractedRowData.push(data);
        }

        let groupChartData: any[] | undefined;
        if (grouping) {
            const groupIndexesToRemove = _values(groupsToRemove);
            const allData = extractedRowData;
            extractedRowData = [];
            groupChartData = [];
            for (let i = 0; i < allData.length; i++) {
                (_includes(groupIndexesToRemove, i) ? groupChartData : extractedRowData).push(allData[i]);
            }
        }

        return { chartData: extractedRowData, columnNames, groupChartData };
    }

    private aggregateRowsByDimension(params: ChartDatasourceParams, dataFromGrid: any[]): any[] {
        const dimensionCols = params.dimensionCols;

        if (!params.aggFunc || dimensionCols.length === 0) {
            return dataFromGrid;
        }

        const lastCol = _last(dimensionCols);
        const lastColId = lastCol && lastCol.colId;
        const map: any = {};
        const dataAggregated: any[] = [];

        dataFromGrid.forEach((data) => {
            let currentMap = map;

            dimensionCols.forEach((col) => {
                const colId = col.colId;
                const key = data[colId];

                if (colId === lastColId) {
                    let groupItem = currentMap[key];

                    if (!groupItem) {
                        groupItem = { __children: [] };

                        dimensionCols.forEach((dimCol) => {
                            const dimColId = dimCol.colId;
                            groupItem[dimColId] = data[dimColId];
                        });

                        currentMap[key] = groupItem;
                        dataAggregated.push(groupItem);
                    }

                    groupItem.__children.push(data);
                } else {
                    // map of maps
                    if (!currentMap[key]) {
                        currentMap[key] = {};
                    }

                    currentMap = currentMap[key];
                }
            });
        });

        if (ModuleRegistry.__assertRegistered(ModuleNames.RowGroupingModule, 'Charting Aggregation', this.gridId)) {
            const aggStage = this.aggregationStage!;
            dataAggregated.forEach((groupItem) =>
                params.valueCols.forEach((col) => {
                    if (params.crossFiltering) {
                        params.valueCols.forEach((valueCol) => {
                            const colId = valueCol.getColId();

                            // filtered data
                            const dataToAgg = groupItem.__children
                                .filter((child: any) => typeof child[colId] !== 'undefined')
                                .map((child: any) => child[colId]);

                            const aggResult: any = aggStage.aggregateValues(dataToAgg, params.aggFunc!);
                            groupItem[valueCol.getId()] =
                                aggResult && typeof aggResult.value !== 'undefined' ? aggResult.value : aggResult;

                            // filtered out data
                            const filteredOutColId = `${colId}-filtered-out`;
                            const dataToAggFiltered = groupItem.__children
                                .filter((child: any) => typeof child[filteredOutColId] !== 'undefined')
                                .map((child: any) => child[filteredOutColId]);

                            const aggResultFiltered: any = aggStage.aggregateValues(dataToAggFiltered, params.aggFunc!);
                            groupItem[filteredOutColId] =
                                aggResultFiltered && typeof aggResultFiltered.value !== 'undefined'
                                    ? aggResultFiltered.value
                                    : aggResultFiltered;
                        });
                    } else {
                        const dataToAgg = groupItem.__children.map((child: any) => child[col.getId()]);
                        const aggResult = aggStage.aggregateValues(dataToAgg, params.aggFunc!);

                        groupItem[col.getId()] =
                            aggResult && typeof aggResult.value !== 'undefined' ? aggResult.value : aggResult;
                    }
                })
            );
        }

        return dataAggregated;
    }

    private updatePivotKeysForSSRM() {
        const secondaryColumns = this.pivotResultColsService.getPivotResultCols()?.list;

        if (!secondaryColumns) {
            return;
        }

        // we don't know what the application will use for the pivot key separator (i.e. '_' or '|' ) as the
        // secondary columns are provided to grid by the application via api.setSecondaryColumns()
        const pivotKeySeparator = this.extractPivotKeySeparator(secondaryColumns);

        // `pivotKeys` is not used by the SSRM for pivoting, so it is safe to reuse this colDef property. This way
        // the same logic can be used for CSRM and SSRM to extract legend names in extractRowsFromGridRowModel()
        secondaryColumns.forEach((col) => {
            if (pivotKeySeparator === '') {
                col.getColDef().pivotKeys = [];
            } else {
                const keys = col.getColId().split(pivotKeySeparator);
                col.getColDef().pivotKeys = keys.slice(0, keys.length - 1);
            }
        });
    }

    private extractPivotKeySeparator(secondaryColumns: AgColumn[]) {
        if (secondaryColumns.length === 0) {
            return '';
        }

        const extractSeparator = (columnGroup: AgColumnGroup, childId: string): string => {
            const groupId = columnGroup.getGroupId();
            if (!columnGroup.getParent()) {
                // removing groupId ('2000') from childId ('2000|Swimming') yields '|Swimming' so first char is separator
                return childId.split(groupId)[1][0];
            }
            return extractSeparator(columnGroup.getParent()!, groupId);
        };

        const firstSecondaryCol = secondaryColumns[0];
        if (firstSecondaryCol.getParent() == null) {
            return '';
        }
        return extractSeparator(firstSecondaryCol.getParent()!, firstSecondaryCol.getColId());
    }

    private static getGroupLabels(rowNode: RowNode | null, initialLabel: string): string[] {
        const labels = [initialLabel];
        while (rowNode && rowNode.level !== 0) {
            rowNode = rowNode.parent;
            if (rowNode) {
                labels.push(rowNode.key!);
            }
        }
        return labels;
    }

    private getFilteredRowNodes() {
        const filteredNodes: { [key: string]: RowNode } = {};
        (this.gridRowModel as IClientSideRowModel).forEachNodeAfterFilterAndSort((rowNode: RowNode) => {
            filteredNodes[rowNode.id as string] = rowNode;
        });
        return filteredNodes;
    }

    private getAllRowNodes() {
        const allRowNodes: RowNode[] = [];
        this.gridRowModel.forEachNode((rowNode: RowNode) => {
            allRowNodes.push(rowNode);
        });
        return this.sortRowNodes(allRowNodes);
    }

    private sortRowNodes(rowNodes: RowNode[]): RowNode[] {
        const sortOptions = this.sortController.getSortOptions();
        const noSort = !sortOptions || sortOptions.length == 0;
        if (noSort) return rowNodes;
        return this.rowNodeSorter.doFullSort(rowNodes, sortOptions);
    }
}
