# FormCheck MVP

Real-time exercise form analysis (Sit-Up, Squat, Deadlift) using TensorFlow MoveNet in the browser.

## Tech Stack

- Static multi-page app (HTML/CSS/JS)
- Vite dev server
- TensorFlow.js + `@tensorflow-models/pose-detection` (MoveNet `SINGLEPOSE_THUNDER`)

## Project Structure

- `formcheck.html` - exercise select page
- `setup.html` - setup instructions page
- `session.html` - live camera/upload tracking page
- `summary.html` - set + rep summary page
- `formcheck.css` - shared styles
- `formcheck.js` - session tracking/analytics logic
- `formcheck-state.js` - shared state across pages (`sessionStorage`)
- `formcheck-select.js` - select page behavior
- `formcheck-setup.js` - setup page behavior
- `formcheck-summary.js` - summary rendering/export behavior

## Run Locally

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/formcheck.html`

## NPM Scripts

- `npm run dev` - start local dev server on `localhost:5173`
- `npm run build` - production build
- `npm run preview` - preview build on `localhost:5173`

## Usage Flow

1. Select exercise on `formcheck.html`
2. Review setup on `setup.html`
3. Start camera or upload video on `session.html`
4. End set and review results on `summary.html`
5. Export per-set CSV from summary page

## Camera Notes (Important)

- Camera access works best on `localhost` (dev) and `https` (production).
- If Chrome shows `NotReadableError`, camera is usually busy in another app/browser.
  - Close Edge/Teams/Zoom/Meet/OBS using camera
  - Recheck Chrome camera permission
  - Retry session

## Deployment

This app is static and can be deployed to:

- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages (if path handling is configured)

Deploy the project root as static files.

## Privacy

- Pose detection runs in-browser.
- No backend is required for core tracking.
- Session data is stored in browser `sessionStorage`.

