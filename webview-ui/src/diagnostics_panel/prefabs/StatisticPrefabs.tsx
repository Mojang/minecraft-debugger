// Copyright (C) Microsoft Corporation.  All rights reserved.

import { ReactNode } from 'react';
import {
    NestedStatResolver,
    ParentNameStatResolver,
    StatisticType,
    YAxisType,
    createStatResolver,
} from '../StatisticResolver';
import MinecraftStatisticLineChart from '../controls/MinecraftStatisticLineChart';
import MinecraftStatisticStackedLineChart from '../controls/MinecraftStatisticStackedLineChart';
import MinecraftStatisticStackedBarChart from '../controls/MinecraftStatisticStackedBarChart';
import {
    MultipleStatisticProvider,
    NestedStatisticProvider,
    RegexStatisticProvider,
    SimpleStatisticProvider,
} from '../StatisticProvider';
import { StatisticPrefab } from './StatisticPrefab';

//
// TODO: add prefabs for stats within sub groups.
// ex: entity counts are per plugin and client timings are grouped by player name.
//
