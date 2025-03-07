const doOnceFlags: { [key: string]: boolean } = {};

/**
 * If the key was passed before, then doesn't execute the func
 * @param {Function} func
 * @param {string} key
 */
export function _doOnce(func: () => void, key: string) {
    if (doOnceFlags[key]) {
        return;
    }

    func();
    doOnceFlags[key] = true;
}

export function _warnOnce(msg: string) {
    _doOnce(() => console.warn('AG Grid: ' + msg), msg);
}
export function _errorOnce(msg: string) {
    _doOnce(() => console.error('AG Grid: ' + msg), msg);
}

export function _getFunctionName(funcConstructor: any) {
    // for every other browser in the world
    if (funcConstructor.name) {
        return funcConstructor.name;
    }

    // eslint-disable-next-line
    const matches = /function\s+([^\(]+)/.exec(funcConstructor.toString());
    return matches && matches.length === 2 ? matches[1].trim() : null;
}

export function _isFunction(val: any): boolean {
    return !!(val && val.constructor && val.call && val.apply);
}

export function _executeInAWhile(funcs: ((...args: any[]) => any)[]): void {
    _executeAfter(funcs, 400);
}

const executeNextVMTurnFuncs: ((...args: any[]) => any)[] = [];
let executeNextVMTurnPending = false;

export function _executeNextVMTurn(func: () => void): void {
    executeNextVMTurnFuncs.push(func);

    if (executeNextVMTurnPending) {
        return;
    }

    executeNextVMTurnPending = true;
    window.setTimeout(() => {
        const funcsCopy = executeNextVMTurnFuncs.slice();
        executeNextVMTurnFuncs.length = 0;
        executeNextVMTurnPending = false;
        funcsCopy.forEach((func) => func());
    }, 0);
}

export function _executeAfter(funcs: ((...args: any[]) => any)[], milliseconds = 0): void {
    if (funcs.length > 0) {
        window.setTimeout(() => funcs.forEach((func) => func()), milliseconds);
    }
}

/**
 * @param {Function} func The function to be debounced
 * @param {number} delay The time in ms to debounce
 * @return {Function} The debounced function
 */
export function _debounce(func: (...args: any[]) => void, delay: number): (...args: any[]) => void {
    let timeout: any;

    // Calling debounce returns a new anonymous function
    return function (...args: any[]) {
        const context = this;
        window.clearTimeout(timeout);

        // Set the new timeout
        timeout = window.setTimeout(function () {
            func.apply(context, args);
        }, delay);
    };
}

/**
 * @param {Function} func The function to be throttled
 * @param {number} wait The time in ms to throttle
 * @return {Function} The throttled function
 */
export function _throttle(func: (...args: any[]) => void, wait: number): (...args: any[]) => void {
    let previousCall = 0;

    return function (...args: any[]) {
        const context = this;
        const currentCall = new Date().getTime();

        if (currentCall - previousCall < wait) {
            return;
        }

        previousCall = currentCall;

        func.apply(context, args);
    };
}

export function _waitUntil(
    condition: () => boolean,
    callback: () => void,
    timeout: number = 100,
    timeoutMessage?: string
) {
    const timeStamp = new Date().getTime();

    let interval: number | null = null;
    let executed: boolean = false;

    const internalCallback = () => {
        const reachedTimeout = new Date().getTime() - timeStamp > timeout;
        if (condition() || reachedTimeout) {
            callback();
            executed = true;
            if (interval != null) {
                window.clearInterval(interval);
                interval = null;
            }

            if (reachedTimeout && timeoutMessage) {
                console.warn(timeoutMessage);
            }
        }
    };

    internalCallback();

    if (!executed) {
        interval = window.setInterval(internalCallback, 10);
    }
}

export function _compose<T>(...fns: ((...args: any[]) => any)[]) {
    return (arg: T) => fns.reduce<T>((composed, f) => f(composed), arg);
}

export const noop = () => {
    return;
};
