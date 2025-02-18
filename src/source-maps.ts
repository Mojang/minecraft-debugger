// Copyright (C) Microsoft Corporation.  All rights reserved.

import { BasicSourceMapConsumer, MappedPosition, NullablePosition, SourceMapConsumer } from 'source-map';
import { normalizePath, normalizePathForRemote } from './utils';
import * as fs from 'fs';
import * as path from 'path';

interface MapInfo {
    mapAbsoluteDirectory: string; // full path to parent folder of map file, needed when combining with relative paths within map
    originalSourceRelativePath: string; // original source ts that generated the js, must match path found in map
    generatedSourceRelativePath: string; // relative path to the local generated js file
    sourceMap: BasicSourceMapConsumer; // the source map
    sourceAbsolutePath: string; // the absolute path to the source file
    preferAbsolute: boolean; // if true, use absolute paths as that is what the source map contained
}

class SourceMapError extends Error {}

class MapLookup {
    private _sourceToMapInfo = new Map<string, MapInfo>();
    public get(sourcePath: string) {
        return this._sourceToMapInfo.get(normalizePath(sourcePath));
    }
    public set(sourcePath: string, mapInfo: MapInfo) {
        this._sourceToMapInfo.set(normalizePath(sourcePath), mapInfo);
    }
    public has(sourcePath: string) {
        return this._sourceToMapInfo.has(normalizePath(sourcePath));
    }
    public clear() {
        this._sourceToMapInfo.clear();
    }
}

const MAP_FILE_EXT = '.map';
const JS_FILE_EXT = '.js';

// Load and cache source map files
class SourceMapCache {
    private _sourceMapRoot?: string;
    public _generatedSourceRoot?: string;
    private _mapsLoaded = false;
    public _originalSourcePathToMapLookup = new MapLookup();
    public _generatedSourcePathToMapLookup = new MapLookup();
    private _inlineSourceMap = false;

    public constructor(sourceMapRoot?: string, generatedSourceRoot?: string, inlineSourceMap = false) {
        this._sourceMapRoot = sourceMapRoot ? path.normalize(sourceMapRoot) : undefined;
        this._generatedSourceRoot = generatedSourceRoot ? path.normalize(generatedSourceRoot) : undefined;
        this._inlineSourceMap = inlineSourceMap;
    }

    public reset() {
        this._mapsLoaded = false;
        this._originalSourcePathToMapLookup.clear();
        this._generatedSourcePathToMapLookup.clear();
    }

    public async getMapFromOriginalSource(originalSource: string) {
        await this._loadSourceMaps();
        return this._originalSourcePathToMapLookup.get(originalSource);
    }

    public async getMapFromGeneratedSource(generatedSource: string) {
        await this._loadSourceMaps();
        return this._generatedSourcePathToMapLookup.get(generatedSource);
    }

