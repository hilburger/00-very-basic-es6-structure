import {
    TextureLoader, 
    LoadingManager // Optional für Ladefortschritt etc.
} from 'three'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Optional: DRACO-Kompression-Loader initialisieren (Nur 1x nötig, ist global)
// Der Pfad zu den DRACO-Decoder-Dateien muss angegeben werden
// Diese liegen normalerweise im Three.js-Paket unter examples/jsm/libs/draco/gltf/
// und werden normalerweise in der public Ordner kopiert
const dracoLoader = new DRACOLoader()
// Der Pfad ist relativ zum public-Ordner anzugeben
dracoLoader.setDecoderPath('/libs/draco/gltf/')

// Erstelle einen Standard-TextureLoader OHNE Manager, für den Fall, 
// dass loadTexture ohne Manager aufgerunfen wird (sollte aber nicht passieren!)
const defaultTextureLoader = new TextureLoader()

// Asynchrone Ladefunktion für Texturen
async function loadTexture(url, manager) {
    // Erstelle einen NEUEN Loader mit dem übergebenen Manager (oder ohne)
    const loader = manager ? new TextureLoader(manager) : defaultTextureLoader
    try {
        const texture = await loader.loadAsync(url)
        console.log(`Textur geladen: ${url}`)
        return texture
    } catch (error) {
        console.error(`Fehler beim Laden der textur: ${url}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Textur zurückgeben
    }
}

// Asynchrone Ladefunktion für GLTF/GLB-Modelle
async function loadGltf(url, manager) {
    // Erstelle IMMER einen NEUEN GLTFLoader mit dem übergebenen Manager
    const gltfLoader = new GLTFLoader(manager) // Manager übergeben!
    // Setze den (globalen) DracoLoader für DIESE Instanz des GLTFLoader
    gtltfLoader.setDRACOLoader(dracoLoader)

    try {
        const loadedData = await gltfLoader.loadAsync(url)
        console.log(`GLTF/GLB geladen: ${url}`)
        // Das eigentliche Modell ist meist in der 'scene'-Eigenschaft
        const model = loadedData.scene || loadedData.scenes?.[0]
        if (!model) {
            throw new Error(`Keine Szene im GLTF gefunden: ${url}`)
        }

        // Optional: Nachbearbeitung, z.B. Schatten aktivieren (kann auch in World.js erfolgen)
        // model.traverse( function ( child ) {
        //     if ( child.isMesh ) {
        //         child.castShadow = true;
        //         child.receiveShadow = true;
        //     }
        // } );

        // Hier können auch Animationen aus loadData.animations extrahiert werden
        return model // Gibt die THREE.Group zurück, die das Modell enthält
    } catch (error) {
        console.error(`Fehler beim Laden des Modells: ${url}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Modell zurückgeben
    }
}

export { loadTexture, loadGltf }