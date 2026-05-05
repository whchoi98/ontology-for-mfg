# tests/api/services/test_eight_d_writer.py
from unittest.mock import patch, MagicMock
from api.services.eight_d_writer import draft_eight_d


@patch("api.services.eight_d_writer.bedrock_runtime")
def test_draft_returns_8_sections(mock_br):
    mock_br.return_value.invoke_model.return_value = {
        "body": MagicMock(read=lambda: b'{"content":[{"type":"tool_use","name":"emit_eight_d","input":{"d1_team":"Q","d2_problem":"crack","d3_containment":"halt","d4_root_cause":"profile","d5_corrective":"AQL","d6_implemented":"plant","d7_prevention":"SPC","d8_closure":"closed"}}]}'),
    }
    out = draft_eight_d(incident_title="BGA crack", incident_desc="ball crack",
                        similar_reports=[], standards=["JESD22"])
    assert all(k in out for k in ("d1_team","d2_problem","d3_containment","d4_root_cause",
                                    "d5_corrective","d6_implemented","d7_prevention","d8_closure"))
