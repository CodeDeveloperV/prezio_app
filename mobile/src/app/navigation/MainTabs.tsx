import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  NewPurchase: 'Nueva compra',
  History: 'Historial',
  Profile: 'Perfil',
} as const;

const primaryTabName = 'NewPurchase';

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colorTokens.background,
  },
  tabBarShell: {
    backgroundColor: colorTokens.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: -8,
    },
    elevation: 18,
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 56,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 2,
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
    lineHeight: 13,
  },
  primaryTabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 72,
  },
  primaryTabGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  primaryTabButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
    elevation: 12,
  },
  primaryTabButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
});

function PrezioTabBarContent({ state, descriptors, navigation }: BottomTabBarProps) {
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

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (route.name === primaryTabName) {
            const Icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={handlePress}
                style={({ pressed }) => [
                  styles.primaryTabWrap,
                  pressed && styles.primaryTabButtonPressed,
                ]}
              >
                <View style={styles.primaryTabGlow}>
                  <View style={styles.primaryTabButton}>
                    <Icon color={colorTokens.white} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
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
              style={styles.tabItem}
            >
              <View style={styles.tabItemIcon}>
                <Icon color={tint} size={22} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </View>
              <Text fontFamily="$body" style={[styles.tabItemLabel, { color: tint }]}>
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
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <PrezioTabBarContent {...props} />
    </SafeAreaView>
  );
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
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 0,
        },
      }}
      tabBar={PrezioTabBar}
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
        options={{ title: 'Nueva compra' }}
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
