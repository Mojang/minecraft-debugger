import { describe, it, expect, vi } from 'vitest';
import { StatData, StatDataModel, StatsProvider } from './stats-provider';
import { DiagnosticsTabDescriptor, SCRIPT_DIAGNOSTICS_STAT_GROUP } from '../diagnostics-schema';

describe('StatsProvider', () => {
    it('replays the latest schema when a webview becomes ready, including an empty schema', () => {
        const provider = new StatsProvider('test', 'test');
        const onSchemaReceived = vi.fn();
        const listener = { onSchemaReceived };
        const schema: DiagnosticsTabDescriptor[] = [
            {
                name: 'Custom',
                stat_group_id: SCRIPT_DIAGNOSTICS_STAT_GROUP,
                data_source: 'server',
                display_type: 'table',
                statistic_id: 'Inventory',
            },
        ];

        provider.setSchema(schema);
        provider.addStatListener(listener);
        expect(onSchemaReceived).toHaveBeenLastCalledWith(schema);

        onSchemaReceived.mockClear();
        provider.sendSchema(listener);
        expect(onSchemaReceived).toHaveBeenCalledTimes(1);
        expect(onSchemaReceived).toHaveBeenCalledWith(schema);

        provider.clearSchema();
        onSchemaReceived.mockClear();
        provider.sendSchema(listener);
        expect(onSchemaReceived).toHaveBeenCalledTimes(1);
        expect(onSchemaReceived).toHaveBeenCalledWith([]);
    });

    it('preserves view routing and every table column across repeated row updates', () => {
        const provider = new StatsProvider('test', 'test');
        const received: StatData[] = [];
        provider.addStatListener({ onStatUpdated: stat => received.push(stat) });
        for (const [tick, values] of [
            [1, ['first', 1, '']],
            [2, ['', 2, 'next']],
        ] as const) {
            provider.setStats({
                type: 'stat2',
                tick,
                stats: [
                    {
                        name: SCRIPT_DIAGNOSTICS_STAT_GROUP,
                        should_aggregate: false,
                        children: [
                            {
                                name: 'Inventory',
                                should_aggregate: true,
                                children: [{ name: 'same-key', values: [...values], should_aggregate: false }],
                            },
                            {
                                name: 'Other view',
                                should_aggregate: true,
                                children: [{ name: 'same-key', values: ['unrelated'], should_aggregate: false }],
                            },
                        ],
                    },
                ],
            });
        }

        const rows = received.filter(stat => stat.id === 'consolidated_data' && stat.parent_id === 'Inventory');
        expect(rows.map(row => row.children_string_values)).toEqual([
            [['same-key', 'first', '1', '']],
            [['same-key', '', '2', 'next']],
        ]);
        expect(rows.every(row => row.parent_full_id === `${SCRIPT_DIAGNOSTICS_STAT_GROUP}_Inventory`)).toBe(true);
    });

    it('delivers each nested update once per listener', () => {
        const provider = new StatsProvider('test', 'test');
        const first = vi.fn();
        const second = vi.fn();
        provider.addStatListener({ onStatUpdated: first });
        provider.addStatListener({ onStatUpdated: second });
        provider.setStats({
            type: 'stat2',
            tick: 1,
            stats: [
                {
                    name: 'parent',
                    should_aggregate: false,
                    children: [{ name: 'child', values: [1], should_aggregate: false }],
                },
            ],
        });
        expect(first.mock.calls.map(([stat]) => stat.id)).toEqual(['parent', 'child']);
        expect(second.mock.calls.map(([stat]) => stat.id)).toEqual(['parent', 'child']);
    });

    it('aggregateData successful', async () => {
        const childDataA: StatDataModel = {
            name: 'childA',
            children: [],
            values: ['A'],
            should_aggregate: true,
        };

        const childDataB: StatDataModel = {
            name: 'childB',
            children: [],
            values: ['B'],
            should_aggregate: true,
        };

        const parentData: StatDataModel = {
            name: 'parent',
            children: [childDataA, childDataB],
            values: [],
            should_aggregate: true,
        };

        const statId = parentData.name.toLowerCase();

        const statData: StatData = {
            ...parentData,
            id: statId,
            full_id: statId,
            parent_name: '',
            parent_id: '',
            parent_full_id: '',
            values: [],
            children_string_values: [],
            should_aggregate: parentData.should_aggregate,
            tick: 0,
        };

        const aggregateData = StatsProvider.aggregateData(statId, statData, 0);

        expect(aggregateData).exist;

        expect(aggregateData?.children_string_values[0][0]).toBe('childA');
        expect(aggregateData?.children_string_values[0][1]).toBe('A');

        expect(aggregateData?.children_string_values[1][0]).toBe('childB');
        expect(aggregateData?.children_string_values[1][1]).toBe('B');
    });
});
