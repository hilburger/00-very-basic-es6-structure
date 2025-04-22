import { Color, Scene } from 'three'

function createScene() {
    // Erstellt eine neue, leere Three.js Szene
    const scene = new Scene()

    // Setzt eine Hintergrundfarbe für die gesamte Szene
    // 'skyblue' ist ein CSS-Farbname, Three.js wandelt ihn um
    scene.background = new Color('skyblue')

    // Gibt die erstellte Szene zurück, damit sie in der World.js verwendet werden kann
}

export { createScene }