// Copyright (C) Microsoft Corporation.  All rights reserved.

export interface StatData {
    name: string;
    parent_name: string;
    id: string;
    full_id: string;
    parent_id: string;
    parent_full_id: string;
    values: (number | string)[];
    children_string_values: string[][];
    should_aggregate: boolean;
    tick: number;
}

export interface StatDataModel {
    name: string;
    children?: StatDataModel[];
    values?: (number | string)[]; // values[values.length - 1] is "this ticks data" and all ones before that are previous ticks
    should_aggregate: boolean;
}

export interface StatMessageModel {
    tick: number;
    type: string;
    stats: StatDataModel[];
}

export interface StatsListener {
    onStatUpdated?: (stat: StatData) => void;
    onSpeedUpdated?: (speed: number) => void;
    onPauseUpdated?: (paused: boolean) => void;
    onStopped?: () => void;
    onNotification?: (message: string) => void;
}

export class StatsProvider {
    protected _statListeners: StatsListener[];

    constructor(public readonly name: string, public readonly uniqueId: string) {
        this._statListeners = [];
    }

    public setStats(stats: StatMessageModel): void {
        for (const stat of stats.stats) {
            this._fireStatUpdated(stat, stats.tick);
        }
    }

    public start(): void {
        throw new Error('Method not implemented.');
    }
    public stop(): void {
        throw new Error('Method not implemented.');
    }
    public pause(): void {
        throw new Error('Method not implemented.');
    }
    public resume(): void {
        throw new Error('Method not implemented.');
    }
    public faster(): void {
        throw new Error('Method not implemented.');
    }
    public slower(): void {
        throw new Error('Method not implemented.');
    }
    public setSpeed(_speed: string): void {
        throw new Error('Method not implemented.');
    }
    public manualControl(): boolean {
        return false;
    }

    public addStatListener(listener: StatsListener): void {
        this._statListeners.push(listener);
    }

    public removeStatListener(listener: StatsListener): void {
        this._statListeners = this._statListeners.filter((l: StatsListener) => l !== listener);
    }

    private _aggregateData(statId: string, stat: StatDataModel, tick: number, parent?: StatData): StatData | undefined {
        const childStringValues: string[][] = [];

        for (const child of stat.children ?? []) {
            if (!(child.values && typeof child.values[0] === 'string' && child.values[0].length > 0)) {
                continue;
            }

            childStringValues.push([child.name, child.values[0]]);
        }

        const childStatData: StatData = {
            ...stat,
            id: 'consolidated_data',
            full_id: (parent !== undefined ? parent.full_id + '_' + statId : statId) + '_consolidated_data',
            parent_name: stat.name,
            parent_id: statId,
            parent_full_id: statId,
            values: stat.values ?? [],
            children_string_values: childStringValues,
            should_aggregate: stat.should_aggregate,
            tick: tick,
        };

        return childStatData;
    }

    private _fireStatUpdated(stat: StatDataModel, tick: number, parent?: StatData) {
        const statId = stat.name.toLowerCase();

        const statData: StatData = {
            ...stat,
            id: statId,
            full_id: parent !== undefined ? parent.full_id + '_' + statId : statId,
            parent_name: parent !== undefined ? parent.name : '',
            parent_id: parent !== undefined ? parent.id : '',
            parent_full_id: parent !== undefined ? parent.full_id : '',
            values: stat.values ?? [],
            children_string_values: [],
            should_aggregate: stat.should_aggregate,
            tick: tick,
        };

        let aggregateChildData = undefined;
        if (stat.should_aggregate) {
            aggregateChildData = this._aggregateData(statId, stat, tick, parent);
        }

        this._statListeners.forEach((listener: StatsListener) => {
            listener.onStatUpdated?.(statData);

            if (aggregateChildData !== undefined) {
                listener.onStatUpdated?.(aggregateChildData);
            } else if (stat.children) {
                stat.children.forEach((child: StatDataModel) => {
                    this._fireStatUpdated(child, tick, statData);
                });
            }
        });
    }
}
