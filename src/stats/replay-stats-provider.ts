// Copyright (C) Microsoft Corporation.  All rights reserved.

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as zlib from 'zlib';
import { StatMessageModel, StatsProvider, StatsListener } from './stats-provider';

interface ReplayStatMessageHeader {
    encoding: string; // base64 or empty
    compression: string; // gzip or empty
}

export class ReplayStatsProvider extends StatsProvider {
    private _replayFilePath: string;
    private _replayStreamReader: readline.Interface | null;
    private _simTickFreqency: number;
    private _simTickPeriod: number;
    private _simTickCurrent: number;
    private _simTimeoutId: NodeJS.Timeout | null;
    private _replayHeader: ReplayStatMessageHeader | undefined;
    private _isBase64Encoded: boolean = false;
    private _pendingStats: StatMessageModel[];
    private _onComplete: (() => void) | undefined;

    // resume stream when lines drop below this threshold
    private static readonly PENDING_STATS_BUFFER_MIN = 256;
    // pause stream when lines exceed this threshold
    private static readonly PENDING_STATS_BUFFER_MAX = ReplayStatsProvider.PENDING_STATS_BUFFER_MIN * 2;
    // supported encodings
    private readonly BASE64_GZIP_ENCODING = 'base64-gzip';

    // ticks per second (frequency)
    private readonly MILLIS_PER_SECOND = 1000;
    private readonly DEFAULT_SPEED = 20; // ticks per second
    private readonly MIN_SPEED = 5;
    private readonly MAX_SPEED = 160;

    constructor(replayFilePath: string) {
        super(path.basename(replayFilePath), replayFilePath);
        this._replayFilePath = replayFilePath;
        this._replayStreamReader = null;
        this._simTickFreqency = this.DEFAULT_SPEED;
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._simTickCurrent = 0;
        this._simTimeoutId = null;
        this._base64Gzipped = false;
        this._pendingStats = [];
        this._onComplete = undefined;
    }

    public override start() {
        this.stop();

        const fileStream = fs.createReadStream(this._replayFilePath);
        this._replayStreamReader = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        this._replayStreamReader.on('line', line => this._onReadNextStatMessage(line));
        this._replayStreamReader.on('close', () => this._onCloseStream());
        this._replayStreamReader.on('error', () => this._errorCloseStream('Failed to read replay file.'));

        // begin simulation
        this._simTimeoutId = setTimeout(() => this._updateSim(), this._simTickPeriod);
        this._fireSpeedChanged();
        this._firePauseChanged();

        return new Promise<void>(resolve => {
            this._onComplete = resolve;
        });
    }

    public override stop() {
        this._fireStopped();
        if (this._simTimeoutId) {
            clearTimeout(this._simTimeoutId);
        }
        if (this._onComplete) {
            this._onComplete();
            this._onComplete = undefined;
        }
        if (this._replayStreamReader) {
        this._replayStreamReader?.close();
            this._replayStreamReader = null;
        }
        this._simTickFreqency = this.DEFAULT_SPEED;
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._simTickCurrent = 0;
        this._simTimeoutId = null;
        this._base64Gzipped = false;
        this._pendingStats = [];
    }

    public override pause() {
        if (this._simTimeoutId) {
            clearTimeout(this._simTimeoutId);
            this._simTimeoutId = null;
        }
        this._firePauseChanged();
    }

    public override resume() {
        if (this._simTickCurrent === 0) {
            this.start();
        } else {
            this._simTimeoutId = setTimeout(() => this._updateSim(), this._simTickPeriod);
        }
        this._firePauseChanged();
    }

    public override faster() {
        this._simTickFreqency *= 2;
        if (this._simTickFreqency > this.MAX_SPEED) {
            this._simTickFreqency = this.MAX_SPEED;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override slower() {
        this._simTickFreqency /= 2;
        if (this._simTickFreqency < this.MIN_SPEED) {
            this._simTickFreqency = this.MIN_SPEED;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override setSpeed(speed: string) {
        this._simTickFreqency = parseInt(speed);
        if (this._simTickFreqency < this.MIN_SPEED) {
            this._simTickFreqency = this.MIN_SPEED;
        } else if (this._simTickFreqency > this.MAX_SPEED) {
            this._simTickFreqency = this.MAX_SPEED;
        }
        this._simTickPeriod = this._calcSimPeriod(this._simTickFreqency);
        this._fireSpeedChanged();
    }

    public override manualControl(): boolean {
        return true;
    }

    private _updateSim() {
        const nextStatsMessage = this._pendingStats[0];
        if (nextStatsMessage) {
            if (nextStatsMessage.tick > this._simTickCurrent) {
                // not ready to process this message, wait for the next tick
            } else if (nextStatsMessage.tick < this._simTickCurrent) {
                // reset sim? close?
            } else if (nextStatsMessage.tick === this._simTickCurrent) {
                // process and remove the message, then increment sim tick
                this.setStats(nextStatsMessage);
                this._pendingStats.shift();
                this._simTickCurrent++;
            }
        }
        // resume stream if we're running low on data
        if (this._pendingStats.length < ReplayStatsProvider.PENDING_STATS_BUFFER_MIN) {
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

    private _onReadNextStatMessage(rawLine: string) {
        // first line is the header
        if (this._replayHeader === undefined) {
            try {
                const headerJson = JSON.parse(rawLine);
                this._replayHeader = headerJson as ReplayStatMessageHeader;
                this._isGzipped = this._replayHeader.compression === 'gzip';
            } catch (error) {
                this._closeReplayStreamReader();
                return;
            }
            return;
        }

        let processedLine = rawLine;
            try {
                const buffer = Buffer.from(rawLine, 'base64');
                if (this._isGzipped) {
                    processedLine = zlib.gunzipSync(buffer).toString('utf-8');
                } else {
                    processedLine = buffer.toString('utf-8');
                }
            } catch (error) {
                this._closeReplayStreamReader();
                return;
            }
        }

        try {
            const jsonLine = JSON.parse(processedLine);
            const statMessage = jsonLine as StatMessageModel;
            // seed sim tick with first message
            if (this._simTickCurrent === 0) {
                this._simTickCurrent = statMessage.tick;
            }
            // add stats messages to queue
            this._pendingStats.push(statMessage);
            // pause stream reader if we've got enough data for now
            if (this._pendingStats.length > ReplayStatsProvider.PENDING_STATS_BUFFER_MAX) {
                this._replayStreamReader?.pause();
            }
        } catch (error) {
            this._closeReplayStreamReader();
        }
    }

        if (this._replayStreamReader) {
        }
        this._replayStreamReader = null;
        this._fireNotification(message);
    }

    private _onCloseStream() {
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
            listener.onPauseUpdated?.(this._simTimeoutId == null);
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
        return this.MILLIS_PER_SECOND / simFrequency;
    }
}
