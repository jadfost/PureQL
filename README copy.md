<p align="center">
  <h1 align="center">⬡ PureQL</h1>
  <p align="center">
    <strong>Pure data. Pure queries. Pure local.</strong>
  </p>
  <p align="center">
    Desktop app with local AI that unifies intelligent data cleaning + SQL optimization in a single conversational pipeline. Your data never leaves your machine.
  </p>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

---

## Why PureQL?

Data scientists spend **80% of their time** cleaning data. SQL optimization requires deep expertise. And every cloud tool wants you to upload your sensitive data to their servers.

**PureQL changes that.**

- 🔒 **100% Local** — Your data never leaves your machine. Zero servers, zero telemetry.
- 💬 **Conversational** — Talk to your data: *"clean duplicates"*, *"normalize the city column"*, *"optimize this query"*.
- ⚡ **Real-time Preview** — See changes instantly as you chat. Every action is versioned.
- 🔗 **Unified Pipeline** — First tool that connects data cleaning directly with SQL optimization.
- 🌍 **Open Source** — MIT License. Free core forever.

## Features

### Core (Free Forever)
- **Universal Ingestion** — CSV, JSON, Parquet, Excel, or connect directly to your database
- **Auto Profiling** — Automatic quality score, null detection, outliers, pattern analysis
- **Intelligent Cleaning** — Fuzzy dedup, format normalization, ML imputation, category standardization
- **SQL Optimization** — Query rewriting, index suggestions, execution plan analysis, benchmarking
- **Conversational AI** — Local LLM (Ollama) interprets natural language commands
- **Version Control** — Every change creates a version. Undo, redo, branch, compare.
- **Database Integration** — Bidirectional: read from DB → clean → write back or export
- **Multi-format Export** — CSV, Parquet, JSON, Excel, SQL script, or directly to DB

### Pro ($12/mo)
- Scheduled pipelines (automated execution)
- Template marketplace
- Quality alerts (email/Slack)
- Unlimited DB connections

### Enterprise ($49/mo)
- Team collaboration (branches, merge, approvals)
- Visual data lineage
- REST API
- SSO + LDAP
- SLA support

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://python.org/) (3.11+)
- [pnpm](https://pnpm.io/) (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/jadfost/pureql.git
cd pureql

# Install frontend dependencies
pnpm install

# Install Python core dependencies
cd core
pip install -e ".[dev]"
cd ..

# Run in development mode
pnpm tauri dev
```

On first launch, PureQL will:
1. Detect your hardware (RAM, CPU, GPU)
2. Install Ollama automatically
3. Recommend and download the best AI model for your system
4. You're ready to go!

## Architecture

```
┌─────────────────────────────────────────────────┐
│              PureQL Desktop (Tauri 2.0)          │
├──────────────────────┬──────────────────────────┤
│   Frontend (React)   │    Core Engine (Python)   │
│                      │                           │
│  ┌─── Chat ────┐     │  ┌─── Ingestion ────┐    │
│  ├─── Preview ─┤     │  ├─── Profiling ────┤    │
│  ├─── Timeline ┤     │  ├─── Cleaning ─────┤    │
│  └─── Settings ┘     │  ├─── SQL Engine ───┤    │
│                      │  └─── Versioning ───┘    │
├──────────────────────┴──────────────────────────┤
│  ┌── Ollama (Local AI) ──┐  ┌── Storage ──────┐ │
│  │  Mistral/Qwen/Phi     │  │  SQLite + Parquet│ │
│  └───────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop Shell | Tauri 2.0 (Rust) | 10x lighter than Electron |
| Frontend | React + TypeScript | Reactive UI with real-time updates |
| Core Engine | Python 3.11+ | Best ecosystem for data + ML |
| Data Processing | Polars | 10-50x faster than pandas |
| SQL Engine | DuckDB + sqlglot | Embedded analytics + query rewriting |
| Local AI | Ollama | Run LLMs locally, zero internet |
| Storage | SQLite + Parquet | Metadata + compressed data |
| Bridge | PyO3 | Native Rust ↔ Python communication |

## Project Structure

```
pureql/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── chat/           # Conversational AI panel
│   │   ├── preview/        # Data table preview
│   │   ├── timeline/       # Version timeline
│   │   ├── settings/       # Settings & model config
│   │   ├── onboarding/     # First-time setup wizard
│   │   └── layout/         # App layout & shell
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # State management
│   └── lib/                # Utilities & API client
├── src-tauri/              # Tauri backend (Rust)
│   └── src/
│       └── main.rs         # Rust entry point & IPC commands
├── core/                   # Python core engine
│   └── pureql/
│       ├── ingestion/      # Multi-format data loading
│       ├── profiling/      # Auto analysis & quality scoring
│       ├── cleaning/       # Dedup, normalization, imputation
│       ├── sql/            # Query optimization & generation
│       ├── versioning/     # Data version control
│       └── ai/             # LLM integration (Ollama + cloud)
├── scripts/                # Setup & utility scripts
└── public/                 # Static assets
```

## Supported Databases

| Database | Connection URI |
|----------|---------------|
| PostgreSQL | `postgresql://user:pass@host:5432/db` |
| MySQL | `mysql://user:pass@host:3306/db` |
| SQLite | `sqlite:///path/to/database.db` |
| SQL Server | `mssql+pyodbc://user:pass@host/db` |
| MariaDB | `mariadb://user:pass@host:3306/db` |
| Oracle | `oracle+oracledb://user:pass@host:1521/db` |
| DuckDB | `duckdb:///path/to/database.duckdb` |

## AI Models

PureQL detects your hardware and recommends the best free model:

| Hardware | Recommended Model | Size | Quality |
|----------|------------------|------|---------|
| 4-8 GB RAM | Phi-3 Mini (3.8B) | 2.3 GB | Good |
| 16 GB RAM | Qwen 2.5 7B ⭐ | 4.4 GB | Excellent |
| 32+ GB RAM | Qwen 2.5 14B | 8.9 GB | Superior |

You can also use your own API keys: OpenAI, Anthropic, Groq, or Mistral AI.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
cd core && pytest
cd .. && pnpm test

# Run linting
pnpm lint
cd core && ruff check .
```

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>PureQL</strong> — Pure data. Pure queries. Pure local.
</p>
