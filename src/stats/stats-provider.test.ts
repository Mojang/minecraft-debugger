import { describe, it, expect } from 'vitest';
import { StatData, StatDataModel, StatsProvider } from './stats-provider';

describe('StatsProvider', () => {
    it('keeps the full view path when consolidating script table rows', () => {
        const provider = new StatsProvider('test', 'test');
        const received: StatData[] = [];
        provider.addStatListener({ onStatUpdated: stat => received.push(stat) });
        provider.setStats({
            type: 'stat2',
            tick: 10,
            stats: [
                {
                    name: 'scripting_stats_root',
                    should_aggregate: false,
                    children: [
                        {
                            name: 'Inventory',
                            should_aggregate: true,
                            children: [{ name: 'worker', values: [7], should_aggregate: false }],
                        },
                    ],
                },
            ],
        });

        const rows = received.filter(stat => stat.id === 'consolidated_data');
        expect(rows).toHaveLength(1);
        expect(rows[0].parent_id).toBe('Inventory');
        expect(rows[0].parent_full_id).toBe('scripting_stats_root_Inventory');
        expect(rows[0].children_string_values).toEqual([['worker', '7']]);
    });

    it('retains all columns and empty strings in repeated table updates', () => {
        const provider = new StatsProvider('test', 'test');
        const rows: string[][][] = [];
        provider.addStatListener({
            onStatUpdated: stat => {
                if (stat.id === 'consolidated_data') {
                    rows.push(stat.children_string_values);
                }
            },
        });
        const updates: (number | string)[][] = [
            ['running', 7, ''],
            ['', 8, '123abc'],
        ];
        updates.forEach((values, tick) =>
            provider.setStats({
                type: 'stat2',
                tick,
                stats: [
                    {
                        name: 'Inventory',
                        should_aggregate: true,
                        children: [{ name: 'worker', values, should_aggregate: false }],
                    },
                ],
            }),
        );

        expect(rows).toEqual([[['worker', 'running', '7', '']], [['worker', '', '8', '123abc']]]);
    });

    it('delivers nested chart samples once to each listener', () => {
        const provider = new StatsProvider('test', 'test');
        const first: StatData[] = [];
        const second: StatData[] = [];
        provider.addStatListener({ onStatUpdated: stat => first.push(stat) });
        provider.addStatListener({ onStatUpdated: stat => second.push(stat) });
        provider.setStats({
            type: 'stat2',
            tick: 10,
            stats: [
                {
                    name: 'scripting_stats_root',
                    should_aggregate: false,
                    children: [
                        {
                            name: 'Chart',
                            should_aggregate: false,
                            children: [{ name: 'value', values: [27], should_aggregate: false }],
                        },
                    ],
                },
            ],
        });
        for (const received of [first, second]) {
            const samples = received.filter(stat => stat.id === 'value');
            expect(samples).toHaveLength(1);
            expect(samples[0].parent_full_id).toBe('scripting_stats_root_Chart');
            expect(samples[0].values).toEqual([27]);
        }
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
