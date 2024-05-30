// Copyright (C) Microsoft Corporation.  All rights reserved.

export interface StatData {
    name: string;
    id: string;
    full_id: string;
    parent_id: string;
    parent_full_id: string;
    values: number[];
    tick: number;
}

export interface StatDataModel {
    name: string;
    children?: StatDataModel[];
    values?: number[]; // values[values.length - 1] is "this ticks data" and all ones before that are previous ticks
}

export interface StatMessageModel {
    tick: number;
    stats: StatDataModel[];
}

export type StatsListener = (stat: StatData) => void;

export class StatsProvider2 {
    private _statListeners: StatsListener[] = [];

    public addStatListener(listener: StatsListener) {
        this._statListeners.push(listener);
    }

    public removeStatListener(listener: StatsListener) {
        this._statListeners = this._statListeners.filter((l: StatsListener) => l !== listener);
    }

    private _fireStatUpdated(stat: StatDataModel, tick: number, parent?: StatData) {
        this._statListeners.forEach((listener: StatsListener) => {
            const statId = stat.name.toLowerCase();

            const statData: StatData = {
                ...stat,
                id: statId,
                full_id: parent !== undefined ? parent.full_id + '_' + statId : statId,
                parent_id: parent !== undefined ? parent.id : '',
                parent_full_id: parent !== undefined ? parent.full_id : '',
                values: stat.values ?? [],
                tick: tick,
            };
            listener(statData);

            if (stat.children) {
                stat.children.forEach((child: StatDataModel) => {
                    this._fireStatUpdated(child, tick, statData);
                });
            }
        });
    }

    public setStats(stats: StatMessageModel) {
        for (const stat of stats.stats) {
            this._fireStatUpdated(stat, stats.tick);
        }
    }
}
