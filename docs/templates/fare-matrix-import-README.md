# Fare-matrix CSV import — column definitions

Header must be exactly:

```
origin_iso,destination_iso,one_way_eur,return_eur,lowest_city_pair,observation_from,observation_to,observation_count,source_url,source_license
```

| Column | Required | Format | Notes |
|---|---|---|---|
| `origin_iso` | yes | ISO-3166 alpha-2 (`BD`) | must differ from destination |
| `destination_iso` | yes | ISO-3166 alpha-2 (`GB`) | must differ from origin |
| `one_way_eur` | one of the two amounts | positive number, max 2 decimals | observed one-way advertised fare in EUR |
| `return_eur` | one of the two amounts | positive number, max 2 decimals | stored as a DERIVED round-trip reference — never presented as an observed return ticket |
| `lowest_city_pair` | with `one_way_eur` | free text ≤ 200 chars | which city route produced the figure |
| `observation_from` | with any amount | `YYYY-MM-DD` | first day of the observation window |
| `observation_to` | optional | `YYYY-MM-DD` | last day; must be ≥ `observation_from`, never in the future |
| `observation_count` | optional | positive integer | how many price observations support the figure |
| `source_url` | yes | http(s) URL or named authority (≥ 8 chars) | where the price was observed |
| `source_license` | yes | e.g. `CC-BY-4.0` | licence of the source data |

## Validation rules

- Rows with negative or zero amounts, bad dates, or a missing source are **rejected** and listed in the audit log.
- `return_eur` below `one_way_eur` is rejected (a genuine return is rarely cheaper than the one-way; justify unusual data through the manual review flow instead).
- Accepted rows are saved as **needs_review** — nothing is published automatically.
- An import never overwrites **verified** or **rejected** rows; conflicting values are recorded in the audit log for a human to reconcile.
- The example rows in the template are marked EXAMPLE — delete them before importing real data. The loader validates this list of rules identically (`src/lib/country-matrix.ts`), and unit tests pin the behaviour.
