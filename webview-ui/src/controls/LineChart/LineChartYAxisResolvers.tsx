// Copyright (C) Microsoft Corporation.  All rights reserved.

import { StatisticOptions, TrackedStat, YAxisType } from '../../StatisticResolver';

export interface LineChartYAxisResolver {
    resolve: (data: TrackedStat[]) => [number, number];
    type: YAxisType;
}

const DefaultYAxisPaddingFactor = 1.1;

export function MirroredYAxisResolver(options: StatisticOptions): LineChartYAxisResolver {
    return {
        resolve: (data: TrackedStat[]) => {
            if (data.length === 0) {
                return [0, 0];
            }

            const maxValue = Math.abs([...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0].value);
            let scaleMax = maxValue;

            // Show a little bit more graph
            scaleMax *= options.yAxisPaddingFactor ?? DefaultYAxisPaddingFactor;

            const scaleMin = 0 - scaleMax;

            return [scaleMin, scaleMax];
        },
        type: YAxisType.Mirrored,
    };
}

export function AbsoluteYAxisResolver(options: StatisticOptions): LineChartYAxisResolver {
    return {
        resolve: (data: TrackedStat[]) => {
            if (data.length === 0) {
                return [0, 0];
            }

            const maxValue = Math.abs([...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0].value);
            let scaleMax = maxValue;

            // Show a little bit more graph
            scaleMax *= options.yAxisPaddingFactor ?? DefaultYAxisPaddingFactor;

            return [0, scaleMax];
        },
        type: YAxisType.Absolute,
    };
}

export function CenteredYAxisResolver(options: StatisticOptions): LineChartYAxisResolver {
    return {
        resolve: (data: TrackedStat[]) => {
            if (data.length === 0) {
                return [0, 0];
            }

            const maxValue = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0].value;
            const minValue = [...data].sort((a, b) => Math.abs(a.value) - Math.abs(b.value))[0].value;

            // Show a little bit more graph
            const difference = Math.abs(maxValue - minValue);
            const padding = (difference * (options.yAxisPaddingFactor ?? DefaultYAxisPaddingFactor) - difference) / 2;

            return [minValue - padding, maxValue + padding];
        },
        type: YAxisType.Centered,
    };
}

export function createYAxisDomainResolver(options: StatisticOptions): LineChartYAxisResolver {
    switch (options.yAxisType) {
        case YAxisType.Mirrored:
            return MirroredYAxisResolver(options);
        case YAxisType.Absolute:
            return AbsoluteYAxisResolver(options);
        case YAxisType.Centered:
            return CenteredYAxisResolver(options);
    }
}
