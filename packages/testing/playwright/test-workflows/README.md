# Workflow Testing Framework

## Introduction

This framework tests n8n's nodes and workflows to:

* ✅ **Ensure Correctness:** Verify that nodes operate correctly
* 🔄 **Maintain Compatibility:** Detect breaking changes in external APIs
* 🔒 **Guarantee Stability:** Prevent regressions in new releases

## Our Move to Playwright

This framework is an evolution of a previous system. We moved to **Playwright** as our test runner to leverage its powerful, industry-standard features, resulting in:

* **Simpler Commands:** A single command to run tests, with simple flags for control
* **Better Reporting:** Rich, interactive HTML reports with visual diffs for snapshot failures
* **Built-in Features:** Automatic retries, parallel execution, and CI integration out of the box
* **Smart Dynamic Data Handling:** Automatically detects and ignores changing fields like IDs and timestamps

---

## 🚀 Quick Start

### Prerequisites

1. **Set encryption key:** The test credentials are encrypted. Add to `~/.n8n/config`:
   ```json
   {
     "N8N_ENCRYPTION_KEY": "YOUR_KEY_FROM_BITWARDEN"
   }
   ```
   Find the key in Bitwarden under "Testing Framework encryption key"

2. **Fresh database (optional):** For a clean start, remove `~/.n8n/database.sqlite` if it exists

The setup automatically handles importing workflows, credentials, and copying test files when tests are first run.

### Basic Commands

```bash
# 1. Basic execution test (just verify workflows run without errors)
pnpm test:workflows

# 2. Run with snapshot comparison
SNAPSHOTS=true pnpm test:workflows

# 3. Update snapshots (when structure legitimately changed)
SNAPSHOTS=true pnpm test:workflows --update-snapshots

# 4. Run specific workflows (using grep)
pnpm test:workflows -g "email"

# 5. Force re-run setup (if needed)
rm .test-setup-complete && pnpm test:workflows
```

### View Test Results

After any test run, open the interactive HTML report:
```bash
npx playwright show-report
```

The report shows:
* ✅ Passed/❌ Failed tests with execution times
* 📸 Snapshot diffs with visual comparison
* ⚠️ Warnings and annotations
* 📊 Test trends over time (in CI)

---

## ⚙️ How It Works

### Test Modes

1. **Basic Run** (default): Executes workflows and checks for errors
2. **Snapshot Mode** (`SNAPSHOTS=true`): Compares workflow output against saved snapshots

### Snapshot Testing

When a workflow runs successfully, its output can be saved as a "snapshot" (JSON file). Future runs compare against this snapshot to detect changes.

* ✅ **Match** = Test passes (dynamic fields are automatically replaced)
* ❌ **Differ** = Test fails (HTML report shows exact differences)

### Dynamic Data Handling

The framework automatically replaces dynamic values with `DYNAMIC` placeholders based on:
- Global dynamic properties (timestamps, execution IDs)
- Fields configured in `workflowConfig.json`
- Legacy fields detected from workflow notes

---

## 📋 Configuration

### workflowConfig.json

Controls workflow execution, skip status, and dynamic field handling:

```json
[
  {
    "workflowId": "123",
    "status": "ACTIVE",
    "enableSnapshots": true,
    "dynamicProperties": ["id", "email_address", "unique_email_id"]
  },
  {
    "workflowId": "456",
    "status": "SKIPPED",
    "skipReason": "Depends on external API that is currently down",
    "ticketReference": "JIRA-123"
  }
]
```

**Configuration Fields:**
- `workflowId`: The ID of the workflow (must match the filename)
- `status`: Either "ACTIVE" or "SKIPPED"
- `enableSnapshots`: (optional) Whether to use snapshots for this workflow (default: true)
- `dynamicProperties`: (optional) Array of property names that change between runs
- `skipReason`: (optional) Why the workflow is skipped
- `ticketReference`: (optional) Related ticket for tracking

### Global Dynamic Properties

These properties are automatically treated as dynamic for all workflows:
- `startTime`
- `executionTime`
- `startedAt`
- `stoppedAt`

