# Topic session bundle budget ledger

| Build checkpoint | raw bytes | gzip -9 bytes | brotli bytes | raw delta vs approved baseline | gzip delta vs approved baseline | brotli delta vs approved baseline | Measured status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Approved 0.3.48 baseline | 908871 | 254079 | 202359 | 0 | 0 | 0 | approved-spec baseline |
| Task 5 pre-removal | 911173 | 254768 | 202947 | +2302 | +689 | +588 | raw over limit by 1173 bytes |
| Task 6 partial removal-only | 903764 | 253041 | 201640 | -5107 | -1038 | -719 | partial checkpoint before legacy non-Atlas duplicate-owner removal |
| Task 6 full removal-only | 903986 | 253101 | 201752 | -4885 | -978 | -607 | within all current limits; measured with card import and both mounts temporarily removed |
| Task 6 prior final card | 911979 | 255544 | 203477 | +3108 | +1465 | +1118 | superseded after full duplicate-owner removal; raw over by 1979 and brotli over by 477 |
| Task 6 final card + progress semantics follow-up | 909055 | 254785 | 202737 | +184 | +706 | +378 | within all current limits |
| Task 7 final folder-scoped status rail | 909983 | 255021 | 202997 | +1112 | +942 | +638 | within all current limits |
| Final review-fix checkpoint | 909981 | 255039 | 202971 | +1110 | +960 | +612 | within all current limits |
| Truthful-copy follow-up checkpoint | 909846 | 255007 | 202998 | +975 | +928 | +639 | within all current limits |
| Failed-rerun persisted-report truth checkpoint | 909846 | 255006 | 202909 | +975 | +927 | +550 | within all current limits |

Current limits: raw 910000 bytes; gzip -9 256000 bytes; brotli 203000 bytes.

Measurement command: `npm run build && npm run bundle:guard` on 2026-07-17.

Task 7 rail-only delta versus the Task 6 final checkpoint: raw `+928`, gzip -9 `+236`, brotli `+260` bytes.

Final review-fix delta versus Task 7: raw `-2`, gzip -9 `+18`, brotli `-26` bytes.

Final review-fix headroom: raw `19`, gzip -9 `961`, brotli `29` bytes.

Truthful-copy follow-up delta versus the final review-fix checkpoint: raw `-135`, gzip -9 `-32`, brotli `+27` bytes.

Truthful-copy follow-up headroom: raw `154`, gzip -9 `993`, brotli `2` bytes.

Failed-rerun truth delta versus the truthful-copy follow-up checkpoint: raw `0`, gzip -9 `-1`, brotli `-89` bytes.

Failed-rerun truth headroom: raw `154`, gzip -9 `994`, brotli `91` bytes.
