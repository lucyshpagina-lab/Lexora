# Lexora

Vocabulary-driven learning system. Light theme, blue/purple accents, gothic ritual modals.

Architecture follows the spec: a Learning Orchestrator routes flow between five subagents (File, Vocabulary, Review, Grammar, Progress). Validation and parsing are deterministic; only the Grammar Agent uses an LLM, and its output is run through strict JSON validation, vocab enforcement, and a retry loop.

## Layout

```
lexora/
├── backend/              FastAPI + agents
│   ├── main.py           HTTP routes only
│   ├── agents/           orchestrator, file, vocab, review, grammar, progress
│   ├── services/         storage (JSON-per-user)
│   ├── validators/       file_validator, llm_validator
│   └── llm/              client (Anthropic SDK), prompts, mock fallback
├── frontend/             React 18 + Vite
│   └── src/
│       ├── components/   Header, Upload, Flashcard, Review, Grammar, Stats, ProgressBar
│       ├── modals/       GothicModal, UploadConfirmModal, ExitModal
│       └── hooks/        useApi, useSession
└── sample-vocabulary.txt example deck for testing the upload flow
```

## Running it

### Backend

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
```

Optional: set `ANTHROPIC_API_KEY` to switch the Grammar Agent from mock to live. The model defaults to `claude-opus-4-7`; override via `LEXORA_MODEL`.

```sh
export ANTHROPIC_API_KEY=sk-ant-...
.venv/bin/uvicorn main:app --reload --port 8000
```

### Frontend

Requires Node 18+ (not installed on this machine — install via [nvm](https://github.com/nvm-sh/nvm) or [Homebrew](https://brew.sh)):

```sh
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>. Vite proxies `/api/*` to the backend on port 8000.

## Trying it without a PDF

Either upload `sample-vocabulary.txt` (a `.txt` deck in `word - translation` format) or click **Try the demo deck** on the upload screen.

## File format

The File Agent parses one entry per line. Recognized separators: ` - `, ` – `, ` — `, `:`, `=`, tab. Examples:

```
casa - house
amigo: friend
gracias = thank you
```

Lines without a separator are skipped. PDF text extraction uses `pypdf`; scanned image PDFs are not supported.

## How the Grammar Agent stays trustworthy

1. **Strict JSON parsing** — fenced code blocks are tolerated, anything else is rejected.
2. **Schema validation** — `topic`/`description` for the topic list, exactly 10 sentences with `rule`/`scheme`/`sentences` for content.
3. **Vocab enforcement** — every generated sentence must contain at least one supplied vocabulary word.
4. **Retry with stricter prompt** — up to 2 retries; the prefix demands raw JSON, no prose.

When `ANTHROPIC_API_KEY` is unset, a deterministic mock satisfies the same schema so the rest of the app remains demoable. The header badge shows **LLM live** vs **LLM mock**.

## API surface

| Method | Path                       | Purpose                                        |
| ------ | -------------------------- | ---------------------------------------------- |
| GET    | `/api/health`              | service status, LLM-live flag                  |
| POST   | `/api/upload`              | multipart PDF/TXT → starts a session           |
| POST   | `/api/demo`                | start a session with a built-in demo deck     |
| GET    | `/api/word/next`           | current card                                   |
| POST   | `/api/word/previous`       | step backward                                  |
| POST   | `/api/review`              | check translation, returns diff + stats        |
| GET    | `/api/grammar/topics`      | philology-level topic list                     |
| POST   | `/api/grammar/content`     | rule + scheme + 10 sentences using vocab      |
| GET    | `/api/progress/{user_id}`  | counts and current/total                       |

## Build order followed

1. File Agent — validation + PDF/TXT parsing
2. Vocabulary Agent — card cursor
3. Review Agent — diff-based translation check
4. Progress Agent — JSON storage + stats
5. Grammar Agent — LLM client with mock fallback
6. LLM integration — prompts + retry + validation
7. MCP integration — `read_pdf_from_drive` is stubbed (NotImplementedError) for the user to wire to their Drive MCP server
8. UI polish — light theme, blue/purple gradient, gothic-serif modals
