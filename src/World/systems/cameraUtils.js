// src/World/systems/cameraUtils.js

/**
 * Konvertiert die Brennweite (einer Vollformatkamera) in der vertikale Sichtfeld (FOV) in Grad.
 * Three.js verwendet das vertikale FOV für die PerspcetiveCamera.
 * 
 * @param {number} focalLength - Die Brennweite in Millimetern (z.B. 50mm).
 * @param {number} [sendorHeight=24] - Die Höhe des Kamerasensors in mm. Standard für das Vollformat (35mm) ist 24mm Höhe.
 * @returns {number} Das vertikale Sichtfeld (FOV) in Grad.
 */

function focalLengthToFov(focalLength, sensorHeight = 24) {
    // Formel: 2 * arctan(sensorhöhe / (2 * brennweite))
    const fovInRadians = 2 * Math.atan(sensorHeight / (2 * focalLength))
    // Umrechnung von Radiant in Grad
    return fovInRadians * (180 / Math.PI)
}

/**
 * Konvertiert das vertikale Sichtfeld (FOV) in Grad in die äquivalente Brennweite einer Vollformatkamera.
 * 
 * @param {number} - Das vertikale Sichtfeld in Grad. 
 * @param {number} [sensorHeight=24] - Die Höhe des Kamerasensors in mm. Standard ist 24mm für das VOllformat.
 * @returns {number} Die Brennweite in mm
 */
function fovToFocalLength(fovInDegrees, sensorHeight = 24) {
    // Umrechnung von Grad in Radiant
    const fovInRadians = fovInDegrees * (Math.PI / 180)
    // Formel: brennweite = sensorhöhe ( (2 * tan(fov_in_rad / 2))
    const focalLength = sensorHeight / (2 * Math.tan(fovInRadians / 2))
    return focalLength
}

export { focalLengthToFov, fovToFocalLength }