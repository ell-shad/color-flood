# Color Flood Master

A strategic color-filling puzzle game built with React, Vite, and Tailwind CSS. Flood the entire grid with a single color in the fewest moves possible!

![Color Flood Master](https://picsum.photos/seed/colorflood/800/400)

## 🎮 Features

- **⚔️ 2-Player Territory Battle Mode**: 
  - **🌐 Real-Time Online Multiplayer**: Connect and play with a second player from distance using a 6-character Room Code or an instant shareable link (`?room=CODE`).
  - **👥 Local Pass & Play**: Play head-to-head on the same screen.
  - **🤖 vs AI Bot**: Challenge the computer across Easy, Medium, and Master tactical difficulties.
  - **Victory Condition**: Race to capture more than 50% of the board's cells.
  - **Symmetrical Color Locking**: Neither player can select their own or their rival's current color.
  - **Live Battle Meter**: Real-time domination percentage bar, series score tracker (Best of X), rematch flow, and active turn indicators.
- **🧩 Solo Puzzle Mode**: Flood the entire grid with a single color under the move limit.
- **Dynamic Grid Sizes**: Play on 10x10, 14x14, or 18x18 grids.
- **Color Selection**: Choose between 4, 6, or 8 colors.
- **Smart Hint System**: Instant move calculations showing potential cell gains.
- **High Scores & Series Records**: Saved locally across sessions.
- **Responsive Design & Visual Polishing**: Smooth Framer Motion transitions and victory confetti celebrations.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ell-shad/color-flood-master.git
   cd color-flood-master
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

## 🛠️ Tech Stack

- **Frontend**: React 19
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Language**: TypeScript

## 📂 Project Structure

```text
├── src/
│   ├── App.tsx        # Main game logic and UI
│   ├── main.tsx       # Entry point
│   └── index.css      # Global styles & Tailwind
├── public/            # Static assets
├── metadata.json      # App metadata
└── package.json       # Dependencies and scripts
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Elshad Guliyev**
- GitHub: [@ell-shad](https://github.com/ell-shad)
- LinkedIn: [Elshad Guliyev](https://www.linkedin.com/in/elshad-guliyev/)

---
Built with Precision & Strategy.
