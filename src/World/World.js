// src/World/World.js 
// Timestamp: 15:21

// THREE Kern-Klassen, die wir direkt instanziieren werden:
import { 
    LoadingManager, Raycaster, Vector2, AxesHelper, Color, Scene, PerspectiveCamera, WebGLRenderer, 
    Mesh, Box3, Sphere, Vector3, 
    AmbientLight, DirectionalLight, PointLight, 
    Object3D, // Für das Target von DirectionalLight
    DirectionalLightHelper, PointLightHelper, CameraHelper,
    // Für Environment Maps und korrekte Darstellung
    ACESFilmicToneMapping, // Empfohlenes Tone Mapping für HDR
    SRGBColorSpace, // Korrekter Output Color Space
    EquirectangularReflectionMapping, // Mapping-Typ für HDRIs
    PMREMGenerator, // Für die Verarbeitung von HRDIa zu Cube Maps
    PCFSoftShadowMap, PCFShadowMap, BasicShadowMap // ShadowMap-Types - Beispiel für einen weichen Schatten-Typ
} from 'three' // AxesHelper und Color sind nur für Debugging

// EventBus Singleton
import eventBus from './systems/EventBus.js'

// Factory für Lichter (bleibt extern)
import { createLights as createDefaultLights} from './components/lights.js' // Alias, um Verwechslungen zu vermeiden

// System-Klassen
import { Resizer } from './systems/Resizer.js'
import { Loop } from './systems/Loop.js'
import { focalLengthToFov } from './systems/cameraUtils.js'

// Importiere OrbitControls aus dem 'examples'-Verzeichnis von Three.js
// Vite/npm kümmert sich darum, den richtigen Pfad aufzulösen
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// -- Importiere Asset Ladefunktionen  ---
// Die Funktionen erwarten jetzt optional einen Manager
import { loadGltf, loadTexture, loadEnvironmentMap } from './systems/assetLoader.js'

// Komponenten-Klassen
import { Cube } from './components/Cube.js' // Eigene Klasse für Erstellung von Cubes mit Materialien und Texturen
import { Plane } from './components/Plane.js' // Plane-Klasse für Bodenplatte

// Debug-Tool-Imports (Innerhalb der Klasse, wo sie gebraucht werden oder oben)
// Wir importieren sie hier oben, damit sie verfügbar sind
import Stats from 'stats.js' // Für Performance-Statistiken
import { GUI } from 'lil-gui'

// Glassmaterial-Import
import { getCachedGlassMaterial, clearMaterialCache, GLASS_PRESETS } from './components/GlassMaterial.js'

// ============= MATERIAL SYSTEM HELPERS =============

/**
 * Normalisiert die Item-Konfiguration in eine einheitliche Struktur
 * Macht aus verschidenen Config-Formaten ein konsistentes Format
 */
function normalizeItemConfig(item) {
    // Deep Clone um Original nicht zu verändern
    const normalized = JSON.parse(JSON.stringify(item))

    // Transform-Block normalisieren (position, rotation, scale)
    normalized.transform = normalized.transform || {}
    normalized.transform.position = normalized.transform.position || item.position || { x: 0, y: 0, z: 0 }
    normalized.transform.rotation = normalized.transform.rotation || item.rotation || { x: 0, y: 0, z: 0 }
    normalized.transform.scale = normalized.transform.scale || item.scale || { x: 1, y: 1, z: 1}

    // Shadow-Block normalisieren
    normalized.shadows = normalized.shadows || {}
    normalized.shadows.cast = item.castShadow !== undefined ? item.castShadow : true
    normalized.shadows.receive = item.receiveShadow !== undefined ? item.receiveShadow : true

    // Material-Block normalisieren (falls nicht vorhanden oder alte Properties da sind)
    if (!normalized.material) {
        // Prüfe ob alte flache Material-Properties vorhanden sind
        const legacyMaterialProps = ['materialType', 'roughness', 'metalness', 'transmission', 'ior']
        const hasLegacyProps = legacyMaterialProps.some(prop => item[prop] !== undefined)

        if (hasLegacyProps) {
            // Konvertiere alte flache Struktur in neue verschachtelte
            normalized.material = {
                type: item.materialType || 'standard',
                params: {}
            }

            // Sammle alle Material-Parameter
            const paramKeys = ['color', 'roughness', 'metalness', 'opacity', 'transmission', 'thickness', 'ior', 'attenuationColor', 'attenuationDistance']
            paramKeys.forEach(key => {
                if (item[key] !== undefined) {
                    normalized.material.params[key] = item[key]
                }
            })
        }
    }

    return normalized
}

/**
 * Prüft ob ein Mesh-Name zu einem Pattern passt
 * Unterstützt * als Wildcard am Ende
 * @example nameMatches("Glass_Panel_01", "Glass_Panel_*") => true
 */
function nameMatches(meshName, pattern) {
    if (!pattern || !meshName) return false

    // Wildcard am Ende?
    if (pattern.endsWith('*')) {
        return meshName.startsWith(pattern.slice(0, -1))
    }

    // Exakter Match
    return meshName === pattern
}

/**
 * Erstellt ein Material basierend auf der Konfiguration
 * Kann später um weitere Material-Typen erweitert werden
 */
function buildMaterialFromConfig(matConfig, envMap, envMapIntensity = 1) {
    if (!matConfig) return null

    const type = matConfig.type

    // Füge envMapIntensity zu den Parametern hinzu
    const params = {
        ...(matConfig.params || {}),
        envMapIntensity
    }

    switch (type) {
        case 'glass':
            // Nutze die gecachte Version
            return getCachedGlassMaterial({
                type: 'glass',
                preset: matConfig.preset,
                params: params
            }, envMap)

        // Hier später weitere Material-Typen ergänzen
        // case 'metal':
        //     return createMetalMaterial(params, envMap)
        // case 'plastic':
        //     return createPlasticMaterial(params, envMap)

        default: 
            console.log(`Material-Typ '${type}' ist nicht implementiert`)
            return null
    }
}

/**
 * Wendet ein Material auf ein 3D-Objekt und seine Kinder an
 * Unterstützt verschiedene Apply-Modi und Mesh-spezifishe Regeln
 */
