import { describe, expect, it } from 'vitest';
import { DiagnosticsTabDescriptor, groupDiagnosticsViews } from './diagnostics-schema';

describe('groupDiagnosticsViews', () => {
    const first: DiagnosticsTabDescriptor = {
        name: 'Custom',
        stat_group_id: 'scripting_stats_root',
        data_source: 'server',
        display_type: 'table',
        statistic_id: 'First',
    };
    const second: DiagnosticsTabDescriptor = {
        ...first,
        display_type: 'multi_column_table',
        statistic_id: 'Second',
    };

    it('keeps all views in a single tab without duplicating collector toggles', () => {
        expect(groupDiagnosticsViews([first, second])).toEqual([
            {
                name: 'Custom',
                descriptors: [first, second],
                collectorNames: ['scripting_stats_root'],
            },
        ]);
    });

    it('keeps separate tabs and collects every collector needed by a tab', () => {
        const third = { ...first, stat_group_id: 'other_collector' };
        const otherTab = { ...first, name: 'Other' };
        const tabs = groupDiagnosticsViews([first, otherTab, second, third]);
        expect(tabs).toHaveLength(2);
        expect(tabs[0].descriptors).toEqual([first, second, third]);
        expect(tabs[0].collectorNames).toEqual(['scripting_stats_root', 'other_collector']);
        expect(tabs[1].descriptors).toEqual([otherTab]);
    });

    it('retains empty tabs without trying to enable a nonexistent collector', () => {
        const empty = { ...first, stat_group_id: '', is_empty_tab: true };
        expect(groupDiagnosticsViews([empty])[0].collectorNames).toEqual([]);
        expect(groupDiagnosticsViews([empty, first])[0].descriptors).toEqual([empty, first]);
        expect(groupDiagnosticsViews([])).toEqual([]);
    });
});
