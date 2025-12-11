import { MultipleStatisticProvider, SimpleStatisticProvider } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { MinecraftDynamicPropertiesTable } from '../../controls/MinecraftDynamicPropertiesTable';

const statsTab: TabPrefab = {
    name: 'Editor Network Stats',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return (
            <div>
                <MinecraftDynamicPropertiesTable
                    statisticDataProviders={
                        new MultipleStatisticProvider({
                            statisticParentId: 'editor_network_stats',
                            statisticIds: ['sent_count', 'received_count'],
                        })
                    }
                />
            </div>
        );
    },
};

export default statsTab;
