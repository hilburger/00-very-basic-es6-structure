import { createCamera } from './components/camera.js'
import { createCube } from './components/cube.js'
import { createLights } from './components/lights.js'
import { createPlane } from './components/plane.js'
import { createScene } from './components/scene.js'

import { createRenderer } from './systems/renderer.js'
import { Resizer } from './systems/Resizer.js'
import { Loop } from './systems/Loop.js'

// Importiere OrbitControls aus dem 'examples'-Verzeichnis von Three.js
// Vite/npm kümmert sich darum, den richtigen Pfad aufzulösen
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Deklariert Variablen für Kernkomponenten im Modul-Scope
// Sie sind nicht direkt von außen zugänglich ("privat" für dieses Modul)
let camera
let renderer
let scene
let loop
let controls // OrbitControls

class World {
    // Der Constructor nimmt den HT;L-Container (ein DOM-Element) entgegen
    constructor(container) {
        // 1. Erstelle die Kernkomponenten durch Aufruf der importierten Funktionen/Klassen
        camera = createCamera
        scene = createScene
        renderer = createRenderer

        // 2. Füge das <canvas>-Element des Renderers zum HTML-Container hinzu
        container.append(renderer.domElement)

        // 3. Erstelle die OrbitControls
        // Sie benötigen die Kamera und das COM-Element (canvas), auf das sie hören sollen
        controls = new OrbitControls(camera, renderer.domElement)

        // Aktiviere Dämpfung für sanfteres Auslaufen der Bewegung beim Loslassen der Maus
        controls.enableDamping = true
        controls.dampingFactor = 0.05 // Stärke der Dämpfung

        // Weitere nützliche OrbitControls-Settings (optional): 
        // controls.screenSpacePanning = false // Verhindert seltsames Panning-Verhalten
        // controls.minDistance = 2 // Minimaler Zoom-Abstand
        // controls.maxDistance = 15 // Maximaler Zoom-Abstand
        // controls.maxPolarAngle = Math.PI * 0.5 // Verhindert, dass man untzer die Bodenplatte/-ebene schaut

        // 4. Erstelle die Lichter und füge sie zur Szene hinzu
        const lights = createLights()
        // Der Spread-Operator '(...)' fügt alle Elemente des lights-Arrays einzeln hinzu
        scene.add(...lights)

        // 5. Erstelle die 3D-Objekte (Würfel, Bodenplatte/-ebene) und füge sie der Szene hinzu
        const plane = createPlane()
        const cube = createCube()
        scene.add(plane, cube)

        // 6. Erstelle den Resizer, um auf Größenänderungen des Viewports/Fensters zu reagieren
        // Wir brauchen keine Referenz darauf zu speichern, da er im Hintergrund auf Events lauscht
        const Resizer = new Resizer(container, camera, renderer)

        // 7. Erstelle den Animations-Loop
        loop = new Loop(camera, scene, renderer)

        // 8. Registriere Objekte, die im Loop aktualisiert werden müssen
        // OrbitControls müssen aktualisiert werden, besonders, wenn Damping aktiviert ist
        loop.updatables.push(controls)

        // Hier können wir auch den Würfel oder andere Objekte hinzufügen, wenn sie animiert werden sollen: 
            // cube.tick = (delta) => { cube.rotation.y += delta } // Beispiel-Animation
            // loop.updatables.push(cube)
    }

    render() {
        renderer.render(scene, camera)
    }
    
    start() {
        loop.start()
    }
    
    stop() {
        loop.stop()
    }
}

export { World }