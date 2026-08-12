import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ComparatorResultScreen } from '../../features/comparison/screens/ComparatorResultScreen';
import { ComparatorSetupScreen } from '../../features/comparison/screens/ComparatorSetupScreen';
import type { ComparisonStackParamList } from './types';

const Stack = createNativeStackNavigator<ComparisonStackParamList>();

export function ComparisonStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="ComparatorSetup"
        component={ComparatorSetupScreen}
        options={{ title: 'Comparar precios', headerShown: false }}
      />
      <Stack.Screen
        name="ComparatorResult"
        component={ComparatorResultScreen}
        options={{ title: 'Resultados' }}
      />
    </Stack.Navigator>
  );
}
