
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { BasicSourceMapConsumer, MappedPosition, NullablePosition, SourceMapConsumer } from 'source-map';
import * as fs from 'fs';
import * as path from 'path';

interface MapInfo {
	originalSourceRelativePath: string;		// original source ts that generated the js, must match path found in map
	generatedSourceAbsolutePath: string;	// absolute path to the local generated js file
	sourceMap: BasicSourceMapConsumer;		// the source map
}

// Load and cache source map files
class SourceMapCache {
	private static readonly _mapFileExt: string = ".map";
	private _sourceMapRoot?: string;
	private _mapsLoaded: boolean = false;
	public _originalSourcePathToMapLookup = new Map<string, MapInfo>();
	public _generatedSourcePathToMapLookup = new Map<string, MapInfo>();

	public constructor(sourceMapRoot?: string) {
		this._sourceMapRoot = (sourceMapRoot) ? path.normalize(sourceMapRoot) : undefined;
	}

	public async getMapFromOriginalSource(originalSource: string) {
		await this._loadSourceMaps();
		return this._originalSourcePathToMapLookup.get(path.normalize(originalSource).toLowerCase());
	}

	public async getMapFromGeneratedSource(generatedSource: string) {
		await this._loadSourceMaps();
		return this._generatedSourcePathToMapLookup.get(path.normalize(generatedSource).toLowerCase());
	}

	private async _loadSourceMaps() {
		if (this._mapsLoaded || !this._sourceMapRoot) {
			return;
		}

		try {
			const mapFileNames = this._findAllMapFilesInFolder(this._sourceMapRoot, undefined);
			for (let mapFileName of mapFileNames) {
				const mapFullPath = path.resolve(this._sourceMapRoot, mapFileName);
				let mapBuffer = fs.readFileSync(mapFullPath);
				let mapJson = JSON.parse(mapBuffer.toString());
				let sourceMapConsumer = await new SourceMapConsumer(mapJson);
				// map has relative path to generated source, resolve for absolute path
				let generatedSourceAbsolutePath = path.resolve(path.dirname(mapFullPath), sourceMapConsumer.file);
				for (let originalSource of sourceMapConsumer.sources) {
					// map has relative path back to original source, resolve for absolute path
					let originalSourceAbsolutePath = path.resolve(this._sourceMapRoot, originalSource);
					let mapInfo: MapInfo = {
						originalSourceRelativePath: originalSource, // retain original relative path, required for future lookups into sourcemap
						generatedSourceAbsolutePath: generatedSourceAbsolutePath,
						sourceMap: sourceMapConsumer
					};
					// create lookups using absolute paths of original and generated sources to map
					this._originalSourcePathToMapLookup.set(originalSourceAbsolutePath.toLowerCase(), mapInfo);
					if (!this._generatedSourcePathToMapLookup.has(generatedSourceAbsolutePath.toLowerCase())) {
						this._generatedSourcePathToMapLookup.set(generatedSourceAbsolutePath.toLowerCase(), mapInfo);
					}
				}
			}
		}
		catch (e) {
			throw new Error(`Failed to load source maps at [${this._sourceMapRoot}], check that 'sourceMapRoot' is set correctly.`);
		}

		this._mapsLoaded = true;
	}

	private _findAllMapFilesInFolder(dirPath: string, existingFiles?: Array<string>): Array<string> {
		let fileNames = fs.readdirSync(dirPath);
		let allFiles = existingFiles || [];
		fileNames.forEach((file) => {
			const fullPath = path.join(dirPath, file);
			if (fs.statSync(fullPath).isDirectory()) {
				allFiles = this._findAllMapFilesInFolder(fullPath, allFiles);
		  	}
		  	else if (path.extname(file) === SourceMapCache._mapFileExt) {
				allFiles.push(fullPath);
		  	}
		});
		return allFiles;
	}
}

