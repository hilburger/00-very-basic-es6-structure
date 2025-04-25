import {
    TextureLoader, 
    LoadingManager // Optional für Ladefortschritt etc.
} from 'three'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Optional: Loading Manager für zentrales Tracking
const loadingManager = new LoadingManager()
loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
    console.log(`Ladevorgang gestartet: ${url}. Geladen: ${itemsLoaded}/${itemsTotal}`)
}
loadingManager.onLoad = () => {
    console.log('Alle Ladevorgänge abgeschlossen!')
}
loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    console.log(`Ladevorgang Fortschritt: ${url}. Geladen: ${itemsLoaded}/${itemsTotal}`)
}
loadingManager.onError = (url) => {
    console.error(`Fehler beim Laden von: ${url}`)
}

// Loader-Instanzen erstellen
const textureLoader = new TextureLoader(loadingManager)
const gltfLoader = new GLTFLoader(loadingManager)

// Optional: DRACO-Kompression
// Der Pfad zu den DRACO-Decoder-Dateien muss angegeben werden
// Diese liegen normalerweise im Three.js-Paket unter examples/jsm/libs/draco/gltf/
// und werden normalerweise in der public Ordner kopiert
const dracoLoader = new DRACOLoader(loadingManager)
// Der Pfad ist relativ zum public-Ordner anzugeben
dracoLoader.setDecoderPath('/libs/draco/gltf/')
gltfLoader.setDRACOLoader(dracoLoader)

// Asynchrone Ladefunktion für Texturen
async function loadTexture(url) {
    try {
        const texture = await textureLoader.loadAsync(url)
        console.log(`Textur geladen: ${url}`, texture)
        return texture
    } catch (error) {
        console.error(`Fehler beim Laden der textur: ${url}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Textur zurückgeben
    }
}

// Asynchrone Ladefunktion für GLTF/GLB-Modelle
async function loadGltf(url) {
    try {
        const loadedData = await gltfLoader.loadAsync(url)
        console.log(`GLTF/GLB geladen: ${url}`, loadedData)
        // Das eigentliche Modell ist meist in der 'scene'-Eigenschaft
        const model = loadedData.scene || loadedData.scenes?.[0]
        if (!model) {
            throw new Error(`Keine Szene im GLTF gefunden: ${url}`)
        }
        // Hier können auch Animationen aus loadData.animations extrahiert werden
        return model // Gibt die THREE.Group zurück, die das Modell enthält
    } catch (error) {
        console.error(`Fehler beim Laden des Modells: ${url}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Modell zurückgeben
    }
}

export { loadTexture, loadGltf, loadingManager }