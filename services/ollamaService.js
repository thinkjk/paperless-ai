const {
    calculateTokens,
    calculateTotalPromptTokens,
    truncateToTokenLimit,
    writePromptToFile
} = require('./serviceUtils');
const axios = require('axios');
const config = require('../config/config');
const fs = require('fs').promises;
const path = require('path');
const paperlessService = require('./paperlessService');
const os = require('os');
const OpenAI = require('openai');
const RestrictionPromptService = require('./restrictionPromptService');

/**
 * Service for document analysis using Ollama
 */
class OllamaService {
    /**
     * Initialize the Ollama service
     */
    constructor() {
        this.apiUrl = config.ollama.apiUrl;
        this.model = config.ollama.model;
        this.client = axios.create({
            timeout: 1800000 // 30 minutes timeout
        });

        // JSON schema for document analysis output
        this.documentAnalysisSchema = {
            type: "object",
            properties: {
                title: { type: "string" },
                correspondent: { type: "string" },
                tags: {
                    type: "array",
                    items: { type: "string" }
                },
                document_type: { type: "string" },
                document_date: { type: "string" },
                language: { type: "string" },
                custom_fields: {
                    type: "object",
                    additionalProperties: true
                }
            },
            required: ["title", "correspondent", "tags", "document_type", "document_date", "language"]
        };

        // Schema for playground analysis (simpler version)
        this.playgroundSchema = {
            type: "object",
            properties: {
                title: { type: "string" },
                correspondent: { type: "string" },
                tags: {
                    type: "array",
                    items: { type: "string" }
                },
                document_type: { type: "string" },
                document_date: { type: "string" },
                language: { type: "string" }
            },
            required: ["title", "correspondent", "tags", "document_type", "document_date", "language"]
        };
    }

    /**
     * Analyze a document and extract metadata
     * @param {string} content - Document content
     * @param {Array} existingTags - List of existing tags
     * @param {Array} existingCorrespondentList - List of existing correspondents
     * @param {string} id - Document ID
     * @param {string} customPrompt - Custom prompt (optional)
     * @returns {Object} Analysis results
     */
    async analyzeDocument(content, existingTags = [], existingCorrespondentList = [], existingDocumentTypesList = [], id, customPrompt = null, options = {}) {
        try {
            // Truncate content if needed
            content = this._truncateContent(content);

            // Cache thumbnail
            await this._handleThumbnailCaching(id);

            // Get external API data if available and validate it
            let externalApiData = options.externalApiData || null;
            let validatedExternalApiData = null;

            if (externalApiData) {
                try {
                    validatedExternalApiData = await this._validateAndTruncateExternalApiData(externalApiData);
                    console.log('[DEBUG] External API data validated and included');
                } catch (error) {
                    console.warn('[WARNING] External API data validation failed:', error.message);
                    validatedExternalApiData = null;
                }
            }

            // Build system prompt with restrictions
            let systemPrompt;
            if (!customPrompt) {
                systemPrompt = this._buildSystemPromptWithRestrictions(existingTags, existingCorrespondentList, existingDocumentTypesList, options);
            } else {
                // Parse CUSTOM_FIELDS for custom prompt
                let customFieldsObj;
                try {
                    customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
                } catch (error) {
                    console.error('Failed to parse CUSTOM_FIELDS:', error);
                    customFieldsObj = { custom_fields: [] };
                }

                const customFieldsTemplate = {};
                customFieldsObj.custom_fields.forEach((field, index) => {
                    customFieldsTemplate[index] = {
                        field_name: field.value,
                        value: "Fill in the value based on your analysis"
                    };
                });

                const customFieldsStr = '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
                    .split('\n')
                    .map(line => '    ' + line)
                    .join('\n');

                systemPrompt = customPrompt + '\n\n' + config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
                console.log('[DEBUG] Ollama Service started with custom prompt');
            }

            // Prepare content as user prompt
            const userPrompt = JSON.stringify(content);

            // Calculate context window size
            const totalPrompt = systemPrompt + userPrompt;
            const promptTokenCount = this._calculatePromptTokenCount(totalPrompt);
            const numCtx = this._calculateNumCtx(promptTokenCount, 1024);

            console.log(`[DEBUG] Use existing data: ${config.useExistingData}, Restrictions applied based on useExistingData setting`);
            console.log(`[DEBUG] External API data: ${validatedExternalApiData ? 'included' : 'none'}`);

            // Call Ollama API with proper separation: system prompt vs user prompt
            const response = await this._callOllamaAPI(userPrompt, systemPrompt, numCtx, this.documentAnalysisSchema);

            // Process response
            const parsedResponse = this._processOllamaResponse(response);

            // CRITICAL: Enforce restrictions by filtering AI response
            // If restrictions are enabled, remove any tags/types that don't exist
            if (options.restrictToExistingTags && existingTags && existingTags.length > 0) {
                const validTags = parsedResponse.tags.filter(tag => existingTags.includes(tag));
                const invalidTags = parsedResponse.tags.filter(tag => !existingTags.includes(tag));

                if (invalidTags.length > 0) {
                    console.warn(`[WARNING] AI returned ${invalidTags.length} invalid tags (not in restriction list):`, invalidTags);
                    console.log(`[INFO] Filtering to ${validTags.length} valid tags:`, validTags);
                }

                parsedResponse.tags = validTags;
            }

            if (options.restrictToExistingDocumentTypes && existingDocumentTypesList && existingDocumentTypesList.length > 0) {
                if (parsedResponse.document_type && !existingDocumentTypesList.includes(parsedResponse.document_type)) {
                    console.warn(`[WARNING] AI returned invalid document type "${parsedResponse.document_type}" (not in restriction list)`);
                    console.log('[INFO] Setting document_type to null - will not update');
                    parsedResponse.document_type = null;
                }
            }

            // Check for missing data
            if (parsedResponse.tags.length === 0 && parsedResponse.correspondent === null) {
                console.warn('No tags or correspondent found in response from Ollama for Document. Please review your prompt or switch to OpenAI for better results.');
            }

            // Log the prompt and response
            await this._logPromptAndResponse(systemPrompt + '\n\n' + userPrompt, parsedResponse);

            // Return results in consistent format
            return {
                document: parsedResponse,
                metrics: {
                    promptTokens: 0,  // Ollama doesn't provide token metrics
                    completionTokens: 0,
                    totalTokens: 0
                },
                truncated: false
            };
        } catch (error) {
            console.error('Error analyzing document with Ollama:', error);
            return {
                document: { tags: [], correspondent: null },
                metrics: null,
                error: error.message
            };
        }
    }

