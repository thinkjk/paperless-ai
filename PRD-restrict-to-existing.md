# Product Requirements Document: Improve "Restrict to Existing" Functionality

**Version:** 1.0
**Date:** 2025-11-04
**Author:** Jason
**Status:** Approved

---

## 1. Problem Statement

### Current Behavior
When the "restrict to existing tags" or "restrict to existing document types" options are enabled, the system follows a **"generate-first, filter-second"** approach:

1. AI analyzes document and generates tag/document type names it thinks are appropriate
2. System checks if those generated names exist in Paperless-ngx
3. Non-existent tags/types are simply discarded and not applied
4. This often results in no tags/types being applied if the AI's suggestions don't match existing names exactly

### Issues with Current Approach
- **Inefficient AI usage**: AI generates names that may never be valid
- **Poor matching**: AI doesn't consider what's actually available in the system
- **User frustration**: Documents may not get tagged even when appropriate tags exist
- **Semantic mismatch**: AI might generate "invoice" when "invoices" exists in the system

---

## 2. Proposed Solution

### New Behavior
When "restrict to existing tags" or "restrict to existing document types" is enabled, implement a **"constrain-first, select-second"** approach:

1. **Fetch available options** from Paperless-ngx (all existing tags or document types)
2. **Include options in AI prompt** as a constrained selection pool
3. **AI selects best matches** from the provided pool based on document content
4. **Apply selected options** directly (no post-filtering needed)

### Benefits
- **Better matching**: AI can choose semantically similar tags from what exists
- **Higher success rate**: Documents more likely to receive appropriate metadata
- **Clearer AI instructions**: AI knows exact options available
- **More predictable behavior**: Users know AI will only use existing options

---

## 3. Functional Requirements

### FR-1: Tag Restriction Enhancement
**When** `RESTRICT_TO_EXISTING_TAGS=yes` is enabled:
- System MUST fetch all existing tags from Paperless-ngx before AI analysis
- System MUST include the complete list of tag names in the AI prompt
- AI prompt MUST instruct the model to "select the best matching tags from this list only"
- AI prompt MUST NOT allow the AI to suggest tags outside the provided list
- System SHOULD format the tag list clearly (e.g., comma-separated or bulleted)

### FR-2: Document Type Restriction Enhancement
**When** `RESTRICT_TO_EXISTING_DOCUMENT_TYPES=yes` is enabled:
- System MUST fetch all existing document types from Paperless-ngx before AI analysis
- System MUST include the complete list of document type names in the AI prompt
- AI prompt MUST instruct the model to "select the best matching document type from this list only"
- AI prompt MUST emphasize that exactly ONE document type should be selected
- System SHOULD format the document type list clearly

### FR-3: Correspondent Restriction (Existing Behavior)
**When** `RESTRICT_TO_EXISTING_CORRESPONDENTS=yes` is enabled:
- Verify current implementation follows the same "constrain-first" approach
- If not, update to match FR-1 behavior pattern

### FR-4: Backward Compatibility
**When** restriction options are disabled (set to "no"):
- System MUST continue to allow AI to generate new tag/document type names
- Existing behavior MUST remain unchanged
- No breaking changes to current functionality

### FR-5: Prompt Engineering
The AI prompt MUST clearly communicate:
- **Selection mandate**: "You MUST select from the following options only"
- **No creation allowed**: "Do NOT create new tags/types not in this list"
- **Best match selection**: "Choose the options that best match the document content"
- **Semantic matching**: "Use your judgment to find the most appropriate matches"

---

## 4. Technical Requirements

### TR-1: Restriction Prompt Service Updates
File: `services/restrictionPromptService.js`

**Current state**: Likely generates filtering logic after AI response
**Required changes**:
- Modify `buildRestrictionPrompt()` or equivalent function
- Fetch existing tags/types from Paperless-ngx API via `paperlessService.js`
- Build prompt sections that include available options
- Return formatted prompt text with option lists

### TR-2: AI Service Integration
Files: `services/openaiService.js`, `services/ollamaService.js`, `services/azureService.js`, `services/customService.js`

**Required changes**:
- Update system prompt construction to include restriction prompts
- Ensure restriction options are passed to AI before content analysis
- Remove any post-generation filtering logic for restricted fields
- Verify JSON schema still validates correctly

### TR-3: Paperless Service Caching
File: `services/paperlessService.js`

**Required changes**:
- Verify tag caching works correctly (already has 3-second TTL)
- Verify document type fetching is efficient
- Ensure correspondent fetching is cached if needed
- No changes needed if caching already handles this

### TR-4: Configuration Validation
File: `services/setupService.js`

