import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { HistoryScreen } from '../../features/history/HistoryScreen';
import {
  IconHistory,
  IconHome2,
  IconScale,
  IconShoppingCart,
  IconUser,
  DEFAULT_ICON_STROKE_WIDTH,
} from '../theme/icons';
import { colorTokens, fontFamily, fontSizeScale } from '../theme/tokens';
import { ComparisonStack } from './ComparisonStack';
import { ProfileStack } from './ProfileStack';
import { ShoppingSessionStack } from './ShoppingSessionStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function createTabBarIcon(Icon: typeof IconHome2) {
  return ({ color, size }: { color: string; size: number }) => (
    <Icon color={color} size={size} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colorTokens.primary,
        tabBarInactiveTintColor: colorTokens.textSecondary,
        tabBarLabelStyle: { fontFamily: fontFamily.body, fontSize: fontSizeScale.xs },
        tabBarStyle: {
          backgroundColor: colorTokens.background,
          borderTopColor: colorTokens.border,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Inicio',
          tabBarIcon: createTabBarIcon(IconHome2),
        }}
      />
      <Tab.Screen
        name="NewPurchase"
        component={ShoppingSessionStack}
        options={{
          title: 'Nueva compra',
          tabBarIcon: createTabBarIcon(IconShoppingCart),
        }}
      />
      <Tab.Screen
        name="Comparator"
        component={ComparisonStack}
        options={{
          title: 'Comparar',
          tabBarIcon: createTabBarIcon(IconScale),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Historial',
          tabBarIcon: createTabBarIcon(IconHistory),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          title: 'Perfil',
          tabBarIcon: createTabBarIcon(IconUser),
        }}
      />
    </Tab.Navigator>
  );
}
