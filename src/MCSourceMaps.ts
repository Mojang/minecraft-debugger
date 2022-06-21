
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { BasicSourceMapConsumer, MappedPosition, NullablePosition, SourceMapConsumer } from 'source-map';
import * as fs from 'fs';
import * as path from 'path';

interface MapInfo {
	mapAbsoluteDirectory: string			// full path to parent folder of map file, needed when combining with relative paths within map
	originalSourceRelativePath: string;		// original source ts that generated the js, must match path found in map
	generatedSourceRelativePath: string;	// relative path to the local generated js file
	sourceMap: BasicSourceMapConsumer;		// the source map
}

function sanitizeDelimitersForRemote(filePath: string) {
	// remote debugger expects forward slashes on all platforms
	return filePath.replace(/\\/g,"/");
}

// Load and cache source map files
class SourceMapCache {
	private static readonly _mapFileExt: string = ".map";
	private _sourceMapRoot?: string;
	public _generatedSourceRoot?: string;
	private _mapsLoaded: boolean = false;
	public _originalSourcePathToMapLookup = new Map<string, MapInfo>();
	public _generatedSourcePathToMapLookup = new Map<string, MapInfo>();

	public constructor(sourceMapRoot?: string, generatedSourceRoot?: string) {
		this._sourceMapRoot = (sourceMapRoot) ? path.normalize(sourceMapRoot) : undefined;
		this._generatedSourceRoot = (generatedSourceRoot) ? path.normalize(generatedSourceRoot) : undefined;
	}

	public reset() {
		this._mapsLoaded = false;
		this._originalSourcePathToMapLookup.clear();
		this._generatedSourcePathToMapLookup.clear();
	}

	public async getMapFromOriginalSource(originalSource: string) {
		await this._loadSourceMaps();
		return this._originalSourcePathToMapLookup.get(path.normalize(originalSource));
	}

	public async getMapFromGeneratedSource(generatedSource: string) {
		await this._loadSourceMaps();
		return this._generatedSourcePathToMapLookup.get(path.normalize(generatedSource));
	}

	private async _loadSourceMaps() {
		if (this._mapsLoaded || !this._sourceMapRoot) {
			return;
		}

		// assume generated js files live with map files unless explicitly set otherwise
		if (this._generatedSourceRoot == undefined) {
			this._generatedSourceRoot = this._sourceMapRoot;
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
				let generatedSourceRelativePath = path.relative(this._generatedSourceRoot, generatedSourceAbsolutePath);

				// generate lookup tables for source maps, original to remote and remote to original
				for (let originalSource of sourceMapConsumer.sources) {

					// generate relative path from map to ts file
					let originalSourceRelative = sanitizeDelimitersForRemote(originalSource);
					// map has relative path back to original source, resolve for absolute path
					let originalSourceAbsolutePath = path.resolve(this._sourceMapRoot, originalSourceRelative);

					// collect all relevant path info, used for resolving original->generated and generated->original
					let mapInfo: MapInfo = {
						mapAbsoluteDirectory: path.dirname(mapFullPath),
						originalSourceRelativePath: originalSourceRelative,
						generatedSourceRelativePath: generatedSourceRelativePath,
						sourceMap: sourceMapConsumer
					};

					// create lookups using absolute paths of original and generated sources to map
					this._originalSourcePathToMapLookup.set(originalSourceAbsolutePath.toLowerCase(), mapInfo);

					// multiple original sources can end up in a single generated file, but only 1 generated file will exist for a given map
					if (!this._generatedSourcePathToMapLookup.has(generatedSourceRelativePath.toLowerCase())) {
						this._generatedSourcePathToMapLookup.set(generatedSourceRelativePath.toLowerCase(), mapInfo);
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
	private REMOTE_SOURCE_PATH_PREFIX = "scripts"; // TODO: remove me
	private _localRoot: string;
	private _sourceMapRoot?: string;
	private _sourceMapCache: SourceMapCache;

	public constructor(localRoot: string, sourceMapRoot?: string, generatedSourceRoot?: string) {
		this._localRoot = path.normalize(localRoot);
		this._sourceMapRoot = (sourceMapRoot) ? path.normalize(sourceMapRoot) : undefined;
		this._sourceMapCache = new SourceMapCache(this._sourceMapRoot, generatedSourceRoot);
	}

	public reset() {
		this._sourceMapCache.reset();
	}

	public async getGeneratedRemoteRelativePath(originalSource: string): Promise<string> {
		let mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalSource);
		if (!mapInfo || !this._sourceMapRoot) {
			// no source map, convert to remote relative path suitable for debugger.
			return sanitizeDelimitersForRemote(path.relative(this._localRoot, originalSource));
		}

		// given absolute path to generated source, convert to a remote relative path the debugger understands
		let generatedRemoteRelativePath = this._addRemotePathPrefix_HACK(mapInfo.generatedSourceRelativePath);
		return sanitizeDelimitersForRemote(generatedRemoteRelativePath);
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

		let mapInfo = await this._sourceMapCache.getMapFromGeneratedSource(this._removeRemotePathPrefix_HACK(generatedPosition.source));
		if (mapInfo) {
			let originalPos = mapInfo.sourceMap.originalPositionFor({
				column: generatedPosition.column,
				line: generatedPosition.line,
				bias: SourceMapConsumer.LEAST_UPPER_BOUND
			});

			if (originalPos.line !== null && originalPos.column !== null && originalPos.source !== null) {
				// combine directory of map and relative path from map to .ts to arrive at absolute path of .ts
				let originalSourceAbsolutePath = path.resolve(mapInfo.mapAbsoluteDirectory, originalPos.source);
				return {
					source: originalSourceAbsolutePath,
					line: originalPos.line,
					column: originalPos.column
				};
			}
		}

		throw new Error(`Could not map original position for ${generatedPosition.source} at line ${generatedPosition.line}.`);
	}

	// TODO: remove this after fixing internal root path of MC scripts
	private _removeRemotePathPrefix_HACK(filePath: string) {
		// remove the required "/scripts/" prefix from the generated sources when coming back from debugger
		return filePath.split('/').slice(1).join('/');
	}

	// TODO: remove this
	private _addRemotePathPrefix_HACK(filePath: string) {
		// required to prepend "/scripts/" to generated sources for remote debugger
		return path.join(this.REMOTE_SOURCE_PATH_PREFIX, filePath);
	}
}
