FROM --platform=linux/arm64 public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir 'boto3>=1.36.0' 'pydantic>=2.10.0' 'opensearch-py==2.7.1' \
    'requests-aws4auth==1.3.1' 'rdflib==7.1.1' 'requests==2.32.3'
COPY data /app/data
COPY ontology /app/ontology
COPY loader/run.sh /app/run.sh
RUN chmod +x /app/run.sh
ENV PYTHONPATH=/app
ENTRYPOINT ["/app/run.sh"]
