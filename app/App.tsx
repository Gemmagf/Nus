// ============================================================
// App.tsx — Entry point de l'app Ernest (React Native + Expo)
// Massiu Soft SL
// ============================================================
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { AppNavigator } from './src/navigation/AppNavigator'
import { supabase } from './src/services/api'
import { useAppStore } from './src/store'

export default function App() {
  const { setUserId } = useAppStore()

  useEffect(() => {
    // Detectar sessió activa de Supabase
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })

    return () => { listener.subscription.unsubscribe() }
  }, [])

  return (
    <>
      <StatusBar style="auto" />
      <AppNavigator />
    </>
  )
}
