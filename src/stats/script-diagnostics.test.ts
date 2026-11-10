// Copyright (C) Microsoft Corporation.  All rights reserved.

import { describe, expect, it } from 'vitest';
import { DiagnosticsDisplayType, DiagnosticsTabDescriptor, SCRIPT_DIAGNOSTICS_STAT_GROUP } from '../diagnostics-schema';
import { resolveScriptDiagnosticsUpdate } from './script-diagnostics';
import { StatData, StatDataModel, StatMessageModel, StatsProvider } from './stats-provider';

function descriptor(displayType: DiagnosticsDisplayType): DiagnosticsTabDescriptor {
    return {
        name: 'Custom tab',
        stat_group_id: SCRIPT_DIAGNOSTICS_STAT_GROUP,
        statistic_id: 'Primary',
        data_source: 'server',
        display_type: displayType,
    };
}

function packet(children: StatDataModel[], tick = 10): StatMessageModel {
    return {
        type: 'stat2',
        tick,
        stats: [{ name: SCRIPT_DIAGNOSTICS_STAT_GROUP, should_aggregate: false, children }],
    };
}

function entry(name: string, values: (number | string)[]): StatDataModel {
    return { name, values, should_aggregate: false };
}

function collect(view: DiagnosticsTabDescriptor, packets: StatMessageModel[]) {
    const provider = new StatsProvider('test', 'test');
    const received: (StatData & { group_full_id: string; time: number })[] = [];
    provider.addStatListener({
        onStatUpdated: stat => {
            const update = resolveScriptDiagnosticsUpdate(view, {
                ...stat,
                group_full_id: stat.parent_full_id,
                time: stat.tick,
            });
            if (update !== undefined) {
                received.push(update);
            }
        },
    });
    packets.forEach(stats => provider.setStats(stats));
    return received;
}

describe('legacy script diagnostics', () => {
    it('selects a line chart by stat name and retains its sample history', () => {
        const received = collect(descriptor('line_chart'), [
            packet([entry('Primary', [1, 2, 3]), entry('Other', [99])]),
        ]);
        expect(received).toHaveLength(1);
        expect(received[0].id).toBe('Primary');
        expect(received[0].values).toEqual([1, 2, 3]);
        expect(received[0].time).toBe(10);
    });

    it.each(['line_chart', 'stacked_line_chart', 'stacked_bar_chart'] as const)(
        'excludes shared-root string table rows from %s',
        displayType => {
            const received = collect(descriptor(displayType), [
                packet([entry('Primary', ['running']), entry('Mixed', [7, 'text'])]),
                packet([entry('Primary', [0, 1])], 11),
            ]);
            expect(received).toHaveLength(1);
            expect(received[0].values).toEqual([0, 1]);
        },
    );

    it.each(['stacked_line_chart', 'stacked_bar_chart'] as const)(
        'preserves shared-root series for %s',
        displayType => {
            const received = collect(descriptor(displayType), [
                packet([entry('First', [1, 2]), entry('Second', [3, 4])]),
            ]);
            expect(received.map(stat => [stat.id, stat.values])).toEqual([
                ['First', [1, 2]],
                ['Second', [3, 4]],
            ]);
        },
    );

    it('converts single-value table entries using their latest value', () => {
        const received = collect(descriptor('table'), [
            packet([entry('worker::A', [1, 2, 3]), entry('Status', ['running'])]),
            packet([entry('worker::A', [0]), entry('Status', [''])], 11),
        ]);
        expect(received.map(stat => stat.id)).toEqual(Array(4).fill('consolidated_data'));
        expect(received.map(stat => stat.children_string_values)).toEqual([
            [['worker::A', '3']],
            [['Status', 'running']],
            [['worker::A', '0']],
            [['Status', '']],
        ]);
        expect(received.every(stat => stat.values.length === 0)).toBe(true);
        expect(received[2].time).toBe(11);
    });

    it('preserves mixed columns, empty strings, and exact row keys in multi-column updates', () => {
        const received = collect(descriptor('multi_column_table'), [
            packet([entry('worker::A', ['running', 7, '']), entry('untouched', ['keep', 9])]),
            packet([entry('worker::A', ['', 8, '123abc'])], 11),
        ]);
        expect(received.map(stat => stat.children_string_values)).toEqual([
            [['worker::A', 'running', '7', '']],
            [['untouched', 'keep', '9']],
            [['worker::A', '', '8', '123abc']],
        ]);
    });

    it('preserves the shared data limitation for separate legacy table views', () => {
        const first = descriptor('table');
        const second = { ...first, statistic_id: 'Secondary' };
        const updates = [packet([entry('row', [7])])];
        expect(collect(first, updates).map(stat => stat.children_string_values)).toEqual(
            collect(second, updates).map(stat => stat.children_string_values),
        );
    });

    it('keeps explicit stat filters for stacked charts and tables', () => {
        for (const displayType of ['stacked_line_chart', 'multi_column_table'] as const) {
            const view = { ...descriptor(displayType), statistic_ids: ['included'] };
            const received = collect(view, [packet([entry('included', [1]), entry('excluded', [2])])]);
            expect(received).toHaveLength(1);
            expect(received[0].name).toBe('included');
        }
    });
});

