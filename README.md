# 📄 Paperless-AI (Enhanced Fork)

[![Docker Pulls](https://img.shields.io/docker/pulls/jkramer/paperless-ai)](https://hub.docker.com/r/jkramer/paperless-ai)
[![License](https://img.shields.io/github/license/clusterzx/paperless-ai?cacheSeconds=1)](LICENSE)

---

> **Note:** This is an enhanced fork of [clusterzx/paperless-ai](https://github.com/clusterzx/paperless-ai) with additional features focused on metadata control and improved AI model compatibility.

**Paperless-AI** is an AI-powered extension for [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that brings automatic document classification, smart tagging, and semantic search using OpenAI-compatible APIs and Ollama.

It enables **fully automated document workflows**, **contextual chat**, and **powerful customization** — all via an intuitive web interface.

## 🆕 Enhanced Fork Features

This fork adds several improvements over the original version:

### 🎯 Restrict-to-Existing Metadata
- **Force AI to select from existing tags/correspondents/document types** instead of creating new ones
- Prevents tag/type explosion and maintains clean, curated metadata
- Configurable per metadata type (tags, correspondents, document types)
- AI receives the full list of available options and selects the best semantic matches

### 🔄 Metadata Replacement Controls
- **UI toggles to control whether AI replaces or appends to existing metadata**
- Solves the issue where Paperless-ngx auto-tags documents before AI processing
- Independent control for each field (tags, correspondent, document type, title)
- Choose between:
  - **Learning mode**: Let Paperless auto-tag, AI supplements (helps Paperless ML learn)
  - **Clean mode**: AI replaces all metadata (immediate clean results)

### 🧠 Enhanced Tag Intelligence
- **Category-based tag guidance** for smaller models (7B-8B)
- Prevents literal tag creation (e.g., "Dishwasher" → uses "Appliance" + "Kitchen Equipment")
- Explicit examples teach models to think categorically instead of literally
- Works excellently with Ollama models like mistral:7b, llama3.1:8b

### 🛠️ Improved Model Compatibility
- **Optimized prompt architecture** with proper system/user message separation
- **Content truncation** prevents model overwhelm (default 4K chars for smaller models)
- **Tuned parameters** for 7B-8B models (temperature=0.5, top_k=10)
- **Better JSON enforcement** for corrupted PDF text handling

### 📊 All Settings Exposed in UI
- Every configuration option accessible via web interface
- No need to manually edit `.env` files
- Real-time validation and helpful descriptions
- Environment variable overrides still supported

**Docker Image:** `jkramer/paperless-ai:latest`

> 💡 Just ask:  
> “When did I sign my rental agreement?”  
> “What was the amount of the last electricity bill?”  
> “Which documents mention my health insurance?”  

Powered by **Retrieval-Augmented Generation (RAG)**, you can now search semantically across your full archive and get precise, natural language answers.

---

## ✨ Features

### 🔄 Automated Document Processing
- Detects new documents in Paperless-ngx automatically
- Analyzes content using OpenAI API, Ollama, and other compatible backends
- Assigns title, tags, document type, and correspondent
- Built-in support for:
  - Ollama (Mistral, Llama, Phi-3, Gemma-2)
  - OpenAI
  - DeepSeek.ai
  - OpenRouter.ai
  - Perplexity.ai
  - Together.ai
  - LiteLLM
  - VLLM
  - Fastchat
  - Gemini (Google)
  - ...and more!

### 🧠 RAG-Based AI Chat
- Natural language document search and Q&A
- Understands full document context (not just keywords)
- Semantic memory powered by your own data
- Fast, intelligent, privacy-friendly document queries  
![RAG_CHAT_DEMO](https://raw.githubusercontent.com/clusterzx/paperless-ai/refs/heads/main/ppairag.png)

### ⚙️ Manual Processing
- Web interface for manual AI tagging
- Useful when reviewing sensitive documents
- Accessible via `/manual`

### 🧩 Smart Tagging & Rules
- Define rules to limit which documents are processed
- Disable prompts and apply tags automatically
- Set custom output tags for tracked classification  
![PPAI_SHOWCASE3](https://github.com/user-attachments/assets/1fc9f470-6e45-43e0-a212-b8fa6225e8dd)

---

## 🚀 Installation

### Quick Start with Docker

```bash
docker pull jkramer/paperless-ai:latest
```

**Docker Compose Example:**

```yaml
version: '3.8'
services:
  paperless-ai:
    image: jkramer/paperless-ai:latest
    container_name: paperless-ai
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - PAPERLESS_API_URL=http://paperless:8000/api
      - PAPERLESS_API_TOKEN=your_token_here
      - AI_PROVIDER=ollama  # or openai
      - OLLAMA_API_URL=http://ollama:11434
      - OLLAMA_MODEL=mistral:7b
    restart: unless-stopped
```

> ⚠️ **First-time install:** Complete setup (API keys, preferences) in the web UI at `http://localhost:3001`, then restart the container to build RAG index.
> 🔁 Not required for updates.

### Configuration

All settings can be configured via the web UI at `http://localhost:3001/settings`:
- Paperless-ngx connection
- AI provider selection (Ollama, OpenAI, Azure, Custom)
- **Restrict-to-Existing** toggles for tags/correspondents/document types
- **Metadata Replacement** behavior (append vs replace)
- RAG settings and custom fields

📘 For more details, see the [original installation wiki](https://github.com/clusterzx/paperless-ai/wiki/2.-Installation)

---

## 🐳 Docker Support

- Multi-platform images: `linux/amd64`, `linux/arm64`
- Health monitoring and auto-restart
- Persistent volumes and graceful shutdown
- Works out of the box with minimal setup

---

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Start development/test mode
npm run test
```

---

## 🧭 Roadmap Highlights

**From Original Project:**
- ✅ Multi-AI model support
- ✅ Multilingual document analysis
- ✅ Tag rules and filters
- ✅ Integrated document chat with RAG
- ✅ Responsive web interface

**This Fork's Enhancements:**
- ✅ Restrict-to-existing metadata controls
- ✅ Metadata replacement behavior toggles
- ✅ Enhanced category-based tag guidance
- ✅ Optimized for smaller models (7B-8B)
- ✅ Content truncation and model tuning
- ✅ All settings exposed in UI

---

## 🤝 Contributing

Issues and pull requests are welcome! This fork focuses on metadata control and model compatibility improvements.

For the upstream project, see [clusterzx/paperless-ai](https://github.com/clusterzx/paperless-ai).

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

**Credits:** This is a fork of [clusterzx/paperless-ai](https://github.com/clusterzx/paperless-ai). All core functionality and RAG features are from the original project. This fork adds metadata control enhancements.

---

## 🙏 Support Original Development

If you find this project useful, please consider supporting the original author:

[![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/c/clusterzx)
[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/bech0r)
[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/clusterzx)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/clusterzx)
