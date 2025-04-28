import {
    PlaneGeometry,
    Mesh, 
    MeshStandardMaterial,
    DoubleSide
} from 'three'

class Plane extends Mesh { // Erbt von THREE.Mesh
    /**
     * Erstellt eine neue Bodenplatte (Plane).
     * Setzt die Rotation automatisch, um flach zu liegen. 
     * @param {object} config - Konfigurationsobjekt
     * @param {object} [config.size={width: 10, height: 10}] - Breite und Tiefe der Ebene
     * @param {string} [config.color='darkgrey'] - Farbe der Ebene
     * @param {string} [config.name='GroundPlane'] - Name des Objekts
     */
    constructor(config = {}) {
        // 1. Geometry erstellen
        const sizeWidth = config.size?.width || 10 // Standardbreite 10
        const sizeHeight = config.size?.height || 10 // Standardtiefe 10 (obwohl PlaneGeometry Höhe sagt, wird halt senkrecht zu Cam erstellt...)
        const geometry = new PlaneGeometry(sizeWidth, sizeHeight)

        // 2. Material erstellen
        const material = new MeshStandardMaterial({
            color: config.color || 'darkgrey', // Standardfarbe
            side: DoubleSide // Wichtig, damit man sie auch von unten sieht
        })

        // 3. super() aufrufen (Konstruktor der Basisklasse THREE.Mesh)
        super(geometry, material)

        // 4. Name setzen
        this.name = config.name || 'GroundPlane'

        // 5. Standard-Ausrichtung als Bodenplatte
        // Wir setzen die Roatation direkt hier, da diese Klasse die Bodenplatte repräsentiert.
        this.rotation.x = - Math.PI * 0.5 // Fläche um 90 Grad auf XZ-Ebene legen.

        // Die Y-Position wird standardmäßig 0 sein, was passt.
        // Sie kann aber später durch die Konfiguration in World.js überschrieben werden.

        console.log(`Plane-Instanz (Bodenplatte) '${this.name}' erstellt.`)
    }
}

export { Plane }