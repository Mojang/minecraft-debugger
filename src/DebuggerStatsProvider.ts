// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatMessageModel, StatsProvider } from './StatsProvider';

export class DebuggerStatsProvider extends StatsProvider {
    private _recordedStats: StatMessageModel[] = [];
    private _shouldRecordStats = false;

    public setStats(stats: StatMessageModel) {
        if (this._shouldRecordStats) {
            this._recordedStats.push(stats);
        }

        for (const stat of stats.stats) {
            this._fireStatUpdated(stat, stats.tick);
        }
    }

    public startRecording() {
        this._recordedStats = [];
        this._shouldRecordStats = true;
    }

    public stopRecording() {
        this._shouldRecordStats = false;
    }

    public getRecordedStats() {
        return this._recordedStats;
    }
}
