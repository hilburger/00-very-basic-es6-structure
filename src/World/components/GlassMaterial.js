// Timestamp: 15:21
import { MeshPhysicalMaterial, Color, DoubleSide, FrontSide } from 'three'

// Presets
export const GLASS_PRESETS = {
    // Klares Fensterglas
    window: {
        color: '#ffffff',
        roughness: 0.02,
        transmission: 0.95,
        thickness: 0.1,
        ior: 1.52,
        attenuationDistance: 0 // Kein Farbstich
    },
    // Milchglas / Satiniertes Glas
    frosted: {
        color: '#ffffff',
        roughness: 0.5,
        transmission: 0.8,
        thickness: 0.5,
        ior: 1.5,
        opacity: 0.9
    },

    // Getöntes Glas (leicht bläulich)
    tinted: {
        color: '#e6f7ff',
        roughness: 0.02,
        transmission: 0.85,
        thickness: 0.3,
        ior: 1.52,
        attenuationColor: '#b3e0ff',
        attenuationDistance: 1.0
    },

    // Dickes Architekturglas
    architectural: {
        color: '#f0f8f0',
        roughness: 0.05,
        transmission: 0.9,
        thickness: 0.8,
        ior: 1.5,
        attenuationColor: '#e0f0e0',
        attenuationDistance: 2.0
    },
}

/**
 * Erstellt ein physikalisch basiertes Glasmaterial
 * @param {Object} params - Material-Parameter
 * @param {Object} envMap - Environment Map für Reflektionen/Transmission
 * @returns {MeshPhysicalMaterial}
 */
export function createGlassMaterial(params = {}, envMap = null) {
    // Default-Werte mit Overrides aus params
    const {
        color = '#ffffff',
        roughness = 0.02,
        metalness = 0,
        transmission = 1,
        thickness = 0.1,
        ior = 1.5,
        opacity = 1,
        attenuationColor = '#ffffff',
        attenuationDistance = 0, // 0 = unendlich (kein Farbstich)
        side = DoubleSide, // Fenster haben oft keine Dicke -> DoubleSide
        envMapIntensity = 1,
        clearcoat = 0,
        clearcoatRoughness = 0,
        dispersion = 0,
        depthWrite = false
    } = params

    const material = new MeshPhysicalMaterial({
        color: new Color(color),
        roughness, 
        metalness,
        transmission,
        thickness,
        ior,
        opacity,
        transparent: true,
        side,
        envMapIntensity,
        clearcoat,
        clearcoatRoughness,

        // Wichtig für korrekte Transparent-Sortierung
        depthWrite: depthWrite,

        // Environment Map für Reflektionen und Transmission
        envMap: envMap
    })

    // Setze Attenuation nur, wenn nicht default
    if (attenuationDistance > 0) {
        material.attenuationColor = new Color(attenuationColor)
        material.attenuationDistance = attenuationDistance
    }

    // Dispersion nur, wenn > 0 (Regenbogen-Effekt bei Prismen)
    if (dispersion > 0) {
        material.dispersion = dispersion
    }

    // Speichere Config für späteren Zugriff
    material.userData = {
        materialType: 'glass',
        originalParams: params
    }

    return material
}

/**
 * Material-Cache für Performance
 */
const materialCache = new Map()

/**
 * Erstellt einen eindeutigen Cache-Key für Material-Parameter
 */
function getMaterialCacheKey(type, params, hasEnv) {
    // Sortiere Keys für konsistente Caching-Keys
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((obj, key) => {
            obj[key] = params[key]
            return obj
        }, {})

    return `${type}:${JSON.stringify(sortedParams)}:env=${hasEnv}`
}

/**
 * Erstellt oder holt ein Glasmaterial aus dem Cache
 * @param {Object} config - Material-Konfiguration mit type, preset und params
 * @param {Object} envMap - Environment Map
 * @returns {MeshPhysicalMaterial|null}
 */
export function getCachedGlassMaterial(config, envMap = null) {
    if (!config || config.type !== 'glass') return null

    // Kombiniere Preset mit params
    let finalParams = {}

    if (config.preset && GLASS_PRESETS[config.preset]) {
        finalParams = { ...GLASS_PRESETS[config.preset] }
        console.log(`Verwende Glas-Preset: ${config.preset}`)
    }

    if (config.params) {
        finalParams = { ...finalParams, ...config.params }
    }

    // Cache-Key generieren
    const cacheKey = getMaterialCacheKey('glass', finalParams, !!envMap)

    // Aus Cache holen, wenn vorhanden
    if (materialCache.has(cacheKey)) {
        console.log('Glasmaterial aus Cache verwendet')
        return materialCache.get(cacheKey)
    }

    // Neu erstellen und cachen
    const material = createGlassMaterial(finalParams, envMap)
    materialCache.set(cacheKey, material)
    console.log('Neues Glasmaterial erstellt und gecached')

    return material
}

/**
 * Leert den Material-Cache (z.B. bei Szenen-Wechsel)
 */
export function clearMaterialCache() {
    materialCache.forEach(material => {
        material.dispose()
    })
    materialCache.clear()
    console.log('Material-Cache geleert')
}