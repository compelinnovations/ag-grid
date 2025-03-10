import type { NamedBean } from '../context/bean';
import { BeanStub } from '../context/beanStub';
import type { BeanCollection, Context } from '../context/context';
import type { AgColumn } from '../entities/agColumn';
import { type AgProvidedColumnGroup } from '../entities/agProvidedColumnGroup';
import type { AbstractColDef, ColDef, ColGroupDef } from '../entities/colDef';
import type { ColumnEventType } from '../events';
import { _areEqual } from '../utils/array';
import { _exists } from '../utils/generic';
import type { ColumnFactory } from './columnFactory';
import type { ColKey, ColumnCollections, ColumnModel } from './columnModel';
import { destroyColumnTree, getColumnsFromTree } from './columnUtils';
import type { VisibleColsService } from './visibleColsService';

export class PivotResultColsService extends BeanStub implements NamedBean {
    beanName = 'pivotResultColsService' as const;

    private context: Context;
    private columnModel: ColumnModel;
    private columnFactory: ColumnFactory;
    private visibleColsService: VisibleColsService;

    public wireBeans(beans: BeanCollection): void {
        this.context = beans.context;
        this.columnModel = beans.columnModel;
        this.columnFactory = beans.columnFactory;
        this.visibleColsService = beans.visibleColsService;
    }

    // if pivoting, these are the generated columns as a result of the pivot
    private pivotResultCols: ColumnCollections | null;

    // private pivotResultColTree: IProvidedColumn[] | null;
    // private pivotResultColTreeDept = -1;
    // private pivotResultCols_old: Column[] | null;
    // private pivotResultColsMap: { [id: string]: Column };

    // Saved when pivot is disabled, available to re-use when pivot is restored
    private previousPivotResultCols: (AgColumn | AgProvidedColumnGroup)[] | null;

    public override destroy(): void {
        destroyColumnTree(this.context, this.pivotResultCols?.tree);
        super.destroy();
    }

    public isPivotResultColsPresent(): boolean {
        return this.pivotResultCols != null;
    }

    public lookupPivotResultCol(pivotKeys: string[], valueColKey: ColKey): AgColumn | null {
        if (this.pivotResultCols == null) {
            return null;
        }

        const valueColumnToFind = this.columnModel.getColDefCol(valueColKey);

        let foundColumn: AgColumn | null = null;

        this.pivotResultCols.list.forEach((column) => {
            const thisPivotKeys = column.getColDef().pivotKeys;
            const pivotValueColumn = column.getColDef().pivotValueColumn;

            const pivotKeyMatches = _areEqual(thisPivotKeys, pivotKeys);
            const pivotValueMatches = pivotValueColumn === valueColumnToFind;

            if (pivotKeyMatches && pivotValueMatches) {
                foundColumn = column;
            }
        });

        return foundColumn;
    }

    public getPivotResultCols(): ColumnCollections | null {
        return this.pivotResultCols;
    }

    public getPivotResultCol(key: ColKey): AgColumn | null {
        if (!this.pivotResultCols) {
            return null;
        }
        return this.columnModel.getColFromCollection(key, this.pivotResultCols);
    }

    public setPivotResultCols(colDefs: (ColDef | ColGroupDef)[] | null, source: ColumnEventType): void {
        if (!this.columnModel.isReady()) {
            return;
        }

        // if no cols passed, and we had no cols anyway, then do nothing
        if (colDefs == null && this.pivotResultCols == null) {
            return;
        }

        if (colDefs) {
            this.processPivotResultColDef(colDefs);
            const balancedTreeResult = this.columnFactory.createColumnTree(
                colDefs,
                false,
                this.pivotResultCols?.tree || this.previousPivotResultCols || undefined,
                source
            );
            destroyColumnTree(this.context, this.pivotResultCols?.tree, balancedTreeResult.columnTree);

            const tree = balancedTreeResult.columnTree;
            const treeDepth = balancedTreeResult.treeDept;
            const list = getColumnsFromTree(tree);
            const map = {};

            this.pivotResultCols = { tree, treeDepth, list, map };
            this.pivotResultCols.list.forEach((col) => (this.pivotResultCols!.map[col.getId()] = col));
            this.previousPivotResultCols = null;
        } else {
            this.previousPivotResultCols = this.pivotResultCols ? this.pivotResultCols.tree : null;
            this.pivotResultCols = null;
        }

        this.columnModel.refreshCols();
        this.visibleColsService.refresh(source);
    }

    private processPivotResultColDef(colDefs: (ColDef | ColGroupDef)[] | null) {
        const columnCallback = this.gos.get('processPivotResultColDef');
        const groupCallback = this.gos.get('processPivotResultColGroupDef');

        if (!columnCallback && !groupCallback) {
            return undefined;
        }

        const searchForColDefs = (colDefs2: (ColDef | ColGroupDef)[]): void => {
            colDefs2.forEach((abstractColDef: AbstractColDef) => {
                const isGroup = _exists((abstractColDef as any).children);
                if (isGroup) {
                    const colGroupDef = abstractColDef as ColGroupDef;
                    if (groupCallback) {
                        groupCallback(colGroupDef);
                    }
                    searchForColDefs(colGroupDef.children);
                } else {
                    const colDef = abstractColDef as ColDef;
                    if (columnCallback) {
                        columnCallback(colDef);
                    }
                }
            });
        };

        if (colDefs) {
            searchForColDefs(colDefs);
        }
    }
}