function applyMaterialToObject3D(object3D, matConfig, envMap, envMapIntensity, instanceId) {
    if (!matConfig || !object3D) return

    // Hier Code einfügen...
    const instanceIdLog = instanceId ? ` Instance ${instanceId}` : ''
    const applyMode = matConfig.apply || 'replace'

    console.log(`[World${instanceIdLog}] Wende Material an auf '${object3D.name}', Modus: ${applyMode}`)

    // Speichere Original-Materialien beim ersten Mal
    let materialStored = false
    object3D.traverse(child => {
        if (child.isMesh && !child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material
            materialStored = true
        }
    })

    if (materialStored) {
        console.log(`[World${instanceIdLog}] Original-Materialien gespeichert für spätere Wiederherstellung`)
    }

    // Option 1: Mesh-spezifische Regeln (byMesh)
    if (Array.isArray(matConfig.byMesh) && matConfig.byMesh.length > 0) {
        console.log(`[World${instanceIdLog}] Verwende mesh-spezifische Material-Regeln`)

        object3D.traverse(child => {
            if (!child.isMesh) return

            // Finde passende Regel für dieses Mesh
            const rule = matConfig.byMesh.find(r => nameMatches(child.name, r.name))
            if (!rule) return

            console.log(`[World${instanceIdLog}] Mesh '${child.name}' matched Regel '${rule.name}'`)

            // Erstelle Material für diese spezifische Regel
            const material = buildMaterialFromConfig(rule, envMap, envMapIntensity)
            if (material) {
                child.material = material
                child.userData.hasCustomMaterial = true
                child.userData.customMaterialType = rule.type
            }
        })
        return
    }
    
    // Option 2: Include/Exclude Listen
    const includeMeshes = matConfig.includeMeshes || []
    const excludeMeshes = matConfig.excludeMeshes || []

    // Option 3: Globales Material für alle Meshes
    const material = buildMaterialFromConfig(matConfig, envMap, envMapIntensity)
    if (!material) {
        console.warn(`[World${instanceIdLog}] Konnte Material nicht erstellen`)
        return
    }

    let appliedCount = 0
    object3D.traverse(child => {
        if (!child.isMesh) return

        // Prüfe Include/Exclude
        let shouldApply = true

        if (includeMeshes.length > 0) {
            // Nur spezifisch genannte Meshes
            shouldApply = includeMeshes.some(pattern => nameMatches(child.name, pattern))
        } else if (excludeMeshes.length > 0) {
            // Alle außer den ausgeschlossenen
            shouldApply = !excludeMeshes.some(pattern => nameMatches(child.name, pattern))
        }

        if (!shouldApply) return

        // Wende Material an
        if (applyMode === 'replace') {
            child.material = material
            appliedCount++
        } else if (applyMode === 'override' && child.material) {
            // Override nur bestimmte Properties
            Object.assign(child.material, material)
            child.material.needsUpdate = true
            appliedCount++
        }

        child.userData.hasCustomMaterial = true
        child.userData.customMaterialType = matConfig.type
    })

    console.log(`[World${instanceIdLog}] Material auf ${appliedCount} Meshes angewendet`)
}


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

    #cameraSettings = {}
    #lightSettingsFromConfig = [] // SPeichert Lichter aus der Config

    // Environment Map Variablen
    #environmentMapUrl // URL aus der Config
    #environmentMapProcessed = null // Die prozessierte Environment Map Textur
    #environmentMapIntensity = 1.0 // Default Intensity
    #environmentMapRotationY = 0.0 // Default rotation in Radiant
    #pmremGenerator = null // PMREMGenereator Instanz
    #rendererShadowMapTypeFromConfig
    #rendererShadowMapEnabledFromConfig

    #solidBackgroundColor = new Color(0x222233)
    #backgroundMode = 'color' // Default Zustandsvariable für den Hintergrundmodus
    #mainConfig = {}
    #guiBgColorController = null // Referent auf den GUI-Controller für den Farb-Picker (optional)
    #envMapGuiProxy
    #groundPlane = null // Instanzvariable für die Referenz zur konfigurierbaren Bodenplatte
    #groundPlaneConfig = null
    #originalSceneItemConfigs = [] // Für die ursprünglichen sceneItems aus der Config
    #assetBaseUrl
    #backgroundBlur = 0

    // Orbit Controls (expecially external)
    #autoRotate = false 
    #autoRotateSpeed = 1.0

    // Der Constructor nimmt den HTML-Container (ein DOM-Element) und die Instanz-ID entgegen
    constructor(container, mainConfig, isDebugMode = false, instanceId, assetBaseUrl) {
        this.#container = container // Container für diese Instanz speichern
        this.#mainConfig = mainConfig // Speichere die Konfiguration, um sie im ganzen Constructor verfügbr zu machen
        this.#isDebugMode = isDebugMode // Speichere den Flag
        this.#instanceId = instanceId // Speichere die Instanz-ID
        this.#assetBaseUrl = assetBaseUrl // Basis-URL zu den in der JSON-Config angegebenen Assets/Foldern

        // Lies die Auto-Rotate-Einstellungen aus den data-Attributen aus
        this.#autoRotate = container.dataset.camCustomAutoRotate === '1'
        this.#autoRotateSpeed = parseFloat(container.dataset.camCustomAutoRotateSpeed) || 1.0

        // Hintergrundbild
        this.#backgroundBlur = parseFloat(container.dataset.backgroundBlur) || 0

        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})` // Für bessere Logs
        console.log(`[World${instanceIdLog}] Konstruktor gestartet. Debug: ${isDebugMode}`)

        // Renderer-Config aus mainConfig extrahieren
        const rendererConf = mainConfig?.rendererConfig?.shadowMap || {}
        this.#rendererShadowMapEnabledFromConfig = rendererConf.enabled // Könnte true, flse oder undefined sein
        this.#rendererShadowMapTypeFromConfig = rendererConf.type // Könnte eine Zahl oder undefined sein

        const cameraConf = mainConfig?.cameraConfig || {}
        let fovFromConfig = cameraConf.fov || 58 // Standard FOV

        // Prüfe, ob eine Brennweite (focalLength) in der Config angegeben ist. 
        // Wenn ja, berechne das FOV daraus und überschreibe den FOV-Wert.
        if (cameraConf.focalLength && typeof cameraConf.focalLength === 'number' && cameraConf.focalLength > 0) {
            fovFromConfig = focalLengthToFov(cameraConf.focalLength)
            console.log(`[World${instanceIdLog}] Brennweite ${cameraConf.focalLength}mm erkannt. FOV wird auf ${fovFromConfig.toFixed(2)}° gesetzt.`)
        }

        // Camera-spezifische Einstellungen aus mainConfig extrahieren (oder Defaults verwenden)
        this.#cameraSettings = {
            fov: fovFromConfig, // FOV aus Config bestimmen, dort wird ggf. der Defaultwert zugewiesen
            near: cameraConf.near || 0.1, 
            far: cameraConf.far || 100, 
            framingPadding: cameraConf.framingPadding || 1.5, 
            initialPosition: cameraConf.initialPosition, // {x,y,z} oder undefined
            initialLookAt: cameraConf.initialLookAt, // {x,y,z} oder undefined
            // disableFramingIfInitialSet: true, wenn beide Initialwerte da sind, sonst false ODER den Wert aus der Config nehmen
            disableFramingIfInitialSet: cameraConf.initialPosition && cameraConf.initialLookAt
                ? (cameraConf.disableFramingIfInitialSet !== undefined ? cameraConf.disableFramingIfInitialSet : true)
                : false
        }

        // Lichtkonfiguration aus mainConfig extrahieren
        this.#lightSettingsFromConfig = (mainConfig?.lightSettings && Array.isArray(mainConfig.lightSettings))
            ? mainConfig.lightSettings
            : []

        // Environment Konfiguration aus mainConfig extrahieren
        const envMapConfig = mainConfig?.environmentMap || {}
        this.#environmentMapUrl = envMapConfig.url // kann undefined sein
        this.#environmentMapIntensity = envMapConfig.intensity !== undefined ? Number(envMapConfig.intensity) : this.#environmentMapIntensity
        this.#environmentMapRotationY = envMapConfig.rotationY !== undefined ? Number (envMapConfig.rotationY) : this.#environmentMapRotationY

        this.#envMapGuiProxy = {
            status: 'Initialisiere',
            intensity: this.#environmentMapIntensity,
            rotationY: this.#environmentMapRotationY
        }

        // Hintergrundeinstellungen aus Config auslesen
        const backgroundSettings = mainConfig?.backgroundSettings || {}

        // Bestimme den initialen Hintergrund-Modus aus der Config
        if (backgroundSettings.transparent === true) {
            this.#backgroundMode = 'transparent'
        } else if (backgroundSettings.useEnvironmentMapAsBackground === true && mainConfig?.environmentMap?.url) {
            this.#backgroundMode = 'envmap'
        } else {
            this.#backgroundMode = 'color'
        }
        console.log('----->>> this.#backgroundMode: ', this.#backgroundMode)

        // Lese die Farbe, falls sie in der Config gesetzt ist
        if (backgroundSettings.color) {
            this.#solidBackgroundColor = new Color(backgroundSettings.color)
        }

        this.#groundPlane = null // Initialisiere die Bodenplatte mit null

        this.#originalSceneItemConfigs = mainConfig?.sceneItems || [] // Speichere die originalen sceneItems (Objekte)

        const configuredPlaneFromSceneItems = this.#originalSceneItemConfigs.find(item => item.type === 'plane')
        if (configuredPlaneFromSceneItems) {
            this.#groundPlaneConfig = {
                type: 'plane', // Wichtig für spätere Identifikation
                name: configuredPlaneFromSceneItems.name || 'GroundPlane_Config', 
                // Wichtig: Default auf 'circle', wenn shape nicht spezifiziert oder ungültig ist
                shape: ['rectangle', 'circle', 'none'].includes(configuredPlaneFromSceneItems.shape)
                    ? configuredPlaneFromSceneItems.shape
                    : 'circle',
                size: { // Defaults aus Plane.js übernehmen oder anpassen
                    width: configuredPlaneFromSceneItems.size?.width ?? 10,
                    height: configuredPlaneFromSceneItems.size?.height ?? 10, 
                    radius: configuredPlaneFromSceneItems.size?.radius ?? 5    
                },
                segments: configuredPlaneFromSceneItems.segments ?? 32,
                color: configuredPlaneFromSceneItems.color || 'darkgrey',
                mapUrl: configuredPlaneFromSceneItems.mapUrl || null, // URL zur Textur
                roughness: configuredPlaneFromSceneItems.roughness ?? 0.5, 
                metalness: configuredPlaneFromSceneItems.metalness ?? 0.5, 
                receiveShadow: configuredPlaneFromSceneItems.receiveShadow !== undefined ? configuredPlaneFromSceneItems.receiveShadow : true,
                castShadow: configuredPlaneFromSceneItems.castShadow !== undefined ? configuredPlaneFromSceneItems.castShadow : false,
                // Behalte original Position/Rotation/Scale bei 
                position: configuredPlaneFromSceneItems.position || { x: 0, y: 0, z: 0 },
                // Die Plane.js setzt ihre eigene X-Rotation. Diese hier wäre ein Override. 
                // Für den Start lassen wir es einfach, die Plane-Klasse rotiert sich selbst flach. 
                rotation: configuredPlaneFromSceneItems.rotation,
                scale: configuredPlaneFromSceneItems.scale || { x: 1, y: 1, z: 1 }
            }
            console.log(`[World${instanceIdLog}] GroundPlane-Konfiguration aus sceneItems geladen:`, JSON.parse(JSON.stringify(this.#groundPlaneConfig)))
        } else {
            this.#groundPlaneConfig = {
                type: 'plane', 
                name: 'GroundPlane_Default', 
                shape: 'circle', // Standardmäßig ein sichtbarer Kreis
                size: { width: 10, height: 10, radius: 5 }, 
                segments: 32, 
                color: 'darkgrey', 
                mapUrl: null,
                roughness: 0.5, 
                metalness: 0.5, 
                receiveShadow: true, 
                castShadow: false, 
                position: { x: 0, y: 0, z: 0 }, 
                rotation: { x: 1.56840734641021, y: 0, z: 0 }, 
                scale: { x: 1, y: 1, z: 1 }
            }
            console.log(`[World${instanceIdLog}] Keine GroundPlane-Konfiguration in sceneItems gefunden. Default wird verwendet: `, JSON.parse(JSON.stringify(this.#groundPlaneConfig)))
        }
        
        // Für sauberes Logging ohne Proxyobjekte, falls #cameraSettings später komplexer wird
        console.log(`[World${instanceIdLog}] Kamera-Settings initial:`, JSON.parse(JSON.stringify(this.#cameraSettings)))

        
        if (this.#lightSettingsFromConfig.length > 0) {
            console.log(`[World${instanceIdLog}] ${this.#lightSettingsFromConfig.length} benutzerdefinierte Lichtkonfigurationen gefunden. `)
        } else {
            console.log(`[World${instanceIdLog}] Keine benutzerdefinierten Lichtkonfigurationen gefunden. Standards aus lights.js werden verwendet.`)
        }

        if (this.#environmentMapUrl) {
            console.log(`[World${instanceIdLog}] Environment Map konfiguriert: URL='${this.#environmentMapUrl}', Intensität=${this.#environmentMapIntensity}, Rotation=${this.#environmentMapRotationY}`)
        } else {
            console.log(`[World${instanceIdLog}] Keine Environment Map URL gefunden`)
        }

        // --- Instanzfelder initialisieren ---
        this.#clickableObjects = []
        this.#lights = [] // Initialisiere leeres Array
        this.#groundPlane = null // Sicherstellen, dass es null ist, wird in init() korrekt gesetzt

        // 5. Ladeanzeigen-UI erstellen und zum Container hinzufügen
        this.#createLoadingIndicatorUI()

        // 1. Erstelle die Kernkomponenten als Instanzvariablen via interner Methoden
        this.#scene = this.#createScene()
        this.#camera = this.#createCamera() // Nutzt jetzt this.#container für Aspect Ratio
        this.#renderer = this.#createRenderer()

        // PRREMGenerator initialisieren (nach dem Renderer!) - für EnvironmentMap-Behandlung
        if (this.#renderer) { // Sicherstellen, dass der Renderer auch existiert
            this.#pmremGenerator = new PMREMGenerator(this.#renderer)
            // Optional: Shader vorkompilieren, um erstes STottern beim Laden der EnvMap zu vermeiden
            // Kann bei sehr vielen Instanzen oder langsamen Geräten etwas dauern.
            this.#pmremGenerator.compileEquirectangularShader() // Kann zu "WebGL: INVALID_OPERATION: readPixels: buffer is not complete" führen, wenn zu früh aufgerufen!
            console.log(`[World${instanceIdLog}] PMREMGenerataor initialisiert.`)
        } else {
            console.error(`[World${instanceIdLog}] Renderer konnte nicht initialisiert werden. PMREMGenerator nicht erstellt.`)
        }

        // 3. Canvas DIESER Instanz zum Container hinzufügen
        this.#container.append(this.#renderer.domElement)

        // --- Fade-In der Ladeanzeige ---
        // Kleine Verzögerung, damit der Browser das Element rendernkann, bevor die Transition startet
        setTimeout(() => {
            if (this.#loadingIndicatorElement) {
                this.#loadingIndicatorElement.classList.add('visible')
            }
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
            // this.#controls.target.set(0, 0.75, 0) // Kann weg
        this.#controls.enableDamping = true
        this.#controls.dampingFactor = 0.05 // Stärke der Dämpfung
        this.#controls.autoRotate = this.#autoRotate
        this.#controls.autoRotateSpeed = this.#autoRotateSpeed

        // Schränke Kamerarotation im normalen Modus ein, im Debug soll man auch unter die Bodenplatte sehen können
        if (!this.#isDebugMode) {
            this.#controls.maxPolarAngle = Math.PI * 0.5 // Verhindert das Schauen unter die XZ-Ebene
            console.log(`[World${instanceIdLog}] maxPolarAngle auf Math.PI * 0.5 gesetzt (Debug-Modus ist AUS).`)
        } else {
            // Im Debug-Modus bleibt maxPolarAngle unbegrenzt (Standardverhalten von OrbitControls)
            // oder könnte explizit auf Math.PI gesetzt werden, um sicherzustellen, dass es die volle Freiheit gibt.
            // Standard ist meistens ausreichend.
            console.log(`[World${instanceIdLog}] maxPolarAngle bleibt unbegrenzt (Debug-Modus ist AN).`)
        }

        // WICHTIG: Damit Raycasting und OrbitControls nicht kollidieren, 
        // müssen die Controls wissen, wann sie *nicht* reagieren sollen (z.B. während Dragging)
        // Das ist hier noch nicht implementiert, aber für ein einfaches Klicken rechts erstmal. 

            // Weitere nützliche OrbitControls-Settings (optional): 
            // this.#controls.screenSpacePanning = false // Verhindert seltsames Panning-Verhalten
            // this.#controls.minDistance = 2 // Minimaler Zoom-Abstand
            // this.#controls.maxDistance = 15 // Maximaler Zoom-Abstand
            // this.#controls.maxPolarAngle = Math.PI * 0.5 // Verhindert, dass man untzer die Bodenplatte/-ebene schaut

        // Initiales Target für OrbitControls setzen, falls in COnfig definiert
        if (this.#cameraSettings.initialLookAt) {
            this.#controls.target.set(
                this.#cameraSettings.initialLookAt.x, 
                this.#cameraSettings.initialLookAt.y, 
                this.#cameraSettings.initialLookAt.z, 
            )
            this.#controls.update() // Wichtig nach Targetänderung
            console.log(`[World${instanceIdLog}] OrbitControls auf InitialLookAt gesetzt:`, this.#controls.target)
        } else {
            // Fallback, falls kein initialLookAt, aber trotzdem Damping aktiv ist
            // this.#controls.target.set(0, 0.75, 0); // Besser im Framing-Block oder gar nicht, wenn Framing aktiv wird
        }

        // 7. Animations-Loop für DIESE Instanz erstellen
        this.#loop = new Loop(this.#camera, this.#scene, this.#renderer)
        // 7. b) Füge Controls DIESER Instanz zum Loop hinzu
            // OrbitControls müssen aktualisiert werden, besonders, wenn Damping aktiviert ist
        this.#loop.updatables.push(this.#controls)
        
        // 8. Resizer für DIESE Instanz hinzufügen, um auf Größenänderungen des Viewports/Fensters zu reagieren
        // Wichtig: Übergibt jetzt Instanzvariablen!
        this.#resizer = new Resizer(this.#container, this.#camera, this.#renderer)

        // 9. Lichter für DIESE Instanz erstellen und hinzufügen
        this.#setupLights(instanceIdLog)

        // 10. Erstelle die 3D-Objekte und füge sie der DIESER Instanz hinzu ---

            // Optional: Füge Ebene zu klickbaren Objekten hinzu
            // this.#clickableObjects.push(plane)
            // console.log(`Objekt '${plane.name || 'Plane'}' zu clickableObjects hinzugefügt.`)

        // Veraltet, da noch nicht an diese Instanz gebunden: 
            // Hier können wir auch den Würfel oder andere Objekte hinzufügen, wenn sie animiert werden sollen: 
            // cube.tick = (delta) => { cube.rotation.y += delta } // Beispiel-Animation
            // loop.updatables.push(cube)

        // Interaktion/Listener für DIESE Instanzeinrichten (Raycasting Listener)
        this.#setupInteraction(instanceIdLog) // Übergib ID für Logs

        console.log(`[World${instanceIdLog}] Konstruktor abgeschlossen.`)
    }

    // --- Private Helper-Methoden zum Erstellen von Kern-Komponenten ---
    #setupLights(instanceIdLog) {
        this.#lights.forEach(light => { // Zuerst eventuell vorhandene Lichter und Helper entfernen
            if (light.userData.helper) {
                this.#scene.remove(light.userData.helper)
                light.userData.helper.dispose?.() // ?. für den Fall, dass dispose nicht existiert
                delete light.userData.helper // Entferne die Referenz
            }

            // Optional: 
            if (light.userData.shadowCameraHelper) {
                this.#scene.remove(light.userData.shadowCameraHelper)
                light.userData.shadowCameraHelper.dispose?.()
                delete light.userData.shadowCameraHelper
            }

            this.#scene.remove(light)
            if (light.target && light.target.parent === this.#scene) { // Für DirectLight
                this.#scene.remove(light.target) 
            }
        })
        this.#lights = []

        // Log-Ausgabe soll klarer zeigen, ob Config oder Defaults verwendet werden
        console.log(`World${instanceIdLog} Erstelle Lichter basierend auf` + (this.#lightSettingsFromConfig.length > 0 ? 'data-config' : './components/lights.js (Defaults)') + `.`)

        // --- Beging des if/else-Blocks zur Verarbeitung der Lichter ---
        // Unterscheidung, ob Lichter aus Config oder Defaults verwendet werden
        if (this.#lightSettingsFromConfig.length > 0) {
            
            // Verarbeitung der Lichter aus der data-config
            for (const lightConfig of this.#lightSettingsFromConfig) {
                let light = null
                let helper = null
                const color = new Color(lightConfig.color !== undefined ? lightConfig.color : "#ffffff")
                const intensity = lightConfig.intensity !== undefined ? lightConfig.intensity : 1

                switch (lightConfig.type) {
                    case 'AmbientLight':
                        light = new AmbientLight(color, intensity)
                        light.name = lightConfig.name || `ConfigAmbientLight_${this.#lights.length}`
                        light.userData.lightType = 'AmbientLight'
                        // AmbientLight hat keinen Standard-Helper
                        break
                    case 'DirectionalLight':
                        light = new DirectionalLight(color, intensity)
                        light.name = lightConfig.name || `ConfigDirectionalLight_${this.#lights.length}`
                        light.userData.lightType = 'DirectionalLight'
                        if (lightConfig.position) {
                            light.position.set(
                                lightConfig.position.x || 0, 
                                lightConfig.position.y || 0, 
                                lightConfig.position.z || 0
                            )
                        } else {
                            light.position.set(1, 1, 1)
                        }
                        if (lightConfig.targetPosition) {
                            const targetObject = new Object3D()
                            targetObject.position.set(
                                lightConfig.targetPosition.x || 0, 
                                lightConfig.targetPosition.y || 0, 
                                lightConfig.targetPosition.z || 0
                            )
                            this.#scene.add(targetObject)
                            light.target = targetObject
                        }
                        if (this.#isDebugMode) {
                            helper = new DirectionalLightHelper(light, 1) // 1 ist die Größe des Helpers
                            helper.name = `{$light.name}_Helper`
                            light.userData.helper = helper // Helper am Licht speichern
                            this.#scene.add(helper)
                        }
                        

                        // --- Schatteneinstellungen für DirectionalLight ---
                        if (lightConfig.castShadow === true) {
                            light.castShadow = true // Setze die THREE.js-Eigenschaft castShadow

                            // Standard-Schattenparameter, die überschrieben werden können
                            
                            let sMapSize = 1024 // Map Size: Auflösung der Schattenkarte (höher = schärfer, aber langsamer)
                            
                            // Camera Frustum: Bereich, der Schatten werfen kann (muss groß genug sein, um alle Schatten-werfenden Objekte zu erfassen)
                            let sCamNear = 0.5
                            let sCamFar = 50 // Muss weiter sein als die weiteste Entfernung, in der Schatten sichtbar sein sollen
                            let sCamLeft = -10 // Beispielwerte: an Szene anzupassen
                            let sCamRight = 10
                            let sCamTop = 10
                            let sCamBottom = -10
                            let sBias = -0.001 // Bias: Hilft bei Schatten-Artefakten. Kleiner negativer Wert hilft oft.
                            let sRadius = 1 // Standard-Radius für PCFSoftShadowMap, falls nicht anders gesetzt

                            // Lese detaillierte Schattenparameter aus der Config, falls vorhanden
                            if (lightConfig.shadowParameters) {
                                const params = lightConfig.shadowParameters
                                sMapSize = params.mapSize !== undefined ? params.mapSize : sMapSize
                                sCamNear = params.cameraNear !== undefined ? params.cameraNear : sCamNear
                                sCamFar = params.cameraFar !== undefined ? params.cameraFar : sCamFar
                                sCamLeft = params.cameraLeft !== undefined ? params.cameraLeft : sCamLeft
                                sCamRight = params.cameraRight !== undefined ? params.cameraRight : sCamRight
                                sCamTop = params.cameraTop !== undefined ? params.cameraTop : sCamTop
                                sCamBottom = params.cameraBottom !== undefined ? params.cameraBottom : sCamBottom
                                sBias = params.bias !== undefined ? params.bias : sBias
                                sRadius = params.radius !== undefined ? params.radius : sRadius
                            }

                            light.shadow.mapSize.set(sMapSize, sMapSize)
                            light.shadow.camera.near = sCamNear
                            light.shadow.camera.far = sCamFar
                            light.shadow.camera.left = sCamLeft
                            light.shadow.camera.right = sCamRight
                            light.shadow.camera.top = sCamTop
                            light.shadow.camera.bottom = sCamBottom
                            light.shadow.bias = sBias
                            light.shadow.radius = sRadius

                            console.log(`[World${instanceIdLog}] DirectionalLight '${light.name}' für Schattenwurf konfiguriert.`)
                        } else {
                            light.castShadow = false
                        }
                        // Optional: Debug Helper für die Schattenkamera des DirectionalLight
                        if (this.#isDebugMode && light.castShadow) {
                            const shadowCameraHelper = new CameraHelper(light.shadow.camera)
                            this.#scene.add(shadowCameraHelper)
                            light.userData.shadowCameraHelper = shadowCameraHelper // Speichern für Dispose/GUI
                            console.log(`[World${instanceIdLog}] DirectionalLight '${light.name}' ShadowCameraHelper hinzugefügt.`)
                        }
                        break

                    case 'PointLight':
                        light = new PointLight(
                            color, 
                            intensity, 
                            lightConfig.distance || 0, 
                            lightConfig.decay !== undefined ? lightConfig.decay : 2
                        )
                        light.name = lightConfig.name || `ConfigPointLight_${this.#lights.length}`
                        light.userData.lightType = 'PointLight'
                        if (lightConfig.position) {
                            light.position.set(
                                lightConfig.position.x || 0,
                                lightConfig.position.y || 0, 
                                lightConfig.position.z || 0
                            )
                        }
                        if (this.#isDebugMode) {
                            helper = new PointLightHelper(light, 0.5) // 0.5 ist die Größe des Helpers
                            helper.name = `${light.name}_Helper`
                            light.userData.helper = helper
                            this.#scene.add(helper)
                        }
                        

                        // Schatten
                        if (lightConfig.castShadow === true) {
                            light.castShadow = true

                            // Standard-Schattenparameter
                            let sMapSize = 1024
                            let sCamNear = 0.1 // Oft näher als DirectionalLight
                            let sCamFar = lightConfig.distance > 0 ? lightConfig.distance : 100 // Weite sollte entsprechend der Lichtentfernung oder groß genug sein
                            let sBias = -0.001
                            let sRadius = 1

                            if (lightConfig.shadowParameters) {
                                const params = lightConfig.shadowParameters
                                sMapSize = params.mapSize !== undefined ? params.mapSize : sMapSize
                                sCamNear = params.cameraNear !== undefined ? params.cameraNear : sCamNear
                                sCamFar = params.cameraFar !== undefined ? params.cameraFar : sCamFar
                                sBias = params.bias !== undefined ? params.bias : sBias
                                sRadius = params.radius != undefined ? params.radius : sRadius
                            }

                            light.shadow.mapSize.set(sMapSize, sMapSize)
                            light.shadow.camera.near = sCamNear
                            light.shadow.camera.far = sCamFar
                            light.shadow.bias = sBias
                            light.shadow.radius = sRadius

                            console.log(`[World${instanceIdLog}] PointLight '${light.name}' für Schattenwurf konfiguriert.`)
                        } else {
                            light.castShadow = false
                        }
                        // Optional: Debug Helper für die Schattenkamera des PointLight
                        if (this.#isDebugMode && light.castShadow) {
                            const shadowCameraHelper = new CameraHelper(light.shadow.camera)
                            this.#scene.add(shadowCameraHelper)
                            light.userData.shadowCameraHelper = shadowCameraHelper
                            console.log(`[World${instanceIdLog}] PointLight '${light.name}' ShadowCameraHelper hinzugefügt.`)
                        }
                        break

                    // TODO: SpotLight Implementierung hinzufügen (ähnlich wie PointLight für Schatten)
                    default:
                        console.warn(`[World${instanceIdLog}] Unbekannter Licht-Typ in Konfiguration: ${lightConfig.type}`)
                        continue
                }

                if (light) {
                    this.#lights.push(light)
                    this.#scene.add(light)
                    if (light.target && light.target.parent !== this.#scene) { // Sicehrstellen, dass Target hinzugefügt wird, falls es noch nicht in der Szene ist
                        this.#scene.add(light.target)
                    }
                    console.log(`[World${instanceIdLog}] Licht '${light.name}' (${lightConfig.type})` + (helper ? ' mit Helper' : '') + ` zur Szene hinzugefügt.`)
                }
            }                
        } else {
            // Fallback: Keine lightSettings in der Config -> Standardlichter aus lights.js verwenden
            console.log(`[World${instanceIdLog}] Erstelle Standardlichter aus ./components/lights.js`)
            const defaultLightsArray = createDefaultLights()

            //this.#lights.push(...defaultLightsArray)
            defaultLightsArray.forEach((defaultLight, index) => {
                
                let light = defaultLight // Arbeite mit der Kopie/Instanz

                if (light.isDirectionalLight) {
                    light.userData.lightType = 'DirectionalLight'
                } else if (light.isAmbientLight) {
                    light.userData.lightType = 'AmbientLight'
                } else if (light.isPointLight) {
                    light.userData.lightType = 'PointLight'
                }

                let helper = null
                // Namen setzen, falls vorhanden
                if (!light.name) {
                    light.name = `${light.constructor.name}_Default_${index}`
                }

                if (light.isDirectionalLight) {
                    helper = new DirectionalLightHelper(light, 1)
                } else if (light.isPointLight) {
                    helper = new PointLightHelper(light, 0.5)
                }
                // Weitere Helper für andere Standardlichttypen hier hinzufügen

                // --- Explizit Schatten für Default-Lichter deaktivieren und Parameter setzen ---
                if (light.isDirectionalLight || light.isPointLight) {
                    light.castShadow = false // Explizit Schatten für Defaults deaktivieren
                    // Stadard-Schattenparameter für Defaults (auch wenn castShadow false ist - schadet nicht)
                    light.shadow.mapSize = new Vector2(1024, 1024) // nutze Zuweisung statt set
                    light.shadow.camera.near = 0.1
                    light.shadow.camera.far = light.distance > 0 ? light.distance : 100
                    light.shadow.bias = - 0.001
                }

                if (helper && this.#isDebugMode) {
                    helper.name = `${light.name}_Helper`
                    light.userData.helper = helper
                    this.#scene.add(helper)
                }

                this.#lights.push(light) // Füge das konfigurierte Licht zum Array hinzu
                this.#scene.add(light)
                if (light.target && light.target.parent !== this.#scene) {
                    this.#scene.add(light.target)
                }
                console.log(`[World${instanceIdLog}] Standardlicht '${light.name}' hinzugefügt.` + (light.castShadow ? ' (wirft Schatten)' : ''))
            })
        }
    }

    #createCamera() {
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})` // Fürs Logging
        // Nutzt die Breite/Höhe des spezifischen Containers dieser Instanz
        const aspectRatio = this.#container.clientWidth / this.#container.clientHeight
        const camera = new PerspectiveCamera(
            this.#cameraSettings.fov,     // FOV
            aspectRatio, 
            this.#cameraSettings.near,    // near
            this.#cameraSettings.far    // far
        )

        // Berücksichtige initialPosition aus der Config
        if (this.#cameraSettings.initialPosition) {
            camera.position.set(
                this.#cameraSettings.initialPosition.x, 
                this.#cameraSettings.initialPosition.y, 
                this.#cameraSettings.initialPosition.z 
            )
            console.log(`[World${instanceIdLog}] Kamera-Position auf initialPosition gesetzt: `, camera.position)
        } else {
            // Fallback-Position, falls keine initialPosition definiert ist
            camera.position.set(0, 1, 5)
            console.log(`[World${instanceIdLog}] Kamera-Position auf Fallback gesetzt: `, camera.position)
        }        
        return camera
    }

    async #updateGroundPlaneInstance(instanceIdLogParam) {
        const instanceIdLog = instanceIdLogParam || ` Instance ${this.#instanceId} (${this.#container.id})`

        const config = this.#groundPlaneConfig // Die aktuelle Wunschkonfiguration

        // Fall 1: Plane soll nicht sichtbar sein ('none')
        if (config.shape === 'none') {
            if (this.#groundPlane) { // Wenn eine Plane existiert, entferne sie
                console.log(`[World${instanceIdLog}] GroundPlane wird entfernt (shape: 'none). Name: ${this.#groundPlane.name}`)
                this.#scene.remove(this.#groundPlane)
                // Geometrie und Material freigeben (wichtig, wenn Plane eigene Ressourcen hat)
                if (this.#groundPlane.geometry) this.#groundPlane.geometry.dispose()
                if (this.#groundPlane.material) {
                    if (Array.isArray(this.#groundPlane.material)) {
                        this.#groundPlane.material.forEach(m => m.dispose())
                    } else { 
                        this.#groundPlane.material.dispose()
                    }
                }
                this.#groundPlane = null
            }
            return
        }

        // Textur laden und Konfiguration für Plane-Klasse vorbereiten START ---
        let planeTexture = null
        if (config.mapUrl && typeof config.mapUrl === 'string') {
            try {
                // Lade die Textur asynchron mit dem LoadingManager
                planeTexture = await loadTexture(config.mapUrl, this.#loadingManager, this.#assetBaseUrl)
                console.log(`[World${instanceIdLog}] Textur für GroundPlane geladen: ${config.mapUrl}`)
            } catch (error) {
                console.error(`[World${instanceIdLog}] Fehler beim Laden der GroundPlane-Textur: ${config.mapUrl}`, error)
                planeTexture = null // Sicherstellen, dass bei Fehler keine Textur verwendet wird
            }
        }

        // Erstelle eine Konfiguration, die an die Plane-Klasse übergeben wird. 
        // Diese enthält das geladene Testur-Objekt (map) anstelle der URL (mapUrl)
        const configForPlaneClass = {
            ...config, // Übernimm alle Eigenschaften wir shape, size, color etc. 
            map: planeTexture // Füge die geladene Textur als 'map' hinzu
        }
        // Textur laden und Konfiguration für Plane-Klasse vorbereiten END ---


        // Fall 2: Die Plane soll sichtbar sein ('rectangle' oder ''circle)
        // Hier gehen wir davo aus, dass this.#groundPlaneConfig die vollen Attribute ernthält (pos, tor, scale etc.)
        if (!this.#groundPlane) {
            // Es gibt keine Plane, aber es soll eine geben -> neu erstellen
            console.log(`[World${instanceIdLog}] Erstelle neue GroundPlane. Config: `, JSON.parse(JSON.stringify(config)))
            
            // 1.: Plane mit allen internen Eigenschaften (Form, Material) erstellen
            this.#groundPlane = new Plane(configForPlaneClass) // Plane-Constructor nutzt shape, size, color etc. aus der config
            
            // 2.: Plane in der Szene Platzieren und 
                // Position, Rotation, Skalierung aus der #groundPlaneConfig anwenden. 
                // Bleibt Aufgabe von World.js
            // Die Plane-Klasse rotiert sich intern schon flach. Diese Werte hier sind Overrides/Zusätze.
            this.#groundPlane.position.set(config.position.x, config.position.y, config.position.z)
            if (config.rotation) {
                //this.#groundPlane.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z) // Vorsicht mit X-Rotation hier vs. Plane-intern
                Object.assign(this.#groundPlane.rotation, config.rotation)
            }
            this.#groundPlane.scale.set(config.scale.x, config.scale.y, config.scale.z)

            this.#scene.add(this.#groundPlane)
            // Füge zur Framing-Liste hinzu (muss hier zugänglich sein, ggf. als Parameter übergeben oder als Instandvariable)
            // this.loadedSceneObjectsForFraming.push(this.#groundPlane) // Dies muss im Kontext von init() passieren. 
            console.log(`[World${instanceIdLog}] GroundPlane '${this.#groundPlane.name}' erstellt und hinzugefügt.`)
        } else {
            // Es gibt bereits eine Plane -> aktualisiere sie
            console.log(`[World${instanceIdLog}] Aktualisiere bestehende GroundPlane. Config:`, JSON.parse(JSON.stringify(config)))
            
            // 1.: Interne Eigenschaften der Plane (Form, Metarial) über die Methode aktualisieren. 
            //  Diese Zeile ersetzt viele manuelle Zuweisungen
            this.#groundPlane.updatePlane(configForPlaneClass) // updatePlane kümmert sich um shape, size

            // 2.: Platzierung in der Szene aktualisieren. 
            //  Auch dies bleibt Aufgabe von World.js

            // Position, Rotation, Skalierung aktualisieren
            this.#groundPlane.position.set(config.position.x, config.position.y, config.position.z)
            if (config.rotation) {
                //this.#groundPlane.rotation.set(config.rotation.x, config.rotation.y, config.rotation.z) // Vorsicht mit X-Rotation
                Object.assign(this.#groundPlane.rotation, config.rotation)
            }
            this.#groundPlane.scale.set(config.scale.x, config.scale.y, config.scale.z)
            // Weg: 
            // if (config.rotation.x === 0 && this.#groundPlane.rotation.x !== -Math.PI * 0.5) {
            //     this.#groundPlane.rotation.x = -Math.PI * 0.5
            // }

            console.log(`[World${instanceIdLog}] GroundPlane '${this.#groundPlane.name}' aktualisiert.`)
        }

        // Schatteneigenschaften (werden in Plane.js gesetzt, aber zur Sicherheit)
        // if (this.#groundPlane) {
        //     this.#groundPlane.receiveShadow = config.receiveShadow
        //     this.#groundPlane.castShadow = config.castShadow

        //     // Stelle sicher, dass die Plane in der Framing-Liste ist, wenn sie existiert
        //     // if (this.loadedSceneObjectsForFraming && !this.loadedSceneObjectsForFraming.includes(this.#groundPlane)) {
        //     //     this.loadedSceneObjectsForFraming.push(this.#groundPlane)
        //     // }
        // }
    }

    #createScene() {
        const scene = new Scene()
        // scene.background = new Color(0xabcdef) // Defaultwert, soll aber via EnvironmentMap geladen werden. Default denkbar, wenn this.#environmentMapUrl leer ist.
        return scene
    }

    #createRenderer() {
        const renderer = new WebGLRenderer({
            antialias: true, 
            alpha: true
            // Optional: Wenn Performance auf Mobilgeräten wichtig ist
            // powerPreferences: 'high-performance'
        })
        
        // *** NEUER, VEREINFACHTER LOG ***
        console.log('[World' + this.#instanceId + ' - #createRenderer] Renderer direkt nach Erstellung:')
        console.log(renderer)
        console.log('[World' + this.#instanceId + ' - #createRenderer] renderer.id direkt nach Erstellung: ' + renderer.id)
        // *** ENDE NEUER, VEREINFACHTER LOG ***

        renderer.setClearColor(0x000000, 0)

        renderer.toneMapping = ACESFilmicToneMapping // Empfohlenes Tone Mapping
        renderer.toneMappingExposure = 1.0 // Default, kann später justiert werden
        renderer.outputColorSpace = SRGBColorSpace // Wichtiges Farbsetting

        // Schattenwurf aktivieren, Werte kommen, wenn da aus Config oder Default
        if (this.#rendererShadowMapEnabledFromConfig !== undefined) {
            renderer.shadowMap.enabled = this.#rendererShadowMapEnabledFromConfig
        } else {
            renderer.shadowMap.enabled = true
        }
        
        // Optional: Shadow Map Typ einstellen (auch aus Config oder Default)
        if (this.#rendererShadowMapTypeFromConfig !== undefined) {
            // Stelle sicher, dass der Wert eine gültige Zahl ist (Three.js erwartet Zahlen für Typen)
            const typeValue = Number(this.#rendererShadowMapTypeFromConfig)
            if (!isNaN(typeValue) && typeValue >= 0 && typeValue <= 2) { // Gültigkeitsbereich für Standardtypen, hier 2 statt 3 weil nicht alle genutzt werden
                renderer.shadowMap.type = typeValue
            } else {
                console.warn(`[World${this.#instanceId}] Üngültiger shadowMap.type ('${this.#rendererShadowMapTypeFromConfig}) in Config. Verwende Default.`)
                renderer.shadowMap.type = PCFSoftShadowMap // Fallback auf Default
            }
        } else {
            renderer.shadowMap.type = PCFSoftShadowMap // Standard-Type, falls nichts in Config definiert wurde
        }
        

        // Größe wird durch Resizer gesetzt, nicht hier
        console.log(`[World${this.#instanceId}] Renderer erstellt mit ToneMapping: ACESFilmic, OutputColorSpace: SRGB, ShadowMap Enabled: ${renderer.shadowMap.enabled} of Type: ${renderer.shadowMap.type}`)
        return renderer
    }

    async #setupEnvironmentMap(instanceIdLog){
        if (!this.#environmentMapUrl) {
            // Wenn keine URL da ist, direkt die Ansicht mit dem Default (Farbe) aktualisieren
            this.#updateBackgroundAppearance(instanceIdLog)
            this.#applyEnvironmentMapSettings(instanceIdLog) // Sicherstellen, dass #scene.environment auf null gesetzt wird
            return
        }

        if (!this.#pmremGenerator) {
            console.error(`[World${instanceIdLog}] PMREMGenerator nicht initialisiert.`)
            this.#updateBackgroundAppearance(instanceIdLog) // Ansicht mit Fehlerzustand aktualisieren
            return
        }

        this.#loadingManager.itemStart(`envMap-${this.#instanceId}`)
        try {
            const hdrTexture = await loadEnvironmentMap(this.#environmentMapUrl, this.#loadingManager, this.#assetBaseUrl)
            hdrTexture.mapping = EquirectangularReflectionMapping
            this.#environmentMapProcessed = this.#pmremGenerator.fromEquirectangular(hdrTexture).texture
            hdrTexture.dispose()

            console.log(`[World${instanceIdLog}] Environment Map erfolgreich prozessiert.`)

            // GUI-Status hier bei Erfolg aktualisieren
            this.#envMapGuiProxy.status = this.#environmentMapUrl // <-- Zeige den Pfad an ODER: .split('/').pop() <-- Zeigt nur den Dateinamen
            if (this.guiEnvMapStatusController) {
                this.guiEnvMapStatusController.updateDisplay()
                this.guiEnvMapStatusController.enable()
            }
            // IBL-Regler hier aktivieren, da die Map jetzt bereit ist
            if (this.guiIblIntensityController) this.guiIblIntensityController.enable()
            if (this.guiIblRotationController) this.guiIblRotationController.enable()

        } catch (error) {
            console.error(`[World${instanceIdLog}] Fehler beim Laden/Prozessieren der EnvMap: ${this.#environmentMapUrl}`, error)
            this.#environmentMapProcessed = null // Sicherstellen, dass sie als nicht verfügbar gilt

            // Den Status im Proxy-Objekt auf die Fehlermeldung setzen
            this.#envMapGuiProxy.status = 'Ladefehler!'

            // GUI-Status aktualisieren und aktivieren
            if (this.guiEnvMapStatusController) {
                this.guiEnvMapStatusController.updateDisplay() // WICHTIG: Zeigt den neuen Wert an
                this.guiEnvMapStatusController.enable()
            }
            // Regler bleiben deaktiviert, da keine Map geladen wurde

        } finally {
            this.#loadingManager.itemEnd(`envMap-${this.#instanceId}`)
            // WICHTIG: Ansicht erst hier aktualisieren, wenn der Ladevorgang beendet ist.
            this.#applyEnvironmentMapSettings(instanceIdLog) // Beleuchtung anwenden
            this.#updateBackgroundAppearance(instanceIdLog) // Hintergrund anwenden
        }
    }

    #applyEnvironmentMapSettings(instanceIdLogPassed) {
        const instanceIdLog = instanceIdLogPassed || ` Instance ${this.#instanceId} (${this.#container?.id || '?'})`

        if (this.#scene && this.#environmentMapProcessed) {
            // Prüfe, ob die Beleuchtung durch die EnvMap überhaupt aktiv sein soll
            if (this.#environmentMapIntensity > 0) {
                this.#scene.environment = this.#environmentMapProcessed
                this.#scene.environmentIntensity = this.#environmentMapIntensity
                
                if (this.#scene.environmentRotation) {
                    this.#scene.environmentRotation.y = this.#environmentMapRotationY
                } else {
                    // Fallback für ältere Versionen oder falls es nicht direkt gesetzt ist
                    // In neueren Versionen wird dies automatisch verwaltet.
                }

                console.log(`[World${instanceIdLog}] EnvironmentMap-Beleuchtung angewendet: Intensität=${this.#environmentMapIntensity}`)
            } else {
                // Wenn die Intensität 0 ist, explizit keine Beleuchtung setzen
                this.#scene.environment = null
                console.log(`[World${instanceIdLog}] EnvironmentMap-Beleuchtung deaktiviert (Intensität ist 0).`)
            }
        } else {
            // Fallback, wenn keine Map geladen wurde
            this.#scene.environment = null
            console.log(`[World${instanceIdLog}] Keine EnvironmentMap-Beleuchtung angewendet (keine Map prozessiert).`)
        }
    }

    #updateBackgroundAppearance(instanceIdLogPassed) {
        const instanceIdLog = instanceIdLogPassed || ` Instance ${this.#instanceId} (${this.#container?.id || '?'})`

        // Set blur intensity
        this.#scene.backgroundBlurriness = this.#backgroundBlur

        // Zuerst nur den Farb-Picker verstecken
        if (this.#guiBgColorController) this.#guiBgColorController.hide()
        
        // 1. Setze den sichtbaren Hintergrund basierend auf dem Modus
        switch (this.#backgroundMode) {
            case 'transparent':
                this.#scene.background = null
                console.log(`[World${instanceIdLog}] Hintergrund auf Transparent gesetzt.`)
                break

            case 'envmap':
                if (this.#environmentMapProcessed) {
                    this.#scene.background = this.#environmentMapProcessed
                    console.log(`[World${instanceIdLog}] Hintergrund auf Environment Map gesetzt.`)
                } else {
                    // this.#backgroundMode = 'color' // Fallback, wenn EnvMap nicht da ist
                    this.#scene.background = this.#solidBackgroundColor
                    if (this.#guiBgColorController) this.#guiBgColorController.show()
                    console.warn(`[World${instanceIdLog}] EnvMap als Hintergrund gewählt, aber nicht verfügbar. Fallback auf Volltonfarbe.`)
                }
                break

            case 'color':
            default:
                this.#scene.background = this.#solidBackgroundColor
                if (this.#guiBgColorController) this.#guiBgColorController.show()
                console.log(`[World${instanceIdLog}] Hintergrund auf Volltonfarbe #${this.#solidBackgroundColor.getHexString()} gesetzt.`)
                break
        }

        // 2. Aktiviere/Deaktiviere die IBL-Regler basierend darauf, ob die EnvMap bereit ist
        const isEnvMapReady = !!this.#environmentMapProcessed

        if (this.guiIblIntensityController) {
            this.guiIblIntensityController.enable(isEnvMapReady)
        }
        if (this.guiIblRotationController) {
            this.guiIblRotationController.enable(isEnvMapReady)
        }

    }

    // --- Methoden für Ladeanzeige ---

    #createLoadingIndicatorUI() {
        console.log(`[World${this.#instanceId}] Create loader UI`)
        this.#loadingIndicatorElement = document.createElement('div')
        this.#loadingIndicatorElement.className = 'loading-indicator hidden'
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
        this.#loadingProgressBarElement.style.backgroundCOlor = '#eee'

        progressBarContainer.append(this.#loadingProgressBarElement)
        this.#loadingIndicatorElement.append(
            this.#loadingPercentageElement, 
            this.#loadingCountsElement, 
            progressBarContainer)
        // Füge das Overlay zum Container DIESER Instanz hinzu
        this.#container.append(this.#loadingIndicatorElement)
        console.log(`[World${this.#instanceId}] Ladeanzeige UI erstellt und zum Container hinzugefügt.`)
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
        this.#stats.dom.style.left = '0px'
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
        
        // Nur fortfahren, wenn GUI existiert
        if (sharedGui) {
            // Ordnername mit Instanz-ID
            const folderName = `Viewer ${this.#instanceId} (${this.#container.id})`
            // Erstelle Ordner für diese Instanz
            this.#gui = sharedGui.addFolder(folderName)
            //this.#gui.close()

            // --- Renderer Settings ---
            const rendererFolder = this.#gui.addFolder('Renderer Settings')
            // Switch für shadowMap.enabled auch hier einfügen
            rendererFolder.add(this.#renderer.shadowMap, 'enabled')
                .name('Schatten Global An/Aus')
                .onChange(value => {
                    const instanceIdLog = ' Instance ' + this.#instanceId + ' (' + this.#container.id + ')'
                    // VEREINFACHTER Log:
                    console.log('[World' + instanceIdLog + '] GUI toggled shadowMap.enabled to: ' + value + '.')
                    console.log('[World' + instanceIdLog + '] this.#renderer Objekt:')
                    console.log(this.#renderer)
                    console.log('[World' + instanceIdLog + '] this.#renderer.id: ' + (this.#renderer ? this.#renderer.id : 'renderer_is_undefined'))
                })
            rendererFolder.close()

            // Proxy-Objekt für den GUI-Controller des ShadowMap-Typs
            const shadowRenderSettings = {
                type: this.#renderer.shadowMap.type 
            }

            // Option für das Dropdown-Menü (Anzeigetext: THREE.Konstante)
            const shadowTypeOptions = {
                'Basic': BasicShadowMap,    // Wert 0
                'PCF': PCFShadowMap,        // Wert 1
                'PCF (weich)': PCFSoftShadowMap //, Wert 2
                // 'VSM': VSMShadowMap      // Wert ist 3 (inaktiv, weil heute noch experimentell)
            }

            rendererFolder.add(shadowRenderSettings, 'type', shadowTypeOptions) 
                .name('Schatten-Typ')
                .onChange(value => {
                    // lil-gui übergibt den numerischen Wert der ausgewählten Option
                    this.#renderer.shadowMap.type = Number(value)
                    // Wichtig: Bei einem Wechsel des ShadowMap-Typs, insbesondere zu/von VSMShadowMap,
                    // kann es notwendig sein, die Szene neu zu rendern oder sogar Materialien zu aktualisieren,
                    // damit die Änderung korrekt dargestellt wird. Three.js versucht, dies oft dynamisch zu handhaben.
                    // Ein einfaches this.#renderer.render(this.#scene, this.#camera) könnte hier nach Bedarf ausgelöst werden,
                    // aber da wir einen Loop haben, sollte es beim nächsten Frame wirksam werden.
                    console.log(`[World${instanceIdLog}] ShadowMap Typ geändert zu: ${value}`)
                })

            // --- Hintergrundsteuerung ---
            const backgroundFolder = this.#gui.addFolder('Background')

            const bgGuiProxy = {
                mode: this.#backgroundMode, 
                color: `#${this.#solidBackgroundColor.getHexString()}`
            }

            // Dropdown zur Auswahl des Hintergrund-Modus
            backgroundFolder.add(bgGuiProxy, 'mode', ['color', 'envmap', 'transparent'])
                .name('Hintergrund-Typ')
                .onChange(value => {
                    this.#backgroundMode = value // Neuen Modus in der Instanz speichern
                    this.#updateBackgroundAppearance(instanceIdLog) // Ansicht aktualisieren
                })

            // Der Farb-Picker wird so angepasst, dass er den modus gleich mit setzt
            this.#guiBgColorController = backgroundFolder.addColor(bgGuiProxy, 'color')
                .name('Farbe (Solid)')
                .onChange(value => {
                    this.#solidBackgroundColor.set(value)
                    // Wenn der User eine Farbe wählt, wechsle automatisch zum Farbmodus
                    this.#backgroundMode = 'color'
                    bgGuiProxy.mode = 'color' // GUI-Dropdown synchronisieren
                    this.#updateBackgroundAppearance(instanceIdLog)
                })

            // --- Environment Map Ordner und Steuerelemente ---
            if (this.#environmentMapUrl) {
                const envMapFolder = this.#gui.addFolder('Umgebung (IBL & Hintergrund)')
                envMapFolder.close()

                //IBL-Regler (Intensität & Rotation für scene-environment)
                this.guiIblIntensityController = envMapFolder.add(this.#envMapGuiProxy, 'intensity', 0, 5, 0.01)
                    .name('IBL Intensität')
                    .onChange((value) => {
                        this.#environmentMapIntensity = value // Synchronisiere mit peivatem Feld
                        if (this.#environmentMapProcessed) {
                            this.#applyEnvironmentMapSettings(instanceIdLog)
                        }
                    })

                this.guiIblRotationController = envMapFolder.add(this.#envMapGuiProxy, 'rotationY', 0, Math.PI * 2, 0.01)
                    .name('IBL Rotation Y')
                    .onChange((value) => {
                        this.#environmentMapRotationY = value // Synchronisiere mit privatem Feld
                        if (this.#environmentMapProcessed) {
                            this.#applyEnvironmentMapSettings(instanceIdLog)
                        }
                    })

                // GUI-Controller für Status erstellen und initialisieren
                this.guiEnvMapStatusController = envMapFolder.add( this.#envMapGuiProxy, 'status')
                    .name('Geladen & Aktiv')
                    .disable()

                // Initialen Zustand der GUI-Elemente setzen
                const isEnvMapReady = !!this.#environmentMapProcessed

                this.guiIblIntensityController.disable(!isEnvMapReady) // Deaktiviere, wenn Map nicht bereit
                this.guiIblRotationController.disable(!isEnvMapReady) // Deaktiviere, wenn Map nicht bereit

                // Rufe dies auf, um sicherstellen, dass der ColorPicker und Switch
                // den korrekten initialen Zustand basierend auf der Config haben. 
                this.#updateBackgroundAppearance(instanceIdLog)

            } else { // Kein #environmentMapUrl
                // Stelle sicher, dass der Farb-Picker aktiviert ist, wenn keine EnvMap da ist
                if (this.#guiBgColorController) {
                    this.#guiBgColorController.disable(false)
                }
                // Rufe #updateBackgroundAppearance auf, um sicherstellen, dass der SolidColor-Hintergrund gesetzt wird
                this.#updateBackgroundAppearance(instanceIdLog)
            }

            // Umgebungslicht (Instanz-spezifisch)
            // Nutzt this.#lights
                // Wir brauchen eine Referenz auf das Licht. Besser wäre Lichter zu verwalten.
                // Quick & Dirty: Finden über den Typ Licht (nicht sehr robust!!!)
            const ambientLight = this.#lights.find(light => light.isAmbientLight)
            if (ambientLight) {
                // Füge Regler zum Instanz-Ordner hinzu
                this.#gui.add(ambientLight, 'intensity', 0, 5, 0.1).name('Umgebungslicht')
            }
            // Füge AxesHelper-Toggle hinzu
            this.#gui.add(this.#axesHelper, 'visible').name('Show Axes')

            // --- Kamera-Regler ---
            const cameraFolder = this.#gui.addFolder('Kamera') // Füge den Kamera-Ordner zu this.#gui hinzu
            cameraFolder.close()

            // Position
            const camPosFolder = cameraFolder.addFolder('Position')
            camPosFolder.add(this.#camera.position, 'x', -50, 50, 0.1).name('X').listen()
            camPosFolder.add(this.#camera.position, 'y', -50, 50, 0.1).name('Y').listen()
            camPosFolder.add(this.#camera.position, 'z', -50, 50, 0.1).name('Z').listen()
            camPosFolder.close()

            // Target / LookAt
            const camTargetFolder = cameraFolder.addFolder('Ziel (LookAt)')
            camTargetFolder.add(this.#controls.target, 'x', -50, 50, 0.1).name('X').listen()
            camTargetFolder.add(this.#controls.target, 'y', -50, 50, 0.1).name('Y').listen()
            camTargetFolder.add(this.#controls.target, 'z', -50, 50, 0.1).name('Z').listen()
            camTargetFolder.close()

            // FOV
            cameraFolder.add(this.#camera, 'fov', 1, 179, 1).name('FOV (Grad)')
            .onChange(() => {
                this.#camera.updateProjectionMatrix()
            }).listen()

            // Auto-Rotate (Orbit Controls)
            const autoRotateFolder = cameraFolder.addFolder('Auto-Rotation')
            autoRotateFolder.add(this.#controls, 'autoRotate').name('Aktiviert')
            autoRotateFolder.add(this.#controls, 'autoRotateSpeed', -15, 15, 0.1).name('Geschwindigkeit')

            // --- Licht-Regler ---
            if (this.#lights.length > 0) {
                const lightsFolder = this.#gui.addFolder('Lichter')

                this.#lights.forEach((light, index) => {
                    // Verwende einen eindeutigen Namen für den Ordner, falls light.name nicht gesetzt ist
                    const lightFolderName = light.name || `${light.constructor.name}_${index}`
                    const individualLightFolder = lightsFolder.addFolder(lightFolderName)

                    // --- Regler für Helper-Sichtbarkeit ---
                    if (light.userData.helper) {
                        individualLightFolder.add(light.userData.helper, 'visible').name('Helper sichtbar')
                    } else if (!light.isAmbientLight) {
                        individualLightFolder.add({note: 'Keine Helper'}, 'note').name('Helper').disable()
                    }

                    // --- Gemeinsame Eigenschaften: Farbe und Intensität ---
                    // Um die Farbe dynamisch zu aktualisieren, müssen wir ein temporäres Objekt erstellen und verwenden
                    const colorProxy = { color: `#${light.color.getHexString()}` }
                    individualLightFolder.addColor(colorProxy, 'color')
                        .name('Farbe')
                        .onChange((value) => {
                            light.color.set(value)
                        })

                    individualLightFolder.add(light, 'intensity', 0, 10, 0.1).name('Intensität').listen() // Range ggf. anpassen

                    // --- Position (für Lichter, die eine Position haben) ---
                    if (light.position) {
                        const posFolder = individualLightFolder.addFolder('Position')
                        posFolder.add(light.position, 'x', -20, 20, 0.1).name('X').listen().onChange(() => {
                            light.userData.helper?.update() // Optional Chaining fürs update des Helpers
                        })
                        posFolder.add(light.position, 'y', -20, 20, 0.1).name('Y').listen().onChange(() => {
                            light.userData.helper?.update() // Optional Chaining fürs update des Helpers
                        })
                        posFolder.add(light.position, 'z', -20, 20, 0.1).name('Z').listen().onChange(() => {
                            light.userData.helper?.update() // Optional Chaining fürs update des Helpers
                        })
                        // posFolder.open()
                    }

                    // --- Spezifische Eigenschaften für DirectionalLight ---
                    if (light.isDirectionalLight) {
                        // Das Target-Objekt eines DIrectionalLight ist standardmäßig bei (0,0,0) relativ zur Lichtquelle
                        // Wenn wir das Target bewegen wollen, bewegen wir das light.target Objekt.
                        if (light.target && light.target.position) {
                            const targetPosFolder = individualLightFolder.addFolder('Ziel-Position/Target')
                            targetPosFolder.add(light.target.position, 'x', -20, 20, 0.1).name('X').listen().onChange(() => {
                                light.userData.helper?.update()
                            })
                            targetPosFolder.add(light.target.position, 'y', -20, 20, 0.1).name('Y').listen().onChange(() => {
                                light.userData.helper?.update()
                            })
                            targetPosFolder.add(light.target.position, 'z', -20, 20, 0.1).name('Z').listen().onChange(() => {
                                light.userData.helper?.update()
                            })
                            // targetPosFolder.open()
                        }
                    }

                    // --- Spezifische Eigenschaften für PointLight ---
                    if (light.isPointLight) {
                        individualLightFolder.add(light, 'distance', 0, 100, 0.1).name('Distanz').listen().onChange(() => {
                            light.userData.helper?.update()
                        })
                        individualLightFolder.add(light, 'decay', 0, 5, 0.01).name('Decay').listen().onChange(() => {
                            light.userData.helper?.update() // Decay ändert nicht die Helpergröße, aber schadet nicht
                        })
                        // PointLightHelper Größe wird nicht direkt durch distance/decay beeinflusst, sondern durch den 2. Parameter im Constructur
                        // Aber man könnte den Helper neu erstellen oder seine sphere.scale anpassen, wenn man das möchte
                    }

                    // Schattenparameter
                    // Prüfe, ob das Licht überhaupt Schatten werfen kann
                    if (light.isDirectionalLight || light.isPointLight || light.isSpotLight) {
                        const shadowFolder = individualLightFolder.addFolder('Schatten-Parameter')

                        // 1. castShadow für jedes Licht einzeln
                        shadowFolder.add(light, 'castShadow').name('Wirft Schatten')
                            .onChange(casts => {
                                //Sichtbarkeit des ShadowCameraHelpers anpassen, falls vorhanden
                                if (light.userData.shadowCameraHelper) {
                                    light.userData.shadowCameraHelper.visible = casts
                                    if (casts) { // Nur updaten, wenn er sichtbar wird und vorher unsichtbar war
                                        light.userData.shadowCameraHelper.update()
                                    }
                                }
                                // Hinweis: Materialien in der Szene könnten ein Update benötigen, 
                                // um auf die Änderung von castShadow zu reagieren (Three.js macht das oft automatisch).
                                // Bei Problemen könnte man HIER einen scene.traverse und material.needsUpdate = true einfügen.
                            })
                        
                        // Proxy-Objekt für mapSize, da wir width/height synchron halten wollen
                        const mapSizeProxy = {
                            size: light.shadow.mapSize.width // Annahme: width und height sind initial gleich
                        }
                        const mapSizeOptions = { 512: 512, 1024: 1024, 2048: 2048, 4096: 4096, 8192: 8192 }

                        // 2. mapSize (height und width synchronisiert)
                        shadowFolder.add(mapSizeProxy, 'size', mapSizeOptions)
                            .name('ShadowMap Größe')
                            .onChange(value => {
                                const newSize = Number(value)
                                light.shadow.mapSize.set(newSize, newSize)

                                // SEHR WICHTIG für mapSize-Änderungen: 
                                // Die alte ShadowMap muss freigegeben und auf null gesetzt werden, 
                                // damit Three.js eine neue mit der korrekten Größe erstellt. 
                                if (light.shadow.map) {
                                    light.shadow.map.dispose()
                                    light.shadow.map = null
                                }
                                // light.shadow.needsUpdate = true // ist für mapSize-Änderungen oft nicht ausreichend

                                if (light.userData.shadowCameraHelper) {
                                    light.userData.shadowCameraHelper.update() 
                                }
                            })

                        // 3. Parameter der light.shadow.camera
                        const shadowCam = light.shadow.camera
                        const shadowCameraParamsFolder = shadowFolder.addFolder('Schattenkamera Frustum')
                        // shadowCameraParamsFolder.open()

                        shadowCameraParamsFolder.add(shadowCam, 'near', 0.01, 200, 0.1)
                            .name('Near')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })
                        shadowCameraParamsFolder.add(shadowCam, 'far', 0.1, 1000, 0.1)
                            .name('Far')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })

                        // Diese Parameter sind hauptsächlich für OrthographicCamera (DirectionalLight, SpotLight)
                        if (shadowCam.isOrthographicCamera) {
                            shadowCameraParamsFolder.add(shadowCam, 'left', -100, 100, 0.1)
                            .name('Left')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })
                            shadowCameraParamsFolder.add(shadowCam, 'right', -100, 100, 0.1)
                            .name('Right')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })
                            shadowCameraParamsFolder.add(shadowCam, 'top', -100, 100, 0.1)
                            .name('Top')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })
                            shadowCameraParamsFolder.add(shadowCam, 'bottom', -100, 100, 0.1)
                            .name('Bottom')
                            .listen()
                            .onChange(() => {
                                shadowCam.updateProjectionMatrix()
                                if (light.userData.shadowCameraHelper) light.userData.shadowCameraHelper.update()
                            })
                        }

                        // Für PoinLight ist die shadow.camera eine PerspectiveCamera. 
                        // Ihre fov und aspectRatio werden autom. von Thre.js verwaltet. 
                        // Man könnte light.shadow.fov und light.shadow.aspect hinzufügen, falls benötigt.

                        // 4. shadow.radius (für Weichzeichnung der Schattenkante)
                        // Hat hauptsächlich mit PCFSoftShadowMap oder VSMShadowMap sichtbare Auswirkungen 
                        if (this.#renderer.shadowMap.type === PCFSoftShadowMap || this.#renderer.shadowMap.type === VSMShadowMap) {
                            shadowFolder.add(light.shadow, 'radius', 0, 32, 0.1)
                                .name('Radius (Softness)')
                                .listen()
                                // .onChange(() => {
                                //     Optional: light.shadow.needsUpdate = true // Selten nötig für Radius allein
                                //   })
                        } else {
                            // Hinweis anzeigen, dass Radius bei aktuellem ShadowMap-Type keine Wirkung hat
                            const radiusNote = { note: 'Nur für PCFSoft/VSM' }
                            shadowFolder.add(radiusNote, 'note').name('Radius').disable()
                        }

                        // 5. shadow.bias (sehr wichtig zur Vermeidung von Shadow Acne und Peter Panning)
                        shadowFolder.add(light.shadow, 'bias', -0.01, 0.01, 0.0001)
                            .name('Bias')
                            .listen()

                        // 6. Sichtbarkeit des ShadowCameraHelpers (falls vorhanden)
                        if (light.userData.shadowCameraHelper) {
                            shadowFolder.add(light.userData.shadowCameraHelper, 'visible')
                                .name('ShadowCam Helper')
                        }
                    }

                    individualLightFolder.close()
                })
                // lightsFolder.close()
            }

            // --- Bodenplatte ---
            if (this.#groundPlaneConfig) {
                const planeFolder = this.#gui.addFolder('Bodenplatte')
                planeFolder.close()

                // Definiere den "smarten Default" aus Plane.js hier als Basis
                const defaultPlaneRotation = { x: - Math.PI * 0.5, y:0, z:0 } 
                // Merge den Default mit der (möglicherweise nur teilweisen) angelieferten Config
                const initialGuiRotation = { ...defaultPlaneRotation, ...(this.#groundPlaneConfig.rotation || {}) }

                // Temporäre Objekte für GUI-Bindung, falls direktes Binding Probleme macht oder wir Stringwerte brauchen
                const planeGuiProxy = {
                    shape: this.#groundPlaneConfig.shape, 
                    color: this.#groundPlaneConfig.color, 
                    width: this.#groundPlaneConfig.size.width,
                    height: this.#groundPlaneConfig.size.height,
                    radius: this.#groundPlaneConfig.size.radius,
                    segments: this.#groundPlaneConfig.segments,
                    positionX: this.#groundPlaneConfig.position.x,
                    positionY: this.#groundPlaneConfig.position.y,
                    positionZ: this.#groundPlaneConfig.position.z,
                    rotationX: initialGuiRotation.x,
                    rotationY: initialGuiRotation.y,
                    rotationZ: initialGuiRotation.z,
                    scaleX: this.#groundPlaneConfig.scale.x,
                    scaleY: this.#groundPlaneConfig.scale.y,
                    scaleZ: this.#groundPlaneConfig.scale.z,
                    receiveShadow: this.#groundPlaneConfig.receiveShadow,
                    castShadow: this.#groundPlaneConfig.castShadow
                }

                // --- Controller für Form (Dropdown) ---
                const shapeController = planeFolder.add(planeGuiProxy, 'shape', ['rectangle', 'circle', 'none'])
                    .name('Form')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.shape = value
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                        updatePlaneDimensionControllerVisibility() // Sichtbarkeit der Dimensionsregler anpassen
                    })
                
                // --- Controller für Farbe ---
                planeFolder.addColor(planeGuiProxy, 'color')
                    .name('Farbe')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.color = value
                        // Wenn die Plane existiert, Farbe direkt aktualisieren
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                    })

                // --- Controller für Materialeigenschaften ---
                const materialFolder = planeFolder.addFolder('Material')

                // Proxy mit neuen Werte aktualisieren
                planeGuiProxy.mapUrl = this.#groundPlaneConfig.mapUrl || '' // Textfeld mag kein null
                planeGuiProxy.roughness = this.#groundPlaneConfig.roughness
                planeGuiProxy.metalness = this.#groundPlaneConfig.metalness
                
                materialFolder.add(planeGuiProxy, 'mapUrl')
                    .name('Textur-URL') 
                    .onFinishChange(async (value) => { // onFinishChange ist für Textfelder besser
                        this.#groundPlaneConfig.mapUrl = value.trim() || null // Leeren String als null speichern
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                    })
                
                materialFolder.add(planeGuiProxy, 'roughness', 0, 1, 0.01)
                    .name('Roughness')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.roughness = value
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                    })

                materialFolder.add(planeGuiProxy, 'metalness', 0, 1, 0.01)
                    .name('Metalness')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.metalness = value
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                    })
                
                // --- Platzhalter für Dimensions-Controller ---
                let widthController, heightController, radiusController, segmentsController

                const dimFolder = planeFolder.addFolder('Dimensionen')
                dimFolder.close()

                widthController = dimFolder.add(planeGuiProxy, 'width', 0.1, 100, 0.1)
                    .name('Breite (Rechteck)')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.size.width = value
                        if (this.#groundPlaneConfig.shape === 'rectangle') {
                            await this.#updateGroundPlaneInstance(instanceIdLog)
                        }
                    })

                heightController = dimFolder.add(planeGuiProxy, 'height', 0.1, 100, 0.1)
                    .name('Höhe/Tiefe (Rechteck)')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.size.height = value
                        if (this.#groundPlaneConfig.shape === 'rectangle') {
                            await this.#updateGroundPlaneInstance(instanceIdLog)
                        }
                    })

                radiusController = dimFolder.add(planeGuiProxy, 'radius', 0.1, 50, 0.1)
                    .name('Radius (Kreis)')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.size.radius = value
                        if (this.#groundPlaneConfig.shape === 'circle') {
                            await this.#updateGroundPlaneInstance(instanceIdLog)
                        }
                    })

                segmentsController = dimFolder.add(planeGuiProxy, 'segments', 3, 64, 1)
                    .name('Segmente (Kreis)')
                    .onChange(async (value) => {
                        this.#groundPlaneConfig.segments = value
                        if (this.#groundPlaneConfig.shape === 'circle') {
                            this.#updateGroundPlaneInstance(instanceIdLog)
                        }
                    })
                
                // Funktion zur Steuerung der Sichtbarkeit der Dimensionsregler
                const updatePlaneDimensionControllerVisibility = () => {
                    const currentShape = this.#groundPlaneConfig.shape
                    widthController.domElement.style.display = currentShape === 'rectangle' ? '' : 'none'
                    heightController.domElement.style.display = currentShape === 'rectangle' ? '' : 'none'
                    radiusController.domElement.style.display = currentShape === 'circle' ? '' : 'none'
                    segmentsController.domElement.style.display = currentShape === 'circle' ? '' : 'none'
                    // Dimension-Ordner verstecken, wenn shape 'none'
                    dimFolder.domElement.style.display = currentShape === 'none' ? 'none' : ''
                }
                updatePlaneDimensionControllerVisibility() // Initiale Sichtbarkeit setzen

                // --- Position, Rotation, Scale für Bodenplatte ---
                const transformFolder = planeFolder.addFolder('Transformation')
                transformFolder.close()

                const posFolder = transformFolder.addFolder('Position')
                posFolder.add(planeGuiProxy, 'positionX', -50, 50, 0.1).name('X').listen()
                    .onChange(async (v) => {this.#groundPlaneConfig.position.x = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                posFolder.add(planeGuiProxy, 'positionY', -50, 50, 0.1).name('Y').listen()
                    .onChange(async (v) => {this.#groundPlaneConfig.position.y = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                posFolder.add(planeGuiProxy, 'positionZ', -50, 50, 0.1).name('Z').listen()
                    .onChange(async (v) => {this.#groundPlaneConfig.position.z = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                posFolder.close()

                const rotFolder = transformFolder.addFolder('Rotation (Radiant)')
                rotFolder.add(planeGuiProxy, 'rotationX', -Math.PI, Math.PI, 0.01).name('X').listen()
                    .onChange(async (v) => { 
                        if (!this.#groundPlaneConfig.rotation) { this.#groundPlaneConfig.rotation = {} }
                        this.#groundPlaneConfig.rotation.x = v
                        await this.#updateGroundPlaneInstance(instanceIdLog) 
                    })
                rotFolder.add(planeGuiProxy, 'rotationY', -Math.PI, Math.PI, 0.01).name('Y').listen()
                    .onChange(async (v) => { 
                        if (!this.#groundPlaneConfig.rotation) { this.#groundPlaneConfig.rotation = {} }
                        this.#groundPlaneConfig.rotation.y = v 
                        await this.#updateGroundPlaneInstance(instanceIdLog) 
                    })
                rotFolder.add(planeGuiProxy, 'rotationZ', -Math.PI, Math.PI, 0.01).name('Z').listen()
                    .onChange(async (v) => { 
                        if (!this.#groundPlaneConfig.rotation) { this.#groundPlaneConfig.rotation = {} }
                        this.#groundPlaneConfig.rotation.z = v
                        await this.#updateGroundPlaneInstance(instanceIdLog) 
                    })
                rotFolder.close()

                const scaleFolder = transformFolder.addFolder('Skalierung')
                scaleFolder.add(planeGuiProxy, 'scaleX', 0.1, 10, 0.01).name('X').listen()
                    .onChange(async (v) => { this.#groundPlaneConfig.scale.x = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                scaleFolder.add(planeGuiProxy, 'scaleY', 0.1, 10, 0.01).name('Y').listen()
                    .onChange(async (v) => { this.#groundPlaneConfig.scale.y = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                scaleFolder.add(planeGuiProxy, 'scaleZ', 0.1, 10, 0.01).name('Z').listen()
                    .onChange(async (v) => { this.#groundPlaneConfig.scale.z = v; await this.#updateGroundPlaneInstance(instanceIdLog) })
                scaleFolder.close()

                // --- Schatten für Bodenplatte ---
                const shadowFolder = planeFolder.addFolder('Schatten')
                shadowFolder.add(planeGuiProxy, 'receiveShadow').name('Empfängt Schatten')
                    .onChange(async (v) => { 
                        this.#groundPlaneConfig.receiveShadow = v 
                        await this.#updateGroundPlaneInstance(instanceIdLog) 
                    })
                shadowFolder.add(planeGuiProxy, 'castShadow').name('Wirft Schatten')
                    .onChange(async (v) => {
                        this.#groundPlaneConfig.castShadow = v
                        await this.#updateGroundPlaneInstance(instanceIdLog)
                    })
            }
            // --- ENDE GUI Bodenplatte ---

            // --- Glasmaterial-Steuerung ---
            const customMaterialsFolder = this.#gui.addFolder('Custom Materials')
            customMaterialsFolder.close()

            // Finde alle Objekte mit Custom Material
            const meshesWithCustomMaterial = []
            this.#scene.traverse(child => {
                if (child.isMesh && child.userData.hasCustomMaterial) {
                    meshesWithCustomMaterial.push(child)
                }
            })

            if (meshesWithCustomMaterial.length > 0) {
                console.log(`[World${instanceIdLog}] ${meshesWithCustomMaterial.length} Meshes mit Custom Material gefunden`)

                // Gruppiere nach Material-Typ
                const glassMeshes = meshesWithCustomMaterial.filter(m => m.userData.customMaterialType === 'glass')

                if (glassMeshes.length > 0) {
                    const glassFolder = customMaterialsFolder.addFolder(`Glas (${glassMeshes.length} Meshes)`)

                    // Wenn alle das gleiche Material teilen (Cache), nur einen Controller
                    const uniqueMaterials = new Set(glassMeshes.map(m => m.material))

                    if (uniqueMaterials.size === 1 ) {
                        // Alle teilen das gleiche Material
                        const sharedMaterial = glassMeshes[0].material
                        const matFolder = glassFolder.addFolder('Gemeinsames Material')

                        // Farbe
                        const colorProxy = { color: `#${sharedMaterial.color.getHexString()}` }
                        matFolder.addColor(colorProxy, 'color')
                            .name('Tönung')
                            .onChange(value => {
                                sharedMaterial.color.set(value)
                            })

                        // Basis-Parameter
                        matFolder.add(sharedMaterial, 'roughness', 0, 1, 0.01).name('Rauheit')
                        matFolder.add(sharedMaterial, 'transmission', 0, 1, 0.01).name('Transmission')
                        matFolder.add(sharedMaterial, 'thickness', 0, 5, 0.1).name('Dicke')
                        matFolder.add(sharedMaterial, 'ior', 1, 2.5, 0.01).name('Brechungsindex')
                        matFolder.add(sharedMaterial, 'opacity', 0, 1, 0.01).name('Opazität')

                        // Erweiterte Parameter
                        const advancedFolder = matFolder.addFolder('Erweitert')
                        advancedFolder.add(sharedMaterial, 'clearcoat', 0, 1, 0.01).name('Klarlack')
                        advancedFolder.add(sharedMaterial, 'clearcoatRoughness', 0, 1, 0.01).name('Klarlack-Rauheit')
                        advancedFolder.add(sharedMaterial, 'envMapIntensity', 0, 3, 0.1).name('Env-Map Stärke')
                        advancedFolder.close()

                        // Reset-Funktion
                        const actions = {
                            resetToOriginal: () => {
                                glassMeshes.forEach(mesh => {
                                    if (mesh.userData.originalMaterial) {
                                        mesh.material = mesh.userData.originalMaterial
                                        mesh.userData.hasCustomMaterial = false
                                        console.log(`[World${instanceIdLog}] Material zurückgesetzt für ${glassMeshes.length} Meshes`)
                                    }
                                })
                                // GUI-Ordner entfernen/aktualisieren würde hier folgen
                            }
                        }
                        matFolder.add(actions, 'resetToOriginal').name('⚠️  Original wiederherstellen')
                    } else {
                        // Verschiedene Materialien - Liste einzeln
                        glassMeshes.forEach(mesh => {
                            const meshFolder = glassFolder.addFolder(mesh.name || mesh.uuid.substring(0, 8))
                            // Hier kann man die gleichen Controls für jedes Material einzeln hinzufügen
                            meshFolder.close()
                        })
                    }
                } 
            } else {
                customMaterialsFolder.add({ info: 'Keine' }, 'info').name('Custom Materials').disable()
            }
            // --- ENDE Glasmaterial-Steuerung ---

            // --- Export Button ---
            const exportSettings = {
                exportFullConfig: () => {

                    // 1. Kamera-Konfiguration sammeln
                    const currentCameraConfig = {
                        initialPosition: {
                            x: parseFloat(this.#camera.position.x.toFixed(3)),
                            y: parseFloat(this.#camera.position.y.toFixed(3)),
                            z: parseFloat(this.#camera.position.z.toFixed(3)),
                        },
                        initialLookAt: {
                            x: parseFloat(this.#controls.target.x.toFixed(3)),
                            y: parseFloat(this.#controls.target.y.toFixed(3)),
                            z: parseFloat(this.#controls.target.z.toFixed(3)),
                        },
                        fov: parseFloat(this.#camera.fov.toFixed(1)),
                        disableFramingIfInitialSet: true, // Wichtig für den Export
                        // Behalte die ursprünglichen Werte für Padding, Near und Far bei
                        framingPadding: this.#cameraSettings.framingPadding, 
                        near: this.#cameraSettings.near,
                        far: this.#cameraSettings.far,
                    }

                    // 2. Licht-Konfiguration sammeln
                    const exportedLightSettings = []
                    this.#lights.forEach((light, index) => {

                        let lightType = 'Unknown'
                        if (light.isDirectionalLight) {
                            lightType = 'DirectionalLight'
                        } else if (light.isAmbientLight) {
                            lightType = 'AmbientLight'
                        } else if (light.isPointLight) {
                            lightType = 'PointLight'
                        } // Hier bei Bedarf weitere Lichttypen (z.B. SpotLight) ergänzen

                        const lightConfig = {
                            type: light.userData.lightType || 'Unknown',
                            name: light.name || `${light.constructor.name}_Exported_${index}`,
                            color: `#${light.color.getHexString()}`, 
                            intensity: parseFloat(light.intensity.toFixed(2)), // Mit 2 Nachkommastellen
                            castShadow: light.castShadow
                        }
                        
                        // Position hinzufügen, falls vorhanden (nicht für AmbientLight)
                        if (light.position) {
                            lightConfig.position = {
                                x: parseFloat(light.position.x.toFixed(3)),
                                y: parseFloat(light.position.y.toFixed(3)),
                                z: parseFloat(light.position.z.toFixed(3))
                            }
                        }

                        // Target-Position für DirectionalLight hinzufügen
                        if (light.isDirectionalLight && light.target && light.target.position) {
                            lightConfig.targetPosition = {
                                x: parseFloat(light.target.position.x.toFixed(3)),
                                y: parseFloat(light.target.position.y.toFixed(3)),
                                z: parseFloat(light.target.position.z.toFixed(3))
                            }
                        }

                        // Spezifische Eigenschafte für PointLight
                        if (light.isPointLight) {
                            lightConfig.distance = parseFloat(light.distance.toFixed(2)),
                            lightConfig.decay = parseFloat(light.decay.toFixed(2))
                        }
                        // Hier können weitere lichttypspezifische Eigenschaften hinzugefügt werden (z.B. für SpotLight)

                        if (light.castShadow && (light.isDirectionalLight || light.isPointLight || light.isSpotLight)) {
                            lightConfig.shadowParameters = {
                                mapSize: light.shadow.mapSize.width, // Annahme: width und height sind gleich
                                cameraNear: parseFloat(light.shadow.camera.near.toFixed(3)),
                                cameraFar: parseFloat(light.shadow.camera.far.toFixed(3)),
                                bias: parseFloat(light.shadow.bias.toFixed(4)), 
                                radius: parseFloat(light.shadow.radius.toFixed(2))
                            }
                            // Spezifische Parameter für orthographische Schattenkameras
                            if (light.shadow.camera.isOrthographicCamera) {
                                lightConfig.shadowParameters.cameraLeft = parseFloat(light.shadow.camera.left.toFixed(2))
                                lightConfig.shadowParameters.cameraRight = parseFloat(light.shadow.camera.right.toFixed(2))
                                lightConfig.shadowParameters.cameraTop = parseFloat(light.shadow.camera.top.toFixed(2))
                                lightConfig.shadowParameters.cameraBottom = parseFloat(light.shadow.camera.bottom.toFixed(2))
                            }
                        }

                        exportedLightSettings.push(lightConfig)
                    })

                    // 3. Environment Map Einstellungen zum Export hinzufügen
                    const exportedEnvMapSettings = {}
                    if (this.#environmentMapUrl) {
                        exportedEnvMapSettings.url = this.#environmentMapUrl
                        exportedEnvMapSettings.intensity = parseFloat(this.#environmentMapIntensity.toFixed(2))
                        exportedEnvMapSettings.rotationY = parseFloat(this.#environmentMapRotationY.toFixed(3))
                        // useAsBackground wird jetzt über backgroundSettings exportiert
                    }

                    // 4. Hintergrund-Einstellungen exportieren
                    const exportedBackgroundSettings = {
                        color: `#${this.#solidBackgroundColor.getHexString()}`, // Die aktuell gewählte Volltonfarbe
                        // Setze die richtigen Booleans, basierend auf dem aktuellen Modus
                        transparent: this.#backgroundMode === 'transparent',
                        useEnvironmentMapAsBackground: this.#backgroundMode === 'envmap'
                    }

                    // 5. Renderer-Konfigurationen sammeln
                    const exportedRendererConfig = {
                        shadowMap: {
                            enabled: this.#renderer.shadowMap.enabled,
                            type: this.#renderer.shadowMap.type
                        }
                    }

                    // 6. GroundPlane-Config für Exort 
                    // Wir nehmen die aktuelle Konfiguration direkt aus this.#groundPlaneConfig
                    const exportedGroundPlaneConfig = JSON.parse(JSON.stringify(this.#groundPlaneConfig))

                    // Stelle sicher, dass es als sceneItem mit type 'plane' identifiziert wird, 
                    // falls es nicht schon so ist (sollte es aber durch unsere Initialisierung sein).
                    exportedGroundPlaneConfig.type = 'plane'

                    // --- Szene-Items für den Export zusammenstellen ---
                    // Wir wollen die *ursprünglichen* anderen SceneItems behalten, 
                    // aber die spezielle Bodenplatte durch ihre aktuelle Konfiguration ersetzen
                    // oder hinzufügen, falls sie in den Original-Items nicht explizit als steuerbare Plane drin war. 

                    const exportedSceneItems = []

                    this.#originalSceneItemConfigs.forEach(originalItem => {
                        const exportItem = { ...originalItem }

                        // Finde das geladene Objekt in der Szene
                        const sceneObject = this.#scene.getObjectByName(originalItem.name)

                        if (sceneObject) {
                            // Prüfe auf Custom Materials
                            let customMaterialConfig = null

                            sceneObject.traverse(child => {
                                if (child.isMesh && child.userData.hasCustomMaterial && !customMaterialConfig) {
                                    const mat = child.material

                                    if (child.userData.customMaterialType === 'glass' && mat.isMeshPhysicalMaterial) {
                                        customMaterialConfig = {
                                            type: 'glass',
                                            params: {
                                                color: `${mat.color.getHexString()}`,
                                                roughness: parseFloat(mat.roughness.toFixed(3)),
                                                transmission: parseFloat(mat.transmission.toFixed(3)),
                                                thickness: parseFloat(mat.thickness.toFixed(3)),
                                                ior: parseFloat(mat.ior.toFixed(3)),
                                                opacity: parseFloat(mat.opacity.toFixed(3))
                                            }
                                        }

                                        // Erweiterte Parameter NUR, wenn != default
                                        if (mat.clearcoat > 0) {
                                            customMaterialConfig.params.clearcoat = parseFloat(mat.clearcoat.toFixed(3))
                                            customMaterialConfig.params.clearcoatRoughness = parseFloat(mat.clearcoatRoughness.toFixed(3))
                                        }
                                        if (mat.attenuationDistance > 0) {
                                            customMaterialConfig.params.attenuationColor = `#${mat.attenuationColor.getHexString()}`
                                            customMaterialConfig.params.attenuationDistance = parseFloat(mat.attenuationDistance.toFixed(3))
                                        }
                                    }
                                }
                            })

                            if (customMaterialConfig) {
                                exportItem.material = customMaterialConfig
                            }
                        }

                        exportedSceneItems.push(exportItem)
                    })

                    // Bodenplatte-Logik
                    let groundPlaneConfigInOriginal = false
                    const finalSceneItems = []

                    exportedSceneItems.forEach(item => {
                        if (item.type === 'plane' && item.name === this.#groundPlaneConfig.name) {
                            // Dies ist die ursprüngliche Konfiguration der steuerbaren Bodenplatte.
                            // Wir ersetzen sie durch die aktuelle Konfiguration.
                            finalSceneItems.push(exportedGroundPlaneConfig)
                            groundPlaneConfigInOriginal = true
                        } else {
                            // Behalte andere Items bei (inkl. Custom Materials)
                            finalSceneItems.push(item)
                        }
                    })

                    if (!groundPlaneConfigInOriginal ?? this.#groundPlaneConfig.shape !== 'none') {
                        finalSceneItems.push(exportedGroundPlaneConfig)
                    } else if (!groundPlaneConfigInOriginal && this.#groundPlaneConfig.shape === 'none') {
                        finalSceneItems.push(exportedGroundPlaneConfig)
                    }

                    // 7. Gesamtkonfiguration erstellen
                    const fullConfig = {
                        cameraConfig: currentCameraConfig, 
                        lightSettings: exportedLightSettings, // Füge die Light-Settings hinzu
                        // Behalte den Namen 'environmentMap' für die Config-Datei, wie in deiner index.html
                        ...(Object.keys(exportedEnvMapSettings).length > 0 && { environmentMap: exportedEnvMapSettings }), 
                        backgroundSettings: exportedBackgroundSettings, 
                        rendererConfig: exportedRendererConfig, 
                        sceneItems: finalSceneItems // berücksichtigt die Plane-Settings
                    }

                    const jsonConfig = JSON.stringify(fullConfig, null, 2)
                    console.log('Exportierte Gesamt-Konfiguration (für data-config):')
                    console.log(jsonConfig)

                    /**
                     * AB HIER prüfen
                     */

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(jsonConfig)
                            .then(() => {
                                console.log('Gesamt-Konfiguration in die Zwischenablage kopiert!')

                                // exportSettingsButton ist der von lil-gui zurückgegebene Controller.
                                // Wir können seinen angezeigten Namen direkt mit .name() ändern

                                // Sichere zunächst das richtge Button-Label
                                const originalName = exportSettingsButton.domElement.innerText

                                if (exportSettingsButton) {
                                    exportSettingsButton.name('Kopiert!') // Füge Kopierbestätigung als Button-Label für 2 Sek. ein
                                    setTimeout(() => { 
                                        // Stelle sicher, dass das Element noch existiert, bevor der Text zurückgesetzt wird.
                                        if (exportSettingsButton) { 
                                            exportSettingsButton.name(originalName) // Stelle tatsächliches Button-Label wieder her
                                        }
                                    }, 2000) // Default 2 Sekunden
                                } else {
                                    console.warn('Button-DOM-Element für Textänderung nicht gefunden oder innerText nicht verfügbar.')
                                }
                            })
                            .catch(err => {
                                console.warn('Fehler beim Kopieren in die Zwischenablage:', err)
                                alert('Kopieren in die Zwischenablage fehlgeschlagen. Bitte manuell aus der Konsole kopieren.')
                            })
                    } else {
                        console.warn('Clipboard-API nicht verfügbar. Bitte manuell aus der Konsole kopieren.')
                        alert('Clipboard-API nicht verfügbar. Bitte manuell aus der Konsole kopieren.')
                    }
                } // Ende von exportFullConfig
            } // Ende von exportSettings

            console.log('--------------------------------', this.#gui)
            const exportSettingsButton = this.#gui.add(exportSettings, 'exportFullConfig').name('Export Gesamt-Config')
            exportSettingsButton._label = 'Export Gesamt-Config'
            console.log('-------------------------------- exportSettingsButton: ', exportSettingsButton)

            console.log(`[World${instanceIdLog}] GUI-Ordner für Kamera- und Basis-Settings hinzugefügt.`)
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

    #handlePointerDown(event) { // instanceIdLog ist hier nicht direkt verfügbar, holen wir aus this.#instanceIdLog
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
        const objectsToCheck = this.#clickableObjects.filter(obj => obj !== this.#scene.getObjectByName('GroundPlane'))
        const intersects = this.#raycaster.intersectObjects(objectsToCheck, true) // true = rekursiv (auch Kinder)

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

            // Wenn im Debug-Mode, gib technische Details aus: 
            if (this.#isDebugMode) {
                let triangleCount = 0
                // Gehe durch das geklickte Objekt und seine Kinder
                topLevelClickedObject.traverse(child => {
                    // Prüfe, ob es ein Mesh mit einer geometrie ist
                    if (child.isMesh && child.geometry) {
                        // Eine Geometrie ist "indexed", wenn sie ein .index Attribut hat.
                        // Dann ist die Anzahl der Triangles = Anzahl der Indizes / 3.
                        if (child.geometry.index) {
                            triangleCount += child.geometry.index.count / 3
                        } else if (child.geometry.attributes.position) {
                            // Ansonsten (selten) ist die Anzahl der Positionen / 3.
                            triangleCount += child.geometry.attributes.position.count / 3
                        }
                    }
                })
                console.log(
                    `%c[DEBUG INFO]%c
                    Objekt: ${topLevelClickedObject.name || '(kein Name)'}
                    Triangles: ${Math.round(triangleCount)}`,
                    'color: orange; background: black; padding: 2px 5px; border-radius: 3px;',
                    'color: white;'
                )
            }

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
                instanceId: this.#instanceId // ID explizit mitsenden
            })
        }
    }

    // --- Asynchrone Methode zum Initialisieren/Laden von Assets -> übergibt alles an LoadingManager ---
    async init(sceneItemConfigsArgument) {
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container.id})`

        // CHANGED: #setupEnvironmentMap wird erst NACH #setupDebugTools aufgerufen, 
        // damit die GUI-Controller (`guiEnvMapStatusController` etc.) bereits existieren, 
        // wenn die Map geladen und der Status aktualisiert wird.
        // await this.#setupEnvironmentMap(instanceIdLog) CHECK: WEG?

        console.log(`[World${instanceIdLog}] init gestartet mit ${sceneItemConfigsArgument.length} Item(s).`)

        // --- Array zum Sammeln der Objekte, die für Kamera-Framing relevant sind ---
        const loadedSceneObjectsForFraming = [] 
        this.#clickableObjects =[] // Instanzvariable für klickbare Objekte für diese Instanz zurücksetzen/initialisieren

        // Schleife über alle Objektkonfigurationen im Array
        for (const itemConfig of this.#originalSceneItemConfigs) {
            // Überspringe hier die Verarbeitung des 'plane'-Typs, da dieser 
            // durch this.#groundPlaneConfig und #updateGroundPlaneInstance gehandhabt wird
            if (itemConfig.type === 'plane') {
                console.log(`[World${instanceIdLog}] Überspringe 'plane'-Item '${itemConfig.name || ''}' in der Hauptschleife von init(). Wird separat über #groundPlaneConfig behandelt.`)
                continue
            }

            console.log(`[World${instanceIdLog}] Verarbeitet Item:`, itemConfig)
            let loadedObject = null

            // Fehlerbehandlung pro Objekt
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

                    case 'gltf': 
                        if (!itemConfig.assetUrl) {
                            console.error(`[World${instanceIdLog}] Fehlende 'assetUrl' für GLTF-Objekt:`, itemConfig)
                            throw new Error(`Fehlende 'assetUrl' für GLTF-Objekt ${itemConfig.name || ''}`)
                        }
                        // Rufe loadGltf auf und übergebe NUR die URL für DIESES Item
                        loadedObject = await loadGltf(itemConfig.assetUrl, this.#loadingManager, this.#assetBaseUrl)
                        // Namen konsistent setzen
                        loadedObject.name = itemConfig.name || `ConfigGLTF_${loadedSceneObjectsForFraming.length}`
                        console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' (GLTF) geladen.`)
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
                        // Wir werfen hier keinen Fehler, u, andere Objekte nicht zu blockieren
                        continue // SPringe zum nächsten itemConfig in der Schleife
                    }

                // Wenn ein Objekt erfolgreich geladen/erstellt wurde
                if (loadedObject) {

                    // Normalisiere die Konfiguration für einheitliche Verarbeitung
                    const normalizedConfig = normalizeItemConfig(itemConfig)

                    // Transform anwenden
                    loadedObject.position.set(
                        normalizedConfig.transform.position.x,
                        normalizedConfig.transform.position.y,
                        normalizedConfig.transform.position.z
                    )

                    loadedObject.rotation.set(
                        normalizedConfig.transform.rotation.x,
                        normalizedConfig.transform.rotation.y,
                        normalizedConfig.transform.rotation.z
                    )

                    loadedObject.scale.set(
                        normalizedConfig.transform.scale.x,
                        normalizedConfig.transform.scale.y,
                        normalizedConfig.transform.scale.z
                    )

                    // Schatten konfigurieren
                    loadedObject.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = normalizedConfig.shadows.cast
                            child.receiveShadow = normalizedConfig.shadows.receive
                        }
                    })

                    console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' Schatten cast=${normalizedConfig.shadows.cast}, receive=${normalizedConfig.shadows.receive}`)

                    // Material anwenden, falls konfiguriert
                    if (normalizedConfig.material) {
                        console.log(`[World${instanceIdLog}] Material-Konfiguration gefunden für '${loadedObject.name}'`)

                        applyMaterialToObject3D(
                            loadedObject,
                            normalizedConfig.material,
                            this.#environmentMapProcessed, // Die geladene Environment Map
                            this.#environmentMapIntensity, // Die konfigurierte Intensität
                            this.#instanceId // Fürs Logging
                        )
                    }
                    
                    // --- WICHTIG: Füge zur Instanz-Szene und Instanz-Clickables hinzu ---
                    this.#scene.add(loadedObject)
                    console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' zur Szene hinzugefügt.`)

                    // --- Füge zur Liste der Objekte für Framing hinzu (nur relevante) ---
                    // Prüfe, ob das Objekt selbst ein Mesh ist oder Kinder hat, die Meshes sind 
                    if (loadedObject.isMesh || loadedObject.children.some(child => child.isMesh)) {
                        loadedSceneObjectsForFraming.push(loadedObject)
                        console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' zu loadedSceneObjectsForFraming hinzugefügt.`)
                    } else {
                        // Füge zur Liste der Objekte hinzu (auch wenn sie nicht für Framing relevant sind, z.B. leere Gruppen)
                        loadedSceneObjectsForFraming.push(loadedObject)
                        console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' (Typ ${loadedObject.type}) wurde hinzugefügt, hat aber keine Geometry für Framing.`)
                    }

                    // Optional: Füge nur das konfigurierte Hauptobjekt zur Liste der klickbaren Objekte hinzu
                    // (Vorbereitung für spätere Interaktion)
                    this.#clickableObjects.push(loadedObject)
                    console.log(`[World${instanceIdLog}] Objekt '${loadedObject.name}' zu clickableObjects hinzugefügt.`)
                }
            } catch (error) {
                console.error(`[World${instanceIdLog}] Fehler beim Verarbeiten des Config-Items: `, itemConfig, error)
                // Optional: Zeige Fehler im UI an (wird bereits teilweise durch onError des LoadingManagers behandelt)
                if (this.#loadingIndicatorElement) {
                    this.#loadingPercentageElement.textContent = `Error initializing item: ${itemConfig.name || itemConfig.type}. Check Console.`
                    this.#loadingProgressBarElement.style.width = '100%'
                    this.#loadingProgressBarElement.style.backgroundColor = 'red'
                    // Ging früher nicht, noch nichtgetestet: 
                        this.#loadingIndicatorElement.classList.remove('hidden')
                        this.#loadingIndicatorElement.classList.add('visible')
                    // Ging früher: 
                        // this.#loadingIndicatorElement.style.display = 'flex' // Sicherstellen, dass es sichtbar ist
                }
                // throw error // Fehler weiterwerfen, wird in main.js gefangen
            }
        }

        // --- Bodenpplatte aktualisieren
        // Rufe Methode #updateGroundPlaneInstance auf, um die Bodenplatte basierend auf #groundPlaneConfig zu handhaben
        // this.#groundPlane wird innerhalb dieser Methode gesetzt oder auf null. 
        await this.#updateGroundPlaneInstance(instanceIdLog)

        // Wenn die Bodenplatte (das Mesh this.#groundPlane) nach dem Aufruf von #updateGroundPlaneInstance existiert, 
        // füge sie zur lokalen Framing-Liste hinzu
        if (this.#groundPlane) {
            if (!loadedSceneObjectsForFraming.includes(this.#groundPlane)) {
                loadedSceneObjectsForFraming.push(this.#groundPlane)
                console.log(`[World${instanceIdLog}] GroundPlane '${this.#groundPlane.name}' zur Framing-Liste hinzugefügt.`)
            }
        } else {
            console.log(`[World${instanceIdLog}] Keine GroundPlane (this.#groundPlane ist null nach #updateGroundPlaneInstance).`)
        }
        
        console.log(`[World${instanceIdLog}] Verarbeitung aller ${sceneItemConfigsArgument.length} Szene-Items in init() abgeschlossen. ${loadedSceneObjectsForFraming.length} Objekte für Framing gefunden.`)

        // --- Kamera-Framing ---
        // Bedingungen für automatisches Framing: 
        // - Es müssen Objekte geladen sein UND
        // - Entweder disableFramingIfInitialSet ist false ODER
        // - initialPosition oder initialLookAt sind nicht beide gesetzt 
        //   (d.h. #cameraSettings.disableFramingIfInitialSet wurde im Config nstructor false)
        const performFraming = loadedSceneObjectsForFraming.length > 0 &&
                                (!this.#cameraSettings.disableFramingIfInitialSet || 
                                 !this.#cameraSettings.initialPosition || 
                                 !this.#cameraSettings.initialLookAt)

        if (performFraming) {
            console.log(`[World${instanceIdLog}] Automatische Kamera-Framing wird durchgeführt anhand von ${loadedSceneObjectsForFraming.length} Objekten.`)
            const overallBoundingBox = new Box3()

            loadedSceneObjectsForFraming.forEach(object => {
                // Stelle sicher, dass die Matrix des Objekts aktuell ist
                object.updateMatrixWorld(true)

                // Erzeuge eine Box3 für das aktuelle Objekt und erweitere die Gesamtbox
                const objectBox = new Box3().setFromObject(object)
                // Wir haben bereits oben beim Hinzufügen geprüft, ob das Objekt fürs Framing geeignet ist, 
                // aber eine zusätzliche Prüfung auf leere BBox kann nicht schaden.
                if (!objectBox.isEmpty()) {
                    overallBoundingBox.union(objectBox)
                } else {
                    console.warn(`[World${instanceIdLog}] Objekt '${object.name || object.uuid}' hat eine leere BoundingBox während des Framing-Passes und wird ignoriert.`)
                }
                
            })

            if (!overallBoundingBox.isEmpty()) {
                // 1. Mittelpunkt der BoundingBox als neues OrbitControls-Ziel
                const center = new Vector3()
                overallBoundingBox.getCenter(center)
                this.#controls.target.copy(center)
                console.log(`[World${instanceIdLog}] Kamera-Ziel auf Mittelpunkt der Szene gesetzt:`, center)

                // 2. Kamera-Distanz anpassen
                const size = new Vector3()
                overallBoundingBox.getSize(size)

                // Verbesserte Distanzberechnung
                const fovYRadians = this.#camera.fov * (Math.PI / 180)
                const distanceForHeight = Math.abs((size.y * 0.5) / Math.tan(fovYRadians * 0.5))
                const fovXRadians = 2 * Math.atan(Math.tan(fovYRadians * 0.5) * this.#camera.aspect)
                const distanceForWidth = Math.abs((size.x * 0.5) / Math.tan(fovXRadians * 0.5))

                let cameraZ = Math.max(distanceForHeight, distanceForWidth)

                // Verwende den konfigurierbaren Padding-Faktor
                cameraZ *= this.#cameraSettings.framingPadding
                
                // Position der Kamera setzen (wird IMMER durch Framing bestimmt, performFraming true ist)
                this.#camera.position.set(
                    center.x, 
                    center.y + size.y * 0.15,
                    center.z + cameraZ
                )                

                // Sicherstellen, dass die Kamera auf das neue Ziel blickt
                this.#camera.lookAt(center)

                // OrbitControls nach Positions- und Zieländerung aktualisieren
                this.#controls.update()
                console.log(`[World${instanceIdLog}] Kamera-Position angepasst auf:`, this.#camera.position)

                const sceneRadius = overallBoundingBox.getBoundingSphere(new Sphere()).radius
                if (sceneRadius > 0) {
                    // Near/Far-Anpassung dynamischer gestalten basierend auf Padding und Distnz
                    // oder festen Faktoren, wenn Kamera-Settings (near/far) nicht perConfig kommen
                    this.#camera.near = Math.max(this.#cameraSettings.near, cameraZ * 0.01, sceneRadius * 0.01)
                    this.#camera.far = Math.max(this.#cameraSettings.far, cameraZ * 2, sceneRadius * 5)
                    this.#camera.updateProjectionMatrix()
                    console.log(`[World${instanceIdLog}] Kamera Near/Far angepasst. Near: ${this.#camera.near.toFixed(2)}, Far: ${this.#camera.far.toFixed(2)}`)
                }

            } else {
                console.warn(`[World${instanceIdLog}] Bounding Box für Kamera-Framing ist leer (nach Prüfung relevanter Objekte). Überspringe Anpassung`)
                // Standard-Kameraposition und -ziel, falls keine Objekte geladen wurden
                if (!this.#cameraSettings.initialPosition && !this.#cameraSettings.initialLookAt) {
                    this.#controls.target.set(0, 0, 0)
                    this.#camera.position.set(0, 1, 5)
                    this.#camera.lookAt(0, 0, 0)
                    this.#controls.update()
                }
                
            }
        } else if (loadedSceneObjectsForFraming.length > 0 && this.#cameraSettings.disableFramingIfInitialSet){
            console.log(`[World${instanceIdLog}] Automatisches Kamera-Framing übersprungen aufgrund von initialPosition/initialLookAt und disableFramingIfInitialSet=true.`)
            // Sicherstellen, dass die Kamera auf initialLookAt blickt, falls es gesetzt wurde.
            // Die Position wurde bereits in #createCamera gesetzt.
            // Das Target wurde bereits im Construczot für #controls gesetzt.
            // Ein #controls.update() ist hier ggf. nicht nötig, schadet aber auch nicht.
            this.#controls.update()
        } else {
            console.log(`[World${instanceIdLog}] Keine Objekte für Kamera-Framing geladen oder initialPosition/LookAt nicht gesetzt.`)
            if (!this.#cameraSettings.initialPosition && !this.#cameraSettings.initialLookAt) {
                this.#controls.target.set(0, 0, 0)
                // Die Kameraposition wurde in #createCamera() bereits auf einen Default gesetzt
                this.#camera.lookAt(0, 0, 0)
                this.#controls.update()
            }
        }

        // Hier könnte man z.B. einen Ladebildschirm ausblenden

        // --- DEBUG-Tools Initialisierung (nur, wenn this.#isDebugMode true ist) ---
        // Erfolgt NACHDEM Szene, Lichter etc. existieren
        if (this.#isDebugMode) {
            this.#setupDebugTools(instanceIdLog) /// Ruft die interne Methode auf
            if (this.#stats) { // #stats wird in #setupDebugTools initialisiert
                this.#loop.updatables.push(this.#stats) // Füge zum Instanz-Loop hinzu
            }
        }
        // ---DEBUG-Tools ENDE ---

        // CHANGED: #setupEnvironmentMap wird jetzt hier aufgerufen, NACH der GUI-Initialisierung
        await this.#setupEnvironmentMap(instanceIdLog)

        // Event Listener hier erst registrieren, wenn Objekt sicher hinzugefügt wurde
        this.#setupEventListeners(instanceIdLog) // Rufe die Methode auf, die die Listener anmeldet

        // HIER WEITER mit: 
        // --- Kamera-Ziel NACH dem Laden ALLER Objekte anpassen ---
        // ---------------------------------------------------------

        // console.log(`[World${instanceIdLog}] init abgeschlossen für: ${itemConfig.name || itemConfig.type}`)
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

            // Objekt geklickt: Beispielhafte Reaktion (Hüpfen) - nutzt eventData.object
            // Greift NICHT auf this.#... zu
            // Hüpfen nur im Debug-Modus
            if (this.#isDebugMode) {
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
        const instanceIdLog = ` Instance ${this.#instanceId} (${this.#container?.id})`
        console.log(`[World${instanceIdLog}] Dispose wird aufgerufen...`)

        // Sicherstellen, dass die Klasse entfernt wird, falls dispose während des Fade-Outs aufgerufen wird
        if (this.#loadingIndicatorElement) {
            this.#loadingIndicatorElement.classList.remove('visible', 'hidden'); // Zustand zurücksetzen
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
            if (this.#gui && sharedGui) { // Prüfe ob der Instanz-Ordner (this.#gui) UND die globale GUI (sharedGui) existieren
                guiRefCount-- // Referenzzähler reduzieren
                try {
                    // Da this.#gui jetzt der spezifische Ordner ist, können wir ihn direkt zerstören.
                    this.#gui.destroy()
                     console.log(`[World${instanceIdLog}] GUI Ordner '${this.#gui.title}' entfernt.`)
                } catch (e) { 
                    console.warn(`[World${instanceIdLog}] Fehler beim Entfernen des GUI-Ordners: `, e, this.#gui) 
                }

                // Zerstöre die globale GUI nur, wenn keine Instanz mehr sie mehr braucht
                if (guiRefCount <= 0 && sharedGui) { // sharedGui hier erneut prüfen, da es in seltenen Fällen null sein könnte
                    console.log("Zerstöre geteilte GUI, da keine Referenzen mehr vorhanden sind.")
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
                                if (child.material.map) child.material.map.dispose()
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