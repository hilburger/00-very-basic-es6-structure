// src/World/World.js

// THREE Kern-Klassen, die wir direkt instanziieren werden:
import { Raycaster, Vector2, AxesHelper, Color, Scene, PerspectiveCamera, WebGLRenderer} from 'three' // AxesHelper und Color sind nur für Debugging

// EventBus Singleton
import eventBus from './systems/EventBus.js'

// Factory für Lichter (bleibt extern)
import { createLights } from './components/lights.js'

// System-Klassen
import { Resizer } from './systems/Resizer.js'
import { Loop } from './systems/Loop.js'

// Importiere OrbitControls aus dem 'examples'-Verzeichnis von Three.js
// Vite/npm kümmert sich darum, den richtigen Pfad aufzulösen
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// -- Importiere Ladefunktionen  ---
import { loadGltf, loadTexture } from './systems/assetLoader.js'

// Komponenten-Klassen
import { Cube } from './components/Cube.js' // Eigene Klasse für Erstellung von Cubes mit Materialien und Texturen
import { Plane } from './components/Plane.js' // Plane-Klasse für Bodenplatte

// Debug-Tool-Imports (Innerhalb der Klasse, wo sie gebraucht werden oder oben)
// Wir importieren sie hier oben, damit sie verfügbar sind
import Stats from 'stats.js' // Für Performance-Statistiken
import { GUI } from 'lil-gui'

// Globale Variablen für geteilte GUI (bleibt außerhalb der Klasse)
let sharedGui = null
let guiRefCount = 0

class World {
    #camera
    #renderer
    #scene
    #loop
    #controls
    #resizer
    #lights = [] // Privates Feld für Lichter deklarieren und initialisieren
    #clickableObjects = [] // Instanzvariable für klickbare Objekte (wenn man Interaktionen vorbereiten will)
    #raycaster // Instanzvariable für Raycasting
    #mouse // Für normalisierte Mauskoordinaten
    #container // Wird im Konsturktor gesetzt

    // Variablen für Debug-Tools
    #isDebugMode = false // Initialisiert, standardmäßig deaktiviert
    #stats // Für Stats.js Instanz
    #gui // Für lil-gui Instanz
    #axesHelper

    // Der Constructor nimmt den HTML-Container (ein DOM-Element) entgegen
    constructor(container, isDebugMode = false) {
        this.#container = container // Container für diese Instanz speichern
        this.#isDebugMode = isDebugMode // Speichere den Flag
        const instanceIdLog = this.#container.id ? ` ID: ${this.#container.id}` : '' // Für bessere Logs
        console.log(`[World${instanceIdLog}] Konstruktor gestartet. Debug: ${isDebugMode}`)

        // --- Instanzfelder initialisieren ---
        this.#clickableObjects = []
        this.#lights = [] // Initialisiere leeres Array

        // 1. Erstelle die Kernkomponenten als Instanzvariablen via interner Methoden
        this.#scene = this.#createScene()
        this.#camera = this.#createCamera() // Nutzt jetzt this.#container für Aspect Ratio
        this.#renderer = this.#createRenderer()

        // 2. Raycasting für diese Instanz initialisieren
        this.#raycaster = new Raycaster()
        this.#mouse = new Vector2() // Initialisiere den 2D-Vektor

        // 3. Canvas DIESER Instanz zum Container hinzufügen
        this.#container.append(this.#renderer.domElement)

        // 4. OrbitControls für DIESE Instanz erstellen
        // Wichtig: Übergibt jetzt Instanzvariablen!
        // Sie benötigen die Kamera und das COM-Element (canvas), auf das sie hören sollen
        this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement)
        // Aktiviere Dämpfung für sanfteres Auslaufen der Bewegung beim Loslassen der Maus
        this.#controls.enableDamping = true
        this.#controls.dampingFactor = 0.05 // Stärke der Dämpfung
        // WICHTIG: Damit Raycasting und OrbitControls nicht kollidieren, 
        // müssen die Controls wissen, wann sie *nicht* reagieren sollen (z.B. während Dragging)
        // Das ist hier noch nicht implementiert, aber für ein einfaches Klicken rechts erstmal. 

            // Weitere nützliche OrbitControls-Settings (optional): 
            // this.#controls.screenSpacePanning = false // Verhindert seltsames Panning-Verhalten
            // this.#controls.minDistance = 2 // Minimaler Zoom-Abstand
            // this.#controls.maxDistance = 15 // Maximaler Zoom-Abstand
            // this.#controls.maxPolarAngle = Math.PI * 0.5 // Verhindert, dass man untzer die Bodenplatte/-ebene schaut

