// ============================================================
// app.config.js — Configuració Expo + EAS Build
// Ernest · Massiu Soft SL
//
// Ús:
//   expo start                  → dev local
//   eas build --profile preview → APK de test
//   eas build --profile production → App Store / Google Play
//
// Variables d'entorn requerides (definides a eas.json o .env):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   EXPO_PUBLIC_API_URL
//   EXPO_PUBLIC_SENTRY_DSN  (opcional)
// ============================================================

export default ({ config }) => ({
  ...config,

  // ── Identificadors ──────────────────────────────────────────
  name:        'Ernest',
  slug:        'ernest-app',
  version:     '1.0.0',
  description: 'Sistema intel·ligent de monitorització de salut canina',

  // ── Orientació i aparença ───────────────────────────────────
  orientation:     'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0f172a',

  icon:    './assets/icon.png',
  splash: {
    image:           './assets/splash.png',
    resizeMode:      'contain',
    backgroundColor: '#0f172a',
  },

  // ── Variables d'entorn (accessibles a l'app via Constants.expoConfig.extra) ──
  extra: {
    supabaseUrl:     process.env.EXPO_PUBLIC_SUPABASE_URL     || '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    apiUrl:          process.env.EXPO_PUBLIC_API_URL           || 'http://localhost:3001',
    sentryDsn:       process.env.EXPO_PUBLIC_SENTRY_DSN        || '',
    easProjectId:    process.env.EAS_PROJECT_ID                || '',
  },

  // ── EAS (build al núvol) ─────────────────────────────────────
  eas: {
    projectId: process.env.EAS_PROJECT_ID || 'POSA_AQUI_L_EAS_PROJECT_ID',
  },

  // ── iOS ──────────────────────────────────────────────────────
  ios: {
    bundleIdentifier: 'com.massiusoft.ernest',
    buildNumber:      '1',
    supportsTablet:   false,
    infoPlist: {
      NSBluetoothAlwaysUsageDescription:
        'Ernest necessita Bluetooth per connectar amb l\'arnès del teu gos.',
      NSBluetoothPeripheralUsageDescription:
        'Ernest necessita Bluetooth per llegir les dades de l\'arnès.',
      NSLocationWhenInUseUsageDescription:
        'Opcional: Ernest pot usar la ubicació per millorar la detecció de passejades.',
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },

  // ── Android ──────────────────────────────────────────────────
  android: {
    package:         'com.massiusoft.ernest',
    versionCode:     1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    permissions: [
      'BLUETOOTH',
      'BLUETOOTH_ADMIN',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'FOREGROUND_SERVICE',
    ],
  },

  // ── Plugins ──────────────────────────────────────────────────
  plugins: [
    // BLE (react-native-ble-plx requereix configuració nativa)
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: true,
        modes:               ['peripheral', 'central'],
        bluetoothAlwaysPermission:
          'Permet a Ernest llegir dades de l\'arnès del teu gos via Bluetooth.',
      },
    ],
    // Expo Updates (OTA updates en producció)
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '15.1',
          newArchEnabled:   false,  // BLE requereix arquitectura antiga per ara
        },
        android: {
          compileSdkVersion:  34,
          targetSdkVersion:   34,
          minSdkVersion:      24,
          newArchEnabled:     false,
        },
      },
    ],
  ],

  // ── Updates (OTA sense re-build) ─────────────────────────────
  updates: {
    enabled:          true,
    fallbackToCacheTimeout: 0,
    url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID || 'POSA_AQUI_L_EAS_PROJECT_ID'}`,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
})
