# lazyxef

Usługa która pozwoli jednoosobowym działalnościom gospodarczym na wystawienie tej jedynej fakty w misiącu.

Może zadziała a może naśle na Ciebie kontrolę skarbową.

## Start

1. `cp .env.example .env`
2. Uzupelnij dane firmy i parametry
3. `npm install`
4. `npm run dev` (watch) lub `npm run start`
5. Otworz `http://localhost:3000`

## Kontrahenci

Edytuj `data/contractors.json`. Po zmianie mozesz odswiezyc dane przez `POST /admin/reload-contractors`.

## Tryby KSeF

- `KSEF_SIMULATE=true`: brak realnego polaczenia, szybkie testy lokalne.
- `KSEF_SIMULATE=false`: wysylka HTTP do `KSEF_BASE_URL + /submit` (adapter do dopasowania do finalnego endpointu KSeF).

## Testy

`npm test`
