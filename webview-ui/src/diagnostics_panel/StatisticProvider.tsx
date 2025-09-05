// Copyright (C) Microsoft Corporation.  All rights reserved.

export interface StatisticUpdatedMessage {
    type: 'statistic-updated';
    is_modular: boolean;
    is_persistent: boolean;
    values: number[];
    string_values: string[];
    children_string_values: string[][];
    id: string;
    name: string;
    group: string;
    full_id: string;
    group_full_id: string;
    group_name: string;
    time: number;
}

export type StatisticDataSubscriber = (data: StatisticUpdatedMessage) => void;

export class StatisticProvider {
    private _dataSubscribers: StatisticDataSubscriber[] = [];
    private _eventListenerHandle: ((event: MessageEvent) => void) | undefined = undefined;

    protected _handleEvent(event: StatisticUpdatedMessage) {
        // Do nothing in base type
    }

    private _handleRawEvent(event: MessageEvent) {
        if (event.data.type === 'statistic-updated') {
            this._handleEvent(event.data as StatisticUpdatedMessage);
        }
    }

    protected _fireEvent(event: StatisticUpdatedMessage) {
        this._dataSubscribers.forEach((subscriber: StatisticDataSubscriber) => subscriber(event));
    }

    public addSubscriber(subscriber: StatisticDataSubscriber) {
        this._dataSubscribers.push(subscriber);
    }

    public removeSubscriber(subscriber: StatisticDataSubscriber) {
        this._dataSubscribers = this._dataSubscribers.filter((s: StatisticDataSubscriber) => s !== subscriber);
    }

    public registerWindowListener(window: Window) {
        // Make sure we don't leak listeners
        if (this._eventListenerHandle !== undefined) {
            this.unregisterWindowListener(window);
        }

        this._eventListenerHandle = this._handleRawEvent.bind(this);
        window.addEventListener('message', this._eventListenerHandle);
    }

    public unregisterWindowListener(window: Window) {
        if (this._eventListenerHandle) {
            window.removeEventListener('message', this._eventListenerHandle);
        }
    }
}

interface SimpleStatisticProviderOptions {
    statisticId: string;
    statisticParentId: string | RegExp;
}
export class SimpleStatisticProvider extends StatisticProvider {
    constructor(private options: SimpleStatisticProviderOptions) {
        super();
    }

    protected _handleEvent(event: StatisticUpdatedMessage) {
        // Check event type
        if (event.id !== this.options.statisticId) {
            return;
        }

        // Check for wrong group
        if (this.options.statisticParentId instanceof RegExp) {
            if (!this.options.statisticParentId.test(event.group_full_id)) {
                return;
            }
        } else if (event.group !== this.options.statisticParentId) {
            return;
        }

        if (event.values.length === 0) {
            return;
        }

        this._fireEvent(event);
    }
}

interface MultipleStatisticProviderOptions {
    statisticIds?: string[]; // If not included, all stats will be included
    statisticParentId: string | RegExp;
    valuesFilter?: (event: StatisticUpdatedMessage) => boolean;
}
// Used for things like stacked bar charts
export class MultipleStatisticProvider extends StatisticProvider {
    constructor(private options: MultipleStatisticProviderOptions) {
        super();
    }

    protected _handleEvent(event: StatisticUpdatedMessage) {
        // Check event type
        if (this.options.statisticIds !== undefined && this.options.statisticIds.indexOf(event.id) === -1) {
            return;
        }

        // Check for wrong group
        if (this.options.statisticParentId instanceof RegExp) {
            if (!this.options.statisticParentId.test(event.group_full_id)) {
                return;
            }
        } else if (event.group !== this.options.statisticParentId) {
            return;
        }

        if (event.values.length === 0) {
            return;
        }

        if (this.options.valuesFilter && !this.options.valuesFilter(event)) {
            return;
        }

        this._fireEvent(event);
    }
}

interface NestedStatisticProviderOptions {
    statisticParentIds: string[];
}
// Used for things where data is nested one layer below the parent
export class NestedStatisticProvider extends StatisticProvider {
    private _childStatisticIds: string[] = [];

    constructor(private options: NestedStatisticProviderOptions) {
        super();
    }

    protected _handleEvent(event: StatisticUpdatedMessage) {
        if (this._childStatisticIds.indexOf(event.group_full_id) !== -1) {
            // No new data
            if (event.values.length === 0) {
                return;
            }

            this._fireEvent(event);
        }

        // Track the full IDs of the child stats
        const parentIndex = this.options.statisticParentIds.indexOf(event.group);
        if (parentIndex === -1) {
            return;
        }

        // Check if the parent in the stack before us matches our parent event ID
        if (parentIndex > 0 && this.options.statisticParentIds[parentIndex - 1] !== event.group) {
            return;
        }

        // If we are the last parent, collect the child stats
        if (parentIndex === this.options.statisticParentIds.length - 1) {
            if (this._childStatisticIds.indexOf(event.full_id) === -1) {
                this._childStatisticIds.push(event.full_id);
            }
        }
    }
}

interface RegexStatisticProviderOptions {
    statisticParentId: RegExp;
    statisticId: string;
    ignoredValues?: number[]; // Filter out events if all values are in this list
}

// TODO
export class RegexStatisticProvider extends StatisticProvider {
    constructor(private options: RegexStatisticProviderOptions) {
        super();
    }

    protected _handleEvent(event: StatisticUpdatedMessage) {
        // check if the parent ID matches our regex
        if (!this.options.statisticParentId.test(event.group_full_id)) {
            return;
        }

        // Check event type
        if (event.id !== this.options.statisticId) {
            return;
        }

        let ignore = true;
        if (this.options.ignoredValues !== undefined) {
            ignore = this.options.ignoredValues.every((v: number) => event.values.indexOf(v) !== -1);
        }

        if (ignore) {
            return;
        }

        this._fireEvent(event);
    }
}
