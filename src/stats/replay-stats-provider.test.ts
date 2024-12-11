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
        await replay.start();
        expect(statCount).toBeGreaterThan(0); // no idea how many are in there
    });

    it('should use load the replay wihtout error', async () => {
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
        await replay.start();
        expect(statCount).toBeGreaterThan(0);
    });

    it('should fire notification on invalid file read', async () => {
        const replayFilePath = './test/diagnostics-replay.mcstats';
        const replay = new ReplayStatsProvider(replayFilePath);
        let notification = '';
        let statsCallback: StatsListener = {
            onNotification: (message: string) => {
                notification = message;
            },
        };
        replay.addStatListener(statsCallback);
        await replay.start();
        expect(notification).toBe('Failed to read replay file.');
    });
});
