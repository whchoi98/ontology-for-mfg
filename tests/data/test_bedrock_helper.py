"""Mock-only test — actual Bedrock calls are made by generators in later tasks."""
from unittest.mock import MagicMock, patch
from data.synthetic._bedrock import array_tool_schema, call_with_tool


def test_array_tool_schema_shape():
    schema = array_tool_schema(
        name="emit_products",
        description="Emit list of products",
        item_schema={"type": "object", "properties": {"id": {"type": "string"}}},
    )
    assert schema["name"] == "emit_products"
    assert schema["input_schema"]["type"] == "object"
    assert "items" in schema["input_schema"]["properties"]


@patch("data.synthetic._bedrock.boto3.client")
def test_call_with_tool_parses_response(mock_boto):
    mock_client = MagicMock()
    mock_boto.return_value = mock_client
    mock_client.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"content": [{"type": "tool_use", "name": "emit_x", "input": {"items": [{"id": "X1"}]}}]}'),
    }
    items = call_with_tool(
        model_id="anthropic.claude-sonnet-4-6-v1:0",
        system="x", user="y",
        tool=array_tool_schema("emit_x", "x", {"type": "object"}),
    )
    assert items == [{"id": "X1"}]
