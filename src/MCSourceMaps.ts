
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { BasicSourceMapConsumer, MappedPosition, NullableMappedPosition, NullablePosition, Position, SourceMapConsumer } from 'source-map';
import * as fs from 'fs';
import * as path from 'path';

// Loaded/cached source map
class MapInfo {
	private _mapFilePath: string;
	private _generatedRemoteRelativePath: string;
	private _sourceMap: BasicSourceMapConsumer;

	public get mapFilePath() { return this._mapFilePath; }
	public get generatedPath() { return this._generatedRemoteRelativePath; }

	public constructor(mapFilePath: string, generatedRemoteRelativePath: string, sourceMap: BasicSourceMapConsumer) {
		this._mapFilePath = mapFilePath;
		this._generatedRemoteRelativePath = generatedRemoteRelativePath;
		this._sourceMap = sourceMap;
	}

	public originalPositionFor(generatedPosition: Position & { bias?: number }): NullableMappedPosition {
		return this._sourceMap.originalPositionFor({
			column: generatedPosition.column,
			line: generatedPosition.line,
			bias: SourceMapConsumer.LEAST_UPPER_BOUND
		});
	}

	public generatedPositionFor(originalPosition: MappedPosition & { bias?: number }): NullablePosition {
		return this._sourceMap.generatedPositionFor({
			source: this.sanitizePathForMapLookup(originalPosition.source),
			line: originalPosition.line,
			column: originalPosition.column,
			bias: SourceMapConsumer.LEAST_UPPER_BOUND
		});;
	}

	private sanitizePathForMapLookup(filePath: string): string {
		return filePath.replace(/\\/g,"/"); // source map data uses forward slashes internally
	}
}

// Load and cache source map files
class SourceMapCache {
	private _remoteRoot: string;
	public _mapInfoList = new Array<MapInfo>();

	public constructor(remoteRoot: string) {
		this._remoteRoot = path.normalize(remoteRoot);
	}

	public async tryGetSourceMap(mapFilePath: string) {
		try {
			let mapInfo = this.findSourceMap(mapFilePath);
			if (!mapInfo) {
				let mapBuffer = fs.readFileSync(mapFilePath);
				let mapJson = JSON.parse(mapBuffer.toString());
				let sourceMapConsumer = await new SourceMapConsumer(mapJson);
				let mapDir = path.dirname(mapFilePath);
				let generatedFileAbsolutePath = path.resolve(mapDir, sourceMapConsumer.file);
				let generatedRemoteRelativePath = path.relative(this._remoteRoot, generatedFileAbsolutePath);
				mapInfo = new MapInfo(mapFilePath, generatedRemoteRelativePath, sourceMapConsumer);
				this._mapInfoList.push(mapInfo);
			}
			return mapInfo;
		}
		catch (e) {
			throw new Error(`Failed to load source map at ${mapFilePath}, check that 'sourceMapRoot' is set correctly.`);
		}
	}

	private findSourceMap(mapFilePath: string) {
		for (let sm of this._mapInfoList) {
			if (sm.mapFilePath === mapFilePath) {
				return sm;
			}
		}
		return null;
	}
}

// Source map manager, responsible for loading source maps and translating
// from original to generated positions and back again.
export class MCSourceMaps {
	private _localRoot: string;
	private _remoteRoot: string;
	private _sourceMapRoot?: string;
	private _sourceMapCache: SourceMapCache;

	public constructor(localRoot: string, remoteRoot: string, sourceMapRoot?: string) {
		this._localRoot = path.normalize(localRoot);
		this._remoteRoot = path.normalize(remoteRoot);
		this._sourceMapRoot = (sourceMapRoot) ? path.normalize(sourceMapRoot) : undefined;
		this._sourceMapCache = new SourceMapCache(this._remoteRoot);
	}

	public async getGeneratedRemoteRelativePath(originalSource: string): Promise<string> {
		// only interested in the name of the generated source, pass in dummy position values
		let generatedSource = await this.getGeneratedPositionFor({
			source: originalSource,
			line: 1,
			column: 0
		});
		return generatedSource.source;
	}

	public async getGeneratedPositionFor(originalPosition: MappedPosition): Promise<MappedPosition> {
		let originalLocalRelativePath = path.relative(this._localRoot, originalPosition.source);
		
		let originalLocalRelativePosition: MappedPosition = Object.assign({}, originalPosition);
		originalLocalRelativePosition.source = originalLocalRelativePath;
		
		// no source maps is ok unless this is a .ts file
		if (!this._sourceMapRoot) {
			if (path.extname(originalLocalRelativePath) != '.ts') {
				return originalLocalRelativePosition; // no source maps, return original position
			}
			throw new Error(`Could not map position, 'sourceMapRoot' not defined.`);
		}

		let mapFilePath = this.mapFilePathFromOriginalSource(this._sourceMapRoot, originalLocalRelativePath);
		let mapInfo = await this._sourceMapCache.tryGetSourceMap(mapFilePath);
		if (mapInfo) {
			// get generated position from original
			let generatedPosition = mapInfo.generatedPositionFor({
				source: originalLocalRelativePosition.source,
				line: originalLocalRelativePosition.line,
				column: originalLocalRelativePosition.column
			});
			return {
				source: mapInfo.generatedPath,
				line: generatedPosition.line || 0,
				column: generatedPosition.column || 0
			};
		}

		throw new Error(`Could not map generated position for ${originalPosition.source} at line ${originalPosition.line}.`);
	}

	public async getOriginalPositionFor(generatedPosition: MappedPosition): Promise<MappedPosition> {
		// no source maps, original position is same as generated
		if (!this._sourceMapRoot) {
			return generatedPosition;
		}

		let mapFilePath = this.mapFilePathFromGeneratedSource(this._sourceMapRoot, generatedPosition.source);
		let mapInfo = await this._sourceMapCache.tryGetSourceMap(mapFilePath);
		if (mapInfo) {
			// get original position from generated
			const originalPosition = mapInfo.originalPositionFor({
				column: generatedPosition.column,
				line: generatedPosition.line
			});
			// return if original position was found, else throw error
			if (originalPosition.line !== null && originalPosition.column !== null && originalPosition.source !== null) {
				return {
					source: originalPosition.source,
					line: originalPosition.line,
					column: originalPosition.column
				};
			}
		}

		throw new Error(`Could not map original position for ${generatedPosition.source} at line ${generatedPosition.line}.`);
	}

	private mapFilePathFromGeneratedSource(sourceMapRoot: string, generatedSource: string): string {
		let generatedSourceWithoutPrefix = generatedSource.split('/').slice(1).join('/'); // remove the /scripts/ prefix required by MC remote paths
		let mapFileAbsolutePath = path.join(sourceMapRoot, generatedSourceWithoutPrefix + ".map");
		return mapFileAbsolutePath;
	}

	private mapFilePathFromOriginalSource(sourceMapRoot: string, originalSource: string): string {
		let originalLocalRelativePathNoExt = this.pathRemoveExtension(originalSource); // the .ts file
		let mapFilePath = path.join(sourceMapRoot, originalLocalRelativePathNoExt + ".js.map"); // rooted to sourcmaps folder
		return mapFilePath;
	}

	private pathRemoveExtension(fullPath: string): string {
		return fullPath.split('.').slice(0, -1).join('.');
	}
}
