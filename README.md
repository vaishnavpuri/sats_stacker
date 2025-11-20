# SatoshiSignal

The Reactive Accumulation Engine. Buy fear. Ignore noise. Stack sats.

## Overview

SatoshiSignal is a Next.js application designed to help you optimize your Bitcoin accumulation strategy. It uses real-time market data (Price, Fear & Greed Index) and your personal financial profile to recommend daily buy amounts.

## Features

*   **Smart Accumulation:** Dynamic buy recommendations based on market fear, trends, and dips.
*   **AI Insights:** Get strategic advice powered by Gemini AI.
*   **Simulation Lab:** Test how different market conditions would affect your strategy.
*   **Profile Management:** Manage multiple portfolios with different budgets and goals.
*   **Privacy First:** All data is stored locally in your browser.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/satoshi-signal.git
    cd satoshi-signal
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    *   Copy the example env file:
        ```bash
        cp env.example .env.local
        ```
    *   Add your Gemini API key to `.env.local`.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

This project is optimized for deployment on [Vercel](https://vercel.com).

1.  Push your code to GitHub.
2.  Import the project into Vercel.
3.  Add your `GEMINI_API_KEY` in the Vercel Project Settings > Environment Variables.
