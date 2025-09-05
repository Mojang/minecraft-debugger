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
    children_string_values: string[][];
    is_modular: boolean;
    is_persistent: boolean;
    tick: number;
}

export interface StatDataModel {
    name: string;
    children?: StatDataModel[];
    values?: number[]; // values[values.length - 1] is "this ticks data" and all ones before that are previous ticks
    string_values?: string[];
    is_modular: boolean;
    is_persistent: boolean;
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
    protected _propertyCache: Map<string, Map<string, string[]>>;

    constructor(public readonly name: string, public readonly uniqueId: string) {
        this._statListeners = [];
        this._propertyCache = new Map<string, Map<string, string[]>>();
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
                children_string_values: [],
                is_modular: stat.is_modular,
                is_persistent: stat.is_persistent,
                tick: tick,
            };

            listener.onStatUpdated?.(statData);

            if (stat.is_modular && stat.children) {
                stat.children.forEach((child: StatDataModel) => {
                    this._fireStatUpdated(child, tick, statData);
                });
            }

            if (stat.is_modular === false) {
                const childStringValues: string[][] = [];

                let cacheDirty = false;
                if (stat.is_persistent) {
                    if (this._propertyCache.has(statId) === false) {
                        this._propertyCache.set(statId, new Map<string, string[]>());
                    }
                }

                if (stat.children) {
                    stat.children.forEach((child: StatDataModel) => {
                        const cache = this._propertyCache.get(statId);
                        if (child.children && child.children[0].string_values) {
                            childStringValues.push(child.children[0].string_values);

                            if (
                                stat.is_persistent &&
                                cache &&
                                (cache.has(child.name) === false ||
                                    JSON.stringify(cache.get(child.name)) !==
                                        JSON.stringify(child.children[0].string_values))
                            ) {
                                cache.set(child.name, child.children[0].string_values);
                                cacheDirty = true;
                            }
                        }
                    }, this);

                    //Something has been removed
                    if (stat.is_persistent) {
                        const cache = this._propertyCache.get(statId);
                        if (cache && cache.size !== childStringValues.length) {
                            cacheDirty = true;
                            cache.clear();
                        }
                    }
                }

                if ((stat.is_persistent && cacheDirty) || stat.is_persistent === false) {
                    const childStatData: StatData = {
                        ...stat,
                        id: 'name_and_value',
                        full_id: (parent !== undefined ? parent.full_id + '_' + statId : statId) + '_name_and_value',
                        parent_name: stat.name,
                        parent_id: statId,
                        parent_full_id: statId,
                        values: stat.values ?? [],
                        string_values: stat.string_values ?? [],
                        children_string_values: childStringValues,
                        is_modular: stat.is_modular,
                        is_persistent: stat.is_persistent,
                        tick: tick,
                    };
                    listener.onStatUpdated?.(childStatData);
                }
            }
        });
    }
}
