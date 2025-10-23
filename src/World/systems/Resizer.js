// Hilfsfunktion, die die eigentliche Logik der Größenanpassung enthält

const setSize = (container, camera, renderer) => {
    // Holt die aktuellen Dimensionen des COntainers
    camera.aspect = container.clientWidth / container.clientHeight
    // Aktualisiert die Projektiosmatrix der Kamera nach Änderung des Seitenverhältnisses
    camera.updateProjectionMatrix()

    // Passt dann die Größe des Renderers an die Containergröße an
    renderer.setSize(container.clientWidth, container.clientHeight)
    // Setzt dann das Pixelseitenverhältnis für scharfe Darstellung auf HiDPI/Retina-Screens
    renderer.setPixelRatio(window.devicePixelRatio)
}

class Resizer {
    constructor(container, camera, renderer) {
        // Initiales Anpassen der Größe beim Erstellen
        setSize(container, camera, renderer)

        // Event  Listener hinzufügen, der auf Größenänderungen des Fensters reagiert
        window.addEventListener('resize', () => {
            // Ruft setSize erneut auf, wenn sich die Fenstergröße ändert
            setSize(container, camera, renderer)

            // Hier könnte man optioal noch eine benutzerdefinierte onResize-Hook-Funktion aufrufen
            // this.onResize()
        })
    }

    // Platzhalter-Methode, falls man später noch Aktionen beim Resize ausführen will
    // onResize() {}
}

export { Resizer }