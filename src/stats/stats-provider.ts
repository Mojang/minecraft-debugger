// Copyright (C) Microsoft Corporation.  All rights reserved.

export interface StatData {
    name: string;
    parent_name: string;
    id: string;
    full_id: string;
    parent_id: string;
    parent_full_id: string;
    values: number[];
    string_values: string[];
    tick: number;
}

export interface StatDataModel {
    name: string;
    children?: StatDataModel[];
    values?: number[]; // values[values.length - 1] is "this ticks data" and all ones before that are previous ticks
    string_values?: string[];
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

    private _fireStatUpdated(stat: StatDataModel, tick: number, parent?: StatData) {
        this._statListeners.forEach((listener: StatsListener) => {
            const statId = stat.name.toLowerCase();

            const statData: StatData = {
                ...stat,
                id: statId,
                full_id: parent !== undefined ? parent.full_id + '_' + statId : statId,
                parent_name: parent !== undefined ? parent.name : '',
                parent_id: parent !== undefined ? parent.id : '',
                parent_full_id: parent !== undefined ? parent.full_id : '',
                values: stat.values ?? [],
                string_values: stat.string_values ?? [],
                tick: tick,
            };

            listener.onStatUpdated?.(statData);

            if (stat.children) {
                stat.children.forEach((child: StatDataModel) => {
                    this._fireStatUpdated(child, tick, statData);
                });
            }
        });
    }
}
