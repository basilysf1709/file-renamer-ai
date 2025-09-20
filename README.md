# Drive AI Renamer

A working MVP: Next.js front‑end (App Router) + Python FastAPI back‑end that bulk‑renames Google Drive images using Gemini (vision) suggestions, with a preview/dry‑run, then execute.

## Prerequisites

### Google Cloud Setup

1. **Google Cloud** → Create a project
2. Enable **Google Drive API**
3. Create **OAuth 2.0 Client ID** (Web application). Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback` (if you build server‑side auth)
   - or use **Google Identity Services (GIS)** on the client only (simpler MVP) and skip callback
4. **Gemini API key** (Google AI Studio) → store in backend `.env` as `GEMINI_API_KEY`

**Scopes**
- Dry‑run: `https://www.googleapis.com/auth/drive.readonly`
- Rename: `https://www.googleapis.com/auth/drive`

## Project Structure

```
/drive-ai-renamer
  /frontend   # Next.js 14 App Router
  /backend    # FastAPI
```

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Activate virtual environment:
   ```bash
   source .venv/bin/activate
   ```

3. Update `.env` file with your Gemini API key:
   ```
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   MAX_QPS=8
   THUMBNAIL_MAX_SIDE=1024
   ```

4. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Update `.env.local` with your Google credentials:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_oauth_client_id
   NEXT_PUBLIC_GOOGLE_API_KEY=your_browser_api_key
   NEXT_PUBLIC_BACKEND_BASE=http://localhost:8000
   ```

3. Install dependencies (if not already done):
   ```bash
   npm install
   ```

4. Start the frontend development server:
   ```bash
   npm run dev
   ```

## Usage

1. Open `http://localhost:3000` in your browser
2. Click "Sign In" to authenticate with Google Drive
3. Click "Pick Folder" to select a Google Drive folder containing images
4. Click "List Images" to fetch images from the selected folder
5. Click "Suggest Names" to generate AI-powered filename suggestions
6. Review the suggestions and click "Rename All" to apply the new names

## Features

- **Google Drive Integration**: Authenticate and access Google Drive folders
- **AI-Powered Naming**: Uses Gemini vision API to analyze images and suggest descriptive filenames
- **Preview Mode**: See suggested names before applying them
- **Bulk Operations**: Process multiple images at once
- **Error Handling**: Graceful handling of API errors and edge cases

## API Endpoints

### Backend (FastAPI)

- `GET /health` - Health check
- `POST /list_images` - List images in a Google Drive folder
- `POST /suggest_names` - Generate AI-powered filename suggestions
- `POST /rename` - Rename files in Google Drive

## Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Zustand
- **Backend**: FastAPI, Python, Google Drive API, Gemini API
- **Authentication**: Google Identity Services (GIS)
- **Image Processing**: Pillow (PIL)

## Notes

- This is an MVP implementation using client-side OAuth
- For production use, consider implementing server-side token exchange and refresh
- The app processes images by downloading them temporarily for AI analysis
- Filenames are sanitized to ensure compatibility across different systems
