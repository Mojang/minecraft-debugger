// Copyright (C) Microsoft Corporation.  All rights reserved.

// TypeScript mirror of ScriptDiagnosticsDescriptor (C++) and its Cereal based wire format.

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
    is_empty_tab?: boolean;
}

export const SCRIPT_DIAGNOSTICS_STAT_GROUP = 'scripting_stats_root';

export interface DiagnosticsTabGroup {
    name: string;
    descriptors: DiagnosticsTabDescriptor[];
    collectorNames: string[];
}

export function groupDiagnosticsViews(schema: DiagnosticsTabDescriptor[]): DiagnosticsTabGroup[] {
    const tabs = new Map<string, DiagnosticsTabGroup>();
    for (const descriptor of schema) {
        let tab = tabs.get(descriptor.name);
        if (!tab) {
            tab = { name: descriptor.name, descriptors: [], collectorNames: [] };
            tabs.set(descriptor.name, tab);
        }
        tab.descriptors.push(descriptor);
        if (descriptor.stat_group_id && !tab.collectorNames.includes(descriptor.stat_group_id)) {
            tab.collectorNames.push(descriptor.stat_group_id);
        }
    }
    return Array.from(tabs.values());
}
