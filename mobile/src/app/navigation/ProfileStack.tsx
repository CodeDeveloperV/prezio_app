import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AlertsListScreen } from '../../features/alerts/screens/AlertsListScreen';
import { ProfileScreen } from '../../features/auth/screens/ProfileScreen';
import { NotificationsScreen } from '../../features/notifications/screens/NotificationsScreen';
import { InviteMemberScreen } from '../../features/shopping-lists/screens/InviteMemberScreen';
import { SetActiveBranchScreen } from '../../features/shopping-lists/screens/SetActiveBranchScreen';
import { ShoppingListDetailScreen } from '../../features/shopping-lists/screens/ShoppingListDetailScreen';
import { ShoppingListInvitationsScreen } from '../../features/shopping-lists/screens/ShoppingListInvitationsScreen';
import { ShoppingListsScreen } from '../../features/shopping-lists/screens/ShoppingListsScreen';
import { AnalyticsScreen } from '../../features/analytics/screens/AnalyticsScreen';
import type { ProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil', headerShown: false }} />
      <Stack.Screen name="Alerts" component={AlertsListScreen} options={{ title: 'Mis alertas' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notificaciones' }} />
      <Stack.Screen name="ShoppingLists" component={ShoppingListsScreen} options={{ title: 'Mis listas' }} />
      <Stack.Screen
        name="ShoppingListDetail"
        component={ShoppingListDetailScreen}
        options={({ route }) => ({ title: route.params.shoppingListName })}
      />
      <Stack.Screen name="InviteMember" component={InviteMemberScreen} options={{ title: 'Invitar' }} />
      <Stack.Screen
        name="ShoppingListInvitations"
        component={ShoppingListInvitationsScreen}
        options={{ title: 'Invitaciones' }}
      />
      <Stack.Screen
        name="SetActiveBranch"
        component={SetActiveBranchScreen}
        options={{ title: 'Sucursal activa' }}
      />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Estadísticas' }} />
    </Stack.Navigator>
  );
}
