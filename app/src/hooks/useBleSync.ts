// ============================================================
// useBleSync.ts — Hook principal BLE + sincronització backend
// Massiu Soft SL
// ============================================================
import { useEffect, useCallback, useRef } from 'react'
import { AppState as RNAppState } from 'react-native'
import { bleService } from '../services/ble'
import { ingestReadings } from '../services/api'
import { useAppStore } from '../store'
import type { SensorPacket } from '../services/ble'

const MAX_BUFFER = 500   // Màxim paquets a acumular en memòria

export function useBleSync(dogId: string | undefined, deviceId: string | undefined) {
  const { setBle, setLastSync, setPending } = useAppStore()
  const bufferRef = useRef<SensorPacket[]>([])
  const syncing   = useRef(false)

  // Enviar paquets acumulats al backend
  const flush = useCallback(async () => {
    if (!dogId || !deviceId || syncing.current || bufferRef.current.length === 0) return
    syncing.current = true

    const toSend = [...bufferRef.current]
    bufferRef.current = []
    setPending(0)

    try {
      const res = await ingestReadings(dogId, deviceId, toSend)
      setLastSync(new Date())
      console.log(`[BLE] Ingerit ${res.ingested} lectures`)
    } catch (err) {
      // Si falla, retornem els paquets al buffer
      bufferRef.current = [...toSend, ...bufferRef.current].slice(-MAX_BUFFER)
      setPending(bufferRef.current.length)
      console.warn('[BLE] Error ingest, paquets retornats al buffer', err)
    } finally {
      syncing.current = false
    }
  }, [dogId, deviceId])

  // Configurar callbacks del servei BLE
  useEffect(() => {
    bleService.setOnStatus((status, msg) => setBle(status, msg))

    bleService.setOnPacket((pkts) => {
      bufferRef.current = [...bufferRef.current, ...pkts].slice(-MAX_BUFFER)
      setPending(bufferRef.current.length)

      // Flush automàtic cada 50 paquets (~4 minuts de dades)
      if (bufferRef.current.length >= 50) flush()
    })

    // Flush quan l'app va a background
    const sub = RNAppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        bleService.flushBuffer()
        flush()
      }
    })

    return () => { sub.remove() }
  }, [flush])

  const connect = useCallback(async () => {
    try {
      await bleService.connect()
    } catch (e) {
      console.error('[BLE] Error connexió', e)
    }
  }, [])

  const disconnect = useCallback(async () => {
    await bleService.disconnect()
  }, [])

  return { connect, disconnect, flush }
}
