// ============================================================
// ble.ts — Servei BLE per connectar amb el dispositiu Ernest
// Massiu Soft SL
// ============================================================
import { BleManager, Device, State, Characteristic } from 'react-native-ble-plx'
import { Buffer } from 'buffer'

// UUIDs del GATT profile (han de coincidir amb el firmware)
export const BLE_SERVICE_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c3319100'
export const BLE_CHAR_SENSOR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
export const BLE_CHAR_CONFIG_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a9'
export const BLE_CHAR_STATUS_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26aa'

// Estructura del paquet BLE (ha de coincidir amb SensorPacket del firmware)
export interface SensorPacket {
  timestamp:   number   // Unix timestamp (s)
  acc_x:       number   // g (dividit per 100)
  acc_y:       number
  acc_z:       number
  gyro_x:      number   // °/s (dividit per 10)
  gyro_y:      number
  gyro_z:      number
  temp_surface:number   // °C (dividit per 100)
  battery_pct: number   // 0-100
  seq:         number   // 0-255
}

// Parsejar paquet binari rebut per BLE
export function parseSensorPacket(data: string): SensorPacket | null {
  try {
    const buf = Buffer.from(data, 'base64')
    if (buf.length < 20) return null
    // Layout: uint32 + 6×int16 + int16 + uint8 + uint8 = 4+12+2+1+1 = 20 bytes
    const view = new DataView(buf.buffer, buf.byteOffset)
    return {
      timestamp:    view.getUint32(0,  true),
      acc_x:        view.getInt16(4,   true) / 100,
      acc_y:        view.getInt16(6,   true) / 100,
      acc_z:        view.getInt16(8,   true) / 100,
      gyro_x:       view.getInt16(10,  true) / 10,
      gyro_y:       view.getInt16(12,  true) / 10,
      gyro_z:       view.getInt16(14,  true) / 10,
      temp_surface: view.getInt16(16,  true) / 100,
      battery_pct:  view.getUint8(18),
      seq:          view.getUint8(19),
    }
  } catch {
    return null
  }
}

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error'

export class ErnestBleService {
  private manager:     BleManager
  private device:      Device | null = null
  private packetBuffer: SensorPacket[] = []
  private onPacket?:   (pkts: SensorPacket[]) => void
  private onStatus?:   (status: BleStatus, msg?: string) => void
  private subscription: any = null

  constructor() {
    this.manager = new BleManager()
  }

  setOnPacket(cb: (pkts: SensorPacket[]) => void)       { this.onPacket = cb }
  setOnStatus(cb: (s: BleStatus, msg?: string) => void) { this.onStatus = cb }

  private emit(s: BleStatus, msg?: string) { this.onStatus?.(s, msg) }

  // Esperar que el Bluetooth estigui encès
  async waitForBluetooth(): Promise<void> {
    return new Promise(resolve => {
      const sub = this.manager.onStateChange(state => {
        if (state === State.PoweredOn) { sub.remove(); resolve() }
      }, true)
    })
  }

  // Escanejar i connectar al primer dispositiu "Ernest" trobat
  async connect(): Promise<void> {
    await this.waitForBluetooth()
    this.emit('scanning', 'Buscant dispositiu Ernest...')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan()
        this.emit('error', 'Dispositiu no trobat. Assegura\'t que l\'arnès és encès.')
        reject(new Error('timeout'))
      }, 15_000)

      this.manager.startDeviceScan(null, null, async (err, device) => {
        if (err) { clearTimeout(timeout); this.emit('error', err.message); reject(err); return }
        if (!device?.name?.startsWith('Ernest')) return

        clearTimeout(timeout)
        this.manager.stopDeviceScan()
        this.emit('connecting', `Connectant a ${device.name}...`)

        try {
          this.device = await device.connect()
          await this.device.discoverAllServicesAndCharacteristics()
          this.emit('connected', `Connectat a ${this.device.name}`)
          this._subscribeToSensorData()
          resolve()
        } catch (e: any) {
          this.emit('error', e.message)
          reject(e)
        }
      })
    })
  }

  private _subscribeToSensorData() {
    if (!this.device) return
    this.subscription = this.device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_CHAR_SENSOR_UUID,
      (err, char) => {
        if (err || !char?.value) return
        const pkt = parseSensorPacket(char.value)
        if (!pkt) return

        this.packetBuffer.push(pkt)
        // Flush el buffer al callback cada 10 paquets (50s de dades)
        if (this.packetBuffer.length >= 10) {
          this.onPacket?.([...this.packetBuffer])
          this.packetBuffer = []
        }
      }
    )
  }

  // Forçar flush del buffer (per exemple, quan l'app va a background)
  flushBuffer() {
    if (this.packetBuffer.length > 0) {
      this.onPacket?.([...this.packetBuffer])
      this.packetBuffer = []
    }
  }

  async disconnect() {
    this.subscription?.remove()
    this.flushBuffer()
    if (this.device) {
      await this.device.cancelConnection().catch(() => {})
      this.device = null
    }
    this.emit('idle')
  }

  isConnected() { return this.device !== null }
  getDeviceName() { return this.device?.name ?? null }
}

export const bleService = new ErnestBleService()
