// Importiert die zentrale World-Klasse
import { World } from './World/World.js'

// --- Konfiguration für Assets ---
const assetsToLoad = {
    cubeTexture: '/textures/uv_grid_opengl_1k.webp', 
    duckModel: '/models/duck/glb/Duck.glb', 
    helmetModel: '/models/DamagedHelmet/gltf/DamagedHelmet.gltf'
    // Hier können später mehr optionen stehen (Skalierung, Position etc.)
}

// Die Hauptfunktion unserer Anwendung
async function main() {
    // 1. Finde den HTML-Container im DOM der index.html anhand seiner ID
    const container = document.querySelector('#scene-container')

    // 2. Erstelle eine Instanz der World-Klasse
    // Übergibt den gefundenen Container an den Constructor von World
    const world = new World(container)

    // 3. Übergibt asynchron die Asset-Konfiguration an die World-Instanz
    try {
        await world.init(assetsToLoad) // Warten bis Assets geladen sind
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