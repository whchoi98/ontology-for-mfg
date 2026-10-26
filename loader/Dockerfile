FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY loader/requirements.txt /app/loader/requirements.txt
RUN pip install --no-cache-dir -r /app/loader/requirements.txt
COPY data /app/data
COPY ontology /app/ontology
COPY loader/run.sh /app/run.sh
RUN chmod +x /app/run.sh
ENV PYTHONPATH=/app
ENTRYPOINT ["/app/run.sh"]
