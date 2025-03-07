import type { ComponentMeta, ControllerMeta, SingletonBean } from '../context/context';
import type { ComponentClass } from '../widgets/component';
import type { RowModelType } from './iRowModel';

export type ModuleValidationValidResult = {
    isValid: true;
};

export type ModuleValidationInvalidResult = {
    isValid: false;
    message: string;
};

export type ModuleValidationResult = ModuleValidationValidResult | ModuleValidationInvalidResult;

export interface Module {
    version: string;
    /**
     * Validation run when registering the module
     *
     * @return Whether the module is valid or not. If not, a message explaining why it is not valid
     */
    validate?: () => ModuleValidationResult;
    moduleName: string;
    beans?: SingletonBean[];
    agStackComponents?: ComponentClass[];
    controllers?: ControllerMeta[];
    userComponents?: ComponentMeta[];
    rowModel?: RowModelType;
    dependantModules?: Module[]; // Niall / Sean - my addition
}
