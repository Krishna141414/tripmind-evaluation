"""Start TripMind locally: python run.py  ->  http://127.0.0.1:5000"""
import os

from app import create_app
from app.services.rag_service import rag_service

app = create_app()

if __name__ == "__main__":
    rag_service.start_warmup()          # load embeddings + LLM in the background
    # threaded so the UI stays responsive while the CPU model generates an answer
    app.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")), threaded=True)
