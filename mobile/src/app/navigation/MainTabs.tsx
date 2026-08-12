import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { HistoryScreen } from '../../features/history/HistoryScreen';
import { ProfileScreen } from '../../features/auth/screens/ProfileScreen';
import {
  IconHistory,
  IconHome2,
  IconScale,
  IconShoppingCart,
  IconUser,
} from '../theme/icons';
import { colorTokens } from '../theme/tokens';
import { ComparisonStack } from './ComparisonStack';
import { ShoppingSessionStack } from './ShoppingSessionStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colorTokens.primary,
        tabBarInactiveTintColor: colorTokens.textSecondary,
        tabBarLabelStyle: { fontFamily: 'Poppins-Regular', fontSize: 11 },
        tabBarStyle: { backgroundColor: colorTokens.background },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <IconHome2 color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="NewPurchase"
        component={ShoppingSessionStack}
        options={{
          title: 'Nueva compra',
          tabBarIcon: ({ color, size }) => (
            <IconShoppingCart color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="Comparator"
        component={ComparisonStack}
        options={{
          title: 'Comparar',
          tabBarIcon: ({ color, size }) => (
            <IconScale color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <IconHistory color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <IconUser color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
