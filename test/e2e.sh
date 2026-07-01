#!/bin/bash
# E2E Tests for LightTeX
# Tests all phases: auth, projects, files, compile, editor features, admin, CLI
# Usage: ./test/e2e.sh [BASE_URL]
# Requires: curl, jq

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
API="$BASE_URL/api"
PASS=0
FAIL=0
TOTAL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}✗${NC} $1 — $2"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# Check deps
for cmd in curl jq; do
  command -v $cmd &>/dev/null || { echo "ERROR: $cmd is required"; exit 1; }
done

# Auth state
TOKEN=""
REFRESH_TOKEN=""

section "AUTH"

# Register
echo "  Registering test user..."
REGISTER=$(curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test-e2e-$(date +%s)@example.com\",\"password\":\"testpass123\",\"name\":\"E2E Test\"}")
if echo "$REGISTER" | jq -e '.accessToken' &>/dev/null; then
  TOKEN=$(echo "$REGISTER" | jq -r '.accessToken')
  REFRESH_TOKEN=$(echo "$REGISTER" | jq -r '.refreshToken')
  log_pass "Register"
else
  log_fail "Register" "$(echo "$REGISTER" | jq -r '.error // .message')"
fi

# Login
echo "  Logging in..."
LOGIN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(echo "$REGISTER" | jq -r '.user.email // "test@example.com"')\",\"password\":\"testpass123\"}")
if echo "$LOGIN" | jq -e '.accessToken' &>/dev/null; then
  TOKEN=$(echo "$LOGIN" | jq -r '.accessToken')
  REFRESH_TOKEN=$(echo "$LOGIN" | jq -r '.refreshToken')
  log_pass "Login"
