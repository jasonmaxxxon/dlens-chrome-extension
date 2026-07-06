# Topic Audit §3/§7 genuine derivation — slice spec（2026-07-06）

> Decision of record: user chose "補真衍生" over cutting the sections.
> Root cause (verified in code): the final audit stage returns ONE
> `AuditPromptEnvelope.prose`; the persist handler writes it to BOTH
> `sections.overall` and `sections.editorial`, and hardcodes
> `sections.scaleOrTime: ""`. §7 was a verbatim copy of §1 and §3 was empty
> by construction. Slice A (0.3.8) added an honest render guard; THIS slice
> makes the pipeline actually derive the two sections.

## Change contract

1. **Envelope schema** (`src/compare/topic-audit.ts` +
   `src/compare/topic-audit-prompts.ts`): the final-stage envelope carries
   three distinct proses — `overall`（§1 整體判讀）, `scaleOrTime`
   （§3 時間走向與討論規模判讀：討論何時起落、量級、是否仍在發酵）,
   `editorial`（§7 編輯視角：取捨、可引用性、下一步編輯動作）— plus the
   existing `displayHints` / `caveats` / `coverage`.
2. **Prompt**: extend the final-stage prompt JSON contract accordingly, with
   one-line field definitions above and the existing LANGUAGE_RULE applying
   to all three proses.
3. **Parser backward compatibility**: a legacy response containing only
   `prose` maps to `overall`, leaving the other two empty — old persisted
   reports stay untouched and the slice-A render guard keeps them honest.
4. **Prompt version**: bump `TOPIC_AUDIT_PROMPT_VERSIONS` for the final
   stage so derived-record staleness marks pre-change reports stale (rerun
   offered through the existing stale path; no data migration).
5. **Persist mapping** (`src/state/topic-audit-handlers.ts`): each section
   from its own envelope field; `coveragePerSection` for the three sections
   keeps `envelope.coverage`.

## Out of scope

UI changes (slice A's three-state body render already handles empty/list/
paragraph), other stages (lexicon/narrative/audience/absence), storage
seams beyond the handler mapping, backend, version bump (rides the next
release decision).

## Acceptance

Full repo verify gate; new tests: parser accepts the new shape AND the
legacy `prose`-only shape; handler maps three distinct fields; prompt
version bump asserted. Existing slice-A DOM tests must stay green
(they already assert §1≠§7 when fields differ).
