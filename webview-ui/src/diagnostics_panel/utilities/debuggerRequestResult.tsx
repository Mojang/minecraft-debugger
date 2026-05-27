import type { ReactNode } from 'react';
import type { DebuggerRequestResultMessage } from './useDebuggerRequests';

type DebuggerRequestResultTone = 'error' | 'success' | 'neutral';

type DebuggerRequestResultViewModel = {
    tone: DebuggerRequestResultTone;
    title: string;
    message: string;
};

function getDebuggerRequestResultViewModel(lastResult?: DebuggerRequestResultMessage): DebuggerRequestResultViewModel {
    if (!lastResult) {
        return {
            tone: 'neutral',
            title: 'Waiting for client response',
            message: 'Press Start to Begin Profiling',
        };
    }

    if (lastResult.error) {
        return {
            tone: 'error',
            title: 'Client error',
            message: `Error: ${lastResult.error}`,
        };
    }

    if (lastResult.response?.success) {
        return {
            tone: 'success',
            title: 'Client success',
            message: lastResult.response.response_message ?? 'Success',
        };
    }

    if (lastResult.response) {
        return {
            tone: 'error',
            title: 'Client failure',
            message: `Failed: ${lastResult.response.response_message}`,
        };
    }

    return {
        tone: 'neutral',
        title: 'Waiting for client response',
        message: 'Press Start to Begin Profiling',
    };
}

export function lastResultToUserFriendlyString(lastResult: DebuggerRequestResultMessage): string {
    return getDebuggerRequestResultViewModel(lastResult).message;
}

function renderMultilineMessage(message: string): ReactNode[] {
    return message
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line, index) => (
            <span key={`${index}-${line}`}>
                {index > 0 && <br />}
                {line}
            </span>
        ));
}

export function DebuggerRequestResultBanner({
    lastResult,
}: {
    lastResult?: DebuggerRequestResultMessage;
}): JSX.Element {
    const viewModel = getDebuggerRequestResultViewModel(lastResult);

    return (
        <div className={`minecraft-debugger-request-result minecraft-debugger-request-result--${viewModel.tone}`}>
            <div className="minecraft-debugger-request-result__badge">Client</div>
            <div className="minecraft-debugger-request-result__content">
                <div className="minecraft-debugger-request-result__title">{viewModel.title}</div>
                <div className="minecraft-debugger-request-result__message">{renderMultilineMessage(viewModel.message)}</div>
            </div>
        </div>
    );
}