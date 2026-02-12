FROM python:3.14.3-slim

WORKDIR /app

COPY requirements.txt .
RUN PIP_REQUIRE_HASHES=0 pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
