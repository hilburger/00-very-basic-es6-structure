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
    viewerContainers.forEach(async (containerElement, index) => { // async für init
        console.log(`Initializing viewer ${index + 1}`)
        try {
            // Konfiguration aus dataAttribut lesen
            const configString = containerElement.dataset.config
            if (!configString) {
                console.error(`Container ${index + 1} fehlt das data-config Attribut!`)
                return // Nächsten Container versuchen
            }

            let itemConfig = null
            try {
                itemConfig = JSON.parse(configString) // JSON parsen
            } catch(e) {
                console.error(`Fehler beim Parsen von data-config für Container ${index + 1}:`, configString, e)
                return // Nächsten Container versuchen
            }

            // World-Instanz für DIESEN Container erstellen
            // WICHTIG: Wir übergeben die Instanz-spezifische Konfiguration (itemCOnfig)
            // und das Debug-FLag
            const world = new World(containerElement, isDebugMode)

            // Asynchrone Initialisierung für DIESE Instanz aufrufen
            // Die init-Methode muss angepasst werden, um nur EIN itemConfig zu erwarten!
            await world.init(itemConfig) // Übergibt das Objekt aus data-config
                
            // Loop für DIESE Instanz starten
            world.start()

            console.log(`Viewer ${index + 1} initialized successfully.`)

        } catch (error) {
            console.error(`Initialisierung von Viewer ${index + 1} fehlgeschlagen:`, error)
            if (containerElement) {
                containerElement.textContent = '3D Viewer konnte nicht geladen werden.'
                containerElement.style.cssText = 'border: 2px solid red; padding: 1em; color: red; min-height: 100px;'
            }
        }
    })
}

// Rufe die Hauptfunktion main auf, um die Anwendung zu starten
// Dies geschieht, sobald dieses Script vom Browser geladen und ausgeführt wird
main()