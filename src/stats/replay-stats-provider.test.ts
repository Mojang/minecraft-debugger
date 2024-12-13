import { describe, it, expect } from 'vitest';
import { ReplayStatsProvider } from './replay-stats-provider';
import { StatData, StatsListener } from './stats-provider';
import path from 'path';

describe('ReplayStatsProvider', () => {
    it('should load base64-gzip encoded replay data and trigger events', async () => {
        const replayFilePath = path.resolve('./test/diagnostics-replay-compressed.mcstats');
        const replay = new ReplayStatsProvider(replayFilePath);
        let statCount = 0;
        let statsCallback: StatsListener = {
            onStatUpdated: (stat: StatData) => {
                statCount++;
                expect(stat).toBeDefined();
            },
        };
        replay.addStatListener(statsCallback);
        let results = await replay.start();
        expect(results.statLinesRead).toBe(3);
        expect(results.statEventsSent).toBe(3);
        expect(statCount).toBeGreaterThan(0); // no idea how many are in there
    });

    it('should load uncompressed replay and trigger events', async () => {
        const replayFilePath = path.resolve('./test/diagnostics-replay-uncompressed.mcstats');
        const replay = new ReplayStatsProvider(replayFilePath);
        let statCount = 0;
        let statsCallback: StatsListener = {
            onStatUpdated: (stat: StatData) => {
                statCount++;
                expect(stat).toBeDefined();
            },
        };
        replay.addStatListener(statsCallback);
        let results = await replay.start();
        expect(results.statLinesRead).toBe(3);
        expect(results.statEventsSent).toBe(3);
        expect(statCount).toBeGreaterThan(0);
    });

    it('should load no-header uncompressed replay and trigger events', async () => {
        const replayFilePath = path.resolve('./test/diagnostics-replay-uncompressed-no-header.mcstats');
        const replay = new ReplayStatsProvider(replayFilePath);
        let statCount = 0;
        let statsCallback: StatsListener = {
            onStatUpdated: (stat: StatData) => {
                statCount++;
                expect(stat).toBeDefined();
            },
        };
        replay.addStatListener(statsCallback);
        let results = await replay.start();
        expect(results.statLinesRead).toBe(3);
        expect(results.statEventsSent).toBe(3);
        expect(statCount).toBeGreaterThan(0);
    });

    it('should fire notification on invalid file read', async () => {
        const replayFilePath = './not-a-real-file.mcstats';
        const replay = new ReplayStatsProvider(replayFilePath);
        let notification = '';
        let statsCallback: StatsListener = {
            onNotification: (message: string) => {
                notification = message;
            },
        };
        replay.addStatListener(statsCallback);
        let results = await replay.start();
        expect(results.statLinesRead).toBe(0);
        expect(notification).toBe('Failed to read replay file.');
    });
});
