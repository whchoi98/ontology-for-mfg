# api/services/memory.py
"""AgentCore Memory — emulated via Aurora for now (AgentCore Memory provisioning
is in scope but Plan 1 deferred KB and similarly defers Memory namespace until
Bedrock Agents are wired in Plan 2 Task 12). Falls back to DynamoDB-style table
in Aurora keyed by (session_id, key)."""
from __future__ import annotations
from datetime import datetime
import boto3
from api.config import settings

# In a full implementation, swap to AgentCore Memory API when available in boto3.
# For demo, we use Secrets Manager-backed Aurora — but for the mock test, we use boto3
# client init only, real persistence through Aurora connection is set up in Task 12.
def save_fact(session_id: str, key: str, value: str) -> None:
    client = boto3.client("dynamodb", region_name=settings.aws_region)
    client.put_item(
        TableName="ontology-mfg-dev-memory",  # provisioned in Plan 2 Task 12 if not present
        Item={
            "session_id": {"S": session_id},
            "key": {"S": key},
            "value": {"S": value},
            "ts": {"S": datetime.utcnow().isoformat()},
        },
    )


def recall_facts(session_id: str, top_k: int = 10) -> list[dict]:
    client = boto3.client("dynamodb", region_name=settings.aws_region)
    res = client.query(
        TableName="ontology-mfg-dev-memory",
        KeyConditionExpression="session_id = :s",
        ExpressionAttributeValues={":s": {"S": session_id}},
        Limit=top_k,
        ScanIndexForward=False,
    )
    return [{"key": i["key"]["S"], "value": i["value"]["S"]} for i in res.get("Items", [])]
