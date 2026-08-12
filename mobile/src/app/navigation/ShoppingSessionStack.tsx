import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BranchSelectScreen } from '../../features/shopping-session/screens/BranchSelectScreen';
import { CreateProductScreen } from '../../features/shopping-session/screens/CreateProductScreen';
import { PriceHistoryScreen } from '../../features/shopping-session/screens/PriceHistoryScreen';
import { PriceUpdateScreen } from '../../features/shopping-session/screens/PriceUpdateScreen';
import { ScanDisambiguationScreen } from '../../features/shopping-session/screens/ScanDisambiguationScreen';
import { ScanResultScreen } from '../../features/shopping-session/screens/ScanResultScreen';
import { ScanScreen } from '../../features/shopping-session/ScanScreen';
import type { ShoppingSessionStackParamList } from './types';

const Stack = createNativeStackNavigator<ShoppingSessionStackParamList>();

export function ShoppingSessionStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="BranchSelect"
        component={BranchSelectScreen}
        options={{ title: 'Nueva compra', headerShown: false }}
      />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Escanear' }} />
      <Stack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: 'Producto' }} />
      <Stack.Screen
        name="ScanDisambiguation"
        component={ScanDisambiguationScreen}
        options={{ title: '¿Cuál es tu producto?' }}
      />
      <Stack.Screen
        name="CreateProduct"
        component={CreateProductScreen}
        options={{ title: 'Nuevo producto' }}
      />
      <Stack.Screen
        name="PriceHistory"
        component={PriceHistoryScreen}
        options={{ title: 'Historial de precios' }}
      />
      <Stack.Screen
        name="PriceUpdate"
        component={PriceUpdateScreen}
        options={{ title: 'Actualizar precio', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
