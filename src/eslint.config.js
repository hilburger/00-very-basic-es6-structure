// Diese Datei legt die Code-Regeln für das Projekt fest.
// Windsurf und andere IDEs lesen diese Datei automatisch.

export default [
  {
    // Hier kannst du weitere Konfigurationen hinzufügen
    // (z.B. für Browser, ES2022 etc.)
    
    // Der wichtigste Teil für deine Anfrage:
    rules: {
      /**
       * Definiert die Regel für Semikolons (semicolons).
       * ["error", "never"] bedeutet:
       * "error": Behandle fehlende/falsche Semikolons als Fehler.
       * "never": Erwarte NIEMALS Semikolons am Zeilenende.
       */
      "semi": ["error", "never"]
    }
  }
];