    /**
     * Analyze a document in playground mode
     * @param {string} content - Document content
     * @param {string} prompt - User-provided prompt
     * @returns {Object} Analysis results
     */
    async analyzePlayground(content, prompt) {
        try {
            // Calculate context window size
            const promptTokenCount = await calculateTokens(prompt);
            const numCtx = this._calculateNumCtx(promptTokenCount, 1024);

            // Generate playground system prompt (simpler than full analysis)
            const systemPrompt = this._generatePlaygroundSystemPrompt();

            // Call Ollama API
            const response = await this._callOllamaAPI(
                prompt + "\n\n" + JSON.stringify(content),
                systemPrompt,
                numCtx,
                this.playgroundSchema
            );

            // Process response
            const parsedResponse = this._processOllamaResponse(response);

            // Check for missing data
            if (parsedResponse.tags.length === 0 && parsedResponse.correspondent === null) {
                console.warn('No tags or correspondent found in response from Ollama for Document. Please review your prompt or switch to OpenAI for better results.');
            }

            // Return results in consistent format
            return {
                document: parsedResponse,
                metrics: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0
                },
                truncated: false
            };
        } catch (error) {
            console.error('Error analyzing document with Ollama:', error);
            return {
                document: { tags: [], correspondent: null },
                metrics: null,
                error: error.message
            };
        }
    }

    /**
     * Truncate content to maximum length if specified
     * @param {string} content - Content to truncate
     * @returns {string} Truncated content
     */
    _truncateContent(content) {
        try {
            // Set a sensible default max length to prevent Ollama from getting overwhelmed
            // With large restriction lists (88 tags + 133 doc types = ~4300 tokens in system prompt),
            // we need to keep document content smaller to stay within model context limits
            // Default to 4000 characters (~1000 tokens) to leave room for restrictions + response
            // Users can override with CONTENT_MAX_LENGTH env var
            const maxLength = process.env.CONTENT_MAX_LENGTH || 4000;

            if (content.length > maxLength) {
                console.log(`[DEBUG] Truncating content from ${content.length} to ${maxLength} characters`);
                return content.substring(0, maxLength);
            }

            console.log(`[DEBUG] Content length ${content.length} is within limit (${maxLength})`);
        } catch (error) {
            console.error('Error truncating content:', error);
        }
        return content;
    }

    /**
     * Build system prompt with restrictions (NEW METHOD)
     * This returns ONLY the system prompt with restriction instructions
     * @param {Array} existingTags - List of existing tags
     * @param {Array} existingCorrespondent - List of existing correspondents
     * @param {Array} existingDocumentTypes - List of existing document types
     * @param {Object} options - Options including restriction flags
     * @returns {string} System prompt with restrictions
     */
    _buildSystemPromptWithRestrictions(existingTags = [], existingCorrespondent = [], existingDocumentTypes = [], options = {}) {
        let systemPrompt;

        // Validate that existingCorrespondent is an array
        const correspondentList = Array.isArray(existingCorrespondent)
            ? existingCorrespondent
            : [];

        // Parse CUSTOM_FIELDS from environment variable
        let customFieldsObj;
        try {
            customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
        } catch (error) {
            console.error('Failed to parse CUSTOM_FIELDS:', error);
            customFieldsObj = { custom_fields: [] };
        }

        // Generate custom fields template
        const customFieldsTemplate = {};
        customFieldsObj.custom_fields.forEach((field, index) => {
            customFieldsTemplate[index] = {
                field_name: field.value,
                value: "Fill in the value based on your analysis"
            };
        });

        const customFieldsStr = '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
            .split('\n')
            .map(line => '    ' + line)
            .join('\n');

        // Build base system prompt
        systemPrompt = process.env.SYSTEM_PROMPT + '\n\n';

        // Add explicit JSON schema enforcement (helps with corrupted/malformed documents)
        systemPrompt += `CRITICAL: You MUST return a JSON object with this EXACT structure, regardless of document quality:\n`;
        systemPrompt += `{\n`;
        systemPrompt += `  "title": "string",\n`;
        systemPrompt += `  "correspondent": "string or null",\n`;
        systemPrompt += `  "tags": ["array", "of", "strings"],\n`;
        systemPrompt += `  "document_type": "string",\n`;
        systemPrompt += `  "document_date": "YYYY-MM-DD or null",\n`;
        systemPrompt += `  "language": "en/de/es/etc",\n`;
        systemPrompt += `  "custom_fields": {}\n`;
        systemPrompt += `}\n`;
        systemPrompt += `If the document has corrupted text or unclear content, make your best guess but ALWAYS use this JSON structure.\n`;
        systemPrompt += `Do NOT create alternative JSON formats (like "product", "instructions", "model_number", etc.).\n\n`;

        // Check restriction settings
        const hasTagRestrictions = options.restrictToExistingTags !== undefined
            ? options.restrictToExistingTags
            : config.restrictToExistingTags === 'yes';
        const hasCorrespondentRestrictions = options.restrictToExistingCorrespondents !== undefined
            ? options.restrictToExistingCorrespondents
            : config.restrictToExistingCorrespondents === 'yes';
        const hasDocTypeRestrictions = options.restrictToExistingDocumentTypes !== undefined
            ? options.restrictToExistingDocumentTypes
            : config.restrictToExistingDocumentTypes === 'yes';

        console.log(`[DEBUG] Ollama restriction settings: tags=${hasTagRestrictions}, correspondents=${hasCorrespondentRestrictions}, docTypes=${hasDocTypeRestrictions}`);

        // Add restriction instructions
        if (hasTagRestrictions || hasCorrespondentRestrictions || hasDocTypeRestrictions) {
            systemPrompt += '\n--- IMPORTANT RESTRICTIONS ---\n';

            if (hasTagRestrictions && existingTags && existingTags.length > 0) {
                const tagNames = existingTags.join(', ');
                systemPrompt += `\nTAGS: You MUST select tags ONLY from the following existing tags. Do NOT create new tags.\n`;
                systemPrompt += `IMPORTANT: Do NOT use literal product names, object names, or document types as tags.\n`;
                systemPrompt += `For example:\n`;
                systemPrompt += `  - If the document is about a dishwasher, use "Appliance" and "Kitchen Equipment", NOT "Dishwasher"\n`;
                systemPrompt += `  - If the document is a manual, use category tags like "Appliance", NOT "Manual" or "User Manual"\n`;
                systemPrompt += `  - If the document is about a refrigerator, use "Appliance" and "Kitchen Equipment", NOT "Refrigerator"\n`;
                systemPrompt += `Think about what CATEGORY the document belongs to, not what object is mentioned.\n`;
                systemPrompt += `Choose 2-4 tags that best categorize the document.\n`;
                systemPrompt += `Available tags: ${tagNames}\n`;
            }

            if (hasCorrespondentRestrictions && correspondentList && correspondentList.length > 0) {
                const correspondentNames = correspondentList.join(', ');
                systemPrompt += `\nCORRESPONDENT: You MUST select a correspondent ONLY from the following existing correspondents. Do NOT create a new correspondent. Choose the ONE that best matches the document:\n`;
                systemPrompt += `Available correspondents: ${correspondentNames}\n`;
            }

            if (hasDocTypeRestrictions && existingDocumentTypes && existingDocumentTypes.length > 0) {
                const docTypeNames = existingDocumentTypes.join(', ');
                systemPrompt += `\nDOCUMENT TYPE: You MUST select a document type ONLY from the following existing types. Do NOT create a new type. Choose the ONE that best matches the document:\n`;
                systemPrompt += `Available document types: ${docTypeNames}\n`;
            }

            systemPrompt += '--- END RESTRICTIONS ---\n\n';
        } else if (config.useExistingData === 'yes') {
            // Show pre-existing data as reference
            const existingTagsList = Array.isArray(existingTags)
                ? existingTags.map(tag => typeof tag === 'string' ? tag : tag.name).join(', ')
                : existingTags;
            const existingCorrespondentListStr = correspondentList
                .filter(Boolean)
                .map(correspondent => typeof correspondent === 'string' ? correspondent : correspondent?.name || '')
                .filter(name => name.length > 0)
                .join(', ');
            const existingDocumentTypesList = existingDocumentTypes
                .filter(Boolean)
                .map(docType => typeof docType === 'string' ? docType : docType?.name || '')
                .filter(name => name.length > 0)
                .join(', ');

            systemPrompt += `\nPre-existing tags: ${existingTagsList}\n`;
            systemPrompt += `Pre-existing correspondents: ${existingCorrespondentListStr}\n`;
            systemPrompt += `Pre-existing document types: ${existingDocumentTypesList}\n\n`;
        }

        // Add the must-have prompt template
        config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        systemPrompt += config.mustHavePrompt;

        // Get validated external API data if available
        let validatedExternalApiData = null;
        if (options.externalApiData) {
            try {
                validatedExternalApiData = this._validateAndTruncateExternalApiData(options.externalApiData);
                console.log('[DEBUG] External API data validated and included');
            } catch (error) {
                console.warn('[WARNING] External API data validation failed:', error.message);
                validatedExternalApiData = null;
            }
        }

        // Process placeholder replacements (backward compatibility)
        systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
            systemPrompt,
            existingTags,
            correspondentList,
            existingDocumentTypes,
            config
        );

        // Include validated external API data
        if (validatedExternalApiData) {
            systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
        }

        // Handle USE_PROMPT_TAGS (only if restrictions are NOT enabled)
        const hasAnyRestrictions = hasTagRestrictions || hasCorrespondentRestrictions || hasDocTypeRestrictions;
        if (process.env.USE_PROMPT_TAGS === 'yes' && !hasAnyRestrictions) {
            systemPrompt += `\n\nTake these tags and try to match one or more to the document content.\n\n`;
            systemPrompt += config.specialPromptPreDefinedTags;
        }

        // Debug: Log the system prompt
        console.log('[DEBUG] Ollama system prompt being sent to AI:');
        console.log('--- START SYSTEM PROMPT ---');
        console.log(systemPrompt);
        console.log('--- END SYSTEM PROMPT ---');

        return systemPrompt;
    }

    /**
     * Build prompt from content and existing data (LEGACY - kept for backward compatibility)
     * @param {string} content - Document content
     * @param {Array} existingTags - List of existing tags
     * @param {Array} existingCorrespondent - List of existing correspondents
     * @param {Array} existingDocumentTypes - List of existing document types
     * @returns {string} Formatted prompt
     */
    _buildPrompt(content, existingTags = [], existingCorrespondent = [], existingDocumentTypes = [], options = {}) {
        let systemPrompt;
        let promptTags = '';

        // Validate that existingCorrespondent is an array and handle if it's not
        const correspondentList = Array.isArray(existingCorrespondent)
            ? existingCorrespondent
            : [];

        // Parse CUSTOM_FIELDS from environment variable
        let customFieldsObj;
        try {
            customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
        } catch (error) {
            console.error('Failed to parse CUSTOM_FIELDS:', error);
            customFieldsObj = { custom_fields: [] };
        }

        // Generate custom fields template for the prompt
        const customFieldsTemplate = {};

        customFieldsObj.custom_fields.forEach((field, index) => {
            customFieldsTemplate[index] = {
                field_name: field.value,
                value: "Fill in the value based on your analysis"
            };
        });

        // Convert template to string for replacement and wrap in custom_fields
        const customFieldsStr = '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
            .split('\n')
            .map(line => '    ' + line)  // Add proper indentation
            .join('\n');

        // Build base system prompt
        systemPrompt = process.env.SYSTEM_PROMPT + '\n\n';

        // Add restriction instructions if any restrictions are enabled
        // Use options parameter if provided, otherwise fall back to config
        const hasTagRestrictions = options.restrictToExistingTags !== undefined
            ? options.restrictToExistingTags
            : config.restrictToExistingTags === 'yes';
        const hasCorrespondentRestrictions = options.restrictToExistingCorrespondents !== undefined
            ? options.restrictToExistingCorrespondents
            : config.restrictToExistingCorrespondents === 'yes';
        const hasDocTypeRestrictions = options.restrictToExistingDocumentTypes !== undefined
            ? options.restrictToExistingDocumentTypes
            : config.restrictToExistingDocumentTypes === 'yes';

        console.log(`[DEBUG] Ollama restriction settings: tags=${hasTagRestrictions}, correspondents=${hasCorrespondentRestrictions}, docTypes=${hasDocTypeRestrictions}`);

        if (hasTagRestrictions || hasCorrespondentRestrictions || hasDocTypeRestrictions) {
            systemPrompt += '\n--- IMPORTANT RESTRICTIONS ---\n';

            if (hasTagRestrictions && existingTags && existingTags.length > 0) {
                // existingTags is already an array of tag name strings
                const tagNames = existingTags.join(', ');
                systemPrompt += `\nTAGS: You MUST select tags ONLY from the following existing tags. Do NOT create new tags.\n`;
                systemPrompt += `IMPORTANT: Do NOT use literal product names, object names, or document types as tags.\n`;
                systemPrompt += `For example:\n`;
                systemPrompt += `  - If the document is about a dishwasher, use "Appliance" and "Kitchen Equipment", NOT "Dishwasher"\n`;
                systemPrompt += `  - If the document is a manual, use category tags like "Appliance", NOT "Manual" or "User Manual"\n`;
                systemPrompt += `  - If the document is about a refrigerator, use "Appliance" and "Kitchen Equipment", NOT "Refrigerator"\n`;
                systemPrompt += `Think about what CATEGORY the document belongs to, not what object is mentioned.\n`;
                systemPrompt += `Choose 2-4 tags that best categorize the document.\n`;
                systemPrompt += `Available tags: ${tagNames}\n`;
            }

            if (hasCorrespondentRestrictions && correspondentList && correspondentList.length > 0) {
                // correspondentList is already an array of correspondent name strings
                const correspondentNames = correspondentList.join(', ');
                systemPrompt += `\nCORRESPONDENT: You MUST select a correspondent ONLY from the following existing correspondents. Do NOT create a new correspondent. Choose the ONE that best matches the document:\n`;
                systemPrompt += `Available correspondents: ${correspondentNames}\n`;
            }

            if (hasDocTypeRestrictions && existingDocumentTypes && existingDocumentTypes.length > 0) {
                // existingDocumentTypes is already an array of document type name strings
                const docTypeNames = existingDocumentTypes.join(', ');
                systemPrompt += `\nDOCUMENT TYPE: You MUST select a document type ONLY from the following existing types. Do NOT create a new type. Choose the ONE that best matches the document:\n`;
                systemPrompt += `Available document types: ${docTypeNames}\n`;
            }

            systemPrompt += '--- END RESTRICTIONS ---\n\n';
        } else if (config.useExistingData === 'yes') {
            // If useExistingData is enabled but restrictions are not, show pre-existing data as reference
            const existingTagsList = Array.isArray(existingTags)
                ? existingTags.map(tag => typeof tag === 'string' ? tag : tag.name).join(', ')
                : existingTags;
            const existingCorrespondentList = correspondentList
                .filter(Boolean)
                .map(correspondent => typeof correspondent === 'string' ? correspondent : correspondent?.name || '')
                .filter(name => name.length > 0)
                .join(', ');
            const existingDocumentTypesList = existingDocumentTypes
                .filter(Boolean)
                .map(docType => typeof docType === 'string' ? docType : docType?.name || '')
                .filter(name => name.length > 0)
                .join(', ');

            systemPrompt += `\nPre-existing tags: ${existingTagsList}\n`;
            systemPrompt += `Pre-existing correspondents: ${existingCorrespondentList}\n`;
            systemPrompt += `Pre-existing document types: ${existingDocumentTypesList}\n\n`;
        }

        // Add the must-have prompt template
        config.mustHavePrompt = config.mustHavePrompt.replace('%CUSTOMFIELDS%', customFieldsStr);
        systemPrompt += config.mustHavePrompt;
        promptTags = '';

        // Get validated external API data if available
        let validatedExternalApiData = null;
        if (options.externalApiData) {
            try {
                validatedExternalApiData = this._validateAndTruncateExternalApiData(options.externalApiData);
                console.log('[DEBUG] External API data validated and included');
            } catch (error) {
                console.warn('[WARNING] External API data validation failed:', error.message);
                validatedExternalApiData = null;
            }
        }

        // Process placeholder replacements in system prompt (for backward compatibility)
        systemPrompt = RestrictionPromptService.processRestrictionsInPrompt(
            systemPrompt,
            existingTags,
            correspondentList,
            existingDocumentTypes,
            config
        );

        // Include validated external API data if available
        if (validatedExternalApiData) {
            systemPrompt += `\n\nAdditional context from external API:\n${validatedExternalApiData}`;
        }

        // IMPORTANT: Do NOT replace systemPrompt here - it would wipe out the restriction section!
        // Only append USE_PROMPT_TAGS content if restrictions are NOT enabled
        // If restrictions are enabled, the tag list is already in the restrictions section
        const hasAnyRestrictions = hasTagRestrictions || hasCorrespondentRestrictions || hasDocTypeRestrictions;
        if (process.env.USE_PROMPT_TAGS === 'yes' && !hasAnyRestrictions) {
            promptTags = process.env.PROMPT_TAGS;
            // Append rather than replace to preserve restrictions
            systemPrompt += `\n\nTake these tags and try to match one or more to the document content.\n\n`;
            systemPrompt += config.specialPromptPreDefinedTags;
        }

        // Debug: Log the system prompt to verify restrictions are included
        console.log('[DEBUG] Ollama system prompt being sent to AI:');
        console.log('--- START PROMPT ---');
        console.log(systemPrompt);
        console.log('--- END PROMPT ---');

        return `${systemPrompt}
        ${JSON.stringify(content)}
        `;
    }

    /**
     * Validate and truncate external API data to prevent token overflow
     * @param {any} apiData - The external API data to validate
     * @param {number} maxTokens - Maximum tokens allowed for external data (default: 500)
     * @returns {string} - Validated and potentially truncated data string
     */
    async _validateAndTruncateExternalApiData(apiData, maxTokens = 500) {
        if (!apiData) {
            return null;
        }

        const dataString = typeof apiData === 'object'
            ? JSON.stringify(apiData, null, 2)
            : String(apiData);

        // Calculate tokens for the data (using simple estimation for Ollama)
        const dataTokens = Math.ceil(dataString.length / 4);

        if (dataTokens > maxTokens) {
            console.warn(`[WARNING] External API data (${dataTokens} tokens) exceeds limit (${maxTokens}), truncating`);
            // Simple truncation based on character count
            const maxChars = maxTokens * 4;
            return dataString.substring(0, maxChars);
        }

        console.log(`[DEBUG] External API data validated: ${dataTokens} tokens`);
        return dataString;
    }

    /**
     * Generate custom fields template for prompts
     * @returns {string} Custom fields template as a string
     */
    _generateCustomFieldsTemplate() {
        let customFieldsObj;
        try {
            customFieldsObj = JSON.parse(process.env.CUSTOM_FIELDS);
        } catch (error) {
            console.error('Failed to parse CUSTOM_FIELDS:', error);
            customFieldsObj = { custom_fields: [] };
        }

        // Generate custom fields template for the prompt
        const customFieldsTemplate = {};

        customFieldsObj.custom_fields.forEach((field, index) => {
            customFieldsTemplate[index] = {
                field_name: field.value,
                value: "Fill in the value based on your analysis"
            };
        });

        // Convert template to string for replacement and wrap in custom_fields
        return '"custom_fields": ' + JSON.stringify(customFieldsTemplate, null, 2)
            .split('\n')
            .map(line => '    ' + line)  // Add proper indentation
            .join('\n');
    }

    /**
     * Generate system prompt for document analysis
     * @param {string} customFieldsStr - Custom fields as a string
     * @returns {string} System prompt
     */
    _generateSystemPrompt(customFieldsStr) {
        let systemPromptTemplate = `
            You are a document analyzer. Your task is to analyze documents and extract relevant information. You do not ask back questions. 
            YOU MUSTNOT: Ask for additional information or clarification, or ask questions about the document, or ask for additional context.
            YOU MUSTNOT: Return a response without the desired JSON format.
            YOU MUST: Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
            IMPORTANT: The custom_fields are optional and can be left out if not needed, only try to fill out the values if you find a matching information in the document.
            Do not change the value of field_name, only fill out the values. If the field is about money only add the number without currency and always use a . for decimal places.
            {
                "title": "xxxxx",
                "correspondent": "xxxxxxxx",
                "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
                "document_type": "Invoice/Contract/...",
                "document_date": "YYYY-MM-DD",
                "language": "en/de/es/...",
                %CUSTOMFIELDS%
            }
            ALWAYS USE THE INFORMATION TO FILL OUT THE JSON OBJECT. DO NOT ASK BACK QUESTIONS.
        `;

        return systemPromptTemplate.replace('%CUSTOMFIELDS%', customFieldsStr);
    }

    /**
     * Generate system prompt for playground analysis
     * @returns {string} System prompt
     */
    _generatePlaygroundSystemPrompt() {
        return `
            You are a document analyzer. Your task is to analyze documents and extract relevant information. You do not ask back questions. 
            YOU MUSTNOT: Ask for additional information or clarification, or ask questions about the document, or ask for additional context.
            YOU MUSTNOT: Return a response without the desired JSON format.
            YOU MUST: Analyze the document content and extract the following information into this structured JSON format and only this format!:         {
            "title": "xxxxx",
            "correspondent": "xxxxxxxx",
            "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
            "document_type": "Invoice/Contract/...",
            "document_date": "YYYY-MM-DD",
            "language": "en/de/es/..."
            }
            ALWAYS USE THE INFORMATION TO FILL OUT THE JSON OBJECT. DO NOT ASK BACK QUESTIONS.
        `;
    }

    /**
     * Calculate prompt token count
     * @param {string} prompt - Prompt text
     * @returns {number} Estimated token count
     */
    _calculatePromptTokenCount(prompt) {
        return Math.ceil(prompt.length / 4);
    }

    /**
     * Calculate context window size for Ollama
     * @param {number} promptTokenCount - Token count for prompt
     * @param {number} expectedResponseTokens - Expected response token count
     * @returns {number} Context window size
     */
    _calculateNumCtx(promptTokenCount, expectedResponseTokens) {
        const totalTokenUsage = promptTokenCount + expectedResponseTokens;
        const maxCtxLimit = Number(config.tokenLimit);

        const numCtx = Math.min(totalTokenUsage, maxCtxLimit);

        console.log('Prompt Token Count:', promptTokenCount);
        console.log('Expected Response Tokens:', expectedResponseTokens);
        console.log('Dynamic calculated num_ctx:', numCtx);

        return numCtx;
    }

    /**
     * Get available system memory
     * @returns {Object} Object with totalMemoryMB and freeMemoryMB
     */
    async _getAvailableMemory() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const totalMemoryMB = (totalMemory / (1024 * 1024)).toFixed(0);
        const freeMemoryMB = (freeMemory / (1024 * 1024)).toFixed(0);
        return { totalMemoryMB, freeMemoryMB };
    }

    /**
     * Handle thumbnail caching for documents
     * @param {string} id - Document ID
     */
    async _handleThumbnailCaching(id) {
        if (!id) return;

        const cachePath = path.join('./public/images', `${id}.png`);
        try {
            await fs.access(cachePath);
            console.log('[DEBUG] Thumbnail already cached');
        } catch (err) {
            console.log('Thumbnail not cached, fetching from Paperless');
            const thumbnailData = await paperlessService.getThumbnailImage(id);
            if (!thumbnailData) {
                console.warn('Thumbnail nicht gefunden');
                return;
            }
            await fs.mkdir(path.dirname(cachePath), { recursive: true });
            await fs.writeFile(cachePath, thumbnailData);
        }
    }

    /**
     * Call Ollama API
     * @param {string} prompt - Prompt text
     * @param {string} systemPrompt - System prompt
     * @param {number} numCtx - Context window size
     * @param {Object} schema - Response schema
     * @returns {Object} Ollama API response
     */
    async _callOllamaAPI(prompt, systemPrompt, numCtx, schema) {
        const response = await this.client.post(`${this.apiUrl}/api/generate`, {
            model: this.model,
            prompt: prompt,
            system: systemPrompt,
            stream: false,
            format: "json",  // Force JSON output mode
            options: {
                temperature: 0.5,  // Slightly higher for better handling of corrupted/unclear text
                top_p: 0.9,
                repeat_penalty: 1.1,
                top_k: 10,  // Increased for more diverse token selection
                num_predict: 512,  // Increase for longer responses
                num_ctx: numCtx
            }
        });

        if (!response.data) {
            throw new Error('Invalid response from Ollama API');
        }

        return response.data;
    }

    /**
     * Process Ollama API response
     * @param {Object} responseData - Ollama API response data
     * @returns {Object} Parsed response
     */
    _processOllamaResponse(responseData) {
        // Log the raw response for debugging
        console.log('[DEBUG] Raw Ollama response type:', typeof responseData.response);
        console.log('[DEBUG] Raw Ollama response (first 500 chars):',
            typeof responseData.response === 'string'
                ? responseData.response.substring(0, 500)
                : JSON.stringify(responseData.response).substring(0, 500)
        );

        if (!responseData.response) {
            throw new Error('No response data from Ollama API');
        }

        // When format: "json" is used, Ollama returns JSON as a string that needs parsing
        if (typeof responseData.response === 'string') {
            try {
                console.log('Parsing JSON string response from Ollama');
                const parsed = JSON.parse(responseData.response);
                console.log('[DEBUG] Successfully parsed JSON response');

                // Return normalized structure
                return {
                    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
                    correspondent: parsed.correspondent || null,
                    title: parsed.title || null,
                    document_date: parsed.document_date || null,
                    document_type: parsed.document_type || null,
                    language: parsed.language || null,
                    custom_fields: parsed.custom_fields || null
                };
            } catch (jsonError) {
                console.error('[ERROR] Failed to parse JSON from Ollama:', jsonError.message);
                console.log('[DEBUG] Attempting fallback text parsing...');
                return this._parseResponse(responseData.response);
            }
        } else if (typeof responseData.response === 'object') {
            // Direct object response (shouldn't happen with format: "json", but handle it anyway)
            console.log('Using structured output response (object)');
            return {
                tags: Array.isArray(responseData.response.tags) ? responseData.response.tags : [],
                correspondent: responseData.response.correspondent || null,
                title: responseData.response.title || null,
                document_date: responseData.response.document_date || null,
                document_type: responseData.response.document_type || null,
                language: responseData.response.language || null,
                custom_fields: responseData.response.custom_fields || null
            };
        }

        throw new Error('Unexpected response format from Ollama');
    }

    /**
     * Parse text response to extract JSON
     * @param {string} response - Response text
     * @returns {Object} Parsed object
     */
    _parseResponse(response) {
        try {
            // Find JSON in response using regex
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { tags: [], correspondent: null };
            }

            let jsonStr = jsonMatch[0];
            console.log('Extracted JSON String:', jsonStr);

            try {
                // Attempt to parse the JSON
                const result = JSON.parse(jsonStr);

                // Validate and return the result
                return {
                    tags: Array.isArray(result.tags) ? result.tags : [],
                    correspondent: result.correspondent || null,
                    title: result.title || null,
                    document_date: result.document_date || null,
                    document_type: result.document_type || null,
                    language: result.language || null,
                    custom_fields: result.custom_fields || null
                };

            } catch (jsonError) {
                console.warn('Error parsing JSON from response:', jsonError.message);
                console.warn('Attempting to sanitize the JSON...');

                // Sanitize the JSON
                jsonStr = this._sanitizeJsonString(jsonStr);

                try {
                    const sanitizedResult = JSON.parse(jsonStr);
                    return {
                        tags: Array.isArray(sanitizedResult.tags) ? sanitizedResult.tags : [],
                        correspondent: sanitizedResult.correspondent || null,
                        title: sanitizedResult.title || null,
                        document_date: sanitizedResult.document_date || null,
                        language: sanitizedResult.language || null
                    };
                } catch (finalError) {
                    console.error('Final JSON parsing failed after sanitization. This happens when the JSON structure is too complex or invalid. That indicates an issue with the generated JSON string by Ollama. Switch to OpenAI for better results or fine tune your prompt.');
                    return { tags: [], correspondent: null };
                }
            }
        } catch (error) {
            console.error('Error parsing Ollama response:', error.message);
            return { tags: [], correspondent: null };
        }
    }

    /**
     * Sanitize a JSON string
     * @param {string} jsonStr - JSON string to sanitize
     * @returns {string} Sanitized JSON string
     */
    _sanitizeJsonString(jsonStr) {
        return jsonStr
            .replace(/,\s*}/g, '}') // Remove trailing commas before closing braces
            .replace(/,\s*]/g, ']') // Remove trailing commas before closing brackets
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":'); // Ensure property names are quoted
    }

    /**
     * Log prompt and response to file
     * @param {string} prompt - Prompt text
     * @param {Object} response - Response object
     */
    async _logPromptAndResponse(prompt, response) {
        const content = '================================================================================'
            + prompt + "\n\n"
            + JSON.stringify(response)
            + '\n\n'
            + '================================================================================\n\n';

        await writePromptToFile(content);
    }

    /**
     * Generate text based on a prompt
     * @param {string} prompt - The prompt to generate text from
     * @returns {Promise<string>} - The generated text
     */
    async generateText(prompt) {
        try {
            // Calculate context window size based on prompt length
            const promptTokenCount = this._calculatePromptTokenCount(prompt);
            const numCtx = this._calculateNumCtx(promptTokenCount, 512);

            // Simple system prompt for text generation
            const systemPrompt = `You are a helpful assistant. Generate a clear, concise, and informative response to the user's question or request.`;

            // Call Ollama API without enforcing a specific response format
            const response = await this.client.post(`${this.apiUrl}/api/generate`, {
                model: this.model,
                prompt: prompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    num_predict: 1024,
                    num_ctx: numCtx
                }
            });

            if (!response.data || !response.data.response) {
                throw new Error('Invalid response from Ollama API');
            }

            return response.data.response;
        } catch (error) {
            console.error('Error generating text with Ollama:', error);
            throw error;
        }
    }

    /**
     * Check if the Ollama service is running
     * @returns {Promise<boolean>} - True if the service is running, false otherwise
     */
    async checkStatus() {
        // use ollama status endpoint
        try {
            const response = await this.client.get(`${this.apiUrl}/api/ps`);
            if (response.status === 200) {
                const data = response.data;
                // Ensure data is an array and has at least one model
                let modelName = null;
                if (Array.isArray(data.models) && data.models.length > 0) {
                    modelName = data.models[0].name;
                }
                console.log('Ollama model name:', modelName);
                return { status: 'ok', model: modelName };
            }
        } catch (error) {
            console.error('Error checking Ollama service status:', error);
        }
        return { status: 'error' };
    }
}

module.exports = new OllamaService();
