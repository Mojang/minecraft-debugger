
// Copyright (C) Microsoft Corporation.  All rights reserved.

const Parser = require('stream-parser');
const Transform = require('stream').Transform;

// Data transform attached to socket.
// Parses messages to json as they arrive from debugee,
// then raises them as events for consumption by the DA.
//
export class MCMessageStreamParser extends Transform {
	constructor() {
		super();
		this._bytes(9, this.onLength);
	}

	private onLength(buffer: Buffer) {
		let length = parseInt(buffer.toString(), 16);
		this.emit('length', length);
		this._bytes(length, this.onMessage);
	}

	private onMessage(buffer: Buffer) {
		let json = JSON.parse(buffer.toString());
		this.emit('message', json);
		this._bytes(9, this.onLength);
	}
}

Parser(MCMessageStreamParser.prototype);