# Filing Approved Findings

Run this **only after the user has approved the triaged list.** Uses the `gh` CLI from within the repo.

> **Run every command below through the Bash tool, not PowerShell.** They use bash line-continuations (`\`) and multi-line `--body` strings, which do not parse in PowerShell 5.1 (its continuation char is a backtick and multi-line bodies need here-strings). `gh` itself behaves identically under either shell, so the only requirement is that these recipes execute in bash.

**Target board:** Staccato Development — `https://github.com/orgs/staccatoapp/projects/2`. The board is owned by the **`staccatoapp` org**, so every `gh project` command MUST pass `--owner staccatoapp`. Without it, `gh` defaults to your *personal* projects (none) and the call appears to fail.

**Known board IDs** (stable; verified against the live board — re-discover via step 3 only if a command reports they're invalid):

| Value | ID |
|-------|----|
| `PROJECT_ID` | `PVT_kwDOEIus284BYxrx` |
| `STATUS_FIELD_ID` | `PVTSSF_lADOEIus284BYxrxzhT1BLs` |
| `BACKLOG_OPTION_ID` (Status = "Backlog") | `f75ad846` |

**Priority is a native issue field, NOT a board field.** Severity is recorded by setting GitHub's repo-level **`Priority`** issue field (the one in the issue sidebar under "Fields"), via the `setIssueFieldValue` GraphQL mutation — *not* a label and *not* a `gh project` field. This is why it never appears in `gh project field-list`. Known issue-field IDs (re-discover via step 3 only if a mutation reports they're invalid):

| Value | ID |
|-------|----|
| `PRIORITY_FIELD_ID` | `IFSS_kgDOAnuhWg` |
| option `Urgent` | `IFSSO_kgDOBFhCdw` |
| option `High` | `IFSSO_kgDOBFhCeA` |
| option `Medium` | `IFSSO_kgDOBFhCeQ` |
| option `Low` | `IFSSO_kgDOBFhCeg` |

**Severity → Priority mapping:** Critical → `Urgent`, High → `High`, Medium → `Medium`, Low → `Low`.

## 1. Idempotency — don't double-file on a re-run

```bash
gh issue list --label audit --state all --json number,title,url --limit 500
```
Compare titles against the approved list; skip anything already filed. (All audit issues carry the `audit` label precisely so this check works — important for re-runs and the diff-scoped variants.)

## 2. Ensure labels exist (idempotent)

`--force` updates the label if it already exists instead of erroring. Create the marker and the nine area labels once. **There are no `severity:*` labels** — severity is the `Priority` issue field (step 4d), not a label.

```bash
# marker
gh label create audit --color 5319e7 --description "Filed by an audit reviewer skill" --force

# areas
gh label create "area:security"      --color d73a4a --force
gh label create "area:structure"     --color 0e8a16 --force
gh label create "area:type-safety"   --color fbca04 --force
gh label create "area:performance"   --color d93f0b --force
gh label create "area:database"      --color 0052cc --force
gh label create "area:api-contract"  --color 1d76db --force
gh label create "area:observability" --color c5def5 --force
gh label create "area:correctness"   --color b60205 --force
gh label create "area:tests"         --color 5319e7 --force
```

## 3. (Only if IDs above are stale) re-discover board IDs

```bash
gh project view 2 --owner staccatoapp --format json        # -> ".id"  = PROJECT_ID
gh project field-list 2 --owner staccatoapp --format json  # -> field "Status" ".id" = STATUS_FIELD_ID; its option "Backlog" ".id" = BACKLOG_OPTION_ID

# Priority issue-field IDs (read from any issue that already has Priority set, e.g. #2):
gh api graphql -f query='{ repository(owner:"staccatoapp",name:"staccato"){ issue(number:2){
  issueFieldValues(first:20){ nodes{ ... on IssueFieldSingleSelectValue {
    field{ ... on IssueFieldSingleSelect { id name options{ id name } } } } } } } } }'
# -> field "Priority" ".id" = PRIORITY_FIELD_ID; each option ".id" = the option IDs above
```

## 4. Per approved finding

For a merged finding, apply **all** its area labels; the highest severity drives the `Priority` field (step d).

```bash
# (a) Create the issue (area labels only — no severity label).
#     IMPORTANT: do NOT inline the body or any non-ASCII in the title. Em-dashes, curly
#     quotes, and the "·" in the body template get mangled when passed on the command line
#     (UTF-8 is re-encoded at the shell/process boundary). Instead, write the rendered body
#     to a UTF-8 file with the Write tool (e.g. issue-body.md) and pass --body-file; this
#     preserves bytes intact and also sidesteps multi-line quoting. Keep the title ASCII
#     (plain "-" and straight quotes); if it genuinely needs non-ASCII, read it from a file
#     too: --title "$(cat issue-title.txt)".
gh issue create \
  --title "<ASCII title>" \
  --body-file issue-body.md \
  --label audit \
  --label "area:<area>"
# -> prints issue URL

# (b) add it to the board; capture the returned item id
gh project item-add 2 --owner staccatoapp --url "<issue-url>" --format json   # -> ".id" = ITEM_ID

# (c) move it to the Backlog column (new items have no Status by default)
gh project item-edit \
  --id "<ITEM_ID>" \
  --project-id "PVT_kwDOEIus284BYxrx" \
  --field-id "PVTSSF_lADOEIus284BYxrxzhT1BLs" \
  --single-select-option-id "f75ad846"

# (d) set the Priority issue field from severity (Critical->Urgent, High->High, Medium->Medium, Low->Low).
#     This needs the issue's NODE id (not its number) — fetch it from the URL:
ISSUE_NODE_ID=$(gh issue view "<issue-url>" --json id -q .id)
gh api graphql -f query='
  mutation($issueId: ID!, $optionId: ID!) {
    setIssueFieldValue(input: {
      issueId: $issueId,
      issueFields: [{ fieldId: "IFSS_kgDOAnuhWg", singleSelectOptionId: $optionId }]
    }) { issue { number } }
  }' -f issueId="$ISSUE_NODE_ID" -f optionId="<PRIORITY_OPTION_ID for the mapped severity>"
```

### Issue body template

Render this for each finding and write it to the UTF-8 file passed to `--body-file` (step 4a) — never inline it.

```markdown
**Severity:** <sev>  ·  **Area(s):** <area[, area]>  ·  **Confidence:** <confidence>

**Location(s):**
- `path/to/file.ts:line`

**Evidence**
```
<evidence — the verified, verbatim code quote from the finding>
```

**Problem**
<description>

**Recommendation**
<recommendation>

---
<sub>Filed by an audit reviewer skill. Reviewer: <id, e.g. SEC-1>.</sub>
```

If the user opted to batch Low-severity items, create **one** issue titled "Audit: low-severity tech-debt backlog" whose body lists each low finding as a checklist item, labelled `audit`, added to the board, with its `Priority` field set to `Low` (option `IFSSO_kgDOBFhCeg`) via step 4d.

## 5. Report back

List created issue numbers/URLs grouped by severity, the count added to the board, and anything skipped as already-filed.