        // 5. Animations-Loop für DIESE Instanz erstellen
        this.#loop = new Loop(this.#camera, this.#scene, this.#renderer)
        // 5. b) Füge Controls DIESER Instanz zum Loop hinzu
            // OrbitControls müssen aktualisiert werden, besonders, wenn Damping aktiviert ist
        this.#loop.updatables.push(this.#controls)
        
        // 6. Resizer für DIESE Instanz hinzufügen, um auf Größenänderungen des Viewports/Fensters zu reagieren
        // Wichtig: Übergibt jetzt Instanzvariablen!
        this.#resizer = new Resizer(this.#container, this.#camera, this.#renderer)

        // 7. Lichter für DIESE Instanz erstellen und hinzufügen
        this.#lights = createLights() // createLights bleibt externe Funktion
        // Der Spread-Operator '(...)' fügt alle Elemente des lights-Arrays einzeln hinzu
        this.#scene.add(...this.#lights) // Füge zur Instanz-Szene hinzu

        // 8. Erstelle die 3D-Objekte und füge sie der DIESER Instanz hinzu ---
        
        // Ebene für DIESE Instanz hinzufügen
        const plane = new Plane() // Erstellt Instanz der TNT-Plane-Klasse
        this.#scene.add(plane) // Füge zur Instanz-Szene hinzu

            // Optional: Füge Ebene zu klickbaren Objekten hinzu
            // this.#clickableObjects.push(plane)
            // console.log(`Objekt '${plane.name || 'Plane'}' zu clickableObjects hinzugefügt.`)

        // Veraltet, da noch nicht an diese Instanz gebunden: 
            // Hier können wir auch den Würfel oder andere Objekte hinzufügen, wenn sie animiert werden sollen: 
            // cube.tick = (delta) => { cube.rotation.y += delta } // Beispiel-Animation
            // loop.updatables.push(cube)

        // 9. --- DEBUG-Tools Initialisierung (nur, wenn this.#isDebugMode true ist) ---
        // Erfolgt NACHDEM Szene, Lichter etc. existieren
        if (this.#isDebugMode) {
            this.#setupDebugTools() /// Ruft die interne Methode auf
            if (this.#stats) { // #stats wird in #setupDebugTools initialisiert
                this.#loop.updatables.push(this.#stats) // Füge zum Instanz-Loop hinzu
            }
        }
        // ---DEBUG-Tools ENDE ---

        // Interaktion/Listener für DIESE Instanzeinrichten
        this.#setupInteraction() // Methode jetzt interne Methode auf

