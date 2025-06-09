// src/World/components/Plane.js 16:23
import {
    PlaneGeometry,
    CircleGeometry,
    Mesh, 
    MeshStandardMaterial,
    DoubleSide
} from 'three'

class Plane extends Mesh { // Erbt von THREE.Mesh
    #currentConfig // Private Eigenschaft zum Speichernd er aktuellen Konfiguration

    /**
     * Erstellt eine neue Bodenplatte (Plane).
     * Setzt die Rotation automatisch, um flach zu liegen (Boden). 
     * @param {object} config - Konfigurationsobjekt
     * @param {string} [config.shape='rectangle'] - Form der Ebene ('rectangle' oder 'circle')
     * @param {object} [config.size={width: 10, height: 10, radius: 5}] - Breite, Tiefe und Radius der Ebene
     * @param {number} [config.size.width=10] - Breite für Rechteck
     * @param {number} [config.size.height=10] - Tiefe für Rechteck
     * @param {number} [config.size.radius=5] - Radius für Kreis
     * @param {number} [config.segments=32] - Segmente für Kreis
     * @param {string} [config.color='darkgrey'] - Farbe der Ebene
     * @param {THREE.Texture | null} [config.map=null] - Einebereits geladene Texture für das Material
     * @param {number} [config.roughness=0.5]
     * @param {number} [config.metalness=0.5]
     * @param {string} [config.name='GroundPlane'] - Name des Objekts
     * @param {boolean} [config.receiveShadow=true]
     * @param {boolean} [config.castShadow= false]
     */
    constructor(config = {}) {
        // 1. Standardkonfiguration definieren und mit übergebener Config mergen
        const defaultConfig = {
            shape: 'rectangle', 
            size: {
                width: 10, 
                height: 10, 
                radius: 5, // Standardradius, falls Kreis gewählt wird
            }, 
            segments: 32, // Standardsegmente für den Kreis
            color: 'darkgrey', 
            map: null,
            roughness: 0.5,
            metalness: 0.5,  
            name: 'GroundPlane', 
            receiveShadow: true, 
            castShadow: false
        }

        // Config deep mergen (mit einfacher Ausnahme für size, damit alle Unterwerte korrekt gemerged werden)
        const mergedConfig = {
            ...defaultConfig, 
            ...config,
            size: {
                ...defaultConfig.size,
                ...(config.size || {}),
            },
        }

        // Stelle sicher, dass color ein THREE.Color Objekt ist, falls es als String kommt
        // mergedConfig.color = new Color(mergedConfig.color) // Wird direkt im Material gemacht

        this.#currentConfig = mergedConfig // Speichere die gemergte Konfiguration 

        // 2. Geometry und Material erstellen
        const geometry = Plane._createGeometry(this.#currentConfig)

        // 3. Material erstellen mit den neuen PBR-Eigenschaften
        const material = new MeshStandardMaterial({
            color: this.#currentConfig.color, 
            map: this.#currentConfig.map, 
            roughness: this.#currentConfig.roughness, 
            metalness: this.#currentConfig.metalness, 
            side: DoubleSide // Wichtig, damit man sie auch von unten sieht
        })

        // 4. super() aufrufen (Konstruktor der Basisklasse THREE.Mesh)
        // Muss VOR dem ersten Zugriff auf 'this' geschehen
        super(geometry, material)

        // 5. Name und Schatten setzen
        this.name = this.#currentConfig.name
        this.receiveShadow = this.#currentConfig.receiveShadow
        // castShadow ist für eine Bodenplatte meistens false
        this.castShadow = config.castShadow !== undefined ? config.castShadow : false

        // 6. Standard-Ausrichtung als Bodenplatte
        // Wir setzen die Roatation direkt hier, da diese Klasse die Bodenplatte repräsentiert.
        this.rotation.x = - Math.PI * 0.5 // Fläche um 90 Grad auf XZ-Ebene legen.

        // Die Y-Position wird standardmäßig 0 sein, was passt.
        // Sie kann aber später durch die Konfiguration in World.js überschrieben werden.

        console.log(`Plane-Instanz (Bodenplatte) '${this.name}' erstellt mit Form: ${this.#currentConfig.shape}`)
    }

    static _createGeometry(config) {
        if (config.shape === 'circle') {
            return new CircleGeometry(config.size.radius, config.segments)
        }
        // Default ist 'rectangle
        return new PlaneGeometry(config.size.width, config.size.height)
    }

    // Methode zum Aktualisieren der Geometrie
    updatePlane(newConfig) {
        const oldShape = this.#currentConfig.shape
        let geometryChanged = false

        if (newConfig.shape !== undefined && newConfig.shape !== this.#currentConfig.shape) {
            this.#currentConfig.shape = newConfig.shape
            geometryChanged = true
        }
        if (newConfig.size?.width !== undefined && newConfig.size.width !== this.#currentConfig.size.width) {
            this.#currentConfig.size.width = newConfig.size.width
            if (this.#currentConfig.shape === 'rectangle') geometryChanged = true
        }
        if (newConfig.size?.height && newConfig.size.height !== this.#currentConfig.size.height) {
            this.#currentConfig.size.height = newConfig.size.height
            if (this.#currentConfig.shape === 'rectangle') geometryChanged = true
        }
        if (newConfig.size?.radius !== undefined && newConfig.size.radius !== this.#currentConfig.size.radius) {
            this.#currentConfig.size.radius = newConfig.size.radius
            if (this.#currentConfig.shape === 'circle') geometryChanged = true
        }
        if (newConfig.segments !== undefined && newConfig.segments !== this.#currentConfig.segments) {
            this.#currentConfig.segments = newConfig.segments
            if (this.#currentConfig.shape === 'circle') geometryChanged = true
        }

        if (geometryChanged) {
            if (this.geometry) {
                this.geometry.dispose()
            }
            this.geometry = Plane._createGeometry(this.#currentConfig)
            console.log(`Plane '${this.name}' Geometrie aktualisiert. Form: ${this.#currentConfig.shape}, Maße: `, this.#currentConfig.size)
        }

        // Materialeigenschaften aktualisieren
        let materialChanged = false
        if (newConfig.color !== undefined && newConfig.color !== this.material.color.getHexString()) {
            this.material.color.set(newConfig.color)
            this.#currentConfig.color = this.material.color.getHexString() // Speichere als Hex für config
            materialChanged = true
        }
        if (newConfig.map !== undefined && newConfig.map !== this.material.map) {
            this.material.map = newConfig.map // Erwartet ein Texture-Objekt oder null
            this.#currentConfig.map = newConfig.map // Speichere das Texture-Objekt (oder null)
            materialChanged = true
        }
        if (newConfig.roughness !== undefined && newConfig.roughness !== this.material.roughness) {
            this.material.roughness = newConfig.roughness
            this.#currentConfig.roughness = newConfig.roughness
            materialChanged = true
        }
        if (newConfig.metalness !== undefined && newConfig.metalness !== this.material.metalness) {
            this.material.metalness = newConfig.metalness
            this.#currentConfig.metalness = newConfig.metalness
            materialChanged = true
        }

        if (materialChanged) {
            this.material.needsUpdate = true
            console.log(`Plane '${this.name}' Material aktualisiert: `, { 
                color: this.#currentConfig.color, 
                map: !!this.#currentConfig.map, 
                roughness: this.#currentConfig.roughness, 
                metalness: this.#currentConfig.metalness
            })
        }

        // Andere Eigenschaften wie Name, castShadow, receiveShadow
        if (newConfig.name !== undefined) this.name = newConfig.name // Name ist keine EIgenschaft von #currentConfig, da direkt auf Mesh gesetzt
        if (newConfig.castShadow !== undefined ) this.castShadow = newConfig.castShadow
        if (newConfig.receiveShadow !== undefined) this.receiveShadow = newConfig.receiveShadow
    }

    // Getter für die aktuelle Konfiguration (wird für den Export benötigt)
    getCurrentConfig() {
        // Gibt eine Kopie zurück, um externe Modifikation zu vermeiden
        // Map wird hier als Boolean (ob vorhanden) exportiert, da das Texture-Objekt selbst nicht JSON-serialisierbar ist
        // World.js muss beim Export die ursprüngliche URL oder einen Platzhalter verwalten
        const exportConfig = { ...this.#currentConfig }
        if (this.#currentConfig.map) { // Wenn eine Textur vorhanden ist
            // Hier müsste World.js die ursprüngliche URL speichern und für den Export verwenden.
            // Plane.js kennt nur das Texture-Objekt. Für den Moment als true/false.
            exportConfig.mapUrl = this.#currentConfig.map.name || true // Placeholder, name might containt URL if set by loader
        } else {
            delete exportConfig.mapUrl
        }
        delete exportConfig.map // Entferne das nicht serialisierbare Texture-Objekt

        return JSON.parse(JSON.stringify(exportConfig))
    }

    // Später: Methoden zum Aktualisieren des Materials
    // updateMaterial(materialConfig) { ... }
}

export { Plane }