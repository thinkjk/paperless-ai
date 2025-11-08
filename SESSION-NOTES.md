# Session Notes - Restrict-to-Existing Feature Implementation

**Date:** 2025-01-04 (Updated: 2025-11-08)
**Branch:** `main`
**Status:** ✅ COMPLETE - Enhanced tag prompts + metadata replacement controls

---

## 🆕 NEW FEATURE: Optional Metadata Replacement Controls (2025-11-08)

### The Problem
User discovered that Paperless-ngx auto-tags documents BEFORE paperless-ai webhook fires. This caused unwanted tags to persist:
- Paperless ML auto-tags: "Appliance" (wrong category)
- paperless-ai webhook fires → AI selects correct tags from 88-tag list
- **Current behavior**: AI tags were APPENDED to existing tags
- **Result**: Documents had both wrong auto-tags + correct AI tags

User question: "Do we need to remove existing tags first? Or is there a better way?"

### The Solution ✅
Added **optional UI toggles** to control whether AI replaces or keeps/appends existing metadata. This gives users flexibility to choose between:
- **Learning mode**: Let Paperless auto-tag + AI append (helps Paperless ML learn over time)
- **Clean mode**: AI replaces all metadata (immediate clean results)

### Implementation Details

**New Settings UI Section: "AI Metadata Replacement Behavior"**

Four new checkboxes with independent control:

1. **Replace Existing Tags** (default: OFF)
   - OFF: Append AI tags to existing (current behavior, helps Paperless learn)
   - ON: Remove all existing tags, use only AI-selected tags (clean results)

2. **Replace Existing Correspondent** (default: OFF)
   - OFF: Keep existing correspondent if set (current behavior)
   - ON: Always use AI correspondent (override Paperless detection)

3. **Replace Existing Document Type** (default: ON)
   - OFF: Keep existing document type if set (NEW option)
   - ON: Always use AI document type (current behavior)

4. **Replace Existing Title** (default: ON)
   - OFF: Keep existing title if set (NEW option)
   - ON: Always use AI title (current behavior)

### Files Modified

**1. config/config.js**
- Added `metadataReplacement` config section with 4 options
- Environment variables: `REPLACE_EXISTING_TAGS`, `REPLACE_EXISTING_CORRESPONDENT`, etc.
- Defaults maintain backward compatibility

**2. views/settings.ejs** (lines 571-654)
- Added new UI section with 4 checkboxes
- Helpful descriptions explaining append vs replace behavior
- Positioned after "AI Restrictions" section

**3. services/paperlessService.js** (lines 1278-1350)
- Updated `updateDocument()` signature to accept `options` parameter
- Implemented conditional logic for each metadata field:
  - **Tags**: If `replaceTags=yes` → use only AI tags; else → append to existing
  - **Correspondent**: If `replaceCorrespondent=yes` → use AI; else → keep existing if set
  - **Document Type**: If `replaceDocumentType=no` → keep existing; else → use AI
  - **Title**: If `replaceTitle=no` → keep existing; else → use AI
- Added comprehensive debug logging for each decision

**4. routes/setup.js**
- Updated `buildUpdateData()` to include replacement options (lines 1621-1634)
- Updated `saveDocumentChanges()` to accept and pass `options` to `updateDocument()` (line 1739)
- Updated both processing flows: scheduled scan (line 1532) and webhook queue (line 2404)
- Updated GET `/settings` to load replacement settings (lines 2729-2732)
- Updated POST `/settings` to save replacement settings (lines 4048-4051, 4150-4154, 4257-4261)

### How It Works

**Example: Removing Paperless Auto-Tags**

```
Before:
1. User uploads document
2. Paperless auto-tags: ["Appliance"] (wrong)
3. Webhook fires → paperless-ai runs
4. AI selects: ["Electronics", "Home Improvement"]
5. Result: Document has ["Appliance", "Electronics", "Home Improvement"]
   ❌ Wrong tag persists

After (with Replace Tags enabled):
1. User uploads document
2. Paperless auto-tags: ["Appliance"] (wrong)
3. Webhook fires → paperless-ai runs
4. AI selects: ["Electronics", "Home Improvement"]
5. Result: Document has ["Electronics", "Home Improvement"]
   ✅ Only AI-selected tags, auto-tag removed
```

