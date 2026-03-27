// Copyright (C) Microsoft Corporation.  All rights reserved.
// TypeScript mirror of ScriptDiagnosticsDescriptor (C++) and its Cereal-serialized wire format.

export type DiagnosticsDataSource = 'server' | 'client' | 'server_script';

export type DiagnosticsDisplayType =
    | 'line_chart'
    | 'stacked_line_chart'
    | 'stacked_bar_chart'
    | 'table'
    | 'multi_column_table'
    | 'dynamic_properties_table';

// One-to-one with ScriptDiagnosticsDescriptor fields (snake_case matches cereal wire names).
export interface DiagnosticsTabDescriptor {
    name: string;
    stat_group_id: string;
    data_source: DiagnosticsDataSource;
    display_type: DiagnosticsDisplayType;
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
