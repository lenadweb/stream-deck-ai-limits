# Contributing to AI Usage Limits Stream Deck Plugin

Thank you for your interest in contributing to this project! Here are the guidelines to help you get started.

## Getting Started

1. **Fork the Repository:**
   Fork the repository on GitHub and clone your fork locally:
   ```bash
   git clone https://github.com/your-username/stream-deck-ai-limits.git
   cd stream-deck-ai-limits
   ```

2. **Install Dependencies:**
   Make sure you have Node.js v20+ installed. Then run:
   ```bash
   npm install
   ```

3. **Run Development Watch Mode:**
   To build and watch the codebase for changes while testing the plugin in the Stream Deck app:
   ```bash
   npm run watch
   ```

## Coding Guidelines

- **Style:** Follow the existing project structure and styling.
- **Modularity:** Keep actions decoupled and delegate domain logic to the `@lenadweb/ai-limits` package.
- **Cleanliness:** Write clean, readable, self-documenting code.
- **Linting:** Ensure your editor settings respect the formatting configurations.

## Commit Guidelines

Please write your commit messages in the project's established style:
- Use lowercase for the first letter of the message.
- Start with a direct, present or past tense verb (e.g., `add`, `update`, `remove`, `fix`, `improve`).
- Do not use prefixes like `feat:`, `fix:`, or `chore:`.
- Be concise and descriptive.

*Example:*
`add settings option for minimax api key`

## Submitting Pull Requests

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b your-feature-branch
   ```
2. Make your modifications, verify that the project builds successfully (`npm run build`).
3. Commit your changes following the commit guidelines.
4. Push your branch to your fork and submit a Pull Request to the `main` branch.
