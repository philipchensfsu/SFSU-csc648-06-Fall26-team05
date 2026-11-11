import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from errors import register_error_handlers
from routes import (ai, comments, directory, directory_admin, health, intake, notifications, organizations,
                    prd_members, prd_update, prds, projects, reviews, versions, work_status)

app = FastAPI()
register_error_handlers(app)


# Only needed for local dev, where the Vite dev server (5173) and uvicorn
# (8000) are different origins. In production they're served from the same
# Vercel domain via vercel.json, so this never comes into play there.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (health, projects, prds, versions, prd_update, work_status, prd_members, comments, reviews, intake,
               organizations, directory, notifications, directory_admin, ai):
    app.include_router(module.router)
