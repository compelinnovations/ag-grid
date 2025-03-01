import type {
    BaseCellDataType,
    BeanCollection,
    DragSource,
    FieldPickerValueSelectedEvent,
    FieldValueEvent,
} from '@ag-grid-community/core';
import {
    DragAndDropService,
    DragSourceType,
    Events,
    KeyCode,
    RefPlaceholder,
    TabGuardComp,
    TooltipFeature,
    _createIconNoSpan,
    _removeAriaExpanded,
    _setAriaDisabled,
    _setAriaExpanded,
    _setAriaLabel,
    _setAriaLevel,
    _setDisplayed,
    _setVisible,
    _stopPropagationForAgGrid,
} from '@ag-grid-community/core';

import type { AdvancedFilterExpressionService } from '../advancedFilterExpressionService';
import type { AutocompleteEntry } from '../autocomplete/autocompleteParams';
import { AddDropdownComp } from './addDropdownComp';
import type { AdvancedFilterBuilderDragStartedEvent } from './advancedFilterBuilderDragFeature';
import { AdvancedFilterBuilderDragFeature } from './advancedFilterBuilderDragFeature';
import { AdvancedFilterBuilderItemNavigationFeature } from './advancedFilterBuilderItemNavigationFeature';
import { getAdvancedFilterBuilderAddButtonParams } from './advancedFilterBuilderUtils';
import { ConditionPillWrapperComp } from './conditionPillWrapperComp';
import type {
    AdvancedFilterBuilderAddEvent,
    AdvancedFilterBuilderItem,
    AdvancedFilterBuilderMoveEvent,
    AdvancedFilterBuilderRemoveEvent,
    CreatePillParams,
} from './iAdvancedFilterBuilder';
import { AdvancedFilterBuilderEvents } from './iAdvancedFilterBuilder';
import { InputPillComp } from './inputPillComp';
import { JoinPillWrapperComp } from './joinPillWrapperComp';
import { SelectPillComp } from './selectPillComp';

export class AdvancedFilterBuilderItemComp extends TabGuardComp {
    private dragAndDropService: DragAndDropService;
    private advancedFilterExpressionService: AdvancedFilterExpressionService;

    public wireBeans(beans: BeanCollection): void {
        this.dragAndDropService = beans.dragAndDropService;
        this.advancedFilterExpressionService = beans.advancedFilterExpressionService;
    }

    private readonly eTreeLines: HTMLElement = RefPlaceholder;
    private readonly eDragHandle: HTMLElement = RefPlaceholder;
    private readonly eButtons: HTMLElement = RefPlaceholder;
    private readonly eValidation: HTMLElement = RefPlaceholder;
    private readonly eMoveUpButton: HTMLElement = RefPlaceholder;
    private readonly eMoveDownButton: HTMLElement = RefPlaceholder;
    private readonly eAddButton: HTMLElement = RefPlaceholder;
    private readonly eRemoveButton: HTMLElement = RefPlaceholder;

    private ePillWrapper: JoinPillWrapperComp | ConditionPillWrapperComp;
    private validationTooltipFeature: TooltipFeature;
    private moveUpDisabled: boolean = false;
    private moveDownDisabled: boolean = false;
    private moveUpTooltipFeature: TooltipFeature;
    private moveDownTooltipFeature: TooltipFeature;

