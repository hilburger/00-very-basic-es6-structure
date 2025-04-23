import {
    PlaneGeometry, 
    Mesh, 
    MeshStandardMaterial, 
    DoubleSide
} from 'three'

function createPlane() {
    // 1. Geometrie: Eine einfache flache Ebene
    // Parameter: Breite, Höhe
    const geometry = new PlaneGeometry(10, 10)

    // 2. Material: Ein einfaches Standardmaterial ohne Textur
    const material = new MeshStandardMaterial({
        color: 'darkgrey', 
        side: DoubleSide
    })

    // 3. Mesh: Kombiniert Geometrie und Material
    const plane = new Mesh(geometry, material)

    // Dreht die Ebene um 90 Grad um X-Achse
    // Standardmäßig wird eine Plane in der XY-Ebene (stehend) erstellt
    // Wir wollen sie aber flach auf dem "Boden" liegen haben (XZ-Ebene)
    plane.rotation.x = -Math.PI * 0.5 // Math.PI ist 180 und Math.PI / 2 ist 90 Grad

    // Positioniert die Ebene im Ursprung (optional da 0 Standard ist)
    plane.position.y = 0

    return plane
}

export { createPlane }