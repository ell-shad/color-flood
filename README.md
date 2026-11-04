# Color Flood Master

A strategic color-filling puzzle game built with React, Vite, and Tailwind CSS. Flood the entire grid with a single color in the fewest moves possible!

## 🎮 Features

- **🧩 Solo Puzzle Mode**: Flood the entire grid with a single color under the move limit.
- **⚔️ 2-Player Territory Battle Mode**:
  - **🌐 Real-Time Online Multiplayer**: Connect and play with a second player from distance using a 6-character Room Code or an instant shareable link (`?room=CODE`).
  - **👥 Local Pass & Play**: Play head-to-head on the same screen.
  - **🤖 vs AI Bot**: Challenge the computer across Easy, Medium, and Master tactical difficulties.
  - **Victory Condition**: Race to capture more than 50% of the board's cells.
  - **Symmetrical Color Locking**: Neither player can select their own or their rival's current color.
  - **Live Battle Meter**: Real-time domination percentage bar, series score tracker (Best of X), rematch flow, and active turn indicators.
- **Dynamic Grid Sizes**: Play on 10x10, 12x12, 14x14, 16x16, or 18x18 grids.
- **Color Selection**: Choose between 4, 5, 6, 7, or 8 colors.
- **Progressive Challenge**: A 5-stage gauntlet that keeps growing the board and adding colors.
- **Smart Hint System**: Instant move calculations showing potential cell gains.
- **High Scores & Series Records**: Saved locally across sessions.
- **Multiple Board Themes**: 7 hand-tuned palettes including Arcade, Neon, Sunset, and more.
- **Responsive Design & Visual Polishing**: Smooth Framer Motion transitions and victory confetti celebrations.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ell-shad/color-flood.git
   cd color-flood
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production

Build the client once, then serve it from the Express server:

```bash
npm start
```

`npm start` builds the client with Vite and serves the `dist/` bundle in production mode.

## 🛠️ Tech Stack

- **Frontend**: React 19
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion (via the `motion` package)
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Server**: Express + ws (WebSocket)
- **Testing**: Vitest
- **Language**: TypeScript

## 📜 Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Development server with hot reload |
| `npm start` | Build + serve the production bundle |
| `npm run build` | Production client build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run test` | Run unit tests (Vitest, single pass) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Typecheck with `tsc --noEmit` |
| `npm run format` | Format with Prettier |

## 📂 Project Structure

```text
├── server.ts                      # Express + ws server: REST API, rooms, static serving
├── src/
│   ├── App.tsx                    # Main game orchestration and UI
│   ├── main.tsx                   # Entry point
│   ├── types.ts                   # Shared game types
│   ├── components/                # UI components (grid, scoreboards, modals, lobby, ...)
│   ├── utils/
│   │   ├── floodLogic.ts          # Pure game engine shared by client and server
│   │   ├── useOnlineMultiplayer.ts# Online room orchestration hooks
│   │   ├── themes.ts              # Board themes
│   │   ├── soundEffects.ts        # Audio effects
│   │   └── urlHelper.ts           # Share URL helpers
│   └── index.css                  # Global styles & Tailwind
├── public/                        # Static assets
├── ROADMAP.md                     # Improvement plan and progress tracker
├── metadata.json                  # App metadata
└── package.json                   # Dependencies and scripts
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Elshad Guliyev**
- GitHub: [@ell-shad](https://github.com/ell-shad)
- LinkedIn: [Elshad Guliyev](https://www.linkedin.com/in/elshad-guliyev/)

---

Built with Precision & Strategy.
