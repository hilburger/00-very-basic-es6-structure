import { DirectionalLight, AmbientLight } from 'three'

function createLights() {
    // Ein Array, um alle erstellten Lichter zu sammeln
    const lights = []

    // Keylight (Hauptlicht): Simuliert die Hauptlichtquelle (z.B. Sonne, Studiolampe)
    // Kommt von schräg oben rechts
    // DirectionalLight scheint parallel aus einer Richtung, wie die Sonne
    const mainLight = new DirectionalLight('white', 3) // Farbe, Intensität
    mainLight.position.set(10, 10, 10)
    lights.push(mainLight)

    // Fill Light (Aufhelllicht): Mildert harte Schatten des Hauptlichts
    // Kommt von schräg oben links, ist schwächer
    const fillLight = new DirectionalLight('white, 1')
    fillLight.position.set(-10, 10, 5)
    lights.push(fillLight)

    // Back Light (Galgenlicht/Konturlicht): Beleuchtet das Objekt von hinten 
    // Trennt es vom Hintergrund und erzeugt einen Lichtsaum (Rim Light)
    const backLight = new DirectionalLight('white', 1.5)
    backLight.position(0, 5, -10)
    lights.push(backLight)

    // Ambient Light (Umgebungslicht): Gibt der gesamten Szene eine Grundhelligkeit
    // Hat keine Richtung, beleuchtet alles gleichmäßig von allen Seiten
    // Verhindert, dass Schattenbereiche komplett schwarz sind
    const ambientLight = new AmbientLight('white', 0.5)
    lights.push(ambientLight)

    // Gibt das Array mit allen Lichtern zurück
    // Diese werden dann in World.js zur Szee hinzugefügt
    return lights
}

export { createLights }