    private async _loadSourceMaps() {
        if (this._mapsLoaded || !this._sourceMapRoot) {
            return;
        }

        // assume generated js files live with map files unless explicitly set otherwise
        if (this._generatedSourceRoot === undefined) {
            this._generatedSourceRoot = this._sourceMapRoot;
        }

        try {
            if (!fs.existsSync(this._sourceMapRoot)) {
                throw new SourceMapError(
                    `Failed to load source maps, invalid path sourceMapRoot:[${this._sourceMapRoot}]`
                );
            }

            // find all .map files in the sourceMapRoot, or .js files if using inline source maps
            const mapFileExt = this._inlineSourceMap ? JS_FILE_EXT : MAP_FILE_EXT;
            let mapFileNames = fs.readdirSync(this._sourceMapRoot, { encoding: null, recursive: true });
            mapFileNames = mapFileNames.filter(file => {
                return path.extname(file) === mapFileExt;
            });

            for (const mapFileName of mapFileNames) {
                const mapFullPath = path.resolve(this._sourceMapRoot, mapFileName);
                const mapFile = fs.readFileSync(mapFullPath);

                let mapJson;
                if (this._inlineSourceMap) {
                    const inlineSourceMapRegex = /\/\/# sourceMappingURL=data:application\/json;.*base64,(.*)$/gm;
                    const mapString = mapFile.toString();
                    const match = inlineSourceMapRegex.exec(mapString);
                    if (match && match.length > 1) {
                        const base64EncodedMap = match[1];
                        const decodedMap = Buffer.from(base64EncodedMap, 'base64').toString('utf8');
                        mapJson = JSON.parse(decodedMap);
                        mapJson.file = path.basename(mapFileName);
                    } else {
                        throw new SourceMapError(`Failed to load inline source maps for file: ${mapFileName}`);
                    }
                } else {
                    mapJson = JSON.parse(mapFile.toString());

                    // Assume a .map file aligns 1:1 with a .js file
                    // if there is no file name provided
                    if (mapJson.file === undefined) {
                        mapJson.file = path.basename(mapFileName).replace(MAP_FILE_EXT, '');
                    }
                }
                const sourceMapConsumer = await new SourceMapConsumer(mapJson);

                // map has relative path to generated source, resolve for absolute path
                const generatedSourceAbsolutePath = path.resolve(path.dirname(mapFullPath), sourceMapConsumer.file);
                const generatedSourceRelativePath = path.relative(
                    this._generatedSourceRoot,
                    generatedSourceAbsolutePath
                );

                // generate lookup tables for source maps, original to remote and remote to original
                for (const originalSource of sourceMapConsumer.sources) {
                    let originalSourceAbsolutePath: string;
                    let originalSourceRelative: string;
                    let preferAbsolute = false;
                    if (path.isAbsolute(originalSource)) {
                        // we have an absolute path already, so generate a relative path to the current dir
                        originalSourceAbsolutePath = originalSource;
                        originalSourceRelative = path.relative(path.dirname(mapFullPath), originalSourceAbsolutePath);
                        preferAbsolute = true;
                    } else {
                        // generate relative path from map to ts file
                        originalSourceRelative = normalizePathForRemote(originalSource);
                        // map has relative path back to original source, resolve for absolute path
                        originalSourceAbsolutePath = path.resolve(path.dirname(mapFullPath), originalSourceRelative);
                    }

                    // collect all relevant path info, used for resolving original->generated and generated->original
                    const mapInfo: MapInfo = {
                        mapAbsoluteDirectory: path.dirname(mapFullPath),
                        originalSourceRelativePath: originalSourceRelative,
                        generatedSourceRelativePath: generatedSourceRelativePath,
                        sourceMap: sourceMapConsumer,
                        sourceAbsolutePath: originalSourceAbsolutePath,
                        preferAbsolute,
                    };

                    // create lookups using absolute paths of original and generated sources to map
                    this._originalSourcePathToMapLookup.set(originalSourceAbsolutePath, mapInfo);

                    // multiple original sources can end up in a single generated file, but only 1 generated file will exist for a given map
                    if (!this._generatedSourcePathToMapLookup.has(generatedSourceRelativePath)) {
                        this._generatedSourcePathToMapLookup.set(generatedSourceRelativePath, mapInfo);
                    }
                }
            }
        } catch (e) {
            if (e instanceof SourceMapError) {
                throw e;
            } else {
                throw new Error(
                    `Failed to load source maps at [${this._sourceMapRoot}], check that 'sourceMapRoot' is set correctly.\nInternal Error: ${e}`
                );
            }
        }

        this._mapsLoaded = true;
    }
}

// Source map manager, responsible for loading source maps and translating
// from original to generated positions and back again.
export class SourceMaps {
    private _localRoot: string; // used as fallback when source maps don't resolve/load
    private _sourceMapRoot?: string;
    private _sourceMapCache: SourceMapCache;
    private _sourceMapBias: number = SourceMapConsumer.LEAST_UPPER_BOUND;

    public constructor(
        localRoot: string,
        sourceMapRoot?: string,
        generatedSourceRoot?: string,
        inlineSourceMap = false
    ) {
        this._localRoot = path.normalize(localRoot);
        this._sourceMapRoot = sourceMapRoot ? path.normalize(sourceMapRoot) : undefined;
        this._sourceMapCache = new SourceMapCache(this._sourceMapRoot, generatedSourceRoot, inlineSourceMap);
    }

