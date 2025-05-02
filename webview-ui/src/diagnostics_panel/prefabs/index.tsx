import worldTab from './tabs/World';

import serverMemoryTab from './tabs/ServerMemory';
import serverTimingTab from './tabs/ServerTiming';
import serverPacketsTab from './tabs/ServerPackets';
import serverBandwidthTab from './tabs/ServerBandwidth';

import serverScriptHandleCountsTab from './tabs/ServerScriptHandleCounts';
import serverScriptSubscriberCountsTab from './tabs/ServerScriptSubscriberCounts';

import clientTimingTab from './tabs/ClientTiming';
import clientMemoryTab from './tabs/ClientMemory';

export default [
    worldTab,
    serverMemoryTab,
    serverTimingTab,
    serverPacketsTab,
    serverBandwidthTab,
    serverScriptHandleCountsTab,
    serverScriptSubscriberCountsTab,
    clientTimingTab,
    clientMemoryTab,
];
