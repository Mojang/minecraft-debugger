// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as zlib from 'zlib';
import { StatMessageModel, StatsProvider, StatsListener } from './stats-provider';

interface ReplayStatMessageHeader {
    encoding?: string;
}

export class ReplayResults {
    statLinesRead = 0;
    statEventsSent = 0;
}

export class ReplayStatsProvider extends StatsProvider {
    private _replayFilePath: string;
    private _replayStreamReader: readline.Interface | null;
    private _simTickFreqency: number;
    private _simTickPeriod: number;
    private _simTickCurrent: number;
    private _simTimeoutId: NodeJS.Timeout | null;
    private _base64Gzipped: boolean;
    private _pendingStats: StatMessageModel[];
    private _replayHeader: ReplayStatMessageHeader | undefined;
    private _replayResults: ReplayResults;
    private _onComplete: ((results: ReplayResults) => void) | undefined;

    // resume stream when lines drop below this threshold
    private static readonly pendingStatsBufferMin = 256;
    // pause stream when lines exceed this threshold
    private static readonly pendingStatsBufferMax = ReplayStatsProvider.pendingStatsBufferMin * 2;
    // supported encodings
    private readonly encodingBase64GZip = 'base64-gzip';
    private readonly encodingUtf8 = 'utf8';

    // ticks per second (frequency)
    private readonly millisPerSecond = 1000;
    private readonly defaultSpeed = 20; // ticks per second
    private readonly minSpeed = 5;
    private readonly maxSpeed = 160;

    constructor(replayFilePath: string) {
        super(path.basename(replayFilePath), replayFilePath);
        this._replayFilePath = replayFilePath;
        this._replayStreamReader = null;
        this._simTickFreqency = this.defaultSpeed;
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._simTickCurrent = 0;
        this._simTimeoutId = null;
        this._base64Gzipped = false;
        this._pendingStats = [];
        this._replayHeader = undefined;
        this._replayResults = new ReplayResults();
        this._onComplete = undefined;
    }

    public override start(): Promise<ReplayResults> {
        this.stop();

        const fileStream = fs.createReadStream(this._replayFilePath);
        this._replayStreamReader = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        this._replayStreamReader.on('line', line => this._onReadNextLineFromReplayStream(line));
        this._replayStreamReader.on('close', () => this._onCloseReplayStream());
        this._replayStreamReader.on('error', () => this._errorCloseReplayStream('Failed to read replay file.'));

        // begin simulation
        this._simTimeoutId = setTimeout(() => this._updateSim(), this._simTickPeriod);
        this._fireSpeedChanged();
        this._firePauseChanged();

        return new Promise<ReplayResults>(resolve => {
            this._onComplete = resolve;
        });
    }

    public override stop(): void {
        this._fireStopped();
        if (this._simTimeoutId) {
            clearTimeout(this._simTimeoutId);
        }
        if (this._onComplete) {
            this._onComplete(this._replayResults);
        }
        if (this._replayStreamReader) {
            this._replayStreamReader.close();
            this._replayStreamReader = null;
        }
        this._simTickFreqency = this.defaultSpeed;
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._simTickCurrent = 0;
        this._simTimeoutId = null;
        this._base64Gzipped = false;
        this._pendingStats = [];
        this._replayHeader = undefined;
        this._replayResults = new ReplayResults();
        this._onComplete = undefined;
    }

    public override pause(): void {
        if (this._simTimeoutId) {
            clearTimeout(this._simTimeoutId);
            this._simTimeoutId = null;
        }
        this._firePauseChanged();
    }

    public override resume(): void {
        if (this._simTickCurrent === 0) {
            this.start();
        } else {
            this._simTimeoutId = setTimeout(() => this._updateSim(), this._simTickPeriod);
        }
        this._firePauseChanged();
    }

