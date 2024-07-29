// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatsProvider } from './StatsProvider';

export class DiagnosticsReportStatsProvider extends StatsProvider {
    _statFiringTask: NodeJS.Timeout | undefined = undefined;
    _currentFrameIndex = 0;

    constructor(private _fileData: any[]) {
        super();
    }

    private _cancelFiring() {
        if (this._statFiringTask) {
            clearTimeout(this._statFiringTask);
            this._statFiringTask = undefined;
        }
        this._currentFrameIndex = 0;
    }

    public startFiringReport() {
        if (this._statFiringTask) {
            this._cancelFiring();
        }

        this._statFiringTask = setInterval(() => {
            if (this._currentFrameIndex >= this._fileData.length) {
                this._cancelFiring();
                return;
            }

            const data = this._fileData[this._currentFrameIndex];
            for (const stat of data.stats) {
                this._fireStatUpdated(stat, data.tick);
            }

            this._currentFrameIndex++;
        }, 50); // Pretend like we are running perfectly. 50ms = 20 ticks per second
    }
}
