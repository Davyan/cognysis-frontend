# Cognysis Dashboard (Frontend)

Static HTML dashboard for Cognysis. Deployed to Vercel for global CDN.

## Deploy to Vercel

1. Push this folder to a GitHub repo (or use `vercel` CLI)
2. Go to [vercel.com](https://vercel.com) → Import Project
3. Select your GitHub repo
4. Framework: **Other** (static)
5. Deploy

## Configure Backend URL
---
title: Cognysis
emoji: 🧠
colorFrom: blue
colorTo: green
sdk: docker
app_file: main.py
---

# Cognysis API

Cognitive screening for Jamaican seniors via AI voice calls.
Before deploying, open `index.html` and find this line:

```javascript
const API = "https://cognysis-api.onrender.com";
```

Replace with your actual Render backend URL.

## Features

- Patient registration
- Audio file upload (backup path)
- Live Twilio call integration
- Real-time pipeline animation
- SHAP explainability visualization
- Screening history from database
- Mobile-responsive design
