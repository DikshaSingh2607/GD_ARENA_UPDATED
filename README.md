# GD Arena

> **Problem Statement:** `[Add your official problem statement number and title]`

## What it does

GD Arena is an AI-assisted group-discussion practice arena that helps students prepare for group discussions, placement rounds, and interviews. Users choose a topic, discussion format, language, duration, and pressure level, then practise with AI-driven participants and a moderator; afterwards, they can review their transcript and receive feedback on communication, relevance, listening, and argument-building.

## Done / Left / Plan

### Done
- Setup flow for preset and custom discussion topics.
- Configurable panel size, standard/fishbowl format, English/Hinglish, session duration, and pressure level.
- AI topic-pack generation and live discussion-line generation through a server endpoint.
- Multiple participant personas and a moderator, with browser-based speech output.
- Microphone speech recognition where supported, plus typed replies as a fallback.
- Live transcript, interruption handling, session controls, and a post-session feedback/report screen.
- Session history/progress stored in the browser.

### Left
- Add the official problem statement number/title and final deployed URL to this README.
- Configure and verify the deployment's AI service credentials and run an end-to-end test on the target hosting environment.
- Test microphone/speech behaviour across supported browsers and check the final report against several real practice sessions.
- Replace any remaining demo/team-specific details in the submission materials, if applicable.

### Plan for the next 16 hours
1. **Hours 0–2:** Confirm the problem statement mapping, set production environment variables, and deploy the current build.
2. **Hours 2–5:** Test setup, preset/custom topics, AI topic generation, and live discussion on the deployed URL.
3. **Hours 5–8:** Test microphone permissions, typed fallback, speech playback, interruptions, and timer/session completion.
4. **Hours 8–11:** Run complete sessions and validate transcript evidence, feedback, and saved session history.
5. **Hours 11–14:** Fix high-priority bugs and test on another browser/device.
6. **Hours 14–16:** Prepare screenshots/demo recording, update the live URL and test instructions below, and complete the final submission checklist.

## Architecture and why

- **Frontend:** React 18, TypeScript, and Vite. React supports the interactive setup, live room, transcript, and report screens; TypeScript helps keep session settings, personas, and transcript data consistent.
- **Backend:** Node.js with Express. The `/api/llm` endpoint keeps AI-service credentials on the server rather than exposing them in browser code. The endpoint supports topic-pack generation, live discussion lines, and session analysis.
- **AI model/service:** The server code requests `gpt-5-nano` for topic-pack/live-line tasks and `gpt-5-mini` for report analysis through a configurable OpenAI-compatible chat-completions endpoint. The endpoint and API key are read from server environment variables (`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`, with `MANUS_API_URL` / `MANUS_API_KEY` as fallbacks). The AI service must be configured for these features to work.
- **Real-time approach:** The room uses an asynchronous turn loop and serialized server-side AI requests to avoid overlapping participant turns. Browser `speechSynthesis` handles spoken output; browser speech recognition is used for microphone input when supported. Typed replies remain available if speech recognition is unavailable or permission is denied.
- **Data store:** Session transcripts/history and progress are stored in browser `localStorage`. This avoids requiring a separate database for the current prototype, but means saved sessions are browser/device-specific and are not synced between devices.
- **Resilience:** The app includes topic-bank/fallback behaviour when AI generation is unavailable, so the discussion experience can continue in a reduced mode.

## What we added

- **Typed-reply fallback:** Users can continue practising without a working microphone or supported speech-recognition browser.
- **Adjustable practice pressure and formats:** Friendly/realistic/cut-throat pressure settings and standard/fishbowl formats let learners practise different discussion conditions.
- **Evidence-oriented feedback:** The report is designed to connect feedback to transcript lines so users can understand what prompted a suggestion.
- **Speech and caption controls:** Users can adjust voice speed, volume, and caption size to make sessions easier to follow.
- **Practice history/progress:** Browser-stored sessions and scores help users compare their practice over time without creating an account.

## How to run it

### Requirements
- Node.js (use a current LTS release)
- pnpm (the project declares pnpm as its package manager)
- An AI-compatible chat-completions endpoint and API key for live AI-generated content

### Local setup

```bash
# 1. Extract the project and enter its directory
cd gdarena

# 2. Install dependencies
pnpm install

# 3. Configure the server environment
# Set these in your shell or your hosting provider:
# BUILT_IN_FORGE_API_URL=https://your-compatible-api-base
# BUILT_IN_FORGE_API_KEY=your-secret-key
# Optional fallback names: MANUS_API_URL and MANUS_API_KEY

# 4. Start the frontend and API in development mode
pnpm dev
```

Open the Vite app at **http://localhost:3000**. In development, the frontend runs on port `3000` and the API runs on port `3001`.

### Build and checks

```bash
pnpm check
pnpm build
```

The production server serves the built frontend and API from the same Express process. Set `NODE_ENV=production` and ensure the hosting platform provides `PORT`; then run the server entry point (`node server/index.js`) after building.

### Test login

(https://gd-arena-updated.onrender.com/)

## Tools and AI used

- **UI and application:** React, TypeScript, Vite, Tailwind CSS, Lucide React.
- **Server:** Node.js, Express.
- **AI:** GPT-5 Nano for topic packs and live discussion turns; GPT-5 Mini for report analysis, accessed through a server-configured OpenAI-compatible API endpoint.
- **Speech:** Browser Web Speech APIs (`speechSynthesis` for spoken output and speech recognition where supported).
- **Storage:** Browser `localStorage` for session history and progress.
- **AI disclosure:** The interface includes an AI disclosure notice so users know that the discussion participants and feedback are AI-generated. Review the visible notice in the deployed build before submission to ensure it is clear and prominent.

## Who it is for

GD Arena is for college students and job seekers preparing for group discussions, campus placements, interviews, and communication rounds. They can return for short, repeatable practice sessions, try different topics and pressure levels, and use transcript-linked feedback and progress history to identify what to improve next.