else
  log_fail "Login" "$(echo "$LOGIN" | jq -r '.error // .message')"
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# Refresh token
echo "  Refreshing token..."
REFRESH_RES=$(curl -s -X POST "$API/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
if echo "$REFRESH_RES" | jq -e '.accessToken' &>/dev/null; then
  TOKEN=$(echo "$REFRESH_RES" | jq -r '.accessToken')
  AUTH_HEADER="Authorization: Bearer $TOKEN"
  log_pass "Refresh token"
else
  log_fail "Refresh token" "$(echo "$REFRESH_RES" | jq -r '.error // .message')"
fi

# Logout
echo "  Logging out..."
LOGOUT_RES=$(curl -s -X POST "$API/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
if [ "$LOGOUT_RES" = "null" ] || [ "$LOGOUT_RES" = "" ] || echo "$LOGOUT_RES" | jq -e '.ok' &>/dev/null; then
  log_pass "Logout"
else
  log_fail "Logout" "$LOGOUT_RES"
fi

# Re-login for remaining tests
LOGIN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$(echo "$REGISTER" | jq -r '.user.email // "test@example.com"')\",\"password\":\"testpass123\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.accessToken')
AUTH_HEADER="Authorization: Bearer $TOKEN"

section "PROJECTS"

# Create project
echo "  Creating project..."
PROJECT=$(curl -s -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"name":"E2E Test Project","description":"Test description","compiler":"pdflatex","template":"article"}')
if echo "$PROJECT" | jq -e '.id' &>/dev/null; then
  PROJECT_ID=$(echo "$PROJECT" | jq -r '.id')
  log_pass "Create project"
else
  log_fail "Create project" "$(echo "$PROJECT" | jq -r '.error')"
  echo "Cannot continue without project. Exiting."
  exit 1
fi

# List projects
echo "  Listing projects..."
LIST=$(curl -s -H "$AUTH_HEADER" "$API/projects")
if echo "$LIST" | jq -e '.[] | .id' &>/dev/null; then
  log_pass "List projects ($(echo "$LIST" | jq 'length') project(s))"
else
  log_fail "List projects" "$LIST"
fi

# Get project
echo "  Getting project..."
GET_PROJ=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID")
if echo "$GET_PROJ" | jq -e '.name' &>/dev/null; then
  log_pass "Get project"
else
  log_fail "Get project" "$GET_PROJ"
fi

# Update project
echo "  Updating project..."
UPDATE=$(curl -s -X PUT "$API/projects/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"description":"Updated description"}')
if echo "$UPDATE" | jq -e '.description' &>/dev/null; then
  log_pass "Update project"
else
  log_fail "Update project" "$UPDATE"
fi

section "FILES"

# List files (should have template files)
echo "  Listing files..."
FILES=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/files")
if echo "$FILES" | jq -e '.[] | .path' &>/dev/null; then
  FILE_COUNT=$(echo "$FILES" | jq 'length')
  log_pass "List files ($FILE_COUNT files)"
else
  log_fail "List files" "$FILES"
fi

# Get main.tex content
echo "  Getting main.tex..."
MAIN_FILE=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/files/main.tex")
if echo "$MAIN_FILE" | grep -q "documentclass"; then
  log_pass "Get file content"
else
  log_fail "Get file content" "No documentclass found"
fi

# Create file
echo "  Creating new file..."
CREATE_FILE=$(curl -s -X POST "$API/projects/$PROJECT_ID/files" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"path":"chapter1.tex","content":"\\\\section{Introduction}\\nThis is the intro.\\n"}')
if echo "$CREATE_FILE" | jq -e '.path' &>/dev/null; then
  log_pass "Create file"
else
  log_fail "Create file" "$(echo "$CREATE_FILE" | jq -r '.error')"
fi

# Update file
echo "  Updating file..."
UPDATE_FILE=$(curl -s -X PUT "$API/projects/$PROJECT_ID/files/chapter1.tex" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"content":"\\\\section{Introduction}\\nUpdated content.\\n"}')
if echo "$UPDATE_FILE" | jq -e '.ok' &>/dev/null; then
  log_pass "Update file"
else
  log_fail "Update file" "$(echo "$UPDATE_FILE" | jq -r '.error')"
fi

# Rename file
echo "  Renaming file..."
RENAME_FILE=$(curl -s -X PUT "$API/projects/$PROJECT_ID/files/rename" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"oldPath":"chapter1.tex","newPath":"chapters/intro.tex"}')
if echo "$RENAME_FILE" | jq -e '.ok' &>/dev/null; then
  log_pass "Rename file"
else
  log_fail "Rename file" "$(echo "$RENAME_FILE" | jq -r '.error')"
fi

# Delete file
echo "  Deleting file..."
DELETE_FILE=$(curl -s -X DELETE "$API/projects/$PROJECT_ID/files/chapters/intro.tex" \
  -H "$AUTH_HEADER")
if echo "$DELETE_FILE" | jq -e '.ok' &>/dev/null; then
  log_pass "Delete file"
else
  log_fail "Delete file" "$(echo "$DELETE_FILE" | jq -r '.error')"
fi

section "COMPILE"

# Compile project
echo "  Compiling project..."
COMPILE=$(curl -s -X POST "$API/projects/$PROJECT_ID/compile" \
  -H "$AUTH_HEADER")
if echo "$COMPILE" | jq -e '.success' &>/dev/null; then
  SUCCESS=$(echo "$COMPILE" | jq -r '.success')
  PDF=$(echo "$COMPILE" | jq -r '.pdfGenerated')
  if [ "$SUCCESS" = "true" ]; then
    log_pass "Compile (success=$SUCCESS, pdf=$PDF)"
  else
    ERR_COUNT=$(echo "$COMPILE" | jq '.errors | length')
    log_fail "Compile" "$ERR_COUNT error(s)"
  fi
else
  log_fail "Compile" "$(echo "$COMPILE" | jq -r '.error')"
fi

# Try to get PDF
echo "  Getting PDF output..."
PDF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/output.pdf")
if [ "$PDF_STATUS" = "200" ]; then
  log_pass "PDF output (HTTP $PDF_STATUS)"
else
  log_fail "PDF output" "HTTP $PDF_STATUS"
fi

section "SEARCH"

# Cross-file search
echo "  Searching for 'documentclass'..."
SEARCH=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/search?q=documentclass")
if echo "$SEARCH" | jq -e '.[] | .file' &>/dev/null; then
  RESULTS=$(echo "$SEARCH" | jq 'length')
  log_pass "Search ($RESULTS results)"
else
  log_fail "Search" "$(echo "$SEARCH" | jq -r '.error // "no results"')"
fi

# Search for non-existent term
echo "  Searching for 'xyznonexistent'..."
EMPTY_SEARCH=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/search?q=xyznonexistent")
if [ "$EMPTY_SEARCH" = "[]" ] || [ "$(echo "$EMPTY_SEARCH" | jq 'length')" = "0" ]; then
  log_pass "Search (empty result)"
else
  log_fail "Search (empty)" "Expected empty"
fi

section "SYNC"

# Get files with hashes
echo "  Getting files with hashes..."
HASHES=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/files-with-hashes")
if echo "$HASHES" | jq -e '.[] | .path' &>/dev/null; then
  log_pass "Files with hashes"
else
  log_fail "Files with hashes" "$HASHES"
fi

# Sync (empty push — just pull)
echo "  Syncing (empty push)..."
SYNC=$(curl -s -X POST "$API/projects/$PROJECT_ID/sync" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '[]')
if echo "$SYNC" | jq -e '.pulled' &>/dev/null; then
  PULLED=$(echo "$SYNC" | jq '.pulled | length')
  log_pass "Sync (pulled $PULLED files)"
else
  log_fail "Sync" "$(echo "$SYNC" | jq -r '.error')"
fi

section "HISTORY"

# List snapshots
echo "  Listing history/snapshots..."
HISTORY=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/history")
if [ "$HISTORY" = "[]" ] || echo "$HISTORY" | jq -e '.[]' &>/dev/null; then
  SNAP_COUNT=$(echo "$HISTORY" | jq 'length')
  log_pass "History ($SNAP_COUNT snapshots)"
else
  log_fail "History" "$HISTORY"
fi

# Get snapshot file (if snapshot exists)
if [ "$(echo "$HISTORY" | jq 'length')" -gt 0 ]; then
  FIRST_TS=$(echo "$HISTORY" | jq -r '.[0]')
  echo "  Getting file from snapshot $FIRST_TS..."
  SNAP_FILE=$(curl -s -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/history/$FIRST_TS/files/main.tex")
  if echo "$SNAP_FILE" | grep -q "documentclass"; then
    log_pass "Snapshot file content"
  else
    log_fail "Snapshot file" "No content or not found"
  fi
fi

section "TEMPLATES"

# List templates (may need auth depending on config)
echo "  Listing templates..."
TEMPLATES=$(curl -s -H "$AUTH_HEADER" "$API/templates")
if echo "$TEMPLATES" | jq -e '.[] | .name' &>/dev/null; then
  T_COUNT=$(echo "$TEMPLATES" | jq 'length')
  log_pass "Templates ($T_COUNT available)"
else
  log_fail "Templates" "$TEMPLATES"
fi

# Get specific template
echo "  Getting article template..."
TEMPLATE=$(curl -s -H "$AUTH_HEADER" "$API/templates/article")
if echo "$TEMPLATE" | jq -e '.files' &>/dev/null; then
  log_pass "Get template"
else
  log_fail "Get template" "$(echo "$TEMPLATE" | jq -r '.error')"
fi

section "DOWNLOAD / EXPORT"

# Download project as ZIP
echo "  Downloading project ZIP..."
ZIP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/projects/$PROJECT_ID/download")
if [ "$ZIP_STATUS" = "200" ]; then
  log_pass "Download ZIP (HTTP $ZIP_STATUS)"
else
  log_fail "Download ZIP" "HTTP $ZIP_STATUS"
fi

section "ADMIN"

echo "  Getting admin stats..."
ADMIN_STATS=$(curl -s -H "$AUTH_HEADER" "$API/admin/stats")
if echo "$ADMIN_STATS" | jq -e '.users' &>/dev/null; then
  log_pass "Admin stats (users=$(echo "$ADMIN_STATS" | jq '.users'), projects=$(echo "$ADMIN_STATS" | jq '.projects'))"
else
  # May not be admin — that's ok for non-first users
  log_fail "Admin stats (expected: may not be admin)" "$(echo "$ADMIN_STATS" | jq -r '.error')"
fi

echo "  Getting admin users..."
ADMIN_USERS=$(curl -s -H "$AUTH_HEADER" "$API/admin/users")
if echo "$ADMIN_USERS" | jq -e '.[] | .email' &>/dev/null; then
  log_pass "Admin users list"
else
  log_fail "Admin users" "$(echo "$ADMIN_USERS" | jq -r '.error')"
fi

section "CLEANUP"

echo "  Deleting test project..."
DEL=$(curl -s -X DELETE "$API/projects/$PROJECT_ID" -H "$AUTH_HEADER")
if echo "$DEL" | jq -e '.ok' &>/dev/null; then
  log_pass "Delete project"
else
  log_fail "Delete project" "$DEL"
fi

section "SUMMARY"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
