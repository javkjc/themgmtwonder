FROM python:3.14.3-slim

WORKDIR /app

COPY requirements.txt .
RUN PIP_REQUIRE_HASHES=0 pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY model.py .
COPY model_registry.py .
COPY table_detect.py .

RUN HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 HF_HUB_DISABLE_TELEMETRY=1 \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
    && rm -rf /root/.cache/pip

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
