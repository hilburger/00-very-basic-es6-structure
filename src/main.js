// Importiert die zentrale World-Klasse
import { World } from './World/World.js'

// Die Hauptfunktion unserer Anwendung
function main() {
    // 1. Finde den HTML-Container im DOM der index.html anhand seiner ID
    const container = document.querySelector('#scene-container')

    // 2. Erstelle eine Instanz der World-Klasse
    // Übergibt den gefundenen Container an den Constructor von World
    const world = new World(container)

    // 3. Startet die ANimationsschleife der WOrld-Instanz
    // Dies beginnt den kontinuierlichen Render- und Update-Prozess
    world.start()
}

// Rufe die Hauptgunktion main auf, um die Anwendung zu starten
// Dies geschieht, sobald dieses Script vom Browser geladen und ausgeführt wird
main()