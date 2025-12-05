import { SimpleStatisticProvider } from '../../StatisticProvider';
import { TabPrefab, TabPrefabDataSource } from '../TabPrefab';
import { MinecraftDynamicPropertiesTable } from '../../controls/MinecraftDynamicPropertiesTable';

const statsTab: TabPrefab = {
    name: 'Global Dynamic Properties',
    dataSource: TabPrefabDataSource.Server,
    content: () => {
        return (
            <div>
                <MinecraftDynamicPropertiesTable
                    statisticDataProviders={
                        new SimpleStatisticProvider({
                            statisticParentId: /dynamic_property_values*/,
                            statisticId: 'consolidated_data',
                        })
                    }
                />
            </div>
        );
    },
};

export default statsTab;
