// src/World/World.js

// THREE Kern-Klassen, die wir direkt instanziieren werden:
import { LoadingManager, Raycaster, Vector2, AxesHelper, Color, Scene, PerspectiveCamera, WebGLRenderer, Box3, Vector3 } from 'three' // AxesHelper und Color sind nur für Debugging

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

// -- Importiere Asset Ladefunktionen  ---
// Die Funktionen erwarten jetzt optional einen Manager
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
    #instanceId

    // Variablen für Debug-Tools
    #isDebugMode = false // Initialisiert, standardmäßig deaktiviert
    #stats // Für Stats.js Instanz
    #gui // Für lil-gui Instanz
    #axesHelper

    // Ladeanzeige Variablen
    #loadingManager
    #loadingIndicatorElement
    #loadingPercentageElement
    #loadingCountsElement
    #loadingProgressBarElement

    // Der Constructor nimmt den HTML-Container (ein DOM-Element) und die Instanz-ID entgegen
    constructor(container, isDebugMode = false, instanceId) {
        this.#container = container // Container für diese Instanz speichern
        this.#isDebugMode = isDebugMode // Speichere den Flag
        this.#instanceId = instanceId // Speichere die Instanz-ID
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})` // Für bessere Logs
        console.log(`[World${instanceIdLog}] Konstruktor gestartet. Debug: ${isDebugMode}`)

        // --- Instanzfelder initialisieren ---
        this.#clickableObjects = []
        this.#lights = [] // Initialisiere leeres Array

        // 5. Ladeanzeigen-UI erstellen und zum Container hinzufügen
        this.#createLoadingIndicatorUI()

        // 1. Erstelle die Kernkomponenten als Instanzvariablen via interner Methoden
        this.#scene = this.#createScene()
        this.#camera = this.#createCamera() // Nutzt jetzt this.#container für Aspect Ratio
        this.#renderer = this.#createRenderer()

        // 3. Canvas DIESER Instanz zum Container hinzufügen
        this.#container.append(this.#renderer.domElement)

        // --- Fade-In der Ladeanzeige ---
        // Kleine Verzögerung, damit der Browser das Element rendernkann, bevor die Transition startet
        setTimeout(() => {

        }, 10) 

        // 4. Loading Manager Instanz erstellen und Callback definieren
        this.#setupLoadingManager(instanceIdLog)

        // 2. Raycasting für diese Instanz initialisieren
        this.#raycaster = new Raycaster()
        this.#mouse = new Vector2() // Initialisiere den 2D-Vektor

        // 6. OrbitControls für DIESE Instanz erstellen
        // Wichtig: Übergibt jetzt Instanzvariablen!
        // Sie benötigen die Kamera und das COM-Element (canvas), auf das sie hören sollen
        this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement)
        // Aktiviere Dämpfung für sanfteres Auslaufen der Bewegung beim Loslassen der Maus
        this.#controls.target.set(0, 0.75, 0)
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

        // 7. Animations-Loop für DIESE Instanz erstellen
        this.#loop = new Loop(this.#camera, this.#scene, this.#renderer)
        // 7. b) Füge Controls DIESER Instanz zum Loop hinzu
            // OrbitControls müssen aktualisiert werden, besonders, wenn Damping aktiviert ist
        this.#loop.updatables.push(this.#controls)
        
        // 8. Resizer für DIESE Instanz hinzufügen, um auf Größenänderungen des Viewports/Fensters zu reagieren
        // Wichtig: Übergibt jetzt Instanzvariablen!
        this.#resizer = new Resizer(this.#container, this.#camera, this.#renderer)

        // 9. Lichter für DIESE Instanz erstellen und hinzufügen
        this.#lights = createLights() // createLights bleibt externe Funktion
        // Der Spread-Operator '(...)' fügt alle Elemente des lights-Arrays einzeln hinzu
        this.#scene.add(...this.#lights) // Füge zur Instanz-Szene hinzu

        // 10. Erstelle die 3D-Objekte und füge sie der DIESER Instanz hinzu ---
        
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

        // 11. --- DEBUG-Tools Initialisierung (nur, wenn this.#isDebugMode true ist) ---
        // Erfolgt NACHDEM Szene, Lichter etc. existieren
        if (this.#isDebugMode) {
            this.#setupDebugTools() /// Ruft die interne Methode auf
            if (this.#stats) { // #stats wird in #setupDebugTools initialisiert
                this.#loop.updatables.push(this.#stats) // Füge zum Instanz-Loop hinzu
            }
        }
        // ---DEBUG-Tools ENDE ---

        // Interaktion/Listener für DIESE Instanzeinrichten (Raycasting Listener)
        this.#setupInteraction(instanceIdLog) // Übergib ID für Logs

        console.log(`[World${instanceIdLog}] Konstruktor abgeschlossen.`)
    }

    // --- Private Helper-Methoden zum Erstellen von Kern-Komponenten ---
    #createCamera() {
        // Nutzt die Breite/Höhe des spezifischen Containers dieser Instanz
        const aspectRatio = this.#container.clientWidth / this.#container.clientHeight
        const camera = new PerspectiveCamera(
            58,     // FOV
            aspectRatio, 
            0.1,    // near
            100     // far
        )
        // Setze Standard-Kameraposition für jede Instanz
        camera.position.set(0, 1, 2)
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

    // --- Methoden für Ladeanzeige ---

    #createLoadingIndicatorUI() {
        console.log('Create loader UI now')
        this.#loadingIndicatorElement = document.createElement('div')
        this.#loadingIndicatorElement.className = 'loading-indicator'
       // this.#loadingIndicatorElement.style.display = 'none' // Initial versteckt

        this.#loadingPercentageElement = document.createElement('div')
        this.#loadingPercentageElement.className = 'loading-message loading-percentage'
        this.#loadingPercentageElement.textContent = 'Initial Loading' // Startwert

        this.#loadingCountsElement = document.createElement('div')
        this.#loadingCountsElement.className = 'loading-message loading-counts'
        this.#loadingCountsElement.textContent = 'Loading 3D Assets' // Startwert oder z.B. '0 / ?'

        const progressBarContainer = document.createElement('div')
        progressBarContainer.className = 'loading-progress-bar-container'

        this.#loadingProgressBarElement = document.createElement('div')
        this.#loadingProgressBarElement.className = 'loading-progress-bar'
        this.#loadingProgressBarElement.style.width = '0%'

        progressBarContainer.append(this.#loadingProgressBarElement)
        this.#loadingIndicatorElement.append(
            this.#loadingPercentageElement, 
            this.#loadingCountsElement, 
            progressBarContainer)
        // Füge das Overlay zum Container DIESER Instanz hinzu
        this.#container.append(this.#loadingIndicatorElement)
    }

    #setupLoadingManager(instanceIdLog) {
        // Erstelle einen NEUEN Manager für DIESE Instanz
        this.#loadingManager = new LoadingManager()

        // --- Definiere die Callbacks für DIESEN Manager ---

        this.#loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`[World${instanceIdLog}] Load Start: ${url} (${itemsLoaded}/${itemsTotal})`)
            if (this.#loadingIndicatorElement) {
                this.#loadingPercentageElement.textContent = `Initial Loading`
                this.#loadingCountsElement.textContent = `Loading 3D Assets`
                this.#loadingProgressBarElement.style.width = '0%'
                this.#loadingProgressBarElement.style.backgroundColor = '#eee' // Zurücksetzen falls Fehler war
                // this.#loadingIndicatorElement.style.display = 'flex' // Anzeigen
                // Wichtig: Stelle sicher, dass 'hidden' Klasse entfernt ist, falls sie durch einen Fehler gesetzt wurde
                this.#loadingIndicatorElement.classList.remove('hidden')
                this.#loadingIndicatorElement.classList.add('visible')
            }
        }

        this.#loadingManager.onLoad = () => {
            console.log(`[World${instanceIdLog}] Load Complete!`)
            if (this.#loadingIndicatorElement) {
                // Optional: Letzte Werte explizit auf 100% setzen
                this.#loadingPercentageElement.textContent = '100%'
                this.#loadingCountsElement.textContent = 'All Assets Loaded!' // Optional: Counts ausblenden
                this.#loadingProgressBarElement.style.width = '100%'

                // Kurze Verzögerung vor dem Ausblenden, damit man die 100% auch mal sieht
                setTimeout(() => {
                    if (this.#loadingIndicatorElement) { // Erneute Prüfung falls dispose() dazwischen kam
                        // Fade-Out auslösen
                        this.#loadingIndicatorElement.classList.remove('visible') // Optional aber sauber
                        this.#loadingIndicatorElement.classList.add('hidden') // Füge die Klasse 'hidden' hinzu, um es auszublenden
                    }
                }, 500) // Verzögerung 300ms
            }
        }

        this.#loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = itemsTotal > 0 ? (itemsLoaded / itemsTotal) * 100 : 0 // Prozentualer Fortschritt
            console.log(`[World${instanceIdLog}] Load Progress: ${url} (${itemsLoaded}/${itemsTotal}) = ${progress.toFixed(0)}%`)
            if (this.#loadingIndicatorElement) {
                this.#loadingPercentageElement.textContent = `${progress.toFixed(0)}%`
                this.#loadingCountsElement.textContent = `Assets: ${itemsLoaded} / ${itemsTotal}`
                this.#loadingProgressBarElement.style.width = `${progress}%`
            }
        }

        this.#loadingManager.onError = (url) => {
            console.error(`[World${instanceIdLog}] Load Error: ${url}`)
            if (this.#loadingIndicatorElement) {
                this.#loadingPercentageElement.textContent = 'Error!'
                this.#loadingCountsElement.textContent = `Error loading: ${url.split('/').pop()}` // NUR Dateiname anzeigen
                this.#loadingProgressBarElement.style.width = '100%'
                this.#loadingProgressBarElement.style.backgroundColor = 'red' // Fehler anzeigen
                // Nicht automatisch ausblenden bei Fehler
                // Sicherstellen, dass es sichtbar ist
                this.#loadingIndicatorElement.classList.remove('hidden')
                this.#loadingIndicatorElement.classList.add('visible')
            }
        }
    }

    // --- Methode zum Einrichten der Debug-Tools mit instanceIdLog---
    #setupDebugTools(instanceIdLog) {
        console.log(`[World${instanceIdLog}] Setup Debug Tools...`)

        // 1. Stats.js (FPS-Anzeige)
        this.#stats = new Stats()
        this.#stats.dom.style.position = 'absolute' // Positioniere
        this.#stats.dom.style.left = 'auto' // rechts ausrichten
        this.#stats.dom.style.right = '0px'
        this.#stats.dom.style.top = '0px'
        this.#stats.dom.style.zIndex = '100' // Über dem Canvas
        this.#container.appendChild(this.#stats.dom) // Füge zum spezifischen COntainer hinzu

        // 2. AxesHelper (Koordinatenachsen im Ursprung)
        this.#axesHelper = new AxesHelper(3) // Speichere als Instanzvariable, die Zahl gibt die Länge der Achsen an
        this.#scene.add(this.#axesHelper) // Füge zur Instanz-Szene hinzu
        console.log(`[World${instanceIdLog}] AxesHelper hinzugefügt.`)

        // 3. lil-gui (Grafische Benutzeroberfläche, geteilte Instanz)
        guiRefCount++ // Zähle hoch für jede Instanz, die es braucht
        if (!sharedGui && GUI) { // Nur erstellen, wenn noch keine da ist und GUI importiert wurde
            sharedGui = new GUI()
            console.log('Globale lil-gui Instanz erstellt.')
            // Verhindern, dass GUI OrbitControls blockiert
            sharedGui.domElement.addEventListener('pointerdown', (e) => e.stopPropagation(), { capture: true})
            sharedGui.domElement.addEventListener('wheel', (e) => e.stopPropagation(), { capture: true})

            // Optional: Position der globalen GUI anpassen
            // sharedGui.domElement.style.position = 'absolute'
                // Beispiel oben rechts fixiert
                // sharedGui.domElement.style.position = 'fixed'
                // sharedGui.domElement.style.right = '10px'
                // sharedGui.domELement.style.top = '10px'
                // sharedGui.domElement.style.zIndex = '110' // Über den Stats
        }
        this.#gui = sharedGui // Jede Instanz referenziert dieselbe GUI
        
        // Nur fortfahren, wenn GUI existiert
        if (this.#gui) {
            // Ordnername mit Instanz-ID
            const folderName = `Viewer ${this.#instanceId} (${this.#container.id})`
            // Erstelle Ordner für diese Instanz
            const instanceFolder = this.#gui.addFolder(folderName)

            // Hintergrundfarbe (Instanz-spezifisch)
            // Nutzt this.#scene
            const bgColor = { color: `#${this.#scene.background.getHexString()}` }
            instanceFolder.addColor(bgColor, 'color').name('Hintergrund').onChange(value => {
                this.#scene.background.set(value) // Ändert Szene DIESER Instanz
            })

            // Umgebungslicht (Instanz-spezifisch)
            // Nutzt this.#lights
                // Wir brauchen eine Referenz auf das Licht. Besser wäre Lichter zu verwalten.
                // Quick & Dirty: Finden über den Typ Licht (nicht sehr robust!!!)
            const ambientLight = this.#lights.find(light => light.isAmbientLight)
            if (ambientLight) {
                // Füge Regler zum Instanz-Ordner hinzu
                instanceFolder.add(ambientLight, 'intensity', 0, 5, 0.1).name('Umgebungslicht')
            }
            // Füge AxesHelper-Toggle hinzu
            instanceFolder.add(this.#axesHelper, 'visible').name('SHow Axes')

            // instanceFolder.open() // Diesen Folder öffnen? Besser nicht bei vielen Instanzen.
            console.log(`[World${instanceIdLog}] GUI-Ordner hinzugefügt.`)
        } else {
            console.log(`[World${instanceIdLog}] KEINE GUI-Instanz verfügbar.`)
        }
    }

    // Interaktion (Raycasting bei Klick) einrichten
    #setupInteraction(instanceIdLog) {
        const canvas = this.#renderer.domElement // Das canvas-Element via Instanz-Variable holen

        // Wichtig: WIr brauchen eine gebundene Referenz zum Listener, damit wir ihn später entfernen können
        // Speichere sie als Instanzeigenschaft (kann public sein, muss nicht # sein)
        this.boundPointerDownHandler = this.#handlePointerDown.bind(this)

        // Füge den gebundenen istener hinzu
        canvas.addEventListener('pointerdown', this.boundPointerDownHandler)
        console.log(`[World${instanceIdLog}] Pointerdown Listener hinzugefügt.`)
    }

    #handlePointerDown(event) { // instanceIDLog ist hier nicht direkt verfügbar, holen wir aus this.#instanceIdLog
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})`

        // 1. Mauskoordination berechnen (normalisiert: -1 bis +1)
        // Nutzt this.#renderer und this.#mouse
        const bounds = this.#renderer.domElement.getBoundingClientRect() // Position/Größe des Canvas der Instanz holen
        this.#mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 -1
        this.#mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1

        // 2. Raycaster aktualisieren
        this.#raycaster.setFromCamera(this.#mouse, this.#camera)

        // 3. Schnittpunkte finden (nur mit unseren klickbaren Objekten!)
        // Nutzt this.#raycaster und this.#clickableObjects
        // Nur klickbare Objekte prüfen, die NICHT die Standard-Plane sind (optional)
        const objectsToCheck = this.#clickableObjects.filter(obj => obj !== this.#scene.getObjectByName('GrpundPlane'))
        const intersects = this.#raycaster.intersectObjects(this.#clickableObjects, true) // true = rekursiv (auch Kinder)

        if (intersects.length > 0) {
            // Treffer! Nimm das vorderste Objekt.
            const intersection = intersects[0]
            let clickedObject = intersection.object // Das tatsächlich getroffene Mesh

            // Finde das Top-Level-Objekt, das wir zu #clickableObjects hinzugefügt haben 
            // (Logik wie gehabt, nutzt this.#clickableObjects und this.#scene)
            // (nützlich, wenn man auf ein Kind-Mesh einer Gruppe klickt)
            let topLevelClickedObject = clickedObject
            //Gehe nur hoch, wenn das getroffene Objekt selbst NICHT in der Liste ist
            while (!this.#clickableObjects.includes(topLevelClickedObject) && topLevelClickedObject.parent && topLevelClickedObject.parent !== this.#scene) {
                topLevelClickedObject = topLevelClickedObject.parent
            }

            // 2. Check/Fallback:S
            // telle sicher, dass wir tatsächlich ein Objekt das zu Liste der klickbaren Objekt (clickable List) hinzugefügt worden ist referenzieren!
            if (!this.#clickableObjects.includes(topLevelClickedObject)) {
                console.warn(`[World${instanceIdLog}] Top-Level kickbares Objekt nicht gefunden, verwende direktgetroffenes: `, clickedObject.name)
                topLevelClickedObject = clickedObject // Fallback, sollte bei GLTF eigentlich nicht passieren, wenn das Hauptojekt hinzugefügt wurde. 
            }

            console.log(`[World${instanceIdLog}] Raycast hit:`, clickedObject.name || clickedObject.uuid ) // Das tatsächlich getroffene Mesh/etc.
            console.log(`[World${instanceIdLog}] Top-Level Clickable:`, topLevelClickedObject.name || topLevelClickedObject.uuid)

            // 4. Event über den Event Bus senden
            eventBus.emit('objectClicked', {
                object: topLevelClickedObject, // Das Objekt aus unserer Liste
                name: topLevelClickedObject.name, 
                uuid: topLevelClickedObject.uuid, 
                point: intersection.point, // Der genaue 3D-Punkt des Klicks
                distance: intersection.distance, // Entfernung vom Klick zur Cam
                face: intersection.face, // Welche Fläche getroffen wurde
                originalEvent: event, // Das ursprüngliche Maus-Event
                worldInstance: this, // Referenz zur World-Instanz mitsenden
                instaceId: this.#instanceId // ID explizit mitsenden
            })
        }
    }


    // --- Asynchrone Methode zum Initialisieren/Laden von Assets -> übergibt alles an LoadingManager ---
    async init(itemConfig) {
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})`
        console.log(`[World${instanceIdLog}] init gestartet mit Item: `, itemConfig)   // ----------------------------------

        // Eingangs-Check für das einzelne Konfigurationsobjekt
        if (!itemConfig || !itemConfig.type) {
            console.error(`[World${instanceIdLog}] Ungültige oder fehlende Konfiguration für init().`)
            throw new Error(`Ungültige Konfiguration für Viewer-Instanz ${instanceIdLog}.`)
        }

        let loadedObject = null
        // Fehlerbehandlung für das Laden dieses EINEN Objekts
        try {
            // Entscheide basierend auf dem Typ, was zu tun ist
            switch (itemConfig.type) {
                case 'cube': 
                    // 1. Textur zuerst laden
                    let texture = null
                    if (itemConfig.assetUrl) {
                        texture = await loadTexture(itemConfig.assetUrl, this.#loadingManager)
                        console.log(`[World${instanceIdLog}] Textur für '${itemConfig.name || 'Cube'}' geladen.`)
                    }

                    // 2. Cube-Instanz erstellen und Konfiguration übergeben
                    // Wir übergeben das ganze 'item' Objekt und die geladene Textur als 'map'
                    loadedObject = new Cube({
                        ...itemConfig, // Kopiert alle Eigenschaften von item (name, size, color etc.)
                        map: texture // Fügt die geladene Textur als 'map' hinzu
                    })
                    console.log(`[World${instanceIdLog}] Objekt '${itemConfig.name || 'Cube'}' instanziert.` )
                    break // Wichtig!

                case 'plane': // Kann jetzt auch per Config kommen (optional)
                    // Erstelle eine Instanz der Plane-Klasse
                    loadedObject = new Plane(itemConfig) // Plane lädt keine Assets, braucht keinen Manager
                    console.log(`[World${instanceIdLog}] Objekt '${itemConfig.name || 'Plane'}' erstellt.`)
                    break

                case 'gltf': 
                    // Rufe loadGltf auf und übergebe NUR die URL für DIESES Item
                    loadedObject = await loadGltf(itemConfig.assetUrl, this.#loadingManager)
                    console.log(`[World${instanceIdLog}] Objekt '${itemConfig.name || 'GLTF'}' geladen.`)
                    break

                // Hier können später weitere Typen hinzugefügt werden
                // --- Zukünftig denkbare Erweiterung ---
                // case 'ambientLight':
                //     loadedObject = createAmbientLight(itemConfig.color, itemConfig.intensity) // Angenommen, es gäde ein createAmbientLight
                //     console.log('AmbientLight erstellt')
                //     break
                // case 'directionalLight':
                //  //...
                //    // break

                default:
                    console.warn(`[World${instanceIdLog}] Unbekannter Objekttyp in Konfiguration: ${itemConfig.type}`)
                    throw new Error(`Unbekannter Objekttyp: ${itemConfig.type}`)
            }

            // Wenn ein Objekt erfolgreich geladen/erstellt wurde
            if (loadedObject) {
                // Konfiguration anwenden
                if (itemConfig.name) loadedObject.name = itemConfig.name

                // Setze Position (falls in Config definiert)
                if (itemConfig.position) {
                    loadedObject.position.set(
                        itemConfig.position.x || 0, 
                        itemConfig.position.y || 0, 
                        itemConfig.position.z || 0
                    )
                }

                // Rotation nur setzen, wenn nicht in der Komponente selbst gesetzt (wie bei Plane)
                if (itemConfig.rotation && itemConfig.type !== 'plane') {
                    loadedObject.rotation.set(
                        itemConfig.rotation.x || 0, 
                        itemConfig.rotation.y || 0, 
                        itemConfig.rotation.z || 0
                    )
                }

                // Setze Skalierung (falls in Config definiert
                // Nutze standardwert 1, falls nichts angegeben
                if (itemConfig.scale) {
                    loadedObject.scale.set(
                        itemConfig.scale.x || 1, 
                        itemConfig.scale.y || 1, 
                        itemConfig.scale.z || 1
                    )
                }

                // --- WICHTIG: Füge zur Instanz-Szene und Instanz-Clickables hinzu ---
                this.#scene.add(loadedObject)
                console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name || itemConfig.type}' zur Szene hinzugefügt.`)

                // Optional: Füge nur das konfigurierte Hauptobjekt zur Liste der klickbaren Objekte hinzu
                // (Vorbereitung für spätere Interaktion)
                if (this.#clickableObjects) { // Sicherstellen, dass das Array existiert
                    this.#clickableObjects.push(loadedObject)
                    console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name || itemConfig.type}' zur clickableObjects hinzugefügt.`)
                } else {
                    console.warn(`[World${instanceIdLog}] #clickableObjects existiert nicht beim Hunzufügen von: `, loadedObject.name)
                }

                console.log(`Objekt '${loadedObject.name || itemConfig.type}' zur Szene hinzugefügt und konfiguriert.`)
                // --- HINWEIS: Rückgabe des loadedObject ist hier nicht mehr nötig, da wir Promise.allSettled nutzen ---
                // return loadedObject // Diese Zeile von früher ist nicht mehr nötig
            } else {
                // Falls der Switch keinen LoadObject erzeugt hat
                throw new Error(`Objekt konnte nicht geladen/erstellt werden für Typ: ${itemConfig.type}`)
            }
        } catch (error) {
            console.error(`[World${instanceIdLog}] Fehler beim Verarbeiten des Config-Items: `, itemConfig, error)
            // Optional: Zeige Fehler im UI an (wird bereits teilweise durch onError des LoadingManagers behandelt)
            if (this.#loadingIndicatorElement) {
                this.#loadingPercentageElement.textContet = `Initialization Error! Check Console.`
                this.#loadingProgressBarElement.style.width = '100%'
                this.#loadingProgressBarElement.style.backgroundColor = 'red'
                this.#loadingIndicatorElement.style.display = 'flex' // Sicherstellen, dass es sichtbar ist
            }
            throw error // Fehler weiterwerfen, wird in main.js gefangen
        }
        
        console.log(`[World${instanceIdLog}] init abgeschlossen für: ${itemConfig.name || itemConfig.type}`)
        // Hier könnte man z.B. einen Ladebildschirm ausblenden

        // Event Listener hier erst registrieren, wenn Objekt sicher hinzugefügt wurde
        this.#setupEventListeners(instanceIdLog) // Rufe die Methode auf, die die Listener anmeldet
    }

    // --- Methode zum Registrieren der Listener
    #setupEventListeners(instanceIdLog) {
        // Speichere die gebundene Referenz zum Callback für späteres .off() in dispose()
        // Die Funktion selbst ist eine Pfeilfunktion, bind(this) ist nicht nötig
        // aber wir speichern sie trotzdem für .off()
        this.boundObjectClickedHandler = (eventData) => {
            // Prüfen, ob das Event für DIESE Instanz relevant ist
            // Vergleiche die mitgesendete Instanz mit der aktuellen Instanz
            if (eventData.instanceId !== this.#instanceId) {
                // console.log(`[World Instance ${this.#container?.id || '?'}] Ignoriere Klick-Event von anderer Instanz.`)
                return // Nicht auf Events von anderen Instanzen reagieren
            }

            console.log(
                `%c[World${instanceIdLog} EventBus:Objekt geklickt!%c
                Name: ${eventData.name || '(kein Name)'}
                UUID: ${eventData.uuid}`,
                'color: blue; font-weight: bold;',
                'color: black;'
            )

            // Beispielhafte Reaktion (Hüpfen) - nutzt eventData.object
            // Greift NICHT auf this.#... zu
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
        } // Ende des Callbacks für 'objectClicked'

        // Registriere den gespeicherten Handler beim Event Bus
        eventBus.on('objectClicked', this.boundObjectClickedHandler)

        // Optional: Log für Bestätigung
        console.log(`[World${instanceIdLog}] 'objectClicked' Event Listener registriert.`)

        // Hier könnten später weitere Listener für DIESE Instanz registriert werden.
        // Z.B.: this.boundMyEventHandler = (data) => { if(data.worldInstance !== this) return; /*...*/ }
        // eventBus.on('myEvent', this.boundMyEventHandler)
    }

    render() {
        // Sicherheitsprüfung mit korrekter Logik und Inbstanzvariablen
        if( !this.#renderer || !this.#scene || !this.#camera) {
            console.warn(`[World Instance ${this.#container.id || '?'}] Render abgebrochen - Kernkomponente fehlt!`)
            return
        }
        // Rufe render auf der Instanzvariablen auf
        this.#renderer.render(this.#scene, this.#camera)
    }
    
    start() {
        // Prüfe Instanzvariable
        if (!this.#loop) {
            console.warn(`[World Instance ${this.#container.id || '?'}] Start abgebrochen - Loop fehlt!`)
            return
        }
        // Rufe start auf der Instanzvariablen auf
        this.#loop.start()
        console.log(`[World Instance ${this.#container.id || '?'}] Loop gestartet!`)
    }
    
    stop() {
        // Prüfe Instanzvariable
        if (!this.#loop) {
            console.warn(`[World Instance ${this.#container.id || '?'}] Stop abgebrochen - Loop fehlt!`)
            return
        }
        // Rufe Stop auf der Instanzvariablen auf
        this.#loop.stop()
    }

    /**
     * --- Dispose-Methode --
     * 
     * Gibt Ressourcen frei, die von dieser World-Instanz verwendet werden. 
     * Wichtig, um Speicherlecks bei mehreren INstanzen oder dynamischem Entfernen zu vermeiden. 
     * 
     */
    dispose() {
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.container?.id})`
        console.log(`[World${instanceIdLog}] Dispose wird aufgerufen...`)

        // Sicherstellen, dass die Klasse entfernt wird, falls dispose während des Fade-Outs aufgerufen wird
        if (this.#loadingIndicatorElement) {
            this.#loadingIndicatorElement.classList.remove('hidden', 'hidden'); // Zustand zurücksetzen
        }

        // 1. Event Listener entfernen ---
        
        // PointerDown Listener vom Canvas entfernen
        if (this.#renderer && this.boundPointerDownHandler) {
            this.#renderer.domElement.removeEventListener('pointerdown', this.boundPointerDownHandler)
            console.log(`[World${instanceIdLog}] PointerDown Listener entfernt.`)
            this.boundPointerDownHandler = null // Referenz löschen
        }

        // EventBus Listener entfernen
        if (this.boundObjectClickedHandler) {
            eventBus.off('objectClicked', this.boundObjectClickedHandler)
            console.log(`[World${instanceIdLog}] EventBus Listener entfernt.`)
            this.boundObjectClickedHandler = null // Referenz löschen
        }
        // TODO: Ggf. 'resize' Listener vom Resizer entfernen (Wenn Resizer einedispose Methode hätte)


        // 2. Loop stoppen und leeren ---
        this.stop() // Stoppt den Animation Loop für diese Instanz
        if (this.#loop) {
            this.#loop.updatables = [] // Array leeren (entfernt Controls, Stats)
            console.log(`[World${instanceIdLog}] Loop gestoppt und geleert.`)
        }


        // 3. Debug-Tools entfernen und aufräumen ---
        if (this.#isDebugMode) {
            // Stats.js DOM-Element entfernen
            if (this.#stats?.dom.parentElement) {
                this.#stats.dom.parentElement.removeChild(this.#stats.dom)
                console.log(`[World${instanceIdLog}] Stats DOM entfernt.`)
            }
            // AxesHelper aus SZene entfernen und disposen
            if (this.#axesHelper) {
                this.#scene?.remove(this.#axesHelper) // Sicherer Zugriff auf #scene
                this.#axesHelper.dispose?.() // Methode dispose aufrufen, falls vorhanden
                console.log(`[World${instanceIdLog}] AxesHelper entfernt.`)
            }
            // GUI Ordner entfernen (von der geteilten GUI)
            if (this.#gui && sharedGui === this.#gui) { // Nur, wenn diese Instanz eine globale GUI hat
                guiRefCount-- // Referenzzähler reduzieren
                const folderName = `Viewer ${this.#instanceId} (${this.#container?.id})`
                try {
                    // Finde den Ordner dieser Instanz und zerstöre ihn
                    const folder = this.#gui.folders.find(f => f._title === instanceName)
                    if (folder) {
                        folder.destroy()
                        console.log(`[World${instanceIdLog}] GUI Ordner '${folderName}' entfernt.`)
                    } else {
                        console.warn(`[World${instanceIdLog}] GUI Ordner '${folderName} nicht gefunden zum Entfernen`)
                    }
                } catch (e) { console.warn("Fehler beim Entfernen des GUI-Ordners:", e) }

                // Zerstöre die globale GUI nur, wenn keine Instanz mehr sie mehr braucht
                if (guiRefCount <= 0 && sharedGui) {
                    console.log("Zerstöre geteilte GUI.")
                    sharedGui.destroy()
                    sharedGui = null
                }
            }
        }

        // 4. Ladeanzeige-UI entfernen
        if (this.#loadingIndicatorElement && this.#loadingIndicatorElement.parentElement) {
            this.#loadingIndicatorElement.parentElement.removeChild(this.#loadingIndicatorElement)
            console.log(`[World${instanceIdLog}] Ladeanzeige UI entfernt`)
            this.#loadingIndicatorElement = null // Referenz löschen
            this.#loadingPercentageElement = null
            this.#loadingCountsElement = null
            this.#loadingProgressBarElement = null
        }

        // 5. Objekte aus Szenen entfernen und Ressourcen freigeben (wichtig!)---
        if (this.#scene) {
            console.log(`[World${instanceIdLog}] Bereinige Szene...`)
            const sceneChildren = Array.from(this.#scene.children)
            sceneChildren.forEach(obj => { // Iteriere über Kopie
                this.#scene.remove(obj)

                // Versuche Geometrie, Material und Texturen freizugeben
                // Dies ist eine vereinfachte Verison - kompexe Modelle brauchen ggf. mehr
                try {
                    obj.traverse?.(child => { // Gehe auch durch die Kinder (wichtig für GLTF)
                        if (child.geometry) child.geometry.dispose()

                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(material => {
                                    if (material.map) material.map.dispose()
                                    // Weitere Texturtypen prüfen
                                    material.dispose()
                                })
                            } else {
                                if (child.material.map) obj.material.map.dispose()
                                // Weitere Texturtypen prüfen
                                child.material.dispose()
                            }
                        }
                    })
                } catch (e) { console.warn("Fehler beim Disposen von Objekt-Ressourcen:", obj.name || obj.uuid, e)}

                /** Optional: Rekursive Bereinigung für Gruppen (wenn Modelle Kinder haben)
                 * function disposeNode(node) { ... }
                 * disposeNode(obj)
                 * */
            })
            console.log(`[World${instanceIdLog}] Szene geleert.`)
        }

        // 6. Renderer disposen (gibt WebGL Kontext frei) ---
        this.#renderer?.dispose() // Sicherer Aufruf
        if (this.#renderer?.domElement.parentElement) {
            this.#renderer.domElement.parentElement.removeChild(this.#renderer.domElement)
        }
        console.log(`[World${instanceIdLog}] Renderer disposed.`)

        // 7. OrbitControls disposen (falls nötig - hat keine explizite dispose-Methode, aber Listenerwerden durch loop-Stop inaktiv) ---
        this.#controls = null // Einfach Referenz entfernen

        
        console.log(`[World${instanceIdLog}] Dispose abgeschlossen!`)

        // 8. Alle Instanz-Referenzen löschen (optional, hilft Garbage Colector) ---
        this.#camera = null
        this.#scene = null
        this.#renderer = null
        this.#loop = null
        this.#controls = null
        this.#resizer = null
        this.#lights = [] 
        this.#clickableObjects = []
        this.#raycaster = null
        this.#mouse = null
        this.#stats = null
        this.#gui = null
        this.#loadingManager = null
        this.#axesHelper = null
        this.#container = null // Wichtig: Referenz auf DOM-Element löschen
        this.boundPointerDownHandler = null
        this.boundObjectClickedHandler = null

    } // Ende dispose-Methode

} // Ende Klasse World

export { World }