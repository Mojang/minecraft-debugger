// Copyright (C) Microsoft Corporation.  All rights reserved.

import { TabPrefabDataSource } from '../TabPrefab';
import { DebuggerRequestTarget } from '../../utilities/useDebuggerRequests';
import { createEntitySystemsTab } from './EntitySystemsProfiler';

const StatsTab = createEntitySystemsTab({
    name: 'Client - Entity Systems',
    dataSource: TabPrefabDataSource.Client,
    requestTarget: DebuggerRequestTarget.Client,
    statGroupPrefix: selectedClient => `${selectedClient}_client_ecs`,
});

export default StatsTab;
