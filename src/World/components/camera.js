import { PerspectiveCamera } from 'three'

function createCamera() {
    // Erstellt eine perspektivische Kamera, die das menschliche Auge simuliert
    const camera = new PerspectiveCamera(
        75,     // Field of View (FOV), vertikal!
        1,      // Aspect ration BxH
        0.1,    // Near Clipping Plane
        100     // Far Clipping Plane
    )

    camera.position.set(0, 2, 5)

    return camera
}

export { createCamera }