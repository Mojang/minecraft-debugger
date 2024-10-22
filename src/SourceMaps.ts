// Copyright (C) Microsoft Corporation.  All rights reserved.

import { BasicSourceMapConsumer, MappedPosition, NullablePosition, SourceMapConsumer } from 'source-map';
import { normalizePath, normalizePathForRemote } from './Utils';
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

class InlineSourceMapError extends Error {}

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

// Load and cache source map files
class SourceMapCache {
    private static readonly _mapFileExt: string = '.map';
    private static readonly _jsFileExt: string = '.js';
    private _sourceMapRoot?: string;
    public _generatedSourceRoot?: string;
    private _localRoot?: string;
    private _mapsLoaded: boolean = false;
    public _originalSourcePathToMapLookup = new MapLookup();
    public _generatedSourcePathToMapLookup = new MapLookup();
    private _inlineSourceMap: boolean = false;

    public constructor(
        sourceMapRoot?: string,
        generatedSourceRoot?: string,
        inlineSourceMap: boolean = false,
        localRoot?: string
    ) {
        this._sourceMapRoot = sourceMapRoot ? path.normalize(sourceMapRoot) : undefined;
        this._generatedSourceRoot = generatedSourceRoot ? path.normalize(generatedSourceRoot) : undefined;
        this._inlineSourceMap = inlineSourceMap;
        this._localRoot = localRoot ? path.normalize(localRoot) : undefined;
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
            const mapFileNames = this._findAllMapFilesInFolder(
                this._sourceMapRoot,
                undefined,
                this._inlineSourceMap ? SourceMapCache._jsFileExt : SourceMapCache._mapFileExt
            );
            for (let mapFileName of mapFileNames) {
                const mapFullPath = path.resolve(this._sourceMapRoot, mapFileName);
                let mapFile = fs.readFileSync(mapFullPath);

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
                        const parts = mapFileName.split('\\scripts\\');
                        if (parts.length > 1) {
                            mapJson.sourceRoot = path.join(this._localRoot ?? '', path.dirname(parts[1]));
                        }
                    } else {
                        throw new InlineSourceMapError(`Failed to load inline source maps for file: ${mapFileName}`);
                    }
                } else {
                    mapJson = JSON.parse(mapFile.toString());

                    // Assume a .map file aligns 1:1 with a .js file
                    // if there is no file name provided
                    if (mapJson.file === undefined) {
                        mapJson.file = path.basename(mapFileName).replace(SourceMapCache._mapFileExt, '');
                    }
                }
                let sourceMapConsumer = await new SourceMapConsumer(mapJson);

                // map has relative path to generated source, resolve for absolute path
                let generatedSourceAbsolutePath = path.resolve(path.dirname(mapFullPath), sourceMapConsumer.file);
                let generatedSourceRelativePath = path.relative(this._generatedSourceRoot, generatedSourceAbsolutePath);

                // generate lookup tables for source maps, original to remote and remote to original
                for (let originalSource of sourceMapConsumer.sources) {
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
                    let mapInfo: MapInfo = {
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
            if (e instanceof InlineSourceMapError) {
                throw e;
            } else {
                throw new Error(
                    `Failed to load source maps at [${this._sourceMapRoot}], check that 'sourceMapRoot' is set correctly.\nInternal Error: ${e}`
                );
            }
        }

        this._mapsLoaded = true;
    }

    private _findAllMapFilesInFolder(
        dirPath: string,
        existingFiles?: Array<string>,
        fileExtentsion: string = SourceMapCache._mapFileExt
    ): Array<string> {
        let fileNames = fs.readdirSync(dirPath);
        let allFiles = existingFiles || [];
        fileNames.forEach(file => {
            const fullPath = path.join(dirPath, file);
            if (fs.statSync(fullPath).isDirectory()) {
                allFiles = this._findAllMapFilesInFolder(fullPath, allFiles, fileExtentsion);
            } else if (path.extname(file) === fileExtentsion) {
                allFiles.push(fullPath);
            }
        });
        return allFiles;
    }
}

