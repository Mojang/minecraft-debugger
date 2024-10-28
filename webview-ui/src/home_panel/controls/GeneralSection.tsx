
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface GeneralSectionProps {
    onShowDiagnosticsPanel: () => void;
    onShowSettings(): void;
}

const GeneralSection: React.FC<GeneralSectionProps> = ({ onShowDiagnosticsPanel, onShowSettings }) => {
    return (
        <div className="section">
            <h3 className="title">Actions</h3>
            <VSCodeButton className="standard-button" onClick={onShowDiagnosticsPanel}>
                Show Diagnostics
            </VSCodeButton>
            <VSCodeButton className="standard-button" onClick={onShowSettings}>
                Show Settings
            </VSCodeButton>
        </div>
    );
};

export default GeneralSection;