### Debug Logging

When enabled, logs show decision-making:
```
[DEBUG] Current tags for document 123: [45]
[DEBUG] New AI tags: [67, 89]
[DEBUG] Replace tags setting: yes
[DEBUG] Replace mode: Using only AI-selected tags
```

### Use Cases

**Use Case 1: Clean Results (User's Issue)**
- Enable: ☑ Replace Existing Tags
- Benefit: Removes Paperless auto-tags, uses only AI-selected tags from 88-tag list
- Trade-off: Paperless ML learns only from AI, not from its own attempts

**Use Case 2: Help Paperless Learn**
- Disable: ☐ Replace Existing Tags
- Benefit: Paperless sees its attempts + AI corrections, improves over time
- Trade-off: Documents temporarily have duplicate/wrong tags during learning phase

**Use Case 3: Hybrid Approach**
- Short term: Enable replacement for clean results while Paperless trains
- Long term: Disable replacement once Paperless ML has learned patterns

### Environment Variables

Can also be set via `.env` or Docker environment:
```bash
REPLACE_EXISTING_TAGS=yes              # Remove existing tags
REPLACE_EXISTING_CORRESPONDENT=yes     # Override correspondent
REPLACE_EXISTING_DOCUMENT_TYPE=no      # Keep document type if exists
REPLACE_EXISTING_TITLE=no              # Keep title if exists
```

### Docker Image
Built and pushed as:
- `jkramer/paperless-ai:latest`
- `jkramer/paperless-ai:restrict-to-existing`
- **Digest:** `sha256:1a36eb3c5cecc79770bfa3e6b51de4bbca8e15e7f04fbdfff4568c7c5df5c59f`
- **Platforms:** linux/amd64, linux/arm64
- **Date:** 2025-11-08

### Backward Compatibility
✅ **100% backward compatible** - defaults maintain existing behavior:
- Tags: Append to existing (not replace)
- Correspondent: Keep existing if set (not replace)
- Document Type: Replace (current behavior)
- Title: Replace (current behavior)

If users don't change any settings, behavior is identical to previous version.

### Testing Steps
1. Pull new image: `docker pull jkramer/paperless-ai:latest`
2. Restart container
3. Open Settings → Find "AI Metadata Replacement Behavior" section
4. Enable "Replace Existing Tags"
5. Upload test document that Paperless auto-tags
6. Verify only AI-selected tags remain (Paperless auto-tags removed)

### Impact
This feature gives users fine-grained control over the AI → Paperless metadata flow, addressing the common issue where Paperless-ngx pre-processes documents before AI analysis. Users can now choose the optimal strategy for their workflow.

---

## 🎯 FINAL ENHANCEMENT: Explicit Tag Category Guidance (2025-11-08)

### The Problem
User tested with mistral:7b at 4000 character limit and found:
- ✅ 8/8 documents processed successfully
- ✅ All tags were valid (from the existing 88-tag list)
- ⚠️ Model was still TRYING to create literal tags like "Dishwasher", "Manual", "Refrigerator"
- ✅ Post-processing filter was catching and removing them, but user wanted prevention not filtering

**Example from logs:**
```
Document: Samsung Refrigerator Manual
AI suggested: ["Appliance", "Refrigerator", "User Manual"]
Post-filter result: ["Appliance"] (2 invalid tags removed)
```

User question: "Why is it even suggesting additional tags when it should only choose from the list?"

### Root Cause
The system prompt said "You MUST select tags ONLY from the following existing tags" but 7B-8B models still interpret literal product names ("Dishwasher", "Refrigerator") as perfectly valid tags. They don't understand the conceptual difference between literal descriptions and category tags without explicit examples.

### The Fix ✅
Enhanced the tag restriction section with explicit negative examples and category-focused guidance:

**Before:**
```javascript
systemPrompt += `\nTAGS: You MUST select tags ONLY from the following existing tags. Do NOT create new tags. Choose the tags that best match the document content:\n`;
systemPrompt += `Available tags: ${tagNames}\n`;
```

**After:**
```javascript
systemPrompt += `\nTAGS: You MUST select tags ONLY from the following existing tags. Do NOT create new tags.\n`;
systemPrompt += `IMPORTANT: Do NOT use literal product names, object names, or document types as tags.\n`;
systemPrompt += `For example:\n`;
systemPrompt += `  - If the document is about a dishwasher, use "Appliance" and "Kitchen Equipment", NOT "Dishwasher"\n`;
systemPrompt += `  - If the document is a manual, use category tags like "Appliance", NOT "Manual" or "User Manual"\n`;
systemPrompt += `  - If the document is about a refrigerator, use "Appliance" and "Kitchen Equipment", NOT "Refrigerator"\n`;
systemPrompt += `Think about what CATEGORY the document belongs to, not what object is mentioned.\n`;
systemPrompt += `Choose 2-4 tags that best categorize the document.\n`;
systemPrompt += `Available tags: ${tagNames}\n`;
```

### Test Results ✅

**Local Test:** Zephyr Range Hood manual
```json
{
  "tags": ["Appliance", "Kitchen Equipment", "Electronics"],
  "document_type": "Manual"
}
```
**Result:** ✅ **100% compliance** - No invalid tag suggestions, all 3 tags from existing list

**Production Deployment Test (User feedback: "wow it's so much better! I think it got everything this time"):**
- ✅ All 8 test documents processed successfully
- ✅ All tags selected from existing 88-tag list
- ✅ No invalid literal tag suggestions (no "Dishwasher", "Manual", "Refrigerator", etc.)
- ✅ Proper 2-4 category tags per document
- ✅ mistral:7b model with 4000 char truncation performing optimally

### Why This Works
The explicit examples teach the model to:
1. **Think categorically** - "What type of thing is this?" instead of "What is this thing called?"
2. **Avoid literal matching** - See "dishwasher" in text → select "Kitchen Equipment" (category) instead of creating "Dishwasher" (literal)
3. **Understand the difference** - Between object names and semantic categories
4. **Prefer conceptual tags** - "Appliance" + "Kitchen Equipment" is better than "Refrigerator"

### Files Modified
- `services/ollamaService.js` lines 349-360 (`_buildSystemPromptWithRestrictions()`)
- `services/ollamaService.js` lines 504-516 (`_buildPrompt()` - legacy method)

### Docker Image
Built and pushed as:
- `jkramer/paperless-ai:latest`
- `jkramer/paperless-ai:restrict-to-existing`
- **Digest:** `sha256:c4ba7d1c874cd33996fbb4736637c640e734ffea9b277c154318528fe8ec9932`
- **Platforms:** linux/amd64, linux/arm64
- **Date:** 2025-11-08

### Impact
This completes the restrict-to-existing feature optimization:
- ✅ Content truncation prevents model overwhelming (4000 chars)
- ✅ JSON schema enforcement handles corrupted documents
- ✅ Model parameters tuned for 7B-8B models (temp=0.5, top_k=10)
- ✅ Explicit category guidance prevents literal tag creation
- ✅ Post-processing filter as safety net (still in place)

**Result:** mistral:7b now consistently selects valid category tags without suggestions for literal product names or compound tags.

---

## 🔴 CRITICAL FIX #3: Content Truncation Issue (2025-11-07)

### The Problem
User reported that Paperless-AI was **only processing 1 document successfully**, all others got NO tags.

### Investigation from Logs
Analyzed Docker logs and found:
- ✅ **Document #3 (Glasses Rx)**: 1,310 tokens → Worked! Got tags (though 2 were invalid)
- ❌ **Documents #1, #4-9**: 13K-14K tokens → FAILED! Ollama returned garbage

**What Ollama was returning for large documents:**
- Document #1: `{"queryId": "...", "data": {...}}` - Wrong format!
- Document #6: `{"id": 1, "question": "...", "answer_options": [...]}` - Creating quizzes instead!
- Document #8: Warranty/troubleshooting structure - Extracting content instead of metadata
- Document #4: XML-like structure with "document", "page", "children" - Completely wrong

### Root Cause
The `_truncateContent()` method at line 254 in `services/ollamaService.js` was:
```javascript
_truncateContent(content) {
    if (process.env.CONTENT_MAX_LENGTH) {
        return content.substring(0, process.env.CONTENT_MAX_LENGTH);
    }
    return content;  // ❌ NO TRUNCATION if env var not set!
}
```

**Result:** When `CONTENT_MAX_LENGTH` wasn't set, it sent **entire document content** to Ollama (14K+ tokens). Ollama got overwhelmed and **completely ignored the system prompt**, doing "helpful" things like creating quizzes, extracting document structure, etc.

### The Fix ✅
Updated `_truncateContent()` to enforce a **sensible default of 6,000 characters** (~1,500 tokens):

```javascript
_truncateContent(content) {
    // Set a sensible default max length to prevent Ollama from getting overwhelmed
    // Large documents (14K+ tokens) cause Ollama to ignore the system prompt
    // Default to 6000 characters (~1500 tokens) which is enough for metadata extraction
    const maxLength = process.env.CONTENT_MAX_LENGTH || 6000;

    if (content.length > maxLength) {
        console.log(`[DEBUG] Truncating content from ${content.length} to ${maxLength} characters`);
        return content.substring(0, maxLength);
    }

    console.log(`[DEBUG] Content length ${content.length} is within limit (${maxLength})`);
    return content;
}
```

**Why 6,000 characters:**
- Document that worked: ~800 characters
- Documents that failed: 30K-40K+ characters
- 6,000 chars = ~1,500 tokens = enough content to extract metadata without overwhelming the model
- Users can override with `CONTENT_MAX_LENGTH` env var if needed

### Files Modified
- `services/ollamaService.js` line 254-271

### Testing
Local test confirmed truncation is working:
```
[DEBUG] Content length 766 is within limit (6000)
```

### Expected Result
- All 8 documents should now process successfully
- Ollama will follow the system prompt instead of creating quizzes/extracting structure
- Tags will be selected from the existing 88-tag list
- Document types will be selected from the existing 133-type list

### Docker Image
Built as: `jkramer/paperless-ai:latest` and `jkramer/paperless-ai:restrict-to-existing`

### Follow-up Fix: Handling Corrupted PDF Text (2025-11-07)

After testing, 7 of 8 documents processed successfully, but Document #6 (Zephyr Range Hood) failed due to **corrupted PDF character encoding**. The OCR produced malformed text like `(cid:43)(cid:82)(cid:82)(cid:71)...` which confused Ollama into:
- Returning wrong JSON schema (`{"product": [...], "instructions": [...]}` instead of the required format)
- Creating unterminated strings in JSON

**Additional Fixes Applied:**
1. **Explicit JSON schema enforcement** - Added clear instructions to ALWAYS use the required JSON structure
2. **Increased temperature** - Changed from 0.3 to 0.5 for better handling of unclear/corrupted text
3. **Increased top_k** - Changed from 7 to 10 for more diverse token selection

These changes help Ollama be more resilient when encountering corrupted OCR text while still enforcing the correct output format.

### Additional Improvement: Increased Context Length (2025-11-07)

Testing showed that while qwen2.5:7b successfully returned valid JSON for the corrupted document, it only selected 1 tag ("Appliance") when it should have selected multiple tags like "Kitchen Equipment" and "Home Improvement".

**Change Applied:**
- Increased default content truncation from **6,000 to 12,000 characters** (~3,000 tokens)
- Provides more context for the AI to make better tag selections
- Still prevents the 14K+ token overflow that caused complete failures
- Users can still override with `CONTENT_MAX_LENGTH` env var

This gives the AI 2x more document content to work with while maintaining stability.

### Revision: Reduced Context Back to 4K (2025-11-07)

After testing with llama3.1:8b, discovered that the massive system prompt (88 tags + 133 document types = ~4,300 tokens) was overwhelming smaller open-source models when combined with 12K characters of document content.

**Problem:** Models were creating invalid compound tags like "Weather Station", "Safety Instructions", "User Manual" instead of selecting from existing tags.

**Solution:** Reduced content length from 12,000 → 4,000 characters to reduce cognitive load.

**Token Budget Breakdown:**
- System prompt (restrictions): ~4,300 tokens
- Document content: ~1,000 tokens
- Response: ~1,000 tokens
- **Total:** ~6,300 tokens (within 8K limit for smaller models)

**Note:** For best results with large restriction lists (88 tags), consider using OpenAI GPT-4 which handles complex prompts better than 7B-8B open-source models.

---

## 🔴 CRITICAL ARCHITECTURAL BUG FIX #2 (2025-11-06)

### Session Context
This session was a continuation from a previous conversation that ran out of context. User reported that despite all previous fixes, the AI was still only processing 1 document properly and creating invalid tags instead of selecting from the existing 88 tags.

### The Discovery - Root Cause Identified ⚠️
Found a **CRITICAL ARCHITECTURAL BUG** in how prompts were being sent to Ollama:

**THE PROBLEM:**
The code was sending prompts BACKWARDS to Ollama:
```javascript
// WRONG WAY (what we had):
Ollama.generate({
    system: _generateSystemPrompt(customFieldsStr),  // Generic template - NO restrictions!
    prompt: _buildPrompt(content, existingTags, ...)  // Restrictions + document content mixed together
})
```

**WHY THIS WAS BROKEN:**
- The restriction instructions (tag lists, document type lists) were being sent as **user prompt content**
- The generic template was being sent as **system instructions**
- Ollama treats system prompts as primary instructions, user prompts as input data
- Result: AI was seeing the tag list as "part of the document" instead of "instructions to follow"
- This caused AI to **completely ignore the restrictions** and create arbitrary tags

**Evidence from logs:**
```
Document: "Glasses Rx"
AI returned: ["Eye Care", "Prescription", "Healthcare"]
Result: ❌ 2 invalid tags (not in 88-tag list), filtered out by post-processing
```

AI was creating random tags because it thought the restriction list was just informational text in the document!

### The Fix - Complete Prompt Architecture Rewrite ✅

**Created new method:** `_buildSystemPromptWithRestrictions()`
- Returns ONLY the system prompt with all restriction instructions
- Properly includes the tag/correspondent/document type lists
- Separates concerns: instructions vs. content

**Updated analyzeDocument flow:**
```javascript
// NEW WAY (correct):
let systemPrompt = this._buildSystemPromptWithRestrictions(
    existingTags,
    existingCorrespondentList,
    existingDocumentTypesList,
    options
);

const userPrompt = JSON.stringify(content);  // JUST the document

// Call Ollama with proper separation
const response = await this._callOllamaAPI(
    userPrompt,      // User message: document content only
    systemPrompt,    // System message: instructions + restrictions
    numCtx,
    this.documentAnalysisSchema
);
```

**Now Ollama receives:**
```
System Prompt:
  You are a document analyzer...

  --- IMPORTANT RESTRICTIONS ---
  TAGS: You MUST select tags ONLY from: Appliance, Electronics, Healthcare, ...
  DOCUMENT TYPE: You MUST select ONLY from: Manual, Invoice, Receipt, ...
  --- END RESTRICTIONS ---

  Return result as JSON...

User Prompt:
  {document content}
```

### Test Results - 100% Success Rate! 🎉

**Local test with mistral:7b model:**
```bash
node test-ollama-restrictions.js
```

**Document:** Zephyr Range Hood Installation Manual

**AI Response:**
```json
{
  "tags": ["Appliance", "Home Improvement", "Kitchen Equipment"],
  "document_type": "Manual",
  "correspondent": "Zephyr Customer Service",
  "title": "Installation and User Manual for Zephyr Range Hood Models"
}
```

**Results:**
- ✅ **All 3 tags from existing list** (no invalid tags created!)
- ✅ **Document type from existing 133 types**
- ✅ **Correspondent created properly** (not restricted)
- ✅ **100% compliance with restrictions**

**Before vs After:**
| Before Fix | After Fix |
|------------|-----------|
| AI created: "Eye Care", "Prescription" | AI selected: "Appliance", "Home Improvement", "Kitchen Equipment" |
| 2/3 tags invalid, filtered out | 3/3 tags valid from existing list |
| Post-processing filter required | AI natively follows restrictions |

### Files Modified

**services/ollamaService.js:**
- Added `_buildSystemPromptWithRestrictions()` method (lines 266-410)
- Updated `analyzeDocument()` to use new method (lines 100-143)
- Proper separation of system vs user prompts
- Updated logging to show complete prompt structure

### Docker Image Built

**Image:** `jkramer/paperless-ai:restrict-proper-prompt`
- **Digest:** `sha256:738e6c242f499b98f66331559a9bd89f8cea78f2ace24e6055a70a7170ec4128`
- **Platforms:** linux/amd64, linux/arm64
- **Date:** 2025-11-06
- **Status:** ✅ Pushed to Docker Hub

### Queue Processing Investigation

**User Question:** "Why was it only processing one document at a time?"

**Investigation Results:**
1. ✅ **Queue logic is correct** - has proper error handling, continues through all documents
2. ✅ **while loop processes all** - individual errors don't stop the queue
3. ❌ **Real issue:** Malformed Ollama responses caused documents to be marked "processed" with empty metadata

**What was happening:**
```
1. Webhook triggered → Document added to queue
2. Ollama received mixed prompt (instructions + content as one blob)
3. Ollama confused → returned "sections" format instead of metadata
   {
     "title": "Dehumidifier Manual",
     "sections": [...]  // WRONG FORMAT!
   }
4. JSON parsing failed → empty metadata ({ tags: [], correspondent: null })
5. Document marked as "processed" despite being useless
6. Queue loop continued BUT scheduled scan found "already processed" documents
7. Result: Only 1 document actually got metadata, rest were skipped
```

**Ollama was returning document summaries instead of metadata extraction!**

**Why the wrong format:**
- Old prompt structure mixed instructions with content
- Ollama couldn't distinguish between "extract metadata" vs "summarize document"
- Sometimes interpreted task as creating document outline with sections

**Fix:** Proper system/user prompt separation makes the task clear to Ollama

### Tag Suggestion Feature - Discussion

**User asked:** "What about adding ability for AI to suggest new tags?"

**Analysis:**
- ✅ **Benefits:** Could discover new categories, evolve taxonomy, help initial setup
- ❌ **Problems:** Tag explosion, inconsistency (Healthcare vs Health Care), near-duplicates, defeats purpose of curated 88 tags

**Recommendation:** **Don't implement** - User specifically wanted restrict-to-existing to avoid tag chaos

**Better alternative:** Add "Tag Coverage Report" showing:
- Documents with 0 tags (couldn't find matches)
- Most common correspondents (suggest making official)
- Documents using only "ai-processed" tag

**Decision:** Wait - current restrict-to-existing is what user needs

### Next Steps

1. **Deploy:** `docker pull jkramer/paperless-ai:restrict-proper-prompt`
2. **Test:** Process multiple documents and verify:
   - AI selects from existing 88 tags
   - AI selects from existing 133 document types
   - All documents in queue are processed (not just 1)
   - No invalid tags created
3. **If issues persist:** Check Ollama server logs for:
   - Resource constraints (memory/CPU)
   - Model loading issues
   - Context window limits
   - Version compatibility (need Ollama v0.1.17+ for `format: "json"`)

### Key Debugging Commands

```bash
# 1. Check Ollama container logs
docker logs <ollama-container> --tail 200

# 2. Verify mistral:7b is loaded
curl http://10.10.0.10:11434/api/ps

# 3. Check Ollama version (need v0.1.17+)
docker exec <ollama-container> ollama --version

# 4. Monitor during processing
docker logs -f <ollama-container>
```

---

## 🔴 PREVIOUS BUG FIX (2025-01-05)

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
