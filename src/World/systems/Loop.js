// Timestamp 16:39
import {Clock } from 'three'

// Erstellt eine Three.js Uhr - praktisch zur Messung von Zeitunterschieden (Delta Time)
const clock = new Clock()

class Loop {
    // Constructor speichert Referenzen auf Kamera, Szene und Renderer
    constructor(camera, scene, renderer) {
        this.camera = camera
        this.scene = scene
        this.renderer = renderer

        // Ein Array für Objekte, die in jedem Frame aktualisiert werden müssen
        // z.B. Animationen, OrbitControls, Physik-Simulationen etc. 
        this.updatables = []
    }

    start() {
        // Startet die Animationsschleife des Renderers
        // `setAnimateLoop`ist der empfohlene Weg in Three.js (verwendet intern requestAnimationFrame)
        // Die übergebene Funktion wird vor jedem Frame ausgeführt, den der Browser rendern kann (ca. 60x pro Sekunde)
        this.renderer.setAnimationLoop(() => {
            // 1. Führe Updates durch (Animationen, Steiuerungen etc.)
            this.tick()
            // 2. Rendere die Szeme neu mit den aktualisierten Zuständen
            this.renderer.render(this.scene, this.camera)
        })
    }

    stop() {
        // Stoppt die Animationsschleife
        this.renderer.setAnimationLoop(null)
    }

    // Diese Methode wird in jedem Frame aufgerufen, kurz bevor gerendert wird
    tick() {
        // Holt die Zeit, die seit dem letzten Aufruf von getDelta() vergangen ist (in Sekunden)
        // Wichtig für zeitbasierte Animationen, die auf allen Geräten gleich schnell laufen sollen
        const delta = clock.getDelta()

        // *** NEUER LOG HINZUFÜGEN ***
        // Gib den Wert direkt vor dem Rendern aus, um zu sehen, ob er "kleben" bleibt
        // Du kannst auch this.renderer.id loggen, um sicherzustellen, dass es derselbe Renderer ist.
        // if (this.renderer) { // Sicherstellen, dass der Renderer existiert
        //     console.log('Loop.tick() - Renderer Objekt:')
        //     console.log(this.renderer)

        //     console.log(`Loop.tick() - Renderer keys:`, Object.keys(this.renderer))
        //     console.log(`Loop.tick() - Renderer hasOwnProperty('id'): ` + this.renderer.hasOwnProperty('id'))

        //     console.log('Loop.tick() - Renderer ID: ' + (this.renderer ? this.renderer.id : 'renderer_is_undefined') + ' - shadowMap.enabled: ' + (this.renderer.shadowMap ? this.renderer.shadowMap.enabled : 'shadowMap_is_undefined'))
        // }
        // *** ENDE NEUER LOG ***


        // Geht durch alle Objekte im `updatables`-Array
        for (const object of this.updatables) {
            // Prüft, ob das Objekt eine 'tick' oder 'update' Methode hat und ruft sie auf
            // übergibt 'delta damit das Objekt weiß, wie viel Zeit vergangen ist
            if (typeof object.tick === 'function') {
                object.tick(delta)
            } else if (typeof object.update === 'function') {
                // OrbitControls verwendet z.B. die 'update'-Methode
                object.update(delta)
            }
        }
    }
}

export { Loop }