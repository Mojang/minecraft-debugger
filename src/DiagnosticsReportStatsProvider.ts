// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatsProvider } from './StatsProvider';

export class DiagnosticsReportStatsProvider extends StatsProvider {
    constructor(private _fileData: any[]) {
        super();
    }

    public fireData() {
        for (const data of this._fileData) {
            for (const stat of data.stats) {
                this._fireStatUpdated(stat, data.tick);
            }
        }
    }
}
