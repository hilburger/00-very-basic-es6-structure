// src/World/components/Plane.js 20:29
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
     * @param {string} [config.name='GroundPlane'] - Name des Objekts
     * @param {boolean} [config.receiveShadow=true]
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
            name: 'GroundPlane', 
            receiveShadow: true
            // Materialeigenschaften kommen hier später dazu
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

        // 2. Geometry und Material erstellen
        const geometry = Plane._createGeometry(mergedConfig)

        // TODO: Später erweitern für Texturen, Roughness, Metallness
        const material = new MeshStandardMaterial({
            color: mergedConfig.color, 
            side: DoubleSide // Wichtig, damit man sie auch von unten sieht
        })

        // 3. super() aufrufen (Konstruktor der Basisklasse THREE.Mesh)
        // Muss VOR dem ersten Zugriff auf 'this' geschehen
        super(geometry, material)

        this.#currentConfig = mergedConfig

        // 4. Name und Schatten setzen
        this.name = this.#currentConfig.name
        this.receiveShadow = this.#currentConfig.receiveShadow
        // castShadow ist für eine Bodenplatte meistens false
        this.castShadow = config.castShadow !== undefined ? config.castShadow : false

        // 5. Standard-Ausrichtung als Bodenplatte
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
        // Nur relevante Teile der Config aktualisieren
        this.#currentConfig.shape = newConfig.shape !== undefined ? newConfig.shape : this.#currentConfig.shape
        this.#currentConfig.size.width = newConfig.size?.width !== undefined ? newConfig.size.width : this.#currentConfig.size.width
        this.#currentConfig.size.height = newConfig.size?.height !== undefined ? newConfig.size.height : this.#currentConfig.size.height
        this.#currentConfig.size.radius = newConfig.size?.radius !== undefined ? newConfig.size.radius : this.#currentConfig.size.radius
        this.#currentConfig.segments = newConfig.segments !== undefined ? newConfig.segments : this.#currentConfig.segments
        // Farbe etc. wird seperat behandelt oder auch hier, falls gewünscht

        if (this.geometry) {
            this.geometry.dispose()
        }
        this.geometry = Plane._createGeometry(this.#currentConfig)
        // Die Geometrie wurde ersetzt, Three.js sollte das beim nächsten Render-Zyklus erkennen. 
        // this.geometry.needsUpdate = true // Ist bei direktem Austausch nicht unbedingt nötig

        console.log(`Plane '${this.name}' aktualisiert. Form: ${this.#currentConfig.shape}, Maße:`, this.#currentConfig.size)
    }

    // Getter für die aktuelle Konfiguration (wird für den Export benötigt)
    getCurrentConfig() {
        // Gibt eine Kopie zurück, um externe Modifikation zu vermeiden
        return JSON.parse(JSON.stringify(this.#currentConfig))
    }

    // Später: Methoden zum Aktualisieren des Materials
    // updateMaterial(materialConfig) { ... }
}

export { Plane }