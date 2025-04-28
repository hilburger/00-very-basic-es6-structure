import {
    BoxGeometry, 
    Mesh, 
    MeshStandardMaterial, 
    Texture // Optional: Für Typ-Hinweise, falls gewünscht
} from 'three'
// Wichtig: Da wir eine Komponenten-Klasse heiraus gemacht haben, 
// wird der Loader hier NICHT mehr direkt importiert/genutzt!
// War: import { loadTexture } from '..system/assetLoader.js'

class Cube extends Mesh { // Erbt von THREE.Mesh
    /**
     * Erstellt einen neuen Würfel.
     * @param {object} config - Konfigurationsobjekt
     * @param {number} [config.size=2] - Kantenlänge des Würfels
     * @param {string} [config.color='#ffffff'] - Farbe, falls keine Textur verwendet wird.
     * @param {Texture} [config.map=null] - Eine bereits VORGELADENE Textur für das Material.
     * @param {string} [config.name='Cube'] - Name des Objekts
     */
    
    constructor(config = {}) {
        // 1. Geometrie erstellen
        const size = config.size // Standardgröße 2, falls nicht in config angegeben
        const geometry = new BoxGeometry(size, size, size)

        // 2. Material erstellen
        const materialConfig = {}
        if (config.map) {
            materialConfig.map = config.map // Verwende die übergebene Txtur
        } else {
            materialConfig.color = config.color || '#ffffff' // Standardfarbe weiß
        }
        const material = new MeshStandardMaterial(materialConfig)

        // 3. super() aufrufen (Konstuktor der Basisklasse THREE.Mesh)
        // Übergibt die erstellte Geometrie und das Material an den Mesh-Konstruktor
        super(geometry, material)

        // 4. Namen setzen
        this.name = config.name || 'Cube' // Setze den Namen des Mesh-Objekts

        // 5. Optional: Spezifische Eigenschaften oder Methoden für Cube
        // z.B. this.isInteractive = true
        // oder spätere Methoden, wie update(delta), onClick() etc.

        console.log(`Cube Instanz '${this.name}' erstellt.`)
    }

    // --- Beispiel für eine spätere Methode ---
    // update(delta) {
    //   // Animationslogik für diesen Würfel
    //   this.rotation.y += delta;
    // }

    // --- Beispiel für eine spätere Methode ---
    // onClick(eventData) {
    //   console.log(`Cube '${this.name}' wurde geklickt!`, eventData);
    // }
}

export { Cube }