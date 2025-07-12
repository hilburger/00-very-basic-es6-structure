import {
    TextureLoader, 
    LoadingManager // Optional für Ladefortschritt etc.
} from 'three'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

// --- Hilfsfunktion ---
// Diese Funktion baut den korrekten, finalen Pfad zusammen

function createFinalUrl(relativeUrl, baseUrl = '') {
    console.log('--- CREATE FINAL URLs ---')
    // Wenn kein relativer Pfad da ist, gibt es nichts zu laden
    if (!relativeUrl) return ''

    // Wenn der Pad bereits absolut ist (mit http oder mit / beginnt), gib ihn direkt zurück
    if (relativeUrl.startsWith('http') || relativeUrl.startsWith('/')) {
        return relativeUrl
    }

    // Entferne './' vom Anfang, falls vorhanden
    const cleanRelativeUrl = relativeUrl.startsWith('./') ? relativeUrl.substring(2) : relativeUrl

    return baseUrl + cleanRelativeUrl
}

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
async function loadTexture(url, manager, baseUrl) {
    // Erstelle einen NEUEN Loader mit dem übergebenen Manager (oder ohne)
    const loader = manager ? new TextureLoader(manager) : defaultTextureLoader
    const finalUrl = createFinalUrl(url, baseUrl)

    if (!finalUrl) {
        console.warn('loadTexture: Leere URL erhlten, Ladevorgang übersprungen')
        return null
    }

    try {
        const texture = await loader.loadAsync(finalUrl)
        console.log(`Textur geladen: ${finalUrl}`)
        return texture
    } catch (error) {
        console.error(`Fehler beim Laden der textur: ${finalUrl}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Textur zurückgeben
    }
}

// Asynchrone Ladefunktion für GLTF/GLB-Modelle
async function loadGltf(url, manager, baseUrl) {
    // Erstelle IMMER einen NEUEN GLTFLoader mit dem übergebenen Manager
    const gltfLoader = new GLTFLoader(manager) // Manager übergeben!
    // Setze den (globalen) DracoLoader für DIESE Instanz des GLTFLoader
    gltfLoader.setDRACOLoader(dracoLoader)

    const finalUrl = createFinalUrl(url, baseUrl)

    try {
        const loadedData = await gltfLoader.loadAsync(finalUrl)
        console.log(`GLTF/GLB geladen: ${finalUrl}`)

        // Das eigentliche Modell ist meist in der 'scene'-Eigenschaft
        const model = loadedData.scene || loadedData.scenes?.[0]
        if (!model) {
            throw new Error(`Keine Szene im GLTF gefunden: ${finalUrl}`)
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
        console.error(`Fehler beim Laden des Modells: ${finalUrl}`, error)
        throw error // Fehler weiterwerfen oder Fallback-Modell zurückgeben
    }
}

async function loadEnvironmentMap(url, manager, baseUrl) {
    // RGBELoader erwartet den Manager im Constructor
    const rgbeLoader = new RGBELoader(manager)
    const finalUrl = createFinalUrl(url, baseUrl)

    try {
        const texture = await rgbeLoader.loadAsync(finalUrl)
        console.log(`Environment Map (HDRI) geladen: ${finalUrl}`)
        // Wichtige Einstellungen für Environment Map werden werden in World.js gesetzt (mapping, etc.)
        return texture
    } catch (error) {
        console.error(`Fehler beim Laden der Environment Map: ${finalUrl}`, error)
        throw error
    }
}

export { loadTexture, loadGltf, loadEnvironmentMap }