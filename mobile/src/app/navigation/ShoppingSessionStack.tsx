import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CreateAlertScreen } from '../../features/alerts/screens/CreateAlertScreen';
import { BranchSelectScreen } from '../../features/shopping-session/screens/BranchSelectScreen';
import { CreateProductScreen } from '../../features/shopping-session/screens/CreateProductScreen';
import { PriceHistoryScreen } from '../../features/shopping-session/screens/PriceHistoryScreen';
import { PriceUpdateScreen } from '../../features/shopping-session/screens/PriceUpdateScreen';
import { ProductNotFoundScreen } from '../../features/shopping-session/screens/ProductNotFoundScreen';
import { ProductCreatedSuccessScreen } from '../../features/shopping-session/screens/ProductCreatedSuccessScreen';
import { PurchaseSummaryScreen } from '../../features/shopping-session/screens/PurchaseSummaryScreen';
import { ScanDisambiguationScreen } from '../../features/shopping-session/screens/ScanDisambiguationScreen';
import { ScanResultScreen } from '../../features/shopping-session/screens/ScanResultScreen';
import { ScanScreen } from '../../features/shopping-session/ScanScreen';
import type { ShoppingSessionStackParamList } from './types';

const Stack = createNativeStackNavigator<ShoppingSessionStackParamList>();

export function ShoppingSessionStack() {
  return (
    <Stack.Navigator initialRouteName="Scan" screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="PurchaseSummary"
        component={PurchaseSummaryScreen}
        options={{ title: 'Mi compra', headerShown: false }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Escanear', headerShown: false }}
      />
      <Stack.Screen
        name="BranchSelect"
        component={BranchSelectScreen}
        options={{ title: 'Nueva compra', headerShown: false }}
      />
      <Stack.Screen name="ScanResult" component={ScanResultScreen} options={{ title: 'Producto', headerShown: false }} />
      <Stack.Screen
        name="ScanDisambiguation"
        component={ScanDisambiguationScreen}
        options={{ title: '¿Cuál es tu producto?', headerShown: false }}
      />
      <Stack.Screen
        name="ProductNotFound"
        component={ProductNotFoundScreen}
        options={{ title: 'Producto no encontrado', headerShown: false }}
      />
      <Stack.Screen
        name="CreateProduct"
        component={CreateProductScreen}
        options={{ title: 'Nuevo producto', headerShown: false }}
      />
      <Stack.Screen
        name="ProductCreatedSuccess"
        component={ProductCreatedSuccessScreen}
        options={{ title: 'Producto creado', headerShown: false, gestureEnabled: false }}
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
      <Stack.Screen
        name="CreateAlert"
        component={CreateAlertScreen}
        options={{ title: 'Crear alerta', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