describe('grouped script diagnostics', () => {
    it.each(['line_chart', 'stacked_line_chart', 'stacked_bar_chart'] as const)(
        'keeps %s series isolated by owning view',
        displayType => {
            const received = collect(descriptor(displayType), [
                packet([
                    { name: 'Primary', should_aggregate: false, children: [entry('same series', [1, 2])] },
                    { name: 'Other', should_aggregate: false, children: [entry('same series', [99])] },
                ]),
            ]);
            expect(received).toHaveLength(1);
            expect(received[0].id).toBe('same series');
            expect(received[0].values).toEqual([1, 2]);
            expect(received[0].group_full_id).toBe('scripting_stats_root_Primary');
        },
    );

    it.each(['table', 'multi_column_table'] as const)(
        'keeps consolidated %s rows isolated without duplicating their parent update',
        displayType => {
            const received = collect(descriptor(displayType), [
                packet([
                    { name: 'Primary', should_aggregate: true, children: [entry('same row', ['running', 7, ''])] },
                    { name: 'Other', should_aggregate: true, children: [entry('same row', ['unrelated', 99])] },
                ]),
            ]);
            expect(received).toHaveLength(1);
            expect(received[0].id).toBe('consolidated_data');
            expect(received[0].children_string_values).toEqual([['same row', 'running', '7', '']]);
            expect(received[0].group_full_id).toBe('scripting_stats_root_Primary');
        },
    );

    it('matches view names literally, including regex characters', () => {
        const view = { ...descriptor('line_chart'), statistic_id: 'Special[1].*' };
        const received = collect(view, [
            packet([
                { name: 'Special[1].*', should_aggregate: false, children: [entry('series', [1])] },
                { name: 'Special1xyz', should_aggregate: false, children: [entry('series', [99])] },
            ]),
        ]);
        expect(received).toHaveLength(1);
        expect(received[0].values).toEqual([1]);
    });

    it('keeps explicit series filters for grouped charts', () => {
        const view = { ...descriptor('line_chart'), statistic_ids: ['included'] };
        const received = collect(view, [
            packet([
                {
                    name: 'Primary',
                    should_aggregate: false,
                    children: [entry('included', [1]), entry('excluded', [2])],
                },
            ]),
        ]);
        expect(received.map(stat => stat.id)).toEqual(['included']);
    });
});

describe('script diagnostics compatibility boundaries', () => {
    it('handles old then new packets without retaining a format guess across reconnects', () => {
        const received = collect(descriptor('table'), [
            packet([entry('legacy row', ['old game'])]),
            packet([{ name: 'Primary', should_aggregate: true, children: [entry('grouped row', ['new game'])] }], 11),
            packet([entry('legacy row', ['old game again'])], 12),
        ]);
        expect(received.map(stat => stat.children_string_values)).toEqual([
            [['legacy row', 'old game']],
            [['grouped row', 'new game']],
            [['legacy row', 'old game again']],
        ]);
    });

    it('does not turn empty entries or view markers into table rows', () => {
        const received = collect(descriptor('table'), [
            packet([
                entry('empty', []),
                { name: 'Primary', should_aggregate: true, children: [] },
                { name: 'Other', should_aggregate: true, children: [entry('row', ['not this view'])] },
            ]),
        ]);
        expect(received).toEqual([]);
    });

    it('does not match unrelated native collectors or incomplete script descriptors', () => {
        const update = {
            id: 'value',
            name: 'value',
            group_full_id: 'native_group',
            values: [1],
            children_string_values: [],
        };
        expect(resolveScriptDiagnosticsUpdate(descriptor('table'), update)).toBeUndefined();
        expect(
            resolveScriptDiagnosticsUpdate({ ...descriptor('table'), stat_group_id: 'native_group' }, update),
        ).toBeUndefined();
        expect(
            resolveScriptDiagnosticsUpdate(
                { ...descriptor('table'), statistic_id: undefined },
                { ...update, group_full_id: SCRIPT_DIAGNOSTICS_STAT_GROUP },
            ),
        ).toBeUndefined();
    });
});
