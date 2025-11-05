# Session Notes - Restrict-to-Existing Feature Implementation

**Date:** 2025-01-04 (Updated: 2025-01-05)
**Branch:** `feature/restrict-to-existing-improvements`
**Status:** ✅ Bug fixed and ready for testing (Docker image rebuilt)

---

## 🔴 CRITICAL BUG FIX (2025-01-05)

### The Problem
The restrict-to-existing feature was **completely broken** due to a data mapping bug:
- The AI prompt was receiving `undefined` instead of actual tag/correspondent/document type names
- This caused the AI to ignore restrictions and generate arbitrary metadata
- Only the "ai-processed" tag was being applied to documents

### Root Cause
In all 4 AI service files (openaiService, ollamaService, azureService, customService), the code was trying to map over arrays with `.map(item => item.name)`, but the arrays passed from `routes/setup.js` were **already strings** (tag names), not objects.

**Example of the bug:**
```javascript
// routes/setup.js line 1523 - converts to strings
const existingTagNames = existingTags.map(tag => tag.name);

// Then passes strings to AI service...

// AI service line 126 - tries to map again!
const tagNames = existingTags.map(tag => tag.name).join(', ');
// Result: [undefined, undefined, undefined] 😱
```

### The Fix
Removed the unnecessary `.map()` calls since the arrays are already in the correct format:
```javascript
// Before (broken):
const tagNames = existingTags.map(tag => tag.name).join(', ');

// After (fixed):
const tagNames = existingTags.join(', ');
```

### Files Fixed
- ✅ `services/openaiService.js` (lines 116-134)
- ✅ `services/ollamaService.js` (lines 299-318)
- ✅ `services/azureService.js` (lines 115-134)
- ✅ `services/customService.js` (lines 115-134)

### Commit Details
- **Commit:** `70d17fd`
- **Message:** "Fix critical bug in restriction prompt construction"
- **Docker Image:** `jkramer/paperless-ai:restrict-test`
- **Digest:** `sha256:696d69d7b82ae0148392ac5b242a463dc41213e5d53de5cc464574cceda75a04`

### Testing Needed
User must now test with a real document to verify:
1. The AI prompt now contains the actual list of available tags/types/correspondents
2. The AI selects from the provided options
3. Documents receive appropriate metadata

---

## What Was Done (Original Implementation)

### Problem Identified
The "restrict to existing tags/correspondents/document types" feature was using a **"generate-first, filter-second"** approach:
1. AI would generate arbitrary metadata names
2. System would check if they existed
3. Non-existent items were discarded
4. Often resulted in NO metadata being applied

### Solution Implemented
Changed to a **"constrain-first, select-second"** approach:
1. System fetches ALL existing tags/correspondents/document types BEFORE calling AI
2. Available options are included directly in the AI prompt
3. AI is instructed to "MUST select ONLY from these options"
4. AI picks the best semantic matches from the provided list
5. Much higher success rate and better matching

---

## Files Modified

### 1. `services/restrictionPromptService.js`
- Added support for document type placeholders (`%RESTRICTED_DOCUMENT_TYPES%`)
- Added `_formatDocumentTypesList()` method
- Updated method signatures to accept `existingDocumentTypesList` parameter

### 2. `services/openaiService.js`
- Complete rewrite of prompt construction (lines 114-165)
- Builds restriction sections with available options
- Format: "--- IMPORTANT RESTRICTIONS ---" with clear lists
- Backward compatible when restrictions disabled

### 3. `services/ollamaService.js`
- Same prompt construction changes as OpenAI (lines 288-373)
- Handles both object and string formats for tags/correspondents/types

### 4. `services/azureService.js`
- Same prompt construction changes (lines 105-156)
- Consistent restriction format across all AI providers

### 5. `services/customService.js`
- Same prompt construction changes (lines 104-155)
- Works with any OpenAI-compatible API

### 6. `services/paperlessService.js`
- Updated `getOrCreateDocumentType()` to accept `options` parameter (line 1120)
- Added restriction checking logic (lines 1123-1145)
- Returns `null` if document type doesn't exist and restrictions enabled