    constructor(
        private readonly item: AdvancedFilterBuilderItem,
        private readonly dragFeature: AdvancedFilterBuilderDragFeature,
        private readonly focusWrapper: HTMLElement
    ) {
        super(/* html */ `
            <div class="ag-advanced-filter-builder-item-wrapper" role="presentation">
                <div class="ag-advanced-filter-builder-item" role="presentation">
                    <div data-ref="eTreeLines" class="ag-advanced-filter-builder-item-tree-lines" aria-hidden="true"></div>
                    <span data-ref="eDragHandle" class="ag-drag-handle" aria-hidden="true"></span>
                    <span data-ref="eValidation" class="ag-advanced-filter-builder-item-button ag-advanced-filter-builder-invalid" aria-hidden="true"></span>
                </div>
                <div data-ref="eButtons" class="ag-advanced-filter-builder-item-buttons">
                    <span data-ref="eMoveUpButton" class="ag-advanced-filter-builder-item-button" role="button"></span>
                    <span data-ref="eMoveDownButton" class="ag-advanced-filter-builder-item-button" role="button"></span>
                    <div data-ref="eAddButton" role="presentation"></div>
                    <span data-ref="eRemoveButton" class="ag-advanced-filter-builder-item-button" role="button"></span>
                </div>
            </div>
        `);
    }

    public postConstruct(): void {
        const { filterModel, level, showMove } = this.item;

        const isJoin = filterModel!.filterType === 'join';
        this.ePillWrapper = this.createManagedBean(isJoin ? new JoinPillWrapperComp() : new ConditionPillWrapperComp());
        this.ePillWrapper.init({ item: this.item, createPill: (params: CreatePillParams) => this.createPill(params) });
        this.eDragHandle.insertAdjacentElement('afterend', this.ePillWrapper.getGui());

        if (level === 0) {
            const eTreeLine = document.createElement('div');
            eTreeLine.classList.add('ag-advanced-filter-builder-item-tree-line-vertical-bottom');
            eTreeLine.classList.add('ag-advanced-filter-builder-item-tree-line-root');
            this.eTreeLines.appendChild(eTreeLine);

            _setDisplayed(this.eDragHandle, false);
            _setDisplayed(this.eButtons, false);
            _setAriaExpanded(this.focusWrapper, true);
        } else {
            this.setupTreeLines(level);

            this.eDragHandle.appendChild(_createIconNoSpan('advancedFilterBuilderDrag', this.gos)!);
            this.setupValidation();
            this.setupMoveButtons(showMove);
            this.setupAddButton();
            this.setupRemoveButton();

            this.setupDragging();
            this.updateAriaExpanded();
        }

        _setAriaLevel(this.focusWrapper, level + 1);

        this.initialiseTabGuard({});

        this.createManagedBean(
            new AdvancedFilterBuilderItemNavigationFeature(this.getGui(), this.focusWrapper, this.ePillWrapper)
        );

        this.updateAriaLabel();

        this.addManagedListener(this.ePillWrapper, AdvancedFilterBuilderEvents.EVENT_VALUE_CHANGED, () =>
            this.dispatchEvent({
                type: AdvancedFilterBuilderEvents.EVENT_VALUE_CHANGED,
            })
        );
        this.addManagedListener(this.ePillWrapper, AdvancedFilterBuilderEvents.EVENT_VALID_CHANGED, () =>
            this.updateValidity()
        );
    }

    public setState(params: {
        disableMoveUp?: boolean;
        disableMoveDown?: boolean;
        treeLines: boolean[];
        showStartTreeLine: boolean;
    }): void {
        const { level } = this.item;
        if (level === 0) {
            return;
        }
        const { showMove } = this.item;
        const { disableMoveUp, disableMoveDown, treeLines, showStartTreeLine } = params;
        this.updateTreeLines(treeLines, showStartTreeLine);
        this.updateAriaExpanded();
        if (showMove) {
            this.moveUpDisabled = !!disableMoveUp;
            this.moveDownDisabled = !!disableMoveDown;
            this.eMoveUpButton.classList.toggle('ag-advanced-filter-builder-item-button-disabled', disableMoveUp);
            this.eMoveDownButton.classList.toggle('ag-advanced-filter-builder-item-button-disabled', disableMoveDown);
            _setAriaDisabled(this.eMoveUpButton, !!disableMoveUp);
            _setAriaDisabled(this.eMoveDownButton, !!disableMoveDown);
            this.moveUpTooltipFeature.refreshToolTip();
            this.moveDownTooltipFeature.refreshToolTip();
        }
    }

