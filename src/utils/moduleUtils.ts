export function abbreviateModuleTitle(title: string): string {
    if (!title) return title;

    const abbreviations: Record<string, string> = {
        "Öffentliche Sicherheit und Ordnung": "Öffentl. Sicherheit & Ordnung",
        "Gewerberecht": "Gewerber.",
        "Bürgerliches Gesetzbuch": "BGB",
        "Straf- und Verfahrensrecht": "Straf- & Verfahrensr.",
        "Umgang mit Waffen": "Waffenrecht",
        "Unfallverhütungsvorschriften": "UVV (DGUV 23)",
        "Umgang mit Menschen": "Umgang mit Menschen",
        "Grundzüge der Sicherheitstechnik": "Sicherheitstechnik"
    };

    return abbreviations[title] || title;
}