// Source map manager, responsible for loading source maps and translating
// from original to generated positions and back again.
export class MCSourceMaps {
	private REMOTE_SOURCE_PATH_PREFIX = "scripts";
	private _localRoot: string;
	private _sourceMapRoot?: string;
	private _sourceMapCache: SourceMapCache;

	public constructor(localRoot: string, sourceMapRoot?: string) {
		this._localRoot = path.normalize(localRoot);
		this._sourceMapRoot = (sourceMapRoot) ? path.normalize(sourceMapRoot) : undefined;
		this._sourceMapCache = new SourceMapCache(this._sourceMapRoot);
	}

	public async getGeneratedRemoteRelativePath(originalSource: string): Promise<string> {
		let mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalSource);
		if (!mapInfo || !this._sourceMapRoot) {
			// no source map, convert to remote relative path suitable for debugger.
			return this._sanitizeDelimitersForRemote(path.relative(this._localRoot, originalSource));
		}

		// given absolute path to generated source, convert to a remote relative path the debugger understands
		let generatedRemoteRelativePath = this._addRemotePathPrefix(path.relative(this._sourceMapRoot, mapInfo.generatedSourceAbsolutePath));
		return this._sanitizeDelimitersForRemote(generatedRemoteRelativePath);
	}

	public async getGeneratedPositionFor(originalPosition: MappedPosition): Promise<NullablePosition> {
		let mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalPosition.source);
		if (!mapInfo) {
			// no source maps, return original position as is
			return {
				line: originalPosition.line,
				column: originalPosition.column,
				lastColumn: null
			}
		}

		// use the map to get the generated source (js) position using original source path (a relative path to the map)
		let generatedPosition = mapInfo.sourceMap.generatedPositionFor({
			source: mapInfo.originalSourceRelativePath,
			line: originalPosition.line,
			column: originalPosition.column,
			bias: SourceMapConsumer.LEAST_UPPER_BOUND
		});

		return generatedPosition;
	}

	public async getOriginalPositionFor(generatedPosition: MappedPosition): Promise<MappedPosition> {
		if (!this._sourceMapRoot) {
			// no source maps, convert remote relative path to local absolute
			let originalLocalRelativePosition: MappedPosition = Object.assign({}, generatedPosition);
			originalLocalRelativePosition.source = path.resolve(this._localRoot, generatedPosition.source);
			return originalLocalRelativePosition;
		}

		// convert remote relative path to generated local absolute path understood by source maps.
		const generatedFullPath = path.join(this._sourceMapRoot, this._removeRemotePathPrefix(generatedPosition.source));

		let mapInfo = await this._sourceMapCache.getMapFromGeneratedSource(generatedFullPath);
		if (mapInfo) {
			let originalPos = mapInfo.sourceMap.originalPositionFor({
				column: generatedPosition.column,
				line: generatedPosition.line,
				bias: SourceMapConsumer.LEAST_UPPER_BOUND
			});

			if (originalPos.line !== null && originalPos.column !== null && originalPos.source !== null) {
				let mapDir = path.dirname(mapInfo.generatedSourceAbsolutePath);
				return {
					source: path.resolve(mapDir, originalPos.source),
					line: originalPos.line,
					column: originalPos.column
				};
			}
		}

		throw new Error(`Could not map original position for ${generatedPosition.source} at line ${generatedPosition.line}.`);
	}

	private _sanitizeDelimitersForRemote(filePath: string) {
		// remote debugger expects forward slashes on all platforms
		return filePath.replace(/\\/g,"/");
	}

	private _removeRemotePathPrefix(filePath: string) {
		// remove the required "/scripts/" prefix from the generated sources when coming back from debugger
		return filePath.split('/').slice(1).join('/');
	}

	private _addRemotePathPrefix(filePath: string) {
		// required to prepend "/scripts/" to generated sources for remote debugger
		return path.join(this.REMOTE_SOURCE_PATH_PREFIX, filePath);
	}
}
