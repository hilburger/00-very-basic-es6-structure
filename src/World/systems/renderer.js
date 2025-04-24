import { WebGLRenderer } from 'three'

function createRenderer() {
    // Erstellt den WebGLRenderer - dieser zeichnet die Szene in ein HTML <canvas> Element
    const renderer = new WebGLRenderer({
        antialias: true
    })

    // Hier können weitere Renderer-Einstellungen vorgenommen werden.
    // Z.B. für Farbmanagement oder Schatten, falls benötigt

    // Für das Standardbeispiel reichen Standardeinstellungen. 
    // Beispiel für Farbmanagement: 
    renderer.outputColorSpace = 'srgb'

    return renderer
}


export { createRenderer }