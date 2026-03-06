# Contributing to PureQL

Thank you for your interest in contributing to PureQL! We welcome contributions of all kinds.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/pureql.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Make your changes
5. Run tests: `cd core && pytest && cd .. && pnpm test`
6. Commit: `git commit -m "feat: your feature description"`
7. Push: `git push origin feature/your-feature`
8. Open a Pull Request

## Development Setup

### Prerequisites
- Rust (latest stable via rustup)
- Node.js v18+
- Python 3.11+
- pnpm (recommended)

### Install dependencies
```bash
pnpm install
cd core && pip install -e ".[dev]" && cd ..
```

### Run in development
```bash
pnpm tauri dev
```

## Code Style

- **Python**: We use `ruff` for linting. Run `ruff check .` in the `core/` directory.
- **TypeScript**: We use ESLint. Run `pnpm lint`.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/).

## Project Structure

- `src/` — Frontend (React + TypeScript)
- `src-tauri/` — Tauri backend (Rust)
- `core/` — Python core engine

## Reporting Issues

Use GitHub Issues. Please include:
- OS and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
