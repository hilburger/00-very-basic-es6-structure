// Importiert die zentrale World-Klasse
import { World } from './World/World.js'

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

    // 1. Alle Viewer-Container finden
    const viewerContainers = document.querySelectorAll('.threejs-viewer-container')
    console.log(`Found ${viewerContainers.length} viewer containers`)

    // 2. Für jeden Container eine World-Instanz erstellen
    let instanceCounter = 1 // Starten bei 1 für die ID
    for (const containerElement of viewerContainers) {
    // viewerContainers.forEach(async (containerElement, index) => { // async für init
        const instanceId = instanceCounter // ID für DIESE Instanz
        console.log(`Initializing viewer ${instanceId}`)

        // Optional: Gib dem Container eine ID, falls er keine hat
        // (nützlich, für Debugging)
        if (!containerElement.id) {
            containerElement.id = `threejs-viewer-${instanceId}`
        }

        // Banner-Höhe aus dataAttribute (von TYPO3) anwenden
        const aspectRatio = containerElement.dataset.aspectRatio
        const bannerHeight = containerElement.dataset.bannerHeight

        if (aspectRatio === 'banner' && bannerHeight) {
            console.log(`[Main ${instanceId}] Setting banner height to: `, bannerHeight)
            containerElement.style.height = bannerHeight
        }

        try {
            // Konfiguration aus dataAttribut lesen
            const configString = containerElement.dataset.config
            if (!configString) {
                console.error(`Container ${instanceId} (${containerElement.id}) fehlt das data-config Attribut!`)
                instanceCounter++ // Zum nächsten Zähler gehen
                continue // Nächsten Container versuchen
            }

            const assetBaseUrl = containerElement.dataset.assetBaseUrl || '' // mit Fallback auf leeren String

            let mainConfig = null
            try {
                mainConfig = JSON.parse(configString) // JSON parsen
            } catch(e) {
                console.error(`Fehler beim Parsen von data-config für Container ${instanceId} (${containerElement.id}):`, configString, e)
                instanceCounter++
                continue // Nächsten Container versuchen
            }

            // Validierung: Prüfen, ob die erwartete Struktur vorhanden ist
            if (!mainConfig || typeof mainConfig !== 'object') { // Überprüfe ob mainConfig ein Onjekt ist
                console.error(`Ungültige Struktur in data-config für Container ${instanceId} (${containerElement.id}): Muss ein JSON-Objekt sein.`, mainConfig)
                instanceCounter++
                continue
            }
            if (!Array.isArray(mainConfig.sceneItems)) { // SPezifische Prüfung für sceneItems bleibt
                console.warn(`Warnung in data-config für Container ${instanceId} (${containerElement.id}): sceneItems fehlt oder ist kein Array. Viewer wird initial leer sein oder nur Standardobjekte anzeigen.`, mainConfig)
                mainConfig.sceneItems = [] // Fallback auf leeres Array, damit init nicht fehlschlägt
            }

            // World-Instanz für DIESEN Container erstellen
            // WICHTIG: Wir übergeben die Instanz-spezifische Konfiguration (mainConfig)
            // und das Debug-FLag
            const world = new World(containerElement, mainConfig, isDebugMode, instanceId, assetBaseUrl)

            // Asynchrone Initialisierung für DIESE Instanz aufrufen
            // Die init-Methode muss angepasst werden, um nur EIN mainConfig zu erwarten!
            await world.init(mainConfig.sceneItems) // Übergibt das Array der Objektkonfigurationen
                
            // Loop für DIESE Instanz starten
            world.start()

            console.log(`Viewer ${instanceId} (${containerElement.id}) initialized successfully.`)

        } catch (error) {
            console.error(`Initialisierung von Viewer ${instanceId} (${containerElement.id}) fehlgeschlagen:`, error)
            if (containerElement) {
                containerElement.textContent = '3D Viewer konnte nicht geladen werden.'
                containerElement.style.cssText = 'border: 2px solid red; padding: 1em; color: red; min-height: 100px;'
            }
        }
        instanceCounter++
    }//)
}

// Rufe die Hauptfunktion main auf, um die Anwendung zu starten
// Dies geschieht, sobald dieses Script vom Browser geladen und ausgeführt wird
main().catch(console.error)