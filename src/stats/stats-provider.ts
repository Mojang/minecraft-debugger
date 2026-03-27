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

// Mirrors ScriptDiagnosticsDescriptor from C++. Sent once on connect via SchemaEvent.
export interface DiagnosticsTabDescriptor {
    name: string;
    stat_group_id: string;
    data_source: 'server' | 'client' | 'server_script';
    display_type: 'line_chart' | 'stacked_line_chart' | 'stacked_bar_chart' | 'table' | 'multi_column_table' | 'dynamic_properties_table';
    title?: string;
    y_label?: string;
    tick_range?: number;
    value_scalar?: number;
    target_value?: number;
    key_label?: string;
    value_labels?: string[];
    statistic_id?: string;
    statistic_ids?: string[];
}

export interface SchemaMessageModel {
    type: 'SchemaEvent';
    descriptors: DiagnosticsTabDescriptor[];
}

export interface StatsListener {
    onStatUpdated?: (stat: StatData) => void;
    onSpeedUpdated?: (speed: number) => void;
    onPauseUpdated?: (paused: boolean) => void;
    onStopped?: () => void;
    onNotification?: (message: string) => void;
    onSchemaReceived?: (schema: DiagnosticsTabDescriptor[]) => void;
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

    public setSchema(schema: DiagnosticsTabDescriptor[]): void {
        this._statListeners.forEach((listener: StatsListener) => {
            listener.onSchemaReceived?.(schema);
        });
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

    static aggregateData(statId: string, stat: StatDataModel, tick: number, parent?: StatData): StatData | undefined {
        const childStringValues: string[][] = [];

        for (const child of stat.children ?? []) {
            if (!child.values || child.values.length === 0) {
                continue;
            }

            // Handle different value types
            if (typeof child.values[0] === 'string' && child.values[0].length > 0) {
                // Original behavior: string values
                childStringValues.push([child.name, child.values[0]]);
            } else if (typeof child.values[0] === 'number') {
                // New behavior: numeric values
                if (child.values.length === 1) {
                    // Single numeric value
                    childStringValues.push([child.name, child.values[0].toString()]);
                } else if (child.values.length >= 2) {
                    // Multiple numeric values - create a row with all values
                    const valueStrings = child.values.map(v => v.toString());
                    childStringValues.push([child.name, ...valueStrings]);
                }
            }
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
            aggregateChildData = StatsProvider.aggregateData(statId, stat, tick, parent);
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
