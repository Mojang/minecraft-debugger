
// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface DiagnosticsSectionProps {
    onShowDiagnosticsPanel: () => void;
}

const DiagnosticsSection: React.FC<DiagnosticsSectionProps> = ({ onShowDiagnosticsPanel }) => {
    return (
        <div className="section">
            <h3 className="title">Diagnostics</h3>
            <VSCodeButton className="standard-button" onClick={onShowDiagnosticsPanel}>
                Show Diagnostics
            </VSCodeButton>
        </div>
    );
};

export default DiagnosticsSection;