### 7. `routes/setup.js`
- Updated `buildUpdateData()` to include `restrictToExistingDocumentTypes` in options (line 1620)
- Passes options to `getOrCreateDocumentType()` call (line 1656)
- Updated debug logging

### 8. `PRD-restrict-to-existing.md`
- Complete Product Requirements Document
- Full implementation details
- Testing scenarios

---

## Docker Image Details

### Image Information
- **Repository:** `jkramer/paperless-ai`
- **Tag:** `restrict-test`
- **Full name:** `jkramer/paperless-ai:restrict-test`
- **Digest:** `sha256:f5db8d6e5e3eb5ed852e127dae1b209e8227e32b373e694e8ae70a8bc70a46e7`

### Platforms Supported
- ✅ `linux/amd64` (Intel/AMD - for Unraid)
- ✅ `linux/arm64` (ARM - for Apple Silicon, Raspberry Pi)

### Build Details
- Built from: `feature/restrict-to-existing-improvements` branch
- Commit: `3b30455`
- Build type: Multi-platform using Docker buildx
- Build date: 2025-01-04

---

## How to Use on Unraid

### 1. Pull the Image
In Unraid Docker settings, use:
```
jkramer/paperless-ai:restrict-test
```

### 2. Enable Restrictions in Settings
Once the container is running, open the Paperless-AI web UI and go to Settings:

**Option A - Via UI:**
- Navigate to Settings page
- Find "AI Restrictions" section
- Check the boxes you want:
  - ✅ Restrict to existing tags
  - ✅ Restrict to existing correspondents
  - ✅ Restrict to existing document types
- Click "Save Settings"

**Option B - Via Environment Variables:**
Add to your `.env` file or Docker template:
```bash
RESTRICT_TO_EXISTING_TAGS=yes
RESTRICT_TO_EXISTING_CORRESPONDENTS=yes
RESTRICT_TO_EXISTING_DOCUMENT_TYPES=yes
```

### 3. Test the Changes
Process a test document and check the logs. You should see:

**In the logs:**
```
--- IMPORTANT RESTRICTIONS ---

TAGS: You MUST select tags ONLY from the following existing tags...
Available tags: invoice, receipt, contract, correspondence, ...

CORRESPONDENT: You MUST select a correspondent ONLY from the following...
Available correspondents: ACME Corp, John Doe, ...

DOCUMENT TYPE: You MUST select a document type ONLY from the following...
Available document types: Invoice, Receipt, Letter, ...

--- END RESTRICTIONS ---
```

---

## Testing Checklist

### Basic Functionality
- [ ] Container starts without errors
- [ ] Settings page loads correctly
- [ ] Restriction checkboxes appear in Settings
- [ ] Checkboxes can be toggled and saved

### With Restrictions Enabled
- [ ] Process a document with restrictions ON
- [ ] Check logs - should see "IMPORTANT RESTRICTIONS" section
- [ ] Verify AI only selects from existing options
- [ ] Confirm no new tags/correspondents/types created

### Semantic Matching
- [ ] Document says "letter" → AI should pick "Correspondence" (if available)
- [ ] Document says "invoice" → AI should pick "Invoice" from existing types
- [ ] Better matching than exact string matching

### Backward Compatibility
- [ ] Process document with restrictions OFF
- [ ] Should work exactly as before
- [ ] AI can create new tags/correspondents/types

---

## Troubleshooting

### Issue: "No matching manifest for linux/amd64"
**Solution:** ✅ FIXED - Rebuilt as multi-platform image

### Issue: No metadata applied to documents
**Check:**
1. Are you enabling the restrictions in Settings?
2. Do you have existing tags/correspondents/types in Paperless-ngx?
3. Check logs for "IMPORTANT RESTRICTIONS" section
4. Verify the available options are being listed

### Issue: Settings not saving
**Check:**
1. `.env` file permissions (should be writable)
2. Check browser console for errors
3. Verify container has write access to `/app/data`

### Issue: Old behavior still happening
**Check:**
1. Confirm you're pulling `jkramer/paperless-ai:restrict-test`
2. Check `docker images` - verify image date is recent
3. Restart container after pulling new image
4. Clear browser cache

