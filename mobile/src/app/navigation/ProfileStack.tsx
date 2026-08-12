import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AlertsListScreen } from '../../features/alerts/screens/AlertsListScreen';
import { ProfileScreen } from '../../features/auth/screens/ProfileScreen';
import { NotificationsScreen } from '../../features/notifications/screens/NotificationsScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil', headerShown: false }} />
      <Stack.Screen name="Alerts" component={AlertsListScreen} options={{ title: 'Mis alertas' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notificaciones' }} />
    </Stack.Navigator>
  );
}
