# Web MUDr. Julie Tichá

Čistě statický web hostovaný na **GitHub Pages**. Žádná databáze ani server.

- Ordinační hodiny, zástup a upozornění jsou v souboru `data/data.json`.
- Administrace (`/admin/`) upravuje tento soubor přes GitHub API, tedy jako commit
  do repozitáře. GitHub Pages potom web sám znovu publikuje (zhruba do 1–2 minut).
- Každá změna je v historii commitů, takže se dá kdykoli vrátit.

## Struktura

```
index.html            hlavní stránka (vše na jedné stránce, sekce s kotvami)
404.html              chybová stránka
assets/               vzhled (style.css), logika (app.js), loga pojišťoven
data/data.json        ← upravovaná data
admin/                administrace (index.html, admin.js, admin.css, config.js)
kontakt/, ockovani/…  přesměrování starých adres na sekce nové stránky
CNAME                 vlastní doména pro GitHub Pages
```

## 1. Repozitář a GitHub Pages

1. Vytvořte na GitHubu repozitář (např. `mudrjulieticha.cz`). Pro GitHub Pages zdarma
   musí být **veřejný** (zveřejní se jen obsah webu, nic tajného v něm není).
2. Nahrajte do něj obsah této složky (`git push`).
3. V souboru `admin/config.js` doplňte `owner` (váš GitHub uživatel), `repo` a `branch`.
4. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
5. Tamtéž do **Custom domain** zadejte `www.mudrjulieticha.cz` a po ověření zapněte
   **Enforce HTTPS**.

## 2. DNS u registrátora domény

| Typ   | Název | Hodnota |
|-------|-------|---------|
| CNAME | `www` | `<uzivatel>.github.io.` |
| A     | `@`   | `185.199.108.153` |
| A     | `@`   | `185.199.109.153` |
| A     | `@`   | `185.199.110.153` |
| A     | `@`   | `185.199.111.153` |

(volitelně AAAA `@`: `2606:50c0:8000::153`, `…8001::153`, `…8002::153`, `…8003::153`)

GitHub pak sám přesměruje `mudrjulieticha.cz` na `www.mudrjulieticha.cz` a zajistí HTTPS.
Doporučuji také v **Settings → Pages** doménu ověřit (*Verify domain*), aby ji nikdo jiný
nemohl použít.

## 3. Přístupový klíč pro administraci

Přihlášení do administrace funguje přes **fine-grained personal access token**, který smí
zapisovat jen do tohoto jednoho repozitáře:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens
   → Generate new token**.
2. *Repository access*: **Only select repositories** a vyberte repozitář webu.
3. *Permissions → Repository permissions → Contents*: **Read and write**. Nic dalšího.
4. *Expiration*: nejdéle 1 rok. Do kalendáře si poznamenejte, kdy vyprší, a pak vytvořte nový.
5. Klíč (`github_pat_…`) předejte paní doktorce bezpečnou cestou. Na jejím zařízení ho
   jednou zadá do `/admin/` a se zaškrtnutým „Zapamatovat“ už ho znovu zadávat nemusí.

Když klíč unikne, stačí ho na GitHubu smazat (**Revoke**) a vytvořit nový.
Kdo klíč nemá, nemůže nic změnit: administrace je jen statická stránka a veškerý zápis
ověřuje GitHub.

## Co jde měnit v administraci

- ordinační hodiny po dnech (více časů za den, poznámka k času, prázdný den = zavřeno)
- poznámka pod hodinami, zástup v nepřítomnosti
- upozornění:
  - nadpis, text (`**tučně**`, odkazy www… se doplní automaticky), barva
  - zobrazení od–do (samo se zobrazí a skryje)
  - pruh na stránce
  - **vyskakovací okno**: každý návštěvník ho uvidí jednou, po úpravě textu znovu
  - příznak „ordinace zavřena“ (např. dovolená → stav „Dnes zavřeno“)

Státní svátky (včetně Velikonoc) web pozná automaticky.

## Lokální náhled

```
python -m http.server 8000
```
ve složce webu, pak otevřete http://localhost:8000.