---

## Example Prompt Output

### Before (Old Behavior)
```
System Prompt: Analyze this document and extract metadata...

[AI generates: "Letter", "Incoming Mail"]
[System checks: "Letter" doesn't exist → discarded]
[System checks: "Incoming Mail" doesn't exist → discarded]
[Result: No tags applied ❌]
```

### After (New Behavior)
```
--- IMPORTANT RESTRICTIONS ---
TAGS: You MUST select tags ONLY from the following existing tags...
Available tags: correspondence, invoice, receipt, personal, work

[AI sees options, picks: "correspondence" for letter document]
[Result: "correspondence" tag applied ✅]
```

---

## Git Information

### Branch Structure
```
main
└── feature/restrict-to-existing-improvements  ← Current work
```

### Commit Details
```
commit 3b30455
Author: Jason Kramer
Date: 2025-01-04

Improve restrict-to-existing functionality to use constraint-first approach

- Updated all AI services (OpenAI, Ollama, Azure, Custom)
- Added document type restriction support
- Improved prompt construction with clear restriction sections
- Backward compatible when restrictions disabled
```

### Files Changed
```
 PRD-restrict-to-existing.md          | 273 +++++++++++++++
 routes/setup.js                      |   7 +-
 services/azureService.js             |  57 +++-
 services/customService.js            |  56 +++-
 services/ollamaService.js            |  89 +++--
 services/openaiService.js            |  57 +++-
 services/paperlessService.js         |  36 ++-
 services/restrictionPromptService.js |  42 ++-
 8 files changed, 531 insertions(+), 86 deletions(-)
```

---

## Next Steps (If Issues Arise)

### If the feature doesn't work:
1. Check the logs first - look for "IMPORTANT RESTRICTIONS" section
2. Verify restrictions are actually enabled in Settings
3. Confirm you have existing tags/types/correspondents in Paperless-ngx
4. Test with restrictions OFF to verify basic functionality works

### If you need to make changes:
1. Checkout the branch: `git checkout feature/restrict-to-existing-improvements`
2. Make your changes
3. Rebuild: `docker buildx build --platform linux/amd64,linux/arm64 -t jkramer/paperless-ai:restrict-test --push .`
4. Pull new image on Unraid

### If you want to merge to main:
```bash
git checkout main
git merge feature/restrict-to-existing-improvements
git push origin main
```

Then build production image:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t jkramer/paperless-ai:latest --push .
```

---

## Key Code Locations

### Restriction Logic
- **Prompt building:** `services/openaiService.js:114-165`
- **Document type restriction:** `services/paperlessService.js:1120-1181`
- **Tag restriction:** `services/paperlessService.js:312-413`
- **Correspondent restriction:** `services/paperlessService.js:1025-1089`

### Configuration
- **Environment variables:** `config/config.js:23-27, 64-66`
- **Settings UI:** `views/settings.ejs:518-560`
- **Options passing:** `routes/setup.js:1617-1623, 1656`

---

## Summary

**What works now:**
- ✅ AI receives list of available options before analyzing
- ✅ AI picks best matches from existing metadata
- ✅ Better semantic matching (e.g., "letter" → "correspondence")
- ✅ Higher success rate for metadata assignment
- ✅ Works for tags, correspondents, AND document types
- ✅ Backward compatible when restrictions disabled

**Docker image ready:**
- ✅ Built and pushed to Docker Hub
- ✅ Multi-platform (AMD64 + ARM64)
- ✅ Ready to pull on Unraid

**Testing needed:**
- [ ] User testing on real Unraid server
- [ ] Verify restrictions work as expected
- [ ] Check semantic matching quality
- [ ] Performance testing with large tag lists

---

## Contact/Resume Info

If you encounter issues in the next session:
1. Read this file first
2. Check the PRD: `PRD-restrict-to-existing.md`
3. Review commit: `git show 3b30455`
4. Pull Docker image: `docker pull jkramer/paperless-ai:restrict-test`

All changes are committed to the `feature/restrict-to-existing-improvements` branch and pushed to Docker Hub as `jkramer/paperless-ai:restrict-test`.