    public override faster(): void {
        this._simTickFreqency *= 2;
        if (this._simTickFreqency > this.maxSpeed) {
            this._simTickFreqency = this.maxSpeed;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override slower(): void {
        this._simTickFreqency /= 2;
        if (this._simTickFreqency < this.minSpeed) {
            this._simTickFreqency = this.minSpeed;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override setSpeed(speed: string): void {
        this._simTickFreqency = parseInt(speed);
        if (this._simTickFreqency < this.minSpeed) {
            this._simTickFreqency = this.minSpeed;
        } else if (this._simTickFreqency > this.maxSpeed) {
            this._simTickFreqency = this.maxSpeed;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override manualControl(): boolean {
        return true;
    }

    private _updateSim(): void {
        const nextStatsMessage = this._pendingStats[0];
        if (nextStatsMessage) {
            if (nextStatsMessage.tick > this._simTickCurrent) {
                // not ready to process this message, wait for the next tick
            } else if (nextStatsMessage.tick < this._simTickCurrent) {
                // reset sim? close?
            } else if (nextStatsMessage.tick === this._simTickCurrent) {
                // process and remove the message, then increment sim tick
                this.setStats(nextStatsMessage);
                this._replayResults.statEventsSent++;
                this._pendingStats.shift();
                this._simTickCurrent++;
            }
        }
        // resume stream if we're running low on data
        if (this._pendingStats.length < ReplayStatsProvider.pendingStatsBufferMin) {
            this._replayStreamReader?.resume();
        }
        // schedule next update as long as we have pending data to process or there's still a stream to read
        if (this._replayStreamReader || this._pendingStats.length > 0) {
            this._simTimeoutId = setTimeout(() => this._updateSim(), this._simTickPeriod);
        } else {
            // no more data to process
            this.stop();
        }
    }

    private _onReadNextLineFromReplayStream(rawLine: string) {
        if (this._replayHeader === undefined) {
            try {
                const headerJson = JSON.parse(rawLine);
                if (headerJson.tick) {
                    this._replayHeader = {}; // no header, fall through to process this line as stat data
                } else {
                    // first line was header, set encoding and return
                    this._replayHeader = headerJson as ReplayStatMessageHeader;
                    const encoding = this._replayHeader.encoding ?? this.encodingUtf8;
                    this._base64Gzipped = encoding === this.encodingBase64GZip;
                    return;
                }
            } catch (error) {
                this._errorCloseReplayStream('Failed to parse replay header.');
                return;
            }
        }

        let decodedLine = rawLine;
        if (this._base64Gzipped) {
            try {
                const buffer = Buffer.from(rawLine, 'base64');
                decodedLine = zlib.gunzipSync(buffer).toString('utf-8');
            } catch (error) {
                this._errorCloseReplayStream('Failed to decode replay data.');
                return;
            }
        }

        try {
            const jsonLine = JSON.parse(decodedLine);
            const statMessage = jsonLine as StatMessageModel;
            // seed sim tick with first message
            if (this._simTickCurrent === 0) {
                this._simTickCurrent = statMessage.tick;
            }
            this._replayResults.statLinesRead++;
            // add stats messages to queue
            this._pendingStats.push(statMessage);
            // pause stream reader if we've got enough data for now
            if (this._pendingStats.length > ReplayStatsProvider.pendingStatsBufferMax) {
                this._replayStreamReader?.pause();
            }
        } catch (error) {
            this._errorCloseReplayStream('Failed to process replay data.');
        }
    }

    private _errorCloseReplayStream(message: string) {
        if (this._replayStreamReader) {
            this._replayStreamReader.close();
            this._replayStreamReader = null;
        }
        this._fireNotification(message);
    }

    private _onCloseReplayStream() {
        this._replayStreamReader = null;
    }

    private _fireSpeedChanged() {
        this._statListeners.forEach((listener: StatsListener) => {
            listener.onSpeedUpdated?.(this._simTickFreqency);
        });
    }

    private _firePauseChanged() {
        this._statListeners.forEach((listener: StatsListener) => {
            // paused if no timeout id
            listener.onPauseUpdated?.(this._simTimeoutId === null);
        });
    }

    private _fireStopped() {
        this._statListeners.forEach((listener: StatsListener) => {
            listener.onStopped?.();
        });
    }

    private _fireNotification(message: string) {
        this._statListeners.forEach((listener: StatsListener) => {
            listener.onNotification?.(message);
        });
    }

    private _calcSimPeriod(simFrequency: number): number {
        return this.millisPerSecond / simFrequency;
    }
}