### Legacy Dynamic Properties

For backward compatibility, you can still add to a workflow's **Notes** field:
```
IGNORED_PROPERTIES=customField1,customField2
```

These will be merged with properties from `workflowConfig.json`.

---

## 🎯 Workflow for New Tests

### Step-by-Step Process

```bash
# 1. Create/modify workflow in n8n UI
# 2. Export the workflow
./packages/cli/bin/n8n export:workflow --separate --output=test-workflows/workflows --pretty --id=XXX

# 3. Add configuration entry to workflowConfig.json
# Edit workflowConfig.json and add:
{
  "workflowId": "XXX",
  "status": "ACTIVE",
  "dynamicProperties": []
}

# 4. Test basic execution
pnpm test:workflows -g "XXX"

# 5. Create initial snapshot
SNAPSHOTS=true pnpm test:workflows --update-snapshots -g "XXX"

# 6. Verify snapshot comparison works
SNAPSHOTS=true pnpm test:workflows -g "XXX"

# 7. Commit all changes
git add test-workflows/workflows/XXX.json
git add __snapshots__/workflow-XXX.snap
git add workflowConfig.json
```

---

## 💡 Common Scenarios

### "I just want to check if workflows run"
```bash
pnpm test:workflows
```

### "I changed a workflow and need to update its expected output"
```bash
SNAPSHOTS=true pnpm test:workflows --update-snapshots -g "workflow-name"
```

### "Tests are failing due to changing IDs/timestamps"
Add the dynamic fields to `workflowConfig.json`:
```json
{
  "workflowId": "123",
  "status": "ACTIVE",
  "dynamicProperties": ["transactionId", "timestamp", "sessionId"]
}
```

### "I want to skip a workflow temporarily"
Update `workflowConfig.json`:
```json
{
  "workflowId": "123",
  "status": "SKIPPED",
  "skipReason": "API endpoint is under maintenance",
  "ticketReference": "SUPPORT-456"
}
```

---

## 🔧 Creating Test Workflows

### Best Practices

1. **One node per workflow:** Test a single node with multiple operations/resources
2. **Use test files:** Reference the files automatically copied to `/tmp` by setup
3. **Limit results:** Set "Limit" to 1 for "Get All" operations when possible
4. **Handle throttling:** Add wait/sleep nodes for rate-limited APIs
5. **Document dynamic fields:** Add them to `workflowConfig.json` immediately

### Available Test Files

The setup automatically copies these to `/tmp`:
- `n8n-logo.png`
- `n8n-screenshot.png`
- PDF test files:
  - `04-valid.pdf`
  - `05-versions-space.pdf`

### Exporting Credentials

When credentials expire or need updating:

```bash
# Update the credential in n8n UI
# Export all credentials (encrypted)
./packages/cli/bin/n8n export:credentials --output=test-workflows/credentials.json --all --pretty
```

⚠️ **Never use `--decrypted` when exporting credentials!**

---

## 🐛 Troubleshooting

### Tests fail with "No valid JSON output found"
The workflow likely has console.log statements. Remove them or ensure they don't interfere with JSON output.

### Snapshots keep failing on random values
Add the changing fields to `dynamicProperties` in `workflowConfig.json`.

### Setup didn't run / Need to re-run setup
```bash
pnpm test:workflows:setup
```

### Workflow not found
Ensure the workflow was exported to the `test-workflows/workflows` directory and the workflowId in `workflowConfig.json` matches the filename.

---

## 🔄 Setup Process

```bash
pnpm test:workflows:setup
```

---

## 📊 Understanding Test Output

### Test Status

- **✅ PASSED:** Workflow executed successfully (and snapshot matched if enabled)
- **❌ FAILED:** Workflow execution failed or snapshot didn't match
- **⏭️ SKIPPED:** Workflow marked as SKIPPED in configuration

### Snapshot Comparison

When snapshots are enabled, the test compares:
- JSON structure (keys must match)
- Array lengths (unless marked as dynamic)
- Values (unless marked as dynamic)

Dynamic properties are replaced with `"DYNAMIC"` before comparison.
