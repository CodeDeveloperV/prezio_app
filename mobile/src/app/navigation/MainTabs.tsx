import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'tamagui';

import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { HistoryScreen } from '../../features/history/HistoryScreen';
import {
  IconHistory,
  IconHome2,
  IconScale,
  IconScan,
  IconUser,
  DEFAULT_ICON_STROKE_WIDTH,
} from '../theme/icons';
import { colorTokens, fontFamily } from '../theme/tokens';
import { ComparisonStack } from './ComparisonStack';
import { ProfileStack } from './ProfileStack';
import { ShoppingSessionStack } from './ShoppingSessionStack';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS = {
  Dashboard: IconHome2,
  Comparator: IconScale,
  NewPurchase: IconScan,
  History: IconHistory,
  Profile: IconUser,
} as const;

const TAB_LABELS = {
  Dashboard: 'Inicio',
  Comparator: 'Comparar',
  NewPurchase: 'Escanear',
  History: 'Historial',
  Profile: 'Perfil',
} as const;

const primaryTabName = 'NewPurchase';
const TAB_BAR_HORIZONTAL_INSET = 16;
const TAB_BAR_BOTTOM_GAP = 12;
const immersivePurchaseRoutes = new Set([
  'Scan',
  'ScanResult',
  'ScanDisambiguation',
  'ProductNotFound',
  'CreateProduct',
  'ProductCreatedSuccess',
  'PriceHistory',
  'PriceUpdate',
  'CreateAlert',
]);

const styles = StyleSheet.create({
  tabBarSafeArea: {
    backgroundColor: colorTokens.background,
    paddingHorizontal: TAB_BAR_HORIZONTAL_INSET,
    paddingTop: 8,
  },
  tabBarShell: {
    backgroundColor: colorTokens.background,
    borderRadius: 30,
    minHeight: 72,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 10,
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 3,
  },
  tabItemPressed: {
    transform: [{ scale: 0.96 }],
  },
  tabItemIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemLabel: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  tabItemLabelActive: {
    fontFamily: fontFamily.heading,
    fontWeight: '600',
  },
  primaryTabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryTabGlow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    shadowColor: colorTokens.primaryPress,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 5,
  },
  primaryTabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorTokens.primary,
    shadowColor: '#16A34A',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },
  primaryTabPressed: {
    transform: [{ scale: 0.96 }],
  },
});

function getFocusedPurchaseRouteName(state: BottomTabBarProps['state']): string | null {
  const focusedRoute = state.routes[state.index] as BottomTabBarProps['state']['routes'][number] & {
    state?: { index?: number; routes?: Array<{ name: string }> };
  };

  if (focusedRoute.name !== 'NewPurchase') {
    return null;
  }

  const nestedState = focusedRoute.state;
  if (!nestedState || !nestedState.routes || nestedState.routes.length === 0) {
    return 'Scan';
  }

  return nestedState.routes[nestedState.index ?? nestedState.routes.length - 1]?.name ?? null;
}

function PrezioTabBarContent({ state, descriptors, navigation }: BottomTabBarProps) {
  const focusedRouteName = getFocusedPurchaseRouteName(state);
  if (focusedRouteName && immersivePurchaseRoutes.has(focusedRouteName)) {
    return null;
  }

  return (
    <View style={styles.tabBarShell}>
      <View style={styles.tabBarRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const options = descriptors[route.key].options;
          const label = TAB_LABELS[route.name as keyof MainTabParamList] ?? options.title ?? route.name;

          const handlePress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!event.defaultPrevented) {
              if (route.name === primaryTabName) {
                navigation.navigate('NewPurchase', { screen: 'Scan', params: {} });
              } else if (!isFocused) {
                navigation.navigate(route.name);
              }
            }
          };

          if (route.name === primaryTabName) {
            const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel="Escanear producto"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={handlePress}
                style={({ pressed }) => [
                  styles.primaryTabWrap,
                  pressed && styles.primaryTabPressed,
                ]}
              >
                <View style={styles.primaryTabGlow}>
                  <View style={styles.primaryTabButton}>
                    <Icon color={colorTokens.white} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </View>
                </View>
              </Pressable>
            );
          }

          const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
          const tint = isFocused ? colorTokens.primary : colorTokens.textSecondary;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={handlePress}
              style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
            >
              <View style={styles.tabItemIcon}>
                <Icon color={tint} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </View>
              <Text
                fontFamily={isFocused ? '$heading' : '$body'}
                style={[styles.tabItemLabel, isFocused && styles.tabItemLabelActive, { color: tint }]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PrezioTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focusedRouteName = getFocusedPurchaseRouteName(props.state);
  if (focusedRouteName && immersivePurchaseRoutes.has(focusedRouteName)) {
    return null;
  }

  return (
    <View
      style={[
        styles.tabBarSafeArea,
        { paddingBottom: Math.max(insets.bottom, TAB_BAR_BOTTOM_GAP) },
      ]}
    >
      <PrezioTabBarContent {...props} />
    </View>
  );
}

function renderPrezioTabBar(props: BottomTabBarProps) {
  return <PrezioTabBar {...props} />;
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colorTokens.primary,
        tabBarInactiveTintColor: colorTokens.textSecondary,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colorTokens.background,
          borderTopWidth: 0,
          elevation: 0,
          height: 0,
        },
      }}
      tabBar={renderPrezioTabBar}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Inicio' }}
      />
      <Tab.Screen
        name="Comparator"
        component={ComparisonStack}
        options={{ title: 'Comparar' }}
      />
      <Tab.Screen
        name="NewPurchase"
        component={ShoppingSessionStack}
        options={{ title: 'Escanear' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'Historial' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}