    public focusMoveButton(backwards: boolean): void {
        (backwards ? this.eMoveUpButton : this.eMoveDownButton).focus();
    }

    public afterAdd(): void {
        this.ePillWrapper.getFocusableElement().focus();
    }

    private setupTreeLines(level: number): void {
        for (let i = 0; i < level; i++) {
            const eTreeLine = document.createElement('div');
            this.eTreeLines.appendChild(eTreeLine);
        }
    }

    private updateTreeLines(treeLines: boolean[], showStartTreeLine: boolean): void {
        const lastTreeLineIndex = treeLines.length - 1;
        const { children } = this.eTreeLines;
        for (let i = 0; i < lastTreeLineIndex; i++) {
            const eTreeLine = children.item(i);
            if (eTreeLine) {
                eTreeLine.classList.toggle('ag-advanced-filter-builder-item-tree-line-vertical', !treeLines[i]);
            }
        }
        const eTreeLine = children.item(lastTreeLineIndex);
        if (eTreeLine) {
            eTreeLine.classList.add('ag-advanced-filter-builder-item-tree-line-horizontal');
            const isLastChild = treeLines[lastTreeLineIndex];
            eTreeLine.classList.toggle('ag-advanced-filter-builder-item-tree-line-vertical-top', isLastChild);
            eTreeLine.classList.toggle('ag-advanced-filter-builder-item-tree-line-vertical', !isLastChild);
        }
        this.eDragHandle.classList.toggle(
            'ag-advanced-filter-builder-item-tree-line-vertical-bottom',
            showStartTreeLine
        );
    }

    private setupValidation(): void {
        this.eValidation.appendChild(_createIconNoSpan('advancedFilterBuilderInvalid', this.gos)!);
        this.validationTooltipFeature = this.createManagedBean(
            new TooltipFeature({
                getGui: () => this.eValidation,
                getLocation: () => 'advancedFilter',
                getTooltipValue: () => this.ePillWrapper.getValidationMessage(),
                getTooltipShowDelayOverride: () => 1000,
            })
        );
        this.updateValidity();
    }

    private setupAddButton(): void {
        const addButtonParams = getAdvancedFilterBuilderAddButtonParams(
            (key) => this.advancedFilterExpressionService.translate(key),
            this.gos.get('advancedFilterBuilderParams')?.addSelectWidth
        );
        const eAddButton = this.createManagedBean(new AddDropdownComp(addButtonParams));
        this.addManagedListener(
            eAddButton,
            Events.EVENT_FIELD_PICKER_VALUE_SELECTED,
            ({ value }: FieldPickerValueSelectedEvent) =>
                this.dispatchEvent<AdvancedFilterBuilderAddEvent>({
                    type: AdvancedFilterBuilderEvents.EVENT_ADDED,
                    item: this.item,
                    isJoin: value.key === 'join',
                })
        );
        this.eAddButton.appendChild(eAddButton.getGui());

        this.createManagedBean(
            new TooltipFeature({
                getGui: () => this.eAddButton,
                getLocation: () => 'advancedFilter',
                getTooltipValue: () =>
                    this.advancedFilterExpressionService.translate('advancedFilterBuilderAddButtonTooltip'),
            })
        );
    }

    private setupRemoveButton(): void {
        this.eRemoveButton.appendChild(_createIconNoSpan('advancedFilterBuilderRemove', this.gos)!);
        this.addManagedListener(this.eRemoveButton, 'click', () => this.removeItem());
        this.addManagedListener(this.eRemoveButton, 'keydown', (event: KeyboardEvent) => {
            switch (event.key) {
                case KeyCode.ENTER:
                    event.preventDefault();
                    _stopPropagationForAgGrid(event);
                    this.removeItem();
                    break;
            }
        });

        this.createManagedBean(
            new TooltipFeature({
                getGui: () => this.eRemoveButton,
                getLocation: () => 'advancedFilter',
                getTooltipValue: () =>
                    this.advancedFilterExpressionService.translate('advancedFilterBuilderRemoveButtonTooltip'),
            })
        );
        _setAriaLabel(
            this.eRemoveButton,
            this.advancedFilterExpressionService.translate('advancedFilterBuilderRemoveButtonTooltip')
        );

        this.activateTabIndex([this.eRemoveButton]);
    }