    public clearCache(): void {
        this._sourceMapCache.reset();
    }

    public async getGeneratedRemoteRelativePath(originalSource: string): Promise<string> {
        const mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalSource);
        if (!mapInfo || !this._sourceMapRoot) {
            // no source map, convert to remote relative path suitable for debugger.
            return normalizePathForRemote(path.relative(this._localRoot, originalSource));
        }

        // given absolute path to generated source, convert to a remote relative path the debugger understands
        return normalizePathForRemote(mapInfo.generatedSourceRelativePath);
    }

    public async getGeneratedPositionFor(originalPosition: MappedPosition): Promise<NullablePosition> {
        const mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalPosition.source);
        if (!mapInfo) {
            // no source maps, return original position as is
            return {
                line: originalPosition.line,
                column: originalPosition.column,
                lastColumn: null,
            };
        }

        // use the map to get the generated source (js) position using original source path (a relative path to the map)
        let generatedPosition = mapInfo.sourceMap.generatedPositionFor({
            source: mapInfo.preferAbsolute ? mapInfo.sourceAbsolutePath : mapInfo.originalSourceRelativePath,
            line: originalPosition.line,
            column: originalPosition.column,
            bias: this._getSourceMapBias(),
        });

        // default bias did not find a result, try the alternate
        if (generatedPosition.line === null) {
            generatedPosition = mapInfo.sourceMap.generatedPositionFor({
                source: mapInfo.preferAbsolute ? mapInfo.sourceAbsolutePath : mapInfo.originalSourceRelativePath,
                line: originalPosition.line,
                column: originalPosition.column,
                bias: this._getAlternateSourceMapBias(),
            });
            if (generatedPosition.line) {
                this._switchSourceMapBias(); // alternate worked, make it primary
            }
        }

        return generatedPosition;
    }

    public async getOriginalPositionFor(generatedPosition: MappedPosition): Promise<MappedPosition> {
        if (!this._sourceMapRoot) {
            // no source maps, convert remote relative path to local absolute
            const originalLocalRelativePosition: MappedPosition = Object.assign({}, generatedPosition);
            originalLocalRelativePosition.source = path.resolve(this._localRoot, generatedPosition.source);
            return originalLocalRelativePosition;
        }

        const mapInfo = await this._sourceMapCache.getMapFromGeneratedSource(generatedPosition.source);
        if (mapInfo) {
            let originalPos = mapInfo.sourceMap.originalPositionFor({
                line: generatedPosition.line,
                column: generatedPosition.column,
                bias: this._getSourceMapBias(),
            });

            // default bias did not find a result, try the alternate
            if (originalPos.line === null) {
                originalPos = mapInfo.sourceMap.originalPositionFor({
                    line: generatedPosition.line,
                    column: generatedPosition.column,
                    bias: this._getAlternateSourceMapBias(),
                });
                if (originalPos.line) {
                    this._switchSourceMapBias();
                }
            }

            if (originalPos.line !== null && originalPos.column !== null && originalPos.source !== null) {
                // combine directory of map and relative path from map to .ts to arrive at absolute path of .ts
                const originalSourceAbsolutePath = path.resolve(mapInfo.mapAbsoluteDirectory, originalPos.source);
                return {
                    source: originalSourceAbsolutePath,
                    line: originalPos.line,
                    column: originalPos.column,
                };
            }
        }

        throw new Error(
            `Could not map original position for ${generatedPosition.source} at line ${generatedPosition.line}.`
        );
    }

    private _getSourceMapBias() {
        return this._sourceMapBias;
    }

    private _getAlternateSourceMapBias() {
        return this._sourceMapBias === SourceMapConsumer.LEAST_UPPER_BOUND
            ? SourceMapConsumer.GREATEST_LOWER_BOUND
            : SourceMapConsumer.LEAST_UPPER_BOUND;
    }

    private _switchSourceMapBias() {
        this._sourceMapBias =
            this._sourceMapBias === SourceMapConsumer.LEAST_UPPER_BOUND
                ? SourceMapConsumer.GREATEST_LOWER_BOUND
                : SourceMapConsumer.LEAST_UPPER_BOUND;
    }
}
