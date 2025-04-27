// src/World/systems/eventBus.js

/**
 * Ein einfachr Event Bus (auch bekannt als Pub/Sub oder EventEmitter). 
 * Ermöglicht entkoppelte Kommunikation zwischen Modulen. 
 * Verwendet das Singleton-Pattern (es gibt nur eine Instanz davon).
 */
class EventBus {
    constructor() {
        this.listeners = {} // Speichert Listener als { eventName: [callback1, callback2, ...] }
        if (EventBus.instance) {
            // Stellt sicher, dass nur eine Instanz existiert (Singleton)
            return EventBus.instance
        }
        EventBus.instance = this
        console.log('EventBus-Instanz erstellt')
    }

    /**
     * Registriert einen Listener (Callback-Funktion) für ein bestimmtes Event.
     * @param {string} eventName - Der Name  des Events (z.B. 'objectClicked).
     * @param {Function} callback - Die Funktion, die aufgerufen werden soll, wenn das Event eintritt.
     */
    on(eventName, callback) {
        if (typeof callback != 'function') {
            console.warn(`Listener für '${eventName}' ist keine Funktion.`)
            return
        }
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = []
        }
        if (!this.listeners[eventName].includes(callback)) { // Doppelte Registrierung vermeiden
            this.listeners[eventName].push(callback)
            console.log(`Listener für '${eventName}' hinzugefügt.`)
        }
    }

    /**
     * Entfernt einen bestimmten Listener für ein Event. 
     * @param {string} eventName - Der name des Events
     * @param {Function} callbackToRemove - Die Callback-Funktion, die entfernt werden soll.
     */
    off(eventName, callbackToRemove) {
        if (!this.listeners[eventName]) {
            return
        }
        this.listeners[eventName] = this.listeners[eventName].filter(
            callback => callback !== callbackToRemove
        )
        console.log(`Listener für '${eventName}' entfernt.`)
    }

    /**
     * Löst ein Event aus und benachrichtigt alle registrierten Listener. 
     * @param {string} eventName - Der Name des Events, das ausgelöst wird.
     * @param {*} [data] - Optionale Daten, die an den Listener übergeben werden. 
     */
    emit(eventName, data) {
        if (!this.listeners[eventName]) {
            console.log(`Kein Listener für '${eventName}' vorhanden.`)
            return // Nichts tun, wenn niemand zuhört
        }
        console.log(`Event '${eventName}' ausgelöst mit Daten:`, data)
        // Erstelle Kopie des Listener-Arrays, falls Listener sich selbst entfernen
        const listenersToNotify = [...this.listeners[eventName]]
        listenersToNotify.forEach(callback => {
            try {
                callback(data) // Übergibt die Daten an den Callback
            } catch (error) {
                console.error(`Fehler im EventListener für '${eventName}':`, error, callback)
            }
        })
    }
}

// Erstelle die einzige Instanz direkt hier
const eventBusInstance = new EventBus()

// Exportiere die Instanz als Default-Export
export default eventBusInstance