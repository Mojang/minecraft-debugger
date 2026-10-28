// Copyright (C) Microsoft Corporation.  All rights reserved.

import { DiagnosticsTabDescriptor, SCRIPT_DIAGNOSTICS_STAT_GROUP } from '../diagnostics-schema';

interface ScriptDiagnosticsUpdate {
    id: string;
    name: string;
    group_full_id: string;
    values: (number | string)[];
    children_string_values: string[][];
}

export function resolveScriptDiagnosticsUpdate<T extends ScriptDiagnosticsUpdate>(
    descriptor: DiagnosticsTabDescriptor,
    event: T,
): T | undefined {
    const { stat_group_id, statistic_id, statistic_ids, display_type } = descriptor;
    if (stat_group_id !== SCRIPT_DIAGNOSTICS_STAT_GROUP || statistic_id === undefined) {
        return undefined;
    }

    const isTable = display_type === 'table' || display_type === 'multi_column_table';
    // Legacy shared-root updates also include string-valued table rows, not just numeric chart series.
    if (!isTable && event.values.some(value => typeof value !== 'number')) {
        return undefined;
    }
    if (event.group_full_id === `${stat_group_id}_${statistic_id}`) {
        if (isTable) {
            return event.id === 'consolidated_data' && event.children_string_values.length > 0 ? event : undefined;
        }
        return event.values.length > 0 && (statistic_ids === undefined || statistic_ids.includes(event.id))
            ? event
            : undefined;
    }

    if (event.group_full_id !== stat_group_id || event.values.length === 0) {
        return undefined;
    }

    // Legacy flat packets have no view ownership. Only line charts identified a single stat by name.
    if (display_type === 'line_chart') {
        return event.id === statistic_id ? event : undefined;
    }
    if (statistic_ids !== undefined && !statistic_ids.includes(event.id)) {
        return undefined;
    }
    if (isTable) {
        const values = display_type === 'table' ? event.values.slice(-1) : event.values;
        return {
            ...event,
            id: 'consolidated_data',
            values: [],
            children_string_values: [[event.name, ...values.map(value => value.toString())]],
        };
    }
    return event;
}
