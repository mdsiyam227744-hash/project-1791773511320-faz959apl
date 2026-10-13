# Airport CSV import template

Header (must match exactly; column order does not matter, names do):

```
ident,name,iso_country,latitude,longitude,iata_code,icao_code,city_municipality,iso_region,airport_type,scheduled_service
```

| Column | Required | Format | Notes |
|---|---|---|---|
| `ident` | yes | ≤40 chars, letters/digits/`_ - .` | Stable unique key. Use the OurAirports `ident` for dataset rows. |
| `name` | yes | 2–160 chars | Official airport name. |
| `iso_country` | yes | 2 letters | ISO 3166-1 alpha-2 (`BD`, `IN`, `GB`). |
| `latitude` | yes | decimal degrees, −90…90 | Rows without valid coordinates are rejected — never guessed. |
| `longitude` | yes | decimal degrees, −180…180 | Same rule. |
| `iata_code` | no | exactly 3 letters | Only when verified (IATA codes index / airport authority). Never invent. |
| `icao_code` | no | 4 alphanumeric | Same rule. |
| `city_municipality` | no | ≤120 chars | Primary city served. |
| `iso_region` | no | ISO 3166-2 (`BD-C`) | Administrative subdivision. |
| `airport_type` | no | `large_airport` / `medium_airport` / `small_airport` | Other types come from the upstream dataset only. |
| `scheduled_service` | no | `yes` / `no` / `seasonal` | Leave empty when unknown. |

The first data row of `airports-import-template.csv` is a valid **example**
with a placeholder `ZZ_EXAMPLE` ident and a fake IATA code — it demonstrates
the format and must not be imported. The second row is a deliberately
**invalid** example (missing codes, `no` scheduled service) so you can see how
rejections are reported.
