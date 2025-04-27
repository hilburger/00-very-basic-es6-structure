// Importiert die zentrale World-Klasse
import { World } from './World/World.js'

// --- Detaillierte Szenen-Konfiguration ---
const sceneConfig = [
    {
        type: 'cube', // Eindeutiger Typ, damit wir wissen, was zu tun ist
        name: 'Mein Würfel', // Optionaler Name für Debugging oder sptere Interaktion
        assetUrl: '/textures/uv_grid_opengl_1k.webp', // Pfad zur Textur
        position: { x: 0, y: 1.7, z: -1 }, // Startposition
        rotation: { x: -0.5, y: 0, z: 0.8 }, // Startrotation
        scale: { x: 1, y: 1, z: 1 } // Startskalierung (optional, 1 ist Standard)
    },
    {
        type: 'gltf', // Typ ffür GLTF/GLB-Modelle
        name: 'Ente',
        assetUrl: '/models/duck/glb/Duck.glb', // Pfad zu Modell
        position: { x: -3, y: -0.15, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.5, y: 1.5, z: 1.5 }
    },
    {
        type: 'gltf', 
        name: 'Helm',
        assetUrl: '/models/DamagedHelmet/gltf/DamagedHelmet.gltf',
        position: { x: 3, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1.2, y: 1.2, z: 1.2 }
    }
    // Hier können später auch Lichter, Kameras etc. definiert werden: 
    // { type: 'ambientLight', color: 'white', intensity: 0.5 },
    // { type: directionalLight', ... }
]

// Die Hauptfunktion unserer Anwendung
async function main() {

    // 0. --- Debug-Modus aus URL lesen ---
    const urlParams = new URLSearchParams(window.location.search)
    // Prüft, ob der Parameter 'debug' vorhanden ist(egal welcher Wert, z.B. ?debug oder ?debug=true)
    const isDebugMode = urlParams.has('debug')

    if (isDebugMode) {
        // Eine klare Meldung in der Konsole, wenn der Debug-Modus aktiv ist
        console.log(
            '%cDEBUG MODE ACTIVATED',
            'color: orange; background: black; font-size: 1.2em; padding: 2px 5px; font-weight: bold; border-radius: 3px;'
        )
    }
    // --- Ende Debug-Check ---

    // 1. Finde den HTML-Container im DOM der index.html anhand seiner ID
    const container = document.querySelector('#scene-container')

    // 2. Erstelle eine Instanz der World-Klasse
    // Übergibt den gefundenen Container an den Constructor von World + Übergabe isDebugMode an den World constructor
    const world = new World(container, isDebugMode) // Synchroner Teil    

    // 3. Übergibt asynchron die Asset-Konfiguration an die World-Instanz
    try {
        await world.init(sceneConfig) // Asynchroner Teil (Laden)
        world.start() // Erst dann den Loop starten
    } catch (error) {
        console.error('Initialisierung der 3D-Welt fehlgeschlagen', error)
        // Hier könnte man eine Fehlermeldung im UI anzeigen
    }

        // 3. ALT vor Loader-Modul: Startet die Animationsschleife der World-Instanz
        // Dies beginnt den kontinuierlichen Render- und Update-Prozess
        // world.start()
}

// Rufe die Hauptgunktion main auf, um die Anwendung zu starten
// Dies geschieht, sobald dieses Script vom Browser geladen und ausgeführt wird
main()