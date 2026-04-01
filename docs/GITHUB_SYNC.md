# GitHub synchronisatie met Firebase Studio

## Lokale code vervangen door code van GitHub

Als je alle lokale wijzigingen wilt vervangen door de versie op GitHub (branch `latest`):

### Optie 1: Via de terminal (aanbevolen)

1. Open de **Terminal** in Firebase Studio (of Cursor): **View → Terminal** of `` Ctrl+` ``
2. Voer uit:

```bash
git fetch origin latest
git checkout latest
git reset --hard origin/latest
```

⚠️ **Let op:** `git reset --hard` verwijdert alle lokale wijzigingen permanent. Zorg dat je geen onopgeslagen werk hebt.

### Optie 2: Via Source Control (Git-paneel)

1. Open **Source Control**: **View → Source Control** of `Ctrl+Shift+G`
2. Klik op de drie puntjes (**...**) in het Source Control-paneel
3. Kies **Pull** om de nieuwste wijzigingen van GitHub te halen
4. Als je lokale wijzigingen wilt weggooien en 100% overeen wilt komen met GitHub:
   - Gebruik de terminal (Optie 1) met `git reset --hard origin/latest`

### Optie 3: Fresh clone (nieuwe map)

Als je in een compleet verse kopie wilt werken:

1. Maak een back-up van je huidige map (bijv. `training-assist-backup`)
2. Clone de repo opnieuw:

```bash
cd "d:\Dropbox\training planner"
git clone https://github.com/foggydude/training-assist.git training-assist-fresh
cd training-assist-fresh
git checkout latest
```

3. Open de nieuwe map in Firebase Studio

## Normale sync (lokaal behouden)

Als je lokale wijzigingen wilt behouden en alleen wilt updaten:

```bash
git fetch origin latest
git pull origin latest
```

Bij merge conflicts krijg je een melding. Los die op voordat je opnieuw commit en push.

## Firebase Studio-specifiek

- Firebase Studio gebruikt een **cloud workspace** of een **lokale map** (bijv. via Dropbox)
- De Git-repo zit in die map; terminal en Source Control werken daarop
- Na `git pull` of `git reset --hard` laadt Firebase Studio de bijgewerkte bestanden
- Bij grote wijzigingen: eventueel het project opnieuw openen of de pagina verversen
