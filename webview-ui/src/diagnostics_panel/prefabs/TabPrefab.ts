import { StatisticPrefab } from './StatisticPrefab';

export type TabPrefabParams = {
    selectedClient: string;
    selectedPlugin: string;
    onRunCommand: (command: string) => void;
};

export enum TabPrefabDataSource {
    Client = 'client',
    Server = 'server',
    ServerScript = 'server_script',
}

export interface TabPrefab {
    name: string;
    dataSource: TabPrefabDataSource;
    content: (params: TabPrefabParams) => JSX.Element;
}
