
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';

interface StatusSectionProps {
    debuggerConnected: boolean;
}

const StatusSection: React.FC<StatusSectionProps> = ({
    debuggerConnected
}) => {
    return (
        <div className="status-container">
            <div
                className={`status-circle ${debuggerConnected ? 'active' : 'inactive'}`}
            ></div>
            {debuggerConnected ? 'Minecraft Connected' : 'Minecraft Disconnected'}
        </div>
    );
}

export default StatusSection;