        console.log(`[World${instanceIdLog}] Konstruktor abgeschlossen.`)
    }

    // --- Private Helper-Methoden zum Erstellen von Kern-Komponenten ---
    #createCamera() {
        // Nutzt die Breite/Höhe des spezifischen Containers dieser Instanz
        const aspectRatio = this.#container.clientWidth / this.#container.clientHeight
        const camera = new PerspectiveCamera(
            75,     // FOV
            aspectRatio, 
            0.1,    // near
            100     // far
        )
        // Setze Standard-Kameraposition für jede Instanz
        camera.position.set(0, 1.5, 5)
        return camera
    }

    #createScene() {
        const scene = new Scene()
        scene.background = new Color(0xabcdef)
        return scene
    }

    #createRenderer() {
        const renderer = new WebGLRenderer({
            antialias: true, 
            // Optional: Wenn Performance auf Mobilgeräten wichtig ist
            // powerPreferences: 'high-performance'
        })
        renderer.outputColorSpace = 'srgb' // Wichtiges Farbsetting
        // Größe wird durch Resizer gesetzt, nicht hier
        return renderer
    }

    // --- Methode zum Einrichten der Debug-Tools ---
    #setupDebugTools(container){
        console.log('Setting up Debug Tools...')

        // 1. Stats.js (FPS-Anzeige)
        this.#stats = new Stats()
        this.#stats.dom.style.position = 'absolute' // Positionieren
        this.#stats.dom.style.left = '0px'
        this.#stats.dom.style.top = '0px'
        // Füge es dem Body hinzu, nicht zum Canvas-Container, damit es sichtbar bleibt
        document.body.appendChild(this.#stats.dom)

        // 2. AxesHelper (Koordinatenachsen im Ursprung)
        const axesHelper = new AxesHelper(3) // Die Zahl gibt die Länge der Achsen an
        scene.add(axesHelper)
        console.log('AxesHelper zur Szene hinzugefügt.')

        // 3. lil-gui (Grafische Benutzeroberfläche)
        this.#gui = new GUI()
        console.log('lil-gui Instanz erstellt.')

        // Füge Beispiel-Controls hinzu: 
        
        // - Ordner für Szenen-Einstellungen
        const sceneFolder = this.#gui.addFolder('Szene')
        //   - Hintergrundfarbe ändern
        const bgColor = { color: `#${scene.background.getHexString()}`} // Aktuelle Farbe holen
        sceneFolder.addColor(bgColor, 'color').name('Hintergrund').onChange(value => {
            scene.background.set(value) // Farbe bei Änderung setzen
        })
        sceneFolder.open() // Ordner standardmäßig öffnen

        // - Ordner für Lichter (Beispiel: Umgebungslicht)
        // Wir brauchen eine Referenz auf das Licht. Besser wäre Lichter zu verwalten.
        // Quick & Dirty: Finden über den Typ Licht (nicht sehr robust!!!)
        const ambientLight = this.#lights.find(light => light.isAmbientLight)
        if (ambientLight) {
            const lightFolder = this.#gui.addFolder('Beleuchtung')
            lightFolder.add(ambientLight, 'intensity', 0, 5, 0.1).name('Umgebungslicht')
            // lightFolder.open()
        }

        // Wenn Objekte Namen haben, kann man sie auch hinzufügen (koplexer)
        // Beispiel (wenn Ente geladen und 'Ente' heißt) 
        // const duck = scene.getObjectByName('Ente')
        // if (duck) {
        //     const duckFolder = this.#gui.addFolder('Ente')
        //     duckFolder.add(duck.position, 'x', -5, 5, 0.1).name('Position X')
        //     // ... usw. für y, z, rotation, scale
        // }
    }

    // Interaktion (Raycasting bei Klick) einrichten
    #setupInteraction(container) {
        const canvas = renderer.domElement // Das canvas-Element holen

        canvas.addEventListener('pointerdown', (event) => {// 'pointerdown' ist oft besser als 'click'
            // 1. Mauskoordination berechnen (normalisiert: -1 bis +1)
            const bounds = canvas.getBoundingClientRect() // Position/Größe des Canvas holen
            this.#mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 -1
            this.#mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1

            // 2. Raycaster aktualisieren
            this.#raycaster.setFromCamera(this.#mouse, camera)

            // 3. Schnittpunkte finden (nur mit unseren klickbaren Objekten!)
            // intersectObjects erwartet ein Array von Meshes/Groups
            const intersects = this.#raycaster.intersectObjects(this.#clickableObjects, true)

            if (intersects.length > 0) {
                // Treffer! Nimm das vorderste Objekt.
                const intersection = intersects[0]
                const clickedObject = intersection.object

                // Finde das Top-Level-Objekt, das wir zu #clickableObjects hinzugefügt haben
                // (nützlich, wenn man auf ein Kind-Mesh einer Gruppe klickt)
                let topLevelClickedObject = clickedObject
                while (topLevelClickedObject.parent && topLevelClickedObject.parent !== scene) {
                    // Prüfen, ob ein Vorfahre in clickableObjects ist
                    if (this.#clickableObjects.includes(topLevelClickedObject.parent)) {
                        topLevelClickedObject = topLevelClickedObject.parent
                        break // Optional: Nur das erste Top-Level nehmen
                    }
                    // Wenn kein klickbarer Vorfahre gefunden wird, bis zur Szene hochgehen
                    // und das direkt getroffene Objekt als Basis nehmen.
                    // Für das GLTF ist das oft ein Kind-Mesh, wir wollen aber die Gruppe.
                    // Diee Logik kann man verfeinern! Vorerst nehmen wir aber das Top-Level
                    if (this.#clickableObjects.includes(topLevelClickedObject)) {
                        break // Das Objekt selbst ist klickbar
                    }
                    topLevelClickedObject = topLevelClickedObject.parent

                    // Sicherheits-Check gegen Endlosschleife (sollte nicht passieren)
                    if (topLevelClickedObject === scene) {
                        topLevelClickedObject = clickedObject // Fallback zum direkt getroffenen
                        break
                    }
                }

                // Stelle sicher, dass wir tatsächlich ein Objekt das zu Liste der klickbaren Objekt (clickable List) hinzugefügt worden ist referenzieren!
                if (!this.#clickableObjects.includes(topLevelClickedObject)) {
                    topLevelClickedObject = topLevelClickedObject // Fallback falls die vorige Logik fehlschlägt
                }

                console.log('Raycast hit:', clickedObject) // Das tatsächlich getroffene Mesh/etc.
                console.log('Top-Level Clickable', topLevelClickedObject)

                // 4. Event über den Event Bus senden
                eventBus.emit('objectClicked', {
                    object: topLevelClickedObject, // Das Objekt aus unserer Liste
                    name: topLevelClickedObject.name, 
                    uuid: topLevelClickedObject.uuid, 
                    point: intersection.point, // Der genaue 3D-Punkt des Klicks
                    distance: intersection.distance, // Entfernung vom Klick zur Cam
                    face: intersection.face, // Welche Fläche getroffen wurde
                    originalEvent: event, // Das ursprüngliche Maus-Event
                })
            }

        })
    }


    // --- Asynchrone Methode zum Initialisieren/Laden von Assets ---
    async init(itemConfig) {
        const instancedIdLog = this.#container.id ? ` ID: ${this.#container.id}` : '' // Für bessere Logs
        console.log(`[World${instanceIdLog}] init gestartet mit Item: `, itemConfig)


        // BIS HIERHIN HABE ICH JETZT ANGEPASST! 
        // Kommentar von 00:58h

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
                            // 1. Textur zuerst laden
                            let texture = null
                            if (item.assetUrl) {
                                texture = await loadTexture(item.assetUrl)
                                console.log(`Textur für '${item.name || 'Cube'}' geladen.`)
                            }

                            // 2. Cube-Instanz erstellen und Konfiguration übergeben
                            // Wir übergeben das ganze 'item' Objekt und die geladene Textur als 'map'
                            loadedObject = new Cube({
                                ...item, // Kopiert alle Eigenschaften von item (name, size, color etc.)
                                map: texture // Fügt die geladene Textur als 'map' hinzu
                            })
                            console.log(`Objekt '${item.name || 'Cube'}' instanziert.` )
                            break // Wichtig!

                        case 'plane':
                            // Erstelle eine Instanz der Plane-Klasse, übergib das item als config
                            loadedObject = new Plane(item)
                            console.log(`Objekt '${item.name || 'Plane'}' erstellt.`)
                            break

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
                            console.log(`Objekt '${loadedObject.name || item.type}' zu clickableObjects hinzugefügt.`)
                        } else {
                            console.warn(`#clickableObjects existiert nicht beim Hunzufügen von: `, loadedObject.name)
                        }

                        console.log(`Objekt '${loadedObject.name || item.type}' zur Szene hinzugefügt und konfiguriert.`)
                        // --- HINWEIS: Rückgabe des loadedObject ist hier nicht mehr nötig, da wir Promise.allSettled nutzen ---
                        // return loadedObject // Diese Zeile von früher ist nicht mehr nötig
                    }
                } catch (error) {
                    console.error(`Fehler beim Verarbeiten des Config-Items: `, item, error)
                    // Wichtig: Hier das Promise nicht fehlschlagen lassen, damit Promise.all weiterläuft
                    // Stattdessen könnte man null zurückgeben oder den Fehler anders behandeln
                    return null // Signalisiert, dass dieses Item fehlgeschlagen ist
                }
                // --- WICHTIG: Gib etwas zurück, damit allSettled einen Wert hat ---
                return loadedObject // Gib das Objekt oder null zurück
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

        // Event Listener hier registrieren
        this.#setupEventListeners() // Rufe die Methode auf, die die Listener anmeldet
    }

    // --- Methode zum Registrieren der Listener
    #setupEventListeners() {
        eventBus.on('objectClicked', (eventData) => {
            console.log(
                `%cEVENT BUS: Objekt geklickt!%c
                Name: ${eventData.name || '(kein Name)'}
                UUID: ${eventData.uuid}
                Position: ${eventData.point.x.toFixed(2)}, ${eventData.point.y.toFixed(2)}, ${eventData.point.z.toFixed(2)}`,
                'color: blue; font-weight: bold;', // Style für den ersten Teil
                'color: black;' // Style für den Rest
            )

            // Beispielhafte Reaktion: Das Objekt leicht nach oben "hüpfen" lassen:
            if (eventData.object && typeof eventData.object.position?.y === 'number') {
                const originalY = eventData.object.userData.originalY ?? eventData.object.position.y
                eventData.object.userData.originalY = originalY // Speichere Originalposition, falls noch nicht geschehen

                // Simple Animation (ohne GSAP hier)
                const jumpHeight = 0.5
                eventData.object.position.y = originalY + jumpHeight
                setTimeout(() => {
                    if (eventData.object?.position) { // Prüfen ob Objekt noch existiert
                         eventData.object.position.y = originalY
                    }
                }, 300) // Nach 300ms zurücksetzen
            }
        })

        // HIER können weitere Listener registriert werden...
        // eventBus.on('anderesEvent', (data) => { /* ... */ })
        console.log("Event Bus Listener registriert.")
    }

    render() {
        // Kleine SIcherheitsprüfung
        if( !renderer || !scene || !camera) return
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