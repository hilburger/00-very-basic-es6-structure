import {
    BoxGeometry, 
    Mesh, 
    MeshStandardMaterial, 
    TextureLoader
} from 'three'

function createCube() {
    // 1. Geometrie: Definiert die Form des Objekts
    // BoxGeometry erstellt einen einfchen Würfel mit Breite, Höhe und Tiefe = 2
    const geometry = new BoxGeometry(2, 2, 2)
    
    // 2. Textur laden: Lädt das Bild, das auf den Würfel gelegt werden soll
    const textureLoader = new TextureLoader()
    const texture = textureLoader.load('/textures/uv_grid_opengl.jpg')
    // Der Pfad '/textures/uv_grid_opengl.jpg' verweist auf die Datei
    // im '/publich/textures'-Ordner (Vire stellt 'public' im Root bereit)

    // 3. Materil: Definiert das Aussehen der Oberfläche (Farbe, Textur, Glanz etc.)
    // MeshStandardMaterisl ist ein physikalisch basiertes Material, das gut auf Lichter reagiert
    const material = new MeshStandardMaterial({
        map: texture, //weist die geladene Textur als Haupttextur (Licht) zu
    })

    // 4. Mesh: Kombiniert Geometrie und Material zu einem renderbaren 3D-Objekt
    const cube = new Mesh(geometry, material)

    // Positioniert den Würfel leicht nach oben (entlang der Y-Achse)
    // damit er auf der Bodenplatte liegt
    cube.position.y = 1.1

    // Gib dem WÜrfel eine leichte anfängliche Rotation für eine interessante Ansicht
    // Rotation wird in Radiant angegeben (um x, y, z Achse)
    cube.rotation.set(-0.5, -0.1, 0.8)
}

export { createCube }