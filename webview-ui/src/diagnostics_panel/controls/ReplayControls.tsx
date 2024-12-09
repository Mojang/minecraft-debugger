// Copyright (C) Microsoft Corporation.  All rights reserved.

import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

interface ReplayControlsProps {
    speed: string;
    paused: boolean;
    onRestart: () => void;
    onPause: () => void;
    onResume: () => void;
    onSlower: () => void;
    onFaster: () => void;
    svgIcons: {
        restart: React.ReactNode;
        pause: React.ReactNode;
        play: React.ReactNode;
        slower: React.ReactNode;
        faster: React.ReactNode;
    };
}

const ReplayControls: React.FC<ReplayControlsProps> = ({
    speed,
    paused,
    onRestart,
    onPause,
    onResume,
    onSlower,
    onFaster,
    svgIcons,
}) => {
    return (
        <div className="replay-controls-section">
            <div className="replay-play-sub-section">
                <VSCodeButton className="replay-button" onClick={onRestart}>
                    {svgIcons.restart}
                </VSCodeButton>
                {paused ? (
                    <VSCodeButton className="replay-button" onClick={onResume}>
                        {svgIcons.play}
                    </VSCodeButton>
                ) : (
                    <VSCodeButton className="replay-button" onClick={onPause}>
                        {svgIcons.pause}
                    </VSCodeButton>
                )}
            </div>
            <div className="replay-speed-sub-section">
                <VSCodeButton className="replay-button" onClick={onSlower}>
                    {svgIcons.slower}
                </VSCodeButton>
                <input className="replay-sim-speed-input" value={speed} readOnly />
                <VSCodeButton className="replay-button" onClick={onFaster}>
                    {svgIcons.faster}
                </VSCodeButton>
            </div>
        </div>
    );
};

export default React.memo(ReplayControls);
