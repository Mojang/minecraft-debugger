
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { EventEmitter } from 'events';

export class EventBinder {
    private _eventEmitter: EventEmitter;
    private _bindings: { [event: string]: (...args: any[]) => void } = {};

    constructor(eventEmitter: EventEmitter) {
        this._eventEmitter = eventEmitter;
    }

    public bind(event: string, handler: (...args: any[]) => void): void {
        this._eventEmitter.on(event, handler);
        this._bindings[event] = handler;
    }

    public unbind(event: string): void {
        const handler = this._bindings[event];
        if (handler) {
            this._eventEmitter.off(event, handler);
            delete this._bindings[event];
        }
    }

    public unbindAll(): void {
        for (const event in this._bindings) {
            this.unbind(event);
        }
    }
}