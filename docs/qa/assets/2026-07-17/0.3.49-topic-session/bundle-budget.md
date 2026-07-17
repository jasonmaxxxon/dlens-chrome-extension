# Topic session bundle budget ledger

| Build checkpoint | raw bytes | gzip -9 bytes | brotli bytes | raw delta vs approved baseline | gzip delta vs approved baseline | brotli delta vs approved baseline | Measured status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Approved 0.3.48 baseline | 908871 | 254079 | 202359 | 0 | 0 | 0 | approved-spec baseline |
| Task 5 pre-removal | 911173 | 254768 | 202947 | +2302 | +689 | +588 | raw over limit by 1173 bytes |
| Task 6 partial removal-only | 903764 | 253041 | 201640 | -5107 | -1038 | -719 | partial checkpoint before legacy non-Atlas duplicate-owner removal |
| Task 6 full removal-only | 903986 | 253101 | 201752 | -4885 | -978 | -607 | within all current limits; measured with card import and both mounts temporarily removed |
| Task 6 prior final card | 911979 | 255544 | 203477 | +3108 | +1465 | +1118 | superseded after full duplicate-owner removal; raw over by 1979 and brotli over by 477 |
| Task 6 final card + progress semantics follow-up | 909055 | 254785 | 202737 | +184 | +706 | +378 | within all current limits |

Current limits: raw 910000 bytes; gzip -9 256000 bytes; brotli 203000 bytes.

Measurement command: `npm run build && npm run bundle:guard` on 2026-07-17.
