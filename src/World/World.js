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
    // Instanzvariable für klickbare Objekte (wenn man Interaktionen vorbereiten will)
    #clickableObjects

    // Der Constructor nimmt den HTML-Container (ein DOM-Element) entgegen
    constructor(container) {

        this.#clickableObjects = []

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

        console.log('World synchron konstruiert.')
    }

    // --- Asynchrone Methode zum Initialisieren/Laden von Assets ---
    async init(configItems) {
        console.log('World init gestartet mit Config:', configItems)
        // configItems sollte das Objekte sein, das wir in main.js definieren!
        // z.B. 'Mein Würfel' oder 'Ente'

        // Array für Lade-Promises (für potentiell paralleles Laden)
        const loadPromises = []

        // Gehe jedes Item in der Konfiguration durch
        for (const item of configItems) {
            // Erstelle ein Promise für jedes zu ladende/erstellende Objekt
            const loadPromise = ( async () => { // Async IIFE für await im Loop
                let loadedObject = null
                try {
                    // Entscheide basierend auf dem Typ, was zu tun ist
                    switch (item.type) {
                        case 'cube':
                            // Rufe createCube auf, übergebe NUR die relevanten Infos für DIESES Item
                            loadedObject = await createCube({ cubeTextureUrl: item.assetUrl })
                            console.log(`Objekt '${item.name || 'Cube'}' erstellt.`)
                            break // Wichtig!

                        case 'gltf': 
                            // Rufe loadGltf auf und übergebe NUR die URL für DIESES Item
                            loadedObject = await loadGltf(item.assetUrl)
                            console.log(`Objekt '${item.name || 'GLTF'}' geladen.`)
                            break

                        // Hier können später weitere Typen hinzugefügt werden
                        // --- Zukünftig denkbare Erweiterung ---
                        // case 'ambientLight':
                        //     loadedObject = createAmbientLight(item.color, item.intensity) // Angenommen, es gäde ein createAmbientLight
                        //     console.log('AmbientLight erstellt')
                        //     break
                        // case 'directionalLight':
                        //  //...
                        //    // break

                        default:
                            console.warn(`Unbekannter Objekttyp in Konfiguration: ${item.type}`)
                    }

                    // Wenn ein Objekt erfolgreich geladen/erstellt wurde
                    if (loadedObject) {
                        // Setze Name (falls in config definiert)
                        if (item.name) {
                            loadedObject.name = item.name
                        }

                        // Setze Position (falls in Config definiert)
                        if (item.position) {
                            loadedObject.position.set(
                                item.position.x || 0, 
                                item.position.y || 0, 
                                item.position.z || 0
                            )
                        }

                        // Setze Rotation (falls in Config definiert)
                        if (item.rotation) {
                            loadedObject.rotation.set(
                                item.rotation.x || 0, 
                                item.rotation.y || 0, 
                                item.rotation.z || 0
                            )
                        }

                        // Setze Skalierung (falls in Config definiert
                        // Nutze standardwert 1, falls nichts angegeben
                        if (item.scale) {
                            loadedObject.scale.set(
                                item.scale.x || 1, 
                                item.scale.y || 1, 
                                item.scale.z || 1
                            )
                        }

                        // Füge das Objekt der Szene hinzu
                        scene.add(loadedObject)

                        // Optional: Füge es zur Liste der klickbaren Objekte hinzu
                        // (Vorbereitung für spätere Interaktion)
                        if (this.#clickableObjects) { // Sicherstellen, dass das Array existiert
                            this.#clickableObjects.push(loadedObject)
                        }

                        console.log(`Objekt '${loadedObject.name || item.name}' zur Szene hinzugefügt und konfiguriert.`)
                    }
                } catch (error) {
                    console.error(`Fehler beim Verarbeiten des Config-Items: `, item, error)
                    // Wichtig: Hier das Promise nicht fehlschlagen lassen, damit Promise.all weiterläuft
                    // Stattdessen könnte man null zurückgeben oder den Fehler anders behandeln
                    return null // Signalisiert, dass dieses Item fehlgeschlagen ist
                }
            })() // Die async IIFE aufrufen

            loadPromises.push(loadPromise) // Fügt das Promise zum Array hinzu
        } // Ende der for ... of Schleife

        // Warte, bis alle Lade-Promises abgeschlossen sind (auch fehlgeschlagene)
        // Promise.all würde bei einem Fehler sofort abbrechen
        // Promise.allSettled wartet auf alle, egal ob Erfolg oder Fehler
        const results = await Promise.allSettled(loadPromises)
        console.log('Alle Lade-Promises abgeschlossen', results)

        // Optional: Prüfe results auf Fehler
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Fehler beim Laden von Item ${index} (${configItems[index]?.name || configItems[index]?.type}):`, result.reason)
            }
        })
        
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