// Source map manager, responsible for loading source maps and translating
// from original to generated positions and back again.
export class SourceMaps {
    private _localRoot: string;
    private _sourceMapRoot?: string;
    private _sourceMapCache: SourceMapCache;
    private _sourceMapBias: number = SourceMapConsumer.LEAST_UPPER_BOUND;
    private _sourceMapBiasAlternate: number = SourceMapConsumer.GREATEST_LOWER_BOUND;

    public constructor(
        localRoot: string,
        sourceMapRoot?: string,
        generatedSourceRoot?: string,
        inlineSourceMap: boolean = false,
        sourceMapBias?: string
    ) {
        this._localRoot = path.normalize(localRoot);
        this._sourceMapRoot = sourceMapRoot ? path.normalize(sourceMapRoot) : undefined;
        this._sourceMapCache = new SourceMapCache(this._sourceMapRoot, generatedSourceRoot, inlineSourceMap, localRoot);
        this._sourceMapBias =
            sourceMapBias === 'greatestLowerBound'
                ? SourceMapConsumer.GREATEST_LOWER_BOUND
                : SourceMapConsumer.LEAST_UPPER_BOUND;
        this._sourceMapBiasAlternate =
            this._sourceMapBias === SourceMapConsumer.LEAST_UPPER_BOUND
                ? SourceMapConsumer.GREATEST_LOWER_BOUND
                : SourceMapConsumer.LEAST_UPPER_BOUND;
    }

    public reset() {
        this._sourceMapCache.reset();
    }

    public async getGeneratedRemoteRelativePath(originalSource: string): Promise<string> {
        let mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalSource);
        if (!mapInfo || !this._sourceMapRoot) {
            // no source map, convert to remote relative path suitable for debugger.
            return normalizePathForRemote(path.relative(this._localRoot, originalSource));
        }

        // given absolute path to generated source, convert to a remote relative path the debugger understands
        return normalizePathForRemote(mapInfo.generatedSourceRelativePath);
    }

    public async getGeneratedPositionFor(originalPosition: MappedPosition): Promise<NullablePosition> {
        let mapInfo = await this._sourceMapCache.getMapFromOriginalSource(originalPosition.source);
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
            bias: this._sourceMapBias,
        });

        // if specified bias did not find a result, try the alternate
        if (generatedPosition.line === null) {
            generatedPosition = mapInfo.sourceMap.generatedPositionFor({
                source: mapInfo.preferAbsolute ? mapInfo.sourceAbsolutePath : mapInfo.originalSourceRelativePath,
                line: originalPosition.line,
                column: originalPosition.column,
                bias: this._sourceMapBiasAlternate,
            });
        }

        return generatedPosition;
    }

    public async getOriginalPositionFor(generatedPosition: MappedPosition): Promise<MappedPosition> {
        if (!this._sourceMapRoot) {
            // no source maps, convert remote relative path to local absolute
            let originalLocalRelativePosition: MappedPosition = Object.assign({}, generatedPosition);
            originalLocalRelativePosition.source = path.resolve(this._localRoot, generatedPosition.source);
            return originalLocalRelativePosition;
        }

        let mapInfo = await this._sourceMapCache.getMapFromGeneratedSource(generatedPosition.source);
        if (mapInfo) {
            let originalPos = mapInfo.sourceMap.originalPositionFor({
                line: generatedPosition.line,
                column: generatedPosition.column,
                bias: this._sourceMapBias,
            });

            // if specified bias did not find a result, try the alternate
            if (originalPos.line === null) {
                originalPos = mapInfo.sourceMap.originalPositionFor({
                    line: generatedPosition.line,
                    column: generatedPosition.column,
                    bias: this._sourceMapBiasAlternate,
                });
            }

            if (originalPos.line !== null && originalPos.column !== null && originalPos.source !== null) {
                // combine directory of map and relative path from map to .ts to arrive at absolute path of .ts
                let originalSourceAbsolutePath = path.resolve(mapInfo.mapAbsoluteDirectory, originalPos.source);
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
}
