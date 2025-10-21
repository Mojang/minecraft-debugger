import { describe, it, expect } from 'vitest';
import { StatData, StatDataModel, StatsProvider } from './stats-provider';

describe('StatsProvider', () => {
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
