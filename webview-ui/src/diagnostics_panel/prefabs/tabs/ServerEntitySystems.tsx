// Copyright (C) Microsoft Corporation.  All rights reserved.

import { TabPrefabDataSource } from '../TabPrefab';
import { createEntitySystemsTab } from './EntitySystemsProfiler';

const StatsTab = createEntitySystemsTab({
    name: 'Server - Entity Systems',
    dataSource: TabPrefabDataSource.Server,
    requestTarget: 'server',
    statGroupPrefix: () => 'server_ecs',
});

export default StatsTab;
