// ============================================================
// AppNavigator.tsx — Navegació principal de l'app Ernest
// Tabs: Inici, Mètriques, Alertes, Dispositiu
// Massiu Soft SL
// ============================================================
import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NavigationContainer } from '@react-navigation/native'
import { Text, View } from 'react-native'
import { useAppStore } from '../store'

import HomeScreen    from '../screens/HomeScreen'
import MetricsScreen from '../screens/MetricsScreen'
import AlertsScreen  from '../screens/AlertsScreen'
import DeviceScreen  from '../screens/DeviceScreen'
import EnergyScreen  from '../screens/EnergyScreen'

const Tab = createBottomTabNavigator()

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Inici:      '🏠',
    Energia:    '⚡',
    Mètriques:  '📊',
    Alertes:    '🔔',
    Dispositiu: '📡',
  }
  return (
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[name] ?? '●'}
    </Text>
  )
}

function BadgedIcon({ name, focused, count }: { name: string; focused: boolean; count?: number }) {
  return (
    <View>
      <TabIcon name={name} focused={focused} />
      {count && count > 0 ? (
        <View style={{
          position: 'absolute', top: -4, right: -8,
          backgroundColor: '#B71C1C', borderRadius: 8,
          minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function AppNavigator() {
  const { alerts } = useAppStore()
  const unreadCount = alerts.filter(a => !a.is_read).length

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopColor: '#E0E7EF',
            paddingBottom: 6,
            height: 60,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarActiveTintColor:   '#1565C0',
          tabBarInactiveTintColor: '#607D8B',
          headerStyle: { backgroundColor: '#FFFFFF', shadowColor: 'transparent', elevation: 0 },
          headerTitleStyle: { fontWeight: '800', color: '#1A1A2E' },
        }}
      >
        <Tab.Screen
          name="Inici"
          component={HomeScreen}
          options={{
            title: 'Ernest',
            tabBarIcon: ({ focused }) => <TabIcon name="Inici" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Energia"
          component={EnergyScreen}
          options={{
            title: 'Energia',
            tabBarIcon: ({ focused }) => <TabIcon name="Energia" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Mètriques"
          component={MetricsScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon name="Mètriques" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Alertes"
          component={AlertsScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <BadgedIcon name="Alertes" focused={focused} count={unreadCount} />
            ),
          }}
        />
        <Tab.Screen
          name="Dispositiu"
          component={DeviceScreen}
          options={{
            title: 'Dispositiu BLE',
            tabBarIcon: ({ focused }) => <TabIcon name="Dispositiu" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
