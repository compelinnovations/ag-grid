import type {
    AgColumn,
    FuncColsService,
    GetDataPath,
    IClientSideRowModel,
    RowNode,
    SetFilterParams,
    ValueService,
} from '@ag-grid-community/core';
import { AgPromise, Events, _makeNull, _toStringOrNull } from '@ag-grid-community/core';

/** @param V type of value in the Set Filter */
export class ClientSideValuesExtractor<V> {
    constructor(
        private readonly rowModel: IClientSideRowModel,
        private readonly filterParams: SetFilterParams<any, V>,
        private readonly createKey: (value: V | null | undefined, node?: RowNode) => string | null,
        private readonly caseFormat: <T extends string | null>(valueToFormat: T) => typeof valueToFormat,
        private readonly funcColsService: FuncColsService,
        private readonly valueService: ValueService,
        private readonly treeDataOrGrouping: boolean,
        private readonly treeData: boolean,
        private readonly getDataPath: GetDataPath | undefined,
        private readonly groupAllowUnbalanced: boolean,
        private readonly addManagedListener: (
            event: string,
            listener: (event?: any) => void
        ) => (() => null) | undefined
    ) {}

    public extractUniqueValuesAsync(
        predicate: (node: RowNode) => boolean,
        existingValues?: Map<string | null, V | null>
    ): AgPromise<Map<string | null, V | null>> {
        return new AgPromise((resolve) => {
            if (this.rowModel.isRowDataLoaded()) {
                resolve(this.extractUniqueValues(predicate, existingValues));
            } else {
                const destroyFunc = this.addManagedListener(Events.EVENT_ROW_COUNT_READY, () => {
                    destroyFunc?.();
                    resolve(this.extractUniqueValues(predicate, existingValues));
                });
            }
        });
    }

    public extractUniqueValues(
        predicate: (node: RowNode) => boolean,
        existingValues?: Map<string | null, V | null>
    ): Map<string | null, V | null> {
        const values: Map<string | null, V | null> = new Map();
        const existingFormattedKeys = this.extractExistingFormattedKeys(existingValues);
        const formattedKeys: Set<string | null> = new Set();
        const treeData = this.treeData && !!this.getDataPath;
        const groupedCols = this.funcColsService.getRowGroupColumns();

        const addValue = (unformattedKey: string | null, value: V | null | undefined) => {
            const formattedKey = this.caseFormat(unformattedKey);
            if (!formattedKeys.has(formattedKey)) {
                formattedKeys.add(formattedKey);
                let keyToAdd = unformattedKey;
                let valueToAdd = _makeNull(value);
                // when case insensitive, we pick the first value to use. if this is later filtered out,
                // we still want to use the original value and not one with a different case
                const existingUnformattedKey = existingFormattedKeys?.get(formattedKey);
                if (existingUnformattedKey != null) {
                    keyToAdd = existingUnformattedKey;
                    valueToAdd = existingValues!.get(existingUnformattedKey)!;
                }
                values.set(keyToAdd, valueToAdd);
            }
        };

        this.rowModel.forEachLeafNode((node) => {
            // only pull values from rows that have data. this means we skip filler group nodes.
            if (!node.data || !predicate(node)) {
                return;
            }
            if (this.treeDataOrGrouping) {
                this.addValueForTreeDataOrGrouping(node, treeData, groupedCols, addValue);
                return;
            }

            const value = this.getValue(node);

            if (value != null && Array.isArray(value)) {
                value.forEach((x) => {
                    addValue(this.createKey(x, node), x);
                });
                if (value.length === 0) {
                    addValue(null, null);
                }
            } else {
                addValue(this.createKey(value, node), value);
            }
        });

        return values;
    }

    private addValueForTreeDataOrGrouping(
        node: RowNode,
        treeData: boolean,
        groupedCols: AgColumn[],
        addValue: (unformattedKey: string | null, value: V | null) => void
    ): void {
        let dataPath: string[] | null;
        if (treeData) {
            if (node.childrenAfterGroup?.length) {
                return;
            }
            dataPath = this.getDataPath!(node.data);
        } else {
            dataPath = groupedCols.map((groupCol) => this.valueService.getKeyForNode(groupCol, node));
            dataPath.push(this.getValue(node) as any);
        }
        if (dataPath) {
            dataPath = dataPath.map((treeKey) => _toStringOrNull(_makeNull(treeKey))) as any;
        }
        if (!treeData && this.groupAllowUnbalanced && dataPath?.some((treeKey) => treeKey == null)) {
            dataPath = dataPath.filter((treeKey) => treeKey != null);
        }
        addValue(this.createKey(dataPath as any), dataPath as any);
    }

    private getValue(node: RowNode): V | null | undefined {
        return this.filterParams.getValue(node);
    }

    private extractExistingFormattedKeys(
        existingValues?: Map<string | null, V | null>
    ): Map<string | null, string | null> | null {
        if (!existingValues) {
            return null;
        }
        const existingFormattedKeys: Map<string | null, string | null> = new Map();
        existingValues.forEach((_value, key) => {
            existingFormattedKeys.set(this.caseFormat(key), key);
        });
        return existingFormattedKeys;
    }
}
