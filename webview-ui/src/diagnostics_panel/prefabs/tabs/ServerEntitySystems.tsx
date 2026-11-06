// Copyright (C) Microsoft Corporation.  All rights reserved.

import { TabPrefabDataSource } from '../TabPrefab';
import { DebuggerRequestTarget } from '../../utilities/useDebuggerRequests';
import { createEntitySystemsTab, ECS_VERSIONS } from './EntitySystemsProfiler';

const StatsTab = createEntitySystemsTab({
    name: 'Server - Entity Systems',
    dataSource: TabPrefabDataSource.Server,
    requestTarget: DebuggerRequestTarget.Server,
    statGroupPrefix: () => 'server_ecs',
    minSupportedVersion: ECS_VERSIONS.serverProfiler,
});

export default StatsTab;