    private setupMoveButtons(showMove?: boolean): void {
        if (showMove) {
            this.eMoveUpButton.appendChild(_createIconNoSpan('advancedFilterBuilderMoveUp', this.gos)!);
            this.addManagedListener(this.eMoveUpButton, 'click', () => this.moveItem(true));
            this.addManagedListener(this.eMoveUpButton, 'keydown', (event: KeyboardEvent) => {
                switch (event.key) {
                    case KeyCode.ENTER:
                        event.preventDefault();
                        _stopPropagationForAgGrid(event);
                        this.moveItem(true);
                        break;
                }
            });

            this.moveUpTooltipFeature = this.createManagedBean(
                new TooltipFeature({
                    getGui: () => this.eMoveUpButton,
                    getLocation: () => 'advancedFilter',
                    getTooltipValue: () =>
                        this.moveUpDisabled
                            ? null
                            : this.advancedFilterExpressionService.translate(
                                  'advancedFilterBuilderMoveUpButtonTooltip'
                              ),
                })
            );
            _setAriaLabel(
                this.eMoveUpButton,
                this.advancedFilterExpressionService.translate('advancedFilterBuilderMoveUpButtonTooltip')
            );

            this.eMoveDownButton.appendChild(_createIconNoSpan('advancedFilterBuilderMoveDown', this.gos)!);
            this.addManagedListener(this.eMoveDownButton, 'click', () => this.moveItem(false));
            this.addManagedListener(this.eMoveDownButton, 'keydown', (event: KeyboardEvent) => {
                switch (event.key) {
                    case KeyCode.ENTER:
                        event.preventDefault();
                        _stopPropagationForAgGrid(event);
                        this.moveItem(false);
                        break;
                }
            });

            this.moveDownTooltipFeature = this.createManagedBean(
                new TooltipFeature({
                    getGui: () => this.eMoveDownButton,
                    getLocation: () => 'advancedFilter',
                    getTooltipValue: () =>
                        this.moveDownDisabled
                            ? null
                            : this.advancedFilterExpressionService.translate(
                                  'advancedFilterBuilderMoveDownButtonTooltip'
                              ),
                })
            );
            _setAriaLabel(
                this.eMoveDownButton,
                this.advancedFilterExpressionService.translate('advancedFilterBuilderMoveDownButtonTooltip')
            );

            this.activateTabIndex([this.eMoveUpButton, this.eMoveDownButton]);
        } else {
            _setDisplayed(this.eMoveUpButton, false);
            _setDisplayed(this.eMoveDownButton, false);
        }
    }

    private updateValidity(): void {
        _setVisible(this.eValidation, !this.item.valid);
        this.validationTooltipFeature.refreshToolTip();
        this.updateAriaLabel();
    }