**Required changes**:
- Validate that Paperless-ngx API is accessible
- Test fetching tags/types during setup validation
- Warn users if no tags/types exist when restrictions are enabled

---

## 5. Implementation Details

### Prompt Format Example

**For Tags (when restricted):**
```
IMPORTANT: You must ONLY select tags from the following existing tags in the system.
Do NOT create new tags. Choose the tags that best match this document's content:

Available tags: invoice, receipt, contract, correspondence, tax-document, bank-statement,
medical-record, insurance, warranty, manual, personal, work, urgent, archived, 2024, 2025

Select the most appropriate tags from this list only.
```

**For Document Types (when restricted):**
```
IMPORTANT: You must ONLY select a document type from the following existing types in the system.
Do NOT create a new document type. Choose the ONE type that best matches this document:

Available document types: Invoice, Receipt, Contract, Letter, Statement, Report, Form, Other

Select the single most appropriate document type from this list only.
```

---

## 6. Success Criteria

### Acceptance Criteria
1. When restrictions are enabled, AI prompts include complete lists of available options
2. AI responses only contain tags/types from the provided lists
3. Documents receive appropriate metadata more consistently than before
4. No regression in functionality when restrictions are disabled
5. Existing unit tests pass
6. Manual testing confirms improved tag/type assignment

### Testing Scenarios

**Scenario 1: Restricted tags with good matches**
- Given: 20 existing tags including "invoice", "tax", "2024"
- When: Processing a 2024 tax invoice with restrictions enabled
- Then: AI selects "invoice", "tax", "2024" from available options

**Scenario 2: Restricted tags with semantic matching**
- Given: Existing tag "correspondence" but not "letter"
- When: Processing a letter document
- Then: AI selects "correspondence" as closest match

**Scenario 3: Restricted document type**
- Given: Document types include "Invoice", "Receipt", "Contract"
- When: Processing an invoice
- Then: AI selects "Invoice" from available types

**Scenario 4: Restrictions disabled**
- Given: Restriction settings set to "no"
- When: Processing any document
- Then: AI can suggest new tags/types as before (current behavior)

---

## 7. Out of Scope

The following are explicitly NOT included in this change:
- Auto-creation of tags/types suggested by AI (current behavior when restrictions disabled is fine)
- UI changes to settings page
- Changes to manual processing workflow
- Changes to RAG/chat functionality
- Changes to custom fields handling
- Performance optimizations beyond current caching

---

## 8. Risks and Mitigations

### Risk 1: Token Limit Exceeded
**Risk**: Large tag lists might exceed token limits
**Mitigation**:
- Monitor token usage during testing
- If needed, implement tag list truncation with warning
- Most users won't have more than 100-200 tags (well within limits)

### Risk 2: API Performance
**Risk**: Fetching tags/types for every document might slow processing
**Mitigation**:
- Leverage existing tag caching (3-second TTL)
- Fetch document types once per batch
- Monitor processing time in testing

### Risk 3: Empty Option Lists
**Risk**: User enables restrictions but has no tags/types defined
**Mitigation**:
- Add validation in setup/settings
- Show warning if restrictions enabled but no options available
- Document this requirement clearly

---

## 9. Implementation Phases

### Phase 1: Analysis & Branch Setup
- Create feature branch
- Analyze current code flow
- Document current behavior

### Phase 2: Core Implementation
- Update `restrictionPromptService.js`
- Modify AI service prompt construction
- Remove post-filtering logic

### Phase 3: Testing & Validation
- Test with various tag/type configurations
- Verify backward compatibility
- Performance testing

### Phase 4: Documentation & Cleanup
- Update code comments
- Test edge cases
- Prepare for merge

---

## 10. Technical Dependencies

- Paperless-ngx API must support fetching tags/types (already does)
- Existing tag caching in `paperlessService.js`
- AI provider must support system prompts with instruction constraints (all current providers do)

---

## 11. Rollout Plan

1. Implement changes in feature branch
2. Test locally with real Paperless-ngx instance
3. Create pull request with detailed testing notes
4. Merge to main branch
5. Release in next version (3.0.10 or 3.1.0)

---

## Appendix A: Related Code Locations

- `services/restrictionPromptService.js` - Main restriction logic
- `services/paperlessService.js` - Tag/type fetching (lines ~100-500)
- `services/openaiService.js` - Prompt construction (lines ~50-200)
- `services/ollamaService.js` - Prompt construction
- `services/azureService.js` - Prompt construction
- `services/customService.js` - Prompt construction
- `config/config.js` - Configuration loading
- `.env` example - Restriction settings documentation
