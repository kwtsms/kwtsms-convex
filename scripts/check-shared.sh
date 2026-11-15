#!/bin/sh
# FILE:    scripts/check-shared.sh
# CREATED: 2026-11-16 02:08 +03
# TASK:    int-convex
# AUTHOR:  M Alhassoun
# WHAT:    Fails when src/component/{digits,phone,template}.ts differ from kwtsms-better-auth src/ (design v2 item 8).
#          Only the "synced from" first line and the import lines of the vendored kwtsms files are ignored.
# WHY:     Every kwtSMS integration must normalize the same input to the same digits.
# USAGE:   scripts/check-shared.sh [BASE]   BASE = URL or directory holding the upstream src/ files
#          (default https://raw.githubusercontent.com/kwtsms/kwtsms-better-auth/main/src).
#          A 404 (upstream repo still private) prints a notice and passes.
set -eu
BASE="${1:-https://raw.githubusercontent.com/kwtsms/kwtsms-better-auth/main/src}"
norm() { sed -E 's#from "(kwtsms|\./kwtsms_(phone|message)(\.js)?)"#from "VENDOR"#; s#from "\./digits(\.js)?"#from "./digits"#'; }
rc=0
for f in digits phone template; do
  up=$(mktemp)
  case "$BASE" in
    http*) code=$(curl -s -o "$up" -w '%{http_code}' "$BASE/$f.ts") ;;
    *) cp "$BASE/$f.ts" "$up" && code=200 ;;
  esac
  if [ "$code" != "200" ]; then echo "NOTICE: upstream $f.ts not reachable (HTTP $code), skipped"; rm -f "$up"; continue; fi
  norm < "$up" > "$up.n"
  if tail -n +2 "src/component/$f.ts" | norm | diff - "$up.n"; then echo "ok $f.ts"; else echo "DIFF $f.ts"; rc=1; fi
  rm -f "$up" "$up.n"
done
exit $rc
