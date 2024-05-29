// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatisticUpdatedMessage } from './StatisticProvider';

export enum YAxisType {
    Mirrored = 'Mirrored',
    Absolute = 'Absolute',
    Centered = 'Centered',
}

export type TrackedStat = {
    value: number;
    time: number;
    absoluteValue: number;
    category?: string;
};

export enum StatisticType {
    Absolute,
    Difference,
}

export type StatisticResolver = (statUpdate: StatisticUpdatedMessage, previousValues: TrackedStat[]) => TrackedStat[];

export interface StatisticOptions {
    tickRange: number; // How many ticks of data to display
    valueScalar?: number;
    yAxisPaddingFactor?: number; // 1.1 for 10% padding
    type: StatisticType;
    yAxisType: YAxisType;
}

// Generates a list of stats that match the aboslute value of the stat
function AbsoluteStatResolver(
    options: StatisticOptions
): (statUpdate: StatisticUpdatedMessage, previousValues: TrackedStat[]) => TrackedStat[] {
    return (msg: StatisticUpdatedMessage, previousValues: TrackedStat[]): TrackedStat[] => {
        let result = [...previousValues];

        for (let i = 0; i < msg.values.length; i++) {
            let value = msg.values[i];
            if (options.valueScalar !== undefined) {
                value = value * options.valueScalar;
            }

            const tickOffset = msg.values.length - i - 1;
            result.push({ value: value, time: msg.time - tickOffset, absoluteValue: value, category: msg.id });
        }

        // Sort oldest to newest
        result.sort((a, b) => a.time - b.time);

        const newestTick = result[result.length - 1].time;

        // Remove old data
        result = result.filter(d => d.time >= newestTick - options.tickRange);

        return result;
    };
}

// Generates a list of stats that match the aboslute value of the stat
function DifferenceStatResolver(
    options: StatisticOptions
): (statUpdate: StatisticUpdatedMessage, previousValues: TrackedStat[]) => TrackedStat[] {
    return (msg: StatisticUpdatedMessage, previousValues: TrackedStat[]): TrackedStat[] => {
        let result = [...previousValues];

        for (let i = 0; i < msg.values.length; i++) {
            let value = msg.values[i];
            let newValue = 0;
            let absoluteValue = value;
            if (result.length !== 0) {
                const previousValue = result[result.length - 1].absoluteValue;
                newValue = value - previousValue;
            }

            if (options.valueScalar !== undefined) {
                newValue = newValue * options.valueScalar;
                absoluteValue = absoluteValue * options.valueScalar;
            }

            const tickOffset = msg.values.length - i - 1;
            result.push({
                value: newValue,
                time: msg.time - tickOffset,
                absoluteValue: absoluteValue,
                category: msg.id,
            });
        }

        // Sort oldest to newest
        result.sort((a, b) => a.time - b.time);

        const newestTick = result[result.length - 1].time;

        // Remove old data
        result = result.filter(d => d.time >= newestTick - options.tickRange);

        return result;
    };
}

// Prefixes the stat ID with the parent ID
export function NestedStatResolver(
    resolver: StatisticResolver
): (statUpdate: StatisticUpdatedMessage, previousValues: TrackedStat[]) => TrackedStat[] {
    return (msg: StatisticUpdatedMessage, previousValues: TrackedStat[]): TrackedStat[] => {
        msg.id = `${msg.group} - ${msg.id}`;
        return resolver(msg, previousValues);
    };
}

// Resets the ID to the parent's ID
export function ParentNameStatResolver(
    resolver: StatisticResolver
): (statUpdate: StatisticUpdatedMessage, previousValues: TrackedStat[]) => TrackedStat[] {
    return (msg: StatisticUpdatedMessage, previousValues: TrackedStat[]): TrackedStat[] => {
        msg.id = msg.group;
        return resolver(msg, previousValues);
    };
}

export function createStatResolver(options: StatisticOptions): StatisticResolver {
    switch (options.type) {
        case StatisticType.Absolute:
            return AbsoluteStatResolver(options);
        case StatisticType.Difference:
            return DifferenceStatResolver(options);
    }
}
