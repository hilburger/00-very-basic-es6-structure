import { createCamera } from './components/camera.js'
import { createLights } from './components/lights.js'
import { createPlane } from './components/plane.js'
import { createScene } from './components/scene.js'

import { createRenderer } from './systems/renderer.js'
import { Resizer } from './systems/Resizer.js'
import { Loop } from './systems/Loop.js'

// Importiere OrbitControls aus dem 'examples'-Verzeichnis von Three.js
// Vite/npm kümmert sich darum, den richtigen Pfad aufzulösen
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// -- Importiere Ladefunktionen und Cube ---
import { loadGltf } from './systems/assetLoader.js'
import { createCube } from './components/cube.js' // Importieren, aber nicht im Constructor aufrufen

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
        camera = createCamera()
        scene = createScene()
        renderer = createRenderer()

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

        // 5. Erstelle die 3D-Objekte (Bodenplatte/-ebene) und füge sie der Szene hinzu
        const plane = createPlane()
        scene.add(plane)

        // 6. Erstelle den Resizer, um auf Größenänderungen des Viewports/Fensters zu reagieren
        // Wir brauchen keine Referenz darauf zu speichern, da er im Hintergrund auf Events lauscht
        const resizer = new Resizer(container, camera, renderer)

        // 7. Erstelle den Animations-Loop
        loop = new Loop(camera, scene, renderer)

        // 8. Registriere Objekte, die im Loop aktualisiert werden müssen
        // OrbitControls müssen aktualisiert werden, besonders, wenn Damping aktiviert ist
        loop.updatables.push(controls)

        // Hier können wir auch den Würfel oder andere Objekte hinzufügen, wenn sie animiert werden sollen: 
            // cube.tick = (delta) => { cube.rotation.y += delta } // Beispiel-Animation
            // loop.updatables.push(cube)
    }

    // --- Asynchrone Methode zum Initialisieren/Laden von Assets ---
    async init(config) {
        console.log('World init gestartet mit Config:', config)
        // config sollte das objekt sein, das wir in main.js definieren!
        // z.B. { cubeTexture: '...', duckModel: '...', helmetModel: '... }

        // Lade den Würfel (jetzt async)
        // Übergibt die Konfiguration an CreateCube, damit es die Textur-URL kennt
        try {
            const cube = await createCube({ cubeTextureUrl: config.cubeTexture })
            scene.add(cube)
            console.log('Würfel zur Szene hinzugefügt')
        } catch(error) {
            console.error('Würfel konnte nicht erstellt/geladen werden', error)
        }

        // Lade das Enten-Modell (GLB)
        if (config.duckModel) {
            try {
                const duck = await loadGltf(config.duckModel)
                // Modell leicht verschieben und skalieren, damit es nicht im Würfel/Helm steckt
                duck.position.set(-3, 0.5, 0)
                duck.scale.set(1, 1, 1)
                scene.add(duck)
                console.log('Ente zur Szene hinzugefügt')
            } catch(error){
                console.error('Ente konnte nicht geladen werden', error)
            } 
        }

        // Lade das Helm-Modell (GLTF + externe Textur)
        if (config.helmetModel) {
            try { 
                const helmet = await loadGltf(config.helmetModel)
                // GLTF-Loader lädt externe Texturen automatisch, wenn Pfade stimmen!
                helmet.position.set(3, 1.5, 0)
                // Optonal: Skalirung für Helm anpassen, falls er zu groß/klein ist
                    // helmet.scale(1, 1, 1)
                scene.add(helmet)
                console.log('Helm zur Szene hinzugefügt')
            } catch(error){
                console.error('Helm konnte nicht geladen werden', error)
            }
        }
        console.log('World Init abgeschlossen.')
        // Hier könnte man z.B. einen Ladebildschirm ausblenden
    }

    render() {
        // Kleine SIcherheitsprüfung
        if( !renderer || scene || camera) return
        renderer.render(scene, camera)
    }
    
    start() {
        if (!loop) return
        loop.start()
    }
    
    stop() {
        if (!loop) return
        loop.stop()
    }
}

export { World }