// Copyright (C) Microsoft Corporation.  All rights reserved.

// Generic tab renderer driven by a DiagnosticsTabDescriptor from the C++ schema registry.
// Derives the appropriate StatisticProvider and StatisticResolver from the descriptor fields
// and renders the matching control — no new tab files needed for new diagnostics.

import { useMemo } from 'react';
import { DiagnosticsTabDescriptor } from './DiagnosticsSchema';
import {
    SimpleStatisticProvider,
    MultipleStatisticProvider,
    StatisticProvider,
} from './StatisticProvider';
import { StatisticType, YAxisType, createStatResolver, StatisticResolver } from './StatisticResolver';
import MinecraftStatisticLineChart from './controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from './controls/MinecraftStatisticStackedLineChart';
import MinecraftStatisticStackedBarChart from './controls/MinecraftStatisticStackedBarChart';
import MinecraftStatisticTable from './controls/MinecraftStatisticTable';
import MinecraftMultiColumnStatisticTable from './controls/MinecraftMultiColumnStatisticTable';
import { MinecraftDynamicPropertiesTable } from './controls/MinecraftDynamicPropertiesTable';

type DynamicTabProps = {
    descriptor: DiagnosticsTabDescriptor;
    selectedClient: string;
    selectedPlugin: string;
};

// Build a StatisticProvider from descriptor fields.
// Client-source tabs use a regex to match the per-player stat group prefix.
function buildProvider(
    descriptor: DiagnosticsTabDescriptor,
    selectedClient: string,
    _selectedPlugin: string
): StatisticProvider {
    const { data_source, display_type, stat_group_id, statistic_id, statistic_ids } = descriptor;

    // DynamicPropertiesTable has its own fixed provider shape
    if (display_type === 'dynamic_properties_table') {
        return new SimpleStatisticProvider({
            statisticId: 'consolidated_data',
            statisticParentId: new RegExp(`${stat_group_id}.*`),
        });
    }

    // LineChart uses SimpleStatisticProvider (single stat series)
    if (display_type === 'line_chart') {
        const effectiveStatId = statistic_id ?? stat_group_id;
        const parentId: string | RegExp =
            data_source === 'client'
                ? new RegExp(`.*${selectedClient}_${stat_group_id}`)
                : stat_group_id;
        return new SimpleStatisticProvider({
            statisticId: effectiveStatId,
            statisticParentId: parentId,
        });
    }

    // All other chart/table types use MultipleStatisticProvider
    const parentId: string | RegExp =
        data_source === 'client'
            ? new RegExp(`.*${selectedClient}_${stat_group_id}`)
            : stat_group_id;

    return new MultipleStatisticProvider({
        statisticParentId: parentId,
        statisticIds: statistic_ids,
    });
}

function buildResolver(descriptor: DiagnosticsTabDescriptor): StatisticResolver {
    return createStatResolver({
        type: StatisticType.Absolute,
        yAxisType: YAxisType.Absolute,
        tickRange: descriptor.tick_range ?? 20 * 10,
        valueScalar: descriptor.value_scalar,
    });
}

export default function DynamicTab({ descriptor, selectedClient, selectedPlugin }: DynamicTabProps) {
    const title = descriptor.title ?? descriptor.name;
    const yLabel = descriptor.y_label ?? '';
    const tickRange = descriptor.tick_range ?? 20 * 10;

    // Memoize provider and resolver so controls' useEffect deps remain stable across renders.
    const provider = useMemo(
        () => buildProvider(descriptor, selectedClient, selectedPlugin),
        // re-create only when the identity of the tab or the selected client/plugin changes
        [descriptor.stat_group_id, descriptor.data_source, descriptor.display_type,
         descriptor.statistic_id, descriptor.statistic_ids?.join(','), selectedClient, selectedPlugin]
    );

    const resolver = useMemo(
        () => buildResolver(descriptor),
        [descriptor.tick_range, descriptor.value_scalar]
    );

    switch (descriptor.display_type) {
        case 'line_chart':
            return (
                <MinecraftStatisticLineChart
                    title={title}
                    yLabel={yLabel}
                    statisticDataProvider={provider}
                    statisticOptions={{
                        type: StatisticType.Absolute,
                        yAxisType: YAxisType.Absolute,
                        tickRange,
                        valueScalar: descriptor.value_scalar,
                    }}
                />
            );

        case 'stacked_line_chart':
            return (
                <MinecraftStatisticStackedLineChart
                    title={title}
                    yLabel={yLabel}
                    statisticDataProvider={provider}
                    statisticResolver={resolver}
                    targetValue={descriptor.target_value}
                />
            );

        case 'stacked_bar_chart':
            return (
                <MinecraftStatisticStackedBarChart
                    title={title}
                    yLabel={yLabel}
                    statisticDataProvider={provider}
                    statisticResolver={resolver}
                />
            );

        case 'table':
            return (
                <MinecraftStatisticTable
                    title={title}
                    keyLabel={descriptor.key_label ?? 'Name'}
                    valueLabel={descriptor.y_label ?? 'Value'}
                    statisticDataProvider={provider}
                    statisticResolver={resolver}
                />
            );

        case 'multi_column_table':
            return (
                <MinecraftMultiColumnStatisticTable
                    title={title}
                    keyLabel={descriptor.key_label ?? 'Name'}
                    valueLabels={descriptor.value_labels ?? ['Value']}
                    statisticDataProvider={provider as MultipleStatisticProvider}
                    statisticResolver={resolver}
                />
            );

        case 'dynamic_properties_table':
            return (
                <MinecraftDynamicPropertiesTable
                    statisticDataProviders={provider}
                />
            );

        default:
            return <div>Unsupported display type: {descriptor.display_type}</div>;
    }
}
