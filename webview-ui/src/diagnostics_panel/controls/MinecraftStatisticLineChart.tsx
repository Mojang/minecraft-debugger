
// Copyright (C) Microsoft Corporation.  All rights reserved.

import { useCallback, useState } from 'react';
import { StatisticOptions, YAxisType } from '../StatisticResolver';
import LineChartYAxisSelectionBox from './LineChart/LineChartYAxisSelectionBox';
import { LineChart } from './LineChart/LineChart';
import { StatisticProvider } from '../StatisticProvider';

type MinecraftStatisticLineChartProps = {
    title: string;
    yLabel: string;
    xLabel?: string;
    statisticOptions: StatisticOptions;
    statisticDataProvider: StatisticProvider;
};

export default function MinecraftStatisticLineChart({
    title,
    statisticOptions,
    yLabel,
    xLabel = 'Time',
    statisticDataProvider,
}: MinecraftStatisticLineChartProps) {
    const [_statisticOptions, _setStatisticOptions] = useState<StatisticOptions>(statisticOptions);

    const yAxisResolverChanged = useCallback((selectedType: YAxisType): void => {
        _setStatisticOptions(previousValue => {
            return { ...previousValue, yAxisType: selectedType };
        });
    }, []);

    return (
        <div style={{ flexDirection: 'column' }}>
            <LineChart
                title={title}
                yLabel={yLabel}
                xLabel={xLabel}
                statisticOptions={_statisticOptions}
                statisticDataProvider={statisticDataProvider}
            />
            <br />
            <LineChartYAxisSelectionBox onChange={yAxisResolverChanged} defaultValue={statisticOptions.yAxisType} />
        </div>
    );
}