    private createPill(params: CreatePillParams): SelectPillComp | InputPillComp {
        const { key, displayValue, cssClass, update, ariaLabel } = params;
        const onUpdated = (key: string) => {
            if (key == null) {
                return;
            }
            update(key);
            this.dispatchEvent({
                type: AdvancedFilterBuilderEvents.EVENT_VALUE_CHANGED,
            });
        };
        if (params.isSelect) {
            const { getEditorParams, pickerAriaLabelKey, pickerAriaLabelValue } = params;
            const advancedFilterBuilderParams = this.gos.get('advancedFilterBuilderParams');
            const minPickerWidth = `${advancedFilterBuilderParams?.pillSelectMinWidth ?? 140}px`;
            const maxPickerWidth = `${advancedFilterBuilderParams?.pillSelectMaxWidth ?? 200}px`;
            const comp = this.createBean(
                new SelectPillComp({
                    pickerAriaLabelKey,
                    pickerAriaLabelValue,
                    pickerType: 'ag-list',
                    value: {
                        key,
                        displayValue,
                    },
                    valueFormatter: (value: AutocompleteEntry) =>
                        value == null ? null : value.displayValue ?? value.key,
                    variableWidth: true,
                    minPickerWidth,
                    maxPickerWidth,
                    getEditorParams,
                    wrapperClassName: cssClass,
                    ariaLabel,
                })
            );
            this.addManagedListener(
                comp,
                Events.EVENT_FIELD_PICKER_VALUE_SELECTED,
                ({ value }: FieldPickerValueSelectedEvent) => onUpdated(value?.key)
            );
            return comp;
        } else {
            const comp = this.createBean(
                new InputPillComp({
                    value: displayValue,
                    cssClass,
                    type: this.getInputType(params.baseCellDataType),
                    ariaLabel,
                })
            );
            this.addManagedListener(comp, Events.EVENT_FIELD_VALUE_CHANGED, ({ value }: FieldValueEvent) =>
                onUpdated(value)
            );
            return comp;
        }
    }

    private getInputType(baseCellDataType: BaseCellDataType): 'text' | 'number' | 'date' {
        switch (baseCellDataType) {
            case 'text':
            case 'object':
            case 'boolean':
                return 'text';
            case 'number':
                return 'number';
            case 'date':
            case 'dateString':
                return 'date';
        }
    }

    private setupDragging(): void {
        const dragSource: DragSource = {
            type: DragSourceType.AdvancedFilterBuilder,
            eElement: this.eDragHandle,
            dragItemName: () => this.ePillWrapper.getDragName(),
            getDefaultIconName: () => DragAndDropService.ICON_NOT_ALLOWED,
            getDragItem: () => ({}),
            onDragStarted: () =>
                this.dragFeature.dispatchEvent<AdvancedFilterBuilderDragStartedEvent>({
                    type: AdvancedFilterBuilderDragFeature.EVENT_DRAG_STARTED,
                    item: this.item,
                }),
            onDragStopped: () =>
                this.dragFeature.dispatchEvent({
                    type: AdvancedFilterBuilderDragFeature.EVENT_DRAG_ENDED,
                }),
        };

        this.dragAndDropService.addDragSource(dragSource, true);
        this.addDestroyFunc(() => this.dragAndDropService.removeDragSource(dragSource));
    }

    private updateAriaLabel(): void {
        const wrapperLabel = this.ePillWrapper.getAriaLabel();
        const level = `${this.item.level + 1}`;
        const validationMessage = this.ePillWrapper.getValidationMessage();
        let ariaLabel;
        if (validationMessage) {
            ariaLabel = this.advancedFilterExpressionService.translate('ariaAdvancedFilterBuilderItemValidation', [
                wrapperLabel,
                level,
                validationMessage,
            ]);
        } else {
            ariaLabel = this.advancedFilterExpressionService.translate('ariaAdvancedFilterBuilderItem', [
                wrapperLabel,
                level,
            ]);
        }
        _setAriaLabel(this.focusWrapper, ariaLabel);
    }

    private updateAriaExpanded(): void {
        _removeAriaExpanded(this.focusWrapper);
        const { filterModel } = this.item;
        if (filterModel?.filterType === 'join' && filterModel.conditions.length) {
            _setAriaExpanded(this.focusWrapper, true);
        }
    }

    private removeItem(): void {
        this.dispatchEvent<AdvancedFilterBuilderRemoveEvent>({
            type: AdvancedFilterBuilderEvents.EVENT_REMOVED,
            item: this.item,
        });
    }

    private moveItem(backwards: boolean): void {
        this.dispatchEvent<AdvancedFilterBuilderMoveEvent>({
            type: AdvancedFilterBuilderEvents.EVENT_MOVED,
            item: this.item,
            backwards,
        });
    }
}
