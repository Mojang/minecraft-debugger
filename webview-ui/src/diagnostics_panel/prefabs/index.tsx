import worldTab from './tabs/World';

import serverMemoryTab from './tabs/ServerMemory';
import serverTimingTab from './tabs/ServerTiming';
import serverPacketsTab from './tabs/ServerPackets';
import serverBandwidthTab from './tabs/ServerBandwidth';
import dynamicPropertyTab from './tabs/DynamicProperties';

import serverScriptHandleCountsTab from './tabs/ServerScriptHandleCounts';
import serverScriptSubscriberCountsTab from './tabs/ServerScriptSubscriberCounts';

import clientEntitySystemTab from './tabs/ClientEntitySystems';
import clientProfilerScopesTab from './tabs/ClientCPUProfiler';

import editorNetworkStatsTab from './tabs/EditorNetworkStats';

export default [
    worldTab,
    serverMemoryTab,
    serverTimingTab,
    serverPacketsTab,
    serverBandwidthTab,
    serverScriptHandleCountsTab,
    serverScriptSubscriberCountsTab,
    clientEntitySystemTab,
    clientProfilerScopesTab,
    dynamicPropertyTab,
    editorNetworkStatsTab,
];
