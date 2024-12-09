// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface GeneralSectionProps {
    onShowDiagnosticsPanel: () => void;
    onOpenDiagnosticsReplay: () => void;
    onShowSettings(): void;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({
    onShowDiagnosticsPanel,
    onOpenDiagnosticsReplay,
    onShowSettings,
}) => {
    return (
        <div className="section">
            <h3 className="title">Actions</h3>
            <VSCodeButton className="standard-button" onClick={onShowDiagnosticsPanel}>
                Show Live Diagnostics
            </VSCodeButton>
            <VSCodeButton className="standard-button" onClick={onOpenDiagnosticsReplay}>
                Open Diagnostic Replay
            </VSCodeButton>
            <VSCodeButton className="standard-button" onClick={onShowSettings}>
                Show Settings
            </VSCodeButton>
        </div>
    );
};

export default React.memo(GeneralSection);
