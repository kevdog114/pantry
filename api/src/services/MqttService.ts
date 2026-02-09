import * as mqtt from 'mqtt';

export type BarcodeType = 'Recipe' | 'Product' | 'StockItem' | 'HomeAssistant' | 'Unknown';

export interface BarcodeScanEvent {
    kioskId: number;
    barcode: string;
    barcodeType: BarcodeType;
    timestamp: string;
}

class MqttService {
    private client: mqtt.MqttClient | null = null;
    private connected: boolean = false;
    private enabled: boolean = false;
    private topicPrefix: string = 'pantry';

    constructor() {
        this.initialize();
    }

    private initialize() {
        const broker = process.env.MQTT_BROKER;
        if (!broker) {
            console.log('[MQTT] MQTT_BROKER not set, MQTT integration disabled.');
            return;
        }

        this.enabled = true;
        const port = parseInt(process.env.MQTT_PORT || '1883', 10);
        const user = process.env.MQTT_USER;
        const password = process.env.MQTT_PASSWORD;
        this.topicPrefix = process.env.MQTT_TOPIC_PREFIX || 'pantry';

        const protocol = broker.startsWith('mqtt') ? '' : 'mqtt://';
        const brokerUrl = `${protocol}${broker}:${port}`;

        console.log(`[MQTT] Connecting to ${brokerUrl}...`);

        const options: mqtt.IClientOptions = {
            clientId: `pantry_api_${Date.now()}`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 5000,
        };

        if (user && password) {
            options.username = user;
            options.password = password;
        }

        this.client = mqtt.connect(brokerUrl, options);

        this.client.on('connect', () => {
            this.connected = true;
            console.log('[MQTT] Connected to broker');
            this.publishAvailability('online');
            this.publishDiscovery();
        });

        this.client.on('error', (err) => {
            console.error('[MQTT] Connection error:', err.message);
        });

        this.client.on('offline', () => {
            this.connected = false;
            console.log('[MQTT] Disconnected from broker');
        });

        this.client.on('reconnect', () => {
            console.log('[MQTT] Reconnecting...');
        });
    }

    private publishAvailability(status: 'online' | 'offline') {
        if (!this.client || !this.connected) return;
        this.client.publish(
            `${this.topicPrefix}/api/status`,
            status,
            { retain: true }
        );
    }

    private publishDiscovery() {
        if (!this.client || !this.connected) return;

        // Publish HA MQTT Device Trigger discovery for barcode scans
        const discoveryTopic = `homeassistant/device_automation/${this.topicPrefix}_barcode/config`;
        const config = {
            automation_type: 'trigger',
            type: 'barcode_scan',
            subtype: 'any',
            topic: `${this.topicPrefix}/events/barcode_scan`,
            device: {
                identifiers: [`${this.topicPrefix}_api`],
                name: 'Pantry',
                model: 'Pantry API',
                manufacturer: 'Pantry App',
                sw_version: '1.0'
            }
        };

        this.client.publish(discoveryTopic, JSON.stringify(config), { retain: true });
        console.log('[MQTT] Published HA discovery config');
    }

    /**
     * Determine the barcode type based on its prefix.
     */
    public determineBarcodeType(barcode: string): BarcodeType {
        const lower = barcode.toLowerCase();
        if (lower.startsWith('ha:')) return 'HomeAssistant';
        if (lower.startsWith('r-')) return 'Recipe';
        if (lower.startsWith('sk-') || lower.startsWith('s2-')) return 'StockItem';
        // If it doesn't match any known pantry prefix, treat as Product
        return 'Product';
    }

    /**
     * Publish a barcode scan event to MQTT.
     */
    public publishBarcodeScan(kioskId: number, barcode: string, barcodeType?: BarcodeType) {
        if (!this.enabled || !this.client || !this.connected) return;

        const type = barcodeType || this.determineBarcodeType(barcode);

        // Strip the HA: prefix from the data sent to HA so the automation
        // receives the actual payload the user encoded in the barcode
        let barcodeData = barcode;
        if (type === 'HomeAssistant') {
            barcodeData = barcode.substring(3); // Remove "HA:" prefix
        }

        const event: BarcodeScanEvent = {
            kioskId,
            barcode: barcodeData,
            barcodeType: type,
            timestamp: new Date().toISOString()
        };

        const topic = `${this.topicPrefix}/events/barcode_scan`;
        this.client.publish(topic, JSON.stringify(event));
        console.log(`[MQTT] Published barcode scan event: ${type} - ${barcodeData} (Kiosk ${kioskId})`);
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public isConnected(): boolean {
        return this.connected;
    }
}

// Singleton instance
const mqttService = new MqttService();
export default mqttService;
